from __future__ import annotations

"""Deterministic admission rules for the shared worker host."""

from dataclasses import dataclass
from typing import Any, Mapping


ACTIVE_EXECUTION_STATUSES = frozenset(
    {"running", "started", "draining", "fallback", "retry_backoff", "stalled"}
)
ACTIVE_CAPACITY_STATUSES = ACTIVE_EXECUTION_STATUSES | frozenset(
    {"waiting_approval", "suspended_approval", "manual_pending"}
)


@dataclass(frozen=True)
class AdmissionDecision:
    allowed: bool
    reason: str
    execution_count: int
    control_count: int
    heavy_count: int
    lane_count: int = 0
    total_count: int = 0


def settings(config: Mapping[str, Any]) -> dict[str, Any]:
    raw = dict((config.get("supervisor") or {}).get("resource_guard", {}) or {})
    raw.setdefault("enabled", True)
    raw.setdefault("max_total_workers", 12)
    raw.setdefault("max_execution_workers", 12)
    raw.setdefault("max_control_workers", 1)
    raw.setdefault("max_heavy_workers", 1)
    raw.setdefault("dispatch_memory_high_bytes", 2684354560)
    raw.setdefault("dispatch_pressure_avg10", 60.0)
    return raw


def _worker_role(worker: Mapping[str, Any]) -> str:
    metadata = worker.get("metadata") if isinstance(worker.get("metadata"), Mapping) else {}
    return str(worker.get("role") or metadata.get("control_role") or "").lower()


def worker_counts(workers: Mapping[str, Any]) -> tuple[int, int, int]:
    execution = control = heavy = 0
    for worker in workers.values():
        if not isinstance(worker, Mapping):
            continue
        if str(worker.get("status") or "") not in ACTIVE_EXECUTION_STATUSES:
            continue
        metadata = worker.get("metadata") if isinstance(worker.get("metadata"), Mapping) else {}
        if _worker_role(worker) == "chair":
            control += 1
            continue
        execution += 1
        if str(metadata.get("resource_profile") or "").lower() == "heavy":
            heavy += 1
    return execution, control, heavy


def lane_count(workers: Mapping[str, Any], agent_id: str | None) -> int:
    normalized = str(agent_id or "").strip().lower()
    if not normalized:
        return 0
    return sum(
        1
        for worker in workers.values()
        if isinstance(worker, Mapping)
        and str(worker.get("status") or "") in ACTIVE_CAPACITY_STATUSES
        and str(worker.get("agent_id") or worker.get("provider") or "").strip().lower() == normalized
        and _worker_role(worker) != "chair"
    )


def decide(
    config: Mapping[str, Any],
    state: Mapping[str, Any],
    metadata: Mapping[str, Any] | None = None,
    agent_id: str | None = None,
) -> AdmissionDecision:
    cfg = settings(config)
    workers = state.get("workers") or {}
    execution, control, heavy = worker_counts(workers)
    total = sum(
        1
        for worker in workers.values()
        if isinstance(worker, Mapping)
        and str(worker.get("status") or "") in ACTIVE_CAPACITY_STATUSES
    )
    if not cfg.get("enabled", True):
        return AdmissionDecision(True, "resource guard disabled", execution, control, heavy, total_count=total)

    metadata = metadata or {}
    lane_workers = lane_count(workers, agent_id)
    is_control = str(metadata.get("control_role") or "").lower() == "chair"
    is_heavy = str(metadata.get("resource_profile") or "").lower() == "heavy"
    if total >= int(cfg["max_total_workers"]):
        return AdmissionDecision(False, "global worker limit reached", execution, control, heavy, lane_workers, total)
    if is_control and control >= int(cfg["max_control_workers"]):
        return AdmissionDecision(False, "control worker limit reached", execution, control, heavy)
    if not is_control and execution >= int(cfg["max_execution_workers"]):
        return AdmissionDecision(False, "global execution worker limit reached", execution, control, heavy)
    if is_heavy and heavy >= int(cfg["max_heavy_workers"]):
        return AdmissionDecision(False, "heavy verification worker limit reached", execution, control, heavy)
    if not is_control and agent_id:
        ready = dict(config.get("ready_dispatcher") or {})
        per_lane = dict(ready.get("max_tasks_per_agent_by_lane") or {})
        limit = int(per_lane.get(str(agent_id).strip().lower(), ready.get("max_tasks_per_agent", 1)) or 0)
        if lane_workers >= max(0, limit):
            return AdmissionDecision(False, "lane worker limit reached", execution, control, heavy, lane_workers, total)

    snapshot = state.get("resource_guard") if isinstance(state.get("resource_guard"), Mapping) else {}
    worker_memory = int(snapshot.get("worker_memory_current_bytes") or 0)
    if worker_memory and worker_memory >= int(cfg["dispatch_memory_high_bytes"]):
        return AdmissionDecision(False, "worker memory admission threshold reached", execution, control, heavy, lane_workers, total)
    host_available = int(snapshot.get("host_available_bytes") or 0)
    min_host_available = int(cfg.get("min_host_available_bytes", 0) or 0)
    if min_host_available and host_available and host_available < min_host_available:
        return AdmissionDecision(False, "host available memory threshold reached", execution, control, heavy, lane_workers, total)
    pressure = float(snapshot.get("memory_pressure_some_avg10") or 0.0)
    if pressure >= float(cfg["dispatch_pressure_avg10"]):
        return AdmissionDecision(False, "worker memory pressure admission threshold reached", execution, control, heavy, lane_workers, total)
    return AdmissionDecision(True, "admitted", execution, control, heavy, lane_workers, total)
