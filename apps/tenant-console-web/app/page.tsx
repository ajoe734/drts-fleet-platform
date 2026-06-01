import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  BookingRecord,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  FeatureFlagSummary,
  IdentityContext,
  NotificationRecord,
  RefreshTier,
  ResourceActionDescriptor,
  TenantBillingProfile,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
  TenantInvoiceRecord,
  TenantQuotaSummary,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import {
  TENANT_CONSOLE_CONTEXT,
  TENANT_CONSOLE_ENV,
  TENANT_CONSOLE_SEARCH_PLACEHOLDER,
} from "@/lib/navigation";

export const dynamic = "force-dynamic";

const HOME_REFRESH_TIER: RefreshTier = "slow";
const HOME_REFRESH_MS = 30_000;
const EXISTING_APP_ROUTES = new Set([
  "/",
  "/api-keys",
  "/audit",
  "/bookings",
  "/bookings/new",
  "/cost-centers",
  "/invoices",
  "/partner",
  "/passengers",
  "/rules",
  "/settings",
  "/users",
  "/webhooks",
]);

const th = buildCanvasTheme({
  surface: "tenant",
  dark: false,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const heroCardStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  background: `linear-gradient(135deg, ${th.surface} 0%, ${th.bgRaised} 58%, rgba(15, 118, 110, 0.14) 100%)`,
};

const heroCardInnerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const heroEyebrowStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const heroTitleStyle: CSSProperties = {
  color: th.text,
  fontSize: 28,
  lineHeight: 1.05,
  fontWeight: 700,
};

const heroBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 13,
  lineHeight: 1.65,
  maxWidth: 720,
};

const heroSummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const heroSummaryCardStyle: CSSProperties = {
  borderRadius: 16,
  padding: "14px 14px 12px",
  border: `1px solid ${th.border}`,
  background: "rgba(255,255,255,0.72)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const heroSummaryLabelStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 10.5,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const heroSummaryValueStyle: CSSProperties = {
  color: th.text,
  fontSize: 20,
  lineHeight: 1.1,
  fontWeight: 700,
};

const heroSummaryBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.5,
};

const splitGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)",
  gap: 16,
  alignItems: "start",
};

const laneStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minWidth: 0,
};

const focusStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const focusItemStyle: CSSProperties = {
  borderRadius: 16,
  border: `1px solid ${th.border}`,
  padding: "14px 14px 12px",
  background: th.surface,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const quickActionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const quickActionCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minHeight: 166,
};

const sectionStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const listItemStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  paddingBottom: 10,
  borderBottom: `1px solid ${th.border}`,
};

const listTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  lineHeight: 1.35,
};

const listBodyStyle: CSSProperties = {
  marginTop: 4,
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.5,
};

const listItemTailStyle: CSSProperties = {
  textAlign: "right",
  color: th.textMuted,
  fontSize: 11.5,
  flexShrink: 0,
};

const smallMetaStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 11,
  lineHeight: 1.45,
};

const mutedStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.5,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const stackedMetaStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const emptyGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
};

const emptyStateStyle: CSSProperties = {
  borderRadius: 16,
  border: `1px dashed ${th.border}`,
  padding: "16px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  background: th.surface,
};

const sitemapGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const sitemapSectionStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 16,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: th.bgRaised,
};

const sitemapLinkStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: "9px 10px",
  borderRadius: 12,
  background: th.surface,
  border: `1px solid ${th.border}`,
  color: th.text,
  textDecoration: "none",
};

const linkRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const moduleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const moduleCardStyle: CSSProperties = {
  borderRadius: 16,
  border: `1px solid ${th.border}`,
  padding: 14,
  background: th.surface,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const monoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
};

const dateFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "medium",
});
const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});
const numberFormatter = new Intl.NumberFormat("en");
const moneyFormatter = new Intl.NumberFormat("zh-Hant", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

type WorkspaceEmptyReason = Extract<
  EmptyReason,
  | "no_data"
  | "not_provisioned"
  | "fetch_failed"
  | "permission_denied"
  | "external_unavailable"
  | "filtered_empty"
>;

type RefreshBannerTone = "info" | "success" | "warn" | "danger" | "accent";

type WorkspaceBookingRecord = BookingRecord & {
  availableActions?: ResourceActionDescriptor[];
  editableUntil?: string | null;
  readOnlyReasonCode?: string | null;
};

type WorkspaceNotificationRecord = NotificationRecord & {
  resourceLink?: CrossAppResourceLink | null;
};

type WorkspaceActionTile = {
  key: string;
  title: string;
  href: string;
  description: string;
  label: string;
  descriptor: ResourceActionDescriptor;
  external?: boolean;
};

type WorkspaceActionSource = {
  descriptor: ResourceActionDescriptor;
  bookingId?: string;
  orderStatus?: BookingRecord["orderStatus"];
  subSystem?: TenantIntegrationReadinessItem["subSystem"];
};

type HomePageData = {
  identity: IdentityContext | null;
  featureFlags: FeatureFlagSummary | null;
  bookings: WorkspaceBookingRecord[];
  invoices: TenantInvoiceRecord[];
  notifications: WorkspaceNotificationRecord[];
  readiness: TenantIntegrationReadinessSummary | null;
  billingProfile: TenantBillingProfile | null;
  quotaSummary: TenantQuotaSummary | null;
  errors: string[];
};

type SitemapRoute = {
  key: string;
  title: string;
  href: string;
  description: string;
  enabled: boolean;
  tone: CanvasTone;
};

type SitemapSection = {
  title: string;
  description: string;
  routes: SitemapRoute[];
};

type ModuleSummary = {
  key: string;
  title: string;
  countLabel: string;
  body: string;
  tone: CanvasTone;
};

const EMPTY_REASON_META: Record<
  WorkspaceEmptyReason,
  { tone: CanvasTone; title: string; body: string }
> = {
  no_data: {
    tone: "neutral",
    title: "尚無資料",
    body: "新租戶還沒有任何資料，首要 CTA 應導向 onboarding 或第一個建立動作。",
  },
  not_provisioned: {
    tone: "warn",
    title: "尚未開通",
    body: "模組未 provision，畫面要留下明確補設定入口，而不是假裝資料為空。",
  },
  fetch_failed: {
    tone: "danger",
    title: "讀取失敗",
    body: "依 spec 必須誠實標示為 fetch failure，並保留 refresh / trace affordance。",
  },
  permission_denied: {
    tone: "accent",
    title: "權限不足",
    body: "允許看見模組存在，但以 disabled affordance 告知此 actor 不能操作。",
  },
  external_unavailable: {
    tone: "warn",
    title: "外部系統不可用",
    body: "需要保留 deep link 到外部擁有者 app，幫助租戶追蹤處理進度。",
  },
  filtered_empty: {
    tone: "info",
    title: "篩選後無結果",
    body: "資料集存在，但在今天或目前條件下沒有需要處理的項目。",
  },
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateFormatter.format(parsed);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatMoney(minor: number | null | undefined, currency = "TWD") {
  if (minor === null || minor === undefined) return "—";
  if (currency === "TWD") return moneyFormatter.format(minor / 100);
  return `${currency} ${numberFormatter.format(minor / 100)}`;
}

function formatQuotaUsage(summary: TenantQuotaSummary | null) {
  if (!summary) return "—";
  if (summary.limit.bookingCountLimit !== null) {
    return `${formatCount(summary.usage.confirmedBookingCount)} / ${formatCount(summary.limit.bookingCountLimit)} 趟`;
  }
  if (summary.limit.amountMinorLimit !== null) {
    return `${formatMoney(summary.usage.confirmedAmountMinor, summary.limit.currency)} / ${formatMoney(summary.limit.amountMinorLimit, summary.limit.currency)}`;
  }
  return `${formatCount(summary.usage.confirmedBookingCount)} confirmed`;
}

function isOpenBooking(booking: BookingRecord) {
  return (
    booking.orderStatus !== "completed" && booking.orderStatus !== "cancelled"
  );
}

function getReadinessTone(
  status: TenantIntegrationReadinessItem["status"],
): CanvasTone {
  if (status === "ready") return "success";
  if (status === "partial") return "warn";
  if (status === "blocked") return "danger";
  return "neutral";
}

function getReadinessLabel(status: TenantIntegrationReadinessItem["status"]) {
  if (status === "ready") return "ready";
  if (status === "partial") return "partial";
  if (status === "blocked") return "blocked";
  return "not_provisioned";
}

function buildRefreshMetadata(
  hasErrors: boolean,
  computedAt?: string | null,
): UiRefreshMetadata {
  return {
    generatedAt: computedAt ?? new Date().toISOString(),
    staleAfterMs: HOME_REFRESH_MS,
    dataFreshness: hasErrors ? "degraded" : "fresh",
    source: "live",
  };
}

function getRefreshPresentation(
  refresh: UiRefreshMetadata,
  blockedCount: number,
) {
  if (refresh.dataFreshness === "degraded") {
    return {
      tone: "warn" as RefreshBannerTone,
      title: `refresh tier T5 · ${HOME_REFRESH_TIER}`,
      body: "Workspace home 有部分切片退化；仍顯示最後可用快照並保留追蹤入口。",
    };
  }

  if (blockedCount > 0) {
    return {
      tone: "info" as RefreshBannerTone,
      title: `refresh tier T5 · ${HOME_REFRESH_TIER}`,
      body: "整體快照仍可讀，但有模組 blocked，需等待下一次輪詢或轉往 cross-app 處理。",
    };
  }

  return {
    tone: "success" as RefreshBannerTone,
    title: `refresh tier T5 · ${HOME_REFRESH_TIER}`,
    body: "Workspace home 使用 tenant slow tier，約每 30 秒輪詢一次，不假設狀態即時完成。",
  };
}

function getActionTone(descriptor: ResourceActionDescriptor): CanvasTone {
  if (!descriptor.enabled) return "neutral";
  if (descriptor.riskLevel === "high") return "danger";
  if (descriptor.riskLevel === "medium") return "accent";
  return "success";
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const base =
    link.targetApp === "ops-console"
      ? (process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003")
      : link.targetApp === "platform-admin"
        ? (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
          "http://localhost:3004")
        : (process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ??
          "http://localhost:3002");
  return `${base}${link.route}`;
}

function hasExistingAppRoute(href: string) {
  if (/^https?:\/\//.test(href)) return true;
  if (EXISTING_APP_ROUTES.has(href)) return true;
  if (/^\/bookings\/[^/]+$/.test(href)) return true;
  return false;
}

function buildWorkspaceAvailableActions(
  data: HomePageData,
  bookings: WorkspaceBookingRecord[],
) {
  const actionMap = new Map<string, WorkspaceActionSource>();

  for (const booking of bookings) {
    for (const descriptor of booking.availableActions ?? []) {
      const existing = actionMap.get(descriptor.action);
      if (!existing || (!existing.descriptor.enabled && descriptor.enabled)) {
        actionMap.set(descriptor.action, {
          descriptor,
          bookingId: booking.bookingId,
          orderStatus: booking.orderStatus,
        });
      }
    }
  }

  for (const item of data.readiness?.items ?? []) {
    if (!item.nextAction) continue;

    const existing = actionMap.get(item.nextAction.action);
    if (
      !existing ||
      (!existing.descriptor.enabled && item.nextAction.enabled)
    ) {
      actionMap.set(item.nextAction.action, {
        descriptor: item.nextAction,
        subSystem: item.subSystem,
      });
    }
  }

  return Array.from(actionMap.values());
}

function titleCaseAction(action: string) {
  return action
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getActionRouteHint(action: string) {
  if (
    action.includes("booking") ||
    action === "create" ||
    action === "update" ||
    action === "cancel"
  ) {
    return "bookings";
  }
  if (action.includes("integration")) return "integration-governance";
  if (action.includes("webhook")) return "webhooks";
  if (action.includes("api_key") || action.includes("api-key"))
    return "api-keys";
  if (action.includes("notification")) return "notifications";
  if (action.includes("sla")) return "sla";
  if (action.includes("report")) return "reports";
  if (action.includes("invoice")) return "invoices";
  if (action.includes("billing") || action.includes("quota")) return "billing";
  if (action.includes("user") || action.includes("access")) return "users";
  if (action.includes("rule") || action.includes("approval")) return "rules";
  if (action.includes("audit")) return "audit";
  if (action.includes("address")) return "addresses";
  if (action.includes("passenger")) return "passengers";
  if (action.includes("cost_center") || action.includes("cost-center"))
    return "cost-centers";
  if (action.includes("feature_flag") || action.includes("feature-flag"))
    return "feature-flags";
  if (action.includes("setting")) return "settings";
  if (action.includes("ops")) return "cross-app";
  return null;
}

function describeActionSource(action: WorkspaceActionSource) {
  if (action.bookingId && action.orderStatus) {
    return `訂單 ${action.bookingId} · ${action.orderStatus}`;
  }
  if (action.subSystem) {
    return `整合子系統 ${action.subSystem}`;
  }
  return "workspace runtime";
}

function buildActionTile(
  action: WorkspaceActionSource,
  crossAppLinks: CrossAppResourceLink[],
): WorkspaceActionTile | null {
  const { descriptor } = action;

  if (descriptor.action === "create_booking") {
    return {
      key: descriptor.action,
      title: "建立叫車",
      href: "/bookings/new",
      label: "New booking",
      description:
        "同步 command 入口；若外部確認尚未完成，後續頁面會呈現 accepted+pending。",
      descriptor,
    };
  }

  if (descriptor.action === "view_todays_bookings") {
    return {
      key: descriptor.action,
      title: "查看今日訂單",
      href: "/bookings",
      label: "Today's bookings",
      description:
        "查看 T5 cadence 的 booking 狀態，不從角色或狀態字串推導可操作性。",
      descriptor,
    };
  }

  if (descriptor.action === "open_integration_governance") {
    return {
      key: descriptor.action,
      title: "整合就緒度",
      href: "/integration-governance",
      label: "Open integration governance",
      description:
        "聚合 API key、webhook、notifications、SLA、reports readiness 的單一入口。",
      descriptor,
    };
  }

  if (descriptor.action === "open_ops_case") {
    const link = crossAppLinks[0];
    if (!link) return null;

    return {
      key: descriptor.action,
      title: "跨應用追蹤",
      href: buildCrossAppHref(link),
      label: link.label,
      description:
        "外部依賴 blocked 或跨 actor 事件時，直接新分頁跳往 owning app 追蹤。",
      descriptor,
      external: link.openMode === "new_tab",
    };
  }

  const routeHint = getActionRouteHint(descriptor.action);
  if (routeHint === "cross-app") {
    const link = crossAppLinks[0];
    if (!link) return null;

    return {
      key: `${descriptor.action}:${link.resourceId}`,
      title: titleCaseAction(descriptor.action),
      href: buildCrossAppHref(link),
      label: link.label,
      description: `${describeActionSource(action)} · cross-app follow-up`,
      descriptor,
      external: link.openMode === "new_tab",
    };
  }

  if (routeHint === "bookings" && action.bookingId) {
    return {
      key: `${descriptor.action}:${action.bookingId}`,
      title: titleCaseAction(descriptor.action),
      href: `/bookings/${action.bookingId}`,
      label: action.bookingId,
      description: `${describeActionSource(action)} · booking-driven CTA`,
      descriptor,
    };
  }

  if (routeHint) {
    return {
      key: descriptor.action,
      title: titleCaseAction(descriptor.action),
      href: `/${routeHint}`,
      label: titleCaseAction(descriptor.action),
      description: `${describeActionSource(action)} · surfaced from availableActions`,
      descriptor,
    };
  }

  if (action.bookingId) {
    return {
      key: `${descriptor.action}:${action.bookingId}`,
      title: titleCaseAction(descriptor.action),
      href: `/bookings/${action.bookingId}`,
      label: action.bookingId,
      description: `${describeActionSource(action)} · inspect booking context`,
      descriptor,
    };
  }

  return null;
}

function buildQuickActions(
  availableActions: WorkspaceActionSource[],
  crossAppLinks: CrossAppResourceLink[],
): WorkspaceActionTile[] {
  const priority = new Map<string, number>([
    ["create_booking", 0],
    ["view_todays_bookings", 1],
    ["open_integration_governance", 2],
    ["open_ops_case", 3],
  ]);

  return availableActions
    .map((action) => buildActionTile(action, crossAppLinks))
    .filter((tile): tile is WorkspaceActionTile => Boolean(tile))
    .sort((left, right) => {
      const leftGroup = left.key.split(":")[0] ?? left.key;
      const rightGroup = right.key.split(":")[0] ?? right.key;
      const leftPriority = priority.get(leftGroup) ?? 50;
      const rightPriority = priority.get(rightGroup) ?? 50;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.title.localeCompare(right.title, "zh-Hant");
    });
}

function buildSitemapSections(
  data: HomePageData,
  blockedReadiness: number,
): SitemapSection[] {
  const enabledFlags = new Set(
    data.featureFlags?.flags
      .filter((flag) => flag.enabled)
      .map((flag) => flag.key) ?? [],
  );
  const readinessMap = new Map<
    TenantIntegrationReadinessItem["subSystem"],
    TenantIntegrationReadinessItem
  >(data.readiness?.items.map((item) => [item.subSystem, item]) ?? []);
  const hasAnyFlags = (data.featureFlags?.flags.length ?? 0) > 0;

  return [
    {
      title: "工作面",
      description: "session start landing",
      routes: [
        {
          key: "home",
          title: "Workspace home",
          href: "/",
          description:
            "identity context, current capabilities, integration health",
          enabled: true,
          tone: "success",
        },
      ],
    },
    {
      title: "訂單",
      description: "booking flow",
      routes: [
        {
          key: "bookings",
          title: "訂單",
          href: "/bookings",
          description: "booking list + editableUntil-aware detail drill-in",
          enabled: true,
          tone: "info",
        },
        {
          key: "newbooking",
          title: "建立訂單",
          href: "/bookings/new",
          description: "synchronous command create path",
          enabled: true,
          tone: "accent",
        },
      ],
    },
    {
      title: "資料維護",
      description: "directory + policy",
      routes: [
        {
          key: "passengers",
          title: "乘客",
          href: "/passengers",
          description: "soft deactivate per Q-TEN06",
          enabled: true,
          tone: "info",
        },
        {
          key: "addresses",
          title: "地址",
          href: "/addresses",
          description: "address book",
          enabled: true,
          tone: "info",
        },
        {
          key: "cost-centers",
          title: "成本中心",
          href: "/cost-centers",
          description: "monthly governance + quota framing",
          enabled: true,
          tone: "neutral",
        },
        {
          key: "rules",
          title: "審批規則",
          href: "/rules",
          description: "approval / quota rule surface",
          enabled: true,
          tone: "neutral",
        },
      ],
    },
    {
      title: "整合",
      description: "readiness-aware",
      routes: [
        {
          key: "api-keys",
          title: "API 金鑰",
          href: "/api-keys",
          description: "plaintext-once issuance + lifecycle",
          enabled: readinessMap.get("api_keys")?.status !== "blocked",
          tone: getReadinessTone(
            readinessMap.get("api_keys")?.status ?? "not_provisioned",
          ),
        },
        {
          key: "webhooks",
          title: "Webhooks",
          href: "/webhooks",
          description: "delivery logs + disabled reason visibility",
          enabled: true,
          tone: getReadinessTone(
            readinessMap.get("webhooks")?.status ?? "not_provisioned",
          ),
        },
        {
          key: "notifications",
          title: "通知偏好",
          href: "/notifications",
          description: "per-user notification routing",
          enabled: true,
          tone: getReadinessTone(
            readinessMap.get("notifications")?.status ?? "ready",
          ),
        },
        {
          key: "integration-governance",
          title: "整合就緒度",
          href: "/integration-governance",
          description: "aggregated readiness endpoint",
          enabled: true,
          tone: blockedReadiness > 0 ? "warn" : "success",
        },
        {
          key: "sla",
          title: "SLA",
          href: "/sla",
          description: "threshold profile in minutes",
          enabled: true,
          tone: getReadinessTone(readinessMap.get("sla")?.status ?? "ready"),
        },
      ],
    },
    {
      title: "帳務與治理",
      description: "billing, reports, audit",
      routes: [
        {
          key: "billing",
          title: "帳務概覽",
          href: "/billing",
          description: "billing overview",
          enabled: true,
          tone: "neutral",
        },
        {
          key: "invoices",
          title: "發票",
          href: "/invoices",
          description: "generated invoices + artifacts",
          enabled: true,
          tone: "info",
        },
        {
          key: "reports",
          title: "報表",
          href: "/reports",
          description: "manual refresh exports",
          enabled: !hasAnyFlags || enabledFlags.has("tenant_reports"),
          tone: getReadinessTone(
            readinessMap.get("reports")?.status ?? "ready",
          ),
        },
        {
          key: "audit",
          title: "稽核",
          href: "/audit",
          description: "cross-actor audit visibility",
          enabled: true,
          tone: "accent",
        },
        {
          key: "feature-flags",
          title: "功能旗標",
          href: "/feature-flags",
          description: "read-only visibility diagnostics",
          enabled: hasAnyFlags,
          tone: "neutral",
        },
      ],
    },
    {
      title: "帳號與設定",
      description: "tenant-scoped access",
      routes: [
        {
          key: "users",
          title: "使用者",
          href: "/users",
          description: "tenant users + role assignments",
          enabled: data.identity?.roles.includes("tc_admin") ?? false,
          tone:
            (data.identity?.roles.includes("tc_admin") ?? false)
              ? "success"
              : "warn",
        },
        {
          key: "settings",
          title: "設定",
          href: "/settings",
          description: "tenant profile + integration defaults",
          enabled: true,
          tone: "neutral",
        },
      ],
    },
  ];
}

function buildEmptyReasonShowcase(
  data: HomePageData,
  activeBookings: WorkspaceBookingRecord[],
  actionMap: Map<string, ResourceActionDescriptor>,
  sitemapSections: SitemapSection[],
) {
  const readinessItems = data.readiness?.items ?? [];
  const visibleModuleCount = sitemapSections.reduce(
    (sum, section) =>
      sum +
      section.routes.filter((route) => route.enabled && route.href !== "/")
        .length,
    0,
  );
  const currentReason: WorkspaceEmptyReason =
    data.errors.length > 0
      ? "fetch_failed"
      : visibleModuleCount === 0
        ? "permission_denied"
        : readinessItems.some((item) => item.status === "blocked")
          ? "external_unavailable"
          : readinessItems.some((item) => item.status === "not_provisioned")
            ? "not_provisioned"
            : activeBookings.length === 0
              ? data.bookings.length === 0
                ? visibleModuleCount > 0
                  ? "no_data"
                  : "filtered_empty"
                : "filtered_empty"
              : "filtered_empty";

  const nextActions = new Map<WorkspaceEmptyReason, ResourceActionDescriptor>();
  const createBookingAction = actionMap.get("create_booking");
  const notProvisionedAction = readinessItems.find(
    (item) => item.status === "not_provisioned",
  )?.nextAction;
  const openOpsCaseAction = actionMap.get("open_ops_case");
  const viewBookingsAction = actionMap.get("view_todays_bookings");

  if (createBookingAction) nextActions.set("no_data", createBookingAction);
  if (notProvisionedAction) {
    nextActions.set("not_provisioned", notProvisionedAction);
  }
  nextActions.set("fetch_failed", {
    action: "refresh",
    enabled: true,
    riskLevel: "low",
  });
  nextActions.set("permission_denied", {
    action: "request_access",
    enabled: false,
    riskLevel: "low",
    disabledReasonCode: "insufficient_scope",
  });
  if (openOpsCaseAction) {
    nextActions.set("external_unavailable", openOpsCaseAction);
  }
  if (viewBookingsAction) {
    nextActions.set("filtered_empty", viewBookingsAction);
  }

  return (Object.keys(EMPTY_REASON_META) as WorkspaceEmptyReason[]).map(
    (reason) => ({
      reason,
      envelope: {
        reason,
        messageCode: `workspace.home.${reason}`,
        ...(nextActions.get(reason)
          ? { nextAction: nextActions.get(reason)! }
          : {}),
      } satisfies EmptyStateEnvelope,
      active: currentReason === reason,
    }),
  );
}

function buildCrossAppLinks(
  notifications: WorkspaceNotificationRecord[],
): CrossAppResourceLink[] {
  const links = new Map<string, CrossAppResourceLink>();

  for (const notification of notifications) {
    const link = notification.resourceLink;
    if (!link) continue;

    const key = [
      link.targetApp,
      link.route,
      link.resourceType,
      link.resourceId,
      link.openMode,
    ].join(":");
    if (!links.has(key)) links.set(key, link);
  }

  return Array.from(links.values());
}

function buildModuleSummaries(
  data: HomePageData,
  sitemapSections: SitemapSection[],
  blockedReadiness: number,
): ModuleSummary[] {
  const readinessItems = data.readiness?.items ?? [];
  const visibleRouteCount = sitemapSections.reduce(
    (sum, section) =>
      sum + section.routes.filter((route) => route.enabled).length,
    0,
  );
  const hiddenRouteCount = sitemapSections.reduce(
    (sum, section) =>
      sum + section.routes.filter((route) => !route.enabled).length,
    0,
  );
  const readyCount = readinessItems.filter(
    (item) => item.status === "ready",
  ).length;
  const partialCount = readinessItems.filter(
    (item) => item.status === "partial",
  ).length;
  const notProvisionedCount = readinessItems.filter(
    (item) => item.status === "not_provisioned",
  ).length;

  return [
    {
      key: "modules",
      title: "Visible modules",
      countLabel: `${formatCount(visibleRouteCount)} routes`,
      body:
        hiddenRouteCount > 0
          ? `${formatCount(hiddenRouteCount)} routes gated by feature visibility or authority.`
          : "All Workspace exits are currently visible for this actor.",
      tone: hiddenRouteCount > 0 ? "warn" : "success",
    },
    {
      key: "integration",
      title: "Integration health",
      countLabel: `${formatCount(readyCount)} ready / ${formatCount(readinessItems.length)}`,
      body:
        blockedReadiness > 0
          ? `${formatCount(blockedReadiness)} subsystems blocked and require cross-app follow-up.`
          : partialCount > 0
            ? `${formatCount(partialCount)} subsystems are partial but readable.`
            : "All reported subsystems are ready on the current T5 snapshot.",
      tone:
        blockedReadiness > 0 ? "danger" : partialCount > 0 ? "warn" : "success",
    },
    {
      key: "provisioning",
      title: "Provisioning prompts",
      countLabel: `${formatCount(notProvisionedCount)} open`,
      body:
        notProvisionedCount > 0
          ? "Home must distinguish not_provisioned from empty data and preserve next actions."
          : "No module is currently waiting on first-time provisioning.",
      tone: notProvisionedCount > 0 ? "accent" : "neutral",
    },
  ];
}

function ActionLink({
  href,
  label,
  external = false,
  disabled = false,
  variant = "secondary",
}: {
  href: string;
  label: string;
  external?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const routeAvailable = external || hasExistingAppRoute(href);
  const styles =
    variant === "primary"
      ? {
          background: th.accent,
          color: "#fff",
          border: th.accent,
        }
      : variant === "ghost"
        ? {
            background: "transparent",
            color: th.textMuted,
            border: "transparent",
          }
        : {
            background: th.surface,
            color: th.text,
            border: th.border,
          };

  const commonStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    padding: "5px 10px",
    borderRadius: 999,
    border: `1px solid ${styles.border}`,
    background: styles.background,
    color: styles.color,
    fontSize: 12,
    fontWeight: 600,
    opacity: disabled ? 0.55 : 1,
    textDecoration: "none",
  };

  if (disabled || !routeAvailable) {
    return (
      <span aria-disabled="true" style={commonStyle}>
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      style={commonStyle}
    >
      {label}
    </Link>
  );
}

async function loadHomePageData(): Promise<HomePageData> {
  const client = getTenantClient();
  const [
    identityResult,
    flagsResult,
    bookingsResult,
    invoicesResult,
    notificationsResult,
    readinessResult,
    billingProfileResult,
    quotaSummaryResult,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getFeatureFlags({
      tenantId: DEMO_TENANT_ID,
    }) as Promise<FeatureFlagSummary>,
    client.listTenantBookings() as Promise<WorkspaceBookingRecord[]>,
    client.listInvoices() as Promise<TenantInvoiceRecord[]>,
    client.listTenantNotificationFeed() as Promise<
      WorkspaceNotificationRecord[]
    >,
    client.getTenantIntegrationReadinessSummary() as Promise<TenantIntegrationReadinessSummary>,
    client.getBillingProfile() as Promise<TenantBillingProfile>,
    client.getTenantQuotaSummary() as Promise<TenantQuotaSummary>,
  ]);

  const errors: string[] = [];
  const pushError = (label: string, reason: unknown) => {
    errors.push(
      `${label}: ${reason instanceof Error ? reason.message : "未知錯誤"}`,
    );
  };

  if (identityResult.status === "rejected")
    pushError("身分上下文", identityResult.reason);
  if (flagsResult.status === "rejected")
    pushError("功能旗標", flagsResult.reason);
  if (bookingsResult.status === "rejected")
    pushError("訂單清單", bookingsResult.reason);
  if (invoicesResult.status === "rejected")
    pushError("帳務資料", invoicesResult.reason);
  if (notificationsResult.status === "rejected")
    pushError("通知摘要", notificationsResult.reason);
  if (readinessResult.status === "rejected")
    pushError("整合就緒度", readinessResult.reason);
  if (billingProfileResult.status === "rejected")
    pushError("租戶計費設定", billingProfileResult.reason);
  if (quotaSummaryResult.status === "rejected")
    pushError("租戶配額", quotaSummaryResult.reason);

  return {
    identity:
      identityResult.status === "fulfilled" ? identityResult.value : null,
    featureFlags: flagsResult.status === "fulfilled" ? flagsResult.value : null,
    bookings: bookingsResult.status === "fulfilled" ? bookingsResult.value : [],
    invoices: invoicesResult.status === "fulfilled" ? invoicesResult.value : [],
    notifications:
      notificationsResult.status === "fulfilled"
        ? notificationsResult.value
        : [],
    readiness:
      readinessResult.status === "fulfilled" ? readinessResult.value : null,
    billingProfile:
      billingProfileResult.status === "fulfilled"
        ? billingProfileResult.value
        : null,
    quotaSummary:
      quotaSummaryResult.status === "fulfilled"
        ? quotaSummaryResult.value
        : null,
    errors,
  };
}

export default async function HomePage() {
  const data = await loadHomePageData();
  const activeBookings = data.bookings.filter(isOpenBooking);
  const attentionBookings = activeBookings.filter(
    (booking) =>
      booking.orderStatus === "dispatch_failed" ||
      booking.orderStatus === "dispatch_timeout" ||
      booking.orderStatus === "exception_hold" ||
      booking.orderStatus === "no_supply",
  );
  const completedBookings = data.bookings.filter(
    (booking) => booking.orderStatus === "completed",
  );
  const unreadNotifications = data.notifications.filter(
    (notification) => notification.status === "unread",
  );
  const openInvoices = data.invoices.filter(
    (invoice) => invoice.status !== "paid",
  );
  const blockedReadiness =
    data.readiness?.items.filter((item) => item.status === "blocked").length ??
    0;
  const refresh = buildRefreshMetadata(
    data.errors.length > 0,
    data.readiness?.computedAt ?? data.quotaSummary?.refreshedAt,
  );
  const refreshPresentation = getRefreshPresentation(refresh, blockedReadiness);
  const availableActions = buildWorkspaceAvailableActions(data, data.bookings);
  const crossAppLinks = buildCrossAppLinks(data.notifications);
  const actionMap = new Map(
    availableActions.map((action) => [
      action.descriptor.action,
      action.descriptor,
    ]),
  );
  const quickActions = buildQuickActions(availableActions, crossAppLinks);
  const tenantId = data.identity?.tenantId ?? DEMO_TENANT_ID;
  const tenantStatus =
    blockedReadiness > 0 ? "degraded" : data.readiness ? "active" : "unknown";
  const actorLabel =
    data.billingProfile?.contactName ??
    data.identity?.actorId ??
    TENANT_CONSOLE_CONTEXT.split(" ")[0];
  const subtitle = `${formatDate(refresh.generatedAt)} · 本月配額 ${formatQuotaUsage(data.quotaSummary)}`;
  const sitemapSections = buildSitemapSections(data, blockedReadiness);
  const emptyReasonCards = buildEmptyReasonShowcase(
    data,
    activeBookings,
    actionMap,
    sitemapSections,
  );
  const moduleSummaries = buildModuleSummaries(
    data,
    sitemapSections,
    blockedReadiness,
  );
  const unreadCrossAppCount = data.notifications.filter(
    (notification) =>
      notification.status === "unread" && Boolean(notification.resourceLink),
  ).length;
  const topNotification =
    unreadNotifications[0] ?? data.notifications[0] ?? null;
  const openInvoiceAmount = openInvoices.reduce(
    (sum, invoice) => sum + invoice.amount.amountMinor,
    0,
  );

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={`您好，${actorLabel}`}
        subtitle={subtitle}
        actions={
          <>
            {quickActions.slice(1, 2).map((action) => (
              <ActionLink
                key={action.key}
                href={action.href}
                label={action.label}
                disabled={!action.descriptor.enabled}
                variant="ghost"
              />
            ))}
            {quickActions.slice(0, 1).map((action) => (
              <ActionLink
                key={action.key}
                href={action.href}
                label={action.label}
                disabled={!action.descriptor.enabled}
                variant="primary"
              />
            ))}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone={refreshPresentation.tone}
          icon={
            refresh.dataFreshness === "fresh"
              ? "ok"
              : refresh.dataFreshness === "degraded"
                ? "warn"
                : "clock"
          }
          title={refreshPresentation.title}
          body={refreshPresentation.body}
        />

        <div style={chipRowStyle}>
          <CanvasPill theme={th} tone="accent">
            {data.identity?.realm ?? "tenant"}
          </CanvasPill>
          <CanvasPill theme={th} tone="info">
            {tenantId}
          </CanvasPill>
          <CanvasPill
            theme={th}
            tone={tenantStatus === "active" ? "success" : "warn"}
          >
            {tenantStatus}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            {TENANT_CONSOLE_ENV}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            {HOME_REFRESH_TIER}
          </CanvasPill>
        </div>

        <div style={heroGridStyle}>
          <CanvasCard
            theme={th}
            title="Workspace overview"
            subtitle="tenant identity context + module capability framing"
            style={heroCardStyle}
          >
            <div style={heroCardInnerStyle}>
              <div style={stackedMetaStyle}>
                <span style={heroEyebrowStyle}>
                  Workspace home · T5 snapshot
                </span>
                <strong style={heroTitleStyle}>
                  {data.billingProfile?.invoiceTitle ?? tenantId}
                </strong>
                <span style={heroBodyStyle}>
                  在 session start 先確認 tenant
                  身分、可見模組、整合健康度與今天可執行的 command。 首頁 CTA
                  僅來自 `availableActions`，不從角色字串硬編。
                </span>
              </div>

              <div style={chipRowStyle}>
                <CanvasPill theme={th} tone="accent">
                  actor {data.identity?.actorType ?? "tenant_admin"}
                </CanvasPill>
                <CanvasPill theme={th} tone="info">
                  tenant {tenantId}
                </CanvasPill>
                <CanvasPill
                  theme={th}
                  tone={blockedReadiness > 0 ? "warn" : "success"}
                >
                  {blockedReadiness > 0 ? "degraded" : "healthy"}
                </CanvasPill>
                <CanvasPill theme={th} tone="neutral">
                  env {TENANT_CONSOLE_ENV}
                </CanvasPill>
              </div>

              <div style={heroSummaryGridStyle}>
                {moduleSummaries.map((item) => (
                  <div key={item.key} style={heroSummaryCardStyle}>
                    <span style={heroSummaryLabelStyle}>{item.title}</span>
                    <strong style={heroSummaryValueStyle}>
                      {item.countLabel}
                    </strong>
                    <span style={heroSummaryBodyStyle}>{item.body}</span>
                    <CanvasPill theme={th} tone={item.tone}>
                      {item.key}
                    </CanvasPill>
                  </div>
                ))}
              </div>

              <div style={linkRowStyle}>
                {quickActions.length > 0 ? (
                  quickActions
                    .slice(0, 3)
                    .map((action, index) => (
                      <ActionLink
                        key={action.key}
                        href={action.href}
                        disabled={!action.descriptor.enabled}
                        label={action.label}
                        variant={index === 0 ? "primary" : "secondary"}
                        {...(action.external ? { external: true } : {})}
                      />
                    ))
                ) : (
                  <span style={smallMetaStyle}>
                    No home CTA returned in `availableActions`; page stays
                    readable but does not invent commands.
                  </span>
                )}
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Today focus"
            subtitle={TENANT_CONSOLE_SEARCH_PLACEHOLDER}
          >
            <div style={focusStackStyle}>
              <div style={focusItemStyle}>
                <span style={heroSummaryLabelStyle}>Urgent bookings</span>
                <strong style={heroSummaryValueStyle}>
                  {formatCount(attentionBookings.length)}
                </strong>
                <span style={heroSummaryBodyStyle}>
                  {attentionBookings.length > 0
                    ? "dispatch_failed / timeout / exception_hold items need triage."
                    : "No booking currently requires urgent follow-up."}
                </span>
              </div>
              <div style={focusItemStyle}>
                <span style={heroSummaryLabelStyle}>Unread notices</span>
                <strong style={heroSummaryValueStyle}>
                  {formatCount(unreadNotifications.length)}
                </strong>
                <span style={heroSummaryBodyStyle}>
                  {unreadCrossAppCount > 0
                    ? `${formatCount(unreadCrossAppCount)} unread items include cross-app trails.`
                    : "Inbox is local-only right now; no external trail on unread items."}
                </span>
              </div>
              {blockedReadiness > 0 ? (
                <CanvasBanner
                  theme={th}
                  tone="warn"
                  icon="warn"
                  title={`${formatCount(blockedReadiness)} 個整合子系統 blocked`}
                  body="Workspace 保留 deep link 到 owning app，讓租戶可直接追到 ops 或 platform 處理面。"
                />
              ) : null}
              {topNotification ? (
                <CanvasBanner
                  theme={th}
                  tone="info"
                  icon="info"
                  title={topNotification.title}
                  body={topNotification.message}
                />
              ) : null}
            </div>
          </CanvasCard>
        </div>

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="進行中"
            value={formatCount(activeBookings.length)}
            sub={
              attentionBookings.length > 0
                ? `${formatCount(attentionBookings.length)} need follow-up`
                : "queue stable"
            }
          />
          <CanvasKPI
            theme={th}
            label="今日已完成"
            value={formatCount(completedBookings.length)}
            sub={
              completedBookings[0]
                ? `latest ${formatDateTime(completedBookings[0].updatedAt)}`
                : "no completion yet"
            }
          />
          <CanvasKPI
            theme={th}
            label="本月用量"
            value={formatQuotaUsage(data.quotaSummary)}
            sub={
              data.quotaSummary?.usage.remainingPercent !== null &&
              data.quotaSummary
                ? `${data.quotaSummary.usage.remainingPercent}% remaining`
                : "quota open"
            }
          />
          <CanvasKPI
            theme={th}
            label="當期帳單"
            value={formatMoney(openInvoiceAmount)}
            sub={
              openInvoices.length > 0
                ? `${formatCount(openInvoices.length)} open invoice`
                : "no open artifact"
            }
          />
        </div>

        <div style={splitGridStyle}>
          <div style={laneStyle}>
            <CanvasCard
              theme={th}
              title="Quick actions"
              subtitle="availableActions-driven CTAs"
            >
              <div style={quickActionGridStyle}>
                {quickActions.length > 0 ? (
                  quickActions.map((action) => (
                    <CanvasCard
                      key={action.key}
                      theme={th}
                      title={action.title}
                      subtitle={action.description}
                      style={quickActionCardStyle}
                    >
                      <CanvasPill
                        theme={th}
                        tone={getActionTone(action.descriptor)}
                      >
                        {action.label}
                      </CanvasPill>
                      <span style={smallMetaStyle}>
                        action:{" "}
                        <span style={monoStyle}>
                          {action.descriptor.action}
                        </span>
                      </span>
                      {action.descriptor.disabledReasonCode ? (
                        <span style={smallMetaStyle}>
                          disabled: {action.descriptor.disabledReasonCode}
                        </span>
                      ) : null}
                      <div style={{ marginTop: "auto" }}>
                        <ActionLink
                          href={action.href}
                          disabled={!action.descriptor.enabled}
                          label={action.external ? "新分頁開啟" : "前往"}
                          variant={
                            action.descriptor.enabled ? "secondary" : "ghost"
                          }
                          {...(action.external ? { external: true } : {})}
                        />
                      </div>
                    </CanvasCard>
                  ))
                ) : (
                  <div style={emptyStateStyle}>
                    <strong style={{ color: th.text }}>
                      尚未收到首頁可執行動作
                    </strong>
                    <span style={mutedStyle}>
                      Home 不自行補猜 CTA；等待 backend 在 `availableActions` 或
                      `nextAction` 返回真正可操作入口。
                    </span>
                  </div>
                )}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Visible modules sitemap"
              subtitle="spec §5 workspace exits + feature-flag-aware visibility"
            >
              <div style={sitemapGridStyle}>
                {sitemapSections.map((section) => (
                  <div key={section.title} style={sitemapSectionStyle}>
                    <div>
                      <strong style={{ color: th.text }}>
                        {section.title}
                      </strong>
                      <div style={smallMetaStyle}>{section.description}</div>
                    </div>
                    {section.routes.map((route) => {
                      const routeAvailable = hasExistingAppRoute(route.href);
                      const canNavigate = route.enabled && routeAvailable;
                      const statusLabel = !route.enabled
                        ? "hidden"
                        : routeAvailable
                          ? "visible"
                          : "spec-only";

                      return canNavigate ? (
                        <Link
                          key={route.key}
                          href={route.href}
                          style={sitemapLinkStyle}
                        >
                          <div>
                            <div style={listTitleStyle}>{route.title}</div>
                            <div style={smallMetaStyle}>
                              {route.description}
                            </div>
                          </div>
                          <CanvasPill theme={th} tone={route.tone}>
                            {statusLabel}
                          </CanvasPill>
                        </Link>
                      ) : (
                        <div
                          key={route.key}
                          aria-disabled="true"
                          style={{ ...sitemapLinkStyle, opacity: 0.56 }}
                        >
                          <div>
                            <div style={listTitleStyle}>{route.title}</div>
                            <div style={smallMetaStyle}>
                              {route.description}
                            </div>
                          </div>
                          <CanvasPill theme={th} tone={route.tone}>
                            {statusLabel}
                          </CanvasPill>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </CanvasCard>
          </div>

          <CanvasCard
            theme={th}
            title="Integration health"
            subtitle="aggregated /api/tenant/integration-governance/readiness"
          >
            <div style={sectionStackStyle}>
              {(data.readiness?.items ?? []).map((item, index, items) => (
                <div
                  key={item.subSystem}
                  style={index === items.length - 1 ? undefined : listItemStyle}
                >
                  <div>
                    <div style={listTitleStyle}>{item.subSystem}</div>
                    <div style={listBodyStyle}>
                      {item.detail ?? "No detail returned."}
                    </div>
                    {item.nextAction ? (
                      <div style={smallMetaStyle}>
                        nextAction:{" "}
                        <span style={monoStyle}>{item.nextAction.action}</span>
                      </div>
                    ) : null}
                  </div>
                  <div style={listItemTailStyle}>
                    <CanvasPill theme={th} tone={getReadinessTone(item.status)}>
                      {getReadinessLabel(item.status)}
                    </CanvasPill>
                  </div>
                </div>
              ))}
              {!data.readiness ? (
                <div style={emptyStateStyle}>
                  <strong style={{ color: th.text }}>
                    Readiness summary unavailable
                  </strong>
                  <span style={mutedStyle}>
                    聚合 readiness 失敗時，不宣稱 integrations healthy。
                  </span>
                </div>
              ) : null}
              {(data.readiness?.items.length ?? 0) > 0 ? (
                <div style={moduleGridStyle}>
                  {(data.readiness?.items ?? []).map((item) => (
                    <div
                      key={`${item.subSystem}-summary`}
                      style={moduleCardStyle}
                    >
                      <div style={chipRowStyle}>
                        <CanvasPill
                          theme={th}
                          tone={getReadinessTone(item.status)}
                        >
                          {getReadinessLabel(item.status)}
                        </CanvasPill>
                        <CanvasPill theme={th} tone="neutral">
                          {item.subSystem}
                        </CanvasPill>
                      </div>
                      <strong style={listTitleStyle}>{item.subSystem}</strong>
                      <span style={mutedStyle}>
                        {item.detail ?? "No integration detail returned."}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </CanvasCard>
        </div>

        <div style={splitGridStyle}>
          <CanvasCard
            theme={th}
            title="EmptyReason coverage"
            subtitle="all six Q-X15 states rendered distinctly"
          >
            <div style={emptyGridStyle}>
              {emptyReasonCards.map((item) => {
                const meta = EMPTY_REASON_META[item.reason];
                return (
                  <div
                    key={item.reason}
                    style={{
                      ...emptyStateStyle,
                      background: item.active ? th.surface : th.bgRaised,
                    }}
                  >
                    <div style={chipRowStyle}>
                      <CanvasPill theme={th} tone={meta.tone}>
                        {item.reason}
                      </CanvasPill>
                      <CanvasPill
                        theme={th}
                        tone={item.active ? "accent" : "neutral"}
                      >
                        {item.active ? "active now" : "state treatment"}
                      </CanvasPill>
                    </div>
                    <strong style={{ color: th.text }}>{meta.title}</strong>
                    <span style={mutedStyle}>{meta.body}</span>
                    <span style={smallMetaStyle}>
                      messageCode:{" "}
                      <span style={monoStyle}>{item.envelope.messageCode}</span>
                    </span>
                    {item.envelope.nextAction ? (
                      <span style={smallMetaStyle}>
                        nextAction:{" "}
                        <span style={monoStyle}>
                          {item.envelope.nextAction.action}
                        </span>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Recent notices and cross-app trails"
            subtitle="notification inbox + Q-X03 deep links"
          >
            <div style={sectionStackStyle}>
              {data.notifications
                .slice(0, 3)
                .map((notification, index, items) => (
                  <div
                    key={notification.notificationId}
                    style={
                      index === items.length - 1 ? undefined : listItemStyle
                    }
                  >
                    <div>
                      <div style={listTitleStyle}>{notification.title}</div>
                      <div style={listBodyStyle}>{notification.message}</div>
                    </div>
                    <div style={listItemTailStyle}>
                      <div>{notification.channel}</div>
                      <div>{formatDateTime(notification.createdAt)}</div>
                    </div>
                  </div>
                ))}
              {data.notifications.length === 0 ? (
                <div style={emptyStateStyle}>
                  <strong style={{ color: th.text }}>通知收件匣目前為空</strong>
                  <span style={mutedStyle}>
                    沒有 unread 項目時仍保留跨應用追蹤捷徑。
                  </span>
                </div>
              ) : null}

              {crossAppLinks.length > 0 ? (
                <div style={linkRowStyle}>
                  {crossAppLinks.map((link) => (
                    <ActionLink
                      key={`${link.targetApp}:${link.resourceId}:${link.route}`}
                      href={buildCrossAppHref(link)}
                      external={link.openMode === "new_tab"}
                      label={link.label}
                      variant="ghost"
                    />
                  ))}
                  <ActionLink
                    href="/audit"
                    label="Tenant audit"
                    variant="secondary"
                  />
                </div>
              ) : (
                <div style={emptyStateStyle}>
                  <strong style={{ color: th.text }}>
                    目前沒有 runtime cross-app deep links
                  </strong>
                  <span style={mutedStyle}>
                    只有 backend 返回 `CrossAppResourceLink`
                    時才顯示新分頁追蹤入口。
                  </span>
                </div>
              )}
            </div>
          </CanvasCard>
        </div>

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分首頁切片退回 fallback"
            body={data.errors.join(" · ")}
          />
        ) : null}
      </div>
    </div>
  );
}
