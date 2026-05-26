import Link from "next/link";
import type { ReactNode } from "react";
import type {
  ComplaintCaseRecord,
  CrossAppResourceLink,
  DispatchJobRecord,
  DriverRegistryRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  EmptyReason,
  IncidentRecord,
  MaintenanceRecord,
  OperationalAdapterDetailRecord,
  OperationalAlertRecord,
  OperationalAlertState,
  OperationalObservabilitySnapshot,
  OperationalRoleView,
  OwnedOrderRecord,
  RefreshTier,
  ReportJobRecord,
  ResourceActionDescriptor,
  ShiftRecord,
  UiHealthEnvelope,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
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
import { RefreshControl } from "./refresh-control";

// `/api/health` envelope is bespoke (per-app); the canonical UiHealthEnvelope
// (Q-X12) is derived from it together with per-source fetch outcomes below.
type HealthPayload = {
  service: string;
  status: string;
  mode: string;
  execution_mode: string;
  timestamp: string;
};

type IdentitySummary = {
  realm?: string;
  actorType?: string;
  tenantId?: string;
} | null;

// A backend-emitted EmptyStateEnvelope (per ui-runtime contracts §3.6) is not
// yet attached to the read responses consumed here. Until those land, we tag
// each load outcome so the page can still classify zero-item views as either
// `fetch_failed` (network/proc error) or `no_data` (legit empty).
type Loaded<T> = { ok: true; value: T } | { ok: false; reason: EmptyReason };

async function loadOrFlag<T>(loader: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await loader() };
  } catch {
    return { ok: false, reason: "fetch_failed" };
  }
}

function valueOr<T>(loaded: Loaded<T>, fallback: T): T {
  return loaded.ok ? loaded.value : fallback;
}

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
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 10,
};

const secondaryKpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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

const identityChipRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  gap: 6,
  marginTop: 8,
};

const emptyStateStyle = {
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "flex-start",
  gap: 6,
  padding: "16px 4px",
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
};

const emptyStateTitleStyle = {
  color: theme.text,
  fontWeight: 600,
  fontSize: 13,
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

function getActionButtonLabel(action: string, locale: Locale) {
  switch (action) {
    case "open_call_session":
      return locale === "en" ? "Open call session" : "開新 call session";
    case "open_duty_handbook":
      return locale === "en" ? "Duty handbook" : "值班手冊";
    case "open_dispatch":
      return locale === "en" ? "Open dispatch" : "前往派遣";
    case "open_forwarded_dispatch":
      return locale === "en" ? "Forwarded board" : "查看 forwarded board";
    case "open_incidents":
      return locale === "en" ? "Open incidents" : "前往事故";
    case "inspect_adapter_registry":
      return locale === "en" ? "Adapter registry" : "查看 adapter registry";
    case "refresh_dashboard":
      return locale === "en" ? "Refresh now" : "立即重新整理";
    case "clear_filters":
      return locale === "en" ? "Clear filters" : "清除篩選";
    case "request_access":
      return locale === "en" ? "Request access" : "申請權限";
    case "retry_fetch":
      return locale === "en" ? "Retry load" : "重試載入";
    case "open_platform_status":
      return locale === "en" ? "Platform status" : "查看平台狀態";
    case "contact_owner":
      return locale === "en" ? "Contact owner" : "通知負責人";
    default:
      return formatOpsCodeLabel(locale, action);
  }
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
          ? "dashboard data unavailable"
          : "dashboard data may be stale",
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
      return locale === "en" ? "fresh" : "最新";
    case "stale":
      return locale === "en" ? "stale" : "已過舊";
    case "degraded":
      return locale === "en" ? "degraded" : "降級";
    default:
      return locale === "en" ? "unknown" : "未知";
  }
}

function getRefreshTierLabel(tier: RefreshTier, locale: Locale) {
  if (tier === "medium") {
    return locale === "en" ? "T3 · 15s" : "T3 · 15 秒";
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
        title:
          locale === "en" ? "Nothing urgent right now" : "目前沒有待處理項目",
        body:
          locale === "en"
            ? "This workspace is healthy for the current shift. Monitor refresh time and keep dispatch open for new work."
            : "目前班次狀態穩定。留意 refresh 時間，並保持派遣工作面待命。",
      };
    case "not_provisioned":
      return {
        tone: "warn",
        title: locale === "en" ? "Not provisioned" : "尚未開通",
        body:
          locale === "en"
            ? "The backend reports this feed is not enabled for the current environment or tenant."
            : "後端回報此資料面尚未對目前環境或租戶開通。",
      };
    case "fetch_failed":
      return {
        tone: "danger",
        title: locale === "en" ? "Unable to load data" : "資料載入失敗",
        body:
          locale === "en"
            ? "The request failed. Retry the dashboard or switch to the owning module for direct diagnostics."
            : "請求失敗。請重試儀表板，或前往對應工作面做直接診斷。",
      };
    case "permission_denied":
      return {
        tone: "warn",
        title: locale === "en" ? "Permission required" : "需要權限",
        body:
          locale === "en"
            ? "Your current ops scope cannot see this dataset. Ask the owner app to grant the required role."
            : "你目前的 ops scope 無法查看此資料集。請向 owner app 申請所需角色。",
      };
    case "external_unavailable":
      return {
        tone: "danger",
        title:
          locale === "en"
            ? "External dependency unavailable"
            : "外部依賴不可用",
        body:
          locale === "en"
            ? "An external platform is down or degraded. Use the fallback route and inspect adapter health before taking action."
            : "外部平台停擺或降級。請先使用 fallback 路徑並檢查 adapter 健康狀態。",
      };
    case "filtered_empty":
      return {
        tone: "neutral",
        title: locale === "en" ? "Filters are too narrow" : "篩選條件過窄",
        body:
          locale === "en"
            ? "The current drill-down produced no rows. Clear filters or jump to the full board."
            : "目前 drill-down 條件沒有結果。請清除篩選或回到完整看板。",
      };
    default:
      return {
        tone: "neutral",
        title: locale === "en" ? "No data" : "沒有資料",
        body: emptyState.messageCode,
      };
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
    <Btn
      theme={theme}
      variant={variant}
      disabled={!action.descriptor.enabled}
      icon={action.link?.openMode === "new_tab" ? "ext" : undefined}
    >
      {action.label}
    </Btn>
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
        const action: DashboardActionLink = {
          descriptor: nextActionDescriptor,
          label: getActionButtonLabel(nextActionDescriptor.action, locale),
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
            label: "Adapter registry",
          };
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

function normalizeHealthStatus(
  status: string | null | undefined,
): UiHealthEnvelope["status"] {
  if (!status) {
    return "down";
  }
  if (status === "healthy" || status === "ok") {
    return "healthy";
  }
  if (status === "down" || status === "critical") {
    return "down";
  }
  return "degraded";
}

interface DerivedDegradedSource {
  service: string;
  reason: EmptyReason;
}

function buildDegradedServices(
  health: HealthPayload,
  healthOk: boolean,
  observability: OperationalObservabilitySnapshot,
  sources: DerivedDegradedSource[],
): UiHealthEnvelope["degradedServices"] {
  const entries: UiHealthEnvelope["degradedServices"] = [];
  const healthStatus = normalizeHealthStatus(healthOk ? health.status : "down");

  if (!healthOk || healthStatus === "down") {
    entries.push({
      service: health.service || "ops-api",
      impact: "Ops API unreachable; data may be stale",
      severity: "critical",
    });
  } else if (healthStatus === "degraded") {
    entries.push({
      service: health.service || "ops-api",
      impact: `Ops API status: ${health.status}`,
      severity: "warning",
    });
  }

  for (const source of sources) {
    if (source.reason === "fetch_failed") {
      entries.push({
        service: source.service,
        impact: "Backend read failed; using fallback data",
        severity: "warning",
      });
    }
  }

  for (const adapter of observability.adapterDetails) {
    if (adapter.status === "degraded" || adapter.status === "down") {
      entries.push({
        service: `forwarder:${adapter.platformCode}`,
        impact: adapter.lastError ?? `adapter ${adapter.status}`,
        severity: adapter.status === "down" ? "critical" : "warning",
      });
    }
  }

  return entries;
}

function resolveFreshnessTone(
  freshness: "fresh" | "stale" | "degraded" | "unknown",
): CanvasTone {
  if (freshness === "fresh") return "success";
  if (freshness === "stale") return "info";
  if (freshness === "degraded") return "warn";
  return "neutral";
}

function deriveFreshness(
  healthStatus: UiHealthEnvelope["status"],
  degradedCount: number,
): "fresh" | "stale" | "degraded" | "unknown" {
  if (healthStatus === "down") return "degraded";
  if (healthStatus === "degraded" || degradedCount > 0) return "stale";
  return "fresh";
}

function renderEmptyState(
  locale: Locale,
  reason: EmptyReason,
  action?: { label: string; href: string; newTab?: boolean },
): ReactNode {
  const title = t(`dashboard.empty.${reason}.title`, locale);
  const body = t(`dashboard.empty.${reason}.body`, locale);
  return (
    <div style={emptyStateStyle}>
      <div style={emptyStateTitleStyle}>{title}</div>
      <div>{body}</div>
      {action ? (
        <Link
          href={action.href}
          {...(action.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
          style={{ textDecoration: "none" }}
        >
          <Btn theme={theme} variant="ghost">
            {action.label}
          </Btn>
        </Link>
      ) : null}
    </div>
  );
}

// Cross-app deep link to platform-admin's adapter registry. Encoded as a
// CrossAppResourceLink so renderers can surface the new-tab affordance (§3.10).
function buildAdapterRegistryLink(locale: Locale): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: "/adapter-registry",
    resourceType: "adapter_registry",
    resourceId: "all",
    openMode: "new_tab",
    label: t("dashboard.healthSignals.adapterRegistry", locale),
  };
}

function resolveCrossAppHref(link: CrossAppResourceLink): string {
  // Phase 1 keeps apps as separate deployments. With no shared origin map yet,
  // we deep-link to the route path and rely on the host gateway / reverse
  // proxy to route based on the targetApp.
  return `/${link.targetApp}${link.route}`;
}

export default async function DashboardPage() {
  const client = await getServerOpsClient();
  const locale = await getServerLocale();
  const [
    identityResult,
    healthResult,
    ordersResult,
    dispatchJobsResult,
    driverTasksResult,
    vehiclesResult,
    driversResult,
    shiftsResult,
    incidentsResult,
    maintenanceResult,
    reportJobsResult,
    driverStatementsResult,
    observabilityResult,
    complaintsResult,
  ] = await Promise.all([
    loadOrFlag<IdentitySummary>(
      () => client.getIdentityContext() as Promise<IdentitySummary>,
    ),
    loadOrFlag(loadHealthPayload),
    loadOrFlag(() => client.listOrders()),
    loadOrFlag(() => client.listDispatchJobs()),
    loadOrFlag(() => client.listDriverTasks()),
    loadOrFlag(() => client.listVehicles()),
    loadOrFlag(() => client.listDrivers()),
    loadOrFlag(() => client.listShifts()),
    loadOrFlag(() => client.listIncidents()),
    loadOrFlag(() => client.listMaintenance()),
    loadOrFlag(() => client.listReportJobs()),
    loadOrFlag(() => client.listDriverStatements()),
    loadOrFlag(() => client.getOperationalObservability()),
    loadOrFlag(() => client.listComplaints()),
  ]);

  const identity = valueOr<IdentitySummary>(identityResult, null);
  const health = valueOr<HealthPayload>(healthResult, {
    service: "ops-api",
    status: "down",
    mode: "unknown",
    execution_mode: "unknown",
    timestamp: new Date().toISOString(),
  });
  const orders = valueOr(ordersResult, [] as OwnedOrderRecord[]);
  const dispatchJobs = valueOr(dispatchJobsResult, [] as DispatchJobRecord[]);
  const driverTasks = valueOr(driverTasksResult, [] as DriverTaskRecord[]);
  const vehicles = valueOr(vehiclesResult, [] as VehicleRegistryRecord[]);
  const drivers = valueOr(driversResult, [] as DriverRegistryRecord[]);
  const shifts = valueOr(shiftsResult, [] as ShiftRecord[]);
  const incidents = valueOr(incidentsResult, [] as IncidentRecord[]);
  const maintenance = valueOr(maintenanceResult, [] as MaintenanceRecord[]);
  const reportJobs = valueOr(reportJobsResult, [] as ReportJobRecord[]);
  const driverStatements = valueOr(
    driverStatementsResult,
    [] as DriverStatementRecord[],
  );
  const observability = valueOr(
    observabilityResult,
    createFallbackObservabilitySnapshot(),
  );
  const complaints = valueOr(complaintsResult, [] as ComplaintCaseRecord[]);

  const dispatch = buildDispatchInsights(orders, dispatchJobs);
  const operations = buildOperationsOverview({
    vehicles,
    drivers,
    shifts,
    incidents,
    maintenance,
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

  const activeIncidents = incidents.filter(
    (incident) =>
      incident.status === "open" || incident.status === "investigating",
  );
  const criticalIncidents = activeIncidents.filter(
    (incident) => incident.severity === "critical",
  );
  const firstCriticalIncident = criticalIncidents[0] ?? null;

  const OPEN_COMPLAINT_STATUSES = new Set<ComplaintCaseRecord["status"]>([
    "new",
    "assigned",
    "under_investigation",
    "reopened",
  ]);
  const openComplaints = complaints.filter((c) =>
    OPEN_COMPLAINT_STATUSES.has(c.status),
  );
  const slaBreachComplaints = openComplaints.filter((c) => c.slaBreach);

  const dispatchEligibleDrivers =
    observability.driverState.dispatchEligibleDrivers ||
    operations.onlineDrivers;
  const onlineDrivers =
    observability.driverState.availableDrivers || operations.onlineDrivers;
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

  // UiHealthEnvelope (Q-X12). Derived locally until the backend emits it
  // directly on every response.
  const healthEnvelope: UiHealthEnvelope = {
    status: normalizeHealthStatus(healthResult.ok ? health.status : "down"),
    degradedServices: buildDegradedServices(
      health,
      healthResult.ok,
      observability,
      [
        {
          service: "orders",
          reason: ordersResult.ok ? "no_data" : "fetch_failed",
        },
        {
          service: "dispatch_jobs",
          reason: dispatchJobsResult.ok ? "no_data" : "fetch_failed",
        },
        {
          service: "driver_tasks",
          reason: driverTasksResult.ok ? "no_data" : "fetch_failed",
        },
        {
          service: "incidents",
          reason: incidentsResult.ok ? "no_data" : "fetch_failed",
        },
        {
          service: "complaints",
          reason: complaintsResult.ok ? "no_data" : "fetch_failed",
        },
        {
          service: "observability",
          reason: observabilityResult.ok ? "no_data" : "fetch_failed",
        },
      ],
    ),
    lastCheckedAt: health.timestamp,
  };

  const freshness = deriveFreshness(
    healthEnvelope.status,
    healthEnvelope.degradedServices.length,
  );

  const headerSubtitleParts: string[] = [
    formatTimestamp(health.timestamp, locale),
    locale === "en"
      ? `mode ${health.mode}`
      : `模式 ${formatOpsCodeLabel(locale, health.mode)}`,
    locale === "en"
      ? `execution ${health.execution_mode}`
      : `執行 ${formatOpsCodeLabel(locale, health.execution_mode)}`,
    t("dashboard.refreshTier.medium.sub", locale),
  ];
  const headerSubtitle = headerSubtitleParts.join(" · ");

  const identityChips: Array<{
    label: string;
    value: string;
    tone: CanvasTone;
  }> = [];
  if (identity?.realm) {
    identityChips.push({
      label: t("dashboard.identity.realm", locale),
      value: identity.realm,
      tone: "neutral",
    });
  }
  if (identity?.actorType) {
    identityChips.push({
      label: t("dashboard.identity.actor", locale),
      value: identity.actorType,
      tone: "neutral",
    });
  }
  if (identity?.tenantId) {
    identityChips.push({
      label: t("dashboard.identity.tenant", locale),
      value: identity.tenantId,
      tone: "neutral",
    });
  }

  // Attention banners — sorted critical → SLA → blocking, with explicit
  // cross-app affordances pointing to spec'd `?board=` deep links.
  type AttentionBanner = {
    key: string;
    tone: Exclude<CanvasTone, "neutral">;
    title: ReactNode;
    body: ReactNode;
    href: string;
    cta: string;
    newTab?: boolean;
  };

  const banners: AttentionBanner[] = [];

  if (firstCriticalIncident) {
    banners.push({
      key: "critical-incident",
      tone: "danger",
      title: t("dashboard.attention.criticalIncident.title", locale, {
        incidentId: firstCriticalIncident.incidentId,
      }),
      body: t("dashboard.attention.criticalIncident.body", locale, {
        count: criticalIncidents.length,
      }),
      href: `/incidents/${encodeURIComponent(firstCriticalIncident.incidentId)}`,
      cta: t("dashboard.attention.openIncident", locale),
    });
  }

  if (topAlert) {
    banners.push({
      key: `alert-${topAlert.key}`,
      tone: getAlertTone(topAlert.state) as Exclude<CanvasTone, "neutral">,
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
        topAlert.key === "adapter_degradation"
          ? "/dispatch?board=forwarded"
          : "/incidents",
      cta:
        topAlert.key === "adapter_degradation"
          ? t("dashboard.dispatchBoards.openForwarded", locale)
          : t("dashboard.quicklink.incidents", locale),
    });
  }

  if (slaBreachComplaints.length > 0) {
    const firstBreach = slaBreachComplaints[0];
    banners.push({
      key: "complaint-sla",
      tone: "warn",
      title: t("dashboard.alert.recording_backlog.title", locale),
      body: t("dashboard.kpi.openComplaintsDelta", locale, {
        count: slaBreachComplaints.length,
      }),
      href: firstBreach
        ? `/complaints/${encodeURIComponent(firstBreach.caseNo)}`
        : "/complaints",
      cta: t("nav.complaints", locale),
    });
  }

  if (queueAttentionCount > 0) {
    banners.push({
      key: "dispatch-queue",
      tone: queueAttentionCount > dispatch.queueDepth ? "danger" : "warn",
      title: t("dashboard.dispatchBoards.title", locale),
      body: t("dashboard.dispatchBoards.ownedSummary", locale, {
        redispatch: dispatch.redispatchOrders,
        exceptions: dispatch.exceptionOrders,
      }),
      href: "/dispatch?board=exception_hold",
      cta: t("dashboard.dispatchBoards.openOwned", locale),
    });
  }

  if (adapterAttentionCount > 0) {
    banners.push({
      key: "adapter-degradation",
      tone: "warn",
      title: t("dashboard.platformOps.metrics.adapters", locale),
      body: t("dashboard.platformOps.degradedBanner", locale, {
        count: adapterAttentionCount,
      }),
      href: "/dispatch?board=forwarded",
      cta: t("dashboard.dispatchBoards.openForwarded", locale),
    });
  }

  // Health signals (right side of split). Always lists API + queue depth +
  // dispatch lag, then up to 2 adapter rows, then a cross-app jump-out.
  const healthSignals: Array<{
    label: string;
    value: string;
    tone: CanvasTone;
  }> = [
    {
      label: locale === "en" ? "Supply buffer" : "供給緩衝",
      value:
        eligibleVehicleGap >= 0
          ? locale === "en"
            ? `+${eligibleVehicleGap} vehicles`
            : `+${eligibleVehicleGap} 輛`
          : locale === "en"
            ? `${eligibleVehicleGap} vehicles`
            : `${eligibleVehicleGap} 輛`,
      tone: eligibleVehicleGap >= 0 ? "success" : "danger",
    },
    {
      label: locale === "en" ? "Identity" : "身分摘要",
      value: `${identity?.realm ?? "ops"} / ${identity?.actorType ?? "ops_user"}`,
      tone: "neutral",
    },
    {
      label: locale === "en" ? "Online / eligible drivers" : "在線 / 可派司機",
      value: `${formatCompactNumber(onlineDrivers)} / ${formatCompactNumber(dispatchEligibleDrivers)}`,
      tone: dispatchEligibleDrivers > 0 ? "success" : "warn",
    },
    {
      label:
        locale === "en" ? "Dispatchable / offline vehicles" : "可派 / 離線車輛",
      value: `${formatCompactNumber(operations.dispatchableVehicles)} / ${formatCompactNumber(operations.offlineVehicles)}`,
      tone: operations.offlineVehicles > 0 ? "warn" : "success",
    },
    {
      label: locale === "en" ? "Open / critical incidents" : "未結 / 重大事故",
      value: `${formatCompactNumber(operations.openIncidents)} / ${formatCompactNumber(criticalIncidentCount)}`,
      tone: criticalIncidentCount > 0 ? "danger" : "info",
    },
    {
      label: locale === "en" ? "Overdue maintenance" : "逾期保養",
      value: formatCompactNumber(operations.overdueMaintenance),
      tone: operations.overdueMaintenance > 0 ? "warn" : "success",
    },
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

  // EmptyReason resolution for queue table.
  const queueEmptyReason: EmptyReason | null =
    queueRows.length > 0
      ? null
      : !ordersResult.ok || !dispatchJobsResult.ok
        ? "fetch_failed"
        : "no_data";

  const adapterRegistryLink = buildAdapterRegistryLink(locale);
  const showHealthBanner =
    healthEnvelope.status !== "healthy" ||
    healthEnvelope.degradedServices.length > 0;

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("dashboard.title", locale)}
        subtitle={
          <>
            <span>{headerSubtitle}</span>
            {identityChips.length > 0 ? (
              <span style={identityChipRowStyle}>
                {identityChips.map((chip) => (
                  <Pill
                    key={`${chip.label}-${chip.value}`}
                    theme={theme}
                    tone={chip.tone}
                  >
                    {chip.label}: {chip.value}
                  </Pill>
                ))}
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <RefreshControl
              tierLabel={t("dashboard.refreshTier.medium", locale)}
              refreshLabel={t("dashboard.refresh", locale)}
              generatedAt={observability.generatedAt}
              freshnessLabel={t(`dashboard.refresh.${freshness}`, locale)}
              freshnessTone={resolveFreshnessTone(freshness)}
              staleAtTemplate={t("dashboard.refresh.staleAt", locale)}
            />
            <Btn theme={theme} icon="ext">
              {t("dashboard.dutyHandbook", locale)}
            </Btn>
            <Link href="/callcenter" style={{ textDecoration: "none" }}>
              <Btn theme={theme} variant="primary" icon="phone">
                {t("dashboard.openCallSession", locale)}
              </Btn>
            </Link>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {showHealthBanner ? (
          <Banner
            theme={theme}
            tone={healthEnvelope.status === "down" ? "danger" : "warn"}
            icon={<CanvasIcon name="warn" size={16} />}
            title={
              healthEnvelope.status === "down"
                ? t("dashboard.healthBanner.title.down", locale)
                : t("dashboard.healthBanner.title.degraded", locale)
            }
            body={
              <>
                <div>
                  {healthEnvelope.status === "down"
                    ? t("dashboard.healthBanner.body.down", locale, {
                        status: health.status,
                      })
                    : t("dashboard.healthBanner.body.degraded", locale, {
                        count: healthEnvelope.degradedServices.length,
                      })}
                </div>
                <div style={{ marginTop: 4, fontSize: 11.5 }}>
                  {t("dashboard.healthBanner.lastChecked", locale, {
                    value: formatTimestamp(
                      healthEnvelope.lastCheckedAt,
                      locale,
                    ),
                  })}
                </div>
              </>
            }
          />
        ) : null}

        {/* Primary KPI strip — canvas-aligned 6 tiles */}
        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={t("dashboard.activeOrders", locale)}
            value={formatCompactNumber(dispatch.activeOrders)}
            delta={
              dispatch.redispatchOrders > 0
                ? t("dashboard.kpi.redispatchDelta", locale, {
                    count: formatCompactNumber(dispatch.redispatchOrders),
                  })
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
                ? t("dashboard.kpi.broadcastingDelta", locale, {
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
            label={t("dashboard.onlineDrivers", locale)}
            value={formatCompactNumber(dispatchEligibleDrivers)}
            sub={t("dashboard.onlineDriversSub", locale)}
            hint={t("dashboard.kpi.onShiftHint", locale, {
              count: formatCompactNumber(operations.onlineDrivers),
            })}
          />
          <KPI
            theme={theme}
            label={t("dashboard.kpi.staleLocation", locale)}
            value={formatCompactNumber(staleLocationDrivers)}
            delta={
              staleLocationDelta
                ? t("dashboard.kpi.staleLocationDelta", locale, {
                    value: staleLocationDelta,
                  })
                : undefined
            }
            deltaTone={staleLocationDrivers > 0 ? "down" : "neutral"}
            sub={t("dashboard.kpi.staleLocationSub", locale)}
          />
          <KPI
            theme={theme}
            label={t("dashboard.kpi.openComplaints", locale)}
            value={formatCompactNumber(openComplaints.length)}
            delta={
              slaBreachComplaints.length > 0
                ? t("dashboard.kpi.openComplaintsDelta", locale, {
                    count: formatCompactNumber(slaBreachComplaints.length),
                  })
                : undefined
            }
            deltaTone={slaBreachComplaints.length > 0 ? "down" : "neutral"}
            sub={t("dashboard.kpi.openComplaintsSub", locale)}
          />
          <KPI
            theme={theme}
            label={t("dashboard.kpi.activeIncidents", locale)}
            value={formatCompactNumber(activeIncidents.length)}
            delta={
              criticalIncidents.length > 0
                ? t("dashboard.kpi.activeIncidentsDelta", locale, {
                    count: formatCompactNumber(criticalIncidents.length),
                  })
                : undefined
            }
            deltaTone={criticalIncidents.length > 0 ? "down" : "neutral"}
            sub={t("dashboard.kpi.activeIncidentsSub", locale)}
          />
        </div>

        {/* Secondary KPI strip — covers remaining packet §5.1 must-show data */}
        <div style={secondaryKpiGridStyle}>
          <KPI
            theme={theme}
            label={t("dashboard.secondaryKpi.dispatchableVehicles", locale)}
            value={formatCompactNumber(operations.dispatchableVehicles)}
            sub={t("dashboard.secondaryKpi.dispatchableVehiclesSub", locale, {
              count: formatCompactNumber(operations.offlineVehicles),
            })}
          />
          <KPI
            theme={theme}
            label={t("dashboard.secondaryKpi.overdueMaintenance", locale)}
            value={formatCompactNumber(operations.overdueMaintenance)}
            deltaTone={operations.overdueMaintenance > 0 ? "down" : "neutral"}
            sub={t("dashboard.secondaryKpi.overdueMaintenanceSub", locale)}
          />
          <KPI
            theme={theme}
            label={t("dashboard.secondaryKpi.todayRevenue", locale)}
            value={formatMinorCurrency(todayRevenue.totalRevenueMinor)}
            sub={t("dashboard.secondaryKpi.todayRevenueSub", locale, {
              trips: formatCompactNumber(todayRevenue.completedTrips),
            })}
          />
          <KPI
            theme={theme}
            label={t("dashboard.secondaryKpi.completedTrips", locale)}
            value={formatCompactNumber(todayRevenue.completedTrips)}
            sub={t("dashboard.secondaryKpi.completedTripsSub", locale)}
          />
        </div>

        <div style={splitGridStyle}>
          <Card
            theme={theme}
            title={t("dashboard.attention.title", locale)}
            subtitle={t("dashboard.attention.subtitle", locale)}
            actions={
              <Link href="/incidents" style={{ textDecoration: "none" }}>
                <Btn theme={theme} variant="ghost">
                  {t("dashboard.attention.expandAll", locale)}
                </Btn>
              </Link>
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
                        <Link
                          href={banner.href}
                          {...(banner.newTab
                            ? { target: "_blank", rel: "noreferrer" }
                            : {})}
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
                : !incidentsResult.ok ||
                    !complaintsResult.ok ||
                    !observabilityResult.ok
                  ? renderEmptyState(locale, "fetch_failed", {
                      label: t("dashboard.empty.action.retry", locale),
                      href: "/dashboard",
                    })
                  : renderEmptyState(locale, "no_data")}
            </div>
          </Card>

          <Card
            theme={theme}
            title={t("dashboard.healthSignals.title", locale)}
            subtitle={t("dashboard.healthSignals.subtitle", locale)}
            actions={
              <Link
                href={resolveCrossAppHref(adapterRegistryLink)}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "none" }}
                title={t("dashboard.crossApp.newTab", locale)}
              >
                <Btn theme={theme} variant="ghost" icon="ext">
                  {adapterRegistryLink.label}
                </Btn>
              </Link>
            }
          >
            {!observabilityResult.ok ? (
              renderEmptyState(locale, "fetch_failed", {
                label: t("dashboard.empty.action.reviewAdapters", locale),
                href: resolveCrossAppHref(adapterRegistryLink),
                newTab: true,
              })
            ) : observability.adapterDetails.length === 0 &&
              healthEnvelope.status === "healthy" ? (
              <div style={signalListStyle}>
                {healthSignals.map((signal, index) => (
                  <div key={`${signal.label}-${index}`} style={signalRowStyle}>
                    <Pill theme={theme} tone={signal.tone} dot>
                      {signal.value}
                    </Pill>
                    <span style={signalLabelStyle}>{signal.label}</span>
                  </div>
                ))}
                <div style={{ ...signalRowStyle, background: "transparent" }}>
                  <span style={signalLabelStyle}>
                    {t("dashboard.healthSignals.allHealthy", locale)}
                  </span>
                </div>
              </div>
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
                {healthEnvelope.degradedServices.length > 0 ? (
                  <div style={{ ...signalRowStyle, background: theme.warnBg }}>
                    <Pill theme={theme} tone="warn" dot>
                      {formatCompactNumber(
                        healthEnvelope.degradedServices.length,
                      )}
                    </Pill>
                    <span style={signalLabelStyle}>
                      {healthEnvelope.degradedServices
                        .slice(0, 3)
                        .map((s) => s.service)
                        .join(" · ")}
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>

        <Card
          theme={theme}
          title={t("dashboard.queueCard.title", locale)}
          padding={0}
          actions={
            <Link href="/dispatch" style={{ textDecoration: "none" }}>
              <Btn theme={theme} variant="ghost">
                {t("dashboard.queueCard.openDispatch", locale)}
              </Btn>
            </Link>
          }
        >
          {queueEmptyReason ? (
            <div style={{ padding: 16 }}>
              {renderEmptyState(
                locale,
                queueEmptyReason,
                queueEmptyReason === "fetch_failed"
                  ? {
                      label: t("dashboard.empty.action.retry", locale),
                      href: "/dashboard",
                    }
                  : undefined,
              )}
            </div>
          ) : (
            <Table theme={theme} columns={queueColumns} rows={queueRows} />
          )}
        </Card>
      </div>
    </>
  );
}
