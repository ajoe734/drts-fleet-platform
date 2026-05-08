import React from "react";

// Design Tokens (based on mgmt-screens.jsx)
export const TYPE = {
  family: "system-ui, -apple-system, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

export const THEME_LIGHT = {
  bg: "#f8fafc",
  bgRaised: "#ffffff",
  surface: "#ffffff",
  surfaceLo: "#f1f5f9",
  border: "rgba(0,0,0,0.08)",
  text: "#0f172a",
  textMuted: "#64748b",
  textDim: "#94a3b8",
  brand: "#3b82f6",
  brandBg: "rgba(59,130,246,0.1)",
  success: "#10b981",
  successBg: "rgba(16,185,129,0.1)",
  danger: "#ef4444",
  dangerBg: "rgba(239,68,68,0.1)",
  warn: "#f59e0b",
  warnBg: "rgba(245,158,11,0.1)",
  info: "#3b82f6",
  infoBg: "rgba(59,130,246,0.1)",
  neutral: "#64748b",
  neutralBg: "rgba(100,116,139,0.1)",
  ownedFg: "#10b981",
  ownedBg: "rgba(16,185,129,0.12)",
  forwardedFg: "#f59e0b",
  forwardedBg: "rgba(245,158,11,0.12)",
};

// Default theme to use
const t = THEME_LIGHT;

export function Card({
  children,
  padding = 16,
  style = {},
}: {
  children: React.ReactNode;
  padding?: number | string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding,
        boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
  dot = false,
  size = "md",
}: {
  children: React.ReactNode;
  tone?: string;
  dot?: boolean;
  size?: "sm" | "md";
}) {
  const colors: any = {
    success: { bg: t.successBg, fg: t.success, dot: t.success },
    danger: { bg: t.dangerBg, fg: t.danger, dot: t.danger },
    warn: { bg: t.warnBg, fg: t.warn, dot: t.warn },
    info: { bg: t.infoBg, fg: t.info, dot: t.info },
    neutral: { bg: t.neutralBg, fg: t.textMuted, dot: t.textDim },
    brand: { bg: t.brandBg, fg: t.brand, dot: t.brand },
  };
  const c = colors[tone] || colors.neutral;
  const padding = size === "sm" ? "2px 8px" : "4px 10px";
  const fontSize = size === "sm" ? 11 : 12;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: c.bg,
        color: c.fg,
        padding,
        borderRadius: 20,
        fontSize,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          style={{ width: 6, height: 6, borderRadius: 3, background: c.dot }}
        />
      )}
      {children}
    </span>
  );
}

export function Kpi({
  label,
  value,
  tone = "neutral",
  unit,
}: {
  label: string;
  value: string | number;
  tone?: string;
  unit?: string;
  icon?: React.ReactNode;
}) {
  const colors: any = {
    brand: { fg: t.brand, bg: t.brandBg },
    warn: { fg: t.warn, bg: t.warnBg },
    danger: { fg: t.danger, bg: t.dangerBg },
    success: { fg: t.success, bg: t.successBg },
    info: { fg: t.info, bg: t.infoBg },
    neutral: { fg: t.text, bg: t.surfaceLo },
  };
  const c = colors[tone] || colors.neutral;

  return (
    <div
      style={{
        flex: 1,
        minWidth: 120,
        padding: "12px 16px",
        background: t.bgRaised,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: t.textMuted,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <div
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: c.fg,
            fontFamily: TYPE.mono,
          }}
        >
          {value}
        </div>
        {unit && (
          <div style={{ fontSize: 12, fontWeight: 600, color: t.textDim }}>
            {unit}
          </div>
        )}
      </div>
    </div>
  );
}

export function PlatformIcon({
  code,
  forwarded,
}: {
  code: string;
  forwarded?: boolean;
}) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: forwarded ? t.forwardedBg : t.ownedBg,
        color: forwarded ? t.forwardedFg : t.ownedFg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 800,
        fontFamily: TYPE.mono,
      }}
    >
      {code.slice(0, 3)}
    </div>
  );
}

export function Switch({
  on,
  onChange,
}: {
  on: boolean;
  onChange?: (on: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange?.(!on)}
      style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        background: on ? t.brand : t.textDim,
        position: "relative",
        cursor: "pointer",
        transition: "0.2s background",
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          background: "#fff",
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          transition: "0.2s left",
        }}
      />
    </div>
  );
}

export function Button({
  children,
  kind = "primary",
  size = "md",
  full = false,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  kind?: "primary" | "outline";
  size?: "sm" | "md";
  full?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const padding = size === "sm" ? "6px 12px" : "10px 16px";
  const fontSize = size === "sm" ? 12 : 13;

  const styles: any = {
    primary: {
      background: t.brand,
      color: "#fff",
      border: "none",
    },
    outline: {
      background: "transparent",
      color: t.text,
      border: `1px solid ${t.border}`,
    },
  };
  const s = styles[kind];

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding,
        fontSize,
        fontWeight: 600,
        borderRadius: 8,
        cursor: "pointer",
        width: full ? "100%" : "auto",
        ...s,
      }}
    >
      {icon}
      {children}
    </button>
  );
}
