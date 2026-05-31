# UI-BE-006 Unblock History Repair

## Scope

- Task: `UI-BE-006-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-BE-006`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-05-31T15:00:00Z`

## Diagnosis

`UI-BE-006` is blocked by two separate issues that were conflated in the parent
status text:

1. Machine-truth regression is the immediate blocker.
   `Claude` approved `UI-BE-006` at `2026-05-31T14:33:14Z`, but the later owner
   `progress` event at `2026-05-31T14:34:24Z` moved the parent back from
   `review_approved` to `in_progress`, so `done` was rejected even though the
   closeout commit already existed.
2. The owner rail that now carries the closeout metadata is not merge-safe as-is.
   `origin/codex/ui-be-006 @ 4f5d6af55560bdeb41d7333a6ef849d90a81aaa5` is
   `6 ahead / 8 behind origin/dev`, and its task diff includes three unrelated
   `node_modules` symlink entries introduced by
   `045d7712 wip(UI-BE-006): cleanup commit — auto-anchor pending work`.
3. The current parent PR is therefore contaminated audit evidence, not a clean
   integration rail. `gh pr list --head codex/ui-be-006` returns open PR `#365`
   titled `UI-BE-006: cleanup commit — auto-anchor pending work`, which reflects
   the stale cleanup commit rather than the intended task closeout.
4. The accepted task logic itself is still recoverable without force-pushing.
   Reviewer `Claude` explicitly recorded that the additive tenant-rollout delta
   applies cleanly to current `origin/dev`, that contracts build / api
   typecheck / targeted unit + governance tests are green, and that the only
   required repair is to rebuild the accepted delta onto a fresh dev-based rail
   while excluding the three symlink paths.

## Evidence

### Parent state and approval drift

- Canonical `ai-status.json` currently records `UI-BE-006` as:
  - owner `Codex`
  - reviewer `Claude`
  - status `blocked`
  - waiting_for `Claude`
  - next text still centered on restoring `review_approved`
- Canonical `ai-activity-log.jsonl` records:
  - `2026-05-31T14:33:14Z` `review_approved` by `Claude`
  - `2026-05-31T14:34:24Z` owner `progress`
  - `2026-05-31T14:37:01Z` owner `blocker`
  - `2026-05-31T14:39:35Z` chairman creation of this helper task

### Branch / commit contamination

- `origin/codex/ui-be-006 @ 4f5d6af55560bdeb41d7333a6ef849d90a81aaa5`
- `git rev-list --left-right --count origin/dev...origin/codex/ui-be-006`
  returns `8 6`
- `git diff --name-status origin/dev...origin/codex/ui-be-006` shows:
  - intended task files:
    - `apps/api/src/modules/platform-admin/platform-admin.module.ts`
    - `apps/api/src/modules/platform-admin/tenants.controller.ts`
    - `apps/api/src/modules/platform-admin/tenants.service.ts`
    - `apps/api/src/modules/tenant-rollout/tenant-rollout.service.ts`
    - `apps/api/src/modules/tenant-rollout/tenant-rollout.types.ts`
    - `apps/api/tests/unit/tenant-rollout.service.test.ts`
    - `apps/api/tests/unit/tenants.service.test.ts`
  - contaminated additions:
    - `apps/api/node_modules`
    - `node_modules`
    - `packages/contracts/node_modules`
- `git show --name-only --stat 045d7712` shows the contamination comes from
  the auto-cleanup anchor commit, not from accepted rollout logic.
- `git show --no-patch --stat 4f5d6af5` shows the closeout metadata already
  exists on the contaminated rail:
  - subject `chore(UI-BE-006): finalize review-approved closeout`
  - verification trailer includes targeted vitest plus
    `git diff --check origin/dev...HEAD`

### Reviewer acceptance evidence

- Parent review notes in canonical `ai-status.json` state that:
  - the additive delta reconstructs cleanly onto current `origin/dev`
  - contracts build, api typecheck, 34 unit tests, and 13 integration
    governance tests passed
  - the only closeout blockers are stale-base ancestry and the three committed
    `node_modules` symlinks
- `gh pr list --head codex/ui-be-006 --json number,title,headRefName,baseRefName,state,url`
  returns:
  - PR `#365`
  - title `UI-BE-006: cleanup commit — auto-anchor pending work`
  - base `dev`
  - state `OPEN`

## Exact Contamination

The parent is not blocked because the tenant-rollout implementation is missing.
It is blocked because the current owner rail mixes valid task commits with
cleanup artifacts and stale-base history:

1. valid task commits:
   - `6f03558c feat(UI-BE-006): add tenant rollout state machine`
   - `b34d416b fix(UI-BE-006): lock rollout state regressions`
   - `2f2fd4ee fix(UI-BE-006): restore rollout service fallback`
   - `4f5d6af5 chore(UI-BE-006): finalize review-approved closeout`
2. contaminated non-task commit:
   - `045d7712 wip(UI-BE-006): cleanup commit — auto-anchor pending work`
   - effect: adds three `node_modules` symlink entries to the branch diff
3. state-machine drift:
   - `progress` was written after `review_approved`, which demoted the parent
     from a closeable state back to `in_progress`
4. stale owner rail / PR evidence:
   - the open parent PR still advertises the cleanup commit as its headline,
     confirming that the shared owner branch should be treated as audit-only
     evidence rather than the final merge rail

## Non-Destructive Repair Path

Do not force-push or rewrite `origin/codex/ui-be-006` or PR `#365`.

1. Freeze `origin/codex/ui-be-006` and PR `#365` as audit evidence only.
2. Resume `UI-BE-006` on a fresh owner rail branched from current `origin/dev`.
3. Reconstruct only the accepted additive delta onto that fresh rail:
   - keep the tenant-rollout and platform-admin changes reviewed by `Claude`
   - exclude `apps/api/node_modules`, `node_modules`, and
     `packages/contracts/node_modules`
   - keep the closeout verification intent from `4f5d6af5`, but attach it to
     the clean rail rather than reusing the contaminated branch wholesale
4. Owner re-handoff the fresh rail to `Claude` for a lightweight re-approval,
   citing the existing review notes plus the removed symlink contamination.
5. After the fresh rail is `review_approved`, owner runs `done` with normal
   non-force push metadata from the clean branch.

## Parent Next Step

The concrete unblocked next step for `UI-BE-006` is:

`Codex` should reopen the parent onto a fresh dev-based owner rail, replay only
the accepted rollout delta without the three symlink paths, and hand that clean
rail back to `Claude` for re-approval. Only after that re-approval should the
parent move to `done`.

This is an owner action first, not a reviewer action first. Restoring the old
`review_approved` bit on the contaminated branch would not be sufficient.

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The contaminated owner rail stays available for audit and PR history.
- The clean rebuild uses the already-reviewed additive delta, not a semantic
  redesign.
- Parent machine truth can move forward with an explicit next step even before
  the clean replacement rail exists.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` §11 and
  `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical:
  - `/home/edna/workspace/drts-fleet-platform/ai-status.json`
  - `/home/edna/workspace/drts-fleet-platform/current-work.md`
  - `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Compared refs and task history:
  - `git log --oneline origin/dev..codex/ui-be-006`
  - `git rev-list --left-right --count origin/dev...origin/codex/ui-be-006`
  - `git diff --name-status origin/dev...origin/codex/ui-be-006`
  - `git show --name-only --stat 045d7712`
  - `git show --no-patch --stat 4f5d6af5`
  - `gh pr list --head codex/ui-be-006 --json number,title,headRefName,baseRefName,state,url`
