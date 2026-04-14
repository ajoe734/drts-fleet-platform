/**
 * Users & Roles Management Page
 * Platform user administration and role assignment.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import type { TenantUserRoleRecord } from "@drts/contracts";

export default function UsersPage() {
  const client = usePlatformAdminClient();
  const [users, setUsers] = useState<TenantUserRoleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formRoleCode, setFormRoleCode] = useState("viewer");
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listTenantUsers();
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
      await client.createTenantUser({
        email: formEmail,
        displayName: formDisplayName,
        roleCode: formRoleCode,
      });
      setShowCreate(false);
      setFormEmail("");
      setFormDisplayName("");
      setFormRoleCode("viewer");
      await loadUsers();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRoleCode: string) => {
    try {
      await client.updateTenantRole({ roleCode: newRoleCode });
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
        <p>Manage platform users, assign roles, and control access scopes.</p>
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
          {showCreate ? "Cancel" : "Add User"}
        </button>
        <button className="admin-btn admin-btn--secondary" onClick={loadUsers}>
          Refresh
        </button>
      </div>

      {showCreate && (
        <div className="admin-card">
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            Add Platform User
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
                placeholder="user@example.com"
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
                placeholder="John Doe"
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
                Role Code
              </label>
              <select
                value={formRoleCode}
                onChange={(e) => setFormRoleCode(e.target.value)}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={creating || !formEmail.trim()}
            >
              {creating ? "Adding..." : "Add"}
            </button>
          </form>
        </div>
      )}

      {users.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>No users found. Add a user to get started.</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name</th>
                <th>Role Code</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {u.userId}
                  </td>
                  <td>{u.displayName || u.email}</td>
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
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => handleUpdateRole(u.userId, "admin")}
                      >
                        Make Admin
                      </button>
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => handleUpdateRole(u.userId, "viewer")}
                      >
                        Demote to Viewer
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
