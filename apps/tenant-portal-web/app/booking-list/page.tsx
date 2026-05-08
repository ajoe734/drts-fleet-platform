import Link from "next/link";
import type { BookingRecord, OwnedOrderStatus } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { BookingFilterBar } from "@/components/booking-filter-bar";
import { BookingActions } from "@/components/booking-actions";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";

const ORDER_STATUS_FILTER: OwnedOrderStatus[] = [
  "created",
  "recording_pending",
  "ready_for_dispatch",
  "preassigned",
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
  "completed",
  "cancelled",
  "redispatch_required",
  "dispatch_failed",
  "exception_hold",
];

export default async function BookingListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const client = getTenantClient();
  const params = await searchParams;
  const statusFilter = params.status as OwnedOrderStatus | undefined;
  const errorParam = params.error;

  let bookings: BookingRecord[] = [];
  let error: string | null = errorParam || null;

  try {
    const allBookings = await client.listTenantBookings();
    bookings = statusFilter
      ? allBookings.filter((booking) => booking.orderStatus === statusFilter)
      : allBookings;
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Booking List"
        description={`Fetched from /api/tenant/bookings. ${bookings.length} booking(s) found${statusFilter ? ` with order status "${statusFilter}"` : ""}.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ marginBottom: "0.75rem" }}>
          <Link className="route-link" href="/bookings/new">
            <strong>+ Create Booking</strong>
            Start a new reservation.
          </Link>
        </div>

        {/* Status Filter */}
        <BookingFilterBar
          availableStatuses={ORDER_STATUS_FILTER}
          currentStatus={statusFilter as OwnedOrderStatus}
        />

        {bookings.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Order No</th>
                  <th>Service</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Pickup</th>
                  <th>Dropoff</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.bookingId}>
                    <td>
                      <Link href={`/booking-list/${booking.bookingId}`}>
                        {booking.bookingId}
                      </Link>
                    </td>
                    <td>{booking.serviceBucket}</td>
                    <td>
                      {(() => {
                        const source = getBookingSourceVisibility(booking);
                        return (
                          <div>
                            <span
                              className={getSourceToneClassName(source.tone)}
                            >
                              {source.badge}
                            </span>
                            <div className="source-detail">
                              {source.summary}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <span
                        className={`status-badge status-${booking.orderStatus}`}
                        style={{
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.875rem",
                          backgroundColor:
                            booking.orderStatus === "completed"
                              ? "#d4edda"
                              : booking.orderStatus === "cancelled"
                                ? "#f8d7da"
                                : booking.orderStatus.includes("pending") ||
                                    booking.orderStatus.includes("required")
                                  ? "#fff3cd"
                                  : "#cce5ff",
                        }}
                      >
                        {booking.orderStatus}
                      </span>
                    </td>
                    <td>{booking.pickup.address}</td>
                    <td>{booking.dropoff.address}</td>
                    <td>{new Date(booking.createdAt).toLocaleString()}</td>
                    <td>
                      <BookingActions booking={booking} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No bookings found for the current tenant.
          </p>
        )}

        <Link className="route-link" href="/">
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
