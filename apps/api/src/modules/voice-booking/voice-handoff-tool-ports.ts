import type { VoiceCapabilityTokenClaims, VoiceToolProposal } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { VoiceToolDomainPorts } from "./voice-tool-gateway.service";
import { VoiceBookingRepository } from "./voice-booking.repository";
import { VoiceHandoffService } from "./voice-handoff.service";

/**
 * SD §4.2's "model gets no admin/cross-scope tool schema" boundary: the
 * only tool `VoiceDialogueEngine`/`VoiceCallTurnCoordinator.executeTools`
 * (apps/voice-media-worker) ever actually proposes today is
 * `request_handoff` -- every other output is already forced into that same
 * honest outcome before it reaches a tool gateway at all (see that
 * coordinator's own class doc). This `VoiceToolDomainPorts` implementation
 * matches that reality instead of inventing resolve_location/order/cancel
 * domain execution that has no real backing provider yet: it fails closed
 * (never fabricates a result) for every other proposal name, so a future
 * engine change that starts proposing one of those tools is refused here
 * rather than silently mishandled.
 */
export class VoiceHandoffOnlyToolPorts implements VoiceToolDomainPorts {
  constructor(
    private readonly repository: VoiceBookingRepository,
    private readonly handoffService: VoiceHandoffService,
  ) {}

  async execute(
    proposal: VoiceToolProposal,
    context: {
      claims: VoiceCapabilityTokenClaims;
      inputEpoch: number;
      boundOrderId: string | null;
      signal: AbortSignal;
    },
  ): Promise<unknown> {
    if (proposal.name !== "request_handoff") {
      throw new ApiRequestError(
        501,
        "VOICE_TOOL_NOT_IMPLEMENTED",
        `Voice tool '${proposal.name}' has no real domain execution backing yet.`,
      );
    }

    // Codex reopen round 5/6, R7: `VoiceToolGatewayService.execute`'s own
    // `assertCurrent` already re-verified the session is live/current for
    // `context.claims` immediately before calling here (including
    // `session.inputEpoch === this.turn.inputEpoch`), but its `Promise.race`
    // against `context.signal` only governs what *that caller* awaits --
    // it never cancels this detached port call once started, so a turn
    // aborted while the read below is still outstanding would otherwise
    // keep running to completion regardless. Checked directly, not
    // inferred from the race's own outcome.
    context.signal.throwIfAborted();

    // The session's current `sessionVersion`/`leaseEpoch` are the exact CAS
    // values `initiateHandoff` itself re-checks, so the only trustworthy
    // source is a fresh read, not anything cached across that boundary --
    // but a fresh read's own `sessionVersion` only means something if it
    // still corresponds to the turn this proposal was admitted under.
    const session = await this.repository.findSessionById(
      context.claims.voiceSessionId,
    );
    if (!session) {
      throw new ApiRequestError(
        403,
        "VOICE_SESSION_NOT_OWNER",
        "Voice session not found.",
      );
    }

    context.signal.throwIfAborted();
    // Fence against refreshing a stale proposal into eligibility: this
    // read trivially matches its own `sessionVersion`, which would let a
    // handoff admitted under an old `inputEpoch` silently adopt whatever
    // the row has since moved to (a newer customer utterance, a barge-in,
    // a media-authority change) by just re-reading the current row and
    // using *that* as the CAS fence. The admitted `context.inputEpoch` --
    // fixed at proposal time, never the session's current value -- is what
    // must still hold.
    if (session.inputEpoch !== context.inputEpoch) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "Session input epoch advanced since this handoff was admitted.",
      );
    }

    context.signal.throwIfAborted();
    const result = await this.handoffService.initiateHandoff({
      voiceSessionId: context.claims.voiceSessionId,
      expectedSessionVersion: session.sessionVersion,
      expectedLeaseEpoch: context.claims.leaseEpoch,
      reason: proposal.args.reason,
    });

    return {
      status: mapQueueStatus(result.queueItem.status),
      handoffId: result.handoffId,
    };
  }
}

function mapQueueStatus(
  status: string,
): "queued" | "connected" | "unavailable" {
  if (status === "queued" || status === "assigned" || status === "bridging") {
    return "queued";
  }
  if (status === "connected") {
    return "connected";
  }
  // unanswered / caller_dropped / agent_dropped / failed: none of these are
  // "still trying" or "connected" -- `unavailable` is the honest outcome
  // the `request_handoff` result schema already defines for exactly this,
  // never a fabricated success.
  return "unavailable";
}
