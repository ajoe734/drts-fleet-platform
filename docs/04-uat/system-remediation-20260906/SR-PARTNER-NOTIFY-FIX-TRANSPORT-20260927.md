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
**Result (HEAD)**: Exit 0 (Passed). 116 tests passed. The `sanity.test.ts` proves that `http://169.254.169.254`, `https://10.1.2.3`, `http://8.8.8.8`, and DNS-resolved local IPs are explicitly rejected even when `DRTS_ALLOW_LOCAL_WEBHOOKS=true`, unless the receiver is `127.0.0.1`/`localhost` and DNS resolves strictly to `127.0.0.1`/`::1`.

### 4. Integration Test for Controlled Receiver Opt-In (Local)
**Command**: `cd apps/api && pnpm exec vitest run tests/integration/sr-partner-notify-fix-transport-20260927.integration.test.ts`
**Old Result (58b73a96)**: 3 passed (Local VM).
*Note: Real-server integration was deliberately NOT run on this VM in current run per reviewer instructions.*

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
