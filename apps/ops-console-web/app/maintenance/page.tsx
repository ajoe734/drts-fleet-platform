"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type {
  CreateMaintenanceRecordCommand,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
  UpdateMaintenanceRecordCommand,
} from "@drts/contracts";
import { MAINTENANCE_STATUSES, MAINTENANCE_TYPES } from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import { getOpsClient } from "@/lib/api-client";
import { isMaintenanceOverdue } from "@/lib/ops-analytics";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";

const STATUSES: MaintenanceStatus[] = [...MAINTENANCE_STATUSES];
const TYPES: MaintenanceType[] = [...MAINTENANCE_TYPES];

type StatusFilter = MaintenanceStatus | "all";
type MaintenanceTableRow = MaintenanceRecord & Record<string, unknown>;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageStackStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fullWidthStyle: CSSProperties = {
  gridColumn: "1 / -1",
};

const tableCellStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const controlsBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  borderBottom: `1px solid ${theme.border}`,
};

const tabRailStyle: CSSProperties = {
  display: "flex",
  gap: 0,
  flexWrap: "wrap",
  alignItems: "center",
};

const tabButtonStyle = (
  active: boolean,
  tone: CanvasTone = "neutral",
): CSSProperties => ({
  border: "none",
  borderBottom: `2px solid ${
    active
      ? tone === "danger"
        ? theme.danger
        : tone === "warn"
          ? theme.warn
          : tone === "success"
            ? theme.success
            : tone === "info"
              ? theme.info
              : theme.accent
      : "transparent"
  }`,
  background: "transparent",
  color: active
    ? tone === "danger"
      ? theme.danger
      : tone === "warn"
        ? theme.warn
        : tone === "success"
          ? theme.success
          : tone === "info"
            ? theme.info
            : theme.accent
    : theme.textMuted,
  padding: "10px 12px",
  fontSize: 12.5,
  fontWeight: active ? 700 : 500,
  cursor: "pointer",
  transition: "color 160ms ease, border-color 160ms ease",
});

const controlsMetaStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const controlsMetaTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: theme.text,
};

const controlsMetaSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: theme.textMuted,
};

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

function formatDateTime(locale: "en" | "zh", value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function getEffectiveStatus(record: MaintenanceRecord): MaintenanceStatus {
  return isMaintenanceOverdue(record) ? "overdue" : record.status;
}

function getStatusTone(status: MaintenanceStatus): CanvasTone {
  if (status === "completed") return "success";
  if (status === "overdue") return "danger";
  if (status === "in_progress") return "info";
  if (status === "scheduled") return "warn";
  return "neutral";
}

function shellNav(
  locale: "en" | "zh",
  t: (key: string, params?: Record<string, string | number>) => string,
): CanvasShellNavItem[] {
  return [
    {
      divider: locale === "en" ? "Workspaces" : "工作面",
    },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: t("nav.dashboard"),
    },
    {
      divider: locale === "en" ? "Live Ops" : "即時派遣",
    },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: t("nav.dispatch"),
      matchPaths: ["/dispatch"],
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: t("nav.callcenter"),
    },
    {
      divider: locale === "en" ? "Casework" : "案件處理",
    },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: t("nav.complaints"),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: t("nav.incidents"),
      matchPaths: ["/incidents"],
    },
    {
      divider: locale === "en" ? "Monitoring" : "營運監控",
    },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: t("nav.reports"),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: t("nav.revenue"),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: t("nav.attendance"),
    },
    {
      key: "maintenance",
      href: "/maintenance",
      icon: "maintenance",
      label: t("nav.maintenance"),
    },
    {
      divider: locale === "en" ? "Registry" : "主資料",
    },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet",
      label: t("nav.drivers"),
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: t("nav.vehicles"),
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts",
      label: t("nav.contracts"),
    },
    {
      key: "feature-flags",
      href: "/feature-flags",
      icon: "flags",
      label: t("nav.featureFlags"),
    },
  ];
}

function controlStyle(theme: CanvasTheme): CSSProperties {
  return {
    width: "100%",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: theme.bgRaised,
    color: theme.text,
    padding: "8px 10px",
    fontSize: 12.5,
    fontFamily: theme.fontFamily,
    boxSizing: "border-box",
  };
}

export default function MaintenancePage() {
  const { t, locale } = useTranslation();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
      counts[effectiveStatus] = (counts[effectiveStatus] ?? 0) + 1;
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

  const statusTabs: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: copy(locale, "All", "全部") },
    { value: "scheduled", label: copy(locale, "Scheduled", "排程中") },
    { value: "in_progress", label: copy(locale, "In Progress", "進行中") },
    { value: "completed", label: copy(locale, "Completed", "已完成") },
    { value: "overdue", label: copy(locale, "Overdue", "逾期") },
  ];
  const inFlightCount =
    effectiveStatusCounts.scheduled + effectiveStatusCounts.in_progress;
  const activeTab =
    statusTabs.find((tab) => tab.value === statusFilter)?.label ??
    statusTabs[0]!.label;
  const editingRecord = editingId
    ? (records.find((record) => record.maintenanceId === editingId) ?? null)
    : null;
  const tabMeta: Array<{
    value: StatusFilter;
    count: number;
    tone?: CanvasTone;
  }> = statusTabs.map((tab) => ({
    value: tab.value,
    count:
      tab.value === "all"
        ? records.length
        : effectiveStatusCounts[tab.value as MaintenanceStatus],
    tone:
      tab.value === "overdue"
        ? "danger"
        : tab.value === "completed"
          ? "success"
          : tab.value === "scheduled"
            ? "warn"
            : tab.value === "in_progress"
              ? "info"
              : "neutral",
  }));

  const columns: CanvasTableColumn<MaintenanceTableRow>[] = [
    {
      h: t("maintenance.col.workOrder"),
      w: 250,
      mono: true,
      r: (record: MaintenanceTableRow) => (
        <div style={tableCellStackStyle}>
          <div>
            <div style={{ fontWeight: 700 }}>{record.maintenanceId}</div>
            <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {record.description}
            </div>
          </div>
          <div style={actionRowStyle}>
            {record.status !== "completed" && record.status !== "cancelled" ? (
              <Btn
                theme={theme}
                size="xs"
                onClick={() => {
                  setShowCreate(false);
                  setEditingId(record.maintenanceId);
                }}
              >
                {t("common.edit")}
              </Btn>
            ) : null}
            {record.status !== "completed" && record.status !== "cancelled" ? (
              <Btn
                theme={theme}
                size="xs"
                variant="secondary"
                onClick={() => void completeRecord(record.maintenanceId)}
              >
                {t("maintenance.completeBtn")}
              </Btn>
            ) : null}
            <Btn
              theme={theme}
              size="xs"
              variant="ghost"
              danger
              onClick={() => void deleteRecord(record.maintenanceId)}
            >
              {t("common.delete")}
            </Btn>
          </div>
        </div>
      ),
    },
    {
      h: t("maintenance.col.vehicle"),
      w: 108,
      mono: true,
      r: (record: MaintenanceTableRow) => (
        <Link
          href="/vehicles"
          style={{
            color: theme.text,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {record.vehicleId}
        </Link>
      ),
    },
    {
      h: copy(locale, "Category", "類別"),
      w: 190,
      r: (record: MaintenanceTableRow) =>
        formatOpsCodeLabel(locale, record.type),
    },
    {
      h: t("maintenance.col.status"),
      w: 132,
      r: (record: MaintenanceTableRow) => {
        const effectiveStatus = getEffectiveStatus(record);
        return (
          <Pill theme={theme} tone={getStatusTone(effectiveStatus)} dot>
            {formatOpsCodeLabel(locale, effectiveStatus)}
          </Pill>
        );
      },
    },
    {
      h: t("maintenance.col.schedule"),
      mono: true,
      w: 170,
      r: (record: MaintenanceTableRow) => (
        <div style={tableCellStackStyle}>
          <div>{formatDateTime(locale, record.scheduledAt)}</div>
          <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {record.completedAt
              ? `${copy(locale, "Done", "完成")} ${formatDateTime(
                  locale,
                  record.completedAt,
                )}`
              : copy(locale, "Open work order", "未結工單")}
          </div>
        </div>
      ),
    },
    {
      h: t("maintenance.col.technician"),
      w: 96,
      r: (record: MaintenanceTableRow) => record.technician ?? "—",
    },
    {
      h: t("maintenance.col.cost"),
      mono: true,
      align: "right",
      w: 120,
      r: (record: MaintenanceTableRow) => formatCost(record.cost),
    },
  ];

  async function completeRecord(maintenanceId: string) {
    try {
      await getOpsClient().updateMaintenance(maintenanceId, {
        status: "completed",
      });
      await loadRecords();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    }
  }

  async function deleteRecord(maintenanceId: string) {
    try {
      await getOpsClient().deleteMaintenance(maintenanceId);
      if (editingId === maintenanceId) {
        setEditingId(null);
      }
      await loadRecords();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    }
  }

  return (
    <Shell
      theme={theme}
      nav={shellNav(locale, t)}
      active="maintenance"
      breadcrumb={[t("nav.maintenance")]}
      searchPlaceholder={t("maintenance.search")}
    >
      <PageHeader
        theme={theme}
        title={t("maintenance.title")}
        subtitle={copy(
          locale,
          "Work orders, schedule, technicians, and dispatch impact",
          "工單、排程、技師與派遣影響",
        )}
        tabs={statusTabs.map((tab) => tab.label)}
        activeTab={activeTab}
        actions={
          <>
            <Btn
              theme={theme}
              variant="secondary"
              icon="arrow"
              onClick={() => void loadRecords()}
            >
              {t("common.refresh")}
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => {
                setShowCreate(true);
                setEditingId(null);
              }}
            >
              {t("maintenance.createBtn")}
            </Btn>
          </>
        }
      />
      <div style={pageStackStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={`${getOpsLabel(locale, "error")}: ${error}`}
            body={copy(
              locale,
              "Maintenance registry could not be fully refreshed. Use refresh after upstream data recovers.",
              "保養工單資料尚未完全更新，請在上游資料恢復後重新整理。",
            )}
          />
        ) : null}

        {(effectiveStatusCounts.overdue ?? 0) > 0 ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="maintenance"
            title={copy(
              locale,
              `${effectiveStatusCounts.overdue ?? 0} overdue work order(s) may affect dispatchable supply`,
              `${effectiveStatusCounts.overdue ?? 0} 筆逾期工單可能影響可派車量`,
            )}
            body={copy(
              locale,
              "Review overdue vehicles before reopening them for new trips.",
              "重新投入派車前，請先確認逾期保修車輛是否已解除限制。",
            )}
          />
        ) : null}

        {showCreate || editingRecord ? (
          <MaintenanceEditor
            key={editingRecord?.maintenanceId ?? "create"}
            editingRecord={editingRecord}
            onCancel={() => {
              setShowCreate(false);
              setEditingId(null);
            }}
            onSubmit={async (command) => {
              try {
                const client = getOpsClient();
                if (editingRecord) {
                  await client.updateMaintenance(
                    editingRecord.maintenanceId,
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
        ) : null}

        <Card theme={theme} padding={0}>
          <div style={controlsBarStyle}>
            <div style={controlsMetaStyle}>
              <p style={controlsMetaTitleStyle}>
                {copy(locale, "Maintenance work orders", "保養工單")}
              </p>
              <p style={controlsMetaSubtitleStyle}>
                {copy(
                  locale,
                  `${inFlightCount} open work order(s) in flight`,
                  `共有 ${inFlightCount} 筆未結工單`,
                )}
              </p>
            </div>
            <div style={{ minWidth: 260, flex: "1 1 320px", maxWidth: 420 }}>
              <Field theme={theme} label={t("maintenance.search")} srOnlyLabel>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("maintenance.search")}
                  style={controlStyle(theme)}
                />
              </Field>
            </div>
          </div>
          <div
            style={{
              ...tabRailStyle,
              padding: "0 16px",
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            {tabMeta.map((tab) => {
              const statusTab = statusTabs.find(
                (candidate) => candidate.value === tab.value,
              );
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  style={tabButtonStyle(statusFilter === tab.value, tab.tone)}
                >
                  {statusTab?.label ?? tab.value} {tab.count}
                </button>
              );
            })}
          </div>
          {loading ? (
            <div style={{ padding: 16, color: theme.textMuted }}>
              {t("common.loading")}
            </div>
          ) : filteredRecords.length > 0 ? (
            <Table
              theme={theme}
              columns={columns}
              rows={filteredRecords as MaintenanceTableRow[]}
            />
          ) : (
            <div
              style={{
                padding: 24,
                color: theme.textMuted,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <strong style={{ color: theme.text }}>
                {copy(
                  locale,
                  "No work orders in this view",
                  "目前篩選下沒有工單",
                )}
              </strong>
              <span>{t("maintenance.empty")}</span>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}

function MaintenanceEditor({
  editingRecord,
  onCancel,
  onSubmit,
}: {
  editingRecord: MaintenanceRecord | null;
  onCancel: () => void;
  onSubmit: (
    command: CreateMaintenanceRecordCommand | UpdateMaintenanceRecordCommand,
  ) => Promise<void>;
}) {
  const { t, locale } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    try {
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
        await onSubmit(command);
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
      await onSubmit(command);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      theme={theme}
      title={
        isEditing
          ? t("maintenance.form.updateTitle")
          : t("maintenance.form.createTitle")
      }
      subtitle={t("maintenance.form.editor")}
      actions={
        <>
          <Btn theme={theme} variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Btn>
          <Btn
            theme={theme}
            variant="primary"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={pending}
          >
            {pending
              ? t("maintenance.form.saving")
              : isEditing
                ? t("maintenance.form.saveChanges")
                : t("maintenance.form.createRecord")}
          </Btn>
        </>
      }
    >
      {editingRecord ? (
        <div style={{ marginBottom: 12 }}>
          <DL
            theme={theme}
            cols={4}
            items={[
              { k: "WO", v: editingRecord.maintenanceId, mono: true },
              {
                k: t("maintenance.col.vehicle"),
                v: editingRecord.vehicleId,
                mono: true,
              },
              {
                k: copy(locale, "Created", "建立"),
                v: formatDateTime(locale, editingRecord.createdAt),
                mono: true,
              },
              {
                k: copy(locale, "Updated", "更新"),
                v: formatDateTime(locale, editingRecord.updatedAt),
                mono: true,
              },
            ]}
          />
        </div>
      ) : null}

      <form ref={formRef} onSubmit={handleSubmit}>
        <div style={formGridStyle}>
          {!isEditing ? (
            <>
              <div>
                <Field
                  theme={theme}
                  label={t("maintenance.form.vehicleId")}
                  required
                >
                  <input
                    value={vehicleId}
                    onChange={(event) => setVehicleId(event.target.value)}
                    required
                    style={controlStyle(theme)}
                  />
                </Field>
              </div>
              <div>
                <Field
                  theme={theme}
                  label={t("maintenance.form.type")}
                  required
                >
                  <select
                    value={type}
                    onChange={(event) =>
                      setType(event.target.value as MaintenanceType)
                    }
                    style={controlStyle(theme)}
                  >
                    {TYPES.map((value) => (
                      <option key={value} value={value}>
                        {formatOpsCodeLabel(locale, value)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div style={fullWidthStyle}>
                <Field
                  theme={theme}
                  label={t("maintenance.form.description")}
                  required
                >
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    required
                    style={controlStyle(theme)}
                  />
                </Field>
              </div>
              <div>
                <Field theme={theme} label={t("maintenance.form.scheduledAt")}>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    style={controlStyle(theme)}
                  />
                </Field>
              </div>
            </>
          ) : (
            <>
              <div>
                <Field theme={theme} label={t("maintenance.form.status")}>
                  <select
                    value={status}
                    onChange={(event) =>
                      setStatus(event.target.value as MaintenanceStatus)
                    }
                    style={controlStyle(theme)}
                  >
                    {STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {formatOpsCodeLabel(locale, value)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div>
                <Field theme={theme} label={t("maintenance.form.completedAt")}>
                  <input
                    type="datetime-local"
                    value={completedAt}
                    onChange={(event) => setCompletedAt(event.target.value)}
                    style={controlStyle(theme)}
                  />
                </Field>
              </div>
            </>
          )}

          <div>
            <Field theme={theme} label={t("maintenance.form.technician")}>
              <input
                value={technician}
                onChange={(event) => setTechnician(event.target.value)}
                style={controlStyle(theme)}
              />
            </Field>
          </div>
          <div>
            <Field theme={theme} label={t("maintenance.form.cost")}>
              <input
                type="number"
                min="0"
                step="1"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                style={controlStyle(theme)}
              />
            </Field>
          </div>
          <div style={fullWidthStyle}>
            <Field theme={theme} label={t("maintenance.form.notes")}>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                style={controlStyle(theme)}
              />
            </Field>
          </div>
        </div>
      </form>
    </Card>
  );
}
