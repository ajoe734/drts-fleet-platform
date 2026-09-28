# UAT Artifact: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927

## Task Information

- **Task ID**: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927
- **Parent Baseline SHA**: 585087a2fd8114eaac0eb8a470dfca58e13dfbe4
- **Previous Candidate SHAs**: e66144dc, 58393f7b, 5bc3f42e, b4d39fda, 63791ef1
- **Tested Checkpoint Tree/Blob**: Handoff mapped to candidate branch `gemini/sr-partner-notify-fix-entry-20260927-v4`. Test blob `af4e4087714675a7dbb62cb4ceaa58c4e78feb1b`.

## Required Acceptance Ledger

- `entry_response_waits_durable_write`: **PASS**
  - **Retained Repair**: `createPlatformPartnerEntry` awaits `persistChangesRequired`.
  - **New Evidence**: `tenant-partner-persistence.test.ts` (Test 1). Real service/controller create response pending until durable write. Added explicit public/list state absence assertions while pending.
  - **Command**: `env -u DATABASE_URL pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts` => exit 0
- `persistence_failure_propagated_without_phantom`: **PASS**
  - **Retained Repair**: Memory state mutation happens after durable write.
  - **New Evidence**: `tenant-partner-persistence.test.ts` (Tests 1-5). Verifies that rejected writes leave no phantom entries/credentials, preserve prior state, release queued mutex retries. Added pending visibility and credential absence checks.
  - **Command**: `env -u DATABASE_URL pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts` => exit 0
- `immediate_binding_after_create_hosted_pg`: **PENDING (Historical pass from 58393f7b)**
  - **Retained Repair**: Repaired PG logic in `sr-partner-notify-fix-entry-20260927.integration.test.ts`. Local tests skip PG execution.
  - **Historical Hosted Evidence**: Migrated-PG run 36367477824/job 108756748288 passed on rejected head 58393f7b (merge b0a9c53df8ff56eb761dc33537bc6197eac6b7d0).
  - **Current Evidence**: PENDING current hosted-PG acceptance for the new candidate.

## Prior Findings & Retained Repairs

- **ENTRY-R1, ENTRY-R2, ENTRY-R3b, ENTRY-R7**: Fixed in previous iterations. Retained fixes include synchronous caller modifications within `apps/api/tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts` at lines 682/692 which correctly await issue execution.
- **ENTRY-R6**: Addressed by applying history repair on clean successor `gemini/sr-partner-notify-fix-entry-20260927-v4`.
- **ENTRY-R8**: Retained repair from previous review cycle 58393f7b.
- **ENTRY-R9**: Addressed by fixing ESLint `prefer-const` and unused `seedKey` on `tenant-partner-persistence.test.ts` and removing trailing whitespace.

## New Findings & Repairs

### ENTRY-R5 [P2] Bounded regression/evidence repair
- **Original Issue**: Test 3 had a gate theft regression due to authentication telemetry write consuming the mock; Test 4 lacked public credential-list lifecycle assertions.
- **Fix**:
  - Test 3 now selects actual entrySlug/status payloads for mock implementation, avoiding telemetry write hijack, and verifies revoke reaches its persistence gate.
  - Test 4 now verifies public credential-list lifecycle status (status and purpose) at held boundaries.
- **Tested Source**: Test blob `af4e4087714675a7dbb62cb4ceaa58c4e78feb1b` + fresh local repairs on candidate v4 branch.
- **Command**: `env -u DATABASE_URL pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts` => 5 passed, 0 failed, exit 0.

## Reproducible Commands & Concrete Exits

- Concurrency Durability Tests: `env -u DATABASE_URL pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts` => **PASS** (5 passed, 0 failed, exit 0)
- Combined API Run: `env -u DATABASE_URL pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts tests/unit/tenant-partner.controller.test.ts tests/unit/auth-bootstrap.test.ts tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts tests/integration/sr-partner-notify-fix-entry-20260927.integration.test.ts` => **LOCAL PASS** (184 passed, 1 skipped) from previous local reviewer execution.
- API Source typecheck: `pnpm --filter @drts/api exec tsc --noEmit --incremental false` => **PASS** (exit 0)

## Hosted Run Identity

- Historical Migrated-PG Run: run 36367477824/job 108756748288 (head 58393f7b, merge b0a9c53df8ff56eb761dc33537bc6197eac6b7d0)
- Previous Hosted Run (b4d39fda): run 36370786472, trailer run 36370786473/job 108766573657 (FAILURE)
- Next Hosted Run: PENDING
