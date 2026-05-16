import Link from "next/link";
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
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const client = getTenantClient();
  const query = parseBookingListQuery(await searchParams);
  const bookings = await client.listTenantBookings();
  const result = applyBookingListQuery(bookings, query);
  const hasForwardedAuthority = result.items.some(
    (booking) =>
      getBookingSourceVisibility(booking).domain === "forwarded_authority",
  );

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Bookings"
        title="Tenant booking oversight now uses the shared list-query model and the canonical `/bookings` route."
        description="`status` is mapped to real `OwnedOrderStatus` values, `dateField` defaults to reservation start, and the list deep-links directly into the productized detail surface."
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Query"
          title="Shared list contract"
          description="Search, order-status filtering, date controls, and pagination all reuse the normalized query vocabulary from `XS-UI-004`."
        >
          <form action="/bookings" className="query-form">
            <label className="field-stack">
              <span>Search</span>
              <input
                defaultValue={query.q}
                name="q"
                placeholder="Booking ID, order ID, passenger, route"
              />
            </label>
            <label className="field-stack">
              <span>Date field</span>
              <select defaultValue={query.dateField} name="dateField">
                <option value="reservationStart">Reservation start</option>
                <option value="createdAt">Created at</option>
              </select>
            </label>
            <label className="field-stack">
              <span>From</span>
              <input
                defaultValue={query.dateFrom}
                name="dateFrom"
                type="date"
              />
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

        <SurfaceCard
          kicker="Status"
          title="Order status stays canonical"
          description="The tenant list can filter only by backend-owned order statuses. Service buckets and local labels never replace the true workflow vocabulary."
        >
          <div className="chip-row">
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
        </SurfaceCard>
      </section>

      <SurfaceCard
        kicker="List"
        title={`Showing ${result.items.length} of ${result.total} booking row(s)`}
        description="The list remains a read surface over `/api/tenant/bookings`; mutate actions stay on supported commands only, and deeper fulfillment trace belongs in detail."
      >
        {hasForwardedAuthority ? (
          <CalloutPanel
            title="Forwarded bookings keep external-platform authority"
            description="Tenant booking oversight keeps the business record readable, but adapter-native lifecycle states and platform recovery still belong to ops and driver routes."
            tone="warning"
          >
            <p>
              `accept_pending`, `confirmed_by_platform`, `lost_race`,
              `cancelled_by_platform`, and `sync_failed` do not become tenant
              workflow actions on this surface.
            </p>
          </CalloutPanel>
        ) : null}
        <div className="table-wrap">
          <table className="data-grid">
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
                      <div className="table-primary">
                        <Link
                          className="text-link"
                          href={`/bookings/${booking.bookingId}`}
                        >
                          {booking.bookingId}
                        </Link>
                        <span className="table-secondary">
                          Order {booking.orderId}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        {booking.passenger.name}
                        <span className="table-secondary">
                          {booking.passenger.phone}
                        </span>
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
                        <span className="status-badge">
                          {booking.orderStatus}
                        </span>
                        <span className="table-secondary">
                          Booking {booking.status}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        <span className={getSourceToneClassName(source.tone)}>
                          {source.badge}
                        </span>
                        <span className="table-secondary">
                          {source.summary}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        {booking.pickup.address}
                        <span className="table-secondary">
                          {booking.dropoff.address}
                        </span>
                      </div>
                    </td>
                    <td>{formatMoney(booking.quotedFare)}</td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/bookings/${booking.bookingId}`}
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

        {result.items.length === 0 ? (
          <div className="empty-panel">
            No booking matched the current query. Try clearing status chips or
            broadening the search window.
          </div>
        ) : null}

        <div className="pagination-row">
          <span className="muted-copy">
            Page {result.page} of {result.totalPages}
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
      </SurfaceCard>

      <CalloutPanel
        title="Authority boundary"
        description="This list consumes `/api/tenant/bookings*` directly, keeps `status` aligned to `OwnedOrderStatus[]`, and does not introduce tenant-local workflow aliases."
      />
    </div>
  );
}
