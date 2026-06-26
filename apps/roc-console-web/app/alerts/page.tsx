import { RocActionRail } from "@/components/roc-action-rail";
import {
  formatUtcTime,
  RocResponseEmptyState,
  RocStatusPill,
  rocAlertSeverityTone,
  rocAlertStatusTone,
} from "@/components/roc-response-surfaces";
import {
  RocEvidenceTag,
  RocRefreshBanner,
} from "@/components/roc-screen-primitives";
import {
  buildSupportedAlertActionItems,
  getRocTakeoverPageData,
} from "@/lib/roc-page-data";
import { getServerLocale } from "@/lib/server-locale";
import { rocTheme } from "@/lib/roc-theme";
import { t } from "@/lib/translations";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
} from "@drts/ui-web";

export default async function AlertsPage() {
  const locale = await getServerLocale();
  const data = await getRocTakeoverPageData();

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("alerts.title", locale)}
        subtitle={t("alerts.subtitle", locale)}
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      {data.alerts.length === 0 ? (
        <RocResponseEmptyState
          locale={locale}
          title={t("alerts.title", locale)}
        />
      ) : (
        data.alerts.map((alert) => {
          const actionItems = buildSupportedAlertActionItems([alert], locale);
          return (
            <Card
              key={alert.alertId}
              theme={rocTheme}
              title={alert.title}
              subtitle={alert.summary}
              actions={
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <RocStatusPill tone={rocAlertSeverityTone(alert.severity)}>
                    {t(`alerts.severity.${alert.severity}`, locale)}
                  </RocStatusPill>
                  <RocStatusPill tone={rocAlertStatusTone(alert.status)}>
                    {t(`alerts.status.${alert.status}`, locale)}
                  </RocStatusPill>
                </div>
              }
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 10.5, color: rocTheme.textMuted }}>
                      {t("alerts.columns.vehicle", locale)}
                    </div>
                    <div style={{ fontSize: 12.5, color: rocTheme.text }}>
                      {alert.vehicleId ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: rocTheme.textMuted }}>
                      {t("alerts.columns.source", locale)}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <RocEvidenceTag source={alert.source} locale={locale} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: rocTheme.textMuted }}>
                      {t("alerts.columns.updated", locale)}
                    </div>
                    <div style={{ fontSize: 12.5, color: rocTheme.text }}>
                      {formatUtcTime(alert.updatedAt, locale)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: rocTheme.textMuted }}>
                      {t("alerts.columns.actions", locale)}
                    </div>
                    <div style={{ fontSize: 12.5, color: rocTheme.text }}>
                      {actionItems.length}
                    </div>
                  </div>
                </div>
                {actionItems.length > 0 ? (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                        {t("alerts.actionRail", locale)}
                      </div>
                      <Pill theme={rocTheme} tone="warn">
                        {t("alerts.actionRailSub", locale)}
                      </Pill>
                    </div>
                    <RocActionRail
                      items={actionItems}
                      labels={{
                        invoke: t("actions.invoke", locale),
                        pending: t("actions.pending", locale),
                        tracking: t("actions.tracking", locale),
                        audit: t("actions.audit", locale),
                        disabled: t("actions.disabled", locale),
                        failed: t("actions.failed", locale),
                      }}
                    />
                  </div>
                ) : (
                  <span style={{ fontSize: 11.5, color: rocTheme.textDim }}>
                    {t("common.reviewOnly", locale)}
                  </span>
                )}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
