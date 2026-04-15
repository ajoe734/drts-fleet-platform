/**
 * Users & Roles Management Page
 * Platform staff user administration and role assignment.
 * Calls /api/platform-admin/users — platform authority only.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import type {
  PlatformAdminUserRecord,
  PlatformAdminUserRole,
} from "@drts/contracts";

const ROLE_CODES: PlatformAdminUserRole[] = [
  "superadmin",
  "admin",
  "operator",
  "viewer",
];

export default function UsersPage() {
  const client = usePlatformAdminClient();
  const [users, setUsers] = useState<PlatformAdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formRoleCode, setFormRoleCode] =
    useState<PlatformAdminUserRole>("operator");
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformAdminUsers();
      setUsers(result || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await client.createPlatformAdminUser({
        email: formEmail,
        displayName: formDisplayName,
        roleCode: formRoleCode,
      });
      setShowCreate(false);
      setFormEmail("");
      setFormDisplayName("");
      setFormRoleCode("operator");
      await loadUsers();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRole = async (
    userId: string,
    newRoleCode: PlatformAdminUserRole,
  ) => {
    try {
      await client.updatePlatformAdminUserRole(userId, {
        roleCode: newRoleCode,
      });
      await loadUsers();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  if (loading) return <div className="admin-empty">Loading users...</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Users &amp; Roles</h1>
        <p>
          Manage platform staff accounts, assign roles, and control access
          scopes.
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
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "Cancel" : "Add Staff User"}
        </button>
        <button className="admin-btn admin-btn--secondary" onClick={loadUsers}>
          Refresh
        </button>
      </div>

      {showCreate && (
        <div className="admin-card">
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            Add Platform Staff User
          </h3>
          <form onSubmit={handleCreate}>
            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="user-email"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Email
              </label>
              <input
                id="user-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                }}
                placeholder="staff@platform.drts"
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="user-display-name"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Display Name
              </label>
              <input
                id="user-display-name"
                type="text"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                }}
                placeholder="Jane Operator"
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
                Role
              </label>
              <select
                value={formRoleCode}
                onChange={(e) =>
                  setFormRoleCode(e.target.value as PlatformAdminUserRole)
                }
                style={{
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                {ROLE_CODES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={
                creating || !formEmail.trim() || !formDisplayName.trim()
              }
            >
              {creating ? "Adding..." : "Add"}
            </button>
          </form>
        </div>
      )}

      {users.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>No platform staff users found. Add one to get started.</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name / Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {u.userId}
                  </td>
                  <td>
                    <div style={{ fontSize: 14 }}>{u.displayName}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {u.email}
                    </div>
                  </td>
                  <td>
                    <span className="admin-badge admin-badge--info">
                      {u.roleCode}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${
                        u.status === "active"
                          ? "admin-badge--success"
                          : u.status === "suspended"
                            ? "admin-badge--danger"
                            : "admin-badge--warning"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {formatDateTime(u.updatedAt)}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => handleUpdateRole(u.userId, "admin")}
                        disabled={u.roleCode === "admin"}
                      >
                        Make Admin
                      </button>
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => handleUpdateRole(u.userId, "viewer")}
                        disabled={u.roleCode === "viewer"}
                      >
                        Viewer
                      </button>
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
