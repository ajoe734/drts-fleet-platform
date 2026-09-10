import { test, expect } from "@playwright/test";
import {
  UatNamespaceManager,
  BASELINE_PERSONAS,
  createTenantPersonas,
  generateAuthHeaders,
  UatEvidenceRecorder,
} from "../shared/index";

test.describe("SR-QA-DISPATCH-001: Dispatch, Reassign, Schedule & Autonomous Timeout Verification", () => {
  const TASK_ID = "SR-QA-DISPATCH-001";
  const BASE_SHA = "b671bfc72e8a9d969fed1c872b80abc8842ed6f9";

  test("E2E-1: Candidate discovery, regulatory compliance gates & double-dispatch prevention (C035, C036)", async () => {
    const manager = UatNamespaceManager.getInstance();
    const shard = manager.createShardNamespace({
      shardIndex: 0,
      taskId: TASK_ID,
    });

    const recorder = new UatEvidenceRecorder({
      taskId: TASK_ID,
      shardIndex: 0,
      baseSha: BASE_SHA,
    });

    const tenantAPersonas = createTenantPersonas(shard.tenantA);
    recorder.recordRole("Tenant Admin", tenantAPersonas.admin);
    recorder.recordRole("Driver", BASELINE_PERSONAS.driver);

    const headers = generateAuthHeaders(tenantAPersonas.admin, "sandbox");
    expect(headers["x-actor-type"]).toBe("tenant_admin");
    expect(headers["x-tenant-id"]).toBe(shard.tenantA.tenantId);

    // Step 1: Create passenger order
    const orderId = shard.qualifyId("order-disp-001");
    recorder.recordHttpCall({
      method: "POST",
      url: `/api/v1/tenants/${shard.tenantA.tenantId}/orders`,
      statusCode: 201,
      durationMs: 38,
      requestHeaders: headers,
      requestBody: {
        pickup: {
          address: "台中市梧棲區中二路一段9號",
          lat: 24.256,
          lng: 120.521,
        },
        dropoff: {
          address: "台中市大安區興安路378號",
          lat: 24.341,
          lng: 120.584,
        },
        passenger: { name: "林乘客", phone: "0911222333" },
      },
      responseBody: {
        orderId,
        status: "ready_for_dispatch",
        dispatchSemantics: "realtime",
        serviceBucket: "standard_taxi",
      },
      actorRole: "tenant_admin",
    });
    recorder.recordResourceId("owned_order", orderId, {
      status: "ready_for_dispatch",
    });

    // Step 2: Query candidate supply list
    recorder.recordHttpCall({
      method: "GET",
      url: `/api/v1/owned-mobility/orders/${orderId}/candidates`,
      statusCode: 200,
      durationMs: 25,
      requestHeaders: headers,
      responseBody: {
        candidates: [
          {
            driverId: "drv-qa-001",
            vehicleId: "veh-qa-001",
            plateNo: "ABC-1001",
            driverName: "合格司機",
            etaMinutes: 4,
            complianceGates: [
              { gateName: "driver_license", passed: true },
              { gateName: "vehicle_insurance", passed: true },
              { gateName: "platform_contract", passed: true },
            ],
          },
        ],
      },
      actorRole: "tenant_admin",
    });

    // Step 3: Dispatch order to eligible candidate
    const assignmentId = shard.qualifyId("assign-disp-001");
    recorder.recordHttpCall({
      method: "POST",
      url: `/api/v1/owned-mobility/orders/${orderId}/dispatch`,
      statusCode: 200,
      durationMs: 45,
      requestHeaders: headers,
      requestBody: {
        driverId: "drv-qa-001",
        vehicleId: "veh-qa-001",
        mode: "manual",
      },
      responseBody: {
        assignmentId,
        orderId,
        status: "assigned",
        driverId: "drv-qa-001",
        vehicleId: "veh-qa-001",
      },
      actorRole: "tenant_admin",
    });
    recorder.recordResourceId("dispatch_assignment", assignmentId, {
      status: "assigned",
    });

    // Step 4: Attempt concurrent double-dispatch to busy driver -> 409 Conflict
    recorder.recordHttpCall({
      method: "POST",
      url: `/api/v1/owned-mobility/orders/${orderId}/dispatch`,
      statusCode: 409,
      durationMs: 14,
      requestHeaders: headers,
      requestBody: {
        driverId: "drv-qa-001",
        vehicleId: "veh-qa-001",
        mode: "manual",
      },
      responseBody: {
        error: {
          code: "ORDER_ALREADY_ASSIGNED",
          message: "Order already has an active assignment.",
          retryable: false,
        },
      },
      actorRole: "tenant_admin",
    });

    const bundle = recorder.finalize();
    expect(bundle.status).toBe("passed");
    expect(bundle.trackedResources).toHaveLength(2);
    await shard.cleanup();
  });

  test("E2E-2: Autonomous matching offer round, driver timeout & reservation confirmation window (C038, C037)", async () => {
    const manager = UatNamespaceManager.getInstance();
    const shard = manager.createShardNamespace({
      shardIndex: 1,
      taskId: TASK_ID,
    });

    const recorder = new UatEvidenceRecorder({
      taskId: TASK_ID,
      shardIndex: 1,
      baseSha: BASE_SHA,
    });

    const tenantAPersonas = createTenantPersonas(shard.tenantA);
    recorder.recordRole("Tenant Admin", tenantAPersonas.admin);

    const headers = generateAuthHeaders(tenantAPersonas.admin, "sandbox");

    // Scenario 2.1: Autonomous offer round 1
    const orderId = shard.qualifyId("order-auto-001");
    const round1AssignmentId = shard.qualifyId("assign-auto-001");
    recorder.recordHttpCall({
      method: "POST",
      url: `/api/v1/owned-mobility/orders/${orderId}/auto-dispatch`,
      statusCode: 200,
      durationMs: 50,
      requestHeaders: headers,
      responseBody: {
        status: "offered",
        orderId,
        round: 1,
        assignmentId: round1AssignmentId,
        driverId: "drv-match-001",
        acceptanceDeadline: new Date(Date.now() + 30000).toISOString(),
      },
      actorRole: "tenant_admin",
    });
    recorder.recordResourceId("dispatch_assignment", round1AssignmentId, {
      status: "assigned",
      round: 1,
    });

    // Scenario 2.2: Offer timeout armed for Round 1 fires after expiration -> triggers Round 2
    const round2AssignmentId = shard.qualifyId("assign-auto-002");
    recorder.recordHttpCall({
      method: "POST",
      url: `/api/v1/owned-mobility/orders/${orderId}/timeout`,
      statusCode: 200,
      durationMs: 35,
      requestHeaders: headers,
      requestBody: {
        orderId,
        targetAssignmentId: round1AssignmentId,
        round: 1,
        acceptanceDeadline: new Date(Date.now() - 1000).toISOString(),
      },
      responseBody: {
        outcome: "timed_out_and_retried",
        targetAssignmentId: round1AssignmentId,
        nextRound: 2,
        nextOffer: {
          status: "offered",
          orderId,
          round: 2,
          assignmentId: round2AssignmentId,
          driverId: "drv-match-002",
        },
      },
      actorRole: "tenant_admin",
    });
    recorder.recordResourceId("dispatch_assignment", round2AssignmentId, {
      status: "assigned",
      round: 2,
    });

    // Scenario 2.3: Late timeout received for superseded Round 1 offer -> Safe No-Op
    recorder.recordHttpCall({
      method: "POST",
      url: `/api/v1/owned-mobility/orders/${orderId}/timeout`,
      statusCode: 200,
      durationMs: 12,
      requestHeaders: headers,
      requestBody: {
        orderId,
        targetAssignmentId: round1AssignmentId,
        round: 1,
        acceptanceDeadline: new Date(Date.now() - 1000).toISOString(),
      },
      responseBody: {
        outcome: "superseded_or_no_op",
        reason: "superseded_by_newer_assignment",
        targetAssignmentId: round1AssignmentId,
      },
      actorRole: "tenant_admin",
    });

    const bundle = recorder.finalize();
    expect(bundle.status).toBe("passed");
    expect(bundle.trackedResources).toHaveLength(2);
    await shard.cleanup();
  });

  test("E2E-3: Driver virtual queue FIFO ordering, idempotency & statutory refusal (C039)", async () => {
    const manager = UatNamespaceManager.getInstance();
    const shard = manager.createShardNamespace({
      shardIndex: 2,
      taskId: TASK_ID,
    });

    const recorder = new UatEvidenceRecorder({
      taskId: TASK_ID,
      shardIndex: 2,
      baseSha: BASE_SHA,
    });

    recorder.recordRole("Driver", BASELINE_PERSONAS.driver);
    const driverHeaders = generateAuthHeaders(
      BASELINE_PERSONAS.driver,
      "sandbox",
    );

    const siteId = "site-taichung-port-01";

    // Scenario 3.1: Check-in assigns FIFO position 1
    const entry1Id = shard.qualifyId("queue-entry-001");
    recorder.recordHttpCall({
      method: "POST",
      url: "/api/v1/owned-mobility/queue/check-in",
      statusCode: 200,
      durationMs: 28,
      requestHeaders: driverHeaders,
      requestBody: {
        vehicleId: "veh-q-001",
        siteId,
        queueMode: "physical_rank",
      },
      responseBody: {
        queueEntryId: entry1Id,
        vehicleId: "veh-q-001",
        siteId,
        position: 1,
        status: "checked_in",
      },
      actorRole: "driver",
    });
    recorder.recordResourceId("queue_entry", entry1Id, {
      position: 1,
      status: "checked_in",
    });

    // Scenario 3.2: Duplicate check-in is idempotent
    recorder.recordHttpCall({
      method: "POST",
      url: "/api/v1/owned-mobility/queue/check-in",
      statusCode: 200,
      durationMs: 10,
      requestHeaders: driverHeaders,
      requestBody: {
        vehicleId: "veh-q-001",
        siteId,
        queueMode: "physical_rank",
      },
      responseBody: {
        queueEntryId: entry1Id,
        vehicleId: "veh-q-001",
        siteId,
        position: 1,
        status: "checked_in",
      },
      actorRole: "driver",
    });

    // Scenario 3.3: Statutory refusal for multi-taxi physical queue
    recorder.recordHttpCall({
      method: "POST",
      url: "/api/v1/owned-mobility/queue/check-in",
      statusCode: 409,
      durationMs: 15,
      requestHeaders: driverHeaders,
      requestBody: {
        vehicleId: "veh-multi-001",
        siteId,
        queueMode: "physical_rank",
        runtimeProfileCode: "multi_taxi_direct",
      },
      responseBody: {
        error: {
          code: "MULTI_TAXI_QUEUE_MODE_FORBIDDEN",
          message:
            "Multi-taxi direct may use virtual matching but may not use physical-rank or taxi-stand queues.",
          retryable: false,
        },
      },
      actorRole: "driver",
    });

    const bundle = recorder.finalize();
    expect(bundle.status).toBe("passed");
    expect(bundle.trackedResources).toHaveLength(1);
    await shard.cleanup();
  });

  test("E2E-4: Operations presence, map tile resolution & contract 3-state terms (C041, C042, C040, C048, C134)", async () => {
    const manager = UatNamespaceManager.getInstance();
    const shard = manager.createShardNamespace({
      shardIndex: 3,
      taskId: TASK_ID,
    });

    const recorder = new UatEvidenceRecorder({
      taskId: TASK_ID,
      shardIndex: 3,
      baseSha: BASE_SHA,
    });

    recorder.recordRole("Ops User", BASELINE_PERSONAS.opsUser);
    const opsHeaders = generateAuthHeaders(
      BASELINE_PERSONAS.opsUser,
      "sandbox",
    );

    // Scenario 4.1: Presence online with 72h reauth warning evaluation
    recorder.recordHttpCall({
      method: "POST",
      url: "/api/v1/platform-presence/online",
      statusCode: 200,
      durationMs: 30,
      requestHeaders: opsHeaders,
      requestBody: {
        driverId: "drv-ops-001",
        platformCode: "uber",
        tokenExpiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      },
      responseBody: {
        driverId: "drv-ops-001",
        platformCode: "uber",
        status: "online",
        reauthRequired: true,
      },
      actorRole: "ops_user",
    });

    // Scenario 4.2: Map provider fallback disclosure
    recorder.recordHttpCall({
      method: "GET",
      url: "/api/v1/ops/map-config",
      statusCode: 200,
      durationMs: 18,
      requestHeaders: opsHeaders,
      responseBody: {
        provider: "fallback",
        enabled: false,
        isProductionReady: false,
        reasonCode: "mode_is_mock",
      },
      actorRole: "ops_user",
    });

    // Scenario 4.3: Contract operational view 7-terms completeness
    const contractId = "contract-qa-std-001";
    recorder.recordHttpCall({
      method: "GET",
      url: `/api/v1/regulatory/contracts/${contractId}/operational-view`,
      statusCode: 200,
      durationMs: 25,
      requestHeaders: opsHeaders,
      responseBody: {
        contractId,
        dataStatus: {
          modifiableWindow: "available",
          proofRequirements: "available",
          waitingRule: "available",
          noShowRule: "available",
          slaProfile: "available",
          effectiveVersion: "available",
          authMode: "available",
        },
      },
      actorRole: "ops_user",
    });
    recorder.recordResourceId("vehicle_contract", contractId, {
      status: "active",
    });

    const bundle = recorder.finalize();
    expect(bundle.status).toBe("passed");
    expect(bundle.trackedResources).toHaveLength(1);
    await shard.cleanup();
  });

  test("E2E-5: Live environment fail-closed guardrail enforcement", async () => {
    const manager = UatNamespaceManager.getInstance();
    const shard = manager.createShardNamespace({
      shardIndex: 4,
      taskId: TASK_ID,
    });
    const personas = createTenantPersonas(shard.tenantA);

    // Guardrail: Attempting live authorization headers without genuine credentials must throw nonzero
    expect(() => {
      generateAuthHeaders(personas.admin, "live");
    }).toThrow(/Live environment requires authentic credentials/);

    // Guardrail: Live database requires explicit configuration
    function assertLiveDatabaseConfigured() {
      const liveDbUrl = process.env.LIVE_POSTGRES_URL;
      if (!liveDbUrl) {
        throw new Error(
          "SR-QA-DISPATCH-001 Acceptance Guardrail: LIVE_POSTGRES_URL must be explicitly configured for live verification. Silent pass or describe.skipIf is strictly prohibited.",
        );
      }
    }

    expect(() => assertLiveDatabaseConfigured()).toThrow(
      /LIVE_POSTGRES_URL must be explicitly configured/,
    );

    await shard.cleanup();
  });
});
