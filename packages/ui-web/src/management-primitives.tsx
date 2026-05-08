import type { CSSProperties, ReactNode } from "react";

type ManagementTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

type StepState = "complete" | "current" | "upcoming" | "blocked";

type ToneStyles = {
  background: string;
  border: string;
  text: string;
  subtle: string;
};

const TONE_STYLES: Record<ManagementTone, ToneStyles> = {
  neutral: {
    background: "#f8fafc",
    border: "#cbd5e1",
    text: "#334155",
    subtle: "#64748b",
  },
  info: {
    background: "#eff6ff",
    border: "#93c5fd",
    text: "#1d4ed8",
    subtle: "#1e40af",
  },
  success: {
    background: "#f0fdf4",
    border: "#86efac",
    text: "#166534",
    subtle: "#15803d",
  },
  warning: {
    background: "#fff7ed",
    border: "#fdba74",
    text: "#c2410c",
    subtle: "#9a3412",
  },
  danger: {
    background: "#fef2f2",
    border: "#fca5a5",
    text: "#b91c1c",
    subtle: "#991b1b",
  },
  accent: {
    background: "#f5f3ff",
    border: "#c4b5fd",
    text: "#6d28d9",
    subtle: "#7c3aed",
  },
};

const STEP_ACCENT: Record<StepState, string> = {
  complete: "#166534",
  current: "#1d4ed8",
  upcoming: "#94a3b8",
  blocked: "#b91c1c",
};

export interface PageMetaItem {
  label: string;
  value: string;
}

interface SectionHeaderProps {
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
            {meta.map((item) => (
              <span
                key={`${item.label}-${item.value}`}
                style={{
                  fontSize: "12px",
                  color: "#475569",
                }}
              >
                <strong style={{ color: "#0f172a" }}>{item.label}:</strong>{" "}
                {item.value}
              </span>
            ))}
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

interface KpiCardProps {
  label: string;
  value: string | number;
  detail?: string;
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

interface FilterPillProps {
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

interface CalloutBannerProps {
  title: string;
  description?: string;
  tone?: ManagementTone;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function CalloutBanner({
  title,
  description,
  tone = "info",
  icon,
  actions,
}: CalloutBannerProps) {
  const toneStyles = TONE_STYLES[tone];

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "16px",
        padding: "16px 18px",
        borderRadius: "16px",
        border: `1px solid ${toneStyles.border}`,
        background: toneStyles.background,
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
            }}
          >
            {icon}
          </span>
        ) : null}
        <div style={{ minWidth: 0 }}>
          <strong
            style={{
              display: "block",
              color: toneStyles.text,
              fontSize: "14px",
            }}
          >
            {title}
          </strong>
          {description ? (
            <p
              style={{
                margin: "6px 0 0",
                color: toneStyles.subtle,
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

interface StatusChipProps {
  label: string;
  tone?: ManagementTone;
  authorityLabel?: string;
}

export function StatusChip({
  label,
  tone = "neutral",
  authorityLabel,
}: StatusChipProps) {
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

export interface StepperItem {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  state: StepState;
}

export function Stepper({ items }: { items: StepperItem[] }) {
  return (
    <ol
      style={{
        listStyle: "none",
        display: "grid",
        gap: "12px",
        margin: 0,
        padding: 0,
      }}
    >
      {items.map((item, index) => {
        const accent = STEP_ACCENT[item.state];
        return (
          <li
            key={item.id}
            style={{
              display: "grid",
              gridTemplateColumns: "28px minmax(0, 1fr)",
              gap: "12px",
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
                  width: "28px",
                  height: "28px",
                  borderRadius: "999px",
                  border: `2px solid ${accent}`,
                  background:
                    item.state === "complete" || item.state === "current"
                      ? accent
                      : "#ffffff",
                  color:
                    item.state === "complete" || item.state === "current"
                      ? "#ffffff"
                      : accent,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                {index + 1}
              </span>
              {index < items.length - 1 ? (
                <span
                  aria-hidden
                  style={{
                    width: "2px",
                    minHeight: "40px",
                    background: "#dbe2ea",
                  }}
                />
              ) : null}
            </div>
            <div
              style={{
                padding: "2px 0 12px",
                display: "grid",
                gap: "4px",
              }}
            >
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
                  label={item.state}
                  tone={
                    item.state === "complete"
                      ? "success"
                      : item.state === "current"
                        ? "info"
                        : item.state === "blocked"
                          ? "danger"
                          : "neutral"
                  }
                />
                {item.meta ? (
                  <span style={{ color: "#64748b", fontSize: "12px" }}>
                    {item.meta}
                  </span>
                ) : null}
              </div>
              {item.description ? (
                <p
                  style={{
                    margin: 0,
                    color: "#64748b",
                    fontSize: "13px",
                    lineHeight: 1.5,
                  }}
                >
                  {item.description}
                </p>
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
  title: string;
  detail?: string;
  timestamp?: string;
  tone?: ManagementTone;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gap: "14px",
      }}
    >
      {items.map((item) => {
        const toneStyles = TONE_STYLES[item.tone ?? "neutral"];
        return (
          <li
            key={item.id}
            style={{
              display: "grid",
              gridTemplateColumns: "12px minmax(0, 1fr)",
              gap: "12px",
              alignItems: "start",
            }}
          >
            <span
              aria-hidden
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "999px",
                background: toneStyles.text,
                boxShadow: `0 0 0 4px ${toneStyles.background}`,
                marginTop: "4px",
              }}
            />
            <div
              style={{
                paddingBottom: "14px",
                borderBottom: "1px solid #e2e8f0",
                display: "grid",
                gap: "4px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "baseline",
                }}
              >
                <strong style={{ color: "#0f172a", fontSize: "14px" }}>
                  {item.title}
                </strong>
                {item.timestamp ? (
                  <span style={{ color: "#64748b", fontSize: "12px" }}>
                    {item.timestamp}
                  </span>
                ) : null}
              </div>
              {item.detail ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: "#64748b",
                    lineHeight: 1.5,
                  }}
                >
                  {item.detail}
                </p>
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
  hint?: string;
}

interface DetailListProps {
  items: DetailListItem[];
  columns?: number;
  dense?: boolean;
}

export function DetailList({
  items,
  columns = 2,
  dense = false,
}: DetailListProps) {
  return (
    <dl
      style={{
        margin: 0,
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: dense ? "12px 16px" : "16px 20px",
      }}
    >
      {items.map((item) => (
        <div key={item.id} style={{ minWidth: 0 }}>
          <dt
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: dense ? "4px" : "6px",
            }}
          >
            {item.label}
          </dt>
          <dd style={{ margin: 0, color: "#0f172a", fontSize: "14px" }}>
            {item.value}
          </dd>
          {item.hint ? (
            <p
              style={{
                margin: "4px 0 0",
                color: "#64748b",
                fontSize: "12px",
                lineHeight: 1.5,
              }}
            >
              {item.hint}
            </p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

export function managementSurfaceStyle(
  tone: ManagementTone = "neutral",
): CSSProperties {
  const toneStyles = TONE_STYLES[tone];
  return {
    background: "#ffffff",
    borderRadius: "18px",
    border: `1px solid ${toneStyles.border}`,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
  };
}
