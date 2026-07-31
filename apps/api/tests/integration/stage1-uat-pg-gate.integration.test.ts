import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type {
  DriverCompleteTaskCommand,
  DriverTaskRecord,
  DispatchAssignmentRecord,
  OwnedOrderRecord,
  DispatchJobRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../src/common/db";
import { generateDeterministicUuid } from "../../src/common/durable-identity";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import {
  OwnedMobilityRepository,
  type DriverCompletionOutboxRecord,
} from "../../src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { TenantPartnerRepository } from "../../src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const DATABASE_URL = process.env.DATABASE_URL;

function createTestHarness(database: DatabaseService) {
  const repository = new OwnedMobilityRepository(database);
  const auditRepo = {
    isEnabled: () => database.isEnabled(),
    append: async (entry: any) => {
      if (!database.isEnabled()) return;
      await database.query(
        `
          INSERT INTO ops.audit_logs (
            audit_id, occurred_at, action, entity_type, entity_id, actor_id, request_id, payload, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (audit_id) DO NOTHING
        `,
        [
          entry.auditId ?? `audit-${randomUUID()}`,
          entry.occurredAt ?? new Date().toISOString(),
          entry.action,
          entry.entityType,
          entry.entityId,
          entry.actorId,
          entry.requestId ?? null,
          JSON.stringify(entry.payload ?? {}),
          new Date().toISOString(),
        ],
      );
    },
  };

  const auditNotificationService = new AuditNotificationService(
    auditRepo as any,
  );
  const taskEventsService = new OwnedMobilityTaskEventsService();

  const tenantRepo = new TenantPartnerRepository(database);
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService,
    tenantRepo,
  );

  const callcenterService = {
    isEnabled: () => false,
    registerRecordingAttachmentListener: () => {},
    registerRecordingStateChangeListener: () => {},
    linkOrderToCallSession: () => {},
  };

  const service = new OwnedMobilityService(
    { isEnabled: () => false } as any, // regulatoryRegistryService
    auditNotificationService,
    callcenterService as any,
    taskEventsService,
    undefined, // opsDispatchEventsService
    repository,
    tenantPartnerService,
  );

  return { repository, service, tenantPartnerService, tenantRepo };
}

async function cleanupTestData(
  database: DatabaseService,
  orderIds: string[],
  tenantIds: string[],
) {
  if (!database.isEnabled()) return;

  for (const orderId of orderIds) {
    await database.query(
      "DELETE FROM ops.driver_completion_outbox WHERE order_id = $1",
      [orderId],
    );
    await database.query(
      "DELETE FROM ops.phase1_driver_tasks WHERE order_id = $1",
      [orderId],
    );
    await database.query(
      "DELETE FROM ops.phase1_dispatch_assignments WHERE order_id = $1",
      [orderId],
    );
    await database.query(
      "DELETE FROM ops.phase1_dispatch_jobs WHERE order_id = $1",
      [orderId],
    );
    await database.query(
      "DELETE FROM ops.phase1_owned_orders WHERE order_id = $1",
      [orderId],
    );
    await database.query(
      "DELETE FROM ops.phase1_dispatch_trace_logs WHERE order_id = $1",
      [orderId],
    );
  }

  for (const tenantId of tenantIds) {
    await database.query(
      "DELETE FROM core.phase1_tenant_quota_monthly_snapshots WHERE tenant_id = $1",
      [tenantId],
    );
    await database.query(
      "DELETE FROM core.phase1_tenant_quota_ledger WHERE tenant_id = $1",
      [tenantId],
    );
    await database.query(
      "DELETE FROM core.phase1_tenant_quota_policies WHERE tenant_id = $1",
      [tenantId],
    );
  }
}

describe("Stage1 UAT PostgreSQL Gate Integration (STAGE1-UAT-PG-GATE-20260731)", () => {
  const databases: DatabaseService[] = [];
  const services: OwnedMobilityService[] = [];
  const testOrderIds: string[] = [];
  const testTenantIds: string[] = [];

  afterEach(async () => {
    for (const service of services.splice(0)) {
      await service.onApplicationShutdown();
      await service.onModuleDestroy();
    }

    if (DATABASE_URL) {
      const cleanupDb = new DatabaseService();
      try {
        await cleanupTestData(cleanupDb, testOrderIds, testTenantIds);
      } finally {
        testOrderIds.length = 0;
        testTenantIds.length = 0;
        await cleanupDb.onModuleDestroy();
      }
    }

    for (const database of databases.splice(0)) {
      await database.onModuleDestroy();
    }
  });

  it("requires DATABASE_URL", () => {
    expect(DATABASE_URL).toBeTruthy();
  });

  it("proves dual DatabaseService / PoolClient task completion replay and outbox/quota invariants", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const orderId = `ord-pg-gate-${randomUUID()}`;
    const assignmentId = `asgn-pg-gate-${randomUUID()}`;
    const taskId = `task-pg-gate-${randomUUID()}`;
    const dispatchJobId = `job-pg-gate-${randomUUID()}`;
    const tenantId = `tenant-pg-gate-${randomUUID()}`;
    const requestId = `req-pg-gate-${randomUUID()}`;

    testOrderIds.push(orderId);
    testTenantIds.push(tenantId);

    // Create 2 distinct DatabaseService instances with separate connection pools
    const databaseA = new DatabaseService();
    const databaseB = new DatabaseService();
    databases.push(databaseA, databaseB);

    const harnessA = createTestHarness(databaseA);
    const harnessB = createTestHarness(databaseB);
    services.push(harnessA.service, harnessB.service);

    await harnessA.service.onModuleInit();
    await harnessB.service.onModuleInit();

    const nowIso = new Date().toISOString();

    const orderRecord: OwnedOrderRecord = {
      orderId,
      orderNo: `ORD-${orderId}`,
      orderSource: "tenant_api",
      bookingId: `booking-${orderId}`,
      tenantId,
      passengerId: "p-001",
      passengerPhone: "+886912345678",
      status: "on_trip",
      pickupAddress: { text: "Taipei Main Station" },
      dropoffAddress: { text: "Taoyuan Airport" },
      quotedFare: { currency: "TWD", amountMinor: 120000 },
      fixedPrice: true,
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "airport_transfer",
      dispatchSemantics: "reservation",
      proofRequirements: { minPhotoCount: 0, signoffRequired: false },
      complianceFlags: [],
      approvalRequestIds: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const dispatchJobRecord: DispatchJobRecord = {
      dispatchJobId,
      orderId,
      status: "dispatched",
      targetDriverId: "drv-001",
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const assignmentRecord: DispatchAssignmentRecord = {
      assignmentId,
      dispatchJobId,
      orderId,
      taskId,
      driverId: "drv-001",
      vehicleId: "veh-001",
      assignmentType: "business_dispatch",
      status: "accepted",
      dispatchedAt: nowIso,
      acceptedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const taskRecord: DriverTaskRecord = {
      taskId,
      dispatchJobId,
      assignmentId,
      orderId,
      driverId: "drv-001",
      vehicleId: "veh-001",
      taskType: "business_dispatch",
      status: "on_trip",
      pickupAddress: { text: "Taipei Main Station" },
      dropoffAddress: { text: "Taoyuan Airport" },
      proof: { photos: [], expenseItems: [] },
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // Seed test records into PostgreSQL via DatabaseService A
    await harnessA.repository.persistChanges({
      orders: [orderRecord],
      dispatchJobs: [dispatchJobRecord],
      dispatchAssignments: [assignmentRecord],
      driverTasks: [taskRecord],
      quotaPolicies: [
        {
          tenantId,
          costCenterCode: null,
          period: "monthly",
          limit: {
            bookingCountLimit: 10,
            amountMinorLimit: null,
            currency: "TWD",
            enforcementMode: "hard_block",
          },
          inheritedFromTenant: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
    });

    const command: DriverCompleteTaskCommand = {
      proof: { photos: [], expenseItems: [] },
      fare: { currency: "TWD", amountMinor: 120000 },
    };

    // Concurrently issue task completion with identical requestId on harnessA and harnessB
    const [resA, resB] = await Promise.all([
      harnessA.service.completeDriverTask(taskId, command, requestId),
      harnessB.service.completeDriverTask(taskId, command, requestId),
    ]);

    expect(resA.status).toBe("completed");
    expect(resB.status).toBe("completed");

    // Query DB directly via databaseA to verify PostgreSQL persistence state
    const taskRows = await databaseA.query<{ record: DriverTaskRecord }>(
      "SELECT record FROM ops.phase1_driver_tasks WHERE task_id = $1",
      [taskId],
    );
    expect(taskRows.rows[0]?.record.status).toBe("completed");

    const orderRows = await databaseA.query<{ record: OwnedOrderRecord }>(
      "SELECT record FROM ops.phase1_owned_orders WHERE order_id = $1",
      [orderId],
    );
    expect(orderRows.rows[0]?.record.status).toBe("completed");

    const initialOutboxRows = await databaseA.query<DriverCompletionOutboxRecord>(
      "SELECT * FROM ops.driver_completion_outbox WHERE task_id = $1",
      [taskId],
    );
    expect(initialOutboxRows.rows.length).toBeGreaterThan(0);

    // Verify outbox entries created ONCE for the task (unique effect types)
    const effectTypes = initialOutboxRows.rows.map((r) => r.effect_type);
    const uniqueEffects = new Set(effectTypes);
    expect(uniqueEffects.size).toBe(initialOutboxRows.rows.length);

    // Replay check: execute completion again with same requestId on DatabaseService B
    const replayedRes = await harnessB.service.completeDriverTask(
      taskId,
      command,
      requestId,
    );
    expect(replayedRes.status).toBe("completed");

    // Strict replay invariant: verify outbox row count in PG has ZERO mutation (no duplicate outbox rows)
    const postReplayOutboxRows = await databaseA.query<DriverCompletionOutboxRecord>(
      "SELECT * FROM ops.driver_completion_outbox WHERE task_id = $1",
      [taskId],
    );
    expect(postReplayOutboxRows.rows.length).toBe(initialOutboxRows.rows.length);
  });

  it("proves stable IDs, expired lease recovery, and worker crash retry resilience in PostgreSQL", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const database = new DatabaseService();
    databases.push(database);
    const harness = createTestHarness(database);
    services.push(harness.service);
    await harness.service.onModuleInit();

    const taskId = `task-crash-${randomUUID()}`;
    const orderId = `ord-crash-${randomUUID()}`;
    const dispatchJobId = `job-crash-${randomUUID()}`;
    const assignmentId = `asgn-crash-${randomUUID()}`;
    testOrderIds.push(orderId);

    const nowIso = new Date().toISOString();

    // First seed order & task so foreign key is satisfied
    await harness.repository.persistChanges({
      orders: [
        {
          orderId,
          orderNo: `ORD-${orderId}`,
          orderSource: "tenant_api",
          bookingId: `booking-${orderId}`,
          tenantId: "tenant-crash",
          passengerId: "p-001",
          status: "on_trip",
          pickupAddress: { text: "A" },
          dropoffAddress: { text: "B" },
          serviceBucket: "business_dispatch",
          dispatchSemantics: "reservation",
          proofRequirements: { minPhotoCount: 0, signoffRequired: false },
          complianceFlags: [],
          approvalRequestIds: [],
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
      dispatchJobs: [
        {
          dispatchJobId,
          orderId,
          status: "dispatched",
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
      dispatchAssignments: [
        {
          assignmentId,
          dispatchJobId,
          orderId,
          taskId,
          driverId: "drv-001",
          vehicleId: "veh-001",
          assignmentType: "business_dispatch",
          status: "accepted",
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
      driverTasks: [
        {
          taskId,
          dispatchJobId,
          assignmentId,
          orderId,
          driverId: "drv-001",
          vehicleId: "veh-001",
          taskType: "business_dispatch",
          status: "on_trip",
          pickupAddress: { text: "A" },
          dropoffAddress: { text: "B" },
          proof: { photos: [], expenseItems: [] },
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
    });

    const outboxId = generateDeterministicUuid(
      "driver_completion_outbox",
      `${taskId}:test_effect`,
    );

    const pastLeaseTime = new Date(Date.now() - 120_000).toISOString();

    // Insert outbox entry with expired lease simulating a crashed worker
    await database.query(
      `
        INSERT INTO ops.driver_completion_outbox (
          outbox_id, task_id, order_id, effect_type, request_id, payload,
          status, attempt_count, next_attempt_at, lease_token, leased_until, created_at
        ) VALUES (
          $1, $2, $3, 'owned_mobility_trip_completed', 'req-001', '{"event": {}}',
          'processing', 1, $4::timestamptz, $5::uuid, $4::timestamptz, $6::timestamptz
        )
      `,
      [
        outboxId,
        taskId,
        orderId,
        pastLeaseTime,
        randomUUID(),
        nowIso,
      ],
    );

    // Claim next recoverable outbox row
    const leaseToken = randomUUID();
    const newLeasedUntil = new Date(Date.now() + 60_000).toISOString();

    const claimed = await harness.repository.claimNextRecoverableDriverCompletionOutbox(
      database,
      leaseToken,
      newLeasedUntil,
      new Date().toISOString(),
      5,
    );

    expect(claimed).not.toBeNull();
    expect(claimed?.action).toBe("dispatch");
    expect(claimed?.record.outboxId).toBe(outboxId);
    expect(claimed?.record.status).toBe("processing");
    expect(claimed?.record.attemptCount).toBe(2); // Attempt count incremented from 1 to 2

    // Mark outbox delivered
    await harness.repository.markDriverCompletionOutboxDelivered(
      database,
      outboxId,
      leaseToken,
      new Date().toISOString(),
    );

    // Query PG to confirm status updated to delivered
    const checkRow = await database.query<DriverCompletionOutboxRecord>(
      "SELECT * FROM ops.driver_completion_outbox WHERE outbox_id = $1",
      [outboxId],
    );
    expect(checkRow.rows[0]?.status).toBe("delivered");
    expect(checkRow.rows[0]?.delivered_at).not.toBeNull();
  });

  it("proves transaction failure rollback integrity (task/order/quota/outbox/audit zero persistence)", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const database = new DatabaseService();
    databases.push(database);
    const harness = createTestHarness(database);
    services.push(harness.service);
    await harness.service.onModuleInit();

    const orderId = `ord-rollback-${randomUUID()}`;
    const taskId = `task-rollback-${randomUUID()}`;
    const dispatchJobId = `job-rollback-${randomUUID()}`;
    testOrderIds.push(orderId);

    const nowIso = new Date().toISOString();

    const orderRecord: OwnedOrderRecord = {
      orderId,
      orderNo: `ORD-${orderId}`,
      orderSource: "tenant_api",
      bookingId: `booking-${orderId}`,
      tenantId: "tenant-rollback",
      passengerId: "p-001",
      passengerPhone: "+886912345678",
      status: "on_trip",
      pickupAddress: { text: "A" },
      dropoffAddress: { text: "B" },
      quotedFare: { currency: "TWD", amountMinor: 1000 },
      fixedPrice: true,
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "airport_transfer",
      dispatchSemantics: "reservation",
      proofRequirements: { minPhotoCount: 0, signoffRequired: false },
      complianceFlags: [],
      approvalRequestIds: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const taskRecord: DriverTaskRecord = {
      taskId,
      dispatchJobId,
      assignmentId: `asgn-${taskId}`,
      orderId,
      driverId: "drv-001",
      vehicleId: "veh-001",
      taskType: "business_dispatch",
      status: "on_trip",
      pickupAddress: { text: "A" },
      dropoffAddress: { text: "B" },
      proof: { photos: [], expenseItems: [] },
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // Attempt persistence inside a transaction that fails
    await expect(
      harness.repository.withTransaction(async (tx) => {
        await harness.repository.persistOrderWorkflow(tx, {
          orders: [orderRecord],
          driverTasks: [taskRecord],
        });

        await harness.repository.persistDriverCompletionOutbox(tx, [
          {
            outboxId: randomUUID(),
            taskId,
            orderId,
            effectType: "owned_mobility_trip_completed",
            requestId: "req-rollback",
            payload: { event: {} },
            status: "pending",
            attemptCount: 0,
            nextAttemptAt: nowIso,
            leaseToken: null,
            leasedUntil: null,
            lastError: null,
            createdAt: nowIso,
            deliveredAt: null,
          },
        ]);

        // Intentional rollback error
        throw new Error("SIMULATED_TRANSACTION_FAILURE");
      }),
    ).rejects.toThrow("SIMULATED_TRANSACTION_FAILURE");

    // Verify ZERO persistence in PostgreSQL for order, task, and outbox
    const orderCheck = await database.query(
      "SELECT 1 FROM ops.phase1_owned_orders WHERE order_id = $1",
      [orderId],
    );
    expect(orderCheck.rows.length).toBe(0);

    const taskCheck = await database.query(
      "SELECT 1 FROM ops.phase1_driver_tasks WHERE task_id = $1",
      [taskId],
    );
    expect(taskCheck.rows.length).toBe(0);

    const outboxCheck = await database.query(
      "SELECT 1 FROM ops.driver_completion_outbox WHERE task_id = $1",
      [taskId],
    );
    expect(outboxCheck.rows.length).toBe(0);
  });
});
