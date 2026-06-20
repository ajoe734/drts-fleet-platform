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
    const listDriverShifts = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      getDriverId: () => "driver-001",
      getDriverIdentityIssue: () => null,
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => false,
      listDriverShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("routed");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).toHaveBeenCalledTimes(1);
    expect(listDriverShifts).not.toHaveBeenCalled();
    expect(listDriverTasks).not.toHaveBeenCalled();
  });

  it("keeps onboarding mounted while an unprovisioned device waits for registration", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn();
    const listDriverShifts = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      allowUnprovisionedRoute: true,
      getDriverId: () => "driver-001",
      getDriverIdentityIssue: () => null,
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => false,
      listDriverShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("synced");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).not.toHaveBeenCalled();
    expect(listDriverShifts).not.toHaveBeenCalled();
    expect(listDriverTasks).not.toHaveBeenCalled();
  });

  it("routes revoked bindings back to onboarding after revalidation clears the session", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn();
    const listDriverShifts = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      getDriverId: () => "driver-001",
      getDriverIdentityIssue: () =>
        "This device binding has been revoked. Re-register this device.",
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => false,
      listDriverShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("routed");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).toHaveBeenCalledTimes(1);
    expect(listDriverShifts).not.toHaveBeenCalled();
    expect(listDriverTasks).not.toHaveBeenCalled();
  });

  it("routes suspended drivers back to onboarding after foreground refresh fails", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn();
    const listDriverShifts = vi.fn();

    const result = await syncDriverIdentityBootstrap({
      getDriverId: () => "driver-001",
      getDriverIdentityIssue: () =>
        "This driver has been suspended and cannot refresh the device login.",
      initializeDriverIdentity: async () => {
        throw new Error("API error 403");
      },
      isDriverIdentityProvisioned: () => false,
      listDriverShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("routed");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith(null);
    expect(resetDriverAppToOnboarding).toHaveBeenCalledTimes(1);
    expect(listDriverShifts).not.toHaveBeenCalled();
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
    const listDriverShifts = vi.fn().mockResolvedValue([]);

    const result = await syncDriverIdentityBootstrap({
      getDriverId: () => "driver-001",
      getDriverIdentityIssue: () => null,
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => true,
      listDriverShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("synced");
    expect(listDriverShifts).toHaveBeenCalledTimes(1);
    expect(listDriverTasks).toHaveBeenCalledTimes(1);
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith({
      workState: "on_trip",
      taskId: "task-001",
      driverId: "driver-001",
    });
    expect(resetDriverAppToOnboarding).not.toHaveBeenCalled();
  });

  it("keeps background heartbeat active for online available drivers during an active shift", async () => {
    const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);
    const resetDriverAppToOnboarding = vi.fn();
    const listDriverTasks = vi.fn().mockResolvedValue([]);
    const listDriverShifts = vi.fn().mockResolvedValue([
      {
        shiftId: "shift-001",
        status: "active",
      },
    ]);

    const result = await syncDriverIdentityBootstrap({
      getDriverId: () => "driver-001",
      getDriverIdentityIssue: () => null,
      initializeDriverIdentity: async () => {},
      isDriverIdentityProvisioned: () => true,
      listDriverShifts,
      listDriverTasks,
      resetDriverAppToOnboarding,
      router: createRouter(),
      syncDriverLocationHeartbeat,
    });

    expect(result).toBe("synced");
    expect(syncDriverLocationHeartbeat).toHaveBeenCalledWith({
      driverId: "driver-001",
      taskId: null,
      workState: "online_available",
    });
    expect(resetDriverAppToOnboarding).not.toHaveBeenCalled();
  });
});
