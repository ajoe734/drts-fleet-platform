import type { AccentRamp } from "./colors";

export type PartnerBrandCode = "CTBC" | "CATHAY" | "GRAND";

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
  readonly hotline: PartnerBrandHotline;
  readonly cardArt: PartnerBrandCardArt;
}

function createSurface(
  fg: string,
  hi: string,
  bg: string,
  border: string,
): AccentRamp {
  return { fg, hi, bg, border };
}

export const BRAND_TEMPLATES = {
  CTBC: {
    code: "CTBC",
    slug: "ctbc",
    displayName: "CTBC World Elite",
    bankName: "中信銀行",
    programName: "World Elite",
    tenantCode: "CTBC_BIZ",
    host: "ride.ctbc.com.tw",
    tagline: "卡友禮賓接送 · in-app webview · 7 步驟漏斗",
    primary: "#1B4FA0",
    primaryDark: "#0A2A6E",
    accent: "#C9A356",
    ink: "#0E1424",
    surface: createSurface("#1B4FA0", "#C9A356", "#EBF1FB", "#C7D7F0"),
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
      badgeBackground: "#C9A356",
      badgeForeground: "#0A2A6E",
      gradientFrom: "#0A2A6E",
      gradientTo: "#1B4FA0",
    },
  },
  CATHAY: {
    code: "CATHAY",
    slug: "cathay",
    displayName: "Cathay Privileged Travel",
    bankName: "國泰世華",
    programName: "尊榮旅遊",
    tenantCode: "CATHAY_LIFE",
    host: "taxi.cathaybk.com.tw",
    tagline: "旅遊禮遇接送 · roster / magic-link demo",
    primary: "#0F5132",
    primaryDark: "#0A3621",
    accent: "#B7C98B",
    ink: "#122018",
    surface: createSurface("#0F5132", "#B7C98B", "#EAF5EE", "#C7E3D1"),
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
  },
  GRAND: {
    code: "GRAND",
    slug: "grand",
    displayName: "Grand Concierge",
    bankName: "凱撒飯店",
    programName: "Concierge",
    tenantCode: "TPE_HOTEL_GRP",
    host: "ride.grand-hotels.tw",
    tagline: "飯店禮賓接送 · concierge token demo",
    primary: "#7C2D12",
    primaryDark: "#4A1908",
    accent: "#D7B48A",
    ink: "#20130E",
    surface: createSurface("#7C2D12", "#D7B48A", "#F8EFEA", "#E7CFC1"),
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
  },
} as const satisfies Record<PartnerBrandCode, PartnerBrandTemplate>;

export const PARTNER_BRAND_CODES = [
  "CTBC",
  "CATHAY",
  "GRAND",
] as const satisfies readonly PartnerBrandCode[];

export function listPartnerBrandTemplates(): ReadonlyArray<PartnerBrandTemplate> {
  return PARTNER_BRAND_CODES.map((code) => BRAND_TEMPLATES[code]);
}

export function getPartnerBrandTemplateBySlug(
  slug: string,
): PartnerBrandTemplate | undefined {
  return listPartnerBrandTemplates().find((brand) => brand.slug === slug);
}
