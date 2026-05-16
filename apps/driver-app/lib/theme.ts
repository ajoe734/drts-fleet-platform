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

export const DRIVER_THEME_DEFAULT_MODE: DriverThemeMode = "dark";

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

const DRIVER_CANVAS_COLOR_MODES = {
  light: {
    bg: "#F6F8FB",
    bgRaised: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceHi: "#FFFFFF",
    surfaceLo: "#F1F4F8",
    border: "#E3E8EF",
    borderStrong: "#CBD5E1",
    text: "#0F172A",
    textMuted: "#475569",
    textDim: "#64748B",
    brand: "#0F4C75",
    brandHi: "#1E6BA8",
    brandBg: "#E6F0F8",
    forwardedFg: "#B45309",
    forwardedBg: "#FEF3E2",
    forwardedBorder: "#F4D9A6",
    ownedFg: "#0F4C75",
    ownedBg: "#E6F0F8",
    ownedBorder: "#BBD3E6",
    success: "#0F7B5A",
    successBg: "#E5F4ED",
    warn: "#A8590B",
    warnBg: "#FCEED6",
    danger: "#B42318",
    dangerBg: "#FEE4E2",
    info: "#1F5DB8",
    infoBg: "#E4EDFB",
    neutral: "#475569",
    neutralBg: "#F1F4F8",
    shadow: "rgba(15, 23, 42, 0.08)",
    shadowStrong: "rgba(15, 23, 42, 0.16)",
  },
  dark: {
    bg: "#0B1018",
    bgRaised: "#121823",
    surface: "#19212E",
    surfaceHi: "#1F2937",
    surfaceLo: "#0F151E",
    border: "#2A3445",
    borderStrong: "#3A475C",
    text: "#E6EAF2",
    textMuted: "#94A3B8",
    textDim: "#64748B",
    brand: "#7BC0FF",
    brandHi: "#A9D6FF",
    brandBg: "#0F2236",
    forwardedFg: "#FBBF24",
    forwardedBg: "#3A2A0A",
    forwardedBorder: "#5C4218",
    ownedFg: "#7BC0FF",
    ownedBg: "#0F2236",
    ownedBorder: "#1B3A5A",
    success: "#34D399",
    successBg: "#0E2A1F",
    warn: "#FBBF24",
    warnBg: "#2D1F08",
    danger: "#F87171",
    dangerBg: "#2C100E",
    info: "#93C5FD",
    infoBg: "#0F1F36",
    neutral: "#94A3B8",
    neutralBg: "#1A2230",
    shadow: "rgba(2, 6, 23, 0.28)",
    shadowStrong: "rgba(2, 6, 23, 0.42)",
  },
} as const;

type DriverCanvasPalette = (typeof DRIVER_CANVAS_COLOR_MODES)[DriverThemeMode];

const DRIVER_TYPOGRAPHY_BASE = {
  display: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "700" as const,
    letterSpacing: -0.5,
  },
  screenTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "700" as const,
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "700" as const,
    letterSpacing: -0.2,
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600" as const,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400" as const,
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600" as const,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500" as const,
  },
  small: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400" as const,
  },
  micro: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600" as const,
    letterSpacing: 0.4,
    textTransform: "uppercase" as const,
  },
  code: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600" as const,
    fontFamily: driverFonts.mono,
  },
} satisfies Record<string, DriverTypographyToken>;

function typographyWithDensity(
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
> {
  const scale = DENSITY_SCALES[density];

  return {
    display: DRIVER_TYPOGRAPHY_BASE.display,
    screenTitle: {
      ...DRIVER_TYPOGRAPHY_BASE.screenTitle,
      fontSize: scale.titleFontSize,
      lineHeight: scale.titleFontSize + 5,
    },
    sectionTitle: {
      ...DRIVER_TYPOGRAPHY_BASE.sectionTitle,
      fontSize: scale.sectionTitleFontSize,
      lineHeight: scale.sectionTitleFontSize + 5,
    },
    title: {
      ...DRIVER_TYPOGRAPHY_BASE.title,
      fontSize: scale.baseFontSize + 1,
      lineHeight: scale.baseFontSize + 6,
    },
    body: {
      ...DRIVER_TYPOGRAPHY_BASE.body,
      fontSize: scale.baseFontSize,
      lineHeight: scale.baseFontSize + 7,
    },
    bodyStrong: {
      ...DRIVER_TYPOGRAPHY_BASE.bodyStrong,
      fontSize: scale.baseFontSize,
      lineHeight: scale.baseFontSize + 7,
    },
    label: {
      ...DRIVER_TYPOGRAPHY_BASE.label,
      fontSize: scale.baseFontSize - 2,
      lineHeight: scale.baseFontSize + 3,
    },
    small: {
      ...DRIVER_TYPOGRAPHY_BASE.small,
      fontSize: scale.baseFontSize - 2,
      lineHeight: scale.baseFontSize + 3,
    },
    micro: {
      ...DRIVER_TYPOGRAPHY_BASE.micro,
      fontSize: scale.eyebrowFontSize,
      lineHeight: scale.eyebrowFontSize + 3,
    },
    code: DRIVER_TYPOGRAPHY_BASE.code,
  };
}

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
  mode: DriverThemeMode = DRIVER_THEME_DEFAULT_MODE,
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
  mode: DriverThemeMode = DRIVER_THEME_DEFAULT_MODE,
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
  mode: DriverThemeMode = DRIVER_THEME_DEFAULT_MODE,
): string {
  const colors = DRIVER_CANVAS_COLOR_MODES[mode];

  switch (tone) {
    case "strong":
      return colors.text;
    case "muted":
      return colors.textMuted;
    case "dim":
      return colors.textDim;
    case "inverse":
      return "#FFFFFF";
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
  const mode = options?.mode ?? DRIVER_THEME_DEFAULT_MODE;
  const density = options?.density ?? "comfortable";
  const densityScale = DENSITY_SCALES[density];
  const palette = DRIVER_CANVAS_COLOR_MODES[mode];

  return {
    mode,
    density,
    colors: {
      appBackground: palette.bg,
      bg: palette.bg,
      bgRaised: palette.bgRaised,
      surface: palette.surface,
      surfaceHi: palette.surfaceHi,
      surfaceLo: palette.surfaceLo,
      surfaceMuted: palette.surfaceLo,
      surfaceRaised: palette.bgRaised,
      surfaceWarning: palette.warnBg,
      surfaceDanger: palette.dangerBg,
      textStrong: palette.text,
      text: palette.text,
      textBody: palette.text,
      textMuted: palette.textMuted,
      textDim: palette.textDim,
      inverse: "#FFFFFF",
      border: palette.border,
      borderStrong: palette.borderStrong,
      shadow: palette.shadow,
      shadowStrong: palette.shadowStrong,
      brand: palette.brand,
      brandHi: palette.brandHi,
      brandBg: palette.brandBg,
      primary: palette.brand,
      primarySurface: palette.brandBg,
      primaryBorder: palette.ownedBorder,
      primaryPressed: palette.brandHi,
      owned: palette.ownedFg,
      ownedBg: palette.ownedBg,
      ownedBorder: palette.ownedBorder,
      forwarded: palette.forwardedFg,
      forwardedBg: palette.forwardedBg,
      forwardedBorder: palette.forwardedBorder,
      success: palette.success,
      successBg: palette.successBg,
      warning: palette.warn,
      warn: palette.warn,
      warningBg: palette.warnBg,
      warnBg: palette.warnBg,
      danger: palette.danger,
      dangerBg: palette.dangerBg,
      info: palette.info,
      infoBg: palette.infoBg,
      neutral: palette.neutral,
      neutralBg: palette.neutralBg,
      icon: palette.text,
      iconMuted: palette.textMuted,
    },
    fonts: driverFonts,
    spacing: driverSpacing,
    radius: driverRadius,
    typography: typographyWithDensity(density),
    densityScale,
    layout: {
      pagePadding: 16,
      contentGap: densityScale.sectionGap,
      cardPadding: densityScale.cardPadding,
      headerHeight: 64,
      bottomBarInset: 16,
      touchTarget: 44,
      fieldHeight: 48,
      screenGap: densityScale.sectionGap,
    },
    shadows: {
      sm: {
        shadowColor: mode === "dark" ? "#000000" : "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: mode === "dark" ? 0.28 : 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
      md: {
        shadowColor: mode === "dark" ? "#000000" : "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: mode === "dark" ? 0.32 : 0.08,
        shadowRadius: 24,
        elevation: 3,
      },
    },
  } as const;
}

function createLegacyTokens(palette: DriverCanvasPalette) {
  return {
    mode: DRIVER_THEME_DEFAULT_MODE,
    colors: {
      bg: palette.bg,
      bgRaised: palette.bgRaised,
      surface: palette.surface,
      surfaceHi: palette.surfaceHi,
      surfaceLo: palette.surfaceLo,
      appBg: palette.bg,
      surfaceMuted: palette.surfaceLo,
      surfaceWarning: palette.warnBg,
      surfaceDanger: palette.dangerBg,
      text: palette.text,
      textStrong: palette.text,
      textBody: palette.text,
      textMuted: palette.textMuted,
      textDim: palette.textDim,
      textInverse: "#FFFFFF",
      brand: palette.brand,
      brandHi: palette.brandHi,
      brandBg: palette.brandBg,
      primary: palette.brand,
      primaryPressed: palette.brandHi,
      owned: palette.ownedFg,
      ownedBg: palette.ownedBg,
      ownedBorder: palette.ownedBorder,
      forwarded: palette.forwardedFg,
      forwardedBg: palette.forwardedBg,
      forwardedBorder: palette.forwardedBorder,
      success: palette.success,
      successBg: palette.successBg,
      warning: palette.warn,
      warn: palette.warn,
      warningBg: palette.warnBg,
      warnBg: palette.warnBg,
      danger: palette.danger,
      dangerBg: palette.dangerBg,
      info: palette.info,
      infoBg: palette.infoBg,
      neutral: palette.neutral,
      neutralBg: palette.neutralBg,
      border: palette.border,
      borderStrong: palette.borderStrong,
      icon: palette.text,
      iconMuted: palette.textMuted,
      shadow: palette.shadow,
      shadowStrong: palette.shadowStrong,
    },
    radius: {
      ...driverRadius,
      6: 6,
      10: 10,
      14: 14,
      18: 18,
      999: 999,
    },
    spacing: driverSpacing,
    fonts: driverFonts,
    type: {
      display: DRIVER_TYPOGRAPHY_BASE.display,
      screenTitle: DRIVER_TYPOGRAPHY_BASE.screenTitle,
      sectionTitle: DRIVER_TYPOGRAPHY_BASE.sectionTitle,
      title: DRIVER_TYPOGRAPHY_BASE.title,
      body: DRIVER_TYPOGRAPHY_BASE.body,
      bodyStrong: DRIVER_TYPOGRAPHY_BASE.bodyStrong,
      label: DRIVER_TYPOGRAPHY_BASE.label,
      small: DRIVER_TYPOGRAPHY_BASE.small,
      micro: DRIVER_TYPOGRAPHY_BASE.micro,
      code: DRIVER_TYPOGRAPHY_BASE.code,
    },
    shadows: {
      sm: {
        shadowColor:
          DRIVER_THEME_DEFAULT_MODE === "dark" ? "#000000" : "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: DRIVER_THEME_DEFAULT_MODE === "dark" ? 0.28 : 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
      md: {
        shadowColor:
          DRIVER_THEME_DEFAULT_MODE === "dark" ? "#000000" : "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: DRIVER_THEME_DEFAULT_MODE === "dark" ? 0.32 : 0.08,
        shadowRadius: 24,
        elevation: 3,
      },
    },
    layout: {
      pagePadding: 16,
      headerHeight: 64,
      screenGap: 16,
      bottomBarInset: 16,
    },
  } as const;
}

function createNavigationTheme(mode: DriverThemeMode) {
  const theme = createDriverTheme({ mode });

  return {
    dark: mode === "dark",
    colors: {
      primary: theme.colors.primary,
      background: theme.colors.appBackground,
      card: theme.colors.bgRaised,
      text: theme.colors.textStrong,
      border: theme.colors.border,
      notification: theme.colors.danger,
    },
    fonts: {
      regular: {
        fontFamily: driverFonts.sans,
        fontWeight: "400" as const,
      },
      medium: {
        fontFamily: driverFonts.sans,
        fontWeight: "500" as const,
      },
      bold: {
        fontFamily: driverFonts.sans,
        fontWeight: "600" as const,
      },
      heavy: {
        fontFamily: driverFonts.sans,
        fontWeight: "700" as const,
      },
    },
  };
}

export const driverTheme = createDriverTheme();
export const driverLegacyTokens = createLegacyTokens(
  DRIVER_CANVAS_COLOR_MODES[DRIVER_THEME_DEFAULT_MODE],
);
export const Tokens = driverLegacyTokens;
export const tokens = driverLegacyTokens;
export const driverNavigationTheme = createNavigationTheme(
  DRIVER_THEME_DEFAULT_MODE,
);
export const driverDisplayStrings = DISPLAY_STRINGS;
