# P2-UI-OPS-001 Unblock History Repair

## Scope

- Task: `P2-UI-OPS-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-UI-OPS-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-26T09:34:00Z`
- Canonical machine-truth root:
  `/home/edna/workspace/drts-fleet-platform`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-ui-ops-001-unblock-history-repair`
- Assigned helper branch:
  `codex/p2-ui-ops-001-unblock-history-repair`

## Diagnosis

`P2-UI-OPS-001` is no longer blocked by missing visual authority. It is blocked
by stale parent branch history that still points at a pre-canvas blocker note.

1. The only pushed parent branch is `origin/codex/p2-ui-ops-001 @ c9e2d95d7`.
   It is one commit ahead and one commit behind `origin/dev`, so it is not a
   clean continuation of current trunk.
2. The parent branch contains exactly one task commit:
   `wip(P2-UI-OPS-001): anchor av-fallback screen requirements`. Its parent is
   `8da514a8e`, which is also the direct parent of current `origin/dev @ 7a99c347c`.
   The task branch and current trunk therefore forked as siblings from the same
   base commit instead of the task branch advancing with trunk.
3. That single parent commit is a blocker note, not implementation work. The
   note explicitly says `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx` and
   the `OC_AvFallback` / `OC_PassengerRecovery` / `OC_SandboxExceptions`
   artboards do not exist yet and that implementation must wait.
4. Current `origin/dev @ 7a99c347c` now contains the missing design authority:
   `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx`, plus
   `docs/05-ui/drts-design-canvas/Ops Console.html` artboards
   `av-fallback`, `pax-recovery`, and `sandbox-exceptions`.
5. The upstream visual handoff document now records A4 as unlocked and says the
   canvas was delivered on `2026-06-26`, so the blocker note on
   `origin/codex/p2-ui-ops-001` is obsolete rather than pending.
6. No PR exists for `origin/codex/p2-ui-ops-001`, so there is no integration
   rail carrying that stale note toward `dev`.
7. `git diff --check origin/dev...origin/codex/p2-ui-ops-001` also reports
   trailing whitespace in the blocker note, so replaying the old commit verbatim
   would carry avoidable doc lint noise onto a clean branch.
8. Dependency evidence has already advanced on trunk:
   `origin/dev` contains `P2-FBK-001: integrate fallback route registration to dev (#901)`
   and machine truth shows `P2-DP-C3-001` is `done` on `origin/dev @ 78e01dcae`.
   The old parent note about waiting on missing canvas is therefore stale.
9. One live caveat remains for implementation, but it is not a history blocker:
   `RocOperationsService.listFallbackReports()` exists, while
   `apps/api/src/modules/roc-operations/roc-operations.controller.ts` still
   exposes only `POST /roc/trips/:tripId/fallback-to-human`. The sandbox
   exceptions list may still need a read route on the eventual parent replay
   branch.

## Evidence

### Branch and worktree state

- `origin/dev @ 7a99c347c4de0472375a9102285e789b81aa4264`
- `origin/codex/p2-ui-ops-001 @ c9e2d95d7152ecd62a33734b7c842eb36bd45472`
- helper branch
  `codex/p2-ui-ops-001-unblock-history-repair @ 7a99c347c4de0472375a9102285e789b81aa4264`
- `git rev-list --left-right --count origin/dev...origin/codex/p2-ui-ops-001`
  returns `1 1`
- `git merge-base origin/dev origin/codex/p2-ui-ops-001`
  returns `8da514a8eab790d08046481f7c50ea07d8763c00`
- `git show -s --format='commit %H%nparents %P%nsubject %s%n' c9e2d95d7 8da514a8e 7a99c347c`
  shows both `c9e2d95d7` and `7a99c347c` have the same parent `8da514a8e`
- `git worktree list --porcelain | sed -n '/p2-ui-ops-001/,+2p'` shows only the
  assigned helper worktree in this clone
- `git reflog show --date=iso codex/p2-ui-ops-001` shows:
  - branch created from `origin/dev` at `2026-06-26 08:45:13 +0000`
  - one commit at `2026-06-26 08:51:20 +0000`
- `gh pr list --state all --head codex/p2-ui-ops-001 ...` returns `[]`

### Stale blocker note versus current trunk

- `git show origin/codex/p2-ui-ops-001:docs/05-ui/ops-console-av-fallback-screen-requirements-20260626.md`
  shows the note's `Canonical gap` section says the task must wait because
  `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx` does not exist yet
- current trunk now contains:
  - `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx`
  - `Ops Console.html` artboards for `av-fallback`, `pax-recovery`, and
    `sandbox-exceptions`
- `docs/02-architecture/phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md`
  now says:
  - A4 `Ops AV fallback` is unlocked
  - canvas was delivered on `2026-06-26`
  - UI build second wave has already been dispatched
- `git rev-parse c9e2d95d7^{tree} origin/codex/p2-ui-ops-001^{tree}` returns
  the same tree id, proving the old parent branch contains nothing besides that
  single blocker-note snapshot

### Dependency and implementation caveat state

- `git log origin/dev --oneline --grep='P2-FBK-001' -n 20` shows:
  - `c4126ee88 P2-FBK-001: integrate fallback route registration to dev (#901)`
- `AI_NAME=Codex scripts/ai-status.sh show P2-DP-C3-001` shows:
  - status `done`
  - `push_ref = origin/dev`
  - `merge_commit = 78e01dcae3c28799b56e94b65fba456d8e7d6dee`
- `git grep -n 'listFallbackReports' -- apps/api/src/modules/roc-operations`
  shows the service exposes `listFallbackReports()`
- `sed -n '1,220p' apps/api/src/modules/roc-operations/roc-operations.controller.ts`
  shows only the fallback POST route and no read endpoint for those reports
- `git diff --check origin/dev...origin/codex/p2-ui-ops-001` reports trailing
  whitespace in `docs/05-ui/ops-console-av-fallback-screen-requirements-20260626.md`

## Exact Contamination

The exact contamination is a stale sibling-branch snapshot:

1. `origin/codex/p2-ui-ops-001` forked from `8da514a8e` before the A4 canvas
   landed on trunk and then stopped after one blocker-note commit.
2. Current `origin/dev` forked from the same base and moved forward with the
   canonical design authority at `7a99c347c`, but the parent task's machine
   truth still points at the old blocker branch.
3. Because the old branch has no PR, no implementation commits, and now-obsolete
   blocker text, it is not a safe delivery rail and should not be merged or
   replayed wholesale.

This is branch/commit routing contamination, not missing UI work or missing
canvas on trunk.

## Non-Destructive Repair Path

Do not force-push, rebase, or amend `origin/codex/p2-ui-ops-001`.

1. Freeze `origin/codex/p2-ui-ops-001 @ c9e2d95d7` as audit evidence of the
   pre-canvas blocked state.
2. Do not cherry-pick that old commit verbatim onto current trunk. It embeds
   stale "missing canvas" assertions and trailing whitespace noise.
3. Start a fresh parent branch from current `origin/dev` instead:

```bash
git fetch origin
git switch -c codex/p2-ui-ops-001-replay origin/dev
```

4. Resume `P2-UI-OPS-001` implementation directly against the canonical visual
   authority now on trunk:
   - `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx`
   - `docs/05-ui/drts-design-canvas/Ops Console.html`
   - realm tokens from `packages/ui-tokens`
5. If any evergreen constraints from the old blocker note are still useful,
   port only those specific invariants manually after removing the obsolete
   blocker language. Do not merge the note wholesale.
6. For `OC_SandboxExceptions`, either:
   - add a narrow controller read route for `listFallbackReports()` on the new
     replay branch, or
   - spin a small follow-up API task before parent closeout if the owner wants
     to keep the UI branch frontend-only.
7. Continue the parent through the normal non-force rail:
   - anchor commit on the fresh branch
   - push the fresh branch
   - open a PR to `dev`
   - hand off review on the new branch instead of the stale one

## Concrete Parent Next Step

`P2-UI-OPS-001` should stop treating `origin/codex/p2-ui-ops-001 @ c9e2d95d7`
as its delivery branch.

Concrete next step:

1. Create `codex/p2-ui-ops-001-replay` from current `origin/dev`.
2. Implement `OC_AvFallback`, `OC_PassengerRecovery`, and
   `OC_SandboxExceptions` from the delivered A4 canvas on that new branch.
3. Reuse the old blocker note only as audit context; do not replay it as-is.
4. If the sandbox exceptions list still lacks a GET route, add or split that
   route before final parent closeout.
5. Review and merge the fresh branch through the normal `dev` PR flow.

The parent should no longer wait on missing canvas. The branch history is what
needed repair.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The stale blocked branch remains reachable for audit.
- The repair path resumes from the current canonical design authority on trunk.
- The path avoids merging an obsolete blocker note into `dev`.
- The remaining API caveat is isolated to the new parent rail instead of being
  hidden inside stale branch history.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` §11
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show P2-UI-OPS-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-UI-OPS-001`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-DP-C3-001`
- Inspected refs and worktrees:
  - `git fetch origin --prune`
  - `git branch --show-current`
  - `git status --short --branch`
  - `git worktree list --porcelain`
  - `git branch -vv | sed -n '/codex\\/p2-ui-ops-001/p'`
  - `git ls-remote --heads origin 'refs/heads/codex/p2-ui-ops-001'`
  - `git log --oneline --decorate --graph origin/dev..origin/codex/p2-ui-ops-001`
  - `git rev-list --left-right --count origin/dev...origin/codex/p2-ui-ops-001`
  - `git merge-base origin/dev origin/codex/p2-ui-ops-001`
  - `git show -s --format='commit %H%nparents %P%nsubject %s%n' c9e2d95d7 8da514a8e 7a99c347c`
  - `git reflog show --date=iso codex/p2-ui-ops-001`
  - `gh pr list --state all --head codex/p2-ui-ops-001 --json number,title,headRefName,baseRefName,state,mergeStateStatus,url`
- Inspected design-authority and blocker-note drift:
  - `find docs/05-ui/drts-design-canvas -maxdepth 2 \\( -name 'ops-av-fallback*' -o -name '*av-fallback*' \\)`
  - `grep -RIn 'OC_AvFallback\\|OC_PassengerRecovery\\|OC_SandboxExceptions\\|ops-av-fallback' docs/05-ui/drts-design-canvas docs/05-ui`
  - `git show origin/codex/p2-ui-ops-001:docs/05-ui/ops-console-av-fallback-screen-requirements-20260626.md`
  - `sed -n '1,120p' docs/02-architecture/phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md`
  - `git rev-parse c9e2d95d7^{tree} origin/codex/p2-ui-ops-001^{tree}`
  - `git diff --check origin/dev...origin/codex/p2-ui-ops-001`
- Inspected dependency and API evidence:
  - `git log origin/dev --oneline --grep='P2-FBK-001' -n 20`
  - `git show -s --format='commit %H%nsubject %s%nparents %P%n' c4126ee88 78e01dcae`
  - `git grep -n 'listFallbackReports' -- apps/api/src/modules/roc-operations`
  - `sed -n '1,220p' apps/api/src/modules/roc-operations/roc-operations.controller.ts`
  - `sed -n '220,340p' apps/api/src/modules/roc-operations/roc-operations.service.ts`

No runtime or package tests were run. This task is branch/history/machine-truth
repair only.
