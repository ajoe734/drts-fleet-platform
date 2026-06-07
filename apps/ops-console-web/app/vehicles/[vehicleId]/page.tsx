import Link from "next/link";
import { headers } from "next/headers";
import type { CSSProperties, ReactNode } from "react";
import type {
  AuditLogRecord,
  CrossAppResourceLink,
  DriverRegistryRecord,
  DriverTaskRecord,
  EmptyReason,
  IncidentRecord,
  MaintenanceRecord,
  RefreshTier,
  ResourceActionDescriptor,
  ShiftRecord,
  UiRefreshMetadata,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { isMaintenanceOverdue } from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import {
  CanvasActivityFeed,
  CanvasEmptyPanel,
  type CanvasActivityItem,
} from "@/lib/canvas-workflow";

type VehicleDetailPageProps = {
  params: Promise<{
    vehicleId: string;
  }>;
};

type LoadResult<T> = {
  data: T;
  error: string | null;
};

type RuntimeEmptyState = {
  reason: EmptyReason;
  messageCode?: string;
  nextAction?: ResourceActionDescriptor | null;
};

type RuntimeListEnvelope<T> =
  | T[]
  | {
      items?: T[];
      refresh?: UiRefreshMetadata | null;
      emptyState?: RuntimeEmptyState | null;
    };

type RuntimeListResult<T> = {
  items: T[];
  error: string | null;
  refresh: UiRefreshMetadata | null;
  emptyState: RuntimeEmptyState | null;
};

type RuntimeActionRecord<T> = T & {
  availableActions?: ResourceActionDescriptor[];
  refresh?: UiRefreshMetadata | null;
};

type VehicleBinding = {
  driver: DriverRegistryRecord | null;
  source: "task" | "shift";
  statusCode: string;
  bindingId: string;
  boundAt: string | null;
};

type VehicleAction = {
  descriptor: ResourceActionDescriptor;
  label: string;
  icon?: "arrow" | "check" | "ext" | "filter" | "plus" | "users" | "warn" | "x";
  href?: string;
  openInNewTab?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

type MaintenanceRow = Record<string, unknown> & {
  id: ReactNode;
  kind: string;
  status: string;
  scheduled: string;
  overdue: boolean;
};

type ContractRow = Record<string, unknown> & {
  id: ReactNode;
  partner: string;
  type: string;
  term: string;
  status: string;
  expiringSoon: boolean;
};

type IncidentRow = Record<string, unknown> & {
  id: ReactNode;
  title: string;
  severity: string;
  status: string;
  updated: string;
};

type VehicleActionContext = {
  currentBinding: VehicleBinding | null;
  platformAdminHref: string | undefined;
  primaryContractId: string | undefined;
  primaryIncidentId: string | undefined;
  vehicleId: string;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_STALE_AFTER_MS = 15_000;
const ACTIVE_DRIVER_TASK_STATUSES = new Set<DriverTaskRecord["status"]>([
  "pending_acceptance",
  "accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

const pageBodyStyle: CSSProperties = {
  padding: "24px",
  display: "grid",
  gap: "16px",
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
  gap: "16px",
};

const columnStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

function detailT(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
) {
  return t(`vehicles.detail.${key}`, locale, params);
}

function normalizeOrigin(value: string | null | undefined) {
  return value ? value.replace(/\/+$/, "") : null;
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
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

function formatDateOnly(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatList(locale: Locale, values: readonly string[]) {
  if (values.length === 0) {
    return "—";
  }

  return values
    .map((value) => formatOpsCodeLabel(locale, value))
    .join(locale === "zh" ? "、" : ", ");
}

function getVehicleTypeLabel(locale: Locale, vehicle: VehicleRegistryRecord) {
  return formatList(locale, vehicle.supportedServiceBuckets);
}

function summarizeBlockedReasons(
  locale: Locale,
  vehicle: VehicleRegistryRecord,
): string {
  const reasons = vehicle.supplyLifecycle.dispatch.blockedReasons;
  if (reasons.length === 0) {
    return detailT(locale, "label.noBlockers");
  }

  return reasons
    .map((reason: string) => formatOpsCodeLabel(locale, reason))
    .join(" · ");
}

function getPrimaryVehicleStatusCode(vehicle: VehicleRegistryRecord) {
  if (vehicle.supplyLifecycle.offboarding.status !== "none") {
    return vehicle.supplyLifecycle.offboarding.status;
  }

  if (!vehicle.dispatchableFlag) {
    return (
      vehicle.supplyLifecycle.dispatch.blockedReasons[0] ?? "not_dispatchable"
    );
  }

  if (vehicle.insuranceStatus === "expired") {
    return "expired";
  }

  return "active";
}

function getPillTone(
  tone: "success" | "warn" | "danger" | "info" | "neutral",
): CanvasTone {
  return tone;
}

function getVehicleStatusTone(vehicle: VehicleRegistryRecord): CanvasTone {
  if (vehicle.supplyLifecycle.offboarding.status !== "none") {
    return "warn";
  }
  if (!vehicle.dispatchableFlag || vehicle.insuranceStatus === "expired") {
    return "danger";
  }
  return "success";
}

function classifyErrorReason(error: string): EmptyReason {
  const lower = error.toLowerCase();
  if (
    lower.includes("permission") ||
    lower.includes("forbidden") ||
    lower.includes("403") ||
    lower.includes("401")
  ) {
    return "permission_denied";
  }
  if (
    lower.includes("external") ||
    lower.includes("unavailable") ||
    lower.includes("timeout") ||
    lower.includes("gateway") ||
    lower.includes("adapter")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function emptyTone(reason: EmptyReason): CanvasTone {
  if (reason === "fetch_failed") return "danger";
  if (
    reason === "permission_denied" ||
    reason === "external_unavailable" ||
    reason === "not_provisioned"
  ) {
    return "warn";
  }
  return "neutral";
}

function emptyIcon(reason: EmptyReason) {
  if (reason === "no_data") return "check" as const;
  if (reason === "not_provisioned") return "plus" as const;
  if (reason === "fetch_failed") return "x" as const;
  if (reason === "permission_denied") return "warn" as const;
  if (reason === "external_unavailable") return "warn" as const;
  return "filter" as const;
}

function emptyTitle(locale: Locale, reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return detailT(locale, "empty.noRecords");
    case "not_provisioned":
      return detailT(locale, "empty.notProvisioned");
    case "fetch_failed":
      return detailT(locale, "empty.snapshotUnavailable");
    case "permission_denied":
      return detailT(locale, "empty.permissionRequired");
    case "external_unavailable":
      return detailT(locale, "empty.externalUnavailable");
    case "filtered_empty":
      return detailT(locale, "empty.filteredEmpty");
    default:
      return detailT(locale, "empty.noRecords");
  }
}

function defaultEmptyDescription(locale: Locale, reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return detailT(locale, "empty.body.noData");
    case "not_provisioned":
      return detailT(locale, "empty.body.notProvisioned");
    case "fetch_failed":
      return detailT(locale, "empty.body.fetchFailed");
    case "permission_denied":
      return detailT(locale, "empty.body.permissionDenied");
    case "external_unavailable":
      return detailT(locale, "empty.body.externalUnavailable");
    case "filtered_empty":
      return detailT(locale, "empty.body.filteredEmpty");
    default:
      return detailT(locale, "empty.body.default");
  }
}

function actionStyle(
  themeValue: CanvasTheme,
  descriptor: ResourceActionDescriptor,
  variant: "primary" | "secondary" | "ghost" = "secondary",
  disabled = false,
): CSSProperties {
  if (descriptor.riskLevel === "high") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "5px 10px",
      height: "28px",
      borderRadius: "7px",
      border: `1px solid ${themeValue.danger}`,
      background: themeValue.danger,
      color: "#fff",
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      fontFamily: themeValue.fontFamily,
    };
  }

  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "5px 10px",
      height: "28px",
      borderRadius: "7px",
      border: `1px solid ${themeValue.accent}`,
      background: themeValue.accent,
      color: "#fff",
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      fontFamily: themeValue.fontFamily,
    };
  }

  if (variant === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "5px 10px",
      height: "28px",
      borderRadius: "7px",
      border: "1px solid transparent",
      background: "transparent",
      color: themeValue.textMuted,
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      fontFamily: themeValue.fontFamily,
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 10px",
    height: "28px",
    borderRadius: "7px",
    border: `1px solid ${themeValue.border}`,
    background: themeValue.surface,
    color: themeValue.text,
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    fontFamily: themeValue.fontFamily,
  };
}

function renderVehicleAction(action: VehicleAction) {
  const disabled = !action.descriptor.enabled || !action.href;
  const href = action.href;
  const content = (
    <>
      {action.icon ? <CanvasIcon name={action.icon} size={13} /> : null}
      <span>{action.label}</span>
    </>
  );
  const style = actionStyle(
    theme,
    action.descriptor,
    action.variant ?? "secondary",
    disabled,
  );
  const title = disabled
    ? (action.descriptor.disabledReasonCode ?? action.descriptor.action)
    : action.label;

  if (disabled || !href) {
    return (
      <button
        key={action.descriptor.action}
        type="button"
        disabled
        title={title}
        style={style}
      >
        {content}
      </button>
    );
  }

  if (action.openInNewTab && href) {
    return (
      <a
        key={action.descriptor.action}
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title}
        style={style}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      key={action.descriptor.action}
      href={href}
      prefetch={false}
      title={title}
      style={style}
    >
      {content}
    </Link>
  );
}

function renderEmptyState(
  locale: Locale,
  reason: EmptyReason,
  messageOverride?: string,
  action?: VehicleAction,
) {
  return (
    <CanvasEmptyPanel
      theme={theme}
      title={
        <span
          style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}
        >
          <span>{emptyTitle(locale, reason)}</span>
          <span
            style={{ ...monoStyle, fontSize: "11px", color: theme.textDim }}
          >
            {reason}
          </span>
        </span>
      }
      description={messageOverride ?? defaultEmptyDescription(locale, reason)}
      tone={emptyTone(reason)}
      density="compact"
      icon={<CanvasIcon name={emptyIcon(reason)} size={22} />}
      actions={action ? <div>{renderVehicleAction(action)}</div> : undefined}
    />
  );
}

async function resolveWithFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
  locale: Locale,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: fallback,
      error:
        error instanceof Error
          ? error.message
          : detailT(locale, "label.unknownError"),
    };
  }
}

async function resolveListWithFallback<T>(
  loader: () => Promise<RuntimeListEnvelope<T>>,
  locale: Locale,
): Promise<RuntimeListResult<T>> {
  try {
    const payload = await loader();
    if (Array.isArray(payload)) {
      return {
        items: payload,
        error: null,
        refresh: null,
        emptyState: null,
      };
    }

    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      error: null,
      refresh: payload.refresh ?? null,
      emptyState: payload.emptyState ?? null,
    };
  } catch (error) {
    return {
      items: [],
      error:
        error instanceof Error
          ? error.message
          : detailT(locale, "label.unknownError"),
      refresh: null,
      emptyState: null,
    };
  }
}

function latestTaskTimestamp(task: DriverTaskRecord) {
  return (
    task.startedAt ??
    task.arrivedPickupAt ??
    task.departedAt ??
    task.acceptedAt ??
    task.completedAt ??
    ""
  );
}

function pickCurrentBinding(
  vehicleId: string,
  drivers: DriverRegistryRecord[],
  tasks: DriverTaskRecord[],
  shifts: ShiftRecord[],
): VehicleBinding | null {
  const activeTask = [...tasks]
    .filter(
      (task) =>
        task.vehicleId === vehicleId &&
        ACTIVE_DRIVER_TASK_STATUSES.has(task.status),
    )
    .sort((left, right) =>
      latestTaskTimestamp(right).localeCompare(latestTaskTimestamp(left)),
    )[0];

  if (activeTask) {
    return {
      driver:
        drivers.find(
          (candidate) => candidate.driverId === activeTask.driverId,
        ) ?? null,
      source: "task",
      statusCode: activeTask.status,
      bindingId: activeTask.taskId,
      boundAt: latestTaskTimestamp(activeTask),
    };
  }

  const activeShift = [...shifts]
    .filter(
      (shift) => shift.vehicleId === vehicleId && shift.status === "active",
    )
    .sort((left, right) =>
      right.clockedInAt.localeCompare(left.clockedInAt),
    )[0];

  if (!activeShift) {
    return null;
  }

  return {
    driver:
      drivers.find(
        (candidate) => candidate.driverId === activeShift.driverId,
      ) ?? null,
    source: "shift",
    statusCode: activeShift.status,
    bindingId: activeShift.shiftId,
    boundAt: activeShift.clockedInAt,
  };
}

function resolvePlatformAdminOrigin(requestHeaders: Headers) {
  const explicit = normalizeOrigin(
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN ??
      process.env.PLATFORM_ADMIN_ORIGIN ??
      process.env.DEV_PLATFORM_ADMIN_ORIGIN ??
      process.env.STAGING_PLATFORM_ADMIN_ORIGIN ??
      process.env.PROD_PLATFORM_ADMIN_ORIGIN,
  );
  if (explicit) {
    return explicit;
  }

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) {
    return null;
  }

  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");

  try {
    const origin = new URL(`${proto}://${host}`);
    if (origin.hostname === "localhost" && origin.port === "3003") {
      origin.port = "3002";
      return origin.origin;
    }
    if (origin.hostname.startsWith("ops.")) {
      origin.hostname = origin.hostname.slice(4);
      return origin.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function buildCrossAppHref(origin: string, link: CrossAppResourceLink) {
  const route = link.route.startsWith("/") ? link.route : `/${link.route}`;
  return `${origin}${route}`;
}

function buildFallbackRefreshMetadata(hasErrors: boolean): UiRefreshMetadata {
  return {
    generatedAt: "",
    staleAfterMs: REFRESH_STALE_AFTER_MS,
    dataFreshness: hasErrors ? "degraded" : "unknown",
    source: "static",
  };
}

function pickRefreshMetadata(
  ...candidates: Array<UiRefreshMetadata | null | undefined>
): UiRefreshMetadata | null {
  return candidates.find((candidate) => candidate != null) ?? null;
}

function hasRefreshAttention(metadata: UiRefreshMetadata | null | undefined) {
  return metadata != null && metadata.dataFreshness !== "fresh";
}

function getEmptyStateMessage(
  locale: Locale,
  emptyState: RuntimeEmptyState | null | undefined,
  fallbackMessage: string,
) {
  if (!emptyState?.messageCode) {
    return fallbackMessage;
  }

  return formatOpsCodeLabel(locale, emptyState.messageCode);
}

function buildRefreshBannerBody(
  locale: Locale,
  metadata: UiRefreshMetadata,
  degradedSections: string[],
) {
  const freshnessLabel = formatOpsCodeLabel(locale, metadata.dataFreshness);
  const sectionSummary =
    degradedSections.length > 0
      ? detailT(locale, "refresh.sectionSummary", {
          sections:
            locale === "en"
              ? degradedSections.join(", ")
              : degradedSections.join("、"),
        })
      : detailT(locale, "refresh.sectionLoaded");
  const snapshotSummary = metadata.generatedAt
    ? detailT(locale, "refresh.generated", {
        value: formatDateTime(locale, metadata.generatedAt),
      })
    : detailT(locale, "refresh.metadataUnavailable");

  return [
    detailT(locale, "refresh.cadence", {
      source: metadata.source,
      freshness: freshnessLabel,
    }),
    snapshotSummary,
    sectionSummary,
  ].join(" · ");
}

function findPageAction(
  actions: VehicleAction[],
  predicate: (action: VehicleAction) => boolean,
) {
  return actions.find(predicate);
}

function buildVehicleActionFromDescriptor(
  locale: Locale,
  descriptor: ResourceActionDescriptor,
  context: VehicleActionContext,
): VehicleAction {
  const actionCode = descriptor.action.toLowerCase();

  if (actionCode === "refresh") {
    return {
      descriptor,
      label: detailT(locale, "action.refresh"),
      icon: "arrow",
      href: `/vehicles/${encodeURIComponent(context.vehicleId)}`,
      variant: "secondary",
    };
  }

  if (actionCode.includes("maintenance")) {
    return {
      descriptor,
      label: detailT(locale, "action.openMaintenance"),
      icon: "ext",
      href: `/maintenance?vehicleId=${encodeURIComponent(context.vehicleId)}`,
      variant: "secondary",
    };
  }

  if (actionCode.includes("driver")) {
    return {
      descriptor,
      label: detailT(locale, "action.openCurrentDriver"),
      icon: "users",
      ...(context.currentBinding?.driver?.driverId
        ? {
            href: `/drivers/${encodeURIComponent(context.currentBinding.driver.driverId)}`,
          }
        : {}),
      variant: "secondary",
    };
  }

  if (actionCode.includes("contract")) {
    return {
      descriptor,
      label: detailT(locale, "action.openContract"),
      icon: "ext",
      ...(context.primaryContractId
        ? {
            href: `/contracts/${encodeURIComponent(context.primaryContractId)}`,
          }
        : {}),
      variant: "secondary",
    };
  }

  if (actionCode.includes("incident")) {
    return {
      descriptor,
      label: detailT(locale, "action.openIncident"),
      icon: "warn",
      ...(context.primaryIncidentId
        ? {
            href: `/incidents/${encodeURIComponent(context.primaryIncidentId)}`,
          }
        : { href: "/incidents" }),
      variant: "secondary",
    };
  }

  if (
    actionCode.includes("offboarding") ||
    actionCode.includes("platform_admin") ||
    actionCode.includes("fleet")
  ) {
    return {
      descriptor,
      label: detailT(locale, "action.platformAdminFleet"),
      icon: "ext",
      ...(context.platformAdminHref ? { href: context.platformAdminHref } : {}),
      openInNewTab: true,
      variant: "primary",
    };
  }

  if (actionCode.includes("registry")) {
    return {
      descriptor,
      label: detailT(locale, "action.backToRegistry"),
      icon: "arrow",
      href: "/vehicles",
      variant: "ghost",
    };
  }

  if (actionCode.includes("note")) {
    return {
      descriptor,
      label: detailT(locale, "action.addOpsNote"),
      icon: "plus",
      variant: "secondary",
    };
  }

  return {
    descriptor,
    label: formatOpsCodeLabel(locale, descriptor.action),
    variant: "secondary",
  };
}

function formatPartnerLabel(contract: VehicleContractRecord) {
  return [contract.partnerId, contract.partnerType].filter(Boolean).join(" · ");
}

function isContractExpiringSoon(contract: VehicleContractRecord) {
  const endAt = new Date(contract.endAt).getTime();
  if (!Number.isFinite(endAt)) {
    return false;
  }

  return endAt <= Date.now() + 30 * 24 * 60 * 60 * 1000;
}

function buildAuditActivityItems(
  locale: Locale,
  entries: AuditLogRecord[],
): CanvasActivityItem[] {
  return entries.map((entry) => ({
    id: entry.auditId,
    title: formatOpsCodeLabel(locale, entry.actionName),
    detail: [entry.moduleName, entry.resourceType, entry.resourceId]
      .filter(Boolean)
      .join(" · "),
    timestamp: formatDateTime(locale, entry.createdAt),
    tone:
      entry.actionName.includes("offboarding") ||
      entry.actionName.includes("reject")
        ? "warn"
        : entry.actionName.includes("create") ||
            entry.actionName.includes("activate")
          ? "success"
          : "accent",
    eyebrow: entry.actorId ?? entry.actorType,
    supportingContent: (
      <span style={{ ...monoStyle, fontSize: "11px", color: theme.textDim }}>
        {entry.requestId}
      </span>
    ),
  }));
}

function collectVehicleAuditEntries(
  vehicleId: string,
  audits: AuditLogRecord[],
  contracts: VehicleContractRecord[],
  maintenance: MaintenanceRecord[],
  vehicle: VehicleRegistryRecord,
): AuditLogRecord[] {
  const relatedIds = new Set<string>([
    vehicleId,
    vehicle.supplyLifecycle.contract.contractId ?? "",
    vehicle.supplyLifecycle.insurance.policyId ?? "",
    ...contracts.map((entry) => entry.contractId),
    ...maintenance.map((entry) => entry.maintenanceId),
  ]);

  return audits
    .filter((entry) => {
      if (entry.resourceId && relatedIds.has(entry.resourceId)) {
        return true;
      }
      const newVehicleId = entry.newValuesSummary?.vehicleId;
      const oldVehicleId = entry.oldValuesSummary?.vehicleId;
      return newVehicleId === vehicleId || oldVehicleId === vehicleId;
    })
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .slice(0, 8);
}

function sectionErrorLabel(locale: Locale, key: string) {
  switch (key) {
    case "drivers":
      return detailT(locale, "section.driverBinding");
    case "maintenance":
      return detailT(locale, "section.maintenance");
    case "contracts":
      return detailT(locale, "section.contracts");
    case "incidents":
      return detailT(locale, "section.incidents");
    case "audit":
      return detailT(locale, "section.audit");
    default:
      return key;
  }
}

export default async function VehicleDetailPage({
  params,
}: VehicleDetailPageProps) {
  const [{ vehicleId }, locale, client, requestHeaders] = await Promise.all([
    params,
    getServerLocale(),
    getServerOpsClient(),
    headers(),
  ]);

  const platformAdminOrigin = resolvePlatformAdminOrigin(requestHeaders);
  const [
    vehiclesResult,
    driversResult,
    tasksResult,
    shiftsResult,
    maintenanceResult,
    contractsResult,
    incidentsResult,
    auditsResult,
  ] = await Promise.all([
    resolveListWithFallback<RuntimeActionRecord<VehicleRegistryRecord>>(
      () =>
        client.get<
          RuntimeListEnvelope<RuntimeActionRecord<VehicleRegistryRecord>>
        >("/api/regulatory-registry/vehicles"),
      locale,
    ),
    resolveWithFallback<DriverRegistryRecord[]>(
      () => client.listDrivers(),
      [] as DriverRegistryRecord[],
      locale,
    ),
    resolveWithFallback<DriverTaskRecord[]>(
      () => client.listDriverTasks(),
      [] as DriverTaskRecord[],
      locale,
    ),
    resolveWithFallback<ShiftRecord[]>(
      () => client.listShifts(),
      [] as ShiftRecord[],
      locale,
    ),
    resolveListWithFallback<RuntimeActionRecord<MaintenanceRecord>>(
      () =>
        client.get<RuntimeListEnvelope<RuntimeActionRecord<MaintenanceRecord>>>(
          `/api/maintenance?vehicleId=${encodeURIComponent(vehicleId)}`,
        ),
      locale,
    ),
    resolveListWithFallback<RuntimeActionRecord<VehicleContractRecord>>(
      () =>
        client.get<
          RuntimeListEnvelope<RuntimeActionRecord<VehicleContractRecord>>
        >("/api/regulatory-registry/contracts"),
      locale,
    ),
    resolveListWithFallback<RuntimeActionRecord<IncidentRecord>>(
      () =>
        client.get<RuntimeListEnvelope<RuntimeActionRecord<IncidentRecord>>>(
          "/api/incidents",
        ),
      locale,
    ),
    resolveListWithFallback<RuntimeActionRecord<AuditLogRecord>>(
      () =>
        client.get<RuntimeListEnvelope<RuntimeActionRecord<AuditLogRecord>>>(
          "/api/audit",
        ),
      locale,
    ),
  ]);

  const vehicle = vehiclesResult.items.find(
    (candidate) => candidate.vehicleId === vehicleId,
  );

  if (vehiclesResult.error) {
    const reason = classifyErrorReason(vehiclesResult.error);
    const refreshAction: VehicleAction = {
      descriptor: { action: "refresh", enabled: true, riskLevel: "low" },
      label: detailT(locale, "action.retryVehicleSnapshot"),
      icon: "arrow",
      href: `/vehicles/${encodeURIComponent(vehicleId)}`,
    };

    return (
      <>
        <PageHeader
          theme={theme}
          title={detailT(locale, "title")}
          subtitle={`${vehicleId} · ${detailT(locale, "subtitle.registryFetchFailed")}`}
          actions={renderVehicleAction(refreshAction)}
        />
        <div style={pageBodyStyle}>
          {renderEmptyState(
            locale,
            reason,
            getEmptyStateMessage(
              locale,
              vehiclesResult.emptyState,
              vehiclesResult.error,
            ),
            refreshAction,
          )}
        </div>
      </>
    );
  }

  if (!vehicle) {
    const backAction: VehicleAction = {
      descriptor: { action: "open_registry", enabled: true, riskLevel: "low" },
      label: detailT(locale, "action.backToRegistry"),
      href: "/vehicles",
    };

    return (
      <>
        <PageHeader
          theme={theme}
          title={detailT(locale, "title.notFound")}
          subtitle={vehicleId}
          actions={renderVehicleAction(backAction)}
        />
        <div style={pageBodyStyle}>
          {renderEmptyState(
            locale,
            vehiclesResult.emptyState?.reason ?? "no_data",
            getEmptyStateMessage(
              locale,
              vehiclesResult.emptyState,
              detailT(locale, "body.notFound"),
            ),
            backAction,
          )}
        </div>
      </>
    );
  }

  const relatedMaintenance = [...maintenanceResult.items].sort((left, right) =>
    (right.scheduledAt ?? right.updatedAt).localeCompare(
      left.scheduledAt ?? left.updatedAt,
    ),
  );
  const relatedContracts = contractsResult.items
    .filter((entry) => entry.vehicleId === vehicleId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const relatedIncidents = incidentsResult.items
    .filter((entry) => entry.relatedVehicleId === vehicleId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const currentBinding = pickCurrentBinding(
    vehicleId,
    driversResult.data,
    tasksResult.data,
    shiftsResult.data,
  );
  const overdueMaintenanceCount = relatedMaintenance.filter((entry) =>
    isMaintenanceOverdue(entry),
  ).length;
  const degradedSections = [
    driversResult.error ? sectionErrorLabel(locale, "drivers") : null,
    maintenanceResult.error || hasRefreshAttention(maintenanceResult.refresh)
      ? sectionErrorLabel(locale, "maintenance")
      : null,
    contractsResult.error || hasRefreshAttention(contractsResult.refresh)
      ? sectionErrorLabel(locale, "contracts")
      : null,
    incidentsResult.error || hasRefreshAttention(incidentsResult.refresh)
      ? sectionErrorLabel(locale, "incidents")
      : null,
    auditsResult.error || hasRefreshAttention(auditsResult.refresh)
      ? sectionErrorLabel(locale, "audit")
      : null,
  ].filter((entry): entry is string => Boolean(entry));
  const refreshMetadata =
    pickRefreshMetadata(
      vehicle.refresh,
      vehiclesResult.refresh,
      maintenanceResult.refresh,
      contractsResult.refresh,
      incidentsResult.refresh,
      auditsResult.refresh,
    ) ?? buildFallbackRefreshMetadata(degradedSections.length > 0);

  const platformAdminLink: CrossAppResourceLink = {
    targetApp: "platform-admin",
    route: `/fleet?vehicleId=${encodeURIComponent(vehicle.vehicleId)}&tab=offboarding`,
    resourceType: "vehicle",
    resourceId: vehicle.vehicleId,
    openMode: "new_tab",
    label: detailT(locale, "link.openOffboarding"),
  };
  const platformAdminHref = platformAdminOrigin
    ? buildCrossAppHref(platformAdminOrigin, platformAdminLink)
    : undefined;

  const refreshPageAction: VehicleAction = {
    descriptor: { action: "refresh", enabled: true, riskLevel: "low" },
    label: detailT(locale, "action.refresh"),
    icon: "arrow",
    href: `/vehicles/${encodeURIComponent(vehicle.vehicleId)}`,
    variant: "secondary",
  };
  const maintenancePageAction: VehicleAction = {
    descriptor: {
      action: "open_maintenance",
      enabled: true,
      riskLevel: "low",
    },
    label: detailT(locale, "action.openMaintenance"),
    icon: "ext",
    href: `/maintenance?vehicleId=${encodeURIComponent(vehicle.vehicleId)}`,
    variant: "secondary",
  };
  const fallbackDriverAction: VehicleAction = {
    descriptor: {
      action: "open_driver",
      enabled: Boolean(currentBinding?.driver?.driverId),
      disabledReasonCode: currentBinding
        ? "driver_record_missing"
        : "driver_binding_missing",
      riskLevel: "low",
    },
    label: detailT(locale, "action.openCurrentDriver"),
    icon: "users",
    ...(currentBinding?.driver?.driverId
      ? {
          href: `/drivers/${encodeURIComponent(currentBinding.driver.driverId)}`,
        }
      : {}),
    variant: "secondary",
  };
  const fallbackOffboardingAction: VehicleAction = {
    descriptor: {
      action: "open_platform_admin_offboarding",
      enabled:
        Boolean(platformAdminHref) &&
        (vehicle.supplyLifecycle.offboarding.status !== "none" ||
          vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending"),
      disabledReasonCode:
        platformAdminOrigin === null
          ? "platform_admin_origin_unresolved"
          : "offboarding_inactive",
      riskLevel: "medium",
    },
    label: detailT(locale, "action.platformAdminFleet"),
    icon: "ext",
    ...(platformAdminHref ? { href: platformAdminHref } : {}),
    openInNewTab: true,
    variant: "primary",
  };
  const fallbackPageActions: VehicleAction[] = [
    refreshPageAction,
    fallbackDriverAction,
    fallbackOffboardingAction,
    {
      descriptor: {
        action: "add_ops_note",
        enabled: false,
        disabledReasonCode: "ops_note_endpoint_pending",
        riskLevel: "medium",
      },
      label: detailT(locale, "action.addOpsNote"),
      icon: "plus",
      variant: "secondary",
    },
  ];
  const runtimeActionContext: VehicleActionContext = {
    currentBinding,
    platformAdminHref,
    primaryContractId:
      relatedContracts[0]?.contractId ??
      vehicle.supplyLifecycle.contract.contractId ??
      undefined,
    primaryIncidentId: relatedIncidents[0]?.incidentId,
    vehicleId: vehicle.vehicleId,
  };
  const runtimePageActions = Array.isArray(vehicle.availableActions)
    ? vehicle.availableActions.map((descriptor) =>
        buildVehicleActionFromDescriptor(
          locale,
          descriptor,
          runtimeActionContext,
        ),
      )
    : null;
  const pageActions =
    runtimePageActions == null
      ? fallbackPageActions
      : [
          refreshPageAction,
          ...runtimePageActions.filter(
            (action) => action.descriptor.action.toLowerCase() !== "refresh",
          ),
        ];
  const driverBindingAction =
    findPageAction(pageActions, (action) =>
      action.descriptor.action.toLowerCase().includes("driver"),
    ) ?? fallbackDriverAction;
  const offboardingPageAction =
    findPageAction(pageActions, (action) => {
      const actionCode = action.descriptor.action.toLowerCase();
      return (
        actionCode.includes("offboarding") ||
        actionCode.includes("platform_admin") ||
        actionCode.includes("fleet")
      );
    }) ?? fallbackOffboardingAction;
  const maintenanceEmptyAction = maintenanceResult.emptyState?.nextAction
    ? buildVehicleActionFromDescriptor(
        locale,
        maintenanceResult.emptyState.nextAction,
        runtimeActionContext,
      )
    : maintenancePageAction;
  const contractEmptyAction = contractsResult.emptyState?.nextAction
    ? buildVehicleActionFromDescriptor(
        locale,
        contractsResult.emptyState.nextAction,
        runtimeActionContext,
      )
    : undefined;
  const incidentEmptyAction = incidentsResult.emptyState?.nextAction
    ? buildVehicleActionFromDescriptor(
        locale,
        incidentsResult.emptyState.nextAction,
        runtimeActionContext,
      )
    : undefined;
  const auditEmptyAction = auditsResult.emptyState?.nextAction
    ? buildVehicleActionFromDescriptor(
        locale,
        auditsResult.emptyState.nextAction,
        runtimeActionContext,
      )
    : undefined;

  const maintenanceRows: MaintenanceRow[] = relatedMaintenance
    .slice(0, 5)
    .map((record) => ({
      id: (
        <Link
          href={`/maintenance?vehicleId=${encodeURIComponent(record.vehicleId)}`}
          prefetch={false}
          style={{ color: theme.text, textDecoration: "none", ...monoStyle }}
        >
          {record.maintenanceId}
        </Link>
      ),
      kind: formatOpsCodeLabel(locale, record.type),
      status: formatOpsCodeLabel(
        locale,
        isMaintenanceOverdue(record) ? "overdue" : record.status,
      ),
      scheduled: formatDateTime(locale, record.scheduledAt ?? record.updatedAt),
      overdue: isMaintenanceOverdue(record),
    }));

  const maintenanceColumns: CanvasTableColumn<MaintenanceRow>[] = [
    { h: detailT(locale, "col.workOrder"), k: "id", w: 120, mono: true },
    {
      h: detailT(locale, "col.typeShort"),
      k: "kind",
      w: 200,
    },
    {
      h: detailT(locale, "col.status"),
      w: 140,
      r: (row) => (
        <Pill
          theme={theme}
          tone={getPillTone(
            row.overdue
              ? "danger"
              : row.status === formatOpsCodeLabel(locale, "completed")
                ? "success"
                : "warn",
          )}
          dot
        >
          {row.status}
        </Pill>
      ),
    },
    {
      h: detailT(locale, "col.scheduled"),
      k: "scheduled",
      mono: true,
    },
  ];

  const contractRows: ContractRow[] = relatedContracts.map((record) => ({
    id: (
      <Link
        href={`/contracts/${encodeURIComponent(record.contractId)}`}
        prefetch={false}
        style={{ color: theme.text, textDecoration: "none", ...monoStyle }}
      >
        {record.contractId}
      </Link>
    ),
    partner: formatPartnerLabel(record),
    type: formatOpsCodeLabel(locale, record.contractType),
    term: `${formatDateOnly(locale, record.startAt)} → ${formatDateOnly(
      locale,
      record.endAt,
    )}`,
    status: formatOpsCodeLabel(locale, record.lifecycleStatus),
    expiringSoon: isContractExpiringSoon(record),
  }));

  const contractColumns: CanvasTableColumn<ContractRow>[] = [
    { h: detailT(locale, "col.contract"), k: "id", w: 130, mono: true },
    { h: detailT(locale, "col.counterparty"), k: "partner", w: 220 },
    { h: detailT(locale, "col.type"), k: "type", w: 180 },
    { h: detailT(locale, "col.term"), k: "term", mono: true, w: 200 },
    {
      h: detailT(locale, "col.status"),
      w: 130,
      r: (row) => (
        <Pill theme={theme} tone={row.expiringSoon ? "warn" : "success"} dot>
          {row.status}
        </Pill>
      ),
    },
  ];

  const incidentRows: IncidentRow[] = relatedIncidents
    .slice(0, 5)
    .map((record) => ({
      id: (
        <Link
          href={`/incidents/${encodeURIComponent(record.incidentId)}`}
          prefetch={false}
          style={{ color: theme.text, textDecoration: "none", ...monoStyle }}
        >
          {record.incidentId}
        </Link>
      ),
      title: record.title,
      severity: formatOpsCodeLabel(locale, record.severity),
      status: formatOpsCodeLabel(locale, record.status),
      updated: formatDateTime(locale, record.updatedAt),
    }));

  const incidentColumns: CanvasTableColumn<IncidentRow>[] = [
    { h: detailT(locale, "col.incident"), k: "id", w: 120, mono: true },
    { h: detailT(locale, "col.title"), k: "title", w: 240 },
    {
      h: detailT(locale, "col.severity"),
      w: 120,
      r: (row) => (
        <Pill
          theme={theme}
          tone={
            row.severity === formatOpsCodeLabel(locale, "critical") ||
            row.severity === formatOpsCodeLabel(locale, "high")
              ? "danger"
              : "warn"
          }
          dot
        >
          {row.severity}
        </Pill>
      ),
    },
    {
      h: detailT(locale, "col.status"),
      w: 120,
      r: (row) => (
        <Pill
          theme={theme}
          tone={
            row.status === formatOpsCodeLabel(locale, "closed")
              ? "success"
              : "info"
          }
          dot
        >
          {row.status}
        </Pill>
      ),
    },
    { h: detailT(locale, "col.updated"), k: "updated", mono: true, w: 180 },
  ];

  const auditEntries = collectVehicleAuditEntries(
    vehicle.vehicleId,
    auditsResult.items,
    relatedContracts,
    relatedMaintenance,
    vehicle,
  );
  const auditActivity = buildAuditActivityItems(locale, auditEntries);

  const regulatoryItems = [
    {
      k: detailT(locale, "field.vehicleId"),
      v: vehicle.vehicleId,
      mono: true,
    },
    {
      k: detailT(locale, "field.plate"),
      v: vehicle.plateNo,
      mono: true,
    },
    {
      k: detailT(locale, "field.type"),
      v: getVehicleTypeLabel(locale, vehicle),
    },
    {
      k: detailT(locale, "field.operatingArea"),
      v: vehicle.operatingArea,
      mono: true,
    },
    {
      k: detailT(locale, "field.dispatchable"),
      v: vehicle.dispatchableFlag
        ? detailT(locale, "value.yes")
        : detailT(locale, "value.no"),
      mono: true,
    },
    {
      k: detailT(locale, "field.primaryStatus"),
      v: formatOpsCodeLabel(locale, getPrimaryVehicleStatusCode(vehicle)),
      mono: true,
    },
    {
      k: detailT(locale, "field.dispatchBlockers"),
      v: summarizeBlockedReasons(locale, vehicle),
    },
    {
      k: detailT(locale, "field.insuranceExpiry"),
      v: formatDateOnly(locale, vehicle.supplyLifecycle.insurance.endAt),
      mono: true,
    },
    {
      k: detailT(locale, "field.vehicleLicense"),
      v: detailT(locale, "value.missingLicenseField"),
    },
    {
      k: detailT(locale, "field.contract"),
      v: vehicle.supplyLifecycle.contract.contractId ?? "—",
      mono: true,
    },
    {
      k: detailT(locale, "field.exclusivity"),
      v: formatOpsCodeLabel(
        locale,
        vehicle.supplyLifecycle.exclusivity.lifecycleStatus,
      ),
      mono: true,
    },
    {
      k: detailT(locale, "field.offboardingState"),
      v: formatOpsCodeLabel(locale, vehicle.supplyLifecycle.offboarding.status),
      mono: true,
    },
    {
      k: detailT(locale, "field.debrandDue"),
      v: formatDateOnly(
        locale,
        vehicle.supplyLifecycle.offboarding.debrandingDueAt,
      ),
      mono: true,
    },
    {
      k: detailT(locale, "field.lastLifecycleTrace"),
      v: vehicle.supplyLifecycle.lastTrace?.message ?? "—",
    },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                ...monoStyle,
                fontSize: "16px",
                color: theme.text,
                fontWeight: 700,
              }}
            >
              {vehicle.vehicleId}
            </span>
            <Pill theme={theme} tone={getVehicleStatusTone(vehicle)} dot>
              {formatOpsCodeLabel(locale, getPrimaryVehicleStatusCode(vehicle))}
            </Pill>
            <Pill
              theme={theme}
              tone={vehicle.dispatchableFlag ? "success" : "danger"}
            >
              {vehicle.dispatchableFlag
                ? detailT(locale, "value.dispatchable")
                : detailT(locale, "value.notDispatchable")}
            </Pill>
            {overdueMaintenanceCount > 0 ? (
              <Pill theme={theme} tone="danger">
                {detailT(locale, "badge.overdueMaintenance", {
                  count: overdueMaintenanceCount,
                })}
              </Pill>
            ) : null}
          </span>
        }
        subtitle={`${vehicle.plateNo} · ${getVehicleTypeLabel(locale, vehicle)} · ${vehicle.operatingArea}`}
        actions={
          <div style={actionRowStyle}>
            {pageActions.map((action) => renderVehicleAction(action))}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        <Banner
          theme={theme}
          tone={
            degradedSections.length > 0 ||
            refreshMetadata.dataFreshness !== "fresh"
              ? "warn"
              : "info"
          }
          icon={
            degradedSections.length > 0 ||
            refreshMetadata.dataFreshness !== "fresh"
              ? "warn"
              : "info"
          }
          title={detailT(locale, "banner.refreshTier", {
            tier: REFRESH_TIER,
          })}
          body={buildRefreshBannerBody(
            locale,
            refreshMetadata,
            degradedSections,
          )}
          actions={renderVehicleAction(refreshPageAction)}
        />

        {vehicle.supplyLifecycle.offboarding.status !== "none" ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={detailT(locale, "banner.offboarding.title")}
            body={[
              formatOpsCodeLabel(
                locale,
                vehicle.supplyLifecycle.offboarding.status,
              ),
              vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending"
                ? detailT(locale, "value.debrandingPending")
                : null,
              vehicle.supplyLifecycle.offboarding.debrandingDueAt
                ? detailT(locale, "banner.offboarding.debrandDue", {
                    date: formatDateOnly(
                      locale,
                      vehicle.supplyLifecycle.offboarding.debrandingDueAt,
                    ),
                  })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={renderVehicleAction(offboardingPageAction)}
          />
        ) : overdueMaintenanceCount > 0 ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={detailT(locale, "banner.maintenance.title")}
            body={detailT(locale, "banner.maintenance.body", {
              count: overdueMaintenanceCount,
            })}
          />
        ) : null}

        <div style={detailGridStyle}>
          <div style={columnStyle}>
            <Card
              theme={theme}
              title={detailT(locale, "card.regulatory")}
            >
              <DL theme={theme} cols={2} items={regulatoryItems} />
            </Card>

            <Card
              theme={theme}
              title={detailT(locale, "card.maintenance")}
              padding={0}
            >
              {maintenanceResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(maintenanceResult.error),
                  getEmptyStateMessage(
                    locale,
                    maintenanceResult.emptyState,
                    maintenanceResult.error,
                  ),
                  maintenanceEmptyAction,
                )
              ) : maintenanceRows.length > 0 ? (
                <Table
                  theme={theme}
                  columns={maintenanceColumns}
                  rows={maintenanceRows}
                />
              ) : (
                renderEmptyState(
                  locale,
                  maintenanceResult.emptyState?.reason ?? "no_data",
                  getEmptyStateMessage(
                    locale,
                    maintenanceResult.emptyState,
                    detailT(locale, "body.noMaintenance"),
                  ),
                  maintenanceEmptyAction,
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={detailT(locale, "card.contracts")}
              padding={0}
            >
              {contractsResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(contractsResult.error),
                  getEmptyStateMessage(
                    locale,
                    contractsResult.emptyState,
                    contractsResult.error,
                  ),
                  contractEmptyAction,
                )
              ) : contractRows.length > 0 ? (
                <Table
                  theme={theme}
                  columns={contractColumns}
                  rows={contractRows}
                />
              ) : (
                renderEmptyState(
                  locale,
                  contractsResult.emptyState?.reason ?? "not_provisioned",
                  getEmptyStateMessage(
                    locale,
                    contractsResult.emptyState,
                    detailT(locale, "body.noContracts"),
                  ),
                  contractEmptyAction,
                )
              )}
            </Card>
          </div>

          <div style={columnStyle}>
            <Card
              theme={theme}
              title={detailT(locale, "card.driverBinding")}
            >
              {driversResult.error ||
              tasksResult.error ||
              shiftsResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(
                    driversResult.error ??
                      tasksResult.error ??
                      shiftsResult.error ??
                      "",
                  ),
                  driversResult.error ??
                    tasksResult.error ??
                    shiftsResult.error ??
                    undefined,
                  driverBindingAction,
                )
              ) : currentBinding ? (
                <DL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: detailT(locale, "field.driver"),
                      v: currentBinding.driver?.driverId ? (
                        <Link
                          href={`/drivers/${encodeURIComponent(currentBinding.driver.driverId)}`}
                          prefetch={false}
                          style={{ color: theme.text, textDecoration: "none" }}
                        >
                          {currentBinding.driver.name} ·{" "}
                          <span style={monoStyle}>
                            {currentBinding.driver.driverId}
                          </span>
                        </Link>
                      ) : (
                        "—"
                      ),
                    },
                    {
                      k: detailT(locale, "field.source"),
                      v:
                        currentBinding.source === "task"
                          ? detailT(locale, "value.activeDriverTask")
                          : detailT(locale, "value.activeShift"),
                    },
                    {
                      k: detailT(locale, "field.bindingState"),
                      v: formatOpsCodeLabel(locale, currentBinding.statusCode),
                      mono: true,
                    },
                    {
                      k: detailT(locale, "field.bindingId"),
                      v: currentBinding.bindingId,
                      mono: true,
                    },
                    {
                      k: detailT(locale, "field.boundAt"),
                      v: formatDateTime(locale, currentBinding.boundAt),
                      mono: true,
                    },
                  ]}
                />
              ) : (
                renderEmptyState(
                  locale,
                  vehicle.supplyLifecycle.offboarding.status !== "none" ||
                    !vehicle.dispatchableFlag
                    ? "not_provisioned"
                    : "no_data",
                  vehicle.supplyLifecycle.offboarding.status !== "none"
                    ? detailT(locale, "body.noCurrentBindingOffboarding")
                    : detailT(locale, "body.noCurrentBinding"),
                  driverBindingAction,
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={detailT(locale, "card.incidents", {
                count: relatedIncidents.length,
              })}
              padding={0}
            >
              {incidentsResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(incidentsResult.error),
                  getEmptyStateMessage(
                    locale,
                    incidentsResult.emptyState,
                    incidentsResult.error,
                  ),
                  incidentEmptyAction,
                )
              ) : incidentRows.length > 0 ? (
                <Table
                  theme={theme}
                  columns={incidentColumns}
                  rows={incidentRows}
                />
              ) : (
                renderEmptyState(
                  locale,
                  incidentsResult.emptyState?.reason ?? "no_data",
                  getEmptyStateMessage(
                    locale,
                    incidentsResult.emptyState,
                    detailT(locale, "body.noIncidents"),
                  ),
                  incidentEmptyAction,
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={detailT(locale, "card.audit")}
              padding={0}
            >
              {auditsResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(auditsResult.error),
                  getEmptyStateMessage(
                    locale,
                    auditsResult.emptyState,
                    auditsResult.error,
                  ),
                  auditEmptyAction,
                )
              ) : auditActivity.length > 0 ? (
                <CanvasActivityFeed
                  theme={theme}
                  items={auditActivity}
                  emptyState={detailT(locale, "body.noAuditFeed")}
                />
              ) : (
                renderEmptyState(
                  locale,
                  auditsResult.emptyState?.reason ?? "no_data",
                  getEmptyStateMessage(
                    locale,
                    auditsResult.emptyState,
                    detailT(locale, "body.noAudit"),
                  ),
                  auditEmptyAction,
                )
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
