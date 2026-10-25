import type { AgencyTripRecordView } from "@drts/contracts";
import { Card, CardBody, PageHeader } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { PortalShell } from "@/components/portal-shell";
import { PrgMask } from "@/components/prg-mask";
import { display, displayDateTime, displayMinor } from "@/lib/format";
import { loadAgencyData, readAgencyProfile } from "@/lib/session.server";

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

const TOLL_SOURCE_LABELS: Record<string, string> = {
  driver_proof: "司機完單證明（通行費憑證）",
  electronic_receipt: "電子乘車證明",
  none: "無通行費（0 元）",
  unavailable: "歷史未記錄",
};

export default async function TripRecordDetailPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  const result = await loadAgencyData<AgencyTripRecordView>(
    `/trip-records/${encodeURIComponent(recordId)}`,
    ["trip-records", recordId],
  );
  const profile = await readAgencyProfile();
  const record = result.data;
  return (
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader title="R11 行程紀錄詳情" />
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
              <dt>紀錄編號</dt>
              <dd style={{ margin: 0 }}>{record.recordId}</dd>
              <dt>訂單 ID／趟次 ID</dt>
              <dd style={{ margin: 0 }}>
                {display(record.orderId)} / {display(record.tripId)}
              </dd>
              <dt>訂單編號</dt>
              <dd style={{ margin: 0 }}>
                {display(record.orderNoMasked)} <PrgMask />
              </dd>
              <dt>車號</dt>
              <dd style={{ margin: 0 }}>
                {display(record.plateNo ?? record.plateNoMasked)}
              </dd>
              <dt>預約時間</dt>
              <dd style={{ margin: 0 }}>
                {displayDateTime(record.reservedAt)}
              </dd>
              <dt>上車時間</dt>
              <dd style={{ margin: 0 }}>{displayDateTime(record.pickupAt)}</dd>
              <dt>下車時間</dt>
              <dd style={{ margin: 0 }}>{displayDateTime(record.dropoffAt)}</dd>
              <dt>行駛路線</dt>
              <dd style={{ margin: 0 }}>
                {display(record.route.routeSummary)}
              </dd>
              <dt>路線來源（Provenance）</dt>
              <dd style={{ margin: 0 }}>
                {ROUTE_SOURCE_LABELS[record.route.source] ??
                  display(record.route.source)}
              </dd>
              <dt>行駛里程（公尺）</dt>
              <dd style={{ margin: 0 }}>
                {display(record.route.distanceMeters)}
              </dd>
              <dt>行駛時間（秒）</dt>
              <dd style={{ margin: 0 }}>
                {display(record.route.durationSeconds)}
              </dd>
              <dt>應付車資</dt>
              <dd style={{ margin: 0 }}>
                {displayMinor(record.payableFareMinor, record.currency)}
              </dd>
              <dt>完單計費車資</dt>
              <dd style={{ margin: 0 }}>
                {displayMinor(record.actualFareMinor, record.currency)}
              </dd>
              <dt>實收車資</dt>
              <dd style={{ margin: 0 }}>
                {displayMinor(record.collectedFareMinor, record.currency)}（
                {PAYMENT_STATUS_LABELS[record.paymentStatus] ??
                  record.paymentStatus}
                ）
              </dd>
              <dt>通行費</dt>
              <dd style={{ margin: 0 }}>
                {displayMinor(record.tollMinor, record.currency)}（
                {TOLL_SOURCE_LABELS[record.tollSource] ?? record.tollSource}）
              </dd>
              <dt>費率版本／計費方式</dt>
              <dd style={{ margin: 0 }}>
                {display(record.farePolicyVersion)} /{" "}
                {display(record.chargingMode)}
              </dd>
              <dt>紀錄產生／保存至</dt>
              <dd style={{ margin: 0 }}>
                {displayDateTime(record.generatedAt)} /{" "}
                {displayDateTime(record.retainUntil)}
              </dd>
              <dt>法律保全</dt>
              <dd style={{ margin: 0 }}>{display(record.legalHold.state)}</dd>
            </dl>
          </CardBody>
        </Card>
      ) : (
        <ErrorNotice status={result.status} error={result.error} />
      )}
    </PortalShell>
  );
}
