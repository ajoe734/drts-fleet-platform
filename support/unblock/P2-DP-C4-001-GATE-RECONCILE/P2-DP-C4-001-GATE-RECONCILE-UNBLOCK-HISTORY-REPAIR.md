# P2-DP-C4-001-GATE-RECONCILE Unblock History Repair

## Scope

- Task: `P2-DP-C4-001-GATE-RECONCILE-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-DP-C4-001-GATE-RECONCILE`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-27T07:38:37+00:00`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-dp-c4-001-gate-reconcile-unblock-history-repair`
- Assigned helper branch:
  `codex/p2-dp-c4-001-gate-reconcile-unblock-history-repair`

## Diagnosis

`P2-DP-C4-001-GATE-RECONCILE` is no longer blocked by missing product code.
Its feature delivery already landed on `origin/dev`, but the surrounding local
branch/worktree rails are contaminated enough to misroute any future follow-up
unless they are documented explicitly.

1. The canonical delivered parent result is `origin/dev @ 24435d436448...`
   with subject `P2-DP-C4-001: reconcile restored full dispatch gate (#977)`.
   `gh pr view 977` confirms PR `#977` is `MERGED` into `dev`.
2. The original owner rail survives only as a local audit branch
   `codex2/p2-dp-c4-001-gate-reconcile @ dca58d041cc5...`. Its reflog shows
   the expected five parent commits, but `git ls-remote --heads origin
   'refs/heads/codex2/p2-dp-c4-001-gate-reconcile'` returns nothing after
   prune, so the PR head branch has already been deleted upstream.
3. A separate local branch with the parent task stem,
   `codex/p2-dp-c4-001-gate-reconcile @ 6ac346ab80d8...`, is not a parent
   branch at all. Its reflog shows it was created directly from `origin/dev` at
   `2026-06-27 06:53:49 +0000` and never received any parent commits.
4. That stray `codex/...` branch tip belongs to another task:
   `P2-UI-ROC-002-UNBLOCK-PLANNING-DECISION: record ROC console planning decision (#974)`.
   Continuing from it would silently drop the gate-reconcile delivery that is
   already on `origin/dev`.
5. `git rev-list --left-right --count
   codex/p2-dp-c4-001-gate-reconcile...origin/dev` returns `0 1`. The stray
   local branch is exactly one commit behind `origin/dev`, and the missing
   commit is the canonical merged parent result `24435d436448...`.
6. `git worktree list --porcelain` shows no active worktree attached to either
   `codex/p2-dp-c4-001-gate-reconcile` or
   `codex2/p2-dp-c4-001-gate-reconcile`. The only active same-family worktrees
   are helper rails:
   - `codex/p2-dp-c4-001-gate-reconcile-unblock-history-repair`
   - `codex2/p2-dp-c4-001-gate-reconcile-unblock-manual-unblock`

## Evidence

### Canonical parent delivery rail

- `origin/dev @ 24435d436448d48f496cd2d796e5398435d3d8d4`
- `git show --stat --summary --no-patch 24435d436` shows subject
  `P2-DP-C4-001: reconcile restored full dispatch gate (#977)`
- `gh pr view 977 --json number,title,state,isDraft,headRefName,baseRefName,url,mergeStateStatus,headRefOid`
  reports:
  - PR `#977`
  - title `P2-DP-C4-001: reconcile restored full dispatch gate`
  - state `MERGED`
  - head `codex2/p2-dp-c4-001-gate-reconcile`
  - base `dev`
  - head SHA `dca58d041cc56821fcaa416ee2e20ebe6412fcf3`

### Deleted owner branch rail

- local `codex2/p2-dp-c4-001-gate-reconcile @ dca58d041cc56821fcaa416ee2e20ebe6412fcf3`
- `git reflog show --date=iso codex2/p2-dp-c4-001-gate-reconcile` records:
  - `branch: Created from origin/dev`
  - `5006de3f0 P2-DP-C4-001: restore full dispatch gate and ROC merge flow`
  - `48a0ee8a5 P2-DP-C4-001-GATE-RECONCILE: align sandbox gate unit tests with async full gate`
  - `a22ef4c5c P2-DP-C4-001-GATE-RECONCILE: finalize reviewed dispatch gate reconciliation`
  - `648a79726 P2-DP-C4-001-GATE-RECONCILE: fix passenger disclosure contract drift`
  - `dca58d041 P2-DP-C4-001-GATE-RECONCILE: align booking fixture with disclosure contract`
- `git rev-list --left-right --count origin/dev...codex2/p2-dp-c4-001-gate-reconcile`
  returns `1 5`
- `git ls-remote --heads origin 'refs/heads/codex2/p2-dp-c4-001-gate-reconcile'`
  returns no ref after `git fetch origin --prune`

### Contaminated stray local branch

- local `codex/p2-dp-c4-001-gate-reconcile @ 6ac346ab80d82b9abf3cd5dd3fb71f4d4edde215`
- `git show --stat --summary --no-patch 6ac346ab8` shows subject
  `P2-UI-ROC-002-UNBLOCK-PLANNING-DECISION: record ROC console planning decision (#974)`
- `git reflog show --date=iso codex/p2-dp-c4-001-gate-reconcile` records only:
  `branch: Created from origin/dev`
- `git rev-list --left-right --count
  codex/p2-dp-c4-001-gate-reconcile...origin/dev` returns `0 1`
- `git diff --stat 6ac346ab8..24435d436` shows the merged parent result spans 16
  files, 3583 insertions, and 76 deletions above that stray branch tip
- `git ls-remote --heads origin 'refs/heads/codex/p2-dp-c4-001-gate-reconcile'`
  returns no ref

### Worktree state

- `git worktree list --porcelain` shows active worktrees only for:
  - `codex/p2-dp-c4-001-gate-reconcile-unblock-history-repair`
  - `codex2/p2-dp-c4-001-gate-reconcile-unblock-manual-unblock`
- No worktree is currently attached to either local parent-stem branch
  (`codex/...-gate-reconcile` or `codex2/...-gate-reconcile`)

## Exact Contamination

The exact contamination is a three-rail identity collision around the same task
stem:

1. The true delivered parent rail is not a task branch anymore. It is the merge
   commit `24435d436448...` already reachable from `origin/dev` via PR `#977`.
2. The old owner rail `codex2/p2-dp-c4-001-gate-reconcile` still exists only as
   a local audit stack, but its remote head is gone because the PR has already
   merged.
3. A second local branch with the parent task stem,
   `codex/p2-dp-c4-001-gate-reconcile`, points at an unrelated commit from
   `P2-UI-ROC-002-UNBLOCK-PLANNING-DECISION` and was never part of the parent
   delivery at all.

Because both local branches look like plausible parent rails by name alone, a
future worker can easily resume from the wrong SHA or try to reconstruct PR
evidence from a deleted head branch instead of from the merged `origin/dev`
commit.

## Non-Destructive Repair Path

Do not force-push, amend, or attempt to resurrect PR `#977` history.

1. Treat `origin/dev @ 24435d436448d48f496cd2d796e5398435d3d8d4` as the only
   canonical parent delivery rail. That is the already-merged result.
2. Treat local `codex2/p2-dp-c4-001-gate-reconcile @ dca58d041...` as audit
   evidence only. It is useful for reviewing the original five-commit stack,
   but it is no longer a safe place to continue blocker work.
3. Treat local `codex/p2-dp-c4-001-gate-reconcile @ 6ac346ab8...` as a
   contaminated stray ref. Do not use it for resume, review, CI reruns, or PR
   evidence.
4. If follow-up work is required for the parent, create a fresh branch from the
   current `origin/dev`, not from either stale local `...-gate-reconcile`
   branch. For the currently known repo-level blocker, the safe rail is:

```bash
git fetch origin --prune
git switch -c <lane>/p2-dp-c4-001-postgis-ci-reland origin/dev
```

5. Apply the minimal PostGIS CI reland on that fresh branch, using
   `origin/codex/p2-reg-002-postgis-ci@78d23bf50b7f10956b4c8b366644204b24d9604a`
   as the known source commit referenced by the parent task.
6. After the PostGIS fix lands on `dev`, rerun `ci-integ` / confirm the dev
   rail is healthy. No branch-history repair is required on the already-merged
   gate-reconcile work itself.

## Concrete Parent Next Step

`P2-DP-C4-001-GATE-RECONCILE` should remain blocked only by the repo-level
PostGIS CI regression, but its next actionable step must avoid the contaminated
branch rails:

1. Do not resume from local `codex/p2-dp-c4-001-gate-reconcile @ 6ac346ab8`.
2. Do not try to continue from deleted remote head
   `codex2/p2-dp-c4-001-gate-reconcile`; use it only as local audit evidence if
   needed.
3. Start the PostGIS reland from a fresh branch off current `origin/dev`, which
   already contains the canonical gate-reconcile merge commit `24435d436`.
4. Land the PostGIS fix, rerun `ci-integ`, and then treat PR `#977` as merge
   evidence only rather than as an active review rail.

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- PR `#977` remains valid as the historical review record for the gate-reconcile
  delivery.
- The stale local task-stem branches are documented as unsafe rails instead of
  being silently reused.
- The remaining blocker is handled on a fresh branch from current `dev`, which
  already contains the delivered feature.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` §11
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show P2-DP-C4-001-GATE-RECONCILE-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-DP-C4-001-GATE-RECONCILE`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-DP-C4-001-GATE-RECONCILE-UNBLOCK-MANUAL-UNBLOCK`
- Inspected related refs and worktrees:
  - `git fetch origin --prune`
  - `git worktree list --porcelain`
  - `git branch --list '*p2-dp-c4-001*' -vv`
  - `git for-each-ref refs/heads refs/remotes/origin --format='%(refname:short) %(objectname:short) %(upstream:short) %(subject)' | grep 'p2-dp-c4-001-gate-reconcile'`
  - `git rev-parse origin/dev`
  - `git rev-parse codex/p2-dp-c4-001-gate-reconcile`
  - `git rev-parse codex2/p2-dp-c4-001-gate-reconcile`
  - `git reflog show --date=iso codex/p2-dp-c4-001-gate-reconcile`
  - `git reflog show --date=iso codex2/p2-dp-c4-001-gate-reconcile`
  - `git rev-list --left-right --count origin/dev...codex2/p2-dp-c4-001-gate-reconcile`
  - `git rev-list --left-right --count codex/p2-dp-c4-001-gate-reconcile...origin/dev`
  - `git diff --stat 6ac346ab8..24435d436`
  - `git ls-remote --heads origin 'refs/heads/codex2/p2-dp-c4-001-gate-reconcile' 'refs/heads/codex/p2-dp-c4-001-gate-reconcile'`
- Inspected merge / PR evidence:
  - `git show --stat --summary --no-patch 24435d436`
  - `git show --stat --summary --no-patch dca58d041`
  - `git show --stat --summary --no-patch 6ac346ab8`
  - `gh pr view 977 --json number,title,state,isDraft,headRefName,baseRefName,url,mergeStateStatus,headRefOid`

No runtime or package tests were run in this helper task. This repair is
branch-history and machine-truth triage only.
