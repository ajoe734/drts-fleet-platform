/**
 * Tenant onboarding console with bootstrap defaults, integration package,
 * and rollout-gate tracking.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  CreatePlatformTenantCommand,
  PlatformAdminTenantRecord,
  PlatformTenantIntegrationMode,
  PlatformTenantModule,
  PlatformTenantRolloutStage,
  UpdatePlatformTenantOnboardingCommand,
  UpdatePlatformTenantSettingsCommand,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_INTEGRATION_MODES,
  PLATFORM_TENANT_MODULES,
  PLATFORM_TENANT_ROLLOUT_STAGES,
} from "@drts/contracts";

type TFn = (key: string, params?: Record<string, string | number>) => string;

type TenantFormState = {
  name: string;
  code: string;
  status: "active" | "inactive";
  activeDrivers: string;
  monthlyBookings: string;
  monthlyApiCalls: string;
  enabledModules: PlatformTenantModule[];
  integrationMode: PlatformTenantIntegrationMode;
  bootstrapAdminEmail: string;
  sandboxBaseUrl: string;
};

type OnboardingFormState = {
  invoiceTitle: string;
  billingContactName: string;
  billingContactEmail: string;
  integrationMode: PlatformTenantIntegrationMode;
  sandboxBaseUrl: string;
  productionBaseUrl: string;
  apiKeyScopes: string;
  webhookEvents: string;
  cutoverOwner: string;
  rollbackOwner: string;
  notes: string;
  rollbackPrepared: boolean;
};

const EMPTY_FORM: TenantFormState = {
  name: "",
  code: "",
  status: "active",
  activeDrivers: "25",
  monthlyBookings: "500",
  monthlyApiCalls: "10000",
  enabledModules: ["enterprise_dispatch"],
  integrationMode: "none",
  bootstrapAdminEmail: "",
  sandboxBaseUrl: "",
};

function toSettingsFormState(
  tenant: PlatformAdminTenantRecord,
): TenantFormState {
  return {
    name: tenant.name,
    code: tenant.code,
    status: tenant.status === "paused" ? "inactive" : "active",
    activeDrivers: String(tenant.quotas.activeDrivers),
    monthlyBookings: String(tenant.quotas.monthlyBookings),
    monthlyApiCalls: String(tenant.quotas.monthlyApiCalls),
    enabledModules: [...tenant.enabledModules],
    integrationMode: tenant.integrationPackage.mode,
    bootstrapAdminEmail: tenant.bootstrapDefaults.billingBaseline.email,
    sandboxBaseUrl: tenant.integrationPackage.sandboxBaseUrl ?? "",
  };
}

function toOnboardingFormState(
  tenant: PlatformAdminTenantRecord,
): OnboardingFormState {
  return {
    invoiceTitle: tenant.bootstrapDefaults.billingBaseline.invoiceTitle,
    billingContactName: tenant.bootstrapDefaults.billingBaseline.contactName,
    billingContactEmail: tenant.bootstrapDefaults.billingBaseline.email,
    integrationMode: tenant.integrationPackage.mode,
    sandboxBaseUrl: tenant.integrationPackage.sandboxBaseUrl ?? "",
    productionBaseUrl: tenant.integrationPackage.productionBaseUrl ?? "",
    apiKeyScopes: tenant.integrationPackage.apiKeyScopes.join(", "),
    webhookEvents: tenant.bootstrapDefaults.webhookEvents.join(", "),
    cutoverOwner: tenant.rollout.cutoverOwner ?? "",
    rollbackOwner: tenant.rollout.rollbackOwner ?? "",
    notes: tenant.rollout.notes ?? "",
    rollbackPrepared: tenant.rollout.rollbackPrepared,
  };
}

function parseQuota(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function parseCsv(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function badgeTone(status: string): string {
  if (status === "active" || status === "production" || status === "approved") {
    return "admin-badge--success";
  }
  if (
    status === "paused" ||
    status === "blocked" ||
    status === "rollback_hold"
  ) {
    return "admin-badge--danger";
  }
  if (status === "pilot" || status === "ready") {
    return "admin-badge--info";
  }
  return "admin-badge--neutral";
}

export default function TenantsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<TenantFormState>(EMPTY_FORM);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TenantFormState>(EMPTY_FORM);
  const [onboardingForm, setOnboardingForm] =
    useState<OnboardingFormState | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [promotingStage, setPromotingStage] =
    useState<PlatformTenantRolloutStage | null>(null);

  const moduleLabels: Record<PlatformTenantModule, string> = {
    enterprise_dispatch: t("tenants.module.enterpriseDispatch"),
    billing: t("tenants.module.billing"),
    reporting: t("tenants.module.reporting"),
    webhooks: t("tenants.module.webhooks"),
  };

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? null,
    [selectedTenantId, tenants],
  );

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformTenants();
      setTenants(result || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    if (!selectedTenant) {
      setOnboardingForm(null);
      return;
    }
    setEditForm(toSettingsFormState(selectedTenant));
    setOnboardingForm(toOnboardingFormState(selectedTenant));
  }, [selectedTenant]);

  const toggleModule = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<TenantFormState>>,
      moduleCode: PlatformTenantModule,
    ) => {
      setter((current) => {
        const enabled = current.enabledModules.includes(moduleCode);
        const nextModules = enabled
          ? current.enabledModules.filter((module) => module !== moduleCode)
          : [...current.enabledModules, moduleCode];
        return {
          ...current,
          enabledModules:
            nextModules.length > 0 ? nextModules : ["enterprise_dispatch"],
        };
      });
    },
    [],
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
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      await loadTenants();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTenant) return;
    setSaving(true);
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
      await client.updatePlatformTenantSettings(selectedTenant.id, command);
      await loadTenants();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOnboarding = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTenant || !onboardingForm) return;
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
      await client.updatePlatformTenantOnboarding(selectedTenant.id, command);
      await loadTenants();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSavingOnboarding(false);
    }
  };

  const runTenantAction = useCallback(
    async (
      tenantId: string,
      action: "activate" | "suspend" | "rollback_hold",
    ) => {
      try {
        setError(null);
        if (action === "activate") {
          await client.activateTenant(tenantId);
        } else if (action === "rollback_hold") {
          await client.rollbackHoldTenant(tenantId);
        } else {
          await client.suspendTenant(tenantId);
        }
        await loadTenants();
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    },
    [client, loadTenants],
  );

  const inviteRole = useCallback(
    async (tenantId: string, roleCode: string) => {
      try {
        setError(null);
        await client.inviteTenantRole(tenantId, { roleCode });
        await loadTenants();
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    },
    [client, loadTenants],
  );

  const acknowledgeRole = useCallback(
    async (tenantId: string, roleCode: string) => {
      try {
        setError(null);
        await client.acknowledgeTenantRole(tenantId, { roleCode });
        await loadTenants();
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    },
    [client, loadTenants],
  );

  const promoteStage = useCallback(
    async (tenantId: string, stage: PlatformTenantRolloutStage) => {
      setPromotingStage(stage);
      setError(null);
      try {
        await client.setPlatformTenantRolloutStage(tenantId, {
          stage,
        });
        await loadTenants();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setPromotingStage(null);
      }
    },
    [client, loadTenants],
  );

  if (loading) return <div className="admin-empty">{t("tenants.loading")}</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("tenants.title")}</h1>
        <p>{t("tenants.subtitle", { count: tenants.length })}</p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
          </p>
        </div>
      )}

      <div className="admin-toolbar">
        <button
          className="admin-btn admin-btn--primary"
          onClick={() => setShowCreate((current) => !current)}
        >
          {showCreate ? t("common.cancel") : t("tenants.newTenant")}
        </button>
        <button
          className="admin-btn admin-btn--secondary"
          onClick={() => void loadTenants()}
        >
          {t("common.refresh")}
        </button>
      </div>

      {showCreate && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            {t("tenants.createTenant")}
          </h3>
          <form onSubmit={handleCreate}>
            <TenantIdentityFields
              form={createForm}
              setForm={setCreateForm}
              t={t}
            />
            <QuotaFields form={createForm} setForm={setCreateForm} t={t} />
            <ModuleFields
              form={createForm}
              onToggle={(moduleCode) => toggleModule(setCreateForm, moduleCode)}
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
              className="admin-btn admin-btn--primary"
              disabled={
                creating || !createForm.name.trim() || !createForm.code.trim()
              }
            >
              {creating ? t("common.creating") : t("tenants.createTenant")}
            </button>
          </form>
        </div>
      )}

      {selectedTenant && onboardingForm && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>
                {t("tenants.configure")} {selectedTenant.name}
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
                {getPlatformLabel(locale, "code")}:{" "}
                <code>{selectedTenant.code}</code>
              </p>
            </div>
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => setSelectedTenantId(null)}
              type="button"
            >
              {t("common.close")}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            <form
              onSubmit={handleSaveSettings}
              className="admin-card"
              style={nestedCardStyle}
            >
              <h4 style={sectionTitleStyle}>{t("tenants.section.settings")}</h4>
              <TenantIdentityFields
                form={editForm}
                setForm={setEditForm}
                t={t}
                hideCode
              />
              <QuotaFields form={editForm} setForm={setEditForm} t={t} />
              <ModuleFields
                form={editForm}
                onToggle={(moduleCode) => toggleModule(setEditForm, moduleCode)}
                moduleLabels={moduleLabels}
                t={t}
              />
              <button
                type="submit"
                className="admin-btn admin-btn--primary"
                disabled={saving || !editForm.name.trim()}
              >
                {saving ? t("common.saving") : t("tenants.saveSettings")}
              </button>
            </form>

            <div className="admin-card" style={nestedCardStyle}>
              <h4 style={sectionTitleStyle}>{t("tenants.section.rollout")}</h4>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                <StatusBadge
                  label={`${t("tenants.rollout.stage")}: ${formatPlatformCodeLabel(locale, selectedTenant.rollout.stage)}`}
                  tone={badgeTone(selectedTenant.rollout.stage)}
                />
                <StatusBadge
                  label={`Sandbox: ${selectedTenant.rollout.sandboxStatus}`}
                  tone={badgeTone(selectedTenant.rollout.sandboxStatus)}
                />
                <StatusBadge
                  label={`Pilot: ${selectedTenant.rollout.pilotStatus}`}
                  tone={badgeTone(selectedTenant.rollout.pilotStatus)}
                />
                <StatusBadge
                  label={`Production: ${selectedTenant.rollout.productionStatus}`}
                  tone={badgeTone(selectedTenant.rollout.productionStatus)}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                {PLATFORM_TENANT_ROLLOUT_STAGES.map((stage) => (
                  <button
                    key={stage}
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    type="button"
                    disabled={promotingStage === stage}
                    onClick={() => void promoteStage(selectedTenant.id, stage)}
                  >
                    {promotingStage === stage
                      ? t("common.saving")
                      : `${t("tenants.promote")} ${formatPlatformCodeLabel(locale, stage)}`}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {t("tenants.lastPromoted")}:{" "}
                {selectedTenant.rollout.lastPromotedAt
                  ? new Date(
                      selectedTenant.rollout.lastPromotedAt,
                    ).toLocaleString()
                  : "—"}
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: "#6b7280" }}>
                {t("tenants.section.cutover")}:
                <div>{selectedTenant.rollout.cutoverOwner ?? "—"}</div>
                <div>
                  {t("tenants.section.rollback")}:{" "}
                  {selectedTenant.rollout.rollbackOwner ?? "—"}
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSaveOnboarding}
            className="admin-card"
            style={{ ...nestedCardStyle, marginTop: 16 }}
          >
            <h4 style={sectionTitleStyle}>{t("tenants.section.onboarding")}</h4>
            <div style={twoColumnGridStyle}>
              <label>
                <div style={labelStyle}>{t("tenants.form.invoiceTitle")}</div>
                <input
                  value={onboardingForm.invoiceTitle}
                  onChange={(event) =>
                    setOnboardingForm((current) =>
                      current
                        ? { ...current, invoiceTitle: event.target.value }
                        : current,
                    )
                  }
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={labelStyle}>
                  {t("tenants.form.billingContactName")}
                </div>
                <input
                  value={onboardingForm.billingContactName}
                  onChange={(event) =>
                    setOnboardingForm((current) =>
                      current
                        ? { ...current, billingContactName: event.target.value }
                        : current,
                    )
                  }
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={labelStyle}>
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
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={labelStyle}>
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
                              .value as PlatformTenantIntegrationMode,
                          }
                        : current,
                    )
                  }
                  style={inputStyle}
                >
                  {PLATFORM_TENANT_INTEGRATION_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {formatPlatformCodeLabel(locale, mode)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <div style={labelStyle}>{t("tenants.form.sandboxBaseUrl")}</div>
                <input
                  value={onboardingForm.sandboxBaseUrl}
                  onChange={(event) =>
                    setOnboardingForm((current) =>
                      current
                        ? { ...current, sandboxBaseUrl: event.target.value }
                        : current,
                    )
                  }
                  placeholder="https://sandbox.acme.example"
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={labelStyle}>
                  {t("tenants.form.productionBaseUrl")}
                </div>
                <input
                  value={onboardingForm.productionBaseUrl}
                  onChange={(event) =>
                    setOnboardingForm((current) =>
                      current
                        ? { ...current, productionBaseUrl: event.target.value }
                        : current,
                    )
                  }
                  placeholder="https://api.acme.example"
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={labelStyle}>{t("tenants.form.apiKeyScopes")}</div>
                <input
                  value={onboardingForm.apiKeyScopes}
                  onChange={(event) =>
                    setOnboardingForm((current) =>
                      current
                        ? { ...current, apiKeyScopes: event.target.value }
                        : current,
                    )
                  }
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={labelStyle}>{t("tenants.form.webhookEvents")}</div>
                <input
                  value={onboardingForm.webhookEvents}
                  onChange={(event) =>
                    setOnboardingForm((current) =>
                      current
                        ? { ...current, webhookEvents: event.target.value }
                        : current,
                    )
                  }
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={labelStyle}>{t("tenants.form.cutoverOwner")}</div>
                <input
                  value={onboardingForm.cutoverOwner}
                  onChange={(event) =>
                    setOnboardingForm((current) =>
                      current
                        ? { ...current, cutoverOwner: event.target.value }
                        : current,
                    )
                  }
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={labelStyle}>{t("tenants.form.rollbackOwner")}</div>
                <input
                  value={onboardingForm.rollbackOwner}
                  onChange={(event) =>
                    setOnboardingForm((current) =>
                      current
                        ? { ...current, rollbackOwner: event.target.value }
                        : current,
                    )
                  }
                  style={inputStyle}
                />
              </label>
            </div>
            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={labelStyle}>{t("tenants.form.rolloutNotes")}</div>
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
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <input
                type="checkbox"
                checked={onboardingForm.rollbackPrepared}
                onChange={(event) =>
                  setOnboardingForm((current) =>
                    current
                      ? { ...current, rollbackPrepared: event.target.checked }
                      : current,
                  )
                }
              />
              <span>{t("tenants.form.rollbackPrepared")}</span>
            </label>

            <div style={{ marginBottom: 16 }}>
              <h5 style={{ margin: "0 0 8px", fontSize: 13 }}>
                {t("tenants.defaultRoles")}
              </h5>
              <div style={{ display: "grid", gap: 8 }}>
                {selectedTenant.bootstrapDefaults.roleDefaults.map((role) => (
                  <div
                    key={role.roleCode}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      {role.displayName}
                      {role.required ? (
                        <span style={{ color: "#dc2626", marginLeft: 4 }}>
                          *
                        </span>
                      ) : null}
                    </span>
                    {role.acknowledgedAt ? (
                      <StatusBadge
                        label={t("tenants.role.acknowledged")}
                        tone="admin-badge--success"
                      />
                    ) : role.invitedAt ? (
                      <>
                        <StatusBadge
                          label={t("tenants.role.invited")}
                          tone="admin-badge--info"
                        />
                        <button
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          type="button"
                          onClick={() =>
                            void acknowledgeRole(
                              selectedTenant.id,
                              role.roleCode,
                            )
                          }
                        >
                          {t("tenants.role.acknowledge")}
                        </button>
                      </>
                    ) : (
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        type="button"
                        onClick={() =>
                          void inviteRole(selectedTenant.id, role.roleCode)
                        }
                      >
                        {t("tenants.role.invite")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h5 style={{ margin: "0 0 8px", fontSize: 13 }}>
                {t("tenants.defaultNotifications")}
              </h5>
              <div style={{ display: "grid", gap: 6 }}>
                {selectedTenant.bootstrapDefaults.notificationSubscriptions.map(
                  (subscription) => (
                    <div
                      key={`${subscription.eventType}-${subscription.channel}`}
                      style={smallMutedStyle}
                    >
                      {subscription.eventType} → {subscription.channel} ·{" "}
                      {subscription.enabled
                        ? t("common.active")
                        : t("common.inactive")}
                    </div>
                  ),
                )}
              </div>
            </div>

            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={savingOnboarding}
            >
              {savingOnboarding
                ? t("common.saving")
                : t("tenants.saveOnboarding")}
            </button>
          </form>
        </div>
      )}

      {tenants.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>{t("tenants.empty")}</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("tenants.col.id")}</th>
                <th>{t("tenants.col.name")}</th>
                <th>{t("tenants.col.code")}</th>
                <th>{t("tenants.col.modules")}</th>
                <th>{t("tenants.col.quotas")}</th>
                <th>{t("tenants.col.rollout")}</th>
                <th>{t("tenants.col.status")}</th>
                <th>{t("tenants.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {tenant.id}
                  </td>
                  <td>{tenant.name}</td>
                  <td>
                    <code>{tenant.code}</code>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {tenant.enabledModules.map((moduleCode) => (
                      <span
                        key={moduleCode}
                        className="admin-badge admin-badge--info"
                        style={{ marginRight: 4, marginBottom: 4 }}
                      >
                        {moduleLabels[moduleCode]}
                      </span>
                    ))}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div>
                      {t("tenants.quota.drivers")} {tenant.quotas.activeDrivers}
                    </div>
                    <div>
                      {t("tenants.quota.bookings")}{" "}
                      {tenant.quotas.monthlyBookings}
                    </div>
                    <div>
                      {t("tenants.quota.apiCalls")}{" "}
                      {tenant.quotas.monthlyApiCalls}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div>
                      <strong>
                        {formatPlatformCodeLabel(locale, tenant.rollout.stage)}
                      </strong>
                    </div>
                    <div>
                      {formatPlatformCodeLabel(
                        locale,
                        tenant.integrationPackage.mode,
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`admin-badge ${badgeTone(tenant.status)}`}>
                      {formatPlatformCodeLabel(locale, tenant.status)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => setSelectedTenantId(tenant.id)}
                        type="button"
                      >
                        {t("tenants.configure")}
                      </button>
                      {tenant.status !== "active" && (
                        <button
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          onClick={() =>
                            void runTenantAction(tenant.id, "activate")
                          }
                          type="button"
                        >
                          {t("tenants.activate")}
                        </button>
                      )}
                      {tenant.status === "active" && (
                        <>
                          <button
                            className="admin-btn admin-btn--secondary admin-btn--sm"
                            onClick={() =>
                              void runTenantAction(tenant.id, "suspend")
                            }
                            type="button"
                          >
                            {t("tenants.suspend")}
                          </button>
                          <button
                            className="admin-btn admin-btn--secondary admin-btn--sm"
                            onClick={() =>
                              void runTenantAction(tenant.id, "rollback_hold")
                            }
                            type="button"
                            style={{ color: "#dc2626" }}
                          >
                            {t("tenants.rollbackHold")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TenantIdentityFields({
  form,
  setForm,
  t,
  hideCode = false,
}: {
  form: TenantFormState;
  setForm: React.Dispatch<React.SetStateAction<TenantFormState>>;
  t: TFn;
  hideCode?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <label>
        <div style={labelStyle}>{t("tenants.form.name")}</div>
        <input
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
          required
          placeholder="Acme Mobility"
          style={inputStyle}
        />
      </label>
      {!hideCode && (
        <label>
          <div style={labelStyle}>{t("tenants.form.code")}</div>
          <input
            value={form.code}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                code: event.target.value,
              }))
            }
            required
            placeholder="acme_dispatch"
            style={inputStyle}
          />
        </label>
      )}
      <label>
        <div style={labelStyle}>{t("tenants.form.status")}</div>
        <select
          value={form.status}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              status: event.target.value as "active" | "inactive",
            }))
          }
          style={inputStyle}
        >
          <option value="active">{t("common.active")}</option>
          <option value="inactive">{t("common.inactive")}</option>
        </select>
      </label>
    </div>
  );
}

function QuotaFields({
  form,
  setForm,
  t,
}: {
  form: TenantFormState;
  setForm: React.Dispatch<React.SetStateAction<TenantFormState>>;
  t: TFn;
}) {
  const quotaFields: Array<{
    key: "activeDrivers" | "monthlyBookings" | "monthlyApiCalls";
    labelKey: string;
  }> = [
    { key: "activeDrivers", labelKey: "tenants.form.activeDrivers" },
    { key: "monthlyBookings", labelKey: "tenants.form.monthlyBookings" },
    { key: "monthlyApiCalls", labelKey: "tenants.form.monthlyApiCalls" },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>
        {t("tenants.quotaAllocation")}
      </h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        {quotaFields.map((field) => (
          <label key={field.key}>
            <div style={labelStyle}>{t(field.labelKey)}</div>
            <input
              type="number"
              min={0}
              value={form[field.key]}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
              style={inputStyle}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function ModuleFields({
  form,
  onToggle,
  moduleLabels,
  t,
}: {
  form: TenantFormState;
  onToggle: (moduleCode: PlatformTenantModule) => void;
  moduleLabels: Record<PlatformTenantModule, string>;
  t: TFn;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>
        {t("tenants.form.modules")}
      </h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 8,
        }}
      >
        {PLATFORM_TENANT_MODULES.map((moduleCode) => (
          <label
            key={moduleCode}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
            }}
          >
            <input
              type="checkbox"
              checked={form.enabledModules.includes(moduleCode)}
              onChange={() => onToggle(moduleCode)}
            />
            <span>{moduleLabels[moduleCode]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function IntegrationFields({
  form,
  setForm,
  t,
}: {
  form: TenantFormState;
  setForm: React.Dispatch<React.SetStateAction<TenantFormState>>;
  t: TFn;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>
        {t("tenants.section.onboarding")}
      </h4>
      <div style={twoColumnGridStyle}>
        <label>
          <div style={labelStyle}>{t("tenants.form.integrationMode")}</div>
          <select
            value={form.integrationMode}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                integrationMode: event.target
                  .value as PlatformTenantIntegrationMode,
              }))
            }
            style={inputStyle}
          >
            {PLATFORM_TENANT_INTEGRATION_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <label>
          <div style={labelStyle}>{t("tenants.form.bootstrapAdminEmail")}</div>
          <input
            value={form.bootstrapAdminEmail}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                bootstrapAdminEmail: event.target.value,
              }))
            }
            placeholder="admin@acme.example"
            style={inputStyle}
          />
        </label>
        <label>
          <div style={labelStyle}>{t("tenants.form.sandboxBaseUrl")}</div>
          <input
            value={form.sandboxBaseUrl}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sandboxBaseUrl: event.target.value,
              }))
            }
            placeholder="https://sandbox.acme.example"
            style={inputStyle}
          />
        </label>
      </div>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`admin-badge ${tone}`}>{label}</span>;
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
};

const nestedCardStyle: React.CSSProperties = {
  border: "1px solid #eef2f7",
  borderRadius: 14,
  padding: 16,
};

const twoColumnGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 15,
};

const smallMutedStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
};
