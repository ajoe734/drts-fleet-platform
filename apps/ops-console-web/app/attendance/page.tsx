import type { CSSProperties } from "react";
import type { AttendanceRecord, ShiftRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "ops", dark: true, density: "compact" });

type Locale = "en" | "zh";
type ShiftTableRow = Record<string, unknown> & ShiftRecord;
type AttendanceTableRow = Record<string, unknown> & AttendanceRecord;

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDateKey(shift: ShiftRecord) {
  return shift.clockedInAt.slice(0, 10);
}

function formatBoardDate(value: string, locale: Locale) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
  return `${value} (${weekday})`;
}

function formatTime(value: string | null | undefined, locale: Locale) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function hoursValue(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(1)}h`;
}

function percentValue(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded =
    Math.abs(value - Math.round(value)) < 0.05
      ? String(Math.round(value))
      : value.toFixed(1);
  return `${rounded}%`;
}

function ratioValue(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function shiftDurationHours(shift: ShiftRecord) {
  if (typeof shift.totalHours === "number") return shift.totalHours;
  const end = shift.clockedOutAt ? new Date(shift.clockedOutAt) : new Date();
  const start = new Date(shift.clockedInAt);
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return diff > 0 ? diff : 0;
}

function trackPercent(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return Math.max(0, Math.min(100, (minutes / (24 * 60)) * 100));
}

function sortAttendance(left: AttendanceRecord, right: AttendanceRecord) {
  return `${right.date}${right.clockedInAt}`.localeCompare(
    `${left.date}${left.clockedInAt}`,
  );
}

function shiftRank(status: ShiftRecord["status"]) {
  switch (status) {
    case "active":
      return 0;
    case "abandoned":
      return 1;
    case "completed":
    default:
      return 2;
  }
}

function sortShifts(left: ShiftRecord, right: ShiftRecord) {
  const rankDelta = shiftRank(left.status) - shiftRank(right.status);
  if (rankDelta !== 0) return rankDelta;
  return left.clockedInAt.localeCompare(right.clockedInAt);
}

function resolveFocusDate(shifts: ShiftRecord[], attendance: AttendanceRecord[]) {
  const today = todayDateKey();
  if (
    shifts.some((shift) => shiftDateKey(shift) === today) ||
    attendance.some((record) => record.date === today)
  ) {
    return today;
  }

  let latestDate: string | null = null;

  for (const shift of shifts) {
    const value = shiftDateKey(shift);
    if (!latestDate || value > latestDate) latestDate = value;
  }

  for (const record of attendance) {
    if (!latestDate || record.date > latestDate) latestDate = record.date;
  }

  return latestDate ?? today;
}

function shiftStatusTone(status: ShiftRecord["status"]) {
  switch (status) {
    case "active":
      return "accent" as const;
    case "abandoned":
      return "danger" as const;
    case "completed":
    default:
      return "neutral" as const;
  }
}

function attendanceStatusTone(status: AttendanceRecord["status"]) {
  switch (status) {
    case "present":
      return "success" as const;
    case "absent":
      return "danger" as const;
    case "partial":
    default:
      return "warn" as const;
  }
}

function abandonmentTone(rate: number | null, riskCount: number) {
  if (rate == null) return "info" as const;
  if (rate >= 10) return "danger" as const;
  if (rate > 0 || riskCount > 0) return "warn" as const;
  return "success" as const;
}

function complianceTone(rate: number | null, exceptionCount: number) {
  if (rate == null) return "info" as const;
  if (rate >= 95 && exceptionCount === 0) return "success" as const;
  if (rate >= 85) return "warn" as const;
  return "danger" as const;
}

function riskDescriptor(shift: ShiftRecord, locale: Locale) {
  if (shift.status === "abandoned") {
    return {
      label: copy(locale, "abandoned", "已放棄"),
      tone: "danger" as const,
    };
  }
  if (!shift.vehicleId) {
    return {
      label: copy(locale, "vehicle missing", "未掛車"),
      tone: "warn" as const,
    };
  }
  if (shiftDurationHours(shift) >= 10) {
    return {
      label: copy(locale, "long shift", "長班"),
      tone: "warn" as const,
    };
  }
  return {
    label: copy(locale, "stable", "穩定"),
    tone: "info" as const,
  };
}

function readOnlyFieldStyle(canvasTheme: CanvasTheme, mono = false): CSSProperties {
  return {
    width: "100%",
    minHeight: 32,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: 7,
    border: `1px solid ${canvasTheme.border}`,
    background: canvasTheme.bgRaised,
    color: canvasTheme.text,
    fontSize: mono ? 11.5 : 12.5,
    fontFamily: mono ? canvasTheme.monoFamily : canvasTheme.fontFamily,
  };
}

function emptyState(canvasTheme: CanvasTheme, message: string) {
  return (
    <div
      style={{
        padding: "18px 16px",
        color: canvasTheme.textMuted,
        fontSize: 12.5,
      }}
    >
      {message}
    </div>
  );
}

export default async function AttendancePage() {
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  let shifts: ShiftRecord[] = [];
  let attendance: AttendanceRecord[] = [];
  let error: string | null = null;

  try {
    const [shiftsResult, attendanceResult] = await Promise.all([
      client.listShifts(),
      client.listAttendance(),
    ]);
    shifts = (shiftsResult as { items?: ShiftRecord[] })?.items ?? shiftsResult;
    attendance =
      (attendanceResult as { items?: AttendanceRecord[] })?.items ??
      attendanceResult;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : t("common.unknown", locale);
  }

  const sortedShifts = [...shifts].sort(sortShifts);
  const sortedAttendance = [...attendance].sort(sortAttendance);
  const focusDate = resolveFocusDate(sortedShifts, sortedAttendance);

  const focusShiftsSource = sortedShifts.filter(
    (shift) => shiftDateKey(shift) === focusDate,
  );
  const focusAttendanceSource = sortedAttendance.filter(
    (record) => record.date === focusDate,
  );

  const boardShifts = focusShiftsSource.length > 0 ? focusShiftsSource : sortedShifts;
  const boardAttendance =
    focusAttendanceSource.length > 0 ? focusAttendanceSource : sortedAttendance;

  const activeShifts = boardShifts.filter((shift) => shift.status === "active");
  const completedShifts = boardShifts.filter(
    (shift) => shift.status === "completed",
  );
  const abandonedShifts = boardShifts.filter(
    (shift) => shift.status === "abandoned",
  );
  const vehiclelessShifts = activeShifts.filter((shift) => !shift.vehicleId);
  const longRunningShifts = activeShifts.filter(
    (shift) => shiftDurationHours(shift) >= 10,
  );

  const presentAttendance = boardAttendance.filter(
    (record) => record.status === "present",
  );
  const partialAttendance = boardAttendance.filter(
    (record) => record.status === "partial",
  );
  const absentAttendance = boardAttendance.filter(
    (record) => record.status === "absent",
  );
  const exceptionAttendance = boardAttendance.filter(
    (record) => record.status !== "present",
  );
  const openAttendance = boardAttendance.filter((record) => !record.clockedOutAt);

  const scheduledDriverCount = new Set(
    [...boardShifts.map((shift) => shift.driverId), ...boardAttendance.map((record) => record.driverId)],
  ).size;

  const coverageRate = ratioValue(activeShifts.length, scheduledDriverCount);
  const completionRate = ratioValue(completedShifts.length, boardShifts.length);
  const abandonmentRate = ratioValue(abandonedShifts.length, boardShifts.length);
  const checkInComplianceRate = ratioValue(
    presentAttendance.length,
    boardAttendance.length,
  );
  const totalTrackedHours = boardAttendance.reduce(
    (sum, record) => sum + (record.totalHours ?? 0),
    0,
  );

  const riskMap = new Map<string, ShiftRecord>();
  for (const shift of [...abandonedShifts, ...vehiclelessShifts, ...longRunningShifts]) {
    riskMap.set(shift.shiftId, shift);
  }
  const riskShifts = [...riskMap.values()].sort((left, right) => {
    const leftRisk = riskDescriptor(left, locale);
    const rightRisk = riskDescriptor(right, locale);
    const toneRank = {
      danger: 0,
      warn: 1,
      info: 2,
    } as const;
    const toneDelta = toneRank[leftRisk.tone] - toneRank[rightRisk.tone];
    if (toneDelta !== 0) return toneDelta;
    return right.clockedInAt.localeCompare(left.clockedInAt);
  });

  const ganttRows = boardShifts.slice(0, 8);
  const abandonmentRateTone = abandonmentTone(abandonmentRate, riskShifts.length);
  const complianceRateTone = complianceTone(
    checkInComplianceRate,
    exceptionAttendance.length,
  );

  const abandonmentBanner =
    boardShifts.length === 0
      ? {
          title: copy(locale, "No shift board loaded", "目前沒有班次看板資料"),
          body: copy(
            locale,
            "Shift abandonment cannot be measured until shifts are visible for the selected day.",
            "選定日期尚無班次資料，暫時無法計算放棄率。",
          ),
        }
      : abandonedShifts.length > 0
        ? {
            title: copy(locale, "Abandonment is visible on the board", "看板上已出現放棄班次"),
            body: copy(
              locale,
              `${abandonedShifts.length} of ${boardShifts.length} shifts ended as abandoned on ${focusDate}.`,
              `${focusDate} 共 ${boardShifts.length} 個班次，其中 ${abandonedShifts.length} 個已標記為放棄。`,
            ),
          }
        : riskShifts.length > 0
          ? {
              title: copy(
                locale,
                "No abandoned shifts yet, but risk signals are live",
                "目前尚無 abandoned，但風險訊號已出現",
              ),
              body: copy(
                locale,
                "Vehicle pairing gaps and long-running shifts should be reviewed before they fall into abandonment.",
                "未掛車與長班風險需先處理，避免後續演變為 abandoned。",
              ),
            }
          : {
              title: copy(
                locale,
                "Abandonment is currently under control",
                "目前班次放棄率可控",
              ),
              body: copy(
                locale,
                "No active risk shift is signaling an imminent abandonment on this board.",
                "這個看板上目前沒有顯著的班次放棄風險。",
              ),
            };

  const complianceBanner =
    boardAttendance.length === 0
      ? {
          title: copy(locale, "No attendance rows loaded", "目前沒有出勤列可供比對"),
          body: copy(
            locale,
            "Check-in compliance will appear once attendance is recorded for the focus date.",
            "待 focus date 有出勤資料後，就能顯示打卡合規率。",
          ),
        }
      : exceptionAttendance.length > 0
        ? {
            title: copy(locale, "Check-in exceptions need follow-up", "打卡合規有待補強"),
            body: copy(
              locale,
              `${exceptionAttendance.length} attendance rows are partial or absent for ${focusDate}.`,
              `${focusDate} 有 ${exceptionAttendance.length} 筆出勤不是完整 present，需追蹤補登或未到。`,
            ),
          }
        : {
            title: copy(locale, "Check-in compliance is stable", "打卡合規維持穩定"),
            body: copy(
              locale,
              "Every visible attendance row on the focus date is marked present.",
              "目前 focus date 上所有可見出勤列都已標記為 present。",
            ),
          };

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("attendance.title", locale)}
        subtitle={formatBoardDate(focusDate, locale)}
        tabs={[
          copy(locale, "Today", "今日"),
          copy(locale, "This week", "本週"),
          copy(locale, "Exceptions", "異常"),
        ]}
        activeTab={copy(locale, "Today", "今日")}
        actions={
          <Btn theme={theme} icon="export">
            {copy(locale, "Export", "匯出")}
          </Btn>
        }
      />

      <div
        className="attendance-page"
        style={{
          padding: 24,
          display: "grid",
          gap: 16,
          background: theme.bg,
        }}
      >
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            title={copy(
              locale,
              "Attendance data unavailable",
              "出勤資料暫時不可用",
            )}
            body={error}
          />
        ) : null}

        <div className="attendance-kpi-grid">
          <KPI
            theme={theme}
            label={copy(locale, "Scheduled drivers", "排班司機")}
            value={scheduledDriverCount}
            sub={copy(
              locale,
              "Unique drivers visible on the focus-day shift board",
              "focus date 班次與出勤可見的唯一司機數",
            )}
            hint={focusDate}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Active shifts", "活躍班次")}
            value={activeShifts.length}
            delta={coverageRate == null ? undefined : percentValue(coverageRate)}
            deltaTone={
              coverageRate != null && coverageRate >= 65 ? "up" : "neutral"
            }
            sub={copy(
              locale,
              "Currently clocked-in shifts on the focus board",
              "目前仍在班中的班次數",
            )}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Completed shifts", "完成班次")}
            value={completedShifts.length}
            delta={completionRate == null ? undefined : percentValue(completionRate)}
            deltaTone="neutral"
            sub={copy(
              locale,
              "Closed shifts already rolled off the day board",
              "已完成並結束的同日班次",
            )}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Exceptions / late", "異常 / 遲到")}
            value={exceptionAttendance.length}
            delta={
              absentAttendance.length > 0
                ? copy(
                    locale,
                    `${absentAttendance.length} absent`,
                    `${absentAttendance.length} 未到`,
                  )
                : undefined
            }
            deltaTone={absentAttendance.length > 0 ? "down" : "neutral"}
            sub={copy(
              locale,
              "Partial and absent attendance rows on the focus date",
              "focus date 上 partial 與 absent 的出勤數",
            )}
          />
        </div>

        <div className="attendance-main-grid">
          <Card
            theme={theme}
            title={copy(locale, "Shift attendance grid", "當班甘特")}
            subtitle={copy(
              locale,
              "24-hour shift lanes for active, abandoned, and recently completed duties.",
              "以 24 小時時間軸檢視 active、abandoned 與剛完成的班次。",
            )}
            padding={16}
          >
            {ganttRows.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <div className="attendance-gantt">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "136px minmax(640px, 1fr) 84px",
                      gap: 8,
                      alignItems: "end",
                      marginBottom: 6,
                    }}
                  >
                    <div />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(24, minmax(18px, 1fr))",
                        color: theme.textDim,
                        fontSize: 10.5,
                        fontFamily: theme.monoFamily,
                        borderBottom: `1px solid ${theme.border}`,
                        paddingBottom: 4,
                      }}
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <span key={hour} style={{ textAlign: "center" }}>
                          {String(hour).padStart(2, "0")}
                        </span>
                      ))}
                    </div>
                    <div
                      style={{
                        color: theme.textMuted,
                        fontSize: 10.5,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        textAlign: "right",
                      }}
                    >
                      {copy(locale, "Hours", "工時")}
                    </div>
                  </div>

                  {ganttRows.map((shift) => {
                    const start = trackPercent(shift.clockedInAt) ?? 0;
                    const fallbackEnd =
                      shift.clockedOutAt ??
                      (focusDate === todayDateKey()
                        ? new Date().toISOString()
                        : `${focusDate}T23:59:00.000Z`);
                    const rawEnd = trackPercent(fallbackEnd) ?? 100;
                    const end = rawEnd < start ? 100 : rawEnd;
                    const tone = shiftStatusTone(shift.status);
                    const colorSet =
                      tone === "danger"
                        ? {
                            fg: theme.danger,
                            bg: theme.dangerBg,
                            bd: theme.dangerBorder,
                          }
                        : tone === "accent"
                          ? {
                              fg: theme.accent,
                              bg: theme.accentBg,
                              bd: theme.accentBorder,
                            }
                          : {
                              fg: theme.info,
                              bg: theme.infoBg,
                              bd: theme.infoBorder,
                            };

                    return (
                      <div
                        key={shift.shiftId}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "136px minmax(640px, 1fr) 84px",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            padding: "6px 0",
                            borderBottom: `1px dashed ${theme.border}`,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: theme.text,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {shift.driverId}
                          </div>
                          <div
                            style={{
                              fontSize: 10.5,
                              color: theme.textDim,
                              fontFamily: theme.monoFamily,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {shift.shiftId}
                          </div>
                        </div>

                        <div
                          style={{
                            position: "relative",
                            height: 28,
                            borderBottom: `1px dashed ${theme.border}`,
                            backgroundImage:
                              "linear-gradient(to right, rgba(100,116,139,.16) 1px, transparent 1px)",
                            backgroundSize: "calc(100% / 24) 100%",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              top: 6,
                              left: `${start}%`,
                              width: `${Math.max(6, end - start)}%`,
                              height: 16,
                              display: "flex",
                              alignItems: "center",
                              paddingLeft: 6,
                              borderRadius: 4,
                              background: colorSet.bg,
                              border: `1px solid ${colorSet.bd}`,
                              color: colorSet.fg,
                              fontSize: 10,
                              lineHeight: "14px",
                              fontFamily: theme.monoFamily,
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatTime(shift.clockedInAt, locale)}-
                            {formatTime(shift.clockedOutAt ?? fallbackEnd, locale)}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gap: 4,
                            justifyItems: "end",
                            padding: "6px 0",
                            borderBottom: `1px dashed ${theme.border}`,
                          }}
                        >
                          <Pill theme={theme} tone={tone} dot>
                            {formatOpsCodeLabel(locale, shift.status)}
                          </Pill>
                          <span
                            style={{
                              fontSize: 10.5,
                              color: theme.textDim,
                              fontFamily: theme.monoFamily,
                            }}
                          >
                            {hoursValue(shiftDurationHours(shift))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              emptyState(
                theme,
                copy(locale, "No shifts found for this board.", "這個看板目前沒有班次。"),
              )
            )}
          </Card>

          <div className="attendance-side-stack">
            <Card
              theme={theme}
              title={copy(locale, "Abandonment rate", "班次放棄率")}
              subtitle={copy(
                locale,
                "Availability-first view of abandoned shifts and pre-abandonment risk.",
                "以可用性優先方式檢視 abandoned 班次與放棄前的風險訊號。",
              )}
              actions={
                <Pill theme={theme} tone={abandonmentRateTone}>
                  {percentValue(abandonmentRate)}
                </Pill>
              }
            >
              <Banner
                theme={theme}
                tone={abandonmentRateTone}
                title={abandonmentBanner.title}
                body={abandonmentBanner.body}
              />
              <div style={{ height: 12 }} />
              <div className="attendance-mini-kpi-grid">
                <KPI
                  theme={theme}
                  label={copy(locale, "Abandoned", "已放棄")}
                  value={abandonedShifts.length}
                  sub={copy(
                    locale,
                    "Shifts already marked abandoned",
                    "已被標記為 abandoned 的班次",
                  )}
                />
                <KPI
                  theme={theme}
                  label={copy(locale, "No vehicle", "未掛車")}
                  value={vehiclelessShifts.length}
                  sub={copy(
                    locale,
                    "Clocked-in shifts waiting for pairing",
                    "已在班但仍待車輛配對的班次",
                  )}
                />
                <KPI
                  theme={theme}
                  label={copy(locale, "Long shift", "長班")}
                  value={longRunningShifts.length}
                  sub={copy(
                    locale,
                    "Active shifts already over 10 hours",
                    "已超過 10 小時的進行中班次",
                  )}
                />
                <KPI
                  theme={theme}
                  label={copy(locale, "Tracked hours", "追蹤工時")}
                  value={hoursValue(totalTrackedHours)}
                  sub={copy(
                    locale,
                    "Attendance hours accumulated on the focus board",
                    "focus board 上累積的出勤工時",
                  )}
                />
              </div>
              <div style={{ height: 12 }} />
              {riskShifts.length > 0 ? (
                <Table<ShiftTableRow>
                  theme={theme}
                  columns={[
                    {
                      h: "SHIFT",
                      w: 104,
                      mono: true,
                      r: (shift) => (
                        <span style={{ color: theme.accent, fontWeight: 700 }}>
                          {shift.shiftId}
                        </span>
                      ),
                    },
                    {
                      h: copy(locale, "Driver", "司機"),
                      w: 112,
                      mono: true,
                      k: "driverId",
                    },
                    {
                      h: copy(locale, "Alert", "警示"),
                      w: 114,
                      r: (shift) => {
                        const risk = riskDescriptor(shift, locale);
                        return (
                          <Pill theme={theme} tone={risk.tone} dot>
                            {risk.label}
                          </Pill>
                        );
                      },
                    },
                    {
                      h: copy(locale, "Vehicle", "車輛"),
                      w: 98,
                      mono: true,
                      r: (shift) => shift.vehicleId ?? "—",
                    },
                    {
                      h: copy(locale, "Clock-in", "上班"),
                      w: 92,
                      mono: true,
                      r: (shift) => formatTime(shift.clockedInAt, locale),
                    },
                  ]}
                  rows={riskShifts.slice(0, 5) as ShiftTableRow[]}
                />
              ) : (
                emptyState(
                  theme,
                  copy(
                    locale,
                    "No abandonment-risk shift is visible right now.",
                    "目前沒有可見的班次放棄風險。",
                  ),
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={copy(locale, "Check-in compliance", "打卡合規")}
              subtitle={copy(
                locale,
                "Present versus partial or absent attendance on the focus date.",
                "比對 focus date 的 present、partial 與 absent 打卡結果。",
              )}
              actions={
                <Pill theme={theme} tone={complianceRateTone}>
                  {percentValue(checkInComplianceRate)}
                </Pill>
              }
            >
              <Banner
                theme={theme}
                tone={complianceRateTone}
                title={complianceBanner.title}
                body={complianceBanner.body}
              />
              <div style={{ height: 12 }} />
              <div className="attendance-field-grid">
                <Field
                  theme={theme}
                  label={copy(locale, "Scope", "資料視窗")}
                  hint={copy(
                    locale,
                    "Attendance cards and tables below are aligned to this date.",
                    "下方卡片與表格都對齊這個日期的出勤資料。",
                  )}
                >
                  <div style={readOnlyFieldStyle(theme, true)}>
                    {formatBoardDate(focusDate, locale)}
                  </div>
                </Field>

                <Field
                  theme={theme}
                  label={copy(locale, "Rule", "計算規則")}
                  hint={copy(
                    locale,
                    "Only `present` counts as compliant; `partial` and `absent` are treated as exceptions.",
                    "只有 `present` 視為合規，`partial` 與 `absent` 都算異常。",
                  )}
                >
                  <div style={readOnlyFieldStyle(theme, true)}>
                    present / total attendance
                  </div>
                </Field>
              </div>

              <DL
                theme={theme}
                cols={2}
                items={[
                  {
                    label: copy(locale, "Present", "正常打卡"),
                    value: presentAttendance.length,
                    mono: true,
                  },
                  {
                    label: copy(locale, "Partial", "部分出勤"),
                    value: partialAttendance.length,
                    mono: true,
                  },
                  {
                    label: copy(locale, "Absent", "未到"),
                    value: absentAttendance.length,
                    mono: true,
                  },
                  {
                    label: copy(locale, "Open rows", "尚未結束"),
                    value: openAttendance.length,
                    mono: true,
                  },
                ]}
              />

              <div style={{ height: 12 }} />
              {exceptionAttendance.length > 0 ? (
                <Table<AttendanceTableRow>
                  theme={theme}
                  columns={[
                    {
                      h: "ATT",
                      w: 108,
                      mono: true,
                      r: (record) => (
                        <span style={{ color: theme.accent, fontWeight: 700 }}>
                          {record.attendanceId}
                        </span>
                      ),
                    },
                    {
                      h: copy(locale, "Driver", "司機"),
                      w: 110,
                      mono: true,
                      k: "driverId",
                    },
                    {
                      h: "STATUS",
                      w: 118,
                      r: (record) => (
                        <Pill
                          theme={theme}
                          tone={attendanceStatusTone(record.status)}
                          dot
                        >
                          {formatOpsCodeLabel(locale, record.status)}
                        </Pill>
                      ),
                    },
                    {
                      h: copy(locale, "Clock-in", "上班"),
                      w: 92,
                      mono: true,
                      r: (record) => formatTime(record.clockedInAt, locale),
                    },
                    {
                      h: copy(locale, "Hours", "工時"),
                      w: 78,
                      mono: true,
                      align: "right",
                      r: (record) => hoursValue(record.totalHours),
                    },
                  ]}
                  rows={exceptionAttendance.slice(0, 5) as AttendanceTableRow[]}
                />
              ) : (
                emptyState(
                  theme,
                  copy(
                    locale,
                    "No partial or absent attendance row needs follow-up.",
                    "目前沒有 partial 或 absent 的出勤列需要追蹤。",
                  ),
                )
              )}
            </Card>
          </div>
        </div>
      </div>

      <style>{`
        .attendance-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .attendance-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.95fr);
          gap: 16px;
          align-items: start;
        }

        .attendance-side-stack {
          display: grid;
          gap: 16px;
        }

        .attendance-mini-kpi-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .attendance-field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .attendance-gantt {
          min-width: 860px;
        }

        @media (max-width: 1180px) {
          .attendance-main-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 860px) {
          .attendance-kpi-grid,
          .attendance-mini-kpi-grid,
          .attendance-field-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .attendance-page {
            padding: 16px !important;
          }

          .attendance-kpi-grid,
          .attendance-mini-kpi-grid,
          .attendance-field-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
