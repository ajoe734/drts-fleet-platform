import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARTNER_PROGRAM_KIND,
  PARTNER_PROGRAM_KINDS,
  getProgramChromeVars,
  getProgramTheme,
  getProgramThemeForEntry,
  getProgramThemeForSlug,
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

    expect(getProgramThemeForEntry({}).kind).toBe(
      DEFAULT_PARTNER_PROGRAM_KIND,
    );
  });

  it("emits shared and program-scoped CSS variables", () => {
    const theme = getProgramTheme("travel");
    const vars = getProgramChromeVars(theme) as Record<string, string>;
    expect(vars["--pbk-bg"]).toBe(theme.chrome.pageBackground);
    expect(vars["--pbk-primary"]).toBe(theme.primary);
    expect(vars["--pbk-primary-dark"]).toBe(theme.primaryDark);
    expect(vars["--pbk-accent-strong"]).toBe(theme.accent);
  });

  it("validates program kind strings", () => {
    for (const kind of PARTNER_PROGRAM_KINDS) {
      expect(isPartnerProgramKind(kind)).toBe(true);
    }
    expect(isPartnerProgramKind("bank")).toBe(false);
  });
});
