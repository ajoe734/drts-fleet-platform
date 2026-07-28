# DEV-UI-RUNTIME-RELEASE-001 Unblock History Repair

## Scope

- Task: `DEV-UI-RUNTIME-RELEASE-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `DEV-UI-RUNTIME-RELEASE-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-07-28T16:00:00Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-dev-ui-runtime-release-001-unblock-history-repair`
- Assigned helper branch:
  `codex/dev-ui-runtime-release-001-unblock-history-repair`

## Diagnosis

`DEV-UI-RUNTIME-RELEASE-001` is not blocked by branch/worktree/commit
contamination. The parent is blocked by closeout routing drift: the release
branch is already clean and pushed, but no PR exists from that branch to
`dev`, so there is no merge or required-check evidence that would justify
`done`.

1. The canonical parent branch is
   `origin/codex/dev-ui-runtime-release-001 @ f1b66ae860e7e3e040a0199726b89fd96a96bd89`.
   It is linear, contains exactly two task commits on top of `origin/dev`, and
   has no merge commits.
2. `git rev-list --left-right --count origin/dev...origin/codex/dev-ui-runtime-release-001`
   returns `0 2`, which means the parent branch is simply two commits ahead of
   trunk with no divergence from `origin/dev`.
3. `git diff --check origin/dev..origin/codex/dev-ui-runtime-release-001`
   is clean, so the pushed branch does not carry formatting or whitespace
   damage that would explain the block.
4. `gh pr list --head codex/dev-ui-runtime-release-001 ...` returns `[]`, and
   `gh pr view codex/dev-ui-runtime-release-001 ...` reports `no pull requests
   found for branch "codex/dev-ui-runtime-release-001"`.
5. Parent machine truth says the task is blocked because direct integration to
   protected `dev` requires a PR and the expected required status checks, but a
   helper `history_repair` task was still auto-created. That helper dispatch is
   stale categorization, not evidence of real history corruption.
6. The assigned helper branch for this task,
   `codex/dev-ui-runtime-release-001-unblock-history-repair`, is clean at
   `origin/dev @ 741d4ab4779ff38bdcf39df37af3dacde86b2fe9`. It contains no
   parent commits and no branch-name collision on origin. It is suitable only
   for this diagnosis artifact.

## Evidence

### Parent branch state

- `origin/dev @ 741d4ab4779ff38bdcf39df37af3dacde86b2fe9`
- `origin/codex/dev-ui-runtime-release-001 @ f1b66ae860e7e3e040a0199726b89fd96a96bd89`
- `git merge-base origin/dev origin/codex/dev-ui-runtime-release-001`
  returns `741d4ab4779ff38bdcf39df37af3dacde86b2fe9`
- `git rev-list --left-right --count origin/dev...origin/codex/dev-ui-runtime-release-001`
  returns `0 2`
- `git log --oneline origin/dev..origin/codex/dev-ui-runtime-release-001`
  shows exactly:
  - `f1b66ae86 DEV-UI-RUNTIME-RELEASE-001: finalize approved dev runtime matrix throttling`
  - `f492b8442 wip(DEV-UI-RUNTIME-RELEASE-001): anchor dev runtime matrix throttling`
- `git diff --name-only origin/dev..origin/codex/dev-ui-runtime-release-001`
  shows only:
  - `playwright.dev-runtime-matrix.config.ts`
  - `tests/e2e/dev-runtime-matrix.spec.ts`
- `git diff --check origin/dev..origin/codex/dev-ui-runtime-release-001`
  returns no output

### Helper branch state

- local helper branch
  `codex/dev-ui-runtime-release-001-unblock-history-repair @ 741d4ab4779ff38bdcf39df37af3dacde86b2fe9`
- `git branch -vv` shows it tracks `[origin/dev]`, not a contaminated
  same-name remote helper ref
- `git ls-remote --heads origin 'codex/dev-ui-runtime-release-001*'`
  returns only:
  - `refs/heads/codex/dev-ui-runtime-release-001 @ f1b66ae860e7e3e040a0199726b89fd96a96bd89`
- `git worktree list --porcelain` shows the helper worktree is attached only to
  the helper branch and does not overlap the parent branch worktree

### PR and machine-truth state

- `gh pr list --head codex/dev-ui-runtime-release-001 --json number,title,state,headRefName,baseRefName,url`
  returns `[]`
- `gh pr view codex/dev-ui-runtime-release-001 --json ...`
  returns: `no pull requests found for branch "codex/dev-ui-runtime-release-001"`
- `AI_NAME=Codex scripts/ai-status.sh show DEV-UI-RUNTIME-RELEASE-001`
  shows status `blocked` with `next` already describing the real issue:
  protected `dev` requires PR/check evidence before closeout

## Exact Contamination

The exact contamination is not git history corruption. It is control-plane
misrouting:

1. The parent branch is clean and already pushed, but the closeout path stopped
   before opening a PR against `dev`.
2. Parent machine truth remained in `blocked` with the correct PR/checks reason,
   but chairman triage still created a `history_repair` helper task as if the
   branch itself were dirty.
3. The helper branch/worktree is therefore not repairing bad history; it is
   documenting that the unblock should resume from the existing parent branch.

The parent remains blocked because there is no standard PR/check rail yet, not
because any branch needs rewrite, replay, or force-push.

## Non-Destructive Repair Path

Do not rewrite, force-push, or replace `origin/codex/dev-ui-runtime-release-001`.

1. Treat `origin/codex/dev-ui-runtime-release-001 @ f1b66ae86` as the canonical
   parent delivery branch.
2. Open a normal PR from that branch to `dev`:

```bash
gh pr create \
  --base dev \
  --head codex/dev-ui-runtime-release-001 \
  --title "DEV-UI-RUNTIME-RELEASE-001: dev runtime matrix throttling" \
  --body "Pushed owner closeout branch for DEV-UI-RUNTIME-RELEASE-001. No history repair is required; this PR provides the protected-branch review and required-check path that machine truth already expects."
```

3. Keep the existing parent commit evidence:
   - anchor commit `f492b8442`
   - formal closeout commit `f1b66ae86`
4. After the PR opens, update the parent task from `blocked` to review-ready
   machine truth with the PR URL and branch evidence, then let the existing
   reviewer continue the normal closeout flow.
5. Only after PR checks complete and merge evidence exists should the parent
   move to `done` with `INTEGRATION_STATUS=merged_to_dev` or the later verified
   integration status.

## Concrete Parent Next Step

`DEV-UI-RUNTIME-RELEASE-001` should resume on the already-pushed parent branch
`origin/codex/dev-ui-runtime-release-001 @ f1b66ae86`, not on this helper
branch.

Concrete next step:

1. Open a PR from `codex/dev-ui-runtime-release-001` to `dev`.
2. Record the PR URL in parent machine truth and note that the branch already
   carries the approved content.
3. Let `Codex2` review the PR/check state on that existing branch instead of
   waiting for any branch-history repair.
4. Close the parent only after merge evidence exists.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The existing parent branch remains the auditable source of truth.
- The helper task adds diagnosis evidence only and does not perturb the release
  branch.
- The unblock path reuses the normal protected-branch PR flow that machine
  truth already expected.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show DEV-UI-RUNTIME-RELEASE-001`
  - `AI_NAME=Codex scripts/ai-status.sh show DEV-UI-RUNTIME-RELEASE-001-UNBLOCK-HISTORY-REPAIR`
- Inspected refs, worktrees, and parent delta:
  - `git fetch origin --prune`
  - `git branch -vv | grep 'dev-ui-runtime-release-001'`
  - `git ls-remote --heads origin 'codex/dev-ui-runtime-release-001*'`
  - `git worktree list --porcelain`
  - `git merge-base origin/dev origin/codex/dev-ui-runtime-release-001`
  - `git rev-list --left-right --count origin/dev...origin/codex/dev-ui-runtime-release-001`
  - `git log --oneline origin/dev..origin/codex/dev-ui-runtime-release-001`
  - `git diff --name-only origin/dev..origin/codex/dev-ui-runtime-release-001`
  - `git diff --check origin/dev..origin/codex/dev-ui-runtime-release-001`
  - `git show --stat --summary --format=fuller f492b8442 f1b66ae86`
- Inspected PR state:
  - `gh pr list --head codex/dev-ui-runtime-release-001 --json number,title,state,headRefName,baseRefName,url`
  - `gh pr view codex/dev-ui-runtime-release-001 --json number,title,state,headRefName,baseRefName,url,isDraft,statusCheckRollup`

No runtime tests were run in this helper task. This repair is branch-history
triage and machine-truth routing only.

## Owner Closeout Evidence

- Review-approved helper closeout commit already pushed:
  `c27cbfe842ce3c12e38dfcfa90478e039a8e3c2a`
- Parent unblock path is now active on PR `#1181`:
  `https://github.com/ajoe734/drts-fleet-platform/pull/1181`
- This helper task's integration status remains `branch_pushed` because it
  contributes diagnosis evidence only; the merge/check lifecycle belongs to the
  parent release branch `codex/dev-ui-runtime-release-001`.
