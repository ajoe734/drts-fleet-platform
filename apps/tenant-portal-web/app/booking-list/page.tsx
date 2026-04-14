import Link from "next/link";
import type { OwnedOrderRecord, OwnedOrderStatus } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { BookingFilterBar } from "@/components/booking-filter-bar";
import { BookingActions } from "@/components/booking-actions";

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

  let orders: OwnedOrderRecord[] = [];
  let error: string | null = errorParam || null;

  try {
    const allOrders = await client.listOrders();
    orders = statusFilter
      ? allOrders.filter((o) => o.status === statusFilter)
      : allOrders;
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Booking List"
        description={`Fetched from /api/orders. ${orders.length} order(s) found${statusFilter ? ` with status "${statusFilter}"` : ""}.`}
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

        {orders.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Order No</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Pickup</th>
                  <th>Dropoff</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.orderId}>
                    <td>
                      <Link href={`/booking-list/${order.orderId}`}>
                        {order.orderNo}
                      </Link>
                    </td>
                    <td>{order.serviceBucket}</td>
                    <td>
                      <span
                        className={`status-badge status-${order.status}`}
                        style={{
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.875rem",
                          backgroundColor:
                            order.status === "completed"
                              ? "#d4edda"
                              : order.status === "cancelled"
                                ? "#f8d7da"
                                : order.status.includes("pending") ||
                                    order.status.includes("required")
                                  ? "#fff3cd"
                                  : "#cce5ff",
                        }}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td>{order.pickup.address}</td>
                    <td>{order.dropoff.address}</td>
                    <td>{new Date(order.createdAt).toLocaleString()}</td>
                    <td>
                      <BookingActions order={order} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No orders found. Tenant bookings will appear here after they reach
            the owned mobility read model.
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
