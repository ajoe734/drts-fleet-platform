import type {
  AgencyMonthlyOperationsSummaryView,
  AgencyOperationsSummaryView,
} from "@drts/contracts";
import { Card, CardHeader, DataTable, PageHeader, Td, Tr } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { PortalShell } from "@/components/portal-shell";
import { display, displayPercent } from "@/lib/format";
import {
  firstParam,
  loadAgencyData,
  readAgencyProfile,
} from "@/lib/session.server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FIGURE_COLUMNS = [
  { label: "營業區" },
  { label: "服務" },
  { label: "叫車需求" },
  { label: "實際派遣" },
  { label: "完成趟次" },
  { label: "取消" },
  { label: "平均可派車輛" },
  { label: "快照涵蓋率" },
  { label: "投訴數" },
];

function FigureCells({
  row,
}: {
  row: AgencyOperationsSummaryView | AgencyMonthlyOperationsSummaryView;
}) {
  return (
    <>
      <Td>{display(row.businessArea)}</Td>
      <Td>{display(row.serviceProductCode)}</Td>
      <Td>{row.demandRequestCount}</Td>
      <Td>{row.actualDispatchCount}</Td>
      <Td>{row.completedTripCount}</Td>
      <Td>{row.cancelledOrderCount}</Td>
      <Td>{row.averageDispatchableVehicleCount}</Td>
      <Td>{displayPercent(row.snapshotCoverageRate)}</Td>
      <Td>{row.complaintCount}</Td>
    </>
  );
}

export default async function OperationsReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const from = firstParam(params.from);
  const to = firstParam(params.to);
  const [summary, monthly] = await Promise.all([
    loadAgencyData<{ items: AgencyOperationsSummaryView[] }>(
      "/reports/operations",
      ["reports", "operations-summary"],
      { from, to },
    ),
    loadAgencyData<{ items: AgencyMonthlyOperationsSummaryView[] }>(
      "/reports/operations",
      ["reports", "monthly-operations-summaries"],
      {
        periodMonthFrom: from?.slice(0, 7),
        periodMonthTo: to?.slice(0, 7),
      },
    ),
  ]);
  const profile = await readAgencyProfile();
  return (
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader
        title="R10 六個月營運統計"
        subtitle="區間上限 6 個曆月；彙總數字，不含個資。"
      />
      <form method="get" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <label>
          起日 <input type="date" name="from" defaultValue={from ?? ""} />
        </label>
        <label>
          迄日 <input type="date" name="to" defaultValue={to ?? ""} />
        </label>
        <button type="submit">查詢</button>
      </form>
      {summary.data ? (
        <Card>
          <CardHeader>區間彙總</CardHeader>
          <DataTable columns={FIGURE_COLUMNS} empty="查無資料">
            {summary.data.items.map((row) => (
              <Tr key={`${row.businessArea}:${row.serviceProductCode}`}>
                <FigureCells row={row} />
              </Tr>
            ))}
          </DataTable>
        </Card>
      ) : (
        <ErrorNotice status={summary.status} error={summary.error} />
      )}
      <div style={{ height: 16 }} />
      {monthly.data ? (
        <Card>
          <CardHeader>各月明細</CardHeader>
          <DataTable
            columns={[{ label: "月份" }, ...FIGURE_COLUMNS]}
            empty="查無資料"
          >
            {monthly.data.items.map((row) => (
              <Tr
                key={`${row.periodMonth}:${row.businessArea}:${row.serviceProductCode}`}
              >
                <Td>{row.periodMonth}</Td>
                <FigureCells row={row} />
              </Tr>
            ))}
          </DataTable>
        </Card>
      ) : (
        <ErrorNotice status={monthly.status} error={monthly.error} />
      )}
    </PortalShell>
  );
}
