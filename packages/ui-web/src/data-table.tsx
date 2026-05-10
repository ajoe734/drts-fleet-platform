"use client";

import { Children, type ReactNode } from "react";
import {
  MANAGEMENT_COLORS,
  MANAGEMENT_SURFACE_TONES,
} from "./management-theme";
import type { ManagementTone } from "./management-theme";

export interface Column {
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
}

interface DataTableProps {
  columns: Column[];
  children: ReactNode;
  empty?: string;
  density?: "comfortable" | "compact";
  minWidth?: number | string;
  tone?: ManagementTone;
}

const TABLE_TONE_HEADER: Record<ManagementTone, string> = {
  neutral: MANAGEMENT_SURFACE_TONES.neutral.background,
  info: MANAGEMENT_SURFACE_TONES.info.background,
  success: MANAGEMENT_SURFACE_TONES.success.background,
  warning: MANAGEMENT_SURFACE_TONES.warning.background,
  danger: MANAGEMENT_SURFACE_TONES.danger.background,
  accent: MANAGEMENT_SURFACE_TONES.accent.background,
  platform: MANAGEMENT_SURFACE_TONES.platform.background,
  ops: MANAGEMENT_SURFACE_TONES.ops.background,
  tenant: MANAGEMENT_SURFACE_TONES.tenant.background,
  partner: MANAGEMENT_SURFACE_TONES.partner.background,
  owned: MANAGEMENT_SURFACE_TONES.owned.background,
  forwarded: MANAGEMENT_SURFACE_TONES.forwarded.background,
};

export function DataTable({
  columns,
  children,
  empty,
  density = "comfortable",
  minWidth = 720,
  tone = "neutral",
}: DataTableProps) {
  const hasRows = Children.count(children) > 0;
  const headBackground = TABLE_TONE_HEADER[tone];
  const padding = density === "compact" ? "9px 12px" : "10px 16px";

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          minWidth,
          width: "100%",
          borderCollapse: "collapse",
          fontSize: density === "compact" ? "13px" : "13.5px",
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.label}
                style={{
                  padding,
                  textAlign: col.align ?? "left",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  background: headBackground,
                  borderBottom: "1px solid #e2e8f0",
                  width: col.width,
                  whiteSpace: "nowrap",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {!hasRows && empty && (
        <p
          style={{
            textAlign: "center",
            padding: "32px 0",
            color: MANAGEMENT_COLORS.textDim,
            fontSize: "14px",
          }}
        >
          {empty}
        </p>
      )}
    </div>
  );
}

export function Tr({
  children,
  highlighted = false,
}: {
  children: ReactNode;
  highlighted?: boolean;
}) {
  return (
    <tr
      style={{
        borderBottom: "1px solid #f1f5f9",
        background: highlighted ? "#fffbeb" : "transparent",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = highlighted
          ? "#fffbeb"
          : "transparent";
      }}
    >
      {children}
    </tr>
  );
}

interface TdProps {
  children: ReactNode;
  muted?: boolean;
  mono?: boolean;
  align?: "left" | "center" | "right";
  density?: "comfortable" | "compact";
}

export function Td({
  children,
  muted,
  mono,
  align,
  density = "comfortable",
}: TdProps) {
  return (
    <td
      style={{
        padding: density === "compact" ? "10px 12px" : "12px 16px",
        color: muted ? "#64748b" : "#0f172a",
        fontFamily: mono ? "monospace" : undefined,
        fontSize: mono ? "12px" : undefined,
        textAlign: align,
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}
