import Link from "next/link";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { getRocIncidentsPageData } from "@/lib/roc-page-data";
import { RocInvestigationLink } from "@/components/roc-investigation-link";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import {
  RocGuardrail,
  RocResponseEmptyState,
  RocStatusPill,
  rocIncidentStatusTone,
} from "@/components/roc-response-surfaces";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
} from "@drts/ui-web";

export default async function IncidentsPage() {
  const locale = await getServerLocale();
  const data = await getRocIncidentsPageData();
  const openCount = data.incidents.filter(
    (item) => item.status !== "contained",
  ).length;

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("incidents.title", locale)}
        subtitle={t("incidents.subtitle", locale)}
        actions={
          <Pill theme={rocTheme} tone={openCount > 0 ? "warn" : "neutral"}>
            {openCount} · {t("incidents.status.open", locale)}
          </Pill>
        }
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
        body={t("incidents.policyBody", locale)}
      />
      <RocGuardrail
        title={t("incidents.guardrailTitle", locale)}
        body={t("incidents.guardrailBody", locale)}
      />
      {data.incidents.length === 0 ? (
        <RocResponseEmptyState
          locale={locale}
          title={t("response.emptyBody", locale)}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.incidents.map((incident) => (
            <Card
              theme={rocTheme}
              key={incident.incidentId}
              title={
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  {incident.incidentId} · {incident.title}
                  <Pill
                    theme={rocTheme}
                    tone={incident.severity === "critical" ? "danger" : "warn"}
                  >
                    {incident.severity === "critical" ? "L2" : "L1"}
                  </Pill>
                </span>
              }
              subtitle={`${incident.vehicleId} · ${
                incident.linkedAlertId ?? t("common.unlinked", locale)
              }`}
              actions={
                <RocStatusPill tone={rocIncidentStatusTone(incident.status)}>
                  {t(`incidents.status.${incident.status}`, locale)}
                </RocStatusPill>
              }
            >
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: rocTheme.textMuted,
                  marginBottom: 12,
                }}
              >
                {incident.summary}
              </div>
              <DL
                theme={rocTheme}
                cols={3}
                items={[
                  {
                    k: t("incidents.columns.vehicle", locale),
                    v: incident.vehicleId,
                    mono: true,
                  },
                  {
                    k: t("incidents.columns.source", locale),
                    v: t(`incidents.source.${incident.source}`, locale),
                  },
                  {
                    k: t("alerts.columns.alert", locale),
                    v: incident.linkedAlertId ?? t("common.unlinked", locale),
                    mono: true,
                  },
                  {
                    k: t("incidents.initialDeadlineLabel", locale),
                    v: t("incidents.initialDeadline", locale),
                  },
                  {
                    k: t("incidents.finalDeadlineLabel", locale),
                    v: t("incidents.finalDeadline", locale),
                  },
                  {
                    k: t("reports.columns.evidence", locale),
                    v:
                      incident.source === "takeover_discrepancy" ? "1" : "—",
                    mono: true,
                  },
                ]}
              />
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 12,
                }}
              >
                <RocInvestigationLink
                  link={incident.investigationLink}
                  locale={locale}
                />
                <Link href="/evidence" style={{ textDecoration: "none" }}>
                  <Btn theme={rocTheme} size="sm" icon="audit">
                    {t("incidents.evidenceLink", locale)}
                  </Btn>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
