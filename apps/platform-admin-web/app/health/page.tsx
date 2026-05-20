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
  CanvasDL,
  CanvasField,
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

type HealthTabKey = "alerts" | "dispatch" | "webhook" | "filing" | "adapters";

type AdapterRow = AdapterHealthRecord &
  Record<string, unknown> & {
    sourceLabel: string;
    kindLabel: string;
    credentialLabel: string;
    lastEventLabel: string;
    messageLabel: string;
  };

const theme = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageRootStyle = {
  minHeight: "100%",
  background: theme.bg,
  color: theme.text,
  fontFamily: theme.fontFamily,
} satisfies CSSProperties;

const pageBodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 16,
  alignItems: "end",
} satisfies CSSProperties;

const tabRailStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} satisfies CSSProperties;

const pillButtonStyle = {
  border: 0,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
} satisfies CSSProperties;

const summaryBoxStyle = {
  minWidth: 220,
  padding: "10px 12px",
  borderRadius: 8,
  background: theme.surfaceLo,
  border: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const summaryLabelStyle = {
  fontSize: 10.5,
  fontWeight: 600,
  color: theme.textMuted,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginBottom: 4,
} satisfies CSSProperties;

const summaryValueStyle = {
  color: theme.text,
  fontSize: 12.5,
  lineHeight: 1.4,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const splitLayoutStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.65fr) minmax(280px, 0.95fr)",
  gap: 16,
  alignItems: "start",
} satisfies CSSProperties;

const sideColumnStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const alertListStyle = {
  display: "grid",
} satisfies CSSProperties;

const alertRowStyle = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto auto auto",
  alignItems: "center",
  gap: 12,
  padding: "12px 0",
  borderBottom: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const alertTextStyle = {
  minWidth: 0,
  display: "grid",
  gap: 3,
} satisfies CSSProperties;

const alertTitleStyle = {
  fontSize: 12.5,
  fontWeight: 600,
  color: theme.text,
  lineHeight: 1.35,
} satisfies CSSProperties;

const alertMetaStyle = {
  fontSize: 11,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  lineHeight: 1.4,
} satisfies CSSProperties;

const alertValueStyle = {
  fontSize: 12,
  color: theme.text,
  fontFamily: theme.monoFamily,
  whiteSpace: "nowrap",
  fontWeight: 600,
} satisfies CSSProperties;

const emptyStateStyle = {
  padding: "4px 0",
} satisfies CSSProperties;

const monoCellStyle = {
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const stackedCellStyle = {
  display: "grid",
  gap: 4,
  minWidth: 0,
} satisfies CSSProperties;

const primaryTextStyle = {
  color: theme.text,
  fontWeight: 600,
} satisfies CSSProperties;

const secondaryTextStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.4,
  whiteSpace: "normal",
} satisfies CSSProperties;

const secondaryMonoStyle = {
  fontSize: 11,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  whiteSpace: "normal",
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

function tabTone(
  key: HealthTabKey,
  activeTab: HealthTabKey,
  hasAttention = false,
): CanvasTone {
  if (key === activeTab) {
    return hasAttention ? "warn" : "accent";
  }
  return hasAttention ? "warn" : "neutral";
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
  const [activeTab, setActiveTab] = useState<HealthTabKey>("alerts");

  const copy = useMemo(
    () =>
      locale === "en"
        ? {
            breadcrumb: ["Platform Health"],
            tabs: {
              alerts: "Alerts",
              dispatch: "Dispatch",
              webhook: "Webhook",
              filing: "Filing",
              adapters: "Adapters",
            },
            refresh: t("common.refresh"),
            loading: t("health.loading"),
            errorTitle: "Unable to load health snapshot",
            healthFocus: "Health focus",
            healthFocusHint:
              "Canvas tabs stay visible in the header; this rail keeps the active triage lane explicit.",
            activeAlerts: "Active alerts",
            activeAlertsSubtitle:
              "Cross-module alert posture kept in a compact operator triage lane.",
            inventoryTitle: "Adapter inventory",
            inventorySubtitle:
              "Forwarder surfaces, auth posture, and webhook health in one table.",
            summaryLabel: "Triage summary",
            source: "Source",
            kind: "Kind",
            credential: "Credential / Auth",
            lastEvent: "Last event",
            view: t("common.view"),
            registry: "Open adapter registry",
            stableTitle: "No platform-scoped alert is breaching thresholds.",
            stableBody:
              "Continue monitoring queue pressure and adapter readiness below.",
            warningTitle:
              "Platform attention is required across active queues or adapters.",
            warningBody:
              "Review threshold breaches, then use adapter inventory to separate transient health events from readiness problems.",
            postureTitle: "Health posture",
            postureSubtitle:
              "Compact platform snapshot for threshold pressure and focus areas.",
            pressureTitle: "Forwarder pressure",
            pressureSubtitle:
              "Keep live queue pressure separate from registry-level rollout truth.",
            focusAreas: "Focus areas",
            generatedAt: "Snapshot",
            refreshAt: "Last refresh",
            critical: t("health.summary.critical"),
            warning: t("health.summary.warning"),
            adaptersLabel: t("health.metric.adapters.title"),
            noIssues: "No active error reported",
          }
        : {
            breadcrumb: ["平台健康"],
            tabs: {
              alerts: "警示",
              dispatch: "派車",
              webhook: "Webhook",
              filing: "申報",
              adapters: "轉發器",
            },
            refresh: t("common.refresh"),
            loading: t("health.loading"),
            errorTitle: "無法載入健康快照",
            healthFocus: "Health focus",
            healthFocusHint:
              "Header 保留 canvas tabs；這裡額外標出目前正在 triage 的 lane。",
            activeAlerts: "Active alerts",
            activeAlertsSubtitle:
              "把跨模組告警濃縮成同一條 operator triage 路徑。",
            inventoryTitle: "Adapter inventory",
            inventorySubtitle:
              "把 forwarder 面向、auth 姿態與 webhook 健康度放進同一張表。",
            summaryLabel: "Triage summary",
            source: "來源",
            kind: "類型",
            credential: "憑證 / Auth",
            lastEvent: "最後事件",
            view: t("common.view"),
            registry: "前往 adapter registry",
            stableTitle: "目前沒有平台範圍 alert 超出門檻。",
            stableBody: "下方仍保留 queue pressure 與 adapter readiness 監看。",
            warningTitle: "目前有 queue 或 adapter 需要平台介入。",
            warningBody:
              "先從 threshold breach 判斷告警，再用 adapter inventory 區分是 live-health 事件還是 readiness 風險。",
            postureTitle: "健康姿態",
            postureSubtitle:
              "把平台層 threshold、queue 壓力與 focus areas 濃縮成側欄摘要。",
            pressureTitle: "轉派壓力",
            pressureSubtitle:
              "即時 queue 壓力刻意與 registry 層 rollout truth 分離。",
            focusAreas: "重點面向",
            generatedAt: "快照時間",
            refreshAt: "上次刷新",
            critical: t("health.summary.critical"),
            warning: t("health.summary.warning"),
            adaptersLabel: t("health.metric.adapters.title"),
            noIssues: "目前沒有回報錯誤",
          },
    [locale, t],
  );

  const tabList = useMemo(
    () =>
      [
        { key: "alerts", label: copy.tabs.alerts },
        { key: "dispatch", label: copy.tabs.dispatch },
        { key: "webhook", label: copy.tabs.webhook },
        { key: "filing", label: copy.tabs.filing },
        { key: "adapters", label: copy.tabs.adapters },
      ] satisfies Array<{ key: HealthTabKey; label: string }>,
    [copy.tabs],
  );

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

  const platformView = useMemo(
    () =>
      observability.roleViews.find(
        (view: { route: string }) => view.route === "platform",
      ),
    [observability.roleViews],
  );

  const platformAlertKeys = useMemo(
    () => new Set<string>(platformView?.alertKeys ?? []),
    [platformView],
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

  const criticalAlerts = platformAlerts.filter(
    (alert) => alert.state === "critical",
  ).length;
  const warningAlerts = platformAlerts.filter(
    (alert) => alert.state === "warning",
  ).length;
  const unhealthyAdapters =
    observability.adapters.degradedAdapters +
    observability.adapters.downAdapters;
  const bannerTone: Exclude<CanvasTone, "neutral" | "accent"> =
    criticalAlerts > 0 || observability.adapters.downAdapters > 0
      ? "danger"
      : warningAlerts > 0 || unhealthyAdapters > 0
        ? "warn"
        : "success";

  const focusAreas =
    platformView?.focusAreas
      .map((area: string) => formatPlatformCodeLabel(locale, area))
      .join(" / ") || "—";

  const summaryText = useMemo(() => {
    switch (activeTab) {
      case "dispatch":
        return t("health.metric.dispatch.note", {
          count: observability.dispatch.laggedOrders,
        });
      case "webhook":
        return t("health.metric.webhook.note", {
          count: observability.webhook.queuedDeliveries,
        });
      case "filing":
        return t("health.metric.reporting.note", {
          count: observability.reporting.queuedJobs,
        });
      case "adapters":
        return `${unhealthyAdapters} ${copy.adaptersLabel}`;
      case "alerts":
      default:
        return `${platformAlerts.length} ${copy.activeAlerts}`;
    }
  }, [
    activeTab,
    copy.activeAlerts,
    copy.adaptersLabel,
    observability,
    platformAlerts.length,
    t,
    unhealthyAdapters,
  ]);

  const kpis = useMemo(
    () => [
      {
        key: "dispatch",
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
        key: "webhook",
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
        key: "filing",
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
        key: "alerts",
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
        messageLabel: row.lastError ?? copy.noIssues,
      })),
    [adapters, copy.noIssues, locale],
  );

  const adapterColumns = useMemo<CanvasTableColumn<AdapterRow>[]>(
    () => [
      {
        h: t("health.col.adapter"),
        w: 150,
        r: (row) => (
          <div style={stackedCellStyle}>
            <span style={{ ...primaryTextStyle, ...monoCellStyle }}>
              {row.platformCode}
            </span>
            <span style={secondaryMonoStyle}>{row.sourceLabel}</span>
          </div>
        ),
      },
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
      {
        h: copy.credential,
        w: 170,
        r: (row) => (
          <span style={secondaryTextStyle}>{row.credentialLabel}</span>
        ),
      },
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
          <div style={stackedCellStyle}>
            <span style={secondaryTextStyle}>{row.messageLabel}</span>
          </div>
        ),
      },
    ],
    [copy.credential, copy.kind, copy.lastEvent, locale, t],
  );

  const postureItems = useMemo(
    () => [
      {
        k: copy.critical,
        v: criticalAlerts.toLocaleString(locale === "en" ? "en-US" : "zh-TW"),
      },
      {
        k: copy.warning,
        v: warningAlerts.toLocaleString(locale === "en" ? "en-US" : "zh-TW"),
      },
      {
        k: copy.adaptersLabel,
        v: unhealthyAdapters.toLocaleString(
          locale === "en" ? "en-US" : "zh-TW",
        ),
      },
      {
        k: copy.focusAreas,
        v: focusAreas,
      },
    ],
    [
      copy.adaptersLabel,
      copy.critical,
      copy.focusAreas,
      copy.warning,
      criticalAlerts,
      focusAreas,
      locale,
      unhealthyAdapters,
      warningAlerts,
    ],
  );

  const pressureItems = useMemo(
    () => [
      {
        k: locale === "en" ? "Forwarded orders" : "轉派訂單",
        v: observability.forwarderOps.totalForwardedOrders.toLocaleString(
          locale === "en" ? "en-US" : "zh-TW",
        ),
      },
      {
        k: locale === "en" ? "Sync failures" : "同步失敗",
        v: observability.forwarderOps.syncFailedOrders.toLocaleString(
          locale === "en" ? "en-US" : "zh-TW",
        ),
      },
      {
        k: locale === "en" ? "Accept pending" : "待接受",
        v: observability.forwarderOps.acceptPendingOrders.toLocaleString(
          locale === "en" ? "en-US" : "zh-TW",
        ),
      },
      {
        k: locale === "en" ? "Reconciliation queue" : "對帳佇列",
        v: observability.forwarderOps.reconciliationQueue.toLocaleString(
          locale === "en" ? "en-US" : "zh-TW",
        ),
      },
    ],
    [locale, observability.forwarderOps],
  );

  return (
    <CanvasShell
      theme={theme}
      nav={shellNav}
      active="health"
      breadcrumb={copy.breadcrumb}
      style={shellStyle}
    >
      <div style={pageRootStyle}>
        <CanvasPageHeader
          theme={theme}
          title={t("health.title")}
          subtitle={t("health.subtitle")}
          tabs={tabList.map((tab) => tab.label)}
          activeTab={tabList.find((tab) => tab.key === activeTab)?.label}
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
            <CanvasBanner theme={theme} tone="info" title={copy.loading} />
          ) : null}

          <CanvasCard theme={theme} padding={16}>
            <div style={filterGridStyle}>
              <CanvasField
                theme={theme}
                label={copy.healthFocus}
                hint={copy.healthFocusHint}
              >
                <div style={tabRailStyle}>
                  {tabList.map((tab) => {
                    const hasAttention =
                      (tab.key === "alerts" && platformAlerts.length > 0) ||
                      (tab.key === "dispatch" &&
                        observability.dispatch.laggedOrders > 0) ||
                      (tab.key === "webhook" &&
                        observability.webhook.queuedDeliveries > 0) ||
                      (tab.key === "filing" &&
                        (observability.eligibility.totalReviewQueue > 0 ||
                          observability.reporting.failedJobs > 0)) ||
                      (tab.key === "adapters" && unhealthyAdapters > 0);

                    return (
                      <button
                        key={tab.key}
                        type="button"
                        style={pillButtonStyle}
                        onClick={() => {
                          setActiveTab(tab.key);
                        }}
                      >
                        <CanvasPill
                          theme={theme}
                          tone={tabTone(tab.key, activeTab, hasAttention)}
                          dot={hasAttention}
                        >
                          {tab.label}
                        </CanvasPill>
                      </button>
                    );
                  })}
                </div>
              </CanvasField>

              <div style={summaryBoxStyle}>
                <div style={summaryLabelStyle}>{copy.summaryLabel}</div>
                <div style={summaryValueStyle}>{summaryText}</div>
              </div>
            </div>
          </CanvasCard>

          <CanvasBanner
            theme={theme}
            tone={bannerTone}
            title={
              bannerTone === "success" ? copy.stableTitle : copy.warningTitle
            }
            body={bannerTone === "success" ? copy.stableBody : copy.warningBody}
            actions={
              <CanvasBtn
                theme={theme}
                variant="secondary"
                size="xs"
                onClick={() => {
                  router.push("/adapter-registry");
                }}
              >
                {copy.registry}
              </CanvasBtn>
            }
          />

          <div style={kpiGridStyle}>
            {kpis.map((metric) => (
              <CanvasKPI
                key={metric.key}
                theme={theme}
                label={metric.label}
                value={metric.value}
                delta={metric.delta}
                deltaTone={metric.deltaTone}
                sub={metric.sub}
              />
            ))}
          </div>

          <div style={splitLayoutStyle}>
            <div style={{ display: "grid", gap: 16 }}>
              <CanvasCard
                theme={theme}
                title={copy.activeAlerts}
                subtitle={copy.activeAlertsSubtitle}
                actions={
                  <CanvasPill
                    theme={theme}
                    tone={platformAlerts.length > 0 ? "warn" : "neutral"}
                    dot={platformAlerts.length > 0}
                  >
                    {platformAlerts.length}
                  </CanvasPill>
                }
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
                    {platformAlerts.map((alert, index) => (
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
                        <CanvasPill
                          theme={theme}
                          tone={alertTone(alert.state)}
                          dot
                        >
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
                    ))}
                  </div>
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.inventoryTitle}
                subtitle={copy.inventorySubtitle}
                actions={
                  <CanvasBtn
                    theme={theme}
                    variant="secondary"
                    size="xs"
                    onClick={() => {
                      router.push("/adapter-registry");
                    }}
                  >
                    {copy.registry}
                  </CanvasBtn>
                }
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

            <div style={sideColumnStyle}>
              <CanvasCard
                theme={theme}
                title={copy.postureTitle}
                subtitle={copy.postureSubtitle}
              >
                <CanvasDL theme={theme} cols={1} items={postureItems} />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.pressureTitle}
                subtitle={copy.pressureSubtitle}
              >
                <CanvasDL theme={theme} cols={1} items={pressureItems} />
              </CanvasCard>

              <CanvasCard theme={theme} title={copy.generatedAt}>
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: copy.generatedAt,
                      v: formatDateTime(observability.generatedAt),
                      mono: true,
                    },
                    {
                      k: copy.refreshAt,
                      v: lastRefresh || "—",
                      mono: true,
                    },
                    {
                      k: copy.focusAreas,
                      v: focusAreas,
                    },
                  ]}
                />
              </CanvasCard>
            </div>
          </div>
        </div>
      </div>
    </CanvasShell>
  );
}
