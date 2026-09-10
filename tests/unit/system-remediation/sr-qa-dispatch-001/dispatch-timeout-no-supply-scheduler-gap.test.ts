// SR-QA-DISPATCH-001 -- C038 (real-time matcher / SLA monitor: automatic
// match, timeout, no-supply and recovery) acceptance regression, plus a
// structural regression documenting the C037/C038 "真觸發" (real automatic
// trigger) gap: this codebase implements the full no-supply/timeout STATE
// MACHINE and exposes it as callable service/API surface, but nothing in
// the owned-mobility module wires a wall-clock scheduler
// (@nestjs/schedule's @Cron/@Interval, or a bare setInterval/setTimeout) to
// call `handleDispatchTimeout` or a reservation-hold escalation method on
// its own. Every existing caller (the controller endpoint, the autonomous
// dispatch executor, voice-command-runner, and this test file) invokes it
// explicitly. This matches the capability audit notes verbatim:
//   C037: "有 reservation 狀態與轉移方法；未取得目前部署背景觸發證據"
//   C038: "有派車超時 API 與 no_supply 頁；未證明自動計時鏈路"
// Per the task brief, this is reported as a genuine product gap (tracked as
// a canonical follow-up subtask) rather than patched inside this
// verification-only task's write_scopes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import {
  buildOwnedMobilityServiceForTest,
  createTestPassengerOrder,
} from "./test-support";

describe("SR-QA-DISPATCH-001 / C038: no-supply escalation and recovery", () => {
  it("Positive: first no-supply dispatch failure moves the order to the delayed retry queue", () => {
    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });
    const order = createTestPassengerOrder(service);

    const dispatchResult = service.dispatchOrder(order.orderId, {
      mode: "auto",
    });

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("delayed_queue");
    expect(updatedOrder.queueFamily).toBe("delayed_retry_queue");
    expect(updatedOrder.dispatchAttemptCount).toBe(1);
    expect(updatedOrder.noSupplyEscalation!.escalationAction).toBe(
      "move_to_delayed_queue",
    );
    expect(dispatchResult.status).toBe("no_supply");
  });

  it("Positive: second consecutive no-supply failure escalates to ops manual review", () => {
    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });
    const order = createTestPassengerOrder(service);

    service.dispatchOrder(order.orderId, { mode: "auto" });
    service.resolveNoSupplyOrder(order.orderId, "retry_dispatch");

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("no_supply");
    expect(updatedOrder.queueFamily).toBe("manual_review_queue");
    expect(updatedOrder.noSupplyEscalation!.escalationAction).toBe(
      "escalate_to_ops",
    );
  });

  it("Positive: resolving no-supply with cancel_with_notification cancels the order and records the operator", () => {
    const { service, auditNotificationService } =
      buildOwnedMobilityServiceForTest({ candidates: [] });
    const order = createTestPassengerOrder(service);

    service.dispatchOrder(order.orderId, { mode: "auto" });
    service.resolveNoSupplyOrder(
      order.orderId,
      "cancel_with_notification",
      "operator-sr-qa-dispatch-001",
    );

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("cancelled");
    expect(updatedOrder.cancelReason).toBe("no_supply_cancelled");
    expect(updatedOrder.noSupplyEscalation!.resolvedAt).not.toBeNull();

    const auditCalls = auditNotificationService.recordAuditLog.mock
      .calls as Array<[{ actorId?: string }]>;
    expect(
      auditCalls.some(([log]) => log.actorId === "operator-sr-qa-dispatch-001"),
    ).toBe(true);
  });

  it("Positive: recovery after supply returns -- retry_dispatch clears the no-supply hold, and a subsequent dispatch attempt converges once supply exists (no automatic re-dispatch happens on its own)", async () => {
    let hasSupply = false;
    const { service } = buildOwnedMobilityServiceForTest({
      getEligibleCandidates: () =>
        hasSupply
          ? [
              {
                driverId: "driver-recovered",
                vehicleId: "vehicle-recovered",
                etaMinutes: 7,
                operatingArea: "taipei",
                serviceBuckets: ["standard_taxi"],
              },
            ]
          : [],
    });
    const order = createTestPassengerOrder(service);

    service.dispatchOrder(order.orderId, { mode: "auto" });
    expect(service.getOrder(order.orderId).status).toBe("delayed_queue");

    // Supply returns (a driver/vehicle becomes available in the registry).
    // `retry_dispatch` only clears the hold back to a dispatchable state --
    // it does not itself re-run matching, so the recovered order is not yet
    // assigned until something calls `dispatchOrder` (and then `assignDispatch`)
    // again -- another facet of the same "no automatic re-trigger" gap
    // documented in the scheduler-gap suite below.
    hasSupply = true;
    service.resolveNoSupplyOrder(order.orderId, "retry_dispatch");
    expect(service.getOrder(order.orderId).status).toBe("ready_for_dispatch");

    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId);
    expect(job?.status).toBe("matching");
    expect(job?.latestEtaMinutes).toBe(7);

    await service.assignDispatch({
      dispatchJobId: job!.dispatchJobId,
      vehicleId: "vehicle-recovered",
      driverId: "driver-recovered",
    });
    expect(service.getOrder(order.orderId).status).toBe("assigned");
  });
});

describe("SR-QA-DISPATCH-001 / C038: dispatch timeout (manual trigger of the real state machine)", () => {
  it("Positive: matching_timeout on an unassigned order places it in the redispatch priority queue", async () => {
    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });
    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });

    const timeoutResult = await service.handleDispatchTimeout(
      order.orderId,
      "matching_timeout",
    );
    expect(timeoutResult.status).toBe("dispatch_timeout");

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("dispatch_timeout");
    expect(updatedOrder.queueFamily).toBe("redispatch_priority_queue");
    expect(updatedOrder.dispatchTimeout!.timeoutReasonCode).toBe(
      "matching_timeout",
    );
  });

  it("Negative: acceptance_timeout without a target assignment id is rejected (400 ACCEPTANCE_TIMEOUT_TARGET_REQUIRED)", async () => {
    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-1",
          vehicleId: "vehicle-1",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });
    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;
    await service.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: "vehicle-1",
      driverId: "driver-1",
    });

    let caught: unknown;
    try {
      await service.handleDispatchTimeout(order.orderId, "acceptance_timeout");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).code).toBe(
      "ACCEPTANCE_TIMEOUT_TARGET_REQUIRED",
    );
  });

  it("Negative / Fence: a stale timeout naming an assignment that is no longer the active offer is a safe no-op (does not cancel the real active assignment)", async () => {
    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-1",
          vehicleId: "vehicle-1",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });
    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;
    await service.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: "vehicle-1",
      driverId: "driver-1",
    });

    const staleResult = await service.handleDispatchTimeout(
      order.orderId,
      "acceptance_timeout",
      undefined,
      { targetAssignmentId: "assignment-that-was-already-superseded" },
    );
    expect(staleResult.escalationAction).toBe("superseded");

    // The real active assignment must be untouched by the stale timer.
    const stillAssigned = service.getOrder(order.orderId);
    expect(stillAssigned.status).toBe("assigned");
  });
});

describe("SR-QA-DISPATCH-001 / C037 + C038: automatic wall-clock trigger gap (structural regression)", () => {
  const OWNED_MOBILITY_SRC = "../../../../apps/api/src/modules/owned-mobility";

  function readSource(relativeFile: string): string {
    return readFileSync(
      new URL(`${OWNED_MOBILITY_SRC}/${relativeFile}`, import.meta.url),
      "utf8",
    );
  }

  it("Documents: no @Cron/@Interval scheduler decorator exists anywhere in the dispatch module", () => {
    const sources = [
      readSource("owned-mobility.service.ts"),
      readSource("owned-autonomous-dispatch-executor.service.ts"),
      readSource("owned-mobility.module.ts"),
    ].join("\n");

    // This assertion is an intentional tripwire: if it starts failing, a
    // real scheduler has been wired up and C037/C038's "真觸發" gap in
    // docs/04-uat/system-remediation-20260906/SR-QA-DISPATCH-001.md should
    // be marked resolved, not silently accepted by loosening this test.
    expect(/@Cron\(|@Interval\(/.test(sources)).toBe(false);
  });

  it("Documents: the one existing wall-clock setInterval sweep (driver-completion-outbox recovery) is unrelated to dispatch-timeout/reservation-hold escalation -- proving the sweep pattern is architecturally available but not applied to C037/C038", () => {
    const source = readSource("owned-mobility.service.ts");
    // The pattern already exists in this codebase for a different resource
    // (driver completion outbox delivery retries) -- adding an equivalent
    // sweep for dispatch-timeout/reservation-hold is a scoping decision, not
    // a technical blocker. It is NOT scoped to this verification-only task's
    // write_scopes (tests/**, docs/04-uat/**) and belongs to a canonical
    // implementation follow-up.
    expect(source).toContain("startDriverCompletionOutboxRecoveryPolling");

    const intervalCallSites = [...source.matchAll(/setInterval\s*\(/g)].map(
      (match) => match.index ?? -1,
    );
    expect(intervalCallSites.length).toBeGreaterThan(0);

    for (const index of intervalCallSites) {
      const window = source.slice(index, index + 400);
      expect(window).not.toContain("handleDispatchTimeout");
      expect(window).not.toContain("transitionReservationHold");
      expect(window).not.toContain("applyDispatchTimeout");
    }
  });

  it("Documents: handleDispatchTimeout has no automatic caller besides explicit API/executor invocation", () => {
    const controllerSource = readSource("owned-mobility.controller.ts");
    // The only production caller besides the explicit controller endpoint is
    // the deterministic (non-timer-driven) autonomous dispatch executor,
    // which itself is only invoked by requestDispatch/handleOfferTimeout --
    // both explicit method calls, not a wall-clock sweep.
    expect(controllerSource).toContain(
      '@Post("orders/:orderId/dispatch-timeout")',
    );
  });
});
