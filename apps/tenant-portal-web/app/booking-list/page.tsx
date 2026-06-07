import Link from "next/link";
import type { BookingRecord } from "@drts/contracts";
import { OWNED_ORDER_STATUSES } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot } from "@/lib/rbac";
import { formatPortalUiError, toPortalErrorMessage } from "@/lib/error-copy";
import {
  applyBookingListQuery,
  buildBookingListQueryString,
  formatDateTime,
  formatMoney,
  parseBookingListQuery,
  toggleStatus,
} from "@/lib/booking-domain";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";
import { formatPortalCodeLabel } from "@/lib/localized-labels";

export const dynamic = "force-dynamic";

export default async function BookingListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
  const rawParams = await searchParams;
  const query = parseBookingListQuery(rawParams);

  let bookings: BookingRecord[] = [];
  let error: string | null =
    typeof rawParams.error === "string"
      ? formatPortalUiError(rawParams.error, "訂單列表載入失敗")
      : null;

  try {
    bookings = await client.listTenantBookings();
  } catch (e) {
    error = formatPortalUiError(toPortalErrorMessage(e), "無法載入訂單列表");
  }

  const result = applyBookingListQuery(bookings, query);
  const hasForwardedAuthority = result.items.some(
    (booking) =>
      getBookingSourceVisibility(booking).domain === "forwarded_authority",
  );

  return (
    <main className="app-grid">
      <AppShellCard
        title="訂單總覽"
        description="訂單列表會沿用共用查詢模型、標準訂單狀態、履約來源可見性與查看用明細入口。"
      >
        {error ? (
          <div className="error-banner">
            <strong>錯誤：</strong> {error}
          </div>
        ) : null}

        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">查詢</span>
            <h3>共用列表契約</h3>
            <p>
              搜尋、狀態、日期區間與分頁會遵循跨系統共用的 SharedListQueryV1
              查詢模型。狀態篩選只接受後端實際保存的 OwnedOrderStatus 值。
            </p>
            <form action="/booking-list" className="booking-query-form">
              <label className="booking-field">
                <span>搜尋</span>
                <input
                  defaultValue={query.q}
                  name="q"
                  placeholder="訂單編號、叫車單編號、乘客、路線、成本中心"
                  type="text"
                />
              </label>
              <label className="booking-field">
                <span>日期欄位</span>
                <select defaultValue={query.dateField} name="dateField">
                  <option value="reservationStart">預約開始</option>
                  <option value="createdAt">建立時間</option>
                </select>
              </label>
              <label className="booking-field">
                <span>起</span>
                <input
                  defaultValue={query.dateFrom}
                  name="dateFrom"
                  type="date"
                />
              </label>
              <label className="booking-field">
                <span>迄</span>
                <input defaultValue={query.dateTo} name="dateTo" type="date" />
              </label>
              <label className="booking-field">
                <span>每頁筆數</span>
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
              <div className="booking-form-actions">
                <button className="action-button-primary" type="submit">
                  套用篩選
                </button>
                <Link className="action-button-secondary" href="/booking-list">
                  清除
                </Link>
              </div>
            </form>
          </article>

          <article className="surface-card">
            <span className="surface-kicker">狀態</span>
            <h3>訂單狀態維持標準值</h3>
            <p>
              這排 chip 會切換標準 OwnedOrderStatus 篩選。服務類型、履約來源
              與租戶專屬標籤都不會取代核心流程詞彙。
            </p>
            <div className="chip-row">
              {OWNED_ORDER_STATUSES.map((status) => {
                const nextStatuses = toggleStatus(query.statuses, status);
                const queryString = buildBookingListQueryString(query, {
                  statuses: nextStatuses,
                  page: 1,
                });
                const href = queryString
                  ? `/booking-list?${queryString}`
                  : "/booking-list";
                const isActive = query.statuses.includes(status);
                return (
                  <Link
                    className={`status-chip${isActive ? " is-active" : ""}`}
                    href={href}
                    key={status}
                  >
                    {formatPortalCodeLabel(status, status)}
                    <span> · {result.statusCounts[status] ?? 0}</span>
                  </Link>
                );
              })}
            </div>
            {roleSnapshot.capabilities.canWriteTenant ? (
              <div className="link-row">
                <Link className="text-link" href="/bookings/new">
                  建立新訂單
                </Link>
              </div>
            ) : (
              <p className="muted-copy">
                目前角色可以查看訂單，但不能建立新訂單。
              </p>
            )}
          </article>
        </section>

        <article className="surface-card">
          <span className="surface-kicker">列表</span>
          <h3>{`目前顯示 ${result.total} 筆中的 ${result.items.length} 筆訂單`}</h3>
          <p>
            列表資料讀自 <code>/api/tenant/bookings</code>。可執行的操作會限制在
            租戶權限允許的指令；更深入的履約脈絡、車資／發票關聯與時間線資訊，
            會放在訂單明細頁。
          </p>
          {hasForwardedAuthority ? (
            <article className="callout-panel is-warning">
              <strong>轉送訂單仍維持外部平台權限</strong>
              <p>
                租戶端會保留可閱讀的業務訂單紀錄，但外部平台原生的生命週期與
                平台恢復處理仍屬於營運與司機路徑。
              </p>
            </article>
          ) : null}

          {result.items.length > 0 ? (
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>訂單</th>
                    <th>乘客</th>
                    <th>預約時段</th>
                    <th>狀態</th>
                    <th>履約</th>
                    <th>路線</th>
                    <th>車資</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((booking) => {
                    const source = getBookingSourceVisibility(booking);
                    return (
                      <tr key={booking.bookingId}>
                        <td>
                          <Link
                            className="text-link"
                            href={`/booking-list/${booking.bookingId}`}
                          >
                            {booking.bookingId}
                          </Link>
                          <div className="source-detail">
                            叫車單 {booking.orderId}
                          </div>
                        </td>
                        <td>
                          {booking.passenger.name}
                          <div className="source-detail">
                            {booking.passenger.phone}
                          </div>
                        </td>
                        <td>
                          {formatDateTime(booking.reservationWindowStart)}
                          <div className="source-detail">
                            至 {formatDateTime(booking.reservationWindowEnd)}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`status-badge status-${booking.orderStatus}`}
                          >
                            {formatPortalCodeLabel(
                              booking.orderStatus,
                              booking.orderStatus,
                            )}
                          </span>
                          <div className="source-detail">
                            訂單紀錄{" "}
                            {formatPortalCodeLabel(
                              booking.status,
                              booking.status,
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={getSourceToneClassName(source.tone)}>
                            {source.badge}
                          </span>
                          <div className="source-detail">{source.summary}</div>
                        </td>
                        <td>
                          {booking.pickup.address}
                          <div className="source-detail">
                            → {booking.dropoff.address}
                          </div>
                        </td>
                        <td>{formatMoney(booking.quotedFare)}</td>
                        <td>
                          <Link
                            className="text-link"
                            href={`/booking-list/${booking.bookingId}`}
                          >
                            查看明細
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">
              目前沒有符合查詢條件的訂單。可嘗試清除狀態篩選或放寬搜尋區間。
            </p>
          )}

          <div className="booking-pagination">
            <span className="muted-copy">
              第 {result.page} 頁，共 {result.totalPages} 頁
            </span>
            <div className="link-row">
              {result.page > 1 ? (
                <Link
                  className="text-link"
                  href={`/booking-list?${buildBookingListQueryString(query, {
                    page: result.page - 1,
                  })}`}
                >
                  上一頁
                </Link>
              ) : null}
              {result.page < result.totalPages ? (
                <Link
                  className="text-link"
                  href={`/booking-list?${buildBookingListQueryString(query, {
                    page: result.page + 1,
                  })}`}
                >
                  下一頁
                </Link>
              ) : null}
            </div>
          </div>
        </article>

        <section className="callout-panel">
          <strong>權限邊界</strong>
          <p>
            這個列表不會自行發明租戶專用流程別名。狀態會對應標準
            OwnedOrderStatus，車資來自訂單本身，更深入的派遣追蹤仍屬於營運
            控制台權限路徑。
          </p>
        </section>

        <Link className="route-link" href="/">
          <strong>返回首頁</strong>
          回到租戶入口總覽。
        </Link>
      </AppShellCard>
    </main>
  );
}
