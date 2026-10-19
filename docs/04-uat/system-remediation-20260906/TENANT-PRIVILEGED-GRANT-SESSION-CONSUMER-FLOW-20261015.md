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
- `apps/api/src/common/auth/jwt-auth.service.ts`: added the `tenantPrivilegedGrantId` claim end-to-end (`JwtIdentityPayload`, `JwtSignIdentity`, `IssueSessionTokenOptions`, `sign()`, `issueSessionToken()`, including the session's `riskSummary`). `validateDurableState`'s tenant branch now: (a) always re-checks `tokenVersion` first (unchanged behavior); (b) if the claimed role still equals the durable role, behaves exactly as before; (c) otherwise, only admits the elevated role if `payload.tenantPrivilegedGrantId` names a grant that is _still_ present in a fresh `findActivePrivilegedGrantsForMembership` call for that membership and its `roleCode` still matches the claimed role — i.e. every durable revalidation, not just issuance, is bound to the live grant projection.

No change was made to `PrivilegedRoleGovernanceService`, any grant request/approval/removal endpoint, any realm/provider/role-catalog definition, or any migration/schema. No permanent `TenantUserRole` mutation was introduced.

## Regression design and reproducibility

New suite: `tests/unit/tenant-privileged-grant-session-consumer-20261015/tenant-grant-session-consumer.test.ts`. It drives the real production classes directly (`OidcPkceService`, `JwtAuthService`, `IdentityRepository`, `TenantPartnerService`, `PrivilegedRoleGovernanceService`, `BillingSettlementService`) with `IdentityRepository`'s in-memory fallback mode (no `DatabaseService`, no mocked business logic) and a mocked Google OIDC transport (signed RS256 ID tokens + JWKS, following the same pattern as the existing `tests/unit/tenant-google-invitation.test.ts` fixture). No product dev/preview/browser server, Docker or PG server is started.

6 cases:

1. **Before-fix reproduction**: a base `tenant_viewer` session has no `tenant:billing:write` scope; the real `authorizeInvoiceTenant` guard (used by the actual tenant billing controller) denies it.
2. **Fix proof — full chain**: a real independent requester creates a privileged-role request, a real independent approver approves it (`PrivilegedRoleGovernanceService`, unmodified), the pre-grant session is revoked (C010 credit), a fresh OIDC login is issued. The fresh session's `roles`/`scopes` reflect the grant; `verifyAccessToken` validates it; `payload.tenantPrivilegedGrantId` matches the grant id; `authorizeInvoiceTenant` now admits it; a real protected command (`BillingSettlementService.updateTenantBillingProfile`) succeeds and an independent `getTenantBillingProfile` readback confirms the persisted effect. The durable `TenantUserRole.roleCode` is asserted to remain `"tenant_viewer"` throughout (no permanent rewrite).
3. **Removed grant**: the grant is removed via the real `removeGrant` after the elevated token was issued; the _same, still-live_ token is re-validated via `verifyAccessToken` with no new login and is now denied (`null`) — proves durable, not just at-issuance, binding. A fresh login afterward reverts to the base role.
4. **Expired / future grants**: a grant is aged past its `validTo` (direct repository write, same convention `tests/unit/tenant-google-invitation.test.ts` already uses for time-based record states) and no longer projects or elevates a fresh login; a future-`validFrom` request approves into `pending_activation` (unmodified governance behavior) and is confirmed to never appear in `findActivePrivilegedGrantsForMembership`/elevate a login.
5. **Wrong tenant**: a grant scoped to a different `tenantId` for the same membership never appears in `findActivePrivilegedGrantsForMembership` and never elevates a login.
6. **Self-approval regression**: confirms `PrivilegedRoleGovernanceService`'s existing SoD/self-approval rejection is unaffected by this change (this service was not modified).

Before/after proof for the core fix (case 2) was captured by reverting only the three production files to their pre-fix content (via the git stash of this exact diff) and re-running the identical test file:

- Pre-fix (`identity.repository.ts`, `oidc-pkce.service.ts`, `jwt-auth.service.ts` all reverted): `f.repo.findMembershipIdForLegacyTenantUser is not a function` — 5 of 6 cases fail outright because the new read path does not exist yet.
- Pre-fix repository method restored alone (isolating the consumer gap from the data-layer addition): case 2 fails with `AssertionError: expected [ 'tenant_viewer' ] to deeply equal [ 'tenant_finance_admin' ]` at the fresh-login assertion — this is the literal C011-F1 symptom (grant approved and active, session still carries the pre-elevation role).
- Full fix restored: all 6 cases pass.

## Checks

| Finding / required acceptance                                                                                                                                   | Command                                                                                                                                                                                                                                                                                                                                             | Exit  | Result                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| build prerequisites                                                                                                                                             | `pnpm --filter @drts/contracts build`; `pnpm --filter @drts/control-plane-auth build`                                                                                                                                                                                                                                                               | 0 / 0 | dist rebuilt; required before `@drts/api` typecheck resolves (stale dist otherwise reports false "no exported member" errors) |
| `tenant-elevation_exact-candidate-validation`                                                                                                                   | `cd apps/api && pnpm typecheck`                                                                                                                                                                                                                                                                                                                     | 0     | clean, no errors                                                                                                              |
| `tenant-elevation_exact-candidate-validation`                                                                                                                   | `pnpm exec eslint apps/api/src/modules/auth/oidc-pkce.service.ts apps/api/src/common/auth/jwt-auth.service.ts apps/api/src/modules/identity/identity.repository.ts`                                                                                                                                                                                 | 0     | no findings                                                                                                                   |
| `tenant-elevation_canonical-grant-session-binding`, `tenant-elevation_effective-command-and-readback`, `tenant-elevation_expiry-removal-and-denial-regressions` | `npx vitest run tests/unit/tenant-privileged-grant-session-consumer-20261015/tenant-grant-session-consumer.test.ts`                                                                                                                                                                                                                                 | 0     | 6/6 passed (see before/after proof above)                                                                                     |
| regression: C011 approval/SoD/four-eyes unaffected                                                                                                              | `npx vitest run tests/unit/system-remediation/sr-qa-identity-001/`                                                                                                                                                                                                                                                                                  | 0     | 4 files, 43/43 passed                                                                                                         |
| regression: full IAM-RBAC-002 governance suite (incl. platform/ops `findRoleBindingsByMembershipId` grant projection) unaffected                                | `npx vitest run tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts`                                                                                                                                                                                                                                                      | 0     | passed                                                                                                                        |
| regression: existing tenant OIDC/PKCE and Google-invitation flows unaffected                                                                                    | `npx vitest run tests/unit/auth-oidc-pkce.test.ts tests/unit/tenant-google-invitation.test.ts tests/unit/entry-tenant-google-oidc.test.ts`                                                                                                                                                                                                          | 0     | passed                                                                                                                        |
| regression: broader tenant OIDC callers (BFF routes, bank handlers, ordinary-login MFA policy, C001/C002 suite)                                                 | `npx vitest run tests/integ/oidc-pkce-bff-route.test.ts tests/integ/oidc-pkce-bff.test.ts tests/unit/bank-user-management-flow-20261015/management-handlers.test.ts tests/unit/system-remediation/sr-auth-mfa-policy-20260915/ordinary-login-mfa-policy.test.ts tests/unit/system-remediation/sr-qa-identity-001/c001-c002-public-and-oidc.test.ts` | 0     | passed                                                                                                                        |

Node `v22.23.2`, pnpm `10.33.0`, Vitest `4.1.4`.

### Unrelated pre-existing failure (not a regression from this change)

`tests/security/iam-tenant-session-revocation-e2e.test.ts` fails to collect with `Cannot find package '@drts/tenant-auth'`. `packages/tenant-auth` ships no build output (`"build": "tsc -p tsconfig.json --noEmit"`, `exports` point straight at `./src/*.ts`) and there is no `node_modules/@drts/tenant-auth` workspace link in this worktree. `git log` on this test file shows its most recent change is `ed70d73a0` (`TENANT-BOOK-PERSISTENCE-ACK-20261015`), unrelated to any file this task touched; this task made no change to `packages/tenant-auth`, the Next.js tenant-console app it is imported from, or workspace linking. It is a pre-existing worktree dependency-linking gap, not a reproduction of C011-F1 or a regression introduced here.

## Honest limits

- No live PostgreSQL, browser, or shared-dev deployment run. `IdentityRepository` is exercised in its production in-memory fallback mode (no mocks of the logic under test); the DB-backed path (`iam.identity_memberships`/`iam.identity_sessions` SQL) added in `findMembershipIdForLegacyTenantUser` reuses the exact `source_ref`-keyed query shape already used elsewhere in the same file (e.g. inside `upsertMembership`), but was not exercised against a live database by this task.
- `required_acceptance` evidence here covers implementation + regression testing only. Review (`Codex`), mandatory CI and protected merge are pending and tracked by the normal candidate lifecycle once a candidate SHA is handed off; this document does not claim `done`.
- Scope was held to exactly the authorized `write_scopes`: `oidc-pkce.service.ts`, `jwt-auth.service.ts`, `identity.repository.ts`, this doc, and the new test directory. No grant-creation/approval endpoint, role catalog, migration, or unrelated module was touched.

## Reopen round 2: reviewer-reproduced defects (R2-F1, R2-F2, R2-F3) and fix

Reviewer `Codex` reopened candidate `23875d19fab860b4591d4946cc3255410e307fa2` (exact-candidate review FAILED) with three independently-reproduced P1 defects in the production code above, plus a CI lint failure (unused `hash`/`createHash` helper in the new test file, fixed first and separately in commit `9262d3276e1fe9297a50642c253695b7ae58c990`). The three defects:

- **R2-F1 (effective-role MFA bypass)**: `oidc-pkce.service.ts` selected `effectiveRoleCode` from an active grant (e.g. `tenant_admin`) but the mandatory-MFA gate still tested `existingUser.roleCode` (the durable, unelevated role). A fresh ordinary-login callback with no `amr`/`acr` proof, `AUTH_REQUIRE_ORDINARY_LOGIN_MFA=false` and `DRTS_DEV_MFA_WAIVED=false`, could land `roles=[tenant_admin]` in an accepted session with zero MFA proof.
- **R2-F2 (canonical grant/session identity disconnected)**: the session issued by the tenant callback always used `principalId: existingUser.userId` (the legacy tenant-user id) and never set `membershipId`, even though `syncLegacyTenantUserRole` already maintains a canonical principal `P`/membership `M` for that same user. Because `PrivilegedRoleGovernanceService.approveRequest` revokes sessions via `IdentityRepository.revokeSessionsByPrincipal(request.targetUserId, ...)`, an approval targeting the canonical principal `P` (the correct way to target a grant at a principal/membership, not a legacy string) revoked nothing, since no session had ever been issued with `principalId: P`. The old pre-elevation token kept validating after approval, and the fresh elevated token still carried the legacy principal and a null membership instead of the canonical identity.
- **R2-F3 (explicit targetMembershipId not respected)**: `IdentityRepository.findActivePrivilegedGrantsForMembership` matched a grant via `grant.targetMembershipId === membershipId OR grant.targetUserId === membership.principalId`. For a principal `P` with two memberships `M` and `N` (e.g. two different tenant-scoped sourceRefs), a grant explicitly targeted at `N` only (`targetMembershipId: N`) still matched membership `M` through the principal-match OR-branch, silently widening an explicitly-scoped grant to every membership of the same principal.

### Fix (same three write-scoped files, no scope change)

- `apps/api/src/modules/auth/oidc-pkce.service.ts`: the mandatory-MFA role list (`["tenant_admin", "tenant_ops_admin"]`) is now tested against `effectiveRoleCode` (the role actually being issued) instead of `existingUser.roleCode` (the durable, pre-grant role) — closes R2-F1.
- `apps/api/src/modules/auth/oidc-pkce.service.ts`: after resolving `membershipId` via `findMembershipIdForLegacyTenantUser`, the service now also calls the existing `findMembershipById(membershipId)` to read that membership's canonical `principalId`, and `sessionTokenOptions.principalId`/`membershipId` use that canonical pair (falling back to `existingUser.userId`/`null` only when no canonical membership exists yet) instead of always using the legacy id with a null membership — closes R2-F2. No new principal/membership record is created; this only reads the mirror `syncLegacyTenantUserRole` already maintains, exactly like the existing `findMembershipIdForLegacyTenantUser` read path.
- `apps/api/src/modules/identity/identity.repository.ts` (`findActivePrivilegedGrantsForMembership`): when a grant carries an explicit `targetMembershipId`, that is now the _only_ thing checked (`grant.targetMembershipId === membershipId`); the principal-match fallback (`grant.targetUserId === membership.principalId`) is now only reached for grants that have no explicit `targetMembershipId` at all — closes R2-F3.

### New regressions reproducing each defect before/after the fix

Added to the same suite (`tests/unit/tenant-privileged-grant-session-consumer-20261015/tenant-grant-session-consumer.test.ts`, now 9 cases):

7. **R2-F1 regression**: approves a real dual-approved `tenant_admin` grant, then asserts a fresh ordinary-login callback (no MFA proof) is rejected (`toThrow()`) instead of silently issuing `roles=[tenant_admin]`.
8. **R2-F2 regression**: asserts the _base_ (pre-grant) session's decoded JWT already carries `principalId === membership.principalId` (not the legacy `f.user.userId`) and `membershipId === membershipId`; then approves a grant targeted at the canonical `principalId` (as a real caller would) and asserts the pre-elevation token is denied by `verifyAccessToken` with **no manual `revokeCurrentSession` call** (unlike case 2, which predates this round and still demonstrates the C010 credit explicitly); the fresh elevated session's decoded JWT is asserted to carry the same canonical `principalId`/`membershipId`.
9. **R2-F3 regression**: creates a second membership `N` for the same principal via `ensureMembershipRecord` (same tenant, different `sourceRef`), approves a grant with `targetMembershipId: N` only, and asserts `findActivePrivilegedGrantsForMembership(M)` returns empty and a fresh login on `M` stays `tenant_viewer`.

Before the round-2 fix (`oidc-pkce.service.ts` MFA-gate line and `identity.repository.ts` match-logic reverted to their round-1 state, `sessionTokenOptions.principalId`/`membershipId` reverted to legacy/null): cases 7-9 fail exactly as the reviewer described (case 7 issues an accepted `tenant_admin` token with no MFA proof instead of throwing; case 8's base-session assertions fail since `principalId` is the legacy id and `membershipId` is `null`, and the pre-elevation token is still valid after approval; case 9's `findActivePrivilegedGrantsForMembership(M)` incorrectly includes the `N`-scoped grant). After the fix: all 9 cases pass.

### Checks (round 2)

| Check                                                                                                                              | Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Exit  | Result                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------- |
| CI lint fix (unused helper)                                                                                                        | `pnpm exec eslint tests/unit/tenant-privileged-grant-session-consumer-20261015/tenant-grant-session-consumer.test.ts --max-warnings=0`; `pnpm run lint:root`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 0 / 0 | clean                                                                                                    |
| New + original suite, this task                                                                                                    | `pnpm exec vitest run tests/unit/tenant-privileged-grant-session-consumer-20261015/tenant-grant-session-consumer.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 0     | 9/9 passed                                                                                               |
| Regression: SR-QA-IDENTITY-001                                                                                                     | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-identity-001`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 0     | 4 files, 43/43 passed                                                                                    |
| Regression: IAM-RBAC-002 governance, OIDC/PKCE, Google invitation, BFF routes, bank handlers, ordinary-login MFA policy, C001/C002 | `pnpm exec vitest run tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts tests/unit/auth-oidc-pkce.test.ts tests/unit/tenant-google-invitation.test.ts tests/unit/entry-tenant-google-oidc.test.ts tests/integ/oidc-pkce-bff.test.ts tests/integ/oidc-pkce-bff-route.test.ts tests/unit/bank-user-management-flow-20261015 tests/unit/system-remediation/sr-auth-mfa-policy-20260915/ordinary-login-mfa-policy.test.ts tests/unit/system-remediation/sr-auth-session-supersede-20261003/session-supersede.test.ts tests/unit/system-remediation/sr-qa-identity-001/c001-c002-public-and-oidc.test.ts` | 0     | 15 files, 189 passed / 2 skipped                                                                         |
| `tenant-elevation_exact-candidate-validation`                                                                                      | `pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build && (cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 0     | clean after rebuilding stale shared dist (pre-existing worktree staleness, not introduced by this round) |
| `tenant-elevation_exact-candidate-validation`                                                                                      | `pnpm exec eslint apps/api/src/modules/auth/oidc-pkce.service.ts apps/api/src/modules/identity/identity.repository.ts apps/api/src/common/auth/jwt-auth.service.ts --max-warnings=0`                                                                                                                                                                                                                                                                                                                                                                                                                                             | 0     | no findings                                                                                              |

No VM server/browser/PG/cloud execution. Static audit alone is not treated as a test result; all rows above are real command exits re-run on this round's candidate.

## 2026-10-19 available-owner continuation (R3, full original 4 criteria)

The earlier sections are historical Claude task evidence, including its earlier
fixtures, failed preparations, and published fixes. The current implementation
continues that original task with Codex2 as author and Codex as independent
reviewer. Original published commits `23875d19`, `9262d327`, and `446b1dbc` were
normally cherry-picked onto accepted `f8455c3b1ef0be7849e97f30654fdb0219964533`.
Their literal Git author is Gemini2 and their task trailer is Claude; neither
history nor the original author's credit has been rewritten. New work uses the
Codex2 Git identity and normal task trailers.

R3 spec: `.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/TENANT-PRIVILEGED-GRANT-SESSION-CONSUMER-FLOW-20261015-R3-full-original4-fourkeys-plus-one-original-producer-available-owner.task-spec.json`
(SHA256 `dcb966a469587259b737b9fa01d5194b0bfb13e05829e085a06b5d068634fe98`).
Evidence directory in that same continuation root:
`tenant-grant-original-source-evidence/`. This is Source delivery; hosted CI,
independent acceptance, merge, and four key records belong to the reviewer.

### Actual producer and identity correction

The original consumer changes are retained. The additional producer correction
resolves existing legacy user, canonical principal and explicit membership
references through the same repository mirror. Requester and approver fields
use the verified canonical principal when present, with existing actor-only
callers preserved. Approve/reject compare the actual requester and recipient,
including the explicit membership consumed by the session projection. Existing
incompatible role pairs apply to that same person under either naming form.
The five original role-policy constants are unchanged. No identity link,
permanent role, schema, realm, provider or grant policy was added.

Membership lookup accepts an optional existing transaction client. Approval and
its SoD checks retain the client already owned by `withTenantLock`; lookup does
not lease another connection or release the caller's client. The normal read
callers retain their original default behavior.

### Before and fixed evidence

- `accepted-f845-before`: direct 1, one selected failure and two unselected
  cases. A real canonical grant was active, but the original access token still
  verified after approval. Existing `listMemberships` reads the real invitation
  mirror; this failure is not a newly missing lookup helper.
- `published446b-before`: direct 1, one legitimate independent approval passed
  and two self-target cases failed. The default-reporter diagnostic
  `published446b-before-observed` separately records the actual finance grant
  active, fresh token consuming that grant, and protected Billing write/readback
  succeeding. The security grant became active but that token did not consume
  it; no successful security-role command is claimed.
- `incompatible-alias-before`: direct 1, one selected failure / seven
  unselected. After legitimate canonical finance approval, the same real
  membership requested security authority under the legacy user ID and was
  incorrectly accepted as pending. The existing incompatible-role rule now
  rejects that naming bypass.
- Initial fixed and expanded runs are retained with their own versions and
  counts. They are overlapping evidence, not additional passes.

`real-oidc-governance.test.ts` performs three real invitation and signed RS256
Google OIDC callbacks, normal access-token verification and `toRequestIdentity`.
It passes those actual identities into request/approval, checks automatic old
session and refresh-family revocation, performs fresh OIDC issuance, and uses a
new JWT verifier for the actual protected Billing update/readback. It does not
manually revoke the old session or manufacture governance actors/links. Original
nine cases remain byte-identical, including their historical manual-revocation
and handcrafted-identity fixtures; those older cases do not stand in for the new
complete real-caller proof.

The controlled SQL cases use real IdentityRepository, governance and required
SecurityEventsRepository writes. Their transport starts from records produced
by the real invitation/OIDC chain, stages client-local transactions, rejects
actual grant INSERT or required audit INSERT, and verifies ROLLBACK, a fresh
repository's pending request/no grant, read-only login, and successful legitimate
retry followed by fresh-repository JWT verification and Billing readback. The
transport rejects unknown SQL, pool-query escape, or a second connection lease
inside the existing governance transaction. It is a socket-free SQL simulation,
not a PostgreSQL execution or restart of a database server.

### Full original acceptance mapping and validation

1. `tenant-elevation_canonical-grant-session-binding`: retained OIDC/JWT and
   explicit-membership projection, new real identities, canonical/legacy and
   explicit-recipient SoD checks; permanent viewer record unchanged.
2. `tenant-elevation_effective-command-and-readback`: real independent approval,
   automatic old-session/refresh-family revocation, fresh login, new durable
   verifier, actual Billing profile mutation and authoritative service readback.
3. `tenant-elevation_expiry-removal-and-denial-regressions`: original nine cases
   retain future/expired/removed, wrong tenant/membership, MFA and role checks;
   new cases cover selfapproval aliases, membership recipient, persistence and
   required-audit rejection/retry. Original IAM, C010, unchanged-principal
   parallel sessions and allowed key overlap run in the affected union.
4. `tenant-elevation_exact-candidate-validation`: current Source and test types,
   build, lint, normal hooks/trailers and immutable handoff; exact commands,
   direct exits, hashes, and candidate tuple are in the sealed packet.

The first 20-file affected run had direct 1: 212 assertion passes, 2 failures,
2 existing PG skips, and two uncollected suites. Missing sparse Bank modules
caused those setup errors. Only unchanged tracked modules from own HEAD were
materialized; the existing Bank tests and assertions were not changed.
The following 20-file run had direct 0: 240 passes and 2 existing DATABASE_URL
skips. Separate C002 selection had direct 0: 4 passes and 3 unselected C001
public-network checks. These runs overlap earlier own suites and are not added
to them. The final candidate qualification is recorded in the delivery packet.

The initial API typecheck reported two new typing diagnostics (query overload
union and nullable sourceRef); they were corrected using the existing typed
`executeSql` helper and null-safe parsing. Fixed API typecheck and build both
returned 0; contracts and control-plane-auth builds returned 0 in this isolated
worktree. No shared dependency or build output was changed.

Only Google fetch/token/JWKS and the SQL fault transport are simulated; invitation
mail remains explicitly unavailable without a configured outbox. No live Google
login, email delivery, HTTP server, browser, PostgreSQL, VM product runtime,
cloud deployment or provider operation was executed. C001 public-network and
real PG conditional cases remain for normal hosted CI, not local pass credit.

The focused own-test typecheck initially returned 2 for a request/governance type
adapter and incomplete typed approval metadata. It was corrected by preserving
the actual verified request identity and the callback's existing execution-mode
metadata, and sending the normal approvalRequestId/reasonCode fields. No actor,
principal, membership, role, or authentication claim was replaced. The corrected
own-test typecheck returned 0. The original nine-case file remains unchanged.
