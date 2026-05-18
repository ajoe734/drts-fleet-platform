# ADM-UI-RD-005 Unblock History Repair

Last updated: 2026-05-18
Owner: Codex2
Reviewer: Claude2
Task: `ADM-UI-RD-005-UNBLOCK-HISTORY-REPAIR`

## Summary

`ADM-UI-RD-005` is blocked by a mixed-state recovery on `codex/adm-ui-rd-005-unblock-history-repair`, not by missing implementation work.

The original cross-task contamination came from:

- `f481c294d627390bf574a46b3c6fdaaf5951f5eb` `feat(ADM-UI-RD-006): finalize users fleet switchboard redesign`

That commit incorrectly bundled `ADM-UI-RD-005` partners files under an `ADM-UI-RD-006` subject. Since then, the `ADM-UI-RD-005` payload has been partially recovered, but it is split between:

- local commit `93fffe24c3c8d926ca7db4115b574915fea701ed` on `codex/adm-ui-rd-005-unblock-history-repair`
- staged but uncommitted partners/storybook files in the same worktree

The unblock path is therefore to rebuild `ADM-UI-RD-005` on a fresh branch from current `origin/dev`, using the already recovered task-scoped payload as source material, without force-pushing any shared history.

## Exact contamination

### 1. The mixed-task commit still exists and is not task-scoped for ADM-UI-RD-005

`git show --name-status f481c294d627390bf574a46b3c6fdaaf5951f5eb` resolves and confirms this file set:

- `M apps/platform-admin-web/app/fleet/page.tsx`
- `M apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
- `M apps/platform-admin-web/app/partners/page.tsx`
- `M apps/platform-admin-web/next-env.d.ts`
- `A packages/ui-web/src/platform-operations.stories.tsx`
- `A packages/ui-web/src/platform-partners.stories.tsx`

That is exact cross-task contamination:

- `ADM-UI-RD-006` payload: `fleet/page.tsx`, `platform-operations.stories.tsx`
- `ADM-UI-RD-005` payload: `partners/page.tsx`, `partners/[entrySlug]/page.tsx`, `next-env.d.ts`, `platform-partners.stories.tsx`

`f481c294` also omitted the switchboard file that the original blocker message expected to be present, so it is both mixed-scope and incomplete as `ADM-UI-RD-005` closeout evidence.

### 2. The current `codex` unblock branch is itself split across commit history and the index

`git status --short --branch` in `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-adm-ui-rd-005-unblock-history-repair` shows:

- branch `codex/adm-ui-rd-005-unblock-history-repair`
- ahead 1, behind 1 relative to `origin/dev`
- staged files:
  - `M apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
  - `M apps/platform-admin-web/app/partners/page.tsx`
  - `A apps/platform-admin-web/components/platform-ui.tsx`
  - `M apps/platform-admin-web/next-env.d.ts`
  - `A packages/ui-web/src/platform-partners.stories.tsx`

`HEAD` on that branch is only:

- `93fffe24c3c8d926ca7db4115b574915fea701ed` `fix(ADM-UI-RD-005-UNBLOCK-HISTORY-REPAIR): replay switchboard button hardening`

`git show --stat 93fffe2` confirms it changes only:

- `apps/platform-admin-web/app/switchboard/page.tsx`

So the current local branch cannot be pushed as-is for closeout:

- the partners/detail/storybook payload is still only staged, not committed on that branch
- the switchboard replay is committed separately under an unblock subject
- the branch is behind current trunk and should not become the canonical delivery branch without replay on top of current `origin/dev`

### 3. The staged partners payload already matches an existing task-scoped recovery commit

`git diff --cached --exit-code 911fba96df8914fe0d58d902166b469388c8992b -- <ADM-UI-RD-005 files>` exits cleanly in the `codex` unblock worktree.

That means the currently staged `ADM-UI-RD-005` payload is byte-for-byte aligned with:

- `911fba96df8914fe0d58d902166b469388c8992b` `ADM-UI-RD-005: finalize partners redesign closeout`

Recovered file set:

- `apps/platform-admin-web/app/partners/page.tsx`
- `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
- `apps/platform-admin-web/components/platform-ui.tsx`
- `apps/platform-admin-web/next-env.d.ts`
- `packages/ui-web/src/platform-partners.stories.tsx`

This is the key unblock fact: the parent task does not need forensic reconstruction from scratch. Its recovered partners payload already exists in a task-scoped commit; it just lives on the wrong branch and was never finalized on a clean current-trunk branch.

## Non-destructive repair path

Do not push `f481c294`.

Do not force-push `codex/adm-ui-rd-005-unblock-history-repair`.

Do not try to close out directly from the dirty `codex` worktree.

Instead:

1. Start a fresh `ADM-UI-RD-005` repair branch from current `origin/dev`.
2. Restore the recovered partners payload from `911fba96df8914fe0d58d902166b469388c8992b`.
3. Reapply the switchboard row-action hardening from the local replay commit `93fffe24c3c8d926ca7db4115b574915fea701ed` against current trunk.
4. Re-run acceptance on current `origin/dev`.
5. Commit and push a new task-scoped `ADM-UI-RD-005` closeout commit.

Suggested command sequence:

```bash
git fetch origin
git switch -c codex/adm-ui-rd-005-recovery origin/dev

git checkout 911fba96df8914fe0d58d902166b469388c8992b -- \
  apps/platform-admin-web/app/partners/page.tsx \
  apps/platform-admin-web/app/partners/[entrySlug]/page.tsx \
  apps/platform-admin-web/components/platform-ui.tsx \
  apps/platform-admin-web/next-env.d.ts \
  packages/ui-web/src/platform-partners.stories.tsx

# Reapply the switchboard row-action hardening from 93fffe2 manually or by patch,
# because current origin/dev has moved beyond the original local replay point.

pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/platform-admin-web build
pnpm --filter @drts/platform-admin-web test
pnpm --filter @drts/ui-web typecheck
pnpm --filter @drts/ui-web build-storybook

git add \
  apps/platform-admin-web/app/partners/page.tsx \
  apps/platform-admin-web/app/partners/[entrySlug]/page.tsx \
  apps/platform-admin-web/app/switchboard/page.tsx \
  apps/platform-admin-web/components/platform-ui.tsx \
  apps/platform-admin-web/next-env.d.ts \
  packages/ui-web/src/platform-partners.stories.tsx

git commit -m "ADM-UI-RD-005: rebuild partners redesign closeout on current dev" \
  -m "LLM-Agent: Codex" \
  -m "Task-ID: ADM-UI-RD-005" \
  -m "Reviewer: Codex2"

git push -u origin codex/adm-ui-rd-005-recovery
```

## Why this unblocks the parent

- It keeps shared history intact: no force-push, no rewrite of the contaminated branch lineage.
- It treats `f481c294` strictly as evidence of what went wrong, not as canonical delivery material.
- It reuses the already recovered `ADM-UI-RD-005` payload from `911fba9`, so the parent task is not blocked on rediscovery.
- It gives `Codex` a concrete next step: rebuild the parent closeout on a clean branch from current `origin/dev`, then verify and push normally.
