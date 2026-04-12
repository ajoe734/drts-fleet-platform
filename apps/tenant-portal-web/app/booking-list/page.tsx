import Link from "next/link";
import type { OwnedOrderRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export default async function BookingListPage() {
  const client = getTenantClient();

  let orders: OwnedOrderRecord[] = [];
  let error: string | null = null;

  try {
    orders = await client.listOrders();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Booking List"
        description={`Fetched from /api/orders. ${orders.length} order(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {orders.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Order No</th>
                  <th>Order ID</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.orderId}>
                    <td>{order.orderNo}</td>
                    <td>{order.orderId}</td>
                    <td>{order.serviceBucket}</td>
                    <td>{order.status}</td>
                    <td>{new Date(order.createdAt).toLocaleString()}</td>
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
