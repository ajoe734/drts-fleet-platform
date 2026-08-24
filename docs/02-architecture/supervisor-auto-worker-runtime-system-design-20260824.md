# Supervisor / Auto Worker Runtime System Design (SD)

**Date:** 2026-08-24
**Status:** Implemented; verified 2026-08-24
**Scope:** Clean replacement design for supervisor and automatic worker lifecycle
**Baseline:** local `dev` at `cc2d9c9dd939fba9f5e9e5aae047e2fd9ac96f1d`
**Predecessor:** [Supervisor / Auto Worker Runtime System Analysis](./supervisor-auto-worker-runtime-system-analysis-20260824.md)

> This design intentionally reuses existing control-plane boundaries. It was implemented as a replacement: the superseded rules and unreachable adapters were deleted in the same change. Release and live-service evidence is recorded in the implementation result below.

---

## 0. 中文執行摘要

目標設計不是新增 AGY sidecar、watchdog 或 retry queue，而是替換現有重複路徑：

- Adapter 唯一來源改為 `providers.<lane>.delivery_mode`，刪除 `agents.*.adapter`。
- Supervisor 在 spawn 前建立並預先落盤既有 worker lease；所有 adapter 共用同一 run ID 與 env helper。
- Gemini/Gemini2 固定 AGY `gemini-3.1-pro-high`、`--effort high`，fallback 使用 `claude-sonnet-4-6` Thinking；Codex/Codex2 恢復 Codex CLI `gpt-5.6-terra`；未安裝 CLI 的 Copilot lane 移除。
- 既有 `update_from_log()` 改為唯一增量 observer；failure classifier 不再第二次讀 log。
- 只保留 `last_work_progress_at` 作為 600 秒 lease freshness；刪除 CPU/mtime progress 與 persisted `stalled/recovered`。
- Candidate/review/acceptance 既有 evidence 補 exact worker run provenance；刪除 status-only completion。
- Timeout/error 只進入現有 rotation、retry、reassignment；刪除 implicit file-inbox retry loop 與 `_FALLBACK_REAP_COUNTS`。
- Dashboard 只顯示 existing state 的 derived view，不新增 truth store。

實作分六個可驗證階段，每一階段都必須在加入新規則時同步刪除被替換的設定、函式、狀態、測試與不可達 adapter。若只加入新判斷而保留舊路徑，不符合本 SD 的完成條件。

## 1. Design principles

1. **One fact, one authority.** Adapter, run identity, progress freshness, terminal result, and retry ownership each have one source.
2. **Attempts are not tasks.** Worker state identifies an attempt; canonical task state identifies business workflow. Completion requires a verified relationship between them.
3. **Observation is not authority.** Provider logs can update worker observation but cannot directly mutate a canonical task.
4. **Liveness is not progress.** PID and CPU prove only that a process exists.
5. **Failure is explicit.** Invalid model, unavailable provider, timeout, and malformed terminal output enter the existing failure policy; none silently become manual work.
6. **Replacement includes deletion.** The old branch, setting, projection, and test are removed in the same implementation phase.
7. **No compatibility layer after a drained cutover.** The live runtime currently has no active workers or queue events, so old active-record semantics are not preserved.

## 2. Target topology

```text
SupervisorTickRunner
  -> provider capabilities (existing report)
  -> process_queue() (existing durable queue)
  -> start_worker_for_request()
       -> resolve providers.<lane>.delivery_mode
       -> allocate run_id
       -> pre-register worker lease in existing state.json
       -> adapter.deliver(request with run identity)
       -> existing spawn_background_process()
  -> poll_workers()
       -> update_from_log() once, incrementally
       -> normalize provider observation
       -> record meaningful progress through one helper
       -> handle explicit approval hold
       -> apply one 600-second lease rule
       -> classify one terminal outcome with exact-run evidence
       -> existing rotation / retry / reassignment
  -> existing runtime and dashboard projections

TaskBoardCommandExecutor
  -> validate worker-origin command against existing worker lease
  -> mutate existing canonical candidate lifecycle
  -> stamp exact run provenance on existing evidence
```

No component is added beside the existing supervisor. The target remains one process, one runtime state, one event queue, and the existing model-rotation cooldown store.

## 3. Decision summary

| ID     | Decision                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------- |
| `D-01` | `providers.<lane>.delivery_mode` is the only configured adapter selector.                             |
| `D-02` | `start_worker_for_request()` creates every worker run ID before adapter invocation.                   |
| `D-03` | `apply_orchestrator_runtime_env()` stamps all worker identity variables for every adapter.            |
| `D-04` | Automatic AGY runs use an explicit high model and unconditional `--effort high`.                      |
| `D-05` | Existing `update_from_log()` becomes the only incremental provider-log reader.                        |
| `D-06` | `last_work_progress_at` is the only worker lease freshness timestamp.                                 |
| `D-07` | The only work-progress timeout is 600 seconds; the AGY provider cap is two hours.                     |
| `D-08` | Persistent `stalled`/`recovered` worker states are removed.                                           |
| `D-09` | Candidate, review, and acceptance evidence record exact worker-run provenance.                        |
| `D-10` | One terminal classifier is used on every poll, including the first poll after restart.                |
| `D-11` | Automatic adapter failure never silently becomes `file_inbox`; explicit manual delivery still exists. |
| `D-12` | Existing rotation, retry, and reassignment are the only follow-up execution policies.                 |

## 4. Lane and provider design

### 4.0 Source ownership map

| Responsibility       | Existing source to modify                                                                      | Existing source to remove or reduce                       |
| -------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| adapter resolution   | `control_plane/runtime/supervisor_runtime.py`: `build_request()`, `start_worker_for_request()` | duplicate agent/provider fallback branches                |
| capability reporting | `provider_permissions.py`: `provider_capabilities()`                                           | mixed `agent.adapter or provider.delivery_mode` selection |
| model normalization  | `common.py`: `antigravity_rotation_config()`, `select_rotation_model()`                        | empty-primary/default-model semantics                     |
| run identity/env     | `start_worker_for_request()`, `common.py`: `apply_orchestrator_runtime_env()`                  | adapter-local run-ID creation and private env blocks      |
| AGY command          | `adapters/antigravity.py`: `AntigravityAdapter.deliver()`                                      | plain-output and one-hour default assumptions             |
| log observation      | `supervisor_runtime.py`: `update_from_log()`                                                   | second file read in `infra/worker_failure_detector.py`    |
| progress/lease       | `domain/worker_lifecycle.py`, `supervisor_runtime.py`: `poll_workers()`                        | CPU/mtime activity and persisted stall state              |
| process probes       | retain PID/termination probes in `infra/host_probes.py`                                        | CPU-as-progress probes only                               |
| canonical mutation   | `usecases/task_board_commands.py`, `bin/ai_status.py`                                          | status-only attempt inference                             |
| terminal outcome     | existing `finalize_exited_worker()` call site in `poll_workers()`                              | duplicate weak completion branches                        |
| retry/rotation       | existing retry, rotation, and reassignment functions                                           | process-local fallback reap breaker                       |
| projection           | `projections/control_plane_summary.py`, existing dashboard normalizer/view                     | persisted/independent stall truth                         |

This design does not introduce a new runtime package or service. Small pure helpers may be extracted only when they replace multiple existing branches and the original branches are deleted in the same phase.

### 4.1 Canonical lane mapping

| Lane      | Delivery mode | Runtime/model                          | Account isolation             |
| --------- | ------------- | -------------------------------------- | ----------------------------- |
| `claude`  | `claude_cli`  | `claude-sonnet-5`                      | existing Claude home/session  |
| `claude2` | `claude_cli`  | `claude-sonnet-5`                      | existing Claude2 home/session |
| `gemini`  | `antigravity` | `gemini-3.1-pro-high`, effort high     | `~/.gemini-ag2`               |
| `gemini2` | `antigravity` | `gemini-3.1-pro-high`, effort high     | `~/.gemini-ag3`               |
| `codex`   | `codex`       | `gpt-5.6-terra`                        | existing default Codex home   |
| `codex2`  | `codex`       | `gpt-5.6-terra`                        | `~/.codex2`                   |
| `copilot` | removed       | no local `copilot` binary is installed | not applicable                |

`copilot` must not remain named Copilot while running AGY. The host has valid GitHub CLI authentication but no `copilot` binary, so this design removes the lane, provider config, `copilot_local` registry entry/adapter, tests, and documentation references together. A future Copilot installation is a new explicit capability change, not a compatibility reason to retain unreachable runtime code.

### 4.2 Single adapter source

Target configuration shape:

```jsonc
{
  "agents": {
    "gemini": {
      "display_name": "Gemini",
      "provider": "gemini",
      "wake_template": "tools/development-orchestrator/templates/wakeup.txt",
    },
  },
  "providers": {
    "gemini": {
      "delivery_mode": "antigravity",
      "antigravity": {},
    },
  },
}
```

Required code alignment:

- `build_request()` reads `providers.<provider>.delivery_mode`.
- `start_worker_for_request()` builds `request.delivery_mode`, except an explicit internal `file_inbox` override.
- `provider_capabilities()` reads the same delivery mode and never combines it with `agents.*.adapter`.
- `watch_events`, request snapshots, activity logs, and dashboard projection receive the resolved value rather than resolving it independently.
- `agents.*.adapter` is deleted from live config, example config, schema/fixtures, and tests.

### 4.3 Remove inactive provider branches

After lane alignment:

- Remove `providers.gemini.gemini` and `providers.gemini2.gemini`; AGY owns these lanes.
- Remove `providers.codex.antigravity` and `providers.codex2.antigravity`; Codex CLI owns these lanes.
- Remove the full `agents.copilot` and `providers.copilot` configuration, including both Antigravity and unreachable local settings.
- Remove the ignored Gemini2 `model_preference` Flash Lite block.
- Delete `adapters/copilot_local.py`, its registry entry, tests, example settings, and documentation references after the lane configuration is removed.
- Delete the production-unreachable `adapters/gemini.py`, its registry entry, tests, example settings, and documentation references; Gemini/Gemini2 have one AGY implementation.
- Keep `ClaudeCodeAdapter` if it remains an inherited/manual implementation used by `ClaudeCLIAdapter`; indirect reachability counts as use.

## 5. AGY high-reasoning and command contract

### 5.1 Existing model-rotation mechanism remains

`antigravity.model_rotation` remains the only model selection and cooldown configuration. It is changed from fail-open to fail-closed:

```jsonc
{
  "antigravity": {
    "cli": "agy",
    "config_home": "~/.gemini-ag2",
    "skip_permissions": true,
    "include_directories": true,
    "print_timeout": "2h",
    "model_rotation": {
      "enabled": true,
      "primary": "gemini-3.1-pro-high",
      "fallback": "claude-sonnet-4-6",
      "cooldown_seconds": 900,
    },
  },
}
```

`antigravity_rotation_config()` remains the only normalizer. It must:

- reject an explicitly empty primary;
- reject configured IDs/labels that identify low or medium effort;
- normalize the fallback to its stable model ID;
- preserve the existing cooldown value and state file;
- provide no "use AGY default" semantic.

No separate model-policy object or file is introduced.

### 5.2 Command shape

Every automatic AGY command must have this invariant:

```text
agy
  --dangerously-skip-permissions
  [--sandbox when configured]
  --model <selected explicit high/thinking model id>
  --effort high
  --output-format stream-json
  --print-timeout 2h
  [--add-dir ...]
  --print <prompt>
```

`--print <prompt>` remains last because the installed CLI consumes its following argument as the prompt. `--input-format stream-json` is not used: the supervisor sends one prompt argument and does not maintain an NDJSON stdin session.

### 5.3 Model availability

- Deployment preflight runs read-only `agy models` once for each configured AGY home.
- Both configured model IDs must appear for that home.
- A failed preflight blocks promotion.
- The supervisor capability refresh reports configured model, fallback, effort, and selected rotation slot as derived fields but does not invoke `agy models` every tick.
- A runtime model-resolution failure enters existing provider failure/rotation/reassignment; it cannot downgrade to an implicit default.

## 6. Supervisor-owned run identity and lease

### 6.1 Run creation

`start_worker_for_request()` becomes the only attempt identity owner:

1. Resolve the provider and delivery mode.
2. Generate `run_id` once using the existing `new_runtime_id()` helper.
3. Build an existing worker record with status `started` and current queue/task/agent binding.
4. Persist that record through the existing runtime-state repository before spawn.
5. Pass the run identity to the selected adapter.
6. On successful spawn, update the same record with PID, command, log path, worker unit, and status `running`.
7. On delivery failure, finalize the same record and use existing failure policy.

Pre-registration closes the race in which a worker can call `ai-status` before its lease is visible. It does not create a new lease type or state file.

### 6.2 Request identity

The existing `DeliveryRequest` carries the supervisor-generated identity explicitly:

```text
run_id
queue_event_id
task_id
agent_id
provider
delivery_mode
```

Request snapshots preserve the logical task, message, target, context, metadata, queue event, and supervisor-owned run identity. A retry or rotation creates a new run ID and links it through the existing `parent_run_id`; it never reuses the failed attempt identity.

### 6.3 Common environment

`apply_orchestrator_runtime_env()` remains the only worker environment stamping entry and adds:

```text
ORCH_RUN_ID
ORCH_QUEUE_EVENT_ID
ORCH_TASK_ID
ORCH_AGENT_ID
ORCH_PROVIDER
AI_NAME
```

It continues to stamp canonical and workspace roots. Claude's private `ORCH_*` block is deleted; AGY, Codex, and Claude all invoke the same helper.

Adapter-local calls to `new_runtime_id()` are deleted. Worktree/event/evidence IDs that are not worker attempt IDs remain unchanged.

## 7. Canonical task mutation and exact-run evidence

### 7.1 Existing transaction remains

`TaskBoardCommandExecutor` remains the only task-board transaction boundary. Worker-origin mutations are recognized by `ORCH_RUN_ID` and validated before mutation:

- run exists in the existing runtime state;
- worker status is active for worker-origin mutation;
- `task_id` equals `ORCH_TASK_ID` and the lease task;
- actor/agent equals `ORCH_AGENT_ID` and the lease agent;
- queue event equals the lease queue event when a queue event exists;
- existing owner/reviewer command authorization still passes.

Commands without worker identity continue through existing operator/Supervisor role rules. `AI_NAME=Supervisor` is not reclassified as a worker merely because a source run ID is included for evidence.

### 7.2 Evidence provenance

Do not add a generic transition event system. Extend the existing candidate lifecycle evidence only:

| Existing evidence                    | Added provenance                                | Produced by         |
| ------------------------------------ | ----------------------------------------------- | ------------------- |
| `candidate_sha` / `candidate_branch` | `candidate_worker_run_id`                       | owner `handoff`     |
| `reviewed_sha` / review notes        | `review_worker_run_id`                          | reviewer `approve`  |
| `acceptance_evidence`                | `acceptance_worker_run_id` when worker-produced | `record-acceptance` |

`clear_candidate_evidence()` clears the associated run provenance whenever candidate evidence is invalidated. Existing activity log entries are enriched with `worker_run_id` for traceability, but the activity log remains noncanonical and is not the source of completion truth.

### 7.3 Exact completion rules

- Owner attempt: completion requires matching `candidate_worker_run_id` and a valid candidate lifecycle state/evidence.
- Reviewer attempt: completion requires matching `review_worker_run_id` and same-SHA review evidence.
- Acceptance attempt: completion requires matching `acceptance_worker_run_id` or the existing exact worker-result contract.
- Planning/coordination attempt: completion continues to require all declared output paths.
- Blocked/progress result: continue to use the existing run-scoped result path and immutable `outcome_id` consumption.
- If task evidence belongs to another run, classify the old run as `superseded`.
- A structured failure, timeout, or malformed terminal result prevents completed classification even when the task later advanced.

The two current status-only branches in `finalize_exited_worker()` are removed, including the fresh task reread that repeats the same weak rule.

## 8. Provider observation design

### 8.1 One reader

Keep `update_from_log()` as the only provider-log reader and replace its full-file behavior with incremental reads. Existing worker state stores:

```jsonc
{
  "log_offset_bytes": 12345,
  "last_work_progress_at": "2026-08-24T00:00:00Z",
  "provider_terminal_status": "success|failure|null",
  "provider_terminal_reason": null,
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "thinking_tokens": 0,
    "total_tokens": 0,
  },
}
```

These fields extend the existing worker attempt record; no new file or database is created. The reader advances the byte offset only through the last complete newline, so partial JSON lines are reread safely without a second persistent buffer.

### 8.2 Provider normalization

The observer normalizes existing provider shapes:

| Provider              | Input shape                       | Relevant evidence                                                    |
| --------------------- | --------------------------------- | -------------------------------------------------------------------- |
| AGY                   | JSON object with `event`          | command/tool activity, final `result.status`, conversation ID, usage |
| Claude                | stream JSON object with `type`    | session, assistant/tool/result, deferred approval, errors            |
| Codex                 | existing log/result-file contract | command progress, result payload, error/terminal evidence            |
| unstructured fallback | text line                         | existing URL/session extraction and narrow failure patterns          |

The current failure detector stops reading files. It becomes a pure classifier of the normalized observation already stored on the worker. Metadata extraction, failure detection, progress detection, and terminal detection therefore share one I/O pass without becoming one large policy function.

### 8.3 Meaningful progress

One helper, located with existing worker lifecycle rules, updates `last_work_progress_at`. Valid progress is limited to:

- provider turn accepted or provider state advanced;
- tool invocation started or completed;
- new non-empty assistant output;
- exact canonical task transition by the same run;
- terminal result received.

The following never refresh progress:

- PID is alive;
- CPU ticks or cgroup CPU usage changed;
- supervisor heartbeat advanced;
- log mtime changed;
- usage-only duplicate event;
- repeated identical spinner/status event;
- dashboard or projection write.

`last_event_at` remains for lifecycle ordering, terminal history, trimming, and dashboard chronology. It is no longer consulted for lease freshness.

## 9. Lease, approval, and timeout design

### 9.1 One work-progress timeout

Replace `supervisor.stall_after_seconds` with:

```jsonc
{
  "supervisor": {
    "worker_progress_timeout_seconds": 600,
  },
}
```

The timeout applies only to actively executing `started`/`running` attempts. It does not create a persisted `stalled` status.

```text
fresh meaningful progress
  -> running

600 seconds without meaningful progress
  -> terminate through existing worker termination function
  -> classify reason as work_progress_timeout
  -> existing model rotation / retry / reassignment
```

There is no five-minute warning state and no second ten-minute kill timer. A dashboard may derive an age or warning color from the same timestamp and timeout, but that view cannot write worker status.

### 9.2 Two-hour AGY cap

`--print-timeout 2h` is the provider request ceiling, not a third supervisor timer. A worker may run toward that ceiling only while meaningful events keep its 600-second lease fresh.

### 9.3 Explicit holds

Existing approval handling remains before lease expiry:

- `waiting_approval` or `suspended_approval` with a matching approval record is an explicit hold and does not consume the running-work lease.
- approval resolution resumes through the existing Claude resume path.
- missing/stale approval records are reconciled by existing approval cleanup and terminal logic, not by a new hold flag.
- `retry_backoff` uses its existing retry timestamp and is not evaluated as running work.
- explicit `manual_pending` is manual delivery, not a live process.

## 10. Terminal classifier

One classifier supplies a decision; existing effect functions terminate, finalize queue records, rotate, retry, reassign, or write activity. Polling and the first post-restart tick call the same classifier because both already enter `poll_workers()`.

Decision precedence:

```text
1. worker already terminal -> no-op
2. explicit approval hold -> hold/resume path
3. assignment moved or newer exact run owns task -> superseded
4. structured provider failure/error/timeout -> failure policy
5. live process with fresh progress -> running
6. live process with expired progress -> timeout failure policy
7. dead process with exact run evidence -> completed
8. dead planning/coordination process with declared outputs -> completed
9. dead process with valid run-scoped blocked/progress result -> consume existing result
10. otherwise -> premature-exit failure policy
```

Boot reconciliation does not receive a separate completion/failure implementation. An unclean supervisor restart reloads the same worker records and invokes this order on the next normal poll.

## 11. Retry, rotation, reassignment, and fallback

### 11.1 Follow-up paths retained

- `retry_due_workers()` remains the durable retry-backoff executor.
- Antigravity model cooldown and `maybe_rotate_antigravity_lane()` remain the quota/capacity model switch.
- Existing worker reassignment remains the lane switch after configured failure attempts.
- All follow-up attempts call the same `start_worker_for_request()` and receive a new exact run ID.

No claim is made that these policies are one queue: they are distinct existing policies, but they share one dispatch/spawn boundary and no new AGY policy is added.

### 11.2 Implicit inbox fallback removed

Automatic CLI lanes must not turn adapter/auth/model failure into a manual-pending inbox attempt. Target behavior:

- capability is known unavailable before dispatch: existing dispatcher selects another eligible lane or leaves the durable event pending according to current policy;
- capability disappears between probe and spawn: adapter returns a structured delivery failure;
- delivery failure: existing retry/rotation/reassignment handles it;
- `FileInboxAdapter` remains available only when delivery is explicitly configured or deliberately overridden as manual.

This makes `_FALLBACK_REAP_COUNTS`, `fallback_reap_redispatch_cap`, `fallback_reap_capped_logged`, and the entire reap/redispatch oscillation branch unnecessary; they are deleted rather than migrated.

## 12. Runtime state and dashboard

### 12.1 Existing state authority

`.orchestrator/state.json` remains the only worker-attempt state. New observation fields are part of the existing worker record. Existing fields remain where their meaning is valid:

- keep `last_event_at` for history and ordering;
- keep `run_id`, `parent_run_id`, task/agent/queue binding, PID, command, paths, retry metadata, and terminal result fields;
- add only log offset, semantic progress timestamp, normalized terminal observation, and observational usage;
- remove CPU-progress fields and stall-only fields.

### 12.2 Dashboard projection

The existing projection reports:

- configured and effective adapter;
- configured model, fallback, and effort;
- rotation slot;
- `last_work_progress_at` and derived progress age;
- terminal status/reason and usage when present;
- exact run/task/queue identity.

It must not persist a derived stalled state or infer completion from display status. Provider usage is per-run telemetry, not billing truth.

## 13. Mandatory deletion matrix

| Area             | Delete/replace                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| adapter config   | `agents.*.adapter` and duplicate resolver fallbacks                                                                                                                                                        |
| provider config  | inactive Gemini/Codex/Copilot adapter blocks and ignored Flash Lite preference                                                                                                                             |
| run identity     | adapter-local worker `new_runtime_id()` calls and Supervisor post-spawn fallback run ID                                                                                                                    |
| environment      | Claude/Copilot private `ORCH_*` blocks                                                                                                                                                                     |
| AGY model        | empty-primary semantics and display-name fallback                                                                                                                                                          |
| AGY output       | plain-output assumption                                                                                                                                                                                    |
| log I/O          | full-file reread in `update_from_log()` and file reread in failure detector                                                                                                                                |
| progress         | `last_process_activity_at`, `process_tree_cpu_ticks`, `worker_process_tree_cpu_ticks()`, `worker_unit_cpu_usage()`, `observe_worker_process_activity()`, and `worker_last_activity_at()` progress fallback |
| stall            | `stall_after_seconds`, persisted `stalled`, `worker_stalled`, `worker_recovered`, and two-stage timeout branches                                                                                           |
| completion       | both task-status-only completed branches and their race-covering fresh reread                                                                                                                              |
| fallback         | `_FALLBACK_REAP_COUNTS`, fallback cap setting/field/events, implicit auto-worker inbox recovery loop                                                                                                       |
| tests            | tests asserting CPU prevents timeout, log mtime is progress, weak task status completes a worker, or fallback counters stop oscillation                                                                    |
| unreachable code | direct Gemini adapter, Copilot lane/adapter, and all associated registry/config/test/doc references                                                                                                        |

Historical JSON records are not rewritten. Readers tolerate absent new fields for terminal history, but no active legacy attempt compatibility path is retained.

## 14. Implementation phases

Each phase must leave tests green and remove the old path it replaces.

### Phase 1: configuration and identity authority

- Make provider delivery mode the only adapter source.
- Restore lane/provider mapping.
- Move run ID allocation and pre-registration into `start_worker_for_request()`.
- Centralize worker environment stamping.
- Delete duplicate adapter/env/run-ID logic.

**Checkpoint:** command construction tests prove displayed lane, binary, configured model, run ID, and env are aligned for every lane.

### Phase 2: AGY quality and structured output

- Enforce explicit high-reasoning primary/fallback.
- Add `--effort high`, stream-json, and two-hour timeout.
- Remove empty/default model behavior and ignored model preferences.
- Add AGY command/result/usage fixtures from verified CLI 1.1.19 shapes.

**Checkpoint:** no automatic AGY command can be constructed without an explicit accepted high/Thinking model.

### Phase 3: single observation and progress lease

- Convert `update_from_log()` to incremental observation.
- Make failure detection consume normalized observation.
- Add one meaningful-progress helper.
- Replace two-stage stall with one 600-second lease expiry.
- Delete CPU/mtime/stalled/recovered logic and tests.

**Checkpoint:** each appended log byte is parsed at most once and only valid events refresh the lease.

### Phase 4: exact-run terminal outcome

- Validate worker-origin task mutations against the existing lease.
- Add run provenance to existing candidate/review/acceptance evidence.
- Implement one terminal classifier.
- Delete status-only completion and duplicate fresh-read branch.

**Checkpoint:** exact run completes; another run supersedes; provider error always overrides completion.

### Phase 5: retry/fallback and reachability cleanup

- Route adapter/model failure into existing follow-up policies.
- Restrict file inbox to explicit manual delivery.
- Delete process-local fallback reap breaker.
- Remove the direct Gemini and Copilot adapters/config/tests/docs identified by the completed reachability audit.

**Checkpoint:** no non-durable counter or AGY-specific retry path can launch or suppress a follow-up attempt.

### Phase 6: projection, full verification, and promotion

- Update existing provider/control-plane/dashboard projections.
- Add architecture source guards.
- Run focused and full development-orchestrator tests.
- Build one candidate release and perform a drained promotion.

**Checkpoint:** one service instance runs the candidate release and state/dashboard agree on every controlled probe.

## 15. Verification plan

### 15.1 Unit and integration tests

- AGY command contains explicit model, `--effort high`, stream-json, and `2h`; prompt remains last.
- Empty, low, and medium AGY selections fail before spawn.
- All configured AGY homes pass release-time model preflight.
- Supervisor creates one run ID and every adapter receives/stamps it.
- Worker-origin mutation is rejected for unknown, terminal, wrong-task, or wrong-agent lease.
- Incremental parser handles multiple lines, partial final line, malformed line, replay, truncation/rotation, and no-new-byte poll.
- AGY `command_result` and final `result` normalize correctly.
- CPU, PID, heartbeat, mtime, duplicate usage, and spinner events do not refresh progress.
- Meaningful provider/tool/output/task events refresh through one helper.
- Running attempt is alive at 599 seconds and expires once at 600 seconds.
- Explicit approval hold does not enter progress timeout.
- Timeout enters existing rotation/retry/reassignment with no duplicate spawn.
- Exact owner/reviewer/acceptance run completes.
- Evidence from another run produces superseded.
- Structured error/timeout overrides task status.
- First poll after unclean restart uses the same classifier.
- Manual operator task command remains valid without worker identity.
- Explicit file inbox remains manual; automatic adapter failure never creates manual-pending fallback.

### 15.2 Architecture guards

Source-level tests must assert:

- one configured adapter authority;
- one worker run-ID allocation site;
- one common worker identity env helper;
- one AGY adapter spawn route;
- one provider-log read path;
- one meaningful-progress update helper;
- one terminal classifier;
- no `stall_after_seconds` or process-activity progress symbols;
- no fallback reap counter/cap;
- no new queue, state file, PID file, daemon, monitor, or supervisor service;
- no active config with blank/low/medium AGY model;
- Claude, Codex, and AGY all use the same supervisor lifecycle.

### 15.3 Test scope

Run development-tooling tests only for this change. Product application tests and Cloud Run product rollout are outside scope unless a changed shared file demonstrably affects them.

## 16. Promotion and rollback

### 16.1 Promotion

1. Implement in a clean dedicated worktree based on current `origin/dev`; do not alter unrelated dirty product/evidence files.
2. Confirm active workers, queue events, and approvals are zero before cutover.
3. Validate all lane binaries, identities, configured models, and AGY model availability.
4. Build through the existing orchestrator release process.
5. Update live config atomically with the release; remove old keys rather than retaining aliases.
6. Move the existing active release pointer to the candidate.
7. Restart the one existing `drts-supervisor.service` once.
8. Verify one PID, active release target, heartbeat, canonical roots, provider report, and absence of old config keys.
9. Run controlled worker probes for AGY success, exact completion, timeout/retry, and superseded behavior.
10. Monitor activity/state for duplicate spawn, stale manual pending, false completion, and projection drift.

### 16.2 Rollback

- Restore the prior active release pointer and its matching config snapshot.
- Restart the same service once.
- Do not start a second supervisor.
- Worker observation fields are additive and safe for the prior reader to ignore.
- Rollback is allowed only before new exact-run work is intentionally accepted as canonical evidence; otherwise reconcile those attempts explicitly rather than pretending they never ran.

## 17. Completion criteria

The refactor is complete only when all of the following are true:

- Every lane name matches its actual binary, account, adapter, and model.
- Every AGY run is explicit high reasoning and no implicit default exists.
- One observation pass owns provider log I/O.
- One semantic timestamp owns work-progress freshness.
- One lease rule owns timeout termination.
- One exact-run classifier owns terminal status.
- Existing retry, rotation, and reassignment are the only follow-up paths.
- Implicit file-inbox fallback and its process-local breaker are gone.
- Replaced settings, functions, states, projections, tests, and unreachable adapters are deleted.
- The live service runs one promoted release and passes controlled runtime verification.

Anything less is a partial patch and must not be described as the completed architecture replacement.

## 18. Implementation result

The design has been applied without adding a daemon, watchdog, queue, database, state file, or supervisor instance. The runtime source and active configuration now satisfy the ownership table and deletion rules above. The full development-orchestrator suite completed with `757` tests passing; the remaining release pointer, service restart, and live smoke evidence are recorded at promotion time.
