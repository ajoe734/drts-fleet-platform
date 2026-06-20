import { describe, expect, it, vi } from "vitest";

import {
  resolveHeartbeatContext,
  syncDriverIdentityBootstrap,
} from "../../lib/driver-identity-bootstrap";

function createRouter() {
  return {
    canDismiss: () => true,
    dismissAll: vi.fn(),
    replace: vi.fn(),
  };
}

describe("syncDriverIdentityBootstrap", () => {
  it("prioritizes active-task states in dispatch order before falling back to shift availability", () => {
    expect(
      resolveHeartbeatContext(
        [
          {
            taskId: "task-accepted",
            driverId: "driver-001",
            status: "accepted",
          },
          {
            taskId: "task-enroute",
            driverId: "driver-001",
            status: "enroute_pickup",
          },
          {
            taskId: "task-trip",
            driverId: "driver-001",
            status: "on_trip",
          },
        ],
        [{ status: "active" }],
        "driver-001",
      ),
    ).toEqual({
      driverId: "driver-001",
      taskId: "task-trip",
      workState: "on_trip",
    });

    expect(
      resolveHeartbeatContext(
        [
          {
            taskId: "task-arrived",
            driverId: "driver-001",
            status: "arrived_pickup",
          },
        ],
        [{ status: "active" }],
        "driver-001",
      ),
    ).toEqual({
      driverId: "driver-001",
      taskId: "task-arrived",
      workState: "arrived",
    });

    expect(
      resolveHeartbeatContext([], [{ status: "active" }], "driver-001"),
    ).toEqual({
      driverId: "driver-001",
      taskId: null,
      workState: "available",
    });
  });

  it("routes fresh unprovisioned deep links back to onboarding before loading tasks", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn();
    const listShifts = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      getDriverIdentityIssue: () => null,
      getDriverId: () => "driver-001",
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => false,
      listShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("routed");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).toHaveBeenCalledTimes(1);
    expect(listDriverTasks).not.toHaveBeenCalled();
    expect(listShifts).not.toHaveBeenCalled();
  });

  it("keeps onboarding mounted while an unprovisioned device waits for registration", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn();
    const listShifts = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      allowUnprovisionedRoute: true,
      getDriverIdentityIssue: () => null,
      getDriverId: () => "driver-001",
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => false,
      listShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("synced");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).not.toHaveBeenCalled();
    expect(listDriverTasks).not.toHaveBeenCalled();
    expect(listShifts).not.toHaveBeenCalled();
  });

  it("routes revoked bindings back to onboarding after revalidation clears the session", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn();
    const listShifts = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      getDriverIdentityIssue: () =>
        "This device binding has been revoked. Re-register this device.",
      getDriverId: () => "driver-001",
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => false,
      listShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("routed");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).toHaveBeenCalledTimes(1);
    expect(listDriverTasks).not.toHaveBeenCalled();
    expect(listShifts).not.toHaveBeenCalled();
  });

  it("routes suspended drivers back to onboarding after foreground refresh fails", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn();
    const listShifts = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      getDriverIdentityIssue: () =>
        "This driver has been suspended and cannot refresh the device login.",
      getDriverId: () => "driver-001",
      initializeDriverIdentity: async () => {
        throw new Error("API error 403");
      },
      isDriverIdentityProvisioned: () => false,
      listShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("routed");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).toHaveBeenCalledTimes(1);
    expect(listDriverTasks).not.toHaveBeenCalled();
    expect(listShifts).not.toHaveBeenCalled();
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
    const listShifts = vi.fn().mockResolvedValue([]);

    const result = await syncDriverIdentityBootstrap({
      getDriverIdentityIssue: () => null,
      getDriverId: () => "driver-001",
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => true,
      listShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("synced");
    expect(listDriverTasks).toHaveBeenCalledTimes(1);
    expect(listShifts).toHaveBeenCalledTimes(1);
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith({
      driverId: "driver-001",
      taskId: "task-001",
      workState: "on_trip",
    });
    expect(resetDriverAppToOnboarding).not.toHaveBeenCalled();
  });

  it("starts online-available tracking when an active shift exists without an active trip", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn().mockResolvedValue([
      {
        taskId: "task-100",
        driverId: "driver-001",
        status: "completed",
      },
    ]);
    const listShifts = vi.fn().mockResolvedValue([{ status: "active" }]);

    const result = await syncDriverIdentityBootstrap({
      getDriverIdentityIssue: () => null,
      getDriverId: () => "driver-001",
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => true,
      listShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("synced");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith({
      driverId: "driver-001",
      taskId: null,
      workState: "available",
    });
    expect(resetDriverAppToOnboarding).not.toHaveBeenCalled();
  });
});
