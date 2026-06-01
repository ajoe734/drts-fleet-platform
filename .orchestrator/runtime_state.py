#!/usr/bin/env python3
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from common import append_jsonl, config_path, load_json, load_jsonl, utc_now, write_json


def default_state() -> dict[str, Any]:
    return {
        "version": 3,
        "initialized_at": None,
        "last_scan_at": None,
        "tasks": {},
        "pending_handoff_keys": [],
        "seen_event_keys": {},
        "queue": {
            "events": {},
        },
        "workers": {},
        "approvals": {
            "last_reconciled_at": None,
        },
        "underutilization": {
            "below_threshold_since": None,
            "last_sidecar_wave_at": None,
            "last_sidecar_wave_reason": None,
            "last_ratio": None,
            "last_main_task_wave_at": None,
        },
        "quota_paused_agents": {},
        "provider_pauses": {},
        "failure_streaks": {},
        "chair_reassignment_guards": {},
        "dispatch_pauses": [],
        "chair_review": {
            "active_review": None,
            "rotation_index": 0,
            "cooldown_until": None,
            "last_review_at": None,
            "last_reviewer": None,
            "last_reason": None,
            "last_decision": None,
            "sidecar_approved_until": None,
            "max_sidecars": None,
            "blocked_sidecar_parents": [],
        },
        "supervisor": {
            "pid": None,
            "started_at": None,
            "last_heartbeat_at": None,
            "lifecycle": "running",
        },
    }


def migrate_state(raw: dict[str, Any] | None) -> dict[str, Any]:
    state = deepcopy(default_state())
    if not raw:
        return state
    state.update(
        {
            k: v
            for k, v in raw.items()
            if k in state or k in {"queue", "workers", "approvals", "supervisor", "quota_paused_agents"}
        }
    )
    state.setdefault("tasks", {})
    state.setdefault("pending_handoff_keys", [])
    state.setdefault("seen_event_keys", {})
    state.setdefault("queue", {})
    state["queue"].setdefault("events", {})
    state.setdefault("workers", {})
    state.setdefault("approvals", {})
    state["approvals"].setdefault("last_reconciled_at", None)
    state.setdefault("underutilization", {})
    state["underutilization"].setdefault("below_threshold_since", None)
    state["underutilization"].setdefault("last_sidecar_wave_at", None)
    state["underutilization"].setdefault("last_sidecar_wave_reason", None)
    state["underutilization"].setdefault("last_ratio", None)
    state["underutilization"].setdefault("last_main_task_wave_at", None)
    state.setdefault("quota_paused_agents", {})
    state.setdefault("provider_pauses", {})
    state.setdefault("failure_streaks", {})
    state.setdefault("chair_reassignment_guards", {})
    state.setdefault("dispatch_pauses", [])
    if not isinstance(state.get("chair_review"), dict):
        state["chair_review"] = {}
    state["chair_review"].setdefault("active_review", None)
    state["chair_review"].setdefault("rotation_index", 0)
    state["chair_review"].setdefault("cooldown_until", None)
    state["chair_review"].setdefault("last_review_at", None)
    state["chair_review"].setdefault("last_reviewer", None)
    state["chair_review"].setdefault("last_reason", None)
    state["chair_review"].setdefault("last_decision", None)
    state["chair_review"].setdefault("sidecar_approved_until", None)
    state["chair_review"].setdefault("max_sidecars", None)
    state["chair_review"].setdefault("blocked_sidecar_parents", [])
    state.setdefault("supervisor", {})
    state["supervisor"].setdefault("pid", None)
    state["supervisor"].setdefault("started_at", None)
    state["supervisor"].setdefault("last_heartbeat_at", None)
    state["supervisor"].setdefault("lifecycle", "running")
    if state.get("quota_paused_agents"):
        provider_pauses = state.setdefault("provider_pauses", {})
        for agent_id, pause in state.get("quota_paused_agents", {}).items():
            merged = deepcopy(pause)
            merged.setdefault("kind", "quota")
            provider_pauses.setdefault(agent_id, merged)
    for pause in state.get("provider_pauses", {}).values():
        if isinstance(pause, dict):
            pause.setdefault("kind", "quota")
    state["version"] = 3
    return state


ACTIVE_QUEUE_STATUSES = {"running", "waiting_approval", "suspended_approval", "retry_backoff", "manual_pending", "stalled", "started", "fallback"}


def _rebuild_queue_records(state: dict[str, Any], queued_events: list[dict[str, Any]]) -> None:
    valid_event_ids = [event.get("event_id") for event in queued_events if event.get("event_id")]
    queue = state.setdefault("queue", {})
    existing_records = queue.setdefault("events", {})
    queue["events"] = {
        event_id: deepcopy(existing_records.get(event_id, {"attempt_count": 0, "status": "queued"}))
        for event_id in valid_event_ids
    }

    workers = state.setdefault("workers", {})
    for event_id, record in queue["events"].items():
        related = [worker for worker in workers.values() if worker.get("queue_event_id") == event_id]
        if not related:
            continue
        latest = sorted(related, key=lambda item: item.get("last_event_at") or "", reverse=True)[0]
        if any(worker.get("status") in ACTIVE_QUEUE_STATUSES for worker in related):
            record["status"] = "manual_pending" if any(worker.get("status") in {"manual_pending", "waiting_approval"} for worker in related) else "started"
            continue
        if any(worker.get("status") == "failed" for worker in related):
            record["status"] = "failed"
            record["processed_at"] = latest.get("last_event_at")
            if latest.get("last_error"):
                record["error"] = latest.get("last_error")
            continue
        record["status"] = "completed"
        record["processed_at"] = latest.get("last_event_at")




def prune_worker_records(state: dict[str, Any], tasks_by_id: dict[str, str] | None = None) -> None:
    tasks_by_id = tasks_by_id or {}
    queue_events = state.setdefault("queue", {}).setdefault("events", {})
    workers = state.setdefault("workers", {})
    keep: dict[str, Any] = {}
    for run_id, worker in workers.items():
        status = str(worker.get("status") or "")
        task_id = str(worker.get("task_id") or "")
        event_id = worker.get("queue_event_id")
        task_status = str(tasks_by_id.get(task_id) or "")
        if status in {"running", "started", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "fallback", "stalled"}:
            keep[run_id] = worker
            continue
        if event_id and event_id in queue_events and queue_events[event_id].get("status") not in {"completed", "failed", "done"}:
            keep[run_id] = worker
            continue
        if task_status and task_status not in {"done", "review_approved"} and status == "completed":
            keep[run_id] = worker
            continue
        # Drop terminal workers once the queue event is settled, or the task itself is already terminal.
        if status in {"failed", "completed", "interrupted", "superseded", "reassigned"}:
            continue
        keep[run_id] = worker
    state["workers"] = keep

def load_runtime_state(config: dict[str, Any]) -> dict[str, Any]:
    state = migrate_state(load_json(config_path(config, "state_file"), default=default_state()))
    queued_events = load_jsonl(config_path(config, "event_queue"))
    _rebuild_queue_records(state, queued_events)

    valid_pending_event_ids = set(state.setdefault("queue", {}).setdefault("events", {}))
    workers = state.setdefault("workers", {})
    stale_manual_workers = [
        run_id
        for run_id, worker in workers.items()
        if worker.get("status") == "manual_pending" and worker.get("queue_event_id") not in valid_pending_event_ids
    ]
    for run_id in stale_manual_workers:
        workers.pop(run_id, None)

    prune_worker_records(state)
    return state


def prune_expired_reassignment_guards(state: dict[str, Any]) -> None:
    """Drop expired entries from ``state["chair_reassignment_guards"]``.

    Each guard carries an ``expires_at`` and ``chair_reassignment_guard_active``
    already treats an expired guard as inactive (and pops it on access). But
    guards for tasks that are never accessed again (e.g. completed tasks) linger
    forever — 110 of 122 guards observed pointing at month-old done tasks during
    the 2026-05-31 incident, ~21 KB of pure dead weight in state.json. Pruning
    them eagerly here keeps state.json under the 256 KB worker Read cap when
    several workers are active at once. Only provably-expired guards are dropped;
    unparseable/missing ``expires_at`` is kept conservatively. See
    feedback_ai_status_handoff_bloat.
    """
    guards = state.get("chair_reassignment_guards")
    if not isinstance(guards, dict) or not guards:
        return
    now = datetime.now(timezone.utc)
    kept: dict[str, Any] = {}
    for key, guard in guards.items():
        expires_at = guard.get("expires_at") if isinstance(guard, dict) else None
        if expires_at:
            try:
                parsed = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                if parsed < now:
                    continue
            except ValueError:
                pass
        kept[key] = guard
    state["chair_reassignment_guards"] = kept


def _slim_worker_for_digest(worker: dict[str, Any]) -> dict[str, Any]:
    snapshot = worker.get("request_snapshot") or {}
    return {
        "status": worker.get("status"),
        "task_id": worker.get("task_id"),
        "provider": worker.get("provider"),
        "agent_id": worker.get("agent_id"),
        "reason": snapshot.get("reason"),
        "mode": worker.get("mode"),
        "last_event_at": worker.get("last_event_at"),
        "last_error_kind": worker.get("last_error_kind"),
        "last_error_summary": worker.get("last_error_summary"),
        "attempt_count": worker.get("attempt_count"),
        "retry_count": worker.get("retry_count"),
        "queue_event_id": worker.get("queue_event_id"),
    }


def state_digest_path(config: dict[str, Any]):
    return config_path(config, "state_file").parent / "state-digest.json"


def build_state_digest(state: dict[str, Any]) -> dict[str, Any]:
    """Chair-scoped slim view of runtime state.

    The chair/coordination worker reads runtime state only to decide provider
    pauses, reassignments, and dispatch readiness. The full state.json carries
    fat, chair-irrelevant payloads — per-worker ``request_snapshot`` /
    ``command`` / ``metadata`` (~27 KB each, all retry/resume-critical so they
    cannot be dropped from state.json itself), ``seen_event_keys``, and the
    ``tasks`` mirror — that push it past the 256 KB worker Read cap under
    concurrent dispatch. This digest keeps only the decision-relevant slices and
    slims worker records, so the chair read stays bounded regardless of how many
    workers are active. See feedback_ai_status_handoff_bloat.
    """
    workers = state.get("workers") or {}
    return {
        "version": state.get("version"),
        "generated_at": utc_now(),
        "last_scan_at": state.get("last_scan_at"),
        "note": "Chair-scoped digest of state.json (slim workers; seen_event_keys + tasks mirror omitted). Tasks live in ai-status.json.",
        "provider_pauses": state.get("provider_pauses", {}),
        "quota_paused_agents": state.get("quota_paused_agents", {}),
        "failure_streaks": state.get("failure_streaks", {}),
        "dispatch_pauses": state.get("dispatch_pauses", []),
        "chair_reassignment_guards": state.get("chair_reassignment_guards", {}),
        "chair_review": state.get("chair_review", {}),
        "underutilization": state.get("underutilization", {}),
        "supervisor": state.get("supervisor", {}),
        "approvals": state.get("approvals", {}),
        "workers": {run_id: _slim_worker_for_digest(worker) for run_id, worker in workers.items() if isinstance(worker, dict)},
    }


def write_state_digest(config: dict[str, Any], state: dict[str, Any]) -> None:
    write_json(state_digest_path(config), build_state_digest(state))


def save_runtime_state(config: dict[str, Any], state: dict[str, Any]) -> None:
    prune_expired_reassignment_guards(state)
    migrated = migrate_state(state)
    write_json(config_path(config, "state_file"), migrated)
    write_state_digest(config, migrated)


def load_event_queue(config: dict[str, Any]) -> list[dict[str, Any]]:
    return load_jsonl(config_path(config, "event_queue"))


def enqueue_event(config: dict[str, Any], event: dict[str, Any]) -> None:
    append_jsonl(config_path(config, "event_queue"), event)


def queue_event_record(state: dict[str, Any], event_id: str) -> dict[str, Any]:
    queue = state.setdefault("queue", {})
    events = queue.setdefault("events", {})
    record = events.setdefault(event_id, {"attempt_count": 0, "status": "queued"})
    return record


def dispatch_pauses_for_task(state: dict[str, Any], task_id: str) -> list[dict[str, Any]]:
    return [pause for pause in state.setdefault("dispatch_pauses", []) if str(pause.get("task_id") or "") == str(task_id)]


def upsert_dispatch_pause(state: dict[str, Any], pause: dict[str, Any]) -> None:
    task_id = str(pause.get("task_id") or "").strip()
    worker_run_id = str(pause.get("worker_run_id") or "").strip()
    provider = str(pause.get("provider") or "").strip()
    pauses = state.setdefault("dispatch_pauses", [])
    for index, current in enumerate(pauses):
        if (
            str(current.get("task_id") or "") == task_id
            and str(current.get("worker_run_id") or "") == worker_run_id
            and str(current.get("provider") or "") == provider
        ):
            pauses[index] = deepcopy(pause)
            break
    else:
        pauses.append(deepcopy(pause))


def clear_dispatch_pause(state: dict[str, Any], *, task_id: str | None = None, worker_run_id: str | None = None) -> None:
    pauses = state.setdefault("dispatch_pauses", [])
    state["dispatch_pauses"] = [
        pause
        for pause in pauses
        if not (
            (task_id is None or str(pause.get("task_id") or "") == str(task_id))
            and (worker_run_id is None or str(pause.get("worker_run_id") or "") == str(worker_run_id))
        )
    ]


def default_approval_state() -> dict[str, Any]:
    return {
        "version": 1,
        "updated_at": None,
        "pending": [],
        "history": [],
    }


def load_approval_state(config: dict[str, Any]) -> dict[str, Any]:
    raw = load_json(config_path(config, "approval_queue"), default=default_approval_state())
    state = deepcopy(default_approval_state())
    if isinstance(raw, dict):
        state.update(raw)
    state.setdefault("pending", [])
    state.setdefault("history", [])
    return state


def save_approval_state(config: dict[str, Any], state: dict[str, Any]) -> None:
    payload = deepcopy(state)
    payload["updated_at"] = utc_now()
    # Bound the resolved-approval history tail. approval-queue.json's ``history``
    # array grows forever (757 entries / ~1.0 MB by the 2026-05-30 incident),
    # pushing the file past the 256 KB cap the chair/coordination worker's Read
    # tool enforces. Pending approvals are never trimmed. Tunable via the
    # ``supervisor.approval_history_keep`` config key.
    keep = int(config.get("supervisor", {}).get("approval_history_keep", 300))
    history = payload.get("history")
    if isinstance(history, list) and keep >= 0 and len(history) > keep:
        payload["history"] = history[-keep:]
    write_json(config_path(config, "approval_queue"), payload)
