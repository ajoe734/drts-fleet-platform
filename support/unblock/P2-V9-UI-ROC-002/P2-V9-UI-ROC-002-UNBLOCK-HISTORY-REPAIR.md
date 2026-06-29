# P2-V9-UI-ROC-002 Unblock History Repair

## Scope

- Task: `P2-V9-UI-ROC-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-V9-UI-ROC-002`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-29T04:28:07+00:00`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-v9-ui-roc-002-unblock-history-repair`
- Assigned helper branch:
  `codex/p2-v9-ui-roc-002-unblock-history-repair`

## Diagnosis

`P2-V9-UI-ROC-002` is still product-blocked by missing canonical ROC v9 canvas
files, and its existing task branch is also history-contaminated enough that it
should not be reused for the eventual resume.

1. The current parent rail is the pushed branch
   `origin/codex/p2-v9-ui-roc-002 @ 3cdd8f585a0ec2184e0fca21bb9a640b2dc2e606`
   with subject
   `merge(P2-V9-UI-ROC-002): absorb remote pre-rebase task history`.
2. `git reflog show codex/p2-v9-ui-roc-002` shows the branch was created from
   `origin/dev`, then committed `4f2326c35`, then rebased onto the unrelated
   `P2-AV-LIVE-ONBOARDING` commit
   `935410915c439489c19c081e355092972deb86b4`, producing a second copy of the
   same task patch at `7629b29bb8590c17983c230c6400219b5676a9d8`.
3. The rebased patch was then reverted by
   `65e01d49b96f47b1718462cc47e34715dd174f1b`, and the branch finally merged
   the old pre-rebase remote tip back in with an `ours` merge at `3cdd8f585`.
4. `git merge-base origin/dev origin/codex/p2-v9-ui-roc-002` returns
   `935410915c439489c19c081e355092972deb86b4`, not the current `origin/dev`
   tip `7bd059d626e7f5ba738b554d7fa25e05aaaac65a`.
5. `git rev-list --left-right --count origin/dev...origin/codex/p2-v9-ui-roc-002`
   returns `1 4`, so the parent branch is four commits off its stale merge-base
   while `origin/dev` has moved one commit ahead.
6. `git diff --name-status origin/dev...origin/codex/p2-v9-ui-roc-002` returns
   no files and `git diff --check origin/dev...origin/codex/p2-v9-ui-roc-002`
   is clean. The contaminated branch is tree-identical to `origin/dev`; it
   carries history only, not surviving feature diff.
7. The canonical ROC design files named in the parent task are still absent.
   Both
   `docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628/roc-screens-1.jsx`
   and `roc-screens-2.jsx` are missing in this worktree, and
   `git ls-tree -r --name-only origin/dev docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628`
   returns nothing.
8. No PR currently exists for the parent branch `codex/p2-v9-ui-roc-002`. The
   parent therefore has only branch-push evidence today, and that branch is not
   a safe resume rail. Any helper PR created by this task is evidence for the
   history-repair note only, not for parent feature delivery.

## Evidence

### Parent rail

- `origin/dev @ 7bd059d626e7f5ba738b554d7fa25e05aaaac65a`
- `origin/codex/p2-v9-ui-roc-002 @ 3cdd8f585a0ec2184e0fca21bb9a640b2dc2e606`
- `git merge-base origin/dev origin/codex/p2-v9-ui-roc-002`
  returns `935410915c439489c19c081e355092972deb86b4`
- `git rev-list --left-right --count origin/dev...origin/codex/p2-v9-ui-roc-002`
  returns `1 4`
- `git log --oneline origin/dev..origin/codex/p2-v9-ui-roc-002` shows exactly
  four branch-only commits:
  - `3cdd8f585 merge(P2-V9-UI-ROC-002): absorb remote pre-rebase task history`
  - `4f2326c35 wip(P2-V9-UI-ROC-002): anchor roc response runtime screens`
  - `65e01d49b Revert "wip(P2-V9-UI-ROC-002): anchor roc response runtime screens"`
  - `7629b29bb wip(P2-V9-UI-ROC-002): anchor roc response runtime screens`
- `git show --stat --summary --no-patch 3cdd8f585` confirms the final branch
  tip is an `ours` merge
- `git reflog show --date=iso codex/p2-v9-ui-roc-002` records:
  - `branch: Created from origin/dev`
  - `commit: wip(P2-V9-UI-ROC-002): anchor roc response runtime screens`
  - `rebase (finish): refs/heads/codex/p2-v9-ui-roc-002 onto 935410915c439489c19c081e355092972deb86b4`
  - `revert: Revert "wip(P2-V9-UI-ROC-002): anchor roc response runtime screens"`
  - `merge origin/codex/p2-v9-ui-roc-002: Merge made by the 'ours' strategy`

### Tree state

- `git diff --name-status origin/dev...origin/codex/p2-v9-ui-roc-002` returns
  no output
- `git diff --check origin/dev...origin/codex/p2-v9-ui-roc-002` exits `0`
- The parent branch therefore contains no surviving file delta that needs to be
  replayed or cherry-picked

### Product blocker still present

- `ls -l docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628/roc-screens-1.jsx docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628/roc-screens-2.jsx`
  reports both files missing
- `git ls-tree -r --name-only origin/dev docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628`
  returns no files
- `git ls-tree -r --name-only origin/codex/p2-v9-ui-roc-002 docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628`
  also returns no files

### Helper rail

- local helper branch
  `codex/p2-v9-ui-roc-002-unblock-history-repair @ 7bd059d626e7f5ba738b554d7fa25e05aaaac65a`
- `git merge-base origin/dev codex/p2-v9-ui-roc-002-unblock-history-repair`
  returns `7bd059d626e7f5ba738b554d7fa25e05aaaac65a`
- The helper branch starts from current `origin/dev` and does not inherit the
  contaminated parent history; this task adds diagnosis evidence on top of that
  clean base only

## Exact Contamination

The exact branch contamination is a duplicate-patch rebase/revert/merge loop:

1. The same ROC runtime patch exists twice with identical subject and content
   but different SHAs:
   - `4f2326c35` on the pre-rebase remote history
   - `7629b29bb` on the post-rebase local history
2. The rebase moved the branch onto unrelated commit
   `935410915c439489c19c081e355092972deb86b4`
   (`P2-AV-LIVE-ONBOARDING`), so the branch no longer shares the current
   `origin/dev` ancestry it originally started from.
3. The revert `65e01d49b` and final `ours` merge `3cdd8f585` remove any net
   file diff while preserving the polluted history, leaving a branch that is
   review-noisy but content-empty.

That combination is what keeps the parent blocked from a safe resume: the
branch name looks canonical, but the branch tip contributes no usable delta and
its commit graph is already contaminated by unrelated ancestry and duplicate
task commits.

## Non-Destructive Repair Path

Do not force-push, rewrite, or delete the shared parent branch.

1. Treat `origin/codex/p2-v9-ui-roc-002 @ 3cdd8f585` as audit evidence only.
   It should not be the resume rail for renewed ROC implementation work.
2. Treat this helper branch as history-repair evidence only. It is safe because
   it starts from current `origin/dev` and does not replay the contaminated
   parent ancestry.
3. Leave the contaminated shared branch untouched. The branch is tree-identical
   to `origin/dev`, so there is no surviving feature diff that needs rescue.
4. Keep the parent task blocked until the canonical ROC v9 canvas files
   `roc-screens-1.jsx` and `roc-screens-2.jsx` exist on `origin/dev`.
5. Once those files land, start a fresh successor branch from the current
   `origin/dev`, not from `origin/codex/p2-v9-ui-roc-002`. For example:

```bash
git fetch origin --prune
git switch -c codex/p2-v9-ui-roc-002-reland origin/dev
```

6. Re-implement the ROC takeover / alerts / incidents / evidence / reports
   routes from the restored canvas on that fresh branch. Because the old branch
   has zero surviving diff against `dev`, there is nothing to cherry-pick from
   it.
7. Open the eventual parent PR from the fresh successor branch to `dev`, and
   retain `origin/codex/p2-v9-ui-roc-002` only as audit history for why the
   original rail was abandoned.

## Concrete Parent Next Step

`P2-V9-UI-ROC-002` should remain blocked on the missing ROC v9 design archive,
but the next unblocked action is now concrete:

1. Wait for
   `docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628/roc-screens-1.jsx`
   and `roc-screens-2.jsx` to exist on `origin/dev`.
2. Do not resume from `origin/codex/p2-v9-ui-roc-002`.
3. Create a fresh successor branch from then-current `origin/dev`.
4. Rebuild the ROC runtime on that clean rail and use this document plus the
   old pushed branch as audit evidence only.

## Why This Is Safe

- No shared history is rewritten.
- No force-push is required.
- The original pushed branch remains available for audit and comparison.
- The eventual implementation restarts from a clean `origin/dev` ancestor
  instead of compounding the polluted history.
- The product blocker and the branch-history blocker are separated cleanly:
  design recovery first, then implementation on a new rail.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show P2-V9-UI-ROC-002-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-V9-UI-ROC-002`
- Inspected related refs and worktrees:
  - `git fetch origin --prune`
  - `git worktree list --porcelain`
  - `git branch -vv --list 'codex/p2-v9-ui-roc-002' 'codex/p2-v9-ui-roc-002-unblock-history-repair' 'codex2/p2-v9-ui-roc-002'`
  - `git show-ref --heads --dereference | grep 'p2-v9-ui-roc-002'`
  - `git rev-parse origin/dev`
  - `git rev-parse origin/codex/p2-v9-ui-roc-002`
  - `git merge-base origin/dev origin/codex/p2-v9-ui-roc-002`
  - `git rev-list --left-right --count origin/dev...origin/codex/p2-v9-ui-roc-002`
  - `git reflog show --date=iso codex/p2-v9-ui-roc-002`
  - `git log --oneline --decorate --graph --max-count=30 origin/dev..origin/codex/p2-v9-ui-roc-002`
  - `git diff --name-status origin/dev...origin/codex/p2-v9-ui-roc-002`
  - `git diff --check origin/dev...origin/codex/p2-v9-ui-roc-002`
- Inspected commit / PR evidence:
  - `git show --stat --summary --no-patch 3cdd8f585`
  - `git show --stat --summary --no-patch 65e01d49b`
  - `git show --stat --summary --no-patch 7629b29bb`
  - `git show --stat --summary --no-patch 4f2326c35`
  - `gh pr list --state all --head codex/p2-v9-ui-roc-002 --json number,title,state,isDraft,headRefName,baseRefName,url`

No runtime or package tests were run in this helper task. This repair is
branch-history and machine-truth triage only.
