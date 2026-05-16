"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  MANAGEMENT_RADIUS,
  densityValue,
  managementColors,
  managementSurfaceTone,
  type ManagementDensity,
  type ManagementMode,
  type ManagementTone,
} from "./management-theme";

export interface ManagementBreadcrumbItem {
  label: string;
  href?: string;
}

export interface ManagementTopbarUser {
  name: string;
  detail?: string;
  avatar?: ReactNode;
}

export interface ManagementTopbarProps {
  title?: string;
  breadcrumb?: ManagementBreadcrumbItem[];
  searchPlaceholder?: string;
  searchSlot?: ReactNode;
  envLabel?: ReactNode;
  envTone?: ManagementTone;
  user?: ManagementTopbarUser;
  actions?: ReactNode;
  density?: ManagementDensity;
  mode?: ManagementMode;
  style?: CSSProperties;
}

export function ManagementTopbar({
  title,
  breadcrumb,
  searchPlaceholder = "Search orders, tenants, drivers...",
  searchSlot,
  envLabel = "production",
  envTone = "neutral",
  user,
  actions,
  density = "comfortable",
  mode = "light",
  style,
}: ManagementTopbarProps) {
  const colors = managementColors(mode);
  const envStyles = managementSurfaceTone(envTone, mode);
  const crumbs = breadcrumb?.length
    ? breadcrumb
    : title
      ? [{ label: title }]
      : [];

  return (
    <header
      style={{
        gridColumn: 2,
        gridRow: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        minWidth: 0,
        height: density === "compact" ? "56px" : "64px",
        padding: density === "compact" ? "0 20px" : "0 24px",
        borderBottom: `1px solid ${colors.pageBackgroundMuted}`,
        background: colors.surface,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minWidth: 0,
          flex: 1,
          overflow: "hidden",
        }}
      >
        {crumbs.map((item, index) => {
          const last = index === crumbs.length - 1;
          return (
            <span
              key={`${item.label}-${index}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                minWidth: 0,
              }}
            >
              {index > 0 ? (
                <span style={{ color: colors.textDim, fontSize: "12px" }}>
                  /
                </span>
              ) : null}
              <span
                style={{
                  color: last ? colors.textStrong : colors.textMuted,
                  fontSize: densityValue(density, {
                    comfortable: "13px",
                    compact: "12px",
                  }),
                  fontWeight: last ? 700 : 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.label}
              </span>
            </span>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: density === "compact" ? "8px" : "10px",
          minWidth: 0,
          flexShrink: 0,
        }}
      >
        {searchSlot ?? (
          <div
            aria-label="Search"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              minWidth: density === "compact" ? "220px" : "260px",
              padding: density === "compact" ? "8px 10px" : "9px 12px",
              borderRadius: MANAGEMENT_RADIUS.inset,
              border: `1px solid ${colors.pageBackgroundMuted}`,
              background: colors.pageBackground,
              color: colors.textDim,
              fontSize: densityValue(density, {
                comfortable: "12.5px",
                compact: "12px",
              }),
            }}
          >
            <span aria-hidden="true">⌕</span>
            <span>{searchPlaceholder}</span>
          </div>
        )}

        {envLabel ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "4px 10px",
              borderRadius: "999px",
              border: `1px solid ${envStyles.border}`,
              background: envStyles.background,
              color: envStyles.text,
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {envLabel}
          </span>
        ) : null}

        {actions}

        {user ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              minWidth: 0,
              paddingLeft: "4px",
            }}
          >
            <div
              style={{
                width: density === "compact" ? "30px" : "34px",
                height: density === "compact" ? "30px" : "34px",
                borderRadius: "999px",
                background: colors.pageBackground,
                border: `1px solid ${colors.pageBackgroundMuted}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: colors.textStrong,
                fontWeight: 700,
                fontSize: "12px",
              }}
            >
              {user.avatar ?? user.name.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: colors.textStrong,
                  fontSize: densityValue(density, {
                    comfortable: "12.5px",
                    compact: "12px",
                  }),
                  fontWeight: 700,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.name}
              </div>
              {user.detail ? (
                <div
                  style={{
                    color: colors.textMuted,
                    fontSize: "11px",
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {user.detail}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
