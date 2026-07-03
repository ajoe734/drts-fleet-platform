# MAP-FE-CON-001 Unblock History Repair

## Scope

- Task: `MAP-FE-CON-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `MAP-FE-CON-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-07-03T17:20:51Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-map-fe-con-001-unblock-history-repair`
- Assigned helper branch:
  `codex/map-fe-con-001-unblock-history-repair`

## Diagnosis

`MAP-FE-CON-001` is not blocked by missing feature code. The pushed delivery
rail exists, but the local owner/reviewer refs and the recorded review evidence
around it are contaminated enough that resuming from the wrong place would
either require a force-push or silently drop task commits.

1. The canonical published parent rail is
   `origin/codex2/map-fe-con-001 @ f58702a765ee05df64942570be7cf5a351d709bd`,
   which is the head of draft PR `#1043` to `dev`.
2. That remote parent branch is structurally clean relative to `origin/dev`:
   `git rev-list --left-right --count origin/dev...origin/codex2/map-fe-con-001`
   returns `2 6`, `git log --oneline origin/dev..origin/codex2/map-fe-con-001`
   shows exactly six `MAP-FE-CON-001` commits, and
   `git diff --check origin/dev...origin/codex2/map-fe-con-001` is clean.
3. Local `codex2/map-fe-con-001 @ 868454cc6878685fcf16ff20d1c32bd9602ebd2f`
   was rebased after the PR branch was pushed. Its reflog ends with
   `rebase (finish): refs/heads/codex2/map-fe-con-001 onto a3d8ccb7bd73cc22836638ec931f72730942fdf6`.
4. The local owner branch no longer matches its upstream:
   `git rev-list --left-right --count origin/codex2/map-fe-con-001...codex2/map-fe-con-001`
   returns `6 8`. Reusing it as the PR rail would require rewriting the shared
   remote branch.
5. `git range-diff origin/dev...origin/codex2/map-fe-con-001 origin/dev...codex2/map-fe-con-001`
   shows the six task commits were rewritten onto newer `origin/dev`, while the
   local-only history also carries the newer base commits
   `55eceed7f` (`MAP-OBS-001`) and `a3d8ccb7b` (`MAP-QA-001`).
6. Detached worktree `/tmp/codex-map-fe-con-001-owner-review` points at older
   commit `cebd7120f0ed88fbeb404f691bb3bb52b47c883b`
   (`MAP-FE-CON-001: align partner build with linked worktrees`) and has no
   branch attached. Resuming there would drop the later review-gating and final
   closeout commits.
7. Reviewer-lane local branch `codex/map-fe-con-001 @ f452f019f9d887850c907a28a60ce627b930049b`
   is unrelated noise. It was created from `origin/dev` on `2026-07-01` and
   points at `MAP-OBS-001-SIDECAR-FINAL-EVIDENCE-INTEGRATE-UNBLOCK`, not at any
   `MAP-FE-CON-001` content. There is no `origin/codex/map-fe-con-001` remote
   ref.
8. The existing reviewer artifact
   `support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-REVIEW-EVIDENCE-20260701.md`
   is not canonical branch evidence. Its header explicitly says it was
   generated from `phase2-tesla-sandbox-docs-20260625@d73cab191` plus
   uncommitted `MAP-FE-CON-001` worktree changes.

The parent is therefore blocked by resume-rail contamination, not by a missing
implementation diff.

## Evidence

### Canonical published parent rail

- `origin/dev @ a3d8ccb7bd73cc22836638ec931f72730942fdf6`
- `origin/codex2/map-fe-con-001 @ f58702a765ee05df64942570be7cf5a351d709bd`
- `gh pr view 1043 --json ...` reports:
  - state: `OPEN`
  - draft: `true`
  - base: `dev`
  - head: `codex2/map-fe-con-001`
  - merge state: `BLOCKED`
- `gh pr checks 1043` at audit time shows all listed checks passing except
  `e2e`, which is still `pending`
- `git log --oneline origin/dev..origin/codex2/map-fe-con-001` shows:
  - `01678fe83` `wip(MAP-FE-CON-001): anchor concierge and partner map gate integration`
  - `d2e68491c` `wip(MAP-FE-CON-001): anchor outage manual-review gate`
  - `cebd7120f` `MAP-FE-CON-001: align partner build with linked worktrees`
  - `b6ae1a245` `wip(MAP-FE-CON-001): anchor concierge map review gating`
  - `37755088d` `wip(MAP-FE-CON-001): anchor concierge map gate and partner ui-web resolution`
  - `f58702a76` `MAP-FE-CON-001: finalize concierge and partner map alignment`
- `git diff --name-only origin/dev...origin/codex2/map-fe-con-001` confirms a
  task-owned 23-file delta across:
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - `apps/api/tests/unit/owned-mobility.service.test.ts`
  - `apps/concierge-portal-web/**`
  - `apps/partner-booking-web/**`
  - `packages/contracts/src/index.ts`
  - `packages/ui-web/**`
  - `pnpm-lock.yaml`

### Diverged local owner rail

- local `codex2/map-fe-con-001 @ 868454cc6878685fcf16ff20d1c32bd9602ebd2f`
- upstream `origin/codex2/map-fe-con-001 @ f58702a765ee05df64942570be7cf5a351d709bd`
- `git rev-list --left-right --count origin/codex2/map-fe-con-001...codex2/map-fe-con-001`:
  `6 8`
- `git reflog show --date=iso codex2/map-fe-con-001` ends with:
  - `2026-07-03 17:11:49 +0000 rebase (finish): refs/heads/codex2/map-fe-con-001 onto a3d8ccb7bd73cc22836638ec931f72730942fdf6`
  - `2026-07-03 17:10:06 +0000 commit: MAP-FE-CON-001: finalize concierge and partner map alignment`
- local-only commits relative to the upstream rail:
  - `9a62d7987` `wip(MAP-FE-CON-001): anchor concierge and partner map gate integration`
  - `8c005d34e` `wip(MAP-FE-CON-001): anchor outage manual-review gate`
  - `d2b1e6a73` `MAP-FE-CON-001: align partner build with linked worktrees`
  - `e4e766055` `wip(MAP-FE-CON-001): anchor concierge map review gating`
  - `2468f6530` `wip(MAP-FE-CON-001): anchor concierge map gate and partner ui-web resolution`
  - `868454cc6` `MAP-FE-CON-001: finalize concierge and partner map alignment`
  - `a3d8ccb7b` `MAP-QA-001: offline map geofence harness`
  - `55eceed7f` `[codex] MAP-OBS-001 spatial observability and audit (#1039)`

### Stale resume lookalikes

- detached worktree `/tmp/codex-map-fe-con-001-owner-review`
  - `git -C /tmp/codex-map-fe-con-001-owner-review symbolic-ref --short -q HEAD`
    returns no branch (`DETACHED`)
  - `git -C /tmp/codex-map-fe-con-001-owner-review rev-parse HEAD`
    returns `cebd7120f0ed88fbeb404f691bb3bb52b47c883b`
- local reviewer branch `codex/map-fe-con-001`
  - `git branch -vv` labels it `[origin/dev: behind 13] MAP-OBS-001-SIDECAR-FINAL-EVIDENCE-INTEGRATE-UNBLOCK`
  - `git reflog show --date=iso codex/map-fe-con-001` has only:
    `2026-07-01 14:50:01 +0000 branch: Created from origin/dev`
  - `git ls-remote --heads origin 'refs/heads/codex/map-fe-con-001'`
    returns no remote ref

### Non-canonical review artifact

- `/home/edna/workspace/drts-fleet-platform/support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-REVIEW-EVIDENCE-20260701.md`
  states:
  `Branch/SHA: phase2-tesla-sandbox-docs-20260625@d73cab191 plus uncommitted worktree MAP-FE-CON-001 changes`
- That artifact may still be useful as qualitative review context, but it is
  not valid branch-provenance evidence for resuming or closing out the parent
  task.

## Exact Contamination

The exact contamination is four-part:

1. The real delivery rail is the pushed remote branch
   `origin/codex2/map-fe-con-001 @ f58702a76`, but the local owner branch was
   rebased after push and now diverges from that shared rail.
2. The rebased local owner branch includes rewritten task commits on top of a
   newer `origin/dev` baseline. Updating the existing PR branch with that local
   history would require a force-push, which this repair explicitly forbids.
3. Two lookalike local resume points remain in the clone:
   detached `/tmp/codex-map-fe-con-001-owner-review @ cebd7120f` and stale
   reviewer branch `codex/map-fe-con-001 @ f452f019f`. One drops newer task
   commits; the other points at unrelated `MAP-OBS-001` content.
4. The recorded review evidence file was generated from an unrelated branch plus
   dirty working-tree changes, so it cannot be treated as canonical branch
   history evidence.

This is why the parent remains blocked even though the feature diff and the
published PR branch are real: the branch/worktree provenance around the task is
ambiguous enough that a normal resume could easily continue on the wrong rail or
try to rewrite shared history.

## Non-Destructive Repair Path

Do not force-push, amend, or rename any existing shared branch.

1. Treat `origin/codex2/map-fe-con-001 @ f58702a76` and draft PR `#1043` as the
   canonical published rail for the current task diff.
2. Preserve local `codex2/map-fe-con-001 @ 868454cc6`, local
   `codex/map-fe-con-001 @ f452f019f`, and detached
   `/tmp/codex-map-fe-con-001-owner-review @ cebd7120f` only as audit
   evidence. Do not resume implementation from any of them.
3. If no new code changes are needed, continue the existing PR path from the
   pushed remote branch: lift draft when ready, let `e2e` finish, and merge the
   published rail. Do not regenerate branch evidence from
   `phase2-tesla-sandbox-docs-20260625` or any dirty worktree.
4. If any new code change or branch refresh is required, create a fresh additive
   replay branch from current `origin/dev` instead of rewriting PR `#1043`:

```bash
git fetch origin
git switch -c codex2/map-fe-con-001-linearized origin/dev
git cherry-pick 9a62d7987 8c005d34e d2b1e6a73 e4e766055 2468f6530 868454cc6
git push -u origin codex2/map-fe-con-001-linearized
gh pr create --draft --base dev --head codex2/map-fe-con-001-linearized \
  --title "[codex2] MAP-FE-CON-001 concierge and partner map alignment (linearized)"
```

5. Regenerate any future review or acceptance artifact from the canonical
   branch/worktree used for delivery, with a clean `Branch/SHA`, not from an
   unrelated branch plus uncommitted diffs.
6. After the fresh replay branch or the existing published rail is chosen,
   continue the normal owner `handoff -> approve -> done` path with explicit PR
   and CI evidence.

## Concrete Parent Next Step

`MAP-FE-CON-001` should not resume from the local rebased branch, the detached
owner-review worktree, or the stale reviewer branch.

Concrete next step:

1. Use `origin/codex2/map-fe-con-001 @ f58702a76` as the only current shared
   delivery rail.
2. If PR `#1043` needs no more code changes, continue that PR to merge once the
   remaining `e2e` check clears and the draft state is lifted.
3. If any code change or rebase-to-current-`dev` is needed, create
   `codex2/map-fe-con-001-linearized` from `origin/dev`, cherry-pick
   `9a62d7987 8c005d34e d2b1e6a73 e4e766055 2468f6530 868454cc6`, then push a
   new PR instead of rewriting `origin/codex2/map-fe-con-001`.
4. Replace the old review-evidence provenance with branch/SHA evidence from the
   selected canonical rail before final closeout.

## Why This Is Safe

- no shared ref is rewritten
- no force-push is required
- the existing PR branch remains available for audit and possible merge as-is
- the local contaminated refs/worktrees remain reachable as evidence instead of
  being hidden
- if a replay branch is needed, it is additive and starts from current
  `origin/dev`, which matches the protected `dev` workflow in
  `docs/ops/branch-strategy.md` §11.5 and §11.6

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- checked task machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CON-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CON-001`
  - `AI_NAME=Codex scripts/ai-status.sh start MAP-FE-CON-001-UNBLOCK-HISTORY-REPAIR "Inspect branch/worktree/commit contamination and document non-destructive repair path for MAP-FE-CON-001"`
- inspected parent and helper refs:
  - `git branch -vv --list 'codex/map-fe-con-001' 'codex2/map-fe-con-001' 'codex/map-fe-con-001-unblock-history-repair' 'claude/map-fe-con-001-sidecar-acceptance' 'codex2/map-fe-con-001-sidecar-acceptance'`
  - `git ls-remote --heads origin 'refs/heads/codex/map-fe-con-001' 'refs/heads/codex2/map-fe-con-001' 'refs/heads/codex/map-fe-con-001-unblock-history-repair' 'refs/heads/claude/map-fe-con-001-sidecar-acceptance' 'refs/heads/codex2/map-fe-con-001-sidecar-acceptance'`
  - `git worktree list --porcelain`
  - `git reflog show --date=iso codex/map-fe-con-001`
  - `git reflog show --date=iso codex2/map-fe-con-001`
  - `git rev-list --left-right --count origin/dev...origin/codex2/map-fe-con-001`
  - `git rev-list --left-right --count origin/codex2/map-fe-con-001...codex2/map-fe-con-001`
  - `git range-diff origin/dev...origin/codex2/map-fe-con-001 origin/dev...codex2/map-fe-con-001`
  - `git diff --check origin/dev...origin/codex2/map-fe-con-001`
  - `git diff --name-only origin/dev...origin/codex2/map-fe-con-001`
- inspected detached and stale resume points:
  - `git -C /tmp/codex-map-fe-con-001-owner-review symbolic-ref --short -q HEAD || echo DETACHED`
  - `git -C /tmp/codex-map-fe-con-001-owner-review rev-parse HEAD`
  - `git show --no-patch --format=fuller f452f019f cebd7120f f58702a76 868454cc6`
- inspected PR and artifact provenance:
  - `gh pr view 1043 --json number,state,title,baseRefName,headRefName,headRepositoryOwner,commits,mergeStateStatus,isDraft,url`
  - `gh pr checks 1043`
  - `sed -n '1,260p' /home/edna/workspace/drts-fleet-platform/support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-REVIEW-EVIDENCE-20260701.md`

No runtime or package tests were run in this helper task. This repair is
branch-history and provenance triage only.
