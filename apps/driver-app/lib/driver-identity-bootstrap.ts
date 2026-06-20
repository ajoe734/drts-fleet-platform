import type { DriverOnboardingRouter } from "@/lib/driver-identity-routing";

type DriverTaskLike = {
  taskId: string;
  driverId: string;
  status: string;
};

type DriverShiftLike = {
  shiftId: string;
  status: string;
};

type DriverIdentityBootstrapDeps = {
  allowUnprovisionedRoute?: boolean;
  cancelled?: () => boolean;
  getDriverId: () => string;
  getDriverIdentityIssue: () => string | null;
  initializeDriverIdentity: () => Promise<void>;
  isDriverIdentityProvisioned: () => boolean;
  listDriverShifts: () => Promise<DriverShiftLike[]>;
  listDriverTasks: () => Promise<DriverTaskLike[]>;
  onWarning?: (error: unknown) => void;
  resetDriverAppToOnboarding: (router: DriverOnboardingRouter) => void;
  router: DriverOnboardingRouter;
  syncDriverLocationHeartbeat: (profile: {
    driverId: string;
    taskId: string | null;
    workState:
      | "online_available"
      | "assigned"
      | "enroute_to_pickup"
      | "arrived_pickup"
      | "on_trip";
  } | null) => Promise<unknown>;
};

function resolveHeartbeatProfile(
  tasks: DriverTaskLike[],
  shifts: DriverShiftLike[],
  driverId: string,
) {
  const relevantTasks = tasks.filter((task) => task.driverId === driverId);
  const priorityStatuses = [
    "on_trip",
    "arrived_pickup",
    "enroute_pickup",
    "accepted",
    "pending_acceptance",
  ] as const;

  for (const status of priorityStatuses) {
    const task = relevantTasks.find((candidate) => candidate.status === status);
    if (!task) {
      continue;
    }

    return {
      driverId: task.driverId,
      taskId: task.taskId,
      workState:
        status === "on_trip"
          ? "on_trip"
          : status === "arrived_pickup"
            ? "arrived_pickup"
            : status === "enroute_pickup"
              ? "enroute_to_pickup"
              : "assigned",
    } as const;
  }

  const activeShift = shifts.find((shift) => shift.status === "active");
  if (!activeShift) {
    return null;
  }

  return {
    driverId,
    taskId: null,
    workState: "online_available",
  } as const;
}

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

    const [tasks, shifts] = await Promise.all([
      deps.listDriverTasks(),
      deps.listDriverShifts(),
    ]);
    if (deps.cancelled?.()) {
      return "synced";
    }

    await deps.syncDriverLocationHeartbeat(
      resolveHeartbeatProfile(tasks, shifts, deps.getDriverId()),
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
