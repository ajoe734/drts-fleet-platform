/**
 * Tenants Management Page
 * Lists all tenants with CRUD operations.
 */

"use client";

import React, { useState } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import type { TenantSummary } from "@drts/shared-types";

export default function TenantsPage() {
  const client = usePlatformAdminClient();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [creating, setCreating] = useState(false);

  const loadTenants = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch tenants from platform-admin list endpoint
      const result = await client.get<{ items: TenantSummary[] }>(
        "/api/platform-admin/tenants",
      );
      setTenants(result.items || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  React.useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await client.post("/api/platform-admin/tenants", {
        body: { name: formName, status: formStatus },
      });
      setShowCreate(false);
      setFormName("");
      setFormStatus("active");
      await loadTenants();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="admin-empty">Loading tenants...</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Tenants</h1>
        <p>Manage tenant accounts, provisioning, and lifecycle operations.</p>
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
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "Cancel" : "New Tenant"}
        </button>
        <button
          className="admin-btn admin-btn--secondary"
          onClick={loadTenants}
        >
          Refresh
        </button>
      </div>

      {showCreate && (
        <div className="admin-card">
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Create Tenant</h3>
          <form onSubmit={handleCreate}>
            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="tenant-name"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Name
              </label>
              <input
                id="tenant-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                }}
                placeholder="Enter tenant name"
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Status
              </label>
              <select
                value={formStatus}
                onChange={(e) =>
                  setFormStatus(e.target.value as "active" | "inactive")
                }
                style={{
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={creating || !formName.trim()}
            >
              {creating ? "Creating..." : "Create"}
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {t.id}
                  </td>
                  <td>{t.name}</td>
                  <td>
                    <span
                      className={`admin-badge ${
                        t.status === "active"
                          ? "admin-badge--success"
                          : "admin-badge--neutral"
                      }`}
                    >
                      {t.status}
                    </span>
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
