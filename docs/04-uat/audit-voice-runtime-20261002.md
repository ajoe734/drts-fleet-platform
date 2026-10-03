# AUDIT-VOICE-RUNTIME-20261002: voice runtime composition and worker authorization

Authority: user-approved remediation of the 2026-10-02 code audit
(`.local/project-audit-20261002/REPORT.md` F06) via
`.local/project-fixes-20261002/EXECUTION.md`. Owner Claude2, reviewer Codex.
Baseline `origin/dev` at task start: `2b4b6b96aed1c41ae4b252681e0466ee808cbd0e`.

This document records (1) exactly which CTI/ASR/TTS/recording paths are
accepted-but-unwired vs genuinely undecided, (2) the worker-security code fix
delivered in this task, and (3) the precise remaining blockers. Per the task
brief, writing this document does not by itself satisfy the implementation
obligation -- section 2 is the actual code change; this section is evidence,
not a substitute.

## 1. Provider path inventory (approved vs undecided)

| Surface | Status | Evidence |
|---|---|---|
| CTI (telephony vendor) | **Undecided.** No vendor has been selected (SD §3.3 "未決標"). Only a fixed-fixture `sandbox` adapter and a fail-closed "unconfigured" slot exist; the adapter file is an intentional standalone scaffold not wired into any controller/route. | `apps/api/src/modules/callcenter/voice-cti.adapter.ts:7-21` (scaffold/ownership note), `:394-443` (`SandboxVoiceCtiProviderAdapter`, `isProductionCapable` hard-coded `false`), `:519-540` (`createUnconfiguredVoiceCtiProvider`, fails closed with `VOICE_CTI_PROVIDER_NOT_CONFIGURED`). Wiring this adapter into a real route is explicitly owned by UV-EXEC-010, not this task. |
| ASR/TTS (TWM) | **Accepted vendor, protocol documented, no real client exists.** TWM is the decided ASR/TTS vendor: staging already reserves live secrets for it (`infra/gcp/staging/voice-media-worker-service.yaml:48-57`, `TWM_ASR_API_KEY` / `TWM_TTS_API_KEY`), and the exact wire protocol (login, access-info, synthesize paths) is documented in source per SD §11. Only a fixture implementation exists -- no network I/O, no credential handling, no WebSocket client. | `apps/voice-media-worker/src/providers/twm/twm-adapter.ts:47-55` (`TWM_PROTOCOL_FIXTURE`: documented REST/WS paths), `:70-186` (`TwmAsrFixtureAdapter`, `isProductionCapable = false as const`, all methods operate on an in-memory fixture list, zero network calls), `:207-261` (`TwmTtsFixtureAdapter`, same). |
| Native speech-to-speech (OpenAI Realtime) | **Candidate, not accepted.** Explicitly documented as a candidate pending UV-EXEC-027/028 account/PSTN gating; `connect()` throws `voice_fixture_forbidden` if ever asked to run in production mode. | `apps/voice-media-worker/src/providers/native-voice/native-voice-adapter.ts:56-67` (class doc), `:99-114` (`connect()` fail-closed). |
| Recording durable storage (`RecorderObjectStore`) | **No production implementation anywhere in the repo.** Only the interface and its invariant checks (`validateSegment`, `verifyRecordedObject`) exist; `MediaRecordingAdapter` requires a concrete `RecorderObjectStore` and none is ever constructed. | `apps/voice-media-worker/src/recording/sealed-recorder.ts:37-63` (interface), `apps/voice-media-worker/src/recording/media-recording-adapter.ts:48-54` (constructor requires it). Repo-wide search for a GCS/S3-backed implementation of this interface returns none. |
| Worker-to-API wiring | **Not connected at all.** `apps/api` never calls any `voice-media-worker` HTTP route; the only repo references to `VOICE_MEDIA_*` in `apps/api` are an unrelated DI token name (`VOICE_MEDIA_RECORDING_ADAPTER`) in `voice-booking`, not a network client. | `apps/api/src/modules/voice-booking/voice-evidence.service.ts:31-32`, `voice-command-runner.service.ts:22,95` (DI token only). No `fetch`/`http` client to the worker exists anywhere under `apps/api`. |
| Deploy inventory | **Worker is not deployed anywhere.** No `.github/workflows/*.yml` references `voice-media-worker`; `infra/gcp/staging/voice-media-worker-service.yaml` is a template with `SERVICE_ACCOUNT_PLACEHOLDER` / `IMAGE_PLACEHOLDER` / `CONTROL_PLANE_API_ORIGIN_PLACEHOLDER` still unfilled. | `infra/gcp/staging/voice-media-worker-service.yaml:24,26,47`. `grep -rl voice-media-worker .github/workflows/*.yml` returns no matches. |

Conclusion: there is no case in this worker where a real, accepted protocol
implementation exists but is simply left unwired from configuration -- every
fixture is fixture because the real client code does not exist yet (TWM) or
the vendor itself is undecided (CTI) or explicitly gated (native candidate).
Flipping an env var cannot make any of these production-capable; see §3.

## 2. Code fix delivered in this task: honest composition and worker authorization

The actual runtime gap this task could close without a live vendor account,
new credentials, or a live PSTN/network call was the worker's own exposed
surface and its willingness to claim readiness it cannot back up. Both are
now fixed in code (not just documented):

### 2.1 Caller authentication on every operational route

Before this change, `apps/voice-media-worker/src/server/media-worker-server.ts`
accepted `POST /drain`, `POST /sessions`, `POST /recording/finalize`, and the
WebSocket upgrade from **any** caller with zero authentication -- exactly the
gap the audit cited. `/drain` could be hit by anyone to force a graceful
shutdown; `/sessions` could be used to exhaust `maxConcurrentSessions`; the WS
upgrade admitted any caller into a live media session.

Fix: `apps/voice-media-worker/src/server/internal-auth.ts` adds
`verifyVoiceMediaCaller`, a fail-closed shared-secret check carried in the
same `x-drts-internal-key` header the rest of the platform already uses for
service-to-service calls (mirrors `requireScopedInternalKey` in
`apps/api/src/common/auth/internal-key.middleware.ts`: purpose-bound secret,
timing-safe compare, short rotation window via a previous key). It is
re-implemented locally rather than imported because this worker has no
runtime dependency on `apps/api`. All four surfaces now call
`authenticateCaller()` first (`media-worker-server.ts`: `/drain`, `/sessions`,
`/recording/finalize` handlers, and `handleUpgrade`). `/health`, `/healthz`,
`/ready`, `/readyz`, `/status`, `/metrics` remain public, matching standard
liveness/readiness probe conventions (the staging template points
`startupProbe`/`livenessProbe`/`readinessProbe` at `/health` and `/ready`
unauthenticated).

Environment semantics mirror `detectAuthEnvironment`
(`apps/api/src/config/auth-startup-config.ts:150-179`) via a local
`isStrictVoiceMediaEnvironment()` (`apps/voice-media-worker/src/server/environment.ts`):
in staging/production an unconfigured `VOICE_MEDIA_INTERNAL_KEY` fails closed
(503) rather than silently allowing traffic; outside those environments an
unconfigured key leaves the surface open, matching `InternalKeyMiddleware`'s
local/dev/test bypass so existing tests and local runs are unaffected.

### 2.2 Session collision guard

`admitSession()` previously allowed a second caller to silently overwrite an
already-active `sessionId` (via either `/sessions` or the WS upgrade),
orphaning the first caller's channel (no longer reachable from
`closeSession`/`drain`) with no error. It now rejects with
`MEDIA_WORKER_SESSION_ID_CONFLICT` (surfaced as HTTP 409, or WS close code
1013 with an explicit reason) when the id is already active.

### 2.3 Body and frame size limits

`/sessions` and `/recording/finalize` previously accumulated an unbounded
request body before parsing. `readBoundedBody()` now rejects with HTTP 413
once the body exceeds `VOICE_MEDIA_HTTP_MAX_BODY_BYTES` (default 1 MiB),
draining the remaining bytes instead of destroying the socket so the error
response still reaches the caller.

`apps/voice-media-worker/src/server/websocket-channel.ts`'s frame parser
previously buffered however many bytes a peer claimed to be sending in a
single WS frame header before processing anything -- a peer could announce a
multi-gigabyte frame length and force unbounded buffering. It now rejects any
frame whose declared length exceeds `maxPayloadBytes`
(`VOICE_MEDIA_WS_MAX_FRAME_BYTES`, default 1 MiB) as soon as the length is
known, before waiting for the rest of the frame, closing with code 1009.

### 2.4 Honest `/ready`: a strict-environment worker can no longer claim readiness it cannot back up

Before this change, `/ready` only considered draining/capacity state --
nothing about whether any composed provider could actually serve a real
call. A worker deployed to the staging template above (which already sets
`NODE_ENV: production`, `infra/gcp/staging/voice-media-worker-service.yaml:37`)
would report `ready: true` indefinitely while every CTI/ASR/TTS/recording
path is a non-production-capable fixture -- the "looks deployed and healthy
but cannot serve a real call" failure mode the audit flagged.

`MediaWorkerServerConfig.voiceRuntimeProductionCapable` (default `false`) is
now threaded through to `/ready`: in a strict environment
(`isStrictVoiceMediaEnvironment()`), if it is not explicitly set `true`,
`/ready` returns 503 with `reason: "voice_runtime_not_production_capable"`
and the configured `voiceRuntimeNotCapableReason` detail. `server.ts` logs an
explicit startup warning citing this document. Outside strict environments
(local/dev/test, including this task's own tests and the pre-existing
`tests/integration/uv-exec-023.integration.test.ts`), readiness semantics are
unchanged.

This default is honest: no composition code in this repo can set it to
`true` today, because no provider is production-capable (§1). The flag
exists so that whoever eventually wires a real, verified production adapter
(TWM client with a validated account, or a real CTI vendor, or a durable
`RecorderObjectStore`) has a concrete, fail-closed switch to flip with actual
evidence -- rather than readiness being silently blind to the question.

### 2.5 What this task deliberately did not build

Building a real TWM ASR/TTS network client (WebSocket streaming + REST
login/synthesize against `TWM_PROTOCOL_FIXTURE`'s documented paths), a real
`RecorderObjectStore` backend, or wiring the existing dialogue/language-router
pipeline (`apps/voice-media-worker/src/dialogue/dialogue-engine.ts`,
`language/language-router.ts`) into `media-worker-server.ts`'s WS session
handling are each substantial, independently testable features that this
task's guardrails and VM restrictions (no live network/PSTN calls, no new
credentials) make impossible to implement *and verify* safely in one pass:

- A real TWM client cannot be exercised against the actual service from this
  VM, so it could not be validated beyond "compiles," which is not a
  responsible bar for a component that would handle live caller audio.
- A durable `RecorderObjectStore` needs an explicit storage/bucket decision;
  `AUDIT-ARTIFACT-DURABILITY-20261002` (this same owner's parallel task) is
  independently establishing the repo's shared durable-object-store pattern
  for a related surface (billing/document artifacts) -- duplicating a second,
  divergent storage adapter here ahead of that decision would create the
  inconsistency the audit is trying to remove, not fix it.
- Wiring the dialogue/ASR/TTS loop into the WS handler is a full per-call
  state-machine integration (frame parsing, barge-in, confirmation gating)
  that cannot be meaningfully tested without either the real vendor or a
  large new test harness; attempting it without live verification risks
  shipping an integration that looks wired but has never processed a real
  frame, which is a more subtle version of the same "looks done, isn't"
  problem the audit raised.

These remain open, precisely-scoped follow-on work (see §3), not silently
dropped.

## 3. Remaining blockers (precise)

1. **CTI vendor selection** -- SD §3.3 "未決標". No code change can close
   this; it requires a business/procurement decision external to this repo.
   Once decided, wiring happens in UV-EXEC-010's scope
   (`voice-cti.adapter.ts:7-21`), not this task's.
2. **TWM production account + real client implementation.** Staging secret
   names are reserved (`infra/gcp/staging/voice-media-worker-service.yaml:48-57`)
   but no verified account/credentials exist in this environment, and no HTTP/
   WebSocket client implementing `TWM_PROTOCOL_FIXTURE`'s documented paths
   exists. Needs: a provisioned TWM account, a real client class marking
   `isProductionCapable: true` only once connected against that account, and
   live verification this VM cannot perform (no live network calls allowed
   here).
3. **Durable `RecorderObjectStore` backend.** No GCS/S3-backed implementation
   exists. Blocked on the storage pattern `AUDIT-ARTIFACT-DURABILITY-20261002`
   is establishing; building a second, divergent one here would itself be a
   defect.
4. **Dialogue/ASR/TTS/recording pipeline wiring into the running worker.**
   `dialogue-engine.ts`, `language-router.ts`, the TWM/native adapters, and
   `SealedRecorder` all exist as tested library code but are never invoked
   from `media-worker-server.ts`'s WS session handling
   (`apps/voice-media-worker/src/index.ts` only re-exports them). This is real
   remaining implementation work, blocked on (2) and (3) above existing
   first -- there is no honest "production-capable" composition to wire
   without a real ASR/TTS client and durable recorder.
5. **Deployment.** The worker is not in any GitHub Actions deploy inventory
   and the staging Cloud Run template has three unfilled placeholders
   (`SERVICE_ACCOUNT_PLACEHOLDER`, `IMAGE_PLACEHOLDER`,
   `CONTROL_PLANE_API_ORIGIN_PLACEHOLDER`,
   `infra/gcp/staging/voice-media-worker-service.yaml:24,26,47`). It also
   needs `VOICE_MEDIA_INTERNAL_KEY` (and `apps/api`'s matching client config,
   which does not exist yet either -- see §1 "Worker-to-API wiring") added
   before go-live now that §2.1 enforces it in strict environments.
6. **`apps/api` has no client for this worker at all.** Something must
   eventually call `/sessions` and the WS endpoint with the configured
   internal key once a real pipeline exists; today nothing in `apps/api`
   does.

None of (1)-(6) can be closed by writing more fixture code in this worker; they
require either an external decision/account, a dependency on another task's
in-progress deliverable, or deployment/ops work outside this task's write
scope.

## 4. Executed validation (same SHA as handoff)

- `pnpm --filter @drts/voice-media-worker typecheck` -- clean.
- `pnpm --filter @drts/voice-media-worker lint` -- clean (`eslint src --max-warnings=0`).
- `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002` -- 23 passed
  (3 files): internal-key auth (strict/non-strict, rotation, malformed
  headers), caller/session authorization and body-size limits on the live
  HTTP server (including a real WS upgrade handshake over a socket), WS frame
  size limits.
- `pnpm exec vitest run tests/integration/uv-exec-023.integration.test.ts` --
  4 passed, confirming the pre-existing drain/capacity/readiness integration
  test is unaffected by the new auth/readiness gates (it runs in a non-strict
  test environment and never exercises the now-authenticated routes directly).
- Root `tsc -p tsconfig.json --noEmit` (`pnpm run typecheck:root`): no errors
  attributable to this task's files. The run surfaces pre-existing,
  unrelated `ApiClient` duplicate-declaration errors in
  `tests/unit/fleet-partner-list-envelope.test.ts` and
  `tests/unit/system-remediation/sr-admin-verify-001/fleet-lists.test.ts`
  that reference a *different* concurrent worktree's `packages/api-client`
  path (`.../gemini-audit-dependency-gates-20261002/...`) -- a pre-existing
  cross-worktree TypeScript module-identity artifact on this shared VM,
  unrelated to and not touched by this task's changes (confirmed via
  `git status --porcelain`, which shows only `apps/voice-media-worker/**` and
  `tests/unit/audit-voice-runtime-20261002/**` as modified/added).

`same_sha_review_ci`: candidate SHA and branch are recorded via the task
lifecycle at handoff; hosted CI and review run against that SHA per the
normal candidate lifecycle, not asserted here.
