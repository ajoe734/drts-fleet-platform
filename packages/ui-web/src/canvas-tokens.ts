export type CanvasSurface =
  | "admin"
  | "platform"
  | "ops"
  | "tenant"
  | "driver"
  | "partner";
export type CanvasMode = "light" | "dark";
export type CanvasDensity = "compact" | "comfy";
export type CanvasRealm = "platform" | "ops" | "tenant" | "system" | "driver";
export type CanvasDataFreshness = "fresh" | "stale" | "degraded" | "unknown";
export type CanvasHealthStatus = "healthy" | "degraded" | "down";
export type CanvasRefreshTier =
  | "urgent"
  | "fast"
  | "dispatch"
  | "medium"
  | "medium_slow"
  | "slow"
  | "manual";
export type CanvasEmptyReason =
  | "no_data"
  | "not_provisioned"
  | "fetch_failed"
  | "permission_denied"
  | "external_unavailable"
  | "filtered_empty"
  | "driver_not_eligible";
export type CanvasRiskLevel = "low" | "medium" | "high";

export type CanvasTone =
  | "neutral"
  | "info"
  | "success"
  | "warn"
  | "danger"
  | "accent"
  | "admin"
  | "platform"
  | "ops"
  | "tenant"
  | "system"
  | "driver";

export type CanvasAccentScale = {
  light: string;
  lightHi: string;
  lightBg: string;
  lightBorder: string;
  dark: string;
  darkHi: string;
  darkBg: string;
  darkBorder: string;
  name: string;
  tagline: string;
};

export type CanvasRealmTone = {
  fg: string;
  bg: string;
  bd: string;
};

export type CanvasPalette = {
  bg: string;
  bgRaised: string;
  surface: string;
  surfaceHi: string;
  surfaceLo: string;
  border: string;
  borderStrong: string;
  rowHover: string;
  rowSelect: string;
  text: string;
  textMuted: string;
  textDim: string;
  invert: string;
  success: string;
  successBg: string;
  successBorder: string;
  warn: string;
  warnBg: string;
  warnBorder: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  info: string;
  infoBg: string;
  infoBorder: string;
  neutral: string;
  neutralBg: string;
  neutralBorder: string;
  shadow: string;
  shadowSm: string;
};

export type CanvasDensityScale = {
  rowH: number;
  cellY: number;
  cellX: number;
  sectGap: number;
  cardPad: number;
  fz: number;
  h1: number;
  h2: number;
  h3: number;
  micro: number;
};

export type CanvasRefreshTierMeta = {
  code: string;
  label: string;
  ms: number | null;
  note: string;
};

export type CanvasEmptyReasonMeta = {
  label: string;
  en: string;
  hint: string;
};

export type CanvasRiskLevelMeta = {
  label: string;
  icon: string;
  tone: Extract<CanvasTone, "success" | "warn" | "danger">;
  pattern: string;
};

export interface CanvasTheme extends CanvasPalette, CanvasDensityScale {
  mode: CanvasMode;
  surfaceKey: CanvasSurface;
  density: CanvasDensity;
  accent: string;
  accentHi: string;
  accentBg: string;
  accentBorder: string;
  surfaceName: string;
  surfaceTagline: string;
  fontFamily: string;
  monoFamily: string;
  realm: Record<CanvasRealm, CanvasRealmTone>;
}

const ADMIN_ACCENT: CanvasAccentScale = {
  light: "#4F46E5",
  lightHi: "#6366F1",
  lightBg: "#EEF2FF",
  lightBorder: "#C7D2FE",
  dark: "#A5B4FC",
  darkHi: "#C7D2FE",
  darkBg: "#1E1B4B",
  darkBorder: "#312E81",
  name: "Platform Admin",
  tagline: "平台治理控制平面",
};

const OPS_ACCENT: CanvasAccentScale = {
  light: "#DC2626",
  lightHi: "#EF4444",
  lightBg: "#FEF2F2",
  lightBorder: "#FECACA",
  dark: "#FCA5A5",
  darkHi: "#FECACA",
  darkBg: "#3F1212",
  darkBorder: "#5C1A1A",
  name: "Ops Console",
  tagline: "即時營運工作台",
};

const TENANT_ACCENT: CanvasAccentScale = {
  light: "#0F766E",
  lightHi: "#14B8A6",
  lightBg: "#F0FDFA",
  lightBorder: "#99F6E4",
  dark: "#5EEAD4",
  darkHi: "#99F6E4",
  darkBg: "#0F2A28",
  darkBorder: "#134E48",
  name: "Tenant Console",
  tagline: "租戶自助與整合管理",
};

const DRIVER_ACCENT: CanvasAccentScale = {
  light: "#0F4C75",
  lightHi: "#1E6BA8",
  lightBg: "#E6F0F8",
  lightBorder: "#BBD3E6",
  dark: "#7BC0FF",
  darkHi: "#A9D6FF",
  darkBg: "#0F2236",
  darkBorder: "#1B3A5A",
  name: "Driver App",
  tagline: "多平台駕駛工作台",
};

const PARTNER_ACCENT: CanvasAccentScale = {
  light: "#B45309",
  lightHi: "#D97706",
  lightBg: "#FFFBEB",
  lightBorder: "#FDE68A",
  dark: "#FCD34D",
  darkHi: "#FDE68A",
  darkBg: "#3A2A0A",
  darkBorder: "#5C4218",
  name: "Partner Booking",
  tagline: "合作夥伴叫車入口",
};

export const CANVAS_SURFACE_ACCENTS: Record<CanvasSurface, CanvasAccentScale> =
  {
    admin: ADMIN_ACCENT,
    platform: ADMIN_ACCENT,
    ops: OPS_ACCENT,
    tenant: TENANT_ACCENT,
    driver: DRIVER_ACCENT,
    partner: PARTNER_ACCENT,
  };

export const CANVAS_REALM_COLORS: Record<
  CanvasMode,
  Record<CanvasRealm, CanvasRealmTone>
> = {
  light: {
    tenant: { fg: "#0F766E", bg: "#F0FDFA", bd: "#99F6E4" },
    ops: { fg: "#DC2626", bg: "#FEF2F2", bd: "#FECACA" },
    platform: { fg: "#4F46E5", bg: "#EEF2FF", bd: "#C7D2FE" },
    system: { fg: "#6B7280", bg: "#F1F4F8", bd: "#CBD5E1" },
    driver: { fg: "#A8590B", bg: "#FCEED6", bd: "#F0CC95" },
  },
  dark: {
    tenant: { fg: "#5EEAD4", bg: "#0F2A28", bd: "#134E48" },
    ops: { fg: "#FCA5A5", bg: "#3F1212", bd: "#5C1A1A" },
    platform: { fg: "#A5B4FC", bg: "#1E1B4B", bd: "#312E81" },
    system: { fg: "#94A3B8", bg: "#1A2230", bd: "#2A3445" },
    driver: { fg: "#FCD34D", bg: "#3A2A0A", bd: "#5C4218" },
  },
};

export const CANVAS_REFRESH_TIERS: Record<
  CanvasRefreshTier,
  CanvasRefreshTierMeta
> = {
  urgent: { code: "T0", label: "即時", ms: 5000, note: "push + 5s 補" },
  fast: { code: "T1", label: "快速", ms: 3000, note: "行程進行中" },
  dispatch: { code: "T2", label: "派遣", ms: 5000, note: "派遣 / 客服 / 審批" },
  medium: { code: "T3", label: "中等", ms: 15000, note: "案件 / 監看" },
  medium_slow: {
    code: "T4",
    label: "中慢",
    ms: 30000,
    note: "治理 / 結算",
  },
  slow: { code: "T5", label: "慢速", ms: 30000, note: "租戶面" },
  manual: { code: "T6", label: "手動", ms: null, note: "報核型" },
};

export const CANVAS_EMPTY_REASONS: Record<
  CanvasEmptyReason,
  CanvasEmptyReasonMeta
> = {
  no_data: {
    label: "尚無資料",
    en: "No data",
    hint: "目前沒有任何項目，這是合法的空狀態。",
  },
  not_provisioned: {
    label: "尚未設定",
    en: "Not provisioned",
    hint: "此功能尚未為您所在的範圍開通。",
  },
  fetch_failed: {
    label: "讀取失敗",
    en: "Fetch failed",
    hint: "後端服務無法回應，請稍後再試或聯絡支援。",
  },
  permission_denied: {
    label: "無權限",
    en: "Permission denied",
    hint: "您目前的角色無權檢視此區段。",
  },
  external_unavailable: {
    label: "外部失聯",
    en: "External unavailable",
    hint: "依賴的外部介接服務目前不可用。",
  },
  filtered_empty: {
    label: "篩選過嚴",
    en: "Filtered empty",
    hint: "套用的篩選沒有符合的結果，請放寬條件。",
  },
  driver_not_eligible: {
    label: "司機不合資格",
    en: "Driver not eligible",
    hint: "司機目前不符合任一平台的派工資格。",
  },
};

export const CANVAS_RISK_LEVELS: Record<CanvasRiskLevel, CanvasRiskLevelMeta> =
  {
    low: {
      label: "低風險",
      icon: "check",
      tone: "success",
      pattern: "直接執行 + toast 收據",
    },
    medium: {
      label: "中風險",
      icon: "warn",
      tone: "warn",
      pattern: "modal 確認 + toast 收據",
    },
    high: {
      label: "高風險",
      icon: "danger",
      tone: "danger",
      pattern: "modal + 必填原因 + toast 收據",
    },
  };

export const CANVAS_TYPE = {
  family:
    '"Inter", "Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export const CANVAS_LIGHT_PALETTE: CanvasPalette = {
  bg: "#F7F8FB",
  bgRaised: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceHi: "#FFFFFF",
  surfaceLo: "#F1F4F8",
  border: "#E5E8EE",
  borderStrong: "#C9D2DD",
  rowHover: "#F8FAFC",
  rowSelect: "#EEF2FF",
  text: "#0B1220",
  textMuted: "#475569",
  textDim: "#6B7280",
  invert: "#FFFFFF",
  success: "#0F7B5A",
  successBg: "#E5F4ED",
  successBorder: "#A7D7C2",
  warn: "#A8590B",
  warnBg: "#FCEED6",
  warnBorder: "#F0CC95",
  danger: "#B42318",
  dangerBg: "#FEE4E2",
  dangerBorder: "#F8B3AC",
  info: "#1F5DB8",
  infoBg: "#E4EDFB",
  infoBorder: "#B6CBEC",
  neutral: "#475569",
  neutralBg: "#F1F4F8",
  neutralBorder: "#CBD5E1",
  shadow: "0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)",
  shadowSm: "0 1px 2px rgba(15,23,42,.05)",
};

export const CANVAS_DARK_NAVY_PALETTE: CanvasPalette = {
  bg: "#0A0E16",
  bgRaised: "#0F1421",
  surface: "#141B2B",
  surfaceHi: "#1A2235",
  surfaceLo: "#0B1220",
  border: "#22304A",
  borderStrong: "#324A6E",
  rowHover: "#162038",
  rowSelect: "#172747",
  text: "#E5EAF3",
  textMuted: "#94A3B8",
  textDim: "#64748B",
  invert: "#0A0E16",
  success: "#34D399",
  successBg: "#0E2A1F",
  successBorder: "#1F4D38",
  warn: "#FBBF24",
  warnBg: "#2D1F08",
  warnBorder: "#5C4218",
  danger: "#F87171",
  dangerBg: "#2C100E",
  dangerBorder: "#5C1F1A",
  info: "#93C5FD",
  infoBg: "#0F1F36",
  infoBorder: "#1E3A5F",
  neutral: "#94A3B8",
  neutralBg: "#1A2230",
  neutralBorder: "#2A3445",
  shadow: "0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.3)",
  shadowSm: "0 1px 2px rgba(0,0,0,.4)",
};

export const CANVAS_DENSITY: Record<CanvasDensity, CanvasDensityScale> = {
  comfy: {
    rowH: 44,
    cellY: 10,
    cellX: 14,
    sectGap: 18,
    cardPad: 18,
    fz: 14,
    h1: 22,
    h2: 17,
    h3: 15,
    micro: 11.5,
  },
  compact: {
    rowH: 34,
    cellY: 7,
    cellX: 12,
    sectGap: 14,
    cardPad: 14,
    fz: 13,
    h1: 20,
    h2: 15,
    h3: 13.5,
    micro: 11,
  },
};

export function buildCanvasTheme({
  surface = "platform",
  dark = false,
  density = "compact",
}: {
  surface?: CanvasSurface;
  dark?: boolean;
  density?: CanvasDensity;
} = {}): CanvasTheme {
  const mode: CanvasMode = dark ? "dark" : "light";
  const accentSet = CANVAS_SURFACE_ACCENTS[surface];
  const basePalette = dark ? CANVAS_DARK_NAVY_PALETTE : CANVAS_LIGHT_PALETTE;
  const scale = CANVAS_DENSITY[density];
  const accentBg = dark ? accentSet.darkBg : accentSet.lightBg;

  return {
    mode,
    surfaceKey: surface,
    density,
    accent: dark ? accentSet.dark : accentSet.light,
    accentHi: dark ? accentSet.darkHi : accentSet.lightHi,
    accentBg,
    accentBorder: dark ? accentSet.darkBorder : accentSet.lightBorder,
    surfaceName: accentSet.name,
    surfaceTagline: accentSet.tagline,
    fontFamily: CANVAS_TYPE.family,
    monoFamily: CANVAS_TYPE.mono,
    realm: CANVAS_REALM_COLORS[mode],
    ...basePalette,
    rowSelect: dark ? basePalette.rowSelect : accentBg,
    ...scale,
  };
}
