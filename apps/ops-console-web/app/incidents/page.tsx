"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { PageHeader } from "@drts/ui-web";
import type {
  CreateIncidentCommand,
  IncidentCategory,
  IncidentRecord,
  IncidentSeverity,
  IncidentStatus,
  IncidentTimelineEntry,
  UpdateIncidentCommand,
} from "@drts/contracts";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";

const STATUSES: IncidentStatus[] = [...INCIDENT_STATUSES];
const SEVERITIES: IncidentSeverity[] = [...INCIDENT_SEVERITIES];
const CATEGORIES: IncidentCategory[] = [...INCIDENT_CATEGORIES];

export default function IncidentsPage() {
  const { t, locale } = useTranslation();
  const [records, setRecords] = useState<IncidentRecord[]>([]);
  const [timeline, setTimeline] = useState<IncidentTimelineEntry[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "all">(
    "all",
  );
  const [severityFilter, setSeverityFilter] = useState<
    IncidentSeverity | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<
    IncidentCategory | "all"
  >("all");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    void loadRecords();
  }, []);

  async function loadRecords() {
    setLoading(true);
    try {
      const client = getOpsClient();
      const result = await client.listIncidents();
      setRecords(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeline(incidentId: string) {
    try {
      const client = getOpsClient();
      const items = await client.getIncidentTimeline(incidentId);
      setSelectedIncidentId(incidentId);
      setTimeline(items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    }
  }

  const filteredRecords = records
    .filter((record) => {
      if (statusFilter !== "all" && record.status !== statusFilter)
        return false;
      if (severityFilter !== "all" && record.severity !== severityFilter) {
        return false;
      }
      if (categoryFilter !== "all" && record.category !== categoryFilter) {
        return false;
      }
      if (!deferredQuery) return true;
      const haystack = [
        record.incidentId,
        record.title,
        record.description,
        record.category,
        record.severity,
        record.status,
        record.relatedOrderId ?? "",
        record.relatedVehicleId ?? "",
        record.relatedDriverId ?? "",
        record.relatedComplaintCaseNo ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(deferredQuery);
    })
    .sort(compareIncidentPriority);
  const criticalQueue = records
    .filter(
      (record) =>
        record.severity === "critical" &&
        record.status !== "resolved" &&
        record.status !== "closed",
    )
    .sort(compareIncidentPriority);

  const openCount = records.filter(
    (record) => record.status === "open" || record.status === "investigating",
  ).length;
  const criticalCount = records.filter(
    (record) => record.severity === "critical",
  ).length;
  const linkedCount = records.filter(
    (record) =>
      record.relatedOrderId ||
      record.relatedVehicleId ||
      record.relatedComplaintCaseNo,
  ).length;

  function focusCriticalQueue() {
    const section = document.getElementById("critical-sos-queue");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <PageHeader
        title={t("incidents.title")}
        subtitle={t("incidents.subtitle")}
      />
      <div>
        {error && (
          <div className="error-banner">
            <strong>{getOpsLabel(locale, "error")}:</strong> {error}
          </div>
        )}

        <section className="summary-grid">
          {[
            {
              label: t("incidents.activeCount"),
              value: openCount,
              note: t("incidents.activeSub"),
              isCritical: false,
            },
            {
              label: t("incidents.criticalCount"),
              value: criticalCount,
              note: t("incidents.criticalSub"),
              isCritical: true,
            },
            {
              label: t("incidents.resolvedCount"),
              value: linkedCount,
              note: t("incidents.resolvedSub"),
              isCritical: false,
            },
          ].map((card) => (
            <button
              key={card.label}
              className={`summary-card ${card.isCritical ? "summary-card-alert" : ""}`}
              type="button"
              onClick={card.isCritical ? focusCriticalQueue : undefined}
            >
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </button>
          ))}
        </section>

        <section id="critical-sos-queue" className="sos-queue">
          <div className="panel-head">
            <div>
              <p className="eyebrow">
                {getOpsLabel(locale, "incidentsPriorityQueue")}
              </p>
              <h3>{getOpsLabel(locale, "incidentsCriticalQueue")}</h3>
            </div>
            <span className="panel-note">
              {getOpsLabel(locale, "incidentsActiveCritical", {
                count: criticalQueue.length,
              })}
            </span>
          </div>
          {criticalQueue.length > 0 ? (
            <div className="sos-list">
              {criticalQueue.map((record) => (
                <article key={record.incidentId} className="sos-card">
                  <div>
                    <div className="sos-title-row">
                      <strong className="cell-title">{record.title}</strong>
                      {renderSeverityBadge(record.severity, locale)}
                    </div>
                    <div className="cell-subcopy">
                      {record.incidentId} ·{" "}
                      {formatOpsCodeLabel(locale, record.category)}
                    </div>
                    <div className="cell-subcopy">{record.description}</div>
                  </div>
                  <div className="sos-meta">
                    <span className="status-pill">
                      {formatOpsCodeLabel(locale, record.status)}
                    </span>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => void loadTimeline(record.incidentId)}
                    >
                      {getOpsLabel(locale, "incidentsReviewTimeline")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="all-clear-copy">
              {getOpsLabel(locale, "incidentsAllClear")}
            </p>
          )}
        </section>

        <div className="toolbar">
          <input
            className="search-input"
            type="search"
            placeholder={t("incidents.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as IncidentStatus | "all")
            }
          >
            <option value="all">{t("incidents.allStatuses")}</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatOpsCodeLabel(locale, status)}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            value={severityFilter}
            onChange={(event) =>
              setSeverityFilter(event.target.value as IncidentSeverity | "all")
            }
          >
            <option value="all">{t("incidents.allSeverities")}</option>
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {formatOpsCodeLabel(locale, severity)}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(event.target.value as IncidentCategory | "all")
            }
          >
            <option value="all">{t("incidents.allCategories")}</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {formatOpsCodeLabel(locale, category)}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setShowCreate(true);
              setEditingId(null);
            }}
          >
            {t("incidents.createBtn")}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void loadRecords()}
          >
            {t("common.refresh")}
          </button>
        </div>

        {(showCreate || editingId) && (
          <IncidentForm
            editingRecord={
              editingId
                ? records.find((record) => record.incidentId === editingId)
                : undefined
            }
            onCancel={() => {
              setShowCreate(false);
              setEditingId(null);
            }}
            onSubmit={async (command) => {
              try {
                const client = getOpsClient();
                if (editingId) {
                  await client.updateIncident(
                    editingId,
                    command as UpdateIncidentCommand,
                  );
                } else {
                  await client.createIncident(command as CreateIncidentCommand);
                }
                setShowCreate(false);
                setEditingId(null);
                await loadRecords();
              } catch (e) {
                setError(e instanceof Error ? e.message : t("common.unknown"));
              }
            }}
          />
        )}

        {loading ? (
          <p>{getOpsLabel(locale, "incidentsLoading")}</p>
        ) : (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">{t("incidents.registry")}</p>
                  <h3>{t("incidents.backlog")}</h3>
                </div>
                <span className="panel-note">
                  {t("incidents.visible", { count: filteredRecords.length })}
                </span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("incidents.col.incident")}</th>
                    <th>{t("incidents.col.severity")}</th>
                    <th>{t("incidents.col.status")}</th>
                    <th>{t("incidents.col.vehicles")}</th>
                    <th>{t("incidents.col.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map((record) => (
                      <tr
                        key={record.incidentId}
                        className={
                          record.incidentId === selectedIncidentId
                            ? "row-selected"
                            : record.severity === "critical"
                              ? "row-critical"
                              : ""
                        }
                      >
                        <td>
                          <div className="cell-title">{record.title}</div>
                          <div className="cell-subcopy">
                            {record.incidentId} ·{" "}
                            {formatOpsCodeLabel(locale, record.category)}
                          </div>
                          <div className="cell-subcopy">
                            {record.description}
                          </div>
                        </td>
                        <td>{renderSeverityBadge(record.severity, locale)}</td>
                        <td>{formatOpsCodeLabel(locale, record.status)}</td>
                        <td>
                          <div className="link-stack">
                            {record.relatedOrderId && (
                              <Link
                                className="inline-link"
                                href={`/dispatch?orderId=${encodeURIComponent(record.relatedOrderId)}`}
                              >
                                {getOpsLabel(locale, "order")}{" "}
                                {record.relatedOrderId}
                              </Link>
                            )}
                            {record.relatedVehicleId && (
                              <Link className="inline-link" href="/vehicles">
                                {getOpsLabel(locale, "vehicle")}{" "}
                                {record.relatedVehicleId}
                              </Link>
                            )}
                            {record.relatedComplaintCaseNo && (
                              <Link className="inline-link" href="/complaints">
                                {getOpsLabel(locale, "complaint")}{" "}
                                {record.relatedComplaintCaseNo}
                              </Link>
                            )}
                            {!record.relatedOrderId &&
                              !record.relatedVehicleId &&
                              !record.relatedComplaintCaseNo && (
                                <span className="cell-subcopy">
                                  {getOpsLabel(
                                    locale,
                                    "incidentsNoLinkedEntities",
                                  )}
                                </span>
                              )}
                          </div>
                        </td>
                        <td>
                          <div className="link-stack">
                            <button
                              className="btn"
                              type="button"
                              onClick={() => setEditingId(record.incidentId)}
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              className="btn"
                              type="button"
                              onClick={() =>
                                void loadTimeline(record.incidentId)
                              }
                            >
                              {t("incidents.timeline")}
                            </button>
                            {record.status !== "resolved" &&
                              record.status !== "closed" && (
                                <button
                                  className="btn btn-warning"
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const client = getOpsClient();
                                      await client.updateIncident(
                                        record.incidentId,
                                        {
                                          status: "resolved",
                                        },
                                      );
                                      await loadRecords();
                                      if (
                                        selectedIncidentId === record.incidentId
                                      ) {
                                        await loadTimeline(record.incidentId);
                                      }
                                    } catch (e) {
                                      setError(
                                        e instanceof Error
                                          ? e.message
                                          : t("common.unknown"),
                                      );
                                    }
                                  }}
                                >
                                  {t("incidents.resolve")}
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>{t("incidents.empty")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">{t("incidents.timeline")}</p>
                  <h3>{selectedIncidentId ?? t("incidents.selectIncident")}</h3>
                </div>
              </div>
              {selectedIncidentId ? (
                timeline.length > 0 ? (
                  <ul className="timeline-list">
                    {timeline.map((entry) => (
                      <li key={entry.entryId}>
                        <strong>
                          {formatOpsCodeLabel(locale, entry.action)}
                        </strong>
                        <div>{entry.note}</div>
                        <small>
                          {entry.actor} ·{" "}
                          {new Date(entry.createdAt).toLocaleString()}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">{t("incidents.timelineEmpty")}</p>
                )
              ) : (
                <p className="empty-copy">
                  {getOpsLabel(locale, "incidentsSelectHint")}
                </p>
              )}
            </section>
          </div>
        )}

        <Link className="route-link" href="/dashboard">
          <strong>{t("common.backToDashboard")}</strong>{" "}
          {t("common.backToDashboardSub")}
        </Link>

        <style jsx>{`
          .summary-grid,
          .sos-list,
          .toolbar,
          .content-grid,
          .link-stack {
            display: grid;
            gap: 0.75rem;
          }
          .summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            margin-bottom: 1rem;
          }
          .summary-card,
          .sos-queue,
          .panel {
            padding: 1rem;
            border-radius: 1rem;
            border: 1px solid #e2e8f0;
            background: #fff;
          }
          .summary-card {
            background: #f8fafc;
            text-align: left;
            cursor: default;
          }
          .summary-card-alert {
            cursor: pointer;
            border-color: #fca5a5;
            background: linear-gradient(135deg, #fff1f2, #fef2f2);
          }
          .summary-card strong {
            font-size: 1.4rem;
          }
          .sos-queue {
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #fff7ed, #fff1f2);
          }
          .sos-card {
            display: grid;
            gap: 0.75rem;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            padding: 0.9rem 1rem;
            border-radius: 0.9rem;
            border: 1px solid #fdba74;
            background: rgba(255, 255, 255, 0.92);
          }
          .sos-title-row,
          .sos-meta {
            display: flex;
            gap: 0.75rem;
            align-items: center;
            flex-wrap: wrap;
          }
          .all-clear-copy {
            margin: 0;
            color: #166534;
          }
          .status-pill,
          .severity-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: fit-content;
            padding: 0.2rem 0.55rem;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 700;
            text-transform: capitalize;
          }
          .status-pill {
            background: #e2e8f0;
            color: #334155;
          }
          .severity-badge {
            border: 1px solid transparent;
          }
          .severity-critical {
            background: #fee2e2;
            border-color: #fca5a5;
            color: #b91c1c;
          }
          .severity-high {
            background: #ffedd5;
            border-color: #fdba74;
            color: #c2410c;
          }
          .severity-medium {
            background: #fef3c7;
            border-color: #fcd34d;
            color: #a16207;
          }
          .severity-low {
            background: #e2e8f0;
            border-color: #cbd5e1;
            color: #334155;
          }
          .toolbar {
            grid-template-columns: 2fr repeat(3, minmax(0, 1fr)) auto auto;
            align-items: center;
            margin-bottom: 1rem;
          }
          .search-input,
          .filter-select {
            width: 100%;
            padding: 0.75rem 0.85rem;
            border-radius: 0.8rem;
            border: 1px solid #cbd5e1;
          }
          .btn {
            padding: 0.65rem 0.85rem;
            border-radius: 0.75rem;
            border: 1px solid #cbd5e1;
            background: white;
            cursor: pointer;
          }
          .btn-primary {
            background: #0f172a;
            color: white;
            border-color: #0f172a;
          }
          .btn-warning {
            background: #fef3c7;
            border-color: #f59e0b;
            color: #92400e;
          }
          .content-grid {
            grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
          }
          .panel-head {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            align-items: flex-start;
            margin-bottom: 0.75rem;
          }
          .eyebrow,
          .panel-note,
          .cell-subcopy,
          .empty-copy {
            color: #64748b;
          }
          .eyebrow {
            margin: 0 0 0.25rem;
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
          }
          .table th,
          .table td {
            padding: 0.75rem 0.5rem;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
            vertical-align: top;
          }
          .cell-title {
            font-weight: 600;
            color: #0f172a;
          }
          .inline-link,
          .route-link {
            color: #0f172a;
            text-decoration: none;
          }
          .timeline-list {
            margin: 0;
            padding-left: 1rem;
            display: grid;
            gap: 0.9rem;
          }
          .timeline-list small {
            color: #64748b;
          }
          .row-selected {
            background: #eff6ff;
          }
          .row-critical {
            background: #fef2f2;
          }
          @media (max-width: 900px) {
            .toolbar,
            .content-grid,
            .sos-card {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </>
  );
}

function compareIncidentPriority(a: IncidentRecord, b: IncidentRecord) {
  const severityWeight =
    incidentSeverityWeight(b.severity) - incidentSeverityWeight(a.severity);
  if (severityWeight !== 0) return severityWeight;

  return (
    new Date(b.occurredAt ?? b.createdAt).getTime() -
    new Date(a.occurredAt ?? a.createdAt).getTime()
  );
}

function incidentSeverityWeight(severity: IncidentSeverity) {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function renderSeverityBadge(severity: IncidentSeverity, locale: "en" | "zh") {
  return (
    <span className={`severity-badge severity-${severity}`}>
      {formatOpsCodeLabel(locale, severity)}
    </span>
  );
}

function IncidentForm({
  editingRecord,
  onCancel,
  onSubmit,
}: {
  editingRecord: IncidentRecord | undefined;
  onCancel: () => void;
  onSubmit: (
    command: CreateIncidentCommand | UpdateIncidentCommand,
  ) => Promise<void>;
}) {
  const { t, locale } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(editingRecord?.title ?? "");
  const [description, setDescription] = useState(
    editingRecord?.description ?? "",
  );
  const [category, setCategory] = useState<IncidentCategory>(
    editingRecord?.category ?? "operational",
  );
  const [severity, setSeverity] = useState<IncidentSeverity>(
    editingRecord?.severity ?? "medium",
  );
  const [relatedOrderId, setRelatedOrderId] = useState(
    editingRecord?.relatedOrderId ?? "",
  );
  const [relatedVehicleId, setRelatedVehicleId] = useState(
    editingRecord?.relatedVehicleId ?? "",
  );
  const [relatedDriverId, setRelatedDriverId] = useState(
    editingRecord?.relatedDriverId ?? "",
  );
  const [reportedBy, setReportedBy] = useState(
    editingRecord?.reportedBy ?? "ops-user-001",
  );
  const [occurredAt, setOccurredAt] = useState(
    editingRecord?.occurredAt
      ? new Date(editingRecord.occurredAt).toISOString().slice(0, 16)
      : "",
  );
  const [location, setLocation] = useState(editingRecord?.location ?? "");
  const [status, setStatus] = useState<IncidentStatus>(
    editingRecord?.status ?? "open",
  );
  const [assignedTo, setAssignedTo] = useState(editingRecord?.assignedTo ?? "");
  const [resolutionNote, setResolutionNote] = useState(
    editingRecord?.resolutionNote ?? "",
  );

  const isEditing = Boolean(editingRecord);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      if (isEditing) {
        const command: UpdateIncidentCommand = {
          status,
          ...(assignedTo.trim() ? { assignedTo: assignedTo.trim() } : {}),
          ...(resolutionNote.trim()
            ? { resolutionNote: resolutionNote.trim() }
            : {}),
        };
        void onSubmit(command);
        return;
      }

      const command: CreateIncidentCommand = {
        title: title.trim(),
        description: description.trim(),
        category,
        severity,
        reportedBy: reportedBy.trim() || "ops-user-001",
        ...(relatedOrderId.trim()
          ? { relatedOrderId: relatedOrderId.trim() }
          : {}),
        ...(relatedVehicleId.trim()
          ? { relatedVehicleId: relatedVehicleId.trim() }
          : {}),
        ...(relatedDriverId.trim()
          ? { relatedDriverId: relatedDriverId.trim() }
          : {}),
        ...(occurredAt
          ? { occurredAt: new Date(occurredAt).toISOString() }
          : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
      };
      void onSubmit(command);
    });
  }

  return (
    <form className="incident-form" onSubmit={handleSubmit}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">{t("maintenance.form.editor")}</p>
          <h3>
            {isEditing
              ? t("incidents.form.updateTitle")
              : t("incidents.form.createTitle")}
          </h3>
        </div>
      </div>
      {!isEditing ? (
        <>
          <div className="form-grid">
            <label>
              {t("incidents.form.title")}
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <label>
              {t("incidents.form.reportedBy")}
              <input
                value={reportedBy}
                onChange={(event) => setReportedBy(event.target.value)}
                required
              />
            </label>
            <label>
              {t("incidents.form.category")}
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as IncidentCategory)
                }
              >
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {formatOpsCodeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("incidents.form.severity")}
              <select
                value={severity}
                onChange={(event) =>
                  setSeverity(event.target.value as IncidentSeverity)
                }
              >
                {SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {formatOpsCodeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("incidents.form.relatedOrder")}
              <input
                value={relatedOrderId}
                onChange={(event) => setRelatedOrderId(event.target.value)}
              />
            </label>
            <label>
              {t("incidents.form.relatedVehicle")}
              <input
                value={relatedVehicleId}
                onChange={(event) => setRelatedVehicleId(event.target.value)}
              />
            </label>
            <label>
              {t("incidents.form.relatedDriver")}
              <input
                value={relatedDriverId}
                onChange={(event) => setRelatedDriverId(event.target.value)}
              />
            </label>
            <label>
              {t("incidents.form.occurredAt")}
              <input
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </label>
            <label className="full-width">
              {t("incidents.form.location")}
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </label>
            <label className="full-width">
              {t("incidents.form.description")}
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                required
              />
            </label>
          </div>
        </>
      ) : (
        <div className="form-grid">
          <label>
            {t("incidents.form.status")}
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as IncidentStatus)
              }
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {formatOpsCodeLabel(locale, value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("incidents.form.assignedTo")}
            <input
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
            />
          </label>
          <label className="full-width">
            {t("incidents.form.resolutionNote")}
            <textarea
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              rows={4}
            />
          </label>
        </div>
      )}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending
            ? t("incidents.form.saving")
            : isEditing
              ? t("incidents.form.saveChanges")
              : t("incidents.form.createRecord")}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
      <style jsx>{`
        .incident-form {
          margin-bottom: 1rem;
          padding: 1rem;
          border-radius: 1rem;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .panel-head {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }
        .eyebrow {
          margin: 0 0 0.25rem;
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #64748b;
        }
        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }
        label {
          display: grid;
          gap: 0.35rem;
          color: #0f172a;
        }
        input,
        select,
        textarea {
          width: 100%;
          padding: 0.7rem 0.8rem;
          border-radius: 0.75rem;
          border: 1px solid #cbd5e1;
          background: white;
        }
        .full-width {
          grid-column: 1 / -1;
        }
        .form-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 0.75rem;
        }
      `}</style>
    </form>
  );
}
