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
    context: { claims: VoiceCapabilityTokenClaims },
  ): Promise<unknown> {
    if (proposal.name !== "request_handoff") {
      throw new ApiRequestError(
        501,
        "VOICE_TOOL_NOT_IMPLEMENTED",
        `Voice tool '${proposal.name}' has no real domain execution backing yet.`,
      );
    }

    // `VoiceToolGatewayService.execute`'s own `assertCurrent` already
    // re-verified the session is live/current for `context.claims`
    // immediately before calling here, but it does not forward that row --
    // the session's current `sessionVersion`/`leaseEpoch` are the exact CAS
    // values `initiateHandoff` itself re-checks, so the only trustworthy
    // source is a fresh read, not anything cached across that boundary.
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
