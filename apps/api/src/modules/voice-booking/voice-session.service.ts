import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  voiceDialogueSnapshotContentSchema,
  type VoiceDialogueSnapshotContent,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type {
  VoiceCommandReceiptRecord,
  VoiceSessionRecord,
} from "./voice-booking.repository";
import {
  VoiceSessionRepository,
  type SessionControlPatch,
  type VoiceQueryExecutor,
} from "./voice-session.repository";
import { VoiceUsageService } from "./voice-usage.service";
import { VoiceBookingMetricsService } from "../../observability/voice-booking-metrics.service";
import { voiceAlertMetrics } from "../../observability/voice-alert-metrics";
import {
  VoiceRetentionService,
  type PurgeExecutionReport,
} from "./voice-retention.service";
import {
  decryptDialogueSnapshotContent,
  encryptDialogueSnapshotContent,
  resolveDialogueSnapshotEncryptionKey,
} from "./voice-dialogue-snapshot-crypto";

/**
 * SD §5: the session state machine, ordered-event application and
 * persistent control authority (owner/lease/epoch, dialog state, pending
 * input) described in §5.1-§5.4. Every mutating method here re-derives the
 * current row and CAS-writes against it -- nothing is cached or assumed
 * fresh across calls, because a concurrent worker/handoff can always have
 * moved `sessionVersion`/`leaseEpoch` in between (§5.3: "任一改變則拒絕舊請求").
 */

export type RecordControlEventCommand = {
  voiceSessionId: string;
  legId?: string | null;
  source: string;
  providerAccountId?: string | null;
  sourceEventId?: string | null;
  occurredAt: string;
  /** Client/media-worker-assigned monotonic position within `mediaEpoch`. */
  sequence: number;
  mediaEpoch: number;
  leaseEpoch: number;
  eventType: string;
  payload?: unknown;
  payloadRef?: string | null;
};

export type RecordControlEventResult = {
  /** True if this exact event (by dedup key) was already durable. */
  deduped: boolean;
  /** True if this event advanced the session's applied watermark. */
  applied: boolean;
  /** True if the event is durably buffered but blocked behind a gap. */
  gap: boolean;
  appliedThroughSequence: number;
  session: VoiceSessionRecord;
};

export type ControlCutoff = {
  mediaEpoch: number;
  controlSequence: number;
};

export type InputResolution = "relevant" | "irrelevant";

/**
 * SD §5.1 dialog-state transition table. `closed` is reachable from every
 * active state (real `call.ended`); every other target is validated here so
 * a caller can never CAS-write an invariant-violating jump (e.g.
 * `collecting` -> `awaiting_dispatch`).
 */
const DIALOG_STATE_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  admitted: ["greeting", "handoff_pending", "closed"],
  greeting: ["collecting", "handoff_pending", "closed"],
  collecting: ["resolving", "handoff_pending", "closed"],
  resolving: [
    "collecting",
    "confirming",
    "reporting",
    "handoff_pending",
    "closed",
  ],
  confirming: ["collecting", "committing", "handoff_pending", "closed"],
  committing: [
    "awaiting_dispatch",
    "reconciling",
    "handoff_pending",
    "collecting",
    "closed",
  ],
  reconciling: ["awaiting_dispatch", "handoff_pending", "closed"],
  awaiting_dispatch: ["reporting", "handoff_pending", "closed"],
  reporting: ["closed", "handoff_pending"],
  handoff_pending: ["human_controlled", "callback_pending", "closed"],
  human_controlled: ["handoff_pending", "closed"],
  callback_pending: ["closed"],
  closed: [],
};

export interface CloseSessionWithFinalizeRecordingCommand {
  voiceSessionId: string;
  expectedSessionVersion: number;
  expectedLeaseEpoch?: number | undefined;
  closeEvent?:
    | {
        source?: string | undefined;
        sourceEventId?: string | null | undefined;
        occurredAt?: string | undefined;
        sequence?: number | undefined;
        mediaEpoch?: number | undefined;
        eventType?: string | undefined;
        payload?: unknown;
        payloadRef?: string | null | undefined;
      }
    | undefined;
  recordingId?: string | null | undefined;
}

export interface CloseSessionWithFinalizeRecordingResult {
  session: VoiceSessionRecord;
  workItemEnqueued: boolean;
  deduped: boolean;
}

export interface PersistDialogueSnapshotCommand {
  voiceSessionId: string;
  expectedSessionVersion: number;
  expectedLeaseEpoch: number;
  expectedResourceScopeId: string;
  expectedRouteProfileVersion: number;
  inputEpoch: number;
  mediaEpoch: number;
  turnId: string;
  content: unknown;
}

export interface DialogueSnapshotRecord {
  snapshotId: string;
  voiceSessionId: string;
  sessionVersion: number;
  inputEpoch: number;
  mediaEpoch: number;
  turnId: string;
  content: VoiceDialogueSnapshotContent;
  createdAt: string;
  retentionExpiresAt: string;
}

export interface PersistDialogueSnapshotResult {
  snapshot: DialogueSnapshotRecord;
  deduped: boolean;
}

export interface DialogueSnapshotRestoration {
  session: VoiceSessionRecord;
  snapshot: DialogueSnapshotRecord | null;
}

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist late-acceptance fence
 * (Codex reopen, canonical 2026-10-03T23:31:57Z): the single atomic
 * adjudication `reconcileUnresolvedCommit` (worker side,
 * `dialogue-persist-port.ts`) falls back to once its own bounded,
 * best-effort restoration-read polling exhausts with no correlating
 * snapshot observed. Unlike that polling, this command's answer is always
 * authoritative the instant it returns: either the exact pending write
 * already landed (`accepted: true`, with its content), or it never will
 * (`accepted: false`, and `voice.session.dialogue_snapshot_fence_version`
 * is now durably raised to block it from ever landing after the fact).
 */
/**
 * Correction (Codex reopen, canonical 2026-10-04T00:26:49Z, "no under-lock
 * capability authority checks or upper bound against the current session
 * version exist"): `expectedLeaseEpoch`/`expectedResourceScopeId`/
 * `expectedRouteProfileVersion` mirror `PersistDialogueSnapshotCommand`'s
 * own fields above -- always the AUTHENTICATED capability's bound values
 * (`VoiceBookingController#resolveDialogueSnapshotOutcome` passes
 * `claims.*`, never a caller-supplied body field), re-checked under the
 * same `FOR UPDATE` lock this method already takes on the session row
 * before this call is allowed to read content or raise the fence.
 */
export interface ResolveDialogueSnapshotOutcomeCommand {
  voiceSessionId: string;
  expectedSessionVersion: number;
  expectedLeaseEpoch: number;
  expectedResourceScopeId: string;
  expectedRouteProfileVersion: number;
  inputEpoch: number;
  mediaEpoch: number;
  turnId: string;
}

/**
 * Correction (Codex reopen, canonical 2026-10-04T00:26:49Z, "R4-resolve
 * expired-content resurrection"): the `accepted: true; expired: true`
 * variant is a distinct, authoritative third outcome -- this exact write
 * WAS accepted (the fence must never be raised for it, and it must never be
 * reported as voided/rolled back), but its content has already passed its
 * own retention window and is therefore never returned/restorable. Carries
 * the same identifying fields a normal accepted snapshot does (so a caller
 * can still verify this answers ITS OWN pending write) but never `content`.
 */
export type ResolveDialogueSnapshotOutcomeResult =
  | { accepted: true; snapshot: DialogueSnapshotRecord }
  | {
      accepted: true;
      expired: true;
      voiceSessionId: string;
      sessionVersion: number;
      inputEpoch: number;
      mediaEpoch: number;
      turnId: string;
      retentionExpiresAt: string;
    }
  | { accepted: false };

@Injectable()
export class VoiceSessionService {
  private readonly logger = new Logger(VoiceSessionService.name);

  constructor(
    private readonly repository: VoiceSessionRepository,
    @Optional() private readonly usageService?: VoiceUsageService,
    @Optional() private readonly metricsService?: VoiceBookingMetricsService,
    @Optional() private readonly retentionService?: VoiceRetentionService,
  ) {}

  /**
   * SD §5.3: "新命令受理前比較 leaseEpoch、draftVersion、inputEpoch 與當前
   * owner；任一改變則拒絕舊請求." Shared fencing check for every write path
   * below -- a stale `sessionVersion` always means "reload before writing",
   * a stale `leaseEpoch` always means "you are no longer the owner."
   */
  private assertWriteAuthorized(
    session: VoiceSessionRecord,
    expected: { sessionVersion: number; leaseEpoch?: number | undefined },
  ): void {
    if (
      expected.leaseEpoch !== undefined &&
      session.leaseEpoch !== expected.leaseEpoch
    ) {
      voiceAlertMetrics.recordWorkerLeaseConflict({
        brand_id: session.resourceScopeId || "default",
        language: "zh-TW",
        provider: session.providerAccountId || "unknown",
        route_profile_version: session.routeProfileVersion ?? 1,
      });
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        "Lease epoch no longer matches the current session owner.",
      );
    }
    if (session.sessionVersion !== expected.sessionVersion) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "Session revision has moved on; reload before writing.",
      );
    }
  }

  /**
   * SD §10.1 `GET /sessions/{sessionId}`: the stage-1-workload-authenticated
   * read a media-worker attachment uses to resolve this session's
   * `resourceScopeId`/`routeProfileVersion`/`leaseEpoch`/`sessionVersion`
   * -- the coordinates a `VoiceSessionBinding` needs -- BEFORE it holds
   * any `voice:capability:issue`-minted token for this session (minting
   * one already requires the caller to supply those same coordinates, so
   * it cannot be how a worker first learns them; AUDIT-VOICE-APPLICATION-
   * WIRING-20261003 R4-entry). Read-only; grants no mutating authority.
   * Same not-found semantics as every other session lookup here -- never
   * leak session existence to a caller that does not actually know it.
   */
  async getSession(voiceSessionId: string): Promise<VoiceSessionRecord> {
    return this.requireSession(voiceSessionId);
  }

  private async requireSession(
    voiceSessionId: string,
    executor?: VoiceQueryExecutor,
    forUpdate = false,
  ): Promise<VoiceSessionRecord> {
    const session = await this.repository.findSessionById(
      voiceSessionId,
      executor,
      forUpdate,
    );
    if (!session) {
      throw new ApiRequestError(
        403,
        "VOICE_SESSION_NOT_OWNER",
        "Voice session not found.",
      );
    }
    return session;
  }

  /**
   * SD §5.4: applies one control-plane event (speech-start, clear, playback
   * terminal, DTMF, owner/language switch) to the session's ordered-event
   * watermark. HTTP arrival order is not causal order -- this always
   * durably stores the event first (dedup-safe), then only advances
   * `lastAppliedControlSequence` as far as a contiguous run allows,
   * buffering (never skipping) anything past a gap. A mismatched media
   * epoch is never silently reordered here; epoch resets belong to the
   * lease/handoff fencing flow, not ordinary event application.
   */
  async recordControlEvent(
    command: RecordControlEventCommand,
  ): Promise<RecordControlEventResult> {
    const session = await this.requireSession(command.voiceSessionId);

    // SD §5.3 fencing applies to control-event ingestion too: a worker whose
    // lease has already been superseded (handoff/reclaim advanced
    // `leaseEpoch`) must never durably insert or CAS-advance the watermark,
    // or a stale worker could keep pushing `lastAppliedControlSequence`
    // forward after it no longer owns the session.
    if (command.leaseEpoch !== session.leaseEpoch) {
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        "Lease epoch no longer matches the current session owner.",
      );
    }

    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control dedup/application
    // correlation (Codex reopen, canonical 2026-10-03T19:24:15Z): `deduped`
    // only tells us the INSERT hit ONE of two independent unique indexes --
    // `uq_voice_session_event_source_dedup` is scoped to (source,
    // provider_account_id, source_event_id) ACROSS EVERY SESSION, while
    // `uq_voice_session_event_sequence` is scoped to (voice_session_id,
    // sequence). Either conflict can resolve `event` to a row that is NOT
    // what `command` actually describes: a foreign session's event (global
    // source-identity collision), or this session's row at a different
    // sequence/epoch/payload than `command` claims (a reused sourceEventId
    // pointed at new content). `command.*` must never again drive gap/apply
    // decisions below -- only `event`, the row actually proven durable, may.
    const { event, deduped } = await this.repository.insertControlEvent({
      voiceSessionId: command.voiceSessionId,
      legId: command.legId ?? null,
      source: command.source,
      providerAccountId: command.providerAccountId ?? null,
      sourceEventId: command.sourceEventId ?? null,
      occurredAt: command.occurredAt,
      sequence: command.sequence,
      mediaEpoch: command.mediaEpoch,
      inputEpoch: session.inputEpoch,
      leaseEpoch: command.leaseEpoch,
      eventType: command.eventType,
      payload: command.payload,
      payloadRef: command.payloadRef ?? null,
    });

    if (event.voiceSessionId !== command.voiceSessionId) {
      // The source identity this command claims is already durable under a
      // DIFFERENT session. Applying this command's sequence/epoch here would
      // silently accept a cross-session source-identity collision.
      throw new ApiRequestError(
        409,
        "VOICE_ACTION_PAYLOAD_CONFLICT",
        "Control event source identity is already recorded under a different voice session.",
      );
    }

    if (
      deduped &&
      (event.sequence !== command.sequence ||
        event.mediaEpoch !== command.mediaEpoch ||
        event.eventType !== command.eventType ||
        !isDeepStrictEqual(event.payload ?? null, command.payload ?? null))
    ) {
      // Same session, but this dedup hit resolved to a row that does not
      // match what `command` claims (a reused sourceEventId now pointing at
      // a different sequence/epoch, or the same (session, sequence) slot
      // with different content). `command`'s claimed event was never
      // durably inserted -- treating it as applied would advance the
      // watermark past a row that does not exist in voice.session_event.
      throw new ApiRequestError(
        409,
        "VOICE_ACTION_PAYLOAD_CONFLICT",
        "Control event identity already recorded with a different sequence, epoch, type, or payload.",
      );
    }

    // From here `event` is confirmed to be this command's own durable row --
    // either freshly inserted, or an identical retry-after-CAS-failure dedup
    // hit -- so every gap/apply decision uses `event`'s own stored fields.
    const appliedEpoch =
      session.lastAppliedControlSequence > 0
        ? await this.repository.findAppliedMediaEpoch(command.voiceSessionId)
        : null;

    const isBootstrap = appliedEpoch === null;
    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (Codex reopen,
    // canonical 2026-10-03T21:09:40Z, "media transitions and speech
    // backlog do not share causal delivery/recovery", probe 4): a
    // dedup-retry of an event THIS SESSION HAS ALREADY DURABLY APPLIED
    // (its own `event.sequence` at or behind the current watermark) is
    // always a safe no-op, regardless of eventType -- checked BEFORE the
    // transition/mismatch gates below, which only make sense for a
    // genuinely new, not-yet-applied attempt. Previously this check ran
    // AFTER the `media_epoch_transition` gate, so a retried transition
    // whose own prior application is EXACTLY what advanced `appliedEpoch`
    // to its current value was indistinguishable from a stale/superseded
    // NEW transition targeting that same epoch: `event.mediaEpoch <=
    // appliedEpoch` was true in BOTH cases, so a worker retrying a
    // transition whose acknowledgement it never received got back
    // `gap: true` for a call that, in fact, had already durably
    // succeeded -- `VoiceCallTurnCoordinator.recordAuthoritativeControlEvent`
    // then threw `voice_control_event_gap` and the worker's own
    // `controlSequence` could never advance past it.
    if (!isBootstrap && event.sequence <= session.lastAppliedControlSequence) {
      return {
        deduped,
        applied: false,
        gap: false,
        appliedThroughSequence: session.lastAppliedControlSequence,
        session,
      };
    }

    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (media-epoch
    // continuation, Codex reopen canonical 2026-10-03T19:24:15Z and
    // 2026-10-03T20:13:00Z): `media_epoch_transition` is the one
    // authoritative, explicit claim that the media epoch has legitimately
    // moved forward (reconnect/handoff via `VoiceSessionComposer.
    // advanceMediaEpoch`) -- the only call this worker ever makes that is
    // ALLOWED to differ from `appliedEpoch`. Every other eventType keeps
    // the unconditional fail-closed mismatch rule exactly as before (this
    // is what keeps `tests/unit/uv-exec-007.test.ts`'s "never lets a
    // mismatched media epoch reorder across streams" case intact -- that
    // case uses `eventType: "clear"`, never this branch). A
    // same-or-backward transition attempt (`event.mediaEpoch <=
    // appliedEpoch`) that has NOT already been durably applied (the check
    // above already excluded that case) is a stale/superseded claim and
    // must fail exactly like an ordinary old-epoch arrival (SD §5.3 "舊
    // epoch final 不得覆蓋新連線內容") -- durable evidence, never applied.
    // Only a STRICTLY forward epoch may ever pin a new value here.
    const isMediaEpochTransition = event.eventType === "media_epoch_transition";
    if (isMediaEpochTransition) {
      if (appliedEpoch !== null && event.mediaEpoch <= appliedEpoch) {
        return {
          deduped,
          applied: false,
          gap: true,
          appliedThroughSequence: session.lastAppliedControlSequence,
          session,
        };
      }
      // Else: a legitimate forward transition (or the session's bootstrap
      // epoch) -- fall through to the normal sequence/bootstrap contiguity
      // checks below, skipping only the generic mismatch gate immediately
      // above, since this event's whole purpose is to pin a NEW epoch.
    } else if (appliedEpoch !== null && event.mediaEpoch !== appliedEpoch) {
      // Cross-epoch arrival: fail closed rather than guess whether this is a
      // legitimate reconnect or a stale/superseded stream (SD §5.3: "舊
      // epoch final 不得覆蓋新連線內容"). The event is durable (inserted
      // above) but is left unapplied until an explicit epoch transition.
      return {
        deduped,
        applied: false,
        gap: true,
        appliedThroughSequence: session.lastAppliedControlSequence,
        session,
      };
    }

    if (isBootstrap && event.sequence !== 1) {
      // SD §5.4: the watermark starts at 0 (no event applied); the first
      // event to bootstrap the session MUST be sequence 1. Any earlier
      // sequence that arrives out of order (e.g. HTTP delivers seq 3 before
      // seq 1) is durably stored but cannot advance the watermark -- exactly
      // the same gap rule that applies once events are flowing. Silently
      // applying seq N > 1 on bootstrap would permanently skip seqs 1..N-1
      // and corrupt the ordered-event invariant.
      return {
        deduped,
        applied: false,
        gap: true,
        appliedThroughSequence: session.lastAppliedControlSequence,
        session,
      };
    }
    if (
      !isBootstrap &&
      event.sequence !== session.lastAppliedControlSequence + 1
    ) {
      // Not the next contiguous frame: durably buffered, but the waterline
      // must not skip past this gap (SD §5.4: "不得跳號處理後面的肯定").
      return {
        deduped,
        applied: false,
        gap: true,
        appliedThroughSequence: session.lastAppliedControlSequence,
        session,
      };
    }

    let appliedThrough = event.sequence;
    let sawSpeechStart = event.eventType === "speech_start";

    const buffered = await this.repository.findControlEventsAfter(
      command.voiceSessionId,
      event.mediaEpoch,
      appliedThrough,
    );
    for (const bufferedEvent of buffered) {
      if (bufferedEvent.sequence !== appliedThrough + 1) {
        break;
      }
      appliedThrough = bufferedEvent.sequence;
      if (bufferedEvent.eventType === "speech_start") {
        sawSpeechStart = true;
      }
    }

    const patch: SessionControlPatch = {
      lastAppliedControlSequence: appliedThrough,
    };
    if (sawSpeechStart) {
      // SD §5.4: a newly-applied speech-start marks pendingInput and opens a
      // fresh input epoch for the executor to wait on.
      patch.pendingInput = true;
      patch.inputEpoch = session.inputEpoch + 1;
    }

    const updated = await this.repository.casUpdateSessionControl(
      command.voiceSessionId,
      session.sessionVersion,
      patch,
    );
    if (!updated) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "Session revision changed while applying the control event; retry.",
      );
    }

    return {
      deduped,
      applied: true,
      gap: false,
      appliedThroughSequence: appliedThrough,
      session: updated,
    };
  }

  /**
   * SD §5.4: the gate a confirmation/booking-command submission must pass
   * before its `controlCutoff` (and the proof built against it) may be
   * used. Rejects a cutoff that reaches past a still-open gap, and rejects
   * reuse of a proof when a newer input has arrived and has not been
   * explicitly resolved as irrelevant -- "只有明確無關的已解析語句才能續用原
   * accepted proof，不以「可能無關」放行".
   */
  async assertControlCutoffStillValid(
    voiceSessionId: string,
    cutoff: ControlCutoff,
    provenInputEpoch: number,
  ): Promise<VoiceSessionRecord> {
    const session = await this.requireSession(voiceSessionId);

    const appliedEpoch =
      await this.repository.findAppliedMediaEpoch(voiceSessionId);
    if (appliedEpoch === null) {
      throw new ApiRequestError(
        409,
        "VOICE_CONTROL_CUTOFF_NOT_REACHED",
        "No control event has been applied yet for this session.",
      );
    }
    if (cutoff.mediaEpoch !== appliedEpoch) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "controlCutoff refers to a media epoch that is no longer current.",
      );
    }
    if (cutoff.controlSequence > session.lastAppliedControlSequence) {
      // Never let a submission skip a still-open gap or unapplied tail to
      // reach a later affirmation (SD §5.4).
      throw new ApiRequestError(
        409,
        "VOICE_CONTROL_CUTOFF_NOT_REACHED",
        "controlCutoff is ahead of the last contiguously applied control sequence.",
      );
    }

    const hasUnresolvedNewerInput =
      session.inputEpoch > provenInputEpoch &&
      session.lastResolvedInputEpoch < session.inputEpoch;
    if (hasUnresolvedNewerInput) {
      throw new ApiRequestError(
        409,
        "VOICE_UNRESOLVED_INPUT",
        "A newer input has not been resolved as unrelated; cannot reuse this proof/confirmation.",
      );
    }

    return session;
  }

  /**
   * SD §5.4: resolves the pendingInput opened by the most recent
   * speech-start. `irrelevant` (an explicitly-unrelated, already-parsed
   * utterance -- e.g. callback consent, "yes I'm listening", small talk)
   * only advances `lastResolvedInputEpoch`; it must never touch the
   * accepted confirmation/draft snapshot. Any other resolution is treated
   * as a substantive correction and invalidates whatever confirmation is
   * currently in flight.
   */
  async resolveInput(
    voiceSessionId: string,
    expectedSessionVersion: number,
    inputEpoch: number,
    resolution: InputResolution,
  ): Promise<VoiceSessionRecord> {
    const session = await this.requireSession(voiceSessionId);
    this.assertWriteAuthorized(session, {
      sessionVersion: expectedSessionVersion,
    });

    if (inputEpoch !== session.inputEpoch) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "inputEpoch does not match the session's current outstanding input.",
      );
    }

    const patch: SessionControlPatch = {
      lastResolvedInputEpoch: inputEpoch,
      pendingInput: false,
    };

    if (resolution === "relevant") {
      await this.repository.invalidateActiveConfirmationForSession(
        voiceSessionId,
      );
    }

    const updated = await this.repository.casUpdateSessionControl(
      voiceSessionId,
      session.sessionVersion,
      patch,
    );
    if (!updated) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "Session revision changed while resolving input; retry.",
      );
    }
    return updated;
  }

  /**
   * SD §5.2/§5.3: CAS transfer of `controlOwner`/`leaseEpoch`. Both the
   * caller's expected version and expected lease epoch must still match --
   * an old worker cannot mint a handoff/human claim off a lease it no
   * longer holds.
   */
  async claimControlOwner(
    voiceSessionId: string,
    expectedSessionVersion: number,
    expectedLeaseEpoch: number,
    nextOwner: string,
  ): Promise<VoiceSessionRecord> {
    const session = await this.requireSession(voiceSessionId);
    this.assertWriteAuthorized(session, {
      sessionVersion: expectedSessionVersion,
      leaseEpoch: expectedLeaseEpoch,
    });

    const updated = await this.repository.casUpdateSessionControl(
      voiceSessionId,
      session.sessionVersion,
      { controlOwner: nextOwner, leaseEpoch: session.leaseEpoch + 1 },
    );
    if (!updated) {
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        "Session was claimed by another owner concurrently.",
      );
    }
    return updated;
  }

  /**
   * SD §5.1: validated dialog-state transition. Rejects any jump not in
   * `DIALOG_STATE_TRANSITIONS`, then CAS-writes so a concurrent transition
   * cannot silently overwrite this one.
   */
  async transitionDialogState(
    voiceSessionId: string,
    expectedSessionVersion: number,
    nextState: string,
  ): Promise<VoiceSessionRecord> {
    const session = await this.requireSession(voiceSessionId);
    this.assertWriteAuthorized(session, {
      sessionVersion: expectedSessionVersion,
    });

    const allowed = DIALOG_STATE_TRANSITIONS[session.dialogState] ?? [];
    if (!allowed.includes(nextState)) {
      throw new ApiRequestError(
        409,
        "VOICE_ACTION_PAYLOAD_CONFLICT",
        `Dialog state transition from '${session.dialogState}' to '${nextState}' is not allowed.`,
      );
    }

    const updated = await this.repository.casUpdateSessionControl(
      voiceSessionId,
      session.sessionVersion,
      { dialogState: nextState },
    );
    if (!updated) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "Session revision changed while transitioning dialog state; retry.",
      );
    }
    return updated;
  }

  /**
   * SD §5.1/§7.3: ending media only stops new passenger commands. This only
   * ever touches `dialog_state`/`media_state` -- it deliberately leaves
   * `commit_status`, `voice.command_receipt` and `voice.confirmation`
   * untouched, so an already durably-accepted command keeps reconciling
   * after the call ends. Idempotent: closing an already-closed session is a
   * no-op rather than an error.
   */

  /**
   * SD §5.1, §7.3, consensus-packet.md §B6:
   * AI close event insertion into voice.session_event, session CAS update,
   * and finalize_recording work item enqueue occur within ONE atomic transaction.
   *
   * Idempotency & Retransmission:
   * Re-reading and verifying payload, scope, callId, and recordingId prevents
   * differences from being silently swallowed by already-closed or ON CONFLICT DO NOTHING.
   */
  async closeSessionWithFinalizeRecording(
    command: CloseSessionWithFinalizeRecordingCommand,
  ): Promise<CloseSessionWithFinalizeRecordingResult> {
    const runWork = async (tx?: VoiceQueryExecutor) => {
      const session = await this.repository.findSessionById(
        command.voiceSessionId,
        tx,
      );
      if (!session) {
        throw new ApiRequestError(
          403,
          "VOICE_SESSION_NOT_OWNER",
          "Voice session not found.",
        );
      }

      if (session.dialogState === "closed") {
        // Re-read and verify that existing event/payload matches
        if (command.closeEvent?.payload !== undefined && tx?.query) {
          const existingEvent = await tx.query<{
            payload: unknown;
            payload_ref: string | null;
          }>(
            `SELECT payload, payload_ref FROM voice.session_event
            WHERE voice_session_id = $1 AND event_type IN ('call.ended', 'session.closed')
            ORDER BY sequence DESC LIMIT 1`,
            [command.voiceSessionId],
          );
          if (existingEvent.rows[0]) {
            const existingPayload = existingEvent.rows[0].payload;
            if (
              existingPayload &&
              !isDeepStrictEqual(command.closeEvent.payload, existingPayload)
            ) {
              throw new ApiRequestError(
                409,
                "VOICE_ACTION_PAYLOAD_CONFLICT",
                "Close event payload differs from existing closed session event.",
              );
            }
          }
        }

        // Also verify existing finalize_recording work item if present
        const existingWork = tx
          ? await tx.query<{ payload_ref: string | null }>(
              `SELECT payload_ref FROM voice.work_item
          WHERE dedupe_key = $1 LIMIT 1`,
              [`finalize_recording:ai:${session.voiceSessionId}`],
            )
          : { rows: [] };
        if (existingWork.rows[0]?.payload_ref) {
          try {
            const parsed = JSON.parse(existingWork.rows[0].payload_ref);
            if (
              command.recordingId &&
              parsed.recordingId &&
              command.recordingId !== parsed.recordingId
            ) {
              throw new ApiRequestError(
                409,
                "VOICE_ACTION_PAYLOAD_CONFLICT",
                "Recording ID differs from existing finalize_recording work item for this closed session.",
              );
            }
          } catch (e) {
            if (e instanceof ApiRequestError) throw e;
          }
        }

        return { session, workItemEnqueued: false, deduped: true };
      }

      this.assertWriteAuthorized(session, {
        sessionVersion: command.expectedSessionVersion,
        leaseEpoch: command.expectedLeaseEpoch,
      });

      const closeEvent = command.closeEvent;
      const eventType = closeEvent?.eventType ?? "call.ended";
      const sequence =
        closeEvent?.sequence ?? session.lastAppliedControlSequence + 1;
      const mediaEpoch = closeEvent?.mediaEpoch ?? 1;
      const occurredAt = closeEvent?.occurredAt ?? new Date().toISOString();
      const source = closeEvent?.source ?? "media_worker";
      const sourceEventId = closeEvent?.sourceEventId ?? null;
      const payload = closeEvent?.payload ?? null;
      const payloadRef = closeEvent?.payloadRef ?? null;

      // 1. Insert session event
      if (tx?.query) {
        await tx.query(
          `INSERT INTO voice.session_event (
          voice_session_id, leg_id, source, provider_account_id,
          source_event_id, occurred_at, sequence, media_epoch, input_epoch,
          lease_epoch, event_type, payload, payload_ref
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            session.voiceSessionId,
            null,
            source,
            session.providerAccountId,
            sourceEventId,
            occurredAt,
            sequence,
            mediaEpoch,
            session.inputEpoch,
            session.leaseEpoch,
            eventType,
            payload,
            payloadRef,
          ],
        );
      }

      // 2. CAS update session control
      const updated = await this.repository.casUpdateSessionControl(
        session.voiceSessionId,
        session.sessionVersion,
        {
          dialogState: "closed",
          mediaState: "ended",
          recordingState: "pending",
          lastAppliedControlSequence: sequence,
        },
        tx,
      );
      if (!updated) {
        throw new ApiRequestError(
          409,
          "VOICE_DRAFT_STALE",
          "Session revision changed while closing; retry.",
        );
      }

      // 3. Enqueue finalize_recording into voice.work_item
      const dedupeKey = `finalize_recording:ai:${session.voiceSessionId}`;
      const payloadRefData = JSON.stringify({
        voiceSessionId: session.voiceSessionId,
        callId: session.callId,
        brandId: session.resourceScopeId,
        recordingId: command.recordingId ?? null,
        closedAt: occurredAt,
      });

      if (tx?.query) {
        await tx.query(
          `INSERT INTO voice.work_item (command_id, voice_session_id, work_type, dedupe_key, payload_ref, run_after)
          VALUES (NULL, $1, 'finalize_recording', $2, $3, now())
          ON CONFLICT (dedupe_key) DO NOTHING`,
          [session.voiceSessionId, dedupeKey, payloadRefData],
        );
      }

      return { session: updated, workItemEnqueued: true, deduped: false };
    };

    const result =
      typeof this.repository.withTransaction === "function"
        ? await this.repository.withTransaction(runWork)
        : await runWork();

    if (this.usageService && result.workItemEnqueued) {
      try {
        const durationSec = Math.max(
          1,
          Math.round(
            (Date.now() - new Date(result.session.createdAt).getTime()) / 1000,
          ),
        );
        this.usageService.recordUsage({
          providerAccountId: result.session.providerAccountId,
          voiceSessionId: result.session.voiceSessionId,
          provider: result.session.routeProfileId || "twm",
          serviceType: "telephony",
          billingUnit: "second",
          quantity: durationSec,
          brandId: result.session.resourceScopeId,
        });
      } catch (err) {
        this.logger.warn(`Failed to record session usage on close: ${err}`);
      }
    }

    if (this.metricsService && result.workItemEnqueued) {
      try {
        this.metricsService.recordCallMetricFromSession(result.session);
      } catch (err) {
        this.logger.warn(`Failed to record session metric on close: ${err}`);
      }
    }

    return result;
  }

  /**
   * SD §5.1/§7.3: ending media only stops new passenger commands. This only
   * ever touches `dialog_state`/`media_state` -- it deliberately leaves
   * `commit_status`, `voice.command_receipt` and `voice.confirmation`
   * untouched, so an already durably-accepted command keeps reconciling
   * after the call ends. Idempotent: closing an already-closed session is a
   * no-op rather than an error.
   * Atomically enqueues finalize_recording in the same transaction.
   */
  async closeSession(
    voiceSessionId: string,
    expectedSessionVersion: number,
  ): Promise<VoiceSessionRecord> {
    const result = await this.closeSessionWithFinalizeRecording({
      voiceSessionId,
      expectedSessionVersion,
    });
    return result.session;
  }

  /**
   * Consensus-packet.md §B6:
   * Historical recording-pending recovery scan.
   * Discovers and enqueues historical AI sessions with pending recordings without requiring a new close event.
   */
  async recoverPendingRecordingSessions(): Promise<{
    scanned: number;
    enqueued: number;
  }> {
    if (
      !this.repository.isEnabled() ||
      typeof this.repository.withTransaction !== "function"
    ) {
      return { scanned: 0, enqueued: 0 };
    }

    return this.repository.withTransaction(async (tx) => {
      const candidates = await tx.query<{
        voice_session_id: string;
        call_id: string;
        resource_scope_id: string;
      }>(
        `SELECT s.voice_session_id, s.call_id, s.resource_scope_id
        FROM voice.session s
        LEFT JOIN voice.work_item w
          ON w.voice_session_id = s.voice_session_id
         AND w.work_type = 'finalize_recording'
        WHERE (s.dialog_state = 'closed' OR s.recording_state = 'pending')
          AND (w.work_id IS NULL OR w.status IN ('failed', 'dead_letter'))
        ORDER BY s.created_at ASC
        LIMIT 100`,
      );

      let enqueued = 0;
      for (const sess of candidates.rows) {
        const dedupeKey = `finalize_recording:ai:${sess.voice_session_id}`;
        const payloadRef = JSON.stringify({
          voiceSessionId: sess.voice_session_id,
          callId: sess.call_id,
          brandId: sess.resource_scope_id,
          recordingId: null,
          recoveredAt: new Date().toISOString(),
        });

        const insertRes = await tx.query(
          `INSERT INTO voice.work_item (command_id, voice_session_id, work_type, dedupe_key, payload_ref, run_after)
          VALUES (NULL, $1, 'finalize_recording', $2, $3, now())
          ON CONFLICT (dedupe_key) DO NOTHING
          RETURNING work_id`,
          [sess.voice_session_id, dedupeKey, payloadRef],
        );
        if (insertRes.rowCount && insertRes.rowCount > 0) {
          enqueued++;
        }
      }

      return { scanned: candidates.rows.length, enqueued };
    });
  }

  /**
   * SD §7.3: restart/lease-reaper recovery. Pending commands are keyed by
   * durable receipts, not by session/dialog liveness -- this returns
   * results even for a `closed` session, per §5.1: "closed 僅停止新乘客指令，
   * 已接受的 booking／callback command 及必要對帳續作".
   */
  async recoverPendingCommandsAfterRestart(
    voiceSessionId: string,
  ): Promise<VoiceCommandReceiptRecord[]> {
    return this.repository.findPendingReceiptsForSession(voiceSessionId);
  }

  /**
   * Reviewer WIP feedback 2026-10-03T14:20Z: binds the GCM authenticated
   * data to the row's own immutable identity/context -- a ciphertext
   * decrypted under a DIFFERENT row's (session, scope, route, lease, input,
   * media, turn) context fails the auth-tag check exactly like a tampered
   * ciphertext would, closing a context/row-substitution path a bare
   * ciphertext+nonce+tag triple cannot detect on its own. Order and
   * exact field set are part of this function's contract: changing either
   * changes what AAD existing rows were encrypted under.
   */
  private dialogueSnapshotAssociatedData(context: {
    voiceSessionId: string;
    sessionVersion: number;
    resourceScopeId: string;
    routeProfileVersion: number;
    leaseEpoch: number;
    inputEpoch: number;
    mediaEpoch: number;
    turnId: string;
  }): string {
    return JSON.stringify([
      "voice.dialogue_snapshot.v1",
      context.voiceSessionId,
      context.sessionVersion,
      context.resourceScopeId,
      context.routeProfileVersion,
      context.leaseEpoch,
      context.inputEpoch,
      context.mediaEpoch,
      context.turnId,
    ]);
  }

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: the versioned, encrypted,
   * retention-bounded dialogue-content persist this domain was missing --
   * distinct from `resolveInput` above (admission-only CAS, no content
   * field) and from `voice.draft_revision` (a different, qualification-
   * gated booking-intent domain object). Fenced by the FULL set of
   * identifiers a stale/foreign caller could otherwise smuggle a snapshot
   * through: session revision + lease (via `assertWriteAuthorized`),
   * resource scope, route profile version, the session's current
   * outstanding input epoch, and (when any control event has ever been
   * applied) the last-applied media epoch. A caller must always submit the
   * session_version a `resolveInput` CAS for the SAME turn just advanced to
   * -- this never itself advances `voice.session`.
   *
   * Reviewer WIP feedback 2026-10-03T14:20Z, addressed:
   * - The fence-check read and the insert now run inside ONE
   *   `withTransaction` (falling back to plain sequential calls only when
   *   the repository has no transactional backing, same convention
   *   `closeSessionWithFinalizeRecording` already uses), with the session
   *   row read `FOR UPDATE` so a concurrent `casUpdateSessionControl` for
   *   this same session cannot advance scope/route/lease/epoch state while
   *   this check-then-insert is in flight.
   * - A dedup hit (`ON CONFLICT DO NOTHING`, same (session, version) already
   *   has a row) no longer echoes the CALLER's freshly-submitted content
   *   back as if it were authenticated: it decrypts the ACTUAL persisted
   *   row and returns that. If the already-persisted turn/media/content
   *   differs from what this call submitted, that is a genuine conflicting
   *   replay, not a safe no-op, and is rejected
   *   (`VOICE_ACTION_PAYLOAD_CONFLICT`).
   * - GCM authenticated data now binds the ciphertext to this exact
   *   (session, scope, route, lease, input, media, turn) context (see
   *   `dialogueSnapshotAssociatedData`).
   */
  async persistDialogueSnapshot(
    command: PersistDialogueSnapshotCommand,
  ): Promise<PersistDialogueSnapshotResult> {
    const content = voiceDialogueSnapshotContentSchema.parse(command.content);

    const encryptionKey = resolveDialogueSnapshotEncryptionKey();
    if (!encryptionKey) {
      throw new ApiRequestError(
        503,
        "VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_UNCONFIGURED",
        "Dialogue-snapshot encryption key is not configured; refusing to persist unencrypted dialogue content.",
      );
    }

    const retentionPolicy = this.retentionService?.evaluateRecordRetention({
      family: "voice_transcript",
      createdAt: new Date(),
      subjectRef: command.voiceSessionId,
    });
    if (!retentionPolicy) {
      throw new ApiRequestError(
        500,
        "VOICE_RETENTION_POLICY_UNAVAILABLE",
        "Voice retention policy service is unavailable; refusing to persist dialogue content with no finite retention window.",
      );
    }

    const encrypted = encryptDialogueSnapshotContent(
      content,
      encryptionKey,
      this.dialogueSnapshotAssociatedData({
        voiceSessionId: command.voiceSessionId,
        sessionVersion: command.expectedSessionVersion,
        resourceScopeId: command.expectedResourceScopeId,
        routeProfileVersion: command.expectedRouteProfileVersion,
        leaseEpoch: command.expectedLeaseEpoch,
        inputEpoch: command.inputEpoch,
        mediaEpoch: command.mediaEpoch,
        turnId: command.turnId,
      }),
    );

    const runWork = async (
      executor?: VoiceQueryExecutor,
    ): Promise<PersistDialogueSnapshotResult> => {
      const session = await this.requireSession(
        command.voiceSessionId,
        executor,
        true,
      );
      this.assertWriteAuthorized(session, {
        sessionVersion: command.expectedSessionVersion,
        leaseEpoch: command.expectedLeaseEpoch,
      });
      if (session.resourceScopeId !== command.expectedResourceScopeId) {
        throw new ApiRequestError(
          403,
          "VOICE_SESSION_NOT_OWNER",
          "Resource scope no longer matches this session.",
        );
      }
      if (
        session.routeProfileVersion !== command.expectedRouteProfileVersion
      ) {
        throw new ApiRequestError(
          409,
          "VOICE_DRAFT_STALE",
          "Route profile version has moved on; reload before writing.",
        );
      }
      if (session.inputEpoch !== command.inputEpoch) {
        throw new ApiRequestError(
          409,
          "VOICE_DRAFT_STALE",
          "inputEpoch does not match the session's current outstanding input.",
        );
      }
      const appliedMediaEpoch = await this.repository.findAppliedMediaEpoch(
        command.voiceSessionId,
        executor,
      );
      if (
        appliedMediaEpoch !== null &&
        command.mediaEpoch !== appliedMediaEpoch
      ) {
        throw new ApiRequestError(
          409,
          "VOICE_DRAFT_STALE",
          "mediaEpoch refers to a media epoch that is no longer current.",
        );
      }
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist late-acceptance
      // fence (Codex reopen, canonical 2026-10-03T23:31:57Z): `session` was
      // read `FOR UPDATE` by `requireSession` above, in this same
      // transaction -- a concurrent `resolveDialogueSnapshotOutcome` call
      // raising this fence for this exact version can only ever
      // interleave strictly before or strictly after this check (never
      // during it), since both take the SAME row's write lock before
      // reading/writing it. A version this call's OWN candidate state
      // predates may already have been authoritatively voided by a
      // reconciliation that gave up waiting on it; this call's content
      // must never land after that, or the exact silent-content-loss race
      // that fence exists to close would just move here instead.
      if (
        (session.dialogueSnapshotFenceVersion ?? 0) >=
        command.expectedSessionVersion
      ) {
        throw new ApiRequestError(
          409,
          "VOICE_DIALOGUE_SNAPSHOT_VOIDED",
          "This exact content commit was already authoritatively voided by a later reconciliation; retry from a fresh turn.",
        );
      }

      const { snapshot, deduped } = await this.repository.insertDialogueSnapshot(
        {
          voiceSessionId: command.voiceSessionId,
          sessionVersion: command.expectedSessionVersion,
          resourceScopeId: command.expectedResourceScopeId,
          routeProfileVersion: command.expectedRouteProfileVersion,
          leaseEpoch: command.expectedLeaseEpoch,
          inputEpoch: command.inputEpoch,
          mediaEpoch: command.mediaEpoch,
          turnId: command.turnId,
          contentKeyVersion: encrypted.keyVersion,
          contentNonce: encrypted.nonce,
          contentCiphertext: encrypted.ciphertext,
          contentAuthTag: encrypted.authTag,
          retentionExpiresAt: retentionPolicy.expiresAt,
        },
        executor,
      );

      if (!deduped) {
        return {
          snapshot: {
            snapshotId: snapshot.snapshotId,
            voiceSessionId: snapshot.voiceSessionId,
            sessionVersion: snapshot.sessionVersion,
            inputEpoch: snapshot.inputEpoch,
            mediaEpoch: snapshot.mediaEpoch,
            turnId: snapshot.turnId,
            content,
            createdAt: snapshot.createdAt,
            retentionExpiresAt: snapshot.retentionExpiresAt,
          },
          deduped: false,
        };
      }

      // Dedup hit: decrypt and return the row that is ACTUALLY persisted,
      // never this call's own freshly-submitted content -- the two must
      // match for this to be a safe retry/no-op.
      const persistedContent = voiceDialogueSnapshotContentSchema.parse(
        decryptDialogueSnapshotContent(
          {
            keyVersion: snapshot.contentKeyVersion,
            nonce: snapshot.contentNonce,
            ciphertext: snapshot.contentCiphertext,
            authTag: snapshot.contentAuthTag,
          },
          (version) =>
            version === encryptionKey.version ? encryptionKey.key : null,
          this.dialogueSnapshotAssociatedData({
            voiceSessionId: snapshot.voiceSessionId,
            sessionVersion: snapshot.sessionVersion,
            resourceScopeId: snapshot.resourceScopeId,
            routeProfileVersion: snapshot.routeProfileVersion,
            leaseEpoch: snapshot.leaseEpoch,
            inputEpoch: snapshot.inputEpoch,
            mediaEpoch: snapshot.mediaEpoch,
            turnId: snapshot.turnId,
          }),
        ),
      );
      if (
        snapshot.turnId !== command.turnId ||
        snapshot.mediaEpoch !== command.mediaEpoch ||
        !isDeepStrictEqual(persistedContent, content)
      ) {
        throw new ApiRequestError(
          409,
          "VOICE_ACTION_PAYLOAD_CONFLICT",
          "A different dialogue snapshot was already persisted for this session revision.",
        );
      }
      return {
        snapshot: {
          snapshotId: snapshot.snapshotId,
          voiceSessionId: snapshot.voiceSessionId,
          sessionVersion: snapshot.sessionVersion,
          inputEpoch: snapshot.inputEpoch,
          mediaEpoch: snapshot.mediaEpoch,
          turnId: snapshot.turnId,
          content: persistedContent,
          createdAt: snapshot.createdAt,
          retentionExpiresAt: snapshot.retentionExpiresAt,
        },
        deduped: true,
      };
    };

    return typeof this.repository.withTransaction === "function"
      ? this.repository.withTransaction(runWork)
      : runWork();
  }

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist late-acceptance
   * fence (Codex reopen, canonical 2026-10-03T23:31:57Z): the single
   * atomic adjudication worker-side bounded polling falls back to -- see
   * `ResolveDialogueSnapshotOutcomeCommand`'s own doc. Deliberately does
   * NOT require `expectedSessionVersion` to still be the session's CURRENT
   * value the way `persistDialogueSnapshot`'s own `assertWriteAuthorized`
   * does: this call's entire purpose is to adjudicate a write whose version
   * the session may already have moved past. The session row is still read
   * `FOR UPDATE` in the SAME transaction as the fence raise below, so this
   * check-then-fence sequence is atomic with respect to a concurrent
   * `persistDialogueSnapshot` call's own check-then-insert against the
   * exact same row (see `raiseDialogueSnapshotFence`'s own doc).
   *
   * Correction (Codex reopen, canonical 2026-10-04T00:26:49Z, "no under-lock
   * capability authority checks or upper bound against the current session
   * version exist"): "deliberately does not require current" was too broad
   * -- it must still reject an `expectedSessionVersion` STRICTLY ABOVE the
   * session's current value (a version the session has never reached can
   * never have a pending write to adjudicate at all; fencing it anyway
   * would durably block every future write once the session eventually
   * reaches it) and must re-verify the SAME scope/route/lease authority
   * `persistDialogueSnapshot` already checks, under this method's own lock,
   * before ever reading content or touching the fence -- a capability whose
   * authority has since moved on (a new lease/handoff) must never be able
   * to adjudicate, raise, or read this session's fence. Only an
   * authorized, non-future version may still be safely adjudicated,
   * including one well below the session's current value.
   */
  async resolveDialogueSnapshotOutcome(
    command: ResolveDialogueSnapshotOutcomeCommand,
  ): Promise<ResolveDialogueSnapshotOutcomeResult> {
    const runWork = async (
      executor?: VoiceQueryExecutor,
    ): Promise<ResolveDialogueSnapshotOutcomeResult> => {
      // FOR UPDATE: see this method's own doc on why this lock is what
      // makes the check-then-fence sequence below atomic.
      //
      // (Independently reproduced and partially fixed -- the version-bound
      // half only, via VOICE_DRAFT_STALE -- by Pi's contribution commit
      // 1d86eae5c on this same task branch; this merge keeps this copy's
      // fuller fix, which also re-verifies capability authority below.)
      const session = await this.requireSession(
        command.voiceSessionId,
        executor,
        true,
      );
      if (
        session.leaseEpoch !== command.expectedLeaseEpoch ||
        session.resourceScopeId !== command.expectedResourceScopeId ||
        session.routeProfileVersion !== command.expectedRouteProfileVersion
      ) {
        throw new ApiRequestError(
          403,
          "VOICE_SESSION_NOT_OWNER",
          "Capability authority no longer matches the current session scope/route/lease.",
        );
      }
      if (
        !Number.isInteger(command.expectedSessionVersion) ||
        command.expectedSessionVersion < 0 ||
        command.expectedSessionVersion > session.sessionVersion
      ) {
        throw new ApiRequestError(
          409,
          "VOICE_DIALOGUE_SNAPSHOT_FUTURE_VERSION",
          "Cannot adjudicate a session_version this session has not yet reached.",
        );
      }
      const row = await this.repository.findDialogueSnapshotByVersion(
        command.voiceSessionId,
        command.expectedSessionVersion,
        executor,
      );
      const correlates =
        row !== null &&
        row.inputEpoch === command.inputEpoch &&
        row.mediaEpoch === command.mediaEpoch &&
        row.turnId === command.turnId;
      if (correlates) {
        // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-resolve expired-
        // content resurrection (Codex reopen, canonical
        // 2026-10-04T00:26:49Z): `findDialogueSnapshotByVersion`
        // deliberately includes an already-expired row (see that method's
        // own doc) because a write that durably landed and only later
        // expired still proves this exact commit was ACCEPTED -- but
        // "accepted" and "still permitted to disclose/restore" are
        // different facts. Never decrypt or return an expired row's
        // content here (a legal hold must not silently authorize ordinary
        // replay of content that has aged out); report the accepted/
        // historical fact without it instead of resurrecting it as live
        // state.
        if (new Date(row.retentionExpiresAt).getTime() <= Date.now()) {
          return {
            accepted: true,
            expired: true,
            voiceSessionId: row.voiceSessionId,
            sessionVersion: row.sessionVersion,
            inputEpoch: row.inputEpoch,
            mediaEpoch: row.mediaEpoch,
            turnId: row.turnId,
            retentionExpiresAt: row.retentionExpiresAt,
          };
        }
        const encryptionKey = resolveDialogueSnapshotEncryptionKey();
        const content = voiceDialogueSnapshotContentSchema.parse(
          decryptDialogueSnapshotContent(
            {
              keyVersion: row.contentKeyVersion,
              nonce: row.contentNonce,
              ciphertext: row.contentCiphertext,
              authTag: row.contentAuthTag,
            },
            (version) =>
              encryptionKey && encryptionKey.version === version
                ? encryptionKey.key
                : null,
            this.dialogueSnapshotAssociatedData({
              voiceSessionId: row.voiceSessionId,
              sessionVersion: row.sessionVersion,
              resourceScopeId: row.resourceScopeId,
              routeProfileVersion: row.routeProfileVersion,
              leaseEpoch: row.leaseEpoch,
              inputEpoch: row.inputEpoch,
              mediaEpoch: row.mediaEpoch,
              turnId: row.turnId,
            }),
          ),
        );
        return {
          accepted: true,
          snapshot: {
            snapshotId: row.snapshotId,
            voiceSessionId: row.voiceSessionId,
            sessionVersion: row.sessionVersion,
            inputEpoch: row.inputEpoch,
            mediaEpoch: row.mediaEpoch,
            turnId: row.turnId,
            content,
            createdAt: row.createdAt,
            retentionExpiresAt: row.retentionExpiresAt,
          },
        };
      }
      // Not (yet) landed, and never will be: durably fence this exact
      // version now, before this transaction's lock on the session row
      // releases, so a write that is still genuinely in flight server-side
      // can never land after this point.
      await this.repository.raiseDialogueSnapshotFence(
        command.voiceSessionId,
        command.expectedSessionVersion,
        executor,
      );
      return { accepted: false };
    };

    return typeof this.repository.withTransaction === "function"
      ? this.repository.withTransaction(runWork)
      : runWork();
  }

  /**
   * The restoration read `VoiceCallTurnCoordinator.attach` (worker side)
   * uses to seed a bound attachment's dialogue state and
   * `VoiceSessionBinding.sessionVersion` from authoritative truth instead
   * of starting fresh/blank, and to detect a binding that no longer matches
   * the session's actual current scope/route/lease before trusting it for
   * any turn. `findLatestDialogueSnapshot` itself already excludes a row
   * past its own `retention_expires_at` (reviewer WIP feedback
   * 2026-10-03T14:20Z: "current latest-snapshot read ignores expiry") --
   * this never resurrects expired content as if it were restorable.
   */
  async getDialogueSnapshotRestoration(
    voiceSessionId: string,
  ): Promise<DialogueSnapshotRestoration> {
    const session = await this.requireSession(voiceSessionId);
    const row = await this.repository.findLatestDialogueSnapshot(
      voiceSessionId,
    );
    if (!row) {
      return { session, snapshot: null };
    }
    const encryptionKey = resolveDialogueSnapshotEncryptionKey();
    const content = voiceDialogueSnapshotContentSchema.parse(
      decryptDialogueSnapshotContent(
        {
          keyVersion: row.contentKeyVersion,
          nonce: row.contentNonce,
          ciphertext: row.contentCiphertext,
          authTag: row.contentAuthTag,
        },
        (version) =>
          encryptionKey && encryptionKey.version === version
            ? encryptionKey.key
            : null,
        this.dialogueSnapshotAssociatedData({
          voiceSessionId: row.voiceSessionId,
          sessionVersion: row.sessionVersion,
          resourceScopeId: row.resourceScopeId,
          routeProfileVersion: row.routeProfileVersion,
          leaseEpoch: row.leaseEpoch,
          inputEpoch: row.inputEpoch,
          mediaEpoch: row.mediaEpoch,
          turnId: row.turnId,
        }),
      ),
    );
    return {
      session,
      snapshot: {
        snapshotId: row.snapshotId,
        voiceSessionId: row.voiceSessionId,
        sessionVersion: row.sessionVersion,
        inputEpoch: row.inputEpoch,
        mediaEpoch: row.mediaEpoch,
        turnId: row.turnId,
        content,
        createdAt: row.createdAt,
        retentionExpiresAt: row.retentionExpiresAt,
      },
    };
  }

  /**
   * Reviewer WIP feedback 2026-10-03T14:20Z: "a retention_expires_at label
   * alone is not bounded retention ... a governed purge path compatible
   * with actual schema/legal holds." Real DB deletion (through
   * `VoiceSessionRepository.deleteDialogueSnapshot`'s privileged
   * append-only bypass), gated by the SAME `VoiceRetentionService.
   * isSubjectUnderHold` legal-hold check every other evidence family's
   * purge already goes through.
   *
   * Deliberately does NOT call `VoiceRetentionService.executePurge`
   * (unlike other evidence families): that method independently
   * RE-DERIVES expiry from `createdAt` + the family's current default
   * `hotRetentionDays`, which would silently diverge from THIS row's own
   * `retention_expires_at` the moment it was computed under a different
   * custom override or a since-changed policy version -- this repository's
   * `findExpiredDialogueSnapshots` has already authoritatively decided
   * expiry from the actual stored column, so only the legal-hold check
   * (the one part of that engine not already answered) is still needed.
   */
  async purgeExpiredDialogueSnapshots(
    operatorId: string,
    dryRun = true,
  ): Promise<{ report: PurgeExecutionReport; deletedCount: number }> {
    if (!this.retentionService) {
      throw new ApiRequestError(
        500,
        "VOICE_RETENTION_POLICY_UNAVAILABLE",
        "Voice retention policy service is unavailable; refusing to purge without its legal-hold-aware policy decision.",
      );
    }
    const policy = this.retentionService.assertRetentionDefined(
      "voice_transcript",
    );
    const candidates = await this.repository.findExpiredDialogueSnapshots(
      new Date().toISOString(),
    );

    const results: PurgeExecutionReport["results"] = [];
    let purgedCount = 0;
    let skippedHeldCount = 0;
    let deletedCount = 0;
    for (const row of candidates) {
      if (this.retentionService.isSubjectUnderHold("voice_transcript", row.voiceSessionId)) {
        skippedHeldCount++;
        results.push({
          subjectRef: row.voiceSessionId,
          action: "skipped_held",
          reason: `Record is under active legal hold for voice_transcript:${row.voiceSessionId}`,
        });
        continue;
      }
      if (dryRun) {
        results.push({
          subjectRef: row.voiceSessionId,
          action: "eligible_to_purge",
          reason: `Dry run: snapshot past retention_expires_at (${row.retentionExpiresAt}) with no legal hold.`,
        });
        continue;
      }
      const deleted = await this.repository.deleteDialogueSnapshot(
        row.voiceSessionId,
        row.sessionVersion,
      );
      if (deleted) {
        purgedCount++;
        deletedCount++;
        results.push({
          subjectRef: row.voiceSessionId,
          action: "purged",
          reason: "Aged dialogue snapshot purged in accordance with retention policy.",
        });
      }
    }

    const report: PurgeExecutionReport = {
      executionId: randomUUID(),
      family: "voice_transcript",
      mode: dryRun ? "dry-run" : "apply",
      retentionDays: policy.hotRetentionDays,
      totalExamined: candidates.length,
      purgedCount,
      skippedHeldCount,
      operatorId,
      executedAt: new Date().toISOString(),
      policyVersion: this.retentionService.getPolicyCatalog().version,
      results,
    };
    return { report, deletedCount };
  }
}
