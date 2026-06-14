import Link from "next/link";
import type { BookingRecord } from "@drts/contracts";
import { OWNED_ORDER_STATUSES } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot } from "@/lib/rbac";
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
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function BookingListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
  const rawParams = await searchParams;
  const query = parseBookingListQuery(rawParams);

  let bookings: BookingRecord[] = [];
  let error: string | null =
    typeof rawParams.error === "string" ? rawParams.error : null;

  try {
    bookings = await client.listTenantBookings();
  } catch (e) {
    error = e instanceof Error ? e.message : t("bookingList.error.unknown", locale);
  }

  const result = applyBookingListQuery(bookings, query);
  const hasForwardedAuthority = result.items.some(
    (booking) =>
      getBookingSourceVisibility(booking, locale).domain ===
      "forwarded_authority",
  );

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("bookingList.page.title", locale)}
        description={t("bookingList.page.description", locale)}
      >
        {error ? (
          <div className="error-banner">
            <strong>{t("bookingList.error.label", locale)}</strong> {error}
          </div>
        ) : null}

        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">{t("bookingList.query.kicker", locale)}</span>
            <h3>{t("bookingList.query.heading", locale)}</h3>
            <p>{t("bookingList.query.body", locale)}</p>
            <form action="/booking-list" className="booking-query-form">
              <label className="booking-field">
                <span>{t("bookingList.field.search", locale)}</span>
                <input
                  defaultValue={query.q}
                  name="q"
                  placeholder={t("bookingList.field.searchPlaceholder", locale)}
                  type="text"
                />
              </label>
              <label className="booking-field">
                <span>{t("bookingList.field.dateField", locale)}</span>
                <select defaultValue={query.dateField} name="dateField">
                  <option value="reservationStart">{t("bookingList.field.reservationStart", locale)}</option>
                  <option value="createdAt">{t("bookingList.field.createdAt", locale)}</option>
                </select>
              </label>
              <label className="booking-field">
                <span>{t("bookingList.field.from", locale)}</span>
                <input
                  defaultValue={query.dateFrom}
                  name="dateFrom"
                  type="date"
                />
              </label>
              <label className="booking-field">
                <span>{t("bookingList.field.to", locale)}</span>
                <input defaultValue={query.dateTo} name="dateTo" type="date" />
              </label>
              <label className="booking-field">
                <span>{t("bookingList.field.pageSize", locale)}</span>
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
                  {t("bookingList.action.applyFilters", locale)}
                </button>
                <Link className="action-button-secondary" href="/booking-list">
                  {t("bookingList.action.reset", locale)}
                </Link>
              </div>
            </form>
          </article>

          <article className="surface-card">
            <span className="surface-kicker">{t("bookingList.status.kicker", locale)}</span>
            <h3>{t("bookingList.status.heading", locale)}</h3>
            <p>{t("bookingList.status.body", locale)}</p>
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
                    {status}
                    <span> · {result.statusCounts[status] ?? 0}</span>
                  </Link>
                );
              })}
            </div>
            {roleSnapshot.capabilities.canWriteTenant ? (
              <div className="link-row">
                <Link className="text-link" href="/bookings/new">
                  {t("bookingList.action.startIntake", locale)}
                </Link>
              </div>
            ) : (
              <p className="muted-copy">
                {t("bookingList.status.readOnlyNote", locale)}
              </p>
            )}
          </article>
        </section>

        <article className="surface-card">
          <span className="surface-kicker">{t("bookingList.list.kicker", locale)}</span>
          <h3>
            {t("bookingList.list.showing", locale, {
              shown: result.items.length,
              total: result.total,
            })}
          </h3>
          <p>
            {t("bookingList.list.bodyPrefix", locale)}{" "}
            <code>/api/tenant/bookings</code>
            {t("bookingList.list.bodySuffix", locale)}
          </p>
          {hasForwardedAuthority ? (
            <article className="callout-panel is-warning">
              <strong>{t("bookingList.forwarded.title", locale)}</strong>
              <p>{t("bookingList.forwarded.body", locale)}</p>
              <p>
                <code>accept_pending</code>, <code>confirmed_by_platform</code>,
                <code>lost_race</code>, <code>cancelled_by_platform</code>, and
                <code>sync_failed</code>{" "}
                {t("bookingList.forwarded.statesNote", locale)}
              </p>
            </article>
          ) : null}

          {result.items.length > 0 ? (
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("bookingList.column.booking", locale)}</th>
                    <th>{t("bookingList.column.passenger", locale)}</th>
                    <th>{t("bookingList.column.reservation", locale)}</th>
                    <th>{t("bookingList.column.status", locale)}</th>
                    <th>{t("bookingList.column.fulfillment", locale)}</th>
                    <th>{t("bookingList.column.route", locale)}</th>
                    <th>{t("bookingList.column.fare", locale)}</th>
                    <th>{t("bookingList.column.action", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((booking) => {
                    const source = getBookingSourceVisibility(booking, locale);
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
                            {t("bookingList.cell.order", locale, {
                              orderId: booking.orderId,
                            })}
                          </div>
                        </td>
                        <td>
                          {booking.passenger.name}
                          <div className="source-detail">
                            {booking.passenger.phone}
                          </div>
                        </td>
                        <td>
                          {formatDateTime(booking.reservationWindowStart, locale)}
                          <div className="source-detail">
                            {t("bookingList.cell.to", locale, {
                              value: formatDateTime(
                                booking.reservationWindowEnd,
                                locale,
                              ),
                            })}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`status-badge status-${booking.orderStatus}`}
                          >
                            {booking.orderStatus}
                          </span>
                          <div className="source-detail">
                            {t("bookingList.cell.booking", locale, {
                              status: booking.status,
                            })}
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
                        <td>{formatMoney(booking.quotedFare, locale)}</td>
                        <td>
                          <Link
                            className="text-link"
                            href={`/booking-list/${booking.bookingId}`}
                          >
                            {t("bookingList.action.viewDetail", locale)}
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
              {t("bookingList.empty.list", locale)}
            </p>
          )}

          <div className="booking-pagination">
            <span className="muted-copy">
              {t("bookingList.pagination.page", locale, {
                page: result.page,
                totalPages: result.totalPages,
              })}
            </span>
            <div className="link-row">
              {result.page > 1 ? (
                <Link
                  className="text-link"
                  href={`/booking-list?${buildBookingListQueryString(query, {
                    page: result.page - 1,
                  })}`}
                >
                  {t("bookingList.pagination.previous", locale)}
                </Link>
              ) : null}
              {result.page < result.totalPages ? (
                <Link
                  className="text-link"
                  href={`/booking-list?${buildBookingListQueryString(query, {
                    page: result.page + 1,
                  })}`}
                >
                  {t("bookingList.pagination.next", locale)}
                </Link>
              ) : null}
            </div>
          </div>
        </article>

        <section className="callout-panel">
          <strong>{t("bookingList.authority.title", locale)}</strong>
          <p>{t("bookingList.authority.body", locale)}</p>
        </section>

        <Link className="route-link" href="/">
          <strong>{t("bookingList.backHome.title", locale)}</strong>
          {t("bookingList.backHome.body", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}
