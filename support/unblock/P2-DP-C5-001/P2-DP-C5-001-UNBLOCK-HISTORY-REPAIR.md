# P2-DP-C5-001 Unblock History Repair

## Scope

- Task: `P2-DP-C5-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-DP-C5-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-26T01:41:40Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-p2-dp-c5-001-unblock-history-repair`
- Assigned helper branch:
  `codex2/p2-dp-c5-001-unblock-history-repair`

## Diagnosis

`P2-DP-C5-001` is blocked by split branch lineage and missing integration
routing, not by missing Phase2 audit code.

1. The only pushed parent branch is `origin/codex/p2-dp-c5-001 @ 6f39a2caa`.
   It contains the accepted four-commit stack and a compliant closeout subject,
   but it is `ahead 4 / behind 1` versus `origin/dev`, so the delivered commit
   is not reachable from `dev`.
2. Parent machine truth confirms that the owner already tried to close out that
   branch-only state. `scripts/ai-status.sh show P2-DP-C5-001` records that
   `done` was refused by the integration gate because `branch_pushed` is not
   sufficient for a task that mutates canonical code.
3. No PR exists for `codex/p2-dp-c5-001`, so there is no normal merge path from
   the accepted branch into `dev`.
4. A second local parent branch exists:
   `codex2/p2-dp-c5-001 @ 29a2930e4ede89308c81227872aac057ae726545`. It is an
   older one-commit branch with subject
   `feat(P2-DP-C5-001): add phase2 audit catalog and helper`, which is a
   non-compliant closeout subject and a different tree from the accepted
   `origin/codex/p2-dp-c5-001` branch.
5. An additional detached review worktree remains at
   `/tmp/p2-dp-c5-001-review-S12azs @ 66c6b4655`. That residue is not the
   blocker by itself, but it confirms review activity happened on an
   intermediate commit rather than on a single canonical merge rail.
6. Before this helper task, the expected artifact path for this unblock task did
   not exist, so machine truth had no durable repair note telling the parent
   which lineage to keep and how to finish integration without force-pushing a
   shared branch.

## Evidence

### Branch and worktree state

- `origin/dev @ e723d0f2c37c4336da5ddc4769813582af9a28d5`
- `origin/codex/p2-dp-c5-001 @ 6f39a2caafd85d08c8e012f3c8c17dafa4af0d99`
- local `codex2/p2-dp-c5-001 @ 29a2930e4ede89308c81227872aac057ae726545`
- helper branch `codex2/p2-dp-c5-001-unblock-history-repair @ e723d0f2c37c4336da5ddc4769813582af9a28d5`
- `git rev-list --left-right --count origin/dev...codex/p2-dp-c5-001`
  returns `1 4`
- `git rev-list --left-right --count origin/dev...codex2/p2-dp-c5-001`
  returns `2 1`
- `git branch -vv | grep 'p2-dp-c5-001'` shows:
  - `codex/p2-dp-c5-001` tracking `origin/codex/p2-dp-c5-001`
  - local `codex2/p2-dp-c5-001` tracking `origin/dev` with no matching remote
  - helper branch tracking `origin/dev`
- `git ls-remote --heads origin 'refs/heads/codex/p2-dp-c5-001' 'refs/heads/codex2/p2-dp-c5-001'`
  returns only `refs/heads/codex/p2-dp-c5-001`
- `git worktree list --porcelain | sed -n '/p2-dp-c5-001/,+2p'` shows:
  - helper worktree on `codex2/p2-dp-c5-001-unblock-history-repair`
  - sidecar worktree on `codex/p2-dp-c5-001-sidecar-acceptance`
  - detached review worktree `/tmp/p2-dp-c5-001-review-S12azs @ 66c6b4655`

### Commit lineage

- `git log --reverse --format='%H %s' origin/dev..codex/p2-dp-c5-001` shows the
  accepted stack:
  - `ff529ba087571766092f526baa81dc58b5a341f1`
    `wip(P2-DP-C5-001): anchor phase2 audit contracts and helper`
  - `7ebda704d2b6e3e83a4334cc115ac5e44c178b5a`
    `P2-DP-C5-001: fix phase2 audited action optional fields`
  - `66c6b4655b53f5f45f477e77c8aa628c8318ef28`
    `P2-DP-C5-001: fix sandbox governance amendment audits`
  - `6f39a2caafd85d08c8e012f3c8c17dafa4af0d99`
    `P2-DP-C5-001: record closeout verification`
- `git show -s --format=fuller 6f39a2caa` confirms the pushed closeout commit is
  trailer-compliant and carries the verification trailer.
- `git show -s --format=fuller 29a2930e4` confirms the alternate local branch
  uses subject `feat(P2-DP-C5-001): add phase2 audit catalog and helper`.
- `git rev-parse 29a2930e4^{tree} 6f39a2caa^{tree}` returns different tree ids:
  - `29a2930e4^{tree} = d8c663ca4fb41b1519b7129b042fa2f26b2cddd6`
  - `6f39a2caa^{tree} = 11f3826c9ffaa72864b1caf633b64270e7be63c1`
- `git diff --stat 29a2930e4 6f39a2caa` is non-empty, proving the local `codex2`
  branch is not a clean replay alias of the accepted pushed branch.

### Integration-gate state

- `scripts/ai_status.py` enforces `done` through `_enforce_integration_gate(...)`
  and refuses branch-only completion when integration gating is enabled.
- `AI_NAME=Codex2 scripts/ai-status.sh show P2-DP-C5-001` shows parent status
  `blocked` with:
  - owner `Codex`
  - reviewer `Codex2`
  - `next` saying the formal closeout commit `6f39a2caa` is pushed to
    `origin/codex/p2-dp-c5-001`, but `done` was refused because
    `branch_pushed` is branch-only and the task must wait for merge to `dev`
    before rerunning `done` with `INTEGRATION_STATUS=merged_to_dev` or
    `dev_deployed`
- `gh pr list --state all --head codex/p2-dp-c5-001 --json number,title,headRefName,baseRefName,state,mergeStateStatus,url`
  returns `[]`

### Replay safety

- `git diff --check origin/dev...codex/p2-dp-c5-001` is clean
- `git merge-tree $(git merge-base origin/dev codex/p2-dp-c5-001) origin/dev codex/p2-dp-c5-001`
  produces merged output for the task files without conflict markers, which is
  enough evidence that the accepted stack can be replayed onto current
  `origin/dev` without a destructive branch rewrite

## Exact Contamination

The parent is blocked by a three-part branch/worktree/commit mismatch:

1. The accepted task history lives on pushed branch
   `origin/codex/p2-dp-c5-001 @ 6f39a2caa`, but that branch has no PR and is no
   longer based on current `dev`.
2. A separate local branch, `codex2/p2-dp-c5-001 @ 29a2930e4`, preserves an
   older one-commit `feat(...)` lineage with a different tree and no remote,
   creating ambiguity about which branch is canonical.
3. A detached temporary review worktree at `66c6b4655` preserves intermediate
   review residue outside the final pushed tip, which reinforces that review and
   closeout did not converge on one canonical integration rail.

This is not a missing-code blocker. It is shared-history ambiguity plus missing
PR routing.

## Non-Destructive Repair Path

Do not force-push or rebase the existing shared branch `origin/codex/p2-dp-c5-001`.

1. Freeze `origin/codex/p2-dp-c5-001 @ 6f39a2caa` as the accepted audit branch
   and keep it as evidence of the reviewed task stack.
2. Ignore local `codex2/p2-dp-c5-001 @ 29a2930e4` and the detached
   `/tmp/p2-dp-c5-001-review-S12azs` worktree for integration purposes. They
   are contamination evidence, not the delivery rail.
3. Create a fresh replay branch from current `origin/dev` and cherry-pick the
   accepted four commits in order:

```bash
git fetch origin
git switch -c codex/p2-dp-c5-001-replay origin/dev
git cherry-pick ff529ba087571766092f526baa81dc58b5a341f1
git cherry-pick 7ebda704d2b6e3e83a4334cc115ac5e44c178b5a
git cherry-pick 66c6b4655b53f5f45f477e77c8aa628c8318ef28
git cherry-pick 6f39a2caafd85d08c8e012f3c8c17dafa4af0d99
git push -u origin codex/p2-dp-c5-001-replay
```

4. Open a normal PR from the replay branch to `dev` instead of trying to repair
   the existing shared branch in place:

```bash
gh pr create \
  --base dev \
  --head codex/p2-dp-c5-001-replay \
  --title "P2-DP-C5-001: canonical audit event catalog + Phase2AuditContext + ActionReceipt" \
  --body "Supersedes branch-only closeout on origin/codex/p2-dp-c5-001 @ 6f39a2caa. Replay preserves the accepted four-commit stack on current dev without force-pushing shared history."
```

5. Parent owner `Codex` should then replay the review handoff on the new pushed
   branch:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff P2-DP-C5-001 Codex2 \
  "Replay review on pushed clean branch origin/codex/p2-dp-c5-001-replay after cherry-picking ff529ba08, 7ebda704d, 66c6b4655, and 6f39a2caa onto current origin/dev. Supersedes branch-only closeout on origin/codex/p2-dp-c5-001 without force-push; review should proceed on the replay PR to dev."
```

6. Parent reviewer `Codex2` then reviews the replay PR on the clean branch. If
   no new issues are found, the parent returns to the normal
   `review -> review_approved -> done` flow after the replay branch merges to
   `dev`.

## Concrete Parent Next Step

`P2-DP-C5-001` should stop trying to finalize directly from
`origin/codex/p2-dp-c5-001 @ 6f39a2caa`.

Concrete next step:

1. Create `codex/p2-dp-c5-001-replay` from current `origin/dev`.
2. Cherry-pick `ff529ba08`, `7ebda704d`, `66c6b4655`, and `6f39a2caa`.
3. Push the replay branch and open a PR to `dev`.
4. Replay `scripts/ai-status.sh handoff P2-DP-C5-001 Codex2 ...` against that
   pushed replay branch.
5. After the replay PR merges, rerun parent `done` with
   `INTEGRATION_STATUS=merged_to_dev` and merge evidence.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The accepted pushed branch remains intact for audit.
- The older local `feat(...)` lineage is left untouched instead of being merged
  into machine truth.
- The replay path uses normal branch + PR flow from current `dev`.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-DP-C5-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-DP-C5-001`
- Inspected related refs and worktrees:
  - `git status --short`
  - `git branch -vv | grep 'p2-dp-c5-001'`
  - `git ls-remote --heads origin 'refs/heads/codex/p2-dp-c5-001' 'refs/heads/codex2/p2-dp-c5-001'`
  - `git worktree list --porcelain | sed -n '/p2-dp-c5-001/,+2p'`
  - `git log --oneline --decorate --graph --max-count=20 codex2/p2-dp-c5-001 codex/p2-dp-c5-001 origin/dev`
  - `git rev-list --left-right --count origin/dev...codex/p2-dp-c5-001`
  - `git rev-list --left-right --count origin/dev...codex2/p2-dp-c5-001`
  - `git log --reverse --format='%H %s' origin/dev..codex/p2-dp-c5-001`
  - `git show -s --format=fuller 29a2930e4`
  - `git show -s --format=fuller 6f39a2caa`
  - `git rev-parse 29a2930e4^{tree} 6f39a2caa^{tree}`
  - `git diff --stat 29a2930e4 6f39a2caa`
  - `git diff --name-only origin/dev...codex/p2-dp-c5-001`
  - `git diff --check origin/dev...codex/p2-dp-c5-001`
  - `git merge-tree $(git merge-base origin/dev codex/p2-dp-c5-001) origin/dev codex/p2-dp-c5-001`
- Inspected integration-gate behavior:
  - `sed -n '1017,1098p' scripts/ai_status.py`
  - `sed -n '2060,2145p' scripts/ai_status.py`
  - `grep -RIn 'branch_pushed\\|pr_open\\|merged_to_dev' .orchestrator scripts`
- Confirmed no existing parent PR:
  - `gh pr list --state all --head codex/p2-dp-c5-001 --json number,title,headRefName,baseRefName,state,mergeStateStatus,url`

No runtime or package tests were run in this helper task. This is a
branch/history/machine-truth repair only.
