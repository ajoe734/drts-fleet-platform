import { describe, expect, it } from "vitest";
import type { DriverTaskRecord } from "@drts/contracts";

import {
  getPrimaryTripAction,
  getTripExperienceState,
  shouldShowTripCompletionProof,
  type TripExperienceState,
} from "../../lib/trip-workflow";

function makeTask(overrides: Partial<DriverTaskRecord> = {}): DriverTaskRecord {
  return {
    taskId: "task-001",
    orderId: "order-001",
    dispatchJobId: "dispatch-001",
    assignmentId: "assignment-001",
    driverId: "driver-001",
    vehicleId: "vehicle-001",
    sourcePlatform: null,
    routeProvided: true,
    waypoints: [],
    status: "pending_acceptance",
    acceptedAt: null,
    departedAt: null,
    arrivedPickupAt: null,
    startedAt: null,
    completedAt: null,
    actualDistanceKm: null,
    actualDurationSec: null,
    fare: null,
    proof: null,
    ...overrides,
  };
}

describe("trip forwarded workflow actions", () => {
  it("keeps owned pending tasks on the local accept action", () => {
    const task = makeTask();

    expect(getTripExperienceState(task)).toBe("owned_active");
    expect(getPrimaryTripAction(task)?.action).toBe("accept");
  });

  it("suppresses the generic accept action for forwarded offers", () => {
    const task = makeTask({ sourcePlatform: "fleet_partner" });

    expect(getTripExperienceState(task)).toBe("forwarded_offered");
    expect(getPrimaryTripAction(task)).toBeNull();
  });

  it("keeps forwarded pending tasks blocked even when the task payload is still stale", () => {
    const task = makeTask({ sourcePlatform: "fleet_partner" });
    const effectiveState: TripExperienceState = "forwarded_pending";

    expect(getPrimaryTripAction(task, effectiveState)).toBeNull();
    expect(shouldShowTripCompletionProof(task, effectiveState)).toBe(false);
  });

  it("unlocks the local dispatch flow only after platform confirmation", () => {
    const task = makeTask({ sourcePlatform: "fleet_partner" });
    const effectiveState: TripExperienceState = "forwarded_confirmed";

    expect(getPrimaryTripAction(task, effectiveState)?.action).toBe("depart");
  });

  it("treats completed sandbox sync as a terminal forwarded state", () => {
    const task = makeTask({
      sourcePlatform: "fleet_partner",
      status: "completed",
      completedAt: "2026-05-19T05:00:00.000Z",
    });

    expect(getTripExperienceState(task)).toBe("forwarded_completed");
    expect(getPrimaryTripAction(task)).toBeNull();
    expect(shouldShowTripCompletionProof(task)).toBe(false);
  });

  it("keeps stale accepted tasks blocked after forwarded completion sync", () => {
    const task = makeTask({
      sourcePlatform: "fleet_partner",
      status: "accepted",
      forwardedStatus: "completed_synced",
    });

    expect(getTripExperienceState(task)).toBe("forwarded_completed");
    expect(getPrimaryTripAction(task)).toBeNull();
    expect(shouldShowTripCompletionProof(task)).toBe(false);
  });

  it("maps terminal forwarded runtime states from the task payload", () => {
    expect(
      getTripExperienceState(
        makeTask({
          sourcePlatform: "fleet_partner",
          forwardedStatus: "lost_race",
        }),
      ),
    ).toBe("forwarded_lost");
    expect(
      getTripExperienceState(
        makeTask({
          sourcePlatform: "fleet_partner",
          forwardedStatus: "cancelled_by_platform",
        }),
      ),
    ).toBe("forwarded_cancelled");
    expect(
      getTripExperienceState(
        makeTask({
          sourcePlatform: "fleet_partner",
          forwardedStatus: "sync_failed",
        }),
      ),
    ).toBe("sync_failed");
  });

  it("prefers unified task awaiting-platform state for accept-pending relays", () => {
    const task = makeTask({
      sourcePlatform: "fleet_partner",
      status: "pending_acceptance",
    });

    expect(
      getTripExperienceState(task, {
        taskId: task.taskId,
        orderId: task.orderId,
        orderDomain: "forwarded",
        sourcePlatform: "grab",
        platformDisplayName: "Grab",
        externalOrderId: "ext-001",
        nativeStatus: null,
        localStatus: "accepted",
        driverActionState: "awaiting_platform",
        allowedActions: [],
        routeLocked: true,
        fareAuthority: "external_platform",
        settlementAuthority: "external_platform",
        driverPayoutAuthority: "external_platform",
        requiresManualFallback: false,
        requiresReauth: false,
        syncIssueSummary: null,
        blockingReason: null,
        pickupSummary: null,
        dropoffSummary: null,
        deadlineAt: null,
        updatedAt: "2026-05-19T05:00:00.000Z",
      }),
    ).toBe("forwarded_pending");
  });
});
