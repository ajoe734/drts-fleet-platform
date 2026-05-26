"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeAlert,
  Building2,
  CircleOff,
  DatabaseZap,
  FilterX,
  RefreshCw,
  ShieldAlert,
  ShieldOff,
} from "lucide-react";
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
  PlatformAdminTenantRecord,
  PlatformTenantGateStatus,
  PlatformTenantGovernanceAlertFlag,
  PlatformTenantGovernanceSummaryQuery,
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
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

const CLIENT_PAGE_SIZE = 12;
const SUMMARY_FETCH_SIZE = 500;
const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_INTERVAL_MS = 30_000;
const STALE_AFTER_MS = 65_000;

const th = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

type SupportedFreshness = UiRefreshMetadata["dataFreshness"];
type GovernanceFilter =
  | "all"
  | "quota_pressure"
  | "approval_backlog"
  | "cost_center_attention"
  | "rollout_risk"
  | "expiry_feeds";
type LocalizedLocale = "en" | "zh";

type DashboardSnapshot = {
  summary: PlatformTenantGovernanceSummaryResponse;
  tenants: PlatformAdminTenantRecord[];
  refresh: UiRefreshMetadata;
};

type GovernanceAction = {
  descriptor: ResourceActionDescriptor;
  label: string;
  href?: string;
  onClick?: () => void;
  crossApp?: CrossAppResourceLink;
};

type GovernanceRowView = Record<string, unknown> &
  PlatformTenantGovernanceSummaryRow & {
    _selected?: boolean;
    tenantRecord: PlatformAdminTenantRecord | null;
    highestGateStatus: PlatformTenantGateStatus | null;
    blockedGateCount: number;
    rolloutHold: boolean;
    quotaState: "ok" | "warn" | "critical";
    costCenterState: "healthy" | "limited" | "missing";
    governanceRiskCount: number;
    governanceRiskLabels: string[];
    hasAgedBacklog: boolean;
    hasApproverGap: boolean;
    approvalSignals: string[];
    visibleActions: GovernanceAction[];
    detailActions: GovernanceAction[];
  };

const pageRootStyle = {
  minHeight: "100%",
  background: th.bg,
  color: th.text,
  borderRadius: 12,
  overflow: "hidden",
  fontFamily: th.fontFamily,
} satisfies CSSProperties;

const pageBodyStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
} satisfies CSSProperties;

const loadingStateStyle = {
  padding: 24,
  color: th.textMuted,
  fontFamily: th.fontFamily,
  background: th.bg,
  borderRadius: 12,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const topGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
} satisfies CSSProperties;

const toolbarRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "flex-start",
} satisfies CSSProperties;

const actionStackStyle = {
  display: "grid",
  gap: 4,
} satisfies CSSProperties;

const detailGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const detailMetricStyle = {
  display: "grid",
  gap: 5,
  padding: 12,
  borderRadius: 9,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
} satisfies CSSProperties;

const stackedValueStyle = {
  display: "grid",
  gap: 4,
} satisfies CSSProperties;

const monoSubtleStyle = {
  fontSize: 10.5,
  color: th.textDim,
  fontFamily: th.monoFamily,
} satisfies CSSProperties;

const secondaryTextStyle = {
  fontSize: 11.5,
  color: th.textMuted,
  lineHeight: 1.45,
} satisfies CSSProperties;

const ruleListStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const ruleRowStyle = {
  display: "grid",
  gap: 5,
  paddingBottom: 10,
  borderBottom: `1px solid ${th.border}`,
} satisfies CSSProperties;

function formatNumber(locale: LocalizedLocale, value: number) {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function formatPercent(locale: LocalizedLocale, value: number) {
  return `${value.toLocaleString(locale === "en" ? "en-US" : "zh-TW", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatAge(locale: LocalizedLocale, value: number | null) {
  if (value === null) {
    return locale === "en" ? "No aged approvals" : "目前沒有逾時待審";
  }
  return locale === "en" ? `${value} h` : `${value} 小時`;
}

function formatDateTime(locale: LocalizedLocale, value: string) {
  return new Date(value).toLocaleString(locale === "en" ? "en-US" : "zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toneForAlert(flag: PlatformTenantGovernanceAlertFlag): CanvasTone {
  switch (flag) {
    case "quota_above_95_percent":
      return "warn";
    case "no_approvers_configured":
    case "pending_approval_over_48h":
    default:
      return "danger";
  }
}

function alertLabel(
  locale: LocalizedLocale,
  flag: PlatformTenantGovernanceAlertFlag,
) {
  if (locale === "en") {
    switch (flag) {
      case "no_approvers_configured":
        return "No approvers";
      case "quota_above_95_percent":
        return "Quota > 95%";
      case "pending_approval_over_48h":
      default:
        return "Backlog > 48h";
    }
  }

  switch (flag) {
    case "no_approvers_configured":
      return "未配置 approver";
    case "quota_above_95_percent":
      return "Quota > 95%";
    case "pending_approval_over_48h":
    default:
      return "待審逾 48h";
  }
}

function filterTone(active: boolean, count: number): CanvasTone {
  if (active) {
    return count > 0 ? "accent" : "neutral";
  }
  if (count === 0) {
    return "neutral";
  }
  return count > 3 ? "warn" : "info";
}

function toCanvasTone(tone: ReturnType<typeof tenantStageTone>): CanvasTone;
function toCanvasTone(tone: ReturnType<typeof tenantStatusTone>): CanvasTone;
function toCanvasTone(tone: string): CanvasTone {
  if (tone === "warning") {
    return "warn";
  }
  if (
    tone === "success" ||
    tone === "warn" ||
    tone === "danger" ||
    tone === "info" ||
    tone === "accent" ||
    tone === "neutral"
  ) {
    return tone;
  }
  return "neutral";
}

function freshnessTone(freshness: SupportedFreshness): CanvasTone {
  switch (freshness) {
    case "degraded":
      return "danger";
    case "stale":
      return "warn";
    case "unknown":
      return "neutral";
    case "fresh":
    default:
      return "success";
  }
}

function resolveAppOrigins() {
  const isBrowser = typeof window !== "undefined";
  const isLocalhost =
    isBrowser &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  return {
    "platform-admin": "",
    "ops-console":
      process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN ||
      (isLocalhost ? "http://localhost:3003" : ""),
    "tenant-console":
      process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN ||
      (isLocalhost ? "http://localhost:3004" : ""),
  } as const;
}

function buildCrossAppHref(
  origins: ReturnType<typeof resolveAppOrigins>,
  link: CrossAppResourceLink,
) {
  const origin = origins[link.targetApp];
  if (link.targetApp === "platform-admin") {
    return link.route;
  }
  if (!origin) {
    return null;
  }
  return `${origin}${link.route}`;
}

function quotaMeterStyle(): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 8,
    alignItems: "center",
  };
}

function classifyErrorReason(error: string): EmptyReason {
  const normalized = error.toLowerCase();
  if (
    normalized.includes("403") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission") ||
    normalized.includes("unauthor")
  ) {
    return "permission_denied";
  }
  if (
    normalized.includes("not provisioned") ||
    normalized.includes("not configured") ||
    normalized.includes("missing feed") ||
    normalized.includes("unsupported")
  ) {
    return "not_provisioned";
  }
  if (
    normalized.includes("external") ||
    normalized.includes("upstream") ||
    normalized.includes("dependency") ||
    normalized.includes("timeout") ||
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function parseEmptyReason(value: string | null): EmptyReason | null {
  if (
    value === "no_data" ||
    value === "not_provisioned" ||
    value === "fetch_failed" ||
    value === "permission_denied" ||
    value === "external_unavailable" ||
    value === "filtered_empty"
  ) {
    return value;
  }
  return null;
}

function parseFreshness(
  value: string | null,
): UiRefreshMetadata["dataFreshness"] | null {
  if (
    value === "fresh" ||
    value === "stale" ||
    value === "degraded" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function disabledReasonLabel(locale: LocalizedLocale, code?: string) {
  if (!code) {
    return null;
  }

  const labels: Record<string, { en: string; zh: string }> = {
    no_pending_approvals: {
      en: "No pending approvals for this tenant.",
      zh: "這個 tenant 目前沒有待審批項目。",
    },
    cross_app_origin_missing: {
      en: "Cross-app origin is not configured in this environment.",
      zh: "這個環境尚未配置 cross-app origin。",
    },
    feed_not_provisioned: {
      en: "The underlying expiry feed is not provisioned yet.",
      zh: "底層到期 feed 尚未 provision。",
    },
    no_matching_signals: {
      en: "There are no tenants in this signal cluster right now.",
      zh: "目前沒有 tenant 落在這個訊號群組。",
    },
  };

  const entry = labels[code];
  if (!entry) {
    return code;
  }
  return locale === "en" ? entry.en : entry.zh;
}

function buildDescriptor(
  action: string,
  enabled: boolean,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  disabledReasonCode?: string,
): ResourceActionDescriptor {
  return disabledReasonCode
    ? { action, enabled, riskLevel, disabledReasonCode }
    : { action, enabled, riskLevel };
}

function actionStyle({
  active = false,
  disabled = false,
  compact = false,
}: {
  active?: boolean;
  disabled?: boolean;
  compact?: boolean;
}): CSSProperties {
  const bg = active ? th.accentBg : disabled ? th.surfaceLo : th.surface;
  const bd = active ? th.accentBorder : th.border;
  const fg = active ? th.accent : disabled ? th.textDim : th.text;

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: compact ? 26 : 30,
    padding: compact ? "5px 8px" : "6px 10px",
    borderRadius: 8,
    border: `1px solid ${bd}`,
    background: bg,
    color: fg,
    fontSize: compact ? 11.5 : 12,
    fontWeight: 600,
    lineHeight: 1,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.58 : 1,
    boxShadow: active ? `inset 0 0 0 1px ${th.accentBorder}` : "none",
  };
}

function renderAction({
  action,
  locale,
  origins,
  compact = false,
  active = false,
  showReason = false,
}: {
  action: GovernanceAction;
  locale: LocalizedLocale;
  origins: ReturnType<typeof resolveAppOrigins>;
  compact?: boolean;
  active?: boolean;
  showReason?: boolean;
}) {
  const reason = disabledReasonLabel(
    locale,
    action.descriptor.disabledReasonCode,
  );
  const href = action.crossApp
    ? buildCrossAppHref(origins, action.crossApp)
    : (action.href ?? null);
  const isExternal =
    action.crossApp?.targetApp !== undefined &&
    action.crossApp.targetApp !== "platform-admin";

  const content = (
    <>
      <span>{action.label}</span>
      {isExternal && action.descriptor.enabled ? (
        <ArrowUpRight size={12} />
      ) : null}
    </>
  );

  if (!action.descriptor.enabled || (!href && !action.onClick)) {
    return (
      <div style={actionStackStyle}>
        <button
          type="button"
          disabled
          title={reason ?? undefined}
          style={actionStyle({ active, disabled: true, compact })}
        >
          {content}
        </button>
        {showReason && reason ? (
          <div style={monoSubtleStyle}>{reason}</div>
        ) : null}
      </div>
    );
  }

  if (action.onClick) {
    return (
      <button
        type="button"
        onClick={action.onClick}
        style={actionStyle({ active, compact })}
      >
        {content}
      </button>
    );
  }

  if (!href) {
    return null;
  }

  if (href.startsWith("http")) {
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer" : undefined}
        style={actionStyle({ active, compact })}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={href} style={actionStyle({ active, compact })}>
      {content}
    </Link>
  );
}

function highestGateStatus(
  tenant: PlatformAdminTenantRecord | null,
): PlatformTenantGateStatus | null {
  if (!tenant) {
    return null;
  }

  const statuses = [
    tenant.rollout.sandboxStatus,
    tenant.rollout.pilotStatus,
    tenant.rollout.productionStatus,
  ];
  if (statuses.includes("blocked")) {
    return "blocked";
  }
  if (statuses.includes("ready")) {
    return "ready";
  }
  if (statuses.includes("pending")) {
    return "pending";
  }
  return statuses.includes("approved") ? "approved" : null;
}

function riskSummaryTone(count: number): CanvasTone {
  if (count >= 3) {
    return "danger";
  }
  if (count >= 1) {
    return "warn";
  }
  return "success";
}

function renderQuotaMeter(locale: LocalizedLocale, percent: number) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const color =
    clamped >= 95 ? th.danger : clamped >= 80 ? th.warn : th.success;

  return (
    <div style={quotaMeterStyle()}>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: th.surfaceLo,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${clamped}%`,
            background: color,
            borderRadius: 999,
          }}
        />
      </div>
      <span style={monoSubtleStyle}>{formatPercent(locale, percent)}</span>
    </div>
  );
}

function renderRiskLabels(
  locale: LocalizedLocale,
  row: GovernanceRowView,
): ReactNode {
  const labels = [
    ...row.alertFlags.map((flag) => ({
      label: alertLabel(locale, flag),
      tone: toneForAlert(flag),
    })),
  ];

  if (row.rolloutHold) {
    labels.push({
      label: locale === "en" ? "Rollback hold" : "Rollback hold",
      tone: "danger" as const,
    });
  }
  if (row.blockedGateCount > 0) {
    labels.push({
      label:
        locale === "en"
          ? `${row.blockedGateCount} blocked gate`
          : `${row.blockedGateCount} 個 blocked gate`,
      tone: "warn" as const,
    });
  }
  if (labels.length === 0) {
    labels.push({
      label: locale === "en" ? "All clear" : "全部正常",
      tone: "success" as const,
    });
  }

  return (
    <div style={actionRowStyle}>
      {labels.slice(0, 3).map((item) => (
        <CanvasPill key={item.label} theme={th} tone={item.tone} dot>
          {item.label}
        </CanvasPill>
      ))}
    </div>
  );
}

export default function TenantGovernancePage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const [origins, setOrigins] = useState<ReturnType<typeof resolveAppOrigins>>({
    "platform-admin": "",
    "ops-console": "",
    "tenant-console": "",
  });
  const language = locale === "en" ? "en" : "zh";
  const previewEmptyReason = parseEmptyReason(searchParams.get("emptyReason"));
  const previewFreshness = parseFreshness(searchParams.get("freshness"));

  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<GovernanceFilter>("all");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshnessTick, setFreshnessTick] = useState(Date.now());

  const copy =
    language === "en"
      ? {
          title: "Cross-tenant Governance",
          subtitle:
            "Quota usage, approval backlog, cost-center health, and governance risk in one platform-owned dashboard.",
          refresh: "Refresh now",
          refreshTier: "Refresh tier",
          snapshot: "Snapshot",
          source: "Source",
          tableTitle: "Governance heat map",
          tableSubtitle:
            "Rows stay read-only here; operators drill into tenant, payments, audit, or tenant-console source modules from the action set.",
          detailTitle: "Tenant governance rail",
          detailSubtitle:
            "Selected tenant context with same-app and cross-app drill targets.",
          filterTitle: "Governance focus lanes",
          filterSubtitle:
            "All CTA visibility is driven from page-local availableActions descriptors, not hard-coded by role.",
          backlogTitle: "Approval backlog by type",
          backlogSubtitle:
            "Cross-tenant queue depth grouped by the signals available in the current read model.",
          riskTitle: "Governance risk register",
          riskSubtitle:
            "Rollout risk is live; credential and contract expiry remain explicit feed gaps until upstream data lands.",
          emptyTitle: "No governance rows to display",
          clearFilter: "Clear filter",
          focus: "Focus",
          previous: "Previous",
          next: "Next",
          openTenant: "Tenant detail",
          openPayments: "Payments",
          openAudit: "Audit",
          openCostCenters: "Tenant Console · Cost centers",
          openRules: "Tenant Console · Rules",
          openOps: "Ops Console · Dispatch",
          selectedHint:
            "Cross-app routes open in a new tab by default when the target origin is configured.",
          noSelection: "Select a tenant row to inspect detail context.",
          loading: "Loading tenant governance dashboard…",
          staleBannerTitle: "Governance snapshot is stale",
          staleBannerBody:
            "The dashboard is past the T4 freshness window. Manual refresh remains available while the last good snapshot stays visible.",
          degradedBannerTitle: "Governance snapshot is degraded",
          degradedBannerBody:
            "A background refresh failed. The dashboard is showing the last successful snapshot while retry remains available.",
          truncationTitle: "Showing a partial snapshot",
          truncationBody: (items: number, total: number) =>
            `Loaded ${items} of ${total} governance rows. Increase the summary fetch size before relying on this dashboard for full-tenant sweeps.`,
          pageSummary: (current: number, total: number, rows: number) =>
            `Page ${current} of ${total} · ${rows} row(s) visible`,
          resultSummary: (rows: number, filtered: number) =>
            `${filtered} of ${rows} tenant(s) match the current governance focus.`,
          aggregate: {
            quota: "Quota pressure",
            backlog: "Pending approvals",
            costCenters: "Cost-center attention",
            risks: "Governance risk signals",
          },
          filters: {
            all: "All tenants",
            quota_pressure: "Quota pressure",
            approval_backlog: "Approval backlog",
            cost_center_attention: "Cost-center gaps",
            rollout_risk: "Rollout risk",
            expiry_feeds: "Expiry feeds",
          },
          backlog: {
            total: "Open queue depth",
            aged: "Aged backlog > 48h",
            approverGap: "No approvers configured",
            clear: "Tenants with zero backlog",
          },
          register: {
            rollbackHold: "Rollback hold",
            blockedGates: "Blocked rollout gates",
            credentialFeed: "Credential expiry feed",
            contractFeed: "Contract expiry feed",
          },
          table: {
            tenant: "Tenant",
            rollout: "Rollout",
            costCenters: "Cost-center health",
            approvals: "Approval backlog",
            quota: "Quota burn",
            risks: "Risk signals",
            actions: "Available actions",
          },
          states: {
            stage: "Stage",
            status: "Status",
            gate: "Gate",
            filters: "Filters",
            modules: "Enabled modules",
            integration: "Integration",
          },
          detail: {
            headers: {
              overview: "Governance overview",
              signals: "Signal breakdown",
              actions: "Drill targets",
            },
            quota: "Quota burn",
            approvals: "Pending approvals",
            costCenters: "Cost centers",
            rules: "Active rules",
            rollout: "Rollout posture",
            healthy: "Healthy",
            noData: "No tenant selected",
          },
        }
      : {
          title: "跨租戶治理",
          subtitle:
            "把 quota 使用、approval backlog、cost-center 健康與治理風險放在同一張平台治理看板。",
          refresh: "立即重新整理",
          refreshTier: "Refresh tier",
          snapshot: "快照時間",
          source: "資料來源",
          tableTitle: "治理熱區總表",
          tableSubtitle:
            "這裡只做跨租戶讀取與分流；真正的操作要從 action set 進 tenant、payments、audit 或 tenant-console 原始工作面。",
          detailTitle: "租戶治理側欄",
          detailSubtitle:
            "選定 tenant 後，保留同 app 與 cross-app drill target 的完整上下文。",
          filterTitle: "治理聚焦路徑",
          filterSubtitle:
            "所有 CTA 都由 page-local availableActions descriptor 驅動，而不是把角色硬編進畫面。",
          backlogTitle: "Approval backlog 分型",
          backlogSubtitle:
            "依目前 read model 可見的訊號，把跨租戶待審壓力拆成幾種治理注意點。",
          riskTitle: "治理風險登錄",
          riskSubtitle:
            "Rollout 風險是 live；credential / contract 到期目前仍以明確 feed gap 呈現，直到上游資料落地。",
          emptyTitle: "目前沒有可顯示的治理列",
          clearFilter: "清除篩選",
          focus: "聚焦",
          previous: "上一頁",
          next: "下一頁",
          openTenant: "Tenant 詳情",
          openPayments: "Payments",
          openAudit: "Audit",
          openCostCenters: "Tenant Console · Cost centers",
          openRules: "Tenant Console · Rules",
          openOps: "Ops Console · Dispatch",
          selectedHint:
            "Cross-app 路由預設新分頁開啟；若目標 app origin 未配置，CTA 會保留 disabled reason。",
          noSelection: "先選一列 tenant，再看 detail rail。",
          loading: "正在載入 tenant governance dashboard…",
          staleBannerTitle: "治理快照已過時",
          staleBannerBody:
            "這個 dashboard 已超過 T4 freshness 視窗；目前保留最後一次成功快照，仍可手動 refresh。",
          degradedBannerTitle: "治理快照來源降級",
          degradedBannerBody:
            "背景 refresh 失敗，頁面保留最後一次成功快照，同時提供手動重試。",
          truncationTitle: "目前只載入部分快照",
          truncationBody: (items: number, total: number) =>
            `目前只載入 ${items} / ${total} 筆治理資料；若要拿它做全租戶 sweep，需先提高 summary fetch size。`,
          pageSummary: (current: number, total: number, rows: number) =>
            `第 ${current} / ${total} 頁 · 顯示 ${rows} 筆`,
          resultSummary: (rows: number, filtered: number) =>
            `目前有 ${filtered} / ${rows} 個 tenant 符合治理焦點。`,
          aggregate: {
            quota: "Quota 壓力",
            backlog: "待審批總量",
            costCenters: "Cost-center 注意戶",
            risks: "治理風險訊號",
          },
          filters: {
            all: "全部租戶",
            quota_pressure: "Quota 壓力",
            approval_backlog: "Approval backlog",
            cost_center_attention: "Cost-center 缺口",
            rollout_risk: "Rollout 風險",
            expiry_feeds: "Expiry feeds",
          },
          backlog: {
            total: "待審總深度",
            aged: "逾 48h 待審",
            approverGap: "未配置 approver",
            clear: "零 backlog 租戶",
          },
          register: {
            rollbackHold: "Rollback hold",
            blockedGates: "Blocked rollout gate",
            credentialFeed: "Credential 到期 feed",
            contractFeed: "Contract 到期 feed",
          },
          table: {
            tenant: "Tenant",
            rollout: "Rollout",
            costCenters: "Cost-center 健康",
            approvals: "Approval backlog",
            quota: "Quota 燃燒",
            risks: "風險訊號",
            actions: "Available actions",
          },
          states: {
            stage: "Stage",
            status: "Status",
            gate: "Gate",
            filters: "Filters",
            modules: "Enabled modules",
            integration: "Integration",
          },
          detail: {
            headers: {
              overview: "治理概況",
              signals: "訊號拆解",
              actions: "Drill target",
            },
            quota: "Quota 燃燒",
            approvals: "待審批",
            costCenters: "Cost centers",
            rules: "Active rules",
            rollout: "Rollout 姿態",
            healthy: "健康",
            noData: "尚未選定 tenant",
          },
        };

  const loadDashboard = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const query: PlatformTenantGovernanceSummaryQuery = {
          page: 1,
          pageSize: SUMMARY_FETCH_SIZE,
        };

        const [tenants, summary] = await Promise.all([
          client.listPlatformTenants(),
          client.getPlatformTenantGovernanceSummary(query),
        ]);

        setSnapshot({
          tenants,
          summary,
          refresh: {
            generatedAt: new Date().toISOString(),
            staleAfterMs: STALE_AFTER_MS,
            dataFreshness: "fresh",
            source: "live",
          },
        });
        setError(null);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
      } finally {
        if (mode === "initial") {
          setLoading(false);
        }
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    setOrigins(resolveAppOrigins());
  }, []);

  useEffect(() => {
    void loadDashboard("initial");
  }, [loadDashboard]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadDashboard("refresh");
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFreshnessTick(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const refreshMeta = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    const age =
      freshnessTick - new Date(snapshot.refresh.generatedAt).getTime();
    const computedFreshness: SupportedFreshness =
      error && snapshot.summary.items.length > 0
        ? "degraded"
        : age > snapshot.refresh.staleAfterMs
          ? "stale"
          : snapshot.refresh.dataFreshness;

    return {
      ...snapshot.refresh,
      dataFreshness: previewFreshness ?? computedFreshness,
    };
  }, [error, freshnessTick, previewFreshness, snapshot]);

  const rows = useMemo<GovernanceRowView[]>(() => {
    if (!snapshot) {
      return [];
    }

    const tenantIndex = new Map(
      snapshot.tenants.map((tenant) => [tenant.id, tenant]),
    );

    return snapshot.summary.items
      .map((item) => {
        const tenantRecord = tenantIndex.get(item.tenantId) ?? null;
        const highestGate = highestGateStatus(tenantRecord);
        const blockedGateCount = tenantRecord
          ? [
              tenantRecord.rollout.sandboxStatus,
              tenantRecord.rollout.pilotStatus,
              tenantRecord.rollout.productionStatus,
            ].filter((status) => status === "blocked").length
          : 0;
        const rolloutHold =
          item.tenantStatus === "rollback_hold" ||
          tenantRecord?.status === "rollback_hold";
        const quotaState =
          item.monthlyQuotaPercentUsed >= 95
            ? "critical"
            : item.monthlyQuotaPercentUsed >= 80
              ? "warn"
              : "ok";
        const costCenterState =
          item.costCenterCount === 0
            ? "missing"
            : item.activeRuleCount === 0 || item.costCenterCount < 2
              ? "limited"
              : "healthy";
        const hasAgedBacklog = item.alertFlags.includes(
          "pending_approval_over_48h",
        );
        const hasApproverGap = item.alertFlags.includes(
          "no_approvers_configured",
        );
        const approvalSignals = [
          hasAgedBacklog
            ? language === "en"
              ? "Aged backlog > 48h"
              : "待審逾 48h"
            : null,
          hasApproverGap
            ? language === "en"
              ? "Approver gap"
              : "Approver 缺口"
            : null,
        ].filter(Boolean) as string[];
        const governanceRiskLabels = [
          rolloutHold
            ? language === "en"
              ? "Rollback hold"
              : "Rollback hold"
            : null,
          blockedGateCount > 0
            ? language === "en"
              ? `${blockedGateCount} blocked gate`
              : `${blockedGateCount} 個 blocked gate`
            : null,
          quotaState === "critical"
            ? language === "en"
              ? "Critical quota burn"
              : "Quota 高風險"
            : quotaState === "warn"
              ? language === "en"
                ? "Quota watch"
                : "Quota 觀察"
              : null,
          hasAgedBacklog
            ? language === "en"
              ? "Aged backlog"
              : "逾時 backlog"
            : null,
          hasApproverGap
            ? language === "en"
              ? "No approvers"
              : "未配置 approver"
            : null,
          costCenterState !== "healthy"
            ? language === "en"
              ? "Cost-center attention"
              : "Cost-center 需注意"
            : null,
        ].filter(Boolean) as string[];
        const governanceRiskCount = governanceRiskLabels.length;

        const tenantLink = `/tenants/${item.tenantId}`;
        const paymentsLink = `/payments?tenantId=${encodeURIComponent(item.tenantId)}`;
        const auditLink = `/audit?resourceType=tenant&resourceId=${encodeURIComponent(item.tenantId)}`;
        const tenantConsoleOriginMissing = !origins["tenant-console"];
        const opsOriginMissing = !origins["ops-console"];

        const detailActions: GovernanceAction[] = [
          {
            descriptor: buildDescriptor("open_tenant_detail", true, "low"),
            label: copy.openTenant,
            href: tenantLink,
          },
          {
            descriptor: buildDescriptor(
              "open_tenant_cost_centers",
              !tenantConsoleOriginMissing,
              "low",
              tenantConsoleOriginMissing
                ? "cross_app_origin_missing"
                : undefined,
            ),
            label: copy.openCostCenters,
            crossApp: {
              targetApp: "tenant-console",
              route: `/cost-centers?tenantId=${encodeURIComponent(item.tenantId)}`,
              resourceType: "tenant_cost_centers",
              resourceId: item.tenantId,
              openMode: "new_tab",
              label: copy.openCostCenters,
            },
          },
          {
            descriptor: buildDescriptor(
              "open_tenant_rules",
              !tenantConsoleOriginMissing,
              "low",
              tenantConsoleOriginMissing
                ? "cross_app_origin_missing"
                : undefined,
            ),
            label: copy.openRules,
            crossApp: {
              targetApp: "tenant-console",
              route: `/rules?tenantId=${encodeURIComponent(item.tenantId)}`,
              resourceType: "tenant_rules",
              resourceId: item.tenantId,
              openMode: "new_tab",
              label: copy.openRules,
            },
          },
          {
            descriptor: buildDescriptor(
              "open_payments_queue",
              item.pendingApprovalCount > 0,
              "low",
              item.pendingApprovalCount > 0
                ? undefined
                : "no_pending_approvals",
            ),
            label: copy.openPayments,
            href: paymentsLink,
          },
          {
            descriptor: buildDescriptor("open_audit", true, "low"),
            label: copy.openAudit,
            href: auditLink,
          },
        ];

        if (tenantRecord && tenantRecord.rollout.stage !== "sandbox") {
          detailActions.push({
            descriptor: buildDescriptor(
              "open_ops_dispatch",
              !opsOriginMissing,
              "low",
              opsOriginMissing ? "cross_app_origin_missing" : undefined,
            ),
            label: copy.openOps,
            crossApp: {
              targetApp: "ops-console",
              route: `/dispatch?tenantId=${encodeURIComponent(item.tenantId)}`,
              resourceType: "tenant_operational_context",
              resourceId: item.tenantId,
              openMode: "new_tab",
              label: copy.openOps,
            },
          });
        }

        const visibleActions: GovernanceAction[] = [
          {
            descriptor: buildDescriptor("focus_row", true, "low"),
            label: copy.focus,
            onClick: () => setSelectedTenantId(item.tenantId),
          },
          detailActions[0]!,
          detailActions[3]!,
        ];

        return {
          ...item,
          tenantRecord,
          highestGateStatus: highestGate,
          blockedGateCount,
          rolloutHold,
          quotaState,
          costCenterState,
          governanceRiskCount,
          governanceRiskLabels,
          hasAgedBacklog,
          hasApproverGap,
          approvalSignals,
          visibleActions,
          detailActions,
        } satisfies GovernanceRowView;
      })
      .sort((left, right) => {
        if (right.governanceRiskCount !== left.governanceRiskCount) {
          return right.governanceRiskCount - left.governanceRiskCount;
        }
        if (right.monthlyQuotaPercentUsed !== left.monthlyQuotaPercentUsed) {
          return right.monthlyQuotaPercentUsed - left.monthlyQuotaPercentUsed;
        }
        if (right.pendingApprovalCount !== left.pendingApprovalCount) {
          return right.pendingApprovalCount - left.pendingApprovalCount;
        }
        return left.tenantName.localeCompare(right.tenantName);
      });
  }, [copy, language, origins, snapshot]);

  const filterStats = useMemo(() => {
    const counts = {
      all: rows.length,
      quota_pressure: rows.filter((row) => row.monthlyQuotaPercentUsed >= 80)
        .length,
      approval_backlog: rows.filter((row) => row.pendingApprovalCount > 0)
        .length,
      cost_center_attention: rows.filter(
        (row) => row.costCenterState !== "healthy",
      ).length,
      rollout_risk: rows.filter(
        (row) => row.rolloutHold || row.blockedGateCount > 0,
      ).length,
      expiry_feeds: 0,
    } satisfies Record<GovernanceFilter, number>;

    return counts;
  }, [rows]);

  const filterActions = useMemo(() => {
    const createFilterAction = (
      key: GovernanceFilter,
      enabled: boolean,
      disabledReasonCode?: string,
    ): GovernanceAction =>
      enabled
        ? {
            descriptor: buildDescriptor(
              `filter_${key}`,
              enabled,
              "low",
              disabledReasonCode,
            ),
            label: copy.filters[key],
            onClick: () => setFilter(key),
          }
        : {
            descriptor: buildDescriptor(
              `filter_${key}`,
              enabled,
              "low",
              disabledReasonCode,
            ),
            label: copy.filters[key],
          };

    return {
      all: createFilterAction("all", true),
      quota_pressure: createFilterAction(
        "quota_pressure",
        filterStats.quota_pressure > 0,
        "no_matching_signals",
      ),
      approval_backlog: createFilterAction(
        "approval_backlog",
        filterStats.approval_backlog > 0,
        "no_matching_signals",
      ),
      cost_center_attention: createFilterAction(
        "cost_center_attention",
        filterStats.cost_center_attention > 0,
        "no_matching_signals",
      ),
      rollout_risk: createFilterAction(
        "rollout_risk",
        filterStats.rollout_risk > 0,
        "no_matching_signals",
      ),
      expiry_feeds: createFilterAction(
        "expiry_feeds",
        false,
        "feed_not_provisioned",
      ),
    } satisfies Record<GovernanceFilter, GovernanceAction>;
  }, [copy.filters, filterStats]);

  const filteredRows = useMemo(() => {
    switch (filter) {
      case "quota_pressure":
        return rows.filter((row) => row.monthlyQuotaPercentUsed >= 80);
      case "approval_backlog":
        return rows.filter((row) => row.pendingApprovalCount > 0);
      case "cost_center_attention":
        return rows.filter((row) => row.costCenterState !== "healthy");
      case "rollout_risk":
        return rows.filter(
          (row) => row.rolloutHold || row.blockedGateCount > 0,
        );
      case "expiry_feeds":
        return [];
      case "all":
      default:
        return rows;
    }
  }, [filter, rows]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / CLIENT_PAGE_SIZE),
  );

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(
    () =>
      filteredRows.slice(
        (page - 1) * CLIENT_PAGE_SIZE,
        page * CLIENT_PAGE_SIZE,
      ),
    [filteredRows, page],
  );

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedTenantId(null);
      return;
    }

    if (
      !selectedTenantId ||
      !filteredRows.some((row) => row.tenantId === selectedTenantId)
    ) {
      setSelectedTenantId(filteredRows[0]!.tenantId);
    }
  }, [filteredRows, selectedTenantId]);

  const selectedTenant =
    filteredRows.find((row) => row.tenantId === selectedTenantId) ?? null;

  const rowsForTable = pagedRows.map((row) => ({
    ...row,
    _selected: row.tenantId === selectedTenantId,
  }));

  const aggregates = useMemo(() => {
    const totalPendingApprovals = rows.reduce(
      (sum, row) => sum + row.pendingApprovalCount,
      0,
    );
    const quotaCriticalCount = rows.filter(
      (row) => row.monthlyQuotaPercentUsed >= 95,
    ).length;
    const quotaWatchCount = rows.filter(
      (row) => row.monthlyQuotaPercentUsed >= 80,
    ).length;
    const costCenterAttentionCount = rows.filter(
      (row) => row.costCenterState !== "healthy",
    ).length;
    const agedBacklogTenants = rows.filter((row) => row.hasAgedBacklog).length;
    const approverGapTenants = rows.filter((row) => row.hasApproverGap).length;
    const rollbackHoldCount = rows.filter((row) => row.rolloutHold).length;
    const blockedGateCount = rows.filter(
      (row) => row.blockedGateCount > 0,
    ).length;
    const riskSignalCount = rows.reduce(
      (sum, row) => sum + row.governanceRiskCount,
      0,
    );
    const zeroBacklogCount = rows.filter(
      (row) => row.pendingApprovalCount === 0,
    ).length;

    return {
      totalPendingApprovals,
      quotaCriticalCount,
      quotaWatchCount,
      costCenterAttentionCount,
      agedBacklogTenants,
      approverGapTenants,
      rollbackHoldCount,
      blockedGateCount,
      riskSignalCount,
      zeroBacklogCount,
    };
  }, [rows]);

  const resolvedEmptyReason = useMemo<EmptyReason | null>(() => {
    if (previewEmptyReason) {
      return previewEmptyReason;
    }
    if (error && rows.length === 0) {
      return classifyErrorReason(error);
    }
    if (rows.length === 0) {
      return "no_data";
    }
    if (filteredRows.length === 0) {
      return filter === "expiry_feeds" ? "not_provisioned" : "filtered_empty";
    }
    return null;
  }, [error, filter, filteredRows.length, previewEmptyReason, rows.length]);

  const emptyStateAction = useMemo<GovernanceAction | null>(() => {
    switch (resolvedEmptyReason) {
      case "fetch_failed":
      case "external_unavailable":
        return {
          descriptor: buildDescriptor("refresh_dashboard", true, "low"),
          label: copy.refresh,
          onClick: () => void loadDashboard("refresh"),
        };
      case "filtered_empty":
        return {
          descriptor: buildDescriptor("clear_filter", true, "low"),
          label: copy.clearFilter,
          onClick: () => setFilter("all"),
        };
      case "no_data":
      case "not_provisioned":
        return {
          descriptor: buildDescriptor("open_tenant_list", true, "low"),
          label: copy.openTenant,
          href: "/tenants",
        };
      default:
        return null;
    }
  }, [
    copy.clearFilter,
    copy.openTenant,
    copy.refresh,
    loadDashboard,
    resolvedEmptyReason,
  ]);

  const tableColumns = useMemo<CanvasTableColumn<GovernanceRowView>[]>(
    () => [
      {
        h: copy.table.tenant,
        w: 250,
        r: (row) => (
          <div style={stackedValueStyle}>
            <button
              type="button"
              onClick={() => setSelectedTenantId(row.tenantId)}
              style={{
                background: "transparent",
                border: 0,
                padding: 0,
                color: th.text,
                textAlign: "left",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: th.fontFamily,
              }}
            >
              {row.tenantName}
            </button>
            <span style={monoSubtleStyle}>
              {row.tenantCode} · {row.tenantId}
            </span>
          </div>
        ),
      },
      {
        h: copy.table.rollout,
        w: 170,
        r: (row) => (
          <div style={stackedValueStyle}>
            <CanvasPill
              theme={th}
              tone={toCanvasTone(tenantStageTone(row.tenantRolloutStage))}
              dot
            >
              {copy.states.stage}:{" "}
              {formatPlatformCodeLabel(language, row.tenantRolloutStage)}
            </CanvasPill>
            <CanvasPill
              theme={th}
              tone={toCanvasTone(tenantStatusTone(row.tenantStatus))}
              dot
            >
              {copy.states.status}:{" "}
              {formatPlatformCodeLabel(language, row.tenantStatus)}
            </CanvasPill>
            {row.highestGateStatus ? (
              <CanvasPill
                theme={th}
                tone={toCanvasTone(tenantStageTone(row.highestGateStatus))}
              >
                {copy.states.gate}:{" "}
                {formatPlatformCodeLabel(language, row.highestGateStatus)}
              </CanvasPill>
            ) : null}
          </div>
        ),
      },
      {
        h: copy.table.costCenters,
        w: 170,
        r: (row) => (
          <div style={stackedValueStyle}>
            <span style={{ fontWeight: 600 }}>
              {formatNumber(language, row.costCenterCount)}
            </span>
            <span style={secondaryTextStyle}>
              {language === "en"
                ? row.costCenterState === "missing"
                  ? "No cost centers linked"
                  : row.costCenterState === "limited"
                    ? "Coverage is thin or rules are sparse"
                    : "Coverage is healthy"
                : row.costCenterState === "missing"
                  ? "尚未連結任何 cost center"
                  : row.costCenterState === "limited"
                    ? "覆蓋或規則仍偏薄"
                    : "覆蓋狀態健康"}
            </span>
          </div>
        ),
      },
      {
        h: copy.table.approvals,
        w: 180,
        r: (row) => (
          <div style={stackedValueStyle}>
            <span style={{ fontWeight: 600 }}>
              {formatNumber(language, row.pendingApprovalCount)}
            </span>
            <span style={secondaryTextStyle}>
              {language === "en" ? "Oldest" : "最舊"} ·{" "}
              {formatAge(language, row.oldestPendingApprovalAgeHours)}
            </span>
            {row.approvalSignals.length > 0 ? (
              <span style={monoSubtleStyle}>
                {row.approvalSignals.join(" · ")}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        h: copy.table.quota,
        w: 190,
        r: (row) => renderQuotaMeter(language, row.monthlyQuotaPercentUsed),
      },
      {
        h: copy.table.risks,
        w: 240,
        r: (row) => renderRiskLabels(language, row),
      },
      {
        h: copy.table.actions,
        w: 220,
        r: (row) => (
          <div style={actionRowStyle}>
            {row.visibleActions.map((action) => (
              <React.Fragment key={action.descriptor.action}>
                {renderAction({
                  action,
                  locale: language,
                  origins,
                  compact: true,
                  active:
                    action.descriptor.action === "focus_row" &&
                    row.tenantId === selectedTenantId,
                })}
              </React.Fragment>
            ))}
          </div>
        ),
      },
    ],
    [copy, language, origins, selectedTenantId],
  );

  const emptyStateCard = useMemo(() => {
    if (!resolvedEmptyReason) {
      return null;
    }

    const stateMap: Record<
      EmptyReason,
      {
        tone: Exclude<CanvasTone, "neutral">;
        icon: ReactNode;
        title: string;
        body: string;
        code: string;
      }
    > = {
      no_data: {
        tone: "info",
        icon: <Building2 size={16} />,
        title:
          language === "en"
            ? "No tenants are publishing governance data yet"
            : "目前還沒有 tenant 發布治理資料",
        body:
          language === "en"
            ? "The cross-tenant dashboard is wired, but there are no governance rows to aggregate yet."
            : "跨租戶 dashboard 已經接上，但目前還沒有可供彙總的治理列。",
        code: "empty.no_data",
      },
      not_provisioned: {
        tone: "warn",
        icon: <DatabaseZap size={16} />,
        title:
          language === "en"
            ? "Required source feed is not provisioned"
            : "必要來源 feed 尚未 provision",
        body:
          language === "en"
            ? "This view keeps the missing source explicit instead of faking zeroes for unavailable expiry data."
            : "這個畫面會明確標示缺失來源，而不是把尚未接上的到期資料假裝成 0。",
        code: "empty.not_provisioned",
      },
      fetch_failed: {
        tone: "danger",
        icon: <AlertTriangle size={16} />,
        title:
          language === "en"
            ? "Unable to load governance snapshot"
            : "無法載入治理快照",
        body:
          language === "en"
            ? "The control-plane fetch failed before any usable snapshot was cached."
            : "控制平面抓取失敗，而且還沒有可回退的成功快照。",
        code: "empty.fetch_failed",
      },
      permission_denied: {
        tone: "danger",
        icon: <ShieldOff size={16} />,
        title:
          language === "en"
            ? "You can reach the page shell but not the governance data"
            : "目前只可到達頁面 shell，無法讀取治理資料",
        body:
          language === "en"
            ? "The dashboard preserves the distinction between route access and data authority."
            : "這裡保留 route 可達與資料讀取權限之間的差異，不把它混成 generic error。",
        code: "empty.permission_denied",
      },
      external_unavailable: {
        tone: "warn",
        icon: <BadgeAlert size={16} />,
        title:
          language === "en"
            ? "An upstream dependency is unavailable"
            : "上游相依服務暫時不可用",
        body:
          language === "en"
            ? "The dashboard cannot complete a full read because one of the dependent systems is unavailable."
            : "這張 dashboard 無法完成完整讀取，因為其中一個相依系統暫時不可用。",
        code: "empty.external_unavailable",
      },
      filtered_empty: {
        tone: "info",
        icon: <FilterX size={16} />,
        title:
          language === "en"
            ? "No tenants match the current governance focus"
            : "目前沒有 tenant 符合這個治理焦點",
        body:
          language === "en"
            ? "The empty state is specific to the active filter, not to the dashboard as a whole."
            : "這是當前 filter 的空狀態，不代表整個 dashboard 沒有資料。",
        code: "empty.filtered_empty",
      },
      driver_not_eligible: {
        tone: "info",
        icon: <CircleOff size={16} />,
        title: "",
        body: "",
        code: "",
      },
    };

    const state = stateMap[resolvedEmptyReason];

    return (
      <CanvasCard theme={th} title={copy.emptyTitle}>
        <div style={{ display: "grid", gap: 12 }}>
          <CanvasBanner
            theme={th}
            tone={state.tone}
            icon={state.icon}
            title={state.title}
            body={state.body}
          />
          <div style={monoSubtleStyle}>{state.code}</div>
          {emptyStateAction ? (
            <div style={actionRowStyle}>
              {renderAction({
                action: emptyStateAction,
                locale: language,
                origins,
              })}
            </div>
          ) : null}
        </div>
      </CanvasCard>
    );
  }, [
    copy.emptyTitle,
    emptyStateAction,
    language,
    origins,
    resolvedEmptyReason,
  ]);

  if (loading && !snapshot) {
    return <div style={loadingStateStyle}>{copy.loading}</div>;
  }

  return (
    <div style={pageRootStyle}>
      <CanvasPageHeader
        theme={th}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <CanvasPill theme={th} tone="info">
              T4 · 30s
            </CanvasPill>
            {refreshMeta ? (
              <CanvasPill
                theme={th}
                tone={freshnessTone(refreshMeta.dataFreshness)}
                dot
              >
                {copy.source}: {refreshMeta.dataFreshness}
              </CanvasPill>
            ) : null}
            <CanvasBtn
              theme={th}
              variant="secondary"
              onClick={() => void loadDashboard("refresh")}
              disabled={refreshing}
              icon={<RefreshCw size={13} />}
            >
              {copy.refresh}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={toolbarRowStyle}>
          <CanvasPill theme={th} tone="neutral">
            {copy.refreshTier}: T4 / {REFRESH_TIER}
          </CanvasPill>
          {refreshMeta ? (
            <>
              <CanvasPill
                theme={th}
                tone={freshnessTone(refreshMeta.dataFreshness)}
              >
                {copy.snapshot}:{" "}
                {formatDateTime(language, refreshMeta.generatedAt)}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                {copy.source}: {refreshMeta.source}
              </CanvasPill>
            </>
          ) : null}
          <span style={{ flex: 1 }} />
          <span style={monoSubtleStyle}>
            {copy.resultSummary(rows.length, filteredRows.length)}
          </span>
        </div>

        {refreshMeta?.dataFreshness === "stale" ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon={<AlertTriangle size={15} />}
            title={copy.staleBannerTitle}
            body={copy.staleBannerBody}
          />
        ) : null}

        {refreshMeta?.dataFreshness === "degraded" ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon={<ShieldAlert size={15} />}
            title={copy.degradedBannerTitle}
            body={error ?? copy.degradedBannerBody}
          />
        ) : null}

        {snapshot &&
        snapshot.summary.pageInfo.totalItems > snapshot.summary.items.length ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon={<BadgeAlert size={15} />}
            title={copy.truncationTitle}
            body={copy.truncationBody(
              snapshot.summary.items.length,
              snapshot.summary.pageInfo.totalItems,
            )}
          />
        ) : null}

        {error && rows.length === 0 && resolvedEmptyReason === null ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon={<AlertTriangle size={15} />}
            title={copy.degradedBannerTitle}
            body={error}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label={copy.aggregate.quota}
            value={formatNumber(language, aggregates.quotaWatchCount)}
            delta={
              aggregates.quotaCriticalCount > 0
                ? language === "en"
                  ? `${aggregates.quotaCriticalCount} critical`
                  : `${aggregates.quotaCriticalCount} 高風險`
                : undefined
            }
            deltaTone={aggregates.quotaCriticalCount > 0 ? "down" : "neutral"}
            sub={
              language === "en"
                ? "Tenants at or above 80% monthly burn"
                : "月度燃燒率達 80% 以上的 tenant"
            }
          />
          <CanvasKPI
            theme={th}
            label={copy.aggregate.backlog}
            value={formatNumber(language, aggregates.totalPendingApprovals)}
            delta={
              aggregates.agedBacklogTenants > 0
                ? language === "en"
                  ? `${aggregates.agedBacklogTenants} aged`
                  : `${aggregates.agedBacklogTenants} 戶逾時`
                : undefined
            }
            deltaTone={aggregates.agedBacklogTenants > 0 ? "down" : "neutral"}
            sub={
              language === "en"
                ? "Cross-tenant queue depth"
                : "跨租戶待審總深度"
            }
          />
          <CanvasKPI
            theme={th}
            label={copy.aggregate.costCenters}
            value={formatNumber(language, aggregates.costCenterAttentionCount)}
            delta={
              language === "en"
                ? `${formatNumber(language, rows.length - aggregates.costCenterAttentionCount)} healthy`
                : `${formatNumber(language, rows.length - aggregates.costCenterAttentionCount)} 戶健康`
            }
            deltaTone={aggregates.costCenterAttentionCount > 0 ? "down" : "up"}
            sub={
              language === "en"
                ? "Cost-center or rule coverage needs review"
                : "Cost-center 或 rule 覆蓋需要複核"
            }
          />
          <CanvasKPI
            theme={th}
            label={copy.aggregate.risks}
            value={formatNumber(language, aggregates.riskSignalCount)}
            delta={
              language === "en"
                ? `${aggregates.rollbackHoldCount} hold · ${aggregates.blockedGateCount} blocked`
                : `${aggregates.rollbackHoldCount} 戶 hold · ${aggregates.blockedGateCount} 戶 blocked`
            }
            deltaTone={
              aggregates.rollbackHoldCount + aggregates.blockedGateCount > 0
                ? "down"
                : "neutral"
            }
            sub={
              language === "en"
                ? "Active governance signals across the fleet"
                : "目前全域治理訊號總量"
            }
          />
        </div>

        <div style={topGridStyle}>
          <CanvasCard
            theme={th}
            title={copy.filterTitle}
            subtitle={copy.filterSubtitle}
          >
            <div style={{ display: "grid", gap: 12 }}>
              <div style={actionRowStyle}>
                {(Object.keys(filterActions) as GovernanceFilter[]).map(
                  (key) => (
                    <div key={key}>
                      {renderAction({
                        action: filterActions[key],
                        locale: language,
                        origins,
                        active: filter === key,
                      })}
                    </div>
                  ),
                )}
              </div>
              <div style={actionRowStyle}>
                {(Object.keys(filterStats) as GovernanceFilter[]).map((key) => (
                  <CanvasPill
                    key={`count-${key}`}
                    theme={th}
                    tone={filterTone(filter === key, filterStats[key])}
                    dot={key !== "all"}
                  >
                    {copy.filters[key]} ·{" "}
                    {formatNumber(language, filterStats[key])}
                  </CanvasPill>
                ))}
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={copy.backlogTitle}
            subtitle={copy.backlogSubtitle}
          >
            <div style={ruleListStyle}>
              {[
                {
                  key: copy.backlog.total,
                  value: formatNumber(
                    language,
                    aggregates.totalPendingApprovals,
                  ),
                  tone: riskSummaryTone(
                    aggregates.totalPendingApprovals > 0 ? 1 : 0,
                  ),
                  note:
                    language === "en"
                      ? "Absolute queue depth visible from the current read model."
                      : "從目前 read model 可直接看到的待審深度。",
                },
                {
                  key: copy.backlog.aged,
                  value: formatNumber(language, aggregates.agedBacklogTenants),
                  tone: riskSummaryTone(aggregates.agedBacklogTenants),
                  note:
                    language === "en"
                      ? "Rows carrying the `pending_approval_over_48h` signal."
                      : "帶有 `pending_approval_over_48h` 訊號的租戶。",
                },
                {
                  key: copy.backlog.approverGap,
                  value: formatNumber(language, aggregates.approverGapTenants),
                  tone: riskSummaryTone(aggregates.approverGapTenants),
                  note:
                    language === "en"
                      ? "Rows carrying the `no_approvers_configured` signal."
                      : "帶有 `no_approvers_configured` 訊號的租戶。",
                },
                {
                  key: copy.backlog.clear,
                  value: formatNumber(language, aggregates.zeroBacklogCount),
                  tone: "success" as const,
                  note:
                    language === "en"
                      ? "Tenants with zero pending approvals."
                      : "目前沒有待審項目的租戶。",
                },
              ].map((item) => (
                <div key={item.key} style={ruleRowStyle}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{item.key}</span>
                    <CanvasPill theme={th} tone={item.tone}>
                      {item.value}
                    </CanvasPill>
                  </div>
                  <div style={secondaryTextStyle}>{item.note}</div>
                </div>
              ))}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={copy.riskTitle}
            subtitle={copy.riskSubtitle}
          >
            <div style={ruleListStyle}>
              {[
                {
                  key: copy.register.rollbackHold,
                  value: formatNumber(language, aggregates.rollbackHoldCount),
                  tone: riskSummaryTone(aggregates.rollbackHoldCount),
                  note:
                    language === "en"
                      ? "Tenants currently held out of promotion or continued rollout."
                      : "目前被 hold、不能繼續 promote 或 rollout 的租戶。",
                },
                {
                  key: copy.register.blockedGates,
                  value: formatNumber(language, aggregates.blockedGateCount),
                  tone: riskSummaryTone(aggregates.blockedGateCount),
                  note:
                    language === "en"
                      ? "At least one rollout gate is blocked in the tenant lifecycle record."
                      : "租戶生命週期記錄中至少有一個 rollout gate 為 blocked。",
                },
                {
                  key: copy.register.credentialFeed,
                  value: language === "en" ? "Gap" : "Gap",
                  tone: "warn" as const,
                  note:
                    language === "en"
                      ? "Expiry feed is intentionally surfaced as not provisioned rather than hidden."
                      : "到期 feed 目前刻意標成 not provisioned，而不是直接隱藏。",
                },
                {
                  key: copy.register.contractFeed,
                  value: language === "en" ? "Gap" : "Gap",
                  tone: "warn" as const,
                  note:
                    language === "en"
                      ? "Contract expiry remains an explicit read-model gap in this slice."
                      : "Contract 到期目前仍是這個 slice 的明確 read-model 缺口。",
                },
              ].map((item) => (
                <div key={item.key} style={ruleRowStyle}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{item.key}</span>
                    <CanvasPill theme={th} tone={item.tone}>
                      {item.value}
                    </CanvasPill>
                  </div>
                  <div style={secondaryTextStyle}>{item.note}</div>
                </div>
              ))}
            </div>
          </CanvasCard>
        </div>

        {emptyStateCard}

        {resolvedEmptyReason === null ? (
          <>
            <CanvasCard
              theme={th}
              title={copy.tableTitle}
              subtitle={copy.tableSubtitle}
              actions={
                <CanvasPill theme={th} tone="neutral">
                  {copy.pageSummary(page, totalPages, pagedRows.length)}
                </CanvasPill>
              }
            >
              <CanvasTable
                theme={th}
                columns={tableColumns}
                rows={rowsForTable}
              />
              <div style={{ ...toolbarRowStyle, marginTop: 14 }}>
                <span style={secondaryTextStyle}>
                  {copy.pageSummary(page, totalPages, pagedRows.length)}
                </span>
                <span style={{ flex: 1 }} />
                <CanvasBtn
                  theme={th}
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {copy.previous}
                </CanvasBtn>
                <CanvasBtn
                  theme={th}
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  {copy.next}
                </CanvasBtn>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title={
                selectedTenant
                  ? `${copy.detailTitle} · ${selectedTenant.tenantName}`
                  : copy.detailTitle
              }
              subtitle={copy.detailSubtitle}
            >
              {selectedTenant ? (
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={detailGridStyle}>
                    <div style={detailMetricStyle}>
                      <div style={monoSubtleStyle}>
                        {copy.detail.headers.overview}
                      </div>
                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        <CanvasPill
                          theme={th}
                          tone={toCanvasTone(
                            tenantStageTone(selectedTenant.tenantRolloutStage),
                          )}
                          dot
                        >
                          {copy.states.stage}:{" "}
                          {formatPlatformCodeLabel(
                            language,
                            selectedTenant.tenantRolloutStage,
                          )}
                        </CanvasPill>
                        <CanvasPill
                          theme={th}
                          tone={toCanvasTone(
                            tenantStatusTone(selectedTenant.tenantStatus),
                          )}
                          dot
                        >
                          {copy.states.status}:{" "}
                          {formatPlatformCodeLabel(
                            language,
                            selectedTenant.tenantStatus,
                          )}
                        </CanvasPill>
                        {selectedTenant.highestGateStatus ? (
                          <CanvasPill
                            theme={th}
                            tone={toCanvasTone(
                              tenantStageTone(selectedTenant.highestGateStatus),
                            )}
                          >
                            {copy.states.gate}:{" "}
                            {formatPlatformCodeLabel(
                              language,
                              selectedTenant.highestGateStatus,
                            )}
                          </CanvasPill>
                        ) : null}
                      </div>
                      <div style={secondaryTextStyle}>
                        {copy.states.modules}:{" "}
                        {formatNumber(
                          language,
                          selectedTenant.tenantRecord?.enabledModules.length ??
                            0,
                        )}{" "}
                        · {copy.states.integration}:{" "}
                        {selectedTenant.tenantRecord
                          ? formatPlatformCodeLabel(
                              language,
                              selectedTenant.tenantRecord.integrationPackage
                                .mode,
                            )
                          : "—"}
                      </div>
                    </div>

                    <div style={detailMetricStyle}>
                      <div style={monoSubtleStyle}>
                        {copy.detail.headers.signals}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {formatNumber(
                          language,
                          selectedTenant.governanceRiskCount,
                        )}
                      </div>
                      <div style={secondaryTextStyle}>
                        {selectedTenant.governanceRiskLabels.length > 0
                          ? selectedTenant.governanceRiskLabels.join(" · ")
                          : copy.detail.healthy}
                      </div>
                    </div>
                  </div>

                  <div style={detailGridStyle}>
                    <div style={detailMetricStyle}>
                      <div style={monoSubtleStyle}>{copy.detail.quota}</div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {formatPercent(
                          language,
                          selectedTenant.monthlyQuotaPercentUsed,
                        )}
                      </div>
                      {renderQuotaMeter(
                        language,
                        selectedTenant.monthlyQuotaPercentUsed,
                      )}
                    </div>
                    <div style={detailMetricStyle}>
                      <div style={monoSubtleStyle}>{copy.detail.approvals}</div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {formatNumber(
                          language,
                          selectedTenant.pendingApprovalCount,
                        )}
                      </div>
                      <div style={secondaryTextStyle}>
                        {formatAge(
                          language,
                          selectedTenant.oldestPendingApprovalAgeHours,
                        )}
                      </div>
                    </div>
                    <div style={detailMetricStyle}>
                      <div style={monoSubtleStyle}>
                        {copy.detail.costCenters}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {formatNumber(language, selectedTenant.costCenterCount)}
                      </div>
                      <div style={secondaryTextStyle}>
                        {selectedTenant.costCenterState === "missing"
                          ? language === "en"
                            ? "No cost centers linked"
                            : "尚未連結 cost center"
                          : selectedTenant.costCenterState === "limited"
                            ? language === "en"
                              ? "Coverage needs attention"
                              : "覆蓋仍需注意"
                            : copy.detail.healthy}
                      </div>
                    </div>
                    <div style={detailMetricStyle}>
                      <div style={monoSubtleStyle}>{copy.detail.rules}</div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {formatNumber(language, selectedTenant.activeRuleCount)}
                      </div>
                      <div style={secondaryTextStyle}>
                        {selectedTenant.activeRuleCount > 0
                          ? language === "en"
                            ? "Active governance rules present"
                            : "目前已有 active governance rules"
                          : language === "en"
                            ? "No active governance rules"
                            : "目前沒有 active governance rule"}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={monoSubtleStyle}>
                      {copy.detail.headers.actions}
                    </div>
                    <div style={actionRowStyle}>
                      {selectedTenant.detailActions.map((action) => (
                        <React.Fragment key={action.descriptor.action}>
                          {renderAction({
                            action,
                            locale: language,
                            origins,
                            showReason: true,
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                    <div style={secondaryTextStyle}>{copy.selectedHint}</div>
                  </div>
                </div>
              ) : (
                <div style={secondaryTextStyle}>{copy.noSelection}</div>
              )}
            </CanvasCard>
          </>
        ) : null}
      </div>
    </div>
  );
}
