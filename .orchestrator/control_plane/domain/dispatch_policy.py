from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping

from .models import TaskRecord


class DispatchReason(str, Enum):
    REVIEW_READY = "review_ready_dispatch"
    OWNED_FINALIZE = "owned_finalize_dispatch"
    OWNED_IN_PROGRESS = "owned_in_progress_dispatch"
    OWNED_READY = "owned_ready_dispatch"


@dataclass(frozen=True)
class DispatchDecision:
    task_id: str
    target_agent: str
    reason: DispatchReason


@dataclass(frozen=True)
class ReadyDispatchPolicy:
    review_statuses: frozenset[str] = frozenset({"review"})
    finalize_statuses: frozenset[str] = frozenset({"review_approved"})
    in_progress_statuses: frozenset[str] = frozenset({"in_progress"})
    owned_statuses: frozenset[str] = frozenset({"todo", "backlog"})
    dependency_done_statuses: frozenset[str] = frozenset({"done"})

    @classmethod
    def from_config(cls, config: Mapping[str, Any]) -> "ReadyDispatchPolicy":
        supervisor = config.get("supervisor") or {}
        nested = supervisor.get("ready_dispatch") or {}
        legacy = config.get("ready_dispatcher") or {}
        settings = {**legacy, **nested}

        def values(key: str, defaults: frozenset[str]) -> frozenset[str]:
            raw = settings.get(key)
            if not isinstance(raw, (list, tuple, set)):
                return defaults
            normalized = frozenset(str(item).strip().lower() for item in raw if str(item).strip())
            return normalized or defaults

        defaults = cls()
        return cls(
            review_statuses=values("review_statuses", defaults.review_statuses),
            finalize_statuses=values("finalize_statuses", defaults.finalize_statuses),
            in_progress_statuses=values("in_progress_statuses", defaults.in_progress_statuses),
            owned_statuses=values("owned_statuses", defaults.owned_statuses),
            dependency_done_statuses=values(
                "dependency_done_statuses", defaults.dependency_done_statuses
            ),
        )

    def as_mapping(self) -> dict[str, list[str]]:
        return {
            "review_statuses": sorted(self.review_statuses),
            "finalize_statuses": sorted(self.finalize_statuses),
            "in_progress_statuses": sorted(self.in_progress_statuses),
            "owned_statuses": sorted(self.owned_statuses),
            "dependency_done_statuses": sorted(self.dependency_done_statuses),
        }


def task_index(tasks: Mapping[str, Any] | list[Mapping[str, Any]]) -> dict[str, TaskRecord]:
    if isinstance(tasks, Mapping):
        values = tasks.values()
    else:
        values = tasks
    result: dict[str, TaskRecord] = {}
    for value in values:
        if not isinstance(value, Mapping):
            continue
        task = TaskRecord.from_mapping(value)
        if task.id:
            result[task.id] = task
    return result


def _task(value: TaskRecord | Mapping[str, Any]) -> TaskRecord:
    return value if isinstance(value, TaskRecord) else TaskRecord.from_mapping(value)


def _tasks(values: Mapping[str, TaskRecord | Mapping[str, Any]]) -> dict[str, TaskRecord]:
    return {task_id: _task(value) for task_id, value in values.items()}


def dependencies_satisfied(
    task: TaskRecord | Mapping[str, Any],
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
    done_statuses: set[str] | frozenset[str],
) -> bool:
    record = _task(task)
    index = _tasks(tasks_by_id)
    normalized_done = {str(status).strip().lower() for status in done_statuses}
    for dependency_id in record.depends_on:
        dependency = index.get(dependency_id)
        if dependency is not None and dependency.status not in normalized_done:
            return False
    return True


def dependency_signature(
    task: TaskRecord | Mapping[str, Any],
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
) -> str:
    record = _task(task)
    index = _tasks(tasks_by_id)
    return "|".join(
        f"{dependency_id}:{str(index[dependency_id].raw.get('status') or 'missing') if dependency_id in index else 'archived'}"
        for dependency_id in record.depends_on
    )


def resolve_dispatch_target(
    task: TaskRecord | Mapping[str, Any],
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
    policy: ReadyDispatchPolicy,
) -> DispatchDecision | None:
    record = _task(task)
    if record.status in policy.review_statuses and record.reviewer:
        return DispatchDecision(record.id, record.reviewer, DispatchReason.REVIEW_READY)
    if record.status in policy.finalize_statuses and record.owner:
        return DispatchDecision(record.id, record.owner, DispatchReason.OWNED_FINALIZE)
    if not dependencies_satisfied(record, tasks_by_id, policy.dependency_done_statuses):
        return None
    if record.status in policy.in_progress_statuses and record.owner:
        return DispatchDecision(record.id, record.owner, DispatchReason.OWNED_IN_PROGRESS)
    if record.status in policy.owned_statuses and record.owner:
        return DispatchDecision(record.id, record.owner, DispatchReason.OWNED_READY)
    return None


def ready_dispatch_signature(
    task: TaskRecord | Mapping[str, Any],
    reason: DispatchReason | str,
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
) -> str:
    record = _task(task)
    payload = {
        "dependency_signature": dependency_signature(record, tasks_by_id),
        "depends_on": list(record.depends_on),
        "execution_branch": record.raw.get("execution_branch"),
        "last_update": record.last_update,
        "owner": record.owner or None,
        "reason": str(reason.value if isinstance(reason, DispatchReason) else reason),
        "reviewer": record.reviewer or None,
        "status": record.raw.get("status"),
        "task_id": record.id,
    }
    return json.dumps(payload, ensure_ascii=True, sort_keys=True)


def build_dispatch_event(
    task: TaskRecord | Mapping[str, Any],
    decision: DispatchDecision,
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
    *,
    source: str | None = None,
) -> dict[str, Any]:
    record = _task(task)
    signature = ready_dispatch_signature(record, decision.reason, tasks_by_id)
    reason = decision.reason.value
    task_payload: dict[str, Any] = {
        "id": record.id,
        "artifacts": list(record.artifacts),
        "next": record.next,
    }
    for key in (
        "task_class",
        "auto_generated",
        "helper_parent",
        "helper_kind",
        "mutates_canonical",
        "auto_created_by",
        "execution_branch",
    ):
        if key in record.raw:
            task_payload[key] = record.raw.get(key)
    event = {
        "key": f"dispatcher:{decision.target_agent}:{record.id}:{reason}:{signature}",
        "task_id": record.id,
        "target_agent": decision.target_agent,
        "reason": reason,
        "task": task_payload,
    }
    if source is not None:
        event["event_id"] = f"evt-{record.id.lower()}-{reason}"
        event["metadata"] = {"source": source, "mode": "execution"}
    return event


def dispatch_preview(
    task: TaskRecord | Mapping[str, Any],
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
    policy: ReadyDispatchPolicy,
    *,
    source: str,
) -> dict[str, Any] | None:
    decision = resolve_dispatch_target(task, tasks_by_id, policy)
    if decision is None:
        return None
    return {
        "decision": {
            "task_id": decision.task_id,
            "target_agent": decision.target_agent,
            "reason": decision.reason.value,
        },
        "queue_event": build_dispatch_event(task, decision, tasks_by_id, source=source),
    }
