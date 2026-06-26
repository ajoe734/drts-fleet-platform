import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { getRocReportsPageData } from "@/lib/roc-page-data";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import { RocInvestigationLink } from "@/components/roc-investigation-link";
import {
  RocGuardrail,
  RocResponseEmptyState,
  RocStatusPill,
  rocReportStatusTone,
} from "@/components/roc-response-surfaces";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

export default async function ReportsPage() {
  const locale = await getServerLocale();
  const data = await getRocReportsPageData();

  const columns: CanvasTableColumn<(typeof data.reports)[number]>[] = [
    { h: t("reports.columns.id", locale), k: "reportId", w: 140, mono: true },
    { h: t("reports.columns.kind", locale), k: "reportKind", w: 190 },
    { h: t("reports.columns.subject", locale), k: "subject", w: 240 },
    {
      h: t("reports.columns.window", locale),
      k: "windowLabel",
      w: 90,
      mono: true,
    },
    {
      h: t("reports.columns.status", locale),
      w: 120,
      r: (row) => (
        <RocStatusPill tone={rocReportStatusTone(row.status)}>
          {t(`reports.status.${row.status}`, locale)}
        </RocStatusPill>
      ),
    },
    {
      h: t("reports.columns.evidence", locale),
      w: 88,
      r: (row) => String(row.evidenceCount),
    },
    {
      h: t("common.openInvestigation", locale),
      w: 132,
      r: (row) => (
        <RocInvestigationLink
          link={row.investigationLink ?? null}
          locale={locale}
        />
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
      <RocGuardrail
        title={t("reports.guardrailTitle", locale)}
        body={t("reports.guardrailBody", locale)}
      />
      {data.reports.length === 0 ? (
        <RocResponseEmptyState
          locale={locale}
          title={t("reports.title", locale)}
        />
      ) : (
        <Card theme={rocTheme} padding={0}>
          <Table theme={rocTheme} columns={columns} rows={data.reports} />
        </Card>
      )}
    </div>
  );
}
