import { describe, expect, it } from "vitest";
import type { ShiftRecord } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ShiftAttendanceRepository } from "../../../apps/api/src/modules/shift-attendance/shift-attendance.repository";
import { ShiftAttendanceService } from "../../../apps/api/src/modules/shift-attendance/shift-attendance.service";
import { ShiftAttendanceController } from "../../../apps/api/src/modules/shift-attendance/shift-attendance.controller";
import { DriverLeaveRepository } from "../../../apps/api/src/modules/driver-leave/driver-leave.repository";

// A socket-free, READ COMMITTED port: independent clients, staged writes,
// row locks retained through commit/rollback, and predicate recheck after wait.
// Scheduling is by observed SQL events, never wall-clock sleeps or fake timers.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Event = { kind: string; tx: number; sql: string; key?: string };
type ShiftRow = {
  driver: string;
  status: string;
  record: Record<string, unknown>;
};

function createConcurrentDatabase() {
  const shifts = new Map<string, ShiftRow>();
  const attendance = new Map<string, Record<string, unknown>>();
  const locks = new Map<string, number>();
  const queues = new Map<string, (() => void)[]>();
  const events: Event[] = [];
  const watchers: {
    match: (event: Event) => boolean;
    done: (event: Event) => void;
  }[] = [];
  let sequence = 0;
  let pause:
    | {
        match: (event: Event) => boolean;
        reached: ReturnType<typeof deferred<Event>>;
        resume: ReturnType<typeof deferred<void>>;
      }
    | undefined;
  let failedUpdate = false;

  function emit(event: Event) {
    events.push(event);
    for (const watcher of [...watchers]) {
      if (watcher.match(event)) {
        watchers.splice(watchers.indexOf(watcher), 1);
        watcher.done(event);
      }
    }
  }

  async function take(key: string, tx: number, sql: string) {
    while (locks.has(key) && locks.get(key) !== tx) {
      const wake = deferred<void>();
      const queue = queues.get(key) ?? [];
      queue.push(() => wake.resolve());
      queues.set(key, queue);
      emit({ kind: "blocked", tx, key, sql });
      await wake.promise;
    }
    locks.set(key, tx);
  }

  function release(tx: number) {
    for (const [key, owner] of [...locks]) {
      if (owner === tx) {
        locks.delete(key);
        const pending = queues.get(key) ?? [];
        queues.delete(key);
        pending.forEach((wake) => wake());
      }
    }
  }

  function client() {
    const tx = ++sequence;
    const writes = new Map<string, ShiftRow>();
    const attendanceWrites = new Map<string, Record<string, unknown>>();
    let transaction = false;
    let aborted = false;
    const read = (id: string) => writes.get(id) ?? shifts.get(id);
    async function query(input: string, values: readonly unknown[] = []) {
      const sql = input.replace(/\s+/g, " ").trim();
      const text = (index: number) => String(values[index]);
      const rows: Record<string, unknown>[] = [];
      if (aborted && !sql.startsWith("ROLLBACK")) {
        throw Object.assign(new Error("current transaction is aborted"), {
          code: "25P02",
        });
      }
      if (sql === "BEGIN") {
        transaction = true;
        return { rows };
      }
      if (sql === "COMMIT") {
        for (const [id, row] of writes) shifts.set(id, structuredClone(row));
        for (const [id, row] of attendanceWrites)
          attendance.set(id, structuredClone(row));
        writes.clear();
        attendanceWrites.clear();
        transaction = false;
        release(tx);
        emit({ kind: "commit", tx, sql });
        return { rows };
      }
      if (sql === "ROLLBACK") {
        aborted = false;
        writes.clear();
        attendanceWrites.clear();
        transaction = false;
        release(tx);
        emit({ kind: "rollback", tx, sql });
        return { rows };
      }
      if (sql.startsWith("ROLLBACK TO SAVEPOINT")) {
        aborted = false;
        return { rows };
      }
      if (sql.startsWith("SAVEPOINT")) return { rows };
      if (sql.includes("FROM reg.phase1_registry_drivers")) {
        await take("driver:" + text(0), tx, sql);
        rows.push({ driver_id: text(0) });
      } else if (
        sql.includes("SELECT") &&
        sql.includes("FROM ops.phase1_driver_shifts")
      ) {
        let ids = [...new Set([...shifts.keys(), ...writes.keys()])];
        if (sql.includes("WHERE shift_id = $1"))
          ids = ids.filter((id) => id === text(0));
        else if (sql.includes("WHERE driver_id = $1"))
          ids = ids.filter((id) => read(id)?.driver === text(0));
        const eligible = (id: string) => {
          const row = read(id);
          if (!row) return false;
          if (sql.includes("status = 'active'") && row.status !== "active")
            return false;
          if (sql.includes("scheduled_start")) {
            const record = row.record;
            const start = Date.parse(String(record.clockedInAt));
            const end = record.clockedOutAt
              ? Date.parse(String(record.clockedOutAt))
              : Infinity;
            return start < Date.parse(text(2)) && end > Date.parse(text(1));
          }
          return true;
        };
        for (const id of ids.filter(eligible)) {
          if (sql.includes("FOR UPDATE")) await take("shift:" + id, tx, sql);
          if (!eligible(id)) continue; // PostgreSQL READ COMMITTED lock-wait recheck.
          rows.push({
            shift_id: id,
            record: structuredClone(read(id)!.record),
          });
        }
        const event = { kind: "read", tx, sql };
        emit(event);
        const gate = pause;
        if (gate?.match(event)) {
          pause = undefined;
          gate.reached.resolve(event);
          await gate.resume.promise;
        }
      } else if (sql.includes("INSERT INTO ops.phase1_driver_shifts")) {
        const id = text(0);
        await take("shift:" + id, tx, sql);
        writes.set(id, {
          driver: text(2),
          status: text(4),
          record: JSON.parse(text(9)),
        });
      } else if (sql.includes("UPDATE ops.phase1_driver_shifts")) {
        const annotation = sql.includes("SET record = $1::jsonb");
        const id = text(annotation ? 1 : 0);
        await take("shift:" + id, tx, sql);
        if (failedUpdate) {
          failedUpdate = false;
          throw new Error("shift update rejected");
        }
        const current = read(id);
        if (!current) throw new Error("update of missing shift");
        writes.set(id, {
          ...current,
          status: annotation ? current.status : text(1),
          record: JSON.parse(text(annotation ? 0 : 4)),
        });
      } else if (sql.includes("INSERT INTO ops.phase1_driver_attendance")) {
        if (attendance.has(text(0)) || attendanceWrites.has(text(0))) {
          aborted = transaction;
          throw Object.assign(new Error("duplicate attendance identity"), {
            code: "23505",
          });
        }
        attendanceWrites.set(text(0), JSON.parse(text(7)));
      } else if (
        sql.includes("SELECT attendance_id FROM ops.phase1_driver_attendance")
      ) {
        const last = [...attendance.keys()].sort().reverse()[0];
        if (last) rows.push({ attendance_id: last });
      } else if (sql.includes("FROM ops.phase1_driver_attendance")) {
        for (const record of attendance.values()) {
          if (!sql.includes("WHERE driver_id") || record.driverId === text(0))
            rows.push({ record: structuredClone(record) });
        }
      } else throw new Error("Unhandled SQL: " + sql);
      if (!transaction) {
        for (const [id, row] of writes) shifts.set(id, structuredClone(row));
        for (const [id, row] of attendanceWrites)
          attendance.set(id, structuredClone(row));
        writes.clear();
        attendanceWrites.clear();
        release(tx);
        emit({ kind: "commit", tx, sql: "AUTOCOMMIT " + sql });
      }
      return { rows };
    }
    return { query, release: () => release(tx) };
  }

  return {
    databaseService: {
      isEnabled: () => true,
      connect: async () => client(),
      query: (sql: string, values?: readonly unknown[]) =>
        client().query(sql, values),
    },
    pauseRead(match: (event: Event) => boolean) {
      const gate = {
        match,
        reached: deferred<Event>(),
        resume: deferred<void>(),
      };
      pause = gate;
      return gate;
    },
    wait(match: (event: Event) => boolean) {
      const known = events.find(match);
      if (known) return Promise.resolve(known);
      return new Promise<Event>((done) => watchers.push({ match, done }));
    },
    checkpoint() {
      return events.length;
    },
    row(id: string) {
      return structuredClone(shifts.get(id));
    },
    attendance() {
      return [...attendance.values()].map((row) => structuredClone(row));
    },
    lockCount() {
      return locks.size;
    },
    failUpdate() {
      failedUpdate = true;
    },
    events,
  };
}

function instance(db: ReturnType<typeof createConcurrentDatabase>) {
  const audit = new AuditNotificationService();
  const repo = new ShiftAttendanceRepository(db.databaseService as never);
  const service = new ShiftAttendanceService(audit, repo);
  return { service, audit, controller: new ShiftAttendanceController(service) };
}

const outcome = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason }),
  );
const activeRead = (event: Event) =>
  event.sql.includes(
    "SELECT record FROM ops.phase1_driver_shifts WHERE driver_id",
  ) && event.sql.includes("status = 'active'");
const annotationRead = (event: Event) =>
  event.sql.includes("SELECT shift_id, record") &&
  event.sql.includes("scheduled_start");
const abandonRead = (event: Event) =>
  event.sql.includes(
    "SELECT record FROM ops.phase1_driver_shifts WHERE shift_id = $1 FOR UPDATE",
  );

async function setup() {
  const db = createConcurrentDatabase();
  const a = instance(db);
  const b = instance(db);
  const shift = (await a.controller.clockIn({ driverId: "drv-overlap" })).data;
  await b.service.onModuleInit();
  return { db, a, b, shift };
}

describe("C051 actual overlapping terminal commands and leave annotations", () => {
  it("keeps the first clock-out terminal result when abandon overlaps its read/update", async () => {
    const { db, a, b, shift } = await setup();
    const gate = db.pauseRead(activeRead);
    const out = outcome(
      a.controller.clockOut({
        driverId: shift.driverId,
        notes: "finished normally",
      }),
    );
    const reader = await gate.reached.promise;
    const start = db.checkpoint();
    const abandon = outcome(
      b.controller.abandonShift(shift.shiftId, { reason: "interrupted" }),
    );
    await db.wait(
      (e) =>
        db.events.indexOf(e) >= start &&
        e.tx !== reader.tx &&
        (e.kind === "blocked" || (e.kind === "commit" && e.sql === "COMMIT")),
    );
    gate.resume.resolve();
    const [ended, stopped] = await Promise.all([out, abandon]);
    expect(ended.status).toBe("fulfilled");
    expect(stopped).toMatchObject({
      status: "rejected",
      reason: { code: "SHIFT_NOT_ACTIVE" },
    });
    expect(db.row(shift.shiftId)).toMatchObject({
      status: "completed",
      record: { status: "completed", notes: "finished normally" },
    });
    expect(db.attendance()).toHaveLength(1);
    expect(
      b.audit
        .listAuditLogs()
        .filter((log) => log.actionName === "abandon_shift"),
    ).toHaveLength(0);
    expect(db.lockCount()).toBe(0);
  });

  it("rejects clock-out after waiting for an overlapping abandon commit", async () => {
    const { db, a, b, shift } = await setup();
    const gate = db.pauseRead(abandonRead);
    const abandon = outcome(
      b.controller.abandonShift(shift.shiftId, { reason: "interrupted first" }),
    );
    const reader = await gate.reached.promise;
    const start = db.checkpoint();
    const out = outcome(a.controller.clockOut({ driverId: shift.driverId }));
    await db.wait(
      (e) =>
        db.events.indexOf(e) >= start &&
        e.tx !== reader.tx &&
        e.kind === "blocked" &&
        e.key === "shift:" + shift.shiftId,
    );
    gate.resume.resolve();
    const [stopped, ended] = await Promise.all([abandon, out]);
    expect(stopped.status).toBe("fulfilled");
    expect(ended).toMatchObject({
      status: "rejected",
      reason: { code: "NO_ACTIVE_SHIFT" },
    });
    expect(db.row(shift.shiftId)).toMatchObject({
      status: "abandoned",
      record: { status: "abandoned", notes: "interrupted first" },
    });
    expect(db.attendance()).toHaveLength(0);
    expect(
      a.audit.listAuditLogs().filter((log) => log.actionName === "clock_out"),
    ).toHaveLength(0);
    expect(db.lockCount()).toBe(0);
  });

  it.each([false, true])(
    "keeps both the terminal result and leave annotation (existing executor=%s)",
    async (existingExecutor) => {
      const { db, a, shift } = await setup();
      const leave = new DriverLeaveRepository(db.databaseService as never);
      const gate = db.pauseRead(annotationRead);
      const annotate = (
        executor?: Parameters<
          DriverLeaveRepository["annotateOverlappingShifts"]
        >[4],
      ) =>
        leave.annotateOverlappingShifts(
          shift.driverId,
          "leave-overlap",
          "2000-01-01T00:00:00Z",
          "2099-01-01T00:00:00Z",
          executor,
        );
      const annotation = outcome(
        existingExecutor
          ? leave.withTransaction((executor) => annotate(executor))
          : annotate(),
      );
      const reader = await gate.reached.promise;
      const start = db.checkpoint();
      const out = outcome(
        a.controller.clockOut({
          driverId: shift.driverId,
          notes: "kept terminal notes",
        }),
      );
      await db.wait(
        (e) =>
          db.events.indexOf(e) >= start &&
          e.tx !== reader.tx &&
          (e.kind === "blocked" || (e.kind === "commit" && e.sql === "COMMIT")),
      );
      gate.resume.resolve();
      const [annotated, ended] = await Promise.all([annotation, out]);
      expect(annotated).toMatchObject({
        status: "fulfilled",
        value: [shift.shiftId],
      });
      expect(ended.status).toBe("fulfilled");
      expect(db.row(shift.shiftId)).toMatchObject({
        status: "completed",
        record: {
          status: "completed",
          notes: "kept terminal notes",
          leaveReassigned: true,
          reassignedReason: "DRIVER_ON_LEAVE",
          leaveId: "leave-overlap",
        },
      });
      expect(db.attendance()).toHaveLength(1);
      expect(db.lockCount()).toBe(0);
    },
  );

  it.each(["clock-out", "abandon"])(
    "preserves the committed %s result when annotation starts behind its active snapshot",
    async (terminal) => {
      const { db, a, b, shift } = await setup();
      const leave = new DriverLeaveRepository(db.databaseService as never);
      const gate = db.pauseRead(
        terminal === "clock-out" ? activeRead : abandonRead,
      );
      const ending = outcome<unknown>(
        terminal === "clock-out"
          ? a.controller.clockOut({
              driverId: shift.driverId,
              notes: "terminal reason",
            })
          : b.controller.abandonShift(shift.shiftId, {
              reason: "terminal reason",
            }),
      );
      const reader = await gate.reached.promise;
      const start = db.checkpoint();
      const annotation = outcome(
        leave.annotateOverlappingShifts(
          shift.driverId,
          "leave-after-terminal",
          "2000-01-01T00:00:00Z",
          "2099-01-01T00:00:00Z",
        ),
      );
      await db.wait(
        (e) =>
          db.events.indexOf(e) >= start &&
          e.tx !== reader.tx &&
          (e.kind === "blocked" ||
            (e.kind === "commit" &&
              (e.sql === "COMMIT" ||
                e.sql.startsWith(
                  "AUTOCOMMIT UPDATE ops.phase1_driver_shifts",
                )))),
      );
      gate.resume.resolve();
      const [ended, annotated] = await Promise.all([ending, annotation]);
      expect(ended.status).toBe("fulfilled");
      expect(annotated).toMatchObject({
        status: "fulfilled",
        value: [shift.shiftId],
      });
      const status = terminal === "clock-out" ? "completed" : "abandoned";
      expect(db.row(shift.shiftId)).toMatchObject({
        status,
        record: {
          status,
          notes: "terminal reason",
          leaveReassigned: true,
          reassignedReason: "DRIVER_ON_LEAVE",
          leaveId: "leave-after-terminal",
        },
      });
      expect(db.attendance()).toHaveLength(terminal === "clock-out" ? 1 : 0);
      expect(db.lockCount()).toBe(0);
    },
  );

  it("releases terminal row locks on rollback and does not publish failed attendance/audit", async () => {
    const { db, a, b, shift } = await setup();
    db.failUpdate();
    await expect(
      a.controller.clockOut({ driverId: shift.driverId }),
    ).rejects.toThrow("shift update rejected");
    expect(db.row(shift.shiftId)?.record.status).toBe("active");
    expect(db.attendance()).toHaveLength(0);
    expect(
      a.audit.listAuditLogs().filter((log) => log.actionName === "clock_out"),
    ).toHaveLength(0);
    expect(
      (
        await b.controller.abandonShift(shift.shiftId, {
          reason: "after rollback",
        })
      ).data.status,
    ).toBe("abandoned");
    expect(db.lockCount()).toBe(0);
  });

  it("allows a different driver's terminal command to commit while one shift is held", async () => {
    const { db, a, b, shift } = await setup();
    const other: ShiftRecord = (
      await b.controller.clockIn({ driverId: "drv-independent" })
    ).data;
    const gate = db.pauseRead((event) => activeRead(event));
    const out = outcome(a.controller.clockOut({ driverId: shift.driverId }));
    await gate.reached.promise;
    expect(
      (await b.controller.clockOut({ driverId: other.driverId })).data.shift
        .status,
    ).toBe("completed");
    expect(db.row(other.shiftId)?.record.status).toBe("completed");
    gate.resume.resolve();
    expect((await out).status).toBe("fulfilled");
    expect(db.attendance()).toHaveLength(2);
    expect(db.lockCount()).toBe(0);
  });
});
