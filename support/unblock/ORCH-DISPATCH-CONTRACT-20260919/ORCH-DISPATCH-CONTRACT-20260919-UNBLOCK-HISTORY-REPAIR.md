# ORCH-DISPATCH-CONTRACT-20260919 history audit and safe continuation

- Helper: `ORCH-DISPATCH-CONTRACT-20260919-UNBLOCK-HISTORY-REPAIR`
- Parent: `ORCH-DISPATCH-CONTRACT-20260919`
- Owner: Codex; reviewer: Codex2
- Audit: 2026-09-19, through 23:50 UTC
- Scope: recovery evidence and parent disposition; dispatch implementation remains the parent task.

## Finding

No parent branch/commit contamination was found. The parent branch is a clean,
unpublished reference to `origin/dev`, with no task commit, registered parent
worktree, PR, or candidate. Its recorded reason for being held is interactive
ownership, not a Git failure. The parent's summary explicitly says:

> 使用者授權互動式 Codex 直接修復開發工具並完成 commit/push/merge/工具更新。此人工持有期間暫停自動 owner 派工，候選交付後由 Codex2 獨立審查。

The chairman's history classification is a keyword false positive. The current
release's `blocked_task_triage_kind()` in
`tools/development-orchestrator/control_plane/usecases/chair_review_policy.py`
checks `id`, `title`, `summary_zh`, `next`, and artifacts for history words before
checking contract/planning words. The summary's **`commit` and `push`** match.
The function does not inspect Git ancestry or the intent of the hold.

The activity log records the parent assignment at `2026-09-19T23:01:19Z`, then
creation of this helper at `23:47:33Z` and the chairman's
`chair_unblock_task_created` event at `23:47:34Z`. There is no recorded parent
handoff or implementation attempt in that task's activity slice. At audit time,
the task slice says `blocked`, `next: Assignment created`; the parent-specific
blocker and handoff arrays are empty. The same hold and summary are visible in
[OpsBus issue #2084](https://github.com/ajoe734/drts-fleet-platform/issues/2084).
The helper's generated description is therefore not evidence of a damaged
history.

## Git and workspace evidence

Snapshot after `git fetch origin`:

| Surface                                 | Observed evidence                                                                                                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin/dev`                            | `d6177129eeb1ad6844a7c28252bec178e48cb5f6`                                                                                                                                                                             |
| `codex/orch-dispatch-contract-20260919` | Same SHA; reflog has only creation from `refs/remotes/origin/dev` at `2026-09-19 22:55:53 +0000`                                                                                                                       |
| Parent versus `origin/dev`              | `git rev-list --left-right --count origin/dev...codex/orch-dispatch-contract-20260919` returns `0 0`; `git diff --exit-code` succeeds                                                                                  |
| Remote parent refs                      | `git ls-remote --heads origin 'codex/orch-dispatch-contract-20260919*' dev` returns only `dev` before helper publication                                                                                               |
| Parent PR/candidate                     | `gh pr list --state all --head codex/orch-dispatch-contract-20260919` returns `[]`; canonical `show` has no candidate/review/CI/merge fields                                                                           |
| Parent worktree                         | No registered worktree has `branch refs/heads/codex/orch-dispatch-contract-20260919`                                                                                                                                   |
| Parent commits/spec                     | No task-matching commit from `git log --all --grep`; no history for `tools/development-orchestrator/docs/dispatch-contract.md`; that referenced spec is absent in both the assigned helper worktree and canonical root |
| Helper's initial state                  | Assigned branch/worktree starts at `d6177129eeb1ad6844a7c28252bec178e48cb5f6`, clean; no existing remote branch or PR                                                                                                  |
| Canonical root                          | Still on local `dev` at `3982bbbae1d257c266b8a6d63ea4e6d6cf52acf9`; `git rev-list --left-right --count dev...origin/dev` returns `0 9` (behind, not divergent)                                                         |

The canonical root contains unrelated tracked edits in:

- `apps/passenger-web/components/passenger-ride-page.tsx`
- `apps/passenger-web/eslint.config.mjs`
- `packages/contracts/src/referral-channel.ts`
- `tests/unit/system-remediation/sr-push-webpush-20260915/passenger-push-subscription-lifecycle.test.ts`

There are also unrelated untracked files. None of these is parent implementation
evidence. They explain why moving or cleaning the canonical root would be an
unsafe recovery technique, but do not contaminate the isolated parent branch.
This helper preserves that root and all existing refs. It does not reset,
rebase, amend, force-push, stash, or cherry-pick unrelated work.

## Non-destructive continuation path

The Git prerequisite is clear: no historical patch needs rescue or replacement.
The interactive Codex owner can proceed with the existing parent branch:

1. Re-read the parent task slice and inspect current worktrees, remote refs,
   PR/candidate/CI after fetching. This snapshot does not authorize replacing a
   branch or candidate created after the audit.
2. Reuse any subsequently registered parent worktree. If it is still unoccupied,
   attach the existing `codex/orch-dispatch-contract-20260919` branch to a new
   isolated owner worktree with `git worktree add <new-owner-path>
codex/orch-dispatch-contract-20260919`. Stay out of the dirty canonical root;
   this helper's worker remains in its assigned helper worktree.
3. Restore/author the parent-owned task specification at
   `tools/development-orchestrator/docs/dispatch-contract.md` from the interactive
   session's authorized requirements before dispatch implementation. The task
   record names that file, but no version exists in the audited refs. Do not
   reconstruct detailed requirements from the helper's history-repair label.
4. Implement and anchor the parent-owned tool changes, run dispatch regressions,
   and use normal push plus a PR to `dev`. Supply the exact pushed parent SHA and
   branch to `ai-status.sh handoff ... Codex2`. Fresh review and CI belong to that
   parent candidate; this report is not implementation acceptance.
5. Retain the parent's required gates: `dispatch_contract_regressions`,
   `merged_tool_release_activated`, and `agy_codex_live_handoff`. Tool activation
   and live handoff evidence must follow the actual parent delivery.

Automatic owner dispatch remains paused while the interactive owner holds the
task. Supervisor may explicitly resume it when that ownership is released and
the concrete specification is available, or the interactive owner may deliver
its own candidate directly. A completed history helper alone must not release
the hold.

## Canonical parent disposition

Recorded these helper fields using the current canonical-root `ai-status.sh
assign` with `TASK_METADATA_JSON`, preserving its existing owner/reviewer and
task metadata:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Codex",
  "resolved_parent_next": "History audit found no parent divergence: reuse codex/orch-dispatch-contract-20260919 in an isolated interactive-owner worktree, restore tools/development-orchestrator/docs/dispatch-contract.md, then implement and hand off an exact pushed candidate to Codex2. Preserve the interactive-owner hold on automatic dispatch until that owner releases it; helper completion is not dispatch implementation or live acceptance."
}
```

Recorded the evidence and concrete next step on the parent with `ai-status.sh
note`, preserving `blocked`. No `resolved_parent_at` was manufactured:
the helper's same-candidate merge transaction records the resolution time and
preserves the blocked disposition. `parent_resume_blocker()` then returns
`helper keeps parent blocked`, preventing this helper from becoming automatic
resume authority.

## Verification and delivery

Read-only reproduction using the current release and parent task slice:

```text
blocked_task_triage_kind(parent): history_repair
matching history markers: ['commit', 'push']
same task with only 'commit/push/merge/' removed from summary: planning_decision
parent_resume_blocker(... helper done, resolved_parent_status=blocked): helper keeps parent blocked
```

Both relevant existing lifecycle tests pass against the current release:

```bash
cd /home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator
python3 -m unittest -v \
  test_ai_status.CandidateLifecycleTest.test_merge_preserves_recorded_blocked_parent_disposition \
  test_ai_status.CandidateLifecycleTest.test_legacy_helper_note_or_progress_cannot_renew_resolution
```

Result: **2 tests passed**. No runtime implementation was changed and no product
development server was started. Parent regression/release/live-handoff gates
remain outstanding under the parent task.

The first checkpoint, `9b4a01ab0`, was committed with the helper's task ID,
`LLM-Agent: codex`, and `Reviewer: Codex2`, then pushed normally to `origin`.
The staged generated-file guard and commit-trailer check passed. The workspace's
shared `node_modules/prettier` symlink points at an unavailable package, so
formatting used isolated `pnpm dlx prettier@3.6.2` (the repository's declared
minimum version) without changing shared dependencies.

This report is the only helper-owned repository change. Delivery uses the
assigned `codex/orch-dispatch-contract-20260919-unblock-history-repair` branch,
task-scoped commit trailers, normal push, a PR to `dev`, and a locked candidate
handoff to Codex2. The final candidate SHA/PR belong in canonical machine truth;
helper review, CI, and merge are not claimed by this audit snapshot.
