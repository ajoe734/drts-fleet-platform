import Link from "next/link";
import type {
  BookingRecord,
  EmptyReason,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { OWNED_ORDER_STATUSES } from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import {
  applyBookingListQuery,
  buildBookingListQueryString,
  parseBookingListQuery,
  toggleStatus,
} from "@/lib/booking-list";
import {
  BOOKING_LIST_ACTION_HREFS,
  BOOKING_LIST_ACTION_LABELS,
  BOOKING_LIST_PAGE_ACTIONS,
  BOOKING_LIST_REFRESH_TIER,
  BOOKING_TABS,
  REFRESH_TIER_CADENCE_LABEL,
  buildRefreshMetadata,
  countBookingsByTab,
  filterBookingsByTab,
  getBookingCrossAppLink,
  getBookingEditability,
  getBookingRowActions,
  getEmptyStateView,
  getRefreshFreshnessView,
  isApprovalRequired,
  parseBookingTab,
  parseEmptyReasonOverride,
} from "@/lib/bookings-runtime";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";

export const dynamic = "force-dynamic";

type FetchOutcome =
  | { ok: true; bookings: BookingRecord[] }
  | { ok: false; bookings: BookingRecord[] };

async function loadBookings(): Promise<FetchOutcome> {
  try {
    const bookings = await getTenantClient().listTenantBookings();
    return { ok: true, bookings };
  } catch {
    return { ok: false, bookings: [] };
  }
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = parseBookingListQuery(params);
  const tab = parseBookingTab(params.tab);
  const emptyOverride = parseEmptyReasonOverride(params.empty);

  const outcome = await loadBookings();
  const tabFiltered = filterBookingsByTab(outcome.bookings, tab);
  const result = applyBookingListQuery(tabFiltered, query);
  const tabCounts = countBookingsByTab(outcome.bookings);

  const hasFilters =
    query.q.length > 0 ||
    query.statuses.length > 0 ||
    query.dateFrom.length > 0 ||
    query.dateTo.length > 0 ||
    tab !== "all";

  const derivedReason = !outcome.ok
    ? "fetch_failed"
    : result.items.length === 0
      ? hasFilters
        ? "filtered_empty"
        : outcome.bookings.length === 0
          ? "no_data"
          : "filtered_empty"
      : null;
  const emptyReason = emptyOverride ?? derivedReason;
  const emptyView = emptyReason ? getEmptyStateView(emptyReason) : null;

  const refreshMeta = buildRefreshMetadata(
    new Date(),
    "live",
    outcome.ok ? "fresh" : "degraded",
  );
  const freshness = getRefreshFreshnessView(refreshMeta);

  const forwardedAuthorityRows = result.items.filter(
    (booking) =>
      getBookingSourceVisibility(booking).domain === "forwarded_authority",
  );

  const buildTabHref = (nextTab: string) => {
    const queryString = buildBookingListQueryString(query, { page: 1 });
    const params = new URLSearchParams(queryString);
    if (nextTab !== "all") {
      params.set("tab", nextTab);
    } else {
      params.delete("tab");
    }
    const serialized = params.toString();
    return serialized ? `/bookings?${serialized}` : "/bookings";
  };

  const buildPageHref = (nextPage: number) => {
    const queryString = buildBookingListQueryString(query, { page: nextPage });
    const params = new URLSearchParams(queryString);
    if (tab !== "all") {
      params.set("tab", tab);
    }
    const serialized = params.toString();
    return serialized ? `/bookings?${serialized}` : "/bookings";
  };

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Bookings · 訂單"
        title="租戶訂單列表 · 同步 command (Q-TEN04) · availableActions 驅動 CTA (Q-X13)"
        description="本月所有預約 · 含進行中與已完成。狀態 chip 對應 canonical OwnedOrderStatus；可編輯性由 availableActions + editableUntil 決定 (Q-TEN05)。"
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker={`Refresh · T5 · ${REFRESH_TIER_CADENCE_LABEL[BOOKING_LIST_REFRESH_TIER]}`}
          title={`${freshness.label} · 自動 30s 刷新`}
          description={freshness.detail}
        >
          <p className="muted-copy">
            產生時間 {formatDateTime(refreshMeta.generatedAt)} · source ={" "}
            {refreshMeta.source} · staleAfterMs = {refreshMeta.staleAfterMs}
          </p>
        </SurfaceCard>

        <SurfaceCard
          kicker="Actions · availableActions"
          title="頁面層級 CTA"
          description="CTA 不從角色推導，而是由 ResourceActionDescriptor[] 驅動 (Q-X13)。"
        >
          <div className="link-row">
            {BOOKING_LIST_PAGE_ACTIONS.map((descriptor) => (
              <PageActionButton
                key={descriptor.action}
                descriptor={descriptor}
              />
            ))}
          </div>
          <p className="action-note">
            高風險 (cancel) 動作位於詳情頁；列表只承擔 medium / low 風險的
            create / filter / export。
          </p>
        </SurfaceCard>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Tabs"
          title="訂單分頁 · 對應 canvas Tenant Console.html"
          description="approval bucket 由 approvalState=pending 驅動 (Q-TEN12)；live / reserve 由 OwnedOrderStatus 決定。"
        >
          <div className="chip-row">
            {BOOKING_TABS.map((descriptor) => {
              const isActive = descriptor.id === tab;
              return (
                <Link
                  className={`status-chip${isActive ? " is-active" : ""}${descriptor.tone === "warn" ? " is-warning" : ""}`}
                  href={buildTabHref(descriptor.id)}
                  key={descriptor.id}
                >
                  {descriptor.labelZh} · {descriptor.labelEn}
                  <span>{tabCounts[descriptor.id]}</span>
                </Link>
              );
            })}
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Query"
          title="共用 list-query 詞彙"
          description="Search / OwnedOrderStatus / date / pageSize 都使用 XS-UI-004 的 normalized vocabulary。"
        >
          <form action="/bookings" className="query-form" id="filters">
            <input name="tab" type="hidden" value={tab} />
            <label className="field-stack">
              <span>Search · 搜尋</span>
              <input
                defaultValue={query.q}
                name="q"
                placeholder="Booking ID, order ID, passenger, route"
              />
            </label>
            <label className="field-stack">
              <span>Date field · 日期欄位</span>
              <select defaultValue={query.dateField} name="dateField">
                <option value="reservationStart">Reservation start</option>
                <option value="createdAt">Created at</option>
              </select>
            </label>
            <label className="field-stack">
              <span>From · 自</span>
              <input
                defaultValue={query.dateFrom}
                name="dateFrom"
                type="date"
              />
            </label>
            <label className="field-stack">
              <span>To · 至</span>
              <input defaultValue={query.dateTo} name="dateTo" type="date" />
            </label>
            <label className="field-stack">
              <span>Page size · 每頁筆數</span>
              <select defaultValue={String(query.pageSize)} name="pageSize">
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
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
                Apply filters
              </button>
              <Link
                className="action-button action-button-secondary"
                href="/bookings"
              >
                Reset
              </Link>
            </div>
          </form>
        </SurfaceCard>
      </section>

      <SurfaceCard
        kicker="Status · OwnedOrderStatus"
        title="狀態 chip · canonical 訂單狀態"
        description="租戶列表只能用 backend-owned 訂單狀態做篩選 (Q-X13)，不引入 service buckets 或 tenant-local 別名。"
      >
        <div className="chip-row">
          {OWNED_ORDER_STATUSES.map((status) => {
            const nextStatuses = toggleStatus(query.statuses, status);
            const queryString = buildBookingListQueryString(query, {
              statuses: nextStatuses,
              page: 1,
            });
            const params = new URLSearchParams(queryString);
            if (tab !== "all") {
              params.set("tab", tab);
            }
            const serialized = params.toString();
            const href = serialized ? `/bookings?${serialized}` : "/bookings";
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
      </SurfaceCard>

      <SurfaceCard
        kicker="List"
        title={`顯示 ${result.items.length} / ${result.total} 筆訂單 · tab=${tab}`}
        description="此列表為唯讀面板；update / cancel / 高風險動作落在詳情頁與 commands 端點 (Q-TEN04)。"
      >
        {forwardedAuthorityRows.length > 0 ? (
          <CalloutPanel
            title="Forwarded 訂單 · 外部平台保留 dispatch 權威"
            description="Q-DRV04 / forwarded_authority — tenant 列表保留可讀的業務紀錄；adapter-native 生命週期狀態與平台復原仍在 ops / driver 路線。"
            tone="warning"
          >
            <p>
              <code>accept_pending</code>、<code>confirmed_by_platform</code>、
              <code>lost_race</code>、<code>cancelled_by_platform</code>、
              <code>sync_failed</code> 不會在此列表轉成 tenant workflow 動作。
            </p>
          </CalloutPanel>
        ) : null}

        {emptyView ? (
          <BookingEmptyState emptyReason={emptyView.envelope.reason} />
        ) : (
          <div className="table-wrap">
            <table className="data-grid">
              <thead>
                <tr>
                  <th>Booking · BK</th>
                  <th>Passenger · 乘客</th>
                  <th>Reservation · 預約時段</th>
                  <th>Status · 狀態</th>
                  <th>Fulfillment · 來源</th>
                  <th>Route · 起 / 迄</th>
                  <th>Fare · 報價</th>
                  <th>editableUntil · 可編輯期限</th>
                  <th>Actions · 動作</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((booking) => (
                  <BookingRow key={booking.bookingId} booking={booking} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination-row">
          <span className="muted-copy">
            Page {result.page} of {result.totalPages}
          </span>
          <div className="link-row">
            {result.page > 1 ? (
              <Link className="text-link" href={buildPageHref(result.page - 1)}>
                Previous
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link className="text-link" href={buildPageHref(result.page + 1)}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard
        kicker="EmptyReason · Q-X15"
        title="六種 EmptyReason 視覺檢視"
        description="後端 list response 會在 items 為空時帶 EmptyStateEnvelope；以下連結強制渲染各種 reason，視覺團隊可驗證每種狀態都有獨立 copy + CTA。"
      >
        <div className="chip-row">
          {(
            [
              "no_data",
              "not_provisioned",
              "fetch_failed",
              "permission_denied",
              "external_unavailable",
              "filtered_empty",
            ] as const
          ).map((reason) => (
            <Link
              className={`status-chip${emptyReason === reason ? " is-active" : ""}`}
              href={`/bookings?empty=${reason}`}
              key={reason}
            >
              {reason}
            </Link>
          ))}
        </div>
        <p className="muted-copy">
          目前顯示: {emptyReason ?? "(無 — 列表有資料)"}
        </p>
      </SurfaceCard>

      <CalloutPanel
        title="Authority boundary · 權威邊界"
        description="本列表直接消費 /api/tenant/bookings*，狀態與 OwnedOrderStatus[] 對齊，不引入 tenant-local workflow 別名。Forwarded 訂單的 deep link 跨應用到 ops-console 開新分頁 (Q-X03)。"
      />
    </div>
  );
}

function PageActionButton({
  descriptor,
}: {
  descriptor: ResourceActionDescriptor;
}) {
  const label =
    BOOKING_LIST_ACTION_LABELS[descriptor.action] ?? descriptor.action;
  const href = BOOKING_LIST_ACTION_HREFS[descriptor.action] ?? "#";
  const variantClass =
    descriptor.riskLevel === "medium"
      ? "action-button-primary"
      : "action-button-secondary";

  if (!descriptor.enabled) {
    return (
      <button
        className={`action-button ${variantClass}`}
        disabled
        title={descriptor.disabledReasonCode ?? "disabled"}
        type="button"
      >
        {label}
      </button>
    );
  }

  return (
    <Link
      aria-label={`${label} · risk=${descriptor.riskLevel}`}
      className={`action-button ${variantClass}`}
      href={href}
    >
      {label}
    </Link>
  );
}

function BookingRow({ booking }: { booking: BookingRecord }) {
  const source = getBookingSourceVisibility(booking);
  const editability = getBookingEditability(booking);
  const actions = getBookingRowActions(booking);
  const crossAppLink = getBookingCrossAppLink(booking);
  const approvalNeeded = isApprovalRequired(booking);

  const editableUntilLabel = editability.editableUntil
    ? editability.isEditable
      ? `${formatDateTime(editability.editableUntil)} · 剩 ${editability.urgencyMinutes ?? 0} 分鐘`
      : `已過 · ${formatDateTime(editability.editableUntil)}`
    : "—";

  return (
    <tr>
      <td>
        <div className="table-primary">
          <Link className="text-link" href={`/bookings/${booking.bookingId}`}>
            {booking.bookingId}
          </Link>
          <span className="table-secondary">
            Order {booking.orderId} · {booking.businessDispatchSubtype}
          </span>
          {approvalNeeded ? (
            <span className="status-badge is-warning">待審批</span>
          ) : null}
        </div>
      </td>
      <td>
        <div className="table-primary">
          {booking.passenger.name}
          <span className="table-secondary">{booking.passenger.phone}</span>
        </div>
      </td>
      <td>
        <div className="table-primary">
          {formatDateTime(booking.reservationWindowStart)}
          <span className="table-secondary">
            to {formatDateTime(booking.reservationWindowEnd)}
          </span>
        </div>
      </td>
      <td>
        <div className="table-primary">
          <span className="status-badge">{booking.orderStatus}</span>
          <span className="table-secondary">
            Booking {booking.status} · approval {booking.approvalState}
          </span>
        </div>
      </td>
      <td>
        <div className="table-primary">
          <span className={getSourceToneClassName(source.tone)}>
            {source.badge}
          </span>
          <span className="table-secondary">{source.summary}</span>
          {crossAppLink ? (
            <a
              className="text-link"
              href={crossAppLink.route}
              rel="noopener noreferrer"
              target={crossAppLink.openMode === "new_tab" ? "_blank" : "_self"}
            >
              {crossAppLink.label} ↗
            </a>
          ) : null}
        </div>
      </td>
      <td>
        <div className="table-primary">
          {booking.pickup.address}
          <span className="table-secondary">{booking.dropoff.address}</span>
        </div>
      </td>
      <td>{formatMoney(booking.quotedFare)}</td>
      <td>
        <div className="table-primary">
          <span
            className={
              editability.isEditable ? "status-badge" : "table-secondary"
            }
          >
            {editableUntilLabel}
          </span>
          {!editability.isEditable && editability.readOnlyReasonCode ? (
            <span className="table-secondary">
              readOnly: {editability.readOnlyReasonCode}
            </span>
          ) : null}
        </div>
      </td>
      <td>
        <div className="row-actions">
          {actions.map((action) => (
            <BookingRowAction
              action={action}
              bookingId={booking.bookingId}
              key={action.action}
            />
          ))}
        </div>
      </td>
    </tr>
  );
}

function BookingRowAction({
  action,
  bookingId,
}: {
  action: ResourceActionDescriptor;
  bookingId: string;
}) {
  const label = BOOKING_LIST_ACTION_LABELS[action.action] ?? action.action;

  if (action.action === "view_detail") {
    return (
      <Link className="text-link" href={`/bookings/${bookingId}`}>
        {label}
      </Link>
    );
  }

  if (!action.enabled) {
    return (
      <button
        className="action-button action-button-secondary"
        disabled
        title={action.disabledReasonCode ?? "disabled"}
        type="button"
      >
        {label}
      </button>
    );
  }

  const className =
    action.riskLevel === "high"
      ? "action-button action-button-danger"
      : "action-button action-button-secondary";

  return (
    <Link
      aria-label={`${label} · risk=${action.riskLevel}${action.requiresReason ? " · requiresReason" : ""}`}
      className={className}
      href={`/bookings/${bookingId}`}
    >
      {label}
    </Link>
  );
}

function BookingEmptyState({ emptyReason }: { emptyReason: EmptyReason }) {
  const view = getEmptyStateView(emptyReason);
  return (
    <div className="empty-panel">
      <strong>{view.title}</strong>
      <p>{view.description}</p>
      <p className="muted-copy">
        reason = <code>{view.envelope.reason}</code> · messageCode ={" "}
        <code>{view.envelope.messageCode}</code>
      </p>
      {view.envelope.nextAction && view.ctaLabel && view.ctaHref ? (
        <Link
          className="action-button action-button-primary"
          href={view.ctaHref}
        >
          {view.ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}
