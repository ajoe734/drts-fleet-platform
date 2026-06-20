# MOB-APP-001 Unblock History Repair

## Scope

- Task: `MOB-APP-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `MOB-APP-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-20`

## Diagnosis

The parent is blocked by branch/worktree identity drift, not by a missing code
change.

1. The owner branch already exists locally and on origin as
   `codex2/mob-app-001 @ 2e0ebc11e983a26caf129fd80bc33e5c3d734b3e` with subject
   `wip(MOB-APP-001): anchor online-available heartbeat cadence`.
2. That pushed owner branch is a clean one-commit descendant of current
   `origin/dev @ 8ed60a27a1bfab03ecee55216d038c02e28b6703`. `git rev-list
   --left-right --count origin/dev...origin/codex2/mob-app-001` returns `0 1`.
3. The supervisor-assigned helper branch
   `codex2/mob-app-001-unblock-history-repair` was auto-created at
   `2026-06-20 06:11:13 +0000` from `origin/dev`, not from the existing owner
   branch. `git reflog show --date=iso codex2/mob-app-001-unblock-history-repair`
   reports `branch: Created from origin/dev`.
4. The helper branch currently points at the plain dev merge commit
   `8ed60a27a1bfab03ecee55216d038c02e28b6703` and tracks `origin/dev`, while no
   remote `origin/codex2/mob-app-001-unblock-history-repair` ref exists yet.
5. Canonical activity log records why the chair created this helper: dependency
   work is already merged to dev, the owner lane already produced and pushed a
   green-tested anchor commit, but the parent was still left `blocked` because
   the remaining closeout step was described as branch/history repair rather
   than resumed on the canonical owner branch.

## Evidence

### Branch and worktree state

- `origin/dev @ 8ed60a27a1bfab03ecee55216d038c02e28b6703`
- local + remote owner branch
  `codex2/mob-app-001 @ 2e0ebc11e983a26caf129fd80bc33e5c3d734b3e`
- local helper branch before this artifact commit
  `codex2/mob-app-001-unblock-history-repair @ 8ed60a27a1bfab03ecee55216d038c02e28b6703`
- `git worktree list --porcelain` shows:
  - `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-mob-app-001`
    attached to `refs/heads/codex2/mob-app-001` at `2e0ebc11e`
  - `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-mob-app-001-unblock-history-repair`
    attached to `refs/heads/codex2/mob-app-001-unblock-history-repair` at `8ed60a27a`
- `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)'`
  reports:
  - `codex2/mob-app-001 2e0ebc11e origin/codex2/mob-app-001`
  - `codex2/mob-app-001-unblock-history-repair 8ed60a27a origin/dev`
- `git ls-remote --heads origin` reports only:
  - `refs/heads/codex2/mob-app-001 @ 2e0ebc11e`
  - no `refs/heads/codex2/mob-app-001-unblock-history-repair`
- `git log --oneline codex2/mob-app-001-unblock-history-repair..codex2/mob-app-001`
  returns the single owner commit:
  - `2e0ebc11e wip(MOB-APP-001): anchor online-available heartbeat cadence`

### Parent provenance

- `git show --stat --summary 2e0ebc11e983a26caf129fd80bc33e5c3d734b3e`
  confirms the owner branch already contains the driver-app implementation
  across:
  - `apps/driver-app/app/_layout.tsx`
  - `apps/driver-app/app/trip.tsx`
  - `apps/driver-app/lib/driver-identity-bootstrap.ts`
  - `apps/driver-app/lib/driver-location-heartbeat.ts`
  - `apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts`
  - `apps/driver-app/tests/unit/driver-location-heartbeat.test.ts`
  - `packages/api-client/src/index.ts`
- Canonical `ai-activity-log.jsonl` records:
  - `2026-06-20T06:06:35Z`: parent `MOB-APP-001` blocked after pushing anchor
    `2e0ebc11e`, with driver-app `npm test` and `npm run typecheck` passing,
    and emulator verification unavailable because `adb` is missing in this
    worker.
  - `2026-06-20T06:11:13Z`: chair created this helper because dependencies were
    satisfied and merged to dev, while the green-tested anchor remained off-dev
    and needed a non-destructive branch/history finalization path.

## Exact Contamination

The contamination is a four-part mismatch:

1. The canonical owner branch already exists on origin and carries the actual
   implementation commit.
2. The helper branch with the `-unblock-history-repair` stem was auto-created
   from `origin/dev` instead of reusing or extending the pushed owner branch.
3. The helper worktree therefore points at a generic dev tip that omits the
   parent's real implementation commit `2e0ebc11e`.
4. Because the helper branch tracks `origin/dev`, it creates ambiguity over
   where the parent should be resumed, even though the real remaining action is
   owner closeout on `origin/codex2/mob-app-001`, not history rewriting.

This is branch/worktree/commit contamination, not a missing feature diff.

## Non-Destructive Repair Path

Do not force-push, rebase, or rename any existing shared branch.

1. Treat `origin/codex2/mob-app-001 @ 2e0ebc11e983a26caf129fd80bc33e5c3d734b3e`
   as the only canonical owner branch for `MOB-APP-001`.
2. Treat this helper branch as audit evidence only. It should record the
   diagnosis, not become the parent closeout branch.
3. Resume the parent task from the existing owner worktree
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-mob-app-001`
   on branch `codex2/mob-app-001`.
4. From that owner branch, perform the normal closeout path without rewriting
   shared history:
   - keep the pushed anchor commit `2e0ebc11e` intact
   - document the existing verification evidence (`npm test`, `npm run typecheck`)
   - record emulator/device acceptance as an environment waiver because `adb`
     is unavailable in this worker fleet
   - hand the parent back to reviewer `Codex` from the owner branch instead of
     from this helper branch
5. Leave `codex2/mob-app-001-unblock-history-repair` unmerged. Its role is to
   preserve the contamination audit trail.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The already-pushed owner branch remains the canonical implementation rail.
- The helper branch becomes additive audit evidence only.
- The parent can resume immediately on its real branch instead of reopening the
  implementation on a fresh dev-derived helper branch.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Compared branch and worktree state:
  - `git worktree list --porcelain`
  - `git reflog show --date=iso codex2/mob-app-001-unblock-history-repair`
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' refs/heads/codex2/mob-app-001 refs/heads/codex2/mob-app-001-unblock-history-repair refs/remotes/origin/codex2/mob-app-001 refs/remotes/origin/codex2/mob-app-001-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex2/mob-app-001`
  - `git log --oneline codex2/mob-app-001-unblock-history-repair..codex2/mob-app-001`
  - `git ls-remote --heads origin 'refs/heads/codex2/mob-app-001' 'refs/heads/codex2/mob-app-001-unblock-history-repair'`
- Confirmed owner-branch provenance:
  - `git show --stat --summary 2e0ebc11e983a26caf129fd80bc33e5c3d734b3e`
- Confirmed canonical machine-truth context from
  `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl` and
  `scripts/ai-status.sh show MOB-APP-001`
