// SR-QA-DISPATCH-001 -- C035 (task list -> detail -> candidate query) and
// C036 (manual dispatch / reassign) acceptance regression.
//
// Exercises the real `OwnedMobilityService` (the class backing
// `POST /owned-mobility/dispatch/*`), not a re-implemented matcher, per the
// task brief ("重用UV-006/016保留實作，不另造matcher"). Runs in-memory
// (no repository) so it executes in this VM without a live PostgreSQL
// instance; see `dispatch-db-persistence.test.ts` for the real-Postgres
// write/read-back layer this regression does not attempt to replace.
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import {
  buildOwnedMobilityServiceForTest,
  createTestPassengerOrder,
} from "./test-support";

describe("SR-QA-DISPATCH-001 / C035: dispatch task list -> detail -> candidate query", () => {
  it("Positive: lists an active dispatch job and returns the live candidate pool for the order's service bucket", async () => {
    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-near",
          vehicleId: "vehicle-near",
          etaMinutes: 4,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
        {
          driverId: "driver-far",
          vehicleId: "vehicle-far",
          etaMinutes: 12,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });

    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });

    const jobs = service.listDispatchJobs();
    const job = jobs.find((j) => j.orderId === order.orderId);
    expect(job).toBeDefined();
    expect(job!.status).toBe("matching");
    // Task list -> detail: candidate ETA on the job snapshot reflects the
    // top-ranked live candidate at dispatch time, proving the list view is
    // not a static render.
    expect(job!.latestEtaMinutes).toBe(4);

    const candidates = await service.listDispatchCandidates(job!.dispatchJobId);
    expect(new Set(candidates.map((c) => c.vehicleId))).toEqual(
      new Set(["vehicle-near", "vehicle-far"]),
    );
  });

  it("Negative: an order with no live supply produces an empty candidate list and a non-matching job", async () => {
    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });

    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });

    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId);
    expect(job).toBeDefined();
    expect(job!.status).not.toBe("matching");

    const candidates = await service.listDispatchCandidates(job!.dispatchJobId);
    expect(candidates).toHaveLength(0);

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("delayed_queue");
  });

  it("Positive: a newly arrived order produces its own independent dispatch job and candidate set", async () => {
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

    const orderA = createTestPassengerOrder(service);
    service.dispatchOrder(orderA.orderId, { mode: "auto" });
    const jobsAfterFirst = service.listDispatchJobs();
    expect(jobsAfterFirst).toHaveLength(1);

    const orderB = createTestPassengerOrder(service);
    service.dispatchOrder(orderB.orderId, { mode: "auto" });
    const jobsAfterSecond = service.listDispatchJobs();
    expect(jobsAfterSecond).toHaveLength(2);
    expect(new Set(jobsAfterSecond.map((j) => j.orderId))).toEqual(
      new Set([orderA.orderId, orderB.orderId]),
    );
  });
});

describe("SR-QA-DISPATCH-001 / C036: manual dispatch, reassign, and revoke", () => {
  function dispatchWithCandidate(
    service: ReturnType<typeof buildOwnedMobilityServiceForTest>["service"],
  ) {
    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;
    return { order, job };
  }

  it("Positive: assigns the dispatch job to a vehicle/driver and the assignment is readable back via getOrder/listDispatchTrace", async () => {
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
    const { order, job } = dispatchWithCandidate(service);

    const result = await service.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: "vehicle-1",
      driverId: "driver-1",
    });
    expect(result.status).toBe("assigned");

    // Read-back: the order record (API-equivalent of GET
    // /owned-mobility/orders/:orderId) reflects the new assignment, not a
    // cached/static value.
    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("assigned");

    const trace = service.listDispatchTrace(order.orderId);
    expect(trace.some((entry) => entry.eventType === "dispatch.assigned")).toBe(
      true,
    );
  });

  it("Negative: reassign without a reason code is rejected (400)", async () => {
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
    const { job } = dispatchWithCandidate(service);
    await service.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: "vehicle-1",
      driverId: "driver-1",
    });

    let caught: unknown;
    try {
      service.reassignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: "vehicle-2",
        driverId: "driver-2",
        reasonCode: "",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).code).toBe("REASSIGN_REASON_REQUIRED");
  });

  it("Negative: assign is rejected when the vehicle fails the dispatchability recheck (ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT / VEHICLE_NOT_DISPATCHABLE)", async () => {
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
      vehicleDispatchable: false,
    });
    const { job } = dispatchWithCandidate(service);

    let caught: unknown;
    try {
      await service.assignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: "vehicle-1",
        driverId: "driver-1",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).code).toBe(
      "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
    );
    const details = (caught as ApiRequestError).getResponse() as {
      error?: { details?: Record<string, unknown> };
    };
    expect(JSON.stringify(details.error?.details)).toContain(
      "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
    );
  });

  it("Negative: reassign without an active assignment is rejected (409 ACTIVE_ASSIGNMENT_REQUIRED)", async () => {
    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });
    const { job } = dispatchWithCandidate(service);

    let caught: unknown;
    try {
      await service.reassignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: "vehicle-2",
        driverId: "driver-2",
        reasonCode: "operator_reassign",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).code).toBe("ACTIVE_ASSIGNMENT_REQUIRED");
  });

  it("Positive: reassign invalidates the previous assignment/task with the given reason and activates the new one", async () => {
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
    const { order, job } = dispatchWithCandidate(service);
    const first = await service.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: "vehicle-1",
      driverId: "driver-1",
    });
    const firstAssignmentId = (first as { assignmentId?: string }).assignmentId;

    const second = await service.reassignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: "vehicle-2",
      driverId: "driver-2",
      reasonCode: "vehicle_swap",
      reasonNote: "SR-QA-DISPATCH-001 regression",
    });
    expect(second.status).toBe("assigned");

    const snapshot = service.getReportingSnapshot();
    const previousAssignment = snapshot.dispatchAssignments.find(
      (a) => a.assignmentId === firstAssignmentId,
    );
    expect(previousAssignment?.status).toBe("cancelled");

    const activeAssignment = snapshot.dispatchAssignments.find(
      (a) => a.dispatchJobId === job.dispatchJobId && a.status !== "cancelled",
    );
    expect(activeAssignment?.vehicleId).toBe("vehicle-2");
    expect(activeAssignment?.driverId).toBe("driver-2");

    const trace = service.listDispatchTrace(order.orderId);
    const reassignTrace = trace.find(
      (entry) => entry.eventType === "dispatch.reassigned",
    );
    expect(reassignTrace?.details).toMatchObject({
      previousVehicleId: "vehicle-1",
      nextVehicleId: "vehicle-2",
      reasonCode: "vehicle_swap",
      reasonNote: "SR-QA-DISPATCH-001 regression",
    });
  });
});
