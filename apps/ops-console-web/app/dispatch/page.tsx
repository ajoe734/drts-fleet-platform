import type { OwnedOrderRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";

export default async function DispatchPage() {
  const client = getOpsClient();

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
        title="Dispatch"
        description={`Fetched from /api/orders. ${orders.length} order(s) in system.`}
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
          <p className="empty-state">No orders. Dispatch queue is empty.</p>
        )}
      </AppShellCard>
    </main>
  );
}
