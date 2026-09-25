# UI17-IAM-BREAK-GLASS-READ-CONTRACT-20260925 Acceptance Evidence

- Owner: `Claude`
- Reviewer: `Codex2`
- Source spec: `support/unblock/UI17-IAM-20260924/UI17-IAM-20260924-UNBLOCK-PLANNING-DECISION.md`
  (round 2 "Decision for R3/R4 (latest)" and round 3 "Proposed backend follow-up task",
  read at commit `f688ee32265fe6daef859094073544b88ac8e851` on branch
  `claude/ui17-iam-20260924-unblock-planning-decision`, PR #2157 — that document is not
  yet merged to `origin/dev`, so this task's own branch was based on `origin/dev` per
  dispatch instructions and does not depend on PR #2157 landing first).

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

`iam-policy-catalog.ts` is not in this task's `write_scopes`. The new GET routes therefore carry
no `@RequireScopes` decorator; they inherit the controller's existing
`@RequireRealms("platform","ops")` plus whatever `resolveRouteAuthPolicy` infers for
`platform-admin/*` (currently the generic `foundation:read` bucket, unchanged by this task).
Per-request visibility (who may see a specific break-glass request) is enforced in
`BreakGlassService` itself (`canView`/`listForViewer`/`getForViewer`), not at the route/scope
layer — this is additive defense-in-depth on top of the existing coarse realm gate, not a
replacement for it, and does not touch `identity:break-glass:request/approve/activate` or any
mutation path.

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
