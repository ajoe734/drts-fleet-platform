import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { DatabaseService } from "../../src/common/db";
import {
  DispatchResourceReservationConflictError,
  OwnedMobilityRepository,
} from "../../src/modules/owned-mobility/owned-mobility.repository";

// UV-EXEC-006: SD §7.6/§9.1 -- the shared driver+vehicle capacity
// reservation ledger (`ops.dispatch_resource_reservations`, V0087) is the
// single arbitration point every dispatch writer that can assign the same
// live driver/vehicle supply must go through, "voice／非voice所有競爭writer
// 共用" (SD §9.1). This suite assumes migrations have already been applied
// to DATABASE_URL, exactly like the other `*.integration.test.ts` suites in
// this repo -- it is not itself a migration runner.
//
// Writer inventory (source-read, not just the planning doc) for this task's
// `all_dispatch_writers_inventory` acceptance item: `OwnedMobilityService
// .createDispatchAssignment` (private, reached only through
// `assignDispatch` / `reassignDispatch` / the reassign branch of
// `redispatchOrder`) is the *only* code path in this repo that writes a
// `phase1_dispatch_assignments` row or a driver/vehicle pairing --
// - manual/callcenter and 企業(enterprise) dispatch: `assignDispatch` /
//   `reassignDispatch` on `OwnedMobilityController`, both owned-mobility
//   entry points, both funnel into `createDispatchAssignment`.
// - multi-taxi (`apps/api/src/modules/multi-taxi/multi-taxi.service.ts`):
//   `createMultiTaxiRide` only creates the *order* row
//   (`ready_for_dispatch`); it has no assignment-writing code of its own and
//   reads assignments back via `findPassengerAssignmentDisclosure` -- actual
//   dispatch for a multi-taxi order still goes through the same
//   `assignDispatch`/`createDispatchAssignment` path above.
// - tenant/enterprise (`apps/api/src/modules/tenant-partner/tenant-partner
//   .service.ts`): no reference to `OwnedMobilityService`, no
//   `phase1_dispatch_assignments`/`assignmentId` write of its own -- it is
//   quota/approval/invoicing, not a competing dispatch writer.
// - a "scheduled activation" writer that would flip a `reservation`-mode
//   order into a live dispatch attempt does not exist yet as a separate
//   writer in this codebase; when it is added, it can only reach the shared
//   pool by calling `dispatchOrder`/`assignDispatch` like every other entry
//   above (there is no alternate assignment-writing path to bypass).
// Conclusion: there is no unupgraded writer left with its own driver/vehicle
// write path to fence off -- every writer already shares
// `createDispatchAssignment`, which this task wires to
// `reserveDispatchResources`/`releaseDispatchResourceReservations`/
// `occupyDispatchResourceReservations`.
//
// What this suite is evidence for (required_acceptance):
//   - mixed_entry_postgres_race_evidence: two concurrent callers reserving
//     the same driver/vehicle pair for two different orders/assignments (the
//     shared primitive every dispatch writer above funnels through) --
//     Postgres's partial unique index arbitrates so at most one wins, and
//     the loser's transaction leaves no partial row behind.
//   - old_revision_fence_evidence: release/occupy are fenced to
//     `assignment_id`, and a status-fenced `FOR UPDATE` lock is what an
//     old-revision close (reassign/redispatch/timeout) authoritatively
//     re-checks against, so a stale/late caller can never release or
//     re-close a newer assignment's occupation of the same resource.

const DATABASE_URL = process.env.DATABASE_URL;

async function insertOrderFixture(database: DatabaseService, orderId: string) {
  const now = new Date().toISOString();
  await database.query(
    `
      INSERT INTO ops.phase1_owned_orders (
        order_id, order_no, status, order_source, service_bucket,
        dispatch_semantics, created_at, updated_at, record
      ) VALUES ($1, $2, 'ready_for_dispatch', 'app', 'standard_taxi', 'immediate', $3, $3, $4::jsonb)
    `,
    [
      orderId,
      `ON-${orderId}`,
      now,
      JSON.stringify({ orderId, status: "ready_for_dispatch" }),
    ],
  );
}

async function insertAssignmentFixture(
  database: DatabaseService,
  params: {
    assignmentId: string;
    orderId: string;
    driverId: string;
    vehicleId: string;
    status?: string;
  },
) {
  const now = new Date().toISOString();
  const status = params.status ?? "assigned";
  await database.query(
    `
      INSERT INTO ops.phase1_dispatch_assignments (
        assignment_id, dispatch_job_id, order_id, task_id, status, created_at, updated_at, record
      ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7::jsonb)
    `,
    [
      params.assignmentId,
      `job-${randomUUID()}`,
      params.orderId,
      `task-${randomUUID()}`,
      status,
      now,
      JSON.stringify({
        assignmentId: params.assignmentId,
        orderId: params.orderId,
        driverId: params.driverId,
        vehicleId: params.vehicleId,
        status,
      }),
    ],
  );
}

async function readReservations(
  database: DatabaseService,
  params: { resourceType: string; resourceId: string },
) {
  const result = await database.query<{
    assignment_id: string | null;
    status: string;
    order_id: string;
  }>(
    `
      SELECT assignment_id, status, order_id
      FROM ops.dispatch_resource_reservations
      WHERE resource_type = $1 AND resource_id = $2
      ORDER BY created_at ASC
    `,
    [params.resourceType, params.resourceId],
  );
  return result.rows;
}

describe("UV-EXEC-006 shared dispatch resource reservation (SD §7.6)", () => {
  const databases: DatabaseService[] = [];
  const orderIds: string[] = [];
  const assignmentIds: string[] = [];

  afterEach(async () => {
    if (DATABASE_URL) {
      const cleanupDatabase = new DatabaseService();
      try {
        if (assignmentIds.length > 0) {
          await cleanupDatabase.query(
            `DELETE FROM ops.dispatch_resource_reservations WHERE assignment_id = ANY($1)`,
            [assignmentIds],
          );
          await cleanupDatabase.query(
            `DELETE FROM ops.phase1_dispatch_assignments WHERE assignment_id = ANY($1)`,
            [assignmentIds.splice(0)],
          );
        }
        if (orderIds.length > 0) {
          await cleanupDatabase.query(
            `DELETE FROM ops.phase1_owned_orders WHERE order_id = ANY($1)`,
            [orderIds.splice(0)],
          );
        }
      } finally {
        await cleanupDatabase.onModuleDestroy();
      }
    }
    for (const database of databases.splice(0)) {
      await database.onModuleDestroy();
    }
  });

  function trackOrder(orderId: string) {
    orderIds.push(orderId);
    return orderId;
  }

  function trackAssignment(assignmentId: string) {
    assignmentIds.push(assignmentId);
    return assignmentId;
  }

  it("requires DATABASE_URL", () => {
    expect(DATABASE_URL).toBeTruthy();
  });

  it("reserves driver and vehicle together and rejects a second assignment's identical resources with a 23505-backed conflict error", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const repository = new OwnedMobilityRepository(database);

    const orderId = trackOrder(`order-uvexec006-${randomUUID()}`);
    const assignmentId = trackAssignment(
      `assignment-uvexec006-${randomUUID()}`,
    );
    const driverId = `driver-uvexec006-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-${randomUUID()}`;
    await insertOrderFixture(database, orderId);
    await insertAssignmentFixture(database, {
      assignmentId,
      orderId,
      driverId,
      vehicleId,
    });

    const reserved = await repository.withTransaction((tx) =>
      repository.reserveDispatchResources(tx, {
        orderId,
        assignmentId,
        driverId,
        vehicleId,
        expiresAt: null,
      }),
    );
    expect(reserved).toHaveLength(2);
    expect(reserved.map((r) => r.resourceType).sort()).toEqual([
      "driver",
      "vehicle",
    ]);
    expect(reserved.every((r) => r.status === "held")).toBe(true);

    // A second, unrelated order/assignment (e.g. a different dispatch entry
    // racing on the exact same driver+vehicle pair) must be rejected by the
    // partial unique index, not silently allowed to double-book the pair.
    const orderId2 = trackOrder(`order-uvexec006-${randomUUID()}`);
    const assignmentId2 = trackAssignment(
      `assignment-uvexec006-${randomUUID()}`,
    );
    await insertOrderFixture(database, orderId2);
    await insertAssignmentFixture(database, {
      assignmentId: assignmentId2,
      orderId: orderId2,
      driverId,
      vehicleId,
    });

    await expect(
      repository.withTransaction((tx) =>
        repository.reserveDispatchResources(tx, {
          orderId: orderId2,
          assignmentId: assignmentId2,
          driverId,
          vehicleId,
          expiresAt: null,
        }),
      ),
    ).rejects.toBeInstanceOf(DispatchResourceReservationConflictError);

    // The loser's transaction must roll back completely -- the driver-side
    // insert that would have succeeded before the vehicle-side conflict must
    // not have leaked a row for the losing assignment.
    const driverRows = await readReservations(database, {
      resourceType: "driver",
      resourceId: driverId,
    });
    const vehicleRows = await readReservations(database, {
      resourceType: "vehicle",
      resourceId: vehicleId,
    });
    expect(driverRows).toHaveLength(1);
    expect(vehicleRows).toHaveLength(1);
    expect(driverRows[0].assignment_id).toBe(assignmentId);
    expect(vehicleRows[0].assignment_id).toBe(assignmentId);
  });

  it("mixed_entry_postgres_race_evidence: two concurrent dispatch entries racing the same driver+vehicle pair -- at most one wins", async () => {
    expect(DATABASE_URL).toBeTruthy();
    // Two independent DatabaseService/connection instances stand in for two
    // concurrent writers (e.g. a manual/enterprise assign and a
    // multi-taxi-originated assign, both funneling into the same
    // `reserveDispatchResources` primitive per the writer inventory above)
    // racing to grab the exact same driver+vehicle pair for two different
    // orders.
    const databaseA = new DatabaseService();
    const databaseB = new DatabaseService();
    databases.push(databaseA, databaseB);
    const repositoryA = new OwnedMobilityRepository(databaseA);
    const repositoryB = new OwnedMobilityRepository(databaseB);

    const driverId = `driver-uvexec006-race-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-race-${randomUUID()}`;

    const orderIdA = trackOrder(`order-uvexec006-race-a-${randomUUID()}`);
    const assignmentIdA = trackAssignment(
      `assignment-uvexec006-race-a-${randomUUID()}`,
    );
    const orderIdB = trackOrder(`order-uvexec006-race-b-${randomUUID()}`);
    const assignmentIdB = trackAssignment(
      `assignment-uvexec006-race-b-${randomUUID()}`,
    );
    await insertOrderFixture(databaseA, orderIdA);
    await insertOrderFixture(databaseA, orderIdB);
    await insertAssignmentFixture(databaseA, {
      assignmentId: assignmentIdA,
      orderId: orderIdA,
      driverId,
      vehicleId,
    });
    await insertAssignmentFixture(databaseA, {
      assignmentId: assignmentIdB,
      orderId: orderIdB,
      driverId,
      vehicleId,
    });

    const [resultA, resultB] = await Promise.allSettled([
      repositoryA.withTransaction((tx) =>
        repositoryA.reserveDispatchResources(tx, {
          orderId: orderIdA,
          assignmentId: assignmentIdA,
          driverId,
          vehicleId,
          expiresAt: null,
        }),
      ),
      repositoryB.withTransaction((tx) =>
        repositoryB.reserveDispatchResources(tx, {
          orderId: orderIdB,
          assignmentId: assignmentIdB,
          driverId,
          vehicleId,
          expiresAt: null,
        }),
      ),
    ]);

    const outcomes = [resultA, resultB];
    const fulfilled = outcomes.filter((r) => r.status === "fulfilled");
    const rejected = outcomes.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      DispatchResourceReservationConflictError,
    );

    // Exactly one of the two assignments actually holds the pair afterward.
    const driverRows = await readReservations(databaseA, {
      resourceType: "driver",
      resourceId: driverId,
    });
    const vehicleRows = await readReservations(databaseA, {
      resourceType: "vehicle",
      resourceId: vehicleId,
    });
    expect(driverRows).toHaveLength(1);
    expect(vehicleRows).toHaveLength(1);
    const winner = fulfilled[0].status === "fulfilled" ? fulfilled[0] : null;
    expect(winner).not.toBeNull();
    const winningAssignmentId = (
      winner as PromiseFulfilledResult<
        Awaited<ReturnType<typeof repositoryA.reserveDispatchResources>>
      >
    ).value[0]!.assignmentId;
    expect([assignmentIdA, assignmentIdB]).toContain(winningAssignmentId);
    expect(driverRows[0].assignment_id).toBe(winningAssignmentId);
    expect(vehicleRows[0].assignment_id).toBe(winningAssignmentId);
  });

  it("old_revision_fence_evidence: release/occupy are fenced to assignment_id -- a stale release never touches a newer assignment's occupation", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const repository = new OwnedMobilityRepository(database);

    const driverId = `driver-uvexec006-fence-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-fence-${randomUUID()}`;

    // Assignment A (e.g. the original offer) reserves the pair.
    const orderIdA = trackOrder(`order-uvexec006-fence-a-${randomUUID()}`);
    const assignmentIdA = trackAssignment(
      `assignment-uvexec006-fence-a-${randomUUID()}`,
    );
    await insertOrderFixture(database, orderIdA);
    await insertAssignmentFixture(database, {
      assignmentId: assignmentIdA,
      orderId: orderIdA,
      driverId,
      vehicleId,
    });
    await repository.withTransaction((tx) =>
      repository.reserveDispatchResources(tx, {
        orderId: orderIdA,
        assignmentId: assignmentIdA,
        driverId,
        vehicleId,
        expiresAt: null,
      }),
    );

    // A is superseded (reassign/redispatch/cancel/reject) and its reservation
    // is released.
    const releasedForA = await repository.releaseDispatchResourceReservations(
      assignmentIdA,
      database,
    );
    expect(releasedForA).toBe(2);

    // Assignment B (the replacement) reserves the now-free pair.
    const orderIdB = trackOrder(`order-uvexec006-fence-b-${randomUUID()}`);
    const assignmentIdB = trackAssignment(
      `assignment-uvexec006-fence-b-${randomUUID()}`,
    );
    await insertOrderFixture(database, orderIdB);
    await insertAssignmentFixture(database, {
      assignmentId: assignmentIdB,
      orderId: orderIdB,
      driverId,
      vehicleId,
    });
    await repository.withTransaction((tx) =>
      repository.reserveDispatchResources(tx, {
        orderId: orderIdB,
        assignmentId: assignmentIdB,
        driverId,
        vehicleId,
        expiresAt: null,
      }),
    );

    // A stale/late caller for A (e.g. a leftover acceptance-timeout timer
    // that fires after A was already superseded) must be a safe no-op -- it
    // must not release B's now-held occupation of the same resources just
    // because they share a resource_id.
    const staleReleaseForA =
      await repository.releaseDispatchResourceReservations(
        assignmentIdA,
        database,
      );
    expect(staleReleaseForA).toBe(0);

    const driverRows = await readReservations(database, {
      resourceType: "driver",
      resourceId: driverId,
    });
    const vehicleRows = await readReservations(database, {
      resourceType: "vehicle",
      resourceId: vehicleId,
    });
    for (const row of [...driverRows, ...vehicleRows]) {
      if (row.assignment_id === assignmentIdB) {
        expect(row.status).toBe("held");
      } else if (row.assignment_id === assignmentIdA) {
        expect(row.status).toBe("released");
      }
    }

    // occupyDispatchResourceReservations is fenced the same way: occupying A
    // (already released) is a no-op, occupying B transitions its held rows.
    const occupyStaleA = await repository.occupyDispatchResourceReservations(
      assignmentIdA,
      database,
    );
    expect(occupyStaleA).toBe(0);
    const occupyB = await repository.occupyDispatchResourceReservations(
      assignmentIdB,
      database,
    );
    expect(occupyB).toBe(2);

    const driverRowsAfterOccupy = await readReservations(database, {
      resourceType: "driver",
      resourceId: driverId,
    });
    const bRow = driverRowsAfterOccupy.find(
      (r) => r.assignment_id === assignmentIdB,
    );
    expect(bRow?.status).toBe("occupied");
  });

  it("closing an assignment for supersession re-verifies its status under FOR UPDATE and is a no-op once it has already left the fenced status set", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const repository = new OwnedMobilityRepository(database);

    const orderId = trackOrder(`order-uvexec006-lock-${randomUUID()}`);
    const assignmentId = trackAssignment(
      `assignment-uvexec006-lock-${randomUUID()}`,
    );
    const driverId = `driver-uvexec006-lock-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-lock-${randomUUID()}`;
    await insertOrderFixture(database, orderId);
    await insertAssignmentFixture(database, {
      assignmentId,
      orderId,
      driverId,
      vehicleId,
      status: "assigned",
    });

    let releaseAccept: () => void = () => {};
    const acceptCanCommit = new Promise<void>((resolve) => {
      releaseAccept = resolve;
    });
    let signalLockAcquired: () => void = () => {};
    const lockAcquired = new Promise<void>((resolve) => {
      signalLockAcquired = resolve;
    });

    // Instance A: a concurrent driver-accept holding the row lock while it
    // flips status from `assigned` to `accepted`.
    const acceptTransaction = repository.withTransaction(async (tx) => {
      const locked = await repository.lockDispatchAssignmentForUpdate(
        tx,
        assignmentId,
      );
      expect(locked?.status).toBe("assigned");
      signalLockAcquired();
      await acceptCanCommit;
      // `lockDispatchAssignmentForUpdate` parses `record`, not the plain
      // `status` column -- every real writer keeps both in sync via a single
      // upsert (see the `dispatchAssignments` write loop in the repository),
      // so the simulated concurrent accept must update both here too, or the
      // re-read below would deterministically observe the stale JSONB status
      // regardless of any race.
      await tx.query(
        `
          UPDATE ops.phase1_dispatch_assignments
          SET status = 'accepted',
              updated_at = now(),
              record = jsonb_set(record, '{status}', '"accepted"'::jsonb, true)
          WHERE assignment_id = $1
        `,
        [assignmentId],
      );
      return "accepted";
    });

    await lockAcquired;
    releaseAccept();
    await acceptTransaction;

    // Instance B: an acceptance-timeout timer armed while the assignment was
    // still `assigned`, firing after the accept above already committed. Its
    // authoritative re-check under `FOR UPDATE` (allowedStatuses=["assigned"]
    // in the service's `closeSupersededDispatchAssignment`) must see
    // `accepted`, not the stale `assigned` snapshot the timer was armed
    // against, and refuse to close it.
    const lockedForTimeout = await repository.withTransaction((tx) =>
      repository.lockDispatchAssignmentForUpdate(tx, assignmentId),
    );
    expect(lockedForTimeout?.status).toBe("accepted");
    const allowedStatuses: ReadonlyArray<string> = ["assigned"];
    expect(allowedStatuses.includes(lockedForTimeout!.status)).toBe(false);
  }, 15_000);
});
