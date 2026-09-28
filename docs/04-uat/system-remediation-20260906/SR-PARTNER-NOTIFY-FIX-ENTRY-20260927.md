# UAT Artifact: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927

## Task Information

- **Task ID**: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927
- **Parent Baseline SHA**: 585087a2fd8114eaac0eb8a470dfca58e13dfbe4
- **Previous Candidate SHAs**: e66144dc, 58393f7b, 5bc3f42e, b4d39fda, 63791ef1, 345cbdd614add060971c642bf60d955d51bfa9af
- **Tested Checkpoint Tree/Blob**: Handoff mapped to candidate branch `gemini/sr-partner-notify-fix-entry-20260927-v4`.

## Required Acceptance Ledger

- `entry_response_waits_durable_write`: **PASS**
  - **Retained Repair**: `createPlatformPartnerEntry` awaits `persistChangesRequired`.
  - **New Evidence**: `tenant-partner-persistence.test.ts` (Test 1). Real service/controller create response pending until durable write. Added explicit public/list state absence assertions while pending.
  - **Command**: `env -u DATABASE_URL pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts` => exit 0
- `persistence_failure_propagated_without_phantom`: **PASS**
  - **Retained Repair**: Memory state mutation happens after durable write.
  - **New Evidence**: `tenant-partner-persistence.test.ts` (Tests 1-5). Verifies that rejected writes leave no phantom entries/credentials, preserve prior state, release queued mutex retries. Added pending visibility and credential absence checks.
  - **Command**: `env -u DATABASE_URL pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts` => exit 0
- `immediate_binding_after_create_hosted_pg`: **PENDING (Historical pass from 345cbdd614add)**
  - **Retained Repair**: Repaired PG logic in `sr-partner-notify-fix-entry-20260927.integration.test.ts`. Local tests skip PG execution.
  - **Historical Hosted Evidence**: run 36372895759/job108772887961 passed on 345cbdd614add060971c642bf60d955d51bfa9af (merge 930946aa3dc594c5520643d8fe6463dd46865df5).
  - **Current Evidence**: PENDING current hosted-PG acceptance for the new candidate.

## Prior Findings & Retained Repairs

- **ENTRY-R5**: Test 3 gate theft fixed; Test 4 verifies credential-list lifecycle status.
- **ENTRY-R6, ENTRY-R7, ENTRY-R8, ENTRY-R9**: Addressed in prior iterations.

## New Findings & Repairs

### ENTRY-R10 [P1 NEW] Telemetry overwrite repair
- **Original Issue**: Authentication telemetry overwrote queued/committed credential lifecycle changes because it occurred outside the entry mutex and UPSERT unconditionally applied `revoked_at`.
- **Fix**:
  - `authenticatePartnerBootstrap` and `authenticatePartnerBootstrapWithResolvedCredential` now serialize telemetry writes via `runWithEntryMutex` and update only the current active in-memory credential during persistence.
  - Retains synchronous in-memory mutation of `matchingCredential` to keep legacy synchronous observations intact.
- **Tested Source**: Real Service / Repository via Unit Tests + timing probe tests inside mutex logic.

### ENTRY-R11 [P2 NEW] Root typecheck regression
- **Original Issue**: `tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts` indexed arrays without TypeScript guard, breaking root typecheck.
- **Fix**: Added narrowing assignments `const cred1 = creds1[0]; if (!cred1) throw ...` to explicitly narrow types before assertion.
- **Command**: `pnpm exec tsc --noEmit --incremental false` => **PASS** (exit 0)

## Reproducible Commands & Concrete Exits

- Concurrency Durability Tests: `env -u DATABASE_URL pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts tests/unit/system-remediation/sr-partner-notify-route-20260917/partner-entry-notification-binding.service.test.ts tests/unit/system-remediation/sr-partner-notify-transport-20260918/governance.test.ts tests/security/idempotency-regression-guard.test.ts --reporter=dot` => **PASS** (46 passed, 0 failed, exit 0)
- Combined API Run: `env -u DATABASE_URL pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts tests/unit/tenant-partner.controller.test.ts tests/unit/auth-bootstrap.test.ts tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts tests/integration/sr-partner-notify-fix-entry-20260927.integration.test.ts --reporter=dot` => **PASS** (184 passed, 1 skipped)
- Root typecheck: `pnpm exec tsc --noEmit --incremental false` => **PASS** (exit 0)

## Hosted Run Identity

- Historical Migrated-PG Run: run 36372895759/job108772887961 (head 345cbdd614add060971c642bf60d955d51bfa9af, merge 930946aa3dc594c5520643d8fe6463dd46865df5)
- Next Hosted Run: PENDING
