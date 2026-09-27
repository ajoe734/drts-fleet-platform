# UAT Artifact: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927

## Task Information
- **Task ID**: SR-PARTNER-NOTIFY-FIX-ENTRY-20260927
- **Prior SHA**: 585087a2fd8114eaac0eb8a470dfca58e13dfbe4 (Parent Baseline)
- **Previous Candidate SHA**: 8405e17291f448238970fee0a7337bb0 (Rejected)
- **Current SHA**: pending commit

## Review Findings & Fixes

### ENTRY-R1 [P1] Concurrent same-slug create now bypasses PARTNER_ENTRY_CONFLICT
* **Original Issue**: `createPlatformPartnerEntry` checks `this.partnerEntries` and then `await`s persistence before updating `this.partnerEntries`. This allowed concurrent creations for the same slug to bypass the conflict check, resulting in DB overwrites due to `ON CONFLICT(entry_slug) DO UPDATE`.
* **Fix**: Implemented `runWithEntryMutex` in `TenantPartnerService` to serialize all modifications for a given `entrySlug`. Concurrent creations for the same slug now wait for the first to complete, after which the second properly sees the populated entry and throws `PARTNER_ENTRY_CONFLICT`.
* **Verification**: Unit tests in `tenant-partner.service.test.ts` pass, ensuring synchronous operations and mutex functionality.

### ENTRY-R2 [P1] A stale update can reactivate a revoked entry
* **Original Issue**: `updatePlatformPartnerEntry` cloned the `originalEntry`, checked its status, awaited persistence, and then directly mapped the result into `this.partnerEntries`. A concurrent revocation could complete during the `await`, only to be overwritten by the stale update reverting the entry back to `active`.
* **Fix**: Wrapped `updatePlatformPartnerEntry` in `runWithEntryMutex`. Now, updates and revocations for the same entry are strictly serialized. If a revoke completes first, the update fetches the revoked entry and correctly throws `PARTNER_ENTRY_REVOKED`. If an update completes first, the revoke successfully revokes the updated entry.
* **Verification**: Unit tests pass (`pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts`).

### ENTRY-R3 [P1] Completing revocation overwrites unrelated credential changes
* **Original Issue**: `revokePlatformPartnerEntry` captured the entire `this.partnerIngressCredentials` array before awaiting persistence, and restored it afterward. This wiped out any credentials issued for *other* entries during the `await`.
* **Fix**: Rewrote `revokePlatformPartnerEntry` to wrap the entry logic in `runWithEntryMutex`, and critically, to update `this.partnerIngressCredentials` *after* the `await` by mapping the global array and only replacing the specific credentials that were actually revoked.
* **Verification**: Unit tests pass.

### ENTRY-R4 [P2] Hosted-PG regression is invalid
* **Original Issue**: The integration test `sr-partner-notify-fix-entry-20260927.integration.test.ts` checked a nonexistent `admin.phase1_tenant_partner_state` table and did not call `PartnerEntryNotificationBindingService.putBinding`. The `DatabaseService` constructor was also incorrectly passed arguments.
* **Fix**: Updated the test to use `vitest.skipIf(!DATABASE_URL)`, instantiate `DatabaseService` properly with zero arguments, and call `bindingService.putBinding(entrySlug, ...)` to prove the FK constraint to `admin.phase1_partner_channel_entries` succeeds. Added `eventTypes: ["partner.entry.created"]` to satisfy the binding service API requirements.
* **Verification**: Integration test passes or properly skips when `DATABASE_URL` is missing: `pnpm exec vitest run tests/integration/sr-partner-notify-fix-entry-20260927.integration.test.ts`.

### ENTRY-R6 [P2] Type check failures on persistence tests
* **Original Issue**: Typecheck failed in `tenant-partner-persistence.test.ts` and `sr-partner-notify-fix-entry-20260927.integration.test.ts` due to missing `businessDispatchSubtype` in `CreatePartnerChannelEntryCommand`.
* **Fix**: Added `businessDispatchSubtype: "enterprise_dispatch"` to the payload in all affected tests.
* **Verification**: `pnpm run typecheck` passes for the isolated API workspace.

### ENTRY-R5 [P2] Required artifact missing
* **Original Issue**: This artifact was missing from the candidate.
* **Fix**: Restored this full artifact carrying the reopen note findings, reproducible commands, and pending hosted evidence requirements.

## Reproducible Commands & Results
- Unit tests: `pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts tests/unit/tenant-partner.controller.test.ts --reporter=dot` => PASS (87/87)
- Regression unit tests: `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-entry-20260927/ tests/unit/system-remediation/sr-partner-notify-route-20260917/partner-entry-notification-binding.service.test.ts tests/unit/system-remediation/sr-partner-notify-transport-20260918/governance.test.ts tests/security/idempotency-regression-guard.test.ts --reporter=dot` => PASS (43/43)
- Integration test: `pnpm exec vitest run apps/api/tests/integration/sr-partner-notify-fix-entry-20260927.integration.test.ts` => PASS/SKIP
- Lint: `pnpm exec eslint apps/api/src/modules/tenant-partner/tenant-partner.service.ts apps/api/tests/integration/sr-partner-notify-fix-entry-20260927.integration.test.ts --max-warnings=0` => PASS

## Pending Hosted Evidence
- `immediate_binding_after_create_hosted_pg` is **NOT VERIFIED** locally due to VM restriction. Validated logic with correct migrations and `putBinding`. Authorized hosted workflow supplies evidence upon candidate publish.
