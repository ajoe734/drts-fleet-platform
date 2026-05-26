"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { partnerHasReadinessGaps } from "@/components/partner-governance-shared";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  AuditLogRecord,
  CrossAppResourceLink,
  EmptyReason,
  OperationalObservabilitySnapshot,
  PartnerChannelEntryRecord,
  PlatformAdminTenantRecord,
  PlatformAdminUserRecord,
  ReconciliationIssueRecord,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasIcon,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  CanvasTable,
} from "@drts/ui-web";

type ListSource<T> = {
  data: T[];
  error: string | null;
};

type ValueSource<T> = {
  data: T | null;
  error: string | null;
};

type HomeSources = {
  tenants: ListSource<PlatformAdminTenantRecord>;
  partners: ListSource<PartnerChannelEntryRecord>;
  users: ListSource<PlatformAdminUserRecord>;
  issues: ListSource<ReconciliationIssueRecord>;
  audit: ListSource<AuditLogRecord>;
  observability: ValueSource<OperationalObservabilitySnapshot>;
};

type HomeBannerTone = "info" | "warn" | "danger";

type HomeAction = ResourceActionDescriptor & {
  label: string;
  href?: string;
  resourceLink?: CrossAppResourceLink;
};

type ModuleCard = {
  key: string;
  section: string;
  href: string;
  label: string;
  note: string;
  icon: ComponentProps<typeof CanvasIcon>["name"];
  metric?: string;
  detail?: string;
  availableActions: HomeAction[];
  emptyState?:
    | {
        reason: EmptyReason;
        message: string;
        nextAction?: HomeAction | undefined;
      }
    | undefined;
};

type GovernanceQueueItem = {
  id: string;
  tone: HomeBannerTone;
  title: string;
  description: string;
  href: string;
  resourceLink?: CrossAppResourceLink;
  actions: HomeAction[];
};

type AuditTableRow = AuditLogRecord & Record<string, unknown>;

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const HOME_REFRESH_INTERVAL_MS = 30_000;

const initialSources: HomeSources = {
  tenants: { data: [], error: null },
  partners: { data: [], error: null },
  users: { data: [], error: null },
  issues: { data: [], error: null },
  audit: { data: [], error: null },
  observability: { data: null, error: null },
};

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageBodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 1fr)",
  gap: 16,
} satisfies CSSProperties;

const moduleToolbarStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
  justifyContent: "space-between",
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  maxWidth: 320,
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
} satisfies CSSProperties;

const moduleSectionStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const moduleCardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const moduleHeaderStyle = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
} satisfies CSSProperties;

const moduleIconStyle = {
  width: 34,
  height: 34,
  borderRadius: 10,
  background: theme.accentBg,
  color: theme.accent,
  border: `1px solid ${theme.accentBorder}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
} satisfies CSSProperties;

const moduleMetaStyle = {
  display: "grid",
  gap: 3,
  minWidth: 0,
} satisfies CSSProperties;

const moduleMetricStyle = {
  color: theme.text,
  fontFamily: theme.monoFamily,
  fontWeight: 700,
  fontSize: 22,
  lineHeight: 1,
} satisfies CSSProperties;

const moduleDetailStyle = {
  color: theme.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const inlineEmptyStateStyle = {
  display: "grid",
  gap: 8,
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px dashed ${theme.border}`,
  background: theme.bgRaised,
} satisfies CSSProperties;

const queueStackStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const statusGridStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const statusRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  fontSize: 12.5,
} satisfies CSSProperties;

const actorCellStyle = {
  display: "grid",
  gap: 2,
  minWidth: 0,
} satisfies CSSProperties;

const actorPrimaryStyle = {
  color: theme.text,
  fontWeight: 600,
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
} satisfies CSSProperties;

const actorMetaStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.35,
} satisfies CSSProperties;

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          crossTenant: "Cross-tenant governance",
          partnerGov: "Partner Governance",
          partners: "Partner entry",
          peopleFleet: "People & Fleet",
          users: "Platform staff",
          fleet: "Fleet & compliance",
          commerce: "Platform & Commerce",
          switchboard: "Public info & placards",
          pricing: "Pricing",
          payments: "Settlement governance",
          adapters: "Adapter registry",
          opsRisk: "Platform Ops & Risk",
          health: "Platform health",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          tenantGov: "租戶治理",
          tenants: "租戶",
          crossTenant: "跨租戶治理",
          partnerGov: "合作夥伴治理",
          partners: "合作夥伴 entry",
          peopleFleet: "人員與車隊",
          users: "平台人員",
          fleet: "車隊與法遵",
          commerce: "平台與商務",
          switchboard: "公開資訊與牌貼",
          pricing: "費率治理",
          payments: "結算與帳務",
          adapters: "平台 Adapter",
          opsRisk: "平台維運",
          health: "平台健康",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    { divider: labels.tenantGov },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
    {
      key: "tenant-governance",
      href: "/tenant-governance",
      icon: "governance",
      label: labels.crossTenant,
    },
    { divider: labels.partnerGov },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { divider: labels.peopleFleet },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    { divider: labels.commerce },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
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
    {
      key: "adapter-registry",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
    { divider: labels.opsRisk },
    { key: "health", href: "/health", icon: "health", label: labels.health },
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
  ];
}

function createRefreshMetadata(
  lastLoadedAt: string | null,
  errorCount: number,
): UiRefreshMetadata {
  const generatedAt = lastLoadedAt ?? new Date(0).toISOString();

  if (!lastLoadedAt) {
    return {
      generatedAt,
      staleAfterMs: HOME_REFRESH_INTERVAL_MS,
      dataFreshness: "unknown",
      source: "live",
    };
  }

  const ageMs = Date.now() - new Date(lastLoadedAt).getTime();

  return {
    generatedAt: lastLoadedAt,
    staleAfterMs: HOME_REFRESH_INTERVAL_MS,
    dataFreshness:
      errorCount > 0
        ? "degraded"
        : ageMs > HOME_REFRESH_INTERVAL_MS
          ? "stale"
          : "fresh",
    source: "live",
  };
}

function extractErrorMessage(
  result: PromiseSettledResult<unknown>,
): string | null {
  if (result.status === "fulfilled") {
    return null;
  }

  const reason = result.reason;
  return reason instanceof Error ? reason.message : String(reason);
}

function isPermissionError(message: string | null): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("403") ||
    normalized.includes("401") ||
    normalized.includes("permission")
  );
}

function toneForEmptyReason(reason: EmptyReason): HomeBannerTone {
  switch (reason) {
    case "fetch_failed":
    case "permission_denied":
      return "danger";
    case "external_unavailable":
      return "warn";
    case "filtered_empty":
      return "info";
    case "no_data":
    case "not_provisioned":
    default:
      return "info";
  }
}

function buildCrossAppHref(link: CrossAppResourceLink): string {
  if (link.targetApp === "platform-admin") {
    return link.route;
  }

  const origin =
    link.targetApp === "ops-console"
      ? (process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003")
      : (process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3004");

  return `${origin}${link.route}`;
}

function openAction(router: ReturnType<typeof useRouter>, action: HomeAction) {
  const targetHref =
    action.href ??
    (action.resourceLink ? buildCrossAppHref(action.resourceLink) : null);

  if (!targetHref || !action.enabled) {
    return;
  }

  if (action.resourceLink?.openMode === "new_tab") {
    window.open(targetHref, "_blank", "noopener,noreferrer");
    return;
  }

  if (targetHref.startsWith("http://") || targetHref.startsWith("https://")) {
    window.open(targetHref, "_blank", "noopener,noreferrer");
    return;
  }

  router.push(targetHref);
}

function needsPartnerAttention(entry: PartnerChannelEntryRecord) {
  return entry.status !== "active" || partnerHasReadinessGaps(entry);
}

function alertTone(
  state: NonNullable<
    OperationalObservabilitySnapshot["alerts"]
  >[number]["state"],
): HomeBannerTone {
  switch (state) {
    case "critical":
      return "danger";
    case "warning":
      return "warn";
    case "healthy":
    default:
      return "info";
  }
}

function formatHealthStatus(locale: string, refresh: UiRefreshMetadata) {
  if (refresh.dataFreshness === "degraded") {
    return locale === "en" ? "degraded snapshot" : "快照降級";
  }
  if (refresh.dataFreshness === "stale") {
    return locale === "en" ? "stale snapshot" : "快照偏舊";
  }
  if (refresh.dataFreshness === "unknown") {
    return locale === "en" ? "waiting for first snapshot" : "等待首筆快照";
  }
  return locale === "en" ? "live snapshot" : "即時快照";
}

function renderEmptyState(
  locale: string,
  emptyState: ModuleCard["emptyState"],
  onAction: (action: HomeAction) => void,
) {
  if (!emptyState) {
    return null;
  }

  const copy: Record<EmptyReason, string> =
    locale === "en"
      ? {
          no_data: "No records yet",
          not_provisioned: "Not provisioned",
          fetch_failed: "Unable to fetch data",
          permission_denied: "You can view the module, but not this dataset",
          external_unavailable: "External system unavailable",
          driver_not_eligible: "Not eligible for this queue",
          filtered_empty: "No modules match this filter",
        }
      : {
          no_data: "目前沒有資料",
          not_provisioned: "尚未完成建置",
          fetch_failed: "資料讀取失敗",
          permission_denied: "你可看到模組，但無權讀取這份資料",
          external_unavailable: "外部系統暫時不可用",
          driver_not_eligible: "目前不符合接單條件",
          filtered_empty: "目前沒有符合篩選的模組",
        };

  return (
    <div style={inlineEmptyStateStyle}>
      <CanvasPill
        theme={theme}
        tone={toneForEmptyReason(emptyState.reason)}
        dot
      >
        {copy[emptyState.reason]}
      </CanvasPill>
      <div style={moduleDetailStyle}>{emptyState.message}</div>
      {emptyState.nextAction ? (
        <div style={actionRowStyle}>
          <CanvasBtn
            theme={theme}
            variant="secondary"
            disabled={!emptyState.nextAction.enabled}
            onClick={() => onAction(emptyState.nextAction!)}
          >
            {emptyState.nextAction.label}
          </CanvasBtn>
        </div>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  const { locale } = useTranslation();
  const router = useRouter();
  const client = usePlatformAdminClient();
  const [sources, setSources] = useState<HomeSources>(initialSources);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [moduleQuery, setModuleQuery] = useState("");

  const loadSnapshot = useCallback(
    async (reason: "initial" | "manual" | "poll" = "manual") => {
      if (reason === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const results = await Promise.allSettled([
        client.listPlatformTenants(),
        client.listPlatformPartnerEntries(),
        client.listPlatformAdminUsers(),
        client.listReconciliationIssues(),
        client.listAuditLogs() as Promise<AuditLogRecord[]>,
        client.getOperationalObservability(),
      ]);

      setSources({
        tenants: {
          data:
            results[0].status === "fulfilled" ? (results[0].value ?? []) : [],
          error: extractErrorMessage(results[0]),
        },
        partners: {
          data:
            results[1].status === "fulfilled" ? (results[1].value ?? []) : [],
          error: extractErrorMessage(results[1]),
        },
        users: {
          data:
            results[2].status === "fulfilled" ? (results[2].value ?? []) : [],
          error: extractErrorMessage(results[2]),
        },
        issues: {
          data:
            results[3].status === "fulfilled" ? (results[3].value ?? []) : [],
          error: extractErrorMessage(results[3]),
        },
        audit: {
          data:
            results[4].status === "fulfilled" ? (results[4].value ?? []) : [],
          error: extractErrorMessage(results[4]),
        },
        observability: {
          data: results[5].status === "fulfilled" ? results[5].value : null,
          error: extractErrorMessage(results[5]),
        },
      });
      setLastLoadedAt(new Date().toISOString());
      setLoading(false);
      setRefreshing(false);
    },
    [client],
  );

  useEffect(() => {
    void loadSnapshot("initial");
  }, [loadSnapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadSnapshot("poll");
    }, HOME_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [loadSnapshot]);

  const copy =
    locale === "en"
      ? {
          title: "Platform governance home",
          subtitle: (count: number) =>
            `DRTS control plane. ${count} governance item(s) need review today.`,
          refresh: "Refresh",
          refreshing: "Refreshing...",
          queueTitle: "Today's governance queue",
          queueSubtitle: "Cross-module items that need platform intervention.",
          workspaceTitle: "Workspace status",
          workspaceSubtitle: "Refresh tier, route map, and cross-app posture.",
          searchPlaceholder: "Filter modules or routes…",
          routesTitle: "Module sitemap",
          routesSubtitle: "Landing board aligned to the Platform Admin canvas.",
          auditTitle: "Recent sensitive operations",
          auditSubtitle: "Platform-layer audit trail · last 24 hours.",
          auditAction: "Go to audit",
          noQueue: "No platform-routed governance blockers at the moment.",
          queueAll: "Open all",
          filteredEmpty: "No modules matched the current filter.",
          auditTime: "Time",
          auditModule: "Module",
          auditActionLabel: "Action",
          auditActor: "Actor",
          auditRequest: "Request",
          kpiTenants: "Active tenants",
          kpiPartners: "Partner entries",
          kpiDrivers: "Active drivers",
          kpiRecon: "Pending reconciliation",
          refreshTier: "Refresh tier",
          healthState: "Freshness",
          routeCoverage: "Route coverage",
          routeCoverageValue: "18 routes / 6 sections",
          crossApp: "Cross-app links",
          crossAppValue: "ops-console + tenant-console",
          lastGenerated: "Generated",
          loading: "Loading platform home snapshot...",
          showNewTab: "Opens in new tab",
          sections: {
            workspace: "Workspace",
            tenant: "Tenant Governance",
            partner: "Partner Governance",
            peopleFleet: "People & Fleet",
            commerce: "Platform & Commerce",
            opsRisk: "Platform Ops & Risk",
          },
        }
      : {
          title: "平台治理工作首頁",
          subtitle: (count: number) =>
            `DRTS 平台控制平面，今日有 ${count} 件治理事項需要審視。`,
          refresh: "重新整理",
          refreshing: "重新整理中...",
          queueTitle: "今日治理待辦",
          queueSubtitle: "跨模組需要平台治理人介入的事項。",
          workspaceTitle: "工作面狀態",
          workspaceSubtitle: "refresh tier、route map 與 cross-app posture。",
          searchPlaceholder: "篩選模組或 route…",
          routesTitle: "模組 sitemap",
          routesSubtitle: "依 Platform Admin canvas 重建的 landing board。",
          auditTitle: "近期高敏感操作",
          auditSubtitle: "平台層審計足跡 · 最近 24 小時。",
          auditAction: "前往稽核",
          noQueue: "目前沒有路由到平台端的治理阻塞。",
          queueAll: "展開所有",
          filteredEmpty: "目前沒有符合篩選條件的模組。",
          auditTime: "時間",
          auditModule: "模組",
          auditActionLabel: "動作",
          auditActor: "操作者",
          auditRequest: "Request",
          kpiTenants: "活躍租戶",
          kpiPartners: "合作夥伴 entry",
          kpiDrivers: "活躍司機",
          kpiRecon: "待結算對帳",
          refreshTier: "Refresh tier",
          healthState: "資料鮮度",
          routeCoverage: "Route coverage",
          routeCoverageValue: "18 routes / 6 sections",
          crossApp: "Cross-app links",
          crossAppValue: "ops-console + tenant-console",
          lastGenerated: "快照時間",
          loading: "載入平台首頁快照中...",
          showNewTab: "以新分頁開啟",
          sections: {
            workspace: "工作面",
            tenant: "租戶治理",
            partner: "合作夥伴治理",
            peopleFleet: "人員與車隊",
            commerce: "平台與商務",
            opsRisk: "平台維運",
          },
        };

  const errorCount = [
    sources.tenants.error,
    sources.partners.error,
    sources.users.error,
    sources.issues.error,
    sources.audit.error,
    sources.observability.error,
  ].filter(Boolean).length;

  const refresh = useMemo(
    () => createRefreshMetadata(lastLoadedAt, errorCount),
    [errorCount, lastLoadedAt],
  );

  const metrics = useMemo(() => {
    const alerts: NonNullable<OperationalObservabilitySnapshot["alerts"]> =
      sources.observability.data?.alerts ?? [];
    let criticalAlerts = 0;

    for (const alert of alerts) {
      if (alert.routes.includes("platform") && alert.state === "critical") {
        criticalAlerts += 1;
      }
    }

    return {
      activeTenants: sources.tenants.data.filter(
        (tenant) => tenant.status === "active",
      ).length,
      partnerEntries: sources.partners.data.length,
      activeDrivers:
        sources.observability.data?.driverState.dispatchEligibleDrivers ?? 0,
      pendingReconciliation: sources.issues.data.filter(
        (issue) => issue.status !== "resolved",
      ).length,
      sandboxTenants: sources.tenants.data.filter(
        (tenant) => tenant.rollout.stage === "sandbox",
      ).length,
      pilotTenants: sources.tenants.data.filter(
        (tenant) => tenant.rollout.stage === "pilot",
      ).length,
      rollbackTenants: sources.tenants.data.filter(
        (tenant) => tenant.status === "rollback_hold",
      ).length,
      partnerAttention: sources.partners.data.filter(needsPartnerAttention)
        .length,
      staleDrivers:
        sources.observability.data?.driverState.staleLocationDrivers ?? 0,
      criticalAlerts,
    };
  }, [sources]);

  const governanceQueue = useMemo(() => {
    const alerts: NonNullable<OperationalObservabilitySnapshot["alerts"]> = [];

    for (const alert of sources.observability.data?.alerts ?? []) {
      if (alert.routes.includes("platform")) {
        alerts.push(alert);
      }
    }

    const rollbackTenant = sources.tenants.data.find(
      (tenant) => tenant.status === "rollback_hold",
    );
    const partnerEntry = sources.partners.data.find(needsPartnerAttention);
    const openIssue = sources.issues.data.find(
      (issue) => issue.status !== "resolved",
    );

    const items: GovernanceQueueItem[] = [];

    if (alerts[0]) {
      items.push({
        id: `alert-${alerts[0].key}`,
        tone: alertTone(alerts[0].state),
        title:
          locale === "en"
            ? `Operational alert: ${alerts[0].key}`
            : `營運告警：${alerts[0].key}`,
        description:
          locale === "en"
            ? `Measured ${alerts[0].measuredValue} at ${formatDateTime(alerts[0].observedAt)}. Review the platform-routed health board before it spills into ops-only handling.`
            : `${formatDateTime(alerts[0].observedAt)} 量測值 ${alerts[0].measuredValue}。請先在平台端完成判讀，再決定是否交給 ops-only handling。`,
        href: "/health",
        resourceLink: {
          targetApp: "ops-console",
          route: "/dispatch",
          resourceType: "dispatch_board",
          resourceId: "platform",
          openMode: "new_tab",
          label:
            locale === "en"
              ? "Open ops dispatch board"
              : "開啟 ops dispatch board",
        },
        actions: [
          {
            action: "open_health",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open health" : "查看健康頁",
            href: "/health",
          },
          {
            action: "open_ops_dispatch",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Ops dispatch" : "Ops dispatch",
            resourceLink: {
              targetApp: "ops-console",
              route: "/dispatch",
              resourceType: "dispatch_board",
              resourceId: "platform",
              openMode: "new_tab",
              label:
                locale === "en"
                  ? "Open ops dispatch board"
                  : "開啟 ops dispatch board",
            },
          },
        ],
      });
    }

    if (rollbackTenant) {
      items.push({
        id: `tenant-${rollbackTenant.id}`,
        tone: "warn",
        title:
          locale === "en"
            ? `${rollbackTenant.name} is in rollback hold`
            : `${rollbackTenant.name} 處於 rollback hold`,
        description:
          locale === "en"
            ? `Rollout stage ${rollbackTenant.rollout.stage}. Verify cutover owner, rollback owner, and onboarding notes before any new promotion.`
            : `目前 rollout 階段為 ${rollbackTenant.rollout.stage}。推進前請先確認 cutover / rollback owner 與 onboarding 備註。`,
        href: `/tenants/${rollbackTenant.id}`,
        resourceLink: {
          targetApp: "ops-console",
          route: `/dispatch?tenantId=${encodeURIComponent(rollbackTenant.id)}`,
          resourceType: "tenant_dispatch_context",
          resourceId: rollbackTenant.id,
          openMode: "new_tab",
          label:
            locale === "en" ? "Open ops tenant view" : "在 ops 開啟租戶視角",
        },
        actions: [
          {
            action: "open_tenant",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open tenant" : "查看租戶",
            href: `/tenants/${rollbackTenant.id}`,
          },
          {
            action: "open_ops_tenant",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Ops tenant view" : "Ops 租戶視角",
            resourceLink: {
              targetApp: "ops-console",
              route: `/dispatch?tenantId=${encodeURIComponent(rollbackTenant.id)}`,
              resourceType: "tenant_dispatch_context",
              resourceId: rollbackTenant.id,
              openMode: "new_tab",
              label:
                locale === "en"
                  ? "Open ops tenant view"
                  : "在 ops 開啟租戶視角",
            },
          },
        ],
      });
    }

    if (partnerEntry) {
      items.push({
        id: `partner-${partnerEntry.entrySlug}`,
        tone: "info",
        title:
          locale === "en"
            ? `${partnerEntry.displayName} still has readiness gaps`
            : `${partnerEntry.displayName} 仍有 readiness 缺口`,
        description:
          locale === "en"
            ? "Branding, routing, or support metadata is incomplete. Finish the entry package before enabling production traffic."
            : "品牌、路由或支援資訊尚未補齊。正式導流前請先完成 entry package。",
        href: `/partners/${partnerEntry.entrySlug}`,
        actions: [
          {
            action: "open_partner",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open partner" : "查看夥伴",
            href: `/partners/${partnerEntry.entrySlug}`,
          },
        ],
      });
    }

    if (openIssue) {
      items.push({
        id: `issue-${openIssue.issueId}`,
        tone: "danger",
        title:
          locale === "en"
            ? `${openIssue.issueId} remains open in settlement governance`
            : `${openIssue.issueId} 仍在結算治理佇列中`,
        description:
          locale === "en"
            ? `Channel ${openIssue.channelKey}. Review owner, evidence, and resolution notes before the next finance close.`
            : `渠道 ${openIssue.channelKey}。請在下一次財務 close 前確認 owner、evidence 與 resolution note。`,
        href: "/payments",
        resourceLink: {
          targetApp: "ops-console",
          route: `/revenue?issueId=${encodeURIComponent(openIssue.issueId)}`,
          resourceType: "reconciliation_issue",
          resourceId: openIssue.issueId,
          openMode: "new_tab",
          label:
            locale === "en"
              ? "Open ops revenue mirror"
              : "開啟 ops revenue mirror",
        },
        actions: [
          {
            action: "open_payments",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open payments" : "查看結算",
            href: "/payments",
          },
          {
            action: "open_ops_revenue",
            enabled: true,
            riskLevel: "low",
            label:
              locale === "en" ? "Ops revenue mirror" : "Ops revenue mirror",
            resourceLink: {
              targetApp: "ops-console",
              route: `/revenue?issueId=${encodeURIComponent(openIssue.issueId)}`,
              resourceType: "reconciliation_issue",
              resourceId: openIssue.issueId,
              openMode: "new_tab",
              label:
                locale === "en"
                  ? "Open ops revenue mirror"
                  : "開啟 ops revenue mirror",
            },
          },
        ],
      });
    }

    return items;
  }, [locale, sources]);

  const moduleCards = useMemo<ModuleCard[]>(() => {
    const tenantErrorReason: EmptyReason | null = isPermissionError(
      sources.tenants.error,
    )
      ? "permission_denied"
      : sources.tenants.error
        ? "fetch_failed"
        : sources.tenants.data.length === 0
          ? "no_data"
          : null;
    const partnerErrorReason: EmptyReason | null = isPermissionError(
      sources.partners.error,
    )
      ? "permission_denied"
      : sources.partners.error
        ? "fetch_failed"
        : sources.partners.data.length === 0
          ? "not_provisioned"
          : null;
    const usersErrorReason: EmptyReason | null = isPermissionError(
      sources.users.error,
    )
      ? "permission_denied"
      : sources.users.error
        ? "fetch_failed"
        : sources.users.data.length === 0
          ? "no_data"
          : null;
    const issuesErrorReason: EmptyReason | null = isPermissionError(
      sources.issues.error,
    )
      ? "permission_denied"
      : sources.issues.error
        ? "fetch_failed"
        : sources.issues.data.length === 0
          ? "no_data"
          : null;
    const auditErrorReason: EmptyReason | null = isPermissionError(
      sources.audit.error,
    )
      ? "permission_denied"
      : sources.audit.error
        ? "fetch_failed"
        : sources.audit.data.length === 0
          ? "no_data"
          : null;
    const healthReason: EmptyReason | null = sources.observability.error
      ? "external_unavailable"
      : null;

    return [
      {
        key: "tenants",
        section: copy.sections.tenant,
        href: "/tenants",
        label: locale === "en" ? "Tenants" : "租戶",
        note:
          locale === "en"
            ? "Lifecycle, modules, rollout, onboarding."
            : "生命週期、模組、rollout 與 onboarding。",
        icon: "tenants",
        metric: String(sources.tenants.data.length),
        detail:
          locale === "en"
            ? `${metrics.pilotTenants} pilot · ${metrics.sandboxTenants} sandbox`
            : `${metrics.pilotTenants} pilot · ${metrics.sandboxTenants} sandbox`,
        availableActions: [
          {
            action: "open_tenants",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/tenants",
          },
          {
            action: "create_tenant",
            enabled: true,
            riskLevel: "medium",
            label: locale === "en" ? "Create tenant" : "建立租戶",
            href: "/tenants",
          },
        ],
        emptyState: tenantErrorReason
          ? {
              reason: tenantErrorReason,
              message:
                sources.tenants.error ??
                (locale === "en"
                  ? "No tenant records yet."
                  : "目前尚無租戶資料。"),
            }
          : undefined,
      },
      {
        key: "tenant-governance",
        section: copy.sections.tenant,
        href: "/tenant-governance",
        label: locale === "en" ? "Cross-tenant governance" : "跨租戶治理",
        note:
          locale === "en"
            ? "Quota posture, approvals, cost-center health, governance risk."
            : "配額態勢、核准流、成本中心健康與治理風險。",
        icon: "governance",
        metric: `${metrics.rollbackTenants}`,
        detail:
          locale === "en" ? "rollback hold tenants" : "rollback hold 租戶",
        availableActions: [
          {
            action: "open_tenant_governance",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/tenant-governance",
          },
        ],
      },
      {
        key: "partners",
        section: copy.sections.partner,
        href: "/partners",
        label: locale === "en" ? "Partner entries" : "合作夥伴",
        note:
          locale === "en"
            ? "Partner entry, credential issuance, readiness, branding."
            : "合作夥伴 entry、憑證核發、readiness 與 branding。",
        icon: "partners",
        metric: String(sources.partners.data.length),
        detail:
          locale === "en"
            ? `${metrics.partnerAttention} need attention`
            : `${metrics.partnerAttention} 件需關注`,
        availableActions: [
          {
            action: "open_partners",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/partners",
          },
          {
            action: "create_partner",
            enabled: true,
            riskLevel: "medium",
            label: locale === "en" ? "Create entry" : "建立 entry",
            href: "/partners",
          },
        ],
        emptyState: partnerErrorReason
          ? {
              reason: partnerErrorReason,
              message:
                sources.partners.error ??
                (locale === "en"
                  ? "Provision the first partner entry package before enabling production traffic."
                  : "正式導流前，先建立第一筆 partner entry package。"),
              nextAction: {
                action: "create_partner_entry",
                enabled: true,
                riskLevel: "medium",
                label: locale === "en" ? "Create entry" : "建立 entry",
                href: "/partners",
              },
            }
          : undefined,
      },
      {
        key: "users",
        section: copy.sections.peopleFleet,
        href: "/users",
        label: locale === "en" ? "Platform staff" : "平台人員",
        note:
          locale === "en"
            ? "Identity governance, role coverage, invite lifecycle."
            : "身分治理、角色覆蓋與邀請生命週期。",
        icon: "users",
        metric: String(sources.users.data.length),
        detail:
          locale === "en"
            ? `${sources.users.data.filter((user) => user.status === "active").length} active`
            : `${sources.users.data.filter((user) => user.status === "active").length} 啟用中`,
        availableActions: [
          {
            action: "open_users",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/users",
          },
        ],
        emptyState: usersErrorReason
          ? {
              reason: usersErrorReason,
              message:
                sources.users.error ??
                (locale === "en"
                  ? "No platform staff records yet."
                  : "目前尚無平台人員資料。"),
            }
          : undefined,
      },
      {
        key: "fleet",
        section: copy.sections.peopleFleet,
        href: "/fleet",
        label: locale === "en" ? "Fleet & compliance" : "車隊與法遵",
        note:
          locale === "en"
            ? "Vehicles, drivers, contracts, exclusivity, offboarding."
            : "車輛、司機、合約、exclusivity 與 offboarding。",
        icon: "fleet",
        metric: String(metrics.activeDrivers),
        detail:
          locale === "en"
            ? `${metrics.staleDrivers} stale location drivers`
            : `${metrics.staleDrivers} 名 stale location 司機`,
        availableActions: [
          {
            action: "open_fleet",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/fleet",
          },
        ],
      },
      {
        key: "switchboard",
        section: copy.sections.commerce,
        href: "/switchboard",
        label: locale === "en" ? "Public info & placards" : "公開資訊與牌貼",
        note:
          locale === "en"
            ? "Public disclosures, placard generation, route-facing notices."
            : "公開資訊、牌貼產生與對外公告。",
        icon: "switchboard",
        availableActions: [
          {
            action: "open_switchboard",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/switchboard",
          },
        ],
      },
      {
        key: "pricing",
        section: copy.sections.commerce,
        href: "/pricing",
        label: locale === "en" ? "Pricing" : "費率治理",
        note:
          locale === "en"
            ? "Pricing rules, fee plans, subsidy rules, publish history."
            : "費率規則、費用方案、補貼規則與發佈歷程。",
        icon: "pricing",
        availableActions: [
          {
            action: "open_pricing",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/pricing",
          },
          {
            action: "publish_pricing",
            enabled: false,
            disabledReasonCode: "publish_from_pricing_workspace",
            requiresReason: true,
            riskLevel: "high",
            label: locale === "en" ? "Publish rule" : "發佈規則",
            href: "/pricing",
          },
        ],
      },
      {
        key: "payments",
        section: copy.sections.commerce,
        href: "/payments",
        label: locale === "en" ? "Settlement governance" : "結算與帳務",
        note:
          locale === "en"
            ? "Invoices, driver statements, reconciliation issues, reimbursements."
            : "租戶發票、司機對帳單、對帳議題與代墊批次。",
        icon: "payments",
        metric: String(metrics.pendingReconciliation),
        detail:
          locale === "en"
            ? `${sources.issues.data.length} total issues`
            : `${sources.issues.data.length} 筆議題`,
        availableActions: [
          {
            action: "open_payments",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/payments",
          },
          {
            action: "open_reimbursements",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Reimbursements" : "代墊批次",
            href: "/payments/reimbursements",
          },
        ],
        emptyState: issuesErrorReason
          ? {
              reason: issuesErrorReason,
              message:
                sources.issues.error ??
                (locale === "en"
                  ? "No reconciliation issues are currently routed here."
                  : "目前沒有路由到此處的對帳議題。"),
            }
          : undefined,
      },
      {
        key: "adapter-registry",
        section: copy.sections.commerce,
        href: "/adapter-registry",
        label: locale === "en" ? "Adapter registry" : "平台 Adapter",
        note:
          locale === "en"
            ? "External platform adapters, credentials, production pause controls."
            : "外部平台 adapter、憑證與 production pause control。",
        icon: "adapters",
        availableActions: [
          {
            action: "open_adapters",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/adapter-registry",
          },
          {
            action: "open_ops_forwarded_board",
            enabled: true,
            riskLevel: "low",
            label:
              locale === "en" ? "Ops forwarded board" : "Ops forwarded board",
            resourceLink: {
              targetApp: "ops-console",
              route: "/dispatch",
              resourceType: "forwarded_dispatch_board",
              resourceId: "platform",
              openMode: "new_tab",
              label:
                locale === "en"
                  ? "Open ops forwarded board"
                  : "開啟 ops forwarded board",
            },
          },
        ],
      },
      {
        key: "health",
        section: copy.sections.opsRisk,
        href: "/health",
        label: locale === "en" ? "Platform health" : "平台健康",
        note:
          locale === "en"
            ? "Platform alerts, dispatch lag, webhook queue, adapter health."
            : "平台告警、dispatch lag、webhook queue 與 adapter health。",
        icon: "health",
        metric: String(metrics.criticalAlerts),
        detail:
          locale === "en" ? "critical platform alerts" : "平台 critical alerts",
        availableActions: [
          {
            action: "open_health",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/health",
          },
        ],
        emptyState: healthReason
          ? {
              reason: healthReason,
              message:
                sources.observability.error ??
                (locale === "en"
                  ? "The observability source did not return a usable snapshot."
                  : "observability 來源未回傳可用快照。"),
            }
          : undefined,
      },
      {
        key: "notices",
        section: copy.sections.opsRisk,
        href: "/notices",
        label: locale === "en" ? "Notices & maintenance" : "公告與維護",
        note:
          locale === "en"
            ? "Critical notices, maintenance mode, broadcast history."
            : "critical notice、maintenance mode 與廣播歷史。",
        icon: "notices",
        availableActions: [
          {
            action: "open_notices",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/notices",
          },
          {
            action: "create_notice",
            enabled: true,
            riskLevel: "medium",
            label: locale === "en" ? "Create notice" : "建立公告",
            href: "/notices",
          },
        ],
      },
      {
        key: "audit",
        section: copy.sections.opsRisk,
        href: "/audit",
        label: locale === "en" ? "Audit & evidence" : "稽核與證據",
        note:
          locale === "en"
            ? "Audit log, legal hold, deletion exception visibility."
            : "稽核日誌、legal hold 與 deletion exception 檢視。",
        icon: "audit",
        metric: String(sources.audit.data.length),
        detail: locale === "en" ? "recent records" : "近期紀錄",
        availableActions: [
          {
            action: "open_audit",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/audit",
          },
          {
            action: "open_cross_app_audit",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Ops audit" : "Ops audit",
            resourceLink: {
              targetApp: "ops-console",
              route: "/audit",
              resourceType: "audit_log",
              resourceId: "platform",
              openMode: "new_tab",
              label: locale === "en" ? "Open ops audit" : "開啟 ops audit",
            },
          },
        ],
        emptyState: auditErrorReason
          ? {
              reason: auditErrorReason,
              message:
                sources.audit.error ??
                (locale === "en"
                  ? "No audit records were returned in the last 24 hours."
                  : "最近 24 小時沒有稽核紀錄。"),
            }
          : undefined,
      },
      {
        key: "feature-flags",
        section: copy.sections.opsRisk,
        href: "/feature-flags",
        label: locale === "en" ? "Feature flags" : "功能旗標",
        note:
          locale === "en"
            ? "Platform write authority for rollout switches."
            : "rollout switch 的平台寫入權限。",
        icon: "flags",
        availableActions: [
          {
            action: "open_feature_flags",
            enabled: true,
            riskLevel: "low",
            label: locale === "en" ? "Open" : "查看",
            href: "/feature-flags",
          },
        ],
      },
    ] as ModuleCard[];
  }, [copy.sections, locale, metrics, sources]);

  const filteredModules = useMemo(() => {
    if (!moduleQuery.trim()) {
      return moduleCards;
    }

    const query = moduleQuery.trim().toLowerCase();

    return moduleCards.filter((card) => {
      return [card.label, card.note, card.href, card.section].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [moduleCards, moduleQuery]);

  const groupedModules = useMemo(() => {
    const groups = new Map<string, ModuleCard[]>();

    for (const card of filteredModules) {
      const current = groups.get(card.section) ?? [];
      current.push(card);
      groups.set(card.section, current);
    }

    return Array.from(groups.entries());
  }, [filteredModules]);

  const recentAudit = sources.audit.data.slice(0, 5);
  const governanceItemCount =
    governanceQueue.length + metrics.rollbackTenants + metrics.criticalAlerts;
  const showDegradedBanner =
    refresh.dataFreshness === "degraded" || metrics.criticalAlerts > 0;
  const showLoadingState = loading && !lastLoadedAt;

  const auditColumns: CanvasTableColumn<AuditTableRow>[] = [
    {
      h: copy.auditTime,
      w: 180,
      mono: true,
      r: (row) => formatDateTime(row.createdAt),
    },
    {
      h: copy.auditModule,
      w: 120,
      mono: true,
      r: (row) => row.module,
    },
    {
      h: copy.auditActionLabel,
      w: 170,
      mono: true,
      r: (row) => row.action,
    },
    {
      h: copy.auditActor,
      r: (row) => (
        <div style={actorCellStyle}>
          <span style={actorPrimaryStyle}>{row.actorId}</span>
          <span style={actorMetaStyle}>
            {row.actorType}
            {row.tenantId ? ` · ${row.tenantId}` : ""}
          </span>
        </div>
      ),
    },
    {
      h: copy.auditRequest,
      w: 160,
      mono: true,
      r: (row) => row.requestId,
    },
  ];

  return (
    <CanvasShell
      theme={theme}
      nav={buildPlatformNav(locale)}
      active="home"
      currentPath="/"
      brandLabel={locale === "en" ? "DRTS" : "DRTS"}
      brandSubLabel={locale === "en" ? "PLATFORM ADMIN" : "PLATFORM ADMIN"}
      breadcrumb={[copy.title]}
      env="production"
      versionLabel="canvas"
      searchPlaceholder={copy.searchPlaceholder}
      avatarLabel={locale === "en" ? "PA" : "平台"}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle(governanceItemCount)}
        actions={
          <CanvasBtn
            theme={theme}
            icon="arrow"
            onClick={() => void loadSnapshot("manual")}
          >
            {refreshing ? copy.refreshing : copy.refresh}
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        {showLoadingState ? (
          <CanvasCard theme={theme} title={copy.title} subtitle={copy.loading}>
            <div style={moduleDetailStyle}>{copy.loading}</div>
          </CanvasCard>
        ) : null}

        {showDegradedBanner ? (
          <CanvasBanner
            theme={theme}
            tone={metrics.criticalAlerts > 0 ? "danger" : "warn"}
            title={
              locale === "en"
                ? "Platform home is showing a degraded snapshot"
                : "平台首頁目前顯示降級快照"
            }
            body={
              locale === "en"
                ? `${errorCount} source(s) reported errors or critical health alerts. Review /health and /audit before acting on stale data.`
                : `${errorCount} 個來源回報錯誤或 critical health alert。操作前請先查看 /health 與 /audit。`
            }
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label={copy.kpiTenants}
            value={String(metrics.activeTenants)}
            delta={`${metrics.pilotTenants} pilot · ${metrics.sandboxTenants} sandbox`}
            sub={`${metrics.rollbackTenants} rollback hold`}
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpiPartners}
            value={String(metrics.partnerEntries)}
            delta={`${metrics.partnerAttention} attention`}
            sub={
              locale === "en"
                ? "entry readiness + credentials"
                : "entry readiness + credentials"
            }
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpiDrivers}
            value={String(metrics.activeDrivers)}
            delta={`${metrics.staleDrivers} stale`}
            sub={
              locale === "en"
                ? "dispatch-eligible from observability"
                : "來自 observability 的 dispatch-eligible"
            }
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpiRecon}
            value={String(metrics.pendingReconciliation)}
            delta={`${sources.issues.data.length} total`}
            sub={
              locale === "en"
                ? "platform-owned reconciliation queue"
                : "平台持有的 reconciliation queue"
            }
          />
        </div>

        <div style={splitGridStyle}>
          <CanvasCard
            theme={theme}
            title={copy.queueTitle}
            subtitle={copy.queueSubtitle}
            actions={
              <CanvasBtn
                theme={theme}
                variant="ghost"
                onClick={() => router.push("/health")}
              >
                {copy.queueAll}
              </CanvasBtn>
            }
          >
            <div style={queueStackStyle}>
              {governanceQueue.length === 0 ? (
                <div style={inlineEmptyStateStyle}>
                  <CanvasPill theme={theme} tone="info" dot>
                    {locale === "en" ? "No blockers" : "目前無阻塞"}
                  </CanvasPill>
                  <div style={moduleDetailStyle}>{copy.noQueue}</div>
                </div>
              ) : (
                governanceQueue.map((item) => (
                  <CanvasBanner
                    key={item.id}
                    theme={theme}
                    tone={item.tone}
                    title={item.title}
                    body={item.description}
                    actions={
                      <div style={actionRowStyle}>
                        {item.actions.map((action) => (
                          <CanvasBtn
                            key={action.action}
                            theme={theme}
                            variant={
                              action.action === item.actions[0]?.action
                                ? "primary"
                                : "secondary"
                            }
                            disabled={!action.enabled}
                            onClick={() => openAction(router, action)}
                          >
                            {action.label}
                          </CanvasBtn>
                        ))}
                      </div>
                    }
                  />
                ))
              )}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy.workspaceTitle}
            subtitle={copy.workspaceSubtitle}
          >
            <div style={statusGridStyle}>
              <div style={statusRowStyle}>
                <span>{copy.refreshTier}</span>
                <CanvasPill theme={theme} tone="accent">
                  T4 · medium_slow · 30s
                </CanvasPill>
              </div>
              <div style={statusRowStyle}>
                <span>{copy.healthState}</span>
                <CanvasPill
                  theme={theme}
                  tone={toneForEmptyReason(
                    refresh.dataFreshness === "degraded"
                      ? "fetch_failed"
                      : refresh.dataFreshness === "stale"
                        ? "filtered_empty"
                        : "no_data",
                  )}
                >
                  {formatHealthStatus(locale, refresh)}
                </CanvasPill>
              </div>
              <div style={statusRowStyle}>
                <span>{copy.routeCoverage}</span>
                <span style={actorPrimaryStyle}>{copy.routeCoverageValue}</span>
              </div>
              <div style={statusRowStyle}>
                <span>{copy.crossApp}</span>
                <span style={actorPrimaryStyle}>{copy.crossAppValue}</span>
              </div>
              <div style={statusRowStyle}>
                <span>{copy.lastGenerated}</span>
                <span style={actorMetaStyle}>
                  {formatDateTime(refresh.generatedAt)}
                </span>
              </div>
            </div>
          </CanvasCard>
        </div>

        <CanvasCard
          theme={theme}
          title={copy.routesTitle}
          subtitle={copy.routesSubtitle}
        >
          <div style={moduleToolbarStyle}>
            <input
              value={moduleQuery}
              onChange={(event) => setModuleQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              style={inputStyle}
            />
            <CanvasPill
              theme={theme}
              tone={
                filteredModules.length === moduleCards.length
                  ? "neutral"
                  : "accent"
              }
            >
              {filteredModules.length}/{moduleCards.length}
            </CanvasPill>
          </div>

          {groupedModules.length === 0 ? (
            renderEmptyState(
              locale,
              {
                reason: "filtered_empty",
                message: copy.filteredEmpty,
              },
              (action) => openAction(router, action),
            )
          ) : (
            <div style={moduleSectionStyle}>
              {groupedModules.map(([section, cards]) => (
                <div key={section} style={moduleSectionStyle}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <CanvasPill theme={theme} tone="neutral">
                      {section}
                    </CanvasPill>
                  </div>
                  <div style={moduleCardGridStyle}>
                    {cards.map((card) => (
                      <CanvasCard
                        key={card.key}
                        theme={theme}
                        title={
                          <Link
                            href={card.href}
                            style={{
                              color: theme.text,
                              textDecoration: "none",
                            }}
                          >
                            {card.label}
                          </Link>
                        }
                        subtitle={card.note}
                      >
                        <div style={moduleSectionStyle}>
                          <div style={moduleHeaderStyle}>
                            <div style={moduleIconStyle}>
                              <CanvasIcon name={card.icon} />
                            </div>
                            <div style={moduleMetaStyle}>
                              {card.metric ? (
                                <span style={moduleMetricStyle}>
                                  {card.metric}
                                </span>
                              ) : null}
                              {card.detail ? (
                                <span style={moduleDetailStyle}>
                                  {card.detail}
                                </span>
                              ) : null}
                              <span style={actorMetaStyle}>{card.href}</span>
                            </div>
                          </div>

                          {renderEmptyState(locale, card.emptyState, (action) =>
                            openAction(router, action),
                          )}

                          <div style={actionRowStyle}>
                            {card.availableActions.map((action) => (
                              <CanvasBtn
                                key={action.action}
                                theme={theme}
                                variant={
                                  action.action ===
                                  card.availableActions[0]?.action
                                    ? "primary"
                                    : "secondary"
                                }
                                disabled={!action.enabled}
                                onClick={() => openAction(router, action)}
                              >
                                {action.label}
                              </CanvasBtn>
                            ))}
                          </div>
                        </div>
                      </CanvasCard>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title={copy.auditTitle}
          subtitle={copy.auditSubtitle}
          actions={
            <CanvasBtn
              theme={theme}
              variant="ghost"
              onClick={() => router.push("/audit")}
            >
              {copy.auditAction}
            </CanvasBtn>
          }
        >
          {recentAudit.length === 0 ? (
            renderEmptyState(
              locale,
              {
                reason: sources.audit.error
                  ? isPermissionError(sources.audit.error)
                    ? "permission_denied"
                    : "fetch_failed"
                  : "no_data",
                message:
                  sources.audit.error ??
                  (locale === "en"
                    ? "No audit records were returned for the last 24 hours."
                    : "最近 24 小時沒有回傳稽核紀錄。"),
              },
              (action) => openAction(router, action),
            )
          ) : (
            <CanvasTable
              theme={theme}
              columns={auditColumns}
              rows={recentAudit}
            />
          )}
        </CanvasCard>
      </div>
    </CanvasShell>
  );
}
