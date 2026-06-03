# OPS-PARITY-FORMS-INC Unblock History Repair

## Scope

- Task: `OPS-PARITY-FORMS-INC-UNBLOCK-HISTORY-REPAIR`
- Parent: `OPS-PARITY-FORMS-INC`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-03T04:00:00Z`
- Canonical machine-truth root:
  `/home/edna/workspace/drts-fleet-platform`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ops-parity-forms-inc-unblock-history-repair`
- Assigned helper branch:
  `codex/ops-parity-forms-inc-unblock-history-repair`

## Diagnosis

`OPS-PARITY-FORMS-INC` is blocked by branch ancestry contamination, not by a
missing helper branch or by an already-pushed shared-history problem.

1. Two task branches exist with the same parent task id but different lane
   names:
   - `codex/ops-parity-forms-inc`
   - `codex2/ops-parity-forms-inc`
2. Both branches were created directly from the same `origin/dev` base commit
   `3be8464262d315d57b1d42d004cc196d3578bf42`.
3. `codex/ops-parity-forms-inc` has the first two parent commits:
   - `4f49b286177794aa6270939e1db8d139fe0e0bd5`
     `OPS-PARITY-FORMS-INC: move incidents create flow into modal`
   - `5ece460f7ec1119647d47eb0bd6de34797d4b642`
     `OPS-PARITY-FORMS-INC: align incidents canvas body`
4. `codex2/ops-parity-forms-inc` does not continue that history. Its only task
   commit is `2be8e57831892ce5b2754c49d7bee2440c6b0308`
   `wip(OPS-PARITY-FORMS-INC): anchor incidents parity body`.
5. `git range-diff origin/dev...codex/ops-parity-forms-inc
   origin/dev...codex2/ops-parity-forms-inc` shows the Codex2 branch is not a
   fast-forward continuation of the earlier rail; it is a parallel rewrite of
   the same file.
6. Both branches modify the same parent artifact
   `apps/ops-console-web/app/incidents/page.tsx`, but the Codex2 branch omits
   the earlier two commits from its ancestry and therefore creates competing
   histories for the same task.
7. No remote refs currently exist for:
   - `origin/codex/ops-parity-forms-inc`
   - `origin/codex2/ops-parity-forms-inc`
   - `origin/codex/ops-parity-forms-inc-unblock-history-repair`

The exact contamination is therefore a local branch/worktree split: Codex2 was
reassigned onto a fresh sibling branch instead of continuing the existing task
rail, producing parallel local histories for one task. Because neither parent
branch is pushed, there is no reason to repair this by force-pushing; the safe
path is to choose one canonical rail and replay the other branch's delta onto
it additively.

## Evidence

### Local task branches and ancestry

- `codex/ops-parity-forms-inc@{2026-06-03 01:48:54 +0000}`:
  `branch: Created from origin/dev`
- `codex2/ops-parity-forms-inc@{2026-06-03 02:10:03 +0000}`:
  `branch: Created from origin/dev`
- merge-base:
  - `git merge-base origin/dev codex/ops-parity-forms-inc`
    = `3be8464262d315d57b1d42d004cc196d3578bf42`
  - `git merge-base origin/dev codex2/ops-parity-forms-inc`
    = `3be8464262d315d57b1d42d004cc196d3578bf42`
  - `git merge-base codex/ops-parity-forms-inc codex2/ops-parity-forms-inc`
    = `3be8464262d315d57b1d42d004cc196d3578bf42`

### Parent branch histories

- `codex/ops-parity-forms-inc`:
  - `4f49b286177794aa6270939e1db8d139fe0e0bd5`
  - `5ece460f7ec1119647d47eb0bd6de34797d4b642`
- `codex2/ops-parity-forms-inc`:
  - `2be8e57831892ce5b2754c49d7bee2440c6b0308`
- `git range-diff` outcome:
  - left-only:
    `4f49b286 OPS-PARITY-FORMS-INC: move incidents create flow into modal`
  - left-only:
    `5ece460f OPS-PARITY-FORMS-INC: align incidents canvas body`
  - right-only:
    `2be8e578 wip(OPS-PARITY-FORMS-INC): anchor incidents parity body`

### Same file, competing diffs

- `git show --stat 5ece460f -- apps/ops-console-web/app/incidents/page.tsx`
  reports `99 insertions(+), 78 deletions(-)`
- `git show --stat 2be8e578 -- apps/ops-console-web/app/incidents/page.tsx`
  reports `234 insertions(+), 26 deletions(-)`
- `git diff --stat 5ece460f 2be8e578 -- apps/ops-console-web/app/incidents/page.tsx`
  reports `249 insertions(+), 277 deletions(-)`

This is not a tiny follow-up fix; it is a broad rewrite over the same surface,
which is why the parent cannot safely treat the Codex2 branch as a continuation
of the earlier rail.

## Exact Contamination

The parent was first implemented on `codex/ops-parity-forms-inc`, then a second
lane created `codex2/ops-parity-forms-inc` from `origin/dev` instead of from
that first task branch. This replaced a linear task history with two sibling
histories carrying the same `Task-ID: OPS-PARITY-FORMS-INC` trailers.

That contamination matters because:

1. reviewer/owner cannot identify a single canonical parent branch from history
   alone
2. the later `wip` commit is not a normal follow-up on top of the earlier two
   commits
3. merging or pushing both rails independently would preserve contradictory
   task evidence for the same acceptance target

## Non-Destructive Repair Path

Do not force-push either parent branch.

1. Treat `codex/ops-parity-forms-inc` as the canonical parent rail because it
   already contains the first two task commits in sequence.
2. Leave `codex2/ops-parity-forms-inc @ 2be8e578` untouched as audit evidence
   of the contaminated reassignment.
3. Have parent owner `Codex2` switch into the existing worktree for
   `codex/ops-parity-forms-inc` and compare its current tree against
   `2be8e578`.
4. Replay only the still-needed delta from `2be8e578` onto
   `codex/ops-parity-forms-inc` as a new additive commit. Use cherry-pick with
   conflict resolution or manual porting, but do not rewrite either existing
   commit chain.
5. Push only the chosen canonical parent branch normally:
   `git push -u origin codex/ops-parity-forms-inc`
6. Handoff/review/close out the parent task against that pushed canonical rail.

If Codex2 decides the `2be8e578` content should supersede the earlier Codex
implementation, the safe version is still additive: create a new follow-up
commit on top of `5ece460f`, not a reset or force-push of either branch.

## Concrete Parent Next Step

The parent `OPS-PARITY-FORMS-INC` should resume on
`codex/ops-parity-forms-inc`, not on `codex2/ops-parity-forms-inc`.

Concrete next step:

1. `Codex2` checks out the existing `codex/ops-parity-forms-inc` worktree.
2. Diff `5ece460f` against `2be8e578` and replay any intended remaining delta
   as one new commit on top of `5ece460f`.
3. Push `codex/ops-parity-forms-inc` to `origin`.
4. Update machine truth on the parent with that pushed branch and new commit
   hash, then continue `handoff -> review -> done`.

Until that replay happens, `codex2/ops-parity-forms-inc @ 2be8e578` should be
treated as a contaminated local branch, not as the canonical parent delivery
rail.

## Why This Is Safe

- no published shared branch is rewritten
- no force-push is required
- the contaminated Codex2 branch remains available for audit
- the canonical parent rail becomes linear again before any remote push
- reviewer evidence can point at one branch and one commit chain

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- inspected machine truth for:
  - `OPS-PARITY-FORMS-INC`
  - `OPS-PARITY-FORMS-INC-UNBLOCK-HISTORY-REPAIR`
- inspected branch/worktree state:
  - `git branch -vv`
  - `git worktree list --porcelain`
  - `git reflog show --date=iso codex/ops-parity-forms-inc`
  - `git reflog show --date=iso codex2/ops-parity-forms-inc`
  - `git merge-base origin/dev codex/ops-parity-forms-inc`
  - `git merge-base origin/dev codex2/ops-parity-forms-inc`
  - `git merge-base codex/ops-parity-forms-inc codex2/ops-parity-forms-inc`
  - `git log --oneline origin/dev..codex/ops-parity-forms-inc`
  - `git log --oneline origin/dev..codex2/ops-parity-forms-inc`
  - `git range-diff origin/dev...codex/ops-parity-forms-inc origin/dev...codex2/ops-parity-forms-inc`
  - `git show --stat --summary 4f49b286 --`
  - `git show --stat --summary 5ece460f --`
  - `git show --stat --summary 2be8e578 --`
  - `git diff --stat 5ece460f 2be8e578 -- apps/ops-console-web/app/incidents/page.tsx`
  - `git ls-remote --heads origin 'codex/ops-parity-forms-inc' 'codex2/ops-parity-forms-inc' 'codex/ops-parity-forms-inc-unblock-history-repair'`

No runtime tests were run. This task repairs history diagnosis and replay
instructions only.

## Closeout Evidence

- Approved helper artifact commit on this branch:
  `2c61389a834cdea9ac0fc2649ff7024c081bc054`
  `OPS-PARITY-FORMS-INC-UNBLOCK-HISTORY-REPAIR: document branch contamination repair path`
- Normal push evidence:
  `origin/codex/ops-parity-forms-inc-unblock-history-repair`
  points at `2c61389a834cdea9ac0fc2649ff7024c081bc054`
- Parent machine truth was updated before closeout:
  `OPS-PARITY-FORMS-INC.next` now instructs the owner to resume on
  `codex/ops-parity-forms-inc`, replay the intended delta from
  `2be8e57831892ce5b2754c49d7bee2440c6b0308` onto `5ece460f7ec1119647d47eb0bd6de34797d4b642`,
  and push only the canonical rail normally.
