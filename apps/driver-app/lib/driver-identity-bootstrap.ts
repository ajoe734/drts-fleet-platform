import type { DriverOnboardingRouter } from "@/lib/driver-identity-routing";

type DriverTaskLike = {
  taskId: string;
  driverId: string;
  status: string;
};

type DriverHeartbeatAssignment = {
  taskId: string;
  driverId: string;
} | null;

type DriverIdentityBootstrapDeps = {
  cancelled?: () => boolean;
  getDriverIdentityIssue: () => string | null;
  initializeDriverIdentity: () => Promise<void>;
  isDriverIdentityProvisioned: () => boolean;
  listDriverTasks: () => Promise<DriverTaskLike[]>;
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
  const routeToOnboardingIfIdentityInvalid = async () => {
    if (
      deps.cancelled?.() ||
      deps.isDriverIdentityProvisioned() ||
      !deps.getDriverIdentityIssue()
    ) {
      return false;
    }

    await deps.syncDriverLocationHeartbeat(null);
    deps.resetDriverAppToOnboarding(deps.router);
    return true;
  };

  try {
    await deps.initializeDriverIdentity();

    if (await routeToOnboardingIfIdentityInvalid()) {
      return "routed";
    }

    const tasks = await deps.listDriverTasks();
    if (deps.cancelled?.()) {
      return "synced";
    }

    const activeTask = tasks.find((task) => task.status === "on_trip") ?? null;
    await deps.syncDriverLocationHeartbeat(
      activeTask
        ? {
            taskId: activeTask.taskId,
            driverId: activeTask.driverId,
          }
        : null,
    );
    return "synced";
  } catch (error) {
    if (await routeToOnboardingIfIdentityInvalid()) {
      return "routed";
    }

    deps.onWarning?.(error);
    return "synced";
  }
}
