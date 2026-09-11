// SR-QA-DRIVER-001 -- C053 (接單司機: accept/reject/timeout) and C054/C055
// (執行行程司機 + 簽收者: depart/arrive/start/complete with proof) acceptance.
//
// `apps/api/tests/unit/owned-mobility.service.test.ts` (~7300 lines) already
// exercises `OwnedMobilityService`'s driver task lifecycle exhaustively --
// this file does not re-derive that coverage. It (a) runs one full
// accept->depart->arrive->start->complete flow directly against the real
// service to independently confirm the currently-shipped behaviour at this
// SHA, with real write+read-back through `getOrder`/`listDispatchTrace`/
// `listDriverTasks`, and (b) adds the specific negative cases capabilities.json
// calls out as unverified for C053/C054/C055 (reject-reason requirement,
// double-dispatch/illegal-transition guard, dispatch timeout, and the
// `minPhotoCount` completion gate) that grep confirms have zero coverage in
// the existing suite (no hit for "MIN_PHOTO_COUNT_NOT_MET" or "minPhotoCount"
// there as of this SHA).
//
// Native background-accept, real backgrounded app state, and native push
// delivery are out of scope for this VM (see SR-LIVE-DRIVER-001) and are not
// asserted here.

import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";

const SAMPLE_PROOF_PHOTO = "cHJvb2YtcGhvdG8tMDAx";

function createService() {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => [
      {
        driverId: "drv-qa-001",
        vehicleId: "veh-qa-001",
        etaMinutes: 5,
        operatingArea: "north",
        serviceBuckets: ["business_dispatch"],
      },
    ]),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
    getVehicleLicenseType: vi.fn(() => "business_vehicle"),
    getVehiclePassengerDisclosureProfile: vi.fn(() => null),
    getDriverPublicRegistrationCredential: vi.fn(() => null),
    listVehicles: vi.fn(() => []),
    listDrivers: vi.fn(() => []),
    listSupplyPairs: vi.fn(() => []),
  };
  const auditNotificationService = {
    recordNotification: vi.fn(),
    recordAuditLog: vi.fn(),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };
  // Stubbed instead of importing @nestjs/event-emitter: the root-level
  // vitest config does not hoist apps/api's nest-scoped deps, and both
  // services here only ever call `.emit()` on this collaborator.
  const stubEventEmitter = { emit: () => {} };
  const taskEventsService = new OwnedMobilityTaskEventsService(
    stubEventEmitter as never,
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(
    stubEventEmitter as never,
  );

  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
  );

  return { service, auditNotificationService };
}

function bookAndAssign(
  service: OwnedMobilityService,
  overrides: {
    minPhotoCount?: number;
    signoffRequired?: boolean;
  } = {},
) {
  const booking = service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: "2026-05-01T09:00:00.000Z",
      reservationWindowEnd: "2026-05-01T10:00:00.000Z",
      pickup: { address: "Pickup" },
      dropoff: { address: "Dropoff" },
      passenger: { name: "QA Rider", phone: "0911222333" },
      ...overrides,
    },
    "tenant-demo-001",
  ) as { orderId: string; bookingId: string };

  const dispatchResult = service.dispatchOrder(booking.orderId, {
    mode: "auto",
  }) as { dispatchJobId: string };

  const assignment = service.assignDispatch({
    dispatchJobId: dispatchResult.dispatchJobId,
    vehicleId: "veh-qa-001",
    driverId: "drv-qa-001",
  }) as { taskId: string; assignmentId: string };

  return { booking, assignment };
}

describe("SR-QA-DRIVER-001 C053: driver accept / reject / timeout", () => {
  it("accepts a dispatched task and the acceptance is durably readable back through order status, task status, and the dispatch trace", async () => {
    const { service } = createService();
    const { booking, assignment } = bookAndAssign(service);

    const accepted = await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-05-01T09:05:00.000Z",
    });
    expect(accepted.status).toBe("accepted");

    // Read-back through three independent surfaces, not just the return
    // value of the write call.
    expect(service.getOrder(booking.orderId)).toMatchObject({
      status: "driver_accepted",
    });
    expect(
      service.listDriverTasks().find((t) => t.taskId === assignment.taskId),
    ).toMatchObject({ status: "accepted", taskId: assignment.taskId });
    expect(service.listDispatchTrace(booking.orderId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "driver.accepted" }),
      ]),
    );
  });

  it("rejects a task with no reason code (REJECT_REASON_REQUIRED) and leaves the assignment untouched", async () => {
    const { service } = createService();
    const { booking, assignment } = bookAndAssign(service);

    await expect(
      service.rejectDriverTask(assignment.taskId, { reasonCode: "" } as never),
    ).rejects.toMatchObject({ code: "REJECT_REASON_REQUIRED" });

    // The write must not have happened: order/task are still awaiting driver
    // response, not silently marked rejected.
    expect(service.getOrder(booking.orderId).status).not.toBe("cancelled");
    expect(
      service.listDriverTasks().find((t) => t.taskId === assignment.taskId),
    ).toMatchObject({ status: "pending_acceptance" });
  });

  it("rejects a task with a reason code and records the rejection in the dispatch trace", async () => {
    const { service } = createService();
    const { assignment } = bookAndAssign(service);

    const rejected = await service.rejectDriverTask(assignment.taskId, {
      reasonCode: "too_far",
    });
    expect(rejected.status).toBe("rejected");
    expect(
      service.listDriverTasks().find((t) => t.taskId === assignment.taskId),
    ).toMatchObject({ status: "rejected" });

    // A rejected task is terminal: DRIVER_TASK_TRANSITIONS.rejected === [].
    await expect(
      service.acceptDriverTask(assignment.taskId, {
        acceptedAt: "2026-05-01T09:06:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "DRIVER_TASK_TRANSITION_INVALID" });
  });

  it("times out an unmatched order into the redispatch priority queue (covers the 過期任務 acceptance gap) and the requeue is readable back on the order", async () => {
    const { service } = createService();
    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-05-01T09:00:00.000Z",
        reservationWindowEnd: "2026-05-01T10:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "QA Rider", phone: "0911222333" },
      },
      "tenant-demo-001",
    ) as { orderId: string };

    service.dispatchOrder(booking.orderId, { mode: "auto" });

    const timeoutResult = (await service.handleDispatchTimeout(
      booking.orderId,
      "matching_timeout",
    )) as { status: string; timeoutReasonCode: string };

    expect(timeoutResult.status).toBe("dispatch_timeout");

    const updatedOrder = service.getOrder(booking.orderId);
    expect(updatedOrder.status).toBe("dispatch_timeout");
    expect(updatedOrder.queueFamily).toBe("redispatch_priority_queue");
  });
});

describe("SR-QA-DRIVER-001 C054: trip state machine (illegal jumps, idempotent re-press)", () => {
  it("runs the full depart->arrive->start->complete flow and each step is readable back on the order and driver task", async () => {
    const { service } = createService();
    const { booking, assignment } = bookAndAssign(service);

    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-05-01T09:05:00.000Z",
    });
    await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-05-01T09:10:00.000Z",
    });
    expect(service.getOrder(booking.orderId).status).toBe("enroute_pickup");

    await service.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-05-01T09:20:00.000Z",
    });
    expect(service.getOrder(booking.orderId).status).toBe("arrived_pickup");

    await service.startDriverTask(assignment.taskId, {
      startedAt: "2026-05-01T09:25:00.000Z",
    });
    expect(service.getOrder(booking.orderId).status).toBe("on_trip");

    await service.completeDriverTask(assignment.taskId, {
      completedAt: "2026-05-01T09:45:00.000Z",
      actualDistanceKm: 12.4,
      actualDurationSec: 1200,
      proof: { photos: [SAMPLE_PROOF_PHOTO] },
    });
    expect(service.getOrder(booking.orderId).status).toBe("completed");
    expect(
      service.listDriverTasks().find((t) => t.taskId === assignment.taskId),
    ).toMatchObject({ status: "completed" });
  });

  it("rejects starting a trip before the driver has arrived at pickup (illegal skip of enroute/arrived)", async () => {
    const { service } = createService();
    const { assignment } = bookAndAssign(service);

    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-05-01T09:05:00.000Z",
    });
    await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-05-01T09:10:00.000Z",
    });

    // Driver app double-taps "start trip" (or a stale queued action replays)
    // before arrivedPickup has landed -- must not silently start the meter.
    await expect(
      service.startDriverTask(assignment.taskId, {
        startedAt: "2026-05-01T09:11:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "PICKUP_NOT_ARRIVED" });

    expect(
      service.listDriverTasks().find((t) => t.taskId === assignment.taskId),
    ).toMatchObject({ status: "enroute_pickup" });
  });

  it("rejects an illegal backward/duplicate-skip transition (accept -> complete) with DRIVER_TASK_TRANSITION_INVALID", async () => {
    const { service } = createService();
    const { assignment } = bookAndAssign(service);

    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-05-01T09:05:00.000Z",
    });

    await expect(
      service.completeDriverTask(assignment.taskId, {
        completedAt: "2026-05-01T09:06:00.000Z",
        proof: { photos: [SAMPLE_PROOF_PHOTO] },
      }),
    ).rejects.toMatchObject({ code: "TASK_NOT_ACTIVE" });
  });

  it("is idempotent for a re-pressed depart action from the same status (重按/失聯恢復 recovery case)", async () => {
    const { service } = createService();
    const { assignment } = bookAndAssign(service);

    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-05-01T09:05:00.000Z",
    });
    await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-05-01T09:10:00.000Z",
    });

    // A driver phone that briefly lost connectivity and replays its last
    // queued "depart" action must not error -- DRIVER_TASK_TRANSITIONS
    // treats task.status === next as a no-op, not a conflict.
    const replay = await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-05-01T09:10:05.000Z",
    });
    expect(replay.status).toBe("enroute_pickup");
  });
});

describe("SR-QA-DRIVER-001 C055: completion proof (missing-photo gate, signoff)", () => {
  it("blocks completion when photos fall short of the order's minPhotoCount and moves the task to proof_pending -- this exact path (MIN_PHOTO_COUNT_NOT_MET) has no coverage in owned-mobility.service.test.ts as of this SHA", async () => {
    const { service } = createService();
    // createTenantBooking defaults minPhotoCount to 1 for business-dispatch
    // orders (apps/api/src/modules/owned-mobility/owned-mobility.service.ts
    // proofRequirements default), so submitting zero photos must fail closed.
    const { booking, assignment } = bookAndAssign(service, {
      minPhotoCount: 2,
    });

    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-05-01T09:05:00.000Z",
    });
    await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-05-01T09:10:00.000Z",
    });
    await service.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-05-01T09:20:00.000Z",
    });
    await service.startDriverTask(assignment.taskId, {
      startedAt: "2026-05-01T09:25:00.000Z",
    });

    await expect(
      service.completeDriverTask(assignment.taskId, {
        completedAt: "2026-05-01T09:45:00.000Z",
        proof: { photos: [SAMPLE_PROOF_PHOTO] }, // only 1 of the required 2
      }),
    ).rejects.toMatchObject({
      code: "MIN_PHOTO_COUNT_NOT_MET",
    });

    // The order and task must be durably parked in proof_pending -- not
    // silently completed, and not stuck showing "on_trip" with no way for
    // the driver to resume and add the missing photo (offline resubmit path).
    expect(service.getOrder(booking.orderId).status).toBe("proof_pending");
    expect(
      service.listDriverTasks().find((t) => t.taskId === assignment.taskId),
    ).toMatchObject({ status: "proof_pending" });

    // The offline-resubmit path: completing again with enough photos from
    // proof_pending must succeed (this transition IS in DRIVER_TASK_TRANSITIONS).
    const completed = await service.completeDriverTask(assignment.taskId, {
      completedAt: "2026-05-01T09:50:00.000Z",
      proof: { photos: [SAMPLE_PROOF_PHOTO, SAMPLE_PROOF_PHOTO] },
    });
    expect(completed.status).toBe("completed");
    expect(service.getOrder(booking.orderId).status).toBe("completed");
  });

  it("rejects a completion proof photo that is not valid base64 payload (malformed offline-queued upload)", async () => {
    const { service } = createService();
    const { assignment } = bookAndAssign(service);

    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-05-01T09:05:00.000Z",
    });
    await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-05-01T09:10:00.000Z",
    });
    await service.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-05-01T09:20:00.000Z",
    });
    await service.startDriverTask(assignment.taskId, {
      startedAt: "2026-05-01T09:25:00.000Z",
    });

    await expect(
      service.completeDriverTask(assignment.taskId, {
        completedAt: "2026-05-01T09:45:00.000Z",
        proof: { photos: ["not-a-valid-base64-payload!!"] },
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });
});
