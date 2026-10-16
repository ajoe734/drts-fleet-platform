# ORCH-REVIEW-BROKER-STDIO-RESUME-20261016

Owner: Claude (availability-first reassignment from the task spec's original
Codex owner; Codex is reviewer). Base `dev` at `b726c5cd08c932502d768e5766bbdf4753e4a1f4`.
task_spec_ref: `.local/passenger-transport-bureau-review-20261015/ORCH-REVIEW-BROKER-STDIO-RESUME-20261016.json`.

## Findings and repair boundary

The task spec names two independent functional defects in
`tools/development-orchestrator/claude_permission_prompt_mcp.py` and
`tools/development-orchestrator/approval_queue.py`. Before changing anything,
this task re-ran both actual probes/evidence against the current `dev` tip
rather than trusting the stale timestamps in the supplied evidence files,
because the canonical root that produced them (`.local/.../actual-existing-permission-MCP-standard-JSONL-versus-legacy-framing-reproduction.json`,
`.local/.../actual-E04-original-Claude2-review-approval-broker-and-alias-prune-qualified-blocker.json`)
was checked out at `bea50bbf7`, behind `dev`.

### Finding 1 — standard stdio JSONL framing

Already fixed on `dev` by `59092d56a` ("ORCH-CLAUDE-MCP-STDIO-FRAMING-20261015:
repair approval MCP stdio framing", PR #2653), which landed between the
canonical root's stale `bea50bbf7` checkout and the current `dev` tip. The
supplied evidence file's sha256 (`c2262770ba043681c96f6a9af2f4282c734490f28524635d1d2fac658e9c0276`)
matches the pre-fix content at that stale checkout, not the current
`tools/development-orchestrator/claude_permission_prompt_mcp.py`
(`904e67b81b353a33e2d51fd3da6ad6940d0a3360bcce3ae3e4771ea8068359a4` at `dev`
tip). No further code change is required for this finding; this task reproduces
the restored behavior independently below and leaves
`claude_permission_prompt_mcp.py` untouched.

### Finding 2 — Claude2 resumable alias pruned on worker exit

Confirmed still present at `dev` tip (file untouched since the 2026-09
`ORCH-RUNTIME-CONVERGE-001` layout move). `approval_queue.py:_orphaned_worker_note`
only recognized `worker.get("provider") == "claude"` before treating a
`waiting_approval`/`suspended_approval` worker's session as resumable; the
canonical resumability predicate `worker_supports_approval_resume` in
`control_plane/domain/worker_lifecycle.py:216` (used by the supervisor runtime
itself at `supervisor_runtime.py:5373` and `:5441`) instead accepts any
provider name that `startswith("claude")`, which includes `claude2`. Because
`_orphaned_worker_note` had its own narrower copy of that rule, an exited
Claude2 worker's pending approval was auto-pruned to `deny` even with a live
`session_id`, matching the supplied `actual_auto_pruned_operations` evidence
(approvals `apr-20261016T035624Z-77d07b5e`, `apr-20261016T041948Z-99f92786`,
`apr-20261016T042007Z-9565d55c`, all `worker_run_id` prefixed `claude2-`).

Repair: `approval_queue.py` now imports and calls the existing
`worker_supports_approval_resume` helper instead of re-implementing the
provider check, so the prune path stays in sync with the one already used for
resumption in the supervisor runtime. No new provider allowlist, timeout, or
permission mechanism was added; non-resumable dead workers (no session/resume
token) and workers with missing state are still pruned exactly as before.

## Verification ledger

| Finding / required acceptance | Source and repair | Old → new | Command / evidence | Pending limitation |
| --- | --- | --- | --- | --- |
| Standard stdio JSONL initialize produces no response with stdin open | `claude_permission_prompt_mcp.py` `StdioCodec` (fixed by prior `59092d56a`, this task verifies only) | Stale-root probe (sha256 `c2262770...`): standard JSONL initialize got no response with stdin open; legacy Content-Length got an immediate response. `dev`-tip subprocess probe below: standard JSONL `initialize`/`notifications/initialized`/`tools/list`/`ping` over one held-open stdin all return single-line UTF-8 JSONRPC with no stdout contamination | Local subprocess probe (same shape as `test_response_arrives_before_stdin_eof`), see transcript below. Existing suite `test_claude_permission_prompt_mcp.py`: 9/9 pass | None — this is production-path verification of an already-merged fix, not new code |
| Resumable Claude/Claude2 alias survives exited-process prune; non-resumable dead/orphan still pruned | `approval_queue.py:_orphaned_worker_note` now delegates to `control_plane.domain.worker_lifecycle.worker_supports_approval_resume` | Old `_orphaned_worker_note` (pre-fix, reproduced via `git show HEAD:...` extracted copy run standalone): `claude2` worker with `session_id`, status `waiting_approval`, dead pid → pruned/denied. New: same fixture → kept pending. New `claude2` worker with no `session_id`/`resume_token`, dead pid → still pruned/denied (unchanged) | `python3 -m unittest test_approval_queue -v`: 6/6 pass, including new `test_keeps_pending_approval_when_claude2_alias_worker_can_resume_session` and `test_prunes_pending_approval_when_claude2_worker_has_no_session_and_is_dead`. Old-code reproduction run standalone against the pre-edit file content (not committed) confirmed the bug: `pruned: [...decision: 'deny'...]` for the same claude2/session fixture | Reproduction of the old defect used an extracted copy of the pre-edit file run out-of-tree, not a reverted working tree, per the no-reset-active-worktree rule |
| `orch-review-broker_actual-existing-entrypoint-connection-restored` | No Root dirty-tree edits made; only this isolated task worktree was touched | N/A — this task performs no Root installation/restoration step | Full orchestrator suite from `tools/development-orchestrator`: `python3 -m unittest discover -s . -p 'test_*.py'` — 1053 tests pass, exit 0, 46.151s | Root-side entrypoint restoration/installation receipt and the independent-reviewer connection check are Root/Supervisor/Codex actions outside this worker's write scope; not claimed here |

## Check results and reproducibility

Run from `tools/development-orchestrator` in this task's isolated worktree:

```
python3 -m unittest test_approval_queue test_claude_permission_prompt_mcp -v
```

Result: 15 tests pass, exit 0, 8.023s.

```
python3 -m unittest discover -s . -p 'test_*.py'
```

Result: 1053 tests pass, exit 0, 46.151s. (Includes an expected mocked
`RuntimeError: boom` traceback from `test_supervisor.py` fault-injection and a
`ResourceWarning: subprocess ... is still running` from a test's own
short-lived child process already exited by the time it was checked; neither
indicates a real failure or a started product/runtime service.)

Standard-stdio production-path probe (held-open stdin, single process,
`tools/development-orchestrator/claude_permission_prompt_mcp.py` unmodified):

```
initialize resp: {"jsonrpc": "2.0", "id": 1, "result": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "orchestrator_approval_broker", "version": "0.1.0"}}}
tools/list resp: {"jsonrpc": "2.0", "id": 2, "result": {"tools": [{"name": "approval_prompt", ...}]}}
ping resp: {"jsonrpc": "2.0", "id": 3, "result": {}}
exit code: 0
stderr: (empty)
```

Only repository Python unit checks ran on this VM. No product, browser, PG,
or Docker Compose runtime was started. Full system acceptance and Root
entrypoint restoration are outside this write scope and NOT claimed here.
