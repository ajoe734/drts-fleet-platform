import {
  bookingRequirementsSchema,
  type VoiceCapabilityTokenClaims,
  type VoiceToolProposal,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { GeoService } from "../geo/geo.service";
import type { VoiceToolDomainPorts } from "./voice-tool-gateway.service";
import { VoiceDispatchProjectionService } from "./voice-dispatch-projection.service";
import { VoiceHandoffOnlyToolPorts } from "./voice-handoff-tool-ports";

import { VoiceSessionService } from "./voice-session.service";
import { VoiceContactService } from "./voice-contact.service";
import { VoiceBookingRepository } from "./voice-booking.repository";
import { VoiceBookingDraftService } from "./voice-booking-draft.service";
import {
  VoiceConfirmationService,
  voiceSnapshotHash,
  type ReadbackPlan,
} from "./voice-confirmation.service";
import type { VoiceDialogueSnapshotContent } from "@drts/contracts";

/** Real domain continuation; the model proposes candidates, never coordinates,
 * contact authority, an order receipt or affirmative confirmation. */
export class VoiceDomainToolPorts implements VoiceToolDomainPorts {
  constructor(
    private readonly fallback: VoiceHandoffOnlyToolPorts,
    private readonly geo: GeoService | undefined,
    private readonly dispatchProjection:
      | VoiceDispatchProjectionService
      | undefined,
    private readonly booking?: {
      sessions: VoiceSessionService;
      contacts: VoiceContactService;
      repository: VoiceBookingRepository;
      drafts: VoiceBookingDraftService;
      confirmation: VoiceConfirmationService;
      credential: string;
    },
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
    if (
      proposal.name === "check_booking_eligibility" ||
      proposal.name === "prepare_booking_readback"
    ) {
      return this.prepareBooking(proposal.name, context);
    }
    return this.fallback.execute(proposal, context);
  }

  private async selectedLocation(
    content: VoiceDialogueSnapshotContent,
    field: "pickup" | "dropoff",
    signal: AbortSignal,
  ) {
    const slot = content.slots[field];
    const previous = [...content.addressHistory]
      .reverse()
      .find((item) => item.field === field);
    // An explicit selected provider identity is required, including for one
    // search result. Never infer first candidate, coordinates or an entrance.
    const selected = previous?.candidates.filter(
      (item) => item.placeId === (slot?.normalizedValue ?? slot?.candidate),
    );
    if (!slot || selected?.length !== 1 || !this.geo)
      throw new ApiRequestError(
        409,
        "VOICE_ADDRESS_SELECTION_REQUIRED",
        "Select a previously resolved provider address.",
      );
    signal.throwIfAborted();
    const result = await this.geo.search({
      q: previous!.rawText,
      limit: 3,
      surface: "callcenter",
    });
    signal.throwIfAborted();
    const matches = result.candidates.filter(
      (item) =>
        (item.placeId ?? item.providerCandidateId ?? item.candidateId) ===
        selected[0]!.placeId,
    );
    if (result.degraded || matches.length !== 1)
      throw new ApiRequestError(
        409,
        "VOICE_ADDRESS_SELECTION_REQUIRED",
        "The selected provider address is no longer available.",
      );
    return {
      rawText: previous!.rawText,
      candidateId: matches[0]!.candidateId,
      ...(selected[0]!.entranceId
        ? { entranceId: selected[0]!.entranceId }
        : {}),
    };
  }

  private async prepareBooking(
    name: "check_booking_eligibility" | "prepare_booking_readback",
    context: Parameters<VoiceToolDomainPorts["execute"]>[1],
  ) {
    if (!this.booking)
      throw new ApiRequestError(
        503,
        "VOICE_BOOKING_CONTINUATION_UNAVAILABLE",
        "Booking continuation is not configured.",
      );
    const b = this.booking;
    context.signal.throwIfAborted();
    const { session, snapshot } =
      await b.sessions.getDialogueSnapshotRestoration(
        context.claims.voiceSessionId,
      );
    if (
      !snapshot ||
      snapshot.inputEpoch !== context.inputEpoch ||
      session.inputEpoch !== context.inputEpoch ||
      session.resourceScopeId !== context.claims.resourceScopeId ||
      session.routeProfileVersion !== context.claims.routeProfileVersion ||
      session.leaseEpoch !== context.claims.leaseEpoch ||
      session.controlOwner !== "ai" ||
      session.dialogState === "closed"
    )
      throw new Error("voice_tool_stale_snapshot");
    await b.contacts.synchronizeDialogueContacts({
      voiceSessionId: session.voiceSessionId,
      snapshotId: snapshot.snapshotId,
      inputEpoch: context.inputEpoch,
      leaseEpoch: context.claims.leaseEpoch,
      resourceScopeId: context.claims.resourceScopeId,
      routeProfileVersion: context.claims.routeProfileVersion,
      content: snapshot.content,
      signal: context.signal,
    });
    context.signal.throwIfAborted();
    const contacts = await b.contacts.getEffectiveContactsDurable(
      session.voiceSessionId,
    );
    if (!contacts)
      throw new ApiRequestError(
        409,
        "VOICE_CONTACT_NOT_FOUND",
        "Persist contact roles before qualification.",
      );
    const pickup = await this.selectedLocation(
      snapshot.content,
      "pickup",
      context.signal,
    );
    const dropoff = await this.selectedLocation(
      snapshot.content,
      "dropoff",
      context.signal,
    );
    const time = snapshot.content.slots.time;
    if (!(time?.normalizedValue ?? time?.candidate))
      throw new ApiRequestError(
        409,
        "VOICE_ABSOLUTE_TIME_REQUIRED",
        "Confirm an absolute immediate pickup time.",
      );
    const candidate = (field: string) => {
      const slot = snapshot.content.slots[field];
      return slot?.normalizedValue ?? slot?.candidate;
    };
    let capabilities: unknown = [];
    const capabilityCandidate = candidate("requiredCapabilities");
    if (capabilityCandidate !== undefined) {
      try {
        capabilities = JSON.parse(capabilityCandidate);
      } catch {
        throw new ApiRequestError(
          400,
          "BOOKING_REQUIREMENTS_INVALID",
          "Structured booking requirements are invalid.",
        );
      }
    }
    // Consume only explicit structured slots. Notes never imply equipment or
    // capacity, and malformed or unsupported requests are never defaulted away.
    const requirements = bookingRequirementsSchema
      .pick({
        passengerCount: true,
        luggageCount: true,
        luggageSize: true,
        requiredCapabilities: true,
      })
      .safeParse({
        passengerCount: Number(candidate("passengerCount") ?? 1),
        luggageCount: Number(candidate("luggageCount") ?? 0),
        luggageSize: candidate("luggageSize") ?? "standard",
        requiredCapabilities: capabilities,
      });
    if (!requirements.success)
      throw new ApiRequestError(
        400,
        "BOOKING_REQUIREMENTS_INVALID",
        "Structured booking requirements are invalid.",
      );
    const command = {
      pickup,
      dropoff,
      timingMode: "on_demand" as const,
      requestedAt: time.normalizedValue ?? time.candidate,
      timeZone: "Asia/Taipei" as const,
      requirements: {
        ...requirements.data,
        bookerContact: contacts.bookerContact,
        passengerContact: contacts.passengerContact,
        driverContactRole: contacts.driverContactRole,
      },
    };
    context.signal.throwIfAborted();
    let qualified;
    try {
      qualified = await b.drafts.qualify(session.voiceSessionId, command);
    } catch (error) {
      if (
        name === "check_booking_eligibility" &&
        error instanceof ApiRequestError &&
        error.code === "VOICE_SERVICE_AREA_REVIEW_REQUIRED"
      ) {
        const rejection = (
          error.getResponse() as {
            error?: { message?: string; details?: { decision?: string } };
          }
        ).error;
        const decision = rejection?.details?.decision;
        return {
          status:
            decision === "not_serviceable"
              ? "not_serviceable"
              : "manual_review",
          reason: rejection?.message ?? error.code,
        };
      }
      throw error;
    }
    context.signal.throwIfAborted();
    if (name === "check_booking_eligibility")
      return {
        status: "serviceable",
        reason:
          "Qualified immediate booking; vehicle allocation is not yet confirmed.",
      };
    const canonicalSnapshot = {
      ...qualified,
      ...(snapshot.content.slots.notes?.candidate
        ? { pickupNotes: snapshot.content.slots.notes.candidate }
        : {}),
    };
    const promoted = await b.repository.promoteQualifiedDialogueDraft({
      session,
      sourceSnapshotId: snapshot.snapshotId,
      contactRevision: contacts.totalRevisions,
      canonicalSnapshot,
      snapshotHash: voiceSnapshotHash(canonicalSnapshot),
      slots: snapshot.content.slots,
      signal: context.signal,
    });
    context.signal.throwIfAborted();
    const existing = await b.repository.findActiveConfirmation(
      promoted.intentId,
      promoted.draftVersion,
      "create_owned_order",
    );
    const plan =
      existing &&
      existing.inputEpoch === context.inputEpoch &&
      existing.leaseEpoch === context.claims.leaseEpoch &&
      Date.parse(existing.expiresAt) > Date.now() &&
      existing.state === "readback_playing"
        ? (existing.evidence as unknown as ReadbackPlan)
        : await b.confirmation.beginReadback(b.credential, {
            voiceSessionId: session.voiceSessionId,
            intentId: promoted.intentId,
            sessionVersion: promoted.session.sessionVersion,
            draftVersion: promoted.draftVersion,
            inputEpoch: context.inputEpoch,
            leaseEpoch: context.claims.leaseEpoch,
            controlCutoff: {
              mediaEpoch: snapshot.mediaEpoch,
              controlSequence: session.lastAppliedControlSequence,
            },
          });
    context.signal.throwIfAborted();
    return {
      script: plan.script,
      playbackTaskId: plan.readbackPlaybackId,
      draftVersion: promoted.draftVersion,
      confirmation: plan,
    };
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
  ): Promise<{
    candidates: Array<{
      placeId: string;
      label: string;
      region: string;
      entranceId?: string;
    }>;
  }> {
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
    if (
      health.status !== "healthy" ||
      health.failClosed ||
      health.mode !== "external"
    ) {
      throw new ApiRequestError(
        409,
        "VOICE_ADDRESS_PROVIDER_UNAVAILABLE",
        "Live address truth is unavailable.",
      );
    }
    const result = await this.geo.search({
      q: query,
      limit: 3,
      surface: "callcenter",
    });
    signal.throwIfAborted();
    return {
      candidates: result.candidates.slice(0, 3).map((candidate) => ({
        // The tool result contract exposes `placeId`, not the provider's
        // internal, session-scoped `candidateId` -- fall back to whichever
        // stable provider identifier is actually present rather than a
        // value this response never had.
        placeId:
          candidate.placeId ??
          candidate.providerCandidateId ??
          candidate.candidateId,
        label: candidate.displayName || candidate.address,
        region: candidate.district ?? candidate.locality ?? candidate.address,
        ...(typeof candidate.metadata?.entranceId === "string"
          ? { entranceId: candidate.metadata.entranceId }
          : {}),
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
