import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

import { headers } from "next/headers";
import {
  loadDashboard,
  loadDrivers,
  loadQuality,
  loadRevenue,
  loadStatements,
  loadTrips,
  loadVehicles,
} from "../../lib/fleet-portal-data.server";

describe("fleet-portal-data server loaders", () => {
  const originalEnv = process.env.DRTS_FLEET_PARTNER_ID;

  beforeEach(() => {
    process.env.DRTS_FLEET_PARTNER_ID = "fleet-demo-001";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DRTS_FLEET_PARTNER_ID = originalEnv;
    } else {
      delete process.env.DRTS_FLEET_PARTNER_ID;
    }
  });

  describe("Missing fleet scope error propagation", () => {
    beforeEach(() => {
      delete process.env.DRTS_FLEET_PARTNER_ID;
      // Satisfy the existing principal prerequisite while leaving fleet scope absent.
      vi.mocked(headers).mockResolvedValue(
        new Headers({ authorization: "Bearer fleet-session-test" }),
      );
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        if (
          url.hostname === "metadata.google.internal" &&
          url.pathname ===
            "/computeMetadata/v1/instance/service-accounts/default/identity"
        ) {
          return new Response("fleet-invocation-test");
        }
        if (url.pathname === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              data: {
                active: true,
                identity: {
                  realm: "partner",
                  actorType: "partner_user",
                  actorId: "fleet-user-test",
                  partnerId: "fleet-demo-001",
                  scopes: ["fleet:read"],
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`Unexpected fixture request: ${url.pathname}`);
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.mocked(headers).mockResolvedValue(new Headers());
    });

    it("loadDrivers re-throws missing fleet scope error", async () => {
      await expect(loadDrivers()).rejects.toThrow(
        "Missing fleet scope configuration",
      );
    });

    it("loadVehicles re-throws missing fleet scope error", async () => {
      await expect(loadVehicles()).rejects.toThrow(
        "Missing fleet scope configuration",
      );
    });

    it("loadTrips re-throws missing fleet scope error", async () => {
      await expect(loadTrips()).rejects.toThrow(
        "Missing fleet scope configuration",
      );
    });

    it("loadQuality re-throws missing fleet scope error", async () => {
      await expect(loadQuality()).rejects.toThrow(
        "Missing fleet scope configuration",
      );
    });

    it("loadStatements re-throws missing fleet scope error", async () => {
      await expect(loadStatements()).rejects.toThrow(
        "Missing fleet scope configuration",
      );
    });

    it("loadRevenue re-throws missing fleet scope error", async () => {
      await expect(loadRevenue()).rejects.toThrow(
        "Missing fleet scope configuration",
      );
    });

    it("loadDashboard re-throws missing fleet scope error", async () => {
      await expect(loadDashboard()).rejects.toThrow(
        "Missing fleet scope configuration",
      );
    });
  });

  describe("Current period and fallback behavior", () => {
    it("loadRevenue fallback uses the current period month instead of 2026-05", async () => {
      // In fallback mode (when API fetch fails or client errors for non-config reason)
      // loadRevenue should return current period month (e.g. YYYY-MM)
      const currentPeriodMonth = new Date().toISOString().slice(0, 7);
      const res = await loadRevenue();
      expect(res.period).toBe(currentPeriodMonth);
      expect(res.period).not.toBe("2026-05");
    });
  });
});
