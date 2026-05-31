# UI-BE-004-ADM Unblock History Repair

## Scope

- Task: `UI-BE-004-ADM-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-BE-004-ADM`
- Owner: `Codex2`
- Reviewer: `Claude`
- Audit timestamp: `2026-05-31T14:44:33Z`

## Diagnosis

The parent is blocked by branch-history contamination plus machine-truth drift,
not by missing `/api/platform/search` functionality.

1. Canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json` now
   shows parent `UI-BE-004-ADM` as:
   - owner `Codex2`
   - reviewer `Claude`
   - status `blocked`
   - `waiting_for = Gemini`
   - `review_notes_zh` claiming Claude already approved clean delta
     `3968a5fa...`
   This is already internally inconsistent before looking at git refs.
2. `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl` records a
   fully completed clean parent lifecycle on `2026-05-29`:
   - `Codex` handoff on `origin/codex/ui-be-004-adm @ 186a1359...`
   - `Codex2` `review_approved`
   - `Codex` `done` on
     `origin/codex/ui-be-004-adm @ 50b86f6854fa0e5ec75291d3dfcb3484260d90a2`
   So the parent was previously closed out on a clean rail, and later machine
   truth drifted away from that closeout.
3. `origin/codex/ui-be-004-adm @ 50b86f6854fa0e5ec75291d3dfcb3484260d90a2`
   is the clean parent closeout rail from the recorded `done` event. Relative
   to `origin/dev` it is `4 ahead / 81 behind`, but its task diff is limited to
   the `9` expected platform-search files plus sidecar review evidence.
4. `origin/claude/ui-be-004-adm @ 3968a5fa4a287aa8ab6d5f1257563ba2910e65a4`
   is the later clean additive replay rail. Relative to `origin/dev` it is `1
   ahead / 0 behind`, and its task diff is limited to the `9` expected
   search/auth/test files:
   - `apps/api/src/app.module.ts`
   - `apps/api/src/common/auth/auth.policy.ts`
   - `apps/api/src/modules/platform-admin/platform-admin.module.ts`
   - `apps/api/src/modules/search/search.controller.ts`
   - `apps/api/src/modules/search/search.module.ts`
   - `apps/api/src/modules/search/search.service.ts`
   - `apps/api/tests/unit/auth-bootstrap.test.ts`
   - `apps/api/tests/unit/search.controller.test.ts`
   - `apps/api/tests/unit/search.service.test.ts`
5. `origin/codex2/ui-be-004-adm @ 49d063c4403a8e6b71ac708a70547fbcf871ed47`
   is the contaminated later owner rail. Relative to `origin/dev` it is `6
   ahead / 2 behind`, but its task diff spans `39` files instead of the
   expected search slice and includes unrelated `incident`,
   `tenant-partner`, `docs/**`, `ops/**`, `support/**`, and
   orchestrator/runtime churn.
6. The contamination on `origin/codex2/ui-be-004-adm` starts at the first owner
   commit `3538b42195f8055b0d5bf99796c2771579a4fa44`, which was created on top
   of the stale base `75f10e4c4098f37f3e46d3ba692da6d0e705db2f` rather than a
   current `dev` tip. Relative to `origin/dev`, that stale base is `1 ahead /
   81 behind`.
7. The later merge commit
   `98f743fe0d091fb8259f6e457217ab0ed7dccf2d` pulled
   `ca4afa679022ea948cbc9c2f9444f1ae6ab86183` ("merge current dev for
   closeout") into the stale rail. That preserved the dirty ancestry instead of
   replaying the task onto a clean branch.
8. Machine-truth metadata drifted along with the branch drift:
   - chair created this helper because machine truth still reflected the stale
     reviewer lane and then partially replayed approval onto a different lane
   - the later owner commits on `origin/codex2/ui-be-004-adm`
     (`cc66e5c4`, `fceee7d7`, `4e98267b`, `98f743fe`, `49d063c4`) carry
     conflicting review trailers (`Reviewer: Codex`, then `Reviewer: Claude`)
   - none of `origin/codex/ui-be-004-adm`, `origin/codex2/ui-be-004-adm`, or
     `origin/claude/ui-be-004-adm` currently has an open GitHub PR, so the
     parent has no active review/merge rail even though three candidate refs
     exist
9. Worktree state reflects the drift instead of a single clean owner lane:
   - local worktree for `claude/ui-be-004-adm`:
     `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-ui-be-004-adm-sidecar-review`
   - local worktree for `codex2/ui-be-004-adm-sidecar-review`:
     `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ui-be-004-adm-sidecar-review`
   - no local worktree currently checks out the contaminated parent branch
     `codex2/ui-be-004-adm`, which makes ad hoc reuse even less safe

## Exact Contamination

The parent is blocked by a five-part mismatch:

1. A clean parent closeout already exists on `origin/codex/ui-be-004-adm
   @ 50b86f68...`, and canonical activity log recorded that parent as `done`.
2. A second clean replay exists on `origin/claude/ui-be-004-adm
   @ 3968a5fa...`, but it was never converted into a canonical parent closeout.
3. The later assigned owner branch `origin/codex2/ui-be-004-adm` started from
   stale base `75f10e4c...`, then used merge commit `98f743fe...` to absorb a
   trunk snapshot and kept the stale ancestry alive.
4. The resulting `codex2` owner rail now contains `33` non-task files beyond
   the clean `UI-BE-004-ADM` slice.
5. Parent machine truth no longer matches any single valid rail: it is
   `blocked`, reviewer `Claude`, `waiting_for = Gemini`, review notes cite the
   `claude` replay rail, and prior `done` evidence still points at the `codex`
   closeout rail.

## Non-Destructive Repair Path

Do not force-push, rewrite, or rename any shared branch.

1. Freeze `origin/codex2/ui-be-004-adm` as audit-only contamination evidence.
   Do not reopen review or final closeout on that ref.
2. Preserve `origin/codex/ui-be-004-adm @ 50b86f6854fa0e5ec75291d3dfcb3484260d90a2`
   as the canonical parent closeout evidence branch because the activity log
   already records parent `done` on that SHA.
3. Preserve `origin/claude/ui-be-004-adm @ 3968a5fa4a287aa8ab6d5f1257563ba2910e65a4`
   as the clean replay reference for the later additive delta.
4. If the parent must stay on current owner `Codex2`, reopen
   `UI-BE-004-ADM` onto a fresh owner replay branch from current `origin/dev`,
   for example `codex2/ui-be-004-adm-replay`, then cherry-pick
   `3968a5fa4a287aa8ab6d5f1257563ba2910e65a4` onto that fresh branch and rerun:
   - `pnpm --filter @drts/api typecheck`
   - `pnpm --filter @drts/api exec vitest run tests/unit/auth-bootstrap.test.ts tests/unit/search.service.test.ts tests/unit/search.controller.test.ts`
5. Push that clean replay branch normally and open a new parent PR from the
   replay branch to `dev`. Keep the old dirty owner rail untouched for audit.
6. Hand the replay branch to the currently recorded reviewer `Claude`, not the
   stale paused lane `Gemini`.
7. If chair prefers state repair instead of another replay, parent can also be
   restored directly to `done` on
   `origin/codex/ui-be-004-adm @ 50b86f6854fa0e5ec75291d3dfcb3484260d90a2`
   because canonical activity log already records that clean closeout.

## Current Unblocked Result

- The exact contamination is identified:
  `origin/codex2/ui-be-004-adm` is the dirty later owner rail,
  `origin/codex/ui-be-004-adm @ 50b86f68...` is the prior clean closeout rail,
  and `origin/claude/ui-be-004-adm @ 3968a5fa...` is the later clean replay
  reference.
- The safe recovery path is explicit and non-destructive:
  either restore parent machine truth to the already-recorded clean closeout
  rail `50b86f68...`, or replay `3968a5fa...` onto a fresh `Codex2` owner
  branch and review that clean replay rail instead of the contaminated branch.
- Parent next step should now be:
  `Either restore UI-BE-004-ADM done-state evidence to origin/codex/ui-be-004-adm @ 50b86f6854fa0e5ec75291d3dfcb3484260d90a2, or if current Codex2 ownership must be preserved, reopen onto a fresh owner replay branch from origin/dev, cherry-pick 3968a5fa4a287aa8ab6d5f1257563ba2910e65a4, push/open PR, then hand off that clean rail to Claude.`

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The contaminated owner rail remains available for audit.
- The prior clean closeout rail remains unchanged.
- The clean replay reference remains unchanged.
- Parent can be repaired either by state restoration onto existing clean evidence
  or by a new replay branch with a minimal `9`-file diff.
- Reviewer and PR metadata only need to move forward on a clean rail.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Compared refs, commit ancestry, and worktrees:
  - `git branch --show-current`
  - `git status --short`
  - `git rev-list --left-right --count origin/dev...origin/codex/ui-be-004-adm`
  - `git merge-base origin/dev origin/codex/ui-be-004-adm`
  - `git merge-base origin/dev origin/codex2/ui-be-004-adm`
  - `git merge-base origin/dev origin/claude/ui-be-004-adm`
  - `git merge-base origin/codex2/ui-be-004-adm origin/claude/ui-be-004-adm`
  - `git diff --name-only origin/dev...origin/codex/ui-be-004-adm`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ui-be-004-adm`
  - `git rev-list --left-right --count origin/dev...origin/claude/ui-be-004-adm`
  - `git rev-list --left-right --count origin/claude/ui-be-004-adm...origin/codex2/ui-be-004-adm`
  - `git diff --name-only origin/dev...origin/codex2/ui-be-004-adm`
  - `git diff --name-only origin/dev...origin/claude/ui-be-004-adm`
  - `git diff --name-status origin/claude/ui-be-004-adm..origin/codex2/ui-be-004-adm`
  - `git range-diff origin/dev...origin/codex2/ui-be-004-adm origin/dev...origin/claude/ui-be-004-adm`
  - `git show --no-patch --pretty=fuller 50b86f68 186a1359 c48c8669 49d063c4 3968a5fa 98f743fe`
  - `git worktree list --porcelain`
  - `git ls-remote --heads origin 'refs/heads/codex/ui-be-004-adm' 'refs/heads/codex2/ui-be-004-adm' 'refs/heads/claude/ui-be-004-adm'`
  - `grep -a 'UI-BE-004-ADM' /home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
  - `gh pr list --head codex/ui-be-004-adm --state all --json number,title,headRefName,baseRefName,state,isDraft,url,mergeStateStatus`
  - `gh pr list --head codex2/ui-be-004-adm --state all --json number,title,headRefName,baseRefName,state,isDraft,url,mergeStateStatus`
  - `gh pr list --head claude/ui-be-004-adm --state all --json number,title,headRefName,baseRefName,state,isDraft,url,mergeStateStatus`
