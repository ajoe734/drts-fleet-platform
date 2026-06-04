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
import { t as translate, type Locale } from "@/lib/translations";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const STATUSES: MaintenanceStatus[] = [...MAINTENANCE_STATUSES];
const TYPES: MaintenanceType[] = [...MAINTENANCE_TYPES];

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

type StatusTab = "scheduled" | "in_progress" | "completed" | "overdue";

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

function mt(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
) {
  return translate(key, locale, params);
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

function modalOverlayStyle(): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    background: "rgba(2,6,23,0.66)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  };
}

function modalCardStyle(width = "min(720px, 100%)"): CSSProperties {
  return {
    width,
    maxHeight: "calc(100vh - 48px)",
    overflowY: "auto",
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
    padding: 18,
    display: "grid",
    gap: 12,
    boxShadow: "0 18px 48px rgba(0,0,0,0.35)",
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
  return status === tab;
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
      label: mt(locale, "maintenance.crossApp.fleetGovernance"),
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
    record.status === "scheduled" || record.status === "in_progress";

  return [
    {
      action: "edit_maintenance",
      enabled: !closed,
      ...(closed ? { disabledReasonCode: "completed" } : {}),
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
      return mt(locale, "maintenance.action.edit");
    case "complete_maintenance":
      return mt(locale, "maintenance.action.complete");
    case "open_vehicle":
      return mt(locale, "maintenance.action.vehicle");
    default:
      return formatOpsCodeLabel(locale, action.action);
  }
}

function actionReason(action: ResourceActionDescriptor, locale: Locale) {
  if (!action.disabledReasonCode) return null;
  if (action.disabledReasonCode === "completed") {
    return mt(locale, "maintenance.action.disabled.completed");
  }
  if (action.disabledReasonCode === "not_in_progress") {
    return mt(locale, "maintenance.action.disabled.notInProgress");
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
        title: mt(locale, "maintenance.empty.notProvisioned.title"),
        description: mt(locale, "maintenance.empty.notProvisioned.description"),
        actionLabel: mt(locale, "maintenance.empty.notProvisioned.action"),
        actionHref: "/feature-flags",
        actionNewTab: false,
      };
    case "fetch_failed":
      return {
        tone: "danger",
        icon: "warn",
        title: mt(locale, "maintenance.empty.fetchFailed.title"),
        description:
          rawMessage ?? mt(locale, "maintenance.empty.fetchFailed.description"),
        actionLabel: mt(locale, "common.refresh"),
        actionHref: "/maintenance",
        actionNewTab: false,
      };
    case "permission_denied":
      return {
        tone: "warn",
        icon: "users",
        title: mt(locale, "maintenance.empty.permissionDenied.title"),
        description: mt(
          locale,
          "maintenance.empty.permissionDenied.description",
        ),
        actionLabel: mt(locale, "maintenance.empty.permissionDenied.action"),
        actionHref: "/dashboard",
        actionNewTab: false,
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "health",
        title: mt(locale, "maintenance.empty.externalUnavailable.title"),
        description: mt(
          locale,
          "maintenance.empty.externalUnavailable.description",
        ),
        actionLabel: mt(locale, "maintenance.empty.externalUnavailable.action"),
        actionHref: `${resolvePlatformAdminOrigin()}/fleet`,
        actionNewTab: true,
      };
    case "filtered_empty":
      return {
        tone: "accent",
        icon: "filter",
        title: mt(locale, "maintenance.empty.filtered.title"),
        description: mt(locale, "maintenance.empty.filtered.description"),
        actionLabel: mt(locale, "maintenance.empty.filtered.action"),
        actionHref: "/maintenance",
        actionNewTab: false,
      };
    case "no_data":
    default:
      return {
        tone: "neutral",
        icon: "maintenance",
        title: mt(locale, "maintenance.empty.noData.title"),
        description: mt(locale, "maintenance.empty.noData.description"),
        actionLabel: mt(locale, "maintenance.empty.noData.action"),
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
  const { locale, t } = useTranslation();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatedAtMs, setGeneratedAtMs] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<StatusTab>("scheduled");
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
    statusFilter !== "all" ||
    deferredQuery.length > 0 ||
    filteredRecords.length !== records.length;

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
          message: t("maintenance.toast.completed", {
            id: record.maintenanceId,
          }),
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
      h: t("maintenance.col.workOrderShort"),
      w: 110,
      mono: true,
      r: (row) => (
        <div
          style={{
            display: "grid",
            gap: 3,
            whiteSpace: "normal",
            padding: row.overdue ? "6px 8px" : 0,
            margin: row.overdue ? "-6px -8px" : 0,
            borderRadius: row.overdue ? 8 : 0,
            background: row.overdue ? theme.dangerBg : "transparent",
            border: row.overdue ? `1px solid ${theme.dangerBorder}` : "none",
          }}
        >
          <span style={{ fontWeight: 600 }}>{row.maintenanceId}</span>
          <span style={{ color: theme.textMuted, fontSize: 10.5 }}>
            {formatOpsCodeLabel(locale, row.type)}
          </span>
          {row.overdue ? (
            <span
              style={{ color: theme.danger, fontSize: 10.5, fontWeight: 600 }}
            >
              {t("maintenance.dispatchRisk")}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: t("maintenance.col.vehicleUpper"),
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
      h: t("maintenance.col.detailUpper"),
      w: 240,
      r: (row) => (
        <div style={{ display: "grid", gap: 3, whiteSpace: "normal" }}>
          <span>{row.description}</span>
          {row.technician ? (
            <span style={{ color: theme.textDim, fontSize: 10.5 }}>
              {t("maintenance.form.technician")} · {row.technician}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: t("maintenance.col.statusUpper"),
      w: 130,
      r: (row) => (
        <Pill theme={theme} tone={statusTone(row.effectiveStatus)} dot>
          {formatOpsCodeLabel(locale, row.effectiveStatus)}
        </Pill>
      ),
    },
    {
      h: t("maintenance.col.scheduleUpper"),
      w: 160,
      mono: true,
      r: (row) => (
        <div
          style={{
            display: "grid",
            gap: 3,
            whiteSpace: "normal",
            padding: row.overdue ? "6px 8px" : 0,
            margin: row.overdue ? "-6px -8px" : 0,
            borderRadius: row.overdue ? 8 : 0,
            background: row.overdue ? theme.dangerBg : "transparent",
          }}
        >
          <span>{formatTableDateTime(row.scheduledAt)}</span>
          {row.overdue ? (
            <span style={{ color: theme.danger, fontSize: 10.5 }}>
              {t("maintenance.overdueForService")}
            </span>
          ) : null}
          {row.completedAt ? (
            <span style={{ color: theme.success, fontSize: 10.5 }}>
              {t("maintenance.doneAt", {
                value: formatTableDateTime(row.completedAt),
              })}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: t("maintenance.col.costUpper"),
      w: 96,
      mono: true,
      align: "right",
      r: (row) => formatCost(locale, row.cost),
    },
    {
      h: t("maintenance.col.actionsUpper"),
      w: 220,
      r: (row) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {row.availableActions.map((action) => {
            return (
              <CanvasActionButton
                key={`${row.maintenanceId}-${action.action}`}
                descriptor={action}
                label={actionLabel(action, locale)}
                reason={actionReason(action, locale)}
                tone={actionTone(action)}
                locale={locale}
                onInvoke={() => onActionClick(row, action)}
                {...(action.action === "open_vehicle"
                  ? { href: row.vehicleLink }
                  : {})}
              />
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

  const tabConfig: Array<{ key: StatusTab; label: string; tone?: CanvasTone }> =
    [
      { key: "scheduled", label: t("maintenance.tab.scheduled") },
      { key: "in_progress", label: t("maintenance.tab.inProgress") },
      { key: "completed", label: t("maintenance.tab.completed") },
      {
        key: "overdue",
        label: t("maintenance.tab.overdue"),
        tone: "danger",
      },
    ];
  const tabCountFor = (key: StatusTab) => counts[key];
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
    <>
      <PageHeader
        theme={theme}
        title={t("maintenance.title")}
        subtitle={t("maintenance.headerSubtitle")}
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <>
            <Pill
              theme={theme}
              tone={freshness === "fresh" ? "success" : "warn"}
            >
              {`${formatOpsCodeLabel(locale, freshness)} · ${t("maintenance.refreshTierLabel")}`}
            </Pill>
            <Btn
              theme={theme}
              icon="filter"
              variant={showFilters ? "primary" : "secondary"}
              onClick={() => setShowFilters((value) => !value)}
            >
              {t("maintenance.filter.title")}
            </Btn>
            <Btn
              theme={theme}
              icon="arrow"
              onClick={() => void loadRecords("poll")}
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
            title={t("maintenance.banner.degraded")}
            body={t("maintenance.banner.degradedBody", {
              message: loadError,
            })}
          />
        ) : null}

        {!loadError && freshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone="info"
            icon="clock"
            title={t("maintenance.banner.stale")}
            body={t("maintenance.banner.staleBody", {
              value: formatLongDateTime(new Date(generatedAtMs).toISOString()),
            })}
          />
        ) : null}

        {counts.overdue > 0 ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("maintenance.banner.overdueTitle", {
              count: counts.overdue,
            })}
            body={t("maintenance.banner.overdueBody")}
            actions={
              <Btn
                theme={theme}
                variant="primary"
                onClick={() => setActiveTab("overdue")}
              >
                {t("maintenance.banner.overdueAction")}
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
            label={t("maintenance.activeOrders")}
            value={counts.scheduled + counts.in_progress}
            delta={t("maintenance.kpi.activeDelta")}
            deltaTone="neutral"
          />
          <KPI
            theme={theme}
            label={t("maintenance.overdue")}
            value={counts.overdue}
            delta={
              counts.overdue > 0
                ? t("maintenance.dispatchRisk")
                : t("maintenance.kpi.clear")
            }
            deltaTone={counts.overdue > 0 ? "down" : "up"}
          />
          <KPI
            theme={theme}
            label={t("maintenance.completed")}
            value={counts.completed}
            delta={t("maintenance.kpi.closedDelta")}
            deltaTone="neutral"
          />
          <KPI
            theme={theme}
            label={t("maintenance.kpi.dispatchImpact")}
            value={dispatchImpactCount}
            delta={t("maintenance.kpi.dispatchImpactDelta")}
            deltaTone={dispatchImpactCount > 0 ? "down" : "neutral"}
          />
        </div>

        {showFilters ? (
          <Card
            theme={theme}
            title={t("maintenance.filter.title")}
            subtitle={t("maintenance.filter.subtitle", {
              visible: filteredRecords.length,
              total: records.length,
            })}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
              }}
            >
              <Field theme={theme} label={t("common.search")}>
                <input
                  type="search"
                  style={controlStyle(theme)}
                  placeholder={t("maintenance.filter.searchPlaceholder")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </Field>
              <Field theme={theme} label={t("maintenance.form.status")}>
                <select
                  style={controlStyle(theme)}
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as MaintenanceStatus | "all",
                    )
                  }
                >
                  <option value="all">{t("common.all")}</option>
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

        <Card theme={theme} padding={0}>
          {loading ? (
            <div style={{ padding: "18px 14px", color: theme.textMuted }}>
              {t("maintenance.loading")}
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
                {t("maintenance.emptyReasonLabel")} ·{" "}
                {EMPTY_REASON_CODES[emptyReason ?? "no_data"]}
              </span>
            </div>
          ) : (
            <Table theme={theme} columns={columns} rows={tableRows} />
          )}
        </Card>

        <div style={{ fontSize: 11, color: theme.textDim }}>
          {t("maintenance.footer.supportingActions")} ·{" "}
          {t("maintenance.footer.generated")} ·{" "}
          {generatedAtMs > 0
            ? t("maintenance.footer.generatedAt", {
                value: formatLongDateTime(
                  new Date(generatedAtMs).toISOString(),
                ),
              })
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

      {showCreate || editingId ? (
        <MaintenanceFormModal
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
                  message: t("maintenance.toast.updated", { id: editingId }),
                  actionId: `act_${editingId}`,
                  auditId: `audit_${editingId}`,
                });
              } else {
                const created = (await client.createMaintenance(
                  command as CreateMaintenanceRecordCommand,
                )) as MaintenanceRecord;
                setToast({
                  tone: "success",
                  message: t("maintenance.toast.created", {
                    id: created.maintenanceId,
                  }),
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
            {t("maintenance.toast.receipt", {
              actionId: toast.actionId,
              auditId: toast.auditId,
            })}
          </span>
        </div>
      ) : null}
    </>
  );
}

function CanvasActionButton({
  descriptor,
  label,
  reason,
  tone,
  href,
  locale,
  onInvoke,
}: {
  descriptor: ResourceActionDescriptor;
  label: string;
  reason: string | null;
  tone: CanvasTone;
  href?: string;
  locale: Locale;
  onInvoke: () => void;
}) {
  const button = (
    <Btn
      theme={theme}
      size="xs"
      variant={descriptor.riskLevel === "medium" ? "secondary" : "ghost"}
      danger={tone === "danger"}
      disabled={!descriptor.enabled}
      {...(href ? {} : { onClick: onInvoke })}
    >
      <span title={reason ?? undefined}>{label}</span>
    </Btn>
  );

  const control =
    href && descriptor.enabled ? (
      <Link
        href={href}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          height: 24,
          fontSize: 11.5,
          fontWeight: 500,
          background: "transparent",
          color: theme.textMuted,
          border: "1px solid transparent",
          borderRadius: 7,
          lineHeight: 1,
          fontFamily: theme.fontFamily,
          textDecoration: "none",
        }}
        title={reason ?? undefined}
      >
        {label}
      </Link>
    ) : (
      button
    );

  return (
    <div style={{ display: "grid", gap: 2 }}>
      {control}
      {!descriptor.enabled && reason ? (
        <span style={{ fontSize: 10, color: theme.textDim, maxWidth: 120 }}>
          {mt(locale, "maintenance.disabledPrefix", { reason })}
        </span>
      ) : null}
    </div>
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
    <div style={modalOverlayStyle()} onClick={onCancel}>
      <div
        style={modalCardStyle("min(440px, 100%)")}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <strong style={{ color: theme.text, fontSize: 14 }}>
            {mt(locale, "maintenance.confirm.title")}
          </strong>
          <span style={{ color: theme.textMuted, fontSize: 12 }}>
            {`${target.record.maintenanceId} · ${target.record.vehicleId} · ${mt(
              locale,
              "maintenance.confirm.risk",
            )}`}
          </span>
        </div>
        <span style={{ color: theme.text, fontSize: 12.5, lineHeight: 1.5 }}>
          {mt(locale, "maintenance.confirm.body")}
        </span>
        <Field theme={theme} label={mt(locale, "maintenance.confirm.note")}>
          <textarea
            style={textAreaStyle(theme)}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={3}
          />
        </Field>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn theme={theme} onClick={onCancel}>
            {mt(locale, "common.cancel")}
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
            {mt(locale, "maintenance.confirm.action")}
          </button>
        </div>
      </div>
    </div>
  );
}

function MaintenanceFormModal({
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
  const isEditing = Boolean(editingRecord);

  return (
    <div style={modalOverlayStyle()} onClick={onCancel}>
      <div
        style={modalCardStyle()}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <strong style={{ color: theme.text, fontSize: 14 }}>
            {isEditing
              ? mt(locale, "maintenance.form.updateTitle")
              : mt(locale, "maintenance.form.createTitle")}
          </strong>
          <span style={{ color: theme.textMuted, fontSize: 12 }}>
            {isEditing
              ? (editingRecord?.maintenanceId ??
                mt(locale, "maintenance.form.selectRecord"))
              : mt(locale, "maintenance.form.flowDescriptor")}
          </span>
        </div>
        <MaintenanceForm
          key={
            editingRecord?.maintenanceId ??
            `create-${initialVehicleId || "blank"}`
          }
          locale={locale}
          editingRecord={editingRecord}
          initialVehicleId={initialVehicleId}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
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
              label={mt(locale, "maintenance.form.vehicle")}
              required
            >
              <input
                style={controlStyle(theme, true)}
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                required
              />
            </Field>
            <Field theme={theme} label={mt(locale, "maintenance.form.type")}>
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
              label={mt(locale, "maintenance.form.scheduledAt")}
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
                label={mt(locale, "maintenance.form.description")}
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
            <Field theme={theme} label={mt(locale, "maintenance.form.status")}>
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
              label={mt(locale, "maintenance.form.completedAt")}
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
        <Field theme={theme} label={mt(locale, "maintenance.form.technician")}>
          <input
            style={controlStyle(theme)}
            value={technician}
            onChange={(event) => setTechnician(event.target.value)}
          />
        </Field>
        <Field theme={theme} label={mt(locale, "maintenance.form.costTwd")}>
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
          <Field theme={theme} label={mt(locale, "maintenance.form.notes")}>
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
            ? mt(locale, "maintenance.form.saving")
            : isEditing
              ? mt(locale, "maintenance.form.saveChanges")
              : mt(locale, "maintenance.form.createRecord")}
        </button>
        <Btn theme={theme} onClick={onCancel}>
          {mt(locale, "common.cancel")}
        </Btn>
      </div>
    </form>
  );
}
