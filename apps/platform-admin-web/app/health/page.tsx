"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  AdapterHealthRecord,
  OperationalAlertRecord,
  OperationalObservabilitySnapshot,
  PlatformAdapter,
} from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

const PAGE_THEME = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

const ALERT_SEVERITY_ORDER = {
  critical: 0,
  warning: 1,
  healthy: 2,
} as const;

const SERVICE_STATUS_ORDER = {
  down: 0,
  degraded: 1,
  healthy: 2,
} as const;

type AdapterPreviewRecord = {
  platformCode: string;
  status: AdapterHealthRecord["status"];
  reason: AdapterHealthRecord["reason"];
  credentialStatus: AdapterHealthRecord["credentialStatus"];
  authStatus: AdapterHealthRecord["authStatus"];
  webhookStatus: AdapterHealthRecord["webhookStatus"];
  rateLimitStatus: AdapterHealthRecord["rateLimitStatus"];
  capabilitySummary: AdapterHealthRecord["capabilitySummary"];
  lastCheckedAt: string;
  lastError: string | null;
  lastWebhookReceivedAt: string | null;
  lastRateLimitAt: string | null;
  lastAuthFailureAt: string | null;
};

type ServiceGridRow = Record<string, unknown> & {
  adapter: string;
  source: string;
  sourceNote: string;
  kind: string;
  kindNote: string;
  status: AdapterPreviewRecord["status"];
  latency: string;
  lastEvent: string;
  controls: AdapterPreviewRecord | null;
};

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

function formatCount(value: number, locale: "en" | "zh") {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function formatAlertValue(
  value: number,
  unit: "count" | "minutes" | "percent",
  locale: "en" | "zh",
) {
  if (unit === "percent") {
    return `${value}%`;
  }

  if (unit === "minutes") {
    const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return locale === "en" ? `${rounded}m` : `${rounded} 分`;
  }

  return formatCount(value, locale);
}

function formatAgeSince(
  value: string | null | undefined,
  locale: "en" | "zh",
): string {
  if (!value) {
    return "—";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "—";
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (elapsedSeconds < 60) {
    return locale === "en" ? `${elapsedSeconds}s` : `${elapsedSeconds} 秒`;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  if (minutes < 60) {
    return locale === "en"
      ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
      : `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return locale === "en"
    ? `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`
    : `${hours} 時 ${String(remainingMinutes).padStart(2, "0")} 分`;
}

function formatAlertBadge(
  alert: OperationalAlertRecord,
  locale: "en" | "zh",
): string {
  if (alert.thresholds.unit === "count") {
    return `x${Math.round(alert.measuredValue)}`;
  }

  return formatAlertValue(alert.measuredValue, alert.thresholds.unit, locale);
}

function alertTone(state: OperationalAlertRecord["state"]): CanvasTone {
  switch (state) {
    case "critical":
      return "danger";
    case "warning":
      return "warn";
    case "healthy":
    default:
      return "success";
  }
}

function serviceTone(status: AdapterPreviewRecord["status"]): CanvasTone {
  switch (status) {
    case "down":
      return "danger";
    case "degraded":
      return "warn";
    case "healthy":
    default:
      return "success";
  }
}

function credentialTone(
  status: AdapterPreviewRecord["credentialStatus"],
): CanvasTone {
  switch (status) {
    case "invalid":
    case "expired":
      return "danger";
    case "not_configured":
      return "warn";
    case "valid":
      return "success";
    default:
      return "neutral";
  }
}

function authTone(status: AdapterPreviewRecord["authStatus"]): CanvasTone {
  switch (status) {
    case "invalid":
      return "danger";
    case "reauth_required":
      return "warn";
    case "authenticated":
      return "success";
    default:
      return "neutral";
  }
}

function webhookTone(
  status: AdapterPreviewRecord["webhookStatus"],
): CanvasTone {
  switch (status) {
    case "failing":
      return "danger";
    case "not_configured":
      return "warn";
    case "healthy":
      return "success";
    default:
      return "neutral";
  }
}

function registryStatusToServiceStatus(
  status: PlatformAdapter["healthStatus"]["status"] | undefined,
): AdapterPreviewRecord["status"] {
  switch (status) {
    case "UNHEALTHY":
      return "down";
    case "DEGRADED":
      return "degraded";
    case "HEALTHY":
    default:
      return "healthy";
  }
}

function lastEventLabel(
  preview: AdapterPreviewRecord | null,
  registry: PlatformAdapter | null,
) {
  return (
    preview?.lastWebhookReceivedAt ??
    preview?.lastCheckedAt ??
    registry?.updatedAt ??
    ""
  );
}

function detailLineStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    marginTop: 2,
    fontSize: 11,
    color: theme.textDim,
    lineHeight: 1.35,
  };
}

function emptyBlockStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    padding: "18px 16px",
    color: theme.textMuted,
    fontSize: 12.5,
  };
}

function pageRootStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    minHeight: "100%",
    background: theme.bg,
    color: theme.text,
  };
}

const pageContentStyle: React.CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const kpiGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
  gap: 12,
};

const cardStackStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
};

export default function HealthPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [registry, setRegistry] = useState<PlatformAdapter[]>([]);
  const [liveHealth, setLiveHealth] = useState<AdapterHealthRecord[]>([]);
  const [observability, setObservability] =
    useState<OperationalObservabilitySnapshot>(
      createFallbackObservabilitySnapshot(),
    );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");

  const copy =
    locale === "en"
      ? {
          title: "Platform Health",
          subtitle:
            "alert list · dispatch lag · webhook queue · eligibility queue · reporting · adapters",
          refresh: "Refresh",
          retry: "Retry",
          openRegistry: "Open registry",
          loading: "Loading platform health...",
          activeAlertsTitle: "Active alerts",
          activeAlertsSubtitle: "Cross-module alert posture",
          adapterInventoryTitle: "Adapter inventory",
          adapterInventorySubtitle: "service status grid · live controls state",
          noAlerts: "No platform-scoped alert is active right now.",
          noAdapters: "No adapter health record was returned.",
          noIssue: "No active issue reported.",
          warnBadge: (count: number) => `${count} warn`,
          criticalBadge: (count: number) => `${count} critical`,
          okBadge: "0 warn",
          errorTitle: "Platform health data is partially unavailable.",
          kpiDispatchSub: (queueDepth: number) =>
            `ready queue ${formatCount(queueDepth, locale)}`,
          kpiWebhookSub: (lag: number | null) =>
            lag === null
              ? "p95 —"
              : `p95 ${formatAlertValue(lag, "minutes", locale)}`,
          kpiEligibilitySub: (count: number) =>
            `${formatCount(count, locale)} manual review`,
          kpiReportingSub: (count: number) =>
            `${formatCount(count, locale)} queued`,
          rowOpen: "Open",
        }
      : {
          title: "平台健康",
          subtitle:
            "alert list · dispatch lag · webhook queue · eligibility queue · reporting · adapters",
          refresh: "重整",
          retry: "重試",
          openRegistry: "查看 registry",
          loading: "載入平台健康資料中...",
          activeAlertsTitle: "Active alerts",
          activeAlertsSubtitle: "跨模組告警總覽",
          adapterInventoryTitle: "Adapter inventory",
          adapterInventorySubtitle: "service status grid · live controls state",
          noAlerts: "目前沒有平台範圍的 active alert。",
          noAdapters: "目前沒有 adapter 健康記錄。",
          noIssue: "目前沒有回報異常。",
          warnBadge: (count: number) => `${count} warn`,
          criticalBadge: (count: number) => `${count} critical`,
          okBadge: "0 warn",
          errorTitle: "平台健康資料目前僅部分可用。",
          kpiDispatchSub: (queueDepth: number) =>
            `ready queue ${formatCount(queueDepth, locale)}`,
          kpiWebhookSub: (lag: number | null) =>
            lag === null
              ? "p95 —"
              : `p95 ${formatAlertValue(lag, "minutes", locale)}`,
          kpiEligibilitySub: (count: number) =>
            `${formatCount(count, locale)} 筆 manual review`,
          kpiReportingSub: (count: number) =>
            `${formatCount(count, locale)} 筆 queued`,
          rowOpen: "查看",
        };

  const loadData = useCallback(async () => {
    setLoading(true);

    const [liveHealthResult, observabilityResult, registryResult] =
      await Promise.allSettled([
        client.getForwarderAdaptersHealth() as Promise<AdapterHealthRecord[]>,
        client.getOperationalObservability(),
        client.listPlatformAdapters() as Promise<PlatformAdapter[]>,
      ]);

    const failures: string[] = [];

    if (liveHealthResult.status === "fulfilled") {
      setLiveHealth(liveHealthResult.value);
    } else {
      setLiveHealth([]);
      failures.push(
        liveHealthResult.reason instanceof Error
          ? liveHealthResult.reason.message
          : String(liveHealthResult.reason),
      );
    }

    if (observabilityResult.status === "fulfilled") {
      setObservability(observabilityResult.value);
    } else {
      setObservability(createFallbackObservabilitySnapshot());
      failures.push(
        observabilityResult.reason instanceof Error
          ? observabilityResult.reason.message
          : String(observabilityResult.reason),
      );
    }

    if (registryResult.status === "fulfilled") {
      setRegistry(registryResult.value);
    } else {
      setRegistry([]);
      failures.push(
        registryResult.reason instanceof Error
          ? registryResult.reason.message
          : String(registryResult.reason),
      );
    }

    setLastRefresh(new Date().toISOString());
    setError(failures[0] ?? null);
    setLoading(false);
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const platformAlerts = useMemo(() => {
    const platformView = observability.roleViews.find(
      (view) => view.route === "platform",
    );
    const platformAlertKeys = new Set(platformView?.alertKeys ?? []);

    return [...observability.alerts]
      .filter(
        (alert) =>
          platformAlertKeys.has(alert.key) || alert.routes.includes("platform"),
      )
      .sort(
        (left, right) =>
          ALERT_SEVERITY_ORDER[left.state] - ALERT_SEVERITY_ORDER[right.state],
      );
  }, [observability.alerts, observability.roleViews]);

  const adapterPreview = useMemo<AdapterPreviewRecord[]>(() => {
    const source =
      observability.adapterDetails.length > 0
        ? observability.adapterDetails
        : liveHealth;

    return source.map((detail) => ({
      platformCode: detail.platformCode,
      status: detail.status,
      reason: detail.reason,
      credentialStatus: detail.credentialStatus,
      authStatus: detail.authStatus,
      webhookStatus: detail.webhookStatus,
      rateLimitStatus: detail.rateLimitStatus,
      capabilitySummary: detail.capabilitySummary,
      lastCheckedAt: detail.lastCheckedAt,
      lastError: detail.lastError,
      lastWebhookReceivedAt: detail.lastWebhookReceivedAt,
      lastRateLimitAt: detail.lastRateLimitAt,
      lastAuthFailureAt: detail.lastAuthFailureAt,
    }));
  }, [liveHealth, observability.adapterDetails]);

  const criticalAlerts = platformAlerts.filter(
    (alert) => alert.state === "critical",
  ).length;
  const warningAlerts = platformAlerts.filter(
    (alert) => alert.state === "warning",
  ).length;

  const badgeLabel =
    warningAlerts > 0
      ? copy.warnBadge(warningAlerts)
      : criticalAlerts > 0
        ? copy.criticalBadge(criticalAlerts)
        : copy.okBadge;

  const badgeTone: CanvasTone =
    warningAlerts > 0 ? "warn" : criticalAlerts > 0 ? "danger" : "success";

  const serviceRows = useMemo<ServiceGridRow[]>(() => {
    const registryByCode = new Map(
      registry.map((adapter) => [adapter.platformCode, adapter]),
    );
    const previewByCode = new Map(
      adapterPreview.map((adapter) => [adapter.platformCode, adapter]),
    );
    const codes = Array.from(
      new Set([...registryByCode.keys(), ...previewByCode.keys()]),
    );

    return codes
      .map((code) => {
        const registryRecord = registryByCode.get(code) ?? null;
        const previewRecord = previewByCode.get(code) ?? null;
        const lastEvent = lastEventLabel(previewRecord, registryRecord);
        const sourceLabel =
          registryRecord?.name?.trim() || formatPlatformCodeLabel(locale, code);
        const kindLabel =
          registryRecord?.adapterType ??
          previewRecord?.capabilitySummary.mode.toUpperCase() ??
          "—";
        const kindNote = [
          previewRecord?.capabilitySummary.mode,
          registryRecord?.isForwarded ? "forwarded" : "owned",
          previewRecord?.capabilitySummary.productionStatus,
        ]
          .filter(Boolean)
          .join(" · ");

        return {
          adapter: code,
          source: sourceLabel,
          sourceNote:
            previewRecord?.lastError ??
            previewRecord?.capabilitySummary.notes[0] ??
            registryRecord?.description ??
            copy.noIssue,
          kind: kindLabel,
          kindNote: kindNote || "—",
          status:
            previewRecord?.status ??
            registryStatusToServiceStatus(registryRecord?.healthStatus.status),
          latency: formatAgeSince(previewRecord?.lastCheckedAt, locale),
          lastEvent: lastEvent ? formatDateTime(lastEvent) : "—",
          controls: previewRecord,
        };
      })
      .sort((left, right) => {
        const statusDiff =
          SERVICE_STATUS_ORDER[left.status] -
          SERVICE_STATUS_ORDER[right.status];
        if (statusDiff !== 0) {
          return statusDiff;
        }
        return left.adapter.localeCompare(right.adapter);
      });
  }, [adapterPreview, copy.noIssue, locale, registry]);

  const metricCards: Array<{
    id: string;
    label: string;
    value: string;
    delta?: string;
    deltaTone?: "up" | "down" | "neutral";
    sub?: string;
  }> = [
    {
      id: "dispatch",
      label: "dispatch lag p95",
      value: formatAlertValue(
        observability.dispatch.oldestReadyOrderLagMinutes ?? 0,
        "minutes",
        locale,
      ),
      delta:
        observability.dispatch.laggedOrders > 0
          ? `↑ ${formatCount(observability.dispatch.laggedOrders, locale)}`
          : "ok < 5m",
      deltaTone:
        observability.dispatch.laggedOrders > 0
          ? ("down" as const)
          : ("up" as const),
      sub: copy.kpiDispatchSub(observability.dispatch.queueDepth),
    },
    {
      id: "webhook",
      label: "webhook queue",
      value: formatCount(observability.webhook.queuedDeliveries, locale),
      delta:
        observability.webhook.failedDeliveriesLastHour > 0
          ? `↑ ${formatCount(observability.webhook.failedDeliveriesLastHour, locale)}`
          : "ok",
      deltaTone:
        observability.webhook.failedDeliveriesLastHour > 0
          ? ("down" as const)
          : ("up" as const),
      sub: copy.kpiWebhookSub(
        observability.webhook.oldestQueuedDeliveryLagMinutes,
      ),
    },
    {
      id: "eligibility",
      label: "eligibility queue",
      value: formatCount(observability.eligibility.totalReviewQueue, locale),
      sub: copy.kpiEligibilitySub(observability.eligibility.manualReviewQueue),
    },
    {
      id: "reporting",
      label: "reporting failures 24h",
      value: formatCount(observability.reporting.failedJobs, locale),
      delta: observability.reporting.failedJobs > 0 ? "↑ attention" : "ok",
      deltaTone:
        observability.reporting.failedJobs > 0
          ? ("down" as const)
          : ("up" as const),
      sub: copy.kpiReportingSub(observability.reporting.queuedJobs),
    },
  ] as const;

  const initialLoading = loading && !lastRefresh;

  return (
    <div style={pageRootStyle(PAGE_THEME)}>
      <PageHeader
        theme={PAGE_THEME}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={["Alerts", "Dispatch", "Webhook", "Filing", "Adapters"]}
        activeTab="Alerts"
        actions={
          <Btn theme={PAGE_THEME} onClick={loadData} disabled={loading}>
            {copy.refresh}
          </Btn>
        }
      />

      <div style={pageContentStyle}>
        {error ? (
          <Banner
            theme={PAGE_THEME}
            tone="danger"
            icon="warn"
            title={copy.errorTitle}
            body={error}
            actions={
              <Btn theme={PAGE_THEME} size="xs" onClick={loadData}>
                {copy.retry}
              </Btn>
            }
          />
        ) : null}

        {initialLoading ? (
          <Card theme={PAGE_THEME}>
            <div style={emptyBlockStyle(PAGE_THEME)}>{copy.loading}</div>
          </Card>
        ) : (
          <>
            <div style={kpiGridStyle}>
              {metricCards.map((metric) => (
                <KPI
                  key={metric.id}
                  theme={PAGE_THEME}
                  label={metric.label}
                  value={metric.value}
                  sub={metric.sub}
                  {...(metric.delta
                    ? {
                        delta: metric.delta,
                        deltaTone: metric.deltaTone ?? "neutral",
                      }
                    : {})}
                />
              ))}
            </div>

            <Card
              theme={PAGE_THEME}
              title={copy.activeAlertsTitle}
              subtitle={copy.activeAlertsSubtitle}
              actions={
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Pill theme={PAGE_THEME} tone="neutral">
                    {formatDateTime(observability.generatedAt)}
                  </Pill>
                  <Pill theme={PAGE_THEME} tone={badgeTone} dot>
                    {badgeLabel}
                  </Pill>
                </div>
              }
            >
              {platformAlerts.length === 0 ? (
                <div style={emptyBlockStyle(PAGE_THEME)}>{copy.noAlerts}</div>
              ) : (
                <div style={{ display: "grid", gap: 0 }}>
                  {platformAlerts.map((alert, index) => (
                    <div
                      key={alert.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 0",
                        borderBottom:
                          index === platformAlerts.length - 1
                            ? "none"
                            : `1px solid ${PAGE_THEME.border}`,
                      }}
                    >
                      <Pill
                        theme={PAGE_THEME}
                        tone={alertTone(alert.state)}
                        dot
                      >
                        {alert.routes.join(" / ")}
                      </Pill>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: PAGE_THEME.text,
                            lineHeight: 1.4,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {(() => {
                            const key = `health.alert.${alert.key}.title`;
                            const translated = t(key);
                            return translated === key
                              ? formatPlatformCodeLabel(locale, alert.key)
                              : translated;
                          })()}
                        </div>
                        <div style={detailLineStyle(PAGE_THEME)}>
                          {t("health.thresholds", {
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
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          color: PAGE_THEME.textDim,
                          fontFamily: PAGE_THEME.monoFamily,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatAlertBadge(alert, locale)}
                      </span>
                      <Btn
                        theme={PAGE_THEME}
                        variant="ghost"
                        size="xs"
                        icon="ext"
                        onClick={() => router.push("/adapter-registry")}
                      >
                        {copy.rowOpen}
                      </Btn>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              theme={PAGE_THEME}
              title={copy.adapterInventoryTitle}
              subtitle={copy.adapterInventorySubtitle}
              padding={0}
              actions={
                <Btn
                  theme={PAGE_THEME}
                  variant="ghost"
                  size="xs"
                  icon="ext"
                  onClick={() => router.push("/adapter-registry")}
                >
                  {copy.openRegistry}
                </Btn>
              }
            >
              {serviceRows.length === 0 ? (
                <div style={emptyBlockStyle(PAGE_THEME)}>{copy.noAdapters}</div>
              ) : (
                <Table<ServiceGridRow>
                  theme={PAGE_THEME}
                  columns={[
                    {
                      h: "ADAPTER",
                      w: 120,
                      mono: true,
                      r: (row) => (
                        <span
                          style={{
                            color: PAGE_THEME.accent,
                            fontFamily: PAGE_THEME.monoFamily,
                            fontSize: 11.5,
                          }}
                        >
                          {row.adapter}
                        </span>
                      ),
                    },
                    {
                      h: "SOURCE",
                      w: 220,
                      r: (row) => (
                        <div style={cardStackStyle}>
                          <span>{row.source}</span>
                          <span style={detailLineStyle(PAGE_THEME)}>
                            {row.sourceNote}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: "KIND",
                      w: 150,
                      mono: true,
                      r: (row) => (
                        <div style={cardStackStyle}>
                          <span
                            style={{
                              fontFamily: PAGE_THEME.monoFamily,
                              fontSize: 11.5,
                            }}
                          >
                            {row.kind}
                          </span>
                          <span style={detailLineStyle(PAGE_THEME)}>
                            {row.kindNote}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: "STATUS",
                      w: 110,
                      r: (row) => (
                        <Pill
                          theme={PAGE_THEME}
                          tone={serviceTone(row.status)}
                          dot
                        >
                          {row.status}
                        </Pill>
                      ),
                    },
                    {
                      h: "LATENCY",
                      k: "latency",
                      w: 110,
                      mono: true,
                      align: "right",
                    },
                    {
                      h: "LAST EVENT",
                      k: "lastEvent",
                      w: 150,
                      mono: true,
                    },
                    {
                      h: "CONTROLS",
                      w: 320,
                      r: (row) =>
                        row.controls ? (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 6,
                            }}
                          >
                            <Pill
                              theme={PAGE_THEME}
                              tone={credentialTone(
                                row.controls.credentialStatus,
                              )}
                              dot
                            >
                              {`cred ${row.controls.credentialStatus}`}
                            </Pill>
                            <Pill
                              theme={PAGE_THEME}
                              tone={authTone(row.controls.authStatus)}
                              dot
                            >
                              {`auth ${row.controls.authStatus}`}
                            </Pill>
                            <Pill
                              theme={PAGE_THEME}
                              tone={webhookTone(row.controls.webhookStatus)}
                              dot
                            >
                              {`webhook ${row.controls.webhookStatus}`}
                            </Pill>
                          </div>
                        ) : (
                          <span style={detailLineStyle(PAGE_THEME)}>—</span>
                        ),
                    },
                  ]}
                  rows={serviceRows}
                />
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
