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
  allowUnprovisionedRoute?: boolean;
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
