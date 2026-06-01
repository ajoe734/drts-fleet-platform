import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  DriverRegistryRecord,
  EmptyReason,
  EmptyStateEnvelope,
  MaintenanceRecord,
  ResourceActionDescriptor,
  ShiftRecord,
  UiHealthEnvelope,
  UiRefreshMetadata,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type VehiclesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type VehicleListPayload = VehicleRegistryRecord[] | VehicleListEnvelope;

type VehicleListEnvelope = {
  items: VehicleRuntimeRecord[];
  refresh?: UiRefreshMetadata;
  health?: UiHealthEnvelope;
  emptyState?: EmptyStateEnvelope;
};

type VehicleRuntimeRecord = VehicleRegistryRecord & {
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
  currentDriverBinding?: {
    driverId: string;
    driverName?: string | null;
    shiftId?: string | null;
  } | null;
  overdueMaintenance?: boolean;
  lastSeenAt?: string | null;
  vehicleType?: string | null;
  operationalStatus?: string | null;
};

type VehicleFilterTab = "all" | "dispatchable" | "offboarding";
type VehicleFilterStatus =
  | "all"
  | "active"
  | "attention"
  | "blocked"
  | "offboarding";
type VehicleFilterDispatchable = "all" | "yes" | "no";
type VehicleFilterOverdue = "all" | "yes" | "no";

type VehicleFilters = {
  tab: VehicleFilterTab;
  q: string;
  status: VehicleFilterStatus;
  type: string;
  dispatchable: VehicleFilterDispatchable;
  overdue: VehicleFilterOverdue;
  emptyReason: EmptyReason | null;
};

type HealthLoadResult = {
  health: UiHealthEnvelope | null;
  error: string | null;
};

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

type VehicleRow = Record<string, unknown> & {
  vehicleId: string;
  plateNo: string;
  typeLabel: string;
  typeKeys: string[];
  statusKey: VehicleFilterStatus;
  statusLabel: string;
  statusTone: CanvasTone;
  dispatchable: boolean;
  blockedReasonLabels: string[];
  currentDriverId: string | null;
  currentDriverName: string | null;
  currentShiftId: string | null;
  currentDriverLink: string | null;
  overdueMaintenance: boolean;
  maintenanceStatusLabel: string;
  maintenanceTone: CanvasTone;
  nextMaintenanceAt: string | null;
  contractLabel: string;
  insuranceLabel: string;
  debrandDueLabel: string;
  debrandTone: CanvasTone;
  lastSeenAt: string | null;
  lastSeenLabel: string;
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
  offboardingActive: boolean;
  syntheticDetailPending: boolean;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

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

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1.7fr) repeat(4, minmax(0, 1fr)) auto",
  gap: 10,
  alignItems: "end",
};

const fieldStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: theme.textMuted,
};

const fieldStyle: CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
};

const helperRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 10,
};

const helperTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
};

const monoTextStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
  whiteSpace: "normal",
};

const primaryTextStyle: CSSProperties = {
  color: theme.text,
  fontWeight: 600,
  minWidth: 0,
};

const secondaryTextStyle: CSSProperties = {
  color: theme.textDim,
  fontSize: 11.5,
  minWidth: 0,
};

const mutedTextStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 11.5,
  minWidth: 0,
};

const actionStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
  whiteSpace: "normal",
};

const emptyStateStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 10,
  padding: "28px 20px",
};

const EMPTY_REASONS = new Set<EmptyReason>([
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
]);

const EMPTY_OVERRIDE_REASON_CODES: Record<EmptyReason, string> = {
  no_data: "vehicle_registry_empty",
  not_provisioned: "vehicle_registry_not_provisioned",
  fetch_failed: "vehicle_registry_fetch_failed",
  permission_denied: "vehicle_registry_permission_denied",
  external_unavailable: "vehicle_registry_external_unavailable",
  filtered_empty: "vehicle_registry_filtered_empty",
  driver_not_eligible: "driver_not_eligible",
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmptyReason(value: string | null | undefined): value is EmptyReason {
  return (
    value !== null &&
    value !== undefined &&
    EMPTY_REASONS.has(value as EmptyReason)
  );
}

function resolveFilters(
  searchParams: Record<string, string | string[] | undefined>,
): VehicleFilters {
  const tabParam = firstParam(searchParams.tab);
  const statusParam = firstParam(searchParams.status);
  const dispatchableParam = firstParam(searchParams.dispatchable);
  const overdueParam = firstParam(searchParams.overdue);
  const emptyReasonParam = firstParam(searchParams.emptyReason);

  return {
    tab:
      tabParam === "dispatchable" || tabParam === "offboarding"
        ? tabParam
        : "all",
    q: firstParam(searchParams.q)?.trim() ?? "",
    status:
      statusParam === "active" ||
      statusParam === "attention" ||
      statusParam === "blocked" ||
      statusParam === "offboarding"
        ? statusParam
        : "all",
    type: firstParam(searchParams.type)?.trim() ?? "all",
    dispatchable:
      dispatchableParam === "yes" || dispatchableParam === "no"
        ? dispatchableParam
        : "all",
    overdue:
      overdueParam === "yes" || overdueParam === "no" ? overdueParam : "all",
    emptyReason: isEmptyReason(emptyReasonParam) ? emptyReasonParam : null,
  };
}

function buildHref(
  filters: VehicleFilters,
  overrides: Partial<VehicleFilters>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.tab !== "all") params.set("tab", next.tab);
  if (next.q) params.set("q", next.q);
  if (next.status !== "all") params.set("status", next.status);
  if (next.type !== "all") params.set("type", next.type);
  if (next.dispatchable !== "all")
    params.set("dispatchable", next.dispatchable);
  if (next.overdue !== "all") params.set("overdue", next.overdue);
  if (next.emptyReason) params.set("emptyReason", next.emptyReason);
  const query = params.toString();
  return query ? `/vehicles?${query}` : "/vehicles";
}

function hasActiveFilters(filters: VehicleFilters) {
  return (
    filters.tab !== "all" ||
    filters.q.length > 0 ||
    filters.status !== "all" ||
    filters.type !== "all" ||
    filters.dispatchable !== "all" ||
    filters.overdue !== "all"
  );
}

function buttonStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
): CSSProperties {
  const styles =
    variant === "primary"
      ? {
          background: theme.accent,
          color: "#ffffff",
          borderColor: theme.accent,
        }
      : variant === "ghost"
        ? {
            background: "transparent",
            color: theme.textMuted,
            borderColor: "transparent",
          }
        : {
            background: theme.surface,
            color: theme.text,
            borderColor: theme.border,
          };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 34,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${styles.borderColor}`,
    background: styles.background,
    color: styles.color,
    fontSize: 12.5,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: theme.fontFamily,
  };
}

function linkButtonStyle(
  tone: CanvasTone = "neutral",
  disabled = false,
): CSSProperties {
  const palette: Record<CanvasTone, { bg: string; fg: string; bd: string }> = {
    success: {
      bg: theme.successBg,
      fg: theme.success,
      bd: theme.successBorder,
    },
    warn: { bg: theme.warnBg, fg: theme.warn, bd: theme.warnBorder },
    danger: {
      bg: theme.dangerBg,
      fg: theme.danger,
      bd: theme.dangerBorder,
    },
    info: { bg: theme.infoBg, fg: theme.info, bd: theme.infoBorder },
    accent: {
      bg: theme.accentBg,
      fg: theme.accent,
      bd: theme.accentBorder,
    },
    neutral: {
      bg: theme.surfaceLo,
      fg: theme.textMuted,
      bd: theme.border,
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 26,
    padding: "4px 9px",
    borderRadius: 7,
    border: `1px solid ${palette[tone].bd}`,
    background: palette[tone].bg,
    color: palette[tone].fg,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    opacity: disabled ? 0.48 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    pointerEvents: disabled ? "none" : "auto",
  };
}

function tinyMetaStyle(tone: CanvasTone = "neutral"): CSSProperties {
  const colors: Record<CanvasTone, string> = {
    success: theme.success,
    warn: theme.warn,
    danger: theme.danger,
    info: theme.info,
    accent: theme.accent,
    neutral: theme.textMuted,
  };

  return {
    fontSize: 10.5,
    color: colors[tone],
    letterSpacing: 0.2,
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

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return copy(locale, "No signal", "無訊號");
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

function formatBuckets(
  locale: Locale,
  buckets: VehicleRegistryRecord["supportedServiceBuckets"],
) {
  if (buckets.length === 0) {
    return copy(locale, "Unclassified", "未分類");
  }

  if (buckets.length === 1) {
    return formatOpsCodeLabel(locale, buckets[0]);
  }

  return buckets
    .map((bucket: string) => formatOpsCodeLabel(locale, bucket))
    .join(" / ");
}

function deriveTypeKeys(vehicle: VehicleRuntimeRecord): string[] {
  return vehicle.supportedServiceBuckets.length > 0
    ? [...vehicle.supportedServiceBuckets]
    : [vehicle.vehicleType?.trim().toLowerCase() ?? "unknown"];
}

function deriveVehicleStatus(
  vehicle: VehicleRuntimeRecord,
  overdueMaintenance: boolean,
  driverBound: boolean,
  locale: Locale,
) {
  if (vehicle.supplyLifecycle.offboarding.status !== "none") {
    return {
      key: "offboarding" as const,
      label: formatOpsCodeLabel(
        locale,
        vehicle.supplyLifecycle.offboarding.status,
      ),
      tone:
        vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending"
          ? ("danger" as const)
          : ("warn" as const),
    };
  }

  if (
    !vehicle.dispatchableFlag ||
    vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0
  ) {
    return {
      key: "blocked" as const,
      label: copy(locale, "Not dispatchable", "不可派遣"),
      tone: "danger" as const,
    };
  }

  if (overdueMaintenance) {
    return {
      key: "attention" as const,
      label: copy(locale, "Maintenance attention", "保修注意"),
      tone: "warn" as const,
    };
  }

  if (driverBound) {
    return {
      key: "active" as const,
      label: copy(locale, "Bound to active shift", "綁定當前班次"),
      tone: "info" as const,
    };
  }

  return {
    key: "active" as const,
    label: copy(locale, "Ready reserve", "待命可派"),
    tone: "success" as const,
  };
}

function deriveMaintenanceSignal(
  vehicle: VehicleRuntimeRecord,
  maintenanceRecords: MaintenanceRecord[],
  locale: Locale,
) {
  if (typeof vehicle.overdueMaintenance === "boolean") {
    return {
      overdue: vehicle.overdueMaintenance,
      tone: vehicle.overdueMaintenance
        ? ("danger" as const)
        : ("success" as const),
      label: vehicle.overdueMaintenance
        ? copy(locale, "Overdue", "已逾期")
        : copy(locale, "Clear", "正常"),
      nextMaintenanceAt:
        maintenanceRecords
          .filter(
            (record) =>
              record.status !== "completed" && record.status !== "cancelled",
          )
          .map((record) => record.scheduledAt)
          .find((value) => Boolean(value)) ?? null,
    };
  }

  const overdueRecord = maintenanceRecords.find(
    (record) => record.status === "overdue",
  );

  if (overdueRecord) {
    return {
      overdue: true,
      tone: "danger" as const,
      label: copy(locale, "Overdue", "已逾期"),
      nextMaintenanceAt: overdueRecord.scheduledAt,
    };
  }

  const pendingRecords = maintenanceRecords
    .filter(
      (record) =>
        record.status !== "completed" && record.status !== "cancelled",
    )
    .sort((left, right) =>
      (left.scheduledAt ?? "").localeCompare(right.scheduledAt ?? ""),
    );
  const nextRecord = pendingRecords[0];

  return {
    overdue: false,
    tone: nextRecord ? ("warn" as const) : ("success" as const),
    label: nextRecord
      ? copy(locale, "Upcoming", "待保修")
      : copy(locale, "Clear", "正常"),
    nextMaintenanceAt: nextRecord?.scheduledAt ?? null,
  };
}

function deriveLastSeenAt(
  vehicle: VehicleRuntimeRecord,
  activeShift: ShiftRecord | null,
) {
  return (
    vehicle.lastSeenAt ??
    activeShift?.updatedAt ??
    activeShift?.clockedInAt ??
    vehicle.supplyLifecycle.dispatch.evaluatedAt ??
    vehicle.updatedAt
  );
}

function resolveAppOrigin(targetApp: CrossAppResourceLink["targetApp"]) {
  const envCandidates =
    targetApp === "platform-admin"
      ? [
          process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
          process.env.PLATFORM_ADMIN_ORIGIN,
          process.env.DEV_PLATFORM_ADMIN_ORIGIN,
          process.env.STAGING_PLATFORM_ADMIN_ORIGIN,
          process.env.PROD_PLATFORM_ADMIN_ORIGIN,
        ]
      : targetApp === "tenant-console"
        ? [
            process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN,
            process.env.TENANT_CONSOLE_ORIGIN,
          ]
        : [
            process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN,
            process.env.OPS_CONSOLE_ORIGIN,
            process.env.DEV_OPS_CONSOLE_ORIGIN,
            process.env.STAGING_OPS_CONSOLE_ORIGIN,
            process.env.PROD_OPS_CONSOLE_ORIGIN,
          ];
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

  return `${resolveAppOrigin(link.targetApp)}${link.route.startsWith("/") ? link.route : `/${link.route}`}`;
}

function synthesizeCrossAppLinks(
  vehicle: VehicleRuntimeRecord,
  locale: Locale,
): CrossAppResourceLink[] {
  if (vehicle.crossAppLinks && vehicle.crossAppLinks.length > 0) {
    return vehicle.crossAppLinks;
  }

  if (vehicle.supplyLifecycle.offboarding.status !== "none") {
    return [
      {
        targetApp: "platform-admin",
        route: `/fleet?tab=offboarding&vehicleId=${encodeURIComponent(vehicle.vehicleId)}`,
        resourceType: "vehicle",
        resourceId: vehicle.vehicleId,
        openMode: "new_tab",
        label: copy(locale, "Fleet governance", "車隊治理"),
      },
    ];
  }

  if (!vehicle.dispatchableFlag) {
    return [
      {
        targetApp: "platform-admin",
        route: `/fleet?vehicleId=${encodeURIComponent(vehicle.vehicleId)}`,
        resourceType: "vehicle",
        resourceId: vehicle.vehicleId,
        openMode: "new_tab",
        label: copy(locale, "Compliance trace", "法遵檢視"),
      },
    ];
  }

  return [];
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
    case "open_vehicle_detail":
      return copy(locale, "Vehicle detail", "車輛詳情");
    case "open_driver_binding":
      return copy(locale, "Driver binding", "司機綁定");
    case "review_maintenance":
      return copy(locale, "Maintenance", "保修檢視");
    case "open_fleet_governance":
      return copy(locale, "Fleet governance", "車隊治理");
    default:
      return formatOpsCodeLabel(locale, action.action);
  }
}

function actionReason(action: ResourceActionDescriptor, locale: Locale) {
  if (!action.disabledReasonCode) {
    return null;
  }

  if (action.disabledReasonCode === "vehicle_detail_pending") {
    return copy(
      locale,
      "Detail route ships in UI-FE-OPS-VEHID.",
      "詳情路由由 UI-FE-OPS-VEHID 交付。",
    );
  }

  return formatOpsCodeLabel(locale, action.disabledReasonCode);
}

function synthesizeAvailableActions(
  vehicle: VehicleRuntimeRecord,
  row: {
    currentDriverId: string | null;
    overdueMaintenance: boolean;
    crossAppLinks: CrossAppResourceLink[];
  },
): ResourceActionDescriptor[] {
  const actions: ResourceActionDescriptor[] = [
    {
      action: "open_vehicle_detail",
      enabled: false,
      disabledReasonCode: "vehicle_detail_pending",
      riskLevel: "low",
    },
  ];

  if (row.currentDriverId) {
    actions.push({
      action: "open_driver_binding",
      enabled: true,
      riskLevel: "low",
    });
  }

  if (row.overdueMaintenance) {
    actions.push({
      action: "review_maintenance",
      enabled: true,
      riskLevel: "low",
    });
  }

  if (
    row.crossAppLinks.length > 0 ||
    vehicle.supplyLifecycle.offboarding.status !== "none"
  ) {
    actions.push({
      action: "open_fleet_governance",
      enabled: true,
      riskLevel: "medium",
    });
  }

  return actions;
}

function buildActionHref(action: ResourceActionDescriptor, row: VehicleRow) {
  switch (action.action) {
    case "open_vehicle_detail":
      return `/vehicles/${encodeURIComponent(row.vehicleId)}`;
    case "open_driver_binding":
      return row.currentDriverLink ?? "/drivers";
    case "review_maintenance":
      return `/maintenance?vehicleId=${encodeURIComponent(row.vehicleId)}`;
    case "open_fleet_governance":
      return row.crossAppLinks[0]
        ? buildCrossAppHref(row.crossAppLinks[0])
        : null;
    default:
      return null;
  }
}

function isActionNewTab(action: ResourceActionDescriptor, row: VehicleRow) {
  if (action.action === "open_fleet_governance") {
    return row.crossAppLinks[0]?.openMode === "new_tab";
  }

  return false;
}

function refreshBadgeLabel(refresh: UiRefreshMetadata, locale: Locale) {
  const freshness = copy(
    locale,
    refresh.dataFreshness.toUpperCase(),
    formatOpsCodeLabel(locale, refresh.dataFreshness),
  );

  return `${freshness} · T3 · 15s`;
}

function refreshBody(refresh: UiRefreshMetadata, locale: Locale) {
  return copy(
    locale,
    `Snapshot ${formatLongDateTime(locale, refresh.generatedAt)} UTC from ${refresh.source}.`,
    `快照於 ${formatLongDateTime(locale, refresh.generatedAt)} UTC 產生，來源 ${formatOpsCodeLabel(locale, refresh.source)}。`,
  );
}

function synthesizeRefreshMetadata(
  generatedAt: string,
  freshness: UiRefreshMetadata["dataFreshness"] = "fresh",
): UiRefreshMetadata {
  return {
    generatedAt,
    staleAfterMs: 15_000,
    dataFreshness: freshness,
    source: "live",
  };
}

function normalizeVehiclePayload(
  payload: VehicleListPayload | null,
  fallbackGeneratedAt: string,
): VehicleListEnvelope {
  if (!payload) {
    return {
      items: [],
      refresh: synthesizeRefreshMetadata(fallbackGeneratedAt, "unknown"),
    };
  }

  if (Array.isArray(payload)) {
    return {
      items: payload,
      refresh: synthesizeRefreshMetadata(fallbackGeneratedAt, "fresh"),
    };
  }

  const normalized: VehicleListEnvelope = {
    items: payload.items ?? [],
    refresh:
      payload.refresh ??
      synthesizeRefreshMetadata(fallbackGeneratedAt, "fresh"),
  };

  if (payload.health) {
    normalized.health = payload.health;
  }
  if (payload.emptyState) {
    normalized.emptyState = payload.emptyState;
  }

  return normalized;
}

async function loadWithError<T>(
  loader: () => Promise<T>,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeLegacyHealthStatus(status: string | undefined) {
  if (status === "healthy" || status === "ok") return "healthy";
  if (status === "down" || status === "unhealthy") return "down";
  if (status === "degraded") return "degraded";
  return "degraded";
}

function normalizeHealthPayload(payload: unknown): UiHealthEnvelope | null {
  const unwrapped =
    isRecord(payload) && "data" in payload ? payload.data : payload;

  if (!isRecord(unwrapped)) {
    return null;
  }

  if (
    typeof unwrapped.status === "string" &&
    Array.isArray(unwrapped.degradedServices) &&
    typeof unwrapped.lastCheckedAt === "string"
  ) {
    return {
      status:
        unwrapped.status === "healthy" ||
        unwrapped.status === "degraded" ||
        unwrapped.status === "down"
          ? unwrapped.status
          : "degraded",
      degradedServices: unwrapped.degradedServices
        .filter(isRecord)
        .map((entry) => ({
          service: String(entry.service ?? "service"),
          impact: String(entry.impact ?? "degraded"),
          severity: entry.severity === "critical" ? "critical" : "warning",
        })),
      lastCheckedAt: unwrapped.lastCheckedAt,
    };
  }

  if (typeof unwrapped.status === "string") {
    const timestamp =
      typeof unwrapped.timestamp === "string"
        ? unwrapped.timestamp
        : new Date().toISOString();
    const service =
      typeof unwrapped.service === "string" ? unwrapped.service : "api";
    const normalizedStatus = normalizeLegacyHealthStatus(unwrapped.status);

    return {
      status: normalizedStatus,
      degradedServices:
        normalizedStatus === "healthy"
          ? []
          : [
              {
                service,
                impact: `health=${unwrapped.status}`,
                severity: normalizedStatus === "down" ? "critical" : "warning",
              },
            ],
      lastCheckedAt: timestamp,
    };
  }

  return null;
}

async function loadHealthEnvelope(): Promise<HealthLoadResult> {
  const apiBaseUrl = process.env.DRTS_API_URL ?? "http://localhost:3001";

  try {
    const response = await fetch(new URL("/api/health", apiBaseUrl), {
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        health: {
          status: "down",
          degradedServices: [
            {
              service: "api",
              impact: `status=${response.status}`,
              severity: "critical",
            },
          ],
          lastCheckedAt: new Date().toISOString(),
        },
        error: `health status ${response.status}`,
      };
    }

    const payload = await response.json();
    return {
      health: normalizeHealthPayload(payload),
      error: null,
    };
  } catch (error) {
    return {
      health: {
        status: "down",
        degradedServices: [
          {
            service: "api",
            impact:
              error instanceof Error ? error.message : "health fetch failed",
            severity: "critical",
          },
        ],
        lastCheckedAt: new Date().toISOString(),
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function mergeHealthSignals(
  baseHealth: UiHealthEnvelope | null,
  supplementalServices: UiHealthEnvelope["degradedServices"],
): UiHealthEnvelope | null {
  if (!baseHealth && supplementalServices.length === 0) {
    return null;
  }

  const degradedServices = [
    ...(baseHealth?.degradedServices ?? []),
    ...supplementalServices,
  ];

  if (degradedServices.length === 0 && baseHealth?.status === "healthy") {
    return baseHealth;
  }

  const status =
    baseHealth?.status === "down" ||
    degradedServices.some((service) => service.severity === "critical")
      ? "down"
      : degradedServices.length > 0
        ? "degraded"
        : "healthy";

  return {
    status,
    degradedServices,
    lastCheckedAt: baseHealth?.lastCheckedAt ?? new Date().toISOString(),
  };
}

function buildEmptyStateViewModel(
  reason: EmptyReason,
  locale: Locale,
  filters: VehicleFilters,
  rawMessage: string | null,
) {
  const clearFiltersHref = "/vehicles";
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info" as const,
        icon: "fleet" as const,
        title: copy(
          locale,
          "Fleet registry not provisioned",
          "車隊主檔尚未開通",
        ),
        description: copy(
          locale,
          "Platform Admin fleet governance still owns vehicle bootstrap for this environment.",
          "目前環境的車輛主檔仍由 Platform Admin 車隊治理面建立。",
        ),
        actionLabel: copy(locale, "Open fleet governance", "開啟車隊治理"),
        actionHref: `${resolveAppOrigin("platform-admin")}/fleet`,
        actionNewTab: true,
      };
    case "fetch_failed":
      return {
        tone: "danger" as const,
        icon: "warn" as const,
        title: copy(locale, "Vehicle snapshot failed", "車輛快照讀取失敗"),
        description:
          rawMessage ??
          copy(
            locale,
            "The registry endpoint did not return a usable payload.",
            "登記資料端點未回傳可用內容。",
          ),
        actionLabel: copy(locale, "Retry", "重新整理"),
        actionHref: buildHref(filters, {}),
        actionNewTab: false,
      };
    case "permission_denied":
      return {
        tone: "warn" as const,
        icon: "users" as const,
        title: copy(locale, "Vehicle scope denied", "無法存取車輛範圍"),
        description: copy(
          locale,
          "This actor can enter the shell but lacks fleet registry read scope.",
          "目前帳號可進入殼層，但沒有車隊登記讀取權限。",
        ),
        actionLabel: copy(locale, "Open ops dashboard", "返回儀表板"),
        actionHref: "/dashboard",
        actionNewTab: false,
      };
    case "external_unavailable":
      return {
        tone: "warn" as const,
        icon: "health" as const,
        title: copy(
          locale,
          "External dependency unavailable",
          "外部相依服務不可用",
        ),
        description: copy(
          locale,
          "Driver-binding or maintenance augmentation is degraded. Use the governance view for latest compliance state.",
          "司機綁定或保修補充資料降級，請改用治理檢視確認最新法遵狀態。",
        ),
        actionLabel: copy(locale, "Open platform admin", "開啟 Platform Admin"),
        actionHref: `${resolveAppOrigin("platform-admin")}/fleet`,
        actionNewTab: true,
      };
    case "filtered_empty":
      return {
        tone: "accent" as const,
        icon: "filter" as const,
        title: copy(
          locale,
          "No vehicles match this slice",
          "目前條件沒有符合的車輛",
        ),
        description: copy(
          locale,
          "Widen status, type, dispatchable, or overdue filters to restore results.",
          "放寬狀態、類型、可派遣或逾期條件即可恢復結果。",
        ),
        actionLabel: copy(locale, "Clear filters", "清除條件"),
        actionHref: clearFiltersHref,
        actionNewTab: false,
      };
    case "no_data":
    default:
      return {
        tone: "neutral" as const,
        icon: "vehicles" as const,
        title: copy(locale, "No vehicles registered", "尚未登記車輛"),
        description: copy(
          locale,
          "The registry is healthy but there are no vehicle records in this environment yet.",
          "登記資料健康，但此環境目前還沒有任何車輛紀錄。",
        ),
        actionLabel: copy(locale, "Open dispatch board", "前往派車看板"),
        actionHref: "/dispatch",
        actionNewTab: false,
      };
  }
}

function renderAction(
  action: ResourceActionDescriptor,
  row: VehicleRow,
  locale: Locale,
  key: string,
): ReactNode {
  const label = actionLabel(action, locale);
  const href = action.enabled ? buildActionHref(action, row) : null;
  const reason = actionReason(action, locale);

  return (
    <div key={key} style={{ display: "grid", gap: 4 }}>
      {href ? (
        <Link
          href={href}
          target={isActionNewTab(action, row) ? "_blank" : undefined}
          rel={isActionNewTab(action, row) ? "noreferrer" : undefined}
          style={linkButtonStyle(actionTone(action))}
        >
          {label}
          {isActionNewTab(action, row) ? (
            <CanvasIcon name="ext" size={11} />
          ) : null}
        </Link>
      ) : (
        <span
          style={linkButtonStyle(actionTone(action), !action.enabled)}
          title={reason ?? undefined}
        >
          {label}
        </span>
      )}
      <span style={tinyMetaStyle(actionTone(action))}>
        {copy(locale, `risk:${action.riskLevel}`, `風險:${action.riskLevel}`)}
        {action.requiresReason
          ? copy(locale, " · reason required", " · 需填原因")
          : ""}
      </span>
      {!action.enabled && reason ? (
        <span style={mutedTextStyle}>{reason}</span>
      ) : null}
    </div>
  );
}

function buildColumns(locale: Locale): CanvasTableColumn<VehicleRow>[] {
  return [
    {
      h: copy(locale, "VEHICLE", "車輛"),
      w: 200,
      r: (row) => (
        <div style={stackStyle}>
          <span style={{ ...primaryTextStyle, ...monoTextStyle }}>
            {row.vehicleId}
          </span>
          <span style={secondaryTextStyle}>{row.plateNo}</span>
        </div>
      ),
    },
    {
      h: copy(locale, "TYPE / STATUS", "類型 / 狀態"),
      w: 220,
      r: (row) => (
        <div style={stackStyle}>
          <span style={primaryTextStyle}>{row.typeLabel}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Pill theme={theme} tone={row.statusTone} dot>
              {row.statusLabel}
            </Pill>
          </div>
        </div>
      ),
    },
    {
      h: copy(locale, "DISPATCHABLE", "派遣可用"),
      w: 250,
      r: (row) => (
        <div style={stackStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Pill
              theme={theme}
              tone={row.dispatchable ? "success" : "danger"}
              dot
            >
              {row.dispatchable
                ? copy(locale, "yes", "可派")
                : copy(locale, "no", "不可派")}
            </Pill>
          </div>
          <span style={secondaryTextStyle}>
            {row.blockedReasonLabels.length > 0
              ? row.blockedReasonLabels.join(" / ")
              : copy(locale, "No blocking gate", "無阻塞 gate")}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "CURRENT DRIVER", "當前司機"),
      w: 200,
      r: (row) => (
        <div style={stackStyle}>
          {row.currentDriverLink ? (
            <Link
              href={row.currentDriverLink}
              style={linkButtonStyle("accent")}
            >
              {row.currentDriverName ?? row.currentDriverId}
            </Link>
          ) : (
            <span style={primaryTextStyle}>
              {copy(locale, "Unbound", "未綁定")}
            </span>
          )}
          <span style={{ ...secondaryTextStyle, ...monoTextStyle }}>
            {row.currentShiftId ??
              copy(locale, "No active shift", "無啟用班次")}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "COMPLIANCE", "法遵覆蓋"),
      w: 210,
      r: (row) => (
        <div style={stackStyle}>
          <span style={secondaryTextStyle}>
            {copy(locale, "Contract", "合約")} · {row.contractLabel}
          </span>
          <span style={secondaryTextStyle}>
            {copy(locale, "Insurance", "保險")} · {row.insuranceLabel}
          </span>
          <span style={mutedTextStyle}>{row.debrandDueLabel}</span>
        </div>
      ),
    },
    {
      h: copy(locale, "MAINT / LAST SEEN", "保修 / 最近訊號"),
      w: 210,
      r: (row) => (
        <div style={stackStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Pill theme={theme} tone={row.maintenanceTone} dot>
              {row.maintenanceStatusLabel}
            </Pill>
            <Pill theme={theme} tone={row.debrandTone}>
              {row.debrandDueLabel}
            </Pill>
          </div>
          <span style={secondaryTextStyle}>
            {row.nextMaintenanceAt
              ? copy(locale, "Next due", "下次保修") +
                ` · ${row.nextMaintenanceAt}`
              : copy(locale, "No open work order", "無未結工單")}
          </span>
          <span style={{ ...mutedTextStyle, ...monoTextStyle }}>
            {row.lastSeenLabel}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "ACTIONS", "操作"),
      w: 250,
      r: (row) => (
        <div style={actionStackStyle}>
          {row.availableActions
            .slice(0, 2)
            .map((action, index) =>
              renderAction(
                action,
                row,
                locale,
                `${row.vehicleId}-${action.action}-${index}`,
              ),
            )}
          {row.crossAppLinks.slice(0, 1).map((link) => (
            <Link
              key={`${row.vehicleId}-${link.label}`}
              href={buildCrossAppHref(link)}
              target={link.openMode === "new_tab" ? "_blank" : undefined}
              rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
              style={linkButtonStyle("info")}
            >
              {link.label}
              {link.openMode === "new_tab" ? (
                <CanvasIcon name="ext" size={11} />
              ) : null}
            </Link>
          ))}
        </div>
      ),
    },
  ];
}

export default async function VehiclesPage({
  searchParams,
}: VehiclesPageProps) {
  const resolvedSearchParams = await (searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>));
  const filters = resolveFilters(resolvedSearchParams);
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  const requestStartedAt = new Date().toISOString();

  const [
    vehiclesResult,
    driversResult,
    shiftsResult,
    maintenanceResult,
    healthResult,
  ] = await Promise.all([
    loadWithError(() =>
      client.get<VehicleListPayload>("/api/regulatory-registry/vehicles"),
    ),
    loadWithError(() => client.listDrivers()),
    loadWithError(() => client.listShifts()),
    loadWithError(() => client.listMaintenance()),
    loadHealthEnvelope(),
  ]);

  const vehiclePayload = normalizeVehiclePayload(
    vehiclesResult.data,
    requestStartedAt,
  );
  const drivers = driversResult.data ?? ([] as DriverRegistryRecord[]);
  const shifts = shiftsResult.data ?? ([] as ShiftRecord[]);
  const maintenance = maintenanceResult.data ?? ([] as MaintenanceRecord[]);

  const degradedServices: UiHealthEnvelope["degradedServices"] = [];
  if (vehiclesResult.error) {
    degradedServices.push({
      service: "vehicle_registry",
      impact: vehiclesResult.error,
      severity: "critical",
    });
  }
  if (driversResult.error) {
    degradedServices.push({
      service: "driver_registry",
      impact: driversResult.error,
      severity: "warning",
    });
  }
  if (shiftsResult.error) {
    degradedServices.push({
      service: "shift_attendance",
      impact: shiftsResult.error,
      severity: "warning",
    });
  }
  if (maintenanceResult.error) {
    degradedServices.push({
      service: "maintenance",
      impact: maintenanceResult.error,
      severity: "warning",
    });
  }
  if (healthResult.error) {
    degradedServices.push({
      service: "api",
      impact: healthResult.error,
      severity: "critical",
    });
  }

  const health = mergeHealthSignals(
    vehiclePayload.health ?? healthResult.health,
    degradedServices,
  );

  const driverById = new Map<string, DriverRegistryRecord>();
  for (const driver of drivers) {
    driverById.set(driver.driverId, driver);
  }

  const activeShiftByVehicle = new Map<string, ShiftRecord>();
  for (const shift of shifts) {
    if (shift.status !== "active" || !shift.vehicleId) {
      continue;
    }

    const existing = activeShiftByVehicle.get(shift.vehicleId);
    if (!existing || shift.clockedInAt > existing.clockedInAt) {
      activeShiftByVehicle.set(shift.vehicleId, shift);
    }
  }

  const maintenanceByVehicle = new Map<string, MaintenanceRecord[]>();
  for (const record of maintenance) {
    const list = maintenanceByVehicle.get(record.vehicleId) ?? [];
    list.push(record);
    maintenanceByVehicle.set(record.vehicleId, list);
  }

  const rows: VehicleRow[] = vehiclePayload.items.map((vehicle) => {
    const activeShift =
      vehicle.currentDriverBinding?.driverId &&
      vehicle.currentDriverBinding.shiftId
        ? ({
            shiftId: vehicle.currentDriverBinding.shiftId,
            driverId: vehicle.currentDriverBinding.driverId,
            vehicleId: vehicle.vehicleId,
            status: "active",
            clockedInAt: vehicle.updatedAt,
            clockedOutAt: null,
            startLocation: null,
            endLocation: null,
            startOdometer: null,
            endOdometer: null,
            notes: null,
            totalHours: null,
            updatedAt: vehicle.updatedAt,
          } as ShiftRecord)
        : (activeShiftByVehicle.get(vehicle.vehicleId) ?? null);
    const boundDriverId =
      vehicle.currentDriverBinding?.driverId ?? activeShift?.driverId ?? null;
    const boundDriver =
      (boundDriverId ? driverById.get(boundDriverId) : null) ?? null;
    const maintenanceRecords =
      maintenanceByVehicle.get(vehicle.vehicleId) ?? [];
    const maintenanceSignal = deriveMaintenanceSignal(
      vehicle,
      maintenanceRecords,
      locale,
    );
    const crossAppLinks = synthesizeCrossAppLinks(vehicle, locale);
    const vehicleStatus = deriveVehicleStatus(
      vehicle,
      maintenanceSignal.overdue,
      Boolean(boundDriverId),
      locale,
    );
    const lastSeenAt = deriveLastSeenAt(vehicle, activeShift);
    const lastSeenLabel =
      copy(locale, "Last seen", "最近訊號") +
      ` · ${formatDateTime(locale, lastSeenAt)}`;

    const provisionalRow = {
      vehicleId: vehicle.vehicleId,
      plateNo: vehicle.plateNo,
      typeLabel:
        vehicle.vehicleType ??
        formatBuckets(locale, vehicle.supportedServiceBuckets),
      typeKeys: deriveTypeKeys(vehicle),
      statusKey: vehicleStatus.key,
      statusLabel: vehicle.operationalStatus ?? vehicleStatus.label,
      statusTone: vehicleStatus.tone,
      dispatchable:
        vehicle.dispatchableFlag &&
        vehicle.supplyLifecycle.dispatch.blockedReasons.length === 0,
      blockedReasonLabels: vehicle.supplyLifecycle.dispatch.blockedReasons.map(
        (reason: string) => formatOpsCodeLabel(locale, reason),
      ),
      currentDriverId: boundDriverId,
      currentDriverName:
        vehicle.currentDriverBinding?.driverName ??
        boundDriver?.name ??
        boundDriverId,
      currentShiftId:
        vehicle.currentDriverBinding?.shiftId ?? activeShift?.shiftId ?? null,
      currentDriverLink: boundDriverId
        ? `/drivers/${encodeURIComponent(boundDriverId)}`
        : null,
      overdueMaintenance: maintenanceSignal.overdue,
      maintenanceStatusLabel: maintenanceSignal.label,
      maintenanceTone: maintenanceSignal.tone,
      nextMaintenanceAt: maintenanceSignal.nextMaintenanceAt
        ? formatDateTime(locale, maintenanceSignal.nextMaintenanceAt)
        : null,
      contractLabel: formatOpsCodeLabel(
        locale,
        vehicle.supplyLifecycle.contract.lifecycleStatus,
      ),
      insuranceLabel: formatOpsCodeLabel(
        locale,
        vehicle.supplyLifecycle.insurance.lifecycleStatus,
      ),
      debrandDueLabel:
        vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending"
          ? copy(locale, "Debrand pending", "除標識待完成")
          : vehicle.supplyLifecycle.offboarding.status !== "none"
            ? copy(locale, "Offboarding", "退場中")
            : copy(locale, "No debrand", "無除標識"),
      debrandTone:
        vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending"
          ? ("danger" as const)
          : vehicle.supplyLifecycle.offboarding.status !== "none"
            ? ("warn" as const)
            : ("neutral" as const),
      lastSeenAt,
      lastSeenLabel,
      crossAppLinks,
      offboardingActive: vehicle.supplyLifecycle.offboarding.status !== "none",
      syntheticDetailPending: true,
    };

    const actionSeed = {
      currentDriverId: boundDriverId,
      overdueMaintenance: maintenanceSignal.overdue,
      crossAppLinks,
    };

    const nextRow: VehicleRow = {
      ...provisionalRow,
      availableActions:
        vehicle.availableActions && vehicle.availableActions.length > 0
          ? vehicle.availableActions
          : synthesizeAvailableActions(vehicle, actionSeed),
    };

    return nextRow;
  });

  const typeOptions = Array.from(
    new Set(
      rows
        .flatMap((row) => row.typeKeys)
        .filter((value) => value !== "unknown"),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const filteredRows = rows.filter((row) => {
    if (filters.tab === "dispatchable" && !row.dispatchable) {
      return false;
    }
    if (filters.tab === "offboarding" && !row.offboardingActive) {
      return false;
    }
    if (filters.status !== "all" && row.statusKey !== filters.status) {
      return false;
    }
    if (filters.type !== "all" && !row.typeKeys.includes(filters.type)) {
      return false;
    }
    if (filters.dispatchable === "yes" && !row.dispatchable) {
      return false;
    }
    if (filters.dispatchable === "no" && row.dispatchable) {
      return false;
    }
    if (filters.overdue === "yes" && !row.overdueMaintenance) {
      return false;
    }
    if (filters.overdue === "no" && row.overdueMaintenance) {
      return false;
    }

    if (!filters.q) {
      return true;
    }

    const haystack = [
      row.vehicleId,
      row.plateNo,
      row.typeLabel,
      row.statusLabel,
      row.currentDriverId ?? "",
      row.currentDriverName ?? "",
      row.blockedReasonLabels.join(" "),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(filters.q.toLowerCase());
  });

  const tabCounts = {
    all: rows.length,
    dispatchable: rows.filter((row) => row.dispatchable).length,
    offboarding: rows.filter((row) => row.offboardingActive).length,
  };

  const dispatchableCount = rows.filter((row) => row.dispatchable).length;
  const blockedCount = rows.filter((row) => !row.dispatchable).length;
  const overdueCount = rows.filter((row) => row.overdueMaintenance).length;
  const boundCount = rows.filter((row) => row.currentDriverId).length;
  const offlineEmergency =
    rows.length > 0 &&
    blockedCount >= Math.max(3, Math.ceil(rows.length * 0.4));

  let emptyReason = filters.emptyReason;
  if (!emptyReason && filteredRows.length === 0) {
    if (vehiclesResult.error) {
      emptyReason = "fetch_failed";
    } else if (
      vehiclePayload.emptyState?.reason &&
      isEmptyReason(vehiclePayload.emptyState.reason)
    ) {
      emptyReason = vehiclePayload.emptyState.reason;
    } else if (hasActiveFilters(filters)) {
      emptyReason = "filtered_empty";
    } else if (
      health &&
      health.status !== "healthy" &&
      health.degradedServices.some(
        (service: UiHealthEnvelope["degradedServices"][number]) =>
          service.service === "maintenance" ||
          service.service === "driver_registry",
      )
    ) {
      emptyReason = "external_unavailable";
    } else {
      emptyReason = "no_data";
    }
  }

  if (filters.emptyReason && filteredRows.length > 0) {
    emptyReason = filters.emptyReason;
  }

  const displayedRows = emptyReason ? [] : filteredRows;
  const emptyView = emptyReason
    ? buildEmptyStateViewModel(
        emptyReason,
        locale,
        filters,
        vehiclesResult.error ??
          (vehiclePayload.emptyState?.messageCode
            ? formatOpsCodeLabel(locale, vehiclePayload.emptyState.messageCode)
            : null),
      )
    : null;

  const refresh =
    vehiclePayload.refresh ?? synthesizeRefreshMetadata(requestStartedAt);
  const refreshHref = buildHref(filters, {});

  const tabs = [
    {
      key: "all" as const,
      node: (
        <Link
          href={buildHref(filters, { tab: "all" })}
          style={{
            color: theme.text,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {copy(locale, "All", "全部")}
          <span style={tinyMetaStyle()}>{tabCounts.all}</span>
        </Link>
      ),
    },
    {
      key: "dispatchable" as const,
      node: (
        <Link
          href={buildHref(filters, { tab: "dispatchable" })}
          style={{
            color: theme.text,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {copy(locale, "Dispatchable", "可派")}
          <span style={tinyMetaStyle("success")}>{tabCounts.dispatchable}</span>
        </Link>
      ),
    },
    {
      key: "offboarding" as const,
      node: (
        <Link
          href={buildHref(filters, { tab: "offboarding" })}
          style={{
            color: theme.text,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {copy(locale, "Offboarding", "退場")}
          <span style={tinyMetaStyle("warn")}>{tabCounts.offboarding}</span>
        </Link>
      ),
    },
  ];
  const defaultTab = tabs[0]!;
  const activeTab = (tabs.find((tab) => tab.key === filters.tab) ?? defaultTab)
    .node;

  const columns = buildColumns(locale);

  return (
    <>
      <PageHeader
        theme={theme}
        title={copy(locale, "Vehicles", "車輛")}
        subtitle={copy(
          locale,
          "dispatchable · contract · insurance · debrand",
          "dispatchable · 合約 · 保險 · debrand",
        )}
        tabs={tabs.map((tab) => tab.node)}
        activeTab={activeTab}
        actions={
          <>
            <Pill
              theme={theme}
              tone={refresh.dataFreshness === "fresh" ? "success" : "warn"}
            >
              {refreshBadgeLabel(refresh, locale)}
            </Pill>
            <a href={refreshHref} style={buttonStyle("secondary")}>
              <CanvasIcon name="arrow" size={12} />
              {copy(locale, "Refresh", "重新整理")}
            </a>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {health && health.status !== "healthy" ? (
          <Banner
            theme={theme}
            tone={health.status === "down" ? "danger" : "warn"}
            icon={health.status === "down" ? "warn" : "health"}
            title={copy(
              locale,
              "Vehicle page is running degraded",
              "車輛頁面目前為降級模式",
            )}
            body={copy(
              locale,
              `${
                health.degradedServices
                  .map(
                    (service: UiHealthEnvelope["degradedServices"][number]) =>
                      `${service.service}: ${service.impact}`,
                  )
                  .join(" · ") || "health unknown"
              } · checked ${formatLongDateTime(locale, health.lastCheckedAt)} UTC`,
              `${
                health.degradedServices
                  .map(
                    (service: UiHealthEnvelope["degradedServices"][number]) =>
                      `${service.service}: ${service.impact}`,
                  )
                  .join(" · ") || "health unknown"
              } · 檢查時間 ${formatLongDateTime(locale, health.lastCheckedAt)} UTC`,
            )}
          />
        ) : null}

        {refresh.dataFreshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone={refresh.dataFreshness === "degraded" ? "warn" : "info"}
            icon={refresh.dataFreshness === "degraded" ? "warn" : "clock"}
            title={copy(
              locale,
              "Snapshot is not fresh",
              "目前顯示的快照非最新",
            )}
            body={refreshBody(refresh, locale)}
          />
        ) : null}

        {offlineEmergency ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="vehicles"
            title={copy(
              locale,
              "Supply emergency: many vehicles are offline",
              "供給警報：大量車輛離線或不可派遣",
            )}
            body={copy(
              locale,
              `${blockedCount}/${rows.length} vehicles are currently not dispatchable. Escalate offboarding and compliance blockers before dispatch queues stall.`,
              `目前 ${blockedCount}/${rows.length} 輛車不可派遣；請優先處理退場與法遵阻塞，避免派車佇列失速。`,
            )}
            actions={
              <Link
                href={`${resolveAppOrigin("platform-admin")}/fleet?tab=offboarding`}
                target="_blank"
                rel="noreferrer"
                style={linkButtonStyle("danger")}
              >
                {copy(locale, "Open Fleet Gov", "開啟車隊治理")}
                <CanvasIcon name="ext" size={11} />
              </Link>
            }
          />
        ) : null}

        <div style={summaryGridStyle}>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {copy(locale, "Registered", "已登記")}
            </span>
            <span style={summaryValueStyle}>{rows.length}</span>
            <span style={summaryFootStyle}>
              {copy(locale, "vehicle master rows", "車輛主檔筆數")}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {copy(locale, "Dispatchable", "可派遣")}
            </span>
            <span style={{ ...summaryValueStyle, color: theme.success }}>
              {dispatchableCount}
            </span>
            <span style={summaryFootStyle}>
              {copy(locale, "ready for queue", "可進入派車佇列")}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {copy(locale, "Maintenance", "保修")}
            </span>
            <span
              style={{
                ...summaryValueStyle,
                color: overdueCount > 0 ? theme.warn : theme.text,
              }}
            >
              {overdueCount}
            </span>
            <span style={summaryFootStyle}>
              {copy(locale, "vehicles with overdue work", "逾期工單車輛")}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {copy(locale, "Bound drivers", "綁定司機")}
            </span>
            <span style={{ ...summaryValueStyle, color: theme.info }}>
              {boundCount}
            </span>
            <span style={summaryFootStyle}>
              {copy(locale, "active shift bindings", "當前班次綁定")}
            </span>
          </div>
        </div>

        <Card
          theme={theme}
          title={copy(locale, "Filters", "篩選")}
          subtitle={copy(
            locale,
            "Status, type, dispatchable, and overdue views run on the same snapshot.",
            "狀態、類型、可派遣與逾期條件都套用同一份快照。",
          )}
        >
          <form method="get" style={{ display: "grid", gap: 0 }}>
            <input type="hidden" name="tab" value={filters.tab} />
            {filters.emptyReason ? (
              <input
                type="hidden"
                name="emptyReason"
                value={filters.emptyReason}
              />
            ) : null}
            <div style={filterGridStyle}>
              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Search", "搜尋")}
                </span>
                <input
                  name="q"
                  defaultValue={filters.q}
                  placeholder={copy(
                    locale,
                    "vehicle id, plate, driver",
                    "車輛編號、車牌、司機",
                  )}
                  style={fieldStyle}
                />
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Status", "狀態")}
                </span>
                <select
                  name="status"
                  defaultValue={filters.status}
                  style={fieldStyle}
                >
                  <option value="all">{copy(locale, "All", "全部")}</option>
                  <option value="active">
                    {copy(locale, "Active", "運作中")}
                  </option>
                  <option value="attention">
                    {copy(locale, "Attention", "注意")}
                  </option>
                  <option value="blocked">
                    {copy(locale, "Blocked", "阻塞")}
                  </option>
                  <option value="offboarding">
                    {copy(locale, "Offboarding", "退場")}
                  </option>
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Type", "類型")}
                </span>
                <select
                  name="type"
                  defaultValue={filters.type}
                  style={fieldStyle}
                >
                  <option value="all">{copy(locale, "All", "全部")}</option>
                  {typeOptions.map((value) => (
                    <option key={value} value={value}>
                      {formatOpsCodeLabel(locale, value)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Dispatchable", "可派遣")}
                </span>
                <select
                  name="dispatchable"
                  defaultValue={filters.dispatchable}
                  style={fieldStyle}
                >
                  <option value="all">{copy(locale, "All", "全部")}</option>
                  <option value="yes">{copy(locale, "Yes", "可派")}</option>
                  <option value="no">{copy(locale, "No", "不可派")}</option>
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Overdue", "逾期")}
                </span>
                <select
                  name="overdue"
                  defaultValue={filters.overdue}
                  style={fieldStyle}
                >
                  <option value="all">{copy(locale, "All", "全部")}</option>
                  <option value="yes">{copy(locale, "Yes", "是")}</option>
                  <option value="no">{copy(locale, "No", "否")}</option>
                </select>
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={buttonStyle("primary")}>
                  <CanvasIcon name="search" size={12} />
                  {copy(locale, "Apply", "套用")}
                </button>
                <Link href="/vehicles" style={buttonStyle("ghost")}>
                  {copy(locale, "Reset", "重設")}
                </Link>
              </div>
            </div>
          </form>

          <div style={helperRowStyle}>
            <span style={helperTextStyle}>
              {copy(
                locale,
                `${displayedRows.length} visible / ${rows.length} total`,
                `目前顯示 ${displayedRows.length} / 總數 ${rows.length}`,
              )}
            </span>
            <span style={{ ...helperTextStyle, ...monoTextStyle }}>
              {copy(locale, "generated", "生成時間")} ·{" "}
              {formatLongDateTime(locale, refresh.generatedAt)} UTC
            </span>
            <span style={helperTextStyle}>
              {copy(
                locale,
                "supporting actions come from availableActions",
                "畫面 CTA 以 availableActions 為準",
              )}
            </span>
          </div>
        </Card>

        <Card
          theme={theme}
          title={copy(locale, "Vehicle registry", "車輛登記清單")}
          subtitle={copy(
            locale,
            "Current driver binding, dispatchability, maintenance, and governance handoff in one grid.",
            "在同一張表內整合司機綁定、可派遣狀態、保修與治理交接。",
          )}
        >
          {emptyView ? (
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
              <span style={tinyMetaStyle(emptyView.tone)}>
                {copy(locale, "emptyReason", "空狀態")} ·{" "}
                {EMPTY_OVERRIDE_REASON_CODES[emptyReason ?? "no_data"]}
              </span>
            </div>
          ) : (
            <Table theme={theme} columns={columns} rows={displayedRows} />
          )}
        </Card>
      </div>
    </>
  );
}
