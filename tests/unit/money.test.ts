import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { sumMoney } from "../../apps/api/src/common/money";
import {
  LEGACY_PLATFORM_CURRENCY,
  PLATFORM_CURRENCY,
  normalisePlatformCurrency,
} from "@drts/contracts";

describe("money", () => {
  it("uses the ISO code for the New Taiwan Dollar", () => {
    // NTD is a colloquial abbreviation; an external payment or accounting
    // system will not recognise it.
    expect(PLATFORM_CURRENCY).toBe("TWD");
    expect(normalisePlatformCurrency(LEGACY_PLATFORM_CURRENCY)).toBe("TWD");
  });

  it("leaves a genuinely foreign currency alone", () => {
    // The shim maps one legacy spelling of one currency. Anything else must
    // stay recognisable as foreign rather than be quietly relabelled.
    expect(normalisePlatformCurrency("USD")).toBe("USD");
    expect(normalisePlatformCurrency("JPY")).toBe("JPY");
  });

  it("adds amounts in the same currency", () => {
    expect(
      sumMoney([
        { currency: "TWD", amountMinor: 12_000 },
        { currency: "TWD", amountMinor: 3_500 },
      ]),
    ).toEqual({ currency: "TWD", amountMinor: 15_500 });
  });

  it("treats the legacy code and the ISO code as the same money", () => {
    // Rows written before V0084 are still around during rollout.
    expect(
      sumMoney([
        { currency: "NTD", amountMinor: 100 },
        { currency: "TWD", amountMinor: 50 },
      ]),
    ).toEqual({ currency: "TWD", amountMinor: 150 });
  });

  it("refuses to add money that is not the same money", () => {
    // The implementation this replaces returned { currency: "USD", 150 } here:
    // the wrong number under a label that looks deliberate.
    try {
      sumMoney([
        { currency: "TWD", amountMinor: 100 },
        { currency: "USD", amountMinor: 50 },
      ]);
      throw new Error("expected the call to throw");
    } catch (error) {
      expect((error as ApiRequestError).code).toBe("MONEY_CURRENCY_MISMATCH");
    }
  });

  it("returns the platform currency for an empty sum", () => {
    expect(sumMoney([])).toEqual({
      currency: PLATFORM_CURRENCY,
      amountMinor: 0,
    });
  });
});
