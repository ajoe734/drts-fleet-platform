/**
 * Feature Flags Page
 * Feature flag management with tenant-level overrides.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { FeatureFlag, FeatureFlagSummary } from "@drts/contracts";

export default function FeatureFlagsPage() {
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [updating, setUpdating] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary: FeatureFlagSummary = await client.getFeatureFlags();
      setFlags(summary.flags || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const handleToggle = async (flag: FeatureFlag) => {
    setUpdating(flag.key);
    try {
      await client.updateFeatureFlag(flag.key, !flag.enabled);
      await loadFlags();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setUpdating(null);
    }
  };

  const filtered = flags.filter((f) => {
    if (filter === "enabled") return f.enabled;
    if (filter === "disabled") return !f.enabled;
    return true;
  });

  if (loading) return <div className="admin-empty">{t("flags.loading")}</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("flags.title")}</h1>
        <p>
          {t("flags.subtitle", {
            total: flags.length,
            enabled: flags.filter((f) => f.enabled).length,
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

      <div className="admin-toolbar">
        <div className="admin-toggle-group">
          <button
            className={`admin-toggle-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            {t("common.all")} ({flags.length})
          </button>
          <button
            className={`admin-toggle-btn ${filter === "enabled" ? "active" : ""}`}
            onClick={() => setFilter("enabled")}
          >
            {t("common.enabled")} ({flags.filter((f) => f.enabled).length})
          </button>
          <button
            className={`admin-toggle-btn ${filter === "disabled" ? "active" : ""}`}
            onClick={() => setFilter("disabled")}
          >
            {t("common.disabled")} ({flags.filter((f) => !f.enabled).length})
          </button>
        </div>
        <button className="admin-btn admin-btn--secondary" onClick={loadFlags}>
          {t("common.refresh")}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>{t("flags.empty")}</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("flags.col.flag")}</th>
                <th>{t("flags.col.status")}</th>
                <th>{t("flags.col.description")}</th>
                <th>{t("flags.col.tenantOverride")}</th>
                <th>{t("flags.col.updated")}</th>
                <th>{t("flags.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((flag) => (
                <tr key={flag.key}>
                  <td>
                    <code
                      style={{
                        fontSize: 13,
                        background: "#f3f4f6",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {flag.key}
                    </code>
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${
                        flag.enabled
                          ? "admin-badge--success"
                          : "admin-badge--neutral"
                      }`}
                    >
                      {flag.enabled
                        ? t("common.enabled")
                        : t("common.disabled")}
                    </span>
                  </td>
                  <td
                    style={{
                      maxWidth: 300,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {flag.description || "—"}
                  </td>
                  <td>
                    {flag.tenantId ? (
                      <span
                        className="admin-badge admin-badge--info"
                        style={{ fontSize: 11 }}
                      >
                        {t("flags.tenantOverride", { id: flag.tenantId })}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "#9ca3af" }}>
                        {t("flags.global")}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {formatDateTime(flag.updatedAt)}
                  </td>
                  <td>
                    <label className="admin-switch">
                      <input
                        type="checkbox"
                        checked={flag.enabled}
                        onChange={() => handleToggle(flag)}
                        disabled={updating === flag.key}
                      />
                      <span className="admin-switch-slider" />
                    </label>
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
