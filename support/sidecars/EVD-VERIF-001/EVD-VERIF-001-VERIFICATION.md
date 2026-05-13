# EVD-VERIF-001 Verification

- Task: `EVD-VERIF-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Date: `2026-05-13`
- Mutates canonical: `false`
- Scope: support-only verification of the existing dev-fixture chain for CTI call -> linked order -> recording attachment -> complaint case -> filing packet, with evidence-retention and legal-hold checks.

## Result

Verdict: `partial_pass`

- The repo can drive a repo-local fixture chain for `call session -> phone order -> recording attachment -> complaint transfer -> report artifact / filing package generation`.
- Retention and legal-hold policy is present and queryable in repo-local governance surfaces.
- The external-evidence portions are not live-wired to real CTI media storage, recording bucket storage, or a regulator filing portal.
- The current filing package does **not** assemble complaint/call/order/recording evidence into a regulator-ready packet schema; it only builds a generic immutable manifest plus signed URLs.

## Acceptance Mapping

### 1. Drive a CTI call -> linked order -> recording attachment -> complaint case -> filing packet flow using existing dev fixtures

Status: `pass_with_scope_limits`

Observed repo-local chain:

1. `OwnedMobilityService.createCallCenterOrder()` creates a phone order, stores `callId` / optional `recordingId`, and links the order back into `CallcenterService` via `linkOrderToCallSession()`. Reference: `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:352-470`.
2. `CallcenterService.attachRecordingCallback()` can later attach the recording callback to the call session; `OwnedMobilityService.handleCallRecordingAttached()` listens for that event and upgrades the order from `recording_pending` to `ready_for_dispatch`, persisting `recordingId`. Reference: `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:690-747`.
3. `CallcenterController.transferCallToComplaint()` creates a complaint case from the call session and links the new `caseNo` back to the call session. Reference: `apps/api/src/modules/callcenter/callcenter.controller.ts:173-203`.
4. `ReportingFilingService` can generate:
   - a dispatch recording index report from the order feed, including `callId`, `recordingId`, and `missingRecording` rows
   - a filing package with immutable manifest metadata and signed download URLs
     Reference: `tests/unit/reporting-filing.test.ts:120-163`, `apps/api/src/modules/reporting-filing/reporting-filing.service.ts:653-730`.

Important limit:

- This is a stitched repo-local fixture flow, not a single end-to-end adapter-backed workflow. The complaint step is connected to the call session, but the filing package step is not complaint-aware and does not pull the complaint case into package contents.

### 2. Verify recording index has retention metadata, legal hold honored, and filing packet includes all required fields per regulatory spec

Status: `partial_pass`

What is verified:

- Retention policy exists for `call_recording`, `report_artifact`, and `filing_package`, with the expected hot retention, archive cutover, archive retention, audit action, and legal-hold support. Reference: `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md`, `apps/api/src/common/evidence-governance.ts`.
- `AuditNotificationService.getEvidenceSubjectGovernance()` suppresses deletion when active legal holds or deletion exceptions exist. Reference: `apps/api/src/modules/audit-notification/audit-notification.service.ts:481-524`.
- Unit coverage proves legal holds and deletion exceptions surface on report-artifact and filing-package detail views. Reference: `apps/api/tests/unit/reporting-filing.service.test.ts:209-307`.
- Dispatch recording index rows do carry recording evidence indicators, including masked `callId`, masked `recordingId`, and `missingRecording`. Reference: `apps/api/tests/unit/reporting-filing.service.test.ts:39-81`, `tests/unit/reporting-filing.test.ts:120-211`.

What is **not** verified / fails the stricter acceptance intent:

- The filing package payload is generic. `completeFilingPackage()` only emits `itemType`, `artifactId`, `manifestHash`, package checksum, and signed URLs; it does not include complaint case data, call metadata, linked order identifiers, recording references, retention annotations, legal-hold state, or a regulator-specific schema envelope. Reference: `apps/api/src/modules/reporting-filing/reporting-filing.service.ts:653-730`.
- For `audit_request`, the package item types are only `audit_summary` and `statistics`; there is no CTI recording artifact, complaint export, or filing-portal submission record in the assembled packet. Reference: `apps/api/src/modules/reporting-filing/reporting-filing.service.ts:933-936`.
- Legal hold is honored at the repo-local governance/view layer, but there is no archival worker or deletion worker here to prove that a real purge/retention process is actively skipping held evidence.

### 3. Identify any gap where external-system evidence is mocked rather than wired to a real adapter

Status: `pass`

Confirmed gaps:

- CTI recording media is still external-only by description. The governance policy explicitly states that binary call media remains in CTI/provider storage and repo-local authority keeps only metadata and masked references. Reference: `apps/api/src/common/evidence-governance.ts`.
- Recording attachment is simulated through `attachRecordingCallback()` with caller-supplied `providerRecordingRef` and `recordingUrl`; there is no outbound CTI adapter, callback signature validation, or provider fetch. Reference: `tests/unit/callcenter.test.ts:89-118`.
- Report artifacts and filing packages are generated in-process from hashed payloads and signed URLs; there is no recording bucket write, object-store manifest, or regulator filing transport. Reference: `apps/api/src/modules/reporting-filing/reporting-filing.service.ts:653-730`, `tests/unit/reporting-filing.test.ts:55-118`.
- The evidence-retention runbook itself marks `call_recording` and `filing_package` activation as repo-static until `EXT-004` blocker evidence exists. Reference: `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md`.

### 4. Verification report is support-only; no production code change

Status: `pass`

- This slice only adds this support artifact.

## Detailed Findings

### Confirmed working repo-local evidence chain

- `callcenter` and `owned-mobility` are event-linked for phone dispatch evidence.
- Recording state changes affect order readiness and compliance flags.
- Complaint creation can be initiated directly from a call session with `relatedOrderId` and `relatedCallId`.
- Reporting can export dispatch recording index evidence from the existing order feed.
- Filing packages are immutable and auditable at the metadata level.

### Gaps blocking a true external-evidence claim

- No real CTI adapter:
  `providerRecordingRef` and `recordingUrl` are stored as provided values, but there is no provider sync or media verification.
- No real evidence bucket:
  there is no persisted binary recording object, retention tag write, or object-lock/legal-hold integration against storage.
- No complaint-to-packet assembler:
  the complaint case is created and linked to the call session, but no reporting/filing path consumes that case when generating a packet.
- No regulator portal adapter:
  filing generation stops at local manifest/download metadata; there is no submission receipt, external packet ID, or acknowledgment state.
- No active retention executor:
  retention/legal hold policy is enforced in read/governance metadata, not proven through archival or deletion jobs.

## Overall Conclusion

`EVD-VERIF-001` demonstrates that the repo contains enough fixture wiring to simulate the chain and enough governance metadata to describe retention and legal-hold rules. It does **not** demonstrate a live external-evidence pipeline.

The highest-signal gap is the filing packet: current implementation produces an immutable package shell, but not the complaint/call/recording evidence bundle that a regulator-facing packet would require.

## Verification Commands

Planned / executed commands for this verification slice:

```bash
pnpm --filter @drts/api exec vitest run apps/api/tests/unit/callcenter.service.test.ts apps/api/tests/unit/reporting-filing.service.test.ts apps/api/tests/unit/evidence-governance.test.ts apps/api/tests/unit/audit-notification.service.test.ts tests/unit/reporting-filing.test.ts tests/unit/callcenter.test.ts
```

Results:

- `pnpm --filter @drts/api exec vitest run tests/unit/callcenter.service.test.ts tests/unit/reporting-filing.service.test.ts tests/unit/evidence-governance.test.ts tests/unit/audit-notification.service.test.ts`
  - `4` files passed, `16` tests passed
- `pnpm exec vitest run tests/unit/reporting-filing.test.ts tests/unit/callcenter.test.ts`
  - `2` files passed, `9` tests passed
