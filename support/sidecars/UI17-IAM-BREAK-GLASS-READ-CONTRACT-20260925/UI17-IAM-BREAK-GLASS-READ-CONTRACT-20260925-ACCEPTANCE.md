# UI17-IAM-BREAK-GLASS-READ-CONTRACT-20260925 Acceptance Evidence

- Owner: `Claude`
- Reviewer: `Codex2`
- Source spec: `support/unblock/UI17-IAM-20260924/UI17-IAM-20260924-UNBLOCK-PLANNING-DECISION.md`
  (round 2 "Decision for R3/R4 (latest)" and round 3 "Proposed backend follow-up task",
  read at commit `f688ee32265fe6daef859094073544b88ac8e851` on branch
  `claude/ui17-iam-20260924-unblock-planning-decision`, PR #2157 — this task's own branch
  was based on `origin/dev` per dispatch instructions and did not depend on PR #2157 landing
  first at round 1. **Update (round 4):** PR #2157 has since merged to `origin/dev` as
  commit `97dbdd326387959f3666480efbe7596a08b60cbe`, which is this task branch's own anchor
  commit — the source spec is merged as of this round).

## Scope actually read before changing anything

- `apps/api/src/modules/auth/break-glass.controller.ts` (existing 4 POST routes, realm/scope
  decorators)
- `apps/api/src/modules/identity/break-glass.service.ts` (`get`, `request`, `approve`,
  `activate`, `close`, `assertMutation`, `actorId()` helper — `requesterId` is
  `principalId ?? actorId`)
- `apps/api/src/modules/identity/identity.controller.ts` (`getContext`, `listAdminSessions`,
  `assertAdminReadAuthority` pattern)
- `apps/api/src/modules/identity/identity.repository.ts` (`getSession`, `createSession`,
  `revokeSession`, `CanonicalIdentitySessionRecord` shape)
- `apps/api/src/common/auth/jwt-auth.service.ts:938-956` (existing session-validity check used
  by the real JWT verification path: `session.status === "active"`,
  `session.currentTokenId === payload.jti`, `session.tokenVersion === payload.tokenVersion` —
  mirrored, not reinvented, for the new session-context read)
- `apps/api/src/common/auth/bootstrap-auth.guard.ts:190-333` and
  `apps/api/src/common/auth/auth.policy.ts` (route-policy merge/AND-scope semantics; confirmed
  `platform-admin/` has no route-specific policy entry, so it falls into the generic
  `foundation:read`/`foundation:write` bucket, merged with the controller's
  `@RequireRealms("platform","ops")`)
- `tests/security/iam-route-inventory.test.ts` (dynamic route discovery; confirmed new
  `@RequireScopes`-free GET routes stay classified via the controller's class-level
  `@RequireRealms`, and that adding no new scope avoids `unknownScopes`/`realmMismatches`)
- `packages/contracts/src/iam-contracts.ts`, `packages/contracts/src/index.ts` (confirmed
  `IdentityContext.principalId`/`sessionId` already exist as optional fields — no contract
  change needed to populate them; confirmed `index.ts` re-exports `iam-contracts.ts` via
  `export * from "./iam-contracts"`, so new types added only to `iam-contracts.ts` are
  reachable from `@drts/contracts` without touching the out-of-scope `index.ts`)
- `packages/contracts/src/iam-policy-catalog.ts` (out of `write_scopes`; confirmed no new scope
  constant was needed — see design note below)

## Design notes (why no new IAM scope was added)

**Superseded by round 2 (R3 fix) — kept for history, see the round-2 section below for the
current behavior.** `iam-policy-catalog.ts` is not in this task's `write_scopes`. The new GET
routes originally carried no `@RequireScopes` decorator and fell through to whatever
`resolveRouteAuthPolicy` inferred for `platform-admin/*` (at round 1, the generic
`foundation:read` bucket) — round-1 review's R3 found this locked out an activated break-glass
session (which never carries `foundation:read`) from reading its own request, and round 2 added
a specific, additive route-policy entry in `auth.policy.ts` for these two GET routes ahead of
the generic fallback. Per-request visibility (who may see a specific break-glass request) is
enforced in `BreakGlassService` itself (`canView`/`listForViewer`/`getForViewer`), not at the
route/scope layer — this is additive defense-in-depth on top of the route-level realm/policy
gate, not a replacement for it, and does not touch
`identity:break-glass:request/approve/activate` or any mutation path.

## Acceptance mapping

| required_acceptance item | Source basis & change location | Old → new behavior | Command / evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| 四種 session 情境分別斷言含 sub!=principal 不被誤清除 | `apps/api/src/modules/identity/identity.controller.ts` `getSessionContext` (new); `apps/api/src/modules/identity/break-glass.service.ts` `listActiveGrantsForPrincipal` (new, keyed by `principalId`, not `actorId`) | Before: no such read existed. After: `tests/unit/identity-session-context.test.ts` — 5 scenarios (same-principal active session, revoked/"replaced" session, token-version-rotated session, anonymous/no-session, `sub != principal` grant) each asserted independently, not merged | `npx vitest run tests/unit/identity-session-context.test.ts` → 5/5 passed. Negative control: temporarily reverted the grant lookup to compare `identity.actorId` instead of `principalId` (the pre-fix bug shape) and reran — scenario 4 failed as expected (`expected [] to deeply equal [...]`); restored the fix and reran — 5/5 passed again. Both runs' output captured in this worker's tool transcript. | Runs against `IdentityRepository`'s in-memory fallback store (no DB configured in this VM); real Postgres-backed `iam.identity_sessions` path is exercised by the identical SQL-backed methods (`getSession`/`createSession`) this test calls, but was not itself run against a live DB in this pass |
| 僅加法且不動既有授權 SoD 與 step-up | `apps/api/src/modules/auth/break-glass.controller.ts` (2 new `GET` methods only, 0 lines changed in existing POST methods); `apps/api/src/modules/identity/break-glass.service.ts` (new private `canView` + new public `getForViewer`/`listForViewer`/`listActiveGrantsForPrincipal`; `request`/`approve`/`activate`/`close`/`assertMutation`/`assertScopes` bodies unchanged); `apps/api/src/modules/identity/identity.controller.ts` (`getContext` gains 2 populated fields on an already-optional contract shape; new `getSessionContext` method; existing methods unchanged) | SoD (`approve` rejects `requesterId === approverId`) and step-up (`assertMutation` requires non-empty `stepUpReference`) both re-asserted unchanged in `tests/unit/break-glass-read-authorization.test.ts`'s "does not alter existing mutation authorization..." case | `npx vitest run tests/unit/break-glass.service.test.ts tests/unit/break-glass-read-authorization.test.ts` → 2 files, 15/15 passed (original mutation-path suite unmodified and still green) | N/A |
| 同候選 SHA CI 通過 | N/A (CI infra) | N/A | Scoped local checks run this pass: `packages/contracts` build, `packages/control-plane-auth` build (pre-existing missing `dist`, unrelated to this task, built once so `tsc` could resolve the workspace package), `npx tsc -p apps/api/tsconfig.json --noEmit` → exit 0, `npx tsc -p tsconfig.json --noEmit` → 18 pre-existing errors, all in `tests/unit/fleet-partner-list-envelope.test.ts` and `tests/unit/system-remediation/**` (cross-worktree `packages/api-client` type-identity collision against another concurrently-running worktree's `dist`; confirmed via `git status`/`git diff --stat` that neither file is part of this task's diff), 0 errors in any file this task touched | Hosted CI for the pushed candidate SHA is pending — per dispatch instructions, CI/merge/reviewer are tracked by the GitHub bus after handoff, not re-run or awaited synchronously here |
| 獨立 reviewer 審查同一候選 | N/A (process) | N/A | Handoff to `Codex2` follows this write, locked to the pushed candidate SHA | Reviewer sign-off is Codex2's own action, not owner-attestable |

## Regression run (full affected suite, this candidate)

```
npx vitest run \
  tests/unit/break-glass.service.test.ts \
  tests/unit/break-glass-read-authorization.test.ts \
  tests/unit/identity-session-context.test.ts \
  tests/security/iam-route-inventory.test.ts \
  tests/unit/step-up-policy-catalog.test.ts \
  tests/unit/step-up-iap-path.test.ts \
  tests/unit/bootstrap-auth-guard-strict-env.test.ts \
  tests/unit/step-up-proof-policy.test.ts
```

→ 8 files / 42 tests passed, exit 0. `tests/security/iam-route-inventory.test.ts` required a
small update (`BreakGlassController` route count `4` → `6`, plus new assertions that the 2 added
`GET` routes stay classified and carry no route-specific scope) since it hardcodes the
controller's route count; this is the only pre-existing test file touched, and only for the
count/shape assertion the new routes changed, not for any authorization loosening.

## Files changed

- `apps/api/src/modules/auth/break-glass.controller.ts` — add `GET requests`, `GET requests/:requestId`
- `apps/api/src/modules/identity/break-glass.service.ts` — add `canView`, `getForViewer`, `listForViewer`, `listActiveGrantsForPrincipal`, `isBreakGlassReadAdmin`
- `apps/api/src/modules/identity/identity.controller.ts` — populate `principalId`/`sessionId` on `getContext`; add `GET session-context`
- `packages/contracts/src/iam-contracts.ts` — add `IdentitySessionContext`
- `openapi/iam-stage15-contracts-v1.yaml` — add the 3 new `GET` paths
- `tests/security/iam-route-inventory.test.ts` — update hardcoded route count + new route classification assertions
- `tests/unit/break-glass-read-authorization.test.ts` — new
- `tests/unit/identity-session-context.test.ts` — new

---

## Round 2 (candidate `4caf05653719accb82a77356eb534d8ccae0e234`) — review findings and fixes

Round-1 independent review found R1-R4. Fixed in commit `4caf05653719accb82a77356eb534d8ccae0e234`
("fix round-1 review findings R1-R3"):

| Finding | Repair | Location | Regression added |
| --- | --- | --- | --- |
| R1: a grant whose own bound session was revoked/replaced could still show active via another valid session of the same principal | `listActiveGrantsForPrincipal` cross-checks the grant's own bound `sessionId` against the live repository, not just the caller's presented session | `break-glass.service.ts` | `identity-session-context.test.ts` scenario 5 |
| R2: an expired grant (past `expiresAt`) still showed active because `status` only changes on explicit `close`/`expireDue` | read excludes grants past `expiresAt` at read time, without touching `status` | `break-glass.service.ts` | `identity-session-context.test.ts` scenario 6 |
| R3: the two new GET routes fell through to the generic `platform-admin/` route policy requiring `foundation:read`, which an activated break-glass session (scoped only to `BREAK_GLASS_ALLOWED_SCOPES`) never carries, locking it out of reading its own request | added a specific, additive route-policy entry for the two GET routes ahead of the generic fallback; extends `write_scopes` to `apps/api/src/common/auth/auth.policy.ts` per reviewer recommendation, does not alter any other route's resolved policy | `auth.policy.ts` (outside original `write_scopes`, additive-only) | new guard-level suite in `break-glass-read-authorization.test.ts` exercising `BootstrapAuthGuard` directly |
| R4 | artifact/canonical consistency cited by reviewer | N/A | confirmed via same-SHA CI |

Also fixed in follow-up commit `5b7d2800df825e19876bdc9672dfb8783581e767` ("fix same-SHA CI
typecheck failure"): `createTestExecutionContext`'s `controllerClass` parameter type relaxed from
`{ prototype: Record<string, unknown> }` to `{ prototype: any }` so the concrete
`BreakGlassController` class (no index signature on its prototype) type-checks; test-only,
no production code or assertions changed.

## Round 3 (candidate `5b7d2800df825e19876bdc9672dfb8783581e767`) — independent review REJECTED

Reviewer: Codex2. `REVIEWED_SHA=5b7d2800df825e19876bdc9672dfb8783581e767`,
generation `34f3100df8c84042b4ac168a2794370c`, PR #2159. Round-2's fixes for R1-R4 were confirmed
still holding (all four required session scenarios independently PASS; R1/R2/R3/R4 all
re-verified PASS). Two **new** P1 findings were raised, both reproduced with real
production code paths (real `IdentityRepository`, real `JwtAuthService`, real
`BootstrapAuthGuard`, no auth mocks):

**R5** — `isBreakGlassReadAdmin` (`break-glass.service.ts`, then lines 39-48) treated bare
`identity.actorType === "ops_user"` as sufficient admin authority. Any ordinary ops user —
not just explicit ops/platform admins — could `GET` any other principal's break-glass
request/grant (`reasonText`, `proofReference` included) via `listRequests`/`getRequest`.
Minimal repro: real signed JWT for an ordinary `ops_user` (realm `ops`, roles `[ops_user]`,
scopes `[identity:read]`, no admin role/scope) reading a different principal's seeded
request through the real guard + controller + service — both GETs succeeded and disclosed
the foreign record.

**R6** — `listActiveGrantsForPrincipal` (`break-glass.service.ts`, then lines 363-380) skipped
all session validation when `grant.sessionId` was `null`, and included the grant anyway.
`BreakGlassController.activate` binds the session in three steps — `service.activate` →
`jwtAuthService.issueSessionToken` → `service.bindSession` — so a grant left with
`status: "active"` but no bound session (e.g. token issuance failed between steps 1 and 3)
was reported as an active grant in `getSessionContext`'s `activeBreakGlassGrants`, with no
authoritative session to have validated it against. Additionally flagged: the existing
scenario-4 fixture in `identity-session-context.test.ts` (sub != principal) activated a grant
without ever calling `bindSession`, so it coincidentally exercised exactly this invalid,
unbound "active" shape as if it were a valid positive.

Round-3 also reconfirmed: R1/R2/R3 all still PASS on this candidate; additive-only diff
confirmed via AST comparison against base `97dbdd326387959f3666480efbe7596a08b60cbe` (all
pre-existing `BreakGlassService`/`BreakGlassController` methods byte-identical); SoD and
step-up re-executed and still reject correctly; same-SHA CI typecheck/lint/canonical-consistency
jobs SUCCESS (unit/build/ui-route-e2e/product-smoke were still running at last observation,
not claimed).

Reopened per AI_COLLABORATION_GUIDE.md §0.7 "同一缺陷連續兩輪退修" is **not yet** triggered here
(R5/R6 are new findings on their first review round, not repeats), so this is a standard
first-round reopen for R5/R6, handled as the next bounded repair unit below.

## Round 4 (this pass, base candidate `5b7d2800df825e19876bdc9672dfb8783581e767`) — R5/R6 repair

### R5 repair

`isBreakGlassReadAdmin` in `apps/api/src/modules/identity/break-glass.service.ts` no longer
grants admin read authority from bare `actorType === "ops_user"`. It now requires
`actorType === "platform_admin"`, or an explicit admin/superadmin role
(`platform_superadmin`, `platform_user_admin`, `ops_admin`) or scope (`platform:superadmin`),
mirroring `IdentityController.assertAdminRevokeAuthority`'s stricter (write-side) shape rather
than the broader `assertAdminReadAuthority` (session-inventory read, a different resource).
`canView`/`listForViewer`/`getForViewer` themselves are unchanged; requester, assigned
approver, and any caller holding `identity:break-glass:approve` retain read access exactly as
before — only the blanket ops_user admin branch was removed.

Existing tests that had (incorrectly) modeled "admin" as bare `actorType: "ops_user"` were
corrected to use an explicit admin role (`roles: ["ops_admin"]`):
`tests/unit/break-glass-read-authorization.test.ts` — "lets a platform/ops admin view any
request" and "scopes listForViewer to the caller's own requests/approvals unless admin or
eligible approver".

New regressions added (`tests/unit/break-glass-read-authorization.test.ts`):
- "round-3 R5: an ordinary ops_user bystander with no admin role/scope cannot view another
  principal's request" — `getForViewer` now rejects with `AUTHZ_SCOPE_DENIED`.
- "round-3 R5: an ordinary ops_user bystander's list excludes another principal's request" —
  `listForViewer` returns `[]`, not the foreign grant.
- "round-3 R5: an ordinary ops_user requester's list is limited to their own requests" —
  `listForViewer` for an ordinary-ops requester returns only their own grant, not another
  principal's.

Positive controls re-verified passing: explicit `ops_admin` role admin (full list/single-view
access), eligible approver via `identity:break-glass:approve` scope (unchanged), requester/
approver self-access (unchanged), unrelated realm still denied at the guard level
(`still denies an unrelated realm for the new GET routes`, unchanged).

### R6 repair

`listActiveGrantsForPrincipal` in the same file now excludes any candidate grant with no bound
`sessionId` (`if (!grant.sessionId) continue;`) before the existing repository-backed session
validation, failing closed for a grant left `status: "active"` by an incomplete/failed
activation. The existing `expiresAt` exclusion and repository-backed session-status/tokenVersion
checks are otherwise unchanged.

`tests/unit/identity-session-context.test.ts` scenario 4 (sub != principal) now calls
`breakGlassService.bindSession(grant.grantId, "sess-1")` after `activate`, so it exercises a
genuinely bound, live-session grant — matching what `BreakGlassController.activate` actually
does on success — instead of coincidentally validating an unbound "active" shape.

New regressions added:
- `tests/unit/identity-session-context.test.ts` scenario 7 ("a grant left status='active' by a
  failed activation with no bound session is not reported active") — controller-level, via
  `getSessionContext`.
- `tests/unit/break-glass.service.test.ts` "listActiveGrantsForPrincipal excludes an active
  grant with no bound session (failed issuance)" — direct service-level unit.
- `tests/unit/break-glass.service.test.ts` "listActiveGrantsForPrincipal still reports a
  genuinely bound, active-session grant as active" — direct service-level positive control,
  paired with the negative above.

Positive/negative controls re-verified passing: scenario 5 (grant's own bound session
revoked, seen via a different ordinary session) still excludes the grant; scenario 6 (TTL
elapsed, status not yet swept) still excludes the grant; scenario 4 (bound sub != principal
grant) still includes the grant.

### Verification run (this candidate, working tree at handoff)

Environment note: this VM's shared canonical `node_modules` had a dangling top-level `vitest`
symlink (pointed into an unrelated, already-reaped sibling worktree) at the start of this pass,
and `packages/contracts`/`packages/control-plane-auth` had no built `dist/`. Neither is part of
this task's `write_scopes` or diff. Worked around locally without modifying any shared/canonical
path: resolved `vitest` directly through its intact `node_modules/.pnpm/...` package content via
a `NODE_PATH` fallback pointing at a `/tmp` shim (not part of the repository or any worktree);
built `packages/contracts` and `packages/control-plane-auth` (`tsc -p <pkg>/tsconfig.json`,
each exit 0) so `apps/api`'s typecheck could resolve them — this is a local build-cache
population, not a contract/source change. Also deleted a stale, gitignored
`tsconfig.tsbuildinfo` that had cached absolute paths that predated this worktree.

```
node <resolved vitest.mjs via NODE_PATH shim> run \
  tests/unit/break-glass.service.test.ts \
  tests/unit/break-glass-read-authorization.test.ts \
  tests/unit/identity-session-context.test.ts \
  tests/security/iam-route-inventory.test.ts \
  tests/unit/step-up-policy-catalog.test.ts \
  tests/unit/step-up-iap-path.test.ts \
  tests/unit/bootstrap-auth-guard-strict-env.test.ts \
  tests/unit/step-up-proof-policy.test.ts
```
→ 8 files / 53 tests passed, exit 0.

```
node <resolved vitest.mjs via NODE_PATH shim> run \
  tests/integration/iam-observability-alerts.integration.test.ts \
  tests/security/idempotency-regression-guard.test.ts \
  tests/security/iam-route-inventory.test.ts \
  tests/security/iam-uat-002-staging-verification.test.ts \
  tests/unit/step-up-policy-catalog.test.ts \
  tests/unit/internal-key-exception-registry.test.ts \
  tests/unit/system-remediation/sr-iam-001/r05-session-governance.test.ts \
  tests/unit/system-remediation/sr-iam-001/iam-role-api-matrix.test.ts
```
→ 8 files / 79 tests passed, exit 0 (broader break-glass/IAM-adjacent suite, no regressions).

```
node <tsc> -p apps/api/tsconfig.json --noEmit
```
→ exit 0, 0 errors (after building `packages/contracts` and `packages/control-plane-auth`
`dist/`; without those builds, this run instead shows stale-dist-shaped errors — a missing
`IdentitySessionContext` export and a missing `@drts/control-plane-auth` module — that
disappear once the workspace packages are built, confirming they were dist-staleness, not
source errors).

```
node <eslint> src/modules/identity/break-glass.service.ts \
  src/modules/auth/break-glass.controller.ts \
  src/modules/identity/identity.controller.ts --max-warnings=0   # (run from apps/api)
node <eslint> tests/unit/break-glass-read-authorization.test.ts \
  tests/unit/break-glass.service.test.ts \
  tests/unit/identity-session-context.test.ts --max-warnings=0   # (run from repo root)
```
→ both exit 0, 0 errors/warnings.

`node <tsc> -p tsconfig.json --noEmit` (root, covers all of `tests/**`) still shows the same
18 pre-existing errors as round 1, all in `tests/unit/fleet-partner-list-envelope.test.ts` and
`tests/unit/system-remediation/sr-admin-verify-001/fleet-lists.test.ts` /
`tests/unit/system-remediation/sr-iam-001/r05-session-governance.test.ts`, none of which this
task touches or which import anything from this task's changed files. Root-caused this pass:
canonical `apps/*/node_modules/@drts/*` symlinks were rewritten by a concurrent `pnpm install`
run from a different, still-active sibling worktree (`gemini2-ui17-map-20260924`), so
`@drts/api-client` resolves to that worktree's `packages/api-client` for bare-specifier imports
while this task's own relative imports (`../../packages/api-client/src`) resolve inside this
worktree — TypeScript then sees two nominally distinct `ApiClient` classes. This is shared
machine/environment state outside this task's `write_scopes` and outside this worktree's
boundary (fixing it would require writing into the canonical root's shared `apps/*/node_modules`,
which this worker's sandbox does not permit and which could disrupt the other active session);
not caused by, and not present in, this task's diff.

required_acceptance mapping for this round: the four session scenarios (updated table above)
all still independently PASS including the corrected scenario 4; additive-only re-confirmed
(only `break-glass.service.ts` production logic narrowed inside the new read-only surface this
task itself introduced — no existing method signature, SoD check, or step-up assertion changed;
SoD/step-up re-executed and still reject correctly in `break-glass-read-authorization.test.ts`
"does not alter existing mutation authorization..."); same-SHA CI pending on this candidate
after handoff, to be read by Supervisor/GitHub bus, not claimed here; independent review of
this candidate remains Codex2's action, not owner-attestable.

CANDIDATE_SHA and CANDIDATE_BRANCH for this round are recorded in the handoff following this
write.
