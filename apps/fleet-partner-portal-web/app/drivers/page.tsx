import { CanvasBtn, CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadDrivers } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { DriversTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetDriversPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source } = await loadDrivers();

  // Header tab counts are derived from the loaded rows (live partner-scoped
  // data, or fixtures via the same seam on fallback) instead of fixed design
  // numbers.
  const tabCounts = {
    all: rows.length,
    available: rows.filter((r) => r.status === "available").length,
    missingDocs: rows.filter((r) => r.docs !== "complete").length,
    trainingIncomplete: rows.filter((r) => r.training !== "complete").length,
  };
  const tabs = [
    `${t("drivers.tabAll", locale)} ${tabCounts.all}`,
    `${t("drivers.tabAvailable", locale)} ${tabCounts.available}`,
    `${t("drivers.tabMissingDocs", locale)} ${tabCounts.missingDocs}`,
    `${t("drivers.tabTrainingIncomplete", locale)} ${tabCounts.trainingIncomplete}`,
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("drivers.title", locale)}
        subtitle={t("drivers.subtitle", locale)}
        tabs={tabs}
        activeTab={tabs[0]}
        actions={
          <CanvasBtn theme={theme} variant="primary" icon="users">
            {t("dashboard.recruit", locale)}
          </CanvasBtn>
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
          <DriversTable rows={rows} />
        </CanvasCard>
      </div>
    </>
  );
}
