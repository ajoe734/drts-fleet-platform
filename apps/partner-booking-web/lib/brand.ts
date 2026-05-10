import { SURFACE_ACCENTS, type AccentRamp } from "@drts/ui-tokens";

export interface PartnerBrand {
  readonly slug: string;
  readonly displayName: string;
  readonly tagline: string;
  readonly accent: AccentRamp;
}

const NEUTRAL_PLACEHOLDER_TAGLINE =
  "Booking surface placeholder. Tenant-specific brand wiring lands in PBK-UI-002.";

const KNOWN_BRANDS: ReadonlyArray<PartnerBrand> = [
  {
    slug: "ctbc",
    displayName: "CTBC World Elite",
    tagline: NEUTRAL_PLACEHOLDER_TAGLINE,
    accent: SURFACE_ACCENTS.partner.light,
  },
  {
    slug: "demo",
    displayName: "Demo Partner",
    tagline: NEUTRAL_PLACEHOLDER_TAGLINE,
    accent: SURFACE_ACCENTS.partner.light,
  },
];

export function listKnownBrandSlugs(): ReadonlyArray<string> {
  return KNOWN_BRANDS.map((brand) => brand.slug);
}

export function getBrandForSlug(slug: string): PartnerBrand | undefined {
  return KNOWN_BRANDS.find((brand) => brand.slug === slug);
}
