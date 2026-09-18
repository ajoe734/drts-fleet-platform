# IAM minimum release verification — 2026-08-11

Status: ready for review  
Task: `IAM-MIN-REL-001`  
Owner: `Codex`  
Reviewer: `Claude`  
Verified source: `origin/dev` at `5931fbc8ac8df9623f6964a9e53499b7b490b988`

## Integration evidence

| Prerequisite         | Normal PR evidence                                                                               | `origin/dev` evidence                                   |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `IAM-MIN-AUTH-001`   | [#1369](https://github.com/ajoe734/drts-fleet-platform/pull/1369), merged 2026-08-11; CI success | merge commit `0eb31db1ff111fa36426c89d4d663a61d8223e8b` |
| `IAM-MIN-ACCSES-001` | [#1372](https://github.com/ajoe734/drts-fleet-platform/pull/1372), merged 2026-08-11; CI success | merge commit `5931fbc8ac8df9623f6964a9e53499b7b490b988` |

Both PR check sets reported successful unit, integration, IAM-negative-matrix,
E2E, build, typecheck, lint, and integration-trunk CI before merge.

## Verification performed on `origin/dev`

Command:

```bash
pnpm exec vitest run \
  tests/unit/iam-min-accses-001.test.ts \
  tests/unit/auth-bootstrap.test.ts \
  tests/unit/bootstrap-auth-guard-strict-env.test.ts \
  tests/unit/auth-startup-config.test.ts \
  tests/integration/auth-startup-config.integration.test.ts \
  tests/security/iam-auth-negative-matrix.test.ts \
  tests/security/iam-route-inventory.test.ts \
  tests/contract/iam-contracts.test.ts
```

Result: **8 files, 70 tests passed**.

| Minimum acceptance flow                                                        | Evidence in the passing suite                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Disable account / change role invalidates an old session                       | `iam-min-accses-001.test.ts` criterion 6                                                                                                         |
| Current-device and all-device logout; another user's session cannot be revoked | `iam-min-accses-001.test.ts` criteria 4–5                                                                                                        |
| Cross-tenant account mutation is denied                                        | `iam-min-accses-001.test.ts` criterion 7                                                                                                         |
| Strict environment rejects an unclassified route                               | `apps/api/tests/unit/auth-bootstrap.test.ts` strict-route case; `iam-route-inventory.test.ts` classifies all security-critical controller routes |
| Stage and production reject fixture/email-only/bootstrap authentication        | `auth-bootstrap.test.ts`, `bootstrap-auth-guard-strict-env.test.ts`, and `iam-auth-negative-matrix.test.ts`                                      |
| Production strict auth configuration fails closed when controls are missing    | `auth-startup-config.test.ts` and `auth-startup-config.integration.test.ts`                                                                      |

The CI-equivalent IAM UAT entry point is
`pnpm run test:security:iam-negative-matrix`; it additionally requires a
Postgres `DATABASE_URL` for durable-session integration and hermetic E2E. This
worker did not have that variable, so it did not rerun the DB-backed portion
locally. The successful PR #1369 and #1372 integration-trunk CI runs include
the `iam-negative-matrix` and E2E checks.

## Completed baseline

- Tenant human OIDC login and fail-closed authorization are merged to `dev`.
- Strict environments reject unclassified routes and fixture/email-only login.
- Tenant account invite, enable/disable, basic role changes, last-admin
  protection, and self-elevation denial are merged to `dev`.
- Session logout, revoke-all, cross-account revoke denial, and invalidation on
  disable or role change are merged to `dev`.

## Explicitly deferred

This release verification deliberately excludes advanced IAM governance:

- access-review workflows and approval/audit governance beyond the baseline
  events;
- break-glass administration, segregation-of-duties policy, and per-action
  step-up MFA;
- shared dev-environment deployment confirmation. The integrated level proved
  here is `merged_to_dev`; no `Deploy - Dev` run evidence is asserted.
