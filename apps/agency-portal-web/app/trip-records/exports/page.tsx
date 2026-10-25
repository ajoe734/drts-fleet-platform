import { Card, CardBody, PageHeader } from "@drts/ui-web";

import { PortalShell } from "@/components/portal-shell";
import { TripExportPanel } from "@/components/trip-export-panel";
import { readAgencyProfile, requireAgencyToken } from "@/lib/session.server";

export default async function TripExportsPage() {
  await requireAgencyToken("/trip-records/exports");
  const profile = await readAgencyProfile();
  return (
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader
        title="R11 受控匯出"
        subtitle="匯出檔沿用平台遮罩欄位（訂單編號、車號遮罩，不含行駛路線）；僅能讀取本人建立的匯出。"
      />
      <Card>
        <CardBody>
          <TripExportPanel />
        </CardBody>
      </Card>
    </PortalShell>
  );
}
