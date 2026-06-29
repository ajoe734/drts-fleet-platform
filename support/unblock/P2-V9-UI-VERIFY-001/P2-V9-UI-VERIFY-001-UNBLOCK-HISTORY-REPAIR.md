# P2-V9-UI-VERIFY-001 Unblock History Repair

## Scope

- Task: `P2-V9-UI-VERIFY-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-V9-UI-VERIFY-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-29T09:19:31Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-v9-ui-verify-001-unblock-history-repair`
- Assigned helper branch:
  `codex/p2-v9-ui-verify-001-unblock-history-repair`

## Diagnosis

`P2-V9-UI-VERIFY-001` was not blocked by missing UI evidence anymore. It was
blocked by the delivery rail pointing at the wrong shared branch history.

1. The original parent rail `origin/codex/p2-v9-ui-verify-001 @ 801aaf993ba17cff2da9a5ddaab6c746d29fdf39`
   is `0 behind / 5 ahead` of `origin/dev @ f40f7f620ffe37e8cd7ceb6ce4b04cee3f4f22b0`.
   Its five commits include two invalid closeout subjects:
   - `6418c0b479401c89ff07407d06629eec351451ec`
     `verify(P2-V9-UI-VERIFY-001): capture cross-surface evidence`
   - `a788bff49bc5db878e4bd921b3d4dc9df02b0dfd`
     `verify(P2-V9-UI-VERIFY-001): make smoke timeout reproducible`
2. `scripts/git/check_commit_trailers.py` accepts subjects matching
   `^(?:wip\()?[A-Z][A-Z0-9-]*[A-Z0-9]\)?: \S`, so `verify(...)` is rejected
   even when trailers are present. PR `#1006`
   (`codex/p2-v9-ui-verify-001 -> dev`) therefore failed `Commit trailers`,
   then closed without providing a valid integration path for the parent task.
3. The non-destructive replacement rail already exists remotely:
   `origin/codex/p2-v9-ui-verify-001-repair @ 201a0809dc1f421676ca8f737a238a005799c977`.
   It is `0 behind / 1 ahead` of the same `origin/dev` merge-base
   `f40f7f620ffe37e8cd7ceb6ce4b04cee3f4f22b0`, so it replays the verify packet
   on clean ancestry instead of rewriting the contaminated shared branch.
4. The repair commit is not a blind cherry-pick. Relative to the old parent
   branch, it also replaces
   `globalThis.IS_REACT_ACT_ENVIRONMENT = true` with `Reflect.set(...)` in
   `apps/driver-app/tests/unit/safety-operator-screen.test.ts` and refreshes
   `support/sidecars/P2-V9-UI-VERIFY-001/P2-V9-UI-VERIFY-001-EVIDENCE.md` plus
   20 screenshot binaries so the replayed rail is typecheck-safe and
   self-describing.
5. The replacement rail already has the correct PR evidence:
   draft PR `#1007`
   (`codex/p2-v9-ui-verify-001-repair -> dev`,
   <https://github.com/ajoe734/drts-fleet-platform/pull/1007>) is open and all
   reported checks are green, including `Commit trailers`, `Smoke acceptance`,
   `build`, `typecheck`, `e2e`, and `ci-integ`.

## Evidence

### Contaminated parent rail

- `origin/dev @ f40f7f620ffe37e8cd7ceb6ce4b04cee3f4f22b0`
- `origin/codex/p2-v9-ui-verify-001 @ 801aaf993ba17cff2da9a5ddaab6c746d29fdf39`
- `git rev-list --left-right --count origin/dev...origin/codex/p2-v9-ui-verify-001`
  returns `0 5`
- `git log --oneline origin/dev..origin/codex/p2-v9-ui-verify-001` shows:
  - `6f2db17d15ce60510ce6e4765bba3cde7f70b7c9`
    `wip(P2-V9-UI-VERIFY-001): anchor smoke harness`
  - `6418c0b479401c89ff07407d06629eec351451ec`
    `verify(P2-V9-UI-VERIFY-001): capture cross-surface evidence`
  - `1d62b31cd5768b2a8328b7a24f8022a3f90fb32d`
    `wip(P2-V9-UI-VERIFY-001): anchor verify smoke coverage and evidence`
  - `a788bff49bc5db878e4bd921b3d4dc9df02b0dfd`
    `verify(P2-V9-UI-VERIFY-001): make smoke timeout reproducible`
  - `801aaf993ba17cff2da9a5ddaab6c746d29fdf39`
    `P2-V9-UI-VERIFY-001: owner closeout after review approval`
- `gh pr view 1006 --json ...` shows:
  - PR `#1006`
  - state `CLOSED`
  - head `codex/p2-v9-ui-verify-001`
  - base `dev`
  - failed checks: `Commit trailers`, `typecheck`, `build`,
    `Smoke acceptance`, `ci-integ`

### Clean repair rail

- `origin/codex/p2-v9-ui-verify-001-repair @ 201a0809dc1f421676ca8f737a238a005799c977`
- `git rev-list --left-right --count origin/dev...origin/codex/p2-v9-ui-verify-001-repair`
  returns `0 1`
- `git merge-base origin/dev origin/codex/p2-v9-ui-verify-001`
  and
  `git merge-base origin/dev origin/codex/p2-v9-ui-verify-001-repair`
  both return `f40f7f620ffe37e8cd7ceb6ce4b04cee3f4f22b0`
- `git log --oneline origin/dev..origin/codex/p2-v9-ui-verify-001-repair`
  shows exactly one replay commit:
  - `201a0809dc1f421676ca8f737a238a005799c977`
    `P2-V9-UI-VERIFY-001: replay verify evidence on clean branch`
- `git diff --name-only origin/codex/p2-v9-ui-verify-001..origin/codex/p2-v9-ui-verify-001-repair`
  shows only:
  - `apps/driver-app/tests/unit/safety-operator-screen.test.ts`
  - `support/sidecars/P2-V9-UI-VERIFY-001/P2-V9-UI-VERIFY-001-EVIDENCE.md`
  - 20 screenshot files under
    `support/sidecars/P2-V9-UI-VERIFY-001/screenshots/`
- `gh pr view 1007 --json ...` shows:
  - PR `#1007`
  - state `OPEN`
  - draft `true`
  - head `codex/p2-v9-ui-verify-001-repair`
  - base `dev`
  - all reported checks `SUCCESS`

### Helper worktree

- `git worktree list --porcelain` shows the assigned helper worktree attached to
  `refs/heads/codex/p2-v9-ui-verify-001-unblock-history-repair`
- `git reflog show codex/p2-v9-ui-verify-001-unblock-history-repair`
  records `branch: Created from origin/dev`
- before this task writes its own evidence commit, the helper branch contains no
  parent replay commit and serves only as the diagnosis rail

## Exact Contamination

The exact contamination that kept the parent blocked was shared-history drift on
the original parent branch, not missing UI work:

1. The canonical parent branch
   `origin/codex/p2-v9-ui-verify-001 @ 801aaf993` carries five commits above
   `origin/dev`, including two `verify(...)` subjects that the trailer check
   rejects. That made PR `#1006` fail the integration gate and left the parent
   with no valid branch-level closeout path.
2. Because that branch and PR are already shared audit artifacts, force-pushing
   or rebasing them would repair the history only by destroying the evidence of
   why the gate failed. That is explicitly out of bounds for this task.
3. The replacement branch
   `origin/codex/p2-v9-ui-verify-001-repair @ 201a0809d` is the clean replay
   rail: one commit above the same `origin/dev` merge-base, with corrected
   subject shape and passing CI on PR `#1007`.

The parent was therefore blocked only because machine truth still pointed at the
failed `#1006` rail instead of the already-pushed `#1007` replay rail.

## Non-Destructive Repair Path

Do not force-push, amend, or rename any shared parent branch.

1. Freeze `origin/codex/p2-v9-ui-verify-001 @ 801aaf993` and closed PR `#1006`
   as audit-only contamination evidence.
2. Keep `origin/codex/p2-v9-ui-verify-001-repair @ 201a0809d` as the canonical
   replacement integration rail. It already contains the replayed task diff on
   clean ancestry.
3. Continue parent review and closeout only on PR `#1007`; do not reopen or
   force-update PR `#1006`.
4. Leave the helper branch
   `codex/p2-v9-ui-verify-001-unblock-history-repair` for diagnosis/status
   evidence only. It is not the parent delivery rail.
5. After reviewer approval on the repair rail, finalize the parent task with
   normal branch evidence:
   - `COMMIT_HASH=201a0809dc1f421676ca8f737a238a005799c977`
   - `COMMIT_SUBJECT=P2-V9-UI-VERIFY-001: replay verify evidence on clean branch`
   - `PUSH_REMOTE=origin`
   - `PUSH_BRANCH=codex/p2-v9-ui-verify-001-repair`
   - `INTEGRATION_STATUS=branch_pushed` until PR `#1007` is merged

## Concrete Parent Next Step

`P2-V9-UI-VERIFY-001` should stop waiting on the dead `#1006` rail and resume
from the clean replay rail immediately:

1. review `origin/codex/p2-v9-ui-verify-001-repair @ 201a0809d` via PR `#1007`
2. if the repair rail is accepted, move the parent back through reviewer
   approval on that SHA
3. owner finalizes the parent with `branch_pushed` evidence on
   `codex/p2-v9-ui-verify-001-repair`
4. only after that should any merge-to-`dev` / deploy claims be advanced

## Why This Is Safe

- no shared remote ref is rewritten
- no force-push is required
- the failed branch and closed PR remain intact for audit
- the clean replay rail is already pushed and reviewable
- the parent resumes through ordinary branch/PR/task-state transitions

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show P2-V9-UI-VERIFY-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-V9-UI-VERIFY-001`
- Inspected related refs and worktrees:
  - `git fetch origin --prune`
  - `git branch -vv --list 'codex/p2-v9-ui-*'`
  - `git worktree list --porcelain`
  - `git ls-remote --heads origin 'refs/heads/codex/p2-v9-ui-verify-001' 'refs/heads/codex/p2-v9-ui-verify-001-repair'`
  - `git reflog show --date=iso codex/p2-v9-ui-verify-001-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex/p2-v9-ui-verify-001`
  - `git rev-list --left-right --count origin/dev...origin/codex/p2-v9-ui-verify-001-repair`
  - `git merge-base origin/dev origin/codex/p2-v9-ui-verify-001`
  - `git merge-base origin/dev origin/codex/p2-v9-ui-verify-001-repair`
  - `git log --graph --decorate --oneline origin/dev..origin/codex/p2-v9-ui-verify-001`
  - `git log --graph --decorate --oneline origin/dev..origin/codex/p2-v9-ui-verify-001-repair`
  - `git diff --name-status origin/dev..origin/codex/p2-v9-ui-verify-001`
  - `git diff --name-status origin/dev..origin/codex/p2-v9-ui-verify-001-repair`
  - `git diff --name-only origin/codex/p2-v9-ui-verify-001..origin/codex/p2-v9-ui-verify-001-repair`
  - `git diff --unified=20 origin/codex/p2-v9-ui-verify-001..origin/codex/p2-v9-ui-verify-001-repair -- apps/driver-app/tests/unit/safety-operator-screen.test.ts support/sidecars/P2-V9-UI-VERIFY-001/P2-V9-UI-VERIFY-001-EVIDENCE.md`
- Inspected commit / PR evidence:
  - `git show -s --format=fuller 801aaf993`
  - `git show -s --format=fuller 201a0809d`
  - `grep -n 'SUBJECT_RE' -A4 -B2 scripts/git/check_commit_trailers.py`
  - `gh pr view 1006 --json number,state,title,headRefName,baseRefName,url,commits,statusCheckRollup`
  - `gh pr list --state all --head codex/p2-v9-ui-verify-001-repair --json number,state,title,url,headRefName,baseRefName`
  - `gh pr view 1007 --json number,state,title,headRefName,baseRefName,url,commits,statusCheckRollup,isDraft`
