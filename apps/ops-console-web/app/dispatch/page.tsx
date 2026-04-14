import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { DispatchWorkflow } from "./dispatch-workflow";
import type { OwnedOrderRecord, DispatchJobRecord } from "@drts/contracts";

export default async function DispatchPage() {
  const client = getOpsClient();

  let orders: OwnedOrderRecord[] = [];
  let dispatchJobs: DispatchJobRecord[] = [];
  let error: string | null = null;

  try {
    [orders, dispatchJobs] = await Promise.all([
      client.listOrders(),
      client.listDispatchJobs(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Dispatch Console"
        description="Schedule dispatch, candidate selection, queue management, and redispatch handling."
      >
        {error && (
          <div className="error-banner p-4 bg-red-100 text-red-800 rounded mb-4">
            <strong>Error:</strong> {error}
          </div>
        )}

        <DispatchWorkflow orders={orders} dispatchJobs={dispatchJobs} />
      </AppShellCard>
    </main>
  );
}
