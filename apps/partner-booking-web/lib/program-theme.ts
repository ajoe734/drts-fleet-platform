import type { CSSProperties } from "react";

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
  /** One-line program tagline. */
  readonly tagline: string;
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

export const PARTNER_PROGRAM_THEMES = {
  card: {
    kind: "card",
    slug: "card",
    host: "ride.ctbc.com.tw",
    issuerName: "中信銀行",
    issuerLabel: "CTBC",
    programLabel: "信用卡機場接送",
    programName: "卡友禮賓接送",
    tagline: "卡友專屬機場接送 · 全年免費趟次",
    benefitNoun: "禮遇趟次",
    ctaLabel: "立即叫車",
    badgeText: "C",
    primary: "#1B4FA0",
    primaryDark: "#0A2A6E",
    accent: "#C9A356",
    ink: "#0E1424",
    surface: {
      fg: "#1B4FA0",
      hi: "#C9A356",
      bg: "#EBF1FB",
      border: "#C7D7F0",
    },
    chrome: {
      pageBackground: "#F4F7FC",
      pageForeground: "#14202C",
      pageMuted: "#5C6778",
      panel: "#FFFFFF",
      panelBorder: "rgba(20, 32, 44, 0.12)",
      accentText: "#0A2A6E",
      accentSoft: "rgba(27, 79, 160, 0.10)",
    },
    hotline: {
      label: "24 小時禮賓專線",
      phone: "0800-024-365",
      note: "您將被轉接至中信銀行卡友禮賓客服專員。",
    },
  },
  insurance: {
    kind: "insurance",
    slug: "insurance",
    host: "claim.fubon-ins.com.tw",
    issuerName: "富邦產險",
    issuerLabel: "Fubon",
    programLabel: "保險理賠代步",
    programName: "理賠代步接送",
    tagline: "事故理賠期間代步接送 · 額度內免費",
    benefitNoun: "理賠額度",
    ctaLabel: "申請代步接送",
    badgeText: "F",
    primary: "#007A53",
    primaryDark: "#00432F",
    accent: "#7FB800",
    ink: "#0C1A14",
    surface: {
      fg: "#007A53",
      hi: "#7FB800",
      bg: "#E8F5EE",
      border: "#BFE3CF",
    },
    chrome: {
      pageBackground: "#F1F8F4",
      pageForeground: "#14241C",
      pageMuted: "#566860",
      panel: "#FFFFFF",
      panelBorder: "rgba(20, 36, 28, 0.12)",
      accentText: "#00432F",
      accentSoft: "rgba(0, 122, 83, 0.10)",
    },
    hotline: {
      label: "理賠代步服務專線",
      phone: "0800-073-588",
      note: "您將被轉接至富邦產險理賠代步服務專員。",
    },
  },
  travel: {
    kind: "travel",
    slug: "travel",
    host: "booking.lion-travel.com.tw",
    issuerName: "雄獅旅遊",
    issuerLabel: "Lion",
    programLabel: "旅行社團體接送",
    programName: "團體接送",
    tagline: "團體行程接送 · roster + batching",
    benefitNoun: "團體席次",
    ctaLabel: "確認席次並前往預約",
    badgeText: "L",
    primary: "#B0420E",
    primaryDark: "#6E2806",
    accent: "#E07B3A",
    ink: "#2C170D",
    surface: {
      fg: "#B0420E",
      hi: "#E07B3A",
      bg: "#FCEEE2",
      border: "#F0CFB9",
    },
    chrome: {
      pageBackground: "#F8F1EB",
      pageForeground: "#2C170D",
      pageMuted: "#73594D",
      panel: "#FFFFFF",
      panelBorder: "rgba(44, 23, 13, 0.12)",
      accentText: "#6E2806",
      accentSoft: "rgba(176, 66, 14, 0.10)",
    },
    hotline: {
      label: "雄獅團體服務專線",
      phone: "0800-090-068",
      note: "您將被轉接至雄獅旅遊團體接送服務專員。",
    },
  },
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
