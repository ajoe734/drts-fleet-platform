# IAM-UAT-001 Unblock History Repair

## Scope

- Task: `IAM-UAT-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-UAT-001`
- Owner: `Codex`
- Reviewer: `Gemini`
- Audit timestamp: `2026-08-04T00:21:15+00:00`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-uat-001-unblock-history-repair`
- Assigned helper branch:
  `codex/iam-uat-001-unblock-history-repair`

## Diagnosis

`IAM-UAT-001` is blocked by integration-history contamination, not by a missing
implementation tree. The canonical implementation branch already exists on the
shared remote, but the branch closeout and machine-truth blocker text drifted
away from the actual GitHub review rail:

1. The canonical implementation branch is `origin/codex/iam-uat-001 @
   dc4de71862f050bba08e9b85131d3290512798ba`.
2. That branch contains the full three-commit implementation history rooted on
   current `origin/dev`:
   - `2a335007 wip(IAM-UAT-001): anchor IAM negative matrix suite skeleton`
   - `ccfa4b26 IAM-UAT-001: harden IAM negative matrix gate`
   - `dc4de718 IAM-UAT-001: finalize durable session matrix closeout`
3. `git range-diff origin/dev..origin/codex/iam-uat-001
   origin/dev..codex/iam-uat-001` shows the local owner rail is identical to
   the remote rail; there is no hidden local-only commit anymore.
4. Historical GitHub evidence showed the original PR-create path failed with
   `422 must be a collaborator`, which is why the parent blocker text drifted
   into a "branch pushed, PR missing" state.
5. Parent machine truth currently says:
   `2026-08-03 branch closeout completed at dc4de718 on origin/codex/iam-uat-001, but integration closeout is blocked because GitHub PR creation to dev failed with 422 'must be a collaborator'; merge to origin/dev is still required before done.`
6. The activity log confirms that blockage came from a failed PR-create path,
   not from missing branch content:
   - `2026-08-03T06:43:18Z` parent `IAM-UAT-001` entered `blocked`
   - the branch was already pushed
   - the original PR-create attempt did not leave a usable GitHub review object
7. This helper task itself briefly suffered reassignment churn:
   - `2026-08-03T07:07:36Z` assigned to `Gemini` with reviewer `Codex`
   - sync failed because the intermediate state collided with the invalid
     owner=`Codex` / reviewer=`Codex` auto-generated pairing
   - `2026-08-03T07:09:13Z` canonical state settled on owner=`Codex`,
     reviewer=`Gemini`

## Evidence

### Canonical branch rail

- `git ls-remote --heads origin 'refs/heads/codex/iam-uat-001'` confirms:
  - `dc4de71862f050bba08e9b85131d3290512798ba refs/heads/codex/iam-uat-001`
- `git log --oneline --decorate --graph origin/dev..codex/iam-uat-001` shows:
  - `dc4de718 IAM-UAT-001: finalize durable session matrix closeout`
  - `ccfa4b26 IAM-UAT-001: harden IAM negative matrix gate`
  - `2a335007 wip(IAM-UAT-001): anchor IAM negative matrix suite skeleton`
- `git rev-list --left-right --count origin/dev...origin/codex/iam-uat-001`
  reports `1 3`, so the branch is three commits ahead of `origin/dev` and one
  commit behind it.

### PR rail restored on the canonical branch

- `gh pr view 1286 --json number,state,title,headRefName,baseRefName,url,mergeStateStatus` confirms:
  - PR `#1286` is `OPEN`
  - title: `IAM-UAT-001: finalize durable session matrix closeout`
  - head: `codex/iam-uat-001`
  - base: `dev`
  - URL: `https://github.com/ajoe734/drts-fleet-platform/pull/1286`
  - merge state: `BLOCKED`
- `gh pr view 1286 --json commits` shows the PR head remains
  `dc4de71862f050bba08e9b85131d3290512798ba`
- Therefore the repair path is now validated end-to-end: the canonical branch
  rail survived unchanged, and the missing review object has been restored as
  PR `#1286`.

### Closeout commit is a real code commit, not an empty marker

- `git diff-tree --no-commit-id --stat -r dc4de718` shows:
  - `apps/api/tests/integration/jwt-session-claims.integration.test.ts`
  - `support/sidecars/IAM-UAT-001/IAM-UAT-001-NEGATIVE-MATRIX.md`
- `git show --stat --summary dc4de718` confirms `dc4de718` changed repository
  content and recorded verification. It is not safe to discard or rewrite this
  commit just to clean up the history narrative.

### Sidecar evidence matches the pushed branch

- `git show dc4de718:support/sidecars/IAM-UAT-001/IAM-UAT-001-NEGATIVE-MATRIX.md`
  reports `Status: verified_for_closeout`
- `git show origin/codex/iam-uat-001:support/sidecars/IAM-UAT-001/IAM-UAT-001-NEGATIVE-MATRIX.md`
  returns the same closeout-ready packet now reachable on the remote branch
- The pushed rail therefore already carries the acceptance packet and rerun log
  that the parent task needs for review

## Exact Contamination

The contamination was a branch-closeout / integration-closeout split with stale
or incomplete GitHub review evidence:

1. The implementation branch is valid and already pushed.
2. The final closeout commit is part of that pushed branch and changes real
   content.
3. The original PR-create path failed, leaving machine truth stuck on stale
   "missing PR" evidence even though the branch itself was already canonical.
4. PR `#1286` now restores the clean review/merge rail into `dev` without any
   branch rewrite, so the remaining work is ordinary PR review / CI / merge.

## Non-Destructive Repair Path

Do not force-push `codex/iam-uat-001`. Do not replay the branch onto a second
"clean" owner rail unless the current branch later becomes unmergeable.

1. Treat `origin/codex/iam-uat-001 @ dc4de718...` as the canonical owner rail.
2. Use PR `#1286` as the restored integration object for that exact branch.
3. Keep the existing branch history intact; the repair is to preserve the
   canonical commit rail and continue through the normal PR path.
4. Re-run or confirm CI on PR `#1286` head `dc4de718...` if required.
5. Resume normal parent review/merge flow from the existing branch rather than
   from a new replay branch.
6. Merge to `dev` through the standard non-force route once PR review and CI are
   satisfied.

## Concrete Parent Next Step

As of `2026-08-04`, `IAM-UAT-001` can proceed on its existing pushed branch via
the restored PR rail:

1. Use `codex/iam-uat-001 @ dc4de718...` as the branch to review and merge.
2. Continue review on PR `#1286` targeting `dev`.
3. Re-run or confirm PR CI on `dc4de718...`.
4. Merge the same PR to `origin/dev` through the normal non-force path once
   approvals and CI are satisfied, then re-run parent
   `done` with `INTEGRATION_STATUS=merged_to_dev` and merge evidence.

No clean replay branch is currently required.

## Reviewer Verification & Status Update

- Review approval timestamp: `2026-08-04T00:21:15Z`
- Reviewer outcome: `review_approved`
- Verified GitHub state:
  - PR `#1286` is `OPEN` on `codex/iam-uat-001` targeting `dev`
  - PR head SHA remains `dc4de71862f050bba08e9b85131d3290512798ba`
  - No force-push or history rewrite was required to restore the review rail
- Closeout conclusion:
  - The unblock task has validated the canonical branch rail, documented the
    historical contamination, and confirmed the clean integration route now runs
    through PR `#1286`.
  - Parent task `IAM-UAT-001` can proceed using the existing branch and PR.

## Why This Is Safe

- No shared branch history is rewritten.
- No force-push is required.
- The pushed implementation branch remains the sole canonical owner rail.
- The final closeout commit stays preserved because it contains real code and
  evidence changes.
- The parent task gets an exact next step: restore the PR object, not the code
  branch.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Read `docs/ops/branch-strategy.md` with focus on §11
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-UAT-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-UAT-001`
- Inspected local / remote branch state:
  - `git branch --show-current`
  - `git fetch origin --prune`
  - `git branch -vv | rg 'iam-uat-001'`
  - `git worktree list --porcelain`
  - `git log --oneline --decorate --graph --max-count=40 origin/dev..codex/iam-uat-001`
  - `git rev-list --left-right --count origin/dev...codex/iam-uat-001`
  - `git rev-list --left-right --count origin/dev...origin/codex/iam-uat-001`
  - `git range-diff origin/dev..origin/codex/iam-uat-001 origin/dev..codex/iam-uat-001`
  - `git reflog show --date=iso codex/iam-uat-001`
  - `git ls-remote --heads origin 'refs/heads/codex/iam-uat-001' 'refs/heads/codex/iam-uat-001-unblock-history-repair'`
  - `git diff-tree --no-commit-id --stat -r dc4de718`
  - `git show --stat --summary 2a335007`
  - `git show --stat --summary ccfa4b26`
  - `git show --stat --summary dc4de718`
  - `git show origin/codex/iam-uat-001:support/sidecars/IAM-UAT-001/IAM-UAT-001-NEGATIVE-MATRIX.md`
  - `git show dc4de718:support/sidecars/IAM-UAT-001/IAM-UAT-001-NEGATIVE-MATRIX.md`
- Inspected GitHub review state:
  - `gh pr view 1286 --json number,title,state,url,headRefName,baseRefName,isDraft,mergeStateStatus,reviewDecision,commits`
  - Verified PR `#1286` is `OPEN` on `codex/iam-uat-001` @ `dc4de71862f050bba08e9b85131d3290512798ba`
- Inspected canonical activity / dashboard excerpts:
  - `rg -n -C 2 'IAM-UAT-001|must be a collaborator|codex/iam-uat-001' /home/lupin/drts-fleet-platform/current-work.md /home/lupin/drts-fleet-platform/ai-activity-log.jsonl`

No application code, production config, or runtime behavior was changed by this
helper task. This repair is limited to branch / PR history evidence and
machine-truth clarification.
