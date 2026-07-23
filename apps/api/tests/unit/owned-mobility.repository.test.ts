import { describe, expect, it, vi } from "vitest";

import type {
  ConsumerNotificationOutboxRecord,
  PassengerDispatchDisclosureSnapshot,
} from "@drts/contracts";

import { OwnedMobilityRepository } from "../../src/modules/owned-mobility/owned-mobility.repository";

describe("OwnedMobilityRepository", () => {
  it("hydrates each owned-mobility record from its matching authority table", async () => {
    const recordsByTable = new Map<string, unknown>([
      ["ops.phase1_owned_orders", { orderId: "order-1" }],
      ["ops.phase1_dispatch_jobs", { dispatchJobId: "job-1" }],
      ["ops.phase1_dispatch_attempts", { attemptId: "attempt-1" }],
      ["ops.phase1_dispatch_assignments", { assignmentId: "assignment-1" }],
      ["ops.phase1_driver_tasks", { taskId: "task-1" }],
      ["ops.phase1_dispatch_trace_logs", { traceId: "trace-1" }],
      [
        "ops.passenger_dispatch_disclosure_snapshots",
        { snapshotId: "snapshot-1" },
      ],
      ["ops.consumer_notification_outbox", { outboxId: "outbox-1" }],
    ]);
    const query = vi.fn(async (sql: string) => {
      const entry = [...recordsByTable.entries()].find(([table]) =>
        sql.includes(table),
      );
      return { rows: entry ? [{ record: entry[1] }] : [] };
    });
    const repository = new OwnedMobilityRepository({
      isEnabled: () => true,
      query,
    } as never);

    const state = await repository.loadState();

    expect(state).toMatchObject({
      orders: [{ orderId: "order-1" }],
      dispatchJobs: [{ dispatchJobId: "job-1" }],
      dispatchAttempts: [{ attemptId: "attempt-1" }],
      dispatchAssignments: [{ assignmentId: "assignment-1" }],
      driverTasks: [{ taskId: "task-1" }],
      dispatchTraceLogs: [{ traceId: "trace-1" }],
      passengerDisclosureSnapshots: [{ snapshotId: "snapshot-1" }],
      consumerNotificationOutbox: [{ outboxId: "outbox-1" }],
    });
  });

  it("atomically supersedes only older passenger snapshots before inserting a replacement", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const repository = new OwnedMobilityRepository({
      isEnabled: true,
      query,
    } as never);
    const snapshot: PassengerDispatchDisclosureSnapshot = {
      snapshotId: "snapshot-2",
      orderId: "order-1",
      dispatchJobId: "job-1",
      assignmentId: "assignment-2",
      assignmentVersion: 2,
      runtimeProfileCode: "multi_taxi_direct",
      operatingAuthorizationId: "authorization-1",
      passengerSubjectRef: "passenger-1",
      driver: {
        driverId: "driver-1",
        displayName: "Driver One",
        publicCredentialNo: "******1234",
        credentialVerifiedAt: "2026-07-23T00:00:00.000Z",
      },
      vehicle: {
        vehicleId: "vehicle-1",
        plateNo: "TAXI-001",
        make: "Toyota",
        model: "Camry",
        color: "Silver",
        doorCount: 5,
      },
      rating: {
        status: "new_driver",
        displayLabel: "New driver",
        averageScore: null,
        ratingCount: 0,
      },
      route: {
        pickup: {
          label: "Pickup",
          latitude: 25.033,
          longitude: 121.5654,
        },
        dropoff: {
          label: "Dropoff",
          latitude: 25.0478,
          longitude: 121.517,
        },
        distanceMeters: null,
        durationSeconds: null,
        geometry: null,
        source: "dispatch_authority",
      },
      fare: {
        currency: "TWD",
        estimateMinor: null,
        policyLabel: "Metered fare",
        source: "operating_authority",
      },
      createdAt: "2026-07-23T00:01:00.000Z",
      supersededAt: null,
    };
    const outbox: ConsumerNotificationOutboxRecord = {
      outboxId: "outbox-1",
      orderId: snapshot.orderId,
      passengerSubjectRef: snapshot.passengerSubjectRef,
      eventType: "assignment_replaced",
      assignmentVersion: snapshot.assignmentVersion,
      payload: {
        snapshotId: snapshot.snapshotId,
        assignmentId: snapshot.assignmentId,
      },
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: snapshot.createdAt,
      createdAt: snapshot.createdAt,
      deliveredAt: null,
    };

    await repository.persistOrderWorkflow({ query } as never, {
      passengerDisclosureSnapshots: [snapshot],
      consumerNotificationOutbox: [outbox],
    });

    expect(query).toHaveBeenCalledTimes(2);
    const [snapshotSql, snapshotParameters] = query.mock.calls[0]!;
    expect(snapshotSql).toContain("WITH superseded AS");
    expect(snapshotSql).toContain("assignment_version < $5");
    expect(snapshotSql).toContain(
      "INSERT INTO ops.passenger_dispatch_disclosure_snapshots",
    );
    expect(snapshotParameters).toEqual([
      snapshot.snapshotId,
      snapshot.orderId,
      snapshot.dispatchJobId,
      snapshot.assignmentId,
      snapshot.assignmentVersion,
      JSON.stringify(snapshot),
      snapshot.createdAt,
      snapshot.supersededAt,
    ]);

    const [outboxSql] = query.mock.calls[1]!;
    expect(outboxSql).toContain("INSERT INTO ops.consumer_notification_outbox");
  });
});
