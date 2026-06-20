import {
  enterpriseBookingDraft,
  enterpriseBookings,
  getEnterpriseBooking,
} from "@/lib/enterprise-fixtures";
import { t, translations } from "@/lib/translations";

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

  it("keeps enterprise dispatch translation keys in lockstep", () => {
    expect(Object.keys(translations.zh).sort()).toEqual(
      Object.keys(translations.en).sort(),
    );
  });

  it("localizes visible card sublabels", () => {
    expect(t("card.sub.helperReads", undefined, "en")).toBe("helper reads");
    expect(t("card.sub.helperReads", undefined, "zh")).toBe("即時檢核");
    expect(t("card.sub.costOwnershipApproval", undefined, "en")).toBe(
      "cost ownership · approval",
    );
    expect(t("card.sub.costOwnershipApproval", undefined, "zh")).toBe(
      "費用歸屬 · 審批",
    );
    expect(t("card.sub.handoffToken", undefined, "zh")).toBe("已簽署交付權杖");
  });
});
