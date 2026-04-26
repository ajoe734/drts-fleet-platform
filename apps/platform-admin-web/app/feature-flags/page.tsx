"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { FeatureFlag, FeatureFlagSummary } from "@drts/contracts";

function featureFlagDescription(locale: string, flag: FeatureFlag) {
  if (locale !== "zh") return flag.description || "—";

  const descriptions: Record<string, string> = {
    "driver-app.earnings": "啟用司機 App 收益讀模型",
    "driver-app.incidents": "啟用司機 App 事故回報",
    "driver-app.shift": "啟用司機 App 班次與出勤追蹤",
    "driver-app.tasks": "啟用司機 App 任務生命週期",
    "ops-console.callcenter": "啟用營運後台客服中心工作階段檢視",
    "ops-console.complaint": "啟用營運後台投訴案件管理",
    "ops-console.dispatch": "啟用營運後台派車調度板",
    "ops-console.reports": "啟用營運後台報表任務管理",
    "phase1.read-models": "啟用 Phase 1 讀模型介面",
    "phase1.smoke-paths": "啟用 Phase 1 smoke test 端點",
    "tenant-portal.billing": "啟用租戶入口帳務檢視",
    "tenant-portal.booking": "啟用租戶入口訂車管理",
    "tenant-portal.reports": "啟用租戶入口報表任務提交",
    "tenant-portal.webhooks": "啟用租戶入口 Webhook 管理",
  };

  return descriptions[flag.key] || flag.description || "—";
}

export default function FeatureFlagsPage() {
  const { locale, t } = useTranslation();
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

  const copy =
    locale === "zh"
      ? {
          title: "功能旗標",
          description: "管理平台功能旗標，並檢視租戶層級覆寫狀態。",
          errorLabel: "錯誤",
          all: "全部",
          enabled: "已啟用",
          disabled: "已停用",
          refresh: "重新整理",
          empty: "沒有找到功能旗標。",
          key: "鍵名",
          status: "狀態",
          details: "說明",
          tenantOverride: "租戶覆寫",
          updated: "更新時間",
          toggle: "切換",
          tenantPrefix: "租戶",
          global: "全域",
        }
      : {
          title: "Feature Flags",
          description:
            "Manage platform feature flags with tenant-level override support.",
          errorLabel: "Error",
          all: "All",
          enabled: "Enabled",
          disabled: "Disabled",
          refresh: "Refresh",
          empty: "No feature flags found.",
          key: "Key",
          status: "Status",
          details: "Description",
          tenantOverride: "Tenant Override",
          updated: "Updated",
          toggle: "Toggle",
          tenantPrefix: "Tenant",
          global: "Global",
        };

  if (loading) {
    return <div className="admin-empty">{t("flags.loading")}</div>;
  }

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
        <div className="admin-toggle-group">
          <button
            className={`admin-toggle-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            {copy.all} ({flags.length})
          </button>
          <button
            className={`admin-toggle-btn ${filter === "enabled" ? "active" : ""}`}
            onClick={() => setFilter("enabled")}
          >
            {copy.enabled} ({flags.filter((f) => f.enabled).length})
          </button>
          <button
            className={`admin-toggle-btn ${filter === "disabled" ? "active" : ""}`}
            onClick={() => setFilter("disabled")}
          >
            {copy.disabled} ({flags.filter((f) => !f.enabled).length})
          </button>
        </div>
        <button className="admin-btn admin-btn--secondary" onClick={loadFlags}>
          {copy.refresh}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>{copy.empty}</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{copy.key}</th>
                <th>{copy.status}</th>
                <th>{copy.details}</th>
                <th>{copy.tenantOverride}</th>
                <th>{copy.updated}</th>
                <th>{copy.toggle}</th>
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
                      {flag.enabled ? copy.enabled : copy.disabled}
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
                    {featureFlagDescription(locale, flag)}
                  </td>
                  <td>
                    {flag.tenantId ? (
                      <span
                        className="admin-badge admin-badge--info"
                        style={{ fontSize: 11 }}
                      >
                        {copy.tenantPrefix}: {flag.tenantId}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "#9ca3af" }}>
                        {copy.global}
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
