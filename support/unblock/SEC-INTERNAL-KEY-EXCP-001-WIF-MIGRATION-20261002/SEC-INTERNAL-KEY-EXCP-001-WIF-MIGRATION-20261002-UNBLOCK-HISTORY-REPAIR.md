# SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002 unblock audit (2026-10-02)

Task: `SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002-UNBLOCK-HISTORY-REPAIR`;
owner: Claude2; reviewer: Codex. Scope: document the exact cause of the
parent's `blocked` status and a non-destructive next step; no parent source
changes or parent candidate handoff are performed by this helper.

## Finding: no branch/worktree/commit contamination exists

This task's brief assumes "branch/worktree/commit contamination" as the
default template for any blocked parent. That premise does not hold here.
After `git fetch origin`:

| Ref                                                             | SHA          |
| ---------------------------------------------------------------- | ------------ |
| local `claude2/sec-internal-key-excp-001-wif-migration-20261002` | `881b47dbc9d73e7ac62a799c2f805bf622485784` |
| `origin/claude2/sec-internal-key-excp-001-wif-migration-20261002` | `881b47dbc9d73e7ac62a799c2f805bf622485784` |
| PR #2264 `headRefOid` (`gh pr view 2264`)                        | `881b47dbc9d73e7ac62a799c2f805bf622485784` |

Local, remote and the live PR head are identical. `git rev-list --left-right
--count origin/dev...claude2/sec-internal-key-excp-001-wif-migration-20261002`
reports `4 5`: the branch is 4 commits ahead and 5 behind `origin/dev`,
ordinary trunk drift, not divergence from its own prior published state.
`git reflog` shows no rebase/amend on this branch's history. `git worktree
list --porcelain` shows no worktree currently checking out the parent branch
(it is not held open anywhere); this helper's own worktree is the only one
touched, on its own `...-unblock-history-repair` branch, and the canonical
root was never switched. PR #2264 is `OPEN`, targets `dev`, `isDraft:false`.
There is no non-fast-forward rejection, no foreign-branch content mixed into
the parent patch, and no force-push anywhere in this history. No git repair
of any kind is needed or performed.

## The actual blocker: a Supervisor disposition gate, already correctly routed

`ai-status.sh show SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002` records
`"status": "blocked"`, `"waiting_for": "Codex"`, and a `next` field written by
owner Claude2 at `2026-10-02T02:26:44Z` that already states the real cause
precisely: candidate `6d39dac2e387359aba1caa02b5177d5f20407fea` (PR #2264,
generation `d02c220f318a4401ad0e1a8622dd409c`) was reopened by reviewer Codex
for finding **F1** across three consecutive independent review rounds (R2 on
`566e08c058c04417e3d7969f2eb22a52792140a5`, R3 on the merge-only
`f440007edfa1107ff3ee093f3cb527315eee438c`, R4 on the current
`6d39dac2e3873…`), with identical, structural, non-regressed behavior each
time — this is the `AI_COLLABORATION_GUIDE.md` §0.7 same-defect-two-rounds
condition, now triggered a third time on the same finding. The full
localization is already recorded in `docs/02-architecture/internal-key-exceptions.md`
§10.7 (commit `881b47dbc`, already pushed on the parent branch):

- `deploy-dev.yml`'s "Verify referral handoff session lifecycle" step cannot
  exercise the positive issue/consume/replay/cross-host lifecycle in its
  pre-rollout branch, because `github-actions-deployer` (registry entry B)
  is currently scoped only to `routeScopes: ["POST auth/token"]`
  (`docs/02-architecture/internal-key-exceptions.md` §8.2/§10.3), and that
  identity holds `roles/iam.serviceAccountUser` (act-as), not
  `roles/iam.serviceAccountTokenCreator`, on `drts-dev-runtime`
  (`infra/gcp/dev/provision-dev-project.sh`) — so no in-scope code path lets
  the workflow mint a token under `drts-dev-runtime`'s already-broad `"* *"`
  grant instead.
- Owner Claude2 is guardrail-forbidden from GCP secret/IAM/GitHub-variable
  mutation and from workflow dispatch, which is the only way to make the
  pre-rollout branch exercise a successful lifecycle. §10.3 already specifies
  the exact JSON ops must apply (`github-actions-deployer`'s `routeScopes`
  gains `"POST partner/ingress/referral-embed-handoff"`).
- §10.7 states the task is moved to `blocked`, waiting on Supervisor to pick
  one of: **(a)** apply §10.3's registry change (or an equivalent grant) to
  the live `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` secret so a real
  pre-and-post-rollout lifecycle can be exercised and locked into a
  regression, or **(b)** issue an explicit disposition accepting the current
  fail-closed-with-warning pre-rollout behavior as satisfying the "must not
  go red" / "before and after" acceptance language, given the independently
  confirmed absence of any in-scope path to do otherwise.
- Owner Claude2's `blocker` call at `2026-10-02T02:26:44Z` routed this to
  Codex (the task's reviewer lane) to carry to Supervisor, because
  `blocker`'s `waiting_for` argument rejects `Supervisor`/`human` directly
  (confirmed operational constraint, not a defect introduced here).

As of this audit (`2026-10-02T03:56Z`), roughly 90 minutes after that
`blocker` call, `ai-activity-log.jsonl` shows no further Codex or Supervisor
entry on this task — it is idle waiting on the disposition, which is why the
chairman's generic blocked-parent detector created this unblock task. There
is nothing for a git-history-repair helper to fix: the parent's branch, PR
and candidate are exactly where the last reviewed round left them, and the
correct next actor is already identified in the parent's own record.

## Non-destructive path forward (not executed by this helper)

1. A human operator or Supervisor-with-authorization reviews §10.3's exact
   `routeScopes` JSON and §10.7's two options, and either applies the
   registry change to the live GCP secret (option a) or records an explicit
   accepted-disposition decision for the pre-rollout warn-only behavior
   (option b). Both options mutate no git history; they are a live-infra
   change or a policy note, respectively. This helper does not have GCP
   write access and does not attempt either action.
2. Once that disposition is recorded, Supervisor resumes the blocked parent
   (`resume-blocked SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002
   in_progress`, routed to owner Claude2) so owner can implement only the
   agreed small repair unit: if (a), lock in a regression exercising the now
   -successful pre-rollout lifecycle against the updated registry; if (b),
   update §10.7/§10.6's F1 row to record the accepted disposition and close
   the finding without further code change.
3. No existing branch, worktree, or ref needs to move. Candidate
   `6d39dac2e387359aba1caa02b5177d5f20407fea` / PR #2264 remains the base for
   the next round in both cases.

### Merge-time requirement for whoever lands this helper's PR

This task's own record has `task_class: unblock` and
`helper_parent: SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002`. Per
`tools/development-orchestrator/bin/ai_status.py`'s
`apply_unblock_parent_resolution` (invoked from `transition_after_merge` when
this helper task itself reaches `done`), the parent's `status`/`next`/
`waiting_for` get overwritten automatically from this helper's
`resolved_parent_status`/`resolved_parent_next`/`resolved_parent_waiting_for`
fields, falling back to the `PARENT_STATUS`/`PARENT_NEXT`/`PARENT_WAITING_FOR`
environment variables read at that moment, and **defaulting to `status:
"todo"` with no `waiting_for` if neither is set**. This helper never had
`PARENT_STATUS` et al. set (a dispatched worker cannot mutate a different
task's fields directly — confirmed by `task_board_commands.py`'s
`_guard_worker_command`, which raised `"Dispatched worker cannot mutate a
different task"` when this helper attempted a direct `note` on the parent).
Left to the default, merging this helper would silently flip the parent from
`blocked` to `todo`, erasing the still-unresolved Supervisor disposition and
very likely causing Codex/Claude2 to be redispatched into the identical
guardrail wall again. Whoever drives this helper's merge-to-done transition
(Supervisor) must set, at that moment:

```bash
PARENT_STATUS=blocked \
PARENT_WAITING_FOR=Codex \
PARENT_NEXT="No git/branch/worktree repair needed (see support/unblock/SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002/SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002-UNBLOCK-HISTORY-REPAIR.md). Sole blocker remains docs/02-architecture/internal-key-exceptions.md section 10.7: F1 persisted 3 rounds, owner guardrail-forbidden from GCP IAM mutation. Needs Supervisor disposition between section 10.3's registry routeScopes change (option a) or an explicit accepted-disposition for pre-rollout warn-only behavior (option b)."
```

so the parent stays correctly `blocked` on the real, already-documented
cause instead of being reset to an inaccurate `todo`.

## Checks performed in this helper

- `git fetch origin`, branch/remote SHA comparison, `git rev-list
  --left-right --count`, `git reflog`, `git worktree list --porcelain`:
  exit 0, no divergence or contamination found.
- `gh pr view 2264 --json state,headRefOid,headRefName,baseRefName,mergeable,isDraft,url`:
  exit 0, head matches local/remote exactly, `OPEN`, targets `dev`.
- `AI_NAME=Claude2 ai-status.sh show SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002`:
  exit 0, confirms `status: blocked`, `waiting_for: Codex`, and the recorded
  `next`/`worker_outcomes` history quoted above.
- `git show 881b47dbc:docs/02-architecture/internal-key-exceptions.md`
  sections 10.3 and 10.7: read directly to confirm the registry JSON and the
  Supervisor-routing text match the status-CLI summary verbatim.
- No product tests, builds, or live GCP/IAM checks were run or needed by
  this documentation-only helper; none of the parent's required acceptance
  items are addressed or claimed by this task.

## Delivery and parent next step

This file is the only helper change. Its task-scoped commit and normal push
are on `claude2/sec-internal-key-excp-001-wif-migration-20261002-unblock-history-repair`;
the final SHA and PR URL are recorded by this helper's own handoff in
machine truth and the PR itself, avoiding a self-referential SHA in this
file.

The parent task receives a status-CLI note pointing to this file with the
same concrete conclusion: there is no history/branch/worktree repair to
perform; the sole remaining blocker is the Supervisor disposition between
§10.7's options (a) and (b), and that decision needs a human operator with
GCP IAM/secret access since it is outside both this helper's and the
parent's own guardrails. The parent remains `blocked` until that disposition
is recorded; this helper does not alter the parent's candidate, status, or
`waiting_for` routing beyond adding this pointer note.
