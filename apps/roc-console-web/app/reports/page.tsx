import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { crossAppHref } from "@/lib/roc-cross-app-links";
import { getRocReportsPageData } from "@/lib/roc-page-data";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

export default async function ReportsPage() {
  const locale = await getServerLocale();
  const data = await getRocReportsPageData();
  const columns: CanvasTableColumn<(typeof data.reports)[number]>[] = [
    { h: t("reports.columns.id", locale), k: "reportId", w: 150, mono: true },
    {
      h: t("reports.columns.kind", locale),
      k: "reportKind",
      w: 220,
      mono: true,
    },
    { h: t("reports.columns.subject", locale), k: "subject", w: 220 },
    {
      h: t("reports.columns.window", locale),
      k: "windowLabel",
      w: 80,
      mono: true,
    },
    {
      h: t("reports.columns.status", locale),
      w: 130,
      r: (row) => (
        <Pill
          theme={rocTheme}
          tone={row.status === "ready" ? "success" : "warn"}
          dot
        >
          {t(`reports.status.${row.status}`, locale)}
        </Pill>
      ),
    },
    {
      h: t("reports.columns.evidence", locale),
      k: "evidenceCount",
      w: 90,
      mono: true,
    },
    {
      h: t("common.openInvestigation", locale),
      w: 130,
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
        title={t("reports.title", locale)}
        subtitle={t("reports.subtitle", locale)}
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <Card theme={rocTheme} title={t("reports.title", locale)} padding={0}>
        <Table theme={rocTheme} columns={columns} rows={data.reports} />
      </Card>
    </div>
  );
}
