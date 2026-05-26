"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  buildCanvasTheme,
  type CanvasRealmTone,
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
  CANVAS_REALM_COLORS,
  CANVAS_REALM_LABELS,
  CANVAS_REFRESH_TIERS,
  CANVAS_RISK_LEVELS,
  CANVAS_SURFACE_ACCENTS,
  CANVAS_TYPE,
  type CanvasDensity,
  type CanvasEmptyReason,
  type CanvasEmptyReasonKey,
  type CanvasMode,
  type CanvasRealm,
  type CanvasRealmChip,
  type CanvasRealmPalette,
  type CanvasRealmTone,
  type CanvasRefreshTier,
  type CanvasRefreshTierKey,
  type CanvasRiskLevel,
  type CanvasRiskLevelKey,
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

const REALM_TONES: ReadonlySet<string> = new Set([
  "platform",
  "ops",
  "tenant",
  "driver",
  "system",
]);

function isRealmTone(tone: PillTone): tone is CanvasRealmTone {
  return REALM_TONES.has(tone as string);
}

function toneStyles(theme: CanvasTheme, tone: PillTone) {
  if (isRealmTone(tone)) {
    return theme.realm[tone];
  }
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

export type PillTone = CanvasTone | CanvasRealmTone;

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
  style?: CSSProperties;
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
          <div
            style={{
              padding: "8px 12px 10px",
              borderTop: `1px solid ${theme.border}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: theme.textMuted,
              fontSize: 11,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background:
                  env === "production"
                    ? theme.success
                    : env === "sandbox"
                      ? theme.warn
                      : theme.info,
              }}
            />
            <span
              style={{
                fontFamily: theme.monoFamily,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                fontSize: 10,
              }}
            >
              {env}
            </span>
            <span style={{ marginLeft: "auto", color: theme.textDim }}>
              {resolvedVersionLabel}
            </span>
          </div>
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
          <SearchBox
            theme={theme}
            width={searchWidth}
            placeholder={searchPlaceholder ?? "搜尋訂單、租戶、司機…"}
          />
          <Kbd theme={theme}>⌘K</Kbd>
          <button
            type="button"
            style={{
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
            }}
          >
            <CanvasIcon name="bell" size={15} />
          </button>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              background: theme.accentBg,
              color: theme.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              border: `1px solid ${theme.accentBorder}`,
            }}
          >
            {avatarLabel}
          </div>
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
  tabs?: ReactNode[];
  activeTab?: ReactNode;
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
        </div>
        {actions ? (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {actions}
          </div>
        ) : null}
      </div>
      {tabs ? (
        <div style={{ display: "flex", gap: 0, marginTop: 14, marginLeft: -4 }}>
          {tabs.map((tab, index) => {
            const selected = tab === activeTab;
            return (
              <div
                key={`tab-${index}`}
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
                }}
              >
                {tab}
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
  style?: CSSProperties;
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
  tone?: PillTone;
  children: ReactNode;
  dot?: boolean;
  en?: ReactNode;
  style?: CSSProperties;
}

export function Pill({
  theme: providedTheme,
  tone = "neutral",
  children,
  dot = false,
  en,
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
      {en ? (
        <span
          style={{
            fontFamily: theme.monoFamily,
            opacity: 0.65,
            fontSize: 9.5,
          }}
        >
          {en}
        </span>
      ) : null}
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

export interface BiLabelProps {
  theme?: CanvasTheme;
  zh: ReactNode;
  en?: ReactNode;
  size?: number;
  opacity?: number;
  gap?: number;
  style?: CSSProperties;
}

export function BiLabel({
  theme: providedTheme,
  zh,
  en,
  size = 12,
  opacity = 0.55,
  gap = 6,
  style,
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
        ...style,
      }}
    >
      <span style={{ color: theme.text, fontWeight: 500 }}>{zh}</span>
      {en ? (
        <span
          style={{
            opacity,
            fontFamily: theme.monoFamily,
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

export interface CodeProps {
  theme?: CanvasTheme;
  children: ReactNode;
  style?: CSSProperties;
}

export function Code({ theme: providedTheme, children, style }: CodeProps) {
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
        ...style,
      }}
    >
      {children}
    </pre>
  );
}

export interface ToggleProps {
  theme?: CanvasTheme;
  on: boolean;
  label?: ReactNode;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Toggle({
  theme: providedTheme,
  on,
  label,
  onChange,
  disabled = false,
  style,
}: ToggleProps) {
  const theme = resolveTheme(providedTheme);
  const interactive = !disabled && Boolean(onChange);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={interactive ? () => onChange?.(!on) : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: disabled ? "not-allowed" : interactive ? "pointer" : "default",
        opacity: disabled ? 0.55 : 1,
        fontFamily: theme.fontFamily,
        color: theme.text,
        ...style,
      }}
    >
      <span
        style={{
          width: 28,
          height: 16,
          borderRadius: 8,
          position: "relative",
          background: on ? theme.accent : theme.borderStrong,
          transition: "background .12s",
          display: "inline-block",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 14 : 2,
            width: 12,
            height: 12,
            borderRadius: 6,
            background: "#fff",
            transition: "left .12s",
            boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          }}
        />
      </span>
      {label !== undefined ? (
        <span style={{ fontSize: 12, color: theme.text }}>{label}</span>
      ) : null}
    </button>
  );
}

export interface CheckboxProps {
  theme?: CanvasTheme;
  on: boolean;
  label?: ReactNode;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Checkbox({
  theme: providedTheme,
  on,
  label,
  onChange,
  disabled = false,
  style,
}: CheckboxProps) {
  const theme = resolveTheme(providedTheme);
  const interactive = !disabled && Boolean(onChange);

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        cursor: disabled ? "not-allowed" : interactive ? "pointer" : "default",
        opacity: disabled ? 0.55 : 1,
        fontFamily: theme.fontFamily,
        ...style,
      }}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={
          interactive ? (event) => onChange?.(event.target.checked) : undefined
        }
        readOnly={!interactive}
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 0,
          height: 0,
        }}
      />
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          flexShrink: 0,
          background: on ? theme.accent : theme.bgRaised,
          border: `1px solid ${on ? theme.accent : theme.borderStrong}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        {on ? <CanvasIcon name="check" size={10} stroke={3} /> : null}
      </span>
      {label !== undefined ? (
        <span style={{ fontSize: 12, color: theme.text }}>{label}</span>
      ) : null}
    </label>
  );
}

export interface StepperItem {
  t: ReactNode;
  s?: ReactNode;
}

export interface StepperProps {
  theme?: CanvasTheme;
  steps: StepperItem[];
  current?: number;
  style?: CSSProperties;
}

export function Stepper({
  theme: providedTheme,
  steps,
  current = 0,
  style,
}: StepperProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <ol
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        gap: 0,
        ...style,
      }}
    >
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const fg = done ? theme.success : active ? theme.accent : theme.textDim;
        const bg = done
          ? theme.successBg
          : active
            ? theme.accentBg
            : theme.surfaceLo;
        const borderColor = active
          ? theme.accent
          : done
            ? theme.successBorder
            : theme.border;

        return (
          <li
            key={`stepper-${index}`}
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 4px",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                background: bg,
                color: fg,
                border: `1px solid ${borderColor}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {done ? <CanvasIcon name="check" size={11} /> : index + 1}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: active ? 600 : 500,
                  color: active || done ? theme.text : theme.textMuted,
                  lineHeight: 1.2,
                }}
              >
                {step.t}
              </div>
              {step.s ? (
                <div
                  style={{
                    fontSize: 10.5,
                    color: theme.textDim,
                    marginTop: 1,
                  }}
                >
                  {step.s}
                </div>
              ) : null}
            </div>
            {index < steps.length - 1 ? (
              <div
                style={{
                  position: "absolute",
                  right: -3,
                  top: 11,
                  width: 14,
                  height: 1,
                  background: theme.border,
                }}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export type TimelineTone = "accent" | "success" | "warn" | "danger";

export interface TimelineItem {
  t: ReactNode;
  at?: ReactNode;
  actor?: ReactNode;
  actorRealm?: CanvasRealmTone;
  body?: ReactNode;
  tone?: TimelineTone;
}

export interface TimelineProps {
  theme?: CanvasTheme;
  events: TimelineItem[];
  style?: CSSProperties;
}

export function Timeline({
  theme: providedTheme,
  events,
  style,
}: TimelineProps) {
  const theme = resolveTheme(providedTheme);

  const toneFg = (tone: TimelineTone) =>
    tone === "success"
      ? theme.success
      : tone === "danger"
        ? theme.danger
        : tone === "warn"
          ? theme.warn
          : theme.accent;
  const toneBg = (tone: TimelineTone) =>
    tone === "success"
      ? theme.successBg
      : tone === "danger"
        ? theme.dangerBg
        : tone === "warn"
          ? theme.warnBg
          : theme.accentBg;

  return (
    <ol
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        ...style,
      }}
    >
      {events.map((event, index) => {
        const tone = event.tone ?? "accent";

        return (
          <li
            key={`timeline-${index}`}
            style={{
              display: "flex",
              gap: 10,
              position: "relative",
              padding: "6px 0",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  marginTop: 4,
                  background: toneFg(tone),
                  boxShadow: `0 0 0 3px ${toneBg(tone)}`,
                }}
              />
              {index < events.length - 1 ? (
                <span
                  style={{
                    flex: 1,
                    width: 1,
                    background: theme.border,
                    margin: "4px 0",
                  }}
                />
              ) : null}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: theme.text,
                  }}
                >
                  {event.t}
                </span>
                {event.at ? (
                  <span
                    style={{
                      fontSize: 10.5,
                      color: theme.textDim,
                      fontFamily: theme.monoFamily,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {event.at}
                  </span>
                ) : null}
              </div>
              {event.actor || event.actorRealm ? (
                <div
                  style={{
                    fontSize: 11,
                    color: theme.textMuted,
                    marginTop: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {event.actorRealm ? (
                    <Pill theme={theme} tone={event.actorRealm}>
                      {event.actorRealm}
                    </Pill>
                  ) : null}
                  {event.actor}
                </div>
              ) : null}
              {event.body ? (
                <div
                  style={{
                    fontSize: 12,
                    color: theme.text,
                    marginTop: 4,
                    lineHeight: 1.45,
                  }}
                >
                  {event.body}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export interface DrawerProps {
  theme?: CanvasTheme;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  width?: number;
  children: ReactNode;
  onClose?: () => void;
  style?: CSSProperties;
}

export function Drawer({
  theme: providedTheme,
  title,
  subtitle,
  footer,
  width = 480,
  children,
  onClose,
  style,
}: DrawerProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <div
      role="dialog"
      aria-label={typeof title === "string" ? title : undefined}
      style={{
        position: "absolute",
        right: 0,
        top: 46,
        bottom: 0,
        width,
        background: theme.surface,
        borderLeft: `1px solid ${theme.border}`,
        boxShadow: "-12px 0 30px rgba(0,0,0,.08)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 5,
        ...style,
      }}
    >
      <header
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${theme.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {title ? (
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: theme.text,
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
        {onClose ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: "transparent",
              border: "1px solid transparent",
              color: theme.textMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <CanvasIcon name="x" size={14} />
          </button>
        ) : null}
      </header>
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>{children}</div>
      {footer ? (
        <footer
          style={{
            padding: "12px 16px",
            borderTop: `1px solid ${theme.border}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

export interface ModalProps {
  theme?: CanvasTheme;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  width?: number;
  accent?: string;
  children: ReactNode;
  onDismiss?: () => void;
  style?: CSSProperties;
}

export function Modal({
  theme: providedTheme,
  title,
  subtitle,
  footer,
  width = 480,
  accent,
  children,
  onDismiss,
  style,
}: ModalProps) {
  const theme = resolveTheme(providedTheme);

  return (
    <div
      role="presentation"
      onClick={onDismiss}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(8,12,22,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(2px)",
        zIndex: 10,
        ...style,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        onClick={(event) => event.stopPropagation()}
        style={{
          width,
          background: theme.surface,
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          maxHeight: "85%",
          borderTop: accent ? `3px solid ${accent}` : "none",
        }}
      >
        {title || subtitle ? (
          <header
            style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            {title ? (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: theme.text,
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
          </header>
        ) : null}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>{children}</div>
        {footer ? (
          <footer
            style={{
              padding: "12px 16px",
              borderTop: `1px solid ${theme.border}`,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
