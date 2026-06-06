# E2E-TENBIZ-012 Unblock History Repair

## Scope

- Task: `E2E-TENBIZ-012-UNBLOCK-HISTORY-REPAIR`
- Parent: `E2E-TENBIZ-012`
- Parent owner / reviewer: `Codex2` / `Claude2`
- Helper owner / reviewer: `Codex` / `Claude`
- Audit timestamp: `2026-06-06`

## Diagnosis

The parent is not blocked by a missing helper artifact. It is blocked by split
branch lineage plus owner-branch contamination.

1. The pushed Codex branch `origin/codex/e2e-tenbiz-012 @ ca523e63` contains
   only the E2E shell work, but it is on the reviewer lane rather than the
   parent owner lane.
2. The actual owner branch `codex2/e2e-tenbiz-012 @ a2193c74` is local-only,
   has no `origin/codex2/e2e-tenbiz-012` remote, and is `ahead 5, behind 3`
   relative to current `origin/dev`.
3. That local-only owner branch is not a pure E2E branch. It bundles two
   `BE-TENBIZ-001` commits (`8deac13f`, `0d04bc77`) together with the E2E work,
   so pushing it as-is would publish mixed parent/dependency history.
4. Both branch families still fork from the old merge-base `1a5f8b86`, while
   current trunk has already moved through `63d2ba58`, `a06f135d`, and
   `aee8a965`.

The exact blockage is therefore branch/worktree/commit contamination: the only
pushed branch for the task lives on the wrong lane, while the correct owner lane
has only an unpublished, stale, dependency-mixed branch.

## Evidence

### Branch and remote state

- `origin/dev @ aee8a9659a958ec63e85440cf6a9b34824b668dd`
- pushed reviewer-lane branch:
  `origin/codex/e2e-tenbiz-012 @ ca523e63f952e13f7b7f55df4e7aaaa33099a999`
- local-only owner-lane branch:
  `codex2/e2e-tenbiz-012 @ a2193c74c51a794341429f7f7b1fb67152592f53`
- no remote ref exists for `refs/heads/codex2/e2e-tenbiz-012`
- no PR currently exists for:
  - `codex/e2e-tenbiz-012`
  - `codex2/e2e-tenbiz-012`
  - `codex/e2e-tenbiz-012-unblock-history-repair`

### Divergence from current trunk

- `git rev-list --left-right --count origin/dev...origin/codex/e2e-tenbiz-012`
  returns `3 8`
- `git rev-list --left-right --count origin/dev...codex2/e2e-tenbiz-012`
  returns `3 5`
- `git merge-base origin/dev codex/e2e-tenbiz-012`
  and `git merge-base origin/dev codex2/e2e-tenbiz-012` both return
  `1a5f8b86f48e9c5cacedd3cf9cbe15964216ede4`

### Diff shape by branch

Against `origin/dev`, the pushed Codex branch changes only:

- `A tests/e2e/E2E-012-tenant-business-operations.sh`
- `M tests/e2e/README.md`

Against `origin/dev`, the local-only Codex2 branch changes:

- `A tests/e2e/E2E-012-tenant-business-operations.sh`
- `M apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
- `M apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`
- `M apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
- `M apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `M apps/api/src/modules/tenant-partner/tenant-partner.module.ts`
- `M apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `M apps/api/tests/unit/billing-settlement.service.test.ts`
- `M apps/api/tests/unit/tenant-partner.service.test.ts`
- `M packages/api-client/src/index.ts`
- `M packages/contracts/src/index.ts`

### Commit composition

`codex/e2e-tenbiz-012` contains only E2E task commits:

- `e79a3864` `wip(E2E-TENBIZ-012): anchor e2e shell`
- `3dd98b12` `wip(E2E-TENBIZ-012): anchor tenant audit surface`
- `aee4470e` `wip(E2E-TENBIZ-012): anchor e2e evidence handling`
- `a8d9eb22` `wip(E2E-TENBIZ-012): anchor probe evidence surfaces`
- `ca7c6809` `wip(E2E-TENBIZ-012): anchor tenant business shell`
- `363a7f52` `wip(E2E-TENBIZ-012): anchor e2e shell hardening`
- `13eef668` `wip(E2E-TENBIZ-012): anchor task resolution fallback`
- `ca523e63` `wip(E2E-TENBIZ-012): anchor report contract`

`codex2/e2e-tenbiz-012` mixes parent and dependency commits:

- `057eb682` `wip(E2E-TENBIZ-012): anchor e2e shell`
- `fd4c4439` `wip(E2E-TENBIZ-012): anchor tenant audit surface`
- `8deac13f` `BE-TENBIZ-001: add tenant business ops APIs`
- `0d04bc77` `BE-TENBIZ-001: restore tenant payable rider and cost center filters`
- `a2193c74` `wip(E2E-TENBIZ-012): harden tenant business ops e2e`

## Exact Contamination

The contamination is a four-part mismatch:

1. Parent machine truth names `Codex2` as the owner, but the only pushed task
   branch is `origin/codex/e2e-tenbiz-012` on the wrong lane.
2. The correct owner branch exists only locally, so there is no canonical pushed
   owner rail for review, handoff, or closeout.
3. The owner branch mixes `E2E-TENBIZ-012` commits with `BE-TENBIZ-001`
   dependency commits, so it cannot be pushed as the clean parent branch without
   publishing unrelated history.
4. Both lineages are still based on `1a5f8b86`, so even the pure E2E branch must
   be replayed onto current `origin/dev` before it becomes the canonical parent
   delivery rail.

## Non-Destructive Repair Path

Do not force-push, rewrite, or publish the contaminated local owner branch.

Repair by preserving the existing branches as audit history and creating a fresh
owner-lane replay branch from current `origin/dev` that contains only the E2E
commits.

1. Keep these existing branches unchanged:
   - `origin/codex/e2e-tenbiz-012` as audit-only E2E history
   - local `codex2/e2e-tenbiz-012` as the contaminated source branch
2. Reuse the existing owner worktree
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-e2e-tenbiz-012`,
   but do not push its current HEAD.
3. Create a fresh replay branch from current `origin/dev`:

```bash
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-e2e-tenbiz-012 fetch origin
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-e2e-tenbiz-012 switch -c codex2/e2e-tenbiz-012-replay origin/dev
```

4. Cherry-pick only the pure E2E commits from the pushed Codex branch:

```bash
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-e2e-tenbiz-012 cherry-pick \
  e79a3864 3dd98b12 aee4470e a8d9eb22 ca7c6809 363a7f52 13eef668 ca523e63
```

5. If current trunk still needs backend support that is not yet on `dev`,
   replay that dependency through its own task branch first. Do not re-import
   `8deac13f` or `0d04bc77` through the E2E parent branch.
6. Push the clean owner replay branch and use it as the canonical parent rail:

```bash
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-e2e-tenbiz-012 push -u origin codex2/e2e-tenbiz-012-replay
```

7. Resume the parent from that pushed clean branch, then continue the already
   known runtime blocker sequence for staging IAP credentials / alternate
   reachable staging base URL.

## Parent Next Step

The concrete next step for `E2E-TENBIZ-012` is:

1. `Codex2` must not push the current local `codex2/e2e-tenbiz-012` branch.
2. `Codex2` should cut `codex2/e2e-tenbiz-012-replay` from current `origin/dev`
   and cherry-pick only the eight E2E commits from
   `origin/codex/e2e-tenbiz-012`.
3. After that replay branch is pushed, the parent can continue its existing live
   blocker on staging ingress auth with a clean owner history.

That unblocks the history question without rewriting any shared branch.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The contaminated local-only owner branch stays unpublished.
- The pushed Codex branch remains available as immutable audit evidence.
- The eventual canonical owner branch is rebuilt from current `origin/dev`
  without carrying dependency commits on the wrong task branch.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md` and
  `.orchestrator/skills/worker-anchor-commit.md`
- Checked task slices with:
  - `AI_NAME=Codex scripts/ai-status.sh show E2E-TENBIZ-012`
  - `AI_NAME=Codex scripts/ai-status.sh show E2E-TENBIZ-012-UNBLOCK-HISTORY-REPAIR`
- Compared branch/worktree state:
  - `git branch -vv | grep 'e2e-tenbiz-012'`
  - `git worktree list --porcelain`
  - `git ls-remote --heads origin 'refs/heads/codex/e2e-tenbiz-012' 'refs/heads/codex2/e2e-tenbiz-012' 'refs/heads/codex/e2e-tenbiz-012-unblock-history-repair'`
  - `git rev-list --left-right --count origin/dev...origin/codex/e2e-tenbiz-012`
  - `git rev-list --left-right --count origin/dev...codex2/e2e-tenbiz-012`
  - `git merge-base origin/dev codex/e2e-tenbiz-012`
  - `git merge-base origin/dev codex2/e2e-tenbiz-012`
  - `git diff --name-status origin/dev...origin/codex/e2e-tenbiz-012`
  - `git diff --name-status origin/dev...codex2/e2e-tenbiz-012`
  - `git log --oneline --reverse 1a5f8b86..codex/e2e-tenbiz-012`
  - `git log --oneline --reverse 1a5f8b86..codex2/e2e-tenbiz-012`
- Checked PR visibility:
  - `gh pr list --state all --head codex:e2e-tenbiz-012`
  - `gh pr list --state all --head codex2:e2e-tenbiz-012`
  - `gh pr list --state all --head codex:e2e-tenbiz-012-unblock-history-repair`
