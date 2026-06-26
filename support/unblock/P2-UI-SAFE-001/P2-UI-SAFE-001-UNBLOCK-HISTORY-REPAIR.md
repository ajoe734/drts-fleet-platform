# P2-UI-SAFE-001 Unblock History Repair

## Scope

- Task: `P2-UI-SAFE-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-UI-SAFE-001`
- Owner: `Codex`
- Reviewer: `Claude2`
- Audit timestamp: `2026-06-26T15:11:04Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-ui-safe-001-unblock-history-repair`
- Assigned helper branch:
  `codex/p2-ui-safe-001-unblock-history-repair`

## Diagnosis

`P2-UI-SAFE-001` is product-blocked by the missing safety-operator canvas, but
its branch/worktree state also has enough routing drift to confuse the next
owner handoff unless it is documented explicitly.

1. The canonical parent rail is `origin/codex/p2-ui-safe-001 @ 6aaabef9f12d47c0815696cd60bdf4c365132189`.
   It is exactly one commit ahead of `origin/dev`, and its single commit is the
   blocker note `wip(P2-UI-SAFE-001): anchor safety-operator requirements`.
2. The assigned helper branch
   `codex/p2-ui-safe-001-unblock-history-repair` was created from `origin/dev`
   at `2026-06-26 15:07:34 +0000`, and even after this repair it still does not
   contain the parent branch commit `6aaabef9f`. This task pushes the helper
   branch only as diagnosis evidence with task-local commits above `origin/dev`;
   it is not a replay of the parent branch.
3. The helper branch currently points at the same SHA as unrelated local refs
   `codex/p2-corr-001` and `codex/p2-safe-001`, which makes branch-name-only
   reasoning unsafe for this task family.
4. After `git fetch --prune`, `origin/codex/p2-safe-001` no longer exists, but
   local `codex/p2-safe-001` still aliases `origin/dev @ 6c974f050`. That stale
   local ref does not block `P2-UI-SAFE-001` directly, but it adds more noise
   around the same safety-operator task stem.
5. The parent branch's only commit is reviewable, but it is not clean for a
   future PR replay as-is: `git diff --check origin/dev...origin/codex/p2-ui-safe-001`
   reports six trailing-whitespace errors in
   `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md`.
6. No PR exists for the parent branch `codex/p2-ui-safe-001`. This repair task
   now adds a helper-only draft PR `#932` for diagnosis evidence, but the only
   canonical parent delivery rail today is still the pushed remote branch
   `origin/codex/p2-ui-safe-001`.

## Evidence

### Parent rail

- `origin/dev @ 6c974f05044001e7aeb2ca59f5384a5ae781192c`
- `origin/codex/p2-ui-safe-001 @ 6aaabef9f12d47c0815696cd60bdf4c365132189`
- `git rev-list --left-right --count origin/dev...origin/codex/p2-ui-safe-001`
  returns `0 1`
- `git merge-base origin/dev origin/codex/p2-ui-safe-001`
  returns `6c974f05044001e7aeb2ca59f5384a5ae781192c`
- `git log --oneline 6c974f050..6aaabef9f` shows exactly one parent commit:
  `6aaabef9f wip(P2-UI-SAFE-001): anchor safety-operator requirements`
- `git diff --name-status 6c974f050..6aaabef9f` shows exactly one added file:
  `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md`

### Helper rail

- local + remote `codex/p2-ui-safe-001-unblock-history-repair`
- `git reflog show codex/p2-ui-safe-001-unblock-history-repair`
  records: `branch: Created from origin/dev`
- `git merge-base origin/dev codex/p2-ui-safe-001-unblock-history-repair`
  returns `6c974f05044001e7aeb2ca59f5384a5ae781192c`
- `git log --oneline origin/dev..origin/codex/p2-ui-safe-001-unblock-history-repair`
  shows only task-local helper commits with subject prefix
  `P2-UI-SAFE-001-UNBLOCK-HISTORY-REPAIR:`
- `git ls-remote --heads origin 'refs/heads/codex/p2-ui-safe-001-unblock-history-repair'`
  returns exactly one remote ref under that branch name
- `gh pr view 932 --json number,title,state,isDraft,headRefName,baseRefName,url`
  shows an open draft PR from `codex/p2-ui-safe-001-unblock-history-repair` to
  `dev`

### Ref noise around the same stem

- `git branch -vv` shows:
  - `codex/p2-corr-001 @ 6c974f050 [origin/dev]`
  - `codex/p2-safe-001 @ 6c974f050 [origin/dev]`
  - `codex/p2-ui-safe-001-unblock-history-repair @ 6c974f050 [origin/dev]`
- `git ls-remote --heads origin 'refs/heads/codex/p2-safe-001'`
  returns no ref after prune
- `git worktree list --porcelain` shows no active worktree attached to
  `codex/p2-ui-safe-001`; only the helper worktree is currently attached to the
  `P2-UI-SAFE-001` stem in this clone

### Parent branch hygiene defect

- `git show -s --format=fuller 6aaabef9f` confirms the commit subject is
  `wip(P2-UI-SAFE-001): anchor safety-operator requirements`
- `scripts/git/check_commit_trailers.py` accepts subjects matching
  `^(?:wip\\()?[A-Z][A-Z0-9-]*[A-Z0-9]\\)?: \\S`, so the subject itself is not
  the blocker
- `git diff --check origin/dev...origin/codex/p2-ui-safe-001` reports six
  trailing-whitespace errors in:
  - line 3
  - line 4
  - line 5
  - line 6
  - line 7
  - line 33
  of `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md`

### PR state

- `gh pr list --state all --head codex/p2-ui-safe-001` returns `[]`
- `gh pr view 932` shows:
  - PR `#932`
  - title `P2-UI-SAFE-001-UNBLOCK-HISTORY-REPAIR: document parent resume rail`
  - head `codex/p2-ui-safe-001-unblock-history-repair`
  - base `dev`
  - state `OPEN`
  - draft `true`

## Exact Contamination

The exact contamination is control-plane ambiguity plus one content-hygiene
defect:

1. The true parent rail is the pushed remote branch
   `origin/codex/p2-ui-safe-001 @ 6aaabef9f`, but the currently assigned helper
   worktree sits on `codex/p2-ui-safe-001-unblock-history-repair`, which
   contains only helper diagnosis commits on top of `origin/dev` and does not
   replay the parent branch commit.
2. Multiple same-family local refs (`codex/p2-corr-001`, `codex/p2-safe-001`,
   and the helper branch) all resolve to the same unrelated `origin/dev` SHA,
   so a worker can easily continue on the wrong branch by name alone.
3. The parent branch's blocker-note commit has trailing whitespace, so even if a
   future worker resumes on the correct parent rail, they still need one normal
   follow-up cleanup commit before that branch is ready for PR-based review.

The parent therefore should not be resumed from the helper branch. The safe
resume point remains `origin/codex/p2-ui-safe-001`, with a small clean-up
follow-up commit required before any PR.

## Non-Destructive Repair Path

Do not force-push, amend, or rename any shared branch.

1. Keep `origin/codex/p2-ui-safe-001 @ 6aaabef9f` as the canonical parent rail.
   It already contains the blocker note and is the only pushed branch with
   parent-specific content.
2. Treat `codex/p2-ui-safe-001-unblock-history-repair` as a helper-only
   diagnosis branch. This task pushes only history-repair commits there and
   opens helper draft PR `#932`; do not add feature work on that rail.
3. Leave stale local refs such as `codex/p2-safe-001 @ 6c974f050` untouched for
   now. They are noise, but deleting or renaming them is not required to resume
   the parent safely.
4. When design provides the missing safety-operator canvas, resume the parent on
   `codex/p2-ui-safe-001`, not on this helper branch. Reattach or create a
   parent worktree first:

```bash
git fetch origin --prune
git worktree add .artifacts/worktrees/auto/codex-p2-ui-safe-001 codex/p2-ui-safe-001
```

5. Before opening a parent PR or handoffing the parent for review, add one
   normal non-destructive follow-up commit on `codex/p2-ui-safe-001` that
   removes the six trailing-whitespace defects from
   `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md`.
   No history rewrite is needed; a plain `git commit` on top of `6aaabef9f` is
   sufficient.
6. After the design dependency lands and the whitespace cleanup commit is added,
   continue the actual feature work on `codex/p2-ui-safe-001`, then open the
   parent PR from that branch to `dev`.

## Concrete Parent Next Step

`P2-UI-SAFE-001` should remain blocked on the missing safety-operator canvas,
but its next actionable step must point at the correct rail:

1. Resume from `origin/codex/p2-ui-safe-001 @ 6aaabef9f`, not from
   `codex/p2-ui-safe-001-unblock-history-repair @ 6c974f050`.
2. Recreate or attach a worktree for `codex/p2-ui-safe-001` once the design
   canvas exists.
3. Add a follow-up whitespace cleanup commit to
   `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md`.
4. Only then continue UI implementation / review preparation on the parent
   branch.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The existing parent branch stays available as the audit anchor for the current
  blocked design note.
- The helper branch and draft PR become reviewable evidence instead of a
  misleading pseudo-parent rail.
- The parent resume path uses normal branch/worktree/commit flow on top of the
  existing pushed branch.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show P2-UI-SAFE-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-UI-SAFE-001`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-SAFE-001`
- Inspected related refs and worktrees:
  - `git fetch origin --prune`
  - `git branch -vv --list 'codex/p2-safe-001' 'codex/p2-corr-001' 'codex/p2-ui-safe-001' 'codex/p2-ui-safe-001-unblock-history-repair'`
  - `git worktree list --porcelain`
  - `git ls-remote --heads origin 'refs/heads/codex/p2-ui-safe-001' 'refs/heads/codex/p2-ui-safe-001-unblock-history-repair' 'refs/heads/codex/p2-safe-001' 'refs/heads/codex/p2-corr-001'`
  - `git reflog show --date=iso codex/p2-ui-safe-001-unblock-history-repair`
  - `git merge-base origin/dev codex/p2-ui-safe-001-unblock-history-repair`
  - `git log --oneline origin/dev..origin/codex/p2-ui-safe-001-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex/p2-ui-safe-001`
  - `git merge-base origin/dev origin/codex/p2-ui-safe-001`
  - `git log --oneline 6c974f050..6aaabef9f`
  - `git diff --name-status 6c974f050..6aaabef9f`
  - `git diff --check origin/dev...origin/codex/p2-ui-safe-001`
- Inspected commit / PR evidence:
  - `git show -s --format=fuller 6aaabef9f`
  - `grep -n 'SUBJECT_RE\\|rev-list' scripts/git/check_commit_trailers.py`
  - `git push -u origin codex/p2-ui-safe-001-unblock-history-repair`
  - `gh pr create --draft --base dev --head codex/p2-ui-safe-001-unblock-history-repair --title 'P2-UI-SAFE-001-UNBLOCK-HISTORY-REPAIR: document parent resume rail' ...`
  - `git fetch origin refs/heads/codex/p2-ui-safe-001-unblock-history-repair:refs/remotes/origin/codex/p2-ui-safe-001-unblock-history-repair`
  - `gh pr list --state all --head codex/p2-ui-safe-001 --json number,title,state,headRefName,baseRefName,url,mergeStateStatus,isDraft`
  - `gh pr view 932 --json number,title,state,isDraft,headRefName,baseRefName,url`

No runtime or package tests were run in this helper task. This repair is
branch-history and machine-truth triage only.
