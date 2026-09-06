import { describe, expect, it } from "vitest";

import type { BookingRecord } from "@drts/contracts";
import {
  deriveBookingDisplayState,
  formatEnterpriseReservationWindow,
  isSelfBooking,
  resolveEnterpriseBookingAddress,
  resolveEnterpriseBookingFetchOutcome,
} from "../../../../apps/enterprise-dispatch-web/lib/dispatch-fixture-adapter";

function bookingFixture(
  overrides: Partial<
    Pick<BookingRecord, "status" | "orderStatus" | "approvalState">
  >,
): Pick<BookingRecord, "status" | "orderStatus" | "approvalState"> {
  return {
    status: "active",
    orderStatus: "created",
    approvalState: "not_required",
    ...overrides,
  };
}

describe("SR-ENTERPRISE-DATA-001: enterprise home/trip real-booking adapters", () => {
  describe("deriveBookingDisplayState (R08 — authoritative state, not a fixed fixture value)", () => {
    it("maps a cancelled booking to 'cancelled' regardless of order status", () => {
      expect(
        deriveBookingDisplayState(
          bookingFixture({ status: "cancelled", orderStatus: "assigned" }),
        ),
      ).toBe("cancelled");
    });

    it("cancelled status takes priority over a no-supply order status", () => {
      expect(
        deriveBookingDisplayState(
          bookingFixture({ status: "cancelled", orderStatus: "no_supply" }),
        ),
      ).toBe("cancelled");
    });

    for (const orderStatus of [
      "no_supply",
      "dispatch_failed",
      "dispatch_timeout",
      "redispatch_required",
    ] as const) {
      it(`maps order status '${orderStatus}' to 'nosupply'`, () => {
        expect(
          deriveBookingDisplayState(bookingFixture({ orderStatus })),
        ).toBe("nosupply");
      });
    }

    it("maps a pending approval to 'approval' even when the order is already assigned", () => {
      expect(
        deriveBookingDisplayState(
          bookingFixture({ orderStatus: "assigned", approvalState: "pending" }),
        ),
      ).toBe("approval");
    });

    it("maps a completed order status to 'completed'", () => {
      expect(
        deriveBookingDisplayState(bookingFixture({ orderStatus: "completed" })),
      ).toBe("completed");
    });

    for (const orderStatus of [
      "on_trip",
      "enroute_pickup",
      "arrived_pickup",
      "proof_pending",
    ] as const) {
      it(`maps order status '${orderStatus}' to 'enroute'`, () => {
        expect(
          deriveBookingDisplayState(bookingFixture({ orderStatus })),
        ).toBe("enroute");
      });
    }

    for (const orderStatus of [
      "assigned",
      "driver_accepted",
      "preassigned",
    ] as const) {
      it(`maps order status '${orderStatus}' to 'assigned'`, () => {
        expect(
          deriveBookingDisplayState(bookingFixture({ orderStatus })),
        ).toBe("assigned");
      });
    }

    it("falls back to 'reserved' for an order not yet in any recognized active bucket", () => {
      expect(
        deriveBookingDisplayState(
          bookingFixture({ orderStatus: "ready_for_dispatch" }),
        ),
      ).toBe("reserved");
    });
  });

  describe("isSelfBooking", () => {
    it("is true when there is no bookedBy (nothing to delegate against)", () => {
      expect(
        isSelfBooking({
          passenger: { name: "林宜君", phone: "+886900000000" },
          bookedBy: null,
        }),
      ).toBe(true);
    });

    it("is true when bookedBy matches the passenger name", () => {
      expect(
        isSelfBooking({
          passenger: { name: "林冠廷", phone: "+886900000000" },
          bookedBy: { name: "林冠廷", email: "a@example.com" },
        }),
      ).toBe(true);
    });

    it("is false when bookedBy is a different person (delegate booking)", () => {
      expect(
        isSelfBooking({
          passenger: { name: "陳思妤", phone: "+886900000000" },
          bookedBy: { name: "林宜君", email: "a@example.com" },
        }),
      ).toBe(false);
    });
  });

  describe("resolveEnterpriseBookingAddress", () => {
    it("prefers the human-readable place name when present", () => {
      expect(
        resolveEnterpriseBookingAddress({
          address: "25.0697,121.5525",
          addressName: "TSA Terminal 1 arrival hall",
        }),
      ).toBe("TSA Terminal 1 arrival hall");
    });

    it("falls back to the raw address when addressName is missing", () => {
      expect(
        resolveEnterpriseBookingAddress({
          address: "台北君悅酒店",
          addressName: null,
        }),
      ).toBe("台北君悅酒店");
    });

    it("falls back to the raw address when addressName is blank", () => {
      expect(
        resolveEnterpriseBookingAddress({
          address: "台北君悅酒店",
          addressName: "   ",
        }),
      ).toBe("台北君悅酒店");
    });
  });

  describe("formatEnterpriseReservationWindow (Asia/Taipei fixed, no drift)", () => {
    it("formats a UTC timestamp using the Asia/Taipei local date/time", () => {
      // 2026-06-13T16:30:00Z is 2026-06-14T00:30 in Asia/Taipei (+08:00) —
      // exercises the exact UTC day-boundary case that caused date drift in
      // the sibling SR-BANK-001 (R16) bug.
      expect(formatEnterpriseReservationWindow("2026-06-13T16:30:00Z")).toBe(
        "06/14 00:30",
      );
    });

    it("returns an em dash for an unparseable timestamp instead of throwing", () => {
      expect(formatEnterpriseReservationWindow("not-a-date")).toBe("—");
    });
  });

  describe("resolveEnterpriseBookingFetchOutcome (R08 — 404 must never be reported as a retryable fault)", () => {
    it("treats a genuine 404 as not-found, never as a gateway/retry state", () => {
      const outcome = resolveEnterpriseBookingFetchOutcome({
        statusCode: 404,
        code: "BOOKING_NOT_FOUND",
        retryable: false,
      });
      expect(outcome).toEqual({ notFound: true, gatewayRoute: null });
    });

    it("still reports not-found for a 404 even if the error code also mentions quota/supply wording", () => {
      // Regression guard: notFound must be decided before any code-string
      // heuristic, otherwise a 404 could be misrouted to a gateway page.
      const outcome = resolveEnterpriseBookingFetchOutcome({
        statusCode: 404,
        code: "QUOTA_BOOKING_NOT_FOUND",
        retryable: true,
      });
      expect(outcome).toEqual({ notFound: true, gatewayRoute: null });
    });

    it("routes quota/policy errors to /quota-blocked", () => {
      const outcome = resolveEnterpriseBookingFetchOutcome({
        statusCode: 422,
        code: "QUOTA_EXCEEDED",
        retryable: false,
      });
      expect(outcome).toEqual({ notFound: false, gatewayRoute: "/quota-blocked" });
    });

    it("routes supply/vehicle-unavailable errors to /no-supply", () => {
      const outcome = resolveEnterpriseBookingFetchOutcome({
        statusCode: 409,
        code: "VEHICLE_UNAVAILABLE",
        retryable: false,
      });
      expect(outcome).toEqual({ notFound: false, gatewayRoute: "/no-supply" });
    });

    it("routes a 5xx error to /degraded even without a specific error code", () => {
      const outcome = resolveEnterpriseBookingFetchOutcome({
        statusCode: 503,
        code: "UPSTREAM_TIMEOUT",
        retryable: true,
      });
      expect(outcome).toEqual({ notFound: false, gatewayRoute: "/degraded" });
    });

    it("routes an unrecognized network/thrown error to /degraded (safe default)", () => {
      const outcome = resolveEnterpriseBookingFetchOutcome(
        new TypeError("fetch failed"),
      );
      expect(outcome).toEqual({ notFound: false, gatewayRoute: "/degraded" });
    });

    it("does not force a gateway redirect for an ordinary non-retryable 4xx with no specific code", () => {
      const outcome = resolveEnterpriseBookingFetchOutcome({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        retryable: false,
      });
      expect(outcome).toEqual({ notFound: false, gatewayRoute: null });
    });
  });
});
