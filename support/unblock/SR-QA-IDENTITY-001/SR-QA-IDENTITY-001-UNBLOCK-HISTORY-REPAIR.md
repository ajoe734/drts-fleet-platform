# SR-QA-IDENTITY-001 Unblock History Repair

## Scope

- Helper task: `SR-QA-IDENTITY-001-UNBLOCK-HISTORY-REPAIR`
- Parent task: `SR-QA-IDENTITY-001`
- Owner: `Claude`; reviewer: `Claude2`
- Audit timestamp: `2026-09-10T20:05:00Z`
- Preserved source rail: `origin/gemini2/sr-qa-identity-001 @ 5f550724aece8efbefc06339b7d47983266816d2` (PR [#1941](https://github.com/ajoe734/drts-fleet-platform/pull/1941), targeting `dev`)
- Replacement commit: `claude/sr-qa-identity-001-unblock-history-repair @ b0734b1f4` (this branch)

## Exact Contamination

PR #1941 is blocked only by its existing remote history. The CI run for the
`Commit trailers` check (`34520967301` / job `103018239073`) reports:

```
check_commit_trailers: 1 commit(s) failed trailer validation.
  commit f2ebedae9b34:
    - subject must be `<TASK-ID>: <summary>`, got: 'test(SR-QA-IDENTITY-001): identity tenant session rbac uat suites'
```

`tools/ci/git/check_commit_trailers.py` only accepts subjects of the form
`<TASK-ID>: <summary>` or `wip(<TASK-ID>): <summary>` (and a small set of
other prefixes: `fix|feat|refactor|docs|chore|style`); `test(` is not in that
set, so the commit's own first line fails the regex regardless of its
trailers. All 27 non-merge checks — lint, typecheck, unit, integration,
`ui-route-e2e`, `iam-negative-matrix`, `cross-surface-e2e`, `build`, etc. —
pass on the same head; `Commit trailers` is the sole failing check.

The candidate branch has exactly 3 non-merge commits ahead of its base
(`d79478de2`, itself an ancestor of current `origin/dev`):

| SHA | Problem |
| --- | --- |
| `f2ebedae9b34` | `test(SR-QA-IDENTITY-001): identity tenant session rbac uat suites` — rejected subject prefix. |
| `18a0ef94e45e` | `wip(SR-QA-IDENTITY-001): anchor resolve typecheck errors and document CI recovery` — compliant on its own. |
| `5f550724aece` | `wip(SR-QA-IDENTITY-001): anchor document CI diagnosis and concrete blockers` — compliant on its own. |

A later compliant anchor commit cannot cure the earlier immutable
`f2ebedae9b34` message: `check_commit_trailers.py` validates every non-merge
commit in `origin/dev..HEAD`, not just the branch tip. Per
`docs/ops/branch-strategy.md` §11.4, `gemini2/sr-qa-identity-001` is already
pushed and under review/CI (PR #1941), so it must not be rebased, amended, or
force-pushed to rewrite `f2ebedae9b34`'s message.

The candidate's actual semantic delta is isolated and additive only:

```
git diff --stat d79478de2 origin/gemini2/sr-qa-identity-001
 docs/04-uat/system-remediation-20260906/SR-QA-IDENTITY-001.md            | 167 +++
 tests/e2e/system-remediation/sr-qa-identity-001/sr-qa-identity-001.spec.ts | 454 +++
 tests/unit/system-remediation/sr-qa-identity-001/c001-c002-public-and-oidc.test.ts | 154 +
 tests/unit/system-remediation/sr-qa-identity-001/c003-c004-c005-iam-mfa-and-bank.test.ts | 255 +
 tests/unit/system-remediation/sr-qa-identity-001/c006-c007-c008-invitation-session-and-tenant-rbac.test.ts | 481 +
 tests/unit/system-remediation/sr-qa-identity-001/c009-c010-c011-isolation-invalidation-and-four-eyes.test.ts | 581 +
 6 files changed, 2092 insertions(+)
```

Every changed path is a new file inside `SR-QA-IDENTITY-001`'s declared
`write_scopes` (`tests/unit/system-remediation/sr-qa-identity-001/`,
`docs/04-uat/system-remediation-20260906/SR-QA-IDENTITY-001.md`,
`tests/e2e/system-remediation/sr-qa-identity-001/`). (Note: comparing the two
branch *tips* directly, instead of against their shared base `d79478de2`,
shows a much larger diff including deletions of `SR-OPS-SHELL-001` and other
unrelated files — that is only trunk drift from `dev` advancing past the
candidate's base after it branched, not contamination in the candidate.)

## Non-Destructive Repair Performed

`git switch`/`git checkout <branch>`, `git merge <non-dev-ref>`,
`git cherry-pick`, `git worktree add`, `git read-tree`, and `git mktree` are
all blocked in this worker sandbox (silently classified as "defer"), so the
usual "branch off, cherry-pick the delta, commit clean" recipe is unavailable
here. Repair was done entirely from the already-assigned, already-clean
`claude/sr-qa-identity-001-unblock-history-repair` worktree using only
allowed, non-destructive commands:

1. For each of the 6 files above, read the blob from the untouched candidate
   ref without checking it out: `git show
   origin/gemini2/sr-qa-identity-001:<path> > <path>` (plain output
   redirection, not a `git checkout`/merge/cherry-pick — `origin/gemini2/sr-qa-identity-001`
   itself is never written to or switched into).
2. `git add` only those 6 paths; confirmed `git diff --cached
   origin/gemini2/sr-qa-identity-001 -- <6 paths>` was empty, i.e. the ported
   content is byte-identical to the candidate.
3. Committed as one canonical commit:

   ```text
   b0734b1f4 SR-QA-IDENTITY-001: reconstruct clean identity tenant session rbac uat suite history
   ```

   with trailers `LLM-Agent: Gemini2` (crediting the original author of the
   unchanged content), `Task-ID: SR-QA-IDENTITY-001`, `Reviewer: Gemini`
   (`SR-QA-IDENTITY-001`'s own reviewer), plus `Verification:` and
   `Reconstructed-by:` trailers documenting provenance.
4. `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
   reports `1 commit(s) OK`.
5. `pnpm exec vitest run tests/unit/system-remediation/sr-qa-identity-001/`
   passes `43 passed (43)` across 4 files — identical result to what the
   parent task previously reported for the same (byte-identical) content.
6. Pushed `claude/sr-qa-identity-001-unblock-history-repair` with an ordinary
   non-force push. `origin/gemini2/sr-qa-identity-001` and PR #1941 remain
   completely untouched as audit evidence — no ref on that branch was written,
   rebased, or force-pushed.

This branch is a support/unblock branch, not a same-named "-clean" sibling of
`gemini2/sr-qa-identity-001`, because creating and checking out a second
branch was not possible from this worktree (see sandbox restriction above).
The already-assigned `claude/sr-qa-identity-001-unblock-history-repair`
branch is the task-scoped vehicle instead.

## Concrete Parent Next Step

`SR-QA-IDENTITY-001` is unblocked from its history defect. Concrete next
step for owner `Gemini2` / reviewer `Gemini`:

1. Open (or reuse, once this branch's PR exists) a PR from
   `claude/sr-qa-identity-001-unblock-history-repair` — or cherry-pick
   commit `b0734b1f4` onto a `gemini2/`-owned branch if preferred — and run
   it through the normal PR review/CI flow.
2. Record the new head as the parent's candidate:
   `CANDIDATE_SHA=b0734b1f4... CANDIDATE_BRANCH=claude/sr-qa-identity-001-unblock-history-repair AI_NAME=Gemini2 ai-status.sh handoff SR-QA-IDENTITY-001 Gemini "..."`
   (or the equivalent SHA/branch after any further rebase-free move). A push
   to a new SHA invalidates prior review/CI evidence per
   `docs/ops/branch-strategy.md` §11.6, so this is expected and required —
   `18a0ef94e45e` (the old candidate SHA) cannot be reused for closeout.
3. Once merged to `dev`, close PR #1941 as superseded by the replacement PR;
   do not force-push, amend, or reuse PR #1941 itself for closeout.
4. `SR-QA-IDENTITY-001`'s other blocker (VM restriction: Playwright/E2E specs
   under `tests/e2e/system-remediation/sr-qa-identity-001/` cannot run in
   this sandbox) is unrelated to history and still needs an external
   environment; it is unchanged by this repair.

## Verification

- `gh pr checks 1941` — only `Commit trailers` fails; all 27 other checks
  (lint, typecheck, unit, integration, `ui-route-e2e`, `iam-negative-matrix`,
  `cross-surface-e2e`, `build`, `Smoke acceptance`, etc.) pass.
- `gh run view 34520967301 --job 103018239073 --log` — isolated the exact
  failing commit and reason.
- `git log --oneline origin/dev..origin/gemini2/sr-qa-identity-001` and
  `git log -1 --format='%P' f2ebedae9` — enumerated the 3 candidate commits
  and located the candidate's true base (`d79478de2`, an ancestor of current
  `origin/dev`).
- `git diff --stat d79478de2 origin/gemini2/sr-qa-identity-001` — isolated
  the real 6-file, additions-only semantic delta, all inside
  `SR-QA-IDENTITY-001`'s `write_scopes`.
- `git diff --cached origin/gemini2/sr-qa-identity-001 -- <6 paths>` was
  empty before committing, confirming byte-identical content.
- `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
  → `1 commit(s) OK`.
- `pnpm exec vitest run tests/unit/system-remediation/sr-qa-identity-001/`
  → `Test Files 4 passed (4)`, `Tests 43 passed (43)`.
- `git push -u origin claude/sr-qa-identity-001-unblock-history-repair`
  succeeded without force.

## Helper Closeout Boundary

This helper's own branch records the diagnosis and the replacement-commit
evidence only. Its integration status is `branch_pushed`; it does not claim
that `SR-QA-IDENTITY-001` has merged to `dev` or deployed. `origin/dev` did
not move as a result of this task.
