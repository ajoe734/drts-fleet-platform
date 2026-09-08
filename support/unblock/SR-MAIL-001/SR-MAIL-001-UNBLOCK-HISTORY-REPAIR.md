# SR-MAIL-001 branch history recovery (2026-09-08)

Task: `SR-MAIL-001-UNBLOCK-HISTORY-REPAIR`; owner: Codex; reviewer: Claude.
This audit supersedes the 2026-09-06 Gemini/Codex2 diagnosis in this file.
That diagnosis concerned a different branch and is not evidence for today's blocker.
Scope: document a non-destructive recovery; no parent source changes or parent
candidate handoff are performed by this helper.

## Exact observed state

After successful `git fetch origin`:

| Ref | SHA |
| --- | --- |
| `origin/dev` / helper starting HEAD | `3b60a3757238663572f16f010c94f446f2c71eaa` |
| local `codex/sr-mail-001` | `25fc24ab7d12b0aeb833bb868586afb1c1953d30` |
| remote `origin/codex/sr-mail-001` | `a1924736aadb434521504725c11420517700f759` |
| local parent's rebase base | `b5c3774e5e62fab7cf43b67a7e69fae7e0ca91ef` |

[Parent PR #1719](https://github.com/ajoe734/drts-fleet-platform/pull/1719)
is OPEN, targets dev, and still has remote head `a1924736a…`.
`git worktree list --porcelain` shows no worktree checking out
`codex/sr-mail-001`. The assigned helper worktree is
`.artifacts/worktrees/auto/codex-sr-mail-001-unblock-history-repair`, on
`codex/sr-mail-001-unblock-history-repair`, initially clean. The canonical root
remains on dev and was not switched or edited.

The current parent's machine status is blocked, requesting force-with-lease
or an alternative candidate branch. The previous worker result
`.orchestrator/worker-results/codex-20260908T113259Z-7ff3b739.json` reports a
non-fast-forward rejection. This run independently confirms the divergence:
local is eight commits ahead and six behind remote (one ahead commit is the
new upstream base). This is published-history divergence, not foreign product
files mixed into the parent patch.

`git reflog show codex/sr-mail-001` records rebase from remote `a1924736a`
to temporary head `63154d959` on `b5c3774e5`, amendment to `b9c8135ae`, then
new evidence commit `25fc24ab7`.

`git range-diff 70355aba9..origin/codex/sr-mail-001 b5c3774e5..codex/sr-mail-001`
identifies the exact old/new mapping:

| Published commit | Rewritten commit | Change |
| --- | --- | --- |
| `31bc3f02e` | `93acae845` | Same patch/message |
| `e811696a8` | `49d624873` | Same patch/message |
| `1e3a58094` | `92cae7c90` | Same patch/message |
| `99018c13a` | `d6b689cef` | Same patch/message |
| `04d9c7768` | `808fbbad2` | Same patch/message |
| `a1924736a` | `b9c8135ae` | Same patch; subject test → fix, agent trailer case changed |
| none | `25fc24ab7` | Added candidate subject remediation record |

All seven commits above origin/dev carry Task-ID SR-MAIL-001. The six changed
files are the three approved tenant-partner service/module files, the parent
UAT document, and two tests under `tests/unit/system-remediation/sr-mail-001/`.
There is no need to recover the old Codex2 stack or apply its historical
verify-mailpit.ts fix to this stack.

## Verified non-destructive path

Use a fresh parent replacement branch, preserving both existing refs and PR
#1719 as history. Do not push rewritten history to the existing remote branch.
The proposed name `codex/sr-mail-001-recovered-20260908` is absent remotely
(`git ls-remote --heads origin codex/sr-mail-001-recovered-20260908`, exit 0,
no output). Check local and remote availability again before creating it;
if occupied, inspect/reuse the matching recovery or choose a new unused suffix.

The current release supports this lifecycle without code changes:
`tools/development-orchestrator/bin/ai_status.py::command_handoff` accepts an
explicit CANDIDATE_BRANCH; `github_bus.py::review_branch_for_task` prioritizes
that recorded branch over agent defaults. Supervisor must also route the next
parent worker to the replacement branch/worktree, so its wakeup does not send
it back to `codex/sr-mail-001`. This is an operational next step, not a request
for force-push permission.

Supervisor/parent owner procedure (not executed by this helper):

1. Resume the blocked parent under Codex/Claude with the current status CLI's
   `resume-blocked SR-MAIL-001 in_progress` command and route its worker to the
   replacement workspace. Preserve all existing worktrees and refs.
2. In the assigned recovery workspace, prepare from the retained parent head:

   ```bash
   git fetch origin
   git worktree add -b codex/sr-mail-001-recovered-20260908 \
     .artifacts/worktrees/auto/codex-sr-mail-001-recovered-20260908 \
     25fc24ab7d12b0aeb833bb868586afb1c1953d30
   cd .artifacts/worktrees/auto/codex-sr-mail-001-recovered-20260908
   git rebase origin/dev
   ```

   Run worktree creation from the repository root designated by supervisor,
   without switching that root's branch. If upstream has moved, inspect any
   conflicts against the parent's write scopes; do not blindly take either
   side. Rebase is safe here because the replacement branch is unpublished.
3. Run `git diff --check`, `pnpm typecheck:root`,
   `pnpm --filter @drts/api typecheck`,
   `pnpm exec vitest run tests/unit/system-remediation/sr-mail-001/`, and
   `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`.
   Record actual results and current base/candidate in parent evidence; commit
   any evidence/fixes with Task-ID SR-MAIL-001 and Reviewer Claude.
4. Normal push: `git push -u origin codex/sr-mail-001-recovered-20260908`.
   Create a dev-targeted replacement PR with a body file referencing #1719 and
   explaining the preserved history. Do not reuse review/CI from #1719.
5. From that workspace, hand off the exact pushed head using
   `CANDIDATE_SHA=$(git rev-parse HEAD)`,
   `CANDIDATE_BRANCH=$(git branch --show-current)`, `PR_URL=<replacement PR>`,
   `AI_NAME=Codex`, and the current canonical status CLI:
   `/home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh handoff SR-MAIL-001 Claude "Replacement branch; current checks and PR evidence recorded"`.
   Independent same-SHA review, CI, merge and acceptance remain required.

## Checks performed in this helper

- Fetch, worktree/ref/reflog inspection, range-diff and GitHub PR query: exit 0.
- `git merge-tree --write-tree origin/dev codex/sr-mail-001`: exit 0, no conflicts;
  synthetic tree `803da5bdbb0a1a09fccfd89be5295e7583fd0eec`. This changes no refs
  and proves only merge feasibility, not that a rebase or runtime test passed.
- `git merge-base --is-ancestor` for notification merge
  `3014f9a4942f73f89c0a6f8458dc8b042c1034d0` and referral merge
  `503f36015adc084e75ee33e5a866525b5c7d72c6` against origin/dev: both exit 0.
  Both dependencies are also recorded done in their task slices.
- No product tests or live receiver checks rerun in this documentation helper.
  Previous worker's 13 passing tests are historical, not replacement-candidate
  acceptance. The parent must rerun validation after rebase.

## Delivery and parent next step

This file is the only helper change. Its task-scoped commit and normal push
are on `codex/sr-mail-001-unblock-history-repair`; the final SHA and PR URL
are recorded by helper handoff in machine truth and the PR itself, avoiding a
self-referential SHA in this file. Review/CI/merge are not claimed complete.

The parent receives a status CLI note with this concrete next step: supervisor
routes Codex to the unused recovery branch/worktree; parent owner rebases the
retained `25fc24ab7…`, validates, normal-pushes and hands off a new candidate.
The parent remains blocked until routing/resume; this helper satisfies the
accepted documented-path option and does not claim the mail feature is done.
