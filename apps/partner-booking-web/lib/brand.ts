import {
  PARTNER_DEFAULT_THEME,
  getPartnerBrandTemplateBySlug,
  listPartnerBrandTemplates,
  type PartnerBrandTemplate,
} from "@drts/ui-tokens";
import type { CSSProperties } from "react";

export type PartnerBrand = PartnerBrandTemplate;

export const PARTNER_ROOT_CHROME = PARTNER_DEFAULT_THEME;

export function listKnownBrands(): ReadonlyArray<PartnerBrand> {
  return listPartnerBrandTemplates();
}

export function listKnownBrandSlugs(): ReadonlyArray<string> {
  return listPartnerBrandTemplates().map((brand) => brand.slug);
}

export function getBrandForSlug(slug: string): PartnerBrand | undefined {
  return getPartnerBrandTemplateBySlug(slug);
}

export function getPartnerChromeVars(
  brand?: Pick<
    PartnerBrand,
    "theme" | "primary" | "primaryDark" | "accent" | "surface" | "cardArt"
  >,
): CSSProperties {
  const theme = brand?.theme ?? PARTNER_ROOT_CHROME;
  const primary = brand?.primary ?? "#1B4FA0";
  const primaryDark = brand?.primaryDark ?? "#0A2A6E";
  const accent = brand?.accent ?? theme.accentText;
  const surface = brand?.surface;
  const cardArt = brand?.cardArt;
  return {
    "--pbk-bg": "#08111f",
    "--pbk-fg": "#f8fafc",
    "--pbk-muted": "rgba(226, 232, 240, 0.72)",
    "--pbk-panel": "rgba(8, 15, 28, 0.84)",
    "--pbk-panel-border": "rgba(148, 163, 184, 0.18)",
    "--pbk-accent": accent,
    "--pbk-accent-soft": theme.accentSoft,
    "--pbk-primary": primary,
    "--pbk-primary-dark": primaryDark,
    "--pbk-surface-bg": surface?.bg ?? theme.panel,
    "--pbk-surface-border": surface?.border ?? theme.panelBorder,
    "--pbk-badge-bg": cardArt?.badgeBackground ?? accent,
    "--pbk-badge-fg": cardArt?.badgeForeground ?? primaryDark,
  } as CSSProperties;
}
