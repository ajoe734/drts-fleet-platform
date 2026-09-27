# SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927

## Fix Description
- Removed job-wide `DRTS_ALLOW_LOCAL_WEBHOOKS` dynamic logic causing `no-require-imports` lint errors.
- Introduced statically imported HTTP/HTTPS `request` functions and chose the right one conditionally.
- Re-added strong typings for TS callbacks to satisfy `TS7006`.
- Maintained production-first safeguard strategy while explicitly testing matrix behavior of `NODE_ENV` and `DRTS_ALLOW_LOCAL_WEBHOOKS`.

## Validation Commands and Results

### 1. Lint Check
**Command**:
`pnpm exec eslint apps/api/src/modules/tenant-partner/partner-notification-https.ts`
**Result**: Exit 0 (Passed). Lint failure for dynamic `require("node:http")` resolved.

### 2. Typecheck
**Command**:
`pnpm exec tsc -p apps/api/tsconfig.json --noEmit`
**Result**: Exit 0 (Passed). TS7006 and other type issues resolved.

### 3. Unit Tests for HTTPS Transport
**Command**:
`pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-transport-20260918/https.test.ts tests/unit/system-remediation/sr-partner-notify-transport-20260918/https-client.test.ts`
**Result**: 40 passed. Environment safeguards are explicitly verified (production overrides flags; local test allows explicit flags).

### 4. Integration Test for Controlled Receiver Opt-In
**Command**:
`cd apps/api && pnpm exec vitest run tests/integration/sr-partner-notify-fix-transport-20260927.integration.test.ts`
**Result**: 3 passed. Explicit test for opt-in matrix verified with an actual HTTP server.

All required acceptance criteria are MET:
- `typed_transport_lint_pass`
- `production_and_default_network_guards_preserved`
- `explicit_controlled_receiver_optin_tested`
