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
  brand?: Pick<PartnerBrand, "theme">,
): CSSProperties {
  const theme = brand?.theme ?? PARTNER_ROOT_CHROME;
  return {
    "--pbk-bg": theme.pageBackground,
    "--pbk-fg": theme.pageForeground,
    "--pbk-muted": theme.pageMuted,
    "--pbk-panel": theme.panel,
    "--pbk-panel-border": theme.panelBorder,
    "--pbk-accent": theme.accentText,
    "--pbk-accent-soft": theme.accentSoft,
  } as CSSProperties;
}
