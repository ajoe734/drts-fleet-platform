import { HttpStatus } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import { VoiceBookingRepository } from "./voice-booking.repository";

/**
 * SD §7.4/§7.5: the shared "does this call already own a voice-originated
 * intent order" lookup, reused by every legacy entry point that can mutate
 * or create an order for a `callId` (callcenter phone-order create,
 * call/link-order, multi-taxi call-center rides). Deliberately keyed off the
 * server-resolved `callId` -> `voice.session` -> `voice.intent` chain, never
 * off any client-declared field, so a request body cannot spoof or bypass
 * the fence.
 *
 * Returns `{ kind: "none" }` when there is nothing to fence (no voice
 * session for this call, no create-order intent, or the intent's command
 * was rejected without ever producing an order) -- callers are then free to
 * run their existing legacy behavior unchanged (SD §7.4: "非 voice call 保留
 * 既有人工行為").
 */
export type VoiceOrderFenceOutcome =
  | { kind: "none" }
  | { kind: "pending"; intentId: string }
  | { kind: "bound"; orderId: string };

export async function resolveVoiceOrderFence(
  repository: VoiceBookingRepository | undefined,
  callId: string,
): Promise<VoiceOrderFenceOutcome> {
  if (!repository?.isEnabled()) {
    return { kind: "none" };
  }

  const session = await repository.findSessionByCallId(callId);
  if (!session) {
    return { kind: "none" };
  }

  const intent = await repository.findActiveCreateIntent(session.voiceSessionId);
  if (!intent) {
    return { kind: "none" };
  }

  const resourceScope = await repository.findResourceScopeById(
    session.resourceScopeId,
  );
  const receipt = resourceScope
    ? await repository.findReceiptByActionKey(
        resourceScope.brandId,
        session.callId,
        intent.intentId,
        intent.action,
      )
    : null;

  if (intent.boundOrderId) {
    // Mirrors VoiceBookingAuthorizationService.resolveBoundOrderId: fail
    // closed on a cached bound_order_id that a matching succeeded receipt
    // does not actually back, rather than trusting the intent row alone.
    if (
      !receipt ||
      receipt.status !== "succeeded" ||
      receipt.orderId !== intent.boundOrderId
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "VOICE_ACTION_PAYLOAD_CONFLICT",
        "Bound order is missing a matching succeeded command receipt.",
        { callId, intentId: intent.intentId },
      );
    }
    return { kind: "bound", orderId: intent.boundOrderId };
  }

  if (receipt?.status === "pending") {
    return { kind: "pending", intentId: intent.intentId };
  }

  // No receipt yet, or a `rejected` receipt with no order -- SD §7.4 bullet
  // 3: the legacy entry point may proceed with its own manual booking.
  return { kind: "none" };
}
