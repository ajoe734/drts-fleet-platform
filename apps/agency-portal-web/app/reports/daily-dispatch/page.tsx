import type {
  AgencyDailyDispatchRecordView,
  AgencyPage,
} from "@drts/contracts";
import { Card, DataTable, PageHeader, Td, Tr } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { Pager } from "@/components/pager";
import { PortalShell } from "@/components/portal-shell";
import { PrgMask } from "@/components/prg-mask";
import { display, displayDateTime } from "@/lib/format";
import {
  firstParam,
  loadAgencyData,
  readAgencyProfile,
} from "@/lib/session.server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DailyDispatchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const query = {
    serviceDateFrom: firstParam(params.serviceDateFrom) ?? today,
    serviceDateTo: firstParam(params.serviceDateTo) ?? today,
    serviceProductCode: firstParam(params.serviceProductCode),
    finalStatus: firstParam(params.finalStatus),
    page: firstParam(params.page),
  };
  const result = await loadAgencyData<
    AgencyPage<AgencyDailyDispatchRecordView>
  >("/reports/daily-dispatch", ["reports", "daily-dispatch-records"], query);
  const profile = await readAgencyProfile();
  return (
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader
        title="R12 每日派遣報表"
        subtitle="區間上限 31 日；地址、車號、駕駛代號皆已遮罩。"
      />
      <form
        method="get"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
      >
        <label>
          起日{" "}
          <input
            type="date"
            name="serviceDateFrom"
            defaultValue={query.serviceDateFrom}
          />
        </label>
        <label>
          迄日{" "}
          <input
            type="date"
            name="serviceDateTo"
            defaultValue={query.serviceDateTo}
          />
        </label>
        <label>
          服務代碼{" "}
          <input
            name="serviceProductCode"
            defaultValue={query.serviceProductCode ?? ""}
          />
        </label>
        <label>
          最終狀態{" "}
          <input name="finalStatus" defaultValue={query.finalStatus ?? ""} />
        </label>
        <button type="submit">查詢</button>
      </form>
      {result.data ? (
        <Card>
          <DataTable
            columns={[
              { label: "服務日" },
              { label: "訂單編號" },
              { label: "來源" },
              { label: "服務" },
              { label: "叫車時間" },
              { label: "上車地點" },
              { label: "下車地點" },
              { label: "首次指派" },
              { label: "駕駛" },
              { label: "車號" },
              { label: "抵達上車點" },
              { label: "完成" },
              { label: "最終狀態" },
              { label: "改派次數" },
              { label: "取消原因" },
              { label: "投訴數" },
            ]}
            minWidth={1400}
            empty="查無資料"
          >
            {result.data.items.map((row, index) => (
              <Tr key={`${row.serviceDate}:${row.orderNoMasked}:${index}`}>
                <Td>{row.serviceDate}</Td>
                <Td mono>{display(row.orderNoMasked)}</Td>
                <Td>{row.orderSource}</Td>
                <Td>{row.serviceProductCode}</Td>
                <Td>{displayDateTime(row.requestedAt)}</Td>
                <Td>{display(row.pickupAddressMasked)}</Td>
                <Td>{display(row.dropoffAddressMasked)}</Td>
                <Td>{displayDateTime(row.firstAssignedAt)}</Td>
                <Td mono>{display(row.finalDriverIdMasked)}</Td>
                <Td mono>
                  {display(row.finalPlateNoMasked)} <PrgMask />
                </Td>
                <Td>{displayDateTime(row.arrivedPickupAt)}</Td>
                <Td>{displayDateTime(row.tripCompletedAt)}</Td>
                <Td>{row.finalStatus}</Td>
                <Td>{row.redispatchCount}</Td>
                <Td>{display(row.cancellationReason)}</Td>
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
            />
          </div>
        </Card>
      ) : (
        <ErrorNotice status={result.status} error={result.error} />
      )}
    </PortalShell>
  );
}
