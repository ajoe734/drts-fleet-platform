import {
  enterpriseBookingDraft,
  enterpriseBookings,
  getEnterpriseBooking,
  getEnterpriseBookingCommandFixture,
} from "@/lib/enterprise-fixtures";

describe("enterprise fixtures", () => {
  it("keeps enterprise booking semantics first-class", () => {
    expect(enterpriseBookingDraft.costCenter).toContain("CC-");
    expect(enterpriseBookingDraft.bookedBy).not.toHaveLength(0);
    expect(enterpriseBookingDraft.passenger).not.toHaveLength(0);
  });

  it("keeps the deployed submit fixture inside the Taipei service area", () => {
    const fixture = getEnterpriseBookingCommandFixture(
      new Date("2026-07-24T00:00:00.000Z"),
    );

    expect(enterpriseBookingDraft.pickup).toBe("fixture.place.songshanT1Full");
    expect(fixture.pickupLat).toBeGreaterThanOrEqual(25.0005);
    expect(fixture.pickupLat).toBeLessThanOrEqual(25.125);
    expect(fixture.pickupLng).toBeGreaterThanOrEqual(121.4505);
    expect(fixture.pickupLng).toBeLessThanOrEqual(121.625);
  });

  it("includes both receipt-ready and non-receipt bookings", () => {
    expect(enterpriseBookings.some((booking) => booking.receiptReady)).toBe(
      true,
    );
    expect(enterpriseBookings.some((booking) => !booking.receiptReady)).toBe(
      true,
    );
  });

  it("looks up bookings by id", () => {
    expect(getEnterpriseBooking("EB-7K28Z2")?.fare).toBe("NT$ 2,180");
    expect(getEnterpriseBooking("missing")).toBeUndefined();
  });
});
