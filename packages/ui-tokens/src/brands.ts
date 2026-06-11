import type { AccentRamp, TokenMode } from "./colors";

export type PartnerBrandCode = "CTBC" | "CATHAY" | "GRAND" | "FUBON" | "LION";

export interface PartnerBrandHotline {
  readonly label: string;
  readonly phone: string;
  readonly note: string;
}

export interface PartnerBrandCardArt {
  readonly issuerLabel: string;
  readonly programLabel: string;
  readonly networkLabel: string;
  readonly lastFour: string;
  readonly badgeText: string;
  readonly badgeBackground: string;
  readonly badgeForeground: string;
  readonly gradientFrom: string;
  readonly gradientTo: string;
}

export interface PartnerBrandTheme {
  readonly pageBackground: string;
  readonly pageForeground: string;
  readonly pageMuted: string;
  readonly panel: string;
  readonly panelBorder: string;
  readonly accentText: string;
  readonly accentSoft: string;
}

export interface PartnerBrandTextTokens {
  readonly strong: string;
  readonly muted: string;
  readonly invert: string;
}

export interface PartnerBrandModeTokens {
  readonly primary: string;
  readonly primaryDark: string;
  readonly accent: string;
  readonly ink: string;
  readonly surface: AccentRamp;
  readonly theme: PartnerBrandTheme;
  readonly text: PartnerBrandTextTokens;
}

export interface PartnerBrandTemplate {
  readonly code: PartnerBrandCode;
  readonly slug: string;
  readonly displayName: string;
  readonly bankName: string;
  readonly programName: string;
  readonly tenantCode: string;
  readonly host: string;
  readonly tagline: string;
  readonly primary: string;
  readonly primaryDark: string;
  readonly accent: string;
  readonly ink: string;
  readonly surface: AccentRamp;
  readonly theme: PartnerBrandTheme;
  readonly tokens: Record<TokenMode, PartnerBrandModeTokens>;
  readonly hotline: PartnerBrandHotline;
  readonly cardArt: PartnerBrandCardArt;
}

export const PARTNER_DEFAULT_THEME = {
  pageBackground: "#FFF9F1",
  pageForeground: "#1F2937",
  pageMuted: "#6B7280",
  panel: "#FFFFFF",
  panelBorder: "rgba(31, 41, 55, 0.12)",
  accentText: "#B45309",
  accentSoft: "rgba(217, 119, 6, 0.10)",
} as const satisfies PartnerBrandTheme;

function createSurface(
  fg: string,
  hi: string,
  bg: string,
  border: string,
): AccentRamp {
  return { fg, hi, bg, border };
}

function createTheme(
  pageBackground: string,
  pageForeground: string,
  pageMuted: string,
  panel: string,
  panelBorder: string,
  accentText: string,
  accentSoft: string,
): PartnerBrandTheme {
  return {
    pageBackground,
    pageForeground,
    pageMuted,
    panel,
    panelBorder,
    accentText,
    accentSoft,
  };
}

function createMode(
  primary: string,
  primaryDark: string,
  accent: string,
  ink: string,
  surface: AccentRamp,
  theme: PartnerBrandTheme,
  text: PartnerBrandTextTokens,
): PartnerBrandModeTokens {
  return {
    primary,
    primaryDark,
    accent,
    ink,
    surface,
    theme,
    text,
  };
}

function createPartnerBrandTemplate(
  base: Omit<
    PartnerBrandTemplate,
    "primary" | "primaryDark" | "accent" | "ink" | "surface" | "theme"
  > & {
    readonly tokens: Record<TokenMode, PartnerBrandModeTokens>;
  },
): PartnerBrandTemplate {
  const light = base.tokens.light;
  return {
    ...base,
    primary: light.primary,
    primaryDark: light.primaryDark,
    accent: light.accent,
    ink: light.ink,
    surface: light.surface,
    theme: light.theme,
  };
}

export const PARTNER_BRAND_TOKENS = {
  CTBC: {
    light: createMode(
      "#13478F",
      "#0B2D5C",
      "#A8771B",
      "#14202C",
      createSurface("#13478F", "#A8771B", "#EBF2FB", "#C6D4E8"),
      createTheme(
        "#F4F7FC",
        "#14202C",
        "#5C6778",
        "#FFFFFF",
        "rgba(20, 32, 44, 0.12)",
        "#0B2D5C",
        "rgba(19, 71, 143, 0.10)",
      ),
      {
        strong: "#14202C",
        muted: "#5C6778",
        invert: "#FFFFFF",
      },
    ),
    dark: createMode(
      "#6E9DE0",
      "#9FC0F2",
      "#D2A14B",
      "#F4F7FC",
      createSurface("#9FC0F2", "#D2A14B", "#0F1A2C", "#2A3B57"),
      createTheme(
        "#0A1220",
        "#F4F7FC",
        "#AEB9CD",
        "#111A2D",
        "rgba(159, 192, 242, 0.22)",
        "#D2A14B",
        "rgba(168, 119, 27, 0.18)",
      ),
      {
        strong: "#F4F7FC",
        muted: "#AEB9CD",
        invert: "#0A1220",
      },
    ),
  },
  CATHAY: {
    light: createMode(
      "#0F5132",
      "#0A3621",
      "#B7C98B",
      "#122018",
      createSurface("#0F5132", "#B7C98B", "#EAF5EE", "#C7E3D1"),
      createTheme(
        "#F2F7F3",
        "#15231A",
        "#57665C",
        "#FFFFFF",
        "rgba(18, 32, 24, 0.12)",
        "#0A3621",
        "rgba(15, 81, 50, 0.10)",
      ),
      {
        strong: "#15231A",
        muted: "#57665C",
        invert: "#FFFFFF",
      },
    ),
    dark: createMode(
      "#53A27D",
      "#86C3A6",
      "#C7D9A0",
      "#F2F7F3",
      createSurface("#86C3A6", "#C7D9A0", "#0D1711", "#24382B"),
      createTheme(
        "#09130D",
        "#F2F7F3",
        "#AFC1B5",
        "#111D15",
        "rgba(134, 195, 166, 0.20)",
        "#C7D9A0",
        "rgba(183, 201, 139, 0.16)",
      ),
      {
        strong: "#F2F7F3",
        muted: "#AFC1B5",
        invert: "#09130D",
      },
    ),
  },
  GRAND: {
    light: createMode(
      "#7C2D12",
      "#4A1908",
      "#D7B48A",
      "#20130E",
      createSurface("#7C2D12", "#D7B48A", "#F8EFEA", "#E7CFC1"),
      createTheme(
        "#FBF5F1",
        "#241611",
        "#6C5A53",
        "#FFFDFC",
        "rgba(32, 19, 14, 0.12)",
        "#4A1908",
        "rgba(124, 45, 18, 0.10)",
      ),
      {
        strong: "#241611",
        muted: "#6C5A53",
        invert: "#FFFDFC",
      },
    ),
    dark: createMode(
      "#B46D55",
      "#D29B84",
      "#E2C49D",
      "#FBF5F1",
      createSurface("#D29B84", "#E2C49D", "#1A100D", "#3B281F"),
      createTheme(
        "#110B09",
        "#FBF5F1",
        "#C4B1A9",
        "#1E1411",
        "rgba(210, 155, 132, 0.18)",
        "#E2C49D",
        "rgba(215, 180, 138, 0.16)",
      ),
      {
        strong: "#FBF5F1",
        muted: "#C4B1A9",
        invert: "#110B09",
      },
    ),
  },
  FUBON: {
    light: createMode(
      "#0E6E50",
      "#063D2C",
      "#2FA37A",
      "#0C1A14",
      createSurface("#0E6E50", "#2FA37A", "#E6F5EE", "#B9E2D0"),
      createTheme(
        "#F3F8F5",
        "#14241C",
        "#566860",
        "#FFFFFF",
        "rgba(20, 36, 28, 0.12)",
        "#063D2C",
        "rgba(14, 110, 80, 0.10)",
      ),
      {
        strong: "#14241C",
        muted: "#566860",
        invert: "#FFFFFF",
      },
    ),
    dark: createMode(
      "#4AB08B",
      "#88D1B2",
      "#86D9B6",
      "#F3F8F5",
      createSurface("#88D1B2", "#86D9B6", "#0A1712", "#214237"),
      createTheme(
        "#09130F",
        "#F3F8F5",
        "#A6B8AF",
        "#101D18",
        "rgba(136, 209, 178, 0.20)",
        "#86D9B6",
        "rgba(47, 163, 122, 0.18)",
      ),
      {
        strong: "#F3F8F5",
        muted: "#A6B8AF",
        invert: "#09130F",
      },
    ),
  },
  LION: {
    light: createMode(
      "#B0420E",
      "#6E2806",
      "#E07B3A",
      "#2C170D",
      createSurface("#B0420E", "#E07B3A", "#FCEEE2", "#F0CFB9"),
      createTheme(
        "#F8F1EB",
        "#2C170D",
        "#73594D",
        "#FFFFFF",
        "rgba(44, 23, 13, 0.12)",
        "#6E2806",
        "rgba(176, 66, 14, 0.10)",
      ),
      {
        strong: "#2C170D",
        muted: "#73594D",
        invert: "#FFFFFF",
      },
    ),
    dark: createMode(
      "#E88E57",
      "#F0B489",
      "#F3C28F",
      "#F8F1EB",
      createSurface("#F0B489", "#F3C28F", "#1A0F09", "#4B2D1D"),
      createTheme(
        "#120A07",
        "#F8F1EB",
        "#C7A89B",
        "#1E120D",
        "rgba(240, 180, 137, 0.20)",
        "#F3C28F",
        "rgba(224, 123, 58, 0.18)",
      ),
      {
        strong: "#F8F1EB",
        muted: "#C7A89B",
        invert: "#120A07",
      },
    ),
  },
} as const satisfies Record<
  PartnerBrandCode,
  Record<TokenMode, PartnerBrandModeTokens>
>;

export const BRAND_TEMPLATES = {
  CTBC: createPartnerBrandTemplate({
    code: "CTBC",
    slug: "ctbc",
    displayName: "CTBC World Elite",
    bankName: "中信銀行",
    programName: "World Elite",
    tenantCode: "CTBC_BIZ",
    host: "ride.ctbc.com.tw",
    tagline: "卡友禮賓接送 · in-app webview · 7 步驟漏斗",
    tokens: PARTNER_BRAND_TOKENS.CTBC,
    hotline: {
      label: "24 小時禮賓專線",
      phone: "0800-024-365",
      note: "您將被轉接至中信銀行 World Elite 客服專員",
    },
    cardArt: {
      issuerLabel: "CTBC · 中信銀行",
      programLabel: "World Elite",
      networkLabel: "VISA",
      lastFour: "8842",
      badgeText: "C",
      badgeBackground: "#A8771B",
      badgeForeground: "#0B2D5C",
      gradientFrom: "#0B2D5C",
      gradientTo: "#13478F",
    },
  }),
  CATHAY: createPartnerBrandTemplate({
    code: "CATHAY",
    slug: "cathay",
    displayName: "Cathay Privileged Travel",
    bankName: "國泰世華",
    programName: "尊榮旅遊",
    tenantCode: "CATHAY_LIFE",
    host: "taxi.cathaybk.com.tw",
    tagline: "旅遊禮遇接送 · roster / magic-link demo",
    tokens: PARTNER_BRAND_TOKENS.CATHAY,
    hotline: {
      label: "旅遊服務專線",
      phone: "0800-700-188",
      note: "示範品牌 metadata；實際專線待後續 partner funnel 畫面接線。",
    },
    cardArt: {
      issuerLabel: "Cathay · 國泰世華",
      programLabel: "尊榮旅遊",
      networkLabel: "World Card",
      lastFour: "1024",
      badgeText: "C",
      badgeBackground: "#B7C98B",
      badgeForeground: "#0A3621",
      gradientFrom: "#0A3621",
      gradientTo: "#0F5132",
    },
  }),
  GRAND: createPartnerBrandTemplate({
    code: "GRAND",
    slug: "grand",
    displayName: "Grand Concierge",
    bankName: "凱撒飯店",
    programName: "Concierge",
    tenantCode: "TPE_HOTEL_GRP",
    host: "ride.grand-hotels.tw",
    tagline: "飯店禮賓接送 · concierge token demo",
    tokens: PARTNER_BRAND_TOKENS.GRAND,
    hotline: {
      label: "Concierge Desk",
      phone: "02-7701-9000",
      note: "示範品牌 metadata；實際飯店櫃台專線待 cutover policy 決定。",
    },
    cardArt: {
      issuerLabel: "Grand Hotels",
      programLabel: "Concierge Access",
      networkLabel: "Hospitality",
      lastFour: "3208",
      badgeText: "G",
      badgeBackground: "#D7B48A",
      badgeForeground: "#4A1908",
      gradientFrom: "#4A1908",
      gradientTo: "#7C2D12",
    },
  }),
  FUBON: createPartnerBrandTemplate({
    code: "FUBON",
    slug: "fubon",
    displayName: "Fubon Claim Mobility",
    bankName: "富邦產險",
    programName: "理賠代步",
    tenantCode: "FUBON_CLAIM",
    host: "claim.fubon-ins.com.tw",
    tagline: "保險理賠代步 · claim-driven allowance funnel",
    tokens: PARTNER_BRAND_TOKENS.FUBON,
    hotline: {
      label: "理賠代步服務專線",
      phone: "0800-073-588",
      note: "您將被轉接至富邦產險理賠代步服務專員。",
    },
    cardArt: {
      issuerLabel: "Fubon · 富邦產險",
      programLabel: "理賠代步",
      networkLabel: "Insurance",
      lastFour: "8814",
      badgeText: "F",
      badgeBackground: "#2FA37A",
      badgeForeground: "#063D2C",
      gradientFrom: "#063D2C",
      gradientTo: "#0E6E50",
    },
  }),
  LION: createPartnerBrandTemplate({
    code: "LION",
    slug: "lion",
    displayName: "Lion Group Transfer",
    bankName: "雄獅旅遊",
    programName: "團體接送",
    tenantCode: "LION_TRAVEL",
    host: "booking.lion-travel.com.tw",
    tagline: "旅行社團體接送 · roster / batching funnel",
    tokens: PARTNER_BRAND_TOKENS.LION,
    hotline: {
      label: "雄獅團體服務專線",
      phone: "0800-090-068",
      note: "您將被轉接至雄獅旅遊團體接送服務專員。",
    },
    cardArt: {
      issuerLabel: "Lion · 雄獅旅遊",
      programLabel: "團體接送",
      networkLabel: "Travel",
      lastFour: "0628",
      badgeText: "L",
      badgeBackground: "#E07B3A",
      badgeForeground: "#6E2806",
      gradientFrom: "#6E2806",
      gradientTo: "#B0420E",
    },
  }),
} as const satisfies Record<PartnerBrandCode, PartnerBrandTemplate>;

export const PARTNER_BRAND_CODES = [
  "CTBC",
  "CATHAY",
  "GRAND",
  "FUBON",
  "LION",
] as const satisfies readonly PartnerBrandCode[];

export function listPartnerBrandTemplates(): ReadonlyArray<PartnerBrandTemplate> {
  return PARTNER_BRAND_CODES.map((code) => BRAND_TEMPLATES[code]);
}

export function getPartnerBrandTemplateBySlug(
  slug: string,
): PartnerBrandTemplate | undefined {
  return listPartnerBrandTemplates().find((brand) => brand.slug === slug);
}

export function getPartnerBrandTokens(
  code: PartnerBrandCode,
  mode: TokenMode = "light",
): PartnerBrandModeTokens {
  return PARTNER_BRAND_TOKENS[code][mode];
}
