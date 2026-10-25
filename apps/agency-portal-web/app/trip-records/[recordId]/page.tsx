import type { AgencyTripRecordView } from "@drts/contracts";
import { Card, CardBody, PageHeader } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { PortalShell } from "@/components/portal-shell";
import { PrgMask } from "@/components/prg-mask";
import { display, displayDateTime, displayMinor } from "@/lib/format";
import { loadAgencyData, readAgencyProfile } from "@/lib/session.server";

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
              <dt>訂單編號</dt>
              <dd style={{ margin: 0 }}>
                {display(record.orderNoMasked)} <PrgMask />
              </dd>
              <dt>車號</dt>
              <dd style={{ margin: 0 }}>
                {display(record.plateNoMasked)} <PrgMask />
              </dd>
              <dt>預約時間</dt>
              <dd style={{ margin: 0 }}>
                {displayDateTime(record.reservedAt)}
              </dd>
              <dt>上車時間</dt>
              <dd style={{ margin: 0 }}>{displayDateTime(record.pickupAt)}</dd>
              <dt>下車時間</dt>
              <dd style={{ margin: 0 }}>{displayDateTime(record.dropoffAt)}</dd>
              <dt>行駛里程（公尺）</dt>
              <dd style={{ margin: 0 }}>
                {display(record.route.distanceMeters)}
              </dd>
              <dt>行駛時間（秒）</dt>
              <dd style={{ margin: 0 }}>
                {display(record.route.durationSeconds)}
              </dd>
              <dt>行駛路線</dt>
              <dd style={{ margin: 0 }}>
                <PrgMask label="不提供" />
              </dd>
              <dt>應付車資</dt>
              <dd style={{ margin: 0 }}>
                {displayMinor(record.payableFareMinor, record.currency)}
              </dd>
              <dt>實收車資</dt>
              <dd style={{ margin: 0 }}>
                {displayMinor(record.actualFareMinor, record.currency)}
              </dd>
              <dt>過路費</dt>
              <dd style={{ margin: 0 }}>
                {displayMinor(record.tollMinor, record.currency)}
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
