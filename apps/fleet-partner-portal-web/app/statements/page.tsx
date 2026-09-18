import { CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { getServerFleetPartnerClient } from "@/lib/api-client.server";
import { loadStatements } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { StatementsTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetStatementsPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const [{ rows, source }, { fleetPartnerId }] = await Promise.all([
    loadStatements(),
    getServerFleetPartnerClient(),
  ]);

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("statements.title", locale)}
        subtitle={t("statements.subtitle", locale)}
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
          <StatementsTable fleetPartnerId={fleetPartnerId} rows={rows} />
        </CanvasCard>
      </div>
    </>
  );
}
