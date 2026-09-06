import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../../../packages/api-client/src";
import {
  DEFAULT_BOOKING_FILTER_CRITERIA,
  filterEnterpriseBookings,
  formatBookingTime,
  gatewayHref,
  getBookingStateMeta,
  hasActiveFilters,
  matchesBookingDateRange,
  matchesBookingSearch,
  paginateEnterpriseBookings,
  type EnterpriseBookingFilterCriteria,
} from "./enterprise-search-logic";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BookingRecord } from "@drts/contracts";

function createMockBooking(
  overrides: Partial<BookingRecord> = {},
): BookingRecord {
  return {
    bookingId: "EB-7K2001",
    orderId: "ord_1001",
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
    reservationWindowStart: "2026-06-12T10:00:00.000Z",
    reservationWindowEnd: "2026-06-12T11:00:00.000Z",
    recurrenceRule: null,
    modifiableUntil: "2026-06-12T09:00:00.000Z",
    cancelableUntil: "2026-06-12T09:30:00.000Z",
    pickup: {
      address: "台北市信義區松仁路100號",
      lat: 25.034,
      lng: 121.567,
    },
    dropoff: {
      address: "新竹科學園區研發二路1號",
      lat: 24.782,
      lng: 121.006,
    },
    passenger: {
      name: "林宜君",
      phone: "0912-345-678",
      email: "lin.yj@hongshuo.example",
    },
    bookedBy: {
      name: "林宜君",
      email: "lin.yj@hongshuo.example",
    },
    onsiteContact: null,
    costCenter: "CC-PRD-01",
    vehiclePreference: "sedan",
    benefitReference: null,
    direction: null,
    flightNo: null,
    terminal: null,
    luggageCount: 1,
    notes: "主管用車",
    quotedFare: {
      amountMinor: 150000,
      currency: "TWD",
    },
    quotedFareSource: "rule_engine",
    quotedFareRuleVersion: "v1",
    manualFareOverride: null,
    approvalState: "approved",
    approvalRequestIds: [],
    orderStatus: "assigned",
    createdAt: "2026-06-10T08:00:00.000Z",
    updatedAt: "2026-06-10T08:30:00.000Z",
    ...overrides,
  };
}

describe("SR-ENTERPRISE-SEARCH-001: Enterprise Booking Search, Filter, and Pagination", () => {
  describe("1. Text Search Matching (`matchesBookingSearch`)", () => {
    const booking = createMockBooking({
      bookingId: "EB-7K2001",
      orderId: "ord_9999",
      passenger: {
        name: "陳思妤",
        phone: "0988-123-456",
        email: "chen@example.com",
      },
      pickup: { address: "台北君悅酒店" },
      dropoff: { address: "桃園國際機場 T2" },
      costCenter: "CC-SALES-02",
      flightNo: "CI-103",
    });

    it("matches passenger name case-insensitively", () => {
      expect(matchesBookingSearch(booking, "陳思妤")).toBe(true);
      expect(matchesBookingSearch(booking, "思妤")).toBe(true);
      expect(matchesBookingSearch(booking, "張大千")).toBe(false);
    });

    it("matches passenger phone number", () => {
      expect(matchesBookingSearch(booking, "0988")).toBe(true);
      expect(matchesBookingSearch(booking, "123-456")).toBe(true);
      expect(matchesBookingSearch(booking, "0911")).toBe(false);
    });

    it("matches booking ID and order ID", () => {
      expect(matchesBookingSearch(booking, "EB-7K2001")).toBe(true);
      expect(matchesBookingSearch(booking, "7k2001")).toBe(true);
      expect(matchesBookingSearch(booking, "ord_9999")).toBe(true);
      expect(matchesBookingSearch(booking, "EB-999999")).toBe(false);
    });

    it("matches pickup address and dropoff address", () => {
      expect(matchesBookingSearch(booking, "君悅酒店")).toBe(true);
      expect(matchesBookingSearch(booking, "桃園國際機場")).toBe(true);
      expect(matchesBookingSearch(booking, "高雄車站")).toBe(false);
    });

    it("matches cost center and flight number", () => {
      expect(matchesBookingSearch(booking, "CC-SALES-02")).toBe(true);
      expect(matchesBookingSearch(booking, "CI-103")).toBe(true);
      expect(matchesBookingSearch(booking, "CC-FIN-01")).toBe(false);
    });

    it("returns true for empty or whitespace query", () => {
      expect(matchesBookingSearch(booking, "")).toBe(true);
      expect(matchesBookingSearch(booking, "   ")).toBe(true);
    });
  });

  describe("2. Date Range Matching (`matchesBookingDateRange`)", () => {
    const booking = createMockBooking({
      reservationWindowStart: "2026-06-12T14:30:00.000Z",
      createdAt: "2026-06-01T08:00:00.000Z",
    });

    it("matches dates within the range inclusive of boundaries", () => {
      expect(
        matchesBookingDateRange(booking, "2026-06-12", "2026-06-12"),
      ).toBe(true);
      expect(
        matchesBookingDateRange(booking, "2026-06-01", "2026-06-15"),
      ).toBe(true);
    });

    it("excludes dates before dateFrom", () => {
      expect(
        matchesBookingDateRange(booking, "2026-06-13", "2026-06-20"),
      ).toBe(false);
    });

    it("excludes dates after dateTo", () => {
      expect(
        matchesBookingDateRange(booking, "2026-06-01", "2026-06-11"),
      ).toBe(false);
    });

    it("matches with only dateFrom specified", () => {
      expect(matchesBookingDateRange(booking, "2026-06-10", "")).toBe(true);
      expect(matchesBookingDateRange(booking, "2026-06-15", "")).toBe(false);
    });

    it("matches with only dateTo specified", () => {
      expect(matchesBookingDateRange(booking, "", "2026-06-15")).toBe(true);
      expect(matchesBookingDateRange(booking, "", "2026-06-10")).toBe(false);
    });

    it("supports createdAt date field filtering", () => {
      expect(
        matchesBookingDateRange(
          booking,
          "2026-06-01",
          "2026-06-05",
          "createdAt",
        ),
      ).toBe(true);
      expect(
        matchesBookingDateRange(
          booking,
          "2026-06-02",
          "2026-06-05",
          "createdAt",
        ),
      ).toBe(false);
    });

    it("returns true when both dates are empty", () => {
      expect(matchesBookingDateRange(booking, "", "")).toBe(true);
    });
  });

  describe("3. Status Meta Resolution (`getBookingStateMeta`)", () => {
    it("maps cancelled status correctly", () => {
      const b1 = createMockBooking({ status: "cancelled" });
      const b2 = createMockBooking({ orderStatus: "cancelled" });
      expect(getBookingStateMeta(b1)).toEqual({
        key: "cancelled",
        label: "已取消",
        tone: "neutral",
      });
      expect(getBookingStateMeta(b2)).toEqual({
        key: "cancelled",
        label: "已取消",
        tone: "neutral",
      });
    });

    it("maps no_supply and dispatch_failed to nosupply", () => {
      const b = createMockBooking({ orderStatus: "no_supply" });
      expect(getBookingStateMeta(b)).toEqual({
        key: "nosupply",
        label: "無法派車",
        tone: "danger",
      });
    });

    it("maps pending approval to approval", () => {
      const b = createMockBooking({ approvalState: "pending" });
      expect(getBookingStateMeta(b)).toEqual({
        key: "approval",
        label: "待審批",
        tone: "warn",
      });
    });

    it("maps completed status correctly", () => {
      const b = createMockBooking({
        status: "completed",
        orderStatus: "completed",
      });
      expect(getBookingStateMeta(b)).toEqual({
        key: "completed",
        label: "已完成",
        tone: "success",
      });
    });

    it("maps on_trip and enroute states to enroute", () => {
      const bTrip = createMockBooking({ orderStatus: "on_trip" });
      const bEnroute = createMockBooking({ orderStatus: "enroute_pickup" });
      expect(getBookingStateMeta(bTrip)).toEqual({
        key: "enroute",
        label: "行程中",
        tone: "info",
      });
      expect(getBookingStateMeta(bEnroute)).toEqual({
        key: "enroute",
        label: "前往上車",
        tone: "info",
      });
    });

    it("maps assigned and driver_accepted to assigned", () => {
      const b = createMockBooking({ orderStatus: "assigned" });
      expect(getBookingStateMeta(b)).toEqual({
        key: "assigned",
        label: "已派車",
        tone: "primary",
      });
    });

    it("maps active without dispatch to reserved", () => {
      const b = createMockBooking({
        status: "active",
        orderStatus: "created",
      });
      expect(getBookingStateMeta(b)).toEqual({
        key: "reserved",
        label: "已預約",
        tone: "warn",
      });
    });
  });

  describe("4. Combined Filtering (`filterEnterpriseBookings`)", () => {
    const b1 = createMockBooking({
      bookingId: "EB-1",
      passenger: { name: "林宜君", phone: "0912-000-001" },
      bookedBy: { name: "林宜君", email: "lin@example.com" },
      status: "active",
      orderStatus: "assigned",
      reservationWindowStart: "2026-06-10T09:00:00.000Z",
    });
    const b2 = createMockBooking({
      bookingId: "EB-2",
      passenger: { name: "王大明", phone: "0912-000-002" },
      bookedBy: { name: "林宜君", email: "lin@example.com" },
      status: "active",
      orderStatus: "completed",
      reservationWindowStart: "2026-06-11T10:00:00.000Z",
    });
    const b3 = createMockBooking({
      bookingId: "EB-3",
      passenger: { name: "張美惠", phone: "0912-000-003" },
      bookedBy: { name: "張美惠", email: "chang@example.com" },
      status: "cancelled",
      orderStatus: "cancelled",
      reservationWindowStart: "2026-06-12T11:00:00.000Z",
    });
    const b4 = createMockBooking({
      bookingId: "EB-4",
      passenger: { name: "林宜君", phone: "0912-000-001" },
      bookedBy: { name: "高主管", email: "kao@example.com" },
      approvalState: "pending",
      status: "active",
      orderStatus: "ready_for_dispatch",
      reservationWindowStart: "2026-06-13T12:00:00.000Z",
    });

    const allBookings = [b1, b2, b3, b4];

    it("filters by scope: all returns all records", () => {
      const res = filterEnterpriseBookings(allBookings, {
        ...DEFAULT_BOOKING_FILTER_CRITERIA,
        scope: "all",
      });
      expect(res.map((b) => b.bookingId)).toEqual([
        "EB-4",
        "EB-3",
        "EB-2",
        "EB-1",
      ]); // Sorted newest first
    });

    it("filters by scope: mine returns self bookings", () => {
      const res = filterEnterpriseBookings(
        allBookings,
        {
          ...DEFAULT_BOOKING_FILTER_CRITERIA,
          scope: "mine",
        },
        "林宜君",
      );
      expect(res.map((b) => b.bookingId)).toEqual(["EB-4", "EB-1"]);
    });

    it("filters by scope: byme returns bookings made for others", () => {
      const res = filterEnterpriseBookings(
        allBookings,
        {
          ...DEFAULT_BOOKING_FILTER_CRITERIA,
          scope: "byme",
        },
        "林宜君",
      );
      expect(res.map((b) => b.bookingId)).toEqual(["EB-2"]);
    });

    it("filters by status category", () => {
      const cancelled = filterEnterpriseBookings(allBookings, {
        ...DEFAULT_BOOKING_FILTER_CRITERIA,
        status: "cancelled",
      });
      expect(cancelled.map((b) => b.bookingId)).toEqual(["EB-3"]);

      const completed = filterEnterpriseBookings(allBookings, {
        ...DEFAULT_BOOKING_FILTER_CRITERIA,
        status: "completed",
      });
      expect(completed.map((b) => b.bookingId)).toEqual(["EB-2"]);

      const approval = filterEnterpriseBookings(allBookings, {
        ...DEFAULT_BOOKING_FILTER_CRITERIA,
        status: "approval",
      });
      expect(approval.map((b) => b.bookingId)).toEqual(["EB-4"]);
    });

    it("combines scope, search keyword, and date range", () => {
      const res = filterEnterpriseBookings(
        allBookings,
        {
          scope: "all",
          q: "王大明",
          status: "completed",
          dateFrom: "2026-06-11",
          dateTo: "2026-06-11",
          dateField: "reservationStart",
        },
        "林宜君",
      );
      expect(res.map((b) => b.bookingId)).toEqual(["EB-2"]);
    });

    it("reports active filters correctly with hasActiveFilters", () => {
      expect(hasActiveFilters(DEFAULT_BOOKING_FILTER_CRITERIA)).toBe(false);
      expect(
        hasActiveFilters({
          ...DEFAULT_BOOKING_FILTER_CRITERIA,
          q: "test",
        }),
      ).toBe(true);
      expect(
        hasActiveFilters({
          ...DEFAULT_BOOKING_FILTER_CRITERIA,
          status: "cancelled",
        }),
      ).toBe(true);
      expect(
        hasActiveFilters({
          ...DEFAULT_BOOKING_FILTER_CRITERIA,
          scope: "mine",
        }),
      ).toBe(true);
      expect(
        hasActiveFilters({
          ...DEFAULT_BOOKING_FILTER_CRITERIA,
          dateFrom: "2026-06-01",
        }),
      ).toBe(true);
    });
  });

  describe("5. Pagination and Global Scope Prevention (`paginateEnterpriseBookings`)", () => {
    // Create 15 bookings
    const bookings = Array.from({ length: 15 }, (_, i) =>
      createMockBooking({
        bookingId: `EB-${String(i + 1).padStart(2, "0")}`,
        passenger: { name: `乘客 ${i + 1}`, phone: "0900" },
        status: i === 12 ? "cancelled" : "active",
        orderStatus: i === 12 ? "cancelled" : "assigned",
        reservationWindowStart: `2026-06-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
    );

    it("paginates page 1 of 15 items with pageSize 5", () => {
      const p1 = paginateEnterpriseBookings(bookings, 1, 5);
      expect(p1.total).toBe(15);
      expect(p1.totalPages).toBe(3);
      expect(p1.page).toBe(1);
      expect(p1.items.length).toBe(5);
      expect(p1.startIndex).toBe(0);
      expect(p1.endIndex).toBe(5);
      expect(p1.items[0]!.bookingId).toBe("EB-01");
      expect(p1.items[4]!.bookingId).toBe("EB-05");
    });

    it("paginates page 2 with pageSize 5", () => {
      const p2 = paginateEnterpriseBookings(bookings, 2, 5);
      expect(p2.page).toBe(2);
      expect(p2.items.length).toBe(5);
      expect(p2.startIndex).toBe(5);
      expect(p2.endIndex).toBe(10);
      expect(p2.items[0]!.bookingId).toBe("EB-06");
    });

    it("clamps out of bound page numbers", () => {
      const pOver = paginateEnterpriseBookings(bookings, 99, 5);
      expect(pOver.page).toBe(3);
      expect(pOver.items.length).toBe(5);

      const pUnder = paginateEnterpriseBookings(bookings, 0, 5);
      expect(pUnder.page).toBe(1);
    });

    it("CRITICAL REQUIREMENT: avoids '只篩目前頁假裝全域' (filters all data globally before pagination)", () => {
      // In the 15 bookings, the cancelled booking is EB-13, which would sit on page 3 if page 1 were only 5 items.
      // If an implementation wrongly paginated first (took page 1: EB-01 to EB-05) and then filtered,
      // searching for "cancelled" on page 1 would yield 0 items.
      // The correct implementation filters across all 15 records FIRST, then paginates the filtered result!
      const criteria: EnterpriseBookingFilterCriteria = {
        ...DEFAULT_BOOKING_FILTER_CRITERIA,
        status: "cancelled",
      };

      const filtered = filterEnterpriseBookings(bookings, criteria);
      expect(filtered.length).toBe(1);
      expect(filtered[0]!.bookingId).toBe("EB-13");

      const paged = paginateEnterpriseBookings(filtered, 1, 5);
      expect(paged.total).toBe(1);
      expect(paged.totalPages).toBe(1);
      expect(paged.items.length).toBe(1);
      expect(paged.items[0]!.bookingId).toBe("EB-13");
    });
  });

  describe("6. Empty States Consistency", () => {
    it("handles total empty state when bookings is empty array", () => {
      const emptyBookings: BookingRecord[] = [];
      const filtered = filterEnterpriseBookings(
        emptyBookings,
        DEFAULT_BOOKING_FILTER_CRITERIA,
      );
      const paged = paginateEnterpriseBookings(filtered, 1, 10);

      expect(filtered.length).toBe(0);
      expect(paged.total).toBe(0);
      expect(paged.totalPages).toBe(1);
      expect(paged.items).toEqual([]);
    });

    it("distinguishes filter empty state when bookings exist but none match criteria", () => {
      const bookings = [
        createMockBooking({
          bookingId: "EB-101",
          passenger: { name: "張三" },
          status: "active",
        }),
      ];

      const criteria: EnterpriseBookingFilterCriteria = {
        ...DEFAULT_BOOKING_FILTER_CRITERIA,
        q: "李四", // Does not match
      };

      const filtered = filterEnterpriseBookings(bookings, criteria);
      const paged = paginateEnterpriseBookings(filtered, 1, 10);

      expect(bookings.length).toBe(1); // raw records exist
      expect(filtered.length).toBe(0); // filtered results empty
      expect(paged.total).toBe(0);
      expect(hasActiveFilters(criteria)).toBe(true); // active filters present
    });
  });

  describe("7. Gateway Error Routing (`gatewayHref`)", () => {
    it("maps quota errors to /quota-blocked", () => {
      const err = new ApiClientError({
        code: "QUOTA_EXCEEDED",
        message: "Tenant quota exceeded",
        statusCode: 403,
        retryable: false,
        rawBody: "quota exceeded",
      });
      expect(gatewayHref(err)).toBe("/quota-blocked");
    });

    it("maps supply errors to /no-supply", () => {
      const err = new ApiClientError({
        code: "VEHICLE_UNAVAILABLE",
        message: "No vehicle supply",
        statusCode: 409,
        retryable: false,
        rawBody: "vehicle unavailable",
      });
      expect(gatewayHref(err)).toBe("/no-supply");
    });

    it("maps 500+ server errors to /degraded", () => {
      const err = new ApiClientError({
        code: "INTERNAL_ERROR",
        message: "Backend down",
        statusCode: 503,
        retryable: true,
        rawBody: "internal error",
      });
      expect(gatewayHref(err)).toBe("/degraded");
    });

    it("maps unknown errors to /degraded", () => {
      expect(gatewayHref(new Error("Network disconnect"))).toBe("/degraded");
    });
  });

  describe("8. Formatting Helpers (`formatBookingTime`)", () => {
    it("formats ISO datetime into MM/DD HH:mm", () => {
      const formatted = formatBookingTime("2026-06-12T18:30:00.000Z");
      expect(formatted).toMatch(/\d{2}\/\d{2} \d{2}:\d{2}/);
    });

    it("returns '-' for empty or null time", () => {
      expect(formatBookingTime("")).toBe("-");
    });
  });

  describe("9. Page Component Source Contract & Design System Compliance", () => {
    const pagePath = resolve(
      process.cwd(),
      "apps/enterprise-dispatch-web/app/bookings/page.tsx",
    );
    const source = readFileSync(pagePath, "utf-8");

    it("uses authoritative tenant client API rather than mock fixtures", () => {
      expect(source).toContain("getEnterpriseDispatchTenantClient");
      expect(source).toContain(".listBookings()");
      // Does not hardcode fake fixture list for bookings
      expect(source).not.toContain("ENT_BOOKINGS");
    });

    it("includes required test-ids for accessibility and automated acceptance", () => {
      expect(source).toContain('data-testid="enterprise-search-input"');
      expect(source).toContain('data-testid="enterprise-status-select"');
      expect(source).toContain('data-testid="enterprise-date-from"');
      expect(source).toContain('data-testid="enterprise-date-to"');
      expect(source).toContain('data-testid="enterprise-clear-filters"');
      expect(source).toContain('data-testid="enterprise-result-count"');
      expect(source).toContain('data-testid="enterprise-pagination"');
      expect(source).toContain('data-testid="enterprise-empty-state"');
      expect(source).toContain('data-testid="enterprise-filtered-empty-state"');
      expect(source).toContain('data-testid="enterprise-page-prev"');
      expect(source).toContain('data-testid="enterprise-page-next"');
    });

    it("matches canvas table columns and token styling", () => {
      expect(source).toContain("編號");
      expect(source).toContain("乘客 / 下單");
      expect(source).toContain("行程");
      expect(source).toContain("時間");
      expect(source).toContain("成本中心");
      expect(source).toContain("狀態");
    });
  });
});

