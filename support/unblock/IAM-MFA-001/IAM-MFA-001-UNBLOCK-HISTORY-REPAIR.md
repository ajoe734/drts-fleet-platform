# IAM-MFA-001 Unblock History Repair

## Scope

- Task: `IAM-MFA-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-MFA-001`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-08-04T14:18:18Z`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-mfa-001-unblock-history-repair`
- Assigned helper branch:
  `codex/iam-mfa-001-unblock-history-repair`

## Diagnosis

The prior unblock artifact is stale and now points at the wrong rail.
`codex2/iam-mfa-001 @ c317d836` is no longer the live owner rail. The active
implementation history moved to `codex/iam-mfa-001`, then to
`codex/iam-mfa-001-integration`, and both open PR attempts carried contaminated
history that fails the trailer gate without any force-push-safe repair path on
those shared branches.

As of `2026-08-04` the only safe repair is to keep the contaminated rails as
audit evidence, rebuild the task content onto a fresh branch from `origin/dev`,
and continue integration from that new clean rail.

## Current Evidence

### Canonical contaminated owner rail

- remote branch: `origin/codex/iam-mfa-001 @ b78dcb2e7e53f0def6bb4eac9ca2bb659d6bfae7`
- open PR: `#1287` `codex/iam-mfa-001 -> dev`
- `gh pr view 1287 --json commits,statusCheckRollup` shows:
  - head pinned at `b78dcb2e`
  - `Commit trailers` failed at run `30882208407`
  - failing commits are:
    - `b78dcb2e` subject `fix(IAM-MFA-001): gate runtime step-up helper`
    - `9a492365` subject `closeout(IAM-MFA-001): finalize approved MFA step-up policy`
    - merge commits `8a92da2f`, `2183f4d8`, `6be53f18` missing required trailers
- this rail is `4` commits ahead and `29` behind `origin/dev`

### Superseded intermediate clean-up attempt

- remote branch:
  `origin/codex/iam-mfa-001-integration @ 91c19366019ffe9e28f0f256c32d9218ef813ef2`
- open PR: `#1293` `codex/iam-mfa-001-integration -> dev`
- `gh pr view 1293 --json commits,statusCheckRollup` shows:
  - commit history removed the merge commits
  - `Commit trailers` still failed at run `30882247205`
  - the remaining failure is only commit `91c19366` subject
    `fix(IAM-MFA-001): gate runtime step-up helper`
- this rail is `6` commits ahead and `3` behind `origin/dev`
- tree diff versus `b78dcb2e` is still non-empty:
  `16 files changed, 855 insertions, 16 deletions`
- conclusion: cleaner than `#1287`, but not yet a valid canonical integration
  rail

### New clean integration rail

- remote branch:
  `origin/codex/iam-mfa-001-clean-route @ e3ecc0a0ee6db9258358c25cf096ad032b054aea`
- open PR: `#1303` `codex/iam-mfa-001-clean-route -> dev`
- commits on the clean rail:
  - `c0c283d2` `IAM-MFA-001: integrate MFA step-up policy to dev`
  - `42b08904` `IAM-MFA-001: refresh step-up bearer-path integration`
  - `e3ecc0a0` `IAM-MFA-001: gate runtime step-up helper`
- local validation on the clean rail:
  - `python3 scripts/git/check_commit_trailers.py --base origin/dev --head HEAD`
    => `3 commit(s) OK.`
  - `git rev-list --left-right --count origin/dev...HEAD` => `0 3`
  - `gh pr view 1303 --json statusCheckRollup` at `2026-08-04T14:18:18Z`
    shows `Commit trailers = SUCCESS`
- PR `#1303` is the first rail that:
  - starts directly from `origin/dev`
  - avoids merge commits from prior contaminated rails
  - keeps only `<TASK-ID>: <summary>` commit subjects
  - passes the GitHub trailer gate without rewriting shared history

## Exact Contamination

The contamination was no longer a simple stale same-tree branch problem.
By `2026-08-04` it had become a three-rail integration split:

1. `#1287` used the historical owner branch and accumulated merge commits plus
   two invalid subjects, making trailer repair impossible without force-pushing
   or abandoning the PR.
2. `#1293` rebuilt part of the history but still retained one invalid
   `fix(IAM-MFA-001): ...` subject, so the trailer gate still failed.
3. Parent machine truth still said `IAM-MFA-001` was `done` with
   `integration_status=not_applicable` even though the real integration state
   was an open PR with failed CI history.

That combination meant a future worker could pick the wrong PR, assume the
parent was already integrated, or keep retrying CI on history that can never
pass the trailer gate as-is.

## Non-Destructive Repair Path

Do not force-push any existing branch. Do not rewrite `codex/iam-mfa-001`,
`codex/iam-mfa-001-integration`, or their PR history.

1. Treat `#1287` and `#1293` as audit evidence only.
2. Treat `codex/iam-mfa-001-clean-route @ e3ecc0a0` and PR `#1303` as the only
   canonical clean integration route.
3. Continue review and CI only on `#1303`.
4. Keep the older branches/PRs open only long enough for reviewers to cross-map
   evidence, then close them without merging once `#1303` becomes the accepted
   integration rail.
5. Do not move the parent forward as integrated until machine truth references
   the clean rail rather than the contaminated rails.

## Parent Resume Contract

`IAM-MFA-001` must not stay `done` with `integration_status=not_applicable`.
The unblock result proves the parent still needs active integration follow-up.

When this unblock task is finalized, the parent should be resumed via the
automatic `helper_parent` handoff with:

- `PARENT_STATUS=in_progress`
- `PARENT_NEXT` describing `#1303` as the canonical clean route and explicitly
  calling out that `#1287` / `#1293` are superseded contaminated attempts

That is the machine-truth proof that the parent can proceed only after the
canonical evidence is updated.

## Validation Status

### What is now validated

- a force-push-free repair path exists
- the repaired path is materialized as branch
  `codex/iam-mfa-001-clean-route`
- the repaired path is materialized as PR `#1303`
- the repaired path passes the `Commit trailers` GitHub gate

### What is still pending on the new clean rail

At `2026-08-04T14:18:18Z`, PR `#1303` still has in-flight integration checks
(`build`, `unit`, `integration`, `iam-negative-matrix`, `e2e`, etc.).
This task repairs history contamination; it does not claim those broader suites
have already passed.

## Why This Is Safe

- no shared branch was rewritten
- no force-push was used
- contaminated rails remain preserved for audit
- the clean route is reproducible from `origin/dev` plus three explicit commits
- the new canonical route is already recognized by GitHub as trailer-compliant

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Read `docs/ops/branch-strategy.md`
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-MFA-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-MFA-001`
  - `AI_NAME=Codex scripts/ai-status.sh progress IAM-MFA-001-UNBLOCK-HISTORY-REPAIR "..."`
- Inspected contaminated rails and PRs:
  - `gh pr view 1287 --json number,title,state,url,headRefName,baseRefName,headRefOid,commits,statusCheckRollup,mergeable,reviewDecision,updatedAt`
  - `gh pr view 1293 --json number,title,state,url,headRefName,baseRefName,headRefOid,commits,statusCheckRollup,mergeable,reviewDecision,updatedAt`
  - `gh run view 30882208407 --log-failed`
  - `gh run view 30882247205 --log-failed`
  - `gh run view 30882247215 --job 91905876695 --log-failed`
  - `gh run view 30882247215 --job 91905876663 --log-failed`
- Rebuilt the clean rail in a temporary worktree from `origin/dev`:
  - `git worktree add -b codex/iam-mfa-001-clean-route /tmp/iam-mfa-001-clean-route origin/dev`
  - `git cherry-pick a398dcd03a09f61fff145eae581904a9628b3ccb`
  - `git cherry-pick 7e3e7603516756cd20b461219be5f3a302c7f126`
  - `git cherry-pick --no-commit 91c19366019ffe9e28f0f256c32d9218ef813ef2`
  - recommitted as
    `IAM-MFA-001: gate runtime step-up helper`
- Validated and published the clean rail:
  - `python3 scripts/git/check_commit_trailers.py --base origin/dev --head HEAD`
  - `git push -u origin codex/iam-mfa-001-clean-route`
  - `gh pr create --base dev --head codex/iam-mfa-001-clean-route ...`
  - `gh pr view 1303 --json number,title,state,url,headRefName,baseRefName,headRefOid,commits,statusCheckRollup,mergeable,updatedAt`

## Verification Limits

- `pnpm exec vitest ...` could not be rerun inside `/tmp/iam-mfa-001-clean-route`
  because that temporary worktree did not have an immediately resolvable
  `vitest` binary (`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "vitest" not found`)
- this task therefore relies on:
  - original commit verification trailers already recorded on the replayed
    commits
  - fresh local trailer validation
  - live GitHub `Commit trailers` success on `#1303`
