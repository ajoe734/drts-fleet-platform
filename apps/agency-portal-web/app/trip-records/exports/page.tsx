import { Card, CardBody, PageHeader } from "@drts/ui-web";

import { PortalShell } from "@/components/portal-shell";
import { TripExportPanel } from "@/components/trip-export-panel";
import { getServerLocale } from "@/lib/server-locale";
import {
  firstParam,
  readAgencyProfile,
  requireAgencyToken,
} from "@/lib/session.server";
import { t } from "@/lib/translations";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TripExportsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAgencyToken("/trip-records/exports");
  const locale = await getServerLocale();
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
    <PortalShell
      agencyName={profile?.agencyDisplayName ?? null}
      locale={locale}
    >
      <PageHeader
        title={t("tripExports.title", undefined, locale)}
        subtitle={t("tripExports.subtitle", undefined, locale)}
      />
      <Card>
        <CardBody>
          <TripExportPanel initialScope={initialScope} locale={locale} />
        </CardBody>
      </Card>
    </PortalShell>
  );
}
