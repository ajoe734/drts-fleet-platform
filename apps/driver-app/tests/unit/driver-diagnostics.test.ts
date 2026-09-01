import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  sanitizeLogMessage: (value: unknown) => {
    if (value === null || value === undefined) {
      return null;
    }
    const text = typeof value === "string" ? value : String(value);
    if (!text.trim()) {
      return null;
    }
    return text
      .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
      .replace(
        /(["']?token["']?\s*:\s*["'])([^"']+)(["'])/gi,
        "$1[REDACTED]$3",
      );
  },
}));

import {
  classifyDriverRequestFailure,
  clearDriverDiagnostics,
  getDriverDiagnostics,
  recordDriverDiagnostic,
} from "../../lib/driver-diagnostics";

describe("driver diagnostics", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearDriverDiagnostics();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("stores a record with defaults filled in", () => {
    const record = recordDriverDiagnostic({
      kind: "workspace_degrade",
      reason: "identity_context_unavailable:offline:attempts=3",
    });

    expect(record.identityState).toBe("unknown");
    expect(record.connectivity).toBe("unknown");
    expect(record.requestResults).toEqual({});
    expect(Number.isNaN(Date.parse(record.at))).toBe(false);
    expect(getDriverDiagnostics()).toHaveLength(1);
  });

  it("keeps the fields the caller supplies", () => {
    recordDriverDiagnostic({
      kind: "api_failure",
      reason: "unified_tasks_failed:timeout",
      identityState: "provisioned",
      connectivity: "timeout",
      requestResults: { unified_tasks: "failed", identity_context: "ok" },
      at: "2026-05-08T00:00:00.000Z",
    });

    const [record] = getDriverDiagnostics();
    expect(record).toEqual({
      kind: "api_failure",
      reason: "unified_tasks_failed:timeout",
      identityState: "provisioned",
      connectivity: "timeout",
      requestResults: { unified_tasks: "failed", identity_context: "ok" },
      at: "2026-05-08T00:00:00.000Z",
    });
  });

  it("logs through console.warn and never console.error or console.log", () => {
    recordDriverDiagnostic({ kind: "workspace_recover", reason: "recovered" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0][0])).toContain("driver-diagnostics");
  });

  it("sanitises credentials out of the reason and the log line", () => {
    recordDriverDiagnostic({
      kind: "api_failure",
      reason: 'refresh failed with Bearer abc.def.ghi and "token":"s3cret"',
    });

    const [record] = getDriverDiagnostics();
    expect(record.reason).not.toContain("abc.def.ghi");
    expect(record.reason).not.toContain("s3cret");
    expect(record.reason).toContain("[REDACTED]");

    const logged = warnSpy.mock.calls[0].map(String).join(" ");
    expect(logged).not.toContain("s3cret");
  });

  it("falls back to a placeholder reason instead of throwing on empty input", () => {
    const record = recordDriverDiagnostic({
      kind: "identity_refresh",
      reason: "   ",
    });
    expect(record.reason).toBe("unknown");
  });

  it("keeps only the most recent 50 records", () => {
    for (let index = 0; index < 60; index += 1) {
      recordDriverDiagnostic({
        kind: "api_failure",
        reason: `event-${index}`,
      });
    }

    const records = getDriverDiagnostics();
    expect(records).toHaveLength(50);
    expect(records[0].reason).toBe("event-10");
    expect(records[49].reason).toBe("event-59");
  });

  it("returns a copy so callers cannot mutate the buffer", () => {
    recordDriverDiagnostic({ kind: "api_failure", reason: "one" });
    const snapshot = getDriverDiagnostics() as unknown as unknown[];
    snapshot.push({} as never);
    expect(getDriverDiagnostics()).toHaveLength(1);
  });

  describe("classifyDriverRequestFailure", () => {
    it("detects an aborted or timed out request", () => {
      expect(
        classifyDriverRequestFailure(
          Object.assign(new Error("The operation was aborted"), {
            name: "AbortError",
          }),
        ),
      ).toBe("timeout");
      expect(classifyDriverRequestFailure(new Error("Request timeout"))).toBe(
        "timeout",
      );
    });

    it("detects a lost network", () => {
      expect(
        classifyDriverRequestFailure(new Error("Network request failed")),
      ).toBe("offline");
      expect(classifyDriverRequestFailure(new Error("Failed to fetch"))).toBe(
        "offline",
      );
    });

    it("separates an authorisation refusal from a server error", () => {
      expect(
        classifyDriverRequestFailure(new Error('API error 403: {"error":{}}')),
      ).toBe("denied");
      expect(
        classifyDriverRequestFailure(new Error('API error 401: {"error":{}}')),
      ).toBe("denied");
      expect(
        classifyDriverRequestFailure(new Error('API error 503: {"error":{}}')),
      ).toBe("server");
    });

    it("falls back to unknown", () => {
      expect(classifyDriverRequestFailure(null)).toBe("unknown");
      expect(classifyDriverRequestFailure(new Error("boom"))).toBe("unknown");
    });
  });
});
