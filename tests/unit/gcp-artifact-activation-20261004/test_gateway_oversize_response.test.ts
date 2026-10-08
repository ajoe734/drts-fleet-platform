import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { createRequestHandler } from "../../../operations/artifact-scanner/gateway/handler";
import { MAX_PROOF_BYTES, sha256Hex } from "../../../operations/artifact-scanner/gateway/validate";

// Native non-listening stream; keep it open across response completion to
// distinguish premature transport destruction from normal request completion.
function fixture(bytes: Buffer, reply = "stream: OK") {
  const stream = new PassThrough({ autoDestroy: false });
  const req = Object.assign(stream, {
    method: "POST",
    url: "/scan",
    headers: {
      "content-type": "application/pdf",
      "x-content-sha256": sha256Hex(bytes),
    },
  });
  const response = {
    headersSent: false,
    status: 0,
    headers: {} as Record<string, unknown>,
    body: {} as Record<string, unknown>,
    ends: 0,
    destroyedBeforeResponse: false,
    writeHead(status: number, headers: Record<string, unknown>) {
      this.status = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(payload: string) {
      this.destroyedBeforeResponse = stream.destroyed;
      this.body = JSON.parse(payload) as Record<string, unknown>;
      this.ends += 1;
    },
  };
  const isReady = vi.fn(async () => true);
  const exchange = vi.fn(async () => reply);
  const log = vi.fn();
  const done = createRequestHandler({
    clamd: { host: "127.0.0.1", port: 3310, timeoutMs: 100 },
    isReady,
    exchange,
    log,
  })(req as unknown as IncomingMessage, response as unknown as ServerResponse);
  return { stream, req, response, done, isReady, exchange, log };
}

describe("real handler oversized response lifecycle (no socket/listener)", () => {
  it.each(["single", "chunked"])("%s overflow returns exact 413 before any request destruction and never scans", async (mode) => {
    const bytes = Buffer.alloc(MAX_PROOF_BYTES + 1, 0x61);
    const f = fixture(bytes);
    try {
      if (mode === "single") f.stream.write(bytes);
      else {
        f.stream.write(bytes.subarray(0, MAX_PROOF_BYTES));
        f.stream.write(bytes.subarray(MAX_PROOF_BYTES));
      }
      await f.done;
      expect(f.response.status).toBe(413);
      expect(f.response.body).toEqual({ error: "payload_too_large" });
      expect(f.response.headers["content-type"]).toBe("application/json");
      expect(f.response.headers["content-length"]).toBe(Buffer.byteLength(JSON.stringify(f.response.body)));
      expect(f.response.destroyedBeforeResponse).toBe(false);
      expect(f.stream.destroyed).toBe(false);
      expect(f.isReady).not.toHaveBeenCalled();
      expect(f.exchange).not.toHaveBeenCalled();
      expect(f.log).not.toHaveBeenCalled();

      // Overflow is settled: trailing data is consumed/discarded, not
      // concatenated, backpressured into a retained body, or answered again.
      const concat = vi.spyOn(Buffer, "concat");
      try {
        for (let i = 0; i < 8; i += 1) f.stream.write(Buffer.alloc(64 * 1024, i));
        f.stream.end();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(concat).not.toHaveBeenCalled();
        expect(f.stream.readableLength).toBe(0);
        expect(f.stream.writableLength).toBe(0);
        expect(f.response.ends).toBe(1);
        expect(f.exchange).not.toHaveBeenCalled();
      } finally {
        concat.mockRestore();
      }
    } finally {
      f.stream.destroy();
    }
  });

  it("exact maximum remains accepted with unchanged hash/size/clean result", async () => {
    const bytes = Buffer.alloc(MAX_PROOF_BYTES, 0x61);
    const f = fixture(bytes);
    try {
      f.stream.end(bytes);
      await f.done;
      expect(f.response.status).toBe(200);
      expect(f.response.body).toEqual({ sha256: sha256Hex(bytes), sizeBytes: MAX_PROOF_BYTES, verdict: "clean" });
      expect(f.isReady).toHaveBeenCalledOnce();
      expect(f.exchange).toHaveBeenCalledOnce();
      expect(f.response.ends).toBe(1);
    } finally {
      f.stream.destroy();
    }
  });

  it("canonical canary still requires a real-shaped infected reply", async () => {
    const bytes = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
    const f = fixture(bytes, "stream: Eicar-Signature FOUND");
    try {
      f.stream.end(bytes);
      await f.done;
      expect(f.response.status).toBe(200);
      expect(f.response.body).toEqual({ sha256: sha256Hex(bytes), sizeBytes: 68, verdict: "infected" });
    } finally {
      f.stream.destroy();
    }
  });

  it("wrong body hash still returns 400 without engine work", async () => {
    const f = fixture(Buffer.from("expected"));
    try {
      f.stream.end(Buffer.from("different"));
      await f.done;
      expect(f.response.status).toBe(400);
      expect(f.response.body).toEqual({ error: "content_sha256_mismatch" });
      expect(f.isReady).not.toHaveBeenCalled();
      expect(f.exchange).not.toHaveBeenCalled();
    } finally {
      f.stream.destroy();
    }
  });

  it.each(["stream: Heuristics.Limits.Exceeded.MaxFileSize FOUND", "unrecognized"])("indeterminate engine reply remains 502: %s", async (reply) => {
    const bytes = Buffer.from("clean boundary fixture");
    const f = fixture(bytes, reply);
    try {
      f.stream.end(bytes);
      await f.done;
      expect(f.response.status).toBe(502);
      expect(f.response.body).toEqual({ error: "scan_engine_indeterminate" });
      expect(f.exchange).toHaveBeenCalledOnce();
    } finally {
      f.stream.destroy();
    }
  });
});
