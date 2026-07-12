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
import { useTranslation } from "@/lib/i18n";
import {
  formatHealthAdapterSource,
  formatHealthMetricValue,
  getHealthAlertRouteLabel,
  getHealthAlertTitle,
  getHealthPageCopy,
  getHealthStatusLabel,
} from "@/lib/translations";
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
    mapGeofence: {
      providerHealth: {
        status: "unknown",
        provider: null,
        mode: null,
        failClosed: false,
        lastCheckedAt: null,
        quota: {
          dailyLimit: null,
          minuteLimit: null,
          dailyUsed: null,
          minuteUsed: null,
          usagePercent: null,
          status: "unknown",
          warningThresholdPercent: null,
          criticalThresholdPercent: null,
          policy: null,
        },
      },
      geo: {
        providerOutageCount: 0,
        addressAmbiguityCount: 0,
        coordinateLessAttemptCount: 0,
        manualOverrideCount: 0,
        resolvedAddressCount: 0,
        requests: {
          total: 0,
          successful: 0,
          providerErrorCount: 0,
          successRatePercent: null,
          byOperation: {
            search: 0,
            resolve: 0,
            reverse: 0,
          },
          byResult: {
            resolved: 0,
            manualOverride: 0,
            addressAmbiguity: 0,
            coordinateLessAttempt: 0,
            providerOutage: 0,
          },
        },
        latencyMs: {
          count: 0,
          average: null,
          max: null,
          p95: null,
        },
      },
      serviceArea: {
        evaluations: 0,
        serviceableCount: 0,
        manualReviewCount: 0,
        policyDenialCount: 0,
        outOfAreaCount: 0,
        coordinateLessAttemptCount: 0,
      },
      governance: {
        geometryMutationCount: 0,
        serviceAreaPublishedCount: 0,
        serviceAreaRetiredCount: 0,
        stopPolicyPublishedCount: 0,
        stopPolicyRetiredCount: 0,
        manualOverrideCount: 0,
      },
      lastEventAt: null,
    },
    adapterDetails: [],
    phase2SandboxKpiDashboard: null,
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

function formatAlertMeasure(
  locale: "en" | "zh",
  alert: OperationalAlertRecord,
): string {
  return formatHealthMetricValue(
    locale,
    alert.measuredValue,
    alert.thresholds.unit,
  );
}

function formatAlertTitle(
  locale: "en" | "zh",
  key: OperationalAlertRecord["key"],
): string {
  return getHealthAlertTitle(locale, key);
}

function formatAlertRoute(
  locale: "en" | "zh",
  routes: OperationalAlertRecord["routes"],
): string {
  return routes
    .map((route) => getHealthAlertRouteLabel(locale, route))
    .join(" · ");
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
  copy: ReturnType<typeof getHealthPageCopy>,
): Record<HealthTabKey, ReactNode> {
  const suffix = activeAlertsCount > 0 ? ` · ${activeAlertsCount}` : "";

  return {
    alerts: copy.tab.alertsWithCount(suffix),
    dispatch: copy.tab.dispatch,
    webhook: copy.tab.webhook,
    filing: copy.tab.filing,
    adapters: copy.tab.adapters,
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

  const copy = useMemo(() => getHealthPageCopy(locale), [locale]);

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
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
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
      source: formatHealthAdapterSource(locale, adapter.platformCode),
      kind: adapter.capabilitySummary.mode.toUpperCase(),
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
          ? formatHealthMetricValue(locale, fallbackOrders, "count")
          : "—",
      note: adapter.lastError ?? getHealthStatusLabel(locale, adapter.reason),
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
            {getHealthStatusLabel(locale, row.status)}
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
    () => buildCanvasTabs(activeAlerts.length, copy),
    [activeAlerts.length, copy],
  );

  const dispatchSummary = [
    {
      label: copy.summary.dispatch.queueDepth,
      value: formatHealthMetricValue(
        locale,
        observability.dispatch.queueDepth,
        "count",
      ),
    },
    {
      label: copy.summary.dispatch.redispatchOrders,
      value: formatHealthMetricValue(
        locale,
        observability.dispatch.redispatchOrders,
        "count",
      ),
    },
    {
      label: copy.summary.dispatch.exceptionHolds,
      value: formatHealthMetricValue(
        locale,
        observability.dispatch.exceptionHoldOrders,
        "count",
      ),
    },
    {
      label: copy.summary.dispatch.failedOrders,
      value: formatHealthMetricValue(
        locale,
        observability.dispatch.dispatchFailedOrders,
        "count",
      ),
    },
  ];

  const webhookSummary = [
    {
      label: copy.summary.webhook.activeEndpoints,
      value: formatHealthMetricValue(
        locale,
        observability.webhook.activeEndpoints,
        "count",
      ),
    },
    {
      label: copy.summary.webhook.disabledEndpoints,
      value: formatHealthMetricValue(
        locale,
        observability.webhook.disabledEndpoints,
        "count",
      ),
    },
    {
      label: copy.summary.webhook.queuedDeliveries,
      value: formatHealthMetricValue(
        locale,
        observability.webhook.queuedDeliveries,
        "count",
      ),
    },
    {
      label: copy.summary.webhook.oldestQueuedLag,
      value: formatHealthMetricValue(
        locale,
        observability.webhook.oldestQueuedDeliveryLagMinutes,
        "minutes",
      ),
    },
  ];

  const filingSummary = [
    {
      label: copy.summary.filing.reportingQueuedJobs,
      value: formatHealthMetricValue(
        locale,
        observability.reporting.queuedJobs,
        "count",
      ),
    },
    {
      label: copy.summary.filing.recordingBacklog,
      value: formatHealthMetricValue(
        locale,
        observability.recording.pendingOrders,
        "count",
      ),
    },
    {
      label: copy.summary.filing.manualReviewQueue,
      value: formatHealthMetricValue(
        locale,
        observability.eligibility.manualReviewQueue,
        "count",
      ),
    },
    {
      label: copy.summary.filing.eligibilityFailures24h,
      value: formatHealthMetricValue(
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
            title={copy.refreshError}
            body={error}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label={copy.kpis.dispatch.label}
            value={formatHealthMetricValue(
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
            value={formatHealthMetricValue(
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
            value={formatHealthMetricValue(
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
            value={formatHealthMetricValue(
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
                    const threshold = formatHealthMetricValue(
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
                              {copy.alertMeasurement({
                                measured,
                                threshold,
                              })}
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
          title={`${copy.adaptersTitle} · ${copy.adapterEntries(adapterRows.length)}`}
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
