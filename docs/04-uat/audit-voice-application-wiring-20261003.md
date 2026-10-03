# AUDIT-VOICE-APPLICATION-WIRING-20261003

Owner: Claude2. Reviewer: Codex. Baseline: `origin/dev` after
`AUDIT-VOICE-LIFECYCLE-20261003` merged (PR #2290, `2c8839986`) and
`SR-LIVE-MAP-C114-COVERAGE-20260930` (PR #2292, `c39e3b787`); this task's
candidate fast-forwards onto that exact `origin/dev` head.

## What was found before this task

Source inspection of every symbol the task brief named confirmed all of it
was still true on the fresh baseline:

- `VoiceDialogueEngine`/`VoiceDialogueTurnPorts`
  (`apps/voice-media-worker/src/dialogue/dialogue-engine.ts`) existed with a
  real `turn()` implementation (bounded persist/execute staging, epoch
  fencing, abort handling) but was **never instantiated anywhere in
  production code** -- `grep` across `apps/` found zero non-definition
  references, and zero tests.
- `VoiceSessionComposer` (`apps/voice-media-worker/src/server/session-composer.ts`)
  already emitted a `"session.event"` `EventEmitter` event (including
  `asr.segment.final`) and `MediaWorkerServer` already re-emitted it, but
  `apps/voice-media-worker/src/server.ts`'s `main()` never listened to it --
  the composer's own doc comment names the reason: "the CTI/IVR dialogue
  orchestration layer, which does not exist yet."
- `OpenAiRealtimeFixtureAdapter`
  (`apps/voice-media-worker/src/providers/native-voice/native-voice-adapter.ts`)
  is the **only** `VoiceDialogueProvider` implementation in the repo
  (`mode: "fixture"`, `isProductionCapable: false`); no live provider
  exists, so `production: true` on `VoiceDialogueEngine` would make every
  turn fail closed with `voice_fixture_forbidden`.
- `VoiceToolGatewayService`/`VoiceToolDomainPorts`
  (`apps/api/src/modules/voice-booking/voice-tool-gateway.service.ts`) had
  **zero concrete `VoiceToolDomainPorts` implementations** anywhere, was
  **not registered as a NestJS provider** in `voice-booking.module.ts`, and
  no controller (`voice-booking.controller.ts`, `callcenter.controller.ts`)
  exposes a route that would call it. `voice-media-worker`'s
  `package.json` depends on nothing but `@drts/contracts` -- it has **no
  database client at all** -- so nothing in that process can reach
  `VoiceBookingRepository`/`VoiceBookingAuthorizationService` (both
  Postgres-backed, `apps/api`-only) to resolve a real
  location/eligibility/readback/booking-status result.
- `apps/voice-media-worker/src/server.ts`'s own `console.warn` already names
  the missing piece precisely: `apps/api/src/modules/cti-ivr` (the driver
  that would hold a verified call-authority channel into apps/api's
  DB-backed tool gateway) **does not exist** and is explicitly **outside
  this task's `write_scopes`** (`apps/voice-booking/` only).
- `sealed-recorder.ts`/`immutable-manifest.ts`/`final-manifest.ts`
  (`RecorderObjectStore`/`RecordingClosureLedger`) have no production
  implementation; `main()`'s `recordingAdapter` is deliberately left unset
  with a comment explaining why. `voice-media-worker` has no
  `@aws-sdk/client-s3` (or any storage SDK) dependency, and this task's
  brief explicitly forbids an in-memory production fallback and
  uncoordinated manifest/lockfile edits -- adding a real durable store here
  would be exactly that. **This boundary is unchanged by this task** (see
  "Still blocked" below); it was correctly identified by
  `AUDIT-VOICE-RUNTIME-20261002` and remains correct.
- `VoiceCommandRunnerService` (`apps/api/src/modules/voice-booking/voice-command-runner.service.ts`)
  is already real, DB-backed, and registered -- not orphaned. It consumes
  already-committed commands/work items; it has no seam for a live call's
  in-flight dialogue turn, so it required no change here.

## What this task implements

A new `VoiceCallTurnCoordinator`
(`apps/voice-media-worker/src/dialogue/call-turn-coordinator.ts`) composes
the real `VoiceDialogueEngine`/`VoiceDialogueState`/`OpenAiRealtimeFixtureAdapter`
machinery against every session's real ASR final-transcript events, wired
directly into `VoiceSessionComposer.attach()` (one coordinator instance
shared across sessions; one `VoiceDialogueEngine`+`VoiceDialogueState` per
session id, since the engine's own `running` guard is per-instance) and
constructed in `server.ts`'s `main()`. No new HTTP/WS endpoint, no new
cross-process protocol, no new dependency: everything runs in-process,
using only the existing `session.event` → `VoiceMediaWorkerSession.startPlayback`
boundary, per the brief's "No VM listeners or product servers; use
in-memory request/upgrade boundaries."

Composed behavior, with the real engine running (not a bypassed/mocked
turn):

- **Turn admission / epoch fencing**: each `asr.segment.final` bumps a
  per-session `inputEpoch` *before* the turn is queued; turns for one
  session are serialized through a promise chain so a later final can never
  interleave persist/execute with an earlier one still in flight. A
  superseded turn self-aborts inside the existing
  `runVoiceDialogue`/`VoiceDialogueEngine.turn` epoch checks (`voice_stale_epoch`)
  without the coordinator needing to duplicate that logic.
- **Tool execution boundary (the genuinely missing piece above)**: any
  proposed tool other than `request_handoff` would require the unreachable
  `apps/api` domain-execution channel. Rather than fabricate a
  location/eligibility/readback/booking-status result, `executeTools`
  forces the same outcome a real-but-unavailable provider would produce --
  it marks `state.handoff = { reason: "provider_unavailable", ... }` and
  returns `{ status: "unavailable", handoffId: null }`, both already-defined
  values in `packages/contracts/src/voice-dialogue.ts`'s
  `voiceToolResultSchemas.request_handoff`/`voiceToolProposalSchema`. This
  is never reached for `emergency`/`human`/etc. intents, which
  `VoiceDialogueState.apply()` already routes to a real handoff
  independently of tool execution, so the critical-safety message
  ("如有立即危險，請聯絡當地緊急救援服務。") is spoken even with the domain
  boundary unavailable.
- **TTS/recording path (within what is reachable)**: a turn's resulting
  prompt (collection prompt, handoff message, or emergency message) is
  spoken back through the session's existing, already-composed real TTS
  pipeline (`VoiceMediaWorkerSession.startPlayback`, honoring the already-
  correct ASR/TTS provider composition and fail-closed production posture)
  -- not a new mechanism. The durable recording/object-store leg remains
  the separately-identified, still-genuinely-blocked boundary (unchanged;
  see above) -- this task does not touch `recordingAdapter` composition.
- **Session id reuse**: `release(sessionId)` is wired into the composer's
  existing channel-close cleanup, so a reused session id never resumes a
  prior call's collected slots or handoff state.
- `persist` is an intentional no-op with a doc comment explaining why: the
  only durable per-call session store (`voice.session` in apps/api's
  Postgres) is unreachable from this process; the engine's own in-memory
  `Object.assign(state, next)` immediately after `persist` resolves is the
  only persistence this coordinator can honestly provide, and it does not
  survive a worker restart or exist outside this one process.

## Still blocked (unchanged by this task, recorded precisely)

- **Real tool execution** (`resolve_location`, `check_booking_eligibility`,
  `prepare_booking_readback`, `get_bound_booking_status`): requires
  `apps/api/src/modules/cti-ivr` (does not exist, out of `write_scopes`) to
  hold a verified call-authority channel into apps/api's DB-backed
  `VoiceToolGatewayService`. `voice-media-worker` has no database
  dependency and must not acquire one just to reach this state --
  confirmed by reading its `package.json` (`@drts/contracts` only).
- **Durable recording object store**: `RecorderObjectStore`/
  `RecordingClosureLedger` have no production implementation;
  `voice-media-worker` has no S3 (or any storage) SDK dependency, and
  adding one here would be an uncoordinated manifest/lockfile edit the
  brief explicitly forbids, plus the in-memory production fallback the
  brief explicitly forbids. `main()`'s `recordingAdapter`/
  `callAuthorityVerifier` remain unset, exactly as before this task.
- **Live dialogue provider**: `OpenAiRealtimeFixtureAdapter` remains
  `mode: "fixture"`/`isProductionCapable: false`; no live
  `VoiceDialogueProvider` exists. `VoiceCallTurnCoordinator` always
  constructs `VoiceDialogueEngine` with `production: false` for this
  reason (hardcoded, not derived from ASR/TTS `productionCapable`, which
  is an unrelated flag).

None of the above are relabeled ready; `server.ts`'s startup now also logs
this specific boundary (see the new `console.warn` next to the existing
call-authority/recording warnings).

## Verification

| Finding / acceptance key | Source basis & change location | Before → after | Command, exit code, evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| `composed_turn_and_recording_path` | `apps/voice-media-worker/src/dialogue/call-turn-coordinator.ts` (new); `.../server/session-composer.ts` (`attach` wires `turnCoordinator.handle`/`release`); `.../server.ts` (`main()` constructs `VoiceCallTurnCoordinator`, passes to `VoiceSessionComposer`) | Before: `VoiceDialogueEngine`/fixture provider never instantiated; `session.event` had no dialogue consumer. After: every `asr.segment.final` runs a real turn through the real engine/state/fixture-provider and speaks its prompt via the session's real TTS pipeline. | `apps/voice-media-worker`: `pnpm run typecheck` exit 0; `pnpm run lint` exit 0. `pnpm vitest run tests/unit/audit-voice-application-wiring-20261003/call-turn-coordinator.test.ts tests/unit/audit-voice-runtime-20261002`: **14 files / 148 tests passed** (7 new + 141 pre-existing, zero regressions). New-file coverage: plain-greeting collection prompt with no tools, forced-handoff-on-non-handoff-tool-proposal (never fabricates `resolve_location`), real emergency safety message, epoch-fencing a stale rapid-fire final, `release` isolating a reused session id from the prior call's handoff, non-final events never triggering a turn, an unexpected provider schema violation never escaping `handle` (console.error observed, no throw). `npx eslint tests/unit/audit-voice-application-wiring-20261003/call-turn-coordinator.test.ts --max-warnings=0`: exit 0, no output. | None outstanding for this key. (A transient whole-worktree `node_modules` outage mid-session -- `vitest`/`zod`/`typescript`/`eslint` symlinks pointed into a sibling task's worktree that the supervisor reaped concurrently -- blocked the first attempt; it self-resolved, confirmed by re-resolving `node_modules/vitest` to the canonical root's `.pnpm` store, and every command above is from the run *after* that recovery.) |
| `authority_epoch_consent_fences` | `call-turn-coordinator.ts` (`handle`'s `inputEpoch` bump + serialized `queue`; relies on existing `VoiceDialogueEngine`/`runVoiceDialogue` epoch checks) | Before: no caller ever exercised the engine's epoch-fencing code paths. After: a rapid second final observably supersedes an in-flight first turn for the same session (new test "fences a stale turn..."); `request_handoff`/emergency handling never infers consent from ASR text -- `executeTools` only ever returns `status: "unavailable"`, never a fabricated success. | Covered by the same `call-turn-coordinator.test.ts` run above ("fences a stale turn when a later final supersedes it before the first settles": sends two finals for one session synchronously, asserts exactly one spoken result -- the second/winning turn's). | Fencing proven only against this coordinator's in-process `inputEpoch`, not against apps/api's `voice.session.input_epoch`/`lease_epoch` (unreachable from this process -- see "Still blocked"). |
| `precise_unimplemented_and_external_boundaries` | This doc's "What was found"/"Still blocked" sections; `call-turn-coordinator.ts` class doc; `server.ts`'s new `console.warn` | Before: the gap was documented in `docs/04-uat/audit-voice-runtime-20261002.md` at the composer/session level but had no corresponding code-level fail-closed behavior for a turn that actually ran. After: the boundary is enforced in code (`executeTools` forces `unavailable`/handoff for every non-`request_handoff` tool) and documented at the point of use, not just in a separate doc. | Source review (this doc); no new acceptance criteria invented, no existing blocked acceptance (`SR-LIVE-*`, `UV-EXEC-027/028`) relabeled. | N/A -- documentation/code-boundary claim, not a runtime measurement. |
| `same_sha_review_ci` | N/A (candidate-lifecycle level) | N/A | Pending: `CANDIDATE_SHA`/`CANDIDATE_BRANCH` handoff to Codex; hosted CI run on that exact SHA. | Hosted CI has not run yet as of this handoff; this is the normal pending-until-handoff state, not a known failure. |

## Commands actually run (this session)

- `git merge origin/dev` (fast-forward only, from `5bf63636a` to `c39e3b787`) -- clean, no conflicts.
- `packages/contracts`: `pnpm run build` -- succeeded (repo-wide stale-`dist` precondition for every other typecheck in this session).
- `apps/voice-media-worker`: `pnpm run typecheck` -- exit 0.
- `apps/voice-media-worker`: `pnpm run lint` -- exit 0.
- Repo root: `pnpm vitest run tests/unit/audit-voice-application-wiring-20261003/call-turn-coordinator.test.ts tests/unit/audit-voice-runtime-20261002` -- **14 files / 148 tests passed** (7 new, 141 pre-existing, run together in one process after this task's `session-composer.ts`/`server.ts`/`index.ts` edits were applied).
- `npx eslint tests/unit/audit-voice-application-wiring-20261003/call-turn-coordinator.test.ts --max-warnings=0` -- exit 0.
- Transient note: midway through this session, this worktree's top-level `node_modules` symlinks for `vitest`/`zod`/`typescript`/`eslint` resolved into a *different* task's worktree (`.artifacts/worktrees/auto/gemini-audit-dependency-gates-20261002`) that the supervisor's worktree reaping removed concurrently, breaking every one of those tools at once (confirmed via `ls -la`/`readlink -f`; `pnpm install`/`ln`/`rm` to repair it were not available to this worker -- classified `defer`, no interactive approval channel in this dispatch). It self-resolved shortly after (re-linked to the canonical root's `.pnpm` store via a different, then-current sibling worktree) with no worker action; every command result recorded in this doc is from after that recovery.

## Not attempted / explicitly out of scope

- No changes to `apps/api/src/modules/voice-booking/`: every integration
  point inspected there (`VoiceToolGatewayService`, `VoiceToolDomainPorts`,
  the controller/module registration) would require either (a) a new
  cross-process protocol from `voice-media-worker` (forbidden --
  "no speculative CTI/LLM/storage endpoint") or (b) building the
  `apps/api/src/modules/cti-ivr` driver itself, which is outside this
  task's `write_scopes`. No speculative change was made there.
- No new dependency added to any `package.json`/lockfile (coordinating
  with the dependency-gates owner was therefore unnecessary -- nothing
  here needed one).
- No change to `recordingAdapter`/`callAuthorityVerifier` composition in
  `server.ts` beyond the new `console.warn` -- both remain correctly unset.
