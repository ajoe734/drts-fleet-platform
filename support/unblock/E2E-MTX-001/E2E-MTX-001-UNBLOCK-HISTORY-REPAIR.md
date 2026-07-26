# E2E-MTX-001 Unblock History Repair

## Scope

- Task: `E2E-MTX-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `E2E-MTX-001`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-07-26T16:10:00Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-e2e-mtx-001-unblock-history-repair`
- Assigned helper branch:
  `codex/e2e-mtx-001-unblock-history-repair`

## Diagnosis

`E2E-MTX-001` is product-blocked by honest Fleet H verification gaps, but its
branch/worktree history is also ambiguous enough to misroute the next owner
unless the canonical resume rail is documented explicitly.

1. The true parent rail is `origin/codex/e2e-mtx-001 @ 6d4a68cc7`. It is
   exactly one commit ahead of `origin/dev`, and its only task-specific commit
   is `wip(E2E-MTX-001): anchor fleet h evidence matrix`.
2. The assigned helper branch `codex/e2e-mtx-001-unblock-history-repair` was
   created from `origin/dev` at `2026-07-26 15:55:34 +0000` and still does not
   contain the parent branch commit `6d4a68cc7`. This helper branch is a
   diagnosis rail only; it is not a replay of the parent branch.
3. The parent branch currently has no attached worktree in this clone, while
   the helper worktree is attached to `codex/e2e-mtx-001-unblock-history-repair`
   at `origin/dev`. A worker who stays in the assigned helper cwd will not see
   the Fleet H sidecar files unless they inspect the parent commit directly.
4. Multiple active local branches currently point at the same unrelated
   `origin/dev @ 9648aed6d` SHA:
   `codex/e2e-mtx-001-unblock-history-repair`,
   `codex/s3-android-verify-001`, and `gemini/e2e-mtx-001`. Branch-name-only
   reasoning is therefore unsafe for the `E2E-MTX-001` stem.
5. The parent task's only evidence commit was authored and committed as
   `Claude`, while its trailers claim `LLM-Agent: codex` and the task owner is
   `Codex`. That mismatch does not require history rewrite, but it is audit
   contamination that should not be compounded by additional work on the wrong
   branch.
6. No PR exists for either `codex/e2e-mtx-001` or this helper branch. The only
   canonical parent delivery rail today is the pushed remote branch
   `origin/codex/e2e-mtx-001`.

## Evidence

### Parent rail

- `origin/dev @ 9648aed6dbbee00bd7614087309222b1fd76b821`
- `origin/codex/e2e-mtx-001 @ 6d4a68cc794bbd8a8c13419dba3d5b43f9108ede`
- `git rev-list --left-right --count origin/dev...origin/codex/e2e-mtx-001`
  returns `0 1`
- `git merge-base origin/dev origin/codex/e2e-mtx-001`
  returns `9648aed6dbbee00bd7614087309222b1fd76b821`
- `git log --oneline origin/dev..origin/codex/e2e-mtx-001` shows exactly one
  parent commit:
  `6d4a68cc7 wip(E2E-MTX-001): anchor fleet h evidence matrix`
- `git diff --name-status origin/dev..origin/codex/e2e-mtx-001` shows exactly
  two added files:
  - `support/sidecars/E2E-MTX-001/CURRENT-HEAD-PREFLIGHT.md`
  - `support/sidecars/E2E-MTX-001/EVIDENCE-MATRIX.md`
- `git diff --check origin/dev..origin/codex/e2e-mtx-001` returns clean

### Helper rail

- local `codex/e2e-mtx-001-unblock-history-repair`
- `git reflog show --date=iso codex/e2e-mtx-001-unblock-history-repair`
  records: `branch: Created from origin/dev`
- `git merge-base origin/dev codex/e2e-mtx-001-unblock-history-repair`
  returns `9648aed6dbbee00bd7614087309222b1fd76b821`
- `git log --oneline origin/dev..codex/e2e-mtx-001-unblock-history-repair`
  returns no commits before this repair task

### Worktree / ref ambiguity

- `git worktree list --porcelain` shows the only attached `E2E-MTX-001`-family
  worktree is the helper worktree on
  `codex/e2e-mtx-001-unblock-history-repair`
- `git branch -vv --list 'codex/e2e-mtx-001' 'codex/e2e-mtx-001-unblock-history-repair' 'codex/s3-android-verify-001' 'gemini/e2e-mtx-001'`
  shows:
  - `codex/e2e-mtx-001 @ 6d4a68cc7 [origin/codex/e2e-mtx-001]`
  - `codex/e2e-mtx-001-unblock-history-repair @ 9648aed6d [origin/dev]`
  - `codex/s3-android-verify-001 @ 9648aed6d [origin/dev]`
  - `gemini/e2e-mtx-001 @ 9648aed6d [origin/dev]`

### Commit metadata ambiguity

- `git show -s --format=fuller 6d4a68cc7` shows:
  - author `Claude <noreply@anthropic.com>`
  - committer `Claude <noreply@anthropic.com>`
  - trailers:
    - `LLM-Agent: codex`
    - `Task-ID: E2E-MTX-001`
    - `Reviewer: Claude`

### PR state

- `gh pr list --state all --head codex/e2e-mtx-001` returns `[]`
- `gh pr list --state all --head codex/e2e-mtx-001-unblock-history-repair`
  returns `[]`

## Exact Contamination

The exact contamination is helper-rail ambiguity plus one commit-audit mismatch:

1. The true parent rail is the pushed remote branch
   `origin/codex/e2e-mtx-001 @ 6d4a68cc7`, but the currently assigned helper
   worktree sits on `codex/e2e-mtx-001-unblock-history-repair`, which contains
   no parent commit and starts at the same `origin/dev` SHA as unrelated active
   branches.
2. Because the parent branch has no attached worktree in this clone, a worker
   who stays inside the assigned helper cwd can inspect the repo and conclude
   incorrectly that the Fleet H sidecar files are missing, when they actually
   exist only on the parent commit.
3. The parent commit metadata is internally inconsistent: the git author and
   committer are `Claude`, but the task owner and `LLM-Agent` trailer say
   `Codex`. This is survivable, but it makes the branch's audit trail weaker
   and is a concrete reason to avoid rewriting or extending history from the
   wrong rail.

The parent therefore should not be resumed from the helper branch. The safe
resume point remains `origin/codex/e2e-mtx-001`, with a fresh parent worktree
attached before any further Fleet H edits or review prep.

## Non-Destructive Repair Path

Do not force-push, amend, or rename any shared branch.

1. Keep `origin/codex/e2e-mtx-001 @ 6d4a68cc7` as the canonical parent rail.
   It already contains the Fleet H sidecar evidence and is the only pushed
   branch with task-specific content.
2. Treat `codex/e2e-mtx-001-unblock-history-repair` as a helper-only diagnosis
   branch. This task should only add history-repair evidence here.
3. Reattach or create a dedicated parent worktree before any owner resumes
   Fleet H work:

```bash
git fetch origin --prune
git worktree add .artifacts/worktrees/auto/codex-e2e-mtx-001 codex/e2e-mtx-001
```

4. Continue any further evidence edits, review prep, or verification notes on
   `codex/e2e-mtx-001`, not on this helper branch.
5. If commit-authorship hygiene matters for later audit, record a normal
   follow-up commit on `codex/e2e-mtx-001` that references the existing
   `6d4a68cc7` evidence commit and clarifies the owner/author mismatch in prose.
   No history rewrite is needed; a plain new commit or reviewer note is enough.
6. Open the parent PR from `codex/e2e-mtx-001` to `dev` only after the parent
   branch is attached in a real worktree and its remaining verification posture
   is honestly represented.

## Concrete Parent Next Step

`E2E-MTX-001` should remain blocked on the honest Fleet H verification gaps,
but its next actionable step must point at the correct rail:

1. Resume from `origin/codex/e2e-mtx-001 @ 6d4a68cc7`, not from
   `codex/e2e-mtx-001-unblock-history-repair @ 9648aed6d`.
2. Recreate or attach a worktree for `codex/e2e-mtx-001` before touching Fleet
   H evidence again.
3. Keep the existing blocker statement honest: the branch still lacks a full
   green hermetic rerun and still depends on `S3-VERIFY-001` external/current-head
   evidence.
4. Only then continue Fleet H evidence or review preparation on the parent
   branch.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The existing parent branch stays available as the audit anchor for the Fleet
  H evidence already produced.
- The helper branch becomes diagnosis evidence instead of a misleading pseudo-
  parent rail.
- The parent resume path uses ordinary branch/worktree/commit flow on top of
  the existing pushed branch.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show E2E-MTX-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show E2E-MTX-001`
- Inspected parent/helper refs and worktrees:
  - `git fetch origin --prune`
  - `git branch -vv --list 'codex/e2e-mtx-001' 'codex/e2e-mtx-001-unblock-history-repair' 'codex/s3-android-verify-001' 'gemini/e2e-mtx-001'`
  - `git worktree list --porcelain`
  - `git reflog show --date=iso codex/e2e-mtx-001`
  - `git reflog show --date=iso codex/e2e-mtx-001-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex/e2e-mtx-001`
  - `git merge-base origin/dev origin/codex/e2e-mtx-001`
  - `git log --oneline origin/dev..origin/codex/e2e-mtx-001`
  - `git diff --name-status origin/dev..origin/codex/e2e-mtx-001`
  - `git diff --check origin/dev..origin/codex/e2e-mtx-001`
  - `git merge-base origin/dev codex/e2e-mtx-001-unblock-history-repair`
  - `git log --oneline origin/dev..codex/e2e-mtx-001-unblock-history-repair`
- Inspected parent commit / PR evidence:
  - `git show --stat --summary 6d4a68cc7`
  - `git show -s --format=fuller 6d4a68cc7`
  - `gh pr list --state all --head codex/e2e-mtx-001 --json number,title,state,headRefName,baseRefName,url,isDraft`
  - `gh pr list --state all --head codex/e2e-mtx-001-unblock-history-repair --json number,title,state,headRefName,baseRefName,url,isDraft`

No runtime or package tests were run in this helper task. This repair is
branch-history and machine-truth triage only.
