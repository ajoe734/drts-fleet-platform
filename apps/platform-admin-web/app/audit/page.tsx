"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  usePlatformAdminClient,
  formatDateTime,
  truncate,
} from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { AuditLogRecord } from "@drts/contracts";

function moduleLabel(locale: string, value: string) {
  if (locale !== "zh") return value;
  switch (value) {
    case "audit-notification":
      return "稽核與通知";
    case "dispatch":
      return "派車";
    case "foundation":
      return "基礎設定";
    default:
      return value;
  }
}

export default function AuditPage() {
  const { locale, t } = useTranslation();
  const client = usePlatformAdminClient();
  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterModule, setFilterModule] = useState<string>("");
  const [filterActorType, setFilterActorType] = useState<string>("");
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listAuditLogs();
      const recordsList: AuditLogRecord[] =
        (result as any[])?.map((r: any) => ({
          auditId: r.auditId || r.id || "",
          actorId: r.actorId || null,
          actorType: r.actorType || "system",
          tenantId: r.tenantId || null,
          moduleName: r.moduleName || r.module || "",
          actionName: r.actionName || r.action || "",
          resourceType: r.resourceType || "",
          resourceId: r.resourceId || null,
          oldValuesSummary: r.oldValuesSummary || undefined,
          newValuesSummary: r.newValuesSummary || undefined,
          requestId: r.requestId || "",
          createdAt: r.createdAt || "",
        })) || [];
      setRecords(recordsList);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const filtered = records.filter((r) => {
    if (filterModule && r.moduleName !== filterModule) return false;
    if (filterActorType && r.actorType !== filterActorType) return false;
    return true;
  });

  const modules = [
    ...new Set(records.map((r) => r.moduleName).filter(Boolean)),
  ];
  const actorTypes = [
    ...new Set(records.map((r) => r.actorType).filter(Boolean)),
  ];

  const copy =
    locale === "zh"
      ? {
          description: "檢視平台稽核記錄，並依模組與操作者類型篩選。",
          errorLabel: "錯誤",
          filterModule: "模組",
          filterActorType: "操作者類型",
          all: "全部",
          summary: `顯示 ${filtered.length} / ${records.length} 筆記錄`,
          empty: "沒有符合目前篩選條件的稽核記錄。",
          auditId: "稽核編號",
          actor: "操作者",
          module: "模組",
          action: "動作",
          resource: "資源",
          tenant: "租戶",
          created: "建立時間",
          details: "詳情",
          system: "系統",
          noValues: "無資料",
        }
      : {
          description:
            "Review platform audit log entries with filtering capabilities.",
          errorLabel: "Error",
          filterModule: "Module",
          filterActorType: "Actor Type",
          all: "All",
          summary: `Showing ${filtered.length} of ${records.length} records`,
          empty: "No audit records found matching the filter.",
          auditId: "Audit ID",
          actor: "Actor",
          module: "Module",
          action: "Action",
          resource: "Resource",
          tenant: "Tenant",
          created: "Created",
          details: "Details",
          system: "system",
          noValues: "No values",
        };

  const actorTypeLabel = (value: string | null | undefined) => {
    if (!value) return copy.system;
    if (locale !== "zh") return value;
    switch (value) {
      case "system":
        return "系統";
      case "platform_admin":
        return "平台管理員";
      case "ops":
        return "營運";
      case "tenant":
        return "租戶";
      case "driver":
        return "司機";
      default:
        return value;
    }
  };

  if (loading) return <div className="admin-empty">{t("audit.loading")}</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("audit.title")}</h1>
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

      <div className="admin-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label
            htmlFor="filter-module"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            {copy.filterModule}:
          </label>
          <select
            id="filter-module"
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            style={{
              padding: "6px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <option value="">{copy.all}</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {moduleLabel(locale, m)}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label
            htmlFor="filter-actor"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            {copy.filterActorType}:
          </label>
          <select
            id="filter-actor"
            value={filterActorType}
            onChange={(e) => setFilterActorType(e.target.value)}
            style={{
              padding: "6px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <option value="">{copy.all}</option>
            {actorTypes.map((a) => (
              <option key={a} value={a}>
                {actorTypeLabel(a)}
              </option>
            ))}
          </select>
        </div>
        <button
          className="admin-btn admin-btn--secondary"
          onClick={loadRecords}
        >
          {t("common.refresh")}
        </button>
      </div>

      <div className="admin-card" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>{copy.summary}</span>
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
                <th>{copy.auditId}</th>
                <th>{copy.actor}</th>
                <th>{copy.module}</th>
                <th>{copy.action}</th>
                <th>{copy.resource}</th>
                <th>{copy.tenant}</th>
                <th>{copy.created}</th>
                <th>{copy.details}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <React.Fragment key={r.auditId}>
                  <tr>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                      {truncate(r.auditId, 12)}
                    </td>
                    <td>
                      <div style={{ fontSize: 12 }}>
                        <div>{truncate(r.actorId || copy.system, 16)}</div>
                        <span
                          className="admin-badge admin-badge--neutral"
                          style={{ fontSize: 10 }}
                        >
                          {actorTypeLabel(r.actorType)}
                        </span>
                      </div>
                    </td>
                    <td>{moduleLabel(locale, r.moduleName)}</td>
                    <td>
                      <span className="admin-badge admin-badge--info">
                        {r.actionName}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {r.resourceType}
                      {r.resourceId ? `:${truncate(r.resourceId, 8)}` : ""}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                      {r.tenantId || "—"}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td>
                      {r.oldValuesSummary || r.newValuesSummary ? (
                        <button
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          type="button"
                          onClick={() =>
                            setExpandedAuditId((current) =>
                              current === r.auditId ? null : r.auditId,
                            )
                          }
                        >
                          {t("common.view")}
                        </button>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: 12 }}>
                          {copy.noValues}
                        </span>
                      )}
                    </td>
                  </tr>
                  {expandedAuditId === r.auditId && (
                    <tr>
                      <td colSpan={8}>
                        <pre
                          style={{
                            margin: 0,
                            padding: 12,
                            background: "#0f172a",
                            color: "#e2e8f0",
                            borderRadius: 8,
                            fontSize: 11,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {JSON.stringify(
                            {
                              oldValuesSummary: r.oldValuesSummary,
                              newValuesSummary: r.newValuesSummary,
                              requestId: r.requestId,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
