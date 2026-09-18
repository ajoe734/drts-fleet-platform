"""Reading a task board entry and a dispatch queue event.

Is this task still open, where does it sit in the status document, which agent
may take it, what does a queue event key on, which dispatch reason outranks
which. Interpretation of records that are already in hand -- no file is read
here and none is written, which is what separates this from queue_repo and
task_board_repo next door: those two own the locking and the atomic writes.

Extracted verbatim from control_plane/runtime/supervisor_runtime.py. Every
function here had no dependency on anything else in that module and touches no
I/O helper, so it could move without an import cycle and without dragging a
side effect into the domain layer.
"""

from __future__ import annotations

from typing import Any

from common import display_name_for, normalize_agent_id
from control_plane.domain.dispatch_policy import (
    DispatchDecision as DomainDispatchDecision,
    DispatchReason as DomainDispatchReason,
    ReadyDispatchPolicy,
    build_dispatch_event as build_domain_dispatch_event,
    ready_dispatch_signature as domain_ready_dispatch_signature,
    resolve_dispatch_target as resolve_domain_dispatch_target,
)


def _task_is_open(task: dict[str, Any]) -> bool:
    return str(task.get("status") or "").lower() not in {"done", "superseded"}


def _task_branch(agent_id: str, task_id: str) -> str:
    return f"{normalize_agent_id(agent_id)}/{task_id.lower()}"


def _has_dispatchable_backlog(status: dict[str, Any]) -> bool:
    dispatchable = {"backlog", "todo", "in_progress", "review"}
    for task in (status.get("tasks") or []):
        if isinstance(task, dict) and str(task.get("status") or "") in dispatchable:
            return True
    return False


def build_dispatch_event(task: dict[str, Any], target_agent: str, reason: str, task_map: dict[str, dict[str, Any]]) -> dict[str, Any]:
    decision = DomainDispatchDecision(
        task_id=str(task.get("id") or ""),
        target_agent=target_agent,
        reason=DomainDispatchReason(reason),
    )
    return build_domain_dispatch_event(task, decision, task_map)


def current_dispatch_event_key(config: dict[str, Any], event: dict[str, Any], task_map: dict[str, dict[str, Any]]) -> str | None:
    reason = str(event.get("reason") or "")
    task_id = str(event.get("task_id") or "")
    task = task_map.get(task_id)
    if not task:
        return None
    target_agent = str(event.get("target_display_name") or display_name_for(config, str(event.get("target_agent") or "")))
    decision = resolve_domain_dispatch_target(task, task_map, ReadyDispatchPolicy.from_config(config))
    if decision is None or decision.reason.value != reason or decision.target_agent != target_agent:
        return None
    return str(build_domain_dispatch_event(task, decision, task_map).get("key") or "")


def dispatch_reason_priority(reason: str | None) -> int | None:
    normalized = str(reason or "")
    priorities = {
        "acceptance_ready_dispatch": 0,
        "review_ready_dispatch": 0,
        "owned_in_progress_dispatch": 1,
        "owned_ready_dispatch": 2,
    }
    return priorities.get(normalized)


def outstanding_queue_event_references(state: dict[str, Any]) -> set[str]:
    """Queue events a consumer other than a live worker has not finished with.

    Pruning asked only whether a worker was still active, but a worker is not
    the sole holder of an event: the chair keeps its own reference through
    active_review.queue_event_id and reads the settled record back to tell a run
    that produced nothing apart from an event that disappeared. Dropping the
    record first made the accurate branch unreachable -- across 148,208 logged
    events chair_review_missing_output never fired once, while its fallback
    fired 45,923 times. The reference is released as soon as the review settles,
    so nothing accumulates.
    """
    references: set[str] = set()
    active_review = (state.get("chair_review") or {}).get("active_review")
    if isinstance(active_review, dict):
        event_id = str(active_review.get("queue_event_id") or "").strip()
        if event_id:
            references.add(event_id)
    return references


def ready_dispatch_signature(task: dict[str, Any], reason: str, task_map: dict[str, dict[str, Any]]) -> str:
    return domain_ready_dispatch_signature(task, reason, task_map)


def task_index_from_status(config: dict[str, Any], status: dict[str, Any]) -> dict[str, dict[str, Any]]:
    schema = config.get("schema", {})
    tasks_path = schema.get("tasks_path", "tasks")
    task_id_field = schema.get("task_id_field", "id")
    return {
        str(task.get(task_id_field)): task
        for task in status.get(tasks_path, [])
        if task.get(task_id_field)
    }


def task_is_dispatch_eligible_for_agent(task: dict[str, Any], agent_name: str) -> bool:
    raw = task.get("eligible_agents")
    if raw is None:
        raw = task.get("eligibility")
    if raw is None:
        return True
    if isinstance(raw, list):
        allowed = {str(item).strip() for item in raw if str(item).strip()}
        return not allowed or agent_name in allowed
    if isinstance(raw, dict):
        allowed = raw.get("agents")
        if isinstance(allowed, list):
            normalized = {str(item).strip() for item in allowed if str(item).strip()}
            return not normalized or agent_name in normalized
    return True


def task_role_for_dispatch_reason(reason: str | None) -> str | None:
    normalized = str(reason or "").strip()
    if normalized == "review_ready_dispatch":
        return "reviewer"
    if normalized in {"owned_in_progress_dispatch", "owned_ready_dispatch"}:
        return "owner"
    return None


def workspace_baseline_cover_task_ids(task: dict[str, Any]) -> set[str]:
    raw = task.get("covers_task_ids")
    if not isinstance(raw, list):
        return set()
    return {str(item).strip() for item in raw if str(item).strip()}
