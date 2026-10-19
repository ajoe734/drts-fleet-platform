import Link from "next/link";
import type { ReactNode } from "react";
import type {
  AttendanceRecord,
  DriverRegistryRecord,
  EmptyReason,
  ShiftRecord,
} from "@drts/contracts";
import {
  OpsAttendanceExportButton,
  OpsAttendanceFilterBar,
} from "../../components/ops-attendance-filter-export";
import { getServerOpsClient } from "../../lib/api-client.server";
import { formatOpsCodeLabel } from "../../lib/localized-labels";
import {
  buildAttendanceCanonicalView,
  buildAttendanceExportHref,
  buildAttendanceHref,
  resolveAttendanceFilters,
  shiftIntersectsUtcRange,
  type AttendanceView,
} from "../../lib/ops-analytics";
import { buildEmptyEnvelope, emptyStateCopy } from "../../lib/ops-empty-state";
import { getServerLocale } from "../../lib/server-locale";
import { t, type Locale } from "../../lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

type AttendancePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type GanttRow = {
  shiftId: string;
  driverId: string;
  driverLabel: string;
  vehicleId: string | null;
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
  gridTemplateColumns: "150px minmax(720px, 1fr)",
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

function asTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function formatUtcTimestampShort(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = asTime(value);
  if (parsed === null) return value;
  const iso = new Date(parsed).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
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
    return t("attendance.noRecords", locale);
  }
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function shiftTone(status: ShiftRecord["status"]): CanvasTone {
  if (status === "completed") return "success";
  if (status === "abandoned") return "danger";
  return "info";
}

function attendanceStatusTone(
  status: AttendanceRecord["status"] | null,
): CanvasTone {
  if (status === "present") return "success";
  if (status === "partial") return "warn";
  if (status === "absent") return "danger";
  return "neutral";
}

function emptyReasonTone(reason: EmptyReason): CanvasTone {
  switch (reason) {
    case "fetch_failed":
    case "permission_denied":
      return "danger";
    case "not_provisioned":
    case "external_unavailable":
      return "warn";
    case "filtered_empty":
      return "info";
    default:
      return "neutral";
  }
}

function classifyLoadErrorCode(error: unknown): string {
  const message =
    error instanceof Error && error.message ? error.message.toLowerCase() : "";
  const statusProp =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : null;
  if (
    statusProp === 401 ||
    statusProp === 403 ||
    message.includes("401") ||
    message.includes("403") ||
    message.includes("forbidden") ||
    message.includes("permission_denied") ||
    message.includes("permission denied") ||
    message.includes("unauthorized")
  ) {
    return "permission_denied";
  }
  return "fetch_failed";
}

function renderTabLink(
  href: string,
  label: string,
  selected: boolean,
  activeTheme: CanvasTheme,
) {
  return (
    <Link
      key={href}
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

function buildGanttRows(
  shifts: ShiftRecord[],
  driversById: Map<string, DriverRegistryRecord>,
  rangeStart: number,
  rangeEnd: number,
  now: number,
): GanttRow[] {
  return shifts
    .filter((shift) =>
      shiftIntersectsUtcRange(
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
        driverId: shift.driverId,
        driverLabel: driver?.name ?? shift.driverId,
        vehicleId: shift.vehicleId ?? null,
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

  const nowDate = new Date();
  const now = nowDate.getTime();
  const filters = resolveAttendanceFilters(params, nowDate);
  const view: AttendanceView = filters.view;
  const driverQuery = filters.driverId !== "all" ? filters.driverId : undefined;

  let shifts: ShiftRecord[] = [];
  let attendanceRecords: AttendanceRecord[] = [];
  let drivers: DriverRegistryRecord[] = [];
  let loadError: string | null = null;
  let errorCode: string | null = null;

  try {
    [shifts, attendanceRecords, drivers] = await Promise.all([
      driverQuery ? client.listShifts(driverQuery) : client.listShifts(),
      driverQuery
        ? client.listAttendance(driverQuery)
        : client.listAttendance(),
      client.listDrivers(),
    ]);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : t("common.unknown", locale);
    errorCode = classifyLoadErrorCode(error);
  }

  const canonicalView = buildAttendanceCanonicalView({
    shifts,
    attendanceRecords,
    drivers,
    filters,
    reference: nowDate,
    ok: loadError === null,
    errorCode,
  });

  const {
    driversById,
    todayShifts,
    scopeShifts,
    filteredRows,
    scheduledDrivers,
    activeShifts,
    completedShifts,
    absentCount,
    partialCount,
    exceptionCount,
    dayStart,
    dayEnd,
    anchorDate,
    emptyReason,
  } = canonicalView;

  const ganttSourceShifts =
    view === "exceptions" && filters.anomaly === "all"
      ? canonicalView.filteredShifts
      : todayShifts;

  const ganttRows = buildGanttRows(
    ganttSourceShifts,
    driversById,
    dayStart,
    dayEnd,
    now,
  );

  const subtitle = formatCanvasDateLabel(locale, anchorDate);
  const tabConfigs = [
    {
      key: "today" as const,
      href: buildAttendanceHref(filters, { view: "today" }),
      label: t("attendance.tab.today", locale),
    },
    {
      key: "week" as const,
      href: buildAttendanceHref(filters, { view: "week" }),
      label: t("attendance.tab.week", locale),
    },
    {
      key: "exceptions" as const,
      href: buildAttendanceHref(filters, { view: "exceptions" }),
      label: t("attendance.tab.exceptions", locale),
    },
  ];
  const tabs = tabConfigs.map((tab) =>
    renderTabLink(tab.href, tab.label, tab.key === view, theme),
  );
  const activeTab = tabs[tabConfigs.findIndex((tab) => tab.key === view)];
  const lateCount = partialCount;
  const exportHref = buildAttendanceExportHref(filters);

  const recordColumns: CanvasTableColumn<Record<string, ReactNode>>[] = [
    { h: t("attendance.col.shiftId", locale), k: "shiftId", mono: true },
    {
      h: t("attendance.col.attendanceId", locale),
      k: "attendanceId",
      mono: true,
    },
    { h: t("attendance.col.date", locale), k: "date", mono: true },
    { h: t("attendance.col.driver", locale), k: "driver" },
    { h: t("attendance.col.vehicle", locale), k: "vehicle", mono: true },
    { h: t("attendance.col.status", locale), k: "status" },
    { h: t("attendance.col.clockedIn", locale), k: "clockedIn", mono: true },
    { h: t("attendance.col.clockedOut", locale), k: "clockedOut", mono: true },
    {
      h: t("attendance.col.hours", locale),
      k: "hours",
      mono: true,
      align: "right",
    },
    { h: t("attendance.col.location", locale), k: "location" },
  ];

  const recordTableRows: Record<string, ReactNode>[] = filteredRows.map(
    (row) => {
      const locationText =
        row.startLocation && row.endLocation
          ? `${row.startLocation} → ${row.endLocation}`
          : row.startLocation ?? row.endLocation ?? "—";

      return {
        shiftId: row.shiftId ?? "—",
        attendanceId: row.attendanceId ?? "—",
        date: row.date,
        driver: (
          <Link
            href={`/drivers/${encodeURIComponent(row.driverId)}`}
            data-testid={`attendance-driver-link-${row.rowKey}`}
            style={{
              color: theme.accent,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {row.driverName}{" "}
            <span
              style={{
                color: theme.textMuted,
                fontFamily: theme.monoFamily,
                fontSize: 11,
                fontWeight: 400,
              }}
            >
              ({row.driverId})
            </span>
          </Link>
        ),
        vehicle: row.vehicleId ? (
          <Link
            href={`/vehicles/${encodeURIComponent(row.vehicleId)}`}
            data-testid={`attendance-vehicle-link-${row.rowKey}`}
            style={{
              color: theme.text,
              textDecoration: "none",
              fontFamily: theme.monoFamily,
            }}
          >
            {row.vehicleId}
          </Link>
        ) : (
          "—"
        ),
        status: (
          <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
            {row.shiftStatus ? (
              <Pill theme={theme} tone={shiftTone(row.shiftStatus)} dot>
                {formatOpsCodeLabel(locale, row.shiftStatus)}
              </Pill>
            ) : null}
            {row.attendanceStatus ? (
              <Pill
                theme={theme}
                tone={attendanceStatusTone(row.attendanceStatus)}
                dot
              >
                {formatOpsCodeLabel(locale, row.attendanceStatus)}
              </Pill>
            ) : null}
          </div>
        ),
        clockedIn: formatUtcTimestampShort(row.clockedInAt),
        clockedOut: formatUtcTimestampShort(row.clockedOutAt),
        hours: `${row.totalHours} ${t("attendance.hours", locale)}`,
        location: locationText,
      };
    },
  );

  const emptyEnvelope = emptyReason
    ? buildEmptyEnvelope(emptyReason, "attendance")
    : null;
  const emptyCopy = emptyEnvelope
    ? emptyStateCopy(emptyEnvelope, locale, "attendance")
    : null;

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
          <OpsAttendanceExportButton
            exportHref={exportHref}
            label={t("attendance.export", locale)}
            disabled={loadError !== null}
            disabledReason={loadError}
          />
        }
      />

      <div style={pageBodyStyle}>
        <OpsAttendanceFilterBar
          filters={filters}
          drivers={canonicalView.drivers}
          locale={locale}
          disabled={loadError !== null}
        />

        {loadError ? (
          <Banner
            theme={theme}
            tone="danger"
            title={t("attendance.loadErrorTitle", locale)}
            body={loadError}
          />
        ) : null}

        {view === "exceptions" && exceptionCount > 0 ? (
          <Banner
            theme={theme}
            tone={absentCount > 0 ? "danger" : "warn"}
            title={t("attendance.exceptions.bannerTitle", locale, {
              count: exceptionCount,
            })}
            body={t("attendance.exceptions.bannerBody", locale, {
              absent: absentCount,
              partial: lateCount,
            })}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={t("attendance.scheduledDrivers", locale)}
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
            label={t("attendance.exceptionLate", locale)}
            value={exceptionCount}
            delta={
              absentCount > 0
                ? t("attendance.absentCount", locale, {
                    count: absentCount,
                  })
                : undefined
            }
            deltaTone={exceptionCount > 0 ? "down" : "neutral"}
            sub={
              partialCount > 0
                ? t("attendance.partialCount", locale, {
                    count: partialCount,
                  })
                : undefined
            }
          />
        </div>

        <Card
          theme={theme}
          title={t("attendance.gantt.title", locale)}
          actions={
            <>
              <Pill theme={theme} tone="info" dot>
                {t("attendance.gantt.legend.active", locale)}
              </Pill>
              <Pill theme={theme} tone="success" dot>
                {t("attendance.gantt.legend.completed", locale)}
              </Pill>
              {scopeShifts.some((shift) => shift.status === "abandoned") ? (
                <Pill theme={theme} tone="danger" dot>
                  {t("attendance.gantt.legend.abandoned", locale)}
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
                          gap: 6,
                        }}
                      >
                        <Link
                          href={`/drivers/${encodeURIComponent(row.driverId)}`}
                          data-testid={`gantt-driver-link-${row.shiftId}`}
                          style={{
                            color: theme.text,
                            textDecoration: "none",
                            fontWeight: 500,
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
          title={t("attendance.attendanceRecords", locale)}
          padding={filteredRows.length > 0 ? 0 : 16}
        >
          {filteredRows.length > 0 ? (
            <Table
              theme={theme}
              columns={recordColumns}
              rows={recordTableRows}
            />
          ) : (
            <div
              role="status"
              data-empty-reason={emptyReason ?? "no_data"}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                color: theme.textMuted,
                fontSize: 12.5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ color: theme.text, fontWeight: 600 }}>
                  {emptyCopy?.title ?? t("attendance.emptyAttendance", locale)}
                </span>
                {emptyReason ? (
                  <Pill theme={theme} tone={emptyReasonTone(emptyReason)} dot>
                    {emptyReason}
                  </Pill>
                ) : null}
              </div>
              <div>
                {emptyCopy?.body ?? t("attendance.emptyAttendance", locale)}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

