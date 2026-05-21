# Auto Worker Efficiency Control Plane Redesign

Status: proposed
Date: 2026-05-18
Owner: supervisor control plane
Scope: auto worker dispatch context, activity-log telemetry, later deterministic chair policy

## Executive Summary

The auto worker cost problem is not primarily that Python restarts, nor that workers exist. The root problem is that the supervisor control plane already has enough structured state to make narrow, deterministic decisions, but it currently pushes too much raw context and synthesis work downstream into paid LLM sessions.

The redesign principle is:

> Python computes state slices and mechanical decisions. LLM workers execute bounded tasks with a prebuilt context packet. LLM chair sessions are reserved for ambiguous judgment.

This document intentionally stages the fix. The first patch should not change scheduler behavior, chair policy, or dispatch routing. It should only add enough telemetry and log hygiene to measure where prompt/context bytes are leaking. After that data confirms the highest-loss path, we can introduce task-scoped context packets, then replace worker prompts, then move mechanical chair decisions into Python.

## Current Root Cause

The supervisor is the cheapest and most authoritative place to do state synthesis. It already has access to:

| Input | Supervisor can compute | Current failure mode |
| --- | --- | --- |
| Task graph | Dependency slice, parent/helper relationships, blocked ancestors | Worker is asked to rediscover task context from broad machine truth |
| Activity log | Recent handoffs, failures, reviewer actions, chair outcomes | Worker or chair reads too much history and re-summarizes it |
| Provider/lane state | Exact paused lanes, active workers, capacity, retry state | Chair LLM is asked to reason about mechanical lane facts |
| Approval queue | TTL, pending approvals, stale approvals, sidecar allowance | Chair LLM is invoked for decisions that are pure if/else |
| Task brief | Relevant files, acceptance, guardrails, artifacts | Worker prompt still encourages reading machine context first |

The cost is paid only when an LLM session reads or regenerates this synthesis. A Python restart is not itself token-expensive, but it amplifies cost when each restart causes new dispatches and each dispatch repeats the same broad prompt/context load.

## Token Loss Surfaces

| Surface | Loss mechanism | Why Python should own it |
| --- | --- | --- |
| Worker dispatch prompt/context | Worker receives broad instructions to read machine truth or carries oversized prompt payloads | The supervisor already knows the task id, dependencies, owner/reviewer, handoffs, lane state, and target files |
| Chair review for mechanical actions | Chair LLM evaluates routine TTL refresh, sidecar allowance, stale approval cleanup, or exact-lane pause facts | These are deterministic predicates over state.json, approval-queue.json, and config |
| Activity log growth | Hook payloads and worker command prompts can write large raw strings back into ai-activity-log.jsonl | Logs should preserve hashes, sizes, and previews for auditability, not duplicate the entire prompt/body |

## Goals

| Goal | Meaning |
| --- | --- |
| Reduce paid synthesis | Stop asking workers and chair sessions to read broad state when Python can build the relevant slice |
| Preserve auditability | Keep hashes, byte counts, previews, timestamps, and decision inputs so behavior remains explainable |
| Stage behavior changes | Add telemetry first, then shadow-mode context packets, then prompt changes, then chair policy |
| Keep supervisor understandable | Introduce named control-plane modules/functions rather than stuffing more branching into the main loop |
| Measure before policy | Do not tune scheduler lease or chair routing until baseline data shows the dominant loss path |

## Non-Goals For The First Patch

| Non-goal | Reason |
| --- | --- |
| No scheduler lease change | Lease behavior changes dispatch semantics and can hide the prompt/context cost we need to measure first |
| No chair rules change | Chair policy should move only after worker dispatch context data confirms the biggest leak |
| No prompt replacement yet | Replacing the worker prompt before baseline metrics makes before/after attribution weaker |
| No broad refactor of supervisor.py | The first patch should be reversible and easy to review |
| No deletion of machine truth files | Workers may still need escape hatches until context packets are proven complete |

## Target Architecture

### 1. TaskContextSynthesizer

Add a Python-side synthesis layer that receives a task id and returns a bounded context packet. This should be a pure function over current state plus a small activity-log window.

Candidate module:

```text
.orchestrator/task_context.py
```

Candidate entrypoint:

```python
def build_task_context_packet(
    config: dict[str, Any],
    state: dict[str, Any],
    *,
    task_id: str,
    target_agent: str,
    reason: str,
    now: datetime,
) -> dict[str, Any]:
    ...
```

The synthesizer should own these slices:

| Slice | Content |
| --- | --- |
| task | id, title, status, owner, reviewer, task class, helper parent/kind, allowed mutation scope |
| dependency_slice | direct dependencies, dependency status, blocked ancestors, ready/not-ready reason |
| related_tasks | parent, helper children, sidecars, sibling support tasks, review packet children |
| recent_handoffs | recent progress/handoff/reopen/approve/done messages for this task and related tasks |
| lane_state | exact target lane status, active worker on lane, exact provider pauses, retry backoff |
| queue_state | whether this dispatch is from queue, event reason, event metadata digest |
| guardrails | branch/anchor rules, mutation rules, fragile surfaces, machine-truth update command |
| files | target files, context files, support artifacts, known forbidden or support-only paths |
| acceptance | task acceptance criteria and suggested verification commands |
| escape_hatch | what to read only if packet is insufficient |

### 2. Worker Context Packet Contract

The worker should receive a compact packet and a strict prompt contract:

```text
Everything required for this dispatch is below. Do not read ai-status.json,
current-work.md, .orchestrator/state.json, or ai-activity-log.jsonl unless
the packet is internally inconsistent or you are explicitly blocked.
If blocked by missing context, report the missing field instead of loading
broad machine truth by default.
```

The packet should be small enough to fit comfortably in the dispatch prompt and stable enough to diff in tests. It should not include full activity logs, raw hook payloads, or full state files.

Example packet shape:

```json
{
  "schema": "task_context_packet.v1",
  "generated_at": "2026-05-18T00:00:00Z",
  "dispatch": {
    "task_id": "PBK-UI-004",
    "target_agent": "codex2",
    "reason": "review_ready_dispatch"
  },
  "task": {
    "status": "review",
    "owner": "Claude2",
    "reviewer": "Codex2",
    "summary": "Authority-safe negative paths",
    "mutation_scope": "mainline"
  },
  "dependencies": [
    {"id": "PBK-UI-003", "status": "done"}
  ],
  "recent_handoffs": [
    {
      "ts": "2026-05-18T07:46:24Z",
      "type": "handoff",
      "summary": "Reviewer-side packet refreshed..."
    }
  ],
  "lane_state": {
    "target_lane": "codex2",
    "dispatch_capable": true,
    "active_worker_count": 0,
    "pauses": []
  },
  "files": {
    "target": ["apps/partner-booking-web/"],
    "context": ["AI_COLLABORATION_GUIDE.md"],
    "support_only": []
  },
  "acceptance": [
    "pnpm --filter @drts/partner-booking-web typecheck",
    "pnpm --filter @drts/partner-booking-web build",
    "pnpm --filter @drts/partner-booking-web lint"
  ],
  "escape_hatch": {
    "allowed_reads": [".orchestrator/task-briefs/PBK-UI-004.md"],
    "broad_state_reads_require_reason": true
  }
}
```

### 3. Dispatch Prompt Integration

Current dispatch rendering lives primarily around:

| Location | Role |
| --- | --- |
| `.orchestrator/watch_events.py` | renders wakeup messages for queue events |
| `.orchestrator/templates/wakeup.txt` | worker wakeup template |
| `.orchestrator/common.py` | selected shared files and task brief helpers |
| `.orchestrator/supervisor.py` | worker start and activity logging |

The prompt replacement should happen only after a shadow-mode packet has been logged and compared against actual worker needs.

Target behavior:

| Phase | Worker sees | Worker should not do |
| --- | --- | --- |
| Current | broad machine-context instruction plus task brief | N/A |
| Shadow | existing prompt plus hidden/logged packet metrics | no behavior change |
| Packet mode | context packet plus narrow escape hatch | no default broad state read |
| Strict mode | packet is the authoritative dispatch context | no machine truth read without explicit blocker |

### 4. DeterministicChairPolicy

Chair LLM should not be invoked for pure TTL or capacity refreshes. A later Python policy layer should evaluate routine cases first and return either a deterministic decision or "needs LLM judgment".

Candidate module:

```text
.orchestrator/chair_policy.py
```

Deterministic cases:

| Case | Python decision |
| --- | --- |
| approve_sidecars TTL expired and active sidecars below cap | refresh sidecar allowance |
| approve_sidecars TTL active | no-op |
| exact provider pause still active | do not ask chair to rediscover it |
| stale approval beyond retention | prune or mark stale according to existing queue policy |
| dispatch_now against dependency-gated task | reject deterministically |
| no actionable approvals and no failure loop | skip chair session |

LLM chair remains for:

| Case | Why LLM may still help |
| --- | --- |
| reassignment_triage | Need judgment over ownership, reviewer separation, capability fit, and failure history |
| ambiguous repeated failures | Need narrative synthesis when failure classes conflict |
| policy exception | Need explicit rationale before mutating task ownership or lane state |

### 5. Scheduler Lease

Scheduler lease is a valid later optimization, but it should wait until after dispatch prompt/context data is collected. Otherwise a reduced supersede count could be mistaken for token savings while the per-dispatch prompt remains oversized.

When revisited, the lease should be a named policy with tests and metrics:

| Metric before lease | Metric after lease |
| --- | --- |
| worker_superseded / worker_started | should decrease |
| worker_started / done | should decrease or stay stable |
| time_to_review_approved | must not regress materially |
| stuck in_progress workers | must not increase |

## Phase Plan

| Phase | Patch type | Behavior change | Exit gate |
| --- | --- | --- | --- |
| A. Baseline telemetry | Log hygiene and report script | No dispatch behavior change | We can quantify prompt bytes, hook payload bytes, worker churn, chair churn |
| B. Context packet shadow mode | Build packet and log size/hash/coverage | No worker prompt change | Packet covers recent successful dispatches without missing required fields |
| C. Worker prompt replacement | Worker receives packet-first prompt | Yes, narrower reads | Prompt bytes and broad-state reads drop without completion regression |
| D. Deterministic chair rules | Python handles mechanical chair cases | Yes, fewer chair sessions | approve_sidecars-like LLM calls drop and invalid chair outputs do not rise |
| E. Scheduler lease | Add minimum active lease for selected dispatch reasons | Yes, fewer supersedes | Worker churn drops without starving higher-priority review/finalize work |

## Phase A Telemetry Patch

The first patch should be intentionally small and reversible:

| Change | Purpose |
| --- | --- |
| Replace raw `command` in `worker_started` activity events with `command_summary` | Preserve prompt size/hash/preview without writing the full dispatch prompt into the activity log |
| Sanitize large hook payload fields before writing `permission_hook` events | Stop `content`, `stdout`, `stderr`, patches, and raw tool bodies from bloating ai-activity-log.jsonl |
| Add an efficiency report script | Quantify worker churn, chair churn, hook bytes, and prompt bytes from existing logs |

This does not reduce the prompt sent to workers yet. It reduces self-inflicted log growth and gives us a stable measuring tool.

## Metrics To Track

| Metric | Formula / source | Why it matters |
| --- | --- | --- |
| worker_started_per_done | worker_started / done-like completions | Measures dispatch churn |
| superseded_per_worker_started | worker_superseded / worker_started | Measures scheduler churn |
| failed_per_worker_started | worker_failed / worker_started | Measures wasted worker starts |
| chair_sessions | worker_started events whose message or task id identifies chair_review | Measures chair LLM usage |
| chair_invalid_rate | chair_review_invalid_schema / chair_sessions | Measures LLM policy fragility |
| prompt_chars_per_worker | command_summary.prompt_chars or parsed legacy command prompt | Measures dispatch prompt size |
| permission_hook_bytes | JSON line bytes for permission_hook events | Measures log bloat from tool payloads |
| bytes_by_event_type | sum JSON line bytes by type | Finds activity-log growth sources |
| restart_amplification | worker_started count after supervisor start/restart windows | Shows whether restarts amplify dispatch cost |

## Data Collection Procedure

Run the report over the activity log:

```bash
python3 scripts/auto-worker-efficiency-report.py
```

For a recent window:

```bash
python3 scripts/auto-worker-efficiency-report.py --since 2026-05-10T00:00:00Z
```

Optional JSON output for later comparison:

```bash
python3 scripts/auto-worker-efficiency-report.py --json
```

The report should support both historical events with raw `command` arrays and new events with `command_summary`.

## Initial Baseline Snapshot

Collected on 2026-05-18 with `scripts/auto-worker-efficiency-report.py`.

Recent window:

| Window | Events | Log bytes | Worker starts | Worker completed | Worker failed | Worker superseded | Chair starts | Chair invalid schema | Prompt chars | permission_hook bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-05-10T00:00:00Z..2026-05-18T07:55:40Z | 66,218 | 186.5 MiB | 2,742 | 1,714 | 437 | 1,076 | 977 | 233 | 9,295,240 | 167.6 MiB |

Full retained activity log:

| Window | Events | Log bytes | Worker starts | Worker completed | Worker failed | Worker superseded | Chair starts | Chair invalid schema | Prompt chars | permission_hook bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-04-10T14:14:31Z..2026-05-18T07:53:54Z | 301,430 | 448.1 MiB | 22,234 | 3,382 | 1,704 | 15,754 | 2,167 | 1,017 | 25,680,973 | 336.9 MiB |

Interpretation:

| Finding | Implication |
| --- | --- |
| `permission_hook` is 167.6 MiB of the recent 186.5 MiB window | Hook payload truncation is the safest immediate reduction in log bloat |
| `worker_started` is 14.5 MiB in the recent window and 50.0 MiB full-history | Replacing raw command prompts with `command_summary` prevents dispatch prompts from being duplicated into the activity log |
| Recent worker_superseded is 39.2% of worker starts; full-history is 70.9% | Scheduler churn is real, but should be handled after prompt/log baseline so causes are not conflated |
| Recent chair invalid schema is 23.8%; full-history is 46.9% | Chair rules deserve follow-up, but deterministic chair policy should be staged after worker-context evidence |

## Acceptance Criteria

Phase A is accepted when:

| Criterion | Requirement |
| --- | --- |
| Tests | supervisor and permission broker tests pass |
| Log compatibility | Existing activity-log consumers tolerate `command_summary` on new worker_started events |
| Data report | Report runs on current ai-activity-log.jsonl and prints worker/chair/payload metrics |
| No scheduler change | No lease, supersede, ready-dispatch, or chair policy behavior changes are included |
| No state rewrite | Existing machine truth files are not rewritten by the patch |

Phase B should not begin until Phase A provides a baseline that identifies the top byte/churn contributors.

## Rollback Plan

| Change | Rollback |
| --- | --- |
| `command_summary` logging | Restore raw `command` field in `worker_started` activity events |
| hook payload sanitizer | Write original hook payloads again |
| report script | Remove script; no runtime behavior depends on it |
| context packet shadow mode | Disable packet generation via config flag |
| worker prompt replacement | Revert wakeup template to broad-context prompt |
| deterministic chair policy | Route all chair reasons back to existing LLM review path |

## Open Questions Before Phase B

| Question | Why it matters |
| --- | --- |
| What is the acceptable max context packet size per dispatch reason? | Prevents packet mode from becoming another giant prompt |
| Which activity-log event types reliably encode handoff semantics? | Needed for high-signal recent_handoffs extraction |
| Should packet generation live in supervisor.py or a separate module from day one? | Separate module is cleaner, but integration cost is higher |
| Which worker providers obey "do not read broad state" most reliably? | Packet rollout may need provider-specific staging |
| What threshold proves chair TTL refresh is worth moving next? | Avoids optimizing chair before worker dispatch if chair is a smaller cost center |

## Decision

Proceed with Phase A only:

1. Add this design document.
2. Keep a small telemetry/log-hygiene patch.
3. Add and run the efficiency report.
4. Defer scheduler lease, worker prompt replacement, and chair rules until baseline data confirms the next highest-leverage change.
