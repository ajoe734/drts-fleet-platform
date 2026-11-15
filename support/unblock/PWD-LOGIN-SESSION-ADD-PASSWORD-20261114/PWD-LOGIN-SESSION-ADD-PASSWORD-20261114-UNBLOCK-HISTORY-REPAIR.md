# PWD-LOGIN-SESSION-ADD-PASSWORD-20261114 — history-repair diagnosis

## Contamination identified

Parent task `PWD-LOGIN-SESSION-ADD-PASSWORD-20261114` is `blocked`, `waiting_for: Claude2`,
with `candidate_sha a33f3eda20cb99a7d597408328339438bd7a02b7` on branch
`claude/pwd-login-session-add-password-20261114` (PR #3298, base `dev`).

PR #3298 `gh pr checks 3298` shows **every** check green except one:

- `Commit trailers` — **fail** (job
  https://github.com/ajoe734/drts-fleet-platform/actions/runs/43637151478/job/132576337664)

The job log (`tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`) reports:

```
check_commit_trailers: 1 commit(s) failed trailer validation.
  commit a33f3eda20cb:
    - missing required trailer: Task-ID: <value>
    - missing required trailer: LLM-Agent: <value>
    - missing required trailer: Reviewer: <value>
```

`a33f3eda` (author `Gemini2 <gemini2@google.com>`, 2026-11-14T20:22:12Z, subject
`PWD-LOGIN-SESSION-ADD-PASSWORD-20261114: fix stale-session code for disabled
principal/membership`) was pushed directly to the published PR branch without the
`Task-ID:`/`LLM-Agent:`/`Reviewer:` trailers `tools/ci/git/check_commit_trailers.py`
requires per `docs/ops/branch-strategy.md` §5. The parent commit `fc9adb0a3` (the
original endpoint implementation) carries all three trailers correctly — only the
one-line stale-session fix on top of it is missing them.

This is not a trunk-advance race (`origin/dev` moved on since, now at `9f45e2bb9`,
but §11.4 synchronization is unrelated) and not a flagged content/security issue —
the commit's *content* is fine (confirmed by every other check passing); only its
message is non-compliant. Because PR #3298 already has a CI run against
`a33f3eda`, branch-strategy §11.4 and the standing worker rule forbid
amending/rebasing/force-pushing it now that it is published with an open
candidate.

## Precedent: identical defect, already repaired once on this phase

`PWD-LOGIN-010` hit the exact same `Commit trailers` failure on
`claude/pwd-login-010`'s tip `f78f7a5338b0` (subject had an ` R2` infix the
`SUBJECT_RE` pattern rejects). It was **not** amended. Per commit `2c0af801f`
(now on `origin/dev`, merged via PR #3295):

- The old branch `claude/pwd-login-010` / PR #3292 was left untouched (closed,
  `f78f7a5338b0` is **not** an ancestor of `dev`).
- A fresh branch `claude/pwd-login-010-clean` was cut from current `origin/dev`.
- The *same diff content* (verified byte-identical per file via
  `git show <old-sha>:<path>` piped to diff) was reapplied as a new commit with a
  compliant subject and all three required trailers.
- The new branch/PR (#3295) got its own fresh CI run and Claude2 review, then
  merged normally — no force-push anywhere.

## Prescribed non-destructive repair for this task (not yet applied)

This is the action for the **parent task's owner** (`Claude`, on
`PWD-LOGIN-SESSION-ADD-PASSWORD-20261114`), not for this read-only helper task:

1. Leave `claude/pwd-login-session-add-password-20261114` and PR #3298 exactly as
   published; do not amend/rebase/force-push `a33f3eda` or `fc9adb0a3`.
2. From current `origin/dev` (`9f45e2bb9`, includes `PWD-LOGIN-009`), cut a new
   branch, e.g. `claude/pwd-login-session-add-password-20261114-clean`.
3. Reapply `fc9adb0a3`'s diff first — it already carries compliant trailers, so it
   can be cherry-picked/reapplied verbatim as one commit. Then reapply `a33f3eda`'s
   diff (same stale-session fix content) as a second commit, this time with the
   required `Task-ID: PWD-LOGIN-SESSION-ADD-PASSWORD-20261114` /
   `LLM-Agent: claude` / `Reviewer: Claude2` trailers added. Verify both commits'
   file content is byte-identical to the originals via `git show <old-sha>:<path>`
   diffed against the new tree, same as the PWD-LOGIN-010 precedent.
4. Push the new branch (normal, non-force), open a new PR against `dev`,
   let CI run fresh (all checks, including `Commit trailers`, should now pass),
   and route to `Claude2` for a fresh review of the unchanged content.
5. Once merged, update the parent task's `candidate_sha`/`candidate_branch` to the
   new SHA/branch and close PR #3298 as superseded (same disposition as #3292 in
   the PWD-LOGIN-010 precedent).

`PWD-LOGIN-005`, `PWD-LOGIN-007`, `PWD-LOGIN-008` (this task's `depends_on`) are
all independently `done` with merged/CI-green evidence — they are not part of
the blocker and need no action.

## Write-scope note

This helper task's own mutations were scope-tested per
`project-unblock-history-repair-readonly-scope-denies-all-writes` (prior
recurrences on `REFERRAL-PRODUCT-QUOTE-CONSUMER-BINDING-20261015` and
`FINAL-EXISTING-AIRPORT-LUGGAGE-REPAIR-20261112`): `start` succeeded, but this
artifact commit/push and any `ai-status.sh` write to the *parent* task are
outside this helper's own write scope and are left for the Supervisor/parent
owner to action using the concrete steps above.
