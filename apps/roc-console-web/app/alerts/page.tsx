import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import {
  buildSupportedAlertActionItems,
  getRocAlertsPageData,
  type RocPageActionItem,
} from "@/lib/roc-page-data";
import { RocActionRail } from "@/components/roc-action-rail";
import {
  RocEvidenceTag,
  RocRefreshBanner,
} from "@/components/roc-screen-primitives";
import {
  RocResponseEmptyState,
  RocStatusPill,
  formatUtcTime,
  rocAlertSeverityTone,
  rocAlertStatusTone,
} from "@/components/roc-response-surfaces";
import {
  CanvasBtn as Btn,
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

export default async function AlertsPage() {
  const locale = await getServerLocale();
  const data = await getRocAlertsPageData();
  const actionLabels = buildActionLabels(locale);

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("alerts.title", locale)}
        subtitle={t("alerts.subtitle", locale)}
        actions={
          <Btn theme={rocTheme} icon="filter">
            {t("alerts.columns.severity", locale)}
          </Btn>
        }
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      {data.alerts.length === 0 ? (
        <RocResponseEmptyState
          locale={locale}
          title={t("response.emptyBody", locale)}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.alerts.map((alert) => {
            const actions = conciseActionItems(
              buildSupportedAlertActionItems([alert], locale),
              locale,
            );

            return (
              <Card theme={rocTheme} key={alert.alertId} padding={14}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 999,
                      background:
                        alert.severity === "critical"
                          ? rocTheme.danger
                          : alert.severity === "warning"
                            ? rocTheme.warn
                            : rocTheme.info,
                      marginTop: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                        {alert.title}
                      </div>
                      <RocStatusPill
                        tone={rocAlertSeverityTone(alert.severity)}
                      >
                        {t(`alerts.severity.${alert.severity}`, locale)}
                      </RocStatusPill>
                      <RocStatusPill tone={rocAlertStatusTone(alert.status)}>
                        {t(`alerts.status.${alert.status}`, locale)}
                      </RocStatusPill>
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: rocTheme.textMuted,
                      }}
                    >
                      {alert.summary}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 10,
                      }}
                    >
                      <Pill theme={rocTheme} tone="neutral">
                        {alert.vehicleId ?? t("common.unlinked", locale)}
                      </Pill>
                      <RocEvidenceTag source={alert.source} locale={locale} />
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: rocTheme.textDim,
                      fontFamily: rocTheme.monoFamily,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatUtcTime(alert.updatedAt ?? alert.openedAt, locale)}
                  </span>
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
