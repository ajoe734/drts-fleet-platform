# IAM-IDP-002 Unblock History Repair

Date: 2026-08-02
Task: `IAM-IDP-002-UNBLOCK-HISTORY-REPAIR`
Parent task: `IAM-IDP-002`
Dispatch-time canonical implementation branch: `gemini2/iam-idp-002`
Current owner worktree branch: `codex2/iam-idp-002`
Current authoritative integration PR branch: `codex/iam-idp-002-integration-final-20260802`
Task branch: `codex/iam-idp-002-unblock-history-repair`

Evidence refresh note: GitHub currently reports `PR #1253` `updatedAt=2026-08-02T00:32:30Z` and head commit `93962edb3bf529dcaca9b66f3508bcd5a24fd855` with `CommitDate=2026-08-02 00:32:24 +0000`; this artifact is refreshed to that current remote evidence.

## Finding

No shared-history rewrite problem was found on the original implementation rail.

- At dispatch, `origin/dev` was `717a8719`, `origin/gemini2/iam-idp-002` was `04429f88`, and the reassigned owner worktree/branch `codex2/iam-idp-002` was still pinned to `717a8719` with no remote branch. That branch/worktree/commit misalignment was the exact contamination keeping the parent blocked.
- Parent machine truth was also wrong at dispatch: `IAM-IDP-002` claimed `integration_status=merged_to_dev` even though remote `dev` was still `717a8719`.
- During this unblock task, the owner lane published a replacement rail without rewriting shared history: `origin/codex2/iam-idp-002@2ead9a77` plus authoritative review `PR #1253` from `codex/iam-idp-002-integration-final-20260802@93962edb`.
- That replacement rail is not a fast-forward continuation of the old `gemini2` rail. `git merge-base 2ead9a77 04429f88` resolves to `717a8719`, and `git rev-list --left-right --count 2ead9a77...04429f88` reports `1 20`.
- The previously recorded `PR #1253` head `fa77230c` was not a second contamination source; it is the direct parent of the current head `93962edb`, and `git rev-list --left-right --count fa77230c...93962edb` reports `0 1`.
- The old `gemini2` / `PR #1251` rail is therefore historical but non-authoritative. The current repair target is machine truth: keep the parent at branch/PR level and point it at `PR #1253`, not `merged_to_dev`.
- Parent machine truth has stayed on the repaired path: `python3 scripts/ai_status.py show IAM-IDP-002` currently reports `status=review`, `integration_status=pr_open`, and `pr_url=https://github.com/ajoe734/drts-fleet-platform/pull/1253`.

There was also unrelated worktree contamination in the earlier Gemini2 task worktree, but it was separate from branch history:

- unrelated tracked modification: `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json`
- many untracked `node_modules/` directories

Those files should not be staged into `IAM-IDP-002`.

## Evidence

- `git ls-remote --heads origin dev gemini2/iam-idp-002 codex2/iam-idp-002` resolves to `dev@717a8719`, `gemini2/iam-idp-002@04429f88`, and `codex2/iam-idp-002@2ead9a77`.
- `gh pr view 1251 --json url,state,mergeStateStatus,headRefName,baseRefName,headRefOid` shows `PR #1251` still `OPEN` / `BLOCKED` on `gemini2/iam-idp-002@04429f88`.
- `gh pr view 1253 --json url,state,mergeStateStatus,headRefName,baseRefName,headRefOid,updatedAt` now shows `PR #1253` `OPEN` / `BLOCKED` on `codex/iam-idp-002-integration-final-20260802@93962edb3bf529dcaca9b66f3508bcd5a24fd855` with `updatedAt=2026-08-02T00:32:30Z`.
- `git show --no-patch --format=fuller 93962edb3bf529dcaca9b66f3508bcd5a24fd855` shows `CommitDate=2026-08-02 00:32:24 +0000`.
- `git merge-base --all fa77230ce4c0f7c1481d92678d3e3d181388412c 93962edb3bf529dcaca9b66f3508bcd5a24fd855` resolves to `fa77230ce4c0f7c1481d92678d3e3d181388412c`.
- `git rev-list --left-right --count fa77230ce4c0f7c1481d92678d3e3d181388412c...93962edb3bf529dcaca9b66f3508bcd5a24fd855` reports `0 1`.
- `git merge-base --all 2ead9a77c64c24aad19ed138780bfed1590d3f06 04429f88f53322a4c080cd862d7233fa91541ae8` resolves to `717a8719`.
- `git rev-list --left-right --count 2ead9a77c64c24aad19ed138780bfed1590d3f06...04429f88f53322a4c080cd862d7233fa91541ae8` reports `1 20`.
- `python3 scripts/ai_status.py show IAM-IDP-002` now returns `status=review`, `integration_status=pr_open`, and `pr_url=https://github.com/ajoe734/drts-fleet-platform/pull/1253`; the parent still stays off the false `integration_status=merged_to_dev` path while the owner continues on `PR #1253`.

## Repair

No force-push, rebase of shared history, or branch rewrite is required.

The non-destructive repair path was:

1. Record the dispatch-time contamination accurately: the reassigned owner lane was still sitting on `717a8719` while the active delivered work lived on `gemini2/iam-idp-002@04429f88`.
2. Add `ai_status.py` support so `note` and unblock-parent resolution can replace stale integration evidence and clear obsolete `merged_ref` / `merge_commit` fields.
3. Repair the parent task from false `merged_to_dev` evidence to branch/PR-level evidence with `python3 scripts/ai_status.py note ...`.
4. When the owner published a new replacement rail, refresh the parent PR evidence from stale `PR #1251` to authoritative `PR #1253` instead of rewriting either historical branch.
5. When `PR #1253` advances, refresh the artifact evidence to the actual remote head instead of leaving stale authoritative-rail evidence behind; this refresh captures the current head `93962edb`.
6. Leave both old rails intact as audit history. The repair is documentary and machine-truth alignment, not history surgery.

## Unblocked Next Step For `IAM-IDP-002`

1. Treat `PR #1253` on `codex/iam-idp-002-integration-final-20260802` as the current authoritative review rail, with current GitHub-reported head `93962edb3bf529dcaca9b66f3508bcd5a24fd855`.
2. Treat `PR #1251` as historical/non-authoritative evidence only; do not point parent machine truth back to it and do not claim `merged_to_dev` until a real merge happens.
3. After `PR #1253` merges and remote `dev` contains the delivered commit, update the parent task's integration evidence from `pr_open` to `merged_to_dev`.
