import type { CSSProperties, ReactNode } from "react";
import {
  MANAGEMENT_SURFACE_TONES,
  managementSurfaceStyle,
  type ManagementDensity,
  type ManagementTone,
} from "./management-theme";

const TONE_STYLES = MANAGEMENT_SURFACE_TONES;

function stackGap(density: ManagementDensity, compact: string, roomy: string) {
  return density === "compact" ? compact : roomy;
}

export interface ArtifactChipListProps {
  artifactIds: readonly string[];
  emptyState?: ReactNode;
  tone?: ManagementTone;
  ariaLabel?: string;
}

export function ArtifactChipList({
  artifactIds,
  emptyState,
  tone = "info",
  ariaLabel,
}: ArtifactChipListProps) {
  if (artifactIds.length === 0) {
    if (!emptyState) {
      return null;
    }
    return (
      <div
        style={{
          color: "#64748b",
          fontSize: "12.5px",
          lineHeight: 1.5,
        }}
      >
        {emptyState}
      </div>
    );
  }

  const toneStyles = TONE_STYLES[tone];

  return (
    <ul
      aria-label={ariaLabel}
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
      }}
    >
      {artifactIds.map((artifactId) => (
        <li key={artifactId} style={{ display: "inline-flex" }}>
          <code
            style={{
              padding: "3px 10px",
              borderRadius: "999px",
              border: `1px solid ${toneStyles.border}`,
              background: toneStyles.background,
              color: toneStyles.subtle,
              fontSize: "11.5px",
              fontFamily:
                'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, monospace',
              lineHeight: 1.4,
            }}
          >
            {artifactId}
          </code>
        </li>
      ))}
    </ul>
  );
}

export interface WorkflowDetailDrawerProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  tone?: ManagementTone;
  density?: ManagementDensity;
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  ariaLabel?: string;
  style?: CSSProperties;
}

export function WorkflowDetailDrawer({
  eyebrow,
  title,
  description,
  meta,
  tone = "neutral",
  density = "comfortable",
  headerActions,
  footer,
  children,
  ariaLabel,
  style,
}: WorkflowDetailDrawerProps) {
  const toneStyles = TONE_STYLES[tone];
  const padding = density === "compact" ? "16px 18px" : "20px 22px";

  return (
    <aside
      role="complementary"
      aria-label={ariaLabel}
      style={{
        ...managementSurfaceStyle(tone),
        display: "grid",
        gridTemplateRows: footer
          ? "auto minmax(0, 1fr) auto"
          : "auto minmax(0, 1fr)",
        minHeight: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      <header
        style={{
          padding,
          borderBottom: `1px solid ${toneStyles.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          background: toneStyles.background,
        }}
      >
        <div
          style={{
            display: "grid",
            gap: stackGap(density, "4px", "6px"),
            minWidth: 0,
          }}
        >
          {eyebrow ? (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: toneStyles.subtle,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              {eyebrow}
            </span>
          ) : null}
          <strong
            style={{
              color: "#0f172a",
              fontSize: density === "compact" ? "15px" : "16px",
            }}
          >
            {title}
          </strong>
          {description ? (
            <div
              style={{
                color: "#64748b",
                fontSize: density === "compact" ? "12.5px" : "13px",
                lineHeight: 1.5,
              }}
            >
              {description}
            </div>
          ) : null}
          {meta ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "2px",
              }}
            >
              {meta}
            </div>
          ) : null}
        </div>
        {headerActions ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: "8px",
              flexShrink: 0,
            }}
          >
            {headerActions}
          </div>
        ) : null}
      </header>
      <div
        style={{
          padding,
          overflowY: "auto",
          display: "grid",
          gap: stackGap(density, "12px", "14px"),
          minHeight: 0,
        }}
      >
        {children}
      </div>
      {footer ? (
        <footer
          style={{
            padding: density === "compact" ? "12px 18px" : "14px 22px",
            borderTop: `1px solid ${toneStyles.border}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            background: "#ffffff",
            position: "sticky",
            bottom: 0,
          }}
        >
          {footer}
        </footer>
      ) : null}
    </aside>
  );
}

export interface WorkflowSplitLayoutProps {
  main: ReactNode;
  side: ReactNode;
  density?: ManagementDensity;
  sideMinWidth?: string;
  sideMaxWidth?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}

export function WorkflowSplitLayout({
  main,
  side,
  density = "comfortable",
  sideMinWidth = "320px",
  sideMaxWidth = "1fr",
  ariaLabel,
  style,
}: WorkflowSplitLayoutProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: "grid",
        gridTemplateColumns: `minmax(0, 2fr) minmax(${sideMinWidth}, ${sideMaxWidth})`,
        gap: stackGap(density, "14px", "16px"),
        alignItems: "start",
        ...style,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: stackGap(density, "12px", "14px"),
          minWidth: 0,
        }}
      >
        {main}
      </div>
      <div
        style={{
          display: "grid",
          gap: stackGap(density, "12px", "14px"),
          minWidth: 0,
        }}
      >
        {side}
      </div>
    </div>
  );
}

export interface WorkflowEmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  tone?: ManagementTone;
  density?: ManagementDensity;
  actions?: ReactNode;
  icon?: ReactNode;
}

export function WorkflowEmptyState({
  title,
  description,
  tone = "neutral",
  density = "comfortable",
  actions,
  icon,
}: WorkflowEmptyStateProps) {
  const toneStyles = TONE_STYLES[tone];

  return (
    <div
      role="status"
      style={{
        padding: density === "compact" ? "16px" : "22px",
        borderRadius: "16px",
        border: `1px dashed ${toneStyles.border}`,
        background: toneStyles.background,
        display: "grid",
        justifyItems: "center",
        textAlign: "center",
        gap: stackGap(density, "8px", "10px"),
      }}
    >
      {icon ? (
        <span aria-hidden style={{ color: toneStyles.text }}>
          {icon}
        </span>
      ) : null}
      <strong
        style={{
          color: "#0f172a",
          fontSize: density === "compact" ? "13.5px" : "14px",
        }}
      >
        {title}
      </strong>
      {description ? (
        <span
          style={{
            color: toneStyles.subtle,
            fontSize: density === "compact" ? "12.5px" : "13px",
            lineHeight: 1.5,
            maxWidth: "480px",
          }}
        >
          {description}
        </span>
      ) : null}
      {actions ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            justifyContent: "center",
          }}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
