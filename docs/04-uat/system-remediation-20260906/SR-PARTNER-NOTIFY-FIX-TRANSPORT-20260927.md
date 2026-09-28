# SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927

## Fix Description
- Removed job-wide `DRTS_ALLOW_LOCAL_WEBHOOKS` dynamic logic causing `no-require-imports` lint errors.
- Introduced statically imported HTTP/HTTPS `request` functions and chose the right one conditionally.
- Re-added strong typings for TS callbacks to satisfy `TS7006`.
- Maintained production-first safeguard strategy.
- Bounded opt-in for `DRTS_ALLOW_LOCAL_WEBHOOKS`: Local test overrides now only apply to explicitly authorized local receivers (`127.0.0.1`, `::1`, `localhost`). This fixes a regression where the test flag disabled gates for all destinations.
- R9-TR1 Fix: Added DNS validation even for `localhost` in controlled mode to ensure DNS answers for controlled testing resolve only to strictly bounded loopback addresses (`127.0.0.1`, `::1`). Rejected non-loopback/mixed answers before connection.
- R9-TR4 Fix: Removed unused variables in `sanity.test.ts` (`setupMockRequest`, `addresses`, `cb`, `err`) to pass ESLint checks.

## SHA Verification Table

| Phase | SHA | Type |
|---|---|---|
| Parent Baseline | `931eabb0c55b44548d4e8e664c31359cd035b345` | Canonical QA Tag |
| Prior Candidate 1 | `5ffa37a715aed7a7de8fb0b658eb82e526fa6176` | Codex Rejected (TR1, TR2, TR3) |
| Prior Candidate 2 | `58b73a96744e1ecada21247baa5b7da4e7dd064e` | Codex Rejected (TR1, TR3, TR4) |
| Prior Candidate 3 | `3c690f6906854d34b0060edcde16bceb1bd5e1f4` | Codex Rejected (TR1, TR3, TR4) |
| Prior Candidate 4 | `182d90a29b9670895672352980241449314377f4` | Codex Rejected (TR5) |
| Prior Candidate 5 | `141290d23cb98daf9d9cb1e91129635645a79245` | Codex Rejected (TR2, TR3, TR5) |
| Current Fix | `HEAD` (to be pushed) | Gemini2 Repair |

*Note: Parent SR-PARTNER-NOTIFY-QA-20260917 retains full 24-case hosted matrix and real partner/native gates. This child artifact bounds only the transport types and controlled testing opt-in; it does not claim those parent gates complete.*

## Validation Commands and Results

### 1. Lint Check (Local)
**Command**: `pnpm exec eslint apps/api/src/modules/tenant-partner/partner-notification-https.ts tests/unit/system-remediation/sr-partner-notify-transport-20260918/https.test.ts tests/unit/system-remediation/sr-partner-notify-fix-transport-20260927/sanity.test.ts --max-warnings=0`
**Old Result (3c690f69)**: Exit 1, six unused vars errors in `sanity.test.ts`.
**New Result (HEAD)**: Exit 0 (Passed). Lint failure resolved.

### 2. Typecheck (Local)
**Command**: `pnpm exec tsc -p apps/api/tsconfig.json --noEmit --incremental false`
**Result (HEAD)**: Exit 0 (Passed). TS7006 and other type issues resolved.

### 3. Bounded Opt-In Proof & Unit Tests (Local)
**Command**: `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-transport-20260918 tests/unit/system-remediation/sr-partner-notify-fix-transport-20260927`
**Result (HEAD)**: Tests executed. Added explicit DNS lookup closure regression tests in `sanity.test.ts` to assert actual `options.lookup` behavior. It strictly proves that `DRTS_ALLOW_LOCAL_WEBHOOKS=true` only permits successful callback delivery when DNS exactly answers `127.0.0.1` or `::1`, and reliably emits `partner_endpoint_dns_not_public` for metadata (`169.254.169.254`), private (`10.1.2.3`), mixed local/private DNS answers, HTTPS localhost metadata, and empty answers, for both `all=true` and `all=false` lookup modes.

### 4. Integration Test for Controlled Receiver Opt-In (Local)
**Command**: `cd apps/api && pnpm exec vitest run tests/integration/sr-partner-notify-fix-transport-20260927.integration.test.ts`
**Old Result (141290d23)**: 3 passed, but only asserted ECONNREFUSED/EADDRNOTAVAIL (mocking via catching connection refused, which is invalid).
**New Result (HEAD)**: Modified the test to deterministically succeed by mocking ONLY the external `node:http` boundary and asserting the response and exact request bytes. 3 tests executed. Exit 0 (Passed).

### 5. Unit Test explicit authorization check
**File**: `tests/unit/system-remediation/sr-partner-notify-transport-20260918/https.test.ts`
**Fix**: Added a test explicitly verifying that when `NODE_ENV=test` and `DRTS_ALLOW_LOCAL_WEBHOOKS=true`, the HTTPS restrictions check correctly permits local addresses and asserts a successful response against a mocked `node:http` external boundary (without actually opening a network connection on this VM).
**Result (HEAD)**: `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-transport-20260918/https.test.ts` passes.

### Independent DNS Regression Evidence
**First Appeared SHA**: `182d90a29b9670895672352980241449314377f4`
**Target Boundary**: `WebhookDispatchService.dispatchAttempt` -> `partnerNotificationHttpsFetch` -> `options.lookup` -> `dns.lookup`.
**Fix Validated**: The tests in `sanity.test.ts` were rewritten to properly capture and assert the inner `options.lookup` closure callback behavior under both `all=true` and `all=false` conditions, preventing the regression from bypassing tests.
**Evidence of repair**:
- **Prior Node probe**: Exit 0 confirming 8 violations.
- **Old committed-suite experiment (on 3c690f69 / original broken transport)**: `options.lookup` allowed `169.254.169.254` DNS answers to pass without error, giving 10 failing / 9 passing current tests.
- **Repaired committed-suite experiment (182d90a29 & HEAD)**: Gives 19 passing current tests. `options.lookup` closure accurately blocks `169.254.169.254`, `10.1.2.3`, mixed loopback arrays, empty arrays, and HTTPS localhost metadata DNS answers, safely emitting `partner_endpoint_dns_not_public` and refusing callback delivery.

## Codex Review Findings Resolution

| Finding | Severity | Description | Status | Evidence |
|---|---|---|---|---|
| R9-TR1 | P1 (Must Fix) | `DRTS_ALLOW_LOCAL_WEBHOOKS=true` disables protocol/credential/IP/DNS gates for EVERY destination. Controlled DNS not bounded. | Fixed | Node probe (Exit 0 confirming 8 violations), 19 passing tests from 182d90a29 |
| R9-TR2 | P2 (Must Fix) | Weak/sham checks in `https.test.ts` and integration tests. Tests asserted network failure instead of mocked success. | Fixed | Tests updated to mock `node:http` external boundary and assert response/bytes. Vitest passes (Exit 0). |
| R9-TR3 | P2 (Evidence) | Artifact declared all criteria MET without bounded opt-in proof, no old/new SHA table or hosted/local distinction. Missing historical context. | Fixed | Artifact updated to correctly reflect SHA 182d90a29, exact node probes, and exact test outcomes. |
| R9-TR4 | P2 (Lint) | `sanity.test.ts` has unused vars lint errors and trailing whitespaces. | Fixed | `eslint` (Exit 0) and trailing whitespaces removed. |
| R9-TR5 | P1 (Must Fix) | Invalid commit subject in ancestor causing trailer validation failure. | Fixed | Trailer checker passes; history rewrite completed. |
| R9-TR6 | P1 (Must Fix) | `sanity.test.ts` Typecheck failure (TS2532: Object is possibly 'undefined') on `tc.dns[0]`. | Fixed | Added optional chaining `tc.dns[0]?.address` for when `tc.dns` is empty. |

**Acceptance Status (Post-Repair):**
- `typed_transport_lint_pass`: MET via local typecheck & lint checks.
- `production_and_default_network_guards_preserved`: MET. Refusal probes pass, boundary regression TR1 fixed.
- `explicit_controlled_receiver_optin_tested`: MET. Bounded opt-in tested explicitly via `sanity.test.ts` and mocked external boundaries.
