# IAM-UAT-001 Negative Matrix

Status: in_progress  
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

| Acceptance slice | Evidence command / file |
| --- | --- |
| Email-only, bootstrap-header, non-enumerating auth negatives | `tests/security/iam-auth-negative-matrix.test.ts` |
| Spoofed IAP header, wrong audience, inactive workforce denial | `tests/integration/iap-subject-adapter.integration.test.ts` |
| Startup fail-closed plus secret-safe error reporting | `tests/integration/auth-startup-config.integration.test.ts` |
| Security-critical route classification gate | `tests/security/iam-route-inventory.test.ts` |
| Tenant API key expiry fail-closed | `tests/security/iam-credential-expiry.test.ts` |
| Audit persistence failure and masked security-event context | `tests/unit/security-events.test.ts` |
| Durable session restart / concurrency / reuse detection | `apps/api/tests/integration/identity-session-db.integration.test.ts` |
| JWT `sid` / `jti` / `tokenVersion` enforcement | `apps/api/tests/integration/jwt-session-claims.integration.test.ts` |
| Cross-tenant read isolation | `tests/e2e/E2E-004-tenant-attribution.sh` |
| Driver refresh replay / revoke lifecycle | `tests/e2e/E2E-018-driver-device-lifecycle.sh` |
| Browser storage and sidecar secret scan | `tests/security/iam-browser-storage-and-secret-leakage.test.ts` |

## Run Log

Pending local verification on branch `codex/iam-uat-001`.

After verification, update this section with:

- absolute UTC timestamp
- exact command
- result
- notable caveats, if any
