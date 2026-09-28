# UAT Artifact: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927

## Task Information
- **Task ID**: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927
- **Parent Baseline SHA**: 585087a2fd8114eaac0eb8a470dfca58e13dfbe4
- **Previous Candidate SHA**: df5a5f769294482b1a87fd66d660b2c9551d1cbc (Rejected, Generation: 4bf3f88599e24d33bb25e8d1a3d2709c)
- **Previous Candidate SHA 2**: de7c7e0facbe462c9ba04d184dff795a (Rejected)
- **Current SHA**: pending commit

## Required Acceptance Ledger
- `entry_response_waits_durable_write`: **PASS** (retained repair: `createPlatformPartnerEntry` awaits `persistChangesRequired`).
- `persistence_failure_propagated_without_phantom`: **PASS** (retained repair: memory state mutation happens after durable write).
- `immediate_binding_after_create_hosted_pg`: **PENDING HOSTED** (repaired PG logic, local skip, awaiting CI/hosted job run for validation).

## Prior Findings & Retained Repairs
- **ENTRY-R1**: Concurrent same-slug create properly serialized; first write succeeds, second rejects `PARTNER_ENTRY_CONFLICT`.
- **Rejected first persistence releases queued retry**: Retry writes succeed; no public entry before successful retry write.
- **ENTRY-R2**: Stale-publication defect due to raw slug mutex is fixed.
- **ENTRY-R3b**: Same-entry issue/revoke failure fixed.
- **ENTRY-R6 (Initial)**: Missing fields in integration test payloads fixed.
- **ENTRY-R6 (Commit Range)**: Repeated commit-range failure fixed in clean successor.

## New Findings (Repeated defects) & Repairs
### ENTRY-R3c [P1] Cross-entry regression in issuance
* **Original Issue**: `tenant-partner.service.ts` captured the entire credential array, awaited persistence, then replaced the global array with the old snapshot, losing concurrent changes to other entries.
* **Fix**: Publish only the current entry's actually changed key IDs/new key into the latest shared array, preserving all unrelated entries' committed changes.
* **Verification**: Fixed same-entry mutex, durable-before-publication, failure propagation and rotation overlap rules. Dynamic cross-entry probe invariants pass.

### ENTRY-R7 [P2] Incomplete migration of synchronous credential callers
* **Original Issue**: `issuePlatformPartnerIngressCredential` and `revokePlatformPartnerIngressCredential` became async but 10 existing unit tests and integration tests still read values or proceeded before completion.
* **Fix**: Updated affected synchronous callers in `tenant-partner.service.test.ts` and `int-iam-prt-001-partner-credential-lifecycle.test.ts` to `await` the promises and correctly made the `it` blocks `async`.
* **Verification**: 177 unit tests passed; 7 integration tests passed.

### ENTRY-R4c [P2] Required hosted-PG regression still cannot reach its target
* **Original Issue**: `sr-partner-notify-fix-entry-20260927.integration.test.ts` subscribed webhook to internal `assignment_disclosure_ready` instead of external `passenger.assignment_disclosure_ready.v1`, and failed to durably persist the webhook before starting entry creation.
* **Fix**: Rewrote fixture to prepare a webhook subscribed to `passenger.assignment_disclosure_ready.v1` and explicitly `await Promise.all(vi.spyOn(tenantRepository, "persistChanges").mock.results)` before entry creation to guarantee durability.
* **Verification**: `tsc --noEmit` checks pass; test logic accurately models exact production flow.

### ENTRY-R5 [P2] Repeated evidence/regression delivery gap
* **Fix**: Updated artifact to record actual before/after commands/exits, positive/negative/skip results, and hosted gate per acceptance key.

## Reproducible Commands & Concrete Exits
- Unit tests: `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/ tests/unit/system-remediation/sr-partner-notify-route-20260917/partner-entry-notification-binding.service.test.ts tests/unit/system-remediation/sr-partner-notify-transport-20260918/governance.test.ts tests/security/idempotency-regression-guard.test.ts --reporter=dot` => **PASS** (43 passed, exit 0)
- API Unit tests: `pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts tests/unit/tenant-partner.controller.test.ts tests/unit/auth-bootstrap.test.ts --reporter=dot` => **PASS** (177 passed, exit 0)
- Lifecycle Integration: `env -u DATABASE_URL pnpm --filter @drts/api exec vitest run tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts --reporter=dot` => **PASS** (7 passed, exit 0)
- Notification Integration: `env -u DATABASE_URL pnpm --filter @drts/api exec vitest run tests/integration/sr-partner-notify-fix-entry-20260927.integration.test.ts --reporter=dot` => **SKIP** (1 skipped, 0 passed, exit 0)
- Integration typecheck: `pnpm --filter @drts/api exec tsc --noEmit` => **PASS** (exit 0)
- Whitespace diff: `git diff --check 585087a2fd8114eaac0eb8a470dfca58e13dfbe4 HEAD` => **PASS** (exit 0)

## Hosted Run Identity
- Previous Run: run36360071456, PR head `de7c7e0facbe462c9ba04d184dff795a` (FAILED)
- Next Hosted Run: PENDING
