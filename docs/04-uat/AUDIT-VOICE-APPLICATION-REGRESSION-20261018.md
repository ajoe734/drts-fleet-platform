# AUDIT-VOICE-APPLICATION-REGRESSION-20261018

Source regression child of AUDIT-VOICE-APPLICATION-WIRING-20261003 at `ba0b164ed8fab3f0dd68ace92a18d0376c0a9031`.
Current owner: Codex2. Original WIP author: Claude2. Reviewer: Codex. Priority: P2.
Required acceptance: `composed_turn_and_recording_path`, `authority_epoch_consent_fences`,
`precise_unimplemented_and_external_boundaries`, `same_sha_review_ci`.

The current continuation retains the original full A/B/C/D seventeen clauses,
F1–F8, and all four acceptance keys. The canonical Supervisor transferred the
original task from Claude2 after the actual provider billing failure. Claude2's
ten-file custody checkpoint is `040256fd6`; ordinary merge `1b05c3a1ff1e3765253ea1d00ac5abc8ab716524`
includes accepted baseline `61fa7cf44fb25d8be36634357fa3549286b96b84` without
rewriting either history. Original checkpoint notes below remain historical.

Current implementation connects qualified booking/readback, independent recording
fork/closure persistence and finalization, durable contact revisions, immutable
callback bindings and the mounted zh/en correction/replacement flow. Local
socketfree evidence and explicit external boundaries are recorded in the latest
section at the end. Genuine PG/browser execution and independent same-candidate
review must be recorded separately; local transport doubles do not certify them.

## Historical original-author custody notes

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

## Codex2 complete-scope implementation and verification, 2026-10-19

The latest source finishes the internal implementation identified by the original
review on `749ff69b8c28166106b600d6966bc45c1fc44292`. This is an owner evidence
record; approval, merge, shared deployment and live external-provider readiness
remain independent. The four acceptance keys and all original clauses remain.

| Finding | Current source/behavior                                                                                                                                                                                                                                                                                                                                                                  | Meaningful before → fixed evidence                                                                                                                                                                                                                                                            | Limits                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | `VoiceDomainToolPorts.prepareBooking` uses current durable contacts and explicit provider selections, calls the original qualifier, promotes an immutable intent/draft and calls `beginReadback`. Coordinator consumes the complete matching script/playback plan; media session registers that controlled ID under original generation/cancellation fences.                             | Immutable 1b05 ports: two 501 failures; fixed qualified composition passes with the actual encrypted contact repository. Immutable 1b05 media playback returned a different ID; fixed controlled playback and original UV008 pass. Full server-plan positive and mismatched-ID negative pass. | Geo/model/issuer/SQL transport are SIM; playback completion remains distinct from consent.                                                           |
| F2      | Actual composer subscribes to independently normalized recorder input. `RecordingContinuation` seals/readbacks bytes, verifies checkpoints and trusted closure, persists through actual first-party client/controller/repository/V0125, then configured factory/API adapter/worker reads the durable final version. Original close work key is shared with closure; no second queue row. | Actual composer→SealedRecorder→object readback→journal→adapter→manifest/cold replay passes. Immutable aef3 double enqueue reproduces two work rows instead of one; current regression passes. Missing outbound and different replay payload remain denied.                                    | External fork/call authority and object/HTTP/SQL transport doubled locally. No TTS/WS-close-generated closure. True hosted durability is pending CI. |
| F3      | `validateFinalRecordingResult` requires correlated recording/brand/call/leg, immutable object/version/SHA/positive bytes/times and full bidirectional closure coverage before original domain writes. Canonical journal supplies missing recording identity; no `rec-callId` guess.                                                                                                      | Immutable 1b05: six manifest failures; fixed manifests plus original zero/one-order, late-order and no-audit-table positives pass. Missing adapter still leaves work retryable. Two typed hosted external-recorder fixtures now produce full SIM attestations from real scope.                | Synthetic attestation fixtures only model the external recorder; genuine SQL/order/queue checks remain hosted.                                       |
| F4      | Actual worker binding reader seeds original durable CRM ANI; mounted original ops/platform contact routes and current snapshot typed A/B consumer call the durable contact service.                                                                                                                                                                                                      | Actual original `getSession` producer before: zero ledger rows; fixed producer and real service/SDK/mounted page pass.                                                                                                                                                                        | No new identity/permission mechanism. ANI is never replaced by model or contact correction.                                                          |
| F5      | Same session transaction selects server contact revision/consent, encrypts the genuine server phone and appends a unique callback creation binding. Receipts and tasks keep that original selection; cancelled original plus new consent creates a related replacement.                                                                                                                  | Original callback service before: ciphertext shown as phone/stale consent accepted; fixed actual service/cold read/receipt and mounted replacement recovery pass.                                                                                                                             | PG concurrency/rollback is covered in the hosted suite, not claimed from local doubles.                                                              |
| F6      | Original session lock precedes every init/read/max+1 append. Durable readers refresh; cache changes only after successful commit.                                                                                                                                                                                                                                                        | Original concurrent init: duplicate revisions; fixed concurrent init and warm reader pass. Invalidation failure rolls back revision and cache; retry receives the same next revision.                                                                                                         | Added real two-repository initialization/edit/transaction refusal retry checks await hosted CI.                                                      |
| F7      | Persisted `role_source` distinguishes default pointer, selected pointer and explicit edits. Free reason text cannot change semantics; automatic A-for-B driver defaults follow B while selected/custom roles remain intentional.                                                                                                                                                         | Original regression for reason literally `default_role:passenger` stays explicit across cold reconstruction; default/selected controls pass.                                                                                                                                                  | No new consent inferred from A/B dialogue content.                                                                                                   |
| F8      | Actual task DTO, SDK and mounted zh/en workbench show server phone/role/revision/consent/history and original/replacement relation. Correction submits a genuine revision plus consent; ambiguous replacement reuses stored request identity and reads its receipt first.                                                                                                                | Mounted real services/SDK/page and original intent/receipt/action controls pass.                                                                                                                                                                                                              | JSDOM is local mounted coverage; real hosted browser run remains required.                                                                           |

C's required retention follows the existing `voice_booking_evidence` catalog and
`VoiceRetentionService`, with a finite expiry fixed from the original session's
creation time. Replay/correction cannot extend it. Durable and cached reads stop
exposing expired contact content; old sessions cannot recreate purged revision
identities. The bounded operational purge follows V0093's transaction-local
archival setting, excludes existing active legal holds before its page limit,
deletes only expired closed-session bindings/revisions, and writes the existing
execution log in the same transaction. Original callback tasks/receipts remain.
No new scheduler, permission policy, provider setup or real-data purge was run.
The immutable aef3 retention probe fails for missing finite expiry; current local
expiry/read/reinitialization checks pass. Hosted checks include actual archival,
hold/release, dry-run/apply and preserved original task rows.

| Original clause | Implemented chain / retained boundary                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1              | Real Geo candidates, at most three; persisted place/entrance selection re-resolves fresh provider candidate identity.                                         |
| A2              | Durable session/dialogue/current contacts → existing qualifier; serviceable/manual-review/not-serviceable outcomes preserved, no vehicle promise.             |
| A3              | Immutable intent draft transaction → original beginReadback/proof/command writer; V0106 remains candidate dialogue only.                                      |
| A4              | Authorized bound order → persisted dispatch projection/status.                                                                                                |
| A5              | Existing route/client/gateway/coordinator with stage aborts and current authority fences; original handoff and disabled operations retained.                  |
| B1              | Missing adapter or incomplete manifest cannot complete work or mark recorded.                                                                                 |
| B2              | Configured first-party adapter → worker durable journal/final version; cold/lost-response replay retains exact immutable object identity.                     |
| B3              | Full correlated manifest/recording/coverage validation before domain writes; original checkpoint refs and call/order locking remain.                          |
| B4              | Actual independent recorder fork/closure producer → append-only V0125 journal → finalize; upstream authority remains explicitly SIM/unconfigured when absent. |
| B5              | Original late-tail zero/one-order/late-order/on-trip recovery positives retained.                                                                             |
| B6              | Existing background loop includes finalize only with configured actual adapter; closure and call close share one original work key.                           |
| C1              | Encrypted durable session-wide role revisions, original ANI immutable, A/B distinct, original finite retention convention consumed.                           |
| C2              | Same transaction appends material changes and invalidates relevant unconsumed confirmation, preserving accepted pending proof.                                |
| C3              | Callback create/receipt binds genuine server revision and consent with original key/payload/CAS/closed-call operations.                                       |
| C4              | Existing tasks never silently retarget; new consent plus explicit cancelled-task replacement preserves history.                                               |
| C5              | Existing DTO/SDK/workbench exposes usable actual phone/role/revision/evidence/history and authorized outcomes.                                                |
| D1              | Actual mounted zh/en contacts and sealed-consent projection/correction/replacement uses C's readers and original policies.                                    |

Verification evidence lives in the owned worktree `.local/voice-evidence/`:

- `original-full-socketfree.log`: original full selected command, **exit 0,
  36 files / 679 passed**, no skips. Original listener file is excluded.
  Original default 5000ms, 10000 held receipts, three previews and all 62
  snapshot assertions are preserved. The fixture sorts decorate each row once
  per fresh query; no cached pages, fewer rows or removed assertions.
- `full-functional-final.log`: initial 238 pass / two fixture scope failures
  (`binding` helper declared inside its describe). This is retained as a test
  failure, not a product reproduction. Fixed helper scope and re-execution in
  `full-functional-fixed.log`: **exit 0, 19 files / 240 passed**, no skips.
- `retention-work-fixed.log`: **exit 0, 16 passed**. `recording-dedup-before.log`
  and `contact-retention-before.log`: genuine immutable aef3 product failures,
  one selected failure each; nonselected cases are not coverage.
- API source check `api-source-final.log`: exit 0. Worker source check
  `worker-source-final.log`: exit 0. Source aliases avoid the VM's stale shared
  workspace dist; normal clean builds remain a hosted requirement.
- Final root source check and scoped lint are recorded at candidate preparation;
  earlier root check found the same newly added helper scope error, corrected
  above. No historical root/dist failure is relabelled as success.
- Full-schema hosted additions in original callback create-receipt suite cover
  real two-instance contact init/edit/replay/rollback, sealed original/replacement,
  finite expiry/hold/archival, and V0125 same-payload replay/different-payload
  refusal without control-watermark consumption. Original dispatch hosted
  positives seed only SIM upstream closure through the real journal and retain
  every original dispatch/order/lease/single-work assertion and timeout.
- Formal schema consumers include V0122/V0125 and both new table names. Shared
  ledger/guard edits remain confined to this task's entries; Complaint V0123,
  SOS V0124 and all other allocations remain for Root's serial integration.

| Required acceptance key                       | Evidence / outstanding acceptance                                                                                                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| composed_turn_and_recording_path              | Actual internal producer/consumer compositions and original regressions pass locally; full hosted PG/browser run and Root review pending.                                                                   |
| authority_epoch_consent_fences                | Original full regression and new role/revision/manifest/controlled playback/receipt negatives retained; true PG transactions await same-candidate hosted evidence.                                          |
| precise_unimplemented_and_external_boundaries | Default missing issuer/model/fork/call authority/storage/PSTN stays explicit/unavailable; external SIM labelled. `productionCapable=false` remains. No internal API/DB work is excused by external absence. |
| same_sha_review_ci                            | Final source SHA, remote head, new PR and exact hosted runs are recorded in the canonical handoff after checks. No self-approval/merge/deploy/acceptance claim.                                             |

Final local checks: `root-source-fixed-final.log`,
`ops-source-fixed-final.log`, `api-source-final.log`, and
`worker-source-final.log` each completed with exit 0. Root includes `.ts`
checks; the separate Ops source check covers the mounted `.tsx` application.
The Ops check's initial missing Google namespace was a task-local config type
lookup relative to `.local`; restoring the app's original `@types` lookup
completed without source type-policy changes. `final-scoped-lint-complete.log`
completed exit 0. `workbench-workflow-final.log` completed exit 0, five files /
70 passed after the real replacement queue refresh fix.

The real browser's normal preparation now writes explicit SIM consent through
`/callcenter/voice/sessions/:id/contacts` and consumes the server's revision/ref.
Its existing isolated hosted job supplies a public SIM contact-crypto fixture
key/version; no native account/provider/deployed credential is changed. The
original three-task/eight-receipt browser assertions remain intact. Added
browser steps verify actual contact correction, immutable original phone/consent,
new replacement binding, a committed-but-lost response, reload/receipt recovery
with one create request and the same original order. This browser code was not
executed on the VM; exact-candidate hosted evidence remains required.

Authorship correction: the four anchors `040256fd6`, `1b05c3a1f`, `6b3178bf9`
and `aef3a7dbd` were executed by Codex2, but mistakenly inherited the machine's
Git author `Gemini2 <gemini2@google.com>`. Their Codex2 trailers and original
Claude2 WIP credit remain factual. These commits are preserved without amend,
rebase or force-push. Subsequent normal commits explicitly select the existing
Codex2 identity for that command only; no shared/global configuration is changed.

Final composed boundary follow-through:

- `VoiceApiClient` now consumes the actual global `SnakeCaseInterceptor` wire
  contract using the same recursive key restoration convention as the existing
  SDK. The original aef3 client reproduces missing camel scope/event/readback
  fields (`voice-api-wire-before.log`: one failure); values such as immutable
  ids, hashes and opaque strings are unchanged. F1 now exercises actual HTTP
  client → controller → original gateway → durable encrypted contacts → real
  qualifier/immutable draft/readback; F2 composition uses the actual snake wire
  producer before its client reads the journal. `full-http-continuation-final.log`:
  exit 0, five files / 68 passed, including original client regressions.
- Actual A2 service-area manual-review and not-serviceable outcomes preserve the
  domain's reason and cannot create drafts/confirmations. Current durable
  passenger-count candidate is consumed when no normalized value exists;
  candidate 5 retains the original verified-capability/human-handling refusal.
  `qualified-conditional-final.log`: five cases passed before adding the full
  HTTP composition, which is included above.
- The original call-close service genuinely downgraded already-finalized
  recording state when control close arrived later: `late-control-close-before.log`
  is one failed / one positive. Root formally added the exact service hunk as
  scope 63; the repair preserves `finalized` and otherwise retains `finalizing`.
  Control events/sequences/version/lease/work/replay remain unchanged.
  `late-control-close-fixed.log`: exit 0, both cases pass. True hosted ordering
  now covers actual journal/runner/domain completion before actual control close
  and asserts one original completed work row; pending hosted is not a pass.

Final complete socketfree union: `complete-socketfree-final.log` completed
**exit 0, 61 files / 987 passed, zero skips**, with the original default
5000ms, `--maxWorkers=1 --no-cache`, original 10000 held/three-preview/62-assertion
snapshot regression and every old positive retained. The union includes the
original complete socketfree selection, UV010 checkpoint writer, all new
original-task regressions, callback memory/intent/mounted workbench, recording
order context/recovery, allocation guard and original Ops Shell unit suite.
Only the original listener file and formal hosted-only PG/browser execution
remain outside that local command. API and worker final source checks completed
exit 0 in `api-source-delivery.log` and `worker-source-delivery.log`.

Delivery-source checks also terminated successfully: `root-source-delivery.log`
and `lint-delivery.log` each exit 0. These include the final HTTP wire, conditional
qualification, late-close and hosted test source. Final source is submitted by a
normal Codex2 commit/plain push; the exact SHA/PR/hosted results are frozen in the
canonical handoff, and hosted failures remain implementation work until resolved.

### Hosted d656 results and original-consumer fixture correction

The immutable d6567ebaab2a8aa9da6d210bfde0e2d387ca477c candidate on new PR2818
ran the real hosted Ops Shell browser (39197272304): **six passed, zero skipped,
unexpected or flaky**. Full artifact evidence retains the original three tasks /
eight receipts and verifies one replacement creation/binding after contact
correction, fresh explicit SIM consent and lost-response/reload recovery. Original
phone/revision 0900000016/6 remains sealed; replacement is 0900000017/7 on the same
order. This result belongs to d656, not its successor.

Three hosted d656 jobs failed and are retained in full under
`.local/voice-evidence/failure-{117883087193,117882675875,117882675830}-full.log`.
The two API/integration jobs expose the same UV002 expected-catalogue mistake:
the real migrated database contains all 32 tables, while the expected list had a
duplicate callback binding and misplaced recording journal. The correction
preserves exact equality against all 32 unique, alphabetically ordered tables.
No migration or product guard is weakened.

The root unit shard's UV023 idle-runner positive lacked a configured recorder.
Its real runner correctly refused missing-adapter completion. The original
success assertion remains; its existing external-recorder fixture now explicitly
configures a typed SIM adapter with the actual requested scope, leg, recording
identity, immutable version/SHA/bytes and complete bidirectional closed coverage.
The production runner and central manifest validation remain real. The precise
socket-free idle case reproduces d656's failure in `uv023-d656-idle-before.log`
and passes in `uv023-fixed-idle.log`; three unselected cases are not coverage.
Missing-adapter and incomplete-manifest negative regressions remain unchanged.
Formal migration and the entire UV023 file, including listener behavior, require
the successor's hosted CI; d656 greens are not relabelled as successor results.

VM verification correction: a full UV023 command was mistakenly started before
the adjacent listener case was identified, then immediately interrupted (exit
130, only the RUN banner, no test result). `uv023-d656-before.log` is retained as
an aborted command and is never pass evidence. No process was left running.
Subsequent VM commands select only the socket-free idle case. The final delivery
packet records all started hosted runs to terminal with pass/fail/skip separated,
binds them to the exact source and retains the full four-key/F1–F8/17-clause map.

### Original A2 structured luggage and capability continuation

Independent full-scope readback identified that d656's real domain ports discarded
luggage and equipment requirements even though the original qualifier and dispatch
already enforce them. `a2-requirements-d656-before.log` runs the real immutable
d656 ports and records four actual failures: two luggage items became zero in the
immutable draft, and wheelchair, child-seat and oversized-luggage requests wrongly
produced ordinary readback plans. Seven unselected cases are not coverage.

The original dialogue contract now exposes structured luggage count, size and
capability fields; the original per-turn seven-slot limit remains. The generic
dialogue engine/state serializer and cold reader preserve their source evidence.
Ports consume the current durable candidates, validate them with the existing
booking-requirements schema and call the existing qualifier. Notes never infer
equipment. Explicit malformed values are rejected rather than discarded. Ordinary
two-item luggage remains in the immutable draft and actual server readback;
wheelchair/child-seat/oversized requests retain the original human-handling refusal
with no draft or confirmation. No vehicle capability or booking policy changed.

`a2-requirements-final.log`: **exit 0, two files / 42 passed, zero skips**,
including every original UV013 provider/time/product/requirements/assignment
case, original count-five and service-area positives/negatives, the real dialogue
producer → serialized cold snapshot → qualifier/draft path and four malformed
explicit-slot refusals. UV013's real candidate/assignment path continues rejecting
changed luggage capacity. SQL/model/provider transport is SIM locally; actual
formal-schema and browser evidence still must bind to the final successor.

### Original configured admission and actual cold finalize follow-through

Independent support reviewed the complete d656 four-key/F1–F8/17-clause scope
(`voice-d656-original-full-independent-support-review-20261019/review.md`,
SHA256 `6b320b42cd520141b5c1c54ddf5850dd6492702191ca7041233511f5b9ce96af`).
Its R1/R2/R3 identify unfinished original functionality. Neither original guard
is misrepresented as a newly introduced regression. R3 is repaired above.
Root normally coordinated the genuine binding interface/fixture and original
session-authority seam as scopes 64–66; all original scopes/spec/keys remain.

R1 now uses the actual API session → resource-scope join for brand identity and
the session's canonical call ID. Main consumes the same exported resolver as the
composition regression. The worker compares like brand/call identifiers while
retaining resource-scope UUID, session, route and lease coordinates. No UUID is
treated as a brand and no original scope check is removed.

R2 persists original verified admission and actual consumed attachment as distinct
append-only V0125 domain events. The original grant's noncredential admission ID
binds its principal/epoch/full recording scope across those events. Pending ACK
precedes HTTP201; consumed-attachment ACK precedes handshake/composer/fork effects.
Unknown commit/response loss requires exact original API readback, including the
current admission. A cold finalize reads the latest admission across recording
scopes plus its real consumed attachment, checks the current finalize token, and
restores the original authority metadata only when it cannot replace pending or
different RAM authority. Original operation, grant/TTL/one-use/revocation and
epoch/scope checks remain. Finalized-event persistence rechecks the authoritative
admission under the same original session lock, including a newer same-scope
epoch racing sealing. No request body or token creates attachment history, and
the journal never consumes control sequences/watermarks.

The previous composition's class restart called `runtime.finalize()` directly;
that was core replay evidence, not a cold HTTP endpoint pass. The new regression
uses actual request/upgrade handlers (no listening socket), actual API client and
controller/repository, actual grant consumption, sealed audio/object/checkpoint
readback and the first-party adapter's actual finalize HTTP request against a
fresh worker. Recording transport, SQL transport and external issuer/store are
SIM locally. The original final manifest/object version is reused with one work
item. The precise before/fixed logs are:

- `f2-admission-http-d656-before.log`: genuine HTTP409 instead of201 with distinct
  brand/scope identifiers.
- `f2-r1-fixed-cold-real-before.log`: after genuine API binding admission/consume
  and sealing succeed, the new worker rejects the same valid finalization with
  HTTP403. This isolates the remaining actual cold consumer.
- `f2-http-fences-final.log`: **exit 0, two files / 35 passed, zero skips**,
  retaining all original recorder authorization cases. Added actual-handler cases
  cover committed admission/attachment/finalized ACK loss, pending-only denial,
  known journal refusal, unresolved attachment ACK/read outage, ACK-before-effect
  ordering, later exact readback without invented bytes/closure, retry admission,
  newer same/different-scope admission, stale journal versus newer RAM, and a seal
  commit race. Both warm and cold refusal/positive paths are exercised.

Early `f2-cold-http-d656-before.log` and intermediate binding-fixture logs contain
test harness errors (missing binding/client), not business reproductions. They
remain retained and have no before/pass credit.

The original full-schema hosted suite now also calls this actual API binding /
HTTP admission / consumed upgrade / sealed-byte+checkpoint producer chain against
real PostgreSQL, loses each of three committed API acknowledgements, and runs the
original queued runner/domain completion through a fresh worker. It asserts the
same manifest, no new object, one completed work, sealed recording state and
unchanged control/input watermarks. This case is authored and typechecked; it
remains **unexecuted pending successor hosted CI**, never a local PG pass.

Version qualification correction: automatic PR run39197226469 product jobs
checked out merge `c79b7bbeb6b877994d15f0fab2e7724d49a52959` (d656 into a7ec),
not literal d656. Its six full reports have12713passed/2failed/41pending; the
callback16/dispatch13/operations9/commands11 PG successes are merge diagnostics
only. No tree equality or literal-source credit is inferred. Dedicated browser
39197272304 is literal d656; manual integration39197246720 and the successor's
necessary exact-source CI remain separately recorded to terminal.

The hosted browser successor also switches the actual locale cookie/storage to
English and reads the same sealed original/replacement phone, revision, consent
and history, with the same single creation. Original zh operations and all prior
assertions remain. The English browser extension is pending hosted execution;
d656's six passes establish its zh flow only. Main's stale all-tools-unavailable
startup message is corrected to describe the actual configured internal path and
the remaining explicit external provider/model/issuer/fork/storage boundaries.

The successor complete socketfree selection is explicitly listed in
`successor-complete-socketfree-fixed-command.json`. The first run retained two
failures in `successor-complete-socketfree.log`/`.json`: an old capability
fixture without a brand received an incomplete `recordingContext`, and the
unchanged 10000-held/three-preview snapshot case exceeded default5000 while a
root source typecheck ran concurrently. The controller now emits recording
context only for a genuine canonical brand; the real resolver still rejects
missing context. No old assertion or fixture was weakened. The same 61-file
selection reran without competing typechecks: **exit0,1030passed,zero failed or
skipped**, in `successor-complete-socketfree-fixed.log`/`.json`. Original snapshot
rows, three previews,62 assertions and default5000 remain unchanged. A2 and R2
add actual qualifier, admission/ACK/cold-consumer cases; the full source paths
and every case status are recorded in the JSON rather than inferred from counts.

Both old integration workflows are terminal failure, separately qualified:
39197226487 (automatic PR merge) and39197246720 (manual immutable d656).
Their complete raw records contain70611/71614lines and each has exactly two
failed cases: UV002 schema expectation and UV023 unconfigured idle positive.
The unit and final gates aggregate those failures; other recorded skips are
not passes. `d656-terminal-full-verification.json` preserves every job status,
all failures,20test summaries per run and raw hashes. The already committed
336fixture repairs await successor hosted verification. Old d656 logs and all
previous positive/negative evidence remain retained. No old pass is promoted
to a successor SHA. All66scopes, four required keys, original ABCD17 clauses
and F1–F8 remain in force; this source checkpoint is not reviewer approval,
merge, deployment or completed acceptance.

The immutable a1 continuation and subsequent accepted integration are kept
separate. Literal browser39201733632 passed all6cases with zero skipped,
unexpected or flaky results. Its17stages contain actual zh operations followed
by one English sealed-history readback, not a full second English operations
matrix. Original A/0900000016/revision6/consent stays immutable; one replacement
C/0900000017/revision7/fresh SIM consent uses the same original order. Saved
complete report, API/SQL facts, screenshot07 and raw identify exact a1. External
issuer/fork/object storage/consent/PSTN and media/meaning extraction remain SIM.
A fresh object instance is not claimed as an actual OS restart or live provider.

Literal Product39201818161 completed failure: its unchanged manual dispatch
compares to origin/main, failing canonical consistency53 and commit trailers325.
No failing item belongs to this Voice diff/commits. All other18jobs succeeded,
including fast checks and both smoke gates. Six complete unit reports contain
12735passed/0failed/41skipped, individually retained without summing overlaps.
Formal create-receipt17cases all passed, including actual API/binding/consume/
sealed bytes/journal/three committed ACK losses/fresh HTTP/queued runner in566ms;
contact two-instance/replacement, original retention/hold, late control close and
V0125 replay/conflict cases also passed. Product root1 raw proves literal a1.
The complete casewise and terminal packets in `.local/voice-evidence/` preserve
both successful behavior and the two actual gate failures. No gate or historical
commit is rewritten, and correct PR-dev CI remains required for the successor.

Fixed-a1 independent full support (`Voice-a1-original-full-independent-support-review-20261019`,
review SHA25697fe466d9a45432a7471e57776db8d46eff963089806376af6a1e7d37b7d2cb1)
found no new reproducible Source counterexample across all17clauses/four keys/
F1–F8 and independently passed30existing actual-chain cases. Those30overlap the
owner's1030 and are not added. That support was observed before later terminal
PG reports; no missing qualification is silently promoted. It is not a formal
reviewer verdict. Empty local type/lint logs alone were not independent shell
exit proof; successor checks preserve actual argv/Source/tree/return codes.

Fresh accepted dev f87d373ea5db393d1ec0ab6a4fbdf9d138382914 is normally merged
because the genuine shared schema amendment append conflicts. Both complete
Voice V0122 and SOS V0124 amendment objects remain side by side. Every entry in
both parent ledgers is preserved, including original V0106, Voice V0122/V0125,
SOS V0124 and every other reservation/history. Root normally appended the same
six necessary accepted SOS formatter paths (72ordered scopes total), restricted
to exact formatter blobs already shared with Journey/Complaint/GPS. No auth/SOS
behavior, assertion, identity policy or task requirement is changed. Portable
hooks are generated from the installed original Husky9.1.7 prepare command;
existing .husky scripts and hooksPath remain unchanged, with no bypass/install.

The original R2 journal CAS now also has an authored narrow formal PostgreSQL
race in the owned create-receipt suite. Two genuine peer connections execute the
original repository SQL; the existing lease observer only holds an acquired
session FOR UPDATE lock. Native pg_blocking_pids proves the older seal waits for
the pending higher epoch; after commit it must reject with no finalized event
or domain/control/input change. Exact pending replay remains positive and stale
attachment is refused. Its complete external SIM manifest isolates journal CAS;
the preceding actual byte/HTTP case establishes provenance. No VM PG is run.
This added race is pending successor hosted execution, never a1 pass credit.
The initial test cleanup had two exactOptionalPropertyTypes errors, fixed by
removing the optional observer property; no product/harness policy was changed.
Full original17clauses/four keys/F1–F8 and original5000/10000held/three previews/
62snapshot cases remain required on the new candidate. Old a1 runs finish
naturally before publishing the new SHA; no old success is borrowed.
