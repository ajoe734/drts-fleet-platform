import type {
  AgencyDriverQualificationView,
  AgencyPage,
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
import { type Locale, t } from "@/lib/translations";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function expiry(date: string | null, status: string, locale: Locale) {
  return t(
    "qualifications.drivers.expiryFormat",
    {
      date: displayDateTime(date, locale),
      status: displayExpiryStatus(status, locale),
    },
    locale,
  );
}

export default async function DriverQualificationsPage({
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
    loadAgencyData<AgencyPage<AgencyDriverQualificationView>>(
      "/qualifications/drivers",
      ["qualifications", "drivers"],
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
        title={t("qualifications.drivers.title", undefined, locale)}
        subtitle={t("qualifications.drivers.subtitle", undefined, locale)}
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
                  "qualifications.drivers.col.driverId",
                  undefined,
                  locale,
                ),
              },
              {
                label: t("qualifications.drivers.col.name", undefined, locale),
              },
              {
                label: t(
                  "qualifications.drivers.col.licensesValid",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.drivers.col.licenseExpiry",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.drivers.col.proLicenseExpiry",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.drivers.col.taxiRegExpiry",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.drivers.col.status",
                  undefined,
                  locale,
                ),
              },
              {
                label: t(
                  "qualifications.drivers.col.dispatchEligible",
                  undefined,
                  locale,
                ),
              },
            ]}
            minWidth={1100}
            empty={t("common.empty", undefined, locale)}
          >
            {result.data.items.map((row, index) => (
              <Tr key={`${row.driverIdMasked}:${index}`}>
                <Td mono>{display(row.driverIdMasked, locale)}</Td>
                <Td>
                  {display(row.nameMasked, locale)} <PrgMask locale={locale} />
                </Td>
                <Td>{displayBoolean(row.licensesValid, locale)}</Td>
                <Td>
                  {expiry(row.licenseExpiry, row.licenseExpiryStatus, locale)}
                </Td>
                <Td>
                  {expiry(
                    row.professionalDriverLicenseExpiry,
                    row.professionalDriverLicenseExpiryStatus,
                    locale,
                  )}
                </Td>
                <Td>
                  {expiry(
                    row.taxiDriverRegistrationExpiry,
                    row.taxiDriverRegistrationExpiryStatus,
                    locale,
                  )}
                </Td>
                <Td>{displayStatusCode(row.lifecycleStatus, locale)}</Td>
                <Td>
                  {row.eligibilityBlockedReasons.length > 0
                    ? t(
                        "qualifications.drivers.blockedFormat",
                        {
                          eligible: displayBoolean(
                            row.dispatchEligible,
                            locale,
                          ),
                          reasons: row.eligibilityBlockedReasons
                            .map((reason) => displayStatusCode(reason, locale))
                            .join(separator),
                        },
                        locale,
                      )
                    : displayBoolean(row.dispatchEligible, locale)}
                </Td>
              </Tr>
            ))}
          </DataTable>
          <div style={{ padding: "0 16px" }}>
            <Pager
              basePath="/qualifications/drivers"
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
