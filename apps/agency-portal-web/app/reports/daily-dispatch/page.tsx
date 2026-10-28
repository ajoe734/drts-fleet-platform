import type {
  AgencyDailyDispatchRecordView,
  AgencyPage,
} from "@drts/contracts";
import { Card, DataTable, PageHeader, Td, Tr } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { Pager } from "@/components/pager";
import { PortalShell } from "@/components/portal-shell";
import { PrgMask } from "@/components/prg-mask";
import { display, displayDateTime, displayStatusCode } from "@/lib/format";
import { getServerLocale } from "@/lib/server-locale";
import {
  firstParam,
  loadAgencyData,
  readAgencyProfile,
} from "@/lib/session.server";
import { t } from "@/lib/translations";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DailyDispatchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, locale] = await Promise.all([searchParams, getServerLocale()]);
  const today = new Date().toISOString().slice(0, 10);
  const query = {
    serviceDateFrom: firstParam(params.serviceDateFrom) ?? today,
    serviceDateTo: firstParam(params.serviceDateTo) ?? today,
    serviceProductCode: firstParam(params.serviceProductCode),
    finalStatus: firstParam(params.finalStatus),
    page: firstParam(params.page),
  };
  const [result, profile] = await Promise.all([
    loadAgencyData<AgencyPage<AgencyDailyDispatchRecordView>>(
      "/reports/daily-dispatch",
      ["reports", "daily-dispatch-records"],
      query,
    ),
    readAgencyProfile(),
  ]);
  return (
    <PortalShell
      agencyName={profile?.agencyDisplayName ?? null}
      locale={locale}
    >
      <PageHeader
        title={t("reports.dailyDispatch.title", undefined, locale)}
        subtitle={t("reports.dailyDispatch.subtitle", undefined, locale)}
      />
      <form
        method="get"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
      >
        <label>
          {t("reports.dailyDispatch.filter.from", undefined, locale)}{" "}
          <input
            type="date"
            name="serviceDateFrom"
            defaultValue={query.serviceDateFrom}
          />
        </label>
        <label>
          {t("reports.dailyDispatch.filter.to", undefined, locale)}{" "}
          <input
            type="date"
            name="serviceDateTo"
            defaultValue={query.serviceDateTo}
          />
        </label>
        <label>
          {t(
            "reports.dailyDispatch.filter.serviceProductCode",
            undefined,
            locale,
          )}{" "}
          <input
            name="serviceProductCode"
            defaultValue={query.serviceProductCode ?? ""}
          />
        </label>
        <label>
          {t("reports.dailyDispatch.filter.finalStatus", undefined, locale)}{" "}
          <input name="finalStatus" defaultValue={query.finalStatus ?? ""} />
        </label>
        <button type="submit">{t("common.search", undefined, locale)}</button>
      </form>
      {result.data ? (
        <Card>
          <DataTable
            columns={[
              {
                label: t(
                  "reports.dailyDispatch.col.serviceDate",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.orderNo",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.source",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.service",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.requestedAt",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.pickupAddress",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.dropoffAddress",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.firstAssignedAt",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.driver",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.plateNo",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.arrivedPickupAt",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.completedAt",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.finalStatus",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.redispatchCount",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.cancellationReason",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "reports.dailyDispatch.col.complaintCount",
                  undefined,
                  locale,
                ),
              },
            ]}
            minWidth={1400}
            empty={t("common.empty", undefined, locale)}
          >
            {result.data.items.map((row, index) => (
              <Tr key={`${row.serviceDate}:${row.orderNoMasked}:${index}`}>
                <Td>{row.serviceDate}</Td>
                <Td mono>{display(row.orderNoMasked, locale)}</Td>
                <Td>{row.orderSource}</Td>
                <Td>{row.serviceProductCode}</Td>
                <Td>{displayDateTime(row.requestedAt, locale)}</Td>
                <Td>{display(row.pickupAddressMasked, locale)}</Td>
                <Td>{display(row.dropoffAddressMasked, locale)}</Td>
                <Td>{displayDateTime(row.firstAssignedAt, locale)}</Td>
                <Td mono>{display(row.finalDriverIdMasked, locale)}</Td>
                <Td mono>
                  {display(row.finalPlateNoMasked, locale)}{" "}
                  <PrgMask locale={locale} />
                </Td>
                <Td>{displayDateTime(row.arrivedPickupAt, locale)}</Td>
                <Td>{displayDateTime(row.tripCompletedAt, locale)}</Td>
                <Td>{displayStatusCode(row.finalStatus, locale)}</Td>
                <Td>{row.redispatchCount}</Td>
                <Td>{display(row.cancellationReason, locale)}</Td>
                <Td>{row.complaintCount}</Td>
              </Tr>
            ))}
          </DataTable>
          <div style={{ padding: "0 16px" }}>
            <Pager
              basePath="/reports/daily-dispatch"
              query={query}
              page={result.data.page}
              pageSize={result.data.pageSize}
              total={result.data.total}
              locale={locale}
            />
          </div>
        </Card>
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
