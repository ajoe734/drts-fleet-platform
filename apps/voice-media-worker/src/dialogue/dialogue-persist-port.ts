import type { VoiceDialogueState } from "./dialogue-state";
import type { VoiceDialogueRequest } from "./voice-dialogue-provider";
import type { VoiceSessionBinding } from "./voice-session-binding";
import type {
  DialogueSnapshotRestorationResult,
  IssueCapabilityCommand,
  PersistDialogueSnapshotResult,
  ResolveInputResult,
  VoiceApiClient,
} from "../server/voice-api-client";

/**
 * Codex reopen round 18, R4-persist: a single, best-effort authoritative
 * read used to disambiguate a `resolveInput`/`persistDialogueSnapshot` call
 * whose own HTTP response was lost (network error, timeout, proxy reset) --
 * never whether the response was merely slow. Only ever consulted from a
 * `catch` block, after the real write attempt already failed; its own
 * failure (apps/api also unreachable right now) must never replace the
 * original error with a confusing new one, so it swallows every error from
 * this read and lets the caller fall back to the original failure. Returns
 * `undefined` on any such secondary failure or `signal` abort -- the caller
 * still re-checks `signal.aborted` itself afterward, since this read's own
 * success/failure says nothing about whether the turn that triggered it is
 * still live.
 */
async function reconcileAmbiguousCommit(
  client: VoiceApiClient,
  voiceSessionId: string,
  capabilityToken: string,
  signal: AbortSignal | undefined,
): Promise<DialogueSnapshotRestorationResult | undefined> {
  if (signal?.aborted) return undefined;
  try {
    return await client.getDialogueSnapshotRestoration(
      voiceSessionId,
      capabilityToken,
      signal,
    );
  } catch {
    return undefined;
  }
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
export function createTrustedDialoguePersistPort(
  client: VoiceApiClient,
  binding: () => VoiceSessionBinding | undefined,
): VoiceDialoguePersistPort {
  return {
    mode: "trusted",
    async persist(state, request) {
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
      const capability = await client.issueCapability(
        {
          voiceSessionId: current.voiceSessionId,
          resourceScopeId: current.resourceScopeId,
          routeProfileVersion: current.routeProfileVersion,
          leaseEpoch: current.leaseEpoch,
          scopes: PERSIST_CAPABILITY_SCOPES,
        },
        signal,
      );
      // `issueCapability` can settle after `signal` already fired (an
      // abort does not retroactively un-resolve a promise); re-check
      // before the CAS write itself ever goes out, or a cancelled turn
      // could still advance the authoritative revision underneath it.
      if (signal?.aborted) {
        throw new Error(
          "voice_trusted_persist_aborted: request was aborted while awaiting capability issuance.",
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
        if (signal?.aborted) {
          throw new Error(
            "voice_trusted_persist_aborted: request was aborted while awaiting the resolveInput response.",
          );
        }
        // Codex reopen round 18, R4-persist ("regress lost replies, not
        // only delayed ones"): a transport-level failure here (timeout,
        // dropped response, proxy reset) does not prove the CAS never
        // committed -- the write can genuinely have landed server-side
        // with only its own HTTP acknowledgement lost in transit. Read
        // authoritative truth back once before concluding this turn's
        // admission never happened; `reconcileAmbiguousCommit` applies the
        // exact same correlation discipline the success path below does,
        // so an unrelated/foreign/stale read can never be mistaken for
        // this turn's own outcome.
        const reconciled = await reconcileAmbiguousCommit(
          client,
          current.voiceSessionId,
          capability.token,
          signal,
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
        if (!reconciledCorrelates) throw err;
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
        if (signal?.aborted) {
          throw new Error(
            "voice_trusted_persist_aborted: request was aborted while awaiting the dialogue-snapshot response.",
          );
        }
        // Codex reopen round 18, R4-persist: the exact probe this
        // reopened on -- a turn's content commit durably lands (the
        // server accepted the write) but its own HTTP acknowledgement is
        // lost. Without reconciling, the engine's in-memory `state` never
        // learns this turn's content was actually durably recorded (see
        // `VoiceDialogueEngine.turn`'s `Object.assign(state, next)`, which
        // only runs once `persist()` resolves) and the NEXT turn silently
        // starts a new, unrelated commit that supersedes/erases the
        // already-accepted one -- loss of previously accepted dialogue
        // state, not safe recovery. Read authoritative truth back once
        // before concluding the content was never recorded; a mismatched
        // or expired read still fails this call exactly as before.
        const reconciled = await reconcileAmbiguousCommit(
          client,
          current.voiceSessionId,
          capability.token,
          signal,
        );
        const candidate = reconciled?.snapshot;
        const reconciledCorrelates =
          candidate != null &&
          candidate.voiceSessionId === current.voiceSessionId &&
          candidate.sessionVersion === expectedSnapshotSessionVersion &&
          candidate.inputEpoch === request.inputEpoch &&
          candidate.mediaEpoch === (request.mediaEpoch ?? 0) &&
          candidate.turnId === request.turnId &&
          new Date(candidate.retentionExpiresAt).getTime() > Date.now();
        if (!reconciledCorrelates) throw err;
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
    },
  };
}
