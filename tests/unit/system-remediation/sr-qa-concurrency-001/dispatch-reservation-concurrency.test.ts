import { describe, expect, it } from "vitest";
import {
  OwnedMobilityRepository,
  DispatchResourceReservationConflictError,
} from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import type { DatabaseService } from "../../../../apps/api/src/common/db/database.service";
import {
  FakeConcurrencyPgClient,
  FakeDatabaseServiceHandle,
} from "./fake-concurrency-pg-client";

describe("SR-QA-CONCURRENCY-001: Multi-Instance Dispatch Reservation Concurrency Verification", () => {
  function setupHarness() {
    const sharedPg = new FakeConcurrencyPgClient();
    const handleA = new FakeDatabaseServiceHandle(sharedPg);
    const handleB = new FakeDatabaseServiceHandle(sharedPg);

    const repoA = new OwnedMobilityRepository(
      handleA as unknown as DatabaseService,
    );
    const repoB = new OwnedMobilityRepository(
      handleB as unknown as DatabaseService,
    );

    return { repoA, repoB, handleA, handleB, sharedPg };
  }

  it("Case 1 (Positive): Reserves capacity for driver and vehicle in fixed lock order with status 'held'", async () => {
    const { repoA, handleA, sharedPg } = setupHarness();
    const orderId = "ord-dispatch-101";
    const assignmentId = "assign-dispatch-101";
    const driverId = "driver-alpha-001";
    const vehicleId = "vehicle-alpha-001";
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const reserved = await handleA.withTransaction(async (txClient) => {
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

    // Verify persisted rows in DB
    const dbRows = sharedPg.getTable("ops.dispatch_resource_reservations");
    expect(dbRows).toHaveLength(2);
    expect(dbRows.every((r) => r.status === "held")).toBe(true);
  });

  it("Case 2 (Negative / Conflict): Rejects concurrent reservation on same driver with DispatchResourceReservationConflictError and rolls back loser", async () => {
    const { repoA, repoB, handleA, handleB, sharedPg } = setupHarness();
    const driverId = "driver-shared-002";
    const vehicleA = "vehicle-alpha-002";
    const vehicleB = "vehicle-beta-002";

    // Instance A acquires driverId + vehicleA
    await handleA.withTransaction(async (txA) => {
      return repoA.reserveDispatchResources(txA, {
        orderId: "ord-instance-a-201",
        assignmentId: "assign-a-201",
        driverId,
        vehicleId: vehicleA,
        expiresAt: null,
      });
    });

    expect(
      sharedPg.getTable("ops.dispatch_resource_reservations"),
    ).toHaveLength(2);

    // Instance B concurrently attempts to reserve the same driverId for a different order/vehicle
    let conflictError: unknown;
    try {
      await handleB.withTransaction(async (txB) => {
        return repoB.reserveDispatchResources(txB, {
          orderId: "ord-instance-b-202",
          assignmentId: "assign-b-202",
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

    // Instance B's transaction rolled back; only Instance A's 2 rows exist
    const rows = sharedPg.getTable("ops.dispatch_resource_reservations");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.assignment_id === "assign-a-201")).toBe(true);
  });

  it("Case 3 (Negative / Partial Contention): Rejects reservation on shared vehicle and prevents partial driver hold leakage", async () => {
    const { repoA, repoB, handleA, handleB, sharedPg } = setupHarness();
    const driverA = "driver-p-001";
    const driverB = "driver-p-002";
    const sharedVehicle = "vehicle-shared-999";

    // Instance A reserves driverA + sharedVehicle
    await handleA.withTransaction(async (txA) => {
      return repoA.reserveDispatchResources(txA, {
        orderId: "ord-p-301",
        assignmentId: "assign-p-301",
        driverId: driverA,
        vehicleId: sharedVehicle,
        expiresAt: null,
      });
    });

    // Instance B attempts to reserve driverB + sharedVehicle.
    // Driver reservation succeeds first, but vehicle reservation fails on unique constraint.
    let caught: unknown;
    try {
      await handleB.withTransaction(async (txB) => {
        return repoB.reserveDispatchResources(txB, {
          orderId: "ord-p-302",
          assignmentId: "assign-p-302",
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
    const allRows = sharedPg.getTable("ops.dispatch_resource_reservations");
    expect(allRows).toHaveLength(2);
    const driverBRow = allRows.find((r) => r.resource_id === driverB);
    expect(driverBRow).toBeUndefined();
  });

  it("Case 4 (Positive): Transitions reservations to 'released' on cancel/reject, allowing subsequent re-reservation", async () => {
    const { repoA, repoB, handleA, handleB, sharedPg } = setupHarness();
    const driverId = "driver-release-001";
    const vehicleId = "vehicle-release-001";
    const assignmentA = "assign-rel-401";
    const assignmentB = "assign-rel-402";

    // Instance A reserves
    await handleA.withTransaction(async (txA) => {
      return repoA.reserveDispatchResources(txA, {
        orderId: "ord-rel-401",
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

    const rowsAfterRelease = sharedPg.getTable(
      "ops.dispatch_resource_reservations",
    );
    expect(
      rowsAfterRelease.filter((r) => r.status === "released"),
    ).toHaveLength(2);

    // Now Instance B can successfully acquire the exact same driver and vehicle
    const reservedB = await handleB.withTransaction(async (txB) => {
      return repoB.reserveDispatchResources(txB, {
        orderId: "ord-rel-402",
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

  it("Case 5 (Positive): Transitions reservations from 'held' to 'occupied' on driver accept, maintaining mutex against competitors", async () => {
    const { repoA, repoB, handleA, handleB, sharedPg } = setupHarness();
    const driverId = "driver-occ-001";
    const vehicleId = "vehicle-occ-001";
    const assignmentA = "assign-occ-501";

    await handleA.withTransaction(async (txA) => {
      return repoA.reserveDispatchResources(txA, {
        orderId: "ord-occ-501",
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

    const dbRows = sharedPg.getTable("ops.dispatch_resource_reservations");
    expect(dbRows.filter((r) => r.status === "occupied")).toHaveLength(2);

    // Instance B cannot reserve either resource while occupied
    let caught: unknown;
    try {
      await handleB.withTransaction(async (txB) => {
        return repoB.reserveDispatchResources(txB, {
          orderId: "ord-competing-502",
          assignmentId: "assign-competing-502",
          driverId,
          vehicleId: "vehicle-unrelated",
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

  it("Case 6 (Concurrency Fence): Row lock FOR UPDATE accurately detects closed assignment to fence off stale timeout execution", async () => {
    const { repoA, repoB, handleA, handleB, sharedPg } = setupHarness();
    const assignmentId = "assign-fenced-601";
    const orderId = "ord-fenced-601";

    // Seed assignment table with 'offered' status
    sharedPg.getTable("ops.phase1_dispatch_assignments").push({
      assignment_id: assignmentId,
      order_id: orderId,
      record: {
        assignmentId,
        orderId,
        status: "offered",
        driverId: "driver-fenced-001",
        vehicleId: "vehicle-fenced-001",
      },
      created_at: new Date().toISOString(),
    });

    // Instance B accepts the order first and updates assignment to 'accepted'
    await handleB.withTransaction(async (txB) => {
      const locked = await repoB.lockDispatchAssignmentForUpdate(
        txB,
        assignmentId,
      );
      expect(locked?.status).toBe("offered");

      // Update assignment to 'accepted'
      await txB.query(
        "UPDATE ops.phase1_dispatch_assignments SET record = $2 WHERE assignment_id = $1",
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
    // Under row lock, it inspects the authoritative status:
    await handleA.withTransaction(async (txA) => {
      const authoritativeAssignment =
        await repoA.lockDispatchAssignmentForUpdate(txA, assignmentId);

      // Must see 'accepted', not 'offered'
      expect(authoritativeAssignment?.status).toBe("accepted");

      // Stale timeout detects status is not 'offered' and performs safe no-op
      const isStillOffered = authoritativeAssignment?.status === "offered";
      expect(isStillOffered).toBe(false);
    });
  });
});
