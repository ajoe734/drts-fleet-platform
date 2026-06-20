import type { DriverOnboardingRouter } from "@/lib/driver-identity-routing";

type DriverTaskLike = {
  taskId: string;
  driverId: string;
  status: string;
};

type ShiftLike = {
  status: string;
};

export type DriverHeartbeatAssignment = {
  driverId: string;
  taskId: string | null;
  workState: "available" | "assigned" | "enroute" | "arrived" | "on_trip";
} | null;

export function resolveHeartbeatContext(
  tasks: DriverTaskLike[],
  shifts: ShiftLike[],
  driverId: string,
): DriverHeartbeatAssignment {
  const prioritizedTask =
    tasks.find((task) => task.status === "on_trip") ??
    tasks.find((task) => task.status === "arrived_pickup") ??
    tasks.find((task) => task.status === "enroute_pickup") ??
    tasks.find((task) => task.status === "accepted") ??
    tasks.find((task) => task.status === "pending_acceptance") ??
    null;

  if (prioritizedTask) {
    const workState =
      prioritizedTask.status === "on_trip"
        ? "on_trip"
        : prioritizedTask.status === "arrived_pickup"
          ? "arrived"
          : prioritizedTask.status === "enroute_pickup"
            ? "enroute"
            : "assigned";

    return {
      driverId: prioritizedTask.driverId,
      taskId: prioritizedTask.taskId,
      workState,
    };
  }

  const activeShift = shifts.find((shift) => shift.status === "active");
  if (!activeShift) {
    return null;
  }

  return {
    driverId,
    taskId: null,
    workState: "available",
  };
}

type DriverIdentityBootstrapDeps = {
  allowUnprovisionedRoute?: boolean;
  cancelled?: () => boolean;
  getDriverIdentityIssue: () => string | null;
  getDriverId: () => string;
  initializeDriverIdentity: () => Promise<void>;
  isDriverIdentityProvisioned: () => boolean;
  listDriverTasks: () => Promise<DriverTaskLike[]>;
  listShifts: () => Promise<ShiftLike[]>;
  onWarning?: (error: unknown) => void;
  resetDriverAppToOnboarding: (router: DriverOnboardingRouter) => void;
  router: DriverOnboardingRouter;
  syncDriverLocationHeartbeat: (
    assignment: DriverHeartbeatAssignment,
  ) => Promise<unknown>;
};

export async function syncDriverIdentityBootstrap(
  deps: DriverIdentityBootstrapDeps,
): Promise<"synced" | "routed"> {
  const handleUnprovisionedIdentity = async (): Promise<
    "continue" | "hold" | "routed"
  > => {
    if (deps.cancelled?.() || deps.isDriverIdentityProvisioned()) {
      return "continue";
    }

    await deps.syncDriverLocationHeartbeat(null);

    if (deps.allowUnprovisionedRoute) {
      return "hold";
    }

    deps.resetDriverAppToOnboarding(deps.router);
    return "routed";
  };

  try {
    await deps.initializeDriverIdentity();

    const unprovisionedIdentityResult = await handleUnprovisionedIdentity();
    if (unprovisionedIdentityResult === "routed") {
      return "routed";
    }
    if (unprovisionedIdentityResult === "hold") {
      return "synced";
    }

    const tasks = await deps.listDriverTasks();
    if (deps.cancelled?.()) {
      return "synced";
    }

    const shifts = await deps.listShifts();
    if (deps.cancelled?.()) {
      return "synced";
    }

    await deps.syncDriverLocationHeartbeat(
      resolveHeartbeatContext(tasks, shifts, deps.getDriverId()),
    );
    return "synced";
  } catch (error) {
    const unprovisionedIdentityResult = await handleUnprovisionedIdentity();
    if (unprovisionedIdentityResult === "routed") {
      return "routed";
    }
    if (unprovisionedIdentityResult === "hold") {
      return "synced";
    }

    deps.onWarning?.(error);
    return "synced";
  }
}
