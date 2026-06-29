import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import {
  getRocEvidencePageData,
  type RocPageActionItem,
} from "@/lib/roc-page-data";
import { RocActionRail } from "@/components/roc-action-rail";
import { RocInvestigationLink } from "@/components/roc-investigation-link";
import { RocRefreshBanner } from "@/components/roc-screen-primitives";
import {
  RocGuardrail,
  RocResponseEmptyState,
  RocStatusPill,
  rocFreezeStatusTone,
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

export default async function EvidencePage() {
  const locale = await getServerLocale();
  const data = await getRocEvidencePageData(locale);
  const actionLabels = buildActionLabels(locale);

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("evidence.title", locale)}
        subtitle={t("evidence.subtitle", locale)}
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <RocGuardrail
        title={t("evidence.guardrailTitle", locale)}
        body={t("evidence.guardrailBody", locale)}
      />
      {data.evidence.length === 0 ? (
        <RocResponseEmptyState
          locale={locale}
          title={t("response.emptyBody", locale)}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.evidence.map((item) => {
            const actions = conciseActionItems(item.availableActions, locale);
            return (
              <Card theme={rocTheme} key={item.evidenceId}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      color: rocTheme.accent,
                      fontWeight: 700,
                      fontFamily: rocTheme.monoFamily,
                    }}
                  >
                    {item.evidenceId}
                  </span>
                  <Pill theme={rocTheme} tone="neutral">
                    {item.vehicleId}
                  </Pill>
                  <RocStatusPill tone={rocFreezeStatusTone(item.freezeStatus)}>
                    {t(`evidence.freeze.${item.freezeStatus}`, locale)}
                  </RocStatusPill>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    color: rocTheme.textMuted,
                  }}
                >
                  {item.summary}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: 12,
                  }}
                >
                  <RocInvestigationLink
                    link={item.investigationLink}
                    locale={locale}
                  />
                </div>
                {actions.length > 0 ? (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: `1px solid ${rocTheme.border}`,
                    }}
                  >
                    <RocActionRail items={actions} labels={actionLabels} />
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
