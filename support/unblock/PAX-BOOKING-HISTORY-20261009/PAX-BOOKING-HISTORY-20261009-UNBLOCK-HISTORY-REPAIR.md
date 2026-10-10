# Unblock Path for PAX-BOOKING-HISTORY-20261009

## 1. Contamination identified

The parent task's candidate branch is `gemini/pax-booking-history-20261009`
(PR [#2506](https://github.com/ajoe734/drts-fleet-platform/pull/2506),
base `dev`). At the time this unblock task was dispatched, the canonical
root's local branch ref `gemini/pax-booking-history-20261009` had diverged
ahead of `origin/gemini/pax-booking-history-20261009`:

- `origin/gemini/pax-booking-history-20261009` (PR #2506 head at dispatch
  time): `159c1783edce144523bffefa3c6b9407b6c5866f`
- local canonical-root ref: `be3f5983a33c42e5eabd16b7710778b6fe9139b5`

`git log --oneline be3f5983a33c42e5eabd16b7710778b6fe9139b5 -2` showed the
local commit's sole parent was exactly `159c1783e` (origin's tip), i.e. a
pure one-commit fast-forward, not a rewrite/divergence:

```
be3f5983a wip(PAX-BOOKING-HISTORY-20261009): anchor uat doc update for R8 and R2 blocked status
159c1783e PAX-BOOKING-HISTORY-20261009: fix test deadlock in uv-exec-006 token_failure
```

`git show --stat be3f5983a` confirmed the commit only touched
`docs/04-uat/passenger-app-20261009/PAX-BOOKING-HISTORY-20261009.md` (the
task's own UAT/evidence doc), updating it to record that R8 was fixed and
R2 was blocked pending a `write_scopes` grant — matching the owner's
`progress`/`system-block` machine-truth entries at `2026-10-10T08:27:59Z`
and `2026-10-10T08:32:32Z`.

This is an anchor commit (per `docs/ops/branch-strategy.md` §11 /
`tools/development-orchestrator/skills/worker-anchor-commit.md`) that the
owner (Gemini, git author `Gemini2`) made in its task worktree before that
worktree was reaped by routine supervisor worktree cleanup
([[project-supervisor-worktree-cleanup-removes-any-worktree]]), leaving the
commit only reachable via the canonical root's stale local branch ref. It
was never pushed to `origin`, so:

- PR #2506 did not show the updated UAT evidence (reviewer Codex2's most
  recent `reopen` at `07:26:07Z` could not see it).
- The commit was one `git reset --hard origin/dev` on the canonical root
  away from being silently destroyed
  ([[project-canonical-root-hard-reset]]), which would have erased the
  owner's only record of "R8 fixed, R2 blocked on write_scopes" and forced
  re-derivation of that status from scratch.

No corruption of PR #2506's already-reviewed commits (`4bc4dc2b2`..`abeb4445d`..`159c1783e`)
was found; the branch itself is linear and matches its own PR head history.
The contamination was strictly the one unpushed local anchor commit.

## 2. Non-destructive repair applied

Because the local commit's parent was exactly `origin`'s current tip, this
was a clean fast-forward — no rebase, no amend, no force-push needed, and
nothing in `docs/ops/branch-strategy.md` §11 blocks a plain fast-forward
push of an owner's own already-made commit:

```
git push origin be3f5983a33c42e5eabd16b7710778b6fe9139b5:refs/heads/gemini/pax-booking-history-20261009
```

Result: `159c1783e..be3f5983a  be3f5983a33c42e5eabd16b7710778b6fe9139b5 -> gemini/pax-booking-history-20261009`
(plain update, not forced).

Verified after push: `gh pr view 2506 --json headRefOid` returns
`be3f5983a33c42e5eabd16b7710778b6fe9139b5`, matching the canonical-root ref
exactly. `mergeStateStatus` remains `BLOCKED`, which is expected — see §3,
the branch is not blocked by history/CI, it is blocked on a task
`write_scopes` grant.

No source files were changed by this repair; the pushed commit is
documentation-only (the owner's own UAT evidence update).

## 3. Parent task's actual remaining blocker (unaffected by this repair)

`PAX-BOOKING-HISTORY-20261009` is `status: blocked` in machine truth
independent of the history contamination above. Per the owner's own
`system-block` entry (`2026-10-10T08:32:32Z`) and the task's `next` field:

> Need Supervisor to add
> `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` to
> `write_scopes` to fix R2 as requested by reviewer.

Reviewer Codex2's locked-candidate review on `abeb4445d` (`07:26:07Z`)
confirmed R2's remaining defect (dispatch released before order/history/token
persistence is durably confirmed; failed compensation can leave a
dispatchable, unowned order) requires a fix inside
`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`, which the
task's current `write_scopes` does not include
([[project-reassignment-must-check-eligible-agents-list]] — the analogous
write-scope/eligibility gate class of blocker). This is a governance/scope
gate, not a git or CI problem, and only the Supervisor can expand
`write_scopes` on the live task record.

## 4. Concrete unblocked next step

1. **Supervisor**: add `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
   (and its paired test file(s) under `apps/api/tests/unit/` if touched) to
   `PAX-BOOKING-HISTORY-20261009`'s `write_scopes`, per the owner's
   already-recorded request — no further history/branch repair is needed
   first.
2. **Owner (Gemini)**: once scope is granted, resume on the now-pushed tip
   `be3f5983a33c42e5eabd16b7710778b6fe9139b5` (PR #2506) and implement the
   R2 fix identified across the `058f12f25` / `60f432dcf` / `abeb4445d`
   review rounds: do not release an order to `ready_for_dispatch` (durable
   row + in-memory `owned.orders`) until order/history/token persistence is
   confirmed, and ensure compensation on failure cannot be silently
   swallowed; required regressions are listed in the `abeb4445d` reopen
   (success, 15–30min/2h history+token failure combinations, initial-create
   failure, completed/cancelled terminal fence).
3. **Reviewer (Codex2)**: re-review against the next candidate SHA once
   handed off; R1/R3/R4/R5/R6/R7 are already confirmed fixed as of
   `abeb4445d` and should not need re-litigating unless the R2 fix touches
   their code paths.

This unblock task made no change to `write_scopes`, `eligible_agents`, or
any product/test source file — only the orphaned anchor commit was pushed.
