"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  EMPTY_ONBOARDING_FORM,
  EMPTY_TENANT_FORM,
  ModuleFields,
  QuotaFields,
  TenantIdentityFields,
  createTenantModuleLabels,
  parseCsv,
  parseQuota,
  tenantStageTone,
  tenantStatusTone,
  toTenantOnboardingFormState,
  toTenantSettingsFormState,
  toggleTenantModule,
  type OnboardingFormState,
  type TenantFormState,
} from "@/components/tenant-governance-shared";
import type {
  PlatformAdminTenantRecord,
  PlatformTenantRolloutStage,
  SetPlatformTenantRolloutStageCommand,
  UpdatePlatformTenantOnboardingCommand,
  UpdatePlatformTenantSettingsCommand,
} from "@drts/contracts";
import { PLATFORM_TENANT_ROLLOUT_STAGES } from "@drts/contracts";
import {
  CalloutBanner,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Stepper,
  WorkflowPanel,
  WorkflowSplitLayout,
  type DetailListItem,
  type StepState,
  type StepperItem,
} from "@drts/ui-web";

const STAGE_INDEX: Record<PlatformTenantRolloutStage, number> = {
  sandbox: 0,
  pilot: 1,
  production: 2,
};

function rolloutStepState(
  tenant: PlatformAdminTenantRecord,
  stage: PlatformTenantRolloutStage,
): StepState {
  const gateStatus = tenant.rollout[`${stage}Status`];
  if (gateStatus === "blocked") {
    return "blocked";
  }
  if (
    gateStatus === "approved" ||
    STAGE_INDEX[tenant.rollout.stage] > STAGE_INDEX[stage]
  ) {
    return "complete";
  }
  if (tenant.rollout.stage === stage) {
    return "current";
  }
  return "upcoming";
}

export default function TenantDetailPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = Array.isArray(params?.tenantId)
    ? params.tenantId[0]
    : (params?.tenantId ?? "");
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [tenant, setTenant] = useState<PlatformAdminTenantRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TenantFormState>(EMPTY_TENANT_FORM);
  const [onboardingForm, setOnboardingForm] = useState<OnboardingFormState>(
    EMPTY_ONBOARDING_FORM,
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [promotingStage, setPromotingStage] =
    useState<PlatformTenantRolloutStage | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<string | null>(null);
  const [roleAction, setRoleAction] = useState<string | null>(null);

  const copy =
    locale === "en"
      ? {
          back: "Back to tenants",
          title: "Tenant detail",
          subtitle:
            "Platform-side rollout, onboarding, quota, and role governance.",
          settingsTitle: "Tenant settings",
          settingsSubtitle:
            "Identity, enabled modules, and quota allocations remain platform-owned.",
          onboardingTitle: "Onboarding package",
          onboardingSubtitle:
            "Integration baseline, billing baseline, and webhook defaults exposed for rollout review.",
          defaultsTitle: "Onboarding defaults",
          defaultsSubtitle:
            "Edit the bootstrap package before the next rollout promotion.",
          rolloutTitle: "Rollout progression",
          rolloutSubtitle:
            "Sandbox, pilot, and production gates stay backend-owned. This surface only sends formal progression commands.",
          rolesTitle: "Roles & invites",
          rolesSubtitle:
            "Bootstrap roles and acknowledgements are tracked here for platform review.",
          lifecycleTitle: "Lifecycle controls",
          lifecycleSubtitle:
            "Use lifecycle actions carefully. They change tenant availability at the control-plane level.",
          notFound: "Tenant not found or no longer available.",
          promote: "Promote to",
          activate: "Activate",
          suspend: "Suspend",
          rollback: "Rollback hold",
          saveSettings: "Save settings",
          saveOnboarding: "Save onboarding",
          invite: "Invite",
          acknowledge: "Acknowledge",
        }
      : {
          back: "返回租戶列表",
          title: "租戶詳情",
          subtitle: "平台側的 rollout、onboarding、配額與角色治理工作面。",
          settingsTitle: "租戶設定",
          settingsSubtitle:
            "租戶身分、啟用模組與配額配置仍以平台控制平面為準。",
          onboardingTitle: "Onboarding package",
          onboardingSubtitle:
            "供治理審視的 integration baseline、billing baseline 與 webhook defaults。",
          defaultsTitle: "Onboarding defaults",
          defaultsSubtitle:
            "在下一次 rollout promotion 前調整 bootstrap package。",
          rolloutTitle: "Rollout progression",
          rolloutSubtitle:
            "Sandbox、pilot、production gate 仍由後端維護；此頁面只送正式 progression command。",
          rolesTitle: "Roles & invites",
          rolesSubtitle: "在此檢視 bootstrap roles 與 acknowledgement 狀態。",
          lifecycleTitle: "Lifecycle controls",
          lifecycleSubtitle:
            "生命週期動作會直接影響 tenant 可用性，請審慎操作。",
          notFound: "找不到此租戶，或目前已無法讀取。",
          promote: "推進到",
          activate: "啟用",
          suspend: "暫停",
          rollback: "Rollback hold",
          saveSettings: "儲存設定",
          saveOnboarding: "儲存 onboarding",
          invite: "邀請",
          acknowledge: "確認",
        };

  const moduleLabels = useMemo(() => createTenantModuleLabels(t), [t]);

  const loadTenant = useCallback(async () => {
    if (!tenantId) {
      setTenant(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const record = await client.getPlatformTenant(tenantId);
      setTenant(record);
      setEditForm(toTenantSettingsFormState(record));
      setOnboardingForm(toTenantOnboardingFormState(record));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setTenant(null);
      setEditForm(EMPTY_TENANT_FORM);
      setOnboardingForm(EMPTY_ONBOARDING_FORM);
    } finally {
      setLoading(false);
    }
  }, [client, tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenant) return;
    setSavingSettings(true);
    setError(null);
    try {
      const command: UpdatePlatformTenantSettingsCommand = {
        name: editForm.name,
        enabledModules: editForm.enabledModules,
        quotas: {
          activeDrivers: parseQuota(editForm.activeDrivers),
          monthlyBookings: parseQuota(editForm.monthlyBookings),
          monthlyApiCalls: parseQuota(editForm.monthlyApiCalls),
        },
      };
      await client.updatePlatformTenantSettings(tenant.id, command);
      await loadTenant();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveOnboarding = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenant) return;
    setSavingOnboarding(true);
    setError(null);
    try {
      const command: UpdatePlatformTenantOnboardingCommand = {
        billingBaseline: {
          invoiceTitle: onboardingForm.invoiceTitle,
          contactName: onboardingForm.billingContactName,
          email: onboardingForm.billingContactEmail,
        },
        webhookEvents: parseCsv(onboardingForm.webhookEvents),
        integrationPackage: {
          mode: onboardingForm.integrationMode,
          apiKeyScopes: parseCsv(onboardingForm.apiKeyScopes),
          sandboxBaseUrl: onboardingForm.sandboxBaseUrl || null,
          productionBaseUrl: onboardingForm.productionBaseUrl || null,
        },
        rollout: {
          cutoverOwner: onboardingForm.cutoverOwner || null,
          rollbackOwner: onboardingForm.rollbackOwner || null,
          notes: onboardingForm.notes || null,
          rollbackPrepared: onboardingForm.rollbackPrepared,
        },
      };
      await client.updatePlatformTenantOnboarding(tenant.id, command);
      await loadTenant();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingOnboarding(false);
    }
  };

  const promoteStage = useCallback(
    async (stage: PlatformTenantRolloutStage) => {
      if (!tenant) return;
      setPromotingStage(stage);
      setError(null);
      try {
        const command: SetPlatformTenantRolloutStageCommand = { stage };
        await client.setPlatformTenantRolloutStage(tenant.id, command);
        await loadTenant();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPromotingStage(null);
      }
    },
    [client, loadTenant, tenant],
  );

  const runLifecycle = useCallback(
    async (action: "activate" | "suspend" | "rollback_hold") => {
      if (!tenant) return;
      setLifecycleAction(action);
      setError(null);
      try {
        if (action === "activate") {
          await client.activateTenant(tenant.id);
        } else if (action === "rollback_hold") {
          await client.rollbackHoldTenant(tenant.id);
        } else {
          await client.suspendTenant(tenant.id);
        }
        await loadTenant();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLifecycleAction(null);
      }
    },
    [client, loadTenant, tenant],
  );

  const inviteRole = useCallback(
    async (roleCode: string) => {
      if (!tenant) return;
      setRoleAction(`invite:${roleCode}`);
      setError(null);
      try {
        await client.inviteTenantRole(tenant.id, { roleCode });
        await loadTenant();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRoleAction(null);
      }
    },
    [client, loadTenant, tenant],
  );

  const acknowledgeRole = useCallback(
    async (roleCode: string) => {
      if (!tenant) return;
      setRoleAction(`ack:${roleCode}`);
      setError(null);
      try {
        await client.acknowledgeTenantRole(tenant.id, { roleCode });
        await loadTenant();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRoleAction(null);
      }
    },
    [client, loadTenant, tenant],
  );

  const rolloutSteps = useMemo<StepperItem[]>(() => {
    if (!tenant) {
      return [];
    }

    const sharedTimestamp = tenant.rollout.lastPromotedAt
      ? new Date(tenant.rollout.lastPromotedAt).toLocaleString()
      : undefined;

    return [
      {
        id: "created",
        title: locale === "en" ? "Tenant created" : "租戶已建立",
        description: tenant.createdAt
          ? new Date(tenant.createdAt).toLocaleString()
          : undefined,
        state: "complete",
        tone: "success",
      },
      ...PLATFORM_TENANT_ROLLOUT_STAGES.map((stage) => ({
        id: stage,
        title: formatPlatformCodeLabel(locale, stage),
        description: `${locale === "en" ? "Gate" : "Gate"}: ${tenant.rollout[`${stage}Status`]}`,
        state: rolloutStepState(tenant, stage),
        tone: tenantStageTone(tenant.rollout[`${stage}Status`]),
        timestamp: sharedTimestamp,
      })),
      {
        id: "rollback",
        title: locale === "en" ? "Rollback ready" : "Rollback ready",
        description:
          tenant.rollout.rollbackOwner ??
          (locale === "en"
            ? "No rollback owner recorded"
            : "尚未記錄 rollback owner"),
        state: tenant.rollout.rollbackPrepared ? "complete" : "upcoming",
        tone: tenant.rollout.rollbackPrepared ? "success" : "neutral",
      },
    ];
  }, [locale, tenant]);

  const acknowledgedRoles = tenant?.bootstrapDefaults.roleDefaults.filter(
    (role) => role.acknowledgedAt,
  ).length;

  const onboardingItems = useMemo<DetailListItem[]>(() => {
    if (!tenant) {
      return [];
    }
    return [
      {
        id: "integration",
        label: locale === "en" ? "Integration mode" : "整合模式",
        value: formatPlatformCodeLabel(locale, tenant.integrationPackage.mode),
      },
      {
        id: "sandbox",
        label: "Sandbox URL",
        value: tenant.integrationPackage.sandboxBaseUrl ?? "—",
      },
      {
        id: "production",
        label: "Production URL",
        value: tenant.integrationPackage.productionBaseUrl ?? "—",
      },
      {
        id: "billing",
        label: locale === "en" ? "Billing baseline" : "帳務基線",
        value: tenant.bootstrapDefaults.billingBaseline.invoiceTitle,
        hint: `${tenant.bootstrapDefaults.billingBaseline.contactName} · ${tenant.bootstrapDefaults.billingBaseline.email}`,
      },
      {
        id: "scopes",
        label: "API scopes",
        value:
          tenant.integrationPackage.apiKeyScopes.length > 0
            ? tenant.integrationPackage.apiKeyScopes.join(", ")
            : "—",
        columnSpan: 2,
      },
      {
        id: "webhooks",
        label: "Webhook baseline",
        value:
          tenant.bootstrapDefaults.webhookEvents.length > 0
            ? tenant.bootstrapDefaults.webhookEvents.join(", ")
            : "—",
        columnSpan: 2,
      },
    ];
  }, [locale, tenant]);

  if (loading) {
    return <div className="admin-empty">{t("tenants.loading")}</div>;
  }

  if (!tenant) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <PageHeader
          eyebrow={copy.title}
          title={copy.title}
          subtitle={copy.subtitle}
          actions={
            <Link href="/tenants" className="admin-btn admin-btn--secondary">
              {copy.back}
            </Link>
          }
        />
        <CalloutBanner
          tone="danger"
          title={locale === "en" ? "Tenant unavailable" : "租戶目前不可用"}
          description={error ?? copy.notFound}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={copy.title}
        title={tenant.name}
        subtitle={`${tenant.code} · ${tenant.id}`}
        meta={[
          {
            label: locale === "en" ? "Status" : "狀態",
            value: formatPlatformCodeLabel(locale, tenant.status),
            tone: tenantStatusTone(tenant.status),
          },
          {
            label: locale === "en" ? "Rollout" : "Rollout",
            value: formatPlatformCodeLabel(locale, tenant.rollout.stage),
            tone: tenantStageTone(tenant.rollout.stage),
          },
        ]}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/tenants" className="admin-btn admin-btn--secondary">
              {copy.back}
            </Link>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              onClick={() => void loadTenant()}
            >
              {t("common.refresh")}
            </button>
          </div>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={locale === "en" ? "Unable to update tenant" : "租戶更新失敗"}
          description={error}
        />
      ) : null}

      {tenant.status === "rollback_hold" ? (
        <CalloutBanner
          tone="warning"
          title={
            locale === "en" ? "Rollback hold is active" : "Rollback hold 已啟用"
          }
          description={
            locale === "en"
              ? "Review the rollout note, cutover owner, and rollback owner before restoring promotion flow."
              : "恢復 promotion flow 前，請先確認 rollout note、cutover owner 與 rollback owner。"
          }
        />
      ) : null}

      <KpiRow minWidth="220px">
        <KpiCard
          label={locale === "en" ? "Enabled modules" : "啟用模組"}
          value={tenant.enabledModules.length}
          detail={tenant.enabledModules
            .map((module) => moduleLabels[module])
            .join(" · ")}
          tone="info"
        />
        <KpiCard
          label={locale === "en" ? "Monthly bookings" : "每月 bookings"}
          value={tenant.quotas.monthlyBookings.toLocaleString()}
          detail={`${tenant.quotas.activeDrivers.toLocaleString()} drivers · ${tenant.quotas.monthlyApiCalls.toLocaleString()} API`}
          tone="neutral"
        />
        <KpiCard
          label={locale === "en" ? "Role acknowledgements" : "角色確認"}
          value={`${acknowledgedRoles ?? 0}/${tenant.bootstrapDefaults.roleDefaults.length}`}
          detail={
            locale === "en"
              ? "Bootstrap role package"
              : "Bootstrap role package"
          }
          tone={
            acknowledgedRoles === tenant.bootstrapDefaults.roleDefaults.length
              ? "success"
              : "warning"
          }
        />
        <KpiCard
          label={locale === "en" ? "Last promoted" : "最近推進"}
          value={
            tenant.rollout.lastPromotedAt
              ? new Date(tenant.rollout.lastPromotedAt).toLocaleDateString()
              : "—"
          }
          detail={tenant.rollout.cutoverOwner ?? "—"}
          tone="accent"
        />
      </KpiRow>

      <WorkflowSplitLayout
        main={
          <>
            <WorkflowPanel
              title={copy.onboardingTitle}
              description={copy.onboardingSubtitle}
            >
              <DetailMetadataGrid
                items={onboardingItems}
                minColumnWidth="220px"
              />
            </WorkflowPanel>

            <form onSubmit={handleSaveSettings}>
              <WorkflowPanel
                title={copy.settingsTitle}
                description={copy.settingsSubtitle}
              >
                <TenantIdentityFields
                  form={editForm}
                  setForm={(value) => {
                    setEditForm((current) => {
                      if (!current) {
                        return current;
                      }
                      return typeof value === "function"
                        ? value(current)
                        : value;
                    });
                  }}
                  t={t}
                  hideCode
                  hideStatus
                />
                <QuotaFields
                  form={editForm}
                  setForm={(value) => {
                    setEditForm((current) => {
                      if (!current) {
                        return current;
                      }
                      return typeof value === "function"
                        ? value(current)
                        : value;
                    });
                  }}
                  t={t}
                />
                <ModuleFields
                  form={editForm}
                  onToggle={(moduleCode) =>
                    setEditForm((current) =>
                      current
                        ? toggleTenantModule(current, moduleCode)
                        : current,
                    )
                  }
                  moduleLabels={moduleLabels}
                  t={t}
                />
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={savingSettings || !editForm.name.trim()}
                >
                  {savingSettings ? t("common.saving") : copy.saveSettings}
                </button>
              </WorkflowPanel>
            </form>

            <form onSubmit={handleSaveOnboarding}>
              <WorkflowPanel
                title={copy.defaultsTitle}
                description={copy.defaultsSubtitle}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.invoiceTitle")}
                    </div>
                    <input
                      value={onboardingForm.invoiceTitle}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, invoiceTitle: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.billingContactName")}
                    </div>
                    <input
                      value={onboardingForm.billingContactName}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? {
                                ...current,
                                billingContactName: event.target.value,
                              }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.billingContactEmail")}
                    </div>
                    <input
                      value={onboardingForm.billingContactEmail}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? {
                                ...current,
                                billingContactEmail: event.target.value,
                              }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.integrationMode")}
                    </div>
                    <select
                      value={onboardingForm.integrationMode}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? {
                                ...current,
                                integrationMode: event.target
                                  .value as OnboardingFormState["integrationMode"],
                              }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      {[
                        "none",
                        "api_key",
                        "api_key_and_webhook",
                        "partner_managed",
                      ].map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.sandboxBaseUrl")}
                    </div>
                    <input
                      value={onboardingForm.sandboxBaseUrl}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, sandboxBaseUrl: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.productionBaseUrl")}
                    </div>
                    <input
                      value={onboardingForm.productionBaseUrl}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? {
                                ...current,
                                productionBaseUrl: event.target.value,
                              }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.apiKeyScopes")}
                    </div>
                    <input
                      value={onboardingForm.apiKeyScopes}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, apiKeyScopes: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.webhookEvents")}
                    </div>
                    <input
                      value={onboardingForm.webhookEvents}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, webhookEvents: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.cutoverOwner")}
                    </div>
                    <input
                      value={onboardingForm.cutoverOwner}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, cutoverOwner: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.rollbackOwner")}
                    </div>
                    <input
                      value={onboardingForm.rollbackOwner}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, rollbackOwner: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.rolloutNotes")}
                    </div>
                    <textarea
                      value={onboardingForm.notes}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, notes: event.target.value }
                            : current,
                        )
                      }
                      rows={4}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                        resize: "vertical",
                      }}
                    />
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      gridColumn: "1 / -1",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={onboardingForm.rollbackPrepared}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? {
                                ...current,
                                rollbackPrepared: event.target.checked,
                              }
                            : current,
                        )
                      }
                    />
                    <span>{t("tenants.form.rollbackPrepared")}</span>
                  </label>
                </div>
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={savingOnboarding}
                >
                  {savingOnboarding ? t("common.saving") : copy.saveOnboarding}
                </button>
              </WorkflowPanel>
            </form>
          </>
        }
        side={
          <>
            <WorkflowPanel
              title={copy.rolloutTitle}
              description={copy.rolloutSubtitle}
              meta={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <StatusChip
                    label={`${locale === "en" ? "Stage" : "階段"}: ${formatPlatformCodeLabel(locale, tenant.rollout.stage)}`}
                    tone={tenantStageTone(tenant.rollout.stage)}
                  />
                  <StatusChip
                    label={`Sandbox: ${tenant.rollout.sandboxStatus}`}
                    tone={tenantStageTone(tenant.rollout.sandboxStatus)}
                  />
                  <StatusChip
                    label={`Pilot: ${tenant.rollout.pilotStatus}`}
                    tone={tenantStageTone(tenant.rollout.pilotStatus)}
                  />
                  <StatusChip
                    label={`Production: ${tenant.rollout.productionStatus}`}
                    tone={tenantStageTone(tenant.rollout.productionStatus)}
                  />
                </div>
              }
            >
              <Stepper items={rolloutSteps} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PLATFORM_TENANT_ROLLOUT_STAGES.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    disabled={promotingStage === stage}
                    onClick={() => void promoteStage(stage)}
                  >
                    {promotingStage === stage
                      ? t("common.saving")
                      : `${copy.promote} ${formatPlatformCodeLabel(locale, stage)}`}
                  </button>
                ))}
              </div>
            </WorkflowPanel>

            <WorkflowPanel
              title={copy.rolesTitle}
              description={copy.rolesSubtitle}
            >
              <div style={{ display: "grid", gap: 10 }}>
                {tenant.bootstrapDefaults.roleDefaults.map((role) => {
                  const actionId =
                    role.acknowledgedAt || role.invitedAt
                      ? `ack:${role.roleCode}`
                      : `invite:${role.roleCode}`;
                  return (
                    <div
                      key={role.roleCode}
                      style={{
                        display: "grid",
                        gap: 6,
                        padding: "12px 14px",
                        borderRadius: 14,
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <strong style={{ color: "#0f172a", fontSize: 13.5 }}>
                          {role.displayName}
                        </strong>
                        <StatusChip
                          label={
                            role.acknowledgedAt
                              ? t("tenants.role.acknowledged")
                              : role.invitedAt
                                ? t("tenants.role.invited")
                                : locale === "en"
                                  ? "Pending"
                                  : "待處理"
                          }
                          tone={
                            role.acknowledgedAt
                              ? "success"
                              : role.invitedAt
                                ? "info"
                                : role.required
                                  ? "warning"
                                  : "neutral"
                          }
                        />
                      </div>
                      <div style={{ color: "#64748b", fontSize: 12.5 }}>
                        {formatPlatformCodeLabel(locale, role.roleCode)}
                      </div>
                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        {role.acknowledgedAt ? (
                          <span style={{ fontSize: 12.5, color: "#64748b" }}>
                            {formatDateTime(role.acknowledgedAt)}
                          </span>
                        ) : role.invitedAt ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn--secondary admin-btn--sm"
                            disabled={roleAction === actionId}
                            onClick={() => void acknowledgeRole(role.roleCode)}
                          >
                            {copy.acknowledge}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-btn admin-btn--secondary admin-btn--sm"
                            disabled={roleAction === actionId}
                            onClick={() => void inviteRole(role.roleCode)}
                          >
                            {copy.invite}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </WorkflowPanel>

            <WorkflowPanel
              title={copy.lifecycleTitle}
              description={copy.lifecycleSubtitle}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <StatusChip
                  label={formatPlatformCodeLabel(locale, tenant.status)}
                  tone={tenantStatusTone(tenant.status)}
                />
                <StatusChip
                  label={
                    tenant.rollout.rollbackPrepared
                      ? locale === "en"
                        ? "Rollback prepared"
                        : "Rollback 已備妥"
                      : locale === "en"
                        ? "Rollback pending"
                        : "Rollback 待補"
                  }
                  tone={tenant.rollout.rollbackPrepared ? "success" : "warning"}
                />
              </div>
              <DetailMetadataGrid
                minColumnWidth="180px"
                items={[
                  {
                    id: "cutover",
                    label: locale === "en" ? "Cutover owner" : "Cutover owner",
                    value: tenant.rollout.cutoverOwner ?? "—",
                  },
                  {
                    id: "rollback-owner",
                    label:
                      locale === "en" ? "Rollback owner" : "Rollback owner",
                    value: tenant.rollout.rollbackOwner ?? "—",
                  },
                ]}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tenant.status === "active" ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    disabled={lifecycleAction === "suspend"}
                    onClick={() => void runLifecycle("suspend")}
                  >
                    {copy.suspend}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    disabled={lifecycleAction === "activate"}
                    onClick={() => void runLifecycle("activate")}
                  >
                    {copy.activate}
                  </button>
                )}
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  disabled={lifecycleAction === "rollback_hold"}
                  onClick={() => void runLifecycle("rollback_hold")}
                >
                  {copy.rollback}
                </button>
              </div>
            </WorkflowPanel>
          </>
        }
      />
    </div>
  );
}
