import type { CSSProperties, ReactNode } from "react";
import {
  managementMainShellStyle,
  managementPageStackStyle,
  type ManagementDensity,
} from "./management-theme";

export interface ManagementShellProps {
  children: ReactNode;
  density?: ManagementDensity;
  style?: CSSProperties;
}

export function ManagementShell({
  children,
  density = "comfortable",
  style,
}: ManagementShellProps) {
  return (
    <main style={{ ...managementMainShellStyle(density), ...style }}>
      {children}
    </main>
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
