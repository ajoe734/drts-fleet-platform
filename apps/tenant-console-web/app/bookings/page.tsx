import Link from "next/link";
import type {
  ApiSuccessEnvelope,
  BookingRecord,
  CrossAppResourceLink,
  EmptyReason,
  OwnedOrderStatus,
  ResourceActionDescriptor,
  TenantBookingListEnvelope,
  TenantBookingListItem,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  OWNED_ORDER_STATUSES,
} from "@drts/contracts";
import {
  applyBookingListQuery,
  type BookingListQuery,
  buildBookingListQueryString,
  parseBookingListQuery,
  toggleStatus,
} from "@/lib/booking-list";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";
import { BookingsRefreshControl } from "./bookings-refresh-control";

export const dynamic = "force-dynamic";

const CROSS_APP_BASE_URLS = {
  "ops-console":
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003",
  "platform-admin":
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002",
  "tenant-console": process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "",
} as const satisfies Record<CrossAppResourceLink["targetApp"], string>;
const TENANT_EMPTY_REASONS = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const satisfies EmptyReason[];
const EMPTY_REASON_SET = new Set<EmptyReason>(TENANT_EMPTY_REASONS);
const TERMINAL_ORDER_STATUSES = new Set<OwnedOrderStatus>([
  "completed",
  "cancelled",
]);
const RESERVATION_STATUSES: OwnedOrderStatus[] = [
  "created",
  "recording_pending",
  "ready_for_dispatch",
  "preassigned",
  "delayed_queue",
];
const LIVE_ORDER_STATUSES = new Set(
  OWNED_ORDER_STATUSES.filter((status) => !TERMINAL_ORDER_STATUSES.has(status)),
);
const ACTION_COPY: Record<string, string> = {
  update: "可更新",
  update_booking: "更新訂單",
  cancel: "可取消",
  cancel_booking: "取消訂單",
  create: "建立叫車",
  create_booking: "建立叫車",
  create_tenant_booking: "建立訂單",
  view_detail: "查看詳情",
  open_integration_governance: "查看整合就緒度",
  reset_filters: "清除篩選",
  filter: "篩選",
  refresh: "立即更新",
};
const TENANT_BOOKINGS_REFRESH_TIER_COPY = "T5 Tenant slow";

type SearchParamValue = string | string[] | undefined;

type TenantBookingListRecord = TenantBookingListItem;
type TenantEmptyReason = (typeof TENANT_EMPTY_REASONS)[number];
type BookingListEnvelope = TenantBookingListEnvelope;

type EmptyStateDescriptor = {
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  highlights: string[];
};

type ActionBindingContext = {
  bookingId?: string;
};

type ActionPresentation = {
  href: string | null;
  requiresDetailSurface: boolean;
};

type TabFilterPreset = {
  id: string;
  label: string;
  statuses?: OwnedOrderStatus[];
  approval?: BookingRecord["approvalState"] | "all";
};

type PageTabDescriptor = {
  label: string;
  value: number;
  href: string;
  isActive: boolean;
};

const PAGE_TAB_PRESETS: TabFilterPreset[] = [
  { id: "all", label: "全部" },
  {
    id: "live",
    label: "進行中",
    statuses: OWNED_ORDER_STATUSES.filter((status) =>
      LIVE_ORDER_STATUSES.has(status),
    ),
  },
  {
    id: "reserve",
    label: "預約",
    statuses: RESERVATION_STATUSES,
  },
  {
    id: "approval",
    label: "待審批",
    approval: "pending",
  },
  {
    id: "done",
    label: "已完成",
    statuses: ["completed"],
  },
  {
    id: "cancel",
    label: "取消",
    statuses: ["cancelled"],
  },
];

const EMPTY_STATE_COPY: Record<TenantEmptyReason, EmptyStateDescriptor> = {
  no_data: {
    eyebrow: "No Data",
    title: "還沒有任何 tenant booking",
    description:
      "這個租戶尚未建立任何預約。從這裡直接開始 booking intake，之後列表會依 reservation window 與 order state 持續刷新。",
    accent: "brand-new tenant",
    highlights: [
      "列表是空白起始，不是錯誤",
      "建立第一筆 booking 後會進入 T5 refresh cadence",
      "這個狀態應該仍可看到 create 類 action",
    ],
  },
  not_provisioned: {
    eyebrow: "Not Provisioned",
    title: "租戶尚未完成 booking capability 開通",
    description:
      "目前不是單純的空列表，而是 tenant booking surface 尚未 ready。先完成 integration governance / module enablement，再回到這個 route。",
    accent: "module enablement required",
    highlights: [
      "booking capability 還沒 provision",
      "需要回到 integration governance 排查",
      "不能把它誤判成沒有資料",
    ],
  },
  fetch_failed: {
    eyebrow: "Fetch Failed",
    title: "目前無法讀取 booking 列表",
    description:
      "系統沒有拿到可靠的 tenant booking snapshot。先檢查 API 連線與後端健康，再決定是否重新整理或改從 audit 追查。",
    accent: "snapshot unavailable",
    highlights: [
      "目前沒有可靠 snapshot",
      "先驗證 API 連線與 backend health",
      "必要時改從 audit route 追查",
    ],
  },
  permission_denied: {
    eyebrow: "Permission Denied",
    title: "目前身分無法查看這份 booking 列表",
    description:
      "這是權限不足，不是資料為空。必須改由有 tenant booking read 權限的 actor 進入，或回到使用者角色設定確認授權。",
    accent: "role scope mismatch",
    highlights: [
      "資料存在，但目前 actor 看不到",
      "需要 tenant booking read scope",
      "先確認 user / role assignment",
    ],
  },
  external_unavailable: {
    eyebrow: "External Unavailable",
    title: "外部依賴暫時無法提供 booking 狀態",
    description:
      "forwarded / partner 相關依賴目前不穩定。tenant list 不能假裝資料完整，請改從 integration governance 或 ops console 深入查明。",
    accent: "upstream dependency degraded",
    highlights: [
      "外部 dispatch / partner feed 不穩定",
      "tenant list 不能假裝資料完整",
      "需要 cross-app 深入排查",
    ],
  },
  filtered_empty: {
    eyebrow: "Filtered Empty",
    title: "目前的篩選條件沒有命中任何 booking",
    description:
      "清單本身存在資料，但狀態、service bucket、日期區間或搜尋詞把結果縮成 0 筆。可重設 filter 或切回全部狀態。",
    accent: "query returned zero rows",
    highlights: [
      "底層資料仍存在",
      "目前是 query / filter 結果為 0",
      "重設 filter 後應恢復列表",
    ],
  },
};

const EMPTY_STATE_ORBS: Record<TenantEmptyReason, string> = {
  no_data: "seed",
  not_provisioned: "setup",
  fetch_failed: "sync",
  permission_denied: "lock",
  external_unavailable: "bridge",
  filtered_empty: "filter",
};

const ORDER_STATUS_COPY: Record<OwnedOrderStatus, string> = {
  created: "已建立",
  recording_pending: "錄音待補",
  ready_for_dispatch: "待派遣",
  preassigned: "已預指派",
  assigned: "已指派",
  driver_accepted: "司機已接單",
  enroute_pickup: "前往上車點",
  arrived_pickup: "抵達上車點",
  on_trip: "行程中",
  proof_pending: "佐證待補",
  completed: "已完成",
  cancelled: "已取消",
  redispatch_required: "需重新派遣",
  dispatch_failed: "派遣失敗",
  dispatch_timeout: "派遣逾時",
  no_supply: "無可用車輛",
  delayed_queue: "延後佇列",
  exception_hold: "例外暫停",
};

const APPROVAL_STATE_COPY: Record<BookingRecord["approvalState"], string> = {
  not_required: "無需審批",
  pending: "待審批",
  approved: "已核准",
  rejected: "已拒絕",
  blocked: "已阻擋",
  cancelled_by_re_evaluation: "審批已取消",
};

const BOOKING_TYPE_COPY: Record<BookingRecord["bookingType"], string> = {
  oneway: "單程",
  roundtrip: "來回",
  recurring: "固定排程",
};

const REFRESH_FRESHNESS_COPY: Record<
  UiRefreshMetadata["dataFreshness"],
  string
> = {
  fresh: "資料新鮮",
  stale: "等待上游同步",
  degraded: "資料降級",
  unknown: "新鮮度未知",
};

const REFRESH_SOURCE_COPY: Record<UiRefreshMetadata["source"], string> = {
  live: "即時來源",
  cache: "快取快照",
  sandbox: "沙盒資料",
  static: "靜態資料",
};

function first(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function hasActiveFilters(searchParams: Record<string, SearchParamValue>) {
  return Boolean(
    first(searchParams.q) ||
    first(searchParams.status) ||
    first(searchParams.serviceBucket) ||
    first(searchParams.subtype) ||
    first(searchParams.service) ||
    first(searchParams.approval) ||
    first(searchParams.dateFrom) ||
    first(searchParams.dateTo) ||
    first(searchParams.dateField) ||
    first(searchParams.page),
  );
}

function normalizeBooking(
  booking: TenantBookingListRecord,
): TenantBookingListRecord {
  return {
    ...booking,
    editableUntil: booking.editableUntil ?? null,
    readOnlyReasonCode: booking.readOnlyReasonCode ?? null,
    availableActions: Array.isArray(booking.availableActions)
      ? booking.availableActions
      : [],
  };
}

function getActionDescriptorsForRow(booking: TenantBookingListRecord) {
  return booking.availableActions;
}

function getActionLabel(action: string) {
  return ACTION_COPY[action] ?? action.replaceAll("_", " ");
}

function normalizeActionToken(action: string) {
  return action.trim().toLowerCase();
}

function getActionDisabledReason(descriptor: ResourceActionDescriptor) {
  if (!descriptor.disabledReasonCode) {
    return "目前不可操作";
  }

  return descriptor.disabledReasonCode.replaceAll("_", " ");
}

function getOrderStatusLabel(status: OwnedOrderStatus) {
  return ORDER_STATUS_COPY[status] ?? status;
}

function getApprovalStateLabel(state: BookingRecord["approvalState"]) {
  return APPROVAL_STATE_COPY[state] ?? state;
}

function getBookingTypeLabel(type: BookingRecord["bookingType"]) {
  return BOOKING_TYPE_COPY[type] ?? type;
}

function getEmptyReasonFromError(error: unknown): TenantEmptyReason {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (
    message.includes("403") ||
    message.includes("401") ||
    message.includes("forbidden") ||
    message.includes("permission")
  ) {
    return "permission_denied";
  }
  if (
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("external") ||
    message.includes("gateway") ||
    message.includes("partner")
  ) {
    return "external_unavailable";
  }

  return "fetch_failed";
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const baseUrl = CROSS_APP_BASE_URLS[link.targetApp];
  return baseUrl ? `${baseUrl}${link.route}` : link.route;
}

function isCreateBookingAction(descriptor: ResourceActionDescriptor) {
  const normalizedAction = normalizeActionToken(descriptor.action);
  return (
    normalizedAction === "create" ||
    normalizedAction === "create_booking" ||
    normalizedAction === "create_tenant_booking"
  );
}

function opensBookingWorkSurface(descriptor: ResourceActionDescriptor) {
  return ["view_detail", "open_detail", "detail"].includes(
    normalizeActionToken(descriptor.action),
  );
}

function getActionHref(
  descriptor: ResourceActionDescriptor,
  context?: ActionBindingContext,
): ActionPresentation {
  if (isCreateBookingAction(descriptor)) {
    return {
      href: "/bookings/new",
      requiresDetailSurface: false,
    };
  }

  if (
    normalizeActionToken(descriptor.action) === "open_integration_governance"
  ) {
    return {
      href: "/integration-governance",
      requiresDetailSurface: false,
    };
  }

  if (normalizeActionToken(descriptor.action) === "reset_filters") {
    return {
      href: "/bookings",
      requiresDetailSurface: false,
    };
  }

  if (context?.bookingId && opensBookingWorkSurface(descriptor)) {
    return {
      href: `/bookings/${context.bookingId}`,
      requiresDetailSurface: false,
    };
  }

  if (
    context?.bookingId &&
    ["update", "update_booking", "cancel", "cancel_booking"].includes(
      normalizeActionToken(descriptor.action),
    )
  ) {
    return {
      href: null,
      requiresDetailSurface: true,
    };
  }

  return {
    href: null,
    requiresDetailSurface: false,
  };
}

function getPrimaryBookingHref(booking: TenantBookingListRecord) {
  const primaryAction = getActionDescriptorsForRow(booking).find(
    (descriptor) =>
      descriptor.enabled &&
      Boolean(
        getActionHref(descriptor, {
          bookingId: booking.bookingId,
        }).href,
      ) &&
      opensBookingWorkSurface(descriptor),
  );

  return primaryAction
    ? getActionHref(primaryAction, {
        bookingId: booking.bookingId,
      }).href
    : null;
}

function getRelativeUrgency(iso: string | null) {
  if (!iso) {
    return null;
  }

  const diffMs = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diffMs)) {
    return null;
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes <= 0) {
    return "已過 editable 截止";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分鐘內截止`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours} 小時內截止`;
}

function getRelativeAge(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) {
    return "剛建立";
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 60) {
    return `${Math.max(diffMinutes, 1)} 分鐘前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小時前`;
  }

  return `${Math.floor(diffHours / 24)} 天前`;
}
function getRefreshTone(refresh: UiRefreshMetadata | null) {
  if (!refresh) {
    return "is-warning";
  }
  if (refresh.dataFreshness === "degraded") {
    return "is-warning";
  }
  if (refresh.dataFreshness === "stale") {
    return "is-active";
  }

  return "";
}

function getRefreshCopy(refresh: UiRefreshMetadata | null) {
  if (!refresh) {
    return `${TENANT_BOOKINGS_REFRESH_TIER_COPY} · 等待後端 refresh metadata`;
  }

  return [
    TENANT_BOOKINGS_REFRESH_TIER_COPY,
    refresh.staleAfterMs > 0
      ? `${refresh.staleAfterMs / 1000}s cadence`
      : "手動更新",
    REFRESH_FRESHNESS_COPY[refresh.dataFreshness],
    `快照 ${formatDateTime(refresh.generatedAt)}`,
    REFRESH_SOURCE_COPY[refresh.source],
  ].join(" · ");
}

function getApprovalCopy(booking: TenantBookingListRecord) {
  if (booking.approvalState === "pending") {
    return `${booking.approvalRequestIds.length} 筆審批待處理`;
  }
  if (booking.approvalState === "blocked") {
    return "審批阻擋中";
  }
  if (booking.approvalState === "rejected") {
    return "審批已拒絕";
  }
  if (booking.approvalState === "cancelled_by_re_evaluation") {
    return "審批已因重算取消";
  }

  return null;
}

function buildBookingsHref(
  query: BookingListQuery,
  nextQuery: Partial<BookingListQuery>,
  options?: {
    focusedBookingId?: string;
    notificationRef?: string;
  },
) {
  const mergedQuery = {
    ...query,
    ...nextQuery,
  };
  const params = new URLSearchParams(buildBookingListQueryString(mergedQuery));
  if (options?.focusedBookingId) {
    params.set("bookingId", options.focusedBookingId);
  }
  if (options?.notificationRef) {
    params.set("notification", options.notificationRef);
  }
  const queryString = params.toString();

  return queryString ? `/bookings?${queryString}` : "/bookings";
}

function getPageStatusTabs(
  bookings: TenantBookingListRecord[],
  query: BookingListQuery,
  options?: {
    focusedBookingId?: string;
    notificationRef?: string;
  },
): PageTabDescriptor[] {
  return PAGE_TAB_PRESETS.map((preset) => {
    const tabQuery = {
      ...query,
      page: 1,
      approval: preset.approval ?? "all",
      statuses: preset.statuses ?? [],
    };
    const value = applyBookingListQuery(bookings, tabQuery).total;
    const isActive =
      (preset.statuses
        ? preset.statuses.join(",") === query.statuses.join(",")
        : query.statuses.length === 0) &&
      (preset.approval ?? "all") === query.approval;

    return {
      label: preset.label,
      value,
      href: buildBookingsHref(query, tabQuery, options),
      isActive,
    };
  });
}

async function fetchBookingListEnvelope(): Promise<BookingListEnvelope> {
  const response = await fetch(`${API_URL}/api/tenant/bookings`, {
    cache: "no-store",
    headers: {
      "x-actor-id": DEMO_ACTOR_ID,
      "x-actor-type": "tenant_admin",
      "x-realm": "tenant",
      "x-tenant-id": DEMO_TENANT_ID,
    },
  });

  if (!response.ok) {
    throw new Error(`tenant bookings fetch failed: ${response.status}`);
  }

  const payload =
    (await response.json()) as ApiSuccessEnvelope<BookingListEnvelope>;
  return payload.data;
}

export default async function TenantBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = parseBookingListQuery(resolvedSearchParams);
  const focusedBookingId = first(resolvedSearchParams.bookingId);
  const notificationRef = first(resolvedSearchParams.notification);
  const bookingsResult = await Promise.allSettled([fetchBookingListEnvelope()]);
  const bookingsSettled = bookingsResult[0];
  const listEnvelope =
    bookingsSettled.status === "fulfilled" ? bookingsSettled.value : null;
  const rawBookings = listEnvelope?.items ?? [];
  const bookings = rawBookings.map(normalizeBooking);
  const result = applyBookingListQuery(bookings, query);
  const refreshMetadata = listEnvelope?.refresh ?? null;
  const backendEmptyReason = EMPTY_REASON_SET.has(
    listEnvelope?.emptyState?.reason as EmptyReason,
  )
    ? (listEnvelope?.emptyState?.reason as TenantEmptyReason)
    : null;
  const emptyReason: TenantEmptyReason | null =
    backendEmptyReason ??
    (bookingsSettled.status === "rejected"
      ? getEmptyReasonFromError(bookingsSettled.reason)
      : result.total === 0
        ? hasActiveFilters(resolvedSearchParams)
          ? "filtered_empty"
          : null
        : null);
  const emptyState = emptyReason ? EMPTY_STATE_COPY[emptyReason] : null;
  const showGenericEmptyState =
    bookingsSettled.status === "fulfilled" &&
    result.total === 0 &&
    emptyReason === null;
  const pageTabs = getPageStatusTabs(bookings, query, {
    focusedBookingId,
    notificationRef,
  });
  const headerActions = listEnvelope?.availableActions ?? [];
  const pendingApprovalBookings = bookings
    .filter((booking) => booking.approvalState === "pending")
    .sort(
      (left, right) =>
        new Date(left.updatedAt).getTime() -
        new Date(right.updatedAt).getTime(),
    )
    .slice(0, 3);
  const hasCrossAppLinks = result.items.some(
    (booking) =>
      Array.isArray(booking.crossAppLinks) && booking.crossAppLinks.length > 0,
  );
  const refreshPollIntervalMs = refreshMetadata?.staleAfterMs ?? 0;
  const liveCount = bookings.filter((booking) =>
    LIVE_ORDER_STATUSES.has(booking.orderStatus),
  ).length;
  const approvalCount = bookings.filter(
    (booking) => booking.approvalState === "pending",
  ).length;
  const atRiskCount = bookings.filter(
    (booking) =>
      booking.slaStatus === "at_risk" || booking.slaStatus === "breach",
  ).length;

  return (
    <div className="page-shell">
      <section className="bookings-page-header">
        <div className="bookings-console-headline">
          <span className="eyebrow">Bookings</span>
          <h1>訂單</h1>
          <p>本月所有預約，含進行中與已完成。</p>
        </div>
        <div className="bookings-header-actions">
          <a
            className="action-button action-button-secondary"
            href="#bookings-filters"
          >
            篩選條件
          </a>
          {headerActions.map((descriptor) => {
            const href = getActionHref(descriptor);

            return href.href && descriptor.enabled ? (
              <Link
                className="action-button action-button-primary"
                href={href.href}
                key={descriptor.action}
              >
                {getActionLabel(descriptor.action)}
              </Link>
            ) : (
              <span
                className="action-button action-button-secondary is-disabled"
                key={descriptor.action}
                title={
                  descriptor.enabled
                    ? "backend 已發布此 action，但此列表頁沒有直接綁定對應 route"
                    : getActionDisabledReason(descriptor)
                }
              >
                {getActionLabel(descriptor.action)}
              </span>
            );
          })}
        </div>
      </section>

      <div className="bookings-tab-row">
        {pageTabs.map((tab) => (
          <Link
            className={`bookings-tab-chip${tab.isActive ? " is-active" : ""}`}
            href={tab.href}
            key={tab.label}
          >
            <span>{tab.label}</span>
            <strong>{tab.value}</strong>
          </Link>
        ))}
      </div>

      <section className="bookings-board">
        <div className="bookings-meta-strip">
          <span className="metric-label">刷新節奏</span>
          <span
            className={`status-chip ${getRefreshTone(refreshMetadata)}`.trim()}
          >
            {getRefreshCopy(refreshMetadata)}
          </span>
          <BookingsRefreshControl
            generatedAt={refreshMetadata?.generatedAt ?? null}
            staleAfterMs={refreshPollIntervalMs}
          />
          <span className="status-chip">全部 {bookings.length} 筆</span>
          <span className="status-chip is-active">進行中 {liveCount}</span>
          <span className="status-chip">待審批 {approvalCount}</span>
          <span
            className={`status-chip${atRiskCount > 0 ? " is-warning" : ""}`}
          >
            SLA 關注 {atRiskCount}
          </span>
          {(notificationRef || focusedBookingId) && (
            <span className="status-chip is-warning">
              {notificationRef
                ? `通知追蹤 ${notificationRef}`
                : `聚焦訂單 ${focusedBookingId}`}
            </span>
          )}
          {hasCrossAppLinks ? (
            <span className="status-chip is-warning">
              已提供 cross-app deep links
            </span>
          ) : null}
        </div>

        <form
          action="/bookings"
          className="bookings-filter-panel"
          id="bookings-filters"
        >
          <label className="field-stack booking-search-field">
            <span>搜尋</span>
            <input
              defaultValue={query.q}
              name="q"
              placeholder="Booking ID、Order ID、乘客、上下車地點"
            />
          </label>
          <label className="field-stack">
            <span>日期欄位</span>
            <select defaultValue={query.dateField} name="dateField">
              <option value="reservationStart">預約時間</option>
              <option value="createdAt">建立時間</option>
            </select>
          </label>
          <label className="field-stack">
            <span>服務分類</span>
            <select defaultValue={query.serviceBucket} name="serviceBucket">
              <option value="all">全部</option>
              <option value="business_dispatch">企業派遣</option>
            </select>
          </label>
          <label className="field-stack">
            <span>服務子類型</span>
            <select defaultValue={query.subtype} name="subtype">
              <option value="all">全部</option>
              {BUSINESS_DISPATCH_SUBTYPES.map((subtype) => (
                <option key={subtype} value={subtype}>
                  {subtype}
                </option>
              ))}
            </select>
          </label>
          <label className="field-stack">
            <span>審批</span>
            <select defaultValue={query.approval} name="approval">
              <option value="all">全部</option>
              <option value="pending">
                {getApprovalStateLabel("pending")}
              </option>
              <option value="approved">
                {getApprovalStateLabel("approved")}
              </option>
              <option value="rejected">
                {getApprovalStateLabel("rejected")}
              </option>
              <option value="blocked">
                {getApprovalStateLabel("blocked")}
              </option>
            </select>
          </label>
          <label className="field-stack">
            <span>起始日</span>
            <input defaultValue={query.dateFrom} name="dateFrom" type="date" />
          </label>
          <label className="field-stack">
            <span>結束日</span>
            <input defaultValue={query.dateTo} name="dateTo" type="date" />
          </label>
          <label className="field-stack">
            <span>每頁筆數</span>
            <select defaultValue={String(query.pageSize)} name="pageSize">
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
          {focusedBookingId ? (
            <input name="bookingId" type="hidden" value={focusedBookingId} />
          ) : null}
          {notificationRef ? (
            <input name="notification" type="hidden" value={notificationRef} />
          ) : null}
          {query.statuses.length > 0 ? (
            <input
              name="status"
              type="hidden"
              value={query.statuses.join(",")}
            />
          ) : null}
          <div className="form-actions">
            <button
              className="action-button action-button-primary"
              type="submit"
            >
              套用條件
            </button>
            <Link
              className="action-button action-button-secondary"
              href="/bookings"
            >
              清除條件
            </Link>
          </div>
        </form>

        <div className="bookings-status-strip">
          <span className="metric-label">狀態篩選</span>
          {OWNED_ORDER_STATUSES.map((status) => {
            const nextStatuses = toggleStatus(query.statuses, status);
            const href = buildBookingsHref(
              query,
              {
                statuses: nextStatuses,
                page: 1,
              },
              {
                focusedBookingId,
                notificationRef,
              },
            );

            return (
              <Link
                className={`status-chip${query.statuses.includes(status) ? " is-active" : ""}`}
                href={href}
                key={status}
              >
                {getOrderStatusLabel(status)}
                <span>{result.statusCounts[status] ?? 0}</span>
              </Link>
            );
          })}
        </div>

        {pendingApprovalBookings.length > 0 && !emptyState ? (
          <div className="bookings-priority-strip">
            <div className="bookings-priority-head">
              <div>
                <span className="surface-kicker">審批焦點</span>
                <h3>待審批 booking 需優先浮出處理。</h3>
              </div>
              <Link
                className="text-link"
                href={buildBookingsHref(
                  query,
                  {
                    approval: "pending",
                    page: 1,
                  },
                  {
                    focusedBookingId,
                    notificationRef,
                  },
                )}
              >
                查看全部待審批
              </Link>
            </div>
            <div className="bookings-priority-grid">
              {pendingApprovalBookings.map((booking) => {
                const primaryHref = getPrimaryBookingHref(booking);

                return (
                  <article
                    className="bookings-priority-card"
                    key={booking.bookingId}
                  >
                    <div className="bookings-priority-card-head">
                      <div>
                        {primaryHref ? (
                          <Link
                            className="bookings-primary-link"
                            href={primaryHref}
                          >
                            {booking.bookingId}
                          </Link>
                        ) : (
                          <span className="bookings-primary-link">
                            {booking.bookingId}
                          </span>
                        )}
                        <p>{booking.passenger.name}</p>
                      </div>
                      <span className="bookings-warning-pill">
                        {booking.approvalRequestIds.length} 筆待審批
                      </span>
                    </div>
                    <p>
                      {booking.pickup.address} → {booking.dropoff.address}
                    </p>
                    <div className="bookings-priority-meta">
                      <span className="status-chip">
                        {getOrderStatusLabel(booking.orderStatus)}
                      </span>
                      <span className="status-chip">
                        {formatDateTime(booking.reservationWindowStart)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}

        {emptyState ? (
          <div className={`bookings-empty-state is-${emptyReason}`}>
            <div className="bookings-empty-hero">
              <div className="bookings-empty-orb">
                {emptyReason ? EMPTY_STATE_ORBS[emptyReason] : "state"}
              </div>
              <div className="bookings-empty-copy">
                <span className="surface-kicker">{emptyState.eyebrow}</span>
                <h3>{emptyState.title}</h3>
                <p>{emptyState.description}</p>
              </div>
            </div>
            <div className="bookings-empty-highlights">
              <span className="status-chip is-active">{emptyState.accent}</span>
              {emptyState.highlights.map((highlight) => (
                <span className="bookings-empty-highlight" key={highlight}>
                  {highlight}
                </span>
              ))}
            </div>
            <div className="link-row">
              {listEnvelope?.emptyState?.messageCode ? (
                <span className="bookings-inline-meta">
                  {listEnvelope.emptyState.messageCode}
                </span>
              ) : null}
              {listEnvelope?.emptyState?.nextAction
                ? (() => {
                    const href = getActionHref(
                      listEnvelope.emptyState.nextAction,
                    );

                    return href.href &&
                      listEnvelope.emptyState.nextAction.enabled ? (
                      <Link className="bookings-action-pill" href={href.href}>
                        {getActionLabel(
                          listEnvelope.emptyState.nextAction.action,
                        )}
                      </Link>
                    ) : (
                      <span
                        className="bookings-action-pill is-disabled"
                        title={
                          listEnvelope.emptyState.nextAction.enabled
                            ? "backend 已發布 nextAction，但此頁沒有對應 route 綁定"
                            : getActionDisabledReason(
                                listEnvelope.emptyState.nextAction,
                              )
                        }
                      >
                        {getActionLabel(
                          listEnvelope.emptyState.nextAction.action,
                        )}
                      </span>
                    );
                  })()
                : null}
            </div>
          </div>
        ) : showGenericEmptyState ? (
          <div className="bookings-empty-state">
            <div className="bookings-empty-hero">
              <div className="bookings-empty-orb">empty</div>
              <div className="bookings-empty-copy">
                <span className="surface-kicker">Empty Snapshot</span>
                <h3>目前沒有可顯示的 booking</h3>
                <p>
                  後端這次回應了空清單，但沒有附上 `emptyState.reason`。
                  這個畫面不會自行補判為 `no_data` 或 `not_provisioned`。
                </p>
              </div>
            </div>
            <div className="bookings-empty-highlights">
              <span className="status-chip is-warning">
                backend emptyState missing
              </span>
              <span className="bookings-empty-highlight">
                需要 API 回傳 canonical empty reason
              </span>
            </div>
          </div>
        ) : (
          <div className="table-wrap bookings-table-wrap">
            <table className="data-grid bookings-canvas-table">
              <thead>
                <tr>
                  <th>BK</th>
                  <th>ORDER</th>
                  <th>TYPE</th>
                  <th>PICKUP → DROP</th>
                  <th>WIN</th>
                  <th>PASS</th>
                  <th>STATE</th>
                  <th>LAST UPDATE</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((booking) => {
                  const source = getBookingSourceVisibility(booking);
                  const urgency = getRelativeUrgency(booking.editableUntil);
                  const approvalCopy = getApprovalCopy(booking);
                  const rowActions = getActionDescriptorsForRow(booking);
                  const isFocused = focusedBookingId === booking.bookingId;
                  const primaryHref = getPrimaryBookingHref(booking);

                  return (
                    <tr
                      className={isFocused ? "bookings-row-focus" : undefined}
                      key={booking.bookingId}
                    >
                      <td>
                        <div className="table-primary table-mono">
                          {primaryHref ? (
                            <Link
                              className="bookings-primary-link"
                              href={primaryHref}
                            >
                              {booking.bookingId}
                            </Link>
                          ) : (
                            <span className="bookings-primary-link">
                              {booking.bookingId}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="table-primary table-mono">
                          <span>{booking.orderId}</span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          <span className="table-mono">
                            {booking.businessDispatchSubtype}
                          </span>
                          <span className="table-secondary">
                            {booking.serviceBucket} ·{" "}
                            {getBookingTypeLabel(booking.bookingType)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          <span>{booking.pickup.address}</span>
                          <span className="table-secondary">
                            ↓ {booking.dropoff.address}
                          </span>
                          {Array.isArray(booking.crossAppLinks) &&
                          booking.crossAppLinks.length > 0 ? (
                            <div className="link-row">
                              {booking.crossAppLinks.map((link) => (
                                <a
                                  className="text-link"
                                  href={buildCrossAppHref(link)}
                                  key={`${link.targetApp}-${link.resourceId}-${link.label}`}
                                  rel={
                                    link.openMode === "new_tab"
                                      ? "noreferrer"
                                      : undefined
                                  }
                                  target={
                                    link.openMode === "new_tab"
                                      ? "_blank"
                                      : undefined
                                  }
                                >
                                  {link.label}
                                  {link.openMode === "new_tab" ? " ↗" : ""}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="table-primary table-mono">
                          <span>
                            {formatDateTime(booking.reservationWindowStart)}
                          </span>
                          <span className="table-secondary">
                            至 {formatDateTime(booking.reservationWindowEnd)}
                          </span>
                          {urgency ? (
                            <span className="bookings-inline-meta">
                              {urgency}
                            </span>
                          ) : booking.readOnlyReasonCode ? (
                            <span className="bookings-inline-meta">
                              {booking.readOnlyReasonCode}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          <span>{booking.passenger.name}</span>
                          <span className="table-secondary">
                            {booking.passenger.phone}
                          </span>
                          <span className="bookings-inline-meta">
                            Age {getRelativeAge(booking.createdAt)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          <div className="bookings-chip-stack">
                            <span className="status-badge">
                              {getOrderStatusLabel(booking.orderStatus)}
                            </span>
                            <span
                              className={getSourceToneClassName(source.tone)}
                            >
                              {source.badge}
                            </span>
                            {approvalCopy ? (
                              <span className="bookings-warning-pill">
                                {approvalCopy}
                              </span>
                            ) : null}
                            {booking.slaStatus ? (
                              <span
                                className={`bookings-sla-pill is-${booking.slaStatus}`}
                              >
                                SLA{" "}
                                {booking.slaStatus === "at_risk"
                                  ? "風險中"
                                  : booking.slaStatus === "breach"
                                    ? "已違反"
                                    : "健康"}
                              </span>
                            ) : null}
                          </div>
                          <span className="table-secondary">
                            {getApprovalStateLabel(booking.approvalState)} ·{" "}
                            {formatMoney(booking.quotedFare)}
                          </span>
                          <div className="row-actions">
                            {rowActions.length > 0 ? (
                              rowActions.map((descriptor) => {
                                const presentation = getActionHref(descriptor, {
                                  bookingId: booking.bookingId,
                                });

                                return descriptor.enabled &&
                                  presentation.href ? (
                                  <Link
                                    className="bookings-action-pill"
                                    href={presentation.href}
                                    key={descriptor.action}
                                  >
                                    {getActionLabel(descriptor.action)}
                                  </Link>
                                ) : descriptor.enabled &&
                                  presentation.requiresDetailSurface ? (
                                  <span
                                    className="bookings-action-pill"
                                    key={descriptor.action}
                                    title="此動作依 contract 可用，但需進入 booking detail 執行。"
                                  >
                                    {getActionLabel(descriptor.action)}
                                  </span>
                                ) : (
                                  <span
                                    className="bookings-action-pill is-disabled"
                                    key={descriptor.action}
                                    title={
                                      descriptor.enabled
                                        ? "backend 已發布此 action，但此列表頁沒有直接綁定對應 route"
                                        : getActionDisabledReason(descriptor)
                                    }
                                  >
                                    {getActionLabel(descriptor.action)}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="bookings-inline-meta">
                                backend 未回傳可執行動作
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          <span>{formatDateTime(booking.updatedAt)}</span>
                          <span className="table-secondary">
                            {booking.bookedBy?.name ?? "Tenant self-service"} ·{" "}
                            {getRelativeAge(booking.updatedAt)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination-row">
          <span className="muted-copy">
            第 {result.page} / {result.totalPages} 頁 · 共 {result.total} 筆
          </span>
          <div className="link-row">
            {result.page > 1 ? (
              <Link
                className="text-link"
                href={buildBookingsHref(
                  query,
                  {
                    page: result.page - 1,
                  },
                  {
                    focusedBookingId,
                    notificationRef,
                  },
                )}
              >
                上一頁
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link
                className="text-link"
                href={buildBookingsHref(
                  query,
                  {
                    page: result.page + 1,
                  },
                  {
                    focusedBookingId,
                    notificationRef,
                  },
                )}
              >
                下一頁
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
