"use client";

import Link from "next/link";
import React, {
  startTransition,
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
  parseQuota,
  toggleTenantModule,
  type TenantFormState,
} from "@/components/tenant-governance-shared";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  CreatePlatformTenantCommand,
  EmptyReason,
  EmptyStateEnvelope,
  PlatformAdminTenantRecord,
  PlatformAdminTenantListItem,
  PlatformAdminTenantListResponse,
  PlatformTenantLifecycleActionCommand,
  RefreshTier,
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
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type TenantStatusFilter = "all" | PlatformAdminTenantRecord["status"];
type TenantStageFilter =
  | "all"
  | PlatformAdminTenantRecord["rollout"]["stage"]
  | "rollback_hold";
type = Extract<
  UiRefreshMetadata["dataFreshness"],
  "fresh" | "stale" | "degraded"
>;
type TenantListItem = PlatformAdminTenantListItem;

type TenantTableRow = TenantListItem & Record<string, unknown>;

type NormalizedTenantList = {
  items: TenantListItem[];
  emptyState?: EmptyStateEnvelope;
  availableActions: ResourceActionDescriptor[];
  refresh: UiRefreshMetadata | null;
  refreshTier: RefreshTier;
};

const DEFAULT_CREATE_ACTION: ResourceActionDescriptor = {
  action: "create",
  enabled: true,
  riskLevel: "medium",
};

const th = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const T4_REFRESH_MS = 30_000;
const OPS_CONSOLE_ORIGIN =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ??
  process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN ??
  "";

const pageRootStyle: CSSProperties = {
  minHeight: "100%",
  background: th.bg,
  color: th.text,
  borderRadius: 12,
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

const toolbarCardStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const searchRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1.4fr) repeat(2, minmax(180px, 0.7fr))",
  gap: 12,
};

const filterButtonStyle: CSSProperties = {
  border: 0,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const monoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
};

const stackedCellStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const tenantLinkStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  textDecoration: "none",
  color: th.text,
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
  lineHeight: 1.45,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const actionPillButtonStyle = (
  tone: CanvasTone,
  disabled: boolean,
): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 24,
  padding: "3px 8px",
  borderRadius: 999,
  border: `1px solid ${
    tone === "danger"
      ? th.dangerBorder
      : tone === "warn"
        ? th.warnBorder
        : tone === "accent"
          ? th.accentBorder
          : th.border
  }`,
  background:
    tone === "danger"
      ? th.dangerBg
      : tone === "warn"
        ? th.warnBg
        : tone === "accent"
          ? th.accentBg
          : th.surfaceLo,
  color:
    tone === "danger"
      ? th.danger
      : tone === "warn"
        ? th.warn
        : tone === "accent"
          ? th.accent
          : th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.1,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  textDecoration: "none",
});

const emptyStateWrapStyle: CSSProperties = {
  padding: 28,
  display: "grid",
  gap: 10,
  justifyItems: "start",
};

const loadingStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontFamily: th.fontFamily,
  background: th.bg,
  borderRadius: 12,
};

const createPanelStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const createGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const moduleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

function normalizeTenantListResponse(
  payload:
    | PlatformAdminTenantListResponse
    | TenantListItem[]
    | null
    | undefined,
): NormalizedTenantList {
  if (Array.isArray(payload)) {
    const refresh: UiRefreshMetadata = {
      generatedAt: new Date().toISOString(),
      staleAfterMs: T4_REFRESH_MS,
      dataFreshness: "fresh",
      source: "live",
    };
    return {
      items: payload,
      availableActions: [DEFAULT_CREATE_ACTION],
      ...(payload.length === 0
        ? {
            emptyState: {
              reason: "no_data" as const,
              messageCode: "platformAdmin.tenants.empty.no_data",
            },
          }
        : {}),
      refresh,
      refreshTier: "medium_slow",
    };
  }

  const items = payload?.items ?? [];
  const emptyState: EmptyStateEnvelope | undefined =
    payload?.emptyState ??
    (items.length === 0
      ? {
          reason: "no_data",
          messageCode: "platformAdmin.tenants.empty.no_data",
        }
      : undefined);
  const availableActions =
    payload?.availableActions && payload.availableActions.length > 0
      ? payload.availableActions
      : [DEFAULT_CREATE_ACTION];
  if (emptyState) {
    return {
      items,
      availableActions,
      emptyState,
      refresh: payload?.refresh ?? null,
      refreshTier: payload?.refreshTier ?? "medium_slow",
    };
  }
  return {
    items,
    availableActions,
    refresh: payload?.refresh ?? null,
    refreshTier: payload?.refreshTier ?? "medium_slow",
  };
}

function formatLocaleNumber(locale: string, value: number) {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function getCurrentGateStatus(
  tenant: PlatformAdminTenantRecord,
): "pending" | "ready" | "approved" | "blocked" {
  if (tenant.status === "rollback_hold") {
    return "blocked";
  }

  switch (tenant.rollout.stage) {
    case "sandbox":
      return tenant.rollout.sandboxStatus;
    case "pilot":
      return tenant.rollout.pilotStatus;
    case "production":
      return tenant.rollout.productionStatus;
    default:
      return "pending";
  }
}

function gateTone(status: ReturnType<typeof getCurrentGateStatus>): CanvasTone {
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

function stageTone(
  stage: PlatformAdminTenantRecord["rollout"]["stage"] | "rollback_hold",
): CanvasTone {
  switch (stage) {
    case "production":
      return "success";
    case "pilot":
      return "accent";
    case "sandbox":
      return "warn";
    default:
      return "danger";
  }
}

function getTenantStageDisplay(
  tenant: PlatformAdminTenantRecord,
): PlatformAdminTenantRecord["rollout"]["stage"] | "rollback_hold" {
  return tenant.status === "rollback_hold"
    ? "rollback_hold"
    : tenant.rollout.stage;
}

function statusTone(status: PlatformAdminTenantRecord["status"]): CanvasTone {
  switch (status) {
    case "active":
      return "success";
    case "draft":
      return "warn";
    case "rollback_hold":
      return "danger";
    case "paused":
    default:
      return "neutral";
  }
}

function actionTone(action: ResourceActionDescriptor): CanvasTone {
  if (!action.enabled || action.riskLevel === "high") {
    return "danger";
  }
  if (action.riskLevel === "medium") {
    return "warn";
  }
  return "accent";
}

function getActionLabel(locale: string, action: string) {
  const labels: Record<string, { zh: string; en: string }> = {
    create: { zh: "建立租戶", en: "Create tenant" },
    activate: { zh: "啟用", en: "Activate" },
    suspend: { zh: "暫停", en: "Suspend" },
    rollback_hold: { zh: "進入 rollback_hold", en: "Enter rollback hold" },
    open_ops_view: { zh: "營運視圖", en: "Ops view" },
  };
  const match = labels[action];
  if (match) {
    return locale === "en" ? match.en : match.zh;
  }
  return action.replace(/_/g, " ");
}

function getReasonCommand(
  reason: string | null,
): PlatformTenantLifecycleActionCommand | undefined {
  const trimmed = reason?.trim();
  return trimmed ? { reason: trimmed } : undefined;
}

function getTenantStageValue(
  tenant: PlatformAdminTenantRecord,
): TenantStageValue {
  return tenant.status === "rollback_hold"
    ? "rollback_hold"
    : tenant.rollout.stage;
}

function getStageTone(stage: TenantStageValue): CanvasTone {
  if (stage === "rollback_hold") {
    return "danger";
  }
  return toCanvasTone(tenantStageTone(stage));
}

function formatQuotaSummary(locale: string, tenant: PlatformAdminTenantRecord) {
  return `${formatLocaleNumber(locale, tenant.quotas.monthlyBookings)}/mo`;
}

function getIntegrationSummary(tenant: PlatformAdminTenantRecord) {
  switch (tenant.integrationPackage.mode) {
    case "api_key":
      return "api";
    case "api_key_and_webhook":
      return "api+webhook";
    case "partner_managed":
      return "partner";
    case "none":
    default:
      return "none";
  }
}

function formatShortDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function getOpsHref(tenant: TenantListItem) {
  if (tenant.operationalViewLink?.route) {
    if (/^https?:\/\//.test(tenant.operationalViewLink.route)) {
      return tenant.operationalViewLink.route;
    }
    if (OPS_CONSOLE_ORIGIN) {
      return `${OPS_CONSOLE_ORIGIN.replace(/\/$/, "")}${tenant.operationalViewLink.route}`;
    }
  }

  if (!OPS_CONSOLE_ORIGIN) {
    return null;
  }

  const url = new URL("/dispatch", OPS_CONSOLE_ORIGIN);
  url.searchParams.set("tenantId", tenant.id);
  return url.toString();
}

function getRefreshTierDisplay(refreshTier: RefreshTier) {
  return refreshTier === "medium_slow" ? "T4" : refreshTier;
}

function getEmptyStateCopy(locale: string, reason: EmptyReason, count: number) {
  const copy: Record<
    EmptyReason,
    { tone: CanvasTone; title: string; body: string }
  > = {
    no_data: {
      tone: "neutral" as CanvasTone,
      title: locale === "en" ? "No tenants yet" : "尚無租戶",
      body:
        locale === "en"
          ? "Create the first tenant bootstrap record to start the rollout workspace."
          : "先建立第一筆 tenant bootstrap record，才會開始 rollout 治理流程。",
    },
    not_provisioned: {
      tone: "warn" as CanvasTone,
      title:
        locale === "en"
          ? "Tenant governance is not provisioned"
          : "租戶治理尚未完成 provision",
      body:
        locale === "en"
          ? "This environment is missing tenant-governance bootstrap data."
          : "目前環境尚未具備 tenant-governance bootstrap 資料。",
    },
    fetch_failed: {
      tone: "danger" as CanvasTone,
      title:
        locale === "en" ? "Unable to fetch tenant roster" : "無法取得租戶清單",
      body:
        locale === "en"
          ? "The control-plane request failed before any tenant data could be rendered."
          : "control-plane 請求失敗，目前無法渲染任何租戶資料。",
    },
    permission_denied: {
      tone: "danger" as CanvasTone,
      title: locale === "en" ? "Access is limited" : "目前沒有權限",
      body:
        locale === "en"
          ? "The current actor can view the route chrome but cannot read tenant data."
          : "目前 actor 可以看見頁面框架，但沒有 tenant data 讀取權限。",
    },
    external_unavailable: {
      tone: "warn" as CanvasTone,
      title:
        locale === "en"
          ? "External dependency is unavailable"
          : "外部依賴暫時不可用",
      body:
        locale === "en"
          ? "Tenant lifecycle data is partially blocked by a downstream dependency."
          : "租戶生命週期資料受到下游依賴影響，暫時無法完整載入。",
    },
    filtered_empty: {
      tone: "accent" as CanvasTone,
      title:
        locale === "en"
          ? "No tenants match the current filters"
          : "目前篩選條件沒有結果",
      body:
        locale === "en"
          ? `The current query and governance filters exclude all ${count} tenant records.`
          : `目前查詢與治理篩選排除了全部 ${count} 筆 tenant record。`,
    },
    driver_not_eligible: {
      tone: "warn" as CanvasTone,
      title:
        locale === "en"
          ? "Current actor is not eligible for this roster"
          : "目前 actor 不符合這份清單的資格",
      body:
        locale === "en"
          ? "This reason belongs to driver workflows and should not normally appear on platform admin."
          : "這個理由屬於 driver workflow，正常情況下不應出現在 platform admin。",
    },
  };

  return copy[reason];
}

function getFilterTone(active: boolean, stage: TenantStageFilter): CanvasTone {
  if (!active) {
    return stage === "rollback_hold" ? "danger" : "neutral";
  }
  return stage === "rollback_hold" ? "danger" : "accent";
}

export default function TenantsPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const lastSuccessAtRef = useRef<number | null>(null);
  const [tenantList, setTenantList] = useState<NormalizedTenantList>({
    items: [],
    availableActions: [],
    refresh: null,
    refreshTier: "medium_slow",
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<TenantStageFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] =
    useState<TenantFormState>(EMPTY_TENANT_FORM);
  const [mutatingTenantId, setMutatingTenantId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const copy =
    locale === "en"
      ? {
          title: "Tenants",
          subtitle:
            "Manage tenant lifecycle, rollout gate posture, and cross-app operational handoff from a single roster.",
          refresh: "Refresh",
          refreshing: "Refreshing...",
          export: "Export",
          filterBadge: "T4 admin medium-slow · 30s",
          searchLabel: "Search by tenant name or code",
          searchPlaceholder: "Search tenant or code",
          stageLabel: "Rollout stage",
          statusLabel: "Tenant status",
          freshnessFresh: "fresh",
          freshnessStale: "stale",
          freshnessDegraded: "degraded",
          lastChecked: "Last checked",
          rollbackTitle: "Rollback hold needs triage",
          rollbackBanner: (count: number) =>
            `${count} tenant(s) are currently in rollback hold and should be reviewed before new promotion work.`,
          loadErrorTitle: "Unable to refresh tenant governance",
          columns: {
            tenant: "TENANT",
            stage: "STAGE",
            gate: "GATE",
            modules: "MODULES",
            owners: "OWNERS",
            integration: "INTEGRATION",
            activity: "LAST ACTIVITY",
            actions: "ACTIONS",
          },
          filters: {
            all: "All",
            sandbox: "sandbox",
            pilot: "pilot",
            production: "production",
            rollback_hold: "rollback_hold",
          },
          statuses: {
            all: "All statuses",
            draft: "Draft",
            active: "Active",
            paused: "Paused",
            rollback_hold: "Rollback hold",
          },
          openWorkspace: "Open workspace",
          openOps: "Ops view",
          noOwners: "cutover / rollback owner not assigned",
          createTitle: "Create tenant",
          createSubtitle:
            "Bootstrap tenant identity, quotas, module footprint, and sandbox posture before any rollout promotion.",
          createSubmit: "Create tenant",
          createSubmitting: "Creating...",
          actionFailed: "Unable to complete tenant action",
        }
      : {
          title: "租戶",
          subtitle:
            "集中治理 tenant lifecycle、rollout gate 狀態，以及跨 app 的營運交接視圖。",
          refresh: "重新整理",
          refreshing: "重新整理中...",
          export: "匯出",
          filterBadge: "T4 admin medium-slow · 30s",
          searchLabel: "依租戶名稱或代碼搜尋",
          searchPlaceholder: "搜尋 tenant 或 code",
          stageLabel: "Rollout stage",
          statusLabel: "租戶狀態",
          freshnessFresh: "fresh",
          freshnessStale: "stale",
          freshnessDegraded: "degraded",
          lastChecked: "上次檢查",
          rollbackTitle: "Rollback hold 需要優先分流",
          rollbackBanner: (count: number) =>
            `${count} 個租戶目前處於 rollback hold，推進新 promotion 前應先完成治理判讀。`,
          loadErrorTitle: "無法重新整理租戶治理資料",
          columns: {
            tenant: "TENANT",
            stage: "STAGE",
            gate: "GATE",
            modules: "MODULES",
            owners: "OWNERS",
            integration: "介接",
            activity: "LAST ACTIVITY",
            actions: "ACTIONS",
          },
          filters: {
            all: "全部",
            sandbox: "sandbox",
            pilot: "pilot",
            production: "production",
            rollback_hold: "rollback_hold",
          },
          statuses: {
            all: "全部狀態",
            draft: "Draft",
            active: "Active",
            paused: "Paused",
            rollback_hold: "Rollback hold",
          },
          openWorkspace: "開啟工作區",
          openOps: "營運視圖",
          noOwners: "尚未指定 cutover / rollback owner",
          createTitle: "建立租戶",
          createSubtitle:
            "在任何 rollout promotion 前，先建立 tenant identity、配額、模組範圍與 sandbox posture。",
          createSubmit: "建立租戶",
          createSubmitting: "建立中...",
          actionFailed: "無法完成租戶動作",
        };

  const moduleLabels = useMemo(
    () =>
      Object.fromEntries(
        PLATFORM_TENANT_MODULES.map((moduleCode) => [
          moduleCode,
          formatPlatformCodeLabel(locale, moduleCode),
        ]),
      ) as Record<(typeof PLATFORM_TENANT_MODULES)[number], string>,
    [locale],
  );

  const loadTenants = useCallback(
    async (mode: "initial" | "manual" | "interval") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const result = await client.getPlatformTenantList();
        const normalized = normalizeTenantListResponse(result);
        setTenantList(normalized);
        setError(null);
        lastSuccessAtRef.current = Date.now();
      } catch (fetchError) {
        const message =
          fetchError instanceof Error ? fetchError.message : String(fetchError);
        setError(message);
        if (lastSuccessAtRef.current) {
          const ageMs = Date.now() - lastSuccessAtRef.current;
          startTransition(() => {
            setTenantList((current) => ({
              ...current,
              refresh: current.refresh
                ? {
                    ...current.refresh,
                    dataFreshness:
                      ageMs > T4_REFRESH_MS * 2 ? "degraded" : "stale",
                  }
                : null,
            }));
          });
        } else {
          setTenantList({
            items: [],
            availableActions: [
              { action: "create", enabled: true, riskLevel: "medium" },
            ],
            emptyState: {
              reason: "fetch_failed",
              messageCode: "platformAdmin.tenants.empty.fetch_failed",
            },
            refresh: null,
            refreshTier: "medium_slow",
          });
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    let active = true;
    const run = async (mode: "initial" | "manual" | "interval") => {
      if (!active) {
        return;
      }
      await loadTenants(mode);
    };

    void run("initial");
    const intervalId = window.setInterval(() => {
      void run("interval");
    }, T4_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loadTenants]);

  const handleTenantAction = useCallback(
    async (tenant: TenantListItem, action: ResourceActionDescriptor) => {
      if (!action.enabled) {
        return;
      }

      if (action.action === "open_ops_view") {
        const opsHref = getOpsHref(tenant);
        if (opsHref) {
          window.open(opsHref, "_blank", "noopener,noreferrer");
        }
        return;
      }

      if (action.riskLevel !== "low") {
        const confirmed = window.confirm(
          locale === "en"
            ? `Run "${getActionLabel(locale, action.action)}" for ${tenant.name}?`
            : `要對 ${tenant.name} 執行「${getActionLabel(locale, action.action)}」嗎？`,
        );
        if (!confirmed) {
          return;
        }
      }

      let lifecycleCommand: PlatformTenantLifecycleActionCommand | undefined;
      if (action.requiresReason) {
        const reason = window.prompt(
          locale === "en"
            ? "Reason is required for this action."
            : "此動作需要輸入原因。",
        );
        lifecycleCommand = getReasonCommand(reason);
        if (!lifecycleCommand) {
          return;
        }
      }

      setMutatingTenantId(tenant.id);
      setError(null);
      try {
        if (action.action === "activate") {
          await client.activateTenant(tenant.id, lifecycleCommand);
        } else if (action.action === "suspend") {
          await client.suspendTenant(tenant.id, lifecycleCommand);
        } else if (action.action === "rollback_hold") {
          await client.rollbackHoldTenant(tenant.id, lifecycleCommand);
        } else {
          return;
        }
        await loadTenants("manual");
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? `${copy.actionFailed}: ${actionError.message}`
            : copy.actionFailed,
        );
      } finally {
        setMutatingTenantId(null);
      }
    },
    [client, copy.actionFailed, loadTenants, locale],
  );

  const handleEmptyStateAction = useCallback(
    async (action: ResourceActionDescriptor) => {
      if (!action.enabled) {
        return;
      }

      if (action.action === "create") {
        setShowCreate(true);
        return;
      }

      if (action.action === "open_ops_view" && OPS_CONSOLE_ORIGIN) {
        window.open(
          new URL("/dispatch", OPS_CONSOLE_ORIGIN).toString(),
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }

      await loadTenants("manual");
    },
    [loadTenants],
  );

  const handleCreate = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setCreating(true);
      setError(null);
      try {
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
        await client.createPlatformTenant(command);
        setCreateForm(EMPTY_TENANT_FORM);
        setShowCreate(false);
        await loadTenants("manual");
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : String(createError),
        );
      } finally {
        setCreating(false);
      }
    },
    [client, createForm, loadTenants],
  );

  const counts = useMemo(
    () => ({
      all: tenantList.items.length,
      sandbox: tenantList.items.filter(
        (tenant) => tenant.rollout.stage === "sandbox",
      ).length,
      pilot: tenantList.items.filter(
        (tenant) => tenant.rollout.stage === "pilot",
      ).length,
      production: tenantList.items.filter(
        (tenant) => tenant.rollout.stage === "production",
      ).length,
      rollback_hold: tenantList.items.filter(
        (tenant) => tenant.status === "rollback_hold",
      ).length,
    }),
    [tenantList.items],
  );

  const visibleTenants = useMemo(() => {
    return tenantList.items
      .filter((tenant) =>
        stageFilter === "all"
          ? true
          : getTenantStageDisplay(tenant) === stageFilter,
      )
      .filter((tenant) =>
        statusFilter === "all" ? true : tenant.status === statusFilter,
      )
      .filter((tenant) => {
        if (!deferredSearch) {
          return true;
        }
        const haystack =
          `${tenant.name} ${tenant.code} ${tenant.id}`.toLowerCase();
        return haystack.includes(deferredSearch);
      })
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      );
  }, [deferredSearch, stageFilter, statusFilter, tenantList.items]);

  const emptyState = useMemo(() => {
    if (visibleTenants.length > 0) {
      return undefined;
    }
    if (
      tenantList.items.length > 0 &&
      (stageFilter !== "all" ||
        statusFilter !== "all" ||
        deferredSearch.length > 0)
    ) {
      return {
        reason: "filtered_empty" as const,
        messageCode: "platformAdmin.tenants.empty.filtered_empty",
      };
    }
    return tenantList.emptyState;
  }, [
    deferredSearch.length,
    stageFilter,
    statusFilter,
    tenantList.emptyState,
    tenantList.items.length,
    visibleTenants.length,
  ]);

  const primaryCreateAction = useMemo(
    () =>
      tenantList.availableActions.find((action) => action.action === "create"),
    [tenantList.availableActions],
  );

  const columns = useMemo<CanvasTableColumn<TenantTableRow>[]>(
    () => [
      {
        h: copy.columns.tenant,
        w: 220,
        r: (tenant) => (
          <Link href={`/tenants/${tenant.id}`} style={tenantLinkStyle}>
            <span style={tenantNameStyle}>{tenant.name}</span>
            <span style={tenantMetaStyle}>
              {tenant.code} · {tenant.id}
            </span>
            <span style={secondaryTextStyle}>
              {tenant.status === "rollback_hold"
                ? locale === "en"
                  ? "rollout paused pending governance review"
                  : "rollout 已暫停，等待治理審視"
                : formatPlatformCodeLabel(locale, tenant.status)}
            </span>
          </Link>
        ),
      },
      {
        h: copy.columns.stage,
        w: 132,
        r: (tenant) => (
          <CanvasPill
            theme={th}
            tone={stageTone(getTenantStageDisplay(tenant))}
            dot
          >
            {formatPlatformCodeLabel(locale, getTenantStageDisplay(tenant))}
          </CanvasPill>
        ),
      },
      {
        h: copy.columns.gate,
        w: 126,
        r: (tenant) => {
          const gateStatus = getCurrentGateStatus(tenant);
          return (
            <div style={stackedCellStyle}>
              <CanvasPill theme={th} tone={gateTone(gateStatus)}>
                {formatPlatformCodeLabel(locale, gateStatus)}
              </CanvasPill>
              <span style={secondaryTextStyle}>
                {formatPlatformCodeLabel(locale, tenant.status)}
              </span>
            </div>
          );
        },
      },
      {
        h: copy.columns.modules,
        w: 120,
        mono: true,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span>{tenant.enabledModules.length}</span>
            <span style={{ ...secondaryTextStyle, ...monoStyle }}>
              {tenant.enabledModules
                .map((moduleCode) => moduleLabels[moduleCode])
                .join(" · ")}
            </span>
          </div>
        ),
      },
      {
        h: copy.columns.owners,
        w: 170,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            {tenant.rollout.cutoverOwner || tenant.rollout.rollbackOwner ? (
              <>
                <span style={secondaryTextStyle}>
                  cutover: {tenant.rollout.cutoverOwner ?? "—"}
                </span>
                <span style={secondaryTextStyle}>
                  rollback: {tenant.rollout.rollbackOwner ?? "—"}
                </span>
              </>
            ) : (
              <span style={secondaryTextStyle}>{copy.noOwners}</span>
            )}
          </div>
        ),
      },
      {
        h: copy.columns.integration,
        w: 190,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span>
              {formatPlatformCodeLabel(locale, tenant.integrationPackage.mode)}
            </span>
            <span style={{ ...secondaryTextStyle, ...monoStyle }}>
              {truncate(getIntegrationEndpoint(tenant), 30)}
            </span>
          </div>
        ),
      },
      {
        h: copy.columns.activity,
        w: 164,
        mono: true,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span>{formatDateTime(tenant.updatedAt)}</span>
            <span style={secondaryTextStyle}>
              {tenant.rollout.lastPromotedAt
                ? `${locale === "en" ? "last promote" : "上次 promotion"} · ${formatDateTime(
                    tenant.rollout.lastPromotedAt,
                  )}`
                : locale === "en"
                  ? "no promotion yet"
                  : "尚未 promotion"}
            </span>
          </div>
        ),
      },
      {
        h: copy.columns.actions,
        w: 216,
        r: (tenant) => {
          const opsHref = getOpsHref(tenant);
          return (
            <div style={actionRowStyle}>
              <Link
                href={`/tenants/${tenant.id}`}
                style={actionPillButtonStyle("accent", false)}
              >
                {copy.openWorkspace}
              </Link>
              {opsHref ? (
                <a
                  href={opsHref}
                  target="_blank"
                  rel="noreferrer"
                  style={actionPillButtonStyle("neutral", false)}
                >
                  {copy.openOps}
                </a>
              ) : null}
              {(tenant.availableActions ?? []).map((action) => (
                <button
                  key={`${tenant.id}-${action.action}`}
                  type="button"
                  disabled={!action.enabled || mutatingTenantId === tenant.id}
                  onClick={() => void handleTenantAction(tenant, action)}
                  title={action.disabledReasonCode}
                  style={actionPillButtonStyle(
                    actionTone(action),
                    !action.enabled || mutatingTenantId === tenant.id,
                  )}
                >
                  {getActionLabel(locale, action.action)}
                </button>
              ))}
            </div>
          );
        },
      },
    ],
    [copy, handleTenantAction, locale, moduleLabels, mutatingTenantId],
  );

  const exportVisibleTenants = () => {
    if (visibleTenants.length === 0) {
      return;
    }

    const header = [
      copy.columns.tenant,
      copy.columns.stage,
      copy.columns.gate,
      copy.columns.modules,
      copy.columns.owners,
      copy.columns.integration,
      copy.columns.activity,
    ];

    const rows = visibleTenants.map((tenant) => [
      `${tenant.name} (${tenant.code})`,
      tenant.rollout.stage,
      getCurrentGateStatus(tenant),
      tenant.enabledModules.join(" | "),
      `${tenant.rollout.cutoverOwner ?? "—"} / ${tenant.rollout.rollbackOwner ?? "—"}`,
      tenant.integrationPackage.mode,
      tenant.updatedAt,
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((value) => {
            const text = String(value);
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `platform-tenants-${stageFilter}-${statusFilter}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={loadingStateStyle}>
        {locale === "en" ? "Loading tenants..." : "載入租戶中..."}
      </div>
    );
  }

  const freshnessTone: CanvasTone =
    tenantList.refresh?.dataFreshness === "degraded"
      ? "danger"
      : tenantList.refresh?.dataFreshness === "stale"
        ? "warn"
        : "neutral";
  const effectiveEmptyState = emptyState
    ? getEmptyStateCopy(locale, emptyState.reason, tenantList.items.length)
    : null;

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
              onClick={() => void loadTenants("manual")}
            >
              {refreshing ? copy.refreshing : copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="secondary"
              icon="reports"
              onClick={exportVisibleTenants}
              disabled={loading || visibleTenants.length === 0}
            >
              {copy.exportAction}
            </CanvasBtn>
            {primaryCreateAction ? (
              <CanvasBtn
                theme={th}
                variant="primary"
                icon="plus"
                disabled={!primaryCreateAction.enabled}
                onClick={() => setShowCreate((current) => !current)}
              >
                {getActionLabel(locale, primaryCreateAction.action)}
              </CanvasBtn>
            ) : null}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasCard theme={th}>
          <div style={toolbarCardStyle}>
            <div style={filterRowStyle}>
              {(
                [
                  ["all", copy.filters.all, counts.all],
                  ["sandbox", copy.filters.sandbox, counts.sandbox],
                  ["pilot", copy.filters.pilot, counts.pilot],
                  ["production", copy.filters.production, counts.production],
                  [
                    "rollback_hold",
                    copy.filters.rollback_hold,
                    counts.rollback_hold,
                  ],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  style={filterButtonStyle}
                  onClick={() => setStageFilter(value)}
                  aria-pressed={stageFilter === value}
                >
                  <CanvasPill
                    theme={th}
                    tone={getFilterTone(stageFilter === value, value)}
                    dot={value !== "all"}
                  >
                    {label} {formatLocaleNumber(locale, count)}
                  </CanvasPill>
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <CanvasPill theme={th} tone="neutral">
                {copy.filterBadge}
              </CanvasPill>
              <CanvasPill theme={th} tone={freshnessTone}>
                {getRefreshTierDisplay(tenantList.refreshTier)} ·{" "}
                {tenantList.refresh?.dataFreshness === "fresh" ||
                !tenantList.refresh
                  ? copy.freshnessFresh
                  : tenantList.refresh.dataFreshness === "stale"
                    ? copy.freshnessStale
                    : copy.freshnessDegraded}
              </CanvasPill>
            </div>

            <div style={searchRowStyle}>
              <CanvasField theme={th} label={copy.searchLabel}>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  style={inputStyle}
                />
              </CanvasField>
              <CanvasField theme={th} label={copy.stageLabel}>
                <select
                  value={stageFilter}
                  onChange={(event) =>
                    setStageFilter(event.target.value as TenantStageFilter)
                  }
                  style={inputStyle}
                >
                  <option value="all">{copy.filters.all}</option>
                  <option value="sandbox">{copy.filters.sandbox}</option>
                  <option value="pilot">{copy.filters.pilot}</option>
                  <option value="production">{copy.filters.production}</option>
                  <option value="rollback_hold">
                    {copy.filters.rollback_hold}
                  </option>
                </select>
              </CanvasField>
              <CanvasField theme={th} label={copy.statusLabel}>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as TenantStatusFilter)
                  }
                  style={inputStyle}
                >
                  <option value="all">{copy.statuses.all}</option>
                  <option value="draft">{copy.statuses.draft}</option>
                  <option value="active">{copy.statuses.active}</option>
                  <option value="paused">{copy.statuses.paused}</option>
                  <option value="rollback_hold">
                    {copy.statuses.rollback_hold}
                  </option>
                </select>
              </CanvasField>
            </div>

            <div style={filterRowStyle}>
              <CanvasPill theme={th} tone="neutral">
                {copy.lastChecked}:{" "}
                {tenantList.refresh?.generatedAt
                  ? formatDateTime(tenantList.refresh.generatedAt)
                  : "—"}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                {formatLocaleNumber(locale, visibleTenants.length)} /{" "}
                {formatLocaleNumber(locale, tenantList.items.length)}
              </CanvasPill>
              <CanvasPill theme={th} tone={statusTone("rollback_hold")}>
                rollback_hold {formatLocaleNumber(locale, counts.rollback_hold)}
              </CanvasPill>
            </div>
          </div>
        </CanvasCard>

        {error ? (
          <CanvasBanner
            theme={th}
            tone={tenantList.items.length > 0 ? "warn" : "danger"}
            icon="warn"
            title={copy.loadErrorTitle}
            body={error}
          />
        ) : null}

        {showCreate ? (
          <CanvasCard
            theme={th}
            title={copy.createTitle}
            subtitle={copy.createSubtitle}
          >
            <form onSubmit={handleCreate}>
              <div style={createPanelStyle}>
                <div style={createGridStyle}>
                  <CanvasField
                    theme={th}
                    label={locale === "en" ? "Tenant name" : "租戶名稱"}
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
                  <CanvasField theme={th} label="Code">
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
                      style={{ ...inputStyle, ...monoStyle }}
                    />
                  </CanvasField>
                  <CanvasField theme={th} label={copy.statusLabel}>
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
                      <option value="active">{copy.statuses.active}</option>
                      <option value="inactive">{copy.statuses.paused}</option>
                    </select>
                  </CanvasField>
                </div>

                <div style={createGridStyle}>
                  <CanvasField
                    theme={th}
                    label={
                      locale === "en"
                        ? "Active drivers quota"
                        : "Active drivers 配額"
                    }
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
                      style={{ ...inputStyle, ...monoStyle }}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={
                      locale === "en"
                        ? "Monthly bookings quota"
                        : "Monthly bookings 配額"
                    }
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
                      style={{ ...inputStyle, ...monoStyle }}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={
                      locale === "en"
                        ? "Monthly API calls quota"
                        : "Monthly API calls 配額"
                    }
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
                      style={{ ...inputStyle, ...monoStyle }}
                    />
                  </CanvasField>
                </div>

                <div style={createGridStyle}>
                  <CanvasField
                    theme={th}
                    label={locale === "en" ? "Integration mode" : "介接模式"}
                  >
                    <select
                      value={createForm.integrationMode}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          integrationMode: event.target
                            .value as TenantFormState["integrationMode"],
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
                    label={
                      locale === "en"
                        ? "Bootstrap admin email"
                        : "Bootstrap admin email"
                    }
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
                    label={
                      locale === "en" ? "Sandbox base URL" : "Sandbox base URL"
                    }
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
                      style={{ ...inputStyle, ...monoStyle }}
                    />
                  </CanvasField>
                </div>

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
                        style={actionPillButtonStyle(
                          active ? "accent" : "neutral",
                          false,
                        )}
                      >
                        {moduleLabels[moduleCode]}
                      </button>
                    );
                  })}
                </div>
              </form>
            </CanvasCard>

                <div style={filterRowStyle}>
                  <CanvasBtn
                    theme={th}
                    variant="secondary"
                    onClick={() => setShowCreate(false)}
                  >
                    {locale === "en" ? "Cancel" : "取消"}
                  </CanvasBtn>
                  <button
                    type="submit"
                    disabled={
                      creating ||
                      !createForm.name.trim() ||
                      !createForm.code.trim()
                    }
                    style={actionPillButtonStyle(
                      "accent",
                      creating ||
                        !createForm.name.trim() ||
                        !createForm.code.trim(),
                    )}
                  >
                    {creating ? copy.createSubmitting : copy.createSubmit}
                  </button>
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
          {visibleTenants.length > 0 ? (
            <CanvasTable<TenantTableRow>
              theme={th}
              columns={columns}
              rows={visibleTenants as TenantTableRow[]}
            />
          ) : effectiveEmptyState ? (
            <div style={emptyStateWrapStyle}>
              <CanvasPill theme={th} tone={effectiveEmptyState.tone}>
                {emptyState?.reason}
              </CanvasPill>
              <div style={{ display: "grid", gap: 4 }}>
                <strong>{effectiveEmptyState.title}</strong>
                <span style={secondaryTextStyle}>
                  {effectiveEmptyState.body}
                </span>
              </div>
              {emptyState?.nextAction ? (
                <button
                  type="button"
                  disabled={!emptyState.nextAction.enabled}
                  onClick={() =>
                    void handleEmptyStateAction(emptyState.nextAction!)
                  }
                  title={emptyState.nextAction.disabledReasonCode}
                  style={actionPillButtonStyle(
                    actionTone(emptyState.nextAction),
                    !emptyState.nextAction.enabled,
                  )}
                >
                  {getActionLabel(locale, emptyState.nextAction.action)}
                </button>
              ) : null}
            </div>
          ) : null}
        </CanvasCard>
      </div>
    </CanvasShell>
  );
}
