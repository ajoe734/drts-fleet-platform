import { describe, expect, it, vi } from "vitest";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";
import { ForwarderService } from "../../../apps/api/src/modules/forwarder/forwarder.service";

describe("Driver task list canonical order display summaries", () => {
  it("returns current and historical prices and service types from the existing batch read", async () => {
    const tasks = Array.from({ length: 56 }, (_, index) => ({
      taskId: `task-${index}`,
      orderId: `order-${index}`,
      driverId: "fixture-driver",
      status: index === 0 ? "accepted" : "completed",
    })) as DriverTaskRecord[];
    const orders = tasks.map((task) => ({
      orderId: task.orderId,
      serviceBucket: "standard_taxi",
      serviceProductCode: "taxi_reservation",
      businessDispatchSubtype: null,
      dispatchSemantics: "reservation",
      fixedPrice: false,
      quotedFare: { currency: "TWD", amountMinor: 12300 },
      pickup: { address: "fixture pickup" },
      dropoff: { address: "fixture dropoff" },
      updatedAt: "2026-10-17T00:00:00Z",
    })) as OwnedOrderRecord[];
    const owned = {
      listDriverTasksForRead: vi.fn(async () => tasks),
      listOrdersForRead: vi.fn(async () => orders),
    };
    const service = new ForwarderService(
      {} as never,
      {} as never,
      [],
      undefined,
      owned as never,
    );
    const views = await service.listDriverTaskViewsForRead("fixture-driver");
    expect(views).toHaveLength(56);
    expect(owned.listOrdersForRead).toHaveBeenCalledExactlyOnceWith(
      tasks.map((task) => task.orderId),
    );
    for (const view of views) {
      expect(view.orderSummary).toEqual({
        orderId: view.orderId,
        serviceBucket: "standard_taxi",
        serviceProductCode: "taxi_reservation",
        businessDispatchSubtype: null,
        dispatchSemantics: "reservation",
        fixedPrice: false,
        quotedFare: { currency: "TWD", amountMinor: 12300 },
      });
    }
    expect(views.find((view) => view.taskId === "task-55")?.localStatus).toBe(
      "completed",
    );
  });

  it("marks an absent canonical order without fabricating its display fields", async () => {
    const owned = {
      listDriverTasksForRead: vi.fn(async () => [
        {
          taskId: "old-task",
          orderId: "old-order",
          driverId: "fixture-driver",
          status: "cancelled",
        },
      ]),
      listOrdersForRead: vi.fn(async () => []),
    };
    const service = new ForwarderService(
      {} as never,
      {} as never,
      [],
      undefined,
      owned as never,
    );
    const [view] = await service.listDriverTaskViewsForRead("fixture-driver");
    expect(view).toMatchObject({
      taskId: "old-task",
      orderId: "old-order",
      localStatus: "cancelled",
      orderSummary: null,
    });
  });
});
