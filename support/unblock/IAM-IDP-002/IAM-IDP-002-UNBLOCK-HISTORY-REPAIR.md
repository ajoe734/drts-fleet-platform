# IAM-IDP-002 Unblock History Repair

Date: 2026-08-01
Task: `IAM-IDP-002-UNBLOCK-HISTORY-REPAIR`
Parent task: `IAM-IDP-002`
Parent branch: `gemini2/iam-idp-002`
Task branch: `codex/iam-idp-002-unblock-history-repair`

## Finding

No shared-history rewrite problem was found on the parent branch.

- `gemini2/iam-idp-002` is a linear branch from `origin/dev` at `717a8719`.
- Local parent head is `04429f88` (`fix(IAM-IDP-002): scope role binding evaluation to selected membership realm and add cross-realm regression tests`).
- `codex/iam-idp-002` is not the source of the owner branch. It was created from `origin/dev` and later fast-forwarded to the owner branch tip for review bookkeeping.
- The actual blocker at chair time was remote lag plus transport/auth failure: `origin/gemini2/iam-idp-002` was still at `039b0ff4`, while a previous worker reported non-interactive HTTPS auth failure when trying to push.

There is also real worktree contamination in the Gemini2 task worktree, but it is separate from branch history:

- unrelated tracked modification: `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json`
- many untracked `node_modules/` directories

Those files should not be staged into `IAM-IDP-002`.

## Evidence

- `git merge-base origin/dev gemini2/iam-idp-002` resolves to `717a8719`.
- `git reflog show --date=iso gemini2/iam-idp-002` shows the branch was created from `origin/dev` on 2026-08-01 20:58:50 +0000 and then advanced linearly through `bd0b555e` .. `04429f88`.
- `git reflog show --date=iso codex/iam-idp-002` shows the review branch was created from `origin/dev` on 2026-08-01 21:04:30 +0000 and later fast-forwarded to `gemini2/iam-idp-002` on 2026-08-01 23:12:16 +0000.
- `git push --dry-run origin gemini2/iam-idp-002:gemini2/iam-idp-002` reported a plain fast-forward from `039b0ff4` to `04429f88`.
- `git ls-remote --heads origin gemini2/iam-idp-002` now resolves to `04429f88f53322a4c080cd862d7233fa91541ae8`.

## Repair

No force-push, rebase, or shared-history surgery was required.

The non-destructive repair path was:

1. Verify that `origin/gemini2/iam-idp-002` is an ancestor of local `gemini2/iam-idp-002`.
2. Ignore unrelated dirty files in the Gemini2 worktree.
3. Push or verify the branch by refspec from a clean helper worktree instead of trying to finalize from the contaminated owner worktree.

As of 2026-08-01, the remote branch head matches the parent fix commit `04429f88`.

During this repair, machine truth for the parent task advanced again: at `2026-08-01T23:49:42Z`, `IAM-IDP-002` was already moved to `review_approved` with `PR #1251` open against `dev`. That confirms the history/push blocker is resolved.

## Unblocked Next Step For `IAM-IDP-002`

1. Treat `origin/gemini2/iam-idp-002@04429f88` as the canonical review tip for any further branch-level inspection.
2. In the Gemini2 worktree, do not stage the unrelated sidecar JSON or local `node_modules/`.
3. Follow the parent task's latest machine truth: as of `2026-08-01T23:49:42Z`, integration closeout is in progress with `PR #1251` open to `dev` and CI pending.
