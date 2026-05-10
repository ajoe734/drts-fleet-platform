import Link from "next/link";
import type { CSSProperties } from "react";
import type { AttendanceRecord, ShiftRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t } from "@/lib/translations";
import {
  Badge,
  CalloutBanner,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  Td,
  Tr,
} from "@drts/ui-web";

const pageLayoutStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
};

const primarySplitStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 0.95fr)",
  gap: "16px",
  alignItems: "start",
};

const secondarySplitStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "16px",
  alignItems: "start",
};

function formatDt(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function hoursValue(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}h`;
}

function trackPercent(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return Math.max(0, Math.min(100, (minutes / (24 * 60)) * 100));
}

function copy(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDurationHours(shift: ShiftRecord) {
  if (typeof shift.totalHours === "number") return shift.totalHours;
  const end = shift.clockedOutAt ? new Date(shift.clockedOutAt) : new Date();
  const start = new Date(shift.clockedInAt);
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return diff > 0 ? diff : 0;
}

function timelineBadgeVariant(status: AttendanceRecord["status"]) {
  switch (status) {
    case "present":
      return "green";
    case "absent":
      return "red";
    default:
      return "yellow";
  }
}

function shiftBadgeVariant(status: ShiftRecord["status"]) {
  switch (status) {
    case "active":
      return "blue";
    case "abandoned":
      return "red";
    default:
      return "gray";
  }
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
  } catch (e) {
    error = e instanceof Error ? e.message : t("common.unknown", locale);
  }

  const activeShifts = shifts
    .filter((shift) => shift.status === "active")
    .sort((left, right) => left.clockedInAt.localeCompare(right.clockedInAt));
  const completedShifts = shifts
    .filter((shift) => shift.status !== "active")
    .sort((left, right) => right.clockedInAt.localeCompare(left.clockedInAt));
  const recentAttendance = [...attendance]
    .sort((left, right) =>
      `${right.date}${right.clockedInAt}`.localeCompare(
        `${left.date}${left.clockedInAt}`,
      ),
    )
    .slice(0, 8);
  const exceptionAttendance = attendance.filter(
    (record) => record.status === "partial" || record.status === "absent",
  );
  const longRunningShifts = activeShifts.filter(
    (shift) => shiftDurationHours(shift) >= 10,
  );
  const vehiclelessShifts = activeShifts.filter((shift) => !shift.vehicleId);
  const totalTrackedHours = attendance.reduce(
    (sum, record) => sum + (record.totalHours ?? 0),
    0,
  );
  const currentAttendanceDate = todayDateKey();
  const completedTodayCount = attendance.filter(
    (record) =>
      record.status === "present" && record.date === currentAttendanceDate,
  ).length;

  return (
    <div style={pageLayoutStyle}>
      <PageHeader
        eyebrow={copy(locale, "Workforce monitor", "出勤監控")}
        title={t("attendance.title", locale)}
        subtitle={t("attendance.subtitle", locale)}
        meta={[
          {
            label: copy(locale, "Shifts", "班次"),
            value: shifts.length,
          },
          {
            label: copy(locale, "Active", "進行中"),
            value: activeShifts.length,
            tone: activeShifts.length > 0 ? "ops" : "neutral",
          },
          {
            label: copy(locale, "Exceptions", "異常"),
            value: exceptionAttendance.length,
            tone: exceptionAttendance.length > 0 ? "warning" : "success",
          },
        ]}
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={copy(
            locale,
            "Attendance data unavailable",
            "出勤資料暫時不可用",
          )}
          description={error}
        />
      ) : null}

      <KpiRow minWidth="170px">
        <KpiCard
          label={copy(locale, "Active shifts", "進行中班次")}
          value={activeShifts.length}
          detail={copy(
            locale,
            "Drivers currently on duty",
            "目前正在值勤的駕駛",
          )}
          tone="ops"
        />
        <KpiCard
          label={copy(locale, "Attendance exceptions", "出勤異常")}
          value={exceptionAttendance.length}
          detail={copy(
            locale,
            "Partial or absent attendance records",
            "部分出勤或缺勤紀錄",
          )}
          tone={exceptionAttendance.length > 0 ? "danger" : "success"}
        />
        <KpiCard
          label={copy(locale, "Extended shifts", "延長班次")}
          value={longRunningShifts.length}
          detail={copy(
            locale,
            "Active shifts already over 10 hours",
            "進行中且超過 10 小時",
          )}
          tone={longRunningShifts.length > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label={copy(locale, "Tracked hours", "追蹤工時")}
          value={hoursValue(totalTrackedHours)}
          detail={copy(
            locale,
            "Hours captured in attendance records",
            "出勤紀錄累計工時",
          )}
          tone="success"
        />
      </KpiRow>

      <div style={primarySplitStyle}>
        <DataViewCard
          title={copy(locale, "Live clock-in board", "當班監控看板")}
          subtitle={copy(
            locale,
            "Current on-duty shifts with vehicle pairing, duration, and origin snapshot.",
            "集中檢視目前值勤班次、車輛配對、已值勤時數與起點資訊。",
          )}
          tone="ops"
          density="compact"
          summary={copy(
            locale,
            `${activeShifts.length} active shifts, ${vehiclelessShifts.length} still waiting for a vehicle assignment.`,
            `${activeShifts.length} 個進行中班次，其中 ${vehiclelessShifts.length} 個仍待補車輛指派。`,
          )}
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: t("attendance.col.driver", locale) },
              { label: t("attendance.col.vehicle", locale) },
              { label: t("attendance.col.clockedIn", locale) },
              { label: copy(locale, "Duty span", "班次時長") },
              { label: t("attendance.col.location", locale) },
            ]}
            empty={t("attendance.emptyShifts", locale)}
          >
            {activeShifts.map((shift) => (
              <Tr key={shift.shiftId}>
                <Td density="compact">
                  <div style={{ fontWeight: 600 }}>{shift.driverId}</div>
                  <div style={{ color: "#64748b", fontSize: "12px" }}>
                    {shift.shiftId}
                  </div>
                </Td>
                <Td density="compact">
                  {shift.vehicleId ?? "—"}
                  {!shift.vehicleId ? (
                    <div style={{ color: "#dc2626", fontSize: "12px" }}>
                      {copy(locale, "Needs vehicle assignment", "待補車輛指派")}
                    </div>
                  ) : null}
                </Td>
                <Td density="compact" muted>
                  {formatDt(shift.clockedInAt)}
                </Td>
                <Td density="compact">
                  <Badge
                    variant={
                      shiftDurationHours(shift) >= 10 ? "yellow" : "blue"
                    }
                  >
                    {hoursValue(shiftDurationHours(shift))}
                  </Badge>
                </Td>
                <Td density="compact" muted>
                  {shift.startLocation ?? "—"}
                </Td>
              </Tr>
            ))}
          </DataTable>
        </DataViewCard>

        <DataViewCard
          title={copy(locale, "Attention queue", "需關注項目")}
          subtitle={copy(
            locale,
            "Supervisor prompts derived from live attendance and shift state.",
            "根據即時出勤與班次狀態整理的值班提示。",
          )}
          tone={exceptionAttendance.length > 0 ? "warning" : "neutral"}
          density="compact"
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
              }}
            >
              <div
                style={{ fontSize: "12px", color: "#1d4ed8", fontWeight: 600 }}
              >
                {copy(locale, "Completed today", "今日完成出勤")}
              </div>
              <div
                style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a" }}
              >
                {completedTodayCount}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                {copy(
                  locale,
                  "Present attendance rows dated today",
                  "日期為今日的已完成出勤筆數",
                )}
              </div>
            </div>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "#fff7ed",
                border: "1px solid #fed7aa",
              }}
            >
              <div
                style={{ fontSize: "12px", color: "#c2410c", fontWeight: 600 }}
              >
                {copy(locale, "No-vehicle active shifts", "未掛車進行中班次")}
              </div>
              <div
                style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a" }}
              >
                {vehiclelessShifts.length}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                {copy(
                  locale,
                  "Clocked-in drivers still waiting on vehicle pairing",
                  "已上班但仍未完成車輛配對",
                )}
              </div>
            </div>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
              }}
            >
              <div
                style={{ fontSize: "12px", color: "#b91c1c", fontWeight: 600 }}
              >
                {copy(locale, "Attendance exceptions", "出勤異常")}
              </div>
              <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
                {exceptionAttendance.slice(0, 3).map((record) => (
                  <div key={record.attendanceId}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#0f172a",
                      }}
                    >
                      {record.driverId}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      {record.date} ·{" "}
                      {formatOpsCodeLabel(locale, record.status)}
                    </div>
                  </div>
                ))}
                {exceptionAttendance.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    {copy(
                      locale,
                      "No partial or absent records.",
                      "目前沒有部分出勤或缺勤紀錄。",
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </DataViewCard>
      </div>

      <DataViewCard
        title={copy(
          locale,
          "Gantt-style attendance visibility",
          "甘特式出勤可視化",
        )}
        subtitle={copy(
          locale,
          "Recent attendance rows plotted on a 24-hour UTC lane so long shifts and anomalies stand out.",
          "以 24 小時 UTC 軸呈現近期出勤，讓長班與異常狀態更容易被看見。",
        )}
        tone="info"
      >
        <div style={{ display: "grid", gap: "10px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "220px 1fr 80px",
              gap: "12px",
              color: "#64748b",
              fontSize: "12px",
            }}
          >
            <span>{copy(locale, "Driver / day", "駕駛 / 日期")}</span>
            <span>00:00 - 24:00 UTC</span>
            <span>{copy(locale, "Hours", "工時")}</span>
          </div>
          {recentAttendance.length > 0 ? (
            recentAttendance.map((record) => {
              const start = trackPercent(record.clockedInAt) ?? 0;
              const end = trackPercent(record.clockedOutAt) ?? 100;
              return (
                <div
                  key={record.attendanceId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "220px 1fr 80px",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "#0f172a" }}>
                      {record.driverId}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      {record.date} · {formatTime(record.clockedInAt)} -{" "}
                      {formatTime(record.clockedOutAt)}
                    </div>
                  </div>
                  <div
                    style={{
                      position: "relative",
                      height: "12px",
                      borderRadius: "999px",
                      background: "#e2e8f0",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: `${Math.min(start, end)}%`,
                        width: `${Math.max(6, Math.abs(end - start))}%`,
                        top: 0,
                        bottom: 0,
                        borderRadius: "999px",
                        background:
                          record.status === "present"
                            ? "#22c55e"
                            : record.status === "absent"
                              ? "#ef4444"
                              : "#f59e0b",
                      }}
                    />
                  </div>
                  <div
                    style={{ display: "grid", gap: "4px", justifyItems: "end" }}
                  >
                    <Badge variant={timelineBadgeVariant(record.status)}>
                      {formatOpsCodeLabel(locale, record.status)}
                    </Badge>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      {hoursValue(record.totalHours)}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ fontSize: "13px", color: "#64748b" }}>
              {t("attendance.emptyAttendance", locale)}
            </div>
          )}
        </div>
      </DataViewCard>

      <div style={secondarySplitStyle}>
        <DataViewCard
          title={t("attendance.attendanceRecords", locale)}
          subtitle={copy(
            locale,
            "Recent attendance rows with tracked hours and exception status.",
            "近期出勤紀錄，包含工時與異常標記。",
          )}
          density="compact"
        >
          <DataTable
            density="compact"
            columns={[
              { label: t("attendance.col.attendanceId", locale) },
              { label: t("attendance.col.driver", locale) },
              { label: t("attendance.col.date", locale) },
              { label: t("attendance.col.status", locale) },
              { label: t("attendance.col.hours", locale) },
            ]}
            empty={t("attendance.emptyAttendance", locale)}
          >
            {attendance.slice(0, 20).map((record) => (
              <Tr key={record.attendanceId}>
                <Td density="compact" mono>
                  {record.attendanceId}
                </Td>
                <Td density="compact">{record.driverId}</Td>
                <Td density="compact" muted>
                  {record.date}
                </Td>
                <Td density="compact">
                  <Badge variant={timelineBadgeVariant(record.status)}>
                    {formatOpsCodeLabel(locale, record.status)}
                  </Badge>
                </Td>
                <Td density="compact" muted>
                  {hoursValue(record.totalHours)}
                </Td>
              </Tr>
            ))}
          </DataTable>
        </DataViewCard>

        <DataViewCard
          title={t("attendance.completedShifts", locale)}
          subtitle={copy(
            locale,
            "Closed shifts sorted by latest clock-in time for end-of-day review.",
            "依最近上班時間排序的已完成班次，供收班檢視使用。",
          )}
          density="compact"
          footer={
            <Link
              href="/dashboard"
              style={{ color: "#0f172a", textDecoration: "none" }}
            >
              <strong>{copy(locale, "Back to dashboard", "返回儀表板")}</strong>
            </Link>
          }
        >
          <DataTable
            density="compact"
            columns={[
              { label: t("attendance.col.shiftId", locale) },
              { label: t("attendance.col.driver", locale) },
              { label: t("attendance.col.status", locale) },
              { label: t("attendance.col.clockedIn", locale) },
              { label: t("attendance.col.clockedOut", locale) },
              { label: t("attendance.col.hours", locale) },
            ]}
            empty={t("attendance.emptyCompleted", locale)}
          >
            {completedShifts.slice(0, 10).map((shift) => (
              <Tr key={shift.shiftId}>
                <Td density="compact" mono>
                  {shift.shiftId}
                </Td>
                <Td density="compact">{shift.driverId}</Td>
                <Td density="compact">
                  <Badge variant={shiftBadgeVariant(shift.status)}>
                    {formatOpsCodeLabel(locale, shift.status)}
                  </Badge>
                </Td>
                <Td density="compact" muted>
                  {formatDt(shift.clockedInAt)}
                </Td>
                <Td density="compact" muted>
                  {formatDt(shift.clockedOutAt)}
                </Td>
                <Td density="compact" muted>
                  {hoursValue(shift.totalHours)}
                </Td>
              </Tr>
            ))}
          </DataTable>
        </DataViewCard>
      </div>
    </div>
  );
}
