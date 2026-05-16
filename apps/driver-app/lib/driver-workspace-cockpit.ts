import {
  PLATFORM_CODE_REGISTRY,
  type DriverTaskAction,
  type DriverTaskRecord,
  type UnifiedDriverTaskView,
} from "@drts/contracts";

const ACTIVE_DRIVER_TASK_STATUSES = new Set([
  "accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPlatformDisplayName(sourcePlatform: string | null): string {
  if (!sourcePlatform || sourcePlatform === "drts") {
    return "DRTS";
  }

  if (sourcePlatform in PLATFORM_CODE_REGISTRY) {
    return PLATFORM_CODE_REGISTRY[
      sourcePlatform as keyof typeof PLATFORM_CODE_REGISTRY
    ].displayName;
  }

  return humanizeCode(sourcePlatform);
}

function normalizeStateCode(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}

function getAllowedActionsFromLegacyTask(
  task: DriverTaskRecord,
  forwarded: boolean,
): DriverTaskAction[] {
  if (forwarded) {
    if (task.status === "pending_acceptance") {
      return ["accept", "reject"];
    }
    return [];
  }

  switch (task.status) {
    case "pending_acceptance":
      return ["accept"];
    case "accepted":
      return ["depart"];
    case "enroute_pickup":
      return ["arrived_pickup"];
    case "arrived_pickup":
      return ["start"];
    case "on_trip":
    case "proof_pending":
      return ["complete"];
    default:
      return [];
  }
}

export function buildFallbackUnifiedDriverTaskView(
  task: DriverTaskRecord,
): UnifiedDriverTaskView {
  const forwarded = task.sourcePlatform != null;

  return {
    taskId: task.taskId,
    orderId: task.orderId,
    orderDomain: forwarded ? "forwarded" : "owned",
    sourcePlatform: forwarded
      ? (task.sourcePlatform as UnifiedDriverTaskView["sourcePlatform"])
      : "drts",
    platformDisplayName: getPlatformDisplayName(task.sourcePlatform),
    externalOrderId: null,
    nativeStatus: null,
    localStatus: task.status,
    driverActionState:
      task.status === "pending_acceptance"
        ? "action_required"
        : ACTIVE_DRIVER_TASK_STATUSES.has(task.status)
          ? "in_progress"
          : task.status === "completed"
            ? "completed"
            : forwarded
              ? "read_only"
              : "blocked",
    allowedActions: getAllowedActionsFromLegacyTask(task, forwarded),
    routeLocked: forwarded || !task.routeProvided,
    fareAuthority: forwarded ? "external_platform" : "drts",
    settlementAuthority: forwarded ? "external_platform" : "drts",
    driverPayoutAuthority: forwarded ? "external_platform" : "drts",
    requiresManualFallback: forwarded,
    requiresReauth: false,
    syncIssueSummary: forwarded
      ? "來源平台原生狀態暫不可用，目前先以本地鏡像資料呈現；若內容異常請聯繫派車台。"
      : null,
    blockingReason: null,
    pickupSummary: null,
    dropoffSummary: null,
    deadlineAt: null,
    updatedAt:
      task.completedAt ||
      task.startedAt ||
      task.arrivedPickupAt ||
      task.departedAt ||
      task.acceptedAt ||
      new Date().toISOString(),
  };
}

export function isOwnedUnifiedTask(task: UnifiedDriverTaskView) {
  return task.sourcePlatform === "drts";
}

export function hasUnifiedTaskSyncIssue(task: UnifiedDriverTaskView) {
  return (
    task.requiresManualFallback ||
    task.requiresReauth ||
    Boolean(task.syncIssueSummary) ||
    normalizeStateCode(task.nativeStatus) === "sync_failed"
  );
}

export function isUnifiedTaskPlatformClosed(task: UnifiedDriverTaskView) {
  if (isOwnedUnifiedTask(task) || hasUnifiedTaskSyncIssue(task)) {
    return false;
  }

  const nativeStatus = normalizeStateCode(task.nativeStatus);
  const localStatus = normalizeStateCode(String(task.localStatus));

  return (
    nativeStatus === "lost_race" ||
    nativeStatus === "taken" ||
    nativeStatus === "cancelled" ||
    nativeStatus === "cancelled_by_platform" ||
    localStatus === "cancelled" ||
    localStatus === "rejected" ||
    task.driverActionState === "read_only"
  );
}

function getTaskPriority(task: UnifiedDriverTaskView) {
  if (hasUnifiedTaskSyncIssue(task)) {
    return 0;
  }

  switch (task.driverActionState) {
    case "action_required":
      return 1;
    case "awaiting_platform":
      return 2;
    case "in_progress":
      return 3;
    case "read_only":
      return 4;
    case "completed":
      return 5;
    default:
      return 6;
  }
}

export function sortUnifiedDriverTasks(
  tasks: ReadonlyArray<UnifiedDriverTaskView>,
): UnifiedDriverTaskView[] {
  return [...tasks].sort((left, right) => {
    const priorityDelta = getTaskPriority(left) - getTaskPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const deadlineLeft = left.deadlineAt
      ? Date.parse(left.deadlineAt)
      : Number.POSITIVE_INFINITY;
    const deadlineRight = right.deadlineAt
      ? Date.parse(right.deadlineAt)
      : Number.POSITIVE_INFINITY;
    if (deadlineLeft !== deadlineRight) {
      return deadlineLeft - deadlineRight;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export interface WorkspaceTaskSummary {
  orderedTasks: UnifiedDriverTaskView[];
  activeTripTask: UnifiedDriverTaskView | null;
  actionRequiredTask: UnifiedDriverTaskView | null;
  awaitingPlatformTask: UnifiedDriverTaskView | null;
  syncIssueTask: UnifiedDriverTaskView | null;
  urgentCount: number;
  pendingCount: number;
  pendingPlatformCount: number;
  syncIssueCount: number;
}

export function summarizeWorkspaceTasks(
  tasks: ReadonlyArray<UnifiedDriverTaskView>,
): WorkspaceTaskSummary {
  const orderedTasks = sortUnifiedDriverTasks(tasks);
  const urgentTasks = orderedTasks.filter(
    (task) =>
      hasUnifiedTaskSyncIssue(task) ||
      task.driverActionState === "action_required" ||
      task.driverActionState === "awaiting_platform",
  );

  return {
    orderedTasks,
    activeTripTask:
      orderedTasks.find((task) => task.driverActionState === "in_progress") ??
      null,
    actionRequiredTask:
      orderedTasks.find(
        (task) => task.driverActionState === "action_required",
      ) ?? null,
    awaitingPlatformTask:
      orderedTasks.find(
        (task) => task.driverActionState === "awaiting_platform",
      ) ?? null,
    syncIssueTask: orderedTasks.find(hasUnifiedTaskSyncIssue) ?? null,
    urgentCount: urgentTasks.length,
    pendingCount: orderedTasks.filter(
      (task) =>
        task.driverActionState !== "completed" &&
        !isUnifiedTaskPlatformClosed(task),
    ).length,
    pendingPlatformCount: orderedTasks.filter(
      (task) => task.driverActionState === "awaiting_platform",
    ).length,
    syncIssueCount: orderedTasks.filter(hasUnifiedTaskSyncIssue).length,
  };
}
