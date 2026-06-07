import type {
  CallRecordingState,
  CallbackTaskStatus,
  CallSessionStatus,
  OwnedOrderStatus,
} from "@drts/contracts";

const ORDER_STATUS_LABELS: Record<OwnedOrderStatus, string> = {
  created: "已建立",
  recording_pending: "待補錄音",
  ready_for_dispatch: "可派遣",
  preassigned: "已預先指派",
  assigned: "已指派",
  driver_accepted: "司機已接受",
  enroute_pickup: "前往上車地點",
  arrived_pickup: "已抵達上車地點",
  on_trip: "行程中",
  proof_pending: "待補完成證明",
  completed: "已完成",
  cancelled: "已取消",
  redispatch_required: "需重新派遣",
  dispatch_failed: "派遣失敗",
  dispatch_timeout: "派遣逾時",
  no_supply: "暫無可用車輛",
  delayed_queue: "延後佇列",
  exception_hold: "例外暫停",
};

const CALL_SESSION_STATUS_LABELS: Record<CallSessionStatus, string> = {
  active: "進行中",
  closed: "已關閉",
};

const RECORDING_STATE_LABELS: Record<CallRecordingState, string> = {
  ready: "錄音已就緒",
  pending: "錄音待補",
  missing: "錄音缺失",
};

const CALLBACK_STATUS_LABELS: Record<CallbackTaskStatus, string> = {
  pending: "待回覆",
  completed: "已完成",
};

const FLAG_LABELS: Record<string, string> = {
  closed: "通話已關閉",
  recording_bound: "錄音已綁定",
  recording_missing: "錄音缺失",
  recording_pending: "錄音待補",
  recording_pending_callback: "待錄音回補",
};

const TRACE_EVENT_LABELS: Record<string, string> = {
  "dispatch.assigned": "派遣已指派",
  "dispatch.reassigned": "派遣已重新指派",
  "dispatch.redispatch_required": "需要重新派遣",
  "driver.completed_trip": "司機完成行程",
  "driver.proof_pending": "司機完成證明待補",
  "exception_hold.override_approved": "例外暫停覆核通過",
  "exception_hold.override_expired": "例外暫停覆核逾時",
  "exception_hold.override_rejected": "例外暫停覆核拒絕",
  "exception_hold.override_requested": "已提出例外暫停覆核",
  "exception_hold.resolved.release": "例外暫停已解除",
  "order.cancelled": "訂單已取消",
  "order.completed": "訂單已完成",
  "order.created": "訂單已建立",
  "order.exception_hold": "訂單進入例外暫停",
  "pricing.manual_override": "費用已手動調整",
  "queue.entry.closed": "佇列項目已關閉",
  "queue.entry.created": "佇列項目已建立",
  "reservation.hold.released": "預約保留已解除",
};

export function formatOrderStatus(status: OwnedOrderStatus | string) {
  return ORDER_STATUS_LABELS[status as OwnedOrderStatus] ?? "訂單狀態已更新";
}

export function formatCallSessionStatus(status: CallSessionStatus | string) {
  return (
    CALL_SESSION_STATUS_LABELS[status as CallSessionStatus] ?? "通話狀態已更新"
  );
}

export function formatRecordingState(state: CallRecordingState | string) {
  return (
    RECORDING_STATE_LABELS[state as CallRecordingState] ?? "錄音狀態已更新"
  );
}

export function formatCallbackTaskStatus(
  status: CallbackTaskStatus | string | null | undefined,
) {
  if (!status) {
    return "尚無回覆任務";
  }
  return (
    CALLBACK_STATUS_LABELS[status as CallbackTaskStatus] ?? "回覆狀態已更新"
  );
}

export function formatComplianceFlags(flags: readonly string[]) {
  if (flags.length === 0) {
    return "無特殊合規註記";
  }
  return flags.map((flag) => FLAG_LABELS[flag] ?? "系統合規註記").join("、");
}

export function formatTraceEventLabel(eventType: string) {
  return TRACE_EVENT_LABELS[eventType] ?? "系統事件";
}

export function formatTraceMessage(eventType: string, message: string) {
  const asciiOnly = Array.from(message).every(
    (character) => character.charCodeAt(0) <= 0x7f,
  );
  if (
    message === eventType ||
    /^[a-z0-9._-]+$/i.test(message.trim()) ||
    asciiOnly
  ) {
    return formatTraceEventLabel(eventType);
  }
  return message;
}
