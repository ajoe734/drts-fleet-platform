# SR-ORCH-REVIEW-WORKTREE-ISOLATION-20260923 — Reviewer/Owner Worktree Isolation Fix

Owner: `Claude2`
Reviewer: `Codex`
Date: 2026-09-23 UTC

## 1. Traceability & Context

- **Task ID**: `SR-ORCH-REVIEW-WORKTREE-ISOLATION-20260923`
- **Branch**: `claude2/sr-orch-review-worktree-isolation-20260923`
- **task_spec_ref**: `.local/auto-worker-unblock-20260923/SR-ORCH-REVIEW-WORKTREE-ISOLATION-20260923.md`
- **Write scopes**: `tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py`, `tools/development-orchestrator/test_supervisor.py`, this doc.
  `watch_events.py` and `control_plane/domain/task_records.py` were inspected but did not require changes (see §2.3).

## 2. Root Cause Analysis (RCA)

### 2.1 Observed production evidence (2026-09-23)

Task `SR-PARTNER-NOTIFY-UI-20260917` (owner Gemini) published a successor branch
`gemini/sr-partner-notify-ui-20260917-successor-4` and the operator set the task's
`execution_branch` field to that branch so Gemini's wake-up would resume it instead
of the stale conventional `gemini/sr-partner-notify-ui-20260917` branch.

Reviewer Codex's dispatch for the same task
(`.orchestrator/logs/20260923T150133077171Z-codex-codex-84390a.log`) landed on `HEAD 692b69b8`
with `partner-notification-panel.tsx` dirty — the exact file Gemini was concurrently
repairing in CI. Codex was not in its own isolated worktree; it was reading/writing
inside **Gemini's own, currently-mutating worktree**.

### 2.2 Code-level cause

`supervisor_runtime.ensure_execution_workspace()` calls `_execution_branch(repo_root, request)`
to pick the branch for the dispatch's worktree, then `_worktree_for_branch()` to find (or
create) that branch's worktree. Before this fix, `_execution_branch()` applied the task's
`execution_branch` override **for every dispatch role**, with no owner/reviewer distinction:

```python
def _execution_branch(repo_root, request):
    default_branch = _task_branch(request.agent_id, request.task_id or "")
    ...
    configured_branch = task.get("execution_branch")   # applied regardless of role
    ...
```

Because the override is a single branch name shared by the task record, an owner dispatch
(`reason="owned_ready_dispatch"`, agent `gemini`) and a reviewer dispatch
(`reason="review_ready_dispatch"`, agent `codex`) for the **same task** both resolved to the
identical branch name `gemini/sr-partner-notify-ui-20260917-successor-4`. `_worktree_for_branch()`
then found the *one* worktree already checked out on that branch — the owner's — and handed
that exact path to the reviewer (`ensure_execution_workspace` `existing_worktree` short-circuit
at line ~1124-1126), instead of creating an isolated review workspace.

Without an `execution_branch` override, this collision cannot happen: the default branch is
`_task_branch(agent_id, task_id)` = `f"{agent_id}/{task_id.lower()}"`, which is inherently
agent-scoped and therefore always differs between owner and reviewer. The bug only manifests
once an owner-authored branch override is present — exactly the successor-branch scenario from
the incident.

### 2.3 `watch_events.py` rendering was already safe

`render_wakeup_message()` in `watch_events.py` only renders the anchor-commit / branch-protocol
block (which names the execution branch) `if not is_reviewer_dispatch and mutates_canonical`
(`watch_events.py:381`); reviewer dispatches never see branch-resume instructions in the wake-up
text, and instead get fixed-candidate-SHA guardrails (`watch_events.py:360-367`, unchanged).
The mismatch was purely in the **actual workspace assigned** by `supervisor_runtime.py` — the
`Supervisor-assigned workspace:` notice appended by `attach_workspace_metadata()` reflected
whatever `ensure_execution_workspace()` returned, so once the workspace resolution is
role-aware, the rendered notice agrees with it automatically. No change was needed in
`watch_events.py` or `control_plane/domain/task_records.py`.

## 3. Remediation & Implementation

`tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py`:
`_execution_branch()` now checks `task_role_for_dispatch_reason(request.reason)` first; when the
dispatch role is `"reviewer"`, it returns the agent-scoped default branch immediately and never
reads/applies the task's `execution_branch` override. Owner dispatches (role `"owner"` or no
role, e.g. `dispatch_role` not yet gated by `task_role_for_dispatch_reason`) are unaffected —
the override still applies and the owner resumes its successor branch and preserves WIP exactly
as before.

This is a single choke-point fix: `ensure_execution_workspace()`, `_worktree_for_branch()`, and
`attach_workspace_metadata()` are all downstream of `_execution_branch()`'s return value, so
fixing branch selection alone guarantees: (a) the reviewer's worktree path can never collide
with the owner's (agent-scoped branch name → agent-scoped worktree slug), (b) the owner's
existing worktree/WIP is never touched by a reviewer dispatch, and (c) the rendered
"Supervisor-assigned workspace" notice for the reviewer names its own isolated branch/path,
consistent with what was actually assigned.

## 4. Acceptance Criteria & Verification

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| `reviewer_workspace_isolated_from_owner_successor` | `supervisor_runtime.py::_execution_branch` (role-aware override skip) | Pre-fix: reviewer dispatch for a task with an owner `execution_branch` override resolved to the owner's exact worktree path/branch. Post-fix: resolves to the reviewer's own agent-scoped branch/worktree, distinct path. | `python3 -m unittest test_supervisor.ExecutionWorkspaceTests.test_review_dispatch_ignores_owner_execution_branch_override -v` — reproduced FAIL against pre-fix code (stashed fix, reran), PASS with fix restored. Local venv, Python 3. | None. |
| `owner_successor_and_wip_preserved` | Same function; owner branch path unchanged when `task_role_for_dispatch_reason(request.reason) != "reviewer"` | Owner dispatch (`reason="owned_ready_dispatch"`) still resumes `execution_branch` override and reuses its existing worktree unchanged; reviewer dispatch alongside it does not touch owner's dirty file. | `python3 -m unittest test_supervisor.ExecutionWorkspaceTests.test_owner_dispatch_still_resumes_execution_branch_override test_supervisor.ExecutionWorkspaceTests.test_reuses_existing_worktree_for_execution_branch_override -v` → both `ok`. New reviewer-isolation test also asserts `git status --porcelain` on the owner worktree is byte-identical before/after the reviewer dispatch. | None. |
| `rendered_branch_matches_assigned_review_workspace` | `attach_workspace_metadata` (unchanged, now fed correct role-aware branch/workspace); `watch_events.py::render_wakeup_message` reviewer gating (`is_reviewer_dispatch`, pre-existing, verified unaffected) | Post-fix reviewer `Supervisor-assigned workspace:` notice names the reviewer's own isolated path/branch and contains neither the owner's worktree path nor the owner's override branch string. | Assertions in `test_review_dispatch_ignores_owner_execution_branch_override` (`assertIn` reviewer path/branch, `assertNotIn` owner path/branch). Full suites: `python3 -m unittest test_supervisor -v` → 154 tests, OK; `python3 -m unittest test_watch_events -v` → 12 tests, OK. | Not exercised against a live supervisor tick / real dispatch queue (VM services not started per task-spec constraint); covered at the unit level only. |

- No product/UI/NAV source touched — scope confined to `supervisor_runtime.py` and its regression
  tests, per task-spec constraint.
- No `.orchestrator` runtime services were started or restarted on this VM.
