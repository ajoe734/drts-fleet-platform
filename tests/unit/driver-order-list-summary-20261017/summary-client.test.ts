import { expect, it, vi } from "vitest";
import type {
  DriverTaskOrderSummary,
  OwnedOrderRecord,
  UnifiedDriverTaskView,
} from "@drts/contracts";
import { loadDriverOrderSummaries } from "../../../apps/driver-app/lib/task-order-summaries";

const summary: DriverTaskOrderSummary = {
  orderId: "owned-order",
  serviceBucket: "standard_taxi",
  serviceProductCode: "taxi_reservation",
  businessDispatchSubtype: null,
  dispatchSemantics: "reservation",
  fixedPrice: false,
  quotedFare: { currency: "TWD", amountMinor: 12300 },
};
const task = (value: Partial<UnifiedDriverTaskView>) =>
  ({
    taskId: "task",
    orderId: summary.orderId,
    sourcePlatform: "drts",
    ...value,
  }) as UnifiedDriverTaskView;

it("uses the canonical summary and a known-missing result without extra detail reads", async () => {
  const client = { getDriverTaskOrder: vi.fn(), getOrder: vi.fn() };
  const result = await loadDriverOrderSummaries(client, [
    task({ orderSummary: summary }),
    task({
      taskId: "missing-task",
      orderId: "missing-order",
      orderSummary: null,
    }),
  ]);
  expect(result).toEqual({ [summary.orderId]: summary });
  expect(client.getDriverTaskOrder).not.toHaveBeenCalled();
  expect(client.getOrder).not.toHaveBeenCalled();
});

it("preserves the existing deduplicated lookup for older and forwarded producers", async () => {
  const external = { ...summary, orderId: "forwarded-order" };
  const client = {
    getDriverTaskOrder: vi.fn(async () => summary as OwnedOrderRecord),
    getOrder: vi.fn(async () => external as OwnedOrderRecord),
  };
  const result = await loadDriverOrderSummaries(client, [
    task({}),
    task({ taskId: "another-task-for-same-order" }),
    task({
      taskId: "external-task",
      orderId: external.orderId,
      sourcePlatform: "grab_taiwan" as UnifiedDriverTaskView["sourcePlatform"],
    }),
  ]);
  expect(result).toEqual({
    [summary.orderId]: summary,
    [external.orderId]: external,
  });
  expect(client.getDriverTaskOrder).toHaveBeenCalledTimes(1);
  expect(client.getOrder).toHaveBeenCalledExactlyOnceWith(external.orderId);
});
