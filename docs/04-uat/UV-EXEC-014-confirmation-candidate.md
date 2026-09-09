# UV-EXEC-014 confirmation candidate

Owner: Gemini. Independent reviewer: Codex2. Availability-first reassignment:
Gemini claimed UV-EXEC-014 while Codex was unavailable or occupied; this records
the routing fallback, not a change to role policy. All five prerequisite tasks
were `done` at implementation start.

## Delivered boundary

SD §§5.4, 6.2, 8: `VoiceConfirmationService` exports a fail-closed internal
coordinator service. `beginReadback` loads the immutable current draft, validates
its versioned canonical SHA-256, generates the `zh-TW-booking-v1` controlled
script and persists a readback ticket. The script includes both locations and
entrances, the Taipei date/time, requirements, separate contacts, the driver's
contact role, notes and the exact speech/DTMF instruction. Unknown snapshot
business fields require a new template; they are never silently omitted.

`accept` retrieves the checkpoint through `VoiceEvidenceService` before acquiring
database locks. It then locks session → intent → confirmation, reloads the current
revision, and compares the retrieved recorder receipt with durable playback and
answer events. It requires a contiguous current control stream, resolved input,
actual provider playback, the correct script/audio version, prompt, snapshot,
call/leg, epochs, event IDs and explicit consent. Speech is a conservative
allowlist with final/VAD/echo/source/competing-speech checks; isolated “好” and
corrections are rejected. DTMF requires the prompted digit 1 and trusted event
order. A DTMF proof does not invent ASR fields or a tone recording.

`replaceDraft` runs UV-EXEC-013 qualification outside the lock and atomically
appends a revision and invalidates the prior proof under the same lock order.
It leaves the pending command's sealed payload unchanged so the UV-EXEC-015
executor must observe the superseding draft before writing an order.
`invalidate` preserves accepted pending proof on ordinary disconnect, while
unknown input blocks execution. For unaccepted work it invalidates before reask.
The local controller clears/aborts before API I/O, retires old playback IDs,
rejects diagnostic replay, and prevents a late asynchronous result from reviving
an interrupted confirmation.

## Integration contract

- The initial draft writer must persist `voiceSnapshotHash(canonicalSnapshot)`;
  the supported snapshot contains `bookingRequirements`, `bookingQualification`
  from UV-EXEC-013 and optional `pickupNotes`. The service does not invent a new
  intent or create an order.
- Deployments inject `VOICE_CONFIRMATION_ACCESS`. It authorizes the authenticated
  coordinator against the live session/brand/scope/lease. No provider is installed
  by default: missing authorization or recorder access fails closed. These
  internal methods are not model tools or public unauthenticated routes.
- The trusted event adapter persists the source/provider/leg/event identity and
  source occurrence sequence. `playback_completed.payload` carries
  `readbackPlaybackId`, `readbackScriptHash`, immutable `audioVersion`,
  `completionSource=provider_playback`, and `outcome=completed`. The sink must
  bind audio to this script, not arbitrary generated speech.
- Answer payloads carry the same playback/snapshot and `replay=false`. Speech
  adds `turnId`, `isFinal`, `vadPassed`, `echoDetected`, `competingSpeech`,
  `sourceAttribution`, `intent` and final `text`; DTMF adds `digit`,
  `expectedDigit`, and `timingSource=provider`. These are authenticated adapter
  observations, never model-supplied authority. ASR-final does not advance the
  control watermark or implicitly resolve pending input.
- The coordinator must persist input resolution, refresh its session fence, and
  use `requestConfirmation` for evidence retrieval/API acceptance. On unknown or
  correction input, invalidate locally before clarification; a material edit
  then calls `replaceDraft` with a freshly loaded fence. New readbacks must use a
  newly minted playback ID. `beginReadback` and `accept` increment the session
  revision; callers reload after writes or ambiguous network results.
- UV-EXEC-015 still owns receipt acceptance/execution and must revalidate the
  current proof/draft/input cutoff under its transaction, with idempotent receipt
  lookup before proof reuse. An API confirmation receipt is not a booked order.

## Verification and limits

The task suite uses the real confirmation service, real `VoiceEvidenceService`
and local media controller with injected repository/recorder fixtures. It checks
SQL lock ordering and mutation boundaries, not PostgreSQL concurrent execution.
Related UV-EXEC-010 tests separately exercise immutable object/audio retrieval,
checksums and speech/DTMF coverage. No live CTI, object-store policy, provider
speaker attribution accuracy, deployment or PostgreSQL concurrency acceptance is
claimed. Product servers, browser servers and Docker were not started.

Checks: task + UV-EXEC-007/009/010/012/013 unit suites; API and media-worker
TypeScript checks; scoped ESLint and formatting checks. Exact final counts and
candidate SHA are recorded in the machine-truth handoff.

Final local verification on 2026-09-09 UTC: all six suites passed, 271 tests
(including 71 task cases); root typecheck, API and media-worker typechecks passed;
scoped ESLint, Prettier and `git diff --check` passed. Historical control event
fixture narrowing and new-epoch unapplied-tail negative cases are verified.
