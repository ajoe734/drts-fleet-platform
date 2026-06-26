# P2-UI-CMP-001 Unblock History Repair

## Scope

- Task: `P2-UI-CMP-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-UI-CMP-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-26T19:05:13Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-p2-ui-cmp-001-unblock-history-repair`
- Assigned helper branch:
  `codex2/p2-ui-cmp-001-unblock-history-repair`

## Diagnosis

`P2-UI-CMP-001` is currently product-blocked by the missing canonical Platform
Admin compliance canvas, but its assigned parent/helper rails are also
contaminated enough that a future owner could resume from the wrong branch by
name alone.

1. The current local parent branch `codex2/p2-ui-cmp-001` is not a parent rail.
   It was created from `origin/dev` at `2026-06-26 18:59:20 +0000` and still
   points exactly at `origin/dev @ 17650b25e144eb44a3d0ac56aa0344feafe39a9b`.
2. The helper branch `codex2/p2-ui-cmp-001-unblock-history-repair` was also
   created from `origin/dev`, at `2026-06-26 19:05:13 +0000`, and also still
   points exactly at `17650b25e144eb44a3d0ac56aa0344feafe39a9b`.
3. Commit `17650b25e` is not parent-owned work. It is merged PR `#962`
   `P2-DP-C1-001: platform-admin compliance and investigation routes`, so both
   branch names currently resolve to another task's integration commit.
4. No remote parent branch exists for `codex2/p2-ui-cmp-001`, no remote helper
   branch exists for `codex2/p2-ui-cmp-001-unblock-history-repair`, and no PR
   exists for `P2-UI-CMP-001`. Today there is no canonical pushed delivery rail
   for the parent task at all.
5. The actual UI state in `apps/platform-admin-web` intentionally points every
   sandbox compliance route at `SandboxDesignPendingScreen`, which links to
   `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`.
   That requirements note explicitly states the Platform Admin design canvas
   lacks these screens and engineering must not invent visuals.

This means the parent is not blocked by an unpushed implementation commit. It
is blocked by the missing canvas, plus branch/worktree naming drift that would
mislead the next owner into treating a raw `origin/dev` alias as a real parent
rail.

## Evidence

### Local parent and helper rails

- `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short) %(subject)' ...`
  shows:
  - `codex2/p2-ui-cmp-001 17650b25e origin/dev P2-DP-C1-001: platform-admin compliance and investigation routes (#962)`
  - `codex2/p2-ui-cmp-001-unblock-history-repair 17650b25e origin/dev P2-DP-C1-001: platform-admin compliance and investigation routes (#962)`
  - `origin/dev 17650b25e P2-DP-C1-001: platform-admin compliance and investigation routes (#962)`
- `git rev-list --left-right --count origin/dev...codex2/p2-ui-cmp-001`
  returns `0 0`
- `git rev-list --left-right --count origin/dev...codex2/p2-ui-cmp-001-unblock-history-repair`
  returns `0 0`
- `git reflog show --date=iso codex2/p2-ui-cmp-001`
  records `branch: Created from origin/dev`
- `git reflog show --date=iso codex2/p2-ui-cmp-001-unblock-history-repair`
  records `branch: Created from origin/dev`

### Remote and PR state

- `git ls-remote --heads origin 'refs/heads/codex2/p2-ui-cmp-001' 'refs/heads/codex2/p2-ui-cmp-001-unblock-history-repair'`
  returns no refs
- `gh pr list --state all --head codex2/p2-ui-cmp-001 ...`
  returns `[]`
- `gh pr list --state all --search 'P2-UI-CMP-001 in:title' ...`
  returns `[]`
- `gh pr view 962 --json ...`
  confirms merged PR `#962` created commit `17650b25e` on `dev`, with head
  branch `codex/p2-dp-c1-001-clean`, not any `P2-UI-CMP-001` rail

### Product/design blocker evidence

- `find docs/05-ui/drts-design-canvas -maxdepth 1 ...`
  finds:
  - `docs/05-ui/drts-design-canvas/Platform Admin.html`
  - `docs/05-ui/drts-design-canvas/platform-screens-1.jsx`
  - `docs/05-ui/drts-design-canvas/platform-screens-2.jsx`
  - `docs/05-ui/drts-design-canvas/platform-screens-3.jsx`
- The same search does **not** find `docs/05-ui/drts-design-canvas/compliance-screens.jsx`
- `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`
  says the current Platform Admin canvas does not contain source screens for
  this sandbox compliance route group and engineering must not invent visuals
- `grep -RIn 'SandboxDesignPendingScreen' apps/platform-admin-web/...`
  shows all current `/platform-admin/compliance`,
  `/platform-admin/investigations`, `/platform-admin/evidence/*`, and
  `/platform-admin/regulatory-reports` routes intentionally render the pending
  screen that points to the requirements note

## Exact Contamination

The exact contamination is a three-part lineage mismatch:

1. The supposed parent branch `codex2/p2-ui-cmp-001` is not a task branch with
   parent-owned history; it is only a local alias to `origin/dev`.
2. The helper branch `codex2/p2-ui-cmp-001-unblock-history-repair` is the same
   alias to `origin/dev`, so helper and parent names currently collapse to the
   same unrelated SHA `17650b25e`.
3. That shared SHA belongs to merged task `P2-DP-C1-001`, which already laid
   down the requirements-note / pending-screen stopgap. A future worker who
   resumes `P2-UI-CMP-001` by branch name alone would silently continue from
   another task's closeout commit instead of a canonical parent rail.

This is branch/worktree/commit contamination, not missing implementation
history.

## Non-Destructive Repair Path

Do not force-push, amend, or rewrite shared history.

1. Keep this helper branch for diagnosis evidence only.
2. Keep `P2-UI-CMP-001` blocked on the missing canonical Platform Admin
   compliance canvas. The requirements note and pending routes are already the
   correct stop state under the UI design contract.
3. Do not resume the parent from either existing local branch name
   (`codex2/p2-ui-cmp-001` or
   `codex2/p2-ui-cmp-001-unblock-history-repair`) without first recreating a
   clean task rail from current `origin/dev`.
4. Once the canonical canvas screens exist, create or recreate the parent rail
   from `origin/dev` in a fresh worktree, then make the first parent-owned
   anchor commit there:

```bash
git fetch origin --prune
git branch -D codex2/p2-ui-cmp-001 2>/dev/null || true
git worktree add .artifacts/worktrees/auto/codex2-p2-ui-cmp-001-parent -b codex2/p2-ui-cmp-001 origin/dev
```

5. Continue the real `P2-UI-CMP-001` implementation only after the canvas
   exists, using the fresh parent rail above the current `dev` baseline.
6. Open the parent PR only after there is at least one parent-owned commit on
   that recreated branch.

The local parent-branch delete/recreate step is safe because no remote ref
exists today under that name.

## Concrete Parent Next Step

`P2-UI-CMP-001` should remain blocked on the missing canvas, but its next step
must explicitly avoid the contaminated local rails:

1. Wait for canonical Platform Admin compliance screens to land in
   `docs/05-ui/drts-design-canvas`.
2. After the canvas lands, recreate a clean `codex2/p2-ui-cmp-001` branch and
   worktree from `origin/dev`.
3. Make the first parent-owned anchor commit on that fresh branch.
4. Only then replace the pending-screen placeholders with canvas-matched UI and
   open the real parent PR.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The current pending-screen / requirements-note implementation stays intact.
- The helper branch becomes diagnosis evidence instead of a fake parent rail.
- The eventual parent resume path starts from a clean branch/worktree with an
  unambiguous first parent-owned commit.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-UI-CMP-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-UI-CMP-001`
- Inspected refs and worktrees:
  - `git fetch origin --prune`
  - `git status --short --branch`
  - `git worktree list --porcelain`
  - `git branch -vv --list 'codex2/p2-ui-cmp-001' 'codex2/p2-ui-cmp-001-unblock-history-repair'`
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short) %(subject)' ...`
  - `git reflog show --date=iso codex2/p2-ui-cmp-001`
  - `git reflog show --date=iso codex2/p2-ui-cmp-001-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...codex2/p2-ui-cmp-001`
  - `git rev-list --left-right --count origin/dev...codex2/p2-ui-cmp-001-unblock-history-repair`
- Inspected design blocker evidence:
  - `find docs/05-ui/drts-design-canvas -maxdepth 1 ...`
  - `sed -n '1,260p' docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`
  - `sed -n '1,220p' apps/platform-admin-web/components/sandbox-design-pending-screen.tsx`
  - `grep -RIn 'SandboxDesignPendingScreen' apps/platform-admin-web/app apps/platform-admin-web/components`
- Inspected PR state:
  - `gh pr list --state all --search 'P2-UI-CMP-001 in:title' --json number,title,state,isDraft,headRefName,baseRefName,url`
  - `gh pr list --state all --head codex2/p2-ui-cmp-001 --json number,title,state,isDraft,headRefName,baseRefName,url,mergeStateStatus`
  - `gh pr view 962 --json number,title,state,isDraft,headRefName,baseRefName,url,mergeCommit,mergedAt`

No runtime or package tests were run. This task is branch-history and
machine-truth triage only.
