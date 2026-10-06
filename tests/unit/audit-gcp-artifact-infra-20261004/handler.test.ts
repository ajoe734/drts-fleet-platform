import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

import { describe, expect, it, vi } from "vitest";

import {
  type GatewayConfig,
  createRequestHandler,
} from "../../../operations/artifact-scanner/gateway/handler";

/** Plain in-memory stand-ins for IncomingMessage/ServerResponse -- no real
 * HTTP server or socket is involved, matching the "pure gateway functions
 * ... without sockets" local-test rule. */
class FakeRequest extends EventEmitter {
  destroyed = false;
  constructor(
    public method: string,
    public url: string,
    public headers: Record<string, string>,
  ) {
    super();
  }
  destroy(): void {
    this.destroyed = true;
  }
}

class FakeResponse extends EventEmitter {
  statusCode: number | undefined;
  headersSent = false;
  responseHeaders: Record<string, unknown> = {};
  body = "";
  writeHead(status: number, headers: Record<string, unknown>): void {
    this.statusCode = status;
    this.responseHeaders = headers;
    this.headersSent = true;
  }
  end(body?: string): void {
    this.body = body ?? "";
  }
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function baseConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    clamd: { host: "127.0.0.1", port: 3310, timeoutMs: 1000 },
    isReady: vi.fn().mockResolvedValue(true),
    exchange: vi.fn().mockResolvedValue("stream: OK"),
    log: vi.fn(),
    ...overrides,
  };
}

async function send(
  config: GatewayConfig,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: Buffer,
): Promise<FakeResponse> {
  const handler = createRequestHandler(config);
  const req = new FakeRequest(method, url, headers);
  const res = new FakeResponse();
  const pending = handler(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
  );
  if (body !== undefined) {
    req.emit("data", body);
    req.emit("end");
  }
  await pending;
  return res;
}

const PDF_BYTES = Buffer.from("%PDF-1.4 fake");

describe("createRequestHandler: /health", () => {
  it("reports 200 ready when isReady resolves true", async () => {
    const res = await send(baseConfig({ isReady: vi.fn().mockResolvedValue(true) }), "GET", "/health", {});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "ready" });
  });

  it("reports 503 not_ready when isReady resolves false", async () => {
    const res = await send(baseConfig({ isReady: vi.fn().mockResolvedValue(false) }), "GET", "/health", {});
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ status: "not_ready" });
  });
});

describe("createRequestHandler: routing", () => {
  it("returns 404 for any other method or path", async () => {
    const cases: Array<[string, string]> = [
      ["GET", "/scan"],
      ["POST", "/health"],
      ["POST", "/"],
      ["DELETE", "/scan"],
    ];
    for (const [method, url] of cases) {
      const res = await send(baseConfig(), method, url, {});
      expect(res.statusCode).toBe(404);
    }
  });
});

describe("createRequestHandler: POST /scan input validation", () => {
  it("rejects an unsupported content type before reading the body", async () => {
    const exchange = vi.fn();
    const res = await send(
      baseConfig({ exchange }),
      "POST",
      "/scan",
      { "content-type": "text/plain", "x-content-sha256": sha256Hex(PDF_BYTES) },
      PDF_BYTES,
    );
    expect(res.statusCode).toBe(415);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed X-Content-SHA256 header", async () => {
    for (const hash of [undefined, "", "not-hex", "A".repeat(64), "a".repeat(63)]) {
      const headers: Record<string, string> = { "content-type": "application/pdf" };
      if (hash !== undefined) headers["x-content-sha256"] = hash;
      const res = await send(baseConfig(), "POST", "/scan", headers, PDF_BYTES);
      expect(res.statusCode).toBe(400);
    }
  });

  it("rejects an empty body", async () => {
    const res = await send(
      baseConfig(),
      "POST",
      "/scan",
      { "content-type": "application/pdf", "x-content-sha256": sha256Hex(Buffer.alloc(0)) },
      Buffer.alloc(0),
    );
    expect(res.statusCode).toBe(400);
  });

  it("rejects a body whose hash does not match the declared header", async () => {
    const res = await send(
      baseConfig(),
      "POST",
      "/scan",
      { "content-type": "application/pdf", "x-content-sha256": "a".repeat(64) },
      PDF_BYTES,
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "content_sha256_mismatch" });
  });

  it("rejects and destroys the connection once the body exceeds the 10 MiB bound", async () => {
    const handler = createRequestHandler(baseConfig());
    const req = new FakeRequest("POST", "/scan", {
      "content-type": "application/pdf",
      "x-content-sha256": "a".repeat(64),
    });
    const res = new FakeResponse();
    const pending = handler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
    const chunk = Buffer.alloc(1024 * 1024, 1);
    for (let sent = 0; sent <= 10 * 1024 * 1024; sent += chunk.length) {
      req.emit("data", chunk);
    }
    await pending;
    expect(res.statusCode).toBe(413);
    expect(req.destroyed).toBe(true);
  });
});

describe("createRequestHandler: POST /scan readiness gate", () => {
  it("rejects a scan without ever contacting clamd when isReady resolves false", async () => {
    // R8: a scan must fail closed on a not-ready engine (cold start, dead
    // sidecar or stale signatures) exactly like /health does -- this must
    // be checked on every scan request, not only at /health.
    const isReady = vi.fn().mockResolvedValue(false);
    const exchange = vi.fn();
    const res = await send(
      baseConfig({ isReady, exchange }),
      "POST",
      "/scan",
      { "content-type": "application/pdf", "x-content-sha256": sha256Hex(PDF_BYTES) },
      PDF_BYTES,
    );
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ error: "scan_engine_not_ready" });
    expect(isReady).toHaveBeenCalledTimes(1);
    expect(exchange).not.toHaveBeenCalled();
  });
});

describe("createRequestHandler: POST /scan verdicts", () => {
  it("returns a clean verdict with the real sha256 and size only after a definitive OK reply", async () => {
    const exchange = vi.fn().mockResolvedValue("stream: OK");
    const log = vi.fn();
    const res = await send(
      baseConfig({ exchange, log }),
      "POST",
      "/scan",
      { "content-type": "application/pdf", "x-content-sha256": sha256Hex(PDF_BYTES) },
      PDF_BYTES,
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      sha256: sha256Hex(PDF_BYTES),
      sizeBytes: PDF_BYTES.length,
      verdict: "clean",
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ route: "/scan", status: 200, verdict: "clean" }),
    );
    for (const call of log.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain(PDF_BYTES.toString("utf8"));
    }
  });

  it("returns an infected verdict for a definitive FOUND reply", async () => {
    const exchange = vi.fn().mockResolvedValue("stream: Win.Test.EICAR_HDB-1 FOUND");
    const res = await send(
      baseConfig({ exchange }),
      "POST",
      "/scan",
      { "content-type": "application/pdf", "x-content-sha256": sha256Hex(PDF_BYTES) },
      PDF_BYTES,
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).verdict).toBe("infected");
  });

  it("never reports clean/infected when the engine transport fails", async () => {
    const exchange = vi.fn().mockRejectedValue(new Error("clamd unreachable"));
    const res = await send(
      baseConfig({ exchange }),
      "POST",
      "/scan",
      { "content-type": "application/pdf", "x-content-sha256": sha256Hex(PDF_BYTES) },
      PDF_BYTES,
    );
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ error: "scan_engine_unavailable" });
  });

  it("never reports clean/infected on an indeterminate (e.g. size-limit ERROR) reply", async () => {
    const exchange = vi.fn().mockResolvedValue("stream: INSTREAM size limit exceeded. ERROR");
    const res = await send(
      baseConfig({ exchange }),
      "POST",
      "/scan",
      { "content-type": "application/pdf", "x-content-sha256": sha256Hex(PDF_BYTES) },
      PDF_BYTES,
    );
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ error: "scan_engine_indeterminate" });
  });

  it("never reports a definitive verdict when clamd's AlertExceedsMax reports Heuristics.Limits.Exceeded (R1 round 2)", async () => {
    // A resource-limit exceeded reply proves the content was only partially
    // scanned -- it must surface as the same indeterminate error as a
    // transport failure, never as a 200 "infected" success.
    const exchange = vi
      .fn()
      .mockResolvedValue("stream: Heuristics.Limits.Exceeded.MaxScanSize FOUND");
    const res = await send(
      baseConfig({ exchange }),
      "POST",
      "/scan",
      { "content-type": "application/pdf", "x-content-sha256": sha256Hex(PDF_BYTES) },
      PDF_BYTES,
    );
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ error: "scan_engine_indeterminate" });
  });
});
