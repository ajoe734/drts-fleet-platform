import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

// Mock api-client.server
const mockDrivers = vi.fn();
const mockVehicles = vi.fn();
const mockTrips = vi.fn();
const mockDashboard = vi.fn();

vi.mock(
  "../../../../apps/fleet-partner-portal-web/lib/api-client.server",
  () => ({
    getServerFleetPartnerClient: vi.fn(async () => ({
      client: {
        listFleetPortalDrivers: mockDrivers,
        listFleetPortalVehicles: mockVehicles,
        listFleetPortalTrips: mockTrips,
        listFleetPortalDashboard: mockDashboard,
      },
      fleetPartnerId: "fp-test-001",
    })),
  }),
);

import {
  loadCases,
  loadDashboard,
  loadDrivers,
  loadTraining,
  loadTrips,
  loadVehicles,
} from "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server";

import { GET as exportHandler } from "../../../../apps/fleet-partner-portal-web/app/trips/export/route";

describe("SR-FLEET-DATA-001: Fleet Data Source Unification and Error Handling", () => {
  const originalEnv = process.env.DRTS_FLEET_PARTNER_ID;

  beforeEach(() => {
    process.env.DRTS_FLEET_PARTNER_ID = "fp-test-001";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DRTS_FLEET_PARTNER_ID = originalEnv;
    } else {
      delete process.env.DRTS_FLEET_PARTNER_ID;
    }
  });

  describe("Requirement 1 & Capability C063: Authoritative source unification and removal of 128/96 fake stats", () => {
    it("dashboard reflects live driver list counts rather than 128/96 fake stats", async () => {
      // Setup live driver response with 2 drivers: 1 available, 1 offline
      mockDrivers.mockResolvedValue([
        {
          driverId: "drv-01",
          name: "王大明",
          currentVehiclePlateNo: "ABC-1234",
          workState: "available",
          licensesValid: true,
          supportedServiceBuckets: ["standard_taxi"],
          dispatchEligible: true,
        },
        {
          driverId: "drv-02",
          name: "李小華",
          currentVehiclePlateNo: "XYZ-9876",
          workState: "offline",
          licensesValid: true,
          supportedServiceBuckets: ["standard_taxi"],
          dispatchEligible: false,
        },
      ]);
      mockVehicles.mockResolvedValue([]);
      mockTrips.mockResolvedValue([]);
      mockDashboard.mockRejectedValue(new Error("Endpoint not reachable"));

      const driversView = await loadDrivers();
      expect(driversView.rows).toHaveLength(2);
      expect(driversView.source).toBe("live");
      expect(driversView.error).toBeNull();

      const dashboard = await loadDashboard("2026-09");
      // Must NOT be 128 or 96
      expect(dashboard.driverCount).toBe("2");
      expect(dashboard.driverCount).not.toBe("128");
      expect(dashboard.driverStatusSummary.online).toBe("1");
      expect(dashboard.driverStatusSummary.online).not.toBe("96");
      expect(dashboard.driverStatusSummary.offline).toBe("1");
      expect(dashboard.dispatchable).toBe("1");
      expect(dashboard.periodMonth).toBe("2026-09");
      expect(dashboard.dataTimestamp).toBeDefined();
    });

    it("separates legitimate zero data from read failure on dashboard and loaders", async () => {
      // 1. Legitimate zero data: reachable API returning empty arrays
      mockDrivers.mockResolvedValue([]);
      mockVehicles.mockResolvedValue([]);
      mockTrips.mockResolvedValue([]);
      mockDashboard.mockResolvedValue({
        fleetPartnerId: "fp-test-001",
        periodMonth: "2026-09",
        activeDriverCount: 0,
        onlineDriverCount: 0,
        dispatchEligibleDriverCount: 0,
        totalVehicleCount: 0,
        dispatchableVehicleCount: 0,
        completedTripCount: 0,
        inFlightTripCount: 0,
        proofPendingTripCount: 0,
        pendingStatementCount: 0,
        latestStatementPeriodMonth: null,
        grossEarningAmount: { amountMinor: 0, currency: "TWD" },
        shareAmount: { amountMinor: 0, currency: "TWD" },
      });

      const zeroDrivers = await loadDrivers();
      expect(zeroDrivers.rows).toEqual([]);
      expect(zeroDrivers.source).toBe("live");
      expect(zeroDrivers.error).toBeNull();

      const zeroVehicles = await loadVehicles();
      expect(zeroVehicles.rows).toEqual([]);
      expect(zeroVehicles.source).toBe("live");
      expect(zeroVehicles.error).toBeNull();

      const zeroTrips = await loadTrips("2026-09");
      expect(zeroTrips.rows).toEqual([]);
      expect(zeroTrips.source).toBe("live");
      expect(zeroTrips.error).toBeNull();

      const zeroDashboard = await loadDashboard("2026-09");
      expect(zeroDashboard.driverCount).toBe("0");
      expect(zeroDashboard.driverStatusSummary.online).toBe("0");
      expect(zeroDashboard.driverStatusSummary.offline).toBe("0");
      expect(zeroDashboard.completedTrips).toBe("0");
      expect(zeroDashboard.source).toBe("live");
      expect(zeroDashboard.error).toBeNull();

      // 2. Read failure: API throws error
      mockDrivers.mockRejectedValue(new Error("503 Service Unavailable"));
      mockVehicles.mockRejectedValue(new Error("503 Service Unavailable"));
      mockTrips.mockRejectedValue(new Error("503 Service Unavailable"));
      mockDashboard.mockRejectedValue(new Error("503 Service Unavailable"));

      const failedDrivers = await loadDrivers();
      expect(failedDrivers.rows).toEqual([]);
      expect(failedDrivers.source).toBe("fallback");
      expect(failedDrivers.error).toBe("503 Service Unavailable");

      const failedVehicles = await loadVehicles();
      expect(failedVehicles.rows).toEqual([]);
      expect(failedVehicles.source).toBe("fallback");
      expect(failedVehicles.error).toBe("503 Service Unavailable");

      const failedTrips = await loadTrips("2026-09");
      expect(failedTrips.rows).toEqual([]);
      expect(failedTrips.source).toBe("fallback");
      expect(failedTrips.error).toBe("503 Service Unavailable");

      const failedDashboard = await loadDashboard("2026-09");
      expect(failedDashboard.source).toBe("fallback");
      expect(failedDashboard.error).toBe("503 Service Unavailable");
      expect(failedDashboard.driverCount).toBe("—");
      expect(failedDashboard.driverCount).not.toBe("0");
      expect(failedDashboard.driverCount).not.toBe("128");
      expect(failedDashboard.completedTrips).toBe("—");
      expect(failedDashboard.share).toBe("—");
      expect(failedDashboard.grossRevenue).toBe("—");
    });
  });

  describe("Requirement 2: training and cases unintegrated without fixture stuffing", () => {
    it("loadCases returns empty rows and connected: false", async () => {
      const casesView = await loadCases();
      expect(casesView.rows).toEqual([]);
      expect(casesView.connected).toBe(false);
      expect(casesView.source).toBe("fallback");
    });

    it("loadTraining returns empty rows, neutral summary and connected: false", async () => {
      const trainingView = await loadTraining();
      expect(trainingView.rows).toEqual([]);
      expect(trainingView.connected).toBe(false);
      expect(trainingView.summary.completionPct).toBe("—");
      expect(trainingView.summary.pendingHeadcount).toBe("—");
      expect(trainingView.summary.overdueIncomplete).toBe("—");
    });

    it("dashboard supplemental indicators explicitly mark unintegrated status", async () => {
      mockDrivers.mockResolvedValue([]);
      mockVehicles.mockResolvedValue([]);
      mockTrips.mockResolvedValue([]);
      mockDashboard.mockResolvedValue(null);

      const dashboard = await loadDashboard();
      expect(dashboard.supplemental.openCases).toBe("—");
      expect(dashboard.supplemental.trainingCompletion).toBe("—");
    });
  });

  describe("Requirement 3 & Capabilities C013, C069: CSV export matching list filtering and scope", () => {
    beforeEach(() => {
      mockTrips.mockResolvedValue([
        {
          orderId: "ord-001",
          driverName: "張駕駛",
          grossEarning: { amountMinor: 120000, currency: "TWD" },
          fleetShareAmount: { amountMinor: 24000, currency: "TWD" },
          reimbursementAmount: { amountMinor: 0, currency: "TWD" },
          status: "completed",
          completedAt: "2026-09-01T10:00:00Z",
          businessDispatchSubtype: "credit_card_airport_transfer",
          pickupAddress: "桃園機場第一航廈",
        },
        {
          orderId: "ord-002",
          driverName: "李駕駛",
          grossEarning: { amountMinor: 50000, currency: "TWD" },
          fleetShareAmount: { amountMinor: 10000, currency: "TWD" },
          reimbursementAmount: { amountMinor: 0, currency: "TWD" },
          status: "completed",
          completedAt: "2026-09-02T11:00:00Z",
          businessDispatchSubtype: "standard_taxi",
          pickupAddress: "台北市信義區松仁路",
        },
        {
          orderId: "ord-003",
          driverName: "王駕駛",
          grossEarning: { amountMinor: 60000, currency: "TWD" },
          fleetShareAmount: { amountMinor: 12000, currency: "TWD" },
          reimbursementAmount: { amountMinor: 0, currency: "TWD" },
          status: "cancelled",
          completedAt: "2026-09-03T12:00:00Z",
          businessDispatchSubtype: "enterprise_dispatch",
          pickupAddress: "新竹市科學園區",
        },
      ]);
    });

    it("trips export with svc=airport returns exactly the airport transfer rows", async () => {
      const req = new NextRequest(
        "http://localhost:3000/trips/export?svc=airport",
      );
      const res = await exportHandler(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toContain(
        "trips-airport.csv",
      );

      const body = await res.text();
      const lines = body.trim().split("\n");
      // Header + 1 airport row
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("TripID,Service,Driver");
      expect(lines[1]).toContain("ord-001");
      expect(lines[1]).toContain("airport");
    });

    it("trips export without svc filter exports all trips matching total list count", async () => {
      const req = new NextRequest("http://localhost:3000/trips/export");
      const res = await exportHandler(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toContain("trips-all.csv");

      const body = await res.text();
      const lines = body.trim().split("\n");
      // Header + 3 trip rows
      expect(lines).toHaveLength(4);
      expect(body).toContain("ord-001");
      expect(body).toContain("ord-002");
      expect(body).toContain("ord-003");
    });

    it("overview export (type=summary) exports authoritative operational metrics", async () => {
      mockDrivers.mockResolvedValue([
        {
          driverId: "drv-01",
          name: "張駕駛",
          workState: "available",
          licensesValid: true,
          supportedServiceBuckets: ["standard_taxi"],
          dispatchEligible: true,
        },
      ]);
      mockVehicles.mockResolvedValue([]);
      mockDashboard.mockResolvedValue({
        fleetPartnerId: "fp-test-001",
        periodMonth: "2026-09",
        activeDriverCount: 1,
        onlineDriverCount: 1,
        dispatchEligibleDriverCount: 1,
        totalVehicleCount: 0,
        dispatchableVehicleCount: 0,
        completedTripCount: 2,
        inFlightTripCount: 0,
        proofPendingTripCount: 0,
        pendingStatementCount: 0,
        latestStatementPeriodMonth: "2026-09",
        grossEarningAmount: { amountMinor: 170000, currency: "TWD" },
        shareAmount: { amountMinor: 34000, currency: "TWD" },
      });

      const req = new NextRequest(
        "http://localhost:3000/trips/export?type=summary&period=2026-09",
      );
      const res = await exportHandler(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toContain(
        "fleet-overview-2026-09.csv",
      );

      const body = await res.text();
      expect(body).toContain("Active Drivers,1,2026-09");
      expect(body).toContain("Online Drivers,1,2026-09");
      expect(body).toContain("Completed Trips,2,2026-09");
    });

    it("trips export with status=completed filter returns only completed trips", async () => {
      const req = new NextRequest(
        "http://localhost:3000/trips/export?status=completed",
      );
      const res = await exportHandler(req);

      expect(res.status).toBe(200);
      const body = await res.text();
      const lines = body.trim().split("\n");
      // Header + 2 completed rows
      expect(lines).toHaveLength(3);
      expect(body).toContain("ord-001");
      expect(body).toContain("ord-002");
      expect(body).not.toContain("ord-003");
    });

    it("trips export with no matching rows returns only CSV header without failing", async () => {
      const req = new NextRequest(
        "http://localhost:3000/trips/export?svc=travel",
      );
      const res = await exportHandler(req);

      expect(res.status).toBe(200);
      const body = await res.text();
      const lines = body.trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("TripID,Service,Driver");
    });

    it("export handles loader errors gracefully with 500 status", async () => {
      mockTrips.mockRejectedValue(new Error("Database connection timeout"));
      const req = new NextRequest("http://localhost:3000/trips/export");
      const res = await exportHandler(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.message).toBe("Database connection timeout");
    });

    it("trips export with q filter returns only matching trips by id, driver, or pickup", async () => {
      const reqId = new NextRequest(
        "http://localhost:3000/trips/export?q=ord-002",
      );
      const resId = await exportHandler(reqId);
      expect(resId.status).toBe(200);
      const bodyId = await resId.text();
      const linesId = bodyId.trim().split("\n");
      expect(linesId).toHaveLength(2);
      expect(linesId[1]).toContain("ord-002");
      expect(linesId[1]).toContain("李駕駛");

      const reqDriver = new NextRequest(
        "http://localhost:3000/trips/export?q=張駕駛",
      );
      const resDriver = await exportHandler(reqDriver);
      const bodyDriver = await resDriver.text();
      const linesDriver = bodyDriver.trim().split("\n");
      expect(linesDriver).toHaveLength(2);
      expect(linesDriver[1]).toContain("ord-001");

      const reqPickup = new NextRequest(
        "http://localhost:3000/trips/export?q=信義區",
      );
      const resPickup = await exportHandler(reqPickup);
      const bodyPickup = await resPickup.text();
      const linesPickup = bodyPickup.trim().split("\n");
      expect(linesPickup).toHaveLength(2);
      expect(linesPickup[1]).toContain("ord-002");
    });

    it("trips export combining svc and q filters matches compound criteria", async () => {
      const reqMatch = new NextRequest(
        "http://localhost:3000/trips/export?svc=realtime&q=信義區",
      );
      const resMatch = await exportHandler(reqMatch);
      expect(resMatch.status).toBe(200);
      const bodyMatch = await resMatch.text();
      const linesMatch = bodyMatch.trim().split("\n");
      expect(linesMatch).toHaveLength(2);
      expect(linesMatch[1]).toContain("ord-002");

      const reqNoMatch = new NextRequest(
        "http://localhost:3000/trips/export?svc=airport&q=信義區",
      );
      const resNoMatch = await exportHandler(reqNoMatch);
      expect(resNoMatch.status).toBe(200);
      const bodyNoMatch = await resNoMatch.text();
      const linesNoMatch = bodyNoMatch.trim().split("\n");
      expect(linesNoMatch).toHaveLength(1);
    });

    it("overview export handles loader errors with 500 status", async () => {
      mockDrivers.mockRejectedValue(new Error("Fleet service down"));
      mockVehicles.mockRejectedValue(new Error("Fleet service down"));
      mockTrips.mockRejectedValue(new Error("Fleet service down"));
      mockDashboard.mockRejectedValue(new Error("Fleet service down"));

      const req = new NextRequest(
        "http://localhost:3000/trips/export?type=summary",
      );
      const res = await exportHandler(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.message).toBe("Fleet service down");
    });

    it("overview export properly quotes grouped numbers containing commas to preserve column count", async () => {
      mockDrivers.mockResolvedValue([]);
      mockVehicles.mockResolvedValue([]);
      mockTrips.mockResolvedValue([]);
      mockDashboard.mockResolvedValue({
        fleetPartnerId: "fp-test-001",
        periodMonth: "2026-09",
        activeDriverCount: 1250,
        onlineDriverCount: 1100,
        dispatchEligibleDriverCount: 1050,
        totalVehicleCount: 500,
        dispatchableVehicleCount: 480,
        completedTripCount: 14280,
        inFlightTripCount: 30,
        proofPendingTripCount: 5,
        pendingStatementCount: 1,
        latestStatementPeriodMonth: "2026-09",
        grossEarningAmount: { amountMinor: 64200000, currency: "TWD" },
        shareAmount: { amountMinor: 12840000, currency: "TWD" },
      });

      const req = new NextRequest(
        "http://localhost:3000/trips/export?type=summary&period=2026-09",
      );
      const res = await exportHandler(req);
      expect(res.status).toBe(200);

      const body = await res.text();
      const lines = body.trim().split("\n");
      // Header + 7 metric rows = 8 lines
      expect(lines).toHaveLength(8);
      for (const line of lines) {
        // Validate CSV column count using standard CSV split
        const parts = line.match(/(?:^|,)(?:"(?:[^"]|"")*"|[^,]*)/g);
        expect(parts).toHaveLength(4);
      }
      expect(body).toContain('"1,250"');
      expect(body).toContain('"14,280"');
      expect(body).toContain('"NT$ 642,000"');
    });

    it("drivers loader maps dispatchEligible and separates available status from eligibility", async () => {
      mockDrivers.mockResolvedValue([
        {
          driverId: "drv-eligible",
          name: "可接單司機",
          currentVehiclePlateNo: "ABC-1111",
          workState: "available",
          licensesValid: true,
          supportedServiceBuckets: ["standard_taxi"],
          dispatchEligible: true,
        },
        {
          driverId: "drv-ineligible-status-available",
          name: "暫無接單資格司機",
          currentVehiclePlateNo: "XYZ-2222",
          workState: "available",
          licensesValid: false,
          supportedServiceBuckets: ["standard_taxi"],
          dispatchEligible: false,
        },
      ]);

      const driversView = await loadDrivers();
      expect(driversView.rows).toHaveLength(2);
      expect(driversView.rows[0].dispatchEligible).toBe(true);
      expect(driversView.rows[1].dispatchEligible).toBe(false);

      // Verify dashboard uses dispatchEligible
      mockVehicles.mockResolvedValue([]);
      mockTrips.mockResolvedValue([]);
      mockDashboard.mockResolvedValue(null);

      const dashboard = await loadDashboard("2026-09");
      // Even though 2 drivers have workState 'available', only 1 has dispatchEligible: true
      expect(dashboard.dispatchable).toBe("1");
    });

    it("partial failure: drivers API failure preserves driversError, marks driver counts unavailable, and rejects summary export", async () => {
      mockDrivers.mockRejectedValue(new Error("503 Drivers Unavailable"));
      mockTrips.mockResolvedValue([
        {
          orderId: "ord-001",
          driverName: "張駕駛",
          grossEarning: { amountMinor: 120000, currency: "TWD" },
          fleetShareAmount: { amountMinor: 24000, currency: "TWD" },
          status: "completed",
          completedAt: "2026-09-01T10:00:00Z",
          businessDispatchSubtype: "credit_card_airport_transfer",
          pickupAddress: "桃園機場第一航廈",
        },
      ]);
      mockDashboard.mockRejectedValue(new Error("Aggregate unavailable"));

      const dashboard = await loadDashboard("2026-09");
      // Per-source failure tracking
      expect(dashboard.driversError).toBe("503 Drivers Unavailable");
      expect(dashboard.tripsError).toBeNull();
      expect(dashboard.error).toContain("503 Drivers Unavailable");

      // Distinguish unavailable from legitimate zero
      expect(dashboard.driverCount).toBe("—");
      expect(dashboard.driverCount).not.toBe("0");
      expect(dashboard.driverStatusSummary.online).toBe("—");
      expect(dashboard.driverStatusSummary.offline).toBe("—");
      expect(dashboard.dispatchable).toBe("—");
      expect(dashboard.supply).toEqual([]);

      // Trips succeeded and reflect in dashboard
      expect(dashboard.completedTrips).toBe("1");
      expect(dashboard.grossRevenue).toBe("NT$ 1,200");
      expect(dashboard.share).toBe("NT$ 240");

      // Summary export MUST reject partial failure with 500 status rather than accepting 0 drivers
      const req = new NextRequest(
        "http://localhost:3000/trips/export?type=summary",
      );
      const res = await exportHandler(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.message).toContain("503 Drivers Unavailable");
    });

    it("partial failure: trips API failure preserves tripsError, marks trips and revenue unavailable, and rejects summary export", async () => {
      mockDrivers.mockResolvedValue([
        {
          driverId: "drv-01",
          name: "張駕駛",
          workState: "available",
          licensesValid: true,
          supportedServiceBuckets: ["standard_taxi"],
          dispatchEligible: true,
        },
      ]);
      mockTrips.mockRejectedValue(new Error("503 Trips Unavailable"));
      mockDashboard.mockRejectedValue(new Error("Aggregate unavailable"));

      const dashboard = await loadDashboard("2026-09");
      expect(dashboard.driversError).toBeNull();
      expect(dashboard.tripsError).toBe("503 Trips Unavailable");
      expect(dashboard.error).toContain("503 Trips Unavailable");

      // Drivers succeeded
      expect(dashboard.driverCount).toBe("1");
      expect(dashboard.dispatchable).toBe("1");

      // Trips and revenue are unavailable, NOT "0" or "NT$ 0"
      expect(dashboard.completedTrips).toBe("—");
      expect(dashboard.completedTrips).not.toBe("0");
      expect(dashboard.share).toBe("—");
      expect(dashboard.share).not.toBe("NT$ 0");
      expect(dashboard.grossRevenue).toBe("—");
      expect(dashboard.grossRevenue).not.toBe("NT$ 0");

      // Summary export rejects with 500
      const req = new NextRequest(
        "http://localhost:3000/trips/export?type=summary",
      );
      const res = await exportHandler(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.message).toContain("503 Trips Unavailable");
    });

    it("aggregate-only failure with nonzero trips derives revenue from authoritative trip records and exports successfully", async () => {
      mockDrivers.mockResolvedValue([
        {
          driverId: "drv-01",
          name: "張駕駛",
          workState: "available",
          licensesValid: true,
          supportedServiceBuckets: ["standard_taxi"],
          dispatchEligible: true,
        },
      ]);
      mockTrips.mockResolvedValue([
        {
          orderId: "ord-001",
          driverName: "張駕駛",
          grossEarning: { amountMinor: 120000, currency: "TWD" },
          fleetShareAmount: { amountMinor: 24000, currency: "TWD" },
          status: "completed",
          completedAt: "2026-09-01T10:00:00Z",
          businessDispatchSubtype: "credit_card_airport_transfer",
          pickupAddress: "桃園機場第一航廈",
        },
        {
          orderId: "ord-002",
          driverName: "張駕駛",
          grossEarning: { amountMinor: 50000, currency: "TWD" },
          fleetShareAmount: { amountMinor: 10000, currency: "TWD" },
          status: "completed",
          completedAt: "2026-09-02T11:00:00Z",
          businessDispatchSubtype: "standard_taxi",
          pickupAddress: "台北市信義區松仁路",
        },
      ]);
      mockDashboard.mockRejectedValue(new Error("Aggregate endpoint unavailable"));

      const dashboard = await loadDashboard("2026-09");
      // Aggregate error is preserved
      expect(dashboard.aggregateError).toBe("Aggregate endpoint unavailable");
      // But dashboard error is null because revenue is authoritatively derived from live trips
      expect(dashboard.error).toBeNull();
      expect(dashboard.driverCount).toBe("1");
      expect(dashboard.completedTrips).toBe("2");

      // Derived revenue from authoritative trip records: 120,000 + 50,000 = 170,000 minor = NT$ 1,700
      expect(dashboard.grossRevenue).toBe("NT$ 1,700");
      expect(dashboard.grossRevenue).not.toBe("NT$ 0");
      // Derived share: 24,000 + 10,000 = 34,000 minor = NT$ 340
      expect(dashboard.share).toBe("NT$ 340");
      expect(dashboard.share).not.toBe("NT$ 0");

      // Export endpoint exports the derived values as valid data with 200 status
      const req = new NextRequest(
        "http://localhost:3000/trips/export?type=summary&period=2026-09",
      );
      const res = await exportHandler(req);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Fleet Share,NT$ 340");
      expect(body).toContain('Gross Revenue,"NT$ 1,700"');
      expect(body).not.toContain("NT$ 0");
    });

    it("aggregate-only failure with legitimate zero trips returns zero revenue", async () => {
      mockDrivers.mockResolvedValue([]);
      mockTrips.mockResolvedValue([]);
      mockDashboard.mockRejectedValue(new Error("Aggregate endpoint unavailable"));

      const dashboard = await loadDashboard("2026-09");
      expect(dashboard.aggregateError).toBe("Aggregate endpoint unavailable");
      expect(dashboard.error).toBeNull();
      expect(dashboard.driverCount).toBe("0");
      expect(dashboard.completedTrips).toBe("0");
      expect(dashboard.grossRevenue).toBe("NT$ 0");
      expect(dashboard.share).toBe("NT$ 0");

      const req = new NextRequest(
        "http://localhost:3000/trips/export?type=summary&period=2026-09",
      );
      const res = await exportHandler(req);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Active Drivers,0");
      expect(body).toContain("Completed Trips,0");
    });

    it("aggregate and trips failure marks revenue as unavailable and rejects summary export", async () => {
      mockDrivers.mockResolvedValue([]);
      mockTrips.mockRejectedValue(new Error("503 Trips Down"));
      mockDashboard.mockRejectedValue(new Error("503 Dashboard Down"));

      const dashboard = await loadDashboard("2026-09");
      expect(dashboard.tripsError).toBe("503 Trips Down");
      expect(dashboard.aggregateError).toBe("503 Dashboard Down");
      expect(dashboard.error).toContain("503 Trips Down");
      expect(dashboard.share).toBe("—");
      expect(dashboard.share).not.toBe("NT$ 0");
      expect(dashboard.grossRevenue).toBe("—");
      expect(dashboard.grossRevenue).not.toBe("NT$ 0");

      const req = new NextRequest(
        "http://localhost:3000/trips/export?type=summary",
      );
      const res = await exportHandler(req);
      expect(res.status).toBe(500);
    });
  });
});
