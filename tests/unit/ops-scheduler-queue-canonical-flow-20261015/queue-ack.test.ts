import { describe, expect, it } from "vitest";
import type { PoolClient, QueryResultRow } from "pg";
import type {
  DispatchTraceLogRecord,
  OwnedOrderRecord,
} from "../../../packages/contracts/src/index";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { PlatformPresenceService } from "../../../apps/api/src/modules/platform-presence/platform-presence.service";
import { buildOwnedMobilityServiceForTest } from "../system-remediation/sr-qa-dispatch-001/test-support";
import { buildOrderFixture } from "../../../apps/api/tests/integration/voice-order-fixture";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Only the database transport is controlled. The actual Repository performs
// BEGIN/lock/read/INSERT/COMMIT and the actual Service decides membership/rank.
// This is socket-free SQL-boundary evidence, not a PostgreSQL integration claim.
class QueueDatabase {
  traces = new Map<string, DispatchTraceLogRecord>();
  orders = new Map<string, OwnedOrderRecord>();
  jobs = new Map<string, Record<string, unknown>>();
  statements: string[] = [];
  commitGate: ReturnType<typeof deferred> | null = null;
  rejectWrite = false;
  private locks = new Map<string, Promise<void>>();
  isEnabled() {
    return true;
  }
  async connect() {
    const pendingTraces = new Map<string, DispatchTraceLogRecord>();
    const pendingOrders = new Map<string, OwnedOrderRecord>();
    const pendingJobs = new Map<string, Record<string, unknown>>();
    const releases: Array<() => void> = [];
    const query = async <T extends QueryResultRow>(
      sql: string,
      values: readonly unknown[] = [],
    ) => {
      this.statements.push(sql);
      let rows: QueryResultRow[] = [];
      if (/pg_advisory_xact_lock/.test(sql)) {
        const key = String(values[0]);
        const previous = this.locks.get(key) ?? Promise.resolve();
        const held = deferred();
        this.locks.set(
          key,
          previous.then(() => held.promise),
        );
        await previous;
        releases.push(held.resolve);
      } else if (/^COMMIT/.test(sql)) {
        await this.commitGate?.promise;
        for (const [k, v] of pendingTraces) this.traces.set(k, v);
        for (const [k, v] of pendingOrders) this.orders.set(k, v);
        for (const [k, v] of pendingJobs) this.jobs.set(k, v);
        releases.splice(0).forEach((release) => release());
      } else if (/^ROLLBACK/.test(sql)) {
        releases.splice(0).forEach((release) => release());
      } else if (/INSERT INTO ops.phase1_dispatch_trace_logs/.test(sql)) {
        if (this.rejectWrite) throw new Error("controlled queue SQL rejection");
        const trace = JSON.parse(String(values[4])) as DispatchTraceLogRecord;
        pendingTraces.set(trace.traceId, trace);
      } else if (/INSERT INTO ops.phase1_owned_orders/.test(sql)) {
        if (this.rejectWrite) throw new Error("controlled order SQL rejection");
        const order = JSON.parse(
          String(values[values.length - 1]),
        ) as OwnedOrderRecord;
        pendingOrders.set(order.orderId, order);
      } else if (/INSERT INTO ops.phase1_dispatch_jobs/.test(sql)) {
        if (this.rejectWrite)
          throw new Error("controlled dispatch SQL rejection");
        const job = JSON.parse(String(values[values.length - 1])) as Record<
          string,
          unknown
        >;
        pendingJobs.set(String(job.dispatchJobId), job);
      } else if (/FROM ops.phase1_dispatch_trace_logs/.test(sql)) {
        rows = [...this.traces.values()]
          .filter(
            (trace) => !values.length || trace.details?.siteId === values[0],
          )
          .map((record) => ({ record: structuredClone(record) }));
      } else if (/SELECT count\(\*\)/.test(sql)) {
        rows = [{ count: "0" }];
      } else if (/FROM ops.phase1_owned_orders/.test(sql)) {
        const record = this.orders.get(String(values[0]));
        rows = record
          ? [
              {
                record: structuredClone(record),
                aggregate_version: record.aggregateVersion ?? 1,
              },
            ]
          : [];
      } else if (/FROM ops.phase1_dispatch_jobs/.test(sql)) {
        rows = [...this.jobs.values()]
          .filter((job) => job.orderId === values[0])
          .map((record) => ({ record: structuredClone(record) }));
      }
      return {
        rows: rows as T[],
        rowCount: rows.length,
        command: "",
        oid: 0,
        fields: [],
      };
    };
    return { query, release() {} } as unknown as PoolClient;
  }
  async query<T extends QueryResultRow>(
    sql: string,
    values?: readonly unknown[],
  ) {
    const tx = await this.connect();
    const result = await tx.query<T>(sql, values as unknown[]);
    // Bare legacy persistence is intentionally visible immediately in the
    // transport, matching autocommit. The fixed queue path uses a transaction.
    if (/INSERT/.test(sql)) await tx.query("COMMIT");
    return result;
  }
}

function fixture(db?: QueueDatabase, presence?: PlatformPresenceService) {
  const f = buildOwnedMobilityServiceForTest({
    candidates: [
      {
        driverId: "driver-a",
        vehicleId: "vehicle-a",
        etaMinutes: 5,
        operatingArea: "TPE",
        serviceBuckets: ["standard_taxi"],
      },
    ],
    platformPresenceService: presence,
  });
  f.regulatoryRegistryService.listVehicles.mockReturnValue([
    { vehicleId: "vehicle-a", plateNo: "SIM-A", operatingArea: "TPE" },
    { vehicleId: "vehicle-b", plateNo: "SIM-B", operatingArea: "TPE" },
  ] as never);
  f.regulatoryRegistryService.listDrivers.mockReturnValue([
    { driverId: "driver-a", name: "Controlled Driver" },
  ] as never);
  f.regulatoryRegistryService.listSupplyPairs.mockReturnValue([
    { vehicleId: "vehicle-a", driverId: "driver-a", etaMinutes: 5 },
  ] as never);
  if (db) {
    const repository = new OwnedMobilityRepository(db as never);
    Object.assign(f.service, { ownedMobilityRepository: repository });
  }
  return {
    ...f,
    controller: new OwnedMobilityController(f.service, {} as never),
  };
}

const command = { vehicleId: "vehicle-a", siteId: "site-a" };
async function flush() {
  for (let i = 0; i < 35; i++) await Promise.resolve();
}

describe("original OpsQueue canonical commands", () => {
  it("defers actual controller success, cache, trace and audit until SQL COMMIT ACK", async () => {
    const db = new QueueDatabase();
    db.commitGate = deferred();
    const { service, controller, auditNotificationService } = fixture(db);
    let settled = false;
    const pending = Promise.resolve(controller.queueCheckIn(command)).then(
      (result) => {
        settled = true;
        return result;
      },
    );
    await flush();
    expect(settled).toBe(false);
    expect(await service.listQueueEntries()).toEqual([]);
    expect(auditNotificationService.recordAuditLog).not.toHaveBeenCalled();
    expect(db.traces.size).toBe(0);
    db.commitGate.resolve();
    const result = await pending;
    expect(result.data).toMatchObject({
      ...command,
      status: "checked_in",
      position: 1,
    });
    expect(db.traces.size).toBe(1);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledTimes(1);
  });

  it("rejects check-in/out without phantom state/audit, then retries the same context", async () => {
    const db = new QueueDatabase();
    const f = fixture(db);
    db.rejectWrite = true;
    await expect(
      Promise.resolve().then(() => f.controller.queueCheckIn(command)),
    ).rejects.toThrow("controlled");
    expect(await f.service.listQueueEntries()).toEqual([]);
    expect(f.auditNotificationService.recordAuditLog).not.toHaveBeenCalled();
    db.rejectWrite = false;
    const entry = await f.service.queueCheckIn(command);
    db.rejectWrite = true;
    await expect(
      Promise.resolve().then(() => f.controller.queueCheckOut(command)),
    ).rejects.toThrow("controlled");
    expect(await f.service.getQueueEntry(entry.queueEntryId)).toMatchObject({
      status: "checked_in",
    });
    expect(f.auditNotificationService.recordAuditLog).toHaveBeenCalledTimes(1);
    db.rejectWrite = false;
    await f.controller.queueCheckOut(command);
    const fresh = fixture(db);
    expect(await fresh.service.getQueueEntry(entry.queueEntryId)).toMatchObject(
      { status: "checked_out" },
    );
    const replacement = await fresh.service.queueCheckIn(command);
    expect(replacement.queueEntryId).not.toBe(entry.queueEntryId);
    expect(db.traces.size).toBe(3);
  });

  it("two real repository/service instances deduplicate same-context check-in and allocate distinct vehicle ranks", async () => {
    const db = new QueueDatabase();
    const a = fixture(db);
    const b = fixture(db);
    const [first, duplicate] = await Promise.all([
      a.service.queueCheckIn(command),
      b.service.queueCheckIn(command),
    ]);
    expect(duplicate.queueEntryId).toBe(first.queueEntryId);
    expect(db.traces.size).toBe(1);
    const [rank1, rank2] = await Promise.all([
      a.service.queueCheckIn({ vehicleId: "vehicle-a", siteId: "other-site" }),
      b.service.queueCheckIn({ vehicleId: "vehicle-b", siteId: "other-site" }),
    ]);
    expect([rank1.position, rank2.position].sort()).toEqual([1, 2]);
    expect(
      new Set(
        (await fixture(db).service.listQueueEntries()).map(
          (entry) => entry.queueEntryId,
        ),
      ).size,
    ).toBe(3);
    expect(
      db.statements.some((sql) => sql.includes("pg_advisory_xact_lock")),
    ).toBe(true);
  });

  it("returns the requested supported context and preserves peer queue history across check-out", async () => {
    const db = new QueueDatabase();
    const { service } = fixture(db);
    const physical = await service.queueCheckIn(command);
    const stand = await service.queueCheckIn({
      ...command,
      queueMode: "taxi_stand",
    });
    expect(stand.queueMode).toBe("taxi_stand");
    expect(stand.queueEntryId).not.toBe(physical.queueEntryId);
    await service.queueCheckOut({ ...command, queueMode: "taxi_stand" });
    const rows = await fixture(db).service.listQueueEntries();
    expect(
      rows.find((row) => row.queueEntryId === physical.queueEntryId)?.status,
    ).toBe("checked_in");
    expect(
      rows.find((row) => row.queueEntryId === stand.queueEntryId)?.status,
    ).toBe("checked_out");
  });

  it.each(["offline", "busy", "heartbeat_expired"] as const)(
    "uses actual current %s presence and recovers without deleting history",
    async (state) => {
      const presence = new PlatformPresenceService();
      const { service } = fixture(undefined, presence);
      const entry = await service.queueCheckIn(command); // absence of presence is allowed
      if (state === "offline") await presence.setOffline("driver-a", "uber");
      else if (state === "busy") await presence.setBusy("driver-a", "uber");
      else {
        await presence.setOnline("driver-a", "uber");
        const records = await presence.listForDriver("driver-a");
        records[0]!.lastHeartbeatAt = "2020-01-01T00:00:00.000Z";
      }
      expect(
        (await service.getQueueEntry(entry.queueEntryId)).eligibility,
      ).toMatchObject({
        decision: "denied",
        reasonCode: "VEHICLE_NOT_DISPATCHABLE",
      });
      await expect(
        service.queueCheckIn({ ...command, siteId: "another-site" }),
      ).rejects.toMatchObject({ code: "VEHICLE_NOT_DISPATCHABLE" });
      await presence.setOnline("driver-a", "uber");
      expect(
        (await service.getQueueEntry(entry.queueEntryId)).eligibility.decision,
      ).toBe("eligible");
      expect(
        (await service.listQueueEntries()).map((row) => row.queueEntryId),
      ).toContain(entry.queueEntryId);
    },
  );

  it("keeps legal noDB duplicate/check-out and original multi-taxi queue denial", async () => {
    const { service } = fixture();
    const [a, b] = await Promise.all([
      service.queueCheckIn(command),
      service.queueCheckIn(command),
    ]);
    expect(a.queueEntryId).toBe(b.queueEntryId);
    expect((await service.queueCheckOut(command)).status).toBe("checked_out");
    await expect(
      Promise.resolve().then(() => service.queueCheckOut(command)),
    ).rejects.toMatchObject({ code: "QUEUE_ENTRY_NOT_FOUND" });
    await expect(
      Promise.resolve().then(() =>
        service.queueCheckInMultiTaxi(
          { ...command, queueMode: "physical_rank" },
          { authorizationId: "auth-a" } as never,
        ),
      ),
    ).rejects.toMatchObject({ code: "MULTI_TAXI_QUEUE_MODE_FORBIDDEN" });
  });
});

describe("original existing reservation sweep", () => {
  function reservation(db: QueueDatabase) {
    const f = fixture(db);
    const now = new Date();
    const order = buildOrderFixture({
      orderId: "reservation-a",
      businessDispatchSubtype: "enterprise_dispatch",
      serviceBucket: "business_dispatch",
      dispatchSemantics: "reservation",
      status: "redispatch_required",
      reservationHoldStatus: "redispatch_queue",
      reservationWindowStart: new Date(now.getTime() + 60_000).toISOString(),
      reservationWindowEnd: new Date(now.getTime() + 120_000).toISOString(),
    });
    db.orders.set(order.orderId, structuredClone(order));
    Object.assign(f.service, { orders: [structuredClone(order)] });
    return { ...f, order, now };
  }
  it("keeps success count/state/audit pending until reservation canonical ACK", async () => {
    const db = new QueueDatabase();
    db.commitGate = deferred();
    const f = reservation(db);
    let settled = false;
    const pending = f.service
      .runDispatchSchedulerSweep(f.now)
      .then((result) => {
        settled = true;
        return result;
      });
    await flush();
    expect(
      settled,
      JSON.stringify({
        notices: f.auditNotificationService.recordNotification.mock.calls,
        sql: db.statements,
      }),
    ).toBe(false);
    expect(f.service.getOrder(f.order.orderId).status).toBe(
      "redispatch_required",
    );
    expect(f.auditNotificationService.recordAuditLog).not.toHaveBeenCalled();
    db.commitGate.resolve();
    expect(await pending).toMatchObject({
      reservationHoldEscalations: 1,
      failures: 0,
    });
    expect(f.service.getOrder(f.order.orderId).status).toBe("preassigned");
  });
  it("reports rejected reservation write through original sweep failure path and permits a single retry", async () => {
    const db = new QueueDatabase();
    const f = reservation(db);
    db.rejectWrite = true;
    expect(await f.service.runDispatchSchedulerSweep(f.now)).toMatchObject({
      reservationHoldEscalations: 0,
      failures: 1,
    });
    expect(f.service.getOrder(f.order.orderId).status).toBe(
      "redispatch_required",
    );
    db.rejectWrite = false;
    expect(await f.service.runDispatchSchedulerSweep(f.now)).toMatchObject({
      reservationHoldEscalations: 1,
      failures: 0,
    });
    expect(await f.service.runDispatchSchedulerSweep(f.now)).toMatchObject({
      reservationHoldEscalations: 0,
      failures: 0,
    });
    expect(db.jobs.size).toBe(1);
  });
});
