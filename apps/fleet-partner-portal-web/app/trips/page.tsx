import { CanvasBtn, CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadTrips } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { TripsTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetTripsPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source } = await loadTrips();

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("trips.title", locale)}
        subtitle={t("trips.subtitle", locale)}
        tabs={[
          t("trips.tabAll", locale),
          t("service.realtime", locale),
          t("service.business", locale),
          t("service.airport", locale),
          t("service.insurance", locale),
          t("service.travel", locale),
        ]}
        activeTab={t("trips.tabAll", locale)}
        actions={
          <CanvasBtn theme={theme}>{t("common.export", locale)}</CanvasBtn>
        }
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <DataSourceNotice
          theme={theme}
          source={source}
          body={t("data.fixtureNotice", locale)}
        />
        <CanvasCard theme={theme} padding={0}>
          <TripsTable rows={rows} />
        </CanvasCard>
      </div>
    </>
  );
}
