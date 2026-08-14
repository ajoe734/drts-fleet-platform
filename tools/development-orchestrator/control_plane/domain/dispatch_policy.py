from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping

from .models import TaskRecord


class DispatchReason(str, Enum):
    REVIEW_READY = "review_ready_dispatch"
    OWNED_IN_PROGRESS = "owned_in_progress_dispatch"
    OWNED_READY = "owned_ready_dispatch"


@dataclass(frozen=True)
class DispatchDecision:
    task_id: str
    target_agent: str
    reason: DispatchReason


@dataclass(frozen=True)
class ReadyDispatchPolicy:
    """The only worker-dispatch policy for a candidate lifecycle.

    Candidate review is the last worker-owned transition. Integration and
    external acceptance are reconciled evidence states, so dispatching another
    worker there would create a competing candidate and invalidate the evidence
    that the state machine is waiting for.
    """

    review_statuses: frozenset[str] = frozenset({"review"})
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
            parsed = frozenset(str(value).strip().lower() for value in raw if str(value).strip())
            return parsed or defaults

        defaults = cls()
        return cls(
            review_statuses=values("review_statuses", defaults.review_statuses),
            in_progress_statuses=values("in_progress_statuses", defaults.in_progress_statuses),
            owned_statuses=values("owned_statuses", defaults.owned_statuses),
            dependency_done_statuses=values("dependency_done_statuses", defaults.dependency_done_statuses),
        )

    def as_mapping(self) -> dict[str, list[str]]:
        return {
            "review_statuses": sorted(self.review_statuses),
            "in_progress_statuses": sorted(self.in_progress_statuses),
            "owned_statuses": sorted(self.owned_statuses),
            "dependency_done_statuses": sorted(self.dependency_done_statuses),
        }


def _task(value: TaskRecord | Mapping[str, Any]) -> TaskRecord:
    return value if isinstance(value, TaskRecord) else TaskRecord.from_mapping(value)


def _tasks(values: Mapping[str, TaskRecord | Mapping[str, Any]]) -> dict[str, TaskRecord]:
    return {task_id: _task(value) for task_id, value in values.items()}


def task_index(tasks: list[Mapping[str, Any]] | tuple[Mapping[str, Any], ...]) -> dict[str, TaskRecord]:
    """Create the shared read model used by dispatch and summary projections."""
    records = (_task(task) for task in tasks)
    return {record.id: record for record in records if record.id}


def dependencies_satisfied(
    task: TaskRecord | Mapping[str, Any],
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
    done_statuses: set[str] | frozenset[str],
) -> bool:
    record = _task(task)
    index = _tasks(tasks_by_id)
    completed = {str(value).strip().lower() for value in done_statuses}
    return all(
        dependency_id not in index or index[dependency_id].status in completed
        for dependency_id in record.depends_on
    )


def dependency_signature(
    task: TaskRecord | Mapping[str, Any],
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
) -> str:
    record = _task(task)
    index = _tasks(tasks_by_id)
    return "|".join(
        f"{dependency_id}:{index[dependency_id].status if dependency_id in index else 'archived'}"
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
        "candidate_sha": record.raw.get("candidate_sha"),
        "dependency_signature": dependency_signature(record, tasks_by_id),
        "last_update": record.last_update,
        "owner": record.owner or None,
        "reason": str(reason.value if isinstance(reason, DispatchReason) else reason),
        "reviewer": record.reviewer or None,
        "status": record.status,
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
    task_payload: dict[str, Any] = {"id": record.id, "artifacts": list(record.artifacts), "next": record.next}
    for key in (
        "task_class",
        "auto_generated",
        "helper_parent",
        "helper_kind",
        "mutates_canonical",
        "auto_created_by",
        "execution_branch",
        "candidate_sha",
        "candidate_branch",
    ):
        if key in record.raw:
            task_payload[key] = record.raw.get(key)
    event = {
        "key": f"dispatcher:{decision.target_agent}:{record.id}:{decision.reason.value}:{signature}",
        "task_id": record.id,
        "target_agent": decision.target_agent,
        "reason": decision.reason.value,
        "task": task_payload,
    }
    if source is not None:
        event["event_id"] = f"evt-{record.id.lower()}-{decision.reason.value}"
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
        "decision": {"task_id": decision.task_id, "target_agent": decision.target_agent, "reason": decision.reason.value},
        "queue_event": build_dispatch_event(task, decision, tasks_by_id, source=source),
    }
