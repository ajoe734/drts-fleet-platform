import type { VoiceCapabilityTokenClaims, VoiceToolProposal } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { GeoService } from "../geo/geo.service";
import type { VoiceToolDomainPorts } from "./voice-tool-gateway.service";
import { VoiceDispatchProjectionService } from "./voice-dispatch-projection.service";
import { VoiceHandoffOnlyToolPorts } from "./voice-handoff-tool-ports";

/**
 * AUDIT-VOICE-APPLICATION-REGRESSION-20261018: `VoiceHandoffOnlyToolPorts`
 * (this module's prior `VoiceToolDomainPorts` implementation) answered
 * every tool other than `request_handoff` with an honest 501 because no
 * domain backing was reachable at all. `resolve_location` and
 * `get_bound_booking_status` now have real, self-contained domain backing
 * (`GeoService.search`, `VoiceBookingAuthorizationService.
 * getBoundBookingStatus` + `VoiceDispatchProjectionService.
 * projectDispatch`) and are answered for real here.
 *
 * `check_booking_eligibility` and `prepare_booking_readback` are NOT
 * implemented by this class yet -- both still delegate to
 * `VoiceHandoffOnlyToolPorts`'s own honest 501. This is a precise,
 * documented boundary, not an oversight: deriving the
 * `QualifyVoiceBookingCommand` either tool needs requires re-selecting a
 * durable address candidate from this session's `voice.dialogue_snapshot`
 * history (the snapshot only retains `{placeId, label, region}` per
 * candidate, never the ephemeral `GeoService.search` `candidateId`
 * `VoiceLocationService.resolve` actually requires -- a fresh `search`
 * re-keyed by the persisted `placeId` would be needed to recover one, and
 * no caller does that yet), and `prepare_booking_readback` additionally
 * requires the durable, server-resolved contact-role/sealed-consent
 * snapshot this task's own contact/consent unit has not landed yet (see
 * that unit's own doc). Implementing either honestly is explicitly left to
 * a follow-up change rather than fabricated here.
 */
export class VoiceDomainToolPorts implements VoiceToolDomainPorts {
  constructor(
    private readonly fallback: VoiceHandoffOnlyToolPorts,
    private readonly geo: GeoService | undefined,
    private readonly dispatchProjection: VoiceDispatchProjectionService | undefined,
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
    if (proposal.name === "resolve_location") {
      return this.resolveLocation(proposal.args.query, context.signal);
    }
    if (proposal.name === "get_bound_booking_status") {
      return this.getBoundBookingStatus(context.boundOrderId, context.signal);
    }
    return this.fallback.execute(proposal, context);
  }

  /** Lists up to three current provider candidates for a raw query -- this
   * is the model's "what did you mean" step, not a final selection.
   * `VoiceLocationService.resolve` (the actual address-truth gate used
   * later to commit a selected candidate) is deliberately not called here:
   * it requires a single already-selected candidate, not a free-text
   * query, and fabricating a selection from the model's own query text
   * would be exactly the "substitute model coordinates" outcome this
   * task's own spec forbids. */
  private async resolveLocation(
    query: string,
    signal: AbortSignal,
  ): Promise<{ candidates: Array<{ placeId: string; label: string; region: string }> }> {
    if (!this.geo) {
      throw new ApiRequestError(
        500,
        "VOICE_APPLICATION_DEPENDENCY_UNAVAILABLE",
        "Voice application dependency 'geoService' is unavailable.",
      );
    }
    signal.throwIfAborted();
    // Mirrors `VoiceLocationService.resolve`'s own fail-closed gate: a
    // degraded/fixture/non-external provider must never hand the model
    // candidates it cannot actually commit to later.
    const health = this.geo.health();
    if (health.status !== "healthy" || health.failClosed || health.mode !== "external") {
      throw new ApiRequestError(
        409,
        "VOICE_ADDRESS_PROVIDER_UNAVAILABLE",
        "Live address truth is unavailable.",
      );
    }
    const result = await this.geo.search({ q: query, limit: 3, surface: "callcenter" });
    signal.throwIfAborted();
    return {
      candidates: result.candidates.slice(0, 3).map((candidate) => ({
        // The tool result contract exposes `placeId`, not the provider's
        // internal, session-scoped `candidateId` -- fall back to whichever
        // stable provider identifier is actually present rather than a
        // value this response never had.
        placeId:
          candidate.placeId ?? candidate.providerCandidateId ?? candidate.candidateId,
        label: candidate.displayName || candidate.address,
        region: candidate.district ?? candidate.locality ?? candidate.address,
      })),
    };
  }

  /** The gateway (`VoiceToolGatewayService.execute`) only ever calls this
   * for a session with a real bound order (it answers `null` itself
   * otherwise, without reaching a port) -- `boundOrderId` is defensively
   * re-checked here only, never relied on as the sole fence. */
  private async getBoundBookingStatus(
    boundOrderId: string | null,
    signal: AbortSignal,
  ): Promise<{ orderId: string; status: string } | null> {
    if (!boundOrderId) return null;
    if (!this.dispatchProjection) {
      throw new ApiRequestError(
        500,
        "VOICE_APPLICATION_DEPENDENCY_UNAVAILABLE",
        "Voice application dependency 'voiceDispatchProjectionService' is unavailable.",
      );
    }
    signal.throwIfAborted();
    const view = await this.dispatchProjection.projectDispatch(boundOrderId);
    return { orderId: view.orderId, status: view.announcement };
  }
}
