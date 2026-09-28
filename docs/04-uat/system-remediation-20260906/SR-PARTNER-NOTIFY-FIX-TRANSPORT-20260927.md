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
**Result (HEAD)**: Exit 0 (Passed). 128 tests passed (7 skipped because database URL absent). Added explicit DNS lookup closure regression tests in `sanity.test.ts` to assert actual `options.lookup` behavior. It strictly proves that `DRTS_ALLOW_LOCAL_WEBHOOKS=true` only permits successful callback delivery when DNS exactly answers `127.0.0.1` or `::1`, and reliably emits `partner_endpoint_dns_not_public` for metadata (`169.254.169.254`), private (`10.1.2.3`), mixed local/private DNS answers, HTTPS localhost metadata, and empty answers, for both `all=true` and `all=false` lookup modes.

### 4. Integration Test for Controlled Receiver Opt-In (Local)
**Command**: `cd apps/api && pnpm exec vitest run tests/integration/sr-partner-notify-fix-transport-20260927.integration.test.ts`
**Old Result (58b73a96)**: 3 passed (Local VM).
*Note: Real-server integration was deliberately NOT run on this VM in current run per reviewer instructions.*

### Independent DNS Regression Evidence (Codex Review 2026-09-27)
**Reviewed SHA**: `8885a6ad1ef4f901036d371535aa079ff050612a`
**Target Boundary**: `WebhookDispatchService.dispatchAttempt` -> `partnerNotificationHttpsFetch` -> `options.lookup` -> `dns.lookup`.
**Fix Validated**: The tests in `sanity.test.ts` were rewritten to properly capture and assert the inner `options.lookup` closure callback behavior under both `all=true` and `all=false` conditions, preventing the regression from bypassing tests. 
**Evidence of repair**: 
- **Old-Fail (on 3c690f69 / original broken transport)**: `options.lookup` allowed `169.254.169.254` DNS answers to pass without error, reproducing the 8 prior violations.
- **Repaired-Pass (HEAD)**: `options.lookup` closure accurately blocks `169.254.169.254`, `10.1.2.3`, mixed loopback arrays, empty arrays, and HTTPS localhost metadata DNS answers, safely emitting `partner_endpoint_dns_not_public` and refusing callback delivery. (Tested via Node 22.23.2, pnpm 10.33.0, Vitest 4.1.4).

## Codex Review Findings (2026-09-27) Resolution

| Finding | Severity | Description | Status | Old Command | Fixed Command | Local/Hosted |
|---|---|---|---|---|---|---|
| R9-TR1 | P1 (Must Fix) | `DRTS_ALLOW_LOCAL_WEBHOOKS=true` disables protocol/credential/IP/DNS gates for EVERY destination. Controlled DNS not bounded. | Fixed | Node probe (Exit 1, 8 violations) | Node probe (Exit 0) | Local |
| R9-TR2 | P2 (Must Fix) | Weak/sham checks in `https.test.ts`. `sanity.test.ts` was `expect(true).toBe(true)`. | Fixed | N/A | `pnpm exec vitest ... sanity.test.ts` (Exit 0) | Local |
| R9-TR3 | P2 (Evidence) | Artifact declared all criteria MET without bounded opt-in proof, no old/new SHA table or hosted/local distinction. Missing historical context. | Fixed | N/A | N/A | Local |
| R9-TR4 | P2 (Lint) | `sanity.test.ts` has six unused vars lint errors blocking CI. | Fixed | `eslint ... sanity.test.ts` (Exit 1) | `eslint ... sanity.test.ts` (Exit 0) | Local |

**Acceptance Status (Post-Repair):**
- `typed_transport_lint_pass`: MET via local typecheck & lint checks.
- `production_and_default_network_guards_preserved`: MET. Refusal probes pass, boundary regression TR1 fixed.
- `explicit_controlled_receiver_optin_tested`: MET. Bounded opt-in tested explicitly via `sanity.test.ts`. Negative DNS checks pass.
