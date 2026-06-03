"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasIcon,
  CanvasPill,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

export type CanvasDensityMode = "compact" | "comfortable";

export type CanvasSequenceState =
  | "complete"
  | "current"
  | "upcoming"
  | "blocked";

export type CanvasSequenceItem = {
  id: string;
  state: CanvasSequenceState;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  timestamp?: ReactNode;
  stateLabel?: ReactNode;
  tone?: CanvasTone;
  indicator?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  supportingContent?: ReactNode;
};

export type CanvasActivityItem = {
  id: string;
  title: ReactNode;
  detail?: ReactNode;
  timestamp?: ReactNode;
  tone?: CanvasTone;
  eyebrow?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  supportingContent?: ReactNode;
  marker?: ReactNode;
};

export type CanvasEmptyPanelProps = {
  title: ReactNode;
  description?: ReactNode;
  tone?: CanvasTone;
  density?: CanvasDensityMode;
  actions?: ReactNode;
  icon?: ReactNode;
  theme: CanvasTheme;
};

const STEP_ACCENT: Record<CanvasSequenceState, string> = {
  complete: "#16a34a",
  current: "#f97316",
  upcoming: "#64748b",
  blocked: "#dc2626",
};

function gap(density: CanvasDensityMode, compact: string, roomy: string) {
  return density === "compact" ? compact : roomy;
}

function toneStyles(theme: CanvasTheme, tone: CanvasTone = "neutral") {
  switch (tone) {
    case "success":
      return {
        fg: theme.success,
        bg: theme.successBg,
        bd: theme.successBorder,
      };
    case "warn":
      return { fg: theme.warn, bg: theme.warnBg, bd: theme.warnBorder };
    case "danger":
      return { fg: theme.danger, bg: theme.dangerBg, bd: theme.dangerBorder };
    case "info":
      return { fg: theme.info, bg: theme.infoBg, bd: theme.infoBorder };
    case "accent":
      return { fg: theme.accent, bg: theme.accentBg, bd: theme.accentBorder };
    case "neutral":
    default:
      return {
        fg: theme.textMuted,
        bg: theme.neutralBg,
        bd: theme.neutralBorder,
      };
  }
}

function toneForState(state: CanvasSequenceState): CanvasTone {
  switch (state) {
    case "complete":
      return "success";
    case "current":
      return "accent";
    case "blocked":
      return "danger";
    case "upcoming":
    default:
      return "neutral";
  }
}

export function CanvasEmptyPanel({
  title,
  description,
  tone = "neutral",
  density = "comfortable",
  actions,
  icon,
  theme,
}: CanvasEmptyPanelProps) {
  const styles = toneStyles(theme, tone);

  return (
    <div
      role="status"
      style={{
        padding: density === "compact" ? "16px" : "22px",
        borderRadius: 16,
        border: `1px dashed ${styles.bd}`,
        background: styles.bg,
        display: "grid",
        justifyItems: "center",
        textAlign: "center",
        gap: gap(density, "8px", "10px"),
      }}
    >
      {icon ? (
        <span aria-hidden style={{ color: styles.fg }}>
          {icon}
        </span>
      ) : null}
      <strong
        style={{ color: theme.text, fontSize: density === "compact" ? 14 : 15 }}
      >
        {title}
      </strong>
      {description ? (
        <span
          style={{
            color: theme.textDim,
            fontSize: density === "compact" ? 12.5 : 13,
            lineHeight: 1.5,
            maxWidth: 480,
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
            gap: 8,
            justifyContent: "center",
          }}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

type CanvasActivityFeedProps = {
  items: CanvasActivityItem[];
  theme: CanvasTheme;
  density?: CanvasDensityMode;
  emptyState?: ReactNode;
};

export function CanvasActivityFeed({
  items,
  theme,
  density = "comfortable",
  emptyState,
}: CanvasActivityFeedProps) {
  if (items.length === 0) {
    return emptyState ? <>{emptyState}</> : null;
  }

  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gap: gap(density, "12px", "14px"),
      }}
    >
      {items.map((item, index) => {
        const styles = toneStyles(theme, item.tone ?? "neutral");
        const markerContent = item.marker ?? (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {index + 1}
          </span>
        );

        return (
          <li
            key={item.id}
            style={{
              display: "grid",
              gridTemplateColumns: `${
                density === "compact" ? "18px" : "20px"
              } minmax(0, 1fr)`,
              gap: gap(density, "10px", "12px"),
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: density === "compact" ? 16 : 18,
                  height: density === "compact" ? 16 : 18,
                  borderRadius: 999,
                  background: styles.fg,
                  color: theme.bg,
                  boxShadow: `0 0 0 4px ${styles.bg}`,
                  marginTop: 2,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: density === "compact" ? 9 : 10,
                  fontWeight: 700,
                }}
              >
                {markerContent}
              </span>
              {index < items.length - 1 ? (
                <span
                  aria-hidden
                  style={{
                    width: 2,
                    minHeight: density === "compact" ? 34 : 42,
                    background: item.tone ? styles.fg : theme.border,
                  }}
                />
              ) : null}
            </div>
            <div
              style={{
                paddingBottom: index < items.length - 1 ? 14 : 0,
                borderBottom:
                  index < items.length - 1
                    ? `1px solid ${theme.border}`
                    : "none",
                display: "grid",
                gap: gap(density, "6px", "8px"),
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  {item.eyebrow ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: theme.textDim,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {item.eyebrow}
                    </span>
                  ) : null}
                  <strong style={{ color: theme.text, fontSize: 14 }}>
                    {item.title}
                  </strong>
                </div>
                {item.timestamp || item.actions ? (
                  <div
                    style={{
                      display: "grid",
                      justifyItems: "end",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    {item.timestamp ? (
                      <span style={{ color: theme.textDim, fontSize: 12 }}>
                        {item.timestamp}
                      </span>
                    ) : null}
                    {item.actions ? (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                          gap: 8,
                        }}
                      >
                        {item.actions}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {item.meta ? (
                <div
                  style={{
                    color: theme.textDim,
                    fontSize: 12,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {item.meta}
                </div>
              ) : null}
              {item.detail ? (
                <div
                  style={{
                    fontSize: density === "compact" ? 12.5 : 13,
                    color: theme.textDim,
                    lineHeight: 1.5,
                  }}
                >
                  {item.detail}
                </div>
              ) : null}
              {item.supportingContent ? (
                <div
                  style={{ display: "grid", gap: gap(density, "8px", "10px") }}
                >
                  {item.supportingContent}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

type CanvasSequenceRailProps = {
  items: CanvasSequenceItem[];
  theme: CanvasTheme;
  density?: CanvasDensityMode;
  orientation?: "vertical" | "horizontal";
  emptyState?: ReactNode;
};

export function CanvasSequenceRail({
  items,
  theme,
  density = "comfortable",
  orientation = "vertical",
  emptyState,
}: CanvasSequenceRailProps) {
  if (items.length === 0) {
    return emptyState ? <>{emptyState}</> : null;
  }

  const horizontal = orientation === "horizontal";

  return (
    <ol
      data-orientation={orientation}
      style={
        horizontal
          ? {
              listStyle: "none",
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "minmax(0, 1fr)",
              gap: gap(density, "8px", "12px"),
              margin: 0,
              padding: 0,
              alignItems: "start",
            }
          : {
              listStyle: "none",
              display: "grid",
              gap: gap(density, "10px", "12px"),
              margin: 0,
              padding: 0,
            }
      }
    >
      {items.map((item, index) => {
        const tone = item.tone ?? toneForState(item.state);
        const styles = toneStyles(theme, tone);
        const accent = item.tone ? styles.fg : STEP_ACCENT[item.state];
        const complete = item.state === "complete";
        const current = item.state === "current";
        const railColor = complete ? STEP_ACCENT.complete : theme.border;
        const last = index === items.length - 1;
        const indicatorSize = density === "compact" ? "24px" : "28px";

        if (horizontal) {
          return (
            <li
              key={item.id}
              aria-current={current ? "step" : undefined}
              style={{
                display: "grid",
                gridTemplateRows: "auto minmax(0, 1fr)",
                gap: gap(density, "8px", "10px"),
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `${indicatorSize} minmax(0, 1fr)`,
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: indicatorSize,
                    height: indicatorSize,
                    borderRadius: 999,
                    border: `2px solid ${accent}`,
                    background: complete || current ? accent : "transparent",
                    color: complete || current ? theme.bg : accent,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: density === "compact" ? 11 : 12,
                    fontWeight: 700,
                    boxShadow: current ? `0 0 0 4px ${styles.bg}` : undefined,
                  }}
                >
                  {item.indicator ?? index + 1}
                </span>
                {!last ? (
                  <span
                    aria-hidden
                    style={{ height: 2, width: "100%", background: railColor }}
                  />
                ) : null}
              </div>
              <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                {item.eyebrow ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: theme.textDim,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {item.eyebrow}
                  </span>
                ) : null}
                <strong
                  style={{
                    color: theme.text,
                    fontSize: density === "compact" ? 13 : 13.5,
                  }}
                >
                  {item.title}
                </strong>
                {item.description ? (
                  <span
                    style={{
                      color: theme.textDim,
                      fontSize: density === "compact" ? 12 : 12.5,
                      lineHeight: 1.5,
                    }}
                  >
                    {item.description}
                  </span>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <CanvasPill theme={theme} tone={tone}>
                    {item.stateLabel ?? item.state}
                  </CanvasPill>
                  {item.timestamp ? (
                    <span style={{ color: theme.textDim, fontSize: 12 }}>
                      {item.timestamp}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        }

        return (
          <li
            key={item.id}
            aria-current={current ? "step" : undefined}
            style={{
              display: "grid",
              gridTemplateColumns: `${indicatorSize} minmax(0, 1fr)`,
              gap: gap(density, "10px", "12px"),
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", justifyItems: "center", gap: 6 }}>
              <span
                style={{
                  width: indicatorSize,
                  height: indicatorSize,
                  borderRadius: 999,
                  border: `2px solid ${accent}`,
                  background: complete || current ? accent : "transparent",
                  color: complete || current ? theme.bg : accent,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: density === "compact" ? 11 : 12,
                  fontWeight: 700,
                  boxShadow: current ? `0 0 0 4px ${styles.bg}` : undefined,
                }}
              >
                {item.indicator ?? index + 1}
              </span>
              {!last ? (
                <span
                  aria-hidden
                  style={{
                    width: 2,
                    minHeight: density === "compact" ? 32 : 40,
                    background: railColor,
                  }}
                />
              ) : null}
            </div>
            <div
              style={{
                padding: "2px 0 12px",
                display: "grid",
                gap: gap(density, "6px", "8px"),
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  {item.eyebrow ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: theme.textDim,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {item.eyebrow}
                    </span>
                  ) : null}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <strong style={{ color: theme.text, fontSize: 14 }}>
                      {item.title}
                    </strong>
                    <CanvasPill theme={theme} tone={tone}>
                      {item.stateLabel ?? item.state}
                    </CanvasPill>
                  </div>
                </div>
                {item.timestamp ? (
                  <span
                    style={{
                      color: theme.textDim,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.timestamp}
                  </span>
                ) : null}
              </div>
              {item.meta ? (
                <div
                  style={{
                    color: theme.textDim,
                    fontSize: 12,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {item.meta}
                </div>
              ) : null}
              {item.description ? (
                <div
                  style={{
                    color: theme.textDim,
                    fontSize: density === "compact" ? 12.5 : 13,
                    lineHeight: 1.5,
                  }}
                >
                  {item.description}
                </div>
              ) : null}
              {item.supportingContent ? (
                <div
                  style={{ display: "grid", gap: gap(density, "6px", "8px") }}
                >
                  {item.supportingContent}
                </div>
              ) : null}
              {item.actions ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {item.actions}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

type CanvasEmptyActionProps = {
  theme: CanvasTheme;
  href?: string;
  label: ReactNode;
  newTab?: boolean;
};

export function CanvasEmptyLinkAction({
  theme,
  href,
  label,
  newTab = false,
}: CanvasEmptyActionProps) {
  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
      style={{ textDecoration: "none" }}
    >
      <CanvasBtn theme={theme} icon={newTab ? "ext" : "arrow"}>
        {label}
      </CanvasBtn>
    </a>
  );
}

type CanvasAlertPanelProps = {
  theme: CanvasTheme;
  tone: CanvasTone;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: Parameters<typeof CanvasIcon>[0]["name"];
  style?: CSSProperties;
};

export function CanvasAlertPanel({
  theme,
  tone,
  title,
  description,
  actions,
  icon = "health",
  style,
}: CanvasAlertPanelProps) {
  const bannerTone = tone === "neutral" ? "info" : tone;
  return (
    <div style={style}>
      <CanvasBanner
        theme={theme}
        tone={bannerTone}
        title={title}
        body={description}
        icon={<CanvasIcon name={icon} size={16} />}
        actions={actions}
      />
    </div>
  );
}
