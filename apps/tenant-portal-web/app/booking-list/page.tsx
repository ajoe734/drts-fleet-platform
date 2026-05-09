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
    typeof rawParams.error === "string" ? rawParams.error : null;

  try {
    bookings = await client.listTenantBookings();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const result = applyBookingListQuery(bookings, query);
  const hasForwardedAuthority = result.items.some(
    (booking) =>
      getBookingSourceVisibility(booking).domain === "forwarded_authority",
  );

  return (
    <main className="app-grid">
      <AppShellCard
        title="Booking oversight"
        description="Booking list aligned to the new tenant console model: shared filter shape, canonical OwnedOrderStatus, fulfillment source visibility, fare context, and view-only deep link into the productized detail surface."
      >
        {error ? (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        ) : null}

        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">Query</span>
            <h3>Shared list contract</h3>
            <p>
              Search, status, date window, and pagination follow the
              SharedListQueryV1 vocabulary recommended by the cross-system
              filter normalization packet (XS-UI-004). Status accepts only
              persisted backend OwnedOrderStatus values.
            </p>
            <form action="/booking-list" className="booking-query-form">
              <label className="booking-field">
                <span>Search</span>
                <input
                  defaultValue={query.q}
                  name="q"
                  placeholder="Booking ID, order ID, passenger, route, cost center"
                  type="text"
                />
              </label>
              <label className="booking-field">
                <span>Date field</span>
                <select defaultValue={query.dateField} name="dateField">
                  <option value="reservationStart">Reservation start</option>
                  <option value="createdAt">Created at</option>
                </select>
              </label>
              <label className="booking-field">
                <span>From</span>
                <input
                  defaultValue={query.dateFrom}
                  name="dateFrom"
                  type="date"
                />
              </label>
              <label className="booking-field">
                <span>To</span>
                <input defaultValue={query.dateTo} name="dateTo" type="date" />
              </label>
              <label className="booking-field">
                <span>Page size</span>
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
                  Apply filters
                </button>
                <Link className="action-button-secondary" href="/booking-list">
                  Reset
                </Link>
              </div>
            </form>
          </article>

          <article className="surface-card">
            <span className="surface-kicker">Status</span>
            <h3>Order status stays canonical</h3>
            <p>
              The chip row toggles canonical OwnedOrderStatus filters. Service
              buckets, fulfillment source, and tenant-only labels never replace
              the workflow vocabulary.
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
                    {status}
                    <span> · {result.statusCounts[status] ?? 0}</span>
                  </Link>
                );
              })}
            </div>
            {roleSnapshot.capabilities.canWriteTenant ? (
              <div className="link-row">
                <Link className="text-link" href="/bookings/new">
                  Start new booking intake
                </Link>
              </div>
            ) : (
              <p className="muted-copy">
                Current role can review bookings but cannot create new ones.
              </p>
            )}
          </article>
        </section>

        <article className="surface-card">
          <span className="surface-kicker">List</span>
          <h3>{`Showing ${result.items.length} of ${result.total} booking row(s)`}</h3>
          <p>
            The list reads <code>/api/tenant/bookings</code>. Mutate actions are
            limited to authority-safe commands; deeper fulfillment trace,
            fare/invoice linkage, and timeline context belong on the booking
            detail page.
          </p>
          {hasForwardedAuthority ? (
            <article className="callout-panel is-warning">
              <strong>
                Forwarded bookings keep external-platform authority
              </strong>
              <p>
                Tenant booking oversight keeps the business record readable, but
                adapter-native lifecycle states and platform recovery still
                belong to ops and driver routes.
              </p>
              <p>
                <code>accept_pending</code>, <code>confirmed_by_platform</code>,
                <code>lost_race</code>, <code>cancelled_by_platform</code>, and
                <code>sync_failed</code> never become tenant workflow actions on
                this surface.
              </p>
            </article>
          ) : null}

          {result.items.length > 0 ? (
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Passenger</th>
                    <th>Reservation</th>
                    <th>Status</th>
                    <th>Fulfillment</th>
                    <th>Route</th>
                    <th>Fare</th>
                    <th>Action</th>
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
                            Order {booking.orderId}
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
                            to {formatDateTime(booking.reservationWindowEnd)}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`status-badge status-${booking.orderStatus}`}
                          >
                            {booking.orderStatus}
                          </span>
                          <div className="source-detail">
                            Booking {booking.status}
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
                            View detail
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
              No booking matched the current query. Try clearing status chips or
              broadening the search window.
            </p>
          )}

          <div className="booking-pagination">
            <span className="muted-copy">
              Page {result.page} of {result.totalPages}
            </span>
            <div className="link-row">
              {result.page > 1 ? (
                <Link
                  className="text-link"
                  href={`/booking-list?${buildBookingListQueryString(query, {
                    page: result.page - 1,
                  })}`}
                >
                  Previous
                </Link>
              ) : null}
              {result.page < result.totalPages ? (
                <Link
                  className="text-link"
                  href={`/booking-list?${buildBookingListQueryString(query, {
                    page: result.page + 1,
                  })}`}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        </article>

        <section className="callout-panel">
          <strong>Authority boundary</strong>
          <p>
            The list never invents tenant-local workflow aliases. Status maps to
            canonical OwnedOrderStatus values, fare values come from the booking
            record, and deeper dispatch trace belongs to the ops console
            authority lane.
          </p>
        </section>

        <Link className="route-link" href="/">
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
