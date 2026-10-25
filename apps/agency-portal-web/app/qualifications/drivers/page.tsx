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
  EXPIRY_STATUS_LABELS,
  display,
  displayBoolean,
  displayDateTime,
} from "@/lib/format";
import {
  firstParam,
  loadAgencyData,
  readAgencyProfile,
} from "@/lib/session.server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function expiry(date: string | null, status: string) {
  return `${displayDateTime(date)}（${EXPIRY_STATUS_LABELS[status] ?? status}）`;
}

export default async function DriverQualificationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = {
    status: firstParam(params.status),
    windowDays: firstParam(params.windowDays),
    page: firstParam(params.page),
  };
  const result = await loadAgencyData<
    AgencyPage<AgencyDriverQualificationView>
  >("/qualifications/drivers", ["qualifications", "drivers"], query);
  const profile = await readAgencyProfile();
  return (
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader
        title="R14 駕駛資格與到期"
        subtitle="姓名與駕駛代號已遮罩；不提供位置、裝置與工作狀態。"
      />
      <QualificationFilter
        status={query.status}
        windowDays={query.windowDays}
      />
      {result.data ? (
        <Card>
          <DataTable
            columns={[
              { label: "駕駛代號" },
              { label: "姓名" },
              { label: "證照有效" },
              { label: "駕照到期" },
              { label: "職業駕照到期" },
              { label: "計程車登記證到期" },
              { label: "狀態" },
              { label: "可派遣" },
            ]}
            minWidth={1100}
            empty="查無資料"
          >
            {result.data.items.map((row, index) => (
              <Tr key={`${row.driverIdMasked}:${index}`}>
                <Td mono>{display(row.driverIdMasked)}</Td>
                <Td>
                  {display(row.nameMasked)} <PrgMask />
                </Td>
                <Td>{displayBoolean(row.licensesValid)}</Td>
                <Td>{expiry(row.licenseExpiry, row.licenseExpiryStatus)}</Td>
                <Td>
                  {expiry(
                    row.professionalDriverLicenseExpiry,
                    row.professionalDriverLicenseExpiryStatus,
                  )}
                </Td>
                <Td>
                  {expiry(
                    row.taxiDriverRegistrationExpiry,
                    row.taxiDriverRegistrationExpiryStatus,
                  )}
                </Td>
                <Td>{row.lifecycleStatus}</Td>
                <Td>
                  {displayBoolean(row.dispatchEligible)}
                  {row.eligibilityBlockedReasons.length > 0
                    ? `（${row.eligibilityBlockedReasons.join("、")}）`
                    : ""}
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
            />
          </div>
        </Card>
      ) : (
        <ErrorNotice status={result.status} error={result.error} />
      )}
    </PortalShell>
  );
}
