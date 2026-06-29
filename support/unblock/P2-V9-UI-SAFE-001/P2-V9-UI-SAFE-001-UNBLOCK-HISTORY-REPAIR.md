# P2-V9-UI-SAFE-001 Unblock History Repair

## Scope

- Task: `P2-V9-UI-SAFE-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-V9-UI-SAFE-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-29T04:24:02Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-p2-v9-ui-safe-001-unblock-history-repair`
- Assigned helper branch:
  `codex2/p2-v9-ui-safe-001-unblock-history-repair`

## Diagnosis

`P2-V9-UI-SAFE-001` is blocked by branch-history contamination, not by missing
product content. The feature diff itself is isolated to eight `apps/driver-app`
files, but the owner branch and open PR rail were built on top of the reviewer's
branch instead of on top of `origin/dev`.

1. The reviewer branch `origin/codex/p2-v9-ui-safe-001` was created from
   `origin/dev @ 589df2125dc8422ab027ef18800f69ab9af12a8c` and contains two
   commits:
   - `db0b0304292f91330f8d78f71c736f63a71bcbd5`
     `wip(P2-V9-UI-SAFE-001): anchor safety-operator realm scope`
   - `13d481573d5378c84d18b89add9b3a21d9f7f9f5`
     `wip(P2-V9-UI-SAFE-001): anchor safety-operator route gate`
2. The owner branch `codex2/p2-v9-ui-safe-001` was also created from
   `origin/dev`, but its reflog shows an unsafe branch reset at
   `2026-06-29 03:45:30 +0000`: `branch: Reset to origin/codex/p2-v9-ui-safe-001`.
   That reset moved the owner branch tip onto the reviewer branch stack.
3. The current owner closeout commit
   `fe2077d174905d1ed9162775dbef3555cbe08e1c`
   (`P2-V9-UI-SAFE-001: owner closeout after approved review`) now sits on top
   of those reviewer commits instead of on top of a Codex2-only owner rail.
4. PR `#995` therefore exposes three commits, of which only the top closeout
   commit is owner-authored in trailers. The lower two commits are reviewer
   rail commits carried into the owner PR.
5. `git diff --name-only origin/dev...origin/codex2/p2-v9-ui-safe-001` confirms
   the actual feature payload is limited to eight driver-app files, so a clean
   replay onto a fresh owner branch is straightforward.
6. `git worktree list --porcelain` shows no active worktree attached to either
   `codex2/p2-v9-ui-safe-001` or `codex/p2-v9-ui-safe-001`. The only attached
   worktree in this task family is the helper branch for this unblock task.

## Evidence

### Reviewer rail

- `origin/codex/p2-v9-ui-safe-001 @ 13d481573d5378c84d18b89add9b3a21d9f7f9f5`
- `git reflog show --date=iso codex/p2-v9-ui-safe-001` records:
  - `2026-06-28 07:39:42 +0000`: `branch: Created from origin/dev`
  - `2026-06-28 07:51:30 +0000`: `db0b03042`
  - `2026-06-29 03:30:14 +0000`: `13d481573`
- `git log --oneline origin/dev..origin/codex/p2-v9-ui-safe-001` shows exactly
  those two reviewer commits

### Contaminated owner rail

- `origin/codex2/p2-v9-ui-safe-001 @ fe2077d174905d1ed9162775dbef3555cbe08e1c`
- `git reflog show --date=iso codex2/p2-v9-ui-safe-001` records:
  - `2026-06-29 03:24:01 +0000`: `branch: Created from origin/dev`
  - `2026-06-29 03:45:30 +0000`: `branch: Reset to origin/codex/p2-v9-ui-safe-001`
  - `2026-06-29 03:48:14 +0000`: `fe2077d17`
- `git log --oneline origin/dev..origin/codex2/p2-v9-ui-safe-001` shows:
  - `fe2077d17 P2-V9-UI-SAFE-001: owner closeout after approved review`
  - `13d481573 wip(P2-V9-UI-SAFE-001): anchor safety-operator route gate`
  - `db0b03042 wip(P2-V9-UI-SAFE-001): anchor safety-operator realm scope`
- `git rev-list --left-right --count origin/dev...origin/codex2/p2-v9-ui-safe-001`
  returns `10 3`, so the branch is both behind current `dev` and three commits
  ahead with contaminated owner history

### PR evidence

- `gh pr view 995 --json number,title,state,baseRefName,headRefName,url,commits`
  reports:
  - PR `#995`
  - title `P2-V9-UI-SAFE-001: Driver App v9 Safety Operator realm`
  - state `OPEN`
  - head `codex2/p2-v9-ui-safe-001`
  - base `dev`
  - URL `https://github.com/ajoe734/drts-fleet-platform/pull/995`
  - commit list:
    - `db0b0304292f91330f8d78f71c736f63a71bcbd5`
    - `13d481573d5378c84d18b89add9b3a21d9f7f9f5`
    - `fe2077d174905d1ed9162775dbef3555cbe08e1c`

### Payload isolation

- `git diff --name-only origin/dev...origin/codex2/p2-v9-ui-safe-001` lists only:
  - `apps/driver-app/app/_layout.tsx`
  - `apps/driver-app/app/safety-operator.tsx`
  - `apps/driver-app/lib/driver-identity-routing.ts`
  - `apps/driver-app/lib/safety-operator-fixtures.ts`
  - `apps/driver-app/lib/safety-operator-takeover-draft.ts`
  - `apps/driver-app/tests/unit/driver-identity-routing.test.ts`
  - `apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts`
  - `apps/driver-app/tests/unit/safety-operator-takeover-draft.test.ts`
- `git diff --check origin/dev...origin/codex2/p2-v9-ui-safe-001` reports no
  whitespace defects in that payload

## Exact Contamination

The exact contamination is a branch reset that made the owner PR inherit the
reviewer rail:

1. `codex2/p2-v9-ui-safe-001` was initially created from `origin/dev`.
2. That owner branch was then reset to `origin/codex/p2-v9-ui-safe-001`.
3. The owner closeout commit was added on top of the reviewer stack.
4. The resulting PR `#995` is therefore not a clean owner branch; it is a
   mixed rail containing reviewer commits plus the owner closeout.

This is enough to keep the parent blocked because any additional owner work,
review, or merge reasoning on PR `#995` will continue to speak from the wrong
branch ancestry.

## Non-Destructive Repair Path

Do not force-push `codex2/p2-v9-ui-safe-001`. Do not rewrite PR `#995`.

1. Leave the contaminated owner branch and PR in place as audit evidence.
2. Create a fresh replay branch from current `origin/dev`:

```bash
git fetch origin --prune
git switch -c codex2/p2-v9-ui-safe-001-replay origin/dev
```

3. Restore only the eight driver-app files from the contaminated owner branch:

```bash
git restore --source origin/codex2/p2-v9-ui-safe-001 -- \
  apps/driver-app/app/_layout.tsx \
  apps/driver-app/app/safety-operator.tsx \
  apps/driver-app/lib/driver-identity-routing.ts \
  apps/driver-app/lib/safety-operator-fixtures.ts \
  apps/driver-app/lib/safety-operator-takeover-draft.ts \
  apps/driver-app/tests/unit/driver-identity-routing.test.ts \
  apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts \
  apps/driver-app/tests/unit/safety-operator-takeover-draft.test.ts
```

4. Re-run the parent verification on the replay rail:
   `pnpm --filter @drts/driver-app typecheck`
   `pnpm --filter @drts/driver-app build`
5. Commit and push the replay as a clean owner rail:

```bash
git add apps/driver-app/app/_layout.tsx \
  apps/driver-app/app/safety-operator.tsx \
  apps/driver-app/lib/driver-identity-routing.ts \
  apps/driver-app/lib/safety-operator-fixtures.ts \
  apps/driver-app/lib/safety-operator-takeover-draft.ts \
  apps/driver-app/tests/unit/driver-identity-routing.test.ts \
  apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts \
  apps/driver-app/tests/unit/safety-operator-takeover-draft.test.ts
git commit -m "P2-V9-UI-SAFE-001: replay clean owner branch from current dev" \
  -m "LLM-Agent: Codex2" \
  -m "Task-ID: P2-V9-UI-SAFE-001" \
  -m "Reviewer: Codex" \
  -m "Verification: pnpm --filter @drts/driver-app typecheck; pnpm --filter @drts/driver-app build"
git push -u origin codex2/p2-v9-ui-safe-001-replay
```

6. Open a replacement PR from `codex2/p2-v9-ui-safe-001-replay` to `dev`.
7. Update the parent task to point review/merge work at the replay PR, then
   close or supersede PR `#995` as contaminated history evidence.

## Concrete Parent Next Step

`P2-V9-UI-SAFE-001` should stay blocked until the replay rail exists, but its
next actionable step is now concrete:

1. Do not continue review on PR `#995`.
2. Create `codex2/p2-v9-ui-safe-001-replay` from current `origin/dev`.
3. Replay only the eight driver-app files from
   `origin/codex2/p2-v9-ui-safe-001`.
4. Re-run driver-app typecheck/build.
5. Open the replacement PR and move the parent review rail to that PR.

## Helper Task Closeout Evidence

This unblock task itself is captured on its own helper rail and was pushed
without rewriting any shared history:

- helper branch:
  `codex2/p2-v9-ui-safe-001-unblock-history-repair`
- helper closeout commit:
  `96f0b4885918d3f3e7d5346ee554ab6d097f82a7`
  `P2-V9-UI-SAFE-001-UNBLOCK-HISTORY-REPAIR: document contaminated owner replay rail`
- remote push evidence:
  `git ls-remote --heads origin codex2/p2-v9-ui-safe-001-unblock-history-repair`
  resolves to
  `96f0b4885918d3f3e7d5346ee554ab6d097f82a7 refs/heads/codex2/p2-v9-ui-safe-001-unblock-history-repair`

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- PR `#995` remains available as contamination evidence.
- The clean replay path is minimal because the parent payload is already
  isolated to eight files.
- The replacement PR starts from current `dev`, so it avoids merging stale
  reviewer ancestry into the owner rail.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-V9-UI-SAFE-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-V9-UI-SAFE-001`
- Inspected related refs and worktrees:
  - `git fetch origin --prune`
  - `git branch -vv --list 'codex2/p2-v9-ui-safe-001' 'codex/p2-v9-ui-safe-001' 'codex2/p2-v9-ui-safe-001-unblock-history-repair' 'codex2/p2-v9-ui-safe-001-merge'`
  - `git worktree list --porcelain | sed -n '/p2-v9-ui-safe-001/,+3p'`
  - `git reflog show --date=iso codex2/p2-v9-ui-safe-001`
  - `git reflog show --date=iso codex/p2-v9-ui-safe-001`
  - `git merge-base origin/dev origin/codex2/p2-v9-ui-safe-001`
  - `git rev-list --left-right --count origin/dev...origin/codex2/p2-v9-ui-safe-001`
  - `git rev-list --left-right --count origin/dev...origin/codex/p2-v9-ui-safe-001`
  - `git log --oneline origin/dev..origin/codex2/p2-v9-ui-safe-001`
  - `git log --oneline origin/dev..origin/codex/p2-v9-ui-safe-001`
  - `git diff --name-only origin/dev...origin/codex2/p2-v9-ui-safe-001`
  - `git diff --stat origin/dev...origin/codex2/p2-v9-ui-safe-001`
  - `git diff --check origin/dev...origin/codex2/p2-v9-ui-safe-001`
- Inspected commit / PR evidence:
  - `git show --stat --summary --no-patch db0b03042`
  - `git show --stat --summary --no-patch 13d481573`
  - `git show --stat --summary --no-patch fe2077d17`
  - `gh pr view 995 --json number,title,state,baseRefName,headRefName,url,commits`

No runtime or package tests were run in this helper task. This repair is
branch-history and machine-truth triage only.
