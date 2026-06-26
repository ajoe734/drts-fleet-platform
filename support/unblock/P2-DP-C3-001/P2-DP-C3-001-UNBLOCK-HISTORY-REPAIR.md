# P2-DP-C3-001 Unblock History Repair

## Scope

- Task: `P2-DP-C3-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-DP-C3-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-06-26T07:18:43Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p2-dp-c3-001-unblock-history-repair`
- Assigned helper branch:
  `codex/p2-dp-c3-001-unblock-history-repair`

## Diagnosis

`P2-DP-C3-001` is blocked by review-state drift plus split branch lineage, not by
missing sandbox fulfillment code.

1. Canonical activity log records a valid reviewer approval at
   `2026-06-26T07:02:24Z`: `Codex` approved
   `origin/codex2/p2-dp-c3-001-r2 @ 3c7cf3689`.
2. Five minutes later the owner emitted a `progress` update instead of a final
   `done`. `scripts/ai_status.py` makes `progress` downgrade
   `review_approved -> in_progress`, so the truthful reviewer-approved parent
   state was overwritten by workflow drift rather than by a new review finding.
3. The owner then pushed `origin/codex2/p2-dp-c3-001 @ de74cccaf`, but that ref
   is a contaminated merge rail. It merges the clean reviewed `r2` chain with an
   older superseded chain and therefore cannot serve as the single canonical
   review rail even though its final tree is correct.
4. GitHub routing is also stale:
   - PR `#906` targets `codex2/p2-dp-c3-001 -> dev`, but it is closed and tied
     to the contaminated merge rail.
   - PR `#908` is still open, but it targets `codex2/p2-dp-c3-001-r1`, an older
     replacement-closeout branch that does not contain the final reviewed fix at
     `3c7cf3689`.
   - No PR exists for the actual clean reviewed branch
     `codex2/p2-dp-c3-001-r2`.
5. Local residue confirms the task history never converged onto a single branch:
   - local reviewer branch `codex/p2-dp-c3-001 @ 1e5c20874` still exists as a
     stale non-remote rail
   - detached review worktree `/tmp/p2-dp-c3-001-review-ref @ 74f01374a`
     preserves an intermediate pre-fix commit
6. Before this helper task, the expected artifact path for this unblock note did
   not exist, so machine truth had no durable document telling the parent which
   branch to trust and how to replay the blocked `review -> review_approved`
   closeout path without rewriting shared history.

## Evidence

### Branch and worktree state

- `origin/dev @ 2aadf91b0c180fd5186ea3a78447d6eb1c7759d9`
- `origin/codex2/p2-dp-c3-001-r1 @ e954eba8c7e0c1ba5d9974e2bb80164cf94ae096`
- `origin/codex2/p2-dp-c3-001-r2 @ 3c7cf368928b0f880513307ef176f2df709019a0`
- `origin/codex2/p2-dp-c3-001 @ de74cccaf74bcad266cec01bb6f548ffcbba9177`
- local `codex/p2-dp-c3-001 @ 1e5c20874c5e6a837d156a4380cb3b81282dd96f`
  with `git branch -vv` showing `[origin/dev: ahead 5, behind 2]`
- helper branch
  `codex/p2-dp-c3-001-unblock-history-repair @ 2aadf91b0c180fd5186ea3a78447d6eb1c7759d9`
- detached review worktree `/tmp/p2-dp-c3-001-review-ref @ 74f01374a`
  (`fix(P2-DP-C3-001): correct sandbox fulfillment projection states`)
- `git rev-list --left-right --count origin/dev...origin/codex2/p2-dp-c3-001-r2`
  returns `0 7`
- `git rev-list --left-right --count origin/dev...origin/codex2/p2-dp-c3-001`
  returns `0 15`
- `git rev-list --left-right --count origin/codex2/p2-dp-c3-001-r2...origin/codex2/p2-dp-c3-001`
  returns `0 8`
- `git worktree list --porcelain | sed -n '/p2-dp-c3-001/,+2p'` shows only the
  helper worktree and the detached `/tmp/p2-dp-c3-001-review-ref`, which is
  enough evidence that review residue survived outside the canonical helper
  branch

### Commit lineage

- `git log --reverse --format='%H %s' origin/dev..origin/codex2/p2-dp-c3-001-r2`
  shows the clean reviewed stack:
  - `b06f80639c20ad5a061b77e772aaab4e0634fc33`
    `wip(P2-DP-C3-001): anchor sandbox fulfillment visibility projections`
  - `09827fdcb6db94b7302ba0965770169aed0a62d4`
    `P2-DP-C3-001: correct sandbox fulfillment projection states`
  - `c1d50a078e9235397ee4e5dd7baf3cb393c0f25c`
    `P2-DP-C3-001: emit sandbox fulfillment webhooks on transitions`
  - `6ddc63b7d2a4093d73bc56df823611cd668399d8`
    `P2-DP-C3-001: finalize owner closeout`
  - `af42320a400040d5d8ec27c33eec93639e9835cf`
    `P2-DP-C3-001: ignore inactive sandbox assignments`
  - `c516077d3c5802fd9d2c99ab9332844021a2a64d`
    `P2-DP-C3-001: finalize approved sandbox fulfillment visibility closeout`
  - `3c7cf368928b0f880513307ef176f2df709019a0`
    `P2-DP-C3-001: preserve AV visibility after completion`
- `git log --reverse --format='%H %s' origin/codex2/p2-dp-c3-001-r2..origin/codex2/p2-dp-c3-001`
  shows the extra contaminated ancestry on the pushed closeout rail:
  - `20765a6ad348e9a7da480437286ae877f92fe2c5`
  - `05abd49aa94395a2eec3cbe5f1d321bf40bce6e4`
  - `6ce580cbe38c17a16692f2ca5eae516c0e96cff0`
  - `8a41c43ede1a3fdbae1f5f6cd69bccb6144072e4`
  - `1e5c20874c5e6a837d156a4380cb3b81282dd96f`
  - `78d2403e4bbdd82553fda73acbf2f7e8dba5c4bd`
  - `5c830c3650e92b006cfe0ab9cc8acede7cf58662`
  - `de74cccaf74bcad266cec01bb6f548ffcbba9177`
- `git show -s --format=fuller 3c7cf3689`, `git show -s --format=fuller 5c830c365`,
  and `git show -s --format=fuller de74cccaf` confirm:
  - `3c7cf3689` is the reviewed content fix
  - `5c830c365` is the zero-diff review-approved closeout commit
  - `de74cccaf` is the merge commit that absorbed the older branch history
- `git rev-parse 3c7cf3689^{tree} 5c830c365^{tree} de74cccaf^{tree}` returns the
  same tree id `6b2b412c9e64093f76979d9efd5991442705f614`
- `git rev-parse 78d2403e4^{tree}` returns
  `ab8ac18afbec648f2e703cf67e9b37e8368fa854`, proving the older branch stack had
  different file content before the final `3c7cf3689` fix landed

### PR and machine-truth state

- `gh pr view 906 --json number,title,headRefName,baseRefName,state,mergeStateStatus,url,commits`
  shows:
  - PR `#906`
  - `headRefName = codex2/p2-dp-c3-001`
  - `state = CLOSED`
  - `mergeStateStatus = BLOCKED`
  - the commit list stops at `78d2403e4`, so the closed PR does not represent
    the final reviewed rail
- `gh pr view 908 --json number,title,headRefName,baseRefName,state,mergeStateStatus,url,commits`
  shows:
  - PR `#908`
  - `headRefName = codex2/p2-dp-c3-001-r1`
  - `state = OPEN`
  - commit list limited to `f4ba132ba` and `e954eba8c`
  - therefore the open PR is stale and does not contain `3c7cf3689`
- `gh pr list --head codex2/p2-dp-c3-001-r2 --state all --json number,title,headRefName,baseRefName,state,url`
  returns `[]`
- Canonical activity log records:
  - `2026-06-26T07:02:24Z` `Codex` `review_approved`
  - `2026-06-26T07:07:38Z` `Codex2` `progress`
  - `2026-06-26T07:08:01Z` worker-failure evidence file
    `.orchestrator/evidence/codex-20260626T070229Z-17fa6d54.json`
  - `2026-06-26T07:10:09Z` `Codex2` `blocker`
- `scripts/ai_status.py` `command_progress(...)` explicitly converts
  `review_approved` to `in_progress` when the owner runs `progress`

### Replay safety

- `git diff --check origin/dev...origin/codex2/p2-dp-c3-001-r2` is clean
- `git merge-tree $(git merge-base origin/dev origin/codex2/p2-dp-c3-001-r2) origin/dev origin/codex2/p2-dp-c3-001-r2 | grep -n '<<<<<<<'`
  returns no output, which is enough evidence that the clean reviewed rail can
  be merged or replayed onto current `origin/dev` without conflict markers

## Exact Contamination

The parent is blocked by a four-part branch/worktree/commit mismatch:

1. The true reviewed implementation rail is
   `origin/codex2/p2-dp-c3-001-r2 @ 3c7cf3689`, but no PR points at it.
2. The pushed closeout rail `origin/codex2/p2-dp-c3-001 @ de74cccaf` is a
   merge of the clean `r2` ancestry and an older superseded ancestry. Its tree
   is correct, but its history is not a clean single review rail.
3. GitHub still exposes stale routing:
   - closed PR `#906` on the contaminated merge rail
   - open PR `#908` on the stale `r1` rail
4. Machine truth lost the truthful `review_approved` parent state because owner
   `progress` rewrote it to `in_progress`, and the later worker failure plus
   blocker message preserved that drift.

This is not a missing-code blocker. It is clean-code-on-wrong-rails plus a
replayable lifecycle regression.

## Non-Destructive Repair Path

Do not force-push, rebase, or rename any existing shared ref.

1. Freeze `origin/codex2/p2-dp-c3-001-r2 @ 3c7cf3689` as the canonical clean
   reviewed implementation rail.
2. Keep `origin/codex2/p2-dp-c3-001 @ de74cccaf` only as branch-pushed closeout
   evidence. Its tree matches the reviewed rail, but its merged ancestry should
   not be the canonical review target.
3. Ignore stale review residue for delivery purposes:
   - local `codex/p2-dp-c3-001`
   - detached `/tmp/p2-dp-c3-001-review-ref`
   - stale open PR `#908`
4. Open a fresh normal PR from the clean reviewed rail to `dev`. Because
   `origin/codex2/p2-dp-c3-001-r2` is already `0 behind` `origin/dev`, no
   replay cherry-pick branch is required unless the owner prefers a fresh head
   name:

```bash
git fetch origin
gh pr create \
  --base dev \
  --head codex2/p2-dp-c3-001-r2 \
  --title "P2-DP-C3-001: sandbox fulfillment visibility contract closeout" \
  --body "Canonical review rail for P2-DP-C3-001. Supersedes stale PR #908 on codex2/p2-dp-c3-001-r1 and closed contaminated PR #906 on codex2/p2-dp-c3-001 without force-pushing shared history."
```

5. Parent owner `Codex2` should replay the machine-truth lifecycle on that clean
   rail instead of trying to patch `review_approved` in place:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff P2-DP-C3-001 Codex \
  "Replay review on clean pushed branch origin/codex2/p2-dp-c3-001-r2@3c7cf3689 after fresh PR to dev. Supersedes stale PR #908 and contaminated branch-pushed closeout ref origin/codex2/p2-dp-c3-001@de74cccaf; reviewer should restore review_approved on the clean rail."
```

6. Parent reviewer `Codex` then re-approves the clean rail. This is the safe
   replacement for direct `ai-status` surgery because the prior approval was
   overwritten by owner `progress`.
7. After the fresh PR merges to `dev`, parent owner `Codex2` runs `done` with
   `INTEGRATION_STATUS=merged_to_dev` plus merge evidence. Do not try to mark
   the parent `done` from the blocked branch-only state.

## Concrete Parent Next Step

`P2-DP-C3-001` should stop using PR `#908` and should not rely on the
contaminated merge branch as the review target.

Concrete next step:

1. Open a new PR from `codex2/p2-dp-c3-001-r2` to `dev`.
2. Use that PR to re-handoff `P2-DP-C3-001` back to reviewer `Codex`.
3. Replay `review -> review_approved` on the clean rail.
4. After merge to `dev`, rerun `done` with `INTEGRATION_STATUS=merged_to_dev`.

## Why This Is Safe

- No remote ref is rewritten.
- No force-push is required.
- The contaminated merge branch remains available as audit evidence.
- The clean reviewed branch remains unchanged and already contains the accepted
  final tree.
- The fix uses normal PR + handoff replay instead of manual `ai-status.json`
  editing.
- The final helper change alters only support documentation plus parent `next`
  guidance, not product implementation code.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show P2-DP-C3-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-DP-C3-001`
- Inspected activity-log and failure evidence:
  - `grep -n '"task_id": "P2-DP-C3-001"\|"task_id": "P2-DP-C3-001-UNBLOCK-HISTORY-REPAIR"' /home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl | tail -n 80`
  - `sed -n '1,220p' /home/edna/workspace/drts-fleet-platform/.orchestrator/evidence/codex-20260626T070229Z-17fa6d54.json`
  - `sed -n '1,220p' /home/edna/workspace/drts-fleet-platform/.orchestrator/logs/20260626T070229318763Z-codex-codex2-c9cc65.log`
  - `sed -n '1900,2205p' scripts/ai_status.py`
- Compared related refs, trees, and worktrees:
  - `git branch -vv | grep 'p2-dp-c3-001'`
  - `git ls-remote --heads origin 'refs/heads/codex2/p2-dp-c3-001' 'refs/heads/codex2/p2-dp-c3-001-r1' 'refs/heads/codex2/p2-dp-c3-001-r2'`
  - `git worktree list --porcelain | sed -n '/p2-dp-c3-001/,+2p'`
  - `git log --oneline --decorate --graph --all --max-count=80 --grep='P2-DP-C3-001\|de74cccaf\|3c7cf3689'`
  - `git log --reverse --format='%H %s' origin/dev..origin/codex2/p2-dp-c3-001-r2`
  - `git log --reverse --format='%H %s' origin/codex2/p2-dp-c3-001-r2..origin/codex2/p2-dp-c3-001`
  - `git rev-list --left-right --count origin/dev...origin/codex2/p2-dp-c3-001`
  - `git rev-list --left-right --count origin/dev...origin/codex2/p2-dp-c3-001-r2`
  - `git rev-list --left-right --count origin/codex2/p2-dp-c3-001-r2...origin/codex2/p2-dp-c3-001`
  - `git show -s --format=fuller 3c7cf3689`
  - `git show -s --format=fuller 5c830c365`
  - `git show -s --format=fuller de74cccaf`
  - `git rev-parse 78d2403e4^{tree} 3c7cf3689^{tree} 5c830c365^{tree} de74cccaf^{tree}`
  - `git diff --stat 78d2403e4 3c7cf3689`
  - `git diff --stat 3c7cf3689 de74cccaf`
  - `git diff --check origin/dev...origin/codex2/p2-dp-c3-001-r2`
  - `git merge-tree $(git merge-base origin/dev origin/codex2/p2-dp-c3-001-r2) origin/dev origin/codex2/p2-dp-c3-001-r2 | grep -n '<<<<<<<'`
- Confirmed PR routing state:
  - `gh pr list --state all --search 'P2-DP-C3-001 in:title' --json number,title,headRefName,baseRefName,state,mergeStateStatus,url`
  - `gh pr list --head codex2/p2-dp-c3-001-r2 --state all --json number,title,headRefName,baseRefName,state,url`
  - `gh pr view 906 --json number,title,headRefName,baseRefName,state,mergeStateStatus,url,commits`
  - `gh pr view 908 --json number,title,headRefName,baseRefName,state,mergeStateStatus,url,commits`

No runtime or package tests were run in this helper task. This is a
branch/history/machine-truth repair only.
