import { CanvasBanner, CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadDocuments } from "@/lib/fleet-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { DocumentsTable } from "@/components/portal-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetDocumentsPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const { rows, source } = await loadDocuments();

  // Tab counts come from the loaded rows (live, or fixtures through the same
  // seam on fallback) rather than fixed design numbers.
  const docTabs = [
    `${t("documents.tabTodo", locale)} ${rows.length}`,
    t("documents.tabAll", locale),
    `${t("documents.tabFleet", locale)} ${rows.filter((r) => r.owner === "fleet").length}`,
    `${t("documents.tabDriver", locale)} ${rows.filter((r) => r.owner === "driver").length}`,
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("documents.title", locale)}
        subtitle={t("documents.subtitle", locale)}
        tabs={docTabs}
        activeTab={docTabs[0]}
      />
      <div style={{ padding: 24 }}>
        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="warn"
          title={t("documents.warnTitle", locale)}
          body={t("documents.warnBody", locale)}
        />
        <div style={{ height: 12 }} />
        <DataSourceNotice
          theme={theme}
          source={source}
          body={t("data.fixtureNotice", locale)}
        />
        <div style={{ height: 12 }} />
        <CanvasCard theme={theme} padding={0}>
          <DocumentsTable rows={rows} />
        </CanvasCard>
      </div>
    </>
  );
}
