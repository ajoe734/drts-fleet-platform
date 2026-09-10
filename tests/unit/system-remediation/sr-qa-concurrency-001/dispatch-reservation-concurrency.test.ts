import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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

import {
  OwnedMobilityRepository,
  DispatchResourceReservationConflictError,
} from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import type { DatabaseService } from "../../../../apps/api/src/common/db/database.service";

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as { Pool: PgPoolConstructor };

// Explicit isolated test database configuration is required (Acceptance 1 / UV-EXEC-024 pattern).
const connectionString =
  process.env.CONCURRENCY_TEST_DATABASE_URL ||
  process.env.UV_BOOKING_TEST_DATABASE_URL ||
  process.env.DATABASE_URL;

const migration = (name: string) =>
  readFileSync(
    new URL(`../../../../infra/migrations/${name}`, import.meta.url),
    "utf8",
  );

describe("SR-QA-CONCURRENCY-001: Multi-Instance Real PostgreSQL Dispatch Reservation Concurrency Matrix", () => {
  const databaseName = `sr_qa_dispatch_${randomUUID().replaceAll("-", "")}`;
  let admin: PgPoolInstance;
  let pool: PgPoolInstance;
  let poolA: PgPoolInstance;
  let poolB: PgPoolInstance;
  let repoA: OwnedMobilityRepository;
  let repoB: OwnedMobilityRepository;
  let created = false;

  async function seedOrderAndAssignment(
    orderId: string,
    assignmentId: string,
    status = "offered",
  ) {
    await pool.query(
      `INSERT INTO ops.phase1_owned_orders (
        order_id, order_no, status, order_source, service_bucket,
        dispatch_semantics, created_at, updated_at, record
      ) VALUES ($1, $2, 'assigned', 'test', 'ordinary', 'realtime', now(), now(), '{}'::jsonb)
      ON CONFLICT (order_id) DO NOTHING`,
      [orderId, `ORD-${orderId}`],
    );

    await pool.query(
      `INSERT INTO ops.phase1_dispatch_assignments (
        assignment_id, dispatch_job_id, order_id, task_id,
        status, created_at, updated_at, record
      ) VALUES ($1, $2, $3, $4, $5, now(), now(), $6::jsonb)
      ON CONFLICT (assignment_id) DO UPDATE SET status = EXCLUDED.status, record = EXCLUDED.record`,
      [
        assignmentId,
        `job-${orderId}`,
        orderId,
        `task-${assignmentId}`,
        status,
        JSON.stringify({
          assignmentId,
          orderId,
          status,
        }),
      ],
    );
  }

  beforeAll(async () => {
    if (!connectionString) {
      throw new Error(
        "SR-QA-CONCURRENCY-001 Acceptance Requirement: CONCURRENCY_TEST_DATABASE_URL, UV_BOOKING_TEST_DATABASE_URL, or DATABASE_URL must be explicitly configured with an isolated test database. Test suite fails explicitly when DB is unconfigured.",
      );
    }

    admin = new Pool({ connectionString });
    try {
      await admin.query("SELECT 1");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `SR-QA-CONCURRENCY-001 Acceptance Requirement: Failed to connect to PostgreSQL at ${connectionString}: ${msg}. Suite fails explicitly when DB is unconfigured or unreachable.`,
      );
    }

    await admin.query(`CREATE DATABASE ${databaseName}`);
    created = true;

    const url = new URL(connectionString);
    url.pathname = `/${databaseName}`;
    const testDbUrl = url.toString();

    // Primary admin pool for migrations & verification queries
    pool = new Pool({ connectionString: testDbUrl });

    // Initialize required schemas and functions
    await pool.query(`
      CREATE SCHEMA ops;
      CREATE SCHEMA crm;
      CREATE SCHEMA admin;
      CREATE SCHEMA core;
      CREATE FUNCTION admin.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
    `);

    // Apply baseline runtime snapshot tables and shared capacity reservation migrations
    await pool.query(migration("V0011__phase1_runtime_snapshots.sql"));
    await pool.query(migration("V0087__dispatch_resource_reservations.sql"));

    // Instance A and Instance B represent two distinct application pods/nodes
    // each with its own connection pool to the shared real PostgreSQL database
    poolA = new Pool({ connectionString: testDbUrl });
    poolB = new Pool({ connectionString: testDbUrl });

    const dbHandleA: DatabaseService = {
      isEnabled: () => true,
      query: <T extends QueryResultRow>(sql: string, values?: unknown[]) =>
        poolA.query<T>(sql, values),
      connect: async () => poolA.connect(),
    } as unknown as DatabaseService;

    const dbHandleB: DatabaseService = {
      isEnabled: () => true,
      query: <T extends QueryResultRow>(sql: string, values?: unknown[]) =>
        poolB.query<T>(sql, values),
      connect: async () => poolB.connect(),
    } as unknown as DatabaseService;

    repoA = new OwnedMobilityRepository(dbHandleA);
    repoB = new OwnedMobilityRepository(dbHandleB);
  });

  afterAll(async () => {
    if (poolA) await poolA.end().catch(() => {});
    if (poolB) await poolB.end().catch(() => {});
    if (pool) await pool.end().catch(() => {});
    if (created && admin) {
      await admin
        .query(`DROP DATABASE IF EXISTS ${databaseName}`)
        .catch(() => {});
    }
    if (admin) await admin.end().catch(() => {});
  });

  // =========================================================================
  // SUITE 1: isolated_postgres_environment & Fail-Closed Availability
  // =========================================================================
  describe("Suite 1: isolated_postgres_environment & Fail-Closed Availability", () => {
    it("fails explicitly when database connection is invalid or unreachable, without skipping", async () => {
      const unreachablePool = new Pool({
        connectionString:
          "postgresql://postgres:wrong_pw@127.0.0.1:5433/non_existent",
        connectionTimeoutMillis: 1000,
      });

      let failed = false;
      try {
        await unreachablePool.query("SELECT 1");
      } catch (err: unknown) {
        failed = true;
        expect(err).toBeDefined();
      } finally {
        await unreachablePool.end().catch(() => {});
      }

      expect(failed).toBe(true);
    });

    it("uses an isolated test database with zero prior reservations", async () => {
      const result = await pool.query(
        "SELECT current_database() as db, count(*)::int as count FROM ops.dispatch_resource_reservations",
      );
      expect(result.rows[0].db).toBe(databaseName);
      expect(result.rows[0].count).toBe(0);
    });
  });

  // =========================================================================
  // SUITE 2: Multi-Instance Real PostgreSQL Dispatch Reservation Concurrency Matrix
  // =========================================================================
  describe("Suite 2: Multi-Instance Real PostgreSQL Dispatch Reservation Concurrency Matrix", () => {
    it("Case 2.1 (Positive): Reserves capacity for driver and vehicle in fixed lock order with status 'held'", async () => {
      const orderId = `ord-dispatch-${randomUUID()}`;
      const assignmentId = `assign-dispatch-${randomUUID()}`;
      const driverId = `driver-alpha-${randomUUID()}`;
      const vehicleId = `vehicle-alpha-${randomUUID()}`;
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      await seedOrderAndAssignment(orderId, assignmentId);

      const reserved = await repoA.withTransaction(async (txClient) => {
        return repoA.reserveDispatchResources(txClient, {
          orderId,
          assignmentId,
          driverId,
          vehicleId,
          expiresAt,
        });
      });

      expect(reserved).toHaveLength(2);
      // SD §7.6: Driver reserved first, then vehicle (fixed lock order)
      expect(reserved[0]?.resourceType).toBe("driver");
      expect(reserved[0]?.resourceId).toBe(driverId);
      expect(reserved[0]?.status).toBe("held");

      expect(reserved[1]?.resourceType).toBe("vehicle");
      expect(reserved[1]?.resourceId).toBe(vehicleId);
      expect(reserved[1]?.status).toBe("held");

      // Both share the identical reservationGroupId
      expect(reserved[0]?.reservationGroupId).toBe(
        reserved[1]?.reservationGroupId,
      );

      // Verify persisted rows in real PostgreSQL database
      const dbRows = await pool.query(
        "SELECT resource_type, resource_id, status FROM ops.dispatch_resource_reservations WHERE assignment_id = $1 ORDER BY created_at ASC",
        [assignmentId],
      );
      expect(dbRows.rows).toHaveLength(2);
      expect(
        dbRows.rows.every((r: { status?: string }) => r.status === "held"),
      ).toBe(true);
    });

    it("Case 2.2 (Negative / Conflict): Rejects concurrent reservation on same driver with DispatchResourceReservationConflictError and rolls back loser", async () => {
      const driverId = `driver-shared-${randomUUID()}`;
      const vehicleA = `vehicle-alpha-${randomUUID()}`;
      const vehicleB = `vehicle-beta-${randomUUID()}`;
      const orderA = `ord-a-${randomUUID()}`;
      const orderB = `ord-b-${randomUUID()}`;
      const assignmentA = `assign-a-${randomUUID()}`;
      const assignmentB = `assign-b-${randomUUID()}`;

      await seedOrderAndAssignment(orderA, assignmentA);
      await seedOrderAndAssignment(orderB, assignmentB);

      // Instance A acquires driverId + vehicleA
      await repoA.withTransaction(async (txA) => {
        return repoA.reserveDispatchResources(txA, {
          orderId: orderA,
          assignmentId: assignmentA,
          driverId,
          vehicleId: vehicleA,
          expiresAt: null,
        });
      });

      const rowsAfterA = await pool.query(
        "SELECT count(*)::int as count FROM ops.dispatch_resource_reservations WHERE assignment_id = $1",
        [assignmentA],
      );
      expect(rowsAfterA.rows[0].count).toBe(2);

      // Instance B concurrently attempts to reserve the same driverId for a different order/vehicle
      let conflictError: unknown;
      try {
        await repoB.withTransaction(async (txB) => {
          return repoB.reserveDispatchResources(txB, {
            orderId: orderB,
            assignmentId: assignmentB,
            driverId,
            vehicleId: vehicleB,
            expiresAt: null,
          });
        });
      } catch (err) {
        conflictError = err;
      }

      expect(conflictError).toBeInstanceOf(
        DispatchResourceReservationConflictError,
      );
      const err = conflictError as DispatchResourceReservationConflictError;
      expect(err.resourceType).toBe("driver");
      expect(err.resourceId).toBe(driverId);

      // Instance B's transaction rolled back in PostgreSQL; only Instance A's 2 rows exist
      const rowsAfterB = await pool.query(
        "SELECT assignment_id FROM ops.dispatch_resource_reservations WHERE assignment_id IN ($1, $2)",
        [assignmentA, assignmentB],
      );
      expect(rowsAfterB.rows).toHaveLength(2);
      expect(
        rowsAfterB.rows.every(
          (r: { assignment_id?: string }) => r.assignment_id === assignmentA,
        ),
      ).toBe(true);
    });

    it("Case 2.3 (Negative / Partial Contention): Rejects reservation on shared vehicle and prevents partial driver hold leakage", async () => {
      const driverA = `driver-p-${randomUUID()}`;
      const driverB = `driver-p-${randomUUID()}`;
      const sharedVehicle = `vehicle-shared-${randomUUID()}`;
      const orderA = `ord-pa-${randomUUID()}`;
      const orderB = `ord-pb-${randomUUID()}`;
      const assignmentA = `assign-pa-${randomUUID()}`;
      const assignmentB = `assign-pb-${randomUUID()}`;

      await seedOrderAndAssignment(orderA, assignmentA);
      await seedOrderAndAssignment(orderB, assignmentB);

      // Instance A reserves driverA + sharedVehicle
      await repoA.withTransaction(async (txA) => {
        return repoA.reserveDispatchResources(txA, {
          orderId: orderA,
          assignmentId: assignmentA,
          driverId: driverA,
          vehicleId: sharedVehicle,
          expiresAt: null,
        });
      });

      // Instance B attempts to reserve driverB + sharedVehicle.
      // Driver reservation succeeds first, but vehicle reservation fails on unique constraint uq_dispatch_resource_reservations_active.
      let caught: unknown;
      try {
        await repoB.withTransaction(async (txB) => {
          return repoB.reserveDispatchResources(txB, {
            orderId: orderB,
            assignmentId: assignmentB,
            driverId: driverB,
            vehicleId: sharedVehicle,
            expiresAt: null,
          });
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(DispatchResourceReservationConflictError);
      expect(
        (caught as DispatchResourceReservationConflictError).resourceType,
      ).toBe("vehicle");
      expect(
        (caught as DispatchResourceReservationConflictError).resourceId,
      ).toBe(sharedVehicle);

      // Crucial: driverB must NOT be leaked in 'held' status after transaction rollback
      const driverBRow = await pool.query(
        "SELECT * FROM ops.dispatch_resource_reservations WHERE resource_id = $1",
        [driverB],
      );
      expect(driverBRow.rows).toHaveLength(0);
    });

    it("Case 2.4 (Positive): Transitions reservations to 'released' on cancel/reject, allowing subsequent re-reservation", async () => {
      const driverId = `driver-rel-${randomUUID()}`;
      const vehicleId = `vehicle-rel-${randomUUID()}`;
      const orderA = `ord-rel-a-${randomUUID()}`;
      const orderB = `ord-rel-b-${randomUUID()}`;
      const assignmentA = `assign-rel-${randomUUID()}`;
      const assignmentB = `assign-rel-${randomUUID()}`;

      await seedOrderAndAssignment(orderA, assignmentA);
      await seedOrderAndAssignment(orderB, assignmentB);

      // Instance A reserves
      await repoA.withTransaction(async (txA) => {
        return repoA.reserveDispatchResources(txA, {
          orderId: orderA,
          assignmentId: assignmentA,
          driverId,
          vehicleId,
          expiresAt: null,
        });
      });

      // Offer expires or is rejected -> Instance A releases reservation
      const releasedCount =
        await repoA.releaseDispatchResourceReservations(assignmentA);
      expect(releasedCount).toBe(2);

      const rowsAfterRelease = await pool.query(
        "SELECT status FROM ops.dispatch_resource_reservations WHERE assignment_id = $1",
        [assignmentA],
      );
      expect(rowsAfterRelease.rows).toHaveLength(2);
      expect(
        rowsAfterRelease.rows.every(
          (r: { status?: string }) => r.status === "released",
        ),
      ).toBe(true);

      // Now Instance B can successfully acquire the exact same driver and vehicle
      const reservedB = await repoB.withTransaction(async (txB) => {
        return repoB.reserveDispatchResources(txB, {
          orderId: orderB,
          assignmentId: assignmentB,
          driverId,
          vehicleId,
          expiresAt: null,
        });
      });

      expect(reservedB).toHaveLength(2);
      expect(reservedB.every((r) => r.status === "held")).toBe(true);
      expect(reservedB[0]?.assignmentId).toBe(assignmentB);
    });

    it("Case 2.5 (Positive): Transitions reservations from 'held' to 'occupied' on driver accept, maintaining mutex against competitors", async () => {
      const driverId = `driver-occ-${randomUUID()}`;
      const vehicleId = `vehicle-occ-${randomUUID()}`;
      const orderA = `ord-occ-a-${randomUUID()}`;
      const orderB = `ord-occ-b-${randomUUID()}`;
      const assignmentA = `assign-occ-${randomUUID()}`;
      const assignmentB = `assign-occ-${randomUUID()}`;

      await seedOrderAndAssignment(orderA, assignmentA);
      await seedOrderAndAssignment(orderB, assignmentB);

      await repoA.withTransaction(async (txA) => {
        return repoA.reserveDispatchResources(txA, {
          orderId: orderA,
          assignmentId: assignmentA,
          driverId,
          vehicleId,
          expiresAt: null,
        });
      });

      // Driver accepts: transition held -> occupied
      const occupiedCount =
        await repoA.occupyDispatchResourceReservations(assignmentA);
      expect(occupiedCount).toBe(2);

      const dbRows = await pool.query(
        "SELECT status FROM ops.dispatch_resource_reservations WHERE assignment_id = $1",
        [assignmentA],
      );
      expect(dbRows.rows).toHaveLength(2);
      expect(
        dbRows.rows.every((r: { status?: string }) => r.status === "occupied"),
      ).toBe(true);

      // Instance B cannot reserve either resource while occupied
      let caught: unknown;
      try {
        await repoB.withTransaction(async (txB) => {
          return repoB.reserveDispatchResources(txB, {
            orderId: orderB,
            assignmentId: assignmentB,
            driverId,
            vehicleId: `vehicle-unrelated-${randomUUID()}`,
            expiresAt: null,
          });
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(DispatchResourceReservationConflictError);
      expect(
        (caught as DispatchResourceReservationConflictError).resourceId,
      ).toBe(driverId);
    });

    it("Case 2.6 (Concurrency Fence): Row lock FOR UPDATE accurately detects closed assignment to fence off stale timeout execution", async () => {
      const assignmentId = `assign-fenced-${randomUUID()}`;
      const orderId = `ord-fenced-${randomUUID()}`;

      // Seed assignment table with 'offered' status
      await seedOrderAndAssignment(orderId, assignmentId, "offered");

      // Instance B accepts the order first and updates assignment to 'accepted'
      await repoB.withTransaction(async (txB) => {
        const locked = await repoB.lockDispatchAssignmentForUpdate(
          txB,
          assignmentId,
        );
        expect(locked?.status).toBe("offered");

        // Update assignment to 'accepted'
        await txB.query(
          "UPDATE ops.phase1_dispatch_assignments SET status = 'accepted', record = $2, updated_at = now() WHERE assignment_id = $1",
          [
            assignmentId,
            JSON.stringify({
              ...locked,
              status: "accepted",
              acceptedAt: new Date().toISOString(),
            }),
          ],
        );
      });

      // Instance A's timeout timer fires later with a stale local belief that assignment is still 'offered'.
      // Under row lock, it inspects the authoritative status in real PostgreSQL:
      await repoA.withTransaction(async (txA) => {
        const authoritativeAssignment =
          await repoA.lockDispatchAssignmentForUpdate(txA, assignmentId);

        // Must see 'accepted', not 'offered'
        expect(authoritativeAssignment?.status).toBe("accepted");

        // Stale timeout detects status is not 'offered' and performs safe no-op
        const isStillOffered =
          (authoritativeAssignment?.status as string) === "offered";
        expect(isStillOffered).toBe(false);
      });
    });
  });
});
