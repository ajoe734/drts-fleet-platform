# TENANT-PRIVILEGED-GRANT-SESSION-CONSUMER-FLOW-20261015

Status: implemented on the owner worktree, pending handoff/review/CI/merge.
Owner: Claude. Reviewer: Codex. Finding: `C011-F1`.

## Source and version identity

- Base: `11ed91ba151b04519670d11316d5f30f1fdc0d74` (`origin/dev`, matches the dispatch's expected base).
- Branch: `claude/tenant-privileged-grant-session-consumer-flow-20261015`.
- Worktree: `.artifacts/worktrees/auto/claude-tenant-privileged-grant-session-consumer-flow-20261015`.
- Task spec: `.local/goal-continuation-20261015T2159-original-remaining-work-and-safe-execution-root/TENANT-PRIVILEGED-GRANT-SESSION-CONSUMER-FLOW-20261015-R2.task-spec.json`.
- No candidate/handoff has been issued yet; `CANDIDATE_SHA`/`CANDIDATE_BRANCH` are recorded at handoff time, not in this document.

## Finding (C011-F1) and root cause

`PrivilegedRoleGovernanceService` (not modified by this task) already implements the full dual-approval privileged-role-grant lifecycle (request, SoD/self-approval checks, fresh-MFA step-up, approve/reject/remove, time-bound activation, expiry scanning) and already persists an authoritative active-grant projection that `IdentityRepository.findRoleBindingsByMembershipId` / `findActivePrivilegedGrantsForMembership` expose. For platform/ops realm sessions, `JwtAuthService.validateDurableState` already consults that projection (`findRoleBindingsByMembershipId`), so a grant there is already "C011-F1-clean" — this is the "ops/platform already-connected consumption stays credited" behavior the task spec asked to preserve untouched.

For the **tenant** realm, the actual gap was in the consumer, not the producer:

- `OidcPkceService`'s tenant OIDC callback (`apps/api/src/modules/auth/oidc-pkce.service.ts`) built the issued session's `roles`/`scopes` directly from `existingUser.roleCode` (the durable `admin.phase1_tenant_user_roles` record, via `TenantPartnerService`), with no reference at all to the canonical active-grant projection. A dual-approved grant could be `status: "active"` in `IdentityRepository` and still never appear in a freshly issued tenant session.
- `JwtAuthService.validateDurableState`'s tenant branch (`apps/api/src/common/auth/jwt-auth.service.ts`) required `payload.roles[0] === user.roleCode` exactly, with no allowance for an elevated role at all. Even if issuance had been patched ad hoc to embed an elevated role, every subsequent durable revalidation (session re-check, token refresh gate) would have rejected that token outright, since the tenant branch had no path that could ever accept `payload.roles[0] !== user.roleCode`.
- There was no way to resolve the canonical `membershipId` for a legacy tenant user without performing a write (the existing `syncLegacyTenantUserRole` upserts it), so neither consumer could cheaply consult `findActivePrivilegedGrantsForMembership` on the read path.

## Fix (within the authorized write_scopes only)

- `apps/api/src/modules/identity/identity.repository.ts`: added `findMembershipIdForLegacyTenantUser(userId)`, a read-only lookup of the same `tenant_user_role:${userId}:membership` sourceRef that `syncLegacyTenantUserRole` already upserts. No new linkage is invented; this only reads the existing mirror.
- `apps/api/src/modules/auth/oidc-pkce.service.ts`: the tenant callback now resolves that membershipId and calls the existing `findActivePrivilegedGrantsForMembership`. When an active grant exists, the issued `IdentityContext`/session/JWT uses the grant's `roleCode`/scopes instead of the durable `roleCode`, and carries the grant's id as a new `tenantPrivilegedGrantId` claim (mirroring the existing `breakGlassGrantId` pattern). The durable `TenantUserRole` record itself is never written to — `existingUser.roleCode` is untouched, so there is no permanent role rewrite. `OidcPkceService` gained an `@Optional() identityRepository` constructor dependency; `AuthModule` already imports `IdentityModule`, so no module wiring changed.
- `apps/api/src/common/auth/jwt-auth.service.ts`: added the `tenantPrivilegedGrantId` claim end-to-end (`JwtIdentityPayload`, `JwtSignIdentity`, `IssueSessionTokenOptions`, `sign()`, `issueSessionToken()`, including the session's `riskSummary`). `validateDurableState`'s tenant branch now: (a) always re-checks `tokenVersion` first (unchanged behavior); (b) if the claimed role still equals the durable role, behaves exactly as before; (c) otherwise, only admits the elevated role if `payload.tenantPrivilegedGrantId` names a grant that is *still* present in a fresh `findActivePrivilegedGrantsForMembership` call for that membership and its `roleCode` still matches the claimed role — i.e. every durable revalidation, not just issuance, is bound to the live grant projection.

No change was made to `PrivilegedRoleGovernanceService`, any grant request/approval/removal endpoint, any realm/provider/role-catalog definition, or any migration/schema. No permanent `TenantUserRole` mutation was introduced.

## Regression design and reproducibility

New suite: `tests/unit/tenant-privileged-grant-session-consumer-20261015/tenant-grant-session-consumer.test.ts`. It drives the real production classes directly (`OidcPkceService`, `JwtAuthService`, `IdentityRepository`, `TenantPartnerService`, `PrivilegedRoleGovernanceService`, `BillingSettlementService`) with `IdentityRepository`'s in-memory fallback mode (no `DatabaseService`, no mocked business logic) and a mocked Google OIDC transport (signed RS256 ID tokens + JWKS, following the same pattern as the existing `tests/unit/tenant-google-invitation.test.ts` fixture). No product dev/preview/browser server, Docker or PG server is started.

6 cases:

1. **Before-fix reproduction**: a base `tenant_viewer` session has no `tenant:billing:write` scope; the real `authorizeInvoiceTenant` guard (used by the actual tenant billing controller) denies it.
2. **Fix proof — full chain**: a real independent requester creates a privileged-role request, a real independent approver approves it (`PrivilegedRoleGovernanceService`, unmodified), the pre-grant session is revoked (C010 credit), a fresh OIDC login is issued. The fresh session's `roles`/`scopes` reflect the grant; `verifyAccessToken` validates it; `payload.tenantPrivilegedGrantId` matches the grant id; `authorizeInvoiceTenant` now admits it; a real protected command (`BillingSettlementService.updateTenantBillingProfile`) succeeds and an independent `getTenantBillingProfile` readback confirms the persisted effect. The durable `TenantUserRole.roleCode` is asserted to remain `"tenant_viewer"` throughout (no permanent rewrite).
3. **Removed grant**: the grant is removed via the real `removeGrant` after the elevated token was issued; the *same, still-live* token is re-validated via `verifyAccessToken` with no new login and is now denied (`null`) — proves durable, not just at-issuance, binding. A fresh login afterward reverts to the base role.
4. **Expired / future grants**: a grant is aged past its `validTo` (direct repository write, same convention `tests/unit/tenant-google-invitation.test.ts` already uses for time-based record states) and no longer projects or elevates a fresh login; a future-`validFrom` request approves into `pending_activation` (unmodified governance behavior) and is confirmed to never appear in `findActivePrivilegedGrantsForMembership`/elevate a login.
5. **Wrong tenant**: a grant scoped to a different `tenantId` for the same membership never appears in `findActivePrivilegedGrantsForMembership` and never elevates a login.
6. **Self-approval regression**: confirms `PrivilegedRoleGovernanceService`'s existing SoD/self-approval rejection is unaffected by this change (this service was not modified).

Before/after proof for the core fix (case 2) was captured by reverting only the three production files to their pre-fix content (via the git stash of this exact diff) and re-running the identical test file:

- Pre-fix (`identity.repository.ts`, `oidc-pkce.service.ts`, `jwt-auth.service.ts` all reverted): `f.repo.findMembershipIdForLegacyTenantUser is not a function` — 5 of 6 cases fail outright because the new read path does not exist yet.
- Pre-fix repository method restored alone (isolating the consumer gap from the data-layer addition): case 2 fails with `AssertionError: expected [ 'tenant_viewer' ] to deeply equal [ 'tenant_finance_admin' ]` at the fresh-login assertion — this is the literal C011-F1 symptom (grant approved and active, session still carries the pre-elevation role).
- Full fix restored: all 6 cases pass.

## Checks

| Finding / required acceptance | Command | Exit | Result |
| --- | --- | --- | --- |
| build prerequisites | `pnpm --filter @drts/contracts build`; `pnpm --filter @drts/control-plane-auth build` | 0 / 0 | dist rebuilt; required before `@drts/api` typecheck resolves (stale dist otherwise reports false "no exported member" errors) |
| `tenant-elevation_exact-candidate-validation` | `cd apps/api && pnpm typecheck` | 0 | clean, no errors |
| `tenant-elevation_exact-candidate-validation` | `pnpm exec eslint apps/api/src/modules/auth/oidc-pkce.service.ts apps/api/src/common/auth/jwt-auth.service.ts apps/api/src/modules/identity/identity.repository.ts` | 0 | no findings |
| `tenant-elevation_canonical-grant-session-binding`, `tenant-elevation_effective-command-and-readback`, `tenant-elevation_expiry-removal-and-denial-regressions` | `npx vitest run tests/unit/tenant-privileged-grant-session-consumer-20261015/tenant-grant-session-consumer.test.ts` | 0 | 6/6 passed (see before/after proof above) |
| regression: C011 approval/SoD/four-eyes unaffected | `npx vitest run tests/unit/system-remediation/sr-qa-identity-001/` | 0 | 4 files, 43/43 passed |
| regression: full IAM-RBAC-002 governance suite (incl. platform/ops `findRoleBindingsByMembershipId` grant projection) unaffected | `npx vitest run tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts` | 0 | passed |
| regression: existing tenant OIDC/PKCE and Google-invitation flows unaffected | `npx vitest run tests/unit/auth-oidc-pkce.test.ts tests/unit/tenant-google-invitation.test.ts tests/unit/entry-tenant-google-oidc.test.ts` | 0 | passed |
| regression: broader tenant OIDC callers (BFF routes, bank handlers, ordinary-login MFA policy, C001/C002 suite) | `npx vitest run tests/integ/oidc-pkce-bff-route.test.ts tests/integ/oidc-pkce-bff.test.ts tests/unit/bank-user-management-flow-20261015/management-handlers.test.ts tests/unit/system-remediation/sr-auth-mfa-policy-20260915/ordinary-login-mfa-policy.test.ts tests/unit/system-remediation/sr-qa-identity-001/c001-c002-public-and-oidc.test.ts` | 0 | passed |

Node `v22.23.2`, pnpm `10.33.0`, Vitest `4.1.4`.

### Unrelated pre-existing failure (not a regression from this change)

`tests/security/iam-tenant-session-revocation-e2e.test.ts` fails to collect with `Cannot find package '@drts/tenant-auth'`. `packages/tenant-auth` ships no build output (`"build": "tsc -p tsconfig.json --noEmit"`, `exports` point straight at `./src/*.ts`) and there is no `node_modules/@drts/tenant-auth` workspace link in this worktree. `git log` on this test file shows its most recent change is `ed70d73a0` (`TENANT-BOOK-PERSISTENCE-ACK-20261015`), unrelated to any file this task touched; this task made no change to `packages/tenant-auth`, the Next.js tenant-console app it is imported from, or workspace linking. It is a pre-existing worktree dependency-linking gap, not a reproduction of C011-F1 or a regression introduced here.

## Honest limits

- No live PostgreSQL, browser, or shared-dev deployment run. `IdentityRepository` is exercised in its production in-memory fallback mode (no mocks of the logic under test); the DB-backed path (`iam.identity_memberships`/`iam.identity_sessions` SQL) added in `findMembershipIdForLegacyTenantUser` reuses the exact `source_ref`-keyed query shape already used elsewhere in the same file (e.g. inside `upsertMembership`), but was not exercised against a live database by this task.
- `required_acceptance` evidence here covers implementation + regression testing only. Review (`Codex`), mandatory CI and protected merge are pending and tracked by the normal candidate lifecycle once a candidate SHA is handed off; this document does not claim `done`.
- Scope was held to exactly the authorized `write_scopes`: `oidc-pkce.service.ts`, `jwt-auth.service.ts`, `identity.repository.ts`, this doc, and the new test directory. No grant-creation/approval endpoint, role catalog, migration, or unrelated module was touched.
