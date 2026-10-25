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

export default async function VehicleQualificationsPage({
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
    AgencyPage<AgencyVehicleQualificationView>
  >("/qualifications/vehicles", ["qualifications", "vehicles"], query);
  const profile = await readAgencyProfile();
  return (
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader
        title="R14 車輛資格與到期"
        subtitle="車號、保單號碼已遮罩；保險人與保額不提供；定期檢驗到期日目前無資料來源（未提供）。"
      />
      <QualificationFilter
        status={query.status}
        windowDays={query.windowDays}
      />
      {result.data ? (
        <Card>
          <DataTable
            columns={[
              { label: "車號" },
              { label: "牌照類別" },
              { label: "營業區" },
              { label: "可派遣" },
              { label: "派遣資格" },
              { label: "保險到期" },
              { label: "保險狀態" },
              { label: "保單號碼" },
              { label: "定期檢驗" },
              { label: "退場狀態" },
            ]}
            minWidth={1100}
            empty="查無資料"
          >
            {result.data.items.map((row, index) => (
              <Tr key={`${row.plateNoMasked}:${index}`}>
                <Td mono>
                  {display(row.plateNoMasked)} <PrgMask />
                </Td>
                <Td>{display(row.licenseType)}</Td>
                <Td>{row.operatingArea}</Td>
                <Td>{displayBoolean(row.dispatchableFlag)}</Td>
                <Td>
                  {displayBoolean(row.dispatchEligible)}
                  {row.dispatchBlockedReasons.length > 0
                    ? `（${row.dispatchBlockedReasons.join("、")}）`
                    : ""}
                </Td>
                <Td>{displayDateTime(row.insuranceEndAt)}</Td>
                <Td>{EXPIRY_STATUS_LABELS[row.insuranceExpiryStatus]}</Td>
                <Td mono>{display(row.policyNoMasked)}</Td>
                <Td>{EXPIRY_STATUS_LABELS[row.inspectionExpiryStatus]}</Td>
                <Td>{display(row.offboardingStatus)}</Td>
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
            />
          </div>
        </Card>
      ) : (
        <ErrorNotice status={result.status} error={result.error} />
      )}
    </PortalShell>
  );
}
