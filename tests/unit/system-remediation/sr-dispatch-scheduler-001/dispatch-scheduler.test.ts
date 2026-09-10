// SR-DISPATCH-SCHEDULER-001
// Automated dispatch timeout and reservation hold escalation background scheduler tests.
// Verifies:
// 1. Real background interval timer triggers timeout and hold sweeps automatically (not just explicit API call).
// 2. Multi-instance deduplication via distributed lease coordination.
// 3. Restart safety: stopping and restarting cleanly recovers state.
// 4. Failure alarm: unexpected sweep errors log alarms, record audit log, and keep scheduler alive.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnedDispatchSchedulerService } from "../../../../apps/api/src/modules/owned-mobility/owned-dispatch-scheduler.service";
import {
  buildOwnedMobilityServiceForTest,
  createTestPassengerOrder,
} from "../sr-qa-dispatch-001/test-support";

describe("SR-DISPATCH-SCHEDULER-001: background scheduler for dispatch timeout & reservation hold", () => {
  const activeSchedulers: OwnedDispatchSchedulerService[] = [];

  beforeEach(() => {
    OwnedDispatchSchedulerService.resetSharedLeases();
  });

  afterEach(() => {
    while (activeSchedulers.length > 0) {
      const s = activeSchedulers.pop();
      s?.stopScheduler();
    }
    OwnedDispatchSchedulerService.resetSharedLeases();
  });

  function createScheduler(
    service: ReturnType<typeof buildOwnedMobilityServiceForTest>["service"],
    auditService?: ReturnType<
      typeof buildOwnedMobilityServiceForTest
    >["auditNotificationService"],
  ) {
    const scheduler = new OwnedDispatchSchedulerService(
      service,
      auditService as never,
      undefined,
    );
    activeSchedulers.push(scheduler);
    return scheduler;
  }

  it("Positive: real background timer automatically triggers acceptance timeout sweep on expired assignment", async () => {
    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-sched-1",
          vehicleId: "vehicle-sched-1",
          etaMinutes: 4,
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
      vehicleId: "vehicle-sched-1",
      driverId: "driver-sched-1",
    });

    const activeAssignment = service.getActiveDispatchAssignmentForOrder(
      order.orderId,
    )!;
    expect(activeAssignment.status).toBe("assigned");

    // Artificially age the assignment's acceptance deadline into the past
    activeAssignment.acceptanceDeadline = new Date(
      Date.now() - 5000,
    ).toISOString();

    const scheduler = createScheduler(service);

    // Start real background wall-clock scheduler with 20ms interval
    scheduler.startScheduler(20);

    // Wait for at least one background interval tick to fire
    await new Promise((resolve) => setTimeout(resolve, 80));

    scheduler.stopScheduler();

    const status = scheduler.getSchedulerStatus();
    expect(status.totalSweeps).toBeGreaterThan(0);
    expect(status.totalTimeoutsSwept).toBeGreaterThan(0);

    // The order should have transitioned to dispatch_timeout automatically
    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("dispatch_timeout");
    expect(updatedOrder.queueFamily).toBe("redispatch_priority_queue");
  });

  it("Positive: real background timer automatically triggers matching timeout sweep on expired matching job", async () => {
    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-sched-match",
          vehicleId: "vehicle-sched-match",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });
    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });

    const internalJob = (
      service as unknown as {
        dispatchJobs: Array<{
          orderId: string;
          status: string;
          createdAt: string;
        }>;
      }
    ).dispatchJobs.find((j) => j.orderId === order.orderId)!;
    expect(internalJob.status).toBe("matching");

    // Artificially age the job's creation time beyond 60s matching timeout SLA
    internalJob.createdAt = new Date(Date.now() - 70_000).toISOString();

    const scheduler = createScheduler(service);
    scheduler.startScheduler(20);

    await new Promise((resolve) => setTimeout(resolve, 80));
    scheduler.stopScheduler();

    const status = scheduler.getSchedulerStatus();
    expect(status.totalSweeps).toBeGreaterThan(0);
    expect(status.totalTimeoutsSwept).toBeGreaterThan(0);

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("dispatch_timeout");
    expect(updatedOrder.queueFamily).toBe("redispatch_priority_queue");
  });

  it("Positive: real background timer automatically triggers reservation hold escalation when confirmation window has no supply", async () => {
    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });

    const order = createTestPassengerOrder(service);
    const internalOrder = (
      service as unknown as { orders: Array<Record<string, unknown>> }
    ).orders.find((o) => o.orderId === order.orderId)!;

    // Configure as reservation in confirmation window without supply
    internalOrder.dispatchSemantics = "reservation";
    internalOrder.businessDispatchSubtype = "standard_reservation";
    internalOrder.reservationHoldStatus = "requested";
    internalOrder.reservationWindowStart = new Date(
      Date.now() + 10 * 60 * 1000,
    ).toISOString();
    internalOrder.reservationWindowEnd = new Date(
      Date.now() + 30 * 60 * 1000,
    ).toISOString();

    const scheduler = createScheduler(service);
    scheduler.startScheduler(20);

    await new Promise((resolve) => setTimeout(resolve, 80));
    scheduler.stopScheduler();

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("exception_hold");
    expect(updatedOrder.reservationHoldStatus).toBe("exception_hold");
    expect(updatedOrder.exceptionHold).toBeDefined();
    expect(updatedOrder.exceptionHold?.reasonCode).toBe("no_eligible_supply");
  });

  it("Positive: real background timer automatically expires pending exception hold override requests", async () => {
    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });

    const order = createTestPassengerOrder(service);
    const internalOrder = (
      service as unknown as { orders: Array<Record<string, unknown>> }
    ).orders.find((o) => o.orderId === order.orderId)!;

    internalOrder.status = "exception_hold";
    internalOrder.reservationHoldStatus = "exception_hold";
    internalOrder.exceptionHold = {
      reasonCode: "no_eligible_supply",
      dispatchJobId: "job-test-1",
      raisedAt: new Date().toISOString(),
      criteria: {
        isReservation: true,
        isWithinConfirmationWindow: true,
        hasEligibleSupply: false,
        reasonCode: "no_eligible_supply",
      },
      overrideAllowed: true,
      overrideActors: ["ops_user"],
      resolution: null,
      overrideRequest: {
        requestId: "override-1",
        overrideType: "release_to_dispatch",
        reason: "VIP override",
        status: "pending_approval",
        requestedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() - 10_000).toISOString(), // Expired
        requestedBy: { actorId: "operator-1", role: "operator" },
        approval: null,
        rejection: null,
      },
    };

    const scheduler = createScheduler(service);
    scheduler.startScheduler(20);

    await new Promise((resolve) => setTimeout(resolve, 80));
    scheduler.stopScheduler();

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.exceptionHold?.overrideRequest?.status).toBe("expired");
  });

  it("Positive: multi-instance deduplication prevents concurrent sweep execution", async () => {
    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });
    const schedulerA = createScheduler(service);
    const schedulerB = createScheduler(service);

    // Artificially acquire lease on scheduler A
    const { acquired, leaseToken } = await schedulerA.acquireLease(
      "owned_mobility:dispatch_scheduler",
      10_000,
    );
    expect(acquired).toBe(true);

    // Attempting sweep on scheduler B should be deduplicated / skipped because A holds the lease
    const resultB = await schedulerB.triggerSweep();
    expect(resultB.skipped).toBe(true);
    expect(resultB.reason).toBe("leased_by_other_instance");

    // Release lease on A
    schedulerA.releaseLease("owned_mobility:dispatch_scheduler", leaseToken);

    // Now scheduler B can acquire lease and sweep successfully
    const resultB2 = await schedulerB.triggerSweep();
    expect(resultB2.skipped).toBe(false);
  });

  it("Positive: restart safety cleanly clears and restarts schedule without duplicate timers", async () => {
    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });
    const scheduler = createScheduler(service);

    scheduler.startScheduler(20);
    expect(scheduler.getSchedulerStatus().running).toBe(true);

    // Stop scheduler
    scheduler.stopScheduler();
    expect(scheduler.getSchedulerStatus().running).toBe(false);

    // Restart scheduler
    scheduler.startScheduler(20);
    expect(scheduler.getSchedulerStatus().running).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 50));
    scheduler.stopScheduler();
    expect(scheduler.getSchedulerStatus().running).toBe(false);
  });

  it("Positive: failure alarm catches errors, records audit notification, and keeps scheduler alive", async () => {
    const { service, auditNotificationService } =
      buildOwnedMobilityServiceForTest({
        candidates: [],
      });

    // Mock sweepDispatchTimeouts to throw an intentional failure
    vi.spyOn(service, "sweepDispatchTimeouts").mockRejectedValueOnce(
      new Error("Simulated database timeout failure during sweep"),
    );

    const scheduler = createScheduler(service, auditNotificationService);

    const result = await scheduler.triggerSweep();
    expect(result.skipped).toBe(false);
    expect(result.error).toContain(
      "Simulated database timeout failure during sweep",
    );

    const status = scheduler.getSchedulerStatus();
    expect(status.errorCount).toBe(1);
    expect(status.lastError).toContain(
      "Simulated database timeout failure during sweep",
    );

    // Verify audit log alarm was recorded
    const auditCalls = auditNotificationService.recordAuditLog.mock
      .calls as Array<
      [{ action?: string; details?: { errorMessage?: string } }]
    >;
    expect(
      auditCalls.some(
        ([log]) =>
          log.action === "dispatch_scheduler_sweep_failure" &&
          log.details?.errorMessage?.includes(
            "Simulated database timeout failure",
          ),
      ),
    ).toBe(true);

    // Verify scheduler recovers on next tick
    const nextResult = await scheduler.triggerSweep();
    expect(nextResult.skipped).toBe(false);
    expect(nextResult.error).toBeUndefined();
  });
});
