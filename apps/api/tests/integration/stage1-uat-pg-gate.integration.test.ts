import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import type {
  DispatchAssignmentRecord,
  DispatchJobRecord,
  DriverCompleteTaskCommand,
  DriverTaskRecord,
  OwnedOrderRecord,
  TenantQuotaLedgerEntry,
  TenantQuotaPolicyRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../src/common/db";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditLogRepository } from "../../src/modules/audit-notification/audit-log.repository";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import {
  OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
  OWNED_MOBILITY_TRIP_COMPLETED_EVENT,
} from "../../src/modules/owned-mobility/owned-mobility-events";
import {
  OwnedMobilityRepository,
  type DriverCompletionOutboxEffectType,
  type DriverCompletionOutboxRecord,
  type OwnedMobilityQueryExecutor,
} from "../../src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import {
  TenantPartnerRepository,
  type StoredWebhookEndpointRecord,
  type TenantQuotaMonthlySnapshotRecord,
} from "../../src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import { rebuildSnapshotUsage } from "../../src/modules/tenant-partner/tenant-quota-ledger";

const DATABASE_URL = process.env.DATABASE_URL;
const EFFECT_TYPES: DriverCompletionOutboxEffectType[] = [
  "tenant_order_completed_webhook",
  "owned_mobility_trip_completed",
  "multi_taxi_certificate",
  "completion_audit_bundle",
  "driver_task_updated",
  "ops_dispatch_job_updated",
];

type Seed = {
  order: OwnedOrderRecord;
  dispatchJob: DispatchJobRecord;
  assignment: DispatchAssignmentRecord;
  task: DriverTaskRecord;
  tenantId: string;
  bookingId: string;
  requestId: string;
  periodKey: string;
  quotaPolicy: TenantQuotaPolicyRecord;
  quotaLedger: TenantQuotaLedgerEntry[];
  quotaSnapshot: TenantQuotaMonthlySnapshotRecord;
  webhookEndpoint: StoredWebhookEndpointRecord;
};

type Harness = {
  database: DatabaseService;
  repository: OwnedMobilityRepository;
  tenantRepository: TenantPartnerRepository;
  tenantService: TenantPartnerService;
  service: OwnedMobilityService;
  taskEvents: OwnedMobilityTaskEventsService;
  opsEvents: OpsDispatchEventsService;
  sinks: {
    settlement: unknown[];
    certificate: unknown[];
    driverTask: unknown[];
    opsDispatch: unknown[];
  };
};

class FailAfterOutboxRepository extends OwnedMobilityRepository {
  override async persistDriverCompletionOutbox(
    executor: OwnedMobilityQueryExecutor,
    entries: readonly DriverCompletionOutboxRecord[],
  ) {
    await super.persistDriverCompletionOutbox(executor, entries);
    throw new Error("PG_GATE_INJECTED_AFTER_OUTBOX");
  }
}

const databases: DatabaseService[] = [];
const harnesses: Harness[] = [];
const seeds: Seed[] = [];
let webhookServer: Server;
let webhookUrl = "";
let webhookRequests: Array<{
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> = [];
let warningMessages: string[] = [];

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  message: string,
  timeoutMs = 5_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${message}`);
}

function buildOutboxId(taskId: string, effectType: string) {
  const digest = createHash("sha256")
    .update(`driver-completion-outbox:${taskId}:${effectType}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  digest[12] = "5";
  digest[16] = ((parseInt(digest[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return [
    digest.slice(0, 8).join(""),
    digest.slice(8, 12).join(""),
    digest.slice(12, 16).join(""),
    digest.slice(16, 20).join(""),
    digest.slice(20, 32).join(""),
  ].join("-");
}

function createSeed(): Seed {
  const now = new Date().toISOString();
  const tenantId = randomUUID();
  const bookingId = randomUUID();
  const orderId = randomUUID();
  const dispatchJobId = randomUUID();
  const assignmentId = randomUUID();
  const taskId = randomUUID();
  const driverId = randomUUID();
  const vehicleId = randomUUID();
  const requestId = `pg-gate-${randomUUID()}`;
  const webhookId = `wh_${randomUUID()}`;
  const periodKey = "2099-07";
  const limit: TenantQuotaPolicyRecord["limit"] = {
    bookingCountLimit: 10,
    amountMinorLimit: 200_000,
    currency: "NTD",
    enforcementMode: "hard_block",
  };
  const quotaLedger: TenantQuotaLedgerEntry[] = [
    {
      ledgerEntryId: `reserve-booking-${randomUUID()}`,
      tenantId,
      costCenterCode: null,
      periodKey,
      dimension: "booking_count",
      amount: 1,
      entryType: "reserve",
      bookingId,
      evaluationId: randomUUID(),
      createdAt: now,
    },
    {
      ledgerEntryId: `reserve-amount-${randomUUID()}`,
      tenantId,
      costCenterCode: null,
      periodKey,
      dimension: "amount_minor",
      amount: 120_000,
      entryType: "reserve",
      bookingId,
      evaluationId: randomUUID(),
      createdAt: now,
    },
  ];
  const order: OwnedOrderRecord = {
    orderId,
    orderNo: `PG-${orderId}`,
    orderSource: "api",
    orderDomain: "owned",
    tenantId,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    passengerDisclosure: null,
    serviceBucket: "business_dispatch",
    dispatchSemantics: "reservation",
    businessDispatchSubtype: "enterprise_dispatch",
    runtimeProfileCode: "multi_taxi_direct",
    status: "on_trip",
    pickup: { address: "Taipei Main Station" },
    dropoff: { address: "Taoyuan Airport" },
    passenger: {
      passengerId: randomUUID(),
      name: "PG Gate",
      phone: "0912000000",
    },
    bookingId,
    bookingType: "oneway",
    etaSnapshot: null,
    callId: null,
    recordingId: null,
    reservationWindowStart: "2099-07-01T00:00:00.000Z",
    reservationWindowEnd: "2099-07-01T01:00:00.000Z",
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
    fixedPrice: true,
    quotedFare: { currency: "NTD", amountMinor: 120_000 },
    quotedFareSource: "platform_pricing_rule",
    quotedFareRuleVersion: "pg-gate.v1",
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
    reservationHoldStatus: "released",
    reservationHoldId: null,
    reservationHoldExpiresAt: null,
    dispatchAttemptCount: 1,
    lastDispatchFailureReason: null,
    noSupplyEscalation: null,
    dispatchTimeout: null,
    createdAt: now,
    updatedAt: now,
  };
  return {
    order,
    dispatchJob: {
      dispatchJobId,
      orderId,
      status: "assigned",
      mode: "auto",
      latestEtaMinutes: 5,
      createdAt: now,
      updatedAt: now,
    },
    assignment: {
      assignmentId,
      dispatchJobId,
      orderId,
      taskId,
      vehicleId,
      driverId,
      assignmentType: "fixed_price",
      status: "accepted",
      acceptedAt: now,
      rejectedAt: null,
      rejectReasonCode: null,
      createdAt: now,
      updatedAt: now,
    },
    task: {
      taskId,
      orderId,
      dispatchJobId,
      assignmentId,
      driverId,
      vehicleId,
      sourcePlatform: null,
      routeProvided: true,
      waypoints: [
        {
          sequence: 1,
          label: "pickup",
          address: "Taipei Main Station",
          lat: null,
          lng: null,
          arrivedAt: now,
          departedAt: now,
        },
        {
          sequence: 2,
          label: "dropoff",
          address: "Taoyuan Airport",
          lat: null,
          lng: null,
          arrivedAt: null,
          departedAt: null,
        },
      ],
      status: "on_trip",
      acceptedAt: now,
      departedAt: now,
      arrivedPickupAt: now,
      startedAt: now,
      completedAt: null,
      actualDistanceKm: null,
      actualDurationSec: null,
      fare: null,
      proof: null,
    },
    tenantId,
    bookingId,
    requestId,
    periodKey,
    quotaPolicy: {
      tenantId,
      costCenterCode: null,
      period: "monthly",
      limit,
      inheritedFromTenant: false,
      createdAt: now,
      updatedAt: now,
    },
    quotaLedger,
    quotaSnapshot: {
      tenantId,
      costCenterCode: null,
      period: "monthly",
      periodKey,
      limit,
      usage: rebuildSnapshotUsage(quotaLedger, limit),
      refreshedAt: now,
    },
    webhookEndpoint: {
      webhookId,
      tenantId,
      url: webhookUrl,
      events: ["order.completed"],
      status: "active",
      secretVersion: 1,
      secretPreview: "pg-gate",
      secretValue: "pg-gate-secret",
      retryPolicy: {
        maxAttempts: 3,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
        maxBackoffSeconds: 5,
        retryableStatusCodes: [429, 500, 502, 503, 504],
      },
      runtimeMetadata: {
        deliveryCount: 0,
        failedDeliveryCount: 0,
        lastAttemptAt: null,
        lastDeliveredAt: null,
        lastValidatedAt: null,
        nextAttemptAt: null,
        lastSignaturePreview: null,
        disabledAt: null,
        disableReason: null,
        disableReasonNote: null,
        retryPolicy: {
          maxAttempts: 3,
          initialBackoffSeconds: 1,
          backoffMultiplier: 2,
          maxBackoffSeconds: 5,
          retryableStatusCodes: [429, 500, 502, 503, 504],
        },
        secretRotation: {
          currentVersion: 1,
          rotatedAt: now,
          rotationCount: 1,
          history: [],
        },
      },
      secretHistory: [],
      createdAt: now,
      updatedAt: now,
    },
  };
}

function createHarness(
  database: DatabaseService,
  repository: OwnedMobilityRepository = new OwnedMobilityRepository(database),
  vehicleId = "unused",
): Harness {
  const auditService = new AuditNotificationService(
    new AuditLogRepository(database),
  );
  const tenantRepository = new TenantPartnerRepository(database);
  const tenantService = new TenantPartnerService(
    auditService,
    tenantRepository,
  );
  const emitter = new EventEmitter2();
  const sinks = {
    settlement: [] as unknown[],
    certificate: [] as unknown[],
    driverTask: [] as unknown[],
    opsDispatch: [] as unknown[],
  };
  emitter.on(OWNED_MOBILITY_TRIP_COMPLETED_EVENT, async (event) => {
    sinks.settlement.push(structuredClone(event));
    return true;
  });
  emitter.on(OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT, async (event) => {
    sinks.certificate.push(structuredClone(event));
    return true;
  });
  emitter.on("owned-mobility.driver-task", (event) => {
    sinks.driverTask.push(structuredClone(event));
  });
  emitter.on("ops.dispatch", (event) => {
    sinks.opsDispatch.push(structuredClone(event));
  });
  const taskEvents = new OwnedMobilityTaskEventsService(emitter, database);
  const opsEvents = new OpsDispatchEventsService(emitter, database);
  const service = new OwnedMobilityService(
    { listVehicles: () => [{ vehicleId, plateNo: "PG-0001" }] } as never,
    auditService,
    {
      registerRecordingAttachmentListener: () => undefined,
      registerRecordingStateChangeListener: () => undefined,
    } as never,
    taskEvents,
    opsEvents,
    repository,
    tenantService,
    undefined,
    undefined,
    emitter,
  );
  const harness = {
    database,
    repository,
    tenantRepository,
    tenantService,
    service,
    taskEvents,
    opsEvents,
    sinks,
  };
  databases.push(database);
  harnesses.push(harness);
  return harness;
}

async function seedDatabase(harness: Harness, seed: Seed) {
  await harness.database.query(
    `INSERT INTO core.tenants
      (tenant_id, tenant_code, tenant_name, tenant_type, status, settings)
     VALUES ($1::uuid, $2, $3, 'enterprise', 'active', '{}'::jsonb)`,
    [seed.tenantId, `pg-${seed.tenantId}`, "Stage1 PG Gate"],
  );
  await harness.repository.withTransaction(async (client) => {
    await harness.repository.persistOrderWorkflow(client, {
      orders: [seed.order],
      dispatchJobs: [seed.dispatchJob],
      dispatchAssignments: [seed.assignment],
      driverTasks: [seed.task],
    });
    // UV-EXEC-006/V0090: the deferred reservation fence checks at COMMIT
    // that every active assignment has a held/occupied reservation for its
    // driver+vehicle. Seed through the same ledger a real writer uses,
    // reserved then occupied in this transaction, instead of bypassing it.
    await harness.repository.reserveDispatchResources(client, {
      orderId: seed.order.orderId,
      assignmentId: seed.assignment.assignmentId,
      driverId: seed.assignment.driverId,
      vehicleId: seed.assignment.vehicleId,
      expiresAt: null,
    });
    await harness.repository.occupyDispatchResourceReservations(
      seed.assignment.assignmentId,
      client,
    );
  });
  await harness.tenantRepository.persistChanges({
    quotaPolicies: [seed.quotaPolicy],
    quotaLedger: seed.quotaLedger,
    quotaMonthlySnapshots: [seed.quotaSnapshot],
    webhookEndpoints: [seed.webhookEndpoint],
  });
}

async function initializeStopped(harness: Harness) {
  await harness.tenantService.onModuleInit();
  await harness.service.onModuleInit();
  await harness.taskEvents.onModuleInit();
  await harness.opsEvents.onModuleInit();
  await harness.service.onApplicationShutdown();
}

async function snapshot(
  database: DatabaseService,
  sql: string,
  values: unknown[],
) {
  const result = await database.query(sql, values);
  return JSON.parse(JSON.stringify(result.rows)) as unknown[];
}

async function cleanup(seed: Seed) {
  if (!DATABASE_URL) return;
  const database = new DatabaseService();
  try {
    await database.query(
      "DELETE FROM admin.phase1_tenant_webhook_deliveries WHERE webhook_id = $1",
      [seed.webhookEndpoint.webhookId],
    );
    await database.query(
      "DELETE FROM admin.phase1_tenant_webhook_endpoints WHERE webhook_id = $1",
      [seed.webhookEndpoint.webhookId],
    );
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL audit.allow_retention_archival = 'on'");
      await client.query(
        "DELETE FROM admin.audit_logs WHERE request_id = $1",
        [seed.requestId],
      );
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK").catch(() => {});
    } finally {
      client.release();
    }
    await database.query(
      "DELETE FROM ops.driver_completion_outbox WHERE task_id = $1",
      [seed.task.taskId],
    );
    await database.query(
      "DELETE FROM ops.phase1_dispatch_trace_logs WHERE order_id = $1",
      [seed.order.orderId],
    );
    await database.query(
      "DELETE FROM ops.phase1_driver_tasks WHERE task_id = $1",
      [seed.task.taskId],
    );
    await database.query(
      "DELETE FROM ops.dispatch_resource_reservations WHERE assignment_id = $1",
      [seed.assignment.assignmentId],
    );
    await database.query(
      "DELETE FROM ops.phase1_dispatch_assignments WHERE assignment_id = $1",
      [seed.assignment.assignmentId],
    );
    await database.query(
      "DELETE FROM ops.phase1_dispatch_jobs WHERE dispatch_job_id = $1",
      [seed.dispatchJob.dispatchJobId],
    );
    await database.query(
      "DELETE FROM ops.phase1_owned_orders WHERE order_id = $1",
      [seed.order.orderId],
    );
    await database.query(
      "DELETE FROM core.phase1_tenant_quota_monthly_snapshots WHERE tenant_id = $1",
      [seed.tenantId],
    );
    await database.query(
      "DELETE FROM core.phase1_tenant_quota_ledger WHERE tenant_id = $1",
      [seed.tenantId],
    );
    await database.query(
      "DELETE FROM core.phase1_tenant_quota_policies WHERE tenant_id = $1",
      [seed.tenantId],
    );
    await database.query(
      "DELETE FROM core.tenants WHERE tenant_id = $1::uuid",
      [seed.tenantId],
    );
  } finally {
    await database.onModuleDestroy();
  }
}

const warningHandler = (warning: Error) => {
  warningMessages.push(`${warning.name}: ${warning.message}`);
};

beforeAll(async () => {
  webhookServer = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      webhookRequests.push({
        headers: { ...request.headers },
        body: Buffer.concat(chunks).toString("utf8"),
      });
      response.writeHead(204);
      response.end();
    });
  });
  await new Promise<void>((resolve) =>
    webhookServer.listen(0, "127.0.0.1", resolve),
  );
  const address = webhookServer.address() as AddressInfo;
  webhookUrl = `http://127.0.0.1:${address.port}/stage1-pg-gate`;
});

beforeEach(() => {
  webhookRequests = [];
  warningMessages = [];
  process.on("warning", warningHandler);
});

afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    await harness.service.onApplicationShutdown();
    await harness.taskEvents.onModuleDestroy();
    await harness.opsEvents.onModuleDestroy();
    harness.tenantService.onModuleDestroy();
  }
  for (const seed of seeds.splice(0)) await cleanup(seed);
  for (const database of databases.splice(0)) await database.onModuleDestroy();
  process.off("warning", warningHandler);
  expect(
    warningMessages.filter((message) =>
      message.includes("client.query() when the client is already executing"),
    ),
  ).toEqual([]);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    webhookServer.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("Stage1 UAT PostgreSQL gate", () => {
  it("requires a migrated real PostgreSQL", async () => {
    expect(
      DATABASE_URL,
      "DATABASE_URL is mandatory for the Stage1 PostgreSQL gate",
    ).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const result = await database.query<{
      server_version: string;
      outbox: string | null;
    }>(
      "SELECT current_setting('server_version') AS server_version, to_regclass('ops.driver_completion_outbox')::text AS outbox",
    );
    expect(result.rows[0]?.server_version).toMatch(/^16\./);
    expect(result.rows[0]?.outbox).toBe("ops.driver_completion_outbox");
  });

  it("serializes two pools and makes workflow, quota and all six intents exactly once on replay", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const seed = createSeed();
    seeds.push(seed);
    const harnessA = createHarness(
      new DatabaseService(),
      undefined,
      seed.task.vehicleId,
    );
    const harnessB = createHarness(
      new DatabaseService(),
      undefined,
      seed.task.vehicleId,
    );
    await seedDatabase(harnessA, seed);
    await Promise.all([
      initializeStopped(harnessA),
      initializeStopped(harnessB),
    ]);

    const command: DriverCompleteTaskCommand = {
      completedAt: new Date().toISOString(),
      actualDistanceKm: 42.5,
      actualDurationSec: 3600,
      fare: { currency: "NTD", amountMinor: 120_000 },
      proof: { photos: [], expenseItems: [] },
    };
    const results = await Promise.all([
      harnessA.service.completeDriverTask(
        seed.task.taskId,
        command,
        seed.requestId,
      ),
      harnessB.service.completeDriverTask(
        seed.task.taskId,
        command,
        seed.requestId,
      ),
    ]);
    expect(results.map((item) => item.status)).toEqual([
      "completed",
      "completed",
    ]);

    const workflowBefore = await snapshot(
      harnessA.database,
      `SELECT o.record AS order, a.record AS assignment, t.record AS task
       FROM ops.phase1_owned_orders o
       JOIN ops.phase1_dispatch_assignments a ON a.order_id = o.order_id
       JOIN ops.phase1_driver_tasks t ON t.task_id = a.task_id
       WHERE o.order_id = $1`,
      [seed.order.orderId],
    );
    const quotaBefore = await snapshot(
      harnessA.database,
      "SELECT * FROM core.phase1_tenant_quota_ledger WHERE tenant_id = $1 ORDER BY dimension, entry_type, ledger_entry_id",
      [seed.tenantId],
    );
    const outboxBefore = await snapshot(
      harnessA.database,
      "SELECT * FROM ops.driver_completion_outbox WHERE task_id = $1 ORDER BY effect_type",
      [seed.task.taskId],
    );
    const completedWorkflow = workflowBefore[0] as {
      order: OwnedOrderRecord;
      assignment: DispatchAssignmentRecord;
      task: DriverTaskRecord;
    };
    expect(completedWorkflow.order.status).toBe("completed");
    expect(completedWorkflow.assignment.status).toBe("completed");
    expect(completedWorkflow.task.status).toBe("completed");
    expect(
      quotaBefore
        .filter(
          (row) => (row as { entry_type: string }).entry_type === "consume",
        )
        .map((row) => (row as { dimension: string }).dimension)
        .sort(),
    ).toEqual(["amount_minor", "booking_count"]);
    expect(outboxBefore).toHaveLength(6);
    expect(
      outboxBefore
        .map((row) => (row as { effect_type: string }).effect_type)
        .sort(),
    ).toEqual([...EFFECT_TYPES].sort());
    expect(
      outboxBefore.map(
        (row) => (row as { outbox_id: string; effect_type: string }).outbox_id,
      ),
    ).toEqual(
      outboxBefore.map((row) =>
        buildOutboxId(
          seed.task.taskId,
          (row as { effect_type: string }).effect_type,
        ),
      ),
    );

    await expect(
      harnessB.service.completeDriverTask(
        seed.task.taskId,
        command,
        seed.requestId,
      ),
    ).resolves.toMatchObject({ status: "completed" });
    expect(
      await snapshot(
        harnessA.database,
        "SELECT * FROM core.phase1_tenant_quota_ledger WHERE tenant_id = $1 ORDER BY dimension, entry_type, ledger_entry_id",
        [seed.tenantId],
      ),
    ).toEqual(quotaBefore);
    expect(
      await snapshot(
        harnessA.database,
        "SELECT * FROM ops.driver_completion_outbox WHERE task_id = $1 ORDER BY effect_type",
        [seed.task.taskId],
      ),
    ).toEqual(outboxBefore);
    expect(
      await snapshot(
        harnessA.database,
        `SELECT o.record AS order, a.record AS assignment, t.record AS task FROM ops.phase1_owned_orders o JOIN ops.phase1_dispatch_assignments a ON a.order_id = o.order_id JOIN ops.phase1_driver_tasks t ON t.task_id = a.task_id WHERE o.order_id = $1`,
        [seed.order.orderId],
      ),
    ).toEqual(workflowBefore);

    expect(webhookRequests).toHaveLength(0);
    for (const harness of [harnessA, harnessB]) {
      expect(harness.sinks).toEqual({
        settlement: [],
        certificate: [],
        driverTask: [],
        opsDispatch: [],
      });
    }
    expect(
      (
        await harnessA.database.query(
          "SELECT 1 FROM admin.audit_logs WHERE request_id = $1",
          [seed.requestId],
        )
      ).rowCount,
    ).toBe(0);

    const harnessRestart = createHarness(
      new DatabaseService(),
      undefined,
      seed.task.vehicleId,
    );
    await initializeStopped(harnessRestart);
    await expect(
      harnessRestart.service.completeDriverTask(
        seed.task.taskId,
        command,
        seed.requestId,
      ),
    ).resolves.toMatchObject({ status: "completed" });
    expect(
      await snapshot(
        harnessA.database,
        "SELECT * FROM ops.driver_completion_outbox WHERE task_id = $1 ORDER BY effect_type",
        [seed.task.taskId],
      ),
    ).toEqual(outboxBefore);
    expect(webhookRequests).toHaveLength(0);
    expect(harnessRestart.sinks).toEqual({
      settlement: [],
      certificate: [],
      driverTask: [],
      opsDispatch: [],
    });

    const crashedLease = randomUUID();
    const firstClaim =
      await harnessA.repository.claimNextRecoverableDriverCompletionOutbox(
        harnessA.database,
        crashedLease,
        new Date(Date.now() + 60_000).toISOString(),
        new Date().toISOString(),
        5,
      );
    expect(firstClaim?.action).toBe("dispatch");
    expect(firstClaim?.record.attemptCount).toBe(1);
    const crashedOutboxId = firstClaim!.record.outboxId;
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    await harnessA.database.query(
      `UPDATE ops.driver_completion_outbox
       SET leased_until = $1::timestamptz, next_attempt_at = $1::timestamptz
       WHERE outbox_id = $2`,
      [expiredAt, crashedOutboxId],
    );

    const recoveredLease = randomUUID();
    const recoveredClaim =
      await harnessRestart.repository.claimNextRecoverableDriverCompletionOutbox(
        harnessRestart.database,
        recoveredLease,
        new Date(Date.now() + 60_000).toISOString(),
        new Date().toISOString(),
        5,
      );
    expect(recoveredClaim?.action).toBe("dispatch");
    expect(recoveredClaim?.record.outboxId).toBe(crashedOutboxId);
    expect(recoveredClaim?.record.attemptCount).toBe(2);
    expect(
      await harnessRestart.repository.releaseDriverCompletionOutbox(
        harnessRestart.database,
        crashedOutboxId,
        recoveredLease,
        new Date(Date.now() - 1_000).toISOString(),
        5,
        "PG gate simulated worker crash",
      ),
    ).toBe(true);

    await harnessRestart.service.onApplicationBootstrap();
    await waitFor(async () => {
      const result = await harnessA.database.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM ops.driver_completion_outbox
         WHERE task_id = $1 AND status = 'delivered'`,
        [seed.task.taskId],
      );
      return result.rows[0]?.count === 6;
    }, "all six outbox rows to be delivered");
    await waitFor(
      () =>
        webhookRequests.length === 1 &&
        harnessRestart.sinks.settlement.length === 1 &&
        harnessRestart.sinks.certificate.length === 1 &&
        harnessRestart.sinks.driverTask.length === 1 &&
        harnessRestart.sinks.opsDispatch.length === 1,
      "all real completion sinks",
    );
    expect(
      webhookRequests[0]?.headers["x-drts-webhook-delivery-id"],
    ).toBeTruthy();
    expect(JSON.parse(webhookRequests[0]!.body)).toMatchObject({
      event: "order.completed",
    });
    expect(
      (
        await harnessA.database.query(
          "SELECT 1 FROM admin.phase1_tenant_webhook_deliveries WHERE webhook_id = $1",
          [seed.webhookEndpoint.webhookId],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await harnessA.database.query(
          "SELECT 1 FROM admin.audit_logs WHERE request_id = $1",
          [seed.requestId],
        )
      ).rowCount,
    ).toBe(4);

    const deliveredOutbox = await snapshot(
      harnessA.database,
      "SELECT * FROM ops.driver_completion_outbox WHERE task_id = $1 ORDER BY effect_type",
      [seed.task.taskId],
    );
    const driverTaskPayload = (
      deliveredOutbox.find(
        (row) =>
          (row as { effect_type: string }).effect_type ===
          "driver_task_updated",
      ) as { payload: { eventId: string; correlationId: string } }
    ).payload;
    const opsDispatchPayload = (
      deliveredOutbox.find(
        (row) =>
          (row as { effect_type: string }).effect_type ===
          "ops_dispatch_job_updated",
      ) as { payload: { eventId: string; correlationId: string } }
    ).payload;
    expect(
      harnessRestart.sinks.driverTask[0] as {
        eventId: string;
        correlationId: string;
      },
    ).toMatchObject({
      eventId: driverTaskPayload.eventId,
      correlationId: driverTaskPayload.correlationId,
    });
    expect(
      harnessRestart.sinks.opsDispatch[0] as {
        eventId: string;
        correlationId: string;
      },
    ).toMatchObject({
      eventId: opsDispatchPayload.eventId,
      correlationId: opsDispatchPayload.correlationId,
    });
    const webhookDelivery = await harnessA.database.query<{
      delivery_id: string;
    }>(
      "SELECT delivery_id FROM admin.phase1_tenant_webhook_deliveries WHERE webhook_id = $1",
      [seed.webhookEndpoint.webhookId],
    );
    expect(webhookRequests[0]?.headers["x-drts-webhook-delivery-id"]).toBe(
      webhookDelivery.rows[0]?.delivery_id,
    );
    const auditBeforeFinalReplay = await snapshot(
      harnessA.database,
      "SELECT * FROM admin.audit_logs WHERE request_id = $1 ORDER BY audit_id",
      [seed.requestId],
    );
    const webhookBeforeFinalReplay = await snapshot(
      harnessA.database,
      "SELECT * FROM admin.phase1_tenant_webhook_deliveries WHERE webhook_id = $1 ORDER BY delivery_id",
      [seed.webhookEndpoint.webhookId],
    );
    const sinkCounts = {
      http: webhookRequests.length,
      settlement: harnessRestart.sinks.settlement.length,
      certificate: harnessRestart.sinks.certificate.length,
      driverTask: harnessRestart.sinks.driverTask.length,
      opsDispatch: harnessRestart.sinks.opsDispatch.length,
    };
    await expect(
      harnessRestart.service.completeDriverTask(
        seed.task.taskId,
        command,
        seed.requestId,
      ),
    ).resolves.toMatchObject({ status: "completed" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(
      await snapshot(
        harnessA.database,
        "SELECT * FROM ops.driver_completion_outbox WHERE task_id = $1 ORDER BY effect_type",
        [seed.task.taskId],
      ),
    ).toEqual(deliveredOutbox);
    expect(
      await snapshot(
        harnessA.database,
        "SELECT * FROM admin.audit_logs WHERE request_id = $1 ORDER BY audit_id",
        [seed.requestId],
      ),
    ).toEqual(auditBeforeFinalReplay);
    expect(
      await snapshot(
        harnessA.database,
        "SELECT * FROM admin.phase1_tenant_webhook_deliveries WHERE webhook_id = $1 ORDER BY delivery_id",
        [seed.webhookEndpoint.webhookId],
      ),
    ).toEqual(webhookBeforeFinalReplay);
    expect({
      http: webhookRequests.length,
      settlement: harnessRestart.sinks.settlement.length,
      certificate: harnessRestart.sinks.certificate.length,
      driverTask: harnessRestart.sinks.driverTask.length,
      opsDispatch: harnessRestart.sinks.opsDispatch.length,
    }).toEqual(sinkCounts);

    await expect(
      harnessA.database.query(
        `INSERT INTO ops.driver_completion_outbox
          (outbox_id, task_id, order_id, effect_type, payload, status, attempt_count, next_attempt_at, created_at)
         VALUES ($1, $2, $3, 'not_a_stage1_effect', '{}'::jsonb, 'pending', 0, now(), now())`,
        [randomUUID(), seed.task.taskId, seed.order.orderId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  }, 15_000);

  it("rolls back workflow, quota and outbox when the real transaction fails after outbox writes", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const seed = createSeed();
    seeds.push(seed);
    const database = new DatabaseService();
    const harness = createHarness(
      database,
      new FailAfterOutboxRepository(database),
      seed.task.vehicleId,
    );
    await seedDatabase(harness, seed);
    await initializeStopped(harness);
    const workflowBefore = await snapshot(
      database,
      `SELECT o.record AS order, a.record AS assignment, t.record AS task FROM ops.phase1_owned_orders o JOIN ops.phase1_dispatch_assignments a ON a.order_id = o.order_id JOIN ops.phase1_driver_tasks t ON t.task_id = a.task_id WHERE o.order_id = $1`,
      [seed.order.orderId],
    );
    const quotaBefore = await snapshot(
      database,
      "SELECT * FROM core.phase1_tenant_quota_ledger WHERE tenant_id = $1 ORDER BY ledger_entry_id",
      [seed.tenantId],
    );
    const quotaSnapshotBefore = await snapshot(
      database,
      "SELECT * FROM core.phase1_tenant_quota_monthly_snapshots WHERE tenant_id = $1 ORDER BY period_key",
      [seed.tenantId],
    );

    await expect(
      harness.service.completeDriverTask(
        seed.task.taskId,
        {
          completedAt: new Date().toISOString(),
          actualDistanceKm: 42.5,
          actualDurationSec: 3600,
          fare: { currency: "NTD", amountMinor: 120_000 },
          proof: { photos: [], expenseItems: [] },
        },
        seed.requestId,
      ),
    ).rejects.toThrow("PG_GATE_INJECTED_AFTER_OUTBOX");

    expect(
      await snapshot(
        database,
        `SELECT o.record AS order, a.record AS assignment, t.record AS task FROM ops.phase1_owned_orders o JOIN ops.phase1_dispatch_assignments a ON a.order_id = o.order_id JOIN ops.phase1_driver_tasks t ON t.task_id = a.task_id WHERE o.order_id = $1`,
        [seed.order.orderId],
      ),
    ).toEqual(workflowBefore);
    expect(
      await snapshot(
        database,
        "SELECT * FROM core.phase1_tenant_quota_ledger WHERE tenant_id = $1 ORDER BY ledger_entry_id",
        [seed.tenantId],
      ),
    ).toEqual(quotaBefore);
    expect(
      await snapshot(
        database,
        "SELECT * FROM core.phase1_tenant_quota_monthly_snapshots WHERE tenant_id = $1 ORDER BY period_key",
        [seed.tenantId],
      ),
    ).toEqual(quotaSnapshotBefore);
    expect(
      (
        await database.query(
          "SELECT 1 FROM ops.driver_completion_outbox WHERE task_id = $1",
          [seed.task.taskId],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await database.query(
          "SELECT 1 FROM ops.phase1_dispatch_trace_logs WHERE order_id = $1",
          [seed.order.orderId],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await database.query(
          "SELECT 1 FROM admin.audit_logs WHERE request_id = $1",
          [seed.requestId],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await database.query(
          "SELECT 1 FROM admin.phase1_tenant_webhook_deliveries WHERE webhook_id = $1",
          [seed.webhookEndpoint.webhookId],
        )
      ).rowCount,
    ).toBe(0);
    expect(webhookRequests).toHaveLength(0);
    expect(harness.sinks).toEqual({
      settlement: [],
      certificate: [],
      driverTask: [],
      opsDispatch: [],
    });
  });
});
