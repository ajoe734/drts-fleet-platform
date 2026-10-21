import type { ApiClient } from "@drts/api-client";
import type {
  DriverTaskOrderSummary,
  UnifiedDriverTaskView,
} from "@drts/contracts";

/** Preserve current and historical display data from the existing batch read. */
export async function loadDriverOrderSummaries(
  client: Pick<ApiClient, "getDriverTaskOrder" | "getOrder">,
  tasks: UnifiedDriverTaskView[],
): Promise<Record<string, DriverTaskOrderSummary>> {
  const result: Record<string, DriverTaskOrderSummary> = {};
  const uniqueOrders = new Map(
    tasks.filter((task) => task.orderId).map((task) => [task.orderId, task]),
  );
  await Promise.all(
    [...uniqueOrders].map(async ([orderId, task]) => {
      if (task.orderSummary !== undefined) {
        if (task.orderSummary?.orderId === orderId) {
          result[orderId] = task.orderSummary;
        }
        return;
      }
      // Older and forwarded producers retain their original detail lookup.
      try {
        const order =
          task.sourcePlatform === "drts"
            ? await client.getDriverTaskOrder(task.taskId)
            : await client.getOrder(orderId);
        if (order.orderId === orderId) result[orderId] = order;
      } catch {
        // The existing screen renders its unavailable fare/type labels.
      }
    }),
  );
  return result;
}
