import Link from "next/link";
import type { CSSProperties } from "react";
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
import { PublishAssistantScope } from "@/components/ops-assistant";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import { VehiclesTable } from "./vehicles-table";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  buildCanvasTheme,
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

function listT(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
) {
  return t(`vehicles.list.${key}`, locale, params);
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
    return listT(locale, "empty.noSignal");
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
    return listT(locale, "empty.unknown");
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
    return listT(locale, "empty.unclassified");
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
      label: listT(locale, "status.notDispatchable"),
      tone: "danger" as const,
    };
  }

  if (overdueMaintenance) {
    return {
      key: "attention" as const,
      label: listT(locale, "status.maintenanceAttention"),
      tone: "warn" as const,
    };
  }

  if (driverBound) {
    return {
      key: "active" as const,
      label: listT(locale, "status.boundToActiveShift"),
      tone: "info" as const,
    };
  }

  return {
    key: "active" as const,
    label: listT(locale, "status.readyReserve"),
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
        ? listT(locale, "maintenance.overdue")
        : listT(locale, "maintenance.clear"),
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
      label: listT(locale, "maintenance.overdue"),
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
      ? listT(locale, "maintenance.upcoming")
      : listT(locale, "maintenance.clear"),
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
        label: listT(locale, "action.fleetGovernance"),
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
        label: listT(locale, "action.complianceTrace"),
      },
    ];
  }

  return [];
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

function refreshBadgeLabel(refresh: UiRefreshMetadata, locale: Locale) {
  const freshness =
    locale === "en"
      ? refresh.dataFreshness.toUpperCase()
      : formatOpsCodeLabel(locale, refresh.dataFreshness);

  return `${freshness} · T3 · 15s`;
}

function refreshBody(refresh: UiRefreshMetadata, locale: Locale) {
  return listT(locale, "refresh.body", {
    generatedAt: formatLongDateTime(locale, refresh.generatedAt),
    source:
      locale === "en"
        ? refresh.source
        : formatOpsCodeLabel(locale, refresh.source),
  });
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
        title: t("vehicles.list.empty.notProvisionedTitle", locale),
        description: t("vehicles.list.empty.notProvisionedBody", locale),
        actionLabel: listT(locale, "action.openFleetGovernance"),
        actionHref: `${resolveAppOrigin("platform-admin")}/fleet`,
        actionNewTab: true,
      };
    case "fetch_failed":
      return {
        tone: "danger" as const,
        icon: "warn" as const,
        title: listT(locale, "empty.snapshotFailed"),
        description:
          rawMessage ?? t("vehicles.list.empty.fetchFailedBody", locale),
        actionLabel: listT(locale, "empty.action.retry"),
        actionHref: buildHref(filters, {}),
        actionNewTab: false,
      };
    case "permission_denied":
      return {
        tone: "warn" as const,
        icon: "users" as const,
        title: listT(locale, "empty.scopeDenied"),
        description: t("vehicles.list.empty.permissionDeniedBody", locale),
        actionLabel: listT(locale, "empty.action.openOpsDashboard"),
        actionHref: "/dashboard",
        actionNewTab: false,
      };
    case "external_unavailable":
      return {
        tone: "warn" as const,
        icon: "health" as const,
        title: t("vehicles.list.empty.externalUnavailableTitle", locale),
        description: t("vehicles.list.empty.externalUnavailableBody", locale),
        actionLabel: listT(locale, "empty.action.openPlatformAdmin"),
        actionHref: `${resolveAppOrigin("platform-admin")}/fleet`,
        actionNewTab: true,
      };
    case "filtered_empty":
      return {
        tone: "accent" as const,
        icon: "filter" as const,
        title: t("vehicles.list.empty.filteredTitle", locale),
        description: listT(locale, "empty.filteredBody"),
        actionLabel: listT(locale, "empty.action.clearFilters"),
        actionHref: clearFiltersHref,
        actionNewTab: false,
      };
    case "no_data":
    default:
      return {
        tone: "neutral" as const,
        icon: "vehicles" as const,
        title: listT(locale, "empty.noVehicles"),
        description: t("vehicles.list.empty.noVehiclesBody", locale),
        actionLabel: listT(locale, "empty.action.openDispatchBoard"),
        actionHref: "/dispatch",
        actionNewTab: false,
      };
  }
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
    const lastSeenLabel = `${listT(locale, "label.lastSeen")} · ${formatDateTime(locale, lastSeenAt)}`;

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
          ? listT(locale, "label.debrandPending")
          : vehicle.supplyLifecycle.offboarding.status !== "none"
            ? listT(locale, "label.offboarding")
            : listT(locale, "label.noDebrand"),
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
          {t("common.all", locale)}
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
          {listT(locale, "tab.dispatchable")}
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
          {listT(locale, "tab.offboarding")}
          <span style={tinyMetaStyle("warn")}>{tabCounts.offboarding}</span>
        </Link>
      ),
    },
  ];
  const defaultTab = tabs[0]!;
  const activeTab = (tabs.find((tab) => tab.key === filters.tab) ?? defaultTab)
    .node;

  const appOrigins = {
    opsConsole: resolveAppOrigin("ops-console"),
    platformAdmin: resolveAppOrigin("platform-admin"),
    tenantConsole: resolveAppOrigin("tenant-console"),
  };

  return (
    <>
      <PublishAssistantScope
        activeTab={filters.tab}
        visibleFilters={{
          ...(filters.q ? { q: filters.q } : {}),
          status: filters.status,
          type: filters.type,
          dispatchable: filters.dispatchable,
          overdue: filters.overdue,
        }}
      />
      <PageHeader
        theme={theme}
        title={listT(locale, "pageTitle")}
        subtitle={listT(locale, "pageSubtitle")}
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
              {t("common.refresh", locale)}
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
            title={listT(locale, "banner.degraded.title")}
            body={listT(locale, "banner.degraded.body", {
              services:
                health.degradedServices
                  .map(
                    (service: UiHealthEnvelope["degradedServices"][number]) =>
                      `${service.service}: ${service.impact}`,
                  )
                  .join(" · ") || listT(locale, "banner.degraded.unknown"),
              checkedAt: formatLongDateTime(locale, health.lastCheckedAt),
            })}
          />
        ) : null}

        {refresh.dataFreshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone={refresh.dataFreshness === "degraded" ? "warn" : "info"}
            icon={refresh.dataFreshness === "degraded" ? "warn" : "clock"}
            title={listT(locale, "banner.snapshotStale.title")}
            body={refreshBody(refresh, locale)}
          />
        ) : null}

        {offlineEmergency ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="vehicles"
            title={listT(locale, "banner.supplyEmergency.title")}
            body={listT(locale, "banner.supplyEmergency.body", {
              blocked: blockedCount,
              total: rows.length,
            })}
            actions={
              <Link
                href={`${resolveAppOrigin("platform-admin")}/fleet?tab=offboarding`}
                target="_blank"
                rel="noreferrer"
                style={linkButtonStyle("danger")}
              >
                {listT(locale, "banner.supplyEmergency.action")}
                <CanvasIcon name="ext" size={11} />
              </Link>
            }
          />
        ) : null}

        <div style={summaryGridStyle}>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {listT(locale, "summary.registered")}
            </span>
            <span style={summaryValueStyle}>{rows.length}</span>
            <span style={summaryFootStyle}>
              {listT(locale, "summary.registeredSub")}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {listT(locale, "summary.dispatchable")}
            </span>
            <span style={{ ...summaryValueStyle, color: theme.success }}>
              {dispatchableCount}
            </span>
            <span style={summaryFootStyle}>
              {listT(locale, "summary.dispatchableSub")}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {listT(locale, "summary.maintenance")}
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
              {listT(locale, "summary.maintenanceSub")}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {listT(locale, "summary.boundDrivers")}
            </span>
            <span style={{ ...summaryValueStyle, color: theme.info }}>
              {boundCount}
            </span>
            <span style={summaryFootStyle}>
              {listT(locale, "summary.boundDriversSub")}
            </span>
          </div>
        </div>

        <Card
          theme={theme}
          title={listT(locale, "filter.title")}
          subtitle={listT(locale, "filter.subtitle")}
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
                  {t("common.search", locale)}
                </span>
                <input
                  name="q"
                  defaultValue={filters.q}
                  placeholder={listT(locale, "filter.searchPlaceholder")}
                  style={fieldStyle}
                />
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {t("common.status", locale)}
                </span>
                <select
                  name="status"
                  defaultValue={filters.status}
                  style={fieldStyle}
                >
                  <option value="all">{t("common.all", locale)}</option>
                  <option value="active">
                    {listT(locale, "filter.status.active")}
                  </option>
                  <option value="attention">
                    {listT(locale, "filter.status.attention")}
                  </option>
                  <option value="blocked">
                    {listT(locale, "filter.status.blocked")}
                  </option>
                  <option value="offboarding">
                    {listT(locale, "filter.status.offboarding")}
                  </option>
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>{t("common.type", locale)}</span>
                <select
                  name="type"
                  defaultValue={filters.type}
                  style={fieldStyle}
                >
                  <option value="all">{t("common.all", locale)}</option>
                  {typeOptions.map((value) => (
                    <option key={value} value={value}>
                      {formatOpsCodeLabel(locale, value)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {listT(locale, "tab.dispatchable")}
                </span>
                <select
                  name="dispatchable"
                  defaultValue={filters.dispatchable}
                  style={fieldStyle}
                >
                  <option value="all">{t("common.all", locale)}</option>
                  <option value="yes">
                    {t("vehicles.list.table.dispatchable.yes", locale)}
                  </option>
                  <option value="no">
                    {t("vehicles.list.table.dispatchable.no", locale)}
                  </option>
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {listT(locale, "filter.overdue")}
                </span>
                <select
                  name="overdue"
                  defaultValue={filters.overdue}
                  style={fieldStyle}
                >
                  <option value="all">{t("common.all", locale)}</option>
                  <option value="yes">{t("common.yes", locale)}</option>
                  <option value="no">{t("common.no", locale)}</option>
                </select>
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={buttonStyle("primary")}>
                  <CanvasIcon name="search" size={12} />
                  {listT(locale, "filter.apply")}
                </button>
                <Link href="/vehicles" style={buttonStyle("ghost")}>
                  {listT(locale, "filter.reset")}
                </Link>
              </div>
            </div>
          </form>

          <div style={helperRowStyle}>
            <span style={helperTextStyle}>
              {listT(locale, "helper.visible", {
                visible: displayedRows.length,
                total: rows.length,
              })}
            </span>
            <span style={{ ...helperTextStyle, ...monoTextStyle }}>
              {listT(locale, "helper.generated")} ·{" "}
              {formatLongDateTime(locale, refresh.generatedAt)} UTC
            </span>
            <span style={helperTextStyle}>
              {listT(locale, "helper.actionsHint")}
            </span>
          </div>
        </Card>

        <Card
          theme={theme}
          title={listT(locale, "table.title")}
          subtitle={listT(locale, "table.subtitle")}
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
                {listT(locale, "empty.reasonLabel")} ·{" "}
                {EMPTY_OVERRIDE_REASON_CODES[emptyReason ?? "no_data"]}
              </span>
            </div>
          ) : (
            <VehiclesTable
              locale={locale}
              rows={displayedRows}
              appOrigins={appOrigins}
            />
          )}
        </Card>
      </div>
    </>
  );
}
