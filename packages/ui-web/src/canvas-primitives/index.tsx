"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  buildCanvasTheme,
  CANVAS_DARK_NAVY_PALETTE,
  CANVAS_DENSITY,
  CANVAS_EMPTY_REASONS,
  CANVAS_LIGHT_PALETTE,
  CANVAS_REFRESH_TIERS,
  CANVAS_RISK_LEVELS,
  CANVAS_SURFACE_ACCENTS,
  CANVAS_TYPE,
  type CanvasDataFreshness,
  type CanvasDensity,
  type CanvasEmptyReason,
  type CanvasHealthStatus,
  type CanvasMode,
  type CanvasRealm,
  type CanvasRefreshTier,
  type CanvasRiskLevel,
  type CanvasSurface,
  type CanvasTheme,
  type CanvasTone,
} from "../canvas-tokens";
import { CANVAS_ICONS, CanvasIcon, type CanvasIconName } from "./icons";

export { CanvasIcon, CANVAS_ICONS, type CanvasIconName } from "./icons";
export {
  buildCanvasTheme,
  CANVAS_DARK_NAVY_PALETTE,
  CANVAS_DENSITY,
  CANVAS_EMPTY_REASONS,
  CANVAS_LIGHT_PALETTE,
  CANVAS_REFRESH_TIERS,
  CANVAS_RISK_LEVELS,
  CANVAS_SURFACE_ACCENTS,
  CANVAS_TYPE,
  type CanvasDataFreshness,
  type CanvasDensity,
  type CanvasEmptyReason,
  type CanvasHealthStatus,
  type CanvasMode,
  type CanvasRealm,
  type CanvasRefreshTier,
  type CanvasRiskLevel,
  type CanvasSurface,
  type CanvasTheme,
  type CanvasTone,
} from "../canvas-tokens";

const DEFAULT_THEME = buildCanvasTheme({
  surface: "tenant",
  density: "compact",
});

function resolveTheme(theme?: CanvasTheme) {
  return theme ?? DEFAULT_THEME;
}

function isCanvasIconName(icon: unknown): icon is CanvasIconName {
  return typeof icon === "string" && icon in CANVAS_ICONS;
}

function px(value?: string | number) {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "number" ? `${value}px` : value;
}

function toneStyles(theme: CanvasTheme, tone: CanvasTone) {
  switch (tone) {
    case "admin":
    case "platform":
      return theme.realm.platform;
    case "ops":
      return theme.realm.ops;
    case "tenant":
      return theme.realm.tenant;
    case "system":
      return theme.realm.system;
    case "driver":
      return theme.realm.driver;
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

function renderIcon(
  icon: CanvasIconName | ReactNode | undefined,
  size = 15,
  stroke = 1.6,
) {
  if (!icon) {
    return null;
  }
  if (isCanvasIconName(icon)) {
    return <CanvasIcon name={icon} size={size} stroke={stroke} />;
  }
  return icon;
}

export interface ShellNavItem {
  key?: string;
  href?: string;
  label?: ReactNode;
  icon?: CanvasIconName | ReactNode;
  badge?: ReactNode;
  badgeTone?: CanvasTone;
  divider?: string;
  matchPaths?: string[];
}

export interface ShellProps {
  theme?: CanvasTheme;
  nav: ShellNavItem[];
  active?: string;
  title?: ReactNode;
  brandLabel?: ReactNode;
  brandSubLabel?: ReactNode;
  brandMark?: ReactNode;
  breadcrumb?: ReactNode[];
  topRight?: ReactNode;
  env?: string;
  versionLabel?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  hideEnv?: boolean;
  currentPath?: string;
  searchPlaceholder?: string;
  searchWidth?: number;
  avatarLabel?: ReactNode;
  tenant?: ReactNode;
  actor?: CanvasIdentityActor;
  health?: CanvasHealthSnapshot;
  refreshTier?: CanvasRefreshTier;
  dataFreshness?: CanvasDataFreshness;
  healthBanner?: ReactNode;
  style?: CSSProperties;
}

export interface CanvasIdentityActor {
  name?: ReactNode;
  display?: ReactNode;
  role?: ReactNode;
}

export interface CanvasDegradedService {
  service: ReactNode;
  impact?: ReactNode;
}

export interface CanvasHealthSnapshot {
  status?: CanvasHealthStatus;
  lastCheckedAt?: ReactNode;
  degradedServices?: readonly CanvasDegradedService[];
}

export interface CanvasResourceLink {
  label: ReactNode;
  href?: string;
  openMode?: "new_tab" | "same_tab";
  crossApp?: boolean;
}

export interface CanvasActionDescriptor {
  action?: string;
  enabled: boolean;
  disabledReasonCode?: string;
  requiresReason?: boolean;
  riskLevel?: CanvasRiskLevel;
}

export interface CanvasPageTab {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  tone?: CanvasTone;
}

function isItemActive(
  item: ShellNavItem,
  active: string | undefined,
  currentPath: string | undefined,
) {
  if (active && item.key && item.key === active) {
    return true;
  }
  if (!currentPath || !item.href) {
    return false;
  }
  const matches = [item.href, ...(item.matchPaths ?? [])];
  return matches.some(
    (match) => currentPath === match || currentPath.startsWith(`${match}/`),
  );
}

function NavItem({
  theme,
  item,
  active,
}: {
  theme: CanvasTheme;
  item: ShellNavItem;
  active: boolean;
}) {
  const badgeTone = toneStyles(theme, item.badgeTone ?? "neutral");
  const itemStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "6px 9px",
    borderRadius: 7,
    color: active ? theme.accent : theme.text,
    background: active ? theme.accentBg : "transparent",
    fontSize: 12.5,
    fontWeight: active ? 600 : 450,
    position: "relative",
    cursor: item.href ? "pointer" : "default",
    textDecoration: "none",
  };

  const content = (
    <>
      <span
        style={{ display: "flex", color: active ? theme.accent : theme.text }}
      >
        {renderIcon(item.icon, 15, active ? 1.8 : 1.5)}
      </span>
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
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 5px",
            borderRadius: 6,
            background: badgeTone.bg,
            color: badgeTone.fg,
            border: `1px solid ${badgeTone.bd}`,
          }}
        >
          {item.badge}
        </span>
      ) : null}
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href} style={itemStyle}>
        {content}
      </Link>
    );
  }

  return <div style={itemStyle}>{content}</div>;
}

function SearchBox({
  theme,
  width = 220,
  placeholder = "搜尋訂單、租戶、司機…",
}: {
  theme: CanvasTheme;
  width?: number;
  placeholder?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 10px",
        borderRadius: 7,
        background: theme.surfaceLo,
        border: `1px solid ${theme.border}`,
        width,
        color: theme.textMuted,
      }}
    >
      <CanvasIcon name="search" size={13} />
      <span style={{ fontSize: 12, color: theme.textDim }}>{placeholder}</span>
    </div>
  );
}

function Kbd({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: theme.monoFamily,
        fontSize: 10.5,
        padding: "2px 6px",
        borderRadius: 5,
        border: `1px solid ${theme.border}`,
        background: theme.surfaceLo,
        color: theme.textMuted,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function iconButtonStyle(theme: CanvasTheme): CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: 7,
    background: "transparent",
    border: "1px solid transparent",
    color: theme.textMuted,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
}

function resolveSurfaceLabel(surface: CanvasSurface) {
  switch (surface) {
    case "admin":
    case "platform":
      return "PLATFORM";
    case "ops":
      return "OPS";
    case "tenant":
      return "TENANT";
    case "driver":
      return "DRIVER";
    case "partner":
      return "PARTNER";
    default:
      return String(surface).toUpperCase();
  }
}

function resolveEnvColor(theme: CanvasTheme, env: string) {
  switch (env) {
    case "production":
      return theme.success;
    case "sandbox":
      return theme.warn;
    case "staging":
      return theme.info;
    default:
      return theme.textMuted;
  }
}

export interface RefreshTierBadgeProps {
  theme?: CanvasTheme;
  tier?: CanvasRefreshTier;
  freshness?: CanvasDataFreshness;
}

export function RefreshTierBadge({
  theme: providedTheme,
  tier = "medium_slow",
  freshness = "fresh",
}: RefreshTierBadgeProps) {
  const theme = resolveTheme(providedTheme);
  const tierMeta = CANVAS_REFRESH_TIERS[tier];
  const freshnessTone =
    freshness === "degraded"
      ? toneStyles(theme, "danger")
      : freshness === "stale"
        ? toneStyles(theme, "warn")
        : freshness === "unknown"
          ? toneStyles(theme, "neutral")
          : toneStyles(theme, "success");

  return (
    <div
      title={`${tierMeta.label} · ${tierMeta.note}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 6,
        background: freshnessTone.bg,
        border: `1px solid ${freshnessTone.bd}`,
        fontSize: 10.5,
        fontWeight: 600,
        color: freshnessTone.fg,
        fontFamily: theme.monoFamily,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          background: freshnessTone.fg,
          flexShrink: 0,
        }}
      />
      <span style={{ letterSpacing: 0.4 }}>{tierMeta.code}</span>
      <span>{tierMeta.ms === null ? "MANUAL" : `${tierMeta.ms / 1000}s`}</span>
      {freshness !== "fresh" ? (
        <span>· {freshness === "degraded" ? "降級" : freshness}</span>
      ) : null}
    </div>
  );
}

export interface IdentityChipProps {
  theme?: CanvasTheme;
  env?: string | undefined;
  tenant?: ReactNode | undefined;
  actor?: CanvasIdentityActor | undefined;
  avatarLabel?: ReactNode | undefined;
}

export function IdentityChip({
  theme: providedTheme,
  env = "production",
  tenant,
  actor,
  avatarLabel = "YL",
}: IdentityChipProps) {
  const theme = resolveTheme(providedTheme);
  const envColor = resolveEnvColor(theme, env);
  const actorMark = actor?.name ?? avatarLabel;
  const actorDisplay = actor?.display ?? "林宜君";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 1,
        background: theme.surfaceLo,
        border: `1px solid ${theme.border}`,
        borderRadius: 7,
        overflow: "hidden",
        height: 28,
      }}
    >
      <div
        style={{
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: theme.accentBg,
          color: theme.accent,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            background: theme.accent,
          }}
        />
        {resolveSurfaceLabel(theme.surfaceKey)}
      </div>
      <div
        style={{
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          color: envColor,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          fontFamily: theme.monoFamily,
        }}
      >
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            background: envColor,
          }}
        />
        {env}
      </div>
      {tenant ? (
        <div
          style={{
            padding: "0 8px",
            display: "flex",
            alignItems: "center",
            borderLeft: `1px solid ${theme.border}`,
            color: theme.textMuted,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: theme.monoFamily,
          }}
        >
          {tenant}
        </div>
      ) : null}
      <div
        style={{
          padding: "0 8px 0 6px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderLeft: `1px solid ${theme.border}`,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            background: theme.accentBg,
            color: theme.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9.5,
            fontWeight: 700,
            border: `1px solid ${theme.accentBorder}`,
          }}
        >
          {actorMark}
        </div>
        <span
          style={{
            fontSize: 11.5,
            color: theme.text,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {actorDisplay}
        </span>
      </div>
    </div>
  );
}

export interface HealthFooterProps {
  theme?: CanvasTheme;
  health?: CanvasHealthSnapshot | undefined;
  versionLabel?: ReactNode | undefined;
}

export function HealthFooter({
  theme: providedTheme,
  health,
  versionLabel,
}: HealthFooterProps) {
  const theme = resolveTheme(providedTheme);
  const status = health?.status ?? "healthy";
  const tone =
    status === "down"
      ? toneStyles(theme, "danger")
      : status === "degraded"
        ? toneStyles(theme, "warn")
        : toneStyles(theme, "success");
  const label =
    status === "down"
      ? "API down"
      : status === "degraded"
        ? "API 降級"
        : "API healthy";
  const en =
    status === "down"
      ? "down"
      : status === "degraded"
        ? "degraded"
        : "healthy";

  return (
    <div
      style={{
        padding: "8px 10px 10px",
        borderTop: `1px solid ${theme.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 8px",
          borderRadius: 6,
          background: tone.bg,
          fontSize: 11,
          fontWeight: 600,
          color: tone.fg,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: tone.fg,
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ fontFamily: theme.monoFamily, opacity: 0.7 }}>{en}</span>
      </div>
      <div
        style={{
          fontSize: 10,
          color: theme.textDim,
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          padding: "0 2px",
        }}
      >
        <span>last checked</span>
        <span style={{ fontFamily: theme.monoFamily }}>
          {health?.lastCheckedAt ?? "2s"} ago
        </span>
      </div>
      {health?.degradedServices?.length ? (
        <div style={{ fontSize: 10, color: theme.warn, padding: "0 2px" }}>
          {health.degradedServices.length} 個依賴降級
        </div>
      ) : null}
      {versionLabel ? (
        <div
          style={{
            fontSize: 10,
            color: theme.textDim,
            fontFamily: theme.monoFamily,
            padding: "0 2px",
          }}
        >
          {versionLabel}
        </div>
      ) : null}
    </div>
  );
}

export function Shell({
  theme: providedTheme,
  nav,
  active,
  title,
  brandLabel,
  brandSubLabel,
  brandMark,
  breadcrumb = [],
  topRight,
  env = "production",
  versionLabel,
  children,
  footer,
  hideEnv = false,
  currentPath,
  searchPlaceholder,
  searchWidth = 220,
  avatarLabel = "YL",
  tenant,
  actor,
  health,
  refreshTier = "medium_slow",
  dataFreshness = "fresh",
  healthBanner,
  style,
}: ShellProps) {
  const theme = resolveTheme(providedTheme);
  const resolvedBrandLabel = brandLabel ?? "DRTS";
  const resolvedBrandSubLabel =
    brandSubLabel === undefined ? theme.surfaceName : brandSubLabel;
  const resolvedBrandMark = brandMark ?? "D";
  const resolvedVersionLabel = versionLabel ?? "v2.14.3";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        gridTemplateColumns: "224px 1fr",
        gridTemplateRows: "46px 1fr",
        background: theme.bg,
        color: theme.text,
        fontFamily: theme.fontFamily,
        fontSize: theme.fz,
        overflow: "hidden",
        ...style,
      }}
    >
      <aside
        style={{
          gridRow: "1 / 3",
          background: theme.surface,
          borderRight: `1px solid ${theme.border}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: `1px solid ${theme.border}`,
            height: 46,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentHi})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: -0.4,
            }}
          >
            {resolvedBrandMark}
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
          >
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: theme.text,
                lineHeight: 1.1,
                letterSpacing: -0.2,
              }}
            >
              {resolvedBrandLabel}
            </div>
            {resolvedBrandSubLabel ? (
              <div
                style={{
                  fontSize: 10,
                  color: theme.textMuted,
                  letterSpacing: 0.3,
                  lineHeight: 1.1,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {resolvedBrandSubLabel}
              </div>
            ) : null}
          </div>
        </div>

        <nav
          aria-label="Canvas navigation"
          style={{
            flex: 1,
            padding: "8px 6px",
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {nav.map((item, index) =>
            item.divider ? (
              <div
                key={`${item.divider}-${index}`}
                style={{
                  margin: "8px 8px 4px",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  color: theme.textDim,
                  textTransform: "uppercase",
                }}
              >
                {item.divider}
              </div>
            ) : (
              <NavItem
                key={item.key ?? item.href ?? `nav-${index}`}
                theme={theme}
                item={item}
                active={isItemActive(item, active, currentPath)}
              />
            ),
          )}
        </nav>

        {!hideEnv ? (
          <HealthFooter
            theme={theme}
            health={health}
            versionLabel={resolvedVersionLabel}
          />
        ) : null}
      </aside>

      <header
        style={{
          gridColumn: 2,
          gridRow: 1,
          borderBottom: `1px solid ${theme.border}`,
          background: theme.surface,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 12,
          height: 46,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
            flex: 1,
          }}
        >
          {breadcrumb.length > 0 ? (
            breadcrumb.map((crumb, index) => (
              <span
                key={`crumb-${index}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {index > 0 ? (
                  <CanvasIcon
                    name="chevR"
                    size={12}
                    style={{ color: theme.textDim }}
                  />
                ) : null}
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: index === breadcrumb.length - 1 ? 600 : 450,
                    color:
                      index === breadcrumb.length - 1
                        ? theme.text
                        : theme.textMuted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {crumb}
                </span>
              </span>
            ))
          ) : (
            <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <RefreshTierBadge
            theme={theme}
            tier={refreshTier}
            freshness={dataFreshness}
          />
          <SearchBox
            theme={theme}
            width={searchWidth}
            placeholder={searchPlaceholder ?? "搜尋訂單、租戶、司機…"}
          />
          <Kbd theme={theme}>⌘K</Kbd>
          <button type="button" style={iconButtonStyle(theme)}>
            <CanvasIcon name="bell" size={15} />
          </button>
          <IdentityChip
            theme={theme}
            env={env}
            tenant={tenant}
            actor={actor}
            avatarLabel={avatarLabel}
          />
          {topRight}
        </div>
      </header>

      <main
        style={{
          gridColumn: 2,
          gridRow: 2,
          overflow: "auto",
          background: theme.bg,
          color: theme.text,
        }}
      >
        {healthBanner}
        {children}
        {footer}
      </main>
    </div>
  );
}

export interface PageHeaderProps {
  theme?: CanvasTheme;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tabs?: Array<ReactNode | CanvasPageTab>;
  activeTab?: ReactNode | string;
  meta?: ReactNode;
  sticky?: boolean;
  style?: CSSProperties;
}

export function PageHeader({
  theme: providedTheme,
  title,
  subtitle,
  actions,
  tabs,
  activeTab,
  meta,
  sticky = true,
  style,
}: PageHeaderProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <div
      style={{
        padding: "18px 24px 0",
        borderBottom: `1px solid ${theme.border}`,
        background: theme.bg,
        position: sticky ? "sticky" : "static",
        top: 0,
        zIndex: 2,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: theme.h1,
              fontWeight: 700,
              letterSpacing: -0.3,
              color: theme.text,
              lineHeight: 1.1,
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 12.5,
                color: theme.textMuted,
                lineHeight: 1.4,
              }}
            >
              {subtitle}
            </p>
          ) : null}
          {meta ? (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {actions}
          </div>
        ) : null}
      </div>
      {tabs ? (
        <div
          style={{
            display: "flex",
            gap: 0,
            marginTop: 14,
            marginLeft: -4,
            flexWrap: "wrap",
          }}
        >
          {tabs.map((tab, index) => {
            const structured =
              typeof tab === "object" &&
              tab !== null &&
              "id" in tab &&
              "label" in tab
                ? (tab as CanvasPageTab)
                : null;
            const selected = structured
              ? structured.id === activeTab
              : tab === activeTab;
            const badgeTone = structured?.tone
              ? toneStyles(theme, structured.tone)
              : null;
            const tabLabel = structured ? structured.label : (tab as ReactNode);

            return (
              <div
                key={structured?.id ?? `tab-${index}`}
                style={{
                  padding: "8px 12px",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: selected ? theme.text : theme.textMuted,
                  borderBottom: `2px solid ${
                    selected ? theme.accent : "transparent"
                  }`,
                  marginBottom: -1,
                  cursor: "default",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                {tabLabel}
                {structured?.badge !== undefined ? (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "0 6px",
                      borderRadius: 10,
                      lineHeight: "16px",
                      background: badgeTone?.bg ?? theme.neutralBg,
                      color: badgeTone?.fg ?? theme.textMuted,
                      border: `1px solid ${badgeTone?.bd ?? theme.neutralBorder}`,
                    }}
                  >
                    {structured.badge}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export interface BtnProps {
  theme?: CanvasTheme;
  variant?: "primary" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
  icon?: CanvasIconName | ReactNode;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string | undefined;
  style?: CSSProperties | undefined;
}

export function Btn({
  theme: providedTheme,
  variant = "secondary",
  size = "sm",
  icon,
  children,
  danger = false,
  disabled = false,
  onClick,
  title,
  style,
}: BtnProps) {
  const theme = resolveTheme(providedTheme);
  const sizing =
    size === "xs"
      ? { padding: "4px 8px", fontSize: 11.5, height: 24, icon: 12 }
      : size === "md"
        ? { padding: "8px 14px", fontSize: 13, height: 34, icon: 14 }
        : { padding: "5px 10px", fontSize: 12, height: 28, icon: 13 };
  const styles = danger
    ? { bg: theme.danger, fg: "#fff", bd: theme.danger, shadow: "none" }
    : variant === "primary"
      ? {
          bg: theme.accent,
          fg: "#fff",
          bd: theme.accent,
          shadow: "0 1px 0 rgba(0,0,0,.06)",
        }
      : variant === "ghost"
        ? {
            bg: "transparent",
            fg: theme.textMuted,
            bd: "transparent",
            shadow: "none",
          }
        : {
            bg: theme.surface,
            fg: theme.text,
            bd: theme.border,
            shadow: "none",
          };

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: sizing.padding,
        fontSize: sizing.fontSize,
        height: sizing.height,
        fontWeight: 500,
        background: styles.bg,
        color: styles.fg,
        border: `1px solid ${styles.bd}`,
        borderRadius: 7,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        boxShadow: styles.shadow,
        lineHeight: 1,
        fontFamily: theme.fontFamily,
        ...style,
      }}
    >
      {renderIcon(icon, sizing.icon)}
      {children}
    </button>
  );
}

export interface PillProps {
  theme?: CanvasTheme;
  tone?: CanvasTone;
  children: ReactNode;
  dot?: boolean;
  style?: CSSProperties;
}

export function Pill({
  theme: providedTheme,
  tone = "neutral",
  children,
  dot = false,
  style,
}: PillProps) {
  const theme = resolveTheme(providedTheme);
  const toneSet = toneStyles(theme, tone);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 7px",
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: 1.4,
        color: toneSet.fg,
        background: toneSet.bg,
        border: `1px solid ${toneSet.bd}`,
        borderRadius: 5,
        letterSpacing: 0.1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot ? (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            background: toneSet.fg,
            flexShrink: 0,
          }}
        />
      ) : null}
      {children}
    </span>
  );
}

export interface CardProps {
  theme?: CanvasTheme;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  padding?: number | string;
  style?: CSSProperties;
}

export function Card({
  theme: providedTheme,
  title,
  subtitle,
  actions,
  children,
  padding = 16,
  style,
}: CardProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <section
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        overflow: "hidden",
        ...style,
      }}
    >
      {title || actions ? (
        <header
          style={{
            padding: "12px 14px",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            {title ? (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: theme.text,
                  lineHeight: 1.2,
                }}
              >
                {title}
              </div>
            ) : null}
            {subtitle ? (
              <div
                style={{
                  fontSize: 11.5,
                  color: theme.textMuted,
                  marginTop: 2,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div style={{ display: "flex", gap: 6 }}>{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div style={{ padding: px(padding) }}>{children}</div>
    </section>
  );
}

export interface TableColumn<Row extends Record<string, unknown>> {
  h: ReactNode;
  k?: keyof Row & string;
  w?: string | number;
  mono?: boolean;
  align?: CSSProperties["textAlign"];
  r?: (row: Row, index: number) => ReactNode;
}

export interface TableProps<Row extends Record<string, unknown>> {
  theme?: CanvasTheme;
  columns: TableColumn<Row>[];
  rows: readonly Row[];
  dense?: boolean;
}

export function Table<Row extends Record<string, unknown>>({
  theme: providedTheme,
  columns,
  rows,
  dense = true,
}: TableProps<Row>) {
  const theme = resolveTheme(providedTheme);

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12.5,
          fontFamily: theme.fontFamily,
        }}
      >
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            {columns.map((column, index) => (
              <th
                key={`head-${index}`}
                style={{
                  textAlign: column.align ?? "left",
                  padding: dense ? "7px 12px" : "10px 12px",
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: theme.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  background: theme.surfaceLo,
                  whiteSpace: "nowrap",
                  width: px(column.w),
                  position: "sticky",
                  top: 0,
                }}
              >
                {column.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={`row-${rowIndex}`}
              style={{
                borderBottom: `1px solid ${theme.border}`,
                background:
                  "_selected" in row && row._selected
                    ? theme.rowSelect
                    : "transparent",
              }}
            >
              {columns.map((column, columnIndex) => (
                <td
                  key={`cell-${rowIndex}-${columnIndex}`}
                  style={{
                    padding: dense ? "7px 12px" : "10px 12px",
                    textAlign: column.align ?? "left",
                    fontSize: column.mono ? 11.5 : 12.5,
                    fontFamily: column.mono
                      ? theme.monoFamily
                      : theme.fontFamily,
                    color: theme.text,
                    verticalAlign: "middle",
                    whiteSpace: "nowrap",
                  }}
                >
                  {column.r
                    ? column.r(row, rowIndex)
                    : column.k
                      ? (row[column.k] as ReactNode)
                      : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface BannerProps {
  theme?: CanvasTheme;
  tone?: Exclude<CanvasTone, "neutral">;
  icon?: CanvasIconName | ReactNode;
  title?: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
}

export function Banner({
  theme: providedTheme,
  tone = "info",
  icon = "warn",
  title,
  body,
  actions,
}: BannerProps) {
  const theme = resolveTheme(providedTheme);
  const toneSet = toneStyles(theme, tone);

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 12px",
        background: toneSet.bg,
        border: `1px solid ${toneSet.bd}`,
        borderRadius: 8,
        color: toneSet.fg,
        fontSize: 12.5,
      }}
    >
      <span style={{ marginTop: 1, flexShrink: 0 }}>
        {renderIcon(icon, 15)}
      </span>
      <div style={{ flex: 1 }}>
        {title ? (
          <div style={{ fontWeight: 600, marginBottom: body ? 2 : 0 }}>
            {title}
          </div>
        ) : null}
        {body ? (
          <div style={{ color: theme.text, lineHeight: 1.4, fontWeight: 450 }}>
            {body}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div style={{ display: "flex", gap: 6, alignSelf: "flex-start" }}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export interface KPIProps {
  theme?: CanvasTheme;
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: "up" | "down" | "neutral";
  sub?: ReactNode;
  hint?: ReactNode;
}

export function KPI({
  theme: providedTheme,
  label,
  value,
  delta,
  deltaTone = "neutral",
  sub,
  hint,
}: KPIProps) {
  const theme = resolveTheme(providedTheme);
  const deltaColor =
    deltaTone === "up"
      ? theme.success
      : deltaTone === "down"
        ? theme.danger
        : theme.textMuted;

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: 14,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: theme.textMuted,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: theme.text,
            letterSpacing: -0.4,
            lineHeight: 1.05,
            fontFamily: theme.monoFamily,
          }}
        >
          {value}
        </span>
        {delta ? (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: deltaColor }}>
            {delta}
          </span>
        ) : null}
      </div>
      {sub ? (
        <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
          {sub}
        </div>
      ) : null}
      {hint ? (
        <div
          style={{
            fontSize: 10.5,
            color: theme.textDim,
            marginTop: 6,
            fontFamily: theme.monoFamily,
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export interface DLItem {
  k?: ReactNode;
  v?: ReactNode;
  label?: ReactNode;
  value?: ReactNode;
  mono?: boolean;
}

export interface DLProps {
  theme?: CanvasTheme;
  items: DLItem[];
  cols?: number;
  monoVal?: boolean;
}

export function DL({
  theme: providedTheme,
  items,
  cols = 2,
  monoVal = false,
}: DLProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: "10px 16px",
        fontSize: 12.5,
      }}
    >
      {items.map((item, index) => {
        const label = item.k ?? item.label;
        const value = item.v ?? item.value;

        return (
          <div key={`dl-${index}`} style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 3,
              }}
            >
              {label}
            </div>
            <div
              style={{
                color: theme.text,
                fontFamily:
                  monoVal || item.mono ? theme.monoFamily : theme.fontFamily,
                fontSize: item.mono ? 11.5 : 12.5,
                overflowWrap: "anywhere",
              }}
            >
              {value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface FieldProps {
  theme?: CanvasTheme;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  required?: boolean;
}

export function Field({
  theme: providedTheme,
  label,
  hint,
  children,
  required = false,
}: FieldProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11.5,
          fontWeight: 600,
          color: theme.text,
          marginBottom: 5,
        }}
      >
        {label}
        {required ? <span style={{ color: theme.danger }}>*</span> : null}
      </label>
      {children}
      {hint ? (
        <div
          style={{
            fontSize: 11,
            color: theme.textMuted,
            marginTop: 4,
            lineHeight: 1.35,
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export interface InputProps {
  theme?: CanvasTheme;
  value?: ReactNode;
  ph?: ReactNode;
  mono?: boolean;
  suffix?: ReactNode;
  prefix?: ReactNode;
}

export function Input({
  theme: providedTheme,
  value,
  ph,
  mono = false,
  suffix,
  prefix,
}: InputProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: theme.bgRaised,
        border: `1px solid ${theme.border}`,
        borderRadius: 7,
        padding: "7px 10px",
        fontSize: 12.5,
        color: theme.text,
        fontFamily: mono ? theme.monoFamily : theme.fontFamily,
      }}
    >
      {prefix ? (
        <span style={{ color: theme.textDim, fontSize: 11.5 }}>{prefix}</span>
      ) : null}
      <span
        style={{
          flex: 1,
          color: value ? theme.text : theme.textDim,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value ?? ph}
      </span>
      {suffix ? (
        <span style={{ color: theme.textDim, fontSize: 11 }}>{suffix}</span>
      ) : null}
    </div>
  );
}

export interface SelectProps {
  theme?: CanvasTheme;
  value?: ReactNode;
  ph?: ReactNode;
}

export function Select({ theme: providedTheme, value, ph }: SelectProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: theme.bgRaised,
        border: `1px solid ${theme.border}`,
        borderRadius: 7,
        padding: "7px 10px",
        fontSize: 12.5,
        color: theme.text,
      }}
    >
      <span style={{ flex: 1, color: value ? theme.text : theme.textDim }}>
        {value ?? ph}
      </span>
      <CanvasIcon name="chevD" size={12} style={{ color: theme.textDim }} />
    </div>
  );
}

export interface BiLabelProps {
  theme?: CanvasTheme;
  zh: ReactNode;
  en?: ReactNode;
  mono?: boolean;
  size?: number;
  opacity?: number;
  gap?: number;
}

export function BiLabel({
  theme: providedTheme,
  zh,
  en,
  mono = false,
  size = 12,
  opacity = 0.55,
  gap = 6,
}: BiLabelProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap,
        fontSize: size,
        lineHeight: 1.3,
      }}
    >
      <span style={{ color: theme.text, fontWeight: 500 }}>{zh}</span>
      {en ? (
        <span
          style={{
            opacity,
            fontFamily: mono ? theme.monoFamily : theme.monoFamily,
            fontSize: size - 1,
            color: theme.textMuted,
          }}
        >
          · {en}
        </span>
      ) : null}
    </span>
  );
}

export function Code({
  theme: providedTheme,
  children,
}: {
  theme?: CanvasTheme;
  children: ReactNode;
}) {
  const theme = resolveTheme(providedTheme);

  return (
    <pre
      style={{
        margin: 0,
        padding: "10px 12px",
        borderRadius: 8,
        background: theme.surfaceLo,
        border: `1px solid ${theme.border}`,
        color: theme.text,
        fontFamily: theme.monoFamily,
        fontSize: 11.5,
        lineHeight: 1.55,
        overflowX: "auto",
        whiteSpace: "pre",
      }}
    >
      {children}
    </pre>
  );
}

export interface CheckboxProps {
  theme?: CanvasTheme;
  checked?: boolean;
  label?: ReactNode;
}

export function Checkbox({
  theme: providedTheme,
  checked = false,
  label,
}: CheckboxProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          flexShrink: 0,
          background: checked ? theme.accent : theme.bgRaised,
          border: `1px solid ${checked ? theme.accent : theme.borderStrong}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <CanvasIcon name="check" size={10} style={{ color: "#fff" }} />
        ) : null}
      </span>
      {label ? <span style={{ fontSize: 12, color: theme.text }}>{label}</span> : null}
    </span>
  );
}

export interface ToggleProps {
  theme?: CanvasTheme;
  checked?: boolean;
  label?: ReactNode;
}

export function Toggle({
  theme: providedTheme,
  checked = false,
  label,
}: ToggleProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 28,
          height: 16,
          borderRadius: 8,
          position: "relative",
          background: checked ? theme.accent : theme.borderStrong,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 14 : 2,
            width: 12,
            height: 12,
            borderRadius: 6,
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          }}
        />
      </span>
      {label ? <span style={{ fontSize: 12, color: theme.text }}>{label}</span> : null}
    </div>
  );
}

export interface EmptyStateProps {
  theme?: CanvasTheme;
  reason?: CanvasEmptyReason;
  messageOverride?: ReactNode;
  nextAction?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  theme: providedTheme,
  reason = "no_data",
  messageOverride,
  nextAction,
  compact = false,
}: EmptyStateProps) {
  const theme = resolveTheme(providedTheme);
  const meta = CANVAS_EMPTY_REASONS[reason];
  const iconTone =
    reason === "fetch_failed"
      ? toneStyles(theme, "danger")
      : reason === "not_provisioned"
        ? toneStyles(theme, "info")
        : reason === "permission_denied" ||
            reason === "external_unavailable" ||
            reason === "driver_not_eligible"
          ? toneStyles(theme, "warn")
          : toneStyles(theme, "neutral");
  const iconName =
    reason === "fetch_failed"
      ? "danger"
      : reason === "not_provisioned"
        ? "info"
        : reason === "permission_denied" || reason === "driver_not_eligible"
          ? "lock"
          : reason === "external_unavailable"
            ? "warn"
            : reason === "filtered_empty"
              ? "filter"
              : "check";
  const spacing = compact
    ? { padding: 16, icon: 24, gap: 10, body: 12, title: 13 }
    : { padding: 36, icon: 36, gap: 14, body: 13, title: 15 };

  return (
    <div
      style={{
        padding: `${spacing.padding}px 16px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: spacing.gap,
        textAlign: "center",
        background: iconTone.bg,
        border: `1px dashed ${iconTone.bd}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          width: spacing.icon + 16,
          height: spacing.icon + 16,
          borderRadius: (spacing.icon + 16) / 2,
          background: theme.surface,
          color: iconTone.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${iconTone.bd}`,
        }}
      >
        <CanvasIcon name={iconName} size={spacing.icon} stroke={1.4} />
      </div>
      <div>
        <div
          style={{
            fontSize: spacing.title,
            fontWeight: 600,
            color: theme.text,
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            justifyContent: "center",
          }}
        >
          <span>{meta.label}</span>
          <span
            style={{
              fontFamily: theme.monoFamily,
              fontSize: spacing.title - 3,
              color: theme.textDim,
              fontWeight: 500,
            }}
          >
            · {reason}
          </span>
        </div>
        <div
          style={{
            fontSize: spacing.body,
            color: theme.textMuted,
            marginTop: 4,
            maxWidth: 380,
            lineHeight: 1.5,
          }}
        >
          {messageOverride ?? meta.hint}
        </div>
      </div>
      {nextAction ? nextAction : null}
    </div>
  );
}

export interface ModalProps {
  theme?: CanvasTheme;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  width?: number | string;
  accent?: string;
}

export function Modal({
  theme: providedTheme,
  title,
  subtitle,
  footer,
  children,
  width = 520,
  accent,
}: ModalProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <div
      style={{
        padding: 24,
        background: "rgba(10,14,22,.52)",
        borderRadius: 20,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <section
        style={{
          width: px(width),
          maxWidth: "100%",
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderTop: `3px solid ${accent ?? theme.accent}`,
          borderRadius: 14,
          boxShadow: theme.shadow,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "16px 18px 14px",
            borderBottom: `1px solid ${theme.border}`,
            display: "grid",
            gap: 4,
          }}
        >
          {title ? (
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: theme.text,
                lineHeight: 1.35,
              }}
            >
              {title}
            </div>
          ) : null}
          {subtitle ? (
            <div
              style={{
                fontSize: 10.5,
                color: theme.textDim,
                fontFamily: theme.monoFamily,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </header>
        <div style={{ padding: 18 }}>{children}</div>
        {footer ? (
          <footer
            style={{
              padding: "0 18px 18px",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
}

export interface ActionButtonProps {
  theme?: CanvasTheme;
  descriptor?: CanvasActionDescriptor | null;
  label: ReactNode;
  en?: ReactNode;
  icon?: CanvasIconName | ReactNode;
  size?: "xs" | "sm" | "md";
  style?: CSSProperties;
  children?: ReactNode;
}

export function ActionButton({
  theme: providedTheme,
  descriptor,
  label,
  en,
  icon,
  size = "sm",
  style,
  children,
}: ActionButtonProps) {
  const theme = resolveTheme(providedTheme);

  if (!descriptor) {
    return null;
  }

  const riskLevel = descriptor.riskLevel ?? "low";
  const variant =
    riskLevel === "high"
      ? "primary"
      : riskLevel === "medium"
        ? "primary"
        : "secondary";
  const title = !descriptor.enabled
    ? `${descriptor.disabledReasonCode ?? "disabled"}${
        descriptor.requiresReason ? " · 需原因" : ""
      }`
    : descriptor.requiresReason
      ? "需填寫原因"
      : undefined;

  return (
    <Btn
      theme={theme}
      variant={variant}
      size={size}
      icon={icon}
      disabled={!descriptor.enabled}
      danger={riskLevel === "high"}
      title={title}
      style={style}
    >
      {children ?? (
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
          <span>{label}</span>
          {en ? (
            <span
              style={{
                fontSize: 10,
                opacity: 0.7,
                fontFamily: theme.monoFamily,
              }}
            >
              · {en}
            </span>
          ) : null}
          {descriptor.requiresReason && descriptor.enabled ? (
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                background: "currentColor",
                opacity: 0.6,
                marginLeft: 2,
              }}
            />
          ) : null}
        </span>
      )}
    </Btn>
  );
}

export interface ConfirmModalProps {
  theme?: CanvasTheme;
  risk?: CanvasRiskLevel;
  title: ReactNode;
  body: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  reason?: ReactNode;
  reasonField?: ReactNode;
}

export function ConfirmModal({
  theme: providedTheme,
  risk = "medium",
  title,
  body,
  confirmLabel = "確認",
  cancelLabel = "取消",
  reason,
  reasonField,
}: ConfirmModalProps) {
  const theme = resolveTheme(providedTheme);
  const riskMeta = CANVAS_RISK_LEVELS[risk];
  const riskTone = toneStyles(theme, riskMeta.tone);

  return (
    <Modal
      theme={theme}
      accent={riskTone.fg}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              background: riskTone.bg,
              color: riskTone.fg,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CanvasIcon
              name={riskMeta.icon as CanvasIconName}
              size={13}
            />
          </span>
          {title}
        </span>
      }
      subtitle={`${riskMeta.label.toUpperCase()} · ${risk} · ${riskMeta.pattern}`}
      footer={
        <>
          <Btn theme={theme} variant="secondary">
            {cancelLabel}
          </Btn>
          <Btn
            theme={theme}
            variant="primary"
            danger={risk === "high"}
            disabled={risk === "high" && !reason}
          >
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <div
        style={{
          fontSize: 13,
          color: theme.text,
          lineHeight: 1.55,
          marginBottom: 14,
        }}
      >
        {body}
      </div>
      {risk === "high" ? (
        <Field
          theme={theme}
          label="原因 · reason"
          required
          hint="此操作為高風險，原因將寫入稽核紀錄並可被後續調閱。"
        >
          <div
            style={{
              width: "100%",
              minHeight: 70,
              padding: 10,
              borderRadius: 7,
              border: `1px solid ${reason ? theme.border : theme.danger}`,
              background: theme.bgRaised,
              color: theme.text,
              fontFamily: theme.fontFamily,
              fontSize: 13,
              boxSizing: "border-box",
            }}
          >
            {reason ?? reasonField ?? "請說明操作原因…"}
          </div>
        </Field>
      ) : null}
      {risk === "medium" ? (
        <div
          style={{
            fontSize: 11.5,
            color: theme.textMuted,
            padding: "8px 10px",
            background: theme.surfaceLo,
            borderRadius: 6,
          }}
        >
          <CanvasIcon
            name="info"
            size={12}
            style={{ verticalAlign: -2, marginRight: 4 }}
          />
          此操作將記錄至稽核紀錄。
        </div>
      ) : null}
    </Modal>
  );
}

export interface ActionReceiptProps {
  theme?: CanvasTheme;
  status?: "completed" | "accepted" | "failed";
  title: ReactNode;
  message?: ReactNode;
  auditId?: ReactNode;
  auditLink?: CanvasResourceLink;
  resourceLink?: CanvasResourceLink;
  dismissible?: boolean;
}

export function ActionReceipt({
  theme: providedTheme,
  status = "completed",
  title,
  message,
  auditId,
  auditLink,
  resourceLink,
  dismissible = true,
}: ActionReceiptProps) {
  const theme = resolveTheme(providedTheme);
  const tone =
    status === "failed"
      ? toneStyles(theme, "danger")
      : status === "accepted"
        ? toneStyles(theme, "info")
        : toneStyles(theme, "success");
  const label =
    status === "failed" ? "失敗" : status === "accepted" ? "已受理" : "已完成";
  const icon = status === "failed" ? "danger" : status === "accepted" ? "clock" : "check";

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderLeft: `4px solid ${tone.fg}`,
        borderRadius: 8,
        boxShadow: theme.shadow,
        width: 380,
        fontSize: 12.5,
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          flexShrink: 0,
          background: tone.bg,
          color: tone.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CanvasIcon name={icon} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontWeight: 600, color: theme.text }}>{title}</span>
          <Pill
            theme={theme}
            tone={
              status === "failed"
                ? "danger"
                : status === "accepted"
                  ? "info"
                  : "success"
            }
          >
            {label}
          </Pill>
        </div>
        {message ? (
          <div style={{ marginTop: 4, color: theme.textMuted, lineHeight: 1.45 }}>
            {message}
          </div>
        ) : null}
        {auditId ? (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
            }}
          >
            <span style={{ color: theme.textDim }}>audit</span>
            <span style={{ fontFamily: theme.monoFamily, color: theme.text }}>
              {auditId}
            </span>
            {auditLink ? (
              <span
                style={{
                  color: theme.accent,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                {auditLink.label}
                {auditLink.crossApp || auditLink.openMode === "new_tab" ? (
                  <CanvasIcon name="ext" size={10} />
                ) : null}
              </span>
            ) : null}
          </div>
        ) : null}
        {resourceLink ? (
          <div style={{ marginTop: 6, fontSize: 11 }}>
            <span
              style={{
                color: theme.accent,
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              {resourceLink.label}
              {resourceLink.openMode === "new_tab" ? (
                <CanvasIcon name="ext" size={10} />
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
      {dismissible ? (
        <CanvasIcon
          name="x"
          size={13}
          style={{ color: theme.textDim, marginTop: 2 }}
        />
      ) : null}
    </div>
  );
}

export interface StaleBannerProps {
  theme?: CanvasTheme;
  dataFreshness?: Exclude<CanvasDataFreshness, "fresh">;
  generatedAt?: ReactNode;
  tier?: CanvasRefreshTier;
}

export function StaleBanner({
  theme: providedTheme,
  dataFreshness = "stale",
  generatedAt = "2 min 前",
  tier = "medium_slow",
}: StaleBannerProps) {
  const theme = resolveTheme(providedTheme);
  const tierMeta = CANVAS_REFRESH_TIERS[tier];

  return (
    <Banner
      theme={theme}
      tone={dataFreshness === "degraded" ? "danger" : "warn"}
      icon="clock"
      title={
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span>{dataFreshness === "degraded" ? "資料來源降級" : "資料已過時"}</span>
          <span
            style={{
              fontFamily: theme.monoFamily,
              fontSize: 10.5,
              opacity: 0.6,
            }}
          >
            · dataFreshness={dataFreshness}
          </span>
        </span>
      }
      body={`目前顯示的內容於 ${generatedAt} 從後端產生 (refresh tier ${tierMeta.code} · ${tierMeta.label})；請手動 refresh 或等候下次自動 poll。`}
      actions={
        <Btn theme={theme} size="xs" icon="refresh" variant="secondary">
          立即重整
        </Btn>
      }
    />
  );
}

export interface HealthBannerProps {
  theme?: CanvasTheme;
  status?: Exclude<CanvasHealthStatus, "healthy">;
  degradedServices?: readonly CanvasDegradedService[];
}

export function HealthBanner({
  theme: providedTheme,
  status = "degraded",
  degradedServices = [],
}: HealthBannerProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <div style={{ padding: "12px 24px 0" }}>
      <Banner
        theme={theme}
        tone={status === "down" ? "danger" : "warn"}
        icon="warn"
        title={
          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span>{status === "down" ? "頁面依賴 service 不可用" : "頁面依賴 service 降級中"}</span>
            <span
              style={{
                fontFamily: theme.monoFamily,
                fontSize: 10.5,
                opacity: 0.7,
              }}
            >
              · UiHealthEnvelope.status={status}
            </span>
          </span>
        }
        body={
          degradedServices.length > 0
            ? degradedServices
                .map((service) =>
                  service.impact
                    ? `${service.service} (${service.impact})`
                    : String(service.service),
                )
                .join(" · ")
            : "部分顯示資料可能不完整；下方仍可瀏覽，但 mutation 可能失敗。"
        }
      />
    </div>
  );
}

export interface ActorRealmChipProps {
  theme?: CanvasTheme;
  realm?: CanvasRealm;
  actor?: ReactNode;
}

export function ActorRealmChip({
  theme: providedTheme,
  realm = "tenant",
  actor,
}: ActorRealmChipProps) {
  const theme = resolveTheme(providedTheme);
  const labels: Record<CanvasRealm, string> = {
    platform: "平台",
    ops: "營運",
    tenant: "租戶",
    system: "系統",
    driver: "司機",
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Pill theme={theme} tone={realm}>
        {labels[realm]}
        <span
          style={{
            marginLeft: 4,
            opacity: 0.7,
            fontFamily: theme.monoFamily,
            fontSize: 9.5,
          }}
        >
          {realm}
        </span>
      </Pill>
      {actor ? <span style={{ fontSize: 12, color: theme.text }}>{actor}</span> : null}
    </span>
  );
}

export function TrafficLights({ style }: { style?: CSSProperties }) {
  const dot = (background: string) => (
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        background,
        border: "0.5px solid rgba(0,0,0,0.1)",
      }}
    />
  );

  return (
    <div style={{ display: "flex", gap: 9, alignItems: "center", ...style }}>
      {dot("#ff736a")}
      {dot("#febc2e")}
      {dot("#19c332")}
    </div>
  );
}

export interface WindowChromeProps {
  children: ReactNode;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
  contentStyle?: CSSProperties;
  outerPadding?: number;
}

export function WindowChrome({
  children,
  width = 1440,
  height = 900,
  style,
  contentStyle,
  outerPadding = 24,
}: WindowChromeProps) {
  return (
    <div
      style={{
        width: px(width),
        height: px(height),
        padding: outerPadding,
        background: "#f0eee9",
        borderRadius: 30,
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          borderRadius: 26,
          overflow: "hidden",
          background: "#ffffff",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.23), 0 16px 48px rgba(0,0,0,0.35)",
        }}
      >
        <TrafficLights
          style={{ position: "absolute", top: 18, left: 18, zIndex: 6 }}
        />
        <div style={{ width: "100%", height: "100%", ...contentStyle }}>
          {children}
        </div>
      </div>
    </div>
  );
}
