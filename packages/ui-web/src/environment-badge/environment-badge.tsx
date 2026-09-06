"use client";

import type { CSSProperties, ReactElement } from "react";
import type { EnvironmentBadgeProps } from "./types";
import {
  getEnvironmentDisplay,
  getHealthDisplay,
  resolveRuntimeEnvironment,
  resolveRuntimeHealth,
} from "./environment-resolver";

const SHELL_MONO =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export function EnvironmentBadge({
  env,
  health,
  isFixture,
  isMock,
  locale = "zh-TW",
  mode = "light",
  density = "comfortable",
  showHealth = false,
  showVersion = false,
  versionLabel,
  className,
  style,
  children,
}: EnvironmentBadgeProps): ReactElement {
  const resolvedEnv = resolveRuntimeEnvironment({
    env,
    isFixture,
    isMock,
  });
  const envMeta = getEnvironmentDisplay(resolvedEnv, mode);
  const isZh = locale.startsWith("zh");
  const envText = isZh ? envMeta.labelZhTW : envMeta.labelEn;

  const resolvedHealth = showHealth
    ? resolveRuntimeHealth({ status: health })
    : null;
  const healthMeta = resolvedHealth
    ? getHealthDisplay(resolvedHealth, mode)
    : null;

  const isCompact = density === "compact";
  const height = isCompact ? "24px" : "28px";
  const padding = isCompact ? "0 8px" : "0 10px";
  const fontSize = isCompact ? "10px" : "11px";

  const chipStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    height,
    padding,
    borderRadius: "6px",
    background: envMeta.colors.bg,
    border: `1px solid ${envMeta.colors.border}`,
    color: envMeta.colors.fg,
    fontFamily: SHELL_MONO,
    fontSize,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    lineHeight: 1,
    boxSizing: "border-box",
    verticalAlign: "middle",
    userSelect: "none",
    ...style,
  };

  const dotStyle: CSSProperties = {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: envMeta.colors.fg,
    flexShrink: 0,
  };

  const healthDotStyle: CSSProperties = healthMeta
    ? {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: healthMeta.colors.fg,
        flexShrink: 0,
      }
    : {};

  return (
    <div
      data-testid="environment-badge"
      data-environment={resolvedEnv}
      data-tone={envMeta.tone}
      className={className}
      style={chipStyle}
    >
      <span style={dotStyle} aria-hidden="true" />
      <span>{children ?? envText}</span>

      {showHealth && healthMeta ? (
        <span
          data-testid="environment-health"
          data-health={resolvedHealth}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            borderLeft: `1px solid ${envMeta.colors.border}`,
            paddingLeft: "6px",
            color: healthMeta.colors.fg,
          }}
          title={isZh ? healthMeta.labelZhTW : healthMeta.labelEn}
        >
          <span style={healthDotStyle} aria-hidden="true" />
          <span style={{ fontSize: isCompact ? "9.5px" : "10px" }}>
            {isZh ? healthMeta.labelZhTW : healthMeta.labelEn}
          </span>
        </span>
      ) : null}

      {showVersion && versionLabel ? (
        <span
          data-testid="environment-version"
          style={{
            borderLeft: `1px solid ${envMeta.colors.border}`,
            paddingLeft: "6px",
            opacity: 0.85,
            fontSize: isCompact ? "9.5px" : "10px",
          }}
        >
          {versionLabel}
        </span>
      ) : null}
    </div>
  );
}
