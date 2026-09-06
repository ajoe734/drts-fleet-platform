import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { OwnedOrderRecord } from "@drts/contracts";

import { DatabaseService } from "../../src/common/db";
import {
  DispatchResourceReservationConflictError,
  OwnedMobilityRepository,
} from "../../src/modules/owned-mobility/owned-mobility.repository";

// UV-EXEC-006: SD §7.6/§9.1 -- the shared driver+vehicle capacity
// reservation ledger (`ops.dispatch_resource_reservations`, added by
// UV-EXEC-002's V0087) that every dispatch-assignment writer must go
// through. This suite assumes migrations have already been applied to
// DATABASE_URL (operations/database/db-apply.sh), exactly like the other
// `*.integration.test.ts` suites in this repo -- it is not itself a
// migration runner.
//
// What this suite is evidence for:
//   - required_acceptance: mixed_entry_postgres_race_evidence -- two
//     concurrent Postgres transactions competing for the same driver and
//     vehicle resolve to exactly one winner, via the real unique partial
//     index, not an application-level check-then-insert race.
//   - required_acceptance: old_revision_fence_evidence -- releasing a
//     reservation is fenced to the specific `assignment_id` it belongs to,
//     so a stale release for an assignment a reassign already superseded
//     can never release a newer assignment's occupation of the same
//     driver/vehicle.
//   - the fixed lock order (driver before vehicle), the held->occupied
//     transition on driver acceptance, and that a losing reservation leaves
//     no partial row behind.
//
// See docs/03-runbooks/uv-exec-006-dispatch-resource-reservation-inventory.md
// for why `OwnedMobilityRepository`/`OwnedMobilityService.createDispatchAssignment`
// is the single writer this ledger needs to be wired into.

const DATABASE_URL = process.env.DATABASE_URL;

function buildOrderFixture(
  overrides: Partial<OwnedOrderRecord> & { orderId: string },
): OwnedOrderRecord {
  const now = new Date().toISOString();
  return {
    orderId: overrides.orderId,
    orderNo: `ON-${overrides.orderId}`,
    orderSource: "ops_console",
    orderDomain: "owned",
    tenantId: null,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    passengerDisclosure: null,
    serviceBucket: "standard_taxi",
    dispatchSemantics: "immediate",
    businessDispatchSubtype: null,
    status: "ready_for_dispatch",
    pickup: { address: "台北車站" },
    dropoff: { address: "松山機場" },
    passenger: { name: "UV-EXEC-006 Rider", phone: "0911000333" },
    bookingId: null,
    bookingType: null,
    etaSnapshot: null,
    callId: null,
    voiceIntentId: null,
    recordingId: null,
    reservationWindowStart: null,
    reservationWindowEnd: null,
    recurrenceRule: null,
    modifiableUntil: null,
    cancelableUntil: null,
    bookedBy: null,
    onsiteContact: null,
    costCenter: null,
    vehiclePreference: null,
    benefitReference: null,
    direction: null,
    flightNo: null,
    terminal: null,
    luggageCount: null,
    notes: null,
    fixedPrice: false,
    quotedFare: null,
    quotedFareSource: null,
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    exceptionHold: null,
    proofRequirements: {
      minPhotoCount: 0,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    approvalState: "not_required",
    approvalRequestIds: [],
    complianceFlags: [],
    cancelledAt: null,
    cancelReason: null,
    reservationHoldStatus: "none",
    reservationHoldId: null,
    reservationHoldExpiresAt: null,
    dispatchAttemptCount: 0,
    lastDispatchFailureReason: null,
    noSupplyEscalation: null,
    dispatchTimeout: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as unknown as OwnedOrderRecord;
}

async function insertOrder(
  repository: OwnedMobilityRepository,
  orderId: string,
) {
  const order = buildOrderFixture({ orderId });
  await repository.withTransaction((client) =>
    repository.insertVoiceOrder(client, order),
  );
}

async function insertAssignment(
  database: DatabaseService,
  params: { assignmentId: string; orderId: string },
) {
  const now = new Date().toISOString();
  await database.query(
    `
      INSERT INTO ops.phase1_dispatch_assignments (
        assignment_id, dispatch_job_id, order_id, task_id, status,
        created_at, updated_at, record
      ) VALUES ($1, $2, $3, $4, 'assigned', $5, $5, '{}'::jsonb)
    `,
    [
      params.assignmentId,
      `job-${params.assignmentId}`,
      params.orderId,
      `task-${params.assignmentId}`,
      now,
    ],
  );
}

async function readActiveReservations(
  database: DatabaseService,
  resourceType: "driver" | "vehicle",
  resourceId: string,
) {
  const result = await database.query<{
    assignment_id: string | null;
    status: string;
    version: number;
  }>(
    `
      SELECT assignment_id, status, version
      FROM ops.dispatch_resource_reservations
      WHERE resource_type = $1
        AND resource_id = $2
        AND status IN ('held', 'occupied')
    `,
    [resourceType, resourceId],
  );
  return result.rows;
}

describe("UV-EXEC-006 shared driver+vehicle dispatch resource reservation", () => {
  const databases: DatabaseService[] = [];
  const orderIds: string[] = [];
  const assignmentIds: string[] = [];

  afterEach(async () => {
    if (DATABASE_URL && (orderIds.length > 0 || assignmentIds.length > 0)) {
      const cleanupDatabase = new DatabaseService();
      try {
        await cleanupDatabase.query(
          `DELETE FROM ops.dispatch_resource_reservations WHERE order_id = ANY($1)`,
          [orderIds],
        );
        await cleanupDatabase.query(
          `DELETE FROM ops.phase1_dispatch_assignments WHERE assignment_id = ANY($1)`,
          [assignmentIds.splice(0)],
        );
        await cleanupDatabase.query(
          `DELETE FROM ops.phase1_owned_orders WHERE order_id = ANY($1)`,
          [orderIds.splice(0)],
        );
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

  it("reserves driver and vehicle for one assignment in the same transaction, and a losing reservation leaves no partial row behind", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const repository = new OwnedMobilityRepository(database);

    const orderAId = trackOrder(`order-uvexec006-${randomUUID()}`);
    const assignmentAId = trackAssignment(`assignment-uvexec006-${randomUUID()}`);
    await insertOrder(repository, orderAId);
    await insertAssignment(database, {
      assignmentId: assignmentAId,
      orderId: orderAId,
    });

    const driverId = `driver-uvexec006-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-${randomUUID()}`;

    const reserved = await repository.withTransaction((client) =>
      repository.reserveDispatchResources(client, {
        orderId: orderAId,
        assignmentId: assignmentAId,
        driverId,
        vehicleId,
        expiresAt: null,
      }),
    );

    expect(reserved).toHaveLength(2);
    expect(reserved.map((row) => row.resourceType)).toEqual([
      "driver",
      "vehicle",
    ]);
    expect(reserved.every((row) => row.status === "held")).toBe(true);
    expect(
      reserved.every((row) => row.assignmentId === assignmentAId),
    ).toBe(true);

    // A second order/assignment competing for the *same driver* (different
    // vehicle) must be rejected -- SD §7.6's active-occupation uniqueness --
    // and must not leave a dangling vehicle reservation behind either, since
    // the driver insert (first in the fixed lock order) fails before the
    // vehicle insert is even attempted.
    const orderBId = trackOrder(`order-uvexec006-${randomUUID()}`);
    const assignmentBId = trackAssignment(
      `assignment-uvexec006-${randomUUID()}`,
    );
    await insertOrder(repository, orderBId);
    await insertAssignment(database, {
      assignmentId: assignmentBId,
      orderId: orderBId,
    });
    const otherVehicleId = `vehicle-uvexec006-${randomUUID()}`;

    const driverConflict = await repository
      .withTransaction((client) =>
        repository.reserveDispatchResources(client, {
          orderId: orderBId,
          assignmentId: assignmentBId,
          driverId,
          vehicleId: otherVehicleId,
          expiresAt: null,
        }),
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(driverConflict).toBeInstanceOf(
      DispatchResourceReservationConflictError,
    );
    expect(
      (driverConflict as DispatchResourceReservationConflictError)
        .resourceType,
    ).toBe("driver");
    expect(
      (driverConflict as DispatchResourceReservationConflictError).resourceId,
    ).toBe(driverId);

    const otherVehicleRows = await readActiveReservations(
      database,
      "vehicle",
      otherVehicleId,
    );
    expect(otherVehicleRows).toHaveLength(0);

    // A third order competing for the *same vehicle* (different driver)
    // must also be rejected -- both resource types are independently
    // arbitrated, not just the first one checked.
    const orderCId = trackOrder(`order-uvexec006-${randomUUID()}`);
    const assignmentCId = trackAssignment(
      `assignment-uvexec006-${randomUUID()}`,
    );
    await insertOrder(repository, orderCId);
    await insertAssignment(database, {
      assignmentId: assignmentCId,
      orderId: orderCId,
    });
    const otherDriverId = `driver-uvexec006-${randomUUID()}`;

    const vehicleConflict = await repository
      .withTransaction((client) =>
        repository.reserveDispatchResources(client, {
          orderId: orderCId,
          assignmentId: assignmentCId,
          driverId: otherDriverId,
          vehicleId,
          expiresAt: null,
        }),
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(vehicleConflict).toBeInstanceOf(
      DispatchResourceReservationConflictError,
    );
    expect(
      (vehicleConflict as DispatchResourceReservationConflictError)
        .resourceType,
    ).toBe("vehicle");
    expect(
      (vehicleConflict as DispatchResourceReservationConflictError)
        .resourceId,
    ).toBe(vehicleId);

    const driverRows = await readActiveReservations(database, "driver", driverId);
    expect(driverRows).toEqual([
      expect.objectContaining({ assignment_id: assignmentAId, status: "held" }),
    ]);
    const vehicleRows = await readActiveReservations(
      database,
      "vehicle",
      vehicleId,
    );
    expect(vehicleRows).toEqual([
      expect.objectContaining({ assignment_id: assignmentAId, status: "held" }),
    ]);
  });

  it("allows exactly one of two concurrent transactions competing for the same driver+vehicle to win", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const repository = new OwnedMobilityRepository(database);

    const orderAId = trackOrder(`order-uvexec006-${randomUUID()}`);
    const assignmentAId = trackAssignment(`assignment-uvexec006-${randomUUID()}`);
    const orderBId = trackOrder(`order-uvexec006-${randomUUID()}`);
    const assignmentBId = trackAssignment(`assignment-uvexec006-${randomUUID()}`);
    await Promise.all([insertOrder(repository, orderAId), insertOrder(repository, orderBId)]);
    await Promise.all([
      insertAssignment(database, { assignmentId: assignmentAId, orderId: orderAId }),
      insertAssignment(database, { assignmentId: assignmentBId, orderId: orderBId }),
    ]);

    const driverId = `driver-uvexec006-race-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-race-${randomUUID()}`;

    // Two genuinely separate Postgres connections/transactions, fired at
    // the same time, both trying to reserve the exact same driver+vehicle
    // pair -- this is SD §7.6's "兩單/兩 revision 競爭最多一個成功", proved
    // by the real unique partial index arbitrating concurrent writers, not
    // by an application-level read-then-write check.
    const [resultA, resultB] = await Promise.allSettled([
      repository.withTransaction((client) =>
        repository.reserveDispatchResources(client, {
          orderId: orderAId,
          assignmentId: assignmentAId,
          driverId,
          vehicleId,
          expiresAt: null,
        }),
      ),
      repository.withTransaction((client) =>
        repository.reserveDispatchResources(client, {
          orderId: orderBId,
          assignmentId: assignmentBId,
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
    expect(
      (rejected[0] as PromiseRejectedResult).reason,
    ).toBeInstanceOf(DispatchResourceReservationConflictError);

    const driverRows = await readActiveReservations(database, "driver", driverId);
    const vehicleRows = await readActiveReservations(
      database,
      "vehicle",
      vehicleId,
    );
    expect(driverRows).toHaveLength(1);
    expect(vehicleRows).toHaveLength(1);
    // Both winning rows belong to the same assignment (whichever order won).
    expect(driverRows[0]!.assignment_id).toBe(vehicleRows[0]!.assignment_id);
  });

  it("transitions held reservations to occupied on driver acceptance, scoped to the assignment", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const repository = new OwnedMobilityRepository(database);

    const orderId = trackOrder(`order-uvexec006-${randomUUID()}`);
    const assignmentId = trackAssignment(`assignment-uvexec006-${randomUUID()}`);
    await insertOrder(repository, orderId);
    await insertAssignment(database, { assignmentId, orderId });

    const driverId = `driver-uvexec006-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-${randomUUID()}`;
    await repository.withTransaction((client) =>
      repository.reserveDispatchResources(client, {
        orderId,
        assignmentId,
        driverId,
        vehicleId,
        expiresAt: null,
      }),
    );

    const occupiedCount =
      await repository.occupyDispatchResourceReservations(assignmentId);
    expect(occupiedCount).toBe(2);

    const driverRows = await readActiveReservations(database, "driver", driverId);
    expect(driverRows).toEqual([
      expect.objectContaining({
        assignment_id: assignmentId,
        status: "occupied",
        version: 2,
      }),
    ]);

    // Occupying an already-occupied reservation is a safe no-op, not a
    // double transition.
    const secondOccupyCount =
      await repository.occupyDispatchResourceReservations(assignmentId);
    expect(secondOccupyCount).toBe(0);
  });

  it("fences release to the assignment_id: a stale release for a superseded assignment never touches a newer assignment's reservation of the same driver/vehicle", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const repository = new OwnedMobilityRepository(database);

    const orderId = trackOrder(`order-uvexec006-${randomUUID()}`);
    const oldAssignmentId = trackAssignment(
      `assignment-uvexec006-old-${randomUUID()}`,
    );
    const newAssignmentId = trackAssignment(
      `assignment-uvexec006-new-${randomUUID()}`,
    );
    await insertOrder(repository, orderId);
    await insertAssignment(database, { assignmentId: oldAssignmentId, orderId });
    await insertAssignment(database, { assignmentId: newAssignmentId, orderId });

    const driverId = `driver-uvexec006-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-${randomUUID()}`;

    // Old assignment reserves the pair first (e.g. the original offer).
    await repository.withTransaction((client) =>
      repository.reserveDispatchResources(client, {
        orderId,
        assignmentId: oldAssignmentId,
        driverId,
        vehicleId,
        expiresAt: null,
      }),
    );

    // A reassign atomically closes the old assignment's reservation and
    // opens a new one for the replacement assignment -- exactly what
    // `OwnedMobilityService.createDispatchAssignment` does in one
    // transaction when `options.previousAssignmentId` is set.
    await repository.withTransaction(async (client) => {
      await repository.releaseDispatchResourceReservations(
        oldAssignmentId,
        client,
      );
      await repository.reserveDispatchResources(client, {
        orderId,
        assignmentId: newAssignmentId,
        driverId,
        vehicleId,
        expiresAt: null,
      });
    });

    const afterReassignDriverRows = await readActiveReservations(
      database,
      "driver",
      driverId,
    );
    expect(afterReassignDriverRows).toEqual([
      expect.objectContaining({
        assignment_id: newAssignmentId,
        status: "held",
      }),
    ]);

    // A stale timer/callback fires late for the *old* assignment (SD §7.6:
    // "不能僅看時鐘到期就讓舊 release 釋放新人的占用"). Because release is
    // fenced to `assignment_id`, this must be a safe no-op...
    const staleReleaseCount =
      await repository.releaseDispatchResourceReservations(oldAssignmentId);
    expect(staleReleaseCount).toBe(0);

    // ...and the new assignment's occupation must be completely untouched.
    const stillHeldDriverRows = await readActiveReservations(
      database,
      "driver",
      driverId,
    );
    const stillHeldVehicleRows = await readActiveReservations(
      database,
      "vehicle",
      vehicleId,
    );
    expect(stillHeldDriverRows).toEqual([
      expect.objectContaining({
        assignment_id: newAssignmentId,
        status: "held",
      }),
    ]);
    expect(stillHeldVehicleRows).toEqual([
      expect.objectContaining({
        assignment_id: newAssignmentId,
        status: "held",
      }),
    ]);

    // A valid release of the *current* assignment (reject/cancel/complete/
    // confirmed timeout) does free the resource for the next competitor.
    const validReleaseCount =
      await repository.releaseDispatchResourceReservations(newAssignmentId);
    expect(validReleaseCount).toBe(2);
    expect(await readActiveReservations(database, "driver", driverId)).toHaveLength(0);
    expect(await readActiveReservations(database, "vehicle", vehicleId)).toHaveLength(0);

    // Releasing again (e.g. a duplicate cancel) is an idempotent no-op.
    const repeatReleaseCount =
      await repository.releaseDispatchResourceReservations(newAssignmentId);
    expect(repeatReleaseCount).toBe(0);
  });
});
