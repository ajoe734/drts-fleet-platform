/**
 * Operational Health Page
 * Workflow alert monitoring plus forwarder adapter detail.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";
import type {
  CanvasShellNavItem,
  CanvasTableColumn,
  CanvasTheme,
  CanvasTone,
} from "@drts/ui-web";

type AdapterHealth = {
  adapterId: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  lastCheck: string;
  message?: string | null;
};

type AdapterTableRow = AdapterHealth & Record<string, unknown>;

const PLATFORM_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

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

function alertStateTone(state: string): CanvasTone {
  switch (state) {
    case "critical":
      return "danger";
    case "warning":
      return "warn";
    case "healthy":
      return "success";
    default:
      return "neutral";
  }
}

function adapterStatusTone(status: string): CanvasTone {
  switch (status) {
    case "healthy":
      return "success";
    case "degraded":
      return "warn";
    case "down":
      return "danger";
    default:
      return "neutral";
  }
}

function viewportStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 10,
    background: theme.bg,
  };
}

function pageBodyStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    padding: "16px 24px 24px",
    display: "flex",
    flexDirection: "column",
    gap: theme.sectGap,
  };
}

function kpiGridStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  };
}

function alertRowStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    borderBottom: `1px solid ${theme.border}`,
  };
}

function emptyStateStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    padding: 12,
    color: theme.textMuted,
    fontSize: 12.5,
  };
}

export default function HealthPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const theme = PLATFORM_THEME;
  const [adapters, setAdapters] = useState<AdapterHealth[]>([]);
  const [observability, setObservability] =
    useState<OperationalObservabilitySnapshot>(
      createFallbackObservabilitySnapshot(),
    );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adapterData, operationalData] = await Promise.all([
        client.getForwarderAdaptersHealth() as Promise<AdapterHealthRecord[]>,
        client.getOperationalObservability(),
      ]);
      const adapterList: AdapterHealth[] = adapterData.map(
        (adapter: AdapterHealthRecord) => ({
          adapterId: adapter.platformCode,
          status: adapter.status ?? "unknown",
          lastCheck: adapter.lastCheckedAt ?? "",
          message: adapter.lastError,
        }),
      );

      setAdapters(adapterList);
      setObservability(operationalData);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const platformAlerts = useMemo(() => {
    const platformAlertKeys = new Set(
      observability.roleViews.find((view) => view.route === "platform")
        ?.alertKeys ?? [],
    );
    return observability.alerts
      .filter(
        (alert) =>
          platformAlertKeys.has(alert.key) || alert.routes.includes("platform"),
      )
      .sort(
        (left, right) =>
          ALERT_SEVERITY_ORDER[left.state] - ALERT_SEVERITY_ORDER[right.state],
      );
  }, [observability]);

  const navLabels =
    locale === "en"
      ? {
          home: "Home",
          health: "Health & Alerts",
          tenantGroup: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partners",
          users: "Users",
          fleetGroup: "Fleet & Compliance",
          fleet: "Fleet & Devices",
          switchboard: "Switchboard",
          pricingGroup: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Payments",
          platformGroup: "Platform Layer",
          notices: "Notices",
          audit: "Audit Trail",
          flags: "Feature Flags",
          adapters: "Adapter Registry",
        }
      : {
          home: "工作首頁",
          health: "平台健康",
          tenantGroup: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴",
          users: "平台人員",
          fleetGroup: "車隊與合規",
          fleet: "車隊與設備",
          switchboard: "法定資訊與牌貼",
          pricingGroup: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformGroup: "平台層",
          notices: "公告與維護",
          audit: "稽核軌跡",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  const breadcrumbParent = locale === "en" ? "Platform health" : "平台健康";
  const searchPlaceholder =
    locale === "en"
      ? "Search orders, tenants, drivers..."
      : "搜尋訂單、租戶、司機...";
  const alertsCardTitle = locale === "en" ? "Active alerts" : "Active alerts";
  const alertsCardSubtitle =
    locale === "en"
      ? "Cross-module alerts that platform owners must review."
      : "跨模組告警總覽";
  const adaptersCardTitle =
    locale === "en" ? "Adapter inventory" : "Adapter inventory";
  const adaptersCardSubtitle =
    locale === "en"
      ? "Forwarder adapter status reported by the platform health probe."
      : "由平台健康探測回報的轉發器狀態";
  const tabLabels = ["Alerts", "Dispatch", "Webhook", "Filing", "Adapters"];
  const errorTitle = getPlatformLabel(locale, "error");
  const dangerousCount = platformAlerts.filter(
    (alert) => alert.state === "critical",
  ).length;

  const shellNav: CanvasShellNavItem[] = [
    { key: "home", href: "/", label: navLabels.home, icon: "dashboard" },
    {
      key: "health",
      href: "/health",
      label: navLabels.health,
      icon: "health",
      badge: dangerousCount > 0 ? String(dangerousCount) : undefined,
      badgeTone: dangerousCount > 0 ? "danger" : "neutral",
    },
    { divider: navLabels.tenantGroup },
    {
      key: "tenants",
      href: "/tenants",
      label: navLabels.tenants,
      icon: "tenants",
    },
    {
      key: "partners",
      href: "/partners",
      label: navLabels.partners,
      icon: "partners",
    },
    { key: "users", href: "/users", label: navLabels.users, icon: "users" },
    { divider: navLabels.fleetGroup },
    { key: "fleet", href: "/fleet", label: navLabels.fleet, icon: "fleet" },
    {
      key: "switchboard",
      href: "/switchboard",
      label: navLabels.switchboard,
      icon: "switchboard",
    },
    { divider: navLabels.pricingGroup },
    {
      key: "pricing",
      href: "/pricing",
      label: navLabels.pricing,
      icon: "pricing",
    },
    {
      key: "payments",
      href: "/payments",
      label: navLabels.payments,
      icon: "payments",
    },
    { divider: navLabels.platformGroup },
    {
      key: "notices",
      href: "/notices",
      label: navLabels.notices,
      icon: "notices",
    },
    { key: "audit", href: "/audit", label: navLabels.audit, icon: "audit" },
    {
      key: "flags",
      href: "/feature-flags",
      label: navLabels.flags,
      icon: "flags",
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      label: navLabels.adapters,
      icon: "adapters",
    },
  ];

  const adapterColumns: CanvasTableColumn<AdapterTableRow>[] = [
    {
      h: t("health.col.adapter"),
      w: 200,
      mono: true,
      r: (adapter) => adapter.adapterId,
    },
    {
      h: t("health.col.status"),
      w: 140,
      r: (adapter) => (
        <CanvasPill theme={theme} tone={adapterStatusTone(adapter.status)} dot>
          {formatPlatformCodeLabel(locale, adapter.status)}
        </CanvasPill>
      ),
    },
    {
      h: t("health.col.lastCheck"),
      w: 200,
      mono: true,
      r: (adapter) =>
        adapter.lastCheck ? new Date(adapter.lastCheck).toLocaleString() : "—",
    },
    {
      h: t("health.col.message"),
      r: (adapter) => (
        <span
          style={{
            color: theme.textMuted,
            fontSize: 12,
            whiteSpace: "normal",
          }}
        >
          {adapter.message || "—"}
        </span>
      ),
    },
  ];

  return (
    <div style={viewportStyle(theme)}>
      <CanvasShell
        theme={theme}
        nav={shellNav}
        active="health"
        brandLabel={t("app.name")}
        brandSubLabel={t("app.sub")}
        breadcrumb={[breadcrumbParent, t("health.title")]}
        env="production"
        versionLabel="canvas"
        searchPlaceholder={searchPlaceholder}
        avatarLabel={locale === "en" ? "PA" : "平台"}
        style={{ height: "100%" }}
      >
        <CanvasPageHeader
          theme={theme}
          title={t("health.title")}
          subtitle={t("health.subtitle")}
          tabs={tabLabels}
          activeTab="Alerts"
          actions={
            <>
              {lastRefresh ? (
                <span
                  style={{
                    fontSize: 11.5,
                    color: theme.textMuted,
                    alignSelf: "center",
                    fontFamily: theme.monoFamily,
                  }}
                >
                  {t("health.lastRefresh", { time: lastRefresh })}
                </span>
              ) : null}
              <CanvasBtn
                theme={theme}
                variant="secondary"
                onClick={() => void loadData()}
                disabled={loading}
              >
                {t("common.refresh")}
              </CanvasBtn>
            </>
          }
        />

        <div style={pageBodyStyle(theme)}>
          {error ? (
            <CanvasBanner
              theme={theme}
              tone="danger"
              icon="warn"
              title={errorTitle}
              body={error}
            />
          ) : null}

          {loading && platformAlerts.length === 0 && adapters.length === 0 ? (
            <CanvasCard theme={theme}>
              <div style={emptyStateStyle(theme)}>{t("health.loading")}</div>
            </CanvasCard>
          ) : (
            <>
              <div style={kpiGridStyle()}>
                <CanvasKPI
                  theme={theme}
                  label={t("health.metric.dispatch.title")}
                  value={formatAlertValue(
                    observability.dispatch.oldestReadyOrderLagMinutes ?? 0,
                    "minutes",
                    locale,
                  )}
                  delta={
                    observability.dispatch.laggedOrders > 0
                      ? locale === "en"
                        ? `${observability.dispatch.laggedOrders} lagged`
                        : `${observability.dispatch.laggedOrders} 筆延遲`
                      : locale === "en"
                        ? "ok"
                        : "ok"
                  }
                  deltaTone={
                    observability.dispatch.laggedOrders > 0 ? "down" : "up"
                  }
                  sub={t("health.metric.dispatch.note", {
                    count: observability.dispatch.laggedOrders,
                  })}
                />
                <CanvasKPI
                  theme={theme}
                  label={t("health.metric.webhook.title")}
                  value={formatAlertValue(
                    observability.webhook.failedDeliveriesLastHour,
                    "count",
                    locale,
                  )}
                  delta={
                    observability.webhook.queuedDeliveries > 0
                      ? locale === "en"
                        ? `${observability.webhook.queuedDeliveries} queued`
                        : `${observability.webhook.queuedDeliveries} 筆排隊`
                      : undefined
                  }
                  deltaTone={
                    observability.webhook.failedDeliveriesLastHour > 0
                      ? "down"
                      : "neutral"
                  }
                  sub={t("health.metric.webhook.note", {
                    count: observability.webhook.queuedDeliveries,
                  })}
                />
                <CanvasKPI
                  theme={theme}
                  label={t("health.metric.eligibility.title")}
                  value={formatAlertValue(
                    observability.eligibility.totalReviewQueue,
                    "count",
                    locale,
                  )}
                  sub={t("health.metric.eligibility.note", {
                    count: observability.eligibility.manualReviewQueue,
                  })}
                />
                <CanvasKPI
                  theme={theme}
                  label={t("health.metric.reporting.title")}
                  value={formatAlertValue(
                    observability.reporting.failedJobs,
                    "count",
                    locale,
                  )}
                  delta={
                    observability.reporting.failedJobs === 0
                      ? locale === "en"
                        ? "ok"
                        : "ok"
                      : undefined
                  }
                  deltaTone={
                    observability.reporting.failedJobs === 0 ? "up" : "down"
                  }
                  sub={t("health.metric.reporting.note", {
                    count: observability.reporting.queuedJobs,
                  })}
                />
              </div>

              <CanvasCard
                theme={theme}
                title={alertsCardTitle}
                subtitle={alertsCardSubtitle}
              >
                {platformAlerts.length === 0 ? (
                  <div style={emptyStateStyle(theme)}>
                    {t("health.noAlerts")}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {platformAlerts.map((alert, index) => (
                      <div
                        key={alert.key}
                        style={{
                          ...alertRowStyle(theme),
                          borderBottom:
                            index === platformAlerts.length - 1
                              ? "none"
                              : `1px solid ${theme.border}`,
                        }}
                      >
                        <CanvasPill
                          theme={theme}
                          tone={alertStateTone(alert.state)}
                          dot
                        >
                          {alert.routes
                            .map((route) =>
                              route === "platform"
                                ? t("health.route.platform")
                                : t("health.route.ops"),
                            )
                            .join(" / ")}
                        </CanvasPill>
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12.5,
                              color: theme.text,
                              fontWeight: 500,
                            }}
                          >
                            {t(`health.alert.${alert.key}.title`)}
                          </span>
                          <span
                            style={{
                              fontSize: 11.5,
                              color: theme.textMuted,
                              fontFamily: theme.monoFamily,
                            }}
                          >
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
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 11.5,
                            color: theme.text,
                            fontFamily: theme.monoFamily,
                            fontWeight: 600,
                          }}
                        >
                          {formatAlertValue(
                            alert.measuredValue,
                            alert.thresholds.unit,
                            locale,
                          )}
                        </span>
                        <CanvasPill
                          theme={theme}
                          tone={alertStateTone(alert.state)}
                        >
                          {formatPlatformCodeLabel(locale, alert.state)}
                        </CanvasPill>
                      </div>
                    ))}
                  </div>
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={adaptersCardTitle}
                subtitle={adaptersCardSubtitle}
                padding={0}
              >
                {adapters.length === 0 ? (
                  <div style={emptyStateStyle(theme)}>
                    {t("health.noAdapters")}
                  </div>
                ) : (
                  <CanvasTable<AdapterTableRow>
                    theme={theme}
                    columns={adapterColumns}
                    rows={adapters as AdapterTableRow[]}
                  />
                )}
              </CanvasCard>
            </>
          )}
        </div>
      </CanvasShell>
    </div>
  );
}
