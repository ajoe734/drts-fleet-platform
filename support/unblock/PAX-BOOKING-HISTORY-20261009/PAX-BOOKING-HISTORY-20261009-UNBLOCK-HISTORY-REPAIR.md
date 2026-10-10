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
docs/04-uat/passenger-app-20261009/PAX-BOOKING-HISTORY-20261009.md (the
task's own UAT/evidence doc, present on `gemini/pax-booking-history-20261009`
but not on this doc-only unblock branch), updating it to record that R8 was fixed and
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

## 5. Repair of Codex2 reopen findings (REVIEWED_SHA `e413848411b54f31a3754cd38159ce916e7c99a1`, candidate_generation `4ca3eca996ab45ac8464902d90fdc700`)

### HR2 (resolved, commit `f45474550a975f2cae7e7d871cfb4bc4cdfda0cf`)

The backtick-fenced repo-path citation at the old §1 (the parent task's UAT
evidence doc under docs/04-uat/passenger-app-20261009/) only exists on
`gemini/pax-booking-history-20261009`, never on this doc-only branch, so
`check_canonical_consistency.py`'s cited-paths rule correctly flagged it as
an unresolvable in-repo reference. Reworded to prose that
states the cross-branch location instead of citing it as a local path; no
factual claim changed. Re-ran the exact candidate-scoped gate against the
fix commit (not just the originally-failing SHA):

```
python3 tools/ci/git/check_canonical_consistency.py --ci --base e41384841^ --head f45474550
```

Exit 0, all four rules 0 findings (`l1-edit-authority`, `cited-paths`,
`cited-decisions`, `task-claims`). `f45474550` is already pushed to
`origin/claude/pax-booking-history-20261009-unblock-history-repair` and is
PR #2521's current head (`gh pr view 2521 --json headRefOid` ==
`f45474550a975f2cae7e7d871cfb4bc4cdfda0cf`, confirmed at write time).
§3's `mergeStateStatus=BLOCKED` line and §4's cleanup/reset wording above
were already conditional/evidence-qualified (see §1's explicit
`git reset --hard` framing and §3's explicit "governance/scope gate, not a
git or CI problem" framing); re-read against HR2's text, no further wording
change was needed there.

### HR1 (blocked on Supervisor — cannot be completed by this dispatched owner session)

The reviewer is correct that this task had no `resolved_parent_status`,
`resolved_parent_next`, or `resolved_parent_waiting_for` in canonical
metadata, and that `apply_unblock_parent_resolution`
(`bin/ai_status.py:1097-1179`, called from `transition_after_merge:663-689`)
defaults `resume_status` to `todo` at line 1116 when those fields are
absent — which would incorrectly flip the still-blocked parent to `todo`
and resolve its open blocker on this helper's next same-SHA merge, even
though the `write_scopes` gate for `owned-mobility.service.ts` has not been
granted.

Per `candidate-lifecycle.md:33-38`, the correct repair is to persist
`resolved_parent_status: blocked`, `resolved_parent_next`, and
`resolved_parent_waiting_for` onto *this* helper task's own metadata before
handing off a new candidate, so `apply_unblock_parent_resolution` reads
those stored fields instead of defaulting. The only production code path
that writes those three fields onto a task is `command_assign`
(`bin/ai_status.py:1752-1821`) via `TASK_METADATA_JSON`→`task_metadata_from_env()`
(`bin/ai_status.py:1023-1047`, merged into the task at line 1801); no other
mutation command (`progress`, `note`, `handoff`, `blocker`, `system-block`,
`reopen`, `approve`, `record-acceptance`, `start`) touches these fields.

This owner session is a dispatched worker (`ORCH_DISPATCH_ROLE=owner`,
`ORCH_RUN_ID` set). `control_plane/usecases/task_board_commands.py:81-88`
(`_guard_worker_command`) restricts dispatched owner/reviewer sessions to
exactly `{start, progress, note, handoff, approve, reopen, blocker,
system-block, record-acceptance}` — `assign` is not in that set. Attempted
exactly the command the fix requires, reproducing the structural block
first-hand rather than assuming it:

```
AI_NAME=Claude TASK_METADATA_JSON='{"resolved_parent_status":"blocked", ...}' \
  bash .../ai-status.sh assign PAX-BOOKING-HISTORY-20261009-UNBLOCK-HISTORY-REPAIR Claude Codex2
```

Result: `Exit code 1` / `Dispatched workers must use their assigned task
lifecycle commands` — the command did not run and changed no state (the
transaction guard in `execute_with_result` raises before the handler is
invoked, and `task_board_transaction` only commits after the handler
returns). No canonical field was read incorrectly or written.

This matches HR1's own fix boundary exactly ("original owner coordinate
with Supervisor using the authorized release CLI") — it is not optional
phrasing, it is the only code path that exists. **Supervisor must run, on
the canonical root with the current release CLI, before this helper's next
candidate is merged:**

```
AI_NAME=Supervisor TASK_METADATA_JSON='{"resolved_parent_status":"blocked","resolved_parent_next":"Parent PAX-BOOKING-HISTORY-20261009 remains blocked: owner Gemini cannot implement reviewer R2 (owned-mobility.service.ts dispatch/compensation fix) because that file is outside this task machine write_scopes. Supervisor must grant write_scopes for apps/api/src/modules/owned-mobility/owned-mobility.service.ts before Gemini can push the R2 fix for Codex2 to re-review. This unblock helper only repaired branch/commit history and the canonical-consistency doc citation; it never touched owned-mobility.service.ts and grants no scope.","resolved_parent_waiting_for":"Codex2"}' \
  bash /home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-0fb44e9576d3/tools/development-orchestrator/bin/ai-status.sh assign PAX-BOOKING-HISTORY-20261009-UNBLOCK-HISTORY-REPAIR Claude Codex2
```

`resolved_parent_waiting_for` is set to `Codex2` (the parent's own
reviewer lane) rather than `Supervisor`, because `ensure_agent` only
accepts a `KNOWN_AGENTS` lane (`bin/ai_status.py:48-...`) and
`apply_unblock_parent_resolution` calls `ensure_agent(parent_waiting_for)`
on whatever is supplied — `Supervisor`/`human` are not members of
`KNOWN_AGENTS` and would raise. The real actor who must act (Supervisor,
to grant `write_scopes`) is named in `resolved_parent_next`'s message body
instead, consistent with how this task's own parent blocker is already
routed.

This is now a real blocker on this helper task (recorded via `ai-status.sh
blocker`, waiting_for `Codex2`, same reasoning as above): this owner cannot
hand off a mergeable candidate that is safe under
`apply_unblock_parent_resolution`'s current default until Supervisor runs
the command above. Handing off now, without that metadata, would reproduce
exactly the defect HR1 identified on the next merge.
