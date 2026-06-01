"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type CSSProperties,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasField as Field,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import type {
  CreateMaintenanceRecordCommand,
  CrossAppResourceLink,
  EmptyReason,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
  ResourceActionDescriptor,
  UiRefreshMetadata,
  UpdateMaintenanceRecordCommand,
} from "@drts/contracts";
import { MAINTENANCE_STATUSES, MAINTENANCE_TYPES } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { isMaintenanceOverdue } from "@/lib/ops-analytics";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const STATUSES: MaintenanceStatus[] = [...MAINTENANCE_STATUSES];
const TYPES: MaintenanceType[] = [...MAINTENANCE_TYPES];

// Refresh tier — packet §3.2 / §5.13: T3 Ops medium (15s polling) for /maintenance.
const REFRESH_TIER_LABEL = "T3 · 15s";
const REFRESH_STALE_AFTER_MS = 15_000;
const REFRESH_POLL_MS = 15_000;

const EMPTY_REASONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

const EMPTY_REASON_CODES: Record<EmptyReason, string> = {
  no_data: "maintenance_registry_empty",
  not_provisioned: "maintenance_registry_not_provisioned",
  fetch_failed: "maintenance_registry_fetch_failed",
  permission_denied: "maintenance_registry_permission_denied",
  external_unavailable: "maintenance_registry_external_unavailable",
  filtered_empty: "maintenance_registry_filtered_empty",
  driver_not_eligible: "driver_not_eligible",
};

type StatusTab = "all" | "scheduled" | "in_progress" | "overdue";

type MaintenanceTableRow = Record<string, unknown> &
  MaintenanceRecord & {
    effectiveStatus: MaintenanceStatus;
    overdue: boolean;
    availableActions: ResourceActionDescriptor[];
    vehicleLink: string;
    crossAppLinks: CrossAppResourceLink[];
  };

type ToastReceipt = {
  tone: CanvasTone;
  message: string;
  actionId: string;
  auditId: string;
};

type PendingConfirm = {
  record: MaintenanceRecord;
  action: ResourceActionDescriptor;
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function controlStyle(themeToken: CanvasTheme, mono = false): CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${themeToken.border}`,
    background: themeToken.surfaceLo,
    color: themeToken.text,
    fontSize: 12.5,
    fontFamily: mono ? themeToken.monoFamily : themeToken.fontFamily,
    boxSizing: "border-box",
  };
}

function textAreaStyle(themeToken: CanvasTheme): CSSProperties {
  return {
    ...controlStyle(themeToken),
    minHeight: 96,
    resize: "vertical",
  };
}

function primaryButtonStyle(themeToken: CanvasTheme): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "5px 10px",
    height: 28,
    borderRadius: 7,
    border: `1px solid ${themeToken.accent}`,
    background: themeToken.accent,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: themeToken.fontFamily,
    cursor: "pointer",
  };
}

function emptyStateStyle(): CSSProperties {
  return {
    display: "grid",
    justifyItems: "center",
    textAlign: "center",
    gap: 10,
    padding: "28px 20px",
  };
}

function tinyMetaStyle(
  themeToken: CanvasTheme,
  tone: CanvasTone,
): CSSProperties {
  return {
    fontSize: 10.5,
    color: toneColor(themeToken, tone),
    letterSpacing: 0.2,
  };
}

function toneColor(themeToken: CanvasTheme, tone: CanvasTone) {
  const colors: Record<CanvasTone, string> = {
    success: themeToken.success,
    warn: themeToken.warn,
    danger: themeToken.danger,
    info: themeToken.info,
    accent: themeToken.accent,
    neutral: themeToken.textMuted,
  };
  return colors[tone];
}

function formatCost(locale: Locale, value: number | null): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTableDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}

function formatLongDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

function getEffectiveStatus(record: MaintenanceRecord): MaintenanceStatus {
  return isMaintenanceOverdue(record) ? "overdue" : record.status;
}

function statusTone(status: MaintenanceStatus): CanvasTone {
  switch (status) {
    case "overdue":
      return "danger";
    case "completed":
      return "success";
    case "in_progress":
      return "info";
    case "cancelled":
      return "neutral";
    case "scheduled":
    default:
      return "warn";
  }
}

function matchesTab(status: MaintenanceStatus, tab: StatusTab) {
  if (tab === "all") return true;
  return status === tab;
}

function buildOpsNav(locale: Locale) {
  return [
    { divider: copy(locale, "Workspace", "工作面") },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard" as const,
      label: copy(locale, "Dashboard", "營運總覽"),
    },
    { divider: copy(locale, "Dispatch", "即時派遣") },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch" as const,
      label: copy(locale, "Dispatch", "派遣"),
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter" as const,
      label: copy(locale, "Callcenter", "客服中心"),
    },
    { divider: copy(locale, "Casework", "案件處理") },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints" as const,
      label: copy(locale, "Complaints", "客訴"),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents" as const,
      label: copy(locale, "Incidents", "事故"),
    },
    { divider: copy(locale, "Monitoring", "營運監控") },
    {
      key: "reports",
      href: "/reports",
      icon: "reports" as const,
      label: copy(locale, "Reports", "報表"),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue" as const,
      label: copy(locale, "Revenue", "收益審視"),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance" as const,
      label: copy(locale, "Attendance", "班次出勤"),
    },
    {
      key: "maintenance",
      href: "/maintenance",
      icon: "maintenance" as const,
      label: copy(locale, "Maintenance", "車輛保修"),
    },
    { divider: copy(locale, "Registry", "主資料") },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet" as const,
      label: copy(locale, "Drivers", "司機"),
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles" as const,
      label: copy(locale, "Vehicles", "車輛"),
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts" as const,
      label: copy(locale, "Contracts", "合約"),
    },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags" as const,
      label: copy(locale, "Feature Flags", "功能旗標"),
    },
  ];
}

function resolvePlatformAdminOrigin(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
    process.env.PLATFORM_ADMIN_ORIGIN,
  ];
  const resolved = candidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );
  return resolved ? resolved.replace(/\/$/, "") : "http://localhost:3002";
}

// Cross-app deep links — packet §3.10 / §4.2. Maintenance owns the work-order
// mutation, but vehicle dispatchability / compliance live in the registry and
// in platform-admin fleet governance.
function synthesizeCrossAppLinks(
  record: MaintenanceRecord,
  overdue: boolean,
  locale: Locale,
): CrossAppResourceLink[] {
  if (!overdue) {
    return [];
  }
  return [
    {
      targetApp: "platform-admin",
      route: `/fleet?vehicleId=${encodeURIComponent(record.vehicleId)}`,
      resourceType: "vehicle",
      resourceId: record.vehicleId,
      openMode: "new_tab",
      label: copy(locale, "Fleet governance", "車隊治理"),
    },
  ];
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  if (link.route.startsWith("http://") || link.route.startsWith("https://")) {
    return link.route;
  }
  return `${resolvePlatformAdminOrigin()}${
    link.route.startsWith("/") ? link.route : `/${link.route}`
  }`;
}

// availableActions — packet §3.5: CTAs come from descriptors, not hard-coded
// role checks. The maintenance backend still returns plain records, so the page
// synthesizes the descriptor list the rebuilt UI consumes.
function synthesizeAvailableActions(
  record: MaintenanceRecord,
): ResourceActionDescriptor[] {
  const closed = record.status === "completed" || record.status === "cancelled";
  const completable =
    record.status === "scheduled" ||
    record.status === "in_progress" ||
    record.status === "overdue" ||
    isMaintenanceOverdue(record);

  return [
    {
      action: "edit_maintenance",
      enabled: !closed,
      ...(closed ? { disabledReasonCode: "already_closed" } : {}),
      riskLevel: "medium",
    },
    {
      action: "complete_maintenance",
      enabled: completable,
      ...(completable ? {} : { disabledReasonCode: "not_in_progress" }),
      riskLevel: "medium",
    },
    {
      action: "open_vehicle",
      enabled: true,
      riskLevel: "low",
    },
  ];
}

function actionTone(action: ResourceActionDescriptor): CanvasTone {
  if (!action.enabled) return "neutral";
  if (action.riskLevel === "high") return "danger";
  if (action.riskLevel === "medium") return "warn";
  return "accent";
}

function actionLabel(action: ResourceActionDescriptor, locale: Locale) {
  switch (action.action) {
    case "edit_maintenance":
      return copy(locale, "Edit", "編輯");
    case "complete_maintenance":
      return copy(locale, "Complete", "完成");
    case "open_vehicle":
      return copy(locale, "Vehicle", "車輛");
    default:
      return formatOpsCodeLabel(locale, action.action);
  }
}

function actionReason(action: ResourceActionDescriptor, locale: Locale) {
  if (!action.disabledReasonCode) return null;
  if (action.disabledReasonCode === "already_closed") {
    return copy(locale, "Work order is already closed.", "工單已結案。");
  }
  if (action.disabledReasonCode === "not_in_progress") {
    return copy(
      locale,
      "Only open work orders can be completed.",
      "僅未結工單可標記完成。",
    );
  }
  return formatOpsCodeLabel(locale, action.disabledReasonCode);
}

type EmptyIcon =
  | "flags"
  | "warn"
  | "users"
  | "health"
  | "filter"
  | "maintenance";

type EmptyView = {
  tone: CanvasTone;
  icon: EmptyIcon;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  actionNewTab: boolean;
};

// Empty / not-ready states — packet §3.6: every EmptyReason renders a distinct
// illustration / copy / CTA. Collapsing them to "No data" defeats the contract.
function buildEmptyView(
  reason: EmptyReason,
  locale: Locale,
  rawMessage: string | null,
): EmptyView {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info",
        icon: "flags",
        title: copy(
          locale,
          "Maintenance module not provisioned",
          "保修模組尚未開通",
        ),
        description: copy(
          locale,
          "Work-order tracking is not enabled for this environment yet.",
          "此環境尚未啟用工單追蹤功能。",
        ),
        actionLabel: copy(locale, "Open feature flags", "前往功能旗標"),
        actionHref: "/feature-flags",
        actionNewTab: false,
      };
    case "fetch_failed":
      return {
        tone: "danger",
        icon: "warn",
        title: copy(locale, "Maintenance snapshot failed", "保修快照讀取失敗"),
        description:
          rawMessage ??
          copy(
            locale,
            "The maintenance endpoint did not return a usable payload.",
            "保修資料端點未回傳可用內容。",
          ),
        actionLabel: copy(locale, "Retry", "重新整理"),
        actionHref: "/maintenance",
        actionNewTab: false,
      };
    case "permission_denied":
      return {
        tone: "warn",
        icon: "users",
        title: copy(locale, "Maintenance scope denied", "無法存取保修範圍"),
        description: copy(
          locale,
          "This actor can enter the shell but lacks maintenance read scope.",
          "目前帳號可進入殼層，但沒有保修讀取權限。",
        ),
        actionLabel: copy(locale, "Open ops dashboard", "返回儀表板"),
        actionHref: "/dashboard",
        actionNewTab: false,
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "health",
        title: copy(
          locale,
          "Maintenance dependency unavailable",
          "保修相依服務不可用",
        ),
        description: copy(
          locale,
          "The fleet maintenance adapter is degraded. Use fleet governance for the latest compliance state.",
          "車隊保修轉接器降級，請改用車隊治理檢視最新法遵狀態。",
        ),
        actionLabel: copy(locale, "Open fleet governance", "開啟車隊治理"),
        actionHref: `${resolvePlatformAdminOrigin()}/fleet`,
        actionNewTab: true,
      };
    case "filtered_empty":
      return {
        tone: "accent",
        icon: "filter",
        title: copy(
          locale,
          "No work orders match this slice",
          "目前條件沒有符合的工單",
        ),
        description: copy(
          locale,
          "Widen the status tab, search, or status filter to restore results.",
          "放寬狀態分頁、搜尋或狀態條件即可恢復結果。",
        ),
        actionLabel: copy(locale, "Clear filters", "清除條件"),
        actionHref: "/maintenance",
        actionNewTab: false,
      };
    case "no_data":
    default:
      return {
        tone: "neutral",
        icon: "maintenance",
        title: copy(locale, "No maintenance records", "尚無保修工單"),
        description: copy(
          locale,
          "The registry is healthy but no work orders exist in this environment yet.",
          "保修資料健康，但此環境目前還沒有任何工單。",
        ),
        actionLabel: copy(locale, "Open vehicle registry", "前往車輛主檔"),
        actionHref: "/vehicles",
        actionNewTab: false,
      };
  }
}

function classifyFetchError(message: string): EmptyReason {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("403") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission") ||
    normalized.includes("unauthor")
  ) {
    return "permission_denied";
  }
  if (
    normalized.includes("404") ||
    normalized.includes("501") ||
    normalized.includes("not provisioned") ||
    normalized.includes("not implemented")
  ) {
    return "not_provisioned";
  }
  if (
    normalized.includes("503") ||
    normalized.includes("502") ||
    normalized.includes("econn") ||
    normalized.includes("timeout") ||
    normalized.includes("unavailable") ||
    normalized.includes("fetch failed")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function isEmptyReason(value: string | null): value is EmptyReason {
  return value !== null && EMPTY_REASONS.includes(value as EmptyReason);
}

export default function MaintenancePage() {
  const { locale } = useTranslation();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatedAtMs, setGeneratedAtMs] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | "all">(
    "all",
  );
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const [confirmReason, setConfirmReason] = useState("");
  const [toast, setToast] = useState<ToastReceipt | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const vehicleIdFromQuery = searchParams.get("vehicleId")?.trim() ?? "";
  const emptyReasonOverride = searchParams.get("emptyReason");
  const createFromQuery = searchParams.get("create") === "1";

  const loadRecords = useCallback(
    async (mode: "initial" | "poll") => {
      if (mode === "initial") {
        setLoading(true);
      }
      try {
        const client = getOpsClient();
        const result = await client.listMaintenance();
        setRecords(result);
        setLoadError(null);
        setGeneratedAtMs(Date.now());
        setNowMs(Date.now());
      } catch (e) {
        setLoadError(
          e instanceof Error ? e.message : getOpsLabel(locale, "unknown"),
        );
      } finally {
        if (mode === "initial") {
          setLoading(false);
        }
      }
    },
    [locale],
  );

  useEffect(() => {
    void loadRecords("initial");
  }, [loadRecords]);

  // Refresh tier — T3 medium: poll every 15s and keep an age clock for the
  // stale affordance (packet §3.2). Manual refresh stays available too.
  useEffect(() => {
    const poll = setInterval(() => {
      void loadRecords("poll");
    }, REFRESH_POLL_MS);
    const clock = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [loadRecords]);

  useEffect(() => {
    if (createFromQuery) {
      setShowCreate(true);
      setEditingId(null);
    }
  }, [createFromQuery]);

  useEffect(() => {
    if (vehicleIdFromQuery) {
      setQuery(vehicleIdFromQuery);
    }
  }, [vehicleIdFromQuery]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), 6_000);
    return () => clearTimeout(timer);
  }, [toast]);

  const editingRecord = editingId
    ? records.find((record) => record.maintenanceId === editingId)
    : undefined;

  const ageMs = generatedAtMs > 0 ? nowMs - generatedAtMs : 0;
  const isStale = generatedAtMs > 0 && ageMs > REFRESH_STALE_AFTER_MS;
  const freshness: UiRefreshMetadata["dataFreshness"] = loadError
    ? "degraded"
    : isStale
      ? "stale"
      : "fresh";

  const counts = useMemo(() => {
    const base = {
      all: records.length,
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      overdue: 0,
    };
    for (const record of records) {
      const effective = getEffectiveStatus(record);
      if (effective === "scheduled") base.scheduled += 1;
      if (effective === "in_progress") base.in_progress += 1;
      if (effective === "completed") base.completed += 1;
      if (effective === "overdue") base.overdue += 1;
    }
    return base;
  }, [records]);

  const dispatchImpactCount = useMemo(
    () =>
      records.filter(
        (record) =>
          isMaintenanceOverdue(record) ||
          record.status === "scheduled" ||
          record.status === "in_progress",
      ).length,
    [records],
  );

  const filteredRecords = useMemo(() => {
    return records
      .filter((record) => {
        const effective = getEffectiveStatus(record);
        if (!matchesTab(effective, activeTab)) return false;
        if (statusFilter !== "all" && effective !== statusFilter) return false;
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
      })
      .sort((left, right) => {
        const leftOverdue = isMaintenanceOverdue(left) ? 0 : 1;
        const rightOverdue = isMaintenanceOverdue(right) ? 0 : 1;
        if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
        return (left.scheduledAt ?? "").localeCompare(right.scheduledAt ?? "");
      });
  }, [records, activeTab, statusFilter, deferredQuery]);

  const hasActiveFilters =
    activeTab !== "all" || statusFilter !== "all" || deferredQuery.length > 0;

  let emptyReason: EmptyReason | null = null;
  if (isEmptyReason(emptyReasonOverride)) {
    emptyReason = emptyReasonOverride;
  } else if (!loading && filteredRecords.length === 0) {
    if (loadError) {
      emptyReason = classifyFetchError(loadError);
    } else if (hasActiveFilters) {
      emptyReason = "filtered_empty";
    } else {
      emptyReason = "no_data";
    }
  }

  const emptyView = emptyReason
    ? buildEmptyView(emptyReason, locale, loadError)
    : null;

  const tableRows: MaintenanceTableRow[] = filteredRecords.map((record) => {
    const overdue = isMaintenanceOverdue(record);
    return {
      ...record,
      effectiveStatus: getEffectiveStatus(record),
      overdue,
      availableActions: synthesizeAvailableActions(record),
      vehicleLink: `/vehicles/${encodeURIComponent(record.vehicleId)}`,
      crossAppLinks: synthesizeCrossAppLinks(record, overdue, locale),
    };
  });

  function runConfirmedAction(target: PendingConfirm, reason: string) {
    const { record, action } = target;
    void (async () => {
      try {
        const client = getOpsClient();
        if (action.action === "complete_maintenance") {
          await client.updateMaintenance(record.maintenanceId, {
            status: "completed",
            ...(reason.trim() ? { notes: reason.trim() } : {}),
          });
        }
        await loadRecords("poll");
        setToast({
          tone: "success",
          message: copy(
            locale,
            `Work order ${record.maintenanceId} marked completed.`,
            `工單 ${record.maintenanceId} 已標記完成。`,
          ),
          actionId: `act_${record.maintenanceId}`,
          auditId: `audit_${record.maintenanceId}`,
        });
      } catch (e) {
        setToast({
          tone: "danger",
          message:
            e instanceof Error ? e.message : getOpsLabel(locale, "unknown"),
          actionId: `act_${record.maintenanceId}`,
          auditId: "—",
        });
      } finally {
        setPendingConfirm(null);
        setConfirmReason("");
      }
    })();
  }

  function onActionClick(
    row: MaintenanceTableRow,
    action: ResourceActionDescriptor,
  ) {
    if (!action.enabled) return;
    if (action.action === "edit_maintenance") {
      setEditingId(row.maintenanceId);
      setShowCreate(false);
      return;
    }
    if (action.action === "complete_maintenance") {
      // Medium risk — packet §3.4: modal confirm + toast receipt.
      setPendingConfirm({ record: row, action });
      setConfirmReason("");
    }
  }

  const columns: CanvasTableColumn<MaintenanceTableRow>[] = [
    {
      h: copy(locale, "WO", "工單"),
      w: 110,
      mono: true,
      r: (row) => (
        <div style={{ display: "grid", gap: 3, whiteSpace: "normal" }}>
          <span style={{ fontWeight: 600 }}>{row.maintenanceId}</span>
          <span style={{ color: theme.textMuted, fontSize: 10.5 }}>
            {formatOpsCodeLabel(locale, row.type)}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "VEHICLE", "車輛"),
      w: 130,
      r: (row) => (
        <Link
          href={row.vehicleLink}
          style={{
            color: theme.accent,
            textDecoration: "none",
            fontFamily: theme.monoFamily,
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {row.vehicleId}
        </Link>
      ),
    },
    {
      h: copy(locale, "DETAIL", "類別"),
      w: 240,
      r: (row) => (
        <div style={{ display: "grid", gap: 3, whiteSpace: "normal" }}>
          <span>{row.description}</span>
          {row.technician ? (
            <span style={{ color: theme.textDim, fontSize: 10.5 }}>
              {copy(locale, "Technician", "技師")} · {row.technician}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: "STATUS",
      w: 130,
      r: (row) => (
        <Pill theme={theme} tone={statusTone(row.effectiveStatus)} dot>
          {formatOpsCodeLabel(locale, row.effectiveStatus)}
        </Pill>
      ),
    },
    {
      h: copy(locale, "SCHEDULE", "排定"),
      w: 160,
      mono: true,
      r: (row) => (
        <div style={{ display: "grid", gap: 3, whiteSpace: "normal" }}>
          <span>{formatTableDateTime(row.scheduledAt)}</span>
          {row.completedAt ? (
            <span style={{ color: theme.success, fontSize: 10.5 }}>
              {copy(locale, "done", "完成")} ·{" "}
              {formatTableDateTime(row.completedAt)}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: copy(locale, "COST", "費用"),
      w: 96,
      mono: true,
      align: "right",
      r: (row) => formatCost(locale, row.cost),
    },
    {
      h: "ACTIONS",
      w: 220,
      r: (row) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {row.availableActions.map((action) => {
            if (action.action === "open_vehicle") {
              return (
                <Link
                  key={`${row.maintenanceId}-${action.action}`}
                  href={row.vehicleLink}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    height: 26,
                    padding: "0 8px",
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: theme.surfaceLo,
                    color: theme.textMuted,
                    fontSize: 11,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {actionLabel(action, locale)}
                </Link>
              );
            }
            const reason = actionReason(action, locale);
            return (
              <Btn
                key={`${row.maintenanceId}-${action.action}`}
                theme={theme}
                size="xs"
                danger={actionTone(action) === "danger"}
                disabled={!action.enabled}
                onClick={() => onActionClick(row, action)}
              >
                <span title={reason ?? undefined}>
                  {actionLabel(action, locale)}
                </span>
              </Btn>
            );
          })}
          {row.crossAppLinks.map((link) => (
            <Link
              key={`${row.maintenanceId}-${link.label}`}
              href={buildCrossAppHref(link)}
              target={link.openMode === "new_tab" ? "_blank" : undefined}
              rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                height: 26,
                padding: "0 8px",
                borderRadius: 6,
                border: `1px solid ${theme.infoBorder}`,
                background: theme.infoBg,
                color: theme.info,
                fontSize: 11,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {link.label}
              <CanvasIcon name="ext" size={11} />
            </Link>
          ))}
        </div>
      ),
    },
  ];

  const nav = buildOpsNav(locale);
  const tabConfig: Array<{ key: StatusTab; label: string; tone?: CanvasTone }> =
    [
      { key: "all", label: copy(locale, "All", "全部") },
      { key: "scheduled", label: copy(locale, "Scheduled", "排程中") },
      { key: "in_progress", label: copy(locale, "In progress", "進行中") },
      {
        key: "overdue",
        label: copy(locale, "Overdue", "逾期"),
        tone: "danger",
      },
    ];
  const tabCountFor = (key: StatusTab) =>
    key === "all" ? counts.all : counts[key];
  const tabNodes = tabConfig.map((tab) => (
    <button
      key={tab.key}
      type="button"
      onClick={() => setActiveTab(tab.key)}
      style={{
        padding: 0,
        border: "none",
        background: "transparent",
        color: "inherit",
        font: "inherit",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {tab.label}
      <span style={tinyMetaStyle(theme, tab.tone ?? "neutral")}>
        {tabCountFor(tab.key)}
      </span>
    </button>
  ));
  const activeTabNode =
    tabNodes[tabConfig.findIndex((tab) => tab.key === activeTab)] ??
    tabNodes[0];

  return (
    <Shell
      theme={theme}
      nav={nav}
      active="maintenance"
      currentPath="/maintenance"
      breadcrumb={[
        copy(locale, "Monitoring", "營運監控"),
        copy(locale, "Maintenance", "維修保養"),
      ]}
      brandLabel="DRTS Fleet"
      brandSubLabel={copy(locale, "Operations Console", "營運控制台")}
      brandMark="OC"
      env="production"
      searchPlaceholder={copy(
        locale,
        "work order, vehicle, technician",
        "工單、車輛、技師",
      )}
      avatarLabel="OC"
      style={{ minHeight: "100vh" }}
    >
      <PageHeader
        theme={theme}
        title={copy(locale, "Maintenance", "車輛保修")}
        subtitle={copy(
          locale,
          "work order · schedule · technician · dispatch impact",
          "工單 · 排程 · 技師 · 影響派遣",
        )}
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <>
            <Pill
              theme={theme}
              tone={freshness === "fresh" ? "success" : "warn"}
            >
              {`${formatOpsCodeLabel(locale, freshness)} · ${REFRESH_TIER_LABEL}`}
            </Pill>
            <Btn
              theme={theme}
              icon="filter"
              variant={showFilters ? "primary" : "secondary"}
              onClick={() => setShowFilters((value) => !value)}
            >
              {copy(locale, "Filters", "篩選")}
            </Btn>
            <Btn
              theme={theme}
              icon="arrow"
              onClick={() => void loadRecords("poll")}
            >
              {copy(locale, "Refresh", "重新整理")}
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
              {copy(locale, "Create work order", "開立工單")}
            </Btn>
          </>
        }
      />

      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {loadError ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(
              locale,
              "Maintenance page is running degraded",
              "保修頁面目前為降級模式",
            )}
            body={`maintenance: ${loadError}`}
          />
        ) : null}

        {!loadError && freshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone="info"
            icon="clock"
            title={copy(
              locale,
              "Snapshot is not fresh",
              "目前顯示的快照非最新",
            )}
            body={copy(
              locale,
              `Last refreshed ${formatLongDateTime(new Date(generatedAtMs).toISOString())} UTC. Auto-refresh runs every 15s (T3).`,
              `最後更新 ${formatLongDateTime(new Date(generatedAtMs).toISOString())} UTC，每 15 秒自動刷新（T3）。`,
            )}
          />
        ) : null}

        {counts.overdue > 0 ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(
              locale,
              `${counts.overdue} overdue work order(s) impacting dispatchable supply`,
              `${counts.overdue} 筆逾期工單正影響可派車量`,
            )}
            body={copy(
              locale,
              "Decide whether overdue maintenance should remove these vehicles from the dispatchable pool.",
              "請評估逾期保修是否應將相關車輛移出可派遣車隊。",
            )}
            actions={
              <Btn
                theme={theme}
                variant="primary"
                onClick={() => setActiveTab("overdue")}
              >
                {copy(locale, "View overdue", "檢視逾期")}
              </Btn>
            }
          />
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 10,
          }}
        >
          <KPI
            theme={theme}
            label={copy(locale, "Active orders", "進行中工單")}
            value={counts.scheduled + counts.in_progress}
            delta={copy(locale, "scheduled + in progress", "排程 + 進行中")}
            deltaTone="neutral"
          />
          <KPI
            theme={theme}
            label={copy(locale, "Overdue", "逾期")}
            value={counts.overdue}
            delta={
              counts.overdue > 0
                ? copy(locale, "dispatch risk", "派車風險")
                : copy(locale, "clear", "正常")
            }
            deltaTone={counts.overdue > 0 ? "down" : "up"}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Completed", "已完成")}
            value={counts.completed}
            delta={copy(locale, "closed work orders", "已結工單")}
            deltaTone="neutral"
          />
          <KPI
            theme={theme}
            label={copy(locale, "Dispatch impact", "派車影響")}
            value={dispatchImpactCount}
            delta={copy(locale, "open vs supply", "未結影響供給")}
            deltaTone={dispatchImpactCount > 0 ? "down" : "neutral"}
          />
        </div>

        {showFilters ? (
          <Card
            theme={theme}
            title={copy(locale, "Filter work orders", "篩選工單")}
            subtitle={copy(
              locale,
              `${filteredRecords.length} visible / ${records.length} total`,
              `目前顯示 ${filteredRecords.length} / 總數 ${records.length}`,
            )}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
              }}
            >
              <Field theme={theme} label={copy(locale, "Search", "搜尋")}>
                <input
                  type="search"
                  style={controlStyle(theme)}
                  placeholder={copy(
                    locale,
                    "work order, vehicle, technician",
                    "工單、車輛、技師",
                  )}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </Field>
              <Field theme={theme} label={copy(locale, "Status", "狀態")}>
                <select
                  style={controlStyle(theme)}
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as MaintenanceStatus | "all",
                    )
                  }
                >
                  <option value="all">{copy(locale, "All", "全部")}</option>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatOpsCodeLabel(locale, status)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>
        ) : null}

        {showCreate || editingId ? (
          <Card
            theme={theme}
            title={
              editingId
                ? copy(locale, "Update work order", "更新工單")
                : copy(locale, "Create work order", "開立工單")
            }
            subtitle={
              editingId
                ? (editingRecord?.maintenanceId ??
                  copy(locale, "Select a record", "請選擇工單"))
                : copy(locale, "Maintenance · medium risk", "保修 · 中度風險")
            }
          >
            <MaintenanceForm
              locale={locale}
              editingRecord={editingRecord}
              initialVehicleId={editingId ? "" : vehicleIdFromQuery}
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
                    setToast({
                      tone: "success",
                      message: copy(
                        locale,
                        `Work order ${editingId} updated.`,
                        `工單 ${editingId} 已更新。`,
                      ),
                      actionId: `act_${editingId}`,
                      auditId: `audit_${editingId}`,
                    });
                  } else {
                    const created = (await client.createMaintenance(
                      command as CreateMaintenanceRecordCommand,
                    )) as MaintenanceRecord;
                    setToast({
                      tone: "success",
                      message: copy(
                        locale,
                        `Work order ${created.maintenanceId} created.`,
                        `工單 ${created.maintenanceId} 已建立。`,
                      ),
                      actionId: `act_${created.maintenanceId}`,
                      auditId: `audit_${created.maintenanceId}`,
                    });
                  }
                  setShowCreate(false);
                  setEditingId(null);
                  await loadRecords("poll");
                } catch (e) {
                  setToast({
                    tone: "danger",
                    message:
                      e instanceof Error
                        ? e.message
                        : getOpsLabel(locale, "unknown"),
                    actionId: "—",
                    auditId: "—",
                  });
                }
              }}
            />
          </Card>
        ) : null}

        <Card theme={theme} padding={0}>
          {loading ? (
            <div style={{ padding: "18px 14px", color: theme.textMuted }}>
              {copy(locale, "Loading work orders...", "載入工單中...")}
            </div>
          ) : emptyView ? (
            <div style={emptyStateStyle()}>
              <CanvasIcon
                name={emptyView.icon}
                size={26}
                style={{ color: toneColor(theme, emptyView.tone) }}
              />
              <strong style={{ color: theme.text, fontSize: 15 }}>
                {emptyView.title}
              </strong>
              <span
                style={{
                  color: theme.textMuted,
                  maxWidth: 520,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {emptyView.description}
              </span>
              <Link
                href={emptyView.actionHref}
                target={emptyView.actionNewTab ? "_blank" : undefined}
                rel={emptyView.actionNewTab ? "noreferrer" : undefined}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 7,
                  border: `1px solid ${toneColor(theme, emptyView.tone)}`,
                  color: toneColor(theme, emptyView.tone),
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {emptyView.actionLabel}
                {emptyView.actionNewTab ? (
                  <CanvasIcon name="ext" size={11} />
                ) : null}
              </Link>
              <span style={tinyMetaStyle(theme, emptyView.tone)}>
                {copy(locale, "emptyReason", "空狀態")} ·{" "}
                {EMPTY_REASON_CODES[emptyReason ?? "no_data"]}
              </span>
            </div>
          ) : (
            <Table theme={theme} columns={columns} rows={tableRows} />
          )}
        </Card>

        <div style={{ fontSize: 11, color: theme.textDim }}>
          {copy(
            locale,
            "Supporting actions come from availableActions · ",
            "畫面 CTA 以 availableActions 為準 · ",
          )}
          {copy(locale, "generated", "生成時間")} ·{" "}
          {generatedAtMs > 0
            ? `${formatLongDateTime(new Date(generatedAtMs).toISOString())} UTC`
            : "—"}
        </div>
      </div>

      {pendingConfirm ? (
        <ConfirmModal
          locale={locale}
          target={pendingConfirm}
          reason={confirmReason}
          onReasonChange={setConfirmReason}
          onCancel={() => {
            setPendingConfirm(null);
            setConfirmReason("");
          }}
          onConfirm={() => runConfirmedAction(pendingConfirm, confirmReason)}
        />
      ) : null}

      {toast ? (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 40,
            maxWidth: 360,
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${toneColor(theme, toast.tone)}`,
            background: theme.surface,
            boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
            display: "grid",
            gap: 6,
          }}
        >
          <span style={{ color: theme.text, fontSize: 12.5, fontWeight: 600 }}>
            {toast.message}
          </span>
          <span
            style={{
              color: theme.textDim,
              fontSize: 10.5,
              fontFamily: theme.monoFamily,
            }}
          >
            {`actionId ${toast.actionId} · auditId ${toast.auditId}`}
          </span>
        </div>
      ) : null}
    </Shell>
  );
}

function ConfirmModal({
  locale,
  target,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  locale: Locale;
  target: PendingConfirm;
  reason: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const requiresReason = Boolean(target.action.requiresReason);
  const confirmDisabled = requiresReason && reason.trim().length === 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(2,6,23,0.66)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: 18,
          display: "grid",
          gap: 12,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <strong style={{ color: theme.text, fontSize: 14 }}>
            {copy(locale, "Complete work order", "完成工單")}
          </strong>
          <span style={{ color: theme.textMuted, fontSize: 12 }}>
            {`${target.record.maintenanceId} · ${target.record.vehicleId} · ${copy(
              locale,
              "medium risk",
              "中度風險",
            )}`}
          </span>
        </div>
        <span style={{ color: theme.text, fontSize: 12.5, lineHeight: 1.5 }}>
          {copy(
            locale,
            "This marks the work order completed and returns the vehicle toward dispatchable supply. An audit record is written.",
            "此動作會將工單標記為完成，並讓車輛可重新投入派車；系統會寫入稽核紀錄。",
          )}
        </span>
        <Field
          theme={theme}
          label={copy(locale, "Completion note (optional)", "完成備註（選填）")}
        >
          <textarea
            style={textAreaStyle(theme)}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={3}
          />
        </Field>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn theme={theme} onClick={onCancel}>
            {copy(locale, "Cancel", "取消")}
          </Btn>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
            style={{
              ...primaryButtonStyle(theme),
              opacity: confirmDisabled ? 0.5 : 1,
              cursor: confirmDisabled ? "not-allowed" : "pointer",
            }}
          >
            {copy(locale, "Confirm complete", "確認完成")}
          </button>
        </div>
      </div>
    </div>
  );
}

function MaintenanceForm({
  locale,
  editingRecord,
  initialVehicleId,
  onCancel,
  onSubmit,
}: {
  locale: Locale;
  editingRecord: MaintenanceRecord | undefined;
  initialVehicleId: string;
  onCancel: () => void;
  onSubmit: (
    command: CreateMaintenanceRecordCommand | UpdateMaintenanceRecordCommand,
  ) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [vehicleId, setVehicleId] = useState(
    editingRecord?.vehicleId ?? initialVehicleId,
  );
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
    <form onSubmit={handleSubmit}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {!isEditing ? (
          <>
            <Field
              theme={theme}
              label={copy(locale, "Vehicle", "車輛")}
              required
            >
              <input
                style={controlStyle(theme, true)}
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                required
              />
            </Field>
            <Field theme={theme} label={copy(locale, "Type", "類別")}>
              <select
                style={controlStyle(theme)}
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
            </Field>
            <Field
              theme={theme}
              label={copy(locale, "Scheduled at", "排定時間")}
            >
              <input
                type="datetime-local"
                style={controlStyle(theme, true)}
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </Field>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field
                theme={theme}
                label={copy(locale, "Description", "工單描述")}
                required
              >
                <textarea
                  style={textAreaStyle(theme)}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  required
                />
              </Field>
            </div>
          </>
        ) : (
          <>
            <Field theme={theme} label={copy(locale, "Status", "狀態")}>
              <select
                style={controlStyle(theme)}
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
            </Field>
            <Field
              theme={theme}
              label={copy(locale, "Completed at", "完成時間")}
            >
              <input
                type="datetime-local"
                style={controlStyle(theme, true)}
                value={completedAt}
                onChange={(event) => setCompletedAt(event.target.value)}
              />
            </Field>
          </>
        )}
        <Field theme={theme} label={copy(locale, "Technician", "技師")}>
          <input
            style={controlStyle(theme)}
            value={technician}
            onChange={(event) => setTechnician(event.target.value)}
          />
        </Field>
        <Field theme={theme} label={copy(locale, "Cost (TWD)", "費用 (TWD)")}>
          <input
            type="number"
            min="0"
            step="1"
            style={controlStyle(theme, true)}
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field theme={theme} label={copy(locale, "Notes", "備註")}>
            <textarea
              style={textAreaStyle(theme)}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
            />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="submit"
          disabled={pending}
          style={primaryButtonStyle(theme)}
        >
          {pending
            ? copy(locale, "Saving...", "儲存中...")
            : isEditing
              ? copy(locale, "Save changes", "儲存變更")
              : copy(locale, "Create record", "建立工單")}
        </button>
        <Btn theme={theme} onClick={onCancel}>
          {copy(locale, "Cancel", "取消")}
        </Btn>
      </div>
    </form>
  );
}
