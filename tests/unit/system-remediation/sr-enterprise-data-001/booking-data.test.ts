import { describe, expect, it, vi } from "vitest";
import type { BookingRecord } from "@drts/contracts";
import { bookingHref, bookingReadError, homeBookings, readTrip, tripHref, tripStage } from "../../../../apps/enterprise-dispatch-web/app/trip/booking-data";

// Deliberately minimal unit inputs; these are not live booking evidence.
function booking(bookingId: string, orderStatus: BookingRecord["orderStatus"], status: BookingRecord["status"] = "active") {
  return { bookingId, orderStatus, status, reservationWindowStart: "2026-09-08T15:00:00Z" } as BookingRecord;
}

describe("authoritative enterprise booking selection", () => {
  it("excludes terminal bookings and preserves the same active resource", async () => {
    const active = booking("unit-active", "enroute_pickup");
    const records = [booking("unit-cancelled", "cancelled", "cancelled"), booking("unit-complete", "completed", "completed"), active];
    expect(homeBookings(records)).toEqual({ active, upcoming: [active] });
    expect(await readTrip({ listBookings: async () => records, getBooking: vi.fn() })).toBe(active);
    expect(records).toHaveLength(3);
  });

  it("does not substitute an active booking for a missing explicit ID", async () => {
    const missing = { statusCode: 404 };
    const client = { listBookings: vi.fn(async () => [booking("unit-other", "on_trip")]), getBooking: vi.fn().mockRejectedValue(missing) };
    await expect(readTrip(client, "unit-missing")).rejects.toBe(missing);
    expect(client.getBooking).toHaveBeenCalledWith("unit-missing");
    expect(client.listBookings).not.toHaveBeenCalled();
    expect(bookingReadError(missing)).toBe("not-found");
  });

  it("returns empty when no active trip exists", async () => {
    expect(await readTrip({ listBookings: async () => [], getBooking: vi.fn() })).toBeNull();
  });

  it.each([["assigned", 0], ["driver_accepted", 0], ["enroute_pickup", 1], ["arrived_pickup", 2], ["on_trip", 3], ["proof_pending", 3], ["completed", 4]] as const)("maps %s to stage %s", (status, stage) => {
    expect(tripStage(booking("unit-stage", status))).toBe(stage);
    expect(tripStage(booking("unit-cancelled", status, "cancelled"))).toBeNull();
  });

  it.each([[401, "unauthorized"], [403, "forbidden"], [404, "not-found"], [400, "rejected"], [429, "unavailable"], [503, "unavailable"]])("classifies HTTP %s as %s", (statusCode, expected) => {
    expect(bookingReadError({ statusCode })).toBe(expected);
  });

  it("encodes resource IDs in both destinations", () => {
    expect(bookingHref("id/with?query")).toBe("/bookings/id%2Fwith%3Fquery");
    expect(tripHref("id/with?query")).toBe("/trip?bookingId=id%2Fwith%3Fquery");
  });
});
