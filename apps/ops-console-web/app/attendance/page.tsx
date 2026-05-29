import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  AttendanceRecord,
  CrossAppResourceLink,
  DriverRegistryRecord,
  EmptyReason,
  EmptyStateEnvelope,
  ResourceActionDescriptor,
  ShiftRecord,
  ShiftStatus,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type AttendancePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type AttendanceView = "today" | "week" | "exceptions";
type AnomalyFilter = "all" | "only" | "clean";

// Backend may augment a shift with ui-runtime fields; we render whatever is
// present and synthesize a safe default when the backend has not yet wired it.
type ShiftRuntimeRecord = ShiftRecord & {
  driverName?: string | null;
  vehicleLabel?: string | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  anomaly?: boolean | null;
  anomalyReasonCode?: string | null;
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
};

type ShiftListPayload = ShiftRecord[] | ShiftListEnvelope;

type ShiftListEnvelope = {
  items: ShiftRuntimeRecord[];
  refresh?: UiRefreshMetadata;
  health?: UiHealthEnvelope;
  emptyState?: EmptyStateEnvelope;
};

type AttendanceFilters = {
  view: AttendanceView;
  q: string;
  status: ShiftStatus | "all";
  anomaly: AnomalyFilter;
  emptyReason: EmptyReason | null;
};

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

type HealthLoadResult = {
  health: UiHealthEnvelope | null;
  error: string | null;
};

type ShiftRow = Record<string, unknown> & {
  shiftId: string;
  driverId: string;
  driverName: string;
  driverLink: string;
  vehicleId: string | null;
  vehicleLink: string | null;
  vehicleLabel: string;
  status: ShiftStatus;
  statusLabel: string;
  statusTone: CanvasTone;
  scheduledStartLabel: string;
  scheduledEndLabel: string;
  actualStartLabel: string;
  actualEndLabel: string;
  hoursLabel: string;
  attendanceStatusLabel: string | null;
  attendanceTone: CanvasTone;
  attendanceDate: string | null;
  anomaly: boolean;
  anomalyReasonLabel: string | null;
  clockedInAt: string;
  clockedOutAt: string | null;
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
};

type GanttRow = {
  shiftId: string;
  driverLabel: string;
  driverLink: string;
  anomaly: boolean;
  status: ShiftStatus;
  segmentLeft: number;
  segmentWidth: number;
  startLabel: string;
  endLabel: string;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const REFRESH_STALE_AFTER_MS = 15_000;

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1.8fr) repeat(2, minmax(0, 1fr)) auto",
  gap: 10,
  alignItems: "end",
};

const fieldStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: theme.textMuted,
};

const fieldStyle: CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
};

const helperRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 10,
};

const helperTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
};

const monoTextStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
  whiteSpace: "normal",
};

const primaryTextStyle: CSSProperties = {
  color: theme.text,
  fontWeight: 600,
  minWidth: 0,
};

const secondaryTextStyle: CSSProperties = {
  color: theme.textDim,
  fontSize: 11.5,
  minWidth: 0,
};

const mutedTextStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 11.5,
  minWidth: 0,
};

const actionStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
  whiteSpace: "normal",
};

const emptyStateStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 10,
  padding: "28px 20px",
};

const ganttGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px minmax(720px, 1fr)",
  fontSize: 11,
  gap: "0 8px",
};

const ganttHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
  color: theme.textDim,
  paddingBottom: 4,
  borderBottom: `1px solid ${theme.border}`,
  fontFamily: theme.monoFamily,
};

const ganttTrackStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
};

const ganttSegmentBaseStyle: CSSProperties = {
  position: "absolute",
  top: 6,
  height: 16,
  borderRadius: 4,
  fontSize: 10,
  paddingLeft: 6,
  lineHeight: "14px",
  fontFamily: theme.monoFamily,
  overflow: "hidden",
  whiteSpace: "nowrap",
};

const EMPTY_REASONS = new Set<EmptyReason>([
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
]);

const EMPTY_REASON_CODES: Record<EmptyReason, string> = {
  no_data: "attendance_no_data",
  not_provisioned: "attendance_schedule_not_provisioned",
  fetch_failed: "attendance_fetch_failed",
  permission_denied: "attendance_permission_denied",
  external_unavailable: "attendance_external_unavailable",
  filtered_empty: "attendance_filtered_empty",
  driver_not_eligible: "driver_not_eligible",
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmptyReason(value: string | null | undefined): value is EmptyReason {
  return (
    value !== null &&
    value !== undefined &&
    EMPTY_REASONS.has(value as EmptyReason)
  );
}

function resolveFilters(
  searchParams: Record<string, string | string[] | undefined>,
): AttendanceFilters {
  const viewParam = firstParam(searchParams.view);
  const statusParam = firstParam(searchParams.status);
  const anomalyParam = firstParam(searchParams.anomaly);
  const emptyReasonParam = firstParam(searchParams.emptyReason);

  return {
    view:
      viewParam === "week" || viewParam === "exceptions" ? viewParam : "today",
    q: firstParam(searchParams.q)?.trim() ?? "",
    status:
      statusParam === "active" ||
      statusParam === "completed" ||
      statusParam === "abandoned"
        ? statusParam
        : "all",
    anomaly:
      anomalyParam === "only" || anomalyParam === "clean"
        ? anomalyParam
        : "all",
    emptyReason: isEmptyReason(emptyReasonParam) ? emptyReasonParam : null,
  };
}

function buildHref(
  filters: AttendanceFilters,
  overrides: Partial<AttendanceFilters>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.view !== "today") params.set("view", next.view);
  if (next.q) params.set("q", next.q);
  if (next.status !== "all") params.set("status", next.status);
  if (next.anomaly !== "all") params.set("anomaly", next.anomaly);
  if (next.emptyReason) params.set("emptyReason", next.emptyReason);
  const query = params.toString();
  return query ? `/attendance?${query}` : "/attendance";
}

function hasActiveFilters(filters: AttendanceFilters) {
  return (
    filters.q.length > 0 ||
    filters.status !== "all" ||
    filters.anomaly !== "all"
  );
}

function buttonStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
): CSSProperties {
  const styles =
    variant === "primary"
      ? {
          background: theme.accent,
          color: "#ffffff",
          borderColor: theme.accent,
        }
      : variant === "ghost"
        ? {
            background: "transparent",
            color: theme.textMuted,
            borderColor: "transparent",
          }
        : {
            background: theme.surface,
            color: theme.text,
            borderColor: theme.border,
          };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 34,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${styles.borderColor}`,
    background: styles.background,
    color: styles.color,
    fontSize: 12.5,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: theme.fontFamily,
  };
}

function linkButtonStyle(
  tone: CanvasTone = "neutral",
  disabled = false,
): CSSProperties {
  const palette: Record<CanvasTone, { bg: string; fg: string; bd: string }> = {
    success: {
      bg: theme.successBg,
      fg: theme.success,
      bd: theme.successBorder,
    },
    warn: { bg: theme.warnBg, fg: theme.warn, bd: theme.warnBorder },
    danger: { bg: theme.dangerBg, fg: theme.danger, bd: theme.dangerBorder },
    info: { bg: theme.infoBg, fg: theme.info, bd: theme.infoBorder },
    accent: { bg: theme.accentBg, fg: theme.accent, bd: theme.accentBorder },
    neutral: { bg: theme.surfaceLo, fg: theme.textMuted, bd: theme.border },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 26,
    padding: "4px 9px",
    borderRadius: 7,
    border: `1px solid ${palette[tone].bd}`,
    background: palette[tone].bg,
    color: palette[tone].fg,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    opacity: disabled ? 0.48 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    pointerEvents: disabled ? "none" : "auto",
  };
}

function tinyMetaStyle(tone: CanvasTone = "neutral"): CSSProperties {
  return {
    fontSize: 10.5,
    color: toneColor(tone),
    letterSpacing: 0.2,
  };
}

function toneColor(tone: CanvasTone) {
  const colors: Record<CanvasTone, string> = {
    success: theme.success,
    warn: theme.warn,
    danger: theme.danger,
    info: theme.info,
    accent: theme.accent,
    neutral: theme.textMuted,
  };

  return colors[tone];
}

function asTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function startOfUtcDay(date: Date) {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0,
  );
}

function intersectsRange(
  start: string | null | undefined,
  end: string | null | undefined,
  rangeStart: number,
  rangeEnd: number,
) {
  const startTime = asTime(start);
  if (startTime === null) {
    return false;
  }
  const endTime = asTime(end) ?? rangeEnd;
  return startTime < rangeEnd && endTime >= rangeStart;
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatLongDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return copy(locale, "unknown", "未知");
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatCanvasDateLabel(locale: Locale, value: Date) {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  const weekday = new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(value);

  return `${year}-${month}-${day} (${weekday})`;
}

function formatSegmentHour(value: number) {
  const whole = Math.floor(value);
  const minutes = Math.round((value - whole) * 60);
  const normalizedMinutes = minutes === 60 ? 0 : minutes;
  const normalizedHour = minutes === 60 ? whole + 1 : whole;
  if (normalizedMinutes === 0) {
    return normalizedHour.toString().padStart(2, "0");
  }
  return `${normalizedHour.toString().padStart(2, "0")}:${normalizedMinutes
    .toString()
    .padStart(2, "0")}`;
}

function shiftTone(status: ShiftStatus): CanvasTone {
  if (status === "completed") return "success";
  if (status === "abandoned") return "danger";
  return "info";
}

function attendanceTone(status: AttendanceRecord["status"]): CanvasTone {
  if (status === "present") return "success";
  if (status === "partial") return "warn";
  return "danger";
}

function refreshBadgeLabel(refresh: UiRefreshMetadata, locale: Locale) {
  const freshness = copy(
    locale,
    refresh.dataFreshness.toUpperCase(),
    formatOpsCodeLabel(locale, refresh.dataFreshness),
  );

  return `${freshness} · T3 · 15s`;
}

function refreshBody(refresh: UiRefreshMetadata, locale: Locale) {
  return copy(
    locale,
    `Snapshot ${formatLongDateTime(locale, refresh.generatedAt)} UTC from ${refresh.source}.`,
    `快照於 ${formatLongDateTime(locale, refresh.generatedAt)} UTC 產生，來源 ${formatOpsCodeLabel(locale, refresh.source)}。`,
  );
}

function synthesizeRefreshMetadata(
  generatedAt: string,
  freshness: UiRefreshMetadata["dataFreshness"] = "fresh",
): UiRefreshMetadata {
  return {
    generatedAt,
    staleAfterMs: REFRESH_STALE_AFTER_MS,
    dataFreshness: freshness,
    source: "live",
  };
}

function normalizeShiftPayload(
  payload: ShiftListPayload | null,
  fallbackGeneratedAt: string,
): ShiftListEnvelope {
  if (!payload) {
    return {
      items: [],
      refresh: synthesizeRefreshMetadata(fallbackGeneratedAt, "unknown"),
    };
  }

  if (Array.isArray(payload)) {
    return {
      items: payload,
      refresh: synthesizeRefreshMetadata(fallbackGeneratedAt, "fresh"),
    };
  }

  const normalized: ShiftListEnvelope = {
    items: payload.items ?? [],
    refresh:
      payload.refresh ??
      synthesizeRefreshMetadata(fallbackGeneratedAt, "fresh"),
  };

  if (payload.health) {
    normalized.health = payload.health;
  }
  if (payload.emptyState) {
    normalized.emptyState = payload.emptyState;
  }

  return normalized;
}

async function loadWithError<T>(
  loader: () => Promise<T>,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeLegacyHealthStatus(status: string | undefined) {
  if (status === "healthy" || status === "ok") return "healthy";
  if (status === "down" || status === "unhealthy") return "down";
  if (status === "degraded") return "degraded";
  return "degraded";
}

function normalizeHealthPayload(payload: unknown): UiHealthEnvelope | null {
  const unwrapped =
    isRecord(payload) && "data" in payload ? payload.data : payload;

  if (!isRecord(unwrapped)) {
    return null;
  }

  if (
    typeof unwrapped.status === "string" &&
    Array.isArray(unwrapped.degradedServices) &&
    typeof unwrapped.lastCheckedAt === "string"
  ) {
    return {
      status:
        unwrapped.status === "healthy" ||
        unwrapped.status === "degraded" ||
        unwrapped.status === "down"
          ? unwrapped.status
          : "degraded",
      degradedServices: unwrapped.degradedServices
        .filter(isRecord)
        .map((entry) => ({
          service: String(entry.service ?? "service"),
          impact: String(entry.impact ?? "degraded"),
          severity: entry.severity === "critical" ? "critical" : "warning",
        })),
      lastCheckedAt: unwrapped.lastCheckedAt,
    };
  }

  if (typeof unwrapped.status === "string") {
    const timestamp =
      typeof unwrapped.timestamp === "string"
        ? unwrapped.timestamp
        : new Date().toISOString();
    const service =
      typeof unwrapped.service === "string" ? unwrapped.service : "api";
    const normalizedStatus = normalizeLegacyHealthStatus(unwrapped.status);

    return {
      status: normalizedStatus,
      degradedServices:
        normalizedStatus === "healthy"
          ? []
          : [
              {
                service,
                impact: `health=${unwrapped.status}`,
                severity: normalizedStatus === "down" ? "critical" : "warning",
              },
            ],
      lastCheckedAt: timestamp,
    };
  }

  return null;
}

async function loadHealthEnvelope(): Promise<HealthLoadResult> {
  const apiBaseUrl = process.env.DRTS_API_URL ?? "http://localhost:3001";

  try {
    const response = await fetch(new URL("/api/health", apiBaseUrl), {
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        health: {
          status: "down",
          degradedServices: [
            {
              service: "api",
              impact: `status=${response.status}`,
              severity: "critical",
            },
          ],
          lastCheckedAt: new Date().toISOString(),
        },
        error: `health status ${response.status}`,
      };
    }

    const payload = await response.json();
    return { health: normalizeHealthPayload(payload), error: null };
  } catch (error) {
    return {
      health: {
        status: "down",
        degradedServices: [
          {
            service: "api",
            impact:
              error instanceof Error ? error.message : "health fetch failed",
            severity: "critical",
          },
        ],
        lastCheckedAt: new Date().toISOString(),
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function mergeHealthSignals(
  baseHealth: UiHealthEnvelope | null,
  supplementalServices: UiHealthEnvelope["degradedServices"],
): UiHealthEnvelope | null {
  if (!baseHealth && supplementalServices.length === 0) {
    return null;
  }

  const degradedServices = [
    ...(baseHealth?.degradedServices ?? []),
    ...supplementalServices,
  ];

  if (degradedServices.length === 0 && baseHealth?.status === "healthy") {
    return baseHealth;
  }

  const status =
    baseHealth?.status === "down" ||
    degradedServices.some((service) => service.severity === "critical")
      ? "down"
      : degradedServices.length > 0
        ? "degraded"
        : "healthy";

  return {
    status,
    degradedServices,
    lastCheckedAt: baseHealth?.lastCheckedAt ?? new Date().toISOString(),
  };
}

function actionTone(action: ResourceActionDescriptor): CanvasTone {
  if (!action.enabled) {
    return "neutral";
  }
  if (action.riskLevel === "high") return "danger";
  if (action.riskLevel === "medium") return "warn";
  return "accent";
}

function actionLabel(action: ResourceActionDescriptor, locale: Locale) {
  switch (action.action) {
    case "open_driver_detail":
      return copy(locale, "Driver detail", "司機詳情");
    case "open_vehicle_detail":
      return copy(locale, "Vehicle detail", "車輛詳情");
    case "review_attendance":
      return copy(locale, "Attendance record", "出勤記錄");
    default:
      return formatOpsCodeLabel(locale, action.action);
  }
}

function actionReason(action: ResourceActionDescriptor, locale: Locale) {
  if (!action.disabledReasonCode) {
    return null;
  }
  return formatOpsCodeLabel(locale, action.disabledReasonCode);
}

function synthesizeAvailableActions(row: {
  driverId: string;
  vehicleId: string | null;
  hasAttendance: boolean;
}): ResourceActionDescriptor[] {
  const actions: ResourceActionDescriptor[] = [
    { action: "open_driver_detail", enabled: true, riskLevel: "low" },
  ];

  if (row.vehicleId) {
    actions.push({
      action: "open_vehicle_detail",
      enabled: true,
      riskLevel: "low",
    });
  } else {
    actions.push({
      action: "open_vehicle_detail",
      enabled: false,
      disabledReasonCode: "no_vehicle_bound",
      riskLevel: "low",
    });
  }

  return actions;
}

function resolveAppOrigin(targetApp: CrossAppResourceLink["targetApp"]) {
  const envCandidates =
    targetApp === "platform-admin"
      ? [
          process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
          process.env.PLATFORM_ADMIN_ORIGIN,
        ]
      : targetApp === "tenant-console"
        ? [
            process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN,
            process.env.TENANT_CONSOLE_ORIGIN,
          ]
        : [
            process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN,
            process.env.OPS_CONSOLE_ORIGIN,
          ];
  const resolved = envCandidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (resolved) {
    return resolved.replace(/\/$/, "");
  }

  if (targetApp === "platform-admin") return "http://localhost:3002";
  if (targetApp === "tenant-console") return "http://localhost:3004";
  return "http://localhost:3003";
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  if (link.route.startsWith("http://") || link.route.startsWith("https://")) {
    return link.route;
  }

  return `${resolveAppOrigin(link.targetApp)}${
    link.route.startsWith("/") ? link.route : `/${link.route}`
  }`;
}

function buildActionHref(
  action: ResourceActionDescriptor,
  row: ShiftRow,
): string | null {
  switch (action.action) {
    case "open_driver_detail":
      return row.driverLink;
    case "open_vehicle_detail":
      return row.vehicleLink;
    case "review_attendance":
      return row.driverLink;
    default:
      return null;
  }
}

function buildEmptyStateViewModel(
  reason: EmptyReason,
  locale: Locale,
  filters: AttendanceFilters,
  rawMessage: string | null,
) {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info" as const,
        icon: "attendance" as const,
        title: copy(locale, "Schedule not loaded yet", "班表尚未載入"),
        description: copy(
          locale,
          "The shift schedule for this service day has not been provisioned. Confirm the roster import before triaging supply.",
          "此服務日的班表尚未建立，請先確認排班匯入再判讀供給狀態。",
        ),
        actionLabel: copy(locale, "Open driver registry", "前往司機主檔"),
        actionHref: "/drivers",
        actionNewTab: false,
      };
    case "fetch_failed":
      return {
        tone: "danger" as const,
        icon: "warn" as const,
        title: copy(locale, "Shift snapshot failed", "班次快照讀取失敗"),
        description:
          rawMessage ??
          copy(
            locale,
            "The shift-attendance endpoint did not return a usable payload.",
            "班次出勤端點未回傳可用內容。",
          ),
        actionLabel: copy(locale, "Retry", "重新整理"),
        actionHref: buildHref(filters, {}),
        actionNewTab: false,
      };
    case "permission_denied":
      return {
        tone: "warn" as const,
        icon: "users" as const,
        title: copy(locale, "Attendance scope denied", "無法存取出勤範圍"),
        description: copy(
          locale,
          "This actor can enter the shell but lacks shift-attendance read scope.",
          "目前帳號可進入殼層，但沒有班次出勤的讀取權限。",
        ),
        actionLabel: copy(locale, "Open ops dashboard", "返回儀表板"),
        actionHref: "/dashboard",
        actionNewTab: false,
      };
    case "external_unavailable":
      return {
        tone: "warn" as const,
        icon: "health" as const,
        title: copy(
          locale,
          "Attendance dependency unavailable",
          "出勤相依服務不可用",
        ),
        description: copy(
          locale,
          "Driver or attendance augmentation is degraded. Use the driver registry for the latest shift state.",
          "司機或出勤補充資料降級，請改用司機主檔確認最新班次狀態。",
        ),
        actionLabel: copy(locale, "Open driver registry", "前往司機主檔"),
        actionHref: "/drivers",
        actionNewTab: false,
      };
    case "filtered_empty":
      return {
        tone: "accent" as const,
        icon: "filter" as const,
        title: copy(
          locale,
          "No shifts match this slice",
          "目前條件沒有符合的班次",
        ),
        description: copy(
          locale,
          "Widen the date, driver search, status, or anomaly filters to restore results.",
          "放寬日期、司機搜尋、狀態或異常條件即可恢復結果。",
        ),
        actionLabel: copy(locale, "Clear filters", "清除條件"),
        actionHref: "/attendance",
        actionNewTab: false,
      };
    case "no_data":
    default:
      return {
        tone: "neutral" as const,
        icon: "attendance" as const,
        title: copy(locale, "No shifts on the clock", "目前沒有班次"),
        description: copy(
          locale,
          "The shift service is healthy but there are no shifts in this window — likely an off-day for the fleet.",
          "班次服務健康，但此區間沒有任何班次，車隊可能為休息日。",
        ),
        actionLabel: copy(locale, "Open dispatch board", "前往派車看板"),
        actionHref: "/dispatch",
        actionNewTab: false,
      };
  }
}

function buildGanttRows(
  rows: ShiftRow[],
  rangeStart: number,
  rangeEnd: number,
  now: number,
): GanttRow[] {
  return rows
    .filter((row) =>
      intersectsRange(row.clockedInAt, row.clockedOutAt, rangeStart, rangeEnd),
    )
    .sort((left, right) => {
      const leftPriority =
        left.status === "active" ? 0 : left.status === "completed" ? 1 : 2;
      const rightPriority =
        right.status === "active" ? 0 : right.status === "completed" ? 1 : 2;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return left.clockedInAt.localeCompare(right.clockedInAt);
    })
    .slice(0, 8)
    .map((row) => {
      const startTime = Math.max(
        asTime(row.clockedInAt) ?? rangeStart,
        rangeStart,
      );
      const rawEndTime =
        asTime(row.clockedOutAt) ??
        (row.status === "active"
          ? Math.min(now, rangeEnd)
          : startTime + HOUR_MS);
      const endTime = Math.max(
        startTime + 30 * 60 * 1000,
        Math.min(rawEndTime, rangeEnd),
      );
      const leftHours = (startTime - rangeStart) / HOUR_MS;
      const widthHours = Math.max((endTime - startTime) / HOUR_MS, 0.5);

      return {
        shiftId: row.shiftId,
        driverLabel: row.driverName,
        driverLink: row.driverLink,
        anomaly: row.anomaly,
        status: row.status,
        segmentLeft: (leftHours / 24) * 100,
        segmentWidth: (Math.min(widthHours, 24) / 24) * 100,
        startLabel: formatSegmentHour(leftHours),
        endLabel: formatSegmentHour(Math.min(leftHours + widthHours, 24)),
      };
    });
}

function renderAction(
  action: ResourceActionDescriptor,
  row: ShiftRow,
  locale: Locale,
  key: string,
): ReactNode {
  const label = actionLabel(action, locale);
  const href = action.enabled ? buildActionHref(action, row) : null;
  const reason = actionReason(action, locale);

  return (
    <div key={key} style={{ display: "grid", gap: 3 }}>
      {href ? (
        <Link href={href} style={linkButtonStyle(actionTone(action))}>
          {label}
        </Link>
      ) : (
        <span
          style={linkButtonStyle(actionTone(action), true)}
          title={reason ?? undefined}
        >
          {label}
        </span>
      )}
      {!action.enabled && reason ? (
        <span style={mutedTextStyle}>{reason}</span>
      ) : null}
    </div>
  );
}

function buildColumns(locale: Locale): CanvasTableColumn<ShiftRow>[] {
  return [
    {
      h: copy(locale, "SHIFT", "班次"),
      w: 170,
      r: (row) => (
        <div style={stackStyle}>
          <span style={{ ...primaryTextStyle, ...monoTextStyle }}>
            {row.shiftId}
          </span>
          {row.attendanceDate ? (
            <span style={secondaryTextStyle}>{row.attendanceDate}</span>
          ) : null}
          {row.anomaly ? (
            <Pill theme={theme} tone="warn" dot>
              {copy(locale, "anomaly", "異常")}
            </Pill>
          ) : null}
        </div>
      ),
    },
    {
      h: copy(locale, "DRIVER", "司機"),
      w: 190,
      r: (row) => (
        <div style={stackStyle}>
          <Link href={row.driverLink} style={linkButtonStyle("accent")}>
            {row.driverName}
          </Link>
          <span style={{ ...secondaryTextStyle, ...monoTextStyle }}>
            {row.driverId}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "VEHICLE", "車輛"),
      w: 130,
      r: (row) =>
        row.vehicleLink ? (
          <Link href={row.vehicleLink} style={linkButtonStyle("info")}>
            {row.vehicleLabel}
          </Link>
        ) : (
          <span style={mutedTextStyle}>
            {copy(locale, "Unbound", "未綁定")}
          </span>
        ),
    },
    {
      h: copy(locale, "SCHEDULED", "排定"),
      w: 150,
      r: (row) => (
        <div style={stackStyle}>
          <span style={{ ...secondaryTextStyle, ...monoTextStyle }}>
            {row.scheduledStartLabel} → {row.scheduledEndLabel}
          </span>
          <span style={mutedTextStyle}>
            {copy(locale, "planned window", "排定時段")}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "ACTUAL", "實際"),
      w: 160,
      r: (row) => (
        <div style={stackStyle}>
          <span style={{ ...secondaryTextStyle, ...monoTextStyle }}>
            {row.actualStartLabel} → {row.actualEndLabel}
          </span>
          <span style={mutedTextStyle}>{row.hoursLabel}</span>
        </div>
      ),
    },
    {
      h: copy(locale, "STATUS", "狀態"),
      w: 170,
      r: (row) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Pill theme={theme} tone={row.statusTone} dot>
            {row.statusLabel}
          </Pill>
          {row.attendanceStatusLabel ? (
            <Pill theme={theme} tone={row.attendanceTone}>
              {row.attendanceStatusLabel}
            </Pill>
          ) : null}
          {row.anomalyReasonLabel ? (
            <span style={tinyMetaStyle("warn")}>{row.anomalyReasonLabel}</span>
          ) : null}
        </div>
      ),
    },
    {
      h: copy(locale, "ACTIONS", "操作"),
      w: 180,
      r: (row) => (
        <div style={actionStackStyle}>
          {row.availableActions.length > 0 ? (
            row.availableActions
              .slice(0, 2)
              .map((action, index) =>
                renderAction(
                  action,
                  row,
                  locale,
                  `${row.shiftId}-${action.action}-${index}`,
                ),
              )
          ) : (
            <span style={mutedTextStyle}>
              {copy(locale, "Read-only", "唯讀")}
            </span>
          )}
          {row.crossAppLinks.slice(0, 1).map((link) => (
            <Link
              key={`${row.shiftId}-${link.label}`}
              href={buildCrossAppHref(link)}
              target={link.openMode === "new_tab" ? "_blank" : undefined}
              rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
              style={linkButtonStyle("info")}
            >
              {link.label}
              {link.openMode === "new_tab" ? (
                <CanvasIcon name="ext" size={11} />
              ) : null}
            </Link>
          ))}
        </div>
      ),
    },
  ];
}

function renderTab(
  href: string,
  label: string,
  count: number,
  tone: CanvasTone,
  selected: boolean,
) {
  return (
    <Link
      href={href}
      style={{
        color: selected ? theme.text : theme.textMuted,
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span>{label}</span>
      <span style={tinyMetaStyle(tone)}>{count}</span>
    </Link>
  );
}

export default async function AttendancePage({
  searchParams,
}: AttendancePageProps) {
  const resolvedSearchParams = await (searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>));
  const filters = resolveFilters(resolvedSearchParams);
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  const requestStartedAt = new Date().toISOString();
  const nowDate = new Date();
  const now = nowDate.getTime();
  const todayStart = startOfUtcDay(nowDate);
  const todayEnd = todayStart + DAY_MS;
  const weekStart = todayStart - 6 * DAY_MS;
  const weekEnd = todayEnd;

  const [shiftsResult, attendanceResult, driversResult, healthResult] =
    await Promise.all([
      loadWithError(() =>
        client.get<ShiftListPayload>("/api/shift-attendance/shifts"),
      ),
      loadWithError(() => client.listAttendance()),
      loadWithError(() => client.listDrivers()),
      loadHealthEnvelope(),
    ]);

  const shiftPayload = normalizeShiftPayload(
    shiftsResult.data,
    requestStartedAt,
  );
  const attendanceRecords = attendanceResult.data ?? ([] as AttendanceRecord[]);
  const drivers = driversResult.data ?? ([] as DriverRegistryRecord[]);

  const degradedServices: UiHealthEnvelope["degradedServices"] = [];
  if (shiftsResult.error) {
    degradedServices.push({
      service: "shift_attendance",
      impact: shiftsResult.error,
      severity: "critical",
    });
  }
  if (attendanceResult.error) {
    degradedServices.push({
      service: "attendance_records",
      impact: attendanceResult.error,
      severity: "warning",
    });
  }
  if (driversResult.error) {
    degradedServices.push({
      service: "driver_registry",
      impact: driversResult.error,
      severity: "warning",
    });
  }
  if (healthResult.error) {
    degradedServices.push({
      service: "api",
      impact: healthResult.error,
      severity: "critical",
    });
  }

  const health = mergeHealthSignals(
    shiftPayload.health ?? healthResult.health,
    degradedServices,
  );

  const driverById = new Map<string, DriverRegistryRecord>();
  for (const driver of drivers) {
    driverById.set(driver.driverId, driver);
  }

  // Attendance is linked to shifts (packet §5.12: "Attendance records linked
  // to shifts"). Keep the latest record per shift for the status pill.
  const attendanceByShift = new Map<string, AttendanceRecord>();
  for (const record of attendanceRecords) {
    const existing = attendanceByShift.get(record.shiftId);
    if (!existing || record.date > existing.date) {
      attendanceByShift.set(record.shiftId, record);
    }
  }

  const allRows: ShiftRow[] = shiftPayload.items.map((shift) => {
    const driver = driverById.get(shift.driverId) ?? null;
    const attendance = attendanceByShift.get(shift.shiftId) ?? null;
    const driverName = shift.driverName ?? driver?.name ?? shift.driverId;
    const anomalyFromAttendance =
      attendance?.status === "absent" || attendance?.status === "partial";
    const anomaly =
      typeof shift.anomaly === "boolean"
        ? shift.anomaly
        : shift.status === "abandoned" || anomalyFromAttendance;
    const anomalyReasonCode =
      shift.anomalyReasonCode ??
      (shift.status === "abandoned"
        ? "shift_abandoned"
        : attendance?.status === "absent"
          ? "attendance_absent"
          : attendance?.status === "partial"
            ? "attendance_partial"
            : null);

    const provisional = {
      shiftId: shift.shiftId,
      driverId: shift.driverId,
      driverName,
      driverLink: `/drivers/${encodeURIComponent(shift.driverId)}`,
      vehicleId: shift.vehicleId,
      vehicleLink: shift.vehicleId
        ? `/vehicles/${encodeURIComponent(shift.vehicleId)}`
        : null,
      vehicleLabel: shift.vehicleLabel ?? shift.vehicleId ?? "—",
      status: shift.status,
      statusLabel: formatOpsCodeLabel(locale, shift.status),
      statusTone: shiftTone(shift.status),
      scheduledStartLabel: formatDateTime(locale, shift.scheduledStartAt),
      scheduledEndLabel: formatDateTime(locale, shift.scheduledEndAt),
      actualStartLabel: formatDateTime(locale, shift.clockedInAt),
      actualEndLabel: formatDateTime(locale, shift.clockedOutAt),
      hoursLabel:
        shift.totalHours != null
          ? t("attendance.hours", locale).replace(
              "{h}",
              shift.totalHours.toFixed(1),
            )
          : copy(locale, "in progress", "進行中"),
      attendanceStatusLabel: attendance
        ? formatOpsCodeLabel(locale, attendance.status)
        : null,
      attendanceTone: attendance
        ? attendanceTone(attendance.status)
        : ("neutral" as const),
      attendanceDate: attendance?.date ?? null,
      anomaly,
      anomalyReasonLabel: anomalyReasonCode
        ? formatOpsCodeLabel(locale, anomalyReasonCode)
        : null,
      clockedInAt: shift.clockedInAt,
      clockedOutAt: shift.clockedOutAt,
      crossAppLinks: shift.crossAppLinks ?? [],
    };

    const nextRow: ShiftRow = {
      ...provisional,
      availableActions:
        shift.availableActions && shift.availableActions.length > 0
          ? shift.availableActions
          : synthesizeAvailableActions({
              driverId: shift.driverId,
              vehicleId: shift.vehicleId,
              hasAttendance: Boolean(attendance),
            }),
    };

    return nextRow;
  });

  const todayRows = allRows.filter((row) =>
    intersectsRange(row.clockedInAt, row.clockedOutAt, todayStart, todayEnd),
  );
  const weekRows = allRows.filter((row) =>
    intersectsRange(row.clockedInAt, row.clockedOutAt, weekStart, weekEnd),
  );

  const scopeRows =
    filters.view === "week"
      ? weekRows
      : filters.view === "exceptions"
        ? weekRows.filter((row) => row.anomaly)
        : todayRows;

  // KPIs are computed on the scope before list filters narrow the table.
  const scheduledDrivers = new Set(scopeRows.map((row) => row.driverId)).size;
  const activeShifts = scopeRows.filter((row) => row.status === "active");
  const completedShifts = scopeRows.filter((row) => row.status === "completed");
  const anomalyRows = scopeRows.filter((row) => row.anomaly);
  const absentCount = scopeRows.filter((row) =>
    row.anomalyReasonLabel
      ? row.anomalyReasonLabel ===
        formatOpsCodeLabel(locale, "attendance_absent")
      : false,
  ).length;
  const activeRate =
    scopeRows.length > 0
      ? `${Math.round((activeShifts.length / scopeRows.length) * 100)}%`
      : copy(locale, "No records", "無記錄");

  const filteredRows = scopeRows.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) {
      return false;
    }
    if (filters.anomaly === "only" && !row.anomaly) {
      return false;
    }
    if (filters.anomaly === "clean" && row.anomaly) {
      return false;
    }
    if (!filters.q) {
      return true;
    }

    const haystack = [
      row.shiftId,
      row.driverId,
      row.driverName,
      row.vehicleId ?? "",
      row.statusLabel,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(filters.q.toLowerCase());
  });

  let emptyReason = filters.emptyReason;
  if (!emptyReason && filteredRows.length === 0) {
    if (shiftsResult.error) {
      emptyReason = /403|forbidden|permission|scope/i.test(shiftsResult.error)
        ? "permission_denied"
        : "fetch_failed";
    } else if (
      shiftPayload.emptyState?.reason &&
      isEmptyReason(shiftPayload.emptyState.reason)
    ) {
      emptyReason = shiftPayload.emptyState.reason;
    } else if (hasActiveFilters(filters)) {
      emptyReason = "filtered_empty";
    } else if (
      health &&
      health.status !== "healthy" &&
      health.degradedServices.some(
        (service) =>
          service.service === "attendance_records" ||
          service.service === "driver_registry",
      )
    ) {
      emptyReason = "external_unavailable";
    } else {
      emptyReason = "no_data";
    }
  }

  const displayedRows = emptyReason ? [] : filteredRows;
  const emptyView = emptyReason
    ? buildEmptyStateViewModel(
        emptyReason,
        locale,
        filters,
        shiftsResult.error ??
          (shiftPayload.emptyState?.messageCode
            ? formatOpsCodeLabel(locale, shiftPayload.emptyState.messageCode)
            : null),
      )
    : null;

  const refresh =
    shiftPayload.refresh ?? synthesizeRefreshMetadata(requestStartedAt);
  const refreshHref = buildHref(filters, {});

  const ganttRows = buildGanttRows(
    filters.view === "exceptions" ? scopeRows : todayRows,
    todayStart,
    todayEnd,
    now,
  );

  const tabs = [
    renderTab(
      buildHref(filters, { view: "today" }),
      copy(locale, "Today", "今日"),
      todayRows.length,
      "neutral",
      filters.view === "today",
    ),
    renderTab(
      buildHref(filters, { view: "week" }),
      copy(locale, "This week", "本週"),
      weekRows.length,
      "neutral",
      filters.view === "week",
    ),
    renderTab(
      buildHref(filters, { view: "exceptions" }),
      copy(locale, "Exceptions", "異常"),
      weekRows.filter((row) => row.anomaly).length,
      "danger",
      filters.view === "exceptions",
    ),
  ];
  const activeTabIndex =
    filters.view === "week" ? 1 : filters.view === "exceptions" ? 2 : 0;

  const columns = buildColumns(locale);

  return (
    <div style={{ background: theme.bg, color: theme.text, minHeight: "100%" }}>
      <PageHeader
        theme={theme}
        title={t("attendance.title", locale)}
        subtitle={formatCanvasDateLabel(locale, nowDate)}
        tabs={tabs}
        activeTab={tabs[activeTabIndex]}
        actions={
          <>
            <Pill
              theme={theme}
              tone={refresh.dataFreshness === "fresh" ? "success" : "warn"}
            >
              {refreshBadgeLabel(refresh, locale)}
            </Pill>
            <a href={refreshHref} style={buttonStyle("secondary")}>
              <CanvasIcon name="arrow" size={12} />
              {copy(locale, "Refresh", "重新整理")}
            </a>
            <Pill theme={theme} tone="neutral">
              {copy(locale, "Export", "匯出")}
            </Pill>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {health && health.status !== "healthy" ? (
          <Banner
            theme={theme}
            tone={health.status === "down" ? "danger" : "warn"}
            icon={health.status === "down" ? "warn" : "health"}
            title={copy(
              locale,
              "Attendance page is running degraded",
              "出勤頁面目前為降級模式",
            )}
            body={`${
              health.degradedServices
                .map((service) => `${service.service}: ${service.impact}`)
                .join(" · ") || "health unknown"
            } · ${copy(locale, "checked", "檢查時間")} ${formatLongDateTime(
              locale,
              health.lastCheckedAt,
            )} UTC`}
          />
        ) : null}

        {refresh.dataFreshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone={refresh.dataFreshness === "degraded" ? "warn" : "info"}
            icon={refresh.dataFreshness === "degraded" ? "warn" : "clock"}
            title={copy(
              locale,
              "Snapshot is not fresh",
              "目前顯示的快照非最新",
            )}
            body={refreshBody(refresh, locale)}
          />
        ) : null}

        {anomalyRows.length > 0 ? (
          <Banner
            theme={theme}
            tone={absentCount > 0 ? "danger" : "warn"}
            icon="warn"
            title={copy(
              locale,
              `${anomalyRows.length} attendance exceptions need follow-up`,
              `${anomalyRows.length} 筆出勤異常待追蹤`,
            )}
            body={copy(
              locale,
              `${absentCount} absent, ${
                anomalyRows.length - absentCount
              } partial / abandoned in the current scope.`,
              `目前範圍有 ${absentCount} 筆未到、${
                anomalyRows.length - absentCount
              } 筆部分出勤或中止。`,
            )}
            actions={
              filters.view !== "exceptions" ? (
                <Link
                  href={buildHref(filters, { view: "exceptions" })}
                  style={linkButtonStyle(absentCount > 0 ? "danger" : "warn")}
                >
                  {copy(locale, "Review exceptions", "檢視異常")}
                </Link>
              ) : undefined
            }
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={copy(locale, "Scheduled drivers", "排班司機")}
            value={scheduledDrivers}
          />
          <KPI
            theme={theme}
            label={t("attendance.activeShifts", locale)}
            value={activeShifts.length}
            sub={activeRate}
          />
          <KPI
            theme={theme}
            label={t("attendance.completedShifts", locale)}
            value={completedShifts.length}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Anomalies", "異常")}
            value={anomalyRows.length}
            delta={
              absentCount > 0
                ? copy(locale, `${absentCount} absent`, `${absentCount} 未到`)
                : undefined
            }
            deltaTone={anomalyRows.length > 0 ? "down" : "neutral"}
          />
        </div>

        <Card
          theme={theme}
          title={copy(locale, "Filters", "篩選")}
          subtitle={copy(
            locale,
            "Date view, driver search, status, and anomaly run on the same snapshot.",
            "日期檢視、司機搜尋、狀態與異常條件都套用同一份快照。",
          )}
        >
          <form method="get" style={{ display: "grid", gap: 0 }}>
            <input type="hidden" name="view" value={filters.view} />
            {filters.emptyReason ? (
              <input
                type="hidden"
                name="emptyReason"
                value={filters.emptyReason}
              />
            ) : null}
            <div style={filterGridStyle}>
              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Search", "搜尋")}
                </span>
                <input
                  name="q"
                  defaultValue={filters.q}
                  placeholder={copy(
                    locale,
                    "shift id, driver, vehicle",
                    "班次編號、司機、車輛",
                  )}
                  style={fieldStyle}
                />
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Status", "狀態")}
                </span>
                <select
                  name="status"
                  defaultValue={filters.status}
                  style={fieldStyle}
                >
                  <option value="all">{copy(locale, "All", "全部")}</option>
                  <option value="active">
                    {copy(locale, "Active", "進行中")}
                  </option>
                  <option value="completed">
                    {copy(locale, "Completed", "已完成")}
                  </option>
                  <option value="abandoned">
                    {copy(locale, "Abandoned", "中止")}
                  </option>
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Anomaly", "異常")}
                </span>
                <select
                  name="anomaly"
                  defaultValue={filters.anomaly}
                  style={fieldStyle}
                >
                  <option value="all">{copy(locale, "All", "全部")}</option>
                  <option value="only">
                    {copy(locale, "Anomalies only", "僅異常")}
                  </option>
                  <option value="clean">
                    {copy(locale, "Clean only", "僅正常")}
                  </option>
                </select>
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={buttonStyle("primary")}>
                  <CanvasIcon name="search" size={12} />
                  {copy(locale, "Apply", "套用")}
                </button>
                <Link
                  href={buildHref(filters, {
                    q: "",
                    status: "all",
                    anomaly: "all",
                    emptyReason: null,
                  })}
                  style={buttonStyle("ghost")}
                >
                  {copy(locale, "Reset", "重設")}
                </Link>
              </div>
            </div>
          </form>

          <div style={helperRowStyle}>
            <span style={helperTextStyle}>
              {copy(
                locale,
                `${displayedRows.length} visible / ${scopeRows.length} in scope`,
                `目前顯示 ${displayedRows.length} / 範圍內 ${scopeRows.length}`,
              )}
            </span>
            <span style={{ ...helperTextStyle, ...monoTextStyle }}>
              {copy(locale, "generated", "生成時間")} ·{" "}
              {formatLongDateTime(locale, refresh.generatedAt)} UTC
            </span>
            <span style={helperTextStyle}>
              {copy(
                locale,
                "row CTAs come from availableActions",
                "列 CTA 以 availableActions 為準",
              )}
            </span>
          </div>
        </Card>

        <Card
          theme={theme}
          title={copy(locale, "On-duty gantt · 0–24h", "當班甘特 · 0–24h")}
          actions={
            <>
              <Pill theme={theme} tone="info" dot>
                {copy(locale, "active", "進行中")}
              </Pill>
              <Pill theme={theme} tone="success" dot>
                {copy(locale, "completed", "已完成")}
              </Pill>
              {ganttRows.some((row) => row.anomaly) ? (
                <Pill theme={theme} tone="warn" dot>
                  {copy(locale, "anomaly", "異常")}
                </Pill>
              ) : null}
            </>
          }
          padding={16}
        >
          {ganttRows.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <div style={ganttGridStyle}>
                <div />
                <div style={ganttHeaderStyle}>
                  {Array.from({ length: 24 }, (_, index) => (
                    <span key={index} style={{ textAlign: "center" }}>
                      {index.toString().padStart(2, "0")}
                    </span>
                  ))}
                </div>

                {ganttRows.map((row) => {
                  const borderColor = row.anomaly
                    ? theme.warn
                    : row.status === "completed"
                      ? theme.success
                      : row.status === "abandoned"
                        ? theme.danger
                        : theme.accent;
                  const backgroundColor = row.anomaly
                    ? theme.warnBg
                    : row.status === "completed"
                      ? "rgba(52, 211, 153, 0.14)"
                      : row.status === "abandoned"
                        ? "rgba(248, 113, 113, 0.14)"
                        : theme.accentBg;

                  return (
                    <div key={row.shiftId} style={{ display: "contents" }}>
                      <div
                        style={{
                          padding: "6px 0",
                          borderBottom: `1px dashed ${theme.border}`,
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {row.anomaly ? (
                          <Pill theme={theme} tone="warn" dot>
                            {copy(locale, "anomaly", "異常")}
                          </Pill>
                        ) : null}
                        <Link
                          href={row.driverLink}
                          style={{
                            flex: 1,
                            color: theme.text,
                            textDecoration: "none",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.driverLabel}
                        </Link>
                      </div>
                      <div
                        style={{
                          position: "relative",
                          height: 28,
                          borderBottom: `1px dashed ${theme.border}`,
                        }}
                      >
                        <div style={ganttTrackStyle}>
                          {Array.from({ length: 24 }, (_, index) => (
                            <span
                              key={index}
                              style={{
                                borderLeft:
                                  index === 0
                                    ? "none"
                                    : `1px solid ${theme.border}`,
                                opacity: 0.45,
                              }}
                            />
                          ))}
                        </div>
                        <div
                          style={{
                            ...ganttSegmentBaseStyle,
                            left: `${row.segmentLeft}%`,
                            width: `${row.segmentWidth}%`,
                            border: `1px solid ${borderColor}`,
                            background: backgroundColor,
                            color: borderColor,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span>
                            {row.startLabel}–{row.endLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
              {t("attendance.emptyShifts", locale)}
            </div>
          )}
        </Card>

        <Card
          theme={theme}
          title={copy(locale, "Shift & attendance", "班次與出勤")}
          subtitle={copy(
            locale,
            "Shift id, driver, vehicle, scheduled vs actual window, status, and linked attendance in one grid.",
            "在同一張表整合班次編號、司機、車輛、排定與實際時段、狀態與連結出勤。",
          )}
        >
          {emptyView ? (
            <div style={emptyStateStyle}>
              <CanvasIcon
                name={emptyView.icon}
                size={26}
                style={{ color: toneColor(emptyView.tone) }}
              />
              <strong style={{ color: theme.text, fontSize: 15 }}>
                {emptyView.title}
              </strong>
              <span
                style={{
                  color: theme.textMuted,
                  maxWidth: 520,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {emptyView.description}
              </span>
              <Link
                href={emptyView.actionHref}
                target={emptyView.actionNewTab ? "_blank" : undefined}
                rel={emptyView.actionNewTab ? "noreferrer" : undefined}
                style={linkButtonStyle(emptyView.tone)}
              >
                {emptyView.actionLabel}
                {emptyView.actionNewTab ? (
                  <CanvasIcon name="ext" size={11} />
                ) : null}
              </Link>
              <span style={tinyMetaStyle(emptyView.tone)}>
                {copy(locale, "emptyReason", "空狀態")} ·{" "}
                {EMPTY_REASON_CODES[emptyReason ?? "no_data"]}
              </span>
            </div>
          ) : (
            <Table theme={theme} columns={columns} rows={displayedRows} />
          )}
        </Card>
      </div>
    </div>
  );
}
