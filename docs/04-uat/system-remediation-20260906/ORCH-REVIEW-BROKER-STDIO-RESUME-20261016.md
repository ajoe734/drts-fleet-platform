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

### Finding 3 (F1, review reopen) — out-of-scope hardening caps added by the inherited `59092d56a` fix

Reviewer Codex reopened candidate `bc53df8551dd13ccfe0da67e35d9a2074d6efb75`
(generation `9014305af5994c2c963873dce8791687`) against the authoritative spec
`.local/passenger-transport-bureau-review-20261015/ORCH-REVIEW-BROKER-STDIO-RESUME-20261016-R2-actual-native-roles.json`
and the explicit scope-evidence file
`.local/passenger-transport-bureau-review-20261015/actual-broker-WIP-new-frame-limit-outside-user-functional-scope-normal-evidence.json`,
which records the user's direct instruction ("你不要去加強什麼安全機制喔，老老實實地補上功能缺項就好了" —
do not add security hardening, just fix the actual functional gap). Finding 1
above incorrectly treated `claude_permission_prompt_mcp.py` as fully settled
by `59092d56a` (PR #2653); in fact that fix bundled in four arbitrary
resource-limit/hardening additions that were never part of the original
pre-#2653 entrypoint and are not required to make standard JSONL transport or
legacy Content-Length framing work: `MAX_MESSAGE_BYTES` (1 MiB frame cap),
`MAX_HEADER_BYTES` (8192-byte header cap), rejection of duplicate legacy
header keys, and a 10-digit cap on the `Content-Length` value string. Flagged
file sha256 `904e67b81b353a33e2d51fd3da6ad6940d0a3360bcce3ae3e4771ea8068359a4`
(`claude_permission_prompt_mcp.py:34-35,42-45,61-74` in that revision).

Repair: removed exactly those four additions and the `_line(limit)`
byte-counting machinery that existed only to enforce them, and the one
duplicate-header test case plus the whole `test_size_limits_...` hardening
test from `test_claude_permission_prompt_mcp.py` (kept the
framing-cannot-switch-mid-session half of that test, renamed
`test_framing_cannot_switch_mid_session`, since that is protocol correctness,
not a size/hardening cap). Fixed file sha256
`d75f5d291ff41a7c3deab772db1e07d2b388b07ccb2400d67a0f3f8a6caf88c7`. Kept
unchanged: the dual legacy/JSONL auto-detect, the "unterminated line" EOF
check (not flagged — lines 46-48 of the flagged revision, outside the
reviewer's 42-45/61-74 ranges), `isdigit()`/positive-length validation on
`Content-Length` (rejects non-numeric/negative/zero — original protocol
correctness, not a resource-exhaustion guard), truncated-body detection, the
`main()` try/except that turns transport errors into a clean stderr message
instead of a traceback, and every original permission decision / queue
contract path.

Before/after probe (minimal production-parser comparison, no copied parser
logic; load each revision's module via `compile`/`exec` and call
`StdioCodec(...).read_message()` directly on a crafted frame):

| Probe | Old (flagged, `904e67b8...`) | New (fixed, `d75f5d29...`) |
| --- | --- | --- |
| Legacy-framed JSON ping with a 1 MiB+ `params.padding` string, correct `Content-Length` | `ValueError: invalid content length` (rejected a valid, just-large message) | Parses, returns the `ping` message |
| `Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}` (duplicate header, same value) | `ValueError: invalid legacy header` | Parses `{}` (last value wins, same as any ordinary dict-overwrite header parser) |
| `Content-Length: 2\r\nX: ` + 8192 `x` bytes + `\r\n\r\n{}` (oversized but well-formed extra header) | `ValueError: frame limit exceeded` | Parses `{}` |

Regression after the repair (same isolated worktree, `tools/development-orchestrator`):

```
python3 -m unittest test_approval_queue test_claude_permission_prompt_mcp -v
```
Result: 15 pass, exit 0, 3.3s.

```
python3 -m unittest discover -s . -p 'test_*.py'
```
Result: 1053 pass, exit 0, 36.9s. (Same expected mocked
`RuntimeError: boom` fault-injection traceback and benign subprocess
`ResourceWarning` as before — not failures.)

Acceptance keys addressed by this repair:
`orch-review-broker_standard-stdio-and-resumable-alias-source-proof` (the
transport now matches the spec's "no new security hardening" constraint, not
just "JSONL works") and `orch-review-broker_actual-existing-entrypoint-connection-restored`
remains a Root/Supervisor/Codex action outside this worker's write scope, not
claimed here — unchanged from Finding 1/2's note above.

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

### Finding 4 (F2, review reopen) — Finding 3's instruction to remove the caps was itself wrong; caps restored

Reviewer Codex reopened candidate `2a6a25931912d1a8b3dcc4e65ef1f402f02e6b55`
(generation `9a076e8a37df4356b6f58b1d3f4ce794`) against the authoritative
`task_spec_ref`
`.local/passenger-transport-bureau-review-20261015/ORCH-REVIEW-BROKER-STDIO-RESUME-20261016-R2-actual-native-roles.json`,
whose acceptance source-proof explicitly prohibits guard relaxation, and the
superseding read_dep
`.local/passenger-transport-bureau-review-20261015/actual-broker-superseding-correction-accepted2653-baseline-versus-stale-installed-entrypoint.json`.
That read_dep corrects the baseline Finding 3 relied on and supersedes
`actual-broker-WIP-new-frame-limit-outside-user-functional-scope-normal-evidence.json`:
the canonical `ORCH-CLAUDE-MCP-STDIO-FRAMING-20261015` task is independently
confirmed `done`/accepted (candidate `552c623c310c21ff0ed60d974eea6283e7b1e0bc`,
reviewer Codex2, green same-SHA CI, merge
`59092d56a3a0e2ad85ee00fa13500a20cd3b29cf` / PR #2653, all three of its
acceptance keys satisfied). `git show`/sha256 comparison proves the production
`claude_permission_prompt_mcp.py` blobs at accepted `552c623c...`, merge
`59092d56a...`, and this task's own base `b726c5cd08c932502d768e5766bbdf4753e4a1f4`
are identical (`904e67b81b353a33e2d51fd3da6ad6940d0a3360bcce3ae3e4771ea8068359a4`).
In other words, `MAX_MESSAGE_BYTES`, `MAX_HEADER_BYTES`, duplicate legacy
header rejection, and the 10-digit `Content-Length` cap are not hardening
bolted onto a narrower accepted fix — they are the accepted, reviewed, CI-green,
merged `#2653` behavior itself. Finding 3's instruction to delete them (acted
on in `2a6a25931`) was a regression against an already-accepted baseline, not
a continuation of the original functional repair; the user's "no new security
hardening" instruction that Finding 3 invoked does not authorize removing
controls that were already accepted and merged before this task started.

Repair: reverted `tools/development-orchestrator/claude_permission_prompt_mcp.py`
and `tools/development-orchestrator/test_claude_permission_prompt_mcp.py`
exactly to their `b726c5cd0` content (`git show b726c5cd0:<path>` written back
over the `2a6a25931` state; `diff` against `git show b726c5cd0:<path>` is
empty for both files). `approval_queue.py`, `test_approval_queue.py`, and the
Claude2 resumable-alias repair from Finding 2 / `bc53df855` are preserved
unchanged — this repair touches only the two files Finding 3 wrongly edited.

Read-only production-parser probe (same method as Finding 3's table: load the
real module via `compile`/`exec` with its genuine `__file__`, call
`StdioCodec(...).read_message()` directly, no copied/mocked codec), five
frames against the restored module:

| Frame | Restored result |
| --- | --- |
| Legacy-framed JSON `ping` with correct `Content-Length` for a 1 MiB+ `params.padding` | `ValueError: invalid content length` (exceeds `MAX_MESSAGE_BYTES`) |
| `Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}` (duplicate header) | `ValueError: invalid legacy header` |
| `Content-Length: 2\r\nX: ` + 8192 `x` bytes + `\r\n\r\n{}` (oversized header) | `ValueError: frame limit exceeded` |
| `Content-Length: 00000000002\r\n\r\n{}` (11-digit length) | `ValueError: invalid content length` |
| Same oversized JSON `ping` plus a trailing newline | `ValueError: invalid content length` |

All five now reject, matching `b726c5cd0`/accepted-`#2653` behavior and
reversing `2a6a25931`'s regression (which accepted all five). A normal
sequential UTF-8 JSONL `initialize`/`initialized`/`tools/list`/`ping` sequence
still parses cleanly on the restored module (4/4 messages).

Regression after this repair, from `tools/development-orchestrator`:

```
python3 -m unittest test_approval_queue test_claude_permission_prompt_mcp -v
```
Result: 15 pass, exit 0, 4.036s.

```
python3 -m unittest discover -s . -p 'test_*.py'
```
Result: 1053 pass, exit 0, 46.467s. (Same expected mocked `RuntimeError: boom`
fault-injection traceback and benign subprocess `ResourceWarning` noted in
Finding 3 — not failures.)

Acceptance keys addressed by this repair:
`orch-review-broker_standard-stdio-and-resumable-alias-source-proof` — the
transport now matches the accepted `#2653` baseline exactly (byte-for-byte
identical source), superseding Finding 3's incorrect "remove the caps" reading
of that same key; `orch-review-broker_actual-existing-entrypoint-connection-restored`
remains a Root/Supervisor/Codex action outside this worker's write scope, not
claimed here — unchanged from Finding 1/2/3's note above.

This disposition does not erase Finding 3: Finding 3's own repair step
(delegating the Claude2 alias prune to `worker_supports_approval_resume`) was
correct and is kept; only its "remove the stdio caps" action is reversed here
because it was based on a stale/incorrect reading of what `#2653` already
established as the accepted baseline.
