# P2-UI-OPS-001 Unblock History Repair

## Scope

- Task: `P2-UI-OPS-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-UI-OPS-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Revalidated on: `2026-06-26` after `git fetch origin --prune`
- Canonical machine-truth root:
  `/home/edna/workspace/drts-fleet-platform`
- Parent worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-ui-ops-001`
- Repair helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-ui-ops-001-unblock-history-repair`

## Revalidated Repo State

- `origin/dev @ 346b656d82f12b82936aa6ac7fa15ff016f01062`
- `origin/codex/p2-ui-ops-001 @ c9e2d95d7152ecd62a33734b7c842eb36bd45472`
- local parent branch
  `codex/p2-ui-ops-001 @ 4ecf2d31b3bb7d7048f3e9ab94d4e0fe16879b27`
- helper branch
  `codex/p2-ui-ops-001-unblock-history-repair @ d126cc293e4b3af388490b036e3b84ff4c95f686`

The earlier helper packet on this branch was anchored when `origin/dev` still
resolved to `7a99c347c4de0472375a9102285e789b81aa4264`. Any earlier statement
that `origin/dev...origin/codex/p2-ui-ops-001` was `1 1` must therefore be read
as audit-time evidence only, not as the current repo state.

## Exact Contamination

The parent is blocked by a branch-name split across the remote branch, the local
parent worktree, and the blocker-note commit history:

1. `origin/codex/p2-ui-ops-001` is still the old pre-canvas blocker branch. It
   contains one task commit, `c9e2d95d7`, based on `8da514a8e`.
2. The local parent worktree reuses the same branch name,
   `codex/p2-ui-ops-001`, but it now points at `4ecf2d31b` on top of current
   trunk `346b656d8`.
3. Both task commits use the same subject,
   `wip(P2-UI-OPS-001): anchor av-fallback screen requirements`, and both serve
   only to add the blocker note
   `docs/05-ui/ops-console-av-fallback-screen-requirements-20260626.md`. They
   are not implementation commits.
4. Because the local and remote refs with the same branch name now sit on
   incompatible histories, a normal push is rejected:

   ```bash
   git push --dry-run origin codex/p2-ui-ops-001
   # ! [rejected] ... (non-fast-forward)
   ```

5. The blocker note itself is obsolete on current trunk: `origin/dev` already
   contains `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx` and the
   `Ops Console.html` artboards for the A4 AV fallback surfaces.

This is the exact contamination keeping the parent blocked: the same branch name
now means two different blocker-note histories, and neither one is the right
delivery rail for resumed UI implementation.

## Reproducible Evidence

### Parent branch split

- `git rev-list --left-right --count origin/dev...origin/codex/p2-ui-ops-001`
  returns `2 1`
- `git rev-list --left-right --count origin/dev...codex/p2-ui-ops-001`
  returns `0 1`
- `git merge-base origin/dev origin/codex/p2-ui-ops-001`
  returns `8da514a8eab790d08046481f7c50ea07d8763c00`
- `git merge-base origin/dev codex/p2-ui-ops-001`
  returns `346b656d82f12b82936aa6ac7fa15ff016f01062`
- `git branch -vv | sed -n '/codex\\/p2-ui-ops-001/p'` shows the checked-out
  parent worktree branch is `[origin/codex/p2-ui-ops-001: ahead 3, behind 1]`
- `git log --oneline --decorate --graph --left-right origin/codex/p2-ui-ops-001...codex/p2-ui-ops-001`
  shows:
  - local-only `4ecf2d31b` on top of `346b656d8` and `7a99c347c`
  - remote-only `c9e2d95d7`

### Duplicate blocker-note commit

- `git show -s --format='commit %H%nparents %P%nsubject %s%nbody %b' 4ecf2d31b c9e2d95d7`
  shows both commits share the same subject and trailers
- `git show --stat --summary 4ecf2d31b -- docs/05-ui/ops-console-av-fallback-screen-requirements-20260626.md`
  shows the local replay commit only creates the blocker-note file
- `gh pr list --state all --head codex/p2-ui-ops-001 --json number,title,headRefName,baseRefName,state,mergeStateStatus,url`
  returns `[]`

### Obsolete blocker premise

- `find docs/05-ui/drts-design-canvas -maxdepth 1 \\( -name 'ops-av-fallback.jsx' -o -name 'Ops Console.html' \\) -print`
  shows both canonical visual authority files now exist on trunk
- `grep -n "A4\\|Ops AV fallback\\|2026-06-26" docs/02-architecture/phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md`
  shows:
  - canvas delivered on `2026-06-26`
  - A4 `Ops AV fallback` maps to `ops-av-fallback.jsx`
  - UI build second wave already dispatched
- `git show origin/codex/p2-ui-ops-001:docs/05-ui/ops-console-av-fallback-screen-requirements-20260626.md`
  still says implementation must wait for the missing canvas

### Dependency evidence correction

The prior helper packet cited:

```bash
AI_NAME=Codex scripts/ai-status.sh show P2-DP-C3-001
```

That command is not reproducible in the current machine-truth store; it now
returns `Task not found: P2-DP-C3-001`.

Use these reproducible replacements instead:

- `git log origin/dev --oneline --grep='P2-DP-C3-001' -n 5`
  shows `78e01dcae P2-DP-C3-001: sandbox fulfillment visibility contract closeout (#912)`
- `git log origin/dev --oneline --grep='P2-FBK-001' -n 5`
  shows `c4126ee88 P2-FBK-001: integrate fallback route registration to dev (#901)`

## Non-Destructive Repair Path

Do not force-push, rebase-push, or merge the stale parent branch name.

1. Freeze both blocker-note commits as audit artifacts only:
   - remote stale commit `c9e2d95d7`
   - local replay commit `4ecf2d31b`
2. Do not push local `codex/p2-ui-ops-001` to `origin/codex/p2-ui-ops-001`.
   The normal push already fails non-fast-forward, and a force-push would
   rewrite shared history.
3. Do not merge or cherry-pick either blocker-note commit into `dev`. They
   encode an obsolete "missing canvas" premise.
4. In the existing parent worktree, start a fresh delivery branch from current
   trunk instead:

   ```bash
   cd /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-ui-ops-001
   git fetch origin --prune
   git switch -c codex/p2-ui-ops-001-replay origin/dev
   ```

5. Resume `P2-UI-OPS-001` implementation on that new branch against the current
   canonical visual authority:
   - `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx`
   - `docs/05-ui/drts-design-canvas/Ops Console.html`
   - `packages/ui-tokens`
6. Treat `docs/05-ui/ops-console-av-fallback-screen-requirements-20260626.md`
   as audit context only. If any evergreen invariant is still useful, copy it
   manually after removing the obsolete blocker language.
7. For `OC_SandboxExceptions`, keep the already-known API caveat explicit:
   `RocOperationsService.listFallbackReports()` exists, but the controller still
   lacks a read route. Add that route on the replay branch or split a follow-up
   task before parent closeout.
8. Push the replay branch under the new name, open a PR to `dev`, and continue
   the normal review rail there.

## Concrete Parent Next Step

`P2-UI-OPS-001` should stop treating `codex/p2-ui-ops-001` as a publishable
branch name.

Concrete next step:

1. Enter the existing parent worktree at
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-ui-ops-001`.
2. Create `codex/p2-ui-ops-001-replay` from `origin/dev`.
3. Implement `OC_AvFallback`, `OC_PassengerRecovery`, and
   `OC_SandboxExceptions` from the delivered A4 canvas on that new branch.
4. Leave `c9e2d95d7` and `4ecf2d31b` untouched as branch-history audit evidence.
5. If the sandbox exceptions list still needs a GET route, add or split it
   before parent closeout.

The parent is no longer blocked on missing design authority. It is blocked only
if it keeps trying to reuse the contaminated branch name.

## Why This Is Safe

- No shared ref is rewritten.
- The non-fast-forward push failure is avoided instead of bypassed.
- Both stale blocker-note commits remain reachable for audit.
- The new implementation branch starts from current `origin/dev`.
- The repair path avoids merging obsolete blocker text into trunk.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` §11
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show P2-UI-OPS-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-UI-OPS-001`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-DP-C3-001`
- Inspected current refs and worktrees:
  - `git fetch origin --prune`
  - `git branch --show-current`
  - `git status --short --branch`
  - `git rev-parse origin/dev origin/codex/p2-ui-ops-001 codex/p2-ui-ops-001 codex/p2-ui-ops-001-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex/p2-ui-ops-001`
  - `git rev-list --left-right --count origin/dev...codex/p2-ui-ops-001`
  - `git merge-base origin/dev origin/codex/p2-ui-ops-001`
  - `git merge-base origin/dev codex/p2-ui-ops-001`
  - `git branch -vv | sed -n '/codex\\/p2-ui-ops-001/p'`
  - `git log --oneline --decorate --graph --left-right origin/codex/p2-ui-ops-001...codex/p2-ui-ops-001`
  - `git worktree list --porcelain | sed -n '/codex-p2-ui-ops-001$/,/^$/p'`
  - `git push --dry-run origin codex/p2-ui-ops-001`
  - `gh pr list --state all --head codex/p2-ui-ops-001 --json number,title,headRefName,baseRefName,state,mergeStateStatus,url`
- Inspected blocker-note and design-authority drift:
  - `git show -s --format='commit %H%nparents %P%nsubject %s%nbody %b' 4ecf2d31b c9e2d95d7`
  - `git show --stat --summary 4ecf2d31b -- docs/05-ui/ops-console-av-fallback-screen-requirements-20260626.md`
  - `git show origin/codex/p2-ui-ops-001:docs/05-ui/ops-console-av-fallback-screen-requirements-20260626.md`
  - `find docs/05-ui/drts-design-canvas -maxdepth 1 \\( -name 'ops-av-fallback.jsx' -o -name 'Ops Console.html' \\) -print`
  - `grep -n "A4\\|Ops AV fallback\\|2026-06-26" docs/02-architecture/phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md`
- Corrected dependency evidence:
  - `git log origin/dev --oneline --grep='P2-DP-C3-001' -n 5`
  - `git log origin/dev --oneline --grep='P2-FBK-001' -n 5`
- Rechecked the remaining API caveat:
  - `git grep -n 'listFallbackReports' -- apps/api/src/modules/roc-operations`
  - `sed -n '1,260p' apps/api/src/modules/roc-operations/roc-operations.controller.ts`
  - `sed -n '220,360p' apps/api/src/modules/roc-operations/roc-operations.service.ts`

No runtime or package tests were run. This task is branch/worktree/history
repair only.
