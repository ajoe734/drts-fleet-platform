// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  AttendanceRecord,
  DriverRegistryRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  OwnedOrderRecord,
  ReconciliationIssueRecord,
  SettlementMatrixRecord,
  ShiftRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import AttendancePage from "../../../apps/ops-console-web/app/attendance/page";
import { GET as exportAttendanceGet } from "../../../apps/ops-console-web/app/attendance/export/route";
import RevenuePage from "../../../apps/ops-console-web/app/revenue/page";
import { OpsAttendanceExportButton } from "../../../apps/ops-console-web/components/ops-attendance-filter-export";
import {
  ATTENDANCE_EXPORT_CSV_HEADERS,
  buildAttendanceCanonicalView,
  buildAttendanceExportCsv,
  buildRevenueInsights,
  formatRevenueBilledLabel,
  resolveAttendanceFilters,
  resolveRevenueFilters,
} from "../../../apps/ops-console-web/lib/ops-analytics";

const mockServerClient = vi.hoisted(() => ({
  listShifts: vi.fn(),
  listAttendance: vi.fn(),
  listDrivers: vi.fn(),
  listOrders: vi.fn(),
  listDriverTasks: vi.fn(),
  listDriverStatements: vi.fn(),
  listVehicles: vi.fn(),
  listForwarderOrders: vi.fn(),
  listSettlementMatrix: vi.fn(),
  listForwarderReconciliationIssues: vi.fn(),
  listReconciliationIssues: vi.fn(),
}));

const mockGetServerLocale = vi.hoisted(() => vi.fn(async () => "en" as const));

vi.mock("../../../apps/ops-console-web/lib/api-client.server", () => ({
  getServerOpsClient: vi.fn(async () => mockServerClient),
}));

vi.mock("../../../apps/ops-console-web/lib/server-locale", () => ({
  getServerLocale: () => mockGetServerLocale(),
}));

vi.mock("../../../apps/ops-console-web/components/ops-assistant", () => ({
  PublishAssistantScope: ({
    activeTab,
    visibleFilters,
  }: {
    activeTab?: string;
    visibleFilters?: Record<string, unknown>;
  }) => (
    <div
      data-testid="assistant-scope"
      data-active-tab={activeTab ?? ""}
      data-visible-filters={JSON.stringify(visibleFilters ?? {})}
    />
  ),
}));

vi.mock(
  "../../../apps/ops-console-web/components/revenue-auto-refresh",
  () => ({
    RevenueAutoRefresh: ({ tier }: { tier: string }) => (
      <div data-testid="revenue-auto-refresh" data-tier={tier} />
    ),
  }),
);

const FIXED_NOW_ISO = "2026-10-15T12:00:00.000Z";

function makeDriver(
  overrides: Partial<DriverRegistryRecord> & {
    driverId: string;
    name: string;
  },
): DriverRegistryRecord {
  return {
    driverId: overrides.driverId,
    name: overrides.name,
    phone: overrides.phone ?? "0912-345-678",
    licenseNumber: overrides.licenseNumber ?? "LIC-SECRET-999",
    licenseClass: "professional",
    licenseExpiry: "2028-12-31",
    status: "active",
    workState: "on_shift",
    assignedVehicleId: overrides.assignedVehicleId ?? "VEH-A",
    rating: 4.9,
    completedTrips: 120,
    joinedAt: "2025-01-01T00:00:00.000Z",
    updatedAt: FIXED_NOW_ISO,
  };
}

function makeVehicle(vehicleId: string): VehicleRegistryRecord {
  return {
    vehicleId,
    plateNumber: `TPE-${vehicleId}`,
    makeModel: "Toyota RAV4 Hybrid",
    serviceBucket: "standard_taxi",
    seatCapacity: 4,
    wheelchairAccessible: false,
    status: "active",
    dispatchableFlag: true,
    exclusivityApproved: true,
    insuranceStatus: "valid",
    insuranceExpiry: "2027-12-31",
    inspectionExpiry: "2027-06-30",
    assignedDriverId: "DRV-A",
    mileageKm: 42000,
    updatedAt: FIXED_NOW_ISO,
  };
}

function makeOrder(
  overrides: Partial<OwnedOrderRecord> & {
    orderId: string;
    serviceBucket: OwnedOrderRecord["serviceBucket"];
  },
): OwnedOrderRecord {
  return {
    orderId: overrides.orderId,
    tenantId: overrides.tenantId ?? null,
    partnerId: overrides.partnerId ?? null,
    passengerId: overrides.passengerId ?? "PAX-1",
    passengerName: overrides.passengerName ?? "Alex Chen",
    passengerPhone: overrides.passengerPhone ?? "0900-000-001",
    serviceBucket: overrides.serviceBucket,
    businessDispatchSubtype: overrides.businessDispatchSubtype ?? null,
    orderSource: overrides.orderSource ?? "app",
    status: overrides.status ?? "completed",
    pickupAddress: overrides.pickupAddress ?? "Taipei Main Station",
    dropoffAddress: overrides.dropoffAddress ?? "Songshan Airport",
    scheduledAt: overrides.scheduledAt ?? null,
    quotedFare:
      "quotedFare" in overrides
        ? (overrides.quotedFare ?? null)
        : { amountMinor: 30000, currency: "TWD" },
    assignedDriverId: overrides.assignedDriverId ?? "DRV-A",
    assignedVehicleId: overrides.assignedVehicleId ?? "VEH-A",
    createdAt: overrides.createdAt ?? "2026-10-15T08:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-10-15T08:30:00.000Z",
  };
}

function makeTask(
  overrides: Partial<DriverTaskRecord> & {
    taskId: string;
    orderId: string;
    driverId: string;
    vehicleId: string;
  },
): DriverTaskRecord {
  return {
    taskId: overrides.taskId,
    orderId: overrides.orderId,
    driverId: overrides.driverId,
    vehicleId: overrides.vehicleId,
    serviceBucket: overrides.serviceBucket ?? "standard_taxi",
    status: overrides.status ?? "completed",
    pickupAddress: "Taipei Main Station",
    dropoffAddress: "Songshan Airport",
    fare:
      "fare" in overrides
        ? (overrides.fare ?? null)
        : { amountMinor: 35000, currency: "TWD" },
    assignedAt: overrides.assignedAt ?? "2026-10-15T08:05:00.000Z",
    acceptedAt: overrides.acceptedAt ?? "2026-10-15T08:06:00.000Z",
    completedAt: overrides.completedAt ?? "2026-10-15T08:30:00.000Z",
    proofSubmitted: true,
  };
}

function makeShift(
  overrides: Partial<ShiftRecord> & {
    shiftId: string;
    driverId: string;
    clockedInAt: string;
  },
): ShiftRecord {
  return {
    shiftId: overrides.shiftId,
    driverId: overrides.driverId,
    vehicleId: "vehicleId" in overrides ? (overrides.vehicleId ?? null) : "VEH-A",
    status: overrides.status ?? "completed",
    clockedInAt: overrides.clockedInAt,
    clockedOutAt:
      "clockedOutAt" in overrides
        ? (overrides.clockedOutAt ?? null)
        : "2026-10-15T08:00:00.000Z",
    startLocation: overrides.startLocation ?? "Neihu Depot",
    endLocation:
      "endLocation" in overrides ? (overrides.endLocation ?? null) : "Songshan Hub",
    notes: overrides.notes ?? null,
  };
}

function makeAttendance(
  overrides: Partial<AttendanceRecord> & {
    attendanceId: string;
    driverId: string;
    date: string;
  },
): AttendanceRecord {
  return {
    attendanceId: overrides.attendanceId,
    driverId: overrides.driverId,
    shiftId: "shiftId" in overrides ? (overrides.shiftId ?? null) : null,
    date: overrides.date,
    status: overrides.status ?? "present",
    clockedInAt:
      "clockedInAt" in overrides
        ? (overrides.clockedInAt ?? null)
        : `${overrides.date}T00:00:00.000Z`,
    clockedOutAt:
      "clockedOutAt" in overrides
        ? (overrides.clockedOutAt ?? null)
        : `${overrides.date}T08:00:00.000Z`,
    totalHours:
      typeof overrides.totalHours === "number" ? overrides.totalHours : 8,
  };
}

beforeEach(() => {
  vi.setSystemTime(new Date(FIXED_NOW_ISO));
  mockGetServerLocale.mockResolvedValue("en");
  mockServerClient.listShifts.mockReset();
  mockServerClient.listAttendance.mockReset();
  mockServerClient.listDrivers.mockReset();
  mockServerClient.listOrders.mockReset();
  mockServerClient.listDriverTasks.mockReset();
  mockServerClient.listDriverStatements.mockReset();
  mockServerClient.listVehicles.mockReset();
  mockServerClient.listForwarderOrders.mockReset();
  mockServerClient.listSettlementMatrix.mockReset();
  mockServerClient.listForwarderReconciliationIssues.mockReset();
  mockServerClient.listReconciliationIssues.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OPS-ATTENDANCE-REVENUE-CANONICAL-FLOW-20261015", () => {
  describe("C042-F1: Revenue canonical period/serviceBucket/vehicleId consistency & period label", () => {
    const controlledOrders: OwnedOrderRecord[] = [
      // Row A: standard_taxi, VEH-A, owned (no partnerId), platform channel
      makeOrder({
        orderId: "ORD-A",
        serviceBucket: "standard_taxi",
        partnerId: null,
        orderSource: "app",
        quotedFare: { amountMinor: 30000, currency: "TWD" },
        assignedVehicleId: "VEH-A",
        updatedAt: "2026-10-15T09:00:00.000Z",
      }),
      // Duplicate of Row A to verify deduplication
      makeOrder({
        orderId: "ORD-A",
        serviceBucket: "standard_taxi",
        partnerId: null,
        orderSource: "app",
        quotedFare: { amountMinor: 30000, currency: "TWD" },
        assignedVehicleId: "VEH-A",
        updatedAt: "2026-10-15T09:00:00.000Z",
      }),
      // Row B: business_dispatch, VEH-B, partner order
      makeOrder({
        orderId: "ORD-B",
        serviceBucket: "business_dispatch",
        partnerId: "PARTNER-AIRPORT",
        orderSource: "partner_api",
        quotedFare: { amountMinor: 80000, currency: "TWD" },
        assignedVehicleId: "VEH-B",
        updatedAt: "2026-10-15T10:00:00.000Z",
      }),
      // Row C: current-month order from 2026-10-03 (inside current month & 30d, outside 7d)
      makeOrder({
        orderId: "ORD-OCT-EARLY",
        serviceBucket: "standard_taxi",
        partnerId: null,
        orderSource: "phone",
        quotedFare: { amountMinor: 50000, currency: "TWD" },
        assignedVehicleId: "VEH-A",
        createdAt: "2026-10-03T10:00:00.000Z",
        updatedAt: "2026-10-03T10:30:00.000Z",
      }),
      // Row Z: legitimate numeric 0 actual fare (complimentary/waived trip) with non-zero quotedFare
      makeOrder({
        orderId: "ORD-ZERO",
        serviceBucket: "standard_taxi",
        partnerId: null,
        orderSource: "app",
        quotedFare: { amountMinor: 45000, currency: "TWD" },
        assignedVehicleId: "VEH-A",
        updatedAt: "2026-10-15T11:00:00.000Z",
      }),
    ];

    const controlledTasks: DriverTaskRecord[] = [
      makeTask({
        taskId: "TASK-A",
        orderId: "ORD-A",
        driverId: "DRV-A",
        vehicleId: "VEH-A",
        serviceBucket: "standard_taxi",
        fare: { amountMinor: 35000, currency: "TWD" },
        completedAt: "2026-10-15T09:00:00.000Z",
      }),
      // Duplicate task record for ORD-A
      makeTask({
        taskId: "TASK-A-DUP",
        orderId: "ORD-A",
        driverId: "DRV-A",
        vehicleId: "VEH-A",
        serviceBucket: "standard_taxi",
        fare: { amountMinor: 35000, currency: "TWD" },
        completedAt: "2026-10-15T09:00:00.000Z",
      }),
      makeTask({
        taskId: "TASK-B",
        orderId: "ORD-B",
        driverId: "DRV-B",
        vehicleId: "VEH-B",
        serviceBucket: "business_dispatch",
        fare: { amountMinor: 85000, currency: "TWD" },
        completedAt: "2026-10-15T10:00:00.000Z",
      }),
      makeTask({
        taskId: "TASK-OCT-EARLY",
        orderId: "ORD-OCT-EARLY",
        driverId: "DRV-A",
        vehicleId: "VEH-A",
        serviceBucket: "standard_taxi",
        fare: { amountMinor: 52000, currency: "TWD" },
        completedAt: "2026-10-03T10:30:00.000Z",
      }),
      makeTask({
        taskId: "TASK-ZERO",
        orderId: "ORD-ZERO",
        driverId: "DRV-A",
        vehicleId: "VEH-A",
        serviceBucket: "standard_taxi",
        fare: { amountMinor: 0, currency: "TWD" },
        completedAt: "2026-10-15T11:00:00.000Z",
      }),
    ];

    const controlledStatements: DriverStatementRecord[] = [
      {
        statementId: "STMT-2026-10-DRV-A",
        driverId: "DRV-A",
        period: "2026-10",
        grossAmount: { amountMinor: 900000, currency: "TWD" },
        deductionsAmount: { amountMinor: 100000, currency: "TWD" },
        netAmount: { amountMinor: 800000, currency: "TWD" },
        payoutStatus: "pending",
        generatedAt: FIXED_NOW_ISO,
      },
    ];

    it("unifies totalRevenueMinor, completedTrips, ownedTrips, serviceBuckets, vehicles, and channels on the exact filtered population while preserving numeric 0 actual fare", () => {
      const refDate = new Date(FIXED_NOW_ISO);

      // Filter to 7d + standard_taxi + VEH-A -> includes TASK-A (35000) and TASK-ZERO (0), excludes TASK-B (business_dispatch, VEH-B) and TASK-OCT-EARLY (12 days ago)
      const filtered = buildRevenueInsights(
        controlledOrders,
        controlledTasks,
        controlledStatements,
        {
          period: "7d",
          serviceBucket: "standard_taxi",
          vehicleId: "VEH-A",
        },
        refDate,
      );

      expect(filtered.completedTrips).toBe(2);
      expect(filtered.ownedTrips).toBe(2);
      expect(filtered.partnerTrips).toBe(0);
      // 35000 + 0 = 35000 (TASK-ZERO must NOT fall back to 45000 quotedFare!)
      expect(filtered.totalRevenueMinor).toBe(35000);
      expect(filtered.serviceBuckets).toEqual([
        {
          key: "standard_taxi",
          label: "standard taxi",
          trips: 2,
          revenueMinor: 35000,
          averageMinor: 17500,
        },
      ]);
      expect(filtered.vehicles).toEqual([
        {
          key: "VEH-A",
          label: "VEH-A",
          trips: 2,
          revenueMinor: 35000,
          averageMinor: 17500,
        },
      ]);
      expect(filtered.channels).toEqual([
        {
          key: "platform",
          label: "platform",
          trips: 2,
          revenueMinor: 35000,
          averageMinor: 17500,
        },
      ]);
      // Statement net minor remains unprorated independent canonical statement reference
      expect(filtered.statementNetMinor).toBe(800000);

      // Expand to 30d + all buckets + all vehicles -> includes TASK-A (35000), TASK-B (85000), TASK-OCT-EARLY (52000), TASK-ZERO (0)
      const all30d = buildRevenueInsights(
        controlledOrders,
        controlledTasks,
        controlledStatements,
        {
          period: "30d",
          serviceBucket: "all",
          vehicleId: "all",
        },
        refDate,
      );
      expect(all30d.completedTrips).toBe(4);
      expect(all30d.ownedTrips).toBe(3);
      expect(all30d.partnerTrips).toBe(1);
      expect(all30d.totalRevenueMinor).toBe(35000 + 85000 + 52000 + 0);

      const channelTripsSum = all30d.channels.reduce(
        (sum, row) => sum + row.trips,
        0,
      );
      const channelRevSum = all30d.channels.reduce(
        (sum, row) => sum + row.revenueMinor,
        0,
      );
      expect(channelTripsSum).toBe(all30d.completedTrips);
      expect(channelRevSum).toBe(all30d.totalRevenueMinor);
    });

    it("renders mounted /revenue with consistent KPI, Insight, and Channel mix numbers plus selected-period Billed label instead of hardcoded (MTD)", async () => {
      mockServerClient.listOrders.mockResolvedValue(controlledOrders);
      mockServerClient.listDriverTasks.mockResolvedValue(controlledTasks);
      mockServerClient.listDriverStatements.mockResolvedValue(
        controlledStatements,
      );
      mockServerClient.listVehicles.mockResolvedValue([
        makeVehicle("VEH-A"),
        makeVehicle("VEH-B"),
      ]);
      mockServerClient.listForwarderOrders.mockResolvedValue(
        [] as ForwardedOrderRecord[],
      );
      mockServerClient.listSettlementMatrix.mockResolvedValue([
        {
          channelKey: "tenant_enterprise",
          orderDomain: "owned",
          orderSources: ["enterprise_portal"],
          payerType: "enterprise_monthly",
          sponsorType: "tenant",
          invoiceOwner: "platform",
          receiptOwner: "platform",
          reconciliationPath: "enterprise_statement",
          driverPayoutAuthority: "platform_settlement",
          discountFundingSource: "contract_rate",
          reimbursementRule: "full_fare",
          localLedgerMode: "full_service",
          updatedAt: FIXED_NOW_ISO,
        },
      ] satisfies SettlementMatrixRecord[]);
      mockServerClient.listForwarderReconciliationIssues.mockResolvedValue(
        [] as ForwarderReconciliationIssue[],
      );
      mockServerClient.listReconciliationIssues.mockResolvedValue(
        [] as ReconciliationIssueRecord[],
      );

      // 1. Render Channel mix with serviceBucket=business_dispatch & vehicleId=VEH-B & period=today
      const channelElement = await RevenuePage({
        searchParams: Promise.resolve({
          tab: "channel",
          period: "today",
          serviceBucket: "business_dispatch",
          vehicleId: "VEH-B",
        }),
      });
      const { unmount: unmountChannel } = render(channelElement);

      // Period label must reflect "Billed (Today)" and NOT "Billed (MTD)"
      expect(screen.getByText("Billed (Today)")).toBeTruthy();
      expect(screen.queryByText("Billed (MTD)")).toBeNull();
      // Owned share must be 0 / 1 (0%) because VEH-B's only trip is partner trip ORD-B
      expect(screen.getByText("0 / 1")).toBeTruthy();
      // Actual fare of TASK-B is NT$850 (85000 minor), appearing in both Billed KPI and Channel mix row
      expect(screen.getAllByText("$850").length).toBeGreaterThanOrEqual(2);
      // Phase 1 export button remains disabled per approved packet
      const exportBtn = screen.getByRole("button", { name: /Export/i });
      expect((exportBtn as HTMLButtonElement).disabled).toBe(true);
      unmountChannel();

      // 2. Render Insight tab with the exact same filter scope and verify identical totals
      const insightElement = await RevenuePage({
        searchParams: Promise.resolve({
          tab: "insight",
          period: "today",
          serviceBucket: "business_dispatch",
          vehicleId: "VEH-B",
        }),
      });
      const { unmount: unmountInsight } = render(insightElement);
      expect(screen.getByText("Billed (Today)")).toBeTruthy();
      expect(screen.getByText("0 / 1")).toBeTruthy();
      expect(screen.getAllByText("$850").length).toBeGreaterThanOrEqual(3);
      unmountInsight();

      // 3. Render with foreign vehicleId=VEH-FOREIGN-999 -> filtered_empty in both Insight and Channel mix, and chip reflected
      const foreignElement = await RevenuePage({
        searchParams: Promise.resolve({
          tab: "channel",
          period: "7d",
          vehicleId: "VEH-FOREIGN-999",
        }),
      });
      render(foreignElement);
      expect(screen.getByText("Billed (Last 7 days)")).toBeTruthy();
      expect(screen.getByText("0 / 0")).toBeTruthy();
      expect(screen.getByText("VEH-FOREIGN-999")).toBeTruthy();
      const emptyStatus = screen.getByRole("status");
      expect(emptyStatus.getAttribute("data-empty-reason")).toBe(
        "filtered_empty",
      );
    });

    it("normalizes valid, invalid, and missing revenue filters and formats localized period labels", () => {
      expect(
        resolveRevenueFilters({
          period: "invalid_period",
          serviceBucket: "unknown_bucket",
          vehicleId: "   ",
        }),
      ).toEqual({
        period: "7d",
        serviceBucket: "all",
        vehicleId: "all",
      });

      expect(
        formatRevenueBilledLabel("當期 billed (MTD)", "近 7 天"),
      ).toBe("當期 billed (近 7 天)");
      expect(
        formatRevenueBilledLabel("Billed (MTD)", "Last 30 days"),
      ).toBe("Billed (Last 30 days)");
    });
  });

  describe("C042-K1 & C042-K2: Attendance canonical filter flow, same-ID drilldown, and authorized CSV export", () => {
    const drivers: DriverRegistryRecord[] = [
      makeDriver({
        driverId: "DRV-A",
        name: "Lin Wei",
        phone: "0911-222-333",
        licenseNumber: "SECRET-LIC-A",
      }),
      makeDriver({
        driverId: "DRV-B",
        name: "Chen Mei",
        phone: "0922-333-444",
        licenseNumber: "SECRET-LIC-B",
      }),
      makeDriver({
        driverId: "DRV-C",
        name: "Huang Kai",
        phone: "0933-444-555",
        licenseNumber: "SECRET-LIC-C",
      }),
    ];

    // Controlled canonical rows at boundary times:
    // - SHIFT-A at exact 2026-10-15T00:00:00.000Z UTC boundary (included in 2026-10-15)
    // - SHIFT-B on 2026-10-15 with partial attendance (anomalous)
    // - ATT-C on 2026-10-15 with absent status & shiftId: null & totalHours: 0 (anomalous, zero hours)
    // - SHIFT-PREV ending at 2026-10-14T23:59:59.999Z (1ms before 2026-10-15 start, excluded from 2026-10-15 today, included in week)
    const shifts: ShiftRecord[] = [
      makeShift({
        shiftId: "SHIFT-A",
        driverId: "DRV-A",
        vehicleId: "VEH-A",
        status: "completed",
        clockedInAt: "2026-10-15T00:00:00.000Z",
        clockedOutAt: "2026-10-15T08:00:00.000Z",
        startLocation: "Taipei Depot",
        endLocation: "Xinyi Hub",
      }),
      // Duplicate of SHIFT-A to verify deduplication
      makeShift({
        shiftId: "SHIFT-A",
        driverId: "DRV-A",
        vehicleId: "VEH-A",
        status: "completed",
        clockedInAt: "2026-10-15T00:00:00.000Z",
        clockedOutAt: "2026-10-15T08:00:00.000Z",
      }),
      makeShift({
        shiftId: "SHIFT-B",
        driverId: "DRV-B",
        vehicleId: "VEH-B",
        status: "completed",
        clockedInAt: "2026-10-15T09:00:00.000Z",
        clockedOutAt: "2026-10-15T12:30:00.000Z",
        startLocation: "Banqiao Hub",
        endLocation: "Nangang Station",
      }),
      makeShift({
        shiftId: "SHIFT-PREV",
        driverId: "DRV-A",
        vehicleId: "VEH-A",
        status: "abandoned",
        clockedInAt: "2026-10-14T18:00:00.000Z",
        clockedOutAt: "2026-10-14T23:59:59.999Z",
        startLocation: "Songshan Depot",
        endLocation: null,
      }),
    ];

    const attendanceRecords: AttendanceRecord[] = [
      makeAttendance({
        attendanceId: "ATT-A",
        shiftId: "SHIFT-A",
        driverId: "DRV-A",
        date: "2026-10-15",
        status: "present",
        clockedInAt: "2026-10-15T00:00:00.000Z",
        clockedOutAt: "2026-10-15T08:00:00.000Z",
        totalHours: 8,
      }),
      makeAttendance({
        attendanceId: "ATT-B",
        shiftId: "SHIFT-B",
        driverId: "DRV-B",
        date: "2026-10-15",
        status: "partial",
        clockedInAt: "2026-10-15T09:00:00.000Z",
        clockedOutAt: "2026-10-15T12:30:00.000Z",
        totalHours: 3.5,
      }),
      makeAttendance({
        attendanceId: "ATT-C",
        shiftId: null,
        driverId: "DRV-C",
        date: "2026-10-15",
        status: "absent",
        clockedInAt: null,
        clockedOutAt: null,
        totalHours: 0,
      }),
      makeAttendance({
        attendanceId: "ATT-PREV",
        shiftId: "SHIFT-PREV",
        driverId: "DRV-A",
        date: "2026-10-14",
        status: "partial",
        clockedInAt: "2026-10-14T18:00:00.000Z",
        clockedOutAt: "2026-10-14T23:59:59.999Z",
        totalHours: 6,
      }),
    ];

    it("resolves valid, invalid, foreign, and missing attendance filters and enforces UTC boundary semantics", () => {
      const refDate = new Date(FIXED_NOW_ISO);

      // Invalid calendar date (2026-02-30) and invalid anomaly ("bogus") normalize safely
      const normalized = resolveAttendanceFilters(
        {
          view: "unknown_view",
          date: "2026-02-30",
          driverId: "  ",
          anomaly: "bogus",
        },
        refDate,
      );
      expect(normalized).toEqual({
        view: "today",
        date: null,
        effectiveDate: "2026-10-15",
        driverId: "all",
        anomaly: "all",
      });

      // Today (2026-10-15) includes SHIFT-A (at 00:00:00.000Z), SHIFT-B, and ATT-C, and excludes SHIFT-PREV (ended at 2026-10-14T23:59:59.999Z)
      const todayView = buildAttendanceCanonicalView({
        shifts,
        attendanceRecords,
        drivers,
        filters: normalized,
        reference: refDate,
      });
      expect(todayView.filteredRows.map((r) => r.rowKey)).toEqual([
        "SHIFT-B",
        "SHIFT-A",
        "ATT-C",
      ]);

      // Week view includes 2026-10-14 SHIFT-PREV as well
      const weekView = buildAttendanceCanonicalView({
        shifts,
        attendanceRecords,
        drivers,
        filters: resolveAttendanceFilters({ view: "week" }, refDate),
        reference: refDate,
      });
      expect(weekView.filteredRows.map((r) => r.rowKey)).toEqual([
        "SHIFT-B",
        "SHIFT-A",
        "ATT-C",
        "SHIFT-PREV",
      ]);

      // Specific date=2026-10-14 + anomaly=abandoned
      const prevDateView = buildAttendanceCanonicalView({
        shifts,
        attendanceRecords,
        drivers,
        filters: resolveAttendanceFilters(
          { date: "2026-10-14", anomaly: "abandoned" },
          refDate,
        ),
        reference: refDate,
      });
      expect(prevDateView.filteredRows.map((r) => r.rowKey)).toEqual([
        "SHIFT-PREV",
      ]);
    });

    it("mounts /attendance with date/driver/anomaly controls, canonical API query pushdown, same-ID driver/vehicle drilldown links, and export href", async () => {
      mockServerClient.listShifts.mockResolvedValue([shifts[2]!]);
      mockServerClient.listAttendance.mockResolvedValue([
        attendanceRecords[1]!,
      ]);
      mockServerClient.listDrivers.mockResolvedValue(drivers);

      const pageElement = await AttendancePage({
        searchParams: Promise.resolve({
          date: "2026-10-15",
          driverId: "DRV-B",
          anomaly: "partial",
        }),
      });
      render(pageElement);

      // Verify canonical API calls pushed down driverId="DRV-B"
      expect(mockServerClient.listShifts).toHaveBeenCalledWith("DRV-B");
      expect(mockServerClient.listAttendance).toHaveBeenCalledWith("DRV-B");
      expect(mockServerClient.listDrivers).toHaveBeenCalledWith();

      // Verify filter controls reflect active URL parameters
      expect(
        (screen.getByTestId("attendance-filter-date") as HTMLInputElement)
          .value,
      ).toBe("2026-10-15");
      expect(
        (screen.getByTestId("attendance-filter-driver") as HTMLSelectElement)
          .value,
      ).toBe("DRV-B");
      expect(
        (screen.getByTestId("attendance-filter-anomaly") as HTMLSelectElement)
          .value,
      ).toBe("partial");

      // Verify same-ID drilldown links in Gantt and table
      const ganttDriverLink = screen.getByTestId("gantt-driver-link-SHIFT-B");
      expect(ganttDriverLink.getAttribute("href")).toBe("/drivers/DRV-B");

      const tableDriverLink = screen.getByTestId(
        "attendance-driver-link-SHIFT-B",
      );
      expect(tableDriverLink.getAttribute("href")).toBe("/drivers/DRV-B");

      const tableVehicleLink = screen.getByTestId(
        "attendance-vehicle-link-SHIFT-B",
      );
      expect(tableVehicleLink.getAttribute("href")).toBe("/vehicles/VEH-B");

      // Verify Export button href carries the exact filter scope
      const exportTrigger = screen.getByTestId("attendance-export-trigger");
      expect(exportTrigger.getAttribute("href")).toBe(
        "/attendance/export?date=2026-10-15&driverId=DRV-B&anomaly=partial",
      );
    });

    it("exports filtered canonical CSV via GET /attendance/export with exact visible IDs, numeric 0 hours preserved, and no hidden PII", async () => {
      mockServerClient.listShifts.mockResolvedValue(shifts);
      mockServerClient.listAttendance.mockResolvedValue(attendanceRecords);
      mockServerClient.listDrivers.mockResolvedValue(drivers);

      const request = new Request(
        "http://localhost/attendance/export?date=2026-10-15&anomaly=anomalous",
      );
      const response = await exportAttendanceGet(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(response.headers.get("content-disposition")).toContain(
        'filename="attendance-today-2026-10-15-anomalous.csv"',
      );
      expect(response.headers.get("x-attendance-row-count")).toBe("2");

      const csv = await response.text();
      const lines = csv.trim().split("\n");
      expect(lines[0]).toBe(ATTENDANCE_EXPORT_CSV_HEADERS.join(","));
      expect(lines).toHaveLength(3); // Header + SHIFT-B (partial) + ATT-C (absent, 0 hours)

      // Includes SHIFT-B (DRV-B, VEH-B, partial, 3.5 hrs) and ATT-C (DRV-C, absent, 0 hrs)
      expect(csv).toContain(
        "SHIFT-B,ATT-B,2026-10-15,DRV-B,Chen Mei,VEH-B,completed,partial,partial,2026-10-15T09:00:00.000Z,2026-10-15T12:30:00.000Z,3.5,Banqiao Hub,Nangang Station",
      );
      expect(csv).toContain(
        ",ATT-C,2026-10-15,DRV-C,Huang Kai,,,absent,absent,,,0,,",
      );
      // Excludes non-anomalous SHIFT-A and previous-day SHIFT-PREV
      expect(csv).not.toContain("SHIFT-A");
      expect(csv).not.toContain("SHIFT-PREV");
      // Never leaks hidden PII (driver phone or license number)
      expect(csv).not.toContain("0911-222-333");
      expect(csv).not.toContain("0922-333-444");
      expect(csv).not.toContain("SECRET-LIC");
    });

    it("drives interactive OpsAttendanceExportButton download on 200 and surfaces truthful error alert on 403/502", async () => {
      mockServerClient.listShifts.mockResolvedValue([shifts[2]!]);
      mockServerClient.listAttendance.mockResolvedValue([
        attendanceRecords[1]!,
      ]);
      mockServerClient.listDrivers.mockResolvedValue(drivers);

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input) => {
          const url = typeof input === "string" ? input : input.toString();
          return exportAttendanceGet(new Request(`http://localhost${url}`));
        });

      const { unmount } = render(
        <OpsAttendanceExportButton
          exportHref="/attendance/export?date=2026-10-15&driverId=DRV-B&anomaly=partial"
          label="Export"
        />,
      );

      fireEvent.click(screen.getByTestId("attendance-export-trigger"));

      await waitFor(() => {
        const statusNode = screen.getByTestId("attendance-export-status");
        expect(statusNode.getAttribute("data-export-filename")).toBe(
          "attendance-today-2026-10-15-DRV-B-partial.csv",
        );
        expect(statusNode.getAttribute("data-export-rows")).toBe("1");
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      unmount();

      // Now simulate upstream 403 permission_denied failure on /attendance/export
      mockServerClient.listShifts.mockRejectedValueOnce(
        Object.assign(new Error("403 Forbidden: tenant scope mismatch"), {
          status: 403,
        }),
      );

      render(
        <OpsAttendanceExportButton
          exportHref="/attendance/export?date=2026-10-15"
          label="Export"
        />,
      );

      fireEvent.click(screen.getByTestId("attendance-export-trigger"));

      const alertNode = await screen.findByTestId("attendance-export-error");
      expect(alertNode.textContent).toContain(
        "403 Forbidden: tenant scope mismatch",
      );
      expect(screen.queryByTestId("attendance-export-status")).toBeNull();
    });

    it("distinguishes not_provisioned, no_data, filtered_empty, fetch_failed, and permission_denied on /attendance", async () => {
      // 1. not_provisioned (0 drivers, 0 shifts, 0 attendance in default view)
      mockServerClient.listShifts.mockResolvedValueOnce([]);
      mockServerClient.listAttendance.mockResolvedValueOnce([]);
      mockServerClient.listDrivers.mockResolvedValueOnce([]);
      const { unmount: u1 } = render(await AttendancePage({}));
      expect(
        screen.getByRole("status").getAttribute("data-empty-reason"),
      ).toBe("not_provisioned");
      u1();

      // 2. no_data (drivers exist, 0 shifts/attendance in default view)
      mockServerClient.listShifts.mockResolvedValueOnce([]);
      mockServerClient.listAttendance.mockResolvedValueOnce([]);
      mockServerClient.listDrivers.mockResolvedValueOnce(drivers);
      const { unmount: u2 } = render(await AttendancePage({}));
      expect(
        screen.getByRole("status").getAttribute("data-empty-reason"),
      ).toBe("no_data");
      u2();

      // 3. filtered_empty (foreign driverId with 0 matching rows)
      mockServerClient.listShifts.mockResolvedValueOnce([]);
      mockServerClient.listAttendance.mockResolvedValueOnce([]);
      mockServerClient.listDrivers.mockResolvedValueOnce(drivers);
      const { unmount: u3 } = render(
        await AttendancePage({
          searchParams: Promise.resolve({ driverId: "DRV-FOREIGN-404" }),
        }),
      );
      expect(
        screen.getByRole("status").getAttribute("data-empty-reason"),
      ).toBe("filtered_empty");
      expect(
        (screen.getByTestId("attendance-filter-driver") as HTMLSelectElement)
          .value,
      ).toBe("DRV-FOREIGN-404");
      u3();

      // 4. permission_denied (403 error from upstream)
      mockServerClient.listShifts.mockRejectedValueOnce(
        new Error("403 permission_denied"),
      );
      mockServerClient.listAttendance.mockResolvedValueOnce([]);
      mockServerClient.listDrivers.mockResolvedValueOnce([]);
      const { unmount: u4 } = render(await AttendancePage({}));
      expect(
        screen.getByRole("status").getAttribute("data-empty-reason"),
      ).toBe("permission_denied");
      expect(
        screen
          .getByTestId("attendance-export-trigger")
          .getAttribute("aria-disabled"),
      ).toBe("true");
      u4();

      // 5. fetch_failed (500 upstream error)
      mockServerClient.listShifts.mockRejectedValueOnce(
        new Error("Upstream shift service unavailable"),
      );
      mockServerClient.listAttendance.mockResolvedValueOnce([]);
      mockServerClient.listDrivers.mockResolvedValueOnce([]);
      const { unmount: u5 } = render(await AttendancePage({}));
      expect(
        screen.getByRole("status").getAttribute("data-empty-reason"),
      ).toBe("fetch_failed");
      expect(
        screen.getByText("Upstream shift service unavailable"),
      ).toBeTruthy();
      u5();
    });

    it("neutralizes formula-injection prefixes and escapes special characters in buildAttendanceExportCsv", () => {
      const csv = buildAttendanceExportCsv([
        {
          rowKey: "SHIFT-INJ",
          shiftId: "SHIFT-INJ",
          attendanceId: "ATT-INJ",
          date: "2026-10-15",
          driverId: "DRV-A",
          driverName: '=CMD|" /C calc"!A0, "Quoted"',
          vehicleId: "VEH-A",
          shiftStatus: "completed",
          attendanceStatus: "present",
          clockedInAt: "2026-10-15T00:00:00.000Z",
          clockedOutAt: "2026-10-15T08:00:00.000Z",
          totalHours: 0,
          startLocation: "Main, Gate",
          endLocation: null,
          isAnomalous: false,
          anomalyReason: null,
        },
      ]);
      expect(csv).toContain(`"'=CMD|"" /C calc""!A0, ""Quoted"""`);
      expect(csv).toContain(`"Main, Gate"`);
    });
  });
});
