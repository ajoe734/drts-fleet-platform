import Link from "next/link";
import type {
  DispatchJobRecord,
  DriverRegistryRecord,
  DriverTaskRecord,
  IncidentRecord,
  MaintenanceRecord,
  OperationalAdapterDetailRecord,
  OperationalObservabilitySnapshot,
  OwnedOrderRecord,
  ReportJobRecord,
  ShiftRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  buildDispatchInsights,
  buildOperationsOverview,
  formatCompactNumber,
} from "@/lib/ops-analytics";
import {
  CalloutBanner,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
} from "@drts/ui-web";

type IdentitySummary = { realm?: string; actorType?: string } | null;
type Locale = "en" | "zh";
type HealthPayload = {
  service: string;
  status: string;
  mode: string;
  execution_mode: string;
  timestamp: string;
};

type PendingBanner = {
  key: string;
  tone: "danger" | "warning" | "info";
  title: string;
  description: string;
  href: string;
  cta: string;
};

type HealthSignal = {
  key: string;
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "info";
  detail?: string;
};

type DispatchQueueRow = {
  orderId: string;
  orderNo: string;
  tenant: string;
  pickup: string;
  windowLabel: string;
  state: string;
  tone: "owned" | "warning" | "danger" | "info";
  driver: string;
  eta: string;
  href: string;
};

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

function formatTimestamp(value: string | null, locale: Locale) {
  if (!value) {
    return t("dashboard.platformOps.notReported", locale);
  }

  return `${new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function formatBacklogSummary(value: number | null, locale: Locale) {
  if (value === null) {
    return t("dashboard.platformOps.noLag", locale);
  }

  return t("dashboard.platformOps.oldestLag", locale, {
    value: formatAlertValue(value, "minutes", locale),
  });
}

function formatWindowLabel(order: OwnedOrderRecord, locale: Locale) {
  const start = order.reservationWindowStart;
  const end = order.reservationWindowEnd;
  const formatter = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : "zh-TW",
    {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    },
  );

  if (start && end) {
    return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
  }

  if (end) {
    return formatter.format(new Date(end));
  }

  if (start) {
    return formatter.format(new Date(start));
  }

  return locale === "en" ? "Realtime" : "即時";
}

function toneForHealthStatus(status: string): HealthSignal["tone"] {
  switch (status) {
    case "healthy":
      return "success";
    case "degraded":
    case "warning":
      return "warning";
    case "critical":
    case "down":
      return "danger";
    default:
      return "info";
  }
}

function toneForQueueRow(order: OwnedOrderRecord): DispatchQueueRow["tone"] {
  if (
    order.status === "exception_hold" ||
    order.status === "dispatch_timeout" ||
    order.status === "no_supply"
  ) {
    return "danger";
  }

  if (
    order.status === "delayed_queue" ||
    order.queueFamily === "manual_review_queue"
  ) {
    return "warning";
  }

  if (order.status === "assigned" || order.status === "driver_accepted") {
    return "owned";
  }

  return "info";
}

function buildPendingBanners(
  locale: Locale,
  observability: OperationalObservabilitySnapshot,
  operations: ReturnType<typeof buildOperationsOverview>,
) {
  const banners: PendingBanner[] = [];

  if (operations.openIncidents > 0) {
    banners.push({
      key: "incidents",
      tone: "danger",
      title:
        locale === "en"
          ? `${formatCompactNumber(operations.openIncidents)} active incidents`
          : `${formatCompactNumber(operations.openIncidents)} 件事故待處理`,
      description:
        locale === "en"
          ? "Incident workflow is carrying active work that still needs supervisor attention."
          : "事故工作流仍有進行中的案件，值班主管需要持續跟進。",
      href: "/incidents",
      cta: locale === "en" ? "Open incidents" : "前往事故",
    });
  }

  if (
    observability.dispatch.exceptionHoldOrders > 0 ||
    observability.dispatch.dispatchFailedOrders > 0
  ) {
    banners.push({
      key: "dispatch-exception",
      tone: "warning",
      title:
        locale === "en"
          ? `${formatCompactNumber(observability.dispatch.exceptionHoldOrders)} exception holds in queue`
          : `${formatCompactNumber(observability.dispatch.exceptionHoldOrders)} 筆 exception hold`,
      description:
        locale === "en"
          ? `${formatCompactNumber(observability.dispatch.dispatchFailedOrders)} dispatch failures are waiting in the owned queue.`
          : `${formatCompactNumber(observability.dispatch.dispatchFailedOrders)} 筆 dispatch 失敗仍停留在本地派遣佇列。`,
      href: "/dispatch?view=owned",
      cta: locale === "en" ? "Handle owned queue" : "處理 owned queue",
    });
  }

  if (
    observability.forwarderOps.syncFailedOrders > 0 ||
    observability.forwarderOps.manualFallbackQueue > 0
  ) {
    banners.push({
      key: "forwarded-triage",
      tone: "warning",
      title:
        locale === "en"
          ? `${formatCompactNumber(observability.forwarderOps.syncFailedOrders)} forwarded sync failures`
          : `${formatCompactNumber(observability.forwarderOps.syncFailedOrders)} 筆 forwarded sync failed`,
      description:
        locale === "en"
          ? `${formatCompactNumber(observability.forwarderOps.manualFallbackQueue)} cases are already in manual fallback or reconciliation.`
          : `${formatCompactNumber(observability.forwarderOps.manualFallbackQueue)} 筆已進入 manual fallback 或 reconciliation 處理。`,
      href: "/dispatch",
      cta: locale === "en" ? "Open forwarded board" : "查看 forwarded board",
    });
  }

  if (banners.length === 0) {
    banners.push({
      key: "clear",
      tone: "info",
      title:
        locale === "en"
          ? "No critical handoff items"
          : "目前沒有 critical 待處理",
      description:
        locale === "en"
          ? "Queue, adapter health, and casework are within the current operating threshold."
          : "派遣佇列、adapter 健康與案件處理目前都在可接受門檻內。",
      href: "/dispatch",
      cta: locale === "en" ? "Open dispatch" : "前往派遣",
    });
  }

  return banners.slice(0, 3);
}

function buildHealthSignals(
  locale: Locale,
  health: HealthPayload,
  observability: OperationalObservabilitySnapshot,
  adapterDetails: OperationalAdapterDetailRecord[],
): HealthSignal[] {
  const primaryAdapter = [...adapterDetails].sort((left, right) => {
    const rank = { down: 0, degraded: 1, healthy: 2 } as const;
    return rank[left.status] - rank[right.status];
  })[0];

  return [
    {
      key: "runtime",
      label: locale === "en" ? "API runtime" : "API 執行狀態",
      value: formatOpsCodeLabel(locale, health.status),
      tone: toneForHealthStatus(health.status),
      detail: `${formatOpsCodeLabel(locale, health.mode)} · ${formatOpsCodeLabel(locale, health.execution_mode)}`,
    },
    {
      key: "dispatch-lag",
      label: t("dashboard.alert.dispatch_lag.title", locale),
      value: formatBacklogSummary(
        observability.dispatch.oldestReadyOrderLagMinutes,
        locale,
      ),
      tone: observability.dispatch.laggedOrders > 0 ? "warning" : "success",
      detail: getAlertSummary("dispatch_lag", observability, locale),
    },
    {
      key: "driver-state",
      label: t("dashboard.alert.driver_state_lag.title", locale),
      value: formatCompactNumber(
        observability.driverState.staleLocationDrivers,
      ),
      tone:
        observability.driverState.staleLocationDrivers > 0
          ? "warning"
          : "success",
      detail: formatBacklogSummary(
        observability.driverState.oldestLocationLagMinutes,
        locale,
      ),
    },
    {
      key: "webhook",
      label: locale === "en" ? "Webhook queue" : "Webhook 佇列",
      value: formatCompactNumber(observability.webhook.queuedDeliveries),
      tone:
        observability.webhook.failedDeliveriesLastHour > 0
          ? "warning"
          : "success",
      detail:
        locale === "en"
          ? `${formatCompactNumber(observability.webhook.failedDeliveriesLastHour)} failures in the last hour`
          : `最近 1 小時 ${formatCompactNumber(observability.webhook.failedDeliveriesLastHour)} 筆失敗`,
    },
    {
      key: "adapter",
      label:
        primaryAdapter !== undefined
          ? formatOpsCodeLabel(locale, primaryAdapter.platformCode)
          : t("dashboard.platformOps.metrics.adapters", locale),
      value:
        primaryAdapter !== undefined
          ? t(
              `dispatch.forwarded.health.status.${primaryAdapter.status}`,
              locale,
            )
          : t("dashboard.platformOps.empty", locale),
      tone:
        primaryAdapter !== undefined
          ? toneForHealthStatus(primaryAdapter.status)
          : "info",
      ...(primaryAdapter !== undefined
        ? {
            detail: `${t("dashboard.platformOps.signal.reason", locale)}: ${formatOpsCodeLabel(locale, primaryAdapter.reason)}`,
          }
        : {}),
    },
  ] satisfies HealthSignal[];
}

function buildDispatchQueueRows(
  locale: Locale,
  orders: OwnedOrderRecord[],
  dispatchJobs: DispatchJobRecord[],
  driverTasks: DriverTaskRecord[],
) {
  const dispatchJobByOrderId = new Map(
    dispatchJobs.map((job) => [job.orderId, job] as const),
  );
  const driverTaskByOrderId = new Map(
    driverTasks.map((task) => [task.orderId, task] as const),
  );
  const priorityRank = {
    exception_hold: 0,
    dispatch_timeout: 1,
    no_supply: 2,
    delayed_queue: 3,
    manual_review_queue: 4,
    queued: 5,
    matching: 6,
    assigned: 7,
    driver_accepted: 8,
  } as const;

  return orders
    .filter((order) => {
      return [
        "queued",
        "matching",
        "assigned",
        "driver_accepted",
        "dispatch_timeout",
        "exception_hold",
        "no_supply",
        "delayed_queue",
        "manual_review_queue",
      ].includes(order.status);
    })
    .sort((left, right) => {
      const leftRank =
        priorityRank[left.status as keyof typeof priorityRank] ?? 99;
      const rightRank =
        priorityRank[right.status as keyof typeof priorityRank] ?? 99;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return (
        new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime()
      );
    })
    .slice(0, 5)
    .map((order) => {
      const dispatchJob = dispatchJobByOrderId.get(order.orderId);
      const driverTask = driverTaskByOrderId.get(order.orderId);

      return {
        orderId: order.orderId,
        orderNo: order.orderNo,
        tenant: order.tenantId ?? (locale === "en" ? "shared" : "共用"),
        pickup: order.pickup.addressName ?? order.pickup.address,
        windowLabel: formatWindowLabel(order, locale),
        state: formatOpsCodeLabel(locale, order.status),
        tone: toneForQueueRow(order),
        driver:
          driverTask?.driverId ?? (locale === "en" ? "unassigned" : "未指派"),
        eta:
          dispatchJob?.latestEtaMinutes !== null &&
          dispatchJob?.latestEtaMinutes !== undefined
            ? locale === "en"
              ? `${dispatchJob.latestEtaMinutes} min`
              : `${dispatchJob.latestEtaMinutes} 分鐘`
            : locale === "en"
              ? "pending"
              : "待派送",
        href: `/dispatch?orderId=${order.orderId}`,
      } satisfies DispatchQueueRow;
    });
}

function actionLink(href: string, label: string, primary = false) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: primary ? "10px 14px" : "9px 12px",
        borderRadius: "999px",
        border: primary ? "1px solid #0f172a" : "1px solid #cbd5e1",
        background: primary ? "#0f172a" : "#ffffff",
        color: primary ? "#ffffff" : "#0f172a",
        textDecoration: "none",
        fontSize: "12.5px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Link>
  );
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
    resolveOrFallback(
      () => client.listMaintenance(),
      [] as MaintenanceRecord[],
    ),
    resolveOrFallback(() => client.listReportJobs(), [] as ReportJobRecord[]),
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
    maintenance,
    reportJobs,
  });
  const adapterAttentionCount =
    observability.adapters.degradedAdapters +
    observability.adapters.downAdapters;
  const pendingBanners = buildPendingBanners(locale, observability, operations);
  const healthSignals = buildHealthSignals(
    locale,
    health,
    observability,
    observability.adapterDetails,
  );
  const queueRows = buildDispatchQueueRows(
    locale,
    orders,
    dispatchJobs,
    driverTasks,
  );

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <PageHeader
        eyebrow={locale === "en" ? "Ops dashboard" : "營運總覽"}
        title={t("dashboard.title", locale)}
        subtitle={t("dashboard.subtitle", locale)}
        meta={[
          { label: "API", value: formatOpsCodeLabel(locale, health.status) },
          {
            label: locale === "en" ? "Realm" : "Realm",
            value: identity?.realm ?? (locale === "en" ? "anonymous" : "匿名"),
          },
          {
            label: locale === "en" ? "Shift windows" : "班次視窗",
            value: formatCompactNumber(shifts.length),
          },
        ]}
        actions={
          <>
            {actionLink(
              "/dispatch",
              t("dashboard.platformOps.openDispatch", locale),
            )}
            {actionLink("/callcenter", t("nav.callcenter", locale), true)}
          </>
        }
      />

      <KpiRow minWidth="168px">
        <KpiCard
          label={t("dashboard.activeOrders", locale)}
          value={formatCompactNumber(dispatch.activeOrders)}
          detail={t("dashboard.activeOrdersSub", locale)}
          tone="ops"
        />
        <KpiCard
          label={t("dashboard.queueDepth", locale)}
          value={formatCompactNumber(dispatch.queueDepth)}
          detail={
            dispatch.averageEtaMinutes
              ? t("dashboard.queueDepthSub", locale, {
                  eta: dispatch.averageEtaMinutes,
                })
              : t("dashboard.queueDepthSubPending", locale)
          }
          tone="info"
        />
        <KpiCard
          label={locale === "en" ? "Dispatch eligible drivers" : "可派司機"}
          value={formatCompactNumber(
            observability.driverState.dispatchEligibleDrivers,
          )}
          detail={
            locale === "en"
              ? `${formatCompactNumber(observability.driverState.availableDrivers)} available now`
              : `${formatCompactNumber(observability.driverState.availableDrivers)} 位目前可接單`
          }
          tone="success"
        />
        <KpiCard
          label={t("dashboard.alert.driver_state_lag.title", locale)}
          value={formatCompactNumber(
            observability.driverState.staleLocationDrivers,
          )}
          detail={formatBacklogSummary(
            observability.driverState.oldestLocationLagMinutes,
            locale,
          )}
          tone={
            observability.driverState.staleLocationDrivers > 0
              ? "warning"
              : "success"
          }
        />
        <KpiCard
          label={t("dashboard.openIncidents", locale)}
          value={formatCompactNumber(operations.openIncidents)}
          detail={t("dashboard.openIncidentsSub", locale, {
            count: operations.overdueMaintenance,
          })}
          tone={operations.openIncidents > 0 ? "danger" : "neutral"}
        />
        <KpiCard
          label={t("dashboard.platformOps.metrics.adapters", locale)}
          value={formatCompactNumber(adapterAttentionCount)}
          detail={t("dashboard.platformOps.metrics.adaptersSub", locale, {
            healthy: observability.adapters.healthyAdapters,
            down: observability.adapters.downAdapters,
            total: observability.adapters.totalAdapters,
          })}
          tone={adapterAttentionCount > 0 ? "warning" : "success"}
        />
      </KpiRow>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.55fr) minmax(280px, 1fr)",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <DataViewCard
          title={locale === "en" ? "Today's pending work" : "今日待處理"}
          subtitle={
            locale === "en"
              ? "Sorted by criticality, SLA risk, and queue blocking impact."
              : "依 criticality、SLA 風險與 queue blocking 影響排序。"
          }
          tone="warning"
        >
          {pendingBanners.map((banner) => (
            <CalloutBanner
              key={banner.key}
              title={banner.title}
              description={banner.description}
              tone={banner.tone}
              actions={actionLink(
                banner.href,
                banner.cta,
                banner.tone === "danger",
              )}
            />
          ))}
        </DataViewCard>

        <DataViewCard
          title={locale === "en" ? "Health signals" : "健康訊號"}
          subtitle={formatTimestamp(observability.generatedAt, locale)}
          tone="ops"
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {healthSignals.map((signal) => (
              <div
                key={signal.key}
                style={{
                  display: "grid",
                  gap: "6px",
                  padding: "12px 14px",
                  border: "1px solid #dbe2ea",
                  borderRadius: "14px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#334155",
                    }}
                  >
                    {signal.label}
                  </span>
                  <StatusChip label={signal.value} tone={signal.tone} />
                </div>
                {signal.detail ? (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                      lineHeight: 1.5,
                    }}
                  >
                    {signal.detail}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </DataViewCard>
      </div>

      <DataViewCard
        title={
          locale === "en" ? "Current dispatch queue" : "當前 dispatch 隊列"
        }
        subtitle={
          locale === "en"
            ? "Owned queue rows prioritized by exception, timeout, and fresh updates."
            : "以 exception、timeout 與最新更新優先排序的 owned queue 摘要。"
        }
        tone="ops"
        actions={actionLink(
          "/dispatch?view=owned",
          t("dispatch.view.owned", locale),
          true,
        )}
      >
        {queueRows.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12.5px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontSize: "10.5px",
                  }}
                >
                  {[
                    "Order",
                    "Tenant",
                    locale === "en" ? "Pickup" : "上車點",
                    "Win",
                    "State",
                    "Driver",
                    "ETA",
                  ].map((label) => (
                    <th
                      key={label}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        borderBottom: "1px solid #e2e8f0",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queueRows.map((row) => (
                  <tr
                    key={row.orderId}
                    style={{ borderBottom: "1px solid #eef2f7" }}
                  >
                    <td style={{ padding: "12px" }}>
                      <Link
                        href={row.href}
                        style={{
                          color: "#f97316",
                          textDecoration: "none",
                          fontWeight: 700,
                        }}
                      >
                        {row.orderNo}
                      </Link>
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        color: "#475569",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    >
                      {row.tenant}
                    </td>
                    <td style={{ padding: "12px", color: "#0f172a" }}>
                      {row.pickup}
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        color: "#475569",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.windowLabel}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {row.tone === "owned" ? (
                        <StatusChip authority="owned" label={row.state} />
                      ) : (
                        <StatusChip
                          label={row.state}
                          tone={
                            row.tone === "danger"
                              ? "danger"
                              : row.tone === "warning"
                                ? "warning"
                                : "info"
                          }
                        />
                      )}
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        color: "#0f172a",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    >
                      {row.driver}
                    </td>
                    <td style={{ padding: "12px", color: "#475569" }}>
                      {row.eta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: "18px 20px",
              borderRadius: "14px",
              border: "1px dashed #cbd5e1",
              background: "#f8fafc",
              color: "#64748b",
              fontSize: "13px",
            }}
          >
            {locale === "en"
              ? "No active owned dispatch rows matched the current queue summary."
              : "目前沒有符合摘要條件的 owned dispatch queue 項目。"}
          </div>
        )}
      </DataViewCard>
    </div>
  );
}
