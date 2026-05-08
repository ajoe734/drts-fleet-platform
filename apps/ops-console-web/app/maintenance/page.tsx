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
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";

const STATUSES: MaintenanceStatus[] = [...MAINTENANCE_STATUSES];
const TYPES: MaintenanceType[] = [...MAINTENANCE_TYPES];
type StatusFilter = MaintenanceStatus | "all";

function copy(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function formatCost(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getEffectiveStatus(record: MaintenanceRecord): MaintenanceStatus {
  return isMaintenanceOverdue(record) ? "overdue" : record.status;
}

export default function MaintenancePage() {
  const { t, locale } = useTranslation();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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
    const effectiveStatus = getEffectiveStatus(record);
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

  const effectiveStatusCounts = records.reduce<
    Record<MaintenanceStatus, number>
  >(
    (counts, record) => {
      const effectiveStatus = getEffectiveStatus(record);
      counts[effectiveStatus] += 1;
      return counts;
    },
    {
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      overdue: 0,
    },
  );
  const overdueCount = effectiveStatusCounts.overdue;
  const scheduledCount = effectiveStatusCounts.scheduled;
  const activeCount = records.filter(
    (record) =>
      record.status === "scheduled" || record.status === "in_progress",
  ).length;
  const completedCount = effectiveStatusCounts.completed;
  const dispatchImpactCount = records.filter(
    (record) =>
      isMaintenanceOverdue(record) ||
      record.status === "scheduled" ||
      record.status === "in_progress",
  ).length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const dueTodayCount = records.filter(
    (record) => record.scheduledAt?.slice(0, 10) === todayKey,
  ).length;
  const impactedVehicles = new Set(
    records
      .filter(
        (record) =>
          isMaintenanceOverdue(record) ||
          record.status === "scheduled" ||
          record.status === "in_progress",
      )
      .map((record) => record.vehicleId),
  );
  const watchlist = records
    .filter(
      (record) =>
        isMaintenanceOverdue(record) ||
        record.status === "scheduled" ||
        record.status === "in_progress",
    )
    .sort((left, right) => {
      const leftPriority = isMaintenanceOverdue(left)
        ? 0
        : left.status === "in_progress"
          ? 1
          : 2;
      const rightPriority = isMaintenanceOverdue(right)
        ? 0
        : right.status === "in_progress"
          ? 1
          : 2;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return (left.scheduledAt ?? "").localeCompare(right.scheduledAt ?? "");
    })
    .slice(0, 4);
  const statusTabs: Array<{
    value: StatusFilter;
    label: string;
    count: number;
  }> = [
    {
      value: "all",
      label: copy(locale, "All", "全部"),
      count: records.length,
    },
    {
      value: "scheduled",
      label: formatOpsCodeLabel(locale, "scheduled"),
      count: scheduledCount,
    },
    {
      value: "in_progress",
      label: formatOpsCodeLabel(locale, "in_progress"),
      count: effectiveStatusCounts.in_progress,
    },
    {
      value: "overdue",
      label: formatOpsCodeLabel(locale, "overdue"),
      count: overdueCount,
    },
    {
      value: "completed",
      label: formatOpsCodeLabel(locale, "completed"),
      count: completedCount,
    },
  ];

  function impactCue(record: MaintenanceRecord) {
    if (isMaintenanceOverdue(record)) {
      return {
        tone: "critical",
        title: copy(locale, "Dispatch hold recommended", "建議暫停派車"),
        detail: copy(
          locale,
          "Overdue maintenance is still open on this vehicle.",
          "此車輛仍有逾期工單未結案。",
        ),
      };
    }
    if (record.status === "in_progress") {
      return {
        tone: "warning",
        title: copy(locale, "Vehicle in workshop", "車輛仍在保修"),
        detail: copy(
          locale,
          "Keep spare capacity ready before assigning new trips.",
          "派新單前請先確認替代運能。",
        ),
      };
    }
    if (record.status === "scheduled") {
      return {
        tone: "info",
        title: copy(locale, "Schedule around service slot", "請避開保養時段"),
        detail: copy(
          locale,
          "Upcoming work order may reduce dispatchable supply.",
          "即將到來的工單可能影響可派車量。",
        ),
      };
    }
    return {
      tone: "neutral",
      title: copy(locale, "No dispatch impact", "目前無派車影響"),
      detail: copy(locale, "Record is already closed.", "工單已結案。"),
    };
  }

  return (
    <>
      <PageHeader
        title={t("maintenance.title")}
        subtitle={t("maintenance.subtitle")}
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
            {
              label: copy(locale, "Dispatch-impact backlog", "派車影響工單"),
              value: dispatchImpactCount,
              note: copy(
                locale,
                "Open work orders that may affect dispatch supply",
                "可能影響派車供給的未結工單",
              ),
            },
          ].map((card) => (
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
          ))}
        </section>

        <section className="watch-grid">
          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">
                  {copy(locale, "Dispatch impact", "派車影響")}
                </p>
                <h3>{copy(locale, "Operational watchlist", "營運關注清單")}</h3>
              </div>
              <span className="panel-note">
                {copy(locale, "Vehicles at risk", "受影響車輛")}{" "}
                {impactedVehicles.size}
              </span>
            </div>
            <div className="watch-list">
              {watchlist.length > 0 ? (
                watchlist.map((record) => {
                  const cue = impactCue(record);
                  return (
                    <div
                      key={record.maintenanceId}
                      className={`watch-card watch-${cue.tone}`}
                    >
                      <div>
                        <div className="cell-title">{record.vehicleId}</div>
                        <div className="cell-subcopy">
                          {record.maintenanceId} ·{" "}
                          {formatOpsCodeLabel(locale, record.type)}
                        </div>
                      </div>
                      <div>
                        <div className="watch-title">{cue.title}</div>
                        <div className="cell-subcopy">{cue.detail}</div>
                      </div>
                      <div className="cell-subcopy">
                        {copy(locale, "Scheduled", "排程")}{" "}
                        {record.scheduledAt
                          ? new Date(record.scheduledAt).toLocaleString()
                          : "-"}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="cell-subcopy">
                  {copy(
                    locale,
                    "No overdue or active maintenance items.",
                    "目前沒有逾期或進行中的保養工單。",
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">
                  {copy(locale, "Shift planner", "排程摘要")}
                </p>
                <h3>
                  {copy(locale, "Today and next actions", "今日與近期動作")}
                </h3>
              </div>
            </div>
            <div className="detail-card-grid">
              <div className="detail-card">
                <span>{copy(locale, "Due today", "今日到期")}</span>
                <strong>{dueTodayCount}</strong>
                <small>
                  {copy(
                    locale,
                    "Work orders scheduled for today",
                    "今天排定的工單數",
                  )}
                </small>
              </div>
              <div className="detail-card">
                <span>{copy(locale, "In workshop", "保修中")}</span>
                <strong>
                  {
                    records.filter((record) => record.status === "in_progress")
                      .length
                  }
                </strong>
                <small>
                  {copy(
                    locale,
                    "Vehicles currently unavailable",
                    "目前無法派車的車輛",
                  )}
                </small>
              </div>
              <div className="detail-card">
                <span>{copy(locale, "Ready to return", "可回歸車隊")}</span>
                <strong>{completedCount}</strong>
                <small>
                  {copy(
                    locale,
                    "Completed work orders awaiting dispatch reuse",
                    "已完成且可重新投入派車",
                  )}
                </small>
              </div>
            </div>
          </div>
        </section>

        <div className="toolbar">
          <div className="status-tabs">
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                className={statusFilter === tab.value ? "tab active" : "tab"}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
                <span>{tab.count}</span>
              </button>
            ))}
          </div>
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
              setStatusFilter(event.target.value as StatusFilter)
            }
          >
            <option value="all">{t("common.allStatuses")}</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatOpsCodeLabel(locale, status)}
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
                  <th>{copy(locale, "Dispatch cue", "派車提示")}</th>
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
                    const effectiveStatus = getEffectiveStatus(record);
                    const cue = impactCue(record);
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
                            {formatOpsCodeLabel(locale, record.type)}
                          </div>
                          <div className="cell-subcopy">
                            {record.description}
                          </div>
                        </td>
                        <td>
                          <span className="status-badge">
                            {formatOpsCodeLabel(locale, effectiveStatus)}
                          </span>
                        </td>
                        <td>
                          <div className={`impact-chip impact-${cue.tone}`}>
                            {cue.title}
                          </div>
                          <div className="cell-subcopy">{cue.detail}</div>
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
                    <td colSpan={8}>{t("maintenance.empty")}</td>
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
          .watch-grid,
          .toolbar,
          .action-stack,
          .detail-card-grid,
          .watch-list,
          .status-tabs {
            display: grid;
            gap: 0.75rem;
          }
          .summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            margin-bottom: 1rem;
          }
          .summary-card,
          .panel,
          .detail-card,
          .watch-card {
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
            grid-template-columns: minmax(0, 1.4fr) 2fr minmax(0, 1fr) auto auto;
            align-items: center;
            margin-bottom: 1rem;
          }
          .watch-grid {
            grid-template-columns: 1.2fr 0.8fr;
            margin-bottom: 1rem;
          }
          .detail-card-grid {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          }
          .detail-card {
            background: #f8fafc;
          }
          .watch-card {
            display: grid;
            gap: 0.4rem;
          }
          .watch-info {
            background: #eff6ff;
          }
          .watch-warning {
            background: #fff7ed;
          }
          .watch-critical {
            background: #fef2f2;
          }
          .status-tabs {
            grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
          }
          .tab {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.7rem 0.85rem;
            border-radius: 0.8rem;
            border: 1px solid #cbd5e1;
            background: #fff;
            cursor: pointer;
          }
          .tab.active {
            border-color: #0f172a;
            background: #0f172a;
            color: #fff;
          }
          .tab span {
            font-size: 0.82rem;
            opacity: 0.8;
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
          .impact-chip {
            display: inline-flex;
            padding: 0.22rem 0.6rem;
            border-radius: 999px;
            font-size: 0.78rem;
            margin-bottom: 0.2rem;
          }
          .impact-info {
            background: #eff6ff;
            color: #1d4ed8;
          }
          .impact-warning {
            background: #fff7ed;
            color: #c2410c;
          }
          .impact-critical {
            background: #fef2f2;
            color: #b91c1c;
          }
          .impact-neutral {
            background: #f1f5f9;
            color: #475569;
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
  const { t, locale } = useTranslation();
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
                    {formatOpsCodeLabel(locale, value)}
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
                    {formatOpsCodeLabel(locale, value)}
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
