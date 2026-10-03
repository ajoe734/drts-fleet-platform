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
import {
  createFixtureDialoguePersistPort,
  type VoiceDialoguePersistPort,
} from "./dialogue-persist-port";
import type { VoiceMediaWorkerEvent } from "../media-session";

/** Speaks a completed turn's own verified prompt text back on a session's
 * real TTS pipeline. Never invoked with empty text (see
 * `VoiceCallTurnCoordinator.runTurn`).
 *
 * `signal` and `mediaEpoch` let the implementation fence output that was
 * still valid when `speak` was *called* but has since been superseded by
 * the time its own internal synthesis settles (Codex reopen round 2, R2/R3):
 * release, barge-in, a newer final, and a turn timeout all abort the same
 * `signal`; a mismatch between `mediaEpoch` (the session's media epoch when
 * the triggering transcript was captured) and the session's *current* epoch
 * at publish time means the media output owner changed mid-turn (e.g.
 * handoff/reconnect) and this turn's audio must never be attributed to that
 * new owner. The coordinator itself only checks `signal`/`released` once,
 * immediately before calling `speak` (see `executeTurn`'s `isCurrent`); it
 * cannot re-check after `speak`'s own internal await without the
 * implementation telling it when that await happens, so the implementation
 * must re-check both values itself after any such await, before publishing
 * audio. */
export interface VoiceCallTurnSpeaker {
  speak(
    text: string,
    languageCode: string,
    signal: AbortSignal,
    mediaEpoch: number,
  ): Promise<void>;
  /** The session's *live* media-authority epoch, read fresh on every call
   * -- never the snapshot captured when a transcript arrived (Codex
   * reopen round 2/3, R2). This is what lets `VoiceDialogueEngine.turn`
   * fence an obsolete proposal's state commit/tool execution against a
   * media-authority change that happened mid-turn, not only its eventual
   * `speak` call. */
  currentMediaEpoch(): number;
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
 * the gap is not that they are missing. The token-issuance *design* is also
 * not missing: `apps/api/src/common/auth/voice-capability.service.ts`
 * (`VoiceCapabilityService.issue`/`.verify`) and
 * `voice-capability.guard.ts` (`VoiceCapabilityGuard`, re-checking
 * scope/leaseEpoch against durable `voice.session`/`voice.resource_scope`
 * state) already implement SD §4.2's two-stage workload-identity-exchanged-
 * for-session-capability flow end to end on the verification side
 * (corrected this round -- an earlier version of this comment said this
 * contract "has never been designed on either side," which `Codex`'s
 * second reopen correctly called too broad). What is genuinely missing is
 * narrower: (1) `VoiceCapabilityService.issue` is never called from
 * anywhere in production code -- no route or job mints a capability token
 * for a specific live call, so there is no *issuance call site or trust
 * context* yet, even though verification is ready to consume one; (2)
 * `voice-booking.controller.ts` exposes no HTTP route guarded by
 * `VoiceCapabilityGuard` at all (only `metrics/cohort`, `usage/*`, and
 * `work-items/:workId/repair`), so there is nothing for a minted token to
 * call even once issued; (3) this worker has no HTTP client to call
 * apps/api with. Designing who triggers issuance and when, adding the
 * guarded route, and adding the worker-side client together are the
 * precisely-scoped cross-service contract that needs coordinated design on
 * both sides, not a speculative endpoint this task invents unilaterally.
 * `voice-media-worker` also carries no database dependency at all (see its
 * package.json) and must not acquire one here just to reach that state.
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
    /** Codex reopen round 2/3, R4: explicitly isolates fixture-mode
     * persistence from a trusted, durable runtime port (see
     * `./dialogue-persist-port.ts`) instead of the engine always running
     * against an unlabeled, always-successful no-op. Defaults to the only
     * port this worker can honestly provide today -- see this class's own
     * doc on why no trusted (apps/api-backed) port is reachable yet. */
    private readonly persistPort: VoiceDialoguePersistPort = createFixtureDialoguePersistPort(),
    /** Always `false` in this worker's actual composition (`../server.ts`
     * never sets it): no live `VoiceDialogueProvider` exists either (see
     * class doc), so `true` would make every turn fail closed with
     * `voice_fixture_forbidden` rather than ever actually speaking to a
     * caller. Kept as a real constructor parameter, not a hardcoded
     * literal, specifically so a `production: true` configuration is
     * fail-closed by construction: it refuses to run with a `"fixture"`
     * `persistPort` (see `executeTurn`'s `ports.persist`) rather than
     * silently treating fixture persistence as durable the moment a live
     * provider is wired. */
    private readonly production = false,
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
      engine: new VoiceDialogueEngine(this.createProvider(), this.production),
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

  /** Call synchronously, from the same integration boundary that advances
   * the attachment's own media-authority epoch (handoff/reconnect, Codex
   * reopen round 5/6, R2) -- *before* any dependent persist/execute/speak
   * work for the turn that was active under the superseded epoch is
   * allowed to proceed. Unlike `release`, the attachment itself stays
   * live: a later final still starts a fresh turn against it. Aborting
   * `activeAbort` here reaches the exact same `request.signal` the engine
   * stage threads through `runVoiceDialogue`/`boundedStage` into the
   * provider's own in-flight request (see `executeTurn`'s `ports`), so a
   * pending `propose`/`persist` call is cancelled immediately, not only
   * discovered stale at its own next `isStale()`/epoch check. */
  invalidateCurrentTurn(attachment: VoiceCallAttachment): void {
    const turnSession = this.sessions.get(attachment);
    if (!turnSession) return;
    turnSession.inputEpoch += 1;
    turnSession.activeAbort?.abort();
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
      mediaEpoch: event.mediaEpoch,
      segmentIds: [event.payload.segmentId],
      transcript: event.payload.text,
      verifiedContext: {},
      deadline: Date.now() + this.turnTimeoutMs,
      signal: abortController.signal,
    };

    turnSession.queue = turnSession.queue.then(() =>
      this.runTurn(
        turnSession,
        request,
        abortController,
        event.payload.language,
        speaker,
        event.mediaEpoch,
      ),
    );
  }

  /** Bounds the engine stage (`propose`/`persist`/`execute`, inside
   * `executeTurn`'s own `await engine.turn(...)`) -- the part that must
   * serialize per attachment against `VoiceDialogueEngine`'s single-
   * instance `running` guard -- so a later final's turn never starts on
   * the same engine while an earlier one is still mid-flight. It does
   * *not* wait for `executeTurn`'s detached `speaker.speak` call (R3,
   * Codex reopen round 3): that call has no abort channel of its own and
   * can hang indefinitely on an uncooperative external TTS call, and
   * `engine.turn()` itself already settles promptly on abort/deadline via
   * `request.signal` racing inside `runVoiceDialogue`/`boundedStage`, so
   * the queue stage is bounded without needing a separate release path
   * here. Never rejects into `queue`: there is no caller here to usefully
   * receive it, and a long-lived worker process must not let one turn's
   * failure break the chain for this attachment's later turns. */
  private runTurn(
    turnSession: TurnSession,
    request: VoiceDialogueRequest,
    abortController: AbortController,
    languageCode: string,
    speaker: VoiceCallTurnSpeaker,
    mediaEpoch: number,
  ): Promise<void> {
    return new Promise<void>((resolveQueueStage) => {
      let settled = false;
      const releaseQueue = () => {
        if (settled) return;
        settled = true;
        resolveQueueStage();
      };
      // Fences this turn's own output once its deadline passes, by
      // aborting the controller `speak`'s detached call re-checks (see
      // `executeTurn`) -- independent of the queue stage above, which by
      // then has normally already released. `AbortController.abort()` is
      // idempotent, so firing after release/supersession already aborted
      // it is harmless.
      setTimeout(
        () => abortController.abort(),
        Math.max(0, request.deadline - Date.now()),
      );

      this.executeTurn(
        turnSession,
        request,
        abortController,
        languageCode,
        speaker,
        mediaEpoch,
      )
        .catch((error) => {
          if (!this.isExpectedSupersession(error)) {
            console.error("[voice-call-turn-coordinator] turn failed", error);
          }
        })
        .finally(() => {
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
    mediaEpoch: number,
  ): Promise<void> {
    const ports: VoiceDialogueTurnPorts = {
      persist: async (next, bounded) => {
        // Fail closed by construction (Codex reopen round 2/3, R4): a
        // `production` engine must never run its CAS-dependent commit/
        // tool-execution/playback stages against a `"fixture"` persist
        // port that cannot actually honor the durable CAS
        // `VoiceDialogueTurnPorts.persist`'s own contract requires -- see
        // `./dialogue-persist-port.ts`. Never reachable in this worker's
        // actual composition today (`production` is always `false`, see
        // this class's constructor doc); this is the seam that keeps that
        // true once a live provider and a trusted port both exist, rather
        // than relying on every future caller remembering to re-check it.
        if (this.production && this.persistPort.mode === "fixture") {
          throw new Error("voice_persist_untrusted_for_production");
        }
        await this.persistPort.persist(next, bounded);
      },
      execute: (output) =>
        Promise.resolve(this.executeTools(output, turnSession.state)),
    };
    const result = await turnSession.engine.turn(
      request,
      turnSession.state,
      () => turnSession.inputEpoch,
      ports,
      () => speaker.currentMediaEpoch(),
    );
    // Only the turn that is still this attachment's current, non-aborted
    // one may even be *offered* to the speaker -- a barge-in, release,
    // timeout, or newer final may have superseded it in the time it took
    // `engine.turn` to resolve (R2/R3): `activeAbort` having moved on (or
    // already having been aborted in place) both mean this result is stale.
    // This is necessary but not sufficient: `speak` itself does its own
    // synthesis, which can still be superseded *after* this check passes
    // and before it publishes -- see the interface doc on
    // `VoiceCallTurnSpeaker.speak`.
    const isCurrent =
      !turnSession.released &&
      turnSession.activeAbort === abortController &&
      !abortController.signal.aborted;
    if (result.prompt && isCurrent) {
      // Deliberately not awaited (Codex reopen round 3, R3): the engine
      // stage above (`propose`/`persist`/`execute`) is what needs
      // per-attachment serialization against `VoiceDialogueEngine`'s own
      // single-instance `running` guard, and it already settles promptly
      // on abort via `request.signal` racing inside `runVoiceDialogue`/
      // `boundedStage`. `speak`'s own synthesis call has no abort channel
      // of its own and can hang indefinitely on an uncooperative external
      // TTS call; awaiting it here would keep blocking this attachment's
      // `queue` for every later turn behind it regardless of
      // `turnTimeoutMs`. Letting it run detached is safe: `speak`'s
      // implementation re-checks `signal`/`mediaEpoch` immediately before
      // publishing (see `VoiceCallTurnSpeaker.speak`'s doc and
      // `VoiceSessionComposer.attach`), so a superseded result it
      // eventually produces is still fenced from ever reaching the caller.
      void speaker
        .speak(result.prompt, languageCode, abortController.signal, mediaEpoch)
        .catch((error) => {
          if (!this.isExpectedSupersession(error)) {
            console.error(
              "[voice-call-turn-coordinator] speak failed",
              error,
            );
          }
        });
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
