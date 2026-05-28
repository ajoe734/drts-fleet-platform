export type DriverCanvasSurface = "driver";
export type DriverCanvasMode = "light" | "dark";
export type DriverCanvasDensity = "compact" | "comfy";

export type CanvasTone =
  | "neutral"
  | "info"
  | "success"
  | "warn"
  | "danger"
  | "accent";

type DriverAccentScale = {
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

type DriverCanvasPalette = {
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

type DriverDensityScale = {
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

export interface CanvasTheme extends DriverCanvasPalette, DriverDensityScale {
  mode: DriverCanvasMode;
  surfaceKey: DriverCanvasSurface;
  density: DriverCanvasDensity;
  accent: string;
  accentHi: string;
  accentBg: string;
  accentBorder: string;
  surfaceName: string;
  surfaceTagline: string;
  fontFamily: string;
  monoFamily: string;
}

const DRIVER_ACCENT: DriverAccentScale = {
  light: "#33A9FF",
  lightHi: "#4DB8FF",
  lightBg: "#E9F6FF",
  lightBorder: "#B7E0FF",
  dark: "#7BC0FF",
  darkHi: "#A9D6FF",
  darkBg: "#0F2236",
  darkBorder: "#1B3A5A",
  name: "Driver App",
  tagline: "多平台駕駛工作台",
};

const CANVAS_TYPE = {
  family:
    '"Inter", "Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

const CANVAS_LIGHT_PALETTE: DriverCanvasPalette = {
  bg: "#F7F8FB",
  bgRaised: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceHi: "#FFFFFF",
  surfaceLo: "#F1F4F8",
  border: "#E5E8EE",
  borderStrong: "#C9D2DD",
  rowHover: "#F8FAFC",
  rowSelect: "#E9F6FF",
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

const CANVAS_DARK_PALETTE: DriverCanvasPalette = {
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

const CANVAS_DENSITY: Record<DriverCanvasDensity, DriverDensityScale> = {
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
  dark = false,
  density = "compact",
}: {
  dark?: boolean;
  density?: DriverCanvasDensity;
} = {}): CanvasTheme {
  const palette = dark ? CANVAS_DARK_PALETTE : CANVAS_LIGHT_PALETTE;
  const scale = CANVAS_DENSITY[density];

  return {
    mode: dark ? "dark" : "light",
    surfaceKey: "driver",
    density,
    accent: dark ? DRIVER_ACCENT.dark : DRIVER_ACCENT.light,
    accentHi: dark ? DRIVER_ACCENT.darkHi : DRIVER_ACCENT.lightHi,
    accentBg: dark ? DRIVER_ACCENT.darkBg : DRIVER_ACCENT.lightBg,
    accentBorder: dark ? DRIVER_ACCENT.darkBorder : DRIVER_ACCENT.lightBorder,
    surfaceName: DRIVER_ACCENT.name,
    surfaceTagline: DRIVER_ACCENT.tagline,
    fontFamily: CANVAS_TYPE.family,
    monoFamily: CANVAS_TYPE.mono,
    ...palette,
    ...scale,
  };
}
