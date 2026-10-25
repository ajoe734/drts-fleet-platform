import type {
  AgencyComplaintCounts,
  AgencyComplaintMonthlyStatisticsResponse,
} from "@drts/contracts";
import { Card, DataTable, PageHeader, Td, Tr } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { PortalShell } from "@/components/portal-shell";
import { NOT_PROVIDED, displayDateTime } from "@/lib/format";
import {
  firstParam,
  loadAgencyData,
  readAgencyProfile,
} from "@/lib/session.server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const METRIC_LABELS: Record<string, string> = {
  resolvedCount: "已解決數",
  slaBreachCount: "歷史 SLA 逾期總數",
};

function counts(value: AgencyComplaintCounts | null) {
  return value
    ? `${value.createdCount} / ${value.closedCount} / ${value.overdueCount}`
    : NOT_PROVIDED;
}

export default async function ComplaintStatisticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const periodMonthFrom = firstParam(params.periodMonthFrom);
  const periodMonthTo = firstParam(params.periodMonthTo);
  const result = await loadAgencyData<AgencyComplaintMonthlyStatisticsResponse>(
    "/reports/complaints",
    ["reports", "complaint-monthly-statistics"],
    { periodMonthFrom, periodMonthTo },
  );
  const profile = await readAgencyProfile();
  return (
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader
        title="R09 投訴月統計"
        subtitle="僅月彙總數字，不含任何案件明細或案號；區間上限 12 個月。"
      />
      <form method="get" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <label>
          起月{" "}
          <input
            name="periodMonthFrom"
            placeholder="YYYY-MM"
            defaultValue={periodMonthFrom ?? ""}
          />
        </label>
        <label>
          迄月{" "}
          <input
            name="periodMonthTo"
            placeholder="YYYY-MM"
            defaultValue={periodMonthTo ?? ""}
          />
        </label>
        <button type="submit">查詢</button>
      </form>
      {result.data ? (
        <>
          <p style={{ fontSize: 13 }}>
            統計基準時間：{displayDateTime(result.data.statisticsAsOf)}。「新增
            / 結案 / 逾期」：逾期指 SLA 期限已過且尚未結案。
          </p>
          {result.data.unavailableMetrics.length > 0 ? (
            <p style={{ fontSize: 13, color: "#92400e" }}>
              {result.data.unavailableMetrics
                .map((metric) => METRIC_LABELS[metric] ?? metric)
                .join("、")}
              ：{NOT_PROVIDED}（目前無權威彙總）
            </p>
          ) : null}
          <Card>
            <DataTable
              columns={[
                { label: "月份" },
                { label: "營業區" },
                { label: "服務" },
                { label: "投訴數" },
                { label: "依類別" },
                { label: "低評分自動（新增/結案/逾期）" },
                { label: "人工受理（新增/結案/逾期）" },
              ]}
              empty="查無資料"
            >
              {result.data.items.map((row) => (
                <Tr
                  key={`${row.periodMonth}:${row.businessArea}:${row.serviceProductCode}`}
                >
                  <Td>{row.periodMonth}</Td>
                  <Td>{row.businessArea}</Td>
                  <Td>{row.serviceProductCode}</Td>
                  <Td>{row.complaintCount}</Td>
                  <Td>
                    {Object.entries(row.complaintsByCategory)
                      .map(([category, count]) => `${category}: ${count}`)
                      .join("、") || "—"}
                  </Td>
                  <Td>{counts(row.lowRatingAuto)}</Td>
                  <Td>{counts(row.manual)}</Td>
                </Tr>
              ))}
            </DataTable>
          </Card>
        </>
      ) : (
        <ErrorNotice status={result.status} error={result.error} />
      )}
    </PortalShell>
  );
}
