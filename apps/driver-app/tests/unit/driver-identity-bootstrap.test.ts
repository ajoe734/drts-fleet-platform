import { describe, expect, it, vi } from "vitest";

import { syncDriverIdentityBootstrap } from "../../lib/driver-identity-bootstrap";

function createRouter() {
  return {
    canDismiss: () => true,
    dismissAll: vi.fn(),
    replace: vi.fn(),
  };
}

describe("syncDriverIdentityBootstrap", () => {
  it("routes fresh unprovisioned deep links back to onboarding before loading tasks", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      getDriverIdentityIssue: () => null,
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => false,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("routed");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).toHaveBeenCalledTimes(1);
    expect(listDriverTasks).not.toHaveBeenCalled();
  });

  it("keeps onboarding mounted while an unprovisioned device waits for registration", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      allowUnprovisionedRoute: true,
      getDriverIdentityIssue: () => null,
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => false,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("synced");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).not.toHaveBeenCalled();
    expect(listDriverTasks).not.toHaveBeenCalled();
  });

  it("routes revoked bindings back to onboarding after revalidation clears the session", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      getDriverIdentityIssue: () =>
        "This device binding has been revoked. Re-register this device.",
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => false,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("routed");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).toHaveBeenCalledTimes(1);
    expect(listDriverTasks).not.toHaveBeenCalled();
  });

  it("routes suspended drivers back to onboarding after foreground refresh fails", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      getDriverIdentityIssue: () =>
        "This driver has been suspended and cannot refresh the device login.",
      initializeDriverIdentity: async () => {
        throw new Error("API error 403");
      },
      isDriverIdentityProvisioned: () => false,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("routed");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).toHaveBeenCalledTimes(1);
    expect(listDriverTasks).not.toHaveBeenCalled();
  });

  it("syncs the active trip heartbeat when the driver session remains valid", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn().mockResolvedValue([
      {
        taskId: "task-001",
        driverId: "driver-001",
        status: "on_trip",
      },
      {
        taskId: "task-002",
        driverId: "driver-001",
        status: "queued",
      },
    ]);

    const result = await syncDriverIdentityBootstrap({
      getDriverIdentityIssue: () => null,
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => true,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("synced");
    expect(listDriverTasks).toHaveBeenCalledTimes(1);
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith({
      taskId: "task-001",
      driverId: "driver-001",
      status: "on_trip",
    });
    expect(resetDriverAppToOnboarding).not.toHaveBeenCalled();
  });

  it("evaluates tracking recovery for the active task before resuming heartbeats", async () => {
    const callOrder: string[] = [];
    const evaluateTrackingRecovery = vi.fn(async () => {
      callOrder.push("recovery");
    });
    const syncDriverLocationHeartbeat = vi.fn(async () => {
      callOrder.push("sync");
    });
    const listDriverTasks = vi
      .fn()
      .mockResolvedValue([
        {
          taskId: "task-001",
          driverId: "driver-001",
          status: "enroute_pickup",
        },
      ]);

    const result = await syncDriverIdentityBootstrap({
      getDriverIdentityIssue: () => null,
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => true,
      listDriverTasks,
      resetDriverAppToOnboarding: vi.fn(),
      router: createRouter(),
      syncDriverLocationHeartbeat,
      evaluateTrackingRecovery,
    });

    expect(result).toBe("synced");
    expect(evaluateTrackingRecovery).toHaveBeenCalledWith({
      activeAssignment: { taskId: "task-001", driverId: "driver-001" },
    });
    // Recovery must run before the new fixes re-baseline the marker.
    expect(callOrder).toEqual(["recovery", "sync"]);
  });

  it("evaluates tracking recovery with no active assignment when no trip is active", async () => {
    const evaluateTrackingRecovery = vi.fn().mockResolvedValue(undefined);
    const listDriverTasks = vi
      .fn()
      .mockResolvedValue([
        { taskId: "task-002", driverId: "driver-001", status: "queued" },
      ]);

    await syncDriverIdentityBootstrap({
      getDriverIdentityIssue: () => null,
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => true,
      listDriverTasks,
      resetDriverAppToOnboarding: vi.fn(),
      router: createRouter(),
      syncDriverLocationHeartbeat: vi.fn().mockResolvedValue(undefined),
      evaluateTrackingRecovery,
    });

    expect(evaluateTrackingRecovery).toHaveBeenCalledWith({
      activeAssignment: null,
    });
  });
});
