# ADM-UI-RD-005 Unblock History Repair

Last updated: 2026-05-18
Owner: Codex2
Reviewer: Codex
Task: `ADM-UI-RD-005-UNBLOCK-HISTORY-REPAIR`

## Summary

`ADM-UI-RD-005` is blocked by history contamination and a split recovery state, not by missing implementation work.

The original contamination is the mixed-task commit:

- `f481c294d627390bf574a46b3c6fdaaf5951f5eb` `feat(ADM-UI-RD-006): finalize users fleet switchboard redesign`

That commit bundled `ADM-UI-RD-005` partner files into an `ADM-UI-RD-006` subject. The later recovery on `codex/adm-ui-rd-005-unblock-history-repair` only partially normalized the state:

- the switchboard row-action fix was replayed into local commit `93fffe24c3c8d926ca7db4115b574915fea701ed`
- the partners/detail/storybook payload still lives only in the index
- the worktree also carried a stale `git cherry-pick --no-commit` sequencer until it was cleared with `git cherry-pick --quit`

The parent is therefore unblocked by rebuilding `ADM-UI-RD-005` from clean source commits on current `origin/dev`, without force-pushing any shared history.

## Exact contamination

### 1. `f481c294` is exact cross-task contamination

`git show --name-status f481c294d627390bf574a46b3c6fdaaf5951f5eb` resolves to:

- `M apps/platform-admin-web/app/fleet/page.tsx`
- `M apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
- `M apps/platform-admin-web/app/partners/page.tsx`
- `M apps/platform-admin-web/next-env.d.ts`
- `A packages/ui-web/src/platform-operations.stories.tsx`
- `A packages/ui-web/src/platform-partners.stories.tsx`

That splits cleanly into two scopes:

- `ADM-UI-RD-006`: `fleet/page.tsx`, `platform-operations.stories.tsx`
- `ADM-UI-RD-005`: `partners/page.tsx`, `partners/[entrySlug]/page.tsx`, `next-env.d.ts`, `platform-partners.stories.tsx`

It also omitted `apps/platform-admin-web/app/switchboard/page.tsx`, so it is both mixed-scope and incomplete as `ADM-UI-RD-005` closeout evidence.

### 2. At review intake, the assigned unblock worktree was split across `HEAD` and the index

Current branch:

- `codex/adm-ui-rd-005-unblock-history-repair`

Current branch relation to trunk:

- ahead `1`, behind `2` relative to current `origin/dev`

`HEAD` is only:

- `93fffe24c3c8d926ca7db4115b574915fea701ed`
- subject: `fix(ADM-UI-RD-005-UNBLOCK-HISTORY-REPAIR): replay switchboard button hardening`

That commit changes only:

- `apps/platform-admin-web/app/switchboard/page.tsx`

The remaining recovered payload was still staged, not committed on this branch:

- `M apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
- `M apps/platform-admin-web/app/partners/page.tsx`
- `A apps/platform-admin-web/components/platform-ui.tsx`
- `M apps/platform-admin-web/next-env.d.ts`
- `A packages/ui-web/src/platform-partners.stories.tsx`

So this branch is still not safe closeout evidence for the parent task:

- the partners/detail/storybook payload is not in a task-scoped commit on this branch
- the branch is behind current trunk
- the only local commit is the switchboard replay under the unblock task subject

### 3. The unblock worktree also carried stale no-commit cherry-pick state

Before cleanup, `git status` reported an in-progress cherry-pick. The sequencer state showed:

- `pick a7b47f5 fix(ADM-UI-RD-005): harden switchboard row actions`
- `pick 911fba9 ADM-UI-RD-005: finalize partners redesign closeout`
- option `no-commit = true`

But the actual worktree state had already diverged from that sequencer:

- the `a7b47f5` switchboard fix had already been replayed and committed manually as `93fffe2`
- the index matched the later `911fba9` partners payload instead
- `CHERRY_PICK_HEAD` was absent even though the sequencer directory still existed

That residue was itself part of the contamination. It has now been cleared non-destructively with:

```bash
git cherry-pick --quit
```

After `--quit`, the sequencer directory is gone and the staged payload remains intact.

### 4. The staged partners payload already matched a task-scoped recovery commit

`git diff --cached --exit-code 911fba96df8914fe0d58d902166b469388c8992b -- <ADM-UI-RD-005 files>` exits cleanly.

At review intake, the current index was byte-for-byte aligned with:

- `911fba96df8914fe0d58d902166b469388c8992b`
- subject: `ADM-UI-RD-005: finalize partners redesign closeout`

Recovered file set:

- `apps/platform-admin-web/app/partners/page.tsx`
- `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
- `apps/platform-admin-web/components/platform-ui.tsx`
- `apps/platform-admin-web/next-env.d.ts`
- `packages/ui-web/src/platform-partners.stories.tsx`

This is the key unblock fact: the parent task does not need forensic reconstruction from scratch. Its recovered partners payload already existed in a task-scoped commit and in the current index; it was simply never finalized on a clean current-trunk branch together with the switchboard replay.

### 5. Review stabilization performed in this repair branch

This review session performed only non-destructive stabilization on the assigned repair branch:

- cleared the stale sequencer with `git cherry-pick --quit`
- preserved the recovered multi-file `ADM-UI-RD-005` payload in a task-scoped anchor commit on `codex/adm-ui-rd-005-unblock-history-repair`

That stabilization does not make this branch the canonical parent closeout branch. The parent still needs a fresh rebuild from current `origin/dev`, because the repair branch remains history-specific evidence and still carries the standalone unblock-task replay commit.

## Non-destructive recovery path

Do not push `f481c294`.

Do not force-push `codex/adm-ui-rd-005-unblock-history-repair`.

Do not close out the parent directly from this behind-trunk repair branch.

Instead:

1. `git fetch origin`
2. create a fresh recovery branch from current `origin/dev`
3. restore the partner payload from `911fba96df8914fe0d58d902166b469388c8992b`
4. reapply the switchboard hardening from `93fffe24c3c8d926ca7db4115b574915fea701ed`
5. rerun acceptance on current trunk
6. commit and push a clean task-scoped `ADM-UI-RD-005` closeout commit

Suggested sequence:

```bash
git fetch origin
git switch -c codex/adm-ui-rd-005-recovery origin/dev

git checkout 911fba96df8914fe0d58d902166b469388c8992b -- \
  apps/platform-admin-web/app/partners/page.tsx \
  apps/platform-admin-web/app/partners/[entrySlug]/page.tsx \
  apps/platform-admin-web/components/platform-ui.tsx \
  apps/platform-admin-web/next-env.d.ts \
  packages/ui-web/src/platform-partners.stories.tsx

git checkout 93fffe24c3c8d926ca7db4115b574915fea701ed -- \
  apps/platform-admin-web/app/switchboard/page.tsx

pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/platform-admin-web build
pnpm --filter @drts/platform-admin-web test
pnpm --filter @drts/ui-web typecheck
pnpm --filter @drts/ui-web build-storybook
git diff --check -- \
  apps/platform-admin-web/app/partners/page.tsx \
  apps/platform-admin-web/app/partners/[entrySlug]/page.tsx \
  apps/platform-admin-web/app/switchboard/page.tsx \
  apps/platform-admin-web/components/platform-ui.tsx \
  apps/platform-admin-web/next-env.d.ts \
  packages/ui-web/src/platform-partners.stories.tsx

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

## Canonical evidence already available

The recovery path does not depend on guessing lost work. It can reuse these concrete artifacts:

- `911fba96df8914fe0d58d902166b469388c8992b` `ADM-UI-RD-005: finalize partners redesign closeout`
- `a7b47f566da105d95392fb47659c4a833cbd667b` `fix(ADM-UI-RD-005): harden switchboard row actions`
- `93fffe24c3c8d926ca7db4115b574915fea701ed` local replay of the switchboard hardening onto the current repair branch

## Parent next step

Update `ADM-UI-RD-005` machine truth from "wait for Codex2 to disentangle the shared branch" to this concrete owner action:

- rebuild the parent closeout on a fresh branch from current `origin/dev` using `911fba9` plus `93fffe2`
- rerun platform-admin and Storybook acceptance
- push the clean recovery branch normally
- hand off the repaired parent task to `Codex2` for final review
