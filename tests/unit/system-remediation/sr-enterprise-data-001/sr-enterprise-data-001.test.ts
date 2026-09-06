import { describe, expect, it } from "vitest";
import type { BookingRecord, OwnedOrderStatus } from "@drts/contracts";
import {
  adaptBookingRecordToEnterpriseBooking,
  fetchAuthoritativeEnterpriseBooking,
  fetchAuthoritativeEnterpriseBookings,
  formatReservationWindow,
  resolveEnterpriseBookingState,
  resolveEnterpriseTripDriverContact,
} from "../../../../apps/enterprise-dispatch-web/lib/dispatch-fixture-adapter";
import {
  enterpriseTenant,
  getBookingStateMeta,
} from "../../../../apps/enterprise-dispatch-web/lib/enterprise-fixtures";

function createMockBookingRecord(
  overrides?: Partial<BookingRecord>,
): BookingRecord {
  return {
    bookingId: "BK-AUTH-20260906-001",
    orderId: "ORD-AUTH-20260906-001",
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
      addressName: "南山廣場大樓",
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
      name: "周禮賓",
      phone: "+886987654321",
    },
    costCenter: "CC-PRD-07",
    vehiclePreference: "business",
    benefitReference: null,
    direction: "pickup",
    flightNo: "BR198",
    terminal: "T2",
    luggageCount: 2,
    notes: "請於航廈抵達大廳舉牌接機",
    quotedFare: {
      currency: "TWD",
      amountMinor: 218000,
    },
    quotedFareSource: "standard_tariff",
    quotedFareRuleVersion: "v2.1",
    manualFareOverride: null,
    approvalState: "approved",
    approvalRequestIds: [],
    orderStatus: "enroute_pickup",
    createdAt: "2026-09-06T08:00:00.000Z",
    updatedAt: "2026-09-06T08:30:00.000Z",
    ...overrides,
  };
}

describe("SR-ENTERPRISE-DATA-001: 企業首頁／行程真資料及聯絡入口", () => {
  describe("A. 列表→首頁→詳情指向同一存在之權威 booking", () => {
    it("faithfully preserves bookingId across adapter without defaulting to stale fixture EB-7K2E1D", () => {
      const record = createMockBookingRecord({
        bookingId: "BK-CORP-REAL-7720",
        orderId: "ORD-CORP-REAL-7720",
      });

      const adapted = adaptBookingRecordToEnterpriseBooking(record, "zh-TW");

      expect(adapted.id).toBe("BK-CORP-REAL-7720");
      expect(adapted.id).not.toBe("EB-7K2E1D");
      expect(adapted.passenger).toBe("林宜君");
      expect(adapted.self).toBe(true);
      expect(adapted.costCenter).toBe("CC-PRD-07");
      expect(adapted.fare).toBe("NT$ 2,180");
      expect(adapted.flight).toBe("BR198");
      expect(adapted.terminal).toBe("T2");
      expect(adapted.luggage).toBe("2 件");
      expect(adapted.onsiteContact).toContain("周禮賓");
      expect(adapted.onsiteContact).toContain("+886987654321");
    });

    it("formats pickup and dropoff with addressName when available", () => {
      const record = createMockBookingRecord({
        pickup: {
          address: "台北市南港區經貿二路1號",
          addressName: "南港展覽館1館",
        },
        dropoff: {
          address: "台北市中正區北平西路3號",
          addressName: "台北車站",
        },
      });

      const adapted = adaptBookingRecordToEnterpriseBooking(record);
      expect(adapted.from).toBe("台北市南港區經貿二路1號 (南港展覽館1館)");
      expect(adapted.to).toBe("台北市中正區北平西路3號 (台北車站)");
    });

    it("does NOT invent fake 9 minutes ETA when authoritative data has none", () => {
      const record = createMockBookingRecord({
        orderStatus: "enroute_pickup",
      });

      const adapted = adaptBookingRecordToEnterpriseBooking(record);
      expect(adapted.etaMinutes).toBeNull();
    });

    it("formats reservation window cleanly into MM/DD HH:mm format", () => {
      expect(formatReservationWindow("2026-09-06T14:30:00.000Z")).toMatch(
        /^\d{2}\/\d{2} \d{2}:\d{2}$/,
      );
      expect(formatReservationWindow(null)).toBe("—");
      expect(formatReservationWindow("invalid-date")).toBe("invalid-date");
    });
  });

  describe("B. 權威狀態映射與語意對齊", () => {
    const stateTestCases: Array<[OwnedOrderStatus, string, boolean]> = [
      ["cancelled", "cancelled", false],
      ["completed", "completed", true],
      ["no_supply", "nosupply", false],
      ["enroute_pickup", "enroute", false],
      ["on_trip", "enroute", false],
      ["arrived_pickup", "enroute", false],
      ["driver_accepted", "assigned", false],
      ["assigned", "assigned", false],
      ["created", "reserved", false],
      ["submitted", "reserved", false],
      ["dispatch_requested", "reserved", false],
      ["delayed_queue", "reserved", false],
      ["exception_hold", "reserved", false],
    ];

    it.each(stateTestCases)(
      "maps orderStatus '%s' to booking state '%s' with receiptReady=%s",
      (orderStatus, expectedState, expectedReceiptReady) => {
        const record = createMockBookingRecord({
          orderStatus,
          status:
            orderStatus === "cancelled"
              ? "cancelled"
              : orderStatus === "completed"
                ? "completed"
                : "active",
        });

        const state = resolveEnterpriseBookingState(record);
        expect(state).toBe(expectedState);

        const adapted = adaptBookingRecordToEnterpriseBooking(record);
        expect(adapted.state).toBe(expectedState);
        expect(adapted.receiptReady).toBe(expectedReceiptReady);
      },
    );

    it("maps pending approvalState to approval state", () => {
      const record = createMockBookingRecord({
        orderStatus: "submitted",
        approvalState: "pending",
      });

      expect(resolveEnterpriseBookingState(record)).toBe("approval");
    });

    it("provides valid tone and labels through getBookingStateMeta", () => {
      const meta = getBookingStateMeta("zh-TW");
      expect(meta.assigned.tone).toBe("primary");
      expect(meta.enroute.tone).toBe("info");
      expect(meta.completed.tone).toBe("success");
      expect(meta.cancelled.tone).toBe("neutral");
      expect(meta.nosupply.tone).toBe("danger");
    });
  });

  describe("C. 聯絡司機／客服真資料及無司機與未授權防護 (R09 / C018)", () => {
    it("returns explicit unassigned driver state when dispatch has no driver assigned yet", () => {
      const unassignedStatuses: OwnedOrderStatus[] = [
        "created",
        "submitted",
        "processing",
        "approved",
        "dispatch_requested",
        "no_supply",
        "delayed_queue",
        "exception_hold",
      ];

      for (const orderStatus of unassignedStatuses) {
        const record = createMockBookingRecord({ orderStatus });
        const driverContact = resolveEnterpriseTripDriverContact(record);

        expect(driverContact.assigned).toBe(false);
        expect(driverContact.name).toBe("尚未指派司機");
        expect(driverContact.phone).toBeNull();
        expect(driverContact.phoneAuthorized).toBe(false);
        expect(driverContact.disclosureStatus).toBe("not_assigned");
        expect(driverContact.contactNotice).toContain("尚未指派司機");
      }
    });

    it("differentiates no_supply state with danger tone and actionable guidance", () => {
      const record = createMockBookingRecord({ orderStatus: "no_supply" });
      const driverContact = resolveEnterpriseTripDriverContact(record);

      expect(driverContact.assigned).toBe(false);
      expect(driverContact.statusDescription).toBe("目前無可派車輛");
      expect(driverContact.statusTone).toBe("danger");
      expect(driverContact.contactNotice).toContain("暫無可派車輛");
    });

    it("strictly forbids disclosing driver phone when passengerDisclosure is unauthorized (資料未授權不可露出)", () => {
      const record = createMockBookingRecord({
        orderStatus: "enroute_pickup",
        passengerDisclosure: {
          channel: "ops_p5_disclosure_channel",
          policyId: "privacy-policy-2026",
          policyVersion: "v1.0",
          messageCode: "DISCLOSURE_ACK_REQUIRED",
          requiresAcknowledgement: true,
          acknowledgementMode: "explicit_click",
          acknowledgedAt: null,
          acknowledgementRecordId: null,
        },
      });

      const driverContact = resolveEnterpriseTripDriverContact(record, {
        driverOverride: {
          name: "陳建宏",
          phone: "+886911222333",
          vehicle: "Toyota Sienna · RBT-8899",
        },
      });

      expect(driverContact.assigned).toBe(true);
      expect(driverContact.name).toBe("陳建宏");
      expect(driverContact.phone).toBeNull();
      expect(driverContact.phoneAuthorized).toBe(false);
      expect(driverContact.disclosureStatus).toBe("unauthorized");
      expect(driverContact.contactNotice).toContain("隱私保護");
    });

    it("allows phone connection when driver is assigned and phone is authorized", () => {
      const record = createMockMockBookingRecordWithAuthDisclosure();

      const driverContact = resolveEnterpriseTripDriverContact(record, {
        driverOverride: {
          name: "張家豪",
          phone: "+886912000777",
          vehicle: "Toyota Alphard · ARJ-7720",
          rating: "4.9 ★",
          phoneAuthorized: true,
        },
      });

      expect(driverContact.assigned).toBe(true);
      expect(driverContact.name).toBe("張家豪");
      expect(driverContact.phone).toBe("+886912000777");
      expect(driverContact.phoneAuthorized).toBe(true);
      expect(driverContact.disclosureStatus).toBe("authorized");
      expect(driverContact.contactNotice).toBeNull();
    });

    it("verifies enterprise customer support contact details are authoritative", () => {
      expect(enterpriseTenant.supportPhone).toBe("0800-200-118");
      expect(enterpriseTenant.supportEmail).toBe(
        "dispatch-support@hongshuo.example",
      );
    });
  });

  describe("D. 不存在與合理空／404 處理 (R08 / R16 / C119)", () => {
    it("resolves not found cleanly for non-existent booking without claiming retryable temporary failure", async () => {
      const mockClient = {
        getBooking: async () => {
          const err = new Error("Booking was not found (404 BOOKING_NOT_FOUND)");
          (err as Record<string, unknown>).statusCode = 404;
          throw err;
        },
      };

      const result = await fetchAuthoritativeEnterpriseBooking(
        "EB-NONEXISTENT-999",
        mockClient,
      );

      expect(result.booking).toBeNull();
      expect(result.isNotFound).toBe(true);
      expect(result.error).toBeNull();
    });

    it("handles empty booking list gracefully without throwing or injecting fake bookings", async () => {
      const mockClient = {
        listBookings: async () => [],
      };

      const results = await fetchAuthoritativeEnterpriseBookings(mockClient);
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(0);
    });

    it("distinguishes upstream network errors from deterministic 404 not found", async () => {
      const offlineClient = {
        getBooking: async () => {
          throw new Error("connect ECONNREFUSED 127.0.0.1:3001");
        },
      };

      const result = await fetchAuthoritativeEnterpriseBooking(
        "BK-TIMEOUT-001",
        offlineClient,
      );

      expect(result.booking).toBeNull();
      expect(result.isNotFound).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
    });
  });
});

function createMockMockBookingRecordWithAuthDisclosure(): BookingRecord {
  return createMockBookingRecord({
    orderStatus: "enroute_pickup",
    passengerDisclosure: {
      channel: "ops_p5_disclosure_channel",
      policyId: "privacy-policy-2026",
      policyVersion: "v1.0",
      messageCode: null,
      requiresAcknowledgement: false,
      acknowledgementMode: "implicit_view",
      acknowledgedAt: "2026-09-06T08:00:00.000Z",
      acknowledgementRecordId: "ack-001",
    },
  });
}
