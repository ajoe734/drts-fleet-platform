import type { AgencyTripRecordView } from "@drts/contracts";
import { Card, CardBody, PageHeader } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { PortalShell } from "@/components/portal-shell";
import { PrgMask } from "@/components/prg-mask";
import {
  display,
  displayDateTime,
  displayLegalHoldState,
  displayMinor,
  displayPaymentStatus,
  displayRouteSource,
  displayTollSource,
} from "@/lib/format";
import { getServerLocale } from "@/lib/server-locale";
import { loadAgencyData, readAgencyProfile } from "@/lib/session.server";
import { t } from "@/lib/translations";

export default async function TripRecordDetailPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const locale = await getServerLocale();
  const { recordId } = await params;
  const result = await loadAgencyData<AgencyTripRecordView>(
    `/trip-records/${encodeURIComponent(recordId)}`,
    ["trip-records", recordId],
  );
  const profile = await readAgencyProfile();
  const record = result.data;
  return (
    <PortalShell
      agencyName={profile?.agencyDisplayName ?? null}
      locale={locale}
    >
      <PageHeader title={t("tripRecordDetail.title", undefined, locale)} />
      {record ? (
        <Card>
          <CardBody>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "200px 1fr",
                gap: 8,
                margin: 0,
              }}
            >
              <dt>{t("tripRecordDetail.recordId", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>{record.recordId}</dd>
              <dt>{t("tripRecordDetail.orderTripId", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {display(record.orderId, locale)} /{" "}
                {display(record.tripId, locale)}
              </dd>
              <dt>{t("tripRecordDetail.orderNo", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {display(record.orderNoMasked, locale)}{" "}
                <PrgMask locale={locale} />
              </dd>
              <dt>{t("tripRecordDetail.plateNo", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {display(record.plateNo ?? record.plateNoMasked, locale)}
              </dd>
              <dt>{t("tripRecordDetail.reservedAt", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {displayDateTime(record.reservedAt, locale)}
              </dd>
              <dt>{t("tripRecordDetail.pickupAt", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {displayDateTime(record.pickupAt, locale)}
              </dd>
              <dt>{t("tripRecordDetail.dropoffAt", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {displayDateTime(record.dropoffAt, locale)}
              </dd>
              <dt>{t("tripRecordDetail.route", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {display(record.route.routeSummary, locale)}
              </dd>
              <dt>{t("tripRecordDetail.routeSource", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {displayRouteSource(record.route.source, locale)}
              </dd>
              <dt>{t("tripRecordDetail.distanceMeters", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {display(record.route.distanceMeters, locale)}
              </dd>
              <dt>
                {t("tripRecordDetail.durationSeconds", undefined, locale)}
              </dt>
              <dd style={{ margin: 0 }}>
                {display(record.route.durationSeconds, locale)}
              </dd>
              <dt>{t("tripRecordDetail.payableFare", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {displayMinor(
                  record.payableFareMinor,
                  record.currency,
                  locale,
                )}
              </dd>
              <dt>{t("tripRecordDetail.actualFare", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {displayMinor(record.actualFareMinor, record.currency, locale)}
              </dd>
              <dt>{t("tripRecordDetail.collectedFare", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {t(
                  "tripRecordDetail.valueWithDetail",
                  {
                    value: displayMinor(
                      record.collectedFareMinor,
                      record.currency,
                      locale,
                    ),
                    detail: displayPaymentStatus(record.paymentStatus, locale),
                  },
                  locale,
                )}
              </dd>
              <dt>{t("tripRecordDetail.toll", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {t(
                  "tripRecordDetail.valueWithDetail",
                  {
                    value: displayMinor(
                      record.tollMinor,
                      record.currency,
                      locale,
                    ),
                    detail: displayTollSource(record.tollSource, locale),
                  },
                  locale,
                )}
              </dd>
              <dt>
                {t(
                  "tripRecordDetail.farePolicyChargingMode",
                  undefined,
                  locale,
                )}
              </dt>
              <dd style={{ margin: 0 }}>
                {display(record.farePolicyVersion, locale)} /{" "}
                {display(record.chargingMode, locale)}
              </dd>
              <dt>
                {t("tripRecordDetail.generatedRetainUntil", undefined, locale)}
              </dt>
              <dd style={{ margin: 0 }}>
                {displayDateTime(record.generatedAt, locale)} /{" "}
                {displayDateTime(record.retainUntil, locale)}
              </dd>
              <dt>{t("tripRecordDetail.legalHold", undefined, locale)}</dt>
              <dd style={{ margin: 0 }}>
                {displayLegalHoldState(record.legalHold.state, locale)}
              </dd>
            </dl>
          </CardBody>
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
