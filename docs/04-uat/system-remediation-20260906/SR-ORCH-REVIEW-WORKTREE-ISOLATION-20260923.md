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

## 5. Round 2 — F1 (Codex `reopen`, reviewed SHA `50f55f7a383dfd5b6ca04536579eda28557ff464`)

### 5.1 Finding

Codex reopened candidate `50f55f7a3` (PR #2114) with finding **F1 [P1]**: the Round‑1 fix makes
`_execution_branch()` skip the *override string* for reviewers, but the reviewer's own
deterministic default branch (`_task_branch(agent_id, task_id)` = `f"{agent_id}/{task_id.lower()}"`)
is an ordinary, unrestricted Git ref name. Nothing stops an owner's `execution_branch` override
from being set to that exact string — coincidentally or because a prior successor branch happened
to be named after another agent. When that happens, `_worktree_for_branch()` in
`ensure_execution_workspace()` (supervisor_runtime.py:1178-1180, pre-fix) still resolves the
reviewer's own default branch to the *owner's* already-checked-out worktree, because branch
identity — not workspace/agent identity — is the only thing `_worktree_for_branch()` checks. The
mutable-worktree collision the task exists to close therefore survives Round 1 for this case.

Codex's exact reproduction (`ExecutionWorkspaceTests` fixtures): task `IAM-SES-002`, owner
`gemini`, reviewer `codex2`, `execution_branch="codex2/iam-ses-002"` (== the reviewer's own default
branch). Owner worktree created at `.artifacts/worktrees/auto/gemini-iam-ses-002` on that branch,
`README.md` dirtied to `"owner wip\n"`. Calling `ensure_execution_workspace()` for the owner then
the reviewer returned the **same workspace** for both, with `workspace_source="existing_worktree"`
for the reviewer and the owner's dirty `README.md` content visible to it.

### 5.2 Root cause

`_execution_branch()` only decides the branch *name*; nothing downstream distinguished "a branch
name that happens to match" from "a branch this reviewer/task actually owns" before reusing an
already-checked-out worktree for it.

### 5.3 Fix

`supervisor_runtime.py`, same file/scope, no new write-scope files needed:

- `_agent_task_slug(agent_id, task_id)`: factored out of `_candidate_worktree_path` (same
  normalization, no behavior change) so it can be reused to identify "this reviewer/task's own"
  worktree naming.
- `_worktree_belongs_to_slug(path, base, slug)`: true iff `path` sits under `base` and its
  top-level directory name is `slug` or `slug-<suffix>` (matches the existing
  `_candidate_worktree_path` collision-suffix scheme).
- `_foreign_worktree_for_branch(repo_root, base, branch, slug)`: returns the worktree already
  checked out on `branch`, but only if it does **not** belong to `slug` — i.e. it's someone else's.
- `_reviewer_isolated_branch(agent_id, task_id)`: a branch name namespaced to this reviewer/task
  pair (`{slug}-isolated-review`) that cannot collide with any agent-scoped default branch.
- `_reviewer_safe_branch(repo_root, base, request, branch)`: no-op for non-reviewer dispatches;
  for reviewer dispatches, if `branch` is already checked out by a worktree that isn't this
  reviewer/task's own, returns `_reviewer_isolated_branch(...)` instead of `branch`.
- `ensure_execution_workspace()`: `branch = _reviewer_safe_branch(repo_root, base, request, branch)`
  inserted immediately after the existing `branch = _execution_branch(repo_root, request)` call
  (supervisor_runtime.py:1178), before the `_worktree_for_branch()` existing-worktree lookup. When
  redirected, the reviewer gets a brand-new worktree/branch forked from `base_branch` (same
  fallback path `ensure_execution_workspace()` already uses for any new branch), never the
  collided-with branch.

The ordinary (non-colliding) reviewer path — `_task_branch(agent, task)` distinct from whatever the
owner is on — is unaffected: `_foreign_worktree_for_branch` finds no match, `_reviewer_safe_branch`
returns `branch` unchanged, so Round 1's behavior and its regression test are preserved exactly.

### 5.4 Verification

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| F1 / `reviewer_workspace_isolated_from_owner_successor` (collision case) | `supervisor_runtime.py::_reviewer_safe_branch` + `_foreign_worktree_for_branch` + `_worktree_belongs_to_slug`, wired into `ensure_execution_workspace` at the `branch = _execution_branch(...)` call site | New test `test_reviewer_default_branch_colliding_with_owner_override_gets_isolated`: with the `_reviewer_safe_branch` call temporarily removed (candidate `50f55f7a3` behavior), the test fails with `reviewer_workspace == owner_worktree` (`AssertionError` at `assertNotEqual`); with the fix restored, it passes — reviewer gets its own new worktree/branch, `README.md` reads `"test\n"` (fresh from `dev`), not `"owner wip\n"`. | `python3 -B -m unittest test_supervisor.ExecutionWorkspaceTests.test_reviewer_default_branch_colliding_with_owner_override_gets_isolated -v` → FAIL pre-fix (verified by temporarily stripping the `_reviewer_safe_branch` call, rerunning, restoring), PASS post-fix. Python 3, this worktree, no mocks — calls the production `ensure_execution_workspace`/`_git_capture` (real `git worktree add`) path. | Not exercised against a live supervisor tick or real dispatch queue; VM services not started per task-spec constraint. Unit-level only. |
| `owner_successor_and_wip_preserved` (collision case) | Same test: asserts owner worktree `git status --porcelain` byte-identical before/after the reviewer dispatch, and owner stays on its override branch | Owner dispatch before and after the reviewer's colliding dispatch resolves to the same existing worktree/branch/dirty content; unaffected by the reviewer redirect. | Same test run as above. | None. |
| `rendered_branch_matches_assigned_review_workspace` (collision case) | `attach_workspace_metadata` fed the corrected `(reviewer_workspace, reviewer_branch)` pair | Reviewer's `Supervisor-assigned workspace:` notice names its own isolated path/branch; asserted to not contain the owner's worktree path. | Same test: `assertIn` reviewer path/branch in `reviewer_request.message`, `assertNotIn` owner path. | None. |
| Full regression | All existing `ExecutionWorkspaceTests` (incl. Round 1's `test_review_dispatch_ignores_owner_execution_branch_override`, non-colliding case) plus new test | No regressions; Round 1 behavior unchanged for the non-colliding case. | `python3 -B -m unittest test_supervisor test_watch_events -v` → 167 tests, OK, exit 0 (was 166 pre-Round-2). `python3 -B -m unittest test_runtime_module_boundaries -v` → 6 tests, OK. | None observed; scoped to this repo's Python unit tests, no DB/browser/runtime involved. |

- `watch_events.py` and `control_plane/domain/task_records.py` were re-inspected for F1 and still
  require no change: reviewer dispatches never render a branch-protocol block at all (§2.3,
  unaffected by this round), and `task_role_for_dispatch_reason` needed no new predicate — slug
  ownership is a worktree-path concern local to `supervisor_runtime.py`.
- No product/UI/NAV source touched. No `.orchestrator` runtime services started or restarted.

## 6. Round 3 — F1.a / F1.b (Codex `reopen`, reviewed SHA `101c61f2785dfba684aaf31dab1e70c55885adae`)

### 6.1 Finding

Codex reopened candidate `101c61f2` (PR #2114) with **F1.a** and **F1.b** (see
`.local/auto-worker-unblock-20260923/isolation-review-second-candidate.md`,
`isolation-reviewer-r2-probes.json` for the reviewer's own verbatim probes):

- **F1.a**: `_worktree_belongs_to_slug` matches by *directory name*, but a task takeover does not
  rename the directory — `ensure_execution_workspace` reuses whatever path already has the target
  branch checked out. If today's reviewer was the task's *original* owner, its own agent/task slug
  still names that directory, so `_worktree_belongs_to_slug` wrongly says "this is my own
  workspace" even though the directory is now the *new* owner's live, dirty tree (because the
  branch handed over as the new owner's `execution_branch` override happens to equal the old
  owner's — now reviewer's — deterministic default branch).
- **F1.b**: once a reviewer's plain default branch is redirected to the deterministic
  `{slug}-isolated-review` fallback (Round 2's `_reviewer_isolated_branch`), nothing checked *that
  fallback name itself* against the owner's `execution_branch` override. An override chosen to
  equal that exact fallback string sends the reviewer straight back to the owner's live worktree.

Both are instances of the same underlying problem the reviewer flagged explicitly: **`execution_branch`
is an arbitrary, owner-authored Git ref**, and Round 2's fix (`_reviewer_safe_branch`) was still a
finite set of name comparisons (default branch, then one fallback name) against it. Any fix that
picks the reviewer's branch/path by *name* is chasing an owner-controlled string and will always
have one more name left to collide with — as demonstrated twice now (Round 1's plain default,
Round 2's `-isolated-review` fallback).

### 6.2 Root cause

Reviewer workspace *identity* (which path/branch a reviewer lands on) and *content* (what the
reviewer is actually meant to look at) were both being decided as "some Git ref name", drawn from
the same namespace an owner's `execution_branch` override is free to point anywhere in. As long as
reviewer isolation depends on that name not coinciding with whatever the owner chose, it is a
matching game the owner (or a stale directory left over from a prior role handoff) can always win.

Separately — and independent of F1.a/F1.b — the Round 1/2 design never actually populated a
reviewer's workspace with the owner's real candidate content in the first place: on the
non-colliding path, `ensure_execution_workspace` forks a **brand-new, empty branch off `dev`**
for the reviewer (`_branch_exists`/`_remote_branch_exists` both false for a synthetic
`{agent}/{task_id}` or `{slug}-isolated-review` name), never the owner's actual commits. Reviewers
were expected to `git fetch`/`checkout` the pinned `candidate_sha` themselves inside that empty
workspace. That already worked operationally (the wake-up prompt's review guardrails instruct
exactly that, `watch_events.py:360-367`), but it means the supervisor's own workspace-provisioning
code was never actually pinning content to the reviewed candidate — only providing an isolated (if
collidable) empty directory.

### 6.3 Fix — structural isolation, not name comparison

`tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py`: reviewer dispatch no
longer goes through `_execution_branch`/`_worktree_for_branch`/`_candidate_worktree_path` (the
owner-path machinery) at all. `ensure_execution_workspace` now branches on
`task_role_for_dispatch_reason(request.reason) == "reviewer"` immediately after resolving
`base`/`base_branch`, and hands off to a new, independent `ensure_reviewer_review_workspace`:

- `_reviewer_workspace_base(base)`: returns `base / "review"`. Owner and coordination worktrees
  are *always* allocated directly under `base` (`_candidate_worktree_path`,
  `_candidate_coordination_worktree_path` — both build `base / slug`, never `base / "review" /
  ...`). Reviewers living exclusively under `base/review/` therefore cannot land on an owner's path
  **by construction** — there is no name for an owner's `execution_branch` override to be that
  would ever cause a collision, because owner paths and reviewer paths are disjoint subtrees, not
  disjoint by comparison.
- `_reviewer_candidate_commit(repo_root, request, owner_branch)`: resolves the exact commit a
  reviewer must examine — the task's pinned `candidate_sha` if present and locally resolvable
  (`git rev-parse --verify <sha>^{commit}`; every worktree of one repository shares one object
  database, so this needs no network fetch even for an unpushed commit), else the current tip of
  the owner's branch (`_reviewer_owner_branch`, itself only `_owner_override_branch(...)` or the
  agent-scoped default — used *only* as a content source, never as the reviewer's own path/branch
  identity).
- `_candidate_reviewer_worktree_path(review_base, agent_id, task_id, commit)`: same
  never-reset-someone-else's-tree discipline as `_candidate_worktree_path` — reuses an existing
  path only if it is already a clean checkout of that exact `commit`; otherwise allocates a
  distinctly-suffixed new path, never force-checks-out over drift/WIP left by a prior review round.
- `ensure_reviewer_review_workspace`: `git worktree add --detach <path> <commit>`. **Detached**, on
  purpose — a reviewer workspace never has any branch checked out, so there is no ref left for a
  future owner override to ever coincidentally equal.
- `attach_workspace_metadata`: the reviewer-specific "Supervisor-assigned workspace" notice now
  says "Reviewing candidate `<sha>`; no branch is checked out here — do not `git switch`" instead
  of the old owner-shaped "Task branch: `<branch>` from base `<base>`" line — the rendered text now
  states what is actually true of a detached workspace (this closes the third required-acceptance
  item, `rendered_branch_matches_assigned_review_workspace`, honestly rather than incidentally).

`_reviewer_safe_branch`, `_reviewer_isolated_branch`, `_foreign_worktree_for_branch`, and
`_worktree_belongs_to_slug` (all of Round 2's name-comparison machinery) are removed — dead code
once reviewer workspace selection no longer goes through branch names at all.
`_owner_override_branch` (added in this round's earlier draft) is kept and reused by
`_reviewer_owner_branch` as the fallback content source described above.

The owner code path (`_execution_branch`, `_worktree_for_branch`, `_candidate_worktree_path`,
`ensure_execution_workspace`'s non-reviewer branch) is untouched byte-for-byte in control flow —
only reached when `task_role_for_dispatch_reason(request.reason) != "reviewer"`, exactly as before.

### 6.4 Verification

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| F1.a / `reviewer_workspace_isolated_from_owner_successor` | `ensure_reviewer_review_workspace` + `_reviewer_workspace_base` (disjoint `review/` namespace) | New test `test_reviewer_isolated_from_owner_workspace_wearing_reviewers_old_slug` reproduces Codex's exact scenario (reviewer's own slug names a directory that is now the new owner's live tree after takeover): reviewer resolves to `base/review/<slug>-<sha12>`, never the owner's `base/<old-slug>` path; owner `README.md`/branch untouched. | `python3 -B -m unittest test_supervisor.ExecutionWorkspaceTests.test_reviewer_isolated_from_owner_workspace_wearing_reviewers_old_slug -v` → `ok`. Python 3.12.3, this worktree, real `git worktree add`, no mocks. | None. |
| F1.b / `reviewer_workspace_isolated_from_owner_successor` | Same — reviewer never resolves any branch name at all, so there is no `-isolated-review` fallback name left for an override to preempt | New test `test_reviewer_isolated_when_override_preempts_isolated_fallback_name` reproduces Codex's exact scenario (owner's `execution_branch` override deliberately equals the old `{slug}-isolated-review` fallback string): reviewer still resolves under `base/review/`, distinct from both the owner's worktree and an unrelated foreign worktree occupying the reviewer's old plain-default branch name. | `python3 -B -m unittest test_supervisor.ExecutionWorkspaceTests.test_reviewer_isolated_when_override_preempts_isolated_fallback_name -v` → `ok`. Same environment. | None. |
| `owner_successor_and_wip_preserved` | Owner code path unreached/unchanged for reviewer dispatch (`task_role_for_dispatch_reason` gate at top of `ensure_execution_workspace`) | Owner dispatch (`reason="owned_ready_dispatch"`) still resumes its `execution_branch` override and existing worktree in every test above and in `test_owner_dispatch_still_resumes_execution_branch_override`; owner `git status --porcelain` and `HEAD` byte-identical before/after every reviewer dispatch alongside it, including after the owner keeps committing/drifting post-handoff. | `python3 -B -m unittest test_supervisor.ExecutionWorkspaceTests -v` → 12 tests, `ok`. | None. |
| `rendered_branch_matches_assigned_review_workspace` | `attach_workspace_metadata` reviewer-specific notice branch | Reviewer `Supervisor-assigned workspace:` notice says `Reviewing candidate `<sha>`` and `detached`, contains neither the owner's worktree path nor the owner's override/default branch string, in all four reviewer regression tests. | Assertions in `test_review_dispatch_ignores_owner_execution_branch_override`, `test_reviewer_default_branch_colliding_with_owner_override_gets_isolated`, `test_reviewer_isolated_from_owner_workspace_wearing_reviewers_old_slug`, `test_reviewer_isolated_when_override_preempts_isolated_fallback_name`, `test_reviewer_workspace_pins_candidate_sha_despite_owner_drift` — all `ok`. | None. |
| Content correctness (new, beyond the three required items) | `_reviewer_candidate_commit` prefers `task.candidate_sha`, resolved via local object database, over the owner's live branch tip | New test `test_reviewer_workspace_pins_candidate_sha_despite_owner_drift` reproduces the original production incident directly: owner commits a candidate, hands it off (`candidate_sha` pinned), then keeps committing (a concurrent "CI repair") plus further uncommitted drift on the same branch. Reviewer workspace's `HEAD` and file content are pinned to the **pre-drift** `candidate_sha`, not the owner's later commits or dirty state — the property Round 1/2's empty-branch-off-`dev` design never actually delivered (see §6.2). | `python3 -B -m unittest test_supervisor.ExecutionWorkspaceTests.test_reviewer_workspace_pins_candidate_sha_despite_owner_drift -v` → `ok`. | Resolution is local-object-database only (no `git fetch`); if a `candidate_sha` has been pushed but the canonical root's local ODB doesn't yet have it for some other reason, falls back to the owner's branch tip rather than failing the dispatch. This mirrors the existing `_execution_branch`/`_remote_branch_exists` fallback pattern elsewhere in this file and was true of the pre-existing design too. |
| Full regression | All Round 1/2 `ExecutionWorkspaceTests` plus five new/updated tests above | No regressions across the whole orchestrator unit suite. | `python3 -B -m unittest test_supervisor -v` → 158 tests, OK. `python3 -B -m unittest test_watch_events -v` → 12 tests, OK. `python3 -B -m unittest test_runtime_module_boundaries -v` → 6 tests, OK. Combined: 176 tests, exit 0, Python 3.12.3, this worktree. | Not exercised against a live supervisor tick / real dispatch queue or GitHub PR/CI (VM services not started per task-spec constraint); unit-level only, same limitation as Rounds 1–2. |

- `watch_events.py` and `control_plane/domain/task_records.py` were re-inspected for Round 3 and
  still require no change, for the same reason as §2.3/§5.4: reviewer dispatches never render a
  branch-protocol block, and the review-guardrails block (`candidate_sha`-based, unchanged) already
  matches this round's design intent — it was the actual workspace *and* its rendered notice that
  needed to become detached-candidate-shaped, both fixed entirely inside `supervisor_runtime.py`.
- No product/UI/NAV source touched. No `.orchestrator` runtime services started or restarted on this VM.
- `ORCH_TASK_BRANCH` (env var stamped from `task_branch` metadata, `common.py:475-477`) is not
  consumed anywhere else in this repository (verified by repo-wide grep); for reviewer dispatches it
  now carries the resolved candidate commit SHA instead of a branch name, which is a strictly more
  precise identity and has no other in-repo reader to break.

## 7. Round 4 — R3-N1 / R3-N2 (Codex `reopen`, reviewed SHA `af509ef4b4499b6d83b304dfd8a3ab650f17e31e`)

### 7.1 Findings

Codex reopened candidate `af509ef4b` (PR #2114) confirming Round 3's F1/F1.a/F1.b are fixed, but
raised two new boundaries in the structural-isolation design itself (evidence snapshot
`.local/codex-review-isolation-r3-00AI8x`, probes `.local/codex-review-isolation-r3-00AI8x-probes.py`):

- **R3-N1 [P1]**: `_candidate_reviewer_worktree_path`'s reuse check (pre-fix:
  `_current_commit(candidate) == commit and not _worktree_is_dirty(candidate)`) never checked
  whether the path was still *detached*. If something attached a branch to an existing review
  workspace after it was created (e.g. an owner's `execution_branch` override happening to name a
  branch checked out there — the drift scenario Round 3 already anticipated in general but didn't
  close for this specific path), the workspace still "passed" the commit/clean checks and was handed
  back as `existing_review_worktree` with a branch attached — contradicting `attach_workspace_metadata`'s
  "no branch is checked out here" claim. Separately, the owner-side lookup
  (`ensure_execution_workspace`'s `_worktree_for_branch(repo_root, branch, exclude=repo_root,
  within=base)`, pre-fix) searched *all* of `base`, including `base/review/` — so once a reviewer
  workspace had that branch attached, an owner dispatch whose `execution_branch` override named the
  same branch resolved straight back to the reviewer's exact path, reintroducing the shared-mutable-
  worktree bug Round 3 was supposed to close by construction (`_reviewer_workspace_base` was meant to
  be a disjoint namespace the owner's allocator "can never write into" — true for *allocation*, but
  the *lookup* wasn't excluded from it).
- **R3-N2 [P2]**: `_reviewer_candidate_commit` (pre-fix) fell through silently from an unresolvable
  pinned `candidate_sha` to the owner branch tip, returning that substituted commit as if it were the
  reviewed candidate. `ensure_reviewer_review_workspace`/`attach_workspace_metadata` then reported the
  substitute as "Reviewing candidate `<substitute>`" — contradicting `watch_events.render_wakeup_message`'s
  fixed-candidate-SHA review guardrail, which always names the task's actual `candidate_sha`
  (`watch_events.py:361-367`, unchanged). A present, locked candidate that happens not to be locally
  resolvable is not equivalent to "no candidate pinned yet" and must never be treated as such.

Codex's exact reproductions (`ExecutionWorkspaceTests` fixtures + adversarial probes, real Git, no
mocks): task `IAM-SES-002`, owner `gemini`, reviewer `codex2`. R3-N1: a first reviewer dispatch
creates a clean detached review workspace; a `git checkout -b <owner's execution_branch>` inside that
*same disposable fixture* workspace simulates drift; a subsequent owner dispatch then resolved to
that exact reviewer path (`owner[0] == reviewer[0]`), and a further reviewer dispatch reused it too,
with the owner's later write immediately visible to the reviewer. R3-N2: a distinct valid candidate
commit created in a separate local clone (never fetched into the supervisor's repo) was pinned as
`candidate_sha`; the returned workspace silently resolved to the owner's locally-resolvable branch tip
instead, reported as the reviewed candidate.

### 7.2 Root cause

Round 3 closed collisions caused by *allocating* an owner or reviewer workspace into the wrong
namespace, but left two adjacent gaps: (1) the reuse check for an *existing* reviewer path verified
content (commit, cleanliness) but not the detachment invariant that "no branch checked out here" is
predicated on, and (2) the owner-side *lookup* (as opposed to allocation) was never taught that
`base/review/` is off-limits, so a reviewer path that had — through drift — acquired a branch was
still discoverable by the owner's branch search. Independently, `_reviewer_candidate_commit`'s
"fall back to owner tip" behavior was written for the *no-candidate-pinned-yet* case and was reused
unconditionally for the *pinned-but-unresolvable* case, which needs the opposite response (preserve
identity, don't substitute) rather than the same fallback.

### 7.3 Fix

`tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py`, same file/scope, no new
write-scope files needed:

- `_worktree_for_branch(...)` gains an `exclude_within: Path | None` parameter: any candidate whose
  path falls inside it is skipped. `ensure_execution_workspace`'s owner-side lookup now passes
  `exclude_within=_reviewer_workspace_base(base)`, so the reviewer namespace is structurally
  unreachable from the owner's branch search too — not just from allocation, closing the second half
  of R3-N1. The `--force` worktree-add fallback later in the same function (used to decide whether
  `git worktree add` needs `--force` because the branch is checked out *somewhere*) intentionally
  keeps searching the whole tree: if an owner's branch is genuinely stuck attached inside a drifted
  reviewer path, the owner still needs its own new worktree on that branch (`--force` permits two
  worktrees on one branch), without ever touching or reusing the reviewer's path.
- `_reusable_review_worktree(path, commit)`: new helper — true only when `path` is at `commit`, clean,
  **and** `_current_branch(path) is None` (still detached). Replaces the ad-hoc commit/clean check
  inline in both `_candidate_reviewer_worktree_path`'s reuse loop and
  `ensure_reviewer_review_workspace`'s existing-workspace short-circuit. A path that has had a branch
  attached no longer satisfies reuse; a fresh, distinctly-suffixed path is allocated instead and the
  drifted path is left completely untouched (same never-reset discipline as Round 3's dirty-content
  case).
- `_reviewer_candidate_commit` now returns `(commit, pin_unresolvable)` instead of a bare string. When
  a `candidate_sha` is pinned and doesn't resolve locally, it now attempts one `git fetch origin
  <sha>` and re-checks before giving up (satisfying the brief's "resolve via an authorized fetch"
  option); if still unresolved, it returns `(pinned_sha, True)` — the *pinned identity itself*, not
  "" and never a substituted owner tip. The owner-branch fallback is reached only when no
  `candidate_sha` was pinned at all (the original, still-correct "no candidate yet" case).
- `ensure_reviewer_review_workspace`: a new `if pin_unresolvable:` branch (checked before the existing
  `if not commit:` branch) logs a diagnostic activity-log entry naming the exact unresolvable SHA and
  returns `(repo_root, pinned_sha, base_branch, "unresolvable_pinned_candidate")` — never creating or
  reusing any workspace under that identity.
- `attach_workspace_metadata`: a new branch for `workspace_source == "unresolvable_pinned_candidate"`
  renders an honest notice naming the exact locked candidate SHA, states it could not be provisioned
  even after an attempted fetch, and instructs the dispatch to report `blocker`/`progress` rather than
  review anything — instead of falling into the generic "isolated review workspace could not be
  created" canonical-fallback message, which said nothing about *which* candidate was at stake.

Ordinary paths are unaffected: a reviewer path that stays clean and detached across repeated
dispatches (Round 3's already-passing `test_clean_detached_reuse`-equivalent case) still reuses it;
an ordinary same-repo `candidate_sha` handoff (Round 3's `test_reviewer_workspace_pins_candidate_sha_despite_owner_drift`)
still resolves on the first `rev-parse`, before the fetch attempt is ever reached.

### 7.4 Verification

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| R3-N1 / `reviewer_workspace_isolated_from_owner_successor` | `_worktree_for_branch` (`exclude_within` param) + owner lookup call site in `ensure_execution_workspace` | New test `test_reviewer_workspace_reuse_requires_detached_head` reproduces Codex's exact drift scenario in-repo (branch attached to an existing clean detached review workspace, then an owner dispatch whose override names that branch): owner now resolves to its own distinct new worktree (`created_worktree`), never the reviewer's path; the drifted review path is left untouched (branch/HEAD unchanged). | `python3 -B -m unittest test_supervisor.ExecutionWorkspaceTests.test_reviewer_workspace_reuse_requires_detached_head -v` → `ok`. Python 3.12.3, this worktree, real `git worktree add`/`checkout`, no mocks. | None. |
| R3-N1 / `rendered_branch_matches_assigned_review_workspace` | `_reusable_review_worktree` (detachment check) wired into both `_candidate_reviewer_worktree_path` and `ensure_reviewer_review_workspace`'s reuse short-circuit | Same test: a further reviewer dispatch after the drift does not reuse the branch-attached path — it allocates a new, genuinely detached workspace, so `attach_workspace_metadata`'s "no branch is checked out here" claim is asserted true (`_git(... "branch","--show-current")` == `""`) instead of silently false. | Same test run as above; also reran full `test_supervisor.ExecutionWorkspaceTests` (14 tests) → all `ok`, confirming Round 3's already-passing detached-reuse/dirty-drift cases are unaffected by the added detachment check. | None. |
| R3-N2 / fixed-candidate identity (not a listed required-acceptance key, but the review's explicit boundary) | `_reviewer_candidate_commit` (fetch-then-report-identity) + new `ensure_reviewer_review_workspace`/`attach_workspace_metadata` branches for `unresolvable_pinned_candidate` | New test `test_reviewer_pinned_candidate_unresolvable_preserves_identity` reproduces Codex's exact scenario (candidate committed only in a separate, never-fetched local clone): returned `(path, commit, source)` is `(repo_root, pinned_sha, "unresolvable_pinned_candidate")` — never the owner's resolvable branch tip; rendered notice contains the pinned SHA and not the owner tip SHA. | `python3 -B -m unittest test_supervisor.ExecutionWorkspaceTests.test_reviewer_pinned_candidate_unresolvable_preserves_identity -v` → `ok`. Same environment. | The one `git fetch origin <sha>` attempt is against whatever "origin" already resolves to in the dispatch's own repo; there is no live/reachable "origin" configured in this sandbox for either the unit tests or this repair, so the fetch path itself (as opposed to its failure handling) was exercised only via its fast local no-such-remote failure, not against a real remote that could actually serve the object. Production behavior when "origin" is real and the object is fetchable was not separately verified — same limitation the task-spec's "resolve via authorized fetch" alternative inherently has without a live remote in this environment. |
| `owner_successor_and_wip_preserved` | Owner code path reached only via the (now correctly `exclude_within`-scoped) branch lookup, unchanged otherwise | Owner dispatch still resumes its `execution_branch` override and existing worktree, with `git status --porcelain`/`HEAD` byte-identical before/after every reviewer dispatch in both new tests and all Round 1-3 tests. | Full `test_supervisor.ExecutionWorkspaceTests` run above; also `test_owner_dispatch_still_resumes_execution_branch_override` still `ok`. | None. |
| Full regression | All Round 1-3 tests (14 `ExecutionWorkspaceTests`, now 12→14 after the two new tests above) plus the rest of the orchestrator unit suite | No regressions. | `python3 -B -m unittest test_supervisor -v` → 160 tests, OK. `python3 -B -m unittest test_watch_events -v` → 12 tests, OK. `python3 -B -m unittest test_runtime_module_boundaries -v` → 6 tests, OK. Combined: 178 tests, exit 0, Python 3.12.3, this worktree (`.artifacts/worktrees/auto/claude2-sr-orch-review-worktree-isolation-20260923`), reviewed base `af509ef4b4499b6d83b304dfd8a3ab650f17e31e`. | Not exercised against a live supervisor tick, real dispatch queue, or GitHub PR/CI (VM services not started per task-spec constraint); unit-level only, same limitation as Rounds 1-3. Codex's own R3 probes (`.local/codex-review-isolation-r3-00AI8x-probes.py`) were re-run manually (with only their SHA-pinning guard assertion stripped, since it necessarily fails once the file changes) against this fix as an independent cross-check, not as part of the committed suite: both previously-failing cases (`test_attached_branch_drift_must_not_rejoin_owner`, `test_unavailable_pinned_candidate_must_not_substitute_branch_tip`) now pass alongside their own already-passing `test_clean_detached_reuse`/`test_dirty_and_head_drift_preserved`. |

- `watch_events.py` and `control_plane/domain/task_records.py` were re-inspected for Round 4 and
  still require no change: `render_wakeup_message`'s review guardrails already name
  `task.candidate_sha` directly from the task record (`watch_events.py:361`), independent of whatever
  `ensure_execution_workspace` resolves — the contradiction Codex found was purely in the *workspace*
  notice `attach_workspace_metadata` renders, now fixed entirely inside `supervisor_runtime.py`.
- No product/UI/NAV source touched. No `.orchestrator` runtime services started or restarted on this VM.
- `_repo_config` in `test_supervisor.py`'s `ExecutionWorkspaceTests` now also sets `paths.activity_log`
  (previously absent), because the new `pin_unresolvable` path calls `write_activity_log`, which raises
  `KeyError` without it — this is a test-fixture completeness fix, not a production-code behavior
  change (`write_activity_log`'s config contract was already unchanged from Round 1-3).
