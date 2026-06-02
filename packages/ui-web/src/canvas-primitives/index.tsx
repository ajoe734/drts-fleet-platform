"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  EmptyReason,
  ResourceActionDescriptor,
  UiHealthDegradedService,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "../../../contracts/src/ui-runtime";
import {
  buildCanvasTheme,
  type CanvasTheme,
  type CanvasTone,
} from "../canvas-tokens";
import { CANVAS_ICONS, CanvasIcon, type CanvasIconName } from "./icons";

export { CanvasIcon, CANVAS_ICONS, type CanvasIconName } from "./icons";
export {
  buildCanvasTheme,
  CANVAS_DARK_NAVY_PALETTE,
  CANVAS_DENSITY,
  CANVAS_LIGHT_PALETTE,
  CANVAS_SURFACE_ACCENTS,
  CANVAS_TYPE,
  type CanvasDensity,
  type CanvasMode,
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
  mono?: boolean;
  size?: number;
  opacity?: number;
  gap?: number;
  style?: CSSProperties;
}

export function BiLabel({
  theme: providedTheme,
  zh,
  en,
  mono = false,
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
            color: theme.textMuted,
            fontFamily: mono ? theme.monoFamily : theme.fontFamily,
            fontSize: Math.max(size - 1, 9),
          }}
        >
          · {en}
        </span>
      ) : null}
    </span>
  );
}

const EMPTY_REASON_COPY: Record<
  EmptyReason,
  { label: string; hint: string; icon: CanvasIconName; tone: CanvasTone }
> = {
  no_data: {
    label: "目前沒有資料",
    hint: "尚未產生任何記錄，或目前條件下沒有可顯示的內容。",
    icon: "check",
    tone: "neutral",
  },
  not_provisioned: {
    label: "尚未完成設定",
    hint: "需要先完成 provisioning 或啟用整合，才能在此顯示資料。",
    icon: "health",
    tone: "info",
  },
  fetch_failed: {
    label: "資料讀取失敗",
    hint: "後端回應失敗或逾時，請稍後重試或檢查相依服務。",
    icon: "warn",
    tone: "danger",
  },
  permission_denied: {
    label: "目前無法存取",
    hint: "你的權限不足以讀取這組資料，請向管理員確認存取範圍。",
    icon: "warn",
    tone: "warn",
  },
  external_unavailable: {
    label: "外部相依服務暫時不可用",
    hint: "外部系統目前降級或無法連線，資料可能延遲或暫停同步。",
    icon: "warn",
    tone: "warn",
  },
  driver_not_eligible: {
    label: "目前不符合接單條件",
    hint: "狀態或綁定條件未滿足，因此暫時不會有可接收的工作。",
    icon: "warn",
    tone: "warn",
  },
  filtered_empty: {
    label: "篩選後沒有結果",
    hint: "目前篩選條件下沒有符合的資料，請調整搜尋或篩選條件。",
    icon: "filter",
    tone: "neutral",
  },
};

function emptyReasonToneStyles(theme: CanvasTheme, reason: EmptyReason) {
  const copy = EMPTY_REASON_COPY[reason];
  return toneStyles(theme, copy?.tone ?? "neutral");
}

export interface CanvasActionButtonProps {
  theme?: CanvasTheme;
  descriptor?: ResourceActionDescriptor | null;
  label?: ReactNode;
  en?: ReactNode;
  icon?: CanvasIconName | ReactNode;
  size?: "xs" | "sm" | "md";
  children?: ReactNode;
  style?: CSSProperties;
}

export function ActionButton({
  theme: providedTheme,
  descriptor,
  label,
  en,
  icon,
  size = "sm",
  children,
  style,
}: CanvasActionButtonProps) {
  const theme = resolveTheme(providedTheme);

  if (!descriptor) {
    return null;
  }

  const tooltip = !descriptor.enabled
    ? [
        descriptor.disabledReasonCode,
        descriptor.requiresReason ? "需填寫原因" : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
    : descriptor.requiresReason
      ? "需填寫原因"
      : undefined;

  return (
    <Btn
      theme={theme}
      size={size}
      variant={descriptor.riskLevel === "medium" ? "primary" : "secondary"}
      danger={descriptor.riskLevel === "high"}
      disabled={!descriptor.enabled}
      {...(style !== undefined ? { style } : {})}
    >
      <>
        {renderIcon(icon, size === "xs" ? 12 : size === "md" ? 14 : 13)}
        {children ?? (
          <span
            title={tooltip}
            style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}
          >
            <span>{label ?? descriptor.action}</span>
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
                title="需原因"
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
      </>
    </Btn>
  );
}

export interface EmptyStateProps {
  theme?: CanvasTheme;
  reason?: EmptyReason;
  messageOverride?: ReactNode;
  nextAction?: ReactNode;
  compact?: boolean;
  style?: CSSProperties;
}

export type CanvasEmptyReason = EmptyReason;

export function EmptyState({
  theme: providedTheme,
  reason = "no_data",
  messageOverride,
  nextAction,
  compact = false,
  style,
}: EmptyStateProps) {
  const theme = resolveTheme(providedTheme);
  const copy = EMPTY_REASON_COPY[reason] ?? EMPTY_REASON_COPY.no_data!;
  const tones = emptyReasonToneStyles(theme, reason);
  const sizing = compact
    ? { padY: 16, icon: 24, gap: 10, body: 12, title: 13 }
    : { padY: 36, icon: 36, gap: 14, body: 13, title: 15 };

  return (
    <div
      style={{
        padding: `${sizing.padY}px 16px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: sizing.gap,
        textAlign: "center",
        background: tones.bg,
        border: `1px dashed ${tones.bd}`,
        borderRadius: 10,
        ...style,
      }}
    >
      <div
        style={{
          width: sizing.icon + 16,
          height: sizing.icon + 16,
          borderRadius: "50%",
          background: theme.surface,
          color: tones.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${tones.bd}`,
        }}
      >
        <CanvasIcon name={copy.icon} size={sizing.icon} stroke={1.4} />
      </div>
      <div>
        <div
          style={{
            fontSize: sizing.title,
            fontWeight: 600,
            color: theme.text,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span>{copy.label}</span>
          <span
            style={{
              fontFamily: theme.monoFamily,
              fontSize: Math.max(sizing.title - 3, 10),
              color: theme.textDim,
              fontWeight: 500,
            }}
          >
            · {reason}
          </span>
        </div>
        <div
          style={{
            fontSize: sizing.body,
            color: theme.textMuted,
            marginTop: 4,
            maxWidth: 420,
            lineHeight: 1.5,
          }}
        >
          {messageOverride ?? copy.hint}
        </div>
      </div>
      {nextAction ? <div>{nextAction}</div> : null}
    </div>
  );
}

export interface StaleBannerProps {
  theme?: CanvasTheme;
  refreshMetadata?: UiRefreshMetadata;
  dataFreshness?: UiRefreshMetadata["dataFreshness"];
  generatedAt?: ReactNode;
  tier?:
    | "urgent"
    | "fast"
    | "dispatch"
    | "medium"
    | "medium_slow"
    | "slow"
    | "manual";
  actions?: ReactNode;
}

export function StaleBanner({
  theme: providedTheme,
  refreshMetadata,
  dataFreshness,
  generatedAt,
  tier = "medium_slow",
  actions,
}: StaleBannerProps) {
  const theme = resolveTheme(providedTheme);
  const freshness = dataFreshness ?? refreshMetadata?.dataFreshness ?? "stale";
  const generated =
    generatedAt ?? refreshMetadata?.generatedAt ?? "unknown generatedAt";
  const label =
    freshness === "degraded"
      ? "資料來源降級"
      : freshness === "unknown"
        ? "資料新鮮度未知"
        : "資料已過時";

  if (freshness === "fresh") {
    return null;
  }

  return (
    <Banner
      theme={theme}
      tone={freshness === "degraded" ? "danger" : "warn"}
      icon="clock"
      title={
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span>{label}</span>
          <span
            style={{
              fontFamily: theme.monoFamily,
              fontSize: 10.5,
              opacity: 0.7,
            }}
          >
            · dataFreshness={freshness}
          </span>
        </span>
      }
      body={
        <>
          目前顯示內容於 {generated} 產生；refresh tier {tier}
          {refreshMetadata?.source ? ` · source=${refreshMetadata.source}` : ""}
          。請手動 refresh 或等候下次自動 poll。
        </>
      }
      actions={actions}
    />
  );
}

export interface HealthBannerProps {
  theme?: CanvasTheme;
  health?: UiHealthEnvelope;
  status?: UiHealthEnvelope["status"];
  degradedServices?: UiHealthDegradedService[];
  lastCheckedAt?: ReactNode;
}

export function HealthBanner({
  theme: providedTheme,
  health,
  status,
  degradedServices,
  lastCheckedAt,
}: HealthBannerProps) {
  const theme = resolveTheme(providedTheme);
  const resolvedStatus = status ?? health?.status ?? "healthy";
  const services = degradedServices ?? health?.degradedServices ?? [];
  const checkedAt = lastCheckedAt ?? health?.lastCheckedAt;

  if (resolvedStatus === "healthy") {
    return null;
  }

  return (
    <Banner
      theme={theme}
      tone={resolvedStatus === "down" ? "danger" : "warn"}
      icon="warn"
      title={
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span>
            {resolvedStatus === "down"
              ? "頁面依賴 service 不可用"
              : "頁面依賴 service 降級中"}
          </span>
          <span
            style={{
              fontFamily: theme.monoFamily,
              fontSize: 10.5,
              opacity: 0.7,
            }}
          >
            · UiHealthEnvelope.status={resolvedStatus}
          </span>
        </span>
      }
      body={
        <>
          {services.length > 0
            ? services
                .map(
                  (service: UiHealthDegradedService) =>
                    `${service.service} (${service.impact})`,
                )
                .join(" · ")
            : "部分顯示資料可能不完整；下方仍可瀏覽，但 mutation 可能失敗。"}
          {checkedAt ? ` · lastCheckedAt=${checkedAt}` : ""}
        </>
      }
    />
  );
}

export type CanvasStepState = "complete" | "current" | "upcoming" | "blocked";
export type CanvasStepperOrientation = "vertical" | "horizontal";

export interface CanvasStepperItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  state: CanvasStepState;
  stateLabel?: ReactNode;
  eyebrow?: string;
  timestamp?: ReactNode;
  supportingContent?: ReactNode;
  actions?: ReactNode;
  indicator?: ReactNode;
}

export interface CanvasStepperProps {
  theme?: CanvasTheme;
  items: CanvasStepperItem[];
  emptyState?: ReactNode;
  orientation?: CanvasStepperOrientation;
}

function stepAccent(theme: CanvasTheme, state: CanvasStepState) {
  switch (state) {
    case "complete":
      return theme.success;
    case "current":
      return theme.accent;
    case "blocked":
      return theme.danger;
    case "upcoming":
    default:
      return theme.textDim;
  }
}

function stepTone(theme: CanvasTheme, state: CanvasStepState) {
  switch (state) {
    case "complete":
      return toneStyles(theme, "success");
    case "current":
      return toneStyles(theme, "accent");
    case "blocked":
      return toneStyles(theme, "danger");
    case "upcoming":
    default:
      return toneStyles(theme, "neutral");
  }
}

export function Stepper({
  theme: providedTheme,
  items,
  emptyState,
  orientation = "vertical",
}: CanvasStepperProps) {
  const theme = resolveTheme(providedTheme);

  if (items.length === 0) {
    return emptyState ?? null;
  }

  const isHorizontal = orientation === "horizontal";

  return (
    <ol
      style={
        isHorizontal
          ? {
              listStyle: "none",
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "minmax(0, 1fr)",
              gap: 12,
              margin: 0,
              padding: 0,
              alignItems: "start",
            }
          : {
              listStyle: "none",
              display: "grid",
              gap: 12,
              margin: 0,
              padding: 0,
            }
      }
    >
      {items.map((item, index) => {
        const accent = stepAccent(theme, item.state);
        const toneSet = stepTone(theme, item.state);
        const isCurrent = item.state === "current";
        const isComplete = item.state === "complete";
        const isLast = index === items.length - 1;
        const indicatorSize = 28;

        if (isHorizontal) {
          return (
            <li
              key={item.id}
              aria-current={isCurrent ? "step" : undefined}
              style={{
                display: "grid",
                gridTemplateRows: "auto minmax(0, 1fr)",
                gap: 10,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `${indicatorSize}px minmax(0, 1fr)`,
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: indicatorSize,
                    height: indicatorSize,
                    borderRadius: "999px",
                    border: `2px solid ${accent}`,
                    background: isComplete || isCurrent ? accent : "#ffffff",
                    color: isComplete || isCurrent ? "#ffffff" : accent,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    boxShadow: isCurrent
                      ? `0 0 0 4px ${toneSet.bg}`
                      : undefined,
                  }}
                >
                  {item.indicator ?? index + 1}
                </span>
                {!isLast ? (
                  <span
                    aria-hidden
                    style={{ height: 2, width: "100%", background: accent }}
                  />
                ) : null}
              </div>
              <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                {item.eyebrow ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: toneSet.fg,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {item.eyebrow}
                  </span>
                ) : null}
                <strong style={{ color: theme.text, fontSize: 13.5 }}>
                  {item.title}
                </strong>
                {item.description ? (
                  <span
                    style={{
                      color: theme.textMuted,
                      fontSize: 12.5,
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
                  <Pill theme={theme} tone={copyToneForStepState(item.state)}>
                    {item.stateLabel ?? item.state}
                  </Pill>
                  {item.timestamp ? (
                    <span style={{ color: theme.textMuted, fontSize: 12 }}>
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
            aria-current={isCurrent ? "step" : undefined}
            style={{
              display: "grid",
              gridTemplateColumns: `${indicatorSize}px minmax(0, 1fr)`,
              gap: 12,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", justifyItems: "center", gap: 6 }}>
              <span
                style={{
                  width: indicatorSize,
                  height: indicatorSize,
                  borderRadius: "999px",
                  border: `2px solid ${accent}`,
                  background: isComplete || isCurrent ? accent : "#ffffff",
                  color: isComplete || isCurrent ? "#ffffff" : accent,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  boxShadow: isCurrent ? `0 0 0 4px ${toneSet.bg}` : undefined,
                }}
              >
                {item.indicator ?? index + 1}
              </span>
              {!isLast ? (
                <span
                  aria-hidden
                  style={{
                    width: 2,
                    minHeight: 40,
                    background: accent,
                  }}
                />
              ) : null}
            </div>
            <div style={{ padding: "2px 0 12px", display: "grid", gap: 8 }}>
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
                        color: toneSet.fg,
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
                    <Pill theme={theme} tone={copyToneForStepState(item.state)}>
                      {item.stateLabel ?? item.state}
                    </Pill>
                  </div>
                </div>
                {item.timestamp ? (
                  <span
                    style={{
                      color: theme.textMuted,
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
                    color: theme.textMuted,
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
                    color: theme.textMuted,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {item.description}
                </div>
              ) : null}
              {item.supportingContent ? (
                <div style={{ display: "grid", gap: 8 }}>
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

function copyToneForStepState(state: CanvasStepState): CanvasTone {
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

export interface CanvasTimelineItem {
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
}

export interface CanvasTimelineProps {
  theme?: CanvasTheme;
  items: CanvasTimelineItem[];
  emptyState?: ReactNode;
}

export function Timeline({
  theme: providedTheme,
  items,
  emptyState,
}: CanvasTimelineProps) {
  const theme = resolveTheme(providedTheme);

  if (items.length === 0) {
    return emptyState ?? null;
  }

  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gap: 14,
      }}
    >
      {items.map((item, index) => {
        const tone = toneStyles(theme, item.tone ?? "neutral");
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
              gridTemplateColumns: "20px minmax(0, 1fr)",
              gap: 12,
              alignItems: "start",
            }}
          >
            <div
              style={{
                display: "grid",
                justifyItems: "center",
                gap: 8,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "999px",
                  background: tone.fg,
                  color: "#ffffff",
                  boxShadow: `0 0 0 4px ${tone.bg}`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {markerContent}
              </span>
              {index < items.length - 1 ? (
                <span
                  aria-hidden
                  style={{ width: 2, minHeight: 52, background: tone.fg }}
                />
              ) : null}
            </div>
            <div
              style={{
                paddingBottom: 12,
                display: "grid",
                gap: 6,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  {item.eyebrow ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: tone.fg,
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
                {item.timestamp ? (
                  <span
                    style={{
                      color: theme.textMuted,
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
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    color: theme.textMuted,
                    fontSize: 12,
                  }}
                >
                  {item.meta}
                </div>
              ) : null}
              {item.detail ? (
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {item.detail}
                </div>
              ) : null}
              {item.supportingContent ? (
                <div style={{ display: "grid", gap: 8 }}>
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
