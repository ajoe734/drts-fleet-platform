# PH1GC-PROD-001 Unblock History Repair

## Scope

- Task: `PH1GC-PROD-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-PROD-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-05-23`

## Diagnosis

The parent is blocked by branch/worktree identity drift, not by a missing
production-rail artifact or an unresolved planning decision.

1. The planning-semantics question was already closed by
   `PH1GC-PROD-001-UNBLOCK-PLANNING-DECISION` at
   `origin/codex2/ph1gc-prod-001-unblock-planning-decision @ 2ee4e0de`. Canonical
   machine truth already says the remaining parent blocker is external
   production readiness plus the first live deploy / rollback evidence run.
2. The accepted dry-run artifact set is already present on
   `origin/dev @ 0150cbe4`:
   `.github/workflows/deploy-prod.yml`,
   `docs/03-runbooks/production-deploy-rail-spec-20260519.md`,
   `docs/03-runbooks/production-rollback-drill-20260519.md`, and
   `support/sidecars/WF-PROD-001-LIVE-EXEC/`.
3. A prior helper lane already documented the unblock path on
   `origin/codex/ph1gc-prod-001-unblock-history-repair @ f24304a0`, but the
   expected `codex2/ph1gc-prod-001-unblock-history-repair` branch did not exist
   on origin.
4. The supervisor-assigned local branch
   `codex2/ph1gc-prod-001-unblock-history-repair` was then auto-created from
   `origin/dev` at `2026-05-23 15:33:45 +0000`, so this worktree initially
   landed on `0150cbe4` instead of a task-specific unblock commit.
5. That initial local tip `0150cbe4` is also the tip of
   `codex/ph1gc-e2e-011-unblock-history-repair`, proving the assigned worktree
   shared another task's branch ancestry rather than a unique PH1GC-PROD-001
   history-repair anchor.
6. The only pushed parent-task branch is still
   `origin/codex2/ph1gc-prod-001 @ a7f88919`
   (`docs(PH1GC-PROD-001): finalize owner closeout`), but that branch is now a
   stale ancestor of `origin/dev` and no longer names the canonical execution
   rail for future live production work.

## Evidence

### Branch and worktree state

- `origin/dev @ 0150cbe4e56505854d375211e25d2ab82e948fc0`
- `origin/codex2/ph1gc-prod-001 @ a7f88919fd15385ff32d5f70f05c74d5b36d7122`
- `origin/codex/ph1gc-prod-001-unblock-history-repair @ f24304a093e36ac315b5ab8123a918029e689e41`
- local `codex2/ph1gc-prod-001-unblock-history-repair @ 0150cbe4e56505854d375211e25d2ab82e948fc0`
  before this repair commit
- local `codex/ph1gc-e2e-011-unblock-history-repair @ 0150cbe4e56505854d375211e25d2ab82e948fc0`
- local `codex/ph1gc-prod-001-unblock-history-repair @ f24304a093e36ac315b5ab8123a918029e689e41`
- `git reflog show codex2/ph1gc-prod-001-unblock-history-repair` reported:
  `branch: Created from origin/dev`
- `git worktree list --porcelain` showed:
  - `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-prod-001-unblock-history-repair`
    attached to `refs/heads/codex2/ph1gc-prod-001-unblock-history-repair`
    at `0150cbe4`
  - `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ph1gc-e2e-011-unblock-history-repair`
    attached to `refs/heads/codex/ph1gc-e2e-011-unblock-history-repair`
    at the same `0150cbe4`
  - `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ph1gc-prod-001-unblock-history-repair`
    attached to `refs/heads/codex/ph1gc-prod-001-unblock-history-repair`
    at `f24304a0`
- `git rev-list --left-right --count 0150cbe4...f24304a0` returned `0 1`,
  confirming the prior unblock artifact exists as a single descendant commit on
  top of current `origin/dev`
- `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-prod-001`
  returns `11 0`, confirming the pushed parent branch is a stale ancestor of
  current `origin/dev`
- `git diff --stat a7f88919 0150cbe4 -- .github/workflows/deploy-prod.yml docs/03-runbooks/production-deploy-rail-spec-20260519.md docs/03-runbooks/production-rollback-drill-20260519.md support/sidecars/WF-PROD-001-LIVE-EXEC`
  returns no output, confirming `origin/dev` retains the accepted
  production-rail artifact tree

### Machine-truth anchors

- Canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json` records
  parent `PH1GC-PROD-001` as `blocked`
- Canonical parent `next` already says the remaining work is:
  operator-managed `PROD_*` variables/secrets, production GCP readiness, a
  deployable `prod/v<YYYY.MM.DD>.<N>` tag, and live smoke + rollback evidence
  under `support/sidecars/WF-PROD-001-LIVE-EXEC/`
- Canonical `current-work.md` and task activity log both show this helper task
  assigned to `Codex2`, but the expected artifact path did not exist on the
  assigned helper branch before this repair

## Exact Contamination

The contamination is a five-part mismatch:

1. The canonical helper artifact already existed on
   `origin/codex/ph1gc-prod-001-unblock-history-repair`, but not on the
   expected `codex2/...` branch.
2. The supervisor-assigned `codex2/...` worktree was created from `origin/dev`
   instead of reusing a task-specific remote branch.
3. That auto-created local branch initially resolved to the same tip as an
   unrelated task helper branch,
   `codex/ph1gc-e2e-011-unblock-history-repair @ 0150cbe4`.
4. The parent task branch `origin/codex2/ph1gc-prod-001` remains a stale
   historical closeout SHA while accepted production-rail artifacts already
   live on current `origin/dev`.
5. The planning decision was already resolved, so the blocker is not missing
   code; it is ambiguity over which branch/worktree anchor should represent the
   canonical unblock history.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any existing shared refs.

1. Replay the helper artifact onto the expected
   `codex2/ph1gc-prod-001-unblock-history-repair` branch as a normal additive
   commit, so the supervisor-assigned branch now carries the same canonical
   diagnosis without touching prior history.
2. Leave `origin/codex/ph1gc-prod-001-unblock-history-repair @ f24304a0`,
   `origin/codex2/ph1gc-prod-001 @ a7f88919`, and the stale local task-stem
   branches untouched as audit evidence.
3. Treat `origin/dev @ 0150cbe4` as the canonical production-rail baseline for
   `PH1GC-PROD-001`; it already contains the accepted workflow, runbooks, and
   `WF-PROD-001-LIVE-EXEC` paths.
4. Do not reopen review on `origin/codex2/ph1gc-prod-001`. That branch is a
   stale closeout rail and replay there would move the parent backward onto an
   older repo snapshot.
5. Update the parent's next step to the concrete external operator handoff:
   provision required GitHub `PROD_*` variables and secrets, confirm production
   GCP readiness, ensure origin has a deployable `prod/v<YYYY.MM.DD>.<N>` tag,
   dispatch `deploy-prod.yml` against that tag, then publish live smoke and
   rollback evidence under `support/sidecars/WF-PROD-001-LIVE-EXEC/`.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The expected `codex2/...` branch gains the missing artifact through a normal
  forward commit.
- The canonical production-rail artifact tree remains `origin/dev`.
- Old owner/reviewer branches stay available for audit.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Compared related branch and worktree state:
  - `git worktree list --porcelain`
  - `git reflog show --date=iso codex2/ph1gc-prod-001-unblock-history-repair`
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' refs/heads/*ph1gc* refs/remotes/origin/*ph1gc*`
  - `git rev-list --left-right --count 0150cbe4e56505854d375211e25d2ab82e948fc0...f24304a093e36ac315b5ab8123a918029e689e41`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-prod-001`
- Confirmed canonical artifacts already live on current dev:
  - `git diff --stat a7f88919 0150cbe4 -- .github/workflows/deploy-prod.yml docs/03-runbooks/production-deploy-rail-spec-20260519.md docs/03-runbooks/production-rollback-drill-20260519.md support/sidecars/WF-PROD-001-LIVE-EXEC`
