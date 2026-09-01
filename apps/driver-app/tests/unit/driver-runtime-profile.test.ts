import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MULTI_TAXI_FORBIDDEN_CAPABILITIES,
  RUNTIME_PROFILE_CODES,
  type MultiTaxiForbiddenCapability,
} from "@drts/contracts";

const ENV_KEY = "EXPO_PUBLIC_DRTS_RUNTIME_PROFILE";

async function loadModule() {
  vi.resetModules();
  return import("../../lib/driver-runtime-profile");
}

describe("driver runtime profile gate", () => {
  const originalValue = process.env[ENV_KEY];

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalValue;
    }
  });

  describe("getDriverRuntimeProfileCode", () => {
    it("defaults to the most restrictive multi_taxi_direct profile", async () => {
      const mod = await loadModule();
      expect(mod.DEFAULT_DRIVER_RUNTIME_PROFILE_CODE).toBe("multi_taxi_direct");
      expect(mod.getDriverRuntimeProfileCode()).toBe("multi_taxi_direct");
    });

    it("honours every recognised profile code from the build env", async () => {
      for (const code of RUNTIME_PROFILE_CODES) {
        process.env[ENV_KEY] = code;
        const mod = await loadModule();
        expect(mod.getDriverRuntimeProfileCode()).toBe(code);
      }
    });

    it("trims surrounding whitespace on the override", async () => {
      process.env[ENV_KEY] = "  ordinary_taxi  ";
      const mod = await loadModule();
      expect(mod.getDriverRuntimeProfileCode()).toBe("ordinary_taxi");
    });

    it("fails closed to multi_taxi_direct for an unrecognised override", async () => {
      process.env[ENV_KEY] = "ordinry_taxi";
      const mod = await loadModule();
      expect(mod.getDriverRuntimeProfileCode()).toBe("multi_taxi_direct");
    });

    it("fails closed to multi_taxi_direct for an empty override", async () => {
      process.env[ENV_KEY] = "   ";
      const mod = await loadModule();
      expect(mod.getDriverRuntimeProfileCode()).toBe("multi_taxi_direct");
    });
  });

  describe("getDriverForbiddenCapabilities", () => {
    it("mirrors the contract list under multi_taxi_direct", async () => {
      process.env[ENV_KEY] = "multi_taxi_direct";
      const mod = await loadModule();
      expect(mod.getDriverForbiddenCapabilities()).toEqual(
        MULTI_TAXI_FORBIDDEN_CAPABILITIES,
      );
    });

    it("forbids nothing under the aggregating profiles", async () => {
      for (const code of ["ordinary_taxi", "business_dispatch"]) {
        process.env[ENV_KEY] = code;
        const mod = await loadModule();
        expect(mod.getDriverForbiddenCapabilities()).toEqual([]);
      }
    });
  });

  describe("isDriverCapabilityForbidden", () => {
    it("forbids every contract capability under multi_taxi_direct", async () => {
      process.env[ENV_KEY] = "multi_taxi_direct";
      const mod = await loadModule();
      for (const capability of MULTI_TAXI_FORBIDDEN_CAPABILITIES) {
        expect(mod.isDriverCapabilityForbidden(capability)).toBe(true);
      }
    });

    it("permits every contract capability under ordinary_taxi", async () => {
      process.env[ENV_KEY] = "ordinary_taxi";
      const mod = await loadModule();
      for (const capability of MULTI_TAXI_FORBIDDEN_CAPABILITIES) {
        expect(mod.isDriverCapabilityForbidden(capability)).toBe(false);
      }
    });

    it("does not forbid a capability outside the contract list", async () => {
      process.env[ENV_KEY] = "multi_taxi_direct";
      const mod = await loadModule();
      expect(
        mod.isDriverCapabilityForbidden(
          "ordinary_dispatch" as MultiTaxiForbiddenCapability,
        ),
      ).toBe(false);
    });
  });
});
