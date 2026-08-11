from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

from common import canonical_artifact_path, load_status, utc_now, write_json
from control_plane.domain.dispatch_policy import task_index
from control_plane.infra.approval_repo import load_approval_state
from control_plane.infra.queue_repo import load_event_queue
from control_plane.domain.lane_health import worker_capacity_counts


ACTIVE_WORKER_STATUSES = {
    "running",
    "started",
    "waiting_approval",
    "suspended_approval",
    "manual_pending",
    "retry_backoff",
    "stalled",
    "fallback",
}


def control_plane_summary_path(config: dict[str, Any]) -> Path:
    return canonical_artifact_path(
        config,
        "control_plane_summary",
        "projections/control-plane-summary.json",
    )


def build_control_plane_summary(
    config: dict[str, Any],
    status: dict[str, Any],
    runtime: dict[str, Any],
    approvals: dict[str, Any],
    queued_events: list[dict[str, Any]],
    provider_report: dict[str, Any] | None = None,
) -> dict[str, Any]:
    tasks = task_index(status.get("tasks", []))
    workers = runtime.get("workers") or {}
    active_workers = [
        {
            "run_id": run_id,
            "task_id": worker.get("task_id"),
            "agent_id": worker.get("agent_id"),
            "provider": worker.get("provider"),
            "status": worker.get("status"),
            "mode": worker.get("mode"),
            "role": worker.get("role") or (worker.get("metadata") or {}).get("control_role"),
            "last_event_at": worker.get("last_event_at"),
            "resource_usage": worker.get("resource_usage"),
            "approval_id": worker.get("deferred_action") or worker.get("last_approval_id"),
        }
        for run_id, worker in workers.items()
        if isinstance(worker, dict)
        and str(worker.get("status") or "") in ACTIVE_WORKER_STATUSES
    ]
    queue_records = (runtime.get("queue") or {}).get("events") or {}
    queue_status_counts = Counter(
        str(record.get("status") or "unknown")
        for record in queue_records.values()
        if isinstance(record, dict)
    )
    task_status_counts = Counter(task.status or "unknown" for task in tasks.values())
    report = provider_report or {}
    configured_agents = config.get("agents") or {}
    if isinstance(configured_agents, dict):
        agent_records = [
            {"id": agent_id, **agent}
            for agent_id, agent in configured_agents.items()
            if isinstance(agent, dict)
        ]
    else:
        agent_records = list(configured_agents)
    lanes = [
        {
            "id": str(agent.get("id") or ""),
            "name": str(agent.get("name") or agent.get("id") or ""),
            "enabled": agent.get("enabled", True) is not False,
            "capacity": agent.get("capacity"),
            "provider": agent.get("provider"),
            "identity": ((report.get("providers") or {}).get(agent.get("provider") or "", {}).get("identity") or {}),
            "load": worker_capacity_counts(workers, str(agent.get("id") or "")),
        }
        for agent in agent_records
        if isinstance(agent, dict) and agent.get("id")
    ]
    adapter_report = report.get("agent_adapters") or {}
    provider_summary = {
        "generated_at": report.get("generated_at"),
        "agents": {
            agent_id: {
                key: record.get(key)
                for key in (
                    "adapter",
                    "supported",
                    "can_auto_deliver",
                    "requires_manual_confirmation",
                    "verified",
                )
            }
            for agent_id, record in adapter_report.items()
            if isinstance(record, dict)
        },
    }
    pending_approvals = [
        item
        for item in approvals.get("pending", [])
        if isinstance(item, dict) and item.get("status") == "pending"
    ]

    provider_pauses = runtime.get("provider_pauses") or {}
    identity_lanes: dict[str, list[str]] = {}
    quota_pool_lanes: dict[str, list[str]] = {}
    for lane in lanes:
        identity = lane.get("identity") or {}
        fingerprint = str(identity.get("fingerprint") or "")
        quota_pool = str(identity.get("quota_pool") or "")
        if fingerprint:
            identity_lanes.setdefault(fingerprint, []).append(str(lane["id"]))
        if quota_pool:
            quota_pool_lanes.setdefault(quota_pool, []).append(str(lane["id"]))

    def effective_pause_lanes(pause: dict[str, Any]) -> list[str]:
        scope = str(pause.get("scope") or "lane")
        if scope == "identity":
            return identity_lanes.get(str(pause.get("identity_fingerprint") or ""), [])
        if scope == "quota_pool":
            return quota_pool_lanes.get(str(pause.get("quota_pool") or ""), [])
        lane_id = str(pause.get("lane_id") or "")
        return [lane_id] if lane_id else []

    slim_provider_pauses = {
        agent_id: {
            "kind": pause.get("kind"),
            "reason": str(pause.get("reason") or "")[:240],
            "paused_at": pause.get("paused_at"),
            "resume_at": pause.get("resume_at"),
            "resume_at_source": pause.get("resume_at_source"),
            "scope": pause.get("scope", "lane"),
            "lane_id": pause.get("lane_id"),
            "identity_fingerprint": pause.get("identity_fingerprint"),
            "quota_pool": pause.get("quota_pool"),
            "effective_lanes": effective_pause_lanes(pause),
        }
        for agent_id, pause in provider_pauses.items()
        if isinstance(pause, dict)
    }
    dispatch_pauses = [
        pause
        for pause in (runtime.get("dispatch_pauses") or [])
        if isinstance(pause, dict)
    ]
    dispatch_pause_counts = Counter(
        str(pause.get("failure_kind") or "unknown") for pause in dispatch_pauses
    )
    recent_dispatch_pauses = sorted(
        dispatch_pauses,
        key=lambda pause: str(pause.get("paused_at") or ""),
        reverse=True,
    )[:50]
    slim_dispatch_pauses = [
        {
            "task_id": pause.get("task_id"),
            "provider": pause.get("provider"),
            "worker_run_id": pause.get("worker_run_id"),
            "failure_kind": pause.get("failure_kind"),
            "paused_at": pause.get("paused_at"),
            "blocked_until": pause.get("blocked_until"),
            "summary": str(pause.get("summary") or "")[:240],
        }
        for pause in recent_dispatch_pauses
    ]
    supervisor = runtime.get("supervisor") or {}
    slim_supervisor = {
        key: supervisor.get(key)
        for key in (
            "pid",
            "started_at",
            "last_heartbeat_at",
            "focus_mode",
            "mode_status",
            "lifecycle",
            "last_git_reconcile_at",
        )
    }
    disk_guard = runtime.get("disk_guard") or {}
    slim_disk_guard = {
        key: disk_guard.get(key)
        for key in (
            "last_check_at",
            "last_cleanup_at",
            "dispatch_blocked",
            "usage_percent",
            "free_gb",
            "reason",
        )
    }
    resource_guard = runtime.get("resource_guard") or {}
    slim_resource_guard = {
        key: resource_guard.get(key)
        for key in (
            "last_check_at",
            "cgroup_path",
            "memory_current_bytes",
            "memory_max_bytes",
            "memory_pressure_some_avg10",
            "memory_events",
        )
    }

    return {
        "version": 1,
        "generated_at": utc_now(),
        "supervisor": slim_supervisor,
        "tasks": {
            "total": len(tasks),
            "by_status": dict(sorted(task_status_counts.items())),
        },
        "runtime": {
            "active_workers": active_workers,
            "active_worker_count": len(active_workers),
            "provider_pauses": slim_provider_pauses,
            "pause_schema": runtime.get("provider_pause_schema", 1),
            "dispatch_pauses": {
                "total": len(dispatch_pauses),
                "by_failure_kind": dict(sorted(dispatch_pause_counts.items())),
                "recent": slim_dispatch_pauses,
                "recent_limit": 50,
            },
            "disk_guard": slim_disk_guard,
            "resource_guard": slim_resource_guard,
        },
        "queue": {
            "pending_file_events": len(queued_events),
            "by_status": dict(sorted(queue_status_counts.items())),
        },
        "approvals": {
            "pending_count": len(pending_approvals),
            "pending": [
                {
                    "approval_id": item.get("approval_id"),
                    "worker_run_id": item.get("worker_run_id"),
                    "task_id": item.get("task_id"),
                    "provider": item.get("provider"),
                    "created_at": item.get("created_at"),
                }
                for item in pending_approvals
            ],
        },
        "lanes": lanes,
        "provider_report": provider_summary,
    }


def refresh_control_plane_summary(
    config: dict[str, Any],
    runtime: dict[str, Any],
    provider_report: dict[str, Any] | None = None,
) -> None:
    summary = build_control_plane_summary(
        config,
        load_status(config),
        runtime,
        load_approval_state(config),
        load_event_queue(config),
        provider_report,
    )
    write_json(control_plane_summary_path(config), summary)
