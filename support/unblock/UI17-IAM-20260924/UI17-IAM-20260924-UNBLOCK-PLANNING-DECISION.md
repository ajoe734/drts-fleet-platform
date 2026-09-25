# UI17-IAM-20260924-UNBLOCK-PLANNING-DECISION

Owner: Claude · Reviewer: Codex2 · Helper for: `UI17-IAM-20260924` (blocked, `waiting_for: Claude`)

## Trigger

`UI17-IAM-20260924` was blocked by Gemini on 2026-09-25T05:21:30Z with `waiting_for: Claude`
after three review rounds (Codex2) repeatedly reopened the same class of finding:

- **R1** (privileged-role approval): the owner's step-up UI cannot obtain a proof that the
  server will actually accept for `privileged-role-requests/:id/approve`.
- **R3** (break-glass activate): `platform:break-glass:activate` is passed to
  `createStepUpProof` `as any` because it is not a recognized `IamStepUpActionId`.
- **R4** (break-glass close): same problem for the close/exit action.
- **R5** (canvas/expiry states): the design canvas is missing intermediate break-glass
  states (requested / approved-awaiting-activation / expired / closed).

Parent task `next` explicitly asked: *"Waiting for Supervisor to verify the actual
API/contract gaps (R3 activate, R4 close, authority, and R5 expiry control) and define
the scope for the next standalone fix unit before continuing."*

None of `packages/contracts/src/iam-contracts.ts`, `apps/api/src/common/auth/step-up.policy.ts`,
or `apps/api/src/modules/identity/break-glass.service.ts` are in `UI17-IAM-20260924`'s
`write_scopes` — Gemini has no authority to change them, which is exactly why this is a
planning/contract blocker rather than an implementation defect.

## Investigation (source-of-truth read, not UAT/handoff summaries)

Read in full:

- `apps/api/src/modules/auth/break-glass.controller.ts` (routes + scopes)
- `apps/api/src/modules/identity/break-glass.service.ts` (`assertMutation`, `activate`, `close`)
- `apps/api/src/common/auth/step-up.policy.ts` (`STEP_UP_ROUTE_RULES`, `resolveRouteStepUpPolicy`,
  `resolveStepUpActionPolicy`)
- `apps/api/src/common/auth/step-up-proof.service.ts` (`createProof`, `assertRequestSatisfied`)
- `apps/api/src/common/auth/bootstrap-auth.guard.ts:330-343,402-422` (calls
  `stepUpProofService.assertRequestSatisfied(identity, request)` globally, keyed by
  **route**, not by client-declared `actionId`)
- `packages/contracts/src/iam-contracts.ts` (`IAM_STEP_UP_ACTION_IDS`)
- `apps/api/src/modules/identity/privileged-role-governance.service.ts:284-330` (`verifyStepUp`),
  `:718-732` (`approveRequest` call site)
- `apps/api/src/modules/identity/identity.controller.ts:377-404` (`approvePrivilegedRoleRequest` route)

### Finding A — R3/R4 is a real, pre-existing contract gap (not a Gemini regression)

`BreakGlassController` exposes:

```
POST platform-admin/break-glass/requests/:requestId/activate
POST platform-admin/break-glass/requests/:requestId/close
```

`BootstrapAuthGuard` runs `StepUpProofService.assertRequestSatisfied(identity, request)`
on every authenticated request. That method calls `resolveRouteStepUpPolicy(method, url,
realm)`, which looks the route up in `STEP_UP_ROUTE_RULES` (`step-up.policy.ts`). **Neither
the `activate` nor the `close` route had an entry.** `resolveRouteStepUpPolicy` returns
`null` for an unmatched route and `assertRequestSatisfied` returns immediately — i.e. the
framework-level step-up gate silently did **not** enforce anything on these two routes.

The only remaining gate was `BreakGlassService.assertMutation` (`break-glass.service.ts:292-305`),
which only checks that `mutation.stepUpReference` is a non-empty string — it never calls
`StepUpProofService` to validate it. So the pre-existing backend behavior was: any truthy
string satisfies activate/close, while `createStepUpProof({ actionId: "platform:break-glass:activate" })`
(not a member of `IAM_STEP_UP_ACTION_IDS`) returns `{ required: false, stepUpReference: null }`,
so a UI trying to do this honestly gets `null` and then 403 `IAM_STEP_UP_REQUIRED` — while a
UI that fabricates a string would have been let through. This is the precise defect Codex2
reported three times (R3/R4, `b53cf46`, `b8adc304`, `6ca56b0f`).

**Decision:** extend the canonical step-up contract (additive, backward compatible):

- Add `platform:break-glass:activate` and `platform:break-glass:close` to
  `IAM_STEP_UP_ACTION_IDS` (`packages/contracts/src/iam-contracts.ts`).
- Add matching `STEP_UP_ROUTE_RULES` entries in `apps/api/src/common/auth/step-up.policy.ts`
  for `POST platform-admin/break-glass/requests/:id/activate` and `.../close`, same
  `freshnessWindowMs`/`enforcedRealms` as the sibling `platform:break-glass:approve` rule.

This closes the bypass at the framework layer (the guard now genuinely enforces a validated,
session-bound, freshness-checked step-up proof before either route is reached), and gives the
FE a legitimate `actionId` to request through the existing `createStepUpProof` flow — no new
API surface, no UI17 write-scope change needed. `BreakGlassService.assertMutation`'s own
truthy check is untouched; it is now a harmless secondary check behind a real gate.

Verified no test exercises these two routes through the full guard stack (only
`tests/unit/break-glass.service.test.ts`, which calls `BreakGlassService` directly and is
unaffected), so this is a pure gap-closing change with no known regression surface. Added
direct route-fixture coverage for both new action ids in
`tests/unit/step-up-policy-catalog.test.ts` (mirrors the existing `approve` fixture).

### Finding B — R1 ("authority") is a client-side misuse, not a contract gap

`PrivilegedRoleGovernanceService.approveRequest` (`:718-732`) calls
`verifyStepUp(approverIdentity, command?.stepUpReference ?? command?.mutation?.stepUpReference,
{ action: "approve", targetId: approvalRequestId }, identityRepository)`.

`verifyStepUp` (`:294-330`) accepts **either**:

1. a valid `srv_stepup.<payload>.<hmac>` server-issued proof bound to
   `actorId`/`action`/`targetId` (issued internally via `issueServerStepUpProof`, not exposed
   through the generic public `createStepUpProof` endpoint), **or**
2. the caller's own session having a trusted MFA method in `amr` **and** `authTime` within
   600 seconds (10 minutes) — i.e. a self-contained freshness check that needs no client
   action at all.

There is no `STEP_UP_ROUTE_RULES`/`IAM_STEP_UP_ACTION_IDS` entry for
`identity/privileged-role-requests/:id/approve` either, by design — this endpoint was never
meant to go through the generic step-up-proof catalog. The UI's `handleGetStepUpProof` call
with a fabricated/reused `actionId` (`"PRIVILEGED_ROLE_GRANT"`, then
`"ops:approval-requests:approve"`) was always going to either no-op (`required:false`) or
validate the wrong action.

**Decision:** no contract change. `platform:users:role:update` already exists in
`IAM_STEP_UP_ACTION_IDS` for the *creation* of a role assignment
(`POST platform-admin/users/:id/role`); privileged-role-request approval is a distinct
governance action deliberately left on the freshness-only path so it degrades gracefully
without a dedicated UI step. Route back to the parent task owner: the approval UI must not
call `createStepUpProof` for this action. It should submit the approval directly (omit
`stepUpReference`), and on a 401 `IAM_STEP_UP_REQUIRED` response, prompt the user to
re-authenticate (refresh their session's MFA, i.e. a real re-auth/re-login affordance) rather
than requesting a generic step-up proof. This is UI-only work, inside the existing
`write_scopes` (`users-governance-components.tsx`).

### Finding C — R5 (canvas/expiry states) is implementation scope, not a planning blocker

The missing break-glass canvas states (requested / approved-awaiting-activation / expired /
closed) are a design-canvas completeness gap inside `platform-iam.jsx` /
`Platform Admin.html`, both already in `UI17-IAM-20260924`'s `write_scopes`. No shared
contract, auth, or cross-task-surface file is implicated. **Decision:** scope stays with the
parent task; no routing needed.

## Change evidence

```
$ git diff --stat -- packages/contracts/src/iam-contracts.ts apps/api/src/common/auth/step-up.policy.ts tests/unit/step-up-policy-catalog.test.ts
 apps/api/src/common/auth/step-up.policy.ts        | 20 ++++++++++++++++++++
 packages/contracts/src/iam-contracts.ts            |  2 ++
 tests/unit/step-up-policy-catalog.test.ts          | 12 ++++++++++++
 3 files changed, 34 insertions(+)
```

Commands run against this worktree (`.artifacts/worktrees/auto/claude-ui17-iam-20260924-unblock-planning-decision`),
Node v22 / TypeScript per repo toolchain:

- `pnpm --filter @drts/contracts build` (via `npm run build` in `packages/contracts`) →
  exit 0, rebuilt `packages/contracts/dist` from source before typechecking (stale dist is a
  known false-positive source in this repo).
- `npx tsc -p apps/api/tsconfig.json --noEmit` → exit 0, no diagnostics.
- `npx vitest run tests/unit/step-up-policy-catalog.test.ts tests/unit/break-glass.service.test.ts tests/security/iam-route-inventory.test.ts` →
  3 files / 14 tests passed.
- `npx vitest run tests/unit/step-up-iap-path.test.ts tests/unit/bootstrap-auth-guard-strict-env.test.ts tests/unit/step-up-proof-policy.test.ts` →
  3 files / 15 tests passed (collateral coverage for the guard and proof-service code paths
  touched by this change).

Not run: full monorepo build/lint/e2e, browser/hosted UI verification, DB-backed
integration. This change does not touch UI code, DB schema, or any other module; scoped
`tsc --noEmit` + the directly relevant unit suites are the proportionate check for an
additive, two-entry contract/policy extension. No PG/browser/runtime claim is made.

## Disposition for the parent task

`UI17-IAM-20260924` should resume with Gemini as owner once this candidate merges. Concrete
unblocked next step (recommended `PARENT_NEXT` / `PARENT_STATUS` / `PARENT_WAITING_FOR` for
whoever runs the resume — this worker has no CLI path to set `resolved_parent_*` fields
directly ahead of merge; recording here per `candidate-lifecycle.md`):

- `PARENT_STATUS=todo` (return to active implementation; the blocking contract gap for R3/R4
  is now resolved, R1 is a documented non-gap, R5 stays in the existing implementation scope).
- `PARENT_WAITING_FOR=Gemini`
- `PARENT_NEXT`: "Contract gap resolved (see UI17-IAM-20260924-UNBLOCK-PLANNING-DECISION.md):
  `platform:break-glass:activate` / `platform:break-glass:close` are now real
  `IamStepUpActionId`s with enforced route policy — call `createStepUpProof` with those
  `actionId`s for the activate/exit flows and wire the returned `stepUpReference` into
  `mutation.stepUpReference` (R3/R4). For privileged-role approval (R1), stop calling
  `createStepUpProof` entirely — submit the approval without a `stepUpReference` and handle a
  401 `IAM_STEP_UP_REQUIRED` response by prompting re-authentication; the server accepts fresh
  session MFA (<=10 min) with no client step-up call needed. R5 (break-glass canvas
  intermediate states) remains standalone implementation work inside the existing
  `write_scopes`, not a contract blocker."

## Required acceptance mapping

This helper task has no `required_acceptance` keys (`ai-status.sh show
UI17-IAM-20260924-UNBLOCK-PLANNING-DECISION` — `task_class: unblock`, no
`required_acceptance` field). Acceptance is the task's own `acceptance` list:

| Acceptance item | Status |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Done — this document, plus the additive contract/policy fix for R3/R4 and the routing decision for R1/R5 |
| Record the decision, scope cut, or explicit follow-up needed by the parent task | Done — see "Disposition for the parent task" above |
| Produce task-scoped commit/push/PR evidence for any canonical change | Pending — commit/push/handoff follows this write |
| Update the parent task with the concrete unblocked next step | Pending Supervisor/merge-time `resolved_parent_*` application (see note above); text is recorded here for that step |

## Process note

An earlier pass of this task mistakenly ran its shell commands and file edits against the
canonical root (`/home/lupin/workspace/drts-fleet-platform`) instead of this assigned
isolated worktree, and briefly committed the same change onto canonical root's local `dev`
checkout as commit `bea50bbf714e2e2529b58bfb0f9720b2374897da`. That commit was never pushed
(non-fast-forwardable against `origin/dev` in any case) and does not appear in this
worktree's history. All actual work for this task — the edits, tests, and this artifact — is
in this worktree on branch `claude/ui17-iam-20260924-unblock-planning-decision`.
