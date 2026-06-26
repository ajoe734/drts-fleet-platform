import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { crossAppHref } from "@/lib/roc-cross-app-links";
import { getRocIncidentsPageData } from "@/lib/roc-page-data";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

export default async function IncidentsPage() {
  const locale = await getServerLocale();
  const data = await getRocIncidentsPageData();
  const columns: CanvasTableColumn<(typeof data.incidents)[number]>[] = [
    {
      h: t("incidents.columns.id", locale),
      k: "incidentId",
      w: 150,
      mono: true,
    },
    {
      h: t("incidents.columns.vehicle", locale),
      k: "vehicleId",
      w: 100,
      mono: true,
    },
    { h: t("incidents.columns.title", locale), k: "title", w: 180 },
    {
      h: t("incidents.columns.source", locale),
      w: 150,
      r: (row) => (
        <Pill
          theme={rocTheme}
          tone={row.source === "takeover_discrepancy" ? "danger" : "warn"}
          dot
        >
          {row.source}
        </Pill>
      ),
    },
    {
      h: t("incidents.columns.status", locale),
      w: 130,
      r: (row) => (
        <Pill
          theme={rocTheme}
          tone={
            row.status === "contained"
              ? "success"
              : row.status === "open"
                ? "warn"
                : "danger"
          }
          dot
        >
          {row.status}
        </Pill>
      ),
    },
    { h: t("incidents.columns.summary", locale), k: "summary", w: 360 },
    {
      h: t("common.openInvestigation", locale),
      w: 120,
      r: (row) =>
        row.investigationLink ? (
          <a
            href={crossAppHref(row.investigationLink)}
            target={
              row.investigationLink.openMode === "new_tab"
                ? "_blank"
                : undefined
            }
            rel="noreferrer"
            style={{
              color: rocTheme.accent,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {t("common.openInvestigation", locale)}
          </a>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("incidents.title", locale)}
        subtitle={t("incidents.subtitle", locale)}
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <Banner
        theme={rocTheme}
        tone="warn"
        icon="warn"
        title={t("incidents.guardrailTitle", locale)}
        body={t("incidents.guardrailBody", locale)}
      />
      <Card theme={rocTheme} title={t("incidents.title", locale)} padding={0}>
        <Table theme={rocTheme} columns={columns} rows={data.incidents} />
      </Card>
    </div>
  );
}
