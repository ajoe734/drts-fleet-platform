import Link from "next/link";
import type { AttendanceRecord, ShiftRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t } from "@/lib/translations";
import { PageHeader, StatCard, Card, CardHeader, CardBody } from "@drts/ui-web";
import { Badge, DataTable, Td, Tr } from "@drts/ui-web";

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
  const monitorCards = [
    {
      label: copy(locale, "Active shifts", "進行中班次"),
      value: activeShifts.length,
      sub: copy(locale, "Drivers currently on duty", "目前正在值勤的駕駛"),
      accent: "#2563eb",
    },
    {
      label: copy(locale, "Attendance exceptions", "出勤異常"),
      value: exceptionAttendance.length,
      sub: copy(
        locale,
        "Partial or absent attendance records",
        "部分出勤或缺勤紀錄",
      ),
      accent: "#dc2626",
    },
    {
      label: copy(locale, "Extended shifts", "延長班次"),
      value: longRunningShifts.length,
      sub: copy(
        locale,
        "Active shifts already over 10 hours",
        "進行中且超過 10 小時",
      ),
      accent: "#d97706",
    },
    {
      label: copy(locale, "Tracked hours", "追蹤工時"),
      value: hoursValue(totalTrackedHours),
      sub: copy(
        locale,
        "Hours captured in attendance records",
        "出勤紀錄累計工時",
      ),
      accent: "#15803d",
    },
  ];

  return (
    <>
      <PageHeader
        title={t("attendance.title", locale)}
        subtitle={t("attendance.subtitle", locale)}
      />

      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: "8px",
            padding: "12px 16px",
            color: "#b91c1c",
            fontSize: "13.5px",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        {monitorCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={String(card.value)}
            sub={card.sub}
            accent={card.accent}
          />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 0.9fr",
          gap: "20px",
          marginBottom: "20px",
        }}
      >
        <Card>
          <CardHeader>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#64748b",
                marginBottom: "2px",
              }}
            >
              {copy(locale, "Shift monitor", "班次監控")}
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              {copy(locale, "Live clock-in board", "當班監控看板")}
            </div>
          </CardHeader>
          <DataTable
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
                <Td>
                  <div style={{ fontWeight: 600 }}>{shift.driverId}</div>
                  <div style={{ color: "#64748b", fontSize: "12px" }}>
                    {shift.shiftId}
                  </div>
                </Td>
                <Td>
                  {shift.vehicleId ?? "—"}
                  {!shift.vehicleId && (
                    <div style={{ color: "#dc2626", fontSize: "12px" }}>
                      {copy(locale, "Needs vehicle assignment", "待補車輛指派")}
                    </div>
                  )}
                </Td>
                <Td muted>{formatDt(shift.clockedInAt)}</Td>
                <Td>
                  <Badge
                    variant={
                      shiftDurationHours(shift) >= 10 ? "yellow" : "blue"
                    }
                  >
                    {hoursValue(shiftDurationHours(shift))}
                  </Badge>
                </Td>
                <Td muted>{shift.startLocation ?? "—"}</Td>
              </Tr>
            ))}
          </DataTable>
        </Card>

        <Card>
          <CardHeader>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#64748b",
                marginBottom: "2px",
              }}
            >
              {copy(locale, "Supervisor cues", "值班提示")}
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              {copy(locale, "Attention queue", "需關注項目")}
            </div>
          </CardHeader>
          <CardBody style={{ display: "grid", gap: "12px" }}>
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
                {exceptionAttendance.length === 0 && (
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    {copy(
                      locale,
                      "No partial or absent records.",
                      "目前沒有部分出勤或缺勤紀錄。",
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card style={{ marginBottom: "20px" }}>
        <CardHeader>
          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#64748b",
              marginBottom: "2px",
            }}
          >
            {copy(locale, "Shift timeline", "班次時間軸")}
          </div>
          <div style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}>
            {copy(
              locale,
              "Gantt-style attendance visibility",
              "甘特式出勤可視化",
            )}
          </div>
        </CardHeader>
        <div style={{ display: "grid", gap: "10px", padding: "0 16px 16px" }}>
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
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "20px",
          marginBottom: "20px",
        }}
      >
        <Card>
          <CardHeader>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#64748b",
                marginBottom: "2px",
              }}
            >
              {copy(locale, "Attendance ledger", "出勤帳本")}
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              {t("attendance.attendanceRecords", locale)}
            </div>
          </CardHeader>
          <DataTable
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
                <Td mono>{record.attendanceId}</Td>
                <Td>{record.driverId}</Td>
                <Td muted>{record.date}</Td>
                <Td>
                  <Badge variant={timelineBadgeVariant(record.status)}>
                    {formatOpsCodeLabel(locale, record.status)}
                  </Badge>
                </Td>
                <Td muted>{hoursValue(record.totalHours)}</Td>
              </Tr>
            ))}
          </DataTable>
        </Card>

        <Card>
          <CardHeader>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#64748b",
                marginBottom: "2px",
              }}
            >
              {copy(locale, "Closed shifts", "已結束班次")}
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              {t("attendance.completedShifts", locale)}
            </div>
          </CardHeader>
          <DataTable
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
                <Td mono>{shift.shiftId}</Td>
                <Td>{shift.driverId}</Td>
                <Td>
                  <Badge variant={shiftBadgeVariant(shift.status)}>
                    {formatOpsCodeLabel(locale, shift.status)}
                  </Badge>
                </Td>
                <Td muted>{formatDt(shift.clockedInAt)}</Td>
                <Td muted>{formatDt(shift.clockedOutAt)}</Td>
                <Td muted>{hoursValue(shift.totalHours)}</Td>
              </Tr>
            ))}
          </DataTable>
        </Card>
      </div>

      <Link
        href="/dashboard"
        style={{ color: "#0f172a", textDecoration: "none", fontWeight: 600 }}
      >
        {copy(locale, "Back to dashboard", "返回儀表板")}
      </Link>
    </>
  );
}
