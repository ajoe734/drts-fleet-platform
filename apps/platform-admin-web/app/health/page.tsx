/**
 * Operational Health Page
 * Governance view for platform alerts plus adapter readiness preview.
 */

"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { actionButtonStyle, emptyStateStyle } from "@/components/platform-ui";
import type {
  AdapterHealthRecord,
  OperationalObservabilitySnapshot,
} from "@drts/contracts";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowPanel,
  WorkflowSplitLayout,
} from "@drts/ui-web";

type AdapterPreviewRecord = {
  platformCode: string;
  status: string;
  credentialStatus: string | null;
  authStatus: string | null;
  webhookStatus: string | null;
  lastCheckedAt: string;
  lastError: string | null;
};

const ALERT_SEVERITY_ORDER = {
  critical: 0,
  warning: 1,
  healthy: 2,
} as const;

function createFallbackObservabilitySnapshot(
  referenceDate = new Date(),
): OperationalObservabilitySnapshot {
  return {
    generatedAt: referenceDate.toISOString(),
    alerts: [],
    dispatch: {
      activeOrders: 0,
      queueDepth: 0,
      laggedOrders: 0,
      redispatchOrders: 0,
      exceptionHoldOrders: 0,
      dispatchFailedOrders: 0,
      oldestReadyOrderLagMinutes: null,
    },
    recording: {
      phoneOrders: 0,
      linkedOrders: 0,
      pendingOrders: 0,
      pendingCallSessions: 0,
      missingRecordingLinks: 0,
      oldestPendingLagMinutes: null,
      linkedRatioPercent: 0,
    },
    driverState: {
      totalDrivers: 0,
      availableDrivers: 0,
      dispatchEligibleDrivers: 0,
      offlineDrivers: 0,
      staleLocationDrivers: 0,
      missingLocationDrivers: 0,
      oldestLocationLagMinutes: null,
    },
    webhook: {
      totalEndpoints: 0,
      activeEndpoints: 0,
      disabledEndpoints: 0,
      queuedDeliveries: 0,
      failedDeliveriesLastHour: 0,
      oldestQueuedDeliveryLagMinutes: null,
    },
    eligibility: {
      totalReviewQueue: 0,
      manualReviewQueue: 0,
      manualFallbackQueue: 0,
      ineligibleQueue: 0,
      recentFailureCount24h: 0,
    },
    reporting: {
      queuedJobs: 0,
      failedJobs: 0,
      dispatchRecordingIndexQueuedJobs: 0,
    },
    adapters: {
      totalAdapters: 0,
      healthyAdapters: 0,
      degradedAdapters: 0,
      downAdapters: 0,
    },
    forwarderOps: {
      totalForwardedOrders: 0,
      syncFailedOrders: 0,
      acceptPendingOrders: 0,
      manualFallbackQueue: 0,
      reconciliationQueue: 0,
      oldestSyncFailedLagMinutes: null,
      oldestAcceptPendingLagMinutes: null,
      oldestManualFallbackLagMinutes: null,
      oldestReconciliationLagMinutes: null,
    },
    adapterDetails: [],
    roleViews: [],
  };
}

function formatAlertValue(
  value: number,
  unit: "count" | "minutes" | "percent",
  locale: "en" | "zh",
): string {
  if (unit === "minutes") {
    return locale === "en" ? `${value} min` : `${value} 分鐘`;
  }
  if (unit === "percent") {
    return `${value}%`;
  }
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function toneForAlertState(state: string) {
  switch (state) {
    case "critical":
    case "down":
      return "danger" as const;
    case "warning":
    case "degraded":
      return "warning" as const;
    case "healthy":
      return "success" as const;
    default:
      return "neutral" as const;
  }
}

function toneForAdapterSeverity(status: string) {
  switch (status) {
    case "healthy":
      return "success" as const;
    case "warning":
    case "degraded":
      return "warning" as const;
    case "critical":
    case "down":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function toneForCredentialStatus(status: string | null) {
  switch (status) {
    case "valid":
      return "success" as const;
    case "invalid":
    case "expired":
      return "danger" as const;
    case "not_configured":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function toneForAuthStatus(status: string | null) {
  switch (status) {
    case "authenticated":
      return "success" as const;
    case "invalid":
      return "danger" as const;
    case "reauth_required":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function toneForWebhookStatus(status: string | null) {
  switch (status) {
    case "healthy":
      return "success" as const;
    case "failing":
      return "danger" as const;
    case "not_configured":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function hasAdapterControlAttention(adapter: AdapterPreviewRecord) {
  return (
    adapter.status !== "healthy" ||
    adapter.credentialStatus === "invalid" ||
    adapter.credentialStatus === "expired" ||
    adapter.credentialStatus === "not_configured" ||
    adapter.authStatus === "invalid" ||
    adapter.authStatus === "reauth_required" ||
    adapter.webhookStatus === "failing" ||
    adapter.webhookStatus === "not_configured"
  );
}

function emptyLabel(locale: "en" | "zh") {
  return locale === "en" ? "—" : "—";
}

export default function HealthPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [adapters, setAdapters] = useState<AdapterHealthRecord[]>([]);
  const [observability, setObservability] =
    useState<OperationalObservabilitySnapshot>(
      createFallbackObservabilitySnapshot(),
    );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adapterData, operationalData] = await Promise.all([
        client.getForwarderAdaptersHealth() as Promise<AdapterHealthRecord[]>,
        client.getOperationalObservability(),
      ]);

      setAdapters(adapterData);
      setObservability(operationalData);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const copy =
    locale === "en"
      ? {
          eyebrow: "Control-plane governance",
          subtitle:
            "alert list · dispatch lag · webhook queue · eligibility queue · reporting · adapters",
          focusAreas: "Focus areas",
          snapshot: "Snapshot",
          registryLink: "Open adapter registry",
          activeAlertsTitle: "Active alerts",
          activeAlertsSubtitle:
            "Cross-module alert posture kept in a compact operator triage lane.",
          activeAlertsSummary:
            "This list mirrors the PA_Health canvas by keeping route, issue text, and count visible before drill-through.",
          adapterInventoryTitle: "Adapter inventory",
          adapterInventorySubtitle:
            "Global adapter posture with live controls state and last-check context.",
          adapterInventorySummary:
            "Registry remains the editable source of truth; this table stays optimized for live triage.",
          postureTitle: "Health posture",
          postureSubtitle:
            "Compact read of platform-scoped thresholds, queues, and focus areas.",
          postureSummary:
            "Use this panel as the right-hand snapshot while the main column stays on alerts and adapter drill-through.",
          stableBannerTitle:
            "No platform-scoped alert is breaching thresholds.",
          stableBannerDescription:
            "Continue monitoring queue pressure and adapter readiness below. The registry remains the inventory source of truth while this page stays live-health oriented.",
          warningBannerTitle:
            "Platform attention is required across active queues or adapters.",
          warningBannerDescription:
            "Review threshold breaches, then use the adapter preview to decide whether the issue is a transient live-health event or a registry-level readiness problem.",
          pressureTitle: "Forwarder pressure",
          pressureDescription:
            "Live queue pressure stays separate from the adapter registry so operators can triage health without mutating rollout truth.",
          pressureForwarded: "Forwarded orders",
          pressureSyncFailures: "Sync failures",
          pressureAcceptPending: "Accept pending",
          pressureReconciliation: "Reconciliation queue",
          drillThrough: "View registry",
          drillThroughNote: "Registry remains the editable inventory surface.",
          lastRefresh: "Last refresh",
          noAdapterDetail:
            "No adapter detail returned in snapshot; falling back to forwarder health records.",
          noIssues: "No active error reported",
          noPlatformAlert: "No platform-scoped alert is active right now.",
        }
      : {
          eyebrow: "治理控制面",
          subtitle:
            "alert list · dispatch lag · webhook queue · eligibility queue · reporting · adapters",
          focusAreas: "重點面向",
          snapshot: "快照時間",
          registryLink: "前往 adapter registry",
          activeAlertsTitle: "Active alerts",
          activeAlertsSubtitle:
            "把跨模組告警濃縮成同一條 operator triage 路徑。",
          activeAlertsSummary:
            "這個清單對齊 PA_Health 設計稿，先保留 route、問題描述與 count，再決定 drill-through。",
          adapterInventoryTitle: "Adapter inventory",
          adapterInventorySubtitle:
            "以 live controls 與 last check 為主的全域 adapter 姿態。",
          adapterInventorySummary:
            "可編輯設定仍在 registry；這張表只負責即時 triage。",
          postureTitle: "健康姿態",
          postureSubtitle:
            "把平台層 threshold、queue 壓力與 focus areas 濃縮成側欄摘要。",
          postureSummary:
            "主欄維持 alerts 與 adapter drill-through；這裡則提供右側快照。",
          stableBannerTitle: "目前沒有平台範圍 alert 超出門檻。",
          stableBannerDescription:
            "下方仍保留 queue pressure 與 adapter readiness 監看；registry 繼續作為 inventory 真實來源，本頁只負責 live health。",
          warningBannerTitle: "目前有 queue 或 adapter 需要平台介入。",
          warningBannerDescription:
            "先從 threshold breach 判斷告警，再用 adapter preview 區分這是暫時性的 live-health 問題，還是 registry 層級的 readiness 風險。",
          pressureTitle: "轉派壓力",
          pressureDescription:
            "即時 queue 壓力刻意與 adapter registry 分離，讓 operator 能先做健康度判斷，再回到 rollout truth。",
          pressureForwarded: "轉派訂單",
          pressureSyncFailures: "同步失敗",
          pressureAcceptPending: "待接受",
          pressureReconciliation: "對帳佇列",
          drillThrough: "查看 registry",
          drillThroughNote: "可編輯的 inventory 真實面仍在 registry。",
          lastRefresh: "上次刷新",
          noAdapterDetail:
            "快照未回傳 adapter detail，改用 forwarder health 記錄補足。",
          noIssues: "目前沒有回報錯誤",
          noPlatformAlert: "目前沒有平台範圍的 active alert。",
        };

  const platformView = observability.roleViews.find(
    (view) => view.route === "platform",
  );
  const platformAlertKeys = new Set(platformView?.alertKeys ?? []);
  const platformAlerts = observability.alerts
    .filter(
      (alert) =>
        platformAlertKeys.has(alert.key) || alert.routes.includes("platform"),
    )
    .sort(
      (left, right) =>
        ALERT_SEVERITY_ORDER[left.state] - ALERT_SEVERITY_ORDER[right.state],
    );

  const adapterPreview: AdapterPreviewRecord[] =
    observability.adapterDetails.length > 0
      ? observability.adapterDetails.map((detail) => ({
          platformCode: detail.platformCode,
          status: detail.status,
          credentialStatus: detail.credentialStatus,
          authStatus: detail.authStatus,
          webhookStatus: detail.webhookStatus,
          lastCheckedAt: detail.lastCheckedAt,
          lastError: detail.lastError,
        }))
      : adapters.map((adapter) => ({
          platformCode: adapter.platformCode,
          status: adapter.status,
          credentialStatus: adapter.credentialStatus,
          authStatus: adapter.authStatus,
          webhookStatus: adapter.webhookStatus,
          lastCheckedAt: adapter.lastCheckedAt,
          lastError: adapter.lastError,
        }));

  const criticalAlerts = platformAlerts.filter(
    (alert) => alert.state === "critical",
  ).length;
  const warningAlerts = platformAlerts.filter(
    (alert) => alert.state === "warning",
  ).length;
  const unhealthyAdapters =
    observability.adapters.degradedAdapters +
    observability.adapters.downAdapters;
  const bannerTone =
    criticalAlerts > 0 || observability.adapters.downAdapters > 0
      ? "danger"
      : warningAlerts > 0 || unhealthyAdapters > 0
        ? "warning"
        : "success";
  const focusAreas =
    platformView?.focusAreas
      .map((area) => formatPlatformCodeLabel(locale, area))
      .join(" / ") || emptyLabel(locale);

  const metricCards = [
    {
      id: "dispatch",
      label: t("health.metric.dispatch.title"),
      value: formatAlertValue(
        observability.dispatch.oldestReadyOrderLagMinutes ?? 0,
        "minutes",
        locale,
      ),
      detail: t("health.metric.dispatch.note", {
        count: observability.dispatch.laggedOrders,
      }),
      tone:
        (observability.dispatch.oldestReadyOrderLagMinutes ?? 0) > 0
          ? "warning"
          : "neutral",
    },
    {
      id: "webhook",
      label: t("health.metric.webhook.title"),
      value: formatAlertValue(
        observability.webhook.failedDeliveriesLastHour,
        "count",
        locale,
      ),
      detail: t("health.metric.webhook.note", {
        count: observability.webhook.queuedDeliveries,
      }),
      tone:
        observability.webhook.failedDeliveriesLastHour > 0
          ? "warning"
          : "success",
    },
    {
      id: "eligibility",
      label: t("health.metric.eligibility.title"),
      value: formatAlertValue(
        observability.eligibility.totalReviewQueue,
        "count",
        locale,
      ),
      detail: t("health.metric.eligibility.note", {
        count: observability.eligibility.manualReviewQueue,
      }),
      tone:
        observability.eligibility.totalReviewQueue > 0 ? "warning" : "success",
    },
    {
      id: "reporting",
      label: locale === "en" ? "Reporting failures 24h" : "24h 報表失敗",
      value: formatAlertValue(
        observability.reporting.failedJobs,
        "count",
        locale,
      ),
      detail:
        locale === "en"
          ? `${observability.reporting.queuedJobs} jobs still queued`
          : `${observability.reporting.queuedJobs} 筆工作仍在佇列`,
      tone: observability.reporting.failedJobs > 0 ? "danger" : "success",
    },
  ] as const;

  if (loading) {
    return <div style={emptyStateStyle}>{t("health.loading")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={t("health.title")}
        subtitle={copy.subtitle}
        meta={[
          {
            label: copy.snapshot,
            value: formatDateTime(observability.generatedAt),
          },
          {
            label: copy.focusAreas,
            value: focusAreas,
          },
          {
            label: copy.lastRefresh,
            value: lastRefresh || emptyLabel(locale),
          },
        ]}
        actions={
          <>
            <button
              style={actionButtonStyle({ tone: "secondary" })}
              onClick={loadData}
            >
              {t("common.refresh")}
            </button>
            <Link
              href="/adapter-registry"
              style={actionButtonStyle({ tone: "secondary" })}
            >
              {copy.registryLink}
            </Link>
          </>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={`${getPlatformLabel(locale, "error")}: ${error}`}
        />
      ) : null}

      <CalloutBanner
        tone={bannerTone}
        eyebrow={copy.eyebrow}
        title={
          bannerTone === "success"
            ? copy.stableBannerTitle
            : copy.warningBannerTitle
        }
        description={
          bannerTone === "success"
            ? copy.stableBannerDescription
            : copy.warningBannerDescription
        }
        actions={
          <Link
            href="/adapter-registry"
            style={actionButtonStyle({ tone: "secondary" })}
          >
            {copy.registryLink}
          </Link>
        }
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <StatusChip
            tone={criticalAlerts > 0 ? "danger" : "neutral"}
            label={`${t("health.summary.critical")} · ${criticalAlerts}`}
          />
          <StatusChip
            tone={warningAlerts > 0 ? "warning" : "neutral"}
            label={`${t("health.summary.warning")} · ${warningAlerts}`}
          />
          <StatusChip
            tone={unhealthyAdapters > 0 ? "warning" : "success"}
            label={`${t("health.metric.adapters.title")} · ${unhealthyAdapters}`}
          />
        </div>
      </CalloutBanner>

      <KpiRow minWidth="180px">
        {metricCards.map((metric) => (
          <KpiCard
            key={metric.id}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
            tone={metric.tone}
          />
        ))}
      </KpiRow>

      <WorkflowPanel
        tone="warning"
        eyebrow={copy.eyebrow}
        title={copy.pressureTitle}
        description={copy.pressureDescription}
        footer={
          observability.adapterDetails.length === 0
            ? copy.noAdapterDetail
            : undefined
        }
      >
        <DetailMetadataGrid
          columns={4}
          minColumnWidth="180px"
          items={[
            {
              id: "forwarded-orders",
              label: copy.pressureForwarded,
              value:
                observability.forwarderOps.totalForwardedOrders.toLocaleString(
                  locale === "en" ? "en-US" : "zh-TW",
                ),
            },
            {
              id: "sync-failures",
              label: copy.pressureSyncFailures,
              value: observability.forwarderOps.syncFailedOrders.toLocaleString(
                locale === "en" ? "en-US" : "zh-TW",
              ),
              tone:
                observability.forwarderOps.syncFailedOrders > 0
                  ? "danger"
                  : "neutral",
            },
            {
              id: "accept-pending",
              label: copy.pressureAcceptPending,
              value:
                observability.forwarderOps.acceptPendingOrders.toLocaleString(
                  locale === "en" ? "en-US" : "zh-TW",
                ),
              tone:
                observability.forwarderOps.acceptPendingOrders > 0
                  ? "warning"
                  : "neutral",
            },
            {
              id: "reconciliation",
              label: copy.pressureReconciliation,
              value:
                observability.forwarderOps.reconciliationQueue.toLocaleString(
                  locale === "en" ? "en-US" : "zh-TW",
                ),
              tone:
                observability.forwarderOps.reconciliationQueue > 0
                  ? "warning"
                  : "neutral",
            },
          ]}
        />
      </WorkflowPanel>

      <WorkflowSplitLayout
        main={
          <>
            <DataViewCard
              title={copy.activeAlertsTitle}
              subtitle={copy.activeAlertsSubtitle}
              tone="warning"
              summary={copy.activeAlertsSummary}
              footer={`${platformAlerts.length} ${locale === "en" ? "platform-scoped alerts" : "筆平台範圍告警"}`}
            >
              {platformAlerts.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {platformAlerts.map((alert) => (
                    <div
                      key={alert.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 0",
                        borderBottom: "1px solid rgba(148,163,184,0.18)",
                      }}
                    >
                      <StatusChip
                        tone={toneForAlertState(alert.state)}
                        label={alert.routes
                          .map((route) =>
                            route === "platform"
                              ? t("health.route.platform")
                              : t("health.route.ops"),
                          )
                          .join(" / ")}
                      />
                      <DataCellStack
                        primary={
                          <strong>
                            {t(`health.alert.${alert.key}.title`)}
                          </strong>
                        }
                        secondary={t("health.thresholds", {
                          warning: formatAlertValue(
                            alert.thresholds.warning,
                            alert.thresholds.unit,
                            locale,
                          ),
                          critical: formatAlertValue(
                            alert.thresholds.critical,
                            alert.thresholds.unit,
                            locale,
                          ),
                        })}
                        tertiary={formatPlatformCodeLabel(locale, alert.key)}
                      />
                      <span
                        style={{
                          color: "#0f172a",
                          fontSize: 12.5,
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatAlertValue(
                          alert.measuredValue,
                          alert.thresholds.unit,
                          locale,
                        )}
                      </span>
                      <Link
                        href="/adapter-registry"
                        style={actionButtonStyle({
                          tone: "secondary",
                          size: "sm",
                        })}
                      >
                        {copy.drillThrough}
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "4px 0" }}>{copy.noPlatformAlert}</div>
              )}
            </DataViewCard>

            <DataViewCard
              title={copy.adapterInventoryTitle}
              subtitle={copy.adapterInventorySubtitle}
              tone="info"
              summary={copy.adapterInventorySummary}
              actions={
                <Link
                  href="/adapter-registry"
                  style={actionButtonStyle({ tone: "secondary" })}
                >
                  {copy.registryLink}
                </Link>
              }
              footer={`${adapterPreview.length} ${locale === "en" ? "adapter records" : "筆 adapter 記錄"}`}
            >
              <DataTable
                tone="info"
                minWidth={980}
                empty={t("health.noAdapters")}
                columns={[
                  { label: t("health.col.adapter"), width: "24%" },
                  { label: t("health.col.status"), width: "16%" },
                  {
                    label: locale === "en" ? "Controls" : "控制狀態",
                    width: "28%",
                  },
                  { label: t("health.col.lastCheck"), width: "18%" },
                  {
                    label: locale === "en" ? "Drill-through" : "延伸檢視",
                    width: "14%",
                  },
                ]}
              >
                {adapterPreview.map((adapter) => (
                  <Tr
                    key={adapter.platformCode}
                    highlighted={hasAdapterControlAttention(adapter)}
                  >
                    <Td mono>
                      <DataCellStack
                        primary={<strong>{adapter.platformCode}</strong>}
                        secondary={copy.drillThroughNote}
                      />
                    </Td>
                    <Td>
                      <DataCellStack
                        primary={
                          <StatusChip
                            tone={toneForAdapterSeverity(adapter.status)}
                            label={formatPlatformCodeLabel(
                              locale,
                              adapter.status,
                            )}
                          />
                        }
                        secondary={adapter.lastError || copy.noIssues}
                      />
                    </Td>
                    <Td>
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                      >
                        <StatusChip
                          tone={toneForCredentialStatus(
                            adapter.credentialStatus,
                          )}
                          label={
                            adapter.credentialStatus
                              ? formatPlatformCodeLabel(
                                  locale,
                                  adapter.credentialStatus,
                                )
                              : emptyLabel(locale)
                          }
                          authorityLabel={
                            locale === "en" ? "credential" : "憑證"
                          }
                        />
                        <StatusChip
                          tone={toneForAuthStatus(adapter.authStatus)}
                          label={
                            adapter.authStatus
                              ? formatPlatformCodeLabel(
                                  locale,
                                  adapter.authStatus,
                                )
                              : emptyLabel(locale)
                          }
                          authorityLabel="auth"
                        />
                        <StatusChip
                          tone={toneForWebhookStatus(adapter.webhookStatus)}
                          label={
                            adapter.webhookStatus
                              ? formatPlatformCodeLabel(
                                  locale,
                                  adapter.webhookStatus,
                                )
                              : emptyLabel(locale)
                          }
                          authorityLabel="webhook"
                        />
                      </div>
                    </Td>
                    <Td muted>{formatDateTime(adapter.lastCheckedAt)}</Td>
                    <Td align="right">
                      <Link
                        href="/adapter-registry"
                        style={actionButtonStyle({
                          tone: "secondary",
                          size: "sm",
                        })}
                      >
                        {copy.drillThrough}
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>
          </>
        }
        side={
          <>
            <DataViewCard
              title={copy.postureTitle}
              subtitle={copy.postureSubtitle}
              tone="info"
              summary={copy.postureSummary}
            >
              <DetailMetadataGrid
                columns={1}
                minColumnWidth="100%"
                items={[
                  {
                    id: "critical-alerts",
                    label: t("health.summary.critical"),
                    value: criticalAlerts.toLocaleString(
                      locale === "en" ? "en-US" : "zh-TW",
                    ),
                    tone: criticalAlerts > 0 ? "danger" : "success",
                  },
                  {
                    id: "warning-alerts",
                    label: t("health.summary.warning"),
                    value: warningAlerts.toLocaleString(
                      locale === "en" ? "en-US" : "zh-TW",
                    ),
                    tone: warningAlerts > 0 ? "warning" : "neutral",
                  },
                  {
                    id: "unhealthy-adapters",
                    label: t("health.metric.adapters.title"),
                    value: unhealthyAdapters.toLocaleString(
                      locale === "en" ? "en-US" : "zh-TW",
                    ),
                    tone: unhealthyAdapters > 0 ? "warning" : "success",
                  },
                  {
                    id: "focus-areas",
                    label: copy.focusAreas,
                    value: focusAreas,
                  },
                ]}
              />
            </DataViewCard>

            <WorkflowPanel
              tone="warning"
              eyebrow={copy.eyebrow}
              title={copy.pressureTitle}
              description={copy.pressureDescription}
              footer={
                observability.adapterDetails.length === 0
                  ? copy.noAdapterDetail
                  : undefined
              }
            >
              <DetailMetadataGrid
                columns={1}
                minColumnWidth="100%"
                items={[
                  {
                    id: "forwarded-orders",
                    label: copy.pressureForwarded,
                    value:
                      observability.forwarderOps.totalForwardedOrders.toLocaleString(
                        locale === "en" ? "en-US" : "zh-TW",
                      ),
                  },
                  {
                    id: "sync-failures",
                    label: copy.pressureSyncFailures,
                    value:
                      observability.forwarderOps.syncFailedOrders.toLocaleString(
                        locale === "en" ? "en-US" : "zh-TW",
                      ),
                    tone:
                      observability.forwarderOps.syncFailedOrders > 0
                        ? "danger"
                        : "neutral",
                  },
                  {
                    id: "accept-pending",
                    label: copy.pressureAcceptPending,
                    value:
                      observability.forwarderOps.acceptPendingOrders.toLocaleString(
                        locale === "en" ? "en-US" : "zh-TW",
                      ),
                    tone:
                      observability.forwarderOps.acceptPendingOrders > 0
                        ? "warning"
                        : "neutral",
                  },
                  {
                    id: "reconciliation",
                    label: copy.pressureReconciliation,
                    value:
                      observability.forwarderOps.reconciliationQueue.toLocaleString(
                        locale === "en" ? "en-US" : "zh-TW",
                      ),
                    tone:
                      observability.forwarderOps.reconciliationQueue > 0
                        ? "warning"
                        : "neutral",
                  },
                ]}
              />
            </WorkflowPanel>
          </>
        }
      />
    </div>
  );
}
