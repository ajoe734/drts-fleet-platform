# ADM-UI-RD-005 Unblock History Repair

Last updated: 2026-05-20
Owner: Codex
Reviewer: Codex2
Task: `ADM-UI-RD-005-UNBLOCK-HISTORY-REPAIR`

## Summary

`ADM-UI-RD-005` was originally blocked by mixed history on shared branch
`feat/claude2-ui-redesign-foundation`, specifically commit
`f481c294d627390bf574a46b3c6fdaaf5951f5eb`
`feat(ADM-UI-RD-006): finalize users fleet switchboard redesign`.

As revalidated on 2026-05-20, the non-destructive repair path has already been
executed successfully:

- clean recovery branch: `origin/codex2/adm-ui-rd-005`
- task-scoped recovery commit: `59f485b78417bd1bbd23f34fad870ae7e40fc914`
- merge to trunk: `67369562e8bd9328e0e694e2534ef26dd1433539`
- merged via PR: `#146`

The remaining blocker is no longer branch contamination in canonical delivery
history. The remaining blocker is stale machine truth: `ADM-UI-RD-005` still
claims it is waiting for Codex2 to disentangle a shared branch state even
though the clean recovery commit was pushed and merged normally.

## Exact contamination

### 1. `f481c294` is the exact cross-task commit contamination

`git show --name-status f481c294d627390bf574a46b3c6fdaaf5951f5eb` resolves to:

- `M apps/platform-admin-web/app/fleet/page.tsx`
- `M apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
- `M apps/platform-admin-web/app/partners/page.tsx`
- `M apps/platform-admin-web/next-env.d.ts`
- `A packages/ui-web/src/platform-operations.stories.tsx`
- `A packages/ui-web/src/platform-partners.stories.tsx`

That file set splits cleanly into two scopes:

- `ADM-UI-RD-006`: `fleet/page.tsx`,
  `packages/ui-web/src/platform-operations.stories.tsx`
- `ADM-UI-RD-005`: `partners/page.tsx`,
  `partners/[entrySlug]/page.tsx`, `next-env.d.ts`,
  `packages/ui-web/src/platform-partners.stories.tsx`

This is the branch/commit contamination that originally blocked the parent:
`ADM-UI-RD-005` could not safely close out from a shared branch whose local
`HEAD` carried a mixed-task commit under an `ADM-UI-RD-006` subject.

### 2. The parent blocker snapshot was accurate at intake, but it is now stale

The original parent blocker in machine truth captured a real mixed recovery
state:

- `ADM-UI-RD-005` had already reached reviewer approval on 2026-05-11
- closeout then failed because shared branch `HEAD` moved to `f481c294`
- the partners payload and switchboard-related acceptance unblocker were no
  longer represented by a clean task-scoped commit/push pair owned by the
  parent task

That blocker message is still recorded in `ai-status.json`, but it no longer
describes canonical delivery reality after the clean repair work below landed.

### 3. The non-destructive repair path was executed on a clean branch

The parent repair was rebuilt on branch `origin/codex2/adm-ui-rd-005` as commit
`59f485b78417bd1bbd23f34fad870ae7e40fc914`
`ADM-UI-RD-005: rebuild partners redesign closeout on current dev`.

`git show --name-status 59f485b78417bd1bbd23f34fad870ae7e40fc914` confirms the
recovered task-scoped file set:

- `M apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
- `M apps/platform-admin-web/app/partners/page.tsx`
- `M apps/platform-admin-web/app/switchboard/page.tsx`
- `A apps/platform-admin-web/components/platform-ui.tsx`
- `M apps/platform-admin-web/next-env.d.ts`
- `A packages/ui-web/src/platform-partners.stories.tsx`

That commit preserved the non-force-push repair rule:

- it did not rewrite `f481c294`
- it did not force-push the shared contaminated branch
- it rebuilt the `ADM-UI-RD-005` payload on a task-scoped branch from current
  trunk at that time
- it carried verification evidence in the commit message trailers

### 4. Canonical trunk now proves the parent is repaired

`origin/dev` contains merge commit
`67369562e8bd9328e0e694e2534ef26dd1433539`
`ADM-UI-RD-005: rebuild partners redesign on current dev (#146)`.

That merge commit touches only:

- `M apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
- `M apps/platform-admin-web/app/partners/page.tsx`
- `A packages/ui-web/src/platform-partners.stories.tsx`

The merge is narrower than `59f485b` because the shared helper and supporting
surfaces were already absorbed by the sibling `ADM-UI-RD-006` recovery:

- `0db61c064f575531c4df03721cad30f47332da4a`
  `ADM-UI-RD-006: rebuild users fleet switchboard redesign on current dev (#145)`
  already carried `apps/platform-admin-web/components/platform-ui.tsx`,
  `apps/platform-admin-web/next-env.d.ts`, and the switchboard page delta into
  `origin/dev`

So the clean parent recovery is now represented by both:

- the task-scoped pushed commit on `origin/codex2/adm-ui-rd-005`
- the merged canonical trunk evidence on `origin/dev`

### 5. The current unblock branches are evidence branches, not delivery branches

Two unblock-task branches still exist:

- `origin/codex/adm-ui-rd-005-unblock-history-repair`
- `origin/codex2/adm-ui-rd-005-unblock-history-repair`

These branches are useful as audit/evidence surfaces, but they are not the
canonical parent delivery branch. The parent was repaired through
`origin/codex2/adm-ui-rd-005` and then merged through PR `#146`.

## Non-destructive repair path

The correct repair path was:

1. Preserve `f481c294` as evidence of contamination; do not rewrite shared
   history.
2. Rebuild `ADM-UI-RD-005` on a fresh task-scoped branch from current trunk.
3. Push the clean recovery branch normally.
4. Merge the clean branch through a normal PR.
5. Leave the unblock branch as supporting evidence only.

That path has already been completed for the parent:

- branch: `origin/codex2/adm-ui-rd-005`
- clean task-scoped commit:
  `59f485b78417bd1bbd23f34fad870ae7e40fc914`
- PR: `#146`
- merged trunk commit:
  `67369562e8bd9328e0e694e2534ef26dd1433539`

## Parent next step

`ADM-UI-RD-005` should no longer remain blocked on
"wait for Codex2 to disentangle the shared branch state".

The concrete next step for the parent task is control-plane closeout using the
already existing clean recovery evidence:

- `COMMIT_HASH=59f485b78417bd1bbd23f34fad870ae7e40fc914`
- `COMMIT_SUBJECT=ADM-UI-RD-005: rebuild partners redesign closeout on current dev`
- `PUSH_REMOTE=origin`
- `PUSH_BRANCH=codex2/adm-ui-rd-005`
- merged proof:
  `67369562e8bd9328e0e694e2534ef26dd1433539` on `origin/dev`
- PR proof: `#146`

In other words:

- the history repair is complete
- the parent is unblocked from a git-history perspective
- the remaining work is to align machine truth with the already-pushed and
  already-merged parent closeout evidence

## Task-scoped evidence for this unblock task

This unblock task updates canonical support evidence under:

- `support/unblock/ADM-UI-RD-005/ADM-UI-RD-005-UNBLOCK-HISTORY-REPAIR.md`

Revalidation basis for this update:

- `git show --name-status f481c294d627390bf574a46b3c6fdaaf5951f5eb`
- `git show --name-status 59f485b78417bd1bbd23f34fad870ae7e40fc914`
- `git show --name-status 67369562e8bd9328e0e694e2534ef26dd1433539`
- `git show --stat 0db61c064f575531c4df03721cad30f47332da4a`
- `git branch -r` for
  `origin/codex2/adm-ui-rd-005`,
  `origin/codex/adm-ui-rd-005-unblock-history-repair`,
  and `origin/codex2/adm-ui-rd-005-unblock-history-repair`
