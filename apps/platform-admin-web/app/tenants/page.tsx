"use client";

import Link from "next/link";
import React, {
  useCallback,
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
  padding: 24,
  color: th.textMuted,
  fontFamily: th.fontFamily,
  background: th.bg,
  borderRadius: 12,
};

const emptyStateStyle: CSSProperties = {
  padding: 28,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
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

function toCanvasTone(tone: ReturnType<typeof tenantStageTone>): CanvasTone {
  return tone === "warning" ? "warn" : tone;
}

function formatLocaleNumber(locale: string, value: number) {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function getFilterTone(value: TenantFilter, active: boolean): CanvasTone {
  if (value === "rollback_hold") {
    return "danger";
  }
  if (active) {
    return "accent";
  }
  return "neutral";
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

export default function TenantsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
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
          filterPill: "live roster",
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
          filterPill: "平台治理名單",
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
        };

  const moduleLabels = useMemo(() => createTenantModuleLabels(t), [t]);

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
        (tenant) => tenant.rollout.stage === "production",
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
          : tenants.filter((tenant) => tenant.rollout.stage === filter);

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
      tenant.rollout.stage,
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
        w: 260,
        r: (tenant) => (
          <Link href={`/tenants/${tenant.id}`} style={tenantLinkStyle}>
            <span style={tenantNameStyle}>{tenant.name}</span>
            <span style={tenantMetaStyle}>
              {tenant.code} · {tenant.id}
            </span>
            {tenant.status === "rollback_hold" ? (
              <span style={tenantSecondaryStyle}>
                {locale === "en"
                  ? "rollout held pending governance review"
                  : "rollout 已停在治理審視中"}
              </span>
            ) : null}
          </Link>
        ),
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
        h: copy.columns.modules,
        w: 130,
        mono: true,
        r: (tenant) => (
          <div style={stackedCellStyle}>
            <span>{tenant.enabledModules.length}/4</span>
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

  if (loading) {
    return <div style={loadingStateStyle}>{t("tenants.loading")}</div>;
  }

  return (
    <div style={pageRootStyle}>
      <CanvasPageHeader
        theme={th}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <CanvasBtn
              theme={th}
              variant="secondary"
              onClick={() => void loadTenants()}
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
            >
              {showCreate ? t("common.cancel") : t("tenants.newTenant")}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={filterRowStyle}>
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
                dot={option.value !== "all"}
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

        {counts.rollback_hold > 0 ? (
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
          {visibleTenants.length > 0 ? (
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
    </div>
  );
}
