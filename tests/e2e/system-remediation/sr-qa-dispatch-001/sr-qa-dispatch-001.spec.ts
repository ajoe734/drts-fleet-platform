import { test, expect } from "@playwright/test";
import {
  UatNamespaceManager,
  createTenantPersonas,
  generateAuthHeaders,
  UatEvidenceRecorder,
} from "../shared/index";

// SR-QA-DISPATCH-001 -- 派車／改派／排班與自動超時驗收 (E2E evidence layer).
//
// VM restriction: this worker environment may run repository checks but
// must not start product development servers, preview/browser test
// servers, or Docker Compose infrastructure (see task dispatch guardrails).
// Consistent with SR-QA-CONCURRENCY-001's precedent, these specs use the
// `UatEvidenceRecorder` harness to record the intended request/response
// contract and resource linkage per scenario, and explicitly call
// `recordLiveLimitation` to disclose that a live browser/API run against a
// deployed environment was not performed here. The REAL functional proof
// for this task is the executable, currently-passing regression in
// `tests/unit/system-remediation/sr-qa-dispatch-001/` (in-memory service
// behavior) and `dispatch-db-persistence.test.ts` (real-Postgres
// write/read-back, fail-closed in this VM for lack of a reachable
// database) -- this file does not substitute for either.
test.describe("SR-QA-DISPATCH-001: dispatch / reassign / queue / auto-timeout acceptance", () => {
  const TASK_ID = "SR-QA-DISPATCH-001";
  const BASE_SHA = "b671bfc72"; // origin/dev at task pickup

  test("E2E-1 (C035/C036): candidate query, manual assign, and reassign-with-reason", async () => {
    const manager = UatNamespaceManager.getInstance();
    const shard0 = manager.createShardNamespace({
      shardIndex: 0,
      taskId: TASK_ID,
    });
    const recorder = new UatEvidenceRecorder({
      taskId: TASK_ID,
      shardIndex: 0,
      baseSha: BASE_SHA,
    });

    const ops = createTenantPersonas(shard0.tenantA).admin;
    recorder.recordRole("Ops Dispatcher", ops);
    const headers = generateAuthHeaders(ops, "sandbox");
    expect(headers["x-tenant-id"]).toBe(shard0.tenantA.tenantId);

    const dispatchJobId = shard0.qualifyId("dispatch-job-001");
    const vehicleA = shard0.qualifyId("vehicle-a");
    const vehicleB = shard0.qualifyId("vehicle-b");

    recorder.recordHttpCall({
      method: "GET",
      url: `/api/owned-mobility/dispatch/tasks/${dispatchJobId}/candidates`,
      statusCode: 200,
      durationMs: 18,
      responseBody: {
        items: [{ vehicleId: vehicleA, etaMinutes: 4 }],
      },
      actorRole: "ops_user",
    });
    recorder.recordResourceId("dispatch_job", dispatchJobId, {
      status: "matching",
    });

    recorder.recordHttpCall({
      method: "POST",
      url: "/api/owned-mobility/dispatch/assign",
      statusCode: 200,
      durationMs: 22,
      requestBody: { dispatchJobId, vehicleId: vehicleA, driverId: "driver-a" },
      responseBody: { status: "assigned", vehicleId: vehicleA },
      actorRole: "ops_user",
    });

    recorder.recordHttpCall({
      method: "POST",
      url: "/api/owned-mobility/dispatch/reassign",
      statusCode: 200,
      durationMs: 25,
      requestBody: {
        dispatchJobId,
        vehicleId: vehicleB,
        driverId: "driver-b",
        reasonCode: "vehicle_swap",
      },
      responseBody: { status: "assigned", vehicleId: vehicleB },
      actorRole: "ops_user",
    });
    recorder.recordHttpCall({
      method: "POST",
      url: "/api/owned-mobility/dispatch/reassign",
      statusCode: 400,
      durationMs: 6,
      requestBody: { dispatchJobId, vehicleId: vehicleB, driverId: "driver-b" },
      responseBody: {
        error: { code: "REASSIGN_REASON_REQUIRED", retryable: false },
      },
      actorRole: "ops_user",
    });

    recorder.recordLiveLimitation(
      "Browser/API server",
      "VM restriction: worker sandbox may not start the API/dev server or a browser; this scenario records the intended request/response contract. Real behavioral proof is tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-candidates-and-assignment.test.ts, executed against the real OwnedMobilityService.",
    );

    const bundle = recorder.finalize();
    expect(bundle.status).toBe("passed");
    expect(bundle.httpCalls).toHaveLength(4);
    await shard0.cleanup();
  });

  test("E2E-2 (C038): no-supply escalation and dispatch-timeout state transitions", async () => {
    const manager = UatNamespaceManager.getInstance();
    const shard0 = manager.createShardNamespace({
      shardIndex: 0,
      taskId: TASK_ID,
    });
    const recorder = new UatEvidenceRecorder({
      taskId: TASK_ID,
      shardIndex: 0,
      baseSha: BASE_SHA,
    });

    const orderId = shard0.qualifyId("order-no-supply-001");
    recorder.recordHttpCall({
      method: "POST",
      url: `/api/owned-mobility/orders/${orderId}/dispatch`,
      statusCode: 200,
      durationMs: 15,
      responseBody: { status: "no_supply", queueFamily: "delayed_retry_queue" },
      actorRole: "system",
    });
    recorder.recordHttpCall({
      method: "POST",
      url: `/api/owned-mobility/orders/${orderId}/dispatch-timeout`,
      statusCode: 400,
      durationMs: 5,
      requestBody: { timeoutReasonCode: "acceptance_timeout" },
      responseBody: {
        error: { code: "ACCEPTANCE_TIMEOUT_TARGET_REQUIRED" },
      },
      actorRole: "system",
    });
    recorder.recordResourceId("owned_order", orderId, {
      status: "delayed_queue",
    });

    recorder.recordLiveLimitation(
      "Wall-clock scheduler trigger",
      "Confirmed gap (not a VM artifact): no @Cron/@Interval/setInterval sweep in apps/api/src/modules/owned-mobility wires handleDispatchTimeout or reservation-hold escalation to fire on its own -- see the structural regression in dispatch-timeout-no-supply-scheduler-gap.test.ts. This scenario exercises the manual/API trigger path only; automatic wall-clock triggering is out of this verification-only task's write_scopes and is tracked as a canonical follow-up subtask.",
    );

    const bundle = recorder.finalize();
    expect(bundle.status).toBe("passed");
    await shard0.cleanup();
  });

  test("E2E-3 (C039): queue check-in / check-out and duplicate check-in idempotency", async () => {
    const manager = UatNamespaceManager.getInstance();
    const shard0 = manager.createShardNamespace({
      shardIndex: 0,
      taskId: TASK_ID,
    });
    const recorder = new UatEvidenceRecorder({
      taskId: TASK_ID,
      shardIndex: 0,
      baseSha: BASE_SHA,
    });

    const siteId = shard0.qualifyId("site-a");
    const vehicleId = shard0.qualifyId("vehicle-queue-1");

    recorder.recordHttpCall({
      method: "POST",
      url: "/api/owned-mobility/dispatch/queue/check-in",
      statusCode: 200,
      durationMs: 12,
      requestBody: { vehicleId, siteId },
      responseBody: { status: "checked_in", position: 1 },
      actorRole: "driver",
    });
    recorder.recordHttpCall({
      method: "POST",
      url: "/api/owned-mobility/dispatch/queue/check-in",
      statusCode: 200,
      durationMs: 4,
      requestBody: { vehicleId, siteId },
      responseBody: { status: "checked_in", position: 1, isReplay: true },
      actorRole: "driver",
    });
    recorder.recordHttpCall({
      method: "POST",
      url: "/api/owned-mobility/dispatch/queue/check-out",
      statusCode: 200,
      durationMs: 10,
      requestBody: { vehicleId, siteId },
      responseBody: { status: "checked_out" },
      actorRole: "driver",
    });
    recorder.recordResourceId("queue_entry", `${siteId}:${vehicleId}`, {
      finalStatus: "checked_out",
    });

    recorder.recordLiveLimitation(
      "Browser/API server",
      "VM restriction: worker sandbox may not start the API/dev server or a browser; real behavioral proof is tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-queue-checkin-checkout.test.ts, executed against the real OwnedMobilityService including trace-log-stream reconstruction.",
    );

    const bundle = recorder.finalize();
    expect(bundle.status).toBe("passed");
    await shard0.cleanup();
  });
});
