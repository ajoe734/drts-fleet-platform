/**
 * Notices & Maintenance Mode Page
 * Platform-wide notices, broadcasts, and maintenance window management.
 * Calls /api/platform-admin/notices and /api/platform-admin/maintenance-mode.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  PlatformNoticeRecord,
  PlatformNoticeSeverity,
  PlatformMaintenanceModeRecord,
} from "@drts/contracts";

const SEVERITY_OPTIONS: PlatformNoticeSeverity[] = [
  "info",
  "warning",
  "critical",
];

export default function NoticesPage() {
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const [notices, setNotices] = useState<PlatformNoticeRecord[]>([]);
  const [maintenance, setMaintenance] =
    useState<PlatformMaintenanceModeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"notices" | "maintenance">(
    "notices",
  );

  const [showCreate, setShowCreate] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formSeverity, setFormSeverity] =
    useState<PlatformNoticeSeverity>("info");
  const [formAudience, setFormAudience] = useState<
    "all" | "tenants" | "ops" | "drivers"
  >("all");
  const [creating, setCreating] = useState(false);

  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintReason, setMaintReason] = useState("");
  const [updatingMaint, setUpdatingMaint] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [n, m] = await Promise.all([
        client.listPlatformNotices(),
        client.getMaintenanceMode(),
      ]);
      setNotices(n || []);
      setMaintenance(m);
      setMaintEnabled(m.enabled);
      setMaintReason(m.reason || "");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await client.createPlatformNotice({
        title: formTitle,
        body: formBody,
        severity: formSeverity,
        targetAudience: formAudience,
      });
      setShowCreate(false);
      setFormTitle("");
      setFormBody("");
      setFormSeverity("info");
      setFormAudience("all");
      await loadData();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleResolve = async (noticeId: string) => {
    try {
      await client.resolvePlatformNotice(noticeId);
      await loadData();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const handleSetMaintenance = async () => {
    setUpdatingMaint(true);
    try {
      await client.setMaintenanceMode({
        enabled: maintEnabled,
        reason: maintReason || null,
      });
      await loadData();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setUpdatingMaint(false);
    }
  };

  const getSeverityBadge = (severity: PlatformNoticeSeverity) => {
    switch (severity) {
      case "critical":
        return "admin-badge--danger";
      case "warning":
        return "admin-badge--warning";
      default:
        return "admin-badge--info";
    }
  };

  if (loading) return <div className="admin-empty">{t("notices.loading")}</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("notices.title")}</h1>
        <p>
          {t("notices.subtitle", {
            count: notices.filter((n) => n.status === "active").length,
          })}
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

      {maintenance?.enabled && (
        <div
          className="admin-card"
          style={{
            borderColor: "rgba(239,68,68,0.5)",
            background: "rgba(254,242,242,0.8)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className="admin-badge admin-badge--danger"
              style={{ fontSize: 12 }}
            >
              {t("notices.maintActiveBanner")}
            </span>
            <span style={{ fontSize: 13, color: "#dc2626" }}>
              {maintenance.reason || t("notices.maintActive")}
            </span>
          </div>
        </div>
      )}

      <div className="admin-toolbar">
        <div className="admin-toggle-group">
          <button
            className={`admin-toggle-btn ${activeTab === "notices" ? "active" : ""}`}
            onClick={() => setActiveTab("notices")}
          >
            {t("notices.tab.notices")} ({notices.length})
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "maintenance" ? "active" : ""}`}
            onClick={() => setActiveTab("maintenance")}
          >
            {t("notices.tab.maintenance")}
          </button>
        </div>
        {activeTab === "notices" && (
          <button
            className="admin-btn admin-btn--primary"
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? t("common.cancel") : t("notices.newNotice")}
          </button>
        )}
        <button className="admin-btn admin-btn--secondary" onClick={loadData}>
          {t("common.refresh")}
        </button>
      </div>

      {activeTab === "notices" && showCreate && (
        <div className="admin-card">
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            {t("notices.newNotice")}
          </h3>
          <form onSubmit={handleCreateNotice}>
            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="notice-title"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {t("notices.form.title")}
              </label>
              <input
                id="notice-title"
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                }}
                placeholder={t("notices.form.titlePlaceholder")}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="notice-body"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {t("notices.form.body")}
              </label>
              <textarea
                id="notice-body"
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                required
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                  resize: "vertical",
                }}
                placeholder={t("notices.form.bodyPlaceholder")}
              />
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 4,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {t("notices.form.severity")}
                </label>
                <select
                  value={formSeverity}
                  onChange={(e) =>
                    setFormSeverity(e.target.value as PlatformNoticeSeverity)
                  }
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                >
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 4,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {t("notices.form.audience")}
                </label>
                <select
                  value={formAudience}
                  onChange={(e) =>
                    setFormAudience(
                      e.target.value as "all" | "tenants" | "ops" | "drivers",
                    )
                  }
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                >
                  <option value="all">{t("notices.audience.all")}</option>
                  <option value="tenants">
                    {t("notices.audience.tenants")}
                  </option>
                  <option value="ops">{t("notices.audience.ops")}</option>
                  <option value="drivers">
                    {t("notices.audience.drivers")}
                  </option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={creating || !formTitle.trim() || !formBody.trim()}
            >
              {creating ? t("notices.publishing") : t("notices.publishNotice")}
            </button>
          </form>
        </div>
      )}

      {activeTab === "notices" &&
        (notices.length === 0 ? (
          <div className="admin-card admin-empty">
            <p>{t("notices.empty")}</p>
          </div>
        ) : (
          <div className="admin-card" style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("notices.col.title")}</th>
                  <th>{t("notices.col.severity")}</th>
                  <th>{t("fleet.col.status")}</th>
                  <th>{t("notices.col.audience")}</th>
                  <th>{t("notices.col.created")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {notices.map((n) => (
                  <tr key={n.noticeId}>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                      {n.noticeId.slice(0, 16)}…
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        {n.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          maxWidth: 240,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {n.body}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${getSeverityBadge(n.severity)}`}
                      >
                        {n.severity}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${
                          n.status === "active"
                            ? "admin-badge--success"
                            : n.status === "scheduled"
                              ? "admin-badge--warning"
                              : "admin-badge--neutral"
                        }`}
                      >
                        {n.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className="admin-badge admin-badge--info"
                        style={{ fontSize: 11 }}
                      >
                        {n.targetAudience}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {formatDateTime(n.createdAt)}
                    </td>
                    <td>
                      {n.status !== "resolved" && (
                        <button
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          onClick={() => handleResolve(n.noticeId)}
                        >
                          {t("notices.resolve")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {activeTab === "maintenance" && (
        <div className="admin-card">
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            {t("notices.tab.maintenance")}
          </h3>
          {maintenance && (
            <div style={{ marginBottom: 20 }}>
              <table className="admin-table">
                <tbody>
                  <tr>
                    <th style={{ width: 160 }}>{t("notices.currentStatus")}</th>
                    <td>
                      <span
                        className={`admin-badge ${
                          maintenance.enabled
                            ? "admin-badge--danger"
                            : "admin-badge--success"
                        }`}
                      >
                        {maintenance.enabled
                          ? t("notices.maintEnabled")
                          : t("notices.maintDisabled")}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>{t("notices.form.maintenanceReason")}</th>
                    <td>{maintenance.reason || "—"}</td>
                  </tr>
                  <tr>
                    <th>{t("notices.lastUpdated")}</th>
                    <td>{formatDateTime(maintenance.updatedAt)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
            <h4 style={{ margin: "0 0 12px", fontSize: 14 }}>
              {t("notices.updating")}
            </h4>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <label className="admin-switch">
                <input
                  type="checkbox"
                  checked={maintEnabled}
                  onChange={(e) => setMaintEnabled(e.target.checked)}
                />
                <span className="admin-switch-slider" />
              </label>
              <span style={{ fontSize: 14 }}>
                {maintEnabled
                  ? t("notices.maintenanceModeOn")
                  : t("notices.maintenanceModeOff")}
              </span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="maint-reason"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {t("notices.form.maintenanceReason")}
              </label>
              <input
                id="maint-reason"
                type="text"
                value={maintReason}
                onChange={(e) => setMaintReason(e.target.value)}
                style={{
                  width: "100%",
                  maxWidth: 400,
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                }}
                placeholder="e.g. Scheduled upgrade window"
              />
            </div>
            <button
              className="admin-btn admin-btn--primary"
              onClick={handleSetMaintenance}
              disabled={updatingMaint}
            >
              {updatingMaint ? t("notices.updating") : t("notices.applyMaint")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
