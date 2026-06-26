import { RocInvestigationLink } from "@/components/roc-investigation-link";
import {
  RocGuardrail,
  RocResponseEmptyState,
  RocStatusPill,
  rocIncidentStatusTone,
} from "@/components/roc-response-surfaces";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import { getRocIncidentsPageData } from "@/lib/roc-page-data";
import { getServerLocale } from "@/lib/server-locale";
import { rocTheme } from "@/lib/roc-theme";
import { t } from "@/lib/translations";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
} from "@drts/ui-web";

export default async function IncidentsPage() {
  const locale = await getServerLocale();
  const data = await getRocIncidentsPageData();

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
        data.incidents.map((incident) => (
          <Card
            key={incident.incidentId}
            theme={rocTheme}
            title={`${incident.incidentId} · ${incident.title}`}
            subtitle={incident.summary}
            actions={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <RocStatusPill tone={rocIncidentStatusTone(incident.status)}>
                  {t(`incidents.status.${incident.status}`, locale)}
                </RocStatusPill>
                <Pill
                  theme={rocTheme}
                  tone={incident.severity === "critical" ? "danger" : "warn"}
                  dot
                >
                  {incident.severity}
                </Pill>
              </div>
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 10.5, color: rocTheme.textMuted }}>
                  {t("incidents.columns.vehicle", locale)}
                </div>
                <div style={{ fontSize: 12.5 }}>{incident.vehicleId}</div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: rocTheme.textMuted }}>
                  {t("incidents.columns.source", locale)}
                </div>
                <div style={{ fontSize: 12.5 }}>
                  {t(`incidents.source.${incident.source}`, locale)}
                </div>
              </div>
              <RocInvestigationLink
                link={incident.investigationLink}
                locale={locale}
              />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
