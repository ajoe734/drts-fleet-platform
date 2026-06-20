# MOB-OPS-001 Unblock History Repair

## Scope

- Task: `MOB-OPS-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `MOB-OPS-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-20T09:12:57Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-mob-ops-001-unblock-history-repair`
- Assigned helper branch:
  `codex/mob-ops-001-unblock-history-repair`

## Diagnosis

`MOB-OPS-001` is blocked by branch/history contamination, not by missing Ops
Console implementation.

1. The canonical parent branch is
   `origin/codex/mob-ops-001 @ 57d0af2123d51ee2e5be2f09810b6eeff2b68249`.
   Its content delta is real and still isolated from `origin/dev`.
2. That parent branch is not linear. It contains merge commit
   `9c20e832716df799e2bf7038cf0321631f06419e`
   (`Merge remote-tracking branch 'origin/dev' into codex/mob-ops-001`).
3. `docs/ops/branch-strategy.md` requires `dev` to remain linear-history only,
   so the merge commit makes the parent branch unsuitable for a normal
   protected-branch closeout path even though the code itself verifies locally.
4. A second branch with the same task stem exists locally:
   `codex/mob-ops-001-dev-closeout @ 3df35e5e01ea585892d161253ea21ae1e49bbe37`.
   It is attached to worktree `/tmp/codex-mob-ops-001-dev-closeout`, but its
   tip is unrelated to `MOB-OPS-001` and instead points at `MOB-QA-001 (#820)`.
5. `git reflog` shows `codex/mob-ops-001-dev-closeout` was created from
   `origin/dev` on `2026-06-20 08:39:58 +0000`, then drifted forward with
   unrelated `dev` commits. There is no corresponding remote ref
   `origin/codex/mob-ops-001-dev-closeout`.
6. The assigned helper branch for this repair task,
   `codex/mob-ops-001-unblock-history-repair`, currently sits cleanly at
   `origin/dev @ a96501a0a867d0d5dca8269a3429beff52e017f4` and is not itself
   contaminated by prior helper commits.

The parent is therefore blocked by two overlapping history problems:

- the real parent branch includes a merge commit that protected `dev` will not
  accept as a direct update source
- a misleading local `*-dev-closeout` branch/worktree exists with the parent
  task stem but unrelated commit content

## Evidence

### Parent branch state

- `origin/dev @ a96501a0a867d0d5dca8269a3429beff52e017f4`
- `origin/codex/mob-ops-001 @ 57d0af2123d51ee2e5be2f09810b6eeff2b68249`
- `git rev-list --left-right --count origin/dev...codex/mob-ops-001`:
  `0 7`
- `git log --oneline origin/dev..codex/mob-ops-001` shows:
  - `f6163e432` `wip(MOB-OPS-001): anchor tracking diagnostics`
  - `59155ebba` `MOB-OPS-001: align dispatch location-state contracts`
  - `f4caea428` `MOB-OPS-001: finalize owner closeout`
  - `795deac49` `MOB-OPS-001: stabilize ops-console typecheck`
  - `551b45de3` `MOB-OPS-001: finalize owner closeout`
  - `9c20e8327` `Merge remote-tracking branch 'origin/dev' into codex/mob-ops-001`
  - `57d0af212` `MOB-OPS-001: reconcile dev merge location-state checks`
- `git diff --name-only origin/dev...codex/mob-ops-001` confirms the parent
  branch still owns the expected 9-file MOB-OPS-001 delta:
  - `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx`
  - `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`
  - `apps/ops-console-web/app/dispatch/location-state.ts`
  - `apps/ops-console-web/app/drivers/[driverId]/page.tsx`
  - `apps/ops-console-web/lib/translations.ts`
  - `apps/ops-console-web/tsconfig.json`
  - `packages/contracts/src/index.ts`
  - `packages/contracts/src/phase1-delta-supply-eligibility.ts`
  - `tests/unit/dispatch-location-state.test.ts`

### Contaminated closeout-lookalike branch

- local `codex/mob-ops-001-dev-closeout @ 3df35e5e01ea585892d161253ea21ae1e49bbe37`
- attached worktree:
  `/tmp/codex-mob-ops-001-dev-closeout`
- `git branch -vv` labels it `[origin/dev: behind 2] MOB-QA-001 (#820)`
- `git reflog show --date=iso codex/mob-ops-001-dev-closeout` has only:
  - `2026-06-20 08:39:58 +0000 branch: Created from origin/dev`
- `git ls-remote --heads origin` returns no
  `refs/heads/codex/mob-ops-001-dev-closeout`
- `git rev-list --left-right --count origin/dev...codex/mob-ops-001-dev-closeout`:
  `2 0`, confirming it is simply two commits behind trunk rather than a valid
  parent closeout rail

### Machine-truth evidence

- Parent task `MOB-OPS-001` is `blocked`
- Parent `next` already notes the direct integration failure mode:
  protected `dev` rejected the merge-based closeout path and still requires a
  linear PR/check flow

## Exact Contamination

The exact contamination is two-part:

1. `origin/codex/mob-ops-001` is the real delivery branch, but it contains
   merge commit `9c20e8327`, so its history cannot be promoted through a normal
   linear-history `dev` rail without replaying the task commits onto a fresh
   branch.
2. A separate local branch/worktree named
   `codex/mob-ops-001-dev-closeout` looks like the canonical closeout rail, but
   it actually points at unrelated `dev` work (`MOB-QA-001` and tenant
   enterprise commits) and has no remote ref. Reusing it would mix unrelated
   work into the repair.

This is why the parent remains blocked even though the feature diff itself is
small and locally verified: the problem is the shape and naming of the branch
history, not the implementation payload.

## Non-Destructive Repair Path

Do not force-push, rewrite, or rename any existing branch.

1. Treat `origin/codex/mob-ops-001 @ 57d0af212` as the source of truth for the
   parent diff, but not as the branch to merge directly into `dev`.
2. Ignore local `codex/mob-ops-001-dev-closeout @ 3df35e5e0`; preserve it only
   as audit evidence of branch-name contamination.
3. Create a fresh linear replay branch from current `origin/dev` using a new
   branch name, for example `codex/mob-ops-001-linearized`.
4. Cherry-pick only the task-bearing commits from the parent branch, oldest to
   newest, and skip the merge-only / no-diff closeout commits:

```bash
git fetch origin
git switch -c codex/mob-ops-001-linearized origin/dev
git cherry-pick f6163e432 59155ebba 795deac49 57d0af212
```

5. Re-run the parent verification suite on that linear replay branch:

```bash
CI=true pnpm install
pnpm i18n:guard
pnpm --filter @drts/ops-console-web typecheck
pnpm --filter @drts/ops-console-web build
```

6. Push the replay branch normally and open a standard PR to `dev`. Do not
   reuse the old merge-based branch for the protected-branch closeout:

```bash
git push -u origin codex/mob-ops-001-linearized
```

7. After the replay branch exists, resume the parent task against that new
   branch and carry it through the normal `handoff -> approve -> done` path with
   the replay branch's commit and push evidence.

## Concrete Parent Next Step

`MOB-OPS-001` should resume on a new linear replay branch, not on
`origin/codex/mob-ops-001` and not on local `codex/mob-ops-001-dev-closeout`.

Concrete next step:

1. branch from `origin/dev`
2. cherry-pick `f6163e432`, `59155ebba`, `795deac49`, `57d0af212`
3. verify with `pnpm i18n:guard`, ops-console `typecheck`, and ops-console
   `build`
4. push the replay branch and reopen parent closeout from that clean rail

## Why This Is Safe

- no shared ref is rewritten
- no force-push is required
- the original parent branch stays available for audit
- the contaminated local-only `*-dev-closeout` branch stays reachable as
  evidence instead of being hidden
- the repair path uses additive replay from current `origin/dev`, which matches
  the protected-branch linear-history policy

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- checked machine truth with:
  - `AI_NAME=Codex scripts/ai-status.sh show MOB-OPS-001`
  - `AI_NAME=Codex scripts/ai-status.sh show MOB-OPS-001-UNBLOCK-HISTORY-REPAIR`
- inspected parent and helper refs:
  - `git branch -vv --list 'codex/mob-ops-001' 'codex/mob-ops-001-dev-closeout' 'codex/mob-ops-001-unblock-history-repair'`
  - `git ls-remote --heads origin 'refs/heads/codex/mob-ops-001' 'refs/heads/codex/mob-ops-001-dev-closeout' 'refs/heads/codex/mob-ops-001-unblock-history-repair'`
  - `git worktree list --porcelain`
  - `git reflog show --date=iso codex/mob-ops-001-dev-closeout`
  - `git rev-list --left-right --count origin/dev...codex/mob-ops-001`
  - `git rev-list --left-right --count origin/dev...codex/mob-ops-001-dev-closeout`
  - `git merge-base origin/dev codex/mob-ops-001`
- inspected commit provenance:
  - `git show --stat --summary 57d0af212 551b45de3 9c20e8327`
  - `git show --stat --summary --format=fuller f6163e432 59155ebba f4caea428 795deac49 551b45de3 57d0af212`
  - `git show --no-patch --format=fuller a96501a0 3df35e5e`
  - `git diff --stat origin/dev...codex/mob-ops-001`

No runtime tests were run in this helper task. This repair is evidence and
branch-history triage only.
