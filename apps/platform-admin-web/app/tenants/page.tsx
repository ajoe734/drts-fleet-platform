/**
 * Tenants Management Page
 * Platform tenant lifecycle, quotas, and enabled module configuration.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
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

const MODULE_LABELS: Record<PlatformTenantModule, string> = {
  enterprise_dispatch: "Enterprise Dispatch",
  billing: "Billing",
  reporting: "Reporting",
  webhooks: "Webhooks",
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

  if (loading) return <div className="admin-empty">Loading tenants...</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Tenants</h1>
        <p>
          Manage tenant lifecycle, contract modules, and platform quota
          allocations.
        </p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>Error: {error}</p>
        </div>
      )}

      <div className="admin-toolbar">
        <button
          className="admin-btn admin-btn--primary"
          onClick={() => setShowCreate((current) => !current)}
        >
          {showCreate ? "Cancel" : "New Tenant"}
        </button>
        <button
          className="admin-btn admin-btn--secondary"
          onClick={() => void loadTenants()}
        >
          Refresh
        </button>
      </div>

      {showCreate && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Create Tenant</h3>
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
                <span className="sr-only">Tenant Name</span>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Name
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
                <span className="sr-only">Tenant Code</span>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Code
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
                  Status
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
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
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
              {creating ? "Creating..." : "Create Tenant"}
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
                Configure {selectedTenant.name}
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
                Code: <code>{selectedTenant.code}</code>
              </p>
            </div>
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => setSelectedTenantId(null)}
              type="button"
            >
              Close
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
                  Name
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
                  Status
                </div>
                <input
                  value={selectedTenant.status}
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
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </form>
        </div>
      )}

      {tenants.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>No tenants found. Create one to get started.</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Code</th>
                <th>Modules</th>
                <th>Quotas</th>
                <th>Status</th>
                <th>Actions</th>
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
                        {MODULE_LABELS[moduleCode]}
                      </span>
                    ))}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div>Drivers: {tenant.quotas.activeDrivers}</div>
                    <div>Bookings: {tenant.quotas.monthlyBookings}</div>
                    <div>API Calls: {tenant.quotas.monthlyApiCalls}</div>
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
                      {tenant.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => setSelectedTenantId(tenant.id)}
                        type="button"
                      >
                        Configure
                      </button>
                      {tenant.status !== "active" && (
                        <button
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          onClick={() =>
                            void runTenantAction(tenant.id, "activate")
                          }
                          type="button"
                        >
                          Activate
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
                          Suspend
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
  const quotaFields: Array<{
    key: "activeDrivers" | "monthlyBookings" | "monthlyApiCalls";
    label: string;
  }> = [
    { key: "activeDrivers", label: "Active Drivers" },
    { key: "monthlyBookings", label: "Monthly Bookings" },
    { key: "monthlyApiCalls", label: "Monthly API Calls" },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Quota Allocation</h4>
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
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Enabled Modules</h4>
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
            <span>{MODULE_LABELS[moduleCode]}</span>
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
