/**
 * Operational Health Page
 * Workflow alert monitoring plus forwarder adapter detail.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import type {
  AdapterHealthRecord,
  OperationalObservabilitySnapshot,
} from "@drts/contracts";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";

type AdapterHealth = {
  adapterId: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  lastCheck: string;
  message?: string | null;
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

function getAlertBadge(status: string): string {
  switch (status) {
    case "healthy":
      return "admin-badge--success";
    case "warning":
    case "degraded":
      return "admin-badge--warning";
    case "critical":
    case "down":
      return "admin-badge--danger";
    default:
      return "admin-badge--neutral";
  }
}

export default function HealthPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [adapters, setAdapters] = useState<AdapterHealth[]>([]);
  const [observability, setObservability] =
    useState<OperationalObservabilitySnapshot>(
      createFallbackObservabilitySnapshot(),
    );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"alerts" | "adapters">("alerts");
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adapterData, operationalData] = await Promise.all([
        client.getForwarderAdaptersHealth() as Promise<AdapterHealthRecord[]>,
        client.getOperationalObservability(),
      ]);
      const adapterList: AdapterHealth[] = adapterData.map((adapter) => ({
        adapterId: adapter.platformCode,
        status: adapter.status ?? "unknown",
        lastCheck: adapter.lastCheckedAt ?? "",
        message: adapter.lastError,
      }));

      setAdapters(adapterList);
      setObservability(operationalData);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const platformAlertKeys = new Set(
    observability.roleViews.find((view) => view.route === "platform")
      ?.alertKeys ?? [],
  );
  const platformAlerts = observability.alerts
    .filter(
      (alert) =>
        platformAlertKeys.has(alert.key) || alert.routes.includes("platform"),
    )
    .sort(
      (left, right) =>
        ALERT_SEVERITY_ORDER[left.state] - ALERT_SEVERITY_ORDER[right.state],
    );
  const metricCards = [
    {
      title: t("health.metric.dispatch.title"),
      value: formatAlertValue(
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
      value: formatAlertValue(
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
      value: formatAlertValue(
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
      value: formatAlertValue(
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
      value: formatAlertValue(
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

  if (loading) return <div className="admin-empty">{t("health.loading")}</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("health.title")}</h1>
        <p>{t("health.subtitle")}</p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
          </p>
        </div>
      )}

      <div className="admin-toolbar">
        <div className="admin-toggle-group">
          <button
            className={`admin-toggle-btn ${activeTab === "alerts" ? "active" : ""}`}
            onClick={() => setActiveTab("alerts")}
          >
            {t("health.tab.alerts")} ({platformAlerts.length})
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "adapters" ? "active" : ""}`}
            onClick={() => setActiveTab("adapters")}
          >
            {t("health.tab.adapters")} ({adapters.length})
          </button>
        </div>
        <button className="admin-btn admin-btn--secondary" onClick={loadData}>
          {t("common.refresh")}
        </button>
        {lastRefresh && (
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {t("health.lastRefresh", { time: lastRefresh })}
          </span>
        )}
      </div>

      {activeTab === "alerts" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div className="admin-card">
              <div className="admin-card-label">
                {t("health.summary.critical")}
              </div>
              <div className="admin-card-value">
                {
                  platformAlerts.filter((alert) => alert.state === "critical")
                    .length
                }
              </div>
            </div>
            <div className="admin-card">
              <div className="admin-card-label">
                {t("health.summary.warning")}
              </div>
              <div className="admin-card-value">
                {
                  platformAlerts.filter((alert) => alert.state === "warning")
                    .length
                }
              </div>
            </div>
            <div className="admin-card">
              <div className="admin-card-label">
                {t("health.summary.webhookFailures")}
              </div>
              <div className="admin-card-value">
                {observability.webhook.failedDeliveriesLastHour}
              </div>
            </div>
            <div className="admin-card">
              <div className="admin-card-label">
                {t("health.summary.reviewQueue")}
              </div>
              <div className="admin-card-value">
                {observability.eligibility.totalReviewQueue}
              </div>
            </div>
          </div>

          <div className="admin-card" style={{ marginBottom: 16 }}>
            {platformAlerts.length === 0 ? (
              <p className="admin-empty">{t("health.noAlerts")}</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("health.col.alert")}</th>
                    <th>{t("health.col.status")}</th>
                    <th>{t("health.col.measured")}</th>
                    <th>{t("health.col.threshold")}</th>
                    <th>{t("health.col.route")}</th>
                  </tr>
                </thead>
                <tbody>
                  {platformAlerts.map((alert) => (
                    <tr key={alert.key}>
                      <td>{t(`health.alert.${alert.key}.title`)}</td>
                      <td>
                        <span
                          className={`admin-badge ${getAlertBadge(alert.state)}`}
                        >
                          {formatPlatformCodeLabel(locale, alert.state)}
                        </span>
                      </td>
                      <td>
                        {formatAlertValue(
                          alert.measuredValue,
                          alert.thresholds.unit,
                          locale,
                        )}
                      </td>
                      <td>
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
                      </td>
                      <td>
                        {alert.routes
                          .map((route) =>
                            route === "platform"
                              ? t("health.route.platform")
                              : t("health.route.ops"),
                          )
                          .join(" / ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {metricCards.map((metric) => (
              <div className="admin-card" key={metric.title}>
                <div className="admin-card-label">{metric.title}</div>
                <div className="admin-card-value">{metric.value}</div>
                <div style={{ color: "#6b7280", fontSize: 13 }}>
                  {metric.note}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === "adapters" && (
        <div className="admin-card">
          {adapters.length === 0 ? (
            <p className="admin-empty">{t("health.noAdapters")}</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("health.col.adapter")}</th>
                  <th>{t("health.col.status")}</th>
                  <th>{t("health.col.lastCheck")}</th>
                  <th>{t("health.col.message")}</th>
                </tr>
              </thead>
              <tbody>
                {adapters.map((adapter) => (
                  <tr key={adapter.adapterId}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {adapter.adapterId}
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${getAlertBadge(adapter.status)}`}
                      >
                        {formatPlatformCodeLabel(locale, adapter.status)}
                      </span>
                    </td>
                    <td>
                      {adapter.lastCheck
                        ? new Date(adapter.lastCheck).toLocaleString()
                        : "—"}
                    </td>
                    <td
                      style={{
                        maxWidth: 320,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {adapter.message || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
