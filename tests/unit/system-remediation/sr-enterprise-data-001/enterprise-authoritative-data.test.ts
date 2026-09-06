import { describe, expect, it } from "vitest";
import type { BookingRecord } from "@drts/contracts";
class MockApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}
import {
  adaptBookingRecordToEnterpriseBooking,
  classifyBookingApiError,
  formatReservationWindow,
  mapBookingRecordToProgressStage,
  mapRecordToBookingState,
  resolveTripContactConfig,
  resolveTripDriverInfo,
} from "../../../../apps/enterprise-dispatch-web/lib/dispatch-fixture-adapter";
import {
  enterpriseTenant,
  getAuthoritativeEnterpriseBooking,
} from "../../../../apps/enterprise-dispatch-web/lib/enterprise-fixtures";

function createMockBooking(
  overrides: Partial<BookingRecord> = {},
): BookingRecord {
  return {
    bookingId: "BK-ENT-20260906-001",
    orderId: "ORD-ENT-20260906-001",
    tenantId: enterpriseTenant.id,
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
    reservationWindowStart: "2026-09-06T14:30:00.000Z",
    reservationWindowEnd: "2026-09-06T15:30:00.000Z",
    recurrenceRule: null,
    modifiableUntil: "2026-09-06T13:30:00.000Z",
    cancelableUntil: "2026-09-06T14:00:00.000Z",
    pickup: {
      address: "台北市信義區松仁路100號",
      addressName: "台北南山廣場",
    },
    dropoff: {
      address: "桃園市大園區航站南路9號",
      addressName: "桃園機場第二航廈",
    },
    passenger: {
      name: "林宜君",
      phone: "+886912345678",
    },
    bookedBy: {
      name: "林宜君",
      email: "lin.yijun@hongshuo.example",
    },
    onsiteContact: {
      name: "現場聯絡人",
      phone: "+886912000220",
    },
    costCenter: "CC-PRD-01",
    vehiclePreference: "business",
    benefitReference: null,
    direction: "pickup",
    flightNo: "BR198",
    terminal: "T2",
    luggageCount: 2,
    notes: "商務差旅預約",
    quotedFare: {
      currency: "TWD",
      amountMinor: 145000,
    },
    quotedFareSource: "rule_engine",
    quotedFareRuleVersion: "v1.0",
    manualFareOverride: null,
    approvalState: "approved",
    approvalRequestIds: [],
    orderStatus: "assigned",
    createdAt: "2026-09-06T08:00:00.000Z",
    updatedAt: "2026-09-06T08:15:00.000Z",
    ...overrides,
  };
}

describe("SR-ENTERPRISE-DATA-001 Authoritative Booking and Contact Adapters", () => {
  it("adapts authoritative BookingRecord into enterprise booking with preserved ID and fields", () => {
    const record = createMockBooking();
    const adapted = adaptBookingRecordToEnterpriseBooking(record, "zh");

    expect(adapted.id).toBe("BK-ENT-20260906-001");
    expect(adapted.passenger).toBe("林宜君");
    expect(adapted.self).toBe(true);
    expect(adapted.from).toBe("台北南山廣場 (台北市信義區松仁路100號)");
    expect(adapted.to).toBe("桃園機場第二航廈 (桃園市大園區航站南路9號)");
    expect(adapted.flight).toBe("BR198");
    expect(adapted.terminal).toBe("T2");
    expect(adapted.luggage).toBe("2 件");
    expect(adapted.costCenter).toBe("CC-PRD-01");
    expect(adapted.approval).toBe("approved");
    expect(adapted.fare).toBe("NT$ 1,450");
    expect(adapted.state).toBe("assigned");
    // Does not invent a fake ETA when no live ETA exists on record
    expect(adapted.etaMinutes).toBeNull();
  });

  it("links 列表 → 首頁 → 詳情 to the identical booking ID", () => {
    const record = createMockBooking();
    const records = [record];

    // 1. Authoritative lookup matches ID
    const found = getAuthoritativeEnterpriseBooking(record.bookingId, records);
    expect(found).toBeDefined();
    expect(found?.id).toBe(record.bookingId);

    // 2. Non-existent booking yields undefined, not fake fallback
    const missing = getAuthoritativeEnterpriseBooking(
      "nonexistent-booking-id",
      records,
    );
    expect(missing).toBeUndefined();

    // 3. URLs constructed for home, trip, and detail all carry the exact same booking ID
    const homeTripLink = `/trip?bookingId=${encodeURIComponent(found!.id)}`;
    const homeBookingDetailLink = `/bookings/${encodeURIComponent(found!.id)}`;
    const tripDetailLink = `/bookings/${encodeURIComponent(record.bookingId)}`;

    expect(homeTripLink).toBe("/trip?bookingId=BK-ENT-20260906-001");
    expect(homeBookingDetailLink).toBe("/bookings/BK-ENT-20260906-001");
    expect(tripDetailLink).toBe(homeBookingDetailLink);
  });

  it("handles unassigned driver state correctly without leaking fake credentials", () => {
    const unassignedRecord = createMockBooking({
      orderStatus: "submitted",
      approvalState: "approved",
    });

    const driverInfo = resolveTripDriverInfo(unassignedRecord);
    expect(driverInfo.hasDriver).toBe(false);
    expect(driverInfo.status).toBe("unassigned");
    expect(driverInfo.driverName).toBe("尚未指派司機");
    expect(driverInfo.vehicle).toBe("車輛安排中");
    expect(driverInfo.phone).toBeNull();
    expect(driverInfo.isPhoneAuthorized).toBe(false);

    const contact = resolveTripContactConfig(
      driverInfo,
      enterpriseTenant.supportPhone,
    );
    // Driver button is disabled and explains the reason
    expect(contact.driver.available).toBe(false);
    expect(contact.driver.type).toBe("disabled");
    expect(contact.driver.reason).toContain("尚未");

    // Support button is always available with real tenant phone
    expect(contact.support.available).toBe(true);
    expect(contact.support.type).toBe("tel");
    expect(contact.support.href).toBe("tel:0800-200-118");
  });

  it("provides actionable driver phone link only when driver is assigned and authorized", () => {
    // 1. Driver assigned with authorized phone
    const assignedWithAuth = createMockBooking({
      orderStatus: "enroute_pickup",
      ...({
        driverName: "陳建志",
        vehiclePlateNo: "RDG-9988",
        driverPhone: "+886987654321",
        driverPhoneAuthorized: true,
      } as unknown as Partial<BookingRecord>),
    });

    const driverInfo = resolveTripDriverInfo(assignedWithAuth);
    expect(driverInfo.hasDriver).toBe(true);
    expect(driverInfo.driverName).toBe("陳建志");
    expect(driverInfo.vehicle).toBe("RDG-9988");
    expect(driverInfo.phone).toBe("+886987654321");
    expect(driverInfo.isPhoneAuthorized).toBe(true);

    const contact = resolveTripContactConfig(
      driverInfo,
      enterpriseTenant.supportPhone,
    );
    expect(contact.driver.available).toBe(true);
    expect(contact.driver.type).toBe("tel");
    expect(contact.driver.href).toBe("tel:+886987654321");

    // 2. Driver assigned but phone is NOT authorized
    const assignedNoAuth = createMockBooking({
      orderStatus: "enroute_pickup",
      ...({
        driverName: "陳建志",
        vehiclePlateNo: "RDG-9988",
        driverPhone: "+886987654321",
        driverPhoneAuthorized: false,
      } as unknown as Partial<BookingRecord>),
    });

    const driverInfoNoAuth = resolveTripDriverInfo(assignedNoAuth);
    expect(driverInfoNoAuth.hasDriver).toBe(true);
    expect(driverInfoNoAuth.isPhoneAuthorized).toBe(false);
    expect(driverInfoNoAuth.phone).toBeNull(); // Redacted

    const contactNoAuth = resolveTripContactConfig(
      driverInfoNoAuth,
      enterpriseTenant.supportPhone,
    );
    expect(contactNoAuth.driver.available).toBe(false);
    expect(contactNoAuth.driver.type).toBe("support_redirect");
    expect(contactNoAuth.driver.href).toBe("tel:0800-200-118");
    expect(contactNoAuth.driver.reason).toContain("未公開");
  });

  it("classifies 404 NOT_FOUND properly and never reports it as retryable temporary instability", () => {
    const notFoundError = new MockApiError(
      "Booking not found in tenant records",
      404,
      "BOOKING_NOT_FOUND",
    );

    const classified = classifyBookingApiError(notFoundError, "EB-7K2E1D");
    expect(classified.isNotFound).toBe(true);
    expect(classified.isRetryable).toBe(false);
    expect(classified.statusCode).toBe(404);
    expect(classified.errorCode).toBe("BOOKING_NOT_FOUND");
    expect(classified.title).toBe("查無此行程 (404)");
    expect(classified.message).toContain("EB-7K2E1D");
    expect(classified.message).not.toContain("服務暫時不穩定");
    expect(classified.suggestedAction).toBe("list");

    // Contrast with 503 gateway / server error
    const serverError = new MockApiError(
      "Tenant database unreachable",
      503,
      "SERVICE_UNAVAILABLE",
    );
    const classifiedServer = classifyBookingApiError(serverError);
    expect(classifiedServer.isNotFound).toBe(false);
    expect(classifiedServer.isRetryable).toBe(true);
    expect(classifiedServer.title).toBe("服務暫時不穩定");
    expect(classifiedServer.suggestedAction).toBe("retry");
  });

  it("maps progress stages faithfully to lifecycle orderStatus", () => {
    expect(
      mapBookingRecordToProgressStage(
        createMockBooking({ orderStatus: "assigned" }),
      ).activeStage,
    ).toBe(0);
    expect(
      mapBookingRecordToProgressStage(
        createMockBooking({ orderStatus: "enroute_pickup" }),
      ).activeStage,
    ).toBe(1);
    expect(
      mapBookingRecordToProgressStage(
        createMockBooking({ orderStatus: "arrived_pickup" }),
      ).activeStage,
    ).toBe(2);
    expect(
      mapBookingRecordToProgressStage(
        createMockBooking({ orderStatus: "on_trip" }),
      ).activeStage,
    ).toBe(3);
    expect(
      mapBookingRecordToProgressStage(
        createMockBooking({ orderStatus: "completed" }),
      ).activeStage,
    ).toBe(4);
  });

  it("handles empty booking list gracefully without fabricating mock data", () => {
    const emptyRecords: BookingRecord[] = [];
    const adaptedList = emptyRecords.map((r) =>
      adaptBookingRecordToEnterpriseBooking(r),
    );
    expect(adaptedList).toHaveLength(0);

    const active = adaptedList.find(
      (b) => b.state === "enroute" || b.state === "assigned",
    );
    expect(active).toBeUndefined();

    const lookup = getAuthoritativeEnterpriseBooking("any-id", emptyRecords);
    expect(lookup).toBeUndefined();
  });

  it("verifies customer support contact contains valid telephone protocol and tenant phone number", () => {
    const driverInfo = resolveTripDriverInfo(
      createMockBooking({ orderStatus: "submitted" }),
    );
    const contact = resolveTripContactConfig(
      driverInfo,
      enterpriseTenant.supportPhone,
    );

    expect(contact.support.available).toBe(true);
    expect(contact.support.type).toBe("tel");
    expect(contact.support.phone).toBe("0800-200-118");
    expect(contact.support.href).toBe("tel:0800-200-118");
    expect(contact.support.label).toBe("企業客服");
  });

  it("formats reservation window cleanly or returns raw fallback", () => {
    expect(formatReservationWindow("invalid-date-string")).toBe(
      "invalid-date-string",
    );
    const formatted = formatReservationWindow("2026-09-06T10:30:00Z");
    expect(formatted).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it("maps all lifecycle states faithfully to BookingState", () => {
    expect(
      mapRecordToBookingState(createMockBooking({ orderStatus: "cancelled" })),
    ).toBe("cancelled");
    expect(
      mapRecordToBookingState(createMockBooking({ status: "cancelled" })),
    ).toBe("cancelled");
    expect(
      mapRecordToBookingState(createMockBooking({ orderStatus: "no_supply" })),
    ).toBe("nosupply");
    expect(
      mapRecordToBookingState(
        createMockBooking({ orderStatus: "dispatch_failed" }),
      ),
    ).toBe("nosupply");
    expect(
      mapRecordToBookingState(createMockBooking({ orderStatus: "completed" })),
    ).toBe("completed");
    expect(
      mapRecordToBookingState(
        createMockBooking({ orderStatus: "enroute_pickup" }),
      ),
    ).toBe("enroute");
    expect(
      mapRecordToBookingState(
        createMockBooking({ orderStatus: "arrived_pickup" }),
      ),
    ).toBe("enroute");
    expect(
      mapRecordToBookingState(createMockBooking({ orderStatus: "on_trip" })),
    ).toBe("enroute");
    expect(
      mapRecordToBookingState(createMockBooking({ orderStatus: "assigned" })),
    ).toBe("assigned");
    expect(
      mapRecordToBookingState(
        createMockBooking({ orderStatus: "driver_accepted" }),
      ),
    ).toBe("assigned");
    expect(
      mapRecordToBookingState(
        createMockBooking({
          orderStatus: "submitted",
          approvalState: "pending",
        }),
      ),
    ).toBe("approval");
    expect(
      mapRecordToBookingState(
        createMockBooking({
          orderStatus: "submitted",
          approvalState: "approved",
        }),
      ),
    ).toBe("reserved");
  });
});
