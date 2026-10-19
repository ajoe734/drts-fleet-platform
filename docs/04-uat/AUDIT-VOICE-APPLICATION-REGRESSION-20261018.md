# AUDIT-VOICE-APPLICATION-REGRESSION-20261018

Source regression child of AUDIT-VOICE-APPLICATION-WIRING-20261003 at `ba0b164ed8fab3f0dd68ace92a18d0376c0a9031`.
Owner: Claude2. Reviewer: Codex. Priority: P2.
Required acceptance: `composed_turn_and_recording_path`, `authority_epoch_consent_fences`,
`precise_unimplemented_and_external_boundaries`, `same_sha_review_ci`.

This document records the state of this task across two sessions. Session 1 delivered one
confirmed, scoped repair each to packages A (tools) and B (recording finalization), and left C
(durable contact/consent) and D (workbench) not started, gated on Root allocating a migration
number. Root allocated `V0122__voice_contact_role_revision.sql` on 2026-10-18T23:19:25Z (see
`.local/passenger-bureau-gap-correction-20261018/Voice-C-V0122-exact-root-allocation-20261018/result.json`).
Session 2 (this one) implements Package C's durable backend and Package D's DTO/workbench
projection on top of that allocation. This remains a **partial** candidate overall: A's two
remaining tools and B's adapter/call-authority gate are still open exactly as Session 1 described
them, and Package C's new durable store has no mounted production caller yet (see Package C's own
section below for the precise boundary this leaves).

## Package A — actual tools / qualified booking continuation (partial)

New file `apps/api/src/modules/voice-booking/voice-domain-tool-ports.ts` (`VoiceDomainToolPorts`)
replaces the gateway's prior `VoiceHandoffOnlyToolPorts`-only wiring for two of the four
non-handoff tools:

- `resolve_location`: calls real `GeoService.search` (mirroring `VoiceLocationService.resolve`'s
  own fail-closed provider-health gate) and returns up to three real candidates
  `{placeId, label, region}`. Does **not** call `VoiceLocationService.resolve` itself, since that
  requires an already-selected candidate, not a free-text query — doing so would substitute model
  text for a provider-resolved address, which this task's spec explicitly forbids.
- `get_bound_booking_status`: calls real `VoiceDispatchProjectionService.projectDispatch` for the
  gateway-resolved bound order, returning `{orderId, status}` where `status` is the real, honest
  `announcement` text (e.g. "司機已接單"), not a bare passthrough of `{orderId}`.
- `request_handoff` delegates to the existing `VoiceHandoffOnlyToolPorts` unchanged.

`apps/voice-media-worker/src/dialogue/call-turn-coordinator.ts`'s `executeTools` no longer forces
every non-`request_handoff` tool batch to a local `unavailable` stub. For any attachment with a
real `VoiceSessionBinding` and a real `apiClient`, the **whole** tool batch is now submitted in one
call to the existing `/handoffs` route (already generic across all tool names on the apps/api
side), requesting only the capability scopes the proposed tools actually need
(`session_execute` always; `address_resolve`/`order_read_bound`/`handoff_request` added per
proposed tool name).

**Precise remaining boundary (not fabricated, not attempted this session):**
`check_booking_eligibility` and `prepare_booking_readback` still route through the existing
`VoiceHandoffOnlyToolPorts` 501 (`VOICE_TOOL_NOT_IMPLEMENTED`), and a batch containing
`prepare_booking_readback` still forces the whole batch to the local `unavailable`/handoff stub
(exactly as every non-handoff tool did before this task), because:

- Both require deriving a `QualifyVoiceBookingCommand` (`pickup`/`dropoff` as a
  `VoiceLocationSelection{rawText, candidateId, entranceId}`), but the durable
  `voice.dialogue_snapshot.content.addressHistory[].candidates` only retains
  `{placeId, label, region}` — never the ephemeral `GeoService.search` `candidateId`
  `VoiceLocationService.resolve` actually requires. A correct implementation would need to
  re-run `GeoService.search` at commit time and match the fresh `candidateId` back to the
  durably-stored `placeId`; no caller does this today, and nothing in the current worker-side
  `executeTools` consumes `resolve_location`'s own result into
  `VoiceDialogueState.unresolvedAddress`/`addressHistory` yet either (that method exists but is
  currently unreferenced).
- `prepare_booking_readback` additionally requires the durable, server-resolved
  contact-role/sealed-consent snapshot that Package C (not started) would produce — the task
  spec's own `read_dependencies` for this unit already states this exact sequencing
  ("contact_role_revision durable output from contact unit before full same-case readback
  integration").

## Package B — recorder continuation / honest finalization (partial)

- `VoiceCommandRunnerService.handleFinalizeRecording` no longer returns a fabricated
  `{handled: true, finalizedAt}` result when no `VOICE_MEDIA_RECORDING_ADAPTER` is configured
  (confirmed: `voice-booking.module.ts` never registers one). It now throws, so
  `executeNextWorkItem`'s existing retry/fencing path handles it exactly like any other execution
  failure — retried with backoff, then `failed` after `maxAttempts` — and
  `completeWorkItemWithDomainState` is never reached for it (no fabricated
  `recording_bound`/`finalized` CRM/session/order writes).
- `completeWorkItemWithDomainState`'s `finalize_recording` branch now requires a real
  `manifestEvidenceRef` (`manifestRef.objectKey`/`checksum`) before any domain write, thrown
  inside the same transaction as the lease-fencing `status = 'completed'` update so a rollback
  leaves the work item exactly `leased` for the normal retry path. This is the single choke point
  every completion path reaches (the real-adapter result, any future registered custom handler,
  and direct callers alike).

**Precise remaining boundary:** no `VOICE_MEDIA_RECORDING_ADAPTER` provider is registered, and the
worker's `/recording/finalize` endpoint's `callAuthorityVerifier` remains genuinely unconfigured
(confirmed in `recording-adapter-factory.ts`'s own doc — a separate, still-missing CTI/IVR
call-authority channel, not something this task fabricates). Implementing an API-side HTTP adapter
that calls that endpoint today would, in the current deployment, always receive
`VOICE_MEDIA_CALL_AUTHORITY_NOT_CONFIGURED` regardless of what is sent, and there is no existing
API-side mechanism to mint a `callAuthorityToken` or to supply real segment descriptors (the API
layer has no durable record of recorded audio byte ranges) — building that HTTP client now would be
unverifiable scaffolding, not a functional change in system behavior, until the call-authority gate
is separately closed. Left open per this task's own explicit instruction not to enable a
false-success branch "merely to make the queue drain."

## Package C — durable contact/consent backend (done: durable store; mounted caller still open)

`infra/migrations/V0122__voice_contact_role_revision.sql` creates `voice.contact_role_revision`
(append-only, `UNIQUE (voice_session_id, revision_number)` -- a single counter shared across every
role for a session, matching `VoiceContactService.updateContactRole`'s existing
`++state.latestRevisionNumber` contract; NOT re-scoped per role, unlike the schema-preparation
report's draft). `phone_key_version`/`phone_nonce`/`phone_ciphertext`/`phone_auth_tag` reuse the
SAME AES-256-GCM envelope `voice-dialogue-snapshot-crypto.ts` already produces for
`voice.dialogue_snapshot` (same key, same module, different AAD binding each row to its own
`(voice_session_id, role, revision_number)`) -- not a bare ciphertext column, closing the
schema-preparation report's "C-P2" gap. `docs/04-uat/system-remediation-20260906/schema-allocation.json`
and `tests/unit/push-channel-sd-20261006/push-channel-sd-20261006.test.ts`'s length-one guard are
both updated to register/preserve this allocation alongside the existing V0106 entry.

`VoiceContactService` (`apps/api/src/modules/voice-booking/voice-contact.service.ts`) is now
durable when constructed with a DB-enabled `VoiceSessionRepository` (`isDbBacked()`), while staying
byte-for-byte backward compatible with every existing RAM-only call site and test (a repository
double lacking `isEnabled`, like `tests/unit/uv-exec-018.test.ts`'s own mock, safely falls through
to the original process-local behavior):

- **Cold reconstruction (C-P1)**: `coldReconstructState` rebuilds `assertedCallerPhone`,
  `bookerContact`/`passengerContact`, and -- the part the schema-preparation report flagged as
  unresolved -- `driverContactRole`/`callbackRecipientRole` and any custom override, purely from
  the append-only revision history. Since neither enum is its own column (adding one would
  duplicate what the revisions already encode), `initializeContacts` seeds TWO additional
  informational revisions when DB-backed (`driverContact`/`callbackRecipient`, reason
  `"default_role:booker"`/`"default_role:passenger"`), beyond the three RAM-only mode has always
  written; a later `updateContactRole` override for either role carries whatever caller-supplied
  `reason` it always did. `coldReconstructState` tells a default-pointer revision from a genuine
  override purely by that reason prefix -- see that method's own doc. The RAM-only legacy path
  (no `VoiceSessionRepository.isEnabled`) is untouched and still seeds exactly 3 revisions, matching
  every existing test's revision-count assertions exactly.
- **Transactional append + selective invalidation (C-P3)**: `updateContactRole`'s DB-backed branch
  inserts the new encrypted revision and calls the new
  `VoiceSessionRepository.invalidateUnconsumedConfirmationForContactChange` in ONE transaction --
  deliberately NOT the existing blanket `invalidateActiveConfirmationForSession` (which the
  schema-preparation report explicitly called insufficient on its own), since that preserves an
  already-`commit_status = 'pending'` confirmation's sealed proof (same "preservedPendingProof"
  rule `VoiceConfirmationService.invalidate` applies per-intent; this is the session-wide
  equivalent for a contact correction that is not scoped to one intent). Encryption key absence
  fails closed (`VOICE_CONTACT_REVISION_ENCRYPTION_UNCONFIGURED`, 503), same convention as
  `persistDialogueSnapshot`.
- **Durable read (`getEffectiveContactsDurable`)**: returns `null` (never throws, never fabricates)
  when no contact state has ever been recorded for a session -- the honest answer for every real
  call today (see the open boundary below).

New socket-free coverage:
`tests/unit/audit-voice-application-regression-20261018/voice-contact-durable.test.ts` (5 cases:
fail-closed on missing key, 5-revision durable seed including both default pointers, cold
reconstruction after a simulated process restart, honest `null` on an unknown session, and
transactional append + selective invalidation). Ran directly this session: 5/5 passed. Real
Postgres execution of the new migration itself remains the existing
`tests/integration/unattended-voice-postgres.integration.test.ts` HOSTED-only lane, not run in
this VM (same boundary every prior session in this task documented).

**Precise remaining boundary:** nothing in the live dialogue/booking flow calls
`VoiceContactService.initializeContacts`/`updateContactRole` today -- confirmed by a repo-wide
search finding zero callers outside this service's own tests both before and after this session's
changes. The durable store above is correct and ready, but a real call today still cannot produce
any `voice.contact_role_revision` row, because nothing invokes it yet. Deciding WHERE in the
dialogue/qualify-booking flow contact assertion belongs is a separate design question this task's
`read_dependencies` do not fix, and is not attempted here to avoid inventing an unreviewed call
site for a production write path.

## Package D — mounted contact/consent workbench projection (done: DTO + UI; data is empty until Package C gets a caller)

`VoiceCallbackService.loadDbTask` (the DB-backed callback projection path) now resolves the
session's durable, sealed `callbackRecipient` contact via the new
`VoiceContactService.getEffectiveContactsDurable`, replacing the previous hardcoded
`contactName: ""`/`consentRef: ""`. `EffectiveContactsResult` gained a `callbackRecipientConsentRef`
field so this resolution (custom override vs. booker/passenger default pointer) lives once in
`VoiceContactService`, not duplicated in the callback service. `packages/contracts/src/voice-callback-operations.ts`'s
`VoiceCallbackTaskView` now declares `contactName`/`consentRef` (previously present on the internal
service record but absent from the typed contract the UI/api-client/OpenAPI consume). The ops
console workbench (`apps/ops-console-web/app/callcenter/voice-callbacks/page.tsx`) renders both
fields in the task detail panel with a "not yet recorded" fallback (zh/en translations added).

This wiring is honest-by-construction: until Package C's open boundary above is closed (something
actually calls `initializeContacts` during a real call), `getEffectiveContactsDurable` returns
`null` for every session, and the UI legitimately shows "not yet recorded" -- not a regression, the
same empty state the prior hardcoded `""` produced, now sourced from a real (currently-unpopulated)
lookup instead of a literal.

**Not touched, and precisely out of scope for this allocation:** `contact_phone_encrypted`'s
pre-existing exposure under the `contactPhone` field name (it is caller-supplied ciphertext in a
format apps/api does not control, not a decryptable phone number) -- flagged in the
schema-preparation report ("Cold projection currently ... exposes the stored encrypted value as
contactPhone") and left as-is with an explanatory code comment, since renaming/resolving it was not
part of the four scoped mappings (C-P1..C-P4) and would need its own caller-side envelope design
decision. No `voice.callback_task` DDL change was made or needed, per the Root allocation's explicit
boundary.

## Validation evidence (session 2: Package C/D)

- `pnpm --filter @drts/api typecheck`, `pnpm --filter @drts/voice-media-worker typecheck`,
  `pnpm --filter @drts/ops-console-web typecheck`, `pnpm --filter @drts/api-client typecheck`,
  `pnpm --filter @drts/contracts build`: all clean after this session's changes.
- `eslint --max-warnings=0` on every file touched this session: clean.
- `tests/unit/push-channel-sd-20261006/push-channel-sd-20261006.test.ts`,
  `tests/unit/system-remediation/sr-recovery-contracts-20260911/sr-recovery-contracts-20260911.test.ts`,
  `tests/unit/system-remediation/sr-partner-notify-con-20260917/sr-partner-notify-con-20260917.test.ts`
  (the three ledger-guard files V0122's allocation touches or must not break): 80/80 passed.
- `tests/unit/audit-voice-application-regression-20261018/voice-contact-durable.test.ts` (new, 5
  cases): 5/5 passed.
- Full targeted voice/ledger suite re-run after all Package C/D changes (41 files, 689 tests,
  `--testTimeout=20000`): 678 passed, 11 skipped (the pre-existing HOSTED-only
  `*.postgres.hosted.test.ts`/`*.spec.ts` files), 0 failed -- including `uv-exec-018.test.ts`'s
  RAM-only `VoiceContactService` coverage (unchanged behavior confirmed) and
  `voice-dialogue-snapshot-persistence.test.ts` (the `[R34-F2 regression]` timing flake Session 1
  documented did not reproduce in this run).
- `VoiceCallbackService`'s new `contactService` constructor parameter and `VoiceCallbackTaskView`'s
  new `contactName`/`consentRef` fields were verified by code inspection against every existing
  `.postgres.hosted.test.ts` call site (`new VoiceCallbackService(undefined, h.database)`, omitting
  the new optional 3rd argument) to confirm they fall back to the exact same `""` values those tests
  already expect; these HOSTED-only files were not re-run in this VM (no Postgres available here),
  so this is a static-inspection claim, not an executed-test claim.
- No product/local HTTP/browser/DB/Compose servers were run. No real transactions or calls were
  made. `tests/integration/unattended-voice-postgres.integration.test.ts` and the other
  `*.postgres.hosted.test.ts`/`*.spec.ts` files in this task's write_scopes remain HOSTED-only and
  were not executed in this VM.

## Validation evidence (session 1: Package A/B)

- `pnpm --filter @drts/api typecheck` and `pnpm --filter @drts/voice-media-worker typecheck`: clean
  after every commit in this session.
- `eslint --max-warnings=0` on every file touched in this session: clean.
- Full targeted voice unit suite (vitest, this worktree,
  `tests/unit/audit-voice-application-wiring-20261003/`,
  `tests/unit/audit-voice-application-regression-20261018/`,
  `tests/unit/system-remediation/sr-recording-recovery-20260913/`,
  `tests/unit/voice-recording-order-context-20261018/`, `tests/unit/uv-exec-010*.test.ts`,
  `tests/unit/audit-voice-runtime-20261002/media-recording-finalize-authorization.test.ts`,
  excluding `session-binding-resolution.test.ts` per the task spec's own note that its remaining
  listener cases are excluded from socket-free selection): 387 passed, 1 failed at
  `tests/unit/audit-voice-application-wiring-20261003/voice-dialogue-snapshot-persistence.test.ts`
  (`[R34-F2 regression] ...`, timed out at 5000ms under full-suite load; this file has no diff from
  any commit in this session; a standalone rerun with `--testTimeout=20000` passed in 5.76s; no
  baseline-SHA comparison was obtained).
- New tests added this session:
  `tests/unit/audit-voice-application-regression-20261018/voice-domain-tool-ports.test.ts` (9
  cases covering `VoiceDomainToolPorts`'s resolve_location/get_bound_booking_status/fallback
  behavior in isolation),
  `tests/unit/audit-voice-application-regression-20261018/voice-recording-finalize-no-adapter.test.ts`
  (1 case proving the no-adapter path stays retryable with no domain writes), two new cases in
  `tests/unit/audit-voice-application-wiring-20261003/call-turn-coordinator.test.ts` (generalized
  tool routing for a bound attachment, and the `prepare_booking_readback` honest-fallback case).
- `tests/unit/audit-voice-application-wiring-20261003/trusted-turn-composition.test.ts`: one fetch
  response branch added for `/handoffs` (coordinated scope grant recorded at
  `.local/passenger-bureau-gap-correction-20261018/Voice-R4-exact-fetch-fixture-scope-coordination-20261018T205514Z.json`),
  since its "R4-control boundedness" test's "你好" transcript now reaches real `resolve_location`
  routing via the shared fixture adapter. No existing assertion in that file was changed.
- `tests/unit/system-remediation/sr-recording-recovery-20260913/recording-recovery.test.ts`: one
  stale fixture (the no-audit-table-tolerance case) adapted to supply a real
  `manifestRef`/`recordingId` (coordinated scope grant recorded at
  `.local/passenger-bureau-gap-correction-20261018/Voice-B-manifest-and-exact-recording-recovery-fixture-scope-coordination-20261018T2233Z.json`).
  Every other assertion and the file's test count are unchanged.
- No product/local HTTP/browser/DB/Compose servers were run. No real transactions or calls were
  made. `tests/integration/unattended-voice-postgres.integration.test.ts` and the other
  `*.postgres.hosted.test.ts`/`*.spec.ts` files in this task's write_scopes remain HOSTED-only and
  were not executed in this VM.

## Candidate identity

Branch: `claude2/audit-voice-application-regression-20261018`, pushed. Commits, in order:
`2d948ac01` (Package A partial, session 1), `ffb035979` (Package B partial, session 1), `213bc3908`
(session 1 UAT handoff), `d450668fb` (V0122 allocation: migration + ledger + guard, session 2), and
this document's own commit (Package C/D implementation, session 2) is the final commit of this
candidate; see `git log` on that branch for the exact SHA. Codex should independently review this
exact candidate's real orchestration and the precise remaining boundaries above — green CI/typecheck
alone is not functional completion, and this is not a request to treat A, B, or Package C's "mount a
production caller" boundary as fully done, or to close any original archived verdict.

## Codex2 continuation checkpoint, 2026-10-19

Owner handoff preserves Claude2's original ten WIP files (custody SHA256
24b4eaff765c73bb66dd3c90a380f22eea01c0a22d7c6b553649e413b0ab3d05).
Commit 040256fd6 records Original-Author: Claude2; ordinary merge
1b05c3a1ff1e3765253ea1d00ac5abc8ab716524 includes accepted shared baseline
61fa7cf44fb25d8be36634357fa3549286b96b84. This checkpoint is **not** a full
candidate or completion claim. Original F1–F8, full ABCD, four acceptance keys,
5000ms defaults, 10000 held rows/three previews/62 assertions remain required.

| Finding     | Production repair                                                                                                                                                                                                                                                                                                                                     | Before → current evidence                                                                                                                                                                                         | Remaining                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| F5/F6       | Contact initialization locks the original session before reading/allocating; durable readers refresh; edits no longer rebind existing callback tasks.                                                                                                                                                                                                 | Same service regression at immutable 1b05c3a1: 2 failed / 9 passed; current 11 passed. Logs under own worktree `.local/voice-evidence/contact-{before,after}.log`.                                                | Genuine PostgreSQL transaction/race verification hosted only.                                                                    |
| F5/F8       | Callback creation selects the authoritative revision under the same session lock; seals the server phone/consent; explicit selected revision/consent fence; original tasks and receipts keep their identity. Cancelled original + fresh consent creates a related replacement. DTO/workbench show usable phone, role, revision, evidence and history. | Immutable 1b05c3a1 callback production-service probe: 2 failed (ciphertext phone, stale consent accepted); current three callback cases and four mounted SDK/workbench cases pass. SQL transport only is doubled. | Hosted formal schema/browser; additional operational regressions pending.                                                        |
| F4          | Worker binding read seeds from original durable CRM ANI; existing ops/platform realms expose a correction route calling the production durable contact service.                                                                                                                                                                                       | Actual getSession/writeContacts call graph; producer regressions pending.                                                                                                                                         | Dialogue/contact consumer integration remains in progress.                                                                       |
| F1/F2/F3/F7 | Original findings retained.                                                                                                                                                                                                                                                                                                                           | Earlier WIP is partial; scoped passes do not close these findings.                                                                                                                                                | Complete qualified intent/readback and recording producer/consumer/manifest composition; remaining cold/transaction regressions. |

API source typecheck initially resolved stale shared package dist; a local
source-path configuration then exposed one exact-optional input mismatch, now
fixed. Final typecheck/lint and complete regression results are recorded by
later checkpoints. No VM servers, provider calls, hosted PG/browser runs or
production readiness have been claimed here.

### Functional continuation checkpoint 2 (Codex2)

This remains a progress anchor, not a review candidate. Source now connects the
original services rather than leaving internally implementable units as an
external-provider omission:

- F1: durable explicit provider candidate/entrance selection re-resolves through
  Geo/VoiceLocation, calls the original qualifier, transactionally promotes an
  immutable intent/draft, then consumes the original beginReadback plan. The
  worker publishes the server-controlled playback identity under existing
  generation/cancellation fences. No playback completion becomes consent.
- F2/F3: the actual composer subscribes to an independent normalized recording
  fork/closure source. SealedRecorder writes and reads actual immutable audio
  objects; first-party client/controller/repository preserve segment/checkpoint/
  closure/finalized metadata in allocated V0125. Closure and original finalize
  work insertion share the session transaction. First-party adapter and worker
  continuation read this journal, verify the full immutable final manifest and
  persist its exact identity for fresh-process/lost-response replay. ASR/TTS and
  WebSocket close do not produce recorded channels or call closure.
- F4/F6/F7: worker binding read seeds immutable ANI from durable CRM. The original
  current dialogue snapshot can correct typed A/B contact data under its session
  authority/epoch/snapshot lock, without inferring consent. Typed default versus
  explicit role selection survives restart. When A admits before B's details
  arrive, automatic driver default follows B; an explicitly selected role stays
  selected. Warm reads and all durable revision allocation use authoritative data.
- F5/F8: callback creation selects a server revision/consent in the transaction;
  sealed phone/hash/lookup projection derive from that same server contact. Older
  task and receipt identity remains immutable. The mounted zh/en workbench saves
  explicit corrections, shows genuine role/revision/phone/evidence/history and
  creates a related replacement only after the original is cancelled with fresh
  consent. Ambiguous creation retries recover the original receipt/key.

Evidence under this worktree's `.local/voice-evidence/`:

| Item                   | Immutable before                                                                                                                      | Current scoped result                                                                                                                                                                                               | Limits                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 original ports      | 1b05: actual qualifier/readback continuation two failures (501)                                                                       | `qualified-after-final.log`: 2 passed using real qualifier/location/service-area/product/repository/confirmation                                                                                                    | Geo, issuer and SQL transport doubles; no PostgreSQL transaction claim                                                                                                                                         |
| Controlled playback    | 1b05: actual registration returned sandbox random ID, one failure                                                                     | `playback-after.log`: new playback case and original UV008 passed                                                                                                                                                   | Upstream ASR/TTS are explicit SIM                                                                                                                                                                              |
| F2 producer/consumer   | Original fullreview source trace retained                                                                                             | `recording-continuation-after.log`: 2 passed through composer, sealed audio/object readback, actual HTTP client/controller/repository, closure/work and first-party finalization; cold replay retains exact version | SQL/HTTP/object-store transport and upstream recording authority are doubled; formal hosted PG pending                                                                                                         |
| F3 completion boundary | `manifest-before-source.log`: 6 failed / 5 passed at 1b05; prior loader errors are not reproduction evidence                          | `recording-all-fixed.log`: 34 passed, including all original zero/one-order, late linked-order and no-audit-table positives                                                                                         | Socket-free transaction transport; hosted rollback/races pending                                                                                                                                               |
| F4 session producer    | `contact-producer-before.log`: filtered actual original getSession case failed with zero durable rows; three other cases not selected | `contact-producer-and-real-mounted.log`: 9 passed including actual ANI seed, later A-for-B defaults and real services consumed by mounted SDK/workbench                                                             | Transport doubles; mounted JSDOM, not a hosted browser                                                                                                                                                         |
| Original R34 default   | `original-default-5000-snapshot.log`: 61 passed / one timeout (8385ms)                                                                | `original-default-5000-snapshot-fixed.log`: all 62 passed, test runtime 3.72s, command exit 0                                                                                                                       | Only SQL transport helper key/date decoration changed; each query remains fresh with identical filter/order/page. Original 10000 held rows, three previews, all 62 assertions and default5000 remain unchanged |

Normal root typecheck failed against stale/missing shared workspace package dist;
API and worker source checks passed. A complete source-alias root check, scoped
lint, final full regression, formal hosted PG/browser and same-candidate CI are
still pending. No result from these socket-free doubles certifies genuine
external recording authority, S3 resources, CTI, issuer, model or PSTN. Actual
main composition keeps those unconfigured boundaries visible and
productionCapable remains false. No VM runtime/server/database was started.
