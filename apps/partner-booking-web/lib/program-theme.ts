import type { CSSProperties } from "react";
import {
  BRAND_TEMPLATES,
  getPartnerBrandTemplateBySlug,
  type PartnerBrandCode,
  type PartnerBrandTemplate,
} from "@drts/ui-tokens";

/**
 * Per-program theming for the partner-booking white-label flows.
 *
 * The partner-booking-web app hosts several program-branded funnels that all
 * share the same screens (landing / eligibility / review / success / tracking
 * / error / manual-review) but must switch primary/accent palette and brand
 * wording per program:
 *
 *  - `card`      信用卡機場接送   · 中信銀行 (ride.ctbc.com.tw)
 *  - `insurance` 保險理賠代步     · 富邦產險 (claim.fubon-ins.com.tw)
 *  - `travel`    旅行社團體接送   · 雄獅旅遊 (booking.lion-travel.com.tw)
 *
 * The program kind is an app-level UI classification, not a backend contract
 * enum (`BusinessDispatchSubtype` only covers the dispatch bucket). It is
 * resolved from the partner entry slug / host / program code so the same route
 * group renders the correct theme without backend coupling.
 *
 * Program-specific *forms* are owned by DH-PB-PROGRAM-FORMS; this module only
 * owns theming and the shared themed shell.
 */

export const PARTNER_PROGRAM_KINDS = ["card", "insurance", "travel"] as const;
export type PartnerProgramKind = (typeof PARTNER_PROGRAM_KINDS)[number];

export interface PartnerProgramSurface {
  /** Accent foreground used on tinted surfaces. */
  readonly fg: string;
  /** Highlight color (gold / lime / amber accent). */
  readonly hi: string;
  /** Tinted surface background. */
  readonly bg: string;
  /** Tinted surface border. */
  readonly border: string;
}

export interface PartnerProgramChrome {
  readonly pageBackground: string;
  readonly pageForeground: string;
  readonly pageMuted: string;
  readonly panel: string;
  readonly panelBorder: string;
  readonly accentText: string;
  readonly accentSoft: string;
}

export interface PartnerProgramHotline {
  readonly label: string;
  readonly phone: string;
  readonly note: string;
}

export interface PartnerProgramTheme {
  readonly kind: PartnerProgramKind;
  /** Canonical program slug used in routes and slug resolution. */
  readonly slug: string;
  /** Brand host for the program entry. */
  readonly host: string;
  /** Full issuer / sponsor name (品牌字樣). */
  readonly issuerName: string;
  /** Short issuer label used in compact badges. */
  readonly issuerLabel: string;
  /** Program display label (信用卡機場接送 / 保險理賠代步 / 旅行社團體接送). */
  readonly programLabel: string;
  /** Short program name reused inside copy. */
  readonly programName: string;
  /** One-line program tagline used for page metadata. */
  readonly tagline: string;
  /** Customer-facing landing subtitle shown in the card funnel band. */
  readonly landingSubtitle: string;
  /** Domain noun for the sponsored entitlement (禮遇 / 理賠額度 / 團體席次). */
  readonly benefitNoun: string;
  /** Primary call-to-action label for the landing / review screens. */
  readonly ctaLabel: string;
  /** Single-character brand badge glyph. */
  readonly badgeText: string;
  readonly primary: string;
  readonly primaryDark: string;
  readonly accent: string;
  readonly ink: string;
  readonly surface: PartnerProgramSurface;
  readonly chrome: PartnerProgramChrome;
  readonly hotline: PartnerProgramHotline;
}

const CTBC_BRAND = BRAND_TEMPLATES.CTBC;
const FUBON_BRAND = BRAND_TEMPLATES.FUBON;
const LION_BRAND = BRAND_TEMPLATES.LION;

const CARD_AIRPORT_ISSUER_CODES = [
  "CTBC",
  "CATHAY",
  "TAISHIN",
  "DBS",
] as const satisfies readonly PartnerBrandCode[];

type CardAirportIssuerCode = (typeof CARD_AIRPORT_ISSUER_CODES)[number];

function createProgramThemeFromBrand(params: {
  kind: PartnerProgramKind;
  slug: string;
  issuerName: string;
  issuerLabel: string;
  programLabel: string;
  programName: string;
  landingSubtitle: string;
  benefitNoun: string;
  ctaLabel: string;
  brand: PartnerBrandTemplate;
}): PartnerProgramTheme {
  const {
    kind,
    slug,
    issuerName,
    issuerLabel,
    programLabel,
    programName,
    landingSubtitle,
    benefitNoun,
    ctaLabel,
    brand,
  } = params;
  return {
    kind,
    slug,
    host: brand.host,
    issuerName,
    issuerLabel,
    programLabel,
    programName,
    tagline: brand.tagline,
    landingSubtitle,
    benefitNoun,
    ctaLabel,
    badgeText: brand.cardArt.badgeText,
    primary: brand.primary,
    primaryDark: brand.primaryDark,
    accent: brand.accent,
    ink: brand.ink,
    surface: {
      fg: brand.surface.fg,
      hi: brand.surface.hi,
      bg: brand.surface.bg,
      border: brand.surface.border,
    },
    chrome: {
      pageBackground: brand.theme.pageBackground,
      pageForeground: brand.theme.pageForeground,
      pageMuted: brand.theme.pageMuted,
      panel: brand.theme.panel,
      panelBorder: brand.theme.panelBorder,
      accentText: brand.theme.accentText,
      accentSoft: brand.theme.accentSoft,
    },
    hotline: {
      label: brand.hotline.label,
      phone: brand.hotline.phone,
      note: brand.hotline.note,
    },
  };
}

function isCardAirportIssuerCode(
  code: PartnerBrandCode,
): code is CardAirportIssuerCode {
  return (CARD_AIRPORT_ISSUER_CODES as readonly PartnerBrandCode[]).includes(
    code,
  );
}

export function isCardAirportIssuerBrand(
  brand: Pick<PartnerBrandTemplate, "code">,
): boolean {
  return isCardAirportIssuerCode(brand.code);
}

export function isPartnerProgramSurfaceBrand(
  brand: Pick<PartnerBrandTemplate, "code">,
): boolean {
  return (
    isCardAirportIssuerBrand(brand) ||
    brand.code === "FUBON" ||
    brand.code === "LION"
  );
}

export function getCardProgramThemeForBrand(
  brand: PartnerBrandTemplate,
): PartnerProgramTheme {
  return createProgramThemeFromBrand({
    kind: "card",
    slug: "card",
    issuerName: brand.bankName,
    issuerLabel: brand.code,
    programLabel: "信用卡機場接送",
    programName: "卡友禮賓接送",
    landingSubtitle: `${brand.programName} 專屬 · ${brand.cardArt.networkLabel}`,
    benefitNoun: "禮遇趟次",
    ctaLabel: "立即預約機場接送",
    brand,
  });
}

export const PARTNER_PROGRAM_THEMES = {
  card: getCardProgramThemeForBrand(CTBC_BRAND),
  insurance: createProgramThemeFromBrand({
    kind: "insurance",
    slug: "insurance",
    issuerName: "富邦產險",
    issuerLabel: "Fubon",
    programLabel: "保險理賠代步",
    programName: "理賠代步接送",
    landingSubtitle: "車禍理賠期間代步服務",
    benefitNoun: "理賠額度",
    ctaLabel: "申請代步接送",
    brand: FUBON_BRAND,
  }),
  travel: createProgramThemeFromBrand({
    kind: "travel",
    slug: "travel",
    issuerName: "雄獅旅遊",
    issuerLabel: "Lion",
    programLabel: "旅行社團體接送",
    programName: "團體接送",
    landingSubtitle: "旅行團機場 / 飯店接送",
    benefitNoun: "團體席次",
    ctaLabel: "確認席次並前往預約",
    brand: LION_BRAND,
  }),
} as const satisfies Record<PartnerProgramKind, PartnerProgramTheme>;

/** Keyword → program kind, evaluated in order (insurance / travel before card). */
const PROGRAM_KIND_BY_TOKEN: ReadonlyArray<
  readonly [RegExp, PartnerProgramKind]
> = [
  [/insur|claim|fubon|理賠|代步/i, "insurance"],
  [/travel|tour|group|lion|雄獅|團體|旅行/i, "travel"],
  [/card|credit|ride|ctbc|信用卡|機場|禮賓/i, "card"],
];

export const DEFAULT_PARTNER_PROGRAM_KIND: PartnerProgramKind = "card";

export function listProgramThemes(): ReadonlyArray<PartnerProgramTheme> {
  return PARTNER_PROGRAM_KINDS.map((kind) => PARTNER_PROGRAM_THEMES[kind]);
}

export function isPartnerProgramKind(
  value: string,
): value is PartnerProgramKind {
  return (PARTNER_PROGRAM_KINDS as readonly string[]).includes(value);
}

/**
 * Resolve a program kind from any partner identifier (route slug, host, program
 * code, or display token). Falls back to {@link DEFAULT_PARTNER_PROGRAM_KIND}.
 */
export function resolveProgramKind(input?: string | null): PartnerProgramKind {
  const value = (input ?? "").trim();
  if (!value) {
    return DEFAULT_PARTNER_PROGRAM_KIND;
  }

  const normalized = value.toLowerCase();
  if (isPartnerProgramKind(normalized)) {
    return normalized;
  }

  for (const theme of listProgramThemes()) {
    if (theme.slug === normalized || theme.host.toLowerCase() === normalized) {
      return theme.kind;
    }
  }

  for (const [pattern, kind] of PROGRAM_KIND_BY_TOKEN) {
    if (pattern.test(value)) {
      return kind;
    }
  }

  return DEFAULT_PARTNER_PROGRAM_KIND;
}

export function getProgramTheme(kind: PartnerProgramKind): PartnerProgramTheme {
  return PARTNER_PROGRAM_THEMES[kind];
}

export function getProgramThemeForSlug(slug: string): PartnerProgramTheme {
  return getProgramTheme(resolveProgramKind(slug));
}

/**
 * Resolve the runtime theme for a tenant route. This intentionally separates
 * the program kind (`card` / `insurance` / `travel`) from the issuer brand:
 * bank tenants such as CTBC/Cathay/Taishin/DBS all stay in the card airport
 * transfer program, but render with their own white-label palette and copy.
 */
export function getProgramThemeForTenantSlug(
  slug: string,
  brand?: PartnerBrandTemplate,
): PartnerProgramTheme {
  const kind = resolveProgramKind(slug);
  if (kind !== "card") {
    return getProgramTheme(kind);
  }

  const tenantBrand = brand ?? getPartnerBrandTemplateBySlug(slug);
  if (tenantBrand && isCardAirportIssuerBrand(tenantBrand)) {
    return getCardProgramThemeForBrand(tenantBrand);
  }

  return getProgramTheme("card");
}

/** Loosely-typed partner entry shape used to resolve a program theme. */
export type PartnerProgramEntryHint = {
  readonly entrySlug?: string | null;
  readonly entryHost?: string | null;
  readonly programCode?: string | null;
  readonly businessDispatchSubtype?: string | null;
};

/**
 * Resolve a program theme from a backend partner entry, trying the most
 * specific identifiers first and falling back to the slug.
 */
export function getProgramThemeForEntry(
  entry: PartnerProgramEntryHint,
): PartnerProgramTheme {
  const candidates = [
    entry.programCode,
    entry.entryHost,
    entry.businessDispatchSubtype,
    entry.entrySlug,
  ];
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) {
      return getProgramTheme(resolveProgramKind(candidate));
    }
  }
  return getProgramTheme(DEFAULT_PARTNER_PROGRAM_KIND);
}

/**
 * CSS custom properties for a program theme. Emits the shared `--pbk-*`
 * chrome vars consumed by `globals.css` / `TenantShell` plus program-scoped
 * `--pbk-primary*` / `--pbk-accent` vars used by the themed screens.
 */
export function getProgramChromeVars(
  theme: PartnerProgramTheme,
): CSSProperties {
  return {
    "--pbk-bg": theme.chrome.pageBackground,
    "--pbk-fg": theme.chrome.pageForeground,
    "--pbk-muted": theme.chrome.pageMuted,
    "--pbk-panel": theme.chrome.panel,
    "--pbk-panel-border": theme.chrome.panelBorder,
    "--pbk-accent": theme.chrome.accentText,
    "--pbk-accent-soft": theme.chrome.accentSoft,
    "--pbk-primary": theme.primary,
    "--pbk-primary-dark": theme.primaryDark,
    "--pbk-accent-strong": theme.accent,
  } as CSSProperties;
}
