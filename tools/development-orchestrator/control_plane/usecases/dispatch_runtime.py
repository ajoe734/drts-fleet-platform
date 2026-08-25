"""Dispatch settings and state indexes used by the supervisor application."""
from __future__ import annotations

from typing import Any

from common import normalize_agent_id
from control_plane.domain.dispatch_policy import (
    ReadyDispatchPolicy,
    dependencies_satisfied as domain_dependencies_satisfied,
    resolve_dispatch_target as resolve_domain_dispatch_target,
)
from control_plane.domain.worker_lifecycle import ACTIVE_WORKER_STATUSES as ACTIVE_RUNTIME_STATUSES


def ready_dispatch_settings(config: dict[str, Any]) -> dict[str, Any]:
    settings = dict(config.get("ready_dispatcher", {}) or {})
    settings.setdefault("enabled", True)
    settings.setdefault("review_statuses", ["review"])
    settings.setdefault("acceptance_statuses", ["acceptance"])
    settings.setdefault("owned_statuses", ["in_progress", "todo", "backlog"])
    settings.setdefault("dependency_done_statuses", ["done"])
    # Worker attempt activity is an invariant shared with the repository and
    # summary projection. Configuration cannot redefine it.
    settings["active_worker_statuses"] = sorted(ACTIVE_RUNTIME_STATUSES)
    settings.setdefault("max_tasks_per_agent", 1)
    settings.setdefault("max_tasks_per_agent_by_lane", {})
    settings.setdefault("max_dispatches_per_tick", 4)
    # Dispatch cooldown: a *running* worker dispatched within the last
    # N seconds is protected from voluntary supersede (assignment-moved
    # or priority-escalation paths). Non-running workers are NOT protected;
    # recovery flows still work. Default 300s
    # (5 min) is enough to absorb a normal supervisor reshuffle without
    # killing real work; set to 0 to disable. See worker_in_dispatch_cooldown.
    settings.setdefault("dispatch_cooldown_seconds", 300)
    return settings


def max_tasks_per_agent_for_lane(settings: dict[str, Any], agent_id: str) -> int:
    default = max(1, int(settings.get("max_tasks_per_agent", 1)))
    raw_overrides = settings.get("max_tasks_per_agent_by_lane") or settings.get("max_tasks_per_agent_by_agent") or {}
    if not isinstance(raw_overrides, dict):
        return default
    normalized_agent_id = normalize_agent_id(agent_id)
    for key, value in raw_overrides.items():
        if normalize_agent_id(str(key)) != normalized_agent_id:
            continue
        try:
            # A lane override of 0 is an intentional operator disable/ban.
            return max(0, int(value))
        except (TypeError, ValueError):
            return default
    return default


def lane_dispatch_disabled(config: dict[str, Any], agent_id: str) -> bool:
    """True when local dispatcher policy intentionally disables a lane."""
    settings = ready_dispatch_settings(config)
    return max_tasks_per_agent_for_lane(settings, agent_id) <= 0


def helper_claim_settings(config: dict[str, Any]) -> dict[str, Any]:
    settings = dict(ready_dispatch_settings(config).get("helper_claim", {}) or {})
    settings.setdefault("enabled", False)
    settings.setdefault("task_statuses", ["backlog", "todo", "in_progress", "review"])
    settings.setdefault("availability_first", True)
    settings.setdefault("allow_any_idle_lane", True)
    settings.setdefault("prefer_assigned_when_idle", True)
    settings.setdefault("require_assigned_agent_busy", True)
    settings.setdefault("require_owner_higher_priority_load", False)
    settings.setdefault("respect_explicit_owner_when_paused", True)
    return settings


# Supervisor-generated unblock tasks must never become parents of another
# unblock task, or the recovery flow recursively reproduces itself.
GOVERNANCE_TASK_CLASSES = {"unblock"}


def is_governance_artifact(task: dict[str, Any] | None) -> bool:
    """True when a task is an auto-generated unblock/repair artifact.

    Used as the recursion base case: governance artifacts do not get their own
    governance children. Detects three independent markers so a generator that
    sets any one of them is covered."""
    if not isinstance(task, dict):
        return False
    if str(task.get("task_class") or "").strip().lower() in GOVERNANCE_TASK_CLASSES:
        return True
    if task.get("auto_generated"):
        return True
    if str(task.get("helper_parent") or "").strip():
        return True
    return False


def governance_lineage_depth(task: dict[str, Any] | None, task_map: dict[str, dict[str, Any]]) -> int:
    """Number of ancestors reachable via the `helper_parent` chain above `task`.

    A first-class task has depth 0; its unblock child has depth 1; a
    repair-of-the-repair would be depth 2. Cycle-safe (bounded by `seen`)."""
    depth = 0
    seen: set[str] = set()
    current = task
    while isinstance(current, dict):
        parent_id = str(current.get("helper_parent") or "").strip()
        if not parent_id or parent_id in seen:
            break
        seen.add(parent_id)
        depth += 1
        current = task_map.get(parent_id)
    return depth


def task_phase_priority(task: dict[str, Any], task_map: dict[str, dict[str, Any]], dependency_done_statuses: set[str]) -> int:
    status = str(task.get("status") or "").lower()
    if status == "in_progress":
        return 0
    if status == "review":
        return 1
    if status in {"integrating", "acceptance"}:
        return 2
    if status in {"todo", "backlog"} and dependencies_satisfied(task, task_map, dependency_done_statuses):
        return 3
    if status in {"todo", "backlog"}:
        return 4
    if status == "blocked":
        return 5
    return 9


def agent_has_dispatchable_primary_work(
    config: dict[str, Any],
    status: dict[str, Any],
    agent_name: str,
    task_map: dict[str, dict[str, Any]],
) -> bool:
    policy = ReadyDispatchPolicy.from_config(config)
    for task in status.get("tasks", []) or []:
        decision = resolve_domain_dispatch_target(task, task_map, policy)
        if decision is not None and decision.target_agent == agent_name:
            return True
    return False


def redispatch_candidate_statuses(config: dict[str, Any]) -> set[str]:
    policy = ReadyDispatchPolicy.from_config(config)
    statuses = set(policy.review_statuses)
    statuses.update(policy.acceptance_statuses)
    statuses.update(policy.in_progress_statuses)
    statuses.update(policy.owned_statuses)
    return statuses


def dependencies_satisfied(task: dict[str, Any], task_map: dict[str, dict[str, Any]], done_statuses: set[str]) -> bool:
    return domain_dependencies_satisfied(task, task_map, done_statuses)


def active_worker_indexes(state: dict[str, Any], active_statuses: set[str]) -> tuple[set[str], set[tuple[str, str]]]:
    agents: set[str] = set()
    task_agents: set[tuple[str, str]] = set()
    for worker in state.get("workers", {}).values():
        if worker.get("status") not in active_statuses:
            continue
        agent_id = str(worker.get("agent_id") or "")
        task_id = str(worker.get("task_id") or "")
        if agent_id:
            agents.add(agent_id)
        if task_id and agent_id:
            task_agents.add((task_id, agent_id))
    return agents, task_agents


def active_worker_agent_counts(state: dict[str, Any], active_statuses: set[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for worker in state.get("workers", {}).values():
        if worker.get("status") not in active_statuses:
            continue
        agent_id = str(worker.get("agent_id") or "")
        if agent_id:
            counts[agent_id] = counts.get(agent_id, 0) + 1
    return counts


def active_worker_queue_event_ids(state: dict[str, Any], active_statuses: set[str]) -> set[str]:
    event_ids: set[str] = set()
    for worker in state.get("workers", {}).values():
        if worker.get("status") not in active_statuses:
            continue
        queue_event_id = str(worker.get("queue_event_id") or "")
        if queue_event_id:
            event_ids.add(queue_event_id)
    return event_ids
