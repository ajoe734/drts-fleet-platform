import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type {
  DriverCompleteTaskCommand,
  DriverTaskRecord,
} from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-events";

type Row = Record<string, unknown>;
type Captured = DriverTaskRecord & {
  driverSurname?: string;
  driverSurnameSource?: string;
  driverSurnameProfileUpdatedAt?: string;
};
const command: DriverCompleteTaskCommand = {
  completedAt: "2026-04-10T09:45:00Z",
  actualDistanceKm: 22.4,
  actualDurationSec: 2100,
  fare: { currency: "NTD", amountMinor: 10000 },
  proof: { photos: [] },
  actualFareBreakdown: {
    startMinor: 3500,
    distanceMinor: 4500,
    delayMinor: 1000,
    nightMinor: 1000,
  },
};
const keys = [
  "driverSurname",
  "driverSurnameSource",
  "driverSurnameProfileUpdatedAt",
] as const;

// Only SQL/event transports are fixtures. Profile/repositories/registry,
// completion, reconciliation, proof, replay, event and outbox code are real.
function sqlTransport(initial: Record<string, Row[]> = {}) {
  const primaryKeys: Record<string, string> = {
    "ops.phase1_owned_orders": "orderId",
    "ops.phase1_dispatch_jobs": "dispatchJobId",
    "ops.phase1_dispatch_assignments": "assignmentId",
    "ops.phase1_driver_tasks": "taskId",
    "ops.phase1_driver_profiles": "driverId",
  };
  let records = new Map<string, Map<string, Row>>(
    Object.entries(initial).map(([table, rows]) => [
      table,
      new Map(
        rows.map((row) => [
          String(row[primaryKeys[table]!]),
          structuredClone(row),
        ]),
      ),
    ]),
  );
  let staged: typeof records | null = null;
  let rejectCommit = false;
  let pauseWrite: (() => Promise<void>) | null = null;
  const outbox: Row[] = [];
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    const sql = text.replace(/\s+/g, " ").trim();
    queries.push({ sql, values: structuredClone(values) });
    if (sql === "BEGIN") {
      staged = structuredClone(records);
      return { rows: [], rowCount: 0 };
    }
    if (sql === "COMMIT") {
      if (rejectCommit) throw new Error("fixture COMMIT rejected");
      if (staged) records = staged;
      staged = null;
      return { rows: [], rowCount: 0 };
    }
    if (sql === "ROLLBACK") {
      staged = null;
      outbox.length = 0;
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("SET LOCAL ")) return { rows: [], rowCount: 0 };
    const data = staged ?? records;
    if (
      sql.startsWith("SELECT EXISTS") &&
      sql.includes("phase1_dispatch_trace_logs")
    ) {
      const matched = [
        ...(data.get("ops.phase1_dispatch_trace_logs")?.values() ?? []),
      ].some((row) => {
        const details = row.details as Row;
        return (
          row.orderId === values[0] &&
          row.eventType === values[1] &&
          details.taskId === values[2] &&
          details.requestId === values[3]
        );
      });
      return { rows: [{ matched }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT record")) {
      const table = /FROM ([\w.]+)/.exec(sql)?.[1];
      if (!table) throw new Error(`Unexpected fixture SELECT: ${sql}`);
      let id = values[0];
      if (
        table === "ops.phase1_dispatch_assignments" &&
        sql.includes("SELECT assignment_id")
      ) {
        id = data.get("ops.phase1_driver_tasks")?.get(String(id))?.assignmentId;
      }
      const rows = values.length
        ? [data.get(table)?.get(String(id))].filter((row): row is Row => !!row)
        : [...(data.get(table)?.values() ?? [])];
      return {
        rows: rows.map((record) => ({ record: structuredClone(record) })),
        rowCount: rows.length,
      };
    }
    if (sql.startsWith("INSERT INTO ")) {
      const table = /INSERT INTO ([\w.]+)/.exec(sql)![1]!;
      if (table === "ops.phase1_owned_orders" && pauseWrite) {
        const hook = pauseWrite;
        pauseWrite = null;
        await hook();
      }
      const json = values.find(
        (value) => typeof value === "string" && value.startsWith("{"),
      );
      if (typeof json !== "string")
        throw new Error(`Missing actual repository JSON in ${sql}`);
      const record = JSON.parse(json) as Row;
      if (!data.has(table)) data.set(table, new Map());
      data.get(table)!.set(String(values[0]), record);
      if (table === "ops.driver_completion_outbox") {
        outbox.push({
          outboxId: values[0],
          taskId: values[1],
          orderId: values[2],
          effectType: values[3],
          requestId: values[4],
          payload: record,
        });
      }
      return {
        rows:
          table === "ops.consumer_notification_outbox"
            ? [{ outbox_id: values[0] }]
            : [],
        rowCount: 1,
      };
    }
    if (
      sql.startsWith("UPDATE mobility.phase1_partner_notification_sequences")
    ) {
      // This fixture order has no partner route; production sequence allocator
      // sees the genuine SQL transport's no-row result, not a fabricated route.
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("UPDATE ops.dispatch_resource_reservations"))
      return { rows: [], rowCount: 1 };
    if (
      sql.startsWith("WITH candidate AS") &&
      sql.includes("ops.driver_completion_outbox")
    ) {
      // Hosted lease/recovery is NOT claimed. Tests execute the actual persisted
      // effects explicitly, without simulating a lease or delivery success.
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unsupported SQL transport fixture: ${sql}`);
  });
  const client = { query, release: vi.fn() };
  return {
    database: { isEnabled: () => true, query, connect: async () => client },
    queries,
    outbox,
    row: (table: string, id: string) =>
      structuredClone(records.get(table)?.get(id)),
    rejectCommit: () => {
      rejectCommit = true;
    },
    pauseNextOrderWrite: (hook: () => Promise<void>) => {
      pauseWrite = hook;
    },
  };
}

async function setup(database = false, certificate = true, minPhotoCount = 0) {
  const audit = new AuditNotificationService();
  const profileSql = sqlTransport();
  const profileRepository = new DriverProfileRepository(
    profileSql.database as never,
  );
  const profiles = new DriverProfileService(audit, profileRepository);
  const registry = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    audit,
    profiles,
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
    passenger: { name: "Unit transport fixture", phone: "0911222333" },
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
  // Select unit runtime/proof contexts only; not a real regulated trip or PSP.
  const storedOrder = (Reflect.get(service, "orders") as Row[]).find(
    (row) => row.orderId === order.orderId,
  )!;
  if (certificate) storedOrder.runtimeProfileCode = "multi_taxi_direct";
  (storedOrder.proofRequirements as Row).minPhotoCount = minPhotoCount;
  const reporting = service.getReportingSnapshot();
  const taskSql = sqlTransport({
    "ops.phase1_owned_orders": [storedOrder],
    "ops.phase1_dispatch_jobs": reporting.dispatchJobs as unknown as Row[],
    "ops.phase1_dispatch_assignments":
      reporting.dispatchAssignments as unknown as Row[],
    "ops.phase1_driver_tasks": [
      service.getDriverTask(assignment.taskId) as unknown as Row,
    ],
  });
  if (database)
    Reflect.set(
      service,
      "ownedMobilityRepository",
      new OwnedMobilityRepository(taskSql.database as never),
    );
  const events: Row[] = [];
  const emitter = new EventEmitter();
  emitter.on(OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT, (event: Row) =>
    events.push(event),
  );
  Reflect.set(service, "eventEmitter", {
    listenerCount: (name: string) => emitter.listenerCount(name),
    emitAsync: async (name: string, event: Row) => [emitter.emit(name, event)],
  });
  const setSurname = async (
    driverSurname: string,
    driverId = candidate.driverId,
  ) =>
    profiles.upsertAdminProfile(driverId, {
      name: "Full name stays unchanged",
      driverSurname,
    });
  const event = () =>
    database
      ? ((
          taskSql.outbox.find(
            (row) => row.effectType === "multi_taxi_certificate",
          )?.payload as Row
        )?.event as Row)
      : events[0]!;
  return {
    service,
    profiles,
    profileRepository,
    profileSql,
    registry,
    taskId: assignment.taskId,
    driverId: candidate.driverId,
    storedOrder,
    taskSql,
    events,
    setSurname,
    event,
  };
}

for (const database of [false, true]) {
  describe(
    database
      ? "actual repository completion with SQL transport fixture"
      : "actual in-memory completion",
    () => {
      it("baseline configured surname is retained on actual task and certificate producer", async () => {
        const ctx = await setup(database);
        const profile = await ctx.setSurname("歐陽");
        const result = await ctx.service.completeDriverTask(
          ctx.taskId,
          command,
          "surname-completion",
        );
        expect(result).toMatchObject({
          driverSurname: "歐陽",
          driverSurnameSource: "driver_profile_declared",
          driverSurnameProfileUpdatedAt: profile.updatedAt,
        });
        expect(ctx.event()).toMatchObject({
          driverSurname: "歐陽",
          driverSurnameSource: "driver_profile_declared",
          driverSurnameProfileUpdatedAt: profile.updatedAt,
        });
        expect(result.actualFareBreakdown).toEqual(command.actualFareBreakdown);
        expect(ctx.event()).not.toHaveProperty("e04Snapshot");
      });
      it("baseline legacy omission remains genuinely absent despite a full name", async () => {
        const ctx = await setup(database);
        await ctx.profiles.upsertAdminProfile(ctx.driverId, {
          name: "陳 Legacy Full Name",
        });
        const result = await ctx.service.completeDriverTask(
          ctx.taskId,
          command,
          "legacy",
        );
        for (const key of keys) {
          expect(result).not.toHaveProperty(key);
          expect(ctx.event()).not.toHaveProperty(key);
        }
      });
      it("terminal legacy replay cannot retroactively acquire a later configured surname", async () => {
        const ctx = await setup(database);
        await ctx.service.completeDriverTask(
          ctx.taskId,
          command,
          "legacy-terminal",
        );
        await ctx.setSurname("Later declared surname");
        const replay = await ctx.service.completeDriverTask(
          ctx.taskId,
          command,
          "legacy-terminal",
        );
        for (const key of keys) expect(replay).not.toHaveProperty(key);
        expect(ctx.event()).not.toHaveProperty("driverSurname");
      });
      it("legacy fare omission does not prevent surname capture or invent actual components", async () => {
        const ctx = await setup(database);
        await ctx.setSurname("歐陽");
        const legacy = { ...command };
        delete legacy.actualFareBreakdown;
        const result = await ctx.service.completeDriverTask(ctx.taskId, legacy);
        expect((result as Captured).driverSurname).toBe("歐陽");
        expect(result).not.toHaveProperty("actualFareBreakdown");
        expect(ctx.event()).not.toHaveProperty("actualFareBreakdown");
      });
      it.each(["van der Meer", "O’Neill", "司馬", "鄧"])(
        "preserves explicitly declared %s without name parsing",
        async (surname) => {
          const ctx = await setup(database);
          await ctx.setSurname(surname);
          const result = await ctx.service.completeDriverTask(
            ctx.taskId,
            command,
          );
          expect((result as Captured).driverSurname).toBe(surname);
          expect(ctx.event().driverSurname).toBe(surname);
          expect(ctx.profiles.getProfileForDriver(ctx.driverId).name).toBe(
            "Full name stays unchanged",
          );
        },
      );
      it("never substitutes another driver's profile or completion-command extra field", async () => {
        const ctx = await setup(database);
        await ctx.setSurname("Foreign declaration", "fixture-other-driver");
        const input = { ...command, driverSurname: "Spoofed body value" };
        const result = await ctx.service.completeDriverTask(ctx.taskId, input);
        for (const key of keys) expect(result).not.toHaveProperty(key);
        expect(ctx.event()).not.toHaveProperty("driverSurname");
      });
      it("get/list/replay retain old configured facts after acknowledged profile changes", async () => {
        const ctx = await setup(database);
        const first = await ctx.setSurname("歐陽");
        const result = await ctx.service.completeDriverTask(
          ctx.taskId,
          command,
          "immutable-surname",
        );
        await ctx.setSurname("New declaration");
        (result as Captured).driverSurname = "Mutated returned DTO";
        const get = ctx.service.getDriverTask(ctx.taskId);
        const replay = await ctx.service.completeDriverTask(
          ctx.taskId,
          command,
          "immutable-surname",
        );
        expect(get).toMatchObject({
          driverSurname: "歐陽",
          driverSurnameProfileUpdatedAt: first.updatedAt,
        });
        expect(replay).toMatchObject({
          driverSurname: "歐陽",
          driverSurnameProfileUpdatedAt: first.updatedAt,
        });
        expect(
          ctx.service
            .listDriverTasks()
            .find((task) => task.taskId === ctx.taskId),
        ).toMatchObject({ driverSurname: "歐陽" });
        expect(ctx.event().driverSurname).toBe("歐陽");
        if (database) {
          expect(
            ctx.taskSql.row("ops.phase1_driver_tasks", ctx.taskId),
          ).toMatchObject({ driverSurname: "歐陽" });
          const payload = ctx.taskSql.outbox.find(
            (row) => row.effectType === "driver_task_updated",
          )?.payload as Row;
          expect(payload.task).toMatchObject({ driverSurname: "歐陽" });
          expect(
            ctx.taskSql.queries.some((query) =>
              query.sql.includes("FOR UPDATE"),
            ),
          ).toBe(true);
        }
      });
      it("public task stream mutation cannot replace persisted/get/replay primitive facts", async () => {
        const ctx = await setup(database);
        await ctx.setSurname("歐陽");
        let delivered: Captured | undefined;
        const subscription = ctx.service
          .streamDriverTaskEvents(ctx.driverId)
          .subscribe((message) => {
            const task = (message.data as { data: { task: Captured } }).data
              .task;
            if (task.status === "completed") {
              delivered = task;
              task.driverSurname = "Mutated public stream DTO";
              task.driverSurnameProfileUpdatedAt = "Mutated stream revision";
            }
          });
        try {
          const result = await ctx.service.completeDriverTask(
            ctx.taskId,
            command,
            "stream-replay",
          );
          if (database) {
            const execute = Reflect.get(
              ctx.service,
              "executeDriverCompletionOutboxEffect",
            ) as (row: Row) => Promise<void>;
            await execute.call(
              ctx.service,
              ctx.taskSql.outbox.find(
                (row) => row.effectType === "driver_task_updated",
              )!,
            );
          }
          expect(delivered).toBeDefined();
          expect((result as Captured).driverSurname).toBe("歐陽");
          expect(ctx.service.getDriverTask(ctx.taskId)).toMatchObject({
            driverSurname: "歐陽",
            driverSurnameSource: "driver_profile_declared",
          });
          const replay = await ctx.service.completeDriverTask(
            ctx.taskId,
            command,
            "stream-replay",
          );
          expect((replay as Captured).driverSurname).toBe("歐陽");
          expect((replay as Captured).driverSurnameProfileUpdatedAt).not.toBe(
            "Mutated stream revision",
          );
        } finally {
          subscription.unsubscribe();
        }
      });
      it("proof-pending does not freeze an unsuccessful attempt's profile facts", async () => {
        const ctx = await setup(database, true, 1);
        await ctx.setSurname("Before proof");
        await expect(
          ctx.service.completeDriverTask(ctx.taskId, command),
        ).rejects.toMatchObject({ code: "MIN_PHOTO_COUNT_NOT_MET" });
        expect(ctx.service.getDriverTask(ctx.taskId)).toMatchObject({
          status: "proof_pending",
        });
        expect(ctx.service.getDriverTask(ctx.taskId)).not.toHaveProperty(
          "driverSurname",
        );
        expect(ctx.events).toHaveLength(0);
        await ctx.setSurname("After proof");
        const result = await ctx.service.completeDriverTask(ctx.taskId, {
          ...command,
          proof: { photos: ["data:image/jpeg;base64,AA=="] },
        });
        expect((result as Captured).driverSurname).toBe("After proof");
      });
    },
  );
}

describe("actual registry profile getter and asynchronous transport controls", () => {
  it.each([undefined, null, "", "  ", 42])(
    "omits unconfigured/malformed stored surname %j without name inference",
    async (driverSurname) => {
      const audit = new AuditNotificationService();
      const sql = sqlTransport({
        "ops.phase1_driver_profiles": [
          {
            driverId: "fixture-declared-driver",
            name: "陳 Cannot Infer",
            driverSurname,
            updatedAt: "2026-04-10T09:00:00Z",
            deviceBindings: [],
          },
        ],
      });
      const profiles = new DriverProfileService(
        audit,
        new DriverProfileRepository(sql.database as never),
      );
      await profiles.onModuleInit();
      const registry = new RegulatoryRegistryService(
        new OpsDispatchEventsService(new EventEmitter() as never),
        audit,
        profiles,
      );
      const getter = Reflect.get(
        registry,
        "getDriverDeclaredSurnameSnapshot",
      ) as (id: string) => Row | null;
      expect(getter.call(registry, "fixture-declared-driver")).toBeNull();
    },
  );
  it.each([undefined, null, "", "not-a-time"])(
    "does not fabricate profile revision time from malformed stored %j",
    async (updatedAt) => {
      const audit = new AuditNotificationService();
      const sql = sqlTransport({
        "ops.phase1_driver_profiles": [
          {
            driverId: "fixture-declared-driver",
            name: "Full Name",
            driverSurname: "歐陽",
            updatedAt,
            deviceBindings: [],
          },
        ],
      });
      const profiles = new DriverProfileService(
        audit,
        new DriverProfileRepository(sql.database as never),
      );
      await profiles.onModuleInit();
      const registry = new RegulatoryRegistryService(
        new OpsDispatchEventsService(new EventEmitter() as never),
        audit,
        profiles,
      );
      const getter = Reflect.get(
        registry,
        "getDriverDeclaredSurnameSnapshot",
      ) as (id: string) => Row | null;
      expect(getter.call(registry, "fixture-declared-driver")).toBeNull();
    },
  );
  it("a mutated getter DTO cannot change the saved profile or later capture", async () => {
    const ctx = await setup();
    const profile = await ctx.setSurname("歐陽");
    const getter = Reflect.get(
      ctx.registry,
      "getDriverDeclaredSurnameSnapshot",
    ) as (id: string) => Row;
    const mutable = getter.call(ctx.registry, ctx.driverId);
    mutable.driverSurname = "Changed getter DTO";
    mutable.driverSurnameProfileUpdatedAt = "Changed revision";
    expect(ctx.profiles.getProfileForDriver(ctx.driverId).driverSurname).toBe(
      "歐陽",
    );
    const result = await ctx.service.completeDriverTask(ctx.taskId, command);
    expect(result).toMatchObject({
      driverSurname: "歐陽",
      driverSurnameProfileUpdatedAt: profile.updatedAt,
    });
  });
  it("non-certificate completion still persists configured facts without creating a certificate", async () => {
    const ctx = await setup(true, false);
    await ctx.setSurname("歐陽");
    const result = await ctx.service.completeDriverTask(ctx.taskId, command);
    expect((result as Captured).driverSurname).toBe("歐陽");
    expect(
      ctx.taskSql.row("ops.phase1_driver_tasks", ctx.taskId),
    ).toMatchObject({ driverSurname: "歐陽" });
    expect(
      ctx.taskSql.outbox.some(
        (row) => row.effectType === "multi_taxi_certificate",
      ),
    ).toBe(false);
  });
  it("uses saved/reloaded profile JSON and does not materialize unknown or seed surname", async () => {
    const ctx = await setup();
    const getter = Reflect.get(
      ctx.registry,
      "getDriverDeclaredSurnameSnapshot",
    ) as (id: string) => Row | null;
    expect(getter.call(ctx.registry, "fixture-unknown-driver")).toBeNull();
    expect(getter.call(ctx.registry, ctx.driverId)).toBeNull();
    const saved = await ctx.setSurname("歐陽");
    const reloaded = new DriverProfileService(
      new AuditNotificationService(),
      ctx.profileRepository,
    );
    await reloaded.onModuleInit();
    expect(reloaded.getProfileForDriver(ctx.driverId).driverSurname).toBe(
      "歐陽",
    );
    expect(getter.call(ctx.registry, ctx.driverId)).toEqual({
      driverSurname: "歐陽",
      driverSurnameSource: "driver_profile_declared",
      driverSurnameProfileUpdatedAt: saved.updatedAt,
    });
  });
  it("profile changes during an actual repository write cannot split task/event/outbox facts", async () => {
    const ctx = await setup(true);
    const first = await ctx.setSurname("歐陽");
    ctx.taskSql.pauseNextOrderWrite(async () => {
      await ctx.setSurname("Changed during IO");
    });
    const result = await ctx.service.completeDriverTask(
      ctx.taskId,
      command,
      "during-io",
    );
    expect(ctx.profiles.getProfileForDriver(ctx.driverId).driverSurname).toBe(
      "Changed during IO",
    );
    expect(result).toMatchObject({
      driverSurname: "歐陽",
      driverSurnameProfileUpdatedAt: first.updatedAt,
    });
    expect(ctx.event()).toMatchObject({
      driverSurname: "歐陽",
      driverSurnameProfileUpdatedAt: first.updatedAt,
    });
    expect(
      ctx.taskSql.row("ops.phase1_driver_tasks", ctx.taskId),
    ).toMatchObject({ driverSurname: "歐陽" });
  });
  it("real repository commit rejection rolls back snapshot task and outbox without false completion", async () => {
    const ctx = await setup(true);
    await ctx.setSurname("歐陽");
    ctx.taskSql.rejectCommit();
    await expect(
      ctx.service.completeDriverTask(ctx.taskId, command, "rollback"),
    ).rejects.toThrow("fixture COMMIT rejected");
    expect(ctx.service.getDriverTask(ctx.taskId)).toMatchObject({
      status: "on_trip",
    });
    expect(ctx.service.getDriverTask(ctx.taskId)).not.toHaveProperty(
      "driverSurname",
    );
    expect(
      ctx.taskSql.row("ops.phase1_driver_tasks", ctx.taskId),
    ).not.toHaveProperty("driverSurname");
    expect(ctx.taskSql.outbox).toHaveLength(0);
    expect(ctx.events).toHaveLength(0);
    expect(ctx.taskSql.queries.some((query) => query.sql === "ROLLBACK")).toBe(
      true,
    );
  });
  it("actual persisted effect execution publishes detached primitive surname facts", async () => {
    const ctx = await setup(true);
    await ctx.setSurname("歐陽");
    await ctx.service.completeDriverTask(ctx.taskId, command, "actual-effects");
    await ctx.setSurname("New profile");
    const execute = Reflect.get(
      ctx.service,
      "executeDriverCompletionOutboxEffect",
    ) as (row: Row) => Promise<void>;
    const certificate = ctx.taskSql.outbox.find(
      (row) => row.effectType === "multi_taxi_certificate",
    )!;
    await execute.call(ctx.service, certificate);
    expect(ctx.events[0]).toMatchObject({
      driverSurname: "歐陽",
      driverSurnameSource: "driver_profile_declared",
    });
    expect(ctx.events[0]).not.toHaveProperty("registrationNo");
    expect(ctx.events[0]).not.toHaveProperty("e04Snapshot");
  });
});
