"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
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
import type {
  ActionReceipt,
  CrossAppResourceLink,
  EmptyReason,
  PublishDriverFeePlanCommand,
  PublishPlatformPricingRuleCommand,
  ResourceActionDescriptor,
  RefreshTier,
  UiRefreshMetadata,
} from "@drts/contracts";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_INTERVALS_MS: Record<RefreshTier, number> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: 0,
};
const REFRESH_INTERVAL_MS = REFRESH_INTERVALS_MS[REFRESH_TIER];
const STALE_AFTER_MS = 55_000;

type PricingTabId = "passenger" | "driver" | "subsidy" | "history";

type PricingStatus = "draft" | "published" | "retired";

type PricingItem = {
  id: string;
  tab: Exclude<PricingTabId, "history">;
  name: string;
  version: string;
  status: PricingStatus;
  scope: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  summary: string;
  metricA: string;
  metricB: string;
  notes: string;
  serviceFeeBps?: string;
  reimbursementMode?: string;
  feeStructure?: string;
  subsidyLinkage?: string;
  subsidyTrigger?: string;
  subsidyAmount?: string;
  serviceBuckets?: Array<{
    bucket: string;
    base: string;
    continuation: string;
    serviceFee: string;
  }>;
  quotedFareAuthority?: string;
  overrideActorTypes?: string[];
  overrideRequiredFields?: string[];
  availableActions: ResourceActionDescriptor[];
  crossLinks?: CrossAppResourceLink[];
};

type VersionRow = {
  id: string;
  version: string;
  versionType: "passenger" | "driver" | "subsidy";
  name: string;
  scope: string;
  publishedAt: string;
  publishedBy: string;
  supersedes: string;
  status: "published" | "retired";
  availableActions: ResourceActionDescriptor[];
  crossLinks?: CrossAppResourceLink[];
};

type EmptyStateDescriptor = {
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
  nextAction?: ResourceActionDescriptor;
  links?: CrossAppResourceLink[];
};

type PricingActionReceipt = ActionReceipt & {
  actionLabel: string;
  subject: string;
  reason: string | null;
  auditRoute: string;
};

type PricingActionTarget = {
  subject: string;
  tab: PricingTabId;
  resourceType: string;
  resourceId: string;
  auditRoute: string;
  item?: PricingItem;
  row?: VersionRow;
};

type ResolvedActionDescriptor = {
  action: ResourceActionDescriptor;
  target: PricingActionTarget;
};

const TAB_IDS: PricingTabId[] = ["passenger", "driver", "subsidy", "history"];

const PRICING_EMPTY_REASONS = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

type PricingEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

const EMPTY_REASON_OPTIONS: Array<{
  value: "live" | PricingEmptyReason;
  label: string;
}> = [
  { value: "live", label: "Live data" },
  { value: "no_data", label: "No data" },
  { value: "not_provisioned", label: "Not provisioned" },
  { value: "fetch_failed", label: "Fetch failed" },
  { value: "permission_denied", label: "Permission denied" },
  { value: "external_unavailable", label: "External unavailable" },
  { value: "filtered_empty", label: "Filtered empty" },
];

const PASSENGER_RULES: PricingItem[] = [
  {
    id: "pp-2026-06-core",
    tab: "passenger",
    name: "Metro core fare",
    version: "v2026.06",
    status: "draft",
    scope: "all tenants / metro",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    effectiveTo: null,
    summary: "Service fee 850 bps · reimbursement mixed",
    metricA: "850 bps",
    metricB: "Mixed reimbursement",
    serviceFeeBps: "850",
    reimbursementMode: "Mixed",
    notes: "Conflict check pending for airport-sponsored trips.",
    quotedFareAuthority: "Canonical quoted fare engine",
    overrideActorTypes: ["ops_dispatch", "tenant_dispatch_lead"],
    overrideRequiredFields: ["override_reason", "quoted_fare_snapshot"],
    serviceBuckets: [
      {
        bucket: "standard",
        base: "NT$ 85 / start",
        continuation: "NT$ 5 / 250m",
        serviceFee: "180 bps",
      },
      {
        bucket: "business",
        base: "NT$ 120 / start",
        continuation: "NT$ 6 / 200m",
        serviceFee: "220 bps",
      },
      {
        bucket: "airport",
        base: "NT$ 180 / start",
        continuation: "Flat by zone",
        serviceFee: "250 bps",
      },
      {
        bucket: "wheelchair",
        base: "NT$ 95 / start",
        continuation: "NT$ 5 / 250m",
        serviceFee: "90 bps + subsidy",
      },
    ],
    availableActions: [
      { action: "edit_draft", enabled: true, riskLevel: "medium" },
      {
        action: "publish_draft",
        enabled: true,
        riskLevel: "high",
        requiresReason: true,
      },
    ],
    crossLinks: [
      {
        targetApp: "ops-console",
        route: "/dispatch?scope=metro-core-fare",
        resourceType: "dispatch_board",
        resourceId: "metro-core-fare",
        openMode: "new_tab",
        label: "Open ops dispatch board",
      },
    ],
  },
  {
    id: "pp-2026-05-airport",
    tab: "passenger",
    name: "Airport partner fare",
    version: "v2026.05",
    status: "published",
    scope: "partner_airport / north terminal",
    effectiveFrom: "2026-05-15T00:00:00.000Z",
    effectiveTo: null,
    summary: "Service fee 1200 bps · platform funded reimbursement",
    metricA: "1200 bps",
    metricB: "Platform funded",
    serviceFeeBps: "1200",
    reimbursementMode: "Platform funded",
    notes: "Supersedes v2026.04 after peak transfer review.",
    quotedFareAuthority: "Airport settlement catalog",
    overrideActorTypes: ["ops_dispatch"],
    overrideRequiredFields: ["override_reason", "partner_case_id"],
    availableActions: [
      {
        action: "retire_version",
        enabled: true,
        riskLevel: "high",
        requiresReason: true,
      },
      {
        action: "view_version_history",
        enabled: true,
        riskLevel: "low",
      },
    ],
    crossLinks: [
      {
        targetApp: "tenant-console",
        route: "/billing?pricingVersion=v2026.05",
        resourceType: "pricing_snapshot",
        resourceId: "v2026.05",
        openMode: "new_tab",
        label: "Open tenant billing snapshot",
      },
    ],
  },
];

const DRIVER_PLANS: PricingItem[] = [
  {
    id: "df-2026-06-standard",
    tab: "driver",
    name: "Standard taxi fee plan",
    version: "v2026.06",
    status: "draft",
    scope: "all / standard_taxi",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    effectiveTo: null,
    summary: "Base fee + sponsor offset for mixed funding routes",
    metricA: "Base 65 TWD / trip",
    metricB: "Links subsidy pack S-12",
    serviceFeeBps: "650",
    reimbursementMode: "mixed",
    feeStructure: "Base 65 TWD / trip",
    subsidyLinkage: "Subsidy pack S-12",
    notes: "In-flight trip overlap warning for overnight airport queue.",
    availableActions: [
      { action: "edit_draft", enabled: true, riskLevel: "medium" },
      {
        action: "publish_draft",
        enabled: false,
        riskLevel: "high",
        requiresReason: true,
        disabledReasonCode: "scope_conflict_check_pending",
      },
    ],
    crossLinks: [
      {
        targetApp: "ops-console",
        route: "/revenue?feePlan=standard-taxi-v2026-06",
        resourceType: "revenue_snapshot",
        resourceId: "standard-taxi-v2026-06",
        openMode: "new_tab",
        label: "Open ops revenue mirror",
      },
    ],
  },
  {
    id: "df-2026-04-lite",
    tab: "driver",
    name: "Lite fleet fee plan",
    version: "v2026.04",
    status: "retired",
    scope: "tenant lite fleet",
    effectiveFrom: "2026-04-01T00:00:00.000Z",
    effectiveTo: "2026-05-31T23:59:59.000Z",
    summary: "Retired after cross-tenant uplift rollout",
    metricA: "45 TWD / trip",
    metricB: "No subsidy linkage",
    serviceFeeBps: "450",
    reimbursementMode: "platform_funded",
    feeStructure: "45 TWD / trip",
    subsidyLinkage: "No subsidy linkage",
    notes: "Kept visible for audit and statement lineage.",
    availableActions: [
      {
        action: "view_version_history",
        enabled: true,
        riskLevel: "low",
      },
    ],
  },
];

const SUBSIDY_RULES: PricingItem[] = [
  {
    id: "sr-2026-06-airport-night",
    tab: "subsidy",
    name: "Night airport transfer subsidy",
    version: "v2026.06",
    status: "published",
    scope: "airport / 22:00-05:00",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    effectiveTo: null,
    summary: "20% reimbursement for sponsor-backed late trips",
    metricA: "20% / max 160 TWD",
    metricB: "Trigger: airport_partner_night",
    subsidyAmount: "20% / max 160 TWD",
    subsidyTrigger: "airport_partner_night",
    notes: "Cross-app notice linked for driver payout expectations.",
    availableActions: [
      {
        action: "retire_version",
        enabled: true,
        riskLevel: "high",
        requiresReason: true,
      },
      {
        action: "view_version_history",
        enabled: true,
        riskLevel: "low",
      },
    ],
    crossLinks: [
      {
        targetApp: "tenant-console",
        route: "/notices?audience=drivers&tag=airport-night",
        resourceType: "notice",
        resourceId: "airport-night",
        openMode: "new_tab",
        label: "Open tenant notice stream",
      },
    ],
  },
];

const VERSION_HISTORY: VersionRow[] = [
  {
    id: "vh-pp-2026-05",
    version: "pr_v24",
    versionType: "passenger",
    name: "Airport partner fare",
    scope: "partner_airport / north terminal",
    publishedAt: "2026-05-15T03:15:00.000Z",
    publishedBy: "A. Lin",
    supersedes: "v2026.04",
    status: "published",
    availableActions: [
      { action: "view_version_history", enabled: true, riskLevel: "low" },
    ],
    crossLinks: [
      {
        targetApp: "platform-admin",
        route: "/audit?auditId=aud-prc-515",
        resourceType: "audit_event",
        resourceId: "aud-prc-515",
        openMode: "new_tab",
        label: "View audit trail",
      },
    ],
  },
  {
    id: "vh-df-2026-04",
    version: "fp_v12",
    versionType: "driver",
    name: "Lite fleet fee plan",
    scope: "tenant lite fleet",
    publishedAt: "2026-04-02T10:00:00.000Z",
    publishedBy: "M. Wu",
    supersedes: "v2026.03",
    status: "retired",
    availableActions: [
      { action: "view_version_history", enabled: true, riskLevel: "low" },
    ],
  },
  {
    id: "vh-sr-2026-06",
    version: "sb_v05",
    versionType: "subsidy",
    name: "Night airport transfer subsidy",
    scope: "airport / 22:00-05:00",
    publishedAt: "2026-05-26T08:20:00.000Z",
    publishedBy: "C. Ho",
    supersedes: "new line",
    status: "published",
    availableActions: [
      { action: "view_version_history", enabled: true, riskLevel: "low" },
    ],
  },
];

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenant: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGroup: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGroup: "Pricing & Settlement",
          pricing: "Pricing governance",
          payments: "Settlement governance",
          platform: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenant: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGroup: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGroup: "計價與結算",
          pricing: "費率治理",
          payments: "結算治理",
          platform: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", label: labels.home, icon: "dashboard" },
    { key: "health", href: "/health", label: labels.health, icon: "health" },
    { divider: labels.tenant },
    {
      key: "tenants",
      href: "/tenants",
      label: labels.tenants,
      icon: "tenants",
    },
    {
      key: "partners",
      href: "/partners",
      label: labels.partners,
      icon: "partners",
    },
    { key: "users", href: "/users", label: labels.users, icon: "users" },
    { divider: labels.fleetGroup },
    { key: "fleet", href: "/fleet", label: labels.fleet, icon: "fleet" },
    {
      key: "switchboard",
      href: "/switchboard",
      label: labels.switchboard,
      icon: "switchboard",
    },
    { divider: labels.pricingGroup },
    {
      key: "pricing",
      href: "/pricing",
      label: labels.pricing,
      icon: "pricing",
      matchPaths: ["/pricing"],
    },
    {
      key: "payments",
      href: "/payments",
      label: labels.payments,
      icon: "payments",
    },
    { divider: labels.platform },
    {
      key: "notices",
      href: "/notices",
      label: labels.notices,
      icon: "notices",
    },
    { key: "audit", href: "/audit", label: labels.audit, icon: "audit" },
    {
      key: "featureFlags",
      href: "/feature-flags",
      label: labels.flags,
      icon: "flags",
    },
    {
      key: "adapterRegistry",
      href: "/adapter-registry",
      label: labels.adapters,
      icon: "adapters",
    },
  ];
}

function pageCopy(locale: string) {
  return locale === "en"
    ? {
        title: "Pricing",
        subtitle:
          "draft → published → retired · publish uses atomic replace per Q-ADM10",
        breadcrumbRoot: "Platform & Commerce",
        refreshLabel: "T4 refresh",
        refreshBody:
          "This surface polls every 30 seconds and exposes stale-state metadata for medium-slow governance views.",
        filtersTitle: "State controls",
        emptyPreview: "Empty state preview",
        historyFilter: "Version lane",
        historyScope: "Scope",
        historyPeriod: "Period",
        lastRefresh: "Last generated",
        freshness: "Freshness",
        source: "Source",
        actionsLabel: "Available actions",
        scope: "Scope",
        effective: "Effective",
        notes: "Notes",
        links: "Cross-app links",
        policy: "Governance policy",
        overrideActors: "Override actors",
        overrideFields: "Required override fields",
        quotedFareAuthority: "Quoted fare authority",
        conflictTitle: "Publish safeguards",
        conflictBody:
          "Publishing is atomic per scope. Drafts surface scope conflicts and in-flight trip overlap warnings before a high-risk publish.",
        tabBannerTitle: "Canonical quoted fare authority",
        tabBannerBody:
          "The backend remains the pricing source of truth. Manual override flows must preserve actor type and required governance fields.",
        tabBannerBodyDriver:
          "Fee plans must remain aligned with subsidy linkage before publish. Scope conflicts stay visible until the overlap check clears.",
        tabBannerBodySubsidy:
          "Subsidy rules are versioned with the same atomic replace contract. Trigger clarity and payout traceability are mandatory before publish.",
        historyTitle: "All published versions",
        historySubtitle:
          "Cross-tab chronology across passenger pricing, driver fee plans, and subsidy rules.",
        tableVersion: "Version",
        tableType: "Type",
        tableName: "Name",
        tableStatus: "Status",
        tableServiceFee: "Service fee bps",
        tableReimburse: "Reimbursement",
        tableTrigger: "Trigger",
        tableAmount: "Amount / percentage",
        tableFeeStructure: "Per-trip fee structure",
        tableSubsidyLinkage: "Subsidy linkage",
        serviceBucketTitle: "Service bucket fee breakdown",
        serviceBucketSubtitle:
          "Passenger pricing keeps the per-bucket fee mix visible before publish.",
        rowHistory: "History",
        rowPublishedBy: "Published by",
        rowPublishedAt: "Published at",
        rowSupersedes: "Supersedes",
        createDraft: "Create draft",
        publishDraft: "Publish",
        manualRefresh: "Refresh now",
        auditLink: "Audit trail",
        allScopes: "All scopes",
        allPeriods: "All time",
        period30Days: "Last 30 days",
        period90Days: "Last 90 days",
        publishInProgress: "Atomic publish in progress",
        publishInProgressBody:
          "The version transition is being applied. Wait for the receipt before re-running publish or retire.",
        emptyLabels: {
          no_data: "No published data",
          not_provisioned: "Provisioning required",
          fetch_failed: "Could not load pricing",
          permission_denied: "Read-only boundary",
          external_unavailable: "External dependency unavailable",
          filtered_empty: "No matches for current filters",
        },
      }
    : {
        title: "Pricing",
        subtitle:
          "draft → published → retired · 發佈為 atomic replace (Q-ADM10)",
        breadcrumbRoot: "平台與商務",
        refreshLabel: "T4 refresh",
        refreshBody:
          "此頁面依 medium-slow tier 每 30 秒更新，並明示資料新鮮度與 stale 狀態。",
        filtersTitle: "狀態控制",
        emptyPreview: "Empty state 預覽",
        historyFilter: "版本類型",
        historyScope: "適用範圍",
        historyPeriod: "期間",
        lastRefresh: "資料產生時間",
        freshness: "新鮮度",
        source: "來源",
        actionsLabel: "可執行動作",
        scope: "適用範圍",
        effective: "生效期間",
        notes: "治理備註",
        links: "跨 app 深連結",
        policy: "治理規則",
        overrideActors: "可覆寫角色",
        overrideFields: "必填覆寫欄位",
        quotedFareAuthority: "報價權威來源",
        conflictTitle: "發布防護",
        conflictBody:
          "同 scope 發布採原子替換；草稿先顯示 scope conflict 與 in-flight trip overlap 警告，再進入高風險發布。",
        tabBannerTitle: "canonical quoted fare authority",
        tabBannerBody:
          "後端是唯一計價真值；任何 manual override 都必須保留 actor type 與治理必填欄位。",
        tabBannerBodyDriver:
          "費用方案在 publish 前必須與 subsidy linkage 對齊；scope conflict 會持續顯示到 overlap check 清除為止。",
        tabBannerBodySubsidy:
          "補貼規則沿用同一套 atomic replace 版本契約；publish 前必須確認 trigger 清楚且 payout 可追溯。",
        historyTitle: "所有已發佈版本",
        historySubtitle:
          "乘客計價、司機費用方案與補貼規則的跨 tab 發布時間線。",
        tableVersion: "版本",
        tableType: "類型",
        tableName: "名稱",
        tableStatus: "狀態",
        tableServiceFee: "服務費 bps",
        tableReimburse: "代墊 / 補貼模式",
        tableTrigger: "觸發條件",
        tableAmount: "補貼額 / 比例",
        tableFeeStructure: "單趟費用結構",
        tableSubsidyLinkage: "補貼連動",
        serviceBucketTitle: "服務 bucket fee 拆解",
        serviceBucketSubtitle:
          "乘客計價在 publish 前保留各 bucket 的費率組成可見。",
        rowHistory: "版本歷程",
        rowPublishedBy: "發布人",
        rowPublishedAt: "發布時間",
        rowSupersedes: "取代版本",
        createDraft: "建立草稿",
        publishDraft: "發佈",
        manualRefresh: "立即刷新",
        auditLink: "稽核軌跡",
        allScopes: "全部 scope",
        allPeriods: "全部期間",
        period30Days: "近 30 天",
        period90Days: "近 90 天",
        publishInProgress: "原子發布進行中",
        publishInProgressBody:
          "版本替換正在進行，請等待回執後再重試 publish 或 retire。",
        emptyLabels: {
          no_data: "尚無資料",
          not_provisioned: "尚未完成配置",
          fetch_failed: "價格資料載入失敗",
          permission_denied: "僅可檢視，無操作權限",
          external_unavailable: "外部依賴暫不可用",
          filtered_empty: "目前篩選條件沒有結果",
        },
      };
}

function toneForStatus(
  status: PricingStatus | "published" | "retired",
): CanvasTone {
  if (status === "published") return "success";
  if (status === "draft") return "warn";
  return "neutral";
}

function toneForRisk(
  riskLevel: ResourceActionDescriptor["riskLevel"],
): CanvasTone {
  if (riskLevel === "high") return "danger";
  if (riskLevel === "medium") return "warn";
  return "info";
}

function resolveActionDescriptors(
  actions: ResolvedActionDescriptor[],
): ResolvedActionDescriptor[] {
  const merged = new Map<string, ResolvedActionDescriptor>();
  const riskOrder = { low: 0, medium: 1, high: 2 } as const;

  for (const entry of actions) {
    const existing = merged.get(entry.action.action);
    if (!existing) {
      merged.set(entry.action.action, {
        action: { ...entry.action },
        target: entry.target,
      });
      continue;
    }

    const disabledReasonCode =
      !existing.action.enabled && !entry.action.enabled
        ? (entry.action.disabledReasonCode ??
          existing.action.disabledReasonCode)
        : undefined;
    const enabled = existing.action.enabled || entry.action.enabled;
    const resolvedTarget =
      !existing.action.enabled && entry.action.enabled
        ? entry.target
        : existing.target;

    merged.set(entry.action.action, {
      action: {
        action: entry.action.action,
        enabled,
        riskLevel:
          riskOrder[entry.action.riskLevel] >
          riskOrder[existing.action.riskLevel]
            ? entry.action.riskLevel
            : existing.action.riskLevel,
        ...(existing.action.requiresReason || entry.action.requiresReason
          ? { requiresReason: true }
          : {}),
        ...(disabledReasonCode ? { disabledReasonCode } : {}),
      },
      target: resolvedTarget,
    });
  }

  return [...merged.values()];
}

function formatActionLabel(action: string) {
  return action
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function emptyStateDescriptor(
  reason: PricingEmptyReason,
  locale: string,
): EmptyStateDescriptor {
  const zh = locale !== "en";
  switch (reason) {
    case "no_data":
      return {
        tone: "info" as const,
        title: zh ? "此版本區段目前沒有資料" : "No versions are available yet",
        body: zh
          ? "系統已連線，但這個 tab 尚未建立任何版本。"
          : "The read model is healthy, but this lane has no versions yet.",
        nextAction: {
          action: "create_draft",
          enabled: true,
          riskLevel: "medium",
        },
      };
    case "not_provisioned":
      return {
        tone: "info",
        title: zh ? "租戶或方案尚未完成配置" : "Provisioning is still required",
        body: zh
          ? "先完成 partner / tenant / settlement provision，再建立 pricing draft。"
          : "Finish partner, tenant, or settlement provisioning before creating a pricing draft.",
        nextAction: {
          action: "open_provisioning",
          enabled: true,
          riskLevel: "low",
        },
      };
    case "fetch_failed":
      return {
        tone: "danger",
        title: zh
          ? "讀取 pricing read model 失敗"
          : "Pricing read model failed to load",
        body: zh
          ? "請使用 refresh 或查看 audit / adapter health 追蹤原因。"
          : "Use refresh or inspect audit and adapter health to trace the failure.",
        nextAction: {
          action: "retry_fetch",
          enabled: true,
          riskLevel: "medium",
        },
        links: [
          {
            targetApp: "platform-admin",
            route: "/audit?resourceType=pricing",
            resourceType: "audit_event",
            resourceId: "pricing-read-model",
            openMode: "new_tab",
            label: zh ? "查看 pricing audit" : "View pricing audit",
          },
        ],
      };
    case "permission_denied":
      return {
        tone: "warn",
        title: zh
          ? "你目前只能檢視，不能操作"
          : "You can see this view but cannot act",
        body: zh
          ? "此資源沒有可用 action，UI 以 read-only 呈現而非灑滿 disabled 按鈕。"
          : "This resource exposes no available actions, so the UI stays cleanly read-only.",
      };
    case "external_unavailable":
      return {
        tone: "warn",
        title: zh
          ? "外部結算依賴暫時不可用"
          : "External settlement dependency unavailable",
        body: zh
          ? "可先查看已發布版本與 audit；發布與 retire 先暫停。"
          : "Published history remains visible, but publish and retire flows are paused.",
        links: [
          {
            targetApp: "ops-console",
            route: "/health?dependency=settlement",
            resourceType: "dependency_health",
            resourceId: "settlement",
            openMode: "new_tab",
            label: zh
              ? "查看結算依賴健康度"
              : "View settlement dependency health",
          },
        ],
      };
    case "filtered_empty":
      return {
        tone: "info",
        title: zh ? "篩選後沒有符合資料" : "No items match the active filters",
        body: zh
          ? "調整狀態、scope 或版本類型後再試。"
          : "Change the state, scope, or version-lane filters and try again.",
      };
  }
}

function RefreshMeta({
  copy,
  metadata,
  theme,
}: {
  copy: ReturnType<typeof pageCopy>;
  metadata: UiRefreshMetadata;
  theme: CanvasTheme;
}) {
  return (
    <CanvasCard
      theme={theme}
      title={copy.refreshLabel}
      subtitle={copy.refreshBody}
    >
      <CanvasDL
        theme={theme}
        cols={2}
        items={[
          { label: "refreshTier", value: REFRESH_TIER, mono: true },
          {
            label: copy.lastRefresh,
            value: formatDateTime(metadata.generatedAt),
            mono: true,
          },
          { label: copy.freshness, value: metadata.dataFreshness },
          { label: copy.source, value: metadata.source },
          {
            label: "staleAfterMs",
            value: String(metadata.staleAfterMs),
            mono: true,
          },
        ]}
      />
    </CanvasCard>
  );
}

function EmptyStatePreview({
  descriptor,
  theme,
  target,
  onAction,
}: {
  descriptor: EmptyStateDescriptor;
  theme: CanvasTheme;
  target: PricingActionTarget;
  onAction: (
    action: ResourceActionDescriptor,
    target: PricingActionTarget,
  ) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <CanvasBanner
        theme={theme}
        tone={descriptor.tone}
        title={descriptor.title}
        body={descriptor.body}
      />
      {descriptor.nextAction ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <CanvasBtn
            theme={theme}
            variant={
              descriptor.nextAction.riskLevel === "low" ? "ghost" : "primary"
            }
            onClick={() => onAction(descriptor.nextAction!, target)}
          >
            {formatActionLabel(descriptor.nextAction.action)}
          </CanvasBtn>
        </div>
      ) : null}
      {descriptor.links?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {descriptor.links.map((link) => (
            <a
              key={`${link.targetApp}-${link.route}`}
              href={link.route}
              target="_blank"
              rel="noreferrer"
              style={linkStyle(theme)}
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function PricingPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = pageCopy(locale);
  const nav = useMemo(() => buildPlatformNav(locale), [locale]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [manualRefreshNonce, setManualRefreshNonce] = useState(0);
  const [generatedAt, setGeneratedAt] = useState(() =>
    new Date().toISOString(),
  );
  const [emptyPreview, setEmptyPreview] = useState<"live" | PricingEmptyReason>(
    "live",
  );
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyScopeFilter, setHistoryScopeFilter] = useState("all");
  const [historyPeriodFilter, setHistoryPeriodFilter] = useState("all");
  const [showRetired, setShowRetired] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionReceipt, setActionReceipt] =
    useState<PricingActionReceipt | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);

  const activeTab = useMemo<PricingTabId>(() => {
    const raw = searchParams.get("tab");
    return TAB_IDS.includes(raw as PricingTabId)
      ? (raw as PricingTabId)
      : "passenger";
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshTick((current) => current + 1);
      setGeneratedAt(new Date().toISOString());
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = window.setTimeout(() => setActionMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const refreshMetadata = useMemo<UiRefreshMetadata>(() => {
    const ageMs = Date.now() - Date.parse(generatedAt);
    return {
      generatedAt,
      staleAfterMs: STALE_AFTER_MS,
      dataFreshness: ageMs > STALE_AFTER_MS ? "stale" : "fresh",
      source: manualRefreshNonce > 0 ? "live" : "sandbox",
    };
  }, [generatedAt, manualRefreshNonce, refreshTick]);

  const historyScopeOptions = useMemo(
    () => Array.from(new Set(VERSION_HISTORY.map((row) => row.scope))),
    [],
  );

  const visibleHistory = useMemo(() => {
    return VERSION_HISTORY.filter((row) => {
      if (historyFilter !== "all" && row.versionType !== historyFilter)
        return false;
      if (historyScopeFilter !== "all" && row.scope !== historyScopeFilter)
        return false;
      if (!showRetired && row.status === "retired") return false;
      if (historyPeriodFilter === "all") return true;

      const ageMs = Date.now() - Date.parse(row.publishedAt);
      if (historyPeriodFilter === "30d")
        return ageMs <= 30 * 24 * 60 * 60 * 1000;
      if (historyPeriodFilter === "90d")
        return ageMs <= 90 * 24 * 60 * 60 * 1000;
      return true;
    });
  }, [historyFilter, historyPeriodFilter, historyScopeFilter, showRetired]);

  const visibleItems = useMemo(() => {
    const items = (() => {
      switch (activeTab) {
        case "driver":
          return DRIVER_PLANS;
        case "subsidy":
          return SUBSIDY_RULES;
        case "history":
          return [];
        case "passenger":
        default:
          return PASSENGER_RULES;
      }
    })();

    return showRetired
      ? items
      : items.filter((item) => item.status !== "retired");
  }, [activeTab, showRetired]);

  const createDraftAction = useMemo<ResourceActionDescriptor | null>(() => {
    if (activeTab === "history") return null;
    return {
      action: "create_draft",
      enabled: emptyPreview !== "permission_denied",
      riskLevel: "medium",
      ...(emptyPreview === "permission_denied"
        ? { disabledReasonCode: "role_read_only" }
        : {}),
    };
  }, [activeTab, emptyPreview]);

  const topLevelActions = useMemo<ResolvedActionDescriptor[]>(() => {
    const scopedActions =
      activeTab === "history"
        ? visibleHistory.flatMap((row) =>
            row.availableActions.map((action) => ({
              action,
              target: buildHistoryActionTarget(row),
            })),
          )
        : visibleItems.flatMap((item) =>
            item.availableActions.map((action) => ({
              action,
              target: buildItemActionTarget(item),
            })),
          );

    return resolveActionDescriptors(
      createDraftAction
        ? [
            {
              action: createDraftAction,
              target: buildGenericActionTarget(activeTab, copy.title),
            },
            ...scopedActions,
          ]
        : scopedActions,
    );
  }, [activeTab, copy.title, createDraftAction, visibleHistory, visibleItems]);

  const activeEmptyDescriptor = useMemo(
    () =>
      emptyPreview === "live"
        ? null
        : emptyStateDescriptor(emptyPreview, locale),
    [emptyPreview, locale],
  );

  const emptyStateGallery = useMemo(
    () =>
      PRICING_EMPTY_REASONS.map((reason) => ({
        reason,
        descriptor: emptyStateDescriptor(reason, locale),
      })),
    [locale],
  );

  const primaryPublishAction = useMemo(
    () =>
      topLevelActions.find(
        (entry) => entry.action.action === "publish_draft",
      ) ?? null,
    [topLevelActions],
  );

  const pricingColumns = useMemo<CanvasTableColumn<PricingItem>[]>(() => {
    if (activeTab === "passenger") {
      return [
        { h: copy.tableVersion, w: 110, r: (row) => monoCell(row.version) },
        { h: copy.tableName, w: 220, r: (row) => row.name },
        {
          h: copy.tableStatus,
          w: 108,
          r: (row) => (
            <CanvasPill theme={theme} tone={toneForStatus(row.status)}>
              {row.status}
            </CanvasPill>
          ),
        },
        {
          h: copy.tableServiceFee,
          w: 132,
          r: (row) =>
            monoCell(row.serviceFeeBps ? `${row.serviceFeeBps}` : "—"),
        },
        {
          h: copy.tableReimburse,
          w: 188,
          r: (row) => row.reimbursementMode ?? row.metricB,
        },
        { h: copy.scope, w: 188, r: (row) => monoCell(row.scope) },
        {
          h: copy.effective,
          w: 220,
          r: (row) =>
            monoCell(
              `${formatDateTime(row.effectiveFrom)} → ${row.effectiveTo ? formatDateTime(row.effectiveTo) : "—"}`,
            ),
        },
      ];
    }

    if (activeTab === "driver") {
      return [
        { h: copy.tableVersion, w: 110, r: (row) => monoCell(row.version) },
        { h: copy.tableName, w: 224, r: (row) => row.name },
        {
          h: copy.tableStatus,
          w: 108,
          r: (row) => (
            <CanvasPill theme={theme} tone={toneForStatus(row.status)}>
              {row.status}
            </CanvasPill>
          ),
        },
        { h: copy.scope, w: 170, r: (row) => monoCell(row.scope) },
        {
          h: copy.tableFeeStructure,
          w: 220,
          r: (row) => row.feeStructure ?? row.metricA,
        },
        {
          h: copy.tableSubsidyLinkage,
          w: 170,
          r: (row) => row.subsidyLinkage ?? row.metricB,
        },
        {
          h: copy.effective,
          w: 220,
          r: (row) =>
            monoCell(
              `${formatDateTime(row.effectiveFrom)} → ${row.effectiveTo ? formatDateTime(row.effectiveTo) : "—"}`,
            ),
        },
      ];
    }

    return [
      { h: copy.tableVersion, w: 110, r: (row) => monoCell(row.version) },
      { h: copy.tableName, w: 224, r: (row) => row.name },
      {
        h: copy.tableStatus,
        w: 108,
        r: (row) => (
          <CanvasPill theme={theme} tone={toneForStatus(row.status)}>
            {row.status}
          </CanvasPill>
        ),
      },
      {
        h: copy.tableTrigger,
        w: 260,
        r: (row) => monoCell(row.subsidyTrigger ?? row.metricB),
      },
      {
        h: copy.tableAmount,
        w: 160,
        r: (row) => row.subsidyAmount ?? row.metricA,
      },
      { h: copy.scope, w: 168, r: (row) => monoCell(row.scope) },
      {
        h: copy.effective,
        w: 220,
        r: (row) =>
          monoCell(
            `${formatDateTime(row.effectiveFrom)} → ${row.effectiveTo ? formatDateTime(row.effectiveTo) : "—"}`,
          ),
      },
    ];
  }, [activeTab, copy, theme]);

  const tabBannerBody =
    activeTab === "driver"
      ? copy.tabBannerBodyDriver
      : activeTab === "subsidy"
        ? copy.tabBannerBodySubsidy
        : copy.tabBannerBody;

  const handleTabChange = (tab: PricingTabId) => {
    router.replace(tab === "passenger" ? "/pricing" : `/pricing?tab=${tab}`);
  };

  const handleRefresh = () => {
    setManualRefreshNonce((current) => current + 1);
    setGeneratedAt(new Date().toISOString());
  };

  const handleAction = async (
    action: ResourceActionDescriptor,
    target: PricingActionTarget,
  ) => {
    if (!action.enabled) {
      setActionReceipt(null);
      setActionMessage(action.disabledReasonCode ?? "Action unavailable.");
      return;
    }

    if (
      refreshMetadata.dataFreshness !== "fresh" &&
      (action.action === "publish_draft" || action.action === "retire_version")
    ) {
      setActionReceipt(null);
      setActionMessage(
        locale === "en"
          ? "Refresh is required before publishing or retiring a version."
          : "發布或 retire 版本前必須先 refresh。",
      );
      return;
    }

    if (action.riskLevel !== "low") {
      const confirmed = window.confirm(
        `${formatActionLabel(action.action)} · ${target.subject}`,
      );
      if (!confirmed) return;
    }

    const pendingKey = `${target.resourceId}-${action.action}`;
    setPendingActionKey(pendingKey);

    if (action.requiresReason) {
      const reasonInput = window.prompt(
        locale === "en"
          ? "Reason is required for this high-risk action."
          : "此高風險操作必須輸入原因。",
      );
      const reason = reasonInput?.trim() ?? "";
      if (!reason || !reason.trim()) {
        setActionReceipt(null);
        setActionMessage(
          locale === "en" ? "Reason is required." : "必須填寫原因。",
        );
        setPendingActionKey(null);
        return;
      }

      try {
        const publishPayload = buildPublishPayload(target, reason);
        if (publishPayload) {
          await publishPayload.execute(client);
        }
        setPendingActionKey((current) =>
          current === pendingKey ? null : current,
        );
        const receipt = buildActionReceipt({
          action,
          target,
          locale,
          reason,
        });
        setActionReceipt(receipt);
        setActionMessage(receipt.message);
      } catch (error) {
        setActionReceipt(null);
        setPendingActionKey((current) =>
          current === pendingKey ? null : current,
        );
        setActionMessage(actionErrorMessage(error, locale));
      }
      return;
    }

    setActionReceipt(null);
    setActionMessage(
      locale === "en"
        ? `${formatActionLabel(action.action)} completed for ${target.subject}.`
        : `${target.subject} 已完成 ${formatActionLabel(action.action)}。`,
    );
    setPendingActionKey((current) => (current === pendingKey ? null : current));
  };

  const renderActions = (
    actions: ResourceActionDescriptor[],
    target: PricingActionTarget,
  ) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {actions.map((action) => {
        const actionKey = `${target.resourceId}-${action.action}`;
        const isPending = pendingActionKey === actionKey;
        return (
          <button
            key={actionKey}
            type="button"
            onClick={() => {
              void handleAction(action, target);
            }}
            disabled={!action.enabled || isPending}
            title={action.disabledReasonCode}
            style={actionButtonStyle(theme, action, isPending)}
          >
            <CanvasPill
              theme={theme}
              tone={isPending ? "accent" : toneForRisk(action.riskLevel)}
            >
              {isPending ? "pending" : action.riskLevel}
            </CanvasPill>
            <span>{formatActionLabel(action.action)}</span>
          </button>
        );
      })}
    </div>
  );

  const historyColumns = useMemo<CanvasTableColumn<VersionRow>[]>(
    () => [
      { h: copy.tableVersion, w: 112, r: (row) => monoCell(row.version) },
      {
        h: copy.tableType,
        w: 128,
        r: (row) => monoCell(historyTypeLabel(row.versionType)),
      },
      { h: copy.tableName, w: 220, r: (row) => row.name },
      {
        h: copy.rowPublishedAt,
        w: 180,
        r: (row) => monoCell(formatDateTime(row.publishedAt)),
      },
      { h: copy.rowPublishedBy, w: 140, r: (row) => row.publishedBy },
      {
        h: copy.tableStatus,
        w: 112,
        r: (row) => (
          <CanvasPill theme={theme} tone={toneForStatus(row.status)}>
            {row.status}
          </CanvasPill>
        ),
      },
      {
        h: copy.actionsLabel,
        w: 280,
        r: (row) => (
          <div style={{ display: "grid", gap: 8 }}>
            {renderActions(row.availableActions, buildHistoryActionTarget(row))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <a
                href={buildHistoryActionTarget(row).auditRoute}
                target="_blank"
                rel="noreferrer"
                style={linkStyle(theme)}
              >
                {copy.auditLink}
              </a>
              {row.crossLinks?.map((link) => (
                <a
                  key={link.route}
                  href={link.route}
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle(theme)}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        ),
      },
    ],
    [copy, theme, renderActions],
  );

  return (
    <CanvasShell
      theme={theme}
      nav={nav}
      active="pricing"
      currentPath="/pricing"
      breadcrumb={[copy.breadcrumbRoot, copy.title]}
      searchPlaceholder={
        locale === "en"
          ? "Search pricing, versions, scope"
          : "搜尋定價、版本、scope"
      }
      avatarLabel="PA"
      env="production"
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            {createDraftAction ? (
              <CanvasBtn
                theme={theme}
                icon="plus"
                onClick={() => {
                  void handleAction(
                    createDraftAction,
                    buildGenericActionTarget(activeTab, copy.title),
                  );
                }}
                disabled={!createDraftAction.enabled}
              >
                {copy.createDraft}
              </CanvasBtn>
            ) : null}
            {primaryPublishAction ? (
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon="check"
                onClick={() => {
                  void handleAction(
                    primaryPublishAction.action,
                    primaryPublishAction.target,
                  );
                }}
                disabled={!primaryPublishAction.action.enabled}
              >
                {copy.publishDraft}
              </CanvasBtn>
            ) : null}
          </>
        }
      />

      <div style={pageStackStyle}>
        {actionReceipt ? (
          <CanvasCard
            theme={theme}
            title={locale === "en" ? "Action receipt" : "操作回執"}
            subtitle={actionReceipt.message}
            actions={
              <a
                href={actionReceipt.auditRoute}
                target="_blank"
                rel="noreferrer"
                style={linkStyle(theme)}
              >
                {copy.auditLink}
              </a>
            }
          >
            <CanvasDL
              theme={theme}
              cols={2}
              items={[
                { label: copy.actionsLabel, value: actionReceipt.actionLabel },
                { label: copy.tableStatus, value: actionReceipt.status },
                { label: copy.tableName, value: actionReceipt.subject },
                { label: "auditId", value: actionReceipt.auditId, mono: true },
                {
                  label: "actionId",
                  value: actionReceipt.actionId,
                  mono: true,
                },
                {
                  label: locale === "en" ? "Reason" : "原因",
                  value: actionReceipt.reason ?? "—",
                },
              ]}
            />
          </CanvasCard>
        ) : null}

        {actionMessage ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            title={locale === "en" ? "Action receipt" : "操作回執"}
            body={actionMessage}
          />
        ) : null}

        <div style={tabRowStyle}>
          {TAB_IDS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabChange(tab)}
              style={tabButtonStyle(theme, activeTab === tab)}
            >
              <span>{tabLabel(tab, locale)}</span>
            </button>
          ))}
        </div>

        <CanvasBanner
          theme={theme}
          tone="info"
          title={copy.tabBannerTitle}
          body={tabBannerBody}
        />

        <div style={contentGridStyle}>
          <div style={{ display: "grid", gap: 16 }}>
            {refreshMetadata.dataFreshness !== "fresh" ? (
              <CanvasBanner
                theme={theme}
                tone="warn"
                title={
                  locale === "en"
                    ? "Pricing view is stale"
                    : "Pricing 視圖已 stale"
                }
                body={
                  locale === "en"
                    ? "Use refresh before publishing or retiring a version."
                    : "發布或 retire 前請先手動 refresh。"
                }
              />
            ) : null}

            {pendingActionKey ? (
              <CanvasBanner
                theme={theme}
                tone="info"
                title={copy.publishInProgress}
                body={copy.publishInProgressBody}
              />
            ) : null}

            {activeTab === "history" ? (
              <CanvasCard
                theme={theme}
                title={copy.historyTitle}
                subtitle={copy.historySubtitle}
              >
                {visibleHistory.length === 0 ? (
                  <CanvasBanner
                    theme={theme}
                    tone="info"
                    title={copy.emptyLabels.filtered_empty}
                    body={
                      locale === "en"
                        ? "No published versions match the selected version lane."
                        : "目前的版本類型篩選沒有符合資料。"
                    }
                  />
                ) : (
                  <CanvasTable
                    theme={theme}
                    columns={historyColumns}
                    rows={visibleHistory}
                  />
                )}
              </CanvasCard>
            ) : activeEmptyDescriptor ? (
              <CanvasCard
                theme={theme}
                title={
                  locale === "en"
                    ? `${tabLabel(activeTab, locale)} empty state`
                    : `${tabLabel(activeTab, locale)} 空狀態`
                }
                subtitle={
                  locale === "en"
                    ? "Previewing the packet-required EmptyReason rendering."
                    : "預覽 packet 要求的 EmptyReason 呈現。"
                }
              >
                <EmptyStatePreview
                  descriptor={activeEmptyDescriptor}
                  theme={theme}
                  target={buildGenericActionTarget(
                    activeTab,
                    tabLabel(activeTab, locale),
                  )}
                  onAction={handleAction}
                />
              </CanvasCard>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                <CanvasCard theme={theme} padding={0}>
                  <CanvasTable
                    theme={theme}
                    columns={pricingColumns}
                    rows={visibleItems}
                  />
                </CanvasCard>

                {activeTab === "passenger" &&
                visibleItems[0]?.serviceBuckets ? (
                  <CanvasCard
                    theme={theme}
                    title={copy.serviceBucketTitle}
                    subtitle={copy.serviceBucketSubtitle}
                  >
                    <div style={bucketGridStyle}>
                      {visibleItems[0].serviceBuckets.map((bucket) => (
                        <div key={bucket.bucket} style={bucketCardStyle(theme)}>
                          <div style={bucketTitleStyle}>{bucket.bucket}</div>
                          <div style={bucketBodyStyle(theme)}>
                            <div>{bucket.base}</div>
                            <div>{bucket.continuation}</div>
                            <div style={{ color: theme.accent }}>
                              {bucket.serviceFee}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CanvasCard>
                ) : null}

                {visibleItems.map((item) => (
                  <CanvasCard
                    key={item.id}
                    theme={theme}
                    title={item.name}
                    subtitle={`${item.version} · ${item.summary}`}
                    actions={
                      <CanvasPill
                        theme={theme}
                        tone={toneForStatus(item.status)}
                      >
                        {item.status}
                      </CanvasPill>
                    }
                  >
                    <div style={{ display: "grid", gap: 16 }}>
                      <CanvasDL
                        theme={theme}
                        cols={2}
                        items={[
                          { label: copy.scope, value: item.scope },
                          {
                            label: copy.effective,
                            value: `${formatDateTime(item.effectiveFrom)} → ${item.effectiveTo ? formatDateTime(item.effectiveTo) : "—"}`,
                            mono: true,
                          },
                          {
                            label:
                              activeTab === "passenger"
                                ? copy.tableServiceFee
                                : activeTab === "driver"
                                  ? copy.tableFeeStructure
                                  : copy.tableAmount,
                            value:
                              activeTab === "passenger"
                                ? (item.serviceFeeBps ?? item.metricA)
                                : activeTab === "driver"
                                  ? (item.feeStructure ?? item.metricA)
                                  : (item.subsidyAmount ?? item.metricA),
                          },
                          {
                            label:
                              activeTab === "passenger"
                                ? copy.tableReimburse
                                : activeTab === "driver"
                                  ? copy.tableSubsidyLinkage
                                  : copy.tableTrigger,
                            value:
                              activeTab === "passenger"
                                ? (item.reimbursementMode ?? item.metricB)
                                : activeTab === "driver"
                                  ? (item.subsidyLinkage ?? item.metricB)
                                  : (item.subsidyTrigger ?? item.metricB),
                          },
                          { label: copy.notes, value: item.notes },
                        ]}
                      />

                      <div style={detailGridStyle}>
                        <section style={policyCardStyle(theme)}>
                          <div style={sectionEyebrowStyle(theme)}>
                            {copy.policy}
                          </div>
                          <div style={detailListStyle}>
                            {item.quotedFareAuthority ? (
                              <div>
                                <strong>{copy.quotedFareAuthority}:</strong>{" "}
                                {item.quotedFareAuthority}
                              </div>
                            ) : null}
                            {item.overrideActorTypes?.length ? (
                              <div>
                                <strong>{copy.overrideActors}:</strong>{" "}
                                {item.overrideActorTypes.join(", ")}
                              </div>
                            ) : null}
                            {item.overrideRequiredFields?.length ? (
                              <div>
                                <strong>{copy.overrideFields}:</strong>{" "}
                                {item.overrideRequiredFields.join(", ")}
                              </div>
                            ) : null}
                          </div>
                        </section>

                        <section style={policyCardStyle(theme)}>
                          <div style={sectionEyebrowStyle(theme)}>
                            {copy.actionsLabel}
                          </div>
                          {renderActions(
                            item.availableActions,
                            buildItemActionTarget(item),
                          )}
                        </section>
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={sectionEyebrowStyle(theme)}>
                          {copy.links}
                        </div>
                        <div
                          style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
                        >
                          {(item.crossLinks ?? []).map((link) => (
                            <a
                              key={link.route}
                              href={link.route}
                              target="_blank"
                              rel="noreferrer"
                              style={linkStyle(theme)}
                            >
                              {link.label}
                            </a>
                          ))}
                          <a
                            href={buildItemActionTarget(item).auditRoute}
                            target="_blank"
                            rel="noreferrer"
                            style={linkStyle(theme)}
                          >
                            {copy.auditLink}
                          </a>
                        </div>
                      </div>
                    </div>
                  </CanvasCard>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <RefreshMeta copy={copy} metadata={refreshMetadata} theme={theme} />

            <CanvasCard
              theme={theme}
              title={copy.filtersTitle}
              actions={
                <CanvasBtn theme={theme} onClick={handleRefresh} icon="arrow">
                  {copy.manualRefresh}
                </CanvasBtn>
              }
            >
              <div style={sideControlsStyle}>
                <CanvasField theme={theme} label={copy.emptyPreview}>
                  <select
                    value={emptyPreview}
                    onChange={(event) =>
                      setEmptyPreview(
                        event.target.value as "live" | PricingEmptyReason,
                      )
                    }
                    style={selectStyle(theme)}
                  >
                    {EMPTY_REASON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </CanvasField>

                {activeTab === "history" ? (
                  <CanvasField theme={theme} label={copy.historyFilter}>
                    <select
                      value={historyFilter}
                      onChange={(event) => setHistoryFilter(event.target.value)}
                      style={selectStyle(theme)}
                    >
                      <option value="all">All</option>
                      <option value="passenger">Passenger pricing</option>
                      <option value="driver">Driver fee plan</option>
                      <option value="subsidy">Subsidy rule</option>
                    </select>
                  </CanvasField>
                ) : null}

                {activeTab === "history" ? (
                  <CanvasField theme={theme} label={copy.historyScope}>
                    <select
                      value={historyScopeFilter}
                      onChange={(event) =>
                        setHistoryScopeFilter(event.target.value)
                      }
                      style={selectStyle(theme)}
                    >
                      <option value="all">{copy.allScopes}</option>
                      {historyScopeOptions.map((scope) => (
                        <option key={scope} value={scope}>
                          {scope}
                        </option>
                      ))}
                    </select>
                  </CanvasField>
                ) : null}

                {activeTab === "history" ? (
                  <CanvasField theme={theme} label={copy.historyPeriod}>
                    <select
                      value={historyPeriodFilter}
                      onChange={(event) =>
                        setHistoryPeriodFilter(event.target.value)
                      }
                      style={selectStyle(theme)}
                    >
                      <option value="all">{copy.allPeriods}</option>
                      <option value="30d">{copy.period30Days}</option>
                      <option value="90d">{copy.period90Days}</option>
                    </select>
                  </CanvasField>
                ) : null}

                <label style={checkboxFieldStyle(theme)}>
                  <input
                    type="checkbox"
                    checked={showRetired}
                    onChange={(event) => setShowRetired(event.target.checked)}
                  />
                  <span>
                    {locale === "en"
                      ? "Show retired versions"
                      : "顯示 retired 版本"}
                  </span>
                </label>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={copy.conflictTitle}
              subtitle={copy.conflictBody}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {topLevelActions.map((entry) => {
                  const actionKey = `${entry.target.resourceId}-${entry.action.action}`;
                  const isPending = pendingActionKey === actionKey;
                  return (
                    <button
                      key={actionKey}
                      type="button"
                      onClick={() => {
                        void handleAction(entry.action, entry.target);
                      }}
                      disabled={!entry.action.enabled || isPending}
                      title={entry.action.disabledReasonCode}
                      style={actionButtonStyle(theme, entry.action, isPending)}
                    >
                      <CanvasPill
                        theme={theme}
                        tone={
                          isPending
                            ? "accent"
                            : toneForRisk(entry.action.riskLevel)
                        }
                      >
                        {isPending ? "pending" : entry.action.riskLevel}
                      </CanvasPill>
                      <span>{formatActionLabel(entry.action.action)}</span>
                    </button>
                  );
                })}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={
                locale === "en" ? "EmptyReason gallery" : "EmptyReason gallery"
              }
              subtitle={
                locale === "en"
                  ? "All six packet-required states render as distinct banners with their own CTA/links."
                  : "依 packet 要求，六種狀態以不同 banner 與 CTA/links 獨立呈現。"
              }
            >
              <div style={{ display: "grid", gap: 8 }}>
                {emptyStateGallery.map(({ reason, descriptor }) => (
                  <div key={reason} style={emptyGalleryCardStyle(theme)}>
                    <div style={legendRowStyle}>
                      <CanvasPill theme={theme} tone={descriptor.tone}>
                        {reason}
                      </CanvasPill>
                      <span style={{ color: theme.textMuted }}>
                        {copy.emptyLabels[reason]}
                      </span>
                    </div>
                    <EmptyStatePreview
                      descriptor={descriptor}
                      theme={theme}
                      target={buildGenericActionTarget(
                        activeTab,
                        `${tabLabel(activeTab, locale)} ${reason}`,
                      )}
                      onAction={handleAction}
                    />
                  </div>
                ))}
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </CanvasShell>
  );
}

function tabLabel(tab: PricingTabId, locale: string) {
  const labels =
    locale === "en"
      ? {
          passenger: "Passenger Pricing",
          driver: "Driver Fee Plans",
          subsidy: "Subsidy / Reimbursement Rules",
          history: "Published Versions",
        }
      : {
          passenger: "乘客計價",
          driver: "司機費用方案",
          subsidy: "補貼 / 代墊規則",
          history: "已發布版本",
        };
  return labels[tab];
}

function historyTypeLabel(value: VersionRow["versionType"]) {
  switch (value) {
    case "driver":
      return "driver_fee";
    case "subsidy":
      return "subsidy";
    case "passenger":
    default:
      return "passenger";
  }
}

function buildActionReceipt({
  action,
  target,
  locale,
  reason,
}: {
  action: ResourceActionDescriptor;
  target: PricingActionTarget;
  locale: string;
  reason: string;
}): PricingActionReceipt {
  const resourceId = target.resourceId;
  const actionLabel = formatActionLabel(action.action);
  const auditId = `aud-prc-${resourceId}`;
  return {
    actionId: `act-prc-${resourceId}-${toReceiptSlug(action.action)}`,
    auditId,
    resourceType: target.resourceType,
    resourceId,
    status: "accepted",
    message:
      locale === "en"
        ? `${actionLabel} accepted for ${target.subject}. Audit receipt ${auditId} issued.`
        : `${target.subject} 已送出 ${actionLabel}，並產生稽核回執 ${auditId}。`,
    actionLabel,
    subject: target.subject,
    reason,
    auditRoute: `${target.auditRoute}&auditId=${encodeURIComponent(auditId)}`,
  };
}

function buildPublishPayload(target: PricingActionTarget, reason: string) {
  if (!target.item || target.tab !== target.item.tab) {
    return null;
  }

  if (target.tab === "passenger") {
    const command: PublishPlatformPricingRuleCommand = {
      effectiveFrom: target.item.effectiveFrom,
      effectiveTo: target.item.effectiveTo,
      publishedBy: "platform-admin-web",
      reason,
    };
    return {
      execute: async (client: ReturnType<typeof usePlatformAdminClient>) =>
        client.publishPlatformPricingRule(target.item!.id, command),
    };
  }

  if (target.tab === "driver") {
    const serviceFeeBps = Number(target.item.serviceFeeBps ?? "");
    const reimbursementMode = toDriverReimbursementMode(
      target.item.reimbursementMode,
    );
    if (!Number.isFinite(serviceFeeBps) || !reimbursementMode) {
      throw new Error("Driver fee plan payload is incomplete.");
    }
    const command: PublishDriverFeePlanCommand = {
      planName: target.item.name,
      version: target.item.version,
      serviceFeeBps,
      reimbursementMode,
      reason,
    };
    return {
      execute: async (client: ReturnType<typeof usePlatformAdminClient>) =>
        client.publishDriverFeePlan(command),
    };
  }

  return null;
}

function actionErrorMessage(error: unknown, locale: string) {
  const message = error instanceof Error ? error.message : String(error);
  return locale === "en" ? message : `操作失敗：${message}`;
}

function buildItemActionTarget(item: PricingItem): PricingActionTarget {
  const resourceType = resourceTypeForTab(item.tab);
  return {
    subject: item.name,
    tab: item.tab,
    resourceType,
    resourceId: item.id,
    auditRoute: buildAuditRoute(resourceType, item.id),
    item,
  };
}

function buildHistoryActionTarget(row: VersionRow): PricingActionTarget {
  return {
    subject: row.name,
    tab: "history",
    resourceType: "pricing_version",
    resourceId: row.id,
    auditRoute: buildAuditRoute("pricing_version", row.id),
    row,
  };
}

function buildGenericActionTarget(
  tab: PricingTabId,
  subject: string,
): PricingActionTarget {
  const resourceType = resourceTypeForTab(tab);
  const resourceId = `scope-${tab}`;
  return {
    subject,
    tab,
    resourceType,
    resourceId,
    auditRoute: buildAuditRoute(resourceType, resourceId),
  };
}

function buildAuditRoute(resourceType: string, resourceId: string) {
  return `/audit?resourceType=${encodeURIComponent(resourceType)}&resourceId=${encodeURIComponent(resourceId)}`;
}

function resourceTypeForTab(tab: PricingTabId) {
  switch (tab) {
    case "driver":
      return "driver_fee_plan";
    case "subsidy":
      return "subsidy_rule";
    case "history":
      return "pricing_version";
    case "passenger":
    default:
      return "platform_pricing_rule";
  }
}

function toDriverReimbursementMode(value?: string) {
  if (value === "platform_funded" || value === "Platform funded") {
    return "platform_funded" as const;
  }
  if (value === "mixed" || value === "Mixed") {
    return "mixed" as const;
  }
  return null;
}

function toReceiptSlug(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "pricing";
}

function actionButtonStyle(
  theme: CanvasTheme,
  action: ResourceActionDescriptor,
  pending = false,
) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 34,
    padding: "6px 10px",
    borderRadius: 10,
    border: `1px solid ${pending ? theme.accent : action.enabled ? theme.border : theme.neutralBorder}`,
    background: pending
      ? theme.accentBg
      : action.enabled
        ? theme.surfaceHi
        : theme.neutralBg,
    color: pending
      ? theme.accentHi
      : action.enabled
        ? theme.text
        : theme.textDim,
    cursor: action.enabled && !pending ? "pointer" : "not-allowed",
    opacity: action.enabled || pending ? 1 : 0.68,
  } as const;
}

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 20,
};

const tabRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 10,
};

function tabButtonStyle(theme: CanvasTheme, active: boolean) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    minHeight: 38,
    padding: "0 14px",
    borderRadius: 999,
    border: `1px solid ${active ? theme.accent : theme.border}`,
    background: active ? theme.accentBg : theme.surfaceHi,
    color: active ? theme.accentHi : theme.text,
    cursor: "pointer",
    fontWeight: 700,
  } as const;
}

const contentGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.65fr) minmax(280px, 0.8fr)",
  gap: 16,
};

const sideControlsStyle = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
};

function checkboxFieldStyle(theme: CanvasTheme) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    minHeight: 38,
    padding: "0 12px",
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: theme.surfaceHi,
    color: theme.text,
    fontFamily: theme.fontFamily,
    fontSize: 13,
  } as const;
}

function selectStyle(theme: CanvasTheme) {
  return {
    width: "100%",
    minHeight: 38,
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: theme.surfaceHi,
    color: theme.text,
    padding: "0 12px",
    fontFamily: theme.fontFamily,
  } as const;
}

function monoCell(value: string) {
  return <span style={monoTextStyle}>{value}</span>;
}

const detailGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const bucketGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
};

const monoTextStyle = {
  fontFamily:
    '"SFMono-Regular", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 11,
};

function bucketCardStyle(theme: CanvasTheme) {
  return {
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: 10,
    background: theme.surfaceHi,
  } as const;
}

const bucketTitleStyle = {
  fontWeight: 700,
  marginBottom: 6,
  ...monoTextStyle,
};

function bucketBodyStyle(theme: CanvasTheme) {
  return {
    display: "grid",
    gap: 4,
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 1.55,
  } as const;
}

function policyCardStyle(theme: CanvasTheme) {
  return {
    display: "grid",
    gap: 10,
    border: `1px solid ${theme.border}`,
    borderRadius: 14,
    background: theme.neutralBg,
    padding: 14,
  };
}

function sectionEyebrowStyle(theme: CanvasTheme) {
  return {
    color: theme.textDim,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
    fontWeight: 700,
  };
}

const detailListStyle = {
  display: "grid",
  gap: 8,
  fontSize: 13,
  lineHeight: 1.5,
};

function linkStyle(theme: CanvasTheme) {
  return {
    color: theme.accentHi,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    fontWeight: 600,
  } as const;
}

const legendRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap" as const,
};

function emptyGalleryCardStyle(theme: CanvasTheme) {
  return {
    display: "grid",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    border: `1px solid ${theme.border}`,
    background: theme.surfaceHi,
  } as const;
}
