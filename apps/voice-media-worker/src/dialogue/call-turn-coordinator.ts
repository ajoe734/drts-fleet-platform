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

interface TurnSession {
  engine: VoiceDialogueEngine;
  state: VoiceDialogueState;
  inputEpoch: number;
  /** Serializes turns for one session so a later final transcript's turn
   * never interleaves persist/execute with one still in flight for an
   * earlier one -- see `handle`. */
  queue: Promise<void>;
}

const DEFAULT_TURN_TIMEOUT_MS = 8_000;

/**
 * The real session.event -> bounded-turn composition that
 * docs/04-uat/audit-voice-runtime-20261002.md records as missing (the
 * "CTI/IVR dialogue orchestration layer" referenced in
 * `../server/session-composer.ts`). That driver -- the thing that would own
 * a verified call-authority channel into apps/api's DB-backed
 * `VoiceToolGatewayService`/`VoiceBookingRepository` -- lives at
 * `apps/api/src/modules/cti-ivr`, which does not exist and is out of this
 * task's write_scopes; `voice-media-worker` also carries no database
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
  private readonly sessions = new Map<string, TurnSession>();

  constructor(
    private readonly createProvider: () => VoiceDialogueProvider,
    private readonly turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
  ) {}

  /** Drops all turn state for a session. Call once its channel/session is
   * gone (close, drain) -- a session id may later be reused by an unrelated
   * call and must never resume a prior call's collected slots. */
  release(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Call for every `session.event` a session emits. Only
   * `asr.segment.final` drives a turn; every other event (TTS marks, DTMF,
   * speech-started barge-in) has no reason to start one here. */
  handle(
    sessionId: string,
    event: VoiceMediaWorkerEvent,
    speaker: VoiceCallTurnSpeaker,
  ): void {
    if (event.type !== "asr.segment.final") return;
    const turnSession =
      this.sessions.get(sessionId) ?? this.createTurnSession();
    this.sessions.set(sessionId, turnSession);

    // Bumped synchronously, before this turn is even queued: a second final
    // arriving while this one is still queued/running must make *this*
    // turn observably stale the moment it reaches its own epoch checks
    // (`VoiceDialogueEngine`/`runVoiceDialogue` already fence on exactly
    // this), rather than let two turns race to persist/execute.
    turnSession.inputEpoch += 1;
    const request: VoiceDialogueRequest = {
      sessionId,
      turnId: randomUUID(),
      inputEpoch: turnSession.inputEpoch,
      segmentIds: [event.payload.segmentId],
      transcript: event.payload.text,
      verifiedContext: {},
      deadline: Date.now() + this.turnTimeoutMs,
      signal: new AbortController().signal,
    };

    turnSession.queue = turnSession.queue.then(() =>
      this.runTurn(turnSession, request, event.payload.language, speaker),
    );
  }

  private createTurnSession(): TurnSession {
    return {
      // One engine per session: `VoiceDialogueEngine.turn` guards itself
      // with a single instance-scoped `running` flag, so sessions must
      // never share one.
      engine: new VoiceDialogueEngine(this.createProvider(), false),
      state: new VoiceDialogueState(),
      inputEpoch: 0,
      queue: Promise.resolve(),
    };
  }

  private async runTurn(
    turnSession: TurnSession,
    request: VoiceDialogueRequest,
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
    try {
      const result = await turnSession.engine.turn(
        request,
        turnSession.state,
        () => turnSession.inputEpoch,
        ports,
      );
      if (result.prompt) await speaker.speak(result.prompt, languageCode);
    } catch (error) {
      if (!this.isExpectedSupersession(error)) {
        // Only a genuinely unexpected failure (e.g. the fixture provider's
        // own schema violation) reaches here. Never rethrow into the
        // session queue: a long-lived worker process must not let one
        // turn's unexpected failure take down the chain for this session's
        // later turns, and there is no caller here to usefully receive a
        // rejected promise.
        console.error("[voice-call-turn-coordinator] turn failed", error);
      }
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
