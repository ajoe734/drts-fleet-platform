# OPX-CM-002 Review

- Reviewer: `Codex`
- Date: `2026-04-30`
- Outcome: `review_approved`

## Scope

- complaint ↔ incident escalation and linking controllers
- complaint / incident link consistency guards
- regression coverage for partial-write failure paths

## Findings Addressed During Review

- `POST /complaints/:caseNo/escalate-to-incident` could create a new incident before detecting that the complaint was already linked, leaving an orphan incident on conflict.
- `POST /complaints/:caseNo/link-incident` and `POST /incidents/:incidentId/link-complaint` could mutate one side before the opposite record lookup failed, leaving dangling links.
- Service-level link methods allowed silent reassignment to a different counterpart, which could break the intended 1:1 complaint/incident association.

## Review Fixes

- Added preflight validation in complaint / incident controllers before any cross-module mutation.
- Added service-level conflict guards and idempotent no-op handling for repeated same-pair link requests.
- Added regression tests covering duplicate escalation, missing-target link attempts, and conflicting relink attempts.

## Verification

- `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/complaint-incident-escalation.test.ts apps/api/tests/unit/callcenter.service.test.ts`
- Result: `23` test files passed, `205` tests passed.
