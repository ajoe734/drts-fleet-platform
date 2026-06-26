import type { ReactNode } from "react";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import { getRocTakeoverPageData } from "@/lib/roc-page-data";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import { RocInvestigationLink } from "@/components/roc-investigation-link";
import {
  RocField,
  RocResponseEmptyState,
  RocStatusPill,
  formatUtcTime,
} from "@/components/roc-response-surfaces";
import {
  CanvasCard as Card,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
} from "@drts/ui-web";

function TakeoverSourceCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        borderRadius: 14,
        border: `1px solid ${rocTheme.border}`,
        background: rocTheme.surfaceLo,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: rocTheme.accent,
          letterSpacing: 0.2,
        }}
      >
        {title}
      </div>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
  );
}

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
        <RocResponseEmptyState
          locale={locale}
          title={t("takeover.empty", locale)}
        />
      ) : null}
      {data.takeovers.map((takeover) => (
        <Card
          key={takeover.correlatedTakeoverCaseId}
          theme={rocTheme}
          title={`${t("takeover.caseLabel", locale)} · ${takeover.correlatedTakeoverCaseId}`}
          subtitle={`${takeover.vehicleId} · ${t("takeover.field.priority", locale)} ${takeover.correlationPriority} · ${t("takeover.field.matchedBy", locale)} ${takeover.matchedBy}`}
          actions={
            <RocInvestigationLink
              link={takeover.investigationLink ?? null}
              locale={locale}
            />
          }
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <RocStatusPill
              tone={takeover.discrepancyCaseIds.length > 0 ? "warn" : "success"}
            >
              {t(
                takeover.discrepancyCaseIds.length > 0
                  ? "takeover.discrepancy.yes"
                  : "takeover.discrepancy.no",
                locale,
              )}
            </RocStatusPill>
            <RocStatusPill
              tone={
                takeover.rocTakeoverResponse?.resolvedAt ? "success" : "danger"
              }
            >
              {takeover.rocTakeoverResponse?.resolvedAt
                ? t("incidents.status.contained", locale)
                : t("incidents.status.open", locale)}
            </RocStatusPill>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <TakeoverSourceCard title={t("takeover.column.tesla", locale)}>
              <RocField
                label={t("takeover.field.time", locale)}
                value={formatUtcTime(
                  takeover.sourceTimestamps.teslaOccurredAt,
                  locale,
                )}
              />
              <RocField
                label={t("takeover.field.order", locale)}
                value={
                  takeover.teslaEvent?.orderId ?? t("common.unlinked", locale)
                }
                mono
              />
              <RocField
                label={t("takeover.field.correlation", locale)}
                value={
                  takeover.teslaEvent?.takeoverCorrelationId ??
                  t("common.unlinked", locale)
                }
                mono
              />
              <RocField
                label={t("takeover.field.transition", locale)}
                value={
                  takeover.teslaEvent?.transitionType ??
                  t("common.unlinked", locale)
                }
              />
            </TakeoverSourceCard>
            <TakeoverSourceCard title={t("takeover.column.safety", locale)}>
              <RocField
                label={t("takeover.field.time", locale)}
                value={formatUtcTime(
                  takeover.sourceTimestamps.safetyOccurredAt,
                  locale,
                )}
              />
              <RocField
                label={t("takeover.field.correlation", locale)}
                value={takeover.safetyOperatorTakeoverReport.correlationId}
                mono
              />
              <RocField
                label={t("takeover.field.reason", locale)}
                value={takeover.safetyOperatorTakeoverReport.reasonCode}
              />
              <RocField
                label={t("takeover.field.disposition", locale)}
                value={takeover.safetyOperatorTakeoverReport.disposition}
              />
              <RocField
                label={t("takeover.field.notes", locale)}
                value={takeover.safetyOperatorTakeoverReport.notes ?? "—"}
              />
            </TakeoverSourceCard>
            <TakeoverSourceCard title={t("takeover.column.roc", locale)}>
              <RocField
                label={t("takeover.field.requested", locale)}
                value={formatUtcTime(
                  takeover.sourceTimestamps.rocRequestedAt,
                  locale,
                )}
              />
              <RocField
                label={t("takeover.field.response", locale)}
                value={takeover.rocTakeoverResponse?.responseType ?? "—"}
              />
              <RocField
                label={t("takeover.field.outcome", locale)}
                value={takeover.rocTakeoverResponse?.outcomeNote ?? "—"}
              />
              <RocField
                label={t("takeover.field.resolved", locale)}
                value={formatUtcTime(
                  takeover.sourceTimestamps.rocResolvedAt,
                  locale,
                )}
              />
            </TakeoverSourceCard>
          </div>
        </Card>
      ))}
    </div>
  );
}
