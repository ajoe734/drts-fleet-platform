"use client";

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  CrossAppResourceLink,
  DriverFeePlanRecord,
  EmptyReason,
  PlatformPricingRuleRecord,
  ProductRuleCatalog,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type PricingTab = "passenger" | "driver" | "subsidy" | "history";
type RuleStatusFilter = "all" | "published" | "draft" | "retired";
type HistoryTypeFilter = "all" | "passenger" | "driver";
type HistoryPeriodFilter = "7d" | "30d" | "90d" | "all";
type RefreshSource = "initial" | "manual" | "interval";

type PricingFormState = {
  ruleName: string;
  version: string;
  serviceFeeBps: string;
  reimbursementMode: "platform_funded" | "mixed";
  applicableTo: string;
  notes: string;
};

type PublishRuleFormState = {
  effectiveFrom: string;
  effectiveTo: string;
  reason: string;
};

type FeePlanFormState = {
  planName: string;
  version: string;
  serviceFeeBps: string;
  reimbursementMode: "platform_funded" | "mixed";
  reason: string;
};

type ListEmptyState = {
  reason: EmptyReason;
  messageCode: string;
  nextAction?: ResourceActionDescriptor;
};

type ResourceListEnvelope<T> = {
  items?: T[];
  emptyState?: ListEmptyState | null;
  availableActions?: ResourceActionDescriptor[];
};

type ActionableResource = {
  availableActions?: ResourceActionDescriptor[];
};

type PricingRuleResource = PlatformPricingRuleRecord & ActionableResource;
type DriverFeePlanResource = DriverFeePlanRecord & ActionableResource;

type PricingListState<T> = {
  items: T[];
  emptyState: ListEmptyState | null;
  availableActions: ResourceActionDescriptor[];
};

type PricingRuleRow = Record<string, unknown> &
  PricingRuleResource & {
    displayStatus: string;
  };

type FeePlanRow = Record<string, unknown> &
  DriverFeePlanResource & {
    scopeLabel: string;
    linkageLabel: string;
  };

type HistoryRow = Record<string, unknown> & {
  itemId: string;
  tabType: "passenger" | "driver";
  displayType: string;
  name: string;
  version: string;
  scope: string;
  status: string;
  publishedAt: string;
  publishedBy: string;
  auditHref: string;
};

const PRICING_TABS: PricingTab[] = [
  "passenger",
  "driver",
  "subsidy",
  "history",
];

const EMPTY_REASONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

const HISTORY_PERIOD_MS: Record<Exclude<HistoryPeriodFilter, "all">, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

const PRICING_REFRESH_MS = 30_000;

const EMPTY_PRICING_FORM: PricingFormState = {
  ruleName: "",
  version: "",
  serviceFeeBps: "1500",
  reimbursementMode: "platform_funded",
  applicableTo: "all",
  notes: "",
};

const EMPTY_PUBLISH_RULE_FORM: PublishRuleFormState = {
  effectiveFrom: "",
  effectiveTo: "",
  reason: "",
};

const EMPTY_FEE_PLAN_FORM: FeePlanFormState = {
  planName: "",
  version: "",
  serviceFeeBps: "1500",
  reimbursementMode: "platform_funded",
  reason: "",
};

const ACTION_GROUPS = {
  createRule: [
    "createPlatformPricingRule",
    "create_platform_pricing_rule",
    "createPricingDraft",
  ],
  editRule: [
    "editPlatformPricingRule",
    "edit_platform_pricing_rule",
    "editPricingDraft",
  ],
  publishRule: ["publishPlatformPricingRule", "publish_platform_pricing_rule"],
  retireRule: [
    "retirePlatformPricingRule",
    "retire_platform_pricing_rule",
    "retirePublishedPricingRule",
  ],
  publishPlan: ["publishDriverFeePlan", "publish_driver_fee_plan"],
  viewHistory: [
    "viewPricingVersionHistory",
    "view_pricing_version_history",
    "viewVersionHistory",
  ],
} as const;

const theme = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

const pageRootStyle: CSSProperties = {
  minHeight: "100%",
  background: theme.bg,
  color: theme.text,
  borderRadius: 12,
  overflow: "hidden",
  fontFamily: theme.fontFamily,
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const loadingStyle: CSSProperties = {
  padding: 24,
  color: theme.textMuted,
  fontFamily: theme.fontFamily,
};

const surfaceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.75fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const sideStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const summaryRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const tabPickerStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const tabButtonStyle = (active: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 34,
  padding: "7px 12px",
  borderRadius: 999,
  border: `1px solid ${active ? theme.accentBorder : theme.border}`,
  background: active ? theme.accentBg : theme.bgRaised,
  color: active ? theme.text : theme.textMuted,
  cursor: "pointer",
  fontSize: 12.5,
  fontWeight: active ? 600 : 500,
  fontFamily: theme.fontFamily,
});

const mutedTextStyle: CSSProperties = {
  margin: 0,
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.5,
};

const helperMonoStyle: CSSProperties = {
  margin: 0,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
  lineHeight: 1.45,
};

const stackedCellStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const detailListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const detailRowStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const detailLabelStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 11.5,
};

const detailValueStyle: CSSProperties = {
  color: theme.text,
  fontSize: 12.5,
  lineHeight: 1.45,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 14,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
};

const monoInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: theme.monoFamily,
};

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 92,
  resize: "vertical",
};

const formActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  flexWrap: "wrap",
  gap: 8,
};

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 120,
  minHeight: 30,
  padding: "6px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.accent}`,
  background: theme.accent,
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: theme.fontFamily,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
});

const splitStatsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const statBlockStyle: CSSProperties = {
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  padding: 12,
  display: "grid",
  gap: 6,
};

const emptyStateStyle = (tone: CanvasTone): CSSProperties => {
  const borderColor =
    tone === "danger"
      ? theme.dangerBorder
      : tone === "warn"
        ? theme.warnBorder
        : tone === "info"
          ? theme.infoBorder
          : theme.border;

  const background =
    tone === "danger"
      ? theme.dangerBg
      : tone === "warn"
        ? theme.warnBg
        : tone === "info"
          ? theme.infoBg
          : theme.bgRaised;

  return {
    borderRadius: 12,
    border: `1px solid ${borderColor}`,
    background,
    padding: 16,
    display: "grid",
    gap: 10,
  };
};

const linkListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const linkRowStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  paddingBottom: 10,
  borderBottom: `1px solid ${theme.border}`,
};

const linkAnchorStyle: CSSProperties = {
  color: theme.accent,
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "none",
};

const lineStyle: CSSProperties = {
  height: 1,
  background: theme.border,
};

function isPricingTab(value: string | null): value is PricingTab {
  return value !== null && PRICING_TABS.includes(value as PricingTab);
}

function isEmptyReason(value: string | null): value is EmptyReason {
  return value !== null && EMPTY_REASONS.includes(value as EmptyReason);
}

function normalizeDateTimeLocalValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return { localValue: "", isoValue: null };
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return { localValue: normalized, isoValue: null };
  }

  const localValue = [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ]
    .join("-")
    .concat("T")
    .concat(
      [
        String(parsed.getHours()).padStart(2, "0"),
        String(parsed.getMinutes()).padStart(2, "0"),
      ].join(":"),
    );

  return {
    localValue,
    isoValue: parsed.toISOString(),
  };
}

function formatBps(locale: string, value: number) {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function formatPercent(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function pricingStatusLabel(
  locale: string,
  status: PlatformPricingRuleRecord["status"],
) {
  if (status === "active") {
    return locale === "en" ? "published" : "已發布";
  }
  if (status === "archived") {
    return locale === "en" ? "retired" : "已退役";
  }
  return locale === "en" ? "draft" : "草稿";
}

function pricingStatusTone(
  status: PlatformPricingRuleRecord["status"] | DriverFeePlanRecord["status"],
): CanvasTone {
  if (status === "active" || status === "published") {
    return "success";
  }
  if (status === "draft") {
    return "warn";
  }
  return "neutral";
}

function riskTone(
  riskLevel: ResourceActionDescriptor["riskLevel"],
): CanvasTone {
  if (riskLevel === "high") {
    return "warn";
  }
  if (riskLevel === "medium") {
    return "accent";
  }
  return "neutral";
}

function scopeLabel(locale: string, scope: string) {
  if (scope === "all") {
    return locale === "en" ? "all tenants" : "全部租戶";
  }
  return scope;
}

function reimbursementModeLabel(
  copy: {
    reimbursementModes: {
      platform_funded: string;
      mixed: string;
    };
  },
  mode: "platform_funded" | "mixed",
) {
  return mode === "mixed"
    ? copy.reimbursementModes.mixed
    : copy.reimbursementModes.platform_funded;
}

function normalizeListResponse<T>(
  response: T[] | ResourceListEnvelope<T>,
): PricingListState<T> {
  if (Array.isArray(response)) {
    return {
      items: response,
      emptyState: null,
      availableActions: [],
    };
  }

  return {
    items: response.items ?? [],
    emptyState: response.emptyState ?? null,
    availableActions: response.availableActions ?? [],
  };
}

function actionMatches(
  descriptor: ResourceActionDescriptor,
  actions: readonly string[],
) {
  return actions.some((item) => item === descriptor.action);
}

function mergeActions(
  ...actionLists: Array<ResourceActionDescriptor[] | undefined>
): ResourceActionDescriptor[] {
  const byName = new Map<string, ResourceActionDescriptor>();
  for (const actionList of actionLists) {
    for (const descriptor of actionList ?? []) {
      if (!byName.has(descriptor.action)) {
        byName.set(descriptor.action, descriptor);
        continue;
      }
      const existing = byName.get(descriptor.action);
      if (existing && !existing.enabled && descriptor.enabled) {
        byName.set(descriptor.action, descriptor);
      }
    }
  }
  return [...byName.values()];
}

function fallbackRuleListActions(
  rules: PricingRuleResource[],
): ResourceActionDescriptor[] {
  return mergeActions(
    [
      {
        action: "createPlatformPricingRule",
        enabled: true,
        riskLevel: "medium",
      },
      {
        action: "viewPricingVersionHistory",
        enabled: rules.length > 0,
        riskLevel: "low",
      },
    ],
    rules.flatMap((rule) => fallbackRuleActions(rule)),
  );
}

function fallbackRuleActions(
  rule: PricingRuleResource,
): ResourceActionDescriptor[] {
  const actions: ResourceActionDescriptor[] = [
    {
      action: "viewPricingVersionHistory",
      enabled: true,
      riskLevel: "low",
    },
  ];

  if (rule.status === "draft") {
    actions.unshift(
      {
        action: "publishPlatformPricingRule",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      },
      {
        action: "editPlatformPricingRule",
        enabled: false,
        disabledReasonCode: "contract_unavailable",
        riskLevel: "medium",
      },
    );
  }

  if (rule.status === "active") {
    actions.unshift({
      action: "retirePlatformPricingRule",
      enabled: false,
      disabledReasonCode: "contract_unavailable",
      requiresReason: true,
      riskLevel: "high",
    });
  }

  return actions;
}

function fallbackFeePlanListActions(
  feePlans: DriverFeePlanResource[],
): ResourceActionDescriptor[] {
  return mergeActions(
    [
      {
        action: "publishDriverFeePlan",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      },
      {
        action: "viewPricingVersionHistory",
        enabled: feePlans.length > 0,
        riskLevel: "low",
      },
    ],
    feePlans.flatMap(() => fallbackFeePlanActions()),
  );
}

function fallbackFeePlanActions(): ResourceActionDescriptor[] {
  return [
    {
      action: "viewPricingVersionHistory",
      enabled: true,
      riskLevel: "low",
    },
  ];
}

function buildAuditHref(resourceType: string, resourceId: string) {
  const params = new URLSearchParams();
  params.set("resourceType", resourceType);
  params.set("resourceId", resourceId);
  return `/audit?${params.toString()}`;
}

function getCrossAppBaseUrl(targetApp: CrossAppResourceLink["targetApp"]) {
  if (targetApp === "platform-admin") {
    return (
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3102"
    );
  }
  if (targetApp === "ops-console") {
    return process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3103";
  }
  return process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3104";
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  if (link.targetApp === "platform-admin") {
    return link.route;
  }
  return new URL(
    link.route,
    `${getCrossAppBaseUrl(link.targetApp)}/`,
  ).toString();
}

function actionLabel(locale: string, descriptor: ResourceActionDescriptor) {
  if (actionMatches(descriptor, ACTION_GROUPS.createRule)) {
    return locale === "en" ? "Create draft" : "建立草稿";
  }
  if (actionMatches(descriptor, ACTION_GROUPS.editRule)) {
    return locale === "en" ? "Edit draft" : "編輯草稿";
  }
  if (actionMatches(descriptor, ACTION_GROUPS.publishRule)) {
    return locale === "en" ? "Publish rule" : "發布規則";
  }
  if (actionMatches(descriptor, ACTION_GROUPS.retireRule)) {
    return locale === "en" ? "Retire" : "退役";
  }
  if (actionMatches(descriptor, ACTION_GROUPS.publishPlan)) {
    return locale === "en" ? "Publish fee plan" : "發布司機費用方案";
  }
  if (actionMatches(descriptor, ACTION_GROUPS.viewHistory)) {
    return locale === "en" ? "View history" : "檢視版本歷史";
  }
  return descriptor.action;
}

function disabledReasonLabel(locale: string, code?: string) {
  if (!code) {
    return null;
  }
  if (code === "contract_unavailable") {
    return locale === "en"
      ? "Current platform-admin contract does not expose this mutation yet."
      : "目前 platform-admin contract 尚未暴露這個 mutation。";
  }
  return code;
}

function routeMapCopy(locale: string) {
  return [
    {
      route: "/pricing?tab=passenger",
      label: locale === "en" ? "Passenger Pricing" : "乘客計價",
      body:
        locale === "en"
          ? "Pricing rules, quoted-fare authority, scope conflict review."
          : "定價規則、quoted fare authority 與 scope 衝突檢查。",
    },
    {
      route: "/pricing?tab=driver",
      label: locale === "en" ? "Driver Fee Plans" : "司機費用方案",
      body:
        locale === "en"
          ? "Immutable fee-plan versions used by statements, payouts, and subsidy linkage."
          : "供 statement、payout 與 subsidy linkage 使用的 immutable 版本。",
    },
    {
      route: "/pricing?tab=subsidy",
      label:
        locale === "en" ? "Subsidy / Reimbursement Rules" : "補貼 / 報銷規則",
      body:
        locale === "en"
          ? "Govern reimbursement modes and hand off to reimbursement operations."
          : "治理 reimbursement mode，並銜接報銷作業面。",
    },
    {
      route: "/pricing?tab=history",
      label: locale === "en" ? "Published Versions" : "已發布版本",
      body:
        locale === "en"
          ? "Cross-tab chronology filtered by type, scope, and period."
          : "跨分頁版本時間線，可依類型、scope 與期間篩選。",
    },
  ];
}

function emptyStateCopy(locale: string, reason: EmptyReason) {
  if (reason === "not_provisioned") {
    return {
      tone: "info" as const,
      title: locale === "en" ? "Not provisioned yet" : "尚未佈建",
      body:
        locale === "en"
          ? "The backend has not provisioned this pricing surface yet. Use the suggested next action or related deep links."
          : "後端尚未佈建這個 pricing surface。請改用建議的 next action 或相關 deep link。",
    };
  }
  if (reason === "fetch_failed") {
    return {
      tone: "danger" as const,
      title: locale === "en" ? "Refresh failed" : "重新整理失敗",
      body:
        locale === "en"
          ? "This list could not be refreshed. Review the error banner, then retry or open audit for the last known state."
          : "這個清單無法重新整理。請先看錯誤 banner，再重試或開啟 audit 檢查上一個已知狀態。",
    };
  }
  if (reason === "permission_denied") {
    return {
      tone: "warn" as const,
      title:
        locale === "en" ? "Read-only for current authority" : "目前權限僅可讀",
      body:
        locale === "en"
          ? "No records are exposed for the current authority scope. CTA visibility must come from availableActions."
          : "目前 authority scope 沒有可操作資料。CTA 必須以 availableActions 為準。",
    };
  }
  if (reason === "external_unavailable") {
    return {
      tone: "warn" as const,
      title:
        locale === "en" ? "External dependency unavailable" : "外部依賴不可用",
      body:
        locale === "en"
          ? "A dependent system is unavailable. Review cross-app links before retrying the pricing action."
          : "相依系統目前不可用。請先檢查 cross-app deep link，再重試 pricing 動作。",
    };
  }
  if (reason === "filtered_empty") {
    return {
      tone: "neutral" as const,
      title:
        locale === "en" ? "No matches for current filter" : "目前篩選沒有結果",
      body:
        locale === "en"
          ? "The list has data, but the current filter set hides all of it."
          : "資料存在，但目前的篩選條件把它們全部排除了。",
    };
  }
  return {
    tone: "neutral" as const,
    title: locale === "en" ? "No pricing data yet" : "目前沒有定價資料",
    body:
      locale === "en"
        ? "There are no records for this surface yet. Start with a create or publish action when available."
        : "這個面向目前還沒有資料。若有對應 action，可從建立或發布開始。",
  };
}

function firstEnabledAction(
  actions: ResourceActionDescriptor[],
  matcher: readonly string[],
) {
  return actions.find(
    (descriptor) => descriptor.enabled && actionMatches(descriptor, matcher),
  );
}

function visibleActionList(
  runtimeActions: ResourceActionDescriptor[],
  fallbackActions: ResourceActionDescriptor[],
) {
  return runtimeActions.length > 0 ? runtimeActions : fallbackActions;
}

export default function PricingPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = isPricingTab(searchParams.get("tab"))
    ? (searchParams.get("tab") as PricingTab)
    : "passenger";
  const debugEmptyReason = isEmptyReason(searchParams.get("emptyReason"))
    ? (searchParams.get("emptyReason") as EmptyReason)
    : null;
  const debugEmptyTarget = isPricingTab(searchParams.get("emptyTarget"))
    ? (searchParams.get("emptyTarget") as PricingTab)
    : null;

  const copy =
    locale === "en"
      ? {
          title: "Pricing Governance",
          subtitle:
            "Passenger pricing · driver fee plans · subsidy / reimbursement rules · published versions",
          tabs: {
            passenger: "Passenger Pricing",
            driver: "Driver Fee Plans",
            subsidy: "Subsidy / Reimbursement Rules",
            history: "Published Versions",
          },
          refreshTier: "T4 refresh tier · every 30s",
          refreshLabel: "Refresh",
          autoRefresh:
            "Auto-refresh keeps this workspace aligned with the T4 30-second admin cadence.",
          routeMapTitle: "Pricing sitemap",
          routeMapSubtitle:
            "The page follows the packet's 4-tab structure and keeps audit / reimbursements exits close.",
          authorityTitle: "Canonical quoted-fare authority",
          authorityFallback:
            "Backend remains the only quoted-fare authority. Manual overrides still need actor, reason, and trace evidence.",
          contractGapTitle: "Contract notes",
          contractGapBody:
            "Current shared contracts expose pricing rules, fee plans, and quoted-fare authority. Dedicated subsidy-rule and manual-retire endpoints are not provisioned in this surface yet.",
          roles: "Primary roles: pa_finance_gov · pa_super_admin",
          lastRefresh: (value: string, source: RefreshSource) =>
            `Last refresh ${value} · ${source === "interval" ? "interval" : source}`,
          counts: {
            drafts: "drafts",
            published: "published",
            retired: "retired",
            feePlans: "fee plans",
          },
          createDraftCard: "Create pricing draft",
          createDraftCopy:
            "Create a draft version before conflict review and high-risk publish.",
          publishRuleCard: "Publish selected draft",
          publishRuleCopy:
            "Publishing is high risk and requires a reason before the atomic version swap.",
          driverPlanCard: "Publish driver fee plan",
          driverPlanCopy:
            "Published driver fee plans are immutable and feed statement / payout generation.",
          reasonLabel: "Reason",
          reasonRequired:
            "High-risk pricing actions require a non-empty reason before submit.",
          effectiveFrom: "Effective from",
          effectiveTo: "Effective to",
          publishWindowHint:
            "Leave either field blank to preserve the stored draft window.",
          passengerTitle: "Passenger Pricing",
          passengerSubtitle:
            "Versioned pricing rules, rule-scoped CTAs, and quoted-fare authority.",
          driverTitle: "Driver Fee Plans",
          driverSubtitle:
            "Immutable plan versions used for settlements, statements, and subsidy linkage.",
          subsidyTitle: "Subsidy / Reimbursement Governance",
          subsidySubtitle:
            "Reimbursement modes drive downstream reimbursement operations and manual-review lanes.",
          historyTitle: "Published Versions",
          historySubtitle:
            "Cross-tab chronology filtered by type, scope, and period.",
          ruleDetailTitle: "Selected rule details",
          planDetailTitle: "Selected fee plan details",
          noRuleSelection:
            "Select a pricing rule to review actions and authority.",
          noPlanSelection:
            "Select a fee plan to inspect immutable settlement metadata.",
          crossAppTitle: "Cross-app deep links",
          crossAppSubtitle:
            "Pricing governance uses new-tab handoffs when revenue impact or dispatch override review lives in another app.",
          subsidyInsightsTitle: "Reimbursement linkage",
          subsidyInsightsSubtitle:
            "Derived from the current pricing rules and fee plans until a dedicated subsidy-rule feed lands.",
          versionHistoryEmpty:
            "No published versions match the active filters.",
          noHistoryYet:
            "No pricing or fee-plan versions have been published yet.",
          openEnded: "open-ended",
          scopeFallback: "all drivers",
          linkageMixed: "manual reimbursement review required",
          linkagePlatform: "platform-funded reimbursement path",
          unsupportedEdit:
            "Edit draft is not exposed by the current platform-admin API surface yet.",
          unsupportedRetire:
            "Manual retire is not exposed by the current platform-admin API surface yet.",
          unsupportedAction: (action: string) =>
            `No handler is wired for ${action} in this UI surface yet.`,
          createSuccess: (ruleName: string, version: string) =>
            `Draft created for ${ruleName} · ${version}.`,
          publishSuccess: (version: string) =>
            `Pricing rule ${version} published. Review audit and downstream ops surfaces.`,
          feePlanSuccess: (version: string) =>
            `Driver fee plan ${version} published.`,
          auditPrompt: "Open audit trail",
          opsRevenueLabel: "Open ops revenue impact",
          opsDispatchLabel: "Open ops dispatch overrides",
          reimbursementLabel: "Open reimbursement queue",
          nextActionLabel: "Suggested next action",
          filters: {
            all: "All",
            published: "Published",
            draft: "Drafts",
            retired: "Retired",
            historyType: "Type",
            historyScope: "Scope",
            historyPeriod: "Period",
            period7: "7 days",
            period30: "30 days",
            period90: "90 days",
            periodAll: "All time",
          },
          ruleColumns: {
            version: "VERSION",
            name: "Rule",
            scope: "SCOPE",
            fee: "SERVICE FEE",
            reimburse: "REIMBURSEMENT",
            status: "STATUS",
            actions: "ACTIONS",
          },
          planColumns: {
            plan: "Plan",
            version: "VERSION",
            scope: "SCOPE",
            linkage: "SUBSIDY LINKAGE",
            status: "STATUS",
            published: "PUBLISHED",
            actions: "ACTIONS",
          },
          historyColumns: {
            publishedAt: "PUBLISHED",
            type: "TYPE",
            name: "Name",
            scope: "SCOPE",
            version: "VERSION",
            status: "STATUS",
            link: "LINK",
          },
          forms: {
            ruleName: "Rule name",
            version: "Version",
            serviceFeeBps: "Service fee (bps)",
            reimbursementMode: "Reimbursement mode",
            applicableTo: "Applicable scope",
            notes: "Notes",
            planName: "Plan name",
          },
          reimbursementModes: {
            platform_funded: "platform funded",
            mixed: "mixed",
          },
          buttons: {
            cancel: "Cancel",
            create: "Create draft",
            creating: "Creating...",
            publish: "Publish",
            publishing: "Publishing...",
            select: "Select",
            showComposer: "New fee plan",
            hideComposer: "Hide composer",
          },
        }
      : {
          title: "計價治理",
          subtitle: "乘客計價 · 司機費用方案 · 補貼 / 報銷規則 · 已發布版本",
          tabs: {
            passenger: "乘客計價",
            driver: "司機費用方案",
            subsidy: "補貼 / 報銷規則",
            history: "已發布版本",
          },
          refreshTier: "T4 refresh tier · 每 30 秒",
          refreshLabel: "重新整理",
          autoRefresh: "這個工作台會依照 T4 的 30 秒節奏自動刷新。",
          routeMapTitle: "Pricing sitemap",
          routeMapSubtitle:
            "頁面依 packet 的 4-tab 結構實作，並把 audit / reimbursements 出口放在近處。",
          authorityTitle: "Canonical quoted-fare authority",
          authorityFallback:
            "後端仍是 quoted fare 的唯一 authority。任何 manual override 仍需要 actor、reason 與 trace 證據。",
          contractGapTitle: "Contract 備註",
          contractGapBody:
            "目前 shared contract 僅暴露 pricing rule、fee plan 與 quoted-fare authority。專用 subsidy-rule feed 與 manual-retire endpoint 尚未在這個 surface 佈建。",
          roles: "主要角色：pa_finance_gov · pa_super_admin",
          lastRefresh: (value: string, source: RefreshSource) =>
            `最後刷新 ${value} · ${source === "interval" ? "自動" : source === "manual" ? "手動" : "初始"}`,
          counts: {
            drafts: "草稿",
            published: "已發布",
            retired: "已退役",
            feePlans: "費用方案",
          },
          createDraftCard: "建立定價草稿",
          createDraftCopy: "先建立 draft version，再做衝突檢查與高風險發布。",
          publishRuleCard: "發布選取草稿",
          publishRuleCopy:
            "發布屬於高風險動作，atomic version swap 前必須填寫 reason。",
          driverPlanCard: "發布司機費用方案",
          driverPlanCopy:
            "司機費用方案發布後不可變更，供 statement / payout generation 使用。",
          reasonLabel: "Reason",
          reasonRequired: "高風險計價動作在送出前必須填寫非空白 reason。",
          effectiveFrom: "生效時間",
          effectiveTo: "失效時間",
          publishWindowHint: "任一欄位留空時，沿用草稿原本儲存的時間區間。",
          passengerTitle: "乘客計價",
          passengerSubtitle:
            "版本化 pricing rule、以規則為單位的 CTA，以及 quoted-fare authority。",
          driverTitle: "司機費用方案",
          driverSubtitle:
            "供結算、statement 與 subsidy linkage 使用的 immutable 方案版本。",
          subsidyTitle: "補貼 / 報銷治理",
          subsidySubtitle:
            "reimbursement mode 會決定後續報銷作業與 manual-review lane。",
          historyTitle: "已發布版本",
          historySubtitle:
            "跨分頁版本時間線，可依 type、scope 與 period 篩選。",
          ruleDetailTitle: "選取規則詳情",
          planDetailTitle: "選取費用方案詳情",
          noRuleSelection:
            "請先選一條 pricing rule，再檢查 action 與 authority。",
          noPlanSelection:
            "請先選一條 fee plan，再檢查 immutable settlement metadata。",
          crossAppTitle: "Cross-app deep links",
          crossAppSubtitle:
            "Pricing 治理在 revenue impact 或 dispatch override review 落在其他 app 時，會以新分頁移交。",
          subsidyInsightsTitle: "報銷 linkage",
          subsidyInsightsSubtitle:
            "在 dedicated subsidy-rule feed 落地前，先依現有 pricing rule 與 fee plan 推導治理摘要。",
          versionHistoryEmpty: "目前篩選條件下沒有符合的已發布版本。",
          noHistoryYet: "目前還沒有已發布的 pricing / fee-plan 版本。",
          openEnded: "未設定截止",
          scopeFallback: "全部司機",
          linkageMixed: "需要人工報銷審核",
          linkagePlatform: "平台資助報銷路徑",
          unsupportedEdit:
            "目前 platform-admin API surface 尚未暴露 draft edit。",
          unsupportedRetire:
            "目前 platform-admin API surface 尚未暴露 manual retire。",
          unsupportedAction: (action: string) =>
            `這個 UI surface 尚未為 ${action} 接上 handler。`,
          createSuccess: (ruleName: string, version: string) =>
            `已建立 ${ruleName} · ${version} 草稿。`,
          publishSuccess: (version: string) =>
            `已發布 pricing rule ${version}，請同步檢查 audit 與下游 ops surface。`,
          feePlanSuccess: (version: string) =>
            `已發布司機費用方案 ${version}。`,
          auditPrompt: "開啟 audit trail",
          opsRevenueLabel: "開啟 ops revenue impact",
          opsDispatchLabel: "開啟 ops dispatch overrides",
          reimbursementLabel: "開啟報銷佇列",
          nextActionLabel: "建議 next action",
          filters: {
            all: "全部",
            published: "已發布",
            draft: "草稿",
            retired: "已退役",
            historyType: "類型",
            historyScope: "Scope",
            historyPeriod: "期間",
            period7: "7 天",
            period30: "30 天",
            period90: "90 天",
            periodAll: "全部時間",
          },
          ruleColumns: {
            version: "版本",
            name: "規則",
            scope: "SCOPE",
            fee: "SERVICE FEE",
            reimburse: "報銷",
            status: "狀態",
            actions: "操作",
          },
          planColumns: {
            plan: "方案",
            version: "版本",
            scope: "SCOPE",
            linkage: "補貼 linkage",
            status: "狀態",
            published: "發布時間",
            actions: "操作",
          },
          historyColumns: {
            publishedAt: "發布時間",
            type: "類型",
            name: "名稱",
            scope: "SCOPE",
            version: "版本",
            status: "狀態",
            link: "連結",
          },
          forms: {
            ruleName: "規則名稱",
            version: "版本",
            serviceFeeBps: "服務費（bps）",
            reimbursementMode: "報銷模式",
            applicableTo: "適用 scope",
            notes: "備註",
            planName: "方案名稱",
          },
          reimbursementModes: {
            platform_funded: "平台資助",
            mixed: "混合",
          },
          buttons: {
            cancel: "取消",
            create: "建立草稿",
            creating: "建立中...",
            publish: "發布",
            publishing: "發布中...",
            select: "選取",
            showComposer: "新增費用方案",
            hideComposer: "隱藏表單",
          },
        };

  const [pricingRulesState, setPricingRulesState] = useState<
    PricingListState<PricingRuleResource>
  >({
    items: [],
    emptyState: null,
    availableActions: [],
  });
  const [feePlansState, setFeePlansState] = useState<
    PricingListState<DriverFeePlanResource>
  >({
    items: [],
    emptyState: null,
    availableActions: [],
  });
  const [productRuleCatalog, setProductRuleCatalog] =
    useState<ProductRuleCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionAuditHref, setActionAuditHref] = useState<string | null>(null);
  const [ruleStatusFilter, setRuleStatusFilter] =
    useState<RuleStatusFilter>("all");
  const [historyTypeFilter, setHistoryTypeFilter] =
    useState<HistoryTypeFilter>("all");
  const [historyScopeFilter, setHistoryScopeFilter] = useState("all");
  const [historyPeriodFilter, setHistoryPeriodFilter] =
    useState<HistoryPeriodFilter>("30d");
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showCreateRuleForm, setShowCreateRuleForm] = useState(false);
  const [showFeePlanForm, setShowFeePlanForm] = useState(false);
  const [creatingRule, setCreatingRule] = useState(false);
  const [publishingRuleId, setPublishingRuleId] = useState<string | null>(null);
  const [publishingFeePlan, setPublishingFeePlan] = useState(false);
  const [pricingForm, setPricingForm] =
    useState<PricingFormState>(EMPTY_PRICING_FORM);
  const [publishRuleForm, setPublishRuleForm] = useState<PublishRuleFormState>(
    EMPTY_PUBLISH_RULE_FORM,
  );
  const [feePlanForm, setFeePlanForm] =
    useState<FeePlanFormState>(EMPTY_FEE_PLAN_FORM);
  const [publishRuleFormError, setPublishRuleFormError] = useState<
    string | null
  >(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [lastRefreshSource, setLastRefreshSource] =
    useState<RefreshSource>("initial");

  const setTab = useCallback(
    (tab: PricingTab) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("tab", tab);
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadData = useCallback(
    async (source: RefreshSource) => {
      setLoading((current) => (source === "initial" ? true : current));
      setError(null);
      try {
        const [pricingRulesResponse, feePlansResponse, catalog] =
          await Promise.all([
            client.get<
              PricingRuleResource[] | ResourceListEnvelope<PricingRuleResource>
            >("/api/platform-admin/pricing-rules"),
            client.get<
              | DriverFeePlanResource[]
              | ResourceListEnvelope<DriverFeePlanResource>
            >("/api/driver-fee-plans"),
            client.getProductRuleCatalog(),
          ]);

        setPricingRulesState(normalizeListResponse(pricingRulesResponse));
        setFeePlansState(normalizeListResponse(feePlansResponse));
        setProductRuleCatalog(catalog);
        setLastRefreshedAt(new Date().toISOString());
        setLastRefreshSource(source);
      } catch (nextError: unknown) {
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadData("initial");
  }, [loadData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadData("interval");
    }, PRICING_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [loadData]);

  const pricingRules = [...pricingRulesState.items].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const feePlans = [...feePlansState.items].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() -
      new Date(left.publishedAt).getTime(),
  );

  const filteredPricingRules = pricingRules.filter((rule) => {
    if (ruleStatusFilter === "all") {
      return true;
    }
    if (ruleStatusFilter === "published") {
      return rule.status === "active";
    }
    if (ruleStatusFilter === "retired") {
      return rule.status === "archived";
    }
    return rule.status === "draft";
  });

  const selectedRule =
    filteredPricingRules.find((rule) => rule.ruleId === selectedRuleId) ??
    pricingRules.find((rule) => rule.ruleId === selectedRuleId) ??
    filteredPricingRules[0] ??
    pricingRules[0] ??
    null;

  const selectedPlan =
    feePlans.find((plan) => plan.feePlanId === selectedPlanId) ??
    feePlans[0] ??
    null;

  useEffect(() => {
    const firstRule = pricingRules[0];
    if (!selectedRule && firstRule) {
      setSelectedRuleId(firstRule.ruleId);
    }
  }, [pricingRules, selectedRule]);

  useEffect(() => {
    const firstPlan = feePlans[0];
    if (!selectedPlan && firstPlan) {
      setSelectedPlanId(firstPlan.feePlanId);
    }
  }, [feePlans, selectedPlan]);

  const ruleCounts = {
    drafts: pricingRules.filter((rule) => rule.status === "draft").length,
    published: pricingRules.filter((rule) => rule.status === "active").length,
    retired: pricingRules.filter((rule) => rule.status === "archived").length,
  };

  const pageRuleActions = visibleActionList(
    pricingRulesState.availableActions,
    fallbackRuleListActions(pricingRules),
  );
  const pageFeePlanActions = visibleActionList(
    feePlansState.availableActions,
    fallbackFeePlanListActions(feePlans),
  );
  const selectedRuleActions = visibleActionList(
    selectedRule?.availableActions ?? [],
    selectedRule ? fallbackRuleActions(selectedRule) : [],
  );
  const selectedPlanActions = visibleActionList(
    selectedPlan?.availableActions ?? [],
    selectedPlan ? fallbackFeePlanActions() : [],
  );

  const createRuleAction = firstEnabledAction(
    pageRuleActions,
    ACTION_GROUPS.createRule,
  );
  const publishRuleAction = firstEnabledAction(
    selectedRuleActions,
    ACTION_GROUPS.publishRule,
  );
  const publishPlanAction = firstEnabledAction(
    pageFeePlanActions,
    ACTION_GROUPS.publishPlan,
  );

  useEffect(() => {
    if (selectedRule?.status !== "draft") {
      setPublishRuleForm(EMPTY_PUBLISH_RULE_FORM);
      setPublishRuleFormError(null);
      return;
    }

    const effectiveFrom = normalizeDateTimeLocalValue(
      selectedRule.effectiveFrom ?? "",
    );
    const effectiveTo = normalizeDateTimeLocalValue(
      selectedRule.effectiveTo ?? "",
    );
    setPublishRuleForm((current) => ({
      effectiveFrom: current.effectiveFrom || effectiveFrom.localValue,
      effectiveTo: current.effectiveTo || effectiveTo.localValue,
      reason: current.reason,
    }));
  }, [selectedRule]);

  async function handleCreateRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingRule(true);
    setError(null);
    try {
      const createdRule = await client.createPlatformPricingRule({
        ruleName: pricingForm.ruleName.trim(),
        version: pricingForm.version.trim(),
        serviceFeeBps: Number(pricingForm.serviceFeeBps),
        reimbursementMode: pricingForm.reimbursementMode,
        applicableTo: pricingForm.applicableTo.trim() || "all",
        notes: pricingForm.notes.trim() || null,
      });
      setPricingForm(EMPTY_PRICING_FORM);
      setShowCreateRuleForm(false);
      setSelectedRuleId(createdRule.ruleId);
      setActionNotice(
        copy.createSuccess(createdRule.ruleName, createdRule.version),
      );
      setActionAuditHref(
        buildAuditHref("platform_pricing_rule", createdRule.ruleId),
      );
      await loadData("manual");
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setCreatingRule(false);
    }
  }

  async function handlePublishRule(rule: PricingRuleResource) {
    const normalizedEffectiveFrom = normalizeDateTimeLocalValue(
      publishRuleForm.effectiveFrom,
    );
    const normalizedEffectiveTo = normalizeDateTimeLocalValue(
      publishRuleForm.effectiveTo,
    );

    if (
      publishRuleForm.effectiveFrom.trim() &&
      !normalizedEffectiveFrom.isoValue
    ) {
      setPublishRuleFormError(
        locale === "en"
          ? "Effective from must be a valid datetime."
          : "生效時間必須是有效日期時間。",
      );
      return;
    }

    if (publishRuleForm.effectiveTo.trim() && !normalizedEffectiveTo.isoValue) {
      setPublishRuleFormError(
        locale === "en"
          ? "Effective to must be a valid datetime."
          : "失效時間必須是有效日期時間。",
      );
      return;
    }

    if (
      normalizedEffectiveFrom.isoValue &&
      normalizedEffectiveTo.isoValue &&
      normalizedEffectiveTo.isoValue < normalizedEffectiveFrom.isoValue
    ) {
      setPublishRuleFormError(
        locale === "en"
          ? "Effective to must be after effective from."
          : "失效時間必須晚於生效時間。",
      );
      return;
    }

    if (publishRuleAction?.requiresReason && !publishRuleForm.reason.trim()) {
      setPublishRuleFormError(copy.reasonRequired);
      return;
    }

    setPublishingRuleId(rule.ruleId);
    setPublishRuleFormError(null);
    setError(null);
    try {
      const publishedRule = await client.publishPlatformPricingRule(
        rule.ruleId,
        {
          effectiveFrom: normalizedEffectiveFrom.isoValue,
          effectiveTo: normalizedEffectiveTo.isoValue,
          publishedBy: "platform-admin-web",
        },
      );
      setPublishRuleForm(EMPTY_PUBLISH_RULE_FORM);
      setActionNotice(copy.publishSuccess(publishedRule.version));
      setActionAuditHref(
        buildAuditHref("platform_pricing_rule", publishedRule.ruleId),
      );
      await loadData("manual");
      setTab("history");
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setPublishingRuleId(null);
    }
  }

  async function handlePublishFeePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (publishPlanAction?.requiresReason && !feePlanForm.reason.trim()) {
      setError(copy.reasonRequired);
      return;
    }
    setPublishingFeePlan(true);
    setError(null);
    try {
      const publishedPlan = (await client.publishDriverFeePlan({
        planName: feePlanForm.planName.trim(),
        version: feePlanForm.version.trim(),
        serviceFeeBps: Number(feePlanForm.serviceFeeBps),
        reimbursementMode: feePlanForm.reimbursementMode,
      })) as DriverFeePlanRecord;
      setFeePlanForm({
        ...EMPTY_FEE_PLAN_FORM,
        planName: feePlanForm.planName.trim(),
      });
      setShowFeePlanForm(false);
      setSelectedPlanId(publishedPlan.feePlanId);
      setActionNotice(copy.feePlanSuccess(publishedPlan.version));
      setActionAuditHref(
        buildAuditHref("driver_fee_plan", publishedPlan.feePlanId),
      );
      await loadData("manual");
      setTab("history");
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setPublishingFeePlan(false);
    }
  }

  function handleUnsupportedAction(descriptor: ResourceActionDescriptor) {
    if (actionMatches(descriptor, ACTION_GROUPS.editRule)) {
      setActionNotice(copy.unsupportedEdit);
      return;
    }
    if (actionMatches(descriptor, ACTION_GROUPS.retireRule)) {
      setActionNotice(copy.unsupportedRetire);
      return;
    }
    setActionNotice(copy.unsupportedAction(descriptor.action));
  }

  function handleAction(
    descriptor: ResourceActionDescriptor,
    options?: {
      rule?: PricingRuleResource;
      plan?: DriverFeePlanResource;
    },
  ) {
    setError(null);
    setPublishRuleFormError(null);
    if (actionMatches(descriptor, ACTION_GROUPS.createRule)) {
      setTab("passenger");
      setShowCreateRuleForm(true);
      return;
    }
    if (actionMatches(descriptor, ACTION_GROUPS.publishRule) && options?.rule) {
      setTab("passenger");
      setSelectedRuleId(options.rule.ruleId);
      return;
    }
    if (actionMatches(descriptor, ACTION_GROUPS.publishPlan)) {
      setTab("driver");
      setShowFeePlanForm(true);
      return;
    }
    if (actionMatches(descriptor, ACTION_GROUPS.viewHistory)) {
      setTab("history");
      return;
    }
    if (!descriptor.enabled) {
      const reason = disabledReasonLabel(locale, descriptor.disabledReasonCode);
      if (reason) {
        setActionNotice(reason);
      }
      return;
    }
    handleUnsupportedAction(descriptor);
  }

  function currentEmptyState(
    tab: PricingTab,
    baseline: ListEmptyState | null,
    filteredOut: boolean,
  ) {
    if (debugEmptyReason && (!debugEmptyTarget || debugEmptyTarget === tab)) {
      return {
        reason: debugEmptyReason,
        messageCode: `qa.${debugEmptyReason}`,
      } satisfies ListEmptyState;
    }
    if (filteredOut) {
      return {
        reason: "filtered_empty",
        messageCode: "pricing.filtered_empty",
      } satisfies ListEmptyState;
    }
    if (error) {
      return {
        reason: "fetch_failed",
        messageCode: "pricing.fetch_failed",
      } satisfies ListEmptyState;
    }
    return baseline;
  }

  const historyRows: HistoryRow[] = [
    ...pricingRules
      .filter((rule) => rule.status === "active" || rule.status === "archived")
      .map((rule) => ({
        itemId: rule.ruleId,
        tabType: "passenger" as const,
        displayType: copy.tabs.passenger,
        name: rule.ruleName,
        version: rule.version,
        scope: scopeLabel(locale, rule.applicableTo),
        status: pricingStatusLabel(locale, rule.status),
        publishedAt: rule.publishedAt ?? rule.updatedAt,
        publishedBy: rule.publishedBy ?? "platform-admin-web",
        auditHref: buildAuditHref("platform_pricing_rule", rule.ruleId),
      })),
    ...feePlans.map((plan) => ({
      itemId: plan.feePlanId,
      tabType: "driver" as const,
      displayType: copy.tabs.driver,
      name: plan.planName,
      version: plan.version,
      scope: copy.scopeFallback,
      status: locale === "en" ? "published" : "已發布",
      publishedAt: plan.publishedAt,
      publishedBy: "platform-admin-web",
      auditHref: buildAuditHref("driver_fee_plan", plan.feePlanId),
    })),
  ]
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    )
    .filter((row) => {
      if (historyTypeFilter !== "all" && row.tabType !== historyTypeFilter) {
        return false;
      }
      if (historyScopeFilter !== "all" && row.scope !== historyScopeFilter) {
        return false;
      }
      if (historyPeriodFilter === "all") {
        return true;
      }
      const cutoff = Date.now() - HISTORY_PERIOD_MS[historyPeriodFilter];
      return new Date(row.publishedAt).getTime() >= cutoff;
    });

  const historyScopes = Array.from(
    new Set(
      [
        "all",
        ...pricingRules.map((rule) => scopeLabel(locale, rule.applicableTo)),
        copy.scopeFallback,
      ].filter(Boolean),
    ),
  );

  const passengerDeepLinks: CrossAppResourceLink[] = [
    {
      targetApp: "ops-console",
      route: "/revenue?period=7d",
      resourceType: "revenue_matrix",
      resourceId: selectedRule?.ruleId ?? "pricing-governance",
      openMode: "new_tab",
      label: copy.opsRevenueLabel,
    },
    {
      targetApp: "ops-console",
      route: "/dispatch",
      resourceType: "dispatch_override_board",
      resourceId: selectedRule?.ruleId ?? "pricing-governance",
      openMode: "new_tab",
      label: copy.opsDispatchLabel,
    },
    {
      targetApp: "platform-admin",
      route:
        actionAuditHref ??
        buildAuditHref(
          "platform_pricing_rule",
          selectedRule?.ruleId ?? "pricing",
        ),
      resourceType: "audit_log",
      resourceId: selectedRule?.ruleId ?? "pricing",
      openMode: "same_tab",
      label: copy.auditPrompt,
    },
  ];

  const reimbursementDeepLinks: CrossAppResourceLink[] = [
    {
      targetApp: "platform-admin",
      route: "/payments/reimbursements",
      resourceType: "reimbursement_batch",
      resourceId: selectedPlan?.feePlanId ?? "pricing-reimbursements",
      openMode: "same_tab",
      label: copy.reimbursementLabel,
    },
    {
      targetApp: "ops-console",
      route: "/revenue?period=30d",
      resourceType: "revenue_matrix",
      resourceId: selectedPlan?.feePlanId ?? "pricing-driver",
      openMode: "new_tab",
      label: copy.opsRevenueLabel,
    },
    {
      targetApp: "platform-admin",
      route:
        actionAuditHref ??
        buildAuditHref(
          "driver_fee_plan",
          selectedPlan?.feePlanId ?? "fee-plan",
        ),
      resourceType: "audit_log",
      resourceId: selectedPlan?.feePlanId ?? "fee-plan",
      openMode: "same_tab",
      label: copy.auditPrompt,
    },
  ];

  const subsidyInsights = [
    {
      label: locale === "en" ? "Platform-funded lanes" : "平台資助路徑",
      value: pricingRules.filter(
        (rule) => rule.reimbursementMode === "platform_funded",
      ).length,
      body:
        locale === "en"
          ? "Pricing rules where reimbursement stays platform-funded."
          : "reimbursement 保持 platform-funded 的 pricing rule 數量。",
    },
    {
      label: locale === "en" ? "Mixed reimbursement lanes" : "混合報銷路徑",
      value: pricingRules.filter((rule) => rule.reimbursementMode === "mixed")
        .length,
      body:
        locale === "en"
          ? "Rules that can spill into manual reimbursement review."
          : "可能流入人工報銷審核的規則數量。",
    },
    {
      label: locale === "en" ? "Published fee plans" : "已發布費用方案",
      value: feePlans.length,
      body:
        locale === "en"
          ? "Immutable settlement plans downstream teams must reconcile against."
          : "下游結算團隊需要對齊的 immutable fee plan。",
    },
  ];

  const ruleRows: PricingRuleRow[] = filteredPricingRules.map((rule) => ({
    ...rule,
    displayStatus: pricingStatusLabel(locale, rule.status),
  }));

  const planRows: FeePlanRow[] = feePlans.map((plan) => ({
    ...plan,
    scopeLabel: copy.scopeFallback,
    linkageLabel:
      plan.reimbursementMode === "mixed"
        ? copy.linkageMixed
        : copy.linkagePlatform,
  }));

  const ruleColumns: CanvasTableColumn<PricingRuleRow>[] = [
    {
      h: copy.ruleColumns.version,
      w: 126,
      mono: true,
      r: (rule) => (
        <div style={stackedCellStyle}>
          <span>{rule.version}</span>
          <span style={helperMonoStyle}>{formatDateTime(rule.updatedAt)}</span>
        </div>
      ),
    },
    {
      h: copy.ruleColumns.name,
      w: 250,
      r: (rule) => (
        <div style={stackedCellStyle}>
          <span style={{ color: theme.text, fontWeight: 600 }}>
            {rule.ruleName}
          </span>
          <span style={helperMonoStyle}>{rule.ruleId}</span>
          {rule.notes ? <span style={mutedTextStyle}>{rule.notes}</span> : null}
        </div>
      ),
    },
    {
      h: copy.ruleColumns.scope,
      w: 164,
      mono: true,
      r: (rule) => scopeLabel(locale, rule.applicableTo),
    },
    {
      h: copy.ruleColumns.fee,
      w: 128,
      align: "right",
      mono: true,
      r: (rule) => (
        <div style={stackedCellStyle}>
          <span>{formatBps(locale, rule.serviceFeeBps)} bps</span>
          <span style={helperMonoStyle}>
            {formatPercent(rule.serviceFeeBps)}
          </span>
        </div>
      ),
    },
    {
      h: copy.ruleColumns.reimburse,
      w: 150,
      r: (rule) => reimbursementModeLabel(copy, rule.reimbursementMode),
    },
    {
      h: copy.ruleColumns.status,
      w: 118,
      r: (rule) => (
        <CanvasPill theme={theme} tone={pricingStatusTone(rule.status)} dot>
          {rule.displayStatus}
        </CanvasPill>
      ),
    },
    {
      h: copy.ruleColumns.actions,
      w: 220,
      r: (rule) => {
        const actions = visibleActionList(
          rule.availableActions ?? [],
          fallbackRuleActions(rule),
        );
        return (
          <div style={actionRowStyle}>
            <CanvasBtn
              theme={theme}
              size="xs"
              variant={selectedRuleId === rule.ruleId ? "primary" : "secondary"}
              onClick={() => setSelectedRuleId(rule.ruleId)}
            >
              {copy.buttons.select}
            </CanvasBtn>
            {actions.slice(0, 2).map((descriptor) => (
              <CanvasBtn
                key={`${rule.ruleId}-${descriptor.action}`}
                theme={theme}
                size="xs"
                variant="secondary"
                disabled={!descriptor.enabled}
                onClick={() => handleAction(descriptor, { rule })}
              >
                {actionLabel(locale, descriptor)}
              </CanvasBtn>
            ))}
          </div>
        );
      },
    },
  ];

  const feePlanColumns: CanvasTableColumn<FeePlanRow>[] = [
    {
      h: copy.planColumns.plan,
      w: 240,
      r: (plan) => (
        <div style={stackedCellStyle}>
          <span style={{ color: theme.text, fontWeight: 600 }}>
            {plan.planName}
          </span>
          <span style={helperMonoStyle}>{plan.feePlanId}</span>
        </div>
      ),
    },
    {
      h: copy.planColumns.version,
      w: 132,
      mono: true,
      k: "version",
    },
    {
      h: copy.planColumns.scope,
      w: 120,
      r: (plan) => plan.scopeLabel,
    },
    {
      h: copy.planColumns.linkage,
      w: 220,
      r: (plan) => plan.linkageLabel,
    },
    {
      h: copy.planColumns.status,
      w: 112,
      r: (plan) => (
        <CanvasPill theme={theme} tone={pricingStatusTone(plan.status)} dot>
          {locale === "en" ? "published" : "已發布"}
        </CanvasPill>
      ),
    },
    {
      h: copy.planColumns.published,
      w: 170,
      mono: true,
      r: (plan) => formatDateTime(plan.publishedAt),
    },
    {
      h: copy.planColumns.actions,
      w: 180,
      r: (plan) => {
        const actions = visibleActionList(
          plan.availableActions ?? [],
          fallbackFeePlanActions(),
        );
        return (
          <div style={actionRowStyle}>
            <CanvasBtn
              theme={theme}
              size="xs"
              variant={
                selectedPlanId === plan.feePlanId ? "primary" : "secondary"
              }
              onClick={() => setSelectedPlanId(plan.feePlanId)}
            >
              {copy.buttons.select}
            </CanvasBtn>
            {actions.slice(0, 1).map((descriptor) => (
              <CanvasBtn
                key={`${plan.feePlanId}-${descriptor.action}`}
                theme={theme}
                size="xs"
                variant="secondary"
                disabled={!descriptor.enabled}
                onClick={() => handleAction(descriptor, { plan })}
              >
                {actionLabel(locale, descriptor)}
              </CanvasBtn>
            ))}
          </div>
        );
      },
    },
  ];

  const historyColumns: CanvasTableColumn<HistoryRow>[] = [
    {
      h: copy.historyColumns.publishedAt,
      w: 176,
      mono: true,
      r: (row) => formatDateTime(row.publishedAt),
    },
    {
      h: copy.historyColumns.type,
      w: 164,
      r: (row) => row.displayType,
    },
    {
      h: copy.historyColumns.name,
      w: 220,
      r: (row) => row.name,
    },
    {
      h: copy.historyColumns.scope,
      w: 140,
      mono: true,
      r: (row) => row.scope,
    },
    {
      h: copy.historyColumns.version,
      w: 132,
      mono: true,
      r: (row) => row.version,
    },
    {
      h: copy.historyColumns.status,
      w: 112,
      r: (row) => (
        <CanvasPill theme={theme} tone="success" dot>
          {row.status}
        </CanvasPill>
      ),
    },
    {
      h: copy.historyColumns.link,
      w: 140,
      r: (row) => (
        <a href={row.auditHref} style={linkAnchorStyle}>
          {copy.auditPrompt}
        </a>
      ),
    },
  ];

  const authorityItems = productRuleCatalog
    ? [
        {
          k: locale === "en" ? "Canonical source" : "Canonical source",
          v: productRuleCatalog.pricingAuthority.canonicalQuotedFareSource,
          mono: true,
        },
        {
          k: locale === "en" ? "Canonical version" : "Canonical version",
          v: productRuleCatalog.pricingAuthority.canonicalPricingRuleVersion,
          mono: true,
        },
        {
          k: locale === "en" ? "Override actors" : "Override actors",
          v: productRuleCatalog.pricingAuthority.manualOverrideActorTypes.join(
            " / ",
          ),
          mono: true,
        },
        {
          k: locale === "en" ? "Required fields" : "Required fields",
          v: productRuleCatalog.pricingAuthority.manualOverrideRequiredFields.join(
            ", ",
          ),
          mono: true,
        },
      ]
    : [];

  if (loading) {
    return (
      <div style={loadingStyle}>
        {locale === "en" ? "Loading pricing…" : "載入 pricing 中..."}
      </div>
    );
  }

  function renderEmptyState(
    reason: EmptyReason,
    nextAction?: ResourceActionDescriptor,
  ) {
    const state = emptyStateCopy(locale, reason);
    return (
      <div style={emptyStateStyle(state.tone)}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>{state.title}</strong>
          <p style={mutedTextStyle}>{state.body}</p>
        </div>
        {nextAction ? (
          <div style={actionRowStyle}>
            <span style={detailLabelStyle}>{copy.nextActionLabel}</span>
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="secondary"
              disabled={!nextAction.enabled}
              onClick={() => handleAction(nextAction)}
            >
              {actionLabel(locale, nextAction)}
            </CanvasBtn>
          </div>
        ) : null}
      </div>
    );
  }

  function renderActionDescriptors(
    actions: ResourceActionDescriptor[],
    options?: {
      rule?: PricingRuleResource;
      plan?: DriverFeePlanResource;
    },
  ) {
    if (actions.length === 0) {
      return <p style={mutedTextStyle}>{copy.roles}</p>;
    }
    return (
      <div style={detailListStyle}>
        {actions.map((descriptor) => (
          <div key={descriptor.action} style={detailRowStyle}>
            <div style={actionRowStyle}>
              <CanvasBtn
                theme={theme}
                size="xs"
                variant="secondary"
                disabled={!descriptor.enabled}
                onClick={() => handleAction(descriptor, options)}
              >
                {actionLabel(locale, descriptor)}
              </CanvasBtn>
              <CanvasPill theme={theme} tone={riskTone(descriptor.riskLevel)}>
                {descriptor.riskLevel}
              </CanvasPill>
              {descriptor.requiresReason ? (
                <CanvasPill theme={theme} tone="warn">
                  {copy.reasonLabel}
                </CanvasPill>
              ) : null}
            </div>
            {descriptor.disabledReasonCode ? (
              <p style={mutedTextStyle}>
                {disabledReasonLabel(locale, descriptor.disabledReasonCode)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  function renderCrossAppLinks(links: CrossAppResourceLink[]) {
    return (
      <div style={linkListStyle}>
        {links.map((link, index) => (
          <div
            key={`${link.targetApp}-${link.resourceId}-${index}`}
            style={{
              ...linkRowStyle,
              borderBottom:
                index === links.length - 1
                  ? "none"
                  : `1px solid ${theme.border}`,
              paddingBottom: index === links.length - 1 ? 0 : 10,
            }}
          >
            <a
              href={resolveCrossAppHref(link)}
              target={link.openMode === "new_tab" ? "_blank" : undefined}
              rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
              style={linkAnchorStyle}
            >
              {link.label}
            </a>
            <p style={helperMonoStyle}>
              {link.targetApp} · {link.route}
            </p>
          </div>
        ))}
      </div>
    );
  }

  const passengerEmptyState = currentEmptyState(
    "passenger",
    pricingRulesState.emptyState,
    pricingRules.length > 0 && filteredPricingRules.length === 0,
  );
  const driverEmptyState = currentEmptyState(
    "driver",
    feePlansState.emptyState,
    false,
  );
  const subsidyEmptyState = currentEmptyState(
    "subsidy",
    pricingRules.length + feePlans.length === 0
      ? pricingRulesState.emptyState
      : {
          reason: "not_provisioned",
          messageCode: "pricing.subsidy.not_provisioned",
        },
    false,
  );
  const historyEmptyState = currentEmptyState(
    "history",
    historyRows.length === 0
      ? {
          reason:
            pricingRules.length + feePlans.length === 0
              ? "no_data"
              : "filtered_empty",
          messageCode: "pricing.history.empty",
        }
      : null,
    false,
  );

  return (
    <div style={pageRootStyle}>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={PRICING_TABS.map((tab) => copy.tabs[tab])}
        activeTab={copy.tabs[activeTab]}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              onClick={() => void loadData("manual")}
            >
              {copy.refreshLabel}
            </CanvasBtn>
            {activeTab === "passenger" && createRuleAction ? (
              <CanvasBtn
                theme={theme}
                variant={showCreateRuleForm ? "secondary" : "primary"}
                onClick={() => setShowCreateRuleForm((current) => !current)}
              >
                {actionLabel(locale, createRuleAction)}
              </CanvasBtn>
            ) : null}
            {activeTab === "driver" && publishPlanAction ? (
              <CanvasBtn
                theme={theme}
                variant={showFeePlanForm ? "secondary" : "primary"}
                onClick={() => setShowFeePlanForm((current) => !current)}
              >
                {showFeePlanForm
                  ? copy.buttons.hideComposer
                  : copy.buttons.showComposer}
              </CanvasBtn>
            ) : null}
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={
              locale === "en" ? "Pricing fetch failed" : "Pricing 抓取失敗"
            }
            body={error}
          />
        ) : null}

        {actionNotice ? (
          <CanvasBanner
            theme={theme}
            tone="success"
            title={actionNotice}
            body={
              actionAuditHref ? (
                <a href={actionAuditHref} style={linkAnchorStyle}>
                  {copy.auditPrompt}
                </a>
              ) : (
                copy.autoRefresh
              )
            }
          />
        ) : null}

        <div style={summaryRowStyle}>
          <CanvasPill theme={theme} tone="accent">
            {copy.refreshTier}
          </CanvasPill>
          <CanvasPill theme={theme} tone="warn">
            {copy.counts.drafts} {ruleCounts.drafts}
          </CanvasPill>
          <CanvasPill theme={theme} tone="success">
            {copy.counts.published} {ruleCounts.published}
          </CanvasPill>
          <CanvasPill theme={theme} tone="neutral">
            {copy.counts.retired} {ruleCounts.retired}
          </CanvasPill>
          <CanvasPill theme={theme} tone="info">
            {copy.counts.feePlans} {feePlans.length}
          </CanvasPill>
          {lastRefreshedAt ? (
            <span style={helperMonoStyle}>
              {copy.lastRefresh(
                formatDateTime(lastRefreshedAt),
                lastRefreshSource,
              )}
            </span>
          ) : null}
        </div>

        <div style={tabPickerStyle}>
          {PRICING_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              style={tabButtonStyle(activeTab === tab)}
              onClick={() => setTab(tab)}
            >
              {copy.tabs[tab]}
            </button>
          ))}
        </div>

        <CanvasBanner
          theme={theme}
          tone="info"
          title={copy.authorityTitle}
          body={
            productRuleCatalog ? (
              <>
                <strong>
                  {
                    productRuleCatalog.pricingAuthority
                      .canonicalQuotedFareSource
                  }
                </strong>
                {" · "}
                <strong>
                  {
                    productRuleCatalog.pricingAuthority
                      .canonicalPricingRuleVersion
                  }
                </strong>
                {" · "}
                {productRuleCatalog.pricingAuthority.manualOverrideActorTypes.join(
                  " / ",
                )}
                {" · "}
                {productRuleCatalog.pricingAuthority.manualOverrideRequiredFields.join(
                  ", ",
                )}
              </>
            ) : (
              copy.authorityFallback
            )
          }
        />

        <div style={surfaceGridStyle}>
          <div style={{ display: "grid", gap: 16 }}>
            {activeTab === "passenger" ? (
              <>
                <CanvasCard
                  theme={theme}
                  title={copy.passengerTitle}
                  subtitle={copy.passengerSubtitle}
                >
                  <div style={summaryRowStyle}>
                    {(["all", "published", "draft", "retired"] as const).map(
                      (filter) => (
                        <button
                          key={filter}
                          type="button"
                          style={{
                            ...tabButtonStyle(ruleStatusFilter === filter),
                            minHeight: 28,
                          }}
                          onClick={() => setRuleStatusFilter(filter)}
                        >
                          {copy.filters[filter]}
                        </button>
                      ),
                    )}
                  </div>

                  <div style={{ height: 16 }} />

                  {showCreateRuleForm ? (
                    <>
                      <CanvasCard
                        theme={theme}
                        title={copy.createDraftCard}
                        subtitle={copy.createDraftCopy}
                      >
                        <form
                          onSubmit={handleCreateRule}
                          style={{ display: "grid", gap: 16 }}
                        >
                          <div style={fieldGridStyle}>
                            <CanvasField
                              theme={theme}
                              label={copy.forms.ruleName}
                              required
                            >
                              <input
                                value={pricingForm.ruleName}
                                onChange={(event) =>
                                  setPricingForm((current) => ({
                                    ...current,
                                    ruleName: event.target.value,
                                  }))
                                }
                                required
                                style={inputStyle}
                              />
                            </CanvasField>
                            <CanvasField
                              theme={theme}
                              label={copy.forms.version}
                              required
                            >
                              <input
                                value={pricingForm.version}
                                onChange={(event) =>
                                  setPricingForm((current) => ({
                                    ...current,
                                    version: event.target.value,
                                  }))
                                }
                                required
                                style={monoInputStyle}
                              />
                            </CanvasField>
                            <CanvasField
                              theme={theme}
                              label={copy.forms.applicableTo}
                            >
                              <input
                                value={pricingForm.applicableTo}
                                onChange={(event) =>
                                  setPricingForm((current) => ({
                                    ...current,
                                    applicableTo: event.target.value,
                                  }))
                                }
                                style={monoInputStyle}
                              />
                            </CanvasField>
                            <CanvasField
                              theme={theme}
                              label={copy.forms.serviceFeeBps}
                              required
                            >
                              <input
                                type="number"
                                min={0}
                                value={pricingForm.serviceFeeBps}
                                onChange={(event) =>
                                  setPricingForm((current) => ({
                                    ...current,
                                    serviceFeeBps: event.target.value,
                                  }))
                                }
                                required
                                style={monoInputStyle}
                              />
                            </CanvasField>
                            <CanvasField
                              theme={theme}
                              label={copy.forms.reimbursementMode}
                            >
                              <select
                                value={pricingForm.reimbursementMode}
                                onChange={(event) =>
                                  setPricingForm((current) => ({
                                    ...current,
                                    reimbursementMode: event.target
                                      .value as PricingFormState["reimbursementMode"],
                                  }))
                                }
                                style={inputStyle}
                              >
                                <option value="platform_funded">
                                  {copy.reimbursementModes.platform_funded}
                                </option>
                                <option value="mixed">
                                  {copy.reimbursementModes.mixed}
                                </option>
                              </select>
                            </CanvasField>
                          </div>

                          <CanvasField theme={theme} label={copy.forms.notes}>
                            <textarea
                              value={pricingForm.notes}
                              onChange={(event) =>
                                setPricingForm((current) => ({
                                  ...current,
                                  notes: event.target.value,
                                }))
                              }
                              rows={3}
                              style={textAreaStyle}
                            />
                          </CanvasField>

                          <div style={formActionsStyle}>
                            <CanvasBtn
                              theme={theme}
                              variant="secondary"
                              onClick={() => setShowCreateRuleForm(false)}
                            >
                              {copy.buttons.cancel}
                            </CanvasBtn>
                            <button
                              type="submit"
                              disabled={
                                creatingRule ||
                                !pricingForm.ruleName.trim() ||
                                !pricingForm.version.trim()
                              }
                              style={submitButtonStyle(
                                creatingRule ||
                                  !pricingForm.ruleName.trim() ||
                                  !pricingForm.version.trim(),
                              )}
                            >
                              {creatingRule
                                ? copy.buttons.creating
                                : copy.buttons.create}
                            </button>
                          </div>
                        </form>
                      </CanvasCard>

                      <div style={{ height: 16 }} />
                    </>
                  ) : null}

                  {filteredPricingRules.length > 0 ? (
                    <CanvasTable
                      theme={theme}
                      columns={ruleColumns}
                      rows={ruleRows}
                    />
                  ) : passengerEmptyState ? (
                    renderEmptyState(
                      passengerEmptyState.reason,
                      passengerEmptyState.nextAction,
                    )
                  ) : null}
                </CanvasCard>

                {selectedRule &&
                publishRuleAction &&
                selectedRule.status === "draft" ? (
                  <CanvasCard
                    theme={theme}
                    title={copy.publishRuleCard}
                    subtitle={copy.publishRuleCopy}
                  >
                    {publishRuleFormError ? (
                      <>
                        <CanvasBanner
                          theme={theme}
                          tone="danger"
                          title={publishRuleFormError}
                          body={copy.reasonRequired}
                        />
                        <div style={{ height: 12 }} />
                      </>
                    ) : null}

                    <div style={{ display: "grid", gap: 16 }}>
                      <div style={fieldGridStyle}>
                        <CanvasField theme={theme} label={copy.effectiveFrom}>
                          <input
                            type="datetime-local"
                            value={publishRuleForm.effectiveFrom}
                            onChange={(event) =>
                              setPublishRuleForm((current) => ({
                                ...current,
                                effectiveFrom: event.target.value,
                              }))
                            }
                            style={inputStyle}
                          />
                        </CanvasField>
                        <CanvasField theme={theme} label={copy.effectiveTo}>
                          <input
                            type="datetime-local"
                            value={publishRuleForm.effectiveTo}
                            onChange={(event) =>
                              setPublishRuleForm((current) => ({
                                ...current,
                                effectiveTo: event.target.value,
                              }))
                            }
                            style={inputStyle}
                          />
                        </CanvasField>
                      </div>

                      <CanvasField
                        theme={theme}
                        label={copy.reasonLabel}
                        required
                      >
                        <textarea
                          value={publishRuleForm.reason}
                          onChange={(event) =>
                            setPublishRuleForm((current) => ({
                              ...current,
                              reason: event.target.value,
                            }))
                          }
                          required={publishRuleAction.requiresReason}
                          style={textAreaStyle}
                        />
                      </CanvasField>

                      <p style={mutedTextStyle}>{copy.publishWindowHint}</p>
                      <p style={helperMonoStyle}>{copy.reasonRequired}</p>

                      <div style={formActionsStyle}>
                        <button
                          type="button"
                          disabled={publishingRuleId === selectedRule.ruleId}
                          style={submitButtonStyle(
                            publishingRuleId === selectedRule.ruleId,
                          )}
                          onClick={() => void handlePublishRule(selectedRule)}
                        >
                          {publishingRuleId === selectedRule.ruleId
                            ? copy.buttons.publishing
                            : copy.buttons.publish}
                        </button>
                      </div>
                    </div>
                  </CanvasCard>
                ) : null}
              </>
            ) : null}

            {activeTab === "driver" ? (
              <CanvasCard
                theme={theme}
                title={copy.driverTitle}
                subtitle={copy.driverSubtitle}
              >
                {showFeePlanForm ? (
                  <>
                    <CanvasCard
                      theme={theme}
                      title={copy.driverPlanCard}
                      subtitle={copy.driverPlanCopy}
                    >
                      <form
                        onSubmit={handlePublishFeePlan}
                        style={{ display: "grid", gap: 16 }}
                      >
                        <div style={fieldGridStyle}>
                          <CanvasField
                            theme={theme}
                            label={copy.forms.planName}
                            required
                          >
                            <input
                              value={feePlanForm.planName}
                              onChange={(event) =>
                                setFeePlanForm((current) => ({
                                  ...current,
                                  planName: event.target.value,
                                }))
                              }
                              required
                              style={inputStyle}
                            />
                          </CanvasField>
                          <CanvasField
                            theme={theme}
                            label={copy.forms.version}
                            required
                          >
                            <input
                              value={feePlanForm.version}
                              onChange={(event) =>
                                setFeePlanForm((current) => ({
                                  ...current,
                                  version: event.target.value,
                                }))
                              }
                              required
                              style={monoInputStyle}
                            />
                          </CanvasField>
                          <CanvasField
                            theme={theme}
                            label={copy.forms.serviceFeeBps}
                            required
                          >
                            <input
                              type="number"
                              min={0}
                              value={feePlanForm.serviceFeeBps}
                              onChange={(event) =>
                                setFeePlanForm((current) => ({
                                  ...current,
                                  serviceFeeBps: event.target.value,
                                }))
                              }
                              required
                              style={monoInputStyle}
                            />
                          </CanvasField>
                          <CanvasField
                            theme={theme}
                            label={copy.forms.reimbursementMode}
                          >
                            <select
                              value={feePlanForm.reimbursementMode}
                              onChange={(event) =>
                                setFeePlanForm((current) => ({
                                  ...current,
                                  reimbursementMode: event.target
                                    .value as FeePlanFormState["reimbursementMode"],
                                }))
                              }
                              style={inputStyle}
                            >
                              <option value="platform_funded">
                                {copy.reimbursementModes.platform_funded}
                              </option>
                              <option value="mixed">
                                {copy.reimbursementModes.mixed}
                              </option>
                            </select>
                          </CanvasField>
                        </div>

                        <CanvasField
                          theme={theme}
                          label={copy.reasonLabel}
                          required
                        >
                          <textarea
                            value={feePlanForm.reason}
                            onChange={(event) =>
                              setFeePlanForm((current) => ({
                                ...current,
                                reason: event.target.value,
                              }))
                            }
                            required={publishPlanAction?.requiresReason}
                            style={textAreaStyle}
                          />
                        </CanvasField>

                        <p style={helperMonoStyle}>{copy.reasonRequired}</p>

                        <div style={formActionsStyle}>
                          <CanvasBtn
                            theme={theme}
                            variant="secondary"
                            onClick={() => setShowFeePlanForm(false)}
                          >
                            {copy.buttons.cancel}
                          </CanvasBtn>
                          <button
                            type="submit"
                            disabled={
                              publishingFeePlan ||
                              !feePlanForm.planName.trim() ||
                              !feePlanForm.version.trim()
                            }
                            style={submitButtonStyle(
                              publishingFeePlan ||
                                !feePlanForm.planName.trim() ||
                                !feePlanForm.version.trim(),
                            )}
                          >
                            {publishingFeePlan
                              ? copy.buttons.publishing
                              : copy.buttons.publish}
                          </button>
                        </div>
                      </form>
                    </CanvasCard>

                    <div style={{ height: 16 }} />
                  </>
                ) : null}

                {feePlans.length > 0 ? (
                  <CanvasTable
                    theme={theme}
                    columns={feePlanColumns}
                    rows={planRows}
                  />
                ) : driverEmptyState ? (
                  renderEmptyState(
                    driverEmptyState.reason,
                    driverEmptyState.nextAction,
                  )
                ) : null}
              </CanvasCard>
            ) : null}

            {activeTab === "subsidy" ? (
              <CanvasCard
                theme={theme}
                title={copy.subsidyTitle}
                subtitle={copy.subsidySubtitle}
              >
                <div style={splitStatsStyle}>
                  {subsidyInsights.map((item) => (
                    <div key={item.label} style={statBlockStyle}>
                      <span style={detailLabelStyle}>{item.label}</span>
                      <strong style={{ fontSize: 20 }}>{item.value}</strong>
                      <p style={mutedTextStyle}>{item.body}</p>
                    </div>
                  ))}
                </div>

                <div style={{ height: 16 }} />

                <CanvasBanner
                  theme={theme}
                  tone="info"
                  title={copy.subsidyInsightsTitle}
                  body={copy.subsidyInsightsSubtitle}
                />

                <div style={{ height: 16 }} />

                {subsidyEmptyState
                  ? renderEmptyState(
                      subsidyEmptyState.reason,
                      subsidyEmptyState.nextAction,
                    )
                  : null}
              </CanvasCard>
            ) : null}

            {activeTab === "history" ? (
              <CanvasCard
                theme={theme}
                title={copy.historyTitle}
                subtitle={copy.historySubtitle}
              >
                <div style={fieldGridStyle}>
                  <CanvasField theme={theme} label={copy.filters.historyType}>
                    <select
                      value={historyTypeFilter}
                      onChange={(event) =>
                        setHistoryTypeFilter(
                          event.target.value as HistoryTypeFilter,
                        )
                      }
                      style={inputStyle}
                    >
                      <option value="all">{copy.filters.all}</option>
                      <option value="passenger">{copy.tabs.passenger}</option>
                      <option value="driver">{copy.tabs.driver}</option>
                    </select>
                  </CanvasField>
                  <CanvasField theme={theme} label={copy.filters.historyScope}>
                    <select
                      value={historyScopeFilter}
                      onChange={(event) =>
                        setHistoryScopeFilter(event.target.value)
                      }
                      style={inputStyle}
                    >
                      {historyScopes.map((scope) => (
                        <option key={scope} value={scope}>
                          {scope === "all" ? copy.filters.all : scope}
                        </option>
                      ))}
                    </select>
                  </CanvasField>
                  <CanvasField theme={theme} label={copy.filters.historyPeriod}>
                    <select
                      value={historyPeriodFilter}
                      onChange={(event) =>
                        setHistoryPeriodFilter(
                          event.target.value as HistoryPeriodFilter,
                        )
                      }
                      style={inputStyle}
                    >
                      <option value="7d">{copy.filters.period7}</option>
                      <option value="30d">{copy.filters.period30}</option>
                      <option value="90d">{copy.filters.period90}</option>
                      <option value="all">{copy.filters.periodAll}</option>
                    </select>
                  </CanvasField>
                </div>

                <div style={{ height: 16 }} />

                {historyRows.length > 0 ? (
                  <CanvasTable
                    theme={theme}
                    columns={historyColumns}
                    rows={historyRows}
                  />
                ) : historyEmptyState ? (
                  renderEmptyState(
                    historyEmptyState.reason,
                    historyEmptyState.nextAction,
                  )
                ) : null}
              </CanvasCard>
            ) : null}
          </div>

          <div style={sideStackStyle}>
            <CanvasCard
              theme={theme}
              title={copy.routeMapTitle}
              subtitle={copy.routeMapSubtitle}
            >
              <div style={detailListStyle}>
                {routeMapCopy(locale).map((item) => (
                  <div key={item.route} style={detailRowStyle}>
                    <a href={item.route} style={linkAnchorStyle}>
                      {item.label}
                    </a>
                    <p style={helperMonoStyle}>{item.route}</p>
                    <p style={mutedTextStyle}>{item.body}</p>
                  </div>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={copy.contractGapTitle}
              subtitle={copy.roles}
            >
              <p style={mutedTextStyle}>{copy.contractGapBody}</p>
              <div style={{ height: 12 }} />
              <CanvasDL theme={theme} cols={1} items={authorityItems} />
            </CanvasCard>

            {activeTab === "passenger" ? (
              <CanvasCard
                theme={theme}
                title={copy.ruleDetailTitle}
                subtitle={
                  selectedRule ? selectedRule.ruleName : copy.noRuleSelection
                }
              >
                {selectedRule ? (
                  <div style={detailListStyle}>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>{copy.forms.version}</span>
                      <span style={detailValueStyle}>
                        {selectedRule.version}
                      </span>
                    </div>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>
                        {copy.forms.applicableTo}
                      </span>
                      <span style={detailValueStyle}>
                        {scopeLabel(locale, selectedRule.applicableTo)}
                      </span>
                    </div>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>{copy.effectiveFrom}</span>
                      <span style={detailValueStyle}>
                        {formatDateTime(selectedRule.effectiveFrom)}
                        {" → "}
                        {selectedRule.effectiveTo
                          ? formatDateTime(selectedRule.effectiveTo)
                          : copy.openEnded}
                      </span>
                    </div>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>{copy.reasonLabel}</span>
                      <span style={detailValueStyle}>
                        {selectedRule.notes ||
                          (locale === "en" ? "No notes" : "無備註")}
                      </span>
                    </div>
                    <div style={lineStyle} />
                    {renderActionDescriptors(selectedRuleActions, {
                      rule: selectedRule,
                    })}
                  </div>
                ) : (
                  <p style={mutedTextStyle}>{copy.noRuleSelection}</p>
                )}
              </CanvasCard>
            ) : null}

            {activeTab === "driver" ? (
              <CanvasCard
                theme={theme}
                title={copy.planDetailTitle}
                subtitle={
                  selectedPlan ? selectedPlan.planName : copy.noPlanSelection
                }
              >
                {selectedPlan ? (
                  <div style={detailListStyle}>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>{copy.forms.version}</span>
                      <span style={detailValueStyle}>
                        {selectedPlan.version}
                      </span>
                    </div>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>
                        {copy.forms.serviceFeeBps}
                      </span>
                      <span style={detailValueStyle}>
                        {formatBps(locale, selectedPlan.serviceFeeBps)} bps ·{" "}
                        {formatPercent(selectedPlan.serviceFeeBps)}
                      </span>
                    </div>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>
                        {copy.forms.applicableTo}
                      </span>
                      <span style={detailValueStyle}>{copy.scopeFallback}</span>
                    </div>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>
                        {copy.forms.reimbursementMode}
                      </span>
                      <span style={detailValueStyle}>
                        {reimbursementModeLabel(
                          copy,
                          selectedPlan.reimbursementMode,
                        )}
                      </span>
                    </div>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>{copy.effectiveFrom}</span>
                      <span style={detailValueStyle}>
                        {formatDateTime(selectedPlan.publishedAt)}
                      </span>
                    </div>
                    <div style={lineStyle} />
                    {renderActionDescriptors(selectedPlanActions, {
                      plan: selectedPlan,
                    })}
                  </div>
                ) : (
                  <p style={mutedTextStyle}>{copy.noPlanSelection}</p>
                )}
              </CanvasCard>
            ) : null}

            {activeTab === "passenger" ||
            activeTab === "driver" ||
            activeTab === "subsidy" ? (
              <CanvasCard
                theme={theme}
                title={copy.crossAppTitle}
                subtitle={copy.crossAppSubtitle}
              >
                {renderCrossAppLinks(
                  activeTab === "passenger"
                    ? passengerDeepLinks
                    : reimbursementDeepLinks,
                )}
              </CanvasCard>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
