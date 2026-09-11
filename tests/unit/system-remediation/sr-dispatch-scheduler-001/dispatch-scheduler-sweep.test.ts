// SR-DISPATCH-SCHEDULER-001 -- real background scheduler trigger for
// dispatch-timeout and reservation-hold escalation.
//
// SR-QA-DISPATCH-001 found that `handleDispatchTimeout` and the
// reservation-hold -> exception_hold transition are only ever invoked
// explicitly (controller endpoint, the deterministic autonomous dispatch
// executor, or a test) -- nothing in the owned-mobility module runs a
// wall-clock sweep on its own. This suite exercises the real
// `OwnedMobilityService.runDispatchSchedulerSweep` background trigger added
// to close that gap: it reuses the exact same production methods
// (`handleDispatchTimeout`, `dispatchOrder`) a human/API caller would use,
// just invoked automatically once their deadline has passed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildOwnedMobilityServiceForTest,
  createTestPassengerOrder,
} from "../sr-qa-dispatch-001/test-support";

describe("SR-DISPATCH-SCHEDULER-001: real automatic dispatch-timeout trigger", () => {
  it("Positive: a matching job left unassigned past the matching-timeout window is automatically timed out by the sweep, with no manual call", async () => {
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
    expect(job.status).toBe("matching");

    // Nobody calls handleDispatchTimeout here -- only the sweep, given a
    // `now` far enough past the job's createdAt to exceed the default
    // matching-timeout window.
    const summary = await service.runDispatchSchedulerSweep(
      new Date(Date.now() + 120_000),
    );

    expect(summary.matchingTimeouts).toBe(1);
    expect(summary.failures).toBe(0);
    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("dispatch_timeout");
    expect(updatedOrder.dispatchTimeout!.timeoutReasonCode).toBe(
      "matching_timeout",
    );
  });

  it("Positive: an assignment left un-accepted past its acceptanceDeadline is automatically timed out by the sweep", async () => {
    vi.useFakeTimers();
    try {
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
      expect(service.getOrder(order.orderId).status).toBe("assigned");

      // Default DISPATCH_ACCEPTANCE_TIMEOUT_MS is 60s. Advance the real
      // clock (not just the sweep's own filter) 120s forward, because
      // `handleDispatchTimeout`'s in-memory-mode path re-validates the
      // deadline against `Date.now()` itself as an authoritative fence
      // against a stale timer -- it must not fire off wall-clock time that
      // has not actually elapsed.
      vi.advanceTimersByTime(120_000);
      const summary = await service.runDispatchSchedulerSweep();

      expect(summary.acceptanceTimeouts).toBe(1);
      expect(summary.failures).toBe(0);
      const updatedOrder = service.getOrder(order.orderId);
      expect(updatedOrder.status).toBe("dispatch_timeout");
      expect(updatedOrder.dispatchTimeout!.timeoutReasonCode).toBe(
        "acceptance_timeout",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("Negative fence: a job well within its matching-timeout window is left untouched", async () => {
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

    const summary = await service.runDispatchSchedulerSweep(new Date());

    expect(summary.matchingTimeouts).toBe(0);
    expect(summary.acceptanceTimeouts).toBe(0);
    expect(service.getOrder(order.orderId).status).not.toBe("dispatch_timeout");
  });
});

describe("SR-DISPATCH-SCHEDULER-001: real automatic reservation-hold escalation trigger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Positive: a reservation order parked in redispatch_required is escalated to exception_hold once the confirmation window arrives, with no manual re-dispatch call", async () => {
    const NOW = new Date("2026-06-05T08:00:00.000Z");
    vi.setSystemTime(NOW);

    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });

    // enterprise_dispatch has a 30-minute confirmation window; starting the
    // reservation 40 minutes out means dispatching now is still outside that
    // window, so the first failed dispatch just parks the order for retry
    // instead of escalating immediately.
    const reservationWindowStart = new Date(
      NOW.getTime() + 40 * 60_000,
    ).toISOString();
    const booking = (await service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart,
        reservationWindowEnd: new Date(
          NOW.getTime() + 100 * 60_000,
        ).toISOString(),
        pickup: { address: "台中市西屯區台灣大道 1 號" },
        dropoff: { address: "台中市南屯區公益路 2 號" },
        passenger: { name: "SR-DISPATCH-SCHEDULER-001", phone: "0911222333" },
      },
      "tenant-demo-001",
    )) as { orderId: string };

    service.dispatchOrder(booking.orderId, { mode: "auto" });
    expect(service.getOrder(booking.orderId).status).toBe(
      "redispatch_required",
    );

    // Advance real wall-clock time (the sweep's own reservation-escalation
    // path re-invokes `dispatchOrder`, which reads `Date.now()` internally)
    // to 20 minutes before the reservation start -- inside the 30-minute
    // confirmation window, with supply still absent.
    vi.setSystemTime(new Date(reservationWindowStart).getTime() - 20 * 60_000);

    const summary = await service.runDispatchSchedulerSweep();

    expect(summary.reservationHoldEscalations).toBe(1);
    expect(summary.failures).toBe(0);
    expect(service.getOrder(booking.orderId).status).toBe("exception_hold");
  });

  it("Negative fence: a reservation order still well outside its confirmation window is left in redispatch_required", async () => {
    const NOW = new Date("2026-06-05T08:00:00.000Z");
    vi.setSystemTime(NOW);

    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });
    const reservationWindowStart = new Date(
      NOW.getTime() + 120 * 60_000,
    ).toISOString();
    const booking = (await service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart,
        reservationWindowEnd: new Date(
          NOW.getTime() + 180 * 60_000,
        ).toISOString(),
        pickup: { address: "台中市西屯區台灣大道 1 號" },
        dropoff: { address: "台中市南屯區公益路 2 號" },
        passenger: { name: "SR-DISPATCH-SCHEDULER-001", phone: "0911222333" },
      },
      "tenant-demo-001",
    )) as { orderId: string };

    service.dispatchOrder(booking.orderId, { mode: "auto" });
    expect(service.getOrder(booking.orderId).status).toBe(
      "redispatch_required",
    );

    const summary = await service.runDispatchSchedulerSweep();

    expect(summary.reservationHoldEscalations).toBe(0);
    expect(service.getOrder(booking.orderId).status).toBe(
      "redispatch_required",
    );
  });
});

describe("SR-DISPATCH-SCHEDULER-001: restart and multi-instance dedup safety", () => {
  it("Restart-safe: a freshly constructed service instance seeded with the same persisted-style state still resolves the overdue assignment correctly", async () => {
    const { service: serviceA } = buildOwnedMobilityServiceForTest({
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
    const order = createTestPassengerOrder(serviceA);
    serviceA.dispatchOrder(order.orderId, { mode: "auto" });
    const job = serviceA
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;
    await serviceA.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: "vehicle-1",
      driverId: "driver-1",
    });

    // Simulate a restart onto a brand-new instance: no in-process
    // bookkeeping is carried over, only the same order/job/assignment state
    // a real restart would reload from persistence.
    const { service: serviceB } = buildOwnedMobilityServiceForTest({
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
    (serviceB as unknown as { orders: unknown }).orders = (
      serviceA as unknown as { orders: unknown }
    ).orders;
    (serviceB as unknown as { dispatchJobs: unknown }).dispatchJobs = (
      serviceA as unknown as { dispatchJobs: unknown }
    ).dispatchJobs;
    (
      serviceB as unknown as { dispatchAssignments: unknown }
    ).dispatchAssignments = (
      serviceA as unknown as { dispatchAssignments: unknown }
    ).dispatchAssignments;
    (serviceB as unknown as { driverTasks: unknown }).driverTasks = (
      serviceA as unknown as { driverTasks: unknown }
    ).driverTasks;

    vi.useFakeTimers();
    let summary;
    try {
      vi.advanceTimersByTime(120_000);
      summary = await serviceB.runDispatchSchedulerSweep();
    } finally {
      vi.useRealTimers();
    }

    expect(summary.acceptanceTimeouts).toBe(1);
    expect(serviceB.getOrder(order.orderId).status).toBe("dispatch_timeout");
  });

  it("Multi-instance dedup: two overlapping sweep passes over the same overdue assignment resolve it exactly once, the second is a safe no-op", async () => {
    vi.useFakeTimers();
    try {
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

      vi.advanceTimersByTime(120_000);
      // Two sequential sweep ticks, standing in for two instances racing on
      // the same overdue assignment: the first resolves it for real, and the
      // second -- re-deriving its candidate list from the now-updated state --
      // finds nothing left to do.
      const first = await service.runDispatchSchedulerSweep();
      const second = await service.runDispatchSchedulerSweep();

      expect(first.acceptanceTimeouts).toBe(1);
      expect(second.acceptanceTimeouts).toBe(0);
      expect(service.getOrder(order.orderId).dispatchAttemptCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Multi-instance dedup (direct fencing proof): calling handleDispatchTimeout twice for the same targetAssignmentId only resolves it once; the repeat call reports superseded and does not double-count the attempt", async () => {
    vi.useFakeTimers();
    try {
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
      const assignmentResult = await service.assignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: "vehicle-1",
        driverId: "driver-1",
      });
      const targetAssignmentId = (assignmentResult as { assignmentId: string })
        .assignmentId;

      vi.advanceTimersByTime(120_000);

      const firstTimeout = await service.handleDispatchTimeout(
        order.orderId,
        "acceptance_timeout",
        undefined,
        { targetAssignmentId },
      );
      expect(firstTimeout.status).toBe("dispatch_timeout");

      const secondTimeout = await service.handleDispatchTimeout(
        order.orderId,
        "acceptance_timeout",
        undefined,
        { targetAssignmentId },
      );
      expect(secondTimeout.escalationAction).toBe("superseded");
      expect(service.getOrder(order.orderId).dispatchAttemptCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SR-DISPATCH-SCHEDULER-001: sweep failure isolation and alerting", () => {
  it("One item failing during the sweep does not block the others, and records an ops failure notification", async () => {
    const { service, auditNotificationService } =
      buildOwnedMobilityServiceForTest({
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

    const healthyOrder = createTestPassengerOrder(service);
    service.dispatchOrder(healthyOrder.orderId, { mode: "auto" });

    const brokenOrder = createTestPassengerOrder(service);
    service.dispatchOrder(brokenOrder.orderId, { mode: "auto" });
    // Simulate a corrupted/dangling job (e.g. its order was deleted by
    // something else between the sweep's snapshot and its processing) by
    // pointing a real "matching" job at an order id that no longer exists.
    // handleDispatchTimeout's requireOrder lookup will throw for this one.
    const jobs = (service as unknown as { dispatchJobs: { orderId: string }[] })
      .dispatchJobs;
    const brokenJob = jobs.find((j) => j.orderId === brokenOrder.orderId)!;
    brokenJob.orderId = "order-does-not-exist";

    const summary = await service.runDispatchSchedulerSweep(
      new Date(Date.now() + 120_000),
    );

    expect(summary.matchingTimeouts).toBe(1);
    expect(summary.failures).toBe(1);
    expect(service.getOrder(healthyOrder.orderId).status).toBe(
      "dispatch_timeout",
    );

    const notificationCalls = auditNotificationService.recordNotification.mock
      .calls as Array<[{ title: string; message: string }]>;
    expect(
      notificationCalls.some(([note]) =>
        note.title.includes("Dispatch scheduler sweep failure"),
      ),
    ).toBe(true);
  });
});

describe("SR-DISPATCH-SCHEDULER-001: assignment-time platform-presence recheck", () => {
  it("Negative: assignment is rejected when the selected driver has since gone busy on another platform (ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT / DRIVER_BUSY_ON_OTHER_PLATFORM)", async () => {
    const { PlatformPresenceService } =
      await import("../../../../apps/api/src/modules/platform-presence/platform-presence.service");
    const presence = new PlatformPresenceService();

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
      platformPresenceService: presence,
    });
    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;

    // The driver was a clean candidate at listing time, but accepts a fare
    // on another platform before this dispatch's assignment is committed.
    await presence.setBusy("driver-1", "uber" as never);

    let caught: unknown;
    try {
      await service.assignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: "vehicle-1",
        driverId: "driver-1",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    const response = (
      caught as {
        getResponse: () => {
          error: { code: string; details: { reasonCodes: string[] } };
        };
      }
    ).getResponse();
    expect(response.error.code).toBe("ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT");
    expect(response.error.details.reasonCodes).toContain(
      "DRIVER_BUSY_ON_OTHER_PLATFORM",
    );
    expect(service.getOrder(order.orderId).status).not.toBe("assigned");
  });

  it("Positive: assignment succeeds normally when platform-presence has no blocking record for the driver", async () => {
    const { PlatformPresenceService } =
      await import("../../../../apps/api/src/modules/platform-presence/platform-presence.service");
    const presence = new PlatformPresenceService();

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
      platformPresenceService: presence,
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

    expect(service.getOrder(order.orderId).status).toBe("assigned");
  });
});
