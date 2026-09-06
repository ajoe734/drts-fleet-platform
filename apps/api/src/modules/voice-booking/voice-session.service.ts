import { Injectable } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import type {
  VoiceCommandReceiptRecord,
  VoiceSessionRecord,
} from "./voice-booking.repository";
import {
  VoiceSessionRepository,
  type SessionControlPatch,
} from "./voice-session.repository";

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

@Injectable()
export class VoiceSessionService {
  constructor(private readonly repository: VoiceSessionRepository) {}

  /**
   * SD §5.3: "新命令受理前比較 leaseEpoch、draftVersion、inputEpoch 與當前
   * owner；任一改變則拒絕舊請求." Shared fencing check for every write path
   * below -- a stale `sessionVersion` always means "reload before writing",
   * a stale `leaseEpoch` always means "you are no longer the owner."
   */
  private assertWriteAuthorized(
    session: VoiceSessionRecord,
    expected: { sessionVersion: number; leaseEpoch?: number },
  ): void {
    if (
      expected.leaseEpoch !== undefined &&
      session.leaseEpoch !== expected.leaseEpoch
    ) {
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
  async closeSession(
    voiceSessionId: string,
    expectedSessionVersion: number,
  ): Promise<VoiceSessionRecord> {
    const session = await this.requireSession(voiceSessionId);
    if (session.dialogState === "closed") {
      return session;
    }
    this.assertWriteAuthorized(session, {
      sessionVersion: expectedSessionVersion,
    });

    const updated = await this.repository.casUpdateSessionControl(
      voiceSessionId,
      session.sessionVersion,
      { dialogState: "closed", mediaState: "ended" },
    );
    if (!updated) {
      throw new ApiRequestError(
        409,
        "VOICE_DRAFT_STALE",
        "Session revision changed while closing; retry.",
      );
    }
    return updated;
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
