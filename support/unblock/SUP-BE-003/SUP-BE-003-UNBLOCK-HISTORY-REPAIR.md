# SUP-BE-003 Unblock History Repair

## Scope

- Task: `SUP-BE-003-UNBLOCK-HISTORY-REPAIR`
- Parent: `SUP-BE-003`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-20T00:00:00Z`

## Diagnosis

`SUP-BE-003` is blocked by contaminated commit history on the original owner
branch, not by missing Fleet Partner code.

1. The original owner branch `origin/codex2/sup-be-003` backs open PR `#806`
   and ends at merge commit
   `3047636d36ca741096b1b83cb4c8d75b83cc36bc`.
2. That branch contains an invalid closeout commit
   `83d87e20512819efed2c7df1939eee45d8224957` with subject
   `closeout(SUP-BE-003): ...`, which does not satisfy the required canonical
   closeout subject form `SUP-BE-003: ...`.
3. The same branch also contains merge commit `3047636d3` with subject
   `Merge remote-tracking branch 'origin/dev' into codex2/sup-be-003`, which
   also fails the repo's commit-subject/trailer policy checked by CI.
4. PR `#806` therefore cannot pass the `Commit trailers` required check without
   rewriting already-pushed shared history.
5. A clean non-destructive replay branch already exists:
   `origin/codex2/sup-be-003-clean @ 2eb7871314e91b0f395f7358169df918dc20e9ec`,
   exposed as open PR `#804`.
6. A later integration branch also exists:
   `origin/integrate/sup-be-003-closeout-v2 @ 43339d22e649b041daef3a9b2e3184397591bc13`,
   exposed as open PR `#810`, but it is not a safe parent closeout rail for
   this task because it is rooted on unrelated integration ancestry.

## Exact Contamination

The contamination is commit-history contamination across three rails.

1. `origin/codex2/sup-be-003` is the blocked original rail. Its task stack is:
   four `wip(SUP-BE-003)` anchors, then invalid closeout `83d87e205`, then
   merge commit `3047636d3`.
2. The invalid closeout subject on `83d87e205` means a normal follow-up commit
   cannot fix the already-pushed commit headline; CI still inspects the bad
   commit in PR `#806`.
3. The merge commit `3047636d3` adds a second permanently-invalid commit to the
   same PR history. Again, a later normal commit cannot repair that subject.
4. `origin/codex2/sup-be-003-clean` replays the same Fleet Partner task diff on
   top of the pre-merge base `24a1603e99849e846b9e149a575f91c0e46c3181` and
   ends with canonical closeout `2eb787131`.
5. `origin/integrate/sup-be-003-closeout-v2` is not descended from the clean
   branch. It is rooted on integration commit
   `1695fcea734d45e8f28802c675ff8954423355ab` from `integrate/rep-be-002-closeout`,
   so it carries unrelated reporting/integration ancestry even though its tip
   subject is canonical.

## Evidence

### Branch and PR state

- `origin/codex2/sup-be-003 @ 3047636d36ca741096b1b83cb4c8d75b83cc36bc`
  with open PR `#806`
  `https://github.com/ajoe734/drts-fleet-platform/pull/806`
- `origin/codex2/sup-be-003-clean @ 2eb7871314e91b0f395f7358169df918dc20e9ec`
  with open PR `#804`
  `https://github.com/ajoe734/drts-fleet-platform/pull/804`
- `origin/integrate/sup-be-003-closeout-v2 @ 43339d22e649b041daef3a9b2e3184397591bc13`
  with open PR `#810`
  `https://github.com/ajoe734/drts-fleet-platform/pull/810`

### Commit evidence

- `83d87e205` subject:
  `closeout(SUP-BE-003): finalize fleet partner submission APIs`
- `3047636d3` subject:
  `Merge remote-tracking branch 'origin/dev' into codex2/sup-be-003`
- `2eb787131` subject:
  `SUP-BE-003: finalize fleet partner submission APIs`
- `43339d22e` subject:
  `SUP-BE-003: finalize fleet partner submission APIs`

### Diff shape

From the shared pre-merge base `24a1603e9`, both the blocked branch and the
clean branch carry the same nine Fleet Partner files and no extra task files:

- `apps/api/src/modules/fleet-partner/fleet-partner.controller.ts`
- `apps/api/src/modules/fleet-partner/fleet-partner.module.ts`
- `apps/api/src/modules/fleet-partner/fleet-partner.service.ts`
- `apps/api/src/modules/fleet-partner/supply-document.service.ts`
- `apps/api/src/modules/fleet-partner/supply-readiness.service.ts`
- `apps/api/src/modules/fleet-partner/supply-submission.repository.ts`
- `apps/api/src/modules/fleet-partner/supply-submission.service.ts`
- `apps/api/src/modules/fleet-partner/supply-submission.types.ts`
- `apps/api/tests/unit/fleet-partner.controller.test.ts`

The block is therefore not about final tree contents. It is specifically about
the pushed commit history that PR `#806` asks CI to validate.

### Integration contamination evidence

- `git merge-base origin/dev origin/codex2/sup-be-003 = 24a1603e9`
- `git merge-base origin/dev origin/codex2/sup-be-003-clean = 24a1603e9`
- `git merge-base origin/dev origin/integrate/sup-be-003-closeout-v2 = 1695fcea7`
- `git rev-list --left-right --count origin/codex2/sup-be-003...origin/codex2/sup-be-003-clean`
  returned `6 5`
- `git rev-list --left-right --count origin/codex2/sup-be-003-clean...origin/integrate/sup-be-003-closeout-v2`
  returned `5 8`

That shows the clean branch is a sibling replay of the contaminated owner
branch, while the integrate branch is a different integration line entirely.

## Non-Destructive Repair Path

Do not force-push `codex2/sup-be-003`. Do not try to "fix" PR `#806` or PR
`#810` with additional commits.

1. Freeze `origin/codex2/sup-be-003` and PR `#806` as audit evidence of the
   contaminated history.
2. Treat `origin/codex2/sup-be-003-clean @ 2eb7871314e91b0f395f7358169df918dc20e9ec`
   and PR `#804` as the canonical non-destructive repair rail.
3. Use PR `#804` for reviewer confirmation and eventual merge; it already
   carries the canonical subject/trailer form and avoids the invalid merge
   commit.
4. Do not use `integrate/sup-be-003-closeout-v2` / PR `#810` as the parent
   closeout path. That rail belongs to a later integration line and is not the
   minimal repair for the blocked parent task.
5. After PR `#804` is accepted, parent closeout can proceed from the clean rail
   with a normal non-force push only. No shared history rewrite is required.

## Concrete Parent Next Step

Update parent `SUP-BE-003` to say:

> The unblock path is confirmed. Ignore contaminated PR `#806`
> (`codex2/sup-be-003`) and integration PR `#810`
> (`integrate/sup-be-003-closeout-v2`). Resume from clean branch
> `origin/codex2/sup-be-003-clean @ 2eb7871314e91b0f395f7358169df918dc20e9ec`
> and open PR `#804` as the canonical closeout rail. No force-push is needed;
> parent work can move forward by reviewing/merging `#804` or by handing the
> parent owner back onto that clean branch for formal closeout evidence.

## Why This Is Safe

- No existing shared ref is rewritten
- No force-push is required
- The contaminated original rail remains available for audit
- The clean replay rail already exists on origin with its own PR evidence
- The parent can move forward using a normal branch/PR flow

## Branch Closeout Evidence

- Task evidence branch:
  `codex/sup-be-003-unblock-history-repair`
- Canonical task artifact on this branch:
  `support/unblock/SUP-BE-003/SUP-BE-003-UNBLOCK-HISTORY-REPAIR.md`
- Previously pushed anchor commit on this task branch:
  `9fc212b460a89276e6e2db03e4c61ddb3d81cbb2`
  `wip(SUP-BE-003-UNBLOCK-HISTORY-REPAIR): anchor non-destructive repair path`
- Formal owner closeout for this support task is branch-only evidence. It does not
  merge code into `origin/dev` and does not claim dev deployment.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Read `.orchestrator/skills/task-closeout-finalization.md`
- Inspected machine truth with:
  - `AI_NAME=Codex scripts/ai-status.sh show SUP-BE-003-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show SUP-BE-003`
- Audited refs and ancestry with:
  - `git branch --show-current`
  - `git branch -a --contains 3047636d3`
  - `git log --graph --oneline --decorate --max-count=40 origin/dev origin/codex2/sup-be-003 origin/codex2/sup-be-003-clean origin/integrate/sup-be-003-closeout-v2`
  - `git show --format=fuller --stat 3047636d3`
  - `git show --format=fuller --stat 83d87e205`
  - `git show --format=fuller --stat 2eb787131`
  - `git show --format=fuller --stat 43339d22e`
  - `git merge-base origin/dev origin/codex2/sup-be-003`
  - `git merge-base origin/dev origin/codex2/sup-be-003-clean`
  - `git merge-base origin/dev origin/integrate/sup-be-003-closeout-v2`
  - `git diff --name-only 24a1603e9..3047636d3`
  - `git diff --name-only 24a1603e9..2eb787131`
  - `git rev-list --left-right --count origin/codex2/sup-be-003...origin/codex2/sup-be-003-clean`
  - `git rev-list --left-right --count origin/codex2/sup-be-003-clean...origin/integrate/sup-be-003-closeout-v2`
- Collected PR evidence with:
  - `gh pr list --head codex2/sup-be-003 --state all --json number,title,state,url,headRefName,baseRefName,isDraft`
  - `gh pr list --head codex2/sup-be-003-clean --state all --json number,title,state,url,headRefName,baseRefName,isDraft`
  - `gh pr list --head integrate/sup-be-003-closeout-v2 --state all --json number,title,state,url,headRefName,baseRefName,isDraft`
  - `gh pr view 804 --json number,title,state,url,headRefName,baseRefName,commits`
  - `gh pr view 806 --json number,title,state,url,headRefName,baseRefName,commits`
  - `gh pr view 810 --json number,title,state,url,headRefName,baseRefName,commits`
