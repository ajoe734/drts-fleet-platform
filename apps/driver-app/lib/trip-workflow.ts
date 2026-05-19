import type { DriverTaskRecord } from "@drts/contracts";

export type TripPrimaryActionKey =
  | "accept"
  | "depart"
  | "arrived"
  | "start"
  | "complete";

export type TripExperienceState =
  | "owned_active"
  | "forwarded_offered"
  | "forwarded_pending"
  | "forwarded_confirmed"
  | "forwarded_completed"
  | "forwarded_lost"
  | "forwarded_cancelled"
  | "sync_failed";

export interface TripPrimaryActionDescriptor {
  action: TripPrimaryActionKey;
  label: string;
  title: string;
  helperText: string;
}

type ForwardedBlockingTripState =
  | "forwarded_offered"
  | "forwarded_pending"
  | "forwarded_completed"
  | "forwarded_lost"
  | "forwarded_cancelled"
  | "sync_failed";

const TRIP_PRIMARY_ACTIONS: Record<
  TripPrimaryActionKey,
  Omit<TripPrimaryActionDescriptor, "action">
> = {
  accept: {
    label: "接受任務",
    title: "先確認接單",
    helperText: "確認後才會進入接送流程，避免錯過派遣時效。",
  },
  depart: {
    label: "前往接送點",
    title: "開始前往上車點",
    helperText: "接單完成後，請立即前往乘客或指定接送地點。",
  },
  arrived: {
    label: "抵達上車點",
    title: "回報已抵達",
    helperText: "抵達後回報，才能進入正式載客行程。",
  },
  start: {
    label: "開始行程",
    title: "確認乘客上車後出發",
    helperText: "行程開始後會啟用里程與時長追蹤。",
  },
  complete: {
    label: "完成行程",
    title: "補齊佐證後完單",
    helperText: "請先確認照片、簽收或費用佐證完整，再送出完單。",
  },
};

function isForwardedTask(task: DriverTaskRecord | null): boolean {
  return task?.sourcePlatform != null;
}

function getRuntimeTaskStatus(task: DriverTaskRecord | null): string | null {
  const status = (task as { status?: unknown } | null)?.status;
  return typeof status === "string" ? status : null;
}

function getForwardedRuntimeStatus(
  task: DriverTaskRecord | null,
): string | null {
  if (!task) {
    return null;
  }

  const candidates = [
    (task as { forwardedStatus?: unknown }).forwardedStatus,
    (task as { forwardedOrderStatus?: unknown }).forwardedOrderStatus,
    (task as { platformStatus?: unknown }).platformStatus,
    (task as { nativeStatus?: unknown }).nativeStatus,
    (task as { mirrorStatus?: unknown }).mirrorStatus,
    (task as { sourceStatus?: unknown }).sourceStatus,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  const manualFallbackRequired = (
    task as {
      manualFallback?: { required?: unknown };
    }
  ).manualFallback?.required;
  if (manualFallbackRequired === true) {
    return "sync_failed";
  }

  const syncIssue =
    (task as { lastSyncError?: unknown }).lastSyncError ??
    (task as { syncIssue?: unknown }).syncIssue;
  if (syncIssue) {
    return "sync_failed";
  }

  return null;
}

export function getTripExperienceState(
  task: DriverTaskRecord | null,
): TripExperienceState | null {
  if (!task) {
    return null;
  }

  if (!isForwardedTask(task)) {
    return "owned_active";
  }

  const forwardedStatus = getForwardedRuntimeStatus(task);
  const runtimeStatus = getRuntimeTaskStatus(task);

  switch (forwardedStatus) {
    case "accept_pending":
      return "forwarded_pending";
    case "confirmed_by_platform":
    case "confirmed":
      return "forwarded_confirmed";
    case "completed_synced":
      return "forwarded_completed";
    case "lost_race":
    case "taken":
      return "forwarded_lost";
    case "cancelled_by_platform":
      return "forwarded_cancelled";
    case "sync_failed":
      return "sync_failed";
  }

  if (runtimeStatus === "cancelled" || runtimeStatus === "rejected") {
    return "forwarded_cancelled";
  }

  if (runtimeStatus === "completed") {
    return "forwarded_completed";
  }

  if (
    runtimeStatus === "accepted" ||
    runtimeStatus === "enroute_pickup" ||
    runtimeStatus === "arrived_pickup" ||
    runtimeStatus === "on_trip" ||
    runtimeStatus === "proof_pending" ||
    (runtimeStatus === "pending_acceptance" && Boolean(task.acceptedAt))
  ) {
    return "forwarded_confirmed";
  }

  return "forwarded_offered";
}

export function getPrimaryTripAction(
  task: DriverTaskRecord | null,
  experienceState: TripExperienceState | null = getTripExperienceState(task),
): TripPrimaryActionDescriptor | null {
  if (!task || !experienceState) {
    return null;
  }

  const blockedForwardedStates: ForwardedBlockingTripState[] = [
    "forwarded_offered",
    "forwarded_pending",
    "forwarded_completed",
    "forwarded_lost",
    "forwarded_cancelled",
    "sync_failed",
  ];

  if (
    blockedForwardedStates.includes(
      experienceState as ForwardedBlockingTripState,
    )
  ) {
    return null;
  }

  const runtimeStatus = getRuntimeTaskStatus(task);
  let action: TripPrimaryActionKey | null = null;

  switch (runtimeStatus) {
    case "pending_acceptance":
      action = experienceState === "forwarded_confirmed" ? "depart" : "accept";
      break;
    case "accepted":
      action = "depart";
      break;
    case "enroute_pickup":
      action = "arrived";
      break;
    case "arrived_pickup":
      action = "start";
      break;
    case "on_trip":
    case "proof_pending":
      action = "complete";
      break;
    default:
      action = null;
      break;
  }

  if (!action) {
    return null;
  }

  return {
    action,
    ...TRIP_PRIMARY_ACTIONS[action],
  };
}

export function shouldShowTripCompletionProof(
  task: DriverTaskRecord | null,
  experienceState?: TripExperienceState | null,
): boolean {
  return getPrimaryTripAction(task, experienceState)?.action === "complete";
}
