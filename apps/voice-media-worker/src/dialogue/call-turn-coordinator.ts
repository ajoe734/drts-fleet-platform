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

/** One durably-not-yet-confirmed real control-plane observation -- see
 * `TurnSession.pendingControlEvents`.
 *
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (Codex reopen,
 * canonical 2026-10-03T21:09:40Z, "media transitions and speech backlog
 * do not share causal delivery/recovery"): previously `speech_start`
 * observations (`pendingSpeechStarts`) and a `media_epoch_transition`
 * (the single-slot `pendingMediaEpochTransitionId`) were two SEPARATE
 * mechanisms, each only aware of its own kind. A `speech.started` arriving
 * right after a `media.epoch.advanced` chained its own flush onto
 * `controlEventQueue` independently of the transition's own chained call --
 * `flushControlEventBacklog`'s drain loop then kept draining EVERY
 * speech-start pushed before its own `while` loop next checked the
 * array's length, including ones that arrived (in real time) AFTER the
 * transition, "overtaking" it and consuming the sequence slot the
 * transition needed. A lost transition acknowledgement also had no retry
 * of its own at all (only logged), unlike a lost speech-start. `eventType`
 * lets ONE ordered queue, drained strictly front-to-back regardless of
 * kind, give every control-plane observation the same causal-delivery and
 * bounded-retry guarantees `pendingSpeechStarts` already gave
 * speech-starts alone. */
interface PendingControlEvent {
  sourceEventId: string;
  occurredAt: string;
  mediaEpoch: number;
  eventType: "speech_start" | "media_epoch_transition";
  /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (Codex reopen,
   * canonical 2026-10-03T21:53:56Z, "final-only fallback bypasses
   * retained delivery"): set the instant `flushControlEventBacklog`
   * first picks this entry for an attempt, and never cleared again even
   * once that attempt's HTTP call settles (success removes the entry
   * from the array entirely; failure leaves it both in the array AND
   * `attempted`). Distinguishes a genuinely never-tried observation from
   * one whose outcome is merely unknown (timed out, transport failure) --
   * `enqueueControlEvent`'s overflow policy must never evict the latter,
   * since the server MAY already have durably applied it; only a
   * never-attempted entry's loss is the documented, bounded-backlog
   * tradeoff. */
  attempted?: boolean;
  /** Set only by `recordAuthoritativeSpeechStart`'s fallback path (a
   * final transcript with no preceding real `speech.started`): lets that
   * specific caller learn this exact entry's own resolved epoch once
   * `flushControlEventBacklog` durably applies it, or learn that it was
   * evicted under backlog pressure -- without the caller needing its own
   * separate, unretained submission mechanism (R4-control, same reopen,
   * "fallback events must share the SAME causal delivery/retry/overflow
   * guarantees a real barge-in's speech-start already gets"). A real
   * `speech.started`/`media.epoch.advanced` observation has no caller
   * waiting on its outcome, so this is `undefined` for those. */
  settle?: {
    resolve: (epoch: number) => void;
    reject: (error: unknown) => void;
  };
}

/** Bound on `TurnSession.pendingControlEvents` -- see that field's own doc
 * on the drop-oldest policy this enforces. Counts only EVICTABLE entries
 * (see `isEvictableControlEvent`); a protected entry (ambiguous outcome,
 * or any `media_epoch_transition`) never counts against this cap. */
const MAX_CONTROL_EVENT_BACKLOG = 8;

/** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control boundedness (Codex
 * reopen, canonical 2026-10-03T22:41:06Z, "every media_epoch_transition is
 * exempt and the backlog is explicitly unbounded"): `MAX_CONTROL_EVENT_BACKLOG`
 * only bounds evictable entries -- every `media_epoch_transition` and every
 * `attempted` (ambiguous-outcome) `speech_start` is deliberately exempt
 * from it, by design (see `isEvictableControlEvent`'s own doc), since
 * dropping either one permanently blocks every later event at the new
 * epoch, or risks a duplicate the server's own dedup might not catch. SD
 * §5.4 still requires a FINITE retained backlog even during a sustained
 * outage where every outstanding entry is protected -- this is the total
 * cap across ALL entries, evictable or not, that makes that true. It is
 * deliberately far above `MAX_CONTROL_EVENT_BACKLOG` (every real call this
 * worker admits needs far fewer than this many concurrently outstanding
 * control observations) so it is never reached by the retained-delivery
 * policy's own normal operation -- only by a sustained outage that
 * accumulates more PROTECTED entries than this worker can safely retain
 * memory for. Exceeding it is never resolved by dropping a required
 * transition and silently letting a successor proceed as if the chain
 * were intact (the previous, rejected approach) -- the only safe action
 * left is to fail this attachment closed via the SAME `restoreFailed`
 * path a failed restoration already uses (`handle()` then treats it
 * exactly like a released attachment: a late event is observable evidence
 * only, never new input), forcing an explicit reattachment/recovery
 * instead of growing without bound. */
const MAX_TOTAL_CONTROL_EVENT_BACKLOG = 32;

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
  /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (bounded retained
   * delivery, Codex reopen canonical 2026-10-03T20:13:00Z, then unified
   * with media-epoch transitions per the canonical 2026-10-03T21:09:40Z
   * reopen -- see `PendingControlEvent`'s own doc): one entry per
   * genuinely distinct real control-plane observation (a `speech.started`
   * barge-in OR a `media.epoch.advanced` transition) this attachment has
   * seen but not yet confirmed durably applied, in STRICT arrival order
   * regardless of kind. Replaces both the earlier single-slot
   * `pendingControlEventId`/`pendingMediaEpochTransitionId` designs, which
   * each reused/overwrote a single identity rather than queuing distinct
   * observations, and the earlier `pendingSpeechStarts`-only backlog,
   * whose own drain loop could "overtake" a transition that arrived
   * in between two speech-starts because the two kinds were tracked on
   * separate mechanisms with no shared ordering. `flushControlEventBacklog`
   * always drains this strictly from the front (oldest first, whichever
   * kind) so an earlier failed observation of EITHER kind is retried
   * before a later one of EITHER kind is ever attempted at the next
   * sequence slot -- never skipped, never overwritten, never reordered.
   * Bounded at `MAX_CONTROL_EVENT_BACKLOG`: under a sustained outage the
   * OLDEST entry is dropped once the cap is exceeded rather than
   * retaining state unboundedly for this attachment's lifetime (a
   * deliberate, documented loss policy, not an oversight) -- except the
   * entry `inFlightControlEvent` currently references, which overflow
   * eviction must never target (see that field's own doc). */
  pendingControlEvents: PendingControlEvent[];
  /** The exact `pendingControlEvents` entry `flushControlEventBacklog`'s
   * drain loop is currently awaiting `recordAuthoritativeControlEvent`
   * for, by object identity -- set the moment the loop picks it (always
   * the array's current front) and cleared once that call settles.
   *
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control backlog (Codex
   * reopen, canonical 2026-10-03T21:09:40Z, "overflow evicts active entry
   * then its acknowledgement deletes a different retained entry"): the
   * previous overflow-eviction policy always dropped `pendingSpeechStarts[0]`
   * on overflow, and the drain loop's own post-await removal always
   * shifted index 0 again once its call settled -- both assumed the
   * array's front never moves out from under an in-flight await. Under a
   * sustained outage, an overflow eviction concurrent with that await
   * silently dropped the IN-FLIGHT entry itself from the array (shifting
   * every later entry up by one); the drain loop's later unconditional
   * `shift()` then removed whatever entry had drifted into index 0 --  a
   * DIFFERENT, never-submitted observation -- attributing the in-flight
   * entry's own (unrelated) acknowledgement to it. This field lets both
   * sites work by identity instead of array position: eviction skips
   * whichever entry equals this field, and the drain loop removes exactly
   * this field's own entry (via `indexOf`) rather than blindly shifting
   * the front. */
  inFlightControlEvent?: PendingControlEvent;
  /** Armed by `flushControlEventBacklog` whenever a flush attempt fails
   * and this attachment is neither released nor restoration-failed, so a
   * still-outstanding backlog resumes draining on its own even if no
   * later `speech.started`/`media.epoch.advanced`/final ever arrives to
   * naturally retrigger it ("no-final outage recovery"). Cleared on
   * `release` and at the start of every flush attempt. Previously only
   * armed for a failed speech-start; a failed `media_epoch_transition`
   * only logged with no retry of its own at all (R4-control, canonical
   * 2026-10-03T21:09:40Z reopen) -- now unified, both kinds share this
   * same timer since both now share the same backlog. */
  controlEventRetryTimer?: ReturnType<typeof setTimeout>;
  /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (Codex reopen,
   * canonical 2026-10-03T23:31:57Z, "arbitrary N speech observations still
   * creates arbitrary N promise-chain work and then N timers"): every
   * `enqueueControlEvent` call used to chain its own
   * `flushControlEventBacklog` task regardless of whether one was already
   * chained and would drain the exact same backlog anyway -- N enqueues
   * while one drain is outstanding chained N independent tasks, and a
   * failure in each independently armed its OWN `controlEventRetryTimer`,
   * each overwriting (never clearing) whichever timer the previous one had
   * just armed, leaking N-1 orphaned timers no `release()` could ever
   * reach. `true` from the moment a drain task is chained until its
   * promise settles (success or failure); `flushControlEventBacklog`
   * short-circuits to a no-op while this is `true`, since the single
   * outstanding drain's own `while` loop already keeps consuming
   * `pendingControlEvents` from the front until empty -- any entry a
   * later call enqueues WHILE the `while` loop is still running is already
   * covered by it.
   *
   * Correction (Codex reopen, canonical 2026-10-04T00:26:49Z, "lost wakeup
   * after successful drain"): an arrival landing in the gap AFTER the
   * `while` loop exits (queue observed empty) but BEFORE the chained
   * task's own promise settlement actually clears this flag is NOT
   * covered by the loop that already exited -- a prior version of the
   * success continuation only cleared this flag with no backlog recheck,
   * silently stranding any such arrival with no running/scheduled owner.
   * `flushControlEventBacklog`'s own success continuation now re-checks
   * the backlog in the same tick it clears this flag; see that method's
   * own doc. */
  controlEventDrainInFlight?: boolean;
  /** The authoritative, server-durable `inputEpoch` the most recent
   * `recordAuthoritativeControlEvent` call resolved -- distinct from
   * `inputEpoch` above (this class's process-local turn-sequencing
   * counter, used only for local supersession/cancellation fencing, see
   * `handle`). `resolveInput`'s CAS and `request_handoff`'s submission
   * must both use THIS value, never the local counter, or they fence
   * against a watermark the authoritative session never actually opened
   * for this turn. Read once by the SAME (or a later) turn's `persist`
   * stage -- see `authoritativeInputEpochConsumed` and `executeTurn`'s
   * doc (Codex reopen round 16/17, R4-control). */
  authoritativeInputEpoch?: number;
  /** `false` exactly when `authoritativeInputEpoch` was opened by a real
   * `speech.started` control event (see `recordSpeechStartControlEvent`)
   * that no turn's `persist` stage has consumed yet -- `true` once a turn
   * has used it, or once a turn opened it itself (the fallback path, see
   * `executeTurn`), or seeded from a restored session with no open
   * watermark (R4-control). A turn's `persist` stage only needs to open a
   * NEW watermark of its own when this is `true` (or `undefined`); a
   * `false` value means a real barge-in already durably opened one this
   * turn must reuse, never duplicate. */
  authoritativeInputEpochConsumed?: boolean;
  /** Serializes every `recordAuthoritativeControlEvent` call for this
   * attachment -- both the real `speech.started`-triggered write
   * (`recordSpeechStartControlEvent`) and a turn's own fallback write
   * (`executeTurn`'s `persist` stage, when no real one already opened a
   * watermark) -- so the two paths that share this attachment's single
   * `controlSequence` counter can never issue concurrently and race each
   * other onto the same sequence number (Codex reopen round 16/17,
   * R4-control). Distinct from `queue`, which only serializes turns: a
   * `speech.started` signal has no turn of its own, and must still be
   * able to durably open a watermark even if no final ever follows it.
   * Chained via `chainControlEvent`, which never lets a rejection
   * permanently wedge this chain the way an unhandled `queue` rejection
   * would (see `restoreBoundAttachment`'s doc on that same hazard). */
  controlEventQueue: Promise<void>;
  /** Aborts only on `release` -- never on a barge-in, newer final, or
   * turn timeout the way `activeAbort` does. A real `speech.started`
   * control event must still land durably even though the turn it
   * (possibly) precedes gets cancelled by that same signal; only the
   * attachment going away entirely should stop it (R4-control). */
  releaseAbort: AbortController;
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
 * `attach()`'s own doc and `../server/voice-session-binding.ts`).
 *
 * The ordered control-event watermark (R4 residual, repaired Codex reopen
 * round 16/17, R4-control): `handle()` now calls
 * `recordSpeechStartControlEvent` for every REAL `speech.started` barge-in
 * frame, which durably records a `recordControlEvent("speech_start")`
 * immediately -- independent of whether any `asr.segment.final` ever
 * follows it, and without waiting for `executeTurn`'s own provider/LLM
 * call. A delayed, failed, or absent next final therefore still leaves the
 * authoritative session aware that new speech was observed, instead of a
 * stale `controlCutoff` built against the OLD watermark continuing to pass
 * `assertControlCutoffStillValid`. `executeTurn`'s `persist` stage reuses
 * that already-open watermark (`turnSession.authoritativeInputEpoch`/
 * `authoritativeInputEpochConsumed`) for the turn it belongs to, and only
 * falls back to opening one itself (via `recordAuthoritativeSpeechStart`)
 * when no real `speech.started` already did -- e.g. a final that arrives
 * with no preceding barge-in frame at all, which every existing fixture-
 * driven test exercises. Both paths serialize through the SAME
 * `controlEventQueue` (never `queue`, which only serializes turns) so they
 * can never race this attachment's shared `controlSequence` counter, and
 * both resolve the authoritative `inputEpoch` `resolveInput`/
 * `persistDialogueSnapshot`/`request_handoff` must all use instead of this
 * attachment's process-local turn-sequencing counter
 * (`turnSession.inputEpoch`). That local counter is NOT replaced or
 * removed -- it still fences local supersession/cancellation exactly as
 * R1-R3 above describe (a stale turn's authoritative watermark still opens
 * durably even if the turn using it is itself superseded moments later;
 * the SAME `isCurrent`/`isStale`/`abortController` checks that already
 * gate every other effect gate this one too, via the engine's own
 * `boundedStage`/`persist` fail-closed path). The two epoch spaces are
 * therefore reconciled per turn, inside the existing cancellation-fenced
 * stage, rather than by merging the two counters into one.
 * `recordAuthoritativeControlEvent` also reconciles
 * `turnSession.controlSequence` from the authoritative response on every
 * non-`gap` result, not only one where this exact call was the one
 * applied/deduped -- the other half of R4-control's "response-loss
 * recovery is also absent" finding: a prior attempt for the same sequence
 * that durably landed while only its own HTTP response was lost no longer
 * permanently desynchronizes this attachment's local counter from the
 * authoritative one. Restoration on attach/reconnect (session + latest
 * dialogue snapshot, plus this attachment's next control-event sequence
 * AND whether its restored watermark is still open) is implemented below
 * (`restoreBoundAttachment`) for any attachment that IS given a real
 * binding; restart-time re-attachment of an in-flight call is still gated
 * on the same genuinely-unavailable call-admission flow.
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
      controlEventQueue: Promise.resolve(),
      releaseAbort: new AbortController(),
      released: false,
      activeAbort: null,
      pendingControlEvents: [],
      ...(binding ? { binding } : {}),
    };
    if (binding && this.apiClient) {
      turnSession.persistPort = createTrustedDialoguePersistPort(
        this.apiClient,
        () => turnSession.binding,
        // R4-persist (Codex reopen, canonical 2026-10-03T17:41:28Z): a
        // fresh attachment-scoped bound for each reconciliation read --
        // never a turn's own `request.signal`, which is exactly what has
        // already fired whenever a cancelled turn needs this. Same
        // release+deadline bound every other no-turn-of-its-own control
        // write on this attachment already uses (`boundedControlSignal`).
        () => this.boundedControlSignal(turnSession),
      );
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: seed this bound
      // attachment's dialogue state and `binding.sessionVersion` from
      // authoritative truth before any turn runs, instead of always
      // starting fresh/blank -- see `restoreBoundAttachment`'s own doc.
      // `attach()` stays synchronous (unchanged signature, no blast radius
      // on existing callers): the restoration promise is installed as this
      // attachment's initial `queue` AND initial `controlEventQueue` so
      // both the first turn and a `speech.started` arriving before
      // restoration settles (R4-control) naturally wait for it, exactly
      // the same mechanism that already serializes turns against each
      // other.
      const restoration = this.restoreBoundAttachment(
        turnSession,
        this.apiClient,
        binding,
      );
      turnSession.queue = restoration;
      turnSession.controlEventQueue = restoration;
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
   * silently run turns against an unverified one.
   *
   * Both network calls are bound to `turnSession.releaseAbort.signal` (the
   * same controller `release()` already fires and `recordAuthoritativeControlEvent`
   * already uses) so a `release()`/replacement while this is still in
   * flight actually cancels it (Codex reopen round 18, R11) instead of
   * leaving a never-settling restoration with no bound at all -- the
   * abort surfaces as a rejection into the `catch` below exactly like any
   * other restoration failure, so it still resolves `restoreFailed` rather
   * than leaking a dangling request.
   */
  private async restoreBoundAttachment(
    turnSession: TurnSession,
    apiClient: VoiceApiClient,
    binding: VoiceSessionBinding,
  ): Promise<void> {
    // R11 (Codex reopen, canonical 2026-10-03T17:41:28Z): the previous
    // signal here was only `releaseAbort.signal`, which fires on
    // `release()` but never on its own -- a restoration read that simply
    // never settles (an uncooperative/hung apps/api call, not necessarily
    // an abort-respecting rejection) held BOTH `queue` and
    // `controlEventQueue` open indefinitely, since neither this method
    // nor `VoiceApiClient` imposed any deadline of its own. Bound this
    // whole restoration stage to the same `turnTimeoutMs` every other
    // bounded control write on this attachment already uses, independent
    // of whether a turn or a release ever happens -- a restoration that
    // is still outstanding past that deadline must fail exactly like any
    // other restoration error (sets `restoreFailed`, unblocks both
    // chained queues) instead of leaving them wedged forever.
    const bounded = this.boundedControlSignal(turnSession);
    try {
      const capability = await apiClient.issueCapability(
        {
          voiceSessionId: binding.voiceSessionId,
          resourceScopeId: binding.resourceScopeId,
          routeProfileVersion: binding.routeProfileVersion,
          leaseEpoch: binding.leaseEpoch,
          scopes: ["session_execute"],
        },
        bounded.signal,
      );
      const restoration = await apiClient.getDialogueSnapshotRestoration(
        binding.voiceSessionId,
        capability.token,
        bounded.signal,
      );
      if (
        // Codex reopen round 18, R4-persist: `voiceSessionId` itself was
        // never checked -- only scope/route/lease -- so a response for a
        // completely different session that happened to share this
        // binding's scope/route/lease (a misattributed/foreign reply, not
        // a legitimate "same session, different revision" case any of the
        // other fields alone would cover) was silently trusted.
        restoration.session.voiceSessionId !== binding.voiceSessionId ||
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
      // R4-control: a restored session's own `pendingInput` tells this
      // attachment whether the authoritative watermark it is restoring is
      // still open (a prior attachment's `speech.started` was durably
      // recorded but never reached a completed turn -- worker restart,
      // reconnect) or already resolved. `false` (open) lets the very
      // first turn on this attachment reuse it directly instead of
      // opening a redundant second one; `true` (resolved) means the next
      // turn must open its own, exactly like a brand-new attachment with
      // no restored watermark at all.
      turnSession.authoritativeInputEpoch = restoration.session.inputEpoch;
      turnSession.authoritativeInputEpochConsumed =
        !restoration.session.pendingInput;
      if (restoration.snapshot) {
        // Codex reopen round 18, R4-persist: previously trusted
        // unconditionally -- no check that this snapshot actually belongs
        // to this session, is from a revision this restoration's own
        // `session` could plausibly have produced, or has not already
        // passed its own retention window. A foreign/stale/expired
        // snapshot installed here (e.g. a foreign handoff) would corrupt
        // this attachment's dialogue state before any turn ever runs.
        const snapshot = restoration.snapshot;
        const snapshotCorrelates =
          snapshot.voiceSessionId === binding.voiceSessionId &&
          snapshot.sessionVersion <= restoration.session.sessionVersion &&
          snapshot.inputEpoch <= restoration.session.inputEpoch &&
          new Date(snapshot.retentionExpiresAt).getTime() > Date.now();
        if (!snapshotCorrelates) {
          throw new Error(
            "voice_restore_snapshot_mismatch: the restored dialogue-snapshot does not correlate with this session's authoritative revision, or has already expired.",
          );
        }
        turnSession.state.restoreFromSnapshotContent(snapshot.content);
        turnSession.state.committedSessionVersion = snapshot.sessionVersion;
      }
    } catch (error) {
      turnSession.restoreFailed = true;
      console.error(
        "[voice-call-turn-coordinator] bound attachment restoration failed",
        error,
      );
    } finally {
      bounded.cancel();
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
   * rejecting this turn outright (SD §5.4 "不得跳號處理後面的肯定").
   *
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (Codex reopen,
   * canonical 2026-10-03T21:53:56Z, "final-only fallback bypasses
   * retained delivery"): previously submitted this observation directly
   * via a one-shot `chainControlEvent` call, entirely independent of
   * `pendingControlEvents`/`enqueueControlEvent`/`flushControlEventBacklog`
   * -- a real `speech.started`/`media.epoch.advanced` observation got the
   * unified backlog's retry/overflow/ordering guarantees, but a final
   * transcript's OWN fallback watermark-open (no preceding real
   * `speech.started`) did not: a lost HTTP acknowledgement for it left no
   * retained entry at all, so a later `media.epoch.advanced` could be
   * submitted at the exact sequence slot the fallback's durably-applied
   * (but unacknowledged) write already consumed, and every such attempt
   * failed `VOICE_ACTION_PAYLOAD_CONFLICT` forever with no way to ever
   * resolve it. This now enqueues the SAME kind of entry a real
   * `speech.started` would (`enqueueControlEvent`), so it shares that
   * backlog's strict front-to-back ordering (any later observation,
   * including a `media.epoch.advanced`, queues behind it and can never
   * attempt a different slot while this one is unresolved), its bounded
   * retry/no-final outage recovery, and its overflow protection (never
   * attempted = never durably known, so `attempted`-aware eviction in
   * `enqueueControlEvent` never silently drops it once a real attempt has
   * started). The HTTP call itself runs under `boundedControlSignal`
   * (attachment-scoped, tied to `release()`/`turnTimeoutMs`), never this
   * turn's own `request.signal` -- the write must still land durably even
   * if THIS turn is cancelled while waiting on it (same principle as a
   * real barge-in's speech-start). `raceControlEventSettlement` bounds
   * only how long THIS turn is willing to wait for the outcome by
   * `request.signal`; losing that race never cancels or removes the
   * underlying retained entry. */
  private recordAuthoritativeSpeechStart(
    turnSession: TurnSession,
    binding: VoiceSessionBinding,
    request: VoiceDialogueRequest,
  ): Promise<number> {
    let resolve!: (epoch: number) => void;
    let reject!: (error: unknown) => void;
    const settled = new Promise<number>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.enqueueControlEvent(turnSession, binding, {
      sourceEventId: request.turnId,
      occurredAt: new Date().toISOString(),
      mediaEpoch: request.mediaEpoch ?? 0,
      eventType: "speech_start",
      settle: { resolve, reject },
    });
    return this.raceControlEventSettlement(settled, request.signal);
  }

  /** Bounds how long a caller that needs a specific `PendingControlEvent`
   * entry's resolved value (only `recordAuthoritativeSpeechStart`'s
   * fallback path today) is willing to wait for it, by `signal` -- never
   * cancelling or removing the underlying retained entry on loss, which
   * keeps draining/retrying on `turnSession.pendingControlEvents`
   * regardless of whether anyone is still waiting on this race (R4-control,
   * canonical 2026-10-03T21:53:56Z: "preserve turn cancellation without
   * erasing accepted control evidence"). */
  private raceControlEventSettlement<T>(
    settlement: Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    if (signal.aborted) {
      return Promise.reject(
        new Error(
          "voice_control_event_aborted: the turn was already aborted before its control-event outcome could be awaited.",
        ),
      );
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        reject(
          new Error(
            "voice_control_event_aborted: the turn was superseded while awaiting its control-event outcome; the underlying observation remains retained for delivery.",
          ),
        );
      };
      signal.addEventListener("abort", onAbort, { once: true });
      settlement.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  }

  /** Durably opens (or confirms already-open) the authoritative
   * speech-start watermark for ONE observed real input -- either a real
   * `speech.started` control frame (`recordSpeechStartControlEvent`) or,
   * when no such frame preceded it, the turn that an admitted
   * `asr.segment.final` itself starts (`executeTurn`'s fallback, R4
   * residual). Both callers always go through `chainControlEvent` first
   * (never call this directly), which is what keeps this attachment's
   * single `controlSequence` counter safe to read/advance here without
   * its own locking.
   *
   * `sourceEventId` makes this call idempotent per observed input (a
   * retried call for the SAME one dedupes server-side instead of
   * consuming a second sequence number); `sequence` is this attachment's
   * own monotonic control-stream position, tracked in
   * `turnSession.controlSequence` and only advanced from the
   * authoritative response, never optimistically -- so a failed attempt
   * safely retries the same sequence next time instead of permanently
   * skipping it.
   *
   * Codex reopen round 16/17, R4-control ("response-loss recovery is
   * also absent"): every non-`gap` response reconciles
   * `turnSession.controlSequence` from `result.appliedThroughSequence`,
   * not only one where `applied`/`deduped` is true for THIS call. A
   * `sequence <= lastAppliedControlSequence` "safe no-op" response (see
   * `VoiceSessionService.recordControlEvent`) means a PRIOR attempt for
   * this exact sequence already landed durably and only its own response
   * was lost (network failure, worker restart) -- this attachment is the
   * sole producer of its own sequence space, so that can only be its own
   * earlier write, never a legitimately different event. Treating that
   * case as an unresolvable `voice_control_event_gap` (the previous
   * behaviour) would permanently desynchronize this attachment's local
   * counter from the authoritative one: every later observed input would
   * keep retrying the same already-consumed sequence number and keep
   * failing the exact same way, forever losing every later authoritative
   * write while the local counter never catches up. Only an actual
   * `gap: true` response (non-contiguous sequence, or a cross-media-epoch
   * arrival) means the authoritative session never actually opened a
   * resolvable input watermark for this call -- that one is still fail-
   * closed, exactly as before (SD §5.4 "不得跳號處理後面的肯定"). */
  private async recordAuthoritativeControlEvent(
    turnSession: TurnSession,
    binding: VoiceSessionBinding,
    event: {
      sourceEventId: string;
      occurredAt: string;
      mediaEpoch: number;
      /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (media-epoch
       * continuation): previously hardcoded to `"speech_start"` -- this
       * method is now also the single submission path
       * `recordMediaEpochTransition` uses for `"media_epoch_transition"`,
       * so the actual type must come from the caller, never be assumed. */
      eventType: string;
      signal: AbortSignal;
    },
  ): Promise<number> {
    const apiClient = this.apiClient;
    if (!apiClient) {
      throw new Error(
        "voice_control_event_unbound: no VoiceApiClient is configured.",
      );
    }
    const { signal } = event;
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
        sourceEventId: event.sourceEventId,
        occurredAt: event.occurredAt,
        sequence,
        mediaEpoch: event.mediaEpoch,
        eventType: event.eventType,
      },
      signal,
    );
    if (signal.aborted) {
      throw new Error(
        "voice_control_event_aborted: request was aborted while awaiting the control-event response.",
      );
    }
    if (result.gap) {
      throw new Error(
        "voice_control_event_gap: the authoritative session did not durably open a new input watermark for this event.",
      );
    }
    // R4-control (Codex reopen, canonical 2026-10-03T17:41:28Z): a
    // `!gap` response alone does not prove THIS submitted sequence was
    // ever applied -- `VoiceSessionService.recordControlEvent`'s
    // "already applied" no-op path also returns `gap:false` for a
    // sequence at or behind the current watermark. Require the
    // authoritative watermark to have actually reached (or passed) what
    // was just submitted before trusting `result.session.inputEpoch` as
    // this event's correlated outcome; a durable-but-unapplied row
    // (service CAS loss) must keep retrying through the next write on
    // this queue, never be mistaken for a correlated acknowledgement.
    if (result.appliedThroughSequence < sequence) {
      throw new Error(
        "voice_control_event_unapplied: the authoritative session has not yet applied this submitted sequence.",
      );
    }
    turnSession.controlSequence = result.appliedThroughSequence + 1;
    // Codex reopen round 15/16, R4-persist ("audit the same mutable update
    // at recordAuthoritativeSpeechStart"): same monotonic guard as
    // `dialogue-persist-port.ts`'s `persist()` -- a genuinely correlated
    // but late response here must not regress this binding below a value
    // a newer, already-completed turn has advanced it to either.
    if (
      result.session.voiceSessionId === binding.voiceSessionId &&
      result.session.sessionVersion > binding.sessionVersion
    ) {
      binding.sessionVersion = result.session.sessionVersion;
    }
    return result.session.inputEpoch;
  }

  /** Never lets a rejection from `task` permanently wedge this
   * attachment's `controlEventQueue` the way an unhandled `queue`
   * rejection would (R4-control; see `TurnSession.controlEventQueue`'s
   * doc) -- the returned promise still rejects for THIS caller so a
   * turn's own fallback write can fail its turn closed, but the queue
   * itself always continues to the next chained write regardless of how
   * this one settles.
   *
   * R11 (Codex reopen round 18): this queue's first link, for a bound
   * attachment, IS `restoreBoundAttachment`'s own promise (see `attach()`)
   * -- which never rejects, only sets `restoreFailed` (so it can never
   * wedge this queue either). A `speech.started` chained here before
   * restoration settles would otherwise still run `task` once that
   * promise fulfills, even though restoration is now known to have
   * failed -- re-checked here, the same barrier `runTurn` already
   * re-checks for the turn `queue`, so an authority-dependent control
   * write can never execute against unverified dialogue state. */
  private chainControlEvent<T>(
    turnSession: TurnSession,
    task: () => Promise<T>,
  ): Promise<T> {
    const settled = turnSession.controlEventQueue.then(() => {
      if (turnSession.restoreFailed) {
        throw new Error(
          "voice_control_event_restoration_failed: attachment restoration failed; refusing to record an authority-dependent control event.",
        );
      }
      return task();
    });
    turnSession.controlEventQueue = settled.then(
      () => undefined,
      () => undefined,
    );
    return settled;
  }

  /** R4-control: durably records a REAL `speech.started` barge-in
   * signal's own speech-start control event immediately, independent of
   * whether any `asr.segment.final` ever follows it -- a delayed, failed,
   * or absent final must never leave the authoritative session unaware
   * that new speech was observed (Codex reopen round 16/17's exact
   * probe: a completed turn followed by a `speech.started` with no next
   * final left `/events` count and `pendingInput` both unchanged, so a
   * stale `controlCutoff` built against the OLD watermark still passed
   * `assertControlCutoffStillValid`).
   *
   * Called directly from `handle()`, which is synchronous and must not
   * await this. Enqueues this exact observation onto the shared
   * `turnSession.pendingControlEvents` queue (unified causal delivery,
   * Codex reopen canonical 2026-10-03T21:09:40Z; see that field's own
   * doc) and kicks off a flush -- never drops or overwrites an earlier
   * still-outstanding observation of either kind. */
  private recordSpeechStartControlEvent(
    turnSession: TurnSession,
    event: VoiceMediaWorkerEvent,
  ): void {
    const binding = turnSession.binding;
    const persistPort = turnSession.persistPort ?? this.persistPort;
    if (!binding || !this.apiClient || persistPort.mode !== "trusted") return;
    this.enqueueControlEvent(turnSession, binding, {
      sourceEventId: randomUUID(),
      occurredAt: event.occurredAt,
      mediaEpoch: event.mediaEpoch,
      eventType: "speech_start",
    });
  }

  /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (media-epoch
   * continuation, Codex reopen canonical 2026-10-03T19:24:15Z and
   * 2026-10-03T20:13:00Z, unified with speech-start delivery per the
   * canonical 2026-10-03T21:09:40Z reopen): a real `media.epoch.advanced`
   * event (reconnect/handoff, published by `VoiceMediaWorkerSession.
   * advanceMediaEpoch`) previously only invalidated this attachment's own
   * local turn bookkeeping (`handle()`'s `inputEpoch`/`activeAbort`
   * cancellation) -- `VoiceSessionService.recordControlEvent` pins
   * whichever media epoch first reaches it and fail-closed-rejects every
   * later mismatched arrival forever after (SD §5.3 "舊 epoch final 不得
   * 覆蓋新連線內容"), so without an explicit authoritative transition call
   * no legitimate new epoch could ever resume turn composition through
   * this worker again. Durably records this exact transition via the
   * dedicated `media_epoch_transition` eventType the service recognizes
   * as a strictly-forward pin advance, never a mismatch gap (see
   * `VoiceSessionService.recordControlEvent`'s own doc on that branch).
   *
   * Enqueues onto the SAME ordered `pendingControlEvents` queue a real
   * `speech.started` uses (previously a separate single-slot mechanism
   * with no retry of its own on failure -- just a log). A transition
   * queued between two speech-starts can therefore never be "overtaken"
   * by the later one, and a lost transition acknowledgement now gets the
   * same bounded retry/no-final outage recovery every speech-start
   * already got. `flushControlEventBacklog`'s drain loop deliberately
   * never touches `authoritativeInputEpoch`/`authoritativeInputEpochConsumed`
   * for a `media_epoch_transition` entry -- a media-epoch transition is a
   * different authority axis than ASR input (SD §5.3 vs §5.4) and must
   * never be mistaken for one opening or consuming a speech-start
   * watermark. */
  private recordMediaEpochTransition(
    turnSession: TurnSession,
    event: VoiceMediaWorkerEvent,
  ): void {
    const binding = turnSession.binding;
    const persistPort = turnSession.persistPort ?? this.persistPort;
    if (!binding || !this.apiClient || persistPort.mode !== "trusted") return;
    this.enqueueControlEvent(turnSession, binding, {
      sourceEventId: randomUUID(),
      occurredAt: event.occurredAt,
      mediaEpoch: event.mediaEpoch,
      eventType: "media_epoch_transition",
    });
  }

  /** Shared enqueue path for both `recordSpeechStartControlEvent` and
   * `recordMediaEpochTransition` (R4-control unified delivery): appends
   * `entry` to `turnSession.pendingControlEvents`, applies the bounded
   * drop-oldest overflow policy -- skipping whichever entry
   * `inFlightControlEvent` currently references, so overflow eviction can
   * never silently remove the one entry a flush is actively awaiting an
   * acknowledgement for (R4-control backlog overflow, canonical
   * 2026-10-03T21:09:40Z reopen) -- then kicks off a flush. */
  /** Overflow eviction may only ever target an entry that is BOTH (a)
   * never attempted -- its outcome is a plain, known "never sent", not an
   * ambiguous timeout/transport failure -- and (b) a `speech_start`, never
   * a `media_epoch_transition`.
   *
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control overflow (Codex
   * reopen, canonical 2026-10-03T21:53:56Z, two distinct subcases):
   * (a) the previous policy only protected the literal
   * `inFlightControlEvent` reference, which `flushControlEventBacklog`
   * clears the instant its own HTTP call settles -- including a timeout/
   * transport-failure settlement whose server-side outcome is genuinely
   * unknown (the write may have landed durably with only the
   * acknowledgement lost). A burst of new observations arriving in that
   * window could evict that still-ambiguous entry, losing its identity
   * forever and letting a later duplicate collide with the server's own
   * dedup for the original. `attempted` (set once, kept forever, see that
   * field's own doc) protects an entry for as long as its outcome stays
   * unknown, independent of whether an HTTP call for it is actively
   * in-flight right now.
   * (b) a `media_epoch_transition` is a different authority axis than a
   * `speech_start` (SD §5.3 vs §5.4) and has no "acceptable loss" case the
   * way a missed barge-in observation does: losing one permanently blocks
   * every later event at the new epoch from ever being admitted. It is
   * therefore never evictable at all, attempted or not. */
  private isEvictableControlEvent(entry: PendingControlEvent): boolean {
    return entry.eventType === "speech_start" && entry.attempted !== true;
  }

  private enqueueControlEvent(
    turnSession: TurnSession,
    binding: VoiceSessionBinding,
    entry: PendingControlEvent,
  ): void {
    turnSession.pendingControlEvents.push(entry);
    // Bounded backlog (see `TurnSession.pendingControlEvents`'s own doc):
    // drop the OLDEST evictable entry under sustained outage rather than
    // grow without bound -- "evictable" (see `isEvictableControlEvent`)
    // excludes every entry whose outcome is not definitively "never
    // attempted", and every `media_epoch_transition`, not merely the
    // single literal in-flight reference. The cap itself counts only
    // evictable entries too (same reasoning the single-exclusion version
    // of this comment already gave: counting the RAW array length would
    // keep evicting whatever entry drifts into the evictable set right
    // after a protected one, one at a time, instead of settling at
    // exactly `MAX_CONTROL_EVENT_BACKLOG` evictable entries alongside
    // however many protected (attempted/ambiguous or transition) entries
    // also happen to be outstanding). If NO entry is currently evictable
    // (every outstanding entry is either ambiguous or a transition), the
    // backlog is deliberately allowed to exceed the cap rather than evict
    // a protected one -- a bounded safety overflow, not an oversight.
    const evictable = turnSession.pendingControlEvents.filter((candidate) =>
      this.isEvictableControlEvent(candidate),
    );
    if (evictable.length > MAX_CONTROL_EVENT_BACKLOG) {
      const oldest = evictable[0]!;
      const evictIndex = turnSession.pendingControlEvents.indexOf(oldest);
      const [evicted] = turnSession.pendingControlEvents.splice(
        evictIndex,
        1,
      );
      evicted?.settle?.reject(
        new Error(
          "voice_control_event_evicted: backlog capacity exceeded before this never-attempted observation could be delivered.",
        ),
      );
    }
    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control boundedness
    // (Codex reopen, canonical 2026-10-03T22:41:06Z): the eviction above
    // only ever targets evictable entries, so a sustained outage that
    // accumulates only PROTECTED entries (every `media_epoch_transition`,
    // or an ambiguous-outcome `speech_start`) grows this array without
    // bound -- see `MAX_TOTAL_CONTROL_EVENT_BACKLOG`'s own doc. Once that
    // hard total cap is exceeded, there is no entry left that is both
    // present and safe to evict; the only safe action is to fail this
    // attachment closed rather than keep retaining unbounded memory for
    // it or silently drop a required transition and let a successor
    // proceed as if the chain were intact. The entry the drain loop is
    // currently awaiting (if any) is preserved -- its own HTTP attempt is
    // already in flight and may yet durably land -- every OTHER queued
    // entry is rejected and removed.
    if (turnSession.pendingControlEvents.length > MAX_TOTAL_CONTROL_EVENT_BACKLOG) {
      const inFlight = turnSession.inFlightControlEvent;
      const stuck = turnSession.pendingControlEvents.filter(
        (candidate) => candidate !== inFlight,
      );
      turnSession.pendingControlEvents.length = 0;
      if (inFlight) turnSession.pendingControlEvents.push(inFlight);
      turnSession.restoreFailed = true;
      for (const stuckEntry of stuck) {
        stuckEntry.settle?.reject(
          new Error(
            "voice_control_event_backlog_exhausted: this attachment's control-event backlog exceeded its bounded total retained capacity with no entry safe to evict; the attachment has been failed closed and must be reattached.",
          ),
        );
      }
      return;
    }
    this.flushControlEventBacklog(turnSession, binding);
  }

  /** Drains `turnSession.pendingControlEvents` strictly from the front
   * (oldest observation first, whichever kind), one
   * `recordAuthoritativeControlEvent` call per entry, removing each entry
   * only once its own write is confirmed durably applied -- never
   * skipped, never overwritten by a later observation, and never
   * reordered relative to a different-kind observation that arrived in
   * between (see `pendingControlEvents`'s own doc on the two separate,
   * per-kind designs this replaces).
   *
   * Called both directly (a new `speech.started`/`media.epoch.advanced`
   * arriving) and from a self-armed retry timer so an outstanding backlog
   * resumes draining on its own even with no later triggering event to
   * naturally retrigger it ("no-final outage recovery", Codex reopen
   * canonical 2026-10-03T20:13:00Z). Bounded by the same
   * `turnTimeoutMs`-based signal every other no-turn-of-its-own control
   * write on this attachment already uses; never throws into `handle()`
   * and never rejects into `controlEventQueue` -- same reasoning as
   * `runTurn`: a long-lived worker must not let one failed write wedge
   * every later one for this attachment. */
  private flushControlEventBacklog(
    turnSession: TurnSession,
    binding: VoiceSessionBinding,
  ): void {
    if (turnSession.controlEventRetryTimer !== undefined) {
      clearTimeout(turnSession.controlEventRetryTimer);
      delete turnSession.controlEventRetryTimer;
    }
    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (Codex reopen,
    // canonical 2026-10-03T23:31:57Z, "genuinely coalesce enqueue-triggered
    // flushes behind ONE running/scheduled drain and ONE retry owner"): at
    // most one drain task is ever chained at a time -- see
    // `controlEventDrainInFlight`'s own doc. A later call arriving while
    // one is already outstanding does nothing of its own; the outstanding
    // drain's `while` loop below keeps consuming `pendingControlEvents`
    // from the front until it is empty, so whatever this call just
    // enqueued is already covered.
    if (turnSession.controlEventDrainInFlight) return;
    turnSession.controlEventDrainInFlight = true;
    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control boundedness
    // (Codex reopen, canonical 2026-10-03T22:41:06Z, "a single bounded
    // drain/retry owner"): `boundedControlSignal` used to be called here,
    // unconditionally, on EVERY invocation of this method -- including
    // every one of N enqueue calls arriving while a single drain is
    // already chained and running, each allocating its own
    // `AbortController`, deadline timer and `releaseAbort` listener even
    // though `chainControlEvent` already serializes them onto one queue
    // and only the FIRST such invocation ever finds non-empty work left
    // to do. Deferred inside the chained task itself, and only actually
    // created once this invocation's own turn confirms there is
    // something to drain, so an attachment accumulating a large backlog
    // while one drain is in flight allocates exactly one bounded signal
    // per invocation that genuinely does work, not one per enqueue.
    this.chainControlEvent(turnSession, async () => {
      if (turnSession.pendingControlEvents.length === 0) return;
      const bounded = this.boundedControlSignal(turnSession);
      try {
        while (turnSession.pendingControlEvents.length > 0) {
          const next = turnSession.pendingControlEvents[0]!;
          turnSession.inFlightControlEvent = next;
          // Set once, kept forever (see `PendingControlEvent.attempted`'s
          // own doc) -- this entry's outcome is no longer definitively
          // "never sent" even after this specific attempt's HTTP call
          // settles, whatever the result.
          next.attempted = true;
          let epoch: number;
          try {
            epoch = await this.recordAuthoritativeControlEvent(
              turnSession,
              binding,
              {
                sourceEventId: next.sourceEventId,
                occurredAt: next.occurredAt,
                mediaEpoch: next.mediaEpoch,
                eventType: next.eventType,
                signal: bounded.signal,
              },
            );
          } finally {
            delete turnSession.inFlightControlEvent;
          }
          // This exact entry is now durably applied -- remove it (by
          // identity, never by blindly shifting the front: an overflow
          // eviction concurrent with the await above can only ever target a
          // DIFFERENT entry now, see `enqueueControlEvent`, but removing by
          // identity here too is exact and immune to any future eviction
          // policy change) before attempting the next one, so a later
          // failure in this same flush never re-sends an already-confirmed
          // observation.
          const idx = turnSession.pendingControlEvents.indexOf(next);
          if (idx !== -1) turnSession.pendingControlEvents.splice(idx, 1);
          // A media-epoch transition is a different authority axis than ASR
          // input (SD §5.3 vs §5.4, see `recordMediaEpochTransition`'s own
          // doc) -- only a speech-start may open/reconfirm the speech-start
          // watermark `executeTurn`'s `persist` stage reuses.
          if (next.eventType === "speech_start") {
            turnSession.authoritativeInputEpoch = epoch;
            turnSession.authoritativeInputEpochConsumed = false;
          }
          // Tell `recordAuthoritativeSpeechStart`'s fallback caller (if this
          // entry came from it) this exact observation's resolved epoch --
          // never erased by a later unrelated failure elsewhere in this same
          // drain loop, since it was already removed from the array above.
          next.settle?.resolve(epoch);
        }
      } finally {
        bounded.cancel();
      }
    }).then(
      () => {
        turnSession.controlEventDrainInFlight = false;
        // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control lost wakeup
        // after successful drain (Codex reopen, canonical
        // 2026-10-04T00:26:49Z): an arrival between the chained task's own
        // `while` loop above exiting (queue observed empty) and THIS
        // continuation actually running -- the Promise microtask-
        // settlement window `chainControlEvent`'s own chaining imposes --
        // finds `controlEventDrainInFlight` still `true` and returns
        // immediately at the top of this method with no owner left to
        // drain it. A speech-start with no later final/event could then
        // remain unreported indefinitely despite a healthy transport, even
        // though the drain that "missed" it had already completed
        // successfully. Reacquire ownership atomically with this backlog
        // recheck, in the SAME synchronous continuation that clears the
        // flag, so every such arrival is covered by a fresh drain/retry
        // owner instead of being silently stranded. Bounded the same way
        // every other call to this method is: at most one more drain task
        // is chained here, which itself re-checks for further arrivals
        // during ITS OWN settlement window.
        if (
          turnSession.pendingControlEvents.length > 0 &&
          !turnSession.releaseAbort.signal.aborted &&
          !turnSession.restoreFailed
        ) {
          this.flushControlEventBacklog(turnSession, binding);
        }
      },
      (error) => {
        turnSession.controlEventDrainInFlight = false;
        // Never retry past release, and never retry an attachment whose
        // restoration is permanently failed (`handle()` already stopped
        // accepting new observations for it) -- both would otherwise
        // schedule an unbounded fail/reschedule loop against a dialogue
        // state that can never apply anything again.
        if (
          !turnSession.releaseAbort.signal.aborted &&
          !turnSession.restoreFailed
        ) {
          console.error(
            "[voice-call-turn-coordinator] control event failed; will retry",
            error,
          );
          turnSession.controlEventRetryTimer = setTimeout(() => {
            delete turnSession.controlEventRetryTimer;
            if (turnSession.pendingControlEvents.length > 0) {
              this.flushControlEventBacklog(turnSession, binding);
            }
          }, this.turnTimeoutMs);
        }
      },
    );
  }

  /** Combines `turnSession.releaseAbort.signal` with a `turnTimeoutMs`
   * timer into one bounded signal for a control write that has no turn
   * (and therefore no `request.deadline`) of its own -- see
   * `recordSpeechStartControlEvent`'s own doc. Always pair with `cancel()`
   * once the bounded call settles, or the timer leaks for this
   * attachment's remaining lifetime. */
  private boundedControlSignal(turnSession: TurnSession): {
    signal: AbortSignal;
    cancel: () => void;
  } {
    const controller = new AbortController();
    if (turnSession.releaseAbort.signal.aborted) controller.abort();
    const onRelease = () => controller.abort();
    turnSession.releaseAbort.signal.addEventListener("abort", onRelease);
    const timer = setTimeout(() => controller.abort(), this.turnTimeoutMs);
    return {
      signal: controller.signal,
      cancel: () => {
        clearTimeout(timer);
        turnSession.releaseAbort.signal.removeEventListener("abort", onRelease);
      },
    };
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
    turnSession.releaseAbort.abort();
    // Bounded retained delivery (R4-control): a pending backlog retry
    // timer must never keep firing against a released attachment -- the
    // bounded signal it would use is already aborted, so a surviving
    // timer would otherwise keep rescheduling itself (fail, reschedule,
    // fail, ...) for this attachment's entire remaining process lifetime.
    if (turnSession.controlEventRetryTimer !== undefined) {
      clearTimeout(turnSession.controlEventRetryTimer);
      delete turnSession.controlEventRetryTimer;
    }
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
      // R4-control (Codex reopen round 16/17): a real `speech.started`
      // barge-in must durably open its own authoritative watermark right
      // now, independent of whatever turn it just cancelled.
      // `media.epoch.advanced` is a different authority-transition
      // concern (handoff/reconnect) -- it durably submits the
      // authoritative media-epoch-transition control event instead (R4-
      // control, media-epoch continuation; see
      // `recordMediaEpochTransition`'s own doc), rather than rely only on
      // the existing `leaseEpoch` fencing at the service layer, which
      // fences WRITER identity but never actually advances the pinned
      // media epoch itself.
      if (event.type === "speech.started") {
        this.recordSpeechStartControlEvent(turnSession, event);
      } else {
        this.recordMediaEpochTransition(turnSession, event);
      }
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
      // R11 (Codex reopen round 15/16): `handle()` only checks
      // `restoreFailed` at enqueue time, synchronously, before chaining
      // this turn onto `turnSession.queue`. For a bound attachment's
      // FIRST final(s), that queue IS the still-pending
      // `restoreBoundAttachment` promise itself (see `attach()`) -- if
      // restoration settles into failure only *after* this final was
      // already enqueued (but before this callback actually runs), the
      // enqueue-time check already passed, and without this re-check
      // `executeTurn` would still run a real turn (provider propose,
      // persist, tool execution) against unverified dialogue state. This
      // is the first point after any predecessor this specific turn could
      // have been queued behind (restoration, or an earlier turn) is
      // guaranteed to have already settled, so it is checked again here,
      // not just at enqueue time.
      if (turnSession.restoreFailed) {
        releaseQueue();
        return;
      }
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
          const binding = turnSession.binding;
          // R4-control (Codex reopen round 16/17): wait for any
          // `speech.started`-triggered write already enqueued for this
          // attachment to settle (see `recordSpeechStartControlEvent`)
          // before deciding whether THIS turn needs to open its own --
          // both share the same `controlSequence` counter and must never
          // be issued concurrently.
          await turnSession.controlEventQueue;
          const authoritativeInputEpoch =
            turnSession.authoritativeInputEpochConsumed === false &&
            turnSession.authoritativeInputEpoch !== undefined
              ? turnSession.authoritativeInputEpoch
              : await this.recordAuthoritativeSpeechStart(
                  turnSession,
                  binding,
                  bounded,
                );
          turnSession.authoritativeInputEpoch = authoritativeInputEpoch;
          turnSession.authoritativeInputEpochConsumed = true;
          await persistPort.persist(
            next,
            {
              ...bounded,
              inputEpoch: authoritativeInputEpoch,
            },
            // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex
            // reopen, canonical 2026-10-03T19:24:15Z): `turnSession.state`
            // is this attachment's REAL, long-lived dialogue state --
            // `next` is only this turn's candidate clone, discarded the
            // instant `VoiceDialogueEngine.boundedStage` abandons a
            // cancelled turn. A trusted port's ambiguous-commit
            // reconciliation needs the real object to carry a late-but-
            // durable commit forward past this turn's own cancellation.
            { attachmentState: turnSession.state },
          );
          return;
        }
        await persistPort.persist(next, bounded, {
          attachmentState: turnSession.state,
        });
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
