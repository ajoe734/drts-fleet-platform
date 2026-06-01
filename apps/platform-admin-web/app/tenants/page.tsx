"use client";

import Link from "next/link";
import React, {
  useCallback,
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
import type {
  CreatePlatformTenantCommand,
  PlatformAdminTenantRecord,
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

type TenantFilter =
  | "all"
  | "sandbox"
  | "pilot"
  | "production"
  | "rollback_hold";

type TenantStageValue = Exclude<TenantFilter, "all">;
type TenantRow = PlatformAdminTenantRecord & Record<string, unknown>;

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

const filterRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const filterButtonStyle: CSSProperties = {
  border: 0,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
};

const loadingStateStyle: CSSProperties = {
  padding: 28,
  color: th.textMuted,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  textAlign: "center",
};

const emptyStateStyle: CSSProperties = {
  padding: 28,
  color: th.textMuted,
  fontSize: 12.5,
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
  display: "inline-flex",
  flexDirection: "column",
  gap: 2,
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

const tenantSummaryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

function toCanvasTone(
  tone: ReturnType<typeof tenantStageTone>,
): Exclude<CanvasTone, "warn"> | "warn" {
  return tone === "warning" ? "warn" : tone;
}

function formatLocaleNumber(locale: string, value: number) {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function getFilterTone(value: TenantFilter, active: boolean): CanvasTone {
  if (active) {
    return "accent";
  }
  if (value === "rollback_hold") {
    return "danger";
  }
  return "neutral";
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

function toCsvCell(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export default function TenantsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const filterRowRef = useRef<HTMLDivElement | null>(null);
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<TenantFilter>("all");
  const [createForm, setCreateForm] =
    useState<TenantFormState>(EMPTY_TENANT_FORM);

  const copy =
    locale === "en"
      ? {
          title: "Tenants",
          subtitle:
            "Manage the full tenant lifecycle from creation through production rollout.",
          filterAction: "Filter",
          exportAction: "Export",
          createTitle: "Create tenant",
          createSubtitle:
            "Bootstrap tenant identity, quotas, enabled modules, and onboarding defaults before the first promotion.",
          createSummaryTitle: "Bootstrap snapshot",
          createSummarySubtitle:
            "Keep the initial rollout package explicit before this tenant joins the live roster.",
          errorTitle: "Unable to load tenant governance",
          filterPill: "last 30 days",
          columns: {
            tenant: "TENANT",
            stage: "STAGE",
            modules: "MODULES",
            quotas: "配額 / 月",
            integration: "介接",
            updated: "更新",
          },
          filters: {
            all: "All",
            sandbox: "sandbox",
            pilot: "pilot",
            production: "production",
            rollback_hold: "rollback_hold",
          },
          moduleState: {
            enabled: "enabled",
            disabled: "optional",
          },
          bootstrap: {
            modules: "Selected modules",
            quota: "Bookings / month",
            api: "API calls / month",
            status: "STATUS",
            integration: "INTEGRATION",
            admin: "BOOTSTRAP ADMIN",
            sandbox: "SANDBOX BASE URL",
            empty: "—",
          },
          searchPlaceholder: "Search tenants, users, adapters…",
          breadcrumb: ["Tenant Governance", "Tenants"],
          nav: {
            workspace: "Workspace",
            governance: "Tenant Governance",
            fleet: "Fleet & Compliance",
            pricing: "Pricing & Settlement",
            platform: "Platform Layer",
            home: "Home",
            health: "Platform Health",
            tenants: "Tenants",
            partners: "Partner Entry",
            users: "Platform Staff",
            fleetPage: "Fleet & Compliance",
            switchboard: "Public Info & Placards",
            pricingPage: "Pricing",
            payments: "Settlement Governance",
            notices: "Notices & Maintenance",
            audit: "Audit & Evidence",
            flags: "Feature Flags",
            adapters: "Adapter Registry",
          },
        }
      : {
          title: "租戶",
          subtitle: "管理 tenant 從建立到 production rollout 的完整生命週期。",
          filterAction: "篩選",
          exportAction: "匯出",
          createTitle: "建立租戶",
          createSubtitle:
            "在第一次 promotion 前，先補齊租戶主檔、配額、模組與 onboarding defaults。",
          createSummaryTitle: "Bootstrap 摘要",
          createSummarySubtitle:
            "在租戶進入 live roster 之前，先把初始 rollout package 固定下來。",
          errorTitle: "無法載入租戶治理資料",
          filterPill: "最近 30 天",
          columns: {
            tenant: "TENANT",
            stage: "STAGE",
            modules: "MODULES",
            quotas: "配額 / 月",
            integration: "介接",
            updated: "更新",
          },
          filters: {
            all: "全部",
            sandbox: "sandbox",
            pilot: "pilot",
            production: "production",
            rollback_hold: "rollback_hold",
          },
          moduleState: {
            enabled: "已啟用",
            disabled: "可選",
          },
          bootstrap: {
            modules: "已選模組",
            quota: "每月 bookings",
            api: "每月 API 呼叫",
            status: "狀態",
            integration: "介接模式",
            admin: "Bootstrap 管理員",
            sandbox: "Sandbox Base URL",
            empty: "—",
          },
          searchPlaceholder: "搜尋租戶、平台人員、介接…",
          breadcrumb: ["租戶治理", "租戶"],
          nav: {
            workspace: "工作面",
            governance: "租戶治理",
            fleet: "車隊與法遵",
            pricing: "計價與結算",
            platform: "平台層",
            home: "工作首頁",
            health: "平台健康",
            tenants: "租戶",
            partners: "合作夥伴 entry",
            users: "平台人員",
            fleetPage: "車隊與合規",
            switchboard: "法定資訊與牌貼",
            pricingPage: "計價",
            payments: "結算治理",
            notices: "公告與維護",
            audit: "稽核與證據",
            flags: "功能旗標",
            adapters: "介接登錄",
          },
        };

  const moduleLabels = useMemo(() => createTenantModuleLabels(t), [t]);

  const navItems = useMemo<CanvasShellNavItem[]>(
    () => [
      { divider: copy.nav.workspace },
      { key: "home", href: "/", icon: "home", label: copy.nav.home },
      {
        key: "health",
        href: "/health",
        icon: "health",
        label: copy.nav.health,
      },
      { divider: copy.nav.governance },
      {
        key: "tenants",
        href: "/tenants",
        icon: "tenants",
        label: copy.nav.tenants,
      },
      {
        key: "partners",
        href: "/partners",
        icon: "partners",
        label: copy.nav.partners,
      },
      {
        key: "users",
        href: "/users",
        icon: "users",
        label: copy.nav.users,
      },
      { divider: copy.nav.fleet },
      {
        key: "fleet",
        href: "/fleet",
        icon: "fleet",
        label: copy.nav.fleetPage,
      },
      {
        key: "switchboard",
        href: "/switchboard",
        icon: "switchboard",
        label: copy.nav.switchboard,
      },
      { divider: copy.nav.pricing },
      {
        key: "pricing",
        href: "/pricing",
        icon: "pricing",
        label: copy.nav.pricingPage,
      },
      {
        key: "payments",
        href: "/payments",
        icon: "payments",
        label: copy.nav.payments,
      },
      { divider: copy.nav.platform },
      {
        key: "notices",
        href: "/notices",
        icon: "notices",
        label: copy.nav.notices,
      },
      {
        key: "audit",
        href: "/audit",
        icon: "audit",
        label: copy.nav.audit,
      },
      {
        key: "flags",
        href: "/feature-flags",
        icon: "flags",
        label: copy.nav.flags,
      },
      {
        key: "adapters",
        href: "/adapter-registry",
        icon: "adapters",
        label: copy.nav.adapters,
      },
    ],
    [copy.nav],
  );

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformTenants();
      setTenants(result ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const counts = useMemo(
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
      rollback_hold: tenants.filter(
        (tenant) => tenant.status === "rollback_hold",
      ).length,
    }),
    [tenants],
  );

  const visibleTenants = useMemo(() => {
    const filtered =
      filter === "rollback_hold"
        ? tenants.filter((tenant) => tenant.status === "rollback_hold")
        : filter === "all"
          ? tenants
          : tenants.filter(
              (tenant) =>
                tenant.status !== "rollback_hold" &&
                tenant.rollout.stage === filter,
            );

    return [...filtered].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
  }, [filter, tenants]);

  const exportVisibleTenants = useCallback(() => {
    if (visibleTenants.length === 0) {
      return;
    }

    const header = [
      copy.columns.tenant,
      copy.columns.stage,
      copy.columns.modules,
      copy.columns.quotas,
      copy.columns.integration,
      copy.columns.updated,
    ];

    const rows = visibleTenants.map((tenant) => [
      `${tenant.name} (${tenant.code})`,
      getTenantStageValue(tenant),
      `${tenant.enabledModules.length}/${PLATFORM_TENANT_MODULES.length}`,
      formatQuotaSummary(locale, tenant),
      getIntegrationSummary(tenant),
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
  }, [copy.columns, filter, locale, visibleTenants]);

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
      await loadTenants();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const columns = useMemo<CanvasTableColumn<TenantRow>[]>(
    () => [
      {
        h: copy.columns.tenant,
        w: 280,
        r: (tenant) => (
          <Link href={`/tenants/${tenant.id}`} style={tenantLinkStyle}>
            <span style={tenantNameStyle}>{tenant.name}</span>
            <span style={tenantMetaStyle}>
              {tenant.code} · {tenant.id}
            </span>
          </Link>
        ),
      },
      {
        h: copy.columns.stage,
        w: 140,
        r: (tenant) => {
          const stage = getTenantStageValue(tenant);

          return (
            <CanvasPill theme={th} tone={getStageTone(stage)} dot>
              {stage}
            </CanvasPill>
          );
        },
      },
      {
        h: copy.columns.modules,
        w: 108,
        mono: true,
        r: (tenant) => (
          <span
            title={tenant.enabledModules
              .map((moduleCode) => moduleLabels[moduleCode])
              .join(" · ")}
          >
            {tenant.enabledModules.length}/{PLATFORM_TENANT_MODULES.length}
          </span>
        ),
      },
      {
        h: copy.columns.quotas,
        w: 132,
        mono: true,
        r: (tenant) => (
          <span
            title={`${formatLocaleNumber(locale, tenant.quotas.activeDrivers)} drivers · ${formatLocaleNumber(locale, tenant.quotas.monthlyApiCalls)} API`}
          >
            {formatQuotaSummary(locale, tenant)}
          </span>
        ),
      },
      {
        h: copy.columns.integration,
        w: 152,
        mono: true,
        r: (tenant) => (
          <span title={tenant.integrationPackage.sandboxBaseUrl ?? ""}>
            {getIntegrationSummary(tenant)}
          </span>
        ),
      },
      {
        h: copy.columns.updated,
        w: 124,
        mono: true,
        r: (tenant) => formatShortDate(tenant.updatedAt),
      },
    ],
    [copy.columns, locale, moduleLabels],
  );

  const filterOptions = [
    { value: "all" as const, label: copy.filters.all, count: counts.all },
    {
      value: "sandbox" as const,
      label: copy.filters.sandbox,
      count: counts.sandbox,
    },
    { value: "pilot" as const, label: copy.filters.pilot, count: counts.pilot },
    {
      value: "production" as const,
      label: copy.filters.production,
      count: counts.production,
    },
    {
      value: "rollback_hold" as const,
      label: copy.filters.rollback_hold,
      count: counts.rollback_hold,
    },
  ];

  const createDisabled =
    creating || !createForm.name.trim() || !createForm.code.trim();

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
              icon="filter"
              onClick={() =>
                filterRowRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                })
              }
            >
              {copy.filterAction}
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
            <CanvasBtn
              theme={th}
              variant="primary"
              icon={showCreate ? "x" : "plus"}
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate ? t("common.cancel") : t("tenants.newTenant")}
            </CanvasBtn>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        <div ref={filterRowRef} style={filterRowStyle}>
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              style={filterButtonStyle}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
            >
              <CanvasPill
                theme={th}
                tone={getFilterTone(option.value, filter === option.value)}
                dot
              >
                {option.label} {formatLocaleNumber(locale, option.count)}
              </CanvasPill>
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <CanvasPill theme={th} tone="neutral">
            {copy.filterPill}
          </CanvasPill>
        </div>

        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        {showCreate ? (
          <div style={createPanelStyle}>
            <CanvasCard
              theme={th}
              title={copy.createTitle}
              subtitle={copy.createSubtitle}
            >
              <form onSubmit={handleCreate}>
                <div style={createGridStyle}>
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
          {loading ? (
            <div style={loadingStateStyle}>{t("tenants.loading")}</div>
          ) : visibleTenants.length > 0 ? (
            <CanvasTable<TenantRow>
              theme={th}
              columns={columns}
              rows={visibleTenants as TenantRow[]}
            />
          ) : (
            <div style={emptyStateStyle}>{t("tenants.empty")}</div>
          )}
        </CanvasCard>
      </div>
    </CanvasShell>
  );
}
