import { describe, expect, it, vi } from "vitest";
import type { BookingRecord } from "@drts/contracts";
import { ApiClientError } from "../../../../packages/api-client/src";
import {
  bookingGatewayHref,
  classifyBookingRecordState,
  formatBookingWindowLabel,
  formatSupportTicketBody,
  getAuthorizedSupportContact,
  getDriverAssignedNotice,
  getTripNotFoundNotice,
  getTripProgressStageIndex,
  getTripSupportCopy,
  isInProgressTripState,
  isUpcomingTripState,
  mapBookingRecordToTripSummary,
  resolveBookingGatewayState,
  submitTripSupportInquiry,
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
  it("defaults to honest unauthorized in-app support destination (/trip/support) without leaking fixture phone", () => {
    const originalEnv = process.env.NEXT_PUBLIC_ENTERPRISE_SUPPORT_PHONE;
    delete process.env.NEXT_PUBLIC_ENTERPRISE_SUPPORT_PHONE;
    try {
      const contact = getAuthorizedSupportContact("zh");
      expect(contact.isAuthorized).toBe(false);
      expect(contact.phone).toBeNull();
      expect(contact.href).toBe("/trip/support");
      expect(contact.sourceType).toBe("in_app_support");
      expect(contact.notice).toContain("直撥電話尚未取得租戶授權設定");
      expect(contact.notice).not.toContain("0800-200-118");
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

describe("SR-ENTERPRISE-DATA-001: 4xx / 5xx error classification (C119 / R08 / Codex2 P1)", () => {
  it("classifies true 404 BOOKING_NOT_FOUND as not-found, NEVER degraded", () => {
    const err404 = new ApiClientError({
      statusCode: 404,
      code: "BOOKING_NOT_FOUND",
      message: "Booking not found",
      retryable: false,
      rawBody: '{"code":"BOOKING_NOT_FOUND","message":"Booking not found"}',
    });

    expect(resolveBookingGatewayState(err404)).toBe("not-found");
    expect(bookingGatewayHref(err404)).toBe("/not-found");

    // Exact reproduction test:
    const resolvedState =
      (bookingGatewayHref(err404)?.slice(1) as string | undefined) ?? "degraded";
    expect(resolvedState).toBe("not-found");
    expect(resolvedState).not.toBe("degraded");
  });

  it("classifies 401 Unauthorized and 403 Forbidden as auth-required, NOT not-found", () => {
    const err401 = new ApiClientError({
      statusCode: 401,
      code: "AUTHENTICATION_REQUIRED",
      message: "Session expired or unauthorized",
      retryable: false,
      rawBody: '{"code":"AUTHENTICATION_REQUIRED"}',
    });
    expect(resolveBookingGatewayState(err401)).toBe("auth-required");
    expect(bookingGatewayHref(err401)).toBe("/auth-required");

    const err403 = new ApiClientError({
      statusCode: 403,
      code: "FORBIDDEN",
      message: "Permission denied",
      retryable: false,
      rawBody: '{"code":"FORBIDDEN"}',
    });
    expect(resolveBookingGatewayState(err403)).toBe("auth-required");
    expect(bookingGatewayHref(err403)).toBe("/auth-required");
  });

  it("classifies 403 quota/policy errors as quota-blocked, NOT not-found", () => {
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

  it("classifies 409 vehicle supply errors as no-supply", () => {
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

  it("classifies 409 state conflict errors as conflict, NOT not-found", () => {
    const errConflict = new ApiClientError({
      statusCode: 409,
      code: "BOOKING_STATE_CONFLICT",
      message: "Booking was modified concurrently",
      retryable: false,
      rawBody: '{"code":"BOOKING_STATE_CONFLICT"}',
    });
    expect(resolveBookingGatewayState(errConflict)).toBe("conflict");
    expect(bookingGatewayHref(errConflict)).toBe("/degraded");
  });

  it("classifies 429 Too Many Requests as rate-limited, NOT not-found", () => {
    const err429 = new ApiClientError({
      statusCode: 429,
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests",
      retryable: true,
      rawBody: '{"code":"RATE_LIMIT_EXCEEDED"}',
    });
    expect(resolveBookingGatewayState(err429)).toBe("rate-limited");
    expect(bookingGatewayHref(err429)).toBe("/degraded");
  });

  it("classifies other 4xx client errors (e.g. 400 Bad Request) as degraded, NEVER not-found", () => {
    const err400 = new ApiClientError({
      statusCode: 400,
      code: "VALIDATION_FAILED",
      message: "Invalid request payload",
      retryable: false,
      rawBody: '{"code":"VALIDATION_FAILED"}',
    });
    expect(resolveBookingGatewayState(err400)).toBe("degraded");
    expect(bookingGatewayHref(err400)).toBe("/degraded");
  });

  it("classifies 5xx server errors and network errors as degraded", () => {
    const err500 = new ApiClientError({
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
      retryable: true,
      rawBody: '{"code":"INTERNAL_SERVER_ERROR"}',
    });
    expect(resolveBookingGatewayState(err500)).toBe("degraded");
    expect(bookingGatewayHref(err500)).toBe("/degraded");

    expect(resolveBookingGatewayState(new Error("Network connection lost"))).toBe("degraded");
    expect(bookingGatewayHref(new Error("Network connection lost"))).toBe("/degraded");
  });
});

describe("SR-ENTERPRISE-DATA-001: getTripNotFoundNotice", () => {
  it("provides clear non-retryable 404 guidance in Chinese and English", () => {
    const zh = getTripNotFoundNotice("zh");
    expect(zh.title).toContain("404");
    expect(zh.body).toContain("不可作為暫時故障重試");
    expect(zh.action).toContain("返回預約列表");

    const en = getTripNotFoundNotice("en");
    expect(en.title).toContain("404");
    expect(en.body).toContain("not a temporary fault");
    expect(en.action).toContain("Return to bookings");
  });
});

describe("SR-ENTERPRISE-DATA-001: getTripSupportCopy", () => {
  it("provides comprehensive support copy without unauthorized fixture phone leaks", () => {
    const copyZh = getTripSupportCopy("zh");
    expect(copyZh.pageTitle).toBe("企業客服支援中心");
    expect(copyZh.unauthorizedNotice).not.toContain("0800-200-118");
    expect(copyZh.driverDesc).toContain("最小權限原則");
    expect(copyZh.topicOptions.length).toBeGreaterThanOrEqual(4);
    expect(copyZh.inquiryUnavailableTitle).toBe("線上客服工單通道未開通");
    expect(copyZh.inquiryUnavailableBody).toContain("尚未配置線上工單提交 API");

    const copyEn = getTripSupportCopy("en");
    expect(copyEn.pageTitle).toBe("Enterprise Support Center");
    expect(copyEn.unauthorizedNotice).not.toContain("0800-200-118");
    expect(copyEn.driverDesc).toContain("least-privilege principles");
    expect(copyEn.inquiryUnavailableTitle).toBe("Online Support Ticket Channel Unavailable");
  });

  it("verifies NO fake ticket SUP-2026-0909 or simulated 5-minute promise exists in copy or fixtures", () => {
    const copyZh = getTripSupportCopy("zh");
    const copyEn = getTripSupportCopy("en");

    expect(copyZh.inquirySuccessBody).not.toContain("SUP-2026-0909");
    expect(copyZh.inquirySuccessBody).not.toContain("5 分鐘");
    expect(copyEn.inquirySuccessBody).not.toContain("SUP-2026-0909");
    expect(copyEn.inquirySuccessBody).not.toContain("5 minutes");
  });
});

describe("SR-ENTERPRISE-DATA-001: submitTripSupportInquiry behavioral tests", () => {
  it("honestly returns unavailable state when no authoritative API function is provisioned (no fake delivery)", async () => {
    const res = await submitTripSupportInquiry(
      { topic: "driver", notes: "Driver has not arrived at lobby" },
      "zh",
    );
    expect(res.status).toBe("unavailable");
    expect(res.message).toContain("尚未配置線上工單提交 API");
    expect(res.ticketId).toBeUndefined();
  });

  it("returns honest unavailable state with English guidance when locale is en", async () => {
    const res = await submitTripSupportInquiry(
      { topic: "driver", notes: "Driver delayed" },
      "en",
    );
    expect(res.status).toBe("unavailable");
    expect(res.message).toContain("Online ticket submission API is not provisioned");
    expect(res.ticketId).toBeUndefined();
  });

  it("returns success with real ticket ID when authoritative API returns confirmation", async () => {
    const mockApiSubmit = vi.fn().mockResolvedValue({
      ticketId: "TICK-AUTH-2026-0909-X7",
      submittedAt: "2026-09-09T00:25:00.000Z",
    });

    const res = await submitTripSupportInquiry(
      {
        topic: "urgent",
        notes: "Flight boarding in 30 minutes, need immediate pickup confirmation",
      },
      "zh",
      mockApiSubmit,
    );

    expect(mockApiSubmit).toHaveBeenCalledWith({
      topic: "urgent",
      notes: "Flight boarding in 30 minutes, need immediate pickup confirmation",
    });
    expect(res.status).toBe("success");
    expect(res.ticketId).toBe("TICK-AUTH-2026-0909-X7");
    expect(res.message).toContain("TICK-AUTH-2026-0909-X7");
    expect(res.message).not.toContain("SUP-2026-0909");
  });

  it("returns error status when authoritative API throws an error", async () => {
    const mockApiSubmit = vi
      .fn()
      .mockRejectedValue(new Error("ROC gateway 503 service unavailable"));

    const res = await submitTripSupportInquiry(
      { topic: "driver", notes: "Location mismatch" },
      "zh",
      mockApiSubmit,
    );

    expect(res.status).toBe("error");
    expect(res.message).toBe("ROC gateway 503 service unavailable");
    expect(res.ticketId).toBeUndefined();
  });

  it("returns error status when authoritative API returns response missing valid ticketId", async () => {
    const mockApiSubmit = vi.fn().mockResolvedValue({
      success: true,
      ticketId: "   ",
    });

    const res = await submitTripSupportInquiry(
      { topic: "policy", notes: "Expense question" },
      "zh",
      mockApiSubmit,
    );

    expect(res.status).toBe("error");
    expect(res.message).toContain("有效工單編號");
    expect(res.ticketId).toBeUndefined();
  });

  it("validates required topic before invoking API", async () => {
    const mockApiSubmit = vi.fn();

    const resZh = await submitTripSupportInquiry(
      { topic: "   ", notes: "Missing topic" },
      "zh",
      mockApiSubmit,
    );
    expect(mockApiSubmit).not.toHaveBeenCalled();
    expect(resZh.status).toBe("error");
    expect(resZh.message).toContain("請選擇求助類別");

    const resEn = await submitTripSupportInquiry(
      { topic: "", notes: "Missing topic" },
      "en",
      mockApiSubmit,
    );
    expect(resEn.status).toBe("error");
    expect(resEn.message).toContain("Please select an issue category");
  });

  it("formatSupportTicketBody returns localized confirmation referencing the real ticketId", () => {
    const zh = formatSupportTicketBody("TICK-REAL-101", "zh");
    expect(zh).toContain("TICK-REAL-101");
    expect(zh).toContain("已建立權威客服工單");

    const en = formatSupportTicketBody("TICK-REAL-101", "en");
    expect(en).toContain("TICK-REAL-101");
    expect(en).toContain("Authoritative support ticket");
  });
});
