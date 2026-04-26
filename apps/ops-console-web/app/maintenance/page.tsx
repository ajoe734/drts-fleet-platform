"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { PageHeader } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import type {
  CreateMaintenanceRecordCommand,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
  UpdateMaintenanceRecordCommand,
} from "@drts/contracts";
import { MAINTENANCE_STATUSES, MAINTENANCE_TYPES } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { isMaintenanceOverdue } from "@/lib/ops-analytics";

const STATUSES: MaintenanceStatus[] = [...MAINTENANCE_STATUSES];
const TYPES: MaintenanceType[] = [...MAINTENANCE_TYPES];

function maintenanceStatusLabel(locale: "en" | "zh", value: string) {
  if (locale !== "zh") return value;
  switch (value) {
    case "scheduled":
      return "已排程";
    case "in_progress":
      return "進行中";
    case "completed":
      return "已完成";
    case "cancelled":
      return "已取消";
    case "overdue":
      return "逾期";
    default:
      return value;
  }
}

function maintenanceTypeLabel(locale: "en" | "zh", value: string) {
  if (locale !== "zh") return value.replace(/_/g, " ");
  switch (value) {
    case "scheduled_service":
      return "定期保養";
    case "repair":
      return "維修";
    case "inspection":
      return "檢驗";
    case "cleaning":
      return "清潔";
    case "tire_service":
      return "輪胎服務";
    default:
      return value.replace(/_/g, " ");
  }
}

function formatCost(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function MaintenancePage() {
  const { locale, t } = useTranslation();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | "all">(
    "all",
  );
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    void loadRecords();
  }, []);

  async function loadRecords() {
    setLoading(true);
    try {
      const client = getOpsClient();
      setRecords(await client.listMaintenance());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setLoading(false);
    }
  }

  const filteredRecords = records.filter((record) => {
    const effectiveStatus = isMaintenanceOverdue(record)
      ? "overdue"
      : record.status;
    if (statusFilter !== "all" && effectiveStatus !== statusFilter) {
      return false;
    }
    if (!deferredQuery) return true;
    const haystack = [
      record.maintenanceId,
      record.vehicleId,
      record.type,
      record.status,
      record.description,
      record.technician ?? "",
      record.notes ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(deferredQuery);
  });

  const overdueCount = records.filter((record) =>
    isMaintenanceOverdue(record),
  ).length;
  const activeCount = records.filter(
    (record) =>
      record.status === "scheduled" || record.status === "in_progress",
  ).length;
  const completedCount = records.filter(
    (record) => record.status === "completed",
  ).length;

  return (
    <>
      <PageHeader
        title={t("maintenance.title")}
        subtitle={t("maintenance.subtitle")}
      />
      <div>
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <section className="summary-grid">
          {[
            {
              label: t("maintenance.activeOrders"),
              value: activeCount,
              note: t("maintenance.activeOrdersSub"),
            },
            {
              label: t("maintenance.overdue"),
              value: overdueCount,
              note: t("maintenance.overdueSub"),
            },
            {
              label: t("maintenance.completed"),
              value: completedCount,
              note: t("maintenance.completedSub"),
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
            placeholder={t("maintenance.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as MaintenanceStatus | "all")
            }
          >
            <option value="all">{t("common.allStatuses")}</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {maintenanceStatusLabel(locale, status)}
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
            {t("maintenance.createBtn")}
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
          <MaintenanceForm
            editingRecord={
              editingId
                ? records.find((record) => record.maintenanceId === editingId)
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
                  await client.updateMaintenance(
                    editingId,
                    command as UpdateMaintenanceRecordCommand,
                  );
                } else {
                  await client.createMaintenance(
                    command as CreateMaintenanceRecordCommand,
                  );
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
          <p>{t("common.loading")}</p>
        ) : (
          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">{t("maintenance.registry")}</p>
                <h3>{t("maintenance.backlog")}</h3>
              </div>
              <span className="panel-note">
                {t("maintenance.visibleOrders", {
                  count: filteredRecords.length,
                })}
              </span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("maintenance.col.workOrder")}</th>
                  <th>{t("maintenance.col.status")}</th>
                  <th>{t("maintenance.col.vehicle")}</th>
                  <th>{t("maintenance.col.schedule")}</th>
                  <th>{t("maintenance.col.technician")}</th>
                  <th>{t("maintenance.col.cost")}</th>
                  <th>{t("maintenance.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length > 0 ? (
                  filteredRecords.map((record) => {
                    const overdue = isMaintenanceOverdue(record);
                    const effectiveStatus = overdue ? "overdue" : record.status;
                    return (
                      <tr
                        key={record.maintenanceId}
                        className={overdue ? "row-overdue" : ""}
                      >
                        <td>
                          <div className="cell-title">
                            {record.maintenanceId}
                          </div>
                          <div className="cell-subcopy">
                            {maintenanceTypeLabel(locale, record.type)}
                          </div>
                          <div className="cell-subcopy">
                            {record.description}
                          </div>
                        </td>
                        <td>
                          <span className="status-badge">
                            {maintenanceStatusLabel(locale, effectiveStatus)}
                          </span>
                        </td>
                        <td>
                          <Link className="inline-link" href="/vehicles">
                            {record.vehicleId}
                          </Link>
                        </td>
                        <td>
                          <div className="cell-subcopy">
                            {t("common.scheduledAt", {
                              value: record.scheduledAt
                                ? new Date(record.scheduledAt).toLocaleString()
                                : "-",
                            })}
                          </div>
                          <div className="cell-subcopy">
                            {t("common.completedAt", {
                              value: record.completedAt
                                ? new Date(record.completedAt).toLocaleString()
                                : "-",
                            })}
                          </div>
                        </td>
                        <td>{record.technician ?? "-"}</td>
                        <td>{formatCost(record.cost)}</td>
                        <td>
                          <div className="action-stack">
                            {record.status !== "completed" &&
                              record.status !== "cancelled" && (
                                <button
                                  className="btn"
                                  type="button"
                                  onClick={() =>
                                    setEditingId(record.maintenanceId)
                                  }
                                >
                                  {t("common.edit")}
                                </button>
                              )}
                            {record.status !== "completed" &&
                              record.status !== "cancelled" && (
                                <button
                                  className="btn btn-warning"
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const client = getOpsClient();
                                      await client.updateMaintenance(
                                        record.maintenanceId,
                                        {
                                          status: "completed",
                                        },
                                      );
                                      await loadRecords();
                                    } catch (e) {
                                      setError(
                                        e instanceof Error
                                          ? e.message
                                          : t("common.unknown"),
                                      );
                                    }
                                  }}
                                >
                                  {t("maintenance.completeBtn")}
                                </button>
                              )}
                            <button
                              className="btn"
                              type="button"
                              onClick={async () => {
                                try {
                                  const client = getOpsClient();
                                  await client.deleteMaintenance(
                                    record.maintenanceId,
                                  );
                                  await loadRecords();
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : t("common.unknown"),
                                  );
                                }
                              }}
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7}>{t("maintenance.empty")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <Link className="route-link" href="/dashboard">
          <strong>{t("common.backToDashboard")}</strong>{" "}
          {t("common.backToDashboardSub")}
        </Link>

        <style jsx>{`
          .summary-grid,
          .toolbar,
          .action-stack {
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
            grid-template-columns: 2fr minmax(0, 1fr) auto auto;
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
          .panel-head {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            align-items: flex-start;
            margin-bottom: 0.75rem;
          }
          .eyebrow,
          .panel-note,
          .cell-subcopy {
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
          .status-badge {
            display: inline-block;
            padding: 0.25rem 0.6rem;
            border-radius: 999px;
            background: #f1f5f9;
          }
          .row-overdue {
            background: #fff7ed;
          }
          .inline-link,
          .route-link {
            color: #0f172a;
            text-decoration: none;
          }
        `}</style>
      </div>
    </>
  );
}

function MaintenanceForm({
  editingRecord,
  onCancel,
  onSubmit,
}: {
  editingRecord: MaintenanceRecord | undefined;
  onCancel: () => void;
  onSubmit: (
    command: CreateMaintenanceRecordCommand | UpdateMaintenanceRecordCommand,
  ) => Promise<void>;
}) {
  const { locale, t } = useTranslation();
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
  const [technician, setTechnician] = useState(editingRecord?.technician ?? "");
  const [cost, setCost] = useState(
    editingRecord?.cost !== null && editingRecord?.cost !== undefined
      ? String(editingRecord.cost)
      : "",
  );
  const [notes, setNotes] = useState(editingRecord?.notes ?? "");

  const isEditing = Boolean(editingRecord);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      if (isEditing) {
        const command: UpdateMaintenanceRecordCommand = {
          status,
          ...(completedAt
            ? { completedAt: new Date(completedAt).toISOString() }
            : {}),
          ...(technician.trim() ? { technician: technician.trim() } : {}),
          ...(cost ? { cost: Number(cost) } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        };
        void onSubmit(command);
        return;
      }

      const command: CreateMaintenanceRecordCommand = {
        vehicleId: vehicleId.trim(),
        type,
        description: description.trim(),
        ...(scheduledAt
          ? { scheduledAt: new Date(scheduledAt).toISOString() }
          : {}),
        ...(technician.trim() ? { technician: technician.trim() } : {}),
        ...(cost ? { cost: Number(cost) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      void onSubmit(command);
    });
  }

  return (
    <form className="maintenance-form" onSubmit={handleSubmit}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">{t("maintenance.form.editor")}</p>
          <h3>
            {isEditing
              ? t("maintenance.form.updateTitle")
              : t("maintenance.form.createTitle")}
          </h3>
        </div>
      </div>
      <div className="form-grid">
        {!isEditing && (
          <>
            <label>
              {t("maintenance.form.vehicleId")}
              <input
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                required
              />
            </label>
            <label>
              {t("maintenance.form.type")}
              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as MaintenanceType)
                }
              >
                {TYPES.map((value) => (
                  <option key={value} value={value}>
                    {maintenanceTypeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              {t("maintenance.form.description")}
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                required
              />
            </label>
            <label>
              {t("maintenance.form.scheduledAt")}
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
          </>
        )}
        {isEditing && (
          <>
            <label>
              {t("maintenance.form.status") || t("common.status")}
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as MaintenanceStatus)
                }
              >
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {maintenanceStatusLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("maintenance.form.completedAt")}
              <input
                type="datetime-local"
                value={completedAt}
                onChange={(event) => setCompletedAt(event.target.value)}
              />
            </label>
          </>
        )}
        <label>
          {t("maintenance.form.technician")}
          <input
            value={technician}
            onChange={(event) => setTechnician(event.target.value)}
          />
        </label>
        <label>
          {t("maintenance.form.cost")}
          <input
            type="number"
            min="0"
            step="1"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </label>
        <label className="full-width">
          {t("maintenance.form.notes")}
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
          />
        </label>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending
            ? t("maintenance.form.saving")
            : isEditing
              ? t("maintenance.form.saveChanges")
              : t("maintenance.form.createRecord")}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
      <style jsx>{`
        .maintenance-form {
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
