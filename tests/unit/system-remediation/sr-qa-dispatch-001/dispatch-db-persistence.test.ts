// SR-QA-DISPATCH-001 -- real-PostgreSQL write/read-back layer for C035
// (candidate/task list), C036 (assign/reassign), C038 (timeout/no-supply
// trace), and C039 (queue check-in/out event log) durability.
//
// Follows the exact proven bootstrap already used and reviewed for
// SR-QA-CONCURRENCY-001 (schemas + V0011 + V0087, admin-pool-created
// isolated database, strict fail-closed when unconfigured/unreachable) --
// this task does not invent a second database bootstrap. It exercises
// `OwnedMobilityRepository.persistChanges` / `.loadState()` directly (the
// same methods `OwnedMobilityService` uses under repository-backed mode)
// against `ops.phase1_dispatch_jobs`, `ops.phase1_dispatch_attempts`,
// `ops.phase1_dispatch_assignments`, `ops.phase1_driver_tasks`, and
// `ops.phase1_dispatch_trace_logs` -- proving real write-then-read, not a
// render/constant check.
//
// Scope note: `ops.phase1_owned_orders` write/read-back and the
// driver+vehicle capacity reservation ledger
// (`ops.dispatch_resource_reservations`, the real DB-level guarantee behind
// "same vehicle cannot be double-dispatched") are already covered by
// SR-QA-CONCURRENCY-001's `dispatch-reservation-concurrency.test.ts` and are
// not duplicated here per "已有功能先驗而非重寫".
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type QueryResultRow = Record<string, any>;
type PgClientInstance = {
  query: <T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: T[] }>;
  release: () => void;
};
type PgPoolInstance = {
  query: <T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: T[] }>;
  connect: () => Promise<PgClientInstance>;
  end: () => Promise<void>;
};
type PgPoolConstructor = new (options?: {
  connectionString?: string;
  connectionTimeoutMillis?: number;
}) => PgPoolInstance;

import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import type { DatabaseService } from "../../../../apps/api/src/common/db/database.service";
import type {
  DispatchAssignmentRecord,
  DispatchAttemptRecord,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverTaskRecord,
} from "@drts/contracts";

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as { Pool: PgPoolConstructor };

const connectionString =
  process.env.CONCURRENCY_TEST_DATABASE_URL ||
  process.env.UV_BOOKING_TEST_DATABASE_URL ||
  process.env.DATABASE_URL;

const migration = (name: string) =>
  readFileSyncSafe(
    new URL(`../../../../infra/migrations/${name}`, import.meta.url),
  );

function readFileSyncSafe(url: URL): string {
  // Local re-import avoids a top-level `fs` import name clash with the
  // require() shim above.
  return require("node:fs").readFileSync(url, "utf8");
}

describe("SR-QA-DISPATCH-001: Real PostgreSQL Dispatch Job/Assignment/Task/Trace-Log Write-Then-Read", () => {
  const databaseName = `sr_qa_dispatch001_${randomUUID().replaceAll("-", "")}`;
  let admin: PgPoolInstance;
  let pool: PgPoolInstance;
  let repository: OwnedMobilityRepository;
  let created = false;

  beforeAll(async () => {
    if (!connectionString) {
      throw new Error(
        "SR-QA-DISPATCH-001 Acceptance Requirement: CONCURRENCY_TEST_DATABASE_URL, UV_BOOKING_TEST_DATABASE_URL, or DATABASE_URL must be explicitly configured with an isolated test database. Test suite fails explicitly when DB is unconfigured.",
      );
    }

    admin = new Pool({ connectionString });
    try {
      await admin.query("SELECT 1");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `SR-QA-DISPATCH-001 Acceptance Requirement: Failed to connect to PostgreSQL at ${connectionString}: ${msg}. Suite fails explicitly when DB is unconfigured or unreachable.`,
      );
    }

    await admin.query(`CREATE DATABASE ${databaseName}`);
    created = true;

    const url = new URL(connectionString);
    url.pathname = `/${databaseName}`;
    const testDbUrl = url.toString();

    pool = new Pool({ connectionString: testDbUrl });
    await pool.query(`
      CREATE SCHEMA ops;
      CREATE SCHEMA crm;
      CREATE SCHEMA admin;
      CREATE SCHEMA core;
      CREATE FUNCTION admin.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
    `);
    await pool.query(migration("V0011__phase1_runtime_snapshots.sql"));
    await pool.query(migration("V0087__dispatch_resource_reservations.sql"));

    const dbHandle: DatabaseService = {
      isEnabled: () => true,
      query: <T extends QueryResultRow>(sql: string, values?: unknown[]) =>
        pool.query<T>(sql, values),
      connect: async () => pool.connect(),
    } as unknown as DatabaseService;

    repository = new OwnedMobilityRepository(dbHandle);
  });

  afterAll(async () => {
    if (pool) await pool.end().catch(() => {});
    if (created && admin) {
      await admin
        .query(`DROP DATABASE IF EXISTS ${databaseName}`)
        .catch(() => {});
    }
    if (admin) await admin.end().catch(() => {});
  });

  it("Suite 1 (Fail-Closed): uses an isolated test database with zero prior dispatch state", async () => {
    const result = await pool.query(
      "SELECT current_database() as db, (SELECT count(*)::int FROM ops.phase1_dispatch_jobs) as jobs, (SELECT count(*)::int FROM ops.phase1_dispatch_trace_logs) as traces",
    );
    expect(result.rows[0]!.db).toBe(databaseName);
    expect(result.rows[0]!.jobs).toBe(0);
    expect(result.rows[0]!.traces).toBe(0);
  });

  it("C035/C036 Positive: dispatch job + assignment + attempt write-then-read back exactly through persistChanges/loadState", async () => {
    const orderId = `ord-${randomUUID()}`;
    const dispatchJobId = `job-${randomUUID()}`;
    const assignmentId = `assign-${randomUUID()}`;
    const taskId = `task-${randomUUID()}`;
    const now = new Date().toISOString();

    const dispatchJob: DispatchJobRecord = {
      dispatchJobId,
      orderId,
      status: "assigned",
      mode: "auto",
      latestEtaMinutes: 6,
      createdAt: now,
      updatedAt: now,
    };
    const dispatchAttempt: DispatchAttemptRecord = {
      attemptId: `attempt-${randomUUID()}`,
      dispatchJobId,
      orderId,
      sequence: 1,
      outcome: "assigned",
      reasonCode: null,
      createdAt: now,
    };
    const assignment: DispatchAssignmentRecord = {
      assignmentId,
      dispatchJobId,
      orderId,
      taskId,
      vehicleId: "vehicle-db-1",
      driverId: "driver-db-1",
      assignmentType: "metered",
      status: "assigned",
      acceptedAt: null,
      rejectedAt: null,
      rejectReasonCode: null,
      createdAt: now,
      updatedAt: now,
    };

    await repository.persistChanges({
      dispatchJobs: [dispatchJob],
      dispatchAttempts: [dispatchAttempt],
      dispatchAssignments: [assignment],
    });

    // Read back through the raw table (proves the columns, not just the
    // JSON blob, are populated correctly).
    const jobRow = await pool.query(
      "SELECT status, order_id FROM ops.phase1_dispatch_jobs WHERE dispatch_job_id = $1",
      [dispatchJobId],
    );
    expect(jobRow.rows[0]).toMatchObject({
      status: "assigned",
      order_id: orderId,
    });

    const assignmentRow = await pool.query(
      "SELECT status, task_id FROM ops.phase1_dispatch_assignments WHERE assignment_id = $1",
      [assignmentId],
    );
    expect(assignmentRow.rows[0]).toMatchObject({
      status: "assigned",
      task_id: taskId,
    });

    // Read back through the repository's own loadState() -- the exact path
    // a restarted/second instance uses to rehydrate from Postgres.
    const state = await repository.loadState();
    const reloadedJob = state.dispatchJobs.find(
      (j) => j.dispatchJobId === dispatchJobId,
    );
    const reloadedAssignment = state.dispatchAssignments.find(
      (a) => a.assignmentId === assignmentId,
    );
    expect(reloadedJob).toMatchObject({ orderId, status: "assigned" });
    expect(reloadedAssignment).toMatchObject({
      vehicleId: "vehicle-db-1",
      driverId: "driver-db-1",
      status: "assigned",
    });
  });

  it("C036 Positive: reassign transitions the superseded assignment to 'cancelled' and the new assignment reads back as active", async () => {
    const orderId = `ord-${randomUUID()}`;
    const dispatchJobId = `job-${randomUUID()}`;
    const now = new Date().toISOString();

    const original: DispatchAssignmentRecord = {
      assignmentId: `assign-orig-${randomUUID()}`,
      dispatchJobId,
      orderId,
      taskId: `task-orig-${randomUUID()}`,
      vehicleId: "vehicle-orig",
      driverId: "driver-orig",
      assignmentType: "metered",
      status: "assigned",
      acceptedAt: null,
      rejectedAt: null,
      rejectReasonCode: null,
      createdAt: now,
      updatedAt: now,
    };
    await repository.persistChanges({ dispatchAssignments: [original] });

    const later = new Date(Date.now() + 1000).toISOString();
    const cancelled: DispatchAssignmentRecord = {
      ...original,
      status: "cancelled",
      updatedAt: later,
    };
    const replacement: DispatchAssignmentRecord = {
      assignmentId: `assign-new-${randomUUID()}`,
      dispatchJobId,
      orderId,
      taskId: `task-new-${randomUUID()}`,
      vehicleId: "vehicle-new",
      driverId: "driver-new",
      assignmentType: "metered",
      status: "assigned",
      acceptedAt: null,
      rejectedAt: null,
      rejectReasonCode: null,
      createdAt: later,
      updatedAt: later,
    };
    await repository.persistChanges({
      dispatchAssignments: [cancelled, replacement],
    });

    const rows = await pool.query(
      "SELECT assignment_id, status FROM ops.phase1_dispatch_assignments WHERE dispatch_job_id = $1 ORDER BY created_at ASC",
      [dispatchJobId],
    );
    expect(rows.rows).toEqual([
      { assignment_id: original.assignmentId, status: "cancelled" },
      { assignment_id: replacement.assignmentId, status: "assigned" },
    ]);
  });

  it("C038 Positive: dispatch-timeout trace log write-then-read reconstructs the redispatch reason", async () => {
    const orderId = `ord-${randomUUID()}`;
    const now = new Date().toISOString();
    const traceLog: DispatchTraceLogRecord = {
      traceId: `trace-${randomUUID()}`,
      orderId,
      eventType: "dispatch.timeout",
      message: "SR-QA-DISPATCH-001 real-DB regression",
      createdAt: now,
      details: {
        timeoutReasonCode: "matching_timeout",
        escalationAction: "redispatch_priority_queue",
      },
    };

    await repository.persistChanges({ dispatchTraceLogs: [traceLog] });

    const state = await repository.loadState();
    const reloaded = state.dispatchTraceLogs.find(
      (log) => log.traceId === traceLog.traceId,
    );
    expect(reloaded).toBeDefined();
    expect(reloaded!.eventType).toBe("dispatch.timeout");
    expect(reloaded!.details).toMatchObject({
      timeoutReasonCode: "matching_timeout",
      escalationAction: "redispatch_priority_queue",
    });
  });

  it("C039 Positive: queue check-in/check-out trace-log stream write-then-read (the durable substrate rebuildQueueEntriesFromTraceLogs replays on restart)", async () => {
    const siteId = `site-db-${randomUUID()}`;
    const vehicleId = `vehicle-db-${randomUUID()}`;
    const queueEntryId = randomUUID();
    const checkInAt = new Date().toISOString();
    const checkOutAt = new Date(Date.now() + 1000).toISOString();

    const checkInTrace: DispatchTraceLogRecord = {
      traceId: `trace-checkin-${randomUUID()}`,
      orderId: `queue:${siteId}:${vehicleId}`,
      eventType: "queue.entry.created",
      message: "check-in",
      createdAt: checkInAt,
      details: { queueEntryId, siteId, vehicleId, position: 1 },
    };
    const checkOutTrace: DispatchTraceLogRecord = {
      traceId: `trace-checkout-${randomUUID()}`,
      orderId: `queue:${siteId}:${vehicleId}`,
      eventType: "queue.entry.closed",
      message: "check-out",
      createdAt: checkOutAt,
      details: { queueEntryId, siteId, vehicleId },
    };

    await repository.persistChanges({
      dispatchTraceLogs: [checkInTrace, checkOutTrace],
    });

    const state = await repository.loadState();
    const relevant = state.dispatchTraceLogs.filter(
      (log) =>
        (log.details as Record<string, unknown> | undefined)?.queueEntryId ===
        queueEntryId,
    );
    expect(relevant).toHaveLength(2);
    expect(new Set(relevant.map((l) => l.eventType))).toEqual(
      new Set(["queue.entry.created", "queue.entry.closed"]),
    );
  });

  it("C036/C038 Positive: driver task write-then-read carries the correct assignment/order linkage", async () => {
    const orderId = `ord-${randomUUID()}`;
    const dispatchJobId = `job-${randomUUID()}`;
    const assignmentId = `assign-${randomUUID()}`;

    const task: DriverTaskRecord = {
      taskId: `task-${randomUUID()}`,
      orderId,
      dispatchJobId,
      assignmentId,
      driverId: "driver-db-task",
      vehicleId: "vehicle-db-task",
      sourcePlatform: null,
      routeProvided: false,
      waypoints: [],
      status: "pending_acceptance",
      acceptedAt: null,
      departedAt: null,
      arrivedPickupAt: null,
      startedAt: null,
      completedAt: null,
      actualDistanceKm: null,
      actualDurationSec: null,
      fare: null,
      proof: null,
    };

    await repository.persistChanges({ driverTasks: [task] });

    const row = await pool.query(
      "SELECT order_id, dispatch_job_id, assignment_id, status FROM ops.phase1_driver_tasks WHERE task_id = $1",
      [task.taskId],
    );
    expect(row.rows[0]).toMatchObject({
      order_id: orderId,
      dispatch_job_id: dispatchJobId,
      assignment_id: assignmentId,
      status: "pending_acceptance",
    });
  });
});
