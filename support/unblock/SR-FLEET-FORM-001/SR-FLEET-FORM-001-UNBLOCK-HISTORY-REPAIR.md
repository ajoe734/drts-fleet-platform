# SR-FLEET-FORM-001 history repair path

Audit date: 2026-09-08. Helper owner: Codex; reviewer: Codex2.
This helper delivers the accepted documented non-destructive repair path.
It does not replace the parent's implementation review or execute its recovery.

## Exact blocker

After `git fetch origin` (exit 0):

| Ref | SHA |
| --- | --- |
| `origin/dev`, helper initial HEAD | `8e97268c7ec38258b393b8e8931d960009aab9fb` |
| Local `codex/sr-fleet-form-001` | `3cc88024f755e6a104a18b72bbd604c087c6c4e1` |
| `origin/codex/sr-fleet-form-001` | `c9f16307f8b0ef9880ed638e41f5100d9628f0db` |
| Parent rebase target | `b5c3774e5e62fab7cf43b67a7e69fae7e0ca91ef` |

The parent status records a rejected ordinary push after rebase. Its reflog
confirms that the published head `c9f16307f` was rebased onto `b5c3774e5`,
producing `ffdacea82`, followed by evidence commit `3cc88024f`.
`git rev-list --left-right --count codex/sr-fleet-form-001...origin/codex/sr-fleet-form-001`
returns `6 4`: local includes one newer upstream commit and five task commits,
while remote retains the four original task commits. The remote head is not
an ancestor of local HEAD (`git merge-base --is-ancestor`, exit 1).

`git range-diff 70355aba9..origin/codex/sr-fleet-form-001 b5c3774e5..codex/sr-fleet-form-001`
returns the following exact mapping (`=` means unchanged patch/message):

| Published | Rebased | Result |
| --- | --- | --- |
| `a9afdcd94` | `1c61c8d25` | `=` accessible fields |
| `17b90d390` | `0bf77a397` | `=` draft protection |
| `4e78bb858` | `49f85ec80` | `=` evidence correction |
| `c9f16307f` | `ffdacea82` | `=` shell navigation guard |
| none | `3cc88024f` | added current-base evidence |

This is published-history divergence, not an observed foreign-file patch.
At the initial audit, the parent diff against dev contained exactly four
parent-scoped files. The evidence and test files exist on the retained parent
commit, not on this helper branch; their links below pin that historical tree:

- `apps/fleet-partner-portal-web/components/fleet-supply-workspace.tsx`
- `apps/fleet-partner-portal-web/lib/fleet-portal-supply.ts`
- [Parent UAT evidence](https://github.com/ajoe734/drts-fleet-platform/blob/3cc88024f755e6a104a18b72bbd604c087c6c4e1/docs/04-uat/system-remediation-20260906/SR-FLEET-FORM-001.md)
- [Parent regression tests](https://github.com/ajoe734/drts-fleet-platform/blob/3cc88024f755e6a104a18b72bbd604c087c6c4e1/tests/unit/system-remediation/sr-fleet-form-001/sr-fleet-form-001.test.ts)

`git worktree list --porcelain` finds no checkout of the parent branch.
The assigned helper worktree is initially clean on
`codex/sr-fleet-form-001-unblock-history-repair`. The canonical root stays on
`dev` at `650e233bb1c35269852c291ef892d25967380c12`; it was not switched.
Other historical refs (`codex2/sr-fleet-form-001` at `5399853da`, remote
`gemini/sr-fleet-form-001` at `37e898923`) are not recovery inputs.

[Parent PR #1723](https://github.com/ajoe734/drts-fleet-platform/pull/1723)
is OPEN against dev with head `c9f16307f`. Its checks include a failed Smoke
acceptance check and successful ci-integ; no green replacement CI is claimed.

## Non-destructive recovery procedure

Supervisor should route the parent owner to a fresh replacement branch/worktree,
then resume the parent using the current CLI's
`resume-blocked SR-FLEET-FORM-001 in_progress "Recover on replacement branch"`.
Routing must override the old expected branch in the next dispatch, otherwise
the worker will be sent back to the diverged branch.

Proposed replacement: `codex/sr-fleet-form-001-recovered-20260908`. At audit time,
local `git show-ref --verify` finds no ref and `git ls-remote --heads origin`
for this exact branch returns no output (exit 0). Recheck both before creation;
if occupied, inspect/reuse a matching recovery or select an unused suffix.

The parent owner then performs these steps (not executed by this helper):

1. Preserve the existing local/remote refs and PR #1723. From the supervisor's
   designated root, create the replacement without switching the canonical root:

   ```bash
   git fetch origin
   git worktree add -b codex/sr-fleet-form-001-recovered-20260908 \
     /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-sr-fleet-form-001-recovered-20260908 \
     3cc88024f755e6a104a18b72bbd604c087c6c4e1
   cd /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-sr-fleet-form-001-recovered-20260908
   git rebase origin/dev
   ```

   Rebase rewrites only this unpublished replacement. Resolve any conflicts
   within parent write scopes; request scope adjustment for extra shared files.
2. Record the fresh base and rerun `git diff --check`,
   `pnpm --filter @drts/fleet-partner-portal-web typecheck`,
   `pnpm exec vitest run tests/unit/system-remediation/sr-fleet-form-001/`, and
   `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`.
   Update parent UAT evidence with actual commands/results and commit with
   Task-ID SR-FLEET-FORM-001, LLM-Agent Codex, Reviewer Codex2. Prior 30-test
   success is historical and must not stand in for replacement validation.
3. Normal push with `git push -u origin codex/sr-fleet-form-001-recovered-20260908`.
   Create a dev-targeted replacement PR linking #1723 and explaining why shared
   history is retained. Do not force-push, reset old refs, or reuse old review/CI.
4. Lock the new candidate from that worktree:

   ```bash
   CANDIDATE_SHA=$(git rev-parse HEAD) \
   CANDIDATE_BRANCH=$(git branch --show-current) \
   PR_URL=<replacement-pr-url> AI_NAME=Codex \
     /home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh \
     handoff SR-FLEET-FORM-001 Codex2 "Recovered branch; fresh validation and PR evidence recorded"
   ```

   Replace the PR URL placeholder before execution. Same-SHA review, CI, merge
   and required acceptance must complete through the candidate lifecycle.

Current-release `bin/ai_status.py::command_handoff` accepts explicit
`CANDIDATE_BRANCH`; `github_bus.py::review_branch_for_task` prioritizes it.
No control-plane code change or force-push permission is needed.

## Helper validation and delivery

Fetch, refs/worktrees/reflog, range-diff, scope diff and GitHub PR inspection
completed successfully. `git merge-tree --write-tree origin/dev codex/sr-fleet-form-001`
returned exit 0 with tree `a68e342c5050b359f5127383293d91ed59b2efc1` and no
conflicts. This read-only feasibility check creates no branch/commit and does
not claim that a rebase, product test, browser or live API check passed.

Only this helper artifact changes. Its task-scoped commit, normal push and PR
are recorded in helper handoff/PR metadata, avoiding a self-referential SHA here.
The parent receives a canonical status note directing supervisor routing/resume
and owner recovery from `3cc88024f`. It remains blocked pending that execution;
this documented path does not claim the fleet feature or its CI is complete.

## Follow-up: helper CI repair

PR #1752 candidate `6b99283b63d6874d34c139b7b7da399a5bf6ab50`
failed Canonical consistency. Local reproduction with
`python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD`
identified exactly two missing-path citations: the parent evidence and test
files above. Both were verified with `git cat-file -e` against retained parent
commit `3cc88024f` (exit 0). They are now commit-pinned historical links rather
than assertions that those files exist on the helper branch.

Fresh dev was `38173c781`; it was merged normally into this already published
helper branch to preserve the remote candidate as an ancestor. This is a
non-destructive exception to the usual rebase refresh: rebasing the published
helper would recreate the non-fast-forward blocker this task diagnoses.
No old refs were reset and no force push was used.

Validation after the citation repair: canonical consistency (all four checks,
zero findings), `git diff --check`, and commit trailer validation all exit 0.
No product code changed; parent tests and live acceptance remain for the
replacement implementation candidate. The updated helper head requires fresh
same-SHA review and CI on the existing PR #1752.
