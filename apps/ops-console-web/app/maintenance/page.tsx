"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
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
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
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
  UpdateMaintenanceRecordCommand,
} from "@drts/contracts";
import { MAINTENANCE_STATUSES, MAINTENANCE_TYPES } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { isMaintenanceOverdue } from "@/lib/ops-analytics";

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance — packet docs/05-ui/ops-console-design-handoff-packet-20260525.md
// §5.13. Visual: canvas Ops Console.html artboard `maintenance` (OC_Maintenance).
// Refresh tier T3 (15s). availableActions drives CTAs; 6 EmptyReason states are
// rendered distinctly; cross-app deep links via @drts/contracts ui-runtime.
// ─────────────────────────────────────────────────────────────────────────────

type Locale = "en" | "zh";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const STATUSES: MaintenanceStatus[] = [...MAINTENANCE_STATUSES];
const TYPES: MaintenanceType[] = [...MAINTENANCE_TYPES];

// Refresh tier T3 → 15s fixed cadence (Q-X02 `medium`).
const REFRESH_TIER_LABEL = "T3";
const REFRESH_TIER_MS = 15_000;

type MaintenanceTab = "all" | "scheduled" | "progress" | "overdue";

const EMPTY_REASONS = new Set<EmptyReason>([
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
]);

const EMPTY_MESSAGE_CODES: Record<EmptyReason, string> = {
  no_data: "maintenance_registry_empty",
  not_provisioned: "maintenance_registry_not_provisioned",
  fetch_failed: "maintenance_registry_fetch_failed",
  permission_denied: "maintenance_registry_permission_denied",
  external_unavailable: "maintenance_registry_external_unavailable",
  filtered_empty: "maintenance_registry_filtered_empty",
  driver_not_eligible: "driver_not_eligible",
};

type MaintenanceRow = Record<string, unknown> &
  MaintenanceRecord & {
    effectiveStatus: MaintenanceStatus;
    overdue: boolean;
    availableActions: ResourceActionDescriptor[];
    crossAppLinks: CrossAppResourceLink[];
  };

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function isEmptyReason(value: string | null | undefined): value is EmptyReason {
  return (
    value !== null &&
    value !== undefined &&
    EMPTY_REASONS.has(value as EmptyReason)
  );
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
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

function formatLongDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return copy(locale, "unknown", "未知");
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

function formatCost(value: number | null): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
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

function matchesTab(status: MaintenanceStatus, tab: MaintenanceTab) {
  switch (tab) {
    case "scheduled":
      return status === "scheduled";
    case "progress":
      return status === "in_progress";
    case "overdue":
      return status === "overdue";
    case "all":
    default:
      return true;
  }
}

// ── availableActions (Q-X13) ──────────────────────────────────────────────
// Backend should return `availableActions` per record; until the read model
// ships it, synthesize from record state so the CTA affordances still reflect
// authority instead of hard-coding role → button.
function synthesizeAvailableActions(
  record: MaintenanceRecord,
): ResourceActionDescriptor[] {
  const closed = record.status === "completed" || record.status === "cancelled";

  return [
    {
      action: "edit_record",
      enabled: !closed,
      ...(closed ? { disabledReasonCode: "record_closed" } : {}),
      riskLevel: "medium",
    },
    {
      action: "complete_record",
      enabled: record.status === "in_progress",
      ...(record.status === "in_progress"
        ? {}
        : { disabledReasonCode: "not_in_progress" }),
      riskLevel: "medium",
    },
  ];
}

function actionTone(action: ResourceActionDescriptor): CanvasTone {
  if (!action.enabled) {
    return "neutral";
  }
  if (action.riskLevel === "high") return "danger";
  if (action.riskLevel === "medium") return "warn";
  return "accent";
}

function actionLabel(action: ResourceActionDescriptor, locale: Locale) {
  switch (action.action) {
    case "edit_record":
      return copy(locale, "Edit", "編輯");
    case "complete_record":
      return copy(locale, "Complete", "完成");
    case "create_record":
      return copy(locale, "Create work order", "開立工單");
    default:
      return formatOpsCodeLabel(locale, action.action);
  }
}

function actionReason(action: ResourceActionDescriptor, locale: Locale) {
  if (!action.disabledReasonCode) {
    return null;
  }
  if (action.disabledReasonCode === "record_closed") {
    return copy(locale, "Record is closed", "工單已結案");
  }
  if (action.disabledReasonCode === "not_in_progress") {
    return copy(locale, "Not in progress", "未在進行中");
  }
  return formatOpsCodeLabel(locale, action.disabledReasonCode);
}

// ── Cross-app deep links (Q-X03) ──────────────────────────────────────────
function resolveAppOrigin(targetApp: CrossAppResourceLink["targetApp"]) {
  const envCandidates =
    targetApp === "platform-admin"
      ? [process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN]
      : targetApp === "tenant-console"
        ? [process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN]
        : [process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN];
  const resolved = envCandidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (resolved) {
    return resolved.replace(/\/$/, "");
  }

  if (targetApp === "platform-admin") return "http://localhost:3002";
  if (targetApp === "tenant-console") return "http://localhost:3004";
  return "http://localhost:3003";
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  if (link.route.startsWith("http://") || link.route.startsWith("https://")) {
    return link.route;
  }
  return `${resolveAppOrigin(link.targetApp)}${
    link.route.startsWith("/") ? link.route : `/${link.route}`
  }`;
}

// Overdue maintenance feeds the dispatchable-pool decision, which is owned by
// Platform Admin fleet governance — deep link there in a new tab (Q-X03).
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
      route: `/fleet?tab=maintenance&vehicleId=${encodeURIComponent(record.vehicleId)}`,
      resourceType: "vehicle",
      resourceId: record.vehicleId,
      openMode: "new_tab",
      label: copy(locale, "Fleet governance", "車隊治理"),
    },
  ];
}

// ── styles ────────────────────────────────────────────────────────────────
const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const summaryCardStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  display: "grid",
  gap: 4,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: theme.textMuted,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  lineHeight: 1.05,
  color: theme.text,
};

const summaryFootStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
};

const emptyStateStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 10,
  padding: "30px 20px",
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  minWidth: 0,
  whiteSpace: "normal",
};

const secondaryTextStyle: CSSProperties = {
  color: theme.textDim,
  fontSize: 11,
};

const mutedTextStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 11,
};

const actionStackStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  minWidth: 0,
  whiteSpace: "normal",
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

function controlStyle(mono = false): CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: theme.surfaceLo,
    color: theme.text,
    fontSize: 12.5,
    fontFamily: mono ? theme.monoFamily : theme.fontFamily,
    boxSizing: "border-box",
  };
}

function toneColor(tone: CanvasTone) {
  const colors: Record<CanvasTone, string> = {
    success: theme.success,
    warn: theme.warn,
    danger: theme.danger,
    info: theme.info,
    accent: theme.accent,
    neutral: theme.textMuted,
  };
  return colors[tone];
}

function linkButtonStyle(
  tone: CanvasTone = "neutral",
  disabled = false,
): CSSProperties {
  const palette: Record<CanvasTone, { bg: string; fg: string; bd: string }> = {
    success: { bg: theme.successBg, fg: theme.success, bd: theme.successBorder },
    warn: { bg: theme.warnBg, fg: theme.warn, bd: theme.warnBorder },
    danger: { bg: theme.dangerBg, fg: theme.danger, bd: theme.dangerBorder },
    info: { bg: theme.infoBg, fg: theme.info, bd: theme.infoBorder },
    accent: { bg: theme.accentBg, fg: theme.accent, bd: theme.accentBorder },
    neutral: { bg: theme.surfaceLo, fg: theme.textMuted, bd: theme.border },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 26,
    padding: "4px 9px",
    borderRadius: 7,
    border: `1px solid ${palette[tone].bd}`,
    background: palette[tone].bg,
    color: palette[tone].fg,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    fontFamily: theme.fontFamily,
    opacity: disabled ? 0.48 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function primaryButtonStyle(): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "5px 12px",
    height: 30,
    borderRadius: 7,
    border: `1px solid ${theme.accent}`,
    background: theme.accent,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: theme.fontFamily,
    cursor: "pointer",
  };
}

type CanvasIconName = ComponentProps<typeof CanvasIcon>["name"];

type EmptyView = {
  tone: CanvasTone;
  icon: CanvasIconName;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  actionNewTab: boolean;
};

function buildEmptyStateViewModel(
  reason: EmptyReason,
  locale: Locale,
  rawMessage: string | null,
): EmptyView {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info",
        icon: "maintenance",
        title: copy(
          locale,
          "Maintenance module not provisioned",
          "保修模組尚未開通",
        ),
        description: copy(
          locale,
          "Work-order tracking is not enabled for this environment yet. Provision it from Platform Admin fleet governance.",
          "此環境尚未啟用工單追蹤，請至 Platform Admin 車隊治理面開通。",
        ),
        actionLabel: copy(locale, "Open fleet governance", "開啟車隊治理"),
        actionHref: `${resolveAppOrigin("platform-admin")}/fleet`,
        actionNewTab: true,
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
          "This actor can enter the console but lacks maintenance read scope (ops_manager).",
          "目前帳號可進入控制台，但沒有保修讀取權限（ops_manager）。",
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
          "External dependency unavailable",
          "外部相依服務不可用",
        ),
        description: copy(
          locale,
          "The vehicle / fleet adapter is degraded, so maintenance records cannot be augmented. Use fleet governance for the latest compliance state.",
          "車輛 / 車隊 adapter 降級，保修紀錄無法補充，請改用車隊治理確認最新法遵狀態。",
        ),
        actionLabel: copy(locale, "Open platform admin", "開啟 Platform Admin"),
        actionHref: `${resolveAppOrigin("platform-admin")}/fleet`,
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
          "Widen the status tab, vehicle, or date-range filters to restore results.",
          "放寬狀態分頁、車輛或日期區間條件即可恢復結果。",
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
          "The registry is healthy but there are no work orders in this environment yet.",
          "保修資料健康，但此環境目前還沒有任何工單。",
        ),
        actionLabel: copy(locale, "Open vehicles", "前往車輛"),
        actionHref: "/vehicles",
        actionNewTab: false,
      };
  }
}

export default function MaintenancePage() {
  const { locale } = useTranslation();
  const loc = locale as Locale;
  const searchParams = useSearchParams();

  const vehicleParam = searchParams.get("vehicleId")?.trim() ?? "";
  const createFromQuery = searchParams.get("create") === "1";
  const emptyReasonOverride = searchParams.get("emptyReason");

  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<MaintenanceTab>("all");
  const [query, setQuery] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState(vehicleParam);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showFilters, setShowFilters] = useState(Boolean(vehicleParam));

  const [showCreate, setShowCreate] = useState(createFromQuery);
  const [editingId, setEditingId] = useState<string | null>(null);

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const client = getOpsClient();
      const result = await client.listMaintenance();
      setRecords(result);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "unknown");
    } finally {
      setGeneratedAt(new Date().toISOString());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  // Refresh tier T3 — poll on the fixed 15s cadence, but never clobber an open
  // editor / create form mid-edit.
  useEffect(() => {
    const editing = showCreate || editingId !== null;
    if (editing) {
      return;
    }
    const handle = window.setInterval(() => {
      void loadRecords();
    }, REFRESH_TIER_MS);
    return () => window.clearInterval(handle);
  }, [loadRecords, showCreate, editingId]);

  useEffect(() => {
    setVehicleFilter(vehicleParam);
    if (vehicleParam) {
      setShowFilters(true);
    }
  }, [vehicleParam]);

  const editingRecord = editingId
    ? records.find((record) => record.maintenanceId === editingId)
    : undefined;

  const rows: MaintenanceRow[] = useMemo(
    () =>
      records.map((record) => {
        const effectiveStatus = getEffectiveStatus(record);
        const overdue = effectiveStatus === "overdue";
        return {
          ...record,
          effectiveStatus,
          overdue,
          availableActions: synthesizeAvailableActions(record),
          crossAppLinks: synthesizeCrossAppLinks(record, overdue, loc),
        };
      }),
    [records, loc],
  );

  const statusCounts = useMemo(() => {
    return rows.reduce(
      (counts, row) => {
        counts.all += 1;
        counts[row.effectiveStatus] += 1;
        return counts;
      },
      {
        all: 0,
        scheduled: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
        overdue: 0,
      } as Record<"all" | MaintenanceStatus, number>,
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!matchesTab(row.effectiveStatus, activeTab)) {
        return false;
      }
      if (
        vehicleFilter &&
        !row.vehicleId.toLowerCase().includes(vehicleFilter.toLowerCase())
      ) {
        return false;
      }
      if (fromDate && (!row.scheduledAt || row.scheduledAt < fromDate)) {
        return false;
      }
      if (
        toDate &&
        (!row.scheduledAt || row.scheduledAt > `${toDate}T23:59:59`)
      ) {
        return false;
      }
      if (!deferredQuery) {
        return true;
      }
      const haystack = [
        row.maintenanceId,
        row.vehicleId,
        row.type,
        row.status,
        row.description,
        row.technician ?? "",
        row.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(deferredQuery);
    });
  }, [rows, activeTab, vehicleFilter, fromDate, toDate, deferredQuery]);

  const hasActiveFilters =
    activeTab !== "all" ||
    query.trim().length > 0 ||
    vehicleFilter.length > 0 ||
    fromDate.length > 0 ||
    toDate.length > 0;

  // ── EmptyReason resolution (Q-X15) ──────────────────────────────────────
  // `?emptyReason=` lets each of the 6 states be reached distinctly; otherwise
  // derive from load error / filters / data.
  let emptyReason: EmptyReason | null = null;
  if (isEmptyReason(emptyReasonOverride)) {
    emptyReason = emptyReasonOverride;
  } else if (!loading && filteredRows.length === 0) {
    if (loadError) {
      emptyReason = "fetch_failed";
    } else if (hasActiveFilters) {
      emptyReason = "filtered_empty";
    } else {
      emptyReason = "no_data";
    }
  }

  const emptyView = emptyReason
    ? buildEmptyStateViewModel(emptyReason, loc, loadError)
    : null;

  const overdueCount = statusCounts.overdue;
  // Overdue cluster (visual urgency) — packet §5.13 state variant.
  const overdueCluster =
    overdueCount > 0 &&
    overdueCount >= Math.max(2, Math.ceil(rows.length * 0.25));

  const freshness: "fresh" | "stale" = loadError ? "stale" : "fresh";

  // ── actions ─────────────────────────────────────────────────────────────
  const completeRecord = useCallback(
    async (maintenanceId: string) => {
      try {
        const client = getOpsClient();
        await client.updateMaintenance(maintenanceId, {
          status: "completed",
          completedAt: new Date().toISOString(),
        });
        await loadRecords();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "unknown");
      }
    },
    [loadRecords],
  );

  function renderRowActions(row: MaintenanceRow): ReactNode {
    return (
      <div style={actionStackStyle}>
        {row.availableActions.map((action) => {
          const tone = actionTone(action);
          const label = actionLabel(action, loc);
          const reason = actionReason(action, loc);

          if (!action.enabled) {
            return (
              <span
                key={action.action}
                style={linkButtonStyle(tone, true)}
                title={reason ?? undefined}
              >
                {label}
              </span>
            );
          }

          const onClick =
            action.action === "complete_record"
              ? () => void completeRecord(row.maintenanceId)
              : () => {
                  setEditingId(row.maintenanceId);
                  setShowCreate(false);
                };

          return (
            <button
              key={action.action}
              type="button"
              onClick={onClick}
              style={linkButtonStyle(tone)}
            >
              {label}
            </button>
          );
        })}

        <Link
          href={`/vehicles/${encodeURIComponent(row.vehicleId)}`}
          style={linkButtonStyle("info")}
        >
          {copy(loc, "Vehicle", "車輛")}
        </Link>

        {row.crossAppLinks.map((link) => (
          <Link
            key={link.label}
            href={buildCrossAppHref(link)}
            target={link.openMode === "new_tab" ? "_blank" : undefined}
            rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
            style={linkButtonStyle("warn")}
          >
            {link.label}
            <CanvasIcon name="ext" size={11} />
          </Link>
        ))}
      </div>
    );
  }

  const columns: CanvasTableColumn<MaintenanceRow>[] = [
    {
      h: copy(loc, "WO", "工單"),
      w: 110,
      mono: true,
      r: (row) => (
        <div style={stackStyle}>
          <span style={{ color: theme.accent, fontWeight: 700 }}>
            {row.maintenanceId}
          </span>
          <span style={secondaryTextStyle}>
            {formatOpsCodeLabel(loc, row.status)}
          </span>
        </div>
      ),
    },
    {
      h: copy(loc, "VEHICLE", "車輛"),
      w: 120,
      mono: true,
      r: (row) => (
        <Link
          href={`/vehicles/${encodeURIComponent(row.vehicleId)}`}
          style={{ color: theme.text, textDecoration: "none", fontWeight: 600 }}
        >
          {row.vehicleId}
        </Link>
      ),
    },
    {
      h: copy(loc, "TYPE", "類別"),
      w: 190,
      r: (row) => (
        <div style={stackStyle}>
          <span style={{ color: theme.text }}>
            {formatOpsCodeLabel(loc, row.type)}
          </span>
          <span style={secondaryTextStyle}>{row.description}</span>
        </div>
      ),
    },
    {
      h: copy(loc, "STATUS", "狀態"),
      w: 124,
      r: (row) => (
        <Pill theme={theme} tone={statusTone(row.effectiveStatus)} dot>
          {row.effectiveStatus}
        </Pill>
      ),
    },
    {
      h: copy(loc, "SCHEDULE", "排定"),
      w: 168,
      mono: true,
      r: (row) => (
        <div style={stackStyle}>
          <span style={{ color: theme.text }}>
            {formatDateTime(loc, row.scheduledAt)}
          </span>
          <span style={mutedTextStyle}>
            {row.completedAt
              ? `${copy(loc, "done", "完成")} · ${formatDateTime(loc, row.completedAt)}`
              : copy(loc, "not completed", "未完成")}
          </span>
        </div>
      ),
    },
    {
      h: copy(loc, "TECH", "技師"),
      w: 110,
      r: (row) => row.technician ?? "—",
    },
    {
      h: copy(loc, "COST", "費用"),
      w: 110,
      mono: true,
      align: "right",
      r: (row) => formatCost(row.cost),
    },
    {
      h: copy(loc, "ACTIONS", "操作"),
      w: 280,
      r: (row) => renderRowActions(row),
    },
  ];

  const tabConfig: Array<{
    key: MaintenanceTab;
    label: string;
    badge: number;
    tone: CanvasTone;
  }> = [
    {
      key: "all",
      label: copy(loc, "All", "全部"),
      badge: statusCounts.all,
      tone: "neutral",
    },
    {
      key: "scheduled",
      label: copy(loc, "Scheduled", "排程中"),
      badge: statusCounts.scheduled,
      tone: "warn",
    },
    {
      key: "progress",
      label: copy(loc, "In progress", "進行中"),
      badge: statusCounts.in_progress,
      tone: "info",
    },
    {
      key: "overdue",
      label: copy(loc, "Overdue", "逾期"),
      badge: statusCounts.overdue,
      tone: "danger",
    },
  ];
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
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: tab.badge > 0 ? toneColor(tab.tone) : theme.textMuted,
          fontFamily: theme.monoFamily,
        }}
      >
        {tab.badge}
      </span>
    </button>
  ));
  const activeTabNode =
    tabNodes[tabConfig.findIndex((tab) => tab.key === activeTab)] ?? tabNodes[0];

  return (
    <>
      <PageHeader
        theme={theme}
        title={copy(loc, "Vehicle Maintenance", "車輛保修")}
        subtitle={copy(
          loc,
          "work orders · schedule · technician · dispatch impact",
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
              {`${freshness.toUpperCase()} · ${REFRESH_TIER_LABEL} · 15s`}
            </Pill>
            <Btn
              theme={theme}
              icon="filter"
              variant={showFilters ? "primary" : "secondary"}
              onClick={() => setShowFilters((value) => !value)}
            >
              {copy(loc, "Filters", "篩選")}
            </Btn>
            <Btn
              theme={theme}
              variant="secondary"
              icon="arrow"
              onClick={() => void loadRecords()}
            >
              {copy(loc, "Refresh", "重新整理")}
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
              {copy(loc, "Create work order", "開立工單")}
            </Btn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {loadError ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(
              loc,
              "Maintenance is running degraded",
              "保修頁面降級中",
            )}
            body={`${loadError} · ${copy(loc, "checked", "檢查時間")} ${formatLongDateTime(loc, generatedAt)} UTC`}
          />
        ) : null}

        {overdueCluster ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(loc, "Overdue maintenance cluster", "逾期保修群聚警報")}
            body={copy(
              loc,
              `${overdueCount}/${rows.length} work orders are overdue. Overdue maintenance can pull a vehicle from the dispatchable pool — confirm removals in Fleet governance.`,
              `目前 ${overdueCount}/${rows.length} 張工單逾期。逾期保修可能使車輛被移出可派遣車隊；請於車隊治理確認移除。`,
            )}
            actions={
              <Link
                href={`${resolveAppOrigin("platform-admin")}/fleet?tab=maintenance`}
                target="_blank"
                rel="noreferrer"
                style={linkButtonStyle("danger")}
              >
                {copy(loc, "Open Fleet Gov", "開啟車隊治理")}
                <CanvasIcon name="ext" size={11} />
              </Link>
            }
          />
        ) : null}

        <div style={summaryGridStyle}>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {copy(loc, "Work orders", "工單")}
            </span>
            <span style={summaryValueStyle}>{statusCounts.all}</span>
            <span style={summaryFootStyle}>
              {copy(loc, "maintenance records", "保修紀錄筆數")}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {copy(loc, "Scheduled", "排程中")}
            </span>
            <span style={{ ...summaryValueStyle, color: theme.warn }}>
              {statusCounts.scheduled}
            </span>
            <span style={summaryFootStyle}>
              {copy(loc, "awaiting service", "等待進場")}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {copy(loc, "In progress", "進行中")}
            </span>
            <span style={{ ...summaryValueStyle, color: theme.info }}>
              {statusCounts.in_progress}
            </span>
            <span style={summaryFootStyle}>
              {copy(loc, "in the shop now", "正在維修")}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>{copy(loc, "Overdue", "逾期")}</span>
            <span
              style={{
                ...summaryValueStyle,
                color: overdueCount > 0 ? theme.danger : theme.text,
              }}
            >
              {overdueCount}
            </span>
            <span style={summaryFootStyle}>
              {copy(loc, "impacts dispatchable supply", "影響可派遣供給")}
            </span>
          </div>
        </div>

        {showCreate || editingId ? (
          <Card
            theme={theme}
            title={
              editingId
                ? copy(loc, "Update work order", "更新工單")
                : copy(loc, "Create work order", "開立工單")
            }
            subtitle={
              editingId
                ? (editingRecord?.maintenanceId ?? "")
                : copy(
                    loc,
                    "ops_manager · medium risk",
                    "ops_manager · 中度風險",
                  )
            }
          >
            <MaintenanceForm
              locale={loc}
              editingRecord={editingRecord}
              defaultVehicleId={vehicleFilter}
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
                } catch (error) {
                  setLoadError(
                    error instanceof Error ? error.message : "unknown",
                  );
                }
              }}
            />
          </Card>
        ) : null}

        {showFilters ? (
          <Card
            theme={theme}
            title={copy(loc, "Filter work orders", "篩選工單")}
            subtitle={copy(
              loc,
              `${filteredRows.length} visible / ${rows.length} total · generated ${formatLongDateTime(loc, generatedAt)} UTC`,
              `顯示 ${filteredRows.length} / 總數 ${rows.length} · 生成 ${formatLongDateTime(loc, generatedAt)} UTC`,
            )}
          >
            <div style={filterGridStyle}>
              <Field theme={theme} label={copy(loc, "Search", "搜尋")}>
                <input
                  type="search"
                  style={controlStyle()}
                  placeholder={copy(
                    loc,
                    "work order, vehicle, technician, notes",
                    "工單、車輛、技師、備註",
                  )}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </Field>
              <Field theme={theme} label={copy(loc, "Vehicle", "車輛")}>
                <input
                  style={controlStyle(true)}
                  placeholder={copy(loc, "vehicle id", "車輛編號")}
                  value={vehicleFilter}
                  onChange={(event) => setVehicleFilter(event.target.value)}
                />
              </Field>
              <Field theme={theme} label={copy(loc, "Scheduled from", "排定起")}>
                <input
                  type="date"
                  style={controlStyle(true)}
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </Field>
              <Field theme={theme} label={copy(loc, "Scheduled to", "排定迄")}>
                <input
                  type="date"
                  style={controlStyle(true)}
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Btn
                theme={theme}
                variant="ghost"
                icon="x"
                onClick={() => {
                  setActiveTab("all");
                  setQuery("");
                  setVehicleFilter("");
                  setFromDate("");
                  setToDate("");
                }}
              >
                {copy(loc, "Reset filters", "清除條件")}
              </Btn>
              <span style={{ ...mutedTextStyle, alignSelf: "center" }}>
                {copy(
                  loc,
                  "supporting actions come from availableActions",
                  "畫面 CTA 以 availableActions 為準",
                )}
              </span>
            </div>
          </Card>
        ) : null}

        <Card theme={theme} padding={0}>
          {loading ? (
            <div
              style={{
                padding: "24px",
                color: theme.textMuted,
                fontSize: 12.5,
              }}
            >
              {copy(loc, "Loading maintenance records…", "載入保修工單中…")}
            </div>
          ) : emptyView ? (
            <div style={emptyStateStyle}>
              <CanvasIcon
                name={emptyView.icon}
                size={26}
                style={{ color: toneColor(emptyView.tone) }}
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
                style={linkButtonStyle(emptyView.tone)}
              >
                {emptyView.actionLabel}
                {emptyView.actionNewTab ? (
                  <CanvasIcon name="ext" size={11} />
                ) : null}
              </Link>
              <span
                style={{
                  fontSize: 10.5,
                  color: toneColor(emptyView.tone),
                  fontFamily: theme.monoFamily,
                }}
              >
                {copy(loc, "emptyReason", "空狀態")} ·{" "}
                {emptyReason ? EMPTY_MESSAGE_CODES[emptyReason] : ""}
              </span>
            </div>
          ) : (
            <Table theme={theme} columns={columns} rows={filteredRows} />
          )}
        </Card>
      </div>
    </>
  );
}

function MaintenanceForm({
  locale,
  editingRecord,
  defaultVehicleId,
  onCancel,
  onSubmit,
}: {
  locale: Locale;
  editingRecord: MaintenanceRecord | undefined;
  defaultVehicleId: string;
  onCancel: () => void;
  onSubmit: (
    command: CreateMaintenanceRecordCommand | UpdateMaintenanceRecordCommand,
  ) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const isEditing = Boolean(editingRecord);

  const [vehicleId, setVehicleId] = useState(
    editingRecord?.vehicleId ?? defaultVehicleId,
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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      const parsedCost = cost.trim() ? Number(cost) : undefined;
      if (isEditing) {
        const command: UpdateMaintenanceRecordCommand = {
          status,
          ...(completedAt
            ? { completedAt: new Date(completedAt).toISOString() }
            : {}),
          ...(technician.trim() ? { technician: technician.trim() } : {}),
          ...(parsedCost !== undefined && !Number.isNaN(parsedCost)
            ? { cost: parsedCost }
            : {}),
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
        ...(completedAt
          ? { completedAt: new Date(completedAt).toISOString() }
          : {}),
        ...(technician.trim() ? { technician: technician.trim() } : {}),
        ...(parsedCost !== undefined && !Number.isNaN(parsedCost)
          ? { cost: parsedCost }
          : {}),
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
          <Field
            theme={theme}
            label={copy(locale, "Vehicle ID", "車輛編號")}
            required
          >
            <input
              style={controlStyle(true)}
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
              required
            />
          </Field>
        ) : null}

        <Field theme={theme} label={copy(locale, "Type", "類別")}>
          <select
            style={controlStyle()}
            value={type}
            onChange={(event) => setType(event.target.value as MaintenanceType)}
            disabled={isEditing}
          >
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {formatOpsCodeLabel(locale, value)}
              </option>
            ))}
          </select>
        </Field>

        {isEditing ? (
          <Field theme={theme} label={copy(locale, "Status", "狀態")}>
            <select
              style={controlStyle()}
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
        ) : (
          <Field theme={theme} label={copy(locale, "Scheduled at", "排定時間")}>
            <input
              type="datetime-local"
              style={controlStyle(true)}
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </Field>
        )}

        <Field theme={theme} label={copy(locale, "Completed at", "完成時間")}>
          <input
            type="datetime-local"
            style={controlStyle(true)}
            value={completedAt}
            onChange={(event) => setCompletedAt(event.target.value)}
          />
        </Field>

        <Field theme={theme} label={copy(locale, "Technician", "技師")}>
          <input
            style={controlStyle()}
            value={technician}
            onChange={(event) => setTechnician(event.target.value)}
          />
        </Field>

        <Field theme={theme} label={copy(locale, "Cost (TWD)", "費用 (TWD)")}>
          <input
            type="number"
            min="0"
            style={controlStyle(true)}
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </Field>

        {!isEditing ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <Field
              theme={theme}
              label={copy(locale, "Description", "說明")}
              required
            >
              <input
                style={controlStyle()}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </Field>
          </div>
        ) : null}

        <div style={{ gridColumn: "1 / -1" }}>
          <Field theme={theme} label={copy(locale, "Notes", "備註")}>
            <input
              style={controlStyle()}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={pending} style={primaryButtonStyle()}>
          {pending
            ? copy(locale, "Saving…", "儲存中…")
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
