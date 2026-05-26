"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
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
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const REFRESH_INTERVAL_MS = 30_000;
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
  quotedFareAuthority?: string;
  overrideActorTypes?: string[];
  overrideRequiredFields?: string[];
  availableActions: ResourceActionDescriptor[];
  crossLinks?: CrossAppResourceLink[];
};

type VersionRow = {
  id: string;
  versionType: string;
  name: string;
  scope: string;
  publishedAt: string;
  publishedBy: string;
  supersedes: string;
  status: "published" | "retired";
  availableActions: ResourceActionDescriptor[];
  crossLinks?: CrossAppResourceLink[];
};

const TAB_IDS: PricingTabId[] = ["passenger", "driver", "subsidy", "history"];

const EMPTY_REASON_OPTIONS: Array<{ value: "live" | EmptyReason; label: string }> =
  [
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
    notes: "Conflict check pending for airport-sponsored trips.",
    quotedFareAuthority: "Canonical quoted fare engine",
    overrideActorTypes: ["ops_dispatch", "tenant_dispatch_lead"],
    overrideRequiredFields: ["override_reason", "quoted_fare_snapshot"],
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
    versionType: "Passenger pricing",
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
    versionType: "Driver fee plan",
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
    versionType: "Subsidy rule",
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
    { key: "tenants", href: "/tenants", label: labels.tenants, icon: "tenants" },
    { key: "partners", href: "/partners", label: labels.partners, icon: "partners" },
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
    { key: "notices", href: "/notices", label: labels.notices, icon: "notices" },
    { key: "audit", href: "/audit", label: labels.audit, icon: "audit" },
    { key: "featureFlags", href: "/feature-flags", label: labels.flags, icon: "flags" },
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
        title: "Pricing governance",
        subtitle:
          "Passenger pricing, driver fee plans, subsidy rules, and published-version history with safe version replacement.",
        breadcrumbRoot: "Platform & Commerce",
        refreshLabel: "T4 refresh",
        refreshBody:
          "This surface polls every 30 seconds and exposes stale-state metadata for medium-slow governance views.",
        filtersTitle: "State controls",
        emptyPreview: "Empty state preview",
        historyFilter: "Version lane",
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
        historyTitle: "Published versions",
        historySubtitle:
          "Cross-tab chronology for passenger pricing, fee plans, and subsidy rules.",
        rowHistory: "History",
        rowPublishedBy: "Published by",
        rowSupersedes: "Supersedes",
        createDraft: "Create draft",
        manualRefresh: "Refresh now",
        auditLink: "Audit trail",
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
        title: "費率治理",
        subtitle:
          "乘客計價、司機費用方案、補貼規則與已發布版本歷程，並以安全版本替換管理。",
        breadcrumbRoot: "平台與商務",
        refreshLabel: "T4 refresh",
        refreshBody:
          "此頁面依 medium-slow tier 每 30 秒更新，並明示資料新鮮度與 stale 狀態。",
        filtersTitle: "狀態控制",
        emptyPreview: "Empty state 預覽",
        historyFilter: "版本類型",
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
        historyTitle: "已發布版本",
        historySubtitle: "乘客計價、司機費用方案、補貼規則的跨 tab 發布時間線。",
        rowHistory: "版本歷程",
        rowPublishedBy: "發布人",
        rowSupersedes: "取代版本",
        createDraft: "建立草稿",
        manualRefresh: "立即刷新",
        auditLink: "稽核軌跡",
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

function toneForStatus(status: PricingStatus | "published" | "retired"): CanvasTone {
  if (status === "published") return "success";
  if (status === "draft") return "warn";
  return "neutral";
}

function toneForRisk(riskLevel: ResourceActionDescriptor["riskLevel"]): CanvasTone {
  if (riskLevel === "high") return "danger";
  if (riskLevel === "medium") return "warn";
  return "info";
}

function formatActionLabel(action: string) {
  return action
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function emptyStateDescriptor(reason: EmptyReason, locale: string) {
  const zh = locale !== "en";
  switch (reason) {
    case "no_data":
      return {
        tone: "neutral" as CanvasTone,
        title: zh ? "此版本區段目前沒有資料" : "No versions are available yet",
        body: zh
          ? "系統已連線，但這個 tab 尚未建立任何版本。"
          : "The read model is healthy, but this lane has no versions yet.",
      };
    case "not_provisioned":
      return {
        tone: "info" as CanvasTone,
        title: zh ? "租戶或方案尚未完成配置" : "Provisioning is still required",
        body: zh
          ? "先完成 partner / tenant / settlement provision，再建立 pricing draft。"
          : "Finish partner, tenant, or settlement provisioning before creating a pricing draft.",
      };
    case "fetch_failed":
      return {
        tone: "danger" as CanvasTone,
        title: zh ? "讀取 pricing read model 失敗" : "Pricing read model failed to load",
        body: zh
          ? "請使用 refresh 或查看 audit / adapter health 追蹤原因。"
          : "Use refresh or inspect audit and adapter health to trace the failure.",
      };
    case "permission_denied":
      return {
        tone: "warn" as CanvasTone,
        title: zh ? "你目前只能檢視，不能操作" : "You can see this view but cannot act",
        body: zh
          ? "此資源沒有可用 action，UI 以 read-only 呈現而非灑滿 disabled 按鈕。"
          : "This resource exposes no available actions, so the UI stays cleanly read-only.",
      };
    case "external_unavailable":
      return {
        tone: "warn" as CanvasTone,
        title: zh ? "外部結算依賴暫時不可用" : "External settlement dependency unavailable",
        body: zh
          ? "可先查看已發布版本與 audit；發布與 retire 先暫停。"
          : "Published history remains visible, but publish and retire flows are paused.",
      };
    case "filtered_empty":
      return {
        tone: "info" as CanvasTone,
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
    <CanvasCard theme={theme} title={copy.refreshLabel} subtitle={copy.refreshBody}>
      <CanvasDL
        theme={theme}
        cols={2}
        items={[
          { label: copy.lastRefresh, value: formatDateTime(metadata.generatedAt), mono: true },
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

export default function PricingPage() {
  const { locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = pageCopy(locale);
  const nav = useMemo(() => buildPlatformNav(locale), [locale]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [manualRefreshNonce, setManualRefreshNonce] = useState(0);
  const [generatedAt, setGeneratedAt] = useState(() => new Date().toISOString());
  const [emptyPreview, setEmptyPreview] = useState<"live" | EmptyReason>("live");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const activeTab = useMemo<PricingTabId>(() => {
    const raw = searchParams.get("tab");
    return TAB_IDS.includes(raw as PricingTabId) ? (raw as PricingTabId) : "passenger";
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

  const visibleHistory = useMemo(() => {
    if (historyFilter === "all") return VERSION_HISTORY;
    return VERSION_HISTORY.filter((row) => row.versionType === historyFilter);
  }, [historyFilter]);

  const visibleItems = useMemo(() => {
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
  }, [activeTab]);

  const topLevelActions = useMemo<ResourceActionDescriptor[]>(() => {
    if (activeTab === "history") {
      return [{ action: "view_version_history", enabled: true, riskLevel: "low" }];
    }
    return [
      { action: "create_draft", enabled: true, riskLevel: "medium" },
      ...visibleItems.flatMap((item) => item.availableActions).slice(0, 2),
    ];
  }, [activeTab, visibleItems]);

  const counts = {
    passenger: PASSENGER_RULES.length,
    driver: DRIVER_PLANS.length,
    subsidy: SUBSIDY_RULES.length,
    history: VERSION_HISTORY.length,
  };

  const handleTabChange = (tab: PricingTabId) => {
    router.replace(tab === "passenger" ? "/pricing" : `/pricing?tab=${tab}`);
  };

  const handleRefresh = () => {
    setManualRefreshNonce((current) => current + 1);
    setGeneratedAt(new Date().toISOString());
  };

  const handleAction = (action: ResourceActionDescriptor, subject: string) => {
    if (!action.enabled) {
      setActionMessage(action.disabledReasonCode ?? "Action unavailable.");
      return;
    }

    if (action.riskLevel !== "low") {
      const confirmed = window.confirm(
        `${formatActionLabel(action.action)} · ${subject}`,
      );
      if (!confirmed) return;
    }

    if (action.requiresReason) {
      const reason = window.prompt(
        locale === "en"
          ? "Reason is required for this high-risk action."
          : "此高風險操作必須輸入原因。",
      );
      if (!reason || !reason.trim()) {
        setActionMessage(
          locale === "en" ? "Reason is required." : "必須填寫原因。",
        );
        return;
      }
      setActionMessage(
        locale === "en"
          ? `${formatActionLabel(action.action)} accepted for ${subject}. Audit reference issued.`
          : `${subject} 已送出 ${formatActionLabel(action.action)}，並產生 audit reference。`,
      );
      return;
    }

    setActionMessage(
      locale === "en"
        ? `${formatActionLabel(action.action)} completed for ${subject}.`
        : `${subject} 已完成 ${formatActionLabel(action.action)}。`,
    );
  };

  const renderActions = (
    actions: ResourceActionDescriptor[],
    subject: string,
  ) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {actions.map((action) => (
        <button
          key={`${subject}-${action.action}`}
          type="button"
          onClick={() => handleAction(action, subject)}
          disabled={!action.enabled}
          title={action.disabledReasonCode}
          style={actionButtonStyle(theme, action)}
        >
          <CanvasPill theme={theme} tone={toneForRisk(action.riskLevel)}>
            {action.riskLevel}
          </CanvasPill>
          <span>{formatActionLabel(action.action)}</span>
        </button>
      ))}
    </div>
  );

  const showEmptyState = emptyPreview !== "live";
  const emptyDescriptor =
    showEmptyState && activeTab !== "history"
      ? emptyStateDescriptor(emptyPreview, locale)
      : null;

  return (
    <CanvasShell
      theme={theme}
      nav={nav}
      active="pricing"
      currentPath="/pricing"
      breadcrumb={[copy.breadcrumbRoot, copy.title]}
      searchPlaceholder={locale === "en" ? "Search pricing, versions, scope" : "搜尋定價、版本、scope"}
      avatarLabel="PA"
      env="production"
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <CanvasBtn theme={theme} onClick={handleRefresh} icon="arrow">
              {copy.manualRefresh}
            </CanvasBtn>
            {activeTab !== "history" ? (
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon="plus"
                onClick={() =>
                  handleAction(
                    { action: "create_draft", enabled: true, riskLevel: "medium" },
                    copy.title,
                  )
                }
              >
                {copy.createDraft}
              </CanvasBtn>
            ) : null}
          </>
        }
      />

      <div style={pageStackStyle}>
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
              <CanvasPill theme={theme} tone={activeTab === tab ? "accent" : "neutral"}>
                {String(counts[tab])}
              </CanvasPill>
            </button>
          ))}
        </div>

        <div style={gridStyle}>
          <div style={{ display: "grid", gap: 16 }}>
            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={theme}
                label={tabLabel(activeTab, locale)}
                value={String(activeTab === "history" ? visibleHistory.length : visibleItems.length)}
                sub={locale === "en" ? "visible rows" : "目前可見資料列"}
              />
              <CanvasKPI
                theme={theme}
                label={copy.actionsLabel}
                value={String(topLevelActions.filter((action) => action.enabled).length)}
                sub={locale === "en" ? "enabled top-level actions" : "目前啟用的頂層 action"}
              />
              <CanvasKPI
                theme={theme}
                label="Published"
                value={String(
                  [...PASSENGER_RULES, ...DRIVER_PLANS, ...SUBSIDY_RULES].filter(
                    (item) => item.status === "published",
                  ).length,
                )}
                sub={locale === "en" ? "cross-tab active versions" : "跨 tab 生效版本"}
              />
            </div>

            <CanvasCard theme={theme} title={copy.filtersTitle}>
              <div style={controlsGridStyle}>
                <CanvasField theme={theme} label={copy.emptyPreview}>
                  <select
                    value={emptyPreview}
                    onChange={(event) =>
                      setEmptyPreview(event.target.value as "live" | EmptyReason)
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
                      <option value="Passenger pricing">Passenger pricing</option>
                      <option value="Driver fee plan">Driver fee plan</option>
                      <option value="Subsidy rule">Subsidy rule</option>
                    </select>
                  </CanvasField>
                ) : null}
              </div>
            </CanvasCard>

            {refreshMetadata.dataFreshness !== "fresh" ? (
              <CanvasBanner
                theme={theme}
                tone="warn"
                title={locale === "en" ? "Pricing view is stale" : "Pricing 視圖已 stale"}
                body={locale === "en" ? "Use refresh before publishing or retiring a version." : "發布或 retire 前請先手動 refresh。"}
              />
            ) : null}

            <CanvasCard theme={theme} title={copy.conflictTitle} subtitle={copy.conflictBody}>
              {renderActions(topLevelActions, copy.title)}
            </CanvasCard>

            {activeTab === "history" ? (
              <CanvasCard theme={theme} title={copy.historyTitle} subtitle={copy.historySubtitle}>
                {visibleHistory.length === 0 ? (
                  <CanvasBanner
                    theme={theme}
                    tone="neutral"
                    title={copy.emptyLabels.filtered_empty}
                    body={locale === "en" ? "No published versions match the selected version lane." : "目前的版本類型篩選沒有符合資料。"}
                  />
                ) : (
                  <table style={tableStyle(theme)}>
                    <thead>
                      <tr>
                        <th style={tableHeadStyle(theme)}>Version lane</th>
                        <th style={tableHeadStyle(theme)}>Name</th>
                        <th style={tableHeadStyle(theme)}>{copy.scope}</th>
                        <th style={tableHeadStyle(theme)}>{copy.rowPublishedBy}</th>
                        <th style={tableHeadStyle(theme)}>{copy.rowSupersedes}</th>
                        <th style={tableHeadStyle(theme)}>{copy.actionsLabel}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHistory.map((row) => (
                        <tr key={row.id}>
                          <td style={tableCellStyle(theme)}>
                            <CanvasPill theme={theme} tone={toneForStatus(row.status)}>
                              {row.versionType}
                            </CanvasPill>
                          </td>
                          <td style={tableCellStyle(theme)}>
                            <div style={rowTitleStyle}>{row.name}</div>
                            <div style={rowSubtleStyle}>{formatDateTime(row.publishedAt)}</div>
                          </td>
                          <td style={tableCellStyle(theme)}>{row.scope}</td>
                          <td style={tableCellStyle(theme)}>
                            {row.publishedBy}
                          </td>
                          <td style={tableCellStyle(theme)}>{row.supersedes}</td>
                          <td style={tableCellStyle(theme)}>
                            <div style={{ display: "grid", gap: 8 }}>
                              {renderActions(row.availableActions, row.name)}
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CanvasCard>
            ) : showEmptyState && emptyDescriptor ? (
              <CanvasBanner
                theme={theme}
                tone={emptyDescriptor.tone}
                title={emptyDescriptor.title}
                body={emptyDescriptor.body}
              />
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {visibleItems.map((item) => (
                  <CanvasCard
                    key={item.id}
                    theme={theme}
                    title={item.name}
                    subtitle={`${item.version} · ${item.summary}`}
                    actions={
                      <CanvasPill theme={theme} tone={toneForStatus(item.status)}>
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
                          { label: item.metricA, value: item.metricB },
                          { label: copy.notes, value: item.notes },
                        ]}
                      />

                      <div style={detailGridStyle}>
                        <section style={policyCardStyle(theme)}>
                          <div style={sectionEyebrowStyle(theme)}>{copy.policy}</div>
                          <div style={detailListStyle}>
                            {item.quotedFareAuthority ? (
                              <div>
                                <strong>{copy.quotedFareAuthority}:</strong> {item.quotedFareAuthority}
                              </div>
                            ) : null}
                            {item.overrideActorTypes?.length ? (
                              <div>
                                <strong>{copy.overrideActors}:</strong> {item.overrideActorTypes.join(", ")}
                              </div>
                            ) : null}
                            {item.overrideRequiredFields?.length ? (
                              <div>
                                <strong>{copy.overrideFields}:</strong> {item.overrideRequiredFields.join(", ")}
                              </div>
                            ) : null}
                          </div>
                        </section>

                        <section style={policyCardStyle(theme)}>
                          <div style={sectionEyebrowStyle(theme)}>{copy.actionsLabel}</div>
                          {renderActions(item.availableActions, item.name)}
                        </section>
                      </div>

                      {item.crossLinks?.length ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={sectionEyebrowStyle(theme)}>{copy.links}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                            {item.crossLinks.map((link) => (
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
                              href="/audit?resourceType=pricing"
                              target="_blank"
                              rel="noreferrer"
                              style={linkStyle(theme)}
                            >
                              {copy.auditLink}
                            </a>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </CanvasCard>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <RefreshMeta copy={copy} metadata={refreshMetadata} theme={theme} />

            <CanvasCard
              theme={theme}
              title={locale === "en" ? "EmptyReason contract" : "EmptyReason contract"}
              subtitle={locale === "en" ? "All six packet-required states render distinctly." : "依 packet 要求，六種狀態需各自獨立呈現。"}
            >
              <div style={{ display: "grid", gap: 8 }}>
                {(
                  [
                    "no_data",
                    "not_provisioned",
                    "fetch_failed",
                    "permission_denied",
                    "external_unavailable",
                    "filtered_empty",
                  ] as EmptyReason[]
                ).map((reason) => (
                  <div key={reason} style={legendRowStyle}>
                    <CanvasPill theme={theme} tone={emptyStateDescriptor(reason, locale).tone}>
                      {reason}
                    </CanvasPill>
                    <span style={{ color: theme.textMuted }}>
                      {copy.emptyLabels[reason]}
                    </span>
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

function actionButtonStyle(theme: CanvasTheme, action: ResourceActionDescriptor) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 34,
    padding: "6px 10px",
    borderRadius: 10,
    border: `1px solid ${action.enabled ? theme.border : theme.neutralBorder}`,
    background: action.enabled ? theme.surfaceHi : theme.neutralBg,
    color: action.enabled ? theme.text : theme.textDim,
    cursor: action.enabled ? "pointer" : "not-allowed",
    opacity: action.enabled ? 1 : 0.68,
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

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const controlsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

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

function tableStyle(theme: CanvasTheme) {
  return {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
    color: theme.text,
  };
}

function tableHeadStyle(theme: CanvasTheme) {
  return {
    textAlign: "left" as const,
    padding: "0 0 10px",
    borderBottom: `1px solid ${theme.border}`,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: theme.textDim,
  };
}

function tableCellStyle(theme: CanvasTheme) {
  return {
    padding: "14px 10px 14px 0",
    borderBottom: `1px solid ${theme.border}`,
    verticalAlign: "top" as const,
  };
}

const rowTitleStyle = {
  fontWeight: 700,
};

const rowSubtleStyle = {
  color: "#64748b",
  fontSize: 12,
  marginTop: 4,
};

const detailGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

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
