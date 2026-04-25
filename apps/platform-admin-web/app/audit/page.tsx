/**
 * Audit Trail Page
 * Platform audit log with filtering and record inspection.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  usePlatformAdminClient,
  formatDateTime,
  truncate,
} from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { AuditLogRecord } from "@drts/contracts";

type TFn = (key: string, params?: Record<string, string | number>) => string;

export default function AuditPage() {
  const { t } = useTranslation();
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

  if (loading) return <div className="admin-empty">{t("audit.loading")}</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("audit.title")}</h1>
        <p>{t("audit.subtitle", { count: records.length })}</p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>Error: {error}</p>
        </div>
      )}

      <div className="admin-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label
            htmlFor="filter-module"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            {t("audit.moduleLabel")}
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
            <option value="">{t("common.all")}</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label
            htmlFor="filter-actor"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            {t("audit.actorLabel")}
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
            <option value="">{t("common.all")}</option>
            {actorTypes.map((a) => (
              <option key={a} value={a}>
                {a}
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
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          {t("audit.showingOf", {
            shown: filtered.length,
            total: records.length,
          })}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>{t("audit.empty")}</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t("audit.col.actor")}</th>
                <th>{t("audit.col.module")}</th>
                <th>{t("audit.col.action")}</th>
                <th>{t("audit.col.resource")}</th>
                <th>{t("audit.col.tenant")}</th>
                <th>{t("audit.col.timestamp")}</th>
                <th>{t("audit.col.details")}</th>
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
                        <div>{truncate(r.actorId || "system", 16)}</div>
                        <span
                          className="admin-badge admin-badge--neutral"
                          style={{ fontSize: 10 }}
                        >
                          {r.actorType}
                        </span>
                      </div>
                    </td>
                    <td>{r.moduleName}</td>
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
                          {expandedAuditId === r.auditId
                            ? t("audit.collapse")
                            : t("audit.expand")}
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                  {expandedAuditId === r.auditId && (
                    <tr>
                      <td colSpan={8} style={{ background: "#fafafa" }}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(240px, 1fr))",
                            gap: 12,
                          }}
                        >
                          <AuditValueCard
                            title={t("audit.oldValues")}
                            payload={r.oldValuesSummary}
                            t={t}
                          />
                          <AuditValueCard
                            title={t("audit.newValues")}
                            payload={r.newValuesSummary}
                            t={t}
                          />
                        </div>
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

function AuditValueCard({
  title,
  payload,
  t,
}: {
  title: string;
  payload: Record<string, unknown> | undefined;
  t: TFn;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 12,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {payload ? (
        <pre
          style={{
            margin: 0,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : (
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {t("common.noValues") ?? "No values"}
        </span>
      )}
    </div>
  );
}
