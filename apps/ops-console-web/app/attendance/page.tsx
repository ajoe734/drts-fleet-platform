import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type {
  AttendanceRecord,
  ShiftRecord,
} from "@drts/contracts";
import type {
  EmptyReason,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasPrimitives,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type CanvasIconName = CanvasPrimitives.CanvasIconName;

// Refresh tier for /attendance per packet §5.12 + §3.2 (T3 medium / 15s).
export const revalidate = 15;

const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_CADENCE_MS = 15_000;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

type TabId = "today" | "week" | "anomaly";

type ShiftRow = Record<string, unknown> & {
  shiftId: string;
  driverId: string;
  shiftCell: ReactNode;
  driverCell: ReactNode;
  vehicleCell: ReactNode;
  scheduledCell: ReactNode;
  actualCell: ReactNode;
  durationCell: ReactNode;
  statusCell: ReactNode;
  anomalyCell: ReactNode;
};

type AttendanceRow = Record<string, unknown> & {
  attendanceId: string;
  attendanceCell: ReactNode;
  driverId: string;
  date: string;
  statusCell: ReactNode;
  hoursCell: ReactNode;
  windowCell: ReactNode;
};

const pageBodyStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const filterBarStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  gap: 10,
};

const inlineMonoStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11,
  color: theme.textDim,
};

const subtitleRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  gap: 8,
  marginTop: 4,
};

// ─────────────────────────────────────────────────────────────────────────────
// Time helpers
// ─────────────────────────────────────────────────────────────────────────────

function copy(locale: Locale, en: string, zh: string): string {
  return locale === "zh" ? zh : en;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(reference: Date): Date {
  const d = new Date(reference);
  const day = d.getUTCDay();
  // Monday-start week. Sunday (0) → 6 days back.
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function weekdayLabel(locale: Locale, d: Date): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    weekday: "long",
  }).format(d);
}

function dateHeading(locale: Locale, d: Date): string {
  const ymd = isoDate(d);
  return locale === "zh"
    ? `${ymd} (${weekdayLabel(locale, d)})`
    : `${ymd} · ${weekdayLabel(locale, d)}`;
}

function formatTimeUtc(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function formatDateTimeUtc(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return `${value.slice(0, 10)} ${formatTimeUtc(value)}`;
  } catch {
    return "—";
  }
}

function formatHours(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}h`;
}

function shiftDurationHours(shift: ShiftRecord, now: Date): number {
  if (typeof shift.totalHours === "number") return shift.totalHours;
  const end = shift.clockedOutAt ? new Date(shift.clockedOutAt) : now;
  const start = new Date(shift.clockedInAt);
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return diff > 0 ? diff : 0;
}

function ganttPercent(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return Math.max(0, Math.min(100, (minutes / (24 * 60)) * 100));
}

// ─────────────────────────────────────────────────────────────────────────────
// Anomaly detection
// ─────────────────────────────────────────────────────────────────────────────

const LONG_RUNNING_THRESHOLD_HOURS = 10;

type ShiftAnomalyKind =
  | "no_vehicle"
  | "long_running"
  | "abandoned"
  | "no_location";

function detectShiftAnomalies(
  shift: ShiftRecord,
  now: Date,
): ShiftAnomalyKind[] {
  const flags: ShiftAnomalyKind[] = [];
  if (shift.status === "abandoned") {
    flags.push("abandoned");
  }
  if (shift.status === "active" && !shift.vehicleId) {
    flags.push("no_vehicle");
  }
  if (
    shift.status === "active" &&
    shiftDurationHours(shift, now) >= LONG_RUNNING_THRESHOLD_HOURS
  ) {
    flags.push("long_running");
  }
  if (shift.status === "active" && !shift.startLocation) {
    flags.push("no_location");
  }
  return flags;
}

function anomalyLabel(locale: Locale, kind: ShiftAnomalyKind): string {
  switch (kind) {
    case "no_vehicle":
      return copy(locale, "missing vehicle", "未掛車");
    case "long_running":
      return copy(locale, "≥10h on shift", "連續上班 ≥10h");
    case "abandoned":
      return copy(locale, "abandoned shift", "班次中斷");
    case "no_location":
      return copy(locale, "no location ping", "未回報定位");
  }
}

function isAnomalousAttendance(record: AttendanceRecord): boolean {
  return record.status === "partial" || record.status === "absent";
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state classification (Q-X15 — 6 reasons rendered distinctly)
// ─────────────────────────────────────────────────────────────────────────────

function classifyShiftsEmpty(
  error: Error | null,
  hasAnyShift: boolean,
  hasAnyFiltered: boolean,
  filtersApplied: boolean,
  todayHasNone: boolean,
): EmptyStateEnvelope | null {
  if (hasAnyFiltered) return null;
  if (error) {
    const message = error.message ?? "";
    if (/403|forbidden|permission/i.test(message)) {
      return {
        reason: "permission_denied",
        messageCode: "attendance.empty.permission_denied",
      };
    }
    if (/ENOTFOUND|ECONNREFUSED|fetch failed|network/i.test(message)) {
      return {
        reason: "external_unavailable",
        messageCode: "attendance.empty.external_unavailable",
      };
    }
    return {
      reason: "fetch_failed",
      messageCode: "attendance.empty.fetch_failed",
    };
  }
  if (filtersApplied && hasAnyShift) {
    return {
      reason: "filtered_empty",
      messageCode: "attendance.empty.filtered_empty",
    };
  }
  if (!hasAnyShift) {
    return {
      reason: "not_provisioned",
      messageCode: "attendance.empty.not_provisioned",
    };
  }
  if (todayHasNone) {
    return {
      reason: "no_data",
      messageCode: "attendance.empty.no_data",
    };
  }
  return null;
}

interface EmptyStateView {
  tone: Exclude<CanvasTone, "neutral">;
  icon: "warn" | "clock" | "health" | "ok" | "phone";
  title: string;
  body: string;
  cta?: { href: string; label: string; external?: boolean };
}

function describeEmptyState(
  locale: Locale,
  envelope: EmptyStateEnvelope,
): EmptyStateView {
  switch (envelope.reason) {
    case "no_data":
      return {
        tone: "info",
        icon: "ok",
        title: copy(locale, "No shifts scheduled today", "今天沒有排班"),
        body: copy(
          locale,
          "Off-day for this scope — switch tabs to see the wider window.",
          "目前範圍為非排班日，可切換至「本週」查看更廣的區間。",
        ),
      };
    case "not_provisioned":
      return {
        tone: "warn",
        icon: "warn",
        title: copy(locale, "Schedule not loaded yet", "排班尚未匯入"),
        body: copy(
          locale,
          "Shift/attendance service has not received any roster — confirm with planning.",
          "班次出勤服務尚未取得任何排班資料，請與排班專員確認。",
        ),
        cta: {
          href: "/reports?type=attendance",
          label: copy(locale, "Open reports", "前往報表"),
        },
      };
    case "fetch_failed":
      return {
        tone: "danger",
        icon: "warn",
        title: copy(locale, "Could not load attendance", "出勤資料讀取失敗"),
        body: copy(
          locale,
          "Backend returned an error — refresh, or open the duty handbook.",
          "後端讀取失敗，請按重新整理或聯絡值班窗口。",
        ),
        cta: {
          href: "/attendance",
          label: copy(locale, "Try again", "重新整理"),
        },
      };
    case "permission_denied":
      return {
        tone: "warn",
        icon: "warn",
        title: copy(
          locale,
          "Attendance scope is not granted",
          "此帳號未取得出勤檢視權限",
        ),
        body: copy(
          locale,
          "Ask an ops_manager to grant the ops_manager / ops_dispatcher role for attendance.",
          "請洽 ops_manager 開通 ops_manager / ops_dispatcher 角色。",
        ),
      };
    case "external_unavailable":
      return {
        tone: "danger",
        icon: "warn",
        title: copy(
          locale,
          "Shift-attendance adapter is down",
          "班次/出勤介面服務中斷",
        ),
        body: copy(
          locale,
          "Upstream service is unreachable. Try again later or check api-health.",
          "上游服務目前無法連線，請稍後重試或檢視 api 健康狀態。",
        ),
      };
    case "filtered_empty":
      return {
        tone: "info",
        icon: "clock",
        title: copy(
          locale,
          "No shifts match these filters",
          "此篩選條件下沒有任何班次",
        ),
        body: copy(
          locale,
          "Loosen the date / driver / anomaly filter to see more.",
          "可放寬日期、司機或異常條件。",
        ),
      };
    case "driver_not_eligible":
      // Not applicable to ops attendance; render generic info.
      return {
        tone: "warn",
        icon: "warn",
        title: copy(locale, "Driver not eligible", "司機尚未取得資格"),
        body: copy(
          locale,
          "Not used on ops attendance.",
          "本頁未使用此狀態。",
        ),
      };
  }
}

function EmptyStateBanner({
  locale,
  envelope,
}: {
  locale: Locale;
  envelope: EmptyStateEnvelope;
}) {
  const view = describeEmptyState(locale, envelope);
  return (
    <Banner
      theme={theme}
      tone={view.tone}
      icon={<CanvasIcon name={view.icon} size={16} />}
      title={view.title}
      body={
        <div>
          <div>{view.body}</div>
          <code style={inlineMonoStyle}>
            EmptyReason: {envelope.reason} · {envelope.messageCode}
          </code>
        </div>
      }
      actions={
        view.cta ? (
          <Link href={view.cta.href} style={{ textDecoration: "none" }}>
            <Btn theme={theme} variant="primary">
              {view.cta.label}
            </Btn>
          </Link>
        ) : null
      }
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ResourceActionDescriptor (Q-X13) — render filter / nav / export CTAs from
// descriptors so the page already speaks the contract surface. Real backend
// will populate availableActions per resource; for now the page synthesises
// descriptors per its read-mostly action surface (§5.12).
// ─────────────────────────────────────────────────────────────────────────────

function buildPageActions(
  locale: Locale,
  anomalyCount: number,
): {
  refresh: ResourceActionDescriptor;
  export: ResourceActionDescriptor;
  escalateToIncidents: ResourceActionDescriptor;
} {
  const escalateBase: ResourceActionDescriptor = {
    action: "open_incidents",
    enabled: anomalyCount > 0,
    riskLevel: "low",
  };
  return {
    refresh: { action: "refresh", enabled: true, riskLevel: "low" },
    export: { action: "export_attendance", enabled: true, riskLevel: "low" },
    escalateToIncidents:
      anomalyCount > 0
        ? escalateBase
        : { ...escalateBase, disabledReasonCode: "no_anomalies" },
  };
}

function DescriptorButton({
  descriptor,
  href,
  label,
  icon,
  variant = "secondary",
  external,
}: {
  descriptor: ResourceActionDescriptor;
  href: string;
  label: string;
  icon?: CanvasIconName;
  variant?: "primary" | "secondary" | "ghost";
  external?: boolean;
}) {
  const button = (
    <Btn
      theme={theme}
      variant={variant}
      disabled={!descriptor.enabled}
      {...(icon ? { icon } : {})}
    >
      {label}
      {external ? (
        <CanvasIcon
          name="ext"
          size={10}
          style={{ marginLeft: 4, opacity: 0.7 }}
        />
      ) : null}
    </Btn>
  );

  if (!descriptor.enabled) {
    const tooltip = descriptor.disabledReasonCode
      ? `disabled: ${descriptor.disabledReasonCode}`
      : "disabled";
    return (
      <span title={tooltip} style={{ display: "inline-flex" }}>
        {button}
      </span>
    );
  }

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "none" }}
      >
        {button}
      </a>
    );
  }

  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      {button}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh metadata + health envelope synthesis (until backend emits them
// natively per Q-X01 / Q-X12).
// ─────────────────────────────────────────────────────────────────────────────

function buildRefreshMetadata(
  now: Date,
  error: Error | null,
): UiRefreshMetadata {
  return {
    generatedAt: now.toISOString(),
    staleAfterMs: REFRESH_CADENCE_MS,
    dataFreshness: error ? "degraded" : "fresh",
    source: "live",
  };
}

function buildHealthEnvelope(
  now: Date,
  error: Error | null,
): UiHealthEnvelope {
  if (!error) {
    return {
      status: "healthy",
      degradedServices: [],
      lastCheckedAt: now.toISOString(),
    };
  }
  return {
    status: "degraded",
    degradedServices: [
      {
        service: "shift-attendance",
        impact: error.message ?? "fetch failed",
        severity: "warning",
      },
    ],
    lastCheckedAt: now.toISOString(),
  };
}

function freshnessTone(freshness: UiRefreshMetadata["dataFreshness"]): CanvasTone {
  if (freshness === "fresh") return "success";
  if (freshness === "stale") return "warn";
  if (freshness === "degraded") return "danger";
  return "neutral";
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-app deep link helper (Q-X03). Attendance §5.12 only exits in-app, but
// header chrome may surface cross-app links (audit, reports) so we keep the
// affordance available.
// ─────────────────────────────────────────────────────────────────────────────

function CrossAppLink({
  href,
  label,
  newTab = true,
}: {
  href: string;
  label: string;
  newTab?: boolean;
}) {
  const linkStyle = {
    color: theme.accent,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontWeight: 600,
  };
  if (newTab) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
      >
        {label}
        <CanvasIcon name="ext" size={11} />
      </a>
    );
  }
  return (
    <Link href={href} style={linkStyle}>
      {label}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

interface AttendanceSearchParams {
  tab?: string;
  driverId?: string;
  date?: string;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams?: Promise<AttendanceSearchParams>;
}) {
  const [client, locale, rawParams] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
    searchParams
      ? Promise.resolve(searchParams)
      : Promise.resolve<AttendanceSearchParams>({}),
  ]);
  const params: AttendanceSearchParams = rawParams ?? {};

  const tab: TabId =
    params.tab === "week" || params.tab === "anomaly" ? params.tab : "today";
  const driverFilter = (params.driverId ?? "").trim();
  const requestedDate = (params.date ?? "").trim();
  const now = new Date();
  const referenceDate = requestedDate
    ? new Date(`${requestedDate}T00:00:00.000Z`)
    : now;

  let shifts: ShiftRecord[] = [];
  let attendance: AttendanceRecord[] = [];
  let fetchError: Error | null = null;

  try {
    const [shiftsResult, attendanceResult] = await Promise.all([
      driverFilter ? client.listShifts(driverFilter) : client.listShifts(),
      driverFilter
        ? client.listAttendance(driverFilter)
        : client.listAttendance(),
    ]);
    shifts = (shiftsResult as { items?: ShiftRecord[] })?.items ?? shiftsResult;
    attendance =
      (attendanceResult as { items?: AttendanceRecord[] })?.items ??
      attendanceResult;
  } catch (e) {
    fetchError =
      e instanceof Error ? e : new Error(t("common.unknown", locale));
  }

  const refreshMetadata = buildRefreshMetadata(now, fetchError);
  const healthEnvelope = buildHealthEnvelope(now, fetchError);

  // Scope shifts to the active tab.
  const todayKey = isoDate(referenceDate);
  const weekStart = startOfWeek(referenceDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  function inToday(shift: ShiftRecord): boolean {
    return shift.clockedInAt.slice(0, 10) === todayKey;
  }
  function inWeek(shift: ShiftRecord): boolean {
    const ts = new Date(shift.clockedInAt).getTime();
    return ts >= weekStart.getTime() && ts < weekEnd.getTime();
  }

  const todayShifts = shifts.filter(inToday);

  let scopedShifts: ShiftRecord[];
  if (tab === "today") {
    scopedShifts = todayShifts;
  } else if (tab === "week") {
    scopedShifts = shifts.filter(inWeek);
  } else {
    scopedShifts = shifts.filter(
      (shift) => detectShiftAnomalies(shift, now).length > 0,
    );
  }

  // KPIs (computed from `todayShifts` so the headline number is stable across
  // tabs; tab affects only the table/gantt scope).
  const uniqueDriversToday = new Set(todayShifts.map((s) => s.driverId)).size;
  const activeShiftsCount = todayShifts.filter(
    (s) => s.status === "active",
  ).length;
  const completedShiftsCount = todayShifts.filter(
    (s) => s.status === "completed",
  ).length;
  const absentToday = attendance.filter(
    (record) => record.date === todayKey && record.status === "absent",
  ).length;
  const anomalyShiftsToday = todayShifts.filter(
    (shift) => detectShiftAnomalies(shift, now).length > 0,
  ).length;
  const anomalyTotal = anomalyShiftsToday + absentToday;

  const sortedScoped = [...scopedShifts].sort((a, b) =>
    b.clockedInAt.localeCompare(a.clockedInAt),
  );

  const ganttScope = todayShifts.length > 0 ? todayShifts : sortedScoped.slice(0, 12);

  // Empty-state classification per Q-X15.
  const filtersApplied = Boolean(driverFilter) || tab !== "today";
  const shiftsEmptyEnvelope = classifyShiftsEmpty(
    fetchError,
    shifts.length > 0,
    scopedShifts.length > 0,
    filtersApplied,
    todayShifts.length === 0,
  );

  const recentAttendance = [...attendance]
    .sort((left, right) =>
      `${right.date}${right.clockedInAt}`.localeCompare(
        `${left.date}${left.clockedInAt}`,
      ),
    )
    .slice(0, 12);

  const attendanceEmptyEnvelope = classifyShiftsEmpty(
    fetchError,
    attendance.length > 0,
    recentAttendance.length > 0,
    false,
    todayShifts.length === 0,
  );

  const actions = buildPageActions(locale, anomalyTotal);

  // ── Subtitle (date + refresh tier + freshness + lastCheckedAt) ────────────
  const subtitle = (
    <span style={subtitleRowStyle}>
      <span>{dateHeading(locale, referenceDate)}</span>
      <Pill theme={theme} tone="info" dot>
        {copy(locale, "refresh", "刷新")} · {REFRESH_TIER} ·{" "}
        {Math.round(REFRESH_CADENCE_MS / 1000)}s
      </Pill>
      <Pill theme={theme} tone={freshnessTone(refreshMetadata.dataFreshness)} dot>
        {refreshMetadata.dataFreshness}
      </Pill>
      <span style={inlineMonoStyle}>
        {copy(locale, "last", "最後")}{" "}
        {formatDateTimeUtc(refreshMetadata.generatedAt)} UTC ·{" "}
        {copy(locale, "source", "來源")} {refreshMetadata.source}
      </span>
      {healthEnvelope.status !== "healthy" ? (
        <Pill theme={theme} tone="danger" dot>
          {healthEnvelope.status}
        </Pill>
      ) : null}
    </span>
  );

  // ── Tabs (今日 / 本週 / 異常+badge) ───────────────────────────────────────
  function tabHref(target: TabId): string {
    const search = new URLSearchParams();
    if (target !== "today") search.set("tab", target);
    if (driverFilter) search.set("driverId", driverFilter);
    const query = search.toString();
    return query ? `/attendance?${query}` : "/attendance";
  }

  function TabLink({ id, label }: { id: TabId; label: ReactNode }) {
    const selected = id === tab;
    return (
      <Link
        href={tabHref(id)}
        style={{
          padding: "8px 12px",
          fontSize: 12.5,
          fontWeight: 500,
          color: selected ? theme.text : theme.textMuted,
          borderBottom: `2px solid ${selected ? theme.accent : "transparent"}`,
          marginBottom: -1,
          textDecoration: "none",
        }}
      >
        {label}
      </Link>
    );
  }

  const tabsNode = (
    <div style={{ display: "flex", gap: 0, marginTop: 14, marginLeft: -4 }}>
      <TabLink id="today" label={copy(locale, "Today", "今日")} />
      <TabLink id="week" label={copy(locale, "This week", "本週")} />
      <TabLink
        id="anomaly"
        label={
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            {copy(locale, "Anomalies", "異常")}
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 6,
                background: anomalyTotal > 0 ? theme.dangerBg : theme.neutralBg,
                color: anomalyTotal > 0 ? theme.danger : theme.textMuted,
                border: `1px solid ${
                  anomalyTotal > 0 ? theme.dangerBorder : theme.neutralBorder
                }`,
              }}
            >
              {anomalyTotal}
            </span>
          </span>
        }
      />
    </div>
  );

  // ── Shift table rows ──────────────────────────────────────────────────────
  const shiftRows: ShiftRow[] = sortedScoped.slice(0, 30).map((shift) => {
    const anomalies = detectShiftAnomalies(shift, now);
    return {
      shiftId: shift.shiftId,
      driverId: shift.driverId,
      shiftCell: (
        <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
          {shift.shiftId}
        </span>
      ),
      driverCell: (
        <Link
          href={`/drivers/${encodeURIComponent(shift.driverId)}`}
          style={{
            color: theme.accent,
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          {shift.driverId}
        </Link>
      ),
      vehicleCell: shift.vehicleId ? (
        <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
          {shift.vehicleId}
        </span>
      ) : (
        <Pill theme={theme} tone="warn" dot>
          {copy(locale, "no vehicle", "未掛車")}
        </Pill>
      ),
      // Scheduled start/end is not modelled by the Phase 1 ShiftRecord contract
      // (shifts are clock-in driven, see phase1_service_contracts ShiftRecord);
      // render an honest n/a rather than the page-level not_provisioned reason.
      scheduledCell: (
        <span
          title={copy(
            locale,
            "Scheduled roster not modelled in the Phase 1 ShiftRecord contract — shifts are clock-in driven.",
            "Phase 1 ShiftRecord 合約未建模排程班表 — 班次以打卡為準。",
          )}
          style={{
            fontFamily: theme.monoFamily,
            fontSize: 11.5,
            color: theme.textDim,
          }}
        >
          {copy(locale, "— no roster", "— 無排程")}
        </span>
      ),
      actualCell: (
        <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
          {formatTimeUtc(shift.clockedInAt)}–
          {formatTimeUtc(shift.clockedOutAt)}{" "}
          <span style={{ color: theme.textDim }}>
            ({shift.clockedInAt.slice(0, 10)})
          </span>
        </span>
      ),
      durationCell: (
        <Pill
          theme={theme}
          tone={
            shiftDurationHours(shift, now) >= LONG_RUNNING_THRESHOLD_HOURS
              ? "warn"
              : "info"
          }
          dot
        >
          {formatHours(shiftDurationHours(shift, now))}
        </Pill>
      ),
      statusCell: (
        <Pill
          theme={theme}
          tone={
            shift.status === "active"
              ? "info"
              : shift.status === "completed"
                ? "success"
                : "danger"
          }
          dot
        >
          {formatOpsCodeLabel(locale, shift.status)}
        </Pill>
      ),
      anomalyCell:
        anomalies.length > 0 ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {anomalies.map((kind) => (
              <Pill key={kind} theme={theme} tone="warn" dot>
                {anomalyLabel(locale, kind)}
              </Pill>
            ))}
          </div>
        ) : (
          <span style={{ color: theme.textDim, fontSize: 11 }}>—</span>
        ),
    };
  });

  const shiftColumns: CanvasTableColumn<ShiftRow>[] = [
    { h: copy(locale, "SHIFT", "班次"), k: "shiftCell", w: 120 },
    { h: copy(locale, "DRIVER", "司機"), k: "driverCell", w: 120 },
    { h: copy(locale, "VEHICLE", "車輛"), k: "vehicleCell", w: 130 },
    { h: copy(locale, "SCHEDULED", "排程"), k: "scheduledCell", w: 120 },
    { h: copy(locale, "ACTUAL", "實際"), k: "actualCell", w: 190 },
    { h: copy(locale, "DURATION", "時長"), k: "durationCell", w: 90 },
    { h: copy(locale, "STATUS", "狀態"), k: "statusCell", w: 110 },
    { h: copy(locale, "ANOMALY", "異常"), k: "anomalyCell" },
  ];

  // ── Attendance ledger rows ────────────────────────────────────────────────
  const attendanceRows: AttendanceRow[] = recentAttendance.map((record) => ({
    attendanceId: record.attendanceId,
    attendanceCell: (
      <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
        {record.attendanceId}
      </span>
    ),
    driverId: record.driverId,
    date: record.date,
    statusCell: (
      <Pill
        theme={theme}
        tone={
          record.status === "present"
            ? "success"
            : record.status === "partial"
              ? "warn"
              : "danger"
        }
        dot
      >
        {formatOpsCodeLabel(locale, record.status)}
      </Pill>
    ),
    hoursCell: (
      <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
        {formatHours(record.totalHours)}
      </span>
    ),
    windowCell: (
      <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
        {formatTimeUtc(record.clockedInAt)}–{formatTimeUtc(record.clockedOutAt)}
      </span>
    ),
  }));

  const attendanceColumns: CanvasTableColumn<AttendanceRow>[] = [
    { h: copy(locale, "ATTENDANCE", "出勤編號"), k: "attendanceCell", w: 180 },
    {
      h: copy(locale, "DRIVER", "司機"),
      k: "driverId",
      w: 110,
      mono: true,
    },
    { h: copy(locale, "DATE", "日期"), k: "date", w: 110, mono: true },
    { h: copy(locale, "WINDOW", "時段"), k: "windowCell", w: 130 },
    { h: copy(locale, "STATUS", "狀態"), k: "statusCell", w: 110 },
    { h: copy(locale, "HOURS", "工時"), k: "hoursCell", align: "right" },
  ];

  // ── Gantt rows (today's drivers) ──────────────────────────────────────────
  const ganttRows = ganttScope.slice(0, 10).map((shift) => {
    const startPct = ganttPercent(shift.clockedInAt) ?? 0;
    const endPct =
      shift.status === "active"
        ? Math.min(100, (now.getUTCHours() * 60 + now.getUTCMinutes()) / (24 * 60) * 100)
        : ganttPercent(shift.clockedOutAt) ?? Math.min(100, startPct + 4);
    const anomaly = detectShiftAnomalies(shift, now).length > 0;
    const ribbonTone = anomaly ? theme.warn : theme.accent;
    const ribbonBg = anomaly ? theme.warnBg : theme.accentBg;
    const ribbonBorder = anomaly ? theme.warnBorder : theme.accentBorder;
    return {
      shiftId: shift.shiftId,
      driverId: shift.driverId,
      vehicleId: shift.vehicleId,
      anomaly,
      startPct,
      endPct,
      ribbonTone,
      ribbonBg,
      ribbonBorder,
      clockedInAt: shift.clockedInAt,
      clockedOutAt: shift.clockedOutAt,
    };
  });

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("attendance.title", locale)}
        subtitle={subtitle}
        actions={
          <>
            <DescriptorButton
              descriptor={actions.escalateToIncidents}
              href="/incidents?filter=attendance"
              label={copy(locale, "Review incidents", "查看事故")}
              icon="warn"
            />
            <DescriptorButton
              descriptor={actions.export}
              href="/reports?type=attendance"
              label={copy(locale, "Export", "匯出")}
              icon="reports"
            />
            <DescriptorButton
              descriptor={actions.refresh}
              href={tabHref(tab)}
              label={t("common.refresh", locale)}
              icon="arrow"
              variant="primary"
            />
          </>
        }
      />

      {tabsNode}

      <div style={pageBodyStyle}>
        {healthEnvelope.status !== "healthy" ? (
          <Banner
            theme={theme}
            tone={healthEnvelope.status === "down" ? "danger" : "warn"}
            icon={<CanvasIcon name="warn" size={16} />}
            title={copy(
              locale,
              "Attendance data may be incomplete",
              "出勤資料可能不完整",
            )}
            body={
              <div>
                <div>
                  {copy(
                    locale,
                    "UiHealthEnvelope reports degraded shift-attendance dependency.",
                    "UiHealthEnvelope 顯示 shift-attendance 依賴處於降級狀態。",
                  )}
                </div>
                {healthEnvelope.degradedServices.map((svc) => (
                  <code key={svc.service} style={inlineMonoStyle}>
                    {svc.service} · {svc.severity} · {svc.impact}
                  </code>
                ))}
              </div>
            }
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={copy(locale, "Scheduled drivers", "排班司機")}
            value={uniqueDriversToday.toString()}
            sub={copy(locale, "Unique drivers on today", "今日獨立駕駛人數")}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Active shifts", "活躍班次")}
            value={activeShiftsCount.toString()}
            sub={copy(locale, "Drivers currently on duty", "目前正在值勤")}
            hint={
              uniqueDriversToday > 0
                ? `${Math.round(
                    (activeShiftsCount / uniqueDriversToday) * 100,
                  )}%`
                : undefined
            }
          />
          <KPI
            theme={theme}
            label={copy(locale, "Completed shifts", "完成班次")}
            value={completedShiftsCount.toString()}
            sub={copy(locale, "Closed today", "今日已結束")}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Anomalies", "異常 / 遲到")}
            value={anomalyTotal.toString()}
            delta={
              absentToday > 0
                ? `${absentToday} ${copy(locale, "absent", "未到")}`
                : undefined
            }
            deltaTone={absentToday > 0 ? "down" : "neutral"}
            sub={copy(
              locale,
              "Includes no-shows + partial + abandoned",
              "含缺勤、部分出勤與班次中斷",
            )}
          />
        </div>

        <Card
          theme={theme}
          title={copy(locale, "On-shift Gantt · 0–24h UTC", "當班甘特 · 0–24h UTC")}
          subtitle={copy(
            locale,
            "Today's clocked-in coverage by driver",
            "今日各駕駛的當班覆蓋",
          )}
        >
          {ganttRows.length === 0 ? (
            <div style={{ fontSize: 12, color: theme.textMuted }}>
              {copy(
                locale,
                "No shifts to plot for this scope.",
                "目前範圍下沒有可顯示的班次。",
              )}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr 90px",
                gap: "0 8px",
                fontSize: 11,
              }}
            >
              <div />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(24, 1fr)",
                  color: theme.textDim,
                  paddingBottom: 4,
                  borderBottom: `1px solid ${theme.border}`,
                  fontFamily: theme.monoFamily,
                }}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <span key={hour} style={{ textAlign: "center" }}>
                    {hour.toString().padStart(2, "0")}
                  </span>
                ))}
              </div>
              <div
                style={{
                  paddingBottom: 4,
                  color: theme.textDim,
                  borderBottom: `1px solid ${theme.border}`,
                  textAlign: "right",
                  fontFamily: theme.monoFamily,
                }}
              >
                {copy(locale, "hours", "工時")}
              </div>
              {ganttRows.map((row) => (
                <Fragment key={row.shiftId}>
                  <div
                    key={`label-${row.shiftId}`}
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
                      href={`/drivers/${encodeURIComponent(row.driverId)}`}
                      style={{
                        color: theme.accent,
                        textDecoration: "none",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.driverId}
                    </Link>
                  </div>
                  <div
                    key={`bar-${row.shiftId}`}
                    style={{
                      position: "relative",
                      height: 28,
                      borderBottom: `1px dashed ${theme.border}`,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 6,
                        left: `${Math.min(row.startPct, row.endPct)}%`,
                        width: `${Math.max(
                          2,
                          Math.abs(row.endPct - row.startPct),
                        )}%`,
                        height: 16,
                        background: row.ribbonBg,
                        border: `1px solid ${row.ribbonBorder}`,
                        borderRadius: 4,
                        color: row.ribbonTone,
                        fontSize: 10,
                        paddingLeft: 6,
                        lineHeight: "14px",
                        fontFamily: theme.monoFamily,
                      }}
                    >
                      {formatTimeUtc(row.clockedInAt)}–
                      {formatTimeUtc(row.clockedOutAt)}
                    </div>
                  </div>
                  <div
                    key={`hours-${row.shiftId}`}
                    style={{
                      padding: "6px 0",
                      borderBottom: `1px dashed ${theme.border}`,
                      fontSize: 11,
                      color: theme.text,
                      textAlign: "right",
                      fontFamily: theme.monoFamily,
                    }}
                  >
                    {row.vehicleId ?? copy(locale, "no vehicle", "未掛車")}
                  </div>
                </Fragment>
              ))}
            </div>
          )}
        </Card>

        <Card
          theme={theme}
          title={copy(locale, "Filters", "篩選")}
          subtitle={copy(
            locale,
            "Per §5.12 attendance scope — date, driver, anomaly",
            "依 §5.12 出勤範圍 — 日期 / 司機 / 異常",
          )}
        >
          <form method="GET" action="/attendance" style={filterBarStyle}>
            <input type="hidden" name="tab" value={tab} />
            <label
              style={{
                display: "inline-flex",
                gap: 6,
                fontSize: 12,
                color: theme.textMuted,
                alignItems: "center",
              }}
            >
              {copy(locale, "Date", "日期")}
              <input
                type="date"
                name="date"
                defaultValue={requestedDate || todayKey}
                style={{
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: `1px solid ${theme.border}`,
                  background: theme.surfaceLo,
                  color: theme.text,
                  fontFamily: theme.monoFamily,
                  fontSize: 12,
                }}
              />
            </label>
            <label
              style={{
                display: "inline-flex",
                gap: 6,
                fontSize: 12,
                color: theme.textMuted,
                alignItems: "center",
              }}
            >
              {copy(locale, "Driver", "司機")}
              <input
                type="text"
                name="driverId"
                placeholder="d_8843"
                defaultValue={driverFilter}
                style={{
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: `1px solid ${theme.border}`,
                  background: theme.surfaceLo,
                  color: theme.text,
                  fontFamily: theme.monoFamily,
                  fontSize: 12,
                  width: 140,
                }}
              />
            </label>
            <Btn theme={theme} variant="primary" icon="filter">
              {copy(locale, "Apply filters", "套用篩選")}
            </Btn>
            <Link href="/attendance" style={{ textDecoration: "none" }}>
              <Btn theme={theme} variant="ghost">
                {copy(locale, "Reset", "重設")}
              </Btn>
            </Link>
            <span style={{ marginLeft: "auto", ...inlineMonoStyle }}>
              {copy(locale, "showing", "顯示")} {scopedShifts.length} /{" "}
              {shifts.length} {copy(locale, "shifts", "班次")}
            </span>
          </form>
        </Card>

        <Card
          theme={theme}
          title={copy(locale, "Shift roster", "班次清單")}
          subtitle={`${formatOpsCodeLabel(locale, tab)} · ${scopedShifts.length}`}
          padding={0}
          actions={
            <CrossAppLink
              href={`/dispatch?view=owned&supplyConcern=${encodeURIComponent(todayKey)}`}
              label={copy(locale, "Dispatch supply view", "派遣供給檢視")}
              newTab={false}
            />
          }
        >
          {shiftsEmptyEnvelope ? (
            <div style={{ padding: 16 }}>
              <EmptyStateBanner
                locale={locale}
                envelope={shiftsEmptyEnvelope}
              />
            </div>
          ) : (
            <Table theme={theme} columns={shiftColumns} rows={shiftRows} />
          )}
        </Card>

        <Card
          theme={theme}
          title={copy(locale, "Attendance ledger", "出勤帳本")}
          subtitle={copy(
            locale,
            "Most recent attendance records",
            "最近的出勤紀錄",
          )}
          padding={0}
        >
          {attendanceEmptyEnvelope ? (
            <div style={{ padding: 16 }}>
              <EmptyStateBanner
                locale={locale}
                envelope={attendanceEmptyEnvelope}
              />
            </div>
          ) : (
            <Table
              theme={theme}
              columns={attendanceColumns}
              rows={attendanceRows}
            />
          )}
        </Card>

        <Card
          theme={theme}
          title={copy(
            locale,
            "Cross-app & supply context",
            "跨應用與供給情境",
          )}
          subtitle={copy(
            locale,
            "Per §5.12 attendance feeds dispatch supply diagnosis",
            "依 §5.12 出勤為派遣供給診斷的依據",
          )}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <CrossAppLink
              href="/dispatch?view=owned"
              label={copy(
                locale,
                "Why can't we dispatch? → /dispatch",
                "為什麼派不出去 → /dispatch",
              )}
              newTab={false}
            />
            <CrossAppLink
              href="/drivers"
              label={copy(
                locale,
                "Driver registry → /drivers",
                "司機主檔 → /drivers",
              )}
              newTab={false}
            />
            <CrossAppLink
              href="/incidents?filter=attendance"
              label={copy(
                locale,
                "Open incidents → /incidents",
                "開啟事故 → /incidents",
              )}
              newTab={false}
            />
            <CrossAppLink
              href="/reports?type=attendance"
              label={copy(
                locale,
                "Run attendance report → /reports",
                "出勤報表 → /reports",
              )}
              newTab={false}
            />
          </div>
          <div style={{ marginTop: 12, ...inlineMonoStyle }}>
            {copy(
              locale,
              "All current attendance exits are in-app per packet §5.12 (no cross-app deep links required).",
              "依 packet §5.12，本頁所有 exits 皆為 in-app；目前無需 cross-app 深連結。",
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
