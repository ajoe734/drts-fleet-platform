import { describe, expect, it } from "vitest";
import type {
  DriverStatementRecord,
  OwnedOrderRecord,
  UnifiedDriverTaskView,
} from "@drts/contracts";

import {
  buildGroupedEarningsItems,
  buildTaskCardDetailItems,
} from "@/lib/driver-service-views";

function money(amountMinor: number) {
  return { amountMinor, currency: "TWD" as const };
}

function makeTask(
  overrides: Partial<UnifiedDriverTaskView> & Record<string, unknown> = {},
) {
  return {
    taskId: "task-001",
    orderId: "order-001",
    orderDomain: "owned",
    sourcePlatform: "drts",
    platformDisplayName: "DRTS",
    externalOrderId: null,
    nativeStatus: null,
    localStatus: "accepted",
    driverActionState: "in_progress",
    allowedActions: ["depart"],
    routeLocked: false,
    fareAuthority: "drts",
    settlementAuthority: "drts",
    driverPayoutAuthority: "drts",
    requiresManualFallback: false,
    requiresReauth: false,
    syncIssueSummary: null,
    blockingReason: null,
    pickupSummary: "A",
    dropoffSummary: "B",
    deadlineAt: null,
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  } as UnifiedDriverTaskView;
}

function makeOrder(overrides: Partial<OwnedOrderRecord> = {}) {
  return {
    orderId: "order-001",
    orderNo: "ORD-001",
    orderSource: "dispatch_console",
    orderDomain: "owned",
    tenantId: "tenant-001",
    partnerId: "fleet-001",
    partnerProgramId: "prog-001",
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    serviceBucket: "business_dispatch",
    dispatchSemantics: "scheduled_queue",
    businessDispatchSubtype: "enterprise_dispatch",
    status: "assigned",
    pickup: { address: "A", lat: null, lng: null },
    dropoff: { address: "B", lat: null, lng: null },
    passenger: { name: "Rider", phone: null },
    bookingId: null,
    bookingType: null,
    etaSnapshot: null,
    callId: null,
    recordingId: null,
    reservationWindowStart: "2026-06-05T08:00:00.000Z",
    reservationWindowEnd: null,
    recurrenceRule: null,
    modifiableUntil: null,
    cancelableUntil: null,
    bookedBy: null,
    onsiteContact: null,
    costCenter: null,
    vehiclePreference: "多元計程車",
    benefitReference: null,
    direction: null,
    flightNo: null,
    terminal: null,
    luggageCount: null,
    notes: null,
    fixedPrice: true,
    quotedFare: money(1200),
    quotedFareSource: "meter_estimate",
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    exceptionHold: null,
    proofRequirements: {
      minPhotoCount: 1,
      signoffRequired: true,
      expenseProofRequired: false,
    },
    approvalState: "not_required",
    approvalRequestIds: [],
    complianceFlags: [],
    cancelledAt: null,
    cancelReason: null,
    reservationHoldStatus: "not_applicable",
    reservationHoldId: null,
    reservationHoldExpiresAt: null,
    dispatchAttemptCount: 1,
    lastDispatchFailureReason: null,
    noSupplyEscalation: null,
    dispatchTimeout: null,
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  } as OwnedOrderRecord;
}

function makeStatement(
  overrides: Partial<DriverStatementRecord> = {},
): DriverStatementRecord {
  return {
    statementId: "stmt-001",
    driverId: "driver-001",
    periodMonth: "2026-06",
    receiptNo: "RCPT-001",
    payoutStatus: "pending",
    grossEarning: money(1000),
    serviceFee: money(100),
    subsidy: money(50),
    netAmount: money(950),
    feePlanVersion: "v1",
    lines: [
      {
        lineId: "line-001",
        orderId: "order-001",
        grossEarning: money(1000),
        serviceFee: money(100),
        subsidy: money(50),
        netAmount: money(950),
        reimbursementRequired: false,
      },
    ],
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildTaskCardDetailItems", () => {
  it("derives service, tenant, fleet, and proof details from task and order data", () => {
    const task = makeTask({
      serviceProduct: "enterprise_dispatch",
      tenantName: "Acme Corp",
      tenantServiceProgramName: "Airport Shuttle",
      vehicleEligibilitySummary: "多元計程車可派",
      proofRequired: true,
      routeLocked: true,
    });
    const order = makeOrder();

    const items = buildTaskCardDetailItems(task, order);

    expect(items.find((item) => item.key === "service")?.value).toContain(
      "Enterprise Dispatch",
    );
    expect(items.find((item) => item.key === "source")?.value).toContain(
      "Owned",
    );
    expect(items.find((item) => item.key === "tenant")?.value).toBe(
      "Acme Corp",
    );
    expect(items.find((item) => item.key === "program")?.value).toBe(
      "Airport Shuttle",
    );
    expect(items.find((item) => item.key === "route")?.value).toContain(
      "Locked route",
    );
    expect(items.find((item) => item.key === "fare")?.value).toContain(
      "Fixed fare",
    );
    expect(items.find((item) => item.key === "fare")?.value).toContain(
      "DRTS fare",
    );
    expect(items.find((item) => item.key === "fleet")?.value).toContain(
      "Fleet fleet-001",
    );
    expect(items.find((item) => item.key === "proof")?.value).toContain(
      "Proof required",
    );
  });
});

describe("buildGroupedEarningsItems", () => {
  it("groups monthly statement lines by service product", () => {
    const statements = [makeStatement()];
    const orderMap = {
      "order-001": makeOrder(),
    };

    const items = buildGroupedEarningsItems({
      groupBy: "service_product",
      platformItems: [],
      statements,
      orderMap,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.label).toContain("企業派遣");
    expect(items[0]?.tripCount).toBe(1);
    expect(items[0]?.netAmount.amountMinor).toBe(950);
  });

  it("builds a total grouping when requested", () => {
    const items = buildGroupedEarningsItems({
      groupBy: "total",
      platformItems: [],
      statements: [makeStatement()],
      orderMap: {
        "order-001": makeOrder(),
      },
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.key).toBe("total");
    expect(items[0]?.netAmount.amountMinor).toBe(950);
  });

  it("falls back to statement channel metadata when order lookup is unavailable", () => {
    const statements = [
      makeStatement({
        lines: [
          {
            lineId: "line-001",
            orderId: "forwarded-001",
            grossEarning: money(800),
            serviceFee: money(80),
            subsidy: money(0),
            netAmount: money(720),
            reimbursementRequired: false,
            channelKey: "forwarded_shadow",
            orderSource: "external_platform" as never,
          },
          {
            lineId: "line-002",
            orderId: "partner-001",
            grossEarning: money(900),
            serviceFee: money(90),
            subsidy: money(0),
            netAmount: money(810),
            reimbursementRequired: false,
            channelKey: "partner_airport",
          },
        ],
      }),
    ];

    const fleetItems = buildGroupedEarningsItems({
      groupBy: "fleet",
      platformItems: [],
      statements,
      orderMap: {},
    });
    const serviceItems = buildGroupedEarningsItems({
      groupBy: "service_product",
      platformItems: [],
      statements,
      orderMap: {},
    });

    expect(fleetItems.map((item) => item.key)).toEqual([
      "partner_channel",
      "external_platform",
    ]);
    expect(fleetItems.map((item) => item.label)).toEqual([
      "合作車隊 / Partner Fleet",
      "外部平台 / External Platform",
    ]);
    expect(serviceItems.map((item) => item.label)).toContain(
      "外部平台轉派 / Forwarded Platform",
    );
    expect(serviceItems.map((item) => item.label)).toContain(
      "合作車隊服務 / Partner Fleet Service",
    );
  });
});
