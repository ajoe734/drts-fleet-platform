// enterprise-theme.ts — faithful port of the Enterprise Dispatch design canvas
// token object (docs/05-ui/drts-design-canvas/ent-kit.jsx · buildEnt).
// Tenant-branded employee self-service. Accent #2457D6. zh-TW primary.
// NOT the shared @drts/ui-web canvas theme — this app owns its own kit.

import type { CSSProperties } from "react";

export const ENT_SANS =
  '"Inter","Noto Sans TC",-apple-system,system-ui,sans-serif';
export const ENT_MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';

export interface EntTheme {
  dark: boolean;
  density: "comfy" | "compact";
  pad: number;
  gap: number;
  radius: number;
  radiusSm: number;
  sans: string;
  mono: string;
  bg: string;
  surface: string;
  surfaceLo: string;
  surfaceHi: string;
  ink: string;
  ink2: string;
  muted: string;
  faint: string;
  line: string;
  lineSoft: string;
  primary: string;
  primaryHi: string;
  primaryBg: string;
  primaryBd: string;
  success: string;
  successBg: string;
  successBd: string;
  warn: string;
  warnBg: string;
  warnBd: string;
  danger: string;
  dangerBg: string;
  dangerBd: string;
  info: string;
  infoBg: string;
  infoBd: string;
  shadow: string;
  shadowSm: string;
}

export function buildEnt({
  dark = false,
  density = "comfy",
  accent = "#2457D6",
}: {
  dark?: boolean;
  density?: "comfy" | "compact";
  accent?: string;
} = {}): EntTheme {
  const D = density === "compact";
  const base = dark
    ? {
        bg: "#0E1320",
        surface: "#161C2B",
        surfaceLo: "#1B2233",
        surfaceHi: "#1E2638",
        ink: "#EDF0F6",
        ink2: "#C2C9D6",
        muted: "#8C96A8",
        faint: "#697388",
        line: "#283145",
        lineSoft: "#222A3B",
        primary: accent,
        primaryHi: "#5B86E8",
        primaryBg: "#16213C",
        primaryBd: "#27375C",
        success: "#5BD08A",
        successBg: "#10271C",
        successBd: "#1C4733",
        warn: "#F0B429",
        warnBg: "#2A2110",
        warnBd: "#4A3A12",
        danger: "#F38B82",
        dangerBg: "#2A1614",
        dangerBd: "#50221E",
        info: "#7FA8F0",
        infoBg: "#15213B",
        infoBd: "#27375C",
        shadow: "0 10px 30px -12px rgba(0,0,0,.6)",
        shadowSm: "0 1px 2px rgba(0,0,0,.4)",
      }
    : {
        bg: "#F4F6FA",
        surface: "#FFFFFF",
        surfaceLo: "#F7F9FC",
        surfaceHi: "#FFFFFF",
        ink: "#19223A",
        ink2: "#43506B",
        muted: "#6B7689",
        faint: "#9AA3B4",
        line: "#E5E9F1",
        lineSoft: "#EEF1F7",
        primary: accent,
        primaryHi: "#1A45AD",
        primaryBg: "#EBF1FE",
        primaryBd: "#C7D9FB",
        success: "#15803D",
        successBg: "#ECFDF3",
        successBd: "#ABEFC6",
        warn: "#B54708",
        warnBg: "#FFFAEB",
        warnBd: "#FEDF89",
        danger: "#B42318",
        dangerBg: "#FEF3F2",
        dangerBd: "#FECDCA",
        info: "#175CD3",
        infoBg: "#EFF4FF",
        infoBd: "#B2CCFF",
        shadow:
          "0 10px 34px -16px rgba(20,30,60,.28), 0 2px 6px -3px rgba(20,30,60,.08)",
        shadowSm: "0 1px 2px rgba(16,24,40,.06)",
      };
  return {
    dark,
    density,
    pad: D ? 16 : 22,
    gap: D ? 12 : 16,
    radius: 16,
    radiusSm: 11,
    sans: ENT_SANS,
    mono: ENT_MONO,
    ...base,
  };
}

// Single shared instance (light, comfy, brand accent) used across the app.
export const enterpriseTheme: EntTheme = buildEnt();

export const enterprisePageStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 24,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
};

export const enterpriseCardGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
};
