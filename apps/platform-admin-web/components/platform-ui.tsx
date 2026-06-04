import type { CSSProperties } from "react";
import { managementSurfaceStyle } from "@drts/ui-web";

export type ActionButtonTone = "primary" | "secondary";
export type ActionButtonSize = "md" | "sm";
export type StatusTone = "success" | "warning" | "info" | "neutral" | "danger";

export const pageHeaderStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginBottom: 24,
};

export const pageHeaderTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  color: "#0f172a",
};

export const pageHeaderSubtitleStyle: CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 14,
  lineHeight: 1.6,
};

export const surfaceCardStyle: CSSProperties = {
  ...managementSurfaceStyle("neutral"),
  padding: 20,
};

export const toolbarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 16,
  alignItems: "center",
};

export const toggleGroupStyle: CSSProperties = {
  display: "inline-flex",
  flexWrap: "wrap",
  gap: 8,
};

export const tableCardStyle: CSSProperties = {
  ...surfaceCardStyle,
  overflowX: "auto",
};

export function mergeStyles(
  ...styles: Array<CSSProperties | undefined>
): CSSProperties {
  return Object.assign({}, ...styles);
}

export function toggleButtonStyle(active: boolean): CSSProperties {
  return {
    appearance: "none",
    border: active ? "1px solid #1e3a8a" : "1px solid #cbd5e1",
    background: active ? "#1e3a8a" : "#ffffff",
    color: active ? "#ffffff" : "#1e293b",
    borderRadius: 999,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s ease, border-color 0.15s ease",
  };
}

export function actionButtonStyle({
  tone = "secondary",
  size = "md",
}: {
  tone?: ActionButtonTone;
  size?: ActionButtonSize;
} = {}): CSSProperties {
  const isPrimary = tone === "primary";

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: size === "sm" ? "5px 10px" : "8px 14px",
    border: isPrimary ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
    borderRadius: 10,
    background: isPrimary ? "#1d4ed8" : "#ffffff",
    color: isPrimary ? "#ffffff" : "#1e293b",
    fontSize: size === "sm" ? 12 : 13,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    lineHeight: 1.2,
    boxShadow: isPrimary ? "0 8px 24px rgba(29, 78, 216, 0.16)" : "none",
  };
}

export const emptyStateStyle: CSSProperties = {
  textAlign: "center",
  padding: "32px 20px",
  color: "#64748b",
  border: "1px dashed #cbd5e1",
  borderRadius: 14,
  background: "#f8fafc",
};

export const tableEmptyStateStyle: CSSProperties = {
  ...emptyStateStyle,
  margin: 0,
};

export const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

export const tableHeadCellStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #cbd5e1",
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#475569",
};

export const tableCellStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
};

export function statusBadgeStyle(tone: StatusTone): CSSProperties {
  const tones: Record<StatusTone, { background: string; color: string }> = {
    success: {
      background: "rgba(22, 163, 74, 0.12)",
      color: "#166534",
    },
    warning: {
      background: "rgba(245, 158, 11, 0.14)",
      color: "#92400e",
    },
    info: {
      background: "rgba(59, 130, 246, 0.12)",
      color: "#1d4ed8",
    },
    neutral: {
      background: "rgba(100, 116, 139, 0.12)",
      color: "#475569",
    },
    danger: {
      background: "rgba(239, 68, 68, 0.12)",
      color: "#991b1b",
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
    ...tones[tone],
  };
}

export const fieldLabelStyle: CSSProperties = {
  marginBottom: 6,
  color: "#475569",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  lineHeight: 1.4,
};

export const textMutedStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 12.5,
  lineHeight: 1.5,
};

export const monoTextStyle: CSSProperties = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
};

export const linkStyle: CSSProperties = {
  color: "#1d4ed8",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};

export const switchStyle = {
  root(checked: boolean): CSSProperties {
    return {
      appearance: "none",
      border: 0,
      padding: 0,
      width: 40,
      height: 22,
      borderRadius: 999,
      background: checked ? "#1d4ed8" : "#cbd5e1",
      position: "relative",
      cursor: "pointer",
      transition: "background 0.2s ease",
      flexShrink: 0,
    };
  },
  thumb(checked: boolean): CSSProperties {
    return {
      position: "absolute",
      top: 3,
      left: 3,
      width: 16,
      height: 16,
      borderRadius: "50%",
      background: "#ffffff",
      transform: checked ? "translateX(18px)" : "translateX(0)",
      transition: "transform 0.2s ease",
    };
  },
};
