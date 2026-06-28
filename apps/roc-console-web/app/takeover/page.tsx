import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import {
  buildSupportedAlertActionItems,
  getRocTakeoverPageData,
  type RocPageActionItem,
} from "@/lib/roc-page-data";
import { RocActionRail } from "@/components/roc-action-rail";
import { RocInvestigationLink } from "@/components/roc-investigation-link";
import {
  RocEvidenceTag,
  RocRefreshBanner,
} from "@/components/roc-screen-primitives";
import {
  RocField,
  RocGuardrail,
  RocResponseEmptyState,
  RocStatusPill,
  formatUtcTime,
} from "@/components/roc-response-surfaces";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
} from "@drts/ui-web";

function buildActionLabels(locale: Locale) {
  return {
    invoke: t("actions.invoke", locale),
    pending: t("actions.pending", locale),
    tracking: t("actions.tracking", locale),
    audit: t("actions.audit", locale),
    disabled: t("actions.disabled", locale),
    failed: t("actions.failed", locale),
  };
}

function conciseActionItems(items: RocPageActionItem[], locale: Locale) {
  return items.map((item) => ({
    ...item,
    label: t(`actionLabel.${item.descriptor.action}`, locale),
  }));
}

function humanizeCode(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveTakeoverStatus(
  resolvedAt: string | null,
  respondedAt: string | null,
) {
  if (resolvedAt) {
    return "reviewed" as const;
  }
  if (respondedAt) {
    return "in_review" as const;
  }
  return "pending" as const;
}

function resolveTakeoverTone(status: ReturnType<typeof resolveTakeoverStatus>) {
  if (status === "reviewed") {
    return "success" as const;
  }
  if (status === "in_review") {
    return "warn" as const;
  }
  return "neutral" as const;
}

function ColumnHeader({
  title,
  subtitle,
  borderColor,
}: {
  title: string;
  subtitle: string;
  borderColor: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "8px 12px",
        borderBottom: `2px solid ${borderColor}`,
        background: rocTheme.surfaceLo,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: rocTheme.text }}>
        {title}
      </span>
      <span
        style={{
          fontSize: 10,
          color: rocTheme.textDim,
          fontFamily: rocTheme.monoFamily,
        }}
      >
        {subtitle}
      </span>
    </div>
  );
}

export default async function TakeoverPage() {
  const locale = await getServerLocale();
  const data = await getRocTakeoverPageData();
  const actionLabels = buildActionLabels(locale);

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("takeover.title", locale)}
        subtitle={t("takeover.subtitle", locale)}
      />
      <div style={{ display: "flex", gap: 8, padding: "0 24px" }}>
        <Pill theme={rocTheme} tone="warn">
          {data.takeovers.length} · {t("takeover.kpi.active", locale)}
        </Pill>
      </div>
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <RocGuardrail
        title={t("takeover.title", locale)}
        body={t("takeover.guardrailBody", locale)}
      />
      {data.takeovers.length === 0 ? (
        <RocResponseEmptyState
          locale={locale}
          title={t("takeover.empty", locale)}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.takeovers.map((takeover) => {
            const relatedActions = conciseActionItems(
              buildSupportedAlertActionItems(
                data.alerts.filter(
                  (alert) => alert.vehicleId === takeover.vehicleId,
                ),
                locale,
              ),
              locale,
            );
            const vehicle = data.vehicles.find(
              (candidate) => candidate.vehicleId === takeover.vehicleId,
            );
            const status = resolveTakeoverStatus(
              takeover.sourceTimestamps.rocResolvedAt,
              takeover.sourceTimestamps.rocRespondedAt,
            );

            return (
              <Card theme={rocTheme} key={takeover.correlatedTakeoverCaseId} padding={0}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 14px",
                    borderBottom: `1px solid ${rocTheme.border}`,
                  }}
                >
                  <span
                    style={{
                      color: rocTheme.accent,
                      fontWeight: 700,
                      fontFamily: rocTheme.monoFamily,
                    }}
                  >
                    {takeover.correlatedTakeoverCaseId}
                  </span>
                  <Pill theme={rocTheme} tone="neutral">
                    {takeover.vehicleId}
                  </Pill>
                  <span style={{ fontSize: 12, color: rocTheme.textMuted }}>
                    {vehicle?.areaLabel ?? "—"}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      fontSize: 11.5,
                      color: rocTheme.textDim,
                      fontFamily: rocTheme.monoFamily,
                    }}
                  >
                    {formatUtcTime(
                      takeover.sourceTimestamps.safetyOccurredAt,
                      locale,
                    )}
                  </span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(280px, 1fr))",
                      minWidth: 900,
                    }}
                  >
                    <div style={{ borderRight: `1px solid ${rocTheme.border}` }}>
                      <ColumnHeader
                        title={t("takeover.column.tesla", locale)}
                        subtitle="tesla"
                        borderColor={rocTheme.info}
                      />
                      <div
                        style={{
                          padding: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        <RocEvidenceTag
                          source={
                            takeover.teslaEvent
                              ? "tesla_provided"
                              : "not_exposed_by_provider"
                          }
                          locale={locale}
                        />
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 12,
                          }}
                        >
                          <RocField
                            label={t("takeover.field.time", locale)}
                            value={formatUtcTime(
                              takeover.sourceTimestamps.teslaOccurredAt,
                              locale,
                            )}
                            mono
                          />
                          <RocField
                            label={t("takeover.field.order", locale)}
                            value={takeover.teslaEvent?.orderId ?? "—"}
                            mono
                          />
                          <RocField
                            label={t("takeover.field.correlation", locale)}
                            value={
                              takeover.teslaEvent?.takeoverCorrelationId ?? "—"
                            }
                            mono
                          />
                          <RocField
                            label={t("takeover.field.transition", locale)}
                            value={humanizeCode(
                              takeover.teslaEvent?.transitionType,
                            )}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ borderRight: `1px solid ${rocTheme.border}` }}>
                      <ColumnHeader
                        title={t("takeover.column.safety", locale)}
                        subtitle="operator"
                        borderColor={rocTheme.accent}
                      />
                      <div
                        style={{
                          padding: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        <RocEvidenceTag source="operator_reported" locale={locale} />
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 12,
                          }}
                        >
                          <RocField
                            label={t("takeover.field.time", locale)}
                            value={formatUtcTime(
                              takeover.sourceTimestamps.safetyOccurredAt,
                              locale,
                            )}
                            mono
                          />
                          <RocField
                            label={t("takeover.field.reason", locale)}
                            value={humanizeCode(
                              takeover.safetyOperatorTakeoverReport.reasonCode,
                            )}
                          />
                          <RocField
                            label={t("takeover.field.disposition", locale)}
                            value={humanizeCode(
                              takeover.safetyOperatorTakeoverReport.disposition,
                            )}
                          />
                          <RocField
                            label={t("takeover.field.correlation", locale)}
                            value={
                              takeover.safetyOperatorTakeoverReport.correlationId
                            }
                            mono
                          />
                        </div>
                        <RocField
                          label={t("takeover.field.notes", locale)}
                          value={
                            takeover.safetyOperatorTakeoverReport.notes ?? "—"
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <ColumnHeader
                        title={t("takeover.column.roc", locale)}
                        subtitle="roc_response"
                        borderColor={rocTheme.success}
                      />
                      <div
                        style={{
                          padding: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <RocEvidenceTag source="roc_assessed" locale={locale} />
                          <RocStatusPill tone={resolveTakeoverTone(status)}>
                            {t(`takeover.status.${status}`, locale)}
                          </RocStatusPill>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 12,
                          }}
                        >
                          <RocField
                            label={t("takeover.field.requested", locale)}
                            value={formatUtcTime(
                              takeover.sourceTimestamps.rocRequestedAt,
                              locale,
                            )}
                            mono
                          />
                          <RocField
                            label={t("takeover.field.response", locale)}
                            value={humanizeCode(
                              takeover.rocTakeoverResponse?.responseType,
                            )}
                          />
                          <RocField
                            label={t("takeover.field.resolved", locale)}
                            value={formatUtcTime(
                              takeover.sourceTimestamps.rocResolvedAt,
                              locale,
                            )}
                            mono
                          />
                          <RocField
                            label={t("takeover.field.discrepancy", locale)}
                            value={
                              takeover.discrepancyCaseIds.length > 0
                                ? t("takeover.discrepancy.yes", locale)
                                : t("takeover.discrepancy.no", locale)
                            }
                          />
                        </div>
                        <RocField
                          label={t("takeover.field.outcome", locale)}
                          value={takeover.rocTakeoverResponse?.outcomeNote ?? "—"}
                        />
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 12,
                          }}
                        >
                          <RocField
                            label={t("takeover.field.priority", locale)}
                            value={String(takeover.correlationPriority)}
                            mono
                          />
                          <RocField
                            label={t("takeover.field.matchedBy", locale)}
                            value={humanizeCode(takeover.matchedBy)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "12px 14px",
                    borderTop: `1px solid ${rocTheme.border}`,
                    background: rocTheme.surfaceLo,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {relatedActions.length > 0 ? (
                    <RocActionRail items={relatedActions} labels={actionLabels} />
                  ) : null}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <RocInvestigationLink
                      link={takeover.investigationLink ?? null}
                      locale={locale}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
