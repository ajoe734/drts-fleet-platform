import { afterEach, expect, it, vi } from "vitest";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { ForwarderService } from "../../../apps/api/src/modules/forwarder/forwarder.service";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
} from "../pax-booking-history-20261009/production-booking-fixture";

const {
  OwnedMobilityController,
}: typeof import("../../../apps/api/src/modules/owned-mobility/owned-mobility.controller") =
  await import(
    process.env.PAX_REVIEW_OWNED_CONTROLLER_SOURCE ??
      "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller"
  );
const {
  ForwarderController,
}: typeof import("../../../apps/api/src/modules/forwarder/forwarder.controller") =
  await import(
    process.env.PAX_REVIEW_FORWARDER_CONTROLLER_SOURCE ??
      "../../../apps/api/src/modules/forwarder/forwarder.controller"
  );

afterEach(() => vi.useRealTimers());

it("Ops HTTP facade sees a booking committed after this peer started, and never serves a deleted or failed database read from cache", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  let row: unknown = null;
  const fault = { error: undefined as Error | undefined };
  const database = {
    isEnabled: () => true,
    query: vi.fn(async () => {
      if (fault.error) throw fault.error;
      return { rows: row ? [{ record: structuredClone(row) }] : [] };
    }),
  };
  const owned = new OwnedMobilityService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    new OwnedMobilityRepository(database as never),
  );
  const ops = new OwnedMobilityController(owned, {} as never);
  expect((await ops.listOrders()).data.items).toEqual([]);
  const booking = createProductionBookingFixture();
  const created = await booking.service.createRide(OWNER, booking.command);
  row = structuredClone(booking.state.order);
  expect((await ops.listOrders()).data.items).toEqual([
    expect.objectContaining({ orderId: created.ride.order.orderId }),
  ]);
  expect((await ops.getOrder(created.ride.order.orderId)).data).toMatchObject({
    orderId: created.ride.order.orderId,
  });
  // Warm the legacy internal cache through its public production resolver.
  // The HTTP facade must still treat a later database miss as authoritative.
  await owned.resolvePersistedOrder(created.ride.order.orderId);
  expect(owned.getOrder(created.ride.order.orderId).orderId).toBe(
    created.ride.order.orderId,
  );
  row = null;
  expect((await ops.listOrders()).data.items).toEqual([]);
  await expect(ops.getOrder(created.ride.order.orderId)).rejects.toMatchObject({
    code: "ORDER_NOT_FOUND",
  });
  fault.error = new Error("database unavailable");
  await expect(ops.listOrders()).rejects.toBe(fault.error);
});

it("the real unified Driver HTTP facade reads a persisted owned task without forcing its legacy fallback", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const booking = createProductionBookingFixture();
  await booking.service.createRide(OWNER, booking.command);
  const order = booking.state.order!;
  const task = {
    taskId: "persisted-driver-task",
    orderId: order.orderId,
    dispatchJobId: "job",
    assignmentId: "assignment",
    driverId: "review-driver",
    vehicleId: "review-vehicle",
    status: "pending_acceptance",
    fare: null,
    proof: null,
  };
  const database = {
    isEnabled: () => true,
    query: vi.fn(async (sql: string) => ({
      rows: [
        {
          record: structuredClone(
            sql.includes("phase1_driver_tasks") ? task : order,
          ),
        },
      ],
    })),
  };
  const owned = new OwnedMobilityService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    new OwnedMobilityRepository(database as never),
  );
  const unified = new ForwarderController(
    new ForwarderService({} as never, {} as never, [], undefined, owned),
  );
  expect(
    (await unified.listDriverTaskViews(null, "review-driver")).data.items,
  ).toEqual([
    expect.objectContaining({
      taskId: task.taskId,
      orderId: order.orderId,
      pickupSummary: order.pickup.address,
    }),
  ]);
  expect(
    (await unified.getDriverTaskView(task.taskId, null, "review-driver")).data,
  ).toMatchObject({ taskId: task.taskId, orderId: order.orderId });
  await expect(
    unified.getDriverTaskView(task.taskId, null, "foreign-driver"),
  ).rejects.toMatchObject({ code: "DRIVER_TASK_VIEW_NOT_FOUND" });
  const native = new OwnedMobilityController(owned, {} as never);
  const alias = {
    realm: "driver",
    actorType: "driver_user",
    actorId: "e2e-driver-review-driver",
  } as never;
  expect((await native.listDriverTasks(alias)).data.items).toHaveLength(1);
  expect((await native.getDriverTask(task.taskId, alias)).data.taskId).toBe(
    task.taskId,
  );
  await expect(
    native.listDriverTasks(alias, "foreign-driver"),
  ).rejects.toMatchObject({ code: "DRIVER_IDENTITY_MISMATCH" });
  await expect(
    native.getDriverTask(task.taskId, {
      realm: "driver",
      actorId: "foreign-driver",
    } as never),
  ).rejects.toMatchObject({ code: "DRIVER_IDENTITY_MISMATCH" });
});
