import Link from "next/link";
import type {
  AttendanceRecord,
  DriverRegistryRecord,
  ShiftRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
  type CanvasTheme,
} from "@drts/ui-web";

type AttendancePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type AttendanceView = "today" | "week" | "exceptions";

type GanttRow = {
  shiftId: string;
  driverLabel: string;
  vehicleLabel: string;
  status: ShiftRecord["status"];
  segmentLeft: number;
  segmentWidth: number;
  startLabel: string;
  endLabel: string;
  totalHoursLabel: string;
  hintLabel: string;
};

type ExceptionRow = Record<string, unknown> & {
  key: string;
  driver: string;
  shiftOrAttendance: string;
  status: string;
  statusTone: CanvasTone;
  window: string;
  impact: string;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageBodyStyle = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  alignItems: "start",
};

const ganttGridStyle = {
  display: "grid",
  gridTemplateColumns: "140px minmax(720px, 1fr)",
  gap: "0 8px",
  fontSize: 11,
};

const ganttHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(24, minmax(26px, 1fr))",
  color: theme.textDim,
  paddingBottom: 6,
  borderBottom: `1px solid ${theme.border}`,
  fontFamily: theme.monoFamily,
};

const ganttTrackGridStyle = {
  position: "absolute" as const,
  inset: 0,
  display: "grid",
  gridTemplateColumns: "repeat(24, minmax(26px, 1fr))",
};

const ganttSegmentStyle = {
  position: "absolute" as const,
  top: 6,
  height: 18,
  borderRadius: 4,
  border: `1px solid ${theme.accent}`,
  background: theme.accentBg,
  color: theme.accent,
  fontSize: 10.5,
  paddingLeft: 6,
  lineHeight: "16px",
  fontFamily: theme.monoFamily,
  overflow: "hidden" as const,
  whiteSpace: "nowrap" as const,
};

async function resolveOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveView(value: string | undefined): AttendanceView {
  if (value === "week" || value === "exceptions") {
    return value;
  }
  return "today";
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

function endOfUtcDay(date: Date) {
  return startOfUtcDay(date) + 24 * 60 * 60 * 1000;
}

function startOfTrailingWeek(date: Date) {
  return startOfUtcDay(date) - 6 * 24 * 60 * 60 * 1000;
}

function asTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function isAttendanceInRange(
  record: AttendanceRecord,
  rangeStart: number,
  rangeEnd: number,
) {
  const dateStart = Date.parse(`${record.date}T00:00:00.000Z`);
  return Number.isFinite(dateStart)
    ? dateStart >= rangeStart && dateStart < rangeEnd
    : false;
}

function formatDateLabel(locale: Locale, value: Date) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "UTC",
  }).format(value);
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

function formatHourSpan(hours: number | null | undefined, locale: Locale) {
  if (hours === null || hours === undefined) {
    return "—";
  }

  return t("attendance.hours", locale, { h: hours.toFixed(1) });
}

function formatHourTick(hour: number) {
  return hour.toString().padStart(2, "0");
}

function formatSegmentHour(value: number) {
  const whole = Math.floor(value);
  const minutes = Math.round((value - whole) * 60);
  const normalizedMinutes = minutes === 60 ? 0 : minutes;
  const normalizedHour = minutes === 60 ? whole + 1 : whole;
  return `${normalizedHour.toString().padStart(2, "0")}:${normalizedMinutes
    .toString()
    .padStart(2, "0")}`;
}

function formatAttendanceRate(
  numerator: number,
  denominator: number,
  locale: Locale,
) {
  if (denominator === 0) {
    return locale === "en" ? "No records" : "無記錄";
  }
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function shiftTone(status: ShiftRecord["status"]): CanvasTone {
  if (status === "active") return "info";
  if (status === "completed") return "success";
  return "danger";
}

function attendanceTone(status: AttendanceRecord["status"]): CanvasTone {
  if (status === "present") return "success";
  if (status === "partial") return "warn";
  return "danger";
}

function buildShellNav(locale: Locale): CanvasShellNavItem[] {
  return [
    {
      divider: locale === "en" ? "Workspaces" : "工作面",
    },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: t("nav.dashboard", locale),
    },
    {
      divider: locale === "en" ? "Live Ops" : "即時派遣",
    },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: t("nav.dispatch", locale),
      matchPaths: ["/dispatch"],
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: t("nav.callcenter", locale),
    },
    {
      divider: locale === "en" ? "Casework" : "案件處理",
    },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: t("nav.complaints", locale),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: t("nav.incidents", locale),
    },
    {
      divider: locale === "en" ? "Monitoring" : "營運監控",
    },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: t("nav.reports", locale),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: t("nav.revenue", locale),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: t("nav.attendance", locale),
      matchPaths: ["/attendance"],
    },
    {
      divider: locale === "en" ? "Registry" : "主資料",
    },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet",
      label: t("nav.drivers", locale),
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: t("nav.vehicles", locale),
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts",
      label: t("nav.contracts", locale),
    },
    {
      key: "feature-flags",
      href: "/feature-flags",
      icon: "flags",
      label: t("nav.featureFlags", locale),
    },
  ];
}

function renderTabLink(
  href: string,
  label: string,
  count: number,
  selected: boolean,
  activeTheme: CanvasTheme,
) {
  return (
    <Link
      href={href}
      style={{
        color: selected ? activeTheme.text : activeTheme.textMuted,
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontSize: 10.5,
          fontFamily: activeTheme.monoFamily,
          color: selected ? activeTheme.text : activeTheme.textDim,
        }}
      >
        {count}
      </span>
    </Link>
  );
}

function buildDriverLookup(drivers: DriverRegistryRecord[]) {
  return new Map(drivers.map((driver) => [driver.driverId, driver]));
}

function buildGanttRows(
  shifts: ShiftRecord[],
  driversById: Map<string, DriverRegistryRecord>,
  rangeStart: number,
  rangeEnd: number,
  now: number,
  locale: Locale,
): GanttRow[] {
  return shifts
    .filter((shift) =>
      intersectsRange(shift.clockedInAt, shift.clockedOutAt, rangeStart, rangeEnd),
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
    .map((shift) => {
      const driver = driversById.get(shift.driverId);
      const startTime = Math.max(asTime(shift.clockedInAt) ?? rangeStart, rangeStart);
      const rawEndTime =
        asTime(shift.clockedOutAt) ??
        (shift.status === "active" ? Math.min(now, rangeEnd) : startTime + 60 * 60 * 1000);
      const endTime = Math.max(startTime + 30 * 60 * 1000, Math.min(rawEndTime, rangeEnd));
      const leftHours = (startTime - rangeStart) / (60 * 60 * 1000);
      const widthHours = Math.max((endTime - startTime) / (60 * 60 * 1000), 0.5);

      return {
        shiftId: shift.shiftId,
        driverLabel: driver?.name ?? shift.driverId,
        vehicleLabel: shift.vehicleId ?? "—",
        status: shift.status,
        segmentLeft: (leftHours / 24) * 100,
        segmentWidth: (Math.min(widthHours, 24) / 24) * 100,
        startLabel: formatSegmentHour(leftHours),
        endLabel: formatSegmentHour(Math.min(leftHours + widthHours, 24)),
        totalHoursLabel: formatHourSpan(shift.totalHours, locale),
        hintLabel:
          locale === "en"
            ? `${formatOpsCodeLabel(locale, shift.status)} · ${shift.vehicleId ?? "No vehicle"}`
            : `${formatOpsCodeLabel(locale, shift.status)} · ${shift.vehicleId ?? "未綁定車輛"}`,
      };
    });
}

function buildExceptionRows(
  shifts: ShiftRecord[],
  attendanceRecords: AttendanceRecord[],
  driversById: Map<string, DriverRegistryRecord>,
  locale: Locale,
): ExceptionRow[] {
  const shiftRows = shifts
    .filter((shift) => shift.status === "abandoned")
    .map((shift) => {
      const driver = driversById.get(shift.driverId);
      return {
        key: `shift-${shift.shiftId}`,
        driver: driver?.name ?? shift.driverId,
        shiftOrAttendance: shift.shiftId,
        status: formatOpsCodeLabel(locale, shift.status),
        statusTone: shiftTone(shift.status),
        window: `${formatDateTime(locale, shift.clockedInAt)} → ${formatDateTime(locale, shift.clockedOutAt)}`,
        impact:
          locale === "en"
            ? "Shift closed without clean clock-out."
            : "班次未正常收班即結束。",
      };
    });

  const attendanceRows = attendanceRecords
    .filter((record) => record.status !== "present")
    .map((record) => {
      const driver = driversById.get(record.driverId);
      return {
        key: `attendance-${record.attendanceId}`,
        driver: driver?.name ?? record.driverId,
        shiftOrAttendance: record.attendanceId,
        status: formatOpsCodeLabel(locale, record.status),
        statusTone: attendanceTone(record.status),
        window: `${record.date} · ${formatDateTime(locale, record.clockedInAt)} → ${formatDateTime(locale, record.clockedOutAt)}`,
        impact:
          record.status === "partial"
            ? locale === "en"
              ? "Partial attendance needs supervisor confirmation."
              : "部分出勤需要主管確認。"
            : locale === "en"
              ? "Driver marked absent for this shift."
              : "該班次司機記錄為缺勤。",
      };
    });

  return [...attendanceRows, ...shiftRows].slice(0, 8);
}

export default async function AttendancePage({
  searchParams,
}: AttendancePageProps) {
  const [locale, client, params] = await Promise.all([
    getServerLocale(),
    getServerOpsClient(),
    searchParams ?? Promise.resolve({}),
  ]);

  const view = resolveView(firstParam(params.view));
  const nowDate = new Date();
  const now = nowDate.getTime();
  const todayStart = startOfUtcDay(nowDate);
  const todayEnd = endOfUtcDay(nowDate);
  const weekStart = startOfTrailingWeek(nowDate);
  const weekEnd = todayEnd;

  const [shifts, attendanceRecords, drivers] = await Promise.all([
    resolveOrFallback(() => client.listShifts(), [] as ShiftRecord[]),
    resolveOrFallback(() => client.listAttendance(), [] as AttendanceRecord[]),
    resolveOrFallback(() => client.listDrivers(), [] as DriverRegistryRecord[]),
  ]);

  const driversById = buildDriverLookup(drivers);
  const todayShifts = shifts.filter((shift) =>
    intersectsRange(shift.clockedInAt, shift.clockedOutAt, todayStart, todayEnd),
  );
  const weekShifts = shifts.filter((shift) =>
    intersectsRange(shift.clockedInAt, shift.clockedOutAt, weekStart, weekEnd),
  );
  const todayAttendance = attendanceRecords.filter((record) =>
    isAttendanceInRange(record, todayStart, todayEnd),
  );
  const weekAttendance = attendanceRecords.filter((record) =>
    isAttendanceInRange(record, weekStart, weekEnd),
  );

  const scopeShifts = view === "week" ? weekShifts : todayShifts;
  const scopeAttendance = view === "week" ? weekAttendance : todayAttendance;
  const activeShifts = scopeShifts.filter((shift) => shift.status === "active");
  const completedShifts = scopeShifts.filter(
    (shift) => shift.status === "completed",
  );
  const exceptionRows = buildExceptionRows(
    scopeShifts,
    view === "week" ? weekAttendance : todayAttendance,
    driversById,
    locale,
  );
  const exceptionCount = exceptionRows.length;
  const presentCount = scopeAttendance.filter(
    (record) => record.status === "present",
  ).length;
  const partialOrAbsentCount = scopeAttendance.filter(
    (record) => record.status !== "present",
  ).length;
  const ganttRows = buildGanttRows(
    todayShifts,
    driversById,
    todayStart,
    todayEnd,
    now,
    locale,
  );
  const scopeLabel =
    view === "week"
      ? locale === "en"
        ? "This week"
        : "本週"
      : view === "exceptions"
        ? locale === "en"
          ? "Exception focus"
          : "異常焦點"
        : locale === "en"
          ? "Today"
          : "今日";

  const subtitle =
    locale === "en"
      ? `${formatDateLabel(locale, nowDate)} · ${scopeLabel}`
      : `${formatDateLabel(locale, nowDate)} · ${scopeLabel}`;

  const tabConfigs = [
    {
      key: "today" as const,
      href: "/attendance",
      label: locale === "en" ? "Today" : "今日",
      count: todayShifts.length,
    },
    {
      key: "week" as const,
      href: "/attendance?view=week",
      label: locale === "en" ? "This week" : "本週",
      count: weekShifts.length,
    },
    {
      key: "exceptions" as const,
      href: "/attendance?view=exceptions",
      label: locale === "en" ? "Exceptions" : "異常",
      count: buildExceptionRows(todayShifts, todayAttendance, driversById, locale)
        .length,
    },
  ];
  const tabs = tabConfigs.map((tab) =>
    renderTabLink(tab.href, tab.label, tab.count, tab.key === view, theme),
  );
  const activeTab = tabs[tabConfigs.findIndex((tab) => tab.key === view)];

  const exceptionColumns: CanvasTableColumn<ExceptionRow>[] = [
    {
      h: t("attendance.col.driver", locale),
      k: "driver",
      w: 160,
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{row.driver}</span>
          <span style={{ color: theme.textMuted, fontFamily: theme.monoFamily }}>
            {row.shiftOrAttendance}
          </span>
        </div>
      ),
    },
    {
      h: t("attendance.col.status", locale),
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={row.statusTone} dot>
          {row.status}
        </Pill>
      ),
    },
    {
      h: locale === "en" ? "Window" : "時段",
      k: "window",
      mono: true,
      w: 220,
    },
    {
      h: locale === "en" ? "Impact" : "影響",
      k: "impact",
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: theme.bg,
      }}
    >
      <Shell
        theme={theme}
        nav={buildShellNav(locale)}
        active="attendance"
        currentPath="/attendance"
        breadcrumb={[t("nav.attendance", locale)]}
        searchPlaceholder={
          locale === "en"
            ? "Search driver, shift, or vehicle..."
            : "搜尋司機、班次或車輛..."
        }
        brandLabel={t("app.name", locale)}
        brandSubLabel={t("app.sub", locale)}
        env={locale === "en" ? "staging" : "測試"}
        versionLabel="OC"
        avatarLabel="OC"
      >
        <PageHeader
          theme={theme}
          title={t("attendance.title", locale)}
          subtitle={subtitle}
          tabs={tabs}
          activeTab={activeTab}
          actions={
            <>
              <Btn theme={theme} icon="clock">
                {scopeLabel}
              </Btn>
              <Btn theme={theme} variant="primary" icon="ext">
                {locale === "en" ? "Export" : "匯出"}
              </Btn>
            </>
          }
        />

        <div style={pageBodyStyle}>
          <div style={kpiGridStyle}>
            <KPI
              theme={theme}
              label={locale === "en" ? "Scheduled drivers" : "排班司機"}
              value={new Set(scopeShifts.map((shift) => shift.driverId)).size}
              sub={
                locale === "en"
                  ? `${drivers.length} drivers in registry`
                  : `司機主檔 ${drivers.length} 人`
              }
            />
            <KPI
              theme={theme}
              label={t("attendance.activeShifts", locale)}
              value={activeShifts.length}
              sub={
                locale === "en"
                  ? `${formatAttendanceRate(activeShifts.length, Math.max(scopeShifts.length, 1), locale)} of visible shifts`
                  : `可視班次佔比 ${formatAttendanceRate(activeShifts.length, Math.max(scopeShifts.length, 1), locale)}`
              }
            />
            <KPI
              theme={theme}
              label={t("attendance.completedShifts", locale)}
              value={completedShifts.length}
              sub={
                locale === "en"
                  ? `${scopeAttendance.length} attendance records`
                  : `出勤記錄 ${scopeAttendance.length} 筆`
              }
            />
            <KPI
              theme={theme}
              label={locale === "en" ? "Exception / late" : "異常 / 遲到"}
              value={partialOrAbsentCount}
              delta={
                partialOrAbsentCount > 0
                  ? locale === "en"
                    ? `${exceptionCount} need follow-up`
                    : `${exceptionCount} 筆待追蹤`
                  : undefined
              }
              deltaTone={partialOrAbsentCount > 0 ? "down" : "neutral"}
              sub={
                locale === "en"
                  ? `${presentCount} marked present`
                  : `${presentCount} 筆正常出勤`
              }
            />
          </div>

          <div style={summaryGridStyle}>
            <Card
              theme={theme}
              title={locale === "en" ? "On-duty gantt" : "當班甘特"}
              subtitle={
                locale === "en"
                  ? "24-hour roster by driver"
                  : "24 小時欄位 × 司機列"
              }
              actions={
                <Pill theme={theme} tone="info">
                  {locale === "en" ? `${ganttRows.length} rows` : `${ganttRows.length} 列`}
                </Pill>
              }
              padding={16}
            >
              <div style={{ overflowX: "auto" }}>
                <div style={ganttGridStyle}>
                  <div />
                  <div style={ganttHeaderStyle}>
                    {Array.from({ length: 24 }, (_, index) => (
                      <span key={index} style={{ textAlign: "center" }}>
                        {formatHourTick(index)}
                      </span>
                    ))}
                  </div>

                  {ganttRows.map((row) => (
                    <div key={row.shiftId} style={{ display: "contents" }}>
                      <div
                        style={{
                          padding: "8px 0",
                          borderBottom: `1px dashed ${theme.border}`,
                          display: "grid",
                          gap: 2,
                        }}
                      >
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {row.driverLabel}
                        </span>
                        <span
                          style={{
                            color: theme.textMuted,
                            fontSize: 10.5,
                            fontFamily: theme.monoFamily,
                          }}
                        >
                          {row.vehicleLabel}
                        </span>
                      </div>
                      <div
                        style={{
                          position: "relative",
                          height: 34,
                          borderBottom: `1px dashed ${theme.border}`,
                        }}
                      >
                        <div style={ganttTrackGridStyle}>
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
                            ...ganttSegmentStyle,
                            left: `${row.segmentLeft}%`,
                            width: `${row.segmentWidth}%`,
                            borderColor:
                              row.status === "completed"
                                ? theme.success
                                : row.status === "abandoned"
                                  ? theme.danger
                                  : theme.accent,
                            background:
                              row.status === "completed"
                                ? "rgba(52, 211, 153, 0.14)"
                                : row.status === "abandoned"
                                  ? "rgba(248, 113, 113, 0.14)"
                                  : theme.accentBg,
                            color:
                              row.status === "completed"
                                ? theme.success
                                : row.status === "abandoned"
                                  ? theme.danger
                                  : theme.accent,
                          }}
                        >
                          {row.startLabel}–{row.endLabel}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <div style={{ display: "grid", gap: 16 }}>
              <Banner
                theme={theme}
                tone={exceptionCount > 0 ? "warn" : "info"}
                icon={exceptionCount > 0 ? "warn" : "check"}
                title={
                  exceptionCount > 0
                    ? locale === "en"
                      ? "Attendance exceptions need review"
                      : "出勤異常待複核"
                    : locale === "en"
                      ? "Attendance flow is stable"
                      : "出勤流穩定"
                }
                body={
                  exceptionCount > 0
                    ? locale === "en"
                      ? `${exceptionCount} records are partial, absent, or abandoned in the selected scope.`
                      : `所選範圍內共有 ${exceptionCount} 筆部分出勤、缺勤或異常收班。`
                    : locale === "en"
                      ? "No partial, absent, or abandoned records are visible right now."
                      : "目前沒有可見的部分出勤、缺勤或異常收班記錄。"
                }
              />

              <Card
                theme={theme}
                title={locale === "en" ? "Shift summary" : "班次摘要"}
                subtitle={scopeLabel}
                padding={16}
              >
                <DL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      label: t("attendance.attendanceRecords", locale),
                      value: scopeAttendance.length,
                      mono: true,
                    },
                    {
                      label: locale === "en" ? "Present rate" : "正常出勤率",
                      value: formatAttendanceRate(
                        presentCount,
                        Math.max(scopeAttendance.length, 1),
                        locale,
                      ),
                      mono: true,
                    },
                    {
                      label: locale === "en" ? "Abandoned shifts" : "異常收班",
                      value: scopeShifts.filter((shift) => shift.status === "abandoned")
                        .length,
                      mono: true,
                    },
                    {
                      label: locale === "en" ? "Avg hours" : "平均工時",
                      value: formatHourSpan(
                        scopeAttendance.length > 0
                          ? Number(
                              (
                                scopeAttendance.reduce(
                                  (sum, record) => sum + (record.totalHours ?? 0),
                                  0,
                                ) / scopeAttendance.length
                              ).toFixed(1),
                            )
                          : null,
                        locale,
                      ),
                      mono: true,
                    },
                  ]}
                />
              </Card>

              <Card
                theme={theme}
                title={locale === "en" ? "Supervisor cues" : "主管提示"}
                subtitle={locale === "en" ? "Realtime roster watchpoints" : "即時排班觀察點"}
                padding={16}
              >
                <Field
                  theme={theme}
                  label={locale === "en" ? "Current focus" : "目前焦點"}
                  hint={
                    locale === "en"
                      ? "Selected tab changes the KPI scope, while the gantt remains pinned to the current day."
                      : "頁籤切換 KPI 範圍，甘特則固定顯示當日當班。"
                  }
                >
                  <Pill
                    theme={theme}
                    tone={view === "exceptions" ? "warn" : "info"}
                    dot
                  >
                    {scopeLabel}
                  </Pill>
                </Field>
                <Field
                  theme={theme}
                  label={locale === "en" ? "Coverage" : "覆蓋狀態"}
                  hint={
                    locale === "en"
                      ? "Unique drivers with a visible shift in the selected scope."
                      : "所選範圍內有可見班次的唯一司機數。"
                  }
                >
                  <div
                    style={{
                      color: theme.text,
                      fontFamily: theme.monoFamily,
                      fontSize: 12.5,
                    }}
                  >
                    {new Set(scopeShifts.map((shift) => shift.driverId)).size}
                  </div>
                </Field>
                <Field
                  theme={theme}
                  label={locale === "en" ? "Exception queue" : "異常佇列"}
                  hint={
                    locale === "en"
                      ? "Partial attendance, absence, and abandoned shifts."
                      : "包含部分出勤、缺勤與異常收班。"
                  }
                >
                  <div
                    style={{
                      color: exceptionCount > 0 ? theme.danger : theme.text,
                      fontFamily: theme.monoFamily,
                      fontSize: 12.5,
                    }}
                  >
                    {exceptionCount}
                  </div>
                </Field>
              </Card>
            </div>
          </div>

          <Card
            theme={theme}
            title={locale === "en" ? "Attention queue" : "關注佇列"}
            subtitle={
              locale === "en"
                ? "Partial attendance, absences, and abandoned shifts"
                : "部分出勤、缺勤與異常收班"
            }
            padding={0}
          >
            {exceptionRows.length > 0 ? (
              <Table
                theme={theme}
                columns={exceptionColumns}
                rows={exceptionRows}
              />
            ) : (
              <div
                style={{
                  padding: 16,
                  color: theme.textMuted,
                  fontSize: 12.5,
                }}
              >
                {t("attendance.emptyAttendance", locale)}
              </div>
            )}
          </Card>
        </div>
      </Shell>
    </div>
  );
}
