import { Card, CardBody, PageHeader } from "@drts/ui-web";

import { PortalShell } from "@/components/portal-shell";
import { TripExportPanel } from "@/components/trip-export-panel";
import {
  firstParam,
  readAgencyProfile,
  requireAgencyToken,
} from "@/lib/session.server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TripExportsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAgencyToken("/trip-records/exports");
  const params = searchParams ? await searchParams : {};
  const initialScope = {
    month: firstParam(params.month),
    reservedFrom: firstParam(params.reservedFrom),
    reservedTo: firstParam(params.reservedTo),
    plateNo: firstParam(params.plateNo),
    orderNo: firstParam(params.orderNo),
    orderId: firstParam(params.orderId),
    tripId: firstParam(params.tripId),
    recordId: firstParam(params.recordId),
  };
  const profile = await readAgencyProfile();
  return (
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader
        title="R11 受控匯出"
        subtitle="匯出檔包含九大法定欄位（車號、預約／上車／下車時間、行駛路線、行駛里程、應付車資、實收車資、通行費）與來源狀態；僅能讀取與下載本機關本人建立的匯出。"
      />
      <Card>
        <CardBody>
          <TripExportPanel initialScope={initialScope} />
        </CardBody>
      </Card>
    </PortalShell>
  );
}
