# PH1GC-PROD-001 Unblock History Repair

## Scope

- Task: `PH1GC-PROD-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-PROD-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-05-23`

## Diagnosis

The parent is blocked by stale branch/worktree lineage, not by a missing
production-rail artifact or an unresolved planning decision.

1. The planning-semantics question was already closed by
   `PH1GC-PROD-001-UNBLOCK-PLANNING-DECISION` at
   `origin/codex2/ph1gc-prod-001-unblock-planning-decision @ 2ee4e0de`. Canonical
   machine truth now says the remaining parent blocker is external production
   readiness plus the first live deploy / rollback evidence run.
2. The accepted dry-run artifact set is already present on
   `origin/dev @ 0150cbe4`:
   `.github/workflows/deploy-prod.yml`,
   `docs/03-runbooks/production-deploy-rail-spec-20260519.md`,
   `docs/03-runbooks/production-rollback-drill-20260519.md`, and
   `support/sidecars/WF-PROD-001-LIVE-EXEC/`.
3. The only pushed parent-task branch is still
   `origin/codex2/ph1gc-prod-001 @ a7f88919`
   (`docs(PH1GC-PROD-001): finalize owner closeout`), but that branch is now
   `11` commits behind `origin/dev` and no longer contains the canonical branch
   tip that machine truth should reference for future live execution.
4. Two other task-stem branches still exist locally with different stale tips:
   `codex/ph1gc-prod-001 @ ad5d191e` and
   `claude2/ph1gc-prod-001 @ a7f88919`. Both still track `origin/dev` instead of
   task-specific remotes, so the same parent task name now resolves to multiple
   incompatible branch/worktree anchors.
5. The 2026-05-22 closeout log correctly fast-forwarded `a7f88919` into
   `origin/dev`, but `origin/dev` has since advanced `11` more commits while the
   task-specific parent branches stayed frozen on the old closeout SHA. That
   leaves the parent with correct artifact content on trunk but multiple stale
   historical branch anchors under the same task stem.

## Evidence

### Branch and worktree state

- `origin/dev @ 0150cbe4aa137d598bfaa4eb8156a6e3206ae35d`
- `origin/codex2/ph1gc-prod-001 @ a7f88919fd15385ff32d5f70f05c74d5b36d7122`
- local `codex/ph1gc-prod-001 @ ad5d191eac844f72d9b418f01f108bdeeaeda555`
- local `claude2/ph1gc-prod-001 @ a7f88919fd15385ff32d5f70f05c74d5b36d7122`
- local `codex/ph1gc-prod-001-unblock-planning-decision @ 6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- pushed planning-resolution helper branch:
  `origin/codex2/ph1gc-prod-001-unblock-planning-decision @ 2ee4e0de7bdfbd7f280571c1dceb2978ca0112c4`
- `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-prod-001`
  returns `11 0`, confirming the pushed parent branch is a stale ancestor of
  current `origin/dev`
- `git diff --name-only origin/dev..origin/codex2/ph1gc-prod-001` shows the
  stale parent branch diverges across unrelated control-plane files such as
  `.orchestrator/supervisor.py`, `scripts/ai_status.py`, `ai-status.json`, and
  `current-work.md`, so replaying review there would move the parent backward
  onto an old repo state
- `git diff --stat a7f88919 0150cbe4 -- .github/workflows/deploy-prod.yml docs/03-runbooks/production-deploy-rail-spec-20260519.md docs/03-runbooks/production-rollback-drill-20260519.md support/sidecars/WF-PROD-001-LIVE-EXEC`
  returns no output, confirming `origin/dev` retains the same production-rail
  artifact tree as the old closeout branch for the accepted paths
- `git branch -r --contains a7f88919` includes both `origin/dev` and
  `origin/codex2/ph1gc-prod-001`, confirming the old closeout commit is already
  merged into trunk and should be treated as historical ancestry rather than the
  current canonical execution rail
- `git branch -vv | grep 'ph1gc-prod-001'` shows:
  - `codex/ph1gc-prod-001` tracking `origin/dev` and behind by `15`
  - `claude2/ph1gc-prod-001` tracking `origin/dev` and behind by `11`
  - `codex2/ph1gc-prod-001` tracking `origin/codex2/ph1gc-prod-001`
  - this helper branch `codex/ph1gc-prod-001-unblock-history-repair` anchored
    on current `origin/dev`

### Machine-truth anchors

- Canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json` records
  parent `PH1GC-PROD-001` as:
  `blocked`, owner `Codex`, reviewer `Codex2`
- Canonical parent `next` already says the planning decision is resolved and the
  real remaining work is:
  operator-managed `PROD_*` variables/secrets, production GCP readiness, a
  deployable `prod/v<YYYY.MM.DD>.<N>` tag, and live smoke + rollback evidence
  under `support/sidecars/WF-PROD-001-LIVE-EXEC/`
- Canonical `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
  records:
  - `2026-05-22T09:52:36Z` handoff claiming `a7f88919` was pushed to
    `origin/codex2/ph1gc-prod-001` and fast-forwarded to `origin/dev`
  - current refs still confirm that merge, but the task-specific remote stopped
    at `a7f88919` while `origin/dev` moved ahead by `11` commits
  - `2026-05-23T15:02:01Z` parent resume from
    `PH1GC-PROD-001-UNBLOCK-PLANNING-DECISION`, which keeps the parent blocked
    externally rather than asking for more branch replay
- This helper task existed in machine truth before this commit, but the
  expected artifact path
  `support/unblock/PH1GC-PROD-001/PH1GC-PROD-001-UNBLOCK-HISTORY-REPAIR.md`
  did not exist on the assigned helper branch

## Exact Contamination

The contamination is a four-part mismatch:

1. The accepted production-rail artifacts already live on current `origin/dev`.
2. The only pushed task-specific parent branch still points at an older closeout
   SHA (`a7f88919`) that is no longer the canonical repo tip and is now `11`
   commits behind `origin/dev`.
3. Two additional local task-stem branches reuse the same parent name but point
   at different stale commits while still tracking `origin/dev`.
4. The planning-decision helper already resolved the semantic blocker, so there
   is no missing code to replay. The only remaining requirement is a concrete
   external operator handoff, but stale branch names still make it look as if
   the parent needs another branch-history replay.

This means the parent is not blocked by missing workflow/runbook/sidecar
content. It is blocked because the task stem still points at multiple historical
branch anchors even though the canonical artifact baseline has already moved to
`origin/dev`.

## Non-Destructive Repair Path

Do not force-push, rename, or resurrect any of the old parent-task branches.
Repair by freezing those branches as audit evidence and treating current
`origin/dev` as the canonical production-rail baseline.

1. Treat `origin/dev @ 0150cbe4` as the canonical parent artifact baseline for
   `PH1GC-PROD-001`. It already contains the accepted dry-run workflow, runbooks,
   and `WF-PROD-001-LIVE-EXEC` sidecar paths.
2. Leave `origin/codex2/ph1gc-prod-001 @ a7f88919`,
   local `codex/ph1gc-prod-001 @ ad5d191e`, and local
   `claude2/ph1gc-prod-001 @ a7f88919` untouched. They remain immutable evidence
   of how the task stem drifted across owner/reviewer worktrees.
3. Do not reopen review on `origin/codex2/ph1gc-prod-001`. That branch is a
   stale closeout rail and would reintroduce branch ambiguity instead of helping
   the first live production execution.
4. Keep the parent task in `blocked`, but pin the remaining next step to the
   concrete external operator handoff:
   - provision the required GitHub `PROD_*` variables and secrets
   - confirm production GCP project, WIF, Cloud SQL, Artifact Registry, Secret
     Manager, and GitHub `production` reviewer gate are ready
   - ensure origin has a deployable `prod/v<YYYY.MM.DD>.<N>` tag produced by the
     v4 publish/promote flow
   - dispatch `deploy-prod.yml` against that tag
   - publish live smoke results plus rollback-by-prior-prod-tag evidence under
     `support/sidecars/WF-PROD-001-LIVE-EXEC/`
5. After this helper task closes, any further movement on `PH1GC-PROD-001`
   should be a normal external-readiness unblock or a real live-execution
   evidence update, not another branch-history replay task.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The canonical production-rail artifact tree remains `origin/dev`.
- The old owner/reviewer branches stay available for audit and do not need to be
  deleted or rebased.
- The parent resumes only when the real external production prerequisites exist.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Compared related branch and worktree state:
  - `git branch -vv | grep 'ph1gc-prod-001'`
  - `git branch -r --contains a7f88919`
  - `git worktree list --porcelain`
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' refs/heads/codex/ph1gc-prod-001 refs/remotes/origin/codex/ph1gc-prod-001 refs/heads/codex/ph1gc-prod-001-unblock-history-repair refs/heads/codex2/ph1gc-prod-001 refs/remotes/origin/codex2/ph1gc-prod-001 refs/heads/claude2/ph1gc-prod-001`
- Confirmed stale parent-branch ancestry against current dev:
  - `git merge-base origin/dev origin/codex2/ph1gc-prod-001`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-prod-001`
  - `git diff --name-only origin/dev..origin/codex2/ph1gc-prod-001`
- Confirmed canonical artifacts already live on current dev:
  - `git ls-tree -r --name-only origin/dev -- .github/workflows/deploy-prod.yml docs/03-runbooks/production-deploy-rail-spec-20260519.md docs/03-runbooks/production-rollback-drill-20260519.md support/sidecars/WF-PROD-001-LIVE-EXEC`
  - `git diff --stat a7f88919 0150cbe4 -- .github/workflows/deploy-prod.yml docs/03-runbooks/production-deploy-rail-spec-20260519.md docs/03-runbooks/production-rollback-drill-20260519.md support/sidecars/WF-PROD-001-LIVE-EXEC`
