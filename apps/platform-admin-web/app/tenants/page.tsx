"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
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
import type {
  CreatePlatformTenantCommand,
  CrossAppResourceLink,
  EmptyReason,
  PlatformAdminTenantRecord,
  PlatformTenantGateStatus,
  RefreshTier,
  ResourceActionDescriptor,
  TenantRolloutGateStatus,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_INTEGRATION_MODES,
  PLATFORM_TENANT_MODULES,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type TenantFilter =
  | "all"
  | "sandbox"
  | "pilot"
  | "production"
  | "rollback_hold";

type TenantRow = PlatformAdminTenantRecord & Record<string, unknown>;

const TENANT_LIST_REFRESH_TIER: RefreshTier = "medium_slow";
const TENANT_LIST_REFRESH_INTERVAL_MS = 30_000;
const OPS_CONSOLE_DEEP_LINK_PREFIX = "/dispatch?tenantId=";

const th = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

const pageRootStyle: CSSProperties = {
  minHeight: "100%",
  background: th.bg,
  color: th.text,
  borderRadius: 12,
  overflow: "hidden",
  fontFamily: th.fontFamily,
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const toolbarRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const searchInputStyle: CSSProperties = {
  flex: "1 1 240px",
  maxWidth: 360,
  padding: "8px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const tabButtonStyle = (active: boolean, danger: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: 0,
  margin: 0,
  border: 0,
  background: "transparent",
  fontSize: 12.5,
  fontWeight: 500,
  fontFamily: th.fontFamily,
  color: active
    ? danger
      ? th.danger
      : th.text
    : danger
      ? th.danger
      : th.textMuted,
  cursor: "pointer",
  lineHeight: 1,
});

const tabBadgeStyle = (active: boolean, danger: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1px 7px",
  borderRadius: 999,
  fontSize: 10.5,
  fontFamily: th.monoFamily,
  fontWeight: 600,
  color: active
    ? danger
      ? "#ffffff"
      : "#ffffff"
    : danger
      ? th.danger
      : th.textMuted,
  background: active
    ? danger
      ? th.danger
      : th.accent
    : danger
      ? th.dangerBg
      : th.surfaceLo,
  border: `1px solid ${
    active ? "transparent" : danger ? th.dangerBorder : th.border
  }`,
});

const refreshChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 9px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.textMuted,
  fontSize: 11,
  fontFamily: th.monoFamily,
};

const loadingStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontFamily: th.fontFamily,
  background: th.bg,
  borderRadius: 12,
};

const emptyCardBodyStyle: CSSProperties = {
  padding: 28,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  alignItems: "flex-start",
};

const emptyTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13.5,
  fontWeight: 600,
  color: th.text,
};

const emptyBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: th.textMuted,
  lineHeight: 1.5,
};

const emptyTagStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 6,
  fontSize: 10.5,
  fontFamily: th.monoFamily,
  letterSpacing: 0.4,
  background: th.surfaceLo,
  border: `1px solid ${th.border}`,
  color: th.textDim,
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
  minWidth: 120,
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

const tenantLinkStyle: CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
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

const tenantSecondaryStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
};

const stackedCellStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const secondaryMonoStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  fontFamily: th.monoFamily,
};

const crossAppLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 6px",
  borderRadius: 6,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.textMuted,
  fontSize: 10.5,
  fontFamily: th.monoFamily,
  textDecoration: "none",
};

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

// Q-ADM05: derive the public gate status for the current rollout stage from
// the existing per-stage gate fields. When the tenant is in rollback_hold the
// gate is always `blocked` regardless of the per-stage detail.
function deriveGateStatus(
  tenant: PlatformAdminTenantRecord,
): TenantRolloutGateStatus {
  if (tenant.status === "rollback_hold") return "blocked";
  const stage = tenant.rollout.stage;
  const perStage: PlatformTenantGateStatus = (() => {
    switch (stage) {
      case "production":
        return tenant.rollout.productionStatus;
      case "pilot":
        return tenant.rollout.pilotStatus;
      case "sandbox":
      default:
        return tenant.rollout.sandboxStatus;
    }
  })();
  // Both gate enums share `pending` / `ready` / `approved` / `blocked` codes.
  return perStage as TenantRolloutGateStatus;
}

// Default `availableActions` descriptor for the page-level Create action.
// Backend may return per-resource descriptors in the future; in the meantime
// the page surfaces the descriptor pattern so the CTA respects the same
// enabled/disabled + risk/confirmation contract everywhere.
function getDefaultCreateActionDescriptor(): ResourceActionDescriptor {
  return {
    action: "create",
    enabled: true,
    riskLevel: "medium",
  };
}

// Q-X15: choose which of the six EmptyReason states should render. This is
// derived client-side until the list endpoint emits a real `EmptyStateEnvelope`
// (UI-BE-006 / UI-CL-001).
function deriveEmptyReason(input: {
  hasError: boolean;
  errorMessage: string | null;
  totalCount: number;
  visibleCount: number;
  filterApplied: boolean;
}): EmptyReason {
  if (input.hasError) {
    const message = input.errorMessage?.toLowerCase() ?? "";
    if (
      message.includes("forbidden") ||
      message.includes("permission") ||
      message.includes("denied") ||
      message.includes("401") ||
      message.includes("403")
    ) {
      return "permission_denied";
    }
    if (
      message.includes("unavailable") ||
      message.includes("timeout") ||
      message.includes("upstream") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504")
    ) {
      return "external_unavailable";
    }
    return "fetch_failed";
  }
  if (input.totalCount === 0) {
    return "no_data";
  }
  if (input.filterApplied && input.visibleCount === 0) {
    return "filtered_empty";
  }
  return "no_data";
}

type EmptyStateCopy = {
  tag: string;
  title: string;
  body: string;
  primaryAction?: ResourceActionDescriptor;
  primaryLabel?: string;
  onPrimary?: () => void;
};

export default function TenantsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<TenantFilter>("all");
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] =
    useState<TenantFormState>(EMPTY_TENANT_FORM);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const showCreateRef = useRef(showCreate);
  showCreateRef.current = showCreate;

  const copy =
    locale === "en"
      ? {
          title: "Tenants",
          subtitle:
            "Manage the full tenant lifecycle from bootstrap through sandbox, pilot, and production rollout.",
          refresh: "Refresh",
          export: "Export",
          createTitle: "Create tenant",
          createSubtitle:
            "Bootstrap tenant identity, quota, enabled modules, and onboarding defaults before the first rollout promotion.",
          rollbackTitle: "Rollback hold requires review",
          rollbackBanner: (count: number) =>
            `${count} tenant(s) are currently in rollback hold and should be reviewed before any new promotion.`,
          errorTitle: "Unable to load tenant governance",
          searchPlaceholder: "Search by name or code…",
          openInOps: "Open in Ops Console",
          refreshTierLabel: (interval: number) =>
            `T4 medium_slow · ${Math.round(interval / 1000)}s`,
          lastSyncedAt: (text: string) => `Last synced: ${text}`,
          neverSynced: "Awaiting first sync",
          tabs: {
            all: "All",
            production: "Production",
            pilot: "Pilot",
            sandbox: "Sandbox",
            rollback_hold: "Rollback hold",
          },
          columns: {
            tenant: "TENANT",
            stage: "STAGE",
            gate: "GATE",
            modules: "MODULES",
            quotas: "Quota / month",
            integration: "Integration",
            updated: "Updated",
          },
          moduleState: {
            enabled: "enabled",
            disabled: "optional",
          },
          empty: {
            no_data: {
              tag: "no_data",
              title: "No tenants yet",
              body: "The platform roster is empty. Bootstrap the first tenant to start the rollout lifecycle.",
              primaryLabel: "Create tenant",
            },
            filtered_empty: {
              tag: "filtered_empty",
              title: "No matching tenants",
              body: "No tenants match the current tab or search query. Clear the filter or try a different keyword.",
              primaryLabel: "Reset filters",
            },
            fetch_failed: {
              tag: "fetch_failed",
              title: "Could not load tenants",
              body: "The platform-admin API returned an error. Retry, or check the platform health surface for details.",
              primaryLabel: "Retry",
            },
            permission_denied: {
              tag: "permission_denied",
              title: "You don't have permission to view tenants",
              body: "Your platform role does not include tenant governance authority. Contact a pa_super_admin if you should have access.",
            },
            external_unavailable: {
              tag: "external_unavailable",
              title: "Tenant directory temporarily unavailable",
              body: "Upstream tenant directory is degraded. Retry shortly; this page polls every 30s automatically.",
              primaryLabel: "Retry now",
            },
            not_provisioned: {
              tag: "not_provisioned",
              title: "Tenant module not provisioned",
              body: "The tenants module is not enabled for this environment. Provision it from the platform feature catalog before continuing.",
            },
          },
        }
      : {
          title: "租戶",
          subtitle:
            "管理 tenant 從建立到 sandbox、pilot、production rollout 的完整生命週期。",
          refresh: "重新整理",
          export: "匯出",
          createTitle: "建立租戶",
          createSubtitle:
            "在第一次 promotion 前，先補齊租戶主檔、配額、模組與 onboarding defaults。",
          rollbackTitle: "Rollback hold 需優先審視",
          rollbackBanner: (count: number) =>
            `${count} 個租戶目前處於 rollback hold，推進新 rollout 前應先完成治理判讀。`,
          errorTitle: "無法載入租戶治理資料",
          searchPlaceholder: "輸入租戶名稱或代碼搜尋…",
          openInOps: "在 Ops Console 開啟",
          refreshTierLabel: (interval: number) =>
            `T4 medium_slow · ${Math.round(interval / 1000)}s`,
          lastSyncedAt: (text: string) => `上次同步：${text}`,
          neverSynced: "等待第一次同步",
          tabs: {
            all: "全部",
            production: "Production",
            pilot: "Pilot",
            sandbox: "Sandbox",
            rollback_hold: "Rollback hold",
          },
          columns: {
            tenant: "TENANT",
            stage: "STAGE",
            gate: "GATE",
            modules: "MODULES",
            quotas: "配額 / 月",
            integration: "介接",
            updated: "更新",
          },
          moduleState: {
            enabled: "已啟用",
            disabled: "可選",
          },
          empty: {
            no_data: {
              tag: "no_data",
              title: "尚未建立任何租戶",
              body: "平台租戶名冊為空。建立第一個租戶，開始 rollout 生命週期。",
              primaryLabel: "建立租戶",
            },
            filtered_empty: {
              tag: "filtered_empty",
              title: "沒有符合條件的租戶",
              body: "目前的篩選分頁或搜尋條件下沒有結果。請重置篩選或調整關鍵字。",
              primaryLabel: "重置篩選",
            },
            fetch_failed: {
              tag: "fetch_failed",
              title: "讀取租戶清單失敗",
              body: "Platform-Admin API 回傳錯誤。可重試，或到平台健康頁面查看詳情。",
              primaryLabel: "重試",
            },
            permission_denied: {
              tag: "permission_denied",
              title: "無檢視租戶名單的權限",
              body: "目前平台角色未授予租戶治理權。請聯繫 pa_super_admin 確認授權。",
            },
            external_unavailable: {
              tag: "external_unavailable",
              title: "租戶名冊暫時無法服務",
              body: "上游租戶目錄目前降級。本頁每 30 秒自動輪詢，可稍候再試。",
              primaryLabel: "立即重試",
            },
            not_provisioned: {
              tag: "not_provisioned",
              title: "尚未啟用租戶模組",
              body: "此環境尚未啟用 Tenants 模組。請先到平台功能目錄啟用後再繼續。",
            },
          },
        };

  const moduleLabels = useMemo(() => createTenantModuleLabels(t), [t]);

  const loadTenants = useCallback(
    async (mode: "initial" | "manual" | "auto") => {
      if (mode === "initial") {
        setInitialLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const result = await client.listPlatformTenants();
        setTenants(result ?? []);
        setLastFetchedAt(new Date());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mode === "initial") {
          setInitialLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [client],
  );

  useEffect(() => {
    void loadTenants("initial");
  }, [loadTenants]);

  // T4 medium_slow polling cadence per packet §3.2. Pause polling while the
  // create form is open so an in-flight form is never clobbered by a sync.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (showCreateRef.current) return;
      void loadTenants("auto");
    }, TENANT_LIST_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loadTenants]);

  const counts = useMemo(
    () => ({
      all: tenants.length,
      sandbox: tenants.filter((tenant) => tenant.rollout.stage === "sandbox")
        .length,
      pilot: tenants.filter((tenant) => tenant.rollout.stage === "pilot")
        .length,
      production: tenants.filter(
        (tenant) => tenant.rollout.stage === "production",
      ).length,
      rollback_hold: tenants.filter(
        (tenant) => tenant.status === "rollback_hold",
      ).length,
    }),
    [tenants],
  );

  const trimmedSearch = search.trim().toLowerCase();

  const visibleTenants = useMemo(() => {
    const filtered = tenants.filter((tenant) => {
      const stageMatch =
        filter === "all"
          ? true
          : filter === "rollback_hold"
            ? tenant.status === "rollback_hold"
            : tenant.rollout.stage === filter;
      if (!stageMatch) return false;

      if (!trimmedSearch) return true;
      return (
        tenant.name.toLowerCase().includes(trimmedSearch) ||
        tenant.code.toLowerCase().includes(trimmedSearch)
      );
    });

    return [...filtered].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
  }, [filter, tenants, trimmedSearch]);

  const filterApplied = filter !== "all" || trimmedSearch.length > 0;

  const exportVisibleTenants = useCallback(() => {
    if (visibleTenants.length === 0) {
      return;
    }

    const header = [
      copy.columns.tenant,
      copy.columns.stage,
      copy.columns.gate,
      copy.columns.modules,
      copy.columns.quotas,
      copy.columns.integration,
      copy.columns.updated,
    ];

    const rows = visibleTenants.map((tenant) => [
      `${tenant.name} (${tenant.code})`,
      tenant.rollout.stage,
      deriveGateStatus(tenant),
      tenant.enabledModules.join(" | "),
      `${tenant.quotas.monthlyBookings}/${tenant.quotas.activeDrivers}/${tenant.quotas.monthlyApiCalls}`,
      tenant.integrationPackage.mode,
      formatDateTime(tenant.updatedAt),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(toCsvCell).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `platform-tenants-${filter}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [copy.columns, filter, visibleTenants]);

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
      await loadTenants("manual");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const buildOpsConsoleLink = useCallback(
    (tenant: PlatformAdminTenantRecord): CrossAppResourceLink => ({
      targetApp: "ops-console",
      route: `${OPS_CONSOLE_DEEP_LINK_PREFIX}${encodeURIComponent(tenant.id)}`,
      resourceType: "tenant",
      resourceId: tenant.id,
      openMode: "new_tab",
      label: copy.openInOps,
    }),
    [copy.openInOps],
  );

  const columns = useMemo<CanvasTableColumn<TenantRow>[]>(
    () => [
      {
        h: copy.columns.tenant,
        w: 260,
        r: (tenant) => {
          const opsLink = buildOpsConsoleLink(tenant);
          return (
            <div style={stackedCellStyle}>
              <Link href={`/tenants/${tenant.id}`} style={tenantLinkStyle}>
                <span style={tenantNameStyle}>{tenant.name}</span>
                <span style={tenantMetaStyle}>
                  {tenant.code} · {tenant.id}
                </span>
              </Link>
              {tenant.status === "rollback_hold" ? (
                <span style={tenantSecondaryStyle}>
                  {locale === "en"
                    ? "rollout held pending governance review"
                    : "rollout 已停在治理審視中"}
                </span>
              ) : null}
              <a
                href={opsLink.route}
                target={opsLink.openMode === "new_tab" ? "_blank" : "_self"}
                rel="noreferrer"
                style={crossAppLinkStyle}
                data-cross-app-target={opsLink.targetApp}
                data-cross-app-resource={`${opsLink.resourceType}:${opsLink.resourceId}`}
              >
                ↗ {opsLink.label}
              </a>
            </div>
          );
        },
      },
      {
        h: copy.columns.stage,
        w: 140,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <CanvasPill
              theme={th}
              tone={toCanvasTone(tenantStageTone(tenant.rollout.stage))}
              dot
            >
              {formatPlatformCodeLabel(locale, tenant.rollout.stage)}
            </CanvasPill>
            <span style={tenantSecondaryStyle}>
              {formatPlatformCodeLabel(locale, tenant.status)}
            </span>
          </div>
        ),
      },
      {
        h: copy.columns.gate,
        w: 130,
        r: (tenant) => {
          const gate = deriveGateStatus(tenant);
          return (
            <div style={stackedCellStyle}>
              <CanvasPill theme={th} tone={toCanvasTone(tenantStageTone(gate))}>
                {formatPlatformCodeLabel(locale, gate)}
              </CanvasPill>
              {tenant.rollout.rollbackPrepared ? (
                <span style={secondaryMonoStyle}>rollback ready</span>
              ) : null}
            </div>
          );
        },
      },
      {
        h: copy.columns.modules,
        w: 130,
        mono: true,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span>
              {tenant.enabledModules.length}/{PLATFORM_TENANT_MODULES.length}
            </span>
            <span style={secondaryMonoStyle}>
              {tenant.enabledModules
                .map((moduleCode) => moduleLabels[moduleCode])
                .join(" · ")}
            </span>
          </div>
        ),
      },
      {
        h: copy.columns.quotas,
        w: 180,
        mono: true,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span>
              {formatLocaleNumber(locale, tenant.quotas.monthlyBookings)}{" "}
              {locale === "en" ? "bookings" : "bookings"}
            </span>
            <span style={secondaryMonoStyle}>
              {formatLocaleNumber(locale, tenant.quotas.activeDrivers)}{" "}
              {locale === "en" ? "drivers" : "drivers"} ·{" "}
              {formatLocaleNumber(locale, tenant.quotas.monthlyApiCalls)} API
            </span>
          </div>
        ),
      },
      {
        h: copy.columns.integration,
        w: 180,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span>
              {formatPlatformCodeLabel(locale, tenant.integrationPackage.mode)}
            </span>
            <span style={secondaryMonoStyle}>
              {truncate(getIntegrationEndpoint(tenant), 28)}
            </span>
          </div>
        ),
      },
      {
        h: copy.columns.updated,
        w: 160,
        mono: true,
        r: (tenant) => formatDateTime(tenant.updatedAt),
      },
    ],
    [copy.columns, locale, moduleLabels, buildOpsConsoleLink],
  );

  const tabDefs: Array<{
    value: TenantFilter;
    label: string;
    count: number;
    danger: boolean;
  }> = [
    {
      value: "all",
      label: copy.tabs.all,
      count: counts.all,
      danger: false,
    },
    {
      value: "production",
      label: copy.tabs.production,
      count: counts.production,
      danger: false,
    },
    {
      value: "pilot",
      label: copy.tabs.pilot,
      count: counts.pilot,
      danger: false,
    },
    {
      value: "sandbox",
      label: copy.tabs.sandbox,
      count: counts.sandbox,
      danger: false,
    },
    {
      value: "rollback_hold",
      label: copy.tabs.rollback_hold,
      count: counts.rollback_hold,
      danger: true,
    },
  ];

  const tabNodes: ReactNode[] = tabDefs.map((tabDef) => {
    const active = filter === tabDef.value;
    return (
      <button
        key={tabDef.value}
        type="button"
        onClick={() => setFilter(tabDef.value)}
        aria-pressed={active}
        style={tabButtonStyle(active, tabDef.danger)}
      >
        <span>{tabDef.label}</span>
        <span style={tabBadgeStyle(active, tabDef.danger)}>
          {formatLocaleNumber(locale, tabDef.count)}
        </span>
      </button>
    );
  });

  const activeIndex = Math.max(
    0,
    tabDefs.findIndex((tabDef) => tabDef.value === filter),
  );
  const activeTabNode = tabNodes[activeIndex];

  const createActionDescriptor = getDefaultCreateActionDescriptor();
  const createCtaDisabled = !createActionDescriptor.enabled || creating;

  const emptyReason = deriveEmptyReason({
    hasError: Boolean(error),
    errorMessage: error,
    totalCount: tenants.length,
    visibleCount: visibleTenants.length,
    filterApplied,
  });

  const emptyCopyMap: Record<EmptyReason, EmptyStateCopy> = useMemo(() => {
    const dictEntries = copy.empty;
    const map: Record<EmptyReason, EmptyStateCopy> = {
      no_data: {
        ...dictEntries.no_data,
        primaryAction: createActionDescriptor,
        onPrimary: () => setShowCreate(true),
      },
      filtered_empty: {
        ...dictEntries.filtered_empty,
        primaryAction: { action: "reset", enabled: true, riskLevel: "low" },
        onPrimary: () => {
          setFilter("all");
          setSearch("");
        },
      },
      fetch_failed: {
        ...dictEntries.fetch_failed,
        primaryAction: { action: "retry", enabled: true, riskLevel: "low" },
        onPrimary: () => void loadTenants("manual"),
      },
      permission_denied: {
        ...dictEntries.permission_denied,
      },
      external_unavailable: {
        ...dictEntries.external_unavailable,
        primaryAction: { action: "retry", enabled: true, riskLevel: "low" },
        onPrimary: () => void loadTenants("manual"),
      },
      not_provisioned: {
        ...dictEntries.not_provisioned,
      },
      driver_not_eligible: {
        tag: "driver_not_eligible",
        title: dictEntries.no_data.title,
        body: dictEntries.no_data.body,
      },
    };
    return map;
  }, [copy.empty, createActionDescriptor, loadTenants]);

  const lastSyncCopy = lastFetchedAt
    ? copy.lastSyncedAt(formatDateTime(lastFetchedAt.toISOString()))
    : copy.neverSynced;

  if (initialLoading) {
    return <div style={loadingStateStyle}>{t("tenants.loading")}</div>;
  }

  const renderEmptyState = (reason: EmptyReason) => {
    const e = emptyCopyMap[reason];
    return (
      <div style={emptyCardBodyStyle}>
        <span style={emptyTagStyle}>{e.tag}</span>
        <h3 style={emptyTitleStyle}>{e.title}</h3>
        <p style={emptyBodyStyle}>{e.body}</p>
        {e.primaryAction && e.primaryLabel && e.onPrimary ? (
          <CanvasBtn
            theme={th}
            variant={
              e.primaryAction.riskLevel === "low" ? "secondary" : "primary"
            }
            onClick={e.onPrimary}
            disabled={!e.primaryAction.enabled}
          >
            {e.primaryLabel}
          </CanvasBtn>
        ) : null}
      </div>
    );
  };

  const showRollbackBanner =
    counts.rollback_hold > 0 && emptyReason !== "permission_denied";
  const tableHasRows = visibleTenants.length > 0 && !error;

  return (
    <div style={pageRootStyle}>
      <CanvasPageHeader
        theme={th}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <>
            <CanvasBtn
              theme={th}
              variant="secondary"
              onClick={() => void loadTenants("manual")}
              disabled={refreshing}
            >
              {copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="secondary"
              icon="reports"
              onClick={exportVisibleTenants}
              disabled={visibleTenants.length === 0}
            >
              {copy.export}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon={showCreate ? "x" : "plus"}
              onClick={() => setShowCreate((current) => !current)}
              disabled={createCtaDisabled && !showCreate}
              data-action={createActionDescriptor.action}
              data-risk-level={createActionDescriptor.riskLevel}
            >
              {showCreate ? t("common.cancel") : t("tenants.newTenant")}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={toolbarRowStyle}>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={copy.searchPlaceholder}
            style={searchInputStyle}
            aria-label={copy.searchPlaceholder}
          />
          <span style={{ flex: 1 }} />
          <span
            style={refreshChipStyle}
            data-refresh-tier={TENANT_LIST_REFRESH_TIER}
          >
            ⟳ {copy.refreshTierLabel(TENANT_LIST_REFRESH_INTERVAL_MS)}
          </span>
          <span style={refreshChipStyle}>{lastSyncCopy}</span>
        </div>

        {error &&
        emptyReason !== "fetch_failed" &&
        emptyReason !== "external_unavailable" &&
        emptyReason !== "permission_denied" ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        {showRollbackBanner ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={copy.rollbackTitle}
            body={copy.rollbackBanner(counts.rollback_hold)}
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
                          <span style={tenantSecondaryStyle}>
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
                    disabled={
                      creating ||
                      !createForm.name.trim() ||
                      !createForm.code.trim()
                    }
                    style={submitButtonStyle(
                      creating ||
                        !createForm.name.trim() ||
                        !createForm.code.trim(),
                    )}
                    data-action={createActionDescriptor.action}
                    data-risk-level={createActionDescriptor.riskLevel}
                  >
                    {creating
                      ? t("common.creating")
                      : t("tenants.createTenant")}
                  </button>
                </div>
              </div>
            </form>
          </CanvasCard>
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {tableHasRows ? (
            <CanvasTable<TenantRow>
              theme={th}
              columns={columns}
              rows={visibleTenants as TenantRow[]}
            />
          ) : (
            renderEmptyState(emptyReason)
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
