import { describe, expect, it } from "vitest";

import { displayMinor } from "../../lib/format";

const locales = ["zh", "en"] as const;

describe("Agency money displays canonical minor units as TWD", () => {
  it.each(locales)(
    "shows a completed 36500-minor fare as 365 TWD in %s",
    (locale) => {
      expect(displayMinor(36500, "TWD", locale)).toBe("365 TWD");
    },
  );

  it.each(locales)("preserves both fractional digits in %s", (locale) => {
    expect(displayMinor(12345, "TWD", locale)).toBe("123.45 TWD");
    expect(displayMinor(1, "TWD", locale)).toBe("0.01 TWD");
  });

  it.each(locales)(
    "keeps locale grouping without discarding cents in %s",
    (locale) => {
      expect(displayMinor(123456789, "TWD", locale)).toBe("1,234,567.89 TWD");
    },
  );

  it("preserves a signed amount while converting its minor units", () => {
    for (const locale of locales) {
      expect(displayMinor(-12345, "TWD", locale)).toBe("-123.45 TWD");
    }
  });

  it("preserves the existing optional currency suffix", () => {
    for (const locale of locales) {
      expect(displayMinor(12345, null, locale)).toBe("123.45");
      expect(displayMinor(12345, undefined, locale)).toBe("123.45");
    }
  });

  it("keeps a known zero distinct from an unknown amount", () => {
    for (const locale of locales) {
      expect(displayMinor(0, "TWD", locale)).toBe("0 TWD");
    }
  });

  it("keeps unavailable and non-finite amounts localized as missing", () => {
    for (const amount of [null, undefined, Number.NaN, Infinity, -Infinity]) {
      expect(displayMinor(amount, "TWD", "zh")).toBe("未提供");
      expect(displayMinor(amount, "TWD", "en")).toBe("Not provided");
    }
  });
});
