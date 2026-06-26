# P2-REG-001 Unblock History Repair

## Scope

- Task: `P2-REG-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-REG-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-26T16:14:04Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-reg-001-unblock-history-repair`
- Assigned helper branch:
  `codex/p2-reg-001-unblock-history-repair`

## Diagnosis

`P2-REG-001` is not blocked by missing implementation. The implementation commit
already exists on `origin/codex2/p2-reg-001`, but that parent rail is stranded
behind `origin/dev` and easy to mis-resume from the wrong branch name.

1. The canonical parent rail is `origin/codex2/p2-reg-001 @ e10a2c875ba0f4459ec59ad34e020bdd3a854115`.
   It is one commit ahead of its fork point `3ffb9143d009dd73f5f06e5fe31edaf9a06b0cd1`,
   but `origin/dev` has advanced by three commits since then.
2. No PR exists for the canonical parent rail. `gh pr list --state all --head codex2:p2-reg-001`
   returns `[]`.
3. No active worktree is attached to `codex2/p2-reg-001`, so there is no
   obvious checked-out resume point for the actual parent branch in this clone.
4. A stale local branch `codex/p2-reg-001` exists and was created from
   `origin/dev` at `2026-06-26 15:54:35 +0000`, but it points at unrelated
   commit `021d7561327ca843ff38ab6cfe724f29a491939b`
   (`P2-UI-SAFE-001-UNBLOCK-PLANNING-DECISION`). There is no matching remote
   branch `origin/codex/p2-reg-001`.
5. At audit start, the assigned helper branch
   `codex/p2-reg-001-unblock-history-repair` was checked out from
   `origin/dev @ 0fa83215b97a7be63f90f004bff2a313f233cb16` and contained no
   replay of the parent implementation commit. It is a diagnosis rail only.

## Evidence

### Canonical parent rail

- `origin/dev @ 0fa83215b97a7be63f90f004bff2a313f233cb16`
- `origin/codex2/p2-reg-001 @ e10a2c875ba0f4459ec59ad34e020bdd3a854115`
- `git merge-base origin/dev origin/codex2/p2-reg-001`
  returns `3ffb9143d009dd73f5f06e5fe31edaf9a06b0cd1`
- `git rev-list --left-right --count origin/dev...origin/codex2/p2-reg-001`
  returns `3 1`
- `git log --oneline --left-right origin/dev...origin/codex2/p2-reg-001`
  shows:
  - `< 2714f2912 P2-CORR-001: takeover three-source correlation closeout (#938)`
  - `< 021d75613 P2-UI-SAFE-001-UNBLOCK-PLANNING-DECISION: record safety-operator submit-only contract (#937)`
  - `< 0fa83215b P2-UI-SAFE-001-UNBLOCK-PLANNING-DECISION: reroute safety-operator canvas unblock (#940)`
  - `> e10a2c875 P2-REG-001: implement regulatory notification workflow`
- `git show --name-status --stat --format=fuller e10a2c875`
  confirms the parent branch carries exactly one task commit with these file
  changes:
  - `M apps/api/src/common/auth/auth.policy.ts`
  - `A apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts`
  - `M apps/api/src/modules/regulatory-reporting/regulatory-reporting.module.ts`
  - `M apps/api/src/modules/regulatory-reporting/regulatory-reporting.service.ts`
  - `A apps/api/tests/integration/int-reg-001-regulatory-notification-lifecycle.test.ts`
  - `A apps/api/tests/unit/regulatory-reporting.service.test.ts`
  - `M packages/contracts/src/phase2-tesla-fsd-sandbox.ts`

### Branch-name contamination

- At audit start, `git branch -a --list '*p2-reg-001*' -vv` showed:
  - `codex/p2-reg-001 @ 021d75613 [origin/dev: behind 1]`
  - `codex/p2-reg-001-unblock-history-repair @ 0fa83215b [origin/dev]`
  - `codex2/p2-reg-001 @ e10a2c875 [origin/codex2/p2-reg-001]`
- `git show -s --format=fuller 021d75613` confirms the stale local branch
  points at unrelated task `P2-UI-SAFE-001-UNBLOCK-PLANNING-DECISION`.
- `git reflog show --date=iso codex/p2-reg-001`
  records only:
  `branch: Created from origin/dev`
- `git ls-remote --heads origin 'refs/heads/codex/p2-reg-001' 'refs/heads/codex2/p2-reg-001'`
  returns only `refs/heads/codex2/p2-reg-001`.

### Worktree state

- `git worktree list --porcelain` shows the helper worktree attached to
  `codex/p2-reg-001-unblock-history-repair`, but no worktree attached to
  `codex2/p2-reg-001`.
- `git worktree list --porcelain | awk 'BEGIN{p=\"\"} /^worktree /{p=substr($0,10)} /^branch refs\\/heads\\/codex2\\/p2-reg-001$/{print p; exit}'`
  returns nothing.

### Replay safety

- `git show --format= --binary e10a2c875 | git apply --check -`
  succeeds at current `origin/dev`, proving the canonical parent commit can be
  replayed onto current `dev` without rewriting the existing shared branch.

## Exact Contamination

The blocking contamination is a mix of branch-name ambiguity and stranded
integration state:

1. The only pushed parent rail is `origin/codex2/p2-reg-001`, but the repo also
   contains a misleading local `codex/p2-reg-001` ref under the same task stem
   that points at an unrelated UI-safe commit.
2. The canonical parent branch has no active worktree and no PR, so the next
   owner handoff has no obvious checked-out resume point even though the
   implementation commit already exists.
3. The canonical parent branch is based on old `dev` (`3ffb9143`) and is now
   behind `origin/dev` by three commits. Repairing it with a rebase would
   require force-pushing shared history, which this task forbids.

The parent task is therefore blocked not because the implementation is missing,
but because the existing shared branch is the wrong place to do the final
integration closeout.

## Non-Destructive Repair Path

Do not force-push, amend, or rename any shared branch.

1. Keep `origin/codex2/p2-reg-001 @ e10a2c875` as the audit branch for the
   original implementation commit.
2. Treat local `codex/p2-reg-001 @ 021d75613` as stale noise only. Do not use
   it for worktree attach, review, or PR creation.
3. Resume integration from current `origin/dev`, not from the old parent branch
   tip. Create a fresh replay branch and cherry-pick the parent commit:

```bash
git fetch origin --prune
git worktree add .artifacts/worktrees/auto/codex2-p2-reg-001-replay -b codex2/p2-reg-001-replay origin/dev
cd .artifacts/worktrees/auto/codex2-p2-reg-001-replay
git cherry-pick -x e10a2c875ba0f4459ec59ad34e020bdd3a854115
git push -u origin codex2/p2-reg-001-replay
gh pr create --base dev --head codex2/p2-reg-001-replay \
  --title "P2-REG-001: integrate regulatory notification workflow" \
  --body "Replay e10a2c875 onto current origin/dev without rewriting origin/codex2/p2-reg-001."
```

4. Use the replay branch, not `origin/codex2/p2-reg-001`, for the integration
   gate, PR CI, and merge-to-`dev` evidence.
5. Leave the existing shared branch untouched. It remains valuable as the audit
   anchor for the original implementation and verification note.

## Concrete Parent Next Step

`P2-REG-001` should move from "branch pushed but blocked by integration gate" to
"open a clean PR from a replay branch":

1. Reattach on a fresh branch from `origin/dev`, not on stale local
   `codex/p2-reg-001`.
2. Cherry-pick `e10a2c875ba0f4459ec59ad34e020bdd3a854115` onto that fresh branch.
3. Push the replay branch and open the parent PR to `dev`.
4. Once the replay branch is merged to `origin/dev`, rerun closeout with merge
   evidence instead of trying to force the old shared branch through the gate.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The existing implementation commit and its verification remain auditable on
  `origin/codex2/p2-reg-001`.
- The repair uses standard branch/worktree/commit flow on top of current
  `origin/dev`.
- The misleading stale local branch can be ignored rather than destructively
  cleaned up.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show P2-REG-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-REG-001`
- Inspected refs and worktrees:
  - `git fetch origin --prune`
  - `git branch -a --list '*p2-reg-001*' -vv`
  - `git show-ref | grep 'p2-reg-001'`
  - `git reflog show --date=iso codex/p2-reg-001`
  - `git worktree list --porcelain`
  - `git ls-remote --heads origin 'refs/heads/codex/p2-reg-001' 'refs/heads/codex2/p2-reg-001' 'refs/heads/codex/p2-reg-001-unblock-history-repair'`
- Inspected parent commit and integration gap:
  - `git merge-base origin/dev origin/codex2/p2-reg-001`
  - `git rev-list --left-right --count origin/dev...origin/codex2/p2-reg-001`
  - `git log --oneline --left-right origin/dev...origin/codex2/p2-reg-001`
  - `git show --name-status --stat --format=fuller e10a2c875`
  - `gh pr list --state all --head codex2:p2-reg-001 --json number,title,state,isDraft,headRefName,baseRefName,url,mergeStateStatus`
- Verified non-destructive replay path:
  - `git show --format= --binary e10a2c875 | git apply --check -`

No runtime or package tests were run in this helper task. This repair is
branch-history and integration-path triage only.
