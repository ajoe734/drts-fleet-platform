import { describe, expect, it } from "vitest";

import {
  formatDriverServiceProductLabel,
  resolveDriverServiceProductCode,
} from "../../lib/operational-labels";

describe("driver service product labels", () => {
  it("prefers the exact serviceProductCode when present", () => {
    expect(
      formatDriverServiceProductLabel({
        serviceProductCode: "credit_card_airport_transfer",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "enterprise_dispatch",
        dispatchSemantics: "reservation",
      }),
    ).toBe("機場接送");
  });

  it("never lets the raw service product code leak into the label", () => {
    expect(
      formatDriverServiceProductLabel({
        serviceProductCode: "credit_card_airport_transfer",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "enterprise_dispatch",
        dispatchSemantics: "reservation",
      }),
    ).not.toMatch(/[a-z]+_[a-z_]+/);
  });

  it("falls back to standard taxi reservation when exact code is absent", () => {
    expect(
      resolveDriverServiceProductCode({
        serviceProductCode: null,
        serviceBucket: "standard_taxi",
        businessDispatchSubtype: null,
        dispatchSemantics: "reservation",
      }),
    ).toBe("taxi_reservation");
  });

  it("maps forwarded broadcasts to the forwarded exact product code", () => {
    expect(
      formatDriverServiceProductLabel(
        {
          serviceProductCode: null,
          serviceBucket: "standard_taxi",
          businessDispatchSubtype: null,
          dispatchSemantics: "forwarder_broadcast",
        },
        "en",
      ),
    ).toBe("Third-party Forwarded Order");
  });
});
