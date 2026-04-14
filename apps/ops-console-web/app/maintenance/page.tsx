"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import type {
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";

const STATUSES: MaintenanceStatus[] = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "overdue",
];

const TYPES: MaintenanceType[] = [
  "scheduled_service",
  "repair",
  "inspection",
  "recall",
  "tire_replacement",
  "oil_change",
  "brake_service",
  "other",
];

export default function MaintenancePage() {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    setLoading(true);
    const client = getOpsClient();
    try {
      const result = await client.listMaintenance();
      setRecords(result ?? []);
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
        title="Vehicle Maintenance"
        description="Track scheduled and completed maintenance for fleet vehicles."
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
            + Create Work Order
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
          <MaintenanceForm
            editingRecord={
              editingId
                ? records.find((r) => r.maintenanceId === editingId)
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
                  await client.updateMaintenance(editingId, command);
                } else {
                  await client.createMaintenance(command);
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
          <p>Loading maintenance records...</p>
        ) : records.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Vehicle</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Technician</th>
                  <th>Cost</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r: MaintenanceRecord) => (
                  <tr key={r.maintenanceId}>
                    <td>{r.maintenanceId}</td>
                    <td>{r.vehicleId}</td>
                    <td>{r.type?.replace(/_/g, " ") ?? "-"}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td
                      style={{
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.description ?? "-"}
                    </td>
                    <td>{r.technician ?? "-"}</td>
                    <td>{r.cost != null ? `$${r.cost}` : "-"}</td>
                    <td>
                      {r.updatedAt
                        ? new Date(r.updatedAt).toLocaleString()
                        : "-"}
                    </td>
                    <td>
                      {r.status !== "completed" && r.status !== "cancelled" && (
                        <>
                          <button
                            className="btn-sm"
                            onClick={async () => {
                              const client = getOpsClient();
                              try {
                                await client.updateMaintenance(
                                  r.maintenanceId,
                                  {
                                    status: "completed" as MaintenanceStatus,
                                  },
                                );
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
                            Complete
                          </button>
                          <button
                            className="btn-sm"
                            style={{ marginLeft: 4 }}
                            onClick={() => setEditingId(r.maintenanceId)}
                          >
                            Edit
                          </button>
                        </>
                      )}
                      {r.status === "completed" || r.status === "cancelled" ? (
                        <button
                          className="btn-sm btn-danger"
                          style={{ marginLeft: 4 }}
                          onClick={async () => {
                            if (!confirm("Delete this maintenance record?"))
                              return;
                            const client = getOpsClient();
                            try {
                              await client.deleteMaintenance(r.maintenanceId);
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
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No maintenance records. Vehicles under maintenance cannot be
            dispatched.
          </p>
        )}
        <Link className="route-link" href="/">
          <strong>Back to home</strong> Return to ops console overview.
        </Link>
      </AppShellCard>
    </main>
  );
}

function MaintenanceForm({
  editingRecord,
  onCancel,
  onSubmit,
}: {
  editingRecord?: MaintenanceRecord | undefined;
  onCancel: () => void;
  onSubmit: (command: any) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [vehicleId, setVehicleId] = useState(editingRecord?.vehicleId ?? "");
  const [type, setType] = useState<MaintenanceType>(
    editingRecord?.type ?? "scheduled_service",
  );
  const [description, setDescription] = useState(
    editingRecord?.description ?? "",
  );
  const [status, setStatus] = useState<MaintenanceStatus>(
    editingRecord?.status ?? "scheduled",
  );
  const [technician, setTechnician] = useState(editingRecord?.technician ?? "");
  const [cost, setCost] = useState(
    editingRecord?.cost != null ? String(editingRecord.cost) : "",
  );
  const [notes, setNotes] = useState(editingRecord?.notes ?? "");
  const [scheduledAt, setScheduledAt] = useState(
    editingRecord?.scheduledAt
      ? new Date(editingRecord.scheduledAt).toISOString().slice(0, 16)
      : "",
  );
  const [completedAt, setCompletedAt] = useState(
    editingRecord?.completedAt
      ? new Date(editingRecord.completedAt).toISOString().slice(0, 16)
      : "",
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId.trim() || !description.trim()) {
      return;
    }
    startTransition(async () => {
      const command: any = {
        vehicleId: vehicleId.trim(),
        type,
        description: description.trim(),
        technician: technician || undefined,
        notes: notes || undefined,
      };

      if (!editingRecord) {
        // create command
        if (scheduledAt)
          command.scheduledAt = new Date(scheduledAt).toISOString();
        if (cost) command.cost = Number(cost);
      } else {
        // update command
        command.status = status;
        if (completedAt)
          command.completedAt = new Date(completedAt).toISOString();
        if (cost) command.cost = Number(cost);
      }

      await onSubmit(command);
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
        {editingRecord ? "Edit Work Order" : "Create Work Order"}
      </h3>

      <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
        <label style={{ flex: 1 }}>
          Vehicle ID *
          <input
            type="text"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            required
            disabled={!!editingRecord}
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              marginTop: 4,
            }}
          />
        </label>

        <label style={{ flex: 1 }}>
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as MaintenanceType)}
            style={{
              display: "block",
              marginTop: 4,
              padding: 4,
              width: "100%",
            }}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        {!editingRecord && (
          <label style={{ flex: 1 }}>
            Scheduled At
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              style={{
                display: "block",
                marginTop: 4,
                padding: 4,
                width: "100%",
              }}
            />
          </label>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>
          Description *
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
        </label>
      </div>

      {editingRecord && (
        <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
          <label style={{ flex: 1 }}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}
              style={{
                display: "block",
                marginTop: 4,
                padding: 4,
                width: "100%",
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
            Completed At
            <input
              type="datetime-local"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
              style={{
                display: "block",
                marginTop: 4,
                padding: 4,
                width: "100%",
              }}
            />
          </label>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
        <label style={{ flex: 1 }}>
          Technician
          <input
            type="text"
            value={technician}
            onChange={(e) => setTechnician(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              marginTop: 4,
            }}
          />
        </label>

        <label style={{ flex: 1 }}>
          Cost ($)
          <input
            type="number"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              marginTop: 4,
            }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              marginTop: 4,
            }}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving..." : editingRecord ? "Update" : "Create"}
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

function StatusBadge({ status }: { status: MaintenanceStatus }) {
  const colors: Record<MaintenanceStatus, string> = {
    scheduled: "#007AFF",
    in_progress: "#FF9500",
    completed: "#34C759",
    cancelled: "#8E8E93",
    overdue: "#FF3B30",
  };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        backgroundColor: colors[status],
        color: "#fff",
        fontSize: "12px",
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}
