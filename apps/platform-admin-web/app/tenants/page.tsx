"use client";

import Link from "next/link";
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
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
import {
  formatDateTime,
  truncate,
  usePlatformAdminClient,
} from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import { getRuntimeApiBaseUrl } from "@/lib/runtime-config";
import type {
  ActionReceipt,
  ApiSuccessEnvelope,
  CreatePlatformTenantCommand,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  PlatformAdminTenantRecord,
  PlatformAdminUserRecord,
  PlatformTenantLifecycleActionCommand,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_INTEGRATION_MODES,
  PLATFORM_TENANT_MODULES,
  type PlatformTenantIntegrationMode,
  type PlatformTenantModule,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
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

type TenantStageFilter = "all" | "sandbox" | "pilot" | "production" | "hold";
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

type EmptyVisual = {
  badge: string;
  title: string;
  body: string;
  hint?: string;
  tone: CanvasTone;
  icon: "tenants" | "search" | "warn" | "health";
};

type ConfirmIntent =
  | {
      kind: "create";
      action: ResourceActionDescriptor;
    }
  | {
      kind: "tenant_action";
      action: ResourceActionDescriptor;
      tenant: TenantListItem;
    };

type WriteReceiptState = ActionReceipt & {
  requestId: string;
};

const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_INTERVALS: Record<RefreshTier, number> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: 0,
};
const REFRESH_INTERVAL_MS = REFRESH_INTERVALS[REFRESH_TIER];

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const utilityRowStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
} satisfies CSSProperties;

const utilityClusterStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
} satisfies CSSProperties;

const toolbarStyle = {
  display: "grid",
  gap: 12,
  padding: 16,
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  background: theme.surface,
} satisfies CSSProperties;

const searchRowStyle = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
} satisfies CSSProperties;

const searchWrapStyle = {
  position: "relative",
  flex: "1 1 280px",
  minWidth: 240,
} satisfies CSSProperties;

const searchInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
  padding: "9px 12px 9px 34px",
  outline: "none",
} satisfies CSSProperties;

const searchIconStyle = {
  position: "absolute",
  left: 10,
  top: "50%",
  transform: "translateY(-50%)",
  color: theme.textDim,
} satisfies CSSProperties;

const filterRowStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
} satisfies CSSProperties;

const filterButtonStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
} satisfies CSSProperties;

const subtleLabelStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.4,
} satisfies CSSProperties;

const monoStyle = {
  color: theme.textDim,
  fontSize: 11,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const linkStackStyle = {
  display: "grid",
  gap: 4,
  color: theme.text,
  textDecoration: "none",
} satisfies CSSProperties;

const stackedCellStyle = {
  display: "grid",
  gap: 4,
} satisfies CSSProperties;

const actionWrapStyle = {
  display: "grid",
  gap: 6,
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
} satisfies CSSProperties;

const readOnlyHintStyle = {
  display: "grid",
  gap: 4,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px dashed ${theme.border}`,
  background: theme.surfaceLo,
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0 14px",
} satisfies CSSProperties;

const inputStyle = (mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: mono ? theme.monoFamily : theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

const moduleGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
} satisfies CSSProperties;

const emptyStateStyle = {
  display: "grid",
  justifyItems: "center",
  gap: 10,
  padding: "32px 24px",
  textAlign: "center",
  color: theme.textMuted,
} satisfies CSSProperties;

const toastViewportStyle = {
  position: "fixed",
  top: 92,
  right: 24,
  zIndex: 30,
  width: "min(420px, calc(100vw - 32px))",
} satisfies CSSProperties;

const toastCardStyle = {
  display: "grid",
  gap: 10,
  padding: 16,
  borderRadius: 14,
  border: `1px solid ${theme.successBorder}`,
  background: theme.surface,
  boxShadow: "0 20px 40px rgba(15, 23, 42, 0.16)",
} satisfies CSSProperties;

const modalViewportStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "rgba(15, 23, 42, 0.56)",
  backdropFilter: "blur(6px)",
} satisfies CSSProperties;

const modalCardStyle = {
  width: "min(520px, 100%)",
  display: "grid",
  gap: 16,
  padding: 20,
  borderRadius: 18,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  boxShadow: "0 32px 80px rgba(15, 23, 42, 0.28)",
} satisfies CSSProperties;

const modalFooterStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          tenantDashboard: "Cross-tenant governance",
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
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGov: "租戶治理",
          tenants: "租戶",
          tenantDashboard: "跨租戶治理",
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
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    {
      key: "health",
      href: "/health",
      icon: "health",
      label: labels.health,
      badge: "2",
      badgeTone: "warn",
    },
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
      label: labels.tenantDashboard,
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
      badge: "3",
      badgeTone: "warn",
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
  ];
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
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        camelCaseKey(key),
        deepCamelCase(nested),
      ]),
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
    typeof (value as CrossAppResourceLink).targetApp === "string" &&
    typeof (value as CrossAppResourceLink).route === "string",
  );
}

function isRefreshMetadata(value: unknown): value is UiRefreshMetadata {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as UiRefreshMetadata).generatedAt === "string" &&
    typeof (value as UiRefreshMetadata).staleAfterMs === "number",
  );
}

function isActionReceipt(value: unknown): value is ActionReceipt {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as ActionReceipt).actionId === "string" &&
    typeof (value as ActionReceipt).resourceType === "string" &&
    typeof (value as ActionReceipt).resourceId === "string" &&
    typeof (value as ActionReceipt).status === "string" &&
    typeof (value as ActionReceipt).message === "string",
  );
}

function isEmptyEnvelope(value: unknown): value is EmptyStateEnvelope {
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
      emptyState?: unknown;
      refresh?: unknown;
    };

    return {
      items: record.items as TenantListItem[],
      availableActions: Array.isArray(record.availableActions)
        ? record.availableActions.filter(isResourceActionDescriptor)
        : [],
      empty: isEmptyEnvelope(record.emptyState)
        ? record.emptyState
        : isEmptyEnvelope(record.empty)
          ? record.empty
          : null,
      refresh: isRefreshMetadata(record.refresh) ? record.refresh : null,
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

function toCanvasTone(tone: ReturnType<typeof tenantStageTone>): CanvasTone {
  if (tone === "warning") {
    return "warn";
  }
  if (tone === "info") {
    return "accent";
  }
  return tone;
}

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

function actionMatches(action: string, ...candidates: string[]) {
  return candidates.some((candidate) => candidate === action);
}

function isCreateTenantAction(action: ResourceActionDescriptor) {
  return actionMatches(action.action, "create_tenant", "createPlatformTenant");
}

function isRefreshAction(action: ResourceActionDescriptor) {
  return actionMatches(action.action, "refresh", "reload", "refetch");
}

function toLifecycleActionCommand(
  reason: string | null,
): PlatformTenantLifecycleActionCommand | undefined {
  const normalized = reason?.trim();
  return normalized ? { reason: normalized } : undefined;
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
      label: "open_ops_console",
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

function lastActivityAt(tenant: TenantListItem) {
  return (
    tenant.lastActivityAt ?? tenant.rollout.lastPromotedAt ?? tenant.updatedAt
  );
}

function describeRefreshTier(locale: string, tier: RefreshTier) {
  const cadence =
    REFRESH_INTERVALS[tier] > 0
      ? `${Math.round(REFRESH_INTERVALS[tier] / 1000)}s`
      : "manual";
  return locale === "en"
    ? `Refresh tier T4 · ${cadence}`
    : `Refresh tier T4 · ${cadence === "manual" ? "手動" : cadence}`;
}

function formatLocaleNumber(locale: string, value: number) {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function toCsvCell(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function resolveOwnerName(
  ownerMap: Map<string, string>,
  userId: string | null,
  emptyText: string,
) {
  if (!userId) {
    return emptyText;
  }
  return ownerMap.get(userId) ?? userId;
}

function resolveAuditHref(auditId: string) {
  return `/audit?auditId=${encodeURIComponent(auditId)}`;
}

function normalizeActionReceipt(
  payload: unknown,
  requestId: string,
): WriteReceiptState | null {
  const data = deepCamelCase(payload);
  if (!isActionReceipt(data)) {
    return null;
  }

  return {
    ...data,
    requestId,
  };
}

export default function TenantsPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [stageFilter, setStageFilter] = useState<TenantStageFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] =
    useState<TenantFormState>(EMPTY_TENANT_FORM);
  const [confirmIntent, setConfirmIntent] = useState<ConfirmIntent | null>(
    null,
  );
  const [confirmReason, setConfirmReason] = useState("");
  const [receipt, setReceipt] = useState<WriteReceiptState | null>(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const copy =
    locale === "en"
      ? {
          title: "Tenants",
          subtitle:
            "Manage tenant lifecycle from bootstrap through pilot and production rollout.",
          breadcrumb: ["Tenant governance", "Tenants"],
          refreshTier: describeRefreshTier(locale, REFRESH_TIER),
          searchPlaceholder: "Search tenant name or code",
          searchSummary: (count: number) => `${count} visible tenants`,
          requestId: "Request",
          freshnessAt: "Snapshot",
          loadErrorTitle: "Unable to refresh tenant roster",
          loadErrorBody:
            "The page keeps the last successful snapshot while a new fetch is retried.",
          rollbackBannerTitle: "Rollback hold cluster",
          rollbackBannerBody: (count: number) =>
            `${count} tenants are in rollback hold and need governance attention before the next promotion.`,
          readyGate: "Ready gate",
          createTitle: "Create tenant",
          createSubtitle:
            "Bootstrap the tenant identity, modules, quota envelope, and onboarding contact.",
          clearFilters: "Clear filters",
          export: "Export CSV",
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
          empty: {
            no_data: {
              badge: "Roster empty",
              title: "No tenants yet",
              body: "Create the first tenant to seed the platform-admin lifecycle roster.",
              hint: "Create tenant appears only when the backend grants it for this actor.",
              tone: "neutral" as CanvasTone,
              icon: "tenants" as const,
            },
            not_provisioned: {
              badge: "Provisioning required",
              title: "Tenant roster is not provisioned",
              body: "The backing tenant-governance source has not been wired for this environment.",
              hint: "Use the backend-provided next action to wire the source before expecting rows here.",
              tone: "warn" as CanvasTone,
              icon: "health" as const,
            },
            fetch_failed: {
              badge: "Refresh failed",
              title: "Roster refresh failed",
              body: "The latest read attempt failed before new list data could be loaded.",
              hint: "The last successful snapshot stays visible until a new refresh succeeds.",
              tone: "warn" as CanvasTone,
              icon: "warn" as const,
            },
            permission_denied: {
              badge: "Read denied",
              title: "No access to tenant lifecycle data",
              body: "This platform-admin role cannot read the tenant roster.",
              hint: "An empty list here is intentional: the current actor is authority-scoped out.",
              tone: "danger" as CanvasTone,
              icon: "warn" as const,
            },
            external_unavailable: {
              badge: "Dependency degraded",
              title: "Upstream tenant source unavailable",
              body: "An upstream dependency for tenant lifecycle reads is degraded or offline.",
              hint: "Cross-app operational views may still have more context while this source recovers.",
              tone: "warn" as CanvasTone,
              icon: "health" as const,
            },
            filtered_empty: {
              badge: "No filter matches",
              title: "No tenants match the current filters",
              body: "Widen the search text, rollout stage, or tenant status filter to see more rows.",
              hint: "The roster exists, but the current query narrows the visible set to zero rows.",
              tone: "neutral" as CanvasTone,
              icon: "search" as const,
            },
          },
          tabs: {
            all: "All",
            production: "Production",
            pilot: "Pilot",
            sandbox: "Sandbox",
            hold: "Rollback hold",
          },
          filters: {
            stage: "Rollout stage",
            status: "Tenant status",
            allStages: "All stages",
            allStatuses: "All statuses",
          },
          actionLabels: {
            refresh: "Refresh",
            create_tenant: "Create tenant",
            activate_tenant: "Activate",
            suspend_tenant: "Suspend",
            enter_rollback_hold: "Rollback hold",
            open_ops_console: "Open ops view",
            open_tenant_console: "Open tenant console",
            view_audit: "View audit",
          },
          actionMessages: {
            suspend_tenant: "Suspend this tenant lifecycle?",
            activate_tenant: "Restore this tenant to active state?",
            enter_rollback_hold:
              "Enter rollback hold for this tenant. A reason is required.",
            create_tenant:
              "Create this tenant and seed its lifecycle governance record?",
          },
          confirmTitle: "Confirm action",
          confirmReasonLabel: "Reason",
          confirmReasonPlaceholder:
            "Explain the governance reason that justifies this action.",
          confirmCancel: "Cancel",
          confirmSubmit: "Confirm",
          receiptTitle: "Action recorded",
          receiptOpenAudit: "View audit",
          receiptDismiss: "Dismiss",
          receiptBody: (message: string) => message,
          receiptFallbackBody: (label: string) =>
            `${label} completed. Audit receipt is still syncing.`,
          table: {
            tenant: "TENANT",
            stage: "STAGE",
            gate: "GATE",
            owners: "OWNERS",
            modules: "MODULES",
            integration: "INTEGRATION",
            activity: "LAST ACTIVITY",
            actions: "ACTIONS",
          },
          ownerLabels: {
            cutover: "Cutover owner",
            rollback: "Rollback owner",
            none: "Unassigned",
          },
          moduleState: {
            enabled: "enabled",
            disabled: "optional",
          },
        }
      : {
          title: "租戶",
          subtitle: "管理 tenant 從建立到 production rollout 的完整生命週期。",
          breadcrumb: ["租戶治理", "租戶"],
          refreshTier: describeRefreshTier(locale, REFRESH_TIER),
          searchPlaceholder: "搜尋租戶名稱或代碼",
          searchSummary: (count: number) => `目前顯示 ${count} 筆租戶`,
          requestId: "Request",
          freshnessAt: "快照時間",
          loadErrorTitle: "無法更新租戶名單",
          loadErrorBody: "系統會保留最近一次成功快照，並持續重試新資料。",
          rollbackBannerTitle: "Rollback hold 群組",
          rollbackBannerBody: (count: number) =>
            `${count} 個租戶目前處於 rollback hold，需要先完成治理判讀後才能再次推進。`,
          readyGate: "Ready gate",
          createTitle: "建立租戶",
          createSubtitle: "補齊租戶身份、模組、配額與 onboarding 聯絡資訊。",
          clearFilters: "清除篩選",
          export: "匯出 CSV",
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
          empty: {
            no_data: {
              badge: "Roster empty",
              title: "尚無租戶",
              body: "先建立第一個租戶，才能開始 tenant lifecycle roster。",
              hint: "只有 backend 針對目前 actor 開放時，建立租戶 CTA 才會出現。",
              tone: "neutral" as CanvasTone,
              icon: "tenants" as const,
            },
            not_provisioned: {
              badge: "Provisioning required",
              title: "租戶名單尚未 provision",
              body: "這個環境還沒接上租戶治理資料來源。",
              hint: "請依 backend 回傳的 next action 先完成資料源接線。",
              tone: "warn" as CanvasTone,
              icon: "health" as const,
            },
            fetch_failed: {
              badge: "Refresh failed",
              title: "名單更新失敗",
              body: "最近一次讀取失敗，暫時無法拿到新的列表資料。",
              hint: "系統會保留最近一次成功快照，直到下一次刷新成功。",
              tone: "warn" as CanvasTone,
              icon: "warn" as const,
            },
            permission_denied: {
              badge: "Read denied",
              title: "目前角色無法讀取租戶生命週期資料",
              body: "這個 platform-admin 角色沒有租戶名單讀取權限。",
              hint: "這裡的空列表代表權限邊界，而不是資料真的不存在。",
              tone: "danger" as CanvasTone,
              icon: "warn" as const,
            },
            external_unavailable: {
              badge: "Dependency degraded",
              title: "上游租戶來源不可用",
              body: "租戶 lifecycle 依賴的上游服務目前降級或離線。",
              hint: "可先改走 cross-app operational view 取得更多上下文。",
              tone: "warn" as CanvasTone,
              icon: "health" as const,
            },
            filtered_empty: {
              badge: "No filter matches",
              title: "目前篩選條件沒有結果",
              body: "請放寬搜尋字詞、rollout stage 或 tenant status。",
              hint: "名單仍存在，只是目前條件把可見結果縮到 0 筆。",
              tone: "neutral" as CanvasTone,
              icon: "search" as const,
            },
          },
          tabs: {
            all: "全部",
            production: "Production",
            pilot: "Pilot",
            sandbox: "Sandbox",
            hold: "Rollback hold",
          },
          filters: {
            stage: "Rollout stage",
            status: "Tenant status",
            allStages: "全部 stage",
            allStatuses: "全部狀態",
          },
          actionLabels: {
            refresh: "重新整理",
            create_tenant: "建立租戶",
            activate_tenant: "啟用",
            suspend_tenant: "暫停",
            enter_rollback_hold: "Rollback hold",
            open_ops_console: "開啟 ops 視圖",
            open_tenant_console: "開啟 tenant console",
            view_audit: "查看稽核",
          },
          actionMessages: {
            suspend_tenant: "要暫停這個租戶生命週期嗎？",
            activate_tenant: "要把這個租戶恢復成 active 狀態嗎？",
            enter_rollback_hold:
              "要把這個租戶切進 rollback hold。此動作需要理由。",
            create_tenant: "要建立這個租戶並初始化其 lifecycle 治理資料嗎？",
          },
          confirmTitle: "確認動作",
          confirmReasonLabel: "理由",
          confirmReasonPlaceholder: "請填寫這次治理動作的原因。",
          confirmCancel: "取消",
          confirmSubmit: "確認",
          receiptTitle: "動作已記錄",
          receiptOpenAudit: "查看稽核",
          receiptDismiss: "關閉",
          receiptBody: (message: string) => message,
          receiptFallbackBody: (label: string) =>
            `${label} 已完成，稽核收據仍在同步中。`,
          table: {
            tenant: "TENANT",
            stage: "STAGE",
            gate: "GATE",
            owners: "OWNERS",
            modules: "MODULES",
            integration: "INTEGRATION",
            activity: "LAST ACTIVITY",
            actions: "ACTIONS",
          },
          ownerLabels: {
            cutover: "Cutover owner",
            rollback: "Rollback owner",
            none: "未指定",
          },
          moduleState: {
            enabled: "已啟用",
            disabled: "可選",
          },
        };

  const navItems = useMemo(() => buildPlatformNav(locale), [locale]);
  const moduleLabels = useMemo(() => createTenantModuleLabels(() => ""), []);

  useEffect(() => {
    if (!receipt) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setReceipt(null);
    }, 6_000);

    return () => window.clearTimeout(timeoutId);
  }, [receipt]);

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
            headers: { "Content-Type": "application/json" },
          },
        );

        if (!response.ok) {
          const message = await response.text();
          setErrorStatus(response.status);
          throw new Error(`API error ${response.status}: ${message}`);
        }

        const envelope = (await response.json()) as ApiSuccessEnvelope<unknown>;
        const normalized = normalizeTenantListEnvelope(envelope.data);
        const users = await client.listPlatformAdminUsers();

        setLoadState({
          tenants: normalized.items,
          users,
          availableActions: normalized.availableActions,
          empty: normalized.empty,
          refresh: normalized.refresh,
          loadedAt: envelope.meta?.timestamp ?? new Date().toISOString(),
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

    if (REFRESH_INTERVAL_MS <= 0) {
      return;
    }

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
  const pageActions =
    loadState?.availableActions.filter((action) => !isRefreshAction(action)) ??
    [];
  const createTenantAction = useMemo(
    () => pageActions.find((action) => isCreateTenantAction(action)) ?? null,
    [pageActions],
  );

  const stageCounts = useMemo(
    () => ({
      all: tenants.length,
      production: tenants.filter(
        (tenant) =>
          tenant.rollout.stage === "production" &&
          tenant.status !== "rollback_hold",
      ).length,
      pilot: tenants.filter((tenant) => tenant.rollout.stage === "pilot")
        .length,
      sandbox: tenants.filter((tenant) => tenant.rollout.stage === "sandbox")
        .length,
      hold: tenants.filter((tenant) => tenant.status === "rollback_hold")
        .length,
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

  const rollbackHoldCount = stageCounts.hold;

  const freshness = useMemo(() => {
    if (loadState?.refresh) {
      const generatedAt = new Date(loadState.refresh.generatedAt).getTime();
      const staleAt = generatedAt + loadState.refresh.staleAfterMs;
      return {
        ...loadState.refresh,
        dataFreshness:
          Number.isFinite(generatedAt) && Date.now() > staleAt
            ? ("stale" as const)
            : loadState.refresh.dataFreshness,
      };
    }

    if (!loadState?.loadedAt) {
      return null;
    }

    return {
      generatedAt: loadState.loadedAt,
      staleAfterMs: REFRESH_INTERVAL_MS,
      dataFreshness:
        REFRESH_INTERVAL_MS > 0 &&
        Date.now() >
          new Date(loadState.loadedAt).getTime() + REFRESH_INTERVAL_MS
          ? ("stale" as const)
          : ("fresh" as const),
      source: "live" as const,
    };
  }, [loadState?.loadedAt, loadState?.refresh]);

  const filteredTenants = useMemo(() => {
    const query = deferredSearchTerm.trim().toLowerCase();

    return [...tenants]
      .filter((tenant) => {
        const matchesQuery =
          query.length === 0 ||
          tenant.name.toLowerCase().includes(query) ||
          tenant.code.toLowerCase().includes(query);
        const matchesStage =
          stageFilter === "all" ||
          (stageFilter === "hold"
            ? tenant.status === "rollback_hold"
            : tenant.rollout.stage === stageFilter);
        const matchesStatus =
          statusFilter === "all" || tenant.status === statusFilter;

        return matchesQuery && matchesStage && matchesStatus;
      })
      .sort(
        (left, right) =>
          new Date(lastActivityAt(right)).getTime() -
          new Date(lastActivityAt(left)).getTime(),
      );
  }, [deferredSearchTerm, stageFilter, statusFilter, tenants]);

  const inferEmptyReason = useCallback((): EmptyReason => {
    if (tenants.length > 0 && filteredTenants.length === 0) {
      return "filtered_empty";
    }
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
    return "no_data";
  }, [
    error,
    errorStatus,
    filteredTenants.length,
    loadState?.empty,
    tenants.length,
  ]);

  const emptyReason = inferEmptyReason();
  const emptyVisual: EmptyVisual =
    copy.empty[emptyReason as keyof typeof copy.empty];
  const emptyNextAction = loadState?.empty?.nextAction ?? null;

  const resolveActionLabel = useCallback(
    (action: ResourceActionDescriptor) =>
      copy.actionLabels[action.action as keyof typeof copy.actionLabels] ??
      action.action,
    [copy.actionLabels],
  );

  const handlePageAction = useCallback(
    async (action: ResourceActionDescriptor) => {
      if (!action.enabled) {
        return;
      }

      if (isRefreshAction(action)) {
        await loadTenants({ silent: true });
        return;
      }

      if (isCreateTenantAction(action)) {
        setShowCreate((current) => !current);
        return;
      }

      setError(`Unsupported page action: ${action.action}`);
    },
    [loadTenants],
  );

  const postTenantWrite = useCallback(
    async <T,>(path: string, body?: unknown) => {
      const requestId =
        globalThis.crypto?.randomUUID?.() ??
        `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const apiBaseUrl = getRuntimeApiBaseUrl().replace(/\/$/, "");
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
          "Idempotency-Key": requestId,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`API error ${response.status}: ${message}`);
      }

      const envelope = (await response.json()) as ApiSuccessEnvelope<T>;

      return {
        envelope,
        requestId,
        receipt: normalizeActionReceipt(envelope.data, requestId),
      };
    },
    [],
  );

  const executeTenantAction = useCallback(
    async (tenant: TenantListItem, action: ResourceActionDescriptor) => {
      if (!action.enabled) {
        return;
      }

      setConfirmReason("");
      setConfirmIntent({
        kind: "tenant_action",
        action,
        tenant,
      });
    },
    [],
  );

  const handleCreate = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!createTenantAction?.enabled) {
        return;
      }

      setConfirmReason("");
      setConfirmIntent({
        kind: "create",
        action: createTenantAction,
      });
    },
    [createTenantAction],
  );

  const confirmBodyText =
    confirmIntent &&
    (copy.actionMessages[
      confirmIntent.action.action as keyof typeof copy.actionMessages
    ] ??
      resolveActionLabel(confirmIntent.action));

  const submitConfirmedIntent = useCallback(async () => {
    if (!confirmIntent) {
      return;
    }

    const action = confirmIntent.action;
    const trimmedReason = confirmReason.trim();
    if (
      (action.requiresReason || action.riskLevel === "high") &&
      !trimmedReason
    ) {
      return;
    }

    setError(null);

    try {
      if (confirmIntent.kind === "create") {
        setCreating(true);
        const command: CreatePlatformTenantCommand = {
          name: createForm.name.trim(),
          code: createForm.code.trim(),
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

        const { requestId, receipt: nextReceipt } =
          await postTenantWrite<PlatformAdminTenantRecord>(
            "/api/platform-admin/tenants",
            command,
          );
        setReceipt(
          nextReceipt ?? {
            actionId: requestId,
            auditId: "",
            resourceType: "platform_tenant",
            resourceId: createForm.code.trim() || createForm.name.trim(),
            status: "completed",
            message: copy.receiptFallbackBody(resolveActionLabel(action)),
            requestId,
          },
        );
        setCreateForm(EMPTY_TENANT_FORM);
        setShowCreate(false);
      } else {
        setRefreshing(true);
        const command = toLifecycleActionCommand(trimmedReason);
        const tenant = confirmIntent.tenant;
        let path: string | null = null;

        if (actionMatches(action.action, "activate_tenant", "activateTenant")) {
          path = `/api/platform-admin/tenants/${encodeURIComponent(tenant.id)}/activate`;
        } else if (
          actionMatches(action.action, "suspend_tenant", "suspendTenant")
        ) {
          path = `/api/platform-admin/tenants/${encodeURIComponent(tenant.id)}/suspend`;
        } else if (
          actionMatches(
            action.action,
            "enter_rollback_hold",
            "rollback_hold_tenant",
            "rollbackHoldTenant",
          )
        ) {
          path = `/api/platform-admin/tenants/${encodeURIComponent(tenant.id)}/rollback-hold`;
        }

        if (!path) {
          setError(`Unsupported tenant action: ${action.action}`);
          return;
        }

        const { requestId, receipt: nextReceipt } =
          await postTenantWrite<PlatformAdminTenantRecord>(path, command);
        setReceipt(
          nextReceipt ?? {
            actionId: requestId,
            auditId: "",
            resourceType: "platform_tenant",
            resourceId: tenant.id,
            status: "completed",
            message: copy.receiptFallbackBody(resolveActionLabel(action)),
            requestId,
          },
        );
      }

      setConfirmIntent(null);
      setConfirmReason("");
      await loadTenants({ silent: true });
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      );
    } finally {
      setRefreshing(false);
      setCreating(false);
    }
  }, [
    confirmIntent,
    confirmReason,
    copy,
    createForm,
    loadTenants,
    postTenantWrite,
    resolveActionLabel,
  ]);

  const exportVisibleRows = useCallback(() => {
    if (filteredTenants.length === 0) {
      return;
    }

    const rows = filteredTenants.map((tenant) => [
      `${tenant.name} (${tenant.code})`,
      tenant.rollout.stage,
      currentGateStatus(tenant),
      tenant.status,
      tenant.enabledModules.join(" | "),
      tenant.integrationPackage.mode,
      lastActivityAt(tenant),
    ]);

    const csv = [
      [
        copy.table.tenant,
        copy.table.stage,
        copy.table.gate,
        "STATUS",
        copy.table.modules,
        copy.table.integration,
        copy.table.activity,
      ],
      ...rows,
    ]
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

  const columns = useMemo<CanvasTableColumn<TenantRow>[]>(
    () => [
      {
        h: copy.table.tenant,
        w: 250,
        r: (tenant) => (
          <Link href={`/tenants/${tenant.id}`} style={linkStackStyle}>
            <span style={{ fontWeight: 600 }}>{tenant.name}</span>
            <span style={monoStyle}>
              {tenant.code} · {truncate(tenant.id, 16)}
            </span>
            <span style={subtleLabelStyle}>
              {formatPlatformCodeLabel(locale, tenant.status)}
            </span>
          </Link>
        ),
      },
      {
        h: copy.table.stage,
        w: 140,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <CanvasPill
              theme={theme}
              tone={toCanvasTone(tenantStageTone(tenant.rollout.stage))}
              dot
            >
              {formatPlatformCodeLabel(locale, tenant.rollout.stage)}
            </CanvasPill>
            <CanvasPill theme={theme} tone={statusTone(tenant.status)}>
              {formatPlatformCodeLabel(locale, tenant.status)}
            </CanvasPill>
          </div>
        ),
      },
      {
        h: copy.table.gate,
        w: 150,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <CanvasPill
              theme={theme}
              tone={gateTone(currentGateStatus(tenant))}
              dot
            >
              {formatPlatformCodeLabel(locale, currentGateStatus(tenant))}
            </CanvasPill>
            <span style={subtleLabelStyle}>
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
            <span style={subtleLabelStyle}>
              {copy.ownerLabels.cutover}:{" "}
              {resolveOwnerName(
                ownerMap,
                tenant.rollout.cutoverOwner,
                copy.ownerLabels.none,
              )}
            </span>
            <span style={subtleLabelStyle}>
              {copy.ownerLabels.rollback}:{" "}
              {resolveOwnerName(
                ownerMap,
                tenant.rollout.rollbackOwner,
                copy.ownerLabels.none,
              )}
            </span>
          </div>
        ),
      },
      {
        h: copy.table.modules,
        w: 160,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span style={monoStyle}>
              {tenant.enabledModules.length}/{PLATFORM_TENANT_MODULES.length}
            </span>
            <span style={subtleLabelStyle}>
              {tenant.enabledModules
                .map(
                  (moduleCode) =>
                    moduleLabels[moduleCode as PlatformTenantModule] ||
                    moduleCode,
                )
                .join(" · ")}
            </span>
          </div>
        ),
      },
      {
        h: copy.table.integration,
        w: 170,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span>
              {formatPlatformCodeLabel(locale, tenant.integrationPackage.mode)}
            </span>
            <span style={monoStyle}>
              {truncate(
                tenant.integrationPackage.productionBaseUrl ??
                  tenant.integrationPackage.sandboxBaseUrl ??
                  "—",
                26,
              )}
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
            <Link
              href={`/tenants/${tenant.id}`}
              style={{ color: theme.accent }}
            >
              /tenants/{tenant.id}
            </Link>
          </div>
        ),
      },
      {
        h: copy.table.actions,
        w: 250,
        r: (tenant) => {
          const rowActions = tenant.availableActions ?? [];
          const deepLinks = resolveTenantLinks(tenant);

          return (
            <div style={actionWrapStyle}>
              <div style={actionRowStyle}>
                {deepLinks.map((link) => (
                  <Link
                    key={`${link.targetApp}:${link.resourceId}:${link.route}`}
                    href={buildCrossAppHref(link)}
                    target={link.openMode === "new_tab" ? "_blank" : undefined}
                    rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
                    style={{
                      color: theme.accent,
                      textDecoration: "none",
                      fontSize: 11.5,
                      fontWeight: 600,
                    }}
                  >
                    {copy.actionLabels[
                      link.label as keyof typeof copy.actionLabels
                    ] ?? link.label}
                  </Link>
                ))}
              </div>
              {rowActions.length > 0 ? (
                <div style={actionRowStyle}>
                  {rowActions.map((action) => (
                    <button
                      key={action.action}
                      type="button"
                      onClick={() => void executeTenantAction(tenant, action)}
                      disabled={!action.enabled}
                      title={action.disabledReasonCode}
                      style={{
                        borderRadius: 999,
                        border: `1px solid ${
                          toneFromRiskLevel(action.riskLevel) === "danger"
                            ? theme.dangerBorder
                            : toneFromRiskLevel(action.riskLevel) === "warn"
                              ? theme.warnBorder
                              : theme.accentBorder
                        }`,
                        background:
                          toneFromRiskLevel(action.riskLevel) === "danger"
                            ? theme.dangerBg
                            : toneFromRiskLevel(action.riskLevel) === "warn"
                              ? theme.warnBg
                              : theme.accentBg,
                        color:
                          toneFromRiskLevel(action.riskLevel) === "danger"
                            ? theme.danger
                            : toneFromRiskLevel(action.riskLevel) === "warn"
                              ? theme.warn
                              : theme.accent,
                        padding: "4px 8px",
                        fontSize: 11.5,
                        cursor: action.enabled ? "pointer" : "not-allowed",
                        opacity: action.enabled ? 1 : 0.45,
                      }}
                    >
                      {resolveActionLabel(action)}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={readOnlyHintStyle}>
                  <CanvasPill theme={theme} tone="neutral">
                    {locale === "en" ? "Read-only" : "唯讀"}
                  </CanvasPill>
                  <span style={subtleLabelStyle}>
                    {locale === "en"
                      ? "No row actions were granted for this tenant."
                      : "backend 沒有為此租戶提供可執行動作。"}
                  </span>
                </div>
              )}
            </div>
          );
        },
      },
    ],
    [
      copy.actionLabels,
      copy.ownerLabels.cutover,
      copy.ownerLabels.none,
      copy.ownerLabels.rollback,
      copy.table.actions,
      copy.table.activity,
      copy.table.gate,
      copy.table.integration,
      copy.table.modules,
      copy.table.owners,
      copy.table.stage,
      copy.table.tenant,
      executeTenantAction,
      locale,
      moduleLabels,
      ownerMap,
      resolveActionLabel,
    ],
  );

  const tabNodes = useMemo(
    () => [
      <span key="all">
        {copy.tabs.all} · {formatLocaleNumber(locale, stageCounts.all)}
      </span>,
      <span key="production">
        {copy.tabs.production} ·{" "}
        {formatLocaleNumber(locale, stageCounts.production)}
      </span>,
      <span key="pilot">
        {copy.tabs.pilot} · {formatLocaleNumber(locale, stageCounts.pilot)}
      </span>,
      <span key="sandbox">
        {copy.tabs.sandbox} · {formatLocaleNumber(locale, stageCounts.sandbox)}
      </span>,
      <span key="hold">
        {copy.tabs.hold} · {formatLocaleNumber(locale, stageCounts.hold)}
      </span>,
    ],
    [copy.tabs, locale, stageCounts],
  );

  const activeTabNode = useMemo(() => {
    switch (stageFilter) {
      case "production":
        return tabNodes[1];
      case "pilot":
        return tabNodes[2];
      case "sandbox":
        return tabNodes[3];
      case "hold":
        return tabNodes[4];
      case "all":
      default:
        return tabNodes[0];
    }
  }, [stageFilter, tabNodes]);

  if (loading && !loadState) {
    return (
      <div
        style={{
          padding: 28,
          color: theme.textMuted,
          fontFamily: theme.fontFamily,
          textAlign: "center",
        }}
      >
        {locale === "en" ? "Loading tenants..." : "租戶載入中..."}
      </div>
    );
  }

  return (
    <CanvasShell
      theme={theme}
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
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              onClick={() => void loadTenants({ silent: true })}
              disabled={refreshing}
            >
              {refreshing
                ? locale === "en"
                  ? "Refreshing..."
                  : "重新整理中..."
                : copy.actionLabels.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              icon="export"
              onClick={exportVisibleRows}
              disabled={filteredTenants.length === 0}
            >
              {copy.export}
            </CanvasBtn>
            {pageActions.map((action) => (
              <CanvasBtn
                key={action.action}
                theme={theme}
                variant={isCreateTenantAction(action) ? "primary" : "secondary"}
                onClick={() => void handlePageAction(action)}
                disabled={!action.enabled}
              >
                {resolveActionLabel(action)}
              </CanvasBtn>
            ))}
          </>
        }
      />

      <div style={pageStackStyle}>
        {receipt ? (
          <div style={toastViewportStyle}>
            <div style={toastCardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <span style={{ color: theme.success, fontWeight: 700 }}>
                    {copy.receiptTitle}
                  </span>
                  <span style={{ color: theme.text }}>{receipt.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: theme.textMuted,
                    cursor: "pointer",
                    fontFamily: theme.fontFamily,
                    fontSize: 12,
                  }}
                >
                  {copy.receiptDismiss}
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {receipt.auditId ? (
                  <Link
                    href={resolveAuditHref(receipt.auditId)}
                    style={{
                      color: theme.accent,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    {copy.receiptOpenAudit}
                  </Link>
                ) : null}
                <span style={monoStyle}>
                  {copy.requestId}: {truncate(receipt.requestId, 18)}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div style={utilityRowStyle}>
          <div style={utilityClusterStyle}>
            <CanvasPill theme={theme} tone="neutral">
              {copy.refreshTier}
            </CanvasPill>
            <CanvasPill
              theme={theme}
              tone={readyGateCount > 0 ? "accent" : "neutral"}
            >
              {copy.readyGate} {formatLocaleNumber(locale, readyGateCount)}
            </CanvasPill>
            {freshness ? (
              <CanvasPill
                theme={theme}
                tone={freshness.dataFreshness === "stale" ? "warn" : "neutral"}
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
          {loadState?.requestId ? (
            <span style={monoStyle}>
              {copy.requestId}: {truncate(loadState.requestId, 18)}
            </span>
          ) : null}
        </div>

        <div style={toolbarStyle}>
          <div style={searchRowStyle}>
            <div style={searchWrapStyle}>
              <CanvasIcon name="search" size={14} style={searchIconStyle} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={copy.searchPlaceholder}
                style={searchInputStyle}
              />
            </div>
            <CanvasPill theme={theme} tone="neutral">
              {copy.searchSummary(filteredTenants.length)}
            </CanvasPill>
            {freshness ? (
              <CanvasPill theme={theme} tone="neutral">
                {copy.freshnessAt} · {formatDateTime(freshness.generatedAt)}
              </CanvasPill>
            ) : null}
          </div>

          <div style={filterRowStyle}>
            <span style={subtleLabelStyle}>{copy.filters.stage}</span>
            {(
              [
                ["all", copy.filters.allStages, stageCounts.all],
                ["production", copy.tabs.production, stageCounts.production],
                ["pilot", copy.tabs.pilot, stageCounts.pilot],
                ["sandbox", copy.tabs.sandbox, stageCounts.sandbox],
                ["hold", copy.tabs.hold, stageCounts.hold],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStageFilter(value)}
                style={filterButtonStyle}
              >
                <CanvasPill
                  theme={theme}
                  tone={stageFilter === value ? "accent" : "neutral"}
                  dot={value !== "all"}
                >
                  {label} {formatLocaleNumber(locale, count)}
                </CanvasPill>
              </button>
            ))}
          </div>

          <div style={filterRowStyle}>
            <span style={subtleLabelStyle}>{copy.filters.status}</span>
            {(
              [
                ["all", copy.filters.allStatuses, statusCounts.all],
                ["draft", "draft", statusCounts.draft],
                ["active", "active", statusCounts.active],
                ["paused", "paused", statusCounts.paused],
                ["rollback_hold", "rollback_hold", statusCounts.rollback_hold],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                style={filterButtonStyle}
              >
                <CanvasPill
                  theme={theme}
                  tone={
                    statusFilter === value
                      ? value === "all"
                        ? "accent"
                        : statusTone(value)
                      : "neutral"
                  }
                  dot={value !== "all"}
                >
                  {label} {formatLocaleNumber(locale, count)}
                </CanvasPill>
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy.loadErrorTitle}
            body={`${copy.loadErrorBody} ${error}`}
          />
        ) : null}

        {rollbackHoldCount > 0 ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title={copy.rollbackBannerTitle}
            body={copy.rollbackBannerBody(rollbackHoldCount)}
          />
        ) : null}

        {showCreate ? (
          <CanvasCard
            theme={theme}
            title={copy.createTitle}
            subtitle={copy.createSubtitle}
          >
            <form onSubmit={(event) => void handleCreate(event)}>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={formGridStyle}>
                  <CanvasField theme={theme} label="Name" required>
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
                      style={inputStyle()}
                    />
                  </CanvasField>
                  <CanvasField theme={theme} label="Code" required>
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
                      style={inputStyle(true)}
                    />
                  </CanvasField>
                  <CanvasField theme={theme} label="Status">
                    <select
                      value={createForm.status}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          status: event.target.value as "active" | "inactive",
                        }))
                      }
                      style={inputStyle()}
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </CanvasField>
                  <CanvasField theme={theme} label="Integration mode">
                    <select
                      value={createForm.integrationMode}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          integrationMode: event.target
                            .value as PlatformTenantIntegrationMode,
                        }))
                      }
                      style={inputStyle()}
                    >
                      {PLATFORM_TENANT_INTEGRATION_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {formatPlatformCodeLabel(locale, mode)}
                        </option>
                      ))}
                    </select>
                  </CanvasField>
                  <CanvasField theme={theme} label="Bootstrap admin email">
                    <input
                      value={createForm.bootstrapAdminEmail}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          bootstrapAdminEmail: event.target.value,
                        }))
                      }
                      placeholder="admin@acme.example"
                      style={inputStyle()}
                    />
                  </CanvasField>
                  <CanvasField theme={theme} label="Sandbox base URL">
                    <input
                      value={createForm.sandboxBaseUrl}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          sandboxBaseUrl: event.target.value,
                        }))
                      }
                      placeholder="https://sandbox.acme.example"
                      style={inputStyle(true)}
                    />
                  </CanvasField>
                  <CanvasField theme={theme} label="Active drivers">
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
                      style={inputStyle(true)}
                    />
                  </CanvasField>
                  <CanvasField theme={theme} label="Monthly bookings">
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
                      style={inputStyle(true)}
                    />
                  </CanvasField>
                  <CanvasField theme={theme} label="Monthly API calls">
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
                      style={inputStyle(true)}
                    />
                  </CanvasField>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <span style={subtleLabelStyle}>Enabled modules</span>
                  <div style={moduleGridStyle}>
                    {PLATFORM_TENANT_MODULES.map((moduleCode) => {
                      const enabled =
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
                              enabled ? theme.accentBorder : theme.border
                            }`,
                            background: enabled
                              ? theme.accentBg
                              : theme.surfaceLo,
                            color: theme.text,
                            cursor: "pointer",
                          }}
                        >
                          <CanvasPill
                            theme={theme}
                            tone={enabled ? "accent" : "neutral"}
                          >
                            {moduleLabels[moduleCode as PlatformTenantModule] ||
                              moduleCode}
                          </CanvasPill>
                          <span style={subtleLabelStyle}>
                            {enabled
                              ? copy.moduleState.enabled
                              : copy.moduleState.disabled}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={utilityClusterStyle}>
                  <CanvasBtn
                    theme={theme}
                    variant="secondary"
                    onClick={() => setShowCreate(false)}
                  >
                    {locale === "en" ? "Cancel" : "取消"}
                  </CanvasBtn>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    disabled={
                      !createForm.name.trim() ||
                      !createForm.code.trim() ||
                      creating
                    }
                  >
                    {creating
                      ? locale === "en"
                        ? "Creating..."
                        : "建立中..."
                      : copy.createTitle}
                  </CanvasBtn>
                </div>
              </div>
            </form>
          </CanvasCard>
        ) : null}

        <CanvasCard theme={theme} padding={0}>
          {filteredTenants.length > 0 ? (
            <CanvasTable<TenantRow>
              theme={theme}
              columns={columns}
              rows={filteredTenants as TenantRow[]}
            />
          ) : (
            <div style={emptyStateStyle}>
              <CanvasIcon name={emptyVisual.icon} size={24} />
              <CanvasPill theme={theme} tone={emptyVisual.tone}>
                {emptyVisual.badge}
              </CanvasPill>
              <div style={{ color: theme.text, fontWeight: 600 }}>
                {emptyVisual.title}
              </div>
              <div style={{ maxWidth: 460 }}>{emptyVisual.body}</div>
              {emptyVisual.hint ? (
                <div style={{ maxWidth: 520, ...subtleLabelStyle }}>
                  {emptyVisual.hint}
                </div>
              ) : null}
              {emptyNextAction ? (
                <CanvasBtn
                  theme={theme}
                  variant={emptyNextAction.enabled ? "primary" : "secondary"}
                  onClick={() => void handlePageAction(emptyNextAction)}
                  disabled={!emptyNextAction.enabled}
                >
                  {resolveActionLabel(emptyNextAction)}
                </CanvasBtn>
              ) : null}
              {!emptyNextAction &&
              emptyReason === "no_data" &&
              createTenantAction ? (
                <CanvasBtn
                  theme={theme}
                  variant={createTenantAction.enabled ? "primary" : "secondary"}
                  icon="plus"
                  onClick={() => void handlePageAction(createTenantAction)}
                  disabled={!createTenantAction.enabled}
                >
                  {resolveActionLabel(createTenantAction)}
                </CanvasBtn>
              ) : null}
              {emptyReason === "filtered_empty" ? (
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => {
                    setSearchTerm("");
                    setStageFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  {copy.clearFilters}
                </CanvasBtn>
              ) : null}
            </div>
          )}
        </CanvasCard>
      </div>
      {confirmIntent ? (
        <div style={modalViewportStyle}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-action-confirm-title"
            style={modalCardStyle}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <span
                id="tenant-action-confirm-title"
                style={{ color: theme.text, fontSize: 18, fontWeight: 700 }}
              >
                {copy.confirmTitle}
              </span>
              <span style={{ color: theme.textMuted, lineHeight: 1.5 }}>
                {confirmBodyText}
              </span>
            </div>
            {confirmIntent.action.requiresReason ||
            confirmIntent.action.riskLevel === "high" ? (
              <CanvasField
                theme={theme}
                label={copy.confirmReasonLabel}
                required
              >
                <textarea
                  value={confirmReason}
                  onChange={(event) => setConfirmReason(event.target.value)}
                  placeholder={copy.confirmReasonPlaceholder}
                  style={{
                    ...inputStyle(),
                    minHeight: 92,
                    resize: "vertical",
                  }}
                />
              </CanvasField>
            ) : null}
            <div style={modalFooterStyle}>
              <CanvasBtn
                theme={theme}
                variant="secondary"
                onClick={() => {
                  setConfirmIntent(null);
                  setConfirmReason("");
                }}
              >
                {copy.confirmCancel}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => void submitConfirmedIntent()}
                disabled={
                  creating ||
                  refreshing ||
                  ((confirmIntent.action.requiresReason ||
                    confirmIntent.action.riskLevel === "high") &&
                    !confirmReason.trim())
                }
              >
                {copy.confirmSubmit}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </CanvasShell>
  );
}
