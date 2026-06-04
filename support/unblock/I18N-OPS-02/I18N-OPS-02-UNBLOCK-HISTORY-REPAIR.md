# I18N-OPS-02 Unblock History Repair

## Scope

- Task: `I18N-OPS-02-UNBLOCK-HISTORY-REPAIR`
- Parent: `I18N-OPS-02`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-04T11:00:00Z`
- Canonical machine-truth root:
  `/home/edna/workspace/drts-fleet-platform`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-i18n-ops-02-unblock-history-repair`
- Assigned helper branch:
  `codex/i18n-ops-02-unblock-history-repair`

## Diagnosis

The parent is not blocked by missing dispatch-detail i18n work. The remaining
history problem is a stale helper branch/worktree on the reassigned `codex/...`
rail, while the real parent delivery and an earlier helper packet already exist
on the `codex2/...` rail.

1. The canonical parent branch already exists locally and on origin as
   `origin/codex2/i18n-ops-02 @ 5f7e103ba8d83c73b8c5f81f30feed7e2e984b6b`
   with closeout subject `I18N-OPS-02: record closeout verification`.
2. The assigned helper branch for this task,
   `codex/i18n-ops-02-unblock-history-repair @ 94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`,
   is identical to `origin/dev` and to the stale reviewer-lane branch
   `codex/i18n-ops-02 @ 94c3aa2d...`. It contains none of the parent task
   commits.
3. The actual parent task history is three commits ahead of `origin/dev`:
   `3f825e70`, `e86ee5f2`, and `5f7e103b`. `git rev-list --left-right --count
   origin/dev...origin/codex2/i18n-ops-02` returns `0 3`, while the same check
   against `codex/i18n-ops-02` returns `0 0`.
4. The earlier owner-lane helper task was already closed out separately on
   `origin/codex2/i18n-ops-02-unblock-history-repair @ fa8671068f43f15086efdb4e096f89959222bd80`
   with open draft PR `#523`. That preserved the right diagnosis, but it is not
   the currently assigned helper branch for this reassignment.
5. Canonical machine truth on parent task `I18N-OPS-02` is already repaired:
   `next` instructs all future parent work to resume only from
   `origin/codex2/i18n-ops-02 @ 5f7e103b` in the `codex2-i18n-ops-02` worktree
   and to ignore `codex2/i18n-ops-02-unblock-history-repair` for delivery.

## Evidence

### Branch and worktree state

- `origin/dev @ 94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`
- canonical parent branch:
  `origin/codex2/i18n-ops-02 @ 5f7e103ba8d83c73b8c5f81f30feed7e2e984b6b`
- earlier helper artifact branch:
  `origin/codex2/i18n-ops-02-unblock-history-repair @ fa8671068f43f15086efdb4e096f89959222bd80`
- current assigned helper branch before this closeout:
  `codex/i18n-ops-02-unblock-history-repair @ 94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`
- stale reviewer-lane parent alias:
  `codex/i18n-ops-02 @ 94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`
- parent worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-i18n-ops-02`
- current helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-i18n-ops-02-unblock-history-repair`
- `git worktree list --porcelain` shows the current helper worktree and branch
  are pinned to `94c3aa2d`, while the parent worktree is on `5f7e103b`

### Diff shape and ancestry

- `git rev-list --left-right --count origin/dev...origin/codex2/i18n-ops-02`
  returns `0 3`
- `git rev-list --left-right --count origin/dev...codex/i18n-ops-02`
  returns `0 0`
- `git log --left-right --graph --cherry-pick --oneline codex/i18n-ops-02...codex2/i18n-ops-02`
  shows only the parent commits on the `codex2/...` side:
  - `3f825e70 wip(I18N-OPS-02): anchor dispatch detail i18n`
  - `e86ee5f2 I18N-OPS-02: clean dispatch detail glossary`
  - `5f7e103b I18N-OPS-02: record closeout verification`
- `git diff --name-only origin/dev...origin/codex2/i18n-ops-02` shows only:
  - `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx`
  - `apps/ops-console-web/lib/translations.ts`

### Remote and PR visibility

- `git ls-remote --heads origin 'codex2/i18n-ops-02' 'codex2/i18n-ops-02-unblock-history-repair' 'codex/i18n-ops-02' 'codex/i18n-ops-02-unblock-history-repair'`
  confirms:
  - `refs/heads/codex2/i18n-ops-02 @ 5f7e103b`
  - `refs/heads/codex2/i18n-ops-02-unblock-history-repair @ fa867106`
  - no `refs/heads/codex/i18n-ops-02`
  - no `refs/heads/codex/i18n-ops-02-unblock-history-repair`
- `gh pr list --search 'I18N-OPS-02-UNBLOCK-HISTORY-REPAIR in:title' --state all`
  returns draft PR `#523` on head `codex2/i18n-ops-02-unblock-history-repair`
- `gh pr list --head codex:i18n-ops-02-unblock-history-repair --state all`
  returns `[]`

### Machine-truth state

- `AI_NAME=Codex scripts/ai-status.sh show I18N-OPS-02` reports parent status
  `blocked` with `next` already narrowed to:
  `resume only from origin/codex2/i18n-ops-02@5f7e103b ... ignore codex2/i18n-ops-02-unblock-history-repair for delivery`
- `AI_NAME=Codex scripts/ai-status.sh show I18N-OPS-02-UNBLOCK-HISTORY-REPAIR`
  reports this helper task owned by `Codex`, reviewer `Codex2`, and scoped to
  branch/history repair rather than product code changes

## Exact Contamination

The exact contamination is a reassignment mismatch across three rails:

1. The real parent delivery branch is `origin/codex2/i18n-ops-02 @ 5f7e103b`.
2. The earlier helper diagnosis lives on
   `origin/codex2/i18n-ops-02-unblock-history-repair @ fa867106` with draft PR
   `#523`.
3. The currently assigned helper branch
   `codex/i18n-ops-02-unblock-history-repair` is a fresh stale alias at
   `origin/dev @ 94c3aa2d` with no task commit, no remote ref, and no PR.

This means the parent is already unblocked in machine truth, but the current
assigned helper rail still lacked task-scoped commit/push evidence. The
contamination is on helper branch routing, not on the parent delivery branch.

## Non-Destructive Repair Path

Do not force-push, rename, rebase, or delete any published branch.

1. Keep `origin/codex2/i18n-ops-02 @ 5f7e103b` as the sole canonical parent
   delivery rail.
2. Leave `origin/codex2/i18n-ops-02-unblock-history-repair @ fa867106` and PR
   `#523` untouched as valid earlier audit evidence.
3. Rebuild the same diagnosis additively on the currently assigned branch
   `codex/i18n-ops-02-unblock-history-repair` so this reassigned task also has
   task-scoped commit and push evidence on its own rail.
4. Do not cherry-pick parent commits onto the helper branch. The helper branch
   is documentation-only audit evidence.
5. Resume the parent task only on the existing pushed parent branch and replay
   the machine-truth next step already recorded there:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff I18N-OPS-02 Codex \
  "History ambiguity resolved: resume only from origin/codex2/i18n-ops-02@5f7e103ba8d83c73b8c5f81f30feed7e2e984b6b in /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-i18n-ops-02; ignore codex2/i18n-ops-02-unblock-history-repair for delivery; remaining blocker is the existing acceptance-baseline/reviewer decision outside task diff."
```

6. Any eventual parent closeout must keep the existing parent push evidence:
   - `COMMIT_HASH=5f7e103ba8d83c73b8c5f81f30feed7e2e984b6b`
   - `COMMIT_SUBJECT='I18N-OPS-02: record closeout verification'`
   - `PUSH_REMOTE=origin`
   - `PUSH_BRANCH=codex2/i18n-ops-02`

## Current Unblocked Result

- Parent task `I18N-OPS-02` is no longer blocked by uncertainty about which
  branch or worktree to use.
- The concrete next step is already recorded in canonical machine truth:
  resume only on `origin/codex2/i18n-ops-02 @ 5f7e103b`.
- This helper task's remaining requirement was to materialize the same history
  diagnosis on the currently assigned `codex/...` helper branch with normal
  commit/push evidence.

## Review Approval And Closeout Notes

- Reviewer approval was recorded at `2026-06-04T11:18:07Z` with the conclusion
  that the helper branch remains only a stale audit rail while the canonical
  parent closeout stays on `origin/codex2/i18n-ops-02 @ 5f7e103b`.
- The first pushed helper-rail evidence commit is
  `af546c437bb3f192402c9033b1464c14d03ebc7e`
  (`I18N-OPS-02-UNBLOCK-HISTORY-REPAIR: document reassigned helper rail contamination`).
- This owner closeout adds no product-code delta and does not alter the parent
  branch choice. It exists only to satisfy the formal `review_approved -> done`
  protocol on the currently assigned `codex/...` helper rail with an explicit
  verification trailer and machine-truth finalization.

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The canonical parent branch remains unchanged.
- The earlier `codex2/...-unblock-history-repair` branch and PR remain
  reachable as audit evidence.
- The current reassigned helper branch gains its own additive evidence without
  contaminating the parent branch.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical machine truth for:
  - `I18N-OPS-02`
  - `I18N-OPS-02-UNBLOCK-HISTORY-REPAIR`
- Compared related refs and worktrees:
  - `git branch --show-current`
  - `git status --short`
  - `git worktree list --porcelain`
  - `git log --oneline --decorate --graph --max-count=25`
  - `git log --oneline --decorate --graph --max-count=25 codex2/i18n-ops-02`
  - `git branch --contains 5f7e103ba8d83c73b8c5f81f30feed7e2e984b6b`
  - `git merge-base codex/i18n-ops-02-unblock-history-repair origin/dev`
  - `git rev-parse codex/i18n-ops-02-unblock-history-repair origin/dev origin/codex2/i18n-ops-02 origin/codex2/i18n-ops-02-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex2/i18n-ops-02`
  - `git rev-list --left-right --count origin/dev...codex/i18n-ops-02`
  - `git diff --name-only origin/dev...origin/codex2/i18n-ops-02`
  - `git diff --stat 94c3aa2d..5f7e103ba8d83c73b8c5f81f30feed7e2e984b6b`
  - `git log --left-right --graph --cherry-pick --oneline codex/i18n-ops-02...codex2/i18n-ops-02`
  - `git reflog --date=iso --decorate -n 30`
  - `git ls-remote --heads origin 'codex/i18n-ops-02-unblock-history-repair' 'codex2/i18n-ops-02-unblock-history-repair' 'codex2/i18n-ops-02' 'codex/i18n-ops-02'`
- Checked PR visibility:
  - `gh pr list --search 'I18N-OPS-02-UNBLOCK-HISTORY-REPAIR in:title' --state all --json number,title,headRefName,baseRefName,state,url,isDraft`
  - `gh pr list --head codex:i18n-ops-02-unblock-history-repair --state all --json number,title,headRefName,baseRefName,state,url,isDraft`
  - `gh pr list --head codex2:i18n-ops-02-unblock-history-repair --state all --json number,title,headRefName,baseRefName,state,url,isDraft`

No runtime tests were run. This task is branch/history evidence repair only.
