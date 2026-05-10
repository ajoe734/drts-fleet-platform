import {
  getPartnerBrandTemplateBySlug,
  listPartnerBrandTemplates,
  type PartnerBrandTemplate,
} from "@drts/ui-tokens";

export type PartnerBrand = PartnerBrandTemplate;

export function listKnownBrands(): ReadonlyArray<PartnerBrand> {
  return listPartnerBrandTemplates();
}

export function listKnownBrandSlugs(): ReadonlyArray<string> {
  return listPartnerBrandTemplates().map((brand) => brand.slug);
}

export function getBrandForSlug(slug: string): PartnerBrand | undefined {
  return getPartnerBrandTemplateBySlug(slug);
}
