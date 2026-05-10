import type { CSSProperties, ReactNode } from "react";
import {
  ManagementSidebar,
  type ManagementSidebarProps,
} from "./management-sidebar";
import {
  ManagementTopbar,
  type ManagementTopbarProps,
} from "./management-topbar";
import {
  managementMainShellStyle,
  managementPageStackStyle,
  managementColors,
  type ManagementDensity,
  type ManagementMode,
} from "./management-theme";

export interface ManagementShellProps {
  children: ReactNode;
  density?: ManagementDensity;
  mode?: ManagementMode;
  sidebar?: ManagementSidebarProps;
  topbar?: ManagementTopbarProps;
  style?: CSSProperties;
}

export function ManagementShell({
  children,
  density = "comfortable",
  mode = "light",
  sidebar,
  topbar,
  style,
}: ManagementShellProps) {
  const colors = managementColors(mode);

  if (!sidebar && !topbar) {
    return (
      <main style={{ ...managementMainShellStyle(density, mode), ...style }}>
        {children}
      </main>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: sidebar
          ? "248px minmax(0, 1fr)"
          : "minmax(0, 1fr)",
        gridTemplateRows: topbar ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)",
        background: colors.pageBackground,
        ...style,
      }}
    >
      {sidebar ? (
        <ManagementSidebar {...sidebar} density={density} mode={mode} />
      ) : null}
      {topbar ? (
        <ManagementTopbar {...topbar} density={density} mode={mode} />
      ) : null}
      <main
        style={{
          ...managementMainShellStyle(density, mode),
          gridColumn: sidebar ? 2 : 1,
          gridRow: topbar ? 2 : 1,
        }}
      >
        {children}
      </main>
    </div>
  );
}

export interface ManagementPageStackProps {
  children: ReactNode;
  density?: ManagementDensity;
  as?: "div" | "section" | "article";
  style?: CSSProperties;
}

export function ManagementPageStack({
  children,
  density = "comfortable",
  as = "div",
  style,
}: ManagementPageStackProps) {
  const Tag = as;
  return (
    <Tag style={{ ...managementPageStackStyle(density), ...style }}>
      {children}
    </Tag>
  );
}
