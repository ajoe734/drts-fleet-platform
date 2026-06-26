import { RocInvestigationLink } from "@/components/roc-investigation-link";
import {
  RocGuardrail,
  RocResponseEmptyState,
  RocStatusPill,
  rocReportStatusTone,
} from "@/components/roc-response-surfaces";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import { getRocReportsPageData } from "@/lib/roc-page-data";
import { getServerLocale } from "@/lib/server-locale";
import { rocTheme } from "@/lib/roc-theme";
import { t } from "@/lib/translations";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
} from "@drts/ui-web";

export default async function ReportsPage() {
  const locale = await getServerLocale();
  const data = await getRocReportsPageData();

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
        data.reports.map((report) => (
          <Card
            key={report.reportId}
            theme={rocTheme}
            title={`${report.reportId} · ${report.subject}`}
            subtitle={report.reportKind}
            actions={
              <RocStatusPill tone={rocReportStatusTone(report.status)}>
                {t(`reports.status.${report.status}`, locale)}
              </RocStatusPill>
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr)) auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 10.5, color: rocTheme.textMuted }}>
                  {t("reports.columns.window", locale)}
                </div>
                <div style={{ fontSize: 12.5 }}>{report.windowLabel}</div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: rocTheme.textMuted }}>
                  {t("reports.columns.kind", locale)}
                </div>
                <div style={{ fontSize: 12.5, overflowWrap: "anywhere" }}>
                  {report.reportKind}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: rocTheme.textMuted }}>
                  {t("reports.columns.evidence", locale)}
                </div>
                <div style={{ fontSize: 12.5 }}>{report.evidenceCount}</div>
              </div>
              <RocInvestigationLink
                link={report.investigationLink}
                locale={locale}
              />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
