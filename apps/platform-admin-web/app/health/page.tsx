"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import type {
  AdapterHealthRecord,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
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
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

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
type AlertRow = OperationalAlertRecord &
  Record<string, unknown> & {
    availableActions: ResourceActionDescriptor[];
  };
type AdapterRow = AdapterHealthRecord &
  Record<string, unknown> & {
    availableActions: ResourceActionDescriptor[];
  };
type MetricCard = {
  label: string;
  value: string;
  sub: string;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  availableActions: ResourceActionDescriptor[];
};
type FocusCard = {
  id: string;
  title: string;
  body: string;
  tone: CanvasTone;
  availableActions: ResourceActionDescriptor[];
};
type ActiveSurface = {
  title: string;
  subtitle: string;
  rows: AlertRow[] | AdapterRow[];
  emptyState: EmptyStateEnvelope | null;
  availableActions: ResourceActionDescriptor[];
};

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.65fr) minmax(280px, 0.95fr)",
  gap: 16,
  alignItems: "stretch",
};

const heroStatsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const heroStatBoxStyle = (th: CanvasTheme): CSSProperties => ({
  display: "grid",
  gap: 4,
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
});

const heroMetaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.7fr) minmax(300px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const pillsRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const pillButtonStyle: CSSProperties = {
  border: 0,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
};

const actionClusterStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const emptyActionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
};

const emptyStateStyle = (
  reason: EmptyReason,
  th: CanvasTheme,
): CSSProperties => {
  const palette = getEmptyStatePalette(reason, th);
  return {
    padding: 22,
    borderRadius: 16,
    border: `1px dashed ${palette.border}`,
    background: palette.background,
    display: "grid",
    gap: 12,
  };
};

const emptyHeaderStyle = (th: CanvasTheme): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gap: 14,
  alignItems: "start",
  color: th.text,
});

const emptyBadgeStyle = (
  reason: EmptyReason,
  th: CanvasTheme,
): CSSProperties => {
  const palette = getEmptyStatePalette(reason, th);
  return {
    width: 52,
    height: 52,
    borderRadius: 16,
    border: `1px solid ${palette.border}`,
    display: "grid",
    placeItems: "center",
    background: th.surface,
    fontSize: 22,
  };
};

const emptyBodyStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.6,
  maxWidth: 720,
};

const linkButtonStyle = (
  th: CanvasTheme,
  variant: "secondary" | "ghost" = "secondary",
  disabled = false,
): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: variant === "ghost" ? 26 : 30,
  padding: variant === "ghost" ? "4px 8px" : "6px 10px",
  borderRadius: 7,
  border:
    variant === "ghost" ? `1px solid transparent` : `1px solid ${th.border}`,
  background: variant === "ghost" ? "transparent" : th.surfaceLo,
  color: disabled ? th.textDim : th.text,
  fontSize: variant === "ghost" ? 11.5 : 12,
  fontWeight: 600,
  textDecoration: "none",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  pointerEvents: disabled ? "none" : "auto",
});

const overviewListStyle = (th: CanvasTheme): CSSProperties => ({
  display: "grid",
  gap: 10,
  paddingTop: 4,
  borderTop: `1px solid ${th.border}`,
});

const railCardListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

function buildPlatformNav(
  locale: string,
  attentionCount: number,
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
      badge: attentionCount > 0 ? String(attentionCount) : undefined,
      badgeTone: attentionCount > 0 ? "warn" : "neutral",
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

function formatCountdown(ms: number, locale: "en" | "zh"): string {
  if (ms <= 0) {
    return locale === "en" ? "now" : "現在";
  }

  const seconds = Math.ceil(ms / 1000);
  return locale === "en" ? `${seconds}s` : `${seconds} 秒`;
}

function toneForStatus(status: string): CanvasTone {
  switch (status) {
    case "healthy":
    case "fresh":
      return "success";
    case "warning":
    case "degraded":
    case "stale":
      return "warn";
    case "critical":
    case "down":
      return "danger";
    case "live":
      return "info";
    default:
      return "neutral";
  }
}

function bannerToneForHealth(
  status: UiHealthEnvelope["status"],
): Exclude<CanvasTone, "neutral"> {
  switch (status) {
    case "healthy":
      return "success";
    case "degraded":
      return "warn";
    case "down":
    default:
      return "danger";
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
    case "adapter_degradation":
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
): EmptyStateEnvelope | null {
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

function getEmptyStatePalette(reason: EmptyReason, th: CanvasTheme) {
  switch (reason) {
    case "no_data":
      return {
        border: th.successBorder,
        background: th.successBg,
        tone: "success" as CanvasTone,
      };
    case "not_provisioned":
      return {
        border: th.infoBorder,
        background: th.infoBg,
        tone: "info" as CanvasTone,
      };
    case "filtered_empty":
      return {
        border: th.accentBorder,
        background: th.accentBg,
        tone: "accent" as CanvasTone,
      };
    case "permission_denied":
      return {
        border: th.warnBorder,
        background: th.warnBg,
        tone: "warn" as CanvasTone,
      };
    case "external_unavailable":
    case "fetch_failed":
      return {
        border: th.dangerBorder,
        background: th.dangerBg,
        tone: "danger" as CanvasTone,
      };
    default:
      return {
        border: th.border,
        background: th.surfaceLo,
        tone: "neutral" as CanvasTone,
      };
  }
}

function getEmptyStateSymbol(reason: EmptyReason): string {
  switch (reason) {
    case "no_data":
      return "○";
    case "not_provisioned":
      return "⌁";
    case "filtered_empty":
      return "◌";
    case "permission_denied":
      return "⛔";
    case "external_unavailable":
      return "⇄";
    case "fetch_failed":
    default:
      return "!";
  }
}

function findAction(
  actions: ResourceActionDescriptor[],
  actionId: string,
): ResourceActionDescriptor | undefined {
  return actions.find((action) => action.action === actionId);
}

function renderActionLink(
  th: CanvasTheme,
  href: string,
  label: string,
  openMode: "same_tab" | "new_tab",
  variant: "secondary" | "ghost" = "secondary",
) {
  if (openMode === "new_tab") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={linkButtonStyle(th, variant)}
      >
        {label}
      </a>
    );
  }

  return (
    <Link href={href} style={linkButtonStyle(th, variant)}>
      {label}
    </Link>
  );
}

function getFocusToneLabel(tone: CanvasTone, locale: "en" | "zh"): string {
  switch (tone) {
    case "danger":
      return locale === "en" ? "Critical" : "重大";
    case "warn":
      return locale === "en" ? "Watch" : "警示";
    case "info":
      return locale === "en" ? "Routed" : "已路由";
    case "success":
      return locale === "en" ? "Stable" : "穩定";
    default:
      return locale === "en" ? "Normal" : "正常";
  }
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
      } catch (nextError: unknown) {
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
        setNow(Date.now());
      }
    },
    [client],
  );

  useEffect(() => {
    void loadData();

    const pollTimer =
      REFRESH_INTERVAL_MS > 0
        ? window.setInterval(() => {
            void loadData(true);
          }, REFRESH_INTERVAL_MS)
        : null;
    const freshnessTimer = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
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

  const filteredAlertsBase = useMemo(() => {
    if (routeFilter === "all") {
      return sortedAlerts;
    }
    return sortedAlerts.filter((alert) => alert.routes.includes(routeFilter));
  }, [routeFilter, sortedAlerts]);

  const opsConsoleHref = useMemo(
    () =>
      resolveCrossAppHref({
        targetApp: "ops-console",
        route: "/dispatch",
        resourceType: "dispatch_board",
        resourceId: "dispatch",
        openMode: "new_tab",
        label: "Ops Console",
      }),
    [],
  );

  const attentionCount = useMemo(
    () =>
      sortedAlerts.filter((alert) => alert.state !== "healthy").length +
      observability.adapters.degradedAdapters +
      observability.adapters.downAdapters,
    [
      observability.adapters.degradedAdapters,
      observability.adapters.downAdapters,
      sortedAlerts,
    ],
  );

  const navItems = useMemo(
    () => buildPlatformNav(locale, attentionCount),
    [attentionCount, locale],
  );

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

  const alertRows = useMemo<AlertRow[]>(
    () =>
      filteredAlertsBase.map((alert) => {
        const followUp = getAlertFollowUpLink(alert);
        const href = followUp ? resolveCrossAppHref(followUp) : null;
        const actionId =
          followUp?.targetApp === "platform-admin"
            ? "open:adapter-registry"
            : "open:ops-console";

        return {
          ...alert,
          availableActions:
            followUp && href
              ? [createAction(actionId, true, "low")]
              : [
                  createAction(
                    "open:ops-console",
                    false,
                    "low",
                    "no_follow_up",
                  ),
                ],
        };
      }),
    [filteredAlertsBase, opsConsoleHref],
  );

  const adapterRows = useMemo<AdapterRow[]>(
    () =>
      adapters.map((adapter) => ({
        ...adapter,
        availableActions: [createAction("open:adapter-registry", true, "low")],
      })),
    [adapters],
  );

  const activeSurface = useMemo<ActiveSurface>(() => {
    if (view === "alerts") {
      return {
        title: t("health.tab.alerts"),
        subtitle:
          locale === "en"
            ? "Platform-routed alert list with route filters and cross-app follow-up."
            : "平台路由警示清單，含 route filter 與跨 app 跟進入口。",
        rows: alertRows,
        emptyState: buildEmptyState(
          "alerts",
          errorReason,
          routeFilter,
          sortedAlerts.length,
          alertRows.length,
          adapterRows.length,
        ),
        availableActions: healthAvailableActions.filter(
          (action) =>
            action.action.startsWith("view:") ||
            action.action.startsWith("filter:") ||
            action.action === "refresh" ||
            action.action === "open:ops-console" ||
            action.action === "open:adapter-registry",
        ),
      };
    }

    return {
      title: t("health.tab.adapters"),
      subtitle:
        locale === "en"
          ? "Adapter counts and health status route directly into Adapter Registry follow-up."
          : "Adapter 計數與健康狀態直接導向 Adapter Registry 跟進。",
      rows: adapterRows,
      emptyState: buildEmptyState(
        "adapters",
        errorReason,
        routeFilter,
        sortedAlerts.length,
        alertRows.length,
        adapterRows.length,
      ),
      availableActions: healthAvailableActions.filter(
        (action) =>
          action.action.startsWith("view:") ||
          action.action === "refresh" ||
          action.action === "open:adapter-registry",
      ),
    };
  }, [
    adapterRows.length,
    adapterRows,
    alertRows,
    errorReason,
    healthAvailableActions,
    locale,
    routeFilter,
    sortedAlerts.length,
    t,
    view,
  ]);

  const emptyStateAction = activeSurface.emptyState?.nextAction
    ? (findAction(
        activeSurface.availableActions,
        activeSurface.emptyState.nextAction.action,
      ) ?? activeSurface.emptyState.nextAction)
    : null;

  const metricCards: MetricCard[] = useMemo(
    () => [
      {
        label: t("health.metric.dispatch.title"),
        value: formatMetricValue(
          observability.dispatch.oldestReadyOrderLagMinutes ?? 0,
          "minutes",
          locale,
        ),
        sub: t("health.metric.dispatch.note", {
          count: observability.dispatch.laggedOrders,
        }),
        ...(observability.dispatch.laggedOrders > 0
          ? {
              delta: `${observability.dispatch.laggedOrders}`,
              deltaTone: "down" as const,
            }
          : { deltaTone: "up" as const }),
        availableActions: [
          createAction(
            "open:ops-console",
            Boolean(opsConsoleHref),
            "low",
            opsConsoleHref ? undefined : "ops_console_unavailable",
          ),
        ],
      },
      {
        label: t("health.metric.webhook.title"),
        value: formatMetricValue(
          observability.webhook.failedDeliveriesLastHour,
          "count",
          locale,
        ),
        sub: t("health.metric.webhook.note", {
          count: observability.webhook.queuedDeliveries,
        }),
        ...(observability.webhook.failedDeliveriesLastHour > 0
          ? {
              delta: `${observability.webhook.failedDeliveriesLastHour}`,
              deltaTone: "down" as const,
            }
          : { deltaTone: "up" as const }),
        availableActions: [createAction("open:adapter-registry", true, "low")],
      },
      {
        label: t("health.metric.eligibility.title"),
        value: formatMetricValue(
          observability.eligibility.totalReviewQueue,
          "count",
          locale,
        ),
        sub: t("health.metric.eligibility.note", {
          count: observability.eligibility.manualReviewQueue,
        }),
        availableActions: [
          createAction(
            "open:ops-console",
            Boolean(opsConsoleHref),
            "low",
            opsConsoleHref ? undefined : "ops_console_unavailable",
          ),
        ],
      },
      {
        label: t("health.metric.reporting.title"),
        value: formatMetricValue(
          observability.reporting.failedJobs,
          "count",
          locale,
        ),
        sub: t("health.metric.reporting.note", {
          count: observability.reporting.queuedJobs,
        }),
        ...(observability.reporting.failedJobs > 0
          ? {
              delta: `${observability.reporting.failedJobs}`,
              deltaTone: "down" as const,
            }
          : { deltaTone: "up" as const }),
        availableActions: [
          createAction(
            "open:ops-console",
            Boolean(opsConsoleHref),
            "low",
            opsConsoleHref ? undefined : "ops_console_unavailable",
          ),
        ],
      },
      {
        label: t("health.metric.adapters.title"),
        value: formatMetricValue(
          observability.adapters.degradedAdapters +
            observability.adapters.downAdapters,
          "count",
          locale,
        ),
        sub: t("health.metric.adapters.note", {
          count: observability.adapters.totalAdapters,
        }),
        availableActions: [createAction("open:adapter-registry", true, "low")],
      },
    ],
    [locale, observability, opsConsoleHref, t],
  );

  const focusCards = useMemo<FocusCard[]>(
    () => [
      {
        id: "dispatch",
        title: locale === "en" ? "Dispatch lag cluster" : "派車延遲叢集",
        body:
          locale === "en"
            ? `${observability.dispatch.laggedOrders} lagged order(s), ${observability.dispatch.exceptionHoldOrders} exception hold(s).`
            : `${observability.dispatch.laggedOrders} 筆延遲訂單，${observability.dispatch.exceptionHoldOrders} 筆 exception hold。`,
        tone: observability.dispatch.laggedOrders > 0 ? "warn" : "success",
        availableActions: [
          createAction(
            "open:ops-console",
            Boolean(opsConsoleHref),
            "low",
            opsConsoleHref ? undefined : "ops_console_unavailable",
          ),
        ],
      },
      {
        id: "webhook",
        title: locale === "en" ? "Webhook queue" : "Webhook 佇列",
        body:
          locale === "en"
            ? `${observability.webhook.queuedDeliveries} queued delivery(ies), ${observability.webhook.failedDeliveriesLastHour} failed in the last hour.`
            : `${observability.webhook.queuedDeliveries} 筆排隊中的傳遞，最近一小時 ${observability.webhook.failedDeliveriesLastHour} 筆失敗。`,
        tone:
          observability.webhook.failedDeliveriesLastHour > 0
            ? "danger"
            : "info",
        availableActions: [createAction("open:adapter-registry", true, "low")],
      },
      {
        id: "eligibility",
        title: locale === "en" ? "Eligibility review queue" : "資格審查佇列",
        body:
          locale === "en"
            ? `${observability.eligibility.totalReviewQueue} total review item(s), ${observability.eligibility.manualFallbackQueue} fallback queue.`
            : `${observability.eligibility.totalReviewQueue} 筆審查項目，${observability.eligibility.manualFallbackQueue} 筆 fallback queue。`,
        tone:
          observability.eligibility.totalReviewQueue > 0 ? "warn" : "neutral",
        availableActions: [
          createAction(
            "open:ops-console",
            Boolean(opsConsoleHref),
            "low",
            opsConsoleHref ? undefined : "ops_console_unavailable",
          ),
        ],
      },
      {
        id: "reporting",
        title: locale === "en" ? "Reporting failures" : "報表失敗",
        body:
          locale === "en"
            ? `${observability.reporting.failedJobs} failed job(s), ${observability.reporting.dispatchRecordingIndexQueuedJobs} dispatch recording index job(s) queued.`
            : `${observability.reporting.failedJobs} 筆失敗工作，${observability.reporting.dispatchRecordingIndexQueuedJobs} 筆 dispatch recording index 工作排隊中。`,
        tone: observability.reporting.failedJobs > 0 ? "danger" : "neutral",
        availableActions: [
          createAction(
            "open:ops-console",
            Boolean(opsConsoleHref),
            "low",
            opsConsoleHref ? undefined : "ops_console_unavailable",
          ),
        ],
      },
    ],
    [locale, observability, opsConsoleHref],
  );

  const routeCoverage = useMemo(
    () =>
      observability.roleViews.length > 0
        ? observability.roleViews
        : [
            {
              route: "platform" as const,
              alertKeys: ["adapter_degradation", "webhook_failure_burst"],
              focusAreas: ["adapters", "webhook", "reporting"],
            },
            {
              route: "ops" as const,
              alertKeys: [
                "dispatch_lag",
                "recording_backlog",
                "driver_state_lag",
                "eligibility_review_backlog",
              ],
              focusAreas: [
                "dispatch",
                "recording",
                "driver_state",
                "eligibility",
              ],
            },
          ],
    [observability.roleViews],
  );

  const actionHrefMap = useMemo<Record<string, CrossAppResourceLink>>(
    () => ({
      "open:adapter-registry": {
        targetApp: "platform-admin",
        route: "/adapter-registry?filter=attention",
        resourceType: "adapter_registry",
        resourceId: "attention",
        openMode: "same_tab",
        label: t("health.openAdapterRegistry"),
      },
      "open:ops-console": {
        targetApp: "ops-console",
        route: "/dispatch",
        resourceType: "dispatch_board",
        resourceId: "dispatch",
        openMode: "new_tab",
        label: t("health.openOpsConsole"),
      },
    }),
    [t],
  );

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

  const headerTabs = useMemo(
    () => [t("health.tab.alerts"), t("health.tab.adapters")],
    [t],
  );

  const nextRefreshInMs = Math.max(
    REFRESH_INTERVAL_MS -
      (now - new Date(refreshMetadata.generatedAt).getTime()),
    0,
  );

  const alertColumns = useMemo<CanvasTableColumn<AlertRow>[]>(
    () => [
      {
        h: t("health.col.alert"),
        w: 220,
        r: (alert) => (
          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600, color: theme.text }}>
              {getAlertTitle(t, alert)}
            </span>
            <span
              style={{
                color: theme.textMuted,
                fontSize: 11.5,
                fontFamily: theme.monoFamily,
              }}
            >
              {alert.key}
            </span>
          </div>
        ),
      },
      {
        h: t("health.col.status"),
        w: 110,
        r: (alert) => (
          <CanvasPill theme={theme} tone={toneForStatus(alert.state)} dot>
            {formatPlatformCodeLabel(locale, alert.state)}
          </CanvasPill>
        ),
      },
      {
        h: t("health.col.measured"),
        w: 110,
        mono: true,
        align: "right",
        r: (alert) =>
          formatMetricValue(alert.measuredValue, alert.thresholds.unit, locale),
      },
      {
        h: t("health.col.threshold"),
        w: 180,
        r: (alert) =>
          t("health.thresholds", {
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
          }),
      },
      {
        h: t("health.col.route"),
        w: 150,
        r: (alert) => (
          <div style={pillsRowStyle}>
            {alert.routes.map((route) => (
              <CanvasPill
                key={`${alert.key}-${route}`}
                theme={theme}
                tone={route === "platform" ? "accent" : "warn"}
                dot
              >
                {t(`health.filter.${route}`)}
              </CanvasPill>
            ))}
          </div>
        ),
      },
      {
        h: t("health.col.followUp"),
        r: (alert) => {
          const followUpLink = getAlertFollowUpLink(alert);
          const href = followUpLink ? resolveCrossAppHref(followUpLink) : null;
          const action = alert.availableActions[0];

          if (followUpLink && href && action?.enabled) {
            return renderActionLink(
              theme,
              href,
              followUpLink.targetApp === "platform-admin"
                ? t("health.openAdapterRegistry")
                : t("health.openOpsConsole"),
              followUpLink.openMode,
              "ghost",
            );
          }

          if (alert.routes.includes("ops")) {
            return (
              <CanvasPill theme={theme} tone="neutral">
                {t("health.opsOwnedFollowUp")}
              </CanvasPill>
            );
          }

          return "—";
        },
      },
    ],
    [locale, t],
  );

  const adapterColumns = useMemo<CanvasTableColumn<AdapterRow>[]>(
    () => [
      {
        h: t("health.col.adapter"),
        k: "platformCode",
        w: 150,
        mono: true,
      },
      {
        h: t("health.col.status"),
        w: 110,
        r: (adapter) => (
          <CanvasPill
            theme={theme}
            tone={toneForStatus(adapter.status ?? "unknown")}
            dot
          >
            {formatPlatformCodeLabel(locale, adapter.status ?? "unknown")}
          </CanvasPill>
        ),
      },
      {
        h: t("health.col.lastCheck"),
        w: 180,
        mono: true,
        r: (adapter) => formatDateTime(adapter.lastCheckedAt ?? "", locale),
      },
      {
        h: t("health.col.message"),
        r: (adapter) => (
          <div title={adapter.lastError ?? undefined}>
            {adapter.lastError || "—"}
          </div>
        ),
      },
      {
        h: t("health.col.followUp"),
        w: 140,
        r: (adapter) => {
          const action = adapter.availableActions[0];
          const followUp = getAdapterFollowUpLink(adapter.platformCode);

          if (!action?.enabled) {
            return (
              <CanvasPill theme={theme} tone="neutral">
                {t("health.readOnly")}
              </CanvasPill>
            );
          }

          return renderActionLink(
            theme,
            followUp.route,
            t("health.openAdapterRegistry"),
            "same_tab",
            "ghost",
          );
        },
      },
    ],
    [locale, t],
  );

  const headerActions = (
    <>
      <CanvasBtn
        theme={theme}
        icon="refresh"
        disabled={!findAction(healthAvailableActions, "refresh")?.enabled}
        onClick={() => handleAction("refresh")}
      >
        {t("common.refresh")}
      </CanvasBtn>
      <Link
        href="/adapter-registry?filter=attention"
        style={linkButtonStyle(theme)}
      >
        {t("health.openAdapterRegistry")}
      </Link>
    </>
  );

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="health"
      currentPath="/health"
      breadcrumb={
        locale === "en"
          ? ["Platform Layer", t("health.title")]
          : ["平台層", t("health.title")]
      }
      searchPlaceholder={
        locale === "en"
          ? "Search alerts, adapters, audit IDs..."
          : "搜尋警示、adapter、audit ID..."
      }
      avatarLabel="PA"
    >
      <CanvasPageHeader
        theme={theme}
        title={t("health.title")}
        subtitle={t("health.subtitle")}
        tabs={headerTabs}
        activeTab={view === "alerts" ? headerTabs[0] : headerTabs[1]}
        actions={headerActions}
        sticky={false}
      />

      <div style={pageBodyStyle}>
        {loading ? (
          <CanvasCard
            theme={theme}
            title={t("health.title")}
            subtitle={t("health.loading")}
          >
            <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
              {t("health.loading")}
            </div>
          </CanvasCard>
        ) : (
          <>
            <CanvasBanner
              theme={theme}
              tone={bannerToneForHealth(healthEnvelope.status)}
              title={t(`health.banner.${healthEnvelope.status}.title`)}
              body={t(`health.banner.${healthEnvelope.status}.body`)}
            />

            {error ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                title={t("health.errorTitle")}
                body={error}
              />
            ) : null}

            <div style={heroGridStyle}>
              <CanvasCard
                theme={theme}
                title={locale === "en" ? "Operational focus" : "營運焦點"}
                subtitle={
                  locale === "en"
                    ? "Platform health routes platform-wide issues to the next owning surface."
                    : "平台健康頁把跨模組異常路由到下一個負責處理的工作面。"
                }
              >
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={heroMetaRowStyle}>
                    <CanvasPill
                      theme={theme}
                      tone={bannerToneForHealth(healthEnvelope.status)}
                      dot
                    >
                      {t(`health.banner.${healthEnvelope.status}.title`)}
                    </CanvasPill>
                    <CanvasPill theme={theme} tone="accent">
                      {t("health.refreshTier", { tier: REFRESH_TIER_LABEL })}
                    </CanvasPill>
                    <CanvasPill
                      theme={theme}
                      tone={toneForStatus(refreshMetadata.dataFreshness)}
                      dot
                    >
                      {t(`health.freshness.${refreshMetadata.dataFreshness}`)}
                    </CanvasPill>
                  </div>

                  <div style={heroStatsStyle}>
                    <div style={heroStatBoxStyle(theme)}>
                      <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                        {t("health.hero.attention")}
                      </span>
                      <span
                        style={{
                          color: theme.text,
                          fontSize: 26,
                          fontWeight: 700,
                        }}
                      >
                        {attentionCount}
                      </span>
                      <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                        {locale === "en"
                          ? "alerts + degraded adapters"
                          : "警示 + 降級 adapter"}
                      </span>
                    </div>
                    <div style={heroStatBoxStyle(theme)}>
                      <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                        {t("health.hero.dispatch")}
                      </span>
                      <span
                        style={{
                          color: theme.text,
                          fontSize: 26,
                          fontWeight: 700,
                        }}
                      >
                        {observability.dispatch.laggedOrders}
                      </span>
                      <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                        {locale === "en"
                          ? "lagged dispatch orders"
                          : "延遲派車訂單"}
                      </span>
                    </div>
                    <div style={heroStatBoxStyle(theme)}>
                      <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                        {t("health.hero.adapters")}
                      </span>
                      <span
                        style={{
                          color: theme.text,
                          fontSize: 26,
                          fontWeight: 700,
                        }}
                      >
                        {observability.adapters.degradedAdapters +
                          observability.adapters.downAdapters}
                      </span>
                      <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                        {locale === "en"
                          ? "registry follow-up rows"
                          : "需進 Adapter Registry 跟進"}
                      </span>
                    </div>
                  </div>

                  <div style={overviewListStyle(theme)}>
                    {focusCards.map((card) => {
                      const action = card.availableActions[0];
                      const deepLink = action
                        ? actionHrefMap[action.action]
                        : null;
                      const href = deepLink
                        ? resolveCrossAppHref(deepLink)
                        : null;

                      return (
                        <div
                          key={card.id}
                          style={{
                            display: "grid",
                            gap: 8,
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: `1px solid ${theme.border}`,
                            background: theme.surfaceLo,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                            }}
                          >
                            <div style={{ display: "grid", gap: 4 }}>
                              <div
                                style={{
                                  fontSize: 12.5,
                                  fontWeight: 700,
                                  color: theme.text,
                                }}
                              >
                                {card.title}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  lineHeight: 1.55,
                                  color: theme.textMuted,
                                }}
                              >
                                {card.body}
                              </div>
                            </div>
                            <CanvasPill theme={theme} tone={card.tone} dot>
                              {getFocusToneLabel(card.tone, locale)}
                            </CanvasPill>
                          </div>

                          {action?.enabled && deepLink && href ? (
                            <div style={actionClusterStyle}>
                              {renderActionLink(
                                theme,
                                href,
                                deepLink.label,
                                deepLink.openMode,
                                "ghost",
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={locale === "en" ? "Refresh & route map" : "刷新與路由圖"}
                subtitle={
                  locale === "en"
                    ? "T4 cadence, route filters, and exit surfaces are explicit."
                    : "T4 節奏、route filter 與離開目的地都要明確。"
                }
              >
                <div style={{ display: "grid", gap: 14 }}>
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        label: t("health.refreshTier", {
                          tier: REFRESH_TIER_LABEL,
                        }),
                        value: refreshing
                          ? t("health.refreshing")
                          : t("health.refreshIdle"),
                      },
                      {
                        label: t("health.generatedAt", {
                          time: formatDateTime(
                            refreshMetadata.generatedAt,
                            locale,
                          ),
                        }),
                        value: t("health.nextRefreshValue", {
                          countdown: formatCountdown(nextRefreshInMs, locale),
                        }),
                      },
                      {
                        label: t("health.lastChecked", {
                          time: formatDateTime(
                            healthEnvelope.lastCheckedAt,
                            locale,
                          ),
                        }),
                        value: t(
                          `health.sourceValue.${refreshMetadata.source}`,
                        ),
                      },
                    ]}
                  />

                  <div style={railCardListStyle}>
                    {routeCoverage.map((routeView) => (
                      <div
                        key={routeView.route}
                        style={{
                          display: "grid",
                          gap: 8,
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: `1px solid ${theme.border}`,
                          background: theme.surfaceLo,
                        }}
                      >
                        <div style={pillsRowStyle}>
                          <CanvasPill
                            theme={theme}
                            tone={
                              routeView.route === "platform" ? "accent" : "warn"
                            }
                            dot
                          >
                            {t(`health.filter.${routeView.route}`)}
                          </CanvasPill>
                          <CanvasPill theme={theme} tone="neutral">
                            {routeView.alertKeys.length}{" "}
                            {t("health.routeAlerts")}
                          </CanvasPill>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            lineHeight: 1.55,
                            color: theme.textMuted,
                          }}
                        >
                          {routeView.focusAreas.join(" / ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CanvasCard>
            </div>

            <div style={kpiGridStyle}>
              {metricCards.map((metric) => (
                <CanvasKPI
                  key={metric.label}
                  theme={theme}
                  label={metric.label}
                  value={metric.value}
                  sub={metric.sub}
                  {...(metric.delta ? { delta: metric.delta } : {})}
                  {...(metric.deltaTone ? { deltaTone: metric.deltaTone } : {})}
                />
              ))}
            </div>

            <div style={twoColumnStyle}>
              <CanvasCard
                theme={theme}
                title={activeSurface.title}
                subtitle={activeSurface.subtitle}
              >
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={pillsRowStyle}>
                    {activeSurface.availableActions
                      .filter((action) => action.action.startsWith("view:"))
                      .map((action) => {
                        const isActive =
                          (action.action === "view:alerts" &&
                            view === "alerts") ||
                          (action.action === "view:adapters" &&
                            view === "adapters");

                        return (
                          <button
                            key={action.action}
                            type="button"
                            style={pillButtonStyle}
                            disabled={!action.enabled}
                            onClick={() => handleAction(action.action)}
                            title={
                              action.disabledReasonCode
                                ? t(
                                    `health.disabled.${action.disabledReasonCode}`,
                                  )
                                : undefined
                            }
                          >
                            <CanvasPill
                              theme={theme}
                              tone={isActive ? "accent" : "neutral"}
                              dot={isActive}
                            >
                              {t(
                                action.action === "view:alerts"
                                  ? "health.tab.alerts"
                                  : "health.tab.adapters",
                              )}
                            </CanvasPill>
                          </button>
                        );
                      })}

                    {view === "alerts" ? (
                      <>
                        <span
                          style={{
                            width: 1,
                            height: 18,
                            background: theme.border,
                          }}
                        />
                        {activeSurface.availableActions
                          .filter((action) =>
                            action.action.startsWith("filter:"),
                          )
                          .map((action) => {
                            const nextFilter = action.action.replace(
                              "filter:",
                              "",
                            ) as RouteFilter;
                            const isActive = routeFilter === nextFilter;

                            return (
                              <button
                                key={action.action}
                                type="button"
                                style={pillButtonStyle}
                                disabled={!action.enabled}
                                onClick={() => handleAction(action.action)}
                                title={
                                  action.disabledReasonCode
                                    ? t(
                                        `health.disabled.${action.disabledReasonCode}`,
                                      )
                                    : undefined
                                }
                              >
                                <CanvasPill
                                  theme={theme}
                                  tone={isActive ? "info" : "neutral"}
                                  dot={isActive}
                                >
                                  {t(`health.filter.${nextFilter}`)}
                                </CanvasPill>
                              </button>
                            );
                          })}
                      </>
                    ) : null}
                  </div>

                  {activeSurface.emptyState ? (
                    <div
                      style={emptyStateStyle(
                        activeSurface.emptyState.reason,
                        theme,
                      )}
                    >
                      <div style={emptyHeaderStyle(theme)}>
                        <div
                          style={emptyBadgeStyle(
                            activeSurface.emptyState.reason,
                            theme,
                          )}
                        >
                          {getEmptyStateSymbol(activeSurface.emptyState.reason)}
                        </div>
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={pillsRowStyle}>
                            <CanvasPill
                              theme={theme}
                              tone={
                                getEmptyStatePalette(
                                  activeSurface.emptyState.reason,
                                  theme,
                                ).tone
                              }
                              dot
                            >
                              {t(
                                `health.emptyReason.${activeSurface.emptyState.reason}`,
                              )}
                            </CanvasPill>
                            <CanvasPill theme={theme} tone="neutral">
                              {activeSurface.emptyState.messageCode
                                .replace("health.empty.", "")
                                .replaceAll("_", " ")}
                            </CanvasPill>
                          </div>
                          <div
                            style={{
                              fontSize: 18,
                              fontWeight: 700,
                              color: theme.text,
                            }}
                          >
                            {t(`${activeSurface.emptyState.messageCode}.title`)}
                          </div>
                          <div
                            style={{
                              ...emptyBodyStyle,
                              color: theme.textMuted,
                            }}
                          >
                            {t(`${activeSurface.emptyState.messageCode}.body`)}
                          </div>
                        </div>
                      </div>

                      <div style={emptyActionRowStyle}>
                        {emptyStateAction?.action === "refresh" ? (
                          <CanvasBtn
                            theme={theme}
                            disabled={!emptyStateAction.enabled}
                            onClick={() =>
                              handleAction(emptyStateAction.action)
                            }
                          >
                            {t("common.refresh")}
                          </CanvasBtn>
                        ) : null}

                        {emptyStateAction?.action === "filter:all" ? (
                          <CanvasBtn
                            theme={theme}
                            disabled={!emptyStateAction.enabled}
                            onClick={() =>
                              handleAction(emptyStateAction.action)
                            }
                          >
                            {t("health.filter.all")}
                          </CanvasBtn>
                        ) : null}

                        {emptyStateAction?.action ===
                        "open:adapter-registry" ? (
                          <Link
                            href="/adapter-registry?filter=attention"
                            style={linkButtonStyle(theme)}
                          >
                            {t("health.openAdapterRegistry")}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ) : view === "alerts" ? (
                    <>
                      <CanvasCard
                        theme={theme}
                        title={
                          locale === "en"
                            ? `Active alerts · ${alertRows.length}`
                            : `現行警示 · ${alertRows.length}`
                        }
                        subtitle={
                          locale === "en"
                            ? "Follow-up routing comes from each alert row."
                            : "每一列警示的 follow-up 入口都由該列動作決定。"
                        }
                      >
                        <div style={{ display: "grid", gap: 10 }}>
                          {alertRows.map((alert) => {
                            const followUpLink = getAlertFollowUpLink(alert);
                            const followUpHref = followUpLink
                              ? resolveCrossAppHref(followUpLink)
                              : null;

                            return (
                              <div
                                key={alert.key}
                                style={{
                                  display: "grid",
                                  gap: 10,
                                  padding: "12px 14px",
                                  borderRadius: 12,
                                  border: `1px solid ${theme.border}`,
                                  background: theme.surfaceLo,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "start",
                                    gap: 12,
                                  }}
                                >
                                  <div style={{ display: "grid", gap: 6 }}>
                                    <div
                                      style={{
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: theme.text,
                                      }}
                                    >
                                      {getAlertTitle(t, alert)}
                                    </div>
                                    <div style={pillsRowStyle}>
                                      <CanvasPill
                                        theme={theme}
                                        tone={toneForStatus(alert.state)}
                                        dot
                                      >
                                        {formatPlatformCodeLabel(
                                          locale,
                                          alert.state,
                                        )}
                                      </CanvasPill>
                                      {alert.routes.map((route) => (
                                        <CanvasPill
                                          key={`${alert.key}-route-${route}`}
                                          theme={theme}
                                          tone={
                                            route === "platform"
                                              ? "accent"
                                              : "warn"
                                          }
                                          dot
                                        >
                                          {t(`health.filter.${route}`)}
                                        </CanvasPill>
                                      ))}
                                    </div>
                                  </div>

                                  {followUpLink && followUpHref ? (
                                    renderActionLink(
                                      theme,
                                      followUpHref,
                                      followUpLink.targetApp ===
                                        "platform-admin"
                                        ? t("health.openAdapterRegistry")
                                        : t("health.openOpsConsole"),
                                      followUpLink.openMode,
                                      "ghost",
                                    )
                                  ) : (
                                    <CanvasPill theme={theme} tone="neutral">
                                      {t("health.readOnly")}
                                    </CanvasPill>
                                  )}
                                </div>

                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "repeat(auto-fit, minmax(160px, 1fr))",
                                    gap: 10,
                                  }}
                                >
                                  <div style={heroStatBoxStyle(theme)}>
                                    <span
                                      style={{
                                        color: theme.textMuted,
                                        fontSize: 11.5,
                                      }}
                                    >
                                      {t("health.col.measured")}
                                    </span>
                                    <span
                                      style={{
                                        color: theme.text,
                                        fontSize: 18,
                                        fontWeight: 700,
                                      }}
                                    >
                                      {formatMetricValue(
                                        alert.measuredValue,
                                        alert.thresholds.unit,
                                        locale,
                                      )}
                                    </span>
                                  </div>
                                  <div style={heroStatBoxStyle(theme)}>
                                    <span
                                      style={{
                                        color: theme.textMuted,
                                        fontSize: 11.5,
                                      }}
                                    >
                                      {t("health.col.threshold")}
                                    </span>
                                    <span
                                      style={{
                                        color: theme.text,
                                        fontSize: 13,
                                        fontWeight: 600,
                                      }}
                                    >
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
                                    </span>
                                  </div>
                                  <div style={heroStatBoxStyle(theme)}>
                                    <span
                                      style={{
                                        color: theme.textMuted,
                                        fontSize: 11.5,
                                      }}
                                    >
                                      {t("health.col.lastCheck")}
                                    </span>
                                    <span
                                      style={{
                                        color: theme.text,
                                        fontSize: 13,
                                        fontWeight: 600,
                                      }}
                                    >
                                      {formatDateTime(alert.observedAt, locale)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CanvasCard>

                      <CanvasCard theme={theme} padding={0}>
                        <CanvasTable<AlertRow>
                          theme={theme}
                          columns={alertColumns}
                          rows={alertRows}
                        />
                      </CanvasCard>
                    </>
                  ) : (
                    <CanvasCard theme={theme} padding={0}>
                      <CanvasTable<AdapterRow>
                        theme={theme}
                        columns={adapterColumns}
                        rows={adapterRows}
                      />
                    </CanvasCard>
                  )}
                </div>
              </CanvasCard>

              <div style={{ display: "grid", gap: 16 }}>
                <CanvasCard
                  theme={theme}
                  title={t("health.affectedServices")}
                  subtitle={
                    locale === "en"
                      ? "UiHealthEnvelope summary shown to this page."
                      : "此頁顯示的 UiHealthEnvelope 摘要。"
                  }
                >
                  <div style={{ display: "grid", gap: 10 }}>
                    {healthEnvelope.degradedServices.length === 0 ? (
                      <CanvasPill theme={theme} tone="success">
                        {t("health.affectedServicesNone")}
                      </CanvasPill>
                    ) : (
                      healthEnvelope.degradedServices.map((service) => (
                        <div
                          key={service.service}
                          style={{
                            display: "grid",
                            gap: 6,
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: `1px solid ${theme.border}`,
                            background: theme.surfaceLo,
                          }}
                        >
                          <div style={pillsRowStyle}>
                            <CanvasPill
                              theme={theme}
                              tone={toneForStatus(service.severity)}
                              dot
                            >
                              {service.service}
                            </CanvasPill>
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              lineHeight: 1.5,
                              color: theme.textMuted,
                            }}
                          >
                            {service.impact}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CanvasCard>

                <CanvasCard
                  theme={theme}
                  title={t("health.deepLinkLabel")}
                  subtitle={
                    locale === "en"
                      ? "Exit surfaces are explicit so operators can jump from health to the owning tool."
                      : "離開目的地要明確，讓操作員可以從健康頁直接跳到負責工具。"
                  }
                >
                  <div style={{ display: "grid", gap: 10 }}>
                    <Link
                      href="/adapter-registry?filter=attention"
                      style={linkButtonStyle(theme)}
                    >
                      {t("health.openAdapterRegistry")}
                    </Link>
                    {opsConsoleHref ? (
                      <a
                        href={opsConsoleHref}
                        target="_blank"
                        rel="noreferrer"
                        style={linkButtonStyle(theme)}
                      >
                        {t("health.openOpsConsole")}
                      </a>
                    ) : (
                      <CanvasPill theme={theme} tone="neutral">
                        {t("health.opsConsoleUnavailableHint")}
                      </CanvasPill>
                    )}
                  </div>
                </CanvasCard>

                <CanvasCard
                  theme={theme}
                  title={locale === "en" ? "Metric actions" : "指標動作"}
                  subtitle={
                    locale === "en"
                      ? "Primary CTA exposure is driven from each surface action set."
                      : "主要 CTA 由各 surface 的 action set 決定。"
                  }
                >
                  <div style={{ display: "grid", gap: 10 }}>
                    {metricCards.map((metric) => {
                      const action = metric.availableActions[0];
                      const link = action ? actionHrefMap[action.action] : null;
                      const href = link ? resolveCrossAppHref(link) : null;

                      return (
                        <div
                          key={metric.label}
                          style={{
                            display: "grid",
                            gap: 6,
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: `1px solid ${theme.border}`,
                            background: theme.surfaceLo,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 700,
                              color: theme.text,
                            }}
                          >
                            {metric.label}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              lineHeight: 1.55,
                              color: theme.textMuted,
                            }}
                          >
                            {metric.sub}
                          </div>
                          {action?.enabled && link && href ? (
                            renderActionLink(
                              theme,
                              href,
                              link.label,
                              link.openMode,
                              "ghost",
                            )
                          ) : (
                            <CanvasPill theme={theme} tone="neutral">
                              {t("health.readOnly")}
                            </CanvasPill>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CanvasCard>
              </div>
            </div>
          </>
        )}
      </div>
    </CanvasShell>
  );
}
