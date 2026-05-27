"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdapterHealthRecord,
  CrossAppResourceLink,
  EmptyReason,
  OperationalAlertRecord,
  OperationalObservabilitySnapshot,
  RefreshTier,
  ResourceActionDescriptor,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";

const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_TIER_LABEL = "T4";
const REFRESH_CADENCE_MS: Record<RefreshTier, number> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: 0,
};
const REFRESH_INTERVAL_MS = REFRESH_CADENCE_MS[REFRESH_TIER];

type HealthView = "alerts" | "adapters";
type RouteFilter = "all" | "platform" | "ops";

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

function formatMetricValue(
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

function formatDateTime(value: string, locale: "en" | "zh"): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function getBadgeClass(
  status: string,
):
  | "admin-badge--success"
  | "admin-badge--warning"
  | "admin-badge--danger"
  | "admin-badge--neutral" {
  switch (status) {
    case "healthy":
    case "fresh":
      return "admin-badge--success";
    case "warning":
    case "degraded":
    case "stale":
      return "admin-badge--warning";
    case "critical":
    case "down":
      return "admin-badge--danger";
    default:
      return "admin-badge--neutral";
  }
}

function classifyError(message: string | null): EmptyReason | null {
  if (!message) return null;
  if (/403|401|forbidden|unauthorized|permission/i.test(message)) {
    return "permission_denied";
  }
  if (/503|502|gateway|timeout|upstream|econnrefused|network/i.test(message)) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function hasOperationalData(
  snapshot: OperationalObservabilitySnapshot,
): boolean {
  return (
    snapshot.alerts.length > 0 ||
    snapshot.dispatch.activeOrders > 0 ||
    snapshot.webhook.totalEndpoints > 0 ||
    snapshot.eligibility.totalReviewQueue > 0 ||
    snapshot.reporting.failedJobs > 0 ||
    snapshot.adapters.totalAdapters > 0
  );
}

function buildHealthEnvelope(
  snapshot: OperationalObservabilitySnapshot,
  adapterRows: AdapterHealthRecord[],
  errorReason: EmptyReason | null,
): UiHealthEnvelope {
  const degradedServices: UiHealthEnvelope["degradedServices"] = [];

  for (const alert of snapshot.alerts) {
    if (alert.state === "healthy") continue;
    degradedServices.push({
      service: alert.key,
      impact: alert.routes.join(","),
      severity: alert.state === "critical" ? "critical" : "warning",
    });
  }

  if (
    snapshot.adapters.degradedAdapters > 0 ||
    snapshot.adapters.downAdapters > 0
  ) {
    degradedServices.push({
      service: "adapter_registry",
      impact: `${snapshot.adapters.degradedAdapters + snapshot.adapters.downAdapters} adapter(s) require follow-up`,
      severity: snapshot.adapters.downAdapters > 0 ? "critical" : "warning",
    });
  }

  if (errorReason) {
    degradedServices.push({
      service: "platform_health_api",
      impact: errorReason,
      severity: errorReason === "permission_denied" ? "warning" : "critical",
    });
  }

  const uniqueServices = degradedServices.filter(
    (service, index, services) =>
      services.findIndex(
        (candidate) => candidate.service === service.service,
      ) === index,
  );

  if (
    errorReason &&
    !hasOperationalData(snapshot) &&
    adapterRows.length === 0
  ) {
    return {
      status: "down",
      degradedServices: uniqueServices,
      lastCheckedAt: snapshot.generatedAt,
    };
  }

  if (uniqueServices.length > 0) {
    return {
      status: "degraded",
      degradedServices: uniqueServices,
      lastCheckedAt: snapshot.generatedAt,
    };
  }

  return {
    status: "healthy",
    degradedServices: [],
    lastCheckedAt: snapshot.generatedAt,
  };
}

function buildRefreshMetadata(
  generatedAt: string,
  hasError: boolean,
  now: number,
): UiRefreshMetadata {
  const staleAfterMs = REFRESH_INTERVAL_MS;
  const ageMs = now - new Date(generatedAt).getTime();

  return {
    generatedAt,
    staleAfterMs,
    dataFreshness: hasError
      ? "degraded"
      : ageMs > staleAfterMs
        ? "stale"
        : "fresh",
    source: "live",
  };
}

function getAlertTitle(
  t: (key: string, params?: Record<string, string | number>) => string,
  alert: OperationalAlertRecord,
): string {
  return t(`health.alert.${alert.key}.title`);
}

function getAlertFollowUpLink(
  alert: OperationalAlertRecord,
): CrossAppResourceLink | null {
  switch (alert.key) {
    case "dispatch_lag":
      return {
        targetApp: "ops-console",
        route: "/dispatch",
        resourceType: "dispatch_board",
        resourceId: "dispatch",
        openMode: "new_tab",
        label: "Ops Console",
      };
    case "recording_backlog":
      return {
        targetApp: "ops-console",
        route: "/callcenter",
        resourceType: "callcenter",
        resourceId: "recordings",
        openMode: "new_tab",
        label: "Ops Console",
      };
    case "driver_state_lag":
      return {
        targetApp: "ops-console",
        route: "/drivers",
        resourceType: "drivers",
        resourceId: "drivers",
        openMode: "new_tab",
        label: "Ops Console",
      };
    case "webhook_failure_burst":
      return {
        targetApp: "platform-admin",
        route: "/adapter-registry?filter=attention",
        resourceType: "adapter_registry",
        resourceId: "attention",
        openMode: "same_tab",
        label: "Adapter Registry",
      };
    case "eligibility_review_backlog":
      return {
        targetApp: "ops-console",
        route: "/contracts",
        resourceType: "eligibility_reviews",
        resourceId: "contracts",
        openMode: "new_tab",
        label: "Ops Console",
      };
    case "adapter_degradation":
      return {
        targetApp: "platform-admin",
        route: "/adapter-registry?filter=attention",
        resourceType: "adapter_registry",
        resourceId: "attention",
        openMode: "same_tab",
        label: "Adapter Registry",
      };
    default:
      return null;
  }
}

function getAdapterFollowUpLink(platformCode: string): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: `/adapter-registry?filter=attention&platformCode=${encodeURIComponent(platformCode)}`,
    resourceType: "adapter",
    resourceId: platformCode,
    openMode: "same_tab",
    label: "Adapter Registry",
  };
}

function resolveCrossAppHref(link: CrossAppResourceLink): string | null {
  if (link.targetApp === "platform-admin") {
    return link.route;
  }

  const appBaseUrl =
    link.targetApp === "ops-console"
      ? process.env.NEXT_PUBLIC_OPS_CONSOLE_URL
      : process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL;

  if (!appBaseUrl) {
    return null;
  }

  return `${appBaseUrl.replace(/\/$/, "")}${link.route}`;
}

function buildEmptyState(
  view: HealthView,
  errorReason: EmptyReason | null,
  routeFilter: RouteFilter,
  totalAlerts: number,
  filteredAlerts: number,
  adapterCount: number,
): {
  reason: EmptyReason;
  messageCode: string;
  nextAction?: ResourceActionDescriptor;
} | null {
  if (errorReason) {
    return {
      reason: errorReason,
      messageCode: `health.empty.${errorReason}`,
      nextAction: {
        action: "refresh",
        enabled: true,
        riskLevel: "low",
      },
    };
  }

  if (view === "alerts") {
    if (routeFilter !== "all" && totalAlerts > 0 && filteredAlerts === 0) {
      return {
        reason: "filtered_empty",
        messageCode: "health.empty.filtered_empty",
        nextAction: {
          action: "filter:all",
          enabled: true,
          riskLevel: "low",
        },
      };
    }

    if (filteredAlerts === 0) {
      return {
        reason: "no_data",
        messageCode: "health.empty.no_data",
      };
    }
  }

  if (view === "adapters" && adapterCount === 0) {
    return {
      reason: "not_provisioned",
      messageCode: "health.empty.not_provisioned",
      nextAction: {
        action: "open:adapter-registry",
        enabled: true,
        riskLevel: "low",
      },
    };
  }

  return null;
}

function createAction(
  action: string,
  enabled: boolean,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  disabledReasonCode?: string,
): ResourceActionDescriptor {
  return {
    action,
    enabled,
    riskLevel,
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
  };
}

function getEmptyStateVisual(reason: EmptyReason): {
  borderColor: string;
  background: string;
  badgeClass: ReturnType<typeof getBadgeClass>;
} {
  switch (reason) {
    case "no_data":
      return {
        borderColor: "rgba(16,185,129,0.24)",
        background:
          "linear-gradient(180deg, rgba(236,253,245,0.92), rgba(255,255,255,1))",
        badgeClass: "admin-badge--success",
      };
    case "not_provisioned":
      return {
        borderColor: "rgba(15,118,110,0.24)",
        background:
          "linear-gradient(180deg, rgba(240,253,250,0.96), rgba(255,255,255,1))",
        badgeClass: "admin-badge--neutral",
      };
    case "filtered_empty":
      return {
        borderColor: "rgba(14,165,233,0.24)",
        background:
          "linear-gradient(180deg, rgba(239,246,255,0.96), rgba(255,255,255,1))",
        badgeClass: "admin-badge--neutral",
      };
    case "permission_denied":
      return {
        borderColor: "rgba(245,158,11,0.28)",
        background:
          "linear-gradient(180deg, rgba(255,247,237,0.96), rgba(255,255,255,1))",
        badgeClass: "admin-badge--warning",
      };
    case "external_unavailable":
    case "fetch_failed":
      return {
        borderColor: "rgba(239,68,68,0.28)",
        background:
          "linear-gradient(180deg, rgba(254,242,242,0.96), rgba(255,255,255,1))",
        badgeClass: "admin-badge--danger",
      };
    default:
      return {
        borderColor: "rgba(148,163,184,0.28)",
        background:
          "linear-gradient(180deg, rgba(248,250,252,0.96), rgba(255,255,255,1))",
        badgeClass: "admin-badge--neutral",
      };
  }
}

function findAction(
  actions: ResourceActionDescriptor[],
  actionId: string,
): ResourceActionDescriptor | undefined {
  return actions.find((action) => action.action === actionId);
}

export default function HealthPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [observability, setObservability] =
    useState<OperationalObservabilitySnapshot>(
      createFallbackObservabilitySnapshot(),
    );
  const [adapters, setAdapters] = useState<AdapterHealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<HealthView>("alerts");
  const [routeFilter, setRouteFilter] = useState<RouteFilter>("platform");
  const [now, setNow] = useState(Date.now());

  const loadData = useCallback(
    async (background = false) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const [adapterData, operationalData] = await Promise.all([
          client.getForwarderAdaptersHealth() as Promise<AdapterHealthRecord[]>,
          client.getOperationalObservability(),
        ]);

        setAdapters(adapterData);
        setObservability(operationalData);
      } catch (nextError: any) {
        setError(nextError?.message || String(nextError));
      } finally {
        setLoading(false);
        setRefreshing(false);
        setNow(Date.now());
      }
    },
    [client],
  );

  useEffect(() => {
    loadData();

    const pollTimer = window.setInterval(() => {
      loadData(true);
    }, REFRESH_INTERVAL_MS);
    const freshnessTimer = window.setInterval(() => {
      setNow(Date.now());
    }, 5_000);

    return () => {
      window.clearInterval(pollTimer);
      window.clearInterval(freshnessTimer);
    };
  }, [loadData]);

  const errorReason = useMemo(() => classifyError(error), [error]);
  const refreshMetadata = useMemo(
    () => buildRefreshMetadata(observability.generatedAt, Boolean(error), now),
    [error, now, observability.generatedAt],
  );
  const healthEnvelope = useMemo(
    () => buildHealthEnvelope(observability, adapters, errorReason),
    [adapters, errorReason, observability],
  );
  const sortedAlerts = useMemo(() => {
    const severityOrder = { critical: 0, warning: 1, healthy: 2 } as const;
    return [...observability.alerts].sort(
      (left, right) => severityOrder[left.state] - severityOrder[right.state],
    );
  }, [observability.alerts]);
  const filteredAlerts = useMemo(() => {
    if (routeFilter === "all") {
      return sortedAlerts;
    }
    return sortedAlerts.filter((alert) => alert.routes.includes(routeFilter));
  }, [routeFilter, sortedAlerts]);
  const emptyState = useMemo(
    () =>
      buildEmptyState(
        view,
        errorReason,
        routeFilter,
        sortedAlerts.length,
        filteredAlerts.length,
        adapters.length,
      ),
    [
      adapters.length,
      errorReason,
      filteredAlerts.length,
      routeFilter,
      sortedAlerts.length,
      view,
    ],
  );
  const emptyStateVisual = useMemo(
    () => (emptyState ? getEmptyStateVisual(emptyState.reason) : null),
    [emptyState],
  );
  const opsConsoleHref = resolveCrossAppHref({
    targetApp: "ops-console",
    route: "/dispatch",
    resourceType: "dispatch_board",
    resourceId: "dispatch",
    openMode: "new_tab",
    label: "Ops Console",
  });

  const healthAvailableActions = useMemo<ResourceActionDescriptor[]>(
    () => [
      createAction(
        "view:alerts",
        view !== "alerts",
        "low",
        view === "alerts" ? "already_active" : undefined,
      ),
      createAction(
        "view:adapters",
        view !== "adapters",
        "low",
        view === "adapters" ? "already_active" : undefined,
      ),
      createAction(
        "filter:all",
        routeFilter !== "all",
        "low",
        routeFilter === "all" ? "already_active" : undefined,
      ),
      createAction(
        "filter:platform",
        routeFilter !== "platform",
        "low",
        routeFilter === "platform" ? "already_active" : undefined,
      ),
      createAction(
        "filter:ops",
        routeFilter !== "ops" &&
          sortedAlerts.some((alert) => alert.routes.includes("ops")),
        "low",
        sortedAlerts.some((alert) => alert.routes.includes("ops"))
          ? routeFilter === "ops"
            ? "already_active"
            : undefined
          : "no_ops_alerts",
      ),
      createAction(
        "refresh",
        !refreshing,
        "low",
        refreshing ? "refresh_in_flight" : undefined,
      ),
      createAction("open:adapter-registry", true, "low"),
      createAction(
        "open:ops-console",
        Boolean(opsConsoleHref),
        "low",
        opsConsoleHref ? undefined : "ops_console_unavailable",
      ),
    ],
    [opsConsoleHref, refreshing, routeFilter, sortedAlerts, view],
  );
  const emptyStateAction = emptyState?.nextAction
    ? (findAction(healthAvailableActions, emptyState.nextAction.action) ??
      emptyState.nextAction)
    : null;
  const handleAction = useCallback(
    (actionId: string) => {
      switch (actionId) {
        case "view:alerts":
          setView("alerts");
          return;
        case "view:adapters":
          setView("adapters");
          return;
        case "filter:all":
          setRouteFilter("all");
          return;
        case "filter:platform":
          setRouteFilter("platform");
          return;
        case "filter:ops":
          setRouteFilter("ops");
          return;
        case "refresh":
          void loadData(true);
          return;
        default:
          return;
      }
    },
    [loadData],
  );

  const metricCards = [
    {
      title: t("health.metric.dispatch.title"),
      value: formatMetricValue(
        observability.dispatch.oldestReadyOrderLagMinutes ?? 0,
        "minutes",
        locale,
      ),
      note: t("health.metric.dispatch.note", {
        count: observability.dispatch.laggedOrders,
      }),
    },
    {
      title: t("health.metric.webhook.title"),
      value: formatMetricValue(
        observability.webhook.failedDeliveriesLastHour,
        "count",
        locale,
      ),
      note: t("health.metric.webhook.note", {
        count: observability.webhook.queuedDeliveries,
      }),
    },
    {
      title: t("health.metric.eligibility.title"),
      value: formatMetricValue(
        observability.eligibility.totalReviewQueue,
        "count",
        locale,
      ),
      note: t("health.metric.eligibility.note", {
        count: observability.eligibility.manualReviewQueue,
      }),
    },
    {
      title: t("health.metric.reporting.title"),
      value: formatMetricValue(
        observability.reporting.failedJobs,
        "count",
        locale,
      ),
      note: t("health.metric.reporting.note", {
        count: observability.reporting.queuedJobs,
      }),
    },
    {
      title: t("health.metric.adapters.title"),
      value: formatMetricValue(
        observability.adapters.degradedAdapters +
          observability.adapters.downAdapters,
        "count",
        locale,
      ),
      note: t("health.metric.adapters.note", {
        count: observability.adapters.totalAdapters,
      }),
    },
  ];

  if (loading) {
    return <div className="admin-empty">{t("health.loading")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="admin-page-header" style={{ marginBottom: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#0f766e",
            marginBottom: 8,
          }}
        >
          {t("health.kicker")}
        </div>
        <h1>{t("health.title")}</h1>
        <p>{t("health.subtitle")}</p>
      </div>

      <div
        className="admin-card"
        style={{
          marginBottom: 0,
          borderColor:
            healthEnvelope.status === "healthy"
              ? "rgba(16,185,129,0.24)"
              : healthEnvelope.status === "degraded"
                ? "rgba(245,158,11,0.28)"
                : "rgba(239,68,68,0.28)",
          background:
            healthEnvelope.status === "healthy"
              ? "linear-gradient(135deg, rgba(236,253,245,0.95), rgba(255,255,255,0.98))"
              : healthEnvelope.status === "degraded"
                ? "linear-gradient(135deg, rgba(255,247,237,0.98), rgba(255,255,255,0.98))"
                : "linear-gradient(135deg, rgba(254,242,242,0.98), rgba(255,255,255,0.98))",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "grid", gap: 10, minWidth: 280 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                className={`admin-badge ${getBadgeClass(healthEnvelope.status)}`}
              >
                {formatPlatformCodeLabel(locale, healthEnvelope.status)}
              </span>
              <span
                className={`admin-badge ${getBadgeClass(refreshMetadata.dataFreshness)}`}
              >
                {t(`health.freshness.${refreshMetadata.dataFreshness}`)}
              </span>
              <span className="admin-badge admin-badge--neutral">
                {t("health.refreshTier", { tier: REFRESH_TIER_LABEL })}
              </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
              {t(`health.banner.${healthEnvelope.status}.title`)}
            </div>
            <div style={{ color: "#475569", fontSize: 14, lineHeight: 1.5 }}>
              {t(`health.banner.${healthEnvelope.status}.body`)}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              minWidth: 280,
              fontSize: 13,
              color: "#475569",
            }}
          >
            <div>
              {t("health.generatedAt", {
                time: formatDateTime(refreshMetadata.generatedAt, locale),
              })}
            </div>
            <div>
              {t("health.lastChecked", {
                time: formatDateTime(healthEnvelope.lastCheckedAt, locale),
              })}
            </div>
            <div>
              {t("health.source", {
                source: t(`health.sourceValue.${refreshMetadata.source}`),
              })}
            </div>
            <div>
              {refreshing ? t("health.refreshing") : t("health.refreshIdle")}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 8,
            marginTop: 18,
            paddingTop: 18,
            borderTop: "1px solid rgba(15,23,42,0.08)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {t("health.affectedServices")}
          </div>
          {healthEnvelope.degradedServices.length === 0 ? (
            <div style={{ color: "#0f766e", fontSize: 14 }}>
              {t("health.affectedServicesNone")}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {healthEnvelope.degradedServices.map((service) => (
                <span
                  key={service.service}
                  className={`admin-badge ${getBadgeClass(service.severity)}`}
                  title={service.impact}
                >
                  {service.service}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ marginBottom: 0, borderColor: "rgba(239,68,68,0.3)" }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#991b1b",
              marginBottom: 6,
            }}
          >
            {t("health.errorTitle")}
          </div>
          <div style={{ color: "#7f1d1d", fontSize: 14 }}>{error}</div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        {metricCards.map((metric) => (
          <div
            className="admin-card"
            key={metric.title}
            style={{
              marginBottom: 0,
              padding: 18,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(240,253,250,0.72))",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              {metric.title}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
              {metric.value}
            </div>
            <div style={{ color: "#475569", fontSize: 13, lineHeight: 1.5 }}>
              {metric.note}
            </div>
          </div>
        ))}
      </div>

      <div className="admin-card" style={{ marginBottom: 0 }}>
        <div
          className="admin-toolbar"
          style={{
            marginBottom: 18,
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {healthAvailableActions
                .filter((action) => action.action.startsWith("view:"))
                .map((action) => {
                  const isActive =
                    (action.action === "view:alerts" && view === "alerts") ||
                    (action.action === "view:adapters" && view === "adapters");

                  return (
                    <button
                      key={action.action}
                      className={`admin-toggle-btn ${isActive ? "active" : ""}`}
                      disabled={!action.enabled}
                      onClick={() => handleAction(action.action)}
                      title={
                        action.disabledReasonCode
                          ? t(`health.disabled.${action.disabledReasonCode}`)
                          : undefined
                      }
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(15,118,110,0.16)",
                        background: isActive ? "rgba(15,118,110,0.12)" : "#fff",
                        opacity: action.enabled ? 1 : 0.5,
                      }}
                    >
                      {t(
                        action.action === "view:alerts"
                          ? "health.tab.alerts"
                          : "health.tab.adapters",
                      )}
                    </button>
                  );
                })}
            </div>

            {view === "alerts" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {healthAvailableActions
                  .filter((action) => action.action.startsWith("filter:"))
                  .map((action) => {
                    const nextFilter = action.action.replace(
                      "filter:",
                      "",
                    ) as RouteFilter;
                    const isActive = routeFilter === nextFilter;

                    return (
                      <button
                        key={action.action}
                        className={`admin-toggle-btn ${isActive ? "active" : ""}`}
                        disabled={!action.enabled}
                        onClick={() => handleAction(action.action)}
                        title={
                          action.disabledReasonCode
                            ? t(`health.disabled.${action.disabledReasonCode}`)
                            : undefined
                        }
                        style={{
                          borderRadius: 999,
                          border: "1px solid rgba(15,118,110,0.16)",
                          background: isActive
                            ? "rgba(15,118,110,0.12)"
                            : "#fff",
                          opacity: action.enabled ? 1 : 0.5,
                        }}
                      >
                        {t(`health.filter.${nextFilter}`)}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              className="admin-btn admin-btn--secondary"
              disabled={!findAction(healthAvailableActions, "refresh")?.enabled}
              onClick={() => handleAction("refresh")}
              title={
                findAction(healthAvailableActions, "refresh")
                  ?.disabledReasonCode
                  ? t(
                      `health.disabled.${findAction(healthAvailableActions, "refresh")?.disabledReasonCode}`,
                    )
                  : undefined
              }
              style={{
                opacity: findAction(healthAvailableActions, "refresh")?.enabled
                  ? 1
                  : 0.6,
              }}
            >
              {t("common.refresh")}
            </button>
            <Link
              className="admin-btn admin-btn--secondary"
              href="/adapter-registry?filter=attention"
            >
              {t("health.openAdapterRegistry")}
            </Link>
          </div>
        </div>

        {emptyState ? (
          <div
            style={{
              padding: 28,
              borderRadius: 18,
              border: `1px dashed ${emptyStateVisual?.borderColor ?? "rgba(15,118,110,0.2)"}`,
              background:
                emptyStateVisual?.background ??
                "linear-gradient(180deg, rgba(248,250,252,0.9), rgba(255,255,255,1))",
              display: "grid",
              gap: 10,
              justifyItems: "start",
            }}
          >
            <div
              className={`admin-badge ${emptyStateVisual?.badgeClass ?? "admin-badge--neutral"}`}
            >
              {t(`health.emptyReason.${emptyState.reason}`)}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
              {t(`${emptyState.messageCode}.title`)}
            </div>
            <div
              style={{
                color: "#475569",
                fontSize: 14,
                lineHeight: 1.6,
                maxWidth: 720,
              }}
            >
              {t(`${emptyState.messageCode}.body`)}
            </div>
            {emptyStateAction?.action === "refresh" && (
              <button
                className="admin-btn admin-btn--secondary"
                disabled={!emptyStateAction.enabled}
                onClick={() => handleAction(emptyStateAction.action)}
              >
                {t("common.refresh")}
              </button>
            )}
            {emptyStateAction?.action === "filter:all" && (
              <button
                className="admin-btn admin-btn--secondary"
                disabled={!emptyStateAction.enabled}
                onClick={() => handleAction(emptyStateAction.action)}
              >
                {t("health.filter.all")}
              </button>
            )}
            {emptyStateAction?.action === "open:adapter-registry" && (
              <Link
                className="admin-btn admin-btn--secondary"
                href="/adapter-registry?filter=attention"
              >
                {t("health.openAdapterRegistry")}
              </Link>
            )}
          </div>
        ) : view === "alerts" ? (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("health.col.alert")}</th>
                  <th>{t("health.col.status")}</th>
                  <th>{t("health.col.measured")}</th>
                  <th>{t("health.col.threshold")}</th>
                  <th>{t("health.col.route")}</th>
                  <th>{t("health.col.followUp")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((alert) => {
                  const followUpLink = getAlertFollowUpLink(alert);
                  const followUpHref = followUpLink
                    ? resolveCrossAppHref(followUpLink)
                    : null;
                  return (
                    <tr key={alert.key}>
                      <td style={{ minWidth: 180 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          {getAlertTitle(t, alert)}
                        </div>
                        <div style={{ color: "#64748b", fontSize: 12 }}>
                          {alert.key}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`admin-badge ${getBadgeClass(alert.state)}`}
                        >
                          {formatPlatformCodeLabel(locale, alert.state)}
                        </span>
                      </td>
                      <td>
                        {formatMetricValue(
                          alert.measuredValue,
                          alert.thresholds.unit,
                          locale,
                        )}
                      </td>
                      <td>
                        {t("health.thresholds", {
                          warning: formatMetricValue(
                            alert.thresholds.warning,
                            alert.thresholds.unit,
                            locale,
                          ),
                          critical: formatMetricValue(
                            alert.thresholds.critical,
                            alert.thresholds.unit,
                            locale,
                          ),
                        })}
                      </td>
                      <td>
                        <div
                          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                        >
                          {alert.routes.map((route) => (
                            <span
                              key={`${alert.key}-${route}`}
                              className={`admin-badge ${route === "platform" ? "admin-badge--success" : "admin-badge--warning"}`}
                            >
                              {t(`health.filter.${route}`)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        {followUpLink && followUpHref ? (
                          followUpLink.openMode === "same_tab" ? (
                            <Link
                              className="admin-btn admin-btn--secondary admin-btn--sm"
                              href={followUpHref}
                            >
                              {followUpLink.targetApp === "platform-admin"
                                ? t("health.openAdapterRegistry")
                                : t("health.openOpsConsole")}
                            </Link>
                          ) : (
                            <a
                              className="admin-btn admin-btn--secondary admin-btn--sm"
                              href={followUpHref}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("health.openOpsConsole")}
                            </a>
                          )
                        ) : alert.routes.includes("ops") ? (
                          <span className="admin-badge admin-badge--neutral">
                            {t("health.opsOwnedFollowUp")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("health.col.adapter")}</th>
                  <th>{t("health.col.status")}</th>
                  <th>{t("health.col.lastCheck")}</th>
                  <th>{t("health.col.message")}</th>
                  <th>{t("health.col.followUp")}</th>
                </tr>
              </thead>
              <tbody>
                {adapters.map((adapter) => {
                  const followUp = getAdapterFollowUpLink(adapter.platformCode);
                  return (
                    <tr key={adapter.platformCode}>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {adapter.platformCode}
                      </td>
                      <td>
                        <span
                          className={`admin-badge ${getBadgeClass(adapter.status ?? "unknown")}`}
                        >
                          {formatPlatformCodeLabel(
                            locale,
                            adapter.status ?? "unknown",
                          )}
                        </span>
                      </td>
                      <td>
                        {formatDateTime(adapter.lastCheckedAt ?? "", locale)}
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={adapter.lastError ?? undefined}
                        >
                          {adapter.lastError || "—"}
                        </div>
                      </td>
                      <td>
                        <Link
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          href={followUp.route}
                        >
                          {t("health.openAdapterRegistry")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 18,
            paddingTop: 16,
            borderTop: "1px solid rgba(15,23,42,0.08)",
            color: "#475569",
            fontSize: 13,
          }}
        >
          <span>{t("health.deepLinkLabel")}</span>
          <Link
            className="admin-btn admin-btn--secondary admin-btn--sm"
            href="/adapter-registry?filter=attention"
          >
            {t("health.openAdapterRegistry")}
          </Link>
          {findAction(healthAvailableActions, "open:ops-console")?.enabled &&
          opsConsoleHref ? (
            <a
              className="admin-btn admin-btn--secondary admin-btn--sm"
              href={opsConsoleHref}
              target="_blank"
              rel="noreferrer"
            >
              {t("health.openOpsConsole")}
            </a>
          ) : (
            <span
              className="admin-badge admin-badge--neutral"
              title={
                findAction(healthAvailableActions, "open:ops-console")
                  ?.disabledReasonCode
                  ? t(
                      `health.disabled.${findAction(healthAvailableActions, "open:ops-console")?.disabledReasonCode}`,
                    )
                  : t("health.opsConsoleUnavailableHint")
              }
            >
              {t("health.openOpsConsole")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
