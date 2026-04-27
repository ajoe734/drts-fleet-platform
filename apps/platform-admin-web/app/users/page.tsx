"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
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
  const { t, locale } = useTranslation();
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
      setError(e?.message || t("common.unknown"));
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
      setError(e?.message || t("common.unknown"));
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
      setError(e?.message || t("common.unknown"));
    }
  };

  if (loading) return <div className="admin-empty">{t("users.loading")}</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("users.title")}</h1>
        <p>{t("users.subtitle", { count: users.length })}</p>
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
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? t("common.cancel") : t("users.addStaffUser")}
        </button>
        <button className="admin-btn admin-btn--secondary" onClick={loadUsers}>
          {t("common.refresh")}
        </button>
      </div>

      {showCreate && (
        <div className="admin-card">
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            {t("users.addStaffUser")}
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
                {t("users.form.email")}
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
                {t("users.form.displayName")}
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
                {t("users.form.role")}
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
                    {formatPlatformCodeLabel(locale, r)}
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
              {creating ? t("common.adding") : t("users.addStaffUser")}
            </button>
          </form>
        </div>
      )}

      {users.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>{t("users.empty")}</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{getPlatformLabel(locale, "id")}</th>
                <th>{t("users.col.user")}</th>
                <th>{t("users.col.role")}</th>
                <th>{getPlatformLabel(locale, "status")}</th>
                <th>{getPlatformLabel(locale, "updated")}</th>
                <th></th>
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
                      {formatPlatformCodeLabel(locale, u.roleCode)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${u.status === "active" ? "admin-badge--success" : u.status === "suspended" ? "admin-badge--danger" : "admin-badge--warning"}`}
                    >
                      {formatPlatformCodeLabel(locale, u.status)}
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
                        {formatPlatformCodeLabel(locale, "admin")}
                      </button>
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => handleUpdateRole(u.userId, "viewer")}
                        disabled={u.roleCode === "viewer"}
                      >
                        {formatPlatformCodeLabel(locale, "viewer")}
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
