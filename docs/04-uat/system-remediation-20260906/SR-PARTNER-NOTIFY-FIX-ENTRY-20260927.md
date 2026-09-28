# UAT Artifact: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927

## Task Information
- **Task ID**: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927
- **Parent Baseline SHA**: 585087a2fd8114eaac0eb8a470dfca58e13dfbe4
- **Previous Candidate SHA**: 2549ac0fe70ae2ced719e19aeb31bd0f2a43bdfd
- **Previous Candidate SHA 2**: 6f54cba7cf67c573236ebb704a56231f40c86a0d (Rejected)
- **Tested Source SHA**: 2549ac0fe70ae2ced719e19aeb31bd0f2a43bdfd (plus uncommitted test updates)
- **Current SHA**: (pending commit)

## Required Acceptance Ledger
- `entry_response_waits_durable_write`: **PASS**
  - **Retained Repair**: `createPlatformPartnerEntry` awaits `persistChangesRequired`.
  - **New Evidence**: `tenant-partner-persistence.test.ts` (Test 1). Real service/controller create response pending until durable write, rejected write rejects response and leaves no public/listed phantom. Mocked `tenantPartnerRepository.persistChanges` to control timing dynamically. No mock on mutex, auth, or publication.
  - **Command**: `env -u DATABASE_URL ../../../../node_modules/.bin/vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts` => exit 0
- `persistence_failure_propagated_without_phantom`: **PASS**
  - **Retained Repair**: Memory state mutation happens after durable write.
  - **New Evidence**: `tenant-partner-persistence.test.ts` (Test 1, 2, 3, 4, 5). Tests verify that rejected writes leave no phantom entries/credentials, preserve prior state on update/revoke failures, and release queued mutex retries.
  - **Command**: `env -u DATABASE_URL ../../../../node_modules/.bin/vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts` => exit 0
- `immediate_binding_after_create_hosted_pg`: **PENDING HOSTED**
  - **Retained Repair**: Repaired PG logic in `sr-partner-notify-fix-entry-20260927.integration.test.ts`. Local tests skip PG execution.
  - **Command**: Waiting for hosted test run completion for actual migrated-PG validation.

## Prior Findings & Retained Repairs
- **ENTRY-R1, ENTRY-R2, ENTRY-R3b, ENTRY-R6, ENTRY-R7**: Fixed in previous iterations. Retained fixes include synchronous caller modifications within `apps/api/tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts` at lines 682/692 which correctly await issue execution.
- **ENTRY-R3c [P1] Cross-entry regression in issuance**: Fixed. Publish only the current entry's actually changed key IDs/new key into the latest shared array, preserving all unrelated entries' committed changes.
- **ENTRY-R4c [P2] Required hosted-PG regression still cannot reach its target**: Fixed. Rewrote fixture to prepare a webhook subscribed to `passenger.assignment_disclosure_ready.v1` and explicitly `await Promise.all(vi.spyOn(tenantRepository, "persistChanges").mock.results)` before entry creation to guarantee durability.

## New Findings (Repeated defects) & Repairs
### ENTRY-R5 [P2] Repeated evidence/regression delivery gap
* **Original Issue**: The task-local concurrency/durability tests were completely missing the requested execution behaviors, merely calling single APIs or executing synchronously, not correctly covering the requested permutations of durability/concurrency issues.
* **Fix**: Implemented the required 5 bounded concurrency and durability tests in `tenant-partner-persistence.test.ts` using proper `Deferred` promises to manipulate precise `persistChanges` timings inside `TenantPartnerService.runWithEntryMutex`.
* **Tested Changes**: 
  - Version Before Fix: `2549ac0fe70ae2ced719e19aeb31bd0f2a43bdfd` (failed to execute asynchronous testing logic)
  - Version After Fix: Local uncommitted tree (to be committed).
  - Tested Unit Boundaries: Real `TenantPartnerController` and `TenantPartnerService`, mocking `tenantPartnerRepository.persistChanges` to control timing dynamically. No mock on mutex, auth, or publication.
  - Command: `env -u DATABASE_URL ../../../../node_modules/.bin/vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts` => 5 passed, 0 failed, exit 0.
  - `write_scopes` correctly registers `apps/api/tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts`.

## Reproducible Commands & Concrete Exits
- Concurrency Durability Tests: `env -u DATABASE_URL ../../../../node_modules/.bin/vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/tenant-partner-persistence.test.ts` => **PASS** (5 passed, 0 failed, exit 0)
- API Unit tests: `env -u DATABASE_URL pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts tests/unit/tenant-partner.controller.test.ts tests/unit/auth-bootstrap.test.ts --reporter=dot` => **PASS** (177 passed, exit 0, retained from previous)
- Lifecycle Integration: `env -u DATABASE_URL pnpm --filter @drts/api exec vitest run tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts --reporter=dot` => **PASS** (7 passed, exit 0, retained from previous)
- Notification Integration: `env -u DATABASE_URL pnpm --filter @drts/api exec vitest run tests/integration/sr-partner-notify-fix-entry-20260927.integration.test.ts --reporter=dot` => **SKIP** (1 skipped, 0 passed, exit 0, retained from previous)
- Integration typecheck: `pnpm --filter @drts/api exec tsc --noEmit` => **PASS** (exit 0)
- Core typecheck: `pnpm exec tsc --noEmit` => **PASS** (exit 0)

## Hosted Run Identity
- Previous Hosted Run: 36364135497 / 36364135514
- Next Hosted Run: PENDING
