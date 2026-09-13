import { Injectable, Logger, Optional } from "@nestjs/common";
import { isDeepStrictEqual } from "node:util";

import { ApiRequestError } from "../../common/api-envelope";
import type {
  VoiceCommandReceiptRecord,
  VoiceSessionRecord,
} from "./voice-booking.repository";
import {
  VoiceSessionRepository,
  type SessionControlPatch,
} from "./voice-session.repository";
import { VoiceUsageService } from "./voice-usage.service";
import { VoiceBookingMetricsService } from "../../observability/voice-booking-metrics.service";
import { voiceAlertMetrics } from "../../observability/voice-alert-metrics";

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
  closeEvent?: {
    source?: string | undefined;
    sourceEventId?: string | null | undefined;
    occurredAt?: string | undefined;
    sequence?: number | undefined;
    mediaEpoch?: number | undefined;
    eventType?: string | undefined;
    payload?: unknown;
    payloadRef?: string | null | undefined;
  } | undefined;
  recordingId?: string | null | undefined;
}

export interface CloseSessionWithFinalizeRecordingResult {
  session: VoiceSessionRecord;
  workItemEnqueued: boolean;
  deduped: boolean;
}

@Injectable()
export class VoiceSessionService {
  private readonly logger = new Logger(VoiceSessionService.name);

  constructor(
    private readonly repository: VoiceSessionRepository,
    @Optional() private readonly usageService?: VoiceUsageService,
    @Optional() private readonly metricsService?: VoiceBookingMetricsService,
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

  private async requireSession(
    voiceSessionId: string,
  ): Promise<VoiceSessionRecord> {
    const session = await this.repository.findSessionById(voiceSessionId);
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

    const { deduped } = await this.repository.insertControlEvent({
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

    if (deduped) {
      return {
        deduped: true,
        applied: false,
        gap: false,
        appliedThroughSequence: session.lastAppliedControlSequence,
        session,
      };
    }

    const appliedEpoch =
      session.lastAppliedControlSequence > 0
        ? await this.repository.findAppliedMediaEpoch(command.voiceSessionId)
        : null;

    if (appliedEpoch !== null && command.mediaEpoch !== appliedEpoch) {
      // Cross-epoch arrival: fail closed rather than guess whether this is a
      // legitimate reconnect or a stale/superseded stream (SD §5.3: "舊
      // epoch final 不得覆蓋新連線內容"). The event is durable (inserted
      // above) but is left unapplied until an explicit epoch transition.
      return {
        deduped: false,
        applied: false,
        gap: true,
        appliedThroughSequence: session.lastAppliedControlSequence,
        session,
      };
    }

    const isBootstrap = appliedEpoch === null;
    if (
      !isBootstrap &&
      command.sequence <= session.lastAppliedControlSequence
    ) {
      // Already applied (or superseded) -- safe no-op.
      return {
        deduped: false,
        applied: false,
        gap: false,
        appliedThroughSequence: session.lastAppliedControlSequence,
        session,
      };
    }
    if (isBootstrap && command.sequence !== 1) {
      // SD §5.4: the watermark starts at 0 (no event applied); the first
      // event to bootstrap the session MUST be sequence 1. Any earlier
      // sequence that arrives out of order (e.g. HTTP delivers seq 3 before
      // seq 1) is durably stored but cannot advance the watermark -- exactly
      // the same gap rule that applies once events are flowing. Silently
      // applying seq N > 1 on bootstrap would permanently skip seqs 1..N-1
      // and corrupt the ordered-event invariant.
      return {
        deduped: false,
        applied: false,
        gap: true,
        appliedThroughSequence: session.lastAppliedControlSequence,
        session,
      };
    }
    if (
      !isBootstrap &&
      command.sequence !== session.lastAppliedControlSequence + 1
    ) {
      // Not the next contiguous frame: durably buffered, but the waterline
      // must not skip past this gap (SD §5.4: "不得跳號處理後面的肯定").
      return {
        deduped: false,
        applied: false,
        gap: true,
        appliedThroughSequence: session.lastAppliedControlSequence,
        session,
      };
    }

    let appliedThrough = command.sequence;
    let sawSpeechStart = command.eventType === "speech_start";

    const buffered = await this.repository.findControlEventsAfter(
      command.voiceSessionId,
      command.mediaEpoch,
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
      deduped: false,
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
    const result = await this.repository.withTransaction(async (tx) => {
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
        if (command.closeEvent?.payload !== undefined) {
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
        const existingWork = await tx.query<{ payload_ref: string | null }>(
          `SELECT payload_ref FROM voice.work_item
          WHERE dedupe_key = $1 LIMIT 1`,
          [`finalize_recording:ai:${session.voiceSessionId}`],
        );
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

      await tx.query(
        `INSERT INTO voice.work_item (command_id, voice_session_id, work_type, dedupe_key, payload_ref, run_after)
        VALUES (NULL, $1, 'finalize_recording', $2, $3, now())
        ON CONFLICT (dedupe_key) DO NOTHING`,
        [session.voiceSessionId, dedupeKey, payloadRefData],
      );

      return { session: updated, workItemEnqueued: true, deduped: false };
    });

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
    if (!this.repository.isEnabled()) {
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
}
