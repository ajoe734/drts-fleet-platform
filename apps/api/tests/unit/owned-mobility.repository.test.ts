import { describe, expect, it, vi } from "vitest";

import type {
  ConsumerNotificationOutboxRecord,
  PassengerDispatchDisclosureSnapshot,
} from "@drts/contracts";

import { OwnedMobilityRepository } from "../../src/modules/owned-mobility/owned-mobility.repository";

describe("OwnedMobilityRepository", () => {
  it("loads partner orders by order and tenant-scoped booking ids", async () => {
    const record = {
      orderId: "order-cross-instance-001",
      bookingId: "booking-cross-instance-001",
      tenantId: "tenant-demo-001",
    };
    const query = vi.fn().mockResolvedValue({ rows: [{ record }] });
    const repository = new OwnedMobilityRepository({
      isEnabled: () => true,
      query,
    } as never);

    await expect(repository.findOrderById(record.orderId)).resolves.toEqual(
      record,
    );
    await expect(
      repository.findOrderByBookingId(record.bookingId, record.tenantId),
    ).resolves.toEqual(record);

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("WHERE order_id = $1"),
      [record.orderId],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("booking_id = $1"),
      [record.bookingId, record.tenantId],
    );
  });

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

  it("claims the next recoverable driver-completion outbox globally in retry order", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          outbox_id: "6b6e7b8a-18d4-5d8b-a7ca-c518aa5084f0",
          task_id: "task-1",
          order_id: "order-1",
          effect_type: "tenant_order_completed_webhook",
          request_id: "req-1",
          payload: { effectType: "tenant_order_completed_webhook" },
          status: "processing",
          attempt_count: 2,
          next_attempt_at: "2026-07-31T11:59:00.000Z",
          lease_token: "befd6741-8894-4f4f-bf08-4bf5de8b67ef",
          leased_until: "2026-07-31T12:01:00.000Z",
          last_error: null,
          created_at: "2026-07-31T11:58:00.000Z",
          delivered_at: null,
        },
      ],
    }));
    const repository = new OwnedMobilityRepository({
      isEnabled: () => true,
      query,
    } as never);

    await expect(
      repository.claimNextRecoverableDriverCompletionOutbox(
        { query } as never,
        "befd6741-8894-4f4f-bf08-4bf5de8b67ef",
        "2026-07-31T12:01:00.000Z",
        "2026-07-31T12:00:00.000Z",
        5,
      ),
    ).resolves.toMatchObject({
      outboxId: "6b6e7b8a-18d4-5d8b-a7ca-c518aa5084f0",
      taskId: "task-1",
      status: "processing",
      attemptCount: 2,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE ops.driver_completion_outbox AS outbox"),
      [
        "befd6741-8894-4f4f-bf08-4bf5de8b67ef",
        "2026-07-31T12:01:00.000Z",
        "2026-07-31T12:00:00.000Z",
        5,
      ],
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "ORDER BY next_attempt_at ASC, created_at ASC, task_id ASC, outbox_id ASC",
    );
  });
});
