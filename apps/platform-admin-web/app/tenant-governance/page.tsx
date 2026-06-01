"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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

const CLIENT_PAGE_SIZE = 8;
const SUMMARY_FETCH_SIZE = 500;
const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_INTERVAL_MS = 30_000;

const theme = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

type LocalizedLocale = "en" | "zh";
type SupportedFreshness = UiRefreshMetadata["dataFreshness"];
type GovernanceFilter =
  | "all"
  | "quota_pressure"
  | "approval_backlog"
  | "cost_center_attention"
  | "rollout_risk"
  | "expiry_feeds";

type DashboardSnapshot = {
  summary: PlatformTenantGovernanceSummaryResponse;
  tenants: PlatformAdminTenantRecord[];
};

type GovernanceAction = {
  descriptor: ResourceActionDescriptor;
  label: string;
  href?: string | undefined;
  crossApp?: CrossAppResourceLink | undefined;
  onClick?: (() => void) | undefined;
};

type GovernanceRow = Record<string, unknown> &
  PlatformTenantGovernanceSummaryRow & {
    tenantRecord: PlatformAdminTenantRecord | null;
    highestGateStatus: PlatformTenantGateStatus | null;
    blockedGateCount: number;
    rolloutHold: boolean;
    quotaTone: CanvasTone;
    quotaLabel: string;
    costCenterTone: CanvasTone;
    costCenterLabel: string;
    approvalLabels: string[];
    riskLabels: string[];
    actions: GovernanceAction[];
    detailActions: GovernanceAction[];
    riskScore: number;
  };

const pageRootStyle = {
  minHeight: "100%",
  background: theme.bg,
  color: theme.text,
  borderRadius: 12,
  overflow: "hidden",
  fontFamily: theme.fontFamily,
} satisfies CSSProperties;

const loadingStyle = {
  padding: 24,
  borderRadius: 12,
  background: theme.bg,
  color: theme.textMuted,
  fontFamily: theme.fontFamily,
} satisfies CSSProperties;

const pageBodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const toolbarStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const panelGridStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const supportGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  alignItems: "start",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const metricGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const metricCardStyle = {
  display: "grid",
  gap: 6,
  padding: 12,
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
} satisfies CSSProperties;

const listStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const listRowStyle = {
  display: "grid",
  gap: 6,
  paddingBottom: 10,
  borderBottom: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const sectionLabelStyle = {
  fontSize: 10.5,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: theme.textDim,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const secondaryTextStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.45,
} satisfies CSSProperties;

const monoTextStyle = {
  fontSize: 10.5,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
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

function toCanvasTone(value: string): CanvasTone {
  if (value === "warning") {
    return "warn";
  }
  if (
    value === "success" ||
    value === "warn" ||
    value === "danger" ||
    value === "info" ||
    value === "accent" ||
    value === "neutral"
  ) {
    return value;
  }
  return "neutral";
}

function freshnessTone(freshness: SupportedFreshness): CanvasTone {
  switch (freshness) {
    case "degraded":
      return "danger";
    case "stale":
      return "warn";
    case "fresh":
      return "success";
    default:
      return "neutral";
  }
}

function quotaTone(percent: number): CanvasTone {
  if (percent >= 95) {
    return "danger";
  }
  if (percent >= 80) {
    return "warn";
  }
  return "success";
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

function parseFreshness(value: string | null): SupportedFreshness | null {
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
    normalized.includes("missing feed")
  ) {
    return "not_provisioned";
  }
  if (
    normalized.includes("external") ||
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

function mergeActionDescriptor(
  descriptor: ResourceActionDescriptor | undefined,
  overrides?: {
    enabled?: boolean;
    disabledReasonCode?: string;
  },
): ResourceActionDescriptor {
  const merged: ResourceActionDescriptor = {
    action: descriptor?.action ?? "unknown",
    enabled: overrides?.enabled ?? descriptor?.enabled ?? false,
    riskLevel: descriptor?.riskLevel ?? "low",
  };

  const requiresReason = descriptor?.requiresReason;
  if (requiresReason !== undefined) {
    merged.requiresReason = requiresReason;
  }

  const disabledReasonCode =
    overrides?.disabledReasonCode ?? descriptor?.disabledReasonCode;
  if (disabledReasonCode !== undefined) {
    merged.disabledReasonCode = disabledReasonCode;
  }

  return merged;
}

function disabledReasonLabel(locale: LocalizedLocale, code?: string) {
  if (!code) {
    return null;
  }

  const labels: Record<string, { en: string; zh: string }> = {
    cross_app_origin_missing: {
      en: "Cross-app origin is not configured.",
      zh: "這個環境尚未配置 cross-app origin。",
    },
    no_pending_approvals: {
      en: "No pending approvals for this tenant.",
      zh: "這個 tenant 目前沒有待審項目。",
    },
    no_matching_signals: {
      en: "There are no tenants in this signal cluster.",
      zh: "目前沒有 tenant 落在這個訊號群組。",
    },
    feed_not_provisioned: {
      en: "The expiry feed is not provisioned yet.",
      zh: "到期 feed 尚未 provision。",
    },
  };

  const label = labels[code];
  if (!label) {
    return code;
  }
  return locale === "en" ? label.en : label.zh;
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

function actionStyle({
  active = false,
  disabled = false,
  compact = false,
}: {
  active?: boolean | undefined;
  disabled?: boolean | undefined;
  compact?: boolean | undefined;
}): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: compact ? 26 : 30,
    padding: compact ? "5px 8px" : "6px 10px",
    borderRadius: 8,
    border: `1px solid ${active ? theme.accentBorder : theme.border}`,
    background: active
      ? theme.accentBg
      : disabled
        ? theme.surfaceLo
        : theme.surface,
    color: active ? theme.accent : disabled ? theme.textDim : theme.text,
    fontSize: compact ? 11.5 : 12,
    fontWeight: 600,
    lineHeight: 1,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.58 : 1,
  };
}

function renderAction(
  locale: LocalizedLocale,
  origins: ReturnType<typeof resolveAppOrigins>,
  action: GovernanceAction,
  options?: {
    active?: boolean;
    compact?: boolean;
    showReason?: boolean;
  },
) {
  const reason = disabledReasonLabel(
    locale,
    action.descriptor.disabledReasonCode,
  );
  const href = action.crossApp
    ? buildCrossAppHref(origins, action.crossApp)
    : (action.href ?? null);
  const external =
    action.crossApp?.targetApp &&
    action.crossApp.targetApp !== "platform-admin";
  const content = (
    <>
      <span>{action.label}</span>
      {external && action.descriptor.enabled ? (
        <ArrowUpRight size={12} />
      ) : null}
    </>
  );

  if (!action.descriptor.enabled || (!href && !action.onClick)) {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <button
          type="button"
          disabled
          title={reason ?? undefined}
          style={actionStyle({
            active: options?.active,
            disabled: true,
            compact: options?.compact,
          })}
        >
          {content}
        </button>
        {options?.showReason && reason ? (
          <div style={monoTextStyle}>{reason}</div>
        ) : null}
      </div>
    );
  }

  if (action.onClick) {
    return (
      <button
        type="button"
        onClick={action.onClick}
        style={actionStyle({
          active: options?.active,
          compact: options?.compact,
        })}
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
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        style={actionStyle({
          active: options?.active,
          compact: options?.compact,
        })}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={href}
      style={actionStyle({
        active: options?.active,
        compact: options?.compact,
      })}
    >
      {content}
    </Link>
  );
}

function quotaMeter(locale: LocalizedLocale, percent: number) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const tone = quotaTone(percent);
  const color =
    tone === "danger"
      ? theme.danger
      : tone === "warn"
        ? theme.warn
        : theme.success;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: theme.surfaceLo,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            borderRadius: 999,
            background: color,
          }}
        />
      </div>
      <span style={monoTextStyle}>{formatPercent(locale, percent)}</span>
    </div>
  );
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
      default:
        return "Backlog > 48h";
    }
  }
  switch (flag) {
    case "no_approvers_configured":
      return "未配置 approver";
    case "quota_above_95_percent":
      return "Quota > 95%";
    default:
      return "待審逾 48h";
  }
}

function emptyStateContent(reason: EmptyReason, locale: LocalizedLocale) {
  const map: Record<
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
        locale === "en"
          ? "No tenants are publishing governance data yet"
          : "目前還沒有 tenant 發布治理資料",
      body:
        locale === "en"
          ? "The dashboard is ready, but there are no governance rows to aggregate yet."
          : "看板已接好，但目前還沒有可彙總的治理列。",
      code: "empty.no_data",
    },
    not_provisioned: {
      tone: "warn",
      icon: <DatabaseZap size={16} />,
      title:
        locale === "en"
          ? "Required source feed is not provisioned"
          : "必要來源 feed 尚未 provision",
      body:
        locale === "en"
          ? "Missing expiry data stays explicit instead of being flattened into zero."
          : "缺失的到期資料會被明確顯示，不會被假裝成 0。",
      code: "empty.not_provisioned",
    },
    fetch_failed: {
      tone: "danger",
      icon: <AlertTriangle size={16} />,
      title:
        locale === "en"
          ? "Unable to load governance snapshot"
          : "無法載入治理快照",
      body:
        locale === "en"
          ? "The initial control-plane fetch failed before any usable snapshot was cached."
          : "初次抓取失敗，而且還沒有可回退的成功快照。",
      code: "empty.fetch_failed",
    },
    permission_denied: {
      tone: "danger",
      icon: <ShieldOff size={16} />,
      title:
        locale === "en"
          ? "You can reach the shell but not the governance data"
          : "目前只可到達頁面 shell，無法讀取治理資料",
      body:
        locale === "en"
          ? "The dashboard preserves route access separately from data authority."
          : "這裡保留 route 可達與資料讀取權限的差異。",
      code: "empty.permission_denied",
    },
    external_unavailable: {
      tone: "warn",
      icon: <BadgeAlert size={16} />,
      title:
        locale === "en"
          ? "An upstream dependency is unavailable"
          : "上游相依服務暫時不可用",
      body:
        locale === "en"
          ? "One of the systems needed to build a complete read is unavailable."
          : "組出完整讀取所需的其中一個相依系統目前不可用。",
      code: "empty.external_unavailable",
    },
    filtered_empty: {
      tone: "info",
      icon: <FilterX size={16} />,
      title:
        locale === "en"
          ? "No tenants match the current governance focus"
          : "目前沒有 tenant 符合這個治理焦點",
      body:
        locale === "en"
          ? "This empty state belongs to the active filter, not to the dashboard overall."
          : "這是當前 filter 的空狀態，不代表整個 dashboard 沒資料。",
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

  return map[reason];
}

export default function TenantGovernancePage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const language: LocalizedLocale = locale === "en" ? "en" : "zh";
  const previewEmptyReason = parseEmptyReason(searchParams.get("emptyReason"));
  const previewFreshness = parseFreshness(searchParams.get("freshness"));

  const [origins, setOrigins] = useState<ReturnType<typeof resolveAppOrigins>>({
    "platform-admin": "",
    "ops-console": "",
    "tenant-console": "",
  });
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshnessTick, setFreshnessTick] = useState(Date.now());
  const [filter, setFilter] = useState<GovernanceFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const copy =
    language === "en"
      ? {
          title: "Cross-tenant Governance",
          subtitle:
            "Quota usage, approval backlog, cost-center health, and governance risk on one platform-owned dashboard.",
          refresh: "Refresh now",
          focus: "Focus",
          openTenant: "Tenant detail",
          openPayments: "Payments",
          openAudit: "Audit",
          openCostCenters: "Tenant Console · Cost centers",
          openRules: "Tenant Console · Rules",
          openOps: "Ops Console · Dispatch",
          heatmapTitle: "Quota usage heat map",
          heatmapSubtitle: "Top 8 tenants by governance pressure this month.",
          selectedTitle: "Tenant governance rail",
          selectedSubtitle:
            "Drill targets stay explicit across platform-admin, tenant-console, and ops-console.",
          filtersTitle: "Governance focus lanes",
          filtersSubtitle:
            "Filters, row actions, and drill CTAs are rendered from action descriptors.",
          backlogTitle: "Approval backlog",
          backlogSubtitle:
            "Cross-tenant queue pressure visible in this read model.",
          riskTitle: "Governance risk register",
          riskSubtitle:
            "Rollout risk is live; expiry feeds remain explicit gaps.",
          emptyTitle: "No governance rows to display",
          clearFilter: "Clear filter",
          previous: "Previous",
          next: "Next",
          refreshTier: "Refresh tier",
          snapshot: "Snapshot",
          source: "Source",
          pageSummary: (current: number, total: number, rows: number) =>
            `Page ${current} of ${total} · ${rows} row(s)`,
          resultSummary: (total: number, filtered: number) =>
            `${filtered} of ${total} tenant(s) match the current focus.`,
          staleBannerTitle: "Governance snapshot is stale",
          staleBannerBody:
            "The dashboard is past the T4 freshness window. Manual refresh remains available while the last good snapshot stays visible.",
          degradedBannerTitle: "Governance snapshot is degraded",
          degradedBannerBody:
            "A background refresh failed. The last successful snapshot is still visible.",
          truncationTitle: "Showing a partial snapshot",
          truncationBody: (items: number, total: number) =>
            `Loaded ${items} of ${total} governance rows. Increase the summary fetch size before using this for a full sweep.`,
          table: {
            tenant: "Tenant",
            plan: "Plan",
            usage: "Usage (MTD)",
            percent: "%",
            status: "Status",
            backlog: "Backlog",
            actions: "Available actions",
          },
          filters: {
            all: "All tenants",
            quota_pressure: "Quota pressure",
            approval_backlog: "Approval backlog",
            cost_center_attention: "Cost-center gaps",
            rollout_risk: "Rollout risk",
            expiry_feeds: "Expiry feeds",
          },
          kpi: {
            quota: "Quota warning (>80%)",
            backlog: "Cross-tenant approval backlog",
            cost: "Cost-center attention",
            risk: "Governance risk signals",
          },
        }
      : {
          title: "跨租戶治理",
          subtitle:
            "把 quota 使用、approval backlog、cost-center 健康與治理風險收斂到同一張平台治理看板。",
          refresh: "立即重新整理",
          focus: "聚焦",
          openTenant: "Tenant 詳情",
          openPayments: "Payments",
          openAudit: "Audit",
          openCostCenters: "Tenant Console · Cost centers",
          openRules: "Tenant Console · Rules",
          openOps: "Ops Console · Dispatch",
          heatmapTitle: "Quota 使用熱圖",
          heatmapSubtitle: "依治理壓力排序的 top 8 tenant。",
          selectedTitle: "租戶治理側欄",
          selectedSubtitle:
            "保留 platform-admin、tenant-console、ops-console 的完整 drill context。",
          filtersTitle: "治理聚焦路徑",
          filtersSubtitle:
            "Filter、列動作與 drill CTA 都由 action descriptor 渲染。",
          backlogTitle: "Approval backlog",
          backlogSubtitle: "目前 read model 可見的跨租戶待審壓力。",
          riskTitle: "治理風險登錄",
          riskSubtitle:
            "Rollout risk 是 live；expiry feeds 仍以明確 gap 呈現。",
          emptyTitle: "目前沒有可顯示的治理列",
          clearFilter: "清除篩選",
          previous: "上一頁",
          next: "下一頁",
          refreshTier: "Refresh tier",
          snapshot: "快照時間",
          source: "資料來源",
          pageSummary: (current: number, total: number, rows: number) =>
            `第 ${current} / ${total} 頁 · 顯示 ${rows} 筆`,
          resultSummary: (total: number, filtered: number) =>
            `目前有 ${filtered} / ${total} 個 tenant 符合治理焦點。`,
          staleBannerTitle: "治理快照已過時",
          staleBannerBody:
            "這個 dashboard 已超過 T4 freshness 視窗；目前保留最後一次成功快照，仍可手動 refresh。",
          degradedBannerTitle: "治理快照來源降級",
          degradedBannerBody: "背景 refresh 失敗，頁面保留最後一次成功快照。",
          truncationTitle: "目前只載入部分快照",
          truncationBody: (items: number, total: number) =>
            `目前只載入 ${items} / ${total} 筆治理資料；若要做全租戶 sweep，需先提高 summary fetch size。`,
          table: {
            tenant: "Tenant",
            plan: "Plan",
            usage: "Usage (MTD)",
            percent: "%",
            status: "Status",
            backlog: "Backlog",
            actions: "Available actions",
          },
          filters: {
            all: "全部租戶",
            quota_pressure: "Quota 壓力",
            approval_backlog: "Approval backlog",
            cost_center_attention: "Cost-center 缺口",
            rollout_risk: "Rollout 風險",
            expiry_feeds: "Expiry feeds",
          },
          kpi: {
            quota: "Quota 警戒 (>80%)",
            backlog: "跨租戶審批 backlog",
            cost: "Cost-center 異常",
            risk: "治理風險訊號",
          },
        };

  async function loadDashboard(mode: "initial" | "refresh") {
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
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setOrigins(resolveAppOrigins());
    void loadDashboard("initial");
    const refreshTimer = window.setInterval(() => {
      void loadDashboard("refresh");
    }, REFRESH_INTERVAL_MS);
    const freshnessTimer = window.setInterval(() => {
      setFreshnessTick(Date.now());
    }, 1_000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(freshnessTimer);
    };
  }, []);

  const refreshMeta = useMemo(() => {
    if (!snapshot) {
      return null;
    }
    const age =
      freshnessTick - new Date(snapshot.summary.refresh.generatedAt).getTime();
    const computedFreshness: SupportedFreshness =
      error && snapshot.summary.items.length > 0
        ? "degraded"
        : age > snapshot.summary.refresh.staleAfterMs
          ? "stale"
          : snapshot.summary.refresh.dataFreshness;

    return {
      ...snapshot.summary.refresh,
      dataFreshness: previewFreshness ?? computedFreshness,
    };
  }, [error, freshnessTick, previewFreshness, snapshot]);

  const rows = useMemo<GovernanceRow[]>(() => {
    if (!snapshot) {
      return [];
    }

    const tenantMap = new Map(
      snapshot.tenants.map((tenant) => [tenant.id, tenant]),
    );
    const tenantConsoleMissing = !origins["tenant-console"];
    const opsMissing = !origins["ops-console"];

    return snapshot.summary.items
      .map((item) => {
        const tenantRecord = tenantMap.get(item.tenantId) ?? null;
        const actionMap = new Map<string, ResourceActionDescriptor>(
          item.availableActions.map((action) => [action.action, action]),
        );
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
        const quotaStatusTone = quotaTone(item.monthlyQuotaPercentUsed);
        const quotaLabel =
          quotaStatusTone === "danger"
            ? "over_threshold"
            : quotaStatusTone === "warn"
              ? "warning"
              : "ok";
        const costCenterStatusTone: CanvasTone =
          item.costCenterCount === 0
            ? "danger"
            : item.activeRuleCount === 0 || item.costCenterCount < 2
              ? "warn"
              : "success";
        const costCenterLabel =
          item.costCenterCount === 0
            ? language === "en"
              ? "missing"
              : "缺失"
            : item.activeRuleCount === 0 || item.costCenterCount < 2
              ? language === "en"
                ? "attention"
                : "注意"
              : language === "en"
                ? "healthy"
                : "健康";
        const approvalLabels = [
          item.pendingApprovalCount > 0
            ? language === "en"
              ? `${item.pendingApprovalCount} open`
              : `${item.pendingApprovalCount} 筆待審`
            : language === "en"
              ? "Clear"
              : "清空",
          item.oldestPendingApprovalAgeHours !== null
            ? language === "en"
              ? `Oldest ${item.oldestPendingApprovalAgeHours}h`
              : `最久 ${item.oldestPendingApprovalAgeHours}h`
            : null,
          ...item.alertFlags
            .filter((flag) => flag !== "quota_above_95_percent")
            .map((flag) => alertLabel(language, flag)),
        ].filter(Boolean) as string[];
        const riskLabels = [
          ...item.alertFlags.map((flag) => alertLabel(language, flag)),
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
        ].filter(Boolean) as string[];
        const detailActions: GovernanceAction[] = [
          {
            descriptor: mergeActionDescriptor(
              actionMap.get("open_tenant_detail"),
            ),
            label: copy.openTenant,
            href: `/tenants/${item.tenantId}`,
          },
          {
            descriptor: mergeActionDescriptor(
              actionMap.get("open_payments_queue"),
            ),
            label: copy.openPayments,
            href: `/payments?tenantId=${encodeURIComponent(item.tenantId)}`,
          },
          {
            descriptor: mergeActionDescriptor(actionMap.get("open_audit")),
            label: copy.openAudit,
            href: `/audit?resourceType=tenant&resourceId=${encodeURIComponent(item.tenantId)}`,
          },
          {
            descriptor: mergeActionDescriptor(
              actionMap.get("open_tenant_cost_centers"),
              tenantConsoleMissing
                ? {
                    enabled: false,
                    disabledReasonCode: "cross_app_origin_missing",
                  }
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
            descriptor: mergeActionDescriptor(
              actionMap.get("open_tenant_rules"),
              tenantConsoleMissing
                ? {
                    enabled: false,
                    disabledReasonCode: "cross_app_origin_missing",
                  }
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
        ];

        if (actionMap.has("open_ops_dispatch")) {
          detailActions.push({
            descriptor: mergeActionDescriptor(
              actionMap.get("open_ops_dispatch"),
              opsMissing
                ? {
                    enabled: false,
                    disabledReasonCode: "cross_app_origin_missing",
                  }
                : undefined,
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

        return {
          ...item,
          tenantRecord,
          highestGateStatus: highestGate,
          blockedGateCount,
          rolloutHold,
          quotaTone: quotaStatusTone,
          quotaLabel,
          costCenterTone: costCenterStatusTone,
          costCenterLabel,
          approvalLabels,
          riskLabels,
          riskScore:
            (quotaStatusTone === "danger"
              ? 2
              : quotaStatusTone === "warn"
                ? 1
                : 0) +
            blockedGateCount +
            (rolloutHold ? 2 : 0) +
            item.alertFlags.length,
          actions: [
            {
              descriptor: mergeActionDescriptor(actionMap.get("focus_row")),
              label: copy.focus,
              onClick: () => setSelectedTenantId(item.tenantId),
            },
            detailActions[0]!,
            detailActions[1]!,
          ],
          detailActions,
        };
      })
      .sort((left, right) => {
        if (right.riskScore !== left.riskScore) {
          return right.riskScore - left.riskScore;
        }
        return right.monthlyQuotaPercentUsed - left.monthlyQuotaPercentUsed;
      });
  }, [copy, language, origins, snapshot]);

  const filterActions = useMemo(() => {
    const counts = {
      all: rows.length,
      quota_pressure: rows.filter((row) => row.monthlyQuotaPercentUsed >= 80)
        .length,
      approval_backlog: rows.filter((row) => row.pendingApprovalCount > 0)
        .length,
      cost_center_attention: rows.filter(
        (row) => row.costCenterTone !== "success",
      ).length,
      rollout_risk: rows.filter(
        (row) => row.rolloutHold || row.blockedGateCount > 0,
      ).length,
      expiry_feeds: 0,
    } satisfies Record<GovernanceFilter, number>;

    const summaryActionMap = new Map<string, ResourceActionDescriptor>(
      (snapshot?.summary.availableActions ?? []).map((action) => [
        action.action,
        action,
      ]),
    );

    const buildFilterAction = (key: GovernanceFilter): GovernanceAction => ({
      descriptor: mergeActionDescriptor(summaryActionMap.get(`filter_${key}`)),
      label: copy.filters[key],
      onClick: () => setFilter(key),
    });

    return {
      counts,
      actions: {
        all: buildFilterAction("all"),
        quota_pressure: buildFilterAction("quota_pressure"),
        approval_backlog: buildFilterAction("approval_backlog"),
        cost_center_attention: buildFilterAction("cost_center_attention"),
        rollout_risk: buildFilterAction("rollout_risk"),
        expiry_feeds: buildFilterAction("expiry_feeds"),
      } satisfies Record<GovernanceFilter, GovernanceAction>,
    };
  }, [copy.filters, rows, snapshot]);

  const filteredRows = useMemo(() => {
    switch (filter) {
      case "quota_pressure":
        return rows.filter((row) => row.monthlyQuotaPercentUsed >= 80);
      case "approval_backlog":
        return rows.filter((row) => row.pendingApprovalCount > 0);
      case "cost_center_attention":
        return rows.filter((row) => row.costCenterTone !== "success");
      case "rollout_risk":
        return rows.filter(
          (row) => row.rolloutHold || row.blockedGateCount > 0,
        );
      case "expiry_feeds":
        return [];
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
  const pagedRows = useMemo(
    () =>
      filteredRows.slice(
        (page - 1) * CLIENT_PAGE_SIZE,
        page * CLIENT_PAGE_SIZE,
      ),
    [filteredRows, page],
  );

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

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

  const aggregates = useMemo(() => {
    const quotaWarn = rows.filter(
      (row) => row.monthlyQuotaPercentUsed >= 80,
    ).length;
    const approvalBacklog = rows.reduce(
      (sum, row) => sum + row.pendingApprovalCount,
      0,
    );
    const costCenterAttention = rows.filter(
      (row) => row.costCenterTone !== "success",
    ).length;
    const riskSignals = rows.reduce(
      (sum, row) => sum + row.riskLabels.length,
      0,
    );
    const approvalAged = rows.filter((row) =>
      row.alertFlags.includes("pending_approval_over_48h"),
    ).length;
    const noApprovers = rows.filter((row) =>
      row.alertFlags.includes("no_approvers_configured"),
    ).length;
    const rollbackHolds = rows.filter((row) => row.rolloutHold).length;
    const blockedGates = rows.filter((row) => row.blockedGateCount > 0).length;

    return {
      quotaWarn,
      approvalBacklog,
      costCenterAttention,
      riskSignals,
      approvalAged,
      noApprovers,
      rollbackHolds,
      blockedGates,
    };
  }, [rows]);

  const resolvedEmptyReason = useMemo<EmptyReason | null>(() => {
    if (previewEmptyReason) {
      return previewEmptyReason;
    }
    if (snapshot?.summary.emptyState && rows.length === 0) {
      return snapshot.summary.emptyState.reason;
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
  }, [
    error,
    filter,
    filteredRows.length,
    previewEmptyReason,
    rows.length,
    snapshot,
  ]);

  const emptyAction = useMemo<GovernanceAction | null>(() => {
    const backendEmptyAction =
      filter === "all" ? snapshot?.summary.emptyState?.nextAction : undefined;

    if (backendEmptyAction?.action === "open_tenant_list") {
      return {
        descriptor: backendEmptyAction,
        label: copy.openTenant,
        href: "/tenants",
      };
    }

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
    filter,
    resolvedEmptyReason,
    snapshot,
  ]);

  const tableColumns = useMemo<CanvasTableColumn<GovernanceRow>[]>(
    () => [
      {
        h: copy.table.tenant,
        w: 220,
        r: (row) => (
          <div style={{ display: "grid", gap: 4 }}>
            <button
              type="button"
              onClick={() => setSelectedTenantId(row.tenantId)}
              style={{
                padding: 0,
                border: 0,
                background: "transparent",
                color: theme.text,
                textAlign: "left",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: theme.fontFamily,
              }}
            >
              {row.tenantName}
            </button>
            <span style={monoTextStyle}>
              {row.tenantCode} · {row.tenantId}
            </span>
          </div>
        ),
      },
      {
        h: copy.table.plan,
        w: 120,
        r: (row) => (
          <span style={monoTextStyle}>
            {formatNumber(
              language,
              row.tenantRecord?.quotas.monthlyBookings ?? 0,
            )}
            /mo
          </span>
        ),
      },
      {
        h: copy.table.usage,
        w: 120,
        align: "right",
        r: (row) => {
          const quotaLimit = row.tenantRecord?.quotas.monthlyBookings ?? 0;
          const used = Math.round(
            (row.monthlyQuotaPercentUsed / 100) * quotaLimit,
          );
          return (
            <span style={monoTextStyle}>{formatNumber(language, used)}</span>
          );
        },
      },
      {
        h: copy.table.percent,
        w: 200,
        r: (row) => quotaMeter(language, row.monthlyQuotaPercentUsed),
      },
      {
        h: copy.table.status,
        w: 170,
        r: (row) => (
          <div style={{ display: "grid", gap: 6 }}>
            <CanvasPill theme={theme} tone={row.quotaTone} dot>
              {row.quotaLabel}
            </CanvasPill>
            {row.riskLabels.length > 0 ? (
              <CanvasPill
                theme={theme}
                tone={toneForAlert(
                  row.alertFlags[0] ?? "pending_approval_over_48h",
                )}
                dot
              >
                {row.riskLabels[0]}
              </CanvasPill>
            ) : null}
            {row.highestGateStatus ? (
              <CanvasPill
                theme={theme}
                tone={toCanvasTone(tenantStageTone(row.highestGateStatus))}
              >
                {formatPlatformCodeLabel(language, row.highestGateStatus)}
              </CanvasPill>
            ) : null}
          </div>
        ),
      },
      {
        h: copy.table.backlog,
        w: 170,
        r: (row) => (
          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 700 }}>
              {formatNumber(language, row.pendingApprovalCount)}
            </span>
            <span style={secondaryTextStyle}>
              {formatAge(language, row.oldestPendingApprovalAgeHours)}
            </span>
          </div>
        ),
      },
    ],
    [copy.table, language],
  );

  if (loading && !snapshot) {
    return (
      <div style={loadingStyle}>
        {language === "en"
          ? "Loading tenant governance dashboard…"
          : "正在載入 tenant governance dashboard…"}
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
            <CanvasPill theme={theme} tone="info">
              T4 · 30s
            </CanvasPill>
            {refreshMeta ? (
              <CanvasPill
                theme={theme}
                tone={freshnessTone(refreshMeta.dataFreshness)}
                dot
              >
                {copy.source}: {refreshMeta.dataFreshness}
              </CanvasPill>
            ) : null}
            <CanvasBtn
              theme={theme}
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
        <div style={toolbarStyle}>
          <CanvasPill theme={theme} tone="neutral">
            {copy.refreshTier}: T4 / {REFRESH_TIER}
          </CanvasPill>
          {refreshMeta ? (
            <>
              <CanvasPill
                theme={theme}
                tone={freshnessTone(refreshMeta.dataFreshness)}
              >
                {copy.snapshot}:{" "}
                {formatDateTime(language, refreshMeta.generatedAt)}
              </CanvasPill>
              <CanvasPill theme={theme} tone="neutral">
                {copy.source}: {refreshMeta.source}
              </CanvasPill>
            </>
          ) : null}
          <span style={{ flex: 1 }} />
          <span style={monoTextStyle}>
            {copy.resultSummary(rows.length, filteredRows.length)}
          </span>
        </div>

        {refreshMeta?.dataFreshness === "stale" ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon={<AlertTriangle size={15} />}
            title={copy.staleBannerTitle}
            body={copy.staleBannerBody}
          />
        ) : null}

        {refreshMeta?.dataFreshness === "degraded" ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon={<ShieldAlert size={15} />}
            title={copy.degradedBannerTitle}
            body={error ?? copy.degradedBannerBody}
          />
        ) : null}

        {snapshot &&
        snapshot.summary.pageInfo.totalItems > snapshot.summary.items.length ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon={<BadgeAlert size={15} />}
            title={copy.truncationTitle}
            body={copy.truncationBody(
              snapshot.summary.items.length,
              snapshot.summary.pageInfo.totalItems,
            )}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label={copy.kpi.quota}
            value={formatNumber(language, aggregates.quotaWarn)}
            delta={
              language === "en"
                ? `${rows.length} tenants`
                : `跨 ${rows.length} 個租戶`
            }
            deltaTone={aggregates.quotaWarn > 0 ? "down" : "neutral"}
            sub={language === "en" ? "thresholdWarning" : "thresholdWarning"}
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpi.backlog}
            value={formatNumber(language, aggregates.approvalBacklog)}
            delta={
              language === "en"
                ? `${aggregates.approvalAged} aged`
                : `${aggregates.approvalAged} 戶逾時`
            }
            deltaTone={aggregates.approvalBacklog > 0 ? "down" : "neutral"}
            sub={
              language === "en"
                ? "ops_approval_triage active"
                : "ops_approval_triage 處理中"
            }
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpi.cost}
            value={formatNumber(language, aggregates.costCenterAttention)}
            sub={
              language === "en"
                ? "Month-end cost-center review required"
                : "超過 month-end 預警"
            }
          />
          <CanvasKPI
            theme={theme}
            label={copy.kpi.risk}
            value={formatNumber(language, aggregates.riskSignals)}
            sub={
              language === "en"
                ? `hold ${aggregates.rollbackHolds} · blocked ${aggregates.blockedGates} · approver gap ${aggregates.noApprovers}`
                : `hold ${aggregates.rollbackHolds} · blocked ${aggregates.blockedGates} · approver gap ${aggregates.noApprovers}`
            }
          />
        </div>

        {resolvedEmptyReason ? (
          <CanvasCard theme={theme} title={copy.emptyTitle}>
            <div style={{ display: "grid", gap: 12 }}>
              <CanvasBanner
                theme={theme}
                tone={emptyStateContent(resolvedEmptyReason, language).tone}
                icon={emptyStateContent(resolvedEmptyReason, language).icon}
                title={emptyStateContent(resolvedEmptyReason, language).title}
                body={emptyStateContent(resolvedEmptyReason, language).body}
              />
              <div style={monoTextStyle}>
                {emptyStateContent(resolvedEmptyReason, language).code}
              </div>
              {emptyAction ? (
                <div style={actionRowStyle}>
                  {renderAction(language, origins, emptyAction)}
                </div>
              ) : null}
            </div>
          </CanvasCard>
        ) : (
          <div style={panelGridStyle}>
            <CanvasCard
              theme={theme}
              title={`${copy.heatmapTitle} · top 8 tenant · ${
                language === "en" ? "this month" : "本月"
              }`}
              subtitle={copy.heatmapSubtitle}
              actions={
                <CanvasPill theme={theme} tone="neutral">
                  {copy.pageSummary(page, totalPages, pagedRows.length)}
                </CanvasPill>
              }
            >
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  style={{ ...toolbarStyle, justifyContent: "space-between" }}
                >
                  <div style={actionRowStyle}>
                    {(
                      Object.keys(filterActions.actions) as GovernanceFilter[]
                    ).map((key) => (
                      <div key={key}>
                        {renderAction(
                          language,
                          origins,
                          filterActions.actions[key],
                          {
                            active: filter === key,
                            compact: true,
                          },
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={actionRowStyle}>
                    <CanvasPill theme={theme} tone="neutral">
                      {copy.resultSummary(rows.length, filteredRows.length)}
                    </CanvasPill>
                    {(
                      Object.keys(filterActions.counts) as GovernanceFilter[]
                    ).map((key) => (
                      <CanvasPill
                        key={key}
                        theme={theme}
                        tone={filter === key ? "accent" : "neutral"}
                        dot={key !== "all"}
                      >
                        {copy.filters[key]} ·{" "}
                        {formatNumber(language, filterActions.counts[key])}
                      </CanvasPill>
                    ))}
                  </div>
                </div>

                <CanvasTable
                  theme={theme}
                  columns={tableColumns}
                  rows={pagedRows}
                />

                <div style={{ ...toolbarStyle, marginTop: -2 }}>
                  <span style={secondaryTextStyle}>
                    {language === "en"
                      ? "Select a tenant name to update the governance rail."
                      : "點選 tenant 名稱即可切換治理側欄。"}
                  </span>
                  <span style={{ flex: 1 }} />
                  <CanvasBtn
                    theme={theme}
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                  >
                    {copy.previous}
                  </CanvasBtn>
                  <CanvasBtn
                    theme={theme}
                    variant="secondary"
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                  >
                    {copy.next}
                  </CanvasBtn>
                </div>
              </div>
            </CanvasCard>

            <div style={supportGridStyle}>
              <CanvasCard
                theme={theme}
                title={
                  selectedTenant
                    ? `${copy.selectedTitle} · ${selectedTenant.tenantName}`
                    : copy.selectedTitle
                }
                subtitle={copy.selectedSubtitle}
              >
                {selectedTenant ? (
                  <div style={{ display: "grid", gap: 16 }}>
                    <div style={metricGridStyle}>
                      <div style={metricCardStyle}>
                        <div style={sectionLabelStyle}>Rollout</div>
                        <div style={actionRowStyle}>
                          <CanvasPill
                            theme={theme}
                            tone={toCanvasTone(
                              tenantStageTone(
                                selectedTenant.tenantRolloutStage,
                              ),
                            )}
                            dot
                          >
                            {formatPlatformCodeLabel(
                              language,
                              selectedTenant.tenantRolloutStage,
                            )}
                          </CanvasPill>
                          <CanvasPill
                            theme={theme}
                            tone={toCanvasTone(
                              tenantStatusTone(selectedTenant.tenantStatus),
                            )}
                            dot
                          >
                            {formatPlatformCodeLabel(
                              language,
                              selectedTenant.tenantStatus,
                            )}
                          </CanvasPill>
                          {selectedTenant.highestGateStatus ? (
                            <CanvasPill
                              theme={theme}
                              tone={toCanvasTone(
                                tenantStageTone(
                                  selectedTenant.highestGateStatus,
                                ),
                              )}
                            >
                              {formatPlatformCodeLabel(
                                language,
                                selectedTenant.highestGateStatus,
                              )}
                            </CanvasPill>
                          ) : null}
                        </div>
                      </div>
                      <div style={metricCardStyle}>
                        <div style={sectionLabelStyle}>Cost-center health</div>
                        <CanvasPill
                          theme={theme}
                          tone={selectedTenant.costCenterTone}
                          dot
                        >
                          {selectedTenant.costCenterLabel}
                        </CanvasPill>
                        <div style={secondaryTextStyle}>
                          {formatNumber(
                            language,
                            selectedTenant.costCenterCount,
                          )}{" "}
                          cost center ·{" "}
                          {formatNumber(
                            language,
                            selectedTenant.activeRuleCount,
                          )}{" "}
                          active rule
                        </div>
                      </div>
                    </div>

                    <div style={metricGridStyle}>
                      <div style={metricCardStyle}>
                        <div style={sectionLabelStyle}>Quota burn</div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                          {formatPercent(
                            language,
                            selectedTenant.monthlyQuotaPercentUsed,
                          )}
                        </div>
                        {quotaMeter(
                          language,
                          selectedTenant.monthlyQuotaPercentUsed,
                        )}
                      </div>
                      <div style={metricCardStyle}>
                        <div style={sectionLabelStyle}>Approval backlog</div>
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
                    </div>

                    <div style={metricCardStyle}>
                      <div style={sectionLabelStyle}>Signals</div>
                      <div style={actionRowStyle}>
                        {selectedTenant.riskLabels.length > 0 ? (
                          selectedTenant.riskLabels.map((label, index) => (
                            <CanvasPill
                              key={`${label}-${index}`}
                              theme={theme}
                              tone={index === 0 ? "danger" : "warn"}
                              dot
                            >
                              {label}
                            </CanvasPill>
                          ))
                        ) : (
                          <CanvasPill theme={theme} tone="success" dot>
                            {language === "en" ? "All clear" : "全部正常"}
                          </CanvasPill>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={sectionLabelStyle}>Drill targets</div>
                      <div style={actionRowStyle}>
                        {selectedTenant.detailActions.map((action) => (
                          <div key={action.descriptor.action}>
                            {renderAction(language, origins, action, {
                              showReason: true,
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={secondaryTextStyle}>
                    {language === "en"
                      ? "Select a tenant row to inspect detail context."
                      : "先選一列 tenant，再看 detail rail。"}
                  </div>
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.backlogTitle}
                subtitle={copy.backlogSubtitle}
              >
                <div style={listStyle}>
                  {[
                    {
                      label:
                        language === "en" ? "Open queue depth" : "待審總深度",
                      value: formatNumber(language, aggregates.approvalBacklog),
                      note:
                        language === "en"
                          ? "Cross-tenant approval requests visible in the current read."
                          : "目前 read model 可見的跨租戶待審量。",
                    },
                    {
                      label:
                        language === "en"
                          ? "Aged backlog > 48h"
                          : "逾 48h 待審",
                      value: formatNumber(language, aggregates.approvalAged),
                      note:
                        language === "en"
                          ? "Rows carrying `pending_approval_over_48h`."
                          : "帶有 `pending_approval_over_48h` 訊號的列。",
                    },
                    {
                      label:
                        language === "en"
                          ? "No approvers configured"
                          : "未配置 approver",
                      value: formatNumber(language, aggregates.noApprovers),
                      note:
                        language === "en"
                          ? "Rows carrying `no_approvers_configured`."
                          : "帶有 `no_approvers_configured` 訊號的列。",
                    },
                  ].map((item) => (
                    <div key={item.label} style={listRowStyle}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{item.label}</span>
                        <CanvasPill theme={theme} tone="warn">
                          {item.value}
                        </CanvasPill>
                      </div>
                      <div style={secondaryTextStyle}>{item.note}</div>
                    </div>
                  ))}
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.riskTitle}
                subtitle={copy.riskSubtitle}
              >
                <div style={listStyle}>
                  {[
                    {
                      label:
                        language === "en" ? "Rollback hold" : "Rollback hold",
                      value: formatNumber(language, aggregates.rollbackHolds),
                      note:
                        language === "en"
                          ? "Tenants currently held out of continued promotion."
                          : "目前被 hold、不能繼續 promote 的租戶。",
                    },
                    {
                      label:
                        language === "en"
                          ? "Blocked rollout gates"
                          : "Blocked rollout gate",
                      value: formatNumber(language, aggregates.blockedGates),
                      note:
                        language === "en"
                          ? "At least one lifecycle gate is blocked."
                          : "至少有一個 rollout gate 為 blocked。",
                    },
                    {
                      label:
                        language === "en"
                          ? "Credential expiry feed"
                          : "Credential 到期 feed",
                      value: "Gap",
                      note:
                        language === "en"
                          ? "Rendered as not provisioned until the feed is delivered."
                          : "在 feed 交付前，這裡明確顯示為 not provisioned。",
                    },
                    {
                      label:
                        language === "en"
                          ? "Contract expiry feed"
                          : "Contract 到期 feed",
                      value: "Gap",
                      note:
                        language === "en"
                          ? "Still an explicit read-model gap for this slice."
                          : "目前仍是這個 slice 的 read-model gap。",
                    },
                  ].map((item) => (
                    <div key={item.label} style={listRowStyle}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{item.label}</span>
                        <CanvasPill
                          theme={theme}
                          tone={item.value === "Gap" ? "warn" : "danger"}
                        >
                          {item.value}
                        </CanvasPill>
                      </div>
                      <div style={secondaryTextStyle}>{item.note}</div>
                    </div>
                  ))}
                </div>
              </CanvasCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
