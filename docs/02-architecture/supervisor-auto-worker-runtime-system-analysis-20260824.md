# Supervisor / Auto Worker Runtime System Analysis (SA)

**Date:** 2026-08-24
**Status:** Implemented; verified 2026-08-24
**Scope:** Development orchestrator supervisor, auto-worker lanes, AGY runtime observation, worker lease, terminal classification, retry/reassignment, and dashboard projection
**Baseline:** local `dev` at `cc2d9c9dd939fba9f5e9e5aae047e2fd9ac96f1d`
**Live release:** `.artifacts/releases/orchestrator-7620ddb2c`
**Companion SD:** [Supervisor / Auto Worker Runtime System Design](./supervisor-auto-worker-runtime-system-design-20260824.md)

> This document records the verified pre-change state, root causes, and the implementation boundary. The companion SD is now implemented; release and live-service evidence is recorded in the implementation result below.

---

## 0. 中文執行摘要

本次重新採證確認，live supervisor 本身有正常 heartbeat，且 active release 與 canonical source 一致；採證當下 144 個 task 全部完成，沒有 active worker、queue event 或 pause。問題不在服務是否存活，而在 worker 執行語意仍有多個不一致來源：

- `agents.*.adapter` 與 `providers.*.delivery_mode` 重複定義 adapter。
- Gemini、Gemini2、Codex、Codex2、Copilot 實際都走 AGY；其中 Codex/Codex2 的 `gpt-5.6-terra` 設定並未生效。
- 所有 AGY primary 都是空字串，沒有保證高推理模型，也沒有傳 `--effort high`。
- provider log 被兩條路徑重複完整讀取；log mtime 與 CPU 又被誤當工作進度。
- `stalled/recovered` 形成第二套狀態機，clean exit 則可能只憑 task status 把錯誤 run 標為 completed。
- implicit file-inbox fallback 另有 process-local 重派計數器，繞過既有 durable retry/reassignment。

SA 結論是保留現有 supervisor、state、queue、candidate lifecycle、rotation、retry 與 reassignment，但必須把 adapter、run identity、log observation、meaningful progress 與 terminal evidence 各自收斂成唯一入口。詳細替換與刪除方式由 companion SD 定義。

## 1. Analysis objective

The objective is not to add another AGY monitor or repair isolated symptoms. The objective is to determine how the existing supervisor can provide all of the following through one lifecycle:

1. Every named lane runs the provider and model its configuration claims.
2. Every AGY attempt uses an explicit high-reasoning model rather than an implicit default.
3. A worker remains healthy only while it produces meaningful, verifiable progress.
4. A clean process exit is completed only when the exact worker attempt produced the required task evidence.
5. Timeout, provider failure, model rotation, retry, and reassignment continue through existing durable control paths.
6. Runtime state and dashboard output remain projections of existing canonical truth, not independent authorities.
7. Replaced paths are deleted in the same change so the result is smaller and maintainable.

## 2. Method and evidence

The analysis used the running service, live configuration, canonical source, active release, runtime state, task state, local CLI capabilities, and focused tests.

### 2.1 Runtime evidence captured on 2026-08-24

| Evidence             | Verified result                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| systemd unit         | `drts-supervisor.service` is `active/running`, PID `2282870`                                                                                    |
| loaded command       | active release `run-supervisor.sh` with `/home/lupin/drts-fleet-platform/.orchestrator/config.json`                                             |
| state roots          | `ORCH_STATUS_ROOT` and `AI_STATUS_ROOT` both point to `/home/lupin/drts-fleet-platform`                                                         |
| active release       | `/home/lupin/drts-fleet-platform/.artifacts/releases/orchestrator-7620ddb2c`                                                                    |
| source parity        | canonical and active-release hashes match for `antigravity.py`, `common.py`, `supervisor_runtime.py`, `worker_lifecycle.py`, and `ai_status.py` |
| task state           | `144 done`, no unfinished canonical tasks                                                                                                       |
| runtime occupancy    | zero workers, zero queue events, zero provider pauses, zero dispatch pauses                                                                     |
| supervisor heartbeat | current and advancing while sampled                                                                                                             |
| branch relation      | local `dev` is four commits behind `origin/dev`; those commits do not change the development orchestrator                                       |

The empty worker and queue state matters: a future cutover can require a drained precondition and does not need a legacy branch for already-running attempts.

### 2.2 AGY capability evidence

The installed CLI is `agy 1.1.19`. Its current interface supports:

- `--model <model-id>`
- `--effort low|medium|high`
- `--output-format text|json|stream-json`
- `--print-timeout <duration>`

Read-only `agy models` probes were run against the five configured AGY homes (`~/.gemini-ag2` through `~/.gemini-ag6`). All five advertised the same high-reasoning options, including:

- `gemini-3.1-pro-high`
- `gemini-3.7-flash-high`
- `claude-sonnet-4-6` (`Claude Sonnet 4.6 (Thinking)`)
- `claude-opus-4-6-thinking`

The probes reported zero input, output, thinking, and total tokens. Model availability was therefore verified without consuming worker quota. Availability at a later deployment remains a preflight concern, not a per-tick supervisor concern.

### 2.3 Pre-change test baseline

The pre-change focused baseline completed successfully before this document was written:

```text
python3 -m unittest test_antigravity_adapter test_worker_recovery test_ai_status test_supervisor
200 tests OK
```

The passing baseline proved the present behavior was internally consistent with its tests, but not correct. Those CPU-as-progress and status-only completion tests were replaced by the implementation.

## 3. Current runtime topology

```text
systemd user service
  -> .artifacts/releases/active/run-supervisor.sh
  -> SupervisorTickRunner
       -> provider capability refresh/cache
       -> event scan and canonical task load
       -> poll_workers() reconciliation
       -> planning/execution/coordination dispatch
       -> process_queue()
       -> poll_workers() post-delivery reconciliation
       -> projection/state persistence

process_queue()
  -> start_worker_for_request()
  -> build_adapter(agent.adapter)
  -> adapter.deliver()
  -> spawn_background_process()
  -> .orchestrator/state.json worker record
```

Canonical task mutations use `TaskBoardCommandExecutor` and `ai-status.json`. Runtime attempts use `.orchestrator/state.json`; durable delivery events use `.orchestrator/event-queue.jsonl`; model-pool cooldowns use the existing `.orchestrator/antigravity-rotation.json`. Dashboard data is derived from runtime and canonical state.

## 4. Current lane and model reality

| Lane      | Displayed identity | Actual live adapter | Effective model selection  | Finding                                                                  |
| --------- | ------------------ | ------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `claude`  | Claude             | `claude_cli`        | `claude-sonnet-5`          | aligned                                                                  |
| `claude2` | Claude2            | `claude_cli`        | `claude-sonnet-5`          | aligned                                                                  |
| `gemini`  | Gemini             | `antigravity`       | blank primary, AGY default | high reasoning not guaranteed                                            |
| `gemini2` | Gemini2            | `antigravity`       | blank primary, AGY default | high reasoning not guaranteed; stale Flash Lite preference is ignored    |
| `codex`   | Codex              | `antigravity`       | blank primary, AGY default | displayed identity and configured `gpt-5.6-terra` do not match execution |
| `codex2`  | Codex2             | `antigravity`       | blank primary, AGY default | displayed identity and configured `gpt-5.6-terra` do not match execution |
| `copilot` | Copilot            | `antigravity`       | blank primary, AGY default | displayed identity and local Copilot settings do not match execution     |

The root issue is not that high models are unavailable. The live configuration explicitly leaves every AGY primary empty, and the existing adapter interprets empty as "do not pass `--model`; use the AGY default." Rotation also overrides `model_preference`, making the configured `gemini-2.5-flash-lite` preference misleading rather than effective.

A direct host probe also confirmed that no `copilot` binary is installed. GitHub CLI authentication is healthy, but that is insufficient to run `copilot_local`. The current Copilot capability is reported healthy only because the lane is actually backed by AGY. The clean target therefore removes the Copilot lane and its unreachable local adapter instead of preserving a misleading placeholder.

The adapter registry also still exposes the direct `gemini` CLI adapter. It is referenced by example configuration and tests but by no live lane. Because the target architecture fixes Gemini/Gemini2 on AGY, those references are documentation/test reachability rather than production reachability and are removed together with the adapter. `ClaudeCodeAdapter` is different: it remains indirectly used by `ClaudeCLIAdapter` and is therefore retained.

## 5. Required behavior

### 5.1 Functional requirements

| ID      | Requirement                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FR-01` | A lane name, configured provider, capability report, spawned binary, and dashboard identity must describe the same runtime.                      |
| `FR-02` | Every automatic AGY attempt must receive an explicit high-reasoning model ID and `--effort high`; an empty or low/medium model must fail closed. |
| `FR-03` | AGY output must use `stream-json` and be normalized through the existing worker observation path.                                                |
| `FR-04` | The provider request may run for up to two hours while meaningful progress continues.                                                            |
| `FR-05` | A running worker with no meaningful progress for 600 seconds must expire once through the existing failure lifecycle.                            |
| `FR-06` | PID liveness, CPU use, heartbeat, log mtime, and repeated identical events must not refresh work progress.                                       |
| `FR-07` | Completion must be bound to the exact worker run and its canonical candidate/review/acceptance evidence.                                         |
| `FR-08` | A failure or timeout terminal event must override a task status that happens to have advanced.                                                   |
| `FR-09` | If another run advanced the task, the old run must become `superseded`, not `completed`.                                                         |
| `FR-10` | Retry, model rotation, and reassignment must reuse current paths and must not create an AGY-specific loop.                                       |
| `FR-11` | Explicit human approval suspension and explicit manual delivery remain distinct from a work-progress timeout.                                    |
| `FR-12` | The dashboard displays derived runtime facts and does not write task or worker truth.                                                            |

### 5.2 Maintainability requirements

| ID       | Requirement                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------- |
| `NFR-01` | No new daemon, watchdog, dispatcher, background monitor, queue, database, PID file, or state file. |
| `NFR-02` | One configuration source selects an adapter.                                                       |
| `NFR-03` | One supervisor entry creates a run ID and worker lease.                                            |
| `NFR-04` | One log observer reads each new byte once.                                                         |
| `NFR-05` | One helper updates meaningful progress.                                                            |
| `NFR-06` | One terminal classifier decides completed, failed, superseded, or follow-up behavior.              |
| `NFR-07` | Every replacement commit removes the superseded branch and its tests in the same change.           |
| `NFR-08` | No compatibility branch is retained for drained worker records at cutover.                         |

## 6. Gap and root-cause analysis

### G-01 Duplicate adapter authority

`agents.<lane>.adapter` and `providers.<lane>.delivery_mode` both describe delivery. `build_request()` generally reads provider delivery mode, `start_worker_for_request()` actually builds the adapter from the agent field, and provider capability probing combines both. The same lane can therefore report one capability while starting another adapter.

**Root cause:** configuration ownership was never reduced to one source after provider-specific delivery was introduced.

### G-02 AGY model policy fails open

`antigravity_rotation_config()` defines an empty primary as the AGY default. The adapter only appends `--model` when the selected value is non-empty and never passes `--effort`.

**Root cause:** model rotation was designed around quota pools, but model quality was not made a dispatch invariant.

### G-03 Run identity is created too late and in multiple places

Every process adapter calls `new_runtime_id()` independently. The supervisor learns the run ID only after `adapter.deliver()` has already spawned the process. Claude and Copilot add some `ORCH_*` values themselves; AGY and Codex do not.

**Root cause:** adapters own process identity even though the supervisor owns the worker lease and queue binding.

### G-04 Worker log observation is duplicated and grows with log size

`update_from_log()` reads the entire log on every poll for session and URL extraction. `detect_worker_failure_signal()` independently reads and scans the log again. `poll_workers()` may run before and after delivery in the same supervisor tick.

**Root cause:** metadata extraction and failure detection evolved as separate readers instead of one observation pass with separate pure classifiers.

### G-05 Liveness is confused with progress

Log mtime updates `last_event_at`. CPU ticks update `last_process_activity_at`. `worker_last_activity_at()` selects the newer value, so a process can keep its lease merely by consuming CPU without producing provider, tool, task, or terminal evidence.

**Root cause:** process health evidence was used as work-progress evidence.

### G-06 Stall is a second state machine

The live value `stall_after_seconds = 300` first changes a worker to `stalled`; a second 300-second interval terminates it. CPU or log activity may change it back to running. This creates `worker_stalled` and `worker_recovered` transitions in addition to the actual worker lifecycle.

**Root cause:** warning presentation and lease expiry were persisted as separate runtime states.

### G-07 Completion accepts weak evidence

For execution work, `finalize_exited_worker()` marks a dead process completed when the current task status is in a role-dependent expected set. A second fresh-read branch repeats this rule to cover a status-write race. Neither branch proves the exited run produced the transition.

**Root cause:** task status was treated as attempt evidence even though tasks and attempts have different identities.

### G-08 Automatic fallback has a private retry breaker

When an implicit `file_inbox` fallback becomes manual-pending and provider health later appears ready, `poll_workers()` drops it for redispatch. `_FALLBACK_REAP_COUNTS` caps the resulting oscillation in process memory. The count resets on supervisor restart and bypasses the durable retry/reassignment policy.

**Root cause:** implicit manual fallback and automatic retry are mixed in one worker status.

### G-09 Historical and runtime timestamps have mixed meaning

`last_event_at` is legitimately used for event ordering, terminal history, trimming, and dashboard display. It is also used as lease freshness. Deleting the field globally would break valid projections; continuing to use it for progress would retain the bug.

**Root cause:** one timestamp was assigned both lifecycle-history and semantic-progress responsibilities.

## 7. Existing mechanisms that remain authoritative

| Responsibility          | Existing authority to keep                                           |
| ----------------------- | -------------------------------------------------------------------- |
| supervisor lifecycle    | one systemd service and `SupervisorTickRunner`                       |
| dispatch                | `process_queue()` and `start_worker_for_request()`                   |
| process launch          | existing adapters and `spawn_background_process()`                   |
| worker truth            | `.orchestrator/state.json` worker record                             |
| durable delivery        | `.orchestrator/event-queue.jsonl`                                    |
| model-pool cooldown     | `.orchestrator/antigravity-rotation.json`                            |
| canonical task mutation | `TaskBoardCommandExecutor` and `ai-status.json`                      |
| candidate lifecycle     | existing handoff, review, integration, acceptance evidence           |
| retry                   | existing `retry_due_workers()` and transient failure handling        |
| model rotation          | existing Antigravity rotation selection and cooldown                 |
| reassignment            | existing worker reassignment path                                    |
| human approval          | existing approval queue and suspended-approval lifecycle             |
| reporting               | existing provider capability and control-plane/dashboard projections |

## 8. Mechanisms that must not be introduced

- AGY-specific worker runner or dispatcher.
- Separate AGY state or usage database.
- New progress watchdog or timer thread.
- New retry queue or model-failure queue.
- Generic second task-transition event store.
- Dynamic `agy models` calls on every supervisor tick.
- A second supervisor instance during rollout.
- A legacy completion fallback for pre-cutover active workers.

## 9. Scope boundary

### In scope

- Live lane-to-adapter alignment.
- Explicit AGY high-reasoning model policy.
- Structured AGY output and incremental observation.
- Meaningful-progress lease consolidation.
- Exact-run task evidence and terminal classification.
- Removal of implicit automatic-to-manual fallback oscillation.
- Runtime and dashboard projection alignment.
- Deletion of superseded code, configuration, tests, and unreachable adapters.

### Out of scope

- Product application code, Cloud Run product deployment, and product E2E suites.
- Replacing the canonical candidate lifecycle.
- Replacing event-queue persistence or model-rotation persistence.
- Changing Claude Sonnet 5 or Codex `gpt-5.6-terra` model choices.
- Adding token billing/accounting authority; provider usage remains observational telemetry.
- Changing task dependency or business prioritization rules.

## 10. Risks and controls

| Risk                                       | Control                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| high-reasoning model latency increases     | two-hour provider cap plus progress-aware 600-second lease                                                                       |
| a long silent tool exceeds 600 seconds     | tool-start/tool-result events are meaningful; a truly silent tool expires by policy                                              |
| model catalogue changes                    | release preflight checks each configured AGY home; runtime does not silently downgrade                                           |
| exact-run guard races process startup      | supervisor pre-registers the existing worker lease before spawn                                                                  |
| manual operator commands are blocked       | strict lease validation applies only when worker identity is present; existing operator role rules remain                        |
| stale active worker needs old fields       | deployment requires zero active workers and queue events; no compatibility branch retained                                       |
| dashboard loses historical timestamps      | retain `last_event_at` for history, remove only its use as progress freshness                                                    |
| cleanup removes an indirectly used adapter | retain Claude's inherited base; remove direct Gemini/Copilot only with their registry, config, tests, and docs in the same phase |

## 11. Analysis conclusion

The existing supervisor has the correct major control surfaces, but several responsibilities are duplicated or weakly bound. The required change is a consolidation, not an extension:

```text
one provider delivery mode
  -> one supervisor-owned run identity and lease
  -> one existing adapter launch
  -> one incremental observation pass
  -> one meaningful-progress timestamp
  -> one lease expiry path
  -> one exact-run terminal decision
  -> existing rotation / retry / reassignment
  -> existing state projections
```

The companion SD defined that consolidation and the implementation removed the superseded paths rather than layering another monitor or state machine.

## 12. Implementation result

- Provider delivery mode is the sole adapter authority; agent-level adapter overrides are removed from active configuration and examples.
- AGY lanes use explicit high-reasoning rotation with `--effort high`, `stream-json`, and a `2h` provider cap. Low-reasoning model values normalize to the high-reasoning defaults.
- Codex and Codex2 use the Codex adapter with `gpt-5.6-terra`; Claude and Claude2 use Claude CLI with `claude-sonnet-5`.
- Worker identity is supervisor-owned and pre-registered before spawn; log observation is incremental and progress is based only on meaningful provider events.
- CPU/mtime progress, persisted stall states, implicit inbox fallback recovery, duplicate terminal completion, and unconfigured Gemini/Copilot adapters are removed.
- The canonical control-plane summary path is constrained below the status root.
- Full development-orchestrator verification completed with `757` tests passing.
