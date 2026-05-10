import {
  DISPLAY_STRINGS,
  STATUS_DISPLAY_STRINGS,
  STATUS_TONE_BY_VALUE,
  type ConsoleAccentName,
  type ForwardedStatus,
  type LocalizedDisplayString,
} from "@drts/ui-tokens";
import type { ReactNode } from "react";
import {
  MANAGEMENT_SURFACE_TONES,
  managementSurfaceStyle,
} from "./management-theme";
export type { ManagementTone } from "./management-theme";
import type { ManagementDensity, ManagementTone } from "./management-theme";

export type StepState = "complete" | "current" | "upcoming" | "blocked";

export type ManagementVariant = "card" | "embed";

const TONE_STYLES = MANAGEMENT_SURFACE_TONES;

const STEP_ACCENT: Record<StepState, string> = {
  complete: "#166534",
  current: "#1d4ed8",
  upcoming: "#94a3b8",
  blocked: "#b91c1c",
};

const RAIL_IDLE = "#dbe2ea";

export type StatusChipLocale = keyof LocalizedDisplayString;

const DEFAULT_STATUS_CHIP_LOCALE: StatusChipLocale = "zhTW";

function toneForStepState(state: StepState): ManagementTone {
  switch (state) {
    case "complete":
      return "success";
    case "current":
      return "info";
    case "blocked":
      return "danger";
    case "upcoming":
    default:
      return "neutral";
  }
}

function stackGap(density: ManagementDensity, compact: string, roomy: string) {
  return density === "compact" ? compact : roomy;
}

function localizedLabel(
  value: LocalizedDisplayString,
  locale: StatusChipLocale = DEFAULT_STATUS_CHIP_LOCALE,
) {
  return value[locale];
}

function authorityDisplayLabel(
  authority: "owned" | "forwarded",
  locale?: StatusChipLocale,
) {
  return localizedLabel(DISPLAY_STRINGS.authority[authority], locale);
}

function surfaceDisplayLabel(
  surface: ConsoleAccentName,
  locale?: StatusChipLocale,
) {
  return localizedLabel(DISPLAY_STRINGS.surfaces[surface], locale);
}

function forwardedStatusLabel(
  status: ForwardedStatus,
  locale?: StatusChipLocale,
) {
  return localizedLabel(STATUS_DISPLAY_STRINGS[status], locale);
}

function renderEmptyState(
  emptyState: ReactNode,
  density: ManagementDensity,
): ReactNode {
  return (
    <div
      style={{
        padding: density === "compact" ? "12px 14px" : "14px 16px",
        borderRadius: "14px",
        border: "1px dashed #cbd5e1",
        background: "#f8fafc",
        color: "#64748b",
        fontSize: density === "compact" ? "12px" : "13px",
        lineHeight: 1.5,
      }}
    >
      {emptyState}
    </div>
  );
}

export interface PageMetaItem {
  label: string;
  value: ReactNode;
  tone?: ManagementTone;
}

export interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  meta?: PageMetaItem[];
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  meta,
}: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "16px",
        alignItems: "flex-start",
      }}
    >
      <div style={{ display: "grid", gap: "8px" }}>
        {eyebrow ? (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            {eyebrow}
          </span>
        ) : null}
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            {title}
          </h2>
          {subtitle ? (
            <p
              style={{
                margin: "6px 0 0",
                fontSize: "13.5px",
                lineHeight: 1.5,
                color: "#64748b",
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {meta && meta.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 12px" }}>
            {meta.map((item, index) => {
              const toneStyles = TONE_STYLES[item.tone ?? "neutral"];
              return (
                <span
                  key={`${item.label}-${index}`}
                  style={{
                    fontSize: "12px",
                    color: toneStyles.subtle,
                  }}
                >
                  <strong style={{ color: "#0f172a" }}>{item.label}:</strong>{" "}
                  {item.value}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: "8px",
            flexShrink: 0,
          }}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export interface KpiCardProps {
  label: string;
  value: string | number | ReactNode;
  detail?: ReactNode;
  trend?: ReactNode;
  tone?: ManagementTone;
}

export function KpiCard({
  label,
  value,
  detail,
  trend,
  tone = "neutral",
}: KpiCardProps) {
  const toneStyles = TONE_STYLES[tone];

  return (
    <div
      style={{
        minWidth: 0,
        padding: "14px 16px",
        borderRadius: "14px",
        border: `1px solid ${toneStyles.border}`,
        background: toneStyles.background,
        display: "grid",
        gap: "6px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "8px",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            color: toneStyles.subtle,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </span>
        {trend ? <span style={{ color: toneStyles.text }}>{trend}</span> : null}
      </div>
      <strong
        style={{
          fontSize: "24px",
          lineHeight: 1.1,
          color: "#0f172a",
        }}
      >
        {value}
      </strong>
      {detail ? (
        <span style={{ fontSize: "12px", color: toneStyles.subtle }}>
          {detail}
        </span>
      ) : null}
    </div>
  );
}

export function KpiRow({
  children,
  minWidth = "180px",
}: {
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}, 1fr))`,
        gap: "12px",
      }}
    >
      {children}
    </div>
  );
}

export interface FilterPillProps {
  label: string;
  active?: boolean;
  tone?: ManagementTone;
  count?: string | number;
}

export function FilterPill({
  label,
  active = false,
  tone = "neutral",
  count,
}: FilterPillProps) {
  const toneStyles = TONE_STYLES[tone];
  const background = active ? toneStyles.text : "#ffffff";
  const foreground = active ? "#ffffff" : toneStyles.text;
  const border = active ? toneStyles.text : toneStyles.border;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 12px",
        borderRadius: "999px",
        border: `1px solid ${border}`,
        background,
        color: foreground,
        fontSize: "12px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span>{label}</span>
      {count !== undefined ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "20px",
            height: "20px",
            padding: "0 6px",
            borderRadius: "999px",
            background: active
              ? "rgba(255,255,255,0.18)"
              : toneStyles.background,
            color: foreground,
            fontSize: "11px",
          }}
        >
          {count}
        </span>
      ) : null}
    </span>
  );
}

export function FilterPillRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
      }}
    >
      {children}
    </div>
  );
}

export interface DataFilterOption<T extends string = string> {
  value: T;
  label: string;
  count?: string | number;
  tone?: ManagementTone;
}

export interface DataFilterBarProps<T extends string = string> {
  value: T;
  filters: readonly DataFilterOption<T>[];
  onChange?: (value: T) => void;
  ariaLabel?: string;
}

export function DataFilterBar<T extends string = string>({
  value,
  filters,
  onChange,
  ariaLabel,
}: DataFilterBarProps<T>) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
    >
      {filters.map((filter) => {
        const active = filter.value === value;

        return (
          <button
            key={filter.value}
            type="button"
            onClick={() => onChange?.(filter.value)}
            aria-pressed={active}
            style={{
              appearance: "none",
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: onChange ? "pointer" : "default",
            }}
          >
            <FilterPill
              label={filter.label}
              active={active}
              {...(filter.count !== undefined ? { count: filter.count } : {})}
              {...(filter.tone ? { tone: filter.tone } : {})}
            />
          </button>
        );
      })}
    </div>
  );
}

export interface DataViewCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  tone?: ManagementTone;
  density?: ManagementDensity;
  filters?: ReactNode;
  actions?: ReactNode;
  summary?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function DataViewCard({
  title,
  subtitle,
  tone = "neutral",
  density = "comfortable",
  filters,
  actions,
  summary,
  footer,
  children,
}: DataViewCardProps) {
  const toneStyles = TONE_STYLES[tone];

  return (
    <section
      style={{
        ...managementSurfaceStyle(tone),
        padding: density === "compact" ? "14px 16px" : "18px 20px",
        display: "grid",
        gap: stackGap(density, "14px", "16px"),
      }}
    >
      <div style={{ display: "grid", gap: stackGap(density, "10px", "12px") }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
          }}
        >
          <div style={{ display: "grid", gap: "6px", minWidth: 0 }}>
            <strong style={{ color: "#0f172a", fontSize: "16px" }}>
              {title}
            </strong>
            {subtitle ? (
              <div
                style={{
                  color: "#64748b",
                  fontSize: density === "compact" ? "12.5px" : "13px",
                  lineHeight: 1.5,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              {actions}
            </div>
          ) : null}
        </div>
        {summary ? (
          <div
            style={{
              color: toneStyles.subtle,
              fontSize: density === "compact" ? "12px" : "12.5px",
              lineHeight: 1.5,
            }}
          >
            {summary}
          </div>
        ) : null}
        {filters ? filters : null}
      </div>
      <div style={{ display: "grid", gap: "12px" }}>{children}</div>
      {footer ? (
        <div
          style={{
            paddingTop: "12px",
            borderTop: `1px solid ${toneStyles.border}`,
            color: "#64748b",
            fontSize: "12.5px",
            lineHeight: 1.5,
          }}
        >
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function DataCellStack({
  primary,
  secondary,
  tertiary,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  tertiary?: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <div>{primary}</div>
      {secondary ? (
        <div style={{ color: "#64748b", fontSize: "12px" }}>{secondary}</div>
      ) : null}
      {tertiary ? (
        <div style={{ color: "#94a3b8", fontSize: "11.5px" }}>{tertiary}</div>
      ) : null}
    </div>
  );
}

export interface WorkflowPanelProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  tone?: ManagementTone;
  density?: ManagementDensity;
  variant?: ManagementVariant;
  meta?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

export function WorkflowPanel({
  eyebrow,
  title,
  description,
  tone = "neutral",
  density = "comfortable",
  variant = "card",
  meta,
  actions,
  footer,
  children,
}: WorkflowPanelProps) {
  const toneStyles = TONE_STYLES[tone];
  const isEmbed = variant === "embed";
  const surfaceStyle = isEmbed
    ? {
        background: "transparent",
        border: 0,
        borderRadius: 0,
        boxShadow: "none",
      }
    : managementSurfaceStyle(tone);

  return (
    <section
      style={{
        ...surfaceStyle,
        padding: isEmbed
          ? 0
          : density === "compact"
            ? "14px 16px"
            : "18px 20px",
        display: "grid",
        gap: stackGap(density, "14px", "16px"),
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: stackGap(density, "6px", "8px"),
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
          <div
            style={{ display: "grid", gap: stackGap(density, "4px", "6px") }}
          >
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
                  lineHeight: 1.55,
                }}
              >
                {description}
              </div>
            ) : null}
            {meta ? (
              <div style={{ display: "grid", gap: "8px" }}>{meta}</div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: "8px",
              flexShrink: 0,
            }}
          >
            {actions}
          </div>
        ) : null}
      </div>
      {children ? (
        <div
          style={{
            display: "grid",
            gap: stackGap(density, "10px", "12px"),
          }}
        >
          {children}
        </div>
      ) : null}
      {footer ? (
        <div
          style={{
            paddingTop: "12px",
            borderTop: `1px solid ${toneStyles.border}`,
            color: "#64748b",
            fontSize: "12.5px",
            lineHeight: 1.5,
          }}
        >
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export interface WorkflowCalloutProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  tone?: ManagementTone;
  density?: ManagementDensity;
  variant?: ManagementVariant;
  icon?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}

export function WorkflowCallout({
  eyebrow,
  title,
  description,
  tone = "info",
  density = "comfortable",
  variant = "card",
  icon,
  meta,
  actions,
  children,
  footer,
}: WorkflowCalloutProps) {
  const toneStyles = TONE_STYLES[tone];
  const isEmbed = variant === "embed";

  return (
    <div
      style={{
        display: "grid",
        gap: stackGap(density, "12px", "14px"),
        padding: isEmbed
          ? 0
          : density === "compact"
            ? "12px 14px"
            : "16px 18px",
        borderRadius: isEmbed ? 0 : "16px",
        border: isEmbed ? 0 : `1px solid ${toneStyles.border}`,
        background: isEmbed ? "transparent" : toneStyles.background,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", gap: "12px", minWidth: 0 }}>
          {icon ? (
            <span
              aria-hidden
              style={{
                color: toneStyles.text,
                display: "inline-flex",
                paddingTop: "2px",
                flexShrink: 0,
              }}
            >
              {icon}
            </span>
          ) : null}
          <div
            style={{
              minWidth: 0,
              display: "grid",
              gap: stackGap(density, "4px", "6px"),
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
                display: "block",
                color: toneStyles.text,
                fontSize: density === "compact" ? "13px" : "14px",
              }}
            >
              {title}
            </strong>
            {description ? (
              <div
                style={{
                  color: toneStyles.subtle,
                  fontSize: density === "compact" ? "12.5px" : "13px",
                  lineHeight: 1.5,
                }}
              >
                {description}
              </div>
            ) : null}
            {meta ? (
              <div style={{ display: "grid", gap: "8px" }}>{meta}</div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexShrink: 0,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {actions}
          </div>
        ) : null}
      </div>
      {children ? (
        <div
          style={{
            display: "grid",
            gap: stackGap(density, "8px", "10px"),
          }}
        >
          {children}
        </div>
      ) : null}
      {footer ? (
        <div
          style={{
            paddingTop: "10px",
            borderTop: `1px solid ${toneStyles.border}`,
            color: toneStyles.subtle,
            fontSize: "12.5px",
            lineHeight: 1.5,
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export type CalloutBannerProps = WorkflowCalloutProps;

export function CalloutBanner({
  eyebrow,
  title,
  description,
  tone = "info",
  density = "comfortable",
  variant = "card",
  icon,
  meta,
  actions,
  children,
  footer,
}: CalloutBannerProps) {
  const forwardedProps = {
    title,
    tone,
    density,
    variant,
    ...(eyebrow !== undefined ? { eyebrow } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(icon !== undefined ? { icon } : {}),
    ...(meta !== undefined ? { meta } : {}),
    ...(actions !== undefined ? { actions } : {}),
    ...(footer !== undefined ? { footer } : {}),
  } satisfies WorkflowCalloutProps;

  return <WorkflowCallout {...forwardedProps}>{children}</WorkflowCallout>;
}

type ManualStatusChipProps = {
  label: ReactNode;
  tone?: ManagementTone;
  authorityLabel?: string;
  authority?: never;
  status?: never;
  locale?: never;
};

type OwnedStatusChipProps = {
  authority: "owned";
  label?: ReactNode;
  authorityLabel?: string;
  locale?: StatusChipLocale;
  tone?: never;
  status?: never;
};

type ForwardedStatusChipProps = {
  authority: "forwarded";
  status: ForwardedStatus;
  label?: ReactNode;
  authorityLabel?: string;
  locale?: StatusChipLocale;
  tone?: never;
};

export type StatusChipProps =
  | ManualStatusChipProps
  | OwnedStatusChipProps
  | ForwardedStatusChipProps;

export function StatusChip({
  label: rawLabel,
  tone: rawTone = "neutral",
  authorityLabel,
  authority,
  status,
  locale,
}: StatusChipProps) {
  const label =
    authority === "owned"
      ? (rawLabel ?? authorityDisplayLabel("owned", locale))
      : authority === "forwarded"
        ? (rawLabel ?? forwardedStatusLabel(status, locale))
        : rawLabel;
  const tone =
    authority === "owned"
      ? "owned"
      : authority === "forwarded"
        ? STATUS_TONE_BY_VALUE[status]
        : rawTone;
  const toneStyles = TONE_STYLES[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: authorityLabel ? "4px 10px 4px 4px" : "4px 10px",
        borderRadius: "999px",
        border: `1px solid ${toneStyles.border}`,
        background: toneStyles.background,
        color: toneStyles.text,
        fontSize: "12px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {authorityLabel ? (
        <span
          style={{
            padding: "2px 7px",
            borderRadius: "999px",
            background: "#ffffff",
            color: "#475569",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {authorityLabel}
        </span>
      ) : null}
      <span>{label}</span>
    </span>
  );
}

type AuthorityBadgeSemanticProps =
  | {
      authority: "owned";
      label?: ReactNode;
      locale?: StatusChipLocale;
      category?: string;
      status?: never;
    }
  | {
      authority: "forwarded";
      label?: ReactNode;
      locale?: StatusChipLocale;
      category?: string;
      status?: ForwardedStatus;
    };

type AuthorityBadgeLegacyProps = {
  authority?: never;
  label?: ReactNode;
  category?: string;
  tone?: ManagementTone;
  locale?: never;
  status?: never;
};

export type AuthorityBadgeProps =
  | AuthorityBadgeSemanticProps
  | AuthorityBadgeLegacyProps;

export function AuthorityBadge(props: AuthorityBadgeProps) {
  if (!("authority" in props)) {
    return (
      <StatusChip
        label={props.label}
        tone={props.tone ?? "neutral"}
        {...(props.category !== undefined
          ? { authorityLabel: props.category }
          : {})}
      />
    );
  }

  const { authority, label, locale, category = "authority", status } = props;

  if (authority === "forwarded" && status) {
    return (
      <StatusChip
        authority="forwarded"
        status={status}
        {...(label !== undefined ? { label } : {})}
        {...(locale !== undefined ? { locale } : {})}
        authorityLabel={category}
      />
    );
  }

  return (
    <StatusChip
      label={label ?? authorityDisplayLabel(authority, locale)}
      tone={authority}
      authorityLabel={category}
    />
  );
}

export interface PlatformBadgeProps {
  surface: ConsoleAccentName;
  label?: ReactNode;
  locale?: StatusChipLocale;
}

export function PlatformBadge({ surface, label, locale }: PlatformBadgeProps) {
  return (
    <StatusChip
      label={label ?? surfaceDisplayLabel(surface, locale)}
      tone={surface}
    />
  );
}

type AuthorityBannerBaseProps = Omit<
  WorkflowCalloutProps,
  "tone" | "eyebrow" | "meta"
> & {
  eyebrow?: string;
  meta?: ReactNode;
  locale?: StatusChipLocale;
};

export type AuthorityBannerProps =
  | (AuthorityBannerBaseProps & {
      authority: "owned";
      label?: string;
      status?: never;
    })
  | (AuthorityBannerBaseProps & {
      authority: "forwarded";
      label?: string;
      status?: ForwardedStatus;
    });

export function AuthorityBanner({
  authority,
  label,
  locale,
  status,
  eyebrow,
  meta,
  ...props
}: AuthorityBannerProps) {
  const resolvedTone =
    authority === "forwarded" && status
      ? STATUS_TONE_BY_VALUE[status]
      : authority;
  const resolvedMeta =
    authority === "forwarded" && status ? (
      <>
        <StatusChip
          authority="forwarded"
          status={status}
          {...(locale !== undefined ? { locale } : {})}
        />
        {meta}
      </>
    ) : (
      meta
    );

  return (
    <CalloutBanner
      {...props}
      tone={resolvedTone}
      eyebrow={eyebrow ?? label ?? authorityDisplayLabel(authority, locale)}
      meta={resolvedMeta}
    />
  );
}

export interface StepperItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  state: StepState;
  tone?: ManagementTone;
  stateLabel?: ReactNode;
  eyebrow?: string;
  timestamp?: ReactNode;
  supportingContent?: ReactNode;
  actions?: ReactNode;
  indicator?: ReactNode;
}

export type StepperOrientation = "vertical" | "horizontal";

export interface StepperProps {
  items: StepperItem[];
  density?: ManagementDensity;
  emptyState?: ReactNode;
  orientation?: StepperOrientation;
}

export function Stepper({
  items,
  density = "comfortable",
  emptyState,
  orientation = "vertical",
}: StepperProps) {
  if (items.length === 0) {
    return emptyState ? renderEmptyState(emptyState, density) : null;
  }

  const isHorizontal = orientation === "horizontal";

  return (
    <ol
      data-orientation={orientation}
      style={
        isHorizontal
          ? {
              listStyle: "none",
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "minmax(0, 1fr)",
              gap: stackGap(density, "8px", "12px"),
              margin: 0,
              padding: 0,
              alignItems: "start",
            }
          : {
              listStyle: "none",
              display: "grid",
              gap: stackGap(density, "10px", "12px"),
              margin: 0,
              padding: 0,
            }
      }
    >
      {items.map((item, index) => {
        const tone = item.tone ?? toneForStepState(item.state);
        const accent = item.tone
          ? TONE_STYLES[item.tone].text
          : STEP_ACCENT[item.state];
        const isComplete = item.state === "complete";
        const isCurrent = item.state === "current";
        const railColor = isComplete ? STEP_ACCENT.complete : RAIL_IDLE;
        const isLast = index === items.length - 1;
        const indicatorSize = density === "compact" ? "24px" : "28px";
        if (isHorizontal) {
          return (
            <li
              key={item.id}
              aria-current={isCurrent ? "step" : undefined}
              style={{
                display: "grid",
                gridTemplateRows: "auto minmax(0, 1fr)",
                gap: stackGap(density, "8px", "10px"),
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `${indicatorSize} minmax(0, 1fr)`,
                  alignItems: "center",
                  gap: "8px",
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
                    fontSize: density === "compact" ? "11px" : "12px",
                    fontWeight: 700,
                    boxShadow: isCurrent
                      ? `0 0 0 4px ${TONE_STYLES[tone].background}`
                      : undefined,
                  }}
                >
                  {item.indicator ?? index + 1}
                </span>
                {!isLast ? (
                  <span
                    aria-hidden
                    style={{
                      height: "2px",
                      width: "100%",
                      background: railColor,
                    }}
                  />
                ) : null}
              </div>
              <div
                style={{
                  display: "grid",
                  gap: "4px",
                  minWidth: 0,
                }}
              >
                {item.eyebrow ? (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: TONE_STYLES[tone].subtle,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {item.eyebrow}
                  </span>
                ) : null}
                <strong
                  style={{
                    color: "#0f172a",
                    fontSize: density === "compact" ? "13px" : "13.5px",
                  }}
                >
                  {item.title}
                </strong>
                {item.description ? (
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: density === "compact" ? "12px" : "12.5px",
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
                    gap: "6px",
                  }}
                >
                  <StatusChip
                    label={item.stateLabel ?? item.state}
                    tone={tone}
                  />
                  {item.timestamp ? (
                    <span style={{ color: "#64748b", fontSize: "12px" }}>
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
              gridTemplateColumns: `${indicatorSize} minmax(0, 1fr)`,
              gap: stackGap(density, "10px", "12px"),
              alignItems: "start",
            }}
          >
            <div
              style={{
                display: "grid",
                justifyItems: "center",
                gap: "6px",
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
                  fontSize: density === "compact" ? "11px" : "12px",
                  fontWeight: 700,
                  boxShadow: isCurrent
                    ? `0 0 0 4px ${TONE_STYLES[tone].background}`
                    : undefined,
                }}
              >
                {item.indicator ?? index + 1}
              </span>
              {!isLast ? (
                <span
                  aria-hidden
                  style={{
                    width: "2px",
                    minHeight: density === "compact" ? "32px" : "40px",
                    background: railColor,
                  }}
                />
              ) : null}
            </div>
            <div
              style={{
                padding: "2px 0 12px",
                display: "grid",
                gap: stackGap(density, "6px", "8px"),
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                  {item.eyebrow ? (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: TONE_STYLES[tone].subtle,
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
                      gap: "8px",
                    }}
                  >
                    <strong style={{ color: "#0f172a", fontSize: "14px" }}>
                      {item.title}
                    </strong>
                    <StatusChip
                      label={item.stateLabel ?? item.state}
                      tone={tone}
                    />
                  </div>
                </div>
                {item.timestamp ? (
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: "12px",
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
                    color: "#64748b",
                    fontSize: "12px",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {item.meta}
                </div>
              ) : null}
              {item.description ? (
                <div
                  style={{
                    color: "#64748b",
                    fontSize: density === "compact" ? "12.5px" : "13px",
                    lineHeight: 1.5,
                  }}
                >
                  {item.description}
                </div>
              ) : null}
              {item.supportingContent ? (
                <div
                  style={{
                    display: "grid",
                    gap: stackGap(density, "6px", "8px"),
                  }}
                >
                  {item.supportingContent}
                </div>
              ) : null}
              {item.actions ? (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
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

export interface TimelineItem {
  id: string;
  title: ReactNode;
  detail?: ReactNode;
  timestamp?: ReactNode;
  tone?: ManagementTone;
  eyebrow?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  supportingContent?: ReactNode;
  marker?: ReactNode;
}

export interface TimelineProps {
  items: TimelineItem[];
  density?: ManagementDensity;
  emptyState?: ReactNode;
}

export function Timeline({
  items,
  density = "comfortable",
  emptyState,
}: TimelineProps) {
  if (items.length === 0) {
    return emptyState ? renderEmptyState(emptyState, density) : null;
  }

  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gap: stackGap(density, "12px", "14px"),
      }}
    >
      {items.map((item, index) => {
        const itemTone = item.tone ?? "neutral";
        const toneStyles = TONE_STYLES[itemTone];
        const markerContent = item.marker ?? (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {index + 1}
          </span>
        );
        const railColor = item.tone ? toneStyles.text : RAIL_IDLE;
        return (
          <li
            key={item.id}
            style={{
              display: "grid",
              gridTemplateColumns: `${
                density === "compact" ? "18px" : "20px"
              } minmax(0, 1fr)`,
              gap: stackGap(density, "10px", "12px"),
              alignItems: "start",
            }}
          >
            <div
              style={{
                display: "grid",
                justifyItems: "center",
                gap: "8px",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: density === "compact" ? "16px" : "18px",
                  height: density === "compact" ? "16px" : "18px",
                  borderRadius: "999px",
                  background: toneStyles.text,
                  color: "#ffffff",
                  boxShadow: `0 0 0 4px ${toneStyles.background}`,
                  marginTop: "2px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: density === "compact" ? "9px" : "10px",
                  fontWeight: 700,
                }}
              >
                {markerContent}
              </span>
              {index < items.length - 1 ? (
                <span
                  aria-hidden
                  style={{
                    width: "2px",
                    minHeight: density === "compact" ? "34px" : "42px",
                    background: railColor,
                  }}
                />
              ) : null}
            </div>
            <div
              style={{
                paddingBottom: index < items.length - 1 ? "14px" : 0,
                borderBottom:
                  index < items.length - 1 ? "1px solid #e2e8f0" : "none",
                display: "grid",
                gap: stackGap(density, "6px", "8px"),
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                  {item.eyebrow ? (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: toneStyles.subtle,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {item.eyebrow}
                    </span>
                  ) : null}
                  <strong style={{ color: "#0f172a", fontSize: "14px" }}>
                    {item.title}
                  </strong>
                </div>
                {item.timestamp || item.actions ? (
                  <div
                    style={{
                      display: "grid",
                      justifyItems: "end",
                      gap: "6px",
                      flexShrink: 0,
                    }}
                  >
                    {item.timestamp ? (
                      <span style={{ color: "#64748b", fontSize: "12px" }}>
                        {item.timestamp}
                      </span>
                    ) : null}
                    {item.actions ? (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                          gap: "8px",
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
                    color: "#64748b",
                    fontSize: "12px",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {item.meta}
                </div>
              ) : null}
              {item.detail ? (
                <div
                  style={{
                    fontSize: density === "compact" ? "12.5px" : "13px",
                    color: "#64748b",
                    lineHeight: 1.5,
                  }}
                >
                  {item.detail}
                </div>
              ) : null}
              {item.supportingContent ? (
                <div
                  style={{
                    display: "grid",
                    gap: stackGap(density, "8px", "10px"),
                  }}
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

export interface DetailListItem {
  id: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: ManagementTone;
  columnSpan?: number;
  actions?: ReactNode;
  align?: "start" | "end";
}

export interface DetailMetadataGridProps {
  items: DetailListItem[];
  columns?: number;
  dense?: boolean;
  minColumnWidth?: string;
  emptyState?: ReactNode;
}

export function DetailMetadataGrid({
  items,
  columns = 2,
  dense = false,
  minColumnWidth,
  emptyState,
}: DetailMetadataGridProps) {
  if (items.length === 0) {
    return emptyState
      ? renderEmptyState(emptyState, dense ? "compact" : "comfortable")
      : null;
  }

  return (
    <dl
      style={{
        margin: 0,
        display: "grid",
        gridTemplateColumns: minColumnWidth
          ? `repeat(auto-fit, minmax(min(100%, ${minColumnWidth}), 1fr))`
          : `repeat(${columns}, minmax(0, 1fr))`,
        gap: dense ? "12px 16px" : "16px 20px",
      }}
    >
      {items.map((item) => {
        const isEndAligned = item.align === "end";
        return (
          <div
            key={item.id}
            style={{
              minWidth: 0,
              gridColumn: `span ${Math.min(
                Math.max(item.columnSpan ?? 1, 1),
                columns,
              )}`,
              ...(item.tone && item.tone !== "neutral"
                ? {
                    padding: dense ? "10px 12px" : "12px 14px",
                    borderRadius: "14px",
                    border: `1px solid ${TONE_STYLES[item.tone].border}`,
                    background: TONE_STYLES[item.tone].background,
                  }
                : {}),
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "8px",
                marginBottom: dense ? "4px" : "6px",
              }}
            >
              <dt
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: item.tone ? TONE_STYLES[item.tone].subtle : "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  minWidth: 0,
                }}
              >
                {item.label}
              </dt>
              {item.actions ? (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    flexShrink: 0,
                  }}
                >
                  {item.actions}
                </div>
              ) : null}
            </div>
            <dd
              style={{
                margin: 0,
                color: item.tone ? TONE_STYLES[item.tone].text : "#0f172a",
                fontSize: "14px",
                textAlign: isEndAligned ? "end" : "start",
                fontVariantNumeric: isEndAligned ? "tabular-nums" : undefined,
                wordBreak: "break-word",
              }}
            >
              {item.value}
            </dd>
            {item.hint ? (
              <p
                style={{
                  margin: "4px 0 0",
                  color: item.tone ? TONE_STYLES[item.tone].subtle : "#64748b",
                  fontSize: "12px",
                  lineHeight: 1.5,
                  textAlign: isEndAligned ? "end" : "start",
                }}
              >
                {item.hint}
              </p>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}

export type DetailListProps = DetailMetadataGridProps;

export function DetailList(props: DetailMetadataGridProps) {
  return <DetailMetadataGrid {...props} />;
}

export { managementSurfaceStyle };
