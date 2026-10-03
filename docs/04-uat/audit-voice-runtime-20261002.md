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
