import type {
  DriverTaskAction,
  DriverTaskRecord,
  EmptyReason,
  PlatformPresenceSummary,
  UnifiedDriverTaskView,
} from "@drts/contracts";

import { summarizeWorkspaceTasks } from "@/lib/driver-workspace-cockpit";
import type { TripExperienceState } from "@/lib/trip-workflow";

export type TripEmptyReason = Exclude<EmptyReason, "filtered_empty">;

const TRIP_PRIMARY_ACTION_PRIORITY: readonly DriverTaskAction[] = [
  "accept",
  "depart",
  "arrived_pickup",
  "start",
  "complete",
];

function normalizeStateCode(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}

export function selectTripTaskView(
  tasks: ReadonlyArray<UnifiedDriverTaskView>,
  requestedTaskId?: string | null,
): UnifiedDriverTaskView | null {
  if (tasks.length === 0) {
    return null;
  }

  const normalizedRequestedTaskId = requestedTaskId?.trim();
  if (normalizedRequestedTaskId) {
    const requestedTask =
      tasks.find((task) => task.taskId === normalizedRequestedTaskId) ?? null;
    if (requestedTask) {
      return requestedTask;
    }
  }

  const summary = summarizeWorkspaceTasks(tasks);
  return (
    summary.activeTripTask ??
    summary.actionRequiredTask ??
    summary.awaitingPlatformTask ??
    summary.syncIssueTask ??
    summary.orderedTasks[0] ??
    null
  );
}

export function getTripExperienceStateFromView(
  taskView: UnifiedDriverTaskView | null,
): TripExperienceState | null {
  if (!taskView) {
    return null;
  }

  if (taskView.orderDomain === "owned") {
    return "owned_active";
  }

  const nativeStatus = normalizeStateCode(taskView.nativeStatus);
  const localStatus = normalizeStateCode(String(taskView.localStatus));

  if (
    taskView.requiresManualFallback ||
    nativeStatus === "manual_fallback" ||
    localStatus === "manual_fallback"
  ) {
    return "manual_fallback";
  }

  if (
    taskView.driverActionState === "blocked" ||
    nativeStatus === "sync_failed" ||
    localStatus === "sync_failed"
  ) {
    return "sync_failed";
  }

  if (
    nativeStatus === "lost_race" ||
    nativeStatus === "taken" ||
    localStatus === "lost_race"
  ) {
    return "forwarded_lost";
  }

  if (
    nativeStatus === "cancelled_by_platform" ||
    nativeStatus === "cancelled" ||
    localStatus === "cancelled_by_platform" ||
    localStatus === "cancelled" ||
    localStatus === "rejected"
  ) {
    return "forwarded_cancelled";
  }

  if (
    nativeStatus === "completed_synced" ||
    localStatus === "completed_synced" ||
    localStatus === "completed"
  ) {
    return "forwarded_completed";
  }

  switch (taskView.driverActionState) {
    case "action_required":
      return "forwarded_offered";
    case "awaiting_platform":
      return "forwarded_pending";
    case "in_progress":
      return "forwarded_confirmed";
    case "read_only":
    case "completed":
      return "forwarded_completed";
    default:
      return "forwarded_offered";
  }
}

export function resolveTripEmptyReason(input: {
  fetchFailed?: boolean;
  platformSummary: PlatformPresenceSummary | null;
  tasksEnabled: boolean;
}): TripEmptyReason {
  if (input.fetchFailed) {
    return "fetch_failed";
  }

  if (!input.tasksEnabled) {
    return "permission_denied";
  }

  const presences = input.platformSummary?.presences ?? [];
  if (
    presences.length === 0 ||
    presences.every((presence) => !presence.accountId?.trim())
  ) {
    return "not_provisioned";
  }

  if (
    presences.length > 0 &&
    presences.every((presence) => presence.eligibility === "ineligible")
  ) {
    return "driver_not_eligible";
  }

  const adapterStatuses = input.platformSummary?.adapterStatuses ?? [];
  if (
    adapterStatuses.length > 0 &&
    adapterStatuses.every(
      (status) => status.status === "down" || status.status === "degraded",
    )
  ) {
    return "external_unavailable";
  }

  return "no_data";
}

export function resolveForwardedAcceptPendingDeadlineMs(
  taskView: UnifiedDriverTaskView | null,
  taskDetail: DriverTaskRecord | null,
): number | null {
  if (!taskView || taskView.driverActionState !== "awaiting_platform") {
    return null;
  }

  const acceptedAtMs = Date.parse(taskDetail?.acceptedAt ?? taskView.updatedAt);
  const explicitDeadlineMs = taskView.deadlineAt
    ? Date.parse(taskView.deadlineAt)
    : Number.NaN;
  if (
    Number.isFinite(explicitDeadlineMs) &&
    Number.isFinite(acceptedAtMs) &&
    explicitDeadlineMs > acceptedAtMs + 1_000
  ) {
    return explicitDeadlineMs;
  }

  const basisMs = Number.isFinite(acceptedAtMs)
    ? acceptedAtMs
    : explicitDeadlineMs;
  if (!Number.isFinite(basisMs)) {
    return null;
  }

  return basisMs + 30_000;
}

export function getTripPrimaryAction(
  taskView: UnifiedDriverTaskView | null,
): DriverTaskAction | null {
  if (!taskView) {
    return null;
  }

  for (const action of TRIP_PRIMARY_ACTION_PRIORITY) {
    if (taskView.allowedActions.includes(action)) {
      return action;
    }
  }

  if (
    taskView.orderDomain === "forwarded" &&
    taskView.allowedActions.includes("reject")
  ) {
    return "reject";
  }

  return null;
}

export function getTripSecondaryAction(
  taskView: UnifiedDriverTaskView | null,
): DriverTaskAction | null {
  if (!taskView || taskView.orderDomain !== "forwarded") {
    return null;
  }

  return taskView.allowedActions.includes("accept") &&
    taskView.allowedActions.includes("reject")
    ? "reject"
    : null;
}

export function shouldShowTripCompletionProof(
  taskView: UnifiedDriverTaskView | null,
): boolean {
  return (
    taskView?.orderDomain === "owned" &&
    getTripPrimaryAction(taskView) === "complete"
  );
}
