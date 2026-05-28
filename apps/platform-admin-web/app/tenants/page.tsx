"use client";

import Link from "next/link";
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  EMPTY_TENANT_FORM,
  createTenantModuleLabels,
  parseQuota,
  tenantStageTone,
  toggleTenantModule,
  type TenantFormState,
} from "@/components/tenant-governance-shared";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import { getRuntimeApiBaseUrl } from "@/lib/runtime-config";
import type {
  ApiSuccessEnvelope,
  CreatePlatformTenantCommand,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  PlatformAdminTenantRecord,
  RefreshTier,
  PlatformTenantIntegrationMode,
  PlatformTenantModule,
  PlatformAdminUserRecord,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_INTEGRATION_MODES,
  PLATFORM_TENANT_MODULES,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type TenantStageFilter = "all" | "sandbox" | "pilot" | "production";
type TenantStatusFilter = "all" | PlatformAdminTenantRecord["status"];

type TenantListItem = PlatformAdminTenantRecord & {
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
  lastActivityAt?: string | null;
};

type TenantListEnvelope = {
  items: TenantListItem[];
  availableActions: ResourceActionDescriptor[];
  empty: EmptyStateEnvelope | null;
  refresh: UiRefreshMetadata | null;
};

type TenantRow = TenantListItem & Record<string, unknown>;

type LoadState = {
  tenants: TenantListItem[];
  users: PlatformAdminUserRecord[];
  availableActions: ResourceActionDescriptor[];
  empty: EmptyStateEnvelope | null;
  refresh: UiRefreshMetadata | null;
  loadedAt: string;
  requestId?: string;
};

type EmptyStateDescriptor = {
  reason: EmptyReason;
  title: string;
  body: string;
  tone: CanvasTone;
  icon: "health" | "warn" | "search" | "tenants";
};

const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_INTERVAL_MS = 30_000;

const th = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

const shellStyle: CSSProperties = {
  height: "calc(100vh - 64px)",
  minHeight: "calc(100vh - 64px)",
  borderRadius: 24,
  overflow: "hidden",
  border: `1px solid ${th.border}`,
  boxShadow: "0 24px 60px rgba(2, 6, 23, 0.28)",
  gridTemplateColumns: "0 minmax(0, 1fr)",
  gridTemplateRows: "46px minmax(0, 1fr)",
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const summaryRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const filterPanelStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surface,
};

const searchRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
};

const searchFieldWrapStyle: CSSProperties = {
  flex: "1 1 280px",
  minWidth: 220,
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px 9px 34px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const searchIconStyle: CSSProperties = {
  position: "absolute",
  left: 10,
  top: "50%",
  transform: "translateY(-50%)",
  color: th.textDim,
};

const filterGroupStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const filterButtonStyle: CSSProperties = {
  border: 0,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  justifyContent: "space-between",
};

const metaClusterStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const loadingStateStyle: CSSProperties = {
  padding: 28,
  color: th.textMuted,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  textAlign: "center",
};

const emptyStateStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  justifyItems: "center",
  padding: 32,
  color: th.textMuted,
  textAlign: "center",
};

const createPanelStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  alignItems: "start",
};

const createGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 14,
};

const quotaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const moduleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: th.text,
  fontSize: 12.5,
  fontWeight: 600,
};

const sectionHintStyle: CSSProperties = {
  margin: "4px 0 0",
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const monoInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: th.monoFamily,
};

const createActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 4,
};

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 132,
  height: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${th.accent}`,
  background: th.accent,
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
});

const headerActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const tenantLinkStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  color: th.text,
  textDecoration: "none",
};

const tenantNameStyle: CSSProperties = {
  fontWeight: 600,
  color: th.text,
};

const tenantMetaStyle: CSSProperties = {
  fontSize: 11,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const secondaryTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
  lineHeight: 1.4,
};

const monoMetaStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  fontFamily: th.monoFamily,
};

const stackedCellStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const ownerLinkStyle: CSSProperties = {
  color: th.text,
  textDecoration: "none",
  fontWeight: 500,
};

const rowActionWrapStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const rowActionStyle = (tone: CanvasTone, disabled: boolean): CSSProperties => {
  const styles =
    tone === "danger"
      ? {
          fg: th.danger,
          bg: th.dangerBg,
          bd: th.dangerBorder,
        }
      : tone === "warn"
        ? {
            fg: th.warn,
            bg: th.warnBg,
            bd: th.warnBorder,
          }
        : tone === "accent"
          ? {
              fg: th.accent,
              bg: th.accentBg,
              bd: th.accentBorder,
            }
          : {
              fg: th.text,
              bg: th.surfaceLo,
              bd: th.border,
            };

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 8px",
    borderRadius: 7,
    border: `1px solid ${styles.bd}`,
    background: styles.bg,
    color: styles.fg,
    fontSize: 11.5,
    lineHeight: 1.2,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
  };
};

const deepLinkWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

function toneFromRiskLevel(
  riskLevel: ResourceActionDescriptor["riskLevel"],
): CanvasTone {
  switch (riskLevel) {
    case "high":
      return "danger";
    case "medium":
      return "warn";
    case "low":
    default:
      return "accent";
  }
}

function toCanvasTone(tone: ReturnType<typeof tenantStageTone>): CanvasTone {
  return tone === "warning" ? "warn" : tone;
}

function formatLocaleNumber(locale: string, value: number) {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function getIntegrationEndpoint(tenant: PlatformAdminTenantRecord) {
  return (
    tenant.integrationPackage.productionBaseUrl ??
    tenant.integrationPackage.sandboxBaseUrl ??
    "—"
  );
}

function toCsvCell(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function camelCaseKey(key: string) {
  return key.replace(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

function deepCamelCase<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepCamelCase(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([key, nestedValue]) => [camelCaseKey(key), deepCamelCase(nestedValue)],
      ),
    ) as T;
  }
  return value;
}

function isResourceActionDescriptor(
  value: unknown,
): value is ResourceActionDescriptor {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as ResourceActionDescriptor).action === "string" &&
    typeof (value as ResourceActionDescriptor).enabled === "boolean",
  );
}

function isCrossAppLink(value: unknown): value is CrossAppResourceLink {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as CrossAppResourceLink).route === "string" &&
    typeof (value as CrossAppResourceLink).targetApp === "string",
  );
}

function isUiRefreshMetadata(value: unknown): value is UiRefreshMetadata {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as UiRefreshMetadata).generatedAt === "string" &&
    typeof (value as UiRefreshMetadata).staleAfterMs === "number",
  );
}

function isEmptyStateEnvelope(value: unknown): value is EmptyStateEnvelope {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as EmptyStateEnvelope).reason === "string" &&
    typeof (value as EmptyStateEnvelope).messageCode === "string",
  );
}

function normalizeTenantListEnvelope(payload: unknown): TenantListEnvelope {
  const data = deepCamelCase(payload);

  if (Array.isArray(data)) {
    return {
      items: data as TenantListItem[],
      availableActions: [],
      empty: null,
      refresh: null,
    };
  }

  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { items?: unknown[] }).items)
  ) {
    const record = data as {
      items: unknown[];
      availableActions?: unknown[];
      empty?: unknown;
      refresh?: unknown;
    };

    return {
      items: record.items as TenantListItem[],
      availableActions: Array.isArray(record.availableActions)
        ? record.availableActions.filter(isResourceActionDescriptor)
        : [],
      empty: isEmptyStateEnvelope(record.empty) ? record.empty : null,
      refresh: isUiRefreshMetadata(record.refresh) ? record.refresh : null,
    };
  }

  return {
    items: [],
    availableActions: [],
    empty: null,
    refresh: null,
  };
}

function currentGateStatus(tenant: PlatformAdminTenantRecord) {
  switch (tenant.rollout.stage) {
    case "sandbox":
      return tenant.rollout.sandboxStatus;
    case "pilot":
      return tenant.rollout.pilotStatus;
    case "production":
    default:
      return tenant.rollout.productionStatus;
  }
}

function gateTone(status: ReturnType<typeof currentGateStatus>): CanvasTone {
  switch (status) {
    case "approved":
      return "success";
    case "ready":
      return "accent";
    case "blocked":
      return "danger";
    case "pending":
    default:
      return "warn";
  }
}

function statusTone(status: PlatformAdminTenantRecord["status"]): CanvasTone {
  switch (status) {
    case "active":
      return "success";
    case "rollback_hold":
      return "danger";
    case "paused":
      return "warn";
    case "draft":
    default:
      return "neutral";
  }
}

function fallbackRowActions(
  tenant: PlatformAdminTenantRecord,
): ResourceActionDescriptor[] {
  const primaryAction: ResourceActionDescriptor = {
    action: tenant.status === "active" ? "suspend_tenant" : "activate_tenant",
    enabled: tenant.status !== "rollback_hold",
    riskLevel: "medium",
  };

  if (tenant.status === "rollback_hold") {
    primaryAction.disabledReasonCode = "rollback_hold_active";
  }

  const actions: ResourceActionDescriptor[] = [primaryAction];

  if (tenant.status !== "rollback_hold") {
    actions.push({
      action: "enter_rollback_hold",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    });
  }

  return actions;
}

function fallbackPageActions(): ResourceActionDescriptor[] {
  return [
    { action: "refresh", enabled: true, riskLevel: "low" },
    { action: "create_tenant", enabled: true, riskLevel: "medium" },
  ];
}

function resolveTenantLinks(tenant: TenantListItem): CrossAppResourceLink[] {
  if (tenant.crossAppLinks?.length) {
    return tenant.crossAppLinks.filter(isCrossAppLink);
  }

  return [
    {
      targetApp: "ops-console",
      route: `/dispatch?tenantId=${encodeURIComponent(tenant.id)}`,
      resourceType: "tenant",
      resourceId: tenant.id,
      openMode: "new_tab",
      label: "ops.dispatch_board",
    },
  ];
}

function externalAppBase(targetApp: CrossAppResourceLink["targetApp"]) {
  switch (targetApp) {
    case "ops-console":
      return process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "/ops-console";
    case "tenant-console":
      return process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "/tenant-console";
    case "platform-admin":
    default:
      return process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "";
  }
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  if (/^https?:\/\//.test(link.route)) {
    return link.route;
  }

  const base = externalAppBase(link.targetApp).replace(/\/$/, "");
  const route = link.route.startsWith("/") ? link.route : `/${link.route}`;
  return base ? `${base}${route}` : route;
}

function actionMatches(action: string, ...candidates: string[]) {
  return candidates.some((candidate) => action === candidate);
}

function isCreateTenantAction(action: ResourceActionDescriptor) {
  return actionMatches(action.action, "create_tenant", "createPlatformTenant");
}

function isRefreshAction(action: ResourceActionDescriptor) {
  return actionMatches(action.action, "refresh", "reload", "refetch");
}

function resolveActionLabel(
  labels: Record<string, string>,
  action: ResourceActionDescriptor,
) {
  return labels[action.action] ?? action.action;
}

function resolveCrossAppLabel(
  locale: string,
  labels: Record<string, string>,
  link: CrossAppResourceLink,
) {
  if (labels[link.label]) {
    return labels[link.label];
  }

  if (link.targetApp === "ops-console") {
    return (
      labels.open_ops_console ??
      (locale === "en" ? "Open ops view" : "開啟 ops 視圖")
    );
  }

  return locale === "en" ? `Open ${link.targetApp}` : `開啟 ${link.targetApp}`;
}

function describeRefreshTier(locale: string, tier: RefreshTier) {
  if (tier === "medium_slow") {
    return locale === "en"
      ? "Refresh tier T4 · 30s"
      : "Refresh tier T4 · 30 秒";
  }

  return locale === "en" ? `Refresh tier ${tier}` : `Refresh tier ${tier}`;
}

function lastActivityAt(tenant: TenantListItem) {
  return (
    tenant.lastActivityAt ?? tenant.rollout.lastPromotedAt ?? tenant.updatedAt
  );
}

function getFreshness(
  refresh: UiRefreshMetadata | null,
  loadedAt: string | null,
): UiRefreshMetadata | null {
  if (refresh) {
    const generatedAt = new Date(refresh.generatedAt).getTime();
    const staleAt = generatedAt + refresh.staleAfterMs;
    return {
      ...refresh,
      dataFreshness:
        Number.isFinite(generatedAt) && Date.now() > staleAt
          ? "stale"
          : refresh.dataFreshness,
    };
  }

  if (!loadedAt) {
    return null;
  }

  const generatedAt = new Date(loadedAt).toISOString();
  const staleAt = new Date(loadedAt).getTime() + REFRESH_INTERVAL_MS;
  return {
    generatedAt,
    staleAfterMs: REFRESH_INTERVAL_MS,
    dataFreshness: Date.now() > staleAt ? "stale" : "fresh",
    source: "live",
  };
}

export default function TenantsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [stageFilter, setStageFilter] = useState<TenantStageFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [createForm, setCreateForm] =
    useState<TenantFormState>(EMPTY_TENANT_FORM);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const copy =
    locale === "en"
      ? {
          title: "Tenants",
          subtitle:
            "Lifecycle roster for sandbox, pilot, production, and rollback-governed tenants.",
          refresh: "Refresh",
          refreshing: "Refreshing...",
          export: "Export CSV",
          createTitle: "Create tenant",
          createSubtitle:
            "Bootstrap identity, quota, module footprint, and onboarding defaults before the first rollout.",
          rollbackTitle: "Rollback hold cluster",
          rollbackBanner: (count: number) =>
            `${count} tenant(s) are currently in rollback hold. Review blockers before any new promotion.`,
          loadErrorTitle: "Unable to load tenants",
          loadErrorBody:
            "The roster can still render the last successful snapshot while refresh is retried.",
          searchPlaceholder: "Search tenant name or code",
          filterTitleStage: "Rollout stage",
          filterTitleStatus: "Tenant status",
          refreshTier: describeRefreshTier(locale, REFRESH_TIER),
          freshnessAt: "Snapshot",
          readyGate: "Ready gate",
          searchSummary: (count: number) => `${count} visible tenant(s)`,
          requestLabel: "Request",
          table: {
            tenant: "TENANT",
            rollout: "ROLLOUT",
            gate: "GATE",
            owners: "OWNERS",
            modules: "MODULES",
            integration: "INTEGRATION",
            activity: "LAST ACTIVITY",
            actions: "ACTIONS",
          },
          filters: {
            stage: {
              all: "All stages",
              sandbox: "sandbox",
              pilot: "pilot",
              production: "production",
            },
            status: {
              all: "All statuses",
              draft: "draft",
              active: "active",
              paused: "paused",
              rollback_hold: "rollback_hold",
            },
          },
          empty: {
            no_data: {
              title: "No tenants yet",
              body: "Create the first tenant to seed the platform-admin lifecycle roster.",
            },
            not_provisioned: {
              title: "Tenant governance not provisioned",
              body: "This environment is missing tenant roster provisioning. Configure the source module first.",
            },
            fetch_failed: {
              title: "Snapshot refresh failed",
              body: "The API request failed before a fresh roster could be loaded.",
            },
            permission_denied: {
              title: "No access to tenant roster",
              body: "This role cannot read tenant lifecycle data on platform-admin.",
            },
            external_unavailable: {
              title: "Upstream tenant source unavailable",
              body: "A dependency for tenant lifecycle reads is degraded or offline.",
            },
            filtered_empty: {
              title: "No tenants match this filter",
              body: "Adjust search, rollout stage, or status filters to widen the roster.",
            },
          },
          owners: {
            cutover: "Cutover owner",
            rollback: "Rollback owner",
            none: "Unassigned",
          },
          links: {
            ops: "Open ops view",
            detail: "Open detail",
          },
          actionLabels: {
            refresh: "Refresh",
            create_tenant: "Create tenant",
            activate_tenant: "Activate",
            suspend_tenant: "Suspend",
            enter_rollback_hold: "Rollback hold",
            open_ops_console: "Open ops view",
          },
          actionMessages: {
            suspend_tenant: "Suspend this tenant lifecycle?",
            activate_tenant: "Restore this tenant to active state?",
            enter_rollback_hold:
              "Enter rollback hold for this tenant. A reason is required and the rollout path will be blocked.",
          },
          moduleState: {
            enabled: "enabled",
            disabled: "optional",
          },
          freshness: {
            fresh: "Fresh",
            stale: "Stale",
            degraded: "Degraded",
            unknown: "Unknown",
          },
          source: {
            live: "live",
            cache: "cache",
            sandbox: "sandbox",
            static: "static",
          },
        }
      : {
          title: "租戶",
          subtitle:
            "平台治理租戶名單，統一檢視 sandbox、pilot、production 與 rollback hold。",
          refresh: "重新整理",
          refreshing: "重新整理中...",
          export: "匯出 CSV",
          createTitle: "建立租戶",
          createSubtitle:
            "在第一次 rollout 前先補齊身份、配額、模組與 onboarding defaults。",
          rollbackTitle: "Rollback hold 群組",
          rollbackBanner: (count: number) =>
            `${count} 個租戶目前處於 rollback hold。推進新的 promotion 前需先完成治理判讀。`,
          loadErrorTitle: "無法載入租戶名單",
          loadErrorBody: "系統會保留最近一次成功快照，並持續重試更新。",
          searchPlaceholder: "搜尋租戶名稱或代碼",
          filterTitleStage: "Rollout stage",
          filterTitleStatus: "Tenant status",
          refreshTier: describeRefreshTier(locale, REFRESH_TIER),
          freshnessAt: "快照時間",
          readyGate: "Ready gate",
          searchSummary: (count: number) => `目前顯示 ${count} 筆租戶`,
          requestLabel: "請求",
          table: {
            tenant: "TENANT",
            rollout: "ROLLOUT",
            gate: "GATE",
            owners: "OWNERS",
            modules: "MODULES",
            integration: "INTEGRATION",
            activity: "LAST ACTIVITY",
            actions: "ACTIONS",
          },
          filters: {
            stage: {
              all: "全部 stage",
              sandbox: "sandbox",
              pilot: "pilot",
              production: "production",
            },
            status: {
              all: "全部狀態",
              draft: "draft",
              active: "active",
              paused: "paused",
              rollback_hold: "rollback_hold",
            },
          },
          empty: {
            no_data: {
              title: "尚無租戶",
              body: "先建立第一個租戶，才能開始 tenant lifecycle roster。",
            },
            not_provisioned: {
              title: "租戶治理尚未 provision",
              body: "這個環境缺少租戶名單來源，需先完成上游設定。",
            },
            fetch_failed: {
              title: "快照更新失敗",
              body: "API 讀取失敗，暫時無法取得新的租戶名單。",
            },
            permission_denied: {
              title: "目前角色無法讀取租戶名單",
              body: "這個平台角色沒有 tenant lifecycle 讀取權限。",
            },
            external_unavailable: {
              title: "上游租戶來源目前不可用",
              body: "租戶 lifecycle 依賴的外部或上游服務目前降級或離線。",
            },
            filtered_empty: {
              title: "目前篩選條件沒有結果",
              body: "請放寬搜尋字詞、rollout stage 或 status 條件。",
            },
          },
          owners: {
            cutover: "Cutover owner",
            rollback: "Rollback owner",
            none: "未指定",
          },
          links: {
            ops: "開啟 ops 視圖",
            detail: "開啟詳情",
          },
          actionLabels: {
            refresh: "重新整理",
            create_tenant: "建立租戶",
            activate_tenant: "啟用",
            suspend_tenant: "暫停",
            enter_rollback_hold: "Rollback hold",
            open_ops_console: "開啟 ops 視圖",
          },
          actionMessages: {
            suspend_tenant: "要暫停這個租戶生命週期嗎？",
            activate_tenant: "要把這個租戶恢復成 active 狀態嗎？",
            enter_rollback_hold:
              "要把這個租戶切進 rollback hold。此動作需要理由，且會阻擋 rollout。",
          },
          moduleState: {
            enabled: "已啟用",
            disabled: "可選",
          },
          freshness: {
            fresh: "Fresh",
            stale: "Stale",
            degraded: "Degraded",
            unknown: "Unknown",
          },
          source: {
            live: "live",
            cache: "cache",
            sandbox: "sandbox",
            static: "static",
          },
        };

  const moduleLabels = useMemo(() => createTenantModuleLabels(t), [t]);

  const loadTenants = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const apiBaseUrl = getRuntimeApiBaseUrl().replace(/\/$/, "");
        const response = await fetch(
          `${apiBaseUrl}/api/platform-admin/tenants`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          setErrorStatus(response.status);
          throw new Error(`API error ${response.status}: ${errorText}`);
        }

        const envelope = (await response.json()) as ApiSuccessEnvelope<unknown>;
        const normalized = normalizeTenantListEnvelope(envelope.data);
        const users = await client.listPlatformAdminUsers();
        const loadedAt = envelope.meta?.timestamp ?? new Date().toISOString();

        setLoadState({
          tenants: normalized.items,
          users,
          availableActions:
            normalized.availableActions.length > 0
              ? normalized.availableActions
              : fallbackPageActions(),
          empty: normalized.empty,
          refresh: normalized.refresh,
          loadedAt,
          requestId: envelope.meta?.requestId,
        });
        setError(null);
        setErrorStatus(null);
      } catch (caughtError: unknown) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadTenants();
    const intervalId = window.setInterval(() => {
      void loadTenants({ silent: true });
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadTenants]);

  const ownerMap = useMemo(
    () =>
      new Map(
        (loadState?.users ?? []).map((user) => [
          user.userId,
          user.displayName?.trim() || user.email || user.userId,
        ]),
      ),
    [loadState?.users],
  );

  const tenants = loadState?.tenants ?? [];
  const freshness = getFreshness(
    loadState?.refresh ?? null,
    loadState?.loadedAt ?? null,
  );

  const filteredTenants = useMemo(() => {
    const query = deferredSearchTerm.trim().toLowerCase();
    const rows = tenants.filter((tenant) => {
      const matchesQuery =
        query.length === 0 ||
        tenant.name.toLowerCase().includes(query) ||
        tenant.code.toLowerCase().includes(query);
      const matchesStage =
        stageFilter === "all" || tenant.rollout.stage === stageFilter;
      const matchesStatus =
        statusFilter === "all" || tenant.status === statusFilter;

      return matchesQuery && matchesStage && matchesStatus;
    });

    return [...rows].sort(
      (left, right) =>
        new Date(lastActivityAt(right)).getTime() -
        new Date(lastActivityAt(left)).getTime(),
    );
  }, [deferredSearchTerm, stageFilter, statusFilter, tenants]);

  const stageCounts = useMemo(
    () => ({
      all: tenants.length,
      sandbox: tenants.filter((tenant) => tenant.rollout.stage === "sandbox")
        .length,
      pilot: tenants.filter((tenant) => tenant.rollout.stage === "pilot")
        .length,
      production: tenants.filter(
        (tenant) =>
          tenant.rollout.stage === "production" &&
          tenant.status !== "rollback_hold",
      ).length,
    }),
    [tenants],
  );

  const statusCounts = useMemo(
    () => ({
      all: tenants.length,
      draft: tenants.filter((tenant) => tenant.status === "draft").length,
      active: tenants.filter((tenant) => tenant.status === "active").length,
      paused: tenants.filter((tenant) => tenant.status === "paused").length,
      rollback_hold: tenants.filter(
        (tenant) => tenant.status === "rollback_hold",
      ).length,
    }),
    [tenants],
  );

  const readyGateCount = useMemo(
    () =>
      tenants.filter((tenant) => currentGateStatus(tenant) === "ready").length,
    [tenants],
  );

  const rollbackHoldTenants = useMemo(
    () => tenants.filter((tenant) => tenant.status === "rollback_hold"),
    [tenants],
  );

  const exportVisibleTenants = useCallback(() => {
    if (filteredTenants.length === 0) {
      return;
    }

    const header = [
      copy.table.tenant,
      copy.table.rollout,
      copy.table.gate,
      copy.table.modules,
      copy.table.integration,
      copy.table.activity,
    ];

    const rows = filteredTenants.map((tenant) => [
      `${tenant.name} (${tenant.code})`,
      tenant.rollout.stage,
      currentGateStatus(tenant),
      tenant.enabledModules.join(" | "),
      tenant.integrationPackage.mode,
      formatDateTime(lastActivityAt(tenant)),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(toCsvCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `platform-tenants-${stageFilter}-${statusFilter}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [copy.table, filteredTenants, stageFilter, statusFilter]);

  const inferEmptyState = useCallback((): EmptyReason => {
    if (loadState?.empty?.reason) {
      return loadState.empty.reason;
    }
    if (errorStatus === 403) {
      return "permission_denied";
    }
    if (
      errorStatus === 404 ||
      error?.toLowerCase().includes("not provisioned")
    ) {
      return "not_provisioned";
    }
    if (errorStatus !== null && [502, 503, 504].includes(errorStatus)) {
      return "external_unavailable";
    }
    if (error) {
      return "fetch_failed";
    }
    if (tenants.length > 0 && filteredTenants.length === 0) {
      return "filtered_empty";
    }
    return "no_data";
  }, [
    error,
    errorStatus,
    filteredTenants.length,
    loadState?.empty,
    tenants.length,
  ]);

  const emptyDescriptor = useMemo<EmptyStateDescriptor>(() => {
    const reason = inferEmptyState();
    const source = copy.empty[reason as keyof typeof copy.empty];

    switch (reason) {
      case "permission_denied":
        return { reason, ...source, tone: "danger", icon: "warn" };
      case "external_unavailable":
        return { reason, ...source, tone: "warn", icon: "warn" };
      case "filtered_empty":
        return { reason, ...source, tone: "neutral", icon: "search" };
      case "not_provisioned":
      case "fetch_failed":
        return { reason, ...source, tone: "warn", icon: "health" };
      case "no_data":
      default:
        return { reason, ...source, tone: "neutral", icon: "tenants" };
    }
  }, [copy.empty, inferEmptyState]);

  const pageActions = loadState?.availableActions ?? fallbackPageActions();
  const canCreateTenant = pageActions.some(
    (action) => isCreateTenantAction(action) && action.enabled,
  );
  const emptyNextAction = loadState?.empty?.nextAction ?? null;

  const handlePageAction = useCallback(
    async (action: ResourceActionDescriptor) => {
      if (!action.enabled) {
        return;
      }

      if (isCreateTenantAction(action)) {
        setShowCreate(true);
        return;
      }

      if (isRefreshAction(action)) {
        await loadTenants({ silent: true });
      }
    },
    [loadTenants],
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const command: CreatePlatformTenantCommand = {
        name: createForm.name,
        code: createForm.code,
        status: createForm.status,
        enabledModules: createForm.enabledModules,
        quotas: {
          activeDrivers: parseQuota(createForm.activeDrivers),
          monthlyBookings: parseQuota(createForm.monthlyBookings),
          monthlyApiCalls: parseQuota(createForm.monthlyApiCalls),
        },
        integrationMode: createForm.integrationMode,
        ...(createForm.bootstrapAdminEmail.trim()
          ? { bootstrapAdminEmail: createForm.bootstrapAdminEmail.trim() }
          : {}),
        ...(createForm.sandboxBaseUrl.trim()
          ? { sandboxBaseUrl: createForm.sandboxBaseUrl.trim() }
          : {}),
      };
      await client.createPlatformTenant(command);
      setCreateForm(EMPTY_TENANT_FORM);
      setShowCreate(false);
      await loadTenants({ silent: true });
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      );
    } finally {
      setCreating(false);
    }
  };

  const executeTenantAction = useCallback(
    async (tenant: TenantListItem, action: ResourceActionDescriptor) => {
      if (!action.enabled) {
        return;
      }

      if (action.riskLevel === "medium") {
        const confirmed = window.confirm(
          copy.actionMessages[
            action.action as keyof typeof copy.actionMessages
          ] ??
            copy.actionLabels[
              action.action as keyof typeof copy.actionLabels
            ] ??
            action.action,
        );
        if (!confirmed) {
          return;
        }
      }

      let reason: string | null = null;
      if (action.requiresReason || action.riskLevel === "high") {
        reason = window.prompt(
          copy.actionMessages[
            action.action as keyof typeof copy.actionMessages
          ] ?? action.action,
        );
        if (!reason?.trim()) {
          return;
        }
      }

      try {
        setRefreshing(true);
        if (actionMatches(action.action, "activate_tenant", "activateTenant")) {
          await client.activateTenant(tenant.id);
        } else if (
          actionMatches(action.action, "suspend_tenant", "suspendTenant")
        ) {
          await client.suspendTenant(tenant.id);
        } else if (
          actionMatches(
            action.action,
            "enter_rollback_hold",
            "rollback_hold_tenant",
            "rollbackHoldTenant",
          )
        ) {
          await client.rollbackHoldTenant(tenant.id);
        } else {
          return;
        }

        void reason;
        await loadTenants({ silent: true });
      } catch (caughtError: unknown) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
        );
      } finally {
        setRefreshing(false);
      }
    },
    [client, copy.actionLabels, copy.actionMessages, loadTenants],
  );

  const renderOwner = useCallback(
    (userId: string | null, label: string) => {
      if (!userId) {
        return (
          <div style={stackedCellStyle}>
            <span style={secondaryTextStyle}>{label}</span>
            <span style={monoMetaStyle}>{copy.owners.none}</span>
          </div>
        );
      }

      return (
        <div style={stackedCellStyle}>
          <span style={secondaryTextStyle}>{label}</span>
          <Link
            href={`/users?userId=${encodeURIComponent(userId)}`}
            style={ownerLinkStyle}
          >
            {ownerMap.get(userId) ?? userId}
          </Link>
          <span style={monoMetaStyle}>{userId}</span>
        </div>
      );
    },
    [copy.owners.none, ownerMap],
  );

  const columns = useMemo<CanvasTableColumn<TenantRow>[]>(
    () => [
      {
        h: copy.table.tenant,
        w: 230,
        r: (tenant) => (
          <Link href={`/tenants/${tenant.id}`} style={tenantLinkStyle}>
            <span style={tenantNameStyle}>{tenant.name}</span>
            <span style={tenantMetaStyle}>
              {tenant.code} · {tenant.id}
            </span>
            <span style={secondaryTextStyle}>
              {formatPlatformCodeLabel(locale, tenant.status)}
            </span>
          </Link>
        ),
      },
      {
        h: copy.table.rollout,
        w: 160,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <CanvasPill
              theme={th}
              tone={toCanvasTone(tenantStageTone(tenant.rollout.stage))}
              dot
            >
              {formatPlatformCodeLabel(locale, tenant.rollout.stage)}
            </CanvasPill>
            <CanvasPill theme={th} tone={statusTone(tenant.status)}>
              {formatPlatformCodeLabel(locale, tenant.status)}
            </CanvasPill>
          </div>
        ),
      },
      {
        h: copy.table.gate,
        w: 160,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <CanvasPill
              theme={th}
              tone={gateTone(currentGateStatus(tenant))}
              dot
            >
              {formatPlatformCodeLabel(locale, currentGateStatus(tenant))}
            </CanvasPill>
            <span style={secondaryTextStyle}>
              {tenant.rollout.rollbackPrepared
                ? locale === "en"
                  ? "rollback plan ready"
                  : "rollback plan ready"
                : locale === "en"
                  ? "rollback prep pending"
                  : "rollback prep pending"}
            </span>
          </div>
        ),
      },
      {
        h: copy.table.owners,
        w: 220,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            {renderOwner(tenant.rollout.cutoverOwner, copy.owners.cutover)}
            {renderOwner(tenant.rollout.rollbackOwner, copy.owners.rollback)}
          </div>
        ),
      },
      {
        h: copy.table.modules,
        w: 180,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span style={monoMetaStyle}>
              {tenant.enabledModules.length}/{PLATFORM_TENANT_MODULES.length}
            </span>
            <span style={secondaryTextStyle}>
              {tenant.enabledModules
                .map(
                  (moduleCode: PlatformTenantModule) =>
                    moduleLabels[moduleCode],
                )
                .join(" · ")}
            </span>
          </div>
        ),
      },
      {
        h: copy.table.integration,
        w: 190,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span>
              {formatPlatformCodeLabel(locale, tenant.integrationPackage.mode)}
            </span>
            <span style={monoMetaStyle}>
              {truncate(getIntegrationEndpoint(tenant), 28)}
            </span>
          </div>
        ),
      },
      {
        h: copy.table.activity,
        w: 150,
        mono: true,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span>{formatDateTime(lastActivityAt(tenant))}</span>
            <Link href={`/tenants/${tenant.id}`} style={ownerLinkStyle}>
              {copy.links.detail}
            </Link>
          </div>
        ),
      },
      {
        h: copy.table.actions,
        w: 250,
        r: (tenant) => {
          const actions =
            tenant.availableActions && tenant.availableActions.length > 0
              ? tenant.availableActions
              : fallbackRowActions(tenant);
          const resourceLinks = resolveTenantLinks(tenant);

          return (
            <div style={rowActionWrapStyle}>
              <div style={deepLinkWrapStyle}>
                {resourceLinks.map((link) => (
                  <Link
                    key={`${link.targetApp}:${link.resourceId}:${link.route}`}
                    href={buildCrossAppHref(link)}
                    target={link.openMode === "new_tab" ? "_blank" : undefined}
                    rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
                    style={rowActionStyle("accent", false)}
                  >
                    {resolveCrossAppLabel(locale, copy.actionLabels, link)}
                  </Link>
                ))}
              </div>
              {actions.map((action: ResourceActionDescriptor) => (
                <button
                  key={action.action}
                  type="button"
                  onClick={() => void executeTenantAction(tenant, action)}
                  disabled={!action.enabled}
                  title={action.disabledReasonCode}
                  style={rowActionStyle(
                    toneFromRiskLevel(action.riskLevel),
                    !action.enabled,
                  )}
                >
                  {resolveActionLabel(copy.actionLabels, action)}
                </button>
              ))}
            </div>
          );
        },
      },
    ],
    [
      copy.actionLabels,
      copy.links.detail,
      copy.owners.cutover,
      copy.owners.rollback,
      copy.table.actions,
      copy.table.activity,
      copy.table.gate,
      copy.table.integration,
      copy.table.modules,
      copy.table.owners,
      copy.table.rollout,
      copy.table.tenant,
      executeTenantAction,
      locale,
      moduleLabels,
      renderOwner,
    ],
  );

  if (loading && !loadState) {
    return <div style={loadingStateStyle}>{t("tenants.loading")}</div>;
  }

  return (
    <CanvasShell
      theme={th}
      nav={navItems}
      active="tenants"
      currentPath="/tenants"
      breadcrumb={copy.breadcrumb}
      brandLabel="DRTS Fleet"
      brandSubLabel="Platform Admin"
      brandMark="PA"
      avatarLabel="PA"
      searchPlaceholder={copy.searchPlaceholder}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={th}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div style={headerActionsStyle}>
            <CanvasBtn
              theme={th}
              variant="secondary"
              onClick={() => void loadTenants({ silent: true })}
            >
              {refreshing ? copy.refreshing : copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="secondary"
              icon="reports"
              onClick={exportVisibleTenants}
              disabled={filteredTenants.length === 0}
            >
              {copy.exportAction}
            </CanvasBtn>
            {canCreateTenant ? (
              <CanvasBtn
                theme={th}
                variant="primary"
                icon={showCreate ? "x" : "plus"}
                onClick={() => setShowCreate((current) => !current)}
              >
                {showCreate
                  ? t("common.cancel")
                  : copy.actionLabels.create_tenant}
              </CanvasBtn>
            ) : null}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={summaryRowStyle}>
          {(
            [
              ["all", copy.filters.stage.all, stageCounts.all, "accent"],
              [
                "sandbox",
                copy.filters.stage.sandbox,
                stageCounts.sandbox,
                "warn",
              ],
              ["pilot", copy.filters.stage.pilot, stageCounts.pilot, "neutral"],
              [
                "production",
                copy.filters.stage.production,
                stageCounts.production,
                "success",
              ],
            ] as const
          ).map(([value, label, count, tone]) => (
            <button
              key={`summary-stage-${value}`}
              type="button"
              onClick={() => setStageFilter(value)}
              style={filterButtonStyle}
            >
              <CanvasPill
                theme={th}
                tone={stageFilter === value ? tone : "neutral"}
                dot={value !== "all"}
              >
                {label} {formatLocaleNumber(locale, count)}
              </CanvasPill>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setStatusFilter("rollback_hold")}
            style={filterButtonStyle}
          >
            <CanvasPill
              theme={th}
              tone={statusFilter === "rollback_hold" ? "danger" : "neutral"}
              dot
            >
              {copy.filters.status.rollback_hold}{" "}
              {formatLocaleNumber(locale, rollbackHoldTenants.length)}
            </CanvasPill>
          </button>
          <span style={{ flex: 1 }} />
          <CanvasPill theme={th} tone="neutral">
            {copy.refreshTier}
          </CanvasPill>
          <CanvasPill
            theme={th}
            tone={readyGateCount > 0 ? "accent" : "neutral"}
          >
            {copy.readyGate} {formatLocaleNumber(locale, readyGateCount)}
          </CanvasPill>
        </div>

        <div style={filterPanelStyle}>
          <div style={searchRowStyle}>
            <div style={searchFieldWrapStyle}>
              <div style={{ position: "relative" }}>
                <CanvasIcon name="search" size={14} style={searchIconStyle} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  style={searchInputStyle}
                />
              </div>
            </div>
            {freshness ? (
              <CanvasPill
                theme={th}
                tone={freshness.dataFreshness === "stale" ? "warn" : "accent"}
              >
                {
                  copy.freshness[
                    freshness.dataFreshness as keyof typeof copy.freshness
                  ]
                }{" "}
                · {copy.source[freshness.source as keyof typeof copy.source]}
              </CanvasPill>
            ) : null}
          </div>

          <div style={filterGroupStyle}>
            <span style={secondaryTextStyle}>{copy.filterTitleStage}</span>
            {(
              [
                ["all", copy.filters.stage.all, stageCounts.all],
                ["sandbox", copy.filters.stage.sandbox, stageCounts.sandbox],
                ["pilot", copy.filters.stage.pilot, stageCounts.pilot],
                [
                  "production",
                  copy.filters.stage.production,
                  stageCounts.production,
                ],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStageFilter(value)}
                style={filterButtonStyle}
              >
                <CanvasPill
                  theme={th}
                  tone={stageFilter === value ? "accent" : "neutral"}
                  dot={value !== "all"}
                >
                  {label} {formatLocaleNumber(locale, count)}
                </CanvasPill>
              </button>
            ))}
          </div>

          <div style={filterGroupStyle}>
            <span style={secondaryTextStyle}>{copy.filterTitleStatus}</span>
            {(
              [
                ["all", copy.filters.status.all, statusCounts.all],
                ["draft", copy.filters.status.draft, statusCounts.draft],
                ["active", copy.filters.status.active, statusCounts.active],
                ["paused", copy.filters.status.paused, statusCounts.paused],
                [
                  "rollback_hold",
                  copy.filters.status.rollback_hold,
                  statusCounts.rollback_hold,
                ],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                style={filterButtonStyle}
              >
                <CanvasPill
                  theme={th}
                  tone={
                    statusFilter === value
                      ? statusTone(value === "all" ? "draft" : value)
                      : "neutral"
                  }
                  dot={value !== "all"}
                >
                  {label} {formatLocaleNumber(locale, count)}
                </CanvasPill>
              </button>
            ))}
          </div>

          <div style={metaRowStyle}>
            <div style={metaClusterStyle}>
              <CanvasPill theme={th} tone="neutral">
                {copy.searchSummary(filteredTenants.length)}
              </CanvasPill>
              {freshness ? (
                <CanvasPill theme={th} tone="neutral">
                  {copy.freshnessAt} · {formatDateTime(freshness.generatedAt)}
                </CanvasPill>
              ) : null}
            </div>
            {loadState?.requestId ? (
              <span style={monoMetaStyle}>
                {copy.requestLabel}: {truncate(loadState.requestId, 18)}
              </span>
            ) : null}
          </div>
        </div>

        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={copy.loadErrorTitle}
            body={`${copy.loadErrorBody} ${error}`}
          />
        ) : null}

        {rollbackHoldTenants.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={copy.rollbackTitle}
            body={copy.rollbackBanner(rollbackHoldTenants.length)}
          />
        ) : null}

        {showCreate ? (
          <CanvasCard
            theme={th}
            title={copy.createTitle}
            subtitle={copy.createSubtitle}
          >
            <form onSubmit={handleCreate}>
              <div style={createGridStyle}>
                <div>
                  <h3 style={sectionTitleStyle}>{copy.createTitle}</h3>
                  <p style={sectionHintStyle}>{copy.createSubtitle}</p>
                </div>

                <div style={fieldGridStyle}>
                  <CanvasField
                    theme={th}
                    label={t("tenants.form.name")}
                    required
                  >
                    <input
                      value={createForm.name}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      required
                      placeholder="Acme Mobility"
                      style={inputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("tenants.form.code")}
                    required
                  >
                    <input
                      value={createForm.code}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          code: event.target.value,
                        }))
                      }
                      required
                      placeholder="acme_dispatch"
                      style={monoInputStyle}
                    />
                  </CanvasField>
                  <CanvasField theme={th} label={t("tenants.form.status")}>
                    <select
                      value={createForm.status}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          status: event.target.value as "active" | "inactive",
                        }))
                      }
                      style={inputStyle}
                    >
                      <option value="active">{t("common.active")}</option>
                      <option value="inactive">{t("common.inactive")}</option>
                    </select>
                  </CanvasField>
                </div>

                <div>
                  <h3 style={sectionTitleStyle}>
                    {t("tenants.quotaAllocation")}
                  </h3>
                  <p style={sectionHintStyle}>
                    {locale === "en"
                      ? "Set the initial monthly quota envelope before enabling traffic."
                      : "在正式啟用前先設定初始月配額範圍。"}
                  </p>
                  <div style={quotaGridStyle}>
                    <CanvasField
                      theme={th}
                      label={t("tenants.form.activeDrivers")}
                    >
                      <input
                        type="number"
                        min={0}
                        value={createForm.activeDrivers}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            activeDrivers: event.target.value,
                          }))
                        }
                        style={monoInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      label={t("tenants.form.monthlyBookings")}
                    >
                      <input
                        type="number"
                        min={0}
                        value={createForm.monthlyBookings}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            monthlyBookings: event.target.value,
                          }))
                        }
                        style={monoInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      label={t("tenants.form.monthlyApiCalls")}
                    >
                      <input
                        type="number"
                        min={0}
                        value={createForm.monthlyApiCalls}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            monthlyApiCalls: event.target.value,
                          }))
                        }
                        style={monoInputStyle}
                      />
                    </CanvasField>
                  </div>
                </div>

                <div>
                  <h3 style={sectionTitleStyle}>{t("tenants.form.modules")}</h3>
                  <p style={sectionHintStyle}>
                    {locale === "en"
                      ? "Keep the initial module footprint explicit."
                      : "把首批啟用模組明確列出。"}
                  </p>
                  <div style={moduleGridStyle}>
                    {PLATFORM_TENANT_MODULES.map(
                      (moduleCode: PlatformTenantModule) => {
                        const active =
                          createForm.enabledModules.includes(moduleCode);

                        return (
                          <button
                            key={moduleCode}
                            type="button"
                            onClick={() =>
                              setCreateForm((current) =>
                                toggleTenantModule(current, moduleCode),
                              )
                            }
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: `1px solid ${active ? th.accentBorder : th.border}`,
                              background: active ? th.accentBg : th.surfaceLo,
                              color: th.text,
                              cursor: "pointer",
                            }}
                          >
                            <CanvasPill
                              theme={th}
                              tone={active ? "accent" : "neutral"}
                            >
                              {moduleLabels[moduleCode]}
                            </CanvasPill>
                            <span style={secondaryTextStyle}>
                              {active
                                ? copy.moduleState.enabled
                                : copy.moduleState.disabled}
                            </span>
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>

                <div>
                  <h3 style={sectionTitleStyle}>
                    {t("tenants.section.onboarding")}
                  </h3>
                  <p style={sectionHintStyle}>
                    {locale === "en"
                      ? "Seed integration posture and bootstrap ownership from the platform side."
                      : "由平台端預先補齊 integration posture 與 bootstrap owner。"}
                  </p>
                  <div style={fieldGridStyle}>
                    <CanvasField
                      theme={th}
                      label={t("tenants.form.name")}
                      required
                    >
                      <input
                        value={createForm.name}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        required
                        placeholder="Acme Mobility"
                        style={inputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      label={t("tenants.form.code")}
                      required
                    >
                      <input
                        value={createForm.code}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            code: event.target.value,
                          }))
                        }
                        required
                        placeholder="acme_dispatch"
                        style={monoInputStyle}
                      />
                    </CanvasField>
                    <CanvasField theme={th} label={t("tenants.form.status")}>
                      <select
                        value={createForm.status}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            status: event.target.value as "active" | "inactive",
                          }))
                        }
                        style={inputStyle}
                      >
                        {PLATFORM_TENANT_INTEGRATION_MODES.map(
                          (mode: PlatformTenantIntegrationMode) => (
                            <option key={mode} value={mode}>
                              {formatPlatformCodeLabel(locale, mode)}
                            </option>
                          ),
                        )}
                      </select>
                    </CanvasField>
                  </div>

                  <div>
                    <h3 style={sectionTitleStyle}>
                      {t("tenants.quotaAllocation")}
                    </h3>
                    <p style={sectionHintStyle}>
                      {locale === "en"
                        ? "Set the initial monthly quota envelope before enabling traffic."
                        : "在正式啟用前先設定初始月配額範圍。"}
                    </p>
                    <div style={quotaGridStyle}>
                      <CanvasField
                        theme={th}
                        label={t("tenants.form.activeDrivers")}
                      >
                        <input
                          type="number"
                          min={0}
                          value={createForm.activeDrivers}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              activeDrivers: event.target.value,
                            }))
                          }
                          style={monoInputStyle}
                        />
                      </CanvasField>
                      <CanvasField
                        theme={th}
                        label={t("tenants.form.monthlyBookings")}
                      >
                        <input
                          type="number"
                          min={0}
                          value={createForm.monthlyBookings}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              monthlyBookings: event.target.value,
                            }))
                          }
                          style={monoInputStyle}
                        />
                      </CanvasField>
                      <CanvasField
                        theme={th}
                        label={t("tenants.form.monthlyApiCalls")}
                      >
                        <input
                          type="number"
                          min={0}
                          value={createForm.monthlyApiCalls}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              monthlyApiCalls: event.target.value,
                            }))
                          }
                          style={monoInputStyle}
                        />
                      </CanvasField>
                    </div>
                  </div>

                  <div>
                    <h3 style={sectionTitleStyle}>
                      {t("tenants.form.modules")}
                    </h3>
                    <p style={sectionHintStyle}>
                      {locale === "en"
                        ? "Keep the initial module footprint explicit."
                        : "把首批啟用模組明確列出。"}
                    </p>
                    <div style={moduleGridStyle}>
                      {PLATFORM_TENANT_MODULES.map((moduleCode) => {
                        const active =
                          createForm.enabledModules.includes(moduleCode);

                        return (
                          <button
                            key={moduleCode}
                            type="button"
                            onClick={() =>
                              setCreateForm((current) =>
                                toggleTenantModule(current, moduleCode),
                              )
                            }
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: `1px solid ${
                                active ? th.accentBorder : th.border
                              }`,
                              background: active ? th.accentBg : th.surfaceLo,
                              color: th.text,
                              cursor: "pointer",
                            }}
                          >
                            <CanvasPill
                              theme={th}
                              tone={active ? "accent" : "neutral"}
                            >
                              {moduleLabels[moduleCode]}
                            </CanvasPill>
                            <span
                              style={{ fontSize: 11.5, color: th.textMuted }}
                            >
                              {active
                                ? copy.moduleState.enabled
                                : copy.moduleState.disabled}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 style={sectionTitleStyle}>
                      {t("tenants.section.onboarding")}
                    </h3>
                    <p style={sectionHintStyle}>
                      {locale === "en"
                        ? "Seed integration posture and bootstrap ownership from the platform side."
                        : "由平台端預先補齊 integration posture 與 bootstrap owner。"}
                    </p>
                    <div style={fieldGridStyle}>
                      <CanvasField
                        theme={th}
                        label={t("tenants.form.integrationMode")}
                      >
                        <select
                          value={createForm.integrationMode}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              integrationMode: event.target
                                .value as (typeof PLATFORM_TENANT_INTEGRATION_MODES)[number],
                            }))
                          }
                          style={inputStyle}
                        >
                          {PLATFORM_TENANT_INTEGRATION_MODES.map((mode) => (
                            <option key={mode} value={mode}>
                              {formatPlatformCodeLabel(locale, mode)}
                            </option>
                          ))}
                        </select>
                      </CanvasField>
                      <CanvasField
                        theme={th}
                        label={t("tenants.form.bootstrapAdminEmail")}
                      >
                        <input
                          value={createForm.bootstrapAdminEmail}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              bootstrapAdminEmail: event.target.value,
                            }))
                          }
                          placeholder="admin@acme.example"
                          style={inputStyle}
                        />
                      </CanvasField>
                      <CanvasField
                        theme={th}
                        label={t("tenants.form.sandboxBaseUrl")}
                      >
                        <input
                          value={createForm.sandboxBaseUrl}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              sandboxBaseUrl: event.target.value,
                            }))
                          }
                          placeholder="https://sandbox.acme.example"
                          style={monoInputStyle}
                        />
                      </CanvasField>
                    </div>
                  </div>

                  <div style={createActionsStyle}>
                    <button
                      type="submit"
                      disabled={createDisabled}
                      style={submitButtonStyle(createDisabled)}
                    >
                      {creating
                        ? t("common.creating")
                        : t("tenants.createTenant")}
                    </button>
                  </div>
                </div>
              </form>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title={copy.createSummaryTitle}
              subtitle={copy.createSummarySubtitle}
            >
              <div style={createGridStyle}>
                <div style={tenantSummaryStyle}>
                  <CanvasKPI
                    theme={th}
                    label={copy.bootstrap.modules}
                    value={`${createForm.enabledModules.length}/${PLATFORM_TENANT_MODULES.length}`}
                    sub={locale === "en" ? "tenant modules" : "tenant modules"}
                  />
                  <CanvasKPI
                    theme={th}
                    label={copy.bootstrap.quota}
                    value={createForm.monthlyBookings || "0"}
                    sub={locale === "en" ? "bookings" : "bookings"}
                  />
                  <CanvasKPI
                    theme={th}
                    label={copy.bootstrap.api}
                    value={createForm.monthlyApiCalls || "0"}
                    sub="API"
                  />
                </div>
                <CanvasDL
                  theme={th}
                  cols={1}
                  items={[
                    {
                      k: copy.bootstrap.status,
                      v: formatPlatformCodeLabel(locale, createForm.status),
                    },
                    {
                      k: copy.bootstrap.integration,
                      v: formatPlatformCodeLabel(
                        locale,
                        createForm.integrationMode,
                      ),
                    },
                    {
                      k: copy.bootstrap.admin,
                      v:
                        createForm.bootstrapAdminEmail.trim() ||
                        copy.bootstrap.empty,
                      mono: true,
                    },
                    {
                      k: copy.bootstrap.sandbox,
                      v:
                        createForm.sandboxBaseUrl.trim() ||
                        copy.bootstrap.empty,
                      mono: true,
                    },
                  ]}
                />
              </div>
            </CanvasCard>
          </div>
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {filteredTenants.length > 0 ? (
            <CanvasTable<TenantRow>
              theme={th}
              columns={columns}
              rows={filteredTenants as TenantRow[]}
            />
          ) : (
            <div style={emptyStateStyle}>
              <CanvasIcon name={emptyDescriptor.icon} size={24} />
              <CanvasPill theme={th} tone={emptyDescriptor.tone}>
                {emptyDescriptor.reason}
              </CanvasPill>
              <div style={{ color: th.text, fontWeight: 600 }}>
                {emptyDescriptor.title}
              </div>
              <div style={{ maxWidth: 460 }}>{emptyDescriptor.body}</div>
              {emptyNextAction ? (
                <CanvasBtn
                  theme={th}
                  variant={emptyNextAction.enabled ? "primary" : "secondary"}
                  onClick={() => void handlePageAction(emptyNextAction)}
                  disabled={!emptyNextAction.enabled}
                >
                  {resolveActionLabel(copy.actionLabels, emptyNextAction)}
                </CanvasBtn>
              ) : null}
              {canCreateTenant && emptyDescriptor.reason === "no_data" ? (
                <CanvasBtn
                  theme={th}
                  variant="primary"
                  icon="plus"
                  onClick={() => setShowCreate(true)}
                >
                  {copy.actionLabels.create_tenant}
                </CanvasBtn>
              ) : null}
              {emptyDescriptor.reason === "filtered_empty" ? (
                <CanvasBtn
                  theme={th}
                  variant="secondary"
                  onClick={() => {
                    setSearchTerm("");
                    setStageFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  {copy.refresh}
                </CanvasBtn>
              ) : null}
            </div>
          )}
        </CanvasCard>
      </div>
    </CanvasShell>
  );
}
