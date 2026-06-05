# E2E-FLEET-014 Unblock History Repair

## Scope

- Task: `E2E-FLEET-014-UNBLOCK-HISTORY-REPAIR`
- Parent: `E2E-FLEET-014`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-05T07:30:20Z`

## Diagnosis

The parent is not blocked by missing task commits. It is blocked by an
upstream staging credential failure, while this helper dispatch was created on
the wrong branch history and therefore could not safely serve as the parent's
resume rail.

1. The actual parent owner branch already exists locally and on origin as
   `codex2/e2e-fleet-014 @ b47f4874d5a6876557215d22adf9aefc7cf768c6` with four
   task commits on top of `origin/dev`.
2. The assigned helper branch
   `codex2/e2e-fleet-014-unblock-history-repair @ 1a5f8b86f48e9c5cacedd3cf9cbe15964216ede4`
   is exactly equal to `origin/dev`, not descended from the pushed parent tip.
3. The helper worktree therefore omits every parent task commit:
   `e4da426b`, `a6012dda`, `2607ee4b`, and `b47f4874`.
4. `git worktree list --porcelain` shows separate worktrees for the parent
   branch and this helper branch, but the helper branch points at the wrong
   commit, so reopening work from this worktree would silently drop the parent
   task history.
5. Canonical machine truth already records the real blocker on the parent:
   Deploy - Staging run `27001535952` failed at
   `Build & push images -> Authenticate to GCP` because
   `google-github-actions/auth` returned `invalid_target` for the configured
   staging WIF provider. History ambiguity needs to be isolated so the parent
   can return to that actual upstream blocker.

## Evidence

### Branch and worktree state

- `origin/dev @ 1a5f8b86f48e9c5cacedd3cf9cbe15964216ede4`
- local + remote parent branch
  `codex2/e2e-fleet-014 @ b47f4874d5a6876557215d22adf9aefc7cf768c6`
- local helper branch
  `codex2/e2e-fleet-014-unblock-history-repair @ 1a5f8b86f48e9c5cacedd3cf9cbe15964216ede4`
  with upstream `origin/dev`
- local planning helper branch
  `codex2/e2e-fleet-014-unblock-planning-decision @ ec759b8e740e5c9883ce2db2021e5cc8446f6075`
- `git rev-list --left-right --count origin/dev...codex2/e2e-fleet-014`
  returns `0 4`, confirming the parent branch contains four commits beyond
  current trunk.
- `git rev-list --left-right --count origin/dev...codex2/e2e-fleet-014-unblock-history-repair`
  returns `0 0`, confirming the helper branch is only `origin/dev`.
- `git merge-base origin/dev codex2/e2e-fleet-014`
  returns `1a5f8b86f48e9c5cacedd3cf9cbe15964216ede4`, proving the parent branch
  is a clean descendant of current trunk.
- `git rev-parse codex2/e2e-fleet-014-unblock-history-repair`
  returns the same SHA as `origin/dev`, proving the helper branch is anchored
  to the wrong history.
- `git worktree list --porcelain | grep -nA2 -B1 'codex2/e2e-fleet-014'`
  shows:
  - `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-e2e-fleet-014`
    on `b47f4874`
  - `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-e2e-fleet-014-unblock-history-repair`
    on `1a5f8b86`

### Parent provenance

- `git log --oneline codex2/e2e-fleet-014 --not origin/dev` returns the four
  parent commits:
  - `e4da426b` `wip(E2E-FLEET-014): anchor e2e shell`
  - `a6012dda` `wip(E2E-FLEET-014): harden e2e curl failure path`
  - `2607ee4b` `wip(E2E-FLEET-014): anchor staging e2e workflow`
  - `b47f4874` `wip(E2E-FLEET-014): anchor deploy-staging e2e hook`
- `git show --stat --summary b47f4874` confirms the pushed parent tip moved the
  E2E trigger into `.github/workflows/deploy-staging.yml` and deleted the
  separate `.github/workflows/e2e-staging.yml`.

### PR visibility

- `gh pr list --head codex2:codex2/e2e-fleet-014 --state all ...` returns `[]`
- `gh pr list --head codex2:codex2/e2e-fleet-014-unblock-history-repair --state all ...`
  returns `[]` before this repair branch is pushed

## Exact Contamination

The contamination is a four-part mismatch:

1. The real task history already lives on the pushed parent branch
   `origin/codex2/e2e-fleet-014`.
2. The helper branch name with the `-unblock-history-repair` stem was created
   from `origin/dev` and configured to track `origin/dev`, not the parent
   branch.
3. The helper worktree therefore looks legitimate by path and branch name while
   actually omitting all four parent task commits.
4. If the parent owner resumed from this helper branch, any new commit or push
   would fork from trunk and bypass the accepted parent history, creating a
   false repair rail and compounding the real staging blocker.

This is branch/worktree/commit contamination, not missing feature work.

## Non-Destructive Repair Path

Do not force-push, rebase, or rewrite any shared branch.

1. Treat `origin/codex2/e2e-fleet-014 @ b47f4874d5a6876557215d22adf9aefc7cf768c6`
   as the only valid owner branch for `E2E-FLEET-014`.
2. Preserve this helper branch only as the audit rail that records the
   contamination report. It should not be used for parent implementation,
   reopen, or closeout work.
3. Push this helper branch normally so the evidence is reviewable without
   rewriting any existing ref.
4. Update the parent machine-truth `next` field to say the history ambiguity is
   resolved and the remaining next step is to resume from
   `origin/codex2/e2e-fleet-014 @ b47f4874...` after the staging WIF
   `invalid_target` blocker is fixed.
5. Keep the parent status blocked on the upstream credential issue, not on this
   helper branch mismatch.

## Current Unblocked Next Step For Parent

Resume `E2E-FLEET-014` from the existing pushed owner branch
`origin/codex2/e2e-fleet-014 @ b47f4874d5a6876557215d22adf9aefc7cf768c6`
after the staging GCP Workload Identity Federation provider is corrected.
Do not resume from `codex2/e2e-fleet-014-unblock-history-repair`.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The pushed parent branch remains unchanged and canonical.
- The helper branch becomes auditable evidence instead of a hidden wrong-rail
  worktree.
- The parent can return to its real upstream blocker with an explicit safe
  resume branch.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine state:
  - `AI_NAME=Codex2 scripts/ai-status.sh show E2E-FLEET-014`
  - `AI_NAME=Codex2 scripts/ai-status.sh show E2E-FLEET-014-UNBLOCK-HISTORY-REPAIR`
- Compared refs and ancestry:
  - `git fetch origin`
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' 'refs/heads/codex2/e2e-fleet-014*'`
  - `git rev-list --left-right --count origin/dev...codex2/e2e-fleet-014`
  - `git rev-list --left-right --count origin/dev...codex2/e2e-fleet-014-unblock-history-repair`
  - `git merge-base origin/dev codex2/e2e-fleet-014`
  - `git rev-parse codex2/e2e-fleet-014`
  - `git rev-parse codex2/e2e-fleet-014-unblock-history-repair`
  - `git log --oneline codex2/e2e-fleet-014 --not origin/dev`
- Confirmed worktree separation and current PR visibility:
  - `git worktree list --porcelain | grep -nA2 -B1 'codex2/e2e-fleet-014'`
  - `gh pr list --head codex2:codex2/e2e-fleet-014 --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
  - `gh pr list --head codex2:codex2/e2e-fleet-014-unblock-history-repair --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
