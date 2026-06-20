# MOB-APP-002 Unblock History Repair

## Scope

- Task: `MOB-APP-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `MOB-APP-002`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-06-20T12:00:38Z`
- Canonical machine-truth root:
  `/home/edna/workspace/drts-fleet-platform`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-mob-app-002-unblock-history-repair`
- Assigned helper branch:
  `codex/mob-app-002-unblock-history-repair`

## Diagnosis

`MOB-APP-002` is blocked by mixed branch/worktree/commit history, not by a
missing Driver App offline-queue implementation.

1. The local owner branch still carries the expected task stack:
   `codex/mob-app-002 @ 577d19c99b0affa6b56e3f845582697fa0c1e9d8`
   (`feat(MOB-APP-002): finalize durable offline queue`).
2. The published owner branch does not match that local task stack.
   `origin/codex/mob-app-002 @ 644c1d048aa232e23f5d0f2222c3fd21febefae0`
   is a single Claude-authored `MOB-APP-002: integration closeout` commit on
   top of `ca60ea4a692d48138778bfd4f7f41e63a4f2956b`.
3. That remote closeout commit touches `43` files across unrelated surfaces,
   including `.github/workflows/*`, `.orchestrator/config.json`,
   `apps/enterprise-dispatch-web/*`, `apps/ops-console-web/*`,
   `apps/tenant-console-web/*`, `docs/05-ui/*`, and
   `support/unblock/ELIG-MOB-001/*`, so it is not a task-scoped parent rail.
4. `644c1d048` also omits a `Verification:` trailer, and its PR
   `#829 https://github.com/ajoe734/drts-fleet-platform/pull/829` is
   `CLOSED` as of `2026-06-20T11:53:00Z`.
5. A clean replay branch already exists on origin as
   `origin/codex/mob-app-002-linearized @ e13f163c9d3d6f74fd55c945069bd646ff0038de`
   with open PR
   `#832 https://github.com/ajoe734/drts-fleet-platform/pull/832`.
6. From merge-base `e2ba49b770235132682749e0affc5ce91a243ff3` to
   `e13f163c9`, that replay branch changes only the `12` expected
   `MOB-APP-002` files under `apps/driver-app/*`, `packages/api-client/*`, and
   `pnpm-lock.yaml`.
7. The assigned helper branch is itself contaminated. `git reflog` shows it was
   created from `origin/dev` at `a9e57a8b184582861618bf125f00a61ef86be132` on
   `2026-06-20 11:45:51 +0000`, then immediately cherry-picked the two
   `MOB-APP-002` feature commits at `2026-06-20 11:48:46 +0000`.
8. Before this repair, the declared artifact path
   `support/unblock/MOB-APP-002/MOB-APP-002-UNBLOCK-HISTORY-REPAIR.md` did not
   exist on `origin/dev`, and there was no remote helper ref or helper PR for
   `codex/mob-app-002-unblock-history-repair`.

The parent is therefore blocked by history contamination on the published owner
branch, while the helper branch is only suitable as an audit rail after this
artifact lands.

## Evidence

### Published parent branch contamination

- polluted remote parent:
  `origin/codex/mob-app-002 @ 644c1d048aa232e23f5d0f2222c3fd21febefae0`
- commit subject:
  `MOB-APP-002: integration closeout`
- commit parent:
  `ca60ea4a692d48138778bfd4f7f41e63a4f2956b`
- commit author and committer:
  `Claude <noreply@anthropic.com>`
- trailers present:
  - `LLM-Agent: Codex`
  - `Task-ID: MOB-APP-002`
  - `Reviewer: Codex`
- trailer missing:
  - `Verification: ...`
- contamination examples from `git diff --name-only ca60ea4a..644c1d048`:
  - `.github/workflows/ci-integ.yml`
  - `.github/workflows/deploy-dev.yml`
  - `.orchestrator/config.json`
  - `apps/enterprise-dispatch-web/app/bookings/[bookingId]/page.tsx`
  - `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx`
  - `apps/tenant-console-web/app/webhooks/page.tsx`
  - `docs/05-ui/community-app-referral-channel-spec-20260613.md`
  - `support/unblock/ELIG-MOB-001/ELIG-MOB-001-UNBLOCK-HISTORY-REPAIR.md`

### Clean replay rail already exists

- clean replay remote branch:
  `origin/codex/mob-app-002-linearized @ e13f163c9d3d6f74fd55c945069bd646ff0038de`
- replay PR:
  `#832 https://github.com/ajoe734/drts-fleet-platform/pull/832`
- PR state as checked on `2026-06-20`:
  - `state: OPEN`
  - `mergeStateStatus: BLOCKED`
  - `Commit trailers: FAILURE`
  - `build: IN_PROGRESS`
  - `e2e: IN_PROGRESS`
  - all other reported checks were `SUCCESS`
- clean replay file scope from merge-base `e2ba49b7..e13f163c9`:
  - `apps/driver-app/app/trip.tsx`
  - `apps/driver-app/expo-sqlite.d.ts`
  - `apps/driver-app/lib/api-client.ts`
  - `apps/driver-app/lib/driver-identity-bootstrap.ts`
  - `apps/driver-app/lib/driver-location-heartbeat.ts`
  - `apps/driver-app/lib/driver-location-offline-queue.ts`
  - `apps/driver-app/package.json`
  - `apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts`
  - `apps/driver-app/tests/unit/driver-location-heartbeat.test.ts`
  - `apps/driver-app/tests/unit/driver-location-offline-queue.test.ts`
  - `packages/api-client/src/index.ts`
  - `pnpm-lock.yaml`

### Helper branch contamination

- assigned helper branch:
  `codex/mob-app-002-unblock-history-repair @ c9ae393e6f4856d66c33df37f86948e10ffb10b3`
- helper branch reflog:
  - `2026-06-20 11:45:51 +0000 branch: Created from origin/dev`
  - `2026-06-20 11:48:46 +0000 cherry-pick: wip(MOB-APP-002): anchor offline queue integration`
  - `2026-06-20 11:48:46 +0000 cherry-pick: feat(MOB-APP-002): finalize durable offline queue`
- no prior helper remote ref:
  `git ls-remote --heads origin 'refs/heads/codex/mob-app-002-unblock-history-repair'`
  returned nothing before this repair
- no prior helper PR:
  `gh pr list --head codex/mob-app-002-unblock-history-repair --state all`
  returned `[]` before this repair

## Exact Contamination

The exact contamination is three-part:

1. The published parent branch `origin/codex/mob-app-002` was advanced to
   `644c1d048`, a non-task-scoped integration closeout commit that mixes the
   real Driver App queue work with unrelated workflow, config, enterprise,
   tenant, ops, docs, and support-file changes.
2. The history-repair helper branch was created from `origin/dev` and then
   cherry-picked the feature commits, so the helper is not a clean diagnostic
   branch and must not become the parent delivery rail.
3. Two competing PR rails now exist:
   - polluted `#829` from `codex/mob-app-002`, closed on `2026-06-20`
   - clean replay `#832` from `codex/mob-app-002-linearized`, still open

This is why the parent remained blocked: the intended task diff exists, but the
published owner branch and helper branch both point at the wrong history shape
for a normal protected-branch closeout.

## Non-Destructive Repair Path

Do not force-push, rebase, or rewrite any shared ref.

1. Treat `origin/codex/mob-app-002-linearized @ e13f163c9` and PR `#832` as
   the canonical recovery rail for `MOB-APP-002`.
2. Treat `origin/codex/mob-app-002 @ 644c1d048` and closed PR `#829` as audit
   evidence of contamination only. Do not reopen them and do not add new parent
   work there.
3. Treat this helper branch as audit-only after this artifact lands. It records
   the diagnosis, but it is not the replay surface for parent delivery.
4. Resume parent owner work from `codex/mob-app-002-linearized`, not from
   `codex/mob-app-002` and not from this helper branch.
5. Repair the remaining `#832` gate issue on that clean replay rail:
   create or amend the formal parent closeout so `Commit trailers` passes, then
   wait for the remaining `build` and `e2e` checks to finish.
6. Once the clean replay rail is green enough for review, hand the parent back
   to `Claude` against PR `#832`.

## Concrete Parent Next Step

`MOB-APP-002` should resume on the already-pushed clean replay branch, not on
the polluted owner branch and not on this helper branch.

1. Check out `origin/codex/mob-app-002-linearized @ e13f163c9d3d6f74fd55c945069bd646ff0038de`.
2. Repair the parent closeout metadata on that branch so PR `#832` no longer
   fails `Commit trailers`.
3. Let `build` and `e2e` finish on PR `#832`, or re-run them there if needed.
4. Handoff `MOB-APP-002` to `Claude` against PR `#832`.
5. Ignore `origin/codex/mob-app-002 @ 644c1d048`, closed PR `#829`, and
   `codex/mob-app-002-unblock-history-repair @ c9ae393e6` for parent delivery.

## Why This Is Safe

- no shared ref is rewritten
- no force-push is required
- the clean replay branch is already pushed on origin
- the polluted branch and closed PR remain reachable for audit
- the helper branch can hold the history-repair report without pretending to be
  the canonical delivery rail

## Closeout Evidence

- task-scoped remote helper branch now exists:
  `origin/codex/mob-app-002-unblock-history-repair`
- task-scoped draft PR now exists:
  `#833 https://github.com/ajoe734/drts-fleet-platform/pull/833`
- parent machine truth was reopened on `2026-06-20T12:01:42Z`:
  `MOB-APP-002` moved back to `in_progress` with next step pointing at
  `origin/codex/mob-app-002-linearized @ e13f163c9` and PR `#832`
- canonical clean replay rail remains:
  `origin/codex/mob-app-002-linearized @ e13f163c9d3d6f74fd55c945069bd646ff0038de`
  with PR `#832 https://github.com/ajoe734/drts-fleet-platform/pull/832`
- polluted rail remains preserved for audit:
  `origin/codex/mob-app-002 @ 644c1d048aa232e23f5d0f2222c3fd21febefae0`
  with closed PR `#829 https://github.com/ajoe734/drts-fleet-platform/pull/829`

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- checked machine truth with:
  - `AI_NAME=Codex scripts/ai-status.sh show MOB-APP-002`
  - `AI_NAME=Codex scripts/ai-status.sh show MOB-APP-002-UNBLOCK-HISTORY-REPAIR`
- inspected refs and worktrees:
  - `git fetch origin --prune`
  - `git worktree list --porcelain`
  - `git branch -vv --list 'codex/mob-app-002' 'codex/mob-app-002-linearized' 'codex/mob-app-002-unblock-history-repair'`
  - `git for-each-ref --format='%(refname:short)|%(objectname:short)|%(upstream:short)|%(subject)' refs/heads refs/remotes/origin | grep 'mob-app-002'`
  - `git reflog show --date=iso codex/mob-app-002-unblock-history-repair`
  - `git ls-remote --heads origin 'refs/heads/codex/mob-app-002' 'refs/heads/codex/mob-app-002-linearized' 'refs/heads/codex/mob-app-002-unblock-history-repair'`
- inspected parent and replay commit provenance:
  - `git show --stat --summary --format=fuller 644c1d048`
  - `git show --stat --summary --format=fuller 24214a0a7 e13f163c9`
  - `git show --no-patch --pretty=raw 644c1d048 e13f163c9`
  - `git merge-base 644c1d048 origin/dev`
  - `git merge-base e13f163c9 origin/dev`
  - `git diff --stat ca60ea4a..644c1d048`
  - `git diff --stat e2ba49b7..e13f163c9`
- checked PR state:
  - `gh pr view 829 --json number,title,state,closedAt,mergedAt,headRefName,headRefOid,baseRefName,url,mergeStateStatus`
  - `gh pr view 832 --json number,title,state,isDraft,baseRefName,headRefName,headRefOid,url,mergeStateStatus,statusCheckRollup,reviewRequests,reviews,commits`
  - `gh pr diff 832 --name-only`
- confirmed the artifact path was absent before this repair:
  - `git cat-file -e origin/dev:support/unblock/MOB-APP-002/MOB-APP-002-UNBLOCK-HISTORY-REPAIR.md`

No runtime tests were run. This task is branch/history evidence repair only.
