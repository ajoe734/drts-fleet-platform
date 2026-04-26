/**
 * Tenants Management Page
 * Platform tenant lifecycle, quotas, and enabled module configuration.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  CreatePlatformTenantCommand,
  PlatformAdminTenantRecord,
  PlatformTenantModule,
  UpdatePlatformTenantSettingsCommand,
} from "@drts/contracts";
import { PLATFORM_TENANT_MODULES } from "@drts/contracts";

type TenantFormState = {
  name: string;
  code: string;
  status: "active" | "inactive";
  activeDrivers: string;
  monthlyBookings: string;
  monthlyApiCalls: string;
  enabledModules: PlatformTenantModule[];
};

const EMPTY_FORM: TenantFormState = {
  name: "",
  code: "",
  status: "active",
  activeDrivers: "25",
  monthlyBookings: "500",
  monthlyApiCalls: "10000",
  enabledModules: ["enterprise_dispatch"],
};

function toFormState(tenant: PlatformAdminTenantRecord): TenantFormState {
  return {
    name: tenant.name,
    code: tenant.code,
    status: tenant.status === "paused" ? "inactive" : "active",
    activeDrivers: String(tenant.quotas.activeDrivers),
    monthlyBookings: String(tenant.quotas.monthlyBookings),
    monthlyApiCalls: String(tenant.quotas.monthlyApiCalls),
    enabledModules: [...tenant.enabledModules],
  };
}

function parseQuota(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export default function TenantsPage() {
  const { locale, t } = useTranslation();
  const client = usePlatformAdminClient();
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<TenantFormState>(EMPTY_FORM);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TenantFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

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
    if (selectedTenant) {
      setEditForm(toFormState(selectedTenant));
    }
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

  const runTenantAction = useCallback(
    async (tenantId: string, action: "activate" | "suspend") => {
      try {
        setError(null);
        if (action === "activate") {
          await client.activateTenant(tenantId);
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

  const moduleLabels =
    locale === "zh"
      ? {
          enterprise_dispatch: "企業派車",
          billing: "帳務",
          reporting: "報表",
          webhooks: "Webhook",
        }
      : {
          enterprise_dispatch: "Enterprise Dispatch",
          billing: "Billing",
          reporting: "Reporting",
          webhooks: "Webhooks",
        };

  const copy =
    locale === "zh"
      ? {
          description: "管理租戶生命週期、模組授權與平台配額。",
          errorLabel: "錯誤",
          title: "租戶",
          newTenant: "新增租戶",
          createTitle: "建立租戶",
          empty: "找不到租戶，請先建立一個租戶。",
          id: "ID",
          name: "名稱",
          code: "代碼",
          actions: "操作",
          drivers: "司機",
          bookings: "訂單",
          apiCalls: "API 呼叫",
          configure: "設定",
          activate: "啟用",
          suspend: "停用",
          configureTitle: `設定 ${selectedTenant?.name ?? ""}`,
          codeLabel: "代碼",
          quotaTitle: "配額配置",
          modulesTitle: "啟用模組",
          statusActive: "啟用中",
          statusInactive: "已停用",
        }
      : {
          description:
            "Manage tenant lifecycle, contract modules, and platform quota allocations.",
          errorLabel: "Error",
          title: "Tenants",
          newTenant: "New Tenant",
          createTitle: "Create Tenant",
          empty: "No tenants found. Create one to get started.",
          id: "ID",
          name: "Name",
          code: "Code",
          actions: "Actions",
          drivers: "Drivers",
          bookings: "Bookings",
          apiCalls: "API Calls",
          configure: "Configure",
          activate: "Activate",
          suspend: "Suspend",
          configureTitle: `Configure ${selectedTenant?.name ?? ""}`,
          codeLabel: "Code",
          quotaTitle: "Quota Allocation",
          modulesTitle: "Enabled Modules",
          statusActive: "Active",
          statusInactive: "Inactive",
        };

  if (loading) return <div className="admin-empty">{t("tenants.loading")}</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {copy.errorLabel}: {error}
          </p>
        </div>
      )}

      <div className="admin-toolbar">
        <button
          className="admin-btn admin-btn--primary"
          onClick={() => setShowCreate((current) => !current)}
        >
          {showCreate ? t("common.cancel") : copy.newTenant}
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
            {copy.createTitle}
          </h3>
          <form onSubmit={handleCreate}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <label>
                <span className="sr-only">
                  {locale === "zh" ? "租戶名稱" : "Tenant Name"}
                </span>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  {copy.name}
                </div>
                <input
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                  placeholder={
                    locale === "zh" ? "示例企業車隊" : "Acme Mobility"
                  }
                  style={inputStyle}
                />
              </label>
              <label>
                <span className="sr-only">
                  {locale === "zh" ? "租戶代碼" : "Tenant Code"}
                </span>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  {copy.code}
                </div>
                <input
                  value={createForm.code}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                  required
                  placeholder={
                    locale === "zh" ? "example_dispatch" : "acme_dispatch"
                  }
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  {t("tenants.form.status")}
                </div>
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
                  <option value="active">{copy.statusActive}</option>
                  <option value="inactive">{copy.statusInactive}</option>
                </select>
              </label>
            </div>

            <QuotaFields
              form={createForm}
              setForm={setCreateForm}
              title={copy.quotaTitle}
              labels={{
                activeDrivers: t("tenants.form.activeDrivers"),
                monthlyBookings: t("tenants.form.monthlyBookings"),
                monthlyApiCalls: t("tenants.form.monthlyApiCalls"),
              }}
            />
            <ModuleFields
              form={createForm}
              onToggle={(moduleCode) => toggleModule(setCreateForm, moduleCode)}
              title={copy.modulesTitle}
              moduleLabels={moduleLabels}
            />

            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={
                creating || !createForm.name.trim() || !createForm.code.trim()
              }
            >
              {creating ? t("common.creating") : copy.createTitle}
            </button>
          </form>
        </div>
      )}

      {selectedTenant && (
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
              <h3 style={{ margin: 0, fontSize: 16 }}>{copy.configureTitle}</h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
                {copy.codeLabel}: <code>{selectedTenant.code}</code>
              </p>
            </div>
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => setSelectedTenantId(null)}
              type="button"
            >
              {t("common.cancel")}
            </button>
          </div>

          <form onSubmit={handleSaveSettings}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <label>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  {copy.name}
                </div>
                <input
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  {t("tenants.form.status")}
                </div>
                <input
                  value={selectedTenant.status}
                  disabled
                  style={inputStyle}
                />
              </label>
            </div>

            <QuotaFields
              form={editForm}
              setForm={setEditForm}
              title={copy.quotaTitle}
              labels={{
                activeDrivers: t("tenants.form.activeDrivers"),
                monthlyBookings: t("tenants.form.monthlyBookings"),
                monthlyApiCalls: t("tenants.form.monthlyApiCalls"),
              }}
            />
            <ModuleFields
              form={editForm}
              onToggle={(moduleCode) => toggleModule(setEditForm, moduleCode)}
              title={copy.modulesTitle}
              moduleLabels={moduleLabels}
            />

            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={saving || !editForm.name.trim()}
            >
              {saving ? t("common.saving") : t("tenants.saveSettings")}
            </button>
          </form>
        </div>
      )}

      {tenants.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>{copy.empty}</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{copy.id}</th>
                <th>{copy.name}</th>
                <th>{copy.code}</th>
                <th>{t("tenants.col.modules")}</th>
                <th>{t("tenants.col.quotas")}</th>
                <th>{t("tenants.col.status")}</th>
                <th>{copy.actions}</th>
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
                      {copy.drivers}: {tenant.quotas.activeDrivers}
                    </div>
                    <div>
                      {copy.bookings}: {tenant.quotas.monthlyBookings}
                    </div>
                    <div>
                      {copy.apiCalls}: {tenant.quotas.monthlyApiCalls}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${
                        tenant.status === "active"
                          ? "admin-badge--success"
                          : tenant.status === "paused"
                            ? "admin-badge--danger"
                            : "admin-badge--neutral"
                      }`}
                    >
                      {tenant.status === "active"
                        ? copy.statusActive
                        : tenant.status === "paused"
                          ? copy.statusInactive
                          : tenant.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => setSelectedTenantId(tenant.id)}
                        type="button"
                      >
                        {copy.configure}
                      </button>
                      {tenant.status !== "active" && (
                        <button
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          onClick={() =>
                            void runTenantAction(tenant.id, "activate")
                          }
                          type="button"
                        >
                          {copy.activate}
                        </button>
                      )}
                      {tenant.status === "active" && (
                        <button
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          onClick={() =>
                            void runTenantAction(tenant.id, "suspend")
                          }
                          type="button"
                        >
                          {copy.suspend}
                        </button>
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

function QuotaFields({
  form,
  setForm,
  title,
  labels,
}: {
  form: TenantFormState;
  setForm: React.Dispatch<React.SetStateAction<TenantFormState>>;
  title: string;
  labels: Record<
    "activeDrivers" | "monthlyBookings" | "monthlyApiCalls",
    string
  >;
}) {
  const quotaFields: Array<{
    key: "activeDrivers" | "monthlyBookings" | "monthlyApiCalls";
  }> = [
    { key: "activeDrivers" },
    { key: "monthlyBookings" },
    { key: "monthlyApiCalls" },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        {quotaFields.map((field) => (
          <label key={field.key}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {labels[field.key]}
            </div>
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
  title,
  moduleLabels,
}: {
  form: TenantFormState;
  onToggle: (moduleCode: PlatformTenantModule) => void;
  title: string;
  moduleLabels: Record<PlatformTenantModule, string>;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h4>
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
};
