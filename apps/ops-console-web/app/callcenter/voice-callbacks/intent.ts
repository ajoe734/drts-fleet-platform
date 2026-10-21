import { createIdempotencyKey } from "@drts/api-client";
import type {
  VoiceCallbackOperation,
  VoiceCallbackOperationRequest,
} from "@drts/contracts";

export interface VoiceCallbackIntent {
  taskId: string;
  action: VoiceCallbackOperation;
  body: VoiceCallbackOperationRequest;
  idempotencyKey: string;
}

export const CALLBACK_INTENT_STORAGE_KEY = "drts-voice-callback-pending-action";

export function newVoiceCallbackIntent(
  taskId: string,
  action: VoiceCallbackOperation,
  body: VoiceCallbackOperationRequest,
): VoiceCallbackIntent {
  return {
    taskId,
    action,
    body: { ...body },
    idempotencyKey: createIdempotencyKey("voice-callback"),
  };
}

export function readVoiceCallbackIntent(
  raw: string | null,
): VoiceCallbackIntent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as VoiceCallbackIntent;
    if (
      typeof value.taskId !== "string" ||
      typeof value.idempotencyKey !== "string" ||
      !["claim", "attempt", "complete", "cancel", "transfer"].includes(
        value.action,
      ) ||
      !Number.isInteger(value.body?.expectedVersion)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
