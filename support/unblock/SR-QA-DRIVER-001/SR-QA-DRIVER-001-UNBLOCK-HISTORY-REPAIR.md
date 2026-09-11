# SR-QA-DRIVER-001 Unblock History Repair

## Scope

- Helper task: `SR-QA-DRIVER-001-UNBLOCK-HISTORY-REPAIR`
- Parent task: `SR-QA-DRIVER-001`
- Owner: `Claude`; reviewer: `Claude2`
- Audit timestamp: `2026-09-11T09:27:00Z`
- Preserved source rail: `origin/claude2/sr-qa-driver-001 @ bce886aba3b2f2e3aa3005a637c9fd77e555336c` (PR [#1985](https://github.com/ajoe734/drts-fleet-platform/pull/1985), targeting `dev`)
- Replacement commit: `claude/sr-qa-driver-001-unblock-history-repair @ 12e198064` (this branch)

## Exact Contamination

PR #1985 (candidate `bce886aba3b2`, already `candidate_approved` by Claude for
`SR-QA-DRIVER-001`) is blocked by two independent, unrelated defects on the
same commit:

1. **Commit trailers gate.** `tools/ci/git/check_commit_trailers.py` only
   accepts subjects of the form `<TASK-ID>: <summary>`, or
   `wip|fix|feat|refactor|docs|chore|style(<TASK-ID>): <summary>`. The
   candidate's subject is:

   ```
   [SR-QA-DRIVER-001] 司機開通／設備／班次／行程／收益驗收
   ```

   which uses a bracket prefix with no colon after the task id — it never
   matches `SUBJECT_RE`, regardless of the fact that the commit body already
   carries all three required trailers (`Task-ID`, `LLM-Agent`, `Reviewer`).
   CI run `34581105551` / job `103204639432` (`Commit trailers`, on the `CI`
   workflow) fails for exactly this reason.

2. **Real lint defect, unrelated to trailers.** The same PR's `Smoke
   acceptance` / `Product smoke acceptance` checks (runs `34581101438` and
   `34581105551`) fail because
   `tests/unit/system-remediation/sr-qa-driver-001/dispatch-trip-lifecycle.test.ts:157:13`
   destructures `booking` from `bookAndAssign(service)` in the test `"rejects
   a task with a reason code and records the rejection in the dispatch
   trace"`, but that test body only ever reads `assignment.taskId` —
   `booking` is genuinely dead in that scope, so
   `@typescript-eslint/no-unused-vars` correctly rejects it. (The sibling
   test one block above, `"rejects a task with no reason code..."`, does use
   `booking.orderId` and is unaffected.)

Per `docs/ops/branch-strategy.md` §11.4, `claude2/sr-qa-driver-001` is
already pushed and under review/CI (PR #1985, candidate-approved), so it must
not be rebased, amended, or force-pushed to rewrite `bce886aba3b2`'s subject
or content.

The candidate's actual semantic delta against its true base is isolated and
additive only:

```
git diff --stat 69b397208871052b952e918e4dbc586fbee48de3 origin/claude2/sr-qa-driver-001
 docs/04-uat/system-remediation-20260906/SR-QA-DRIVER-001.md               | 169 +++
 tests/unit/system-remediation/sr-qa-driver-001/device-session-binding.test.ts | 281 +++
 tests/unit/system-remediation/sr-qa-driver-001/dispatch-trip-lifecycle.test.ts | 374 +++
 tests/unit/system-remediation/sr-qa-driver-001/driver-earnings-statement-access.test.ts | 188 +++
 tests/unit/system-remediation/sr-qa-driver-001/driver-license-expiry-gap.test.ts | 152 +++
 tests/unit/system-remediation/sr-qa-driver-001/driver-settings-notification-effect.test.ts | 78 +++
 tests/unit/system-remediation/sr-qa-driver-001/shift-clockin-suspension-gap.test.ts | 105 +++
 tests/unit/system-remediation/sr-qa-driver-001/supply-onboarding-revision.test.ts | 102 +++
 8 files changed, 1449 insertions(+)
```

`69b397208` is an ancestor of current `origin/dev`. Every changed path is a
new file inside `SR-QA-DRIVER-001`'s declared `write_scopes`
(`tests/unit/system-remediation/sr-qa-driver-001/`,
`docs/04-uat/system-remediation-20260906/SR-QA-DRIVER-001.md`).

## Non-Destructive Repair Performed

`git switch`/`git checkout <branch>`, `git merge <non-dev-ref>`, `git
cherry-pick`, and `git worktree add` are blocked in this worker sandbox
(silently classified as "defer"), so the usual "branch off, cherry-pick the
delta, commit clean" recipe is unavailable here. Repair was done entirely
from the already-assigned, already-clean
`claude/sr-qa-driver-001-unblock-history-repair` worktree using only
allowed, non-destructive commands:

1. For each of the 8 files above, read the blob from the untouched candidate
   ref without checking it out: `git show
   origin/claude2/sr-qa-driver-001:<path> > <path>` (plain output
   redirection, not a `git checkout`/merge/cherry-pick — `origin/claude2/sr-qa-driver-001`
   itself is never written to or switched into).
2. Fixed the one real lint defect in the ported working copy: removed the
   unused `booking` binding at `dispatch-trip-lifecycle.test.ts:157`
   (`const { booking, assignment } = bookAndAssign(service);` →
   `const { assignment } = bookAndAssign(service);`), the smallest edit that
   resolves `@typescript-eslint/no-unused-vars` without touching test
   semantics or coverage.
3. `git add` all 8 paths; confirmed `git diff --cached
   origin/claude2/sr-qa-driver-001 -- <8 paths>` showed only that one-line
   fix, i.e. everything else is byte-identical to the candidate.
4. `pnpm exec eslint tests/unit/system-remediation/sr-qa-driver-001/dispatch-trip-lifecycle.test.ts`
   → clean (no output).
5. `pnpm exec vitest run tests/unit/system-remediation/sr-qa-driver-001/` →
   `Test Files 7 passed (7)`, `Tests 30 passed (30)`.
6. Committed as one canonical commit:

   ```text
   12e198064 SR-QA-DRIVER-001: reconstruct clean driver onboarding/device/shift/trip/earnings acceptance history
   ```

   with trailers `LLM-Agent: claude2` (crediting the original author of the
   ported content), `Task-ID: SR-QA-DRIVER-001`, `Reviewer: Claude`
   (`SR-QA-DRIVER-001`'s own reviewer), plus `Verification:` and
   `Reconstructed-by:` trailers documenting provenance.
7. `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
   reports `1 commit(s) OK`.
8. Pushing `claude/sr-qa-driver-001-unblock-history-repair` with an ordinary
   non-force push (see Verification below for status at time of writing).
   `origin/claude2/sr-qa-driver-001` and PR #1985 remain completely
   untouched as audit evidence — no ref on that branch was written, rebased,
   or force-pushed.

This branch is a support/unblock branch, not a same-named "-clean" sibling
of `claude2/sr-qa-driver-001`, because creating and checking out a second
branch was not possible from this worktree (see sandbox restriction above).
The already-assigned `claude/sr-qa-driver-001-unblock-history-repair` branch
is the task-scoped vehicle instead — the same pattern used by the
`SR-QA-IDENTITY-001-UNBLOCK-HISTORY-REPAIR` precedent (commits
`ddd3b22b7`/`17af71e7a`, PR #1947).

## Concrete Parent Next Step

`SR-QA-DRIVER-001` is unblocked from its history and lint defects. Concrete
next step for owner `Claude2` / reviewer `Claude`:

1. Open (or reuse, once this branch's PR exists) a PR from
   `claude/sr-qa-driver-001-unblock-history-repair` — or cherry-pick commit
   `12e198064` onto a `claude2/`-owned branch if preferred — and run it
   through the normal PR review/CI flow.
2. Record the new head as the parent's candidate:
   `CANDIDATE_SHA=12e198064... CANDIDATE_BRANCH=claude/sr-qa-driver-001-unblock-history-repair AI_NAME=Claude2 ai-status.sh handoff SR-QA-DRIVER-001 Claude "..."`
   (or the equivalent SHA/branch after any further rebase-free move). A push
   to a new SHA invalidates prior review/CI evidence per
   `docs/ops/branch-strategy.md` §11.6, so this is expected and required —
   `bce886aba3b2` (the old candidate SHA) cannot be reused for closeout even
   though its content was already `candidate_approved`.
3. Once merged to `dev`, close PR #1985 as superseded by the replacement PR;
   do not force-push, amend, or reuse PR #1985 itself for closeout.
4. `SR-QA-DRIVER-001`'s other declared scope
   (`tests/e2e/system-remediation/sr-qa-driver-001/`) and any live/native
   verification are unrelated to this history/lint repair and remain
   whatever they were before — this task did not touch them.

## Verification

- `gh pr view 1985 --json commits,statusCheckRollup` — isolated the single
  non-merge commit `bce886aba3b2` and confirmed `Commit trailers` (run
  `34581105551` job `103204639432`) is `FAILURE` while `Smoke acceptance` /
  `Product smoke acceptance` also fail for the unrelated lint reason.
- `sed -n '1,120p' tools/ci/git/check_commit_trailers.py` — confirmed the
  exact subject regex and required trailer set.
- `git show bce886aba3b2:tests/unit/system-remediation/sr-qa-driver-001/dispatch-trip-lifecycle.test.ts`
  — read lines 130-175, confirmed line 157's `booking` binding is dead in
  that test body.
- `git log --oneline origin/dev..origin/claude2/sr-qa-driver-001` and `git
  merge-base origin/claude2/sr-qa-driver-001 origin/dev` — enumerated the
  single candidate commit and located its true base (`69b397208`, an
  ancestor of current `origin/dev`).
- `git diff --stat 69b397208 origin/claude2/sr-qa-driver-001` — isolated the
  real 8-file, additions-only semantic delta, all inside
  `SR-QA-DRIVER-001`'s `write_scopes`.
- `git diff --cached origin/claude2/sr-qa-driver-001 -- <8 paths>` showed
  only the one-line `booking` fix before committing, confirming the rest is
  byte-identical content.
- `pnpm exec eslint tests/unit/system-remediation/sr-qa-driver-001/dispatch-trip-lifecycle.test.ts`
  → clean.
- `pnpm exec vitest run tests/unit/system-remediation/sr-qa-driver-001/` →
  `Test Files 7 passed (7)`, `Tests 30 passed (30)`.
- `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
  → `1 commit(s) OK`.
- `git push` of `claude/sr-qa-driver-001-unblock-history-repair` — ordinary
  non-force push (see push output captured alongside this task's handoff).

## Helper Closeout Boundary

This helper's own branch records the diagnosis and the replacement-commit
evidence only. Its integration status is `branch_pushed`; it does not claim
that `SR-QA-DRIVER-001` has merged to `dev` or deployed. `origin/dev` did
not move as a result of this task. `origin/claude2/sr-qa-driver-001` and PR
#1985 are left completely untouched as audit evidence.
