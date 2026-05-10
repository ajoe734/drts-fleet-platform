"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { actionButtonStyle, emptyStateStyle } from "@/components/platform-ui";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  EMPTY_TENANT_FORM,
  IntegrationFields,
  ModuleFields,
  QuotaFields,
  TenantIdentityFields,
  createTenantModuleLabels,
  parseQuota,
  tenantStageTone,
  tenantStatusTone,
  toggleTenantModule,
  type TenantFormState,
} from "@/components/tenant-governance-shared";
import type {
  CreatePlatformTenantCommand,
  PlatformAdminTenantRecord,
} from "@drts/contracts";
import {
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  FilterPill,
  FilterPillRow,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowPanel,
} from "@drts/ui-web";

type TenantFilter =
  | "all"
  | "sandbox"
  | "pilot"
  | "production"
  | "rollback_hold";

const watchlistGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
} satisfies React.CSSProperties;

const watchlistCardStyle = {
  display: "grid",
  gap: 8,
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid #dbe4ee",
  background: "#f8fafc",
} satisfies React.CSSProperties;

export default function TenantsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tenantActionId, setTenantActionId] = useState<string | null>(null);
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
          filtersLabel: "Filter tenants by rollout lane",
          view: "Open detail",
          createTitle: "Create tenant",
          createSubtitle:
            "Bootstrap the tenant identity, quota, enabled modules, and onboarding defaults from the platform side.",
          rollbackBanner: (count: number) =>
            `${count} tenant(s) are in rollback hold and should be reviewed before any new rollout promotion.`,
          columns: {
            tenant: "Tenant",
            stage: "Stage",
            modules: "Modules",
            quotas: "Quota / month",
            integration: "Integration",
            updated: "Updated",
            actions: "Actions",
          },
          summary: "Governance list",
        }
      : {
          title: "租戶",
          subtitle:
            "管理 tenant 從建立到 sandbox、pilot、production rollout 的完整生命週期。",
          refresh: "重新整理",
          filtersLabel: "依 rollout lane 篩選租戶",
          view: "查看詳情",
          createTitle: "建立租戶",
          createSubtitle:
            "從平台端建立租戶主檔、配額、模組與 onboarding defaults。",
          rollbackBanner: (count: number) =>
            `${count} 個租戶目前處於 rollback hold，推進新 rollout 前應先完成治理判讀。`,
          columns: {
            tenant: "租戶",
            stage: "階段",
            modules: "模組",
            quotas: "配額 / 月",
            integration: "介接",
            updated: "更新",
            actions: "操作",
          },
          summary: "治理清單",
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
      active: tenants.filter((tenant) => tenant.status === "active").length,
      paused: tenants.filter((tenant) => tenant.status === "paused").length,
    }),
    [tenants],
  );

  const visibleTenants = useMemo(() => {
    switch (filter) {
      case "rollback_hold":
        return tenants.filter((tenant) => tenant.status === "rollback_hold");
      case "sandbox":
      case "pilot":
      case "production":
        return tenants.filter((tenant) => tenant.rollout.stage === filter);
      case "all":
      default:
        return tenants;
    }
  }, [filter, tenants]);

  const rolloutWatchlist = useMemo(
    () =>
      [...tenants]
        .filter(
          (tenant) =>
            tenant.status === "rollback_hold" ||
            tenant.rollout.stage === "pilot" ||
            tenant.rollout.stage === "sandbox",
        )
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        )
        .slice(0, 3),
    [tenants],
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
      await loadTenants();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const runTenantAction = useCallback(
    async (
      tenantId: string,
      action: "activate" | "suspend" | "rollback_hold",
    ) => {
      setTenantActionId(`${tenantId}:${action}`);
      setError(null);
      try {
        if (action === "activate") {
          await client.activateTenant(tenantId);
        } else if (action === "rollback_hold") {
          await client.rollbackHoldTenant(tenantId);
        } else {
          await client.suspendTenant(tenantId);
        }
        await loadTenants();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setTenantActionId(null);
      }
    },
    [client, loadTenants],
  );

  if (loading) {
    return <div style={emptyStateStyle}>{t("tenants.loading")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={locale === "en" ? "Tenant Governance" : "租戶治理"}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={actionButtonStyle({ tone: "secondary" })}
              onClick={() => void loadTenants()}
            >
              {copy.refresh}
            </button>
            <button
              type="button"
              style={actionButtonStyle({ tone: "primary" })}
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate ? t("common.cancel") : t("tenants.newTenant")}
            </button>
          </div>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={
            locale === "en"
              ? "Unable to load tenant governance"
              : "無法載入租戶治理資料"
          }
          description={error}
        />
      ) : null}

      <KpiRow minWidth="220px">
        <KpiCard
          label={locale === "en" ? "Active tenants" : "活躍租戶"}
          value={counts.all}
          detail={
            locale === "en"
              ? `${counts.active} active · ${counts.paused} paused`
              : `${counts.active} 啟用 · ${counts.paused} 暫停`
          }
          tone="platform"
        />
        <KpiCard
          label={locale === "en" ? "Production lane" : "Production lane"}
          value={counts.production}
          detail={
            locale === "en"
              ? `${counts.pilot} pilot · ${counts.sandbox} sandbox`
              : `${counts.pilot} pilot · ${counts.sandbox} sandbox`
          }
          tone="success"
        />
        <KpiCard
          label={locale === "en" ? "Pilot and sandbox" : "Pilot 與 sandbox"}
          value={counts.pilot + counts.sandbox}
          detail={
            locale === "en"
              ? "Tenants still moving through rollout gates"
              : "仍在 rollout gate 中前進的租戶"
          }
          tone="info"
        />
        <KpiCard
          label={locale === "en" ? "Rollback hold" : "Rollback hold"}
          value={counts.rollback_hold}
          detail={
            locale === "en"
              ? "Tenants requiring governance review"
              : "需要平台治理判讀的租戶"
          }
          tone={counts.rollback_hold > 0 ? "danger" : "neutral"}
        />
      </KpiRow>

      <WorkflowPanel
        title={locale === "en" ? "Rollout watchlist" : "Rollout watchlist"}
        description={
          locale === "en"
            ? "Keep sandbox, pilot, and rollback-hold tenants in a single governance lane before drilling into the tenant detail route."
            : "在進入 tenant detail 前，先把 sandbox、pilot 與 rollback hold 租戶集中在同一條治理 watchlist。"
        }
        tone="platform"
        meta={
          <FilterPillRow>
            <FilterPill
              label={locale === "en" ? "All tenants" : "全部租戶"}
              count={counts.all}
              tone="neutral"
              active={filter === "all"}
            />
            <FilterPill
              label="sandbox"
              count={counts.sandbox}
              tone="warning"
              active={filter === "sandbox"}
            />
            <FilterPill
              label="pilot"
              count={counts.pilot}
              tone="info"
              active={filter === "pilot"}
            />
            <FilterPill
              label="production"
              count={counts.production}
              tone="success"
              active={filter === "production"}
            />
            <FilterPill
              label="rollback hold"
              count={counts.rollback_hold}
              tone="danger"
              active={filter === "rollback_hold"}
            />
          </FilterPillRow>
        }
      >
        <div style={watchlistGridStyle}>
          {rolloutWatchlist.map((tenant) => (
            <div key={tenant.id} style={watchlistCardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <DataCellStack
                  primary={<strong>{tenant.name}</strong>}
                  secondary={`${tenant.code} · ${tenant.id}`}
                />
                <StatusChip
                  label={formatPlatformCodeLabel(locale, tenant.rollout.stage)}
                  tone={tenantStageTone(tenant.rollout.stage)}
                />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <StatusChip
                  label={formatPlatformCodeLabel(locale, tenant.status)}
                  tone={tenantStatusTone(tenant.status)}
                />
                <StatusChip
                  label={formatPlatformCodeLabel(
                    locale,
                    tenant.integrationPackage.mode,
                  )}
                  tone="neutral"
                />
              </div>
              <div style={{ color: "#64748b", fontSize: 12.5 }}>
                {locale === "en" ? "Updated" : "最近更新"}:{" "}
                {new Date(tenant.updatedAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </WorkflowPanel>

      {counts.rollback_hold > 0 ? (
        <CalloutBanner
          tone="warning"
          title={
            locale === "en"
              ? "Rollback hold requires review"
              : "Rollback hold 需優先審視"
          }
          description={copy.rollbackBanner(counts.rollback_hold)}
        />
      ) : null}

      {showCreate ? (
        <WorkflowPanel
          title={copy.createTitle}
          description={copy.createSubtitle}
          tone="info"
        >
          <form onSubmit={handleCreate}>
            <TenantIdentityFields
              form={createForm}
              setForm={setCreateForm}
              t={t}
            />
            <QuotaFields form={createForm} setForm={setCreateForm} t={t} />
            <ModuleFields
              form={createForm}
              onToggle={(moduleCode) =>
                setCreateForm((current) =>
                  toggleTenantModule(current, moduleCode),
                )
              }
              moduleLabels={moduleLabels}
              t={t}
            />
            <IntegrationFields
              form={createForm}
              setForm={setCreateForm}
              t={t}
            />
            <button
              type="submit"
              style={actionButtonStyle({ tone: "primary" })}
              disabled={
                creating || !createForm.name.trim() || !createForm.code.trim()
              }
            >
              {creating ? t("common.creating") : t("tenants.createTenant")}
            </button>
          </form>
        </WorkflowPanel>
      ) : null}

      <DataViewCard
        title={copy.summary}
        subtitle={
          locale === "en"
            ? "Platform-owned roster for rollout posture, module coverage, quota baselines, and integration mode."
            : "平台治理名單，集中呈現 rollout posture、模組覆蓋、配額基線與介接模式。"
        }
        tone="platform"
        filters={
          <DataFilterBar
            value={filter}
            onChange={setFilter}
            ariaLabel={copy.filtersLabel}
            filters={[
              {
                value: "all",
                label: locale === "en" ? "All" : "全部",
                count: counts.all,
                tone: "neutral",
              },
              {
                value: "sandbox",
                label: "sandbox",
                count: counts.sandbox,
                tone: "warning",
              },
              {
                value: "pilot",
                label: "pilot",
                count: counts.pilot,
                tone: "info",
              },
              {
                value: "production",
                label: "production",
                count: counts.production,
                tone: "success",
              },
              {
                value: "rollback_hold",
                label: "rollback hold",
                count: counts.rollback_hold,
                tone: "danger",
              },
            ]}
          />
        }
        summary={
          locale === "en"
            ? `${visibleTenants.length} visible rows · open tenant detail to manage rollout, onboarding defaults, and role acknowledgements.`
            : `目前顯示 ${visibleTenants.length} 筆租戶；進入 detail 後可治理 rollout、onboarding defaults 與角色確認。`
        }
      >
        <DataTable
          columns={[
            { label: copy.columns.tenant, width: "260px" },
            { label: copy.columns.stage, width: "160px" },
            { label: copy.columns.modules, width: "150px" },
            { label: copy.columns.quotas, width: "180px" },
            { label: copy.columns.integration, width: "180px" },
            { label: copy.columns.updated, width: "180px" },
            { label: copy.columns.actions, width: "260px" },
          ]}
          empty={t("tenants.empty")}
        >
          {visibleTenants.map((tenant) => (
            <Tr key={tenant.id} highlighted={tenant.status === "rollback_hold"}>
              <Td>
                <DataCellStack
                  primary={<strong>{tenant.name}</strong>}
                  secondary={`${tenant.code} · ${tenant.id}`}
                  tertiary={
                    tenant.status === "rollback_hold"
                      ? locale === "en"
                        ? "rollout held pending governance review"
                        : "rollout 已停在治理審視中"
                      : undefined
                  }
                />
              </Td>
              <Td>
                <div style={{ display: "grid", gap: 8 }}>
                  <StatusChip
                    label={formatPlatformCodeLabel(
                      locale,
                      tenant.rollout.stage,
                    )}
                    tone={tenantStageTone(tenant.rollout.stage)}
                  />
                  <StatusChip
                    label={formatPlatformCodeLabel(locale, tenant.status)}
                    tone={tenantStatusTone(tenant.status)}
                  />
                </div>
              </Td>
              <Td>
                <DataCellStack
                  primary={`${tenant.enabledModules.length}/4`}
                  secondary={tenant.enabledModules
                    .map((module) => moduleLabels[module])
                    .join(" · ")}
                />
              </Td>
              <Td>
                <DataCellStack
                  primary={`${tenant.quotas.monthlyBookings.toLocaleString()} bookings`}
                  secondary={`${tenant.quotas.activeDrivers.toLocaleString()} drivers`}
                  tertiary={`${tenant.quotas.monthlyApiCalls.toLocaleString()} API calls`}
                />
              </Td>
              <Td>
                <DataCellStack
                  primary={formatPlatformCodeLabel(
                    locale,
                    tenant.integrationPackage.mode,
                  )}
                  secondary={tenant.integrationPackage.sandboxBaseUrl ?? "—"}
                  tertiary={
                    tenant.integrationPackage.productionBaseUrl ?? undefined
                  }
                />
              </Td>
              <Td>{new Date(tenant.updatedAt).toLocaleString()}</Td>
              <Td>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Link
                    href={`/tenants/${tenant.id}`}
                    style={actionButtonStyle({ tone: "secondary", size: "sm" })}
                  >
                    {copy.view}
                  </Link>
                  {tenant.status === "active" ? (
                    <button
                      type="button"
                      style={actionButtonStyle({
                        tone: "secondary",
                        size: "sm",
                      })}
                      disabled={tenantActionId === `${tenant.id}:suspend`}
                      onClick={() => void runTenantAction(tenant.id, "suspend")}
                    >
                      {t("tenants.suspend")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={actionButtonStyle({
                        tone: "secondary",
                        size: "sm",
                      })}
                      disabled={tenantActionId === `${tenant.id}:activate`}
                      onClick={() =>
                        void runTenantAction(tenant.id, "activate")
                      }
                    >
                      {t("tenants.activate")}
                    </button>
                  )}
                  {tenant.status !== "rollback_hold" ? (
                    <button
                      type="button"
                      style={actionButtonStyle({
                        tone: "secondary",
                        size: "sm",
                      })}
                      disabled={tenantActionId === `${tenant.id}:rollback_hold`}
                      onClick={() =>
                        void runTenantAction(tenant.id, "rollback_hold")
                      }
                    >
                      {t("tenants.rollbackHold")}
                    </button>
                  ) : null}
                </div>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>
    </div>
  );
}
