import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { getRocIncidentsPageData } from "@/lib/roc-page-data";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import { RocInvestigationLink } from "@/components/roc-investigation-link";
import {
  RocGuardrail,
  RocResponseEmptyState,
  RocStatusPill,
  rocAlertSeverityTone,
  rocIncidentStatusTone,
} from "@/components/roc-response-surfaces";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
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
      w: 92,
      mono: true,
    },
    { h: t("incidents.columns.title", locale), k: "title", w: 180 },
    {
      h: t("incidents.columns.source", locale),
      w: 120,
      r: (row) => t(`incidents.source.${row.source}`, locale),
    },
    {
      h: t("incidents.columns.status", locale),
      w: 110,
      r: (row) => (
        <RocStatusPill tone={rocIncidentStatusTone(row.status)}>
          {t(`incidents.status.${row.status}`, locale)}
        </RocStatusPill>
      ),
    },
    {
      h: t("alerts.columns.severity", locale),
      w: 96,
      r: (row) => (
        <RocStatusPill tone={rocAlertSeverityTone(row.severity)}>
          {t(`alerts.severity.${row.severity}`, locale)}
        </RocStatusPill>
      ),
    },
    { h: t("incidents.columns.summary", locale), k: "summary", w: 320 },
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
        title={t("incidents.title", locale)}
        subtitle={t("incidents.subtitle", locale)}
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <RocGuardrail
        title={t("incidents.guardrailTitle", locale)}
        body={t("incidents.guardrailBody", locale)}
      />
      {data.incidents.length === 0 ? (
        <RocResponseEmptyState
          locale={locale}
          title={t("incidents.title", locale)}
        />
      ) : (
        <Card theme={rocTheme} padding={0}>
          <Table theme={rocTheme} columns={columns} rows={data.incidents} />
        </Card>
      )}
    </div>
  );
}
