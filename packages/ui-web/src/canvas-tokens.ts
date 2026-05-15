export type CanvasSurface = "platform" | "ops" | "tenant" | "partner";
export type CanvasMode = "light" | "dark";
export type CanvasDensity = "compact" | "comfy";

export type CanvasTone =
  | "neutral"
  | "info"
  | "success"
  | "warn"
  | "danger"
  | "accent";

type CanvasAccentScale = {
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

type CanvasPalette = {
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

type CanvasDensityScale = {
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
}

export const CANVAS_SURFACE_ACCENTS: Record<CanvasSurface, CanvasAccentScale> =
  {
    platform: {
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
    },
    ops: {
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
    },
    tenant: {
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
    },
    partner: {
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
  rowSelect: "#F0FDFA",
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
  const accentSet = CANVAS_SURFACE_ACCENTS[surface];
  const palette = dark ? CANVAS_DARK_NAVY_PALETTE : CANVAS_LIGHT_PALETTE;
  const scale = CANVAS_DENSITY[density];

  return {
    mode: dark ? "dark" : "light",
    surfaceKey: surface,
    density,
    accent: dark ? accentSet.dark : accentSet.light,
    accentHi: dark ? accentSet.darkHi : accentSet.lightHi,
    accentBg: dark ? accentSet.darkBg : accentSet.lightBg,
    accentBorder: dark ? accentSet.darkBorder : accentSet.lightBorder,
    surfaceName: accentSet.name,
    surfaceTagline: accentSet.tagline,
    fontFamily: CANVAS_TYPE.family,
    monoFamily: CANVAS_TYPE.mono,
    ...palette,
    ...scale,
  };
}
