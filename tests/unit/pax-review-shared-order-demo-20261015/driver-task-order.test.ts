import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
} from "../pax-booking-history-20261009/production-booking-fixture";

const { Reflector } = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
)("@nestjs/core");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("the unchanged real guard refuses the general order route and admits the task-scoped reader only for existing realms/scopes", async () => {
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
  const guard = new BootstrapAuthGuard(new Reflector());
  async function admit(
    path: string,
    handler: () => unknown,
    headers = {
      "x-actor-type": "driver_user",
      "x-actor-id": "review-driver",
      "x-realm": "driver",
      "x-scopes": "driver:read",
    },
  ) {
    const request: AuthenticatedRequestLike = {
      method: "GET",
      url: path,
      headers,
    };
    return guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => OwnedMobilityController,
      getHandler: () => handler,
    } as never);
  }
  await expect(
    admit("/api/orders/order-a", OwnedMobilityController.prototype.getOrder),
  ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
  await expect(
    admit(
      "/api/driver/tasks/task-a/order",
      OwnedMobilityController.prototype.getDriverTaskOrder,
    ),
  ).resolves.toBe(true);
  await expect(
    admit(
      "/api/driver/tasks/task-a/order",
      OwnedMobilityController.prototype.getDriverTaskOrder,
      {} as never,
    ),
  ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  await expect(
    admit(
      "/api/driver/tasks/task-a/order",
      OwnedMobilityController.prototype.getDriverTaskOrder,
      {
        "x-actor-type": "partner_api_key",
        "x-actor-id": "partner",
        "x-realm": "partner",
        "x-scopes": "driver:read",
      },
    ),
  ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
});

it("the assigned task's real persisted order supplies completion requirements without a cache fallback or foreign-driver read", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = createProductionBookingFixture();
  await f.service.createRide(OWNER, f.command);
  const order = f.state.order!;
  const task = {
    taskId: "assigned-task",
    orderId: order.orderId,
    driverId: "review-driver",
    status: "on_trip",
  };
  const state = {
    missingTask: false,
    missingOrder: false,
    error: null as Error | null,
  };
  const database = {
    isEnabled: () => true,
    query: vi.fn(async (sql: string) => {
      if (state.error) throw state.error;
      const taskRead = sql.includes("phase1_driver_tasks");
      return {
        rows: (taskRead ? state.missingTask : state.missingOrder)
          ? []
          : [{ record: structuredClone(taskRead ? task : order) }],
      };
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
  const controller = new OwnedMobilityController(owned, {} as never);
  const identity = {
    realm: "driver",
    actorType: "driver_user",
    actorId: "e2e-driver-review-driver",
  } as never;
  expect(
    (await controller.getDriverTaskOrder(task.taskId, identity, "r26-read"))
      .data,
  ).toMatchObject({
    orderId: order.orderId,
    fixedPrice: order.fixedPrice,
    quotedFare: order.quotedFare,
    proofRequirements: order.proofRequirements,
  });
  await expect(
    controller.getDriverTaskOrder(task.taskId, {
      realm: "driver",
      actorId: "foreign-driver",
    } as never),
  ).rejects.toMatchObject({ code: "DRIVER_IDENTITY_MISMATCH" });
  state.missingTask = true;
  await expect(
    controller.getDriverTaskOrder(task.taskId, identity),
  ).rejects.toMatchObject({ code: "DRIVER_TASK_NOT_FOUND" });
  state.missingTask = false;
  await owned.resolvePersistedOrder(order.orderId); // Existing cache is deliberately warm.
  state.missingOrder = true;
  await expect(
    controller.getDriverTaskOrder(task.taskId, identity),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  state.missingOrder = false;
  state.error = new Error("fixture database refused read");
  await expect(
    controller.getDriverTaskOrder(task.taskId, identity),
  ).rejects.toBe(state.error);
});
