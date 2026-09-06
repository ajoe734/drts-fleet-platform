import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it } from "vitest";

import type { OwnedOrderRecord } from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import { DatabaseService } from "../../src/common/db";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import {
  DispatchResourceReservationConflictError,
  OwnedMobilityRepository,
} from "../../src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";

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

async function readAssignmentStatus(
  database: DatabaseService,
  assignmentId: string,
) {
  const result = await database.query<{ status: string }>(
    `SELECT status FROM ops.phase1_dispatch_assignments WHERE assignment_id = $1`,
    [assignmentId],
  );
  return result.rows[0]?.status ?? null;
}

async function purgeOrderCascade(database: DatabaseService, orderId: string) {
  // FK-safe order: `dispatch_resource_reservations` has real (non-deferrable)
  // FKs to both `phase1_owned_orders` and `phase1_dispatch_assignments`
  // (V0087); the other runtime-snapshot tables (V0011) are plain varchar
  // columns with no FK, but are still cleaned up here for test hygiene.
  await database.query(
    `DELETE FROM ops.dispatch_resource_reservations WHERE order_id = $1`,
    [orderId],
  );
  await database.query(
    `DELETE FROM ops.phase1_dispatch_trace_logs WHERE order_id = $1`,
    [orderId],
  );
  await database.query(
    `DELETE FROM ops.phase1_dispatch_attempts WHERE order_id = $1`,
    [orderId],
  );
  await database.query(
    `DELETE FROM ops.phase1_driver_tasks WHERE order_id = $1`,
    [orderId],
  );
  await database.query(
    `DELETE FROM ops.phase1_dispatch_assignments WHERE order_id = $1`,
    [orderId],
  );
  await database.query(
    `DELETE FROM ops.phase1_dispatch_jobs WHERE order_id = $1`,
    [orderId],
  );
  await database.query(
    `DELETE FROM ops.phase1_owned_orders WHERE order_id = $1`,
    [orderId],
  );
}

/**
 * Real `OwnedMobilityService` wired to a real (Postgres-backed)
 * `OwnedMobilityRepository`, matching UV-EXEC-005's `createTestService`
 * pattern. Unlike the repository-only tests above, calling `dispatchOrder`/
 * `assignDispatch`/`reassignDispatch`/`handleDispatchTimeout`/
 * `acceptDriverTask` through this service exercises the exact mixed-entry
 * write path (`OwnedMobilityService.createDispatchAssignment`) that owned-
 * mobility, multi-taxi, tenant/enterprise, and voice dispatch all share --
 * not just the reservation ledger in isolation.
 */
function createTestService(
  database: DatabaseService,
  candidates: Array<{
    driverId: string;
    vehicleId: string;
    etaMinutes: number;
    operatingArea: string;
    serviceBuckets: string[];
  }>,
) {
  const regulatoryRegistryService = {
    getEligibleCandidates: () => candidates,
    getVehicleDispatchability: () => true,
    getDriverAvailability: () => true,
    getVehicleLicenseType: () => null,
    getVehiclePassengerDisclosureProfile: () => null,
    getDriverPublicRegistrationCredential: () => null,
  };
  const auditNotificationService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditNotificationService);
  const taskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter() as never,
  );
  const ownedMobilityRepository = new OwnedMobilityRepository(database);

  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService,
    callcenterService,
    taskEventsService,
    undefined, // opsDispatchEventsService
    ownedMobilityRepository,
    undefined, // tenantPartnerService
    undefined, // vehicleEligibilityService
    undefined, // serviceProductService
    undefined, // eventEmitter
    undefined, // runtimeEligibilityEvaluator
    undefined, // sandboxFallbackCostPolicyResolver (falls back to its default)
    undefined, // sandboxDispatchGateService
    undefined, // serviceAreaService
    undefined, // fareAnomalyService
    undefined, // idempotencyService
    undefined, // voiceBookingRepository
  );

  return { service, ownedMobilityRepository };
}

function getErrorCode(error: unknown): string | null {
  return error instanceof ApiRequestError ? error.code : null;
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
    const assignmentAId = trackAssignment(
      `assignment-uvexec006-${randomUUID()}`,
    );
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
    expect(reserved.every((row) => row.assignmentId === assignmentAId)).toBe(
      true,
    );

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
      (driverConflict as DispatchResourceReservationConflictError).resourceType,
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
      (vehicleConflict as DispatchResourceReservationConflictError).resourceId,
    ).toBe(vehicleId);

    const driverRows = await readActiveReservations(
      database,
      "driver",
      driverId,
    );
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
    const assignmentAId = trackAssignment(
      `assignment-uvexec006-${randomUUID()}`,
    );
    const orderBId = trackOrder(`order-uvexec006-${randomUUID()}`);
    const assignmentBId = trackAssignment(
      `assignment-uvexec006-${randomUUID()}`,
    );
    await Promise.all([
      insertOrder(repository, orderAId),
      insertOrder(repository, orderBId),
    ]);
    await Promise.all([
      insertAssignment(database, {
        assignmentId: assignmentAId,
        orderId: orderAId,
      }),
      insertAssignment(database, {
        assignmentId: assignmentBId,
        orderId: orderBId,
      }),
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
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      DispatchResourceReservationConflictError,
    );

    const driverRows = await readActiveReservations(
      database,
      "driver",
      driverId,
    );
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
    const assignmentId = trackAssignment(
      `assignment-uvexec006-${randomUUID()}`,
    );
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

    const driverRows = await readActiveReservations(
      database,
      "driver",
      driverId,
    );
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
    await insertAssignment(database, {
      assignmentId: oldAssignmentId,
      orderId,
    });
    await insertAssignment(database, {
      assignmentId: newAssignmentId,
      orderId,
    });

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
    expect(
      await readActiveReservations(database, "driver", driverId),
    ).toHaveLength(0);
    expect(
      await readActiveReservations(database, "vehicle", vehicleId),
    ).toHaveLength(0);

    // Releasing again (e.g. a duplicate cancel) is an idempotent no-op.
    const repeatReleaseCount =
      await repository.releaseDispatchResourceReservations(newAssignmentId);
    expect(repeatReleaseCount).toBe(0);
  });
});

// The suite above tests `OwnedMobilityRepository` in isolation, pre-inserting
// assignment rows by hand. It cannot be evidence for `required_acceptance:
// mixed_entry_postgres_race_evidence` or `old_revision_fence_evidence` --
// those require driving the actual mixed-entry write path
// (`OwnedMobilityService.createDispatchAssignment`, shared by owned-mobility,
// multi-taxi, tenant/enterprise, and voice dispatch) through its real public
// methods (`assignDispatch`/`reassignDispatch`/`handleDispatchTimeout`/
// `acceptDriverTask`), against a real Postgres transaction, from two
// independent service instances competing for the same driver/vehicle.
describe("UV-EXEC-006 real service entry points (mixed-entry write path)", () => {
  const databases: DatabaseService[] = [];
  const orderIds: string[] = [];

  afterEach(async () => {
    if (DATABASE_URL && orderIds.length > 0) {
      const cleanupDatabase = new DatabaseService();
      try {
        for (const orderId of orderIds.splice(0)) {
          await purgeOrderCascade(cleanupDatabase, orderId);
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

  it("assigns through the real service without an FK violation (V0087's assignment_id FK is immediate, not deferrable) and reserves both resources", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const driverId = `driver-uvexec006-svc-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-svc-${randomUUID()}`;
    const { service } = createTestService(database, [
      {
        driverId,
        vehicleId,
        etaMinutes: 5,
        operatingArea: "taipei",
        serviceBuckets: ["standard_taxi"],
      },
    ]);

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "UV-EXEC-006 Rider", phone: "0911000444" },
    });
    trackOrder(order.orderId);

    const dispatchResult = await service.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const assignment = await service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId,
      driverId,
    });

    expect(await readAssignmentStatus(database, assignment.assignmentId)).toBe(
      "assigned",
    );
    expect(await readActiveReservations(database, "driver", driverId)).toEqual([
      expect.objectContaining({
        assignment_id: assignment.assignmentId,
        status: "held",
      }),
    ]);
    expect(
      await readActiveReservations(database, "vehicle", vehicleId),
    ).toEqual([
      expect.objectContaining({
        assignment_id: assignment.assignmentId,
        status: "held",
      }),
    ]);
  });

  it("atomically closes the superseded assignment and its reservation while reserving the replacement, through a real reassign", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const oldDriverId = `driver-uvexec006-old-${randomUUID()}`;
    const oldVehicleId = `vehicle-uvexec006-old-${randomUUID()}`;
    const newDriverId = `driver-uvexec006-new-${randomUUID()}`;
    const newVehicleId = `vehicle-uvexec006-new-${randomUUID()}`;
    const { service } = createTestService(database, [
      {
        driverId: oldDriverId,
        vehicleId: oldVehicleId,
        etaMinutes: 5,
        operatingArea: "taipei",
        serviceBuckets: ["standard_taxi"],
      },
      {
        driverId: newDriverId,
        vehicleId: newVehicleId,
        etaMinutes: 5,
        operatingArea: "taipei",
        serviceBuckets: ["standard_taxi"],
      },
    ]);

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "UV-EXEC-006 Rider", phone: "0911000555" },
    });
    trackOrder(order.orderId);

    const dispatchResult = await service.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const oldAssignment = await service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: oldVehicleId,
      driverId: oldDriverId,
    });

    const newAssignment = await service.reassignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: newVehicleId,
      driverId: newDriverId,
      reasonCode: "operator_redispatch",
    });

    // The old assignment is durably closed, not left dangling with a
    // released reservation but a still-"assigned" DB row (P1(3)).
    expect(
      await readAssignmentStatus(database, oldAssignment.assignmentId),
    ).toBe("cancelled");
    expect(
      await readActiveReservations(database, "driver", oldDriverId),
    ).toHaveLength(0);
    expect(
      await readActiveReservations(database, "vehicle", oldVehicleId),
    ).toHaveLength(0);

    // The new assignment holds its own reservation.
    expect(
      await readAssignmentStatus(database, newAssignment.assignmentId),
    ).toBe("assigned");
    expect(
      await readActiveReservations(database, "driver", newDriverId),
    ).toEqual([
      expect.objectContaining({
        assignment_id: newAssignment.assignmentId,
        status: "held",
      }),
    ]);
    expect(
      await readActiveReservations(database, "vehicle", newVehicleId),
    ).toEqual([
      expect.objectContaining({
        assignment_id: newAssignment.assignmentId,
        status: "held",
      }),
    ]);
  });

  it("mixed_entry_postgres_race_evidence: two orders from independent service instances racing for the same driver+vehicle resolve to exactly one winner", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const databaseA = new DatabaseService();
    const databaseB = new DatabaseService();
    databases.push(databaseA, databaseB);
    const driverId = `driver-uvexec006-race-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-race-${randomUUID()}`;
    const candidates = [
      {
        driverId,
        vehicleId,
        etaMinutes: 5,
        operatingArea: "taipei",
        serviceBuckets: ["standard_taxi"],
      },
    ];
    const { service: serviceA } = createTestService(databaseA, candidates);
    const { service: serviceB } = createTestService(databaseB, candidates);

    const orderA = serviceA.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "Rider A", phone: "0911000601" },
    });
    trackOrder(orderA.orderId);
    const orderB = serviceB.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "Rider B", phone: "0911000602" },
    });
    trackOrder(orderB.orderId);

    const dispatchA = await serviceA.dispatchOrder(orderA.orderId, {
      mode: "auto",
    });
    const dispatchB = await serviceB.dispatchOrder(orderB.orderId, {
      mode: "auto",
    });

    // Two genuinely concurrent transactions (separate pool connections, one
    // per service/database instance) competing for the same driver+vehicle
    // -- the real `ops.dispatch_resource_reservations` unique partial index
    // (V0087), not an application-level check-then-insert, must arbitrate
    // this down to exactly one winner.
    const results = await Promise.allSettled([
      serviceA.assignDispatch({
        dispatchJobId: dispatchA.dispatchJobId,
        vehicleId,
        driverId,
      }),
      serviceB.assignDispatch({
        dispatchJobId: dispatchB.dispatchJobId,
        vehicleId,
        driverId,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(getErrorCode((rejected[0] as PromiseRejectedResult).reason)).toBe(
      "DISPATCH_RESOURCE_RESERVATION_CONFLICT",
    );

    const winnerAssignmentId = (
      fulfilled[0] as PromiseFulfilledResult<{ assignmentId: string }>
    ).value.assignmentId;
    expect(await readActiveReservations(databaseA, "driver", driverId)).toEqual(
      [
        expect.objectContaining({
          assignment_id: winnerAssignmentId,
          status: "held",
        }),
      ],
    );

    // The losing side's own in-transaction work (assignment/job/order
    // upsert, driver-rating init, etc.) must have rolled back completely --
    // no partial assignment row left over from the loser.
    const loserOrderId =
      fulfilled[0] === results[0] ? orderB.orderId : orderA.orderId;
    const loserRows = await databaseA.query<{ assignment_id: string }>(
      `SELECT assignment_id FROM ops.phase1_dispatch_assignments WHERE order_id = $1`,
      [loserOrderId],
    );
    expect(loserRows.rows).toHaveLength(0);
  });

  it("an accepted offer is not undone by a late acceptance_timeout naming it (accept/timeout share the row lock)", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const driverId = `driver-uvexec006-acc-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-acc-${randomUUID()}`;
    const { service } = createTestService(database, [
      {
        driverId,
        vehicleId,
        etaMinutes: 5,
        operatingArea: "taipei",
        serviceBuckets: ["standard_taxi"],
      },
    ]);

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "UV-EXEC-006 Rider", phone: "0911000666" },
    });
    trackOrder(order.orderId);

    const dispatchResult = await service.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const assignment = await service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId,
      driverId,
    });

    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: new Date().toISOString(),
    });
    expect(await readAssignmentStatus(database, assignment.assignmentId)).toBe(
      "accepted",
    );
    expect(await readActiveReservations(database, "driver", driverId)).toEqual([
      expect.objectContaining({
        assignment_id: assignment.assignmentId,
        status: "occupied",
      }),
    ]);

    // A stale acceptance-timeout timer, armed before the accept landed,
    // fires late and still names the now-accepted assignment.
    const timeoutResult = await service.handleDispatchTimeout(
      order.orderId,
      "acceptance_timeout",
      undefined,
      { targetAssignmentId: assignment.assignmentId },
    );
    expect(timeoutResult.escalationAction).toBe("superseded");

    // The accepted offer and its occupied reservation must be untouched.
    expect(await readAssignmentStatus(database, assignment.assignmentId)).toBe(
      "accepted",
    );
    expect(await readActiveReservations(database, "driver", driverId)).toEqual([
      expect.objectContaining({
        assignment_id: assignment.assignmentId,
        status: "occupied",
      }),
    ]);
    expect(
      await readActiveReservations(database, "vehicle", vehicleId),
    ).toEqual([
      expect.objectContaining({
        assignment_id: assignment.assignmentId,
        status: "occupied",
      }),
    ]);
  });

  it("rejects an acceptance_timeout call that omits its target assignment", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const driverId = `driver-uvexec006-noreq-${randomUUID()}`;
    const vehicleId = `vehicle-uvexec006-noreq-${randomUUID()}`;
    const { service } = createTestService(database, [
      {
        driverId,
        vehicleId,
        etaMinutes: 5,
        operatingArea: "taipei",
        serviceBuckets: ["standard_taxi"],
      },
    ]);

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "UV-EXEC-006 Rider", phone: "0911000777" },
    });
    trackOrder(order.orderId);

    await expect(
      service.handleDispatchTimeout(order.orderId, "acceptance_timeout"),
    ).rejects.toMatchObject({
      response: {
        error: { code: "ACCEPTANCE_TIMEOUT_TARGET_REQUIRED" },
      },
    });
  });

  it("old_revision_fence_evidence: a stale timeout naming an assignment a real reassign already superseded is a no-op and never touches the replacement's reservation", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const oldDriverId = `driver-uvexec006-fence-old-${randomUUID()}`;
    const oldVehicleId = `vehicle-uvexec006-fence-old-${randomUUID()}`;
    const newDriverId = `driver-uvexec006-fence-new-${randomUUID()}`;
    const newVehicleId = `vehicle-uvexec006-fence-new-${randomUUID()}`;
    const { service } = createTestService(database, [
      {
        driverId: oldDriverId,
        vehicleId: oldVehicleId,
        etaMinutes: 5,
        operatingArea: "taipei",
        serviceBuckets: ["standard_taxi"],
      },
      {
        driverId: newDriverId,
        vehicleId: newVehicleId,
        etaMinutes: 5,
        operatingArea: "taipei",
        serviceBuckets: ["standard_taxi"],
      },
    ]);

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "UV-EXEC-006 Rider", phone: "0911000888" },
    });
    trackOrder(order.orderId);

    const dispatchResult = await service.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const oldAssignment = await service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: oldVehicleId,
      driverId: oldDriverId,
    });
    const newAssignment = await service.reassignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: newVehicleId,
      driverId: newDriverId,
      reasonCode: "operator_redispatch",
    });

    // A timer armed for the *old* offer (before the reassign) fires late.
    const timeoutResult = await service.handleDispatchTimeout(
      order.orderId,
      "acceptance_timeout",
      undefined,
      { targetAssignmentId: oldAssignment.assignmentId },
    );
    expect(timeoutResult.escalationAction).toBe("superseded");

    // The replacement assignment's own reservation is completely untouched.
    expect(
      await readAssignmentStatus(database, newAssignment.assignmentId),
    ).toBe("assigned");
    expect(
      await readActiveReservations(database, "driver", newDriverId),
    ).toEqual([
      expect.objectContaining({
        assignment_id: newAssignment.assignmentId,
        status: "held",
      }),
    ]);
    const order2 = service.getOrder(order.orderId);
    expect(order2?.status).not.toBe("dispatch_timeout");
  });
});
