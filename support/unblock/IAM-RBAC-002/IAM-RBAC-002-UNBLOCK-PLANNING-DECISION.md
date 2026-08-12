# IAM-RBAC-002 Unblock — Planning Decision Reconciliation

Date: 2026-08-12
Owner: Claude
Reviewer: Codex2
Parent task: `IAM-RBAC-002`
Unblock task: `IAM-RBAC-002-UNBLOCK-PLANNING-DECISION`
Kind: `planning_decision`

## Decision

`IAM-RBAC-002` is not blocked by a missing product or contract decision. There
is no unresolved product-semantic question to route through
`PHASE1_OPEN_QUESTIONS.md` or `PHASE1_DECISION_LEDGER.md` — neither file
contains any `IAM-RBAC-002` entry, and the accepted planning artifacts
(`docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`,
`docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`)
already fully specify the SoD, last-admin, MFA step-up, expiry, session
revocation, and audit requirements the task must satisfy.

The blocker is operational: an integration test failure on the task's open
PR. This unblock routes `IAM-RBAC-002` back to normal execution (owner
`Gemini2`, reviewer `Codex`) with a concrete, reproducible failure pointer
instead of leaving it parked as if a design decision were outstanding.

No scope cut is introduced. No new product or contract decision was created.

## Why this resolves the blocker

### 1. All five dependencies are `done`

`IAM-RBAC-001`, `IAM-ACC-002`, `IAM-ACC-003`, `IAM-MFA-001`, `IAM-AUD-001` are
all recorded `done` in canonical machine truth. Nothing upstream is missing.

### 2. No product/contract question is recorded anywhere for this task

- `PHASE1_OPEN_QUESTIONS.md`: no `IAM-RBAC-002` reference.
- `PHASE1_DECISION_LEDGER.md`: no `IAM-RBAC-002` reference.
- `docs/02-architecture/consensus/phase1/*`: no `IAM-RBAC-002` reference.

If a real planning gap existed, it would be named in one of these. It is not.

### 3. The task already has an open PR with a working implementation

`IAM-RBAC-002` has PR #1378
(`gemini2/iam-rbac-002` → `dev`,
<https://github.com/ajoe734/drts-fleet-platform/pull/1378>), state `OPEN`,
`mergeable: MERGEABLE`, `mergeStateStatus: BLOCKED` (blocked by required-check
failures, not by a merge conflict or missing review).

PR #1378 reports 18 CI checks total, but `origin/dev` branch protection only
requires 6 of them (confirmed live via `gh api
repos/ajoe734/drts-fleet-platform/branches/dev/protection`, not the 3 listed
in `docs/ops/branch-strategy.md` §6, which is stale): `Commit trailers`,
`Runtime mirror guard`, `Smoke acceptance`, `build`, `typecheck`, `unit`.

Of those 6 required checks, 4 pass (`Commit trailers`, `Runtime mirror guard`,
`build`, `typecheck`) and 2 fail on the exact same underlying test:

- `unit` — FAIL
- `Smoke acceptance` — FAIL

(`ci-integ`, which also fails, is a non-required aggregator job that fails
only because `unit` failed; it is not one of the 6 checks `origin/dev`
protection enforces.)

### 4. The failure is a single, precise, reproducible assertion — not ambiguous CI flake noise

Both `unit` and `Smoke acceptance` fail on the same spec, same test, same
assertion:

```
FAIL tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts
  > IAM-RBAC-002 Privileged Role Governance Integration
  > 11. Real DATABASE_URL-Backed Concurrent Removal Integration
  > executes real pg_advisory_xact_lock transaction across concurrent connections when DATABASE_URL is set

AssertionError: expected [] to have a length of 1 but got +0
  ❯ tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts:1297:29
    1297|   expect(fulfilled).toHaveLength(1);
```

Test run stats confirm this is isolated, not systemic: `1 failed | 109 passed`
(files), `1 failed | 892 passed` (tests).

Reading the test (`origin/gemini2/iam-rbac-002` at
`tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts:1165-1229`):
it registers two `tenant_admin` grants for the same tenant, fires two
concurrent `removeGrant` calls (`expectedVersion: 1` on each), and expects the
last-admin / advisory-lock invariant to let exactly one succeed
(`fulfilled` length 1) and reject the other (`rejected` length 1). The CI run
observed `fulfilled.length === 0` — both concurrent removals were rejected
against a real `DATABASE_URL`-backed Postgres instance. That is a concurrency
behavior difference in the `pg_advisory_xact_lock` / `expectedVersion` path
under real-DB timing, not a missing spec: the acceptance bar ("Approval
concurrency isolation ... tests pass") is already defined on `IAM-RBAC-002`
itself.

The unrelated-looking `relation "iam.identity_sessions" does not exist` /
`admin.security_events is append-only` lines earlier in the same job logs are
from other, passing tests in the same suite (fail-closed and append-only
guard assertions exercising expected Postgres errors) — not the cause of the
one failing test.

### 5. The previously recorded `done`-adjacent evidence for this task was stale

Canonical machine truth still carries `commit_hash: db125bd2c...` /
`push_branch: dev` / `push_recorded_at: 2026-08-09T12:08:08Z` from an earlier
attempt, but that commit is not reachable from `origin/dev` and does not
exist in local git history at all
(`git merge-base --is-ancestor db125bd2... origin/dev` fails, `git log --all`
finds no such commit). The activity log already captures why: task
`IAM-RBAC-002` was reopened for `Gemini` on 2026-08-12 with the note
"Reopened because completed integration evidence is not reachable from
origin/dev; recover an existing replacement PR before creating new branch
history." The current live evidence is PR #1378 at `fe26d46e9450`, which is
what this packet routes against — not the stale 2026-08-09 commit record.

## Canonical routing basis

1. Keep the accepted `IAM-RBAC-002` acceptance criteria unchanged (no scope
   cut): independent approve/reject, SoD, last-admin invariant, expiry,
   session revocation, concurrency isolation, audit.
2. Do not send `IAM-RBAC-002` back to `discussion_planning` — there is no
   product-semantic conflict to resolve there.
3. Route the parent back to normal execution against the existing PR #1378,
   with the concurrency-test failure named as the concrete next action for
   owner `Gemini2` / reviewer `Codex`.
4. Do not treat the stale `db125bd2c...`/`dev` evidence as current; the
   working reference is PR #1378 at `fe26d46e9450`.

## Parent next step

`IAM-RBAC-002` should move from `blocked` back to `in_progress` with this
next step:

> Fix the concurrency assertion failure in PR #1378
> (https://github.com/ajoe734/drts-fleet-platform/pull/1378, branch
> `gemini2/iam-rbac-002`): `unit` and `Smoke acceptance` both fail at
> `tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts:1297`
> ("11. Real DATABASE_URL-Backed Concurrent Removal Integration") —
> `expect(fulfilled).toHaveLength(1)` got `0` fulfilled instead of exactly one
> of the two concurrent `removeGrant` calls succeeding. Investigate the
> `pg_advisory_xact_lock` / `expectedVersion` last-admin-removal path for a
> real-DB timing/serialization difference, fix or stabilize it, push, and
> re-run CI. This is an implementation/test fix, not a new planning decision.

## Scope cut

None.

## Out of scope for this unblock

- changing L1 product truth or the `IAM-RBAC-002` acceptance criteria
- inventing a new contract or relaxing the last-admin / concurrency
  acceptance bar to make the test pass
- fixing the concurrency bug itself (owned by `Gemini2`/`Codex` on
  `IAM-RBAC-002`)
- treating the stale `2026-08-09` `dev` commit record as current evidence

## Non-claim

This packet does not claim:

- that PR #1378 CI is currently green
- that the concurrency bug is fixed
- that a new product or contract decision was required
- that `IAM-RBAC-002` is ready for `done`

## Canonical artifacts cited

- `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
- `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
- `PHASE1_OPEN_QUESTIONS.md` (checked, no entry)
- `PHASE1_DECISION_LEDGER.md` (checked, no entry)
- PR #1378: https://github.com/ajoe734/drts-fleet-platform/pull/1378
- CI run (unit): https://github.com/ajoe734/drts-fleet-platform/actions/runs/31555656039/job/93987483032
- CI run (Smoke acceptance): https://github.com/ajoe734/drts-fleet-platform/actions/runs/31555656040/job/93987421402
- `origin/dev` branch protection (live): `gh api repos/ajoe734/drts-fleet-platform/branches/dev/protection` — required contexts: `Commit trailers`, `Runtime mirror guard`, `Smoke acceptance`, `build`, `typecheck`, `unit`
- `docs/ops/branch-strategy.md` §6 (stale: lists only 3 required checks; live branch protection requires 6)

## Delivery evidence

Task-scoped commit/push evidence for this unblock task itself (a support
artifact, not a code change):

- `COMMIT_HASH=48e91b0b3` — `IAM-RBAC-002-UNBLOCK-PLANNING-DECISION: route CI
  failure, not a planning gap`
- `COMMIT_HASH=fe4a63a88` — `IAM-RBAC-002-UNBLOCK-PLANNING-DECISION: fix
  required-check count against live branch protection`
- `PUSH_REMOTE=origin`, `PUSH_BRANCH=claude/iam-rbac-002-unblock-planning-decision`
  (pushed; `git ls-remote --heads origin
  claude/iam-rbac-002-unblock-planning-decision` resolves to `fe4a63a88`)
- `INTEGRATION_STATUS=branch_pushed`

### Parent-PR linkage

This unblock task does not open, and must not open, a PR of its own against
`dev`. It only routes the existing parent. The parent's actual code change
ships through its own existing PR #1378
(`gemini2/iam-rbac-002` → `dev`), owned by `Gemini2`, reviewed by `Codex` —
unchanged by this unblock task. This task's branch
(`claude/iam-rbac-002-unblock-planning-decision`) carries only the routing
artifact at `support/unblock/IAM-RBAC-002/`; it is evidence for *this* task's
own commit-evidence requirement, not a competing implementation branch.

### Parent update to apply at closeout

`apply_unblock_parent_resolution` in `scripts/ai_status.py` only mutates the
parent when this task's owner runs `done` (which itself requires
`review_approved`, i.e. `Codex2` sign-off first). The exact values to pass at
that point are:

```bash
AI_NAME=Claude \
PARENT_STATUS=in_progress \
PARENT_WAITING_FOR=Gemini2 \
PARENT_NEXT="Fix the concurrency assertion failure in PR #1378 (https://github.com/ajoe734/drts-fleet-platform/pull/1378, branch gemini2/iam-rbac-002): unit and Smoke acceptance both fail at tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts:1297 (11. Real DATABASE_URL-Backed Concurrent Removal Integration) -- expect(fulfilled).toHaveLength(1) got 0 fulfilled instead of exactly one of the two concurrent removeGrant calls succeeding. Investigate the pg_advisory_xact_lock / expectedVersion last-admin-removal path for a real-DB timing/serialization difference, fix or stabilize it, push, and re-run CI." \
INTEGRATION_STATUS=branch_pushed \
COMMIT_HASH=<owner's own commit for this task, if any additional one lands> \
COMMIT_SUBJECT="IAM-RBAC-002-UNBLOCK-PLANNING-DECISION: route parent back to execution" \
PUSH_REMOTE=origin \
PUSH_BRANCH=claude/iam-rbac-002-unblock-planning-decision \
./scripts/ai-status.sh done IAM-RBAC-002-UNBLOCK-PLANNING-DECISION \
  "Routed IAM-RBAC-002 to in_progress/Gemini2 with the PR #1378 concurrency-fix pointer as next step"
```

This replaces the parent's stale `next` ("Supervisor reconciled PR #1378:
ci_pending/pending at fe26d46e9450") with the concrete, reproducible failure
pointer above, moves `IAM-RBAC-002.status` from `blocked` back to
`in_progress`, and keeps `owner=Gemini2` / `reviewer=Codex` unchanged. It does
not touch `IAM-RBAC-002`'s existing `commit_hash` / `pr_url` / `ci_status`
fields, which continue to describe PR #1378 as recorded by the normal
`progress`/`reconcile-integration` flow on that task.
