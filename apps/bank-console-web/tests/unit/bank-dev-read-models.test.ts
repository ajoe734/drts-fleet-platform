import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuditLogRecord,
  IssuerContractStatusRecord,
  OwnedOrderRecord,
  TenantProgramUsageRecord,
  TenantServiceProgramRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import {
  loadBankBookingsData,
  loadBankHomeSnapshot,
} from "../../lib/bank-dev-read-models";

vi.mock("server-only", () => ({}));

function envelope<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const servicePrograms: TenantServiceProgramRecord[] = [
  {
    programId: "ctbc-world-elite",
    tenantId: "tenant_ctbc",
    programType: "credit_card_airport_transfer",
    displayName: "中信機場 World Elite",
    active: true,
    billingMode: "partner_settlement",
    pricingPlanId: "price_we",
    eligibilityRuleId: "elig_we",
    serviceRuleSetId: "rules_we",
    allowedServiceProducts: ["credit_card_airport_transfer"],
  },
] as unknown as TenantServiceProgramRecord[];

const usage: TenantProgramUsageRecord[] = [
  {
    programId: "ctbc-world-elite",
    programCode: "CTB-AIR-WE",
    period: "2026-08",
    quotaTotal: 120,
    quotaRemaining: 117,
    tripsConsumed: 3,
    cardholdersServed: 3,
  },
] as unknown as TenantProgramUsageRecord[];

const orders: OwnedOrderRecord[] = [
  {
    orderId: "ord_reserved",
    orderNo: "BK-202608-001",
    orderDomain: "owned",
    tenantId: "tenant_ctbc",
    partnerId: null,
    partnerProgramId: "ctbc-world-elite",
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: "AUTH-CTBC-001",
    passengerDisclosure: null,
    serviceBucket: "business_dispatch",
    dispatchSemantics: "reserved",
    businessDispatchSubtype: "airport_transfer",
    status: "submitted",
    pickup: { address: "台北", maskedAddress: "台北", lat: null, lng: null },
    dropoff: { address: "桃機 T2", maskedAddress: "桃機 T2", lat: null, lng: null },
    passenger: { name: "Cardholder One", phone: "0912000111" },
    bookingId: null,
    bookingType: null,
    etaSnapshot: null,
    callId: null,
    recordingId: null,
    reservationWindowStart: "2026-08-07T08:30:00Z",
    reservationWindowEnd: null,
    recurrenceRule: null,
    modifiableUntil: null,
    cancelableUntil: null,
    bookedBy: null,
    onsiteContact: null,
    costCenter: null,
    vehiclePreference: null,
    benefitReference: "BEN-CTBC-0001",
    direction: "dropoff",
    flightNo: "BR198",
    terminal: "T2",
    luggageCount: null,
    notes: null,
    fixedPrice: false,
    quotedFare: null,
    quotedFareSource: null,
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    exceptionHold: null,
    proofRequirements: {
      minPhotoCount: 0,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    approvalState: "approved",
    approvalRequestIds: [],
    complianceFlags: [],
    cancelledAt: null,
    cancelReason: null,
    reservationHoldStatus: "none",
    reservationHoldId: null,
    reservationHoldExpiresAt: null,
    dispatchAttemptCount: 0,
    lastDispatchFailureReason: null,
    noSupplyEscalation: null,
    dispatchTimeout: null,
    createdAt: "2026-08-07T01:00:00Z",
    updatedAt: "2026-08-07T01:05:00Z",
  } as unknown as OwnedOrderRecord,
  {
    orderId: "ord_live",
    orderNo: "BK-202608-002",
    orderDomain: "owned",
    tenantId: "tenant_ctbc",
    partnerId: null,
    partnerProgramId: "ctbc-world-elite",
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: "AUTH-CTBC-002",
    passengerDisclosure: null,
    serviceBucket: "business_dispatch",
    dispatchSemantics: "reserved",
    businessDispatchSubtype: "airport_transfer",
    status: "on_trip",
    pickup: { address: "桃機 T1", maskedAddress: "桃機 T1", lat: null, lng: null },
    dropoff: { address: "新竹", maskedAddress: "新竹", lat: null, lng: null },
    passenger: { name: "Cardholder Two", phone: "0912000222" },
    bookingId: null,
    bookingType: null,
    etaSnapshot: null,
    callId: null,
    recordingId: null,
    reservationWindowStart: "2026-08-07T10:00:00Z",
    reservationWindowEnd: null,
    recurrenceRule: null,
    modifiableUntil: null,
    cancelableUntil: null,
    bookedBy: null,
    onsiteContact: null,
    costCenter: null,
    vehiclePreference: null,
    benefitReference: "BEN-CTBC-0002",
    direction: "pickup",
    flightNo: "JL809",
    terminal: "T1",
    luggageCount: null,
    notes: "greet",
    fixedPrice: false,
    quotedFare: null,
    quotedFareSource: null,
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    exceptionHold: null,
    proofRequirements: {
      minPhotoCount: 0,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    approvalState: "approved",
    approvalRequestIds: [],
    complianceFlags: [],
    cancelledAt: null,
    cancelReason: null,
    reservationHoldStatus: "none",
    reservationHoldId: null,
    reservationHoldExpiresAt: null,
    dispatchAttemptCount: 1,
    lastDispatchFailureReason: null,
    noSupplyEscalation: null,
    dispatchTimeout: null,
    createdAt: "2026-08-07T02:00:00Z",
    updatedAt: "2026-08-07T02:10:00Z",
  } as unknown as OwnedOrderRecord,
  {
    orderId: "ord_done",
    orderNo: "BK-202608-003",
    orderDomain: "owned",
    tenantId: "tenant_ctbc",
    partnerId: null,
    partnerProgramId: "ctbc-world-elite",
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: "AUTH-CTBC-003",
    passengerDisclosure: null,
    serviceBucket: "business_dispatch",
    dispatchSemantics: "reserved",
    businessDispatchSubtype: "airport_transfer",
    status: "completed",
    pickup: { address: "台北", maskedAddress: "台北", lat: null, lng: null },
    dropoff: { address: "桃機 T2", maskedAddress: "桃機 T2", lat: null, lng: null },
    passenger: { name: "Cardholder Three", phone: "0912000333" },
    bookingId: null,
    bookingType: null,
    etaSnapshot: null,
    callId: null,
    recordingId: null,
    reservationWindowStart: "2026-08-05T10:00:00Z",
    reservationWindowEnd: null,
    recurrenceRule: null,
    modifiableUntil: null,
    cancelableUntil: null,
    bookedBy: null,
    onsiteContact: null,
    costCenter: null,
    vehiclePreference: null,
    benefitReference: "BEN-CTBC-0003",
    direction: "dropoff",
    flightNo: "CI103",
    terminal: "T2",
    luggageCount: null,
    notes: null,
    fixedPrice: false,
    quotedFare: null,
    quotedFareSource: null,
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    exceptionHold: null,
    proofRequirements: {
      minPhotoCount: 0,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    approvalState: "approved",
    approvalRequestIds: [],
    complianceFlags: [],
    cancelledAt: null,
    cancelReason: null,
    reservationHoldStatus: "none",
    reservationHoldId: null,
    reservationHoldExpiresAt: null,
    dispatchAttemptCount: 1,
    lastDispatchFailureReason: null,
    noSupplyEscalation: null,
    dispatchTimeout: null,
    createdAt: "2026-08-05T01:00:00Z",
    updatedAt: "2026-08-05T01:10:00Z",
  } as unknown as OwnedOrderRecord,
  {
    orderId: "ord_cancelled",
    orderNo: "BK-202608-004",
    orderDomain: "owned",
    tenantId: "tenant_ctbc",
    partnerId: null,
    partnerProgramId: "ctbc-world-elite",
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: "AUTH-CTBC-004",
    passengerDisclosure: null,
    serviceBucket: "business_dispatch",
    dispatchSemantics: "reserved",
    businessDispatchSubtype: "airport_transfer",
    status: "cancelled",
    pickup: { address: "桃機 T1", maskedAddress: "桃機 T1", lat: null, lng: null },
    dropoff: { address: "台北", maskedAddress: "台北", lat: null, lng: null },
    passenger: { name: "Cardholder Four", phone: "0912000444" },
    bookingId: null,
    bookingType: null,
    etaSnapshot: null,
    callId: null,
    recordingId: null,
    reservationWindowStart: "2026-08-04T10:00:00Z",
    reservationWindowEnd: null,
    recurrenceRule: null,
    modifiableUntil: null,
    cancelableUntil: null,
    bookedBy: null,
    onsiteContact: null,
    costCenter: null,
    vehiclePreference: null,
    benefitReference: "BEN-CTBC-0004",
    direction: "pickup",
    flightNo: "JX802",
    terminal: "T1",
    luggageCount: null,
    notes: null,
    fixedPrice: false,
    quotedFare: null,
    quotedFareSource: null,
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    exceptionHold: null,
    proofRequirements: {
      minPhotoCount: 0,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    approvalState: "approved",
    approvalRequestIds: [],
    complianceFlags: [],
    cancelledAt: "2026-08-04T02:00:00Z",
    cancelReason: "cardholder_request",
    reservationHoldStatus: "none",
    reservationHoldId: null,
    reservationHoldExpiresAt: null,
    dispatchAttemptCount: 0,
    lastDispatchFailureReason: null,
    noSupplyEscalation: null,
    dispatchTimeout: null,
    createdAt: "2026-08-04T01:00:00Z",
    updatedAt: "2026-08-04T02:00:00Z",
  } as unknown as OwnedOrderRecord,
];

const contracts: IssuerContractStatusRecord[] = [
  {
    contractId: "CTR-CTBC-WE-2026",
    tenantId: "tenant_ctbc",
    programId: "ctbc-world-elite",
    programCode: "CTB-AIR-WE",
    displayName: "中信機場 World Elite",
    term: {
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: null,
      billingCycle: "monthly",
      serviceProduct: "credit_card_airport_transfer",
      issuerTenantId: "tenant_ctbc",
    },
    slaTargets: [
      {
        metric: "pickup_punctuality",
        thresholdPercent: 95,
        comparator: "gte",
        window: "current_period",
      },
      {
        metric: "completion_rate",
        thresholdPercent: 99,
        comparator: "gte",
        window: "current_period",
      },
    ],
    periodAttainment: {
      period: "2026-08",
      evaluatedAt: "2026-08-07T23:59:00Z",
      completedTrips: 2,
      totalTrips: 3,
      pickupPunctualityPercent: 96.4,
      completionRatePercent: 99.2,
      breachedTargets: [],
    },
    exceptions: [
      {
        exceptionId: "ex_manual",
        orderId: "ord_reserved",
        occurredAt: "2026-08-07T03:00:00Z",
        reasonCode: "MANUAL_REVIEW_REQUIRED",
        summary: "Manual review pending",
        status: "open",
        benefitReferenceMasked: "BEN-••••-01",
        issuerAuthorizationRefMasked: "AUTH-••••-01",
      },
    ],
    status: "active",
  },
];

const users: TenantUserRoleRecord[] = [
  {
    userId: "user_1",
    tenantId: "tenant_ctbc",
    email: "program-admin@ctbcbank.com",
    displayName: "周敬文",
    roleCode: "bank_program_admin",
    status: "active",
    approvalNotificationOptOut: false,
    invitedAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-07T00:00:00Z",
  },
];

const auditLogs: AuditLogRecord[] = [];

const statements = [
  {
    statementId: "stmt_2026_08",
    tenantId: "tenant_ctbc",
    period: "2026-08",
    status: "due",
    lines: [
      {
        tripId: "trip_1",
        completedAt: "2026-08-05T03:00:00Z",
        fare: { amountMinor: 120000, currency: "TWD" },
        subsidisedAmount: { amountMinor: 100000, currency: "TWD" },
        paidAmount: { amountMinor: 20000, currency: "TWD" },
        benefitReference: "BEN-CTBC-0003",
        issuerAuthorizationRef: "AUTH-CTBC-003",
        cardholderRefMasked: "CH••••33",
      },
    ],
    totals: {
      tripCount: 1,
      fareTotal: { amountMinor: 120000, currency: "TWD" },
      subsidisedTotal: { amountMinor: 100000, currency: "TWD" },
      paidTotal: { amountMinor: 20000, currency: "TWD" },
      issuerPayable: { amountMinor: 100000, currency: "TWD" },
    },
    artifactRef: {
      artifactId: "artifact_stmt_2026_08",
      kind: "settlement_statement",
      manifestHash: "hash",
    },
    generatedAt: "2026-08-06T00:00:00Z",
  },
];

describe("bank dev read models", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url,
        );

        if (url.hostname === "metadata.google.internal") {
          return new Response("metadata unavailable", { status: 404 });
        }

        const path = `${url.pathname}${url.search}`;

        switch (path) {
          case "/api/tenant/service-programs":
            return envelope({ items: servicePrograms });
          case "/api/tenant/program-usage":
            return envelope({ items: usage });
          case "/api/tenant/orders?serviceProduct=credit_card_airport_transfer":
            return envelope({ items: orders });
          case "/api/tenant/contracts":
            return envelope({ items: contracts });
          case "/api/tenant/settlement-statements":
            return envelope({ items: statements });
          case "/api/tenant/users":
            return envelope({ items: users });
          case "/api/tenant/audit":
            return envelope({ items: auditLogs });
          default:
            throw new Error(`Unhandled fetch URL: ${path}`);
        }
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps scoped booking records from the tenant API", async () => {
    const result = await loadBankBookingsData(
      "tenant_ctbc",
      "bank_program_admin",
    );

    expect(result.degradedMessage).toBeNull();
    expect(result.data.programs).toEqual([
      { code: "ctbc-world-elite", label: "中信機場 World Elite" },
    ]);
    expect(result.data.periods).toEqual(["2026-08"]);
    expect(result.data.bookings).toHaveLength(4);
    expect(result.data.bookings[0]?.orderNo).toBe("BK-202608-001");
    expect(result.data.detailById.get("ord_live")?.state).toBe("en_route");
    expect(
      result.data.detailById.get("ord_live")?.authorizationReferenceMasked,
    ).toBe("AUTH-••••-002");
  });

  it("derives home tallies from live tenant API data", async () => {
    const result = await loadBankHomeSnapshot(
      "tenant_ctbc",
      "bank_program_admin",
    );

    expect(result.degradedMessage).toBeNull();
    expect(result.data.period).toBe("2026-08");
    expect(result.data.tallies).toEqual({
      total: 4,
      reserved: 1,
      live: 1,
      completed: 1,
      cancelled: 1,
    });
    expect(result.data.statements[0]?.totalIssuerPayableAmount).toBe(1000);
  });
});
