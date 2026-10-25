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
  { label: "準時" },
  { label: "未準時" },
  { label: "未到" },
  { label: "無法判定" },
  { label: "平均可派車輛" },
  { label: "有效／預期快照" },
  { label: "快照涵蓋率" },
  { label: "投訴數" },
  { label: "生成時間" },
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
      <Td>{display(row.onTimeTripCount)}</Td>
      <Td>{display(row.lateTripCount)}</Td>
      <Td>{display(row.noShowTripCount)}</Td>
      <Td>{display(row.punctualityUnknownTripCount)}</Td>
      <Td>{display(row.averageDispatchableVehicleCount)}</Td>
      <Td>{`${row.validSnapshotCount} / ${row.expectedSnapshotCount}`}</Td>
      <Td>{displayPercent(row.snapshotCoverageRate)}</Td>
      <Td>{row.complaintCount}</Td>
      <Td>{display(row.generatedAt)}</Td>
    </>
  );
}

export default async function OperationsReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const periodMonthFrom =
    firstParam(params.periodMonthFrom) ?? firstParam(params.from);
  const periodMonthTo =
    firstParam(params.periodMonthTo) ?? firstParam(params.to);
  const businessArea = firstParam(params.businessArea);
  const summary = await loadAgencyData<{ items: AgencyOperationsSummaryView[] }>(
    "/reports/operations",
    ["reports", "operations-summary"],
    {
      periodMonthFrom,
      periodMonthTo,
      businessArea,
    },
  );
  const sameBatchMonthly: AgencyMonthlyOperationsSummaryView[] | null =
    summary.data
      ? summary.data.items
          .flatMap(
            (row: AgencyOperationsSummaryView) => row.monthlySummaries ?? [],
          )
          .sort(
            (
              left: AgencyMonthlyOperationsSummaryView,
              right: AgencyMonthlyOperationsSummaryView,
            ) =>
              right.periodMonth.localeCompare(left.periodMonth) ||
              (left.businessArea ?? "").localeCompare(
                right.businessArea ?? "",
              ) ||
              (left.serviceProductCode ?? "").localeCompare(
                right.serviceProductCode ?? "",
              ),
          )
      : null;
  const profile = await readAgencyProfile();
  return (
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader
        title="R10 六個月營運統計"
        subtitle="以臺北曆月（Asia/Taipei）為統計單位，區間上限 6 個曆月；彙總與逐月明細共用同一生成批次，不含個資。"
      />
      <form method="get" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <label>
          起始月份{" "}
          <input
            type="month"
            name="periodMonthFrom"
            defaultValue={periodMonthFrom ?? ""}
          />
        </label>
        <label>
          結束月份{" "}
          <input
            type="month"
            name="periodMonthTo"
            defaultValue={periodMonthTo ?? ""}
          />
        </label>
        <button type="submit">查詢</button>
      </form>
      {summary.data ? (
        <Card>
          <CardHeader>區間彙總</CardHeader>
          <DataTable
            columns={[{ label: "月份區間" }, ...FIGURE_COLUMNS]}
            empty="查無資料"
          >
            {summary.data.items.map((row: AgencyOperationsSummaryView) => (
              <Tr key={`${row.businessArea}:${row.serviceProductCode}`}>
                <Td>{`${row.from.slice(0, 7)} ~ ${row.to.slice(0, 7)}`}</Td>
                <FigureCells row={row} />
              </Tr>
            ))}
          </DataTable>
        </Card>
      ) : (
        <ErrorNotice status={summary.status} error={summary.error} />
      )}
      <div style={{ height: 16 }} />
      {sameBatchMonthly ? (
        <Card>
          <CardHeader>各月明細（同批生成）</CardHeader>
          <DataTable
            columns={[{ label: "月份" }, ...FIGURE_COLUMNS]}
            empty="查無資料"
          >
            {sameBatchMonthly.map((row: AgencyMonthlyOperationsSummaryView) => (
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
        <ErrorNotice status={summary.status} error={summary.error} />
      )}
    </PortalShell>
  );
}
