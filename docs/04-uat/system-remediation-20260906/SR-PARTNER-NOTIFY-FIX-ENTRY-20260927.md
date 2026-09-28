# UAT Artifact: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927

## Task Information
- **Task ID**: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927
- **Parent Baseline SHA**: 585087a2fd8114eaac0eb8a470dfca58e13dfbe4
- **Previous Candidate SHA**: df5a5f769294482b1a87fd66d660b2c9551d1cbc (Rejected, Generation: 4bf3f88599e24d33bb25e8d1a3d2709c)
- **Previous Candidate SHA 2**: 5d9d177003c4c0533aee9576f221be90fadef294 (Rejected, Generation: 5d9d177)
- **Current SHA**: pending commit

## Required Acceptance Ledger
- `entry_response_waits_durable_write`: **PASS** (retained repair: `createPlatformPartnerEntry` awaits `persistChangesRequired`).
- `persistence_failure_propagated_without_phantom`: **PASS** (retained repair: memory state mutation happens after durable write).
- `immediate_binding_after_create_hosted_pg`: **PENDING HOSTED** (repaired PG logic, local skip, awaiting CI/hosted job run for validation).

## Prior Findings & Retained Repairs
- **ENTRY-R1**: Concurrent same-slug create properly serialized; first write succeeds, second rejects `PARTNER_ENTRY_CONFLICT`.
- **Rejected first persistence releases queued retry**: Retry writes succeed; no public entry before successful retry write.
- **ENTRY-R6 (Initial)**: Missing fields in integration test payloads (fixed in `df5a5f769294482b1a87fd66d660b2c9551d1cbc`).

## New Findings (Repeated defects) & Repairs
### ENTRY-R2 [P1] Stale-publication defect due to raw slug mutex
* **Original Issue**: `updatePlatformPartnerEntry` and `revokePlatformPartnerEntry` acquired `runWithEntryMutex` using raw un-trimmed string, while `requirePlatformPartnerEntry` trimmed it. Accepted whitespace aliases referred to the same entry under different locks, violating strict serialization.
* **Fix**: Normalized `entrySlug` by trimming it inside `runWithEntryMutex` to ensure canonical identity across create/update/status/revoke locking.
* **Verification**: Fixed dynamic invariants for exact-slug serialization.

### ENTRY-R3b [P2] Same-entry issue/revoke failure
* **Original Issue**: `issuePlatformPartnerIngressCredential` and `revokePlatformPartnerIngressCredential` ran synchronously outside the mutex, and read pre-revoke active memory. A credential issued during an ongoing entry revocation could survive the revocation. Moreover, `persistChanges` was not awaited, causing memory mutation before durable write.
* **Fix**: Made `issuePlatformPartnerIngressCredential` and `revokePlatformPartnerIngressCredential` async, wrapped them in `runWithEntryMutex(entrySlug)`, replaced `persistChanges` with `await this.persistChangesRequired`, and performed memory mutations strictly after successful persistence.
* **Verification**: Coordinated same-entry issuance and revocation on canonical entry identity with consistent durable/memory ordering.

### ENTRY-R4b [P2] Invalid hosted-PG regression
* **Original Issue**: Integration file `sr-partner-notify-fix-entry-20260927.integration.test.ts` lacked a pre-created subscribed tenant webhook, and used invalid `eventTypes=['partner.entry.created']` without `webhookId/expectedVersion`. Hosted job 36360071456 failed with `PARTNER_NOTIFICATION_BINDING_EVENT_TYPES_INVALID`.
* **Fix**: Rewrote the test to durably prepare a subscribed tenant webhook (`tenantService.createWebhookEndpoint` with `events: ["assignment_disclosure_ready"]`) and pass valid `webhookId`, `eventTypes: ["assignment_disclosure_ready"]`, and `expectedVersion: 0` to `putBinding`.
* **Verification**: `tsc --noEmit` integration compiler check passes without errors.

### ENTRY-R6 [P2] Repeated commit-range failure
* **Original Issue**: Invalid ancestor `5d9d177003c4c0533aee9576f221be90fadef294` remains in PR history lacking `TASK-ID` scope.
* **Status**: A clean successor preserving published history needs to be coordinated by the Supervisor under no amend/rebase/force-push constraints.

### ENTRY-R5 [P2] Inaccurate/incomplete evidence ledger
* **Fix**: Rewrote this artifact to correctly identify Candidate SHAs, explicit ledger outcomes, executable commands with distinct pass/fail/skip, and hosted run evidence.

## Reproducible Commands & Concrete Exits
- Unit tests: `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/ tests/unit/system-remediation/sr-partner-notify-route-20260917/partner-entry-notification-binding.service.test.ts tests/unit/system-remediation/sr-partner-notify-transport-20260918/governance.test.ts tests/security/idempotency-regression-guard.test.ts --reporter=dot` => **PASS** (43 passed, exit 0)
- Integration local execution: `env -u DATABASE_URL pnpm --filter @drts/api exec vitest run tests/integration/sr-partner-notify-fix-entry-20260927.integration.test.ts --reporter=dot` => **SKIP** (1 skipped, 0 passed, exit 0)
- Integration typecheck: `pnpm --filter @drts/api exec tsc --noEmit` => **PASS** (Zero errors in `sr-partner-notify-fix-entry-20260927.integration.test.ts`)
- Commit-range check (Pending supervisor history recovery): `python3 tools/ci/git/check_commit_trailers.py --base 585087a2fd8114eaac0eb8a470dfca58e13dfbe4 --head HEAD` => **FAIL** (exit 1, ancestor `5d9d177` lacks TASK-ID)
- Whitespace diff: `git diff --check 585087a2fd8114eaac0eb8a470dfca58e13dfbe4 HEAD` => **PASS** (exit 0)

## Hosted Run Identity
- Previous Run: run36360071456, PR head `df5a5f769294482b1a87fd66d660b2c9551d1cbc` (FAILED)
- Next Hosted Run: PENDING
