import { describe, expect, it } from "vitest";
import type { BookingRecord } from "@drts/contracts";
import { ApiClientError } from "../../../../packages/api-client/src";
import {
  bookingGatewayHref,
  classifyBookingRecordState,
  formatBookingWindowLabel,
  getAuthorizedSupportContact,
  getDriverAssignedNotice,
  getTripProgressStageIndex,
  isInProgressTripState,
  isUpcomingTripState,
  mapBookingRecordToTripSummary,
  resolveBookingGatewayState,
  toTelHref,
} from "../../../../apps/enterprise-dispatch-web/lib/enterprise-fixtures";

// SR-ENTERPRISE-DATA-001 — regression coverage for R08 (home/trip showed
// demo bookings whose IDs 404 against the real tenant booking API and a
// static ETA) and R09 (contact-driver/contact-support buttons had no
// action). These functions are what apps/enterprise-dispatch-web/app/page.tsx
// and app/trip/page.tsx now use to turn a real `BookingRecord` (the same
// shape `/bookings` and `/bookings/[bookingId]` already fetch) into display
// data, instead of the static `enterpriseBookings` fixture array.

function buildBooking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    bookingId: "booking-sr-ent-001",
    orderId: "order-sr-ent-001",
    tenantId: "10000000-0000-0000-0000-000000000201",
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    passengerDisclosure: null,
    status: "active",
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    bookingType: "oneway",
    reservationWindowStart: "2026-09-08T02:20:00.000Z",
    reservationWindowEnd: "2026-09-08T02:50:00.000Z",
    recurrenceRule: null,
    modifiableUntil: "2026-09-08T02:00:00.000Z",
    cancelableUntil: "2026-09-08T02:10:00.000Z",
    pickup: { address: "Taipei HQ" },
    dropoff: { address: "Taoyuan T2" },
    passenger: { name: "Lin Yijun", phone: "+886900000001" },
    bookedBy: { name: "Lin Yijun", email: "lin@example.com" },
    onsiteContact: null,
    costCenter: "CC-PRD-01",
    vehiclePreference: "business",
    benefitReference: null,
    direction: "pickup",
    flightNo: null,
    terminal: null,
    luggageCount: null,
    notes: null,
    quotedFare: null,
    quotedFareSource: null,
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    approvalState: "approved",
    approvalRequestIds: [],
    orderStatus: "assigned",
    createdAt: "2026-09-08T01:00:00.000Z",
    updatedAt: "2026-09-08T01:00:00.000Z",
    ...overrides,
  };
}

describe("SR-ENTERPRISE-DATA-001: classifyBookingRecordState", () => {
  it("maps a cancelled booking to cancelled regardless of orderStatus", () => {
    expect(
      classifyBookingRecordState(
        buildBooking({ status: "cancelled", orderStatus: "assigned" }),
      ),
    ).toBe("cancelled");
  });

  it("maps a completed booking to completed", () => {
    expect(
      classifyBookingRecordState(
        buildBooking({ status: "completed", orderStatus: "completed" }),
      ),
    ).toBe("completed");
  });

  it("maps no_supply / dispatch_failed / dispatch_timeout / redispatch_required to nosupply, not a silent default", () => {
    for (const orderStatus of [
      "no_supply",
      "dispatch_failed",
      "dispatch_timeout",
      "redispatch_required",
    ] as const) {
      expect(classifyBookingRecordState(buildBooking({ orderStatus }))).toBe(
        "nosupply",
      );
    }
  });

  it("maps a pending approval to approval even when a driver is already assigned", () => {
    expect(
      classifyBookingRecordState(
        buildBooking({ approvalState: "pending", orderStatus: "assigned" }),
      ),
    ).toBe("approval");
  });

  it("maps assigned/driver_accepted to assigned", () => {
    expect(
      classifyBookingRecordState(buildBooking({ orderStatus: "assigned" })),
    ).toBe("assigned");
    expect(
      classifyBookingRecordState(
        buildBooking({ orderStatus: "driver_accepted" }),
      ),
    ).toBe("assigned");
  });

  it("maps enroute_pickup/arrived_pickup/on_trip/proof_pending to enroute", () => {
    for (const orderStatus of [
      "enroute_pickup",
      "arrived_pickup",
      "on_trip",
      "proof_pending",
    ] as const) {
      expect(classifyBookingRecordState(buildBooking({ orderStatus }))).toBe(
        "enroute",
      );
    }
  });

  it("maps a not-yet-dispatched booking to reserved", () => {
    expect(
      classifyBookingRecordState(
        buildBooking({ orderStatus: "ready_for_dispatch" }),
      ),
    ).toBe("reserved");
  });
});

describe("SR-ENTERPRISE-DATA-001: trip state predicates", () => {
  it("treats only assigned/enroute as in-progress", () => {
    expect(isInProgressTripState("assigned")).toBe(true);
    expect(isInProgressTripState("enroute")).toBe(true);
    expect(isInProgressTripState("reserved")).toBe(false);
    expect(isInProgressTripState("approval")).toBe(false);
    expect(isInProgressTripState("completed")).toBe(false);
    expect(isInProgressTripState("cancelled")).toBe(false);
    expect(isInProgressTripState("nosupply")).toBe(false);
  });

  it("excludes completed/cancelled/nosupply from the upcoming bucket", () => {
    expect(isUpcomingTripState("assigned")).toBe(true);
    expect(isUpcomingTripState("enroute")).toBe(true);
    expect(isUpcomingTripState("approval")).toBe(true);
    expect(isUpcomingTripState("reserved")).toBe(true);
    expect(isUpcomingTripState("completed")).toBe(false);
    expect(isUpcomingTripState("cancelled")).toBe(false);
    expect(isUpcomingTripState("nosupply")).toBe(false);
  });
});

describe("SR-ENTERPRISE-DATA-001: getTripProgressStageIndex", () => {
  it("reflects the real order status instead of a hardcoded stage", () => {
    expect(getTripProgressStageIndex("assigned")).toBe(0);
    expect(getTripProgressStageIndex("driver_accepted")).toBe(0);
    expect(getTripProgressStageIndex("enroute_pickup")).toBe(1);
    expect(getTripProgressStageIndex("arrived_pickup")).toBe(2);
    expect(getTripProgressStageIndex("on_trip")).toBe(3);
    expect(getTripProgressStageIndex("proof_pending")).toBe(4);
    expect(getTripProgressStageIndex("completed")).toBe(4);
  });
});

describe("SR-ENTERPRISE-DATA-001: formatBookingWindowLabel", () => {
  it("formats a real ISO reservation window in Taipei wall-clock time", () => {
    expect(formatBookingWindowLabel("2026-06-13T07:20:00.000Z")).toBe(
      "06/13 15:20",
    );
  });

  it("returns an em dash for an unparsable value instead of throwing", () => {
    expect(formatBookingWindowLabel("not-a-date")).toBe("—");
  });
});

describe("SR-ENTERPRISE-DATA-001: mapBookingRecordToTripSummary", () => {
  it("carries the real bookingId through, so /trip and /bookings/[bookingId] agree on the same record", () => {
    const record = buildBooking({ bookingId: "real-api-booking-42" });
    const summary = mapBookingRecordToTripSummary(record);
    expect(summary.id).toBe("real-api-booking-42");
  });

  it("never fabricates an ETA — always null so callers render the existing '—' fallback", () => {
    const summary = mapBookingRecordToTripSummary(buildBooking());
    expect(summary.etaMinutes).toBeNull();
  });

  it("detects a self-booking when bookedBy is absent", () => {
    const summary = mapBookingRecordToTripSummary(
      buildBooking({ bookedBy: null, passenger: { name: "Solo Rider", phone: "+886900000009" } }),
    );
    expect(summary.self).toBe(true);
    expect(summary.bookedBy).toBe("Solo Rider");
  });

  it("detects a self-booking when bookedBy name matches the passenger", () => {
    const summary = mapBookingRecordToTripSummary(
      buildBooking({
        passenger: { name: "Chen Amy", phone: "+886900000009" },
        bookedBy: { name: "Chen Amy", email: "amy@example.com" },
      }),
    );
    expect(summary.self).toBe(true);
  });

  it("flags a delegated booking when bookedBy differs from the passenger", () => {
    const summary = mapBookingRecordToTripSummary(
      buildBooking({
        passenger: { name: "Guest Sato", phone: "+886900000009" },
        bookedBy: { name: "Lin Yijun", email: "lin@example.com" },
      }),
    );
    expect(summary.self).toBe(false);
    expect(summary.bookedBy).toBe("Lin Yijun");
  });

  it("only includes flight/terminal when the record actually has them", () => {
    const withFlight = mapBookingRecordToTripSummary(
      buildBooking({ flightNo: "JL809", terminal: "T1" }),
    );
    expect(withFlight.flight).toBe("JL809");
    expect(withFlight.terminal).toBe("T1");

    const withoutFlight = mapBookingRecordToTripSummary(
      buildBooking({ flightNo: null, terminal: null }),
    );
    expect(withoutFlight.flight).toBeUndefined();
    expect(withoutFlight.terminal).toBeUndefined();
  });

  it("classifies a no-supply order as nosupply so the UI can show a real no-driver state (C018)", () => {
    const summary = mapBookingRecordToTripSummary(
      buildBooking({ orderStatus: "no_supply" }),
    );
    expect(summary.state).toBe("nosupply");
  });
});

describe("SR-ENTERPRISE-DATA-001: toTelHref", () => {
  it("strips formatting characters so the href is a dialable tel: URI", () => {
    expect(toTelHref("0800-200-118")).toBe("tel:0800200118");
  });

  it("keeps a leading + for international numbers", () => {
    expect(toTelHref("+886 900 000 001")).toBe("tel:+886900000001");
  });
});

describe("SR-ENTERPRISE-DATA-001: getDriverAssignedNotice", () => {
  it("returns localized notice for zh locale", () => {
    const notice = getDriverAssignedNotice("zh");
    expect(notice.title).toBe("司機已指派");
    expect(notice.subtitle).toBe("聯絡方式由企業客服提供");
    expect(notice.helpText).toContain("請改用企業客服");
    expect(notice.isDriverAssigned).toBe(true);
  });

  it("returns English notice for en locale", () => {
    const notice = getDriverAssignedNotice("en");
    expect(notice.title).toBe("Driver assigned");
    expect(notice.subtitle).toBe("Contact is routed through enterprise support");
    expect(notice.helpText).toContain("please use enterprise support");
    expect(notice.isDriverAssigned).toBe(true);
  });

  it("returns unassigned finding-driver state when order is matching/pending", () => {
    const noticeZh = getDriverAssignedNotice("zh", "matching");
    expect(noticeZh.title).toBe("司機媒合中");
    expect(noticeZh.subtitle).toBe("尚未指派司機");
    expect(noticeZh.isDriverAssigned).toBe(false);

    const noticeEn = getDriverAssignedNotice("en", "pending");
    expect(noticeEn.title).toBe("Finding Driver");
    expect(noticeEn.subtitle).toBe("No driver assigned yet");
    expect(noticeEn.isDriverAssigned).toBe(false);
  });

  it("returns no-supply state when dispatch failed or no supply", () => {
    const noticeZh = getDriverAssignedNotice("zh", "no_supply");
    expect(noticeZh.title).toBe("暫無可派車輛");
    expect(noticeZh.subtitle).toBe("目前無法派車");
    expect(noticeZh.isDriverAssigned).toBe(false);

    const noticeEn = getDriverAssignedNotice("en", "dispatch_failed");
    expect(noticeEn.title).toBe("No Vehicle Available");
    expect(noticeEn.subtitle).toBe("Dispatch unavailable");
    expect(noticeEn.isDriverAssigned).toBe(false);
  });
});

describe("SR-ENTERPRISE-DATA-001: getAuthorizedSupportContact", () => {
  it("defaults to honest unauthorized in-app support (/help) without leaking fixture phone", () => {
    const originalEnv = process.env.NEXT_PUBLIC_ENTERPRISE_SUPPORT_PHONE;
    delete process.env.NEXT_PUBLIC_ENTERPRISE_SUPPORT_PHONE;
    try {
      const contact = getAuthorizedSupportContact("zh");
      expect(contact.isAuthorized).toBe(false);
      expect(contact.phone).toBeNull();
      expect(contact.href).toBe("/help");
      expect(contact.sourceType).toBe("in_app_support");
      expect(contact.notice).toContain("直撥電話尚未取得租戶授權設定");
    } finally {
      if (originalEnv !== undefined) {
        process.env.NEXT_PUBLIC_ENTERPRISE_SUPPORT_PHONE = originalEnv;
      }
    }
  });

  it("uses authorized configured phone when available in runtime environment", () => {
    const originalEnv = process.env.NEXT_PUBLIC_ENTERPRISE_SUPPORT_PHONE;
    process.env.NEXT_PUBLIC_ENTERPRISE_SUPPORT_PHONE = "0800-888-999";
    try {
      const contact = getAuthorizedSupportContact("zh");
      expect(contact.isAuthorized).toBe(true);
      expect(contact.phone).toBe("0800-888-999");
      expect(contact.href).toBe("tel:0800888999");
      expect(contact.sourceType).toBe("authorized_env");
      expect(contact.notice).toContain("0800-888-999");
    } finally {
      if (originalEnv !== undefined) {
        process.env.NEXT_PUBLIC_ENTERPRISE_SUPPORT_PHONE = originalEnv;
      } else {
        delete process.env.NEXT_PUBLIC_ENTERPRISE_SUPPORT_PHONE;
      }
    }
  });
});

describe("SR-ENTERPRISE-DATA-001: 404 BOOKING_NOT_FOUND error classification (C119 / R08)", () => {
  it("classifies 404 BOOKING_NOT_FOUND as not-found, NEVER degraded", () => {
    const err404 = new ApiClientError({
      statusCode: 404,
      code: "BOOKING_NOT_FOUND",
      message: "Booking not found",
      retryable: false,
      rawBody: '{"code":"BOOKING_NOT_FOUND","message":"Booking not found"}',
    });

    expect(resolveBookingGatewayState(err404)).toBe("not-found");
    expect(bookingGatewayHref(err404)).toBe("/not-found");

    // Exact reproduction test from Codex review:
    // candidate used: (gatewayHref(error)?.slice(1) as GatewayState) ?? "degraded"
    const resolvedState =
      (bookingGatewayHref(err404)?.slice(1) as string | undefined) ?? "degraded";
    expect(resolvedState).toBe("not-found");
    expect(resolvedState).not.toBe("degraded");
  });

  it("classifies 5xx server errors as degraded", () => {
    const err500 = new ApiClientError({
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      retryable: true,
      rawBody: '{"code":"INTERNAL_SERVER_ERROR"}',
    });
    expect(resolveBookingGatewayState(err500)).toBe("degraded");
    expect(bookingGatewayHref(err500)).toBe("/degraded");
  });

  it("classifies quota errors as quota-blocked", () => {
    const errQuota = new ApiClientError({
      statusCode: 403,
      code: "TENANT_QUOTA_EXCEEDED",
      message: "Quota exceeded",
      retryable: false,
      rawBody: '{"code":"TENANT_QUOTA_EXCEEDED"}',
    });
    expect(resolveBookingGatewayState(errQuota)).toBe("quota-blocked");
    expect(bookingGatewayHref(errQuota)).toBe("/quota-blocked");
  });

  it("classifies supply errors as no-supply", () => {
    const errSupply = new ApiClientError({
      statusCode: 409,
      code: "VEHICLE_UNAVAILABLE",
      message: "Vehicle unavailable",
      retryable: true,
      rawBody: '{"code":"VEHICLE_UNAVAILABLE"}',
    });
    expect(resolveBookingGatewayState(errSupply)).toBe("no-supply");
    expect(bookingGatewayHref(errSupply)).toBe("/no-supply");
  });
});
