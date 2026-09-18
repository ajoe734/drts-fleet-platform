from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

from common import config_path, load_status, utc_now, write_json
from control_plane.domain.dispatch_policy import (
    ReadyDispatchPolicy,
    dispatch_preview,
    task_index,
)
from control_plane.domain.worker_lifecycle import is_active_worker
from control_plane.infra.approval_repo import load_approval_state
from control_plane.infra.queue_repo import load_event_queue


def control_plane_summary_path(config: dict[str, Any]) -> Path:
    return config_path(
        config,
        "control_plane_summary",
        ".orchestrator/projections/control-plane-summary.json",
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
    policy = ReadyDispatchPolicy.from_config(config)
    previews: dict[str, Any] = {}
    for task_id, task in tasks.items():
        preview = dispatch_preview(
            task,
            tasks,
            policy,
            source="control-plane-summary",
        )
        if preview is not None:
            previews[task_id] = preview["decision"]

    workers = runtime.get("workers") or {}
    active_workers = [
        {
            "run_id": run_id,
            "task_id": worker.get("task_id"),
            "agent_id": worker.get("agent_id"),
            "provider": worker.get("provider"),
            "status": worker.get("status"),
            "mode": worker.get("mode"),
            "last_event_at": worker.get("last_event_at"),
        }
        for run_id, worker in workers.items()
        if isinstance(worker, dict) and is_active_worker(worker)
    ]
    queue_records = (runtime.get("queue") or {}).get("events") or {}
    queue_status_counts = Counter(
        str(record.get("status") or "unknown")
        for record in queue_records.values()
        if isinstance(record, dict)
    )
    task_status_counts = Counter(task.status or "unknown" for task in tasks.values())
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
        }
        for agent in agent_records
        if isinstance(agent, dict) and agent.get("id")
    ]
    report = provider_report or {}
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
    slim_provider_pauses = {
        agent_id: {
            "kind": pause.get("kind"),
            "reason": str(pause.get("reason") or "")[:240],
            "paused_at": pause.get("paused_at"),
            "resume_at": pause.get("resume_at"),
            "resume_at_source": pause.get("resume_at_source"),
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

    return {
        "version": 1,
        "generated_at": utc_now(),
        "supervisor": slim_supervisor,
        "tasks": {
            "total": len(tasks),
            "by_status": dict(sorted(task_status_counts.items())),
            "dispatch_previews": previews,
        },
        "runtime": {
            "active_workers": active_workers,
            "active_worker_count": len(active_workers),
            "provider_pauses": slim_provider_pauses,
            "dispatch_pauses": {
                "total": len(dispatch_pauses),
                "by_failure_kind": dict(sorted(dispatch_pause_counts.items())),
                "recent": slim_dispatch_pauses,
                "recent_limit": 50,
            },
            "disk_guard": slim_disk_guard,
        },
        "queue": {
            "pending_file_events": len(queued_events),
            "by_status": dict(sorted(queue_status_counts.items())),
        },
        "approvals": {"pending_count": len(pending_approvals)},
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
