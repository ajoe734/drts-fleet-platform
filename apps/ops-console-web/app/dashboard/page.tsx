import Link from "next/link";
import type { ReactNode } from "react";
import type {
  ComplaintCaseRecord,
  DispatchJobRecord,
  DriverRegistryRecord,
  DriverTaskRecord,
  EmptyReason,
  EmptyStateEnvelope,
  IncidentRecord,
  MaintenanceRecord,
  OperationalObservabilitySnapshot,
  OperationalRoleView,
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
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

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
  tenant: string;
  pickup: string;
  window: string;
  state: string;
  driver: string;
  eta: string;
};

type DashboardActionLink = {
  descriptor: ResourceActionDescriptor;
  label: string;
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
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
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

function buildShellNav(
  locale: Locale,
  counts: {
    dashboard: number;
    dispatch: number;
    incidents: number;
  },
): CanvasShellNavItem[] {
  return [
    { divider: locale === "en" ? "Workspaces" : "工作面" },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: t("nav.dashboard", locale),
      ...(counts.dashboard > 0
        ? { badge: String(counts.dashboard), badgeTone: "warn" as const }
        : {}),
    },
    { divider: locale === "en" ? "Live Ops" : "即時派遣" },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: t("nav.dispatch", locale),
      matchPaths: ["/dispatch"],
      ...(counts.dispatch > 0
        ? { badge: String(counts.dispatch), badgeTone: "accent" as const }
        : {}),
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: t("nav.callcenter", locale),
    },
    { divider: locale === "en" ? "Casework" : "案件處理" },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: t("nav.complaints", locale),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: t("nav.incidents", locale),
      matchPaths: ["/incidents"],
      ...(counts.incidents > 0
        ? { badge: String(counts.incidents), badgeTone: "danger" as const }
        : {}),
    },
    { divider: locale === "en" ? "Monitoring" : "營運監控" },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: t("nav.reports", locale),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: t("nav.revenue", locale),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: t("nav.attendance", locale),
    },
    { divider: locale === "en" ? "Registry" : "主資料" },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet",
      label: t("nav.drivers", locale),
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: t("nav.vehicles", locale),
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts",
      label: t("nav.contracts", locale),
    },
    {
      key: "feature-flags",
      href: "/feature-flags",
      icon: "flags",
      label: t("nav.featureFlags", locale),
    },
  ];
}

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

function formatWindow(order: OwnedOrderRecord, locale: Locale) {
  if (!order.reservationWindowStart || !order.reservationWindowEnd) {
    return locale === "zh" ? "即時" : "realtime";
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

function getAlertTone(state: "healthy" | "warning" | "critical"): CanvasTone {
  if (state === "critical") {
    return "danger";
  }
  if (state === "warning") {
    return "warn";
  }
  return "success";
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

function isComplaintActive(status: ComplaintCaseRecord["status"]) {
  return ["new", "assigned", "under_investigation", "reopened"].includes(
    status,
  );
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

function formatAlertValue(
  value: number,
  unit: "count" | "minutes" | "percent",
  locale: Locale,
) {
  if (unit === "minutes") {
    return locale === "en" ? `${value} min` : `${value} 分鐘`;
  }
  if (unit === "percent") {
    return `${value}%`;
  }
  return formatCompactNumber(value);
}

function getAlertSummary(
  alertKey: string,
  observability: OperationalObservabilitySnapshot,
  locale: Locale,
) {
  switch (alertKey) {
    case "dispatch_lag":
      return t("dashboard.alert.dispatch_lag.summary", locale, {
        count: observability.dispatch.laggedOrders,
      });
    case "recording_backlog":
      return t("dashboard.alert.recording_backlog.summary", locale, {
        count: observability.recording.pendingOrders,
      });
    case "driver_state_lag":
      return t("dashboard.alert.driver_state_lag.summary", locale, {
        count: observability.driverState.staleLocationDrivers,
      });
    case "eligibility_review_backlog":
      return t("dashboard.alert.eligibility_review_backlog.summary", locale, {
        count: observability.eligibility.totalReviewQueue,
      });
    case "adapter_degradation":
      return t("dashboard.alert.adapter_degradation.summary", locale, {
        count:
          observability.adapters.degradedAdapters +
          observability.adapters.downAdapters,
      });
    default:
      return "";
  }
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
    health,
    orders,
    dispatchJobs,
    driverTasks,
    vehicles,
    drivers,
    shifts,
    incidents,
    maintenance,
    complaints,
    reportJobs,
    observability,
  ] = await Promise.all([
    resolveOrFallback(loadHealthPayload, {
      service: "api",
      status: "degraded",
      mode: "unknown",
      execution_mode: "unknown",
      timestamp: new Date().toISOString(),
    }),
    resolveOrFallback(
      () => client.listDispatchJobs(),
      [] as DispatchJobRecord[],
    ),
    resolveOrFallback(() => client.listDriverTasks(), [] as DriverTaskRecord[]),
    resolveOrFallback(
      () => client.listVehicles(),
      [] as VehicleRegistryRecord[],
    ),
    resolveOrFallback(() => client.listDrivers(), [] as DriverRegistryRecord[]),
    resolveOrFallback(() => client.listShifts(), [] as ShiftRecord[]),
    resolveOrFallback(() => client.listIncidents(), [] as IncidentRecord[]),
    resolveOrFallback(
      () => client.listMaintenance(),
      [] as MaintenanceRecord[],
    ),
    resolveOrFallback(
      () => client.listComplaints(),
      [] as ComplaintCaseRecord[],
    ),
    resolveOrFallback(() => client.listReportJobs(), [] as ReportJobRecord[]),
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
        client.getListEnvelope<DriverStatementRecord>("/api/driver-statements"),
      createFallbackListEnvelope([] as DriverStatementRecord[]),
    ),
    resolveOrFallback(
      () =>
        client.getEnvelope<OperationalObservabilitySnapshot>(
          "/api/operational-observability",
        ),
      createFallbackEnvelope(createFallbackObservabilitySnapshot()),
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
  const driverStatements = driverStatementsResponse.data.items;
  const observability = observabilityResponse.data;

  const dispatch = buildDispatchInsights(orders, dispatchJobs);
  const operations = buildOperationsOverview({
    vehicles,
    drivers,
    shifts,
    incidents,
    maintenance,
    reportJobs,
  });
  const activeComplaintCount = complaints.filter((record) =>
    isComplaintActive(record.status),
  ).length;
  const complaintSlaBreachCount = complaints.filter(
    (record) => isComplaintActive(record.status) && record.slaBreach,
  ).length;
  const criticalIncidentCount = incidents.filter(
    (incident) =>
      (incident.status === "open" || incident.status === "investigating") &&
      incident.severity === "critical",
  ).length;

  const opsAlertKeys = new Set(
    observability.roleViews.find(
      (view: OperationalRoleView) => view.route === "ops",
    )?.alertKeys ?? [],
  );
  const opsAlerts = observability.alerts
    .filter(
      (alert: OperationalAlertRecord) =>
        opsAlertKeys.has(alert.key) || alert.routes.includes("ops"),
    )
    .sort((left: OperationalAlertRecord, right: OperationalAlertRecord) => {
      const severityRank: Record<OperationalAlertState, number> = {
        critical: 0,
        warning: 1,
        healthy: 2,
      };
      const leftSeverity =
        severityRank[left.state as OperationalAlertState] ?? 99;
      const rightSeverity =
        severityRank[right.state as OperationalAlertState] ?? 99;
      return leftSeverity - rightSeverity;
    });

  const adapterAttentionCount =
    observability.adapters.degradedAdapters +
    observability.adapters.downAdapters;
  const topAlert = opsAlerts[0];
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
      driverStatementsResponse.meta.timestamp,
    ],
    health.timestamp,
  );
  const refreshMetadata = getRefreshMetadata(
    dashboardGeneratedAt,
    healthEnvelope,
  );
  const refreshAction: DashboardActionLink = {
    descriptor: buildAction("refresh_dashboard", "low"),
    label: getActionButtonLabel("refresh_dashboard", locale),
    href: "/dashboard?refresh=1",
  };
  const handbookAction: DashboardActionLink = {
    descriptor: buildAction("open_duty_handbook", "low"),
    label: getActionButtonLabel("open_duty_handbook", locale),
    link: {
      targetApp: "ops-console",
      route: "/docs/03-runbooks/phase1-operator-routing-runbook.md",
      resourceType: "runbook",
      resourceId: "phase1-operator-routing-runbook",
      openMode: "new_tab",
      label: "Duty handbook",
    },
  };
  const callSessionAction: DashboardActionLink = {
    descriptor: buildAction("open_call_session", "medium"),
    label: getActionButtonLabel("open_call_session", locale),
    href: "/callcenter",
  };

  const queueAttentionCount =
    dispatch.redispatchOrders +
    dispatch.exceptionOrders +
    observability.dispatch.laggedOrders +
    orders.filter((order: OwnedOrderRecord) => order.status === "no_supply")
      .length;
  const broadcastingCount = dispatchJobs.filter(
    (job) => job.status === "matching",
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
  const eligibleVehicleGap =
    operations.dispatchableVehicles - dispatch.queueDepth;
  const topAdapter =
    [...observability.adapterDetails].sort((left, right) => {
      const severityDiff =
        getAdapterSeverityRank(left.status) -
        getAdapterSeverityRank(right.status);
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return right.lastCheckedAt.localeCompare(left.lastCheckedAt);
    })[0] ??
    observability.adapterDetails[0] ??
    null;

  const shellNav = buildShellNav(locale, {
    dashboard: Math.max(opsAlerts.length, adapterAttentionCount),
    dispatch: dispatch.queueDepth,
    incidents: operations.openIncidents,
  });

  const headerSubtitle = [
    formatTimestamp(health.timestamp, locale),
    locale === "en"
      ? `mode ${health.mode}`
      : `模式 ${formatOpsCodeLabel(locale, health.mode)}`,
    locale === "en"
      ? `execution ${health.execution_mode}`
      : `執行 ${formatOpsCodeLabel(locale, health.execution_mode)}`,
  ].join(" · ");

  const banners = [
    topAlert
      ? {
          key: topAlert.key,
          tone: getAlertTone(topAlert.state),
          title: t(`dashboard.alert.${topAlert.key}.title`, locale),
          body: `${getAlertSummary(topAlert.key, observability, locale)} · ${t(
            "dashboard.operational.thresholds",
            locale,
            {
              warning: formatAlertValue(
                topAlert.thresholds.warning,
                topAlert.thresholds.unit,
                locale,
              ),
              critical: formatAlertValue(
                topAlert.thresholds.critical,
                topAlert.thresholds.unit,
                locale,
              ),
            },
          )}`,
          actions: [
            topAlert.key === "adapter_degradation"
              ? {
                  descriptor: buildAction("open_forwarded_dispatch", "low"),
                  label: t("dashboard.platformOps.openDispatch", locale),
                  href: buildDashboardDispatchHref("forwarded_mirror"),
                }
              : {
                  descriptor: buildAction("open_incidents", "medium"),
                  label: t("dashboard.quicklink.incidents", locale),
                  href: "/incidents",
                },
          ],
        }
      : null,
    criticalIncidentCount > 0
      ? {
          key: "critical-incident",
          tone: "danger" as const,
          title:
            locale === "en"
              ? `${criticalIncidentCount} critical incident${criticalIncidentCount > 1 ? "s" : ""} need immediate review`
              : `${criticalIncidentCount} 件重大事故待立即處理`,
          body:
            locale === "en"
              ? "Critical incident banners must interrupt the shift handover. Review incident recovery before touching lower-priority queue work."
              : "重大事故必須在交接時第一時間被看見。請先處理 incident recovery，再回到較低優先派遣佇列。",
          actions: [
            {
              descriptor: buildAction("open_incidents", "medium"),
              label: getActionButtonLabel("open_incidents", locale),
              href: "/incidents",
            },
          ],
        }
      : null,
    queueAttentionCount > 0
      ? {
          key: "dispatch-queue",
          tone: queueAttentionCount > dispatch.queueDepth ? "danger" : "warn",
          title: t("dashboard.dispatchBoards.title", locale),
          body:
            locale === "en"
              ? `${noSupplyCount} no-supply · ${exceptionHoldCount} exception hold · ${overridePendingCount} override pending`
              : `${noSupplyCount} 筆 no_supply · ${exceptionHoldCount} 筆 exception_hold · ${overridePendingCount} 筆 override_pending`,
          actions: [
            {
              descriptor: buildAction("open_dispatch", "low"),
              label: t("dashboard.dispatchBoards.openOwned", locale),
              href:
                noSupplyCount > 0
                  ? buildDashboardDispatchHref("no_eligible_supply")
                  : exceptionHoldCount > 0
                    ? buildDashboardDispatchHref("exception_hold")
                    : buildDashboardDispatchHref("governance_blocked"),
            },
          ],
        }
      : null,
    adapterAttentionCount > 0
      ? {
          key: "platform-ops",
          tone: "warn" as const,
          title: t("dashboard.platformOps.metrics.adapters", locale),
          body: t("dashboard.platformOps.degradedBanner", locale, {
            count: adapterAttentionCount,
          }),
          actions: [
            {
              descriptor: buildAction("open_forwarded_dispatch", "low"),
              label: t("dashboard.dispatchBoards.openForwarded", locale),
              href: buildDashboardDispatchHref("forwarded_mirror"),
            },
            {
              descriptor: buildAction("inspect_adapter_registry", "low"),
              label: getActionButtonLabel("inspect_adapter_registry", locale),
              link: {
                targetApp: "platform-admin",
                route: "/adapter-registry",
                resourceType: "adapter_registry",
                resourceId: topAdapter?.platformCode ?? "all",
                openMode: "new_tab",
                label: "Adapter registry",
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
      label: t("dashboard.alert.dispatch_lag.title", locale),
      value: formatCompactNumber(observability.dispatch.laggedOrders),
      tone:
        observability.dispatch.laggedOrders > 0
          ? "warn"
          : ("success" as CanvasTone),
    },
    {
      label: locale === "en" ? "Webhook queued deliveries" : "Webhook 排隊投遞",
      value: formatCompactNumber(observability.webhook.queuedDeliveries),
      tone:
        observability.webhook.queuedDeliveries > 0
          ? "warn"
          : ("success" as CanvasTone),
    },
    {
      label: t("dashboard.runtime.apiStatus", locale),
      value: health.status,
      tone: getHealthTone(health.status),
    },
    ...observability.adapterDetails.slice(0, 2).map((adapter) => ({
      label: formatOpsCodeLabel(locale, adapter.platformCode),
      value: adapter.status,
      tone: getHealthTone(adapter.status),
    })),
  ];

  const jobByOrderId = new Map(dispatchJobs.map((job) => [job.orderId, job]));
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
        tenant: getTenantLabel(order),
        pickup: getAddressLabel(order.pickup),
        window: formatWindow(order, locale),
        state,
        driver: task?.driverId ?? "—",
        eta: formatEtaLabel(
          job?.latestEtaMinutes ?? order.etaSnapshot?.etaMinutes,
        ),
      };
    });

  const queueColumns: CanvasTableColumn<QueueRow>[] = [
    {
      h: "ORDER",
      w: 126,
      mono: true,
      r: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href={`/dispatch/${encodeURIComponent(row.orderId)}`}
            style={{
              color: theme.accent,
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            {row.orderNo}
          </Link>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {row.orderId}
          </span>
        </div>
      ),
    },
    { h: "TENANT", k: "tenant", w: 140, mono: true },
    {
      h: "PICKUP",
      k: "pickup",
      w: 300,
    },
    { h: "WIN", k: "window", w: 132, mono: true },
    {
      h: "STATE",
      w: 142,
      r: (row) => (
        <Pill theme={theme} tone={getStateTone(row.state)} dot>
          {row.state}
        </Pill>
      ),
    },
    { h: "DRIVER", k: "driver", w: 112, mono: true },
    { h: "ETA", k: "eta", w: 78, mono: true },
  ];

  return (
    <Shell
      theme={theme}
      nav={shellNav}
      active="dashboard"
      brandLabel={t("app.name", locale)}
      brandSubLabel={t("app.sub", locale)}
      breadcrumb={[t("nav.dashboard", locale)]}
      env="production"
      versionLabel="canvas"
      searchPlaceholder={t("common.search", locale)}
      avatarLabel="OC"
      style={{ height: "100%" }}
    >
      <PageHeader
        theme={theme}
        title={t("dashboard.title", locale)}
        subtitle={headerSubtitle}
        actions={
          <>
            <Btn theme={theme} icon="ext">
              {locale === "en" ? "Duty handbook" : "值班手冊"}
            </Btn>
            <Btn theme={theme} variant="primary" icon="phone">
              {locale === "en" ? "Open call session" : "開新 call session"}
            </Btn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={t("dashboard.activeOrders", locale)}
            value={formatCompactNumber(dispatch.activeOrders)}
            delta={
              dispatch.redispatchOrders > 0
                ? `${formatCompactNumber(dispatch.redispatchOrders)} redispatch`
                : undefined
            }
            deltaTone={dispatch.redispatchOrders > 0 ? "down" : "neutral"}
            sub={t("dashboard.activeOrdersSub", locale)}
          />
          <KPI
            theme={theme}
            label={t("dashboard.queueDepth", locale)}
            value={formatCompactNumber(dispatch.queueDepth)}
            delta={
              broadcastingCount > 0
                ? `${formatCompactNumber(broadcastingCount)} broadcasting`
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
            label={locale === "en" ? "Dispatch Eligible Drivers" : "可派司機"}
            value={formatCompactNumber(
              observability.driverState.dispatchEligibleDrivers,
            )}
            delta={
              locale === "en"
                ? `${formatCompactNumber(operations.onlineDrivers)} online`
                : `${formatCompactNumber(operations.onlineDrivers)} 在線`
            }
            deltaTone="neutral"
            sub={t("dashboard.onlineDriversSub", locale)}
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Location Stale" : "位置失聯"}
            value={formatCompactNumber(
              observability.driverState.staleLocationDrivers,
            )}
            delta={
              observability.driverState.missingLocationDrivers > 0
                ? locale === "en"
                  ? `${formatCompactNumber(
                      observability.driverState.missingLocationDrivers,
                    )} missing`
                  : `${formatCompactNumber(
                      observability.driverState.missingLocationDrivers,
                    )} 缺樣本`
                : undefined
            }
            deltaTone={
              observability.driverState.staleLocationDrivers > 0
                ? "down"
                : "neutral"
            }
            sub={
              locale === "en"
                ? "Drivers with stale location samples"
                : "位置樣本逾時司機"
            }
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Open Complaints" : "客訴未結"}
            value={formatCompactNumber(activeComplaintCount)}
            delta={
              complaintSlaBreachCount > 0
                ? locale === "en"
                  ? `${formatCompactNumber(complaintSlaBreachCount)} SLA breach`
                  : `${formatCompactNumber(complaintSlaBreachCount)} SLA 違規`
                : undefined
            }
            deltaTone={complaintSlaBreachCount > 0 ? "down" : "neutral"}
            sub={t("complaints.activeCasesSub", locale)}
          />
          <KPI
            theme={theme}
            label={t("dashboard.openIncidents", locale)}
            value={formatCompactNumber(operations.openIncidents)}
            delta={
              criticalIncidentCount > 0
                ? locale === "en"
                  ? `${formatCompactNumber(criticalIncidentCount)} critical`
                  : `${formatCompactNumber(criticalIncidentCount)} 重大`
                : undefined
            }
            deltaTone={criticalIncidentCount > 0 ? "down" : "neutral"}
            sub={
              locale === "en"
                ? "Active incidents requiring recovery"
                : "需追蹤處置的進行中事故"
            }
          />
        </div>

        <div style={splitGridStyle}>
          <Card
            theme={theme}
            title={locale === "en" ? "Today's Attention" : "今日待處理"}
            subtitle={
              locale === "en"
                ? "Critical first, then SLA breach, then blocking queue"
                : "排序：critical → SLA breach → blocking"
            }
            actions={
              <Btn theme={theme} variant="ghost">
                {locale === "en" ? "Open all" : "展開所有"}
              </Btn>
            }
          >
            <div style={bannerStackStyle}>
              {banners.length > 0 ? (
                banners.map((banner) => (
                  <Banner
                    key={banner.key}
                    theme={theme}
                    tone={banner.tone}
                    title={banner.title}
                    body={banner.body}
                    actions={
                      <Link
                        href={banner.href}
                        style={{ textDecoration: "none" }}
                      >
                        <Btn
                          theme={theme}
                          variant={
                            banner.tone === "danger" ? "primary" : "secondary"
                          }
                        >
                          {banner.cta}
                        </Btn>
                      </Link>
                    }
                  />
                ))
              ) : (
                <Banner
                  theme={theme}
                  tone="info"
                  title={t("dashboard.exceptions.title", locale)}
                  body={t("dashboard.exceptions.none", locale)}
                />
              )}
            </div>
          </Card>

          <Card
            theme={theme}
            title={locale === "en" ? "Health Signals" : "健康訊號"}
          >
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
          </Card>
        </div>

        <Card
          theme={theme}
          title={
            locale === "en" ? "Current Dispatch Queue" : "當前 dispatch 隊列"
          }
          padding={0}
          actions={
            <Link
              href="/dispatch?view=owned"
              style={{ textDecoration: "none" }}
            >
              <Btn theme={theme} variant="ghost">
                {locale === "en" ? "Open dispatch" : "前往派遣"}
              </Btn>
            </Link>
          }
        >
          <Table theme={theme} columns={queueColumns} rows={queueRows} />
        </Card>
      </div>
    </Shell>
  );
}
