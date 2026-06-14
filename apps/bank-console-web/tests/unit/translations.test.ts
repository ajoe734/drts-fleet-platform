import { describe, expect, it } from "vitest";
import { translations } from "../../lib/translations";

describe("bank-console i18n dictionary", () => {
  it("keeps English and zh-TW translation keys in lockstep", () => {
    const englishKeys = Object.keys(translations.en).sort();
    const zhKeys = Object.keys(translations.zh).sort();

    expect(zhKeys).toEqual(englishKeys);
  });

  it.each(["en", "zh"] as const)(
    "has non-empty %s translations for every key",
    (locale) => {
      for (const [key, value] of Object.entries(translations[locale])) {
        expect(value, `${locale}.${key}`).toEqual(expect.any(String));
        expect(value.trim(), `${locale}.${key}`).not.toHaveLength(0);
      }
    },
  );
});
