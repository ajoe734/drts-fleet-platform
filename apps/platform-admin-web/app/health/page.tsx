/**
 * Operational Health Page
 * Workflow alert monitoring plus forwarder adapter detail.
 */

"use client";

import React, {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import type {
  AdapterHealthRecord,
  OperationalAlertRecord,
  OperationalObservabilitySnapshot,
} from "@drts/contracts";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
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
  type CanvasShellNavItem,
  type CanvasTableColumn,
} from "@drts/ui-web";

type HealthHeaderTab =
  | "alerts"
  | "dispatch"
  | "webhook"
  | "filing"
  | "adapters";

type AdapterInventoryRow = Record<string, unknown> & {
  id: string;
  source: string;
  sourceMeta: string;
  kind: string;
  status: AdapterHealthRecord["status"] | "unknown";
  latency: string;
  last: string;
  orders24h: string;
};

const DASH = "—";

const ALERT_SEVERITY_ORDER = {
  critical: 0,
  warning: 1,
  healthy: 2,
} as const;

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageBodyStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const alertRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 0",
} satisfies CSSProperties;

const alertTextStyle = {
  flex: 1,
  minWidth: 0,
  fontSize: 12.5,
  color: theme.text,
  lineHeight: 1.45,
} satisfies CSSProperties;

const alertValueStyle = {
  fontSize: 11,
  color: theme.textMuted,
  fontFamily: theme.monoFamily,
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const sourceCellMetaStyle = {
  display: "block",
  marginTop: 2,
  fontSize: 11,
  color: theme.textMuted,
} satisfies CSSProperties;

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

function buildPlatformNav(
  locale: "en" | "zh",
  alertCount: number,
  hasCriticalAlerts: boolean,
): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGov: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGov: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformLayer: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGov: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGov: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGov: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformLayer: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    {
      key: "health",
      href: "/health",
      icon: "health",
      label: labels.health,
      badge: alertCount > 0 ? String(alertCount) : undefined,
      badgeTone: hasCriticalAlerts ? "danger" : "warn",
    },
    { divider: labels.tenantGov },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetGov },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingGov },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: labels.pricing,
    },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: labels.payments,
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: labels.notices,
    },
    { key: "audit", href: "/audit", icon: "audit", label: labels.audit },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.flags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
  ];
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

function formatTimestamp(
  value: string | null | undefined,
  locale: "en" | "zh",
): string {
  if (!value) {
    return DASH;
  }

  try {
    return new Date(value).toLocaleString(locale === "en" ? "en-US" : "zh-TW", {
      hour12: false,
    });
  } catch {
    return value;
  }
}

function getPillTone(
  status:
    | AdapterHealthRecord["status"]
    | OperationalAlertRecord["state"]
    | "unknown",
) {
  switch (status) {
    case "healthy":
      return "success";
    case "warning":
    case "degraded":
      return "warn";
    case "critical":
    case "down":
      return "danger";
    default:
      return "neutral";
  }
}

function getAlertTitle(
  alert: OperationalAlertRecord,
  locale: "en" | "zh",
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const key = `health.alert.${alert.key}.title`;
  const translated = t(key);
  return translated === key
    ? formatPlatformCodeLabel(locale, alert.key)
    : translated;
}

function getAlertTab(alert: OperationalAlertRecord): HealthHeaderTab {
  if (alert.key.includes("dispatch")) {
    return "dispatch";
  }
  if (alert.key.includes("webhook")) {
    return "webhook";
  }
  if (
    alert.key.includes("eligibility") ||
    alert.key.includes("recording") ||
    alert.key.includes("filing")
  ) {
    return "filing";
  }
  if (alert.key.includes("adapter")) {
    return "adapters";
  }
  return "alerts";
}

function latestEventTimestamp(
  events: Array<{ label: string; at: string | null | undefined }>,
) {
  return events
    .filter((event) => event.at)
    .sort((left, right) => {
      const leftTime = Date.parse(left.at ?? "");
      const rightTime = Date.parse(right.at ?? "");
      return (
        (Number.isNaN(rightTime) ? 0 : rightTime) -
        (Number.isNaN(leftTime) ? 0 : leftTime)
      );
    })[0];
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
  const [activeTab, setActiveTab] = useState<HealthHeaderTab>("alerts");

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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
          searchPlaceholder: "Search modules, adapters, alerts",
          tabs: {
            alerts: t("health.tab.alerts"),
            dispatch: "Dispatch",
            webhook: "Webhook",
            filing: "Filing",
            adapters: t("health.tab.adapters"),
          } satisfies Record<HealthHeaderTab, string>,
          alertsTitle: "Active alerts",
          alertsSubtitle: "Cross-module alert overview.",
          inventoryTitle: "Adapter inventory",
          source: "Source",
          kind: "Kind",
          kindForwarder: "forwarder",
          latency: "Latency",
          lastEvent: "Last event",
          orders24h: "orders 24h",
          eventCheck: "Checked",
          eventWebhook: "Webhook",
          eventAuth: "Auth failure",
          eventRateLimit: "Rate limit",
          loadingTitle: "Loading health data...",
          loadingBody: "Fetching operational observability and adapter health.",
          errorTitle: "Unable to load health data",
          noInventory: t("health.noAdapters"),
        }
      : {
          searchPlaceholder: "搜尋模組、adapter、警示",
          tabs: {
            alerts: t("health.tab.alerts"),
            dispatch: "派車",
            webhook: "Webhook",
            filing: "申報",
            adapters: t("health.tab.adapters"),
          } satisfies Record<HealthHeaderTab, string>,
          alertsTitle: "Active alerts",
          alertsSubtitle: "跨模組告警總覽",
          inventoryTitle: "Adapter inventory",
          source: "來源",
          kind: "型態",
          kindForwarder: "轉發器",
          latency: "延遲",
          lastEvent: "最近事件",
          orders24h: "24h 訂單",
          eventCheck: "檢查",
          eventWebhook: "Webhook",
          eventAuth: "驗證失敗",
          eventRateLimit: "限流",
          loadingTitle: "載入健康資料中...",
          loadingBody: "正在抓取 observability 與 adapter health。",
          errorTitle: "無法載入健康資料",
          noInventory: t("health.noAdapters"),
        };

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

  const criticalAlertCount = platformAlerts.filter(
    (alert) => alert.state === "critical",
  ).length;

  const navItems = buildPlatformNav(
    locale,
    platformAlerts.length,
    criticalAlertCount > 0,
  );
  const headerTabs = [
    copy.tabs.alerts,
    copy.tabs.dispatch,
    copy.tabs.webhook,
    copy.tabs.filing,
    copy.tabs.adapters,
  ];

  const focusSection = (tab: HealthHeaderTab) => {
    setActiveTab(tab);

    const targetId =
      tab === "adapters"
        ? "health-adapters"
        : tab === "alerts"
          ? "health-alerts"
          : "health-kpis";

    document
      .getElementById(targetId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const inventoryRows: AdapterInventoryRow[] = Array.from(
    new Set([
      ...adapters.map((adapter) => adapter.platformCode),
      ...observability.adapterDetails.map((adapter) => adapter.platformCode),
    ]),
  )
    .map((adapterId) => {
      const adapter =
        adapters.find((entry) => entry.platformCode === adapterId) ?? null;
      const detail =
        observability.adapterDetails.find(
          (entry) => entry.platformCode === adapterId,
        ) ?? null;
      const capability =
        detail?.capabilitySummary ?? adapter?.capabilitySummary ?? null;
      const capabilityDescriptor = capability
        ? `${formatPlatformCodeLabel(
            locale,
            capability.mode,
          )} · ${formatPlatformCodeLabel(locale, capability.productionStatus)}`
        : formatPlatformCodeLabel(
            locale,
            detail?.reason ?? adapter?.reason ?? "unknown",
          );
      const lastEvent = latestEventTimestamp([
        {
          label: copy.eventWebhook,
          at: detail?.lastWebhookReceivedAt ?? adapter?.lastWebhookReceivedAt,
        },
        {
          label: copy.eventAuth,
          at: detail?.lastAuthFailureAt ?? adapter?.lastAuthFailureAt,
        },
        {
          label: copy.eventRateLimit,
          at: detail?.lastRateLimitAt ?? adapter?.lastRateLimitAt,
        },
        {
          label: copy.eventCheck,
          at: detail?.lastCheckedAt ?? adapter?.lastCheckedAt,
        },
      ]);

      return {
        id: adapterId,
        source: formatPlatformCodeLabel(locale, adapterId),
        sourceMeta: capabilityDescriptor,
        kind: copy.kindForwarder,
        status: detail?.status ?? adapter?.status ?? "unknown",
        latency: DASH,
        last: lastEvent
          ? `${lastEvent.label} · ${formatTimestamp(lastEvent.at, locale)}`
          : formatTimestamp(
              detail?.lastCheckedAt ?? adapter?.lastCheckedAt,
              locale,
            ),
        orders24h: DASH,
      };
    })
    .sort((left, right) => left.source.localeCompare(right.source));

  const inventoryColumns: CanvasTableColumn<AdapterInventoryRow>[] = [
    {
      h: t("health.col.adapter"),
      k: "id",
      w: 150,
      mono: true,
    },
    {
      h: copy.source,
      w: 180,
      r: (row) => (
        <div>
          <span>{String(row.source)}</span>
          <span style={sourceCellMetaStyle}>{String(row.sourceMeta)}</span>
        </div>
      ),
    },
    {
      h: copy.kind,
      k: "kind",
      w: 110,
      mono: true,
    },
    {
      h: t("health.col.status"),
      w: 140,
      r: (row) => (
        <CanvasPill theme={theme} tone={getPillTone(row.status)} dot>
          {formatPlatformCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: copy.latency,
      k: "latency",
      mono: true,
      align: "right",
      w: 110,
    },
    {
      h: copy.lastEvent,
      k: "last",
      w: 130,
      mono: true,
    },
    {
      h: copy.orders24h,
      k: "orders24h",
      mono: true,
      align: "right",
    },
  ];

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="health"
      currentPath="/health"
      brandLabel={t("app.name")}
      brandSubLabel={t("app.sub")}
      breadcrumb={[t("health.title")]}
      searchPlaceholder={copy.searchPlaceholder}
      avatarLabel={locale === "en" ? "PA" : "平台"}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={t("health.title")}
        subtitle={t("health.subtitle")}
        sticky={false}
        tabs={headerTabs}
        activeTab={copy.tabs[activeTab]}
        actions={
          <CanvasBtn
            theme={theme}
            icon="refresh"
            onClick={() => void loadData()}
          >
            {t("common.refresh")}
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        {loading ? (
          <CanvasCard
            theme={theme}
            title={copy.loadingTitle}
            subtitle={copy.loadingBody}
          >
            <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
              {t("health.loading")}
            </div>
          </CanvasCard>
        ) : (
          <>
            <div id="health-kpis" style={kpiGridStyle}>
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
                    ? `${observability.dispatch.laggedOrders.toLocaleString(
                        locale === "en" ? "en-US" : "zh-TW",
                      )}`
                    : locale === "en"
                      ? "ok"
                      : "正常"
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
                    ? `${observability.webhook.queuedDeliveries.toLocaleString(
                        locale === "en" ? "en-US" : "zh-TW",
                      )} queued`
                    : locale === "en"
                      ? "ok"
                      : "正常"
                }
                deltaTone={
                  observability.webhook.failedDeliveriesLastHour > 0
                    ? "down"
                    : "up"
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
                  observability.reporting.failedJobs > 0
                    ? `${observability.reporting.failedJobs.toLocaleString(
                        locale === "en" ? "en-US" : "zh-TW",
                      )}`
                    : locale === "en"
                      ? "ok"
                      : "正常"
                }
                deltaTone={
                  observability.reporting.failedJobs > 0 ? "down" : "up"
                }
                sub={t("health.metric.reporting.note", {
                  count: observability.reporting.queuedJobs,
                })}
              />
            </div>

            <div id="health-alerts">
              <CanvasCard
                theme={theme}
                title={copy.alertsTitle}
                subtitle={copy.alertsSubtitle}
              >
                {platformAlerts.length === 0 ? (
                  <p
                    style={{
                      margin: 0,
                      color: theme.textMuted,
                      fontSize: 12.5,
                    }}
                  >
                    {t("health.noAlerts")}
                  </p>
                ) : (
                  <div>
                    {platformAlerts.map((alert, index) => (
                      <div
                        key={alert.key}
                        style={{
                          ...alertRowStyle,
                          borderBottom:
                            index === platformAlerts.length - 1
                              ? "none"
                              : `1px solid ${theme.border}`,
                        }}
                      >
                        <CanvasPill
                          theme={theme}
                          tone={getPillTone(alert.state)}
                          dot
                        >
                          {copy.tabs[getAlertTab(alert)]}
                        </CanvasPill>
                        <span style={alertTextStyle}>
                          {getAlertTitle(alert, locale, t)} ·{" "}
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
                        <span style={alertValueStyle}>
                          {formatAlertValue(
                            alert.measuredValue,
                            alert.thresholds.unit,
                            locale,
                          )}
                        </span>
                        <CanvasBtn
                          theme={theme}
                          variant="ghost"
                          icon="ext"
                          size="xs"
                          onClick={() => focusSection(getAlertTab(alert))}
                        >
                          {t("common.view")}
                        </CanvasBtn>
                      </div>
                    ))}
                  </div>
                )}
              </CanvasCard>
            </div>

            <div id="health-adapters">
              <CanvasCard theme={theme} title={copy.inventoryTitle} padding={0}>
                {inventoryRows.length === 0 ? (
                  <div
                    style={{
                      padding: 16,
                      color: theme.textMuted,
                      fontSize: 12.5,
                    }}
                  >
                    {copy.noInventory}
                  </div>
                ) : (
                  <CanvasTable<AdapterInventoryRow>
                    theme={theme}
                    columns={inventoryColumns}
                    rows={inventoryRows}
                  />
                )}
              </CanvasCard>
            </div>
          </>
        )}
      </div>
    </CanvasShell>
  );
}
