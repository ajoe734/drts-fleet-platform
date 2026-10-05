import { describe, expect, it, vi } from "vitest";

import {
  type ReadinessDeps,
  createIsReady,
  isEngineActivated,
  isMarkerFresh,
} from "../../../operations/artifact-scanner/gateway/readiness";
import { createRequestHandler } from "../../../operations/artifact-scanner/gateway/handler";

describe("isMarkerFresh", () => {
  it("is fresh when the marker was touched within the max age", () => {
    expect(isMarkerFresh(1_000, 1_500, 1_000)).toBe(true);
  });

  it("is fresh at the exact age boundary", () => {
    expect(isMarkerFresh(1_000, 2_000, 1_000)).toBe(true);
  });

  it("is stale once the marker's age exceeds the max age", () => {
    expect(isMarkerFresh(1_000, 2_001, 1_000)).toBe(false);
  });

  it("is stale for a marker far in the past", () => {
    expect(isMarkerFresh(0, 6 * 60 * 60 * 1000 + 1, 6 * 60 * 60 * 1000)).toBe(false);
  });
});

describe("isEngineActivated", () => {
  it("is activated only when the loaded version equals the expected on-disk version", () => {
    expect(isEngineActivated("27315", "27315")).toBe(true);
  });

  it("is not activated when the loaded version trails the expected version (reload pending or failed)", () => {
    // R8 round 3: freshclam wrote a newer file (expected=27316) but the
    // running engine has not (yet, or ever) reloaded it.
    expect(isEngineActivated("27315", "27316")).toBe(false);
  });

  it("is not activated when the live VERSION query failed/timed out", () => {
    expect(isEngineActivated(null, "27315")).toBe(false);
  });

  it("is not activated when there is no expected version to compare against", () => {
    expect(isEngineActivated("27315", null)).toBe(false);
  });
});

function fakeDeps(overrides: Partial<ReadinessDeps> = {}): ReadinessDeps {
  return {
    maxAgeMs: 6 * 60 * 60 * 1000,
    now: () => 1_000_000,
    readMarkerMtimeMs: () => 1_000_000 - 1000,
    readExpectedVersion: () => "27315",
    queryLoadedVersion: vi.fn().mockResolvedValue("27315"),
    ...overrides,
  };
}

describe("createIsReady", () => {
  it("is ready when the marker is fresh and the live engine matches the expected version", async () => {
    await expect(createIsReady(fakeDeps())()).resolves.toBe(true);
  });

  it("is not ready when the marker does not exist", async () => {
    await expect(
      createIsReady(fakeDeps({ readMarkerMtimeMs: () => null }))(),
    ).resolves.toBe(false);
  });

  it("is not ready once the marker's age exceeds the max age (overdue/failed refresh)", async () => {
    const deps = fakeDeps({
      maxAgeMs: 1000,
      now: () => 1_000_000,
      readMarkerMtimeMs: () => 1_000_000 - 1001,
    });
    await expect(createIsReady(deps)()).resolves.toBe(false);
  });

  it("is not ready when the expected-version file is missing or unreadable", async () => {
    await expect(
      createIsReady(fakeDeps({ readExpectedVersion: () => null }))(),
    ).resolves.toBe(false);
  });

  it("is not ready when the live engine's version trails the newer on-disk version (update with notify/reload failure)", async () => {
    // R8 round 3: this is the exact defect the round-3 review reproduced --
    // a fresh on-disk file and a successful marker publish are not proof
    // the running engine ever activated it.
    const deps = fakeDeps({
      readExpectedVersion: () => "27316",
      queryLoadedVersion: vi.fn().mockResolvedValue("27315"),
    });
    await expect(createIsReady(deps)()).resolves.toBe(false);
  });

  it("is not ready when the live VERSION query itself fails", async () => {
    const deps = fakeDeps({ queryLoadedVersion: vi.fn().mockResolvedValue(null) });
    await expect(createIsReady(deps)()).resolves.toBe(false);
  });

  it("remains ready across a genuine cooldown no-op (unchanged file, unchanged loaded version)", async () => {
    // Official freshclam behaviour: a no-op "already up to date" success
    // leaves both the on-disk file and the loaded engine's version
    // unchanged -- this positive case must survive the freshness fix, not
    // be confused with a stale no-write cooldown fake-success.
    const deps = fakeDeps({ readExpectedVersion: () => "27310", queryLoadedVersion: vi.fn().mockResolvedValue("27310") });
    await expect(createIsReady(deps)()).resolves.toBe(true);
  });

  it("never queries the live engine once the marker is already stale", async () => {
    const queryLoadedVersion = vi.fn().mockResolvedValue("27315");
    const deps = fakeDeps({
      maxAgeMs: 1000,
      now: () => 1_000_000,
      readMarkerMtimeMs: () => 1_000_000 - 1001,
      queryLoadedVersion,
    });
    await createIsReady(deps)();
    expect(queryLoadedVersion).not.toHaveBeenCalled();
  });
});

describe("createIsReady composed through the real request handler", () => {
  function baseConfig(deps: Partial<ReadinessDeps> = {}) {
    return {
      clamd: { host: "127.0.0.1", port: 3310, timeoutMs: 1000 },
      isReady: createIsReady(fakeDeps(deps)),
      exchange: vi.fn().mockResolvedValue("stream: OK"),
      log: vi.fn(),
    };
  }

  it("/health reports 200 ready once the engine has genuinely activated the current signatures", async () => {
    const handler = createRequestHandler(baseConfig());
    const req = { method: "GET", url: "/health", headers: {} } as any;
    let responseBody = "";
    const res = {
      writeHead: (status: number) => {
        (res as any).statusCode = status;
      },
      end: (body?: string) => {
        responseBody = body ?? "";
      },
    } as any;
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(responseBody)).toEqual({ status: "ready" });
  });

  it("/health reports 503 when the loaded engine has not activated a genuine update (reload pending/failed)", async () => {
    const handler = createRequestHandler(
      baseConfig({ readExpectedVersion: () => "27316", queryLoadedVersion: vi.fn().mockResolvedValue("27315") }),
    );
    const req = { method: "GET", url: "/health", headers: {} } as any;
    let responseBody = "";
    const res = {
      writeHead: (status: number) => {
        (res as any).statusCode = status;
      },
      end: (body?: string) => {
        responseBody = body ?? "";
      },
    } as any;
    await handler(req, res);
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(responseBody)).toEqual({ status: "not_ready" });
  });

  it("/scan fails closed with scan_engine_not_ready instead of ever exchanging with clamd when activation is unproven", async () => {
    const exchange = vi.fn();
    const config = {
      ...baseConfig({ readExpectedVersion: () => "27316", queryLoadedVersion: vi.fn().mockResolvedValue("27315") }),
      exchange,
    };
    const handler = createRequestHandler(config);
    const { EventEmitter } = await import("node:events");
    const { createHash } = await import("node:crypto");
    const body = Buffer.from("%PDF-1.4");
    const req = new EventEmitter() as any;
    req.method = "POST";
    req.url = "/scan";
    req.headers = {
      "content-type": "application/pdf",
      "x-content-sha256": createHash("sha256").update(body).digest("hex"),
    };
    let responseBody = "";
    const res = {
      writeHead: (status: number) => {
        (res as any).statusCode = status;
      },
      end: (body?: string) => {
        responseBody = body ?? "";
      },
    } as any;
    const pending = handler(req, res);
    req.emit("data", body);
    req.emit("end");
    await pending;
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(responseBody)).toEqual({ error: "scan_engine_not_ready" });
    expect(exchange).not.toHaveBeenCalled();
  });
});
