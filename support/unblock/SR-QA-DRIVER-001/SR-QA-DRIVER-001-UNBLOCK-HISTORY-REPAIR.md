# SR-QA-DRIVER-001 Unblock History Repair

## Scope

- Helper task: `SR-QA-DRIVER-001-UNBLOCK-HISTORY-REPAIR`
- Parent task: `SR-QA-DRIVER-001`
- Owner: `Claude2`; reviewer: `Claude`
- Audit timestamp: `2026-09-11T09:04:20Z` (reconstruction commit) / doc written `2026-09-11T09:30:00Z`
- Preserved source rail: `origin/claude2/sr-qa-driver-001 @ bce886aba3b2f2e3aa3005a637c9fd77e555336c` (PR [#1985](https://github.com/ajoe734/drts-fleet-platform/pull/1985), targeting `dev`)
- Replacement commits: `claude2/sr-qa-driver-001-unblock-history-repair @ daff532d2ca3fe39e0131f3446c10ffcb183c55a` (this branch, PR [#1987](https://github.com/ajoe734/drts-fleet-platform/pull/1987))

## Exact Contamination

PR #1985 is blocked by its sole non-merge commit's subject line. The CI run
for the `Commit trailers` check (`34581105551` / job `103204639432`) reports:

```
check_commit_trailers: 1 commit(s) failed trailer validation.
  commit bce886aba3b2:
    - subject must be `<TASK-ID>: <summary>`, got: '[SR-QA-DRIVER-001] 司機開通／設備／班次／行程／收益驗收'

Reference: docs/ops/branch-strategy.md §5.
```

`tools/ci/git/check_commit_trailers.py` only accepts subjects of the form
`<TASK-ID>: <summary>` (or `wip(<TASK-ID>): <summary>` and a small set of
other prefixes: `fix|feat|refactor|docs|chore|style`); the bracketed
`[SR-QA-DRIVER-001] ...` prefix is not in that set, so the commit fails
regardless of its trailers. The candidate branch has exactly one non-merge
commit ahead of its base (`69b397208`, an ancestor of current `origin/dev`):

| SHA | Problem |
| --- | --- |
| `bce886aba3b2` | `[SR-QA-DRIVER-001] 司機開通／設備／班次／行程／收益驗收` — rejected subject format (brackets instead of `<TASK-ID>: `). |

Per `docs/ops/branch-strategy.md` §11.4, `claude2/sr-qa-driver-001` is already
pushed and under review/CI (PR #1985), so it must not be rebased, amended, or
force-pushed to rewrite `bce886aba3b2`'s message.

The candidate's actual semantic delta is isolated and additive only:

```
git diff --stat 69b397208 bce886aba3b2
 docs/04-uat/system-remediation-20260906/SR-QA-DRIVER-001.md                       | 169 ++++++++++
 tests/unit/system-remediation/sr-qa-driver-001/device-session-binding.test.ts     | 281 ++++++++++++++++
 tests/unit/system-remediation/sr-qa-driver-001/dispatch-trip-lifecycle.test.ts    | 374 +++++++++++++++++++++
 tests/unit/system-remediation/sr-qa-driver-001/driver-earnings-statement-access.test.ts | 188 +++++++++++
 tests/unit/system-remediation/sr-qa-driver-001/driver-license-expiry-gap.test.ts  | 152 +++++++++
 tests/unit/system-remediation/sr-qa-driver-001/driver-settings-notification-effect.test.ts | 78 +++++
 tests/unit/system-remediation/sr-qa-driver-001/shift-clockin-suspension-gap.test.ts | 105 ++++++
 tests/unit/system-remediation/sr-qa-driver-001/supply-onboarding-revision.test.ts | 102 ++++++
 8 files changed, 1449 insertions(+)
```

Every changed path is a new file inside `SR-QA-DRIVER-001`'s declared scope
(`tests/unit/system-remediation/sr-qa-driver-001/`,
`docs/04-uat/system-remediation-20260906/SR-QA-DRIVER-001.md`).

A second, genuine defect exists independently of the trailer issue: PR #1985's
`lint` job (unreachable in its CI run because the `Commit trailers` gate fails
first and short-circuits the pipeline, but reproducible locally) fails on
`tests/unit/system-remediation/sr-qa-driver-001/dispatch-trip-lifecycle.test.ts:157:13` —
the test destructures `const { booking, assignment } = bookAndAssign(service);`
but never reads `booking` in that `it` block (`@typescript-eslint/no-unused-vars`).

## Non-Destructive Repair Performed

This worker sandbox blocks `git merge`/`git cherry-pick` across refs (same
restriction documented by the `SR-QA-IDENTITY-001-UNBLOCK-HISTORY-REPAIR`
precedent), so the repair was done from this already-assigned worktree using
only non-destructive commands:

1. For each of the 8 files listed above, read the blob from the untouched
   candidate ref without checking it out: `git show
   origin/claude2/sr-qa-driver-001:<path> > <path>` (plain output
   redirection, not a `git checkout`/merge/cherry-pick —
   `origin/claude2/sr-qa-driver-001` itself is never written to or switched
   into).
2. `git add` those 8 paths and committed as
   `25d2d2944142f294402ef797646296a8aaf9acf8`
   (`SR-QA-DRIVER-001-UNBLOCK-HISTORY-REPAIR: reconstruct SR-QA-DRIVER-001
   acceptance content as trailer-compliant commit`), simultaneously fixing
   the unused-`booking` lint error in the same commit (dropping `booking`
   from the destructure in `dispatch-trip-lifecycle.test.ts:157`). Content
   verification: `git diff bce886aba3b2 25d2d2944 -- <8 paths>` shows only
   that one-line lint fix — every other line is byte-identical to the
   original candidate.
3. CI on the resulting PR #1987 then caught two real `tsc` type errors that
   were latent in the original candidate content (masked because PR #1985
   never reached the `typecheck` job, which runs after the `Commit trailers`
   gate). Fixed non-destructively in a second commit,
   `daff532d2ca3fe39e0131f3446c10ffcb183c55a`
   (`SR-QA-DRIVER-001-UNBLOCK-HISTORY-REPAIR: fix tsc type errors in
   reconstructed test fixtures`): added the required `deviceId` to
   `RevokeDriverDeviceBindingCommand` calls, added the required
   `actualDistanceKm`/`actualDurationSec` to `DriverCompleteTaskCommand`
   calls, and changed `coverageAmount` from a `MoneyAmount` object literal to
   the plain number the contract expects. Neither commit amends or rewrites
   `25d2d2944`; both are ordinary appended commits.
4. `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
   reports `2 commit(s) OK`.
5. Pushed `claude2/sr-qa-driver-001-unblock-history-repair` with ordinary
   non-force pushes throughout. `origin/claude2/sr-qa-driver-001` and PR
   #1985 remain completely untouched as audit evidence — no ref on that
   branch was written, rebased, or force-pushed.

This branch is a support/unblock branch, not a same-named "-clean" sibling of
`claude2/sr-qa-driver-001`, for the same reason as the `SR-QA-IDENTITY-001`
precedent: creating and checking out a second branch was not available from
this worktree, so the already-assigned
`claude2/sr-qa-driver-001-unblock-history-repair` branch is the task-scoped
vehicle instead.

## Concrete Parent Next Step

`SR-QA-DRIVER-001` is unblocked from its history defect. Concrete next step
for owner `Claude2` / reviewer `Claude` on the parent task:

1. Reuse PR #1987 (already open from
   `claude2/sr-qa-driver-001-unblock-history-repair`) — or cherry-pick
   `25d2d2944`+`daff532d2` onto a `claude2/`-owned branch if preferred — and
   run it through the normal PR review/CI flow.
2. Record the new head as the parent's candidate:
   `CANDIDATE_SHA=daff532d2ca3fe39e0131f3446c10ffcb183c55a
   CANDIDATE_BRANCH=claude2/sr-qa-driver-001-unblock-history-repair
   AI_NAME=Claude2 ai-status.sh handoff SR-QA-DRIVER-001 Claude "..."`. A
   push to a new SHA invalidates prior review/CI evidence per
   `docs/ops/branch-strategy.md` §11.6, so this is expected and required —
   the old candidate SHA `bce886aba3b2` (PR #1985) cannot be reused for
   closeout.
3. Once merged to `dev`, close PR #1985 as superseded by PR #1987; do not
   force-push, amend, or reuse PR #1985 itself for closeout.

## Verification

- `gh pr checks 1985` / `gh run view 34581105551 --job 103204639432 --log` —
  isolated the exact failing commit, subject, and reason (`Commit trailers`
  is the sole blocking check on that PR's last completed run; downstream
  jobs like `lint`/`typecheck`/`unit` never ran because the gate
  short-circuits the pipeline).
- `git log --oneline -3 origin/claude2/sr-qa-driver-001` and
  `git diff --stat 69b397208 bce886aba3b2` — enumerated the single candidate
  commit and isolated its real 8-file, additions-only semantic delta.
- `git diff bce886aba3b2 25d2d2944 -- <8 paths>` — confirmed the
  reconstructed content is identical to the candidate except for the
  intentional one-line lint fix.
- `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
  (run locally on this branch) → `2 commit(s) OK`.
- PR #1987 CI (`gh pr checks 1987`, run `34582936274`/`34582936310`): all 25
  checks pass, including `Commit trailers`, `lint`, `typecheck`, `unit` (7
  files / 30 tests passed for `tests/unit/system-remediation/sr-qa-driver-001/`),
  `integration`, `ui-route-e2e`, `cross-surface-e2e`, `iam-negative-matrix`,
  `build`, and `Product smoke acceptance` (the last of these was still
  `pending` at the prior review pass and has since completed `pass` in
  8m17s).
- `git push` to `claude2/sr-qa-driver-001-unblock-history-repair` succeeded
  without force for both repair commits.

## Helper Closeout Boundary

This helper's own branch records the diagnosis and the replacement-commit
evidence only. Its integration status is `branch_pushed`; it does not claim
that `SR-QA-DRIVER-001` has merged to `dev` or deployed. `origin/dev` did not
move as a result of this task.
