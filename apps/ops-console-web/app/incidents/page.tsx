"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { AppShellCard } from "@drts/ui-web";
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

const STATUSES: IncidentStatus[] = [...INCIDENT_STATUSES];
const SEVERITIES: IncidentSeverity[] = [...INCIDENT_SEVERITIES];
const CATEGORIES: IncidentCategory[] = [...INCIDENT_CATEGORIES];

export default function IncidentsPage() {
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
      setError(e instanceof Error ? e.message : "Unknown error");
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
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  const filteredRecords = records.filter((record) => {
    if (statusFilter !== "all" && record.status !== statusFilter) return false;
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
  });

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

  return (
    <main className="app-grid">
      <AppShellCard
        title="Incidents"
        description="ROC incident tracking with filters, timeline review, and link-back into dispatch and vehicle surfaces."
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <section className="summary-grid">
          {[
            {
              label: "Open incidents",
              value: openCount,
              note: "Open and investigating cases",
            },
            {
              label: "Critical severity",
              value: criticalCount,
              note: "Immediate coordination required",
            },
            {
              label: "Cross-linked",
              value: linkedCount,
              note: "Connected to order / vehicle / complaint",
            },
          ].map((card) => (
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
          ))}
        </section>

        <div className="toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search incident, order, vehicle, or complaint"
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
            <option value="all">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
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
            <option value="all">All severities</option>
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
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
            <option value="all">All categories</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.replace(/_/g, " ")}
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
            Report incident
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void loadRecords()}
          >
            Refresh
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
                setError(e instanceof Error ? e.message : "Unknown error");
              }
            }}
          />
        )}

        {loading ? (
          <p>Loading incidents...</p>
        ) : (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Registry</p>
                  <h3>Incident queue</h3>
                </div>
                <span className="panel-note">
                  {filteredRecords.length} visible incident(s)
                </span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Incident</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Links</th>
                    <th>Actions</th>
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
                            {record.category.replace(/_/g, " ")}
                          </div>
                          <div className="cell-subcopy">
                            {record.description}
                          </div>
                        </td>
                        <td>{record.severity}</td>
                        <td>{record.status}</td>
                        <td>
                          <div className="link-stack">
                            {record.relatedOrderId && (
                              <Link
                                className="inline-link"
                                href={`/dispatch?orderId=${encodeURIComponent(record.relatedOrderId)}`}
                              >
                                Order {record.relatedOrderId}
                              </Link>
                            )}
                            {record.relatedVehicleId && (
                              <Link className="inline-link" href="/vehicles">
                                Vehicle {record.relatedVehicleId}
                              </Link>
                            )}
                            {record.relatedComplaintCaseNo && (
                              <Link className="inline-link" href="/complaints">
                                Complaint {record.relatedComplaintCaseNo}
                              </Link>
                            )}
                            {!record.relatedOrderId &&
                              !record.relatedVehicleId &&
                              !record.relatedComplaintCaseNo && (
                                <span className="cell-subcopy">
                                  No linked entities
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
                              Edit
                            </button>
                            <button
                              className="btn"
                              type="button"
                              onClick={() =>
                                void loadTimeline(record.incidentId)
                              }
                            >
                              Timeline
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
                                          : "Unknown error",
                                      );
                                    }
                                  }}
                                >
                                  Resolve
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        No incidents match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Timeline</p>
                  <h3>{selectedIncidentId ?? "Select an incident"}</h3>
                </div>
              </div>
              {selectedIncidentId ? (
                timeline.length > 0 ? (
                  <ul className="timeline-list">
                    {timeline.map((entry) => (
                      <li key={entry.entryId}>
                        <strong>{entry.action}</strong>
                        <div>{entry.note}</div>
                        <small>
                          {entry.actor} ·{" "}
                          {new Date(entry.createdAt).toLocaleString()}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">No timeline entries available.</p>
                )
              ) : (
                <p className="empty-copy">
                  Choose an incident row to inspect timeline and audit flow.
                </p>
              )}
            </section>
          </div>
        )}

        <Link className="route-link" href="/dashboard">
          <strong>Back to dashboard</strong> Return to the operations overview.
        </Link>

        <style jsx>{`
          .summary-grid,
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
          .panel {
            padding: 1rem;
            border-radius: 1rem;
            border: 1px solid #e2e8f0;
            background: #fff;
          }
          .summary-card {
            background: #f8fafc;
          }
          .summary-card strong {
            font-size: 1.4rem;
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
        `}</style>
      </AppShellCard>
    </main>
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
          <p className="eyebrow">Editor</p>
          <h3>{isEditing ? "Update incident" : "Report incident"}</h3>
        </div>
      </div>
      {!isEditing ? (
        <>
          <div className="form-grid">
            <label>
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <label>
              Reported by
              <input
                value={reportedBy}
                onChange={(event) => setReportedBy(event.target.value)}
                required
              />
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as IncidentCategory)
                }
              >
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Severity
              <select
                value={severity}
                onChange={(event) =>
                  setSeverity(event.target.value as IncidentSeverity)
                }
              >
                {SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Related order
              <input
                value={relatedOrderId}
                onChange={(event) => setRelatedOrderId(event.target.value)}
              />
            </label>
            <label>
              Related vehicle
              <input
                value={relatedVehicleId}
                onChange={(event) => setRelatedVehicleId(event.target.value)}
              />
            </label>
            <label>
              Related driver
              <input
                value={relatedDriverId}
                onChange={(event) => setRelatedDriverId(event.target.value)}
              />
            </label>
            <label>
              Occurred at
              <input
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </label>
            <label className="full-width">
              Location
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </label>
            <label className="full-width">
              Description
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
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as IncidentStatus)
              }
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assigned to
            <input
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
            />
          </label>
          <label className="full-width">
            Resolution note
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
            ? "Saving..."
            : isEditing
              ? "Save changes"
              : "Create incident"}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
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
