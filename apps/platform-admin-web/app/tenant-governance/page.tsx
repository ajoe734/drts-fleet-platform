"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  tenantStageTone,
  tenantStatusTone,
} from "@/components/tenant-governance-shared";
import type {
  CrossAppResourceLink,
  EmptyReason,
  PlatformTenantGovernanceAlertFlag,
  PlatformTenantGovernanceSummaryResponse,
  PlatformTenantGovernanceSummaryRow,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";
import type { CanvasTableColumn, CanvasTone } from "@drts/ui-web";

const PAGE_SIZE = 12;
const REFRESH_TIER = "medium_slow" satisfies RefreshTier;
const T4_REFRESH_MS = 30_000;
const QUOTA_WARNING_THRESHOLD = 80;
const QUOTA_DANGER_THRESHOLD = 95;
const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

type RiskFilter =
  | "all"
  | "attention"
  | "healthy"
  | PlatformTenantGovernanceAlertFlag;
type EmptyPreviewReason = Exclude<EmptyReason, "driver_not_eligible">;
type TableRow = PlatformTenantGovernanceSummaryRow &
  Record<string, unknown> & {
    _selected?: boolean;
  };
type GovernanceAction = {
  key: string;
  label: string;
  descriptor: ResourceActionDescriptor;
  link: CrossAppResourceLink;
  hint: string;
};
type TenantGovernanceRow = PlatformTenantGovernanceSummaryRow & {
  availableActions?: ResourceActionDescriptor[];
  drillTargets?: CrossAppResourceLink[];
};
type TenantGovernanceSummaryData = PlatformTenantGovernanceSummaryResponse & {
  items: TenantGovernanceRow[];
  emptyState?: {
    reason: EmptyPreviewReason;
    messageCode: string;
    nextAction?: ResourceActionDescriptor;
  };
  refresh?: UiRefreshMetadata;
};

const pageRootStyle = {
  display: "grid",
  gap: 18,
} satisfies React.CSSProperties;

const pageBodyStyle = {
  display: "grid",
  gap: 16,
} satisfies React.CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
} satisfies React.CSSProperties;

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
  gap: 16,
} satisfies React.CSSProperties;

const filterRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies React.CSSProperties;

const pillButtonStyle = {
  appearance: "none",
  border: 0,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
} satisfies React.CSSProperties;

const sectionStackStyle = {
  display: "grid",
  gap: 12,
} satisfies React.CSSProperties;

const listStackStyle = {
  display: "grid",
  gap: 10,
} satisfies React.CSSProperties;

const rowSummaryStyle = {
  display: "grid",
  gap: 4,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
} satisfies React.CSSProperties;

const heatBarTrackStyle = {
  flex: 1,
  height: 8,
  background: theme.surfaceLo,
  borderRadius: 999,
  overflow: "hidden",
  border: `1px solid ${theme.border}`,
} satisfies React.CSSProperties;

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies React.CSSProperties;

const summaryCardStyle = {
  display: "grid",
  gap: 6,
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
} satisfies React.CSSProperties;

const actionGridStyle = {
  display: "grid",
  gap: 10,
} satisfies React.CSSProperties;

const actionCardStyle = {
  display: "grid",
  gap: 8,
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
} satisfies React.CSSProperties;

const actionMetaStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies React.CSSProperties;

const actionButtonStyle = (
  disabled: boolean,
  tone: "primary" | "secondary" = "secondary",
) =>
  ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    padding: "0 12px",
    borderRadius: 9,
    border: `1px solid ${tone === "primary" ? theme.accent : theme.border}`,
    background: tone === "primary" ? theme.accent : "#fff",
    color: tone === "primary" ? "#fff" : theme.text,
    textDecoration: "none",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  }) satisfies React.CSSProperties;

const emptyStateWrapStyle = {
  display: "grid",
  gap: 14,
  padding: "28px 24px",
  borderRadius: 14,
  border: `1px dashed ${theme.border}`,
  background:
    "linear-gradient(135deg, rgba(224, 231, 255, 0.55), rgba(248, 250, 252, 0.95))",
} satisfies React.CSSProperties;

function alertTone(flag: PlatformTenantGovernanceAlertFlag): CanvasTone {
  switch (flag) {
    case "quota_above_95_percent":
      return "warn";
    case "no_approvers_configured":
    case "pending_approval_over_48h":
    default:
      return "danger";
  }
}

function quotaTone(value: number): CanvasTone {
  if (value > QUOTA_DANGER_THRESHOLD) {
    return "danger";
  }
  if (value > QUOTA_WARNING_THRESHOLD) {
    return "warn";
  }
  return "success";
}

function normalizeCanvasTone(
  tone: "neutral" | "success" | "warning" | "danger" | "info",
): CanvasTone {
  return tone === "warning" ? "warn" : tone;
}

function quotaStatusLabel(locale: string, value: number) {
  if (value > QUOTA_DANGER_THRESHOLD) {
    return locale === "en" ? "over threshold" : "超過門檻";
  }
  if (value > QUOTA_WARNING_THRESHOLD) {
    return locale === "en" ? "warning" : "警戒";
  }
  return locale === "en" ? "ok" : "正常";
}

function alertLabel(
  locale: string,
  flag: PlatformTenantGovernanceAlertFlag,
): string {
  if (locale === "en") {
    switch (flag) {
      case "no_approvers_configured":
        return "No approvers configured";
      case "quota_above_95_percent":
        return "Quota above 95%";
      case "pending_approval_over_48h":
      default:
        return "Pending approval over 48h";
    }
  }

  switch (flag) {
    case "no_approvers_configured":
      return "尚未配置 approver";
    case "quota_above_95_percent":
      return "Quota 超過 95%";
    case "pending_approval_over_48h":
    default:
      return "待審超過 48 小時";
  }
}

function disabledReasonLabel(locale: string, code?: string) {
  switch (code) {
    case "no_pending_approvals":
      return locale === "en" ? "No pending approvals" : "目前沒有待審案件";
    case "no_recent_governance_alerts":
      return locale === "en" ? "No recent governance alerts" : "目前沒有治理警示";
    case "tenant_not_active":
      return locale === "en" ? "Tenant is not active yet" : "租戶尚未進入 active";
    default:
      return locale === "en" ? "Unavailable" : "目前不可用";
  }
}

function formatPercent(value: number) {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatAge(locale: string, value: number | null) {
  if (value === null) {
    return locale === "en" ? "No pending approvals" : "目前沒有待審";
  }
  return locale === "en" ? `${value} h` : `${value} 小時`;
}

function formatRelativeRefresh(locale: string, value: Date | null) {
  if (!value) {
    return locale === "en" ? "Waiting for first snapshot" : "等待首次快照";
  }

  const diffMs = Math.max(0, Date.now() - value.getTime());
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 5) {
    return locale === "en" ? "just now" : "剛剛";
  }
  if (diffSeconds < 60) {
    return locale === "en"
      ? `${diffSeconds}s ago`
      : `${diffSeconds} 秒前`;
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  return locale === "en"
    ? `${diffMinutes}m ago`
    : `${diffMinutes} 分鐘前`;
}

function classifyErrorReason(message: string | null): EmptyPreviewReason {
  if (!message) {
    return "fetch_failed";
  }
  if (
    message.includes("403") ||
    message.toLowerCase().includes("permission_denied")
  ) {
    return "permission_denied";
  }
  if (
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.toLowerCase().includes("external_unavailable")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function matchesFilter(
  row: TenantGovernanceRow,
  filter: RiskFilter,
) {
  if (filter === "all") {
    return true;
  }
  if (filter === "attention") {
    return row.alertFlags.length > 0;
  }
  if (filter === "healthy") {
    return row.alertFlags.length === 0;
  }
  return row.alertFlags.includes(filter);
}

function humanizeActionLabel(locale: string, action: string) {
  const normalized = action
    .split("_")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");

  if (locale === "en") {
    return normalized;
  }

  return normalized || "未命名動作";
}

function buildFallbackTenantActions(
  locale: string,
  row: TenantGovernanceRow,
): GovernanceAction[] {
  const reviewPaymentsEnabled = row.pendingApprovalCount > 0;
  const auditEnabled = row.alertFlags.length > 0;
  const opsEnabled = row.tenantStatus === "active";

  return [
    {
      key: "tenant-detail",
      label: locale === "en" ? "Tenant detail" : "租戶詳情",
      descriptor: {
        action: "view_tenant_detail",
        enabled: true,
        riskLevel: "low",
      },
      link: {
        targetApp: "platform-admin",
        route: `/tenants/${encodeURIComponent(row.tenantId)}`,
        resourceType: "platform_tenant",
        resourceId: row.tenantId,
        openMode: "same_tab",
        label: locale === "en" ? "Tenant detail" : "租戶詳情",
      },
      hint:
        locale === "en"
          ? "Inspect rollout, modules, and package state."
          : "檢查 rollout、模組與 onboarding package。",
    },
    {
      key: "tenant-cost-centers",
      label: locale === "en" ? "Tenant cost centers" : "Tenant cost centers",
      descriptor: {
        action: "open_cost_center_health",
        enabled: true,
        riskLevel: "low",
      },
      link: {
        targetApp: "tenant-console",
        route: `/cost-centers?tenantId=${encodeURIComponent(row.tenantId)}`,
        resourceType: "tenant_cost_center",
        resourceId: row.tenantId,
        openMode: "new_tab",
        label: locale === "en" ? "Tenant cost centers" : "Tenant cost centers",
      },
      hint:
        locale === "en"
          ? "Open the source module that owns cost-center coverage."
          : "開啟成本中心 coverage 的來源模組。",
    },
    {
      key: "tenant-rules",
      label: locale === "en" ? "Approval rules" : "審批規則",
      descriptor: {
        action: "open_approval_rules",
        enabled: true,
        riskLevel: "low",
      },
      link: {
        targetApp: "tenant-console",
        route: `/rules?tenantId=${encodeURIComponent(row.tenantId)}`,
        resourceType: "tenant_approval_rule",
        resourceId: row.tenantId,
        openMode: "new_tab",
        label: locale === "en" ? "Approval rules" : "審批規則",
      },
      hint:
        locale === "en"
          ? "Review the rule surface behind approval backlog and approver gaps."
          : "檢查 approval backlog 與 approver 缺口背後的規則面。",
    },
    {
      key: "payments",
      label: locale === "en" ? "Payments triage" : "付款治理",
      descriptor: {
        action: "open_payments_triage",
        enabled: reviewPaymentsEnabled,
        ...(reviewPaymentsEnabled
          ? {}
          : { disabledReasonCode: "no_pending_approvals" }),
        riskLevel: "low",
      },
      link: {
        targetApp: "platform-admin",
        route: `/payments?tenantId=${encodeURIComponent(row.tenantId)}`,
        resourceType: "approval_backlog",
        resourceId: row.tenantId,
        openMode: "same_tab",
        label: locale === "en" ? "Payments triage" : "付款治理",
      },
      hint:
        locale === "en"
          ? "Jump into backlog and reconciliation follow-up."
          : "進入 backlog 與 reconciliation 後續處理。",
    },
    {
      key: "audit",
      label: locale === "en" ? "Audit trail" : "稽核軌跡",
      descriptor: {
        action: "open_audit",
        enabled: auditEnabled,
        ...(auditEnabled
          ? {}
          : { disabledReasonCode: "no_recent_governance_alerts" }),
        riskLevel: "low",
      },
      link: {
        targetApp: "platform-admin",
        route: `/audit?resourceType=platform_tenant&resourceId=${encodeURIComponent(row.tenantId)}`,
        resourceType: "platform_tenant",
        resourceId: row.tenantId,
        openMode: "same_tab",
        label: locale === "en" ? "Audit trail" : "稽核軌跡",
      },
      hint:
        locale === "en"
          ? "Filter the evidence stream to this tenant."
          : "把 evidence stream 篩到這個 tenant。",
    },
    {
      key: "ops-console",
      label: locale === "en" ? "Ops operational view" : "Ops operational view",
      descriptor: {
        action: "open_ops_operational_view",
        enabled: opsEnabled,
        ...(opsEnabled ? {} : { disabledReasonCode: "tenant_not_active" }),
        riskLevel: "low",
      },
      link: {
        targetApp: "ops-console",
        route: `/dispatch?view=owned&tenantId=${encodeURIComponent(row.tenantId)}`,
        resourceType: "tenant_operational_view",
        resourceId: row.tenantId,
        openMode: "new_tab",
        label:
          locale === "en" ? "Ops operational view" : "Ops operational view",
      },
      hint:
        locale === "en"
          ? "Cross-check whether the issue is isolated or systemic in ops."
          : "到 ops 交叉確認問題是 isolated 還是 systemic。",
    },
  ];
}

function resolveTenantActions(
  locale: string,
  row: TenantGovernanceRow,
): GovernanceAction[] {
  const fallbackActions = buildFallbackTenantActions(locale, row);
  if (!row.availableActions?.length) {
    return fallbackActions;
  }

  const fallbackByAction = new Map(
    fallbackActions.map((action) => [action.descriptor.action, action]),
  );

  return row.availableActions.map((descriptor) => {
    const matched = fallbackByAction.get(descriptor.action);
    if (matched) {
      return {
        ...matched,
        descriptor,
      };
    }

    return {
      key: `${row.tenantId}-${descriptor.action}`,
      label: humanizeActionLabel(locale, descriptor.action),
      descriptor,
      link: {
        targetApp: "platform-admin",
        route: `/tenants/${encodeURIComponent(row.tenantId)}`,
        resourceType: "platform_tenant",
        resourceId: row.tenantId,
        openMode: "same_tab",
        label: locale === "en" ? "Tenant detail" : "租戶詳情",
      },
      hint:
        locale === "en"
          ? "This action is available for the tenant, but the dashboard only has a generic fallback route."
          : "這個 tenant 可執行此動作，但 dashboard 目前只有通用 fallback route。",
    };
  });
}

function resolveDrillTargets(
  locale: string,
  row: TenantGovernanceRow,
): CrossAppResourceLink[] {
  if (row.drillTargets?.length) {
    return row.drillTargets;
  }

  const deduped = new Map<string, CrossAppResourceLink>();
  for (const action of buildFallbackTenantActions(locale, row)) {
    deduped.set(`${action.link.targetApp}:${action.link.route}`, action.link);
  }
  return [...deduped.values()];
}

function renderActionControl(
  action: GovernanceAction,
  locale: string,
  tone: "primary" | "secondary" = "secondary",
) {
  const disabledTitle = action.descriptor.enabled
    ? undefined
    : disabledReasonLabel(locale, action.descriptor.disabledReasonCode);

  if (!action.descriptor.enabled) {
    return (
      <button
        key={action.key}
        type="button"
        disabled
        title={disabledTitle}
        style={actionButtonStyle(true, tone)}
      >
        {action.label}
      </button>
    );
  }

  return (
    <a
      key={action.key}
      href={action.link.route}
      target={action.link.openMode === "new_tab" ? "_blank" : undefined}
      rel={action.link.openMode === "new_tab" ? "noreferrer" : undefined}
      style={actionButtonStyle(false, tone)}
    >
      {action.label}
    </a>
  );
}

function EmptyStateCard({
  locale,
  reason,
  onRefresh,
}: {
  locale: string;
  reason: EmptyPreviewReason;
  onRefresh: () => void;
}) {
  const copy =
    locale === "en"
      ? {
          no_data: {
            eyebrow: "No data",
            title: "No tenant governance snapshots yet",
            body: "This route is live, but no cross-tenant governance rows have been emitted for the current page.",
            cta: "Refresh",
          },
          not_provisioned: {
            eyebrow: "Provisioning",
            title: "Tenant governance has not been provisioned yet",
            body: "Cost-center, quota, and approval surfaces are not seeded yet, so this dashboard cannot aggregate governance signals.",
            cta: "Open tenants",
          },
          fetch_failed: {
            eyebrow: "Fetch failed",
            title: "Unable to load the governance snapshot",
            body: "The latest request failed before the dashboard received a usable response.",
            cta: "Retry",
          },
          permission_denied: {
            eyebrow: "Permission denied",
            title: "Your current scope cannot read this dashboard",
            body: "This surface requires platform-admin governance read scope for cross-tenant quota and approval signals.",
            cta: "Retry",
          },
          external_unavailable: {
            eyebrow: "Dependency unavailable",
            title: "A dependent governance source is unavailable",
            body: "The page cannot build a trustworthy snapshot because one of the backing modules is degraded or unreachable.",
            cta: "Retry",
          },
          filtered_empty: {
            eyebrow: "Filtered empty",
            title: "No tenants match the current risk filter",
            body: "The dashboard still has data on this page; the active filter simply removed every row from the result set.",
            cta: "Clear filter",
          },
        }
      : {
          no_data: {
            eyebrow: "沒有資料",
            title: "目前沒有 tenant governance 快照",
            body: "這個 route 已存在，但目前頁面尚未收到任何跨租戶治理資料列。",
            cta: "重新整理",
          },
          not_provisioned: {
            eyebrow: "尚未佈建",
            title: "Tenant governance 尚未完成佈建",
            body: "cost-center、quota 與 approval 面尚未 seed，這個 dashboard 因此無法聚合治理訊號。",
            cta: "前往租戶",
          },
          fetch_failed: {
            eyebrow: "抓取失敗",
            title: "無法載入治理快照",
            body: "最新請求在產出可用回應前失敗，因此畫面無法建立可用快照。",
            cta: "重試",
          },
          permission_denied: {
            eyebrow: "權限不足",
            title: "目前權限無法讀取這個 dashboard",
            body: "這個工作面需要 platform-admin governance read scope 才能查看跨租戶 quota 與 approval 訊號。",
            cta: "重試",
          },
          external_unavailable: {
            eyebrow: "依賴不可用",
            title: "治理來源模組目前不可用",
            body: "因為其中一個 backing module degraded 或 unreachable，頁面目前無法組出可信快照。",
            cta: "重試",
          },
          filtered_empty: {
            eyebrow: "篩選為空",
            title: "目前沒有租戶符合這個風險篩選",
            body: "這一頁仍有資料，只是目前啟用的 filter 把所有 row 都排除了。",
            cta: "清除篩選",
          },
        };

  const state = copy[reason];

  return (
    <div style={emptyStateWrapStyle}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <CanvasPill
          theme={theme}
          tone={
            reason === "permission_denied" || reason === "external_unavailable"
              ? "danger"
              : reason === "fetch_failed"
                ? "warn"
                : "accent"
          }
        >
          {state.eyebrow}
        </CanvasPill>
        <CanvasPill theme={theme} tone="neutral">
          {reason}
        </CanvasPill>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <strong style={{ fontSize: 18, color: theme.text }}>{state.title}</strong>
        <span style={{ color: theme.textMuted, lineHeight: 1.6 }}>
          {state.body}
        </span>
      </div>
      <div>
        <CanvasBtn theme={theme} onClick={onRefresh}>
          {state.cta}
        </CanvasBtn>
      </div>
    </div>
  );
}

export default function TenantGovernancePage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const [summary, setSummary] =
    useState<TenantGovernanceSummaryData | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<RiskFilter>("all");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const copy =
    locale === "en"
      ? {
          title: "Tenant Governance",
          subtitle:
            "quota usage · approval backlog · cost-center health · governance risk — Q-ADM01",
          refresh: "Refresh",
          refreshTier: "T4 · medium-slow · 30s",
          freshnessReady: "Fresh",
          freshnessStale: "Stale",
          freshnessDegraded: "Degraded",
          freshnessUnknown: "Unknown",
          tableTitle: "Cross-tenant governance queue",
          tableSubtitle:
            "Sort by risk, triage with data-driven drill targets, and branch into source modules only when a tenant actually needs attention.",
          quotaCard: "Quota usage heat map · top tenants · month to date",
          backlogCard: "Approval backlog + governance risk",
          actionCard: "Selected tenant action rail",
          actionSubtitle:
            "CTAs stay descriptor-driven so the page can show enabled and disabled affordances without hard-coding role logic.",
          riskSummaryTitle: "Governance summary",
          riskFilters: {
            all: "All",
            attention: "Needs attention",
            healthy: "Healthy",
            no_approvers_configured: "Approver gaps",
            quota_above_95_percent: "Quota > 95%",
            pending_approval_over_48h: "Approval age > 48h",
          },
          columns: {
            tenant: "Tenant",
            posture: "Posture",
            costCenters: "Cost centers",
            activeRules: "Active rules",
            quotaUsed: "Quota used",
            approvals: "Pending approvals",
            alerts: "Alerts",
            actions: "Available actions",
          },
          kpis: {
            quota: "Quota warning (>80%)",
            backlog: "Cross-tenant approval backlog",
            costCenters: "Cost-center anomalies",
            risks: "Governance risk signals",
          },
          selected: "Selected",
          pageSummary: (current: number, total: number, items: number) =>
            `Page ${current} of ${Math.max(total, 1)} · ${items} row(s) visible`,
          summaryLabel: (count: number) =>
            `${count} tenant(s) on the current page snapshot`,
          quotaSub: (count: number) => `${count} tenant(s) above threshold`,
          backlogSub: "Payments and approval follow-up surface",
          costCenterSub: "Missing coverage or approver posture",
          riskSub: (hold: number, gaps: number, quota: number) =>
            `hold ${hold} · approver gaps ${gaps} · quota ${quota}`,
          healthy: "Healthy",
          oldestPending: "Oldest pending",
          stage: "Stage",
          status: "Status",
          noSelected:
            "Select a tenant to inspect route targets, source modules, and the descriptor-driven action rail.",
          selectedSummary: "Selected tenant summary",
          selectedActions: "Available actions",
          selectedDrill: "Drill targets",
          internal: "in-app",
          external: "new tab",
          previous: "Previous",
          next: "Next",
          staleBannerTitle: "Tenant governance snapshot is stale",
          staleBannerBody:
            "The latest snapshot is older than the T4 cadence. Refresh to confirm quota and approval posture before acting.",
          degradedBannerTitle: "Tenant governance sources are degraded",
          degradedBannerBody:
            "The backend marked one or more governance dependencies degraded. Recheck drill targets before taking a tenant action.",
          dependencyTitle: "Unable to load tenant governance snapshot",
          filteredStateHint: "Filter applied",
          lastRefreshed: "Last refreshed",
          refreshRunning: "Refreshing",
        }
      : {
          title: "跨租戶治理",
          subtitle:
            "quota usage · approval backlog · cost-center health · governance risk — Q-ADM01",
          refresh: "重新整理",
          refreshTier: "T4 · medium-slow · 30 秒",
          freshnessReady: "Fresh",
          freshnessStale: "Stale",
          freshnessDegraded: "Degraded",
          freshnessUnknown: "Unknown",
          tableTitle: "跨租戶治理佇列",
          tableSubtitle:
            "先按風險排序，再用 descriptor-driven drill target 做 triage，只有 tenant 真正需要關注時才切到來源模組。",
          quotaCard: "Quota 使用熱圖 · 高風險租戶 · 本月",
          backlogCard: "Approval backlog 與治理風險",
          actionCard: "選定租戶動作軌",
          actionSubtitle:
            "CTA 由 descriptor 驅動，讓畫面能同時呈現 enabled 與 disabled affordance，而不是硬編 role 判斷。",
          riskSummaryTitle: "治理摘要",
          riskFilters: {
            all: "全部",
            attention: "需要關注",
            healthy: "健康",
            no_approvers_configured: "Approver 缺口",
            quota_above_95_percent: "Quota > 95%",
            pending_approval_over_48h: "待審 > 48h",
          },
          columns: {
            tenant: "租戶",
            posture: "姿態",
            costCenters: "Cost centers",
            activeRules: "Active rules",
            quotaUsed: "Quota 使用率",
            approvals: "待審批數",
            alerts: "警示",
            actions: "可用動作",
          },
          kpis: {
            quota: "Quota 警戒 (>80%)",
            backlog: "跨租戶審批 backlog",
            costCenters: "Cost-center 異常",
            risks: "治理風險訊號",
          },
          selected: "已選取",
          pageSummary: (current: number, total: number, items: number) =>
            `第 ${current} / ${Math.max(total, 1)} 頁 · 顯示 ${items} 筆`,
          summaryLabel: (count: number) => `目前頁面快照共有 ${count} 個 tenant`,
          quotaSub: (count: number) => `${count} 個 tenant 超過警戒線`,
          backlogSub: "導向 payments 與 approval follow-up 面",
          costCenterSub: "coverage 缺口或 approver posture 問題",
          riskSub: (hold: number, gaps: number, quota: number) =>
            `hold ${hold} · approver gap ${gaps} · quota ${quota}`,
          healthy: "健康",
          oldestPending: "最舊待審",
          stage: "階段",
          status: "狀態",
          noSelected:
            "選一個 tenant 之後，這裡會顯示 route target、來源模組與 descriptor-driven action rail。",
          selectedSummary: "選定租戶摘要",
          selectedActions: "可用動作",
          selectedDrill: "Drill targets",
          internal: "站內",
          external: "新分頁",
          previous: "上一頁",
          next: "下一頁",
          staleBannerTitle: "Tenant governance 快照已過期",
          staleBannerBody:
            "這份快照已超過 T4 cadence，執行治理動作前請先重新整理確認 quota 與 approval 姿態。",
          degradedBannerTitle: "Tenant governance 來源目前降級",
          degradedBannerBody:
            "後端已標記至少一個治理來源 degraded，執行 tenant 動作前請再交叉確認 drill target。",
          dependencyTitle: "無法載入 tenant governance 快照",
          filteredStateHint: "已套用篩選",
          lastRefreshed: "上次更新",
          refreshRunning: "重新整理中",
        };

  const loadSummary = useCallback(
    async (background = false) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await client.getPlatformTenantGovernanceSummary({
          page,
          pageSize: PAGE_SIZE,
        });
        setSummary(result);
        setLastLoadedAt(new Date());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client, page],
  );

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadSummary(true);
    }, T4_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [loadSummary]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const baseItems = summary?.items ?? [];
  const refreshMeta = summary?.refresh;
  const emptyStateEnvelope = summary?.emptyState;
  const pageInfo = summary?.pageInfo ?? {
    page,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  };

  const filterOptions = useMemo(
    () => [
      { value: "all" as const, label: copy.riskFilters.all },
      { value: "attention" as const, label: copy.riskFilters.attention },
      { value: "healthy" as const, label: copy.riskFilters.healthy },
      {
        value: "no_approvers_configured" as const,
        label: copy.riskFilters.no_approvers_configured,
      },
      {
        value: "quota_above_95_percent" as const,
        label: copy.riskFilters.quota_above_95_percent,
      },
      {
        value: "pending_approval_over_48h" as const,
        label: copy.riskFilters.pending_approval_over_48h,
      },
    ],
    [copy],
  );

  const visibleItems = useMemo(
    () => baseItems.filter((row) => matchesFilter(row, filter)),
    [baseItems, filter],
  );

  useEffect(() => {
    if (!visibleItems.length) {
      setSelectedTenantId(null);
      return;
    }
    if (!selectedTenantId) {
      setSelectedTenantId(visibleItems[0]!.tenantId);
      return;
    }
    if (!visibleItems.some((item) => item.tenantId === selectedTenantId)) {
      setSelectedTenantId(visibleItems[0]!.tenantId);
    }
  }, [selectedTenantId, visibleItems]);

  const selectedTenant =
    visibleItems.find((item) => item.tenantId === selectedTenantId) ?? null;

  const selectedActions = useMemo(
    () =>
      selectedTenant
        ? resolveTenantActions(locale, selectedTenant)
        : ([] as GovernanceAction[]),
    [locale, selectedTenant],
  );
  const selectedDrillTargets = useMemo(
    () =>
      selectedTenant
        ? resolveDrillTargets(locale, selectedTenant)
        : ([] as CrossAppResourceLink[]),
    [locale, selectedTenant],
  );

  const metrics = useMemo(() => {
    const quotaWarningCount = visibleItems.filter(
      (item) => item.monthlyQuotaPercentUsed > QUOTA_WARNING_THRESHOLD,
    ).length;
    const approvalBacklog = visibleItems.reduce(
      (sum, item) => sum + item.pendingApprovalCount,
      0,
    );
    const costCenterAnomalies = visibleItems.filter(
      (item) =>
        item.costCenterCount === 0 ||
        item.activeRuleCount === 0 ||
        item.alertFlags.includes("no_approvers_configured"),
    ).length;
    const rollbackHoldCount = visibleItems.filter(
      (item) => item.tenantStatus === "rollback_hold",
    ).length;
    const approverGapCount = visibleItems.filter((item) =>
      item.alertFlags.includes("no_approvers_configured"),
    ).length;
    const quotaDangerCount = visibleItems.filter((item) =>
      item.alertFlags.includes("quota_above_95_percent"),
    ).length;
    const riskSignals = visibleItems.reduce((sum, item) => {
      return (
        sum +
        item.alertFlags.length +
        (item.tenantStatus === "rollback_hold" ? 1 : 0)
      );
    }, 0);

    return {
      quotaWarningCount,
      approvalBacklog,
      costCenterAnomalies,
      rollbackHoldCount,
      approverGapCount,
      quotaDangerCount,
      riskSignals,
    };
  }, [visibleItems]);

  const heatMapRows = useMemo(
    () =>
      [...visibleItems]
        .sort(
          (left, right) =>
            right.monthlyQuotaPercentUsed - left.monthlyQuotaPercentUsed,
        )
        .slice(0, 8),
    [visibleItems],
  );

  const triageRows = useMemo(
    () =>
      [...visibleItems]
        .filter(
          (item) =>
            item.pendingApprovalCount > 0 || item.alertFlags.length > 0,
        )
        .sort((left, right) => {
          if (right.pendingApprovalCount !== left.pendingApprovalCount) {
            return right.pendingApprovalCount - left.pendingApprovalCount;
          }
          if (right.alertFlags.length !== left.alertFlags.length) {
            return right.alertFlags.length - left.alertFlags.length;
          }
          return (
            right.monthlyQuotaPercentUsed - left.monthlyQuotaPercentUsed
          );
        })
        .slice(0, 6),
    [visibleItems],
  );

  const tableRows = useMemo<TableRow[]>(
    () =>
      visibleItems.map((item) => ({
        ...item,
        _selected: item.tenantId === selectedTenantId,
      })),
    [selectedTenantId, visibleItems],
  );

  const columns = useMemo<CanvasTableColumn<TableRow>[]>(
    () => [
      {
        h: copy.columns.tenant,
        w: 240,
        r: (row) => (
          <div style={{ display: "grid", gap: 4 }}>
            <strong>{row.tenantName}</strong>
            <span
              style={{
                color: theme.textMuted,
                fontSize: 11.5,
                fontFamily: theme.monoFamily,
              }}
            >
              {row.tenantCode} · {row.tenantId}
            </span>
          </div>
        ),
      },
      {
        h: copy.columns.posture,
        w: 190,
        r: (row) => (
          <div style={{ display: "grid", gap: 6 }}>
            <CanvasPill
              theme={theme}
              tone={normalizeCanvasTone(tenantStageTone(row.tenantRolloutStage))}
              dot
            >
              {copy.stage}:{" "}
              {formatPlatformCodeLabel(locale, row.tenantRolloutStage)}
            </CanvasPill>
            <CanvasPill
              theme={theme}
              tone={normalizeCanvasTone(tenantStatusTone(row.tenantStatus))}
              dot
            >
              {copy.status}: {formatPlatformCodeLabel(locale, row.tenantStatus)}
            </CanvasPill>
          </div>
        ),
      },
      {
        h: copy.columns.costCenters,
        w: 120,
        align: "right",
        r: (row) => row.costCenterCount.toLocaleString(locale),
      },
      {
        h: copy.columns.activeRules,
        w: 120,
        align: "right",
        r: (row) => row.activeRuleCount.toLocaleString(locale),
      },
      {
        h: copy.columns.quotaUsed,
        w: 190,
        r: (row) => (
          <div style={{ display: "grid", gap: 6 }}>
            <div
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <div style={heatBarTrackStyle}>
                <div
                  style={{
                    width: `${Math.min(row.monthlyQuotaPercentUsed, 100)}%`,
                    height: "100%",
                    background:
                      row.monthlyQuotaPercentUsed > QUOTA_DANGER_THRESHOLD
                        ? theme.danger
                        : row.monthlyQuotaPercentUsed > QUOTA_WARNING_THRESHOLD
                          ? theme.warn
                          : theme.success,
                  }}
                />
              </div>
              <span style={{ minWidth: 40, fontFamily: theme.monoFamily }}>
                {formatPercent(row.monthlyQuotaPercentUsed)}
              </span>
            </div>
            <CanvasPill
              theme={theme}
              tone={quotaTone(row.monthlyQuotaPercentUsed)}
            >
              {quotaStatusLabel(locale, row.monthlyQuotaPercentUsed)}
            </CanvasPill>
          </div>
        ),
      },
      {
        h: copy.columns.approvals,
        w: 170,
        r: (row) => (
          <div style={{ display: "grid", gap: 4 }}>
            <strong>{row.pendingApprovalCount.toLocaleString(locale)}</strong>
            <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {copy.oldestPending}:{" "}
              {formatAge(locale, row.oldestPendingApprovalAgeHours)}
            </span>
          </div>
        ),
      },
      {
        h: copy.columns.alerts,
        w: 220,
        r: (row) => (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {row.alertFlags.length > 0 ? (
              row.alertFlags.map((flag) => (
                <CanvasPill key={`${row.tenantId}-${flag}`} theme={theme} tone={alertTone(flag)} dot>
                  {alertLabel(locale, flag)}
                </CanvasPill>
              ))
            ) : (
              <CanvasPill theme={theme} tone="success">
                {copy.healthy}
              </CanvasPill>
            )}
          </div>
        ),
      },
      {
        h: copy.columns.actions,
        w: 210,
        r: (row) => {
          const actions = resolveTenantActions(locale, row);
          const primaryActions = actions.slice(0, 2);
          return (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                style={actionButtonStyle(false)}
                onClick={() => setSelectedTenantId(row.tenantId)}
              >
                {copy.selected}
              </button>
              {primaryActions.map((action, index) =>
                renderActionControl(
                  action,
                  locale,
                  index === 0 ? "primary" : "secondary",
                ),
              )}
            </div>
          );
        },
      },
    ],
    [copy, locale],
  );

  const previewReasonRaw = searchParams.get("emptyReason");
  const previewReason: EmptyPreviewReason | null =
    previewReasonRaw === "no_data" ||
    previewReasonRaw === "not_provisioned" ||
    previewReasonRaw === "fetch_failed" ||
    previewReasonRaw === "permission_denied" ||
    previewReasonRaw === "external_unavailable" ||
    previewReasonRaw === "filtered_empty"
      ? previewReasonRaw
      : null;

  const generatedAt = refreshMeta?.generatedAt
    ? new Date(refreshMeta.generatedAt)
    : lastLoadedAt;
  const freshness = useMemo(() => {
    if (refreshMeta?.dataFreshness) {
      return refreshMeta.dataFreshness;
    }
    if (!generatedAt) {
      return "unknown";
    }
    if (now - generatedAt.getTime() > T4_REFRESH_MS) {
      return "stale";
    }
    return "fresh";
  }, [generatedAt, now, refreshMeta?.dataFreshness]);

  const emptyReason: EmptyPreviewReason | null = useMemo(() => {
    if (previewReason) {
      return previewReason;
    }
    if (emptyStateEnvelope?.reason) {
      return emptyStateEnvelope.reason;
    }
    if (error) {
      return classifyErrorReason(error);
    }
    if (baseItems.length === 0) {
      return "no_data";
    }
    if (visibleItems.length === 0) {
      return "filtered_empty";
    }
    return null;
  }, [
    baseItems.length,
    emptyStateEnvelope?.reason,
    error,
    previewReason,
    visibleItems.length,
  ]);

  const freshnessTone: CanvasTone =
    freshness === "degraded"
      ? "danger"
      : freshness === "stale"
        ? "warn"
        : freshness === "fresh"
          ? "success"
          : "neutral";
  const freshnessLabel =
    freshness === "degraded"
      ? copy.freshnessDegraded
      : freshness === "stale"
        ? copy.freshnessStale
        : freshness === "fresh"
          ? copy.freshnessReady
          : copy.freshnessUnknown;

  if (loading && !summary) {
    return (
      <div style={{ ...pageRootStyle, paddingTop: 16 }}>
        <CanvasPageHeader
          theme={theme}
          title={copy.title}
          subtitle={copy.subtitle}
        />
        <CanvasCard theme={theme}>
          <div style={{ color: theme.textMuted }}>{copy.refreshRunning}...</div>
        </CanvasCard>
      </div>
    );
  }

  return (
    <div style={pageRootStyle}>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <CanvasPill theme={theme} tone="accent">
              {copy.refreshTier}
            </CanvasPill>
            <CanvasPill theme={theme} tone={freshnessTone} dot>
              {freshnessLabel}
            </CanvasPill>
            <CanvasBtn theme={theme} onClick={() => void loadSummary(true)}>
              {refreshing ? copy.refreshRunning : copy.refresh}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {freshness === "stale" && !error ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            title={copy.staleBannerTitle}
            body={copy.staleBannerBody}
          />
        ) : null}
        {freshness === "degraded" && !error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.degradedBannerTitle}
            body={copy.degradedBannerBody}
          />
        ) : null}

        {error ? (
          <CanvasBanner
            theme={theme}
            tone={
              classifyErrorReason(error) === "permission_denied"
                ? "danger"
                : "warn"
            }
            title={copy.dependencyTitle}
            body={error}
            actions={
              <CanvasBtn theme={theme} onClick={() => void loadSummary()}>
                {copy.refresh}
              </CanvasBtn>
            }
          />
        ) : null}

        <div style={filterRowStyle}>
          {filterOptions.map((option) => {
            const count = baseItems.filter((item) =>
              matchesFilter(item, option.value),
            ).length;

            return (
              <button
                key={option.value}
                type="button"
                style={pillButtonStyle}
                onClick={() => setFilter(option.value)}
                aria-pressed={filter === option.value}
              >
                <CanvasPill
                  theme={theme}
                  tone={
                    filter === option.value
                      ? "accent"
                      : option.value === "healthy"
                        ? "success"
                        : option.value === "all"
                          ? "neutral"
                          : "warn"
                  }
                  dot={option.value !== "all"}
                >
                  {option.label} {count.toLocaleString(locale)}
                </CanvasPill>
              </button>
            );
          })}

          <span style={{ flex: 1 }} />

          <CanvasPill theme={theme} tone="neutral">
            {copy.lastRefreshed}: {formatRelativeRefresh(locale, generatedAt)}
          </CanvasPill>
          {filter !== "all" ? (
            <CanvasPill theme={theme} tone="accent">
              {copy.filteredStateHint}
            </CanvasPill>
          ) : null}
        </div>

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label={copy.kpis.quota}
            value={metrics.quotaWarningCount.toLocaleString(locale)}
            deltaTone={metrics.quotaWarningCount > 0 ? "down" : "up"}
            sub={copy.quotaSub(metrics.quotaWarningCount)}
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpis.backlog}
            value={metrics.approvalBacklog.toLocaleString(locale)}
            deltaTone={metrics.approvalBacklog > 0 ? "down" : "up"}
            sub={copy.backlogSub}
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpis.costCenters}
            value={metrics.costCenterAnomalies.toLocaleString(locale)}
            deltaTone={metrics.costCenterAnomalies > 0 ? "down" : "up"}
            sub={copy.costCenterSub}
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpis.risks}
            value={metrics.riskSignals.toLocaleString(locale)}
            deltaTone={metrics.riskSignals > 0 ? "down" : "up"}
            sub={copy.riskSub(
              metrics.rollbackHoldCount,
              metrics.approverGapCount,
              metrics.quotaDangerCount,
            )}
          />
        </div>

        <div style={splitGridStyle}>
          <CanvasCard theme={theme} title={copy.quotaCard}>
            <div style={sectionStackStyle}>
              {heatMapRows.length > 0 ? (
                heatMapRows.map((row) => (
                  <div key={`quota-${row.tenantId}`} style={rowSummaryStyle}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "baseline",
                      }}
                    >
                      <strong>{row.tenantName}</strong>
                      <span
                        style={{
                          color: theme.textMuted,
                          fontSize: 11.5,
                          fontFamily: theme.monoFamily,
                        }}
                      >
                        {row.tenantCode}
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", gap: 10, alignItems: "center" }}
                    >
                      <div style={heatBarTrackStyle}>
                        <div
                          style={{
                            width: `${Math.min(row.monthlyQuotaPercentUsed, 100)}%`,
                            height: "100%",
                            background:
                              row.monthlyQuotaPercentUsed > QUOTA_DANGER_THRESHOLD
                                ? theme.danger
                                : row.monthlyQuotaPercentUsed >
                                    QUOTA_WARNING_THRESHOLD
                                  ? theme.warn
                                  : theme.success,
                          }}
                        />
                      </div>
                      <strong style={{ minWidth: 42, textAlign: "right" }}>
                        {formatPercent(row.monthlyQuotaPercentUsed)}
                      </strong>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <CanvasPill
                        theme={theme}
                        tone={quotaTone(row.monthlyQuotaPercentUsed)}
                      >
                        {quotaStatusLabel(locale, row.monthlyQuotaPercentUsed)}
                      </CanvasPill>
                      <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                        {copy.oldestPending}:{" "}
                        {formatAge(locale, row.oldestPendingApprovalAgeHours)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyStateCard
                  locale={locale}
                  reason={emptyReason ?? "no_data"}
                  onRefresh={() => {
                    if (filter !== "all" && baseItems.length > 0) {
                      setFilter("all");
                      return;
                    }
                    void loadSummary();
                  }}
                />
              )}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy.backlogCard}
            subtitle={copy.summaryLabel(visibleItems.length)}
          >
            <div style={listStackStyle}>
              {triageRows.length > 0 ? (
                triageRows.map((row) => (
                  <div key={`triage-${row.tenantId}`} style={rowSummaryStyle}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "baseline",
                      }}
                    >
                      <strong>{row.tenantName}</strong>
                      <span
                        style={{
                          color: theme.textMuted,
                          fontSize: 11.5,
                        }}
                      >
                        {row.pendingApprovalCount.toLocaleString(locale)}{" "}
                        {copy.columns.approvals.toLowerCase()}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {row.alertFlags.length > 0 ? (
                        row.alertFlags.map((flag) => (
                          <CanvasPill
                            key={`triage-pill-${row.tenantId}-${flag}`}
                            theme={theme}
                            tone={alertTone(flag)}
                            dot
                          >
                            {alertLabel(locale, flag)}
                          </CanvasPill>
                        ))
                      ) : (
                        <CanvasPill theme={theme} tone="success">
                          {copy.healthy}
                        </CanvasPill>
                      )}
                    </div>
                    <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                      {copy.oldestPending}:{" "}
                      {formatAge(locale, row.oldestPendingApprovalAgeHours)}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ color: theme.textMuted, lineHeight: 1.6 }}>
                  {copy.healthy}
                </div>
              )}
            </div>
          </CanvasCard>
        </div>

        <div style={splitGridStyle}>
          <CanvasCard
            theme={theme}
            title={copy.tableTitle}
            subtitle={copy.tableSubtitle}
            actions={
              <CanvasPill theme={theme} tone="neutral">
                {copy.pageSummary(
                  pageInfo.page,
                  pageInfo.totalPages,
                  visibleItems.length,
                )}
              </CanvasPill>
            }
          >
            {emptyReason ? (
              <EmptyStateCard
                locale={locale}
                reason={emptyReason}
                onRefresh={() => {
                  if (emptyReason === "filtered_empty") {
                    setFilter("all");
                    return;
                  }
                  void loadSummary();
                }}
              />
            ) : (
              <CanvasTable<TableRow>
                theme={theme}
                columns={columns}
                rows={tableRows}
              />
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                {copy.pageSummary(
                  pageInfo.page,
                  pageInfo.totalPages,
                  visibleItems.length,
                )}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pageInfo.page <= 1 || refreshing}
                >
                  {copy.previous}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={
                    pageInfo.totalPages === 0 ||
                    pageInfo.page >= pageInfo.totalPages ||
                    refreshing
                  }
                >
                  {copy.next}
                </CanvasBtn>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy.actionCard}
            subtitle={copy.actionSubtitle}
          >
            {selectedTenant ? (
              <div style={sectionStackStyle}>
                <div style={summaryGridStyle}>
                  <div style={summaryCardStyle}>
                    <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                      {copy.selectedSummary}
                    </span>
                    <strong style={{ fontSize: 16 }}>{selectedTenant.tenantName}</strong>
                    <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                      {selectedTenant.tenantCode} · {selectedTenant.tenantId}
                    </span>
                  </div>
                  <div style={summaryCardStyle}>
                    <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                      {copy.columns.quotaUsed}
                    </span>
                    <strong style={{ fontSize: 16 }}>
                      {formatPercent(selectedTenant.monthlyQuotaPercentUsed)}
                    </strong>
                    <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                      {copy.columns.approvals}:{" "}
                      {selectedTenant.pendingApprovalCount.toLocaleString(locale)}
                    </span>
                  </div>
                </div>

                <div style={actionGridStyle}>
                  <strong style={{ fontSize: 13.5 }}>{copy.selectedActions}</strong>
                  {selectedActions.map((action, index) => (
                    <div key={`action-${action.key}`} style={actionCardStyle}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <strong>{action.label}</strong>
                        <div style={actionMetaStyle}>
                          <CanvasPill theme={theme} tone="neutral">
                            {action.descriptor.riskLevel}
                          </CanvasPill>
                          <CanvasPill
                            theme={theme}
                            tone={
                              action.link.openMode === "new_tab"
                                ? "accent"
                                : "neutral"
                            }
                          >
                            {action.link.openMode === "new_tab"
                              ? copy.external
                              : copy.internal}
                          </CanvasPill>
                        </div>
                      </div>
                      <span style={{ color: theme.textMuted, lineHeight: 1.5 }}>
                        {action.hint}
                      </span>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {renderActionControl(
                          action,
                          locale,
                          index === 0 ? "primary" : "secondary",
                        )}
                        {!action.descriptor.enabled ? (
                          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                            {disabledReasonLabel(
                              locale,
                              action.descriptor.disabledReasonCode,
                            )}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={actionGridStyle}>
                  <strong style={{ fontSize: 13.5 }}>{copy.selectedDrill}</strong>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selectedDrillTargets.map((target) => (
                      <a
                        key={`${target.targetApp}:${target.route}`}
                        href={target.route}
                        target={
                          target.openMode === "new_tab" ? "_blank" : undefined
                        }
                        rel={
                          target.openMode === "new_tab"
                            ? "noreferrer"
                            : undefined
                        }
                        style={{ textDecoration: "none" }}
                      >
                        <CanvasPill
                          theme={theme}
                          tone={
                            target.openMode === "new_tab" ? "accent" : "neutral"
                          }
                        >
                          {target.label}
                        </CanvasPill>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: theme.textMuted, lineHeight: 1.6 }}>
                {copy.noSelected}
              </div>
            )}
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
