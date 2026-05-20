"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  AdapterHealthRecord,
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
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type AdapterRow = AdapterHealthRecord &
  Record<string, unknown> & {
    sourceLabel: string;
    kindLabel: string;
    credentialLabel: string;
    lastEventLabel: string;
    messageLabel: string;
  };

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const alertListStyle = {
  display: "grid",
} satisfies CSSProperties;

const alertRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 0",
  borderBottom: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const alertTextStyle = {
  flex: 1,
  minWidth: 0,
  display: "grid",
  gap: 3,
} satisfies CSSProperties;

const alertTitleStyle = {
  fontSize: 12.5,
  color: theme.text,
  lineHeight: 1.35,
} satisfies CSSProperties;

const alertMetaStyle = {
  fontSize: 11,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const alertValueStyle = {
  fontSize: 11.5,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const monoCellStyle = {
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const emptyStateStyle = {
  padding: "4px 0",
} satisfies CSSProperties;

const ALERT_SEVERITY_ORDER: Record<OperationalAlertRecord["state"], number> = {
  critical: 0,
  warning: 1,
  healthy: 2,
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

function buildPlatformNav(
  locale: "en" | "zh",
  platformAlertCount: number,
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
      badge: platformAlertCount > 0 ? String(platformAlertCount) : undefined,
      badgeTone: platformAlertCount > 0 ? "warn" : "neutral",
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

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function alertTone(state: OperationalAlertRecord["state"]): CanvasTone {
  switch (state) {
    case "critical":
      return "danger";
    case "warning":
      return "warn";
    default:
      return "success";
  }
}

function adapterTone(status: AdapterHealthRecord["status"]): CanvasTone {
  switch (status) {
    case "down":
      return "danger";
    case "degraded":
      return "warn";
    default:
      return "success";
  }
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
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function resolveAlertTitle(
  alert: OperationalAlertRecord,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const key = `health.alert.${alert.key}.title`;
  const translated = t(key);
  return translated === key ? humanizeCode(alert.key) : translated;
}

function alertHref(alert: OperationalAlertRecord) {
  switch (alert.key) {
    case "adapter_degradation":
      return "/adapter-registry";
    case "dispatch_lag":
      return "/";
    default:
      return "/health";
  }
}

function adapterKindLabel(row: AdapterHealthRecord, locale: "en" | "zh") {
  const mode = humanizeCode(row.capabilitySummary.mode);
  const status = humanizeCode(row.capabilitySummary.productionStatus);
  return locale === "en" ? `${mode} · ${status}` : `${mode} · ${status}`;
}

function adapterCredentialLabel(row: AdapterHealthRecord, locale: "en" | "zh") {
  return [
    formatPlatformCodeLabel(locale, row.credentialStatus),
    formatPlatformCodeLabel(locale, row.authStatus),
  ].join(" / ");
}

function adapterLastEventLabel(row: AdapterHealthRecord, locale: "en" | "zh") {
  const lastEventAt =
    row.lastWebhookReceivedAt ?? row.lastRateLimitAt ?? row.lastAuthFailureAt;

  if (!lastEventAt) {
    return locale === "en" ? "No recent event" : "近期無事件";
  }

  return formatDateTime(lastEventAt);
}

export default function HealthPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const client = usePlatformAdminClient();
  const [adapters, setAdapters] = useState<AdapterHealthRecord[]>([]);
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
          breadcrumb: ["Platform Health"],
          tabs: ["Alerts", "Dispatch", "Webhook", "Filing", "Adapters"],
          refresh: t("common.refresh"),
          loading: t("health.loading"),
          errorTitle: "Unable to load health snapshot",
          activeAlerts: "Active alerts",
          activeAlertsSubtitle: "Cross-module platform-routed alert queue",
          inventoryTitle: "Adapter inventory",
          inventorySubtitle:
            "Forwarder surfaces, auth posture, and webhook health",
          source: "Source",
          kind: "Kind",
          credential: "Credential / Auth",
          lastEvent: "Last event",
          view: t("common.view"),
        }
      : {
          breadcrumb: ["平台健康"],
          tabs: ["警示", "派車", "Webhook", "申報", "轉發器"],
          refresh: t("common.refresh"),
          loading: t("health.loading"),
          errorTitle: "無法載入健康快照",
          activeAlerts: "Active alerts",
          activeAlertsSubtitle: "跨模組且路由到平台端的告警佇列",
          inventoryTitle: "Adapter inventory",
          inventorySubtitle: "轉發器面向、授權狀態與 Webhook 健康度",
          source: "來源",
          kind: "類型",
          credential: "憑證 / Auth",
          lastEvent: "最後事件",
          view: t("common.view"),
        };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adapterData, operationalData] = await Promise.all([
        client.getForwarderAdaptersHealth() as Promise<AdapterHealthRecord[]>,
        client.getOperationalObservability(),
      ]);
      setAdapters(adapterData ?? []);
      setObservability(operationalData);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const platformAlertKeys = useMemo(
    () =>
      new Set<string>(
        observability.roleViews.find(
          (view: { route: string }) => view.route === "platform",
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
            (ALERT_SEVERITY_ORDER[left.state] ?? Number.MAX_SAFE_INTEGER) -
            (ALERT_SEVERITY_ORDER[right.state] ?? Number.MAX_SAFE_INTEGER),
        ),
    [observability.alerts, platformAlertKeys],
  );

  const shellNav = useMemo(
    () => buildPlatformNav(locale, platformAlerts.length),
    [locale, platformAlerts.length],
  );

  const kpis = useMemo(
    () => [
      {
        label: t("health.metric.dispatch.title"),
        value: formatAlertValue(
          observability.dispatch.oldestReadyOrderLagMinutes ?? 0,
          "minutes",
          locale,
        ),
        delta:
          observability.dispatch.laggedOrders > 0
            ? `${observability.dispatch.laggedOrders}`
            : locale === "en"
              ? "ok"
              : "正常",
        deltaTone:
          observability.dispatch.laggedOrders > 0
            ? ("down" as const)
            : ("up" as const),
        sub: t("health.metric.dispatch.note", {
          count: observability.dispatch.laggedOrders,
        }),
      },
      {
        label: t("health.metric.webhook.title"),
        value: formatAlertValue(
          observability.webhook.failedDeliveriesLastHour,
          "count",
          locale,
        ),
        delta:
          observability.webhook.queuedDeliveries > 0
            ? `q ${observability.webhook.queuedDeliveries}`
            : locale === "en"
              ? "clear"
              : "清空",
        deltaTone:
          observability.webhook.queuedDeliveries > 0
            ? ("down" as const)
            : ("up" as const),
        sub: t("health.metric.webhook.note", {
          count: observability.webhook.queuedDeliveries,
        }),
      },
      {
        label: t("health.metric.eligibility.title"),
        value: formatAlertValue(
          observability.eligibility.totalReviewQueue,
          "count",
          locale,
        ),
        delta:
          observability.eligibility.manualReviewQueue > 0
            ? `${observability.eligibility.manualReviewQueue}`
            : locale === "en"
              ? "ok"
              : "正常",
        deltaTone:
          observability.eligibility.manualReviewQueue > 0
            ? ("down" as const)
            : ("up" as const),
        sub: t("health.metric.eligibility.note", {
          count: observability.eligibility.manualReviewQueue,
        }),
      },
      {
        label: t("health.metric.reporting.title"),
        value: formatAlertValue(
          observability.reporting.failedJobs,
          "count",
          locale,
        ),
        delta:
          observability.reporting.failedJobs > 0
            ? `${observability.reporting.failedJobs}`
            : locale === "en"
              ? "ok"
              : "正常",
        deltaTone:
          observability.reporting.failedJobs > 0
            ? ("down" as const)
            : ("up" as const),
        sub: t("health.metric.reporting.note", {
          count: observability.reporting.queuedJobs,
        }),
      },
    ],
    [locale, observability, t],
  );

  const adapterRows = useMemo<AdapterRow[]>(
    () =>
      adapters.map((row) => ({
        ...row,
        sourceLabel: formatPlatformCodeLabel(locale, row.platformCode),
        kindLabel: adapterKindLabel(row, locale),
        credentialLabel: adapterCredentialLabel(row, locale),
        lastEventLabel: adapterLastEventLabel(row, locale),
        messageLabel: row.lastError ?? "—",
      })),
    [adapters, locale],
  );

  const adapterColumns = useMemo<CanvasTableColumn<AdapterRow>[]>(
    () => [
      {
        h: t("health.col.adapter"),
        w: 140,
        mono: true,
        r: (row) => <span style={monoCellStyle}>{row.platformCode}</span>,
      },
      { h: copy.source, k: "sourceLabel", w: 150 },
      { h: copy.kind, k: "kindLabel", w: 180 },
      {
        h: t("health.col.status"),
        w: 124,
        r: (row) => (
          <CanvasPill theme={theme} tone={adapterTone(row.status)} dot>
            {formatPlatformCodeLabel(locale, row.status)}
          </CanvasPill>
        ),
      },
      { h: copy.credential, k: "credentialLabel", w: 180 },
      { h: copy.lastEvent, k: "lastEventLabel", w: 160, mono: true },
      {
        h: t("health.col.lastCheck"),
        w: 170,
        mono: true,
        r: (row) => formatDateTime(row.lastCheckedAt),
      },
      {
        h: t("health.col.message"),
        w: 260,
        r: (row) => (
          <span
            style={{
              display: "inline-block",
              maxWidth: 240,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={row.messageLabel}
          >
            {row.messageLabel}
          </span>
        ),
      },
    ],
    [copy.credential, copy.kind, copy.lastEvent, copy.source, locale, t],
  );

  return (
    <CanvasShell
      theme={theme}
      nav={shellNav}
      active="health"
      breadcrumb={copy.breadcrumb}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={t("health.title")}
        subtitle={t("health.subtitle")}
        tabs={copy.tabs}
        activeTab={copy.tabs[0]}
        actions={
          <>
            {lastRefresh ? (
              <div
                style={{
                  alignSelf: "center",
                  color: theme.textDim,
                  fontSize: 11.5,
                  fontFamily: theme.monoFamily,
                  whiteSpace: "nowrap",
                }}
              >
                {t("health.lastRefresh", { time: lastRefresh })}
              </div>
            ) : null}
            <CanvasBtn
              theme={theme}
              icon="refresh"
              onClick={() => {
                void loadData();
              }}
            >
              {copy.refresh}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        {loading ? (
          <CanvasBanner theme={theme} tone="info" title={copy.loading} />
        ) : null}

        <div style={kpiGridStyle}>
          {kpis.map((metric) => (
            <CanvasKPI
              key={String(metric.label)}
              theme={theme}
              label={metric.label}
              value={metric.value}
              delta={metric.delta}
              deltaTone={metric.deltaTone}
              sub={metric.sub}
            />
          ))}
        </div>

        <CanvasCard
          theme={theme}
          title={copy.activeAlerts}
          subtitle={copy.activeAlertsSubtitle}
        >
          {platformAlerts.length === 0 ? (
            <div style={emptyStateStyle}>
              <CanvasBanner
                theme={theme}
                tone="info"
                title={t("health.noAlerts")}
              />
            </div>
          ) : (
            <div style={alertListStyle}>
              {platformAlerts.map(
                (alert: OperationalAlertRecord, index: number) => (
                  <div
                    key={alert.key}
                    style={{
                      ...alertRowStyle,
                      borderBottom:
                        index === platformAlerts.length - 1
                          ? "none"
                          : alertRowStyle.borderBottom,
                    }}
                  >
                    <CanvasPill theme={theme} tone="info" dot>
                      {alert.routes.includes("platform")
                        ? t("health.route.platform")
                        : t("health.route.ops")}
                    </CanvasPill>
                    <div style={alertTextStyle}>
                      <div style={alertTitleStyle}>
                        {resolveAlertTitle(alert, t)}
                      </div>
                      <div style={alertMetaStyle}>
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
                        })}{" "}
                        · {formatDateTime(alert.observedAt)}
                      </div>
                    </div>
                    <CanvasPill theme={theme} tone={alertTone(alert.state)} dot>
                      {formatPlatformCodeLabel(locale, alert.state)}
                    </CanvasPill>
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
                      size="xs"
                      icon="ext"
                      onClick={() => {
                        router.push(alertHref(alert));
                      }}
                    >
                      {copy.view}
                    </CanvasBtn>
                  </div>
                ),
              )}
            </div>
          )}
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title={copy.inventoryTitle}
          subtitle={copy.inventorySubtitle}
          padding={0}
        >
          {adapterRows.length === 0 ? (
            <div style={{ padding: 16 }}>
              <CanvasBanner
                theme={theme}
                tone="info"
                title={t("health.noAdapters")}
              />
            </div>
          ) : (
            <CanvasTable<AdapterRow>
              theme={theme}
              columns={adapterColumns}
              rows={adapterRows}
            />
          )}
        </CanvasCard>
      </div>
    </CanvasShell>
  );
}
