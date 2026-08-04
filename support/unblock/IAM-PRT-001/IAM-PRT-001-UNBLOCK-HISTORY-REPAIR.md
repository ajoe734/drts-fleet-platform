# IAM-PRT-001 Unblock History Repair

## Scope

- Task: `IAM-PRT-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `IAM-PRT-001`
- Owner: `Codex`
- Reviewer: `Gemini`
- Audit timestamp: `2026-08-04`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-prt-001-unblock-history-repair`
- Assigned helper branch:
  `codex/iam-prt-001-unblock-history-repair`

## Diagnosis

`IAM-PRT-001` is not blocked by a missing implementation commit. It is blocked
by branch/worktree/ref-tracking contamination around the already-finished owner
branch.

1. The canonical owner branch already exists locally as
   `codex/iam-prt-001 @ ff27bbb0b9b4438cd14d913174fa45a49fcc90bd`
   with closeout subject
   `chore(IAM-PRT-001): finalize approved owner closeout`.
2. The actual remote branch also exists at the same tip. `git ls-remote --heads
   origin 'refs/heads/codex/iam-prt-001'` returns
   `ff27bbb0b9b4438cd14d913174fa45a49fcc90bd refs/heads/codex/iam-prt-001`.
3. The local remote-tracking ref is stale and misleading:
   `refs/remotes/origin/codex/iam-prt-001` still points at
   `c012cabf37a4add80394e441bf133b943cbe029d`, even after `git fetch origin`.
4. The reason the tracking ref stays stale is explicit repo configuration:
   `remote.origin.fetch` only fetches
   `+refs/heads/dev:refs/remotes/origin/dev`. This clone does not automatically
   refresh worker-branch tracking refs under `origin/codex/*`.
5. The assigned helper branch/worktree for this unblock task is not the parent
   rail. It sits on `origin/dev` as
   `codex/iam-prt-001-unblock-history-repair @ 1d9ec5ae...` and has no parent
   task commits.
6. Before this repair there was no GitHub PR for the canonical owner branch
   `codex/iam-prt-001`, so the parent had no path from `branch_pushed`
   evidence to `merged_to_dev` evidence.
7. This repair reopened that normal rail by creating PR `#1294`
   (`IAM-PRT-001: add expiry ownership and dual rotation to partner credentials`)
   from `codex/iam-prt-001` to `dev`. At audit time the PR is `OPEN` and CI is
   running, so the remaining blocker is integration completion rather than
   branch ambiguity.

The parent is therefore blocked by stale branch-tracking evidence plus the
helper worktree being on a separate audit rail, not by missing feature work.

## Evidence

### Branch and worktree state

- helper branch:
  `codex/iam-prt-001-unblock-history-repair @ 1d9ec5ae54559f75d0b2bef64dd1df980f3307ac`
- canonical owner branch:
  `codex/iam-prt-001 @ ff27bbb0b9b4438cd14d913174fa45a49fcc90bd`
- stale local remote-tracking ref:
  `origin/codex/iam-prt-001 @ c012cabf37a4add80394e441bf133b943cbe029d`
- actual remote owner branch:
  `origin codex/iam-prt-001 @ ff27bbb0b9b4438cd14d913174fa45a49fcc90bd`
  from `git ls-remote --heads origin`
- only this helper worktree is attached to the task stem in the current clone:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-iam-prt-001-unblock-history-repair`
- `git branch -vv` shows:
  - `codex/iam-prt-001` has no upstream configured
  - `codex/iam-prt-001-unblock-history-repair` tracks `origin/dev`
- `git config --get-all remote.origin.fetch` returns only:
  - `+refs/heads/dev:refs/remotes/origin/dev`

### Parent provenance

- `git reflog show --date=iso codex/iam-prt-001` shows the branch was created
  from `origin/dev` on `2026-08-02 12:18:27 +0000` and advanced through the
  full owner closeout sequence to `ff27bbb0` on `2026-08-04 01:50:02 +0000`.
- `git show --stat --summary --name-only` confirms the parent branch carries
  the expected task commits:
  - `c2e1e222` `feat(IAM-PRT-001): add credential expiry ownership rotation`
  - `c012cabf` `fix(IAM-PRT-001): unblock tenant-partner build`
  - `76383e6c` `wip(IAM-PRT-001): anchor webhook credential audit evidence`
  - `4c68d92c` `wip(IAM-PRT-001): anchor rotation fail-closed and webhook secret pruning`
  - `9879a13f` `chore(IAM-PRT-001): finalize owner closeout`
  - `ff27bbb0` `chore(IAM-PRT-001): finalize approved owner closeout`
- `git diff --name-only origin/dev...codex/iam-prt-001` confirms the branch
  still owns the expected IAM-PRT-001 delta across 10 files:
  - `apps/api/src/common/audit/security-event-matrix.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
  - `apps/api/tests/unit/tenant-partner.service.test.ts`
  - `apps/tenant-portal-web/app/api-keys/page.tsx`
  - `packages/contracts/src/index.ts`
  - `tests/integration/tenant-partner-credential-lifecycle.integration.test.ts`
  - `tests/unit/security-events.test.ts`
  - `tests/unit/tenant-partner-foundation.test.ts`

### Machine-truth evidence

- `AI_NAME=Codex scripts/ai-status.sh show IAM-PRT-001` reports the parent as
  `in_progress` after this repair.
- Its `next` field now explicitly says the history ambiguity is resolved and
  PR `#1294` is the canonical integration rail to monitor.
- That statement is only half-usable in this clone because the local
  `origin/codex/iam-prt-001` ref contradicts it. Without checking `ls-remote`,
  a worker is led toward the false conclusion that the owner branch was never
  pushed.

### Review and verification evidence

- helper task commit:
  `6b2bf90fcdb15402273c96e362428883f09e7d2c`
  (`docs(IAM-PRT-001-UNBLOCK-HISTORY-REPAIR): record branch history repair`)
- helper task pushed branch:
  `origin/codex/iam-prt-001-unblock-history-repair`
- helper task PR:
  `#1295`
  `https://github.com/ajoe734/drts-fleet-platform/pull/1295`
- repaired parent integration PR:
  `#1294`
  `https://github.com/ajoe734/drts-fleet-platform/pull/1294`

## Exact Contamination

The exact contamination is three-part:

1. The canonical owner branch is healthy and already pushed, but the local
   remote-tracking ref for the same branch is stale because this clone fetches
   only `origin/dev`.
2. The helper worktree for `IAM-PRT-001-UNBLOCK-HISTORY-REPAIR` is attached to
   a fresh audit branch on `origin/dev`, not to the real owner branch, so it is
   the wrong rail to judge parent delivery state.
3. The parent task needed a normal PR on the true owner branch. Once the
   tracking ambiguity was resolved, the correct repair was to reopen that PR
   rail instead of doing more history surgery.

This is branch/worktree/commit evidence contamination, not missing delivery
work.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any branch.

1. Treat `codex/iam-prt-001 @ ff27bbb0...` as the only canonical owner branch
   for `IAM-PRT-001`.
2. Treat `codex/iam-prt-001-unblock-history-repair` as audit-only evidence for
   this diagnosis. Do not cherry-pick parent commits onto it.
3. When verifying whether the owner branch is pushed, use
   `git ls-remote --heads origin 'refs/heads/codex/iam-prt-001'` or GitHub PR
   state, not the stale local `origin/codex/iam-prt-001` tracking ref.
4. Reopen the normal integration rail from the existing pushed owner branch by
   creating or resuming a PR from `codex/iam-prt-001` to `dev`.
5. This task already did that repair by opening PR `#1294`:
   `https://github.com/ajoe734/drts-fleet-platform/pull/1294`.
6. Continue the parent task from that PR rail until it reaches accepted
   integration evidence (`merged_to_dev` or stronger), instead of reopening a
   new repair branch.

## Concrete Parent Next Step

`IAM-PRT-001` should resume on the already-pushed owner branch
`codex/iam-prt-001 @ ff27bbb0...`.

Concrete next step:

1. use the now-open PR `#1294` from `codex/iam-prt-001` to `dev`
2. use that PR as the canonical integration evidence instead of the stale local
   `origin/codex/iam-prt-001` ref
3. wait for merge / dev-level evidence, then finalize the parent through the
   normal `review_approved -> done` path

## Why This Is Safe

- no shared ref is rewritten
- no force-push is required
- the existing owner branch remains the canonical delivery rail
- the helper branch remains available as immutable audit evidence
- the repair path is additive: it corrects interpretation and resumes the
  normal PR/integration flow instead of replaying or rewriting commits

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- checked machine truth with:
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-PRT-001`
  - `AI_NAME=Codex scripts/ai-status.sh show IAM-PRT-001-UNBLOCK-HISTORY-REPAIR`
- inspected branch / ref / worktree state:
  - `git branch --show-current`
  - `git branch -vv --list 'codex/iam-prt-001' 'codex/iam-prt-001-unblock-history-repair'`
  - `git worktree list --porcelain`
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)'`
  - `git config --get-all remote.origin.fetch`
  - `git ls-remote --heads origin 'refs/heads/codex/iam-prt-001' 'refs/heads/codex/iam-prt-001-unblock-history-repair'`
- inspected parent provenance:
  - `git reflog show --date=iso codex/iam-prt-001`
  - `git show --stat --summary --name-only c2e1e222 c012cabf 76383e6c 4c68d92c 9879a13f ff27bbb0`
  - `git diff --name-only origin/dev...codex/iam-prt-001`
- checked GitHub PR visibility:
  - `gh pr list --state all --head 'codex:codex/iam-prt-001' --json number,title,url,state,headRefName,baseRefName,isDraft,mergedAt,closedAt`
  - `gh pr create --base dev --head codex/iam-prt-001 --title 'IAM-PRT-001: add expiry ownership and dual rotation to partner credentials' ...`
  - `gh pr view 1294 --json number,title,url,state,headRefName,baseRefName,isDraft,mergeStateStatus,statusCheckRollup`

No runtime tests were run in this helper task. This repair is branch-history
triage plus unblock routing only.
