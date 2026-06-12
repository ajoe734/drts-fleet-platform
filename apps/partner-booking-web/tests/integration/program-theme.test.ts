import { describe, expect, it } from "vitest";
import { BRAND_TEMPLATES } from "@drts/ui-tokens";
import {
  DEFAULT_PARTNER_PROGRAM_KIND,
  PARTNER_PROGRAM_KINDS,
  getProgramChromeVars,
  getProgramThemeForTenantSlug,
  getProgramTheme,
  getProgramThemeForEntry,
  getProgramThemeForSlug,
  isCardAirportIssuerBrand,
  isPartnerProgramSurfaceBrand,
  isPartnerProgramKind,
  listProgramThemes,
  resolveProgramKind,
} from "@/lib/program-theme";

describe("partner-booking per-program theming", () => {
  it("exposes the three program kinds with distinct palettes", () => {
    const themes = listProgramThemes();
    expect(themes.map((t) => t.kind)).toEqual(["card", "insurance", "travel"]);

    const primaries = new Set(themes.map((t) => t.primary));
    expect(primaries.size).toBe(3);

    const accents = new Set(themes.map((t) => t.accent));
    expect(accents.size).toBe(3);

    for (const theme of themes) {
      expect(theme.programLabel).toBeTruthy();
      expect(theme.issuerName).toBeTruthy();
      expect(theme.benefitNoun).toBeTruthy();
    }
  });

  it("resolves the program kind from slug, host, and keyword tokens", () => {
    expect(resolveProgramKind("card")).toBe("card");
    expect(resolveProgramKind("insurance")).toBe("insurance");
    expect(resolveProgramKind("travel")).toBe("travel");

    expect(resolveProgramKind("ride.ctbc.com.tw")).toBe("card");
    expect(resolveProgramKind("claim.fubon-ins.com.tw")).toBe("insurance");
    expect(resolveProgramKind("booking.lion-travel.com.tw")).toBe("travel");

    expect(resolveProgramKind("ctbc-elite")).toBe("card");
    expect(resolveProgramKind("fubon-claim-mobility")).toBe("insurance");
    expect(resolveProgramKind("lion-group-airport")).toBe("travel");

    expect(resolveProgramKind("信用卡機場接送")).toBe("card");
    expect(resolveProgramKind("保險理賠代步")).toBe("insurance");
    expect(resolveProgramKind("旅行社團體接送")).toBe("travel");
  });

  it("falls back to the default kind for empty or unknown input", () => {
    expect(resolveProgramKind()).toBe(DEFAULT_PARTNER_PROGRAM_KIND);
    expect(resolveProgramKind("")).toBe(DEFAULT_PARTNER_PROGRAM_KIND);
    expect(resolveProgramKind("zzz-unmatched")).toBe(
      DEFAULT_PARTNER_PROGRAM_KIND,
    );
  });

  it("maps slugs to the matching theme", () => {
    expect(getProgramThemeForSlug("claim-fubon-ins").kind).toBe("insurance");
    expect(getProgramThemeForSlug("ride-ctbc").kind).toBe("card");
    expect(getProgramThemeForSlug("booking-lion-travel").kind).toBe("travel");
  });

  it("keeps card airport-transfer tenant themes on the bank issuer brand", () => {
    const cathay = getProgramThemeForTenantSlug(
      "cathay",
      BRAND_TEMPLATES.CATHAY,
    );
    const taishin = getProgramThemeForTenantSlug(
      "taishin",
      BRAND_TEMPLATES.TAISHIN,
    );
    const dbs = getProgramThemeForTenantSlug("dbs", BRAND_TEMPLATES.DBS);

    expect(cathay.kind).toBe("card");
    expect(cathay.issuerName).toBe("國泰世華銀行");
    expect(cathay.primary).toBe(BRAND_TEMPLATES.CATHAY.primary);
    expect(cathay.host).toBe("ride.cathaybk.com.tw");

    expect(taishin.kind).toBe("card");
    expect(taishin.issuerName).toBe("台新銀行");
    expect(taishin.primary).toBe("#B0335F");

    expect(dbs.kind).toBe("card");
    expect(dbs.issuerName).toBe("星展銀行");
    expect(dbs.primary).toBe("#D72631");
  });

  it("does not treat insurance and travel tenant brands as card issuers", () => {
    expect(isCardAirportIssuerBrand(BRAND_TEMPLATES.CTBC)).toBe(true);
    expect(isCardAirportIssuerBrand(BRAND_TEMPLATES.CATHAY)).toBe(true);
    expect(isCardAirportIssuerBrand(BRAND_TEMPLATES.TAISHIN)).toBe(true);
    expect(isCardAirportIssuerBrand(BRAND_TEMPLATES.DBS)).toBe(true);
    expect(isCardAirportIssuerBrand(BRAND_TEMPLATES.FUBON)).toBe(false);
    expect(isCardAirportIssuerBrand(BRAND_TEMPLATES.LION)).toBe(false);
    expect(isPartnerProgramSurfaceBrand(BRAND_TEMPLATES.GRAND)).toBe(false);
    expect(isPartnerProgramSurfaceBrand(BRAND_TEMPLATES.FUBON)).toBe(true);
    expect(isPartnerProgramSurfaceBrand(BRAND_TEMPLATES.LION)).toBe(true);

    expect(
      getProgramThemeForTenantSlug("fubon", BRAND_TEMPLATES.FUBON).kind,
    ).toBe("insurance");
    expect(
      getProgramThemeForTenantSlug("lion", BRAND_TEMPLATES.LION).kind,
    ).toBe("travel");
  });

  it("reuses the canonical CTBC brand tokens for the card program", () => {
    const theme = getProgramTheme("card");
    const brand = BRAND_TEMPLATES.CTBC;

    expect(theme.primary).toBe("#13478F");
    expect(theme.accent).toBe("#A8771B");
    expect(theme.primary).toBe(brand.primary);
    expect(theme.primaryDark).toBe(brand.primaryDark);
    expect(theme.accent).toBe(brand.accent);
    expect(theme.surface).toEqual(brand.surface);
    expect(theme.chrome.pageBackground).toBe(brand.theme.pageBackground);
    expect(theme.chrome.accentText).toBe(brand.theme.accentText);
  });

  it("reuses the canonical Fubon brand tokens for the insurance program", () => {
    const theme = getProgramTheme("insurance");
    const brand = BRAND_TEMPLATES.FUBON;

    expect(theme.primary).toBe("#0E6E50");
    expect(theme.accent).toBe("#2FA37A");
    expect(theme.primary).toBe(brand.primary);
    expect(theme.primaryDark).toBe(brand.primaryDark);
    expect(theme.accent).toBe(brand.accent);
    expect(theme.surface).toEqual(brand.surface);
    expect(theme.chrome.pageBackground).toBe(brand.theme.pageBackground);
    expect(theme.chrome.accentText).toBe(brand.theme.accentText);
  });

  it("resolves a theme from a partner entry, preferring specific identifiers", () => {
    expect(
      getProgramThemeForEntry({
        programCode: "FUBON_CLAIM",
        entrySlug: "generic",
      }).kind,
    ).toBe("insurance");

    expect(
      getProgramThemeForEntry({
        entryHost: "booking.lion-travel.com.tw",
      }).kind,
    ).toBe("travel");

    expect(getProgramThemeForEntry({}).kind).toBe(DEFAULT_PARTNER_PROGRAM_KIND);
  });

  it("emits shared and program-scoped CSS variables", () => {
    const theme = getProgramTheme("travel");
    const vars = getProgramChromeVars(theme) as Record<string, string>;
    expect(vars["--pbk-bg"]).toBe(theme.chrome.pageBackground);
    expect(vars["--pbk-primary"]).toBe(theme.primary);
    expect(vars["--pbk-primary-dark"]).toBe(theme.primaryDark);
    expect(vars["--pbk-accent-strong"]).toBe(theme.accent);
  });

  it("keeps the travel palette aligned with the canvas theme", () => {
    const theme = getProgramTheme("travel");
    const brand = BRAND_TEMPLATES.LION;
    expect(theme.primary).toBe("#B0420E");
    expect(theme.primaryDark).toBe("#6E2806");
    expect(theme.accent).toBe("#E07B3A");
    expect(theme.surface.bg).toBe("#FCEEE2");
    expect(theme.primary).toBe(brand.primary);
    expect(theme.surface).toEqual(brand.surface);
    expect(theme.primaryDark).toBe(brand.primaryDark);
    expect(theme.accent).toBe(brand.accent);
    expect(theme.chrome.pageBackground).toBe(brand.theme.pageBackground);
  });

  it("validates program kind strings", () => {
    for (const kind of PARTNER_PROGRAM_KINDS) {
      expect(isPartnerProgramKind(kind)).toBe(true);
    }
    expect(isPartnerProgramKind("bank")).toBe(false);
  });
});
