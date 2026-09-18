import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { isDeepStrictEqual } from "node:util";
import { voiceOrdinaryRuntimeMappingSchema } from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import { ServiceAreaService } from "../service-area/service-area.service";
import { assertAutonomousServiceArea } from "../service-area/autonomous-service-area";
import { ServiceProductService } from "../service-product/service-product.service";
import type { QualifiedVoiceBookingSnapshot } from "../owned-mobility/voice-booking-qualification";
import {
  VoiceBookingRepository,
  type VoiceQueryExecutor,
  type VoiceRecordingCheckpointRecord,
  type VoiceCommandReceiptRecord,
} from "./voice-booking.repository";
import {
  renderVoiceReadback,
  voiceSnapshotHash,
  type ConfirmationFence,
} from "./voice-confirmation.service";
import { VoiceEvidenceService } from "./voice-evidence.service";

export const VOICE_COMMAND_ACCESS = Symbol("VOICE_COMMAND_ACCESS");
export interface VoiceCommandAuthority {
  brandId: string;
  resourceScopeId: string;
  providerAccountId: string;
  actorId: string;
  leaseEpoch: number;
}
/** Deployment authenticates the caller, never model-supplied actor/brand.
 * Receipt reads deliberately do not require a live AI lease or confirmation.
 * The runner credential must be restricted to the sealed command/checkpoint;
 * it must not impersonate the old worker or grant general administrator power. */
export interface VoiceCommandAccess {
  authorizeRead(
    credential: string,
    sessionId: string,
  ): Promise<
    Pick<
      VoiceCommandAuthority,
      "brandId" | "resourceScopeId" | "providerAccountId"
    >
  >;
  authorizeAccept(
    credential: string,
    sessionId: string,
  ): Promise<VoiceCommandAuthority>;
  credentialForCommand(
    commandId: string,
    proof: VoiceBookingCommandProof,
  ): Promise<string>;
}
export interface CommitVoiceBooking extends ConfirmationFence {
  confirmationId: string;
  snapshotHash: string;
}
export interface VoiceBookingCommandProof {
  request: CommitVoiceBooking;
  authority: VoiceCommandAuthority;
  callId: string;
  checkpoint: VoiceRecordingCheckpointRecord;
}
export class VoiceBookingRejection extends ApiRequestError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}
export const commandGate: (
  ok: unknown,
  code: string,
  message: string,
) => asserts ok = (ok, code, message) => {
  if (!ok) throw new VoiceBookingRejection(code, message);
};
export function voiceCommandPayloadHash(request: CommitVoiceBooking) {
  // Lease/session versions are transport fences, not business identity. A
  // retry may use a new reader capability without changing the original key.
  return voiceSnapshotHash({
    confirmationId: request.confirmationId,
    draftVersion: request.draftVersion,
    snapshotHash: request.snapshotHash,
  });
}
export async function lockVoiceCommand(
  repository: VoiceBookingRepository,
  tx: VoiceQueryExecutor,
  sessionId: string,
  intentId: string,
) {
  await tx.query("SET LOCAL lock_timeout = '2s'");
  await tx.query("SET LOCAL statement_timeout = '5s'");
  await tx.query(
    "SELECT voice_session_id FROM voice.session WHERE voice_session_id = $1 FOR UPDATE",
    [sessionId],
  );
  const session = await repository.findSessionById(sessionId, tx);
  commandGate(session, "VOICE_SESSION_NOT_FOUND", "Session unavailable");
  await tx.query(
    "SELECT intent_id FROM voice.intent WHERE intent_id = $1 AND voice_session_id = $2 FOR UPDATE",
    [intentId, sessionId],
  );
  const intent = await repository.findIntentById(intentId, tx);
  commandGate(
    intent &&
      intent.voiceSessionId === sessionId &&
      intent.action === "create_owned_order",
    "VOICE_INTENT_NOT_FOUND",
    "Create intent unavailable",
  );
  await tx.query(
    "SELECT confirmation_id FROM voice.confirmation WHERE intent_id = $1 ORDER BY confirmation_id FOR UPDATE",
    [intentId],
  );
  await tx.query(
    "SELECT command_id FROM voice.command_receipt WHERE intent_id = $1 ORDER BY command_id FOR UPDATE",
    [intentId],
  );
  return { session, intent, tx };
}
export type LockedVoiceCommand = Awaited<ReturnType<typeof lockVoiceCommand>>;

@Injectable()
export class VoiceBookingCommandService {
  constructor(
    readonly repository: VoiceBookingRepository,
    readonly evidence: VoiceEvidenceService,
    private readonly products: ServiceProductService,
    private readonly areas: ServiceAreaService,
    @Optional()
    @Inject(VOICE_COMMAND_ACCESS)
    readonly access?: VoiceCommandAccess,
  ) {}

  private requireAccess() {
    if (!this.access)
      throw new ApiRequestError(
        503,
        "VOICE_COMMAND_UNAVAILABLE",
        "Command authority adapter unavailable",
      );
    return this.access;
  }
  async query(credential: string, sessionId: string, intentId: string) {
    const authority = await this.requireAccess().authorizeRead(
      credential,
      sessionId,
    );
    const session = await this.repository.findSessionById(sessionId);
    const intent = await this.repository.findIntentById(intentId);
    const scope =
      session &&
      (await this.repository.findResourceScopeById(session.resourceScopeId));
    commandGate(
      session &&
        intent?.voiceSessionId === sessionId &&
        session.resourceScopeId === authority.resourceScopeId &&
        session.providerAccountId === authority.providerAccountId &&
        scope?.brandId === authority.brandId,
      "VOICE_SCOPE_FORBIDDEN",
      "Receipt scope unavailable",
    );
    return this.repository.findReceiptByActionKey(
      authority.brandId,
      session.callId,
      intentId,
      "create_owned_order",
    );
  }
  replay(receipt: VoiceCommandReceiptRecord, request: CommitVoiceBooking) {
    if (receipt.payloadHash !== voiceCommandPayloadHash(request))
      throw new ApiRequestError(
        409,
        "VOICE_ACTION_PAYLOAD_CONFLICT",
        "Accepted action has different confirmation or snapshot",
        { commandId: receipt.commandId },
      );
    return receipt;
  }

  async accept(credential: string, input: CommitVoiceBooking) {
    const request = structuredClone(input);
    // This must precede every live-ticket/owner/expiry/evidence check.
    const existing = await this.query(
      credential,
      request.voiceSessionId,
      request.intentId,
    );
    if (existing) return this.replay(existing, request);
    try {
      return await this.acceptNew(credential, request);
    } catch (error) {
      // Another executor can consume the ticket while this request prepares
      // evidence, or COMMIT can succeed while its acknowledgement is lost.
      const recovered = await this.query(
        credential,
        request.voiceSessionId,
        request.intentId,
      );
      if (recovered) return this.replay(recovered, request);
      throw error;
    }
  }

  private async acceptNew(credential: string, request: CommitVoiceBooking) {
    const authority = await this.requireAccess().authorizeAccept(
      credential,
      request.voiceSessionId,
    );
    const session = await this.repository.findSessionById(
      request.voiceSessionId,
    );
    const confirmation = await this.repository.findActiveConfirmation(
      request.intentId,
      request.draftVersion,
      "create_owned_order",
    );
    commandGate(
      session &&
        confirmation?.confirmationId === request.confirmationId &&
        confirmation.recordingCheckpointId,
      "VOICE_CONFIRMATION_REQUIRED",
      "Accepted confirmation required",
    );
    // Object reads/authentication happen outside the short DB transaction.
    const checkpoint = await this.evidence.requireCheckpoint(
      credential,
      session.callId,
      confirmation.recordingCheckpointId,
    );
    const proof: VoiceBookingCommandProof = {
      request,
      authority,
      callId: session.callId,
      checkpoint,
    };
    return this.repository.withTransaction(async (tx) => {
      const locked = await lockVoiceCommand(
        this.repository,
        tx,
        request.voiceSessionId,
        request.intentId,
      );
      const receipt = await this.repository.findReceiptByActionKey(
        authority.brandId,
        locked.session.callId,
        request.intentId,
        "create_owned_order",
        tx,
      );
      if (receipt) return this.replay(receipt, request);
      const s = locked.session;
      commandGate(
        s.controlOwner === "ai" &&
          s.dialogState === "confirming" &&
          s.mediaState !== "ended" &&
          s.commitStatus === "none" &&
          s.sessionVersion === request.sessionVersion &&
          s.leaseEpoch === request.leaseEpoch &&
          s.leaseEpoch === authority.leaseEpoch &&
          s.inputEpoch === request.inputEpoch &&
          authority.actorId.trim(),
        "VOICE_SESSION_NOT_OWNER",
        "New command requires the current live confirmation fence",
      );
      await this.validate(locked, proof, false);
      const commandId = randomUUID();
      await tx.query(
        `INSERT INTO voice.command_receipt
        (command_id, intent_id, brand_id, call_id, action, payload_hash)
        VALUES ($1,$2,$3,$4,'create_owned_order',$5)`,
        [
          commandId,
          request.intentId,
          authority.brandId,
          s.callId,
          voiceCommandPayloadHash(request),
        ],
      );
      await tx.query(
        "INSERT INTO voice.booking_command_proof (command_id, confirmation_id, proof) VALUES ($1,$2,$3::jsonb)",
        [commandId, request.confirmationId, JSON.stringify(proof)],
      );
      await this.enqueue(
        tx,
        commandId,
        s.voiceSessionId,
        "execute_booking_command",
      );
      await tx.query(
        "UPDATE voice.session SET commit_status = 'pending', dialog_state = 'committing', session_version = session_version + 1 WHERE voice_session_id = $1",
        [s.voiceSessionId],
      );
      await tx.query(
        "UPDATE voice.intent SET status = 'pending' WHERE intent_id = $1",
        [request.intentId],
      );
      return (await this.repository.findReceiptById(commandId, tx))!;
    });
  }

  /** Local DB and synchronous domain checks only. The executor rechecks all
   * mutable facts under the same locks used by accept and draft correction. */
  async validate(
    locked: LockedVoiceCommand,
    proof: VoiceBookingCommandProof,
    executing: boolean,
  ) {
    const { session: s, intent, tx } = locked;
    const { request: f, authority: a, checkpoint } = proof;
    commandGate(
      s.callId === proof.callId &&
        s.resourceScopeId === a.resourceScopeId &&
        s.providerAccountId === a.providerAccountId &&
        !intent.boundOrderId,
      "VOICE_SCOPE_FORBIDDEN",
      "Sealed command binding changed",
    );
    const c = await this.repository.findActiveConfirmation(
      intent.intentId,
      f.draftVersion,
      intent.action,
      tx,
    );
    commandGate(
      c &&
        c.state === "accepted" &&
        c.confirmationId === f.confirmationId &&
        c.voiceSessionId === s.voiceSessionId &&
        c.snapshotHash === f.snapshotHash &&
        c.inputEpoch === f.inputEpoch &&
        c.leaseEpoch === f.leaseEpoch &&
        c.mediaEpoch === f.controlCutoff.mediaEpoch &&
        c.controlSequence === f.controlCutoff.controlSequence &&
        c.confirmedAt &&
        c.readbackCompletedEventId &&
        !c.consumedCommandId &&
        Date.parse(c.expiresAt) > Date.now() &&
        c.recordingCheckpointId === checkpoint.checkpointId,
      "VOICE_CONFIRMATION_REQUIRED",
      "Confirmation expired, corrected, or unavailable",
    );
    commandGate(
      intent.currentDraftVersion === f.draftVersion,
      "VOICE_DRAFT_STALE",
      "Accepted draft was corrected",
    );
    const draft = await this.repository.findDraftRevision(
      intent.intentId,
      f.draftVersion,
      tx,
    );
    commandGate(
      draft?.canonicalSnapshot &&
        draft.snapshotHash === f.snapshotHash &&
        voiceSnapshotHash(draft.canonicalSnapshot) === f.snapshotHash,
      "VOICE_DRAFT_STALE",
      "Immutable snapshot mismatch",
    );
    // Pending input is uncertainty, not a business rejection. Keep the same
    // receipt until resolution, or until the ticket is definitively expired.
    if (s.pendingInput || s.lastResolvedInputEpoch !== s.inputEpoch)
      throw new ApiRequestError(
        409,
        "VOICE_INPUT_PENDING",
        "Input must be resolved before execution",
      );
    const events = await this.repository.listSessionEvents(
      s.voiceSessionId,
      0,
      tx,
    );
    const cutoff = f.controlCutoff;
    const current = events.filter((e) => e.mediaEpoch === cutoff.mediaEpoch);
    const limit = executing
      ? s.lastAppliedControlSequence
      : cutoff.controlSequence;
    if (
      !Number.isSafeInteger(limit) ||
      cutoff.controlSequence < 1 ||
      (!executing && s.lastAppliedControlSequence !== cutoff.controlSequence) ||
      limit < cutoff.controlSequence ||
      current.length !== limit ||
      current.some(
        (e, i) =>
          e.sequence !== i + 1 ||
          e.providerAccountId !== s.providerAccountId ||
          !e.sourceEventId,
      ) ||
      events.some((e) => e.mediaEpoch > cutoff.mediaEpoch)
    )
      throw new ApiRequestError(
        409,
        "VOICE_CONTROL_GAP",
        "Control journal has unapplied or missing events",
      );
    const pinned = await this.repository.findRecordingCheckpointById(
      checkpoint.checkpointId,
      tx,
    );
    commandGate(
      isDeepStrictEqual(pinned, checkpoint) &&
        pinned?.verifiedAt &&
        pinned.callId === s.callId,
      "VOICE_RECORDING_REQUIRED",
      "Checkpoint changed after verification",
    );
    const coverage = checkpoint.coverage as {
      snapshotHash?: string;
      readbackPlaybackId?: string;
    };
    commandGate(
      coverage?.snapshotHash === f.snapshotHash &&
        coverage.readbackPlaybackId === c.readbackPlaybackId,
      "VOICE_RECORDING_REQUIRED",
      "Checkpoint is for another confirmation",
    );
    await tx.query(
      "SELECT scope_id FROM voice.resource_scope WHERE scope_id = $1 FOR SHARE",
      [s.resourceScopeId],
    );
    const scope = await this.repository.findResourceScopeById(
      s.resourceScopeId,
      tx,
    );
    const snapshot =
      draft.canonicalSnapshot as unknown as QualifiedVoiceBookingSnapshot & {
        pickupNotes?: string;
      };
    const q = snapshot.bookingQualification;
    commandGate(
      scope &&
        scope.brandId === a.brandId &&
        scope.status === "active" &&
        voiceOrdinaryRuntimeMappingSchema.safeParse(scope.runtimeMapping)
          .success &&
        q.resourceScopeId === scope.scopeId &&
        q.scopeVersion === scope.version,
      "VOICE_QUALIFICATION_STALE",
      "Resource/product scope changed",
    );
    renderVoiceReadback(draft.canonicalSnapshot);
    const product =
      this.products.getRuntimeServiceProductByType("taxi_realtime");
    const policy = this.products.assertRuntimeProfileServiceProductActive(
      "ordinary_taxi",
      "taxi_realtime",
    );
    commandGate(
      product?.active &&
        product.timing === "realtime" &&
        snapshot.bookingRequirements.policyVersion ===
          `voice-v1:${scope.version}:${policy.updatedAt}:${product.updatedAt}`,
      "VOICE_QUALIFICATION_STALE",
      "Product policy changed",
    );
    assertAutonomousServiceArea(
      this.areas.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: q.pickup.address,
        dropoff: q.dropoff.address,
        requestedAt: q.requestedAt,
      }),
    );
    return snapshot;
  }

  async enqueue(
    tx: VoiceQueryExecutor,
    commandId: string,
    sessionId: string,
    type: string,
  ) {
    await tx.query(
      `INSERT INTO voice.work_item (command_id, voice_session_id, work_type, dedupe_key, payload_ref)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (dedupe_key) DO NOTHING`,
      [commandId, sessionId, type, `${commandId}:${type}`, commandId],
    );
  }
}
