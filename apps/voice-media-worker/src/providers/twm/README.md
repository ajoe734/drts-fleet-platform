# TWM fixture adapter — UV-EXEC-011

Source: repository SD `docs/02-architecture/phase1-unattended-voice-booking-sd-20260906.md`
§11 (Streaming V3.22 / TTS V2.07). This implementation performs no network calls.
Token, ticket, transcript and audio values are fixtures. Both adapters always
report `isProductionCapable=false`, even when fixture profiles have verification
flags. UV-EXEC-027/028 must validate real endpoints, credentials, account models,
capacity, timer ranges, language/accent/textType and billing before production.
Codex2 resumed the inherited implementation under the chairman's quota fallback;
Codex remains the independent reviewer.

## Protocol and consumer boundary

- `TWM_PROTOCOL_FIXTURE` identifies the documented login/access/models/synthesis
  paths. No credential retry against guessed FAQ paths is implemented. The
  future credential manager owns actual login and token refresh.
- `acquireAccess` models fresh, expiring single-use tickets and encodes model,
  codec/rate, transient results and no provider result retention. `180` gates
  audio; `100` cannot send. Frames must be smaller than 384 KiB.
- `sendAudio` and `receiveResult` are separate so text results can drain after
  `endAudio`. Repeated EOS cannot extend the deadline. Session/segment revisions
  increase monotonically; no revision may change an already-final segment.
  Segment final and hangup EOS never constitute passenger consent.
- Route timeout fields independently represent segmentation, missing packets,
  no speech, idle, maximum duration and EOS drain. This fixture validates their
  configuration and exercises drain; it does not simulate wall-clock network
  timeouts or invent undocumented provider query names for local timers.
- `reconnect` classifies timeout/capacity and requires new access before ready.
  There is no resume cursor. Diagnostic results retain utterance identity and
  cannot pass through `transcribe`, the media-session dialogue entry point.
  The diagnostic receive API must be consumed only by the diagnostic pipeline.
  Dialogue orchestration must invalidate uncommitted turns and reconcile already
  pending commands before resuming; the adapter does not mutate booking state.
- `VoiceLanguageRouter` exposes verified selection prompt assets for playback
  before ASR. `shortPrompt` is a text menu, not a translated/multilingual audio
  asset. Configured prompt recordings require human language/accent review.
  DTMF 3 selects Hakka without recognizing Mandarin first. Switching emits the
  chosen model and a new provider epoch, requires EOS/drain of the old stream,
  and invalidates old uncommitted proof epochs via
  `acceptsUncommittedConfirmation`. The caller executes the returned transition
  instructions and preserves confirmed draft/accepted command state.
- TTS request fixtures retain provider model/name/textType independently of ASR
  model IDs. Hakka requires an explicit verified accent. Playback hooks execute
  clear before best-effort abort without waiting on an ACK. Clear failure is
  unknown. Without a playback controller, local stop only retires the active ID:
  playback cancellation is `unknown` and synthesis cancellation is `not_requested`.
  It cannot clear chunks already returned to the caller. With a controller,
  `abort_requested` records an attempted hook call, including a throwing or
  rejected call; provider cancellation and billing always remain unverified. Dummy
  PCM chunks are not meaningful synthesized speech or pronunciation evidence.

## Repeatable evidence

`tests/unit/uv-exec-011.test.ts` covers protocol ticket/readiness/frame limits,
revision finality, drain expiry, all disconnect codes, isolated diagnostic replay,
independent timer validation, DTMF/epoch switching, verified prompt/accent gates,
TTS request mapping, absent-controller cancellation evidence, clear/abort failure
paths and production rejection.

Run:

```sh
pnpm exec vitest run tests/unit/uv-exec-011.test.ts tests/unit/uv-exec-008.test.ts tests/unit/uv-exec-009.test.ts
pnpm --filter @drts/voice-media-worker typecheck
pnpm --filter @drts/voice-media-worker lint
```

These provide local fixture evidence for `twm_protocol_fixture_evidence`,
`language_switch_evidence` and `asr_disconnect_replay_evidence`; they are not
formal account acceptance or same-SHA independent review evidence.
