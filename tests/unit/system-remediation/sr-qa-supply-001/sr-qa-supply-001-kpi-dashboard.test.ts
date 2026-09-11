import { describe, expect, it, vi, beforeEach } from "vitest";

// SR-QA-SUPPLY-001 — capability C063 (總覽 KPI 與司機／車輛清單一致), verified
// against the current, real loadDashboard()/loadDrivers() implementation
// already shipped on `dev`
// (apps/fleet-partner-portal-web/lib/fleet-portal-data.server.ts). The 9/6
// audit finding was "128／96 與真清單 2／1 不一致，fixture 混用" — this suite
// reproduces that exact shape (a driver-count aggregate vs. the authoritative
// driver list) against the real function with a controlled fake API client,
// the same mocking pattern used by the already-merged
// tests/unit/system-remediation/sr-fleet-case-001 suite.

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: vi.fn(() => ({ value: "zh" })) })),
}));

const mockClient = {
  listFleetPortalDrivers: vi.fn(),
  listFleetPortalDashboard: vi.fn(),
  listFleetPortalTrips: vi.fn(),
};

vi.mock(
  "../../../../apps/fleet-partner-portal-web/lib/api-client.server",
  () => ({
    getServerFleetPartnerClient: vi.fn(async () => ({ client: mockClient })),
  }),
);

function driverRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    affiliationId: `aff-${id}`,
    driverId: id,
    fleetPartnerId: "fleet-qa-kpi-001",
    driverGroupId: null,
    affiliationType: "exclusive",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    name: `Driver ${id}`,
    workState: "available",
    licensesValid: true,
    lifecycleStatus: "active",
    dispatchEligible: true,
    supportedServiceBuckets: ["standard_taxi"],
    currentVehicleId: null,
    currentVehiclePlateNo: null,
    ...overrides,
  };
}

function dashboardAggregate(overrides: Record<string, unknown> = {}) {
  return {
    fleetPartnerId: "fleet-qa-kpi-001",
    periodMonth: "2026-09",
    activeDriverCount: 2,
    onlineDriverCount: 2,
    dispatchEligibleDriverCount: 2,
    totalVehicleCount: 2,
    dispatchableVehicleCount: 2,
    completedTripCount: 0,
    inFlightTripCount: 0,
    proofPendingTripCount: 0,
    pendingStatementCount: 0,
    latestStatementPeriodMonth: null,
    grossEarningAmount: { currency: "TWD", amountMinor: 0 },
    shareAmount: { currency: "TWD", amountMinor: 0 },
    ...overrides,
  };
}

describe("SR-QA-SUPPLY-001 — C063 總覽 KPI 與司機／車輛清單一致", () => {
  beforeEach(() => {
    vi.resetModules();
    mockClient.listFleetPortalDrivers.mockReset();
    mockClient.listFleetPortalDashboard.mockReset();
    mockClient.listFleetPortalTrips.mockReset();
    mockClient.listFleetPortalTrips.mockResolvedValue([]);
  });

  it("when the dashboard aggregate agrees with the authoritative driver list (2 real drivers), the KPI shows 2 — matching the driver list page exactly (正常案例)", async () => {
    const realDrivers = [driverRecord("d1"), driverRecord("d2")];
    mockClient.listFleetPortalDrivers.mockResolvedValue(realDrivers);
    mockClient.listFleetPortalDashboard.mockResolvedValue(
      dashboardAggregate({ activeDriverCount: 2, onlineDriverCount: 2 }),
    );

    const { loadDashboard, loadDrivers } =
      await import("../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server");
    const dashboard = await loadDashboard("2026-09");
    const driversView = await loadDrivers();

    expect(driversView.rows).toHaveLength(2);
    expect(dashboard.driverCount).toBe("2");
    expect(dashboard.driverCount).toBe(String(driversView.rows.length));
  });

  it("REGRESSION RISK (matches the 9/6 audit shape): when the dashboard aggregate endpoint is stale/wrong (reports 128) while the authoritative driver list endpoint correctly returns only 2 real drivers, loadDashboard's KPI currently trusts the aggregate over the list it just fetched — reproducing the exact 128 vs 2 mismatch", async () => {
    const realDrivers = [driverRecord("d1"), driverRecord("d2")];
    mockClient.listFleetPortalDrivers.mockResolvedValue(realDrivers);
    mockClient.listFleetPortalDashboard.mockResolvedValue(
      dashboardAggregate({ activeDriverCount: 128, onlineDriverCount: 96 }),
    );

    const { loadDashboard, loadDrivers } =
      await import("../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server");
    const dashboard = await loadDashboard("2026-09");
    const driversView = await loadDrivers();

    expect(driversView.rows).toHaveLength(2);
    expect(driversView.source).toBe("live");

    // Documented current behavior: fleet-portal-data.server.ts loadDashboard()
    // (see the `driversError === null` branch around the `driverCount =`
    // assignment) prefers `dashboardRecord.activeDriverCount` over the
    // driversView.rows.length it already computed from the same live call in
    // the same function. If the two backend endpoints (aggregate vs. list)
    // ever disagree, the KPI card and the driver list page will disagree too
    // — the exact defect shape from the 9/6 audit ("128／96 與真清單 2／1 不一致").
    // This assertion intentionally documents the CURRENT (still-risky)
    // behavior rather than asserting the desired fix, so a future regression
    // fix will make this specific expectation fail and need updating —
    // recorded as a residual gap in the evidence doc's finding, not silently
    // passed off as "fixed".
    expect(dashboard.driverCount).toBe("128");
    expect(dashboard.driverCount).not.toBe(String(driversView.rows.length));
  });

  it("when the driver list endpoint fails but the aggregate is reachable, the KPI falls back to the aggregate and does not crash (dashboardRecord fallback)", async () => {
    mockClient.listFleetPortalDrivers.mockRejectedValue(
      new Error("READ_FAILED"),
    );
    mockClient.listFleetPortalDashboard.mockResolvedValue(
      dashboardAggregate({ activeDriverCount: 5, onlineDriverCount: 3 }),
    );

    const { loadDashboard } =
      await import("../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server");
    const dashboard = await loadDashboard("2026-09");
    expect(dashboard.driverCount).toBe("5");
  });

  it("when both the driver list and the aggregate are unavailable, the KPI renders '—' (unavailable) rather than fabricating a 0 (負向: 零資料與失敗的區分)", async () => {
    mockClient.listFleetPortalDrivers.mockRejectedValue(
      new Error("READ_FAILED"),
    );
    mockClient.listFleetPortalDashboard.mockRejectedValue(
      new Error("AGGREGATE_READ_FAILED"),
    );

    const { loadDashboard } =
      await import("../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server");
    const dashboard = await loadDashboard("2026-09");
    expect(dashboard.driverCount).toBe("—");
  });

  it("a reachable driver list endpoint returning zero live drivers renders 0, not the '—' unavailable state (legitimate empty vs. failure)", async () => {
    mockClient.listFleetPortalDrivers.mockResolvedValue([]);
    mockClient.listFleetPortalDashboard.mockRejectedValue(
      new Error("AGGREGATE_READ_FAILED"),
    );

    const { loadDashboard, loadDrivers } =
      await import("../../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server");
    const dashboard = await loadDashboard("2026-09");
    const driversView = await loadDrivers();
    expect(driversView.rows).toHaveLength(0);
    expect(driversView.error).toBeNull();
    expect(dashboard.driverCount).toBe("0");
  });
});
