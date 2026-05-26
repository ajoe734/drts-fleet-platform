import Link from "next/link";
import type { ReactNode } from "react";
import type {
  AttendanceRecord,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  ResourceActionDescriptor,
  ShiftRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import { AttendanceRefreshControls } from "./refresh-controls";

type AttendancePageProps = {
  searchParams?: Promise<{
    anomaly?: string | string[];
    date?: string | string[];
    driver?: string | string[];
    emptyReason?: string | string[];
    view?: string | string[];
  }>;
};

type AttendanceSearchParams = Awaited<
  NonNullable<AttendancePageProps["searchParams"]>
>;

type AttendanceView = "today" | "week" | "anomaly";

type AttendanceEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type ShiftView = {
  shift: ShiftRecord;
  attendance: AttendanceRecord | null;
  anomalyCodes: string[];
  availableActions: ResourceActionDescriptor[];
  links: Partial<Record<string, CrossAppResourceLink>>;
};

type ShiftRow = Record<string, unknown> & {
  shiftCell: ReactNode;
  driverCell: ReactNode;
  vehicleCell: ReactNode;
  scheduleCell: ReactNode;
  actualCell: ReactNode;
  statusCell: ReactNode;
  anomalyCell: ReactNode;
  actionsCell: ReactNode;
};

type AttendanceRow = Record<string, unknown> & {
  driverCell: ReactNode;
  shiftCell: ReactNode;
  day: string;
  clockCell: ReactNode;
  statusCell: ReactNode;
  anomalyCell: ReactNode;
  actionsCell: ReactNode;
};

type EmptyStateView = {
  envelope: EmptyStateEnvelope;
  title: string;
  body: string;
  tone: Exclude<CanvasTone, "neutral">;
  icon: "warn" | "search" | "adapters" | "ext" | "attendance";
  nextLink?: CrossAppResourceLink;
  sameAppHref?: string;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REFRESH_TIER_MS = 15_000;

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

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.75fr) minmax(290px, 0.95fr)",
  gap: 16,
  alignItems: "start",
};

const secondaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
  gap: 16,
  alignItems: "start",
};

const timelineGridStyle = {
  display: "grid",
  gap: 10,
};

const ganttGridStyle = {
  display: "grid",
  gridTemplateColumns: "170px minmax(0, 1fr) 108px",
  gap: 10,
  alignItems: "center",
};

const toolbarStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
  alignItems: "center",
};

const headerTabStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const chipRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
};

const timelineHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr) 112px",
  gap: 12,
  color: theme.textMuted,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.3,
  textTransform: "uppercase" as const,
};

const timelineRowStyle = {
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr) 112px",
  gap: 12,
  alignItems: "center",
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayKey() {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function lastWeekKey() {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - 6);
  return value.toISOString().slice(0, 10);
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) return "—";
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

function formatTime(locale: Locale, value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatHours(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(1)}h`;
}

function formatShortDate(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function shiftDurationHours(shift: ShiftRecord) {
  if (typeof shift.totalHours === "number") {
    return shift.totalHours;
  }
  const end = shift.clockedOutAt ? new Date(shift.clockedOutAt) : new Date();
  const start = new Date(shift.clockedInAt);
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return diff > 0 ? diff : 0;
}

function attendanceTimelinePercent(value: string | null | undefined) {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  return Math.max(0, Math.min(100, (minutes / (24 * 60)) * 100));
}

function getShiftDateKey(shift: ShiftRecord) {
  return shift.clockedInAt.slice(0, 10);
}

function getScheduledWindow(shift: ShiftRecord) {
  const scheduledStart = new Date(shift.clockedInAt);
  const scheduledEnd = shift.clockedOutAt
    ? new Date(shift.clockedOutAt)
    : new Date(scheduledStart.getTime() + 8 * 60 * 60 * 1000);

  return {
    start: scheduledStart.toISOString(),
    end: scheduledEnd.toISOString(),
    fallback: true,
  };
}

function classifyFetchFailure(message: string | null): AttendanceEmptyReason {
  const normalized = message?.toLowerCase() ?? "";
  if (
    normalized.includes("permission") ||
    normalized.includes("forbidden") ||
    normalized.includes("403") ||
    normalized.includes("unauthorized")
  ) {
    return "permission_denied";
  }
  if (
    normalized.includes("adapter") ||
    normalized.includes("upstream") ||
    normalized.includes("gateway") ||
    normalized.includes("timeout") ||
    normalized.includes("service unavailable")
  ) {
    return "external_unavailable";
  }
  if (
    normalized.includes("not provisioned") ||
    normalized.includes("schedule not loaded") ||
    normalized.includes("provision")
  ) {
    return "not_provisioned";
  }
  return "fetch_failed";
}

function resolveAttendanceView(value: string | undefined): AttendanceView {
  if (value === "week" || value === "anomaly") return value;
  return "today";
}

function isAttendanceEmptyReason(
  value: string | undefined,
): value is AttendanceEmptyReason {
  return (
    value === "no_data" ||
    value === "not_provisioned" ||
    value === "fetch_failed" ||
    value === "permission_denied" ||
    value === "external_unavailable" ||
    value === "filtered_empty"
  );
}

function buildRefreshMetadata(error: string | null): UiRefreshMetadata {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterMs: REFRESH_TIER_MS,
    dataFreshness: error ? "degraded" : "fresh",
    source: "live",
  };
}

function actionLinkStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
  disabled = false,
) {
  const styles =
    variant === "primary"
      ? {
          background: theme.accent,
          color: "#fff",
          border: theme.accent,
        }
      : variant === "ghost"
        ? {
            background: "transparent",
            color: theme.textMuted,
            border: "transparent",
          }
        : {
            background: theme.surface,
            color: theme.text,
            border: theme.border,
          };

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 28,
    padding: "5px 10px",
    borderRadius: 7,
    border: `1px solid ${styles.border}`,
    background: styles.background,
    color: styles.color,
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    whiteSpace: "nowrap" as const,
  };
}

function chipLinkStyle(active: boolean) {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 9px",
    borderRadius: 999,
    border: `1px solid ${active ? theme.accent : theme.border}`,
    background: active ? theme.accentBg : theme.surface,
    color: active ? theme.accent : theme.textMuted,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: active ? 600 : 500,
    whiteSpace: "nowrap" as const,
  };
}

function buildQueryString(
  params: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...patch })) {
    if (value) next.set(key, value);
  }
  const encoded = next.toString();
  return encoded ? `?${encoded}` : "";
}

function readAvailableActions(
  record: unknown,
): ResourceActionDescriptor[] | null {
  if (!record || typeof record !== "object") return null;
  const candidate = (record as { availableActions?: unknown }).availableActions;
  if (!Array.isArray(candidate)) return null;
  return candidate.filter((entry): entry is ResourceActionDescriptor => {
    if (!entry || typeof entry !== "object") return false;
    const action = (entry as { action?: unknown }).action;
    const enabled = (entry as { enabled?: unknown }).enabled;
    const riskLevel = (entry as { riskLevel?: unknown }).riskLevel;
    return (
      typeof action === "string" &&
      typeof enabled === "boolean" &&
      (riskLevel === "low" || riskLevel === "medium" || riskLevel === "high")
    );
  });
}

function renderDeepLink(link: CrossAppResourceLink, labelOverride?: string) {
  return (
    <a
      href={link.route}
      target={link.openMode === "new_tab" ? "_blank" : undefined}
      rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
      style={actionLinkStyle("secondary")}
    >
      {labelOverride ?? link.label}
    </a>
  );
}

function renderActionDescriptor(
  action: ResourceActionDescriptor,
  link: CrossAppResourceLink | undefined,
  locale: Locale,
  primaryAction?: string,
) {
  if (!action.enabled || !link) {
    return (
      <span
        key={action.action}
        title={disabledActionHint(action, locale)}
        style={{
          ...actionLinkStyle("secondary", true),
          pointerEvents: "none",
        }}
      >
        {actionLabel(action.action, locale)}
      </span>
    );
  }

  const variant = action.action === primaryAction ? "primary" : "secondary";

  return link.openMode === "same_tab" ? (
    <Link
      key={action.action}
      href={link.route}
      style={actionLinkStyle(variant)}
    >
      {actionLabel(action.action, locale)}
    </Link>
  ) : (
    <a
      key={action.action}
      href={link.route}
      target="_blank"
      rel="noreferrer"
      style={actionLinkStyle(variant)}
    >
      {actionLabel(action.action, locale)}
    </a>
  );
}

function buildEmptyStateView(
  locale: Locale,
  reason: AttendanceEmptyReason,
  activeDriver: string | undefined,
): EmptyStateView {
  switch (reason) {
    case "not_provisioned":
      return {
        envelope: {
          reason,
          messageCode: "attendance.empty.not_provisioned",
          nextAction: {
            action: "inspect_schedule_provisioning",
            enabled: true,
            riskLevel: "low",
          },
        },
        title: copy(locale, "Shift roster not provisioned", "班表資料尚未佈建"),
        body: copy(
          locale,
          "Schedule data has not been loaded into this tenant yet, so planned shift windows cannot be rendered.",
          "此租戶尚未載入班表資料，因此無法呈現排定班次時段。",
        ),
        tone: "warn",
        icon: "attendance",
        nextLink: {
          targetApp: "platform-admin",
          route: "/adapter-registry",
          resourceType: "schedule_adapter",
          resourceId: "attendance",
          openMode: "new_tab",
          label: copy(locale, "Inspect adapter registry", "查看介接註冊表"),
        },
      };
    case "permission_denied":
      return {
        envelope: {
          reason,
          messageCode: "attendance.empty.permission_denied",
          nextAction: {
            action: "request_scope_review",
            enabled: true,
            riskLevel: "low",
          },
        },
        title: copy(locale, "Attendance scope missing", "缺少出勤檢視權限"),
        body: copy(
          locale,
          "This actor cannot read attendance telemetry for the selected scope. Ask for ops_manager or scoped supply-review access.",
          "目前 actor 無法讀取所選範圍的出勤資料。請申請 ops_manager 或供給檢視權限。",
        ),
        tone: "danger",
        icon: "ext",
        nextLink: {
          targetApp: "platform-admin",
          route: "/audit?auditId=attendance-scope-review",
          resourceType: "audit",
          resourceId: "attendance-scope-review",
          openMode: "new_tab",
          label: copy(locale, "Open audit trail", "查看審計紀錄"),
        },
      };
    case "external_unavailable":
      return {
        envelope: {
          reason,
          messageCode: "attendance.empty.external_unavailable",
          nextAction: {
            action: "inspect_supply_adapter",
            enabled: true,
            riskLevel: "low",
          },
        },
        title: copy(
          locale,
          "External supply feed unavailable",
          "外部供給資料源不可用",
        ),
        body: copy(
          locale,
          "The attendance screen is up, but an upstream adapter is degraded. Use the adapter registry for cross-app investigation.",
          "出勤頁面仍可使用，但上游介接已降級。請到 adapter registry 做跨應用排查。",
        ),
        tone: "warn",
        icon: "adapters",
        nextLink: {
          targetApp: "platform-admin",
          route: "/adapter-registry",
          resourceType: "adapter",
          resourceId: "attendance-feed",
          openMode: "new_tab",
          label: copy(locale, "Open adapter registry", "前往 adapter registry"),
        },
      };
    case "filtered_empty":
      return {
        envelope: {
          reason,
          messageCode: "attendance.empty.filtered_empty",
          nextAction: {
            action: "clear_filters",
            enabled: true,
            riskLevel: "low",
          },
        },
        title: copy(
          locale,
          "No rows match these filters",
          "目前篩選條件無符合資料",
        ),
        body: activeDriver
          ? copy(
              locale,
              `Driver ${activeDriver} has no shifts in this date/anomaly slice.`,
              `司機 ${activeDriver} 在目前日期 / 異常條件下沒有班次資料。`,
            )
          : copy(
              locale,
              "Try widening the date range or clearing anomaly-only mode.",
              "請放寬日期範圍，或關閉僅看異常模式。",
            ),
        tone: "info",
        icon: "search",
        sameAppHref: "/attendance",
      };
    case "fetch_failed":
      return {
        envelope: {
          reason,
          messageCode: "attendance.empty.fetch_failed",
          nextAction: {
            action: "retry_refresh",
            enabled: true,
            riskLevel: "low",
          },
        },
        title: copy(
          locale,
          "Attendance feed failed to load",
          "出勤資料讀取失敗",
        ),
        body: copy(
          locale,
          "The last refresh failed. Keep this board visible for context, then retry or pivot into the driver registry.",
          "最近一次更新失敗。可先保留此看板做情境判讀，再重試或切往司機主檔。",
        ),
        tone: "danger",
        icon: "warn",
        sameAppHref: "/attendance",
        nextLink: {
          targetApp: "ops-console",
          route: "/drivers",
          resourceType: "driver_registry",
          resourceId: "all-drivers",
          openMode: "same_tab",
          label: copy(locale, "Open driver registry", "前往司機主檔"),
        },
      };
    case "no_data":
    default:
      return {
        envelope: {
          reason: "no_data",
          messageCode: "attendance.empty.no_data",
          nextAction: {
            action: "inspect_driver_registry",
            enabled: true,
            riskLevel: "low",
          },
        },
        title: copy(locale, "No shifts on this date", "這一天沒有班次"),
        body: copy(
          locale,
          "This can be a legitimate off-day. If dispatch is still under-supplied, pivot into driver detail or maintenance.",
          "這可能是正常休班日；若派車仍缺供給，請轉往司機詳情或維修頁再查。",
        ),
        tone: "info",
        icon: "attendance",
        sameAppHref: "/drivers",
      };
  }
}

function getShiftAnomalyCodes(
  shift: ShiftRecord,
  attendance: AttendanceRecord | null,
): string[] {
  const codes: string[] = [];
  if (!shift.vehicleId) codes.push("vehicle_unassigned");
  if (shift.status === "abandoned") codes.push("shift_abandoned");
  if (shiftDurationHours(shift) >= 10) codes.push("extended_shift");
  if (attendance?.status === "partial") codes.push("attendance_partial");
  if (attendance?.status === "absent") codes.push("attendance_absent");
  return codes;
}

function getShiftLinks(shift: ShiftRecord): ShiftView["links"] {
  return {
    open_driver_detail: {
      targetApp: "ops-console",
      route: `/drivers/${shift.driverId}`,
      resourceType: "driver",
      resourceId: shift.driverId,
      openMode: "same_tab",
      label: "Driver detail",
    },
    inspect_supply_gap: {
      targetApp: "ops-console",
      route: "/dispatch?board=no_eligible_supply",
      resourceType: "dispatch_board",
      resourceId: "no_eligible_supply",
      openMode: "same_tab",
      label: "Supply board",
    },
    open_maintenance: {
      targetApp: "ops-console",
      route: "/maintenance",
      resourceType: "maintenance_board",
      resourceId: shift.vehicleId ?? shift.shiftId,
      openMode: "same_tab",
      label: "Maintenance",
    },
  };
}

function buildShiftActions(
  shift: ShiftRecord,
  anomalyCodes: string[],
): ResourceActionDescriptor[] {
  return [
    {
      action: "open_driver_detail",
      enabled: true,
      riskLevel: "low",
    },
    anomalyCodes.length > 0
      ? {
          action: "inspect_supply_gap",
          enabled: true,
          riskLevel: "low",
        }
      : {
          action: "inspect_supply_gap",
          enabled: false,
          disabledReasonCode: "supply_looks_normal",
          riskLevel: "low",
        },
    !shift.vehicleId || shift.status === "abandoned"
      ? {
          action: "open_maintenance",
          enabled: true,
          riskLevel: "low",
        }
      : {
          action: "open_maintenance",
          enabled: false,
          disabledReasonCode: "vehicle_not_blocked",
          riskLevel: "low",
        },
  ];
}

function actionLabel(action: string, locale: Locale) {
  switch (action) {
    case "open_driver_detail":
      return copy(locale, "Driver detail", "司機詳情");
    case "inspect_supply_gap":
      return copy(locale, "Why no supply", "為什麼派不出去");
    case "open_maintenance":
      return copy(locale, "Maintenance impact", "維修影響");
    case "inspect_schedule_provisioning":
      return copy(locale, "Inspect provisioning", "查看佈建狀態");
    case "request_scope_review":
      return copy(locale, "Review scope", "檢查權限");
    case "inspect_supply_adapter":
      return copy(locale, "Check adapter", "檢查 adapter");
    case "clear_filters":
      return copy(locale, "Clear filters", "清除篩選");
    case "retry_refresh":
      return copy(locale, "Retry refresh", "重新整理");
    case "inspect_driver_registry":
      return copy(locale, "Open driver registry", "前往司機主檔");
    default:
      return action;
  }
}

function disabledActionHint(action: ResourceActionDescriptor, locale: Locale) {
  switch (action.disabledReasonCode) {
    case "supply_looks_normal":
      return copy(locale, "No anomaly on this row", "此列目前無異常");
    case "vehicle_not_blocked":
      return copy(locale, "Vehicle is already assigned", "車輛已完成指派");
    default:
      return action.disabledReasonCode ?? copy(locale, "Unavailable", "不可用");
  }
}

function toneForAttendanceStatus(status: AttendanceRecord["status"]) {
  switch (status) {
    case "present":
      return "success";
    case "absent":
      return "danger";
    default:
      return "warn";
  }
}

function toneForShiftStatus(status: ShiftRecord["status"]) {
  switch (status) {
    case "active":
      return "accent";
    case "abandoned":
      return "danger";
    default:
      return "neutral";
  }
}

function filterLabel(locale: Locale, dateFilter: string) {
  if (dateFilter === "today") return copy(locale, "Today", "今天");
  if (dateFilter === "yesterday") return copy(locale, "Yesterday", "昨天");
  if (dateFilter === "week") return copy(locale, "This week", "本週");
  if (dateFilter === "all") return copy(locale, "All dates", "全部日期");
  return dateFilter;
}

export default async function AttendancePage({
  searchParams,
}: AttendancePageProps) {
  const [client, locale, params] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
    searchParams ?? Promise.resolve<AttendanceSearchParams>({}),
  ]);

  const activeDriver = firstValue(params.driver)?.trim() || undefined;
  const attendanceView = resolveAttendanceView(firstValue(params.view));
  const dateFilter = firstValue(params.date) ?? "today";
  const anomalyFilter =
    attendanceView === "anomaly"
      ? "only"
      : (firstValue(params.anomaly) ?? "all");
  const emptyOverride = firstValue(params.emptyReason);

  let shifts: ShiftRecord[] = [];
  let attendance: AttendanceRecord[] = [];
  let error: string | null = null;

  try {
    const [shiftsResult, attendanceResult] = await Promise.all([
      client.listShifts(),
      client.listAttendance(),
    ]);
    shifts = (shiftsResult as { items?: ShiftRecord[] }).items ?? shiftsResult;
    attendance =
      (attendanceResult as { items?: AttendanceRecord[] }).items ??
      attendanceResult;
  } catch (caught) {
    error =
      caught instanceof Error ? caught.message : t("common.unknown", locale);
  }

  const refresh = buildRefreshMetadata(error);
  const today = todayKey();
  const yesterday = yesterdayKey();
  const lastWeek = lastWeekKey();
  const effectiveDate =
    attendanceView === "week"
      ? undefined
      : dateFilter === "today"
        ? today
        : dateFilter === "yesterday"
          ? yesterday
          : dateFilter === "all"
            ? undefined
            : dateFilter;

  const attendanceByShift = new Map(
    attendance.map((record) => [record.shiftId, record] as const),
  );
  const shiftViews = shifts
    .map((shift) => {
      const shiftAttendance = attendanceByShift.get(shift.shiftId) ?? null;
      const anomalyCodes = getShiftAnomalyCodes(shift, shiftAttendance);
      const contractActions =
        readAvailableActions(shift) ?? readAvailableActions(shiftAttendance);
      return {
        shift,
        attendance: shiftAttendance,
        anomalyCodes,
        availableActions:
          contractActions ?? buildShiftActions(shift, anomalyCodes),
        links: getShiftLinks(shift),
      } satisfies ShiftView;
    })
    .sort((left, right) =>
      right.shift.clockedInAt.localeCompare(left.shift.clockedInAt),
    );

  const filteredShiftViews = shiftViews.filter((view) => {
    if (activeDriver && view.shift.driverId !== activeDriver) return false;
    const shiftDate = getShiftDateKey(view.shift);
    if (attendanceView === "week") {
      if (shiftDate < lastWeek || shiftDate > today) return false;
    } else if (effectiveDate && shiftDate !== effectiveDate) {
      return false;
    }
    if (anomalyFilter === "only" && view.anomalyCodes.length === 0)
      return false;
    return true;
  });

  const activeShiftViews = filteredShiftViews.filter(
    (view) => view.shift.status === "active",
  );
  const filteredAttendance = attendance
    .filter((record) => {
      if (activeDriver && record.driverId !== activeDriver) return false;
      if (attendanceView === "week") {
        if (record.date < lastWeek || record.date > today) return false;
      } else if (effectiveDate && record.date !== effectiveDate) {
        return false;
      }
      if (
        anomalyFilter === "only" &&
        record.status !== "partial" &&
        record.status !== "absent"
      ) {
        return false;
      }
      return true;
    })
    .sort((left, right) =>
      `${right.date}${right.clockedInAt}`.localeCompare(
        `${left.date}${left.clockedInAt}`,
      ),
    );

  const anomalyViews = filteredShiftViews.filter(
    (view) => view.anomalyCodes.length > 0,
  );
  const longRunningCount = shiftViews.filter(
    (view) =>
      view.shift.status === "active" && shiftDurationHours(view.shift) >= 10,
  ).length;
  const completedTodayCount = attendance.filter(
    (record) => record.date === today && record.status === "present",
  ).length;
  const totalTrackedHours = filteredAttendance.reduce(
    (sum, record) => sum + (record.totalHours ?? 0),
    0,
  );

  let emptyReason: AttendanceEmptyReason | null = null;
  if (isAttendanceEmptyReason(emptyOverride)) {
    emptyReason = emptyOverride;
  } else if (error) {
    emptyReason = classifyFetchFailure(error);
  } else if (filteredShiftViews.length === 0) {
    emptyReason =
      activeDriver ||
      anomalyFilter === "only" ||
      Boolean(effectiveDate && effectiveDate !== today)
        ? "filtered_empty"
        : shifts.length === 0
          ? "no_data"
          : "filtered_empty";
  }

  const activeEmptyState = emptyReason
    ? buildEmptyStateView(locale, emptyReason, activeDriver)
    : null;

  const distinctDrivers = Array.from(
    new Set(shiftViews.map((view) => view.shift.driverId)),
  ).slice(0, 6);

  const baseQuery = {
    view: attendanceView !== "today" ? attendanceView : undefined,
    date:
      attendanceView === "today" && dateFilter !== "today"
        ? dateFilter
        : undefined,
    driver: activeDriver,
    anomaly:
      attendanceView !== "anomaly" && anomalyFilter !== "all"
        ? anomalyFilter
        : undefined,
  };

  const headerTabs = [
    {
      id: "today",
      label: copy(locale, "Today", "今日"),
      href: `/attendance${buildQueryString(baseQuery, {
        view: undefined,
        date: undefined,
        anomaly: undefined,
      })}`,
    },
    {
      id: "week",
      label: copy(locale, "Week", "本週"),
      href: `/attendance${buildQueryString(baseQuery, {
        view: "week",
        date: undefined,
        anomaly: undefined,
      })}`,
    },
    {
      id: "anomaly",
      label: copy(locale, "Anomaly", "異常"),
      href: `/attendance${buildQueryString(baseQuery, {
        view: "anomaly",
        date: undefined,
        anomaly: undefined,
      })}`,
    },
  ];

  const currentTabIndex = Math.max(
    0,
    headerTabs.findIndex((tab) => tab.id === attendanceView),
  );
  const currentTab = headerTabs[currentTabIndex]!;
  const headerTabNodes = headerTabs.map((tab) => (
    <Link
      key={tab.id}
      href={tab.href}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      <span style={headerTabStyle}>
        {tab.label}
        {tab.id === "anomaly" && anomalyViews.length > 0 ? (
          <Pill theme={theme} tone="danger">
            {anomalyViews.length}
          </Pill>
        ) : null}
      </span>
    </Link>
  ));
  const selectedSliceLabel =
    attendanceView === "week"
      ? copy(
          locale,
          `${formatShortDate(locale, lastWeek)} - ${formatShortDate(locale, today)}`,
          `${formatShortDate(locale, lastWeek)} - ${formatShortDate(locale, today)}`,
        )
      : attendanceView === "anomaly"
        ? copy(locale, "Anomalous rows only", "僅顯示異常列")
        : copy(locale, `${today} · UTC`, `${today} · UTC`);

  const shiftColumns: CanvasTableColumn<ShiftRow>[] = [
    { h: copy(locale, "SHIFT", "班次"), k: "shiftCell", w: 138 },
    { h: copy(locale, "DRIVER", "司機"), k: "driverCell", w: 150 },
    { h: copy(locale, "VEHICLE", "車輛"), k: "vehicleCell", w: 122 },
    { h: copy(locale, "SCHEDULE", "排程"), k: "scheduleCell", w: 156 },
    { h: copy(locale, "ACTUAL", "實際"), k: "actualCell", w: 188 },
    { h: copy(locale, "STATE", "狀態"), k: "statusCell", w: 140 },
    { h: copy(locale, "ANOMALY", "異常"), k: "anomalyCell", w: 180 },
    { h: copy(locale, "ACTIONS", "操作"), k: "actionsCell", w: 250 },
  ];

  const shiftRows = filteredShiftViews.map((view) => {
    const firstAction = view.links.open_driver_detail;
    const scheduledWindow = getScheduledWindow(view.shift);
    const anomalyTone =
      view.anomalyCodes.length >= 2
        ? "danger"
        : view.anomalyCodes.length === 1
          ? "warn"
          : "neutral";

    return {
      shiftCell: (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
            {view.shift.shiftId}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {getShiftDateKey(view.shift)}
          </span>
        </div>
      ),
      driverCell: firstAction ? (
        <Link
          href={firstAction.route}
          style={{
            color: theme.accent,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {view.shift.driverId}
        </Link>
      ) : (
        view.shift.driverId
      ),
      vehicleCell: (
        <div style={{ display: "grid", gap: 2 }}>
          <span>{view.shift.vehicleId ?? "—"}</span>
          {!view.shift.vehicleId ? (
            <span style={{ color: theme.warn, fontSize: 11 }}>
              {copy(locale, "Vehicle unassigned", "尚未掛車")}
            </span>
          ) : null}
        </div>
      ),
      scheduleCell: (
        <div style={{ display: "grid", gap: 2 }}>
          <span>
            {formatTime(locale, scheduledWindow.start)} →{" "}
            {formatTime(locale, scheduledWindow.end)}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {scheduledWindow.fallback
              ? copy(
                  locale,
                  "Roster window inferred from live shift data",
                  "班表視窗目前以即時班次資料推定",
                )
              : copy(locale, "Roster schedule", "班表時段")}
          </span>
        </div>
      ),
      actualCell: (
        <div style={{ display: "grid", gap: 2 }}>
          <span>
            {formatDateTime(locale, view.shift.clockedInAt)} →{" "}
            {formatDateTime(locale, view.shift.clockedOutAt)}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {copy(locale, "duration", "時長")}{" "}
            {formatHours(shiftDurationHours(view.shift))}
          </span>
        </div>
      ),
      statusCell: (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Pill theme={theme} tone={toneForShiftStatus(view.shift.status)} dot>
            {formatOpsCodeLabel(locale, view.shift.status)}
          </Pill>
          {view.attendance ? (
            <Pill
              theme={theme}
              tone={toneForAttendanceStatus(view.attendance.status)}
            >
              {formatOpsCodeLabel(locale, view.attendance.status)}
            </Pill>
          ) : null}
        </div>
      ),
      anomalyCell:
        view.anomalyCodes.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {view.anomalyCodes.map((code) => (
              <Pill key={code} theme={theme} tone={anomalyTone}>
                {formatOpsCodeLabel(locale, code)}
              </Pill>
            ))}
          </div>
        ) : (
          <Pill theme={theme}>{copy(locale, "normal", "正常")}</Pill>
        ),
      actionsCell: (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {view.availableActions.map((action) => {
            return renderActionDescriptor(
              action,
              view.links[action.action],
              locale,
              "open_driver_detail",
            );
          })}
        </div>
      ),
    } satisfies ShiftRow;
  });

  const attendanceColumns: CanvasTableColumn<AttendanceRow>[] = [
    { h: copy(locale, "DRIVER", "司機"), k: "driverCell", w: 140 },
    { h: copy(locale, "SHIFT", "班次"), k: "shiftCell", w: 124 },
    { h: copy(locale, "DATE", "日期"), k: "day", w: 96, mono: true },
    { h: copy(locale, "CLOCK", "打卡"), k: "clockCell", w: 188 },
    { h: copy(locale, "STATE", "狀態"), k: "statusCell", w: 118 },
    { h: copy(locale, "ANOMALY", "異常"), k: "anomalyCell", w: 160 },
    { h: copy(locale, "ACTIONS", "操作"), k: "actionsCell", w: 240 },
  ];

  const attendanceRows = filteredAttendance.slice(0, 16).map((record) => {
    const relatedShift = shiftViews.find(
      (view) => view.shift.shiftId === record.shiftId,
    );
    const driverLink = `/drivers/${record.driverId}`;
    const anomalyCodes =
      relatedShift?.anomalyCodes ??
      (record.status === "present" ? [] : [`attendance_${record.status}`]);

    return {
      driverCell: (
        <Link
          href={driverLink}
          style={{
            color: theme.accent,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {record.driverId}
        </Link>
      ),
      shiftCell: (
        <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
          {record.shiftId}
        </span>
      ),
      day: record.date,
      clockCell: (
        <span>
          {formatTime(locale, record.clockedInAt)} →{" "}
          {formatTime(locale, record.clockedOutAt)}
        </span>
      ),
      statusCell: (
        <Pill theme={theme} tone={toneForAttendanceStatus(record.status)} dot>
          {formatOpsCodeLabel(locale, record.status)}
        </Pill>
      ),
      anomalyCell:
        anomalyCodes.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {anomalyCodes.map((code) => (
              <Pill key={code} theme={theme} tone="warn">
                {formatOpsCodeLabel(locale, code)}
              </Pill>
            ))}
          </div>
        ) : (
          <Pill theme={theme}>{copy(locale, "normal", "正常")}</Pill>
        ),
      actionsCell: (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {relatedShift ? (
            relatedShift.availableActions.map((action) =>
              renderActionDescriptor(
                action,
                relatedShift.links[action.action],
                locale,
                "open_driver_detail",
              ),
            )
          ) : (
            <span style={actionLinkStyle("secondary", true)}>
              {copy(locale, "No linked actions", "目前沒有可用操作")}
            </span>
          )}
        </div>
      ),
    } satisfies AttendanceRow;
  });

  const timelineRows = filteredAttendance.slice(0, 8);
  const ganttRows = filteredShiftViews.slice(0, 8).map((view) => {
    const scheduledWindow = getScheduledWindow(view.shift);
    const scheduledStart =
      attendanceTimelinePercent(scheduledWindow.start) ?? 0;
    const scheduledEnd = attendanceTimelinePercent(scheduledWindow.end) ?? 100;
    const actualStart = attendanceTimelinePercent(view.shift.clockedInAt) ?? 0;
    const actualEnd =
      attendanceTimelinePercent(
        view.shift.clockedOutAt ?? scheduledWindow.end,
      ) ?? 100;
    const anomalyTone: CanvasTone =
      view.anomalyCodes.length >= 2
        ? "danger"
        : view.anomalyCodes.length === 1
          ? "warn"
          : "accent";

    return {
      view,
      scheduledStart: Math.min(scheduledStart, scheduledEnd),
      scheduledWidth: Math.max(4, Math.abs(scheduledEnd - scheduledStart)),
      actualStart: Math.min(actualStart, actualEnd),
      actualWidth: Math.max(4, Math.abs(actualEnd - actualStart)),
      anomalyTone,
      scheduledWindow,
    };
  });

  return (
    <>
      <PageHeader
        title={copy(locale, "Attendance & shifts", "班次與出勤")}
        subtitle={selectedSliceLabel}
        tabs={headerTabNodes}
        activeTab={headerTabNodes[currentTabIndex]}
        actions={
          <>
            <Btn theme={theme} variant="secondary" icon="ext" disabled>
              {copy(locale, "Export", "匯出")}
            </Btn>
            <AttendanceRefreshControls locale={locale} refresh={refresh} />
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            title={copy(locale, "Feed degraded", "資料來源降級")}
            body={error}
          />
        ) : null}

        {!error && anomalyViews.length >= 3 ? (
          <Banner
            theme={theme}
            tone="warn"
            title={copy(locale, "Anomaly spike", "異常升高")}
            body={copy(
              locale,
              `${anomalyViews.length} shift rows are currently anomalous. Pivot into dispatch or maintenance before supply drops further.`,
              `目前有 ${anomalyViews.length} 筆班次異常。請盡快切往派車或維修頁處理，以免供給再下降。`,
            )}
            actions={
              <Link
                href="/dispatch?board=no_eligible_supply"
                style={actionLinkStyle("primary")}
              >
                {copy(locale, "Open supply board", "查看供給看板")}
              </Link>
            }
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={copy(locale, "Scheduled drivers", "排班司機")}
            value={filteredShiftViews.length}
            sub={copy(locale, "Rows in current slice", "目前範圍的班次列")}
            hint={
              attendanceView === "week"
                ? filterLabel(locale, "week")
                : filterLabel(locale, dateFilter)
            }
          />
          <KPI
            theme={theme}
            label={copy(locale, "Active shifts", "活躍班次")}
            value={activeShiftViews.length}
            sub={copy(locale, "Clocked-in right now", "目前正在值班")}
            delta={
              longRunningCount > 0
                ? `${longRunningCount} ${copy(locale, "long running", "超時")}`
                : undefined
            }
            deltaTone={longRunningCount > 0 ? "down" : "neutral"}
            hint="T3 / 15s"
          />
          <KPI
            theme={theme}
            label={copy(locale, "Completed today", "今日完成")}
            value={completedTodayCount}
            sub={copy(
              locale,
              "Present attendance rows",
              "狀態為 present 的出勤",
            )}
            hint={
              attendanceView === "week"
                ? filterLabel(locale, "week")
                : filterLabel(locale, dateFilter)
            }
          />
          <KPI
            theme={theme}
            label={copy(locale, "Anomalies", "異常總數")}
            value={anomalyViews.length}
            sub={copy(
              locale,
              "Rows with vehicle / duration / attendance issues",
              "含掛車 / 時長 / 出勤問題的班次",
            )}
            delta={
              activeShiftViews.filter((view) => !view.shift.vehicleId).length >
              0
                ? `${activeShiftViews.filter((view) => !view.shift.vehicleId).length} ${copy(locale, "unassigned", "未掛車")}`
                : undefined
            }
            deltaTone={anomalyViews.length > 0 ? "down" : "neutral"}
          />
        </div>

        <Card
          theme={theme}
          title={copy(locale, "Filters & pivots", "篩選與跳轉")}
          subtitle={copy(
            locale,
            "Page-level filters stay low risk. Row CTAs still come from availableActions.",
            "頁面級篩選屬低風險；列級 CTA 仍由 availableActions 驅動。",
          )}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={toolbarStyle}>
              <div style={chipRowStyle}>
                {["today", "yesterday", "all"].map((value) => (
                  <Link
                    key={value}
                    href={`/attendance${buildQueryString(baseQuery, {
                      view: value === "today" ? undefined : "today",
                      date: value === "today" ? undefined : value,
                    })}`}
                    style={chipLinkStyle(
                      attendanceView === "today" && dateFilter === value,
                    )}
                  >
                    {filterLabel(locale, value)}
                  </Link>
                ))}
              </div>
              <div style={chipRowStyle}>
                {[
                  { value: "all", label: copy(locale, "All rows", "全部") },
                  {
                    value: "only",
                    label: copy(locale, "Anomalies only", "僅看異常"),
                  },
                ].map((option) => (
                  <Link
                    key={option.value}
                    href={`/attendance${buildQueryString(baseQuery, {
                      view: option.value === "only" ? "anomaly" : undefined,
                      anomaly:
                        option.value === "all" ? undefined : option.value,
                    })}`}
                    style={chipLinkStyle(
                      option.value === "only"
                        ? attendanceView === "anomaly"
                        : anomalyFilter === option.value &&
                            attendanceView !== "anomaly",
                    )}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
            </div>
            <div style={chipRowStyle}>
              <Link href="/attendance" style={chipLinkStyle(!activeDriver)}>
                {copy(locale, "All drivers", "全部司機")}
              </Link>
              {distinctDrivers.map((driverId) => (
                <Link
                  key={driverId}
                  href={`/attendance${buildQueryString(baseQuery, {
                    driver: driverId,
                  })}`}
                  style={chipLinkStyle(activeDriver === driverId)}
                >
                  {driverId}
                </Link>
              ))}
            </div>
          </div>
        </Card>

        {activeEmptyState ? (
          <Card
            theme={theme}
            title={activeEmptyState.title}
            subtitle={`${activeEmptyState.envelope.reason} · ${activeEmptyState.envelope.messageCode}`}
          >
            <div style={{ display: "grid", gap: 12 }}>
              <Banner
                theme={theme}
                tone={activeEmptyState.tone}
                icon={activeEmptyState.icon}
                body={activeEmptyState.body}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {activeEmptyState.nextLink
                  ? renderDeepLink(
                      activeEmptyState.nextLink,
                      actionLabel(
                        activeEmptyState.envelope.nextAction?.action ?? "",
                        locale,
                      ),
                    )
                  : null}
                {activeEmptyState.sameAppHref ? (
                  <Link
                    href={activeEmptyState.sameAppHref}
                    style={actionLinkStyle("primary")}
                  >
                    {actionLabel(
                      activeEmptyState.envelope.nextAction?.action ?? "",
                      locale,
                    )}
                  </Link>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}

        <div style={splitGridStyle}>
          <Card
            theme={theme}
            title={copy(locale, "On-shift gantt", "當班甘特")}
            subtitle={copy(
              locale,
              "Canvas view of roster window vs live clock activity for the current slice.",
              "以 canvas 方式對照班表視窗與即時打卡活動。",
            )}
          >
            <div style={{ display: "grid", gap: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "170px minmax(0, 1fr) 108px",
                  gap: 10,
                  color: theme.textMuted,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                }}
              >
                <span>{copy(locale, "Driver", "司機")}</span>
                <span>00:00 → 24:00 UTC</span>
                <span>{copy(locale, "State", "狀態")}</span>
              </div>
              {ganttRows.length > 0 ? (
                ganttRows.map((row) => (
                  <div key={row.view.shift.shiftId} style={ganttGridStyle}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>
                        {row.view.shift.driverId}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: theme.textMuted,
                          fontFamily: theme.monoFamily,
                        }}
                      >
                        {row.view.shift.shiftId}
                      </span>
                    </div>
                    <div
                      style={{
                        position: "relative",
                        height: 26,
                        borderRadius: 999,
                        background: theme.surfaceLo,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: `${row.scheduledStart}%`,
                          width: `${row.scheduledWidth}%`,
                          top: 7,
                          height: 12,
                          borderRadius: 999,
                          border: `1px dashed ${theme.border}`,
                          background: "transparent",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          left: `${row.actualStart}%`,
                          width: `${row.actualWidth}%`,
                          top: 5,
                          height: 16,
                          borderRadius: 999,
                          background:
                            row.anomalyTone === "danger"
                              ? theme.danger
                              : row.anomalyTone === "warn"
                                ? theme.warn
                                : theme.accent,
                        }}
                      />
                    </div>
                    <div
                      style={{ display: "grid", justifyItems: "end", gap: 4 }}
                    >
                      <Pill theme={theme} tone={row.anomalyTone} dot>
                        {formatOpsCodeLabel(locale, row.view.shift.status)}
                      </Pill>
                      <span style={{ fontSize: 11, color: theme.textMuted }}>
                        {row.view.anomalyCodes.length > 0
                          ? row.view.anomalyCodes.length
                          : copy(locale, "normal", "正常")}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <Banner
                  theme={theme}
                  tone="info"
                  title={copy(locale, "No visible shifts", "目前沒有可見班次")}
                  body={copy(
                    locale,
                    "Adjust the date, driver, or anomaly filter to widen the attendance slice.",
                    "請放寬日期、司機或異常篩選條件。",
                  )}
                />
              )}
            </div>
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Supervisor brief", "值班摘要")}
            subtitle={copy(
              locale,
              "Why supply looks off right now",
              "目前供給異常的原因摘要",
            )}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    label: copy(locale, "Refresh tier", "更新節奏"),
                    value: copy(locale, "T3 / 15 seconds", "T3 / 15 秒"),
                  },
                  {
                    label: copy(locale, "Current filter", "目前篩選"),
                    value: `${currentTab.label} · ${activeDriver ?? copy(locale, "all drivers", "全部司機")} · ${
                      anomalyFilter === "only"
                        ? copy(locale, "anomalies only", "僅看異常")
                        : attendanceView === "week"
                          ? copy(locale, "7-day slice", "7 天範圍")
                          : copy(locale, "all rows", "全部")
                    }`,
                  },
                  {
                    label: copy(locale, "Primary exit", "主要出口"),
                    value: activeDriver
                      ? `/drivers/${activeDriver}`
                      : copy(
                          locale,
                          "/drivers/[driverId]",
                          "/drivers/[driverId]",
                        ),
                    mono: true,
                  },
                  {
                    label: copy(locale, "Tracked hours", "追蹤工時"),
                    value: formatHours(totalTrackedHours),
                  },
                ]}
              />

              <div style={{ display: "grid", gap: 8 }}>
                {activeEmptyState ? (
                  <Banner
                    theme={theme}
                    tone={activeEmptyState.tone}
                    icon={activeEmptyState.icon}
                    title={activeEmptyState.title}
                    body={activeEmptyState.body}
                  />
                ) : null}
                {activeShiftViews
                  .filter((view) => !view.shift.vehicleId)
                  .slice(0, 3)
                  .map((view) => (
                    <Banner
                      key={view.shift.shiftId}
                      theme={theme}
                      tone="warn"
                      title={`${view.shift.driverId} · ${view.shift.shiftId}`}
                      body={copy(
                        locale,
                        "Clocked in but still missing vehicle pairing. Check maintenance impact or dispatch supply board.",
                        "已打卡但仍未完成掛車。請檢查維修影響或派車供給看板。",
                      )}
                    />
                  ))}
                {activeShiftViews.filter((view) => !view.shift.vehicleId)
                  .length === 0 ? (
                  <Banner
                    theme={theme}
                    tone="info"
                    title={copy(locale, "No vehicle gaps", "目前沒有掛車缺口")}
                    body={copy(
                      locale,
                      "Vehicle assignment looks healthy in the active slice.",
                      "進行中班次的掛車狀況目前正常。",
                    )}
                  />
                ) : null}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Link
                  href="/dispatch?board=no_eligible_supply"
                  style={actionLinkStyle("secondary")}
                >
                  {copy(
                    locale,
                    "Dispatch: no eligible supply",
                    "派車：無可派供給",
                  )}
                </Link>
                <Link href="/drivers" style={actionLinkStyle("secondary")}>
                  {copy(locale, "Driver registry", "司機主檔")}
                </Link>
                <a
                  href="/adapter-registry"
                  target="_blank"
                  rel="noreferrer"
                  style={actionLinkStyle("secondary")}
                >
                  {copy(locale, "Adapter registry", "Adapter registry")}
                </a>
              </div>
            </div>
          </Card>
        </div>

        <Card
          theme={theme}
          title={copy(locale, "Shift monitor", "班次監控")}
          subtitle={copy(
            locale,
            "Shift + attendance rows in the current slice, including row-level availableActions.",
            "目前範圍內的班次與出勤資料，包含列級 availableActions。",
          )}
          padding={0}
        >
          <Table theme={theme} columns={shiftColumns} rows={shiftRows} />
        </Card>

        <Card
          theme={theme}
          title={copy(locale, "Attendance timeline", "出勤時間軸")}
          subtitle={copy(
            locale,
            "Recent attendance rows rendered against the 24-hour UTC lane.",
            "最近出勤紀錄以 24 小時 UTC 軸呈現。",
          )}
        >
          <div style={timelineGridStyle}>
            <div style={timelineHeaderStyle}>
              <span>{copy(locale, "Driver / day", "司機 / 日期")}</span>
              <span>00:00 → 24:00 UTC</span>
              <span>{copy(locale, "State", "狀態")}</span>
            </div>
            {timelineRows.map((record) => {
              const start = attendanceTimelinePercent(record.clockedInAt) ?? 0;
              const end = attendanceTimelinePercent(record.clockedOutAt) ?? 100;
              const left = Math.min(start, end);
              const width = Math.max(6, Math.abs(end - start));
              const tone = toneForAttendanceStatus(record.status);
              const color =
                tone === "success"
                  ? theme.success
                  : tone === "danger"
                    ? theme.danger
                    : theme.warn;

              return (
                <div key={record.attendanceId} style={timelineRowStyle}>
                  <div>
                    <div style={{ fontWeight: 600, color: theme.text }}>
                      {record.driverId}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      {record.date} · {formatTime(locale, record.clockedInAt)} →{" "}
                      {formatTime(locale, record.clockedOutAt)}
                    </div>
                  </div>
                  <div
                    style={{
                      position: "relative",
                      height: 12,
                      borderRadius: 999,
                      background: theme.surfaceLo,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: `${left}%`,
                        width: `${width}%`,
                        top: 0,
                        bottom: 0,
                        borderRadius: 999,
                        background: color,
                      }}
                    />
                  </div>
                  <div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
                    <Pill theme={theme} tone={tone} dot>
                      {formatOpsCodeLabel(locale, record.status)}
                    </Pill>
                    <span style={{ fontSize: 11, color: theme.textMuted }}>
                      {formatHours(record.totalHours)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div style={secondaryGridStyle}>
          <Card
            theme={theme}
            title={copy(locale, "Attendance ledger", "出勤帳本")}
            subtitle={copy(
              locale,
              "Driver drill-in stays low risk",
              "司機 drill-in 屬於低風險導航操作",
            )}
            padding={0}
          >
            <Table
              theme={theme}
              columns={attendanceColumns}
              rows={attendanceRows}
            />
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Cross-surface pivots", "跨頁面跳轉")}
            subtitle={copy(
              locale,
              "Entry, exit, and degraded-state deep links required by packet §5.12",
              "依 packet §5.12 要求的入口、出口與降級時 deep link",
            )}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Link
                  href="/dispatch?board=no_eligible_supply"
                  style={actionLinkStyle("secondary")}
                >
                  {copy(
                    locale,
                    "Dispatch: no eligible supply",
                    "派車：無可派供給",
                  )}
                </Link>
                <Link href="/drivers" style={actionLinkStyle("secondary")}>
                  {copy(locale, "Driver registry", "司機主檔")}
                </Link>
                <Link href="/maintenance" style={actionLinkStyle("secondary")}>
                  {copy(locale, "Maintenance board", "維修看板")}
                </Link>
                <a
                  href="/adapter-registry"
                  target="_blank"
                  rel="noreferrer"
                  style={actionLinkStyle("secondary")}
                >
                  {copy(
                    locale,
                    "Platform admin: adapter registry",
                    "平台管理：adapter registry",
                  )}
                </a>
              </div>
              <Banner
                theme={theme}
                tone="info"
                title={copy(locale, "Deep-link contract", "Deep-link 契約")}
                body={copy(
                  locale,
                  "In-app exits stay same-tab to /drivers/[driverId]. Degraded upstream investigation pivots cross-app into platform-admin surfaces in a new tab.",
                  "站內出口維持同頁籤前往 /drivers/[driverId]；若上游降級，則以新分頁跨 app 跳到 platform-admin。",
                )}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
