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

| Surface                                           | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTI (telephony vendor)                            | **Undecided.** No vendor has been selected (SD §3.3 "未決標"). Only a fixed-fixture `sandbox` adapter and a fail-closed "unconfigured" slot exist; the adapter file is an intentional standalone scaffold not wired into any controller/route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `apps/api/src/modules/callcenter/voice-cti.adapter.ts:7-21` (scaffold/ownership note), `:394-443` (`SandboxVoiceCtiProviderAdapter`, `isProductionCapable` hard-coded `false`), `:519-540` (`createUnconfiguredVoiceCtiProvider`, fails closed with `VOICE_CTI_PROVIDER_NOT_CONFIGURED`). Wiring this adapter into a real route is explicitly owned by UV-EXEC-010, not this task.                                                                                                                                                                                                                                                                                                                                                                                                     |
| ASR/TTS (TWM)                                     | **Reference route, not an awarded vendor; wire protocol documented; a real network client now exists.** SD §92 lists "TWM＋文字 LLM" as "本版參考路線；未決標" (this version's reference route; not yet awarded) and SD §48 states procurement is still decided by the full unattended-taxi evaluation; SA §312 states the candidate architectures table "沒有採購或效果優勝結論" (no procurement or performance-winner conclusion). The original version of this evidence document incorrectly called TWM an "accepted vendor" based only on staging reserving secret _names_ for it (`infra/gcp/staging/voice-media-worker-service.yaml:48-57`) -- reserved names are not a procurement decision and are corrected here. The exact wire protocol (login, access-info, synthesize paths) is documented in source per SD §11 regardless of procurement status, and a real HTTP/WebSocket client implementing those documented paths (`TwmAsrNetworkAdapter`, `TwmTtsNetworkAdapter`) is now implemented in this task, with its request/response composition and the protocol's single-use-ticket/180-ready-gate/monotonic-revision invariants unit-verified against a mocked transport (never a live network call). `isProductionCapable` defaults to `false` on both and must stay `false` until a verified TWM account exists (UV-EXEC-027/028) -- a working client class is necessary but not sufficient for that attestation. The original `TwmAsrFixtureAdapter`/`TwmTtsFixtureAdapter` (zero I/O, in-memory fixtures) are unchanged and remain available for non-production composition. **Round 3 (§8 R6):** the client's decoding of the documented wire protocol (`final` as numeric `0`/`1`, SD §11.1 point 5; the literal text `EOS` on audio end, point 6) is now correct -- round 2 found it compared `final` against a JSON boolean and sent a JSON `EOS` envelope. **Round 3 (§8 R4):** a real per-session composition (`session-composer.ts` + `provider-composition.ts`) now actually constructs and calls these classes from the running worker; see §8 for what that does and does not close. | SD `docs/02-architecture/phase1-unattended-voice-booking-sd-20260906.md:48,92`; SA `docs/02-architecture/phase1-unattended-voice-booking-sa-20260906.md:312`. `apps/voice-media-worker/src/providers/twm/twm-adapter.ts:47-55` (`TWM_PROTOCOL_FIXTURE`), `:70-186`/`:207-261` (unchanged fixtures). `apps/voice-media-worker/src/providers/twm/twm-network-client.ts` (`TwmAsrNetworkAdapter`, `TwmTtsNetworkAdapter`, real login/access-info/synthesize HTTP calls and a real WebSocket streaming session, injectable transport). `tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` (9 tests: request composition, header/auth, 401 re-login-and-retry, ticket single-use, 180 gate, frame-size cap, monotonic-revision dedupe -- all against a mocked transport). |
| Native speech-to-speech (OpenAI Realtime)         | **Candidate, not accepted.** Explicitly documented as a candidate pending UV-EXEC-027/028 account/PSTN gating; `connect()` throws `voice_fixture_forbidden` if ever asked to run in production mode.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `apps/voice-media-worker/src/providers/native-voice/native-voice-adapter.ts:56-67` (class doc), `:99-114` (`connect()` fail-closed).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Recording durable storage (`RecorderObjectStore`) | **No production implementation anywhere in the repo.** Only the interface and its invariant checks (`validateSegment`, `verifyRecordedObject`) exist; `MediaRecordingAdapter` requires a concrete `RecorderObjectStore` and none is ever constructed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `apps/voice-media-worker/src/recording/sealed-recorder.ts:37-63` (interface), `apps/voice-media-worker/src/recording/media-recording-adapter.ts:48-54` (constructor requires it). Repo-wide search for a GCS/S3-backed implementation of this interface returns none.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Worker-to-API wiring                              | **Not connected at all.** `apps/api` never calls any `voice-media-worker` HTTP route; the only repo references to `VOICE_MEDIA_*` in `apps/api` are an unrelated DI token name (`VOICE_MEDIA_RECORDING_ADAPTER`) in `voice-booking`, not a network client. **Round 3:** the reverse direction is also unwired: `apps/api/src/modules/cti-ivr` (the module that would authenticate real calls and issue this worker's `VoiceCallAuthorityVerifier` tokens, §8 R2) does not exist at all (`find apps/api/src/modules -maxdepth 1 -name "cti-ivr"` returns nothing), so `/sessions` and `/recording/finalize` have no legitimate caller in any environment today and correctly stay fail-closed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `apps/api/src/modules/voice-booking/voice-evidence.service.ts:31-32`, `voice-command-runner.service.ts:22,95` (DI token only). No `fetch`/`http` client to the worker exists anywhere under `apps/api`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Deploy inventory                                  | **Worker is not deployed anywhere.** No `.github/workflows/*.yml` references `voice-media-worker`; `infra/gcp/staging/voice-media-worker-service.yaml` is a template with `SERVICE_ACCOUNT_PLACEHOLDER` / `IMAGE_PLACEHOLDER` / `CONTROL_PLANE_API_ORIGIN_PLACEHOLDER` still unfilled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `infra/gcp/staging/voice-media-worker-service.yaml:24,26,47`. `grep -rl voice-media-worker .github/workflows/*.yml` returns no matches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Conclusion: no vendor in this worker's domain is actually awarded (CTI is
explicitly undecided; TWM is the documented reference route but not awarded;
native speech-to-speech is an explicit non-accepted candidate). That is a
procurement/business-decision gap, not an engineering one: where the wire
protocol for the reference route is documented in source (TWM), this task
implemented a real network client against it, unit-verified with a mocked
transport boundary -- see §2.5. Flipping an env var still cannot make any
of these production-capable, because none has a verified real account; see
§3.

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
1013 with an explicit reason) when the id is already active. Codex round-1
review (R2, see §2.2b) found this guard alone is not session _authorization_
-- it only prevents two admissions from colliding, it does not prove the
caller attaching to a given session id was ever granted it.

### 2.2b Session-authoritative admission, WS attachment, and recording

finalization (Codex round-1 reopen R1 + R2 repair)

Codex round-1 review of the first candidate (generation `b7347821bf7741b882dc2a2a08f85fb3`,
`ae016843c`) found two P1 gaps in `caller_session_authorization` that the
shared-key auth in §2.1 did not close:

- **R1**: `POST /recording/finalize` trusted the caller's own `scope`,
  `credential`, and `closureLedger`/`closure` body fields.
  `MediaRecordingAdapter.sealFinalRecording` used that request-supplied
  ledger (`new FinalRecordingManifests(this.manifests, closureLedger)`)
  instead of the trusted one injected at construction. A caller holding only
  the shared operations key could post a forged `closure` and get a `200
sealed` response with zero calls to the real trusted ledger.
- **R2**: the WS upgrade and `/sessions`/`/recording/finalize` only checked
  one global worker key. No per-session grant, scope, or epoch was issued or
  checked, so any caller holding that one key could attach to an arbitrary,
  never-admitted `sessionId` and start receiving `session.message` events --
  the collision guard in §2.2 only stops two _admissions_ from colliding, it
  is not evidence a given attacher was ever granted that session.

Fix, in `apps/voice-media-worker/src/server/session-authority.ts`
(`VoiceMediaSessionAuthority`, new) and
`apps/voice-media-worker/src/recording/media-recording-adapter.ts`:

- `MediaRecordingAdapter` no longer accepts a caller-supplied `closureLedger`
  or `credential` for trust decisions (`MediaRecordingFinalizationRequest`
  keeps both fields only as optional/ignored, for structural compatibility
  with existing non-HTTP callers such as
  `tests/unit/system-remediation/sr-recording-recovery-20260913/recording-recovery.test.ts`,
  which pass the _same_ ledger the adapter was already constructed with).
  `sealFinalRecording` always resolves closure via `this.ledger` (bound once
  at construction) and a fixed internal credential constant -- a forged
  request body cannot substitute a different ledger or identity.
- `POST /sessions` is now the only place a session's recording `scope`
  (`brandId`/`callId`/`recordingId`/`legId`) is declared, and it issues a
  single-use, random (`randomBytes(32)`), time-boxed
  (`VOICE_MEDIA_SESSION_GRANT_TTL_MS`, default 30s) grant tied to that exact
  `sessionId`, compared at consumption time with `timingSafeEqual`.
  **Correction (round 3 reopen):** this document previously (incorrectly)
  called the grant "HMAC-signed" -- the code has never signed anything; it
  stores the random token server-side and does a timing-safe string compare.
  That is corrected here; see §8 for round 3's unrelated but more serious
  finding that this grant alone still did not authenticate _who_ was
  entitled to request it. A partially-specified scope is rejected (400)
  before admission, rather than silently becoming "no scope."
- The WS upgrade no longer self-admits. It requires `?sessionId=&grant=`
  matching a session that was actually created via `POST /sessions`; it
  looks up the existing `MediaSessionRecord`, consumes the grant (fails
  closed on missing/expired/replayed/cross-session token), and only then
  completes the handshake. Only on successful consumption does the
  session's scope become "authoritative" via
  `VoiceMediaSessionAuthority.getAuthoritativeScope`.
- `POST /recording/finalize` now takes only `sessionId` and `segments` from
  the caller. It resolves `scope` exclusively from
  `getAuthoritativeScope(sessionId)` (403 if the session was never attached
  or has no bound scope) and passes it straight to the trusted-ledger-backed
  adapter -- any `scope`/`closure`/`credential` the caller supplies in the
  body is parsed but never used for the trust decision.

Regression coverage (all against the real HTTP/WS listener and the real
`MediaRecordingAdapter`/`SealedRecorder`/`FinalRecordingManifests` chain, an
in-memory `RecorderObjectStore` as the only mocked boundary):

- `tests/unit/audit-voice-runtime-20261002/media-recording-finalize-authorization.test.ts`:
  finalize on a never-attached session (403, zero ledger calls); finalize on
  a session admitted with no scope (403, zero ledger calls); a forged
  `closure`/`credential`/`closureLedger` body against an attached session
  whose _trusted_ ledger says "not yet closed" (rejected, ledger consulted
  exactly once, using the session's scope); a valid authorized finalization
  that seals for real and ignores a conflicting `scope` claim in the body;
  cross-session segments/scope against a different session id (rejected,
  the legitimate session's own finalize is unaffected).
- `tests/unit/audit-voice-runtime-20261002/media-worker-server-caller-session-authorization.test.ts`:
  WS attach to an unissued session (403, no self-admission); attach with no
  grant token (403); cross-session grant (403); expired grant (403); valid
  same-session grant succeeds, and replaying that same grant on a second
  attach is rejected (403/409 depending on whether the first channel's close
  event has already freed the session record).

### 2.3 Body and frame size limits, and exactly-once WS close/cleanup

(Codex round-1 reopen R3 repair)

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

Codex round-1 review found that this frame-limit path leaked worker
capacity: `close()` set `isClosed = true` before the underlying socket's own
`"close"` event fired, so `handleClose()` (which only emits `"close"` when
`!isClosed`) never emitted it for a server-initiated closure (size limit,
idle timeout, or local shutdown). `MediaWorkerServer`'s
`channel.on("close", ...)` handler -- the only place that deletes the
session from `activeSessions` -- therefore never ran, so a single oversized
frame permanently occupied a session slot even though the socket was torn
down. Fix: `close()` is now the single authoritative close/cleanup path and
always emits `"close"` itself exactly once (the redundant explicit emit in
the peer-initiated 0x08 close-frame handler was removed to avoid a double
emission); `handleData` and its frame loop stop processing once `isClosed`
is set, so a later frame in the same buffered chunk can no longer be
processed after closure. Regression:
`tests/unit/audit-voice-runtime-20261002/media-worker-server-frame-limit-capacity-recovery.test.ts`
drives the real worker upgrade listener with `maxConcurrentSessions=1,
maxWsFrameBytes=8`, sends a 2-byte frame header announcing a 9-byte payload
that never arrives, and asserts `server.sessionCount` returns to `0` and a
replacement session can then be admitted (not just that the channel reports
`destroyed`).

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

### 2.5 Real TWM network client (Codex round-1 reopen R4 repair)

Codex round-1 review found two problems in how the first version of this
document (and §2.5 in that version, since replaced) framed the ASR/TTS
surface:

- It called TWM an "accepted vendor" based only on staging reserving secret
  _names_ for it. SD §92/§48 and SA §312 (quoted in §1 above) are explicit
  that TWM is the documented _reference route_, with procurement undecided.
  That classification is corrected in §1.
- It treated "this VM cannot make a live call to the real TWM service" as
  equivalent to "this client's request/response composition cannot be
  implemented or unit-verified," and separately invented a dependency on
  `AUDIT-ARTIFACT-DURABILITY-20261002` for the unrelated `RecorderObjectStore`
  gap that this task's board entry does not actually declare
  (`depends_on: []`). Both were used to justify not writing code that could,
  in fact, be written and tested.

Those are two different gaps and are now separated:

- **Documented protocol**: `TWM_PROTOCOL_FIXTURE` (`twm-adapter.ts:47-55`)
  and SD §11 already fully specify the login/access-info/synthesize paths,
  ticket semantics, the 180 ready gate, and revision/EOS framing.
- **Implementation remaining (now done)**: `TwmAsrNetworkAdapter` and
  `TwmTtsNetworkAdapter`
  (`apps/voice-media-worker/src/providers/twm/twm-network-client.ts`) are
  real clients against that documented protocol -- actual HTTP login calls,
  a real WebSocket streaming session for ASR, actual bearer-token handling
  including a 401 re-login-and-retry for TTS, and the same single-use-ticket
  /180-gate/monotonic-revision invariants the fixture enforced, now applied
  to real transport traffic instead of an in-memory fixture list. The HTTP
  transport and WebSocket factory are injected, so
  `tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` (9
  tests) unit-verifies real request composition, auth headers, retry
  behavior, and all four protocol invariants against a mocked boundary --
  zero network calls leave the process, and none were made to prepare this
  evidence. `isProductionCapable` still defaults to `false` on both classes
  and is not flipped anywhere in this change.
- **Missing exact contract/decision**: which vendor is actually procured
  (SD §92/SA §312) and, independently, a verified TWM account/credentials to
  attest against (`accountCapabilityVerified`/`capabilityVerified` flags
  already model this and remain `false` in all composition in this repo).
- **Live acceptance**: connecting this client to the real TWM service,
  exercising a live call, and setting `isProductionCapable: true` with
  verified evidence all remain blocked on that account and on this VM's no
  live-network-call restriction -- see §3 item 2.

This task still did not wire a durable `RecorderObjectStore` backend or
invoke the dialogue/ASR/TTS/recording pipeline from
`media-worker-server.ts`'s WS session handling. Those remain real,
separately-scoped remaining implementation work (§3 items 3-4), not
redefined as "impossible to unit-verify" -- the honest reason they are not
done here is that a durable object-store backend needs its own storage/
bucket decision (not a declared dependency on another task), and wiring the
per-call dialogue state machine into the WS handler is substantial,
independently-scoped work this task's `write_scopes` were never asked to
cover in EXECUTION.md's phrasing ("replace fixture-only runtime composition
where a protocol is already accepted").

## 3. Remaining blockers (precise)

1. **Vendor procurement, both CTI and ASR/TTS.** CTI: SD §3.3 "未決標", no
   vendor selected. ASR/TTS: SD §92/§48 list TWM as the reference route only,
   SA §312 states the candidate table has no procurement/winner conclusion.
   No code change can close either; both require a business/procurement
   decision external to this repo. Once CTI is decided, wiring happens in
   UV-EXEC-010's scope (`voice-cti.adapter.ts:7-21`), not this task's.
2. **TWM production account and live verification.** A real client class
   implementing the documented protocol now exists (§2.5,
   `twm-network-client.ts`) and is unit-verified against a mocked transport.
   What remains blocked is a provisioned, verified TWM account/credentials
   (none exist in this environment) and the live verification itself
   (connecting this client to the real service, confirming a real call path,
   and only then setting `isProductionCapable: true` with that evidence) --
   this VM does not permit live network calls to perform that verification.
3. **Durable `RecorderObjectStore` backend.** No GCS/S3-backed implementation
   exists anywhere in the repo. This needs its own storage/bucket decision;
   this task's board entry declares no dependency on another task
   (`depends_on: []`), and none is claimed here.
4. **Dialogue/ASR/TTS/recording pipeline wiring into the running worker.**
   `dialogue-engine.ts`, `language-router.ts`, the TWM/native adapters, and
   `SealedRecorder` all exist as tested library code but are never invoked
   from `media-worker-server.ts`'s WS session handling
   (`apps/voice-media-worker/src/index.ts` only re-exports them). This is
   real, substantial remaining implementation work -- a full per-call
   state-machine integration (frame parsing, barge-in, confirmation gating)
   -- independent of whether a vendor is procured, but wiring it against
   adapters that are not yet production-capable (item 2) or backed by a
   durable recorder (item 3) would not make the worker production-capable
   either; it is sequenced after those, not blocked by a missing decision of
   its own.
5. **Deployment.** The worker is not in any GitHub Actions deploy inventory
   and the staging Cloud Run template has three unfilled placeholders
   (`SERVICE_ACCOUNT_PLACEHOLDER`, `IMAGE_PLACEHOLDER`,
   `CONTROL_PLANE_API_ORIGIN_PLACEHOLDER`,
   `infra/gcp/staging/voice-media-worker-service.yaml:24,26,47`). It also
   needs `VOICE_MEDIA_INTERNAL_KEY` and `VOICE_MEDIA_SESSION_GRANT_TTL_MS`
   (and `apps/api`'s matching client config, which does not exist yet either
   -- see §1 "Worker-to-API wiring") added before go-live now that §2.1/§2.2b
   enforce them in strict environments.
6. **`apps/api` has no client for this worker at all.** Something must
   eventually call `/sessions` (to obtain a session grant) and the WS
   endpoint (presenting that grant) with the configured internal key once a
   real pipeline exists; today nothing in `apps/api` does.

None of (1)-(6) can be closed by writing more fixture code in this worker;
they require either an external procurement/account decision, a storage
decision this task's board does not depend on, substantial independently-
scoped implementation work, or deployment/ops work outside this task's write
scope.

## 4. Executed validation (this round, same SHA as handoff)

Node v22.23.2, pnpm 10.33.0, TypeScript 5.9.3, Vitest 4.1.4, all run from
this task's worktree.

- `pnpm --filter @drts/voice-media-worker typecheck` -- clean (exit 0).
- `pnpm --filter @drts/voice-media-worker lint` (`eslint src --max-warnings=0`)
  -- clean (exit 0).
- `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002` -- **43
  passed, 0 failed (6 files)**: `internal-auth.test.ts` (unchanged from round
  1), `media-worker-server-caller-session-authorization.test.ts` (updated:
  session-grant issuance and consumption, missing/expired/replayed/
  cross-session grant denial, same-session success), `media-recording-
finalize-authorization.test.ts` (new, R1: forged-closure/forged-scope/
  cross-session denial and valid authorized sealing against the real sealing
  chain), `media-worker-server-frame-limit-capacity-recovery.test.ts` (new,
  R3: capacity recovers after a frame-limit closure), `twm-network-client.test.ts`
  (new, R4: real TWM client request composition/auth/retry/protocol
  invariants against a mocked transport), `websocket-channel-frame-limits.test.ts`
  (unchanged from round 1).
- `pnpm exec vitest run tests/unit/system-remediation/sr-recording-recovery-20260913
tests/integration/uv-exec-023.integration.test.ts
tests/integration/system-remediation/sr-recording-recovery-20260913` -- 23
  passed, 0 failed (3 files): confirms `MediaRecordingAdapter`'s narrowed
  `MediaRecordingFinalizationRequest` (credential/closureLedger now optional
  and ignored for trust, §2.2b) stays structurally and behaviorally
  compatible with this pre-existing, out-of-write-scope caller, and that the
  drain/capacity/readiness integration test remains unaffected.
- `pnpm run lint:root` (`eslint eslint.config.mjs playwright*.config.ts
vitest.config.ts tests --max-warnings=0`) -- clean (exit 0), covering all
  new/changed test files under `tests/`.
- `pnpm run typecheck:root` (root `tsc -p tsconfig.json --noEmit`): no errors
  attributable to this task's files (`git status --porcelain` shows only
  `apps/voice-media-worker/**`, `tests/unit/audit-voice-runtime-20261002/**`,
  and this document as modified/added). The run surfaces pre-existing,
  unrelated TypeScript errors from a dual Next.js version + a cross-worktree
  `ApiClient` identity mismatch (`tests/security/iam-tenant-session-revocation-e2e.test.ts`,
  `tests/unit/fleet-partner-list-envelope.test.ts`,
  `tests/unit/system-remediation/sr-admin-verify-001/fleet-lists.test.ts`),
  same category as recorded in the round-1 evidence.
- `tests/integration/uv-exec-023.integration.test.ts` and the HTTP-server
  test file were run directly above, not skipped, correcting round 1's note
  that they were not run under VM restriction.

**Environment note (not attributable to this task's code):** mid-session,
this worktree's and the canonical root's shared `node_modules` symlinks
(`typescript`, `@types/node`, and others) broke because they pointed into
`.artifacts/worktrees/auto/gemini-audit-dependency-gates-20261002`, a
sibling worktree that was removed from this VM while this task was in
progress. This is exactly the condition
`tools/development-orchestrator/bin/ensure-local-node-modules.py` exists to
detect and repair (`test_node_modules_health.py`); it was run as `repair`
against this worktree only (`CI=true pnpm install --frozen-lockfile
--prefer-offline`, scoped to this worktree's own root, not the canonical
root's shared symlink), after which all commands above passed normally. No
product/browser/DB/Compose server was started.

`same_sha_review_ci`: candidate SHA and branch are recorded via the task
lifecycle at handoff; hosted CI and review run against that SHA per the
normal candidate lifecycle, not asserted here.

## 5. Finding-to-evidence mapping (Codex round-1 reopen)

| Finding / required_acceptance                                                                                                                                                                                                                     | Source and fix location                                                                                                                                                                                                                                                             | Round-1 candidate -> this round                                                                                                                                                                                                                        | Command / evidence                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| R1 (P1, `caller_session_authorization`): forged `closure`/`credential`/`closureLedger` body sealed a recording with zero trusted-ledger calls                                                                                                     | `media-recording-adapter.ts` (`sealFinalRecording` now only uses the constructor-injected ledger/credential); `media-worker-server.ts` `/recording/finalize` (scope resolved from `VoiceMediaSessionAuthority`, not the body)                                                       | Repro on `ae016843c` returned `200 sealed`, `trustedLedgerCalls=0` -> this round's `media-recording-finalize-authorization.test.ts` reproduces the same forged-body shape and asserts non-200 with the trusted ledger consulted exactly once           | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/media-recording-finalize-authorization.test.ts` -- 5/5 passed             |
| R2 (P1, `caller_session_authorization`): one global key admitted an arbitrary, unissued `sessionId` onto the WS                                                                                                                                   | `session-authority.ts` (new `VoiceMediaSessionAuthority`); `media-worker-server.ts` `/sessions` issues a single-use grant, WS upgrade consumes it, no self-admission                                                                                                                | Repro on `ae016843c` admitted `sessionId=unissued-session` with only the internal key -> this round's WS tests require a prior `POST /sessions` grant for every attach                                                                                 | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/media-worker-server-caller-session-authorization.test.ts` -- 16/16 passed |
| R3 (P2): frame-limit closure leaked a session slot (`sessionCount` never returned to 0)                                                                                                                                                           | `websocket-channel.ts` (`close()` is the single authoritative close/cleanup path and always emits `"close"`; frame loop stops once closed)                                                                                                                                          | Repro: `maxConcurrentSessions=1, maxWsFrameBytes=8`, oversized frame header, `sessionCount` stayed 1 and a replacement admission threw `MEDIA_WORKER_CAPACITY_EXCEEDED` -> this round asserts `sessionCount` returns to 0 and the replacement succeeds | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/media-worker-server-frame-limit-capacity-recovery.test.ts` -- 1/1 passed  |
| R4 (P2, `approved_runtime_provider_paths` / `remaining_external_blockers_precise`): doc called TWM "accepted" against SD §92/SA §312, and conflated "can't call live" with "can't implement/verify"; invented an undeclared cross-task dependency | §1 ASR/TTS row and conclusion corrected to "reference route, not awarded"; §2.5 separates documented protocol / missing decision / implementation (now done: `twm-network-client.ts`) / live acceptance; §3 item 3 no longer claims a dependency this task's board does not declare | N/A (documentation + new implementation, not a behavioral regression)                                                                                                                                                                                  | This document §1/§2.5/§3; `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- 9/9 passed       |
| `remaining_external_blockers_precise`                                                                                                                                                                                                             | §3 (1)-(6), each naming the exact external decision/account/storage/ops gap, with no implementation obligation substituted by blocker prose                                                                                                                                         | --                                                                                                                                                                                                                                                     | §3 above                                                                                                                                |
| `same_sha_review_ci`                                                                                                                                                                                                                              | Candidate lifecycle (`handoff`/`approve`/GitHub bus)                                                                                                                                                                                                                                | Round-1 candidate `ae016843c` was reopened before a same-SHA review+CI pass completed                                                                                                                                                                  | New candidate SHA from this round's commit, pending review/CI per the normal lifecycle                                                  |

## 6. Round-2 CI repair (hosted typecheck break on `641e2381742f`)

Hosted CI on candidate `641e2381742fbd4d76df7380b778535eb4435ef6` (PR #2282,
run `37085121032`, job "Product smoke acceptance") failed at the `Typecheck`
step: `tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts:44`
-- `TS2322: Type '() => Promise<ArrayBuffer | SharedArrayBuffer>' is not
assignable to type '() => Promise<ArrayBuffer>'`. The mocked
`audioResponse().arrayBuffer()` returned `bytes.buffer.slice(...)`, which is
typed `ArrayBufferLike` (`ArrayBuffer | SharedArrayBuffer`) because
`Uint8Array#buffer` is not narrowed to a concrete `ArrayBuffer`, while
`TwmHttpResponse.arrayBuffer()` declares `Promise<ArrayBuffer>`
(`apps/voice-media-worker/src/providers/twm/twm-network-client.ts:36`). This
was a test-only type error -- no change to `twm-network-client.ts` or any
other production file was needed.

Fix, new commit `8bd818874` (not an amend of `641e2381742f`, per the
candidate-lifecycle rule that a reviewed/CI'd candidate is not rewritten):
`audioResponse()` now allocates a fresh `ArrayBuffer` of the same length and
copies `bytes` into it via `new Uint8Array(buffer).set(bytes)`, which types
concretely as `ArrayBuffer`. Same byte content delivered to the adapter under
test; no behavioral change to the test's assertions.

Validation on `8bd818874` (Node v22.23.2, pnpm 10.33.0, TypeScript 5.9.3,
Vitest 4.1.4, this task's worktree):

- `pnpm --filter @drts/voice-media-worker typecheck` -- clean (exit 0).
- `pnpm run typecheck:root` (`tsc -p tsconfig.json --noEmit`) -- the
  `twm-network-client.test.ts` `TS2322` is gone. The only remaining errors
  are `tests/unit/fleet-partner-list-envelope.test.ts` and
  `tests/unit/system-remediation/sr-admin-verify-001/fleet-lists.test.ts`
  reporting two non-identical `ApiClient` types, traced to this worktree's
  `apps/platform-admin-web/node_modules/@drts/api-client` being a stale pnpm
  symlink into a concurrent sibling worktree
  (`.artifacts/worktrees/auto/gemini-audit-dependency-gates-20261002/packages/api-client`)
  instead of this worktree's own `packages/api-client`. This is a local
  dev-VM node_modules artifact, not a source change in this task's
  `write_scopes`, and it is not present in the hosted CI run: the CI log for
  run `37085121032` shows `tsc` emitting exactly the one
  `twm-network-client.test.ts` error before failing, with no
  `fleet-partner-list-envelope`/`fleet-lists` errors, confirming a clean CI
  checkout does not have this cross-worktree symlink.
- `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002` -- 43
  passed, 0 failed (6 files, same counts as round 2's §4).
- `pnpm run lint:root` -- clean (exit 0).

`same_sha_review_ci`: candidate SHA is now `8bd818874` (branch
`claude2/audit-voice-runtime-20261002`, pushed normally, not force-pushed,
on top of `641e2381742f`). Hosted review and CI must run fresh against this
SHA per the normal candidate lifecycle; the round-1 Codex findings (R1-R4,
§2.2b/§2.3/§2.5) and their regression tests are unchanged from `641e2381742f`
-- only this one test-file type annotation moved.

**Correction (round 3 reopen):** a further commit in this same round,
`60e70da72f28dac219daa932660dbbb407697bb0` ("record round-2 CI repair
evidence"), was pushed on top of `8bd818874` and became the actual locked
candidate Codex reviewed in round 2 (generation `31ec233887144340a3a63d736045c85c`,
PR #2282) -- not `8bd818874` as the line above states. That round-2 review
is recorded in §7 below; this line is left as originally written (an
accurate statement of the state immediately after `8bd818874`) rather than
rewritten, per the "preserve history" rule -- the correction is this note.

## 7. Round-2 review (reopen on `641e2381742f` / `60e70da72f28`, Codex, generation `31ec233887144340a3a63d736045c85c`, PR #2282)

Preserved here because it was never previously recorded in this document
(round-3 finding, corrected now): Codex's round-2 review retained R1/R3 as
fixed and the R7 test-only CI type fix (§6) as correct, but found four
findings -- reusing the R2/R4/R5/R6 labels for _new_, distinct issues, not
the same ones §5 already closed -- that persisted unchanged across
`ae016843c` -> `641e2381742f` -> `60e70da72f28`:

- **R2 (P1, `caller_session_authorization`)**: `POST /sessions` authenticated
  only the shared operations key and minted a grant for whatever
  `sessionId`/`scope` the _caller's own request body_ declared --
  `parseRecordingScope` checked string shape, not ownership. Any holder of
  the one shared key could admit a session under an arbitrary brand/call/
  recording id it was never actually authorized for, and `/recording/
finalize` had no capability check beyond "some scope is bound to this
  session id." Closing a session and reusing its id for an unrelated call
  did not fence the old call's recording authority either (finalize with
  the stale scope still returned `200 sealed`).
- **R4 (P2, `approved_runtime_provider_paths` / `remaining_external_blockers_precise`)**:
  `server.ts` still constructed an empty `MediaWorkerServer` with no
  `session.message` consumer at all -- `TwmAsrNetworkAdapter`/
  `TwmTtsNetworkAdapter` (§2.5) had no runtime caller anywhere, so no
  configured ASR/TTS/dialogue/recording composition existed despite the
  worker's full write scope.
- **R5 (P2, `caller_session_authorization`, second consecutive failure)**:
  `admitSession` reserved an `activeSessions` slot at `POST /sessions` time,
  but nothing freed it if the issued grant was never consumed -- an expired
  grant, a session that never attempted to attach, or a failed WS handshake
  all leaked worker capacity forever (distinct from the already-fixed R3,
  which was about a frame-size-limit _closure_ never clearing its slot).
- **R6 (P2, `approved_runtime_provider_paths`, second consecutive failure)**:
  `twm-network-client.ts` compared the wire protocol's documented numeric
  `final` (`0`/`1`, SD §11.1 point 5) against the JSON boolean `true`, so
  every provider message was reported `final: false` and a stale revision
  for an already-finalized segment was never rejected either; `endAudio()`
  sent a JSON envelope (`{"frame":"EOS"}`) instead of the documented literal
  text `EOS` (SD §11.1 point 6).

Required acceptance was assessed failing: `caller_session_authorization`
(R2/R5), `approved_runtime_provider_paths` (R4/R6), `remaining_external_
blockers_precise` (R4's implementation deferred, R2/R4/R5/R6 omitted from
this document at the time), `same_sha_review_ci` (review rejected). Round 3
(§8) repairs all four.

## 8. Round-3 repair: caller/session authority, capacity-leak fencing, TWM wire format, and real ASR/TTS/session composition

| Finding / required_acceptance                                                                                                                                                                                                                         | Source and fix location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Round-2 candidate -> this round                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Command / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Unverified / limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2 (P1, `caller_session_authorization`): `POST /sessions` minted a grant from caller-declared `sessionId`/`scope`; finalize had no capability check beyond "some scope is bound"; closing+reusing a session id did not fence the old call's authority | New `apps/voice-media-worker/src/server/call-authority.ts` (`VoiceCallAuthorityVerifier`/`VoiceCallAuthorityClaims` port); `session-authority.ts` now binds `principalId`/`epoch` (`issueGrant` line 77-115, fences any strictly-lower-or-equal epoch and immediately supersedes an existing attached/pending entry for the same session id, `VOICE_MEDIA_SESSION_EPOCH_STALE`); `media-worker-server.ts` `/sessions` (line 561-682: requires and verifies `callAuthorityToken`, derives `sessionId`/`scope`/`principalId`/`epoch` only from verified claims, body `sessionId`/`scope` ignored) and `/recording/finalize` (line 684-834: re-verifies a _second_, independently-presented token resolves to the exact same `sessionId`+`epoch`+`principalId` currently attached, not merely that some scope exists; releases authority only after a successful seal)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | On `60e70da72f28`, admission trusted body claims and finalize allowed a reissued session id's new call to seal under the _old_ call's scope (`brand-B`/`call-B`) before the new epoch ever attached. This round: admission requires a verified call-authority token and ignores body `sessionId`/`scope` entirely; a session closed then reissued for a new call immediately fences the old epoch's finalize authority before the new grant is ever attached                                                                                                                                                                                                                                                                                                                                                                                                 | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/call-authority-session-binding.test.ts tests/unit/audit-voice-runtime-20261002/media-recording-finalize-authorization.test.ts tests/unit/audit-voice-runtime-20261002/media-worker-server-caller-session-authorization.test.ts` -- 31/31 passed (operations-key-only denial, unknown/forged/expired/revoked/replayed token, cross-session, cross-principal-at-finalize, old-epoch fencing before attach, legitimate same-session success) | No production `VoiceCallAuthorityVerifier` implementation is wired anywhere (see §3 item 6a below) -- `apps/api/src/modules/cti-ivr`, which would issue these tokens from the real call/line authority, does not exist. `server.ts` therefore leaves it unconfigured, so `/sessions` and `/recording/finalize` correctly fail closed (503) in every environment today; this is a real, external, precisely-named blocker, not a gap this round's code could close alone (see also the round-2 review's own note that any such wiring needs Supervisor-coordinated scope, since the closest existing authority source, `VoiceLineScopeService`, is audience-scoped to `voice-tool-gateway`, not media)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| R5 (P2, `caller_session_authorization`): an expired/never-attached/failed-handshake grant leaked the `activeSessions` reservation forever                                                                                                             | `session-authority.ts` `issueGrant` schedules a TTL timer (line 102-104) and emits `grant.expired` (line 117-121) if the grant is never consumed; `media-worker-server.ts` constructor (line 123-135) frees the matching reservation only when no channel ever attached; `handleUpgrade` (line 908-921) now checks `Sec-WebSocket-Key` presence _before_ consuming the single-use grant, so a transport-level handshake failure does not burn it (previously, a failed handshake moved the grant from "pending" -- TTL-reaped -- to "attached" -- held until explicit close/finalize -- permanently, since `consumeGrant` ran first and already succeeded)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | On `60e70da72f28`, `maxConcurrentSessions=1`, an expired/never-attached/failed-handshake grant left `sessionCount=1` and a replacement admission returned `503 MEDIA_WORKER_CAPACITY_EXCEEDED` forever. This round: the same scenarios free the slot once the grant's TTL elapses, and a replacement admission then succeeds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/session-grant-expiry-capacity-recovery.test.ts` -- 3/3 passed (never-attach, failed-handshake-then-expiry, and a control case proving an already-_attached_ session survives past its original grant TTL unaffected)                                                                                                                                                                                                                      | None for this finding's own scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| R6 (P2, `approved_runtime_provider_paths`): `final` compared against JSON `true` instead of the documented numeric `0`/`1`; `endAudio()` sent a JSON envelope instead of the literal text `EOS`                                                       | `twm-network-client.ts` line 426 (`const isFinal = message.final === 1`, used for both `finalizedSegments` and the returned `result.final`) and line 474 (`this.socket.send("EOS")`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | On `60e70da72f28`, a provider message with `final:1` was reported `final:false` (so `finalizedSegments` stayed empty and a later revision for the same segment was incorrectly accepted/delivered), and `endAudio()` sent `'{"frame":"EOS"}'`. This round: `final:1` is correctly finalized and immutable (a later revision for that segment is dropped, proven by the _next_ distinct segment's transcribe call returning its own data rather than the dropped one), and `endAudio()` sends the literal `'EOS'`                                                                                                                                                                                                                                                                                                                                             | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- 11/11 passed (existing 9 fixtures updated from JSON-boolean to the documented numeric `final`, plus 2 new regression tests for this finding)                                                                                                                                                                                                                                                               | Still bounded by the same unverified-account limits already recorded in §2.5/§3 item 2 -- this is a wire-format correctness fix to the existing mocked-transport unit tests, not a live-provider verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R4 (P2, `approved_runtime_provider_paths` / `remaining_external_blockers_precise`): no configured ASR/TTS/dialogue/recording composition existed; `server.ts` built an empty worker with no `session.message` consumer                                | New `apps/voice-media-worker/src/server/session-composer.ts` (`VoiceSessionComposer`: binds a real `VoiceMediaWorkerSession` per attached session id to the actual WS channel -- binary frames to `transcribeChunk`, JSON control frames to speech/DTMF/TTS methods, synthesized audio written back as binary frames); new `apps/voice-media-worker/src/server/provider-composition.ts` (`composeVoiceMediaProviders`: builds the per-session ASR/TTS provider factory from environment, "twm" resolves to a real `TwmAsrNetworkAdapter`/`TwmTtsNetworkAdapter` instance -- fresh per session, never a shared singleton -- only when `TWM_ACCOUNT_ID`/`TWM_ACCOUNT_SECRET`/`TWM_API_BASE_URL` are configured, else the explicit fail-closed "unconfigured" adapter; `productionCapable` hardcoded `false` regardless, and a strict environment fails closed for "twm" before constructing any instance at all); `media-worker-server.ts` `handleUpgrade` (line 960-977: calls `sessionComposer.attach()` once a channel completes, closing the channel with an explicit error frame -- never crashing the worker -- if the provider factory itself fails closed); `server.ts` now wires both into the real `MediaWorkerServer` it starts, replacing the previous empty construction, and logs the exact remaining blockers (no call-authority verifier, no TWM account) on startup | On `60e70da72f28`, `server.ts:5` constructed `new MediaWorkerServer()` with nothing else; no code path anywhere consumed `session.message` or called `TwmAsrNetworkAdapter`/`TwmTtsNetworkAdapter`/`VoiceMediaWorkerSession` at runtime. This round: an attached session's binary audio frames are actually transcribed through the real session harness and the ASR event is written back over the real WebSocket; a `tts.synthesize` control frame actually calls the real TTS adapter and the synthesized audio is written back as a real binary frame -- exercised end to end over an actual HTTP/WS upgrade, with only the ASR/TTS _speech engine_ itself (no real vendor account exists, see below) as a deterministic test double, exactly like the existing `SandboxSpeechToTextAdapter`/`SandboxTextToSpeechAdapter` already are in production code | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/session-composer.test.ts tests/unit/audit-voice-runtime-20261002/provider-composition.test.ts` -- 13/13 passed                                                                                                                                                                                                                                                                                                                            | This closes the _structural_ "nothing is wired" gap, not the full product dialogue/booking pipeline: `dialogue-engine.ts`/`intent-router.ts`/`confirmation-controller.ts`/`handoff-audio-coordinator.ts` are still never invoked from this composition (that is the call-turn _business logic_, a substantial independently-scoped integration -- see §3 item 4, unchanged). No durable `RecorderObjectStore` is wired either (§3 item 3, unchanged) -- `server.ts` leaves `recordingAdapter` unset, so `/recording/finalize` correctly keeps failing closed (503) rather than claiming a storage backend that does not exist. No real TWM account/credentials exist in any environment: `TWM_ACCOUNT_ID`/`TWM_ACCOUNT_SECRET`/`TWM_API_BASE_URL` are a new configuration seam this round defines (`provider-composition.ts:105-107`) and are not set by any `.github/workflows/*.yml`, `infra/gcp/**`, or other deployment config anywhere in the repo (confirmed: `grep -rln "TWM_ACCOUNT\|TWM_API" .github infra` returns no matches outside this task's own new source file and this document), so `productionCapable` stays `false` and no live network call was ever made to produce this evidence |

Full regression for this round (Node v22.23.2, pnpm 10.33.0, TypeScript
5.9.3, Vitest 4.1.4, this task's worktree):

- `pnpm --filter @drts/voice-media-worker typecheck` -- clean (exit 0).
- `pnpm --filter @drts/voice-media-worker lint` (`eslint src --max-warnings=0`) -- clean (exit 0).
- `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002` -- **71
  passed, 0 failed (10 files)**, run twice consecutively to confirm no
  flakiness: the six round-1/round-2 files (updated to require a
  call-authority token at every `/sessions`/`/recording/finalize` call, via
  a new shared `tests/unit/audit-voice-runtime-20261002/fake-call-authority.ts`
  test double of exactly the `VoiceCallAuthorityVerifier` boundary -- never
  the worker's own verification/binding logic) plus four new files:
  `call-authority-session-binding.test.ts`, `session-grant-expiry-capacity-
recovery.test.ts`, `session-composer.test.ts`, `provider-composition.test.ts`.
- `pnpm run typecheck:root` (`tsc -p tsconfig.json --noEmit`) -- clean (exit
  0, zero errors anywhere in the repo). The round-1/round-2 evidence's
  cross-worktree `ApiClient`/contracts-dist symlink breakage (§4, §6) was
  present again at the start of this round (this worktree's and
  `packages/contracts`' `node_modules` pointed into the since-removed
  sibling worktree `gemini-audit-dependency-gates-20261002`) and was
  repaired the same way: a private `pnpm install --frozen-lockfile
--prefer-offline` scoped to this worktree only, never touching the
  canonical root's shared `node_modules`. After the repair, `typecheck:root`
  is fully clean -- not merely "no errors attributable to this task" as in
  round 1/2, but zero errors at all.
- `pnpm run lint:root` (`eslint eslint.config.mjs playwright*.config.ts vitest.config.ts tests --max-warnings=0`) -- clean (exit 0), covering all new/changed test files under `tests/`.
- `git diff --check` against `60e70da72f28` -- exit 0.

`same_sha_review_ci`: candidate SHA and branch are recorded via the task
lifecycle at handoff; hosted CI and review run against that SHA per the
normal candidate lifecycle, not asserted here. The locked round-2 candidate
`60e70da72f28dac219daa932660dbbb407697bb0` is superseded by this round; do
not mistake this round's fixes for a re-review of an unchanged candidate.

### Remaining blockers, restated precisely for this round

In addition to §3 items 1/3/5 (vendor procurement, durable recording
storage, deployment), unchanged:

6a. **No call-authority issuer exists.** `VoiceCallAuthorityVerifier` (new,
§8 R2) defines the worker-side boundary a trusted call/line authority
must satisfy, but no implementation of it exists anywhere -- the module
that would issue/verify these tokens from the real, authenticated
call/line record is `apps/api/src/modules/cti-ivr`, which **does not
exist** (confirmed: `find apps/api/src/modules -maxdepth 1 -name
    "cti-ivr"` returns nothing). The closest existing authority source,
`VoiceLineScopeService`
(`apps/api/src/modules/voice-booking/voice-line-scope.service.ts:41`),
issues tokens audienced for `voice-tool-gateway`, not media -- reusing
it directly for this worker without a dedicated audience/claims review
would be exactly the kind of cross-module authority reuse the round-2
review flagged as needing Supervisor coordination before any owner
continues, since it touches another task's module boundary
(`write_scopes` here cover `apps/voice-media-worker/` and
`apps/api/src/modules/cti-ivr/`, not `voice-booking/`). Until that
issuer exists and is wired, `server.ts` leaves `callAuthorityVerifier`
unconfigured by design, so `/sessions` and `/recording/finalize`
correctly return `503 VOICE_MEDIA_CALL_AUTHORITY_NOT_CONFIGURED` for
every caller in every environment -- this is the fail-closed posture
§8's R2 fix requires, not an oversight.
6b. **Dialogue/booking business logic is still not invoked.** §8's R4 fix
wires the _media mechanics_ (ASR transcription in, TTS synthesis out,
the real event stream) onto the real WebSocket; it does not invoke
`dialogue-engine.ts`/`intent-router.ts`/`confirmation-controller.ts`/
`handoff-audio-coordinator.ts`. Those remain real, substantial,
independently-scoped integration work -- deciding what to say and when
a call ends is a different layer (the not-yet-existing CTI/IVR
orchestration from 6a) driving this worker's control channel, not this
worker deciding for itself. This is unchanged from §3 item 4, restated
here because R4's fix narrows exactly how much of that item remains.

## 9. Round-4 review (reopen on `c11abdd42a5e`, Codex, generation `abdb02e851f14dfba5746290012ed81b`, PR #2282)

Preserved here (this record is itself the round-4 reopen; the original
read-only dispatch that produced it could not edit this document, so owner
Claude2 appends it now, on the next unlocked revision, per Guide §0.7).
Codex's round-4 review confirmed R1/R2(partial)/R3/R4(structural)/R5(partial)/
R6/R7 as repaired per §8 and the round-3 CI evidence, but found six
findings -- two persistent (R2, R5, reusing their round-3 labels for the
_same_ underlying defects, not new ones) and four new (R8-R11) surfaced by
round 3's newly-wired real session composition:

- **R2 (P1, `caller_session_authorization`, persistent)**: `/recording/
finalize` checked only that the presented token's bound session/principal/
  epoch matched the attached session, then used the _already-attached_
  scope for sealing -- it never checked the finalize-specific token's own
  `claims.scope` against that attached resource. A token resolving to the
  right session/epoch/principal but with no recording scope, or a scope for
  a different brand/call/recording/leg, still sealed the attached
  recording.
- **R5 (P2, `caller_session_authorization`, persistent)**: `consumeGrant`'s
  own expired-grant branch deleted the pending record and threw without
  emitting `grant.expired` -- only the TTL timer's `handleGrantExpiry` did.
  An expired upgrade attempt that reached `consumeGrant` before the timer
  callback ran left the reservation held forever once the timer later found
  nothing to act on.
- **R8 (P2, new)**: `/recording/finalize` called `sessionAuthority.release()`
  unconditionally immediately after a successful seal, erasing the scope/
  principal/epoch an authorized retry needs even though
  `MediaRecordingAdapter.sealFinalRecording` is documented reentrant -- a
  lost first HTTP response was not safely recoverable.
- **R9 (P2, new)**: `TwmAsrNetworkAdapter.connect()` checked `this.socket`
  before two awaited HTTP calls with no in-flight guard, so concurrent first
  audio frames (normal under `VoiceSessionComposer.handleMessage`, which
  fires per inbound WS message) could each start their own login/
  access-info/WebSocket and overwrite `this.socket`.
- **R10 (P2, new)**: ASR results were only ever delivered as the return
  value of the `transcribe()` call that triggered them, pulled one-per-call
  from a buffer/waiter queue -- a later accepted revision for the same
  segment (e.g. a final revision arriving after the audio chunk it belongs
  to was already sent, with no further audio to "poll" with) was never
  delivered.
- **R11 (P2, new)**: closing a session only ever deleted
  `VoiceSessionComposer`'s own session map entry; it never invoked the ASR
  adapter's `endAudio`/`close`. A provider connection, its waiters, and any
  billing/session resource it holds outlived the session's actual hangup/
  drain/idle closure.

Required acceptance was assessed: `caller_session_authorization` NOT met
(R2/R5 persistent); `approved_runtime_provider_paths` NOT met (R9/R10/R11);
`remaining_external_blockers_precise` not fully met (persistent-vs-new
framing corrected per the task brief); `same_sha_review_ci` not met (review
rejected despite green same-SHA hosted CI). §10 repairs all six.

## 10. Round-4 repair: finalize resource authorization, grant-expiry race unification, authorized retry, and ASR connection/streaming/cleanup

| Finding / required_acceptance                       | Source and fix location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Round-3 candidate -> this round                                                                                                                                                                                                                                                                                                                                                                                         | Command / evidence                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2 (P1, `caller_session_authorization`, persistent) | `session-authority.ts`: new exported `recordingScopesMatch()` field-by-field comparator; `media-worker-server.ts` `/recording/finalize` (after the existing session/epoch/principal check) now also requires `claims.scope` to be defined and `recordingScopesMatch(claims.scope, scope)` to hold, denying with `VOICE_MEDIA_CALL_AUTHORITY_SCOPE_MISMATCH` otherwise                                                                                                                                                                                                                                                                                                                      | On `c11abdd42a5e`, a same-session/epoch/principal token with no scope, or a scope for a different brand/call/recording/leg, still sealed the attached recording under the already-bound scope. This round denies both cases before the ledger is ever consulted                                                                                                                                                         | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/media-recording-finalize-authorization.test.ts` -- 12/12 passed, including the two new R2 regressions (`VOICE_MEDIA_CALL_AUTHORITY_SCOPE_MISMATCH`, zero ledger calls)                                                                                                                                      |
| R5 (P2, `caller_session_authorization`, persistent) | `session-authority.ts`: `consumeGrant`'s expired branch now calls `handleGrantExpiry(sessionId, record.epoch)` -- the same single cleanup path the TTL timer uses -- instead of deleting the record directly; `handleGrantExpiry` itself now also clears the timer defensively                                                                                                                                                                                                                                                                                                                                                                                                             | On `c11abdd42a5e`, an expired grant observed first via `consumeGrant` (upgrade path) never emitted `grant.expired`, so `MediaWorkerServer`'s capacity-reaper listener never freed the reservation. This round emits it from whichever path observes the expiry first, exactly once                                                                                                                                      | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/session-authority-grant-expiry-race.test.ts` -- 3/3 passed (fake-timer deterministic reproduction: expiry observed via `consumeGrant` before the TTL timer fires; normal timer-first path; a superseded epoch's replayed token cannot evict a newer epoch's live grant)                                     |
| R8 (P2, new)                                        | `session-authority.ts`: new `completed` map and `markCompleted(sessionId, epoch)` (moves the attached record instead of deleting it, bounded at 1000 entries, epoch-checked so an in-flight older seal cannot clobber a newer epoch); `getAuthoritativeScope`/`Epoch`/`Principal` now resolve from `attached ?? completed`; `issueGrant`'s epoch-fencing block and `release()` both also clear `completed`. `media-worker-server.ts` `/recording/finalize` calls `markCompleted` instead of `release` after a successful seal                                                                                                                                                              | On `c11abdd42a5e`, an identical authorized retry after a successful seal failed closed with `VOICE_MEDIA_SESSION_SCOPE_UNKNOWN` even though the manifest was durable. This round's retry resolves the same scope/epoch/principal and reaches `MediaRecordingAdapter`'s own reentrant cache, returning the identical `manifestRef`; a retry after the session id is reissued at a higher epoch is still correctly denied | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/media-recording-finalize-authorization.test.ts` -- includes "allows an identical authorized retry..." (asserts `retry.body.manifestRef` equals the first seal's) and "rejects a finalize retry presenting a now-superseded (lower) epoch..." (post-reissue retry denied, no additional ledger consultation) |
| R9 (P2, new)                                        | `twm-network-client.ts`: `TwmAsrNetworkAdapter.connect()` is now single-flight -- a `connectPromise` field is set on first call and returned to every concurrent caller, resolved by a new private `performConnect()` (the prior `connect()` body)                                                                                                                                                                                                                                                                                                                                                                                                                                         | On `c11abdd42a5e`, two frames arriving before the first connection attempt resolved produced two logins/access-info calls and two sockets. This round: concurrent `connect()` calls share one in-flight attempt -- exactly one login, one access-info call, one socket                                                                                                                                                  | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- 13/13 passed, including the new single-flight regression                                                                                                                                                                                                                     |
| R10 (P2, new)                                       | `media-provider.ts`: new optional `onResult`/`endAudio`/`close` on `VoiceSpeechToTextAdapter`. `twm-network-client.ts`: `handleMessage` now pushes every accepted result to registered `onResult` listeners immediately, in addition to (unchanged) feeding the existing waiter/buffer queue `transcribe()`'s return relies on; new public `onResult()` registers a listener. `media-session.ts`: `VoiceMediaWorkerSession` registers a push listener at construction when the ASR adapter implements `onResult`, emitting `asr.segment.partial`/`final` as soon as each result arrives; `transcribeChunk` skips its own emission in that case to avoid double-reporting the same revision | On `c11abdd42a5e`, a later revision for an already-requested segment (e.g. a final revision with no further audio sent) sat in `bufferedResults` and was never delivered. This round delivers it via the push channel the instant it is decoded, independent of further audio                                                                                                                                           | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- includes "delivers a later revision for the same segment via onResult with no further audio chunk sent"                                                                                                                                                                      |
| R11 (P2, new)                                       | `media-session.ts`: new `VoiceMediaWorkerSession.closeAsr()` (`asrAdapter.endAudio?.()` then `asrAdapter.close?.()`, idempotent). `session-composer.ts`: the channel's `"close"` handler now calls `session.closeAsr()` before deleting the composed-session map entry, guarded by `this.sessions.has(sessionId)` so a duplicate close emission cannot re-run cleanup                                                                                                                                                                                                                                                                                                                      | On `c11abdd42a5e`, closing a session only deleted the composer's `Map` entry; the ASR adapter's connection/waiters/billing resource outlived the session. This round invokes `endAudio`/`close` exactly once on every close path (normal close, drain, idle timeout, frame-limit closure -- all route through the channel's single authoritative `close()`)                                                             | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/session-composer.test.ts` -- includes "invokes the ASR adapter's endAudio/close exactly once when the channel closes" (and asserts a duplicate close emission does not double-invoke it)                                                                                                                    |

Full regression for this round (Node v22.23.2, pnpm 10.33.0, TypeScript
5.9.3, Vitest 4.1.4, this task's worktree):

- `pnpm --filter @drts/voice-media-worker typecheck` -- clean (exit 0).
- `pnpm --filter @drts/voice-media-worker lint` (`eslint src --max-warnings=0`) -- clean (exit 0).
- `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002` -- **81
  passed, 0 failed (11 files)**, run twice consecutively to confirm no
  flakiness: the ten round-1/2/3 files (one call site updated --
  `finalizeToken` in `media-recording-finalize-authorization.test.ts` now
  accepts an explicit `scope` parameter, since the new R2 check requires
  every success-path finalize token in that file to carry the exact
  attached scope, not an implicit "no scope" default) plus one new file,
  `session-authority-grant-expiry-race.test.ts`, and new test cases added
  to `media-recording-finalize-authorization.test.ts`, `twm-network-client.
test.ts`, and `session-composer.test.ts` for R2/R8/R9/R10/R11 above.
- `pnpm exec vitest run tests/unit/system-remediation/sr-recording-recovery-20260913
tests/integration/uv-exec-023.integration.test.ts
tests/integration/system-remediation/sr-recording-recovery-20260913` -- 23
  passed, 0 failed (3 files): confirms this round's `session-authority.ts`/
  `media-worker-server.ts`/`media-session.ts`/`session-composer.ts` changes
  stay compatible with these pre-existing, out-of-write-scope callers.
- `pnpm run typecheck:root` (`tsc -p tsconfig.json --noEmit`) -- clean (exit 0, zero errors anywhere in the repo).
- `pnpm run lint:root` -- clean (exit 0).
- `git diff --check c11abdd42a5e07740413743920014d2be71b3174 HEAD -- apps/voice-media-worker tests/unit/audit-voice-runtime-20261002` -- exit 0.

**Environment note (not attributable to this task's code):** this
worktree's shared `node_modules` symlink was again stale at the start of
this round -- identical condition to prior rounds (§4/§6/§8's environment
notes): `node_modules/typescript` (and others) resolved through a dangling
absolute path into the removed sibling worktree
`gemini-audit-dependency-gates-20261002`. Repaired via
`tools/development-orchestrator/bin/ensure-local-node-modules.py repair
--root .`, which materializes this worktree's own local `node_modules`
(backed by its own `.pnpm` virtual store) in place of the stale symlink --
scoped to this worktree, not the canonical root's shared one. After the
repair, all commands above passed normally. No product/browser/DB/Compose
server was started; no live network call was made.

`same_sha_review_ci`: candidate SHA and branch are recorded via the task
lifecycle at handoff; hosted CI and review run against that SHA per the
normal candidate lifecycle, not asserted here. The locked round-3 candidate
`c11abdd42a5e07740413743920014d2be71b3174` is superseded by this round.

### Remaining blockers, restated precisely for this round

Unchanged from §8's "Remaining blockers, restated precisely for this
round" (6a: no call-authority issuer exists; 6b: dialogue/booking business
logic is still not invoked) and §3 items 1/3/5 (vendor procurement,
durable recording storage, deployment). This round's fixes are internal
authorization/lifecycle/concurrency corrections to code already in this
worker's write scope -- they neither close nor newly depend on any of
those external gaps.

## 11. Round-5 review (reopen on `030aa63a0430`, Codex, generation `14cd83c0d32444f7a699f746be62462b`, PR #2282)

Preserved here (this record is itself the round-5 reopen; the original
read-only dispatch that produced it could not edit this document, so owner
Claude2 appends it now, per Guide §0.7). Codex's round-5 review confirmed
R1/R3/R4(structural)/R6/R8/R9/R10 as repaired per §10, and the R2 RESOURCE
check (session/epoch/principal/scope matching) as repaired, but found two
findings still open:

- **R11 (P1 for the early-close exception/resource leak; P2 for the
  unfinished drain/pending-result lifecycle, persistent, reusing round-4's
  label for the _same_ underlying defect, not a new one)**:
  `VoiceMediaWorkerSession.closeAsr()` called `endAudio()` then `close()`
  synchronously with no terminal/cancelled state for an in-flight
  `connect()`, no failure-safe cleanup, no EOS drain window, and no
  rejection/settlement of pending `receiveResult()` waiters. The round-4
  fix made the already-open-socket close _count_ correct but did not
  implement the lifecycle itself: (a) closing while `connect()`'s login
  HTTP call was still pending let the response, once it arrived, go on to
  acquire access-info and a new provider socket for a session nobody was
  attached to; (b) closing while the socket was still CONNECTING made
  `endAudio()` call `socket.send("EOS")`, which a real WebSocket boundary
  throws `InvalidStateError` for outside the OPEN state -- that exception
  escaped `closeAsr()` and the composer's close handler before
  `this.sessions.delete(sessionId)` ran, leaking both the socket and the
  composer's map entry; (c) a pending `transcribe()` result was never
  settled by `close()`, leaving its promise hanging indefinitely with no
  bounded wait for an in-flight final.
- **R12 (P2, new)**: `TwmAsrNetworkAdapter.connect()` resolved on the
  socket's `open` event, not on the documented `180` send-ready status,
  which can (and did, in the reviewer's reproduction) land in a later
  event-loop turn. `transcribe()` immediately threw `TWM_ASR_NOT_READY`
  for audio sent in that gap, with no queue/retry -- permanently
  discarding the caller's first one or two audio chunks on every call.
  `connect()` also returned immediately whenever `this.socket` was
  assigned, even mid-handshake (checked before the single-flight
  `connectPromise` guard), which was semantically wrong even though
  `transcribe()`'s separate readiness check happened to still fail closed.
- **R2 operation separation (P1, `caller_session_authorization`, remaining
  part identified in round 4)**: both `/sessions` and `/recording/finalize`
  called the exact same `verifySessionAuthority(token)` with no
  operation/audience argument. A token resolving to the right
  session/epoch/principal/resource was accepted for _either_ route --
  admission and finalize were never distinguished as separate
  capabilities.

Required acceptance was assessed: `caller_session_authorization` NOT met
(R2 operation separation); `approved_runtime_provider_paths` NOT met
(R11/R12); `remaining_external_blockers_precise` not fully met (§9's
omission of the drain/settlement requirement, corrected below);
`same_sha_review_ci` not met (review rejected despite green same-SHA
hosted CI). §12 repairs all three.

## 12. Round-5 repair: terminal ASR lifecycle fencing, TWM readiness queuing, and call-authority operation separation

| Finding / required_acceptance                                | Source and fix location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Round-4 candidate -> this round                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Command / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R11 (P1/P2, persistent)                                      | `media-session.ts` `closeAsr()`: each of `endAudio()`/`close()` now wrapped in its own `try`/`catch` so either throwing can never block the other or escape to the composer. `twm-network-client.ts` `TwmAsrNetworkAdapter`: new `terminated`/`socketOpen` fields; `connect()` rejects immediately once `terminated`, and no longer short-circuits on a merely-assigned (not yet open) `this.socket`; `performConnect()` now calls `assertNotTerminated()` after every awaited login/access-info/socket-construction/handshake step, and refuses to adopt a socket constructed after termination (closing it immediately instead); the socket's `open`-wait `Promise` also listens for `close` (not just `open`/`error`) so a `close()` issued mid-handshake can never leave that await hanging; new private `terminate(code, reason)` (invoked by `close()`) sends EOS only if `socketOpen` (never on CONNECTING/CLOSED), awaits a new `awaitDrain(eosDrainMs)` (bounded by the route profile's configured `timeouts.eosDrainMs`, ending early via a `drainSignal` the instant every outstanding waiter settles) before calling `failPendingWork()` to reject any still-pending `receiveResult()` waiters and discard unsent queued audio, then releases the socket | On `030aa63a0430`: (a) a stale login response still acquired access-info/a new socket after close; (b) `endAudio()`'s `send("EOS")` on a CONNECTING socket threw, skipping `close()` and leaving the composer's session-map entry leaked; (c) a pending `transcribe()` result was abandoned instantly, with no drain window for an in-flight final. This round: (a) the stale continuation is fenced before access-info/socket construction; (b) EOS is only attempted once `socketOpen`, and `close()`/cleanup always run regardless, never throwing; (c) `close()` waits up to the configured `eosDrainMs` for a final already in flight, and rejects (does not hang) whatever is still pending once that window elapses | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- 19/19 passed, including the four new "(R11 scenario a/b/c/c-timeout)" regressions using a new `StatefulSocket` double that enforces native WebSocket send/readyState semantics (throws on `send()` outside OPEN), not the existing call-counting `FakeSocket`; `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/session-composer.test.ts` -- 6/6 passed, including the new "still removes the session and still calls close() when the ASR adapter's endAudio throws" regression proving the composer's session-map cleanup now survives a throwing adapter          |
| R12 (P2, new)                                                | `twm-network-client.ts` `TwmAsrNetworkAdapter`: `connect()`'s single-flight guard now checks `connectPromise` before any `this.socket` state (removing the premature "assigned but not open" short-circuit); new `audioQueue` (bounded at `MAX_QUEUED_AUDIO_CHUNKS = 64`, failing closed with `TWM_ASR_QUEUE_OVERFLOW` past that) and private `tryFlushQueue()`; `transcribe()` now always pushes the chunk to `audioQueue` and calls `tryFlushQueue()` (a no-op unless `this.ready`) instead of throwing `TWM_ASR_NOT_READY` for audio sent after `open` but before `180`; the `180` status handler in `handleMessage` also calls `tryFlushQueue()` once `this.ready` becomes true, flushing any chunks queued during that gap in arrival order; the provider `close`/`error` path now calls `failPendingWork()`, which also discards `audioQueue`, so queued-but-unsent audio cannot outlive a dropped connection                                                                                                                                                                                                                                                                                                                                                  | On `030aa63a0430`: two chunks sent between `open` and `180` produced two `TWM_ASR_NOT_READY` errors and zero provider audio delivered, silently truncating the caller's first utterance on every call. This round: both chunks are queued, then flushed to the provider in original order the instant `180` arrives -- zero errors, zero loss                                                                                                                                                                                                                                                                                                                                                                              | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- includes "(R12) queues audio sent between open and 180, then flushes it in order with no errors and no loss" and "(R12) rejects without hanging if the provider connection closes while audio is still queued and not yet ready"                                                                                                                                                                                                                                                                                                                                                  |
| R2 operation separation (P1, `caller_session_authorization`) | `call-authority.ts`: new exported `VoiceCallAuthorityOperation` (`"admit" \| "finalize"`); `VoiceCallAuthorityVerifier.verifySessionAuthority` now takes a required second `operation` argument. `media-worker-server.ts`: `/sessions` now calls `verifySessionAuthority(callAuthorityToken, "admit")`; `/recording/finalize` now calls `verifySessionAuthority(callAuthorityToken, "finalize")`. `fake-call-authority.ts` (the test double standing in for the external issuer, per Guide §0.7 -- the worker's own verification/binding logic is still exercised for real): `issue()` gained an `allowedOperations` option (defaulting to both, so every pre-existing test is unaffected); `verifySessionAuthority` now throws `VOICE_MEDIA_CALL_AUTHORITY_OPERATION_NOT_PERMITTED` when the resolved token's `allowedOperations` does not include the requested operation                                                                                                                                                                                                                                                                                                                                                                                          | On `030aa63a0430`: a token resolving to the exact bound session/epoch/principal/resource was accepted at either `/sessions` or `/recording/finalize` regardless of which operation it was actually issued for -- admission and finalize were not distinguished as separate capabilities. This round denies an admission-only token presented to `/recording/finalize`, and a finalize-only token presented to `/sessions`, before either route's resource-level checks ever run, while still sealing/admitting normally for a token that legitimately carries the attempted operation                                                                                                                                      | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/call-authority-session-binding.test.ts` -- 5/5 passed, including "rejects admission with a token that resolves to the right session id but was only ever granted the 'finalize' operation"; `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/media-recording-finalize-authorization.test.ts` -- 14/14 passed, including "rejects finalization when the presented token resolves to the right session/epoch/resource but was only ever granted the 'admit' operation" and "seals a valid finalization using a token granted only the 'finalize' operation (operation separation does not over-deny)" |

Full regression for this round (Node v22.23.2, pnpm 10.33.0, TypeScript
5.9.3, Vitest 4.1.4, this task's worktree):

- `pnpm --filter @drts/voice-media-worker typecheck` -- clean (exit 0).
- `pnpm --filter @drts/voice-media-worker lint` (`eslint src --max-warnings=0`) -- clean (exit 0).
- `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002` -- **91
  passed, 0 failed (11 files)**, run twice consecutively to confirm no
  flakiness (up from round-4's 81; new cases added to
  `twm-network-client.test.ts` (R11 scenarios a/b/c/timeout, R12 ordering
  and provider-close-while-queued), `session-composer.test.ts` (R11
  throwing-adapter composer-level regression), `call-authority-session-
binding.test.ts` and `media-recording-finalize-authorization.test.ts`
  (R2 operation-separation denial and non-over-denial cases), plus the
  `fake-call-authority.ts` double's new `allowedOperations` support).
- `pnpm exec vitest run tests/unit/system-remediation/sr-recording-recovery-20260913
tests/integration/uv-exec-023.integration.test.ts
tests/integration/system-remediation/sr-recording-recovery-20260913` -- 23
  passed, 0 failed (3 files): confirms this round's `call-authority.ts`/
  `media-worker-server.ts`/`media-session.ts`/`twm-network-client.ts`
  changes stay compatible with these pre-existing, out-of-write-scope
  callers.
- `pnpm run typecheck:root` -- clean (exit 0, zero errors anywhere in the repo).
- `pnpm run lint:root` -- clean (exit 0).
- `git diff --check 030aa63a04308ad0f1d5bca180810148d3dc9b22 HEAD -- apps/voice-media-worker tests/unit/audit-voice-runtime-20261002 docs/04-uat/audit-voice-runtime-20261002.md` -- exit 0.

**Environment note (not attributable to this task's code):** this
worktree's shared `node_modules` was again stale at the start of this
round -- identical condition to prior rounds, and identical root cause:
several top-level symlinks (`typescript`, `husky`, `next`, `globals`,
`lint-staged`, +24 more) resolved through dangling absolute paths into the
removed sibling worktree `gemini-audit-dependency-gates-20261002`. Round-4
repaired this once already (§10's environment note) but the repair is
worktree-local and does not survive a later `.pnpm` store GC/reindex in
the shared workspace; repeated the same repair via
`tools/development-orchestrator/bin/ensure-local-node-modules.py repair
--root .`, which re-materializes this worktree's own local `node_modules`
(backed by its own `.pnpm` virtual store, `CI=true pnpm install
--frozen-lockfile --prefer-offline`) in place of the stale symlinks --
scoped to this worktree, not the canonical root's shared one, and not a
lockfile change (`Lockfile is up to date, resolution step is skipped`).
After the repair, all commands above passed normally. No product/browser/
DB/Compose server was started; no live network call was made.

`same_sha_review_ci`: candidate SHA and branch are recorded via the task
lifecycle at handoff; hosted CI and review run against that SHA per the
normal candidate lifecycle, not asserted here. The locked round-4
candidate `030aa63a04308ad0f1d5bca180810148d3dc9b22` is superseded by this
round.

**Still open, not addressed this round:** round 4's and round 5's reviews
both noted that `media-recording-finalize-authorization.test.ts`'s
`MemoryRecorderObjectStore.readVersion` (lines ~95-128) still fabricates
readback metadata for segments that were never actually persisted via
`putRecordingImmutable`, instead of exercising `verifyRecordedObject`
against genuinely stored objects for every success-path case. This
round's three required findings (R11, R12, R2 operation separation) did
not touch that test boundary and it remains exactly as round 4 left it --
recorded here precisely so it is not mistaken for closed.

### Remaining blockers, restated precisely for this round

Unchanged from §8's "Remaining blockers, restated precisely for this
round" (6a: no call-authority issuer exists; 6b: dialogue/booking business
logic is still not invoked) and §3 items 1/3/5 (vendor procurement,
durable recording storage, deployment). This round's fixes -- terminal ASR
session lifecycle fencing, bounded readiness queuing, and call-authority
operation separation -- are internal authorization/lifecycle/concurrency
corrections to code already in this worker's write scope. They do not
require, and do not newly depend on, a real call-authority issuer, a
provisioned TWM account, or any other external gap: the operation
separation is enforced entirely by this worker's own verifier contract
(§0.7 notes the missing production issuer/audience itself remains a
legitimate external gate; only the _distinction_ between admit and
finalize capabilities was in scope here, and is now enforced at this
worker-owned port for whichever issuer is eventually wired in).

**Correction (round 6):** the "§12 repairs all three" line above
overstated R11/R12 coverage. Round 6's review found both findings still
had an open P2 sub-case each (EOS-drain/shutdown lifecycle for R11; the
setup/readiness failure path for R12) -- see §13/§14. The three bullets
under "Required acceptance was assessed" immediately above this note
should be read as "R11/R12 partially repaired," not fully repaired, as of
round 5.

## 13. Round-6 review (reopen on `25c2dae62256`, Codex, generation `af0f89db83f24482a64b269699c29b8f`, PR #2282)

Preserved here per Guide §0.7 (the read-only reopen dispatch that produced
it could not edit this document; owner Claude2 appends it now). Codex's
round-6 review confirmed R1/R2 RESOURCE+OPERATION/R3/R5/R6/R9/R10 and the
R12 successful-delayed-`180` path as repaired, and the round-9/12
provider/session/server startup-order defect as repaired, but found two
findings still open -- both a persistent P2 sub-case of a round-5 label,
not a new defect:

- **R11 (P2, EOS-drain and bounded shutdown/setup lifecycle still
  incomplete)**: the round-5 drain used `this.waiters.length === 0` as
  proof the recognition stream had finished draining. A partial result
  also resolves (empties) that same per-audio-chunk waiter queue, so a
  partial arriving before -- or during -- `close()`'s drain window ended
  the wait and closed the socket before the segment's real final (already
  scheduled moments later by the provider) ever arrived; the streaming
  `onResult` listener then only ever observed the partial. Separately,
  `TwmAsrNetworkAdapter.close()` discarded its own `terminate()` promise
  (`close(): void { void this.terminate(...); }`), so nothing in
  `VoiceMediaWorkerSession.closeAsr()` /
  `VoiceSessionComposer`/`MediaWorkerServer.stop()`/`drain()` could ever
  observe when that bounded teardown actually finished -- shutdown
  returned long before the configured `eosDrainMs` window it had itself
  started waiting on. A `connect()` stuck awaiting a login HTTP call that
  never resolves was also not actually settled by `close()`: the
  post-await `assertNotTerminated()` fencing only runs once that unrelated
  upstream call eventually resolves on its own, which may be never.
- **R12 (P2, setup/readiness failure path still absent; the previously
  flagged successful-180-after-a-delay case is now correctly fixed)**:
  nothing in `TwmAsrNetworkAdapter` read
  `noSpeechTimeoutMs`/`idleTimeoutMs`/`maxDurationMs` at all. A provider
  that opened a socket but never sent `180` left every already-queued
  chunk pending forever (the `MAX_QUEUED_AUDIO_CHUNKS` bound only ever
  rejects the _next_ chunk past the cap; it never resolves/rejects the 64
  already queued) and the socket open indefinitely; a provider stuck
  before the socket even opens (stuck login/handshake) had no bound of
  any kind, not even that chunk cap.

Required acceptance was assessed: `approved_runtime_provider_paths` NOT
fully met (R11/R12 failure/shutdown mechanics); `caller_session_authorization`
assessed as passing the worker-owned authorization boundary itself (R2
OPERATION/RESOURCE regressions both held), with production issuer/audience
integration restated as the separate, already-tracked external gate it
always was; `remaining_external_blockers_precise` required correcting
§12's overstated "all three fixed" framing (done in the correction note
above); `same_sha_review_ci` not met as a completion claim (review
REJECTED; CI tracked separately per the normal candidate lifecycle, not a
override for a reproduced failure). §14 repairs R11/R12's sub-cases listed
above.

## 14. Round-6 repair: bounded EOS-drain decoupled from per-chunk waiters, awaitable adapter/session/composer/server shutdown, and a setup/readiness deadline

| Finding / required_acceptance                                                    | Source and fix location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Round-5 candidate (`25c2dae62256`) -> this round                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Command / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R11 (P2, EOS-drain gated on the wrong signal)                                    | `twm-network-client.ts`: new `pendingFinalSegments: Set<string>` populated in `handleMessage`'s segment branch (added on a non-final revision for a key not yet finalized, removed once that key's final arrives) alongside the pre-existing `finalizedSegments`. New private `isDrainComplete()` (`pendingFinalSegments.size === 0 && waiters.length === 0`) and `maybeSignalDrainComplete()` replace the old inline `if (this.waiters.length === 0)` check after a waiter resolves -- now called unconditionally after every accepted segment message (including the buffered-result branch, not only when a waiter was resolved). `awaitDrain()`'s entry check and `terminate()`'s guard before awaiting it both switched from `this.waiters.length > 0` to `!this.isDrainComplete()`. `failPendingWork()` also clears `pendingFinalSegments` (nothing can finalize once the socket/session is being discarded).                                                                                                                                                                                                                                                                                                                                                                                                                                             | On `25c2dae62256`: a partial result resolved the single pending `transcribe()` waiter, emptying `waiters`; `close()`'s drain then saw `waiters.length === 0` and closed the socket immediately, before the segment's real final (scheduled 5-10ms later in the reproduction) ever arrived -- the `onResult` stream only ever observed the partial. This round: the drain is gated on whether any segment has an unfinalized revision, independent of whether its _per-chunk_ waiter happened to already resolve via a partial; the later final is delivered to `onResult` within the configured `eosDrainMs` window in both "partial before close" and "partial during the drain window" orderings.                                                                                                                                                                                                                                                                                                                               | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- new "(R11 round-6, scenario a)" and "(R11 round-6, scenario b)" regressions, using the existing `StatefulSocket` double and `vi.useFakeTimers()`/`vi.advanceTimersByTimeAsync` (same pattern as the round-5 scenario-c tests)                                                                                                                                                                                                                                                                                            |
| R11 (P2, shutdown teardown not awaitable end to end)                             | `media-provider.ts`: `VoiceSpeechToTextAdapter.close?()` return type widened to `void \| Promise<void>`. `twm-network-client.ts`: `close()` now `return this.terminate(code, reason)` instead of `void this.terminate(...)`, so its caller receives the real teardown promise. `media-session.ts`: `closeAsr()` is now `async`, `await`s `this.asrAdapter.close?.()` (still isolated in its own `try`/`catch`, same as `endAudio()`) and returns `Promise<void>`. `session-composer.ts`: new private `pendingCloses: Map<string, Promise<void>>`; `attach`'s channel `"close"` handler now deletes the session from `this.sessions` synchronously (unchanged observable timing for `get()`) but also records `session.closeAsr()`'s returned promise in `pendingCloses`, self-pruning via `.finally()` once it settles; new public `awaitPendingCloses(): Promise<void>` awaits every currently-tracked entry. `media-worker-server.ts`: `stop()` now `await this.sessionComposer?.awaitPendingCloses()` after triggering every active channel's `close()` and before resolving -- moved to run unconditionally, ahead of the pre-existing `if (!this.isRunning) return;` guard, so it still applies even when the HTTP listener was never started (this VM may not start one); `drain()`'s pre-existing final `await this.stop()` call inherits this for free. | On `25c2dae62256`: `MediaWorkerServer.stop()`/`drain()` closed every active channel (synchronously starting the composer's ASR teardown in the background) and then resolved immediately -- a provider's bounded EOS drain could easily still be running when the caller believed shutdown had already finished. This round: `stop()`/`drain()` do not resolve until every session's `closeAsr()` teardown has actually settled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/session-composer.test.ts` -- new "awaitPendingCloses only resolves once the ASR adapter's async close() has actually settled..." regression using a controllable async `close()` double; `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/media-worker-server-shutdown-drain.test.ts` (new file) -- `stop()`/`drain()` proven to block on a pending composer teardown, including with no HTTP listener ever started (`server.start()` is never called in this file, per the VM restriction) and with no session composer configured at all |
| R11 (P2, `close()` during stuck login never settles the caller)                  | `twm-network-client.ts`: new private `setupAbort: ((err: Error) => void) \| undefined`. `performConnect()` is now a thin wrapper constructing a `Promise` whose `reject` it exposes via `setupAbort` before delegating to the renamed `runConnectSteps()` (the prior `performConnect()` body, unchanged); whichever settles first -- `runConnectSteps()` naturally, or an external `setupAbort(err)` call -- wins (`settled` guard). `terminate()` now calls `this.setupAbort?.(new TwmNetworkError("TWM_ASR_TERMINATED", ...))` immediately after setting `this.terminated = true`, before `sendEosIfPossible()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | On `25c2dae62256`: `close()` while `connect()` was awaiting a still-pending login call relied entirely on the post-await `assertNotTerminated()` fencing already added in round 5 -- so the caller's `transcribe()`/`connect()` promise stayed pending until that unrelated upstream HTTP promise eventually resolved (or forever, if it never did), not from `close()` itself. This round: `close()` rejects that in-flight attempt immediately; the late-arriving real login response (if any) still hits the pre-existing fencing and is discarded, now purely as defense in depth rather than as the only settlement path.                                                                                                                                                                                                                                                                                                                                                                                                    | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- new "(R11 round-6, scenario c)" regression: login transport returns a `Promise` that deliberately never settles; `close()` alone is asserted to settle the pending `transcribe()`                                                                                                                                                                                                                                                                                                                                        |
| R12 (P2, no setup/readiness deadline)                                            | `twm-network-client.ts`: new private `setupDeadlineTimer: NodeJS.Timeout \| undefined`, `armSetupDeadline()` (arms a timer for `profile.timeouts.noSpeechTimeoutMs`, idempotent/no-op once `180`-ready or terminated), `clearSetupDeadline()`, and `failSetup()` (constructs `TWM_ASR_SETUP_TIMEOUT`, calls `setupAbort`, `failPendingWork`, closes+releases the socket -- not terminal for the adapter: a later `transcribe()` may attempt a fresh `connect()`). `connect()` calls `armSetupDeadline()` before starting a fresh attempt; the `180` handler in `handleMessage` calls `clearSetupDeadline()` the instant readiness is reached; the socket's own `"close"` listener also clears it. Reuses the already-defined, previously-unread `noSpeechTimeoutMs` timer for this bound rather than inventing an undocumented field -- `idleTimeoutMs`/`maxDurationMs` remain unread/unenforced past the setup window, which is outside this finding's repair boundary (see restated remaining blockers below).                                                                                                                                                                                                                                                                                                                                                | On `25c2dae62256`: a provider that opened a socket but never sent `180` left every one of the (bounded-at-64) already-queued chunks pending forever and the socket open indefinitely; a provider stuck before the socket even opened had no bound of any kind. This round: both are rejected, and the socket (if any) is released, once `noSpeechTimeoutMs` elapses with `180` still unreached.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- new "(R12 round-6)" regressions for both the "opens but never reaches 180" (65 chunks, 64 queued + 1 overflow, all eventually settled) and "stuck in a login call that never resolves" cases                                                                                                                                                                                                                                                                                                                             |
| R12 (P2, `failSetup()` abandonment not durable against a late upstream response) | `twm-network-client.ts`: new private `connectGeneration` counter and `assertCurrentAttempt(generation, reason)` (checks `this.terminated` first, then `generation !== this.connectGeneration`). `connect()` increments `connectGeneration` when starting a genuinely fresh attempt and threads it through `performConnect(generation)` -> `runConnectSteps(generation)`. Every `assertNotTerminated()` call inside `runConnectSteps` (after `login()`, after `getAccessInfo()`, after the socket's `open`/`error`/`close` race) and the socket-adoption check right after `wsFactory(...)` are all now `assertCurrentAttempt(generation, ...)` instead. `failSetup()` increments `connectGeneration` (abandoning the attempt) in addition to the pre-existing `setupAbort`/`failPendingWork`/socket-release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Found during this round's own pre-handoff verification (concurrent live inspection of this task's in-progress work, recorded on the task board, not yet a separate Codex review round), on the first version of this round's own fix: `failSetup()` is deliberately non-terminal (`this.terminated` stays `false`, so a later `transcribe()` can start a fresh attempt) -- but the real upstream `login()`/`getAccessInfo()` call the abandoned attempt was chained from is never actually cancelled (this adapter's `TwmHttpTransport` has no `AbortSignal`). The only re-check was `assertNotTerminated()`, which that late response would sail straight past, going on to acquire access-info and a brand-new provider socket for an attempt nothing was waiting on anymore. This round: the same late response now fails `assertCurrentAttempt`'s generation check instead, so it can never reach `getAccessInfo()`/`wsFactory(...)`; a genuinely fresh, later `connect()` attempt is unaffected and still succeeds normally. | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- new "(R12 round-6) a login call that finally resolves after the setup deadline already fired must not go on to acquire a socket" regression: asserts `accessCalls` stays `0` and `wsFactory` is never called after the abandoned login resolves, then proves a subsequent fresh attempt still connects and transcribes normally                                                                                                                                                                                          |

Full regression for this round (Node v22.23.2, pnpm 10.33.0, TypeScript
5.9.3, Vitest 4.1.4, this task's worktree):

- `pnpm --filter @drts/voice-media-worker typecheck` -- clean (exit 0).
- `pnpm --filter @drts/voice-media-worker lint` (`eslint src --max-warnings=0`) -- clean (exit 0).
- `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002` -- **101
  passed, 0 failed (12 files)**, run twice consecutively to confirm no
  flakiness (up from round-5's 91; new cases added to
  `twm-network-client.test.ts` (R11 round-6 scenarios a/b/c, R12 round-6
  no-180, stuck-login, and the late-login-after-timeout generation-guard
  regression), `session-composer.test.ts` (R11 `awaitPendingCloses`
  regression), and a new `media-worker-server-shutdown-drain.test.ts` file
  (R11 scenario-d `stop()`/`drain()` await regressions)).
- `pnpm exec vitest run tests/unit/system-remediation/sr-recording-recovery-20260913 tests/integration/uv-exec-023.integration.test.ts tests/integration/system-remediation/sr-recording-recovery-20260913 tests/unit/uv-exec-008.test.ts` -- 40 passed, 0 failed (4 files): confirms this round's `media-provider.ts`/`media-session.ts`/`session-composer.ts`/`media-worker-server.ts`/`twm-network-client.ts` changes stay compatible with these pre-existing, out-of-write-scope callers.
- `pnpm run typecheck:root` -- clean (exit 0, zero errors anywhere in the repo).
- `pnpm run lint:root` -- clean (exit 0).

**Environment note (not attributable to this task's code):** this
worktree's shared `node_modules` was again stale at the start of this
round -- identical condition and root cause documented in §10/§12's
environment notes (several top-level symlinks resolving through dangling
absolute paths into the removed sibling worktree
`gemini-audit-dependency-gates-20261002`). Repeated the same scoped repair
via `python3 tools/development-orchestrator/bin/ensure-local-node-modules.py
repair --root .` (re-materializes this worktree's own local `node_modules`
backed by its own `.pnpm` virtual store via `CI=true pnpm install
--frozen-lockfile --prefer-offline`; scoped to this worktree, not the
canonical root's shared one; not a lockfile change -- "Lockfile is up to
date, resolution step is skipped"). After the repair, all commands above
passed normally. No product/browser/DB/Compose server was started; no
live network call was made; `net.Server.listen` was never called by the
new `media-worker-server-shutdown-drain.test.ts` file (both `stop()` and
`drain()` are exercised against an unstarted `MediaWorkerServer`).

`same_sha_review_ci`: candidate SHA and branch are recorded via the task
lifecycle at handoff; hosted CI and review run against that SHA per the
normal candidate lifecycle, not asserted here. The locked round-5
candidate `25c2dae622568f3becab1396e0ce5665883ad064` is superseded by this
round.

**Still open, not addressed this round (unchanged from §12):**
`media-recording-finalize-authorization.test.ts`'s
`MemoryRecorderObjectStore.readVersion` (lines ~95-128) still fabricates
readback metadata for segments never actually persisted via
`putRecordingImmutable`. This round's two required findings (R11, R12)
did not touch that test boundary; it remains exactly as rounds 4/5 left
it, recorded here precisely so it is not mistaken for closed. A companion
PR (#2290, commit `b6042315b` on `pi/voice-runtime-regressions-20261003`,
based on this round's candidate) is reported to rewrite this exact suite
into a strict persisted-object test; this owner has not reviewed or
cherry-picked that commit as part of this candidate, so it is recorded
here as a pointer only, not as evidence for this round.

**Evidence-precision note:** `VoiceSessionComposer.sendEvent()` still
drops an event (`if (channel.destroyed) return;`) once the caller's own
WebSocket channel is gone -- this is correct behavior (there is nowhere
left to deliver it), not a defect, but it means a late final observed via
`TwmAsrNetworkAdapter.onResult()` during the bounded EOS drain (as this
round's R11 regressions assert) is evidence that the _adapter's_ drain
processed the final correctly, not a claim that it was necessarily
delivered onward to the caller's channel if that channel had already
been destroyed first. The regressions in this round assert against
`onResult` directly for exactly this reason.

### Remaining blockers, restated precisely for this round

Unchanged from §12's "Remaining blockers, restated precisely for this
round" (6a/6b, and §3 items 1/3/5). This round's fixes -- EOS-drain
correctness, awaitable adapter/session/composer/server shutdown, and a
bounded setup/readiness deadline -- are internal lifecycle/concurrency
corrections to code already in this worker's write scope; they do not
depend on, and do not newly require, a real call-authority issuer, a
provisioned TWM account, or any other external gap.

One narrower item is intentionally _not_ claimed fixed: this round binds
only the single "connect() started -> 180 reached" setup/readiness window
to `noSpeechTimeoutMs`. `idleTimeoutMs` (ongoing per-connection idle
disconnect once ready) and `maxDurationMs` (absolute session-duration cap)
remain read nowhere in `TwmAsrNetworkAdapter` and are not enforced once a
session is ready -- that was outside R12's setup/readiness repair
boundary as stated in the round-6 reopen, and is recorded here precisely
so it is not mistaken for in scope or already closed.

## Interactive completion follow-up: strict recording evidence and lifecycle failure boundaries

This parallel supplement was originally section 15 on the companion branch. It is retained alongside, not in place of, the owner's numbered review history below.

User requested completion on 2026-10-03. Companion PR #2290 preserves and merges owner commits `7dd52c0e3` and `23cf0ead0` without rewriting published history. Its final immutable SHA is bound by the PR head and the canonical integration note. Earlier sections remain historical evidence; their claims that fabricated recording readback or transport cancellation are still unaddressed are superseded by this section, not silently retroactively certified.

### Repairs and observed before/after evidence

| Boundary | Repair / regression | Observed result |
| --- | --- | --- |
| Recording test fidelity | Replaced the existing finalize suite's synthetic fallback with actual `SealedRecorder.seal` writes to a strict scope/version store. Real request/upgrade listeners and manifest sealing run; `net.Server.listen` throws if called. | 20 cases pass: valid bytes, seal/retry, trusted closure, operation/session/principal/epoch/resource/revocation/expiry denials, absent object/version/scope/metadata/bytes failures. No readback of a missing object can succeed. |
| R11 final drain | Retain owner's pending-final tracking and awaitable cleanup; make repeated adapter close return the same completion and clear early-drain timers. | Non-replaying socket tests cover partial before close, partial during drain, final arrival, no final timeout, and repeated close. |
| R11 shutdown result path | Composer stops new ingress and drains providers **before** server closes live peer channels. A `session.event` emitter is also forwarded by `MediaWorkerServer`, so results remain observable by a control-plane consumer after peer disconnect. Pending closes use a set, not a session-ID-keyed entry that a new epoch could overwrite. | Real configured TWM factory → composer → unstarted server tests observe final results during orderly shutdown and peer disconnect; orderly shutdown also delivers final on the still-open media channel. This is an event delivery seam, not a durable dialogue/booking consumer implementation. |
| R12 late setup/transport cancellation; R13 stale socket events | Retain owner's generation fence and abort the failed attempt's HTTP transport. Actual configured fetch receives AbortSignal. Timeout remains recoverable on a fresh attempt with a fresh AbortController; overflow/provider failure and explicit shutdown are terminal. Bind state-mutating socket callbacks to both socket and attempt identity, and clear only the matching connect promise. | Stuck login/access-info, late response after timeout, never-open handshake and configured-fetch cancellation pass. The owner's same-instance fresh-retry positive is preserved. Asynchronous old close/open/error/message events cannot affect a new attempt before or after 180. |
| R12 retained ingress and provider errors | Reserve queue capacity before awaiting login, cap setup plus pre-ready audio at 64 chunks, and fail/settle the whole queue on overflow. Handle provider errors after OPEN and send failures through the same terminal cleanup path. | 65 simultaneous chunks during stalled login, access-info, handshake and open-to-ready reject and release resources; no-ready queue clears on deadline; post-open error settles pending work and closes the socket. Existing no-ready test uses 64 chunks to test timeout separately from overflow. |

The original seven `twm-lifecycle-boundaries.test.ts` probes against source `25c2dae622568f3becab1396e0ce5665883ad064` all failed (7/7), reproducing missing behavior rather than asserting green. A read-only snapshot of the owner's in-progress network file at 04:15 UTC passed 3/7 and failed four cases (late login, late access-info, setup overflow, post-open error). That snapshot is **not** attributed to the later `23cf0ead0` commit, which independently added generation fencing. The combined repair passes all 18 lifecycle/composition cases, including the subsequently added handshake, idempotent close, shutdown, configured-fetch, asynchronous obsolete-socket and reused-session drain tests. The latter directly verifies that an old session instance's pending teardown is not lost when an empty replacement instance closes (R14); authorization/epoch fencing is covered separately by the strict recording suite. No tests were disabled to obtain these results.

### Completed local validation

Private frozen offline install (`--ignore-scripts`), not shared node_modules modification. Node 22 / pnpm 10.33.0 / TypeScript 5.9.3 / Vitest 4.1.4. Evidence logs are machine-local under `.local/voice-runtime-evidence/`; they are not claimed as portable attachments or live evidence.

- `pnpm run typecheck:root`: exit 0.
- `pnpm --filter @drts/voice-media-worker typecheck`: exit 0.
- `pnpm --filter @drts/voice-media-worker lint`: exit 0.
- ESLint on modified/new unit tests, max-warnings=0: exit 0.
- Explicit offline selection: **9 files / 97 tests passed, zero skips**, exit 0:

```bash
NODE_ENV=test env -u DATABASE_URL -u API_DATABASE_URL pnpm exec vitest run \
  tests/unit/audit-voice-runtime-20261002/internal-auth.test.ts \
  tests/unit/audit-voice-runtime-20261002/websocket-channel-frame-limits.test.ts \
  tests/unit/audit-voice-runtime-20261002/session-authority-grant-expiry-race.test.ts \
  tests/unit/audit-voice-runtime-20261002/provider-composition.test.ts \
  tests/unit/audit-voice-runtime-20261002/twm-lifecycle-boundaries.test.ts \
  tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts \
  tests/unit/audit-voice-runtime-20261002/session-composer.test.ts \
  tests/unit/audit-voice-runtime-20261002/media-worker-server-shutdown-drain.test.ts \
  tests/unit/audit-voice-runtime-20261002/media-recording-finalize-authorization.test.ts \
  --maxWorkers=1
```

The remaining HTTP-listening suites were not run here. Root/full suites, browser tests, product servers, DB/Compose infrastructure and external vendor calls were not started. Baseline failing probes and intermediate test failures are retained separately from the final passing logs.

### Acceptance disposition

- `caller_session_authorization`: strict persisted-object offline evidence repaired; production issuer/audience and deployed identity paths remain external gates.
- `approved_runtime_provider_paths`: deterministic R11/R12 repairs and configured-composition offline regressions supplied for independent review; no TWM/PSTN production attestation.
- `remaining_external_blockers_precise`: CTI/procurement, provisioned account/model/voice matrix, durable production recording backend, call authority, dialogue/booking orchestration and shared-dev/PSTN acceptance remain open. `productionCapable` stays false. Ready-state idle/max-duration policy remains the explicitly documented separate remainder above.
- `same_sha_review_ci`: new combined candidate requires fresh independent review and hosted CI. Local success is not merge, deployment, or live acceptance.
## 15. Round-7 review (reopen on `23cf0ead0849`, Codex, generation `7615f783a51e45a38888312d939799b5`, PR #2282)

Preserved here per Guide §0.7 (the read-only reopen dispatch that produced
it could not edit this document; owner Claude2 appends it now). Codex's
round-7 review confirmed R11's partial-before-close/partial-during-drain
cases, R12's login/access-info/handshake/open-without-180 setup-deadline
cases, and R1/R2/R8 HTTP admission/finalize authorization (including the
strict-store negative matrix) as repaired on this candidate, but found two
newly-exposed defects in this round's own new bookkeeping, plus the
previously-recorded repeated evidence-quality gap still unaddressed:

- **R12 (P2, setup backpressure still bypassed before `connect()`)**:
  `MAX_QUEUED_AUDIO_CHUNKS` was only compared against `audioQueue.length`,
  which `transcribe()` never populated until _after_ `await this.connect()`
  returned. A provider stuck before login/access-info/the handshake (e.g.
  a stuck-login repro with `noSpeechTimeoutMs=70` and 128 concurrent
  one-byte `transcribe()` calls) let all 128 calls pile up awaiting the
  same single-flight `connect()`, each retaining its own audio chunk in
  its own suspended stack frame, none of them ever counted against the
  64-chunk cap. All 128 eventually rejected `TWM_ASR_SETUP_TIMEOUT` once
  the deadline fired (proving that part of round-6's fix sound), but nothing
  capped the number of concurrent calls retained during the wait itself.
- **R13 (P2, new setup-retry fencing gap: a late OLD socket close event
  destroys NEW connection state)**: `failSetup()`/`terminate()` abandon a
  stale attempt and _request_ its socket's close, but a real WebSocket's
  `close` _event_ fires asynchronously and can still arrive after a newer
  attempt has replaced `this.socket`. The `message`/`close` listeners
  installed when a socket was adopted (and the handshake promise's `open`
  listener's `this.socketOpen = true` write) were unfenced against socket
  identity, so a stale attempt A's delayed close event -- firing after a
  fresh attempt B had already opened, reached `180`, and sent audio --
  cleared `this.socket`, reset `ready`/`hasAccess`, and rejected B's
  pending result via `failPendingWork`, even though B itself was still
  perfectly healthy.
- **R14 (P2, new awaitable-shutdown tracking loses old teardown when a
  session ID is reused)**: round-6's `VoiceSessionComposer.pendingCloses`
  was a `Map<string, Promise<void>>` keyed by `sessionId`. A session id
  reissued for a new call (e.g. `MediaWorkerServer.closeSession` followed
  immediately by a fresh `/sessions` admission at a higher epoch, exactly
  as the recording-authority fencing tests already exercise) while the
  OLD attach's async `closeAsr()` was still draining had the NEW attach's
  own (fast) close overwrite the map entry for that id -- silently
  dropping the still-pending OLD teardown from whatever
  `awaitPendingCloses()` later collects. `MediaWorkerServer.stop()`
  returned in ~0ms with the old epoch's provider still open and never
  closed.
- **Repeated evidence-quality gap (unchanged since round-4/5/6)**:
  `media-recording-finalize-authorization.test.ts`'s
  `MemoryRecorderObjectStore.readVersion` fabricated matching
  bytes/metadata for any requested scope/objectKey/objectVersion that was
  never actually written via `putRecordingImmutable`, so every
  success-path test in that file was exercising `verifyRecordedObject`'s
  checksum/version/metadata checks against a boundary that could never
  fail them. A pointer to a companion PR (#2290/`b6042315b`) was not
  accepted as evidence for this candidate.

Required-acceptance mapping per the round-7 reopen: `approved_runtime_provider_paths`
not fully met while R12's pre-connect retention and the new R13/R14
resource-lifecycle regressions remained; `caller_session_authorization`
assessed as passing the worker-owned operation/resource/session/
principal/epoch/closure boundary itself, with the recording evidence-test
fidelity gap called out as incomplete and the production issuer/audience
integration restated as the separate external gate it always was;
`remaining_external_blockers_precise` required keeping R12/R13/R14 and the
test-boundary repair as deterministic in-scope code work, never recast as
an external/procurement blocker; `same_sha_review_ci` not met as a
completion claim (hosted CI green on this SHA, but review REJECTED; CI
success does not override a reproduced review finding). §16 repairs all
four items above on this same candidate.

## 16. Round-7 repair: bounded pre-connect backpressure, stale-socket-event fencing, reused-sessionId teardown tracking, and genuine persisted-recording test evidence

| Finding / required_acceptance                                                                        | Source and fix location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Round-6 candidate (`23cf0ead0849`) -> this round                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Command / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R12 (P2, setup backpressure bypassed before `connect()`)                                             | `twm-network-client.ts`: new private `pendingConnectChunks` counter. `transcribe()` now checks `this.audioQueue.length + this.pendingConnectChunks >= MAX_QUEUED_AUDIO_CHUNKS` and throws `TWM_ASR_QUEUE_OVERFLOW` **before** the `await this.connect()` call (moved ahead of it, along with the pre-existing frame-size check); increments the counter immediately before awaiting `connect()`, decrements it in a `finally` regardless of outcome (success, rejection, or a setup-deadline/terminate abort of the in-flight `connect()`). The post-connect `eosSent`/queue-push/flush/`receiveResult()` sequence is unchanged.                                                                                                                                                                                                                                                                                                                                                                 | On `23cf0ead0849`: 128 concurrent one-byte `transcribe()` calls against a stuck-login transport all passed the (post-connect-only) capacity check and piled up awaiting the same single-flight `connect()` -- 0 rejected after 10ms. This round: exactly 64 are admitted past the gate; the other 64 reject `TWM_ASR_QUEUE_OVERFLOW` synchronously, before `wsFactory` is ever invoked; the 64 admitted calls still correctly reject `TWM_ASR_SETUP_TIMEOUT` once the deadline fires (unchanged from round-6).                                                                                                                            | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- new "(R12 round-7) bounds concurrent setup-phase transcribe() calls..." regression; standalone Node probe (ts.transpileModule against the actual candidate source, no vitest) independently reproduced the same 64/64 split and confirmed it fails (0 early rejections) against the pre-fix source via a scoped `git stash` of only the two source files                                                                                 |
| R13 (P2, stale OLD socket close destroys NEW connection state)                                       | `twm-network-client.ts`: in `runConnectSteps`, right after `this.socket = socket` is assigned, a local `isCurrentSocket = () => this.socket === socket` closure now fences the `message` listener (no-op if stale), the outer `close` listener (no-op if stale -- previously unconditionally cleared `this.socket`/`ready`/`hasAccess` and called `failPendingWork`), and the handshake promise's `open` listener's `this.socketOpen = true` write (still always `resolve()`s its own local promise regardless, so this specific attempt's own flow is never blocked).                                                                                                                                                                                                                                                                                                                                                                                                                           | On `23cf0ead0849`: attempt A opens, never reaches `180`; the setup deadline fires and `failSetup()` requests `socketA.close()`, but (matching a real asynchronous WebSocket close event) the close event itself is delivered later. A fresh attempt B connects, reaches `180`, and sends audio in the meantime. When A's delayed close event finally arrives, the unfenced handler cleared `this.socket` (B's live socket) and rejected B's pending result with `TWM_ASR_CONNECTION_CLOSED`. This round: A's late close event is a no-op once `this.socket !== socketA`; B remains OPEN and its pending `transcribe()` resolves normally. | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/twm-network-client.test.ts` -- new "(R13 round-7) a stale attempt's delayed close event does not tear down a newer attempt's state" regression, using a new `DelayedCloseSocket` double (close() transitions to CLOSING without firing the close event until a separate `deliverClose()` call, modeling the real asynchronous gap `StatefulSocket` does not); independently reproduced via the same standalone probe                                                    |
| R14 (P2, reused-sessionId teardown lost from `pendingCloses`)                                        | `session-composer.ts`: `pendingCloses` re-typed from `Map<string, Promise<void>>` to `Map<ComposedSession, Promise<void>>`, keyed by the `composed` object created fresh in each `attach()` call instead of by `sessionId`. The channel `"close"` handler's stale-close guard also switched from `if (!this.sessions.has(sessionId)) return;` to `if (this.sessions.get(sessionId) !== composed) return;` (identity, not mere presence) so a newer attach for the same reused id can never have its session-map entry deleted by an older attach's close handler either.                                                                                                                                                                                                                                                                                                                                                                                                                         | On `23cf0ead0849`: closing a session then immediately re-admitting/attaching the same id at a higher epoch (while the old attach's `closeAsr()` was still draining) let the new attach's own fast-resolving close overwrite the old attach's entry in the string-keyed map; `awaitPendingCloses()` (and therefore `MediaWorkerServer.stop()`) returned without ever having collected the old attach's still-pending promise -- `stop()` resolved in ~0ms with the old provider still open. This round: each attach's teardown gets its own map entry regardless of id reuse; `awaitPendingCloses()` correctly waits for both.             | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/session-composer.test.ts` -- new "awaitPendingCloses waits for both an old and a new attach's teardown when a session id is reused while the old one is still draining" regression, directly on `VoiceSessionComposer` with two distinct controllable-async-close adapter instances; independently reproduced via the same standalone probe                                                                                                                             |
| Repeated evidence-quality gap (`media-recording-finalize-authorization.test.ts` fabricated readback) | `media-recording-finalize-authorization.test.ts`: `MemoryRecorderObjectStore.readVersion` rewritten to strict key+version lookup against an internal `Map` populated only by its own `putRecordingImmutable`/`putImmutable` -- the prior fallback that fabricated `DUMMY_AUDIO_BYTES`/matching metadata for any requested-but-never-stored key is gone entirely; a miss or a version mismatch now throws, exactly as a real immutable object store would. New `sealBidirectionalSegments(store, scope)` helper actually calls the real `SealedRecorder.seal()` (only its external `RecorderIngress` is a test double) to durably write both channels' audio before every test that previously called the old ad hoc `bidirectionalSegments(scope)` builder; all 15 call sites across the file were converted. Two new regression tests added: a segment whose `objectKey` is tampered to reference an object never written, and one whose `objectVersion` is tampered to a version never stored. | Before: every success-path test (`seals a valid authorized finalization...`, the `finalize`-only-operation test, the authorized-retry test, session B's leg of the cross-session test) sealed successfully against bytes/metadata the store invented on the spot, not evidence that real persisted recorder data was read back and verified; a missing or wrong-version object was structurally unable to fail. This round: the exact same assertions now pass against genuinely durable `SealedRecorder`-written objects, and the two new tampering cases prove a missing/wrong-version object is rejected, not papered over.            | `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002/media-recording-finalize-authorization.test.ts` -- all 15 cases (13 existing + 2 new) pass against the real `MediaWorkerServer` HTTP listener + `MediaRecordingAdapter`/`SealedRecorder`/`FinalRecordingManifests`/`ImmutableRecordingManifests` chain; independently reproduced via a standalone Node probe (same `ts.transpileModule` harness) exercising a genuine seal-and-finalize round trip plus the two tampering cases directly against the actual HTTP server |

Full regression for this round (Node v22.23.2, pnpm 10.33.0, TypeScript
5.9.3, Vitest 4.1.4, this task's worktree):

- `pnpm --filter @drts/voice-media-worker typecheck` -- clean (exit 0).
- `pnpm --filter @drts/voice-media-worker lint` (`eslint src --max-warnings=0`) -- clean (exit 0).
- `pnpm exec vitest run tests/unit/audit-voice-runtime-20261002` -- **106
  passed, 0 failed (12 files)**, run twice consecutively to confirm no
  flakiness (up from round-6's 101; 5 new cases: R12/R13 round-7
  regressions in `twm-network-client.test.ts`, the R14 round-7 regression
  in `session-composer.test.ts`, and 2 new missing-object/wrong-version
  negatives in `media-recording-finalize-authorization.test.ts`).
- `pnpm exec vitest run tests/unit/system-remediation/sr-recording-recovery-20260913 tests/integration/uv-exec-023.integration.test.ts tests/integration/system-remediation/sr-recording-recovery-20260913 tests/unit/uv-exec-008.test.ts` -- 40 passed, 0 failed (4 files), unchanged from round-6: confirms this round's `twm-network-client.ts`/`session-composer.ts` changes stay compatible with these pre-existing, out-of-write-scope callers.
- `pnpm run typecheck:root` -- clean (exit 0, zero errors anywhere in the repo).
- `pnpm run lint:root` -- clean (exit 0).

**Environment note (not attributable to this task's code):** this
worktree's shared `node_modules` was again stale at the start of this
round -- identical condition and root cause documented in §10/§12/§14's
environment notes (top-level symlinks, this time including
`node_modules/typescript` itself in addition to the `vitest`/`tsc`
wrapper scripts previously noted, resolving through dangling absolute
paths into the still-removed sibling worktree
`gemini-audit-dependency-gates-20261002`). Before the repair, `tsc`/
`vitest` could not run at all; three standalone Node scripts (read-only,
using `ts.transpileModule` against the actual candidate `.ts` source via
a custom `require.extensions`/`Module._resolveFilename` hook, remapping
`@drts/contracts` to its real `packages/contracts/src` source, never a
build artifact) independently verified all four fixes above against the
real candidate source and, for R12, additionally confirmed the exact
same probe assertion fails on the pre-fix source via a scoped
`git stash push -u -- <the two source files>` / `git stash apply` /
`git stash drop` round trip (never a bare `git stash`, never touching
this round's other changes) before the repair made `vitest` usable again.
Repeated the same scoped repair as round-6 via
`python3 tools/development-orchestrator/bin/ensure-local-node-modules.py
repair --root .` (re-materializes this worktree's own local `node_modules`
backed by its own `.pnpm` virtual store via `CI=true pnpm install
--frozen-lockfile --prefer-offline`; scoped to this worktree, not the
canonical root's shared one; not a lockfile change -- "Lockfile is up to
date, resolution step is skipped"). After the repair, all commands above
passed normally, both via `vitest` and matching the standalone probes'
results. No product/browser/DB/Compose server was started; no live
network call was made; the recording-finalize probe's HTTP server bound
only to `127.0.0.1` on an OS-assigned port, identical to the existing
vitest suite's own `startServer()` helper.

`same_sha_review_ci`: candidate SHA and branch are recorded via the task
lifecycle at handoff; hosted CI and review run against that SHA per the
normal candidate lifecycle, not asserted here. The locked round-6
candidate `23cf0ead0849d9d5f49570af03fec4b081d6ed99` is superseded by
this round.

**Remaining blockers, restated precisely for this round:** unchanged from
§12/§14's "Remaining blockers, restated precisely for this round"
(6a/6b, and §3 items 1/3/5), and from §14's note that `idleTimeoutMs`/
`maxDurationMs` remain unread/unenforced past the setup window -- that
remains outside this round's repair boundary (R12/R13/R14 and the
recording-test evidence fix) exactly as it was outside round-6's. This
round's four fixes are internal lifecycle/concurrency/test-fidelity
corrections to code and tests already in this task's write scope; none
of them depend on, or newly require, a real call-authority issuer, a
provisioned TWM account, or any other external gap.

## 17. Consolidated lifecycle follow-up (AUDIT-VOICE-LIFECYCLE-20261003)

The owner candidate `e91db0db5780aaa52a1d2d5fbc55c68eb558e8a5` was independently approved and merged as PR #2282 (`5bf63636a`). Companion PR #2290 preserves that history through a normal merge (`bbc94d736`), retaining abortable setup, generation/socket fencing, shared close promise, drain-before-channel-close, peer-independent `session.event`, and promise-identity teardown tracking. Recording tests retain real `SealedRecorder.seal` persistence with strict missing-object/scope/version rejection, not fabricated readback. Owner R12/R13/R14 regression cases remain present.

The overflow policies differed: the owner rejected only excess ingress while admitted calls awaited setup timeout; the companion fails the entire setup attempt closed. The owner regression initially failed after consolidation (65 overflow rejections versus its expected 64). The successor assertion is stronger for the selected policy: all 128 calls settle before setup timeout, exactly 65 report overflow (64 admitted plus the triggering call), subsequent calls report termination, and no socket opens. No cases/assertions were skipped.

### Newly implemented local runtime bounds

- `maxDurationMs` starts on the current socket's `open`, including the open-to-readiness interval; repeated readiness, transcripts and audio cannot extend it. Expiry fails the session with `TWM_ASR_MAX_DURATION` and closes its socket.
- `idleTimeoutMs` starts at first `180` readiness. Only successfully sent **nonempty audio** resets it; status/revision chatter cannot keep abandoned input alive. Expiry rejects pending work with `TWM_ASR_IDLE_TIMEOUT` and closes the socket. These are local resource bounds, **not verified provider billing/no-speech semantics**.
- EOS disables the input-idle bound but retains the absolute cap. Explicit `close()` clears runtime timers and instead owns the already bounded EOS/final-result drain. Failure, abandoned setup and successful close release timers. Recoverable setup timeout still permits a fresh generation; idle/max-duration failure is terminal.
- Invalid/nonfinite/nonpositive/Node-overflowing idle/max timer configuration is rejected before network setup. No new provider protocol, credential or paid operation is introduced.

### Verification-scope correction and retained failed evidence

The prior blanket description of all nine selected suites as socket-free was incorrect: the then-current `session-composer.test.ts` had three HTTP-listening cases. A consolidation run at 2026-10-03 05:22Z inadvertently selected them; it completed, their `finally` blocks stopped the servers, and a subsequent process inspection found no remaining voice test/server process. This was a VM-restriction violation, not authorized local runtime acceptance. Local evidence is preserved in `.local/voice-runtime-evidence/consolidated-tests.log`; older owner descriptions of loopback execution above are historical, not permission to repeat them.

The composer helper now invokes the real request/upgrade listeners over an in-memory duplex pair. It still exercises signed session admission, actual WebSocket frame parsing, composer, ASR/TTS session and outbound frames; it never calls `start()`/`listen()`. A `net.Server.prototype.listen` guard throws if a regression tries to listen. All eight composer cases pass, including all three former listener cases. The nine-file selection was inspected again for active start/listen/network calls before rerunning.

Completed offline checks on the consolidated source: **9 files / 113 tests passed, zero skips**; root TypeScript, voice-worker TypeScript, worker lint and changed-test lint all passed. Commands:

```sh
NODE_ENV=test env -u DATABASE_URL -u API_DATABASE_URL pnpm exec vitest run \
  tests/unit/audit-voice-runtime-20261002/{internal-auth,websocket-channel-frame-limits,session-authority-grant-expiry-race,provider-composition,twm-lifecycle-boundaries,twm-network-client,session-composer,media-worker-server-shutdown-drain,media-recording-finalize-authorization}.test.ts --maxWorkers=1
pnpm run typecheck:root
pnpm --filter @drts/voice-media-worker typecheck
pnpm --filter @drts/voice-media-worker lint
pnpm exec eslint tests/unit/audit-voice-runtime-20261002/{twm-lifecycle-boundaries,twm-network-client,session-composer,media-recording-finalize-authorization}.test.ts
```

Local logs: `.local/voice-runtime-evidence/runtime-deadlines-*.log`. Predecessor companion `5b4d76a13cd981b217c3e4d96f7901a7e9aa7535` passed hosted runs `37098046560` and `37098046701`; they do **not** certify this successor. Independent review and CI must bind the newly pushed full SHA before merging #2290.

`productionCapable` remains false. Real CTI/account/model/voice verification, call-authority issuer/audience, durable recording storage, dialogue/booking orchestration, cloud deployment and real-service acceptance remain open. This section supersedes only the earlier idle/max-duration *implementation* remainder, not any external readiness gate. The emitted `session.event` seam is not a durable dialogue consumer. No deployment was performed.
