# AUDIT-VOICE-APPLICATION-REGRESSION-20261018

Source regression child of AUDIT-VOICE-APPLICATION-WIRING-20261003 at `ba0b164ed8fab3f0dd68ace92a18d0376c0a9031`.
Owner: Claude2. Reviewer: Codex. Priority: P2.
Required acceptance: `composed_turn_and_recording_path`, `authority_epoch_consent_fences`,
`precise_unimplemented_and_external_boundaries`, `same_sha_review_ci`.

This document records the state of this task at the point of this session's handoff. It is a
**partial** candidate: work packages A (tools) and B (recording finalization) each received one
confirmed, scoped repair; C (durable contact/consent) and D (workbench) were not started this
session because C's durable persistence is explicitly gated on Root allocating a migration number
(see "Open work" below), which was not available before this session ended.

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

## Package C — durable contact/consent backend (not started)

`VoiceContactService` remains exactly as found: a RAM-only `Map`-backed service with no durable
persistence and no mounted HTTP consumer. Making it durable requires a new migration, which this
task's own coordination rules require Root to number before any migration file is written
("Formal contact schema is required functional code... Root allocates exact actual free migration
and ledger/guard paths through normal task metadata before any migration write").

Proposed schema (not yet allocated a migration number as of this handoff):

```sql
-- infra/migrations/V0NNN__voice_contact_role_revision.sql (NNN pending Root allocation; V0121 is the latest existing migration at this handoff)
CREATE TABLE voice.contact_role_revision (
  revision_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id  uuid NOT NULL REFERENCES voice.session(voice_session_id),
  role              text NOT NULL CHECK (role IN ('caller','booker','passenger','driverContact','callbackRecipient')),
  revision_number   integer NOT NULL,
  name              text NOT NULL,
  phone_ciphertext  text NOT NULL,
  consent_ref       text,
  reason            text NOT NULL,
  replaced_revision integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voice_session_id, role, revision_number)
);
CREATE INDEX ON voice.contact_role_revision (voice_session_id);
```

`phone_ciphertext` follows the same encrypted-at-rest convention as
`voice.dialogue_snapshot.content_ciphertext` (`voice-dialogue-snapshot-crypto.ts`), not plaintext.
The exact repository transaction shape (append-only insert keyed by
`(voice_session_id, role, revision_number)`, matching `VoiceContactService.updateContactRole`'s
existing revision-numbering contract) was designed but not implemented pending the migration
number.

Binding this to `voice-callback.service.ts`'s existing durable callback task/receipt (currently
accepting an unauthenticated `consentSnapshotHash` with no sealed contact-role revision reference)
and projecting it into the UV019 workbench (Package D) both depend on this landing first, per the
task spec's own `depends_on` for work packages C and D.

## Package D — mounted contact/consent workbench projection (not started)

Depends on Package C's backend DTO/read contract; not started.

## Validation evidence (this session)

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

Branch: `claude2/audit-voice-application-regression-20261018`, pushed. Commits this session (in
order): `2d948ac01` (Package A partial), `ffb035979` (Package B partial). This document's own commit
is the final commit of this session's partial candidate; see `git log` on that branch for the exact
SHA. Codex should independently review this exact candidate's real orchestration and the precise
remaining boundaries above — green CI/typecheck alone is not functional completion, and this is not
a request to treat A/B as fully done or to close any original archived verdict.
