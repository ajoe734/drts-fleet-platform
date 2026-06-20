import type { DriverOnboardingRouter } from "@/lib/driver-identity-routing";

type DriverTaskLike = {
  taskId: string;
  driverId: string;
  status: string;
};

type DriverHeartbeatAssignment = {
  taskId: string;
  driverId: string;
  status: string;
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
  /**
   * Restart-recovery hook (MOB-APP-004). Runs after the active task is resolved
   * but before tracking resumes, so any tracking gap is detected against the
   * persisted marker before fresh fixes re-baseline it.
   */
  evaluateTrackingRecovery?: (input: {
    activeAssignment: { taskId: string; driverId: string } | null;
  }) => Promise<unknown>;
};

const ACTIVE_HEARTBEAT_TASK_STATUSES = new Set([
  "accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

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

    const activeTask =
      tasks.find((task) => ACTIVE_HEARTBEAT_TASK_STATUSES.has(task.status)) ??
      null;

    await deps.evaluateTrackingRecovery?.({
      activeAssignment: activeTask
        ? { taskId: activeTask.taskId, driverId: activeTask.driverId }
        : null,
    });

    await deps.syncDriverLocationHeartbeat(
      activeTask
        ? {
            taskId: activeTask.taskId,
            driverId: activeTask.driverId,
            status: activeTask.status,
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
