"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export interface SidebarNavItem {
  href: string;
  label: string;
  icon?: ReactNode;
}

export interface AppSidebarProps {
  brand: string;
  brandSub?: string;
  brandIcon?: ReactNode;
  navItems: SidebarNavItem[];
  currentPath: string;
  footer?: ReactNode;
}

export function AppSidebar({
  brand,
  brandSub,
  brandIcon,
  navItems,
  currentPath,
  footer,
}: AppSidebarProps) {
  return (
    <aside
      style={{
        width: "240px",
        minHeight: "100vh",
        background: "#0f172a",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          padding: "20px 20px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "#1d4ed8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {brandIcon}
          </div>
          <div>
            <div
              style={{ color: "#f1f5f9", fontSize: "14px", fontWeight: 600 }}
            >
              {brand}
            </div>
            {brandSub && (
              <div style={{ color: "#64748b", fontSize: "11px" }}>
                {brandSub}
              </div>
            )}
          </div>
        </div>
      </div>

      <nav style={{ padding: "12px 8px", flex: 1 }}>
        {navItems.map(({ href, label, icon }) => {
          const active =
            currentPath === href || currentPath.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 12px",
                borderRadius: "8px",
                marginBottom: "2px",
                textDecoration: "none",
                fontSize: "13.5px",
                fontWeight: active ? 600 : 400,
                color: active ? "#f1f5f9" : "#94a3b8",
                background: active ? "#1d4ed8" : "transparent",
              }}
            >
              {icon && (
                <span style={{ flexShrink: 0, display: "flex" }}>{icon}</span>
              )}
              {label}
            </Link>
          );
        })}
      </nav>

      {footer && (
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            color: "#475569",
            fontSize: "11px",
          }}
        >
          {footer}
        </div>
      )}
    </aside>
  );
}
