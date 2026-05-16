import { describe, expect, it } from "vitest";
import type { DriverTaskRecord, DriverTaskStatus } from "@drts/contracts";

import {
  getPrimaryTripAction,
  shouldShowTripCompletionProof,
} from "../../apps/driver-app/lib/trip-workflow";

function buildTask(
  status: DriverTaskStatus,
  sourcePlatform: string | null = null,
): DriverTaskRecord {
  return {
    taskId: "task-001",
    orderId: "order-001",
    dispatchJobId: "job-001",
    assignmentId: "assignment-001",
    driverId: "driver-001",
    vehicleId: "vehicle-001",
    sourcePlatform,
    routeProvided: true,
    waypoints: [],
    status,
    acceptedAt: null,
    departedAt: null,
    arrivedPickupAt: null,
    startedAt: null,
    completedAt: null,
    actualDistanceKm: null,
    actualDurationSec: null,
    fare: null,
    proof: null,
  };
}

describe("driver-app trip workflow helpers", () => {
  it.each([
    ["pending_acceptance", "accept", "接受任務"],
    ["accepted", "depart", "前往接送點"],
    ["enroute_pickup", "arrived", "抵達上車點"],
    ["arrived_pickup", "start", "開始行程"],
    ["on_trip", "complete", "完成行程"],
    ["proof_pending", "complete", "完成行程"],
  ] as const)("maps %s to a single primary action", (status, action, label) => {
    expect(getPrimaryTripAction(buildTask(status))).toEqual(
      expect.objectContaining({
        action,
        label,
      }),
    );
  });

  it("returns no local primary action for forwarded tasks", () => {
    expect(getPrimaryTripAction(buildTask("accepted", "uber"))).toBeNull();
  });

  it("shows completion proof only for locally completed trip steps", () => {
    expect(shouldShowTripCompletionProof(buildTask("accepted"))).toBe(false);
    expect(shouldShowTripCompletionProof(buildTask("on_trip"))).toBe(true);
    expect(shouldShowTripCompletionProof(buildTask("proof_pending"))).toBe(
      true,
    );
    expect(
      shouldShowTripCompletionProof(buildTask("proof_pending", "uber")),
    ).toBe(false);
  });

  it.each(["completed", "rejected", "cancelled"] as const)(
    "returns no primary action for %s terminal states",
    (status) => {
      expect(getPrimaryTripAction(buildTask(status))).toBeNull();
    },
  );
});
