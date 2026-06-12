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
    const programSitePage = readFileSync(
      new URL("../../app/[tenantSlug]/program/site/page.tsx", import.meta.url),
      "utf8",
    );
    const programSiteScreenPage = readFileSync(
      new URL(
        "../../app/[tenantSlug]/program/site/[screen]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const programEmbedPage = readFileSync(
      new URL("../../app/[tenantSlug]/program/embed/page.tsx", import.meta.url),
      "utf8",
    );
    const programEmbedScreenPage = readFileSync(
      new URL(
        "../../app/[tenantSlug]/program/embed/[screen]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const programScreens = readFileSync(
      new URL("../../lib/program-screens.tsx", import.meta.url),
      "utf8",
    );

    expect(programPage).toContain("getServerLocale");
    expect(programPage).toContain('data-program-surface="selector"');
    expect(programSitePage).toContain("getServerLocale");
    expect(programSitePage).toContain("locale={locale}");
    expect(programSitePage).toContain('surface="site"');
    expect(programSiteScreenPage).toContain("getServerLocale");
    expect(programSiteScreenPage).toContain("locale={locale}");
    expect(programSiteScreenPage).toContain('surface="site"');
    expect(programEmbedPage).toContain("getServerLocale");
    expect(programEmbedPage).toContain("locale={locale}");
    expect(programEmbedPage).toContain('surface="embed"');
    expect(programEmbedScreenPage).toContain("getServerLocale");
    expect(programEmbedScreenPage).toContain("locale={locale}");
    expect(programEmbedScreenPage).toContain('surface="embed"');
    expect(programScreens).toContain("getProgramScreenCopy(screen, locale)");
    expect(programScreens).toContain("translate(key, params, locale)");
  });

  it("keeps website funnel routes separate from banking-app embed routes", () => {
    const programScreens = readFileSync(
      new URL("../../lib/program-screens.tsx", import.meta.url),
      "utf8",
    );
    const legacyProgramScreenPage = readFileSync(
      new URL(
        "../../app/[tenantSlug]/program/[screen]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(programScreens).toContain(
      'export type PartnerProgramSurfaceKind = "site" | "embed"',
    );
    expect(programScreens).toContain('if (surface === "embed")');
    expect(programScreens).toContain("CARD_ONLY_SCREEN_IDS.has(screen.id)");
    expect(programScreens).toContain("!CARD_ONLY_SCREEN_IDS.has(screen.id)");
    expect(programScreens).toContain('basePath.endsWith("/embed")');
    expect(programScreens).toContain("data-program-surface={surface}");
    expect(legacyProgramScreenPage).toContain(
      "`/${tenantSlug}/program/embed/${segment}`",
    );
    expect(legacyProgramScreenPage).toContain(
      "`/${tenantSlug}/program/site/${segment}`",
    );
  });
});
