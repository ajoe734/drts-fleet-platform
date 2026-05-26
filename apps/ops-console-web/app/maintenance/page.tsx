"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { PageHeader } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import type {
  CreateMaintenanceRecordCommand,
  EmptyReason,
  EmptyStateEnvelope,
  MaintenanceListItem,
  MaintenanceStatus,
  MaintenanceType,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
  UpdateMaintenanceRecordCommand,
} from "@drts/contracts";
import { MAINTENANCE_STATUSES, MAINTENANCE_TYPES } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { isMaintenanceOverdue } from "@/lib/ops-analytics";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";

const STATUSES: MaintenanceStatus[] = [...MAINTENANCE_STATUSES];
const TYPES: MaintenanceType[] = [...MAINTENANCE_TYPES];
const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_INTERVAL_MS = 15_000;
const STALE_AFTER_MS = 20_000;
type StatusFilter = MaintenanceStatus | "all";
type PacketEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type RuntimeMaintenanceRecord = MaintenanceListItem & {
  effectiveStatus: MaintenanceStatus;
};

type PendingMutation = {
  mode: "create" | "edit";
  command: CreateMaintenanceRecordCommand | UpdateMaintenanceRecordCommand;
  record?: RuntimeMaintenanceRecord;
};

type ToastState = {
  tone: "success" | "danger";
  message: string;
};

const EMPTY_REASONS: PacketEmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

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

function formatDateTime(
  value: string | null,
  locale: "en" | "zh",
  fallback = "-",
): string {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toDateValue(value: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 16);
}

function getEffectiveStatus(record: MaintenanceListItem): MaintenanceStatus {
  return isMaintenanceOverdue(record) ? "overdue" : record.status;
}

function normalizeFreshness(
  refresh: UiRefreshMetadata | null,
): UiRefreshMetadata | null {
  if (!refresh) return refresh;
  if (
    refresh.dataFreshness === "degraded" ||
    refresh.dataFreshness === "unknown"
  ) {
    return refresh;
  }

  const generatedAt = new Date(refresh.generatedAt).getTime();
  if (Number.isNaN(generatedAt)) {
    return { ...refresh, dataFreshness: "unknown" };
  }

  return Date.now() - generatedAt > refresh.staleAfterMs
    ? { ...refresh, dataFreshness: "stale" }
    : { ...refresh, dataFreshness: "fresh" };
}

function toRuntimeRecord(
  record: MaintenanceListItem,
): RuntimeMaintenanceRecord {
  return {
    ...record,
    effectiveStatus: getEffectiveStatus(record),
  };
}

function impactCue(record: RuntimeMaintenanceRecord, locale: "en" | "zh") {
  if (record.effectiveStatus === "overdue") {
    return {
      tone: "critical",
      label: copy(locale, "Dispatch risk", "派車風險"),
      detail: copy(
        locale,
        "Overdue work order still blocks dispatch confidence.",
        "逾期工單仍持續影響可派車判斷。",
      ),
    };
  }
  if (record.status === "in_progress") {
    return {
      tone: "warning",
      label: copy(locale, "In workshop", "保修中"),
      detail: copy(
        locale,
        "Vehicle is currently unavailable for new assignments.",
        "車輛仍在廠內，暫不建議承接新任務。",
      ),
    };
  }
  if (record.status === "scheduled") {
    return {
      tone: "info",
      label: copy(locale, "Scheduled slot", "已排工時"),
      detail: copy(
        locale,
        "Plan around this service window before assigning trips.",
        "派車前請避開這段保養時窗。",
      ),
    };
  }
  return {
    tone: "neutral",
    label: copy(locale, "Closed", "已結案"),
    detail: copy(locale, "No active supply impact.", "目前沒有供給影響。"),
  };
}

function asPacketEmptyReason(value: string | null): PacketEmptyReason | null {
  if (!value) return null;
  return EMPTY_REASONS.includes(value as PacketEmptyReason)
    ? (value as PacketEmptyReason)
    : null;
}

function getDisabledActionHint(
  action: ResourceActionDescriptor | undefined,
  locale: "en" | "zh",
) {
  if (!action || action.enabled || !action.disabledReasonCode) return undefined;
  if (action.disabledReasonCode === "record_closed") {
    return copy(
      locale,
      "Closed work orders are read-only.",
      "已結案工單不可再編輯。",
    );
  }
  return action.disabledReasonCode;
}

export default function MaintenancePage() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const initialStatusFilter =
    searchParams.get("status") === "scheduled" ||
    searchParams.get("status") === "in_progress" ||
    searchParams.get("status") === "completed" ||
    searchParams.get("status") === "cancelled" ||
    searchParams.get("status") === "overdue"
      ? (searchParams.get("status") as StatusFilter)
      : "all";
  const linkedVehicleId = searchParams.get("vehicleId");
  const [records, setRecords] = useState<RuntimeMaintenanceRecord[]>([]);
  const [pageActions, setPageActions] = useState<ResourceActionDescriptor[]>(
    [],
  );
  const [refresh, setRefresh] = useState<UiRefreshMetadata | null>(null);
  const [serverEmptyState, setServerEmptyState] =
    useState<EmptyStateEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>(initialStatusFilter);
  const [vehicleFilter, setVehicleFilter] = useState(linkedVehicleId ?? "all");
  const [startDate, setStartDate] = useState(searchParams.get("start") ?? "");
  const [endDate, setEndDate] = useState(searchParams.get("end") ?? "");
  const [pendingMutation, setPendingMutation] =
    useState<PendingMutation | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const previewEmptyReason = asPacketEmptyReason(
    searchParams.get("emptyReason"),
  );
  const refreshTierLabel = REFRESH_TIER.toUpperCase();

  useEffect(() => {
    void loadRecords("initial");
  }, [linkedVehicleId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadRecords("poll");
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [linkedVehicleId]);

  useEffect(() => {
    setVehicleFilter(linkedVehicleId ?? "all");
  }, [linkedVehicleId]);

  useEffect(() => {
    if (!refresh) return;
    const timer = window.setInterval(() => {
      setRefresh((current) => normalizeFreshness(current));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [refresh?.generatedAt, refresh?.staleAfterMs]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadRecords(mode: "initial" | "manual" | "poll") {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const client = getOpsClient();
      const response = await client.listMaintenance(
        linkedVehicleId ?? undefined,
      );
      const nextRecords = response.items.map(toRuntimeRecord);
      setRecords(nextRecords);
      setPageActions(response.availableActions);
      setRefresh(normalizeFreshness(response.refresh));
      setServerEmptyState(response.emptyState ?? null);
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : t("common.unknown");
      setError(message);
      setRefresh((current) =>
        normalizeFreshness(
          current
            ? { ...current, dataFreshness: "degraded" }
            : {
                generatedAt: new Date().toISOString(),
                staleAfterMs: STALE_AFTER_MS,
                dataFreshness: "degraded",
                source: "live",
              },
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const filteredRecords = records.filter((record) => {
    if (statusFilter !== "all" && record.effectiveStatus !== statusFilter) {
      return false;
    }

    if (vehicleFilter !== "all" && record.vehicleId !== vehicleFilter) {
      return false;
    }

    const scheduleDate = record.scheduledAt?.slice(0, 10) ?? null;
    if (startDate && (!scheduleDate || scheduleDate < startDate)) {
      return false;
    }
    if (endDate && (!scheduleDate || scheduleDate > endDate)) {
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

  const statusCounts = records.reduce<Record<MaintenanceStatus, number>>(
    (counts, record) => {
      counts[record.effectiveStatus] += 1;
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

  const activeCount = records.filter(
    (record) =>
      record.effectiveStatus === "overdue" ||
      record.status === "scheduled" ||
      record.status === "in_progress",
  ).length;
  const overdueRecords = records.filter(
    (record) => record.effectiveStatus === "overdue",
  );
  const dueTodayCount = records.filter(
    (record) =>
      record.scheduledAt?.slice(0, 10) ===
      new Date().toISOString().slice(0, 10),
  ).length;
  const impactedVehicles = new Set(
    records
      .filter(
        (record) =>
          record.effectiveStatus === "overdue" ||
          record.status === "scheduled" ||
          record.status === "in_progress",
      )
      .map((record) => record.vehicleId),
  );
  const vehicleOptions = Array.from(
    new Set(records.map((record) => record.vehicleId)),
  ).sort();
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
      count: statusCounts.scheduled,
    },
    {
      value: "in_progress",
      label: formatOpsCodeLabel(locale, "in_progress"),
      count: statusCounts.in_progress,
    },
    {
      value: "overdue",
      label: formatOpsCodeLabel(locale, "overdue"),
      count: statusCounts.overdue,
    },
    {
      value: "completed",
      label: formatOpsCodeLabel(locale, "completed"),
      count: statusCounts.completed,
    },
    {
      value: "cancelled",
      label: formatOpsCodeLabel(locale, "cancelled"),
      count: statusCounts.cancelled,
    },
  ];

  const createAction = pageActions.find(
    (action) => action.action === "create_record",
  );
  const searchAction = pageActions.find(
    (action) => action.action === "search_records",
  );
  const filterAction = pageActions.find(
    (action) => action.action === "filter_records",
  );
  const refreshAction = pageActions.find(
    (action) => action.action === "refresh_records",
  );
  const hasPageAuthority =
    pageActions.length > 0 ||
    records.some((record) => record.availableActions.length > 0);

  const emptyState = resolveEmptyState({
    locale,
    error,
    previewEmptyReason,
    serverEmptyState,
    hasFilters:
      Boolean(deferredQuery) ||
      statusFilter !== "all" ||
      vehicleFilter !== "all" ||
      Boolean(startDate) ||
      Boolean(endDate),
    totalCount: records.length,
    filteredCount: filteredRecords.length,
    createAction: createAction ?? null,
  });

  const editingRecord =
    editingId === null
      ? undefined
      : records.find((record) => record.maintenanceId === editingId);

  async function runMutation() {
    if (!pendingMutation) return;
    const client = getOpsClient();
    try {
      if (pendingMutation.mode === "edit" && pendingMutation.record) {
        await client.updateMaintenance(
          pendingMutation.record.maintenanceId,
          pendingMutation.command as UpdateMaintenanceRecordCommand,
        );
      } else {
        await client.createMaintenance(
          pendingMutation.command as CreateMaintenanceRecordCommand,
        );
      }

      setShowCreate(false);
      setEditingId(null);
      setPendingMutation(null);
      setToast({
        tone: "success",
        message:
          pendingMutation.mode === "edit"
            ? copy(locale, "Maintenance record updated.", "工單已更新。")
            : copy(locale, "Maintenance record created.", "工單已建立。"),
      });
      await loadRecords("manual");
    } catch (mutationError) {
      setPendingMutation(null);
      setToast({
        tone: "danger",
        message:
          mutationError instanceof Error
            ? mutationError.message
            : t("common.unknown"),
      });
    }
  }

  return (
    <>
      <PageHeader
        title={copy(locale, "Vehicle Maintenance", "車輛保修")}
        subtitle={copy(
          locale,
          "Work orders, scheduling windows, technicians, and dispatch impact.",
          "工單、排程時窗、技師狀態與派車影響總覽。",
        )}
      />

      <div className="maintenance-page">
        {toast ? (
          <div className={`toast-banner toast-${toast.tone}`}>
            {toast.message}
          </div>
        ) : null}

        <section
          className={`refresh-strip freshness-${refresh?.dataFreshness ?? "unknown"}`}
        >
          <div>
            <p className="strip-label">
              {copy(locale, "Refresh tier", "更新等級")} · {refreshTierLabel} /
              15s
            </p>
            <strong>
              {describeFreshness(refresh, locale) ??
                copy(locale, "Waiting for first snapshot", "等待第一批快照")}
            </strong>
            <p className="strip-detail">
              {copy(locale, "Last generated", "快照時間")}{" "}
              {formatDateTime(refresh?.generatedAt ?? null, locale)}
              {" · "}
              {copy(locale, "Source", "來源")} {refresh?.source ?? "live"}
            </p>
          </div>
          <div className="refresh-actions">
            <span className="refresh-pill">
              {copy(locale, "Auto-refresh 15s", "每 15 秒輪詢")}
            </span>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => void loadRecords("manual")}
              disabled={refreshing || !refreshAction?.enabled}
              title={getDisabledActionHint(refreshAction, locale)}
            >
              {refreshing
                ? copy(locale, "Refreshing…", "更新中…")
                : t("common.refresh")}
            </button>
          </div>
        </section>

        {error ? (
          <div className="error-banner">
            <strong>{getOpsLabel(locale, "error")}:</strong> {error}
          </div>
        ) : null}

        {linkedVehicleId ? (
          <section className="entry-banner">
            <div>
              <p className="strip-label">
                {copy(locale, "Deep link context", "進入上下文")}
              </p>
              <strong>
                {copy(
                  locale,
                  `Vehicle ${linkedVehicleId} maintenance history is pre-filtered.`,
                  `已預先篩選車輛 ${linkedVehicleId} 的維保紀錄。`,
                )}
              </strong>
              <p className="strip-detail">
                {copy(
                  locale,
                  "Use the vehicle link to jump back to registry detail.",
                  "可用車輛連結返回車籍詳情。",
                )}
              </p>
            </div>
            <div className="refresh-actions">
              <Link
                className="ghost-link"
                href={`/vehicles/${linkedVehicleId}`}
              >
                {copy(locale, "Open vehicle", "開啟車輛")}
              </Link>
            </div>
          </section>
        ) : null}

        {overdueRecords.length > 0 ? (
          <section className="attention-banner">
            <div>
              <p className="strip-label">
                {copy(locale, "Overdue cluster", "逾期群集")}
              </p>
              <strong>
                {copy(
                  locale,
                  `${overdueRecords.length} overdue work order(s) need dispatch review.`,
                  `${overdueRecords.length} 筆逾期工單需要派車側重新評估。`,
                )}
              </strong>
            </div>
            <div className="attention-links">
              {overdueRecords.slice(0, 3).map((record) => (
                <Link
                  key={record.maintenanceId}
                  className="attention-link"
                  href={`/vehicles/${record.vehicleId}`}
                >
                  {record.vehicleId} · {record.maintenanceId}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="summary-grid">
          <MetricCard
            label={copy(locale, "Active backlog", "活躍積壓")}
            value={activeCount}
            detail={copy(
              locale,
              "Scheduled, in-progress, and overdue work orders",
              "已排程、進行中與逾期工單",
            )}
            tone="warning"
          />
          <MetricCard
            label={copy(locale, "Overdue", "逾期")}
            value={statusCounts.overdue}
            detail={copy(
              locale,
              "Urgent review for dispatchable supply",
              "需要立即檢查派車供給",
            )}
            tone="critical"
          />
          <MetricCard
            label={copy(locale, "Vehicles impacted", "受影響車輛")}
            value={impactedVehicles.size}
            detail={copy(
              locale,
              "Vehicles with open service impact",
              "目前仍受保養影響的車輛",
            )}
            tone="info"
          />
          <MetricCard
            label={copy(locale, "Due today", "今日排定")}
            value={dueTodayCount}
            detail={copy(
              locale,
              "Service slots dated today",
              "排程日期為今天的工單",
            )}
            tone="neutral"
          />
        </section>

        <section className="workspace-grid">
          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">
                  {copy(locale, "Work orders", "工單總覽")}
                </p>
                <h3>{copy(locale, "Maintenance backlog", "保修工單清單")}</h3>
                <p className="section-note">
                  {hasPageAuthority
                    ? copy(
                        locale,
                        "Actions on this board are rendered from availableActions.",
                        "此看板上的操作完全依 availableActions 呈現。",
                      )
                    : copy(
                        locale,
                        "Your current scope can only read this board.",
                        "你目前的權限只能唯讀此看板。",
                      )}
                </p>
              </div>
              <button
                className="primary-btn"
                type="button"
                onClick={() => {
                  if (!createAction?.enabled) return;
                  setShowCreate(true);
                  setEditingId(null);
                }}
                disabled={!createAction?.enabled}
                title={getDisabledActionHint(createAction, locale)}
              >
                {copy(locale, "Create record", "開立工單")}
              </button>
            </div>

            <div className="status-tabs">
              {statusTabs.map((tab) => (
                <button
                  key={tab.value}
                  className={statusFilter === tab.value ? "tab active" : "tab"}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                >
                  <span>{tab.label}</span>
                  <strong>{tab.count}</strong>
                </button>
              ))}
            </div>

            <div className="toolbar">
              <input
                className="search-input"
                type="search"
                placeholder={t("maintenance.search")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={!searchAction?.enabled}
              />
              <select
                className="filter-select"
                value={vehicleFilter}
                onChange={(event) => setVehicleFilter(event.target.value)}
                disabled={!filterAction?.enabled}
              >
                <option value="all">
                  {copy(locale, "All vehicles", "全部車輛")}
                </option>
                {vehicleOptions.map((vehicleId) => (
                  <option key={vehicleId} value={vehicleId}>
                    {vehicleId}
                  </option>
                ))}
              </select>
              <input
                className="filter-select"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                disabled={!filterAction?.enabled}
              />
              <input
                className="filter-select"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                disabled={!filterAction?.enabled}
              />
            </div>

            {showCreate || editingRecord ? (
              <MaintenanceForm
                editingRecord={editingRecord}
                onCancel={() => {
                  setShowCreate(false);
                  setEditingId(null);
                }}
                onSubmit={(command) => {
                  setPendingMutation({
                    mode: editingRecord ? "edit" : "create",
                    command,
                    ...(editingRecord ? { record: editingRecord } : {}),
                  });
                }}
              />
            ) : null}

            {loading ? (
              <div className="loading-panel">{t("common.loading")}</div>
            ) : emptyState ? (
              <EmptyStateCard
                locale={locale}
                state={emptyState}
                onPrimaryAction={() => {
                  if (emptyState.nextAction?.action === "create_record") {
                    setShowCreate(true);
                    setEditingId(null);
                    return;
                  }
                  void loadRecords("manual");
                }}
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy(locale, "WO", "工單")}</th>
                    <th>{copy(locale, "Vehicle", "車輛")}</th>
                    <th>{copy(locale, "Type", "類別")}</th>
                    <th>{t("maintenance.col.status")}</th>
                    <th>{copy(locale, "Schedule", "排定")}</th>
                    <th>{copy(locale, "Technician", "技師")}</th>
                    <th>{copy(locale, "Cost", "費用")}</th>
                    <th>{copy(locale, "Actions", "操作")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => {
                    const cue = impactCue(record, locale);
                    const editAction = record.availableActions.find(
                      (action) => action.action === "edit_record",
                    );
                    return (
                      <tr
                        key={record.maintenanceId}
                        className={
                          record.effectiveStatus === "overdue"
                            ? "row-overdue"
                            : ""
                        }
                      >
                        <td>
                          <div className="cell-title">
                            {record.maintenanceId}
                          </div>
                          <div className="cell-subcopy">
                            {record.description}
                          </div>
                        </td>
                        <td>
                          <Link
                            className="inline-link"
                            href={`/vehicles/${record.vehicleId}`}
                          >
                            {record.vehicleId}
                          </Link>
                        </td>
                        <td>{formatOpsCodeLabel(locale, record.type)}</td>
                        <td>
                          <span className={`status-badge tone-${cue.tone}`}>
                            {formatOpsCodeLabel(locale, record.effectiveStatus)}
                          </span>
                          <div className="cell-subcopy">{cue.label}</div>
                        </td>
                        <td>
                          <div className="cell-subcopy">
                            {copy(locale, "Scheduled", "排定")}{" "}
                            {formatDateTime(record.scheduledAt, locale)}
                          </div>
                          <div className="cell-subcopy">
                            {copy(locale, "Completed", "完成")}{" "}
                            {formatDateTime(record.completedAt, locale)}
                          </div>
                        </td>
                        <td>{record.technician ?? "-"}</td>
                        <td>{formatCost(record.cost)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="ghost-btn"
                              type="button"
                              onClick={() => {
                                if (!editAction?.enabled) return;
                                setEditingId(record.maintenanceId);
                                setShowCreate(false);
                              }}
                              disabled={!editAction?.enabled}
                              title={getDisabledActionHint(editAction, locale)}
                            >
                              {copy(locale, "Edit", "編輯")}
                            </button>
                            <Link
                              className="inline-link"
                              href={`/vehicles/${record.vehicleId}`}
                            >
                              {copy(locale, "Open vehicle", "開啟車輛")}
                            </Link>
                            {record.availableActions.length === 0 ? (
                              <span className="action-hint">
                                {copy(locale, "Read-only", "唯讀")}
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="side-rail">
            <div className="panel rail-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">
                    {copy(locale, "Dispatch impact", "派車影響")}
                  </p>
                  <h3>{copy(locale, "Needs review now", "目前需要關注")}</h3>
                </div>
              </div>
              <div className="watch-list">
                {(overdueRecords.length > 0
                  ? overdueRecords
                  : records.slice(0, 3)
                ).map((record) => {
                  const cue = impactCue(record, locale);
                  return (
                    <Link
                      key={record.maintenanceId}
                      className={`watch-card watch-${cue.tone}`}
                      href={`/vehicles/${record.vehicleId}`}
                    >
                      <div className="watch-head">
                        <strong>{record.vehicleId}</strong>
                        <span>{record.maintenanceId}</span>
                      </div>
                      <div className="watch-title">{cue.label}</div>
                      <div className="cell-subcopy">{cue.detail}</div>
                      <div className="cell-subcopy">
                        {formatDateTime(record.scheduledAt, locale)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="panel rail-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">
                    {copy(locale, "Filters", "篩選條件")}
                  </p>
                  <h3>{copy(locale, "Current scope", "目前範圍")}</h3>
                </div>
              </div>
              <dl className="scope-list">
                <div>
                  <dt>{copy(locale, "Status", "狀態")}</dt>
                  <dd>
                    {statusFilter === "all"
                      ? copy(locale, "All", "全部")
                      : formatOpsCodeLabel(locale, statusFilter)}
                  </dd>
                </div>
                <div>
                  <dt>{copy(locale, "Vehicle", "車輛")}</dt>
                  <dd>
                    {vehicleFilter === "all"
                      ? copy(locale, "All vehicles", "全部車輛")
                      : vehicleFilter}
                  </dd>
                </div>
                <div>
                  <dt>{copy(locale, "Date range", "日期區間")}</dt>
                  <dd>
                    {startDate || endDate
                      ? `${startDate || "…"} → ${endDate || "…"}`
                      : copy(locale, "No date filter", "未限制")}
                  </dd>
                </div>
                <div>
                  <dt>{copy(locale, "Visible rows", "顯示筆數")}</dt>
                  <dd>{filteredRecords.length}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {pendingMutation ? (
          <ConfirmDialog
            locale={locale}
            pendingMutation={pendingMutation}
            onCancel={() => setPendingMutation(null)}
            onConfirm={() => void runMutation()}
          />
        ) : null}

        <style jsx>{`
          .maintenance-page {
            display: grid;
            gap: 16px;
          }
          .toast-banner,
          .refresh-strip,
          .entry-banner,
          .attention-banner,
          .panel,
          .metric-card,
          .watch-card,
          .loading-panel {
            border-radius: 20px;
            border: 1px solid rgba(148, 163, 184, 0.22);
          }
          .toast-banner,
          .refresh-strip,
          .entry-banner,
          .attention-banner,
          .loading-panel,
          .panel,
          .metric-card {
            background: rgba(9, 16, 28, 0.84);
            box-shadow: 0 20px 40px rgba(15, 23, 42, 0.22);
          }
          .toast-banner {
            padding: 14px 16px;
            color: #e2e8f0;
          }
          .toast-success {
            border-color: rgba(45, 212, 191, 0.35);
          }
          .toast-danger {
            border-color: rgba(251, 113, 133, 0.38);
          }
          .refresh-strip,
          .entry-banner,
          .attention-banner {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: center;
            padding: 18px 20px;
          }
          .freshness-fresh {
            border-color: rgba(45, 212, 191, 0.28);
          }
          .freshness-stale {
            border-color: rgba(251, 191, 36, 0.34);
          }
          .freshness-degraded,
          .freshness-unknown {
            border-color: rgba(248, 113, 113, 0.34);
          }
          .entry-banner {
            border-color: rgba(96, 165, 250, 0.3);
          }
          .strip-label,
          .eyebrow,
          .cell-subcopy,
          .scope-list dt {
            margin: 0;
            color: #94a3b8;
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .strip-detail {
            margin: 6px 0 0;
            color: #cbd5e1;
            font-size: 13px;
          }
          .refresh-actions,
          .attention-links,
          .row-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            align-items: center;
          }
          .refresh-pill,
          .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            border-radius: 999px;
            padding: 6px 10px;
            font-size: 12px;
            font-weight: 700;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
          }
          .section-note {
            margin: 8px 0 0;
            color: #94a3b8;
            font-size: 13px;
            line-height: 1.5;
          }
          .metric-card {
            padding: 18px;
            display: grid;
            gap: 10px;
          }
          .metric-label {
            color: #cbd5e1;
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .metric-value {
            color: #f8fafc;
            font-size: 30px;
            font-weight: 700;
          }
          .metric-detail {
            color: #94a3b8;
            font-size: 13px;
            line-height: 1.5;
          }
          .metric-warning {
            border-color: rgba(251, 191, 36, 0.3);
          }
          .metric-critical {
            border-color: rgba(248, 113, 113, 0.34);
          }
          .metric-info {
            border-color: rgba(56, 189, 248, 0.28);
          }
          .metric-neutral {
            border-color: rgba(148, 163, 184, 0.22);
          }
          .workspace-grid {
            display: grid;
            grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.8fr);
            gap: 16px;
            align-items: start;
          }
          .side-rail,
          .watch-list {
            display: grid;
            gap: 16px;
          }
          .panel {
            padding: 18px;
          }
          .rail-panel {
            position: sticky;
            top: 16px;
          }
          .panel-head {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: flex-start;
            margin-bottom: 14px;
          }
          .panel-head h3 {
            margin: 6px 0 0;
            color: #f8fafc;
          }
          .status-tabs {
            display: grid;
            grid-template-columns: repeat(6, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 14px;
          }
          .tab {
            border-radius: 16px;
            border: 1px solid rgba(148, 163, 184, 0.22);
            background: rgba(15, 23, 42, 0.72);
            color: #cbd5e1;
            padding: 12px 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
          }
          .tab.active {
            border-color: rgba(251, 146, 60, 0.55);
            background: linear-gradient(
              135deg,
              rgba(251, 146, 60, 0.28),
              rgba(15, 23, 42, 0.92)
            );
            color: #fff7ed;
          }
          .toolbar {
            display: grid;
            grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 16px;
          }
          .search-input,
          .filter-select {
            width: 100%;
            border-radius: 14px;
            border: 1px solid rgba(148, 163, 184, 0.24);
            background: rgba(15, 23, 42, 0.72);
            color: #f8fafc;
            padding: 12px 14px;
          }
          .primary-btn,
          .ghost-btn {
            border-radius: 14px;
            padding: 10px 14px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
          }
          .primary-btn {
            border: 1px solid rgba(251, 146, 60, 0.5);
            background: linear-gradient(135deg, #fb923c, #f97316);
            color: #fff7ed;
          }
          .ghost-btn {
            border: 1px solid rgba(148, 163, 184, 0.24);
            background: rgba(15, 23, 42, 0.72);
            color: #e2e8f0;
          }
          .primary-btn:disabled,
          .ghost-btn:disabled,
          .search-input:disabled,
          .filter-select:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }
          .loading-panel {
            padding: 32px 18px;
            color: #cbd5e1;
            text-align: center;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
          }
          .table th,
          .table td {
            padding: 14px 10px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.16);
            vertical-align: top;
            text-align: left;
            color: #e2e8f0;
          }
          .table th {
            color: #94a3b8;
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .cell-title {
            color: #f8fafc;
            font-weight: 700;
            margin-bottom: 4px;
          }
          .ghost-link,
          .inline-link,
          .attention-link,
          .watch-card {
            color: #fdba74;
            text-decoration: none;
          }
          .ghost-link {
            display: inline-flex;
            align-items: center;
            border-radius: 14px;
            border: 1px solid rgba(125, 211, 252, 0.28);
            padding: 10px 14px;
            background: rgba(8, 47, 73, 0.28);
            color: #bae6fd;
          }
          .status-badge {
            background: rgba(15, 23, 42, 0.8);
          }
          .tone-critical {
            border: 1px solid rgba(248, 113, 113, 0.35);
            color: #fecaca;
          }
          .tone-warning {
            border: 1px solid rgba(251, 191, 36, 0.35);
            color: #fde68a;
          }
          .tone-info {
            border: 1px solid rgba(56, 189, 248, 0.35);
            color: #bae6fd;
          }
          .tone-neutral {
            border: 1px solid rgba(148, 163, 184, 0.28);
            color: #cbd5e1;
          }
          .row-overdue {
            background: rgba(127, 29, 29, 0.18);
          }
          .watch-card {
            display: grid;
            gap: 8px;
            padding: 14px;
            border: 1px solid rgba(148, 163, 184, 0.18);
            background: rgba(15, 23, 42, 0.66);
          }
          .watch-critical {
            border-color: rgba(248, 113, 113, 0.34);
          }
          .watch-warning {
            border-color: rgba(251, 191, 36, 0.3);
          }
          .watch-info {
            border-color: rgba(56, 189, 248, 0.26);
          }
          .watch-neutral {
            border-color: rgba(148, 163, 184, 0.18);
          }
          .watch-head {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            color: #f8fafc;
          }
          .watch-title {
            color: #fdba74;
            font-weight: 700;
          }
          .scope-list {
            display: grid;
            gap: 12px;
            margin: 0;
          }
          .scope-list div {
            display: grid;
            gap: 4px;
          }
          .scope-list dd {
            margin: 0;
            color: #f8fafc;
          }
          .attention-banner {
            border-color: rgba(248, 113, 113, 0.3);
            background: linear-gradient(
              135deg,
              rgba(127, 29, 29, 0.36),
              rgba(9, 16, 28, 0.9)
            );
          }
          .error-banner {
            padding: 14px 16px;
            border-radius: 16px;
            border: 1px solid rgba(248, 113, 113, 0.34);
            background: rgba(127, 29, 29, 0.22);
            color: #fee2e2;
          }
          .action-hint {
            color: #94a3b8;
            font-size: 12px;
          }
          @media (max-width: 1100px) {
            .workspace-grid {
              grid-template-columns: 1fr;
            }
            .rail-panel {
              position: static;
            }
          }
          @media (max-width: 820px) {
            .refresh-strip,
            .entry-banner,
            .attention-banner,
            .panel-head {
              flex-direction: column;
              align-items: stretch;
            }
            .status-tabs,
            .toolbar {
              grid-template-columns: 1fr;
            }
            .table,
            .table thead,
            .table tbody,
            .table tr,
            .table td {
              display: block;
            }
            .table thead {
              display: none;
            }
            .table tr {
              padding: 12px 0;
              border-bottom: 1px solid rgba(148, 163, 184, 0.16);
            }
            .table td {
              border: 0;
              padding: 6px 0;
            }
          }
        `}</style>
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "warning" | "critical" | "info" | "neutral";
}) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
      <style jsx>{`
        .metric-card {
          padding: 18px;
          display: grid;
          gap: 10px;
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(9, 16, 28, 0.84);
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.22);
        }
        .metric-warning {
          border-color: rgba(251, 191, 36, 0.3);
        }
        .metric-critical {
          border-color: rgba(248, 113, 113, 0.34);
        }
        .metric-info {
          border-color: rgba(56, 189, 248, 0.28);
        }
        .metric-neutral {
          border-color: rgba(148, 163, 184, 0.22);
        }
        .metric-label {
          color: #cbd5e1;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .metric-value {
          color: #f8fafc;
          font-size: 30px;
          font-weight: 700;
        }
        .metric-detail {
          color: #94a3b8;
          font-size: 13px;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}

function resolveEmptyState({
  locale,
  error,
  previewEmptyReason,
  serverEmptyState,
  hasFilters,
  totalCount,
  filteredCount,
  createAction,
}: {
  locale: "en" | "zh";
  error: string | null;
  previewEmptyReason: PacketEmptyReason | null;
  serverEmptyState: EmptyStateEnvelope | null;
  hasFilters: boolean;
  totalCount: number;
  filteredCount: number;
  createAction: ResourceActionDescriptor | null;
}): EmptyStateEnvelope | null {
  if (previewEmptyReason) {
    return buildEmptyStateEnvelope(previewEmptyReason, locale, createAction);
  }
  if (error && totalCount === 0) {
    return buildEmptyStateEnvelope("fetch_failed", locale, createAction);
  }
  if (totalCount === 0) {
    return (
      serverEmptyState ??
      buildEmptyStateEnvelope("no_data", locale, createAction)
    );
  }
  if (hasFilters && filteredCount === 0) {
    return buildEmptyStateEnvelope("filtered_empty", locale, createAction);
  }
  return null;
}

function buildEmptyStateEnvelope(
  reason: PacketEmptyReason,
  locale: "en" | "zh",
  createAction: ResourceActionDescriptor | null,
): EmptyStateEnvelope {
  switch (reason) {
    case "not_provisioned":
      return {
        reason,
        messageCode: copy(
          locale,
          "Maintenance workflow is not provisioned for this realm.",
          "此租戶尚未開通維保工作流。",
        ),
        ...(createAction ? { nextAction: createAction } : {}),
      };
    case "fetch_failed":
      return {
        reason,
        messageCode: copy(
          locale,
          "Maintenance snapshot could not be loaded.",
          "目前無法載入維保快照。",
        ),
      };
    case "permission_denied":
      return {
        reason,
        messageCode: copy(
          locale,
          "Your current scope can view neither work orders nor edit actions.",
          "目前權限無法查看或操作維保工單。",
        ),
      };
    case "external_unavailable":
      return {
        reason,
        messageCode: copy(
          locale,
          "Fleet dependency is degraded. Retry after adapter recovery.",
          "車隊外部依賴異常，請待介接恢復後再試。",
        ),
      };
    case "filtered_empty":
      return {
        reason,
        messageCode: copy(
          locale,
          "No work orders match the current filters.",
          "目前篩選條件下沒有符合的工單。",
        ),
      };
    case "no_data":
    default:
      return {
        reason,
        messageCode: copy(
          locale,
          "There are no maintenance records yet.",
          "目前還沒有維保工單。",
        ),
        ...(createAction ? { nextAction: createAction } : {}),
      };
  }
}

function describeFreshness(
  refresh: UiRefreshMetadata | null,
  locale: "en" | "zh",
) {
  if (!refresh) return null;
  switch (refresh.dataFreshness) {
    case "fresh":
      return copy(locale, "Live snapshot is current", "快照為最新資料");
    case "stale":
      return copy(locale, "Snapshot is stale", "快照已過時");
    case "degraded":
      return copy(locale, "Dependency degraded", "依賴服務降級");
    case "unknown":
    default:
      return copy(locale, "Freshness unknown", "資料新鮮度未知");
  }
}

function EmptyStateCard({
  locale,
  state,
  onPrimaryAction,
}: {
  locale: "en" | "zh";
  state: EmptyStateEnvelope;
  onPrimaryAction: () => void;
}) {
  const content = getEmptyReasonContent(
    state.reason as PacketEmptyReason,
    locale,
  );
  return (
    <div className={`empty-state empty-${state.reason}`}>
      <span className="empty-badge">{content.kicker}</span>
      <h3>{content.title}</h3>
      <p>{state.messageCode}</p>
      {state.nextAction ? (
        <button className="primary-btn" type="button" onClick={onPrimaryAction}>
          {content.cta}
        </button>
      ) : (
        <button className="ghost-btn" type="button" onClick={onPrimaryAction}>
          {copy(locale, "Refresh snapshot", "重新整理快照")}
        </button>
      )}
      <style jsx>{`
        .empty-state {
          display: grid;
          gap: 12px;
          padding: 28px;
          border-radius: 18px;
          border: 1px dashed rgba(148, 163, 184, 0.28);
          background: rgba(15, 23, 42, 0.58);
          color: #e2e8f0;
        }
        .empty-not_provisioned {
          border-color: rgba(96, 165, 250, 0.35);
          background: rgba(12, 74, 110, 0.18);
        }
        .empty-fetch_failed,
        .empty-external_unavailable {
          border-color: rgba(248, 113, 113, 0.38);
          background: rgba(69, 10, 10, 0.2);
        }
        .empty-permission_denied {
          border-color: rgba(250, 204, 21, 0.34);
          background: rgba(113, 63, 18, 0.2);
        }
        .empty-filtered_empty {
          border-color: rgba(125, 211, 252, 0.34);
          background: rgba(8, 47, 73, 0.22);
        }
        .empty-no_data {
          border-color: rgba(45, 212, 191, 0.28);
          background: rgba(15, 118, 110, 0.14);
        }
        .empty-badge {
          display: inline-flex;
          width: fit-content;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(251, 146, 60, 0.18);
          color: #fdba74;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .empty-fetch_failed .empty-badge,
        .empty-external_unavailable .empty-badge {
          background: rgba(248, 113, 113, 0.16);
          color: #fda4af;
        }
        .empty-permission_denied .empty-badge {
          background: rgba(250, 204, 21, 0.16);
          color: #fde68a;
        }
        .empty-not_provisioned .empty-badge,
        .empty-filtered_empty .empty-badge {
          background: rgba(125, 211, 252, 0.16);
          color: #bae6fd;
        }
        .empty-no_data .empty-badge {
          background: rgba(45, 212, 191, 0.16);
          color: #99f6e4;
        }
        h3 {
          margin: 0;
          color: #f8fafc;
        }
        p {
          margin: 0;
          color: #cbd5e1;
          line-height: 1.6;
        }
        .primary-btn,
        .ghost-btn {
          width: fit-content;
          border-radius: 14px;
          padding: 10px 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .primary-btn {
          border: 1px solid rgba(251, 146, 60, 0.5);
          background: linear-gradient(135deg, #fb923c, #f97316);
          color: #fff7ed;
        }
        .ghost-btn {
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(15, 23, 42, 0.72);
          color: #e2e8f0;
        }
      `}</style>
    </div>
  );
}

function getEmptyReasonContent(reason: PacketEmptyReason, locale: "en" | "zh") {
  switch (reason) {
    case "not_provisioned":
      return {
        kicker: copy(locale, "Not provisioned", "尚未開通"),
        title: copy(
          locale,
          "Maintenance tracking is not enabled for this workspace.",
          "此工作區尚未啟用維保追蹤。",
        ),
        cta: copy(locale, "Create record", "開立工單"),
      };
    case "fetch_failed":
      return {
        kicker: copy(locale, "Fetch failed", "讀取失敗"),
        title: copy(
          locale,
          "The latest maintenance snapshot could not be loaded.",
          "最新維保快照目前無法載入。",
        ),
        cta: copy(locale, "Retry", "重新嘗試"),
      };
    case "permission_denied":
      return {
        kicker: copy(locale, "Permission denied", "權限不足"),
        title: copy(
          locale,
          "Your role does not currently expose maintenance data.",
          "你的角色目前無法查看維保資料。",
        ),
        cta: copy(locale, "Refresh snapshot", "重新整理快照"),
      };
    case "external_unavailable":
      return {
        kicker: copy(locale, "External unavailable", "外部服務不可用"),
        title: copy(
          locale,
          "Maintenance data is waiting on a degraded dependency.",
          "維保資料依賴的外部服務目前異常。",
        ),
        cta: copy(locale, "Retry", "重新嘗試"),
      };
    case "filtered_empty":
      return {
        kicker: copy(locale, "Filtered empty", "篩選無結果"),
        title: copy(
          locale,
          "No work orders match the current query, vehicle, or date range.",
          "目前搜尋、車輛或日期條件下沒有符合工單。",
        ),
        cta: copy(locale, "Refresh snapshot", "重新整理快照"),
      };
    case "no_data":
    default:
      return {
        kicker: copy(locale, "No data", "目前無資料"),
        title: copy(
          locale,
          "There are no maintenance records on the board yet.",
          "目前看板上還沒有任何維保工單。",
        ),
        cta: copy(locale, "Create record", "開立工單"),
      };
  }
}

function ConfirmDialog({
  locale,
  pendingMutation,
  onCancel,
  onConfirm,
}: {
  locale: "en" | "zh";
  pendingMutation: PendingMutation;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintenance-confirm-title"
      >
        <p className="modal-kicker">
          {copy(locale, "Medium-risk action", "中風險操作")}
        </p>
        <h3 id="maintenance-confirm-title">
          {pendingMutation.mode === "edit"
            ? copy(locale, "Confirm maintenance update", "確認更新工單")
            : copy(locale, "Confirm maintenance creation", "確認建立工單")}
        </h3>
        <p className="modal-body">
          {pendingMutation.mode === "edit"
            ? copy(
                locale,
                "This work order update will be written to the live maintenance log.",
                "這筆工單更新會直接寫入正式維保紀錄。",
              )
            : copy(
                locale,
                "This new work order will be visible to operations managers immediately.",
                "這筆新工單會立即對營運管理者可見。",
              )}
        </p>
        <div className="modal-actions">
          <button className="primary-btn" type="button" onClick={onConfirm}>
            {copy(locale, "Confirm", "確認")}
          </button>
          <button className="ghost-btn" type="button" onClick={onCancel}>
            {copy(locale, "Cancel", "取消")}
          </button>
        </div>
      </div>
      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.72);
          display: grid;
          place-items: center;
          padding: 20px;
          z-index: 40;
        }
        .modal-card {
          width: min(460px, 100%);
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: #0f172a;
          padding: 22px;
          color: #e2e8f0;
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.42);
        }
        .modal-kicker {
          margin: 0 0 8px;
          color: #fdba74;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        h3 {
          margin: 0 0 10px;
          color: #f8fafc;
        }
        .modal-body {
          margin: 0;
          color: #cbd5e1;
          line-height: 1.6;
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          margin-top: 18px;
        }
        .primary-btn,
        .ghost-btn {
          border-radius: 14px;
          padding: 10px 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .primary-btn {
          border: 1px solid rgba(251, 146, 60, 0.5);
          background: linear-gradient(135deg, #fb923c, #f97316);
          color: #fff7ed;
        }
        .ghost-btn {
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(15, 23, 42, 0.72);
          color: #e2e8f0;
        }
      `}</style>
    </div>
  );
}

function MaintenanceForm({
  editingRecord,
  onCancel,
  onSubmit,
}: {
  editingRecord: RuntimeMaintenanceRecord | undefined;
  onCancel: () => void;
  onSubmit: (
    command: CreateMaintenanceRecordCommand | UpdateMaintenanceRecordCommand,
  ) => void;
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
    toDateValue(editingRecord?.scheduledAt ?? null),
  );
  const [completedAt, setCompletedAt] = useState(
    toDateValue(editingRecord?.completedAt ?? null),
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
        onSubmit(command);
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
      onSubmit(command);
    });
  }

  return (
    <form className="maintenance-form" onSubmit={handleSubmit}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">{t("maintenance.form.editor")}</p>
          <h3>
            {isEditing
              ? copy(locale, "Edit maintenance record", "編輯維保工單")
              : copy(locale, "Create maintenance record", "建立維保工單")}
          </h3>
        </div>
      </div>
      <div className="form-grid">
        {!isEditing ? (
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
        ) : (
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
        <button className="primary-btn" type="submit" disabled={pending}>
          {pending
            ? t("maintenance.form.saving")
            : isEditing
              ? t("maintenance.form.saveChanges")
              : t("maintenance.form.createRecord")}
        </button>
        <button className="ghost-btn" type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
      <style jsx>{`
        .maintenance-form {
          display: grid;
          gap: 14px;
          margin-bottom: 16px;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(15, 23, 42, 0.55);
        }
        .panel-head {
          margin-bottom: 0;
        }
        .eyebrow {
          margin: 0;
          color: #94a3b8;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        h3 {
          margin: 8px 0 0;
          color: #f8fafc;
        }
        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        label {
          display: grid;
          gap: 6px;
          color: #e2e8f0;
          font-size: 14px;
        }
        input,
        select,
        textarea {
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(15, 23, 42, 0.72);
          color: #f8fafc;
          padding: 12px 14px;
        }
        .full-width {
          grid-column: 1 / -1;
        }
        .form-actions {
          display: flex;
          gap: 10px;
        }
        .primary-btn,
        .ghost-btn {
          border-radius: 14px;
          padding: 10px 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .primary-btn {
          border: 1px solid rgba(251, 146, 60, 0.5);
          background: linear-gradient(135deg, #fb923c, #f97316);
          color: #fff7ed;
        }
        .ghost-btn {
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(15, 23, 42, 0.72);
          color: #e2e8f0;
        }
        @media (max-width: 820px) {
          .form-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </form>
  );
}
