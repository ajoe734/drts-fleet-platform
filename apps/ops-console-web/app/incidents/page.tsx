"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import type {
  IncidentRecord,
  IncidentStatus,
  IncidentSeverity,
  IncidentCategory,
  CreateIncidentCommand,
} from "@drts/contracts";
import {
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
  INCIDENT_CATEGORIES,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";

const STATUSES: IncidentStatus[] = [...INCIDENT_STATUSES];
const SEVERITIES: IncidentSeverity[] = [...INCIDENT_SEVERITIES];
const CATEGORIES: IncidentCategory[] = [...INCIDENT_CATEGORIES];

export default function IncidentsPage() {
  const [records, setRecords] = useState<IncidentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    void loadRecords();
  }, []);

  const loadRecords = async () => {
    setLoading(true);
    const client = getOpsClient();
    try {
      const result = await client.listIncidents();
      const list = (result as any)?.items ?? result ?? [];
      setRecords(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-grid">
      <AppShellCard
        title="Incidents"
        description="ROC incident tracking surface. Incidents are distinct from complaint cases."
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <button
            className="btn-primary"
            onClick={() => {
              setShowCreate(true);
              setEditingId(null);
            }}
          >
            + Report Incident
          </button>
          <button
            className="btn-secondary"
            onClick={loadRecords}
            style={{ marginLeft: 8 }}
          >
            Refresh
          </button>
        </div>

        {(showCreate || editingId) && (
          <IncidentForm
            editingRecord={
              editingId
                ? records.find((r) => r.incidentId === editingId)
                : undefined
            }
            onCancel={() => {
              setShowCreate(false);
              setEditingId(null);
            }}
            onSubmit={async (command) => {
              const client = getOpsClient();
              try {
                if (editingId) {
                  await client.updateIncident(editingId, command);
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
        ) : records.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th>Reported By</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((inc: IncidentRecord) => (
                  <tr key={inc.incidentId}>
                    <td>{inc.incidentId}</td>
                    <td>{inc.title ?? "-"}</td>
                    <td>{inc.category ?? "-"}</td>
                    <td>{inc.severity ?? "-"}</td>
                    <td>{inc.status ?? "-"}</td>
                    <td>{inc.assignedTo ?? "-"}</td>
                    <td>{inc.reportedBy ?? "-"}</td>
                    <td>
                      {inc.createdAt
                        ? new Date(inc.createdAt).toLocaleString()
                        : "-"}
                    </td>
                    <td>
                      {inc.status !== "resolved" && inc.status !== "closed" && (
                        <>
                          <button
                            className="btn-sm"
                            onClick={() => setEditingId(inc.incidentId)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-sm"
                            style={{ marginLeft: 4 }}
                            onClick={async () => {
                              const note = prompt(
                                "Resolution note (optional):",
                                inc.resolutionNote ?? "",
                              );
                              const client = getOpsClient();
                              try {
                                await client.updateIncident(inc.incidentId, {
                                  status: "resolved",
                                  resolutionNote: note ?? undefined,
                                });
                                await loadRecords();
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
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No incidents reported. Incidents track safety events and operational
            escalations.
          </p>
        )}
        <Link className="route-link" href="/">
          <strong>Back to home</strong> Return to ops console overview.
        </Link>
      </AppShellCard>
    </main>
  );
}

function IncidentForm({
  editingRecord,
  onCancel,
  onSubmit,
}: {
  editingRecord?: IncidentRecord | undefined;
  onCancel: () => void;
  onSubmit: (
    command:
      | CreateIncidentCommand
      | {
          status?: IncidentStatus;
          assignedTo?: string;
          resolutionNote?: string;
        },
  ) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  // Create fields
  const [title, setTitle] = useState(editingRecord?.title ?? "");
  const [description, setDescription] = useState(
    editingRecord?.description ?? "",
  );
  const [category, setCategory] = useState<IncidentCategory>(
    (editingRecord?.category as IncidentCategory) ?? "operational",
  );
  const [severity, setSeverity] = useState<IncidentSeverity>(
    (editingRecord?.severity as IncidentSeverity) ?? "medium",
  );
  const [reportedBy, setReportedBy] = useState(
    editingRecord?.reportedBy ?? "ops-user-001",
  );
  const [location, setLocation] = useState(editingRecord?.location ?? "");

  // Update-only fields
  const [status, setStatus] = useState<IncidentStatus>(
    (editingRecord?.status as IncidentStatus) ?? "open",
  );
  const [assignedTo, setAssignedTo] = useState(editingRecord?.assignedTo ?? "");
  const [resolutionNote, setResolutionNote] = useState(
    editingRecord?.resolutionNote ?? "",
  );

  const isEditing = !!editingRecord;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      if (!isEditing) {
        const base: CreateIncidentCommand = {
          title: title.trim(),
          description: description.trim(),
          category,
          severity,
          reportedBy: reportedBy.trim() || "ops-user-001",
        };
        const command = { ...base } as CreateIncidentCommand;
        if (location) (command as any).location = location;
        await onSubmit(command as CreateIncidentCommand);
      } else {
        const command: {
          status?: IncidentStatus;
          assignedTo?: string;
          resolutionNote?: string;
        } = {};
        if (status) command.status = status;
        if (assignedTo) command.assignedTo = assignedTo.trim();
        if (resolutionNote) command.resolutionNote = resolutionNote.trim();
        await onSubmit(command);
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: "1px solid #ccc",
        padding: 16,
        borderRadius: 8,
        marginBottom: 16,
        backgroundColor: "#fafafa",
      }}
    >
      <h3 style={{ marginTop: 0 }}>
        {isEditing ? "Edit Incident" : "Report Incident"}
      </h3>

      {!isEditing ? (
        <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
          <label style={{ flex: 1 }}>
            Title *
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{
                display: "block",
                width: "100%",
                padding: 8,
                marginTop: 4,
              }}
            />
          </label>
          <label style={{ flex: 1 }}>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as IncidentCategory)}
              style={{
                display: "block",
                width: "100%",
                padding: 4,
                marginTop: 4,
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Severity
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
              style={{
                display: "block",
                width: "100%",
                padding: 4,
                marginTop: 4,
              }}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
          <label style={{ flex: 1 }}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as IncidentStatus)}
              style={{
                display: "block",
                width: "100%",
                padding: 4,
                marginTop: 4,
              }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Assigned To
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="ops-user-id"
              style={{
                display: "block",
                width: "100%",
                padding: 8,
                marginTop: 4,
              }}
            />
          </label>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <label>
          {isEditing ? "Resolution Note" : "Description *"}
          {isEditing ? (
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={2}
              style={{
                display: "block",
                width: "100%",
                padding: 8,
                marginTop: 4,
              }}
            />
          ) : (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              style={{
                display: "block",
                width: "100%",
                padding: 8,
                marginTop: 4,
              }}
            />
          )}
        </label>
      </div>

      {!isEditing && (
        <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
          <label style={{ flex: 1 }}>
            Reported By
            <input
              type="text"
              value={reportedBy}
              onChange={(e) => setReportedBy(e.target.value)}
              placeholder="ops-user-001"
              style={{
                display: "block",
                width: "100%",
                padding: 8,
                marginTop: 4,
              }}
            />
          </label>
          <label style={{ flex: 1 }}>
            Location
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="optional"
              style={{
                display: "block",
                width: "100%",
                padding: 8,
                marginTop: 4,
              }}
            />
          </label>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving..." : isEditing ? "Update" : "Create"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
