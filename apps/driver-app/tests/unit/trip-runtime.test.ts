import { describe, expect, it } from "vitest";
import type {
  DriverTaskRecord,
  PlatformPresenceSummary,
  UnifiedDriverTaskView,
} from "@drts/contracts";

import {
  getTripPrimaryAction,
  getTripSecondaryAction,
  getTripExperienceStateFromView,
  resolveForwardedAcceptPendingDeadlineMs,
  resolveTripEmptyReason,
  selectTripTaskView,
  shouldShowTripCompletionProof,
} from "../../lib/trip-runtime";

function makeTaskView(
  overrides: Partial<UnifiedDriverTaskView> = {},
): UnifiedDriverTaskView {
  return {
    taskId: "task-001",
    orderId: "order-001",
    orderDomain: "owned",
    sourcePlatform: "drts",
    platformDisplayName: "DRTS",
    externalOrderId: null,
    nativeStatus: null,
    localStatus: "accepted",
    driverActionState: "in_progress",
    allowedActions: ["depart"],
    routeLocked: false,
    fareAuthority: "drts",
    settlementAuthority: "drts",
    driverPayoutAuthority: "drts",
    requiresManualFallback: false,
    requiresReauth: false,
    syncIssueSummary: null,
    blockingReason: null,
    pickupSummary: "台北車站",
    dropoffSummary: "松山機場",
    deadlineAt: null,
    updatedAt: "2026-05-25T20:00:00.000Z",
    ...overrides,
  };
}

function makeTask(overrides: Partial<DriverTaskRecord> = {}): DriverTaskRecord {
  return {
    taskId: "task-001",
    orderId: "order-001",
    dispatchJobId: "dispatch-001",
    assignmentId: "assignment-001",
    driverId: "driver-001",
    vehicleId: "vehicle-001",
    sourcePlatform: "grab_taiwan",
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

function makePlatformSummary(
  overrides: Partial<PlatformPresenceSummary> = {},
): PlatformPresenceSummary {
  return {
    driverId: "driver-001",
    presences: [],
    adapterStatuses: [],
    ...overrides,
  };
}

describe("selectTripTaskView", () => {
  it("prefers the requested task when it exists", () => {
    const tasks = [
      makeTaskView({ taskId: "task-001" }),
      makeTaskView({
        taskId: "task-002",
        driverActionState: "action_required",
      }),
    ];

    expect(selectTripTaskView(tasks, "task-001")?.taskId).toBe("task-001");
  });

  it("falls back to the active trip before action-required work", () => {
    const tasks = [
      makeTaskView({
        taskId: "task-action",
        driverActionState: "action_required",
      }),
      makeTaskView({ taskId: "task-active", driverActionState: "in_progress" }),
    ];

    expect(selectTripTaskView(tasks)?.taskId).toBe("task-active");
  });
});

describe("getTripExperienceStateFromView", () => {
  it("maps awaiting-platform forwarded work to the pending state", () => {
    expect(
      getTripExperienceStateFromView(
        makeTaskView({
          orderDomain: "forwarded",
          sourcePlatform: "grab_taiwan",
          driverActionState: "awaiting_platform",
          localStatus: "accept_pending",
        }),
      ),
    ).toBe("forwarded_pending");
  });

  it("maps manual fallback to its own trip state", () => {
    expect(
      getTripExperienceStateFromView(
        makeTaskView({
          orderDomain: "forwarded",
          sourcePlatform: "grab_taiwan",
          driverActionState: "blocked",
          requiresManualFallback: true,
        }),
      ),
    ).toBe("manual_fallback");
  });

  it("keeps forwarded mirror fallback data out of manual fallback when the ops flag is absent", () => {
    expect(
      getTripExperienceStateFromView(
        makeTaskView({
          orderDomain: "forwarded",
          sourcePlatform: "grab_taiwan",
          driverActionState: "in_progress",
          localStatus: "accepted",
          syncIssueSummary:
            "來源平台原生狀態暫不可用，目前先以本地鏡像資料呈現；若內容異常請聯繫派車台。",
        }),
      ),
    ).toBe("forwarded_confirmed");
  });
});

describe("trip action selection", () => {
  it("takes the next owned lifecycle action from allowedActions", () => {
    expect(
      getTripPrimaryAction(
        makeTaskView({
          orderDomain: "owned",
          allowedActions: ["arrived_pickup"],
        }),
      ),
    ).toBe("arrived_pickup");
  });

  it("keeps forwarded reject as a secondary action when accept is available", () => {
    const taskView = makeTaskView({
      orderDomain: "forwarded",
      sourcePlatform: "grab_taiwan",
      driverActionState: "action_required",
      allowedActions: ["accept", "reject"],
    });

    expect(getTripPrimaryAction(taskView)).toBe("accept");
    expect(getTripSecondaryAction(taskView)).toBe("reject");
  });

  it("shows completion proof only for owned complete actions", () => {
    expect(
      shouldShowTripCompletionProof(
        makeTaskView({
          orderDomain: "owned",
          allowedActions: ["complete"],
        }),
      ),
    ).toBe(true);

    expect(
      shouldShowTripCompletionProof(
        makeTaskView({
          orderDomain: "forwarded",
          sourcePlatform: "grab_taiwan",
          allowedActions: ["complete"],
        }),
      ),
    ).toBe(false);
  });
});

describe("resolveTripEmptyReason", () => {
  it("surfaces permission_denied when the task surface is disabled", () => {
    expect(
      resolveTripEmptyReason({
        tasksEnabled: false,
        platformSummary: makePlatformSummary(),
      }),
    ).toBe("permission_denied");
  });

  it("surfaces not_provisioned when there are no bound accounts", () => {
    expect(
      resolveTripEmptyReason({
        tasksEnabled: true,
        platformSummary: makePlatformSummary(),
      }),
    ).toBe("not_provisioned");
  });

  it("surfaces driver_not_eligible when every platform is blocked", () => {
    expect(
      resolveTripEmptyReason({
        tasksEnabled: true,
        platformSummary: makePlatformSummary({
          presences: [
            {
              driverId: "driver-001",
              platformCode: "grab_taiwan",
              accountId: "acct-1",
              status: "online",
              eligibility: "ineligible",
              tokenExpiresAt: null,
              reauthRequired: false,
              lastOnlineAt: null,
              lastOfflineAt: null,
              updatedAt: "2026-05-25T20:00:00.000Z",
            },
          ],
        }),
      }),
    ).toBe("driver_not_eligible");
  });

  it("surfaces external_unavailable when all adapters are degraded or down", () => {
    expect(
      resolveTripEmptyReason({
        tasksEnabled: true,
        platformSummary: makePlatformSummary({
          presences: [
            {
              driverId: "driver-001",
              platformCode: "grab_taiwan",
              accountId: "acct-1",
              status: "online",
              eligibility: "eligible",
              tokenExpiresAt: null,
              reauthRequired: false,
              lastOnlineAt: null,
              lastOfflineAt: null,
              updatedAt: "2026-05-25T20:00:00.000Z",
            },
          ],
          adapterStatuses: [
            {
              platformCode: "grab_taiwan",
              status: "down",
              blockingReason: "Adapter unavailable",
              lastSyncAt: null,
            },
          ],
        }),
      }),
    ).toBe("external_unavailable");
  });

  it("falls back to no_data when the driver is ready but has no trip", () => {
    expect(
      resolveTripEmptyReason({
        tasksEnabled: true,
        platformSummary: makePlatformSummary({
          presences: [
            {
              driverId: "driver-001",
              platformCode: "grab_taiwan",
              accountId: "acct-1",
              status: "online",
              eligibility: "eligible",
              tokenExpiresAt: null,
              reauthRequired: false,
              lastOnlineAt: null,
              lastOfflineAt: null,
              updatedAt: "2026-05-25T20:00:00.000Z",
            },
          ],
          adapterStatuses: [
            {
              platformCode: "grab_taiwan",
              status: "healthy",
              blockingReason: null,
              lastSyncAt: null,
            },
          ],
        }),
      }),
    ).toBe("no_data");
  });
});

describe("resolveForwardedAcceptPendingDeadlineMs", () => {
  it("uses the explicit deadline when provided", () => {
    expect(
      resolveForwardedAcceptPendingDeadlineMs(
        makeTaskView({
          orderDomain: "forwarded",
          sourcePlatform: "grab_taiwan",
          driverActionState: "awaiting_platform",
          deadlineAt: "2026-05-25T20:00:30.000Z",
        }),
        makeTask(),
      ),
    ).toBe(Date.parse("2026-05-25T20:00:30.000Z"));
  });

  it("treats stale deadlineAt values as the accept-pending start time", () => {
    expect(
      resolveForwardedAcceptPendingDeadlineMs(
        makeTaskView({
          orderDomain: "forwarded",
          sourcePlatform: "grab_taiwan",
          driverActionState: "awaiting_platform",
          deadlineAt: "2026-05-25T20:00:00.000Z",
          updatedAt: "2026-05-25T20:00:00.000Z",
        }),
        makeTask(),
      ),
    ).toBe(Date.parse("2026-05-25T20:00:30.000Z"));
  });

  it("falls back to acceptedAt plus 30 seconds when no deadline exists", () => {
    expect(
      resolveForwardedAcceptPendingDeadlineMs(
        makeTaskView({
          orderDomain: "forwarded",
          sourcePlatform: "grab_taiwan",
          driverActionState: "awaiting_platform",
          deadlineAt: null,
          updatedAt: "2026-05-25T20:00:00.000Z",
        }),
        makeTask({
          acceptedAt: "2026-05-25T20:01:00.000Z",
        }),
      ),
    ).toBe(Date.parse("2026-05-25T20:01:30.000Z"));
  });
});
