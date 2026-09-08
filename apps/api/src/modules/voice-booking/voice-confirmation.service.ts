import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  bookingRequirementsSchema,
  type BookingQualification,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import {
  VoiceBookingRepository,
  type VoiceQueryExecutor,
  type VoiceSessionRecord,
  type VoiceIntentRecord,
  type VoiceDraftRevisionRecord,
  type VoiceConfirmationRecord,
} from "./voice-booking.repository";
import {
  VoiceBookingDraftService,
  type QualifyVoiceBookingCommand,
} from "./voice-booking-draft.service";
import { assertAutonomousServiceArea } from "../service-area/autonomous-service-area";
import { VoiceEvidenceService } from "./voice-evidence.service";

export const VOICE_CONFIRMATION_ACCESS = Symbol("VOICE_CONFIRMATION_ACCESS");
/** Authenticated coordinator capability, not model arguments. Implementations
 * authorize the credential against live brand/session/lease and read immutable
 * adapter observations. Missing deployment wiring fails closed. */
export interface VoiceConfirmationAccess {
  authorize(
    credential: string,
    sessionId: string,
  ): Promise<{
    leaseEpoch: number;
    resourceScopeId: string;
    providerAccountId: string;
  }>;
}
export interface ConfirmationFence {
  voiceSessionId: string;
  intentId: string;
  sessionVersion: number;
  draftVersion: number;
  inputEpoch: number;
  leaseEpoch: number;
  controlCutoff: { mediaEpoch: number; controlSequence: number };
}
export interface ReadbackPlan {
  confirmationId: string;
  readbackPlaybackId: string;
  snapshotHash: string;
  script: string;
  readbackScriptHash: string;
  templateVersion: "zh-TW-booking-v1";
  expectedDigit: "1";
  expiresAt: string;
}
export class VoiceConfirmationError extends ApiRequestError {
  constructor(message: string) {
    super(409, "VOICE_CONFIRMATION_REQUIRED", message);
  }
}
const requireGate: (ok: unknown, message: string) => asserts ok = (
  ok,
  message,
) => {
  if (!ok) throw new VoiceConfirmationError(message);
};
const object = (v: unknown): Record<string, unknown> => {
  requireGate(
    v && typeof v === "object" && !Array.isArray(v),
    "Evidence object missing",
  );
  return v as Record<string, unknown>;
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
/** Versioned canonical JSON rejects values JSON would silently drop/coerce. */
export function canonicalVoiceSnapshot(value: unknown): string {
  const encode = (v: unknown): string => {
    if (v === null || typeof v === "string" || typeof v === "boolean")
      return JSON.stringify(v);
    if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(encode).join(",")}]`;
    requireGate(
      v &&
        typeof v === "object" &&
        Object.getPrototypeOf(v) === Object.prototype,
      "Non-JSON snapshot",
    );
    return `{${Object.keys(v)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${encode((v as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  };
  return `voice-snapshot-v1:${encode(value)}`;
}
export const voiceSnapshotHash = (snapshot: unknown) =>
  hash(canonicalVoiceSnapshot(snapshot));

/** Only the qualified ordinary immediate product is supported. Unknown business
 * fields require a new template rather than silently omitting a commitment. */
export function renderVoiceReadback(
  snapshot: Record<string, unknown>,
  now = Date.now(),
) {
  requireGate(
    Object.keys(snapshot).every((k) =>
      ["bookingRequirements", "bookingQualification", "pickupNotes"].includes(
        k,
      ),
    ),
    "Unsupported snapshot fields",
  );
  const r = bookingRequirementsSchema.parse(snapshot.bookingRequirements);
  const q = object(
    snapshot.bookingQualification,
  ) as unknown as BookingQualification;
  requireGate(
    q.runtimeProfileCode === "ordinary_taxi" &&
      q.serviceProductCode === "taxi_realtime" &&
      q.timingMode === "on_demand" &&
      q.timeZone === "Asia/Taipei",
    "Unsupported product",
  );
  requireGate(
    Number.isFinite(Date.parse(q.validUntil)) && Date.parse(q.validUntil) > now,
    "Qualification expired or unavailable",
  );
  assertAutonomousServiceArea(q.serviceArea);
  requireGate(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(q.requestedAt) &&
      Number.isFinite(Date.parse(q.requestedAt)),
    "UTC time required",
  );
  const text = (v: unknown) => {
    requireGate(
      typeof v === "string" &&
        v.trim() &&
        v.length <= 500 &&
        !/[<>]/.test(v) &&
        Array.from(v).every((c) => c.charCodeAt(0) >= 32),
      "Invalid readback text",
    );
    return v.replace(/\d+/g, (d) => d.split("").join(" "));
  };
  const location = (v: BookingQualification["pickup"]) => {
    requireGate(
      v?.selectedCandidateId &&
        v.resolutionVersion &&
        Date.parse(v.validUntil) > now &&
        v.address?.coordinateSource === "provider_candidate",
      "Unvalidated location",
    );
    return `${text(v.address.normalizedAddress ?? v.address.address)}${v.entranceId ? `，入口 ${text(v.entranceId)}` : ""}`;
  };
  const contact = (v: { name: string; phone: string }) => {
    requireGate(/^\+?\d{8,15}$/.test(v.phone), "Invalid contact phone");
    return `${v.name ? text(v.name) + "，" : ""}${text(v.phone)}`;
  };
  const date = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(q.requestedAt));
  const script = `請確認本次一般計程車即時叫車：台北時間 ${text(date)}，上車地點 ${location(q.pickup)}，目的地 ${location(q.dropoff)}。乘客 ${r.passengerCount} 位，行李 ${r.luggageCount} 件，${r.luggageSize === "standard" ? "標準" : "超規"}尺寸，特殊需求 ${r.requiredCapabilities.map((c) => (c === "wheelchair" ? "輪椅" : "兒童座椅")).join("、") || "無"}。代叫聯絡人 ${contact(r.bookerContact)}，乘車聯絡人 ${contact(r.passengerContact)}。司機將聯絡${r.driverContactRole === "booker" ? "代叫聯絡人" : "乘車聯絡人"}。上車備註：${snapshot.pickupNotes ? text(snapshot.pickupNotes) : "無"}。若資料正確且要叫車，請說「確認叫車」或在回讀結束後按 1；需要更正請直接說明。`;
  return {
    script,
    readbackScriptHash: hash(script),
    templateVersion: "zh-TW-booking-v1" as const,
    expectedDigit: "1" as const,
  };
}

type Locked = {
  session: VoiceSessionRecord;
  intent: VoiceIntentRecord;
  draft: VoiceDraftRevisionRecord;
  confirmation: VoiceConfirmationRecord | null;
  tx: VoiceQueryExecutor;
};

@Injectable()
export class VoiceConfirmationService {
  constructor(
    private readonly repository: VoiceBookingRepository,
    private readonly evidence: VoiceEvidenceService,
    private readonly drafts: VoiceBookingDraftService,
    @Optional()
    @Inject(VOICE_CONFIRMATION_ACCESS)
    private readonly access?: VoiceConfirmationAccess,
  ) {}

  private async authority(credential: string, fence: ConfirmationFence) {
    requireGate(
      this.access && credential.trim(),
      "Confirmation adapter unavailable",
    );
    return this.access.authorize(credential, fence.voiceSessionId);
  }
  private async locked<T>(
    f: ConfirmationFence,
    authority: Awaited<ReturnType<VoiceConfirmationAccess["authorize"]>>,
    work: (s: Locked) => Promise<T>,
    allowPending = false,
  ) {
    return this.repository.withTransaction(async (tx) => {
      await tx.query("SET LOCAL lock_timeout = '2s'");
      await tx.query("SET LOCAL statement_timeout = '5s'");
      await tx.query(
        "SELECT voice_session_id FROM voice.session WHERE voice_session_id = $1 FOR UPDATE",
        [f.voiceSessionId],
      );
      const session = await this.repository.findSessionById(
        f.voiceSessionId,
        tx,
      );
      requireGate(
        session &&
          session.sessionVersion === f.sessionVersion &&
          session.leaseEpoch === f.leaseEpoch &&
          session.inputEpoch === f.inputEpoch,
        "Stale session fence",
      );
      requireGate(
        authority.leaseEpoch === session.leaseEpoch &&
          authority.resourceScopeId === session.resourceScopeId &&
          authority.providerAccountId === session.providerAccountId,
        "Unauthorized confirmation scope",
      );
      requireGate(
        session.controlOwner === "ai" &&
          session.dialogState !== "closed" &&
          (session.commitStatus === "none" ||
            (allowPending && session.commitStatus === "pending")),
        "New confirmation unavailable",
      );
      await tx.query(
        "SELECT intent_id FROM voice.intent WHERE intent_id = $1 AND voice_session_id = $2 FOR UPDATE",
        [f.intentId, f.voiceSessionId],
      );
      const intent = await this.repository.findIntentById(f.intentId, tx);
      requireGate(
        intent &&
          intent.voiceSessionId === session.voiceSessionId &&
          intent.currentDraftVersion === f.draftVersion &&
          !intent.boundOrderId &&
          intent.action === "create_owned_order",
        "Stale intent",
      );
      await tx.query(
        "SELECT confirmation_id FROM voice.confirmation WHERE intent_id = $1 ORDER BY confirmation_id FOR UPDATE",
        [f.intentId],
      );
      const draft = await this.repository.findDraftRevision(
        f.intentId,
        f.draftVersion,
        tx,
      );
      requireGate(
        draft &&
          draft.canonicalSnapshot &&
          draft.snapshotHash === voiceSnapshotHash(draft.canonicalSnapshot) &&
          object(draft.canonicalSnapshot.bookingQualification)
            .resourceScopeId === session.resourceScopeId,
        "Snapshot hash mismatch",
      );
      const confirmation = await this.repository.findActiveConfirmation(
        f.intentId,
        f.draftVersion,
        intent.action,
        tx,
      );
      return work({ session, intent, draft, confirmation, tx });
    });
  }

  /** Call only after qualification has durably populated the immutable draft. */
  async beginReadback(
    credential: string,
    input: ConfirmationFence,
  ): Promise<ReadbackPlan> {
    const f = structuredClone(input);
    const authority = await this.authority(credential, f);
    return this.locked(f, authority, async (s) => {
      await this.cutoff(s, f);
      const rendered = renderVoiceReadback(s.draft.canonicalSnapshot!);
      requireGate(!s.confirmation, "An active readback already exists");
      const plan: ReadbackPlan = {
        ...rendered,
        confirmationId: randomUUID(),
        readbackPlaybackId: randomUUID(),
        snapshotHash: s.draft.snapshotHash,
        expiresAt: new Date(
          Math.min(
            Date.now() + 120_000,
            Date.parse(
              (
                s.draft.canonicalSnapshot!
                  .bookingQualification as BookingQualification
              ).validUntil,
            ),
          ),
        ).toISOString(),
      };
      await s.tx.query(
        `INSERT INTO voice.confirmation
        (confirmation_id, voice_session_id, intent_id, draft_version, action,
         confirmation_method, snapshot_hash, readback_playback_id, input_epoch,
         media_epoch, control_sequence, lease_epoch, evidence, state, expires_at)
        VALUES ($1,$2,$3,$4,$5,'speech',$6,$7,$8,$9,$10,$11,$12::jsonb,'readback_playing',$13)`,
        [
          plan.confirmationId,
          f.voiceSessionId,
          f.intentId,
          f.draftVersion,
          s.intent.action,
          plan.snapshotHash,
          plan.readbackPlaybackId,
          f.inputEpoch,
          f.controlCutoff.mediaEpoch,
          f.controlCutoff.controlSequence,
          f.leaseEpoch,
          JSON.stringify(plan),
          plan.expiresAt,
        ],
      );
      await this.state(s, "readback_playing");
      return plan;
    });
  }

  /** Download/checksum/ledger verification occurs outside the database lock;
   * then all session/draft/event bindings are checked again under the lock. */
  async accept(
    credential: string,
    input: ConfirmationFence & { confirmationId: string; checkpointId: string },
  ) {
    const f = structuredClone(input);
    const authority = await this.authority(credential, f);
    const session = await this.repository.findSessionById(f.voiceSessionId);
    requireGate(
      session && session.resourceScopeId === authority.resourceScopeId,
      "Unknown session",
    );
    const checkpoint = await this.evidence.requireCheckpoint(
      credential,
      session.callId,
      f.checkpointId,
    );
    return this.locked(f, authority, async (s) => {
      const c = s.confirmation;
      requireGate(
        c &&
          c.confirmationId === f.confirmationId &&
          c.state === "readback_playing" &&
          c.leaseEpoch === f.leaseEpoch &&
          c.mediaEpoch === f.controlCutoff.mediaEpoch &&
          c.snapshotHash === s.draft.snapshotHash &&
          Date.parse(c.expiresAt) > Date.now(),
        "Readback is stale or invalidated",
      );
      const plan = object(c.evidence);
      const rendered = renderVoiceReadback(s.draft.canonicalSnapshot!);
      requireGate(
        plan.readbackScriptHash === rendered.readbackScriptHash &&
          plan.templateVersion === rendered.templateVersion,
        "Readback script changed",
      );
      const coverage = object(checkpoint.coverage);
      const receipt = object(coverage.confirmationReceipt);
      const rb = object(receipt.readback);
      const answer = object(receipt.confirmation);
      const scope = object(receipt.scope);
      requireGate(
        scope.callId === s.session.callId &&
          object(coverage.scope).callId === s.session.callId &&
          receipt.snapshotHash === c.snapshotHash &&
          coverage.snapshotHash === c.snapshotHash &&
          receipt.readbackPlaybackId === c.readbackPlaybackId &&
          coverage.readbackPlaybackId === c.readbackPlaybackId &&
          receipt.mediaEpoch === c.mediaEpoch &&
          coverage.mediaEpoch === c.mediaEpoch,
        "Checkpoint scope mismatch",
      );
      const events = await this.cutoff(s, f);
      const playback = events.find((e) => e.eventId === rb.completedEventId);
      const affirmation = events.find((e) => e.eventId === answer.eventId);
      requireGate(
        playback &&
          affirmation &&
          playback.legId === scope.legId &&
          affirmation.legId === scope.legId &&
          playback.sequence === rb.sequence &&
          affirmation.sequence === answer.sequence &&
          playback.sequence > c.controlSequence &&
          affirmation.sequence > playback.sequence &&
          affirmation.sequence <= f.controlCutoff.controlSequence &&
          affirmation.inputEpoch === f.inputEpoch,
        "Missing ordered readback/answer events",
      );
      requireGate(
        playback.eventType === "playback_completed" &&
          rb.outcome === "completed" &&
          rb.completionSource === "provider_playback",
        "Incomplete playback",
      );
      const played = object(playback.payload);
      const spoken = object(affirmation.payload);
      requireGate(
        played.readbackPlaybackId === c.readbackPlaybackId &&
          played.readbackScriptHash === plan.readbackScriptHash &&
          typeof played.audioVersion === "string" &&
          played.audioVersion.length > 0 &&
          played.completionSource === "provider_playback" &&
          played.outcome === "completed",
        "Controlled audio playback not proven",
      );
      requireGate(
        answer.readbackPlaybackId === c.readbackPlaybackId &&
          answer.snapshotHash === c.snapshotHash &&
          answer.mediaEpoch === c.mediaEpoch &&
          spoken.readbackPlaybackId === c.readbackPlaybackId &&
          spoken.snapshotHash === c.snapshotHash &&
          spoken.replay === false,
        "Answer prompt mismatch or replay",
      );
      const intervening = events.filter(
        (e) =>
          e.sequence > c.controlSequence &&
          e.sequence <= f.controlCutoff.controlSequence,
      );
      requireGate(
        !intervening.some((e) =>
          [
            "clear",
            "playback_cleared",
            "material_edit",
            "language_switch",
            "owner_switch",
            "asr_disconnected",
            "input_unknown",
          ].includes(e.eventType),
        ),
        "Readback invalidated by control event",
      );
      requireGate(
        intervening
          .filter((e) => e.sequence > affirmation.sequence)
          .every((e) => e.eventType === "input_resolved_irrelevant"),
        "New input after affirmation",
      );
      let proof: Record<string, unknown>;
      if (answer.method === "speech") {
        requireGate(
          affirmation.eventType === "asr_final" &&
            spoken.isFinal === true &&
            spoken.vadPassed === true &&
            spoken.echoDetected === false &&
            spoken.competingSpeech === false &&
            spoken.sourceAttribution === "passenger" &&
            spoken.intent === "confirm_booking" &&
            typeof spoken.turnId === "string" &&
            /^[0-9a-f-]{36}$/i.test(spoken.turnId),
          "Untrusted or ambiguous speech",
        );
        requireGate(
          typeof spoken.text === "string" &&
            /^(確認叫車|請幫我叫車|我要叫車|confirm booking|book the taxi)[。.!！]?$/i.test(
              spoken.text.trim(),
            ),
          "Explicit booking consent required",
        );
        proof = { turnId: spoken.turnId, finalEventId: affirmation.eventId };
      } else {
        requireGate(
          answer.method === "dtmf" &&
            affirmation.eventType === "dtmf" &&
            answer.digit === "1" &&
            answer.expectedDigit === "1" &&
            spoken.digit === "1" &&
            spoken.expectedDigit === "1" &&
            spoken.timingSource === "provider",
          "Untrusted DTMF",
        );
        proof = { eventId: affirmation.eventId, digit: "1" };
      }
      const confirmedAt = new Date().toISOString();
      const evidence = {
        ...plan,
        ...proof,
        audioVersion: played.audioVersion,
        checkpointManifestHash: checkpoint.manifestHash,
      };
      await s.tx.query(
        `UPDATE voice.confirmation SET state = 'accepted', confirmation_method = $2,
        readback_completed_event_id = $3, input_epoch = $4, control_sequence = $5,
        recording_checkpoint_id = $6, evidence = $7::jsonb, confirmed_at = $8 WHERE confirmation_id = $1`,
        [
          c.confirmationId,
          answer.method,
          playback.eventId,
          f.inputEpoch,
          f.controlCutoff.controlSequence,
          checkpoint.checkpointId,
          JSON.stringify(evidence),
          confirmedAt,
        ],
      );
      await this.state(s, "accepted");
      return {
        confirmationId: c.confirmationId,
        voiceSessionId: f.voiceSessionId,
        intentId: f.intentId,
        action: c.action,
        draftVersion: f.draftVersion,
        snapshotHash: c.snapshotHash,
        readbackPlaybackId: c.readbackPlaybackId,
        readbackCompletedEventId: playback.eventId,
        inputEpoch: f.inputEpoch,
        controlCutoff: f.controlCutoff,
        leaseEpoch: f.leaseEpoch,
        recordingCheckpointId: checkpoint.checkpointId,
        confirmationMethod: answer.method,
        evidence: proof,
        confirmedAt,
        expiresAt: c.expiresAt,
      };
    });
  }

  /** Unknown input fails closed before the next prompt; ordinary ASR loss must
   * never alter proof already sealed into a pending command. Corrections use
   * replaceDraft, sharing the executor's session -> intent -> confirmation locks. */
  async invalidate(
    credential: string,
    input: ConfirmationFence,
    reason: "unknown_input" | "disconnect",
  ) {
    const f = structuredClone(input);
    const authority = await this.authority(credential, f);
    return this.locked(
      f,
      authority,
      async (s) => {
        if (s.session.commitStatus === "pending") {
          if (reason === "unknown_input")
            await s.tx.query(
              "UPDATE voice.session SET pending_input = true, session_version = session_version + 1 WHERE voice_session_id = $1",
              [f.voiceSessionId],
            );
          return {
            reask: reason === "unknown_input",
            preservedPendingProof: true,
          };
        }
        await s.tx.query(
          "UPDATE voice.confirmation SET state = 'invalidated' WHERE intent_id = $1 AND state IN ('readback_playing','awaiting_answer','accepted')",
          [f.intentId],
        );
        await this.state(s, "invalidated", reason === "unknown_input");
        return { reask: true, preservedPendingProof: false };
      },
      true,
    );
  }

  /** Material edits qualify outside the lock, then append a new immutable
   * revision and invalidate the old proof atomically. Pending receipt/proof
   * payload is never rewritten; its executor observes the changed draft. */
  async replaceDraft(
    credential: string,
    input: ConfirmationFence,
    command: QualifyVoiceBookingCommand,
    pickupNotes = "",
  ) {
    const f = structuredClone(input);
    const nextCommand = structuredClone(command);
    const authority = await this.authority(credential, f);
    const qualified = await this.drafts.qualify(f.voiceSessionId, nextCommand);
    const snapshot = { ...qualified, pickupNotes };
    renderVoiceReadback(snapshot);
    const snapshotHash = voiceSnapshotHash(snapshot);
    return this.locked(
      f,
      authority,
      async (s) => {
        requireGate(
          qualified.bookingQualification.resourceScopeId ===
            s.session.resourceScopeId &&
            Date.parse(qualified.bookingQualification.validUntil) > Date.now(),
          "Stale qualification",
        );
        const version = f.draftVersion + 1;
        await s.tx.query(
          `INSERT INTO voice.draft_revision
        (intent_id, draft_version, slots, validation_refs, canonical_snapshot, snapshot_hash)
        VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6)`,
          [
            f.intentId,
            version,
            JSON.stringify({ qualificationCommand: nextCommand, pickupNotes }),
            JSON.stringify([qualified.bookingRequirements.validationReference]),
            JSON.stringify(snapshot),
            snapshotHash,
          ],
        );
        await s.tx.query(
          "UPDATE voice.intent SET current_draft_version = $2 WHERE intent_id = $1",
          [f.intentId, version],
        );
        await s.tx.query(
          "UPDATE voice.confirmation SET state = 'invalidated' WHERE intent_id = $1 AND state IN ('readback_playing','awaiting_answer','accepted')",
          [f.intentId],
        );
        await s.tx.query(
          `UPDATE voice.session SET confirmation_state = 'invalidated',
        input_epoch = input_epoch + 1, last_resolved_input_epoch = input_epoch + 1,
        pending_input = false, session_version = session_version + 1
        WHERE voice_session_id = $1`,
          [f.voiceSessionId],
        );
        return { draftVersion: version, snapshotHash, reask: true };
      },
      true,
    );
  }

  private async cutoff(s: Locked, f: ConfirmationFence) {
    const cutoff = f.controlCutoff;
    requireGate(
      Number.isSafeInteger(cutoff.controlSequence) &&
        cutoff.controlSequence > 0 &&
        Number.isSafeInteger(cutoff.mediaEpoch) &&
        cutoff.mediaEpoch >= 0 &&
        cutoff.controlSequence === s.session.lastAppliedControlSequence &&
        !s.session.pendingInput &&
        s.session.lastResolvedInputEpoch === s.session.inputEpoch,
      "Control gap or unresolved input",
    );
    const events = await this.repository.listSessionEvents(
      f.voiceSessionId,
      0,
      s.tx,
    );
    const current = events.filter((e) => e.mediaEpoch === cutoff.mediaEpoch);
    requireGate(
      current.length >= cutoff.controlSequence &&
        current.every(
          (e, i) =>
            e.sequence === i + 1 &&
            e.sequence <= cutoff.controlSequence &&
            e.leaseEpoch === f.leaseEpoch &&
            e.providerAccountId === s.session.providerAccountId &&
            e.sourceEventId,
        ),
      "Missing, stale, or unapplied control event",
    );
    return current;
  }
  private async state(s: Locked, state: string, pending = false) {
    await s.tx.query(
      "UPDATE voice.session SET confirmation_state = $2, pending_input = $3, session_version = session_version + 1 WHERE voice_session_id = $1",
      [s.session.voiceSessionId, state, pending],
    );
  }
}
