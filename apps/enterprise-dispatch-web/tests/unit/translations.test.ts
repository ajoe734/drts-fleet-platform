import { describe, expect, it } from "vitest";

import { t, translations } from "../../lib/translations";

describe("enterprise dispatch i18n dictionary", () => {
  it("keeps English and Traditional Chinese keys aligned", () => {
    expect(Object.keys(translations.zh).sort()).toEqual(
      Object.keys(translations.en).sort(),
    );
  });

  it("localizes visible card sublabels", () => {
    expect(t("card.sub.enterprisePolicy", undefined, "en")).toBe(
      "Enterprise policy",
    );
    expect(t("card.sub.enterprisePolicy", undefined, "zh")).toBe(
      "企業政策",
    );
    expect(t("card.sub.costOwnershipApproval", undefined, "zh")).toBe(
      "費用歸屬 · 審批",
    );
    expect(t("card.sub.passengerVsBookedBy", undefined, "zh")).toBe(
      "乘客 vs 下單人",
    );
    expect(t("card.sub.availableActions", undefined, "zh")).toBe("可用操作");
  });
});
