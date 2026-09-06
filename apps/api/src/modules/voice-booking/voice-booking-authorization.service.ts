import { Injectable } from "@nestjs/common";
import type { VoiceCapabilityTokenClaims } from "@drts/contracts";

import { assertVoiceCapabilityScope } from "../../common/auth";
import { ApiRequestError } from "../../common/api-envelope";
import { VoiceBookingRepository } from "./voice-booking.repository";

/**
 * SD §4.3 / §12.2: resolves "what order does this call own" and enforces
 * that a lookup only ever answers for the caller's own verified session and
 * resource scope. Deliberately never reads `crm.phase1_call_sessions
 * .linked_order_id` (SD §4.3: "不能只相信可由人工重新綁定的 call.linkedOrderId") --
 * that column is human-writable and is not evidence of an AI-originated
 * booking's ownership. Order attribution comes only from
 * `voice.intent.bound_order_id`, cross-checked against a matching
 * `succeeded` `voice.command_receipt` for the same intent/action.
 */
@Injectable()
export class VoiceBookingAuthorizationService {
  constructor(private readonly repository: VoiceBookingRepository) {}

  /**
   * Returns the orderId this voice session legitimately owns, or `null` if
   * it has not created one (not-yet-bound is not an error). Throws on any
   * cross-scope access attempt or on an intent that claims a bound order
   * without a matching succeeded receipt (data-integrity fail-closed, never
   * exposes the mismatched state).
   */
  async resolveBoundOrderId(
    voiceSessionId: string,
    resourceScopeId: string,
  ): Promise<string | null> {
    const session = await this.repository.findSessionById(voiceSessionId);
    if (!session) {
      throw new ApiRequestError(
        403,
        "VOICE_SESSION_NOT_OWNER",
        "Voice session not found for this capability.",
      );
    }

    // Cross-brand/product fencing: a capability minted for one resource
    // scope must never resolve order data belonging to a session bound to a
    // different scope, even if the session id itself is otherwise valid.
    if (session.resourceScopeId !== resourceScopeId) {
      throw new ApiRequestError(
        403,
        "VOICE_SCOPE_DENIED",
        "Session does not belong to the authorized resource scope.",
      );
    }

    const intent = await this.repository.findActiveCreateIntent(voiceSessionId);
    if (!intent || !intent.boundOrderId) {
      return null;
    }

    const resourceScope = await this.repository.findResourceScopeById(
      resourceScopeId,
    );
    if (!resourceScope) {
      throw new ApiRequestError(
        403,
        "VOICE_SCOPE_DENIED",
        "Resource scope for this session could not be resolved.",
      );
    }

    const receipt = await this.repository.findReceiptByActionKey(
      resourceScope.brandId,
      session.callId,
      intent.intentId,
      intent.action,
    );

    if (
      !receipt ||
      receipt.status !== "succeeded" ||
      receipt.orderId !== intent.boundOrderId
    ) {
      // The intent claims a bound order, but there is no matching succeeded
      // command receipt backing it. Fail closed rather than trust the
      // intent's cached bound_order_id column on its own.
      throw new ApiRequestError(
        409,
        "VOICE_ACTION_PAYLOAD_CONFLICT",
        "Bound order is missing a matching succeeded command receipt.",
      );
    }

    return receipt.orderId;
  }

  /**
   * `get_bound_booking_status` (SD §6.3): "本通新單或有效 passenger proof；最少資訊".
   * The only input is the verified capability itself -- there is no
   * orderId/callId parameter a caller could substitute to reach another
   * passenger's booking, and a session with no bound order returns `null`
   * rather than any other passenger's data.
   */
  async getBoundBookingStatus(
    claims: VoiceCapabilityTokenClaims,
  ): Promise<{ orderId: string } | null> {
    assertVoiceCapabilityScope(claims, "order_read_bound");

    const orderId = await this.resolveBoundOrderId(
      claims.voiceSessionId,
      claims.resourceScopeId,
    );
    return orderId ? { orderId } : null;
  }
}
