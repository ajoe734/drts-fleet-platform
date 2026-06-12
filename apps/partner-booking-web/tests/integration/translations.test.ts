import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { translations } from "@/lib/translations";

describe("partner-booking i18n dictionary", () => {
  it("marks the root document as zh-Hant", () => {
    const rootLayout = readFileSync(
      new URL("../../app/layout.tsx", import.meta.url),
      "utf8",
    );

    expect(rootLayout).toContain('<html lang="zh-Hant">');
  });

  it("keeps root metadata zh-TW primary", () => {
    const rootLayout = readFileSync(
      new URL("../../app/layout.tsx", import.meta.url),
      "utf8",
    );

    expect(rootLayout).toContain('title: "合作預約"');
    expect(rootLayout).toContain(
      "DRTS 白標合作預約入口，依合作夥伴路由提供卡友機場接送與其他方案流程。",
    );
  });

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
