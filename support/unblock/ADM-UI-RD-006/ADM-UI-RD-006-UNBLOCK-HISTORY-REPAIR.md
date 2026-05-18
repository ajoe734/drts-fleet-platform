# ADM-UI-RD-006 Unblock History Repair

Last updated: 2026-05-18
Owner: Codex2
Reviewer: Claude2
Task: `ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR`

## Summary

`ADM-UI-RD-006` is blocked by a non-task-scoped local commit that was created on the shared branch `feat/claude2-ui-redesign-foundation` instead of on an isolated task branch. The contaminated commit is:

- `f481c294d627390bf574a46b3c6fdaaf5951f5eb` `feat(ADM-UI-RD-006): finalize users fleet switchboard redesign`

This commit cannot be used as closeout evidence and should not be pushed or cherry-picked as-is.

## Exact contamination

### 1. Wrong branch / shared history

`git reflog --all` shows `f481c294` was created on `refs/heads/feat/claude2-ui-redesign-foundation` at `2026-05-11 00:19:29 +0000`, not on a task-scoped branch.

### 2. Mixed task ownership

`f481c294` includes both `ADM-UI-RD-006`-owned work and `ADM-UI-RD-005` files:

- `ADM-UI-RD-006` scope:
  - `apps/platform-admin-web/app/fleet/page.tsx`
  - `apps/platform-admin-web/app/users/page.tsx`
  - `apps/platform-admin-web/app/switchboard/page.tsx` was expected by the task, but was not committed in `f481c294`
  - `packages/ui-web/src/platform-operations.stories.tsx`
- `ADM-UI-RD-005` scope that was incorrectly swept into the same commit:
  - `apps/platform-admin-web/app/partners/page.tsx`
  - `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
  - `packages/ui-web/src/platform-partners.stories.tsx`
  - `apps/platform-admin-web/next-env.d.ts`

`git show --name-status f481c294` confirms the committed file set:

- `M apps/platform-admin-web/app/fleet/page.tsx`
- `M apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
- `M apps/platform-admin-web/app/partners/page.tsx`
- `M apps/platform-admin-web/next-env.d.ts`
- `A packages/ui-web/src/platform-operations.stories.tsx`
- `A packages/ui-web/src/platform-partners.stories.tsx`

### 3. Stale base relative to current trunk

`git merge-base origin/dev f481c294` resolves to `d82db884102c80b1fd364c1e7f005b0bf929508d`, while current `origin/dev` is `b1039afcff43484596bca648ba6ada00285fb68e`.

That means `f481c294` is not only cross-task contaminated; it is also based on an older trunk snapshot. A direct push or a blind cherry-pick would reintroduce outdated diffs onto current `dev`.

## What was already recovered elsewhere

The `ADM-UI-RD-005` portion has already been reconstructed on top of current trunk with task-scoped commits:

- `911fba96df8914fe0d58d902166b469388c8992b` `ADM-UI-RD-005: finalize partners redesign closeout`
- `4523687f22a74be9b4a5a7583299d737eb2c3e15` `fix(ADM-UI-RD-006): make platform-admin typecheck regenerate route types`

These commits are descendants of the current `origin/dev` line and isolate the partners/detail/storybook/package adjustments without relying on `f481c294`.

## Non-destructive repair path

### ADM-UI-RD-005

No force-push repair is needed for the partners slice. Treat `911fba9` as the canonical closeout commit and `4523687` as the follow-up fix already split from the contaminated history.

### ADM-UI-RD-006

Do not reuse `f481c294` directly.

Instead:

1. Start from current `origin/dev`.
2. Restore only `ADM-UI-RD-006`-owned surfaces from `f481c294` into an isolated task branch:
   - `apps/platform-admin-web/app/users/page.tsx`
   - `apps/platform-admin-web/app/fleet/page.tsx`
   - `apps/platform-admin-web/app/switchboard/page.tsx` if the intended redesign still exists in local recovery material; otherwise reapply the switchboard delta manually from the reviewed design target
   - `packages/ui-web/src/platform-operations.stories.tsx`
3. Re-run acceptance on current trunk.
4. Commit with a fresh task-scoped subject for `ADM-UI-RD-006`.
5. Push normally and use that new commit as the only closeout evidence.

Suggested command sequence:

```bash
git fetch origin
git switch -c codex2/adm-ui-rd-006-recovery origin/dev

# Restore only the ADM-UI-RD-006-owned payload from the contaminated commit.
git checkout f481c294d627390bf574a46b3c6fdaaf5951f5eb -- \
  apps/platform-admin-web/app/users/page.tsx \
  apps/platform-admin-web/app/fleet/page.tsx \
  packages/ui-web/src/platform-operations.stories.tsx

# Reapply or reconstruct switchboard changes separately if needed.
# Then verify on current trunk before committing.
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/platform-admin-web build
pnpm --filter @drts/platform-admin-web test
pnpm --filter @drts/ui-web typecheck

git add \
  apps/platform-admin-web/app/users/page.tsx \
  apps/platform-admin-web/app/fleet/page.tsx \
  apps/platform-admin-web/app/switchboard/page.tsx \
  packages/ui-web/src/platform-operations.stories.tsx

git commit -m "ADM-UI-RD-006: rebuild users fleet switchboard redesign on current dev" \
  -m "LLM-Agent: Codex2" \
  -m "Task-ID: ADM-UI-RD-006" \
  -m "Reviewer: Codex"

git push -u origin codex2/adm-ui-rd-006-recovery
```

## Why this unblocks the parent

- It preserves shared history: no force-push, no rewrite of `feat/claude2-ui-redesign-foundation`.
- It preserves `ADM-UI-RD-005`'s recovered closeout evidence.
- It gives `ADM-UI-RD-006` a clean commit based on current `dev`, with only task-owned files staged.
- It converts the blocker from "history contaminated" to the concrete next action: rebuild the remaining `ADM-UI-RD-006` payload on top of current trunk and verify again.
