import { randomUUID } from "node:crypto";
import type { VoiceDialogueOutput } from "@drts/contracts";
import {
  VoiceDialogueEngine,
  type VoiceDialogueTurnPorts,
} from "./dialogue-engine";
import { VoiceDialogueState } from "./dialogue-state";
import type {
  VoiceDialogueProvider,
  VoiceDialogueRequest,
} from "./voice-dialogue-provider";
import type { VoiceMediaWorkerEvent } from "../media-session";

/** Speaks a completed turn's own verified prompt text back on a session's
 * real TTS pipeline. Never invoked with empty text (see
 * `VoiceCallTurnCoordinator.runTurn`). */
export interface VoiceCallTurnSpeaker {
  speak(text: string, languageCode: string): Promise<void>;
}

/**
 * Opaque handle for exactly one `VoiceSessionComposer.attach()` call's
 * worth of turn state (R1, Codex reopen round 2: a released session id can
 * be reused by an unrelated later call before every in-flight/late event
 * from the old attachment has stopped arriving). Identity is by object
 * reference, never by `sessionId` string -- that is precisely what lets a
 * late event from an old, already-released attachment be told apart from a
 * live event for a replacement attachment sharing the same session id,
 * with no window where the two can collide on a shared map key.
 */
export interface VoiceCallAttachment {
  readonly sessionId: string;
}

interface TurnSession {
  engine: VoiceDialogueEngine;
  state: VoiceDialogueState;
  inputEpoch: number;
  /** Serializes turns for one attachment so a later final transcript's turn
   * never interleaves persist/execute with one still in flight for an
   * earlier one -- see `handle`. */
  queue: Promise<void>;
  /** `true` once `release` has run for this attachment. A late event
   * bound to this same (now-released) attachment is observable evidence
   * only -- it must never start a new turn or be mistaken for a
   * replacement attachment's input (see `handle`). */
  released: boolean;
  /** The controller backing the currently active/queued turn's
   * `request.signal`, if any. `release` and a `speech.started` barge-in
   * both abort it directly so a turn blocked on persist/execute/provider
   * work is cancelled promptly instead of only discovering staleness by
   * polling `inputEpoch` at its next await. A turn also checks this by
   * reference before speaking (see `executeTurn`): once superseded, it is
   * never still "current" even if it already held a reference before
   * being replaced. */
  activeAbort: AbortController | null;
}

const DEFAULT_TURN_TIMEOUT_MS = 8_000;

/**
 * The real session.event -> bounded-turn composition that
 * docs/04-uat/audit-voice-runtime-20261002.md records as missing (the
 * "CTI/IVR dialogue orchestration layer" referenced in
 * `../server/session-composer.ts`). `apps/api/src/modules/voice-booking/`'s
 * `VoiceToolGatewayService`/`VoiceSessionService` are real and DB-backed --
 * the gap is not that they are missing. It is that apps/api exposes no
 * authenticated HTTP route for a live call's turn to reach them, and this
 * worker has no capability-token issuance path to call one if it existed;
 * that reviewed cross-service contract (a new route plus a token-issuance
 * flow) is the exact unresolved decision, precisely because it needs
 * coordinated design on both sides, not a speculative endpoint this task
 * invents unilaterally. `voice-media-worker` also carries no database
 * dependency at all (see its package.json) and must not acquire one here
 * just to reach that state.
 *
 * This coordinator therefore runs the real `VoiceDialogueEngine` /
 * `VoiceDialogueState` machinery against every admitted final transcript --
 * there is nothing fixture-only about the turn/epoch/cancellation mechanics
 * themselves, only the dialogue *provider* (always the existing
 * fixture-mode `VoiceDialogueProvider`; a live provider does not exist
 * either, see `../providers/native-voice/native-voice-adapter.ts`) and the
 * *tool execution* boundary (below) are genuinely unavailable today.
 *
 * A proposed tool other than `request_handoff` would require that
 * unreachable domain-execution channel to resolve a real
 * location/eligibility/readback/booking-status outcome. Fabricating one
 * here would be exactly the "consent/booking inferred from ASR" failure
 * mode the design forbids, so `executeTools` instead forces the same
 * honest `request_handoff` / `status: "unavailable"` outcome the schema
 * already defines for a genuinely unavailable provider -- never a stub
 * success.
 */
export class VoiceCallTurnCoordinator {
  private readonly sessions = new Map<VoiceCallAttachment, TurnSession>();

  constructor(
    private readonly createProvider: () => VoiceDialogueProvider,
    private readonly turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
  ) {}

  /** Call once per `VoiceSessionComposer.attach()`, before any event for
   * that attachment can be delivered -- the returned handle is this
   * attachment's only valid key into `handle`/`release`. Always starts
   * fresh state: a reused session id never inherits a prior attachment's
   * engine, slots, or handoff, whatever that prior attachment's own
   * release/late-event state was. */
  attach(sessionId: string): VoiceCallAttachment {
    const attachment: VoiceCallAttachment = { sessionId };
    this.sessions.set(attachment, {
      // One engine per attachment: `VoiceDialogueEngine.turn` guards itself
      // with a single instance-scoped `running` flag, so attachments must
      // never share one.
      engine: new VoiceDialogueEngine(this.createProvider(), false),
      state: new VoiceDialogueState(),
      inputEpoch: 0,
      queue: Promise.resolve(),
      released: false,
      activeAbort: null,
    });
    return attachment;
  }

  /** Call once an attachment's channel/session is gone (close, drain).
   * Aborts whatever turn is currently active/queued for it and marks it
   * released so a late event still carrying this same handle is never
   * mistaken for new conversational input (R1). A session id may later be
   * reused by an unrelated later call via a fresh `attach()`, which gets an
   * entirely new handle and is therefore never affected by this call. */
  release(attachment: VoiceCallAttachment): void {
    const turnSession = this.sessions.get(attachment);
    if (!turnSession) return;
    turnSession.released = true;
    turnSession.activeAbort?.abort();
    this.sessions.delete(attachment);
  }

  /** Call for every `session.event` an attachment emits. `asr.segment.final`
   * drives a turn; `speech.started` (barge-in) invalidates whatever turn is
   * currently active/queued (R2) so late provider/TTS work is fenced before
   * any audio reaches the caller. Every other event (TTS marks, DTMF) has
   * no reason to touch a turn here. */
  handle(
    attachment: VoiceCallAttachment,
    event: VoiceMediaWorkerEvent,
    speaker: VoiceCallTurnSpeaker,
  ): void {
    const turnSession = this.sessions.get(attachment);
    // Unknown or already-released attachment: either a late event from an
    // attachment that was already torn down, or one that never started a
    // turn. Either way this is observable evidence only -- it must never
    // create new turn state under this (possibly stale) handle.
    if (!turnSession) return;

    if (event.type === "speech.started") {
      turnSession.inputEpoch += 1;
      turnSession.activeAbort?.abort();
      return;
    }
    if (event.type !== "asr.segment.final") return;

    // Bumped synchronously, before this turn is even queued: a second final
    // arriving while this one is still queued/running must make *this*
    // turn observably stale the moment it reaches its own epoch checks
    // (`VoiceDialogueEngine`/`runVoiceDialogue` already fence on exactly
    // this), rather than let two turns race to persist/execute.
    turnSession.inputEpoch += 1;
    // Promptly cancel whatever the previous final left active/queued,
    // instead of only letting it discover staleness by polling `inputEpoch`
    // at its own next await (R3).
    turnSession.activeAbort?.abort();
    const abortController = new AbortController();
    turnSession.activeAbort = abortController;
    const request: VoiceDialogueRequest = {
      sessionId: attachment.sessionId,
      turnId: randomUUID(),
      inputEpoch: turnSession.inputEpoch,
      segmentIds: [event.payload.segmentId],
      transcript: event.payload.text,
      verifiedContext: {},
      deadline: Date.now() + this.turnTimeoutMs,
      signal: abortController.signal,
    };

    turnSession.queue = turnSession.queue.then(() =>
      this.runTurn(turnSession, request, abortController, event.payload.language, speaker),
    );
  }

  /** Bounds the *entire* queue stage -- including the final `speaker.speak`
   * call, which has no abort channel of its own (R3) -- so a speaker/
   * provider call that never settles cannot block every later turn behind
   * it regardless of `turnTimeoutMs`. Never rejects into `queue`: there is
   * no caller here to usefully receive it, and a long-lived worker process
   * must not let one turn's failure break the chain for this attachment's
   * later turns. */
  private runTurn(
    turnSession: TurnSession,
    request: VoiceDialogueRequest,
    abortController: AbortController,
    languageCode: string,
    speaker: VoiceCallTurnSpeaker,
  ): Promise<void> {
    return new Promise<void>((resolveQueueStage) => {
      let settled = false;
      const releaseQueue = () => {
        if (settled) return;
        settled = true;
        resolveQueueStage();
      };
      const timer = setTimeout(
        () => {
          // Supersede: a hung speaker/provider must not keep blocking this
          // attachment's queue past its own turn's deadline. The dangling
          // operation (if it later settles) is fenced by the `isCurrent`
          // check in `executeTurn`, never published.
          abortController.abort();
          releaseQueue();
        },
        Math.max(0, request.deadline - Date.now()),
      );

      this.executeTurn(turnSession, request, abortController, languageCode, speaker)
        .catch((error) => {
          if (!this.isExpectedSupersession(error)) {
            console.error("[voice-call-turn-coordinator] turn failed", error);
          }
        })
        .finally(() => {
          clearTimeout(timer);
          releaseQueue();
        });
    });
  }

  private async executeTurn(
    turnSession: TurnSession,
    request: VoiceDialogueRequest,
    abortController: AbortController,
    languageCode: string,
    speaker: VoiceCallTurnSpeaker,
  ): Promise<void> {
    const ports: VoiceDialogueTurnPorts = {
      persist: async () => {
        // No durable per-call session store is reachable from this process
        // (see class doc) -- that is `voice.session` in apps/api's
        // Postgres. The engine's own in-memory `Object.assign(state, next)`
        // immediately after this resolves is the only persistence this
        // coordinator can honestly provide, scoped to this process's own
        // lifetime (lost on restart, never shared with apps/api).
      },
      execute: (output) =>
        Promise.resolve(this.executeTools(output, turnSession.state)),
    };
    const result = await turnSession.engine.turn(
      request,
      turnSession.state,
      () => turnSession.inputEpoch,
      ports,
    );
    // Only the turn that is still this attachment's current, non-aborted
    // one may actually speak -- a barge-in, release, timeout, or newer
    // final may have superseded it in the time it took `engine.turn` to
    // resolve (R2/R3): `activeAbort` having moved on (or already having
    // been aborted in place) both mean this result is stale.
    const isCurrent =
      !turnSession.released &&
      turnSession.activeAbort === abortController &&
      !abortController.signal.aborted;
    if (result.prompt && isCurrent) {
      await speaker.speak(result.prompt, languageCode);
    }
  }

  /** `voice_turn_in_progress`/`voice_stale_epoch`/`voice_aborted` are the
   * engine's own, expected way of saying "a newer turn already superseded
   * this one" -- not failures worth logging. */
  private isExpectedSupersession(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message === "voice_turn_in_progress" ||
        error.message === "voice_stale_epoch" ||
        error.message === "voice_aborted")
    );
  }

  private executeTools(
    output: VoiceDialogueOutput,
    state: VoiceDialogueState,
  ): unknown[] {
    if (output.tools.length === 0) return [];
    const onlyHandoffRequested = output.tools.every(
      (tool) => tool.name === "request_handoff",
    );
    if (!onlyHandoffRequested) {
      // A tool other than `request_handoff` needs the unreachable
      // domain-execution channel (see class doc) to resolve honestly.
      // Force the same outcome a genuinely unavailable provider would
      // produce, instead of fabricating a location/eligibility/readback/
      // booking-status result this worker has no way to verify.
      state.handoff = { reason: "provider_unavailable", intent: output.intent };
    }
    return output.tools.map(() => ({
      status: "unavailable" as const,
      handoffId: null,
    }));
  }
}
