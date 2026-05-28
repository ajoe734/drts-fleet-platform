import Link from "next/link";
import type {
  BookingRecord,
  CrossAppResourceLink,
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
import { CalloutPanel } from "@/components/page-primitives";
import {
  applyBookingListQuery,
  buildBookingListQueryString,
  parseBookingListQuery,
  toggleStatus,
} from "@/lib/booking-list";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";

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
const ATTENTION_ORDER_STATUSES = new Set<OwnedOrderStatus>([
  "dispatch_failed",
  "dispatch_timeout",
  "exception_hold",
  "no_supply",
  "proof_pending",
  "redispatch_required",
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
};
const ACTION_ORDER = ["view_detail", "update", "cancel"];
const REFRESH_TIER: RefreshTier = "slow";

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
  slaStatus: "healthy" | "at_risk" | "breach" | null;
  crossAppLinks: CrossAppResourceLink[];
};

type TenantEmptyReason = (typeof TENANT_EMPTY_REASONS)[number];

type BookingListEnvelope = {
  items: TenantBookingRuntimeRecord[];
  emptyState?: {
    reason: TenantEmptyReason;
  } | null;
  refresh?: UiRefreshMetadata | null;
};

type EmptyStateDescriptor = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
};

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
    first(searchParams.service) ||
    first(searchParams.approval) ||
    first(searchParams.dateFrom) ||
    first(searchParams.dateTo) ||
    first(searchParams.dateField) ||
    first(searchParams.page),
  );
}

function deriveReadOnlyReasonCode(booking: TenantBookingRuntimeRecord) {
  if (booking.readOnlyReasonCode) {
    return booking.readOnlyReasonCode;
  }
  if (
    booking.orderStatus === "completed" ||
    booking.orderStatus === "cancelled"
  ) {
    return "terminal_order_state";
  }
  if (booking.orderStatus === "on_trip") {
    return "on_trip";
  }
  if (booking.modifiableUntil) {
    const timestamp = new Date(booking.modifiableUntil).getTime();
    if (!Number.isNaN(timestamp) && timestamp <= Date.now()) {
      return "past_editable_until";
    }
  }

  return null;
}

function deriveAvailableActions(
  booking: TenantBookingRuntimeRecord,
): ResourceActionDescriptor[] {
  if (Array.isArray(booking.availableActions)) {
    return booking.availableActions;
  }

  const readOnlyReasonCode = deriveReadOnlyReasonCode(booking);
  const cancelWindowOpen =
    booking.cancelableUntil == null ||
    new Date(booking.cancelableUntil).getTime() > Date.now();

  return [
    {
      action: "view_detail",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "update",
      enabled: readOnlyReasonCode == null,
      riskLevel: "medium",
      ...(readOnlyReasonCode ? { disabledReasonCode: readOnlyReasonCode } : {}),
    },
    {
      action: "cancel",
      enabled:
        !TERMINAL_ORDER_STATUSES.has(booking.orderStatus) && cancelWindowOpen,
      requiresReason: true,
      riskLevel: "high",
      ...(!cancelWindowOpen
        ? { disabledReasonCode: "past_cancelable_until" }
        : TERMINAL_ORDER_STATUSES.has(booking.orderStatus)
          ? { disabledReasonCode: "terminal_order_state" }
          : {}),
    },
  ];
}

function deriveSlaStatus(booking: TenantBookingRuntimeRecord) {
  if (booking.slaStatus !== undefined) {
    return booking.slaStatus;
  }
  if (ATTENTION_ORDER_STATUSES.has(booking.orderStatus)) {
    return "breach";
  }
  if (booking.approvalState === "pending") {
    return "at_risk";
  }

  return null;
}

function deriveCrossAppLinks(
  booking: TenantBookingRuntimeRecord,
): CrossAppResourceLink[] {
  if (Array.isArray(booking.crossAppLinks)) {
    return booking.crossAppLinks;
  }

  const links: CrossAppResourceLink[] = [];
  const source = getBookingSourceVisibility(booking);

  if (source.domain === "forwarded_authority") {
    links.push({
      targetApp: "ops-console",
      route: `/dispatch?orderId=${encodeURIComponent(booking.orderId)}`,
      resourceType: "owned_order",
      resourceId: booking.orderId,
      openMode: "new_tab",
      label: "在 Ops Console 查看 dispatch",
    });
  }

  if (booking.partnerEntrySlug) {
    links.push({
      targetApp: "platform-admin",
      route: `/partners/${encodeURIComponent(booking.partnerEntrySlug)}`,
      resourceType: "partner_entry",
      resourceId: booking.partnerEntrySlug,
      openMode: "new_tab",
      label: "在 Platform Admin 查看 partner entry",
    });
  }

  return links;
}

function normalizeBooking(
  booking: TenantBookingRuntimeRecord,
): TenantBookingListRecord {
  const availableActions = deriveAvailableActions(booking);

  return {
    ...booking,
    editableUntil: booking.editableUntil ?? booking.modifiableUntil,
    readOnlyReasonCode: deriveReadOnlyReasonCode(booking),
    availableActions,
    slaStatus: deriveSlaStatus(booking),
    crossAppLinks: deriveCrossAppLinks(booking),
  };
}

function getActionDescriptorsForRow(booking: TenantBookingListRecord) {
  const byAction = new Map(
    booking.availableActions.map((descriptor) => [
      descriptor.action,
      descriptor,
    ]),
  );

  return ACTION_ORDER.map((action) => byAction.get(action)).filter(
    (descriptor): descriptor is ResourceActionDescriptor => Boolean(descriptor),
  );
}

function getActionLabel(action: string) {
  return ACTION_COPY[action] ?? action.replaceAll("_", " ");
}

function getActionHref(
  booking: TenantBookingListRecord,
  descriptor: ResourceActionDescriptor,
) {
  if (descriptor.action === "view_detail") {
    return `/bookings/${booking.bookingId}`;
  }
  if (descriptor.action === "update" || descriptor.action === "cancel") {
    return `/bookings/${booking.bookingId}`;
  }

  return "/bookings";
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

function getFallbackRefresh(
  bookings: TenantBookingListRecord[],
): UiRefreshMetadata {
  const latestUpdatedAt =
    bookings
      .map((booking) => new Date(booking.updatedAt).getTime())
      .filter((value) => !Number.isNaN(value))
      .sort((left, right) => right - left)[0] ?? Date.now();

  return {
    generatedAt: new Date(latestUpdatedAt).toISOString(),
    staleAfterMs: 30_000,
    dataFreshness: bookings.length > 0 ? "fresh" : "unknown",
    source: "sandbox",
  };
}

function getRefreshTone(refresh: UiRefreshMetadata) {
  if (refresh.dataFreshness === "degraded") {
    return "is-warning";
  }
  if (refresh.dataFreshness === "stale") {
    return "is-active";
  }

  return "";
}

function getRefreshCopy(refresh: UiRefreshMetadata) {
  return [
    `T5 ${REFRESH_TIER.replaceAll("_", " ")}`,
    refresh.dataFreshness,
    `snapshot ${formatDateTime(refresh.generatedAt)}`,
    refresh.source,
  ].join(" · ");
}

function getApprovalCopy(booking: TenantBookingListRecord) {
  if (booking.approvalState === "pending") {
    return `待審批 · ${booking.approvalRequestIds.length} request`;
  }
  if (
    booking.approvalState === "rejected" ||
    booking.approvalState === "blocked"
  ) {
    return `審批 ${booking.approvalState}`;
  }

  return null;
}

function getServiceLabel(booking: TenantBookingListRecord) {
  return `${booking.serviceBucket} / ${booking.businessDispatchSubtype.replaceAll("_", " ")}`;
}

function getPageStatusTabs(bookings: TenantBookingListRecord[]) {
  const approvalCount = bookings.filter(
    (booking) => booking.approvalState === "pending",
  ).length;
  const reserveCount = bookings.filter((booking) =>
    RESERVATION_STATUSES.includes(booking.orderStatus),
  ).length;
  const liveCount = bookings.filter((booking) =>
    LIVE_ORDER_STATUSES.has(booking.orderStatus),
  ).length;
  const doneCount = bookings.filter(
    (booking) => booking.orderStatus === "completed",
  ).length;
  const cancelCount = bookings.filter(
    (booking) => booking.orderStatus === "cancelled",
  ).length;

  return [
    { label: "全部", value: bookings.length, href: "/bookings" },
    {
      label: "進行中",
      value: liveCount,
      href: `/bookings?status=${encodeURIComponent(
        OWNED_ORDER_STATUSES.filter((status) =>
          LIVE_ORDER_STATUSES.has(status),
        ).join(","),
      )}`,
    },
    {
      label: "預約",
      value: reserveCount,
      href: `/bookings?status=${encodeURIComponent(
        RESERVATION_STATUSES.join(","),
      )}`,
    },
    {
      label: "待審批",
      value: approvalCount,
      href: "/bookings?approval=pending",
    },
    {
      label: "已完成",
      value: doneCount,
      href: "/bookings?status=completed",
    },
    {
      label: "取消",
      value: cancelCount,
      href: "/bookings?status=cancelled",
    },
  ];
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = parseBookingListQuery(resolvedSearchParams);
  const focusedBookingId = first(resolvedSearchParams.bookingId);
  const notificationRef = first(resolvedSearchParams.notification);
  const emptyReasonOverride = parseEmptyReasonOverride(resolvedSearchParams);
  const client = getTenantClient();
  const bookingsResult = await Promise.allSettled([
    client.listTenantBookings() as Promise<
      TenantBookingRuntimeRecord[] | BookingListEnvelope
    >,
  ]);
  const bookingsSettled = bookingsResult[0];
  const listEnvelope =
    bookingsSettled.status === "fulfilled" &&
    !Array.isArray(bookingsSettled.value) &&
    Array.isArray(bookingsSettled.value.items)
      ? bookingsSettled.value
      : null;
  const rawBookings =
    bookingsSettled.status === "fulfilled"
      ? Array.isArray(bookingsSettled.value)
        ? bookingsSettled.value
        : bookingsSettled.value.items
      : [];
  const bookings = rawBookings.map(normalizeBooking);
  const result = applyBookingListQuery(bookings, query);
  const refreshMetadata = listEnvelope?.refresh ?? getFallbackRefresh(bookings);
  const emptyReason: TenantEmptyReason | null =
    emptyReasonOverride ??
    listEnvelope?.emptyState?.reason ??
    (bookingsSettled.status === "rejected"
      ? getEmptyReasonFromError(bookingsSettled.reason)
      : result.total === 0
        ? hasActiveFilters(resolvedSearchParams)
          ? "filtered_empty"
          : "no_data"
        : null);
  const emptyState = emptyReason ? EMPTY_STATE_COPY[emptyReason] : null;
  const pageTabs = getPageStatusTabs(bookings);
  const hasForwardedAuthority = result.items.some(
    (booking) =>
      getBookingSourceVisibility(booking).domain === "forwarded_authority",
  );

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
          <Link className="bookings-tab-chip" href={tab.href} key={tab.label}>
            <span>{tab.label}</span>
            <strong>{tab.value}</strong>
          </Link>
        ))}
      </div>

      {notificationRef || focusedBookingId ? (
        <CalloutPanel
          title="Notification deep link context"
          description="這個列表可以承接通知或快捷 deep link；若帶了 bookingId，對應列會被高亮，方便 tenant operator 直接 triage。"
        >
          <p>
            {notificationRef
              ? `notification=${notificationRef}`
              : "bookingId focus"}
          </p>
        </CalloutPanel>
      ) : null}

      {hasForwardedAuthority ? (
        <CalloutPanel
          title="Forwarded-authority bookings stay externally owned"
          description="forwarded bookings 在 tenant list 上可讀，但 adapter-native dispatch / recovery 仍需透過 ops-console 或 platform-admin 追查。"
          tone="warning"
        >
          <p>
            這些列會附上新分頁 deep link，直接打開對應的 ops dispatch 或 partner
            entry。
          </p>
        </CalloutPanel>
      ) : null}

      <section className="bookings-board">
        <div className="bookings-meta-strip">
          <span className="metric-label">Refresh tier</span>
          <span
            className={`status-chip ${getRefreshTone(refreshMetadata)}`.trim()}
          >
            {getRefreshCopy(refreshMetadata)}
          </span>
          <span className="status-chip">search / filter / detail open</span>
        </div>

        <form action="/bookings" className="bookings-filter-panel">
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
            <select defaultValue={query.service} name="service">
              <option value="all">All</option>
              <option value="business_dispatch">business_dispatch</option>
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

        <div className="bookings-status-strip">
          {OWNED_ORDER_STATUSES.map((status) => {
            const nextStatuses = toggleStatus(query.statuses, status);
            const href = `/bookings?${buildBookingListQueryString(query, {
              statuses: nextStatuses,
              page: 1,
            })}`;

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
                  <th>TYPE</th>
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
                            {rowActions.map((descriptor) =>
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
                          {booking.crossAppLinks.length > 0 ? (
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
                href={`/bookings?${buildBookingListQueryString(query, {
                  page: result.page - 1,
                })}`}
              >
                Previous
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link
                className="text-link"
                href={`/bookings?${buildBookingListQueryString(query, {
                  page: result.page + 1,
                })}`}
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
