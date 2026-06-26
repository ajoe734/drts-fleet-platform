import { RocInvestigationLink } from "@/components/roc-investigation-link";
import {
  RocField,
  RocGuardrail,
  RocResponseEmptyState,
  RocStatusPill,
  formatUtcTime,
} from "@/components/roc-response-surfaces";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import { getRocTakeoverPageData } from "@/lib/roc-page-data";
import { getServerLocale } from "@/lib/server-locale";
import { rocTheme } from "@/lib/roc-theme";
import { t } from "@/lib/translations";
import {
  CanvasCard as Card,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
} from "@drts/ui-web";

export default async function TakeoverPage() {
  const locale = await getServerLocale();
  const data = await getRocTakeoverPageData();
  const discrepancyCount = data.takeovers.filter(
    (item) => item.discrepancyCaseIds.length > 0,
  ).length;
  const priorityOneCount = data.takeovers.filter(
    (item) => item.correlationPriority === 1,
  ).length;

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("takeover.title", locale)}
        subtitle={t("takeover.subtitle", locale)}
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <RocGuardrail
        title={t("takeover.title", locale)}
        body={t("takeover.subtitle", locale)}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <KPI
          theme={rocTheme}
          label={t("takeover.kpi.active", locale)}
          value={String(data.takeovers.length)}
        />
        <KPI
          theme={rocTheme}
          label={t("takeover.kpi.discrepancies", locale)}
          value={String(discrepancyCount)}
        />
        <KPI
          theme={rocTheme}
          label={t("takeover.kpi.priority", locale)}
          value={String(priorityOneCount)}
        />
      </div>
      {data.takeovers.length === 0 ? (
        <RocResponseEmptyState
          locale={locale}
          title={t("takeover.empty", locale)}
        />
      ) : (
        data.takeovers.map((item) => (
          <Card
            key={item.correlatedTakeoverCaseId}
            theme={rocTheme}
            title={`${t("takeover.caseLabel", locale)} · ${item.correlatedTakeoverCaseId}`}
            subtitle={`${item.vehicleId} · ${item.orderId ?? "—"}`}
            actions={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Pill theme={rocTheme} tone="accent">
                  P{item.correlationPriority}
                </Pill>
                <RocStatusPill
                  tone={item.discrepancyCaseIds.length > 0 ? "warn" : "success"}
                >
                  {t(
                    item.discrepancyCaseIds.length > 0
                      ? "takeover.discrepancy.yes"
                      : "takeover.discrepancy.no",
                    locale,
                  )}
                </RocStatusPill>
              </div>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ overflowX: "auto" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(260px, 1fr))",
                    gap: 12,
                    minWidth: 840,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      padding: 14,
                      borderRadius: 12,
                      background: rocTheme.surfaceLo,
                      border: `1px solid ${rocTheme.border}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: rocTheme.text,
                      }}
                    >
                      {t("takeover.column.tesla", locale)}
                    </div>
                    <RocField
                      label={t("takeover.field.time", locale)}
                      value={formatUtcTime(
                        item.sourceTimestamps.teslaOccurredAt,
                        locale,
                      )}
                    />
                    <RocField
                      label={t("takeover.field.order", locale)}
                      value={item.teslaEvent?.orderId ?? "—"}
                      mono
                    />
                    <RocField
                      label={t("takeover.field.correlation", locale)}
                      value={item.teslaEvent?.takeoverCorrelationId ?? "—"}
                      mono
                    />
                    <RocField
                      label={t("takeover.field.transition", locale)}
                      value={item.teslaEvent?.transitionType ?? "—"}
                      mono
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      padding: 14,
                      borderRadius: 12,
                      background: rocTheme.surfaceLo,
                      border: `1px solid ${rocTheme.border}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: rocTheme.text,
                      }}
                    >
                      {t("takeover.column.safety", locale)}
                    </div>
                    <RocField
                      label={t("takeover.field.time", locale)}
                      value={formatUtcTime(
                        item.sourceTimestamps.safetyOccurredAt,
                        locale,
                      )}
                    />
                    <RocField
                      label={t("takeover.field.reason", locale)}
                      value={item.safetyOperatorTakeoverReport.reasonCode}
                      mono
                    />
                    <RocField
                      label={t("takeover.field.disposition", locale)}
                      value={item.safetyOperatorTakeoverReport.disposition}
                      mono
                    />
                    <RocField
                      label={t("takeover.field.notes", locale)}
                      value={item.safetyOperatorTakeoverReport.notes ?? "—"}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      padding: 14,
                      borderRadius: 12,
                      background: rocTheme.surfaceLo,
                      border: `1px solid ${rocTheme.border}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: rocTheme.text,
                      }}
                    >
                      {t("takeover.column.roc", locale)}
                    </div>
                    <RocField
                      label={t("takeover.field.requested", locale)}
                      value={formatUtcTime(
                        item.sourceTimestamps.rocRequestedAt,
                        locale,
                      )}
                    />
                    <RocField
                      label={t("takeover.field.response", locale)}
                      value={item.rocTakeoverResponse?.responseType ?? "—"}
                      mono
                    />
                    <RocField
                      label={t("takeover.field.outcome", locale)}
                      value={item.rocTakeoverResponse?.outcomeNote ?? "—"}
                    />
                    <RocField
                      label={t("takeover.field.resolved", locale)}
                      value={formatUtcTime(
                        item.sourceTimestamps.rocResolvedAt,
                        locale,
                      )}
                    />
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                  alignItems: "end",
                }}
              >
                <RocField
                  label={t("takeover.field.priority", locale)}
                  value={`P${item.correlationPriority}`}
                  mono
                />
                <RocField
                  label={t("takeover.field.matchedBy", locale)}
                  value={item.matchedBy}
                  mono
                />
                <RocField
                  label={t("takeover.field.discrepancy", locale)}
                  value={item.discrepancyCaseIds.join(", ") || "—"}
                  mono
                />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <RocInvestigationLink
                    link={item.investigationLink ?? null}
                    locale={locale}
                  />
                </div>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
