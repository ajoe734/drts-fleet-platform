import Link from "next/link";
import type {
  DispatchJobRecord,
  DriverRegistryRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  IncidentRecord,
  MaintenanceRecord,
  OperationalAdapterDetailRecord,
  OperationalObservabilitySnapshot,
  OwnedOrderRecord,
  ReportJobRecord,
  ShiftRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  buildDashboardTrend,
  buildDispatchInsights,
  buildOperationsOverview,
  buildRevenueInsights,
  formatCompactNumber,
  formatMinorCurrency,
} from "@/lib/ops-analytics";
import { PageHeader } from "@drts/ui-web";
import { StatCard } from "@drts/ui-web";
import { Card, CardHeader, CardBody } from "@drts/ui-web";

type IdentitySummary = { realm?: string; actorType?: string } | null;
type HealthPayload = {
  service: string;
  status: string;
  mode: string;
  execution_mode: string;
  timestamp: string;
};

const ALERT_STATE_STYLES = {
  healthy: {
    background: "#f0fdf4",
    border: "#bbf7d0",
    color: "#166534",
  },
  warning: {
    background: "#fff7ed",
    border: "#fed7aa",
    color: "#c2410c",
  },
  critical: {
    background: "#fef2f2",
    border: "#fecaca",
    color: "#b91c1c",
  },
} as const;

const ADAPTER_STATUS_STYLES = {
  healthy: {
    background: "#dcfce7",
    border: "#86efac",
    color: "#166534",
  },
  degraded: {
    background: "#fef3c7",
    border: "#fcd34d",
    color: "#92400e",
  },
  down: {
    background: "#fee2e2",
    border: "#fca5a5",
    color: "#b91c1c",
  },
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
) {
  if (unit === "minutes") {
    return locale === "en" ? `${value} min` : `${value} 分鐘`;
  }
  if (unit === "percent") {
    return `${value}%`;
  }
  return formatCompactNumber(value);
}

function getAlertSummary(
  alertKey: string,
  observability: OperationalObservabilitySnapshot,
  locale: "en" | "zh",
) {
  switch (alertKey) {
    case "dispatch_lag":
      return t("dashboard.alert.dispatch_lag.summary", locale, {
        count: observability.dispatch.laggedOrders,
      });
    case "recording_backlog":
      return t("dashboard.alert.recording_backlog.summary", locale, {
        count: observability.recording.pendingOrders,
      });
    case "driver_state_lag":
      return t("dashboard.alert.driver_state_lag.summary", locale, {
        count: observability.driverState.staleLocationDrivers,
      });
    case "eligibility_review_backlog":
      return t("dashboard.alert.eligibility_review_backlog.summary", locale, {
        count: observability.eligibility.totalReviewQueue,
      });
    case "adapter_degradation":
      return t("dashboard.alert.adapter_degradation.summary", locale, {
        count:
          observability.adapters.degradedAdapters +
          observability.adapters.downAdapters,
      });
    default:
      return "";
  }
}

function formatTimestamp(value: string | null, locale: "en" | "zh") {
  if (!value) {
    return t("dashboard.platformOps.notReported", locale);
  }

  return `${new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function formatBacklogSummary(value: number | null, locale: "en" | "zh") {
  if (value === null) {
    return t("dashboard.platformOps.noLag", locale);
  }

  return t("dashboard.platformOps.oldestLag", locale, {
    value: formatAlertValue(value, "minutes", locale),
  });
}

function buildAdapterSignalItems(
  adapter: OperationalAdapterDetailRecord,
  locale: "en" | "zh",
) {
  return [
    {
      label: t("dashboard.platformOps.signal.credential", locale),
      value: formatOpsCodeLabel(locale, adapter.credentialStatus),
    },
    {
      label: t("dashboard.platformOps.signal.auth", locale),
      value: formatOpsCodeLabel(locale, adapter.authStatus),
    },
    {
      label: t("dashboard.platformOps.signal.webhook", locale),
      value: formatOpsCodeLabel(locale, adapter.webhookStatus),
    },
    {
      label: t("dashboard.platformOps.signal.rateLimit", locale),
      value: formatOpsCodeLabel(locale, adapter.rateLimitStatus),
    },
  ] as const;
}

async function resolveOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

async function loadHealthPayload(): Promise<HealthPayload> {
  const apiBaseUrl = process.env.DRTS_API_URL ?? "http://localhost:3001";
  const response = await fetch(new URL("/api/health", apiBaseUrl), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }

  return (await response.json()) as HealthPayload;
}

export default async function DashboardPage() {
  const client = getOpsClient();
  const locale = await getServerLocale();
  const [
    identity,
    health,
    orders,
    dispatchJobs,
    driverTasks,
    vehicles,
    drivers,
    shifts,
    incidents,
    maintenance,
    reportJobs,
    driverStatements,
    observability,
  ] = await Promise.all([
    resolveOrFallback<IdentitySummary>(
      () => client.getIdentityContext() as Promise<IdentitySummary>,
      null,
    ),
    resolveOrFallback(loadHealthPayload, {
      service: "api",
      status: "degraded",
      mode: "unknown",
      execution_mode: "unknown",
      timestamp: new Date().toISOString(),
    }),
    resolveOrFallback(() => client.listOrders(), [] as OwnedOrderRecord[]),
    resolveOrFallback(
      () => client.listDispatchJobs(),
      [] as DispatchJobRecord[],
    ),
    resolveOrFallback(() => client.listDriverTasks(), [] as DriverTaskRecord[]),
    resolveOrFallback(
      () => client.listVehicles(),
      [] as VehicleRegistryRecord[],
    ),
    resolveOrFallback(() => client.listDrivers(), [] as DriverRegistryRecord[]),
    resolveOrFallback(() => client.listShifts(), [] as ShiftRecord[]),
    resolveOrFallback(() => client.listIncidents(), [] as IncidentRecord[]),
    resolveOrFallback(
      () => client.listMaintenance(),
      [] as MaintenanceRecord[],
    ),
    resolveOrFallback(() => client.listReportJobs(), [] as ReportJobRecord[]),
    resolveOrFallback(
      () => client.listDriverStatements(),
      [] as DriverStatementRecord[],
    ),
    resolveOrFallback(
      () => client.getOperationalObservability(),
      createFallbackObservabilitySnapshot(),
    ),
  ]);

  const dispatch = buildDispatchInsights(orders, dispatchJobs);
  const operations = buildOperationsOverview({
    vehicles,
    drivers,
    shifts,
    incidents,
    maintenance,
    reportJobs,
  });
  const todayRevenue = buildRevenueInsights(
    orders,
    driverTasks,
    driverStatements,
    {
      period: "today",
      serviceBucket: "all",
      vehicleId: "all",
    },
  );
  const trend = buildDashboardTrend(orders, driverTasks, incidents);
  const maxTrips = Math.max(1, ...trend.map((p) => p.completedTrips));
  const actionItems = [
    dispatch.redispatchOrders > 0
      ? t("dashboard.exceptions.redispatch", locale, {
          count: dispatch.redispatchOrders,
        })
      : null,
    operations.openIncidents > 0
      ? t("dashboard.exceptions.incidents", locale, {
          count: operations.openIncidents,
        })
      : null,
    operations.overdueMaintenance > 0
      ? t("dashboard.exceptions.maintenance", locale, {
          count: operations.overdueMaintenance,
        })
      : null,
    operations.failedReports > 0
      ? t("dashboard.exceptions.reports", locale, {
          count: operations.failedReports,
        })
      : null,
  ].filter(Boolean) as string[];

  const quickLinks: [string, string][] = [
    ["/dispatch", t("dashboard.quicklink.dispatch", locale)],
    ["/revenue", t("dashboard.quicklink.revenue", locale)],
    ["/incidents", t("dashboard.quicklink.incidents", locale)],
    ["/maintenance", t("dashboard.quicklink.maintenance", locale)],
    ["/reports", t("dashboard.quicklink.reports", locale)],
  ];
  const opsAlertKeys = new Set(
    observability.roleViews.find((view) => view.route === "ops")?.alertKeys ??
      [],
  );
  const opsAlerts = observability.alerts
    .filter(
      (alert) => opsAlertKeys.has(alert.key) || alert.routes.includes("ops"),
    )
    .sort((left, right) => {
      const severityRank = { critical: 0, warning: 1, healthy: 2 } as const;
      return severityRank[left.state] - severityRank[right.state];
    });
  const adapterAttentionCount =
    observability.adapters.degradedAdapters +
    observability.adapters.downAdapters;
  const platformOpsCards = [
    {
      label: t("dashboard.platformOps.metrics.adapters", locale),
      value: formatCompactNumber(adapterAttentionCount),
      sub: t("dashboard.platformOps.metrics.adaptersSub", locale, {
        healthy: observability.adapters.healthyAdapters,
        down: observability.adapters.downAdapters,
        total: observability.adapters.totalAdapters,
      }),
      accent: "#0f766e",
    },
    {
      label: t("dashboard.platformOps.metrics.syncFailed", locale),
      value: formatCompactNumber(observability.forwarderOps.syncFailedOrders),
      sub: formatBacklogSummary(
        observability.forwarderOps.oldestSyncFailedLagMinutes,
        locale,
      ),
      accent: "#dc2626",
    },
    {
      label: t("dashboard.platformOps.metrics.acceptPending", locale),
      value: formatCompactNumber(
        observability.forwarderOps.acceptPendingOrders,
      ),
      sub: formatBacklogSummary(
        observability.forwarderOps.oldestAcceptPendingLagMinutes,
        locale,
      ),
      accent: "#d97706",
    },
    {
      label: t("dashboard.platformOps.metrics.manualFallback", locale),
      value: formatCompactNumber(
        observability.forwarderOps.manualFallbackQueue,
      ),
      sub: formatBacklogSummary(
        observability.forwarderOps.oldestManualFallbackLagMinutes,
        locale,
      ),
      accent: "#7c3aed",
    },
    {
      label: t("dashboard.platformOps.metrics.reconciliation", locale),
      value: formatCompactNumber(
        observability.forwarderOps.reconciliationQueue,
      ),
      sub: formatBacklogSummary(
        observability.forwarderOps.oldestReconciliationLagMinutes,
        locale,
      ),
      accent: "#0284c7",
    },
  ] as const;

  return (
    <>
      <PageHeader
        title={t("dashboard.title", locale)}
        subtitle={t("dashboard.subtitle", locale)}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <StatCard
          label={t("dashboard.todayRevenue", locale)}
          value={formatMinorCurrency(todayRevenue.totalRevenueMinor)}
          sub={t("dashboard.todayRevenueSub", locale, {
            trips: formatCompactNumber(todayRevenue.completedTrips),
          })}
          accent="#15803d"
        />
        <StatCard
          label={t("dashboard.queueDepth", locale)}
          value={formatCompactNumber(dispatch.queueDepth)}
          sub={
            dispatch.averageEtaMinutes
              ? t("dashboard.queueDepthSub", locale, {
                  eta: dispatch.averageEtaMinutes,
                })
              : t("dashboard.queueDepthSubPending", locale)
          }
          accent="#1d4ed8"
        />
        <StatCard
          label={t("dashboard.activeOrders", locale)}
          value={formatCompactNumber(dispatch.activeOrders)}
          sub={t("dashboard.activeOrdersSub", locale)}
          accent="#7c3aed"
        />
        <StatCard
          label={t("dashboard.dispatchableVehicles", locale)}
          value={formatCompactNumber(operations.dispatchableVehicles)}
          sub={t("dashboard.dispatchableVehiclesSub", locale, {
            count: operations.offlineVehicles,
          })}
          accent="#b45309"
        />
        <StatCard
          label={t("dashboard.onlineDrivers", locale)}
          value={formatCompactNumber(operations.onlineDrivers)}
          sub={t("dashboard.onlineDriversSub", locale)}
          accent="#0891b2"
        />
        <StatCard
          label={t("dashboard.openIncidents", locale)}
          value={formatCompactNumber(operations.openIncidents)}
          sub={t("dashboard.openIncidentsSub", locale, {
            count: operations.overdueMaintenance,
          })}
          accent="#dc2626"
        />
      </div>

      <Card>
        <CardHeader>
          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#64748b",
              marginBottom: "2px",
            }}
          >
            {t("dashboard.operational.title", locale)}
          </div>
          <div style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}>
            {t("dashboard.operational.subtitle", locale)}
          </div>
        </CardHeader>
        <CardBody>
          {opsAlerts.length === 0 ? (
            <p style={{ margin: 0, fontSize: "13.5px", color: "#94a3b8" }}>
              {t("dashboard.operational.empty", locale)}
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
              }}
            >
              {opsAlerts.map((alert) => {
                const style = ALERT_STATE_STYLES[alert.state];
                return (
                  <div
                    key={alert.key}
                    style={{
                      border: `1px solid ${style.border}`,
                      background: style.background,
                      borderRadius: "12px",
                      padding: "14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "10px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#0f172a",
                        }}
                      >
                        {t(`dashboard.alert.${alert.key}.title`, locale)}
                      </div>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: style.color,
                        }}
                      >
                        {formatOpsCodeLabel(locale, alert.state)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "22px",
                        fontWeight: 700,
                        color: "#0f172a",
                        marginBottom: "4px",
                      }}
                    >
                      {formatAlertValue(
                        alert.measuredValue,
                        alert.thresholds.unit,
                        locale,
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#475569",
                        marginBottom: "8px",
                      }}
                    >
                      {t("dashboard.operational.thresholds", locale, {
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
                    <div style={{ fontSize: "12px", color: "#334155" }}>
                      {getAlertSummary(alert.key, observability, locale)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#64748b",
              marginBottom: "2px",
            }}
          >
            {t("dashboard.platformOps.title", locale)}
          </div>
          <div style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}>
            {t("dashboard.platformOps.subtitle", locale, {
              count: observability.forwarderOps.totalForwardedOrders,
            })}
          </div>
        </CardHeader>
        <CardBody>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: "14px",
              marginBottom: "18px",
            }}
          >
            {platformOpsCards.map((card) => (
              <div
                key={card.label}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "14px",
                  padding: "14px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#64748b",
                    marginBottom: "8px",
                  }}
                >
                  {card.label}
                </div>
                <div
                  style={{
                    fontSize: "26px",
                    fontWeight: 700,
                    color: card.accent,
                    marginBottom: "4px",
                  }}
                >
                  {card.value}
                </div>
                <div style={{ fontSize: "12px", color: "#475569" }}>
                  {card.sub}
                </div>
              </div>
            ))}
          </div>

          {adapterAttentionCount > 0 && (
            <div
              style={{
                marginBottom: "18px",
                border: "1px solid #fcd34d",
                background: "#fffbeb",
                color: "#92400e",
                borderRadius: "12px",
                padding: "12px 14px",
                fontSize: "13px",
              }}
            >
              {t("dashboard.platformOps.degradedBanner", locale, {
                count: adapterAttentionCount,
              })}
            </div>
          )}

          {observability.adapterDetails.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "14px",
              }}
            >
              {observability.adapterDetails.map((adapter) => {
                const signalItems = buildAdapterSignalItems(adapter, locale);
                const statusStyle = ADAPTER_STATUS_STYLES[adapter.status];

                return (
                  <div
                    key={adapter.platformCode}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "16px",
                      padding: "16px",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "10px",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "15px",
                            fontWeight: 600,
                            color: "#0f172a",
                          }}
                        >
                          {formatOpsCodeLabel(locale, adapter.platformCode)}
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          {t("dashboard.platformOps.signal.reason", locale)}:{" "}
                          {formatOpsCodeLabel(locale, adapter.reason)}
                        </div>
                      </div>
                      <span
                        style={{
                          border: `1px solid ${statusStyle.border}`,
                          background: statusStyle.background,
                          color: statusStyle.color,
                          borderRadius: "999px",
                          padding: "4px 10px",
                          fontSize: "11px",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t(
                          `dispatch.forwarded.health.status.${adapter.status}`,
                          locale,
                        )}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: "10px",
                        marginBottom: "12px",
                      }}
                    >
                      {signalItems.map((item) => (
                        <div
                          key={item.label}
                          style={{
                            border: "1px solid #e2e8f0",
                            borderRadius: "12px",
                            padding: "10px",
                            background: "#f8fafc",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "11px",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              color: "#64748b",
                              marginBottom: "4px",
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "#0f172a",
                            }}
                          >
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: "6px",
                        fontSize: "12px",
                        color: "#475569",
                      }}
                    >
                      <div>
                        {t("dashboard.platformOps.signal.lastChecked", locale)}:{" "}
                        {formatTimestamp(adapter.lastCheckedAt, locale)}
                      </div>
                      <div>
                        {t("dashboard.platformOps.signal.lastError", locale)}:{" "}
                        {adapter.lastError ??
                          t("dashboard.platformOps.noError", locale)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: "13.5px", color: "#94a3b8" }}>
              {t("dashboard.platformOps.empty", locale)}
            </p>
          )}

          <div style={{ marginTop: "18px" }}>
            <Link
              href="/dispatch"
              style={{
                display: "inline-block",
                padding: "10px 14px",
                borderRadius: "10px",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                color: "#1d4ed8",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {t("dashboard.platformOps.openDispatch", locale)} →
            </Link>
          </div>
        </CardBody>
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: "20px",
          marginBottom: "24px",
        }}
      >
        <Card>
          <CardHeader>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#64748b",
                marginBottom: "2px",
              }}
            >
              {t("dashboard.trend.title", locale)}
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              {t("dashboard.trend.subtitle", locale)}
            </div>
          </CardHeader>
          <CardBody>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "8px",
                alignItems: "end",
                minHeight: "120px",
              }}
            >
              {trend.map((point) => (
                <div
                  key={point.date}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "40px",
                      height: `${Math.max(12, Math.round((point.completedTrips / maxTrips) * 80))}px`,
                      background: "linear-gradient(180deg, #3b82f6, #06b6d4)",
                      borderRadius: "4px 4px 2px 2px",
                    }}
                    title={`${point.label}: ${point.completedTrips} trips, ${formatMinorCurrency(point.revenueMinor)}`}
                  />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    {point.completedTrips}
                  </span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                    {point.label}
                  </span>
                  <span style={{ fontSize: "10px", color: "#cbd5e1" }}>
                    {point.createdOrders} {locale === "en" ? "new" : "新建"}
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#64748b",
                marginBottom: "2px",
              }}
            >
              {t("dashboard.exceptions.title", locale)}
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              {t("dashboard.exceptions.subtitle", locale)}
            </div>
          </CardHeader>
          <CardBody>
            {actionItems.length > 0 ? (
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {actionItems.map((item) => (
                  <li
                    key={item}
                    style={{ fontSize: "13.5px", color: "#dc2626" }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, fontSize: "13.5px", color: "#94a3b8" }}>
                {t("dashboard.exceptions.none", locale)}
              </p>
            )}
            <div
              style={{
                marginTop: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {quickLinks.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: "block",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    color: "#1d4ed8",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  {label} →
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#64748b",
              marginBottom: "2px",
            }}
          >
            {t("dashboard.runtime.title", locale)}
          </div>
          <div style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}>
            {t("dashboard.runtime.subtitle", locale)}
          </div>
        </CardHeader>
        <CardBody>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "16px",
            }}
          >
            {(
              [
                [t("dashboard.runtime.apiStatus", locale), health.status],
                [t("dashboard.runtime.service", locale), health.service],
                [t("dashboard.runtime.mode", locale), health.mode],
                [
                  t("dashboard.runtime.execution", locale),
                  health.execution_mode,
                ],
                [
                  t("dashboard.runtime.realm", locale),
                  identity?.realm ?? t("dashboard.runtime.anonymous", locale),
                ],
                [
                  t("dashboard.runtime.actor", locale),
                  identity?.actorType ??
                    t("dashboard.runtime.anonymous", locale),
                ],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#0f172a",
                    marginTop: "4px",
                  }}
                >
                  {formatOpsCodeLabel(locale, value)}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
