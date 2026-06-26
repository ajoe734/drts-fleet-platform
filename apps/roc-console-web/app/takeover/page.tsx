import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { crossAppHref } from "@/lib/roc-cross-app-links";
import { getRocTakeoverPageData } from "@/lib/roc-page-data";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import {
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
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
        <Card theme={rocTheme} title={t("takeover.empty", locale)}>
          <div />
        </Card>
      ) : null}
      {data.takeovers.map((item) => (
        <Card
          key={item.correlatedTakeoverCaseId}
          theme={rocTheme}
          title={`${t("takeover.caseLabel", locale)} · ${item.correlatedTakeoverCaseId}`}
          subtitle={`${item.vehicleId} · ${item.orderId ?? "—"}`}
          actions={
            item.investigationLink ? (
              <a
                href={crossAppHref(item.investigationLink)}
                target={
                  item.investigationLink.openMode === "new_tab"
                    ? "_blank"
                    : undefined
                }
                rel="noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Btn theme={rocTheme} icon="ext">
                  {t("common.openInvestigation", locale)}
                </Btn>
              </a>
            ) : undefined
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
              alignItems: "start",
            }}
          >
            <Card
              theme={rocTheme}
              title={t("takeover.column.tesla", locale)}
              subtitle={item.teslaEvent?.eventId ?? t("common.none", locale)}
            >
              <DL
                theme={rocTheme}
                cols={1}
                items={[
                  {
                    k: t("takeover.field.time", locale),
                    v: item.sourceTimestamps.teslaOccurredAt ?? "—",
                    mono: true,
                  },
                  {
                    k: t("takeover.field.order", locale),
                    v: item.teslaEvent?.orderId ?? "—",
                    mono: true,
                  },
                  {
                    k: t("takeover.field.correlation", locale),
                    v: item.teslaEvent?.takeoverCorrelationId ?? "—",
                    mono: true,
                  },
                  {
                    k: t("takeover.field.transition", locale),
                    v: item.teslaEvent?.transitionType ?? "not_exposed",
                    mono: true,
                  },
                ]}
              />
            </Card>
            <Card
              theme={rocTheme}
              title={t("takeover.column.safety", locale)}
              subtitle={item.safetyOperatorTakeoverReport.reportId}
            >
              <DL
                theme={rocTheme}
                cols={1}
                items={[
                  {
                    k: t("takeover.field.time", locale),
                    v: item.sourceTimestamps.safetyOccurredAt,
                    mono: true,
                  },
                  {
                    k: t("takeover.field.reason", locale),
                    v: item.safetyOperatorTakeoverReport.reasonCode,
                    mono: true,
                  },
                  {
                    k: t("takeover.field.disposition", locale),
                    v: item.safetyOperatorTakeoverReport.disposition,
                    mono: true,
                  },
                  {
                    k: t("takeover.field.notes", locale),
                    v: item.safetyOperatorTakeoverReport.notes ?? "—",
                  },
                ]}
              />
            </Card>
            <Card
              theme={rocTheme}
              title={t("takeover.column.roc", locale)}
              subtitle={
                item.rocTakeoverResponse?.responseId ?? t("common.none", locale)
              }
            >
              <DL
                theme={rocTheme}
                cols={1}
                items={[
                  {
                    k: t("takeover.field.priority", locale),
                    v: String(item.correlationPriority),
                    mono: true,
                  },
                  {
                    k: t("takeover.field.response", locale),
                    v: item.rocTakeoverResponse?.responseType ?? "pending",
                    mono: true,
                  },
                  {
                    k: t("takeover.field.time", locale),
                    v:
                      item.sourceTimestamps.rocRespondedAt ??
                      item.sourceTimestamps.rocRequestedAt ??
                      "—",
                    mono: true,
                  },
                  {
                    k: t("takeover.field.outcome", locale),
                    v: item.rocTakeoverResponse?.outcomeNote ?? "—",
                  },
                ]}
              />
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <Pill
                  theme={rocTheme}
                  tone={
                    item.discrepancyCaseIds.length > 0 ? "danger" : "success"
                  }
                  dot
                >
                  {item.discrepancyCaseIds.length > 0
                    ? "discrepancy"
                    : "aligned"}
                </Pill>
                <Pill theme={rocTheme} tone="accent">
                  {item.matchedBy}
                </Pill>
              </div>
            </Card>
          </div>
        </Card>
      ))}
    </div>
  );
}
