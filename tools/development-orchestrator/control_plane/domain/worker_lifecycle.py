"""Worker-attempt lifecycle rules shared by runtime, queue, and projections.

Workers are attempts, not durable task states. A finished attempt is always
terminal; a follow-up delay belongs to that attempt so there is only one source
of truth for both result consumption and redispatch timing.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Mapping


ACTIVE_WORKER_STATUSES = frozenset(
    {
        "running",
        "started",
        "waiting_approval",
        "suspended_approval",
        "manual_pending",
        "retry_backoff",
        "stalled",
        "fallback",
    }
)

TERMINAL_WORKER_STATUSES = frozenset(
    {
        "completed",
        "failed",
        "interrupted",
        "superseded",
        "reassigned",
        "rotated",
        "retried",
    }
)


def is_active_worker(worker: Mapping[str, Any]) -> bool:
    return str(worker.get("status") or "").strip().lower() in ACTIVE_WORKER_STATUSES


def is_terminal_worker(worker: Mapping[str, Any]) -> bool:
    return str(worker.get("status") or "").strip().lower() in TERMINAL_WORKER_STATUSES


def outcome_id(run_id: str, payload: Mapping[str, Any]) -> str:
    """Return an immutable identity for exactly one worker result payload."""
    canonical = json.dumps(dict(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(f"{run_id}\0{canonical}".encode("utf-8")).hexdigest()
    return f"outcome:{run_id}:{digest}"


def result_already_consumed(worker: Mapping[str, Any], payload: Mapping[str, Any]) -> bool:
    run_id = str(worker.get("run_id") or "").strip()
    return bool(run_id) and worker.get("consumed_result_id") == outcome_id(run_id, payload)


def consume_result(
    worker: dict[str, Any],
    payload: Mapping[str, Any],
    *,
    completed_at: str,
    redispatch_after: str | None = None,
) -> bool:
    """Apply a terminal result once. Returns ``False`` for an exact replay."""
    run_id = str(worker.get("run_id") or "").strip()
    if not run_id:
        return False
    identity = outcome_id(run_id, payload)
    if worker.get("consumed_result_id") == identity:
        return False
    worker["consumed_result_id"] = identity
    worker["consumed_result_at"] = completed_at
    worker["terminal_outcome"] = str(payload.get("outcome") or "").strip().lower()
    worker["terminal_summary"] = str(payload.get("summary") or "").strip()
    worker["status"] = "completed"
    worker["completed_at"] = completed_at
    worker["last_event_at"] = completed_at
    if redispatch_after:
        worker["redispatch_after"] = redispatch_after
    else:
        worker.pop("redispatch_after", None)
    return True


def _parse_iso_utc(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def redispatch_is_deferred(
    workers: Mapping[str, Mapping[str, Any]],
    task_id: str,
    agent_id: str,
    *,
    now: datetime | str | None = None,
) -> bool:
    """Whether the latest matching progress attempt still owns a cooldown."""
    target_task = str(task_id or "").strip()
    target_agent = str(agent_id or "").strip().lower()
    current = _parse_iso_utc(now) if isinstance(now, str) else now
    current = current or datetime.now(timezone.utc)
    matching = [
        worker
        for worker in workers.values()
        if str(worker.get("task_id") or "").strip() == target_task
        and str(worker.get("agent_id") or "").strip().lower() == target_agent
        and str(worker.get("terminal_outcome") or "").strip().lower() in {"progress", "advanced"}
    ]
    if not matching:
        return False
    latest = max(
        matching,
        key=lambda worker: str(worker.get("completed_at") or worker.get("last_event_at") or ""),
    )
    resume_at = _parse_iso_utc(latest.get("redispatch_after"))
    return resume_at is not None and resume_at > current
