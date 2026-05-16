import {
  AUTHORITY_COLORS,
  DISPLAY_STRINGS,
  DENSITY_SCALES,
  STATUS_DISPLAY_STRINGS,
  STATUS_TONE_BY_VALUE,
  STATUS_TONES,
  SURFACE_ACCENTS,
  type AuthorityKind,
  type ConsoleAccentName,
  type ForwardedStatus,
  type StatusToneName,
  type TokenMode,
} from "@drts/ui-tokens";

export type DriverThemeMode = TokenMode;
export type DriverThemeDensity = keyof typeof DENSITY_SCALES;
export type DriverThemeTone =
  | StatusToneName
  | AuthorityKind
  | ConsoleAccentName;
export type DriverTextTone =
  | DriverThemeTone
  | "default"
  | "strong"
  | "muted"
  | "dim"
  | "inverse";
export type DriverLocale = "en" | "zhTW";

export interface DriverTone {
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly foregroundColor: string;
  readonly emphasisColor: string;
}

export interface DriverTypographyToken {
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly fontWeight: "400" | "500" | "600" | "700";
  readonly letterSpacing?: number;
  readonly textTransform?: "uppercase";
}

export const driverSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  "2xl": 24,
  "3xl": 32,
  "4xl": 48,
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
  48: 48,
} as const;

export const driverRadius = {
  xs: 6,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 999,
  pill: 999,
} as const;

export const driverFonts = {
  sans: "System",
  mono: "monospace",
} as const;

const DRIVER_COLOR_MODES = {
  light: {
    appBackground: "#F6F8FB",
    surface: "#FFFFFF",
    surfaceMuted: "#F1F4F8",
    surfaceRaised: "#FFFFFF",
    textStrong: "#0F172A",
    text: "#334155",
    textMuted: "#475569",
    textDim: "#64748B",
    inverse: "#FFFFFF",
    border: "#E3E8EF",
    borderStrong: "#CBD5E1",
    shadow: "rgba(15, 23, 42, 0.08)",
    shadowStrong: "rgba(15, 23, 42, 0.16)",
  },
  dark: {
    appBackground: "#020617",
    surface: "#0F172A",
    surfaceMuted: "#111827",
    surfaceRaised: "#1A2230",
    textStrong: "#F8FAFC",
    text: "#E2E8F0",
    textMuted: "#94A3B8",
    textDim: "#64748B",
    inverse: "#FFFFFF",
    border: "#2A3445",
    borderStrong: "#334155",
    shadow: "rgba(2, 6, 23, 0.28)",
    shadowStrong: "rgba(2, 6, 23, 0.42)",
  },
} as const;

const driverTypographyByDensity = (
  density: DriverThemeDensity,
): Record<
  | "display"
  | "screenTitle"
  | "sectionTitle"
  | "title"
  | "body"
  | "bodyStrong"
  | "label"
  | "small"
  | "micro"
  | "code",
  DriverTypographyToken
> => {
  const scale = DENSITY_SCALES[density];

  return {
    display: {
      fontSize: scale.titleFontSize + 6,
      lineHeight: scale.titleFontSize + 10,
      fontWeight: "700",
      letterSpacing: -0.5,
    },
    screenTitle: {
      fontSize: scale.titleFontSize,
      lineHeight: scale.titleFontSize + 8,
      fontWeight: "700",
      letterSpacing: -0.4,
    },
    sectionTitle: {
      fontSize: scale.sectionTitleFontSize,
      lineHeight: scale.sectionTitleFontSize + 6,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    title: {
      fontSize: scale.baseFontSize + 2,
      lineHeight: scale.baseFontSize + 8,
      fontWeight: "600",
      letterSpacing: -0.1,
    },
    body: {
      fontSize: scale.baseFontSize,
      lineHeight: scale.baseFontSize + 8,
      fontWeight: "400",
    },
    bodyStrong: {
      fontSize: scale.baseFontSize,
      lineHeight: scale.baseFontSize + 8,
      fontWeight: "600",
    },
    label: {
      fontSize: scale.baseFontSize - 1,
      lineHeight: scale.baseFontSize + 4,
      fontWeight: "500",
    },
    small: {
      fontSize: scale.baseFontSize - 1,
      lineHeight: scale.baseFontSize + 4,
      fontWeight: "400",
    },
    micro: {
      fontSize: scale.eyebrowFontSize,
      lineHeight: scale.eyebrowFontSize + 3,
      fontWeight: "600",
      letterSpacing: 0.35,
      textTransform: "uppercase",
    },
    code: {
      fontFamily: driverFonts.mono,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600",
    },
  };
};

function toneFromRamp(ramp: {
  readonly fg: string;
  readonly bg: string;
  readonly border: string;
  readonly hi?: string;
}): DriverTone {
  return {
    backgroundColor: ramp.bg,
    borderColor: ramp.border,
    foregroundColor: ramp.fg,
    emphasisColor: ramp.hi ?? ramp.fg,
  };
}

function isStatusToneName(value: DriverThemeTone): value is StatusToneName {
  return value in STATUS_TONES;
}

function isAuthorityKind(value: DriverThemeTone): value is AuthorityKind {
  return value in AUTHORITY_COLORS;
}

function isConsoleAccentName(
  value: DriverThemeTone,
): value is ConsoleAccentName {
  return value in SURFACE_ACCENTS;
}

export function resolveDriverTone(
  tone: DriverThemeTone,
  mode: DriverThemeMode = "light",
): DriverTone {
  if (isStatusToneName(tone)) {
    return toneFromRamp(STATUS_TONES[tone][mode]);
  }

  if (isAuthorityKind(tone)) {
    return toneFromRamp(AUTHORITY_COLORS[tone][mode]);
  }

  if (isConsoleAccentName(tone)) {
    return toneFromRamp(SURFACE_ACCENTS[tone][mode]);
  }

  throw new Error(`Unknown driver theme tone: ${String(tone)}`);
}

export function resolveForwardedStatusTone(
  status: ForwardedStatus,
  mode: DriverThemeMode = "light",
): DriverTone {
  return resolveDriverTone(STATUS_TONE_BY_VALUE[status], mode);
}

export function resolveForwardedStatusLabel(
  status: ForwardedStatus,
  locale: DriverLocale = "zhTW",
): string {
  return STATUS_DISPLAY_STRINGS[status][locale];
}

export function resolveAuthorityLabel(
  authority: AuthorityKind,
  locale: DriverLocale = "zhTW",
): string {
  return DISPLAY_STRINGS.authority[authority][locale];
}

export function resolveDriverTextColor(
  tone: DriverTextTone,
  mode: DriverThemeMode = "light",
): string {
  const colors = DRIVER_COLOR_MODES[mode];

  switch (tone) {
    case "strong":
      return colors.textStrong;
    case "muted":
      return colors.textMuted;
    case "dim":
      return colors.textDim;
    case "inverse":
      return colors.inverse;
    case "default":
      return colors.text;
    default:
      return resolveDriverTone(tone, mode).foregroundColor;
  }
}

export function createDriverTheme(options?: {
  readonly mode?: DriverThemeMode;
  readonly density?: DriverThemeDensity;
}) {
  const mode = options?.mode ?? "light";
  const density = options?.density ?? "comfortable";
  const densityScale = DENSITY_SCALES[density];
  const colors = DRIVER_COLOR_MODES[mode];

  return {
    mode,
    density,
    colors: {
      ...colors,
      primary: AUTHORITY_COLORS.owned[mode].fg,
      primarySurface: AUTHORITY_COLORS.owned[mode].bg,
      primaryBorder: AUTHORITY_COLORS.owned[mode].border,
      primaryPressed: SURFACE_ACCENTS.platform[mode].hi,
      danger: STATUS_TONES.danger[mode].fg,
      warning: STATUS_TONES.warning[mode].fg,
      success: STATUS_TONES.success[mode].fg,
      info: STATUS_TONES.info[mode].fg,
    },
    fonts: driverFonts,
    spacing: driverSpacing,
    radius: driverRadius,
    typography: driverTypographyByDensity(density),
    densityScale,
    layout: {
      pagePadding: 16,
      contentGap: densityScale.sectionGap,
      cardPadding: densityScale.cardPadding,
      headerHeight: 64,
      bottomBarInset: 16,
      touchTarget: 44,
      fieldHeight: 48,
    },
    shadows: {
      sm: {
        shadowColor: mode === "dark" ? "#020617" : "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: mode === "dark" ? 0.18 : 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
      md: {
        shadowColor: mode === "dark" ? "#020617" : "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: mode === "dark" ? 0.24 : 0.06,
        shadowRadius: 24,
        elevation: 3,
      },
    },
  } as const;
}

export const driverTheme = createDriverTheme();
export const driverDisplayStrings = DISPLAY_STRINGS;
export const driverStatusDisplayStrings = STATUS_DISPLAY_STRINGS;
