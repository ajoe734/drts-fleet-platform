import type {
  AgencyComplaintCounts,
  AgencyComplaintMonthlyStatisticsResponse,
} from "@drts/contracts";
import { Card, DataTable, PageHeader, Td, Tr } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { PortalShell } from "@/components/portal-shell";
import { displayDateTime, notProvided } from "@/lib/format";
import { getServerLocale } from "@/lib/server-locale";
import {
  firstParam,
  loadAgencyData,
  readAgencyProfile,
} from "@/lib/session.server";
import { type Locale, type TranslationKey, t } from "@/lib/translations";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const METRIC_LABEL_KEYS: Record<string, TranslationKey> = {
  resolvedCount: "reports.complaints.metric.resolvedCount",
  slaBreachCount: "reports.complaints.metric.slaBreachCount",
};

function counts(value: AgencyComplaintCounts | null, locale: Locale) {
  return value
    ? `${value.createdCount} / ${value.closedCount} / ${value.overdueCount}`
    : notProvided(locale);
}

export default async function ComplaintStatisticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, locale] = await Promise.all([searchParams, getServerLocale()]);
  const periodMonthFrom = firstParam(params.periodMonthFrom);
  const periodMonthTo = firstParam(params.periodMonthTo);
  const [result, profile] = await Promise.all([
    loadAgencyData<AgencyComplaintMonthlyStatisticsResponse>(
      "/reports/complaints",
      ["reports", "complaint-monthly-statistics"],
      { periodMonthFrom, periodMonthTo },
    ),
    readAgencyProfile(),
  ]);
  const separator = t("common.listSeparator", undefined, locale);
  return (
    <PortalShell
      agencyName={profile?.agencyDisplayName ?? null}
      locale={locale}
    >
      <PageHeader
        title={t("reports.complaints.title", undefined, locale)}
        subtitle={t("reports.complaints.subtitle", undefined, locale)}
      />
      <form
        method="get"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
      >
        <label>
          {t("reports.complaints.filter.from", undefined, locale)}{" "}
          <input
            name="periodMonthFrom"
            placeholder="YYYY-MM"
            defaultValue={periodMonthFrom ?? ""}
          />
        </label>
        <label>
          {t("reports.complaints.filter.to", undefined, locale)}{" "}
          <input
            name="periodMonthTo"
            placeholder="YYYY-MM"
            defaultValue={periodMonthTo ?? ""}
          />
        </label>
        <button type="submit">{t("common.search", undefined, locale)}</button>
      </form>
      {result.data ? (
        <>
          <p style={{ fontSize: 13 }}>
            {t(
              "reports.complaints.asOfNote",
              { asOf: displayDateTime(result.data.statisticsAsOf, locale) },
              locale,
            )}
          </p>
          {result.data.unavailableMetrics.length > 0 ? (
            <p style={{ fontSize: 13, color: "#92400e" }}>
              {t(
                "reports.complaints.unavailableNote",
                {
                  metrics: result.data.unavailableMetrics
                    .map((metric) => {
                      const key = METRIC_LABEL_KEYS[metric];
                      return key ? t(key, undefined, locale) : metric;
                    })
                    .join(separator),
                  notProvided: notProvided(locale),
                },
                locale,
              )}
            </p>
          ) : null}
          <Card>
            <DataTable
              columns={[
                {
                  label: t(
                    "reports.complaints.col.month",
                    undefined,
                    locale,
                  ),
                },
                {
                  label: t(
                    "reports.complaints.col.businessArea",
                    undefined,
                    locale,
                  ),
                },
                {
                  label: t(
                    "reports.complaints.col.service",
                    undefined,
                    locale,
                  ),
                },
                {
                  label: t(
                    "reports.complaints.col.complaintCount",
                    undefined,
                    locale,
                  ),
                },
                {
                  label: t(
                    "reports.complaints.col.byCategory",
                    undefined,
                    locale,
                  ),
                },
                {
                  label: t(
                    "reports.complaints.col.lowRatingAuto",
                    undefined,
                    locale,
                  ),
                },
                {
                  label: t(
                    "reports.complaints.col.manual",
                    undefined,
                    locale,
                  ),
                },
              ]}
              empty={t("common.empty", undefined, locale)}
            >
              {result.data.items.map((row) => (
                <Tr
                  key={`${row.periodMonth}:${row.businessArea}:${row.serviceProductCode}`}
                >
                  <Td>{row.periodMonth}</Td>
                  <Td>{row.businessArea}</Td>
                  <Td>{row.serviceProductCode}</Td>
                  <Td>{row.complaintCount}</Td>
                  <Td>
                    {Object.entries(row.complaintsByCategory)
                      .map(([category, count]) => `${category}: ${count}`)
                      .join(separator) || "—"}
                  </Td>
                  <Td>{counts(row.lowRatingAuto, locale)}</Td>
                  <Td>{counts(row.manual, locale)}</Td>
                </Tr>
              ))}
            </DataTable>
          </Card>
        </>
      ) : (
        <ErrorNotice
          status={result.status}
          error={result.error}
          locale={locale}
        />
      )}
    </PortalShell>
  );
}
