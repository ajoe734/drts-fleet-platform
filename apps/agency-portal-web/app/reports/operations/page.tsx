import type {
  AgencyMonthlyOperationsSummaryView,
  AgencyOperationsSummaryView,
} from "@drts/contracts";
import { Card, CardHeader, DataTable, PageHeader, Td, Tr } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { PortalShell } from "@/components/portal-shell";
import { display, displayDateTime, displayPercent } from "@/lib/format";
import { getServerLocale } from "@/lib/server-locale";
import {
  firstParam,
  loadAgencyData,
  readAgencyProfile,
} from "@/lib/session.server";
import { type Locale, t } from "@/lib/translations";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getFigureColumns(locale: Locale) {
  return [
    { label: t("reports.operations.col.businessArea", undefined, locale) },
    { label: t("reports.operations.col.service", undefined, locale) },
    { label: t("reports.operations.col.demand", undefined, locale) },
    { label: t("reports.operations.col.actualDispatch", undefined, locale) },
    { label: t("reports.operations.col.completed", undefined, locale) },
    { label: t("reports.operations.col.cancelled", undefined, locale) },
    { label: t("reports.operations.col.onTime", undefined, locale) },
    { label: t("reports.operations.col.lateArrival", undefined, locale) },
    { label: t("reports.operations.col.noShow", undefined, locale) },
    {
      label: t("reports.operations.col.punctualityUnknown", undefined, locale),
    },
    { label: t("reports.operations.col.avgDispatchable", undefined, locale) },
    {
      label: t(
        "reports.operations.col.validExpectedSnapshots",
        undefined,
        locale,
      ),
    },
    { label: t("reports.operations.col.snapshotCoverage", undefined, locale) },
    { label: t("reports.operations.col.complaintCount", undefined, locale) },
    { label: t("reports.operations.col.generatedAt", undefined, locale) },
  ];
}

function FigureCells({
  row,
  locale,
}: {
  row: AgencyOperationsSummaryView | AgencyMonthlyOperationsSummaryView;
  locale: Locale;
}) {
  return (
    <>
      <Td>{display(row.businessArea, locale)}</Td>
      <Td>{display(row.serviceProductCode, locale)}</Td>
      <Td>{row.demandRequestCount}</Td>
      <Td>{row.actualDispatchCount}</Td>
      <Td>{row.completedTripCount}</Td>
      <Td>{row.cancelledOrderCount}</Td>
      <Td>{display(row.onTimeTripCount, locale)}</Td>
      <Td>{display(row.lateTripCount, locale)}</Td>
      <Td>{display(row.noShowTripCount, locale)}</Td>
      <Td>{display(row.punctualityUnknownTripCount, locale)}</Td>
      <Td>{display(row.averageDispatchableVehicleCount, locale)}</Td>
      <Td>{`${row.validSnapshotCount} / ${row.expectedSnapshotCount}`}</Td>
      <Td>{displayPercent(row.snapshotCoverageRate, locale)}</Td>
      <Td>{row.complaintCount}</Td>
      <Td>{displayDateTime(row.generatedAt, locale)}</Td>
    </>
  );
}

export default async function OperationsReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, locale] = await Promise.all([searchParams, getServerLocale()]);
  const periodMonthFrom =
    firstParam(params.periodMonthFrom) ?? firstParam(params.from);
  const periodMonthTo =
    firstParam(params.periodMonthTo) ?? firstParam(params.to);
  const businessArea = firstParam(params.businessArea);
  const summary = await loadAgencyData<{ items: AgencyOperationsSummaryView[] }>(
    "/reports/operations",
    ["reports", "operations-summary"],
    {
      periodMonthFrom,
      periodMonthTo,
      businessArea,
    },
  );
  const sameBatchMonthly: AgencyMonthlyOperationsSummaryView[] | null =
    summary.data
      ? summary.data.items
          .flatMap(
            (row: AgencyOperationsSummaryView) => row.monthlySummaries ?? [],
          )
          .sort(
            (
              left: AgencyMonthlyOperationsSummaryView,
              right: AgencyMonthlyOperationsSummaryView,
            ) =>
              right.periodMonth.localeCompare(left.periodMonth) ||
              (left.businessArea ?? "").localeCompare(
                right.businessArea ?? "",
              ) ||
              (left.serviceProductCode ?? "").localeCompare(
                right.serviceProductCode ?? "",
              ),
          )
      : null;
  const profile = await readAgencyProfile();
  const figureColumns = getFigureColumns(locale);
  return (
    <PortalShell
      agencyName={profile?.agencyDisplayName ?? null}
      locale={locale}
    >
      <PageHeader
        title={t("reports.operations.title", undefined, locale)}
        subtitle={t("reports.operations.subtitle", undefined, locale)}
      />
      <form method="get" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <label>
          {t("reports.operations.filter.monthFrom", undefined, locale)}{" "}
          <input
            type="month"
            name="periodMonthFrom"
            defaultValue={periodMonthFrom ?? ""}
          />
        </label>
        <label>
          {t("reports.operations.filter.monthTo", undefined, locale)}{" "}
          <input
            type="month"
            name="periodMonthTo"
            defaultValue={periodMonthTo ?? ""}
          />
        </label>
        <button type="submit">{t("common.search", undefined, locale)}</button>
      </form>
      {summary.data ? (
        <Card>
          <CardHeader>
            {t("reports.operations.summaryHeader", undefined, locale)}
          </CardHeader>
          <DataTable
            columns={[
              {
                label: t(
                  "reports.operations.col.periodRange",
                  undefined,
                  locale,
                ),
              },
              ...figureColumns,
            ]}
            empty={t("common.empty", undefined, locale)}
          >
            {summary.data.items.map((row: AgencyOperationsSummaryView) => (
              <Tr key={`${row.businessArea}:${row.serviceProductCode}`}>
                <Td>{`${row.from.slice(0, 7)} ~ ${row.to.slice(0, 7)}`}</Td>
                <FigureCells row={row} locale={locale} />
              </Tr>
            ))}
          </DataTable>
        </Card>
      ) : (
        <ErrorNotice
          status={summary.status}
          error={summary.error}
          locale={locale}
        />
      )}
      <div style={{ height: 16 }} />
      {sameBatchMonthly ? (
        <Card>
          <CardHeader>
            {t("reports.operations.monthlyHeader", undefined, locale)}
          </CardHeader>
          <DataTable
            columns={[
              { label: t("reports.operations.col.month", undefined, locale) },
              ...figureColumns,
            ]}
            empty={t("common.empty", undefined, locale)}
          >
            {sameBatchMonthly.map((row: AgencyMonthlyOperationsSummaryView) => (
              <Tr
                key={`${row.periodMonth}:${row.businessArea}:${row.serviceProductCode}`}
              >
                <Td>{row.periodMonth}</Td>
                <FigureCells row={row} locale={locale} />
              </Tr>
            ))}
          </DataTable>
        </Card>
      ) : (
        <ErrorNotice
          status={summary.status}
          error={summary.error}
          locale={locale}
        />
      )}
    </PortalShell>
  );
}
