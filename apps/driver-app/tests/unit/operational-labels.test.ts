import { describe, expect, it } from "vitest";

import { formatDriverTaskServiceProductLabel } from "../../lib/operational-labels";

describe("formatDriverTaskServiceProductLabel", () => {
  it("prefers the exact serviceProductCode when present", () => {
    expect(
      formatDriverTaskServiceProductLabel({
        serviceProductCode: "insurance_replacement_vehicle",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "enterprise_dispatch",
        dispatchSemantics: "reservation",
      }),
    ).toBe("insurance_replacement_vehicle");
  });

  it("falls back to the legacy broad label when exact code is missing", () => {
    expect(
      formatDriverTaskServiceProductLabel({
        serviceProductCode: null,
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "credit_card_airport_transfer",
        dispatchSemantics: "reservation",
      }),
    ).toBe("機場接送");
  });
});
