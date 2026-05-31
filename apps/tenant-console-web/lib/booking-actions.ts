import type { BookingRecord, ResourceActionDescriptor } from "@drts/contracts";
import { formatDateTime, isFutureIso } from "./formatters";

/**
 * Editability resolution for the booking detail screen.
 *
 * Per Q-TEN05 / packet §3.5, tenant booking editability is backend-driven:
 * CTAs come from `data.availableActions[]` combined with `editableUntil`, and
 * the UI must NOT compute editability from `status`/`orderStatus` alone. When
 * the backend has not yet populated `availableActions` (the field is optional
 * during rollout), we fall back to the legacy modify/cancel-window heuristic
 * so the screen still degrades gracefully.
 */

/** Human-readable zh labels for the machine `readOnlyReasonCode` values. */
const READ_ONLY_REASON_LABELS: Record<string, string> = {
  past_editable_until: "已超過可編輯截止時間",
  terminal_state: "訂單已完成或取消，無法再變更",
  dispatch_in_progress: "派遣進行中，租戶端已無法編輯",
  pending_external_confirmation: "command 已受理，等待外部確認中",
  approval_required: "需通過審批後才能變更",
  permission_denied: "目前角色沒有此操作權限",
};

/** Map a `disabledReasonCode` / `readOnlyReasonCode` to a zh sentence. */
export function describeReasonCode(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }
  return READ_ONLY_REASON_LABELS[code] ?? code;
}

/** Find a single descriptor by action name within `availableActions`. */
export function findAction(
  booking: BookingRecord,
  action: string,
): ResourceActionDescriptor | null {
  return (
    booking.availableActions?.find(
      (descriptor) => descriptor.action === action,
    ) ?? null
  );
}

export type ResolvedCommand = {
  /** Whether the affordance should be enabled. */
  enabled: boolean;
  /** Whether the affordance should be shown at all (always true once derived). */
  present: boolean;
  /** zh note explaining a disabled affordance, or null when enabled. */
  reason: string | null;
  /** Risk level driving the confirmation pattern (Q-X09). */
  riskLevel: ResourceActionDescriptor["riskLevel"];
  /** Whether confirmation must collect a non-empty reason string. */
  requiresReason: boolean;
};

export type BookingEditability = {
  /** True when the backend supplied `availableActions` (authoritative). */
  backendDriven: boolean;
  update: ResolvedCommand;
  cancel: ResolvedCommand;
  /** editableUntil ISO string, or null when read-only. */
  editableUntil: string | null;
  /** machine reason code when read-only, or null. */
  readOnlyReasonCode: string | null;
  /** True when the latest command is in accepted+pending external state. */
  acceptedPending: boolean;
};

/**
 * Resolve the booking's editability + per-action CTA state. Prefers
 * `availableActions` (Q-TEN05) and only falls back to the legacy
 * modify/cancel-window heuristic when the backend has not populated it.
 */
export function resolveBookingEditability(
  booking: BookingRecord,
): BookingEditability {
  const acceptedPending = Boolean(booking.pendingCommand);
  const editableUntil = booking.editableUntil ?? null;
  const readOnlyReasonCode = booking.readOnlyReasonCode ?? null;
  const actions = booking.availableActions;

  // An empty array is still authoritative (read-only for this actor); only an
  // absent field falls through to the legacy heuristic.
  if (actions !== undefined) {
    const update = actions.find((a) => a.action === "update") ?? null;
    const cancel = actions.find((a) => a.action === "cancel") ?? null;

    return {
      backendDriven: true,
      editableUntil,
      readOnlyReasonCode,
      acceptedPending,
      update: descriptorToCommand(update, readOnlyReasonCode, "medium"),
      cancel: descriptorToCommand(cancel, readOnlyReasonCode, "high", true),
    };
  }

  // ── Legacy fallback (no availableActions from backend yet) ───────────────
  const isTerminal =
    booking.orderStatus === "completed" || booking.orderStatus === "cancelled";
  const isOnTrip = booking.orderStatus === "on_trip";
  const withinUpdateWindow =
    booking.modifiableUntil == null || isFutureIso(booking.modifiableUntil);
  const withinCancelWindow =
    booking.cancelableUntil == null || isFutureIso(booking.cancelableUntil);

  return {
    backendDriven: false,
    editableUntil: booking.modifiableUntil ?? null,
    readOnlyReasonCode: isTerminal
      ? "terminal_state"
      : isOnTrip
        ? "dispatch_in_progress"
        : withinUpdateWindow
          ? null
          : "past_editable_until",
    acceptedPending,
    update: {
      present: true,
      enabled: !isTerminal && !isOnTrip && withinUpdateWindow,
      riskLevel: "medium",
      requiresReason: false,
      reason: isTerminal
        ? "訂單已完成或取消，無法再編輯。"
        : isOnTrip
          ? "行程進行中，租戶端已無法編輯。"
          : withinUpdateWindow
            ? null
            : `可編輯截止時間已於 ${formatDateTime(booking.modifiableUntil)} 結束。`,
    },
    cancel: {
      present: true,
      enabled: !isTerminal && withinCancelWindow,
      riskLevel: "high",
      requiresReason: true,
      reason: isTerminal
        ? "訂單已完成或取消，無法重複取消。"
        : withinCancelWindow
          ? null
          : `可取消截止時間已於 ${formatDateTime(booking.cancelableUntil)} 結束。`,
    },
  };
}

function descriptorToCommand(
  descriptor: ResourceActionDescriptor | null,
  readOnlyReasonCode: string | null,
  defaultRisk: ResourceActionDescriptor["riskLevel"],
  defaultRequiresReason = false,
): ResolvedCommand {
  if (!descriptor) {
    return {
      present: true,
      enabled: false,
      riskLevel: defaultRisk,
      requiresReason: defaultRequiresReason,
      reason: describeReasonCode(readOnlyReasonCode) ?? "此操作目前不可用。",
    };
  }

  return {
    present: true,
    enabled: descriptor.enabled,
    riskLevel: descriptor.riskLevel,
    requiresReason: descriptor.requiresReason ?? defaultRequiresReason,
    reason: descriptor.enabled
      ? null
      : (describeReasonCode(descriptor.disabledReasonCode) ??
        describeReasonCode(readOnlyReasonCode) ??
        "此操作目前不可用。"),
  };
}
