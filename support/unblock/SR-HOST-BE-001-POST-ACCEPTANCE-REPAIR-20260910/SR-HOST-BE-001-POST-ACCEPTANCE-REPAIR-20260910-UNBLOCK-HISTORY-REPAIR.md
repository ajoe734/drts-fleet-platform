# SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910 Unblock History Repair

## Scope

- Helper task: `SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910-UNBLOCK-HISTORY-REPAIR`
- Parent task: `SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910`
- Owner: `Claude`; reviewer: `Claude2`
- Audit timestamp: `2026-09-10T20:30:00Z`
- Preserved source rail: `origin/gemini/sr-host-be-001-post-acceptance-repair-20260910 @ 0e4585f7218e7202193b01b203e69f699d76e574` (PR [#1933](https://github.com/ajoe734/drts-fleet-platform/pull/1933), targeting `dev`)
- Replacement commit: this branch's `SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910: ...` commit on `claude/sr-host-be-001-post-acceptance-repair-20260910-unblock-history-repair`

## Exact Contamination

`gh pr checks 1933` shows only the `Commit trailers` check failing
(run `34514129541`, job `102995223162`); all 25 other checks — `build`,
`unit`, `typecheck`, `lint`, `integration`, `iam-negative-matrix`,
`cross-surface-e2e`, `ui-route-e2e`, `e2e`, `ci-integ`, `candidate`, etc. —
pass on the same head. Reproducing locally:

```
$ python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head origin/gemini/sr-host-be-001-post-acceptance-repair-20260910
::error::check_commit_trailers: 1 commit(s) failed trailer validation.
  commit 0e4585f7218e:
    - subject must be `<TASK-ID>: <summary>`, got: 'docs(04-uat): repair missing path citations in host-acceptance-runner.md'
```

`tools/ci/git/check_commit_trailers.py`'s `SUBJECT_RE` only accepts a
`<TASK-ID>: <summary>` subject or a `(?:wip|fix|feat|refactor|docs|chore|style)(<TASK-ID>): <summary>`
subject, where `<TASK-ID>` must start with an uppercase letter and contain
only `[A-Z0-9-]`. The offending commit's scope token `04-uat` starts with a
digit and is lowercase, so it can never satisfy that pattern regardless of
its trailers (which are otherwise present and correct: `Task-ID:
SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910`, `LLM-Agent: gemini`,
`Reviewer: Gemini2`).

The candidate branch has exactly 3 non-merge commits ahead of its base
(`59fa0af20e92`, itself an ancestor of current `origin/dev`):

| SHA | Problem |
| --- | --- |
| `c7a146ee1` | `fix(SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910): repair host wildcard routes and tenant approval rule evaluator bootstrap` — compliant on its own. |
| `ee69f0c14` | `fix(SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910): fix typescript type errors in suite 13 evaluator tests` — compliant on its own. |
| `0e4585f72` | `docs(04-uat): repair missing path citations in host-acceptance-runner.md` — rejected subject scope. |

A later compliant commit cannot cure the earlier immutable `0e4585f72`
message: `check_commit_trailers.py` validates every non-merge commit in
`origin/dev..HEAD`, not just the branch tip. Per
`docs/ops/branch-strategy.md` §11.4, `gemini/sr-host-be-001-post-acceptance-repair-20260910`
is already pushed and under review/CI (PR #1933), so it must not be
rebased, amended, or force-pushed to rewrite `0e4585f72`'s message.

The candidate's actual semantic delta, isolated against current `origin/dev`
(not against the candidate's own outdated base — comparing tip-to-tip against
current `origin/dev` instead shows a much larger diff dominated by unrelated
trunk drift: dev has since absorbed `SR-ACADEMY-BE-001`, `SR-BANK-002`,
`SR-BOOKING-VERIFY`, `SR-FLEET-CASE-001`, `SR-OPS-CONTRACT-001`,
`SR-OPS-SHELL-001`, `SR-QA-CALL-001`, `SR-QA-IDENTITY-001`, and other tasks
that this candidate's base predates — is exactly 4 files, all inside
`SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910`'s declared scope:

```
$ git diff --stat origin/dev c7a146ee1 -- apps/api/src/modules/host-view/host-view.controller.ts apps/api/src/modules/tenant-partner/tenant-approval-rule-evaluator.ts
 apps/api/src/modules/host-view/host-view.controller.ts        |  8 ++++----
 apps/api/src/modules/tenant-partner/tenant-approval-rule-evaluator.ts | 35 ++++++++++++++++++++++++++++-------

$ git diff --stat origin/dev 0e4585f72 -- docs/04-uat/system-remediation-20260906/host-acceptance-runner.md tests/unit/system-remediation/sr-host-be-001/sr-host-be-001.test.ts
 docs/04-uat/system-remediation-20260906/host-acceptance-runner.md         | 386 ++++++++++++++++++++
 tests/unit/system-remediation/sr-host-be-001/sr-host-be-001.test.ts       | 130 ++++++
```

`host-view.controller.ts` and `tenant-approval-rule-evaluator.ts` are
untouched by any other task on `dev` since the candidate's base, and
`host-acceptance-runner.md` / `sr-host-be-001.test.ts` do not exist yet on
`dev` at all — so each of the 4 files applies to current `dev` with zero
conflict.

## Non-Destructive Repair Performed

`git cherry-pick` and `git checkout <ref>` (switching branches) are blocked
in this worker sandbox (classified as "defer" and left unresolved on retry
for compound commands), so the usual "branch off, cherry-pick the delta,
commit clean" recipe was unreliable here. `git checkout <sha> -- <path>`
(restoring specific paths from a specific commit into the current worktree,
without switching branches) did succeed. Repair was done entirely from the
already-assigned, already-clean
`claude/sr-host-be-001-post-acceptance-repair-20260910-unblock-history-repair`
worktree (based on current `origin/dev`) using only that allowed,
non-destructive command:

1. `git checkout 0e4585f7218e -- apps/api/src/modules/host-view/host-view.controller.ts apps/api/src/modules/tenant-partner/tenant-approval-rule-evaluator.ts docs/04-uat/system-remediation-20260906/host-acceptance-runner.md tests/unit/system-remediation/sr-host-be-001/sr-host-be-001.test.ts` —
   pulls the final (post all 3 candidate commits) content of exactly those 4
   files into the worktree and the index. `origin/gemini/sr-host-be-001-post-acceptance-repair-20260910`
   itself is never written to, switched into, merged, or force-pushed.
2. Confirmed `git diff --cached 0e4585f7218e -- <4 paths>` is empty, i.e. the
   ported content is byte-identical to the candidate tip.
3. Committed as one canonical commit (see `git log -1` on this branch) with
   trailers `LLM-Agent: Claude` for the reconstruction, `Task-ID:
   SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910`, `Reviewer: Gemini2`
   (the parent task's own reviewer), plus a `Reconstructed-by:` trailer
   documenting this helper task's provenance and crediting `LLM-Agent: gemini`
   as the original author of the unchanged content in the commit body.
4. `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
   reports `1 commit(s) OK`.
5. `pnpm exec vitest run tests/unit/system-remediation/sr-host-be-001/sr-host-be-001.test.ts`
   passes `36 passed (36)` — the parent task's own acceptance regression
   suite, unchanged content, same result the parent's CI run already proved.
6. Pushed `claude/sr-host-be-001-post-acceptance-repair-20260910-unblock-history-repair`
   with an ordinary non-force push. `origin/gemini/sr-host-be-001-post-acceptance-repair-20260910`
   and PR #1933 remain completely untouched as audit evidence — no ref on
   that branch was written, rebased, or force-pushed.

This branch is a support/unblock branch, not a same-named "-clean" sibling
of `gemini/sr-host-be-001-post-acceptance-repair-20260910`, because creating
and switching into a second branch from this worktree was unreliable (see
sandbox restriction above). The already-assigned
`claude/sr-host-be-001-post-acceptance-repair-20260910-unblock-history-repair`
branch is the task-scoped vehicle instead.

## Concrete Parent Next Step

`SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910` is unblocked from its
history defect. Concrete next step for owner `Gemini` / reviewer `Gemini2`:

1. Open a PR from
   `claude/sr-host-be-001-post-acceptance-repair-20260910-unblock-history-repair`
   (or cherry-pick this branch's reconstruction commit onto a
   `gemini/`-owned branch if preferred) and run it through the normal PR
   review/CI flow.
2. Record the new head as the parent's candidate, e.g.:
   `CANDIDATE_SHA=<new sha> CANDIDATE_BRANCH=claude/sr-host-be-001-post-acceptance-repair-20260910-unblock-history-repair AI_NAME=Gemini ai-status.sh handoff SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910 Gemini2 "..."`
   A push to a new SHA invalidates prior review/CI evidence per
   `docs/ops/branch-strategy.md` §11.6, so this is expected and required —
   the old candidate SHA `0e4585f7218e` cannot be reused for closeout.
3. Once merged to `dev`, close PR #1933 as superseded by the replacement
   PR; do not force-push, amend, or reuse PR #1933 itself for closeout.
4. Per the parent's own `required_acceptance`
   (`host_postrepair_remote_bootstrap_evidence`), the existing GitHub-hosted
   Host acceptance runner still needs to be rerun after this merge (this VM
   may not start product HTTP/DB/browser/Compose servers). That requirement
   is unrelated to history and is unchanged by this repair.

## Verification

- `gh pr checks 1933` — only `Commit trailers` fails; all 25 other checks
  pass.
- `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head origin/gemini/sr-host-be-001-post-acceptance-repair-20260910` —
  reproduced the exact failure locally.
- `git log --oneline origin/dev..origin/gemini/sr-host-be-001-post-acceptance-repair-20260910` —
  enumerated the 3 candidate commits.
- `git diff --stat origin/dev c7a146ee1 -- <2 source paths>` and
  `git diff --stat origin/dev 0e4585f72 -- <2 doc/test paths>` — isolated
  the real 4-file semantic delta, all inside the task's own artifact scope.
- `git diff --cached 0e4585f7218e -- <4 paths>` was empty after `git
  checkout 0e4585f7218e -- <4 paths>`, confirming byte-identical content.
- `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
  → `1 commit(s) OK`.
- `pnpm exec vitest run tests/unit/system-remediation/sr-host-be-001/sr-host-be-001.test.ts`
  → `Test Files 1 passed (1)`, `Tests 36 passed (36)`.
- `cd apps/api && pnpm exec tsc -p tsconfig.json --noEmit` — the two ported
  source files (`host-view.controller.ts`,
  `tenant-approval-rule-evaluator.ts`) produce zero errors of their own; the
  remaining errors in that raw invocation are pre-existing `@drts/contracts`
  stale-build-order errors unrelated to this scope (they disappear under the
  monorepo's normal `turbo run typecheck` pipeline, which already passed as
  the `typecheck` check on PR #1933).
- `git push -u origin claude/sr-host-be-001-post-acceptance-repair-20260910-unblock-history-repair`
  succeeded without force.

## Helper Closeout Boundary

This helper's own branch records the diagnosis and the replacement-commit
evidence only. Its integration status is `branch_pushed`; it does not claim
that `SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910` has merged to `dev` or
deployed. `origin/dev` did not move as a result of this task.
