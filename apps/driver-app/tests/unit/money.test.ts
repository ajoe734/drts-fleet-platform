import { describe, expect, it } from "vitest";

import {
  buildMoneyAmount,
  formatAmountNumber,
  formatMoney,
  formatSignedAmountNumber,
  getCurrencyLabel,
  sumMoneyAmounts,
} from "../../lib/money";

describe("buildMoneyAmount", () => {
  it("defaults to zero TWD", () => {
    expect(buildMoneyAmount()).toEqual({ currency: "TWD", amountMinor: 0 });
  });

  it("keeps the supplied minor amount and currency", () => {
    expect(buildMoneyAmount(12345, "JPY")).toEqual({
      currency: "JPY",
      amountMinor: 12345,
    });
  });
});

describe("formatMoney", () => {
  it("renders a placeholder when the amount is missing", () => {
    expect(formatMoney(null)).toBe("金額待確認");
    expect(formatMoney(undefined)).toBe("金額待確認");
  });

  it("formats minor units as a zh-TW currency string with 2 decimals", () => {
    const formatted = formatMoney({ currency: "TWD", amountMinor: 123456 });
    expect(formatted).toContain("1,234.56");
  });

  it("formats negative amounts", () => {
    const formatted = formatMoney({ currency: "TWD", amountMinor: -5000 });
    expect(formatted).toContain("50.00");
    expect(formatted).toMatch(/[-−]/);
  });
});

describe("getCurrencyLabel", () => {
  it("maps known currencies to their short symbol", () => {
    expect(getCurrencyLabel("TWD")).toBe("NT$");
    expect(getCurrencyLabel("USD")).toBe("US$");
    expect(getCurrencyLabel("JPY")).toBe("¥");
  });

  it("falls back to the raw code for unknown currencies", () => {
    expect(getCurrencyLabel("EUR")).toBe("EUR");
  });

  it("returns an empty string for a missing currency", () => {
    expect(getCurrencyLabel(null)).toBe("");
    expect(getCurrencyLabel(undefined)).toBe("");
    expect(getCurrencyLabel("")).toBe("");
  });
});

describe("formatAmountNumber", () => {
  it("returns the default dash placeholder for a missing amount", () => {
    expect(formatAmountNumber(null)).toBe("—");
  });

  it("honours a custom zero placeholder for a missing amount", () => {
    expect(formatAmountNumber(undefined, { zeroPlaceholder: "無" })).toBe("無");
  });

  it("rounds to zero fraction digits by default", () => {
    expect(formatAmountNumber({ currency: "TWD", amountMinor: 123456 })).toBe(
      "1,235",
    );
  });

  it("honours an explicit fraction digit count", () => {
    expect(
      formatAmountNumber(
        { currency: "TWD", amountMinor: 123456 },
        { fractionDigits: 2 },
      ),
    ).toBe("1,234.56");
  });

  it("substitutes the zero placeholder when the amount is exactly zero", () => {
    expect(
      formatAmountNumber(
        { currency: "TWD", amountMinor: 0 },
        { zeroPlaceholder: "—" },
      ),
    ).toBe("—");
  });

  it("still renders zero when showSign is always", () => {
    expect(
      formatAmountNumber(
        { currency: "TWD", amountMinor: 0 },
        { zeroPlaceholder: "—", showSign: "always" },
      ),
    ).toBe("0");
  });

  it("uses a typographic minus sign for negative amounts", () => {
    expect(formatAmountNumber({ currency: "TWD", amountMinor: -25000 })).toBe(
      "−250",
    );
  });

  it("prefixes a plus sign only when showSign is always", () => {
    const amount = { currency: "TWD", amountMinor: 25000 };
    expect(formatAmountNumber(amount, { showSign: "always" })).toBe("+250");
    expect(formatAmountNumber(amount, { showSign: "auto" })).toBe("250");
    expect(formatAmountNumber(amount, { showSign: "never" })).toBe("250");
  });
});

describe("formatSignedAmountNumber", () => {
  it("always shows the sign for positive amounts", () => {
    expect(
      formatSignedAmountNumber({ currency: "TWD", amountMinor: 10000 }),
    ).toBe("+100");
  });

  it("shows a minus sign for negative amounts", () => {
    expect(
      formatSignedAmountNumber({ currency: "TWD", amountMinor: -10000 }),
    ).toBe("−100");
  });

  it("forwards fraction digits", () => {
    expect(
      formatSignedAmountNumber(
        { currency: "TWD", amountMinor: 10050 },
        { fractionDigits: 2 },
      ),
    ).toBe("+100.50");
  });
});

describe("sumMoneyAmounts", () => {
  it("sums minor amounts and adopts the first present currency", () => {
    expect(
      sumMoneyAmounts([
        null,
        { currency: "JPY", amountMinor: 100 },
        { currency: "JPY", amountMinor: 250 },
      ]),
    ).toEqual({ currency: "JPY", amountMinor: 350 });
  });

  it("skips null and undefined entries", () => {
    expect(
      sumMoneyAmounts([null, undefined, { currency: "TWD", amountMinor: 40 }]),
    ).toEqual({ currency: "TWD", amountMinor: 40 });
  });

  it("falls back to TWD for an empty list", () => {
    expect(sumMoneyAmounts([])).toEqual({ currency: "TWD", amountMinor: 0 });
  });

  it("honours an explicit currency fallback", () => {
    expect(sumMoneyAmounts([null], "USD")).toEqual({
      currency: "USD",
      amountMinor: 0,
    });
  });
});
