import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  BookingRecord,
  CrossAppResourceLink,
  EmptyReason,
  FeatureFlagSummary,
  IdentityContext,
  NotificationRecord,
  RefreshTier,
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
  TenantInvoiceRecord,
  TenantQuotaSummary,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime, formatMoney } from "@/lib/formatters";
import {
  TENANT_CONSOLE_CONTEXT,
  TENANT_CONSOLE_ENV,
  tenantNavItems,
} from "@/lib/navigation";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const ATTENTION_STATUSES = new Set([
  "dispatch_failed",
  "dispatch_timeout",
  "exception_hold",
  "no_supply",
  "proof_pending",
  "redispatch_required",
]);

const REFRESH_TIER: RefreshTier = "slow";
const REFRESH_STALE_AFTER_MS = 30_000;
const EXISTING_APP_ROUTES = new Set([
  "/",
  "/api-keys",
  "/audit",
  "/bookings",
  "/cost-centers",
  "/invoices",
  "/passengers",
  "/rules",
  "/settings",
  "/users",
  "/webhooks",
]);

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr",
  gap: 16,
  alignItems: "start",
};

const heroPanelStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 24,
  padding: 18,
  background:
    "linear-gradient(135deg, rgba(63, 217, 191, 0.16), rgba(11, 16, 21, 0.92) 62%)",
  display: "grid",
  gap: 14,
};

const heroChipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const heroEyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  letterSpacing: 1.8,
  textTransform: "uppercase",
  color: th.textMuted,
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.12,
  fontWeight: 700,
  color: th.text,
};

const heroBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.6,
  color: th.textMuted,
  maxWidth: 720,
};

const actionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.45fr 1fr",
  gap: 16,
  alignItems: "start",
};

const bottomGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.15fr 0.95fr",
  gap: 16,
  alignItems: "start",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const cardStackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const moduleSummaryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const moduleTileStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 16,
  padding: 12,
  background: "rgba(255,255,255,0.02)",
  display: "grid",
  gap: 8,
};

const navChipWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const navChipStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 999,
  padding: "6px 10px",
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.1,
};

const emptyPanelStyle: CSSProperties = {
  border: `1px dashed ${th.border}`,
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.02)",
  display: "grid",
  gap: 10,
};

const actionTileBaseStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.03)",
  display: "grid",
  gap: 10,
  textDecoration: "none",
  color: th.text,
};

const actionTileDisabledStyle: CSSProperties = {
  ...actionTileBaseStyle,
  opacity: 0.54,
};

const actionMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const emptyActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  width: "fit-content",
  borderRadius: 999,
  padding: "8px 12px",
  background: th.accent,
  color: th.bg,
  fontWeight: 600,
  fontSize: 12,
  textDecoration: "none",
};

const secondaryActionStyle: CSSProperties = {
  ...emptyActionStyle,
  background: "rgba(255,255,255,0.08)",
  color: th.text,
};

const externalLinkStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 16,
  padding: 12,
  background: "rgba(255,255,255,0.02)",
  display: "grid",
  gap: 6,
  textDecoration: "none",
  color: th.text,
};

const statusCopyStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  color: th.textMuted,
  fontSize: 11.5,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  color: th.text,
};

const sectionBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  color: th.textMuted,
  lineHeight: 1.5,
};

type DashboardData = {
  identity: IdentityContext | null;
  featureFlags: FeatureFlagSummary | null;
  bookings: BookingRecord[];
  invoices: TenantInvoiceRecord[];
  notifications: NotificationRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  readiness: TenantIntegrationReadinessSummary | null;
  quotaSummary: TenantQuotaSummary | null;
  errors: string[];
};

type AvailableAction = {
  label: string;
  href: string;
  description: string;
  descriptor: ResourceActionDescriptor;
};

type WorkspaceModule = {
  key: string;
  title: string;
  href: string;
  status: "ready" | "attention" | "not_provisioned";
  body: string;
  meta: string;
};

type RecentBookingRow = {
  bookingId: string;
  passenger: string;
  route: string;
  window: string;
  status: BookingRecord["orderStatus"];
  updatedAt: string;
};

type HomeEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type EmptyPresentation = {
  tone: "info" | "warn" | "danger";
  icon: "warn" | "info" | "clock" | "ok";
  title: string;
  body: string;
  nextAction?: AvailableAction;
};

const EMPTY_REASON_ORDER: HomeEmptyReason[] = [
  "not_provisioned",
  "external_unavailable",
  "fetch_failed",
  "permission_denied",
  "no_data",
  "filtered_empty",
];

const EMPTY_REASON_LABEL: Record<HomeEmptyReason, string> = {
  no_data: "尚無資料",
  not_provisioned: "尚未開通",
  fetch_failed: "載入失敗",
  permission_denied: "權限不足",
  external_unavailable: "外部依賴不可用",
  filtered_empty: "篩選後為空",
};

const WORKSPACE_QUICK_ACTION_ORDER = [
  "booking.create",
  "booking.list_today",
  "integration.open_governance",
] as const;

async function loadDashboardData(): Promise<DashboardData> {
  const client = getTenantClient();
  const [
    identity,
    featureFlags,
    bookings,
    invoices,
    notifications,
    governance,
    readiness,
    quotaSummary,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getFeatureFlags({
      tenantId: DEMO_TENANT_ID,
    }) as Promise<FeatureFlagSummary>,
    client.listTenantBookings() as Promise<BookingRecord[]>,
    client.listInvoices() as Promise<TenantInvoiceRecord[]>,
    client.listTenantNotificationFeed() as Promise<NotificationRecord[]>,
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
    client.getTenantIntegrationReadinessSummary() as Promise<TenantIntegrationReadinessSummary>,
    client.getTenantQuotaSummary() as Promise<TenantQuotaSummary>,
  ]);

  const errors: string[] = [];
  const collectError = (
    label: string,
    result: PromiseSettledResult<unknown>,
  ) => {
    if (result.status === "rejected") {
      errors.push(
        `${label}: ${result.reason instanceof Error ? result.reason.message : "Unknown error"}`,
      );
    }
  };

  collectError("Identity", identity);
  collectError("Feature flags", featureFlags);
  collectError("Bookings", bookings);
  collectError("Invoices", invoices);
  collectError("Notifications", notifications);
  collectError("Integration governance", governance);
  collectError("Integration readiness", readiness);
  collectError("Tenant quota", quotaSummary);

  return {
    identity: identity.status === "fulfilled" ? identity.value : null,
    featureFlags:
      featureFlags.status === "fulfilled" ? featureFlags.value : null,
    bookings: bookings.status === "fulfilled" ? bookings.value : [],
    invoices: invoices.status === "fulfilled" ? invoices.value : [],
    notifications:
      notifications.status === "fulfilled" ? notifications.value : [],
    governance: governance.status === "fulfilled" ? governance.value : null,
    readiness: readiness.status === "fulfilled" ? readiness.value : null,
    quotaSummary:
      quotaSummary.status === "fulfilled" ? quotaSummary.value : null,
    errors,
  };
}

function buildRefreshMetadata(data: DashboardData): UiRefreshMetadata {
  const generatedAt =
    [
      data.quotaSummary?.refreshedAt,
      data.readiness?.computedAt,
      data.governance?.generatedAt,
      ...data.bookings.slice(0, 8).map((booking) => booking.updatedAt),
      ...data.invoices.slice(0, 4).map((invoice) => invoice.periodEnd),
      ...data.notifications
        .slice(0, 4)
        .map((notification) => notification.createdAt),
    ]
      .filter(Boolean)
      .sort()
      .at(-1) ?? new Date().toISOString();

  return {
    generatedAt,
    staleAfterMs: REFRESH_STALE_AFTER_MS,
    dataFreshness: data.errors.length > 0 ? "degraded" : "fresh",
    source: "live",
  };
}

function getRefreshLabel(refresh: UiRefreshMetadata) {
  return `T5 / 30s · ${refresh.dataFreshness === "degraded" ? "degraded" : "fresh"}`;
}

function getRiskLabel(riskLevel: ResourceActionDescriptor["riskLevel"]) {
  switch (riskLevel) {
    case "high":
      return "高風險";
    case "medium":
      return "中風險";
    default:
      return "低風險";
  }
}

function getChannelLabel(channel: NotificationRecord["channel"]) {
  switch (channel) {
    case "ops_notice":
      return "ops_notice";
    case "tenant_sla":
      return "tenant_sla";
    case "driver_task":
      return "driver_task";
    case "tenant_approval":
      return "tenant_approval";
  }
}

function getSubSystemLabel(
  subSystem: TenantIntegrationReadinessItem["subSystem"],
) {
  switch (subSystem) {
    case "api_keys":
      return "API 金鑰";
    case "webhooks":
      return "Webhook";
    case "notifications":
      return "通知";
    case "sla":
      return "SLA";
    case "reports":
      return "報表";
    case "modules":
      return "模組";
    case "partner_entries":
      return "Partner entries";
  }
}

function getReadinessItem(
  readiness: TenantIntegrationReadinessSummary | null,
  subSystem: TenantIntegrationReadinessItem["subSystem"],
) {
  return readiness?.items.find((item) => item.subSystem === subSystem) ?? null;
}

function getActionRoute(action: string) {
  const directRoutes: Record<string, string> = {
    "booking.create": "/bookings/new",
    "booking.list_today": "/bookings",
    "integration.open_governance": "/integration-governance",
  };

  if (directRoutes[action]) {
    return directRoutes[action];
  }

  if (action.includes("api_key")) {
    return "/api-keys";
  }

  if (action.includes("webhook")) {
    return "/webhooks";
  }

  if (action.includes("notification")) {
    return "/notifications";
  }

  if (action.includes("sla")) {
    return "/sla";
  }

  if (action.includes("billing") || action.includes("invoice")) {
    return "/billing";
  }

  if (action.includes("report")) {
    return "/reports";
  }

  if (action.includes("user")) {
    return "/users";
  }

  return "/integration-governance";
}

function getActionLabel(action: string) {
  switch (action) {
    case "booking.create":
      return "建立叫車";
    case "booking.list_today":
      return "查看今日叫車";
    case "issue_api_key":
      return "簽發 API 金鑰";
    case "integration.open_governance":
      return "開啟整合就緒度";
    default:
      if (action.includes("webhook")) {
        return "設定 Webhook";
      }
      if (action.includes("notification")) {
        return "設定通知";
      }
      if (action.includes("sla")) {
        return "設定 SLA";
      }
      return action.replaceAll("_", " ");
  }
}

function getActionDescription(action: string) {
  if (action === "booking.create") {
    return "直接從工作面進入 command-based 建立叫車流程。";
  }

  if (action === "booking.list_today") {
    return "查看今日佇列與最新狀態變更。";
  }

  if (action.includes("api_key")) {
    return "用簽發或輪替憑證完成租戶整合開通。";
  }

  if (action.includes("webhook")) {
    return "接通事件投遞並在 cutover 前完成端點驗證。";
  }

  if (action.includes("notification")) {
    return "檢查基線訂閱與租戶通知覆寫。";
  }

  if (action.includes("sla")) {
    return "檢查 SLA 門檻並補齊治理缺口。";
  }

  return "依後端回傳的 action descriptor 執行目前狀態允許的下一步。";
}

function toAvailableAction(
  descriptor: ResourceActionDescriptor,
): AvailableAction {
  return {
    label: getActionLabel(descriptor.action),
    href: getActionRoute(descriptor.action),
    description: getActionDescription(descriptor.action),
    descriptor,
  };
}

function dedupeAvailableActions(actions: ResourceActionDescriptor[]) {
  const seen = new Set<string>();

  return actions.filter((descriptor) => {
    const key = `${descriptor.action}:${descriptor.enabled}:${descriptor.disabledReasonCode ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildAvailableActions(data: DashboardData): AvailableAction[] {
  const readinessActions =
    data.readiness?.items
      .map((item) => item.nextAction)
      .filter((action): action is ResourceActionDescriptor =>
        Boolean(action),
      ) ?? [];

  return dedupeAvailableActions(readinessActions).map(toAvailableAction);
}

function buildQuickActions(actions: AvailableAction[]) {
  return WORKSPACE_QUICK_ACTION_ORDER.flatMap((actionId) => {
    const match = actions.find(
      (action) => action.descriptor.action === actionId,
    );
    return match ? [match] : [];
  });
}

function isModuleFlagEnabled(flags: FeatureFlagSummary["flags"], key: string) {
  const related = flags.filter((flag) => flag.key.includes(key));
  if (related.length === 0) {
    return true;
  }

  return related.some((flag) => flag.enabled);
}

function mapReadinessStatus(
  item: TenantIntegrationReadinessItem | null,
): WorkspaceModule["status"] {
  if (!item) {
    return "not_provisioned";
  }

  if (item.status === "ready") {
    return "ready";
  }

  if (item.status === "partial") {
    return "attention";
  }

  return "not_provisioned";
}

function buildModuleSummary(data: DashboardData): WorkspaceModule[] {
  const flags = data.featureFlags?.flags ?? [];
  const activeBookings = getActiveBookings(data.bookings);
  const attentionBookings = activeBookings.filter((booking) =>
    ATTENTION_STATUSES.has(booking.orderStatus),
  );
  const openInvoices = data.invoices.filter(
    (invoice) => invoice.status !== "paid",
  );

  const modules = [
    {
      key: "bookings",
      title: "Bookings",
      href: "/bookings",
      status:
        attentionBookings.length > 0
          ? "attention"
          : activeBookings.length > 0
            ? "ready"
            : "not_provisioned",
      body: "Current queue, recent status changes, and today’s operator follow-up.",
      meta:
        activeBookings.length > 0
          ? `${formatCount(activeBookings.length)} 進行中 · ${formatCount(attentionBookings.length)} 待處理`
          : "目前沒有進行中的叫車。",
    },
    {
      key: "integration",
      title: "整合",
      href: "/integration-governance",
      status: mapReadinessStatus(getReadinessItem(data.readiness, "modules")),
      body: "整合 API 金鑰、Webhook、通知、SLA 與模組 readiness。",
      meta:
        getReadinessItem(data.readiness, "modules")?.detail ??
        "目前沒有模組層級的 readiness 詳情。",
    },
    {
      key: "billing",
      title: "帳務",
      href: "/billing",
      status:
        openInvoices.length > 0
          ? "attention"
          : data.invoices.length > 0
            ? "ready"
            : "not_provisioned",
      body: "查看當期帳務、發票狀態與財務待辦。",
      meta:
        data.invoices.length > 0
          ? `${formatCount(openInvoices.length)} 張尚未結清`
          : "目前沒有可見發票。",
    },
    {
      key: "users",
      title: "帳號與權限",
      href: "/users",
      status: data.identity?.tenantId ? "ready" : "not_provisioned",
      body: "租戶角色、actor context 與可見模組權限。",
      meta: data.identity?.roles.length
        ? data.identity.roles.join(" / ")
        : "目前沒有角色上下文。",
    },
  ] satisfies WorkspaceModule[];

  return modules.filter((module) => isModuleFlagEnabled(flags, module.key));
}

function getActiveBookings(bookings: BookingRecord[]) {
  return bookings.filter(
    (booking) =>
      booking.orderStatus !== "completed" &&
      booking.orderStatus !== "cancelled",
  );
}

function getVisibleNavItems(data: DashboardData) {
  const flags = data.featureFlags?.flags ?? [];
  return tenantNavItems.filter((item) => isModuleFlagEnabled(flags, item.key));
}

function getTenantSuspendedSignal(data: DashboardData) {
  const sources = [
    ...data.errors,
    ...(data.featureFlags?.notes ?? []),
    ...(data.governance?.onboardingChecklist ?? []),
  ].join(" ");

  return /\bsuspend(ed)?\b/i.test(sources);
}

function getWorkspaceEmptyReason(
  data: DashboardData,
  visibleModules: WorkspaceModule[],
): HomeEmptyReason | null {
  if (!data.identity?.tenantId) {
    return "permission_denied";
  }

  if (data.errors.some((error) => error.startsWith("Bookings:"))) {
    return "fetch_failed";
  }

  if (
    data.readiness?.items.some((item) => item.status === "blocked") ||
    data.errors.some((error) =>
      /Notifications|Integration governance|Tenant quota/.test(error),
    )
  ) {
    return "external_unavailable";
  }

  if (
    data.readiness?.items.some((item) => item.status === "not_provisioned") ||
    (data.governance?.onboardingChecklist.length ?? 0) > 0
  ) {
    return "not_provisioned";
  }

  if (data.bookings.length === 0) {
    return "no_data";
  }

  if (visibleModules.length === 0) {
    return "filtered_empty";
  }

  return null;
}

function getEmptyPresentation(
  reason: HomeEmptyReason,
  availableActions: AvailableAction[],
): EmptyPresentation {
  const integrationAction =
    availableActions.find((action) =>
      [
        "integration.open_governance",
        "issue_api_key",
        "create_webhook",
        "configure_notifications",
        "configure_sla",
      ].includes(action.descriptor.action),
    ) ?? availableActions[0];

  switch (reason) {
    case "no_data":
      return {
        tone: "info",
        icon: "info",
        title: "尚無租戶活動",
        body: "目前沒有近期叫車，工作面維持在入口動作與模組總覽狀態。",
      };
    case "not_provisioned":
      return {
        tone: "warn",
        icon: "warn",
        title: "租戶尚未完成開通",
        body: "至少一個子系統仍需完成 API 金鑰、Webhook、通知或 SLA 開通。",
        ...(integrationAction ? { nextAction: integrationAction } : {}),
      };
    case "fetch_failed":
      return {
        tone: "warn",
        icon: "clock",
        title: "部分工作面資料載入失敗",
        body: "這次快照為 partial snapshot。請重新整理，並進一步查看受影響模組。",
      };
    case "permission_denied":
      return {
        tone: "warn",
        icon: "warn",
        title: "目前 actor 缺少租戶上下文",
        body: "缺少有效的 tenant identity context，因此無法顯示租戶範圍操作。",
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "clock",
        title: "外部依賴目前不可用",
        body: "至少一個上游整合或通知依賴處於 degraded 狀態。",
        ...(integrationAction ? { nextAction: integrationAction } : {}),
      };
    case "filtered_empty":
      return {
        tone: "info",
        icon: "info",
        title: "可見模組目前都被篩掉",
        body: "feature visibility 與模組 gating 讓這個 actor 暫時看不到任何入口。",
      };
  }
}

function getStatusTone(
  status: WorkspaceModule["status"] | TenantIntegrationReadinessItem["status"],
): CanvasTone {
  switch (status) {
    case "ready":
      return "success";
    case "attention":
    case "partial":
      return "warn";
    case "blocked":
      return "danger";
    default:
      return "neutral";
  }
}

function getBookingStatusTone(
  status: BookingRecord["orderStatus"],
): CanvasTone {
  if (ATTENTION_STATUSES.has(status)) {
    return "warn";
  }

  if (
    status === "assigned" ||
    status === "driver_accepted" ||
    status === "enroute_pickup" ||
    status === "arrived_pickup" ||
    status === "on_trip"
  ) {
    return "success";
  }

  return "info";
}

function formatQuotaValue(data: DashboardData) {
  const quota = data.quotaSummary;
  if (!quota) {
    return "—";
  }

  const used =
    quota.usage.pendingReservedBookingCount + quota.usage.confirmedBookingCount;
  const limit = quota.limit.bookingCountLimit;

  return limit === null
    ? `${formatCount(used)} used`
    : `${formatCount(used)} / ${formatCount(limit)}`;
}

function formatQuotaSubline(data: DashboardData) {
  const quota = data.quotaSummary;
  if (!quota) {
    return "Tenant quota summary unavailable";
  }

  if (quota.usage.remainingPercent === null) {
    return `${quota.periodKey} · unlimited`;
  }

  return `${quota.periodKey} · ${quota.usage.remainingPercent}% remaining`;
}

function getLatestInvoice(invoices: TenantInvoiceRecord[]) {
  return (
    [...invoices].sort((left, right) =>
      right.periodEnd.localeCompare(left.periodEnd),
    )[0] ?? null
  );
}

function buildRecentBookingRows(bookings: BookingRecord[]): RecentBookingRow[] {
  return getActiveBookings(bookings)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5)
    .map((booking) => ({
      bookingId: booking.bookingId,
      passenger: booking.passenger.name,
      route: `${booking.pickup.address} → ${booking.dropoff.address}`,
      window: `${formatDateTime(booking.reservationWindowStart)} to ${formatDateTime(booking.reservationWindowEnd)}`,
      status: booking.orderStatus,
      updatedAt: booking.updatedAt,
    }));
}

function getTenantLifecycleLabel(data: DashboardData) {
  if (getTenantSuspendedSignal(data)) {
    return "suspended";
  }
  if (
    data.readiness?.items.some(
      (item) => item.status === "not_provisioned" || item.status === "blocked",
    ) ||
    (data.governance?.onboardingChecklist.length ?? 0) > 0
  ) {
    return "onboarding";
  }
  if (data.errors.length > 0) {
    return "degraded";
  }
  return "active";
}

function getTenantLifecycleTone(data: DashboardData): CanvasTone {
  const lifecycle = getTenantLifecycleLabel(data);
  if (lifecycle === "suspended") {
    return "danger";
  }
  if (lifecycle === "onboarding" || lifecycle === "degraded") {
    return "warn";
  }
  return "success";
}

function getExternalAppBaseUrl(targetApp: CrossAppResourceLink["targetApp"]) {
  if (targetApp === "ops-console") {
    return process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
  }

  if (targetApp === "platform-admin") {
    return (
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002"
    );
  }

  return process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3000";
}

function toExternalHref(link: CrossAppResourceLink) {
  return `${getExternalAppBaseUrl(link.targetApp)}${link.route}`;
}

function isCrossAppResourceLink(value: unknown): value is CrossAppResourceLink {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CrossAppResourceLink>;
  return (
    (candidate.targetApp === "ops-console" ||
      candidate.targetApp === "platform-admin" ||
      candidate.targetApp === "tenant-console") &&
    typeof candidate.route === "string" &&
    typeof candidate.resourceType === "string" &&
    typeof candidate.resourceId === "string" &&
    (candidate.openMode === "new_tab" || candidate.openMode === "same_tab") &&
    typeof candidate.label === "string"
  );
}

function buildRuntimeCrossAppLinks(
  data: DashboardData,
): CrossAppResourceLink[] {
  const notificationLinks = data.notifications.flatMap((notification) => {
    const candidate = (
      notification as NotificationRecord & {
        resourceLink?: unknown;
      }
    ).resourceLink;

    return isCrossAppResourceLink(candidate) ? [candidate] : [];
  });

  const deduped = new Map<string, CrossAppResourceLink>();
  for (const link of notificationLinks) {
    deduped.set(
      `${link.targetApp}:${link.route}:${link.resourceType}:${link.resourceId}`,
      link,
    );
  }

  return [...deduped.values()];
}

function renderActionTile(action: AvailableAction) {
  const content = (
    <>
      <div style={cardStackStyle}>
        <p style={sectionTitleStyle}>{action.label}</p>
        <p style={sectionBodyStyle}>{action.description}</p>
      </div>
      <div style={actionMetaStyle}>
        <CanvasPill
          theme={th}
          tone={action.descriptor.enabled ? "accent" : "neutral"}
        >
          {getRiskLabel(action.descriptor.riskLevel)}
        </CanvasPill>
        <span style={statusCopyStyle}>
          {action.descriptor.enabled
            ? action.descriptor.action
            : (action.descriptor.disabledReasonCode ?? "disabled")}
        </span>
        {!EXISTING_APP_ROUTES.has(action.href) ? (
          <CanvasPill theme={th} tone="warn">
            spec route
          </CanvasPill>
        ) : null}
      </div>
    </>
  );

  if (!action.descriptor.enabled) {
    return (
      <div key={action.label} style={actionTileDisabledStyle}>
        {content}
      </div>
    );
  }

  return (
    <Link href={action.href} key={action.label} style={actionTileBaseStyle}>
      {content}
    </Link>
  );
}

function renderEmptyAction(
  action: AvailableAction | undefined,
  variant = "primary",
) {
  if (!action) {
    return null;
  }

  const style = variant === "primary" ? emptyActionStyle : secondaryActionStyle;

  if (!action.descriptor.enabled) {
    return (
      <span style={style}>
        {action.label} · {action.descriptor.disabledReasonCode ?? "disabled"}
      </span>
    );
  }

  return (
    <Link href={action.href} style={style}>
      {action.label}
    </Link>
  );
}

function renderEmptyReasonTile(
  reason: HomeEmptyReason,
  currentReason: HomeEmptyReason | null,
  availableActions: AvailableAction[],
) {
  const presentation = getEmptyPresentation(reason, availableActions);
  const isCurrent = currentReason === reason;

  return (
    <div
      key={reason}
      style={{
        ...moduleTileStyle,
        borderColor: isCurrent ? th.accent : th.border,
        background: isCurrent
          ? "rgba(63, 217, 191, 0.08)"
          : moduleTileStyle.background,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
        }}
      >
        <p style={sectionTitleStyle}>{EMPTY_REASON_LABEL[reason]}</p>
        <CanvasPill theme={th} tone={isCurrent ? "accent" : presentation.tone}>
          {isCurrent ? "目前狀態" : reason}
        </CanvasPill>
      </div>
      <p style={sectionBodyStyle}>{presentation.body}</p>
      {renderEmptyAction(presentation.nextAction, "secondary")}
    </div>
  );
}

function renderNavChip(label: ReactNode, href: string) {
  if (EXISTING_APP_ROUTES.has(href)) {
    return (
      <Link href={href} key={href} style={navChipStyle}>
        {label}
      </Link>
    );
  }

  return (
    <span key={href} style={navChipStyle}>
      {label}
    </span>
  );
}

export default async function HomePage() {
  const data = await loadDashboardData();
  const refresh = buildRefreshMetadata(data);
  const availableActions = buildAvailableActions(data);
  const quickActions = buildQuickActions(availableActions);
  const visibleNavItems = getVisibleNavItems(data);
  const modules = buildModuleSummary(data);
  const emptyReason = getWorkspaceEmptyReason(data, modules);
  const emptyPresentation = emptyReason
    ? getEmptyPresentation(emptyReason, availableActions)
    : null;
  const isSuspended = getTenantSuspendedSignal(data);
  const activeBookings = getActiveBookings(data.bookings);
  const attentionBookings = activeBookings.filter((booking) =>
    ATTENTION_STATUSES.has(booking.orderStatus),
  );
  const bookingCreateAction = availableActions.find(
    (action) => action.descriptor.action === "booking.create",
  );
  const recentRows = buildRecentBookingRows(data.bookings);
  const latestInvoice = getLatestInvoice(data.invoices);
  const externalLinks = buildRuntimeCrossAppLinks(data);
  const readinessItems = data.readiness?.items ?? [];
  const tenantLifecycle = getTenantLifecycleLabel(data);

  const recentBookingColumns: CanvasTableColumn<RecentBookingRow>[] = [
    {
      h: "BOOKING",
      w: 120,
      mono: true,
      r: (row) => (
        <span style={{ color: th.accent, fontWeight: 600 }}>
          {row.bookingId}
        </span>
      ),
    },
    {
      h: "PASSENGER",
      w: 120,
      r: (row) => row.passenger,
    },
    {
      h: "ROUTE",
      r: (row) => row.route,
    },
    {
      h: "WINDOW",
      w: 200,
      mono: true,
      r: (row) => row.window,
    },
    {
      h: "STATE",
      w: 150,
      r: (row) => (
        <CanvasPill theme={th} tone={getBookingStatusTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={
          data.identity?.tenantId
            ? `${TENANT_CONSOLE_CONTEXT} 工作面`
            : "租戶工作面"
        }
        subtitle="首頁集中呈現 tenant identity、模組能力、整合健康度、最近叫車與 quick actions。"
        actions={
          <CanvasPill
            theme={th}
            tone={refresh.dataFreshness === "degraded" ? "warn" : "info"}
          >
            {getRefreshLabel(refresh)}
          </CanvasPill>
        }
      />

      <div style={pageBodyStyle}>
        <div style={heroGridStyle}>
          <div style={heroPanelStyle}>
            <p style={heroEyebrowStyle}>Workspace / Home</p>
            <div style={heroChipRowStyle}>
              <CanvasPill theme={th} tone={getTenantLifecycleTone(data)} dot>
                {tenantLifecycle}
              </CanvasPill>
              <CanvasPill theme={th} tone="info">
                tenant / {TENANT_CONSOLE_ENV}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                {data.identity?.tenantId ?? DEMO_TENANT_ID}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                {data.identity?.realm ?? "tenant"} /{" "}
                {data.identity?.actorType ?? "unknown"}
              </CanvasPill>
            </div>
            <div style={cardStackStyle}>
              <h2 style={heroTitleStyle}>先看今日待處理，再決定下一步。</h2>
              <p style={heroBodyStyle}>
                依 packet
                §5.1，這裡同時回答三件事：租戶現在是否健康、今天是否有急件、以及後端目前允許你做哪些動作。
              </p>
            </div>
          </div>

          <CanvasCard
            theme={th}
            title="租戶識別上下文"
            subtitle="name / code / status / environment"
          >
            <CanvasDL
              theme={th}
              cols={2}
              items={[
                { k: "Name", v: TENANT_CONSOLE_CONTEXT },
                {
                  k: "Code",
                  v: data.identity?.tenantId ?? DEMO_TENANT_ID,
                  mono: true,
                },
                { k: "Status", v: tenantLifecycle, mono: true },
                { k: "Environment", v: TENANT_CONSOLE_ENV, mono: true },
                {
                  k: "Realm",
                  v: data.identity?.realm ?? "unknown",
                  mono: true,
                },
                {
                  k: "Auth mode",
                  v: data.identity?.authMode ?? "unknown",
                  mono: true,
                },
              ]}
            />
          </CanvasCard>
        </div>

        {isSuspended ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title="租戶目前為 suspended 狀態"
            body="工作面仍保留可讀檢視，但部分操作會持續被 blocked，直到租戶 lifecycle suspension 被解除。"
          />
        ) : null}

        {refresh.dataFreshness === "degraded" ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="clock"
            title="目前顯示的是 degraded snapshot"
            body={`生成時間 ${formatDateTime(refresh.generatedAt)} · refresh tier ${REFRESH_TIER} · 至少一個資料切片載入失敗。`}
          />
        ) : null}

        {emptyPresentation ? (
          <CanvasBanner
            theme={th}
            tone={emptyPresentation.tone}
            icon={emptyPresentation.icon}
            title={`${EMPTY_REASON_LABEL[emptyReason as HomeEmptyReason]} · ${emptyPresentation.title}`}
            body={emptyPresentation.body}
          />
        ) : null}

        {availableActions.length > 0 ? (
          <CanvasCard
            theme={th}
            title="後端授權的可執行動作"
            subtitle="首頁只渲染 tenant read models 回傳的 authoritative availableActions。"
          >
            <div style={actionGridStyle}>
              {availableActions.map(renderActionTile)}
            </div>
          </CanvasCard>
        ) : (
          <CanvasCard
            theme={th}
            title="後端授權的可執行動作"
            subtitle="這次租戶快照沒有回傳可直接執行的 authoritative action descriptor。"
          >
            <div style={emptyPanelStyle}>
              <strong style={sectionTitleStyle}>availableActions</strong>
              <p style={sectionBodyStyle}>
                這次 read model 沒有提供首頁可用
                CTA，因此此區不會由前端自行補齊。
              </p>
            </div>
          </CanvasCard>
        )}

        <CanvasCard
          theme={th}
          title="快捷入口"
          subtitle="packet §5.1 的必備 quick CTAs 只從 backend-owned availableActions 取值與排序。"
        >
          {quickActions.length > 0 ? (
            <div style={actionGridStyle}>
              {quickActions.map(renderActionTile)}
            </div>
          ) : (
            <div style={emptyPanelStyle}>
              <strong style={sectionTitleStyle}>workspace quick CTAs</strong>
              <p style={sectionBodyStyle}>
                後端這次沒有回傳 `booking.create`、`booking.list_today` 或
                `integration.open_governance`，因此首頁不會前端合成快捷 CTA。
              </p>
            </div>
          )}
        </CanvasCard>

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="進行中"
            value={formatCount(activeBookings.length)}
            sub={
              attentionBookings.length > 0
                ? `${formatCount(attentionBookings.length)} 筆待跟進`
                : "目前沒有急件"
            }
          />
          <CanvasKPI
            theme={th}
            label="本月配額"
            value={formatQuotaValue(data)}
            sub={formatQuotaSubline(data)}
          />
          <CanvasKPI
            theme={th}
            label="當期帳單"
            value={
              latestInvoice?.amount ? formatMoney(latestInvoice.amount) : "—"
            }
            sub={latestInvoice ? latestInvoice.invoiceId : "目前沒有可見發票"}
          />
          <CanvasKPI
            theme={th}
            label="可見模組"
            value={formatCount(modules.length)}
            sub={`${formatCount(visibleNavItems.length)} 個導覽入口通過 feature gating`}
          />
        </div>

        <div style={topGridStyle}>
          <CanvasCard
            theme={th}
            title="近期叫車與最新更新"
            subtitle="首頁先回答今天是否有需要優先處理的 booking。"
          >
            {recentRows.length > 0 ? (
              <CanvasTable<RecentBookingRow>
                theme={th}
                rows={recentRows}
                columns={recentBookingColumns}
              />
            ) : (
              <div style={emptyPanelStyle}>
                <strong style={sectionTitleStyle}>尚無近期叫車</strong>
                <p style={sectionBodyStyle}>
                  目前租戶快照沒有任何進行中的 booking row。
                </p>
                {renderEmptyAction(bookingCreateAction)}
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="環境與可見模組"
            subtitle="模組與導覽都遵守 feature flag gating。"
          >
            <CanvasDL
              theme={th}
              cols={2}
              items={[
                {
                  k: "Tenant",
                  v: data.identity?.tenantId ?? DEMO_TENANT_ID,
                  mono: true,
                },
                {
                  k: "Environment",
                  v: TENANT_CONSOLE_ENV,
                  mono: true,
                },
                {
                  k: "Actor type",
                  v: data.identity?.actorType ?? "unknown",
                  mono: true,
                },
                {
                  k: "Realm",
                  v: data.identity?.realm ?? "unknown",
                  mono: true,
                },
                {
                  k: "Auth mode",
                  v: data.identity?.authMode ?? "unknown",
                  mono: true,
                },
                {
                  k: "Refresh",
                  v: `${REFRESH_TIER} · ${formatDateTime(refresh.generatedAt)}`,
                  mono: true,
                },
              ]}
            />

            <div style={cardStackStyle}>
              <p style={sectionTitleStyle}>可見模組導覽</p>
              <div style={navChipWrapStyle}>
                {visibleNavItems.map((item) =>
                  renderNavChip(item.label, item.href),
                )}
              </div>
            </div>
          </CanvasCard>
        </div>

        <div style={bottomGridStyle}>
          <div style={cardStackStyle}>
            <CanvasCard
              theme={th}
              title="模組啟用摘要"
              subtitle="依 spec 顯示首頁必備的 module enablement summary。"
            >
              {modules.length > 0 ? (
                <div style={moduleSummaryStyle}>
                  {modules.map((module) => (
                    <Link
                      href={module.href}
                      key={module.key}
                      style={moduleTileStyle}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <p style={sectionTitleStyle}>{module.title}</p>
                        <CanvasPill
                          theme={th}
                          tone={getStatusTone(module.status)}
                        >
                          {module.status}
                        </CanvasPill>
                      </div>
                      <p style={sectionBodyStyle}>{module.body}</p>
                      <span style={statusCopyStyle}>{module.meta}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div style={emptyPanelStyle}>
                  <strong style={sectionTitleStyle}>篩選後為空</strong>
                  <p style={sectionBodyStyle}>
                    feature 與 role gating 後，目前沒有任何可見模組。
                  </p>
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="整合健康度"
              subtitle="aggregated readiness 與治理 checklist 依 packet §5.1 呈現。"
            >
              <div style={cardStackStyle}>
                {readinessItems.length > 0 ? (
                  readinessItems.map((item) => (
                    <div key={item.subSystem} style={moduleTileStyle}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <p style={sectionTitleStyle}>
                          {getSubSystemLabel(item.subSystem)}
                        </p>
                        <CanvasPill
                          theme={th}
                          tone={getStatusTone(item.status)}
                        >
                          {item.status}
                        </CanvasPill>
                      </div>
                      <p style={sectionBodyStyle}>
                        {item.detail ?? "目前沒有回傳額外說明。"}
                      </p>
                      <div style={actionMetaStyle}>
                        <span style={statusCopyStyle}>
                          {item.nextAction?.action ?? "no nextAction"}
                        </span>
                        {item.nextAction ? (
                          <Link
                            href={getActionRoute(item.nextAction.action)}
                            style={secondaryActionStyle}
                          >
                            {getActionLabel(item.nextAction.action)}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyPanelStyle}>
                    <strong style={sectionTitleStyle}>
                      readiness unavailable
                    </strong>
                    <p style={sectionBodyStyle}>
                      aggregated readiness 目前不可用，因此只顯示治理層 fallback
                      訊息。
                    </p>
                  </div>
                )}

                <div style={emptyPanelStyle}>
                  <strong style={sectionTitleStyle}>開通 checklist</strong>
                  {(data.governance?.onboardingChecklist.length ?? 0) > 0 ? (
                    <div style={cardStackStyle}>
                      {data.governance?.onboardingChecklist
                        .slice(0, 5)
                        .map((item) => (
                          <span key={item} style={sectionBodyStyle}>
                            • {item}
                          </span>
                        ))}
                    </div>
                  ) : (
                    <p style={sectionBodyStyle}>目前沒有待處理的開通項目。</p>
                  )}
                </div>
              </div>
            </CanvasCard>
          </div>

          <div style={cardStackStyle}>
            <CanvasCard
              theme={th}
              title="Cross-app deep links"
              subtitle="只渲染 runtime contract 回傳的 tenant-scoped CrossAppResourceLink。"
            >
              <div style={cardStackStyle}>
                {externalLinks.length > 0 ? (
                  externalLinks.map((link) => (
                    <a
                      href={toExternalHref(link)}
                      key={`${link.targetApp}-${link.route}`}
                      rel="noreferrer"
                      style={externalLinkStyle}
                      target={
                        link.openMode === "new_tab" ? "_blank" : undefined
                      }
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <p style={sectionTitleStyle}>{link.label}</p>
                        <CanvasPill theme={th} tone="info">
                          {link.targetApp}
                        </CanvasPill>
                      </div>
                      <p style={sectionBodyStyle}>{link.route}</p>
                    </a>
                  ))
                ) : (
                  <div style={emptyPanelStyle}>
                    <strong style={sectionTitleStyle}>
                      CrossAppResourceLink unavailable
                    </strong>
                    <p style={sectionBodyStyle}>
                      目前首頁可見資料沒有回傳任何 runtime-scoped deep link，
                      因此前端不再自行拼接 ops 或 platform-admin URL。
                    </p>
                  </div>
                )}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="通知與 EmptyReason"
              subtitle="六種 EmptyReason 分支都用不同文案呈現，並標示目前命中的分支。"
            >
              <div style={cardStackStyle}>
                {data.notifications.length > 0 ? (
                  data.notifications.slice(0, 4).map((notification) => (
                    <div
                      key={notification.notificationId}
                      style={moduleTileStyle}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <p style={sectionTitleStyle}>{notification.title}</p>
                        <CanvasPill theme={th} tone="neutral">
                          {getChannelLabel(notification.channel)}
                        </CanvasPill>
                      </div>
                      <p style={sectionBodyStyle}>{notification.message}</p>
                      <span style={statusCopyStyle}>
                        {formatDateTime(notification.createdAt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={emptyPanelStyle}>
                    <strong style={sectionTitleStyle}>通知暫無資料</strong>
                    <p style={sectionBodyStyle}>
                      目前沒有可見通知；這不會自動被視為 external_unavailable。
                    </p>
                  </div>
                )}

                <div style={moduleSummaryStyle}>
                  {EMPTY_REASON_ORDER.map((reason) =>
                    renderEmptyReasonTile(
                      reason,
                      emptyReason,
                      availableActions,
                    ),
                  )}
                </div>
              </div>
            </CanvasCard>
          </div>
        </div>

        {data.errors.length > 0 ? (
          <CanvasCard
            theme={th}
            title="Partial data warnings"
            subtitle="機器可見的 fetch failure 會直接暴露在首頁。"
          >
            <div style={cardStackStyle}>
              {data.errors.map((error) => (
                <span key={error} style={sectionBodyStyle}>
                  • {error}
                </span>
              ))}
            </div>
          </CanvasCard>
        ) : null}
      </div>
    </div>
  );
}
