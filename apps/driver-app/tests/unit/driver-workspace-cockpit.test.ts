import { describe, expect, it } from "vitest";

import {
  buildFallbackUnifiedDriverTaskView,
  summarizeWorkspaceTasks,
} from "../../lib/driver-workspace-cockpit";

describe("buildFallbackUnifiedDriverTaskView", () => {
  it("maps forwarded legacy tasks to mirrored task views without forcing manual fallback", () => {
    const taskView = buildFallbackUnifiedDriverTaskView({
      taskId: "task-forwarded-001",
      orderId: "order-001",
      dispatchJobId: "dispatch-001",
      assignmentId: "assignment-001",
      driverId: "driver-001",
      vehicleId: "vehicle-001",
      sourcePlatform: "grab",
      routeProvided: false,
      waypoints: [],
      status: "accepted",
      acceptedAt: "2026-05-08T02:00:00.000Z",
      departedAt: null,
      arrivedPickupAt: null,
      startedAt: null,
      completedAt: null,
      actualDistanceKm: null,
      actualDurationSec: null,
      fare: null,
      proof: null,
    });

    expect(taskView.orderDomain).toBe("forwarded");
    expect(taskView.platformDisplayName).toBe("Grab");
    expect(taskView.fareAuthority).toBe("external_platform");
    expect(taskView.requiresManualFallback).toBe(false);
    expect(taskView.driverActionState).toBe("in_progress");
  });
});

describe("summarizeWorkspaceTasks", () => {
  it("surfaces sync issues ahead of other cockpit work and counts urgent states", () => {
    const summary = summarizeWorkspaceTasks([
      {
        taskId: "task-sync",
        orderId: "order-sync",
        orderDomain: "forwarded",
        sourcePlatform: "grab",
        platformDisplayName: "Grab",
        externalOrderId: "ext-001",
        nativeStatus: "sync_failed",
        localStatus: "accepted",
        driverActionState: "blocked",
        allowedActions: [],
        routeLocked: true,
        fareAuthority: "external_platform",
        settlementAuthority: "external_platform",
        driverPayoutAuthority: "external_platform",
        requiresManualFallback: true,
        requiresReauth: false,
        syncIssueSummary: "需派車台介入",
        blockingReason: null,
        pickupSummary: null,
        dropoffSummary: null,
        deadlineAt: null,
        updatedAt: "2026-05-08T02:10:00.000Z",
      },
      {
        taskId: "task-awaiting",
        orderId: "order-awaiting",
        orderDomain: "forwarded",
        sourcePlatform: "uber",
        platformDisplayName: "Uber",
        externalOrderId: "ext-002",
        nativeStatus: "accept_pending",
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
        deadlineAt: "2026-05-08T02:05:00.000Z",
        updatedAt: "2026-05-08T02:00:00.000Z",
      },
      {
        taskId: "task-active",
        orderId: "order-active",
        orderDomain: "owned",
        sourcePlatform: "drts",
        platformDisplayName: "DRTS",
        externalOrderId: null,
        nativeStatus: null,
        localStatus: "on_trip",
        driverActionState: "in_progress",
        allowedActions: ["complete"],
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
        updatedAt: "2026-05-08T01:59:00.000Z",
      },
    ]);

    expect(summary.orderedTasks.map((task) => task.taskId)).toEqual([
      "task-sync",
      "task-awaiting",
      "task-active",
    ]);
    expect(summary.syncIssueTask?.taskId).toBe("task-sync");
    expect(summary.awaitingPlatformTask?.taskId).toBe("task-awaiting");
    expect(summary.activeTripTask?.taskId).toBe("task-active");
    expect(summary.urgentCount).toBe(2);
    expect(summary.pendingPlatformCount).toBe(1);
    expect(summary.syncIssueCount).toBe(1);
  });
});
