import { CanvasBtn, CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadVehicles } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { VehiclesTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetVehiclesPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source } = await loadVehicles();

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("vehicles.title", locale)}
        subtitle={t("vehicles.subtitle", locale)}
        actions={
          <>
            <CanvasBtn theme={theme} icon="filter">
              {t("common.filter", locale)}
            </CanvasBtn>
            <CanvasBtn theme={theme} variant="primary" icon="plus">
              {t("vehicles.add", locale)}
            </CanvasBtn>
          </>
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
          <VehiclesTable rows={rows} />
        </CanvasCard>
      </div>
    </>
  );
}
