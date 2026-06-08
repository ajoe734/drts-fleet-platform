import { CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadCases } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { CasesTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetCasesPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source } = await loadCases();

  // Tab counts come from the loaded rows (live, or fixtures through the same
  // seam on fallback) rather than fixed design numbers.
  const caseTabs = [
    `${t("cases.tabAll", locale)} ${rows.length}`,
    `${t("cases.tabFleet", locale)} ${rows.filter((r) => r.responsibility === "fleet").length}`,
    `${t("cases.tabShared", locale)} ${rows.filter((r) => r.responsibility === "shared").length}`,
    t("cases.tabClosed", locale),
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("cases.title", locale)}
        subtitle={t("cases.subtitle", locale)}
        tabs={caseTabs}
        activeTab={caseTabs[0]}
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
          <CasesTable rows={rows} />
        </CanvasCard>
      </div>
    </>
  );
}
