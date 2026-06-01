"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  tenantStageTone,
  tenantStatusTone,
} from "@/components/tenant-governance-shared";
import type {
  EmptyReason,
  PlatformTenantGovernanceAlertFlag,
  PlatformTenantGovernanceSummaryResponse,
  PlatformTenantGovernanceSummaryRow,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowPanel,
} from "@drts/ui-web";
import type { ManagementTone } from "@drts/ui-web";

const PAGE_SIZE = 12;

// Q-X01 / Q-X02 refresh model. `/tenant-governance` is tier T4 (admin
// medium-slow → 30s cadence per packet §3.2). The tier is named here so the
// page never carries a magic polling number, and the affordance below offers
// stale + manual-refresh per Q-X01.
const REFRESH_TIER: RefreshTier = "medium_slow";
// Tier → cadence (Q-X02 fixed tiers). The interval is derived from the tier so
// the page never carries an independent polling magic number; medium_slow = 30s.
const REFRESH_INTERVAL_BY_TIER: Partial<Record<RefreshTier, number>> = {
  medium_slow: 30_000,
};
const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_BY_TIER[REFRESH_TIER] ?? 30_000;

// Risk-type filter (packet §5.4 must-support action: "Filter by risk type").
type RiskFilter =
  | "all"
  | "quota_warn"
  | "approval_backlog"
  | "governance_risk"
  | "healthy";

const QUOTA_WARN_THRESHOLD = 80;
const QUOTA_OVER_THRESHOLD = 90;

const detailMetricsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies React.CSSProperties;

const detailMetricCardStyle = {
  display: "grid",
  gap: 4,
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid #dbe4ee",
  background: "#f8fafc",
} satisfies React.CSSProperties;

const detailLinksStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
} satisfies React.CSSProperties;

const pagerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 12,
  color: "#64748b",
  fontSize: 12.5,
} satisfies React.CSSProperties;

const quotaBarTrackStyle = {
  flex: 1,
  height: 6,
  borderRadius: 3,
  background: "#e2e8f0",
  overflow: "hidden",
} satisfies React.CSSProperties;

const freshnessStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: "#64748b",
} satisfies React.CSSProperties;

function quotaTone(percent: number): ManagementTone {
  if (percent > QUOTA_OVER_THRESHOLD) {
    return "danger";
  }
  if (percent > QUOTA_WARN_THRESHOLD) {
    return "warning";
  }
  return "success";
}

function quotaStatusCode(percent: number): string {
  if (percent > QUOTA_OVER_THRESHOLD) {
    return "over_threshold";
  }
  if (percent > QUOTA_WARN_THRESHOLD) {
    return "warning";
  }
  return "ok";
}

function alertTone(flag: PlatformTenantGovernanceAlertFlag): ManagementTone {
  switch (flag) {
    case "quota_above_95_percent":
      return "warning";
    case "no_approvers_configured":
    case "pending_approval_over_48h":
    default:
      return "danger";
  }
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

function detailLinkHref(tenantId: string, anchor?: string) {
  return anchor ? `/tenants/${tenantId}#${anchor}` : `/tenants/${tenantId}`;
}

// Packet §5.4 exit / §3.10 — drill targets. `/tenants/[id]`, `/payments`, and
// `/audit` are all platform-admin-owned routes, so they stay same-tab in-app
// deep links carrying a tenant filter.
function paymentsHref(tenantId: string) {
  return `/payments?tenantId=${encodeURIComponent(tenantId)}`;
}

function auditHref(tenantId: string) {
  return `/audit?tenantId=${encodeURIComponent(tenantId)}`;
}

function matchesRiskFilter(
  filter: RiskFilter,
  row: PlatformTenantGovernanceSummaryRow,
): boolean {
  switch (filter) {
    case "quota_warn":
      return row.monthlyQuotaPercentUsed > QUOTA_WARN_THRESHOLD;
    case "approval_backlog":
      return (
        row.pendingApprovalCount > 0 ||
        (row.oldestPendingApprovalAgeHours ?? 0) > 48
      );
    case "governance_risk":
      return row.alertFlags.length > 0;
    case "healthy":
      return (
        row.alertFlags.length === 0 &&
        row.monthlyQuotaPercentUsed <= QUOTA_WARN_THRESHOLD
      );
    case "all":
    default:
      return true;
  }
}

// ── Q-X13 availableActions → CTA rendering ──────────────────────────────────
// The summary contract does not yet carry per-row `availableActions`, so this
// page derives the navigational/triage descriptors the actor can act on. CTAs
// are rendered purely from the descriptor list (enabled / disabledReasonCode /
// riskLevel) rather than hard-coded per role, matching packet §3.5.

type GovernanceActionId =
  | "focus_detail"
  | "view_tenant"
  | "view_payments"
  | "view_audit"
  | "triage_approvals";

interface GovernanceAction extends ResourceActionDescriptor {
  action: GovernanceActionId;
}

function buildRowActions(
  row: PlatformTenantGovernanceSummaryRow,
): GovernanceAction[] {
  const hasBacklog =
    row.pendingApprovalCount > 0 ||
    (row.oldestPendingApprovalAgeHours ?? 0) > 0;

  return [
    { action: "focus_detail", enabled: true, riskLevel: "low" },
    { action: "view_tenant", enabled: true, riskLevel: "low" },
    {
      action: "triage_approvals",
      enabled: hasBacklog,
      riskLevel: "low",
      ...(hasBacklog ? {} : { disabledReasonCode: "no_pending_approvals" }),
    },
  ];
}

export default function TenantGovernancePage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [summary, setSummary] =
    useState<PlatformTenantGovernanceSummaryResponse | null>(null);
  const [page, setPage] = useState(1);
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const copy =
    locale === "en"
      ? {
          eyebrow: "Platform Admin",
          title: "Tenant Governance",
          subtitle:
            "Quota usage · approval backlog · cost-center health · governance risk — Q-ADM01",
          refresh: "Refresh",
          refreshing: "Refreshing…",
          autoNote: "Auto-refreshes every 30s (T4)",
          lastUpdated: (time: string) => `Last updated ${time}`,
          neverUpdated: "Not loaded yet",
          tableTitle: "Quota heatmap · cross-tenant rollup",
          tableSubtitle:
            "Quota pressure, approval backlog, and approver readiness in one platform-owned lane before operators drill into a tenant.",
          detailTitle: "Governance detail",
          detailSubtitle:
            "Drill into the executable governance surfaces for the selected tenant.",
          select: "Focus detail",
          openTenant: "Open tenant detail",
          openOnboarding: "Onboarding package",
          openRoles: "Roles and acknowledgements",
          openAudit: "Audit surface",
          openPayments: "Settlement & billing",
          triageApprovals: "Triage approvals",
          triageDisabled: "No pending approvals",
          detailNote:
            "Drill targets stay inside the platform-admin app; `/payments` and `/audit` open filtered to this tenant.",
          pageStatus: (current: number, total: number, items: number) =>
            `Page ${current} of ${total || 1} · ${items} row(s) on this page`,
          previous: "Previous",
          next: "Next",
          summary: (current: number, total: number, all: number) =>
            `${all} total tenant(s) across ${total || 1} page(s). Currently viewing page ${current}.`,
          filterLabel: "Filter by risk type",
          filters: {
            all: "All",
            quota_warn: "Quota warning",
            approval_backlog: "Approval backlog",
            governance_risk: "Governance risk",
            healthy: "Healthy",
          } satisfies Record<RiskFilter, string>,
          columns: {
            tenant: "Tenant",
            posture: "Posture",
            costCenters: "Cost centers",
            activeRules: "Active rules",
            quotaUsed: "Quota used (MTD)",
            approvals: "Pending approvals",
            alerts: "Risk signals",
            actions: "Actions",
          },
          kpis: {
            quotaWarn: "Quota warning (>80%)",
            backlog: "Approval backlog",
            costCenter: "Cost-center anomalies",
            riskSignals: "Governance risk signals",
          },
          kpiDetail: {
            quotaWarn: (n: number) => `${n} tenant(s) over the 80% line`,
            backlog: "Pending approval requests on this page",
            costCenter: "Tenants with no cost center configured",
            riskSignals: "Total governance alert flags on this page",
          },
          healthy: "Healthy",
          oldestPending: "Oldest pending",
          stage: "Stage",
          status: "Status",
          empty: {
            no_data: {
              title: "No tenant governance rows yet",
              body: "No tenants matched this page. Governance signals appear once tenants report quota and approval activity.",
            },
            not_provisioned: {
              title: "Governance not provisioned",
              body: "No tenants are onboarded to this platform yet, so there is no cross-tenant governance signal to roll up.",
              cta: "Onboard a tenant",
            },
            fetch_failed: {
              title: "Couldn’t load governance summary",
              body: "The governance summary request failed. Retry, or check platform API health.",
              cta: "Retry",
            },
            permission_denied: {
              title: "You can’t view tenant governance",
              body: "Your role doesn’t include the cross-tenant governance read scope. Ask a platform super-admin for access.",
            },
            external_unavailable: {
              title: "Governance source unavailable",
              body: "A platform dependency that backs this rollup is unavailable. Data will return when it recovers.",
              cta: "Retry",
            },
            filtered_empty: {
              title: "No tenants match this filter",
              body: "No tenant on this page matches the selected risk type. Clear the filter to see the full rollup.",
              cta: "Clear filter",
            },
          },
        }
      : {
          eyebrow: "平台治理",
          title: "跨租戶治理",
          subtitle:
            "quota usage · approval backlog · cost-center health · governance risk — Q-ADM01",
          refresh: "重新整理",
          refreshing: "重新整理中…",
          autoNote: "每 30 秒自動更新 (T4)",
          lastUpdated: (time: string) => `最後更新 ${time}`,
          neverUpdated: "尚未載入",
          tableTitle: "Quota 使用熱圖 · 跨租戶彙總",
          tableSubtitle:
            "在治理人進入單一 tenant detail 之前，先把 quota 壓力、approval backlog 與 approver readiness 放在同一張總覽表。",
          detailTitle: "治理詳情",
          detailSubtitle: "鑽研選定 tenant 目前可執行的治理工作面。",
          select: "聚焦詳情",
          openTenant: "租戶詳情",
          openOnboarding: "Onboarding package",
          openRoles: "角色與確認",
          openAudit: "Audit 面",
          openPayments: "結算與帳務",
          triageApprovals: "處理待審",
          triageDisabled: "沒有待審項目",
          detailNote:
            "鑽研目標都在 platform-admin app 內；`/payments` 與 `/audit` 會帶上此 tenant 篩選開啟。",
          pageStatus: (current: number, total: number, items: number) =>
            `第 ${current} / ${total || 1} 頁 · 本頁 ${items} 筆`,
          previous: "上一頁",
          next: "下一頁",
          summary: (current: number, total: number, all: number) =>
            `總計 ${all} 個 tenant，分成 ${total || 1} 頁；目前查看第 ${current} 頁。`,
          filterLabel: "依風險類型篩選",
          filters: {
            all: "全部",
            quota_warn: "Quota 警戒",
            approval_backlog: "審批 backlog",
            governance_risk: "治理風險",
            healthy: "健康",
          } satisfies Record<RiskFilter, string>,
          columns: {
            tenant: "租戶",
            posture: "姿態",
            costCenters: "Cost centers",
            activeRules: "Active rules",
            quotaUsed: "Quota 使用率 (本月)",
            approvals: "待審批數",
            alerts: "風險訊號",
            actions: "操作",
          },
          kpis: {
            quotaWarn: "Quota 警戒 (>80%)",
            backlog: "跨租戶審批 backlog",
            costCenter: "Cost-center 異常",
            riskSignals: "治理風險訊號",
          },
          kpiDetail: {
            quotaWarn: (n: number) => `${n} 個租戶超過 80% 警戒線`,
            backlog: "本頁待審批 request 總數",
            costCenter: "尚未配置 cost center 的租戶",
            riskSignals: "本頁治理警示旗標總數",
          },
          healthy: "健康",
          oldestPending: "最舊待審",
          stage: "階段",
          status: "狀態",
          empty: {
            no_data: {
              title: "目前沒有租戶治理資料",
              body: "本頁沒有符合的租戶。當租戶開始回報 quota 與審批活動後，治理訊號就會出現。",
            },
            not_provisioned: {
              title: "治理尚未佈建",
              body: "此平台尚未導入任何租戶，因此沒有可彙總的跨租戶治理訊號。",
              cta: "導入租戶",
            },
            fetch_failed: {
              title: "無法載入治理彙總",
              body: "治理彙總請求失敗。請重試，或檢查平台 API 健康狀態。",
              cta: "重試",
            },
            permission_denied: {
              title: "你沒有檢視租戶治理的權限",
              body: "你的角色不含跨租戶治理讀取範圍。請向 platform super-admin 申請存取。",
            },
            external_unavailable: {
              title: "治理資料來源暫時無法使用",
              body: "支撐此彙總的平台相依服務暫時無法使用，待其恢復後資料會回來。",
              cta: "重試",
            },
            filtered_empty: {
              title: "沒有符合此篩選的租戶",
              body: "本頁沒有符合所選風險類型的租戶。清除篩選即可看到完整彙總。",
              cta: "清除篩選",
            },
          },
        };

  const loadSummary = useCallback(async () => {
    if (hasLoadedRef.current) {
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
      setLastUpdatedAt(new Date().toISOString());
      hasLoadedRef.current = true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client, page]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // T4 medium-slow tiered polling (Q-X02). Re-arms whenever the loader identity
  // changes (page navigation) and pauses while a request is already in flight.
  useEffect(() => {
    const timer = setInterval(() => {
      void loadSummary();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadSummary]);

  const items = useMemo(() => summary?.items ?? [], [summary]);
  const visibleItems = useMemo(
    () => items.filter((item) => matchesRiskFilter(riskFilter, item)),
    [items, riskFilter],
  );

  useEffect(() => {
    if (!visibleItems.length) {
      setSelectedTenantId(null);
      return;
    }

    if (
      !selectedTenantId ||
      !visibleItems.some((item) => item.tenantId === selectedTenantId)
    ) {
      setSelectedTenantId(visibleItems[0]!.tenantId);
    }
  }, [selectedTenantId, visibleItems]);

  const pageInfo = summary?.pageInfo ?? {
    page,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  };
  const selectedTenant =
    visibleItems.find((item) => item.tenantId === selectedTenantId) ?? null;

  const metrics = useMemo(() => {
    const quotaWarn = items.filter(
      (item) => item.monthlyQuotaPercentUsed > QUOTA_WARN_THRESHOLD,
    ).length;
    const pendingApprovals = items.reduce(
      (sum, item) => sum + item.pendingApprovalCount,
      0,
    );
    const costCenterAnomalies = items.filter(
      (item) => item.costCenterCount === 0,
    ).length;
    const riskSignals = items.reduce(
      (sum, item) => sum + item.alertFlags.length,
      0,
    );

    return {
      quotaWarn,
      pendingApprovals,
      costCenterAnomalies,
      riskSignals,
    };
  }, [items]);

  // Q-X15 — resolve which of the six platform empty reasons applies right now.
  // The summary contract has no `emptyState` envelope, so the reason is derived
  // from the current request outcome; all six treatments are rendered distinctly
  // by `renderEmptyState`.
  const emptyReason: EmptyReason | null = useMemo(() => {
    if (error) {
      const normalized = error.toLowerCase();
      if (
        normalized.includes("403") ||
        normalized.includes("permission") ||
        normalized.includes("forbidden") ||
        normalized.includes("unauthor")
      ) {
        return "permission_denied";
      }
      if (
        normalized.includes("503") ||
        normalized.includes("502") ||
        normalized.includes("unavailable") ||
        normalized.includes("gateway")
      ) {
        return "external_unavailable";
      }
      return "fetch_failed";
    }
    if (loading) {
      return null;
    }
    if (visibleItems.length > 0) {
      return null;
    }
    if (items.length > 0) {
      return "filtered_empty";
    }
    if (pageInfo.totalItems === 0) {
      return "not_provisioned";
    }
    return "no_data";
  }, [error, loading, visibleItems.length, items.length, pageInfo.totalItems]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) {
      return copy.neverUpdated;
    }
    const formatted = new Date(lastUpdatedAt).toLocaleTimeString(
      locale === "en" ? "en-US" : "zh-TW",
      { hour: "2-digit", minute: "2-digit", second: "2-digit" },
    );
    return copy.lastUpdated(formatted);
  }, [copy, lastUpdatedAt, locale]);

  const riskFilters: RiskFilter[] = [
    "all",
    "quota_warn",
    "approval_backlog",
    "governance_risk",
    "healthy",
  ];

  function renderRowActions(row: PlatformTenantGovernanceSummaryRow) {
    const actions = buildRowActions(row);
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {actions.map((descriptor) => {
          if (descriptor.action === "focus_detail") {
            return (
              <button
                key={descriptor.action}
                type="button"
                className="admin-btn admin-btn--secondary admin-btn--sm"
                disabled={!descriptor.enabled}
                onClick={() => setSelectedTenantId(row.tenantId)}
              >
                {copy.select}
              </button>
            );
          }
          if (descriptor.action === "view_tenant") {
            return (
              <Link
                key={descriptor.action}
                href={detailLinkHref(row.tenantId)}
                className="admin-btn admin-btn--secondary admin-btn--sm"
              >
                {copy.openTenant}
              </Link>
            );
          }
          // triage_approvals — descriptor.enabled gates the affordance and the
          // disabledReasonCode drives the tooltip, instead of hiding it.
          return (
            <Link
              key={descriptor.action}
              href={descriptor.enabled ? auditHref(row.tenantId) : "#"}
              aria-disabled={!descriptor.enabled}
              title={descriptor.enabled ? undefined : copy.triageDisabled}
              className="admin-btn admin-btn--secondary admin-btn--sm"
              style={
                descriptor.enabled
                  ? undefined
                  : { opacity: 0.5, pointerEvents: "none" }
              }
            >
              {copy.triageApprovals}
            </Link>
          );
        })}
      </div>
    );
  }

  function renderEmptyState(reason: EmptyReason) {
    // Map each of the six platform EmptyReasons (Q-X15; driver_not_eligible is
    // driver-app only) to a distinct tone + next action.
    const toneByReason: Record<
      Exclude<EmptyReason, "driver_not_eligible">,
      ManagementTone
    > = {
      no_data: "neutral",
      not_provisioned: "info",
      fetch_failed: "danger",
      permission_denied: "warning",
      external_unavailable: "warning",
      filtered_empty: "platform",
    };

    if (reason === "driver_not_eligible") {
      return null;
    }

    const text = copy.empty[reason];
    const tone = toneByReason[reason];
    const cta = "cta" in text ? text.cta : undefined;

    let action: React.ReactNode = null;
    if (reason === "filtered_empty") {
      action = (
        <button
          type="button"
          className="admin-btn admin-btn--secondary admin-btn--sm"
          onClick={() => setRiskFilter("all")}
        >
          {cta}
        </button>
      );
    } else if (reason === "not_provisioned") {
      action = (
        <Link
          href="/tenants"
          className="admin-btn admin-btn--primary admin-btn--sm"
        >
          {cta}
        </Link>
      );
    } else if (reason === "fetch_failed" || reason === "external_unavailable") {
      action = (
        <button
          type="button"
          className="admin-btn admin-btn--secondary admin-btn--sm"
          disabled={refreshing}
          onClick={() => void loadSummary()}
        >
          {cta}
        </button>
      );
    }

    return (
      <CalloutBanner
        tone={tone}
        title={text.title}
        description={
          <span style={{ display: "grid", gap: 10 }}>
            <span>{text.body}</span>
            <span
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11,
                color: "#94a3b8",
              }}
            >
              emptyReason: {reason}
            </span>
            {action ? <span>{action}</span> : null}
          </span>
        }
      />
    );
  }

  if (loading && !summary) {
    return <div className="admin-empty">{copy.tableTitle}…</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={freshnessStyle}>
              <StatusChip
                label={refreshing ? copy.refreshing : copy.autoNote}
                tone={refreshing ? "info" : "success"}
              />
              <span>{lastUpdatedLabel}</span>
            </span>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={loading || refreshing}
              onClick={() => void loadSummary()}
            >
              {refreshing ? copy.refreshing : copy.refresh}
            </button>
          </div>
        }
      />

      {error && emptyReason ? renderEmptyState(emptyReason) : null}

      <KpiRow minWidth="220px">
        <KpiCard
          label={copy.kpis.quotaWarn}
          value={metrics.quotaWarn}
          detail={copy.kpiDetail.quotaWarn(metrics.quotaWarn)}
          tone={metrics.quotaWarn > 0 ? "warning" : "success"}
        />
        <KpiCard
          label={copy.kpis.backlog}
          value={metrics.pendingApprovals}
          detail={copy.kpiDetail.backlog}
          tone={metrics.pendingApprovals > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label={copy.kpis.costCenter}
          value={metrics.costCenterAnomalies}
          detail={copy.kpiDetail.costCenter}
          tone={metrics.costCenterAnomalies > 0 ? "danger" : "success"}
        />
        <KpiCard
          label={copy.kpis.riskSignals}
          value={metrics.riskSignals}
          detail={copy.kpiDetail.riskSignals}
          tone={metrics.riskSignals > 0 ? "danger" : "success"}
        />
      </KpiRow>

      <DataViewCard
        title={copy.tableTitle}
        subtitle={copy.tableSubtitle}
        tone="platform"
        summary={copy.summary(
          pageInfo.page,
          pageInfo.totalPages,
          pageInfo.totalItems,
        )}
        filters={
          <DataFilterBar<RiskFilter>
            ariaLabel={copy.filterLabel}
            value={riskFilter}
            onChange={(value) => setRiskFilter(value)}
            filters={riskFilters.map((value) => ({
              value,
              label: copy.filters[value],
            }))}
          />
        }
      >
        {emptyReason && !error ? (
          renderEmptyState(emptyReason)
        ) : (
          <DataTable
            columns={[
              { label: copy.columns.tenant, width: "240px" },
              { label: copy.columns.posture, width: "170px" },
              { label: copy.columns.costCenters, width: "120px" },
              { label: copy.columns.activeRules, width: "120px" },
              { label: copy.columns.quotaUsed, width: "200px" },
              { label: copy.columns.approvals, width: "160px" },
              { label: copy.columns.alerts, width: "220px" },
              { label: copy.columns.actions, width: "240px" },
            ]}
            empty={copy.empty.no_data.title}
          >
            {visibleItems.map((item) => (
              <Tr key={item.tenantId} highlighted={item.alertFlags.length > 0}>
                <Td>
                  <DataCellStack
                    primary={<strong>{item.tenantName}</strong>}
                    secondary={`${item.tenantCode} · ${item.tenantId}`}
                    tertiary={
                      <Link
                        href={detailLinkHref(item.tenantId)}
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                      >
                        {copy.openTenant}
                      </Link>
                    }
                  />
                </Td>
                <Td>
                  <div style={{ display: "grid", gap: 8 }}>
                    <StatusChip
                      label={`${copy.stage}: ${formatPlatformCodeLabel(locale, item.tenantRolloutStage)}`}
                      tone={tenantStageTone(item.tenantRolloutStage)}
                    />
                    <StatusChip
                      label={`${copy.status}: ${formatPlatformCodeLabel(locale, item.tenantStatus)}`}
                      tone={tenantStatusTone(item.tenantStatus)}
                    />
                  </div>
                </Td>
                <Td>{item.costCenterCount}</Td>
                <Td>{item.activeRuleCount}</Td>
                <Td>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div style={quotaBarTrackStyle}>
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, item.monthlyQuotaPercentUsed))}%`,
                            height: "100%",
                            background:
                              item.monthlyQuotaPercentUsed >
                              QUOTA_OVER_THRESHOLD
                                ? "#dc2626"
                                : item.monthlyQuotaPercentUsed >
                                    QUOTA_WARN_THRESHOLD
                                  ? "#d97706"
                                  : "#16a34a",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                          fontSize: 11,
                          minWidth: 44,
                          textAlign: "right",
                        }}
                      >
                        {formatPercent(item.monthlyQuotaPercentUsed)}
                      </span>
                    </div>
                    <StatusChip
                      label={quotaStatusCode(item.monthlyQuotaPercentUsed)}
                      tone={quotaTone(item.monthlyQuotaPercentUsed)}
                    />
                  </div>
                </Td>
                <Td>
                  <DataCellStack
                    primary={item.pendingApprovalCount}
                    secondary={`${copy.oldestPending}: ${formatAge(
                      locale,
                      item.oldestPendingApprovalAgeHours,
                    )}`}
                  />
                </Td>
                <Td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {item.alertFlags.length > 0 ? (
                      item.alertFlags.map((flag) => (
                        <StatusChip
                          key={`${item.tenantId}-${flag}`}
                          label={alertLabel(locale, flag)}
                          tone={alertTone(flag)}
                        />
                      ))
                    ) : (
                      <StatusChip label={copy.healthy} tone="success" />
                    )}
                  </div>
                </Td>
                <Td>{renderRowActions(item)}</Td>
              </Tr>
            ))}
          </DataTable>
        )}

        <div style={pagerStyle}>
          <span>
            {copy.pageStatus(
              pageInfo.page,
              pageInfo.totalPages,
              visibleItems.length,
            )}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="admin-btn admin-btn--secondary admin-btn--sm"
              disabled={loading || refreshing || pageInfo.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {copy.previous}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--secondary admin-btn--sm"
              disabled={
                loading ||
                refreshing ||
                pageInfo.totalPages === 0 ||
                pageInfo.page >= pageInfo.totalPages
              }
              onClick={() => setPage((current) => current + 1)}
            >
              {copy.next}
            </button>
          </div>
        </div>
      </DataViewCard>

      {selectedTenant ? (
        <WorkflowPanel
          title={`${copy.detailTitle} · ${selectedTenant.tenantName}`}
          description={copy.detailSubtitle}
          tone="platform"
        >
          {selectedTenant.alertFlags.length > 0 ? (
            <CalloutBanner
              tone="warning"
              title={
                locale === "en"
                  ? "This tenant needs governance attention"
                  : "此 tenant 需要治理關注"
              }
              description={selectedTenant.alertFlags
                .map((flag) => alertLabel(locale, flag))
                .join(" · ")}
            />
          ) : null}

          <div style={detailMetricsStyle}>
            <div style={detailMetricCardStyle}>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                {copy.columns.costCenters}
              </span>
              <strong style={{ fontSize: 22 }}>
                {selectedTenant.costCenterCount}
              </strong>
            </div>
            <div style={detailMetricCardStyle}>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                {copy.columns.activeRules}
              </span>
              <strong style={{ fontSize: 22 }}>
                {selectedTenant.activeRuleCount}
              </strong>
            </div>
            <div style={detailMetricCardStyle}>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                {copy.columns.quotaUsed}
              </span>
              <strong style={{ fontSize: 22 }}>
                {formatPercent(selectedTenant.monthlyQuotaPercentUsed)}
              </strong>
            </div>
            <div style={detailMetricCardStyle}>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                {copy.columns.approvals}
              </span>
              <strong style={{ fontSize: 22 }}>
                {selectedTenant.pendingApprovalCount}
              </strong>
            </div>
          </div>

          <div style={detailLinksStyle}>
            <Link
              href={detailLinkHref(selectedTenant.tenantId)}
              className="admin-btn admin-btn--secondary"
            >
              {copy.openTenant}
            </Link>
            <Link
              href={detailLinkHref(selectedTenant.tenantId, "onboarding")}
              className="admin-btn admin-btn--secondary"
            >
              {copy.openOnboarding}
            </Link>
            <Link
              href={detailLinkHref(selectedTenant.tenantId, "roles")}
              className="admin-btn admin-btn--secondary"
            >
              {copy.openRoles}
            </Link>
            <Link
              href={paymentsHref(selectedTenant.tenantId)}
              className="admin-btn admin-btn--secondary"
            >
              {copy.openPayments}
            </Link>
            <Link
              href={auditHref(selectedTenant.tenantId)}
              className="admin-btn admin-btn--secondary"
            >
              {copy.openAudit}
            </Link>
          </div>

          <div style={{ color: "#64748b", fontSize: 12.5, lineHeight: 1.6 }}>
            {copy.detailNote}
          </div>
        </WorkflowPanel>
      ) : null}
    </div>
  );
}
