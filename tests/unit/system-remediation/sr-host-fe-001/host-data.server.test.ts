import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only — same pattern as
// tests/unit/system-remediation/sr-fleet-data-001/sr-fleet-data-001.test.ts.
vi.mock("server-only", () => ({}));

const mockListHostVehicles = vi.fn();
const mockGetHostVehicleEarnings = vi.fn();
const mockListHostVehicleMaintenance = vi.fn();
const mockListHostVehicleTrips = vi.fn();
const mockListHostVehicleCases = vi.fn();

vi.mock(
  "../../../../apps/fleet-partner-portal-web/app/host/lib/host-auth.server",
  () => ({
    getServerHostClient: vi.fn(async () => ({
      client: {
        listHostVehicles: mockListHostVehicles,
        getHostVehicleEarnings: mockGetHostVehicleEarnings,
        listHostVehicleMaintenance: mockListHostVehicleMaintenance,
        listHostVehicleTrips: mockListHostVehicleTrips,
        listHostVehicleCases: mockListHostVehicleCases,
      },
      partnerId: "host-partner-test-001",
    })),
  }),
);

import type { HostVehicleSummary } from "@drts/contracts";
import {
  loadHostVehicleCases,
  loadHostVehicleDetail,
  loadHostVehicleEarnings,
  loadHostVehicleMaintenance,
  loadHostVehicleTrips,
  loadHostVehicles,
} from "../../../../apps/fleet-partner-portal-web/app/host/lib/host-data.server";

const VEHICLE_A: HostVehicleSummary = {
  vehicleId: "veh_host_001",
  plateNo: "TDC-8899",
  vinMasked: "1HGCR2F83HA******",
  vehicleForm: "sedan",
  licenseClass: "multi_taxi",
  energyType: "electric",
  currentStatus: "active",
  operatingFleetName: "大都會多元車隊",
  contractPeriod: {
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2026-12-31T23:59:59.000Z",
    status: "active",
  },
};

// Duck-typed to match ApiClientError's shape (packages/api-client/src/
// index.ts) without importing the real class — root vitest.config.ts has no
// alias for @drts/api-client (only the workspace-symlinked app directories
// resolve it), and the source under test (host-data.server.ts) itself
// duck-types on code/statusCode/apiMessage for the same reason.
function apiError(statusCode: number, code: string) {
  return { statusCode, code, apiMessage: code, message: `API error ${code}` };
}

describe("SR-HOST-FE-001: host-data.server loaders", () => {
  beforeEach(() => {
    mockListHostVehicles.mockReset();
    mockGetHostVehicleEarnings.mockReset();
    mockListHostVehicleMaintenance.mockReset();
    mockListHostVehicleTrips.mockReset();
    mockListHostVehicleCases.mockReset();
  });

  describe("loadHostVehicles", () => {
    it("returns the live owned-vehicle list and pageInfo on success", async () => {
      mockListHostVehicles.mockResolvedValueOnce({
        items: [VEHICLE_A],
        pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });

      const result = await loadHostVehicles({ page: 1, pageSize: 20 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.items).toEqual([VEHICLE_A]);
        expect(result.pageInfo.totalItems).toBe(1);
      }
      expect(mockListHostVehicles).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
      });
    });

    it("returns a legitimate empty list (zero vehicles) as ok, not an access failure", async () => {
      mockListHostVehicles.mockResolvedValueOnce({
        items: [],
        pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      });

      const result = await loadHostVehicles({ page: 1, pageSize: 20 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.items).toEqual([]);
      }
    });

    it("classifies an unauthorized API error as the unauthorized access state", async () => {
      mockListHostVehicles.mockRejectedValueOnce(
        apiError(401, "HOST_UNAUTHORIZED"),
      );

      const result = await loadHostVehicles({ page: 1, pageSize: 20 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.accessState).toBe("unauthorized");
      }
    });

    it("classifies a network-level failure (backend module not yet merged) as fetch_failed, never fabricated data", async () => {
      mockListHostVehicles.mockRejectedValueOnce(
        new Error("fetch failed: ECONNREFUSED"),
      );

      const result = await loadHostVehicles({ page: 1, pageSize: 20 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.accessState).toBe("fetch_failed");
      }
    });
  });

  describe("loadHostVehicleDetail", () => {
    it("resolves the vehicle summary by scanning the caller's own owned-vehicle list", async () => {
      mockListHostVehicles.mockResolvedValueOnce({
        items: [VEHICLE_A],
        pageInfo: { page: 1, pageSize: 200, totalItems: 1, totalPages: 1 },
      });

      const result = await loadHostVehicleDetail("veh_host_001");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.vehicle.vehicleId).toBe("veh_host_001");
      }
    });

    it("treats a vehicleId absent from the owned-vehicle list as vehicle_not_found (anti-enumeration, never forbidden)", async () => {
      mockListHostVehicles.mockResolvedValueOnce({
        items: [VEHICLE_A],
        pageInfo: { page: 1, pageSize: 200, totalItems: 1, totalPages: 1 },
      });

      const result = await loadHostVehicleDetail("veh_someone_elses_001");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.accessState).toBe("vehicle_not_found");
      }
    });

    it("propagates a forbidden error from the list call", async () => {
      mockListHostVehicles.mockRejectedValueOnce(
        apiError(403, "HOST_FORBIDDEN"),
      );

      const result = await loadHostVehicleDetail("veh_host_001");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.accessState).toBe("forbidden");
      }
    });
  });

  describe("loadHostVehicleEarnings — three distinct states", () => {
    it("classifies real activity with a null fleetCommission/netEarnings as reported, not zero or no_record", async () => {
      mockGetHostVehicleEarnings.mockResolvedValueOnce({
        vehicleId: "veh_host_001",
        period: "2026-08",
        currency: "TWD",
        grossRevenue: 84200,
        platformFee: 12630,
        fleetCommission: null,
        netEarnings: null,
        tripsCount: 182,
        operatingDays: 26,
        settlementStatus: "pending_policy",
      });

      const result = await loadHostVehicleEarnings("veh_host_001", "2026-08");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.variant).toBe("reported");
        expect(result.earnings?.fleetCommission).toBeNull();
      }
    });

    it("classifies a real, calculated zero-activity period as zero", async () => {
      mockGetHostVehicleEarnings.mockResolvedValueOnce({
        vehicleId: "veh_host_003",
        period: "2026-08",
        currency: "TWD",
        grossRevenue: 0,
        platformFee: 0,
        fleetCommission: null,
        netEarnings: null,
        tripsCount: 0,
        operatingDays: 0,
        settlementStatus: "pending_policy",
      });

      const result = await loadHostVehicleEarnings("veh_host_003", "2026-08");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.variant).toBe("zero");
      }
    });

    it("classifies a 404 for an already-validated vehicle as no_record (no document for the period), not an access failure", async () => {
      mockGetHostVehicleEarnings.mockRejectedValueOnce(
        apiError(404, "HOST_VEHICLE_NOT_FOUND"),
      );

      const result = await loadHostVehicleEarnings("veh_host_001", "2026-01");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.variant).toBe("no_record");
        expect(result.earnings).toBeNull();
      }
    });

    it("classifies a non-404 error as an access failure, not no_record", async () => {
      mockGetHostVehicleEarnings.mockRejectedValueOnce(
        apiError(403, "HOST_FORBIDDEN"),
      );

      const result = await loadHostVehicleEarnings("veh_host_001", "2026-01");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.accessState).toBe("forbidden");
      }
    });
  });

  describe("loadHostVehicleMaintenance / Trips / Cases", () => {
    it("returns live maintenance items and pageInfo", async () => {
      mockListHostVehicleMaintenance.mockResolvedValueOnce({
        items: [],
        pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      });

      const result = await loadHostVehicleMaintenance("veh_host_001", {
        page: 1,
        pageSize: 20,
      });

      expect(result.ok).toBe(true);
      expect(mockListHostVehicleMaintenance).toHaveBeenCalledWith(
        "veh_host_001",
        { page: 1, pageSize: 20 },
      );
    });

    it("classifies trips access failure correctly", async () => {
      mockListHostVehicleTrips.mockRejectedValueOnce(
        apiError(401, "HOST_UNAUTHORIZED"),
      );

      const result = await loadHostVehicleTrips("veh_host_001", {
        page: 1,
        pageSize: 20,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.accessState).toBe("unauthorized");
      }
    });

    it("returns live cases items", async () => {
      mockListHostVehicleCases.mockResolvedValueOnce({
        items: [],
        pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      });

      const result = await loadHostVehicleCases("veh_host_001", {
        page: 1,
        pageSize: 20,
      });

      expect(result.ok).toBe(true);
    });
  });
});
