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
  createTrustedDialoguePersistPort,
  type VoiceDialoguePersistPort,
} from "./dialogue-persist-port";
import type { VoiceSessionBinding } from "./voice-session-binding";
import type { VoiceApiClient } from "../server/voice-api-client";
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
  /** SD §4.2/§10.1 identifiers for this attachment, when a real call-
   * admission flow has supplied one (none does yet -- see
   * `../dialogue/voice-session-binding.ts`). `undefined` means this
   * attachment uses the coordinator-wide default `persistPort`/local
   * handoff stub exactly as before this binding concept existed. */
  binding?: VoiceSessionBinding;
  /** Set once in `attach()` when both `binding` and the coordinator's own
   * `apiClient` are present; overrides the coordinator-wide default
   * `persistPort` for this attachment only. */
  persistPort?: VoiceDialoguePersistPort;
  /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: set by
   * `restoreBoundAttachment` if a bound attachment's restoration read
   * (session + dialogue-snapshot) fails or the authoritative session no
   * longer matches this attachment's own binding. `handle` treats such an
   * attachment exactly like a released one -- a late event is observable
   * evidence only, never new conversational input -- rather than let a
   * trusted/bound attachment whose restored state could not be verified
   * silently run turns against a blank/unverified one. */
  restoreFailed?: boolean;
  /** This attachment's own next `recordControlEvent` `sequence` value
   * (AUDIT-VOICE-APPLICATION-WIRING-20261003 R4 residual: the "ordered
   * control-event watermark" seam). Seeded by `restoreBoundAttachment`
   * from the authoritative session's `lastAppliedControlSequence + 1`, so
   * a restored/reattached session stays contiguous with whatever a prior
   * attachment already durably applied. `undefined` for an unbound
   * attachment, which never calls `recordControlEvent` at all. */
  controlSequence?: number;
  /** The authoritative, server-durable `inputEpoch` this turn's own
   * `recordAuthoritativeSpeechStart` call resolved -- distinct from
   * `inputEpoch` above (this class's process-local turn-sequencing
   * counter, used only for local supersession/cancellation fencing, see
   * `handle`). `resolveInput`'s CAS and `request_handoff`'s submission
   * must both use THIS value, never the local counter, or they fence
   * against a watermark the authoritative session never actually opened
   * for this turn. Set once per turn (in the `persist` stage) and read
   * once more later in the SAME turn's `execute` stage; never read across
   * turns -- `VoiceDialogueEngine`'s own single-instance `running` guard
   * is what makes that safe (see class doc). */
  authoritativeInputEpoch?: number;
}

const DEFAULT_TURN_TIMEOUT_MS = 8_000;
const HANDOFF_CAPABILITY_SCOPES: readonly ["session_execute", "handoff_request"] = [
  "session_execute",
  "handoff_request",
];

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
 * second reopen correctly called too broad). An earlier version of *this*
 * paragraph then went on to list three remaining gaps -- no issuance call
 * site, no guarded HTTP route, and no worker-side HTTP client -- which
 * Codex reopen round 5/6 (R4) correctly flagged as now obsolete and
 * explicitly superseded: all three are built. `voice-booking.controller.ts`
 * exposes `POST capabilities`/`sessions/:id/input-resolutions`/
 * `sessions/:id/handoffs`/`sessions/:id/events`, all guarded by
 * `VoiceCapabilityGuard`; `VoiceCapabilityService.issue` is called from the
 * first of those; and `../server/voice-api-client.ts` is this worker's own
 * HTTP client calling all four, now joined by
 * `sessions/:id/dialogue-snapshot` (GET + POST, AUDIT-VOICE-APPLICATION-
 * WIRING-20261003 R4) backing the versioned, encrypted dialogue-content
 * persist/restore `attach()`/`createTrustedDialoguePersistPort` use below.
 * `voice-media-worker` still carries no database dependency at all (see its
 * package.json) and still must not acquire one here. What remains
 * genuinely unavailable is the call-admission flow that would supply any
 * attachment a real `VoiceSessionBinding` in the first place (see
 * `attach()`'s own doc and `../server/voice-session-binding.ts`), and the
 * ordered control-event watermark (R4 residual): `executeTurn`'s `persist`
 * stage now calls `recordAuthoritativeSpeechStart`, which durably records
 * a `recordControlEvent("speech_start")` for this turn's own admitted
 * final (deduped by `turnId`, sequenced from `restoreBoundAttachment`'s
 * restored watermark) and resolves the authoritative `inputEpoch`
 * `resolveInput`/`persistDialogueSnapshot`/`request_handoff` must all use
 * instead of this attachment's process-local turn-sequencing counter
 * (`turnSession.inputEpoch`). That local counter is NOT replaced or
 * removed -- it still fences local supersession/cancellation exactly as
 * R1-R3 above describe (a stale turn's `recordAuthoritativeSpeechStart`
 * call still durably opens a watermark even if the turn using it is
 * itself superseded moments later; the SAME `isCurrent`/`isStale`/
 * `abortController` checks that already gate every other effect gate this
 * one too, via the engine's own `boundedStage`/`persist` fail-closed
 * path). The two epoch spaces are therefore reconciled per turn, inside
 * the existing cancellation-fenced stage, rather than by merging the two
 * counters into one. Restoration on attach/reconnect (session + latest
 * dialogue snapshot, plus this attachment's next control-event sequence)
 * is implemented below (`restoreBoundAttachment`) for any attachment that
 * IS given a real binding; restart-time re-attachment of an in-flight call
 * is still gated on the same genuinely-unavailable call-admission flow.
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
    /** The first-party worker/API HTTP client (Codex reopen round 5/6,
     * R4; see `../server/voice-api-client.ts`). `undefined` in this
     * worker's actual composition today (`../server.ts` never sets it,
     * same as `production`) -- every attachment then uses the
     * coordinator-wide default `persistPort`/local handoff stub exactly
     * as before this client existed. Only ever consulted for an
     * attachment that was also given a `VoiceSessionBinding` via
     * `attach()`; a binding with no client (or a client with no binding)
     * never silently falls back to fabricating trusted behavior. */
    private readonly apiClient?: VoiceApiClient,
  ) {}

  /** Call once per `VoiceSessionComposer.attach()`, before any event for
   * that attachment can be delivered -- the returned handle is this
   * attachment's only valid key into `handle`/`release`. Always starts
   * fresh state: a reused session id never inherits a prior attachment's
   * engine, slots, or handoff, whatever that prior attachment's own
   * release/late-event state was.
   *
   * `binding`, when supplied together with the coordinator's own
   * `apiClient` (Codex reopen round 5/6, R4), switches this *specific*
   * attachment's persist/tool-execution onto the real apps/api-backed
   * composition (see `./dialogue-persist-port.ts`'s
   * `createTrustedDialoguePersistPort` and `executeTools` below) -- every
   * other attachment on this same coordinator keeps using the
   * coordinator-wide default. Nothing in this worker's actual composition
   * supplies one yet (no call-admission flow exists -- see
   * `../dialogue/voice-session-binding.ts`'s own doc); this is the
   * composition seam a future one calls through. */
  attach(sessionId: string, binding?: VoiceSessionBinding): VoiceCallAttachment {
    const attachment: VoiceCallAttachment = { sessionId };
    const turnSession: TurnSession = {
      // One engine per attachment: `VoiceDialogueEngine.turn` guards itself
      // with a single instance-scoped `running` flag, so attachments must
      // never share one.
      engine: new VoiceDialogueEngine(this.createProvider(), this.production),
      state: new VoiceDialogueState(),
      inputEpoch: 0,
      queue: Promise.resolve(),
      released: false,
      activeAbort: null,
      ...(binding ? { binding } : {}),
    };
    if (binding && this.apiClient) {
      turnSession.persistPort = createTrustedDialoguePersistPort(
        this.apiClient,
        () => turnSession.binding,
      );
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: seed this bound
      // attachment's dialogue state and `binding.sessionVersion` from
      // authoritative truth before any turn runs, instead of always
      // starting fresh/blank -- see `restoreBoundAttachment`'s own doc.
      // `attach()` stays synchronous (unchanged signature, no blast radius
      // on existing callers): the restoration promise is installed as this
      // attachment's initial `queue` so the FIRST turn naturally waits for
      // it, exactly the same mechanism that already serializes turns
      // against each other.
      turnSession.queue = this.restoreBoundAttachment(
        turnSession,
        this.apiClient,
        binding,
      );
    }
    this.sessions.set(attachment, turnSession);
    return attachment;
  }

  /** Reads this attachment's authoritative session + latest dialogue
   * snapshot (`VoiceApiClient.getDialogueSnapshotRestoration`) and seeds
   * `turnSession.state`/`binding.sessionVersion` from it, instead of this
   * attachment silently starting fresh/blank the way an unbound one always
   * does. Never rejects: a long-lived worker's turn `queue` chain is built
   * entirely from `.then()` callbacks with no rejection handler (see
   * `handle`), so a rejected `queue` would permanently wedge every later
   * turn for this attachment, not just fail this one restoration. Failure
   * (restoration read error, or the authoritative session no longer
   * matching this attachment's own binding) instead sets `restoreFailed`,
   * which `handle` checks exactly like `released` -- a trusted/bound
   * attachment whose restored state could not be verified must never
   * silently run turns against an unverified one. */
  private async restoreBoundAttachment(
    turnSession: TurnSession,
    apiClient: VoiceApiClient,
    binding: VoiceSessionBinding,
  ): Promise<void> {
    try {
      const capability = await apiClient.issueCapability({
        voiceSessionId: binding.voiceSessionId,
        resourceScopeId: binding.resourceScopeId,
        routeProfileVersion: binding.routeProfileVersion,
        leaseEpoch: binding.leaseEpoch,
        scopes: ["session_execute"],
      });
      const restoration = await apiClient.getDialogueSnapshotRestoration(
        binding.voiceSessionId,
        capability.token,
      );
      if (
        restoration.session.resourceScopeId !== binding.resourceScopeId ||
        restoration.session.routeProfileVersion !==
          binding.routeProfileVersion ||
        restoration.session.leaseEpoch !== binding.leaseEpoch
      ) {
        throw new Error(
          "voice_restore_binding_mismatch: the authoritative session no longer matches this attachment's binding.",
        );
      }
      binding.sessionVersion = restoration.session.sessionVersion;
      // R4 residual: seed this attachment's own next `recordControlEvent`
      // sequence from the authoritative watermark instead of always
      // starting fresh at 1 -- a restored/reattached session (reconnect,
      // worker restart) must stay contiguous with whatever a prior
      // attachment already durably applied, or every one of this
      // attachment's events would be rejected as a gap (SD §5.4).
      turnSession.controlSequence =
        restoration.session.lastAppliedControlSequence + 1;
      if (restoration.snapshot) {
        turnSession.state.restoreFromSnapshotContent(
          restoration.snapshot.content,
        );
      }
    } catch (error) {
      turnSession.restoreFailed = true;
      console.error(
        "[voice-call-turn-coordinator] bound attachment restoration failed",
        error,
      );
    }
  }

  /** Durably opens (or confirms already-open) the authoritative,
   * speech-start-only `inputEpoch` watermark for this turn's own admitted
   * final, and returns the value `resolveInput`/`persistDialogueSnapshot`/
   * `request_handoff` must all submit instead of this attachment's local
   * `turnSession.inputEpoch` counter (R4 residual, see class doc).
   *
   * `sourceEventId: request.turnId` makes this call idempotent per turn
   * (a retried call for the SAME turn dedupes server-side instead of
   * consuming a second sequence number); `sequence` is this attachment's
   * own monotonic control-stream position, tracked in
   * `turnSession.controlSequence` and only advanced on a durable
   * deduped/applied response, never on a gap -- so a failed attempt
   * safely retries the same sequence next time instead of permanently
   * skipping it. `result.session` is a fresh authoritative read in every
   * branch (applied, deduped, or gap), so `binding.sessionVersion` is
   * reconciled from it whenever the session id correlates, same principle
   * `createTrustedDialoguePersistPort`'s own correlation check uses --
   * except `RecordControlEventResult.session` carries no
   * resourceScopeId/routeProfileVersion/leaseEpoch to cross-check further,
   * so this is the best correlation its current response shape allows.
   *
   * A `gap` (non-contiguous sequence, or a cross-media-epoch arrival) is
   * fail-closed here: it means the authoritative session never actually
   * opened a resolvable input watermark for this turn, so proceeding to
   * `resolveInput` with a stale/unresolved epoch would be worse than
   * rejecting this turn outright (SD §5.4 "不得跳號處理後面的肯定"). */
  private async recordAuthoritativeSpeechStart(
    turnSession: TurnSession,
    binding: VoiceSessionBinding,
    request: VoiceDialogueRequest,
  ): Promise<number> {
    const apiClient = this.apiClient;
    if (!apiClient) {
      throw new Error(
        "voice_control_event_unbound: no VoiceApiClient is configured.",
      );
    }
    const { signal } = request;
    if (signal.aborted) {
      throw new Error(
        "voice_control_event_aborted: request was already aborted before the control event was recorded.",
      );
    }
    const capability = await apiClient.issueCapability(
      {
        voiceSessionId: binding.voiceSessionId,
        resourceScopeId: binding.resourceScopeId,
        routeProfileVersion: binding.routeProfileVersion,
        leaseEpoch: binding.leaseEpoch,
        scopes: ["session_execute"],
      },
      signal,
    );
    if (signal.aborted) {
      throw new Error(
        "voice_control_event_aborted: request was aborted while awaiting capability issuance.",
      );
    }
    const sequence = turnSession.controlSequence ?? 1;
    const result = await apiClient.recordControlEvent(
      binding.voiceSessionId,
      capability.token,
      {
        source: "voice_media_worker",
        sourceEventId: request.turnId,
        occurredAt: new Date().toISOString(),
        sequence,
        mediaEpoch: request.mediaEpoch ?? 0,
        eventType: "speech_start",
      },
      signal,
    );
    if (result.applied || result.deduped) {
      turnSession.controlSequence = sequence + 1;
    }
    if (result.session.voiceSessionId === binding.voiceSessionId) {
      binding.sessionVersion = result.session.sessionVersion;
    }
    if (signal.aborted) {
      throw new Error(
        "voice_control_event_aborted: request was aborted while awaiting the control-event response.",
      );
    }
    if (!result.applied && !result.deduped) {
      throw new Error(
        "voice_control_event_gap: the authoritative session did not durably open a new input watermark for this turn.",
      );
    }
    return result.session.inputEpoch;
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
   * drives a turn; `speech.started` (barge-in) and `media.epoch.advanced`
   * (handoff/reconnect, Codex reopen round 5/6, R2 residual) both
   * invalidate whatever turn is currently active/queued so late
   * provider/TTS work is fenced before any audio reaches the caller.
   * `media.epoch.advanced` is published by `VoiceMediaWorkerSession.
   * advanceMediaEpoch` itself (not by a separate caller-side wrapper) --
   * this is the single boundary that reaches here regardless of whether
   * `advanceMediaEpoch` was called through `VoiceSessionComposer`'s own
   * composed method or directly on a retained session reference. Every
   * other event (TTS marks, DTMF) has no reason to touch a turn here. */
  handle(
    attachment: VoiceCallAttachment,
    event: VoiceMediaWorkerEvent,
    speaker: VoiceCallTurnSpeaker,
  ): void {
    const turnSession = this.sessions.get(attachment);
    // Unknown or already-released attachment: either a late event from an
    // attachment that was already torn down, or one that never started a
    // turn. Either way this is observable evidence only -- it must never
    // create new turn state under this (possibly stale) handle. A bound
    // attachment whose restoration failed (see `restoreBoundAttachment`) is
    // treated the same way: its dialogue state/binding could not be
    // verified against authoritative truth, so it must never run a turn
    // either.
    if (!turnSession || turnSession.restoreFailed) return;

    if (event.type === "speech.started" || event.type === "media.epoch.advanced") {
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
    // This attachment's own trusted port (set in `attach()` when it was
    // given a `VoiceSessionBinding`) takes priority over the coordinator-
    // wide default -- see `attach()`'s doc.
    const persistPort = turnSession.persistPort ?? this.persistPort;
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
        if (this.production && persistPort.mode === "fixture") {
          throw new Error("voice_persist_untrusted_for_production");
        }
        // R4 residual: a bound attachment's `request.inputEpoch` is only
        // this attachment's local turn-sequencing counter (see class
        // doc/`TurnSession.authoritativeInputEpoch`) -- never the
        // authoritative watermark `resolveInput`'s CAS actually checks.
        // Durably open (or confirm already-open) that watermark first,
        // then forward the resolved authoritative value in place of the
        // local one; an unbound attachment (no `binding`) or a
        // coordinator-wide `"trusted"` port used with no binding (see the
        // fixture-guard test above) is unaffected and keeps submitting
        // `bounded` unchanged, exactly as before this residual existed.
        if (persistPort.mode === "trusted" && turnSession.binding) {
          const authoritativeInputEpoch =
            await this.recordAuthoritativeSpeechStart(
              turnSession,
              turnSession.binding,
              bounded,
            );
          turnSession.authoritativeInputEpoch = authoritativeInputEpoch;
          await persistPort.persist(next, {
            ...bounded,
            inputEpoch: authoritativeInputEpoch,
          });
          return;
        }
        await persistPort.persist(next, bounded);
      },
      execute: (output, bounded) =>
        this.executeTools(output, turnSession, bounded),
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

  private async executeTools(
    output: VoiceDialogueOutput,
    turnSession: TurnSession,
    request: VoiceDialogueRequest,
  ): Promise<unknown[]> {
    const { state } = turnSession;
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
      return output.tools.map(() => ({
        status: "unavailable" as const,
        handoffId: null,
      }));
    }

    // Codex reopen round 5/6, R4: when this attachment has a real
    // `VoiceSessionBinding` and the coordinator has a real `apiClient`,
    // `request_handoff` is executed through the actual
    // `VoiceToolGatewayService.execute` repair anchor (apps/api) instead of
    // a local stub -- see `attach()`'s doc. Any other attachment (today,
    // every one -- no call-admission flow supplies a binding yet) keeps
    // the existing honest local stub unchanged.
    //
    // R6 (same reopen, residual): `request.signal` is this stage's own
    // bounded controller (see `dialogue-engine.ts#boundedStage`) -- already
    // aborted the moment this turn is superseded (barge-in, release, a
    // newer final, or a media-authority epoch advance, see
    // `VoiceCallTurnCoordinator.handle`) or its deadline passes. Checked
    // before each awaited HTTP call (never start one once already
    // cancelled) and forwarded into both calls so an in-flight request is
    // actually aborted, not merely unsignalled. `turnSession.
    // authoritativeInputEpoch` -- set by this same turn's own `persist`
    // stage (`recordAuthoritativeSpeechStart`, R4 residual), never
    // `request.inputEpoch` (this attachment's local turn-sequencing
    // counter, which may already have been bumped past this turn's own
    // admitted value by the same supersession that aborted
    // `request.signal`) and never the pre-residual `request.inputEpoch`
    // either -- is what is submitted, so this turn's `request_handoff`
    // CAS references the SAME authoritative watermark `persist` already
    // admitted it under, and a stale proposal can never be laundered
    // under a newer epoch merely because the HTTP call happened to still
    // be let through. `execute` only ever runs after this same turn's
    // `persist` stage has already set it (see `VoiceDialogueEngine.turn`'s
    // own stage order), so this is never undefined on a bound attachment
    // in practice; the local counter is kept as a defensive fallback only.
    if (turnSession.binding && this.apiClient) {
      const binding = turnSession.binding;
      const authoritativeInputEpoch =
        turnSession.authoritativeInputEpoch ?? request.inputEpoch;
      const results: unknown[] = [];
      for (const tool of output.tools) {
        if (tool.name !== "request_handoff") continue;
        request.signal.throwIfAborted();
        const capability = await this.apiClient.issueCapability(
          {
            voiceSessionId: binding.voiceSessionId,
            resourceScopeId: binding.resourceScopeId,
            routeProfileVersion: binding.routeProfileVersion,
            leaseEpoch: binding.leaseEpoch,
            scopes: HANDOFF_CAPABILITY_SCOPES,
          },
          request.signal,
        );
        request.signal.throwIfAborted();
        const response = await this.apiClient.requestHandoff(
          binding.voiceSessionId,
          capability.token,
          { inputEpoch: authoritativeInputEpoch, output },
          request.signal,
        );
        results.push(...response.results);
      }
      return results;
    }

    return output.tools.map(() => ({
      status: "unavailable" as const,
      handoffId: null,
    }));
  }
}
