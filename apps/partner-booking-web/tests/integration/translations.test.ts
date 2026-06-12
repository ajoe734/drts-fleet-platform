import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { translations } from "@/lib/translations";

describe("partner-booking i18n dictionary", () => {
  it("marks the root document from the resolved locale", () => {
    const rootLayout = readFileSync(
      new URL("../../app/layout.tsx", import.meta.url),
      "utf8",
    );

    expect(rootLayout).toContain("getServerLocale");
    expect(rootLayout).toContain('locale === "zh" ? "zh-Hant" : "en"');
  });

  it("keeps root metadata zh-TW primary through the dictionary", () => {
    const rootLayout = readFileSync(
      new URL("../../app/layout.tsx", import.meta.url),
      "utf8",
    );

    expect(translations.zh["app.title"]).toBe("合作預約");
    expect(translations.zh["app.description"]).toBe(
      "DRTS 白標合作預約入口，依合作夥伴路由提供卡友機場接送與其他方案流程。",
    );
    expect(rootLayout).toContain('title: t("app.title", undefined, "zh")');
    expect(rootLayout).toContain(
      'description: t("app.description", undefined, "zh")',
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

  it("passes the server locale through partner program screen routes", () => {
    const programPage = readFileSync(
      new URL("../../app/[tenantSlug]/program/page.tsx", import.meta.url),
      "utf8",
    );
    const programScreenPage = readFileSync(
      new URL(
        "../../app/[tenantSlug]/program/[screen]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const programScreens = readFileSync(
      new URL("../../lib/program-screens.tsx", import.meta.url),
      "utf8",
    );

    expect(programPage).toContain("getServerLocale");
    expect(programPage).toContain("locale={locale}");
    expect(programScreenPage).toContain("getServerLocale");
    expect(programScreenPage).toContain("locale={locale}");
    expect(programScreens).toContain("getProgramScreenCopy(screen, locale)");
    expect(programScreens).toContain("translate(key, params, locale)");
  });
});
