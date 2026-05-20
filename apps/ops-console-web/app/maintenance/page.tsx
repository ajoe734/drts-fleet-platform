import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import type {
  CreateMaintenanceRecordCommand,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
  UpdateMaintenanceRecordCommand,
} from "@drts/contracts";
import { MAINTENANCE_STATUSES, MAINTENANCE_TYPES } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { isMaintenanceOverdue } from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const shellStyle: CSSProperties = {
  gridTemplateColumns: "0 minmax(0, 1fr)",
  gridTemplateRows: "0 minmax(0, 1fr)",
  height: "100%",
};

const pageStackStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "center",
  justifyContent: "space-between",
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  marginBottom: 16,
};

const editorStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  alignContent: "start",
};

const STATUSES: MaintenanceStatus[] = [...MAINTENANCE_STATUSES];
const TYPES: MaintenanceType[] = [...MAINTENANCE_TYPES];

type StatusFilter = MaintenanceStatus | "all";
type MaintenancePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MaintenanceTableRow = Record<string, unknown> &
  MaintenanceRecord & {
    _selected?: boolean;
  };

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeReturnTo(value: string) {
  return value.startsWith("/maintenance") ? value : "/maintenance";
}

function resolveStatusFilter(value: string | undefined): StatusFilter {
  if (value === "all" || !value) {
    return "all";
  }
  return STATUSES.includes(value as MaintenanceStatus)
    ? (value as MaintenanceStatus)
    : "all";
}

function resolveMaintenanceType(value: string): MaintenanceType {
  return TYPES.includes(value as MaintenanceType)
    ? (value as MaintenanceType)
    : "scheduled_service";
}

function resolveMaintenanceStatus(value: string): MaintenanceStatus {
  return STATUSES.includes(value as MaintenanceStatus)
    ? (value as MaintenanceStatus)
    : "scheduled";
}

function parseOptionalNumber(value: string) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildMaintenanceHref({
  status,
  q,
  editor,
}: {
  status?: StatusFilter | undefined;
  q?: string | undefined;
  editor?: string | undefined;
}) {
  const params = new URLSearchParams();
  if (status && status !== "all") {
    params.set("status", status);
  }
  if (q?.trim()) {
    params.set("q", q.trim());
  }
  if (editor?.trim()) {
    params.set("editor", editor.trim());
  }
  const query = params.toString();
  return query ? `/maintenance?${query}` : "/maintenance";
}

function formatCost(value: number | null, locale: Locale): string {
  if (value === null) {
    return "—";
  }
  return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function formatDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

function getEffectiveStatus(record: MaintenanceRecord): MaintenanceStatus {
  return isMaintenanceOverdue(record) ? "overdue" : record.status;
}

function statusTone(status: MaintenanceStatus) {
  switch (status) {
    case "completed":
      return "success" as const;
    case "in_progress":
      return "info" as const;
    case "scheduled":
      return "warn" as const;
    case "overdue":
      return "danger" as const;
    case "cancelled":
    default:
      return "neutral" as const;
  }
}

function rowPriority(record: MaintenanceRecord) {
  const status = getEffectiveStatus(record);
  switch (status) {
    case "overdue":
      return 0;
    case "in_progress":
      return 1;
    case "scheduled":
      return 2;
    case "completed":
      return 3;
    case "cancelled":
    default:
      return 4;
  }
}

function compareMaintenanceRecords(
  left: MaintenanceRecord,
  right: MaintenanceRecord,
) {
  const priorityDelta = rowPriority(left) - rowPriority(right);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const leftDate = left.scheduledAt ?? left.updatedAt;
  const rightDate = right.scheduledAt ?? right.updatedAt;
  return leftDate.localeCompare(rightDate);
}

function matchesQuery(record: MaintenanceRecord, query: string) {
  if (!query) {
    return true;
  }

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

  return haystack.includes(query);
}

function impactSummary(record: MaintenanceRecord, locale: Locale) {
  const status = getEffectiveStatus(record);

  if (status === "overdue") {
    return {
      tone: "danger" as const,
      title: copy(locale, "Dispatch hold recommended", "建議暫停派車"),
      body: copy(
        locale,
        "The vehicle still carries an overdue work order.",
        "此車輛仍有逾期工單未結案，建議先擋派車。",
      ),
    };
  }

  if (status === "in_progress") {
    return {
      tone: "warn" as const,
      title: copy(locale, "Vehicle still in workshop", "車輛仍在保修"),
      body: copy(
        locale,
        "Keep spare capacity ready before assigning new trips.",
        "派新單前請先確認替代運能，避免壓縮可派車量。",
      ),
    };
  }

  if (status === "scheduled") {
    return {
      tone: "info" as const,
      title: copy(locale, "Upcoming service window", "即將進入保養時段"),
      body: copy(
        locale,
        "Dispatch should route around the booked maintenance slot.",
        "派遣需避開已排定的保養時段，預留可回補運能。",
      ),
    };
  }

  return {
    tone: "success" as const,
    title: copy(locale, "Ready for reassignment", "可回歸車隊"),
    body: copy(
      locale,
      "Closed records can return to normal dispatch planning.",
      "已結案工單可回到一般派車規劃，不再占用維修容量。",
    ),
  };
}

function buttonStyle(
  canvasTheme: CanvasTheme,
  variant: "primary" | "secondary" | "ghost" = "secondary",
  danger = false,
): CSSProperties {
  if (danger) {
    return {
      background: canvasTheme.danger,
      color: "#ffffff",
      border: `1px solid ${canvasTheme.danger}`,
    };
  }

  if (variant === "primary") {
    return {
      background: canvasTheme.accent,
      color: "#ffffff",
      border: `1px solid ${canvasTheme.accent}`,
      boxShadow: "0 1px 0 rgba(0,0,0,.06)",
    };
  }

  if (variant === "ghost") {
    return {
      background: "transparent",
      color: canvasTheme.textMuted,
      border: "1px solid transparent",
    };
  }

  return {
    background: canvasTheme.surface,
    color: canvasTheme.text,
    border: `1px solid ${canvasTheme.border}`,
  };
}

function buttonBaseStyle(
  canvasTheme: CanvasTheme,
  variant: "primary" | "secondary" | "ghost" = "secondary",
  danger = false,
): CSSProperties {
  return {
    ...buttonStyle(canvasTheme, variant, danger),
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 28,
    padding: "5px 10px",
    borderRadius: 7,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: canvasTheme.fontFamily,
    lineHeight: 1,
    textDecoration: "none",
    boxSizing: "border-box",
  };
}

function inputStyle(canvasTheme: CanvasTheme, mono = false): CSSProperties {
  return {
    width: "100%",
    background: canvasTheme.bgRaised,
    border: `1px solid ${canvasTheme.border}`,
    borderRadius: 7,
    color: canvasTheme.text,
    padding: "8px 10px",
    fontSize: 12.5,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: mono ? canvasTheme.monoFamily : canvasTheme.fontFamily,
  };
}

function textareaStyle(canvasTheme: CanvasTheme): CSSProperties {
  return {
    ...inputStyle(canvasTheme),
    minHeight: 96,
    resize: "vertical",
    lineHeight: 1.45,
  };
}

async function createMaintenanceAction(formData: FormData) {
  "use server";

  const client = await getServerOpsClient();
  const command: CreateMaintenanceRecordCommand = {
    vehicleId: textValue(formData, "vehicleId"),
    type: resolveMaintenanceType(textValue(formData, "type")),
    description: textValue(formData, "description"),
  };

  const scheduledAt = textValue(formData, "scheduledAt");
  const technician = textValue(formData, "technician");
  const cost = textValue(formData, "cost");
  const notes = textValue(formData, "notes");
  const returnTo = sanitizeReturnTo(textValue(formData, "returnTo"));

  if (scheduledAt) {
    command.scheduledAt = new Date(scheduledAt).toISOString();
  }
  if (technician) {
    command.technician = technician;
  }
  const parsedCost = parseOptionalNumber(cost);
  if (parsedCost !== null) {
    command.cost = parsedCost;
  }
  if (notes) {
    command.notes = notes;
  }

  await client.createMaintenance(command);
  revalidatePath("/maintenance");
  redirect(returnTo);
}

async function updateMaintenanceAction(formData: FormData) {
  "use server";

  const client = await getServerOpsClient();
  const maintenanceId = textValue(formData, "maintenanceId");
  const command: UpdateMaintenanceRecordCommand = {
    status: resolveMaintenanceStatus(textValue(formData, "status")),
  };
  const completedAt = textValue(formData, "completedAt");
  const technician = textValue(formData, "technician");
  const cost = textValue(formData, "cost");
  const notes = textValue(formData, "notes");
  const returnTo = sanitizeReturnTo(textValue(formData, "returnTo"));

  if (completedAt) {
    command.completedAt = new Date(completedAt).toISOString();
  }
  if (technician) {
    command.technician = technician;
  }
  const parsedCost = parseOptionalNumber(cost);
  if (parsedCost !== null) {
    command.cost = parsedCost;
  }
  if (notes) {
    command.notes = notes;
  }

  await client.updateMaintenance(maintenanceId, command);
  revalidatePath("/maintenance");
  redirect(returnTo);
}

async function completeMaintenanceAction(formData: FormData) {
  "use server";

  const client = await getServerOpsClient();
  const maintenanceId = textValue(formData, "maintenanceId");
  const returnTo = sanitizeReturnTo(textValue(formData, "returnTo"));

  await client.updateMaintenance(maintenanceId, {
    status: "completed",
    completedAt: new Date().toISOString(),
  });
  revalidatePath("/maintenance");
  redirect(returnTo);
}

async function deleteMaintenanceAction(formData: FormData) {
  "use server";

  const client = await getServerOpsClient();
  const maintenanceId = textValue(formData, "maintenanceId");
  const returnTo = sanitizeReturnTo(textValue(formData, "returnTo"));

  await client.deleteMaintenance(maintenanceId);
  revalidatePath("/maintenance");
  redirect(returnTo);
}

export default async function MaintenancePage({
  searchParams,
}: MaintenancePageProps) {
  const [client, locale, resolvedSearchParams] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
    (searchParams ??
      Promise.resolve(
        {} as Record<string, string | string[] | undefined>,
      )) as Promise<Record<string, string | string[] | undefined>>,
  ]);

  let records: MaintenanceRecord[] = [];
  let error: string | null = null;

  try {
    records = await client.listMaintenance();
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : t("common.unknown", locale);
  }

  const statusFilter = resolveStatusFilter(
    firstParam(resolvedSearchParams?.status),
  );
  const query = firstParam(resolvedSearchParams?.q)?.trim() ?? "";
  const normalizedQuery = query.toLowerCase();
  const editorParam = firstParam(resolvedSearchParams?.editor);
  const returnTo = buildMaintenanceHref({
    status: statusFilter,
    q: query || undefined,
  });

  const sortedRecords = [...records].sort(compareMaintenanceRecords);
  const filteredRecords = sortedRecords.filter((record) => {
    const effectiveStatus = getEffectiveStatus(record);
    if (statusFilter !== "all" && effectiveStatus !== statusFilter) {
      return false;
    }
    return matchesQuery(record, normalizedQuery);
  });

  const effectiveStatusCounts = records.reduce<
    Record<MaintenanceStatus, number>
  >(
    (counts, record) => {
      counts[getEffectiveStatus(record)] += 1;
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

  const activeCount =
    effectiveStatusCounts.scheduled +
    effectiveStatusCounts.in_progress +
    effectiveStatusCounts.overdue;
  const impactedVehicleCount = new Set(
    records
      .filter((record) => {
        const effectiveStatus = getEffectiveStatus(record);
        return (
          effectiveStatus === "scheduled" ||
          effectiveStatus === "in_progress" ||
          effectiveStatus === "overdue"
        );
      })
      .map((record) => record.vehicleId),
  ).size;
  const todayKey = new Date().toISOString().slice(0, 10);
  const dueTodayCount = records.filter((record) => {
    const effectiveStatus = getEffectiveStatus(record);
    return (
      record.scheduledAt?.slice(0, 10) === todayKey &&
      effectiveStatus !== "completed" &&
      effectiveStatus !== "cancelled"
    );
  }).length;

  const statusTabs = [
    {
      value: "all" as const,
      label: copy(locale, "All", "全部"),
      count: records.length,
    },
    {
      value: "scheduled" as const,
      label: copy(locale, "Scheduled", "排程中"),
      count: effectiveStatusCounts.scheduled,
    },
    {
      value: "in_progress" as const,
      label: copy(locale, "In progress", "進行中"),
      count: effectiveStatusCounts.in_progress,
    },
    {
      value: "completed" as const,
      label: copy(locale, "Completed", "已完成"),
      count: effectiveStatusCounts.completed,
    },
    {
      value: "overdue" as const,
      label: copy(locale, "Overdue", "逾期"),
      count: effectiveStatusCounts.overdue,
    },
  ].map((tab) => ({
    ...tab,
    node: (
      <Link
        key={tab.value}
        href={buildMaintenanceHref({
          status: tab.value,
          q: query || undefined,
        })}
        style={{ color: "inherit", textDecoration: "none" }}
      >
        {`${tab.label} ${tab.count}`}
      </Link>
    ),
  }));

  const activeTab =
    statusTabs.find((tab) => tab.value === statusFilter)?.node ??
    statusTabs[0]?.node;

  const selectedRecord =
    editorParam && editorParam !== "new"
      ? (records.find((record) => record.maintenanceId === editorParam) ?? null)
      : null;
  const selectedImpact = selectedRecord
    ? impactSummary(selectedRecord, locale)
    : null;

  const tableRows: MaintenanceTableRow[] = filteredRecords.map((record) => ({
    ...record,
    _selected: selectedRecord?.maintenanceId === record.maintenanceId,
  }));

  const tableColumns: CanvasTableColumn<MaintenanceTableRow>[] = [
    {
      h: "WO",
      w: 96,
      mono: true,
      r: (row) => (
        <Link
          href={buildMaintenanceHref({
            status: statusFilter,
            q: query || undefined,
            editor: row.maintenanceId,
          })}
          style={{
            color: theme.accent,
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          {row.maintenanceId}
        </Link>
      ),
    },
    {
      h: t("maintenance.col.vehicle", locale),
      w: 112,
      mono: true,
      k: "vehicleId",
    },
    {
      h: copy(locale, "Category", "類別"),
      w: 248,
      r: (row) => (
        <div style={{ display: "grid", gap: 3 }}>
          <span style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
            {row.description}
          </span>
          <span
            style={{
              color: theme.textMuted,
              fontSize: 11,
              lineHeight: 1.3,
              whiteSpace: "normal",
            }}
          >
            {formatOpsCodeLabel(locale, row.type)}
          </span>
        </div>
      ),
    },
    {
      h: t("maintenance.col.status", locale).toUpperCase(),
      w: 132,
      r: (row) => {
        const effectiveStatus = getEffectiveStatus(row);
        return (
          <Pill theme={theme} tone={statusTone(effectiveStatus)} dot>
            {formatOpsCodeLabel(locale, effectiveStatus)}
          </Pill>
        );
      },
    },
    {
      h: t("maintenance.col.schedule", locale),
      w: 156,
      mono: true,
      r: (row) => formatDateTime(row.scheduledAt),
    },
    {
      h: t("maintenance.col.technician", locale),
      w: 96,
      r: (row) => row.technician ?? "—",
    },
    {
      h: t("maintenance.col.cost", locale),
      w: 120,
      mono: true,
      align: "right",
      r: (row) => formatCost(row.cost, locale),
    },
  ];

  const banner = error
    ? {
        tone: "danger" as const,
        title: copy(
          locale,
          "Live maintenance data unavailable",
          "即時保修資料暫時不可用",
        ),
        body: error,
      }
    : null;

  const editorTitle =
    editorParam === "new"
      ? t("maintenance.form.createTitle", locale)
      : t("maintenance.form.updateTitle", locale);

  const summaryCountLabel =
    filteredRecords.length === records.length
      ? t("maintenance.visibleOrders", locale, {
          count: filteredRecords.length,
        })
      : copy(
          locale,
          `${filteredRecords.length} / ${records.length} visible`,
          `${filteredRecords.length} / ${records.length} 筆顯示`,
        );

  return (
    <Shell
      theme={theme}
      nav={[]}
      title={t("maintenance.title", locale)}
      hideEnv
      style={shellStyle}
    >
      <PageHeader
        theme={theme}
        title={t("maintenance.title", locale)}
        subtitle={t("maintenance.subtitle", locale)}
        tabs={statusTabs.map((tab) => tab.node)}
        activeTab={activeTab}
        actions={
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <form method="GET">
              {statusFilter !== "all" ? (
                <input type="hidden" name="status" value={statusFilter} />
              ) : null}
              {query ? <input type="hidden" name="q" value={query} /> : null}
              <input type="hidden" name="editor" value="new" />
              <button type="submit" style={buttonBaseStyle(theme, "primary")}>
                {t("maintenance.createBtn", locale)}
              </button>
            </form>
            <form method="GET">
              <button type="submit" style={buttonBaseStyle(theme, "secondary")}>
                {t("common.refresh", locale)}
              </button>
            </form>
          </div>
        }
      />

      <div style={pageStackStyle}>
        {banner ? (
          <Banner
            theme={theme}
            tone={banner.tone}
            title={banner.title}
            body={banner.body}
          />
        ) : null}

        <div
          style={{
            display: "grid",
            gap: 16,
            alignItems: "start",
            gridTemplateColumns:
              editorParam === "new" || selectedRecord
                ? "minmax(0, 1.55fr) minmax(320px, 0.95fr)"
                : "minmax(0, 1fr)",
          }}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div style={toolbarStyle}>
              <div
                style={{
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Btn
                    theme={theme}
                    variant="ghost"
                    size="xs"
                    icon="filter"
                    disabled
                    style={{ opacity: 0.82, cursor: "default" }}
                  >
                    {summaryCountLabel}
                  </Btn>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: theme.textMuted,
                    }}
                  >
                    {copy(
                      locale,
                      "Tabs keep effective maintenance status in sync with dispatch risk.",
                      "頁籤依有效狀態同步反映派遣風險。",
                    )}
                  </span>
                </div>
              </div>

              <form method="GET" style={filterRowStyle}>
                {statusFilter !== "all" ? (
                  <input type="hidden" name="status" value={statusFilter} />
                ) : null}
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder={t("maintenance.search", locale)}
                  style={{
                    ...inputStyle(theme),
                    width: 280,
                  }}
                />
                <button
                  type="submit"
                  style={buttonBaseStyle(theme, "secondary")}
                >
                  {t("common.search", locale)}
                </button>
                {query ? (
                  <Link
                    href={buildMaintenanceHref({ status: statusFilter })}
                    style={buttonBaseStyle(theme, "ghost")}
                  >
                    {copy(locale, "Clear", "清除")}
                  </Link>
                ) : null}
              </form>
            </div>

            <Card theme={theme} padding={0}>
              {tableRows.length > 0 ? (
                <Table<MaintenanceTableRow>
                  theme={theme}
                  columns={tableColumns}
                  rows={tableRows}
                />
              ) : (
                <div
                  style={{
                    padding: "18px 16px",
                    color: theme.textMuted,
                    fontSize: 12.5,
                  }}
                >
                  {t("maintenance.empty", locale)}
                </div>
              )}
            </Card>
          </div>

          {editorParam === "new" || selectedRecord ? (
            <div style={editorStackStyle}>
              <Card
                theme={theme}
                title={editorTitle}
                subtitle={t("maintenance.form.editor", locale)}
              >
                <div style={kpiGridStyle}>
                  <KPI
                    theme={theme}
                    label={t("maintenance.activeOrders", locale)}
                    value={activeCount}
                    delta={
                      dueTodayCount > 0
                        ? copy(
                            locale,
                            `${dueTodayCount} due today`,
                            `${dueTodayCount} 筆今日排程`,
                          )
                        : undefined
                    }
                    deltaTone={dueTodayCount > 0 ? "neutral" : "neutral"}
                    sub={t("maintenance.activeOrdersSub", locale)}
                  />
                  <KPI
                    theme={theme}
                    label={t("maintenance.overdue", locale)}
                    value={effectiveStatusCounts.overdue}
                    delta={
                      impactedVehicleCount > 0
                        ? copy(
                            locale,
                            `${impactedVehicleCount} vehicles`,
                            `${impactedVehicleCount} 台車`,
                          )
                        : undefined
                    }
                    deltaTone={
                      effectiveStatusCounts.overdue > 0 ? "down" : "neutral"
                    }
                    sub={t("maintenance.overdueSub", locale)}
                  />
                  <KPI
                    theme={theme}
                    label={t("maintenance.completed", locale)}
                    value={effectiveStatusCounts.completed}
                    sub={t("maintenance.completedSub", locale)}
                  />
                </div>

                {selectedRecord && selectedImpact ? (
                  <>
                    <Banner
                      theme={theme}
                      tone={selectedImpact.tone}
                      title={selectedImpact.title}
                      body={selectedImpact.body}
                    />
                    <div style={{ height: 12 }} />
                  </>
                ) : null}

                <DL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      label: t("maintenance.col.workOrder", locale),
                      value:
                        selectedRecord?.maintenanceId ??
                        copy(locale, "New work order", "新工單"),
                      mono: Boolean(selectedRecord),
                    },
                    {
                      label: t("maintenance.col.vehicle", locale),
                      value: selectedRecord?.vehicleId ?? "—",
                      mono: Boolean(selectedRecord),
                    },
                    {
                      label: t("maintenance.col.status", locale),
                      value: selectedRecord
                        ? formatOpsCodeLabel(
                            locale,
                            getEffectiveStatus(selectedRecord),
                          )
                        : copy(locale, "Scheduled", "排程中"),
                    },
                    {
                      label: t("maintenance.col.schedule", locale),
                      value: formatDateTime(selectedRecord?.scheduledAt),
                      mono: true,
                    },
                  ]}
                />

                <form
                  action={
                    selectedRecord
                      ? updateMaintenanceAction
                      : createMaintenanceAction
                  }
                  style={{
                    marginTop: 16,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <input type="hidden" name="returnTo" value={returnTo} />
                  {selectedRecord ? (
                    <input
                      type="hidden"
                      name="maintenanceId"
                      value={selectedRecord.maintenanceId}
                    />
                  ) : null}

                  {!selectedRecord ? (
                    <>
                      <Field
                        theme={theme}
                        label={t("maintenance.form.vehicleId", locale)}
                        required
                      >
                        <input
                          name="vehicleId"
                          required
                          style={inputStyle(theme, true)}
                        />
                      </Field>

                      <Field
                        theme={theme}
                        label={t("maintenance.form.type", locale)}
                        required
                      >
                        <select
                          name="type"
                          defaultValue="scheduled_service"
                          style={inputStyle(theme)}
                        >
                          {TYPES.map((value) => (
                            <option key={value} value={value}>
                              {formatOpsCodeLabel(locale, value)}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field
                        theme={theme}
                        label={t("maintenance.form.description", locale)}
                        required
                      >
                        <textarea
                          name="description"
                          required
                          style={textareaStyle(theme)}
                        />
                      </Field>

                      <Field
                        theme={theme}
                        label={t("maintenance.form.scheduledAt", locale)}
                      >
                        <input
                          type="datetime-local"
                          name="scheduledAt"
                          style={inputStyle(theme, true)}
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field
                        theme={theme}
                        label={t("maintenance.col.status", locale)}
                        required
                      >
                        <select
                          name="status"
                          defaultValue={selectedRecord.status}
                          style={inputStyle(theme)}
                        >
                          {STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {formatOpsCodeLabel(locale, value)}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field
                        theme={theme}
                        label={t("maintenance.form.completedAt", locale)}
                      >
                        <input
                          type="datetime-local"
                          name="completedAt"
                          defaultValue={formatDateTimeLocalValue(
                            selectedRecord.completedAt,
                          )}
                          style={inputStyle(theme, true)}
                        />
                      </Field>
                    </>
                  )}

                  <Field
                    theme={theme}
                    label={t("maintenance.form.technician", locale)}
                  >
                    <input
                      name="technician"
                      defaultValue={selectedRecord?.technician ?? ""}
                      style={inputStyle(theme)}
                    />
                  </Field>

                  <Field
                    theme={theme}
                    label={t("maintenance.form.cost", locale)}
                  >
                    <input
                      type="number"
                      min="0"
                      step="1"
                      name="cost"
                      defaultValue={
                        selectedRecord?.cost !== null &&
                        selectedRecord?.cost !== undefined
                          ? String(selectedRecord.cost)
                          : ""
                      }
                      style={inputStyle(theme, true)}
                    />
                  </Field>

                  <Field
                    theme={theme}
                    label={t("maintenance.form.notes", locale)}
                  >
                    <textarea
                      name="notes"
                      defaultValue={selectedRecord?.notes ?? ""}
                      style={textareaStyle(theme)}
                    />
                  </Field>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="submit"
                      style={buttonBaseStyle(theme, "primary")}
                    >
                      {selectedRecord
                        ? t("maintenance.form.saveChanges", locale)
                        : t("maintenance.form.createRecord", locale)}
                    </button>
                    <Link
                      href={returnTo}
                      style={buttonBaseStyle(theme, "secondary")}
                    >
                      {t("common.cancel", locale)}
                    </Link>
                  </div>
                </form>

                {selectedRecord ? (
                  <div
                    style={{
                      marginTop: 14,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {selectedRecord.status !== "completed" &&
                    selectedRecord.status !== "cancelled" ? (
                      <form action={completeMaintenanceAction}>
                        <input
                          type="hidden"
                          name="maintenanceId"
                          value={selectedRecord.maintenanceId}
                        />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button
                          type="submit"
                          style={buttonBaseStyle(theme, "secondary")}
                        >
                          {t("maintenance.completeBtn", locale)}
                        </button>
                      </form>
                    ) : null}
                    <form action={deleteMaintenanceAction}>
                      <input
                        type="hidden"
                        name="maintenanceId"
                        value={selectedRecord.maintenanceId}
                      />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button
                        type="submit"
                        style={buttonBaseStyle(theme, "secondary", true)}
                      >
                        {t("common.delete", locale)}
                      </button>
                    </form>
                  </div>
                ) : null}
              </Card>
            </div>
          ) : null}
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: theme.textMuted,
          }}
        >
          <Link
            href="/dashboard"
            style={{
              color: theme.accent,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {t("common.backToDashboard", locale)}
          </Link>{" "}
          {t("common.backToDashboardSub", locale)}
        </p>
      </div>
    </Shell>
  );
}
