import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { getRocReportsPageData } from "@/lib/roc-page-data";
import { RocInvestigationLink } from "@/components/roc-investigation-link";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import {
  RocGuardrail,
  RocResponseEmptyState,
  RocStatusPill,
  rocReportStatusTone,
} from "@/components/roc-response-surfaces";
import {
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

function reportKindLabel(reportKind: string, locale: Locale) {
  const translated = t(`reports.kind.${reportKind}`, locale);
  if (translated !== `reports.kind.${reportKind}`) {
    return translated;
  }

  return reportKind
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function ReportsPage() {
  const locale = await getServerLocale();
  const data = await getRocReportsPageData(locale);

  const columns: CanvasTableColumn<(typeof data.reports)[number]>[] = [
    {
      h: t("reports.columns.id", locale),
      k: "reportId",
      w: 180,
      mono: true,
      r: (row) => (
        <span style={{ color: rocTheme.accent, fontWeight: 700 }}>
          {row.reportId}
        </span>
      ),
    },
    {
      h: t("reports.columns.kind", locale),
      w: 170,
      r: (row) => reportKindLabel(row.reportKind, locale),
    },
    { h: t("reports.columns.subject", locale), k: "subject", w: 220 },
    {
      h: t("reports.columns.window", locale),
      k: "windowLabel",
      w: 100,
      mono: true,
    },
    {
      h: t("reports.columns.evidence", locale),
      k: "evidenceCount",
      w: 90,
      mono: true,
      align: "right",
    },
    {
      h: t("reports.columns.status", locale),
      w: 130,
      r: (row) => (
        <RocStatusPill tone={rocReportStatusTone(row.status)}>
          {t(`reports.status.${row.status}`, locale)}
        </RocStatusPill>
      ),
    },
    {
      h: "",
      w: 120,
      r: (row) => (
        <RocInvestigationLink
          link={row.investigationLink}
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
        actions={
          <Btn theme={rocTheme} variant="primary" icon="export" disabled>
            {t("reports.generate", locale)}
          </Btn>
        }
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
          title={t("response.emptyBody", locale)}
        />
      ) : (
        <Card theme={rocTheme} padding={0}>
          <div style={{ overflowX: "auto" }}>
            <Table theme={rocTheme} columns={columns} rows={data.reports} />
          </div>
        </Card>
      )}
    </div>
  );
}
