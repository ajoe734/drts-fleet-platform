import type { DriverTaskRecord } from "@drts/contracts";

export type TripPrimaryActionKey =
  | "accept"
  | "depart"
  | "arrived"
  | "start"
  | "complete";

export interface TripPrimaryActionDescriptor {
  action: TripPrimaryActionKey;
  label: string;
  title: string;
  helperText: string;
}

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

export function getPrimaryTripAction(
  task: DriverTaskRecord | null,
): TripPrimaryActionDescriptor | null {
  if (!task || isForwardedTask(task)) {
    return null;
  }

  let action: TripPrimaryActionKey | null = null;

  switch (task.status) {
    case "pending_acceptance":
      action = "accept";
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
): boolean {
  return getPrimaryTripAction(task)?.action === "complete";
}
