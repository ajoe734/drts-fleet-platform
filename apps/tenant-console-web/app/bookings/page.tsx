import Link from "next/link";
import type {
  ApiListData,
  ApiSuccessEnvelope,
  BookingRecord,
  CrossAppResourceLink,
  EmptyStateEnvelope,
  EmptyReason,
  OwnedOrderStatus,
  RefreshTier,
  ResourceActionDescriptor,
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

const OPS_CONSOLE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";
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
  cancel: "可取消",
  create: "建立叫車",
  create_booking: "建立叫車",
  view_detail: "查看詳情",
  filter: "篩選",
  refresh: "立即更新",
};
const ACTION_PRIORITY = ["view_detail", "update", "cancel"];
const REFRESH_TIER: RefreshTier = "slow";
const REFRESH_TIER_POLL_INTERVAL_MS: Record<RefreshTier, number> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: 0,
};

type SearchParamValue = string | string[] | undefined;

type TenantBookingRuntimeRecord = BookingRecord & {
  availableActions?: ResourceActionDescriptor[];
  editableUntil?: string | null;
  readOnlyReasonCode?: string | null;
  slaStatus?: "healthy" | "at_risk" | "breach" | null;
  crossAppLinks?: CrossAppResourceLink[];
};

type TenantBookingListRecord = TenantBookingRuntimeRecord & {
  editableUntil: string | null;
  readOnlyReasonCode: string | null;
  availableActions: ResourceActionDescriptor[];
};

type TenantEmptyReason = (typeof TENANT_EMPTY_REASONS)[number];

type BookingListEnvelope = ApiListData<TenantBookingRuntimeRecord> & {
  emptyState?: EmptyStateEnvelope | null;
  refresh?: UiRefreshMetadata | null;
};

type EmptyStateDescriptor = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
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
    actionLabel: "建立第一筆叫車",
    actionHref: "/bookings/new",
  },
  not_provisioned: {
    eyebrow: "Not Provisioned",
    title: "租戶尚未完成 booking capability 開通",
    description:
      "目前不是單純的空列表，而是 tenant booking surface 尚未 ready。先完成 integration governance / module enablement，再回到這個 route。",
    actionLabel: "查看整合就緒度",
    actionHref: "/integration-governance",
  },
  fetch_failed: {
    eyebrow: "Fetch Failed",
    title: "目前無法讀取 booking 列表",
    description:
      "系統沒有拿到可靠的 tenant booking snapshot。先檢查 API 連線與後端健康，再決定是否重新整理或改從 audit 追查。",
    actionLabel: "查看稽核",
    actionHref: "/audit",
  },
  permission_denied: {
    eyebrow: "Permission Denied",
    title: "目前身分無法查看這份 booking 列表",
    description:
      "這是權限不足，不是資料為空。必須改由有 tenant booking read 權限的 actor 進入，或回到使用者角色設定確認授權。",
    actionLabel: "檢查使用者與角色",
    actionHref: "/users",
  },
  external_unavailable: {
    eyebrow: "External Unavailable",
    title: "外部依賴暫時無法提供 booking 狀態",
    description:
      "forwarded / partner 相關依賴目前不穩定。tenant list 不能假裝資料完整，請改從 integration governance 或 ops console 深入查明。",
    actionLabel: "查看整合就緒度",
    actionHref: "/integration-governance",
  },
  filtered_empty: {
    eyebrow: "Filtered Empty",
    title: "目前的篩選條件沒有命中任何 booking",
    description:
      "清單本身存在資料，但狀態、service bucket、日期區間或搜尋詞把結果縮成 0 筆。可重設 filter 或切回全部狀態。",
    actionLabel: "清除篩選",
    actionHref: "/bookings",
  },
};

function first(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseEmptyReasonOverride(
  searchParams: Record<string, SearchParamValue>,
): TenantEmptyReason | null {
  const value = first(searchParams.emptyReason);
  if (EMPTY_REASON_SET.has(value as EmptyReason)) {
    return value as TenantEmptyReason;
  }

  return null;
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
  booking: TenantBookingRuntimeRecord,
): TenantBookingListRecord {
  return {
    ...booking,
    editableUntil: booking.editableUntil ?? booking.modifiableUntil,
    readOnlyReasonCode: booking.readOnlyReasonCode ?? null,
    availableActions: Array.isArray(booking.availableActions)
      ? booking.availableActions
      : [],
  };
}

function getActionDescriptorsForRow(booking: TenantBookingListRecord) {
  return [...booking.availableActions].sort((left, right) => {
    const leftIndex = ACTION_PRIORITY.indexOf(left.action);
    const rightIndex = ACTION_PRIORITY.indexOf(right.action);
    const normalizedLeftIndex =
      leftIndex === -1 ? ACTION_PRIORITY.length : leftIndex;
    const normalizedRightIndex =
      rightIndex === -1 ? ACTION_PRIORITY.length : rightIndex;

    if (normalizedLeftIndex !== normalizedRightIndex) {
      return normalizedLeftIndex - normalizedRightIndex;
    }

    return left.action.localeCompare(right.action);
  });
}

function getActionLabel(action: string) {
  return ACTION_COPY[action] ?? action.replaceAll("_", " ");
}

function getActionHref(
  booking: TenantBookingListRecord,
  descriptor: ResourceActionDescriptor,
) {
  const actionRoute = getActionRoute(descriptor.action);
  if (actionRoute) {
    return actionRoute;
  }

  return `/bookings/${booking.bookingId}`;
}

function getActionRoute(action: string) {
  if (action === "create" || action === "create_booking") {
    return "/bookings/new";
  }

  if (action === "filter") {
    return "#bookings-filters";
  }

  return null;
}

function getActionDisabledReason(descriptor: ResourceActionDescriptor) {
  if (!descriptor.disabledReasonCode) {
    return "目前不可操作";
  }

  return descriptor.disabledReasonCode.replaceAll("_", " ");
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
  const baseUrl =
    link.targetApp === "ops-console" ? OPS_CONSOLE_URL : PLATFORM_ADMIN_URL;
  return `${baseUrl}${link.route}`;
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
    return [
      `T5 ${REFRESH_TIER.replaceAll("_", " ")}`,
      "awaiting backend refresh envelope",
    ].join(" · ");
  }

  return [
    `T5 ${REFRESH_TIER.replaceAll("_", " ")}`,
    refresh.dataFreshness,
    `snapshot ${formatDateTime(refresh.generatedAt)}`,
    refresh.source,
  ].join(" · ");
}

function getEmptyStateAction(
  emptyState: EmptyStateEnvelope | null | undefined,
): { href: string; label: string } | null {
  const descriptor = emptyState?.nextAction;
  if (!descriptor?.enabled) {
    return null;
  }

  const href = getActionRoute(descriptor.action);
  if (!href) {
    return null;
  }

  return {
    href,
    label: getActionLabel(descriptor.action),
  };
}

function getApprovalCopy(booking: TenantBookingListRecord) {
  if (booking.approvalState === "pending") {
    return `${booking.approvalRequestIds.length} approvals pending`;
  }
  if (booking.approvalState === "blocked") {
    return "approval blocked";
  }
  if (booking.approvalState === "rejected") {
    return "approval rejected";
  }

  return null;
}

function getServiceLabel(booking: TenantBookingListRecord) {
  return `${booking.serviceBucket} / ${booking.businessDispatchSubtype}`;
}

function getSubtypeCounts(bookings: TenantBookingListRecord[]) {
  const counts = new Map<string, number>();
  bookings.forEach((booking) => {
    const current = counts.get(booking.businessDispatchSubtype) ?? 0;
    counts.set(booking.businessDispatchSubtype, current + 1);
  });

  return [...counts.entries()]
    .map(([subtype, count]) => ({
      subtype: subtype as BookingListQuery["subtype"],
      count,
    }))
    .sort((left, right) => left.subtype.localeCompare(right.subtype));
}

function buildBookingsHref(
  query: BookingListQuery,
  nextQuery: Partial<BookingListQuery>,
  options?: {
    focusedBookingId?: string;
    notificationRef?: string;
    emptyReasonOverride?: TenantEmptyReason | null;
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
  if (options?.emptyReasonOverride) {
    params.set("emptyReason", options.emptyReasonOverride);
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
    emptyReasonOverride?: TenantEmptyReason | null;
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
  const emptyReasonOverride = parseEmptyReasonOverride(resolvedSearchParams);
  const bookingsResult = await Promise.allSettled([fetchBookingListEnvelope()]);
  const bookingsSettled = bookingsResult[0];
  const listEnvelope =
    bookingsSettled.status === "fulfilled" ? bookingsSettled.value : null;
  const rawBookings = listEnvelope?.items ?? [];
  const bookings = rawBookings.map(normalizeBooking);
  const result = applyBookingListQuery(bookings, query);
  const refreshMetadata = listEnvelope?.refresh ?? null;
  const emptyReason: TenantEmptyReason | null =
    emptyReasonOverride ??
    (listEnvelope?.emptyState?.reason as TenantEmptyReason | undefined) ??
    (bookingsSettled.status === "rejected"
      ? getEmptyReasonFromError(bookingsSettled.reason)
      : result.total === 0
        ? hasActiveFilters(resolvedSearchParams)
          ? "filtered_empty"
          : "no_data"
        : null);
  const emptyState = emptyReason ? EMPTY_STATE_COPY[emptyReason] : null;
  const emptyStateAction = getEmptyStateAction(listEnvelope?.emptyState);
  const pageTabs = getPageStatusTabs(bookings, query, {
    focusedBookingId,
    notificationRef,
    emptyReasonOverride,
  });
  const subtypeCounts = getSubtypeCounts(bookings);
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
  const refreshPollIntervalMs =
    refreshMetadata?.staleAfterMs ??
    REFRESH_TIER_POLL_INTERVAL_MS[REFRESH_TIER];

  return (
    <div className="page-shell">
      <section className="bookings-page-header">
        <div className="bookings-console-headline">
          <span className="eyebrow">Bookings</span>
          <h1>訂單</h1>
          <p>本月所有預約，含進行中、待審批、已完成與取消。</p>
        </div>
        <div className="bookings-header-actions">
          <Link
            className="action-button action-button-secondary"
            href="/bookings"
          >
            篩選
          </Link>
          <Link
            className="action-button action-button-secondary"
            href="/reports"
          >
            匯出
          </Link>
          <Link
            className="action-button action-button-primary"
            href="/bookings/new"
          >
            新增
          </Link>
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
          <span className="metric-label">Refresh tier</span>
          <span
            className={`status-chip ${getRefreshTone(refreshMetadata)}`.trim()}
          >
            {getRefreshCopy(refreshMetadata)}
          </span>
          <BookingsRefreshControl
            generatedAt={refreshMetadata?.generatedAt ?? null}
            pollIntervalMs={refreshPollIntervalMs}
          />
          <span className="status-chip">
            {result.total} visible / {bookings.length} total
          </span>
          {(notificationRef || focusedBookingId) && (
            <span className="status-chip is-warning">
              {notificationRef
                ? `notification ${notificationRef}`
                : `focus ${focusedBookingId}`}
            </span>
          )}
          {hasCrossAppLinks ? (
            <span className="status-chip is-warning">
              cross-app deep links available
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
              placeholder="Booking ID, order ID, passenger, route"
            />
          </label>
          <label className="field-stack">
            <span>日期欄位</span>
            <select defaultValue={query.dateField} name="dateField">
              <option value="reservationStart">Reservation start</option>
              <option value="createdAt">Created at</option>
            </select>
          </label>
          <label className="field-stack">
            <span>Service bucket</span>
            <select defaultValue={query.serviceBucket} name="serviceBucket">
              <option value="all">All</option>
              <option value="business_dispatch">business_dispatch</option>
            </select>
          </label>
          <label className="field-stack">
            <span>Service subtype</span>
            <select defaultValue={query.subtype} name="subtype">
              <option value="all">All</option>
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
              <option value="all">All</option>
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="blocked">blocked</option>
            </select>
          </label>
          <label className="field-stack">
            <span>From</span>
            <input defaultValue={query.dateFrom} name="dateFrom" type="date" />
          </label>
          <label className="field-stack">
            <span>To</span>
            <input defaultValue={query.dateTo} name="dateTo" type="date" />
          </label>
          <label className="field-stack">
            <span>Page size</span>
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
          {emptyReasonOverride ? (
            <input
              name="emptyReason"
              type="hidden"
              value={emptyReasonOverride}
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

        <div className="bookings-subtype-strip">
          <span className="metric-label">Subtype</span>
          <Link
            className={`status-chip${query.subtype === "all" ? " is-active" : ""}`}
            href={buildBookingsHref(
              query,
              {
                subtype: "all",
                page: 1,
              },
              {
                focusedBookingId,
                notificationRef,
                emptyReasonOverride,
              },
            )}
          >
            all
            <span>{bookings.length}</span>
          </Link>
          {subtypeCounts.map((entry) => (
            <Link
              className={`status-chip${query.subtype === entry.subtype ? " is-active" : ""}`}
              href={buildBookingsHref(
                query,
                {
                  subtype: entry.subtype,
                  page: 1,
                },
                {
                  focusedBookingId,
                  notificationRef,
                  emptyReasonOverride,
                },
              )}
              key={entry.subtype}
            >
              {entry.subtype}
              <span>{entry.count}</span>
            </Link>
          ))}
        </div>

        <div className="bookings-status-strip">
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
                emptyReasonOverride,
              },
            );

            return (
              <Link
                className={`status-chip${query.statuses.includes(status) ? " is-active" : ""}`}
                href={href}
                key={status}
              >
                {status}
                <span>{result.statusCounts[status] ?? 0}</span>
              </Link>
            );
          })}
        </div>

        {pendingApprovalBookings.length > 0 && !emptyState ? (
          <div className="bookings-approval-lane">
            <div className="bookings-approval-head">
              <div>
                <span className="surface-kicker">Approval lane</span>
                <h3>待審批 booking 需要明確浮出，不埋在表格深處。</h3>
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
                    emptyReasonOverride,
                  },
                )}
              >
                查看全部待審批
              </Link>
            </div>
            <div className="bookings-approval-grid">
              {pendingApprovalBookings.map((booking) => (
                <article
                  className="bookings-approval-card"
                  key={booking.bookingId}
                >
                  <div className="bookings-approval-card-head">
                    <div>
                      <Link
                        className="bookings-primary-link"
                        href={`/bookings/${booking.bookingId}`}
                      >
                        {booking.bookingId}
                      </Link>
                      <p>{booking.passenger.name}</p>
                    </div>
                    <span className="bookings-warning-pill">
                      {booking.approvalRequestIds.length} request
                    </span>
                  </div>
                  <p>
                    {booking.pickup.address} → {booking.dropoff.address}
                  </p>
                  <div className="bookings-approval-meta">
                    <span className="status-chip">{booking.orderStatus}</span>
                    <span className="status-chip">
                      {formatDateTime(booking.reservationWindowStart)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {emptyState ? (
          <div className={`bookings-empty-state is-${emptyReason}`}>
            <span className="surface-kicker">{emptyState.eyebrow}</span>
            <h3>{emptyState.title}</h3>
            <p>{emptyState.description}</p>
            <div className="link-row">
              {emptyState.actionHref && emptyState.actionLabel ? (
                <Link className="text-link" href={emptyState.actionHref}>
                  {emptyState.actionLabel}
                </Link>
              ) : null}
              {emptyStateAction ? (
                <Link className="text-link" href={emptyStateAction.href}>
                  {emptyStateAction.label}
                </Link>
              ) : null}
              {emptyReason !== "filtered_empty" ? (
                <Link
                  className="text-link"
                  href="/bookings?emptyReason=filtered_empty"
                >
                  查看 filtered_empty 範例
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="table-wrap bookings-table-wrap">
            <table className="data-grid">
              <thead>
                <tr>
                  <th>BK</th>
                  <th>ORDER</th>
                  <th>SERVICE</th>
                  <th>PICKUP → DROP</th>
                  <th>WIN</th>
                  <th>PASS</th>
                  <th>STATE</th>
                  <th>AGE</th>
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

                  return (
                    <tr
                      className={isFocused ? "bookings-row-focus" : undefined}
                      key={booking.bookingId}
                    >
                      <td>
                        <div className="table-primary table-mono">
                          <Link
                            className="bookings-primary-link"
                            href={`/bookings/${booking.bookingId}`}
                          >
                            {booking.bookingId}
                          </Link>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary table-mono">
                          <span>{booking.orderId}</span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary table-mono">
                          <span>{getServiceLabel(booking)}</span>
                          <span className="table-secondary">
                            {booking.bookingType}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          <span>{booking.pickup.address}</span>
                          <span className="table-secondary">
                            ↓ {booking.dropoff.address}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary table-mono">
                          <span>
                            {formatDateTime(booking.reservationWindowStart)}
                          </span>
                          <span className="table-secondary">
                            to {formatDateTime(booking.reservationWindowEnd)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          <span>{booking.passenger.name}</span>
                          <span className="table-secondary">
                            {booking.passenger.phone}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          <div className="bookings-chip-stack">
                            <span className="status-badge">
                              {booking.orderStatus}
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
                                SLA {booking.slaStatus}
                              </span>
                            ) : null}
                          </div>
                          <span className="table-secondary">
                            {booking.status} · {formatMoney(booking.quotedFare)}
                          </span>
                          <div className="row-actions">
                            {rowActions.length > 0 ? (
                              rowActions.map((descriptor) =>
                                descriptor.enabled ? (
                                  <Link
                                    className="bookings-action-pill"
                                    href={getActionHref(booking, descriptor)}
                                    key={descriptor.action}
                                  >
                                    {getActionLabel(descriptor.action)}
                                  </Link>
                                ) : (
                                  <span
                                    className="bookings-action-pill is-disabled"
                                    key={descriptor.action}
                                    title={getActionDisabledReason(descriptor)}
                                  >
                                    {getActionLabel(descriptor.action)}
                                  </span>
                                ),
                              )
                            ) : (
                              <span className="bookings-inline-meta">
                                backend returned no row actions
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary table-mono">
                          <span>{getRelativeAge(booking.createdAt)}</span>
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
                          <span>{formatDateTime(booking.updatedAt)}</span>
                          <span className="table-secondary">
                            {booking.bookedBy?.name ?? "Self-service tenant"}
                          </span>
                          {Array.isArray(booking.crossAppLinks) &&
                          booking.crossAppLinks.length > 0 ? (
                            <div className="link-row">
                              {booking.crossAppLinks.map((link) => (
                                <a
                                  className="text-link"
                                  href={buildCrossAppHref(link)}
                                  key={`${link.targetApp}-${link.resourceId}-${link.label}`}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  {link.label}
                                </a>
                              ))}
                            </div>
                          ) : null}
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
            Page {result.page} of {result.totalPages} · {result.total} rows
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
                    emptyReasonOverride,
                  },
                )}
              >
                Previous
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
                    emptyReasonOverride,
                  },
                )}
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
