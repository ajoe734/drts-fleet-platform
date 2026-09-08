# SR-PROOF-001-UNBLOCK-HISTORY-REPAIR

Owner: Codex2. Reviewer: Codex. Audit date: 2026-09-08.

## Result

The published evidence is recoverable without rewriting shared history. The
current parent has **no demonstrated cross-task file contamination or trailer
failure**. Its historical hazard is duplicated rebased anchors plus stale
owner/branch/PR references. History repair alone does not clear the parent's
scope, dependency, and canvas routing blockers.

This helper documents and checks the non-destructive recovery path. It does
not modify another owner's branch or turn the parent's intentionally failing
regressions into an implementation candidate.

## Exact evidence after fetch

Audit base `origin/dev`: `3b60a3757238663572f16f010c94f446f2c71eaa`.
Assigned helper worktree:
`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-sr-proof-001-unblock-history-repair`.
It started clean on `codex2/sr-proof-001-unblock-history-repair` at the audit
base; `git rebase origin/dev` reported up to date. No parent branch is currently
checked out in the registered worktrees. The canonical root remains on `dev`
at `650e233bb1c35269852c291ef892d25967380c12`; it was not switched or edited.

| Reference | Exact head / diagnosis |
| --- | --- |
| Local and remote `codex2/sr-proof-001` | `acd6b7bb4d32329986a04cd6050624bc1fc39f34`; 11 commits outside current dev (9 non-merge, 2 merge) |
| Local and remote `codex/sr-proof-001` | `31ba1c622678f7082a08df33d241018cccffd515`; 2 task commits outside current dev |
| Parent reconstruction field | `f6ed6eaa5fa4a2f79b745bdd2c51ec3c12672e27`; surviving historical anchor, not the latest owner branch |
| Local previous-helper `gemini2/sr-proof-001-unblock-history-repair` | `c9033856f8acf1fd4309b1ecd488562a48d8b99e`; no commits outside current dev |
| [PR #1699](https://github.com/ajoe734/drts-fleet-platform/pull/1699) | Open draft, base dev, head `codex2/sr-proof-001` at `acd6b7bb4d32329986a04cd6050624bc1fc39f34`; body still describes September 6 owner/base evidence |

Both parent branches have merge base
`70355aba97c23dd1cd592b71f1d3dfe6315d91ff` with current dev. Their symmetric
difference is 11 old-branch-only commits and 2 current-owner-only commits.
The current owner's two commits are:

- `1a58e13060f7b1ec1e58f74481153b834b31d884`: fresh-base payment-gate regressions.
- `31ba1c622678f7082a08df33d241018cccffd515`: reproduction evidence.

The old branch preserved published anchors by merging:

- `c03fca595c3cb24d90c25f6de35a2762f02e659e`, parents `246ac6355` and `d2488b19e`.
- `acd6b7bb4d32329986a04cd6050624bc1fc39f34`, parents `56345bca5` and `f6ed6eaa5`;
  its commit message records a resolved conflict in the parent UAT evidence file.

Replayed reproducer anchors include `662720328`, `ac1076708`, and `5e220b291`;
scope-evidence anchors include `d2488b19e`, `246ac6355`, and `d6f5df02c`.
These are repeated task history, not proof of unrelated implementation changes.
Each parent's three-dot diff against dev contains only:

- `docs/04-uat/system-remediation-20260906/SR-PROOF-001.md`
- `tests/unit/system-remediation/sr-proof-001/payment-gate.test.ts`

The newer branch adds 165 lines; the older branch adds 186 lines. Do not merge
both versions or treat the old PR head as the current owner's candidate.
The role-routing report cited in the dispatch explains lane reassignment but
contains no commit-contamination evidence.

## Non-destructive recovery procedure for the parent owner

1. Preserve both published branches and draft PR #1699 as historical evidence.
   Do not reset, force-push, delete, or merge the old diagnosis PR to unblock work.
2. Supervisor first resolves the remaining routing items below. Then dispatch
   owner Codex to an isolated parent worktree, with the selected recovery branch
   recorded explicitly. Fetch and recheck the refs above before acting.
3. If reusing `codex/sr-proof-001`, rebase only in its owner worktree after checking
   it is clean. A rebase changes published commit IDs; do not force-push the result.
   Publish it to a new, supervisor-selected unused recovery branch and open its
   PR against dev. Keep the old branch intact and record the replacement branch
   in the parent lifecycle. Do not repeatedly merge old rebased copies back in.
4. An equivalent simpler recovery is to start that fresh branch at current
   `origin/dev`, then cherry-pick only `1a58e13060f7b1ec1e58f74481153b834b31d884`
   and `31ba1c622678f7082a08df33d241018cccffd515` in order. Do not cherry-pick
   the old branch's merge commits or all historical anchors. Resolve any new
   conflicts under the parent's approved scope and rerun its checks.
5. Update the evidence's base and command results on the selected branch,
   implement the authorized proof flow, and run the parent's declared tests.
   Commit with parent task trailers, ordinary non-force push, create the new
   dev PR, and hand off the exact final SHA to parent reviewer Claude.
   The helper's candidate is a separate documentation candidate reviewed by Codex.

Steps 3–5 are documented owner actions, not actions performed by this helper.
The combined diff of the two selected commits passes `git apply --check` on
the clean audit base, establishing that their final tree delta is recoverable
there. This does not claim future cherry-picks or product tests have passed.

## Parent next step and remaining blockers

The parent task slice still has only SR-ARTIFACT-001 and SR-INVOICE-001 as
dependencies and only service/controller, reimbursements UI, task tests/docs
as write scopes. Preserve its blocked status. Supervisor must:

1. Add SR-CONTRACT-001 dependency or record an explicit authorized exception.
2. Approve billing repository/module and dedicated proof storage/scanner scopes.
3. Route missing Platform Admin proof upload/scan/reject/readback canvas states.
4. Dispatch Codex with the selected recovery branch and the two current-owner
   commits above; do not dispatch against stale PR #1699 as a finished candidate.

The merged planning decision
`support/unblock/SR-PROOF-001/SR-PROOF-001-UNBLOCK-PLANNING-DECISION.md`
([PR #1704](https://github.com/ajoe734/drts-fleet-platform/pull/1704)) supplies
the routing rationale. The parent's September 8 report records 1 passing and
2 intended failing regressions; these are historical product evidence, not
tests rerun or passed by this history-only helper.

## Verification and delivery

| Check run by this helper | Result |
| --- | --- |
| `git fetch origin` and `git rebase origin/dev` in helper worktree | Exit 0; up to date |
| `git worktree list --porcelain`, branch refs, merge bases and logs | Confirmed identities and ancestry above |
| `git diff --stat origin/dev...origin/codex/sr-proof-001` and old-owner equivalent | Only the two parent-owned files |
| `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head origin/codex2/sr-proof-001` | Exit 0; 9 non-merge commits pass |
| Same trailer check with `--head origin/codex/sr-proof-001` | Exit 0; 2 commits pass |
| `git diff --binary origin/dev...origin/codex/sr-proof-001 > /tmp/sr-proof-001-recovery.patch` followed by `git apply --check /tmp/sr-proof-001-recovery.patch` | Exit 0; no files applied |
| `git diff --check origin/dev...origin/codex/sr-proof-001` | Exit 0 |
| `gh pr view 1699 --json isDraft,mergeable,mergeStateStatus,body` | Draft confirmed; mergeability UNKNOWN, not asserted mergeable |

This helper delivers only this artifact. Its task-scoped commit, ordinary push,
PR URL and exact candidate SHA are recorded through `ai-status.sh` at handoff;
the parent next step is recorded via `ai-status.sh note`. No shared history
rewrite, product change, live payment, or parent acceptance is claimed.
