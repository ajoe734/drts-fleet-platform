# UV-EXEC-012 history repair

Observed 2026-09-08 UTC. Owner: Codex. Reviewer: Codex2.
This helper documents the repair; it does not replace or approve the parent implementation.

## Exact diagnosis

- Parent local and remote branch `codex/uv-exec-012` both point to
  `65186b22c066da9eeca1266d6af2f9ee77be95a1` (PR #1811).
  No worktree currently checks out that branch. The helper runs in the assigned
  `.artifacts/worktrees/auto/codex-uv-exec-012-unblock-history-repair` worktree,
  on its own branch, with an initially clean tree. Canonical root was not switched.
- Reflog records a rebase onto `ab15cc21e0e3807f14462017273c27f94971f7f5`,
  followed by merging the original remote ancestry back at
  `58e0f7518b986615f8a02047431b99a8b96cb222`. Its parents are
  `96eb27e69bc43e3a4f4ba1111d6ece5d4406916d` and
  `ffcdd3cba4803c0e738c9d0bfb5b36fc48e3e2b2`.
  Its tree equals its first parent's tree: history was duplicated, not file content.
- `git range-diff 6e60df0ab^..ffcdd3cba 4321c3c27^..96eb27e69`
  confirms six patch-equivalent pairs:

  | Original | Rebased |
  | --- | --- |
  | 6e60df0ab | 4321c3c27 |
  | 8e1898987 | 2cc602624 |
  | 059b5c309 | 526d216b5 |
  | 555c5743e | 522cc15da |
  | 84b55dc31 | fb631076e |
  | ffcdd3cba | 96eb27e69 |

- `468e7d71b7d39cb9f9d7e43621211563efa7c2fa` subsequently merged dev
  `6f6f418fdd6c7fa0811765710f66a5608e0b8ad0`. The final fixes are
  `08bf038e6`, `c9994951c`, and `65186b22c`.
  Replaying the combined histories risks re-adding
  `apps/voice-media-worker/src/dialogue/voice-dialogue-provider.ts` and
  `packages/contracts/src/voice-dialogue.ts`; the parent records an aborted
  rebase with add/add conflicts in those files. This helper did not rerun that
  destructive-to-local-history experiment.
- Fetched dev is `d4f54ef94e059a981bf2be1f7b944e815870e117`.
  `git rev-list --left-right --count origin/dev...origin/codex/uv-exec-012`
  returns `3 17`. The three dev-only commits are unrelated support documents.
  The parent PR diff contains 11 task-related files, 1,411 insertions; no
  unrelated implementation contamination was found in that diff.
- Parent machine truth still locks candidate/review/failed CI to `c9994951c`,
  while GitHub PR head is `65186b22c`. Old review and failure cannot establish
  the current candidate's lifecycle outcome.

## Non-destructive repair path

Use a fresh parent candidate branch from current dev and apply the final net
implementation patch once. This avoids force pushing, replaying duplicate
commits, and needing an exception to the rebase rule. The helper branch remains
support-only. These are parent-owner next steps, not commands already executed:

1. Fetch, verify the source still resolves to the recorded SHA, and retain the
   original branch/PR as evidence. Capture the binary-safe net patch:

   ```bash
   git fetch origin
   source_sha=65186b22c066da9eeca1266d6af2f9ee77be95a1
   source_base=$(git merge-base origin/dev "$source_sha")
   patch_file=$(mktemp /tmp/uv-exec-012-recovery.XXXXXX.patch)
   git diff --binary "$source_base" "$source_sha" > "$patch_file"
   ```

2. Have supervisor route the parent to isolated branch
   `codex/uv-exec-012-recovered` from `origin/dev`, reusing an existing worktree
   if that branch already exists. Stay out of canonical root. Verify the new
   worktree is clean, then `git apply --check "$patch_file"` followed by
   `git apply --index "$patch_file"`. If checks conflict against newer dev,
   reconcile only the 11 parent paths; never restore whole source trees over dev.
3. Inspect the staged diff and immediately anchor it with task ID `UV-EXEC-012`,
   `LLM-Agent: codex`, and `Reviewer: Codex2`; push normally. Run the parent
   unit tests and API typecheck, plus voice-worker/root typechecks and related
   UV-003/007/011 tests recorded by the parent. Create a final task-scoped commit
   for any fixes. Do not treat the original SHA's CI as recovery-branch evidence.
4. Open a replacement PR against dev, linking #1811. Record the new pushed head
   through the canonical `ai-status.sh handoff UV-EXEC-012 Codex2` with explicit
   `CANDIDATE_SHA` and `CANDIDATE_BRANCH`. Codex2 reviews that exact SHA; the
   GitHub bus supplies new CI/merge evidence. Keep #1811 intact until the
   replacement is recorded. Required parent acceptance keys still apply.

No reset, stash, force push, parent-code edits, or parent approval were performed.
Supervisor branch routing is the concrete next action; no human decision about
rewriting published history is needed for this path.

## Verification and delivery

- Read-only `git merge-tree --write-tree origin/dev origin/codex/uv-exec-012`
  exited 0, tree `812fb84d90c3fd706a15a7ba0e612d3b3a030682`.
  This independently shows the current tips merge cleanly; the obstacle is
  rebase/history policy and stale candidate evidence, not a current merge conflict.
- [Parent PR #1811](https://github.com/ajoe734/drts-fleet-platform/pull/1811)
  was OPEN/MERGEABLE at inspection. Current-head typecheck, unit, integration,
  lint and product smoke checks succeeded; build/UI-route and smoke aggregation
  were still running or queued. This is an observation, not acceptance.
- [Current-head integration CI](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34263962270)
  and [PR CI](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34263962162)
  identify the checked runs. Prior local 106-test results are parent-reported,
  not rerun by this documentation-only helper.
- Helper delivery uses `codex/uv-exec-012-unblock-history-repair`, a task-scoped
  commit, ordinary origin push, and PR against dev. Its exact SHA/PR evidence
  is recorded in the helper candidate handoff, avoiding a self-referential SHA.
