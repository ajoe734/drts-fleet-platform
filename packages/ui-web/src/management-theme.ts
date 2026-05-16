import {
  AUTHORITY_COLORS,
  STATUS_TONES,
  SURFACE_ACCENTS,
  type AuthorityKind,
  type ConsoleAccentName,
  type TokenMode,
} from "@drts/ui-tokens";
import type { CSSProperties } from "react";

export type ManagementMode = TokenMode;
export type ManagementAccent = ConsoleAccentName;
export type ManagementAuthority = AuthorityKind;
export type ManagementTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent"
  | ManagementAccent
  | ManagementAuthority;

export type ManagementDensity = "comfortable" | "compact";

type DensityScale = Record<ManagementDensity, string>;

export const MANAGEMENT_SPACING = {
  shellPadding: { comfortable: "32px", compact: "24px" } satisfies DensityScale,
  pageStackGap: { comfortable: "20px", compact: "16px" } satisfies DensityScale,
  sectionGap: { comfortable: "16px", compact: "12px" } satisfies DensityScale,
  surfacePadding: {
    comfortable: "18px 20px",
    compact: "14px 16px",
  } satisfies DensityScale,
  pageHeaderMarginBottom: {
    comfortable: "24px",
    compact: "20px",
  } satisfies DensityScale,
} as const;

export const MANAGEMENT_RADIUS = {
  surface: "18px",
  inset: "14px",
  pill: "999px",
} as const;

export const MANAGEMENT_TYPOGRAPHY = {
  pageTitle: { comfortable: "18px", compact: "16px" } satisfies DensityScale,
  sectionTitle: {
    comfortable: "16px",
    compact: "15px",
  } satisfies DensityScale,
  body: { comfortable: "13px", compact: "12.5px" } satisfies DensityScale,
  caption: { comfortable: "12.5px", compact: "12px" } satisfies DensityScale,
  eyebrowLetterSpacing: "0.12em",
} as const;

export function densityValue<T>(
  density: ManagementDensity,
  scale: { comfortable: T; compact: T },
): T {
  return density === "compact" ? scale.compact : scale.comfortable;
}

type ToneStyles = {
  background: string;
  border: string;
  text: string;
  subtle: string;
};

type ThemeColors = {
  pageBackground: string;
  pageBackgroundMuted: string;
  surface: string;
  surfaceMuted: string;
  textStrong: string;
  text: string;
  textMuted: string;
  textDim: string;
  sidebar: string;
  sidebarHover: string;
  sidebarActive: string;
};

export const MANAGEMENT_COLOR_MODES = {
  light: {
    pageBackground: "#f8fafc",
    pageBackgroundMuted: "#f1f5f9",
    surface: "#ffffff",
    surfaceMuted: "#f8fafc",
    textStrong: "#0f172a",
    text: "#334155",
    textMuted: "#64748b",
    textDim: "#94a3b8",
    sidebar: "#0f172a",
    sidebarHover: "#1e293b",
    sidebarActive: "#1d4ed8",
  },
  dark: {
    pageBackground: "#020617",
    pageBackgroundMuted: "#0f172a",
    surface: "#0f172a",
    surfaceMuted: "#111827",
    textStrong: "#f8fafc",
    text: "#e2e8f0",
    textMuted: "#94a3b8",
    textDim: "#64748b",
    sidebar: "#020617",
    sidebarHover: "#0f172a",
    sidebarActive: "#6366f1",
  },
} as const satisfies Record<ManagementMode, ThemeColors>;

export const MANAGEMENT_COLORS = MANAGEMENT_COLOR_MODES.light;

const STATUS_SURFACE_TONES = {
  neutral: {
    light: {
      background: STATUS_TONES.neutral.light.bg,
      border: STATUS_TONES.neutral.light.border,
      text: STATUS_TONES.neutral.light.fg,
      subtle: STATUS_TONES.neutral.light.fg,
    },
    dark: {
      background: STATUS_TONES.neutral.dark.bg,
      border: STATUS_TONES.neutral.dark.border,
      text: STATUS_TONES.neutral.dark.fg,
      subtle: STATUS_TONES.neutral.dark.fg,
    },
  },
  info: {
    light: {
      background: STATUS_TONES.info.light.bg,
      border: STATUS_TONES.info.light.border,
      text: STATUS_TONES.info.light.fg,
      subtle: STATUS_TONES.info.light.fg,
    },
    dark: {
      background: STATUS_TONES.info.dark.bg,
      border: STATUS_TONES.info.dark.border,
      text: STATUS_TONES.info.dark.fg,
      subtle: STATUS_TONES.info.dark.fg,
    },
  },
  success: {
    light: {
      background: STATUS_TONES.success.light.bg,
      border: STATUS_TONES.success.light.border,
      text: STATUS_TONES.success.light.fg,
      subtle: STATUS_TONES.success.light.fg,
    },
    dark: {
      background: STATUS_TONES.success.dark.bg,
      border: STATUS_TONES.success.dark.border,
      text: STATUS_TONES.success.dark.fg,
      subtle: STATUS_TONES.success.dark.fg,
    },
  },
  warning: {
    light: {
      background: STATUS_TONES.warning.light.bg,
      border: STATUS_TONES.warning.light.border,
      text: STATUS_TONES.warning.light.fg,
      subtle: STATUS_TONES.warning.light.fg,
    },
    dark: {
      background: STATUS_TONES.warning.dark.bg,
      border: STATUS_TONES.warning.dark.border,
      text: STATUS_TONES.warning.dark.fg,
      subtle: STATUS_TONES.warning.dark.fg,
    },
  },
  danger: {
    light: {
      background: STATUS_TONES.danger.light.bg,
      border: STATUS_TONES.danger.light.border,
      text: STATUS_TONES.danger.light.fg,
      subtle: STATUS_TONES.danger.light.fg,
    },
    dark: {
      background: STATUS_TONES.danger.dark.bg,
      border: STATUS_TONES.danger.dark.border,
      text: STATUS_TONES.danger.dark.fg,
      subtle: STATUS_TONES.danger.dark.fg,
    },
  },
  accent: {
    light: {
      background: SURFACE_ACCENTS.platform.light.bg,
      border: SURFACE_ACCENTS.platform.light.border,
      text: SURFACE_ACCENTS.platform.light.fg,
      subtle: SURFACE_ACCENTS.platform.light.hi,
    },
    dark: {
      background: SURFACE_ACCENTS.platform.dark.bg,
      border: SURFACE_ACCENTS.platform.dark.border,
      text: SURFACE_ACCENTS.platform.dark.fg,
      subtle: SURFACE_ACCENTS.platform.dark.hi,
    },
  },
} as const satisfies Record<
  "neutral" | "info" | "success" | "warning" | "danger" | "accent",
  Record<ManagementMode, ToneStyles>
>;

const ACCENT_SURFACE_TONES = {
  platform: {
    light: {
      background: SURFACE_ACCENTS.platform.light.bg,
      border: SURFACE_ACCENTS.platform.light.border,
      text: SURFACE_ACCENTS.platform.light.fg,
      subtle: SURFACE_ACCENTS.platform.light.hi,
    },
    dark: {
      background: SURFACE_ACCENTS.platform.dark.bg,
      border: SURFACE_ACCENTS.platform.dark.border,
      text: SURFACE_ACCENTS.platform.dark.fg,
      subtle: SURFACE_ACCENTS.platform.dark.hi,
    },
  },
  ops: {
    light: {
      background: SURFACE_ACCENTS.ops.light.bg,
      border: SURFACE_ACCENTS.ops.light.border,
      text: SURFACE_ACCENTS.ops.light.fg,
      subtle: SURFACE_ACCENTS.ops.light.hi,
    },
    dark: {
      background: SURFACE_ACCENTS.ops.dark.bg,
      border: SURFACE_ACCENTS.ops.dark.border,
      text: SURFACE_ACCENTS.ops.dark.fg,
      subtle: SURFACE_ACCENTS.ops.dark.hi,
    },
  },
  tenant: {
    light: {
      background: SURFACE_ACCENTS.tenant.light.bg,
      border: SURFACE_ACCENTS.tenant.light.border,
      text: SURFACE_ACCENTS.tenant.light.fg,
      subtle: SURFACE_ACCENTS.tenant.light.hi,
    },
    dark: {
      background: SURFACE_ACCENTS.tenant.dark.bg,
      border: SURFACE_ACCENTS.tenant.dark.border,
      text: SURFACE_ACCENTS.tenant.dark.fg,
      subtle: SURFACE_ACCENTS.tenant.dark.hi,
    },
  },
  partner: {
    light: {
      background: SURFACE_ACCENTS.partner.light.bg,
      border: SURFACE_ACCENTS.partner.light.border,
      text: SURFACE_ACCENTS.partner.light.fg,
      subtle: SURFACE_ACCENTS.partner.light.hi,
    },
    dark: {
      background: SURFACE_ACCENTS.partner.dark.bg,
      border: SURFACE_ACCENTS.partner.dark.border,
      text: SURFACE_ACCENTS.partner.dark.fg,
      subtle: SURFACE_ACCENTS.partner.dark.hi,
    },
  },
} as const satisfies Record<
  ManagementAccent,
  Record<ManagementMode, ToneStyles>
>;

const AUTHORITY_SURFACE_TONES = {
  owned: {
    light: {
      background: AUTHORITY_COLORS.owned.light.bg,
      border: AUTHORITY_COLORS.owned.light.border,
      text: AUTHORITY_COLORS.owned.light.fg,
      subtle: AUTHORITY_COLORS.owned.light.fg,
    },
    dark: {
      background: AUTHORITY_COLORS.owned.dark.bg,
      border: AUTHORITY_COLORS.owned.dark.border,
      text: AUTHORITY_COLORS.owned.dark.fg,
      subtle: AUTHORITY_COLORS.owned.dark.fg,
    },
  },
  forwarded: {
    light: {
      background: AUTHORITY_COLORS.forwarded.light.bg,
      border: AUTHORITY_COLORS.forwarded.light.border,
      text: AUTHORITY_COLORS.forwarded.light.fg,
      subtle: AUTHORITY_COLORS.forwarded.light.fg,
    },
    dark: {
      background: AUTHORITY_COLORS.forwarded.dark.bg,
      border: AUTHORITY_COLORS.forwarded.dark.border,
      text: AUTHORITY_COLORS.forwarded.dark.fg,
      subtle: AUTHORITY_COLORS.forwarded.dark.fg,
    },
  },
} as const satisfies Record<
  ManagementAuthority,
  Record<ManagementMode, ToneStyles>
>;

export const MANAGEMENT_SURFACE_TONE_MODES = {
  ...STATUS_SURFACE_TONES,
  ...ACCENT_SURFACE_TONES,
  ...AUTHORITY_SURFACE_TONES,
} as const satisfies Record<ManagementTone, Record<ManagementMode, ToneStyles>>;

export const MANAGEMENT_SURFACE_TONES: Record<ManagementTone, ToneStyles> = {
  neutral: MANAGEMENT_SURFACE_TONE_MODES.neutral.light,
  info: MANAGEMENT_SURFACE_TONE_MODES.info.light,
  success: MANAGEMENT_SURFACE_TONE_MODES.success.light,
  warning: MANAGEMENT_SURFACE_TONE_MODES.warning.light,
  danger: MANAGEMENT_SURFACE_TONE_MODES.danger.light,
  accent: MANAGEMENT_SURFACE_TONE_MODES.accent.light,
  platform: MANAGEMENT_SURFACE_TONE_MODES.platform.light,
  ops: MANAGEMENT_SURFACE_TONE_MODES.ops.light,
  tenant: MANAGEMENT_SURFACE_TONE_MODES.tenant.light,
  partner: MANAGEMENT_SURFACE_TONE_MODES.partner.light,
  owned: MANAGEMENT_SURFACE_TONE_MODES.owned.light,
  forwarded: MANAGEMENT_SURFACE_TONE_MODES.forwarded.light,
};

export function managementColors(mode: ManagementMode = "light"): ThemeColors {
  return MANAGEMENT_COLOR_MODES[mode];
}

export function managementSurfaceTone(
  tone: ManagementTone = "neutral",
  mode: ManagementMode = "light",
): ToneStyles {
  return MANAGEMENT_SURFACE_TONE_MODES[tone][mode];
}

export function managementMainShellStyle(
  density: ManagementDensity = "comfortable",
  mode: ManagementMode = "light",
): CSSProperties {
  const colors = managementColors(mode);

  return {
    flex: 1,
    minWidth: 0,
    minHeight: "100vh",
    padding: densityValue(density, MANAGEMENT_SPACING.shellPadding),
    background: colors.pageBackground,
    color: colors.text,
  };
}

export function managementPageStackStyle(
  density: ManagementDensity = "comfortable",
): CSSProperties {
  return {
    display: "grid",
    gap: densityValue(density, MANAGEMENT_SPACING.pageStackGap),
  };
}

export function managementSurfaceStyle(
  tone: ManagementTone = "neutral",
  mode: ManagementMode = "light",
): CSSProperties {
  const toneStyles = managementSurfaceTone(tone, mode);
  const colors = managementColors(mode);

  return {
    background: colors.surface,
    color: colors.text,
    borderRadius: MANAGEMENT_RADIUS.surface,
    border: `1px solid ${toneStyles.border}`,
    boxShadow:
      mode === "dark"
        ? "0 16px 40px rgba(2, 6, 23, 0.45)"
        : "0 8px 24px rgba(15, 23, 42, 0.05)",
  };
}
