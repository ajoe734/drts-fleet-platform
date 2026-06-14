import {
  enterpriseBookingDraft,
  enterpriseBookings,
  getEnterpriseBooking,
} from "@/lib/enterprise-fixtures";

describe("enterprise fixtures", () => {
  it("keeps enterprise booking semantics first-class", () => {
    expect(enterpriseBookingDraft.costCenter).toContain("CC-");
    expect(enterpriseBookingDraft.bookedBy).not.toHaveLength(0);
    expect(enterpriseBookingDraft.passenger).not.toHaveLength(0);
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
