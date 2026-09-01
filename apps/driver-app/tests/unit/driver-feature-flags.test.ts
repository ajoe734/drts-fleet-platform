import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  sanitizeLogMessage: (value: unknown) =>
    value === null || value === undefined ? null : String(value),
}));

import {
  clearDriverDiagnostics,
  getDriverDiagnostics,
} from "../../lib/driver-diagnostics";
import {
  DRIVER_FEATURE_DEFAULTS,
  getDriverFeatureCacheSnapshot,
  getDriverFeatureDefault,
  readDriverFeature,
  readDriverFeatureSummary,
  resetDriverFeatureCache,
} from "../../lib/driver-feature-flags";

const FORBIDDEN = new Error(
  'API error 403: {"error":{"code":"FORBIDDEN","message":"realm"}}',
);
const TIMED_OUT = Object.assign(new Error("The operation was aborted"), {
  name: "AbortError",
});
const OFFLINE = new Error("Network request failed");

describe("driver feature flags", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetDriverFeatureCache();
    clearDriverDiagnostics();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("defaults every driver-facing capability to enabled", () => {
    expect(DRIVER_FEATURE_DEFAULTS["driver-app.shift"]).toBe(true);
    expect(DRIVER_FEATURE_DEFAULTS["driver-app.tasks"]).toBe(true);
    expect(DRIVER_FEATURE_DEFAULTS["driver-app.earnings"]).toBe(true);
    expect(getDriverFeatureDefault("driver-app.unknown")).toBe(true);
  });

  describe("readDriverFeature", () => {
    it("reports a successful remote read", async () => {
      const client = { isFeatureEnabled: vi.fn().mockResolvedValue(false) };
      await expect(
        readDriverFeature(client, "driver-app.shift"),
      ).resolves.toEqual({
        enabled: false,
        source: "remote",
      });
    });

    // The admin flag endpoints require the system|platform realm, so a driver
    // token is always rejected there. That is expected, not an outage.
    it.each([
      ["a 403 refusal", FORBIDDEN],
      ["a timeout", TIMED_OUT],
      ["a lost network", OFFLINE],
    ])("fails open on %s", async (_label, error) => {
      const client = { isFeatureEnabled: vi.fn().mockRejectedValue(error) };
      await expect(
        readDriverFeature(client, "driver-app.shift"),
      ).resolves.toEqual({
        enabled: true,
        source: "default",
      });
    });

    it("never rejects", async () => {
      const client = {
        isFeatureEnabled: vi.fn().mockRejectedValue(FORBIDDEN),
      };
      let rejected = false;
      await readDriverFeature(client, "driver-app.tasks").catch(() => {
        rejected = true;
      });
      expect(rejected).toBe(false);
    });

    it("serves the last known good value after a later failure", async () => {
      const client = {
        isFeatureEnabled: vi
          .fn()
          .mockResolvedValueOnce(false)
          .mockRejectedValue(FORBIDDEN),
      };

      await readDriverFeature(client, "driver-app.shift");
      await expect(
        readDriverFeature(client, "driver-app.shift"),
      ).resolves.toEqual({ enabled: false, source: "cache" });
    });

    it("keeps a per-key cache", async () => {
      const client = {
        isFeatureEnabled: vi.fn(async (key: string) =>
          key === "driver-app.shift" ? false : true,
        ),
      };

      await readDriverFeature(client, "driver-app.shift");
      await readDriverFeature(client, "driver-app.earnings");
      expect(getDriverFeatureCacheSnapshot()).toEqual({
        "driver-app.shift": false,
        "driver-app.earnings": true,
      });
    });

    it("falls back without calling anything when there is no client", async () => {
      await expect(readDriverFeature(null, "driver-app.tasks")).resolves.toEqual(
        { enabled: true, source: "default" },
      );
      await expect(
        readDriverFeature({}, "driver-app.tasks"),
      ).resolves.toEqual({ enabled: true, source: "default" });
    });

    it("records the fallback as an internal diagnostic naming the key", async () => {
      const client = {
        isFeatureEnabled: vi.fn().mockRejectedValue(FORBIDDEN),
      };
      await readDriverFeature(client, "driver-app.shift");

      const records = getDriverDiagnostics();
      expect(records).toHaveLength(1);
      expect(records[0].kind).toBe("feature_flag_fallback");
      expect(records[0].reason).toContain("driver-app.shift");
      expect(records[0].reason).toContain("denied");
      expect(records[0].requestResults.feature_flags).toBe("failed");
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe("readDriverFeatureSummary", () => {
    it("warms the per-key cache from a successful summary", async () => {
      const client = {
        getFeatureFlags: vi.fn().mockResolvedValue({
          flags: [
            { key: "driver-app.shift", enabled: false },
            { key: "driver-app.tasks", enabled: true },
          ],
          notes: [],
        }),
      };

      const result = await readDriverFeatureSummary(client);
      expect(result.available).toBe(true);
      expect(result.source).toBe("remote");
      expect(result.enabledKeys).toEqual(["driver-app.tasks"]);
      expect(getDriverFeatureCacheSnapshot()).toEqual({
        "driver-app.shift": false,
        "driver-app.tasks": true,
      });
    });

    it("resolves with the defaults when the driver realm is refused", async () => {
      const client = { getFeatureFlags: vi.fn().mockRejectedValue(FORBIDDEN) };
      const result = await readDriverFeatureSummary(client);

      expect(result.available).toBe(false);
      expect(result.source).toBe("default");
      expect(result.enabledKeys).toContain("driver-app.shift");
    });

    it("prefers cached keys over defaults after a failure", async () => {
      const client = {
        getFeatureFlags: vi
          .fn()
          .mockResolvedValueOnce({
            flags: [{ key: "driver-app.tasks", enabled: true }],
            notes: [],
          })
          .mockRejectedValue(OFFLINE),
      };

      await readDriverFeatureSummary(client);
      const result = await readDriverFeatureSummary(client);
      expect(result.available).toBe(false);
      expect(result.source).toBe("cache");
      expect(result.enabledKeys).toEqual(["driver-app.tasks"]);
    });

    it("never rejects", async () => {
      const client = { getFeatureFlags: vi.fn().mockRejectedValue(TIMED_OUT) };
      let rejected = false;
      await readDriverFeatureSummary(client).catch(() => {
        rejected = true;
      });
      expect(rejected).toBe(false);
    });
  });
});
