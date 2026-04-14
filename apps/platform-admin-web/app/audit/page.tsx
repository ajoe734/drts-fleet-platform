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
import type { AuditLogRecord } from "@drts/contracts";

export default function AuditPage() {
  const client = usePlatformAdminClient();
  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterModule, setFilterModule] = useState<string>("");
  const [filterActorType, setFilterActorType] = useState<string>("");

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

  if (loading)
    return <div className="admin-empty">Loading audit records...</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Audit Trail</h1>
        <p>Review platform audit log entries with filtering capabilities.</p>
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
            Module:
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
            <option value="">All</option>
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
            Actor Type:
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
            <option value="">All</option>
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
          Refresh
        </button>
      </div>

      <div className="admin-card" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          Showing {filtered.length} of {records.length} record
          {records.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>No audit records found matching the filter.</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Audit ID</th>
                <th>Actor</th>
                <th>Module</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Tenant</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.auditId}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
