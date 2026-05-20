import Link from "next/link";
import type { ReactNode } from "react";
import type {
  CrossAppResourceLink,
  DispatchJobRecord,
  DriverRegistryRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  EmptyReason,
  EmptyStateEnvelope,
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
  UiRefreshMetadata,
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
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasShellNavItem,
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
    {
      key: "maintenance",
      href: "/maintenance",
      icon: "maintenance",
      label: t("nav.maintenance", locale),
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
    driverStatementsResponse,
    observabilityResponse,
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
      h: getQueueColumnLabel("orderNo", locale),
      w: 126,
      mono: true,
      r: (row) => (
        <div style={queueStackStyle}>
          <Link
            href={`/dispatch/${encodeURIComponent(row.orderId)}`}
            style={queueLinkStyle}
          >
            {row.orderNo}
          </Link>
          <span style={queueSubLabelStyle}>{row.orderId}</span>
        </div>
      ),
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
      w: 142,
      r: (row) => (
        <Pill theme={theme} tone={getStateTone(row.state)} dot>
          {row.state}
        </Pill>
      ),
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
            label={
              locale === "en" ? "Dispatch-eligible drivers" : "可派司機"
            }
            value={formatCompactNumber(dispatchEligibleDrivers)}
            sub={
              locale === "en"
                ? `${formatCompactNumber(operations.onlineDrivers)} on shift`
                : `${formatCompactNumber(operations.onlineDrivers)} 在班`
            }
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Stale location" : "位置失聯"}
            value={formatCompactNumber(staleLocationDrivers)}
            delta={staleLocationDelta}
            deltaTone={staleLocationDrivers > 0 ? "down" : "neutral"}
            sub={
              locale === "en"
                ? `${formatCompactNumber(
                    observability.driverState.missingLocationDrivers,
                  )} missing updates`
                : `${formatCompactNumber(
                    observability.driverState.missingLocationDrivers,
                  )} 筆未更新`
            }
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
    </Shell>
  );
}
