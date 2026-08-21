"""Worker-attempt lifecycle rules shared by runtime, queue, and projections.

Workers are attempts, not durable task states. A finished attempt is always
terminal; a follow-up delay belongs to that attempt so there is only one source
of truth for both result consumption and redispatch timing.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

# The moved readers name this for what the timestamp is rather than what format
# it is in; parse_iso_utc above is the same function under its other reading.
from common import parse_iso_utc, parse_iso_utc as parse_runtime_timestamp


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
    current = parse_iso_utc(now) if isinstance(now, str) else now
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
    resume_at = parse_iso_utc(latest.get("redispatch_after"))
    return resume_at is not None and resume_at > current


# Reading an attempt record: when it was dispatched, when it last moved, what
# it reported, whether it can resume from an approval, and how much history to
# keep. Same subject as the rules above -- a worker attempt -- so they live
# together rather than in a fourth module about the same thing.
#
# Five siblings stayed in the runtime module rather than coming along: they
# reach for detect_worker_failure, ready_dispatch_settings and
# resolve_dispatch_target, which live in infra and usecases. Bringing them here
# would have inverted the layering this package keeps.
def worker_reported_outcome(worker: dict[str, Any]) -> dict[str, Any] | None:
    result_path = str(worker.get("result_path") or "").strip()
    if not result_path:
        return None
    try:
        payload = json.loads(Path(result_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or str(payload.get("outcome") or "").lower() not in {
        "advanced",
        "progress",
        "blocked",
        "failed",
    }:
        return None
    return payload


def worker_last_activity_at(worker: dict[str, Any]) -> str | None:
    """Use the newest semantic event or observed local process progress."""
    timestamps = [
        str(worker.get(key) or "").strip()
        for key in ("last_event_at", "last_process_activity_at")
    ]
    timestamps = [value for value in timestamps if value]
    return max(timestamps) if timestamps else None


def parse_worker_dispatched_at(run_id: str | None) -> datetime | None:
    """Extract the dispatch timestamp embedded in a worker run_id.

    Production run_ids are formatted as ``<provider>-<YYYYMMDDTHHMMSSZ>-<hash>``
    (see worker spawn paths). The supervisor never stored a dedicated
    ``dispatched_at`` field on worker records, so parsing the run_id is the
    least invasive way to recover the dispatch moment for cooldown checks.

    Returns ``None`` when the run_id is missing or none of its dash-separated
    components parse as the expected timestamp shape — that preserves prior
    behaviour for synthetic test fixtures whose run_ids are short slugs like
    ``run-1`` / ``old-run``.
    """
    if not run_id:
        return None
    for part in str(run_id).split("-"):
        try:
            return datetime.strptime(part, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def heartbeat_lag_seconds(previous_heartbeat: str | None, current_heartbeat: str | None) -> float | None:
    previous_dt = parse_runtime_timestamp(previous_heartbeat)
    current_dt = parse_runtime_timestamp(current_heartbeat)
    if previous_dt is None or current_dt is None:
        return None
    return max(0.0, (current_dt - previous_dt).total_seconds())


def worker_supports_approval_resume(worker: dict[str, Any]) -> bool:
    return bool(
        str(worker.get("provider") or "").startswith("claude")
        and (worker.get("session_id") or worker.get("resume_token"))
    )


def trim_worker_history(state: dict[str, Any], max_entries: int) -> None:
    workers = state.get("workers", {})
    if len(workers) <= max_entries:
        return
    ordered = sorted(workers.items(), key=lambda item: item[1].get("last_event_at") or "")
    state["workers"] = dict(ordered[-max_entries:])
