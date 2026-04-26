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

function moduleLabel(
  t: ReturnType<typeof useTranslation>["t"],
  moduleCode: PlatformTenantModule,
) {
  switch (moduleCode) {
    case "enterprise_dispatch":
      return t("tenants.module.enterpriseDispatch");
    case "billing":
      return t("tenants.module.billing");
    case "reporting":
      return t("tenants.module.reporting");
    case "webhooks":
      return t("tenants.module.webhooks");
    default:
      return moduleCode;
  }
}

function tenantStatusLabel(
  locale: ReturnType<typeof useTranslation>["locale"],
  status: PlatformAdminTenantRecord["status"] | TenantFormState["status"],
) {
  if (locale !== "zh") {
    return status;
  }
  switch (status) {
    case "active":
      return "啟用中";
    case "paused":
      return "已暫停";
    case "inactive":
      return "未啟用";
    default:
      return status;
  }
}

export default function TenantsPage() {
  const client = usePlatformAdminClient();
  const { locale, t } = useTranslation();
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
            {t("common.error")}: {error}
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <label>
                <span className="sr-only">{t("tenants.form.name")}</span>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  {t("tenants.form.name")}
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
                  placeholder="Acme Mobility"
                  style={inputStyle}
                />
              </label>
              <label>
                <span className="sr-only">{t("tenants.form.code")}</span>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  {t("tenants.form.code")}
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
                  placeholder="acme_dispatch"
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
                  <option value="active">
                    {tenantStatusLabel(locale, "active")}
                  </option>
                  <option value="inactive">
                    {tenantStatusLabel(locale, "inactive")}
                  </option>
                </select>
              </label>
            </div>

            <QuotaFields form={createForm} setForm={setCreateForm} />
            <ModuleFields
              form={createForm}
              onToggle={(moduleCode) => toggleModule(setCreateForm, moduleCode)}
            />

            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={
                creating || !createForm.name.trim() || !createForm.code.trim()
              }
            >
              {creating
                ? `${t("tenants.createTenant")}...`
                : t("tenants.createTenant")}
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
              <h3 style={{ margin: 0, fontSize: 16 }}>
                {t("tenants.detail")} - {selectedTenant.name}
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
                {t("tenants.form.code")}: <code>{selectedTenant.code}</code>
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
                  {t("tenants.form.name")}
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
                  value={tenantStatusLabel(locale, selectedTenant.status)}
                  disabled
                  style={inputStyle}
                />
              </label>
            </div>

            <QuotaFields form={editForm} setForm={setEditForm} />
            <ModuleFields
              form={editForm}
              onToggle={(moduleCode) => toggleModule(setEditForm, moduleCode)}
            />

            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={saving || !editForm.name.trim()}
            >
              {saving
                ? `${t("tenants.saveSettings")}...`
                : t("tenants.saveSettings")}
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
                <th>ID</th>
                <th>{t("tenants.col.tenant")}</th>
                <th>{t("tenants.form.code")}</th>
                <th>{t("tenants.col.modules")}</th>
                <th>{t("tenants.col.quotas")}</th>
                <th>{t("tenants.col.status")}</th>
                <th>{t("common.actions")}</th>
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
                        {moduleLabel(t, moduleCode)}
                      </span>
                    ))}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div>
                      {t("tenants.form.activeDrivers")}:{" "}
                      {tenant.quotas.activeDrivers}
                    </div>
                    <div>
                      {t("tenants.form.monthlyBookings")}:{" "}
                      {tenant.quotas.monthlyBookings}
                    </div>
                    <div>
                      {t("tenants.form.monthlyApiCalls")}:{" "}
                      {tenant.quotas.monthlyApiCalls}
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
                      {tenantStatusLabel(locale, tenant.status)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => setSelectedTenantId(tenant.id)}
                        type="button"
                      >
                        {t("tenants.detail")}
                      </button>
                      {tenant.status !== "active" && (
                        <button
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          onClick={() =>
                            void runTenantAction(tenant.id, "activate")
                          }
                          type="button"
                        >
                          {locale === "zh" ? "啟用" : "Activate"}
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
                          {locale === "zh" ? "暫停" : "Suspend"}
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
}: {
  form: TenantFormState;
  setForm: React.Dispatch<React.SetStateAction<TenantFormState>>;
}) {
  const { t } = useTranslation();
  const quotaFields: Array<{
    key: "activeDrivers" | "monthlyBookings" | "monthlyApiCalls";
    label: string;
  }> = [
    { key: "activeDrivers", label: t("tenants.form.activeDrivers") },
    { key: "monthlyBookings", label: t("tenants.form.monthlyBookings") },
    { key: "monthlyApiCalls", label: t("tenants.form.monthlyApiCalls") },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>
        {t("tenants.col.quotas")}
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
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {field.label}
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
}: {
  form: TenantFormState;
  onToggle: (moduleCode: PlatformTenantModule) => void;
}) {
  const { t } = useTranslation();
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
            <span>{moduleLabel(t, moduleCode)}</span>
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
