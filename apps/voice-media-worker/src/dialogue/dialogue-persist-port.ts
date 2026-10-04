import type { VoiceDialogueState } from "./dialogue-state";
import type { VoiceDialogueRequest } from "./voice-dialogue-provider";
import type { VoiceSessionBinding } from "./voice-session-binding";
import {
  VoiceApiError,
  type DialogueSnapshotRestorationResult,
  type IssueCapabilityCommand,
  type PersistDialogueSnapshotResult,
  type ResolveInputResult,
  type VoiceApiClient,
} from "../server/voice-api-client";

/** A signal paired with an explicit `cancel()` to release whatever bounds
 * it (a timer, a listener) once the caller is done with it -- see
 * `createTrustedDialoguePersistPort`'s `recoverySignal` parameter. */
export interface BoundedSignal {
  readonly signal: AbortSignal;
  cancel(): void;
}

/**
 * Codex reopen round 18, R4-persist: a single, best-effort authoritative
 * read used to disambiguate a `resolveInput`/`persistDialogueSnapshot` call
 * whose own HTTP response was lost (network error, timeout, proxy reset) --
 * never whether the response was merely slow. Only ever consulted from a
 * `catch` block, after the real write attempt already failed; its own
 * failure (apps/api also unreachable right now) must never replace the
 * original error with a confusing new one, so it swallows every error from
 * this read and lets the caller fall back to the original failure.
 *
 * Correction (Codex reopen, canonical 2026-10-03T17:41:28Z, R4-persist):
 * an earlier version of this function took the TRIGGERING call's own
 * `signal` and bailed out immediately whenever it was already aborted --
 * which is exactly the one case this reconciliation exists for (a turn
 * cancelled mid-write, not merely a slow response). `recoverySignal` is a
 * SEPARATE, freshly-bounded signal scoped to this attachment's own
 * lifetime (fires on `release()` or its own short deadline, never on a
 * single turn's cancellation) -- this read runs under that bound
 * regardless of whether the turn that triggered it was itself aborted.
 * Still returns `undefined` on any secondary failure or `recoverySignal`
 * abort (attachment released / recovery deadline exceeded while this read
 * was in flight) -- the caller re-checks the ORIGINAL triggering signal
 * itself afterward, since this read's own success/failure says nothing
 * about whether the turn that triggered it is still live.
 */
async function reconcileAmbiguousCommit(
  client: VoiceApiClient,
  voiceSessionId: string,
  capabilityToken: string,
  recoverySignal: BoundedSignal,
): Promise<DialogueSnapshotRestorationResult | undefined> {
  if (recoverySignal.signal.aborted) return undefined;
  try {
    return await client.getDialogueSnapshotRestoration(
      voiceSessionId,
      capabilityToken,
      recoverySignal.signal,
    );
  } catch {
    return undefined;
  } finally {
    recoverySignal.cancel();
  }
}

/** Bound on `reconcileUnresolvedCommit`'s own retry loop -- see that
 * function's doc. A handful of bounded attempts, not an unbounded retry:
 * a single failed GET is not proof of loss (Codex reopen, canonical
 * 2026-10-03T21:09:40Z, "failed first GET is not rollback"), but retrying
 * forever would block every later turn's persist indefinitely against a
 * genuinely unreachable store instead of failing this turn closed and
 * letting a LATER turn's own attempt try again. */
const MAX_UNRESOLVED_COMMIT_RECONCILE_ATTEMPTS = 3;

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist error provenance
 * (Codex reopen, canonical 2026-10-03T23:31:57Z): codes `VoiceSessionService
 * .persistDialogueSnapshot` is known to throw strictly BEFORE the content
 * insert is ever attempted (every check in that method's `runWork` runs
 * ahead of `this.repository.insertDialogueSnapshot`), plus
 * `VOICE_ACTION_PAYLOAD_CONFLICT` (a dedup hit whose ALREADY-persisted
 * content differs from this call's own -- proof a DIFFERENT write landed,
 * never this one). A whitelist, not a blacklist: an unrecognized or generic
 * code (`INTERNAL_SERVER_ERROR`, anything apps/api's exception filter maps
 * an unexpected failure to) must default to ambiguous, never to rejected.
 */
const DEFINITIVE_DIALOGUE_SNAPSHOT_REJECTION_CODES = new Set([
  "VOICE_SESSION_NOT_OWNER",
  "VOICE_DRAFT_STALE",
  "VOICE_DIALOGUE_SNAPSHOT_VOIDED",
  "VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_UNCONFIGURED",
  "VOICE_RETENTION_POLICY_UNAVAILABLE",
  "VOICE_ACTION_PAYLOAD_CONFLICT",
]);

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
 * canonical 2026-10-03T21:09:40Z, "unresolved commit still admits
 * destructive subsequent dialogue"): a SINGLE failed reconciliation GET
 * (the old `reconcileAmbiguousCommit` call inline in the
 * `persistDialogueSnapshot` catch block below) is not proof the write
 * never landed -- but the previous code treated it as equivalent to
 * never having attempted the write at all, leaving nothing on the
 * attachment to say "this exact write's outcome is still genuinely
 * unknown." A completely unrelated LATER turn (even an empty one) could
 * then submit fresh content at the next session version, durably
 * overwriting whatever the ambiguous write actually did land -- loss of
 * previously-committed dialogue state (e.g. an emergency handoff), not
 * safe recovery.
 *
 * This bounded-retry helper is the single place that resolves
 * `VoiceDialogueState.unresolvedCommit`: called both by the
 * `persistDialogueSnapshot` catch block for ITS OWN just-failed write
 * (first use of the marker), and by `persist()`'s own top-of-call gate
 * for a marker a DIFFERENT, possibly already-abandoned turn's call left
 * behind (see that gate's own doc) -- in both cases retrying the exact
 * same bounded number of attempts rather than giving up after one.
 *
 * Concurrency: a cancelled turn's own `persist()` call keeps running in
 * the background even after `VoiceDialogueEngine.boundedStage` has
 * already raced past it (the race only decides what the ENGINE waits
 * for, never cancels the in-flight call itself) -- so this exact
 * function can genuinely be entered twice concurrently for the same
 * attachment (the abandoned call's own catch block, and a brand new
 * turn's top-of-call gate). `unresolvedCommitRecoveries` (see that
 * WeakMap's own doc) caches the in-flight attempt so the second caller
 * joins the first's SAME GET(s) instead of issuing a redundant,
 * independent round -- see probe "emergency POST reply held, real
 * speech.started cancels it... recovery GET captures the valid accepted
 * snapshot but delivery remains held. BEFORE releasing GET, send empty
 * next final" in that reopen.
 *
 * Returns `{ resolved: true, snapshot }` once a correlating response is
 * found. When `attachmentState` is supplied, installs the recovered
 * content onto it (and clears `unresolvedCommit`) as a side effect, under
 * the same monotonic `committedSessionVersion` fencing
 * `createTrustedDialoguePersistPort`'s success path already uses, and
 * dedupes concurrent callers via `unresolvedCommitRecoveries`. Without
 * `attachmentState` (no cross-turn memory to track this on at all -- a
 * caller with no `recovery`, unchanged from before this fix existed) this
 * is just a bounded-retry version of the single-shot
 * `reconcileAmbiguousCommit` call this replaces, with no promise-sharing
 * of its own (nothing else could join it anyway).
 *
 * Resolves to `{ resolved: false }` -- never throws -- once the bounded
 * attempts are exhausted with no correlating response found (Codex
 * reopen, canonical 2026-10-03T22:41:06Z, "pre-store failure permanently
 * wedges the attachment"): exhausting the bounded window is itself the
 * authoritative "this write never landed" determination, so when
 * `attachmentState` is supplied, its marker is cleared in that case too --
 * a PRIOR version of this function left it set forever, which permanently
 * wedged every later turn's own top-of-call gate on a write already known
 * to have never been stored.
 */
/** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
 * canonical 2026-10-03T21:53:56Z, "new Promise field crashes cloning
 * before the advertised join gate"): the in-flight reconciliation promise
 * used to live as a `Promise`-valued field directly on
 * `VoiceDialogueState` -- but `VoiceDialogueEngine.turn` builds every
 * turn's candidate state via `structuredClone(state)`, and a `Promise`
 * cannot be structured-cloned. A second, concurrent turn starting while a
 * reconciliation was genuinely in flight crashed with `DataCloneError`
 * before ever reaching this module's own join gate below -- the join
 * mechanism was correct, but unreachable. Keyed by the `VoiceDialogueState`
 * instance itself (never a plain id -- there is exactly one such instance
 * per attachment, see `TurnSession.state`) so this stays just as joinable
 * across concurrent callers for that same attachment as the old field was,
 * without `structuredClone` ever seeing it. */
/** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
 * canonical 2026-10-03T22:41:06Z, "pre-store failure permanently wedges
 * the attachment"): `reconcileUnresolvedCommit` used to THROW once its
 * bounded retries exhausted with no correlating snapshot found, leaving
 * `unresolvedCommit` set regardless -- but exhausting the bounded window
 * with nothing found is itself the authoritative "this write never
 * landed" determination (SD never offers a fourth way to learn the
 * outcome of an already-lost acknowledgement). Returning a tagged result
 * instead of throwing lets both call sites tell "a prior write WAS
 * reconciled onto the attachment" apart from "bounded retries exhausted,
 * confirmed never stored" without conflating either with an unrelated
 * secondary failure. */
/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
 * canonical 2026-10-03T23:31:57Z, "retry exhaustion is not authoritative
 * non-acceptance"): exhausting the bounded best-effort GET polling below
 * used to BE the "this write never landed" determination -- but a single
 * failed read, and even three genuinely successful reads that truthfully
 * found nothing YET, prove nothing about whether the original write lands
 * a moment later (the server-side request this worker already sent is
 * still, independently, somewhere in flight). `resolved: "unknown"` is a
 * third, distinct outcome from both: the bounded polling exhausted AND the
 * one authoritative adjudication call (`resolveDialogueSnapshotOutcome`)
 * that could have settled it was itself unreachable. Only `true` or
 * `false` ever clears `unresolvedCommit` -- `"unknown"` always leaves it
 * set, so a later call's own top-of-call gate retries this same
 * reconciliation again instead of wrongly admitting new content over a
 * write whose fate is still genuinely open.
 */
type UnresolvedCommitReconciliation =
  | {
      readonly resolved: true;
      readonly snapshot: PersistDialogueSnapshotResult["snapshot"];
    }
  | { readonly resolved: false }
  | { readonly resolved: "unknown" };

const unresolvedCommitRecoveries = new WeakMap<
  VoiceDialogueState,
  Promise<UnresolvedCommitReconciliation>
>();
async function reconcileUnresolvedCommit(
  client: VoiceApiClient,
  voiceSessionId: string,
  capabilityToken: string,
  recoverySignal: () => BoundedSignal,
  pending: {
    expectedSessionVersion: number;
    inputEpoch: number;
    mediaEpoch: number;
    turnId: string;
  },
  attachmentState?: VoiceDialogueState,
): Promise<UnresolvedCommitReconciliation> {
  const attempt = async (): Promise<UnresolvedCommitReconciliation> => {
    for (
      let i = 0;
      i < MAX_UNRESOLVED_COMMIT_RECONCILE_ATTEMPTS;
      i++
    ) {
      const reconciled = await reconcileAmbiguousCommit(
        client,
        voiceSessionId,
        capabilityToken,
        recoverySignal(),
      );
      const candidate = reconciled?.snapshot;
      const correlates =
        candidate != null &&
        candidate.voiceSessionId === voiceSessionId &&
        candidate.sessionVersion === pending.expectedSessionVersion &&
        candidate.inputEpoch === pending.inputEpoch &&
        candidate.mediaEpoch === pending.mediaEpoch &&
        candidate.turnId === pending.turnId &&
        new Date(candidate.retentionExpiresAt).getTime() > Date.now();
      if (correlates) {
        if (attachmentState) {
          if (
            attachmentState.committedSessionVersion === null ||
            attachmentState.committedSessionVersion <
              pending.expectedSessionVersion
          ) {
            attachmentState.restoreFromSnapshotContent(candidate.content);
            attachmentState.committedSessionVersion =
              pending.expectedSessionVersion;
          }
          attachmentState.unresolvedCommit = null;
        }
        return { resolved: true, snapshot: candidate };
      }
    }
    // The bounded optimistic polling above exhausted with nothing
    // correlating observed -- genuinely ambiguous, not yet a verdict (see
    // this type's own doc). Ask the server for the one answer bounded
    // polling can never give: an atomic check-then-fence that is either
    // already known accepted, or is now durably voided from ever landing.
    const atomic = recoverySignal();
    let outcome: Awaited<ReturnType<VoiceApiClient["resolveDialogueSnapshotOutcome"]>>;
    try {
      outcome = await client.resolveDialogueSnapshotOutcome(
        voiceSessionId,
        capabilityToken,
        pending,
        atomic.signal,
      );
    } catch {
      // The adjudication call itself is unreachable right now -- this is
      // the genuinely-unknown case, never a confirmed non-acceptance.
      // `unresolvedCommit` stays set (see this function's own join/clear
      // contract) so a later call retries this whole reconciliation.
      return { resolved: "unknown" };
    } finally {
      atomic.cancel();
    }
    if (outcome.accepted) {
      const candidate = outcome.snapshot;
      if (attachmentState) {
        if (
          attachmentState.committedSessionVersion === null ||
          attachmentState.committedSessionVersion <
            pending.expectedSessionVersion
        ) {
          attachmentState.restoreFromSnapshotContent(candidate.content);
          attachmentState.committedSessionVersion =
            pending.expectedSessionVersion;
        }
        attachmentState.unresolvedCommit = null;
      }
      return { resolved: true, snapshot: candidate };
    }
    // Confirmed non-acceptance: the server has now durably fenced this
    // exact version (see `resolveDialogueSnapshotOutcome`'s own doc), so a
    // write that is still genuinely in flight can never land after this
    // point. Clear the marker so a healthy LATER turn's own top-of-call
    // gate does not re-enter this same bounded loop forever against a
    // write that is now authoritatively known to never land -- the
    // previous behavior (treating bounded-retry exhaustion itself as this
    // verdict) permanently wedged every subsequent turn on this attachment
    // once a single pre-store failure occurred, AND could not rule out a
    // delayed write still silently landing afterward.
    if (attachmentState) attachmentState.unresolvedCommit = null;
    return { resolved: false };
  };
  if (!attachmentState) return attempt();
  let inFlight = unresolvedCommitRecoveries.get(attachmentState);
  if (!inFlight) {
    inFlight = attempt().finally(() => {
      unresolvedCommitRecoveries.delete(attachmentState);
    });
    unresolvedCommitRecoveries.set(attachmentState, inFlight);
  }
  return inFlight;
}

/**
 * Explicitly isolates fixture-mode persistence from a trusted, durable
 * runtime port (Codex reopen round 2/3, R4): `VoiceCallTurnCoordinator`
 * previously supplied a bare, always-successful no-op closure with no type
 * distinguishing it from a real CAS-backed persist, so missing/rejected/
 * stale persistence could never be represented at all, let alone fail
 * closed before the dependent state-commit/tool-execution/playback
 * `VoiceDialogueEngine.turn` otherwise gates on it.
 *
 * `mode: "fixture"` ports must never claim durability: `persist` may
 * succeed (so this worker's own in-memory conversation can proceed in the
 * absence of a reachable session store), but nothing it does outlives
 * this process, and `VoiceCallTurnCoordinator` refuses to run one for a
 * `production: true` engine (see `createFixtureDialoguePersistPort`'s own
 * doc and `VoiceCallTurnCoordinator`'s constructor) -- a caller cannot
 * accidentally end up fabricating authority this way.
 *
 * `mode: "trusted"` is the seam a real port implements once one exists:
 * `apps/api`'s DB-backed `VoiceSessionService` (`resolveInput`,
 * `persistDialogueSnapshot`) provides both the authoritative admission CAS
 * and the versioned, encrypted dialogue-content commit
 * `VoiceDialogueTurnPorts.persist`'s own contract requires -- the
 * issuance/route/HTTP-client triple this worker needs to reach them (see
 * `VoiceCallTurnCoordinator`'s class doc) is built
 * (`createTrustedDialoguePersistPort` below). A `mode: "trusted"` port's
 * `persist` must reject (never silently no-op/succeed) on an absent,
 * rejected, or stale admission CAS *or* content persist so
 * `VoiceDialogueEngine.turn`'s existing fail-closed gating actually has
 * something to gate on.
 */
export interface VoiceDialoguePersistPort {
  readonly mode: "fixture" | "trusted";
  persist(
    state: VoiceDialogueState,
    request: VoiceDialogueRequest,
    /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
     * canonical 2026-10-03T19:24:15Z): `state` above is always a CANDIDATE
     * (the engine's own post-turn clone, `VoiceDialogueEngine.turn`'s
     * `next`) -- writing a reconciled-durable commit onto it is useless the
     * moment this turn is cancelled, because `VoiceDialogueEngine.
     * boundedStage`'s abort/deadline race already discarded this call's
     * eventual result before `Object.assign(state, next)` ever runs; `next`
     * itself is then garbage. `recovery.attachmentState`, when supplied, is
     * the REAL, long-lived per-attachment `VoiceDialogueState` instance
     * (`TurnSession.state`) that survives across every turn regardless of
     * this one's outcome -- the only object a late-settling ambiguous-
     * commit reconciliation can usefully write into. A trusted
     * implementation must apply a reconciled-durable commit's content
     * there, under its own monotonic fencing (never regressing past a
     * newer turn's already-admitted revision), as a plain side effect of
     * this call's own execution -- NOT contingent on this call's returned
     * promise ever being awaited to completion by its caller. */
    recovery?: { attachmentState: VoiceDialogueState },
  ): Promise<void>;
}

/**
 * The only persist port this worker can honestly provide today (see
 * `VoiceCallTurnCoordinator`'s class doc): no durable per-call session
 * store is reachable from this process -- that is `voice.session` in
 * apps/api's Postgres, behind an HTTP client/issuance/route triple this
 * worker does not have. `VoiceDialogueEngine`'s own in-memory
 * `Object.assign(state, next)` immediately after this resolves is the
 * only persistence this port can honestly provide, scoped to this
 * process's own lifetime (lost on restart, never shared with apps/api,
 * never a CAS against any authoritative revision). Callers must never
 * mistake its success for a durable commit.
 */
export function createFixtureDialoguePersistPort(): VoiceDialoguePersistPort {
  return {
    mode: "fixture",
    async persist() {
      // Intentionally empty -- see class doc above.
    },
  };
}

const PERSIST_CAPABILITY_SCOPES: IssueCapabilityCommand["scopes"] = [
  "session_execute",
];

/**
 * The `mode: "trusted"` port this class's own doc names as the seam to
 * implement once the issuance/route/HTTP-client triple exists (Codex
 * reopen round 5/6, R4) -- `VoiceApiClient` is that triple.
 * `VoiceSessionService.resolveInput` (apps/api) is the authoritative
 * *admission* CAS this maps onto: every admitted turn that reaches
 * `persist()` already represents real dialogue content the engine decided
 * to act on, so it is always submitted as `resolution: "relevant"`, never
 * "irrelevant" (that value is for an explicitly-unrelated utterance the
 * engine never even reaches this port for).
 *
 * `binding` is a live accessor, not a snapshot: it must always return
 * `undefined` until a real call-admission flow supplies one for this
 * attachment (none exists yet, see `../dialogue/voice-session-binding.ts`),
 * and `persist` rejects rather than silently no-op/succeed in that case --
 * a `production: true` engine must never be told persistence succeeded
 * when there was nothing trustworthy to persist through.
 *
 * Correction (Codex reopen round 5/6, R4, then the no-history-rewrite
 * successor's R4 finding): earlier versions of this comment claimed first
 * that no SD-approved content route/schema existed, then (after that was
 * corrected) that completing it needed intent-creation/qualification wiring
 * outside this task's `write_scopes` and that `infra/migrations/` was
 * therefore out of scope. Both were too broad. The coordinator explicitly
 * reserved `infra/migrations/V0106__voice_dialogue_snapshot.sql` for this
 * task (see that migration's own doc and
 * `.local/project-fixes-20261002/EXECUTION.md`'s "Voice schema
 * coordination" note) precisely because `voice.draft_revision` is a
 * different, qualification-gated booking-intent domain object, not a
 * generic dialogue-state snapshot seam. `state` (the engine's own
 * already-applied next-state, via `VoiceDialogueState.toSnapshotContent`)
 * is now actually persisted, encrypted at rest, through
 * `VoiceApiClient.persistDialogueSnapshot` -> `VoiceSessionService.
 * persistDialogueSnapshot` -> `voice.dialogue_snapshot`, fenced by the
 * SAME session/scope/lease/input/media identifiers `resolveInput`'s CAS
 * above just admitted this turn under. A `production: true` engine's
 * `persist()` fails (blocking tools/playback, per
 * `VoiceDialogueTurnPorts.persist`'s own contract) if either the admission
 * CAS or the content persist is rejected -- there is no partial-success
 * state where a turn's input was admitted but its content silently wasn't
 * recorded.
 */
/** Default `recoverySignal` for a caller with no attachment-level
 * release signal of its own (tests, or any future caller outside
 * `VoiceCallTurnCoordinator`) -- bounded purely by its own short
 * deadline, never tied to any turn's cancellation. */
const DEFAULT_RECOVERY_TIMEOUT_MS = 5_000;
function defaultRecoverySignal(): BoundedSignal {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    DEFAULT_RECOVERY_TIMEOUT_MS,
  );
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

export function createTrustedDialoguePersistPort(
  client: VoiceApiClient,
  binding: () => VoiceSessionBinding | undefined,
  /** Mints a fresh, attachment-scoped bounded signal for a single
   * reconciliation read -- see `reconcileAmbiguousCommit`'s own doc.
   * Never the turn's own `request.signal`: that one is exactly what just
   * fired when this is needed. Defaults to a standalone deadline-only
   * bound for callers with no attachment/release signal of their own. */
  recoverySignal: () => BoundedSignal = defaultRecoverySignal,
): VoiceDialoguePersistPort {
  return {
    mode: "trusted",
    async persist(state, request, recovery) {
      const { signal } = request;
      if (signal?.aborted) {
        throw new Error(
          "voice_trusted_persist_aborted: request was already aborted before persistence began.",
        );
      }
      const current = binding();
      if (!current) {
        throw new Error(
          "voice_trusted_persist_unbound: no VoiceSessionBinding is attached for this session.",
        );
      }
      let capability: Awaited<ReturnType<typeof client.issueCapability>>;
      try {
        capability = await client.issueCapability(
          {
            voiceSessionId: current.voiceSessionId,
            resourceScopeId: current.resourceScopeId,
            routeProfileVersion: current.routeProfileVersion,
            leaseEpoch: current.leaseEpoch,
            scopes: PERSIST_CAPABILITY_SCOPES,
          },
          signal,
        );
      } catch (err) {
        // AUDIT-VOICE-APPLICATION-WIRING-20261003 R11/R12 boundedness
        // residual: `VoiceApiClient.request` now itself races against
        // `signal`, so an abort firing while this call is still pending
        // rejects it directly (never waits for an uncooperative
        // transport to settle on its own) -- surface that exactly like
        // the pre-existing post-await abort check below always has,
        // rather than leak the generic transport-level rejection.
        if (signal?.aborted) {
          throw new Error(
            "voice_trusted_persist_aborted: request was aborted while awaiting capability issuance.",
          );
        }
        throw err;
      }
      // `issueCapability` can settle after `signal` already fired (an
      // abort does not retroactively un-resolve a promise); re-check
      // before the CAS write itself ever goes out, or a cancelled turn
      // could still advance the authoritative revision underneath it.
      if (signal?.aborted) {
        throw new Error(
          "voice_trusted_persist_aborted: request was aborted while awaiting capability issuance.",
        );
      }
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
      // canonical 2026-10-03T21:09:40Z): a PRE-EXISTING unresolved commit
      // left by a different (possibly abandoned/cancelled) earlier call --
      // see `VoiceDialogueState.unresolvedCommit`'s own doc -- must be
      // resolved before THIS call ever submits any new content, and this
      // call's own `next`/`state` candidate was cloned before that
      // resolution could be reflected in it. Whether reconciliation finds
      // the ambiguous write landed or exhausts its bounded retries still
      // unresolved, this call always fails closed here: its own candidate
      // state predates whatever is now authoritative on the attachment and
      // must never be allowed to overwrite it via a later successful
      // write. The caller (a fresh turn, cloning `next` from the now-
      // reconciled `state`) is the only safe way to retry.
      if (recovery?.attachmentState.unresolvedCommit) {
        const reconciliation = await reconcileUnresolvedCommit(
          client,
          current.voiceSessionId,
          capability.token,
          recoverySignal,
          recovery.attachmentState.unresolvedCommit,
          recovery.attachmentState,
        );
        if (reconciliation.resolved === true) {
          throw new Error(
            "voice_trusted_persist_superseded_by_recovered_commit: a prior turn's unresolved content commit was just reconciled onto this attachment; this turn's own candidate state predates it and must be retried from a fresh turn.",
          );
        }
        if (reconciliation.resolved === "unknown") {
          // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex
          // reopen, canonical 2026-10-03T23:31:57Z): the prior write's
          // outcome is still genuinely unknown (bounded polling exhausted
          // AND the atomic adjudication call was itself unreachable) --
          // `unresolvedCommit` stays set on the real attachment, and this
          // call must fail closed rather than admit new content over a
          // write that might still land. Never admit "no news" as "safe to
          // proceed."
          throw new Error(
            "voice_trusted_persist_unresolved_commit_unknown: a prior turn's content commit outcome could not be authoritatively resolved; retry once connectivity recovers.",
          );
        }
        // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex
        // reopen, canonical 2026-10-03T22:41:06Z): confirmed
        // non-acceptance -- `reconcileUnresolvedCommit` already cleared
        // the marker, and nothing was ever actually committed, so this
        // call's own submission may proceed normally below instead of
        // being blocked forever behind a write that never landed.
      }
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist overlapping
      // recovery (Codex reopen, canonical 2026-10-03T22:41:06Z, "a
      // candidate cloned before recovery becomes admissible simply
      // because recovery completed during capability issuance"): `state`
      // (this call's `next` parameter) is a clone taken at the START of
      // this turn, before the `issueCapability` await above -- a
      // DIFFERENT, concurrent reconciliation (another call's
      // `reconcileUnresolvedCommit`) can install new content directly
      // onto `recovery.attachmentState` (the real, live object) at any
      // point during that await, which the unresolvedCommit check just
      // above can miss entirely once that recovery already finished
      // (nothing is left set to check). `committedSessionVersion` is the
      // one fencing value every successful install -- recovered or a
      // normal turn's own success path -- always advances together with
      // the attachment's actual content, so a mismatch between this
      // clone's own baseline and the attachment's CURRENT value is
      // conclusive proof this candidate predates content the attachment
      // already has and must never submit over it. Guarded by
      // `state.committedSessionVersion !== undefined` so a caller whose
      // `state` is not a genuine engine clone at all (a hand-built test
      // double with no such field) is unaffected, same as before this
      // fence existed -- a real `VoiceDialogueState` instance (every
      // production `next`) always initializes this field to `null`,
      // never `undefined`.
      if (
        recovery &&
        state.committedSessionVersion !== undefined &&
        recovery.attachmentState.committedSessionVersion !==
          state.committedSessionVersion
      ) {
        throw new Error(
          "voice_trusted_persist_superseded_by_recovered_commit: this turn's candidate state predates a commit a concurrent recovery already installed onto the real attachment; retry from a fresh turn.",
        );
      }
      const expectedSessionVersion = current.sessionVersion;
      let sessionInfo: ResolveInputResult["session"];
      try {
        sessionInfo = (
          await client.resolveInput(
            current.voiceSessionId,
            capability.token,
            {
              expectedSessionVersion,
              inputEpoch: request.inputEpoch,
              resolution: "relevant",
            },
            signal,
          )
        ).session;
      } catch (err) {
        // Codex reopen round 18, R4-persist ("regress lost replies, not
        // only delayed ones"), corrected again (Codex reopen, canonical
        // 2026-10-03T17:41:28Z, R4-persist: "abort is not proof of no
        // commit"): a transport-level failure here (timeout, dropped
        // response, proxy reset) -- OR this exact turn having just been
        // cancelled (barge-in, a newer final) -- does NOT prove the CAS
        // never committed; the write can genuinely have landed
        // server-side with only its own HTTP acknowledgement lost in
        // transit, in EITHER case. Always read authoritative truth back
        // once, under a separate attachment-scoped recovery signal (never
        // this turn's own, already-fired `signal`), before concluding
        // this turn's admission never happened; `reconcileAmbiguousCommit`
        // applies the exact same correlation discipline the success path
        // below does, so an unrelated/foreign/stale read can never be
        // mistaken for this turn's own outcome.
        const reconciled = await reconcileAmbiguousCommit(
          client,
          current.voiceSessionId,
          capability.token,
          recoverySignal(),
        );
        const candidate = reconciled?.session;
        const reconciledCorrelates =
          candidate !== undefined &&
          candidate.voiceSessionId === current.voiceSessionId &&
          candidate.resourceScopeId === current.resourceScopeId &&
          candidate.routeProfileVersion === current.routeProfileVersion &&
          candidate.leaseEpoch === current.leaseEpoch &&
          candidate.inputEpoch === request.inputEpoch &&
          candidate.sessionVersion === expectedSessionVersion + 1 &&
          !candidate.pendingInput;
        if (!reconciledCorrelates) {
          if (signal?.aborted) {
            throw new Error(
              "voice_trusted_persist_aborted: request was aborted while awaiting the resolveInput response.",
            );
          }
          throw err;
        }
        sessionInfo = candidate;
      }
      const result = { session: sessionInfo };
      // Defense in depth against a misattributed response (proxy/transport
      // bug, replay, response-stream confusion): a matching `inputEpoch`
      // alone cannot distinguish a reply for a *different* session that
      // happens to carry the same epoch value, and the backend's CAS
      // update always advances `session_version` by exactly 1 per
      // successful write -- any other value, or a mismatched resource
      // scope/route profile version/lease epoch, is not a legitimate
      // response to *this* CAS attempt. The real backend already
      // guarantees all of these on success, so none of these checks ever
      // fire against a genuine apps/api reply -- they exist to reject a
      // corrupted/misattributed/cross-scope one instead of silently
      // advancing (or regressing) the binding's revision off it.
      const correlates =
        result.session.voiceSessionId === current.voiceSessionId &&
        result.session.resourceScopeId === current.resourceScopeId &&
        result.session.routeProfileVersion === current.routeProfileVersion &&
        result.session.leaseEpoch === current.leaseEpoch &&
        result.session.inputEpoch === request.inputEpoch &&
        result.session.sessionVersion === expectedSessionVersion + 1 &&
        // Codex reopen round 15/16, R4-persist: a session/epoch/revision-
        // matching response that still carries `pendingInput: true` means
        // the authoritative watermark this admission CAS was supposed to
        // durably clear is not actually clear -- SD §5.4's executor must
        // wait for input resolution, so this turn's admission cannot be
        // treated as cleanly correlated either, even though every other
        // field matches.
        !result.session.pendingInput;
      // Codex reopen round 5/6, R4-persist, then the no-history-rewrite
      // successor's R4-persist finding ("abort is not rollback"): `signal`
      // can fire while this exact await was outstanding, same as after
      // `issueCapability` above. A correlated response proves the CAS truly
      // committed against this exact binding -- that is a real fact about
      // the authoritative session that must be reconciled into `current`
      // *before* this turn is rejected for having been cancelled meanwhile,
      // or the next turn would resubmit the stale pre-CAS version and loop
      // forever on `VOICE_DRAFT_STALE`. Reconciling never turns a cancelled
      // turn into a successful one: `persist()` still throws below whenever
      // `signal` fired, whatever the response said.
      //
      // Codex reopen round 15/16, R4-persist ("new late-response race"):
      // this reconciliation must be MONOTONIC. A genuinely correlated but
      // LATE response (this exact turn's own CAS truly committed, just
      // reported back after this turn was already superseded) must never
      // overwrite `current.sessionVersion` with an OLDER value than a
      // newer turn has, in the meantime, already advanced it to -- that
      // would regress the shared binding backwards under a later turn's
      // feet, not "reconcile" anything.
      if (correlates && result.session.sessionVersion > current.sessionVersion) {
        current.sessionVersion = result.session.sessionVersion;
      }
      if (signal?.aborted) {
        throw new Error(
          "voice_trusted_persist_aborted: request was aborted while awaiting the resolveInput response.",
        );
      }
      if (!correlates) {
        throw new Error(
          "voice_trusted_persist_stale_response: resolveInput response does not correlate with the resolved session/revision.",
        );
      }
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist overlapping
      // recovery (Codex reopen, canonical 2026-10-03T22:41:06Z): re-check
      // the same fence as above, right before this candidate's own
      // content is actually submitted -- `resolveInput`'s own await
      // (just completed) is a second, independent window during which a
      // concurrent recovery could have installed new content onto
      // `recovery.attachmentState`. Closing this window only at
      // capability-issuance time would still let a candidate cloned
      // before THIS await started slip through and overwrite content a
      // recovery installed while `resolveInput` was in flight. Same
      // `state.committedSessionVersion !== undefined` guard as above, for
      // the same reason (exempts a hand-built test double with no such
      // field; never a real engine clone).
      if (
        recovery &&
        state.committedSessionVersion !== undefined &&
        recovery.attachmentState.committedSessionVersion !==
          state.committedSessionVersion
      ) {
        throw new Error(
          "voice_trusted_persist_superseded_by_recovered_commit: this turn's candidate state predates a commit a concurrent recovery already installed onto the real attachment; retry from a fresh turn.",
        );
      }
      // The admission CAS above only resolves this turn's input against the
      // session's control watermark -- it carries no dialogue-content
      // field at all (SD §10.1). The actual versioned, encrypted content
      // commit this engine's fail-closed persist gate requires is a
      // separate write, fenced by the exact revision/scope/route/lease/
      // input/media identifiers the admission CAS just advanced under (see
      // this function's own doc and `VoiceSessionService.
      // persistDialogueSnapshot`). A rejected/unreachable content persist
      // fails this whole `persist()` call -- never a partial success where
      // admission succeeded but content silently wasn't recorded.
      const expectedSnapshotSessionVersion = current.sessionVersion;
      let snapshot: PersistDialogueSnapshotResult["snapshot"];
      try {
        snapshot = (
          await client.persistDialogueSnapshot(
            current.voiceSessionId,
            capability.token,
            {
              expectedSessionVersion: expectedSnapshotSessionVersion,
              inputEpoch: request.inputEpoch,
              // `mediaEpoch` is optional on `VoiceDialogueRequest` only for
              // direct engine callers with no media-authority concept of
              // their own (see that field's own doc); every turn this
              // coordinator actually admits always carries a real one.
              mediaEpoch: request.mediaEpoch ?? 0,
              turnId: request.turnId,
              content: state.toSnapshotContent(),
            },
            signal,
          )
        ).snapshot;
      } catch (err) {
        // Codex reopen round 18, R4-persist, corrected again (Codex
        // reopen, canonical 2026-10-03T17:41:28Z then 2026-10-03T21:09:40Z,
        // R4-persist: "abort is not proof of no commit" / "unresolved
        // commit still admits destructive subsequent dialogue"): the exact
        // probe this reopened on -- a turn's content commit durably lands
        // (the server accepted the write) but its own HTTP acknowledgement
        // is lost, EITHER from a transport failure or because this exact
        // turn was just cancelled (barge-in) while the write was still in
        // flight. Neither of THOSE two cases may short-circuit past
        // reconciliation (a definitively-rejected write, handled by the
        // `isDefinitiveRejection` check below, is a third, different case
        // that always DOES short-circuit -- see its own doc): without
        // reconciliation, the engine's in-memory `state` never learns this
        // turn's content was actually durably recorded (see
        // `VoiceDialogueEngine.turn`'s `Object.assign(state, next)`, which
        // only runs once `persist()` resolves -- never for a cancelled
        // turn) and the NEXT turn silently starts a new, unrelated commit
        // that supersedes/erases the already-accepted one -- loss of
        // previously accepted dialogue state, not safe recovery.
        //
        // A single failed reconciliation read is not proof of loss either
        // (the previous version of this catch block gave up after exactly
        // one `reconcileAmbiguousCommit` call) -- always retry a bounded
        // number of times via `reconcileUnresolvedCommit`. When `recovery`
        // is present, this exact write's identity is ALSO recorded onto
        // `VoiceDialogueState.unresolvedCommit` first, so it survives even
        // if this call itself is abandoned (its turn cancelled) before
        // reconciliation finishes, and a later call (this same
        // attachment's own top-of-`persist` gate) can join this exact
        // in-flight attempt instead of racing it. Without `recovery` there
        // is no cross-call attachment state to track this on at all --
        // still bounded-retried, just with no promise-sharing of its own.
        // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
        // canonical 2026-10-03T21:53:56Z, "every failed snapshot write is
        // now made permanently unresolved unless that exact snapshot
        // actually exists"), corrected again (Codex reopen, canonical
        // 2026-10-03T22:41:06Z, "an unstructured response is not a domain
        // decision"), corrected again (Codex reopen, canonical
        // 2026-10-03T23:31:57Z, "an unexpected failure is not a definitive
        // rejection"): a prior version of this check treated every
        // `VoiceApiError` OTHER than two named transport codes as a
        // definitive rejection -- but apps/api's own exception filter
        // (`common/snake-case.exception-filter.ts`) emits an equally
        // structured `INTERNAL_SERVER_ERROR` envelope for an UNEXPECTED
        // failure too, including one thrown while awaiting the COMMIT
        // acknowledgement of a write that may already have durably landed
        // (`voice-session.repository.ts`'s `withTransaction`). A structured
        // JSON body alone does not prove apps/api's domain logic ever
        // looked at and rejected this exact request -- only a code this
        // persist path's OWN domain logic (`VoiceSessionService.
        // persistDialogueSnapshot`) is known to throw strictly BEFORE
        // attempting the write (or, for `VOICE_ACTION_PAYLOAD_CONFLICT`,
        // strictly about a DIFFERENT already-landed write, never this
        // call's own) is safe to treat as proof this call's own content
        // never committed. Every other code -- a generic
        // `INTERNAL_SERVER_ERROR`, any other unknown structured code, the
        // two transport-ambiguous codes -- is treated the same: genuinely
        // ambiguous, always reconciled rather than assumed rejected.
        const isDefinitiveRejection =
          err instanceof VoiceApiError &&
          DEFINITIVE_DIALOGUE_SNAPSHOT_REJECTION_CODES.has(err.code);
        if (isDefinitiveRejection) {
          throw err;
        }
        const pending = {
          expectedSessionVersion: expectedSnapshotSessionVersion,
          inputEpoch: request.inputEpoch,
          mediaEpoch: request.mediaEpoch ?? 0,
          turnId: request.turnId,
        };
        if (recovery) {
          recovery.attachmentState.unresolvedCommit = pending;
        }
        const reconciliation = await reconcileUnresolvedCommit(
          client,
          current.voiceSessionId,
          capability.token,
          recoverySignal,
          pending,
          recovery?.attachmentState,
        );
        if (reconciliation.resolved !== true) {
          // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex
          // reopen, canonical 2026-10-03T22:41:06Z, then 2026-10-03T23:31:57Z):
          // two distinct outcomes share this branch. `resolved: false` is
          // confirmed non-acceptance -- the atomic adjudication call
          // durably fenced this exact version, so `reconcileUnresolvedCommit`
          // already cleared `unresolvedCommit` on the real attachment, and
          // a LATER turn is free to submit its own fresh content rather
          // than being permanently wedged behind this write.
          // `resolved: "unknown"` means the outcome is still genuinely
          // open (bounded polling AND the adjudication call both failed to
          // settle it) -- `unresolvedCommit` stays set so a later call
          // retries this same reconciliation. Either way, THIS call's own
          // externally-visible error is unchanged from before this fix:
          // surface the ORIGINAL write failure, not an internal
          // retry-exhaustion message, unless THIS exact call's own
          // `signal` is what aborted.
          if (signal?.aborted) {
            throw new Error(
              "voice_trusted_persist_aborted: request was aborted while awaiting the dialogue-snapshot response.",
            );
          }
          throw err;
        }
        const candidate = reconciliation.snapshot;
        // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex
        // reopen, canonical 2026-10-03T19:24:15Z, corrected again per the
        // canonical 2026-10-03T20:13:00Z and 2026-10-03T21:09:40Z
        // reopens): this turn's content commit DID durably land, and (when
        // `recovery` is present) `reconcileUnresolvedCommit` already
        // installed it onto the REAL per-attachment state
        // (`recovery.attachmentState`) directly, as a side effect of
        // resolving -- a cancelled turn's `VoiceDialogueEngine.
        // boundedStage` abort/deadline race may have already discarded
        // this call's eventual result before `Object.assign(state, next)`
        // can ever run, so `next` (this function's own `state` parameter)
        // must never be the only place this commit is recorded. Only when
        // `recovery.attachmentState`'s own `committedSessionVersion` still
        // reflects EXACTLY this call's write (nothing newer superseded it
        // while reconciliation ran) is it safe to also mirror onto
        // `next`/`state` for this call's own
        // success path. Deliberately no `signal?.aborted` check here --
        // same as before this fix: the reconciled content must be applied
        // unconditionally (this turn's own cancellation does not undo a
        // commit that genuinely landed), and the pre-existing check right
        // after this whole `try`/`catch` already rejects this call for an
        // aborted signal regardless.
        if (
          recovery &&
          recovery.attachmentState.committedSessionVersion !==
            expectedSnapshotSessionVersion
        ) {
          throw new Error(
            "voice_trusted_persist_superseded_by_recovered_commit: this turn's own content commit was superseded by a different reconciled outcome while this call was in flight; retry from a fresh turn.",
          );
        }
        state.restoreFromSnapshotContent(candidate.content);
        state.committedSessionVersion = expectedSnapshotSessionVersion;
        snapshot = candidate;
      }
      if (signal?.aborted) {
        throw new Error(
          "voice_trusted_persist_aborted: request was aborted while awaiting the dialogue-snapshot response.",
        );
      }
      // Codex reopen round 15/16, R4-persist: the result was previously
      // discarded entirely -- a response for a FOREIGN session/revision/
      // turn, or one already past its own retention window, was accepted
      // as success with no check at all. Same correlation discipline as
      // `resolveInput` above: every identifying field this exact call
      // submitted must come back unchanged, and the returned snapshot must
      // not already be expired the moment it is reported as persisted.
      const snapshotCorrelates =
        snapshot.voiceSessionId === current.voiceSessionId &&
        snapshot.sessionVersion === expectedSnapshotSessionVersion &&
        snapshot.inputEpoch === request.inputEpoch &&
        snapshot.mediaEpoch === (request.mediaEpoch ?? 0) &&
        snapshot.turnId === request.turnId &&
        new Date(snapshot.retentionExpiresAt).getTime() > Date.now();
      if (!snapshotCorrelates) {
        throw new Error(
          "voice_trusted_persist_snapshot_mismatch: dialogue-snapshot response does not correlate with the exact turn/revision just persisted.",
        );
      }
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
      // canonical 2026-10-03T20:13:00Z): stamp the CONTENT-specific
      // commit marker (see `VoiceDialogueState.committedSessionVersion`'s
      // own doc) on `state` (the engine's own candidate clone, `next`) so
      // `VoiceDialogueEngine.turn`'s subsequent `Object.assign(state,
      // next)` carries it onto the real attachment -- the only thing a
      // LATER turn's own ambiguous-commit reconciliation may trust to
      // know whether this exact content has already landed, since
      // `current.sessionVersion` also advances on control-only events
      // (barge-in) with no content write at all.
      state.committedSessionVersion = expectedSnapshotSessionVersion;
    },
  };
}
