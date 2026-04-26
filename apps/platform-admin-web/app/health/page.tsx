/**
 * Health & Quotas Page
 * System health monitoring, forwarder adapter status, and quota tracking.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";

interface AdapterHealth {
  adapterId: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  lastCheck: string;
  message?: string;
}

interface QuotaStatus {
  resource: string;
  used: number;
  limit: number;
  percentage: number;
}

export default function HealthPage() {
  const { locale, t } = useTranslation();
  const client = usePlatformAdminClient();
  const [adapters, setAdapters] = useState<AdapterHealth[]>([]);
  const [quotas, setQuotas] = useState<QuotaStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"adapters" | "quotas">("adapters");
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch forwarder adapter health
      const adapterData = await client.getForwarderAdaptersHealth();
      const adapterList: AdapterHealth[] =
        (adapterData as any[])?.map((a: any) => ({
          adapterId: a.platformCode || a.adapterId || a.id || "unknown",
          status: a.status || "unknown",
          lastCheck: a.lastCheckedAt || a.lastCheck || a.lastChecked || "",
          message: a.lastError || a.message,
        })) || [];
      setAdapters(adapterList);

      // Simulated quota data (API doesn't have a dedicated quota endpoint yet)
      const quotaData: QuotaStatus[] = [
        {
          resource: "API Requests/min",
          used: 1243,
          limit: 10000,
          percentage: 12.43,
        },
        { resource: "Active Drivers", used: 87, limit: 500, percentage: 17.4 },
        {
          resource: "Concurrent Bookings",
          used: 23,
          limit: 100,
          percentage: 23,
        },
        { resource: "Storage (GB)", used: 45.2, limit: 100, percentage: 45.2 },
      ];
      setQuotas(quotaData);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getAdapterBadge = (status: string): string => {
    switch (status) {
      case "healthy":
        return "admin-badge--success";
      case "degraded":
        return "admin-badge--warning";
      case "unhealthy":
        return "admin-badge--danger";
      default:
        return "admin-badge--neutral";
    }
  };

  const adapterStatusLabel = (status: AdapterHealth["status"]) => {
    if (locale !== "zh") return status;
    switch (status) {
      case "healthy":
        return "健康";
      case "degraded":
        return "降級";
      case "unhealthy":
        return "異常";
      default:
        return "未知";
    }
  };

  const adapterIdLabel = (adapterId: string) => {
    if (locale !== "zh") return adapterId;
    switch (adapterId) {
      case "unknown":
        return "未命名轉發器";
      case "grab_taiwan":
        return "Grab Taiwan";
      default:
        return adapterId;
    }
  };

  if (loading) return <div className="admin-empty">{t("health.loading")}</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("health.title")}</h1>
        <p>{t("health.subtitle")}</p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {locale === "zh" ? "錯誤" : "Error"}: {error}
          </p>
        </div>
      )}

      <div className="admin-toolbar">
        <div className="admin-toggle-group">
          <button
            className={`admin-toggle-btn ${activeTab === "adapters" ? "active" : ""}`}
            onClick={() => setActiveTab("adapters")}
          >
            {t("health.tab.adapters")} ({adapters.length})
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "quotas" ? "active" : ""}`}
            onClick={() => setActiveTab("quotas")}
          >
            {t("health.tab.quotas")} ({quotas.length})
          </button>
        </div>
        <button className="admin-btn admin-btn--secondary" onClick={loadData}>
          {t("common.refresh")}
        </button>
        {lastRefresh && (
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {locale === "zh" ? "最後更新" : "Last updated"}: {lastRefresh}
          </span>
        )}
      </div>

      <div className="admin-card">
        {activeTab === "adapters" &&
          (adapters.length === 0 ? (
            <p className="admin-empty">
              {locale === "zh"
                ? "目前沒有可用的轉發器健康資料。"
                : "No adapter health data available."}
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{locale === "zh" ? "轉發器" : "Adapter ID"}</th>
                  <th>{locale === "zh" ? "狀態" : "Status"}</th>
                  <th>{locale === "zh" ? "最後檢查" : "Last Check"}</th>
                  <th>{locale === "zh" ? "訊息" : "Message"}</th>
                </tr>
              </thead>
              <tbody>
                {adapters.map((a) => (
                  <tr key={a.adapterId}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {adapterIdLabel(a.adapterId)}
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${getAdapterBadge(a.status)}`}
                      >
                        {adapterStatusLabel(a.status)}
                      </span>
                    </td>
                    <td>
                      {a.lastCheck
                        ? new Date(a.lastCheck).toLocaleString()
                        : "—"}
                    </td>
                    <td
                      style={{
                        maxWidth: 300,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.message || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {activeTab === "quotas" &&
          (quotas.length === 0 ? (
            <p className="admin-empty">
              {locale === "zh"
                ? "目前沒有可用的配額資料。"
                : "No quota data available."}
            </p>
          ) : (
            <div>
              {quotas.map((q) => (
                <div key={q.resource} style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontWeight: 500, fontSize: 14 }}>
                      {q.resource}
                    </span>
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                      {q.used} / {q.limit} ({q.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      background: "#e5e7eb",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(q.percentage, 100)}%`,
                        background:
                          q.percentage >= 90
                            ? "#ef4444"
                            : q.percentage >= 70
                              ? "#f59e0b"
                              : "#10b981",
                        borderRadius: 4,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
