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

## Round 2 — Codex2 reopen on `2190d2d0dc22d088499a817cc9cafa14b946c748` (2026-09-25T05:44:10Z)

Reviewer confirmed (via exact-source, non-mocked service probes) that the R3/R4 activate/close
contract addition above is real: platform-realm proofs are now required, self-issued, and
validated (rejects missing/forged/wrong-action/wrong-session/wrong-principal/expired). Those
platform controls are **not reopened**. Reviewer raised three new findings; this section
records the source SHA/review timestamp, the fix or routing decision for each, and the
verification performed, per §0.7 (do not overwrite the round-1 record above).

### UD1 [P1] — R3/R4/R5 in the *current* parent review are not the same findings this
document's "Trigger"/Finding B originally routed

This document's Finding B closed out the *original* R1 ("privileged-role approval proof
misuse") using the parent's blocking snapshot from 2026-09-25T05:21:30Z. The parent has since
accumulated further independent reviews; the latest is Codex2's reopen on parent candidate
`f275c4f8445749646952f13f4e627c4e1b77fc79` (2026-09-25T05:18:51Z, prior adjacent candidate
`3b4f012252db519cd3a784d4c56527657ee7ecaa`). In that latest round, "R3" and "R4" no longer
mean the original activate/close action-id gap (this document's Finding A already fixes that
at the framework layer) — they mean two different, still-open product/contract gaps:

- **R3 (latest) — cross-person grant read/sync.** There is no HTTP read path for break-glass
  requests/grants at all. `BreakGlassController`
  (`apps/api/src/modules/auth/break-glass.controller.ts:20-114`) exposes only
  `POST requests`, `POST requests/:id/approve`, `POST requests/:id/activate`,
  `POST requests/:id/close` — no `GET`. `BreakGlassService.get(grantId)`
  (`apps/api/src/modules/identity/break-glass.service.ts:273-282`) is an internal in-memory
  lookup, never routed. The frontend mirrors this:
  `apps/platform-admin-web/lib/platform-admin-iam-client.ts:204-242` only has mutation
  methods, and `users-governance-components.tsx:1233` initializes local `grants` state to
  `[]` with no fetch, updated only by the page's own mutation responses
  (`:1327`/`:1357`), and is lost on tab unmount (`page.tsx:940-945`). Parent-review reproduction
  (two adjacent SHAs): requester submits a real signed request, sees it locally; a second
  approver's session mounts the same panel and sees zero rows because there is no read call,
  even though the server-side grant exists; after that approver approves it via a direct
  service call, the original requester's remount still shows zero rows for the same reason.
  This is a missing backend read contract, not a frontend bug — there is nothing in
  `UI17-IAM-20260924`'s `write_scopes` that can add a controller route or service method.
- **R4 (latest) — principal/session/grant authority for the active-session banner.**
  `break-glass-context.tsx` compares only `ctx.actorId` to `grant.requesterId`
  (reviewer-cited `:112-132`/`:213-220` across the two adjacent SHAs) and otherwise trusts
  `sessionStorage` plus a client-side TTL. `IdentityController.getContext`
  (`apps/api/src/modules/identity/identity.controller.ts:68-86`) — the only read-side identity
  endpoint available to the frontend — returns `actorType/actorId/realm/authMode/
  roleFamilies/roles/scopes/tenantId`; it does **not** return `principalId`, `sessionId`, or
  any break-glass grant/session state. `BreakGlassService` requesterId is
  `principalId ?? actorId` (`:27-28`), so an actor with a distinct `principalId`, a replaced
  session, or a server-revoked grant is indistinguishable to the frontend from the original
  authorized holder — there is no server field to check it against. Reproduced with the real
  `JwtAuthService`/`IdentityController` projection: anonymous, sub!=principal, and
  session-replacement fixtures all keep the local banner "active" because nothing server-side
  is re-read. This is the same class of gap as R3 — a missing read/session-state contract, not
  a frontend defect fixable inside existing `write_scopes`.
- **R5 (latest) — expiry semantics.** `BreakGlassService.approve` never sets `expiresAt`
  (`:96-128`); `expireDue` (`:233-249`) only expires grants already `status: "active"`. So the
  real, current contract is: an **approved-but-not-yet-activated** grant does not expire on
  its own — only an **active** (activated) grant expires via TTL. The round-1/round-2 design
  canvas additions invented a *new* rule ("approval auto-expires if not activated within a
  window") that the backend does not implement and that this helper has no authority to add
  (`break-glass.service.ts` is not in anyone's write scope here). This is **not** a contract
  gap requiring routing — it is a canvas/backend mismatch. **Decision:** no backend change;
  route back to the parent task as a scope correction (see disposition below): the canvas
  should depict the actual behavior (approved persists until activated, rejected, or the
  request itself is otherwise closed; only an *active* grant carries a TTL-based expiry), not
  an invented approval-timeout state. If product actually wants approved-but-inactive grants
  to expire, that is a separate, explicit security/product decision to raise later — it is not
  implied by anything in scope today and is out of scope for this contract-unblock pass.

**Decision for R3/R4 (latest):** these require a new backend read contract — at minimum (a)
a `GET` list/read route on `BreakGlassController` (e.g.
`GET platform-admin/break-glass/requests` scoped by realm/tenant, and/or
`GET platform-admin/break-glass/requests/:id`) backed by a new `BreakGlassService` query
method with its own authorization rules (who may see a given request: requester, eligible
approvers, platform/ops admins — this is itself a policy decision, not just plumbing), and
(b) extending `IdentityController.getContext` (or a new endpoint) to expose `principalId` and
`sessionId` so the frontend can authoritatively distinguish "same principal, current session,
grant still active" from a replaced/anonymous/revoked identity. Both require new
`IAM_STEP_UP_ACTION_IDS`/OpenAPI/contract surface and are **not** achievable inside
`UI17-IAM-20260924`'s existing `write_scopes`, and are large enough (new authorization
semantics, not a two-field addition) that they do not belong inside this contract-unblock
helper either. **Recorded as an explicit follow-up, per this task's acceptance criteria**,
for Supervisor to scope as a standalone task before Gemini's cross-person-sync/authority work
can proceed:

- Proposed scope: add read routes + service query method + DTOs for break-glass
  requests/grants (`apps/api/src/modules/auth/break-glass.controller.ts`,
  `apps/api/src/modules/identity/break-glass.service.ts`,
  `packages/contracts/src/iam-contracts.ts`, `openapi/iam-stage15-contracts-v1.yaml`); extend
  `IdentityController.getContext` (or a new session-context read) with `principalId`/
  `sessionId`/active-grant summary (`apps/api/src/modules/identity/identity.controller.ts`).
- Dependencies: none blocking (independent of `UI17-NOTIFY-CANVAS-20260924`); should land
  before `UI17-IAM-20260924` resumes work on the cross-person grant list/sync UI or the
  session/authority-aware banner, since those UI changes have nothing real to call otherwise.
- Regression boundary: new read-only routes/fields, additive to existing contracts; must not
  change existing mutation authorization, SoD checks, or step-up enforcement already fixed in
  this document's Finding A / UD2 below.
- Owner/reviewer: unassigned — for Supervisor to dispatch (backend-authoring agent + Codex2
  as reviewer, consistent with this phase's pairing).

### UD2 [P1] — allowed `ops` callers still skipped the new activate/close gate (and the two
pre-existing sibling rules had the same gap)

`BreakGlassController` is `@RequireRealms("platform", "ops")` and the underlying scopes
(`identity:break-glass:request/approve/activate`,
`packages/contracts/src/iam-policy-catalog.ts:474-493`) allow
`allowedRealms: ["system", "platform", "ops"]` — `ops` is a legitimate caller for all four
routes. But `STEP_UP_ROUTE_RULES` entries for all four break-glass actions
(`request`/`approve`/`activate`/`close`) had `enforcedRealms: ["platform"]` only —
including the two pre-existing sibling rules (`request`, `approve`), not just the two this
document's Finding A added. `resolveRouteStepUpPolicy`
(`apps/api/src/common/auth/step-up.policy.ts:482-507`) skips any rule whose
`enforcedRealms` doesn't include the caller's realm and returns `null` — i.e. for an `ops`
identity, `assertRequestSatisfied` returned immediately with **no step-up check at all** on
any of the four break-glass routes, while `BreakGlassService.assertMutation`'s own check only
verifies the reference string is non-empty. This was a real bypass for legitimately-allowed
`ops` callers (pre-existing for request/approve, and would have persisted for the newly-added
activate/close entries had it not been caught here).

**Fix (this round):** added `"ops"` to `enforcedRealms` on all four break-glass
`STEP_UP_ROUTE_RULES` entries (`apps/api/src/common/auth/step-up.policy.ts`), matching the
existing pattern used for other `ops`-eligible actions in the same file (e.g.
`platform:evidence-exports:*`, `ops:approval-requests:*`). No change to `platform` behavior,
no new action ids, no scope/route/controller change — purely closes the realm-gating gap.

**Verification:**
- Added four `realm: "ops"` fixtures to `tests/unit/step-up-policy-catalog.test.ts`
  (mirroring the existing `platform` fixtures) for
  `POST platform-admin/break-glass/requests{,/…/approve,/…/activate,/…/close}`.
- Negative-control check: temporarily reverted the `request` rule's `enforcedRealms` back to
  `["platform"]` only and reran `npx vitest run tests/unit/step-up-policy-catalog.test.ts` —
  failed as expected (`resolveRouteStepUpPolicy(..., "ops")` returned `null` instead of
  matching `platform:break-glass:request`), confirming the fixture actually exercises the
  bypass. Restored the fix and reran — passed. (Command outputs captured in this worker's
  tool transcript; not re-pasted here.)
- `npx tsc -p apps/api/tsconfig.json --noEmit` → exit 0, no diagnostics (after
  `pnpm --filter @drts/contracts build` to avoid the repo's known stale-`dist` false
  positives).
- `npx vitest run tests/unit/step-up-policy-catalog.test.ts tests/unit/break-glass.service.test.ts tests/security/iam-route-inventory.test.ts tests/unit/step-up-iap-path.test.ts tests/unit/bootstrap-auth-guard-strict-env.test.ts tests/unit/step-up-proof-policy.test.ts`
  → 6 files / 29 tests passed, exit 0.
- `git diff --check` → exit 0 (no whitespace issues).

Not fixed as part of this pass: the sibling `platform:*` rules with `enforcedRealms:
["platform"]` for actions where `ops` is *not* an allowed realm at the controller/scope layer
are correct as-is (no change made to any rule outside the four break-glass actions).

### UD3 [P2] — canonical OpenAPI contract rejected the new action ids

`packages/contracts/src/iam-contracts.ts` (`IAM_STEP_UP_ACTION_IDS`) already listed
`platform:break-glass:activate`/`close` from this document's Finding A, but
`openapi/iam-stage15-contracts-v1.yaml`'s `CreateStepUpProofCommand.properties.actionId.enum`
(`:658-708`) still only had `request`/`approve`. Per
`docs/.../phase1_service_contracts_v1.md:136-140`, both files are canonical wire-contract
sources — a client validated against the OpenAPI enum could not send the new action ids this
document tells the parent task to use.

**Fix:** added `platform:break-glass:activate` and `platform:break-glass:close` to the
`CreateStepUpProofCommand.actionId` enum in `openapi/iam-stage15-contracts-v1.yaml`, directly
after the existing `approve` entry, matching the TS catalog order.

**Verification:** parsed the YAML with `python3 -c "import yaml; ..."` and confirmed both new
values are present exactly once each in the enum; `git diff --check` exit 0.

**Not fixed (pre-existing, out of scope for this pass):** `IAM_STEP_UP_ACTION_IDS` also
contains `platform:tenants:rollback-hold`, which is likewise absent from the OpenAPI enum.
That gap predates this task's commits and is unrelated to the break-glass activate/close
change; noting it here rather than fixing it silently, since fixing unrelated pre-existing
contract drift is outside this helper's declared scope. Flagging for a future
contract-hygiene pass, not blocking this task or the parent.

## Disposition for the parent task (superseding round 1's, per the latest parent review)

Round 1's `PARENT_STATUS=todo` recommendation was written against the parent's earlier
2026-09-25T05:21:30Z blocking snapshot and Finding A/B/C only. It undercounted the parent's
subsequent, independently-reviewed R3/R4 (grant read/sync, session/principal authority) —
those are **not** resolved by this document's contract fixes and require the new standalone
backend task scoped above. Superseding recommendation:

- `PARENT_STATUS=blocked` (unchanged — do not resume full implementation yet).
- `PARENT_WAITING_FOR=Supervisor` (to scope/dispatch the new backend read-contract task from
  UD1 above; once that lands, `PARENT_WAITING_FOR` should move to `Gemini`).
- `PARENT_NEXT`: "Contract/routing status as of
  UI17-IAM-20260924-UNBLOCK-PLANNING-DECISION round 2: (1) R3/R4 *original* activate/close
  action-id gap is resolved — `platform:break-glass:activate`/`close` are real
  `IamStepUpActionId`s with enforced, validated route policy for both `platform` and `ops`
  callers (Finding A + UD2 fix); wire `createStepUpProof`/`mutation.stepUpReference` using
  those action ids for the activate/exit flows. (2) R1 (privileged-role approval) stays
  routed as UI-only per Finding B — do not call `createStepUpProof` for that action; submit
  without a `stepUpReference` and handle a 401 by prompting re-authentication. (3) R3/R4 *as
  most recently reviewed* (cross-person grant read/sync; principal/session/grant authority
  for the active-session banner) are a missing backend read contract, not something fixable
  inside this task's `write_scopes` — do not attempt to work around this with fabricated
  local state, polling a mutation endpoint, or trusting client-only TTL/actorId checks; wait
  for the standalone backend task recorded in this document's UD1 section. (4) R5 (canvas
  expiry states) needs a canvas correction, not a contract change: depict the actual
  behavior — approved-but-not-activated grants do not auto-expire; only an activated
  (active) grant expires via TTL — and drop the previously-added invented
  approval-timeout rule/state. This one *can* proceed now, inside existing `write_scopes`."

## Round 3 — Codex2 reopen on `b25c7b03d8930478b423f1e12282d7fb0bbd49fa` (2026-09-25T06:03:14Z)

Adjacent reviewed candidate: `2190d2d0dc22d088499a817cc9cafa14b946c748` (round 2 above, reviewed
2026-09-25T05:44:10Z). Reviewer confirmed **UD2 and UD3 from round 2 are fixed** (all four
break-glass `STEP_UP_ROUTE_RULES` entries now enforce `ops` as well as `platform`; the OpenAPI
`CreateStepUpProofCommand.actionId` enum now carries `activate`/`close` exactly once each) and
confirmed the **round-2 UD1 document improvement** (the current-parent R3/R4 gap is correctly
identified, a backend scope is proposed, active-only TTL semantics are explicit) — none of
those are reopened; do not re-litigate them. Two things are not reopened as code changes,
retained here as-is:

- No further code fix is required for UD1; per the reopen, "no additional product code is
  required to close this remaining helper finding."

### UD1 [P1, repeated — machine-truth routing still not persisted]

The reopen's point (confirmed by re-reading `ai-status.sh show
UI17-IAM-20260924-UNBLOCK-PLANNING-DECISION` and `ai-status.sh show UI17-IAM-20260924` in this
worktree): the disposition text in "Disposition for the parent task" above is correct prose,
but it is **prose only** — it has never been written into this task's `resolved_parent_status` /
`resolved_parent_next` / `resolved_parent_waiting_for` fields, and no backend follow-up task
exists yet in the task board (`ai-status.sh list --status backlog|todo` has no
read-contract/break-glass-read task). `transition_after_merge` →
`apply_unblock_parent_resolution` (`tools/development-orchestrator/bin/ai_status.py:1092-1176`)
reads exactly those three task fields (or the `PARENT_*` env vars) at merge time; with neither
set, it defaults the parent to `todo` with a generic "Unblock resolution complete" message and
drops `waiting_for` — which would silently re-open Gemini on the parent with the still-unrouted
R3/R4 gap. This is a repeat of the same trigger condition as round 2's finding, now in its
second consecutive independent review, per §0.7's two-round threshold.

**Why this worker cannot close it directly:** every CLI path that writes
`resolved_parent_status`/`resolved_parent_next`/`resolved_parent_waiting_for` onto a task record,
or that registers a brand-new task on the board, goes through `command_assign`
(`ai_status.py:1747-1800`, the only caller of `task_metadata_from_env()` /
`TASK_METADATA_JSON`). None of the owner-permitted commands (`start`, `progress`, `note`,
`handoff`, `blocker`) touch those fields. `assign` is documented in
`AI_COLLABORATION_GUIDE.md` §6 as an **Operator/Supervisor** action, and the round-3 reopen
explicitly says "do not impersonate Supervisor or bypass worker dispatch guards." So this
worker is recording the exact values below and blocking on Supervisor, rather than running
`AI_NAME=Supervisor ai-status.sh assign ...` itself.

**Exact values for Supervisor to apply, verbatim, via `assign` before this candidate is
approved/merged** (matches `apply_unblock_parent_resolution`'s field names exactly):

```bash
AI_NAME=Supervisor "$STATUS_CLI" assign UI17-IAM-20260924-UNBLOCK-PLANNING-DECISION Claude Codex2 \
  "Resolve planning blocker for UI17-IAM-20260924"
# with:
TASK_METADATA_JSON='{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Supervisor",
  "resolved_parent_next": "Contract/routing status as of UI17-IAM-20260924-UNBLOCK-PLANNING-DECISION round 2/3: (1) R3/R4 original activate/close action-id gap is resolved, incl. ops-realm enforcement and OpenAPI enum sync (Finding A + round-2 UD2/UD3). (2) R1 (privileged-role approval) stays routed as UI-only per Finding B. (3) R3/R4 as most recently reviewed (cross-person grant read/sync; principal/session/grant authority for the active-session banner) need the new backend read-contract task <TASK-ID-TBD-BY-SUPERVISOR, proposed scope below>; do not resume until it lands. (4) R5 (canvas expiry states) can proceed now inside existing write_scopes: depict approved-but-not-activated grants as not auto-expiring; only an activated grant expires via TTL."
}'
```

**Proposed backend follow-up task, for Supervisor to register (or map onto an existing scoped
task if one already covers this)** — restated from round 2's UD1 section for direct
copy-paste into `assign`:

- Proposed task ID: `UI17-IAM-BREAK-GLASS-READ-CONTRACT-20260925`
- Proposed owner/reviewer: `Codex` (contracts/schema/state-system lane) / `Codex2` (existing
  reviewer for this phase's IAM work)
- Scope (`write_scopes`): `apps/api/src/modules/auth/break-glass.controller.ts`,
  `apps/api/src/modules/identity/break-glass.service.ts`,
  `apps/api/src/modules/identity/identity.controller.ts`,
  `packages/contracts/src/iam-contracts.ts`, `openapi/iam-stage15-contracts-v1.yaml`
- Depends on: none blocking (independent of `UI17-NOTIFY-CANVAS-20260924`); should land before
  `UI17-IAM-20260924` resumes the cross-person grant list/sync UI or the session/authority-aware
  banner
- Acceptance / regression boundary: add read-only `GET` route(s) for break-glass
  requests/grants plus authorization rules for who may see a given request (requester, eligible
  approvers, platform/ops admins); extend `IdentityController.getContext` (or add a new
  session-context read) with `principalId`/`sessionId`/active-grant summary; additive only —
  must not change existing mutation authorization, SoD checks, or the step-up enforcement fixed
  in this document's Finding A / round-2 UD2. Regression must cover: legitimate same-principal
  active session (visible/active), replaced session (not trusted as active), anonymous/no
  session (not trusted as active), and **a legitimate `sub != principal` grant** (see evidence
  correction below) — that case must stay visible/active through the new principal/session read,
  not be silently cleared.

**Small evidence correction (per round-3 reopen) to round 2's UD1 text at lines ~249-252
above:** that text says "anonymous, sub!=principal, and session-replacement fixtures all keep
the local banner 'active'." The reopen points out the latest parent review actually records two
different behaviors, not one: the new actor-only comparison incorrectly **clears** a legitimate
`sub != principal` grant's active banner (a false negative — a real grant is hidden from its
rightful holder), while the anonymous and replaced-session cases **remain shown as active** (a
false positive — a grant that should no longer be trusted still shows active). This document
does not correct round 2's original sentence in place (per §0.7, prior rounds are not
overwritten); this paragraph is the correction of record, and the regression boundary above
already carries both expected behaviors as separate scenarios for the follow-up task.

**Verification performed this round:** re-read `ai-status.sh show
UI17-IAM-20260924-UNBLOCK-PLANNING-DECISION` (confirms no `resolved_parent_*` fields present on
this task) and `ai-status.sh show UI17-IAM-20260924` (confirms parent still `status: blocked`,
`waiting_for: Claude`, `last_update: 2026-09-25T05:21:30Z`, old generic "verify actual
API/contract gaps" `next`) and `ai-status.sh list --status backlog|todo` (no read-contract /
break-glass-read task exists yet) directly in this worktree. Read
`tools/development-orchestrator/bin/ai_status.py` `apply_unblock_parent_resolution` (:1092-1176)
and `command_assign` (:1747-1800) / `task_metadata_from_env` (:1018-1040) source to confirm the
field names and the fact that `assign` is the only command that writes them. No source/product
code was changed this round — UD2/UD3 fixes from round 2 remain as committed; `git status` in
this worktree is clean at `b25c7b03d8930478b423f1e12282d7fb0bbd49fa` before this write.

## Required acceptance mapping (updated — round 3)

| Acceptance item | Status |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Done — round 1 (R3/R4 original activate/close gap, R1, R5-scope-note), round 2 (ops-realm step-up bypass fix, OpenAPI enum sync, explicit routing of the *current* R3/R4 grant-read/session-authority gap to a new standalone backend task), round 3 (exact `resolved_parent_*` values and backend follow-up task spec restated for direct Supervisor `assign` use; evidence correction on the sub!=principal banner behavior) |
| Record the decision, scope cut, or explicit follow-up needed by the parent task | Done — see "Disposition for the parent task" above, refined by round 3's exact `assign`/`TASK_METADATA_JSON` payload |
| Produce task-scoped commit/push/PR evidence for any canonical change | This round: commit/push follows this write (document-only change, no product code) |
| Update the parent task with the concrete unblocked next step | Still pending machine-truth application — requires Supervisor `assign` (owner has no CLI path to write `resolved_parent_*` or register a new task; see UD1 above). This worker is setting task status to `blocked`/`waiting_for: Supervisor` after this commit, per the exact values above, rather than re-handing off to Codex2 while the pre-merge routing step is still outstanding. |
