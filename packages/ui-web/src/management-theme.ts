import type { CSSProperties } from "react";

export type ManagementTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

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

export const MANAGEMENT_COLORS = {
  pageBackground: "#f8fafc",
  surface: "#ffffff",
  textStrong: "#0f172a",
  text: "#334155",
  textMuted: "#64748b",
  textDim: "#94a3b8",
  sidebar: "#0f172a",
  sidebarHover: "#1e293b",
  sidebarActive: "#1d4ed8",
} as const;

export const MANAGEMENT_SURFACE_TONES: Record<ManagementTone, ToneStyles> = {
  neutral: {
    background: "#f8fafc",
    border: "#cbd5e1",
    text: "#334155",
    subtle: "#64748b",
  },
  info: {
    background: "#eff6ff",
    border: "#93c5fd",
    text: "#1d4ed8",
    subtle: "#1e40af",
  },
  success: {
    background: "#f0fdf4",
    border: "#86efac",
    text: "#166534",
    subtle: "#15803d",
  },
  warning: {
    background: "#fff7ed",
    border: "#fdba74",
    text: "#c2410c",
    subtle: "#9a3412",
  },
  danger: {
    background: "#fef2f2",
    border: "#fca5a5",
    text: "#b91c1c",
    subtle: "#991b1b",
  },
  accent: {
    background: "#f5f3ff",
    border: "#c4b5fd",
    text: "#6d28d9",
    subtle: "#7c3aed",
  },
};

export function managementMainShellStyle(
  density: ManagementDensity = "comfortable",
): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    minHeight: "100vh",
    padding: densityValue(density, MANAGEMENT_SPACING.shellPadding),
    background: MANAGEMENT_COLORS.pageBackground,
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
): CSSProperties {
  const toneStyles = MANAGEMENT_SURFACE_TONES[tone];

  return {
    background: MANAGEMENT_COLORS.surface,
    borderRadius: MANAGEMENT_RADIUS.surface,
    border: `1px solid ${toneStyles.border}`,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
  };
}
