import Link from "next/link";
import type { ReactNode } from "react";
import type {
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  CrossAppResourceLink,
  DispatchJobRecord,
  DriverRegistryRecord,
  DriverTaskRecord,
  EmptyReason,
  EmptyStateEnvelope,
  ForwardedOrderRecord,
  IncidentRecord,
  MaintenanceRecord,
  OperationalAdapterDetailRecord,
  OperationalObservabilitySnapshot,
  OwnedOrderRecord,
  RefreshTier,
  ReportJobRecord,
  ResourceActionDescriptor,
  ShiftRecord,
  UiHealthEnvelope,
  UiRefreshMetadata,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import {
  buildDispatchInsights,
  buildOperationsOverview,
  formatCompactNumber,
} from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasActionButton,
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasActionButtonProps,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type IdentitySummary = { realm?: string; actorType?: string } | null;
type HealthPayload = {
  service: string;
  status: string;
  mode: string;
  execution_mode: string;
  timestamp: string;
};

type ApiEnvelope<T> = {
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
};

type ApiListPayload<T> = {
  items: T[];
};

type QueueRow = Record<string, unknown> & {
  orderId: string;
  orderNo: string;
  orderCell: ReactNode;
  tenant: string;
  pickup: string;
  window: string;
  state: string;
  stateCell: ReactNode;
  driver: string;
  eta: string;
};

type DashboardActionLink = {
  descriptor: ResourceActionDescriptor;
  label: ReactNode;
  en?: ReactNode;
  icon?: CanvasActionButtonProps["icon"];
  href?: string;
  link?: CrossAppResourceLink;
};

type AttentionBanner = {
  key: string;
  tone: "info" | "warn" | "danger" | "success";
  title: string;
  body: string;
  actions: DashboardActionLink[];
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const DASHBOARD_REFRESH_TIER: RefreshTier = "medium";
const DASHBOARD_REFRESH_WINDOW_MS = 15_000;

const DRIVER_TASK_PRIORITY: Record<string, number> = {
  on_trip: 0,
  proof_pending: 1,
  arrived_pickup: 2,
  enroute_pickup: 3,
  accepted: 4,
  pending_acceptance: 5,
  completed: 6,
  cancelled: 7,
  rejected: 8,
};

const OWNED_STATE_PRIORITY: Record<string, number> = {
  override_pending: 0,
  no_supply: 1,
  exception_hold: 2,
  broadcasting: 3,
  queued: 4,
  assigned: 5,
};

const pageBodyStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 10,
};

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const bannerStackStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
};

const signalListStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
};

const signalRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  borderRadius: 6,
  background: theme.surfaceLo,
};

const signalLabelStyle = {
  flex: 1,
  minWidth: 0,
  fontSize: 12,
  color: theme.text,
};

const queueStackStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 2,
};

const queueSubLabelStyle = {
  color: theme.textDim,
  fontSize: 11,
};

const queueLinkStyle = {
  color: theme.accent,
  textDecoration: "none",
  fontWeight: 700,
};

const refreshCardStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(300px, 1fr)",
  gap: 16,
  alignItems: "stretch",
};

const metaStackStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
};

const metaRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
};

const metaLabelStyle = {
  fontSize: 11,
  color: theme.textDim,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const summaryBoxStyle = {
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  padding: 12,
  background: theme.surfaceLo,
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
};

const summaryValueStyle = {
  fontSize: 22,
  fontWeight: 700,
  color: theme.text,
};

const summaryCaptionStyle = {
  fontSize: 12,
  color: theme.textDim,
};

const actionStackStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
  alignItems: "flex-start",
};

const emptyStateStyle = {
  border: `1px dashed ${theme.border}`,
  borderRadius: 10,
  background: theme.surfaceLo,
  padding: 16,
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
};

const externalLinkStyle = {
  textDecoration: "none",
};

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

function formatTimestamp(value: string | null, locale: Locale) {
  if (!value) {
    return t("dashboard.platformOps.notReported", locale);
  }

  return `${formatDateTime(locale, value)} UTC`;
}

function formatEtaLabel(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) {
    return "—";
  }

  return `${minutes}m`;
}

function buildAction(
  action: string,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  overrides: Partial<ResourceActionDescriptor> = {},
): ResourceActionDescriptor {
  return {
    action,
    enabled: true,
    riskLevel,
    ...overrides,
  };
}

function isComplaintActive(status: ComplaintCaseStatus) {
  return ["new", "assigned", "under_investigation", "reopened"].includes(
    status,
  );
}

function buildDashboardDispatchHref(
  board:
    | "ready_queue"
    | "exception_hold"
    | "no_eligible_supply"
    | "governance_blocked"
    | "forwarded_mirror",
) {
  return `/dispatch?board=${board}`;
}

function getAppOrigin(targetApp: CrossAppResourceLink["targetApp"]) {
  if (targetApp === "ops-console") {
    return process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN?.trim() || "";
  }
  if (targetApp === "platform-admin") {
    return process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN?.trim() || "";
  }
  return process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN?.trim() || "";
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  const origin = getAppOrigin(link.targetApp).replace(/\/$/, "");
  if (!origin) {
    return link.route;
  }
  return `${origin}${link.route}`;
}

function getAdapterSeverityRank(
  status: OperationalAdapterDetailRecord["status"],
) {
  if (status === "down") {
    return 0;
  }
  if (status === "degraded") {
    return 1;
  }
  return 2;
}

function getHealthEnvelope(
  health: HealthPayload,
  adapters: OperationalAdapterDetailRecord[],
): UiHealthEnvelope {
  const degradedServices: UiHealthEnvelope["degradedServices"] = [];
  if (health.status === "degraded" || health.status === "down") {
    degradedServices.push({
      service: health.service,
      impact:
        health.status === "down"
          ? "dashboard.section.banner.serviceImpact.unavailable"
          : "dashboard.section.banner.serviceImpact.stale",
      severity: health.status === "down" ? "critical" : "warning",
    });
  }

  for (const adapter of adapters.filter((item) => item.status !== "healthy")) {
    degradedServices.push({
      service: adapter.platformCode,
      impact: adapter.reason,
      severity: adapter.status === "down" ? "critical" : "warning",
    });
  }

  return {
    status:
      health.status === "down"
        ? "down"
        : degradedServices.length > 0
          ? "degraded"
          : "healthy",
    degradedServices,
    lastCheckedAt: health.timestamp,
  };
}

function formatDegradedServiceImpact(impact: string, locale: Locale) {
  if (
    impact === "dashboard.section.banner.serviceImpact.unavailable" ||
    impact === "dashboard.section.banner.serviceImpact.stale"
  ) {
    return t(impact, locale);
  }

  return formatOpsCodeLabel(locale, impact);
}

function getRefreshMetadata(
  generatedAt: string,
  healthEnvelope: UiHealthEnvelope,
): UiRefreshMetadata {
  const ageMs = Math.max(0, Date.now() - new Date(generatedAt).getTime());
  return {
    generatedAt,
    staleAfterMs: DASHBOARD_REFRESH_WINDOW_MS,
    dataFreshness:
      healthEnvelope.status === "down"
        ? "degraded"
        : ageMs > DASHBOARD_REFRESH_WINDOW_MS
          ? "stale"
          : "fresh",
    source: healthEnvelope.status === "down" ? "cache" : "live",
  };
}

function createFallbackEnvelope<T>(
  data: T,
  referenceDate = new Date(),
): ApiEnvelope<T> {
  return {
    data,
    meta: {
      requestId: "dashboard-fallback",
      timestamp: referenceDate.toISOString(),
    },
  };
}

function createFallbackListEnvelope<T>(
  items: T[],
  referenceDate = new Date(),
): ApiEnvelope<ApiListPayload<T>> {
  return createFallbackEnvelope({ items }, referenceDate);
}

function getOldestTimestamp(
  timestamps: Array<string | null | undefined>,
  fallback: string,
) {
  const sorted = timestamps
    .filter((value): value is string => Boolean(value))
    .sort(
      (left, right) => new Date(left).getTime() - new Date(right).getTime(),
    );
  return sorted[0] ?? fallback;
}

function getFreshnessTone(
  freshness: UiRefreshMetadata["dataFreshness"],
): CanvasTone {
  switch (freshness) {
    case "fresh":
      return "success";
    case "stale":
      return "warn";
    case "degraded":
      return "danger";
    default:
      return "neutral";
  }
}

function getFreshnessLabel(
  freshness: UiRefreshMetadata["dataFreshness"],
  locale: Locale,
) {
  switch (freshness) {
    case "fresh":
      return t("dashboard.freshness.fresh", locale);
    case "stale":
      return t("dashboard.freshness.stale", locale);
    case "degraded":
      return t("dashboard.freshness.degraded", locale);
    default:
      return t("dashboard.freshness.unknown", locale);
  }
}

function getRefreshTierLabel(tier: RefreshTier, locale: Locale) {
  if (tier === "medium") {
    return t("dashboard.refreshTier.medium", locale);
  }
  return tier;
}

function getEmptyStateCopy(
  emptyState: EmptyStateEnvelope,
  locale: Locale,
): { tone: CanvasTone; title: string; body: string } {
  switch (emptyState.reason) {
    case "no_data":
      return {
        tone: "info",
        title: t("dashboard.empty.no_data.title", locale),
        body: t("dashboard.empty.no_data.body", locale),
      };
    case "not_provisioned":
      return {
        tone: "warn",
        title: t("dashboard.empty.not_provisioned.title", locale),
        body: t("dashboard.empty.not_provisioned.body", locale),
      };
    case "fetch_failed":
      return {
        tone: "danger",
        title: t("dashboard.empty.fetch_failed.title", locale),
        body: t("dashboard.empty.fetch_failed.body", locale),
      };
    case "permission_denied":
      return {
        tone: "warn",
        title: t("dashboard.empty.permission_denied.title", locale),
        body: t("dashboard.empty.permission_denied.body", locale),
      };
    case "external_unavailable":
      return {
        tone: "danger",
        title: t("dashboard.empty.external_unavailable.title", locale),
        body: t("dashboard.empty.external_unavailable.body", locale),
      };
    case "filtered_empty":
      return {
        tone: "neutral",
        title: t("dashboard.empty.filtered_empty.title", locale),
        body: t("dashboard.empty.filtered_empty.body", locale),
      };
    default:
      return {
        tone: "neutral",
        title: t("dashboard.empty.default.title", locale),
        body: emptyState.messageCode,
      };
  }
}

function getEmptyActionLabel(action: ResourceActionDescriptor["action"]) {
  switch (action) {
    case "clear_filters":
      return "dashboard.emptyAction.clear_filters";
    case "retry_fetch":
      return "dashboard.emptyAction.retry_fetch";
    case "open_platform_status":
      return "dashboard.emptyAction.open_platform_status";
    case "request_access":
      return "dashboard.emptyAction.request_access";
    default:
      return "dashboard.emptyAction.contact_owner";
  }
}

function getDefaultEmptyAction(
  reason: EmptyReason,
): ResourceActionDescriptor | undefined {
  switch (reason) {
    case "not_provisioned":
      return buildAction("contact_owner", "medium");
    case "fetch_failed":
      return buildAction("retry_fetch", "low");
    case "permission_denied":
      return buildAction("request_access", "medium");
    case "external_unavailable":
      return buildAction("open_platform_status", "low");
    case "filtered_empty":
      return buildAction("clear_filters", "low");
    default:
      return undefined;
  }
}

function ActionLinkButton({
  action,
  locale,
  variant = "secondary",
}: {
  action: DashboardActionLink;
  locale: Locale;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const button = (
    <CanvasActionButton
      theme={theme}
      descriptor={action.descriptor}
      variant={variant}
      icon={
        action.icon ?? (action.link?.openMode === "new_tab" ? "ext" : undefined)
      }
      label={action.label}
      en={action.en}
    />
  );

  if (!action.descriptor.enabled || (!action.href && !action.link)) {
    return (
      <div style={actionStackStyle}>
        {button}
        {action.descriptor.disabledReasonCode ? (
          <span style={queueSubLabelStyle}>
            {formatOpsCodeLabel(locale, action.descriptor.disabledReasonCode)}
          </span>
        ) : null}
      </div>
    );
  }

  const href = action.link ? resolveCrossAppHref(action.link) : action.href!;
  const openNewTab = action.link?.openMode === "new_tab";

  return (
    <Link
      href={href}
      style={externalLinkStyle}
      target={openNewTab ? "_blank" : undefined}
      rel={openNewTab ? "noreferrer" : undefined}
    >
      {button}
    </Link>
  );
}

function EmptyStateCard({
  emptyState,
  locale,
}: {
  emptyState: EmptyStateEnvelope;
  locale: Locale;
}) {
  const copy = getEmptyStateCopy(emptyState, locale);
  const nextActionDescriptor =
    emptyState.nextAction ?? getDefaultEmptyAction(emptyState.reason);
  const nextAction = nextActionDescriptor
    ? (() => {
        const actionKey = getEmptyActionLabel(nextActionDescriptor.action);
        const action: DashboardActionLink = {
          descriptor: nextActionDescriptor,
          label: t(actionKey, locale),
          en: t(`${actionKey}.short`, "en"),
        };
        if (nextActionDescriptor.action === "clear_filters") {
          action.href = buildDashboardDispatchHref("ready_queue");
        } else if (nextActionDescriptor.action === "retry_fetch") {
          action.href = "/dashboard?refresh=1";
        } else if (nextActionDescriptor.action === "open_platform_status") {
          action.link = {
            targetApp: "platform-admin",
            route: "/adapter-registry",
            resourceType: "adapter_registry",
            resourceId: "all",
            openMode: "new_tab",
            label: t("dashboard.section.adapterRegistry", "en"),
          };
          action.icon = "ext";
        }
        return action;
      })()
    : null;

  return (
    <div style={emptyStateStyle}>
      <Pill theme={theme} tone={copy.tone} dot>
        {formatOpsCodeLabel(locale, emptyState.reason)}
      </Pill>
      <strong style={{ color: theme.text }}>{copy.title}</strong>
      <span style={signalLabelStyle}>{copy.body}</span>
      {nextAction ? (
        <ActionLinkButton action={nextAction} locale={locale} />
      ) : null}
    </div>
  );
}

function getQueueColumnLabel(
  key:
    | "orderNo"
    | "tenant"
    | "pickup"
    | "window"
    | "statePill"
    | "driver"
    | "eta",
  locale: Locale,
): string {
  switch (key) {
    case "orderNo":
      return t("dashboard.queue.col.orderNo", locale);
    case "tenant":
      return t("dashboard.queue.col.tenant", locale);
    case "pickup":
      return t("dashboard.queue.col.pickup", locale);
    case "window":
      return t("dashboard.queue.col.window", locale);
    case "statePill":
      return t("dashboard.queue.col.state", locale);
    case "driver":
      return t("dashboard.queue.col.driver", locale);
    case "eta":
      return t("dashboard.queue.col.eta", locale);
    default:
      return String(key);
  }
}

function formatWindow(order: OwnedOrderRecord, locale: Locale) {
  if (!order.reservationWindowStart || !order.reservationWindowEnd) {
    return t("dashboard.queue.window.realtime", locale);
  }

  return `${formatDateTime(locale, order.reservationWindowStart)} → ${formatDateTime(locale, order.reservationWindowEnd)}`;
}

function getAddressLabel(
  address: OwnedOrderRecord["pickup"] | OwnedOrderRecord["dropoff"],
) {
  return address.addressName ?? address.address;
}

function getTenantLabel(order: OwnedOrderRecord) {
  return (
    order.tenantId ??
    order.partnerEntrySlug ??
    order.partnerId ??
    order.orderSource
  );
}

function getVisibleStateCode(order: OwnedOrderRecord, job?: DispatchJobRecord) {
  if (order.exceptionHold?.overrideRequest && !order.exceptionHold.resolution) {
    return "override_pending";
  }

  if (order.status === "no_supply" || order.status === "delayed_queue") {
    return "no_supply";
  }

  if (order.status === "exception_hold") {
    return "exception_hold";
  }

  if (job?.status === "assigned") {
    return "assigned";
  }

  if (job?.status === "matching") {
    return "broadcasting";
  }

  if (
    job?.status === "queued" ||
    job?.status === "redispatch_required" ||
    job?.status === "reserved"
  ) {
    return "queued";
  }

  if (
    order.status === "ready_for_dispatch" ||
    order.status === "preassigned" ||
    order.status === "recording_pending" ||
    order.status === "redispatch_required"
  ) {
    return "queued";
  }

  return order.status;
}

function getStateTone(stateCode: string): CanvasTone {
  if (stateCode === "assigned" || stateCode === "completed") {
    return "success";
  }
  if (stateCode === "no_supply") {
    return "danger";
  }
  if (
    stateCode === "dispatch_timeout" ||
    stateCode === "exception_hold" ||
    stateCode === "override_pending"
  ) {
    return "warn";
  }
  if (stateCode === "broadcasting" || stateCode === "queued") {
    return "info";
  }
  return "neutral";
}

function getHealthTone(status: string): CanvasTone {
  if (status === "healthy" || status === "ok") {
    return "success";
  }
  if (status === "warning" || status === "degraded") {
    return "warn";
  }
  if (status === "critical" || status === "down") {
    return "danger";
  }
  return "info";
}

function pickCurrentTask(tasks: DriverTaskRecord[]) {
  return (
    [...tasks].sort((left, right) => {
      const leftRank = DRIVER_TASK_PRIORITY[left.status] ?? 99;
      const rightRank = DRIVER_TASK_PRIORITY[right.status] ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftTimestamp =
        left.completedAt ??
        left.startedAt ??
        left.arrivedPickupAt ??
        left.departedAt ??
        left.acceptedAt ??
        "";
      const rightTimestamp =
        right.completedAt ??
        right.startedAt ??
        right.arrivedPickupAt ??
        right.departedAt ??
        right.acceptedAt ??
        "";

      return rightTimestamp.localeCompare(leftTimestamp);
    })[0] ?? null
  );
}

async function resolveOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

function createFallbackObservabilitySnapshot(
  referenceDate = new Date(),
): OperationalObservabilitySnapshot {
  return {
    generatedAt: referenceDate.toISOString(),
    alerts: [],
    dispatch: {
      activeOrders: 0,
      queueDepth: 0,
      laggedOrders: 0,
      redispatchOrders: 0,
      exceptionHoldOrders: 0,
      dispatchFailedOrders: 0,
      oldestReadyOrderLagMinutes: null,
    },
    recording: {
      phoneOrders: 0,
      linkedOrders: 0,
      pendingOrders: 0,
      pendingCallSessions: 0,
      missingRecordingLinks: 0,
      oldestPendingLagMinutes: null,
      linkedRatioPercent: 0,
    },
    driverState: {
      totalDrivers: 0,
      availableDrivers: 0,
      dispatchEligibleDrivers: 0,
      offlineDrivers: 0,
      staleLocationDrivers: 0,
      missingLocationDrivers: 0,
      oldestLocationLagMinutes: null,
    },
    webhook: {
      totalEndpoints: 0,
      activeEndpoints: 0,
      disabledEndpoints: 0,
      queuedDeliveries: 0,
      failedDeliveriesLastHour: 0,
      oldestQueuedDeliveryLagMinutes: null,
    },
    eligibility: {
      totalReviewQueue: 0,
      manualReviewQueue: 0,
      manualFallbackQueue: 0,
      ineligibleQueue: 0,
      recentFailureCount24h: 0,
    },
    reporting: {
      queuedJobs: 0,
      failedJobs: 0,
      dispatchRecordingIndexQueuedJobs: 0,
    },
    adapters: {
      totalAdapters: 0,
      healthyAdapters: 0,
      degradedAdapters: 0,
      downAdapters: 0,
    },
    forwarderOps: {
      totalForwardedOrders: 0,
      syncFailedOrders: 0,
      acceptPendingOrders: 0,
      manualFallbackQueue: 0,
      reconciliationQueue: 0,
      oldestSyncFailedLagMinutes: null,
      oldestAcceptPendingLagMinutes: null,
      oldestManualFallbackLagMinutes: null,
      oldestReconciliationLagMinutes: null,
    },
    adapterDetails: [],
    phase2SandboxKpiDashboard: null,
    roleViews: [],
  };
}

async function loadHealthPayload(): Promise<HealthPayload> {
  const apiBaseUrl = process.env.DRTS_API_URL ?? "http://localhost:3001";
  const response = await fetch(new URL("/api/health", apiBaseUrl), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }

  return (await response.json()) as HealthPayload;
}

export default async function DashboardPage() {
  const client = await getServerOpsClient();
  const locale = await getServerLocale();
  const [
    identity,
    health,
    ordersResponse,
    dispatchJobsResponse,
    driverTasksResponse,
    vehiclesResponse,
    driversResponse,
    shiftsResponse,
    incidentsResponse,
    maintenanceResponse,
    reportJobsResponse,
    observabilityResponse,
    complaintsResponse,
    forwardedOrdersResponse,
  ] = await Promise.all([
    resolveOrFallback<IdentitySummary>(
      () => client.getIdentityContext() as Promise<IdentitySummary>,
      null,
    ),
    resolveOrFallback(loadHealthPayload, {
      service: "api",
      status: "degraded",
      mode: "unknown",
      execution_mode: "unknown",
      timestamp: new Date().toISOString(),
    }),
    resolveOrFallback(
      () => client.getListEnvelope<OwnedOrderRecord>("/api/orders"),
      createFallbackListEnvelope([] as OwnedOrderRecord[]),
    ),
    resolveOrFallback(
      () => client.getListEnvelope<DispatchJobRecord>("/api/dispatch/tasks"),
      createFallbackListEnvelope([] as DispatchJobRecord[]),
    ),
    resolveOrFallback(
      () => client.getListEnvelope<DriverTaskRecord>("/api/driver/tasks"),
      createFallbackListEnvelope([] as DriverTaskRecord[]),
    ),
    resolveOrFallback(
      () =>
        client.getListEnvelope<VehicleRegistryRecord>(
          "/api/regulatory-registry/vehicles",
        ),
      createFallbackListEnvelope([] as VehicleRegistryRecord[]),
    ),
    resolveOrFallback(
      () =>
        client.getListEnvelope<DriverRegistryRecord>(
          "/api/regulatory-registry/drivers",
        ),
      createFallbackListEnvelope([] as DriverRegistryRecord[]),
    ),
    resolveOrFallback(
      () => client.getListEnvelope<ShiftRecord>("/api/shift-attendance/shifts"),
      createFallbackListEnvelope([] as ShiftRecord[]),
    ),
    resolveOrFallback(
      () => client.getListEnvelope<IncidentRecord>("/api/incidents"),
      createFallbackListEnvelope([] as IncidentRecord[]),
    ),
    resolveOrFallback(
      () => client.getListEnvelope<MaintenanceRecord>("/api/maintenance"),
      createFallbackListEnvelope([] as MaintenanceRecord[]),
    ),
    resolveOrFallback(
      () => client.getListEnvelope<ReportJobRecord>("/api/reports/jobs"),
      createFallbackListEnvelope([] as ReportJobRecord[]),
    ),
    resolveOrFallback(
      () =>
        client.getEnvelope<OperationalObservabilitySnapshot>(
          "/api/operational-observability",
        ),
      createFallbackEnvelope(createFallbackObservabilitySnapshot()),
    ),
    resolveOrFallback(
      () => client.getListEnvelope<ComplaintCaseRecord>("/api/complaints"),
      createFallbackListEnvelope([] as ComplaintCaseRecord[]),
    ),
    resolveOrFallback(
      () =>
        client.getListEnvelope<ForwardedOrderRecord>("/api/forwarder/orders"),
      createFallbackListEnvelope([] as ForwardedOrderRecord[]),
    ),
  ]);

  const orders = ordersResponse.data.items;
  const dispatchJobs = dispatchJobsResponse.data.items;
  const driverTasks = driverTasksResponse.data.items;
  const vehicles = vehiclesResponse.data.items;
  const drivers = driversResponse.data.items;
  const shifts = shiftsResponse.data.items;
  const incidents = incidentsResponse.data.items;
  const maintenance = maintenanceResponse.data.items;
  const reportJobs = reportJobsResponse.data.items;
  const observability = observabilityResponse.data;
  const complaints = complaintsResponse.data.items;
  const forwardedOrders = forwardedOrdersResponse.data.items;

  const dispatch = buildDispatchInsights(orders, dispatchJobs);
  const operations = buildOperationsOverview({
    vehicles,
    drivers,
    shifts,
    incidents,
    maintenance,
    reportJobs,
  });
  const criticalIncidentCount = incidents.filter(
    (incident: IncidentRecord) =>
      (incident.status === "open" || incident.status === "investigating") &&
      incident.severity === "critical",
  ).length;
  const incidentInResponseCount = incidents.filter(
    (incident: IncidentRecord) =>
      incident.status === "open" || incident.status === "investigating",
  ).length;
  const activeComplaints = complaints.filter((record: ComplaintCaseRecord) =>
    isComplaintActive(record.status),
  );
  const complaintSlaBreachedCount = activeComplaints.filter(
    (record: ComplaintCaseRecord) => record.slaBreach,
  ).length;
  const highSeverityComplaintCount = activeComplaints.filter(
    (record: ComplaintCaseRecord) => record.severity === "high",
  ).length;
  const dispatchEligibleDrivers =
    observability.driverState.dispatchEligibleDrivers ||
    operations.onlineDrivers;
  const onlineDrivers =
    observability.driverState.availableDrivers || operations.onlineDrivers;
  const staleLocationDrivers = observability.driverState.staleLocationDrivers;
  const staleLocationDelta =
    observability.driverState.oldestLocationLagMinutes !== null
      ? t("dashboard.kpi.staleLocation.oldest", locale, {
          minutes: observability.driverState.oldestLocationLagMinutes,
        })
      : undefined;

  const adapterAttentionCount =
    observability.adapters.degradedAdapters +
    observability.adapters.downAdapters;
  const sortedAdapterDetails = [...observability.adapterDetails].sort(
    (left, right) => {
      const severityDiff =
        getAdapterSeverityRank(left.status) -
        getAdapterSeverityRank(right.status);
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return right.lastCheckedAt.localeCompare(left.lastCheckedAt);
    },
  );
  const healthEnvelope = getHealthEnvelope(
    health,
    observability.adapterDetails,
  );
  const dashboardGeneratedAt = getOldestTimestamp(
    [
      observability.generatedAt,
      ordersResponse.meta.timestamp,
      dispatchJobsResponse.meta.timestamp,
      driverTasksResponse.meta.timestamp,
      vehiclesResponse.meta.timestamp,
      driversResponse.meta.timestamp,
      shiftsResponse.meta.timestamp,
      incidentsResponse.meta.timestamp,
      maintenanceResponse.meta.timestamp,
      reportJobsResponse.meta.timestamp,
      complaintsResponse.meta.timestamp,
      forwardedOrdersResponse.meta.timestamp,
    ],
    health.timestamp,
  );
  const refreshMetadata = getRefreshMetadata(
    dashboardGeneratedAt,
    healthEnvelope,
  );
  const refreshAction: DashboardActionLink = {
    descriptor: buildAction("refresh_dashboard", "low"),
    label: t("dashboard.action.refresh", locale),
    en: t("dashboard.action.refresh.short", "en"),
    href: "/dashboard?refresh=1",
  };
  const handbookAction: DashboardActionLink = {
    descriptor: buildAction("open_duty_handbook", "low"),
    label: t("dashboard.action.handbook", locale),
    en: t("dashboard.action.handbook.short", "en"),
    icon: "ext",
    link: {
      targetApp: "ops-console",
      route: "/docs/03-runbooks/phase1-operator-routing-runbook.md",
      resourceType: "runbook",
      resourceId: "phase1-operator-routing-runbook",
      openMode: "new_tab",
      label: t("dashboard.action.handbook", "en"),
    },
  };
  const callSessionAction: DashboardActionLink = {
    descriptor: buildAction("open_call_session", "medium"),
    label: t("dashboard.action.callSession", locale),
    en: t("dashboard.action.callSession.short", "en"),
    icon: "phone",
    href: "/callcenter",
  };

  const broadcastingCount = dispatchJobs.filter(
    (job: DispatchJobRecord) => job.status === "matching",
  ).length;
  const noSupplyCount = orders.filter(
    (order: OwnedOrderRecord) => order.status === "no_supply",
  ).length;
  const exceptionHoldCount = orders.filter(
    (order: OwnedOrderRecord) => order.status === "exception_hold",
  ).length;
  const overridePendingCount = orders.filter(
    (order: OwnedOrderRecord) =>
      order.exceptionHold?.overrideRequest && !order.exceptionHold.resolution,
  ).length;
  const syncFailedForwardedCount = forwardedOrders.filter(
    (order: ForwardedOrderRecord) => order.status === "sync_failed",
  ).length;
  const topAdapter = sortedAdapterDetails[0] ?? null;
  const healthSignalAdapters = sortedAdapterDetails.slice(0, 2);

  const headerSubtitle = [
    formatTimestamp(health.timestamp, locale),
    t("dashboard.header.mode", locale, {
      value: formatOpsCodeLabel(locale, health.mode),
    }),
    t("dashboard.header.execution", locale, {
      value: formatOpsCodeLabel(locale, health.execution_mode),
    }),
  ].join(" · ");

  const topCriticalIncident =
    incidents.find(
      (incident: IncidentRecord) =>
        (incident.status === "open" || incident.status === "investigating") &&
        incident.severity === "critical",
    ) ?? null;

  const banners = [
    topCriticalIncident
      ? {
          key: `incident-${topCriticalIncident.incidentId}`,
          tone: "danger" as const,
          title: t("dashboard.banner.incident.title", locale, {
            id: topCriticalIncident.incidentId,
          }),
          body:
            topCriticalIncident.location ??
            topCriticalIncident.description ??
            t("dashboard.banner.incident.bodyFallback", locale),
          actions: [
            {
              descriptor: buildAction("open_incidents", "medium"),
              label: t("dashboard.quicklink.incidents", locale),
              en: t("dashboard.quicklink.incidents.short", "en"),
              href: "/incidents",
            },
          ],
        }
      : null,
    noSupplyCount > 0
      ? {
          key: "dispatch-no-supply",
          tone: "warn" as const,
          title: t("dashboard.banner.noSupply.title", locale, {
            count: formatCompactNumber(noSupplyCount),
          }),
          body: t("dashboard.banner.noSupply.body", locale, {
            exceptions: formatCompactNumber(exceptionHoldCount),
            overrides: formatCompactNumber(overridePendingCount),
          }),
          actions: [
            {
              descriptor: buildAction("open_dispatch", "low"),
              label: t("dashboard.section.queue.openDispatch", locale),
              en: t("dashboard.section.queue.openDispatch.short", "en"),
              href: buildDashboardDispatchHref("no_eligible_supply"),
            },
          ],
        }
      : null,
    syncFailedForwardedCount > 0
      ? {
          key: "forwarded-sync-failed",
          tone: "warn" as const,
          title: t("dashboard.banner.forwardedSync.title", locale, {
            count: formatCompactNumber(syncFailedForwardedCount),
          }),
          body: t("dashboard.banner.forwardedSync.body", locale, {
            count: formatCompactNumber(adapterAttentionCount),
          }),
          actions: [
            {
              descriptor: buildAction("open_forwarded_dispatch", "low"),
              label: t("dashboard.dispatchBoards.openForwarded", locale),
              en: t("dashboard.dispatchBoards.openForwarded.short", "en"),
              icon: "ext",
              href: buildDashboardDispatchHref("forwarded_mirror"),
            },
            {
              descriptor: buildAction("inspect_adapter_registry", "low"),
              label: t("dashboard.section.adapterRegistry", locale),
              en: t("dashboard.section.adapterRegistry.short", "en"),
              icon: "ext",
              link: {
                targetApp: "platform-admin",
                route: "/adapter-registry",
                resourceType: "adapter_registry",
                resourceId: topAdapter?.platformCode ?? "all",
                openMode: "new_tab",
                label: t("dashboard.section.adapterRegistry", "en"),
              },
            },
          ],
        }
      : null,
  ].filter(Boolean) as AttentionBanner[];

  const healthSignals: Array<{
    label: string;
    value: string;
    tone: CanvasTone;
  }> = [
    {
      label: t("dashboard.health.dispatchLag.label", locale),
      value:
        observability.dispatch.oldestReadyOrderLagMinutes !== null
          ? t("dashboard.health.dispatchLag.minutes", locale, {
              minutes: observability.dispatch.oldestReadyOrderLagMinutes,
            })
          : t("dashboard.health.dispatchLag.withinSla", locale),
      tone:
        observability.dispatch.oldestReadyOrderLagMinutes &&
        observability.dispatch.oldestReadyOrderLagMinutes > 10
          ? "warn"
          : "success",
    },
    {
      label: t("dashboard.health.webhookP95.label", locale),
      value:
        observability.webhook.oldestQueuedDeliveryLagMinutes !== null
          ? t("dashboard.health.webhookP95.queued", locale, {
              minutes: observability.webhook.oldestQueuedDeliveryLagMinutes,
            })
          : t("dashboard.health.webhookP95.healthy", locale),
      tone:
        observability.webhook.failedDeliveriesLastHour > 0 ||
        observability.webhook.oldestQueuedDeliveryLagMinutes !== null
          ? "warn"
          : "success",
    },
    ...healthSignalAdapters.map((adapter) => ({
      label: t("dashboard.health.forwarder.label", locale, {
        platform: formatOpsCodeLabel(locale, adapter.platformCode),
      }),
      value: formatOpsCodeLabel(locale, adapter.status),
      tone: getHealthTone(adapter.status),
    })),
    {
      label:
        topAdapter?.credentialStatus && topAdapter.credentialStatus !== "valid"
          ? t("dashboard.health.credential.platform", locale, {
              platform: formatOpsCodeLabel(locale, topAdapter.platformCode),
            })
          : t("dashboard.health.credential.default", locale),
      value: topAdapter
        ? topAdapter.credentialStatus !== "valid"
          ? formatOpsCodeLabel(locale, topAdapter.credentialStatus)
          : formatOpsCodeLabel(locale, topAdapter.authStatus)
        : "—",
      tone:
        topAdapter &&
        (topAdapter.credentialStatus !== "valid" ||
          topAdapter.authStatus !== "authenticated")
          ? "danger"
          : "success",
    },
    {
      label: t("dashboard.health.identityRuntime", locale),
      value: `${identity?.realm ?? "ops"} / ${identity?.actorType ?? "ops_user"} · ${formatOpsCodeLabel(locale, health.status)}`,
      tone: getHealthTone(health.status),
    },
  ];

  const jobByOrderId = new Map<string, DispatchJobRecord>(
    dispatchJobs.map((job: DispatchJobRecord) => [job.orderId, job]),
  );
  const tasksByOrderId = new Map<string, DriverTaskRecord[]>();
  for (const task of driverTasks) {
    const existing = tasksByOrderId.get(task.orderId);
    if (existing) {
      existing.push(task);
    } else {
      tasksByOrderId.set(task.orderId, [task]);
    }
  }

  const queueRows: QueueRow[] = [...orders]
    .sort((left, right) => {
      const leftState = getVisibleStateCode(
        left,
        jobByOrderId.get(left.orderId),
      );
      const rightState = getVisibleStateCode(
        right,
        jobByOrderId.get(right.orderId),
      );
      const leftPriority = OWNED_STATE_PRIORITY[leftState] ?? 99;
      const rightPriority = OWNED_STATE_PRIORITY[rightState] ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftTimestamp = left.updatedAt ?? left.createdAt ?? "";
      const rightTimestamp = right.updatedAt ?? right.createdAt ?? "";
      return rightTimestamp.localeCompare(leftTimestamp);
    })
    .slice(0, 5)
    .map((order) => {
      const job = jobByOrderId.get(order.orderId);
      const task = pickCurrentTask(tasksByOrderId.get(order.orderId) ?? []);
      const state = getVisibleStateCode(order, job);

      return {
        orderId: order.orderId,
        orderNo: order.orderNo,
        orderCell: (
          <div style={queueStackStyle}>
            <Link
              href={`/dispatch/${encodeURIComponent(order.orderId)}`}
              style={queueLinkStyle}
            >
              {order.orderNo}
            </Link>
            <span style={queueSubLabelStyle}>{order.orderId}</span>
          </div>
        ),
        tenant: getTenantLabel(order),
        pickup: getAddressLabel(order.pickup),
        window: formatWindow(order, locale),
        state,
        stateCell: (
          <Pill theme={theme} tone={getStateTone(state)} dot>
            {formatOpsCodeLabel(locale, state)}
          </Pill>
        ),
        driver: task?.driverId ?? "—",
        eta: formatEtaLabel(
          job?.latestEtaMinutes ?? order.etaSnapshot?.etaMinutes,
        ),
      };
    });
  const queueColumns: CanvasTableColumn<QueueRow>[] = [
    {
      h: getQueueColumnLabel("orderNo", locale),
      k: "orderCell",
      w: 126,
    },
    {
      h: getQueueColumnLabel("tenant", locale),
      k: "tenant",
      w: 140,
      mono: true,
    },
    {
      h: getQueueColumnLabel("pickup", locale),
      k: "pickup",
      w: 300,
    },
    {
      h: getQueueColumnLabel("window", locale),
      k: "window",
      w: 132,
      mono: true,
    },
    {
      h: getQueueColumnLabel("statePill", locale),
      k: "stateCell",
      w: 142,
    },
    {
      h: getQueueColumnLabel("driver", locale),
      k: "driver",
      w: 112,
      mono: true,
    },
    {
      h: getQueueColumnLabel("eta", locale),
      k: "eta",
      w: 78,
      mono: true,
    },
  ];
  const queueEmptyState: EmptyStateEnvelope | null =
    queueRows.length > 0
      ? null
      : healthEnvelope.status === "down"
        ? {
            reason: "fetch_failed",
            messageCode: "dashboard.queue.fetch_failed",
          }
        : identity?.actorType
          ? {
              reason: "no_data",
              messageCode: "dashboard.queue.no_data",
            }
          : {
              reason: "permission_denied",
              messageCode: "dashboard.queue.permission_denied",
            };
  const signalEmptyState: EmptyStateEnvelope | null =
    healthSignals.length > 0
      ? null
      : adapterAttentionCount > 0
        ? {
            reason: "external_unavailable",
            messageCode: "dashboard.signals.external_unavailable",
          }
        : {
            reason: "not_provisioned",
            messageCode: "dashboard.signals.not_provisioned",
          };
  const bannerEmptyState: EmptyStateEnvelope | null =
    banners.length > 0
      ? null
      : {
          reason: "no_data",
          messageCode: "dashboard.attention.no_data",
        };

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("dashboard.title", locale)}
        subtitle={headerSubtitle}
        actions={
          <>
            <ActionLinkButton action={handbookAction} locale={locale} />
            <ActionLinkButton
              action={callSessionAction}
              locale={locale}
              variant="primary"
            />
          </>
        }
      />

      <div style={pageBodyStyle}>
        {healthEnvelope.status !== "healthy" ? (
          <Banner
            theme={theme}
            tone={healthEnvelope.status === "down" ? "danger" : "warn"}
            icon={<CanvasIcon name="warn" size={16} />}
            title={t("dashboard.section.banner.degradedTitle", locale)}
            body={
              healthEnvelope.degradedServices
                .map(
                  (service: UiHealthEnvelope["degradedServices"][number]) =>
                    `${service.service} · ${formatDegradedServiceImpact(service.impact, locale)}`,
                )
                .join(" · ") ||
              t("dashboard.section.banner.degradedFallback", locale)
            }
            actions={
              <ActionLinkButton action={refreshAction} locale={locale} />
            }
          />
        ) : null}

        <div style={refreshCardStyle}>
          <Card
            theme={theme}
            title={t("dashboard.section.shiftReadiness.title", locale)}
            subtitle={t("dashboard.section.shiftReadiness.subtitle", locale)}
            actions={
              <ActionLinkButton action={refreshAction} locale={locale} />
            }
          >
            <div style={metaStackStyle}>
              <div style={metaRowStyle}>
                <Pill
                  theme={theme}
                  tone={getFreshnessTone(refreshMetadata.dataFreshness)}
                  dot
                >
                  {getFreshnessLabel(refreshMetadata.dataFreshness, locale)}
                </Pill>
                <Pill theme={theme} tone="info" dot>
                  {getRefreshTierLabel(DASHBOARD_REFRESH_TIER, locale)}
                </Pill>
                <Pill theme={theme} tone="neutral">
                  {identity?.realm ?? "ops"} /{" "}
                  {identity?.actorType ?? "ops_user"}
                </Pill>
              </div>
              <div style={summaryGridStyle}>
                <div style={summaryBoxStyle}>
                  <span style={metaLabelStyle}>
                    {t("dashboard.section.meta.generated", locale)}
                  </span>
                  <span style={summaryValueStyle}>
                    {formatTimestamp(refreshMetadata.generatedAt, locale)}
                  </span>
                  <span style={summaryCaptionStyle}>
                    {t("dashboard.section.meta.source", locale)}:{" "}
                    {formatOpsCodeLabel(locale, refreshMetadata.source)}
                  </span>
                </div>
                <div style={summaryBoxStyle}>
                  <span style={metaLabelStyle}>
                    {t("dashboard.section.meta.healthChecked", locale)}
                  </span>
                  <span style={summaryValueStyle}>
                    {formatTimestamp(healthEnvelope.lastCheckedAt, locale)}
                  </span>
                  <span style={summaryCaptionStyle}>
                    {t("dashboard.section.meta.serviceState", locale)}:{" "}
                    {formatOpsCodeLabel(locale, healthEnvelope.status)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card
            theme={theme}
            title={t("dashboard.section.adapterSummary.title", locale)}
            subtitle={t("dashboard.section.adapterSummary.subtitle", locale)}
            actions={
              topAdapter ? (
                <ActionLinkButton
                  action={{
                    descriptor: buildAction("inspect_adapter_registry", "low"),
                    label: t("dashboard.section.adapterRegistry", locale),
                    en: t("dashboard.section.adapterRegistry.short", "en"),
                    icon: "ext",
                    link: {
                      targetApp: "platform-admin",
                      route: "/adapter-registry",
                      resourceType: "adapter_registry",
                      resourceId: topAdapter.platformCode,
                      openMode: "new_tab",
                      label: t("dashboard.section.adapterRegistry", "en"),
                    },
                  }}
                  locale={locale}
                />
              ) : null
            }
          >
            {topAdapter ? (
              <div style={signalListStyle}>
                <div style={signalRowStyle}>
                  <Pill
                    theme={theme}
                    tone={getHealthTone(topAdapter.status)}
                    dot
                  >
                    {formatOpsCodeLabel(locale, topAdapter.status)}
                  </Pill>
                  <span style={signalLabelStyle}>
                    {formatOpsCodeLabel(locale, topAdapter.platformCode)} ·{" "}
                    {formatOpsCodeLabel(locale, topAdapter.reason)}
                  </span>
                </div>
                <div style={signalRowStyle}>
                  <Pill theme={theme} tone="neutral">
                    {formatOpsCodeLabel(locale, topAdapter.credentialStatus)}
                  </Pill>
                  <span style={signalLabelStyle}>
                    {t("dashboard.section.adapterSummary.credential", locale)}
                  </span>
                </div>
                <div style={signalRowStyle}>
                  <Pill theme={theme} tone="neutral">
                    {formatOpsCodeLabel(locale, topAdapter.webhookStatus)}
                  </Pill>
                  <span style={signalLabelStyle}>
                    {t("dashboard.section.adapterSummary.webhook", locale)}
                  </span>
                </div>
                <div style={signalRowStyle}>
                  <Pill
                    theme={theme}
                    tone={getHealthTone(topAdapter.rateLimitStatus)}
                  >
                    {formatOpsCodeLabel(locale, topAdapter.rateLimitStatus)}
                  </Pill>
                  <span style={signalLabelStyle}>
                    {t("dashboard.section.adapterSummary.lastChecked", locale, {
                      value: formatTimestamp(topAdapter.lastCheckedAt, locale),
                    })}
                  </span>
                </div>
                <div style={signalRowStyle}>
                  <Pill theme={theme} tone="info">
                    {t("dashboard.section.adapterSummary.error", locale)}
                  </Pill>
                  <span style={signalLabelStyle}>
                    {topAdapter.lastError ??
                      t("dashboard.section.adapterSummary.noError", locale)}
                  </span>
                </div>
              </div>
            ) : (
              <EmptyStateCard
                locale={locale}
                emptyState={{
                  reason: "not_provisioned",
                  messageCode: "dashboard.adapters.not_provisioned",
                }}
              />
            )}
          </Card>
        </div>

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={t("dashboard.activeOrders", locale)}
            value={formatCompactNumber(dispatch.activeOrders)}
            delta={
              dispatch.queueDepth > 0
                ? t("dashboard.kpi.activeOrders.queue", locale, {
                    count: formatCompactNumber(dispatch.queueDepth),
                  })
                : undefined
            }
            deltaTone={dispatch.queueDepth > 0 ? "down" : "neutral"}
            sub={t("dashboard.activeOrdersSub", locale)}
          />
          <KPI
            theme={theme}
            label={t("dashboard.queueDepth", locale)}
            value={formatCompactNumber(dispatch.queueDepth)}
            delta={
              broadcastingCount > 0
                ? t("dashboard.queueDepth.broadcasting", locale, {
                    count: formatCompactNumber(broadcastingCount),
                  })
                : undefined
            }
            sub={
              dispatch.averageEtaMinutes
                ? t("dashboard.queueDepthSub", locale, {
                    eta: dispatch.averageEtaMinutes,
                  })
                : t("dashboard.queueDepthSubPending", locale)
            }
          />
          <KPI
            theme={theme}
            label={t("dashboard.kpi.dispatchEligibleDrivers", locale)}
            value={formatCompactNumber(dispatchEligibleDrivers)}
            sub={t("dashboard.onlineDriversSub", locale)}
            hint={t("dashboard.kpi.dispatchEligibleDrivers.hint", locale, {
              count: formatCompactNumber(onlineDrivers),
            })}
          />
          <KPI
            theme={theme}
            label={t("dashboard.kpi.staleLocation", locale)}
            value={formatCompactNumber(staleLocationDrivers)}
            delta={
              staleLocationDrivers > 0
                ? t("dashboard.kpi.staleLocation.delta", locale, {
                    count: formatCompactNumber(staleLocationDrivers),
                  })
                : undefined
            }
            deltaTone={
              staleLocationDrivers > 0 || operations.offlineVehicles > 0
                ? "down"
                : "neutral"
            }
            sub={t("dashboard.dispatchableVehiclesSub", locale, {
              count: operations.offlineVehicles,
            })}
            hint={staleLocationDelta}
          />
          <KPI
            theme={theme}
            label={t("dashboard.kpi.openComplaints", locale)}
            value={formatCompactNumber(activeComplaints.length)}
            delta={
              complaintSlaBreachedCount > 0
                ? t("dashboard.kpi.openComplaints.delta", locale, {
                    count: formatCompactNumber(complaintSlaBreachedCount),
                  })
                : undefined
            }
            deltaTone={complaintSlaBreachedCount > 0 ? "down" : "neutral"}
            sub={t("dashboard.kpi.openComplaints.sub", locale, {
              count: formatCompactNumber(highSeverityComplaintCount),
            })}
          />
          <KPI
            theme={theme}
            label={t("dashboard.kpi.incidentsInResponse", locale)}
            value={formatCompactNumber(incidentInResponseCount)}
            delta={
              criticalIncidentCount > 0
                ? t("dashboard.kpi.incidentsInResponse.delta", locale, {
                    count: formatCompactNumber(criticalIncidentCount),
                  })
                : undefined
            }
            deltaTone={criticalIncidentCount > 0 ? "down" : "neutral"}
            sub={t("dashboard.kpi.incidentsInResponse.sub", locale, {
              count: formatCompactNumber(operations.openIncidents),
            })}
          />
        </div>

        <div style={splitGridStyle}>
          <Card
            theme={theme}
            title={t("dashboard.section.attention.title", locale)}
            subtitle={t("dashboard.section.attention.subtitle", locale)}
            actions={
              <ActionLinkButton
                action={{
                  descriptor: buildAction("open_dispatch", "low"),
                  label: t("dashboard.section.queue.openDispatch", locale),
                  en: t("dashboard.section.queue.openDispatch.short", "en"),
                  href: buildDashboardDispatchHref("ready_queue"),
                }}
                locale={locale}
                variant="ghost"
              />
            }
          >
            <div style={bannerStackStyle}>
              {banners.length > 0
                ? banners.map((banner) => (
                    <Banner
                      key={banner.key}
                      theme={theme}
                      tone={banner.tone}
                      icon={<CanvasIcon name="warn" size={16} />}
                      title={banner.title}
                      body={banner.body}
                      actions={
                        <div style={metaRowStyle}>
                          {banner.actions.map((action, index) => (
                            <ActionLinkButton
                              key={`${banner.key}-${index}`}
                              action={action}
                              locale={locale}
                              variant={
                                index === 0 && banner.tone === "danger"
                                  ? "primary"
                                  : "secondary"
                              }
                            />
                          ))}
                        </div>
                      }
                    />
                  ))
                : bannerEmptyState && (
                    <EmptyStateCard
                      emptyState={bannerEmptyState}
                      locale={locale}
                    />
                  )}
            </div>
          </Card>

          <Card
            theme={theme}
            title={t("dashboard.section.healthSignals.title", locale)}
            subtitle={t("dashboard.section.healthSignals.subtitle", locale)}
          >
            {signalEmptyState ? (
              <EmptyStateCard emptyState={signalEmptyState} locale={locale} />
            ) : (
              <div style={signalListStyle}>
                {healthSignals.map((signal, index) => (
                  <div key={`${signal.label}-${index}`} style={signalRowStyle}>
                    <Pill theme={theme} tone={signal.tone} dot>
                      {signal.value}
                    </Pill>
                    <span style={signalLabelStyle}>{signal.label}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card
          theme={theme}
          title={t("dashboard.section.queue.title", locale)}
          padding={0}
          actions={
            <ActionLinkButton
              action={{
                descriptor: buildAction("open_dispatch", "low"),
                label: t("dashboard.section.queue.openDispatch", locale),
                en: t("dashboard.section.queue.openDispatch.short", "en"),
                href: buildDashboardDispatchHref("ready_queue"),
              }}
              locale={locale}
              variant="ghost"
            />
          }
        >
          {queueEmptyState ? (
            <div style={{ padding: 16 }}>
              <EmptyStateCard emptyState={queueEmptyState} locale={locale} />
            </div>
          ) : (
            <Table theme={theme} columns={queueColumns} rows={queueRows} />
          )}
        </Card>
      </div>
    </>
  );
}
