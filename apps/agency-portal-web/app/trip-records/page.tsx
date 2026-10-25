import type { AgencyPage, AgencyTripRecordView } from "@drts/contracts";
import { Card, DataTable, PageHeader, Td, Tr } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { Pager } from "@/components/pager";
import { PortalShell } from "@/components/portal-shell";
import { PrgMask } from "@/components/prg-mask";
import {
  display,
  displayDateTime,
  displayLegalHoldState,
  displayMinor,
  displayPaymentStatus,
  displayRouteSource,
} from "@/lib/format";
import { getServerLocale } from "@/lib/server-locale";
import {
  firstParam,
  loadAgencyData,
  readAgencyProfile,
} from "@/lib/session.server";
import { t } from "@/lib/translations";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TripRecordsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const locale = await getServerLocale();
  const params = await searchParams;
  const query = {
    month: firstParam(params.month),
    reservedFrom: firstParam(params.reservedFrom),
    reservedTo: firstParam(params.reservedTo),
    plateNo: firstParam(params.plateNo),
    orderNo: firstParam(params.orderNo),
    orderId: firstParam(params.orderId),
    tripId: firstParam(params.tripId),
    recordId: firstParam(params.recordId),
    legalHold: firstParam(params.legalHold),
    page: firstParam(params.page),
    pageSize: firstParam(params.pageSize),
  };
  const exportParams = new URLSearchParams();
  for (const key of [
    "month",
    "reservedFrom",
    "reservedTo",
    "plateNo",
    "orderNo",
    "orderId",
    "tripId",
    "recordId",
  ] as const) {
    const val = query[key];
    if (val) exportParams.set(key, val);
  }
  const exportHref = `/trip-records/exports${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;

  const result = await loadAgencyData<AgencyPage<AgencyTripRecordView>>(
    "/trip-records",
    ["trip-records"],
    query,
  );
  const profile = await readAgencyProfile();
  return (
    <PortalShell
      agencyName={profile?.agencyDisplayName ?? null}
      locale={locale}
    >
      <PageHeader
        title={t("tripRecords.title", undefined, locale)}
        subtitle={t("tripRecords.subtitle", undefined, locale)}
      />
      <form
        method="get"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
      >
        <label>
          {t("tripRecords.filter.month", undefined, locale)}{" "}
          <input
            name="month"
            placeholder="YYYY-MM"
            defaultValue={query.month ?? ""}
          />
        </label>
        <label>
          {t("tripRecords.filter.reservedFrom", undefined, locale)}{" "}
          <input
            name="reservedFrom"
            type="date"
            defaultValue={query.reservedFrom ?? ""}
          />
        </label>
        <label>
          {t("tripRecords.filter.reservedTo", undefined, locale)}{" "}
          <input
            name="reservedTo"
            type="date"
            defaultValue={query.reservedTo ?? ""}
          />
        </label>
        <label>
          {t("tripRecords.filter.plateNo", undefined, locale)}{" "}
          <input
            name="plateNo"
            placeholder={t(
              "tripRecords.filter.plateNoPlaceholder",
              undefined,
              locale,
            )}
            defaultValue={query.plateNo ?? ""}
          />
        </label>
        <label>
          {t("tripRecords.filter.orderNo", undefined, locale)}{" "}
          <input
            name="orderNo"
            placeholder={t(
              "tripRecords.filter.orderNoPlaceholder",
              undefined,
              locale,
            )}
            defaultValue={query.orderNo ?? ""}
          />
        </label>
        <label>
          {t("tripRecords.filter.orderId", undefined, locale)}{" "}
          <input
            name="orderId"
            placeholder={t(
              "tripRecords.filter.orderIdPlaceholder",
              undefined,
              locale,
            )}
            defaultValue={query.orderId ?? ""}
          />
        </label>
        <label>
          {t("tripRecords.filter.tripId", undefined, locale)}{" "}
          <input
            name="tripId"
            placeholder={t(
              "tripRecords.filter.tripIdPlaceholder",
              undefined,
              locale,
            )}
            defaultValue={query.tripId ?? ""}
          />
        </label>
        <label>
          {t("tripRecords.filter.recordId", undefined, locale)}{" "}
          <input
            name="recordId"
            placeholder="mtr-..."
            defaultValue={query.recordId ?? ""}
          />
        </label>
        <label>
          {t("tripRecords.filter.legalHold", undefined, locale)}
          <select name="legalHold" defaultValue={query.legalHold ?? "all"}>
            <option value="all">{t("common.all", undefined, locale)}</option>
            <option value="active">
              {t("legalHold.active", undefined, locale)}
            </option>
            <option value="none">
              {t("legalHold.none", undefined, locale)}
            </option>
          </select>
        </label>
        <button type="submit">{t("common.search", undefined, locale)}</button>
        <a href={exportHref} style={{ alignSelf: "center" }}>
          {t("tripRecords.exportCurrentScope", undefined, locale)}
        </a>
      </form>
      {result.data ? (
        <Card>
          <div style={{ padding: "12px 16px 0", fontWeight: 500 }}>
            {t(
              "tripRecords.resultSummary",
              { total: result.data.total },
              locale,
            )}
          </div>
          <DataTable
            columns={[
              { label: t("tripRecords.col.orderTrip", undefined, locale) },
              { label: t("tripRecords.col.plateNo", undefined, locale) },
              { label: t("tripRecords.col.reservedAt", undefined, locale) },
              { label: t("tripRecords.col.pickupAt", undefined, locale) },
              { label: t("tripRecords.col.dropoffAt", undefined, locale) },
              {
                label: t("tripRecords.col.routeWithSource", undefined, locale),
              },
              { label: t("tripRecords.col.distanceMeters", undefined, locale) },
              { label: t("tripRecords.col.payableFare", undefined, locale) },
              {
                label: t(
                  "tripRecords.col.collectedFareWithStatus",
                  undefined,
                  locale,
                ),
              },
              { label: t("tripRecords.col.toll", undefined, locale) },
              { label: t("tripRecords.col.retainUntil", undefined, locale) },
              { label: t("tripRecords.col.legalHold", undefined, locale) },
            ]}
            empty={t("common.empty", undefined, locale)}
          >
            {result.data.items.map((record: AgencyTripRecordView) => (
              <Tr key={record.recordId}>
                <Td mono>
                  <a
                    href={`/trip-records/${encodeURIComponent(record.recordId)}`}
                  >
                    {display(record.orderNoMasked, locale)}
                  </a>{" "}
                  <PrgMask locale={locale} />
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {record.tripId}
                  </div>
                </Td>
                <Td mono>
                  {display(record.plateNo ?? record.plateNoMasked, locale)}
                </Td>
                <Td>{displayDateTime(record.reservedAt, locale)}</Td>
                <Td>{displayDateTime(record.pickupAt, locale)}</Td>
                <Td>{displayDateTime(record.dropoffAt, locale)}</Td>
                <Td>
                  <div>{display(record.route.routeSummary, locale)}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {displayRouteSource(record.route.source, locale)}
                  </div>
                </Td>
                <Td>{display(record.route.distanceMeters, locale)}</Td>
                <Td>
                  {displayMinor(
                    record.payableFareMinor,
                    record.currency,
                    locale,
                  )}
                </Td>
                <Td>
                  <div>
                    {displayMinor(
                      record.collectedFareMinor,
                      record.currency,
                      locale,
                    )}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {displayPaymentStatus(record.paymentStatus, locale)}
                  </div>
                </Td>
                <Td>
                  {displayMinor(record.tollMinor, record.currency, locale)}
                </Td>
                <Td>{displayDateTime(record.retainUntil, locale)}</Td>
                <Td>{displayLegalHoldState(record.legalHold.state, locale)}</Td>
              </Tr>
            ))}
          </DataTable>
          <div style={{ padding: "0 16px" }}>
            <Pager
              basePath="/trip-records"
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
