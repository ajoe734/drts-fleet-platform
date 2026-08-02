# IAM-IDP-002 Unblock History Repair

Date: 2026-08-01
Task: `IAM-IDP-002-UNBLOCK-HISTORY-REPAIR`
Parent task: `IAM-IDP-002`
Canonical implementation branch: `gemini2/iam-idp-002`
Current owner worktree branch: `codex2/iam-idp-002`
Task branch: `codex/iam-idp-002-unblock-history-repair`

## Finding

No shared-history rewrite problem was found on the implementation branch.

- `gemini2/iam-idp-002` remains a linear branch from remote `dev` at `717a8719`.
- The canonical implementation tip is still `04429f88` (`fix(IAM-IDP-002): scope role binding evaluation to selected membership realm and add cross-realm regression tests`), and `PR #1251` is still open from that branch.
- The current contamination is branch/worktree/commit misalignment after the parent task was reassigned at `2026-08-01T23:58:19Z`: the new owner worktree is pinned to `codex2/iam-idp-002@717a8719`, while the real implementation and review rail remain on `gemini2/iam-idp-002@04429f88`.
- Parent machine truth was also contaminated at dispatch time: `IAM-IDP-002` still recorded `integration_status=merged_to_dev`, even though GitHub showed remote `dev@717a8719` and `PR #1251` as `OPEN` / `BLOCKED`.
- This task repairs that parent machine truth to branch/PR-level evidence: `integration_status=pr_open`, `pr_url=https://github.com/ajoe734/drts-fleet-platform/pull/1251`, and a concrete ff-only next step for `codex2/iam-idp-002`.

There is also real worktree contamination in the Gemini2 task worktree, but it is separate from branch history:

- unrelated tracked modification: `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json`
- many untracked `node_modules/` directories

Those files should not be staged into `IAM-IDP-002`.

## Evidence

- `git ls-remote --heads origin dev` resolves to `717a87195d59943a8601b5f4d3bc7d7e8317daad`.
- `git ls-remote --heads origin gemini2/iam-idp-002` resolves to `04429f88f53322a4c080cd862d7233fa91541ae8`.
- `git ls-remote --heads origin codex2/iam-idp-002` returns no branch. The reassigned owner branch does not exist remotely.
- `git merge-base dev gemini2/iam-idp-002` resolves to `717a8719`, and `git rev-list --left-right --count codex2/iam-idp-002...gemini2/iam-idp-002` reports `0 20`.
- `git worktree list --porcelain` shows `codex2/iam-idp-002` checked out at `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex2-iam-idp-002` with `HEAD 717a8719`, while `gemini2/iam-idp-002` is checked out at `/tmp/iam-idp-002-review.5DBlPb` with `HEAD 04429f88`.
- `gh pr view 1251 --json headRefName,baseRefName,state,mergeStateStatus,statusCheckRollup` shows `headRefName=gemini2/iam-idp-002`, `baseRefName=dev`, `state=OPEN`, `mergeStateStatus=BLOCKED`.
- As of `2026-08-01`, `PR #1251` has failing checks including `Commit trailers`, `Smoke acceptance`, `lint`, `typecheck`, `e2e`, and `ci-integ`, so there is no merged-to-dev evidence yet.
- `python3 scripts/ai_status.py show IAM-IDP-002` now returns `integration_status=pr_open`, no `merged_ref` / `merge_commit`, and `next="History repair verified on 2026-08-01: fast-forward local codex2/iam-idp-002 onto origin/gemini2/iam-idp-002@04429f88, then continue CI repair on PR #1251..."`.

## Repair

No force-push, rebase of shared history, or branch rewrite is required.

The non-destructive repair path was:

1. Treat `gemini2/iam-idp-002@04429f88` and `PR #1251` as the canonical implementation/review rail.
2. Do not restart implementation from `codex2/iam-idp-002@717a8719`.
3. In the reassigned owner worktree, fast-forward the local owner branch onto the canonical tip without rewriting shared history:

   ```bash
   git fetch origin gemini2/iam-idp-002
   git merge --ff-only FETCH_HEAD
   ```

4. Keep unrelated dirty files out of any `IAM-IDP-002` staging set.
5. Repair the parent task's machine truth to branch/PR-level evidence, not merged-to-dev evidence, until `PR #1251` actually merges and remote `dev` contains the delivered commit.

The parent machine-truth repair was applied with:

```bash
AI_NAME=Codex INTEGRATION_STATUS=pr_open \
PR_URL=https://github.com/ajoe734/drts-fleet-platform/pull/1251 \
python3 scripts/ai_status.py note IAM-IDP-002 \
  "History repair verified on 2026-08-01: fast-forward local codex2/iam-idp-002 onto origin/gemini2/iam-idp-002@04429f88, then continue CI repair on PR #1251 from that branch instead of restarting from 717a8719. Remote dev remains 717a8719, so integration stays at branch/PR level until PR #1251 merges."
```

As of `2026-08-01`, the implementation branch itself is healthy; the remaining blocker is the reassigned owner branch/worktree not pointing at that implementation, plus stale integration bookkeeping on the parent task.

## Unblocked Next Step For `IAM-IDP-002`

1. Codex2 should continue from the existing implementation tip, not from the empty reassigned base branch: fast-forward local `codex2/iam-idp-002` to `origin/gemini2/iam-idp-002@04429f88` or inspect `PR #1251` directly.
2. Fix the failing checks on `PR #1251`; that is the real unblock target now.
3. After `PR #1251` merges and remote `dev` contains the delivered commit, update the parent task's integration evidence. Until then, the correct parent closeout level is branch/PR-level, not `merged_to_dev`.
