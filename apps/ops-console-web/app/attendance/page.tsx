import Link from "next/link";
import type {
  AttendanceRecord,
  DriverRegistryRecord,
  ShiftRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  buildCanvasTheme,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

type AttendancePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type AttendanceView = "today" | "week" | "exceptions";

type GanttRow = {
  shiftId: string;
  driverLabel: string;
  status: ShiftRecord["status"];
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

const pageBodyStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const ganttGridStyle = {
  display: "grid",
  gridTemplateColumns: "120px minmax(720px, 1fr)",
  fontSize: 11,
  gap: "0 8px",
};

const ganttHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
  color: theme.textDim,
  paddingBottom: 4,
  borderBottom: `1px solid ${theme.border}`,
  fontFamily: theme.monoFamily,
};

const ganttTrackStyle = {
  position: "absolute" as const,
  inset: 0,
  display: "grid",
  gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
};

const ganttSegmentBaseStyle = {
  position: "absolute" as const,
  top: 6,
  height: 16,
  borderRadius: 4,
  fontSize: 10,
  paddingLeft: 6,
  lineHeight: "14px",
  fontFamily: theme.monoFamily,
  overflow: "hidden" as const,
  whiteSpace: "nowrap" as const,
};

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

function formatCanvasDateLabel(locale: Locale, value: Date) {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  const weekday = new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    weekday: locale === "zh" ? "short" : "short",
    timeZone: "UTC",
  }).format(value);

  return locale === "zh"
    ? `${year}-${month}-${day} (${weekday})`
    : `${year}-${month}-${day} (${weekday})`;
}

function formatHourTick(hour: number) {
  return hour.toString().padStart(2, "0");
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
  if (status === "completed") return "success";
  if (status === "abandoned") return "danger";
  return "info";
}

function renderTabLink(
  href: string,
  label: string,
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
        gap: 8,
      }}
    >
      <span>{label}</span>
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
): GanttRow[] {
  return shifts
    .filter((shift) =>
      intersectsRange(
        shift.clockedInAt,
        shift.clockedOutAt,
        rangeStart,
        rangeEnd,
      ),
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
      const startTime = Math.max(
        asTime(shift.clockedInAt) ?? rangeStart,
        rangeStart,
      );
      const rawEndTime =
        asTime(shift.clockedOutAt) ??
        (shift.status === "active"
          ? Math.min(now, rangeEnd)
          : startTime + 60 * 60 * 1000);
      const endTime = Math.max(
        startTime + 30 * 60 * 1000,
        Math.min(rawEndTime, rangeEnd),
      );
      const leftHours = (startTime - rangeStart) / (60 * 60 * 1000);
      const widthHours = Math.max(
        (endTime - startTime) / (60 * 60 * 1000),
        0.5,
      );

      return {
        shiftId: shift.shiftId,
        driverLabel: driver?.name ?? shift.driverId,
        status: shift.status,
        segmentLeft: (leftHours / 24) * 100,
        segmentWidth: (Math.min(widthHours, 24) / 24) * 100,
        startLabel: formatSegmentHour(leftHours),
        endLabel: formatSegmentHour(Math.min(leftHours + widthHours, 24)),
      };
    });
}

export default async function AttendancePage({
  searchParams,
}: AttendancePageProps) {
  const [locale, client, params] = await Promise.all([
    getServerLocale(),
    getServerOpsClient(),
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);

  const view = resolveView(firstParam(params.view));
  const nowDate = new Date();
  const now = nowDate.getTime();
  const todayStart = startOfUtcDay(nowDate);
  const todayEnd = endOfUtcDay(nowDate);
  const weekStart = startOfTrailingWeek(nowDate);
  const weekEnd = todayEnd;

  let shifts: ShiftRecord[] = [];
  let attendanceRecords: AttendanceRecord[] = [];
  let drivers: DriverRegistryRecord[] = [];
  let loadError: string | null = null;

  try {
    [shifts, attendanceRecords, drivers] = await Promise.all([
      client.listShifts(),
      client.listAttendance(),
      client.listDrivers(),
    ]);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : t("common.unknown", locale);
  }

  const driversById = buildDriverLookup(drivers);
  const todayShifts = shifts.filter((shift) =>
    intersectsRange(
      shift.clockedInAt,
      shift.clockedOutAt,
      todayStart,
      todayEnd,
    ),
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
  const scheduledDrivers = new Set(scopeShifts.map((shift) => shift.driverId))
    .size;
  const activeShifts = scopeShifts.filter((shift) => shift.status === "active");
  const completedShifts = scopeShifts.filter(
    (shift) => shift.status === "completed",
  );
  const absentCount = scopeAttendance.filter(
    (record) => record.status === "absent",
  ).length;
  const partialCount = scopeAttendance.filter(
    (record) => record.status === "partial",
  ).length;
  const exceptionCount = absentCount + partialCount;
  const ganttRows = buildGanttRows(
    todayShifts,
    driversById,
    todayStart,
    todayEnd,
    now,
  );

  const subtitle = formatCanvasDateLabel(locale, nowDate);
  const tabConfigs = [
    {
      key: "today" as const,
      href: "/attendance",
      label: locale === "en" ? "Today" : "今日",
    },
    {
      key: "week" as const,
      href: "/attendance?view=week",
      label: locale === "en" ? "This week" : "本週",
    },
    {
      key: "exceptions" as const,
      href: "/attendance?view=exceptions",
      label: locale === "en" ? "Exceptions" : "異常",
    },
  ];
  const tabs = tabConfigs.map((tab) =>
    renderTabLink(tab.href, tab.label, tab.key === view, theme),
  );
  const activeTab = tabs[tabConfigs.findIndex((tab) => tab.key === view)];
  const lateCount = partialCount;

  return (
    <div
      style={{
        background: theme.bg,
        color: theme.text,
        minHeight: "100%",
      }}
    >
      <PageHeader
        theme={theme}
        title={t("attendance.title", locale)}
        subtitle={subtitle}
        tabs={tabs}
        activeTab={activeTab}
        actions={
          <Btn theme={theme} variant="primary" icon="ext">
            {locale === "en" ? "Export" : "匯出"}
          </Btn>
        }
      />

      <div style={pageBodyStyle}>
        {loadError ? (
          <Banner
            theme={theme}
            tone="danger"
            title={
              locale === "en"
                ? "Attendance data is temporarily unavailable"
                : "出勤資料暫時無法載入"
            }
            body={loadError}
          />
        ) : null}

        {view === "exceptions" && exceptionCount > 0 ? (
          <Banner
            theme={theme}
            tone={absentCount > 0 ? "danger" : "warn"}
            title={
              locale === "en"
                ? `${exceptionCount} attendance exceptions need follow-up`
                : `${exceptionCount} 筆出勤異常待追蹤`
            }
            body={
              locale === "en"
                ? `${absentCount} absent, ${lateCount} partial attendance in the current service day.`
                : `目前服務日有 ${absentCount} 筆未到、${lateCount} 筆部分出勤。`
            }
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={locale === "en" ? "Scheduled drivers" : "排班司機"}
            value={scheduledDrivers}
          />
          <KPI
            theme={theme}
            label={t("attendance.activeShifts", locale)}
            value={activeShifts.length}
            sub={formatAttendanceRate(
              activeShifts.length,
              scopeShifts.length,
              locale,
            )}
          />
          <KPI
            theme={theme}
            label={t("attendance.completedShifts", locale)}
            value={completedShifts.length}
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Exception / late" : "異常 / 遲到"}
            value={exceptionCount}
            delta={
              absentCount > 0
                ? locale === "en"
                  ? `${absentCount} absent`
                  : `${absentCount} 未到`
                : undefined
            }
            deltaTone={exceptionCount > 0 ? "down" : "neutral"}
            sub={
              partialCount > 0
                ? locale === "en"
                  ? `${partialCount} partial`
                  : `${partialCount} 部分出勤`
                : undefined
            }
          />
        </div>

        <Card
          theme={theme}
          title={locale === "en" ? "On-duty gantt" : "當班甘特"}
          actions={
            <>
              <Pill theme={theme} tone="info" dot>
                {locale === "en" ? "active" : "進行中"}
              </Pill>
              <Pill theme={theme} tone="success" dot>
                {locale === "en" ? "completed" : "已完成"}
              </Pill>
              {scopeShifts.some((shift) => shift.status === "abandoned") ? (
                <Pill theme={theme} tone="danger" dot>
                  {locale === "en" ? "abandoned" : "中止"}
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
                      {formatHourTick(index)}
                    </span>
                  ))}
                </div>

                {ganttRows.map((row) => {
                  const tone = shiftTone(row.status);
                  const borderColor =
                    tone === "success"
                      ? theme.success
                      : tone === "danger"
                        ? theme.danger
                        : theme.accent;
                  const backgroundColor =
                    tone === "success"
                      ? "rgba(52, 211, 153, 0.14)"
                      : tone === "danger"
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
                        }}
                      >
                        {row.driverLabel}
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
      </div>
    </div>
  );
}
