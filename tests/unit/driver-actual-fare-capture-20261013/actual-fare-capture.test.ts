import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type {
  DriverCompleteTaskCommand,
  DriverTaskRecord,
} from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-events";

type Breakdown = {
  startMinor: number;
  distanceMinor: number;
  delayMinor: number;
  nightMinor: number;
};
type CapturedTask = DriverTaskRecord & { actualFareBreakdown?: Breakdown };
const actual: Breakdown = {
  startMinor: 3500,
  distanceMinor: 4500,
  delayMinor: 1000,
  nightMinor: 1000,
};
const command: DriverCompleteTaskCommand = {
  completedAt: "2026-04-10T09:45:00Z",
  actualDistanceKm: 22.4,
  actualDurationSec: 2100,
  fare: { currency: "NTD", amountMinor: 10000 },
  proof: { photos: [] },
};

async function setup(database = false, certificate = false, fixed = false) {
  const audit = new AuditNotificationService();
  const registry = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    audit,
    new DriverProfileService(audit),
  );
  const service = new OwnedMobilityService(
    registry,
    audit,
    new CallcenterService(audit),
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    new OpsDispatchEventsService(new EventEmitter() as never),
  );
  const order = service.createPassengerOrder({
    pickup: { address: "台中市梧棲區中二路一段9號" },
    dropoff: { address: "台中市大安區興安路378號" },
    passenger: { name: "Unit fixture", phone: "0911222333" },
  });
  const job = service.dispatchOrder(order.orderId, { mode: "auto" });
  const candidate = (
    await service.listDispatchCandidates(job.dispatchJobId)
  )[0]!;
  const assignment = await service.assignDispatch({
    dispatchJobId: job.dispatchJobId,
    vehicleId: candidate.vehicleId,
    driverId: candidate.driverId,
  });
  service.acceptDriverTask(assignment.taskId, {
    acceptedAt: "2026-04-10T09:02:00Z",
  });
  service.departDriverTask(assignment.taskId, {
    departedAt: "2026-04-10T09:03:00Z",
    currentLocation: { lat: 24.266, lng: 120.522 },
  });
  service.arrivedPickup(assignment.taskId, {
    arrivedAt: "2026-04-10T09:08:00Z",
  });
  await service.startDriverTask(assignment.taskId, {
    startedAt: "2026-04-10T09:10:00Z",
  });
  // Unit context selection, not a licensed multi-taxi/provider/identity acceptance.
  const storedOrder = Reflect.get(service, "orders").find(
    (value: { orderId: string }) => value.orderId === order.orderId,
  );
  if (certificate) storedOrder.runtimeProfileCode = "multi_taxi_direct";
  if (fixed) {
    storedOrder.fixedPrice = true;
    storedOrder.quotedFare = { ...command.fare };
  }
  const events: Array<
    Record<string, unknown> & { actualFareBreakdown?: Breakdown }
  > = [];
  const emitter = new EventEmitter();
  emitter.on(OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT, (event) =>
    events.push(event),
  );
  Reflect.set(service, "eventEmitter", {
    listenerCount: (name: string) => emitter.listenerCount(name),
    emitAsync: async (name: string, event: unknown) => [
      emitter.emit(name, event),
    ],
  });
  const writes: Array<{ driverTasks?: CapturedTask[] }> = [];
  const outbox: Array<{
    effectType: string;
    payload: Record<string, unknown>;
  }> = [];
  let commitFailure = false;
  const repository = {
    isEnabled: () => true,
    withTransaction: async <T>(
      work: (tx: unknown) => Promise<T>,
    ): Promise<T> => {
      const result = await work({ query: vi.fn() });
      if (commitFailure) throw new Error("fixture commit rejected");
      return result;
    },
    loadDriverTaskCompletionBundleForUpdate: vi.fn(async () => ({
      order: structuredClone(storedOrder),
      dispatchJob: { ...job },
      assignment: service
        .getReportingSnapshot()
        .dispatchAssignments.find(
          (value) => value.assignmentId === assignment.assignmentId,
        ),
      task: service.getDriverTask(assignment.taskId),
    })),
    hasDriverTaskTraceRequestId: vi.fn(async () => false),
    persistOrderWorkflow: vi.fn(
      async (_tx: unknown, changes: { driverTasks?: CapturedTask[] }) => {
        writes.push(structuredClone(changes));
      },
    ),
    persistDriverCompletionOutbox: vi.fn(
      async (_tx: unknown, records: typeof outbox) => {
        outbox.push(...structuredClone(records));
      },
    ),
    releaseDispatchResourceReservations: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
  };
  if (database) Reflect.set(service, "ownedMobilityRepository", repository);
  return {
    service,
    taskId: assignment.taskId,
    events,
    writes,
    outbox,
    repository,
    rejectCommit: () => {
      commitFailure = true;
    },
  };
}

function supplied(
  value: unknown,
  fare = command.fare,
): DriverCompleteTaskCommand {
  return {
    ...command,
    fare,
    actualFareBreakdown: value,
  } as DriverCompleteTaskCommand;
}

for (const database of [false, true]) {
  describe(
    database
      ? "transactional production completion"
      : "in-memory production completion",
    () => {
      it("retains supplied actual components on task and actual certificate event without fabricating complete E04", async () => {
        const ctx = await setup(database, true);
        const input = supplied({ ...actual });
        const result = (await ctx.service.completeDriverTask(
          ctx.taskId,
          input,
        )) as CapturedTask;
        expect(result.actualFareBreakdown).toEqual(actual);
        expect(ctx.events).toHaveLength(1);
        expect(ctx.events[0]!.actualFareBreakdown).toEqual(actual);
        expect(ctx.events[0]).not.toHaveProperty("e04Snapshot");
        expect(ctx.events[0]).not.toHaveProperty("paymentMethodDisplay");
        if (database) {
          expect(ctx.writes[0]!.driverTasks![0]!.actualFareBreakdown).toEqual(
            actual,
          );
          expect(JSON.stringify(ctx.outbox)).toContain('"actualFareBreakdown"');
          expect(
            ctx.repository.releaseDispatchResourceReservations,
          ).toHaveBeenCalledOnce();
        }
        const original = { ...actual };
        (
          input as DriverCompleteTaskCommand & {
            actualFareBreakdown: Breakdown;
          }
        ).actualFareBreakdown.startMinor = 1;
        result.actualFareBreakdown!.distanceMinor = 2;
        ctx.events[0]!.actualFareBreakdown!.nightMinor = 3;
        expect(
          (ctx.service.getDriverTask(ctx.taskId) as CapturedTask)
            .actualFareBreakdown,
        ).toEqual(original);
        expect(
          (
            ctx.service
              .listDriverTasks()
              .find((t) => t.taskId === ctx.taskId) as CapturedTask
          ).actualFareBreakdown,
        ).toEqual(original);
      });

      it("preserves legacy absence instead of deriving from distance, quote or synthetic zeros", async () => {
        const ctx = await setup(database, true);
        const result = (await ctx.service.completeDriverTask(ctx.taskId, {
          ...command,
        })) as CapturedTask;
        expect(result).not.toHaveProperty("actualFareBreakdown");
        expect(ctx.events[0]).not.toHaveProperty("actualFareBreakdown");
        if (database)
          expect(ctx.writes[0]!.driverTasks![0]).not.toHaveProperty(
            "actualFareBreakdown",
          );
      });

      it("retains explicitly reported zero components and the original fixed-price authority", async () => {
        const ctx = await setup(database, true, true);
        const value = {
          startMinor: 10000,
          distanceMinor: 0,
          delayMinor: 0,
          nightMinor: 0,
        };
        const input = supplied(value);
        delete input.fare;
        const result = (await ctx.service.completeDriverTask(
          ctx.taskId,
          input,
        )) as CapturedTask;
        expect(result.fare).toEqual(command.fare);
        expect(result.actualFareBreakdown).toEqual(value);
      });

      it("does not allow a breakdown to override a fixed price", async () => {
        const ctx = await setup(database, false, true);
        await expect(
          ctx.service.completeDriverTask(
            ctx.taskId,
            supplied(actual, { currency: "NTD", amountMinor: 12000 }),
          ),
        ).rejects.toMatchObject({ code: "FIXED_PRICE_IMMUTABLE" });
        expect(ctx.service.getDriverTask(ctx.taskId).status).toBe("on_trip");
      });

      for (const immediate of [false, true]) {
        it(`detaches actual facts from the real public task stream (${immediate ? "during" : "after"} publication)`, async () => {
          const ctx = await setup(database);
          let emitted: CapturedTask | undefined;
          let deliveries = 0;
          const subscription = ctx.service
            .streamDriverTaskEvents(
              ctx.service.getDriverTask(ctx.taskId).driverId,
            )
            .subscribe((message) => {
              const task = (message.data as { data: { task: CapturedTask } })
                .data.task;
              if (task.status === "completed") {
                emitted = task;
                deliveries += 1;
                if (immediate) task.actualFareBreakdown!.startMinor = 999;
              }
            });
          try {
            const input = supplied({ ...actual });
            const result = (await ctx.service.completeDriverTask(
              ctx.taskId,
              input,
              "real-stream-replay",
            )) as CapturedTask;
            expect(emitted?.actualFareBreakdown).toBeDefined();
            if (!immediate) emitted!.actualFareBreakdown!.startMinor = 999;
            expect(result.actualFareBreakdown).toEqual(actual);
            expect(
              (ctx.service.getDriverTask(ctx.taskId) as CapturedTask)
                .actualFareBreakdown,
            ).toEqual(actual);
            expect(
              (
                ctx.service
                  .listDriverTasks()
                  .find((task) => task.taskId === ctx.taskId) as CapturedTask
              ).actualFareBreakdown,
            ).toEqual(actual);
            if (database)
              ctx.repository.hasDriverTaskTraceRequestId.mockResolvedValue(
                true,
              );
            const replay = (await ctx.service.completeDriverTask(
              ctx.taskId,
              supplied({
                startMinor: 10000,
                distanceMinor: 0,
                delayMinor: 0,
                nightMinor: 0,
              }),
              "real-stream-replay",
            )) as CapturedTask;
            expect(replay.actualFareBreakdown).toEqual(actual);
            expect(deliveries).toBe(1);
            if (database) {
              expect(
                ctx.writes[0]!.driverTasks![0]!.actualFareBreakdown,
              ).toEqual(actual);
              expect(JSON.stringify(ctx.outbox)).toContain('"startMinor":3500');
              expect(JSON.stringify(ctx.outbox)).not.toContain(
                '"startMinor":999',
              );
            }
          } finally {
            subscription.unsubscribe();
          }
        });
      }

      it("preserves legacy absence in the real public task stream", async () => {
        const ctx = await setup(database);
        let emitted: CapturedTask | undefined;
        const subscription = ctx.service
          .streamDriverTaskEvents(
            ctx.service.getDriverTask(ctx.taskId).driverId,
          )
          .subscribe((message) => {
            const task = (message.data as { data: { task: CapturedTask } }).data
              .task;
            if (task.status === "completed") emitted = task;
          });
        try {
          await ctx.service.completeDriverTask(ctx.taskId, { ...command });
          expect(emitted).toBeDefined();
          expect(emitted).not.toHaveProperty("actualFareBreakdown");
        } finally {
          subscription.unsubscribe();
        }
      });

      const malformed: Array<[string, unknown]> = [
        ["null", null],
        ["array", []],
        ["number", 10000],
        ["string", "10000"],
      ];
      for (const field of Object.keys(actual) as Array<keyof Breakdown>) {
        for (const [name, value] of [
          ["missing", undefined],
          ["negative", -1],
          ["fraction", 0.5],
          ["NaN", NaN],
          ["infinite", Infinity],
          ["unsafe", Number.MAX_SAFE_INTEGER + 1],
          ["null", null],
          ["string", "1000"],
          ["boolean", true],
        ] as Array<[string, unknown]>) {
          malformed.push([`${field} ${name}`, { ...actual, [field]: value }]);
        }
      }
      malformed.push([
        "sum overflow",
        {
          startMinor: Number.MAX_SAFE_INTEGER,
          distanceMinor: 1,
          delayMinor: 0,
          nightMinor: 0,
        },
      ]);
      it.each(malformed)(
        "rejects malformed actual capture: %s before completion or effects",
        async (_name, value) => {
          const ctx = await setup(database);
          await expect(
            ctx.service.completeDriverTask(ctx.taskId, supplied(value)),
          ).rejects.toMatchObject({ code: "ACTUAL_FARE_BREAKDOWN_INVALID" });
          expect(ctx.service.getDriverTask(ctx.taskId).status).toBe("on_trip");
          expect(ctx.writes).toHaveLength(0);
          expect(ctx.outbox).toHaveLength(0);
        },
      );

      it("captures actual components without choosing an aggregate/toll convention or changing existing fare", async () => {
        const ctx = await setup(database, true);
        const fare = { currency: "NTD", amountMinor: 10700 };
        const input = supplied(actual, fare);
        input.proof = {
          photos: [],
          expenseItems: [
            {
              type: "toll",
              amountMinor: 700,
              attachmentId: "unit-fixture-toll",
            },
          ],
        };
        const result = (await ctx.service.completeDriverTask(
          ctx.taskId,
          input,
        )) as CapturedTask;
        expect(result.actualFareBreakdown).toEqual(actual);
        expect(result.fare).toEqual(fare);
        expect(ctx.events[0]).toMatchObject({
          fareMinor: 10700,
          tollMinor: 700,
          actualFareBreakdown: actual,
        });
        expect(ctx.events[0]).not.toHaveProperty("e04Snapshot");
        expect(ctx.events[0]).not.toHaveProperty("totalConvention");
      });

      it.each([
        undefined,
        { currency: "USD", amountMinor: 10000 },
        { currency: "NTD", amountMinor: 10000.5 },
      ])(
        "rejects actual NTD components without a compatible effective fare: %j",
        async (fare) => {
          const ctx = await setup(database);
          const input = supplied(actual);
          if (fare) input.fare = fare;
          else delete input.fare;
          await expect(
            ctx.service.completeDriverTask(ctx.taskId, input),
          ).rejects.toMatchObject({ code: "ACTUAL_FARE_BREAKDOWN_INVALID" });
          expect(ctx.service.getDriverTask(ctx.taskId).status).toBe("on_trip");
        },
      );
    },
  );
}

it("keeps failed transaction capture out of committed memory and publishes no certificate event", async () => {
  const ctx = await setup(true, true);
  ctx.rejectCommit();
  await expect(
    ctx.service.completeDriverTask(ctx.taskId, supplied(actual)),
  ).rejects.toThrow("fixture commit rejected");
  expect(ctx.service.getDriverTask(ctx.taskId).status).toBe("on_trip");
  expect(ctx.service.getDriverTask(ctx.taskId)).not.toHaveProperty(
    "actualFareBreakdown",
  );
  expect(ctx.events).toHaveLength(0);
});

it("snapshots caller actual components before waiting for the database lock", async () => {
  const ctx = await setup(true, true);
  const originalLoader =
    ctx.repository.loadDriverTaskCompletionBundleForUpdate.getMockImplementation()!;
  let release!: () => void;
  const locked = new Promise<void>((resolve) => {
    release = resolve;
  });
  ctx.repository.loadDriverTaskCompletionBundleForUpdate.mockImplementation(
    async () => {
      await locked;
      return originalLoader();
    },
  );
  const value = { ...actual };
  const pending = ctx.service.completeDriverTask(ctx.taskId, supplied(value));
  value.startMinor = 0;
  release();
  expect(((await pending) as CapturedTask).actualFareBreakdown).toEqual(actual);
  expect(ctx.writes[0]!.driverTasks![0]!.actualFareBreakdown).toEqual(actual);
});

it("keeps reported toll separate from components rather than changing the existing fare", async () => {
  const ctx = await setup(true, true);
  const input = supplied(actual);
  input.proof = {
    photos: [],
    expenseItems: [
      { type: "toll", amountMinor: 700, attachmentId: "unit-fixture-toll" },
    ],
  };
  const result = (await ctx.service.completeDriverTask(
    ctx.taskId,
    input,
  )) as CapturedTask;
  expect(result.fare?.amountMinor).toBe(10000);
  expect(result.actualFareBreakdown).toEqual(actual);
  expect(ctx.events[0]).toMatchObject({
    fareMinor: 10000,
    tollMinor: 700,
    actualFareBreakdown: actual,
  });
});

it("replays existing completion without replacing immutable actual components or republishing", async () => {
  const ctx = await setup(false, true);
  const first = (await ctx.service.completeDriverTask(
    ctx.taskId,
    supplied(actual),
    "actual-components-request",
  )) as CapturedTask;
  const replay = (await ctx.service.completeDriverTask(
    ctx.taskId,
    supplied({
      startMinor: 10000,
      distanceMinor: 0,
      delayMinor: 0,
      nightMinor: 0,
    }),
    "actual-components-request",
  )) as CapturedTask;
  expect(first.actualFareBreakdown).toEqual(actual);
  expect(replay.actualFareBreakdown).toEqual(actual);
  expect(ctx.events).toHaveLength(1);
});
