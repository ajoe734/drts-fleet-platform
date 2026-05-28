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
  CanvasTable,
  type CanvasTableColumn,
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
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
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

const reminderStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
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

type BookingRow = {
  bookingId: string;
  passenger: string;
  route: string;
  window: string;
  state: string;
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

function buildWorkspaceAvailableActions(
  data: HomePageData,
  activeBookings: WorkspaceBookingRecord[],
) {
  const actionMap = new Map<string, ResourceActionDescriptor>();

  for (const booking of activeBookings) {
    for (const descriptor of booking.availableActions ?? []) {
      if (!actionMap.has(descriptor.action))
        actionMap.set(descriptor.action, descriptor);
    }
  }

  for (const item of data.readiness?.items ?? []) {
    if (item.nextAction && !actionMap.has(item.nextAction.action)) {
      actionMap.set(item.nextAction.action, item.nextAction);
    }
  }

  return [
    "create_booking",
    "view_todays_bookings",
    "open_integration_governance",
    "open_ops_case",
  ]
    .map((action) => actionMap.get(action))
    .filter((descriptor): descriptor is ResourceActionDescriptor =>
      Boolean(descriptor),
    );
}

function buildQuickActions(
  availableActions: ResourceActionDescriptor[],
  crossAppLinks: CrossAppResourceLink[],
): WorkspaceActionTile[] {
  return availableActions.flatMap((descriptor) => {
    if (descriptor.action === "create_booking") {
      return [
        {
          key: descriptor.action,
          title: "建立叫車",
          href: "/bookings/new",
          label: "New booking",
          description:
            "同步 command 入口；若外部確認尚未完成，後續頁面會呈現 accepted+pending。",
          descriptor,
        },
      ];
    }

    if (descriptor.action === "view_todays_bookings") {
      return [
        {
          key: descriptor.action,
          title: "查看今日訂單",
          href: "/bookings",
          label: "Today's bookings",
          description:
            "查看 T5 cadence 的 booking 狀態，不從角色或狀態字串推導可操作性。",
          descriptor,
        },
      ];
    }

    if (descriptor.action === "open_integration_governance") {
      return [
        {
          key: descriptor.action,
          title: "整合就緒度",
          href: "/integration-governance",
          label: "Open integration governance",
          description:
            "聚合 API key、webhook、notifications、SLA、reports readiness 的單一入口。",
          descriptor,
        },
      ];
    }

    if (descriptor.action === "open_ops_case") {
      const link = crossAppLinks[0];
      if (!link) return [];

      return [
        {
          key: descriptor.action,
          title: "跨應用追蹤",
          href: buildCrossAppHref(link),
          label: link.label,
          description:
            "外部依賴 blocked 或跨 actor 事件時，直接新分頁跳往 owning app 追蹤。",
          descriptor,
          external: link.openMode === "new_tab",
        },
      ];
    }

    return [];
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
) {
  const activeReasons = new Set<WorkspaceEmptyReason>();
  const readinessItems = data.readiness?.items ?? [];

  if (activeBookings.length === 0) {
    activeReasons.add(
      data.bookings.length === 0 ? "no_data" : "filtered_empty",
    );
  }

  if (readinessItems.some((item) => item.status === "not_provisioned")) {
    activeReasons.add("not_provisioned");
  }

  if (data.errors.length > 0) {
    activeReasons.add("fetch_failed");
  }

  if (data.identity && !data.identity.roles.includes("tc_admin")) {
    activeReasons.add("permission_denied");
  }

  if (readinessItems.some((item) => item.status === "blocked")) {
    activeReasons.add("external_unavailable");
  }

  if (activeReasons.size === 0) {
    activeReasons.add("filtered_empty");
  }

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
      active: activeReasons.has(reason),
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

  if (disabled) {
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
  const availableActions = buildWorkspaceAvailableActions(data, activeBookings);
  const crossAppLinks = buildCrossAppLinks(data.notifications);
  const actionMap = new Map(
    availableActions.map((descriptor) => [descriptor.action, descriptor]),
  );
  const quickActions = buildQuickActions(availableActions, crossAppLinks);
  const emptyReasonCards = buildEmptyReasonShowcase(
    data,
    activeBookings,
    actionMap,
  );
  const tenantId = data.identity?.tenantId ?? DEMO_TENANT_ID;
  const tenantStatus =
    blockedReadiness > 0 ? "degraded" : data.readiness ? "active" : "unknown";
  const actorLabel =
    data.billingProfile?.contactName ??
    data.identity?.actorId ??
    TENANT_CONSOLE_CONTEXT.split(" ")[0];
  const subtitle = `${formatDate(refresh.generatedAt)} · 本月配額 ${formatQuotaUsage(data.quotaSummary)}`;
  const bookingRows: BookingRow[] = activeBookings
    .slice(0, 5)
    .map((booking) => ({
      bookingId: booking.bookingId,
      passenger: booking.passenger.name,
      route: `${booking.pickup.address} → ${booking.dropoff.address}`,
      window: `${formatDateTime(booking.reservationWindowStart)} - ${formatDateTime(booking.reservationWindowEnd)}`,
      state: booking.orderStatus,
    }));
  const bookingColumns: CanvasTableColumn<BookingRow>[] = [
    {
      h: "BK",
      k: "bookingId",
      mono: true,
      w: 132,
      r: (row) => (
        <Link
          href={`/bookings/${row.bookingId}`}
          style={{ color: th.accent, fontWeight: 700, textDecoration: "none" }}
        >
          {row.bookingId}
        </Link>
      ),
    },
    { h: "PASS", k: "passenger", w: 110 },
    {
      h: "PICKUP → DROP",
      k: "route",
      r: (row) => <span style={smallMetaStyle}>{row.route}</span>,
    },
    {
      h: "WIN",
      k: "window",
      mono: true,
      w: 190,
    },
    {
      h: "STATE",
      k: "state",
      w: 140,
      r: (row) => (
        <CanvasPill
          theme={th}
          tone={
            row.state === "assigned"
              ? "success"
              : row.state === "broadcasting"
                ? "info"
                : row.state === "approval_required"
                  ? "warn"
                  : row.state === "dispatch_failed" ||
                      row.state === "dispatch_timeout" ||
                      row.state === "exception_hold" ||
                      row.state === "no_supply"
                    ? "danger"
                    : "neutral"
          }
          dot
        >
          {row.state}
        </CanvasPill>
      ),
    },
  ];
  const sitemapSections = buildSitemapSections(data, blockedReadiness);
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

        <div style={heroGridStyle}>
          <CanvasCard
            theme={th}
            title="進行中訂單"
            subtitle="pending bookings count + recent updates"
            padding={0}
          >
            {bookingRows.length > 0 ? (
              <CanvasTable<BookingRow>
                theme={th}
                columns={bookingColumns}
                rows={bookingRows}
              />
            ) : (
              <div style={{ ...emptyStateStyle, margin: 16 }}>
                <strong style={{ color: th.text }}>
                  今天沒有進行中的 booking
                </strong>
                <span style={mutedStyle}>
                  輪詢刷新後會在這裡呈現
                  broadcasting、assigned、approval-required 等狀態。
                </span>
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="提醒"
            subtitle={TENANT_CONSOLE_SEARCH_PLACEHOLDER}
          >
            <div style={reminderStackStyle}>
              {blockedReadiness > 0 ? (
                <CanvasBanner
                  theme={th}
                  tone="warn"
                  icon="warn"
                  title={`${formatCount(blockedReadiness)} 個整合子系統 blocked`}
                  body="Workspace 保留 deep link 到 owning app，讓租戶可直接追到 ops 或 platform 處理面。"
                />
              ) : null}
              {unreadNotifications[0] ? (
                <CanvasBanner
                  theme={th}
                  tone="info"
                  icon="info"
                  title={unreadNotifications[0].title}
                  body={unreadNotifications[0].message}
                />
              ) : null}
              <CanvasBanner
                theme={th}
                tone={
                  data.quotaSummary?.usage.remainingPercent !== null &&
                  (data.quotaSummary?.usage.remainingPercent ?? 0) < 25
                    ? "warn"
                    : "success"
                }
                icon={
                  data.quotaSummary?.usage.remainingPercent !== null &&
                  (data.quotaSummary?.usage.remainingPercent ?? 0) < 25
                    ? "warn"
                    : "ok"
                }
                title={`本月配額 ${formatQuotaUsage(data.quotaSummary)}`}
                body={
                  data.billingProfile
                    ? `${data.billingProfile.invoiceTitle} · ${data.billingProfile.email}`
                    : "計費與配額資料尚未完整返回。"
                }
              />
            </div>
          </CanvasCard>
        </div>

        <div style={splitGridStyle}>
          <div style={laneStyle}>
            <CanvasCard
              theme={th}
              title="Quick actions"
              subtitle="availableActions-driven CTAs"
            >
              <div style={quickActionGridStyle}>
                {quickActions.map((action) => (
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
                      <span style={monoStyle}>{action.descriptor.action}</span>
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
                ))}
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
                    {section.routes.map((route) =>
                      route.enabled ? (
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
                            visible
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
                            hidden
                          </CanvasPill>
                        </div>
                      ),
                    )}
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
