"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  formatPlatformUiError,
  toPlatformErrorMessage,
} from "@/lib/error-copy";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  AdapterHealthRecord,
  OperationalAdapterDetailRecord,
  OperationalAlertRecord,
  OperationalObservabilitySnapshot,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

type HealthTabKey = "alerts" | "dispatch" | "webhook" | "filing" | "adapters";

type AdapterInventoryRow = {
  adapter: string;
  source: string;
  kind: string;
  status: AdapterHealthRecord["status"];
  latency: string;
  lastEvent: string;
  orders24h: string;
  note: string;
} & Record<string, unknown>;

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const bodyStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 24,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const detailGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
} satisfies CSSProperties;

const listStyle = {
  display: "flex",
  flexDirection: "column",
} satisfies CSSProperties;

const listRowStyle = (th: CanvasTheme): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 0",
  borderBottom: `1px solid ${th.border}`,
});

const alertTextStyle = {
  flex: 1,
  minWidth: 0,
  fontSize: 12.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const alertMetaStyle = {
  display: "grid",
  gap: 2,
  minWidth: 0,
} satisfies CSSProperties;

const alertSecondaryStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
} satisfies CSSProperties;

const monoMutedStyle = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const emptyStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
  padding: "32px 16px",
} satisfies CSSProperties;

const summaryListStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const summaryRowStyle = (th: CanvasTheme): CSSProperties => ({
  display: "grid",
  gap: 4,
  paddingBottom: 10,
  borderBottom: `1px solid ${th.border}`,
});

const summaryValueStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  color: theme.textDim,
} satisfies CSSProperties;

const tabKeyOrder: HealthTabKey[] = [
  "alerts",
  "dispatch",
  "webhook",
  "filing",
  "adapters",
];

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

function alertTone(
  state: OperationalAlertRecord["state"] | AdapterHealthRecord["status"],
): CanvasTone {
  switch (state) {
    case "critical":
    case "down":
      return "danger";
    case "warning":
    case "degraded":
      return "warn";
    case "healthy":
      return "success";
    default:
      return "neutral";
  }
}

function formatMetricValue(
  locale: "en" | "zh",
  value: number | null,
  unit: "count" | "minutes" | "percent",
): string {
  if (value == null) {
    return "—";
  }
  if (unit === "minutes") {
    return locale === "en" ? `${value} min` : `${value} 分鐘`;
  }
  if (unit === "percent") {
    return `${value}%`;
  }
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function formatAlertMeasure(
  locale: "en" | "zh",
  alert: OperationalAlertRecord,
): string {
  return formatMetricValue(locale, alert.measuredValue, alert.thresholds.unit);
}

function formatAdapterSource(
  locale: "en" | "zh",
  platformCode: string,
): string {
  const normalized = platformCode.replace(/[_-]+/g, " ").trim();
  const title = normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return locale === "en"
    ? title
    : `${formatPlatformCodeLabel(locale, platformCode)}通道`;
}

function statusLabel(locale: "en" | "zh", status: string): string {
  return formatPlatformCodeLabel(locale, status);
}

function formatAlertTitle(
  locale: "en" | "zh",
  key: OperationalAlertRecord["key"],
): string {
  const labels: Record<
    OperationalAlertRecord["key"],
    { en: string; zh: string }
  > = {
    dispatch_lag: {
      en: "Dispatch lag exceeded threshold",
      zh: "派遣延遲超過門檻",
    },
    recording_backlog: {
      en: "Recording backlog requires review",
      zh: "錄音回補佇列待處理",
    },
    driver_state_lag: {
      en: "Driver state updates are stale",
      zh: "司機狀態更新延遲",
    },
    webhook_failure_burst: {
      en: "Webhook failures spiked",
      zh: "回呼失敗量異常",
    },
    eligibility_review_backlog: {
      en: "Eligibility review backlog increased",
      zh: "資格審核佇列升高",
    },
    adapter_degradation: {
      en: "Adapter degradation detected",
      zh: "介接器健康降級",
    },
  };

  const entry = labels[key];
  return entry ? entry[locale] : key;
}

function formatAlertRoute(
  locale: "en" | "zh",
  routes: OperationalAlertRecord["routes"],
): string {
  const mapped = routes.map(
    (route: OperationalAlertRecord["routes"][number]) => {
      if (locale === "en") {
        return route === "platform" ? "platform" : "ops";
      }
      return route === "platform" ? "平台" : "維運";
    },
  );

  return mapped.join(" · ");
}

function buildAlertHref(alert: OperationalAlertRecord): string {
  switch (alert.key) {
    case "driver_state_lag":
      return "/fleet?tab=drivers";
    case "adapter_degradation":
      return "/adapter-registry";
    default:
      return "/health";
  }
}

function mergeAdapterDetails(
  adapterDetails: OperationalAdapterDetailRecord[],
  fallbackAdapters: AdapterHealthRecord[],
): OperationalAdapterDetailRecord[] {
  if (adapterDetails.length > 0) {
    return adapterDetails;
  }

  return fallbackAdapters.map((adapter) => ({
    platformCode: adapter.platformCode,
    status: adapter.status,
    reason: adapter.reason,
    credentialStatus: adapter.credentialStatus,
    authStatus: adapter.authStatus,
    webhookStatus: adapter.webhookStatus,
    rateLimitStatus: adapter.rateLimitStatus,
    capabilitySummary: adapter.capabilitySummary,
    lastCheckedAt: adapter.lastCheckedAt,
    lastError: adapter.lastError,
    lastWebhookReceivedAt: adapter.lastWebhookReceivedAt,
    lastRateLimitAt: adapter.lastRateLimitAt,
    lastAuthFailureAt: adapter.lastAuthFailureAt,
  }));
}

function buildCanvasTabs(
  activeAlertsCount: number,
  locale: "en" | "zh",
): Record<HealthTabKey, ReactNode> {
  const badge = activeAlertsCount > 0 ? ` · ${activeAlertsCount}` : "";

  return {
    alerts: locale === "en" ? `Alerts${badge}` : `警示${badge}`,
    dispatch: locale === "en" ? "Dispatch" : "派遣",
    webhook: locale === "en" ? "Webhook" : "回呼",
    filing: locale === "en" ? "Filing" : "申報",
    adapters: locale === "en" ? "Adapters" : "介接器",
  };
}

export default function HealthPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [adapters, setAdapters] = useState<AdapterHealthRecord[]>([]);
  const [observability, setObservability] =
    useState<OperationalObservabilitySnapshot>(
      createFallbackObservabilitySnapshot(),
    );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const copy =
    locale === "en"
      ? {
          title: "Platform Health",
          subtitle:
            "Platform-routed alerts, dispatch lag, webhook queue, and adapter health.",
          refresh: "Refresh",
          alertsTitle: "Active Alerts",
          alertsEmpty: "No active alerts. Platform health is within threshold.",
          adaptersTitle: "Adapter Inventory",
          adaptersEmpty: "No adapter health records yet.",
          dispatchTitle: "Dispatch Watch",
          webhookTitle: "Webhook Watch",
          filingTitle: "Filing & Reporting Watch",
          dispatchEmpty:
            "Dispatch lag, queue depth, and redispatch counters are healthy.",
          webhookEmpty:
            "Webhook deliveries are within threshold and no retries need intervention.",
          filingEmpty:
            "Filing, reporting, and eligibility backlogs are within threshold.",
          loadingAlerts: "Loading health signals...",
          loadingAdapters: "Loading adapter inventory...",
          openAlert: "Open",
          metricsNote:
            "Latency and 24h volume will populate when adapter telemetry is exposed by the API.",
          kpis: {
            dispatch: {
              label: "Oldest Ready Lag",
              sub: (count: number) => `${count} lagged orders`,
            },
            webhook: {
              label: "Queued Webhooks",
              sub: (count: number) => `${count} failed in the last hour`,
            },
            eligibility: {
              label: "Eligibility Review Queue",
              sub: (count: number) => `${count} manual reviews`,
            },
            reporting: {
              label: "Failed Jobs (24h)",
              sub: (count: number) => `${count} jobs queued`,
            },
          },
          adapterColumns: {
            adapter: "Adapter",
            source: "Source",
            kind: "Mode",
            status: "Status",
            latency: "Latency",
            lastEvent: "Last Event",
            orders24h: "Orders 24h",
          },
          summary: {
            readyQueueDepth: "Ready Queue Depth",
            redispatchOrders: "Redispatch Orders",
            exceptionHolds: "Exception Holds",
            dispatchFailedOrders: "Dispatch Failed Orders",
            activeEndpoints: "Active Endpoints",
            disabledEndpoints: "Disabled Endpoints",
            queuedDeliveries: "Queued Deliveries",
            oldestQueuedLag: "Oldest Queued Lag",
            reportingQueuedJobs: "Reporting Queued Jobs",
            recordingBacklog: "Recording Backlog",
            manualReviewQueue: "Manual Review Queue",
            eligibilityFailures24h: "Eligibility Failures 24h",
          },
          refreshErrorTitle: "Unable to refresh platform health",
          entries: "entries",
        }
      : {
          title: "平台健康",
          subtitle: "平台層警示、派遣延遲、回呼佇列與介接器健康總覽。",
          refresh: "重新整理",
          alertsTitle: "有效警示",
          alertsEmpty: "目前沒有有效告警，平台指標都在門檻內。",
          adaptersTitle: "介接器盤點",
          adaptersEmpty: "目前沒有介接器健康紀錄。",
          dispatchTitle: "派遣監看",
          webhookTitle: "回呼監看",
          filingTitle: "申報與報表監看",
          dispatchEmpty: "派遣延遲、佇列深度與重新派遣指標都在門檻內。",
          webhookEmpty: "回呼投遞與重試都在門檻內，暫時不需人工介入。",
          filingEmpty: "申報、報表與資格審查積壓都在門檻內。",
          loadingAlerts: "正在載入健康訊號...",
          loadingAdapters: "正在載入介接器盤點...",
          openAlert: "查看",
          metricsNote: "當介接器遙測資料可用後，延遲與 24 小時量能會補齊。",
          kpis: {
            dispatch: {
              label: "最久待派延遲",
              sub: (count: number) => `${count} 筆延遲訂單`,
            },
            webhook: {
              label: "回呼佇列",
              sub: (count: number) => `近 1 小時失敗 ${count} 筆`,
            },
            eligibility: {
              label: "資格審查佇列",
              sub: (count: number) => `${count} 筆人工審核`,
            },
            reporting: {
              label: "24 小時報表失敗",
              sub: (count: number) => `${count} 筆工作仍在佇列`,
            },
          },
          adapterColumns: {
            adapter: "介接器",
            source: "來源",
            kind: "模式",
            status: "狀態",
            latency: "延遲",
            lastEvent: "最後事件",
            orders24h: "24 小時訂單",
          },
          summary: {
            readyQueueDepth: "待派佇列深度",
            redispatchOrders: "重新派遣訂單",
            exceptionHolds: "例外保留",
            dispatchFailedOrders: "派遣失敗訂單",
            activeEndpoints: "啟用中的端點",
            disabledEndpoints: "停用端點",
            queuedDeliveries: "排隊中的投遞",
            oldestQueuedLag: "最久排隊延遲",
            reportingQueuedJobs: "排隊中的報表工作",
            recordingBacklog: "錄音回補積壓",
            manualReviewQueue: "人工審查佇列",
            eligibilityFailures24h: "24 小時資格失敗",
          },
          refreshErrorTitle: "無法更新平台健康資料",
          entries: "筆",
        };

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
    } catch (caughtError: unknown) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(caughtError),
          locale === "en"
            ? "Platform health data unavailable"
            : "平台健康資料暫時無法載入",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const platformAlertKeys = useMemo(
    () =>
      new Set(
        observability.roleViews.find(
          (view: OperationalObservabilitySnapshot["roleViews"][number]) =>
            view.route === "platform",
        )?.alertKeys ?? [],
      ),
    [observability.roleViews],
  );

  const platformAlerts = useMemo(
    () =>
      observability.alerts
        .filter(
          (alert: OperationalAlertRecord) =>
            platformAlertKeys.has(alert.key) ||
            alert.routes.includes("platform"),
        )
        .sort(
          (left: OperationalAlertRecord, right: OperationalAlertRecord) =>
            ALERT_SEVERITY_ORDER[left.state] -
            ALERT_SEVERITY_ORDER[right.state],
        ),
    [observability.alerts, platformAlertKeys],
  );

  const activeAlerts = useMemo(
    () =>
      platformAlerts.filter(
        (alert: OperationalAlertRecord) => alert.state !== "healthy",
      ),
    [platformAlerts],
  );

  const adapterRows = useMemo<AdapterInventoryRow[]>(() => {
    const merged = mergeAdapterDetails(observability.adapterDetails, adapters);
    const fallbackOrders =
      merged.length > 0
        ? Math.floor(
            observability.forwarderOps.totalForwardedOrders / merged.length,
          )
        : 0;

    return merged.map((adapter) => ({
      adapter: adapter.platformCode,
      source: formatAdapterSource(locale, adapter.platformCode),
      kind: formatPlatformCodeLabel(locale, adapter.capabilitySummary.mode),
      status: adapter.status,
      latency: "—",
      lastEvent: formatDateTime(
        adapter.lastWebhookReceivedAt ??
          adapter.lastRateLimitAt ??
          adapter.lastAuthFailureAt ??
          adapter.lastCheckedAt,
      ),
      orders24h:
        fallbackOrders > 0
          ? fallbackOrders.toLocaleString(locale === "en" ? "en-US" : "zh-TW")
          : "—",
      note: adapter.lastError
        ? locale === "en"
          ? adapter.lastError
          : "已偵測到介接器錯誤，請查看原始事件。"
        : formatPlatformCodeLabel(locale, adapter.reason),
    }));
  }, [
    adapters,
    locale,
    observability.adapterDetails,
    observability.forwarderOps.totalForwardedOrders,
  ]);

  const adapterColumns = useMemo<CanvasTableColumn<AdapterInventoryRow>[]>(
    () => [
      { h: copy.adapterColumns.adapter, k: "adapter", mono: true, w: 132 },
      {
        h: copy.adapterColumns.source,
        w: 208,
        r: (row) => (
          <div style={{ display: "grid", gap: 3 }}>
            <span>{row.source}</span>
            <span style={monoMutedStyle}>{row.note}</span>
          </div>
        ),
      },
      { h: copy.adapterColumns.kind, k: "kind", mono: true, w: 104 },
      {
        h: copy.adapterColumns.status,
        w: 132,
        r: (row) => (
          <CanvasPill theme={theme} tone={alertTone(row.status)} dot>
            {statusLabel(locale, row.status)}
          </CanvasPill>
        ),
      },
      {
        h: copy.adapterColumns.latency,
        k: "latency",
        mono: true,
        align: "right",
        w: 108,
      },
      { h: copy.adapterColumns.lastEvent, k: "lastEvent", mono: true, w: 156 },
      {
        h: copy.adapterColumns.orders24h,
        k: "orders24h",
        mono: true,
        align: "right",
        w: 110,
      },
    ],
    [copy.adapterColumns, locale],
  );

  const tabNodes = useMemo(
    () => buildCanvasTabs(activeAlerts.length, locale),
    [activeAlerts.length, locale],
  );

  const dispatchSummary = [
    {
      label: copy.summary.readyQueueDepth,
      value: formatMetricValue(
        locale,
        observability.dispatch.queueDepth,
        "count",
      ),
    },
    {
      label: copy.summary.redispatchOrders,
      value: formatMetricValue(
        locale,
        observability.dispatch.redispatchOrders,
        "count",
      ),
    },
    {
      label: copy.summary.exceptionHolds,
      value: formatMetricValue(
        locale,
        observability.dispatch.exceptionHoldOrders,
        "count",
      ),
    },
    {
      label: copy.summary.dispatchFailedOrders,
      value: formatMetricValue(
        locale,
        observability.dispatch.dispatchFailedOrders,
        "count",
      ),
    },
  ];

  const webhookSummary = [
    {
      label: copy.summary.activeEndpoints,
      value: formatMetricValue(
        locale,
        observability.webhook.activeEndpoints,
        "count",
      ),
    },
    {
      label: copy.summary.disabledEndpoints,
      value: formatMetricValue(
        locale,
        observability.webhook.disabledEndpoints,
        "count",
      ),
    },
    {
      label: copy.summary.queuedDeliveries,
      value: formatMetricValue(
        locale,
        observability.webhook.queuedDeliveries,
        "count",
      ),
    },
    {
      label: copy.summary.oldestQueuedLag,
      value: formatMetricValue(
        locale,
        observability.webhook.oldestQueuedDeliveryLagMinutes,
        "minutes",
      ),
    },
  ];

  const filingSummary = [
    {
      label: copy.summary.reportingQueuedJobs,
      value: formatMetricValue(
        locale,
        observability.reporting.queuedJobs,
        "count",
      ),
    },
    {
      label: copy.summary.recordingBacklog,
      value: formatMetricValue(
        locale,
        observability.recording.pendingOrders,
        "count",
      ),
    },
    {
      label: copy.summary.manualReviewQueue,
      value: formatMetricValue(
        locale,
        observability.eligibility.manualReviewQueue,
        "count",
      ),
    },
    {
      label: copy.summary.eligibilityFailures24h,
      value: formatMetricValue(
        locale,
        observability.eligibility.recentFailureCount24h,
        "count",
      ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={tabKeyOrder.map((key) => tabNodes[key])}
        activeTab={tabNodes.alerts}
        actions={
          <CanvasBtn
            theme={theme}
            icon="refresh"
            onClick={() => void loadData()}
            disabled={loading}
          >
            {copy.refresh}
          </CanvasBtn>
        }
      />

      <div style={bodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.refreshErrorTitle}
            body={error}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label={copy.kpis.dispatch.label}
            value={formatMetricValue(
              locale,
              observability.dispatch.oldestReadyOrderLagMinutes,
              "minutes",
            )}
            delta={
              observability.dispatch.oldestReadyOrderLagMinutes != null
                ? "watch"
                : "ok"
            }
            deltaTone={
              observability.dispatch.oldestReadyOrderLagMinutes != null
                ? "down"
                : "up"
            }
            sub={copy.kpis.dispatch.sub(observability.dispatch.laggedOrders)}
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpis.webhook.label}
            value={formatMetricValue(
              locale,
              observability.webhook.queuedDeliveries,
              "count",
            )}
            delta={
              observability.webhook.failedDeliveriesLastHour > 0
                ? `↑ ${observability.webhook.failedDeliveriesLastHour}`
                : "ok"
            }
            deltaTone={
              observability.webhook.failedDeliveriesLastHour > 0 ? "down" : "up"
            }
            sub={copy.kpis.webhook.sub(
              observability.webhook.failedDeliveriesLastHour,
            )}
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpis.eligibility.label}
            value={formatMetricValue(
              locale,
              observability.eligibility.totalReviewQueue,
              "count",
            )}
            sub={copy.kpis.eligibility.sub(
              observability.eligibility.manualReviewQueue,
            )}
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpis.reporting.label}
            value={formatMetricValue(
              locale,
              observability.reporting.failedJobs,
              "count",
            )}
            delta={observability.reporting.failedJobs > 0 ? "attention" : "ok"}
            deltaTone={observability.reporting.failedJobs > 0 ? "down" : "up"}
            sub={copy.kpis.reporting.sub(observability.reporting.queuedJobs)}
          />
        </div>

        <div style={detailGridStyle}>
          <CanvasCard theme={theme} title={copy.alertsTitle}>
            {loading ? (
              <div style={emptyStateStyle}>{copy.loadingAlerts}</div>
            ) : activeAlerts.length === 0 ? (
              <div style={emptyStateStyle}>{copy.alertsEmpty}</div>
            ) : (
              <div style={listStyle}>
                {activeAlerts.map(
                  (alert: OperationalAlertRecord, index: number) => {
                    const measured = formatAlertMeasure(locale, alert);
                    const threshold = formatMetricValue(
                      locale,
                      alert.thresholds.critical,
                      alert.thresholds.unit,
                    );
                    return (
                      <div
                        key={alert.key}
                        style={{
                          ...listRowStyle(theme),
                          borderBottom:
                            index === activeAlerts.length - 1
                              ? "none"
                              : `1px solid ${theme.border}`,
                        }}
                      >
                        <CanvasPill
                          theme={theme}
                          tone={alertTone(alert.state)}
                          dot
                        >
                          {formatAlertRoute(locale, alert.routes)}
                        </CanvasPill>
                        <div style={alertTextStyle}>
                          <div style={alertMetaStyle}>
                            <span>{formatAlertTitle(locale, alert.key)}</span>
                            <span style={alertSecondaryStyle}>
                              {locale === "en"
                                ? `${measured} measured · critical at ${threshold}`
                                : `目前 ${measured} · 重大門檻 ${threshold}`}
                            </span>
                          </div>
                        </div>
                        <span style={monoMutedStyle}>
                          {formatDateTime(alert.observedAt)}
                        </span>
                        <CanvasBtn
                          theme={theme}
                          variant="ghost"
                          icon="ext"
                          size="xs"
                          onClick={() => {
                            window.location.href = buildAlertHref(alert);
                          }}
                        >
                          {copy.openAlert}
                        </CanvasBtn>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy.dispatchTitle}
            subtitle={copy.dispatchEmpty}
          >
            <div style={summaryListStyle}>
              {dispatchSummary.map((item, index) => (
                <div
                  key={item.label}
                  style={{
                    ...summaryRowStyle(theme),
                    borderBottom:
                      index === dispatchSummary.length - 1
                        ? "none"
                        : `1px solid ${theme.border}`,
                    paddingBottom:
                      index === dispatchSummary.length - 1 ? 0 : 10,
                  }}
                >
                  <span>{item.label}</span>
                  <span style={summaryValueStyle}>{item.value}</span>
                </div>
              ))}
            </div>
          </CanvasCard>
        </div>

        <div style={detailGridStyle}>
          <CanvasCard
            theme={theme}
            title={copy.webhookTitle}
            subtitle={copy.webhookEmpty}
          >
            <div style={summaryListStyle}>
              {webhookSummary.map((item, index) => (
                <div
                  key={item.label}
                  style={{
                    ...summaryRowStyle(theme),
                    borderBottom:
                      index === webhookSummary.length - 1
                        ? "none"
                        : `1px solid ${theme.border}`,
                    paddingBottom: index === webhookSummary.length - 1 ? 0 : 10,
                  }}
                >
                  <span>{item.label}</span>
                  <span style={summaryValueStyle}>{item.value}</span>
                </div>
              ))}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy.filingTitle}
            subtitle={copy.filingEmpty}
          >
            <div style={summaryListStyle}>
              {filingSummary.map((item, index) => (
                <div
                  key={item.label}
                  style={{
                    ...summaryRowStyle(theme),
                    borderBottom:
                      index === filingSummary.length - 1
                        ? "none"
                        : `1px solid ${theme.border}`,
                    paddingBottom: index === filingSummary.length - 1 ? 0 : 10,
                  }}
                >
                  <span>{item.label}</span>
                  <span style={summaryValueStyle}>{item.value}</span>
                </div>
              ))}
            </div>
          </CanvasCard>
        </div>

        <CanvasCard
          theme={theme}
          title={`${copy.adaptersTitle} · ${adapterRows.length} ${copy.entries}`}
          subtitle={copy.metricsNote}
          padding={0}
        >
          {loading ? (
            <div style={emptyStateStyle}>{copy.loadingAdapters}</div>
          ) : adapterRows.length === 0 ? (
            <div style={emptyStateStyle}>{copy.adaptersEmpty}</div>
          ) : (
            <CanvasTable
              theme={theme}
              columns={adapterColumns}
              rows={adapterRows}
            />
          )}
        </CanvasCard>
      </div>
    </>
  );
}
