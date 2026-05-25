import Link from "next/link";
import type { ReactNode } from "react";
import type {
  CrossAppResourceLink,
  DispatchJobRecord,
  EmptyReason,
  IncidentRecord,
  OperationalAlertRecord,
  OperationalAlertState,
  OperationalObservabilitySnapshot,
  OperationalRoleView,
  OwnedOrderRecord,
  RefreshTier,
  ResourceActionDescriptor,
  UiHealthEnvelope,
  UiRefreshMetadata,
  DriverRegistryRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  MaintenanceRecord,
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
  buildDashboardTrend,
  buildDispatchInsights,
  buildOperationsOverview,
  buildRevenueInsights,
} from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
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

type IdentitySummary = {
  realm?: string;
  actorType?: string;
  displayName?: string;
} | null;

type HealthPayload = {
  service: string;
  status: string;
  mode: string;
  execution_mode: string;
  timestamp: string;
};

type ActionableOwnedOrderRecord = OwnedOrderRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type SourceSnapshot<T> = {
  data: T;
  error: Error | null;
  refresh: UiRefreshMetadata;
};

type LinkTarget = {
  href: string;
  external?: boolean;
};

type AttentionBanner = {
  key: string;
  tone: Exclude<CanvasTone, "neutral">;
  title: ReactNode;
  body: ReactNode;
  target?: LinkTarget;
  ctaLabel?: string;
};

type EmptyStateModel = {
  reason: EmptyReason;
  tone: Exclude<CanvasTone, "neutral">;
  icon: "dashboard" | "flags" | "warn" | "audit" | "adapters" | "filter";
  title: string;
  description: string;
  nextAction?: ResourceActionDescriptor;
  fallbackTarget?: LinkTarget;
};

type QueueRow = Record<string, unknown> & {
  orderId: string;
  orderCell: ReactNode;
  tenant: string;
  pickup: string;
  window: string;
  stateCell: ReactNode;
  driver: string;
  eta: string;
};

const DASHBOARD_REFRESH_TIER: RefreshTier = "medium";
const DASHBOARD_STALE_AFTER_MS = 15_000;
const PLATFORM_ADMIN_BASE_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";
const DUTY_HANDBOOK_URL = process.env.NEXT_PUBLIC_OPS_DUTY_HANDBOOK_URL ?? "";

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

const metaRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
  alignItems: "center",
};

const quickActionRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 10,
};

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.5fr) minmax(300px, 1fr)",
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
  gap: 4,
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

const emptyStateStyle = (tone: Exclude<CanvasTone, "neutral">) => {
  const toneStyles: Record<
    Exclude<CanvasTone, "neutral">,
    { fg: string; bg: string; border: string }
  > = {
    accent: {
      fg: theme.accent,
      bg: theme.accentBg,
      border: theme.accentBorder,
    },
    info: { fg: theme.info, bg: theme.infoBg, border: theme.infoBorder },
    success: {
      fg: theme.success,
      bg: theme.successBg,
      border: theme.successBorder,
    },
    warn: { fg: theme.warn, bg: theme.warnBg, border: theme.warnBorder },
    danger: {
      fg: theme.danger,
      bg: theme.dangerBg,
      border: theme.dangerBorder,
    },
  };

  return toneStyles[tone];
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
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

function formatCompactValue(locale: Locale, value: number) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatMinorCurrency(
  locale: Locale,
  amountMinor: number,
  currency = "TWD",
) {
  try {
    return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(0)}`;
  }
}

function formatTimestamp(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return copy(locale, "not reported", "尚未回報");
  }

  return `${formatDateTime(locale, value)} UTC`;
}

function formatEtaLabel(locale: Locale, minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) {
    return "—";
  }

  return locale === "zh" ? `${minutes} 分` : `${minutes}m`;
}

function formatSignedPercent(locale: Locale, value: number) {
  const normalized = Number.isFinite(value) ? value : 0;
  const sign = normalized > 0 ? "+" : normalized < 0 ? "−" : "";
  const absolute = Math.abs(normalized).toFixed(0);
  return locale === "zh"
    ? `${sign}${absolute}% 相較 7 日均值`
    : `${sign}${absolute}% vs 7d avg`;
}

function formatRelativeMinutes(
  locale: Locale,
  value: number | null | undefined,
) {
  if (value === null || value === undefined) {
    return copy(locale, "No backlog", "目前沒有積壓");
  }

  return locale === "zh" ? `${value} 分鐘` : `${value} min`;
}

function formatGeneratedAge(locale: Locale, generatedAt: string) {
  const deltaMs = Date.now() - new Date(generatedAt).getTime();
  const deltaSeconds = Math.max(0, Math.round(deltaMs / 1000));
  if (deltaSeconds < 60) {
    return locale === "zh" ? `${deltaSeconds} 秒前` : `${deltaSeconds}s ago`;
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return locale === "zh" ? `${deltaMinutes} 分鐘前` : `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  return locale === "zh" ? `${deltaHours} 小時前` : `${deltaHours}h ago`;
}

function refreshTierCode(tier: RefreshTier) {
  switch (tier) {
    case "medium":
      return "T3 · 15s";
    case "dispatch":
      return "T2 · 5s";
    case "medium_slow":
    case "slow":
      return "T4 · 30s";
    case "fast":
      return "T1 · 3s";
    case "urgent":
      return "T0 · push";
    case "manual":
      return "T6 · manual";
    default:
      return String(tier).toUpperCase();
  }
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
  key: "orderNo" | "tenant" | "pickup" | "window" | "state" | "driver" | "eta",
  locale: Locale,
) {
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
      case "state":
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
    case "state":
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
    return copy(locale, "realtime", "即時");
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

function getAlertTone(
  state: OperationalAlertState,
): Exclude<CanvasTone, "neutral"> {
  if (state === "critical") {
    return "danger";
  }
  if (state === "warning") {
    return "warn";
  }
  return "success";
}

function getHealthTone(status: string): Exclude<CanvasTone, "neutral"> {
  if (
    status === "healthy" ||
    status === "ok" ||
    status === "valid" ||
    status === "enabled" ||
    status === "connected"
  ) {
    return "success";
  }
  if (
    status === "warning" ||
    status === "degraded" ||
    status === "pending" ||
    status === "expiring" ||
    status === "limited"
  ) {
    return "warn";
  }
  if (
    status === "critical" ||
    status === "down" ||
    status === "failed" ||
    status === "invalid" ||
    status === "disabled" ||
    status === "missing"
  ) {
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
  locale: Locale,
  value: number,
  unit: "count" | "minutes" | "percent",
) {
  if (unit === "minutes") {
    return locale === "zh" ? `${value} 分鐘` : `${value} min`;
  }
  if (unit === "percent") {
    return `${value}%`;
  }
  return formatCompactValue(locale, value);
}

function alertLabel(key: OperationalAlertRecord["key"], locale: Locale) {
  const labels: Record<
    OperationalAlertRecord["key"],
    { en: string; zh: string }
  > = {
    dispatch_lag: { en: "Dispatch lag", zh: "派車延遲" },
    recording_backlog: { en: "Recording backlog", zh: "錄音積壓" },
    driver_state_lag: { en: "Driver state lag", zh: "司機狀態延遲" },
    webhook_failure_burst: {
      en: "Webhook failure burst",
      zh: "Webhook 失敗尖峰",
    },
    eligibility_review_backlog: {
      en: "Eligibility review backlog",
      zh: "Eligibility 審查積壓",
    },
    adapter_degradation: { en: "Adapter degradation", zh: "Adapter 降級" },
  };

  const target = labels[key];
  return target
    ? copy(locale, target.en, target.zh)
    : formatOpsCodeLabel(locale, key);
}

function alertSummary(
  key: OperationalAlertRecord["key"],
  observability: OperationalObservabilitySnapshot,
  locale: Locale,
) {
  switch (key) {
    case "dispatch_lag":
      return copy(
        locale,
        `${formatCompactValue(locale, observability.dispatch.laggedOrders)} orders breached dispatch lag threshold`,
        `${formatCompactValue(locale, observability.dispatch.laggedOrders)} 筆訂單超出派車延遲門檻`,
      );
    case "recording_backlog":
      return copy(
        locale,
        `${formatCompactValue(locale, observability.recording.pendingOrders)} orders are waiting for recording linkage`,
        `${formatCompactValue(locale, observability.recording.pendingOrders)} 筆訂單等待錄音關聯`,
      );
    case "driver_state_lag":
      return copy(
        locale,
        `${formatCompactValue(locale, observability.driverState.staleLocationDrivers)} drivers have stale location signals`,
        `${formatCompactValue(locale, observability.driverState.staleLocationDrivers)} 位司機的位置訊號已過舊`,
      );
    case "webhook_failure_burst":
      return copy(
        locale,
        `${formatCompactValue(locale, observability.webhook.failedDeliveriesLastHour)} webhook deliveries failed in the last hour`,
        `${formatCompactValue(locale, observability.webhook.failedDeliveriesLastHour)} 筆 webhook 在過去一小時失敗`,
      );
    case "eligibility_review_backlog":
      return copy(
        locale,
        `${formatCompactValue(locale, observability.eligibility.totalReviewQueue)} items are waiting for review`,
        `${formatCompactValue(locale, observability.eligibility.totalReviewQueue)} 筆等待審查`,
      );
    case "adapter_degradation":
      return copy(
        locale,
        `${formatCompactValue(
          locale,
          observability.adapters.degradedAdapters +
            observability.adapters.downAdapters,
        )} adapters need attention`,
        `${formatCompactValue(
          locale,
          observability.adapters.degradedAdapters +
            observability.adapters.downAdapters,
        )} 個 adapter 需要關注`,
      );
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
    throw new Error(`API error ${response.status}: health check failed`);
  }

  return (await response.json()) as HealthPayload;
}

function extractApiStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const matched = message.match(/API error (\d+)/i);
  return matched ? Number(matched[1]) : null;
}

function createRefreshMetadata(
  generatedAt: string,
  staleAfterMs: number,
  source: UiRefreshMetadata["source"],
  status: UiRefreshMetadata["dataFreshness"],
): UiRefreshMetadata {
  return {
    generatedAt,
    staleAfterMs,
    dataFreshness: status,
    source,
  };
}

function snapshotFromResult<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
  options: {
    staleAfterMs: number;
    generatedAt?: string | ((value: T) => string | null | undefined);
  },
): SourceSnapshot<T> {
  if (result.status === "rejected") {
    return {
      data: fallback,
      error:
        result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason)),
      refresh: createRefreshMetadata(
        new Date().toISOString(),
        options.staleAfterMs,
        "static",
        "degraded",
      ),
    };
  }

  const generatedAtRaw =
    typeof options.generatedAt === "function"
      ? options.generatedAt(result.value)
      : options.generatedAt;
  const generatedAt = generatedAtRaw ?? new Date().toISOString();
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  return {
    data: result.value,
    error: null,
    refresh: createRefreshMetadata(
      generatedAt,
      options.staleAfterMs,
      "live",
      ageMs > options.staleAfterMs ? "stale" : "fresh",
    ),
  };
}

function combineFreshness(values: UiRefreshMetadata["dataFreshness"][]) {
  if (values.includes("degraded")) {
    return "degraded" as const;
  }
  if (values.includes("stale")) {
    return "stale" as const;
  }
  if (values.includes("unknown")) {
    return "unknown" as const;
  }
  return "fresh" as const;
}

function derivePageHealthEnvelope(input: {
  health: SourceSnapshot<HealthPayload>;
  observability: SourceSnapshot<OperationalObservabilitySnapshot>;
  orders: SourceSnapshot<OwnedOrderRecord[]>;
  dispatchJobs: SourceSnapshot<DispatchJobRecord[]>;
  incidents: SourceSnapshot<IncidentRecord[]>;
}): UiHealthEnvelope {
  const degradedServices: UiHealthEnvelope["degradedServices"] = [];

  const normalizedHealthStatus =
    input.health.data.status === "down"
      ? "down"
      : input.health.data.status === "degraded"
        ? "degraded"
        : "healthy";

  if (normalizedHealthStatus !== "healthy") {
    degradedServices.push({
      service: input.health.data.service,
      impact:
        normalizedHealthStatus === "down"
          ? "dashboard reads are unavailable"
          : "dashboard reads are degraded",
      severity: normalizedHealthStatus === "down" ? "critical" : "warning",
    });
  }

  if (input.observability.error) {
    degradedServices.push({
      service: "ops_observability",
      impact: "alert stack and adapter summary fell back to static snapshot",
      severity: "critical",
    });
  }

  if (input.orders.error || input.dispatchJobs.error) {
    degradedServices.push({
      service: "dispatch_read_models",
      impact: "queue summary is using fallback counts",
      severity: "warning",
    });
  }

  if (input.incidents.error) {
    degradedServices.push({
      service: "incident_center",
      impact: "critical incident rollup may be incomplete",
      severity: "warning",
    });
  }

  const degradedAdapter = input.observability.data.adapterDetails.find(
    (adapter) => adapter.status !== "healthy",
  );
  if (degradedAdapter) {
    degradedServices.push({
      service: degradedAdapter.platformCode,
      impact: "forwarded dispatch mirror triage may require manual fallback",
      severity: degradedAdapter.status === "down" ? "critical" : "warning",
    });
  }

  return {
    status: degradedServices.some((service) => service.severity === "critical")
      ? "down"
      : degradedServices.length > 0
        ? "degraded"
        : "healthy",
    degradedServices,
    lastCheckedAt: input.health.refresh.generatedAt,
  };
}

function normalizeActionName(value: string) {
  return value.trim().toLowerCase();
}

function actionMatches(
  descriptor: ResourceActionDescriptor,
  candidates: string[],
) {
  const normalized = normalizeActionName(descriptor.action);
  return candidates.some(
    (candidate) => normalized === candidate || normalized.includes(candidate),
  );
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const baseUrl =
    link.targetApp === "platform-admin"
      ? PLATFORM_ADMIN_BASE_URL
      : link.targetApp === "tenant-console"
        ? (process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ??
          "http://localhost:3004")
        : (process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003");
  return new URL(link.route, baseUrl).toString();
}

function descriptorTarget(
  descriptor: ResourceActionDescriptor,
  fallbackTarget: LinkTarget | undefined,
) {
  const normalized = normalizeActionName(descriptor.action);

  if (
    normalized.includes("inspect_adapter") ||
    normalized.includes("adapter_registry") ||
    normalized.includes("configure_adapter")
  ) {
    return {
      href: buildCrossAppHref({
        targetApp: "platform-admin",
        route: "/adapter-registry",
        resourceType: "adapter_registry",
        resourceId: "all",
        openMode: "new_tab",
        label: "Adapter registry",
      }),
      external: true,
    } satisfies LinkTarget;
  }

  if (
    normalized.includes("approval") ||
    normalized.includes("review_request") ||
    normalized.includes("governance")
  ) {
    return { href: "/approval-requests" } satisfies LinkTarget;
  }

  if (normalized.includes("incident")) {
    return { href: "/incidents" } satisfies LinkTarget;
  }

  if (normalized.includes("forwarded")) {
    return { href: "/dispatch?view=forwarded" } satisfies LinkTarget;
  }

  if (
    normalized.includes("dispatch") ||
    normalized.includes("assign") ||
    normalized.includes("redispatch") ||
    normalized.includes("hold") ||
    normalized.includes("supply") ||
    normalized.includes("manual_fallback")
  ) {
    return { href: "/dispatch" } satisfies LinkTarget;
  }

  if (normalized.includes("feature_flag")) {
    return { href: "/feature-flags" } satisfies LinkTarget;
  }

  if (normalized.includes("refresh")) {
    return { href: "/dashboard" } satisfies LinkTarget;
  }

  if (normalized.includes("call_session")) {
    return { href: "/callcenter?intent=new-session" } satisfies LinkTarget;
  }

  return fallbackTarget;
}

function descriptorLabel(descriptor: ResourceActionDescriptor, locale: Locale) {
  if (
    actionMatches(descriptor, [
      "inspect_adapter",
      "adapter_registry",
      "configure_adapter",
    ])
  ) {
    return copy(locale, "Inspect adapter", "查看 adapter");
  }
  if (actionMatches(descriptor, ["approval", "review_request", "governance"])) {
    return copy(locale, "Open approval queue", "前往審批佇列");
  }
  if (actionMatches(descriptor, ["incident"])) {
    return copy(locale, "Open incidents", "查看事故");
  }
  if (actionMatches(descriptor, ["forwarded"])) {
    return copy(locale, "Open forwarded triage", "查看 forwarded triage");
  }
  if (
    actionMatches(descriptor, [
      "dispatch",
      "assign",
      "redispatch",
      "hold",
      "supply",
    ])
  ) {
    return copy(locale, "Open dispatch", "前往派遣");
  }
  if (actionMatches(descriptor, ["refresh"])) {
    return copy(locale, "Refresh page", "重新整理");
  }
  if (actionMatches(descriptor, ["call_session"])) {
    return copy(locale, "Open call session", "開新 call session");
  }
  return formatOpsCodeLabel(locale, descriptor.action);
}

function pickLeadAction(actions: ResourceActionDescriptor[] | undefined) {
  if (!actions || actions.length === 0) {
    return null;
  }

  const priorityGroups = [
    ["review_request", "approval", "governance"],
    ["resolve_hold", "hold"],
    ["supply", "extend", "manual_fallback"],
    ["assign", "dispatch"],
    ["redispatch"],
  ];

  for (const group of priorityGroups) {
    const matched = actions.find((descriptor) =>
      actionMatches(descriptor, group),
    );
    if (matched) {
      return matched;
    }
  }

  return actions[0];
}

function deriveEmptyReason(options: {
  error: Error | null;
  itemCount: number;
  filteredCount?: number;
  dependencyUnavailable?: boolean;
  notProvisioned?: boolean;
}) {
  if (options.error) {
    const statusCode = extractApiStatusCode(options.error);
    if (statusCode === 401 || statusCode === 403) {
      return "permission_denied" as const;
    }
    if (statusCode === 404) {
      return "not_provisioned" as const;
    }
    if (
      options.dependencyUnavailable ||
      statusCode === 502 ||
      statusCode === 503 ||
      statusCode === 504
    ) {
      return "external_unavailable" as const;
    }
    return "fetch_failed" as const;
  }

  if (options.notProvisioned) {
    return "not_provisioned" as const;
  }

  if (options.dependencyUnavailable) {
    return "external_unavailable" as const;
  }

  if (options.itemCount === 0 && (options.filteredCount ?? 0) > 0) {
    return "filtered_empty" as const;
  }

  return "no_data" as const;
}

function emptyStateModel(
  locale: Locale,
  reason: EmptyReason,
  fallbackTarget?: LinkTarget,
  nextAction?: ResourceActionDescriptor,
): EmptyStateModel {
  switch (reason) {
    case "not_provisioned":
      return {
        reason,
        tone: "accent",
        icon: "flags",
        title: copy(
          locale,
          "This dashboard slice is not provisioned yet",
          "這個 Dashboard 區塊尚未開通",
        ),
        description: copy(
          locale,
          "The backing workflow is not enabled for this environment or tenant scope yet.",
          "對應的 workflow 尚未在這個環境或租戶範圍開啟。",
        ),
        nextAction: nextAction ?? {
          action: "open_feature_flags",
          enabled: true,
          riskLevel: "low",
        },
        fallbackTarget: fallbackTarget ?? { href: "/feature-flags" },
      };
    case "fetch_failed":
      return {
        reason,
        tone: "danger",
        icon: "warn",
        title: copy(
          locale,
          "We could not load this dashboard slice",
          "這個 Dashboard 區塊載入失敗",
        ),
        description: copy(
          locale,
          "The backend returned an error, so the page fell back instead of pretending the queue is empty.",
          "後端回應錯誤，因此畫面使用降級呈現，而不是假裝這個佇列沒有資料。",
        ),
        nextAction: nextAction ?? {
          action: "refresh",
          enabled: true,
          riskLevel: "low",
        },
        fallbackTarget: fallbackTarget ?? { href: "/dashboard" },
      };
    case "permission_denied":
      return {
        reason,
        tone: "warn",
        icon: "audit",
        title: copy(
          locale,
          "This operator does not have scope here",
          "目前操作者沒有這個區塊的權限",
        ),
        description: copy(
          locale,
          "The API rejected this read with an authority error. The UI keeps the space visible instead of collapsing it silently.",
          "API 以權限錯誤拒絕這個讀取；UI 會保留這個空間，而不是靜默消失。",
        ),
        fallbackTarget: fallbackTarget ?? { href: "/dispatch" },
      };
    case "external_unavailable":
      return {
        reason,
        tone: "warn",
        icon: "adapters",
        title: copy(
          locale,
          "An external dependency is unavailable",
          "外部依賴暫時不可用",
        ),
        description: copy(
          locale,
          "Forwarded / adapter-owned signals are unavailable right now. Review the owner app before treating the mirror as truth.",
          "目前 forwarded / adapter 所屬訊號不可用；請先到 owner app 檢查，再把 mirror 視為真相。",
        ),
        nextAction: nextAction ?? {
          action: "inspect_adapter",
          enabled: true,
          riskLevel: "low",
        },
        fallbackTarget: fallbackTarget ?? {
          href: buildCrossAppHref({
            targetApp: "platform-admin",
            route: "/adapter-registry",
            resourceType: "adapter_registry",
            resourceId: "all",
            openMode: "new_tab",
            label: "Adapter registry",
          }),
          external: true,
        },
      };
    case "filtered_empty":
      return {
        reason,
        tone: "info",
        icon: "filter",
        title: copy(
          locale,
          "Nothing matched the current dashboard filter",
          "目前的 Dashboard 篩選沒有命中資料",
        ),
        description: copy(
          locale,
          "There is data elsewhere, but nothing is currently relevant to the visible ops route / attention rules.",
          "系統內有資料，但目前對可見的 ops route / attention 規則來說沒有可顯示項目。",
        ),
        nextAction: nextAction ?? {
          action: "clear_filters",
          enabled: true,
          riskLevel: "low",
        },
        fallbackTarget: fallbackTarget ?? { href: "/dispatch" },
      };
    case "no_data":
    default:
      return {
        reason,
        tone: "info",
        icon: "dashboard",
        title: copy(
          locale,
          "Nothing needs attention right now",
          "目前沒有需要立即處理的項目",
        ),
        description: copy(
          locale,
          "This is a legitimate empty state, not a failure. The shift can stay on the dashboard until work arrives.",
          "這是合法的空狀態，不是錯誤。當班可以先停留在 Dashboard，等待新工作進來。",
        ),
        nextAction: nextAction ?? {
          action: "open_dispatch",
          enabled: true,
          riskLevel: "low",
        },
        fallbackTarget: fallbackTarget ?? { href: "/dispatch" },
      };
  }
}

function renderLinkButton(target: LinkTarget, content: ReactNode) {
  if (target.external) {
    return (
      <a
        href={target.href}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: "none" }}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={target.href} style={{ textDecoration: "none" }}>
      {content}
    </Link>
  );
}

function renderDescriptorButton(
  descriptor: ResourceActionDescriptor,
  locale: Locale,
  fallbackTarget: LinkTarget | undefined,
  variant: "primary" | "secondary" | "ghost" = "secondary",
) {
  const target = descriptorTarget(descriptor, fallbackTarget);
  const label = descriptorLabel(descriptor, locale);
  const button = (
    <Btn
      theme={theme}
      variant={variant}
      size="sm"
      icon={
        actionMatches(descriptor, ["inspect_adapter", "adapter_registry"])
          ? "ext"
          : actionMatches(descriptor, ["approval"])
            ? "warn"
            : actionMatches(descriptor, ["incident"])
              ? "warn"
              : "arrow"
      }
      disabled={!descriptor.enabled || !target}
    >
      {label}
    </Btn>
  );

  if (!descriptor.enabled || !target) {
    return <span title={descriptor.disabledReasonCode ?? label}>{button}</span>;
  }

  return renderLinkButton(target, button);
}

function DashboardEmptyState({
  model,
  locale,
}: {
  model: EmptyStateModel;
  locale: Locale;
}) {
  const color = emptyStateStyle(model.tone);
  const nextAction = model.nextAction
    ? renderDescriptorButton(
        model.nextAction,
        locale,
        model.fallbackTarget,
        model.reason === "fetch_failed" ? "primary" : "secondary",
      )
    : null;

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 10,
        border: `1px dashed ${color.border}`,
        background: color.bg,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: theme.surface,
            color: color.fg,
            border: `1px solid ${color.border}`,
            flexShrink: 0,
          }}
        >
          <CanvasIcon name={model.icon} size={15} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: theme.textDim }}>
            {model.reason}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
            {model.title}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.5 }}>
        {model.description}
      </div>
      {nextAction ? <div>{nextAction}</div> : null}
    </div>
  );
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
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentitySummary>,
    loadHealthPayload(),
    client.listOrders(),
    client.listDispatchJobs(),
    client.listDriverTasks(),
    client.listVehicles(),
    client.listDrivers(),
    client.listShifts(),
    client.listIncidents(),
    client.listMaintenance(),
    client.listReportJobs(),
    client.listDriverStatements(),
    client.getOperationalObservability(),
  ]);

  const identity = snapshotFromResult(identityResult, null, {
    staleAfterMs: DASHBOARD_STALE_AFTER_MS,
  });
  const health = snapshotFromResult(
    healthResult,
    {
      service: "api",
      status: "degraded",
      mode: "unknown",
      execution_mode: "unknown",
      timestamp: new Date().toISOString(),
    },
    {
      staleAfterMs: DASHBOARD_STALE_AFTER_MS,
      generatedAt: (value) => value.timestamp,
    },
  );
  const orders = snapshotFromResult(ordersResult, [] as OwnedOrderRecord[], {
    staleAfterMs: DASHBOARD_STALE_AFTER_MS,
  });
  const dispatchJobs = snapshotFromResult(
    dispatchJobsResult,
    [] as DispatchJobRecord[],
    {
      staleAfterMs: DASHBOARD_STALE_AFTER_MS,
    },
  );
  const driverTasks = snapshotFromResult(
    driverTasksResult,
    [] as DriverTaskRecord[],
    {
      staleAfterMs: DASHBOARD_STALE_AFTER_MS,
    },
  );
  const vehicles = snapshotFromResult(
    vehiclesResult,
    [] as VehicleRegistryRecord[],
    {
      staleAfterMs: DASHBOARD_STALE_AFTER_MS,
    },
  );
  const drivers = snapshotFromResult(
    driversResult,
    [] as DriverRegistryRecord[],
    {
      staleAfterMs: DASHBOARD_STALE_AFTER_MS,
    },
  );
  const shifts = snapshotFromResult(shiftsResult, [] as ShiftRecord[], {
    staleAfterMs: DASHBOARD_STALE_AFTER_MS,
  });
  const incidents = snapshotFromResult(
    incidentsResult,
    [] as IncidentRecord[],
    {
      staleAfterMs: DASHBOARD_STALE_AFTER_MS,
    },
  );
  const maintenance = snapshotFromResult(
    maintenanceResult,
    [] as MaintenanceRecord[],
    {
      staleAfterMs: DASHBOARD_STALE_AFTER_MS,
    },
  );
  const reportJobs = snapshotFromResult(
    reportJobsResult,
    [] as ReportJobRecord[],
    {
      staleAfterMs: DASHBOARD_STALE_AFTER_MS,
    },
  );
  const driverStatements = snapshotFromResult(
    driverStatementsResult,
    [] as DriverStatementRecord[],
    {
      staleAfterMs: DASHBOARD_STALE_AFTER_MS,
    },
  );
  const observability = snapshotFromResult(
    observabilityResult,
    createFallbackObservabilitySnapshot(),
    {
      staleAfterMs: DASHBOARD_STALE_AFTER_MS,
      generatedAt: (value) => value.generatedAt,
    },
  );

  const actionableOrders = orders.data as ActionableOwnedOrderRecord[];

  const dispatch = buildDispatchInsights(actionableOrders, dispatchJobs.data);
  const operations = buildOperationsOverview({
    vehicles: vehicles.data,
    drivers: drivers.data,
    shifts: shifts.data,
    incidents: incidents.data,
    maintenance: maintenance.data,
    reportJobs: reportJobs.data,
  });
  const todayRevenue = buildRevenueInsights(
    actionableOrders,
    driverTasks.data,
    driverStatements.data,
    {
      period: "today",
      serviceBucket: "all",
      vehicleId: "all",
    },
  );
  const trend = buildDashboardTrend(
    actionableOrders,
    driverTasks.data,
    incidents.data,
  );
  const priorTrend = trend.slice(0, -1);
  const todayTrend = trend[trend.length - 1];
  const averageRecentOrders =
    priorTrend.length > 0
      ? priorTrend.reduce((sum, point) => sum + point.createdOrders, 0) /
        priorTrend.length
      : 0;
  const demandDeltaPercent =
    averageRecentOrders > 0 && todayTrend
      ? ((todayTrend.createdOrders - averageRecentOrders) /
          averageRecentOrders) *
        100
      : 0;

  const pageFreshness = combineFreshness([
    orders.refresh.dataFreshness,
    dispatchJobs.refresh.dataFreshness,
    incidents.refresh.dataFreshness,
    observability.refresh.dataFreshness,
    health.refresh.dataFreshness,
  ]);
  const pageHealth = derivePageHealthEnvelope({
    health,
    observability,
    orders,
    dispatchJobs,
    incidents,
  });

  const criticalIncidentCount = incidents.data.filter(
    (incident) =>
      (incident.status === "open" || incident.status === "investigating") &&
      incident.severity === "critical",
  ).length;
  const activeShiftCount = shifts.data.filter(
    (shift) => shift.status === "active",
  ).length;
  const dispatchEligibleDrivers =
    observability.data.driverState.dispatchEligibleDrivers ||
    operations.onlineDrivers;
  const staleLocationDrivers =
    observability.data.driverState.staleLocationDrivers;
  const staleLocationHint =
    staleLocationDrivers > 0
      ? copy(
          locale,
          `${formatCompactValue(locale, staleLocationDrivers)} stale · ${
            observability.data.driverState.oldestLocationLagMinutes ?? 0
          } min oldest`,
          `${formatCompactValue(locale, staleLocationDrivers)} 位 stale · 最久 ${
            observability.data.driverState.oldestLocationLagMinutes ?? 0
          } 分鐘`,
        )
      : undefined;

  const opsAlertKeys = new Set(
    observability.data.roleViews.find(
      (view: OperationalRoleView) => view.route === "ops",
    )?.alertKeys ?? [],
  );
  const opsAlerts = observability.data.alerts
    .filter(
      (alert) => opsAlertKeys.has(alert.key) || alert.routes.includes("ops"),
    )
    .sort((left, right) => {
      const severityRank: Record<OperationalAlertState, number> = {
        critical: 0,
        warning: 1,
        healthy: 2,
      };
      return (
        (severityRank[left.state as OperationalAlertState] ?? 99) -
        (severityRank[right.state as OperationalAlertState] ?? 99)
      );
    });

  const adapterAttentionCount =
    observability.data.adapters.degradedAdapters +
    observability.data.adapters.downAdapters;
  const focusAdapter =
    observability.data.adapterDetails.find(
      (adapter) => adapter.status !== "healthy",
    ) ??
    observability.data.adapterDetails[0] ??
    null;

  const jobByOrderId = new Map<string, DispatchJobRecord>(
    dispatchJobs.data.map((job) => [job.orderId, job]),
  );
  const tasksByOrderId = new Map<string, DriverTaskRecord[]>();
  for (const task of driverTasks.data) {
    const existing = tasksByOrderId.get(task.orderId);
    if (existing) {
      existing.push(task);
    } else {
      tasksByOrderId.set(task.orderId, [task]);
    }
  }

  const sortedOrders = [...actionableOrders].sort((left, right) => {
    const leftState = getVisibleStateCode(left, jobByOrderId.get(left.orderId));
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
  });

  const priorityOrder = sortedOrders[0] ?? null;
  const priorityOrderState = priorityOrder
    ? getVisibleStateCode(
        priorityOrder,
        jobByOrderId.get(priorityOrder.orderId),
      )
    : null;
  const leadAction = pickLeadAction(priorityOrder?.availableActions);

  const queueRows: QueueRow[] = sortedOrders.slice(0, 5).map((order) => {
    const job = jobByOrderId.get(order.orderId);
    const task = pickCurrentTask(tasksByOrderId.get(order.orderId) ?? []);
    const state = getVisibleStateCode(order, job);

    return {
      orderId: order.orderId,
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
      stateCell: (
        <Pill theme={theme} tone={getStateTone(state)} dot>
          {formatOpsCodeLabel(locale, state)}
        </Pill>
      ),
      driver: task?.driverId ?? "—",
      eta: formatEtaLabel(
        locale,
        job?.latestEtaMinutes ?? order.etaSnapshot?.etaMinutes,
      ),
    };
  });

  const queueColumns: CanvasTableColumn<QueueRow>[] = [
    { h: getQueueColumnLabel("orderNo", locale), k: "orderCell", w: 128 },
    {
      h: getQueueColumnLabel("tenant", locale),
      k: "tenant",
      w: 140,
      mono: true,
    },
    { h: getQueueColumnLabel("pickup", locale), k: "pickup", w: 300 },
    {
      h: getQueueColumnLabel("window", locale),
      k: "window",
      w: 136,
      mono: true,
    },
    { h: getQueueColumnLabel("state", locale), k: "stateCell", w: 156 },
    {
      h: getQueueColumnLabel("driver", locale),
      k: "driver",
      w: 112,
      mono: true,
    },
    { h: getQueueColumnLabel("eta", locale), k: "eta", w: 84, mono: true },
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

  const attentionBanners: AttentionBanner[] = [];

  if (criticalIncidentCount > 0) {
    attentionBanners.push({
      key: "critical-incidents",
      tone: "danger",
      title: copy(
        locale,
        `${formatCompactValue(locale, criticalIncidentCount)} critical incidents need command attention`,
        `${formatCompactValue(locale, criticalIncidentCount)} 件重大事故需要立即處置`,
      ),
      body: copy(
        locale,
        "A critical incident exists in the active shift. The dashboard should not let this blend into routine queue noise.",
        "當前班次存在重大事故；這個警示不能和一般 queue 雜訊混在一起。",
      ),
      target: { href: "/incidents" },
      ctaLabel: copy(locale, "Open incidents", "前往事故"),
    });
  }

  if (priorityOrder && priorityOrderState) {
    const defaultTarget =
      priorityOrderState === "override_pending"
        ? { href: "/approval-requests" }
        : { href: "/dispatch" };
    const title =
      priorityOrderState === "override_pending"
        ? copy(
            locale,
            `${priorityOrder.orderNo} is governance-blocked`,
            `${priorityOrder.orderNo} 目前卡在審批`,
          )
        : priorityOrderState === "no_supply"
          ? copy(
              locale,
              `${priorityOrder.orderNo} has no eligible supply`,
              `${priorityOrder.orderNo} 目前沒有可用供給`,
            )
          : priorityOrderState === "exception_hold"
            ? copy(
                locale,
                `${priorityOrder.orderNo} is held in exception flow`,
                `${priorityOrder.orderNo} 正處於例外保留流程`,
              )
            : copy(
                locale,
                `${priorityOrder.orderNo} leads the dispatch attention queue`,
                `${priorityOrder.orderNo} 目前位於 dispatch 注意佇列最前`,
              );
    const body =
      priorityOrderState === "override_pending"
        ? copy(
            locale,
            "This row is waiting on approval authority before dispatch may resume.",
            "這一筆在恢復派遣前必須先通過審批授權。",
          )
        : priorityOrderState === "no_supply"
          ? copy(
              locale,
              "Dispatch exhausted the current candidate pool and needs manual supply intervention.",
              "目前候選池已耗盡，需要人工介入處理供給。",
            )
          : priorityOrderState === "exception_hold"
            ? copy(
                locale,
                "The order is blocked by an unresolved exception and cannot quietly return to the base queue.",
                "這筆訂單仍有未解例外，不能靜默回到基礎佇列。",
              )
            : copy(
                locale,
                "Use the dispatch workspace for the real decision surface; the dashboard only summarizes the first move.",
                "真正的判斷面仍在 dispatch workspace；Dashboard 只負責先做摘要。",
              );
    const leadTarget = descriptorTarget(
      leadAction ?? {
        action: "open_dispatch",
        enabled: true,
        riskLevel: "low",
      },
      defaultTarget,
    );
    attentionBanners.push({
      key: "dispatch-priority",
      tone:
        priorityOrderState === "override_pending"
          ? "warn"
          : priorityOrderState === "no_supply"
            ? "danger"
            : "info",
      title,
      body,
      ...(leadTarget ? { target: leadTarget } : {}),
      ctaLabel: descriptorLabel(
        leadAction ?? {
          action: "open_dispatch",
          enabled: true,
          riskLevel: "low",
        },
        locale,
      ),
    });
  }

  const topOpsAlert = opsAlerts[0];
  if (topOpsAlert) {
    attentionBanners.push({
      key: topOpsAlert.key,
      tone: getAlertTone(topOpsAlert.state),
      title: alertLabel(topOpsAlert.key, locale),
      body: `${alertSummary(topOpsAlert.key, observability.data, locale)} · ${copy(
        locale,
        `warning ${formatAlertValue(
          locale,
          topOpsAlert.thresholds.warning,
          topOpsAlert.thresholds.unit,
        )} / critical ${formatAlertValue(
          locale,
          topOpsAlert.thresholds.critical,
          topOpsAlert.thresholds.unit,
        )}`,
        `警示 ${formatAlertValue(
          locale,
          topOpsAlert.thresholds.warning,
          topOpsAlert.thresholds.unit,
        )} / 重大 ${formatAlertValue(
          locale,
          topOpsAlert.thresholds.critical,
          topOpsAlert.thresholds.unit,
        )}`,
      )}`,
      target:
        topOpsAlert.key === "adapter_degradation"
          ? {
              href: buildCrossAppHref({
                targetApp: "platform-admin",
                route: "/adapter-registry",
                resourceType: "adapter_registry",
                resourceId: "all",
                openMode: "new_tab",
                label: "Adapter registry",
              }),
              external: true,
            }
          : { href: "/dispatch?view=forwarded" },
      ctaLabel:
        topOpsAlert.key === "adapter_degradation"
          ? copy(locale, "Inspect adapter", "查看 adapter")
          : copy(locale, "Open forwarded triage", "查看 forwarded triage"),
    });
  }

  const attentionEmptyReason = deriveEmptyReason({
    error: observability.error ?? incidents.error,
    itemCount: attentionBanners.length,
    filteredCount:
      attentionBanners.length === 0 &&
      observability.data.alerts.length > 0 &&
      opsAlerts.length === 0
        ? observability.data.alerts.length
        : 0,
    dependencyUnavailable:
      adapterAttentionCount > 0 && focusAdapter?.status === "down",
  });
  const attentionEmpty = emptyStateModel(locale, attentionEmptyReason, {
    href: "/dispatch",
  });

  const adapterEmptyReason = deriveEmptyReason({
    error: observability.error,
    itemCount: observability.data.adapterDetails.length,
    dependencyUnavailable:
      adapterAttentionCount > 0 && focusAdapter?.status === "down",
    notProvisioned:
      observability.data.adapters.totalAdapters === 0 &&
      observability.data.adapterDetails.length === 0,
  });
  const adapterEmpty = emptyStateModel(locale, adapterEmptyReason, {
    href: buildCrossAppHref({
      targetApp: "platform-admin",
      route: "/adapter-registry",
      resourceType: "adapter_registry",
      resourceId: "all",
      openMode: "new_tab",
      label: "Adapter registry",
    }),
    external: true,
  });

  const queueEmptyReason = deriveEmptyReason({
    error: orders.error ?? dispatchJobs.error,
    itemCount: queueRows.length,
    dependencyUnavailable: pageHealth.status === "down",
  });
  const queueEmpty = emptyStateModel(locale, queueEmptyReason, {
    href: "/dispatch",
  });

  const identityChipLabel = `${formatOpsCodeLabel(
    locale,
    identity.data?.realm ?? "ops",
  )} / ${formatOpsCodeLabel(locale, identity.data?.actorType ?? "ops_user")}`;

  const healthChipLabel = `${pageHealth.status.toUpperCase()} · ${formatGeneratedAge(
    locale,
    pageHealth.lastCheckedAt,
  )}`;

  const refreshChipTone =
    pageFreshness === "degraded"
      ? "danger"
      : pageFreshness === "stale"
        ? "warn"
        : "success";

  const headerSubtitle = [
    formatTimestamp(locale, observability.refresh.generatedAt),
    copy(
      locale,
      `${activeShiftCount} active shifts`,
      `${activeShiftCount} 個進行中班次`,
    ),
    `${copy(locale, "mode", "模式")} ${formatOpsCodeLabel(locale, health.data.mode)}`,
    `${copy(locale, "execution", "執行")} ${formatOpsCodeLabel(locale, health.data.execution_mode)}`,
  ].join(" · ");

  const demandPaceHint =
    todayTrend && averageRecentOrders > 0
      ? formatSignedPercent(locale, demandDeltaPercent)
      : copy(locale, "7d baseline unavailable", "沒有 7 日基準");

  const adapterSignalRows: Array<{
    label: string;
    value: string;
    tone: CanvasTone;
  }> = focusAdapter
    ? [
        {
          label: copy(locale, "Credential", "Credential"),
          value: formatOpsCodeLabel(locale, focusAdapter.credentialStatus),
          tone: getHealthTone(focusAdapter.credentialStatus),
        },
        {
          label: copy(locale, "Auth", "Auth"),
          value: formatOpsCodeLabel(locale, focusAdapter.authStatus),
          tone: getHealthTone(focusAdapter.authStatus),
        },
        {
          label: copy(locale, "Webhook", "Webhook"),
          value: formatOpsCodeLabel(locale, focusAdapter.webhookStatus),
          tone: getHealthTone(focusAdapter.webhookStatus),
        },
        {
          label: copy(locale, "Rate limit", "Rate limit"),
          value: formatOpsCodeLabel(locale, focusAdapter.rateLimitStatus),
          tone: getHealthTone(focusAdapter.rateLimitStatus),
        },
        {
          label: copy(locale, "Last checked", "最後檢查"),
          value: formatTimestamp(locale, focusAdapter.lastCheckedAt),
          tone: "info" as const,
        },
        {
          label: copy(locale, "Last error", "最後錯誤"),
          value:
            focusAdapter.lastError ??
            copy(locale, "No current error", "目前沒有錯誤"),
          tone: focusAdapter.lastError ? "danger" : ("success" as const),
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        theme={theme}
        title={copy(locale, "Operations Dashboard", "營運總覽")}
        subtitle={headerSubtitle}
        actions={
          <>
            {DUTY_HANDBOOK_URL ? (
              <a
                href={DUTY_HANDBOOK_URL}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Btn theme={theme} icon="ext">
                  {copy(locale, "Duty handbook", "值班手冊")}
                </Btn>
              </a>
            ) : (
              <span title="Set NEXT_PUBLIC_OPS_DUTY_HANDBOOK_URL">
                <Btn theme={theme} icon="ext" disabled>
                  {copy(locale, "Duty handbook", "值班手冊")}
                </Btn>
              </span>
            )}
            <Link
              href="/callcenter?intent=new-session"
              style={{ textDecoration: "none" }}
            >
              <Btn theme={theme} variant="primary" icon="phone">
                {copy(locale, "Open call session", "開新 call session")}
              </Btn>
            </Link>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={metaRowStyle}>
          <Pill
            theme={theme}
            tone={refreshChipTone}
            dot
            style={{ fontFamily: theme.monoFamily }}
          >
            {refreshTierCode(DASHBOARD_REFRESH_TIER)} · {pageFreshness}
          </Pill>
          <Pill
            theme={theme}
            tone="accent"
            style={{ fontFamily: theme.monoFamily }}
          >
            {identityChipLabel}
          </Pill>
          <Pill
            theme={theme}
            tone={
              pageHealth.status === "healthy"
                ? "success"
                : pageHealth.status === "down"
                  ? "danger"
                  : "warn"
            }
            dot
            style={{ fontFamily: theme.monoFamily }}
          >
            {healthChipLabel}
          </Pill>
        </div>

        {pageHealth.status !== "healthy" ? (
          <Banner
            theme={theme}
            tone={pageHealth.status === "down" ? "danger" : "warn"}
            icon="warn"
            title={copy(
              locale,
              "UiHealthEnvelope indicates dashboard degradation",
              "UiHealthEnvelope 顯示 Dashboard 依賴降級",
            )}
            body={
              pageHealth.degradedServices.length > 0
                ? pageHealth.degradedServices
                    .map((service) => `${service.service} (${service.impact})`)
                    .join(" · ")
                : copy(
                    locale,
                    "Some reads are degraded. Do not mistake fallback data for a healthy shift.",
                    "部分讀取處於降級狀態。不要把 fallback 資料誤判成健康班次。",
                  )
            }
          />
        ) : null}

        {pageFreshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone={pageFreshness === "degraded" ? "danger" : "warn"}
            icon="clock"
            title={copy(
              locale,
              "Dashboard data is no longer fresh",
              "Dashboard 資料目前不是 fresh",
            )}
            body={copy(
              locale,
              `Snapshot generated ${formatGeneratedAge(
                locale,
                observability.refresh.generatedAt,
              )} at refresh tier ${refreshTierCode(
                DASHBOARD_REFRESH_TIER,
              )}. Wait for the next poll or reopen the page.`,
              `目前顯示的是 ${formatGeneratedAge(
                locale,
                observability.refresh.generatedAt,
              )} 產生的快照；refresh tier 為 ${refreshTierCode(
                DASHBOARD_REFRESH_TIER,
              )}。可等待下次 poll 或重新開啟頁面。`,
            )}
          />
        ) : null}

        <div style={quickActionRowStyle}>
          <Link href="/dispatch" style={{ textDecoration: "none" }}>
            <Btn theme={theme} variant="secondary" icon="dispatch">
              {copy(locale, "Open dispatch", "前往派遣")}
            </Btn>
          </Link>
          <Link
            href="/dispatch?view=forwarded"
            style={{ textDecoration: "none" }}
          >
            <Btn theme={theme} variant="secondary" icon="adapters">
              {copy(locale, "Open forwarded triage", "查看 forwarded triage")}
            </Btn>
          </Link>
          <Link href="/incidents" style={{ textDecoration: "none" }}>
            <Btn theme={theme} variant="secondary" icon="warn">
              {copy(locale, "Open incidents", "前往事故")}
            </Btn>
          </Link>
        </div>

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={copy(locale, "Active orders", "進行中訂單")}
            value={formatCompactValue(locale, dispatch.activeOrders)}
            delta={
              dispatch.redispatchOrders > 0
                ? copy(
                    locale,
                    `${formatCompactValue(locale, dispatch.redispatchOrders)} redispatch`,
                    `${formatCompactValue(locale, dispatch.redispatchOrders)} 筆改派`,
                  )
                : undefined
            }
            deltaTone={dispatch.redispatchOrders > 0 ? "down" : "neutral"}
            sub={copy(locale, "Realtime + reservation", "即時 + 預約")}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Dispatch queue", "派遣佇列")}
            value={formatCompactValue(locale, dispatch.queueDepth)}
            delta={copy(
              locale,
              `${formatCompactValue(
                locale,
                dispatchJobs.data.filter((job) => job.status === "matching")
                  .length,
              )} broadcasting`,
              `${formatCompactValue(
                locale,
                dispatchJobs.data.filter((job) => job.status === "matching")
                  .length,
              )} 筆 broadcasting`,
            )}
            deltaTone="neutral"
            sub={demandPaceHint}
            hint={
              dispatch.averageEtaMinutes !== null
                ? copy(
                    locale,
                    `Avg ETA ${dispatch.averageEtaMinutes} min`,
                    `平均 ETA ${dispatch.averageEtaMinutes} 分鐘`,
                  )
                : copy(locale, "ETA pending", "ETA 待確認")
            }
          />
          <KPI
            theme={theme}
            label={copy(locale, "Dispatch-eligible drivers", "可派司機")}
            value={formatCompactValue(locale, dispatchEligibleDrivers)}
            delta={
              staleLocationDrivers > 0
                ? copy(
                    locale,
                    `${formatCompactValue(locale, staleLocationDrivers)} stale`,
                    `${formatCompactValue(locale, staleLocationDrivers)} 位 stale`,
                  )
                : undefined
            }
            deltaTone={staleLocationDrivers > 0 ? "down" : "neutral"}
            sub={copy(
              locale,
              `${formatCompactValue(locale, operations.onlineDrivers)} on shift`,
              `${formatCompactValue(locale, operations.onlineDrivers)} 位在班`,
            )}
            hint={staleLocationHint}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Dispatchable vehicles", "可派車輛")}
            value={formatCompactValue(locale, operations.dispatchableVehicles)}
            delta={
              operations.offlineVehicles > 0
                ? copy(
                    locale,
                    `${formatCompactValue(locale, operations.offlineVehicles)} offline`,
                    `${formatCompactValue(locale, operations.offlineVehicles)} 輛離線`,
                  )
                : undefined
            }
            deltaTone={operations.offlineVehicles > 0 ? "down" : "neutral"}
            sub={copy(locale, "Fleet readiness", "供給車隊狀態")}
            hint={
              dispatch.queueDepth > 0
                ? copy(
                    locale,
                    `${(operations.dispatchableVehicles / dispatch.queueDepth).toFixed(1)}x vehicle/queue`,
                    `${(operations.dispatchableVehicles / dispatch.queueDepth).toFixed(1)} 倍車輛/queue`,
                  )
                : copy(locale, "Queue clear", "目前無 queue 壓力")
            }
          />
          <KPI
            theme={theme}
            label={copy(locale, "Open incidents", "未結事故")}
            value={formatCompactValue(locale, operations.openIncidents)}
            delta={
              criticalIncidentCount > 0
                ? copy(
                    locale,
                    `${formatCompactValue(locale, criticalIncidentCount)} critical`,
                    `${formatCompactValue(locale, criticalIncidentCount)} 件重大`,
                  )
                : undefined
            }
            deltaTone={criticalIncidentCount > 0 ? "down" : "neutral"}
            sub={copy(
              locale,
              `${formatCompactValue(locale, operations.overdueMaintenance)} overdue maintenance`,
              `${formatCompactValue(locale, operations.overdueMaintenance)} 項逾期保養`,
            )}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Today's revenue", "今日收益")}
            value={formatMinorCurrency(locale, todayRevenue.totalRevenueMinor)}
            delta={
              todayTrend
                ? copy(
                    locale,
                    `${formatCompactValue(locale, todayTrend.createdOrders)} new orders today`,
                    `${formatCompactValue(locale, todayTrend.createdOrders)} 筆今日新單`,
                  )
                : undefined
            }
            deltaTone={todayRevenue.completedTrips > 0 ? "up" : "neutral"}
            sub={copy(
              locale,
              `${formatCompactValue(locale, todayRevenue.completedTrips)} completed trips`,
              `${formatCompactValue(locale, todayRevenue.completedTrips)} 趟已完成`,
            )}
          />
        </div>

        <div style={splitGridStyle}>
          <Card
            theme={theme}
            title={copy(locale, "Today's attention", "今日待處理")}
            subtitle={copy(
              locale,
              "critical → governance/no-supply → operational alerts",
              "排序：critical → 審批/無供給 → operational alerts",
            )}
            actions={
              <Link href="/dispatch" style={{ textDecoration: "none" }}>
                <Btn theme={theme} variant="ghost">
                  {copy(locale, "Open dispatch", "前往派遣")}
                </Btn>
              </Link>
            }
          >
            <div style={bannerStackStyle}>
              {attentionBanners.length > 0 ? (
                attentionBanners.map((banner) => (
                  <Banner
                    key={banner.key}
                    theme={theme}
                    tone={banner.tone}
                    icon={<CanvasIcon name="warn" size={16} />}
                    title={banner.title}
                    body={banner.body}
                    actions={
                      banner.target && banner.ctaLabel
                        ? renderLinkButton(
                            banner.target,
                            <Btn
                              theme={theme}
                              variant={
                                banner.tone === "danger"
                                  ? "primary"
                                  : "secondary"
                              }
                              icon={banner.target.external ? "ext" : "arrow"}
                            >
                              {banner.ctaLabel}
                            </Btn>,
                          )
                        : undefined
                    }
                  />
                ))
              ) : (
                <DashboardEmptyState model={attentionEmpty} locale={locale} />
              )}
            </div>
          </Card>

          <Card
            theme={theme}
            title={copy(
              locale,
              "Forwarded adapter watch",
              "Forwarded adapter 觀測",
            )}
            subtitle={copy(
              locale,
              "Adapter degradation summary + platform-admin inspection link",
              "Adapter 降級摘要 + platform-admin 檢查連結",
            )}
            actions={renderLinkButton(
              {
                href: buildCrossAppHref({
                  targetApp: "platform-admin",
                  route: "/adapter-registry",
                  resourceType: "adapter_registry",
                  resourceId: "all",
                  openMode: "new_tab",
                  label: "Adapter registry",
                }),
                external: true,
              },
              <Btn theme={theme} variant="ghost" icon="ext">
                {copy(locale, "Open adapter registry", "打開 adapter registry")}
              </Btn>,
            )}
          >
            {focusAdapter ? (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {adapterAttentionCount > 0 ? (
                  <Banner
                    theme={theme}
                    tone={focusAdapter.status === "down" ? "danger" : "warn"}
                    icon="adapters"
                    title={copy(
                      locale,
                      `${formatCompactValue(
                        locale,
                        adapterAttentionCount,
                      )} adapters need attention · example ${formatOpsCodeLabel(
                        locale,
                        focusAdapter.platformCode,
                      )}`,
                      `${formatCompactValue(
                        locale,
                        adapterAttentionCount,
                      )} 個 adapter 需要關注 · 例如 ${formatOpsCodeLabel(
                        locale,
                        focusAdapter.platformCode,
                      )}`,
                    )}
                    body={copy(
                      locale,
                      `${formatCompactValue(
                        locale,
                        observability.data.forwarderOps.syncFailedOrders,
                      )} sync_failed · ${formatCompactValue(
                        locale,
                        observability.data.forwarderOps.manualFallbackQueue,
                      )} manual fallback · oldest ${formatRelativeMinutes(
                        locale,
                        observability.data.forwarderOps
                          .oldestSyncFailedLagMinutes,
                      )}`,
                      `${formatCompactValue(
                        locale,
                        observability.data.forwarderOps.syncFailedOrders,
                      )} 筆 sync_failed · ${formatCompactValue(
                        locale,
                        observability.data.forwarderOps.manualFallbackQueue,
                      )} 筆 manual fallback · 最久 ${formatRelativeMinutes(
                        locale,
                        observability.data.forwarderOps
                          .oldestSyncFailedLagMinutes,
                      )}`,
                    )}
                  />
                ) : null}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 10,
                  }}
                >
                  <KPI
                    theme={theme}
                    label={copy(
                      locale,
                      "Adapters needing attention",
                      "需關注的 adapter",
                    )}
                    value={formatCompactValue(locale, adapterAttentionCount)}
                    sub={copy(
                      locale,
                      `${formatCompactValue(
                        locale,
                        observability.data.adapters.downAdapters,
                      )} down`,
                      `${formatCompactValue(
                        locale,
                        observability.data.adapters.downAdapters,
                      )} 個 down`,
                    )}
                  />
                  <KPI
                    theme={theme}
                    label="sync_failed"
                    value={formatCompactValue(
                      locale,
                      observability.data.forwarderOps.syncFailedOrders,
                    )}
                    sub={copy(locale, "mirror backlog", "mirror 積壓")}
                  />
                  <KPI
                    theme={theme}
                    label="accept_pending"
                    value={formatCompactValue(
                      locale,
                      observability.data.forwarderOps.acceptPendingOrders,
                    )}
                    sub={copy(
                      locale,
                      "awaiting partner accept",
                      "等待外部接受",
                    )}
                  />
                  <KPI
                    theme={theme}
                    label="reconciliation"
                    value={formatCompactValue(
                      locale,
                      observability.data.forwarderOps.reconciliationQueue,
                    )}
                    sub={copy(
                      locale,
                      "cross-app finance owner",
                      "跨 app 財務 owner",
                    )}
                  />
                </div>

                <div style={signalListStyle}>
                  {adapterSignalRows.map((signal) => (
                    <div key={signal.label} style={signalRowStyle}>
                      <Pill theme={theme} tone={signal.tone} dot>
                        {signal.value}
                      </Pill>
                      <span style={signalLabelStyle}>{signal.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <DashboardEmptyState model={adapterEmpty} locale={locale} />
            )}
          </Card>
        </div>

        <Card
          theme={theme}
          title={copy(
            locale,
            "Current dispatch queue · top 5",
            "當前 dispatch 隊列 · top 5",
          )}
          subtitle={copy(
            locale,
            "Priority: override_pending → no_supply → exception_hold → broadcasting → queued → assigned",
            "優先序：override_pending → no_supply → exception_hold → broadcasting → queued → assigned",
          )}
          padding={0}
          actions={
            <>
              {leadAction
                ? renderDescriptorButton(leadAction, locale, {
                    href: "/dispatch",
                  })
                : null}
              <Link href="/dispatch" style={{ textDecoration: "none" }}>
                <Btn theme={theme} variant="ghost">
                  {copy(locale, "Open dispatch", "前往派遣")}
                </Btn>
              </Link>
            </>
          }
        >
          {queueRows.length > 0 ? (
            <Table theme={theme} columns={queueColumns} rows={queueRows} />
          ) : (
            <div style={{ padding: 16 }}>
              <DashboardEmptyState model={queueEmpty} locale={locale} />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
