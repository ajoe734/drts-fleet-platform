"use client";

import { useState, type CSSProperties } from "react";
import type {
  ComplaintMonthlyCounts,
  DispatchDailyRecord,
  SixMonthOperationsSummary,
} from "@drts/contracts";
import {
  CanvasBtn,
  CanvasDL,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";
import { getOpsClient } from "../../lib/api-client";
import { formatOpsCodeLabel } from "../../lib/localized-labels";
import type { Locale } from "../../lib/translations";
import { operationsMetricsCopy } from "./translations";

type Drill = { kind: "order" | "case"; label: string; ids: string[] };

type MonthRow = {
  key: string;
  periodMonth: string;
  lowRatingAuto: ComplaintMonthlyCounts;
  manual: ComplaintMonthlyCounts;
};

type CategoryRow = ComplaintMonthlyCounts & {
  key: string;
  periodMonth: string;
  category: string;
};

type OrderLookup =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "loaded"; record: DispatchDailyRecord };

export function OperationsMetricsSection({
  row,
  theme,
  locale,
  formatTime,
}: {
  row: SixMonthOperationsSummary;
  theme: CanvasTheme;
  locale: Locale;
  formatTime: (value: string | null | undefined) => string;
}) {
  const copy = operationsMetricsCopy(locale);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [lookups, setLookups] = useState<Record<string, OrderLookup>>({});
  const punctuality = row.drilldown?.punctuality;
  const months = row.drilldown?.complaintMonthlyStatistics ?? [];

  const numberButtonStyle: CSSProperties = {
    padding: 0,
    border: 0,
    background: "transparent",
    color: theme.accent,
    fontFamily: theme.monoFamily,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
  const copyStyle: CSSProperties = {
    fontSize: 11.5,
    lineHeight: 1.5,
    color: theme.textMuted,
    margin: "6px 0 0",
  };
  const headingStyle: CSSProperties = {
    fontSize: 12.5,
    fontWeight: 600,
    color: theme.text,
    marginTop: 16,
  };

  // Without the drill-down ids a figure cannot be traced, so it is shown as
  // not provided rather than as a bare count.
  const drillNumber = (
    count: number | undefined,
    ids: string[] | undefined,
    kind: Drill["kind"],
    label: string,
  ) => {
    if (count === undefined || ids === undefined) {
      return <span>{copy.notProvided}</span>;
    }
    return (
      <button
        type="button"
        style={numberButtonStyle}
        onClick={() => setDrill({ kind, label, ids })}
      >
        {String(count)}
      </button>
    );
  };

  async function loadOrder(orderId: string) {
    setLookups((current) => ({ ...current, [orderId]: { status: "loading" } }));
    try {
      const records = await getOpsClient().listDailyDispatchRecords({
        orderId,
      });
      const record = records.find((item) => item.orderId === orderId);
      setLookups((current) => ({
        ...current,
        [orderId]: record
          ? { status: "loaded", record }
          : { status: "missing" },
      }));
    } catch (error) {
      setLookups((current) => ({
        ...current,
        [orderId]: {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  const countCells = (
    counts: (r: MonthRow) => ComplaintMonthlyCounts,
    prefix: string,
  ): CanvasTableColumn<MonthRow>[] => [
    {
      h: `${prefix} ${copy.created}`,
      align: "right",
      r: (r) =>
        drillNumber(
          counts(r).createdCount,
          counts(r).createdCaseNos,
          "case",
          `${r.periodMonth} ${prefix} ${copy.created}`,
        ),
    },
    {
      h: `${prefix} ${copy.closed}`,
      align: "right",
      r: (r) =>
        drillNumber(
          counts(r).closedCount,
          counts(r).closedCaseNos,
          "case",
          `${r.periodMonth} ${prefix} ${copy.closed}`,
        ),
    },
    {
      h: `${prefix} ${copy.overdue}`,
      align: "right",
      r: (r) =>
        drillNumber(
          counts(r).overdueCount,
          counts(r).overdueCaseNos,
          "case",
          `${r.periodMonth} ${prefix} ${copy.overdue}`,
        ),
    },
  ];

  const monthColumns: CanvasTableColumn<MonthRow>[] = [
    { h: copy.month, mono: true, r: (r) => r.periodMonth },
    ...countCells((r) => r.lowRatingAuto, copy.lowRatingAuto),
    ...countCells((r) => r.manual, copy.manual),
  ];

  const categoryRows: CategoryRow[] = months.flatMap((month) =>
    month.manualByCategory.map((entry) => ({
      ...entry,
      key: `${month.periodMonth}:${entry.category}`,
      periodMonth: month.periodMonth,
    })),
  );
  const categoryLabel = (r: CategoryRow) =>
    `${r.periodMonth} ${formatOpsCodeLabel(locale, r.category)}`;
  const categoryColumns: CanvasTableColumn<CategoryRow>[] = [
    { h: copy.month, mono: true, r: (r) => r.periodMonth },
    {
      h: copy.manualByCategory,
      r: (r) => formatOpsCodeLabel(locale, r.category),
    },
    {
      h: copy.created,
      align: "right",
      r: (r) =>
        drillNumber(
          r.createdCount,
          r.createdCaseNos,
          "case",
          `${categoryLabel(r)} ${copy.created}`,
        ),
    },
    {
      h: copy.closed,
      align: "right",
      r: (r) =>
        drillNumber(
          r.closedCount,
          r.closedCaseNos,
          "case",
          `${categoryLabel(r)} ${copy.closed}`,
        ),
    },
    {
      h: copy.overdue,
      align: "right",
      r: (r) =>
        drillNumber(
          r.overdueCount,
          r.overdueCaseNos,
          "case",
          `${categoryLabel(r)} ${copy.overdue}`,
        ),
    },
  ];

  const threshold = row.lateArrivalThresholdMinutes;

  return (
    <div>
      <div style={headingStyle}>{copy.punctualityTitle}</div>
      <p style={copyStyle}>
        {threshold === undefined
          ? copy.notProvided
          : copy.punctualityLate(threshold)}
      </p>
      <p style={copyStyle}>{copy.punctualityNoShow}</p>
      <p style={copyStyle}>{copy.punctualityUnknown}</p>
      <div style={{ height: 8 }} />
      <CanvasDL
        theme={theme}
        cols={2}
        items={[
          {
            label: copy.assigned,
            value: String(row.actualDispatchCount),
            mono: true,
          },
          {
            label: copy.onTime,
            value: drillNumber(
              punctuality ? row.onTimeTripCount : undefined,
              punctuality?.onTimeOrderIds,
              "order",
              copy.onTime,
            ),
          },
          {
            label: copy.late,
            value: drillNumber(
              punctuality ? row.lateTripCount : undefined,
              punctuality?.lateOrderIds,
              "order",
              copy.late,
            ),
          },
          {
            label: copy.noShow,
            value: drillNumber(
              punctuality ? row.noShowTripCount : undefined,
              punctuality?.noShowOrderIds,
              "order",
              copy.noShow,
            ),
          },
          {
            label: copy.unknown,
            value: drillNumber(
              punctuality ? row.punctualityUnknownTripCount : undefined,
              punctuality?.unknownOrderIds,
              "order",
              copy.unknown,
            ),
          },
        ]}
      />

      <div style={headingStyle}>{copy.complaintTitle}</div>
      <p style={copyStyle}>
        {copy.complaintDefinition(
          row.complaintStatisticsAsOf
            ? formatTime(row.complaintStatisticsAsOf)
            : copy.notProvided,
        )}
      </p>
      <p style={copyStyle}>{copy.drillHint}</p>
      <div style={{ height: 8 }} />
      {months.length > 0 ? (
        <CanvasTable<MonthRow>
          theme={theme}
          columns={monthColumns}
          rows={months.map((month) => ({
            key: month.periodMonth,
            periodMonth: month.periodMonth,
            lowRatingAuto: month.lowRatingAuto,
            manual: month.manual,
          }))}
        />
      ) : (
        <p style={copyStyle}>{copy.notProvided}</p>
      )}
      {categoryRows.length > 0 ? (
        <>
          <div style={{ height: 8 }} />
          <CanvasTable<CategoryRow>
            theme={theme}
            columns={categoryColumns}
            rows={categoryRows}
          />
        </>
      ) : null}

      {drill ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: theme.surfaceLo,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>
              {copy.drillTitle(drill.label, drill.ids.length)}
            </div>
            <CanvasBtn theme={theme} size="xs" onClick={() => setDrill(null)}>
              {copy.close}
            </CanvasBtn>
          </div>
          {drill.ids.length === 0 ? (
            <p style={copyStyle}>{copy.drillEmpty}</p>
          ) : (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {drill.ids.map((id) => {
                const lookup = lookups[id];
                return (
                  <li
                    key={id}
                    style={{
                      fontFamily: theme.monoFamily,
                      fontSize: 11.5,
                      marginBottom: 6,
                    }}
                  >
                    <span>{id}</span>{" "}
                    {drill.kind === "case" ? (
                      <a
                        href={`/complaints/${encodeURIComponent(id)}`}
                        style={{ color: theme.accent, fontWeight: 600 }}
                      >
                        {copy.openCase}
                      </a>
                    ) : (
                      <button
                        type="button"
                        style={numberButtonStyle}
                        disabled={lookup?.status === "loading"}
                        onClick={() => void loadOrder(id)}
                      >
                        {copy.loadRecord}
                      </button>
                    )}
                    {lookup?.status === "missing" ? (
                      <div style={copyStyle}>{copy.recordMissing}</div>
                    ) : null}
                    {lookup?.status === "error" ? (
                      <div style={copyStyle}>{lookup.message}</div>
                    ) : null}
                    {lookup?.status === "loaded" ? (
                      <OrderRecordFacts
                        record={lookup.record}
                        locale={locale}
                        style={copyStyle}
                        formatTime={formatTime}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function OrderRecordFacts({
  record,
  locale,
  style,
  formatTime,
}: {
  record: DispatchDailyRecord;
  locale: Locale;
  style: CSSProperties;
  formatTime: (value: string | null | undefined) => string;
}) {
  const copy = operationsMetricsCopy(locale);
  const time = (value: string | null) =>
    value ? formatTime(value) : copy.notProvided;
  const facts: Array<[string, string]> = [
    [copy.field.reservationTime, time(record.reservationTime)],
    [copy.field.firstAssignedAt, time(record.firstAssignedAt)],
    [
      copy.field.etaSecondsAtAssignment,
      record.etaSecondsAtAssignment === null
        ? copy.notProvided
        : String(record.etaSecondsAtAssignment),
    ],
    [copy.field.arrivedPickupAt, time(record.arrivedPickupAt)],
    [copy.field.finalStatus, formatOpsCodeLabel(locale, record.finalStatus)],
    [
      copy.field.cancellationReason,
      record.cancellationReason ?? copy.notProvided,
    ],
  ];
  return (
    <div style={style}>
      {facts.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <span>{" · "}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}
