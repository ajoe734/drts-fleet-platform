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
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  AuditLogRecord,
  EvidenceDeletionExceptionRecord,
  EvidenceLegalHoldRecord,
  EvidenceRetentionPolicyRecord,
} from "@drts/contracts";

type TFn = (key: string, params?: Record<string, string | number>) => string;

export default function AuditPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [policies, setPolicies] = useState<EvidenceRetentionPolicyRecord[]>([]);
  const [legalHolds, setLegalHolds] = useState<EvidenceLegalHoldRecord[]>([]);
  const [deletionExceptions, setDeletionExceptions] = useState<
    EvidenceDeletionExceptionRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterModule, setFilterModule] = useState<string>("");
  const [filterActorType, setFilterActorType] = useState<string>("");
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, policyList, holdList, deletionExceptionList] =
        await Promise.all([
          client.listAuditLogs(),
          client.listEvidencePolicies(),
          client.listEvidenceLegalHolds(),
          client.listEvidenceDeletionExceptions(),
        ]);
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
      setPolicies(policyList);
      setLegalHolds(holdList);
      setDeletionExceptions(deletionExceptionList);
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
  const activeLegalHolds = legalHolds.filter(
    (hold) => hold.status === "active",
  );
  const activeDeletionExceptions = deletionExceptions.filter(
    (exception) => exception.status === "active",
  );
  const signedDownloadFamilies = policies.filter(
    (policy) => policy.downloadControl?.mode === "signed_url",
  );

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
          <p style={{ color: "#dc2626", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
          </p>
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
                {formatPlatformCodeLabel(locale, m)}
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
                {formatPlatformCodeLabel(locale, a)}
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <AuditMetricCard
          label={t("audit.metrics.policyFamilies")}
          value={String(policies.length)}
        />
        <AuditMetricCard
          label={t("audit.metrics.signedDownload")}
          value={String(signedDownloadFamilies.length)}
        />
        <AuditMetricCard
          label={t("audit.metrics.activeHolds")}
          value={String(activeLegalHolds.length)}
        />
        <AuditMetricCard
          label={t("audit.metrics.activeExceptions")}
          value={String(activeDeletionExceptions.length)}
        />
      </div>

      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>
              {t("audit.policies.title")}
            </h2>
            <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
              {t("audit.policies.subtitle")}
            </p>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("audit.policies.family")}</th>
                <th>{t("audit.policies.authority")}</th>
                <th>{t("audit.policies.retention")}</th>
                <th>{t("audit.policies.download")}</th>
                <th>{t("audit.policies.legalHold")}</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.family}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {formatPlatformCodeLabel(locale, policy.family)}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {policy.description}
                    </div>
                  </td>
                  <td>
                    {formatPlatformCodeLabel(locale, policy.authorityModule)}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {policy.hotRetentionDays}d /{" "}
                    {policy.archiveRetentionDays
                      ? `${policy.archiveRetentionDays}d`
                      : "—"}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {policy.downloadControl?.mode === "signed_url"
                      ? t("audit.policies.signedDownloadTtl", {
                          minutes: policy.downloadControl.ttlMinutes ?? 0,
                        })
                      : t("audit.policies.noDownload")}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {policy.legalHold.supported
                      ? t("audit.policies.holdEnabled")
                      : t("audit.policies.holdDisabled")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <GovernanceTableCard
          title={t("audit.holds.title")}
          emptyLabel={t("audit.holds.empty")}
          columns={[
            t("audit.holds.family"),
            t("audit.holds.subject"),
            t("audit.holds.case"),
            t("audit.holds.status"),
          ]}
          rows={activeLegalHolds.map((hold) => [
            formatPlatformCodeLabel(locale, hold.family),
            hold.subjectId,
            hold.caseNumber,
            formatPlatformCodeLabel(locale, hold.status),
          ])}
        />
        <GovernanceTableCard
          title={t("audit.exceptions.title")}
          emptyLabel={t("audit.exceptions.empty")}
          columns={[
            t("audit.exceptions.family"),
            t("audit.exceptions.subject"),
            t("audit.exceptions.reason"),
            t("audit.exceptions.expiresAt"),
          ]}
          rows={activeDeletionExceptions.map((exception) => [
            formatPlatformCodeLabel(locale, exception.family),
            exception.subjectId,
            formatPlatformCodeLabel(locale, exception.reasonCode),
            formatDateTime(exception.expiresAt),
          ])}
        />
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
                <th>{getPlatformLabel(locale, "id")}</th>
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
                        <div>
                          {truncate(
                            r.actorId ||
                              formatPlatformCodeLabel(locale, "system"),
                            16,
                          )}
                        </div>
                        <span
                          className="admin-badge admin-badge--neutral"
                          style={{ fontSize: 10 }}
                        >
                          {formatPlatformCodeLabel(locale, r.actorType)}
                        </span>
                      </div>
                    </td>
                    <td>{formatPlatformCodeLabel(locale, r.moduleName)}</td>
                    <td>
                      <span className="admin-badge admin-badge--info">
                        {formatPlatformCodeLabel(locale, r.actionName)}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {formatPlatformCodeLabel(locale, r.resourceType)}
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

function AuditMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-card">
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function GovernanceTableCard({
  title,
  columns,
  rows,
  emptyLabel,
}: {
  title: string;
  columns: string[];
  rows: string[][];
  emptyLabel: string;
}) {
  return (
    <div className="admin-card">
      <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>{title}</h2>
      {rows.length === 0 ? (
        <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
          {emptyLabel}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${index}-${cellIndex}`}>{cell}</td>
                  ))}
                </tr>
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
          {t("common.noValues")}
        </span>
      )}
    </div>
  );
}
