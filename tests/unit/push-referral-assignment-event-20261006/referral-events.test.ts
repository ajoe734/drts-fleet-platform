import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConsumerNotificationOutboxRecord,
  DispatchAssignmentRecord,
  DispatchJobRecord,
  DriverTaskRecord,
} from "@drts/contracts";
import { buildOrderFixture } from "../../../apps/api/tests/integration/voice-order-fixture";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { harness as transportHarness } from "../system-remediation/sr-partner-notify-transport-20260918/transport-harness";

// Only database I/O, registry eligibility and publication are doubled. Real
// service preparation, row-lock reads, outbox writes and sequence allocation run.
// These statement/parameter probes do not claim to execute PostgreSQL semantics.
function harness(routed = true) {
  let order = buildOrderFixture({
    orderId: "referral-order",
    runtimeProfileCode: "business_dispatch",
    serviceBucket: "business_dispatch",
    orderSource: "tenant_booking",
    tenantId: "tenant-1",
    partnerId: "partner-1",
    partnerEntrySlug: "entry-1",
    passenger: {
      passengerId: "passenger-1",
      name: "Private name",
      phone: "0911000222",
    },
  });
  let job = {
    dispatchJobId: "job-1",
    orderId: order.orderId,
    status: "pending",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  } as DispatchJobRecord;
  const assignments = new Map<string, DispatchAssignmentRecord>();
  const tasks = new Map<string, DriverTaskRecord>();
  const outboxes = new Map<string, ConsumerNotificationOutboxRecord>();
  let nextSequence = 1;
  const statements: string[] = [];
  const query = vi.fn(async (sql: string, v: readonly unknown[] = []) => {
    statements.push(sql.trim());
    if (sql.includes("FROM ops.phase1_dispatch_assignments")) {
      if (sql.includes("count(*)"))
        return { rows: [{ count: String(assignments.size) }] };
      const rows = [...assignments.values()].filter((a) =>
        sql.includes("assignment_id = $1")
          ? a.assignmentId === v[0]
          : ["assigned", "accepted"].includes(a.status),
      );
      return {
        rows: rows.map((record) => ({
          record: structuredClone(record),
          assignment_id: record.assignmentId,
        })),
      };
    }
    if (sql.includes("FROM ops.phase1_driver_tasks"))
      return {
        rows: [...tasks.values()]
          .filter((t) =>
            sql.includes("task_id = $1")
              ? t.taskId === v[0]
              : t.assignmentId === v[0],
          )
          .map((record) => ({ record: structuredClone(record) })),
      };
    if (sql.includes("FROM ops.phase1_dispatch_jobs"))
      return {
        rows:
          job.status === "closed"
            ? []
            : [
                {
                  record: structuredClone(job),
                  dispatch_job_id: job.dispatchJobId,
                },
              ],
      };
    if (sql.includes("FROM ops.phase1_owned_orders"))
      return {
        rows: [{ record: structuredClone(order), aggregate_version: 1 }],
      };
    if (sql.includes("FROM mobility.phase1_order_partner_notification_routes"))
      return { rows: routed ? [{ passenger_subject_ref: "passenger-1" }] : [] };
    if (sql.includes("INSERT INTO ops.phase1_owned_orders"))
      order = JSON.parse(String(v[14]));
    if (sql.includes("INSERT INTO ops.phase1_dispatch_jobs"))
      job = JSON.parse(String(v[5]));
    if (sql.includes("INSERT INTO ops.phase1_dispatch_assignments"))
      assignments.set(String(v[0]), JSON.parse(String(v[7])));
    if (sql.includes("INSERT INTO ops.phase1_driver_tasks"))
      tasks.set(String(v[0]), JSON.parse(String(v[7])));
    if (sql.includes("INSERT INTO ops.dispatch_resource_reservations"))
      return {
        rows: [
          {
            reservation_id: "res-1",
            resource_type: v[0],
            resource_id: v[1],
            order_id: v[2],
            assignment_id: v[3],
            reservation_group_id: v[4],
            status: "held",
            version: 1,
            created_at: order.createdAt,
            updated_at: order.updatedAt,
          },
        ],
      };
    if (sql.includes("INSERT INTO ops.consumer_notification_outbox")) {
      if (outboxes.has(String(v[0]))) return { rows: [] };
      outboxes.set(String(v[0]), {
        outboxId: v[0],
        orderId: v[1],
        passengerSubjectRef: v[2],
        eventType: v[3],
        assignmentVersion: v[4],
        payload: JSON.parse(String(v[5])),
        status: v[6],
        attemptCount: v[7],
        nextAttemptAt: v[8],
        createdAt: v[9],
        deliveredAt: v[10],
      } as ConsumerNotificationOutboxRecord);
      return { rows: [{ outbox_id: v[0] }] };
    }
    if (sql.includes("UPDATE mobility.phase1_partner_notification_sequences"))
      return { rows: [{ event_sequence: String(nextSequence++) }] };
    if (sql.includes("UPDATE ops.consumer_notification_outbox"))
      outboxes.get(String(v[0]))!.payload.eventSequence = Number(v[1]);
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const database = {
    isEnabled: () => true,
    query,
    connect: vi.fn(async () => client),
  };
  const repository = new OwnedMobilityRepository(
    database as never,
    new MultiTaxiRepository(database as never),
  );
  const publishTaskAssigned = vi.fn();
  const service = new OwnedMobilityService(
    {
      getVehicleDispatchability: () => true,
      getDriverAvailability: () => true,
    } as never,
    new AuditNotificationService(),
    {} as never,
    { publishTaskAssigned, publishTaskCancelled: vi.fn() } as never,
    undefined,
    repository,
  );
  const assign = (previousAssignmentId?: string) =>
    service.createDispatchAssignment(
      job,
      order,
      "vehicle-1",
      "driver-1",
      undefined,
      undefined,
      previousAssignmentId ? { previousAssignmentId } : undefined,
    );
  return {
    service,
    repository,
    publishTaskAssigned,
    query,
    client,
    statements,
    outboxes,
    assignments,
    assign,
    getOrder: () => order,
    nextSequence: () => nextSequence,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("routed referral assignment and cancellation", () => {
  it("creates first and replacement notifications in the assignment transaction with durable generations and contiguous sequences", async () => {
    const h = harness();
    const first = await h.assign();
    const second = await h.assign(first.assignmentId);
    expect([...h.outboxes.values()]).toMatchObject([
      {
        eventType: "assignment_disclosure_ready",
        assignmentVersion: 1,
        passengerSubjectRef: "passenger-1",
        payload: { eventSequence: 1 },
      },
      {
        eventType: "assignment_replaced",
        assignmentVersion: 2,
        passengerSubjectRef: "passenger-1",
        payload: { eventSequence: 2 },
      },
    ]);
    expect(h.assignments.get(second.assignmentId)?.status).toBe("assigned");
    expect(h.assignments.get(first.assignmentId)?.status).toBe("cancelled");
    expect(
      h.statements.some((s) =>
        s.includes("INSERT INTO ops.passenger_dispatch_disclosure_snapshots"),
      ),
    ).toBe(false);
    for (const row of h.outboxes.values())
      expect(row.payload).toEqual({ eventSequence: row.assignmentVersion });
    const insertion = h.statements.findIndex((s) =>
      s.includes("INSERT INTO ops.consumer_notification_outbox"),
    );
    expect(insertion).toBeGreaterThan(
      h.statements.findIndex((s) =>
        s.includes("INSERT INTO ops.phase1_dispatch_assignments"),
      ),
    );
    expect(insertion).toBeLessThan(h.statements.indexOf("COMMIT"));
    // Replaying the exact workflow outbox uses the production ON CONFLICT path.
    await h.repository.withTransaction((tx) =>
      h.repository.persistOrderWorkflow(tx, {
        consumerNotificationOutbox: [...h.outboxes.values()],
      }),
    );
    expect(h.outboxes.size).toBe(2);
    expect(h.nextSequence()).toBe(3);
  });

  it.each([false, true])(
    "cancels routed referral orders, including before assignment (assigned=%s)",
    async (assigned) => {
      const h = harness();
      if (assigned) await h.assign();
      h.statements.length = 0;
      await h.service.cancelOwnedOrder(h.getOrder().orderId, {
        reason: "Private cancellation text",
      });
      const row = [...h.outboxes.values()].find(
        (o) => o.eventType === "trip_cancelled",
      );
      expect(row).toMatchObject({
        assignmentVersion: assigned ? 1 : 0,
        payload: {
          cancelReason: "passenger_cancelled",
          eventSequence: assigned ? 2 : 1,
        },
      });
      expect(row?.payload).toEqual({
        cancelReason: "passenger_cancelled",
        eventSequence: assigned ? 2 : 1,
      });
      const insertion = h.statements.findIndex((s) =>
        s.includes("INSERT INTO ops.consumer_notification_outbox"),
      );
      expect(insertion).toBeGreaterThan(h.statements.indexOf("BEGIN"));
      expect(insertion).toBeLessThan(h.statements.indexOf("COMMIT"));
      await expect(
        h.service.cancelOwnedOrder(h.getOrder().orderId, {}),
      ).rejects.toMatchObject({ code: "ORDER_NOT_CANCELABLE" });
      expect(
        [...h.outboxes.values()].filter(
          (o) => o.eventType === "trip_cancelled",
        ),
      ).toHaveLength(1);
    },
  );

  it("does not notify enterprise/staff orders without a server route, even with referral-like fields", async () => {
    const h = harness(false);
    h.getOrder().referralPassengerLifecycle = {
      bookingIdempotencyKey: "unrouted",
    };
    await h.assign();
    await h.service.cancelOwnedOrder(h.getOrder().orderId, {});
    expect(h.outboxes.size).toBe(0);
  });

  it("rolls back and does not publish assignment when notification persistence fails", async () => {
    const h = harness();
    const query = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql, values) => {
      if (sql.includes("INSERT INTO ops.consumer_notification_outbox"))
        throw new Error("outbox unavailable");
      return query(sql, values);
    });
    await expect(h.assign()).rejects.toThrow("outbox unavailable");
    expect(h.statements).toContain("ROLLBACK");
    expect(h.statements).not.toContain("COMMIT");
    expect(h.publishTaskAssigned).not.toHaveBeenCalled();
  });
});

describe("referral transport relevance", () => {
  it.each([
    "assignment_disclosure_ready",
    "assignment_replaced",
    "eta_changed",
  ] as const)("supersedes old %s after reassignment", async (eventType) => {
    const h = transportHarness();
    h.row.eventType = eventType;
    h.relevance.assignmentVersion = 2;
    const result = await h.service.deliverPassengerNotification(h.row);
    expect(result).toMatchObject({ result: "provider_error" });
    expect(h.row.payload.partnerNotification).toMatchObject({
      failureReason: "notification_superseded",
      retryDisposition: "terminal",
    });
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
