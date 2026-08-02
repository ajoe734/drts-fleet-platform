# IAM-P0-006 Unblock History Repair

## Scope

- Task: `IAM-P0-006-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-P0-006`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-08-02T04:45:00+00:00`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex2-iam-p0-006-unblock-history-repair`
- Assigned helper branch:
  `codex2/iam-p0-006-unblock-history-repair`

## Diagnosis

`IAM-P0-006` is blocked by branch / closeout rail contamination, not by a
missing security fix.

1. The canonical parent owner branch is local `codex2/iam-p0-006 @
   ab68a8be8104b3bfaeedb70c1e5d3602d3317292`, and it already contains the full
   approved closeout sequence through
   `closeout(IAM-P0-006): finalize review-approved bootstrap authority removal`.
2. The pushed remote branch `origin/codex2/iam-p0-006 @
   714255af09806cd2d95be108647c0587f8e79e46` is an older ancestor. It stops
   before the later strict-sanitize, normalization, and review-approved closeout
   commits.
3. `git merge-base --is-ancestor origin/codex2/iam-p0-006 codex2/iam-p0-006`
   exits `0`, so the local parent branch can still be pushed with a normal
   non-force fast-forward. Shared history is not corrupted in a way that
   requires rewrite.
4. The helper branch assigned for this unblock task,
   `codex2/iam-p0-006-unblock-history-repair`, was created directly from
   `origin/dev` and still pointed at `da8f9f79a93c9acc0a131fbb0e7993adb5d048c6`
   with no task artifact before this repair. That left no owner-aligned
   canonical evidence for the unblock diagnosis.
5. No PR currently exists for either `codex2/iam-p0-006` or
   `codex2/iam-p0-006-unblock-history-repair`. The parent is therefore blocked
   by missing integration progression, not by a broken or conflicting PR rail.
6. The parent task's machine-truth `next` already describes the real closeout
   gate: `scripts/ai-status.sh done` rejects `INTEGRATION_STATUS=branch_pushed`
   for canonical tasks until the delivered commit becomes reachable from
   `origin/dev` per [docs/ops/branch-strategy.md](/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex2-iam-p0-006-unblock-history-repair/docs/ops/branch-strategy.md:406).

## Evidence

### Parent branch state

- `origin/dev @ da8f9f79a93c9acc0a131fbb0e7993adb5d048c6`
- `origin/codex2/iam-p0-006 @ 714255af09806cd2d95be108647c0587f8e79e46`
- local `codex2/iam-p0-006 @ ab68a8be8104b3bfaeedb70c1e5d3602d3317292`
- helper branch before this repair:
  `codex2/iam-p0-006-unblock-history-repair @ da8f9f79a93c9acc0a131fbb0e7993adb5d048c6`
- `git rev-list --left-right --count origin/dev...codex2/iam-p0-006`
  returns `4 16`
- `git rev-list --left-right --count origin/dev...codex2/iam-p0-006-unblock-history-repair`
  returns `0 0`
- `git merge-base --is-ancestor ab68a8be origin/dev` exits `1`, confirming the
  approved closeout commit is not yet reachable from `origin/dev`
- `git merge-base --is-ancestor origin/codex2/iam-p0-006 codex2/iam-p0-006`
  exits `0`, confirming a normal push remains possible

### Exact history split

- `git log --oneline origin/dev..codex2/iam-p0-006` shows the full unpublished
  parent sequence:
  - `ab68a8be closeout(IAM-P0-006): finalize review-approved bootstrap authority removal`
  - `c91566e6 closeout(IAM-P0-006): finalize review-approved owner closeout`
  - `628a7f8c fix(IAM-P0-006): normalize partial tenant partner state`
  - `04a3cb2d fix(IAM-P0-006): persist strict sanitize deletions`
  - `388170c0 fix(IAM-P0-006): reject mixed bootstrap fast paths and persist strict sanitize`
  - earlier branch-local ancestry back to `cc688c31`
- `git log --oneline codex2/iam-p0-006..origin/dev` shows the helper branch has
  no parent evidence at all because it is still exactly at `origin/dev`
- `git log --graph --oneline origin/codex2/iam-p0-006 codex2/iam-p0-006 origin/dev`
  shows `origin/codex2/iam-p0-006` on the older ancestry line while
  `codex2/iam-p0-006-unblock-history-repair` follows `origin/dev`

### Closeout / gate evidence

- `git show -s --format=fuller ab68a8be` confirms the approved closeout commit
  already includes:
  - `LLM-Agent: Codex2`
  - `Task-ID: IAM-P0-006`
  - `Reviewer: Codex`
  - `Verification: review-approved; pnpm --filter @drts/api exec vitest run ...`
- `AI_NAME=Codex2 scripts/ai-status.sh show IAM-P0-006` reports the parent is
  still `blocked` and already names the concrete gate:
  merge `codex2/iam-p0-006` so `ab68a8be` becomes reachable from `origin/dev`,
  then finalize with `merged_to_dev` or `dev_deployed` evidence
- `gh pr list --head codex2/iam-p0-006 --state all ...` returns `[]`
- `gh pr list --head codex2/iam-p0-006-unblock-history-repair --state all ...`
  returns `[]`

### Helper branch contamination

- The assigned helper branch was not carrying this task's artifact at all.
- The artifact path named by machine truth,
  `support/unblock/IAM-P0-006/IAM-P0-006-UNBLOCK-HISTORY-REPAIR.md`, did not
  exist before this change.
- That means the unblock task itself had branch/worktree drift: the worker rail
  existed, but the canonical helper evidence only lived in chat and machine
  status, not on the assigned branch.

## Exact Contamination

The contamination that keeps the parent blocked is a three-part mismatch:

1. The canonical parent branch with approved commits exists only locally on
   `codex2/iam-p0-006 @ ab68a8be...`, while the remote task branch remains on
   stale ancestor `714255af...`.
2. The helper branch `codex2/iam-p0-006-unblock-history-repair` was created
   from `origin/dev` and carried no task artifact, so the unblock diagnosis had
   no owner-aligned pushed evidence.
3. The closeout state was previously interpreted as if branch push alone could
   finish the parent, but the enforced integration gate requires the delivered
   commit to reach `origin/dev` before the parent can become `done`.

This is history/provenance contamination, not code-content contamination.
Nothing here requires force-pushing or rewriting a shared branch.

## Non-Destructive Repair Path

Do not force-push `codex2/iam-p0-006`. Do not rewrite or squash shared history.

1. Keep local `codex2/iam-p0-006 @ ab68a8be...` as the canonical parent owner
   rail.
2. Push that parent branch normally so the remote catches up to the already
   approved local history:

```bash
git switch codex2/iam-p0-006
git push -u origin codex2/iam-p0-006
```

3. After the normal push, open a PR from `codex2/iam-p0-006` to `dev` if the
   integration still needs a review/merge rail:

```bash
gh pr create \
  --base dev \
  --head codex2/iam-p0-006 \
  --title "IAM-P0-006: remove bootstrap identity and mock authority from strict environments" \
  --body "Promotes already reviewed closeout commit ab68a8be8104b3bfaeedb70c1e5d3602d3317292 to dev without force-push. Parent task remains blocked only on integration reachability per docs/ops/branch-strategy.md §11.6."
```

4. Merge that parent branch to `dev` through the normal integration flow. Only
   once `ab68a8be...` is reachable from `origin/dev` should the parent attempt
   final `done` closeout with `INTEGRATION_STATUS=merged_to_dev` or
   `INTEGRATION_STATUS=dev_deployed`.
5. Keep this helper branch scoped to documentation and machine-truth repair
   only. Its role is to record the diagnosis and unblock instructions, not to
   modify the parent implementation history.

## Concrete Parent Next Step

As of `2026-08-02`, the parent `IAM-P0-006` should resume with this exact next
step:

1. Push local `codex2/iam-p0-006 @ ab68a8be8104b3bfaeedb70c1e5d3602d3317292`
   to `origin/codex2/iam-p0-006` using a normal non-force push.
2. Open or resume the `codex2/iam-p0-006 -> dev` PR on that pushed head.
3. Merge the branch so `ab68a8be...` becomes reachable from `origin/dev`.
4. Re-run parent finalization only after reachability is true, using
   `INTEGRATION_STATUS=merged_to_dev` or stronger evidence.

## Why This Is Safe

- No shared history is rewritten.
- The stale remote parent branch can be repaired by fast-forward push.
- The parent implementation commits stay intact.
- The integration gate in §11.6 is respected instead of bypassed.
- The helper task now has owner-aligned canonical evidence on its assigned
  branch.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Read `.orchestrator/skills/task-closeout-finalization.md`
- Read `docs/ops/branch-strategy.md` with focus on §11.6
- Checked machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show IAM-P0-006-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex2 scripts/ai-status.sh show IAM-P0-006`
- Inspected refs and history:
  - `git branch --show-current`
  - `git status --short`
  - `git worktree list --porcelain`
  - `git branch -vv | rg 'iam-p0-006'`
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' refs/heads refs/remotes/origin | rg 'iam-p0-006|origin/dev$'`
  - `git merge-base --is-ancestor ab68a8be origin/dev`
  - `git merge-base --is-ancestor origin/codex2/iam-p0-006 codex2/iam-p0-006`
  - `git rev-list --left-right --count origin/dev...codex2/iam-p0-006`
  - `git rev-list --left-right --count origin/dev...codex2/iam-p0-006-unblock-history-repair`
  - `git log --graph --decorate --oneline --max-count=40 --all --branches='codex2/iam-p0-006' --branches='origin/codex2/iam-p0-006' --branches='dev' --branches='origin/dev'`
  - `git log --oneline --decorate origin/dev..codex2/iam-p0-006`
  - `git log --oneline --decorate codex2/iam-p0-006..origin/dev`
  - `git log --oneline --decorate --graph --max-count=20 origin/codex2/iam-p0-006 codex2/iam-p0-006 origin/dev`
  - `git show -s --format=fuller ab68a8be`
  - `git rev-parse origin/dev origin/codex2/iam-p0-006 codex2/iam-p0-006 codex2/iam-p0-006-unblock-history-repair`
- Inspected PR presence:
  - `gh pr list --head codex2/iam-p0-006 --state all --json number,title,headRefName,headRefOid,baseRefName,state,url`
  - `gh pr list --head codex2/iam-p0-006-unblock-history-repair --state all --json number,title,headRefName,headRefOid,baseRefName,state,url`

No application code changed and no runtime tests were rerun in this helper
task. This repair is limited to branch-history evidence and machine-truth
unblock guidance.
