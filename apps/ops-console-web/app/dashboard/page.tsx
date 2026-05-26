import Link from "next/link";
import type { ReactNode } from "react";
import type {
  DispatchJobRecord,
  DriverRegistryRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  IncidentRecord,
  MaintenanceListResponse,
  OperationalAdapterDetailRecord,
  OperationalAlertRecord,
  OperationalAlertState,
  OperationalObservabilitySnapshot,
  OperationalRoleView,
  OwnedOrderRecord,
  ReportJobRecord,
  ShiftRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import {
  buildDispatchInsights,
  buildOperationsOverview,
  buildRevenueInsights,
  formatCompactNumber,
  formatMinorCurrency,
} from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
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

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

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
  if (locale === "en") {
    switch (key) {
      case "orderNo":
        return "ORDER";
      case "tenant":
        return "TENANT";
      case "pickup":
        return "PICKUP";
      case "window":
        return "WIN";
      case "statePill":
        return "STATE";
      case "driver":
        return "DRIVER";
      case "eta":
        return "ETA";
      default:
        return String(key).toUpperCase();
    }
  }

  switch (key) {
    case "orderNo":
      return "訂單";
    case "tenant":
      return "租戶";
    case "pickup":
      return "上車地";
    case "window":
      return "時窗";
    case "statePill":
      return "狀態";
    case "driver":
      return "司機";
    case "eta":
      return "ETA";
    default:
      return String(key);
  }
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
  const client = getOpsClient();
  const locale = await getServerLocale();
  const [
    identity,
    health,
    orders,
    dispatchJobs,
    driverTasks,
    vehicles,
    drivers,
    shifts,
    incidents,
    maintenance,
    reportJobs,
    driverStatements,
    observability,
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
    resolveOrFallback(() => client.listOrders(), [] as OwnedOrderRecord[]),
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
    resolveOrFallback(() => client.listMaintenance(), {
      items: [],
      availableActions: [],
      refresh: {
        generatedAt: new Date().toISOString(),
        staleAfterMs: 15_000,
        dataFreshness: "unknown",
        source: "live",
      },
    } as MaintenanceListResponse),
    resolveOrFallback(() => client.listReportJobs(), [] as ReportJobRecord[]),
    resolveOrFallback(
      () => client.listDriverStatements(),
      [] as DriverStatementRecord[],
    ),
    resolveOrFallback(
      () => client.getOperationalObservability(),
      createFallbackObservabilitySnapshot(),
    ),
  ]);

  const dispatch = buildDispatchInsights(orders, dispatchJobs);
  const operations = buildOperationsOverview({
    vehicles,
    drivers,
    shifts,
    incidents,
    maintenance: maintenance.items,
    reportJobs,
  });
  const todayRevenue = buildRevenueInsights(
    orders,
    driverTasks,
    driverStatements,
    {
      period: "today",
      serviceBucket: "all",
      vehicleId: "all",
    },
  );
  const criticalIncidentCount = incidents.filter(
    (incident: IncidentRecord) =>
      (incident.status === "open" || incident.status === "investigating") &&
      incident.severity === "critical",
  ).length;
  const dispatchEligibleDrivers =
    observability.driverState.dispatchEligibleDrivers ||
    operations.onlineDrivers;
  const staleLocationDrivers = observability.driverState.staleLocationDrivers;
  const staleLocationDelta =
    observability.driverState.oldestLocationLagMinutes !== null
      ? locale === "en"
        ? `>${observability.driverState.oldestLocationLagMinutes} min`
        : `>${observability.driverState.oldestLocationLagMinutes} 分鐘`
      : undefined;

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

  const queueAttentionCount =
    dispatch.redispatchOrders +
    dispatch.exceptionOrders +
    observability.dispatch.laggedOrders;
  const broadcastingCount = dispatchJobs.filter(
    (job: DispatchJobRecord) => job.status === "matching",
  ).length;

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
          href:
            topAlert.key === "adapter_degradation" ? "/dispatch" : "/incidents",
          cta:
            topAlert.key === "adapter_degradation"
              ? t("dashboard.platformOps.openDispatch", locale)
              : t("dashboard.quicklink.incidents", locale),
        }
      : null,
    queueAttentionCount > 0
      ? {
          key: "dispatch-queue",
          tone: queueAttentionCount > dispatch.queueDepth ? "danger" : "warn",
          title: t("dashboard.dispatchBoards.title", locale),
          body: t("dashboard.dispatchBoards.ownedSummary", locale, {
            redispatch: dispatch.redispatchOrders,
            exceptions: dispatch.exceptionOrders,
          }),
          href: "/dispatch?view=owned",
          cta: t("dashboard.dispatchBoards.openOwned", locale),
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
          href: "/dispatch?view=forwarded",
          cta: t("dashboard.dispatchBoards.openForwarded", locale),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    tone: "info" | "warn" | "danger" | "success";
    title: string;
    body: string;
    href: string;
    cta: string;
  }>;

  const healthSignals: Array<{
    label: string;
    value: string;
    tone: CanvasTone;
  }> = [
    {
      label: t("dashboard.runtime.apiStatus", locale),
      value: health.status,
      tone: getHealthTone(health.status),
    },
    {
      label: t("dashboard.queueDepth", locale),
      value: formatCompactNumber(dispatch.queueDepth),
      tone: dispatch.queueDepth > 0 ? "info" : "success",
    },
    {
      label: t("dashboard.alert.dispatch_lag.title", locale),
      value: formatCompactNumber(observability.dispatch.laggedOrders),
      tone:
        observability.dispatch.laggedOrders > 0
          ? "warn"
          : ("success" as CanvasTone),
    },
    ...observability.adapterDetails
      .slice(0, 2)
      .map((adapter: OperationalAdapterDetailRecord) => ({
        label: formatOpsCodeLabel(locale, adapter.platformCode),
        value: adapter.status,
        tone: getHealthTone(adapter.status),
      })),
    {
      label: t("dashboard.runtime.title", locale),
      value: `${identity?.realm ?? t("dashboard.runtime.anonymous", locale)} / ${identity?.actorType ?? t("dashboard.runtime.anonymous", locale)}`,
      tone: "neutral",
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
            {state}
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

  return (
    <>
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
            label={t("dashboard.onlineDrivers", locale)}
            value={formatCompactNumber(dispatchEligibleDrivers)}
            sub={t("dashboard.onlineDriversSub", locale)}
            hint={
              locale === "en"
                ? `${formatCompactNumber(operations.onlineDrivers)} on shift`
                : `${formatCompactNumber(operations.onlineDrivers)} 在班`
            }
          />
          <KPI
            theme={theme}
            label={t("dashboard.dispatchableVehicles", locale)}
            value={formatCompactNumber(operations.dispatchableVehicles)}
            delta={
              staleLocationDrivers > 0
                ? locale === "en"
                  ? `${formatCompactNumber(staleLocationDrivers)} stale`
                  : `${formatCompactNumber(staleLocationDrivers)} 筆 stale`
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
            label={t("dashboard.openIncidents", locale)}
            value={formatCompactNumber(operations.openIncidents)}
            delta={
              operations.overdueMaintenance > 0
                ? `${formatCompactNumber(operations.overdueMaintenance)} breach`
                : undefined
            }
            deltaTone={operations.overdueMaintenance > 0 ? "down" : "neutral"}
            sub={t("dashboard.openIncidentsSub", locale, {
              count: operations.overdueMaintenance,
            })}
          />
          <KPI
            theme={theme}
            label={t("dashboard.todayRevenue", locale)}
            value={formatMinorCurrency(todayRevenue.totalRevenueMinor)}
            delta={
              criticalIncidentCount > 0
                ? locale === "en"
                  ? `${formatCompactNumber(criticalIncidentCount)} critical`
                  : `${formatCompactNumber(criticalIncidentCount)} 重大`
                : undefined
            }
            deltaTone={criticalIncidentCount > 0 ? "down" : "neutral"}
            sub={t("dashboard.todayRevenueSub", locale, {
              trips: formatCompactNumber(todayRevenue.completedTrips),
            })}
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
                    icon={<CanvasIcon name="warn" size={16} />}
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
                  icon={<CanvasIcon name="health" size={16} />}
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
    </>
  );
}
