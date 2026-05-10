"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  MANAGEMENT_RADIUS,
  MANAGEMENT_TYPOGRAPHY,
  densityValue,
  managementColors,
  managementSurfaceTone,
  type ManagementDensity,
  type ManagementMode,
  type ManagementTone,
} from "./management-theme";

export interface ManagementSidebarItem {
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  badgeTone?: ManagementTone;
  matchPaths?: string[];
}

export interface ManagementSidebarSection {
  key: string;
  title?: string;
  items: ManagementSidebarItem[];
}

export interface ManagementSidebarProps {
  brand: string;
  brandSub?: string;
  brandIcon?: ReactNode;
  sections: ManagementSidebarSection[];
  currentPath: string;
  footer?: ReactNode;
  density?: ManagementDensity;
  mode?: ManagementMode;
  style?: CSSProperties;
}

function isItemActive(item: ManagementSidebarItem, currentPath: string) {
  const matches = [item.href, ...(item.matchPaths ?? [])];
  return matches.some(
    (match) => currentPath === match || currentPath.startsWith(`${match}/`),
  );
}

export function ManagementSidebar({
  brand,
  brandSub,
  brandIcon,
  sections,
  currentPath,
  footer,
  density = "comfortable",
  mode = "light",
  style,
}: ManagementSidebarProps) {
  const colors = managementColors(mode);

  return (
    <aside
      style={{
        width: "248px",
        minHeight: "100vh",
        background: colors.sidebar,
        color: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
        ...style,
      }}
    >
      <div
        style={{
          padding: density === "compact" ? "14px 14px 12px" : "18px 18px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: density === "compact" ? "30px" : "34px",
              height: density === "compact" ? "30px" : "34px",
              borderRadius: "10px",
              background: colors.sidebarActive,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "#ffffff",
            }}
          >
            {brandIcon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: "#f8fafc",
                fontSize: densityValue(density, MANAGEMENT_TYPOGRAPHY.body),
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              {brand}
            </div>
            {brandSub ? (
              <div
                style={{
                  color: colors.textDim,
                  fontSize: "11px",
                  lineHeight: 1.3,
                  marginTop: "3px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {brandSub}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <nav
        aria-label="Management navigation"
        style={{
          padding: density === "compact" ? "10px 8px 12px" : "14px 10px 16px",
          flex: 1,
          display: "grid",
          alignContent: "start",
          gap: density === "compact" ? "12px" : "16px",
        }}
      >
        {sections.map((section) => (
          <div key={section.key} style={{ display: "grid", gap: "4px" }}>
            {section.title ? (
              <div
                style={{
                  padding: "0 10px 4px",
                  color: colors.textDim,
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: MANAGEMENT_TYPOGRAPHY.eyebrowLetterSpacing,
                }}
              >
                {section.title}
              </div>
            ) : null}
            <div style={{ display: "grid", gap: "2px" }}>
              {section.items.map((item) => {
                const active = isItemActive(item, currentPath);
                const badgeTone = managementSurfaceTone(
                  item.badgeTone ?? "neutral",
                  mode,
                );

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: density === "compact" ? "8px 10px" : "9px 12px",
                      borderRadius: MANAGEMENT_RADIUS.inset,
                      textDecoration: "none",
                      fontSize: densityValue(
                        density,
                        MANAGEMENT_TYPOGRAPHY.body,
                      ),
                      fontWeight: active ? 700 : 500,
                      color: active ? "#f8fafc" : colors.text,
                      background: active ? colors.sidebarActive : "transparent",
                    }}
                  >
                    {item.icon ? (
                      <span
                        style={{
                          flexShrink: 0,
                          display: "flex",
                          color: active ? "#f8fafc" : colors.textMuted,
                        }}
                      >
                        {item.icon}
                      </span>
                    ) : null}
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.label}
                    </span>
                    {item.badge !== undefined ? (
                      <span
                        data-badge-tone={item.badgeTone ?? "neutral"}
                        style={{
                          flexShrink: 0,
                          padding: "2px 7px",
                          borderRadius: "999px",
                          border: `1px solid ${badgeTone.border}`,
                          background: badgeTone.background,
                          color: badgeTone.text,
                          fontSize: "10px",
                          fontWeight: 700,
                          lineHeight: 1.2,
                        }}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {footer ? (
        <div
          style={{
            padding: density === "compact" ? "10px 14px" : "12px 18px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            color: colors.textMuted,
            fontSize: "11px",
          }}
        >
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
