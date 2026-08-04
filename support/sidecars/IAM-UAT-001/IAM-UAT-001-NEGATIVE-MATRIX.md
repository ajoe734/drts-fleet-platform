# IAM-UAT-001 Negative Matrix

Status: verified_for_closeout  
Task: `IAM-UAT-001`  
Owner: `Codex`  
Reviewer: `Gemini`

## Scope

This packet defines the independent, release-blocking IAM negative matrix entry
point required by Stage 1.5. The suite is intentionally cross-cutting:

- authentication negatives
- authorization and tenant-isolation denial
- durable session revoke / replay / restart coverage
- credential expiry failure-closed coverage
- audit persistence failure coverage
- browser-storage and secret-leakage scans

Entry command:

```bash
pnpm run test:security:iam-negative-matrix
```

CI wiring:

- `.github/workflows/ci-integ.yml` job `iam-negative-matrix`

## Coverage Map

| Acceptance slice                                              | Evidence command / file                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Email-only, bootstrap-header, non-enumerating auth negatives  | `tests/security/iam-auth-negative-matrix.test.ts`                    |
| Spoofed IAP header, wrong audience, inactive workforce denial | `tests/integration/iap-subject-adapter.integration.test.ts`          |
| Startup fail-closed plus secret-safe error reporting          | `tests/integration/auth-startup-config.integration.test.ts`          |
| Security-critical route classification gate                   | `tests/security/iam-route-inventory.test.ts`                         |
| Tenant API key expiry fail-closed                             | `tests/security/iam-credential-expiry.test.ts`                       |
| Audit persistence failure and masked security-event context   | `tests/unit/security-events.test.ts`                                 |
| Durable session restart / concurrency / reuse detection       | `apps/api/tests/integration/identity-session-db.integration.test.ts` |
| JWT `sid` / `jti` / `tokenVersion` enforcement                | `apps/api/tests/integration/jwt-session-claims.integration.test.ts`  |
| Cross-tenant read isolation                                   | `tests/e2e/E2E-004-tenant-attribution.sh`                            |
| Driver refresh replay / revoke lifecycle                      | `tests/e2e/E2E-018-driver-device-lifecycle.sh`                       |
| Browser storage and sidecar secret scan                       | `tests/security/iam-browser-storage-and-secret-leakage.test.ts`      |

## Run Log

- `2026-08-02T13:28:56Z`
  Command:
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_fleet_platform_iam_uat_001 AUTH_MODE=test JWT_SECRET=ci-e2e-secret JWT_ISSUER=drts-local JWT_AUDIENCE=drts-api CONTROLLED_DOWNLOAD_SIGNING_SECRET=ci-e2e-controlled-download-secret PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT=ci-e2e-alpha-ingress-key PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT=ci-e2e-beta-ingress-key API_PORT=3101 API_HOST=127.0.0.1 E2E_API_URL=http://127.0.0.1:3101 API_LOG=/tmp/drts-e2e-api-iam-uat-001.log ./tests/e2e/run-e2e-hermetic.sh 004 018`
  Result:
  `[hermetic] PASS (2): 004 018`

- `2026-08-02T13:36:41Z`
  Command:
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_fleet_platform_iam_uat_001 AUTH_MODE=test JWT_SECRET=ci-e2e-secret JWT_ISSUER=drts-local JWT_AUDIENCE=drts-api CONTROLLED_DOWNLOAD_SIGNING_SECRET=ci-e2e-controlled-download-secret PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT=ci-e2e-alpha-ingress-key PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT=ci-e2e-beta-ingress-key pnpm run test:security:iam-negative-matrix`
  Result:
  Root security pack `7/7` files passed, DB-backed identity/session integration `2/2` files passed, hermetic E2E `004` and `018` both passed through the suite entrypoint.

- `2026-08-03T06:40:51Z`
  Command:
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_fleet_platform_iam_uat_001 AUTH_MODE=test JWT_SECRET=ci-e2e-secret JWT_ISSUER=drts-local JWT_AUDIENCE=drts-api CONTROLLED_DOWNLOAD_SIGNING_SECRET=ci-e2e-controlled-download-secret PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT=ci-e2e-alpha-ingress-key PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT=ci-e2e-beta-ingress-key API_PORT=3101 API_HOST=127.0.0.1 E2E_API_URL=http://127.0.0.1:3101 API_LOG=/tmp/drts-e2e-api-iam-uat-001.log pnpm run test:security:iam-negative-matrix`
  Result:
  Re-verified closeout after hardening `jwt-session-claims` cleanup for fixture-backed driver principals. Root security pack `7/7` files passed, DB-backed identity/session integration `2/2` files passed, hermetic E2E `004` and `018` both passed.

- `2026-08-04T00:37:22Z`
  Command:
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_fleet_platform_iam_uat_001 AUTH_MODE=test JWT_SECRET=ci-e2e-secret JWT_ISSUER=drts-local JWT_AUDIENCE=drts-api CONTROLLED_DOWNLOAD_SIGNING_SECRET=ci-e2e-controlled-download-secret PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT=ci-e2e-alpha-ingress-key PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT=ci-e2e-beta-ingress-key API_PORT=3101 API_HOST=127.0.0.1 E2E_API_URL=http://127.0.0.1:3101 API_LOG=/tmp/drts-e2e-api-iam-uat-001.log pnpm run test:security:iam-negative-matrix`
  Result:
  Owner closeout re-verification passed on the isolated worker branch. Root security pack `7/7` files passed, DB-backed identity/session integration `2/2` files passed, hermetic E2E `004` and `018` both passed after repairing local worktree `node_modules` for hermetic execution.

- Caveat:
  The hermetic IAM suite now reserves loopback port `3101` by default inside `tests/security/run-iam-negative-matrix.sh` so local or supervisor-owned listeners on `127.0.0.1:3001` cannot poison CI-equivalent runs.
