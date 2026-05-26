"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  AttendanceRecord,
  DriverRegistryRecord,
  EmptyReason,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  ShiftRecord,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasIcon,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_INTERVAL_MS = 15_000;

type AttendanceTab = "today" | "week" | "anomaly";
type AttendanceEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;
type AnomalyCode =
  | "no_show"
  | "partial"
  | "missing_vehicle"
  | "long_running"
  | "abandoned";
type AnomalyFilter = "all" | AnomalyCode;

interface SnapshotState {
  shifts: ShiftRecord[];
  attendance: AttendanceRecord[];
  drivers: DriverRegistryRecord[];
  errors: Partial<Record<"shifts" | "attendance" | "drivers", string>>;
  refreshMeta: UiRefreshMetadata;
  health: UiHealthEnvelope;
}

interface ShiftRow extends Record<string, unknown> {
  shiftId: string;
  driverId: string;
  driverName: string | null;
  vehicleId: string | null;
  shiftStatus: ShiftRecord["status"];
  attendanceStatus: AttendanceRecord["status"] | null;
  attendanceId: string | null;
  dateKey: string;
  clockedInAt: string;
  clockedOutAt: string | null;
  totalHours: number | null;
  anomalyCodes: AnomalyCode[];
  availableActions: ResourceActionDescriptor[];
}

interface AttendanceLedgerRow extends Record<string, unknown> {
  attendanceId: string;
  shiftId: string;
  driverId: string;
  driverName: string | null;
  date: string;
  clockedInAt: string;
  clockedOutAt: string | null;
  totalHours: number | null;
  status: AttendanceRecord["status"];
  anomalyCodes: AnomalyCode[];
  availableActions: ResourceActionDescriptor[];
}

function copy(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const parsed = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shiftDateKey(value: string) {
  return value.slice(0, 10);
}

function addDays(dateKey: string, offset: number) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return parsed.toISOString().slice(0, 10);
}

function formatDateLabel(value: string, locale: "en" | "zh") {
  const parsed = parseDateKey(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "short",
    day: "2-digit",
    weekday: "short",
    timeZone: "UTC",
  }).format(parsed);
}

function formatDateTime(value: string | null | undefined, locale: "en" | "zh") {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(parsed);
}

function formatTime(value: string | null | undefined, locale: "en" | "zh") {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(parsed);
}

function formatHours(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(1)}h`;
}

function shiftDurationHours(shift: ShiftRecord) {
  if (typeof shift.totalHours === "number") return shift.totalHours;
  const start = new Date(shift.clockedInAt);
  const end = shift.clockedOutAt ? new Date(shift.clockedOutAt) : new Date();
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return diff > 0 ? diff : 0;
}

function trackPercent(value: string | null | undefined) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return Math.max(0, Math.min(100, (minutes / (24 * 60)) * 100));
}

function formatAttendanceTabLabel(
  locale: "en" | "zh",
  tab: AttendanceTab,
  count: number,
) {
  if (tab === "today") {
    return copy(locale, `Today · ${count}`, `今日 · ${count}`);
  }
  if (tab === "week") {
    return copy(locale, `Week · ${count}`, `本週 · ${count}`);
  }
  return copy(locale, `Anomaly · ${count}`, `異常 · ${count}`);
}

function formatAnomalyLabel(locale: "en" | "zh", code: AnomalyCode) {
  switch (code) {
    case "no_show":
      return copy(locale, "No-show", "未到班");
    case "partial":
      return copy(locale, "Partial attendance", "部分出勤");
    case "missing_vehicle":
      return copy(locale, "Vehicle missing", "未掛車");
    case "long_running":
      return copy(locale, "Extended shift", "超時班次");
    case "abandoned":
      return copy(locale, "Abandoned shift", "放棄班次");
  }
}

function anomalyTone(code: AnomalyCode): CanvasTone {
  switch (code) {
    case "no_show":
    case "abandoned":
      return "danger";
    case "partial":
    case "long_running":
      return "warn";
    case "missing_vehicle":
      return "info";
  }
}

function statusTone(
  status: ShiftRecord["status"] | AttendanceRecord["status"],
): CanvasTone {
  switch (status) {
    case "active":
      return "accent";
    case "completed":
    case "present":
      return "success";
    case "partial":
      return "warn";
    case "abandoned":
    case "absent":
      return "danger";
    default:
      return "neutral";
  }
}

function freshnessTone(
  freshness: UiRefreshMetadata["dataFreshness"],
): CanvasTone {
  switch (freshness) {
    case "fresh":
      return "success";
    case "degraded":
      return "warn";
    case "stale":
      return "danger";
    default:
      return "neutral";
  }
}

function healthTone(status: UiHealthEnvelope["status"]): CanvasTone {
  switch (status) {
    case "healthy":
      return "success";
    case "degraded":
      return "warn";
    case "down":
      return "danger";
    default:
      return "neutral";
  }
}

function currentFreshness(meta: UiRefreshMetadata, nowTick: number) {
  if (meta.dataFreshness === "degraded") return "degraded" as const;
  if (meta.dataFreshness === "unknown") return "unknown" as const;
  const generatedAt = new Date(meta.generatedAt).getTime();
  if (!Number.isFinite(generatedAt)) return "unknown" as const;
  if (nowTick - generatedAt > meta.staleAfterMs) return "stale" as const;
  return meta.dataFreshness;
}

function formatFreshnessLabel(
  locale: "en" | "zh",
  freshness: UiRefreshMetadata["dataFreshness"],
) {
  switch (freshness) {
    case "fresh":
      return copy(locale, "Fresh", "最新");
    case "stale":
      return copy(locale, "Stale", "過期");
    case "degraded":
      return copy(locale, "Degraded", "降級");
    default:
      return copy(locale, "Unknown", "未知");
  }
}

function normalizeTab(value: string | null): AttendanceTab {
  if (value === "week" || value === "anomaly") return value;
  return "today";
}

function normalizeAnomalyFilter(value: string | null): AnomalyFilter {
  if (
    value === "no_show" ||
    value === "partial" ||
    value === "missing_vehicle" ||
    value === "long_running" ||
    value === "abandoned"
  ) {
    return value;
  }
  return "all";
}

function normalizeEmptyReason(
  value: string | null,
): AttendanceEmptyReason | null {
  if (
    value === "no_data" ||
    value === "not_provisioned" ||
    value === "fetch_failed" ||
    value === "permission_denied" ||
    value === "external_unavailable" ||
    value === "filtered_empty"
  ) {
    return value;
  }
  return null;
}

function inferFailureReason(
  errors: Partial<Record<"shifts" | "attendance" | "drivers", string>>,
): AttendanceEmptyReason {
  const text = Object.values(errors).join(" ").toLowerCase();
  if (text.includes("403") || text.includes("forbidden")) {
    return "permission_denied";
  }
  if (
    text.includes("502") ||
    text.includes("503") ||
    text.includes("504") ||
    text.includes("timeout") ||
    text.includes("abort")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function disabledReasonLabel(
  locale: "en" | "zh",
  reasonCode: string | undefined,
) {
  switch (reasonCode) {
    case "no_anomalies":
      return copy(locale, "No anomalies in this view.", "目前視圖沒有異常。");
    case "missing_driver":
      return copy(
        locale,
        "Driver detail is unavailable.",
        "司機明細暫時不可用。",
      );
    case "permission_scope":
      return copy(
        locale,
        "Your scope cannot open this target.",
        "目前權限無法開啟此目標。",
      );
    default:
      return reasonCode ? formatOpsCodeLabel(locale, reasonCode) : undefined;
  }
}

function buildActionDescriptor(
  action: string,
  enabled: boolean,
  disabledReasonCode?: string,
): ResourceActionDescriptor {
  return disabledReasonCode
    ? {
        action,
        enabled,
        disabledReasonCode,
        riskLevel: "low",
      }
    : {
        action,
        enabled,
        riskLevel: "low",
      };
}

function actionSurfaceStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
  disabled = false,
): CSSProperties {
  const palette =
    variant === "primary"
      ? {
          background: theme.accent,
          color: "#fff",
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
    gap: 6,
    height: 28,
    padding: "5px 10px",
    borderRadius: 7,
    border: `1px solid ${palette.borderColor}`,
    background: palette.background,
    color: palette.color,
    fontSize: 12,
    fontWeight: 500,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    whiteSpace: "nowrap",
    boxShadow: variant === "primary" ? "0 1px 0 rgba(0, 0, 0, 0.08)" : "none",
  };
}

function DescriptorAction({
  descriptor,
  locale,
  label,
  icon,
  href,
  onClick,
  variant = "secondary",
}: {
  descriptor: ResourceActionDescriptor;
  locale: "en" | "zh";
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const disabledTitle = disabledReasonLabel(
    locale,
    descriptor.disabledReasonCode,
  );

  if (href) {
    if (!descriptor.enabled) {
      return (
        <span style={actionSurfaceStyle(variant, true)} title={disabledTitle}>
          {icon}
          {label}
        </span>
      );
    }
    return (
      <Link href={href} style={actionSurfaceStyle(variant)}>
        {icon}
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={!descriptor.enabled}
      onClick={onClick}
      title={descriptor.enabled ? undefined : disabledTitle}
      style={actionSurfaceStyle(variant, !descriptor.enabled)}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyStatePanel({
  locale,
  emptyState,
  onResetFilters,
  onRefresh,
}: {
  locale: "en" | "zh";
  emptyState: EmptyStateEnvelope;
  onResetFilters: () => void;
  onRefresh: () => void;
}) {
  const descriptor = emptyState.nextAction;
  let tone: CanvasTone = "neutral";
  let iconName: Parameters<typeof CanvasIcon>[0]["name"] = "attendance";
  let title = copy(locale, "No attendance snapshot", "沒有出勤快照");
  let body = emptyState.messageCode;
  let fallbackAction: ReactNode = null;

  switch (emptyState.reason) {
    case "no_data":
      tone = "info";
      iconName = "attendance";
      title = copy(locale, "No shifts for this date", "這一天沒有班次");
      body = copy(
        locale,
        "This can be a legitimate off-day. Move the date window or inspect the driver registry if supply should exist.",
        "這可能是正常休班日。可切換日期，或前往司機名冊確認今日是否應該有供給。",
      );
      fallbackAction = (
        <Link href="/drivers" style={actionSurfaceStyle("secondary")}>
          <CanvasIcon name="users" size={13} />
          {copy(locale, "Open drivers", "前往司機")}
        </Link>
      );
      break;
    case "not_provisioned":
      tone = "warn";
      iconName = "reports";
      title = copy(locale, "Schedule feed not provisioned", "排班來源尚未配置");
      body = copy(
        locale,
        "Shift records are not available for this scope yet. Attendance may exist, but scheduled windows have not been loaded into ops-console.",
        "目前此範圍尚未提供班次排程資料。出勤紀錄可能已存在，但排班視窗尚未載入 ops-console。",
      );
      fallbackAction = (
        <Link href="/reports" style={actionSurfaceStyle("secondary")}>
          <CanvasIcon name="reports" size={13} />
          {copy(locale, "Open reports", "前往報表")}
        </Link>
      );
      break;
    case "fetch_failed":
      tone = "danger";
      iconName = "warn";
      title = copy(locale, "Attendance fetch failed", "出勤資料載入失敗");
      body = copy(
        locale,
        "The latest attendance snapshot could not be fetched. Retry the live query before treating the board as empty.",
        "最新出勤快照抓取失敗。請先重試即時查詢，不要把此畫面誤判為真的空白。",
      );
      fallbackAction = (
        <button
          type="button"
          onClick={onRefresh}
          style={actionSurfaceStyle("primary")}
        >
          <CanvasIcon name="arrow" size={13} />
          {copy(locale, "Retry fetch", "重新抓取")}
        </button>
      );
      break;
    case "permission_denied":
      tone = "danger";
      iconName = "audit";
      title = copy(locale, "Permission denied", "沒有檢視權限");
      body = copy(
        locale,
        "This scope cannot read the attendance board. Review ops role codes or switch to a scope with attendance visibility.",
        "目前權限無法讀取出勤看板。請檢查 ops 角色範圍，或切換到具備出勤可視性的身份。",
      );
      break;
    case "external_unavailable":
      tone = "warn";
      iconName = "health";
      title = copy(
        locale,
        "Upstream dependency unavailable",
        "上游依賴暫時不可用",
      );
      body = copy(
        locale,
        "The board is reachable, but a dependency that provides attendance or shift data is down or timing out.",
        "頁面本身可用，但提供班次或出勤資料的依賴目前停擺或逾時。",
      );
      fallbackAction = (
        <button
          type="button"
          onClick={onRefresh}
          style={actionSurfaceStyle("secondary")}
        >
          <CanvasIcon name="arrow" size={13} />
          {copy(locale, "Retry dependency", "重試依賴")}
        </button>
      );
      break;
    case "filtered_empty":
      tone = "accent";
      iconName = "filter";
      title = copy(locale, "No rows match current filters", "目前篩選沒有資料");
      body = copy(
        locale,
        "Widen the driver/date/anomaly filters to restore rows.",
        "請放寬司機、日期或異常條件，才能重新看到資料。",
      );
      fallbackAction = (
        <button
          type="button"
          onClick={onResetFilters}
          style={actionSurfaceStyle("secondary")}
        >
          <CanvasIcon name="x" size={13} />
          {copy(locale, "Clear filters", "清除篩選")}
        </button>
      );
      break;
  }

  return (
    <CanvasCard
      theme={theme}
      title={copy(locale, "Empty state", "空狀態")}
      actions={
        <CanvasPill theme={theme} tone={tone}>
          {emptyState.reason}
        </CanvasPill>
      }
    >
      <div
        style={{
          display: "grid",
          placeItems: "center",
          gap: 14,
          minHeight: 260,
          textAlign: "center",
          padding: "12px 8px",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            display: "grid",
            placeItems: "center",
            background:
              tone === "danger"
                ? theme.dangerBg
                : tone === "warn"
                  ? theme.warnBg
                  : tone === "accent"
                    ? theme.accentBg
                    : theme.infoBg,
            border: `1px solid ${
              tone === "danger"
                ? theme.dangerBorder
                : tone === "warn"
                  ? theme.warnBorder
                  : tone === "accent"
                    ? theme.accentBorder
                    : theme.infoBorder
            }`,
            color:
              tone === "danger"
                ? theme.danger
                : tone === "warn"
                  ? theme.warn
                  : tone === "accent"
                    ? theme.accent
                    : theme.info,
          }}
        >
          <CanvasIcon name={iconName} size={24} />
        </div>
        <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>
            {title}
          </div>
          <div
            style={{ fontSize: 13, lineHeight: 1.55, color: theme.textMuted }}
          >
            {body}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {fallbackAction}
          {descriptor?.action === "clear_filters" ? (
            <button
              type="button"
              onClick={onResetFilters}
              style={actionSurfaceStyle("secondary")}
            >
              <CanvasIcon name="filter" size={13} />
              {copy(locale, "Reset view", "重設視圖")}
            </button>
          ) : null}
        </div>
      </div>
    </CanvasCard>
  );
}

export default function AttendancePage() {
  const { locale } = useTranslation();
  const searchParams = useSearchParams();
  const initialDate = searchParams.get("date") ?? todayDateKey();
  const initialTab = normalizeTab(searchParams.get("tab"));
  const initialDriver = searchParams.get("driverId") ?? "";
  const initialAnomaly = normalizeAnomalyFilter(searchParams.get("anomaly"));

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [activeTab, setActiveTab] = useState<AttendanceTab>(initialTab);
  const [driverQuery, setDriverQuery] = useState(initialDriver);
  const [anomalyFilter, setAnomalyFilter] =
    useState<AnomalyFilter>(initialAnomaly);
  const [snapshot, setSnapshot] = useState<SnapshotState>({
    shifts: [],
    attendance: [],
    drivers: [],
    errors: {},
    refreshMeta: {
      generatedAt: new Date().toISOString(),
      staleAfterMs: REFRESH_INTERVAL_MS,
      dataFreshness: "unknown",
      source: "live",
    },
    health: {
      status: "healthy",
      degradedServices: [],
      lastCheckedAt: new Date().toISOString(),
    },
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const deferredDriverQuery = useDeferredValue(
    driverQuery.trim().toLowerCase(),
  );
  const forcedEmptyReason = normalizeEmptyReason(
    searchParams.get("emptyReason"),
  );

  const refreshSnapshot = useEffectEvent(
    async (mode: "initial" | "manual" | "poll") => {
      if (mode === "initial") {
        setLoading(true);
      }
      if (mode === "manual") {
        setRefreshing(true);
      }

      const client = getOpsClient();
      const [shiftsResult, attendanceResult, driversResult] =
        await Promise.allSettled([
          client.listShifts(),
          client.listAttendance(),
          client.listDrivers(),
        ]);

      const checkedAt = new Date().toISOString();

      setSnapshot((previous) => {
        let nextShifts = previous.shifts;
        let nextAttendance = previous.attendance;
        let nextDrivers = previous.drivers;
        let successCount = 0;
        const errors: SnapshotState["errors"] = {};
        const degradedServices: UiHealthEnvelope["degradedServices"] = [];

        if (shiftsResult.status === "fulfilled") {
          nextShifts = shiftsResult.value;
          successCount += 1;
        } else {
          const message =
            shiftsResult.reason instanceof Error
              ? shiftsResult.reason.message
              : String(shiftsResult.reason);
          errors.shifts = message;
          degradedServices.push({
            service: "shift-attendance/shifts",
            impact: copy(
              locale,
              "Shift monitor and schedule coverage are unavailable.",
              "班次監控與排程覆蓋資訊不可用。",
            ),
            severity: "critical",
          });
        }

        if (attendanceResult.status === "fulfilled") {
          nextAttendance = attendanceResult.value;
          successCount += 1;
        } else {
          const message =
            attendanceResult.reason instanceof Error
              ? attendanceResult.reason.message
              : String(attendanceResult.reason);
          errors.attendance = message;
          degradedServices.push({
            service: "shift-attendance/attendance",
            impact: copy(
              locale,
              "Attendance ledger is degraded.",
              "出勤帳本已降級。",
            ),
            severity: "warning",
          });
        }

        if (driversResult.status === "fulfilled") {
          nextDrivers = driversResult.value;
          successCount += 1;
        } else {
          const message =
            driversResult.reason instanceof Error
              ? driversResult.reason.message
              : String(driversResult.reason);
          errors.drivers = message;
          degradedServices.push({
            service: "driver-registry",
            impact: copy(
              locale,
              "Driver drill-in links cannot be fully resolved.",
              "司機 drill-in 連結無法完整解析。",
            ),
            severity: "warning",
          });
        }

        const generatedAt =
          successCount > 0 ? checkedAt : previous.refreshMeta.generatedAt;
        const dataFreshness =
          successCount === 0
            ? previous.refreshMeta.dataFreshness === "unknown"
              ? "unknown"
              : "stale"
            : successCount === 3
              ? "fresh"
              : "degraded";

        return {
          shifts: nextShifts,
          attendance: nextAttendance,
          drivers: nextDrivers,
          errors,
          refreshMeta: {
            generatedAt,
            staleAfterMs: REFRESH_INTERVAL_MS,
            dataFreshness,
            source: "live",
          },
          health: {
            status:
              successCount === 3
                ? "healthy"
                : successCount === 0
                  ? "down"
                  : "degraded",
            degradedServices,
            lastCheckedAt: checkedAt,
          },
        };
      });

      setLoading(false);
      setRefreshing(false);
    },
  );

  useEffect(() => {
    void refreshSnapshot("initial");
  }, [refreshSnapshot]);

  useEffect(() => {
    const pollId = window.setInterval(() => {
      void refreshSnapshot("poll");
    }, REFRESH_INTERVAL_MS);
    const clockId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 5_000);
    return () => {
      window.clearInterval(pollId);
      window.clearInterval(clockId);
    };
  }, [refreshSnapshot]);

  const driversById = new Map(
    snapshot.drivers.map((driver) => [driver.driverId, driver]),
  );
  const attendanceByShiftId = new Map(
    snapshot.attendance.map((record) => [record.shiftId, record]),
  );
  const attendanceByDriverDate = new Map(
    snapshot.attendance.map((record) => [
      `${record.driverId}::${record.date}`,
      record,
    ]),
  );

  // Shift and attendance currently come from separate endpoints. Join them
  // conservatively so the UI can stay honest when one side is missing.
  const shiftRows: ShiftRow[] = snapshot.shifts
    .map((shift) => {
      const dateKey = shiftDateKey(shift.clockedInAt);
      const linkedAttendance =
        attendanceByShiftId.get(shift.shiftId) ??
        attendanceByDriverDate.get(`${shift.driverId}::${dateKey}`) ??
        null;
      const anomalyCodes: AnomalyCode[] = [];
      if (linkedAttendance?.status === "absent") anomalyCodes.push("no_show");
      if (linkedAttendance?.status === "partial") anomalyCodes.push("partial");
      if (!shift.vehicleId) anomalyCodes.push("missing_vehicle");
      if (shift.status === "abandoned") anomalyCodes.push("abandoned");
      if (shift.status === "active" && shiftDurationHours(shift) >= 10) {
        anomalyCodes.push("long_running");
      }

      const driver = driversById.get(shift.driverId);

      return {
        shiftId: shift.shiftId,
        driverId: shift.driverId,
        driverName: driver?.name ?? null,
        vehicleId: shift.vehicleId,
        shiftStatus: shift.status,
        attendanceStatus: linkedAttendance?.status ?? null,
        attendanceId: linkedAttendance?.attendanceId ?? null,
        dateKey,
        clockedInAt: shift.clockedInAt,
        clockedOutAt: shift.clockedOutAt,
        totalHours:
          shift.totalHours ?? Math.round(shiftDurationHours(shift) * 10) / 10,
        anomalyCodes,
        availableActions: [
          buildActionDescriptor(
            "open_driver_detail",
            Boolean(driver),
            driver ? undefined : "missing_driver",
          ),
          buildActionDescriptor(
            "open_supply_gap_board",
            anomalyCodes.length > 0,
            anomalyCodes.length > 0 ? undefined : "no_anomalies",
          ),
        ],
      };
    })
    .sort((left, right) => {
      const leftPriority = left.anomalyCodes.length > 0 ? 0 : 1;
      const rightPriority = right.anomalyCodes.length > 0 ? 0 : 1;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return right.clockedInAt.localeCompare(left.clockedInAt);
    });

  const attendanceLedger: AttendanceLedgerRow[] = snapshot.attendance
    .map((record) => {
      const anomalyCodes: AnomalyCode[] = [];
      if (record.status === "absent") anomalyCodes.push("no_show");
      if (record.status === "partial") anomalyCodes.push("partial");
      const driver = driversById.get(record.driverId);
      return {
        attendanceId: record.attendanceId,
        shiftId: record.shiftId,
        driverId: record.driverId,
        driverName: driver?.name ?? null,
        date: record.date,
        clockedInAt: record.clockedInAt,
        clockedOutAt: record.clockedOutAt,
        totalHours: record.totalHours,
        status: record.status,
        anomalyCodes,
        availableActions: [
          buildActionDescriptor(
            "open_driver_detail",
            Boolean(driver),
            driver ? undefined : "missing_driver",
          ),
        ],
      };
    })
    .sort((left, right) =>
      `${right.date}${right.clockedInAt}`.localeCompare(
        `${left.date}${left.clockedInAt}`,
      ),
    );

  const windowStart =
    activeTab === "week" ? addDays(selectedDate, -6) : selectedDate;
  const withinWindow = (dateKey: string) =>
    dateKey >= windowStart && dateKey <= selectedDate;

  const baseShiftRows = shiftRows.filter((row) => {
    if (!withinWindow(row.dateKey)) return false;
    if (!deferredDriverQuery) return true;
    const haystack = [row.driverId, row.driverName ?? "", row.vehicleId ?? ""]
      .join(" ")
      .toLowerCase();
    return haystack.includes(deferredDriverQuery);
  });

  const filteredShiftRows = baseShiftRows.filter((row) => {
    const needsAnomaly = activeTab === "anomaly" || anomalyFilter !== "all";
    if (!needsAnomaly) return true;
    if (anomalyFilter === "all") return row.anomalyCodes.length > 0;
    return row.anomalyCodes.includes(anomalyFilter);
  });

  const baseAttendanceRows = attendanceLedger.filter((row) => {
    if (!withinWindow(row.date)) return false;
    if (!deferredDriverQuery) return true;
    const haystack = [row.driverId, row.driverName ?? "", row.shiftId]
      .join(" ")
      .toLowerCase();
    return haystack.includes(deferredDriverQuery);
  });

  const filteredAttendanceRows = baseAttendanceRows.filter((row) => {
    const needsAnomaly = activeTab === "anomaly" || anomalyFilter !== "all";
    if (!needsAnomaly) return true;
    if (anomalyFilter === "all") return row.anomalyCodes.length > 0;
    return row.anomalyCodes.includes(anomalyFilter);
  });

  const metricShiftRows = baseShiftRows;
  const anomalyRows = baseShiftRows.filter(
    (row) => row.anomalyCodes.length > 0,
  );
  const anomalyCount = anomalyRows.length;
  const noShowCount = anomalyRows.filter((row) =>
    row.anomalyCodes.includes("no_show"),
  ).length;
  const longShiftCount = anomalyRows.filter((row) =>
    row.anomalyCodes.includes("long_running"),
  ).length;
  const vehicleGapCount = anomalyRows.filter((row) =>
    row.anomalyCodes.includes("missing_vehicle"),
  ).length;
  const scheduledCount = new Set(metricShiftRows.map((row) => row.driverId))
    .size;
  const activeCount = metricShiftRows.filter(
    (row) => row.shiftStatus === "active",
  ).length;
  const completedCount = metricShiftRows.filter(
    (row) => row.shiftStatus === "completed",
  ).length;
  const currentDateKey = todayDateKey();
  const isCurrentDayView =
    activeTab === "today" && selectedDate === currentDateKey;
  const freshness = currentFreshness(snapshot.refreshMeta, nowTick);
  const scheduleCoverageMissing =
    baseShiftRows.length === 0 && baseAttendanceRows.length > 0;

  const refreshAction = buildActionDescriptor("refresh_snapshot", true);
  const supplyBoardAction = buildActionDescriptor(
    "open_supply_gap_board",
    anomalyCount > 0,
    anomalyCount > 0 ? undefined : "no_anomalies",
  );

  const hasVisibleData =
    filteredShiftRows.length > 0 || filteredAttendanceRows.length > 0;
  let emptyState: EmptyStateEnvelope | null = null;

  if (!loading && !hasVisibleData) {
    if (forcedEmptyReason) {
      emptyState = {
        reason: forcedEmptyReason,
        messageCode: forcedEmptyReason,
        nextAction: buildActionDescriptor(
          forcedEmptyReason === "filtered_empty"
            ? "clear_filters"
            : "refresh_snapshot",
          true,
        ),
      };
    } else if (snapshot.health.status === "down") {
      const reason = inferFailureReason(snapshot.errors);
      emptyState = {
        reason,
        messageCode: Object.values(snapshot.errors).join(" "),
        nextAction: buildActionDescriptor("refresh_snapshot", true),
      };
    } else if (baseShiftRows.length > 0 || baseAttendanceRows.length > 0) {
      emptyState = {
        reason: "filtered_empty",
        messageCode: "filters.narrow",
        nextAction: buildActionDescriptor("clear_filters", true),
      };
    } else if (
      snapshot.shifts.length === 0 &&
      snapshot.attendance.length === 0 &&
      snapshot.drivers.length === 0
    ) {
      emptyState = {
        reason: "not_provisioned",
        messageCode: "attendance.not_provisioned",
      };
    } else {
      emptyState = {
        reason: "no_data",
        messageCode: "attendance.no_data",
      };
    }
  }

  const todayTabLabel = formatAttendanceTabLabel(
    locale,
    "today",
    shiftRows.filter((row) => row.dateKey === selectedDate).length,
  );
  const weekTabLabel = formatAttendanceTabLabel(
    locale,
    "week",
    shiftRows.filter((row) => withinWindow(row.dateKey)).length,
  );
  const anomalyTabLabel = formatAttendanceTabLabel(
    locale,
    "anomaly",
    shiftRows.filter(
      (row) => withinWindow(row.dateKey) && row.anomalyCodes.length > 0,
    ).length,
  );

  const titleDateRange =
    activeTab === "week"
      ? `${formatDateLabel(windowStart, locale)} → ${formatDateLabel(
          selectedDate,
          locale,
        )}`
      : formatDateLabel(selectedDate, locale);

  function resetFilters() {
    setSelectedDate(todayDateKey());
    setActiveTab("today");
    setDriverQuery("");
    setAnomalyFilter("all");
  }

  const filterButtonStyle = (selected: boolean): CSSProperties => ({
    ...actionSurfaceStyle(selected ? "primary" : "secondary"),
    height: 26,
    padding: "4px 10px",
    fontSize: 11.5,
  });

  const inputStyle: CSSProperties = {
    height: 34,
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    background: theme.bgRaised,
    color: theme.text,
    padding: "0 12px",
    fontSize: 12.5,
    outline: "none",
  };

  return (
    <div
      style={{
        minHeight: "100%",
        background:
          "radial-gradient(circle at top right, rgba(250,113,86,0.12), transparent 26%), radial-gradient(circle at top left, rgba(56,189,248,0.12), transparent 20%), linear-gradient(180deg, #08111f 0%, #0b1527 100%)",
        color: theme.text,
      }}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy(locale, "Attendance & Shifts", "班次與出勤")}
        subtitle={`${titleDateRange} · ${copy(
          locale,
          "T3 refresh every 15 seconds",
          "T3 每 15 秒刷新",
        )}`}
        actions={
          <>
            <CanvasPill
              theme={theme}
              tone={healthTone(snapshot.health.status)}
              dot
            >
              {copy(locale, "ops / production / OC", "ops / production / OC")}
            </CanvasPill>
            <CanvasPill theme={theme} tone={freshnessTone(freshness)} dot>
              {formatFreshnessLabel(locale, freshness)}
            </CanvasPill>
            <DescriptorAction
              descriptor={refreshAction}
              locale={locale}
              label={
                refreshing
                  ? copy(locale, "Refreshing…", "更新中…")
                  : copy(locale, "Refresh", "重新整理")
              }
              icon={<CanvasIcon name="arrow" size={13} />}
              onClick={() => {
                void refreshSnapshot("manual");
              }}
              variant="secondary"
            />
            <DescriptorAction
              descriptor={supplyBoardAction}
              locale={locale}
              label={copy(locale, "Supply board", "供給看板")}
              icon={<CanvasIcon name="dispatch" size={13} />}
              href="/dispatch?board=no_eligible_supply"
              variant="primary"
            />
          </>
        }
      />

      <div
        style={{
          padding: "18px 24px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: -2,
          }}
        >
          <CanvasPill theme={theme} tone="accent">
            {copy(
              locale,
              `Refresh tier · T3 ${REFRESH_TIER}`,
              `刷新層級 · T3 ${REFRESH_TIER}`,
            )}
          </CanvasPill>
          <CanvasPill theme={theme} tone="neutral">
            {copy(locale, "Generated", "生成時間")} ·{" "}
            {formatDateTime(snapshot.refreshMeta.generatedAt, locale)}
          </CanvasPill>
          <CanvasPill theme={theme} tone="neutral">
            {copy(locale, "Health checked", "健康檢查")} ·{" "}
            {formatDateTime(snapshot.health.lastCheckedAt, locale)}
          </CanvasPill>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            paddingBottom: 2,
          }}
        >
          {[
            ["today", todayTabLabel],
            ["week", weekTabLabel],
            ["anomaly", anomalyTabLabel],
          ].map(([value, label]) => {
            const selected = activeTab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveTab(value as AttendanceTab)}
                style={{
                  ...filterButtonStyle(selected),
                  borderBottom: `2px solid ${
                    selected ? theme.accentHi : theme.border
                  }`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <CanvasCard
          theme={theme}
          title={copy(locale, "Filters", "篩選條件")}
          actions={
            <button
              type="button"
              onClick={resetFilters}
              style={actionSurfaceStyle("ghost")}
            >
              <CanvasIcon name="x" size={13} />
              {copy(locale, "Reset", "重設")}
            </button>
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              alignItems: "end",
            }}
          >
            <label
              style={{
                display: "grid",
                gap: 6,
                fontSize: 11.5,
                color: theme.textMuted,
              }}
            >
              {copy(locale, "Date window", "日期範圍")}
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                style={inputStyle}
              />
            </label>
            <label
              style={{
                display: "grid",
                gap: 6,
                fontSize: 11.5,
                color: theme.textMuted,
              }}
            >
              {copy(locale, "Driver", "司機")}
              <input
                type="search"
                value={driverQuery}
                placeholder={copy(
                  locale,
                  "Search driver id or name",
                  "搜尋司機編號或姓名",
                )}
                onChange={(event) => setDriverQuery(event.target.value)}
                style={inputStyle}
              />
            </label>
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 11.5, color: theme.textMuted }}>
                {copy(locale, "Anomaly filter", "異常篩選")}
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    ["all", copy(locale, "All", "全部")],
                    ["no_show", formatAnomalyLabel(locale, "no_show")],
                    ["partial", formatAnomalyLabel(locale, "partial")],
                    [
                      "missing_vehicle",
                      formatAnomalyLabel(locale, "missing_vehicle"),
                    ],
                    [
                      "long_running",
                      formatAnomalyLabel(locale, "long_running"),
                    ],
                    ["abandoned", formatAnomalyLabel(locale, "abandoned")],
                  ] as Array<[AnomalyFilter, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAnomalyFilter(value)}
                    style={filterButtonStyle(anomalyFilter === value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CanvasCard>

        {freshness === "stale" ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="clock"
            title={copy(
              locale,
              "Attendance snapshot is stale",
              "出勤快照已過期",
            )}
            body={copy(
              locale,
              "The last successful snapshot is older than the T3 freshness window. Refresh before using this board for dispatch decisions.",
              "最後一次成功快照已超過 T3 新鮮度視窗。請先刷新，再用這個看板做派車判斷。",
            )}
          />
        ) : null}

        {snapshot.health.status !== "healthy" ? (
          <CanvasBanner
            theme={theme}
            tone={snapshot.health.status === "down" ? "danger" : "warn"}
            icon="health"
            title={copy(locale, "Live dependency degraded", "即時依賴已降級")}
            body={
              <div style={{ display: "grid", gap: 4 }}>
                {snapshot.health.degradedServices.map(
                  (service: UiHealthEnvelope["degradedServices"][number]) => (
                    <span key={service.service}>
                      <strong>{service.service}</strong> · {service.impact}
                    </span>
                  ),
                )}
              </div>
            }
          />
        ) : null}

        {anomalyCount >= 3 ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(locale, "Anomaly spike detected", "偵測到異常高峰")}
            body={copy(
              locale,
              `${anomalyCount} shifts in the active window need review, including ${noShowCount} no-show and ${vehicleGapCount} vehicle-gap case(s).`,
              `目前視窗有 ${anomalyCount} 筆班次需要檢視，其中包含 ${noShowCount} 筆未到班與 ${vehicleGapCount} 筆未掛車案例。`,
            )}
          />
        ) : null}

        {scheduleCoverageMissing ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="reports"
            title={copy(
              locale,
              "Attendance exists but shift coverage is missing",
              "已有出勤紀錄，但班次覆蓋缺失",
            )}
            body={copy(
              locale,
              "Attendance rows are available for this window, but no shift snapshot is loaded. Scheduled start/end remain not provisioned on this page.",
              "此視窗已有出勤紀錄，但尚未載入班次快照，因此本頁的排定開始/結束仍顯示為未配置。",
            )}
          />
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={theme}
            label={copy(locale, "Scheduled drivers", "排班司機")}
            value={String(scheduledCount)}
            sub={copy(
              locale,
              "Unique drivers in the active window",
              "目前視窗內唯一司機",
            )}
            hint={copy(
              locale,
              "Schedule feed may still be partial",
              "排班來源可能仍不完整",
            )}
          />
          <CanvasKPI
            theme={theme}
            label={copy(locale, "Active shifts", "活躍班次")}
            value={String(activeCount)}
            sub={copy(locale, "Drivers currently clocked in", "目前已上班司機")}
          />
          <CanvasKPI
            theme={theme}
            label={
              isCurrentDayView
                ? copy(locale, "Completed today", "今日完成班次")
                : copy(locale, "Completed in window", "視窗內完成班次")
            }
            value={String(completedCount)}
            sub={
              isCurrentDayView
                ? copy(
                    locale,
                    "Closed on the current service day",
                    "目前服務日已結束班次",
                  )
                : copy(
                    locale,
                    "Closed rows in the active window",
                    "目前視窗已結束班次",
                  )
            }
          />
          <CanvasKPI
            theme={theme}
            label={copy(locale, "Anomalies", "異常")}
            value={String(anomalyCount)}
            delta={
              noShowCount > 0
                ? copy(
                    locale,
                    `${noShowCount} no-show`,
                    `${noShowCount} 未到班`,
                  )
                : undefined
            }
            deltaTone={anomalyCount > 0 ? "down" : "neutral"}
            sub={copy(
              locale,
              "Extended, partial, no-show, or vehicle gaps",
              "超時、部分出勤、未到班或未掛車",
            )}
          />
        </div>

        {loading &&
        snapshot.shifts.length === 0 &&
        snapshot.attendance.length === 0 ? (
          <CanvasCard theme={theme} title={copy(locale, "Loading", "載入中")}>
            <div style={{ padding: "12px 4px", color: theme.textMuted }}>
              {copy(
                locale,
                "Loading the attendance snapshot from live ops endpoints…",
                "正在從即時營運端點載入出勤快照…",
              )}
            </div>
          </CanvasCard>
        ) : emptyState ? (
          <EmptyStatePanel
            locale={locale}
            emptyState={emptyState}
            onRefresh={() => {
              void refreshSnapshot("manual");
            }}
            onResetFilters={resetFilters}
          />
        ) : (
          <>
            <CanvasCard
              theme={theme}
              title={copy(
                locale,
                "Shift gantt · 0–24h UTC",
                "當班甘特 · 0–24h UTC",
              )}
              actions={
                <CanvasPill theme={theme} tone="neutral">
                  {copy(locale, "Top 8 rows", "前 8 列")}
                </CanvasPill>
              }
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "170px 1fr",
                  gap: "0 10px",
                  fontSize: 11.5,
                }}
              >
                <div />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(24, 1fr)",
                    borderBottom: `1px solid ${theme.border}`,
                    color: theme.textDim,
                    paddingBottom: 4,
                    fontFamily: theme.monoFamily,
                  }}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span key={hour} style={{ textAlign: "center" }}>
                      {hour.toString().padStart(2, "0")}
                    </span>
                  ))}
                </div>
                {filteredShiftRows.slice(0, 8).map((row) => {
                  const primaryAnomaly = row.anomalyCodes[0];
                  const start = trackPercent(row.clockedInAt);
                  const end = row.clockedOutAt
                    ? trackPercent(row.clockedOutAt)
                    : trackPercent(new Date(nowTick).toISOString());
                  const barTone = primaryAnomaly
                    ? anomalyTone(primaryAnomaly)
                    : "accent";
                  const barColor =
                    barTone === "danger"
                      ? theme.danger
                      : barTone === "warn"
                        ? theme.warn
                        : barTone === "info"
                          ? theme.info
                          : theme.accent;
                  const barBorder =
                    barTone === "danger"
                      ? theme.dangerBorder
                      : barTone === "warn"
                        ? theme.warnBorder
                        : barTone === "info"
                          ? theme.infoBorder
                          : theme.accentBorder;
                  const barBg =
                    barTone === "danger"
                      ? theme.dangerBg
                      : barTone === "warn"
                        ? theme.warnBg
                        : barTone === "info"
                          ? theme.infoBg
                          : theme.accentBg;

                  return (
                    <FragmentRow key={row.shiftId}>
                      <div
                        style={{
                          padding: "8px 0",
                          borderBottom: `1px dashed ${theme.border}`,
                          display: "grid",
                          gap: 4,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            minWidth: 0,
                          }}
                        >
                          {row.anomalyCodes.length > 0 ? (
                            <CanvasPill
                              theme={theme}
                              tone={
                                primaryAnomaly
                                  ? anomalyTone(primaryAnomaly)
                                  : "accent"
                              }
                              dot
                            >
                              {primaryAnomaly
                                ? formatAnomalyLabel(locale, primaryAnomaly)
                                : copy(locale, "Anomaly", "異常")}
                            </CanvasPill>
                          ) : null}
                          <span
                            style={{
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {row.driverName ?? row.driverId}
                          </span>
                        </div>
                        <span
                          style={{
                            color: theme.textMuted,
                            fontSize: 11,
                            fontFamily: theme.monoFamily,
                          }}
                        >
                          {row.driverId} · {row.dateKey}
                        </span>
                      </div>
                      <div
                        style={{
                          position: "relative",
                          height: 30,
                          borderBottom: `1px dashed ${theme.border}`,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 7,
                            left: `${Math.min(start, end)}%`,
                            width: `${Math.max(5, Math.abs(end - start))}%`,
                            height: 16,
                            borderRadius: 5,
                            background: barBg,
                            border: `1px solid ${barBorder}`,
                            color: barColor,
                            fontSize: 10.5,
                            paddingLeft: 6,
                            lineHeight: "14px",
                            fontFamily: theme.monoFamily,
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatTime(row.clockedInAt, locale)}–
                          {formatTime(row.clockedOutAt, locale)}
                        </div>
                      </div>
                    </FragmentRow>
                  );
                })}
              </div>
            </CanvasCard>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.65fr) minmax(300px, 0.95fr)",
                gap: 16,
              }}
            >
              <CanvasCard
                theme={theme}
                title={copy(locale, "Shift monitor", "班次監控")}
                actions={
                  <CanvasPill theme={theme} tone="neutral">
                    {copy(
                      locale,
                      "availableActions driven",
                      "由 availableActions 驅動",
                    )}
                  </CanvasPill>
                }
              >
                <CanvasTable<ShiftRow>
                  theme={theme}
                  rows={filteredShiftRows}
                  columns={[
                    {
                      h: "SHIFT",
                      w: 130,
                      mono: true,
                      r: (row) => (
                        <div style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontWeight: 700 }}>{row.shiftId}</span>
                          <span style={{ color: theme.textDim, fontSize: 11 }}>
                            {row.attendanceId ??
                              copy(locale, "No attendance", "無出勤")}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: copy(locale, "Driver", "司機"),
                      w: 220,
                      r: (row) => (
                        <div style={{ display: "grid", gap: 4 }}>
                          <span style={{ color: theme.text, fontWeight: 600 }}>
                            {row.driverName ?? row.driverId}
                          </span>
                          <span style={{ color: theme.textDim, fontSize: 11 }}>
                            {row.driverId}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: copy(locale, "Vehicle", "車輛"),
                      w: 120,
                      mono: true,
                      r: (row) =>
                        row.vehicleId ? (
                          row.vehicleId
                        ) : (
                          <CanvasPill theme={theme} tone="warn">
                            {copy(locale, "Missing", "缺失")}
                          </CanvasPill>
                        ),
                    },
                    {
                      h: copy(locale, "Scheduled", "排定"),
                      w: 150,
                      r: () => (
                        <div style={{ display: "grid", gap: 4 }}>
                          <CanvasPill theme={theme} tone="warn">
                            {copy(locale, "Not provisioned", "尚未配置")}
                          </CanvasPill>
                          <span style={{ color: theme.textDim, fontSize: 11 }}>
                            {copy(
                              locale,
                              "Schedule feed missing",
                              "排班來源缺失",
                            )}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: copy(locale, "Actual", "實際"),
                      w: 170,
                      mono: true,
                      r: (row) => (
                        <div style={{ display: "grid", gap: 4 }}>
                          <span>
                            {formatTime(row.clockedInAt, locale)}–
                            {formatTime(row.clockedOutAt, locale)}
                          </span>
                          <span style={{ color: theme.textDim, fontSize: 11 }}>
                            {formatHours(row.totalHours)}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: "STATUS",
                      w: 190,
                      r: (row) => (
                        <div
                          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                        >
                          <CanvasPill
                            theme={theme}
                            tone={statusTone(row.shiftStatus)}
                            dot
                          >
                            {formatOpsCodeLabel(locale, row.shiftStatus)}
                          </CanvasPill>
                          {row.attendanceStatus ? (
                            <CanvasPill
                              theme={theme}
                              tone={statusTone(row.attendanceStatus)}
                            >
                              {formatOpsCodeLabel(locale, row.attendanceStatus)}
                            </CanvasPill>
                          ) : null}
                        </div>
                      ),
                    },
                    {
                      h: copy(locale, "Anomalies", "異常"),
                      w: 200,
                      r: (row) =>
                        row.anomalyCodes.length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            {row.anomalyCodes.map((code) => (
                              <CanvasPill
                                key={code}
                                theme={theme}
                                tone={anomalyTone(code)}
                              >
                                {formatAnomalyLabel(locale, code)}
                              </CanvasPill>
                            ))}
                          </div>
                        ) : (
                          <CanvasPill theme={theme} tone="success">
                            {copy(locale, "Clear", "正常")}
                          </CanvasPill>
                        ),
                    },
                    {
                      h: copy(locale, "Actions", "動作"),
                      w: 210,
                      r: (row) => {
                        const openDriverAction =
                          row.availableActions[0] ??
                          buildActionDescriptor("open_driver_detail", false);
                        const supplyAction =
                          row.availableActions[1] ??
                          buildActionDescriptor(
                            "open_supply_gap_board",
                            false,
                            "no_anomalies",
                          );

                        return (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <DescriptorAction
                              descriptor={openDriverAction}
                              locale={locale}
                              label={copy(locale, "Open driver", "開啟司機")}
                              icon={<CanvasIcon name="users" size={13} />}
                              href={`/drivers/${encodeURIComponent(row.driverId)}`}
                            />
                            <DescriptorAction
                              descriptor={supplyAction}
                              locale={locale}
                              label={copy(locale, "Supply board", "供給看板")}
                              icon={<CanvasIcon name="dispatch" size={13} />}
                              href="/dispatch?board=no_eligible_supply"
                              variant="ghost"
                            />
                          </div>
                        );
                      },
                    },
                  ]}
                />
              </CanvasCard>

              <div style={{ display: "grid", gap: 16 }}>
                <CanvasCard
                  theme={theme}
                  title={copy(locale, "Anomaly queue", "異常佇列")}
                  actions={
                    <CanvasPill
                      theme={theme}
                      tone={anomalyCount > 0 ? "danger" : "neutral"}
                    >
                      {anomalyCount}
                    </CanvasPill>
                  }
                >
                  <div style={{ display: "grid", gap: 10 }}>
                    {anomalyRows.length > 0 ? (
                      anomalyRows.slice(0, 5).map((row) => (
                        <div
                          key={`anomaly-${row.shiftId}`}
                          style={{
                            border: `1px solid ${theme.border}`,
                            borderRadius: 8,
                            padding: "10px 12px",
                            background: theme.surfaceLo,
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 8,
                              alignItems: "flex-start",
                            }}
                          >
                            <div
                              style={{ display: "grid", gap: 4, minWidth: 0 }}
                            >
                              <strong style={{ color: theme.text }}>
                                {row.driverName ?? row.driverId}
                              </strong>
                              <span
                                style={{
                                  color: theme.textDim,
                                  fontSize: 11,
                                  fontFamily: theme.monoFamily,
                                }}
                              >
                                {row.shiftId} · {row.vehicleId ?? "—"}
                              </span>
                            </div>
                            <CanvasPill
                              theme={theme}
                              tone={
                                row.shiftStatus === "active"
                                  ? "accent"
                                  : "neutral"
                              }
                            >
                              {formatOpsCodeLabel(locale, row.shiftStatus)}
                            </CanvasPill>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            {row.anomalyCodes.map((code) => (
                              <CanvasPill
                                key={code}
                                theme={theme}
                                tone={anomalyTone(code)}
                                dot
                              >
                                {formatAnomalyLabel(locale, code)}
                              </CanvasPill>
                            ))}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                color: theme.textMuted,
                                fontSize: 11.5,
                              }}
                            >
                              {formatDateTime(row.clockedInAt, locale)}
                            </span>
                            <DescriptorAction
                              descriptor={
                                row.availableActions[0] ??
                                buildActionDescriptor(
                                  "open_driver_detail",
                                  false,
                                )
                              }
                              locale={locale}
                              label={copy(locale, "Driver detail", "司機明細")}
                              icon={<CanvasIcon name="ext" size={13} />}
                              href={`/drivers/${encodeURIComponent(row.driverId)}`}
                              variant="ghost"
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
                        {copy(
                          locale,
                          "No anomalies in the current window.",
                          "目前視窗沒有異常班次。",
                        )}
                      </div>
                    )}
                  </div>
                </CanvasCard>

                <CanvasCard
                  theme={theme}
                  title={copy(locale, "Runtime context", "執行上下文")}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      fontSize: 12.5,
                    }}
                  >
                    <RuntimeRow
                      label={copy(locale, "Refresh tier", "刷新層級")}
                      value={copy(locale, "T3 medium / 15s", "T3 中速 / 15 秒")}
                    />
                    <RuntimeRow
                      label={copy(locale, "Freshness", "新鮮度")}
                      value={formatFreshnessLabel(locale, freshness)}
                    />
                    <RuntimeRow
                      label={copy(locale, "Health", "健康度")}
                      value={formatOpsCodeLabel(locale, snapshot.health.status)}
                    />
                    <RuntimeRow
                      label={copy(locale, "Attendance rows", "出勤筆數")}
                      value={String(filteredAttendanceRows.length)}
                    />
                    <RuntimeRow
                      label={copy(locale, "Long shifts", "超時班次")}
                      value={String(longShiftCount)}
                    />
                  </div>
                </CanvasCard>
              </div>
            </div>

            <CanvasCard
              theme={theme}
              title={copy(locale, "Attendance ledger", "出勤帳本")}
              actions={
                <CanvasPill theme={theme} tone="neutral">
                  {copy(locale, "Linked to shift rows", "對應班次資料")}
                </CanvasPill>
              }
            >
              <CanvasTable<AttendanceLedgerRow>
                theme={theme}
                rows={filteredAttendanceRows}
                columns={[
                  {
                    h: "ATT",
                    w: 130,
                    mono: true,
                    r: (row) => (
                      <div style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 700 }}>
                          {row.attendanceId}
                        </span>
                        <span style={{ color: theme.textDim, fontSize: 11 }}>
                          {row.shiftId}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: copy(locale, "Driver", "司機"),
                    w: 220,
                    r: (row) => (
                      <div style={{ display: "grid", gap: 4 }}>
                        <span style={{ color: theme.text, fontWeight: 600 }}>
                          {row.driverName ?? row.driverId}
                        </span>
                        <span style={{ color: theme.textDim, fontSize: 11 }}>
                          {row.driverId}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: copy(locale, "Date", "日期"),
                    w: 150,
                    mono: true,
                    r: (row) => (
                      <div style={{ display: "grid", gap: 4 }}>
                        <span>{row.date}</span>
                        <span style={{ color: theme.textDim, fontSize: 11 }}>
                          {formatDateLabel(row.date, locale)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: copy(locale, "Window", "時段"),
                    w: 170,
                    mono: true,
                    r: (row) => (
                      <div style={{ display: "grid", gap: 4 }}>
                        <span>
                          {formatTime(row.clockedInAt, locale)}–
                          {formatTime(row.clockedOutAt, locale)}
                        </span>
                        <span style={{ color: theme.textDim, fontSize: 11 }}>
                          {formatHours(row.totalHours)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "STATUS",
                    w: 160,
                    r: (row) => (
                      <div
                        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                      >
                        <CanvasPill
                          theme={theme}
                          tone={statusTone(row.status)}
                          dot
                        >
                          {formatOpsCodeLabel(locale, row.status)}
                        </CanvasPill>
                        {row.anomalyCodes.map((code) => (
                          <CanvasPill
                            key={code}
                            theme={theme}
                            tone={anomalyTone(code)}
                          >
                            {formatAnomalyLabel(locale, code)}
                          </CanvasPill>
                        ))}
                      </div>
                    ),
                  },
                  {
                    h: copy(locale, "Actions", "動作"),
                    w: 140,
                    r: (row) => {
                      const openDriverAction =
                        row.availableActions[0] ??
                        buildActionDescriptor("open_driver_detail", false);

                      return (
                        <DescriptorAction
                          descriptor={openDriverAction}
                          locale={locale}
                          label={copy(locale, "Open driver", "開啟司機")}
                          icon={<CanvasIcon name="users" size={13} />}
                          href={`/drivers/${encodeURIComponent(row.driverId)}`}
                          variant="ghost"
                        />
                      );
                    },
                  },
                ]}
              />
            </CanvasCard>
          </>
        )}
      </div>
    </div>
  );
}

function FragmentRow({ children }: { children: [ReactNode, ReactNode] }) {
  return <>{children}</>;
}

function RuntimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 10,
      }}
    >
      <span
        style={{
          color: theme.textMuted,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <span style={{ color: theme.text }}>{value}</span>
    </div>
  );
}
