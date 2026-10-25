import type {
  AgencyPage,
  AgencyVehicleQualificationView,
} from "@drts/contracts";
import { Card, DataTable, PageHeader, Td, Tr } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { Pager } from "@/components/pager";
import { PortalShell } from "@/components/portal-shell";
import { PrgMask } from "@/components/prg-mask";
import { QualificationFilter } from "@/components/qualification-filter";
import {
  display,
  displayBoolean,
  displayDateTime,
  displayExpiryStatus,
  displayStatusCode,
} from "@/lib/format";
import { getServerLocale } from "@/lib/server-locale";
import {
  firstParam,
  loadAgencyData,
  readAgencyProfile,
} from "@/lib/session.server";
import { t } from "@/lib/translations";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function VehicleQualificationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, locale] = await Promise.all([searchParams, getServerLocale()]);
  const query = {
    status: firstParam(params.status),
    windowDays: firstParam(params.windowDays),
    page: firstParam(params.page),
  };
  const [result, profile] = await Promise.all([
    loadAgencyData<AgencyPage<AgencyVehicleQualificationView>>(
      "/qualifications/vehicles",
      ["qualifications", "vehicles"],
      query,
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
        title={t("qualifications.vehicles.title", undefined, locale)}
        subtitle={t("qualifications.vehicles.subtitle", undefined, locale)}
      />
      <QualificationFilter
        status={query.status}
        windowDays={query.windowDays}
        locale={locale}
      />
      {result.data ? (
        <Card>
          <DataTable
            columns={[
              {
                label: t(
                  "qualifications.vehicles.col.plateNo",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.vehicles.col.licenseType",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.vehicles.col.operatingArea",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.vehicles.col.dispatchableFlag",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.vehicles.col.dispatchEligible",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.vehicles.col.insuranceEndAt",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.vehicles.col.insuranceStatus",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.vehicles.col.policyNo",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.vehicles.col.inspectionStatus",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.vehicles.col.offboardingStatus",
                  undefined,
                  locale,
                ),
              },
            ]}
            minWidth={1100}
            empty={t("common.empty", undefined, locale)}
          >
            {result.data.items.map((row, index) => (
              <Tr key={`${row.plateNoMasked}:${index}`}>
                <Td mono>
                  {display(row.plateNoMasked, locale)}{" "}
                  <PrgMask locale={locale} />
                </Td>
                <Td>{display(row.licenseType, locale)}</Td>
                <Td>{display(row.operatingArea, locale)}</Td>
                <Td>{displayBoolean(row.dispatchableFlag, locale)}</Td>
                <Td>
                  {row.dispatchBlockedReasons.length > 0
                    ? t(
                        "qualifications.vehicles.blockedFormat",
                        {
                          eligible: displayBoolean(
                            row.dispatchEligible,
                            locale,
                          ),
                          reasons: row.dispatchBlockedReasons
                            .map((reason) => displayStatusCode(reason, locale))
                            .join(separator),
                        },
                        locale,
                      )
                    : displayBoolean(row.dispatchEligible, locale)}
                </Td>
                <Td>{displayDateTime(row.insuranceEndAt, locale)}</Td>
                <Td>{displayExpiryStatus(row.insuranceExpiryStatus, locale)}</Td>
                <Td mono>{display(row.policyNoMasked, locale)}</Td>
                <Td>
                  {displayExpiryStatus(row.inspectionExpiryStatus, locale)}
                </Td>
                <Td>{displayStatusCode(row.offboardingStatus, locale)}</Td>
              </Tr>
            ))}
          </DataTable>
          <div style={{ padding: "0 16px" }}>
            <Pager
              basePath="/qualifications/vehicles"
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
