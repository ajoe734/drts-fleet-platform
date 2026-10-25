import type { AgencyPage, AgencyTripRecordView } from "@drts/contracts";
import { Card, DataTable, PageHeader, Td, Tr } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { Pager } from "@/components/pager";
import { PortalShell } from "@/components/portal-shell";
import { PrgMask } from "@/components/prg-mask";
import { display, displayDateTime, displayMinor } from "@/lib/format";
import {
  firstParam,
  loadAgencyData,
  readAgencyProfile,
} from "@/lib/session.server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LEGAL_HOLD_LABELS: Record<string, string> = {
  active: "保全中",
  none: "無",
  unavailable: "未提供",
};

const ROUTE_SOURCE_LABELS: Record<string, string> = {
  driver_gps: "司機 GPS 軌跡",
  mixed: "混合軌跡（部分 GPS 取樣＋完單起訖摘要）",
  pickup_dropoff_summary: "完單起訖與里程摘要",
  provider_route: "派車預估路線",
  unavailable: "未提供",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  captured: "已請款實收",
  refunded: "已退款（實收 0）",
  authorized: "已授權待請款",
  not_selected: "未選擇付款",
  failed: "扣款失敗",
  manual_recovery: "待人工追償",
  unknown: "未提供收款狀態",
};

export default async function TripRecordsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
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
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader
        title="R11 行程紀錄"
        subtitle="法定最低保存期間：各趟次至少二年。僅顯示仍在保存期間內的紀錄，完整揭露九大法定欄位與路線／車資來源。"
      />
      <form
        method="get"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
      >
        <label>
          月份{" "}
          <input
            name="month"
            placeholder="YYYY-MM"
            defaultValue={query.month ?? ""}
          />
        </label>
        <label>
          預約日起{" "}
          <input
            name="reservedFrom"
            type="date"
            defaultValue={query.reservedFrom ?? ""}
          />
        </label>
        <label>
          預約日迄{" "}
          <input
            name="reservedTo"
            type="date"
            defaultValue={query.reservedTo ?? ""}
          />
        </label>
        <label>
          車號（精確）{" "}
          <input
            name="plateNo"
            placeholder="例如 BKR-2208"
            defaultValue={query.plateNo ?? ""}
          />
        </label>
        <label>
          訂單編號（精確）{" "}
          <input
            name="orderNo"
            placeholder="完整訂單編號"
            defaultValue={query.orderNo ?? ""}
          />
        </label>
        <label>
          訂單 ID（精確）{" "}
          <input
            name="orderId"
            placeholder="完整 orderId"
            defaultValue={query.orderId ?? ""}
          />
        </label>
        <label>
          趟次 ID（精確）{" "}
          <input
            name="tripId"
            placeholder="完整 tripId"
            defaultValue={query.tripId ?? ""}
          />
        </label>
        <label>
          紀錄 ID（精確）{" "}
          <input
            name="recordId"
            placeholder="mtr-..."
            defaultValue={query.recordId ?? ""}
          />
        </label>
        <label>
          法律保全
          <select name="legalHold" defaultValue={query.legalHold ?? "all"}>
            <option value="all">全部</option>
            <option value="active">保全中</option>
            <option value="none">無</option>
          </select>
        </label>
        <button type="submit">查詢</button>
        <a href={exportHref} style={{ alignSelf: "center" }}>
          匯出目前篩選範圍 CSV
        </a>
      </form>
      {result.data ? (
        <Card>
          <div style={{ padding: "12px 16px 0", fontWeight: 500 }}>
            查詢結果：共 {result.data.total} 筆符合條件之行程紀錄
          </div>
          <DataTable
            columns={[
              { label: "訂單／趟次" },
              { label: "車號" },
              { label: "預約時間" },
              { label: "上車時間" },
              { label: "下車時間" },
              { label: "行駛路線（來源）" },
              { label: "行駛里程（公尺）" },
              { label: "應付車資" },
              { label: "實收車資（狀態）" },
              { label: "通行費" },
              { label: "保存至" },
              { label: "法律保全" },
            ]}
            empty="查無資料"
          >
            {result.data.items.map((record: AgencyTripRecordView) => (
              <Tr key={record.recordId}>
                <Td mono>
                  <a
                    href={`/trip-records/${encodeURIComponent(record.recordId)}`}
                  >
                    {display(record.orderNoMasked)}
                  </a>{" "}
                  <PrgMask />
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {record.tripId}
                  </div>
                </Td>
                <Td mono>{display(record.plateNo ?? record.plateNoMasked)}</Td>
                <Td>{displayDateTime(record.reservedAt)}</Td>
                <Td>{displayDateTime(record.pickupAt)}</Td>
                <Td>{displayDateTime(record.dropoffAt)}</Td>
                <Td>
                  <div>{display(record.route.routeSummary)}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {ROUTE_SOURCE_LABELS[record.route.source] ??
                      record.route.source}
                  </div>
                </Td>
                <Td>{display(record.route.distanceMeters)}</Td>
                <Td>
                  {displayMinor(record.payableFareMinor, record.currency)}
                </Td>
                <Td>
                  <div>
                    {displayMinor(record.collectedFareMinor, record.currency)}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {PAYMENT_STATUS_LABELS[record.paymentStatus] ??
                      record.paymentStatus}
                  </div>
                </Td>
                <Td>{displayMinor(record.tollMinor, record.currency)}</Td>
                <Td>{displayDateTime(record.retainUntil)}</Td>
                <Td>
                  {LEGAL_HOLD_LABELS[record.legalHold.state] ?? display(null)}
                </Td>
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
            />
          </div>
        </Card>
      ) : (
        <ErrorNotice status={result.status} error={result.error} />
      )}
    </PortalShell>
  );
}
