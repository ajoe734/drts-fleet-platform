"use client";

import React from "react";
import type {
  PlatformAdminTenantRecord,
  PlatformTenantGateStatus,
  PlatformTenantIntegrationMode,
  PlatformTenantModule,
  PlatformTenantRolloutStage,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_INTEGRATION_MODES,
  PLATFORM_TENANT_MODULES,
} from "@drts/contracts";
import {
  formGridStyle,
  formInputStyle,
  formLabelStyle,
  formSectionTitleStyle,
} from "@/components/governance-form-styles";

type TFn = (key: string, params?: Record<string, string | number>) => string;

export type TenantFormState = {
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

export type OnboardingFormState = {
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

export const EMPTY_TENANT_FORM: TenantFormState = {
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

export const EMPTY_ONBOARDING_FORM: OnboardingFormState = {
  invoiceTitle: "",
  billingContactName: "",
  billingContactEmail: "",
  integrationMode: "none",
  sandboxBaseUrl: "",
  productionBaseUrl: "",
  apiKeyScopes: "",
  webhookEvents: "",
  cutoverOwner: "",
  rollbackOwner: "",
  notes: "",
  rollbackPrepared: false,
};

export function createTenantModuleLabels(
  t: TFn,
): Record<PlatformTenantModule, string> {
  return {
    enterprise_dispatch: t("tenants.module.enterpriseDispatch"),
    billing: t("tenants.module.billing"),
    reporting: t("tenants.module.reporting"),
    webhooks: t("tenants.module.webhooks"),
  };
}

export function toTenantSettingsFormState(
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

export function toTenantOnboardingFormState(
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

export function parseQuota(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export function parseCsv(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function toggleTenantModule(
  current: TenantFormState,
  moduleCode: PlatformTenantModule,
): TenantFormState {
  const enabled = current.enabledModules.includes(moduleCode);
  const nextModules = enabled
    ? current.enabledModules.filter((module) => module !== moduleCode)
    : [...current.enabledModules, moduleCode];

  return {
    ...current,
    enabledModules:
      nextModules.length > 0 ? nextModules : ["enterprise_dispatch"],
  };
}

export function tenantStatusTone(
  status: PlatformAdminTenantRecord["status"],
): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "active":
      return "success";
    case "rollback_hold":
      return "danger";
    case "draft":
      return "warning";
    case "paused":
    default:
      return "neutral";
  }
}

export function tenantStageTone(
  stage: PlatformTenantRolloutStage | PlatformTenantGateStatus,
): "neutral" | "success" | "warning" | "danger" | "info" {
  if (stage === "production" || stage === "approved") {
    return "success";
  }
  if (stage === "pilot" || stage === "ready") {
    return "info";
  }
  if (stage === "sandbox" || stage === "pending") {
    return "warning";
  }
  if (stage === "blocked") {
    return "danger";
  }
  return "neutral";
}

export function TenantIdentityFields({
  form,
  setForm,
  t,
  hideCode = false,
  hideStatus = false,
}: {
  form: TenantFormState;
  setForm: React.Dispatch<React.SetStateAction<TenantFormState>>;
  t: TFn;
  hideCode?: boolean;
  hideStatus?: boolean;
}) {
  return (
    <div style={{ ...formGridStyle, marginBottom: 16 }}>
      <label>
        <div style={formLabelStyle}>{t("tenants.form.name")}</div>
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
          style={formInputStyle}
        />
      </label>
      {!hideCode ? (
        <label>
          <div style={formLabelStyle}>{t("tenants.form.code")}</div>
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
            style={formInputStyle}
          />
        </label>
      ) : null}
      {!hideStatus ? (
        <label>
          <div style={formLabelStyle}>{t("tenants.form.status")}</div>
          <select
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                status: event.target.value as "active" | "inactive",
              }))
            }
            style={formInputStyle}
          >
            <option value="active">{t("common.active")}</option>
            <option value="inactive">{t("common.inactive")}</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

export function QuotaFields({
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
      <h4 style={formSectionTitleStyle}>{t("tenants.quotaAllocation")}</h4>
      <div
        style={{
          ...formGridStyle,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        {quotaFields.map((field) => (
          <label key={field.key}>
            <div style={formLabelStyle}>{t(field.labelKey)}</div>
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
              style={formInputStyle}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function ModuleFields({
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
      <h4 style={formSectionTitleStyle}>{t("tenants.form.modules")}</h4>
      <div style={formGridStyle}>
        {PLATFORM_TENANT_MODULES.map((moduleCode) => (
          <label
            key={moduleCode}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              border: "1px solid #dbe4ee",
              borderRadius: 12,
              background: "#f8fafc",
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

export function IntegrationFields({
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
      <h4 style={formSectionTitleStyle}>{t("tenants.section.onboarding")}</h4>
      <div style={formGridStyle}>
        <label>
          <div style={formLabelStyle}>{t("tenants.form.integrationMode")}</div>
          <select
            value={form.integrationMode}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                integrationMode: event.target
                  .value as PlatformTenantIntegrationMode,
              }))
            }
            style={formInputStyle}
          >
            {PLATFORM_TENANT_INTEGRATION_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <label>
          <div style={formLabelStyle}>
            {t("tenants.form.bootstrapAdminEmail")}
          </div>
          <input
            value={form.bootstrapAdminEmail}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                bootstrapAdminEmail: event.target.value,
              }))
            }
            placeholder="admin@acme.example"
            style={formInputStyle}
          />
        </label>
        <label>
          <div style={formLabelStyle}>{t("tenants.form.sandboxBaseUrl")}</div>
          <input
            value={form.sandboxBaseUrl}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sandboxBaseUrl: event.target.value,
              }))
            }
            placeholder="https://sandbox.acme.example"
            style={formInputStyle}
          />
        </label>
      </div>
    </div>
  );
}
