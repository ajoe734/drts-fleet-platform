#!/usr/bin/env python3
from __future__ import annotations

import argparse
import atexit
import hashlib
import json
import os
import socket
import random
import re
import shlex
import signal
import subprocess
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

THIS_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = THIS_DIR.parents[1]
SUPERVISOR_ENTRYPOINT = Path(__file__).resolve()
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from adapters import build_adapter
from approval_queue import prune_stale_approvals, resolve_approval
from adapters.base import DeliveryRequest
from branch_routing import route_task
from control_plane.domain.dispatch_policy import (
    DispatchDecision as DomainDispatchDecision,
    DispatchReason as DomainDispatchReason,
    ReadyDispatchPolicy,
    build_dispatch_event as build_domain_dispatch_event,
    ready_dispatch_signature as domain_ready_dispatch_signature,
    resolve_dispatch_target as resolve_domain_dispatch_target,
)
from control_plane.domain.worker_lifecycle import (
    ACTIVE_WORKER_STATUSES as ACTIVE_RUNTIME_STATUSES,
    consume_result as consume_worker_result,
    is_active_worker,
    is_terminal_worker,
    redispatch_is_deferred,
)
from control_plane.domain.failure_policy import (
    classify_failure as classify_domain_failure,
    infer_pause_resume_at as infer_domain_pause_resume_at,
    retry_settings as domain_retry_settings,
)
from control_plane.domain.resource_admission import decide as resource_admission_decision
from control_plane.domain.lane_health import pause_matches_lane
from control_plane.domain.chair_policy import (
    normalize_review_defaults as normalize_domain_review_defaults,
)
from control_plane.infra.approval_repo import load_approval_state
from control_plane.infra.queue_repo import (
    enqueue_event,
    load_event_queue,
    queue_repository,
)
from control_plane.infra.runtime_repo import (
    clear_dispatch_pause,
    load_runtime_state,
    queue_event_record,
    save_runtime_state,
    upsert_dispatch_pause,
)
from control_plane.infra.worker_failure_detector import (
    WorkerFailureSignal,
    detect_worker_failure,
    detect_worker_failure_signal,
)
from control_plane.infra.worker_evidence import (
    brief_reason_text,
    record_worker_evidence,
    summarize_worker_failure,
)
from control_plane.infra.worktree_maintenance import (
    _disk_guard_path,
    _disk_guard_should_cleanup,
    _prune_worktree_archive,
    cleanup_inactive_worker_worktrees,
    disk_guard_settings,
    disk_usage_snapshot,
    prune_stale_worker_worktrees,
    worktree_cleanup_settings,
)
from control_plane.projections.control_plane_summary import (
    refresh_control_plane_summary,
)
from control_plane.policies.optional_automation import OptionalAutomation
from control_plane.usecases.supervisor_tick import (
    SupervisorTickOptions,
    SupervisorTickPorts,
    SupervisorTickRunner,
)
from control_plane.usecases.task_board_commands import run_task_board_command
from control_plane.usecases.dispatch_runtime import (
    active_worker_agent_counts,
    active_worker_indexes,
    active_worker_queue_event_ids,
    agent_has_dispatchable_primary_work,
    dependencies_satisfied,
    governance_lineage_depth,
    helper_claim_settings,
    is_governance_artifact,
    lane_dispatch_disabled,
    max_tasks_per_agent_for_lane,
    ready_dispatch_settings,
    redispatch_candidate_statuses,
    task_phase_priority,
)
from control_plane.usecases.chair_review_policy import (
    blocked_task_triage_kind,
    chair_provider_pause_reason_is_actionable,
    chair_task_action_index,
    pending_approval_items,
    validate_chair_review_payload,
)
from common import (
    AI_GUIDE_PATH,
    ROTATION_FALLBACK_SLOT,
    ROTATION_PRIMARY_SLOT,
    agent_config_for,
    antigravity_rotation_config,
    apply_worker_unit_env,
    background_process_pid,
    canonical_relpath,
    command_exists,
    config_path,
    record_rotation_cooldown,
    display_name_for,
    ensure_task_brief,
    load_config,
    load_json,
    load_status,
    new_runtime_id,
    normalize_agent_id,
    parse_iso_utc as parse_runtime_timestamp,
    relpath,
    runtime_env_overrides,
    selected_shared_files,
    shell_quote,
    snapshot_task,
    spawn_background_process,
    task_board_cli_path,
    utc_now,
    write_activity_log,
)
from github_bus import sync_github_bus
from provider_permissions import provider_capabilities as build_provider_capabilities, write_provider_capabilities
from watch_events import queue_delivery_event, run_scan, trim_seen_events


SESSION_ID_PATTERNS = [
    re.compile(r'"session_id"\s*:\s*"([^"]+)"'),
    re.compile(r'"sessionId"\s*:\s*"([^"]+)"'),
]
URL_PATTERN = re.compile(r"https://github\.com/[^\s)]+")

LOCAL_TZ = ZoneInfo("Asia/Taipei")
SUPERVISOR_LOG_QUIET = False
# Process-lifetime counter for the fallback-reap oscillation breaker. Kept as a
# module global (not in `state`) because `state` is reloaded from disk each cycle,
# which would reset per-cycle increments and defeat the cap. Resets on restart.
_FALLBACK_REAP_COUNTS: dict[str, int] = {}
MODE_BUCKETS = ("planning", "execution", "coordination")
EXECUTION_DISPATCH_REASONS = {
    "review_ready_dispatch",
    "owned_in_progress_dispatch",
    "owned_ready_dispatch",
    "acceptance_ready_dispatch",
}
CHAIRMAN_SKILL_PATH = THIS_DIR / "skills" / "chairman-operational-review.md"


class SupervisorShutdown(Exception):
    def __init__(self, signum: int) -> None:
        self.signum = signum
        self.reason = supervisor_shutdown_reason(signum)
        super().__init__(self.reason)


CHAIRMAN_JSON_TEMPLATE_PATH = THIS_DIR / "templates" / "chairman-decision-packet.example.json"
CHAIRMAN_REPORT_TEMPLATE_PATH = THIS_DIR / "templates" / "chairman-review-report-template.md"
PREMATURE_EXIT_REASON = "Worker exited before the task reached a terminal status."
WORKSPACE_BASELINE_TASK_ID = "UI-BASELINE-001"
WORKSPACE_BASELINE_HELPER_KIND = "workspace_baseline_repair"
WORKSPACE_BASELINE_MARKERS = (
    "workspace-baseline repair",
    "workspace baseline repair",
    "baseline repair task",
    "shared workspace-baseline blocker",
    "shared workspace baseline blocker",
    "@drts/ui-tokens",
    "@drts/contracts",
    "module resolution",
    "strict-ts",
    "strict ts",
    "isolated-worktree toolchain",
    "worktree toolchain",
)
TASK_ID_MENTION_PATTERN = re.compile(r"\b[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+\b")


def _sd_notify(message: str) -> None:
    """Send a state message to systemd via the sd_notify protocol.

    Used to deliver periodic WATCHDOG=1 heartbeats so a non-zero
    WatchdogSec in the unit file accurately detects a hung tick loop
    (instead of killing a healthy supervisor every interval — the
    failure mode that produced OPS-SUPERVISOR-WATCHDOG-OFF-001 #313).

    No-op when NOTIFY_SOCKET is unset (the supervisor is not running
    under systemd, e.g., interactive smoke tests or --once invocations).
    All socket / OS errors are swallowed so heartbeat delivery cannot
    take the supervisor down.
    """
    sock_path = os.environ.get("NOTIFY_SOCKET")
    if not sock_path:
        return
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        try:
            # systemd encodes abstract namespace sockets with a leading '@';
            # the kernel expects a leading NUL byte for those.
            if sock_path.startswith("@"):
                sock_path = "\0" + sock_path[1:]
            sock.connect(sock_path)
            sock.sendall(message.encode("utf-8"))
        finally:
            sock.close()
    except OSError:
        return


def supervisor_pid_path(config: dict[str, Any]) -> Path:
    return config_path(config, "state_file").parent / "supervisor.pid"


def write_supervisor_pid(config: dict[str, Any]) -> None:
    path = supervisor_pid_path(config)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"{os.getpid()}\n", encoding="utf-8")
    except OSError as exc:
        console_log(f"unable to write supervisor pid file {path}: {exc}", quiet=SUPERVISOR_LOG_QUIET)


def clear_supervisor_pid(config: dict[str, Any]) -> None:
    path = supervisor_pid_path(config)
    if not path.exists():
        return
    try:
        current = path.read_text(encoding="utf-8").strip()
    except OSError:
        return
    if current == str(os.getpid()):
        path.unlink(missing_ok=True)




def maintain_disk_guard(config: dict[str, Any], state: dict[str, Any]) -> bool:
    resource_changed = maintain_resource_guard(config, state)
    settings = disk_guard_settings(config)
    if not settings.get("enabled", False):
        return resource_changed

    record = state.setdefault("disk_guard", {})
    path = _disk_guard_path(config, settings)
    snapshot = disk_usage_snapshot(path)
    if snapshot is None:
        record["last_check_at"] = utc_now()
        record["last_error"] = f"Unable to read disk usage for {path}"
        return True

    changed = resource_changed
    before_blocked = bool(record.get("dispatch_blocked"))
    record.update(snapshot)
    record["last_check_at"] = utc_now()

    cleanup_result: dict[str, Any] | None = None
    if _disk_guard_should_cleanup(record, settings, snapshot):
        cleanup_result = prune_stale_worker_worktrees(config, state, settings)
        # Cleanup archives dirty worktrees; keep that archive bounded so it does
        # not itself fill the disk and perpetuate the dispatch block.
        archive_prune = _prune_worktree_archive(worktree_cleanup_settings(config))
        if int(archive_prune.get("removed") or 0) > 0:
            record["last_archive_prune"] = archive_prune
        record["last_cleanup_at"] = utc_now()
        record["last_cleanup"] = cleanup_result
        changed = True
        refreshed = disk_usage_snapshot(path)
        if refreshed is not None:
            snapshot = refreshed
            record.update(snapshot)

    usage_percent = float(snapshot.get("usage_percent") or 0.0)
    free_gb = float(snapshot.get("free_gb") or 0.0)
    block_percent = float(settings.get("block_dispatch_usage_percent", 85.0))
    min_free_gb = float(settings.get("min_free_gb", 5.0))
    dispatch_blocked = usage_percent >= block_percent or free_gb < min_free_gb
    record["dispatch_blocked"] = dispatch_blocked
    record["reason"] = (
        f"disk usage {usage_percent:.2f}% >= {block_percent:.2f}% or free {free_gb:.2f}GB < {min_free_gb:.2f}GB"
        if dispatch_blocked
        else None
    )
    if before_blocked != dispatch_blocked:
        changed = True

    warn_percent = float(settings.get("warn_usage_percent", 80.0))
    if cleanup_result and int(cleanup_result.get("removed") or 0) > 0:
        archived = int(cleanup_result.get("archived") or 0)
        message = f"Pruned {cleanup_result.get('removed')} stale auto worktree(s)"
        if archived > 0:
            message += f" after archiving {archived} dirty worktree(s)"
        message += f"; disk usage now {usage_percent:.2f}% with {free_gb:.2f}GB free."
        try:
            write_activity_log(
                config,
                {
                    "type": "disk_guard_worktree_prune",
                    "message": message,
                    "checked": cleanup_result.get("checked"),
                    "removed": cleanup_result.get("removed"),
                    "skipped": cleanup_result.get("skipped"),
                    "failed": cleanup_result.get("failed"),
                    "archived": cleanup_result.get("archived"),
                    "errors": cleanup_result.get("errors"),
                    "usage_percent": usage_percent,
                    "free_gb": free_gb,
                },
            )
        except OSError:
            pass
    if dispatch_blocked or usage_percent >= warn_percent:
        console_log(
            (
                "disk guard: "
                f"usage={usage_percent:.2f}% free={free_gb:.2f}GB "
                f"dispatch_blocked={dispatch_blocked}"
            ),
            quiet=SUPERVISOR_LOG_QUIET,
        )
    return changed


def _current_cgroup_path() -> Path | None:
    try:
        for line in Path("/proc/self/cgroup").read_text(encoding="utf-8").splitlines():
            if line.startswith("0::"):
                current = Path("/sys/fs/cgroup") / line.split("::", 1)[1].lstrip("/")
                return current.parent if current.name.endswith(".service") else current
    except OSError:
        return None
    return None


def _read_cgroup_number(path: Path | None, name: str) -> int | None:
    if path is None:
        return None
    try:
        value = (path / name).read_text(encoding="utf-8").strip()
        return None if value == "max" else int(value)
    except (OSError, ValueError):
        return None


def _read_memory_pressure_avg10(path: Path | None) -> float | None:
    if path is None:
        return None
    try:
        for line in (path / "memory.pressure").read_text(encoding="utf-8").splitlines():
            if line.startswith("some "):
                match = re.search(r"avg10=([0-9.]+)", line)
                return float(match.group(1)) if match else None
    except (OSError, ValueError):
        return None
    return None


def _host_available_memory_bytes() -> int | None:
    try:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) * 1024
    except (OSError, ValueError, IndexError):
        return None
    return None


def maintain_resource_guard(config: dict[str, Any], state: dict[str, Any]) -> bool:
    record = state.setdefault("resource_guard", {})
    now = datetime.now(timezone.utc)
    last = parse_runtime_timestamp(str(record.get("last_check_at") or ""))
    settings = ((config.get("supervisor") or {}).get("resource_guard") or {})
    interval = float(settings.get("check_interval_seconds", 5.0))
    if last is not None and (now - last).total_seconds() < max(1.0, interval):
        return False

    cgroup = _current_cgroup_path()
    workers_by_unit = {
        str(worker.get("worker_unit") or ""): worker
        for worker in (state.get("workers") or {}).values()
        if isinstance(worker, dict) and worker.get("worker_unit")
    }
    worker_units: dict[str, int] = {}
    control_units: dict[str, int] = {}
    if cgroup is not None:
        try:
            for child in cgroup.glob("drts-worker-*.service"):
                usage = _read_cgroup_number(child, "memory.current")
                if usage is None:
                    continue
                worker = workers_by_unit.get(child.name)
                if worker is not None:
                    previous = worker.get("resource_usage") if isinstance(worker.get("resource_usage"), dict) else {}
                    peak = _read_cgroup_number(child, "memory.peak") or usage
                    worker["resource_usage"] = {
                        "sampled_at": utc_now(),
                        "memory_current_bytes": usage,
                        "memory_peak_bytes": max(int(previous.get("memory_peak_bytes") or 0), peak, usage),
                        "memory_high_bytes": _read_cgroup_number(child, "memory.high"),
                        "memory_max_bytes": _read_cgroup_number(child, "memory.max"),
                    }
                role = str((worker or {}).get("role") or ((worker or {}).get("metadata") or {}).get("control_role") or "")
                (control_units if role == "chair" else worker_units)[child.name] = usage
        except OSError:
            pass

    snapshot = {
        "last_check_at": utc_now(),
        "cgroup_path": str(cgroup) if cgroup else None,
        "memory_current_bytes": _read_cgroup_number(cgroup, "memory.current"),
        "worker_memory_current_bytes": sum(worker_units.values()),
        "control_memory_current_bytes": sum(control_units.values()),
        "worker_unit_count": len(worker_units),
        "control_unit_count": len(control_units),
        "host_available_bytes": _host_available_memory_bytes(),
        "memory_max_bytes": _read_cgroup_number(cgroup, "memory.max"),
        "memory_pressure_some_avg10": _read_memory_pressure_avg10(cgroup),
    }
    changed = any(record.get(key) != value for key, value in snapshot.items())
    record.update(snapshot)
    return changed


def disk_guard_dispatch_blocked(config: dict[str, Any], state: dict[str, Any]) -> bool:
    settings = disk_guard_settings(config)
    if not settings.get("enabled", False):
        return False
    record = state.get("disk_guard") if isinstance(state.get("disk_guard"), dict) else {}
    if bool(record.get("dispatch_blocked")):
        return True
    snapshot = disk_usage_snapshot(_disk_guard_path(config, settings))
    if snapshot is None:
        return False
    return (
        float(snapshot.get("usage_percent") or 0.0) >= float(settings.get("block_dispatch_usage_percent", 85.0))
        or float(snapshot.get("free_gb") or 0.0) < float(settings.get("min_free_gb", 5.0))
    )


def note_dispatch_blocked_by_disk_guard(config: dict[str, Any], state: dict[str, Any], source: str) -> bool:
    if not disk_guard_dispatch_blocked(config, state):
        return False
    guard = state.setdefault("disk_guard", {})
    reason = str(guard.get("reason") or "disk guard blocked dispatch")
    now = utc_now()
    last_at = parse_runtime_timestamp(guard.get("last_dispatch_block_log_at"))
    cooldown_seconds = 300.0
    if (
        guard.get("last_dispatch_block_source") == source
        and guard.get("last_dispatch_block_reason") == reason
        and last_at is not None
        and (datetime.now(timezone.utc) - last_at).total_seconds() < cooldown_seconds
    ):
        return False
    guard["last_dispatch_block_source"] = source
    guard["last_dispatch_block_reason"] = reason
    guard["last_dispatch_block_log_at"] = now
    try:
        write_activity_log(
            config,
            {
                "type": "dispatch_blocked_disk_guard",
                "source": source,
                "message": reason,
                "usage_percent": guard.get("usage_percent"),
                "free_gb": guard.get("free_gb"),
            },
        )
    except OSError:
        pass
    console_log(f"dispatch blocked by disk guard ({source}): {reason}", quiet=SUPERVISOR_LOG_QUIET)
    return True


def mark_dispatch_deferred_by_disk_guard(
    config: dict[str, Any],
    state: dict[str, Any],
    record: dict[str, Any],
    *,
    event_id: str | None = None,
    task_id: str | None = None,
    target_agent: str | None = None,
) -> bool:
    reason = str((state.get("disk_guard") or {}).get("reason") or "disk guard blocked dispatch")
    now = utc_now()
    changed = record.get("status") != "queued" or record.get("deferred_reason") != "disk_guard"
    record["status"] = "queued"
    record["deferred_reason"] = "disk_guard"
    record["last_deferred_at"] = now
    record["last_deferred_message"] = reason
    try:
        write_activity_log(
            config,
            {
                "type": "dispatch_deferred_disk_guard",
                "task_id": task_id,
                "target_agent": target_agent,
                "queue_event_id": event_id,
                "message": reason,
                "usage_percent": (state.get("disk_guard") or {}).get("usage_percent"),
                "free_gb": (state.get("disk_guard") or {}).get("free_gb"),
            },
        )
    except OSError:
        pass
    return changed


def supervisor_shutdown_reason(signum: int) -> str:
    try:
        signal_name = signal.Signals(signum).name
    except ValueError:
        signal_name = str(signum)
    return f"signal:{signal_name}"


def raise_supervisor_shutdown(signum: int, _frame: Any) -> None:
    raise SupervisorShutdown(signum)


def install_supervisor_signal_handlers() -> None:
    signal.signal(signal.SIGTERM, raise_supervisor_shutdown)
    signal.signal(signal.SIGINT, raise_supervisor_shutdown)


def _supervisor_script_arg_matches(
    part: str,
    *,
    current_script: str,
    current_script_name: str,
    current_script_rel: str,
) -> bool:
    return part == current_script or part == current_script_rel or part.endswith(f"/{current_script_name}")


def supervisor_cmdline_matches_current_script(parts: list[str], proc_cwd: str) -> bool:
    current_script = str(SUPERVISOR_ENTRYPOINT.resolve())
    current_script_name = SUPERVISOR_ENTRYPOINT.name
    current_script_rel = "tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py"
    current_repo_root = str(REPO_ROOT)
    if proc_cwd != current_repo_root or not parts:
        return False

    # Only match the actual supervisor process, not a parent wrapper such as
    # `timeout ... python3 tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py` or a shell/nohup launcher.
    executable = Path(parts[0]).name
    if _supervisor_script_arg_matches(
        parts[0],
        current_script=current_script,
        current_script_name=current_script_name,
        current_script_rel=current_script_rel,
    ):
        return True
    if executable.startswith("python") and len(parts) > 1:
        return _supervisor_script_arg_matches(
            parts[1],
            current_script=current_script,
            current_script_name=current_script_name,
            current_script_rel=current_script_rel,
        )
    return False


def iter_matching_supervisor_pids() -> list[int]:
    matches: list[int] = []
    for proc_dir in Path("/proc").iterdir():
        if not proc_dir.name.isdigit():
            continue
        pid = int(proc_dir.name)
        cmdline_path = proc_dir / "cmdline"
        try:
            raw = cmdline_path.read_bytes()
        except OSError:
            continue
        if not raw:
            continue
        parts = [part.decode("utf-8", errors="ignore") for part in raw.split(b"\x00") if part]
        try:
            proc_cwd = str((proc_dir / "cwd").resolve())
        except OSError:
            proc_cwd = ""
        if supervisor_cmdline_matches_current_script(parts, proc_cwd):
            matches.append(pid)
    return sorted(matches)


def terminate_older_supervisors(config: dict[str, Any]) -> None:
    current_pid = os.getpid()
    terminated: list[int] = []
    for pid in iter_matching_supervisor_pids():
        if pid >= current_pid:
            continue
        if not pid_is_alive(pid):
            continue
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            continue
        deadline = time.time() + 2.0
        while time.time() < deadline and pid_is_alive(pid):
            time.sleep(0.1)
        if pid_is_alive(pid):
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                pass
            deadline = time.time() + 1.0
            while time.time() < deadline and pid_is_alive(pid):
                time.sleep(0.05)
        terminated.append(pid)
    for pid in terminated:
        write_activity_log(
            config,
            {
                "type": "supervisor_replaced",
                "message": f"Terminated older supervisor process {pid} while starting {current_pid}.",
                "old_pid": pid,
                "new_pid": current_pid,
            },
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local orchestrator supervisor loop.")
    parser.add_argument("--config", default=".orchestrator/config.json")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--no-watch", action="store_true", help="Process the event queue without running watch_events first.")
    parser.add_argument("--replay", action="store_true", help="Pass replay through to watch_events for the first scan.")
    parser.add_argument("--poll-interval", type=float, default=None)
    parser.add_argument("--quiet", action="store_true", help="Suppress terminal heartbeat output.")
    parser.add_argument("--verbose", action="store_true", help="Print active worker and queue details each tick.")
    return parser.parse_args()


def console_log(message: str, *, quiet: bool = False) -> None:
    if quiet:
        return
    timestamp = datetime.now(LOCAL_TZ).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)


def heartbeat_lag_seconds(previous_heartbeat: str | None, current_heartbeat: str | None) -> float | None:
    previous_dt = parse_runtime_timestamp(previous_heartbeat)
    current_dt = parse_runtime_timestamp(current_heartbeat)
    if previous_dt is None or current_dt is None:
        return None
    return max(0.0, (current_dt - previous_dt).total_seconds())


def format_runtime_timestamp_local(ts: str | None) -> str:
    dt = parse_runtime_timestamp(ts)
    if dt is None:
        return "-"
    return dt.astimezone(LOCAL_TZ).strftime("%Y-%m-%d %H:%M:%S")


def _git_capture(repo_root: Path, args: list[str], *, timeout: float = 30.0) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=str(repo_root),
        text=True,
        capture_output=True,
        timeout=timeout,
    )


def _task_branch(agent_id: str, task_id: str) -> str:
    return f"{normalize_agent_id(agent_id)}/{task_id.lower()}"


def _execution_branch(repo_root: Path, request: DeliveryRequest) -> str:
    """Prefer a task-scoped branch override only when Git accepts it."""
    default_branch = _task_branch(request.agent_id, request.task_id or "")
    metadata = request.metadata if isinstance(request.metadata, dict) else {}
    task = metadata.get("task") if isinstance(metadata.get("task"), dict) else {}
    configured_branch = task.get("execution_branch")
    if not isinstance(configured_branch, str) or not configured_branch.strip():
        return default_branch

    result = _git_capture(
        repo_root,
        ["check-ref-format", "--branch", configured_branch.strip()],
    )
    if result.returncode != 0:
        return default_branch
    return (result.stdout or "").strip() or default_branch


def _worktree_entries(repo_root: Path) -> list[dict[str, str]]:
    result = _git_capture(repo_root, ["worktree", "list", "--porcelain"])
    if result.returncode != 0:
        return []
    entries: list[dict[str, str]] = []
    current: dict[str, str] = {}
    for line in result.stdout.splitlines():
        if not line.strip():
            if current:
                entries.append(current)
                current = {}
            continue
        key, _, value = line.partition(" ")
        current[key] = value.strip()
    if current:
        entries.append(current)
    return entries


def _path_is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
    except ValueError:
        return False
    return True


def _worktree_for_branch(
    repo_root: Path,
    branch: str,
    *,
    exclude: Path | None = None,
    within: Path | None = None,
) -> Path | None:
    ref = f"refs/heads/{branch}"
    excluded = exclude.resolve() if exclude else None
    required_parent = within.resolve() if within else None
    for entry in _worktree_entries(repo_root):
        if entry.get("branch") == ref and entry.get("worktree"):
            path = Path(entry["worktree"]).resolve()
            if excluded is not None and path == excluded:
                continue
            if required_parent is not None and not _path_is_within(path, required_parent):
                continue
            return path
    return None


def _current_branch(path: Path) -> str | None:
    result = _git_capture(path, ["branch", "--show-current"])
    if result.returncode != 0:
        return None
    return (result.stdout or "").strip() or None


def _branch_exists(repo_root: Path, branch: str) -> bool:
    return _git_capture(repo_root, ["show-ref", "--verify", "--quiet", f"refs/heads/{branch}"]).returncode == 0


def _remote_branch_exists(repo_root: Path, branch: str) -> bool:
    return _git_capture(repo_root, ["rev-parse", "--verify", "--quiet", f"origin/{branch}"]).returncode == 0


def _worker_worktree_base(config: dict[str, Any], repo_root: Path) -> Path:
    settings = ((config.get("branch_strategy") or {}).get("worker_worktrees") or {})
    raw_root = str(settings.get("root") or ".artifacts/worktrees/auto").strip()
    base = Path(raw_root).expanduser()
    if not base.is_absolute():
        base = repo_root / base
    return base.resolve()


def _worker_worktrees_enabled(config: dict[str, Any]) -> bool:
    settings = ((config.get("branch_strategy") or {}).get("worker_worktrees") or {})
    return settings.get("enabled", True) is not False


def _candidate_worktree_path(base: Path, agent_id: str, task_id: str, branch: str) -> Path:
    slug = re.sub(r"[^a-z0-9._-]+", "-", f"{normalize_agent_id(agent_id)}-{task_id.lower()}").strip("-")
    candidate = base / slug
    if not candidate.exists():
        return candidate
    if _current_branch(candidate) == branch:
        return candidate
    for index in range(2, 20):
        suffixed = base / f"{slug}-{index}"
        if not suffixed.exists() or _current_branch(suffixed) == branch:
            return suffixed
    return base / f"{slug}-{new_runtime_id('wt')}"


def _coordination_workspace_key(request: DeliveryRequest) -> str:
    metadata = request.metadata if isinstance(request.metadata, dict) else {}
    chair_review = metadata.get("chair_review") if isinstance(metadata.get("chair_review"), dict) else {}
    raw = (
        metadata.get("workspace_key")
        or metadata.get("coordination_workspace_key")
        or chair_review.get("reason")
        or request.reason
        or "coordination"
    )
    slug = re.sub(r"[^a-z0-9._-]+", "-", str(raw).lower()).strip("-")
    return slug or "coordination"


def _is_git_worktree(path: Path) -> bool:
    if not path.is_dir():
        return False
    result = _git_capture(path, ["rev-parse", "--is-inside-work-tree"])
    return result.returncode == 0 and (result.stdout or "").strip() == "true"


def _candidate_coordination_worktree_path(base: Path, agent_id: str, workspace_key: str) -> Path:
    slug = re.sub(
        r"[^a-z0-9._-]+",
        "-",
        f"{normalize_agent_id(agent_id)}-coordination-{workspace_key}",
    ).strip("-")
    candidate = base / slug
    if not candidate.exists() or _is_git_worktree(candidate):
        return candidate
    for index in range(2, 20):
        suffixed = base / f"{slug}-{index}"
        if not suffixed.exists() or _is_git_worktree(suffixed):
            return suffixed
    return base / f"{slug}-{new_runtime_id('wt')}"


def ensure_coordination_workspace(
    config: dict[str, Any],
    request: DeliveryRequest,
) -> tuple[Path, str | None, str | None, str | None]:
    repo_root = config_path(config, "status_file").parents[0].resolve()
    base_branch = str(
        ((config.get("branch_strategy") or {}).get("worker_worktrees") or {}).get("coordination_base_branch")
        or "dev"
    )
    base = _worker_worktree_base(config, repo_root)
    base.mkdir(parents=True, exist_ok=True)
    workspace_key = _coordination_workspace_key(request)
    destination = _candidate_coordination_worktree_path(base, request.agent_id, workspace_key)
    if _is_git_worktree(destination):
        return destination.resolve(), None, base_branch, "existing_coordination_worktree"

    base_ref = f"origin/{base_branch}" if _remote_branch_exists(repo_root, base_branch) else base_branch
    result = _git_capture(
        repo_root,
        ["worktree", "add", "--detach", str(destination), base_ref],
        timeout=90.0,
    )
    if result.returncode != 0:
        write_activity_log(
            config,
            {
                "type": "worker_workspace_fallback",
                "task_id": request.task_id,
                "target_agent": display_name_for(config, request.agent_id),
                "message": (
                    "Could not create isolated coordination worktree; falling back to canonical workspace. "
                    f"key={workspace_key} stderr={(result.stderr or result.stdout or '').strip()}"
                ),
            },
        )
        return repo_root, None, base_branch, "fallback_canonical"
    return destination.resolve(), None, base_branch, "created_coordination_worktree"


def _provision_worktree_node_modules(repo_root: Path, destination: Path) -> None:
    """Symlink node_modules from the canonical checkout into a fresh task worktree.

    Worktrees start empty of node_modules (gitignored) and nothing else provisioned
    them, so a worker that didn't run a slow `pnpm install` itself failed tsc/next
    build at closeout → task stranded `blocked`. pnpm's content-addressable store is
    shared, so symlinks resolve correctly and cost nothing. Best-effort: never raises.
    See fix/orchestrator-rca-worktree-nm-and-unblock-recursion.
    """
    try:
        if destination.resolve() == repo_root.resolve():
            return  # canonical fallback already has node_modules
        src_root = repo_root / "node_modules"
        if src_root.is_dir():
            dst_root = destination / "node_modules"
            if not dst_root.exists():
                try:
                    dst_root.symlink_to(src_root)
                except OSError:
                    pass
        for parent in ("apps", "packages"):
            base = repo_root / parent
            if not base.is_dir():
                continue
            for pkg in base.iterdir():
                src = pkg / "node_modules"
                if not src.is_dir():
                    continue
                dst = destination / parent / pkg.name / "node_modules"
                if dst.parent.is_dir() and not dst.exists():
                    try:
                        dst.symlink_to(src)
                    except OSError:
                        pass
    except Exception:
        pass


def ensure_execution_workspace(
    config: dict[str, Any],
    request: DeliveryRequest,
    routing: Any | None,
) -> tuple[Path, str | None, str | None, str | None]:
    repo_root = config_path(config, "status_file").parents[0].resolve()
    mode = str((request.metadata or {}).get("mode") or "").strip().lower()
    if not _worker_worktrees_enabled(config):
        return repo_root, None, None, None
    if mode == "coordination":
        return ensure_coordination_workspace(config, request)
    if not request.task_id or mode == "planning":
        return repo_root, None, None, None

    branch = _execution_branch(repo_root, request)
    base_branch = routing.base_branch if routing else "dev"
    base = _worker_worktree_base(config, repo_root)
    existing = _worktree_for_branch(repo_root, branch, exclude=repo_root, within=base)
    if existing is not None:
        return existing, branch, base_branch, "existing_worktree"

    base.mkdir(parents=True, exist_ok=True)
    destination = _candidate_worktree_path(base, request.agent_id, request.task_id, branch)
    if destination.exists() and _current_branch(destination) == branch:
        return destination.resolve(), branch, base_branch, "existing_path"

    branch_checked_out = _worktree_for_branch(repo_root, branch) is not None
    if _branch_exists(repo_root, branch):
        command = ["worktree", "add"]
        if branch_checked_out:
            command.append("--force")
        command.extend([str(destination), branch])
    elif _remote_branch_exists(repo_root, branch):
        command = ["worktree", "add", "-b", branch, str(destination), f"origin/{branch}"]
    else:
        base_ref = f"origin/{base_branch}" if _remote_branch_exists(repo_root, base_branch) else base_branch
        command = ["worktree", "add", "-b", branch, str(destination), base_ref]
    result = _git_capture(repo_root, command, timeout=90.0)
    if result.returncode != 0:
        write_activity_log(
            config,
            {
                "type": "worker_workspace_fallback",
                "task_id": request.task_id,
                "target_agent": display_name_for(config, request.agent_id),
                "message": (
                    "Could not create isolated worker worktree; falling back to canonical workspace. "
                    f"branch={branch} stderr={(result.stderr or result.stdout or '').strip()}"
                ),
            },
        )
        return repo_root, branch, base_branch, "fallback_canonical"
    _provision_worktree_node_modules(repo_root, destination)
    return destination.resolve(), branch, base_branch, "created_worktree"


def attach_workspace_metadata(
    config: dict[str, Any],
    request: DeliveryRequest,
    workspace_root: Path,
    branch: str | None,
    base_branch: str | None,
    workspace_source: str | None,
) -> None:
    canonical_root = config_path(config, "status_file").parents[0].resolve()
    request.metadata = dict(request.metadata or {})
    request.metadata["workspace_root"] = str(workspace_root)
    request.metadata["canonical_root"] = str(canonical_root)
    if branch:
        request.metadata["task_branch"] = branch
    if base_branch:
        request.metadata["base_branch"] = base_branch
    if workspace_source:
        request.metadata["workspace_source"] = workspace_source

    mode = str(request.metadata.get("mode") or "").strip().lower()
    if request.task_id and branch:
        status_cli = task_board_cli_path()
        if workspace_root == canonical_root:
            workspace_line = (
                f"- Worker cwd: `{workspace_root}` (canonical workspace fallback; avoid switching it to another task branch)."
            )
        else:
            workspace_line = f"- Worker cwd: `{workspace_root}` (isolated task worktree)."
        notice = (
            "\n\nSupervisor-assigned workspace:\n"
            f"{workspace_line}\n"
            f"- Task branch: `{branch}` from base `{base_branch or 'dev'}`.\n"
            f"- Canonical machine-truth root: `{canonical_root}`.\n"
            f"- Use `{status_cli}` for state changes; it runs current release code and writes through "
            "`ORCH_STATUS_ROOT` / `AI_STATUS_ROOT` to canonical machine truth.\n"
            "- Do not `git switch` the canonical root for task code; use the assigned cwd/branch.\n"
        )
    elif mode == "coordination" and workspace_root != canonical_root:
        notice = (
            "\n\nSupervisor-assigned workspace:\n"
            f"- Worker cwd: `{workspace_root}` (isolated coordination worktree).\n"
            f"- Canonical machine-truth root: `{canonical_root}`.\n"
            "- Read/write machine truth through the absolute canonical paths above or `ORCH_STATUS_ROOT`; "
            "do not infer live status from this worktree's checked-out copy.\n"
            "- Do not edit product code from a coordination run.\n"
        )
    else:
        return
    if "Supervisor-assigned workspace:" not in request.message:
        request.message = request.message.rstrip() + notice


def summarize_runtime(state: dict[str, Any], approval_state: dict[str, Any]) -> dict[str, Any]:
    workers = state.get("workers", {}) or {}
    queue_events = state.get("queue", {}).get("events", {}) or {}
    pending_approvals = pending_approval_items(approval_state)
    active_workers = [
        {
            "run_id": run_id,
            "task_id": worker.get("task_id"),
            "agent_id": worker.get("agent_id"),
            "provider": worker.get("provider"),
            "status": worker.get("status"),
        }
        for run_id, worker in workers.items()
        if is_active_worker(worker)
    ]
    queue_items = [
        {
            "event_id": event_id,
            "status": record.get("status"),
            "run_id": record.get("run_id"),
            "error": record.get("error"),
        }
        for event_id, record in queue_events.items()
        if str(record.get("status") or "") not in {"completed", "done"}
    ]
    return {
        "active_worker_count": len(active_workers),
        "queue_count": len(queue_items),
        "pending_approval_count": len(pending_approvals),
        "active_workers": active_workers,
        "queue_items": queue_items,
    }


def safe_load_approval_state(config: dict[str, Any]) -> dict[str, Any]:
    try:
        state = load_approval_state(config)
    except KeyError:
        return {"pending": [], "history": []}
    pending = [item for item in (state.get("pending", []) or []) if item.get("status") == "pending"]
    return {
        **state,
        "pending": pending,
        "history": state.get("history", []) or [],
    }


def log_runtime_summary(
    state: dict[str, Any],
    approval_state: dict[str, Any],
    *,
    changed: bool,
    quiet: bool,
    verbose: bool,
    previous_heartbeat: str | None = None,
    warn_after_seconds: float = 10.0,
    once: bool = False,
) -> None:
    summary = summarize_runtime(state, approval_state)
    heartbeat = (
        state.get("supervisor", {}).get("last_heartbeat_at")
        or "-"
    )
    heartbeat_local = format_runtime_timestamp_local(heartbeat if heartbeat != "-" else None)
    lag_seconds = heartbeat_lag_seconds(previous_heartbeat, heartbeat)
    lag_summary = f"{lag_seconds:.1f}s" if lag_seconds is not None else "-"
    mode = "once" if once else "tick"
    console_log(
        (
            f"supervisor {mode}: heartbeat={heartbeat_local} lag={lag_summary} changed={'yes' if changed else 'no'} "
            f"queue={summary['queue_count']} "
            f"approvals={summary['pending_approval_count']} "
            f"active_workers={summary['active_worker_count']}"
        ),
        quiet=quiet,
    )
    if lag_seconds is not None and lag_seconds > warn_after_seconds:
        console_log(
            f"WARNING heartbeat lag exceeded threshold: {lag_seconds:.1f}s > {warn_after_seconds:.1f}s",
            quiet=quiet,
        )
    if not verbose or quiet:
        return
    console_log(f"heartbeat: {heartbeat_local} (utc={heartbeat}, lag={lag_summary})", quiet=quiet)
    if summary["active_workers"]:
        details = ", ".join(
            f"{item['agent_id'] or item['provider']}:{item['task_id']}({item['status']})"
            for item in summary["active_workers"]
        )
        console_log(f"active workers: {details}", quiet=quiet)
    else:
        console_log("active workers: none", quiet=quiet)
    if summary["queue_items"]:
        details = ", ".join(
            f"{item['event_id']}({item['status']})"
            for item in summary["queue_items"]
        )
        console_log(f"queue: {details}", quiet=quiet)
    else:
        console_log("queue: empty", quiet=quiet)


def desired_focus_mode_from_status(status: dict[str, Any]) -> str:
    execution_mode = str(status.get("execution_mode") or "").strip()
    if execution_mode == "discussion_planning":
        return "planning"
    return "execution"


def runtime_mode_for_snapshot(reason: str | None, metadata: dict[str, Any] | None) -> str:
    metadata = metadata or {}
    explicit = str(metadata.get("mode") or "").strip().lower()
    if explicit in MODE_BUCKETS:
        return explicit
    normalized_reason = str(reason or "").strip().lower()
    if normalized_reason.startswith("planning:"):
        return "planning"
    if normalized_reason.startswith("coordination:"):
        return "coordination"
    return "execution"


def worker_runtime_mode(worker: dict[str, Any]) -> str:
    snapshot = dict(worker.get("request_snapshot", {}) or {})
    return runtime_mode_for_snapshot(snapshot.get("reason"), snapshot.get("metadata"))


def update_supervisor_mode_metadata(
    state: dict[str, Any],
    *,
    focus_mode: str,
    heartbeat_at: str,
) -> None:
    supervisor_state = state.setdefault("supervisor", {})
    previous_focus = str(supervisor_state.get("focus_mode") or "").strip()
    supervisor_state["focus_mode"] = focus_mode
    supervisor_state["mode_status"] = "active"
    supervisor_state.setdefault("mode_switch_requested", None)
    if previous_focus and previous_focus != focus_mode:
        supervisor_state["last_mode_switch_at"] = heartbeat_at

    occupancy = {
        "planning": {"running": 0, "pending": 0, "queued": 0},
        "execution": {"running": 0, "pending": 0, "queued": 0},
        "coordination": {"running": 0, "pending": 0, "queued": 0},
    }

    for worker in state.get("workers", {}).values():
        worker_status = str(worker.get("status") or "")
        if worker_status not in ACTIVE_RUNTIME_STATUSES:
            continue
        snapshot = dict(worker.get("request_snapshot", {}) or {})
        bucket = runtime_mode_for_snapshot(snapshot.get("reason"), snapshot.get("metadata"))
        occupancy.setdefault(bucket, {"running": 0, "pending": 0, "queued": 0})
        occupancy[bucket]["running"] += 1

    active_event_ids = active_worker_queue_event_ids(state, ACTIVE_RUNTIME_STATUSES)
    for event_id, record in state.get("queue", {}).get("events", {}).items():
        if event_id in active_event_ids:
            continue
        queue_status = str(record.get("status") or "").strip().lower()
        if queue_status in {"completed", "failed", "done"}:
            continue
        bucket = str(record.get("mode") or "execution").strip().lower()
        if bucket not in occupancy:
            bucket = "execution"
        if queue_status == "queued":
            occupancy[bucket]["queued"] += 1
        else:
            occupancy[bucket]["pending"] += 1

    supervisor_state["mode_occupancy"] = occupancy


def mark_supervisor_stopped(
    config: dict[str, Any],
    *,
    reason: str,
    signum: int | None = None,
    terminate_workers: bool = True,
) -> bool:
    stopped_at = utc_now()
    message = f"Supervisor stopped before worker completed: {reason}"
    changed = False
    try:
        state = load_runtime_state(config)
    except Exception as exc:
        console_log(f"unable to load runtime state during supervisor shutdown: {exc}", quiet=SUPERVISOR_LOG_QUIET)
        return False

    supervisor_state = state.setdefault("supervisor", {})
    previous_pid = supervisor_state.get("pid")
    supervisor_state["last_pid"] = previous_pid
    supervisor_state["pid"] = None
    supervisor_state["lifecycle"] = "stopped"
    supervisor_state["mode_status"] = "stopped"
    supervisor_state["stopped_at"] = stopped_at
    supervisor_state["stop_reason"] = reason
    if signum is not None:
        supervisor_state["stop_signal"] = signum
    changed = True

    active_statuses = set(ACTIVE_RUNTIME_STATUSES)
    for worker in state.setdefault("workers", {}).values():
        status = str(worker.get("status") or "")
        if status not in active_statuses:
            continue
        worker["previous_status"] = status
        worker["status"] = "interrupted"
        worker["last_event_at"] = stopped_at
        worker["last_error"] = message
        worker["interrupted_by"] = "supervisor_shutdown"
        worker["supervisor_stopped_at"] = stopped_at
        if worker.get("pid"):
            worker["stopped_pid"] = worker.get("pid")
        if terminate_workers:
            terminate_worker_pid(worker.get("pid"))
        worker["pid"] = None
        queue_event_id = worker.get("queue_event_id")
        if queue_event_id:
            record = queue_status(state, str(queue_event_id))
            if str(record.get("status") or "") not in {"completed", "failed", "done"}:
                record["status"] = "failed"
                record["processed_at"] = stopped_at
                record["error"] = message
        changed = True

    chair = state.setdefault("chair_review", {})
    active_review = chair.get("active_review")
    if active_review:
        queue_event_id = active_review.get("queue_event_id")
        if queue_event_id:
            record = queue_status(state, str(queue_event_id))
            if str(record.get("status") or "") not in {"completed", "failed", "done"}:
                record["status"] = "failed"
                record["processed_at"] = stopped_at
                record["error"] = f"Supervisor stopped before chair review completed: {reason}"
        chair["interrupted_review"] = {
            **dict(active_review),
            "interrupted_at": stopped_at,
            "interruption_reason": reason,
        }
        chair["active_review"] = None
        changed = True

    update_supervisor_mode_metadata(
        state,
        focus_mode=str(supervisor_state.get("focus_mode") or "execution"),
        heartbeat_at=stopped_at,
    )
    supervisor_state["lifecycle"] = "stopped"
    supervisor_state["mode_status"] = "stopped"
    supervisor_state["pid"] = None

    try:
        save_runtime_state(config, state)
        write_activity_log(
            config,
            {
                "type": "supervisor_stopped",
                "message": f"Supervisor stopped cleanly: {reason}",
                "old_pid": previous_pid,
                "stopped_at": stopped_at,
                "signal": signum,
            },
        )
    except Exception as exc:
        console_log(f"unable to save runtime state during supervisor shutdown: {exc}", quiet=SUPERVISOR_LOG_QUIET)
        return False
    return changed


def planning_primary_file(workspace: Path, status: dict[str, Any], current_owner: str) -> str:
    discussion_loop = status.get("discussion_loop", {}) if isinstance(status.get("discussion_loop"), dict) else {}
    starter = str(discussion_loop.get("starter") or "").strip()
    supervisor = str(discussion_loop.get("supervisor") or "").strip()

    if current_owner == supervisor:
        return "consensus-packet.md"
    if current_owner == starter and not (workspace / "review-round-1.md").exists():
        return "starter-draft.md"
    for candidate in ("review-round-1.md", "review-round-2.md", "review-round-3.md", "review-round-4.md"):
        if (workspace / candidate).exists():
            return candidate
    return "starter-draft.md"


def planning_target_files(workspace: Path, primary_file: str) -> list[str]:
    candidates = [
        "README.md",
        "starter-draft.md",
        "scope-matrix.md",
        "backlog-proposal.md",
        "baton-log.md",
        "supervisor-queue.md",
        primary_file,
        "consensus-packet.md",
    ]
    result: list[str] = []
    for candidate in candidates:
        path = workspace / candidate
        if path.exists():
            result.append(relpath(path))
    return list(dict.fromkeys(result))


def build_planning_baton_message(
    config: dict[str, Any],
    *,
    workspace: str,
    current_owner: str,
    primary_file: str,
    target_files: list[str],
    status: dict[str, Any] | None = None,
) -> str:
    shared_files = [
        relpath(path)
        for path in selected_shared_files(
            config,
            mode="planning",
            status=status,
        )
    ]
    shared_block = "\n".join(f"- {path}" for path in shared_files) if shared_files else "- (none)"
    target_block = "\n".join(f"- {path}" for path in target_files) if target_files else "- (none)"
    return (
        f"You are the current planning baton owner for `{workspace}`.\n\n"
        f"Primary file to advance: `{primary_file}`\n"
        f"Current baton owner: `{current_owner}`\n\n"
        "Planning goals:\n"
        "- Read the shared canonical files first.\n"
        "- Update the active planning artifact with cited feedback or synthesis.\n"
        "- Do not start execution tasks or implementation commits from this planning dispatch.\n\n"
        "Shared files:\n"
        f"{shared_block}\n\n"
        "Target files:\n"
        f"{target_block}\n"
    )


def ensure_planning_baton_dispatch(
    config: dict[str, Any],
    state: dict[str, Any],
    status: dict[str, Any],
) -> bool:
    if desired_focus_mode_from_status(status) != "planning":
        return False

    workspace_value = str(status.get("discussion_workspace") or "").strip()
    discussion_loop = status.get("discussion_loop", {}) if isinstance(status.get("discussion_loop"), dict) else {}
    current_owner = str(discussion_loop.get("current_owner") or "").strip()
    if not workspace_value or not current_owner:
        return False

    workspace = Path(workspace_value)
    if not workspace.is_absolute():
        workspace = (REPO_ROOT / workspace).resolve()
    if not workspace.exists():
        return False

    primary_file = planning_primary_file(workspace, status, current_owner)
    workspace_label = workspace.name
    planning_key = f"planning:{workspace_label}:{current_owner}:{primary_file}"

    for worker in state.get("workers", {}).values():
        if str(worker.get("status") or "") not in ACTIVE_RUNTIME_STATUSES:
            continue
        snapshot = dict(worker.get("request_snapshot", {}) or {})
        metadata = dict(snapshot.get("metadata", {}) or {})
        if metadata.get("planning_event_key") == planning_key:
            return False

    queue_records = state.get("queue", {}).get("events", {})
    for event in load_event_queue(config):
        if str(event.get("event_key") or "") != planning_key:
            continue
        record = queue_records.get(str(event.get("event_id") or ""), {})
        if str(record.get("status") or "").lower() not in {"completed", "failed", "done"}:
            return False

    target_files = planning_target_files(workspace, primary_file)
    planning_task_id = f"PLANNING-{workspace_label}-{current_owner}".upper()
    agent = agent_config_for(config, current_owner)
    queue_payload = {
        "event_id": new_runtime_id("evt"),
        "created_at": utc_now(),
        "event_key": planning_key,
        "task_id": planning_task_id,
        "target_agent": agent["id"],
        "target_display_name": display_name_for(config, agent["id"]),
        "provider": agent.get("provider", agent["id"]),
        "reason": f"planning:{primary_file}",
        "message": build_planning_baton_message(
            config,
            workspace=workspace_value,
            current_owner=current_owner,
            primary_file=primary_file,
            target_files=target_files,
            status=status,
        ),
        "context_files": [
            relpath(path)
            for path in selected_shared_files(
                config,
                mode="planning",
                status=status,
            )
        ],
        "target_files": target_files,
        "metadata": {
            "mode": "planning",
            "planning_event_key": planning_key,
            "workspace": workspace_value,
            "current_owner": current_owner,
            "primary_file": primary_file,
            "task": {
                "id": planning_task_id,
                "task_class": "planning",
                "artifacts": target_files,
                "next": f"Advance {primary_file} for the active planning baton.",
            },
        },
    }
    enqueue_event(config, queue_payload)
    queue_record = queue_event_record(state, queue_payload["event_id"])
    queue_record["status"] = "queued"
    queue_record["attempt_count"] = 0
    queue_record["mode"] = "planning"
    write_activity_log(
        config,
        {
            "type": "planning_wake_queued",
            "task_id": planning_task_id,
            "target_agent": display_name_for(config, agent["id"]),
            "message": f"Queued planning baton wake-up for {current_owner}: {primary_file}",
            "queue_event_id": queue_payload["event_id"],
        },
    )
    return True


def provider_report_age_seconds(
    path: Path, report: dict[str, Any] | None, *, now: datetime | None = None
) -> float:
    """Age of a cached capability report; infinite when it cannot be dated."""
    now = now or datetime.now(timezone.utc)
    generated_at = parse_runtime_timestamp(str((report or {}).get("generated_at") or ""))
    if generated_at is not None:
        return max(0.0, (now - generated_at).total_seconds())
    try:
        return max(0.0, now.timestamp() - path.stat().st_mtime)
    except OSError:
        return float("inf")


def load_provider_report(config: dict[str, Any]) -> dict[str, Any]:
    try:
        supervisor_cfg = config.get("supervisor", {})
        if supervisor_cfg.get("auto_refresh_provider_capabilities", True):
            report = build_provider_capabilities(config)
            write_provider_capabilities(config, report=report)
            return report
        path = config_path(config, "provider_capabilities")
        report = load_json(path, default={}) or {}
        # Probing every tick is too expensive, which is why auto-refresh is off.
        # But a cache that is never refreshed can strand a healthy lane: one
        # stale or wrong auth_ready=False removes it from dispatch with no
        # pause, no error and no log line. Re-probe on an interval so the cache
        # can heal itself; an undateable or missing report refreshes at once.
        interval = float(
            supervisor_cfg.get("provider_capabilities_refresh_interval_seconds", 900.0)
        )
        if interval > 0 and provider_report_age_seconds(path, report) >= interval:
            report = build_provider_capabilities(config)
            write_provider_capabilities(config, report=report)
        return report
    except KeyError:
        return {}


def resolve_agent_model_preference(config: dict[str, Any], agent: dict[str, Any]) -> str | None:
    explicit = str(agent.get("model_preference") or "").strip()
    if explicit:
        return explicit

    provider_id = str(agent.get("provider") or agent.get("id") or "").strip()
    provider = config.get("providers", {}).get(provider_id, {})
    model_preference = provider.get("model_preference", {})
    if not isinstance(model_preference, dict):
        return None

    agent_id = str(agent.get("id") or "").strip()
    direct = str(model_preference.get(agent_id) or "").strip()
    if direct:
        return direct

    if agent_id == provider_id:
        default = str(model_preference.get("default") or "").strip()
        if default:
            return default
    return None


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def extract_prompt_text(command: list[str]) -> str | None:
    if not command:
        return None
    if "--prompt" in command:
        index = command.index("--prompt")
        if index + 1 < len(command):
            return str(command[index + 1])
    if "-p" in command:
        index = command.index("-p")
        if index + 1 < len(command):
            return str(command[index + 1])
    if len(command) >= 2 and command[0] == "codex" and command[1] == "exec":
        return str(command[-1])
    return None


def summarize_command_for_activity_log(command: list[str]) -> dict[str, Any]:
    if not command:
        return {}
    prompt = extract_prompt_text(command)
    sanitized_args: list[str] = []
    skip_next = False
    for index, token in enumerate(command):
        if skip_next:
            skip_next = False
            continue
        if token in {"--prompt", "-p"}:
            skip_next = True
            continue
        if prompt is not None and index == len(command) - 1 and token == prompt:
            continue
        sanitized_args.append(token)
    summary: dict[str, Any] = {
        "argv0": command[0],
        "argc": len(command),
        "args_preview": sanitized_args[:12],
    }
    if len(sanitized_args) > 12:
        summary["args_truncated"] = True
    if prompt:
        summary["prompt_chars"] = len(prompt)
        summary["prompt_sha256"] = _sha256_text(prompt)
        summary["prompt_preview"] = prompt[:240] + ("..." if len(prompt) > 240 else "")
    return summary


def build_request(config: dict[str, Any], event: dict[str, Any]) -> DeliveryRequest:
    agent = agent_config_for(config, event["target_agent"])
    metadata = dict(event.get("metadata", {}) or {})
    model_preference = resolve_agent_model_preference(config, agent)
    if model_preference and "model_preference" not in metadata:
        metadata["model_preference"] = model_preference
    task_payload = metadata.get("task") if isinstance(metadata.get("task"), dict) else {}
    mode = str(metadata.get("mode") or "").strip().lower()
    if mode not in {"planning", "execution", "coordination"}:
        mode = "planning" if str(task_payload.get("task_class") or "").lower() == "planning" else "execution"
    context_files = event.get("context_files")
    if not context_files:
        context_files = [
            relpath(path)
            for path in selected_shared_files(
                config,
                mode=mode,
                task=task_payload,
            )
        ]
    return DeliveryRequest(
        agent_id=agent["id"],
        provider=agent.get("provider", agent["id"]),
        delivery_mode=config.get("providers", {}).get(agent.get("provider", agent["id"]), {}).get(
            "delivery_mode", agent.get("adapter", "file_inbox")
        ),
        message=event["message"],
        task_id=event.get("task_id"),
        reason=event.get("reason"),
        context_files=context_files,
        target_files=event.get("target_files", []),
        metadata=metadata,
    )


def queue_status(state: dict[str, Any], event_id: str) -> dict[str, Any]:
    return queue_event_record(state, event_id)


def request_snapshot(request: DeliveryRequest) -> dict[str, Any]:
    return {
        "agent_id": request.agent_id,
        "provider": request.provider,
        "delivery_mode": request.delivery_mode,
        "message": request.message,
        "task_id": request.task_id,
        "reason": request.reason,
        "context_files": list(request.context_files),
        "target_files": list(request.target_files),
        "metadata": dict(request.metadata),
    }


def request_from_snapshot(snapshot: dict[str, Any]) -> DeliveryRequest:
    return DeliveryRequest(
        agent_id=snapshot["agent_id"],
        provider=snapshot["provider"],
        delivery_mode=snapshot["delivery_mode"],
        message=snapshot["message"],
        task_id=snapshot.get("task_id"),
        reason=snapshot.get("reason"),
        context_files=list(snapshot.get("context_files", []) or []),
        target_files=list(snapshot.get("target_files", []) or []),
        metadata=dict(snapshot.get("metadata", {}) or {}),
    )


def start_worker_for_request(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
    request: DeliveryRequest,
    *,
    queue_event_id: str | None,
    attempt_count: int,
    event_id_for_log: str | None,
    parent_run_id: str | None = None,
    delivery_mode_override: str | None = None,
    activity_type: str = "worker_started",
    activity_message: str | None = None,
) -> tuple[bool, str | None, dict[str, Any] | None]:
    agent = agent_config_for(config, request.agent_id)
    request_metadata = request.metadata if isinstance(request.metadata, dict) else {}
    admission = resource_admission_decision(config, state, request_metadata, agent_id=agent["id"])
    if not admission.allowed:
        reason = f"resource_admission:{admission.reason}"
        queue_record = queue_status(state, event_id_for_log) if event_id_for_log else {}
        if queue_record.get("blocked_reason") != reason:
            write_activity_log(
                config,
                {
                    "type": "worker_dispatch_deferred",
                    "task_id": request.task_id,
                    "provider": request.provider,
                    "target_agent": display_name_for(config, agent["id"]),
                    "queue_event_id": event_id_for_log,
                    "message": reason,
                    "execution_count": admission.execution_count,
                    "control_count": admission.control_count,
                    "heavy_count": admission.heavy_count,
                    "total_count": admission.total_count,
                },
            )
        return False, reason, None
    if request.task_id:
        ensure_task_brief(config, task=(request.metadata or {}).get("task"), task_id=request.task_id)
    # OPS-GIT-WORKFLOW-006: refuse dispatch when a fragile-surface diff is
    # uncommitted, so the next dispatch cannot quietly stash design-intent
    # work. Opt-in via `branch_strategy.worker_tree_guard.enabled`.
    guard_block = check_worker_tree_guard(config, reason=request.reason)
    if guard_block and not guard_block.get("log_only"):
        offender_summary = ", ".join(
            f"{item['path']} ~ {item['glob']}" for item in guard_block["offenders"][:5]
        )
        if len(guard_block["offenders"]) > 5:
            offender_summary += f" (+{len(guard_block['offenders']) - 5} more)"
        write_activity_log(
            config,
            {
                "type": "dispatch_blocked_dirty_tree",
                "task_id": request.task_id,
                "target_agent": display_name_for(config, agent["id"]),
                "reason": request.reason,
                "queue_event_id": event_id_for_log,
                "parent_run_id": parent_run_id,
                "dirty_paths": guard_block["dirty_paths"],
                "matched_globs": guard_block["matched_globs"],
                "message": (
                    "Worker dispatch refused: uncommitted fragile-surface diffs in working tree "
                    "(see docs/ops/branch-strategy.md §11). Anchor-commit required before next dispatch. "
                    f"Offenders: {offender_summary}"
                ),
            },
        )
        return False, "dispatch_blocked_dirty_tree", None
    if guard_block and guard_block.get("log_only"):
        write_activity_log(
            config,
            {
                "type": "dispatch_dirty_tree_warning",
                "task_id": request.task_id,
                "target_agent": display_name_for(config, agent["id"]),
                "reason": request.reason,
                "queue_event_id": event_id_for_log,
                "parent_run_id": parent_run_id,
                "dirty_paths": guard_block["dirty_paths"],
                "matched_globs": guard_block["matched_globs"],
                "message": (
                    "worker_tree_guard log_only canary: would have refused dispatch due to "
                    f"uncommitted fragile-surface diffs ({len(guard_block['offenders'])} offenders)."
                ),
            },
        )
    routing = route_task(request.task_id, config=config) if request.task_id else None
    workspace_root, task_branch, base_branch, workspace_source = ensure_execution_workspace(
        config,
        request,
        routing,
    )
    attach_workspace_metadata(config, request, workspace_root, task_branch, base_branch, workspace_source)

    adapter_name = delivery_mode_override or agent.get("adapter", "file_inbox")
    adapter = build_adapter(adapter_name, config=config, provider_capabilities=provider_report)
    result = adapter.deliver(request)
    if not result.ok:
        write_activity_log(
            config,
            {
                "type": "worker_failed",
                "task_id": request.task_id,
                "target_agent": display_name_for(config, agent["id"]),
                "delivery_mode": result.mode,
                "message": result.error or result.notes or "Worker delivery failed.",
                "queue_event_id": event_id_for_log,
                "parent_run_id": parent_run_id,
            },
        )
        return False, result.error or result.notes or "Worker delivery failed.", None

    worker_run_id = result.run_id or new_runtime_id(request.provider)
    provider_identity = provider_info_for_agent(config, provider_report, agent["id"]).get("identity")
    # Branch-strategy routing: stamp the worker record with the integration
    # track it belongs to so the dashboard, promote-nightly workflow, and
    # any downstream PR-creation can see where this work is supposed to land.
    # See docs/ops/branch-strategy.md §4 and orchestrator-integration-guide.md.
    state.setdefault("workers", {})[worker_run_id] = {
        "run_id": worker_run_id,
        "provider": request.provider,
        "agent_id": agent["id"],
        "identity": provider_identity if isinstance(provider_identity, dict) else None,
        "role": "chair" if request_metadata.get("control_role") == "chair" else "worker",
        "task_id": request.task_id,
        "session_id": result.session_id,
        "mode": result.mode,
        "status": "manual_pending" if result.manual_confirmation_required and not result.auto_delivered else "running",
        "last_event_at": utc_now(),
        "deferred_action": None,
        "resume_token": result.resume_token or result.session_id,
        "pr_url": normalize_pr_url(config, result.pr_url),
        "session_url": result.session_url,
        "attempt_count": attempt_count,
        "queue_event_id": queue_event_id,
        "command": result.command,
        "log_path": result.log_path,
        "payload_path": result.payload_path,
        "result_path": (result.metadata or {}).get("result_path"),
        "pid": result.pid,
        "notes": result.notes,
        "metadata": result.metadata,
        "worker_unit": (result.metadata or {}).get("worker_unit"),
        "workspace_root": str(workspace_root),
        "canonical_root": str(config_path(config, "status_file").parents[0].resolve()),
        "task_branch": task_branch,
        "workspace_source": workspace_source,
        "request_snapshot": request_snapshot(request),
        "parent_run_id": parent_run_id,
        "retry_count": 0,
        "next_retry_at": None,
        "last_error": None,
        "last_error_kind": None,
        "last_error_summary": None,
        "last_evidence_ref": None,
        "track": routing.track if routing else None,
        "base_branch": routing.base_branch if routing else None,
        "publish_branch": routing.publish_branch if routing else None,
        "gate_layer": "feat" if routing else None,
        "routing_matched_rule": routing.matched_rule_index if routing else None,
    }
    clear_dispatch_pause(state, task_id=request.task_id, worker_run_id=worker_run_id)
    write_activity_log(
        config,
        {
            "type": activity_type,
            "task_id": request.task_id,
            "target_agent": display_name_for(config, agent["id"]),
            "provider": request.provider,
            "delivery_mode": result.mode,
            "message": activity_message or f"Worker started via {result.adapter}: {request.reason}",
            "queue_event_id": event_id_for_log,
            "worker_run_id": worker_run_id,
            "parent_run_id": parent_run_id,
            "command_summary": summarize_command_for_activity_log(result.command),
            "log_path": result.log_path,
            "payload_path": result.payload_path,
        },
    )
    return True, worker_run_id, result.as_dict()


def process_queue(config: dict[str, Any], state: dict[str, Any], provider_report: dict[str, Any]) -> bool:
    changed = False
    task_map = task_index_from_status(config, load_status(config))
    active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    for event in load_event_queue(config):
        event_id = event.get("event_id")
        if not event_id:
            continue
        record = queue_status(state, event_id)
        if record.get("status") in {"started", "manual_pending", "completed", "failed"}:
            continue
        if record.get("status") == "waiting_capacity":
            next_retry = parse_runtime_timestamp(record.get("next_retry_at"))
            if next_retry is not None and next_retry > datetime.now(timezone.utc):
                continue
        active_worker = next(
            (
                worker
                for worker in state.get("workers", {}).values()
                if worker.get("queue_event_id") == event_id and worker.get("status") in active_statuses
            ),
            None,
        )
        if active_worker:
            desired_status = "manual_pending" if active_worker.get("status") in {"manual_pending", "waiting_approval"} else "started"
            if record.get("status") != desired_status or record.get("run_id") != active_worker.get("run_id"):
                record["status"] = desired_status
                record["run_id"] = active_worker.get("run_id") or event_id
                record["processed_at"] = record.get("processed_at") or utc_now()
                changed = True
            continue
        skip_message = stale_dispatch_skip_message(config, event, task_map)
        if skip_message:
            record["status"] = "completed"
            record["processed_at"] = utc_now()
            record["skip_reason"] = "stale_dispatch_event"
            write_activity_log(
                config,
                {
                    "type": "wake_skipped",
                    "task_id": event.get("task_id"),
                    "target_agent": event.get("target_display_name") or event.get("target_agent"),
                    "message": skip_message,
                    "queue_event_id": event_id,
                },
            )
            changed = True
            continue
        if disk_guard_dispatch_blocked(config, state):
            changed = mark_dispatch_deferred_by_disk_guard(
                config,
                state,
                record,
                event_id=event_id,
                task_id=event.get("task_id"),
                target_agent=event.get("target_display_name") or event.get("target_agent"),
            ) or changed
            continue
        if not isinstance(event.get("message"), str) or not event["message"].strip():
            # Never let a malformed persisted event crash the supervisor or be auto-delivered.
            record["status"] = "manual_pending"
            record["processed_at"] = utc_now()
            record["error"] = "invalid_queue_event_missing_message"
            write_activity_log(
                config,
                {
                    "type": "wake_manual_pending",
                    "task_id": event.get("task_id"),
                    "target_agent": event.get("target_display_name") or event.get("target_agent"),
                    "message": "Queue event is missing a non-empty delivery message; manual reconciliation required.",
                    "queue_event_id": event_id,
                },
            )
            changed = True
            continue
        request = build_request(config, event)
        next_attempt = int(record.get("attempt_count", 0)) + 1
        ok, outcome, delivery = start_worker_for_request(
            config,
            state,
            provider_report,
            request,
            queue_event_id=event_id,
            attempt_count=next_attempt,
            event_id_for_log=event_id,
        )
        if not ok:
            deferred = str(outcome or "").startswith("resource_admission:")
            record["status"] = "waiting_capacity" if deferred else "failed"
            record["error"] = outcome
            if deferred:
                seconds = max(1, int((config.get("supervisor") or {}).get("dispatch_defer_retry_seconds", 15)))
                record["next_retry_at"] = (
                    datetime.now(timezone.utc) + timedelta(seconds=seconds)
                ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
                record["blocked_reason"] = outcome
            changed = True
            continue

        worker_run_id = outcome or event_id
        record["attempt_count"] = next_attempt
        record["last_attempt_at"] = utc_now()
        record["status"] = "manual_pending" if delivery and delivery.get("manual_confirmation_required") and not delivery.get("auto_delivered") else "started"
        record["run_id"] = worker_run_id
        record["processed_at"] = utc_now()
        record.pop("error", None)
        record.pop("blocked_reason", None)
        record.pop("next_retry_at", None)
        changed = True
    return changed


def pid_is_alive(pid: int | None) -> bool:
    if not pid:
        return False
    proc_stat = Path(f"/proc/{pid}/stat")
    try:
        stat_text = proc_stat.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        stat_text = ""
    if stat_text:
        parts = stat_text.split()
        if len(parts) >= 3 and parts[2] == "Z":
            reap_child_pid(pid)
            return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def parse_proc_stat_process_accounting(stat_text: str) -> tuple[int, int] | None:
    """Return a process's parent PID and accumulated CPU ticks from /proc."""
    closing_paren = stat_text.rfind(")")
    if closing_paren < 0:
        return None
    fields = stat_text[closing_paren + 1 :].strip().split()
    # Fields begin at Linux procfs field 3 (state): ppid=4, utime=14, stime=15.
    if len(fields) < 13:
        return None
    try:
        return int(fields[1]), int(fields[11]) + int(fields[12])
    except ValueError:
        return None


def worker_process_tree_cpu_ticks(worker_pids: list[int]) -> dict[int, int]:
    """Return cumulative CPU ticks for each worker and all of its descendants.

    A long verification command can be quiet at the agent protocol layer while
    its child compiler/test processes continue to make progress. Walking only
    known worker process trees avoids a full /proc scan on every poll.
    """
    roots = {pid for pid in worker_pids if pid > 0}
    if not roots:
        return {}

    def read_accounting(pid: int) -> tuple[int, int] | None:
        try:
            return parse_proc_stat_process_accounting(
                Path(f"/proc/{pid}/stat").read_text(encoding="utf-8", errors="ignore")
            )
        except OSError:
            return None

    def child_pids(pid: int) -> list[int]:
        try:
            values = Path(f"/proc/{pid}/task/{pid}/children").read_text(encoding="utf-8").split()
        except OSError:
            return []
        return [int(value) for value in values if value.isdigit()]

    totals: dict[int, int] = {}
    for root_pid in roots:
        root_details = read_accounting(root_pid)
        # Worker PIDs are spawned directly by this supervisor. Reject a stale
        # state PID that has since been reused by an unrelated process.
        if root_details is None or root_details[0] != os.getpid():
            continue
        pending = [root_pid]
        seen: set[int] = set()
        total = 0
        while pending:
            pid = pending.pop()
            if pid in seen:
                continue
            seen.add(pid)
            details = read_accounting(pid)
            if details is None:
                continue
            total += details[1]
            pending.extend(child_pids(pid))
        if root_pid in seen and total:
            totals[root_pid] = total
    return totals


def worker_unit_cpu_usage(worker: dict[str, Any]) -> int | None:
    unit_name = str(worker.get("worker_unit") or "").strip()
    cgroup = _current_cgroup_path()
    if not unit_name or cgroup is None:
        return None
    try:
        for line in (cgroup / unit_name / "cpu.stat").read_text(encoding="utf-8").splitlines():
            key, value = line.split(maxsplit=1)
            if key == "usage_usec":
                return int(value)
    except (OSError, ValueError):
        return None
    return None


def observe_worker_process_activity(worker: dict[str, Any], cpu_ticks: int | None, now: datetime) -> tuple[bool, bool]:
    """Return whether process activity advanced and whether state must persist it."""
    if cpu_ticks is None:
        return False, False
    try:
        previous_ticks = int(worker.get("process_tree_cpu_ticks"))
    except (TypeError, ValueError):
        previous_ticks = None
    worker["process_tree_cpu_ticks"] = cpu_ticks
    if previous_ticks is not None and cpu_ticks <= previous_ticks:
        return False, False

    now_text = now.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    previous_activity = worker.get("last_process_activity_at")
    if previous_ticks is None:
        worker["last_process_activity_at"] = now_text
        return True, True
    try:
        previous_dt = datetime.fromisoformat(str(previous_activity).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        previous_dt = None
    if previous_dt is None or (now - previous_dt).total_seconds() >= 30:
        worker["last_process_activity_at"] = now_text
        return True, True
    return True, False


def worker_last_activity_at(worker: dict[str, Any]) -> str | None:
    """Use the newest semantic event or observed local process progress."""
    timestamps = [
        str(worker.get(key) or "").strip()
        for key in ("last_event_at", "last_process_activity_at")
    ]
    timestamps = [value for value in timestamps if value]
    return max(timestamps) if timestamps else None


def reap_child_pid(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        reaped_pid, _status = os.waitpid(int(pid), os.WNOHANG)
    except (ChildProcessError, OSError, ValueError):
        return False
    return reaped_pid == int(pid)


def reap_finished_children(*, limit: int = 64) -> int:
    reaped = 0
    while reaped < limit:
        try:
            pid, _status = os.waitpid(-1, os.WNOHANG)
        except (ChildProcessError, OSError):
            break
        if pid == 0:
            break
        reaped += 1
    return reaped


def terminate_worker_pid(pid: int | None) -> bool:
    if not pid:
        return False
    signaled = False
    try:
        os.killpg(pid, signal.SIGTERM)
        signaled = True
    except OSError:
        try:
            os.kill(pid, signal.SIGTERM)
            signaled = True
        except OSError:
            return False
    deadline = time.time() + 1.0
    while time.time() < deadline:
        if not pid_is_alive(pid):
            reap_child_pid(pid)
            return True
        time.sleep(0.05)
    try:
        os.killpg(pid, signal.SIGKILL)
    except OSError:
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            return signaled
    reap_child_pid(pid)
    return True


def normalize_pr_url(config: dict[str, Any], url: str | None) -> str | None:
    if not url:
        return None
    repo = (((config.get("github_bus") or {}).get("repo")) or "").strip()
    if not repo:
        return url
    expected = f"github.com/{repo}/"
    if "github.com/" in url and expected not in url:
        return None
    return url


def file_iso_mtime(path: Path) -> str | None:
    if not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def update_from_log(config: dict[str, Any], worker: dict[str, Any]) -> None:
    log_path_value = worker.get("log_path")
    if not log_path_value:
        return
    log_path = Path(log_path_value)
    if not log_path.exists():
        return
    mtime = file_iso_mtime(log_path)
    if mtime and (not worker.get("last_event_at") or mtime > worker.get("last_event_at", "")):
        worker["last_event_at"] = mtime
    try:
        content = log_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return
    for line in content.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not worker.get("session_id") and payload.get("session_id"):
            worker["session_id"] = payload.get("session_id")
            worker.setdefault("resume_token", worker["session_id"])
        if payload.get("type") == "result":
            if payload.get("stop_reason") == "tool_deferred":
                worker["status"] = "waiting_approval"
                worker["deferred_tool_use"] = payload.get("deferred_tool_use")
            if payload.get("pr_url") and not worker.get("pr_url"):
                worker["pr_url"] = normalize_pr_url(config, payload.get("pr_url"))
            if payload.get("session_url") and not worker.get("session_url"):
                worker["session_url"] = payload.get("session_url")
    if not worker.get("session_id"):
        for pattern in SESSION_ID_PATTERNS:
            match = pattern.search(content)
            if match:
                worker["session_id"] = match.group(1)
                worker.setdefault("resume_token", worker["session_id"])
                break
    if not worker.get("pr_url"):
        for url in URL_PATTERN.findall(content):
            if "/pull/" in url:
                worker["pr_url"] = normalize_pr_url(config, url)
                break
    worker["pr_url"] = normalize_pr_url(config, worker.get("pr_url"))
    if not worker.get("session_url"):
        for url in URL_PATTERN.findall(content):
            if "/agent" in url or "/sessions/" in url:
                worker["session_url"] = url
                break


def resolve_terminal_worker_reason(worker: dict[str, Any], reason: str) -> str:
    if reason != PREMATURE_EXIT_REASON:
        return reason
    detected = detect_worker_failure(worker)
    return detected or reason


def classify_worker_failure(config: dict[str, Any], worker: dict[str, Any], reason: str | None) -> dict[str, Any]:
    return classify_domain_failure(config, worker, reason).as_mapping()


def infer_pause_resume_at(reason: str | None, *, paused_at: datetime | None = None) -> float | None:
    return infer_domain_pause_resume_at(reason, paused_at=paused_at)


def worker_retry_settings(config: dict[str, Any], provider: str | None) -> dict[str, Any]:
    return domain_retry_settings(config, provider)


def provider_report_key_for_agent(config: dict[str, Any], agent_id: str) -> str:
    agent = agent_config_for(config, agent_id)
    candidates = [
        str(agent.get("provider") or "").strip(),
        str(agent.get("id") or "").strip(),
        normalize_agent_id(agent_id),
    ]
    return candidates[0] or normalize_agent_id(agent_id)


def provider_info_for_agent(
    config: dict[str, Any],
    provider_report: dict[str, Any],
    agent_id: str,
) -> dict[str, Any]:
    provider_key = provider_report_key_for_agent(config, agent_id)
    candidates = [provider_key, normalize_agent_id(agent_id)]
    providers = (provider_report.get("providers", {}) or {}) if isinstance(provider_report, dict) else {}
    for candidate in candidates:
        info = providers.get(candidate)
        if isinstance(info, dict):
            return info
    return {}


def adapter_info_for_agent(
    config: dict[str, Any],
    provider_report: dict[str, Any],
    agent_id: str,
) -> dict[str, Any]:
    agent = agent_config_for(config, agent_id)
    candidates = [
        str(agent.get("id") or "").strip(),
        str(agent.get("provider") or "").strip(),
        normalize_agent_id(agent_id),
    ]
    adapters = (provider_report.get("agent_adapters", {}) or {}) if isinstance(provider_report, dict) else {}
    for candidate in candidates:
        info = adapters.get(normalize_agent_id(candidate))
        if isinstance(info, dict):
            return info
    return {}


def provider_pause_registry(state: dict[str, Any]) -> dict[str, Any]:
    state["provider_pause_schema"] = 3
    return state.setdefault("provider_pauses", {})


def _hydrate_reason_hint_resume_at(state: dict[str, Any], agent_id: str, entry: dict[str, Any]) -> float | None:
    kind = str(entry.get("kind") or "")
    if kind not in {"quota", "capacity"}:
        return None
    resume_at = entry.get("resume_at")
    if resume_at is not None:
        try:
            return float(resume_at)
        except (TypeError, ValueError):
            return None
    hinted = infer_pause_resume_at(
        str(entry.get("reason") or ""),
        paused_at=parse_runtime_timestamp(str(entry.get("paused_at") or "")),
    )
    if hinted is None:
        return None
    entry["resume_at"] = hinted
    entry["resume_at_source"] = "reason_hint"
    return hinted


def pause_provider(
    state: dict[str, Any],
    agent_id: str,
    reason: str,
    *,
    kind: str,
    reset_seconds: int | None = None,
    identity: dict[str, Any] | None = None,
) -> None:
    normalized = normalize_agent_id(agent_id) or str(agent_id).strip()
    resume_at = (
        datetime.now(timezone.utc).timestamp() + reset_seconds
        if reset_seconds is not None
        else None
    )
    resume_source = "reset_seconds" if reset_seconds is not None else None
    if kind in {"quota", "capacity"}:
        hinted = infer_pause_resume_at(reason)
        # The provider states when the quota actually resets; a caller-supplied
        # default (quota pauses hardcode 4h) is only a guess. Waking earlier than
        # the stated reset just burns an attempt and re-pauses, so take whichever
        # is later.
        if hinted is not None and (resume_at is None or hinted > resume_at):
            resume_at = hinted
            resume_source = "reason_hint"
    entry = {
        "kind": kind,
        "reason": reason,
        "paused_at": utc_now(),
        "resume_at": resume_at,
        "schema": 3,
        "lane_id": normalized,
    }
    pool = str((identity or {}).get("quota_pool") or "")
    fingerprint = str((identity or {}).get("fingerprint") or "")
    if kind == "quota" and pool:
        entry.update({"scope": "quota_pool", "quota_pool": pool, "identity_fingerprint": fingerprint})
        registry_key = f"pool:{pool}"
    elif fingerprint:
        entry.update({"scope": "identity", "identity_fingerprint": fingerprint})
        registry_key = f"identity:{normalized}:{fingerprint}"
    else:
        entry["scope"] = "lane"
        registry_key = normalized
    if resume_source:
        entry["resume_at_source"] = resume_source
    provider_pause_registry(state)[registry_key] = entry
    console_log(
        f"{kind} pause: agent={normalized} reset_in={reset_seconds or 0}s reason={reason}",
        quiet=SUPERVISOR_LOG_QUIET,
    )


def maybe_pause_provider_for_terminal_failure(
    config: dict[str, Any],
    state: dict[str, Any],
    worker: dict[str, Any],
    reason: str,
) -> None:
    failure = classify_worker_failure(config, worker, reason)
    agent_id = str(worker.get("agent_id") or worker.get("provider") or "")
    if not agent_id:
        return
    if failure.get("kind") == "quota_terminal":
        pause_provider(state, agent_id, reason, kind="quota", reset_seconds=14400, identity=worker.get("identity"))
    elif failure.get("kind") == "auth":
        pause_provider(state, agent_id, reason, kind="auth", reset_seconds=None, identity=worker.get("identity"))


def _antigravity_rotation_for_worker(config: dict[str, Any], worker: dict[str, Any]) -> dict[str, Any]:
    """Return the normalized model_rotation config for a worker's Antigravity lane
    (enabled=False for non-Antigravity lanes)."""
    agent = agent_config_for(config, str(worker.get("agent_id") or worker.get("provider") or ""))
    if str(agent.get("adapter") or "") != "antigravity":
        return {"enabled": False}
    provider_key = str(agent.get("provider") or "").strip()
    provider = config.get("providers", {}).get(provider_key, {})
    settings = provider.get("antigravity", {}) if isinstance(provider, dict) else {}
    return antigravity_rotation_config(settings)


def maybe_rotate_antigravity_lane(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
    worker: dict[str, Any],
    failure: dict[str, Any],
    reason: str,
    *,
    authorized: bool,
) -> bool:
    """Handle a quota/capacity failure on a rotation-enabled Antigravity lane by
    cooling the model the worker just used and re-dispatching on the SAME lane so
    the adapter switches to the other model — instead of pausing the whole lane.

    The lane is only truly paused when BOTH model pools are cooling. Returns True
    when the failure was handled here (the caller must stop its own
    pause/retry/finalize flow for this worker)."""
    if not authorized:
        return False
    if failure.get("kind") not in {"quota_terminal", "capacity"}:
        return False
    rotation = _antigravity_rotation_for_worker(config, worker)
    if not rotation.get("enabled"):
        return False
    # Idempotency guard: the failing primary run keeps its log on disk, so every
    # subsequent tick re-reads the same quota line, re-classifies it, and would
    # fire another rotation redispatch. Observed 2026-07-27: one gemini worker
    # spawned 30 identical fallback children off a single queue event (all with
    # attempt_count=2, all parented to the same run) and drove load to 48 on a
    # 12-core box. Once we have redispatched this worker, the rotation is done.
    if worker.get("rotation_redispatch_run_id"):
        return True
    agent_id = str(worker.get("agent_id") or worker.get("provider") or "")
    if not agent_id:
        return False
    request = request_for_worker(config, worker)
    if request is None:
        return False

    metadata = worker.get("metadata") if isinstance(worker.get("metadata"), dict) else {}
    slot = str(metadata.get("rotation_slot") or "").strip().lower()
    if slot not in {ROTATION_PRIMARY_SLOT, ROTATION_FALLBACK_SLOT}:
        # Unknown which model this run used (e.g. metadata lost); assume the
        # primary pool, which is agy's default.
        slot = ROTATION_PRIMARY_SLOT
    other = ROTATION_FALLBACK_SLOT if slot == ROTATION_PRIMARY_SLOT else ROTATION_PRIMARY_SLOT

    cooldown_seconds = int(rotation.get("cooldown_seconds", 900))
    now = datetime.now(timezone.utc).timestamp()
    # Prefer the provider's own reset hint over the fixed cooldown. agy reports
    # "Resets in 29h35m13s"; retrying that pool every 900s just burns one
    # instant-fail call per cycle (~40 pointless rotations/day were observed on
    # 2026-07-27/28). Only ever extend the cooldown, never shorten it.
    hinted_resume = infer_domain_pause_resume_at(reason)
    slot_until = now + cooldown_seconds
    if hinted_resume is not None and float(hinted_resume) > slot_until:
        slot_until = float(hinted_resume)
    cooldowns = record_rotation_cooldown(config, agent_id, slot, slot_until)
    other_until = float(cooldowns.get(f"{other}_until", 0) or 0)

    terminate_worker_pid(worker.get("pid"))
    _failure_kind, failure_summary = summarize_worker_failure(config, worker, reason)

    if other_until > now:
        # Both pools cooling — really pause the lane until the sooner pool frees
        # (so it wakes to retry the moment a model is available again), then fall
        # back to normal terminal handling so the task can reassign to a healthy
        # lane instead of stranding on the paused one.
        resume_at = min(slot_until, other_until)
        reset_seconds = max(1, int(resume_at - now))
        pause_provider(state, agent_id, failure_summary, kind="quota", reset_seconds=reset_seconds)
        write_activity_log(
            config,
            {
                "type": "antigravity_rotation_paused",
                "provider": worker.get("provider"),
                "task_id": worker.get("task_id"),
                "message": (
                    f"Antigravity {agent_id}: both rotation pools cooling; lane paused "
                    f"{reset_seconds}s ({failure_summary})."
                ),
                "worker_run_id": worker.get("run_id"),
            },
        )
        console_log(
            f"antigravity rotation: {agent_id} both pools cooling; lane paused {reset_seconds}s",
            quiet=SUPERVISOR_LOG_QUIET,
        )
        finalize_terminal_worker_outcome(config, state, worker, failure_summary)
        return True

    # The other pool is warm: retire this worker cleanly (no lane pause, no
    # failure-streak penalty, no reassignment away) and re-dispatch on the SAME
    # lane so the adapter selects the other model.
    evidence_ref = record_worker_evidence(config, worker, reason)
    worker["last_error"] = failure_summary
    worker["last_error_kind"] = _failure_kind
    worker["last_error_summary"] = failure_summary
    worker["last_evidence_ref"] = evidence_ref
    worker["status"] = "rotated"
    worker["last_event_at"] = utc_now()
    finalize_queue_event_record(config, state, worker, "completed")
    ok, outcome, _ = start_worker_for_request(
        config,
        state,
        provider_report,
        request,
        queue_event_id=worker.get("queue_event_id"),
        attempt_count=int(worker.get("attempt_count", 0)) + 1,
        event_id_for_log=worker.get("queue_event_id"),
        parent_run_id=worker.get("run_id"),
        activity_type="antigravity_rotation_redispatch",
        activity_message=(
            f"Antigravity {agent_id} exhausted its {slot} model ({failure_summary}); "
            f"re-dispatched on the same lane to switch to {other}."
        ),
    )
    if ok:
        worker["rotation_redispatch_run_id"] = outcome
        console_log(
            f"antigravity rotation: {agent_id} {slot}->{other} redispatch run={outcome}",
            quiet=SUPERVISOR_LOG_QUIET,
        )
        return True

    # Re-dispatch itself failed — fall back to a bounded capacity pause so the
    # lane does not spin on an immediate retry.
    reset_seconds = max(1, cooldown_seconds)
    pause_provider(state, agent_id, failure_summary, kind="capacity", reset_seconds=reset_seconds)
    worker["status"] = "failed"
    worker["last_event_at"] = utc_now()
    finalize_queue_event_record(config, state, worker, "failed", failure_summary)
    console_log(
        f"antigravity rotation: {agent_id} redispatch failed; lane paused {reset_seconds}s",
        quiet=SUPERVISOR_LOG_QUIET,
    )
    return True


def clear_provider_pause(state: dict[str, Any], agent_id: str) -> None:
    normalized = normalize_agent_id(agent_id) or str(agent_id).strip()
    registry = provider_pause_registry(state)
    for key, entry in list(registry.items()):
        if key == normalized or (isinstance(entry, dict) and entry.get("lane_id") == normalized):
            registry.pop(key, None)


def lane_has_recorded_pause(state: dict[str, Any], agent_id: str) -> bool:
    normalized = normalize_agent_id(agent_id) or str(agent_id).strip()
    return any(
        isinstance(entry, dict) and entry.get("lane_id") == normalized
        for entry in provider_pause_registry(state).values()
    )


def pause_covers_lane(
    config: dict[str, Any],
    provider_report: dict[str, Any],
    pause: dict[str, Any],
    agent_id: str,
) -> bool:
    """Whether one pause entry applies to one lane.

    A pause is not always keyed by lane. An identity-scoped entry is keyed by
    the account fingerprint and therefore covers every lane sharing that
    account, which is the whole point: when codex2 returned 401 the same
    credentials backed codex, so both had to stop. Anything that answers "can
    this lane take work" must go through here, or it will disagree with the
    dispatcher -- the chair briefing used to look pauses up by lane name, could
    not see the identity-scoped entry, and offered the chair a lane the
    dispatcher was silently refusing.
    """
    normalized = normalize_agent_id(agent_id) or str(agent_id).strip()
    provider_info = provider_info_for_agent(config, provider_report, normalized)
    identity = provider_info.get("identity") if isinstance(provider_info.get("identity"), dict) else None
    pool = str((identity or {}).get("quota_pool") or "") or None
    if not pause_matches_lane(pause, identity, pool):
        return False
    if str(pause.get("scope") or "lane") == "lane" and pause.get("lane_id") not in {None, normalized}:
        return False
    return True


def lanes_covered_by_pause(
    config: dict[str, Any],
    provider_report: dict[str, Any],
    pause: dict[str, Any],
) -> list[str]:
    """Every configured lane the given pause takes out, not just its trigger."""
    return sorted(
        normalize_agent_id(agent_id) or str(agent_id).strip()
        for agent_id in (config.get("agents", {}) or {})
        if pause_covers_lane(config, provider_report, pause, agent_id)
    )


def is_agent_dispatch_paused(
    config: dict[str, Any],
    state: dict[str, Any],
    agent_id: str,
    *,
    provider_report: dict[str, Any] | None = None,
) -> bool:
    normalized = normalize_agent_id(agent_id) or str(agent_id).strip()
    report = provider_report or load_provider_report(config)
    provider_info = provider_info_for_agent(config, report, normalized)
    if provider_info.get("auth_ready") is False:
        return True
    for entry in provider_pause_registry(state).values():
        if not isinstance(entry, dict) or not pause_covers_lane(config, report, entry, normalized):
            continue
        if str(entry.get("kind") or "") == "auth":
            return True
        if str(entry.get("resume_at_source") or "") == "reason_hint":
            return True
        resume_at = entry.get("resume_at")
        if resume_at is None or float(resume_at) > datetime.now(timezone.utc).timestamp():
            return True
    return False


def _force_recovery_probe(config: dict[str, Any]) -> dict[str, Any] | None:
    """Force a fresh provider capability probe, bypassing the cached
    provider_capabilities.json (which is stale when
    auto_refresh_provider_capabilities is False). Best-effort: returns None on
    failure so a probe error never crashes the tick."""
    try:
        report = build_provider_capabilities(config)
        write_provider_capabilities(config, report=report)
        return report
    except Exception as exc:  # noqa: BLE001 - recovery probe must never crash the tick
        console_log(f"recovery probe failed: {exc}", quiet=SUPERVISOR_LOG_QUIET)
        return None


def _lane_probe_healthy(
    config: dict[str, Any], report: dict[str, Any] | None, agent_id: str
) -> bool | None:
    """True only if a capability probe says the lane is installed AND auth-ready.
    NOTE: verifies install + login, NOT quota — a chronic-quota lane can still
    read healthy here, so callers must treat True as 'worth retrying', not
    'guaranteed to dispatch'."""
    if not report:
        return None
    info = provider_info_for_agent(config, report, agent_id)
    if not info:
        return None
    if info.get("installed") is False:
        return False
    auth_ready = info.get("auth_ready")
    if auth_ready is None:
        return None
    return bool(auth_ready)


def expire_provider_pauses(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
) -> list[str]:
    pauses = provider_pause_registry(state)
    expired: list[str] = []
    now_ts = datetime.now(timezone.utc).timestamp()
    for pause_key, entry in list(pauses.items()):
        agent_id = str(entry.get("lane_id") or pause_key)
        kind = str(entry.get("kind") or "")
        if kind == "auth":
            # Auth failures from real worker runs are stronger evidence than a
            # lightweight capability probe. Keep the lane paused until a human or
            # explicit repair flow clears it. (break_full_deadlock may clear it as
            # a last resort when the whole fleet is wedged.)
            continue
        resume_at = entry.get("resume_at")
        if resume_at is None:
            resume_at = _hydrate_reason_hint_resume_at(state, agent_id, entry)
        if resume_at is not None and float(resume_at) <= now_ts:
            pauses.pop(pause_key, None)
            expired.append(pause_key)
            console_log(f"provider pause expired: scope={pause_key} now available", quiet=SUPERVISOR_LOG_QUIET)
    return expired


def worker_reassignment_settings(config: dict[str, Any]) -> dict[str, Any]:
    settings = dict(config.get("worker_reassignment", {}) or {})
    settings.setdefault("enabled", True)
    settings.setdefault("after_attempts", 2)
    settings.setdefault("reassign_on_terminal_failure", True)
    default_eligible_statuses: list[str] = []
    ready_settings = ready_dispatch_settings(config)
    for key in ("owned_statuses", "review_statuses"):
        for value in ready_settings.get(key, []) or []:
            normalized = str(value).strip().lower()
            if normalized and normalized not in default_eligible_statuses:
                default_eligible_statuses.append(normalized)
    settings.setdefault("eligible_statuses", default_eligible_statuses or ["backlog", "todo", "in_progress", "review"])
    default_fallbacks = {
        "Claude": ["Claude2", "Codex", "Codex2", "Gemini", "Gemini2", "Copilot"],
        "Claude2": ["Codex", "Codex2", "Claude", "Gemini", "Gemini2", "Copilot"],
        "Gemini": ["Gemini2", "Codex", "Codex2", "Claude", "Claude2", "Copilot"],
        "Gemini2": ["Gemini", "Codex", "Codex2", "Claude", "Claude2", "Copilot"],
        "Codex": ["Codex2", "Claude2", "Claude", "Gemini", "Gemini2", "Copilot"],
        "Codex2": ["Codex", "Claude2", "Claude", "Gemini", "Gemini2", "Copilot"],
        "Copilot": ["Codex", "Codex2", "Claude2", "Claude", "Gemini", "Gemini2"],
    }
    settings.setdefault("owner_fallbacks", default_fallbacks)
    settings.setdefault("reviewer_fallbacks", default_fallbacks)
    return settings


from worker_tree_guard import (  # noqa: E402
    check_worker_tree_guard,
)


def chair_review_settings(config: dict[str, Any]) -> dict[str, Any]:
    settings = dict(config.get("chair_review", {}) or {})
    settings.setdefault("enabled", False)
    settings.setdefault("cooldown_seconds", 900)
    settings.setdefault(
        "failure_streak_threshold",
        int(worker_reassignment_settings(config).get("after_attempts", 2)),
    )
    settings.setdefault("default_approval_ttl_minutes", 45)
    # Max depth of the auto-generated unblock/repair lineage. 1 = a first-class task
    # may get one unblock child, but that child can never spawn its own repair
    # (no -repair-repair). Raise only if you deliberately want deeper auto-chains.
    settings.setdefault("max_unblock_lineage_depth", 1)
    return settings


def chair_review_dir(config: dict[str, Any]) -> Path:
    path = config_path(config, "state_file").parent / "chair-reviews"
    path.mkdir(parents=True, exist_ok=True)
    return path


def failure_streak_key(task_id: str, role: str) -> str:
    return f"{task_id}:{role}"


def failure_streak_registry(state: dict[str, Any]) -> dict[str, Any]:
    return state.setdefault("failure_streaks", {})


def lane_failure_autopause_settings(config: dict[str, Any]) -> dict[str, Any]:
    """Defense-in-depth: pause a whole lane whose workers keep dying terminally
    across distinct tasks, even when the failure text isn't classified/authorized
    for a provider pause (e.g. an unrecognized CLI auth format that only surfaces
    as a premature exit). Catches "silently dying lane" magnets that the
    availability-first scheduler would otherwise keep re-selecting."""
    settings = dict((config.get("ready_dispatcher", {}) or {}).get("lane_failure_autopause", {}) or {})
    settings.setdefault("enabled", True)
    settings.setdefault("threshold", 3)          # distinct-task terminal failures
    settings.setdefault("window_seconds", 900)   # rolling window
    settings.setdefault("reset_seconds", 1800)   # capacity pause auto-expiry (self-correcting)
    return settings


def lane_failure_registry(state: dict[str, Any]) -> dict[str, Any]:
    return state.setdefault("lane_failure_streaks", {})


def record_lane_terminal_failure(
    config: dict[str, Any],
    state: dict[str, Any],
    agent_id: str,
    task_id: str | None,
) -> bool:
    """Track per-lane distinct-task terminal failures in a rolling window.
    Returns True when the lane crosses the auto-pause threshold."""
    settings = lane_failure_autopause_settings(config)
    if not settings.get("enabled", True):
        return False
    normalized = normalize_agent_id(agent_id) or str(agent_id or "").strip()
    if not normalized:
        return False
    now = datetime.now(timezone.utc).timestamp()
    window = float(settings.get("window_seconds", 900))
    registry = lane_failure_registry(state)
    entry = registry.get(normalized)
    if not isinstance(entry, dict) or (now - float(entry.get("window_start") or 0)) > window:
        entry = {"window_start": now, "tasks": []}
    tasks = entry.setdefault("tasks", [])
    tid = str(task_id or "").strip()
    if tid and tid not in tasks:
        tasks.append(tid)
    elif not tid:
        # no task id — count as an anonymous distinct failure slot
        tasks.append(f"__anon_{len(tasks)}")
    entry["count"] = len(tasks)
    entry["last_failure_at"] = utc_now()
    registry[normalized] = entry
    return entry["count"] >= int(settings.get("threshold", 3))


def clear_lane_failure(state: dict[str, Any], agent_id: str) -> None:
    normalized = normalize_agent_id(agent_id) or str(agent_id or "").strip()
    if normalized:
        lane_failure_registry(state).pop(normalized, None)


def maybe_autopause_unhealthy_lane(
    config: dict[str, Any],
    state: dict[str, Any],
    worker: dict[str, Any],
    reason: str,
) -> None:
    """Lane-level safety net, independent of allow_provider_pause: if a lane racks
    up enough distinct-task terminal (non-transient) failures, pause it so the
    scheduler stops routing to a dead/broken lane (e.g. revoked auth token that
    only 401s at worker runtime)."""
    settings = lane_failure_autopause_settings(config)
    if not settings.get("enabled", True):
        return
    agent_id = str(worker.get("agent_id") or worker.get("provider") or "")
    normalized = normalize_agent_id(agent_id) or agent_id.strip()
    if not normalized:
        return
    # Already paused (by classification or earlier) — reset the counter and stop.
    if lane_has_recorded_pause(state, normalized):
        clear_lane_failure(state, normalized)
        return
    failure = classify_worker_failure(config, worker, reason)
    if failure.get("transient"):
        return  # transient (retryable) failures don't count toward lane health
    if record_lane_terminal_failure(config, state, normalized, worker.get("task_id")):
        threshold = int(settings.get("threshold", 3))
        window = int(settings.get("window_seconds", 900))
        pause_provider(
            state,
            normalized,
            (
                f"Auto-paused (lane health): {threshold}+ terminal worker failures across "
                f"distinct tasks within {window}s — lane appears unhealthy (e.g. revoked auth "
                f"that only 401s at runtime). Latest: {reason}"
            ),
            kind="capacity",
            reset_seconds=int(settings.get("reset_seconds", 1800)),
        )
        clear_lane_failure(state, normalized)


def chair_reassignment_guard_registry(state: dict[str, Any]) -> dict[str, Any]:
    return state.setdefault("chair_reassignment_guards", {})


def chair_reassignment_guard_key(task_id: str, role: str) -> str:
    return f"{task_id}:{role}"


def remember_chair_reassignment_guard(
    config: dict[str, Any],
    state: dict[str, Any],
    *,
    task_id: str,
    role: str,
    from_agent: str,
    to_agent: str,
) -> None:
    seconds = float(chair_review_settings(config).get("reassignment_guard_seconds", 1800))
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=max(60.0, seconds))).replace(microsecond=0)
    chair_reassignment_guard_registry(state)[chair_reassignment_guard_key(task_id, role)] = {
        "task_id": task_id,
        "role": role,
        "from": from_agent,
        "to": to_agent,
        "created_at": utc_now(),
        "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
    }


def chair_reassignment_guard_active(state: dict[str, Any] | None, task_id: str, role: str, assigned_agent: str) -> bool:
    if state is None:
        return False
    guard = chair_reassignment_guard_registry(state).get(chair_reassignment_guard_key(task_id, role))
    if not isinstance(guard, dict):
        return False
    expires_at = parse_runtime_timestamp(guard.get("expires_at"))
    if expires_at is not None and expires_at <= datetime.now(timezone.utc):
        chair_reassignment_guard_registry(state).pop(chair_reassignment_guard_key(task_id, role), None)
        return False
    return str(guard.get("to") or "") == str(assigned_agent or "")


def clear_failure_streak(state: dict[str, Any], task_id: str, role: str | None = None) -> None:
    registry = failure_streak_registry(state)
    if role is None:
        prefix = f"{task_id}:"
        for key in [key for key in registry if key.startswith(prefix)]:
            registry.pop(key, None)
        return
    registry.pop(failure_streak_key(task_id, role), None)


def task_role_for_dispatch_reason(reason: str | None) -> str | None:
    normalized = str(reason or "").strip()
    if normalized == "review_ready_dispatch":
        return "reviewer"
    if normalized in {"owned_in_progress_dispatch", "owned_ready_dispatch"}:
        return "owner"
    return None


def worker_assignment_role(config: dict[str, Any], worker: dict[str, Any], task: dict[str, Any] | None) -> str | None:
    role = task_role_for_dispatch_reason(((worker.get("request_snapshot") or {}).get("reason")))
    if role:
        return role
    if not task:
        return None
    agent_name = display_name_for(config, str(worker.get("agent_id") or worker.get("provider") or ""))
    agent_ids = {
        normalize_agent_id(str(worker.get("agent_id") or "")),
        normalize_agent_id(str(worker.get("provider") or "")),
        normalize_agent_id(agent_name),
    }
    agent_ids.discard("")
    task_status = str(task.get("status") or "").lower()
    if task_status == "review" and normalize_agent_id(str(task.get("reviewer") or "")) in agent_ids:
        return "reviewer"
    if normalize_agent_id(str(task.get("owner") or "")) in agent_ids:
        return "owner"
    return None


def _task_is_open(task: dict[str, Any]) -> bool:
    return str(task.get("status") or "").lower() not in {"done", "superseded"}


def workspace_baseline_cover_task_ids(task: dict[str, Any]) -> set[str]:
    raw = task.get("covers_task_ids")
    if not isinstance(raw, list):
        return set()
    return {str(item).strip() for item in raw if str(item).strip()}


def workspace_baseline_repair_task(status: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(status, dict):
        return None
    candidates: list[dict[str, Any]] = []
    for task in status.get("tasks", []) or []:
        if not isinstance(task, dict):
            continue
        if not _task_is_open(task):
            continue
        task_id = str(task.get("id") or "").strip()
        helper_kind = str(task.get("helper_kind") or "").strip()
        if task_id != WORKSPACE_BASELINE_TASK_ID and helper_kind != WORKSPACE_BASELINE_HELPER_KIND:
            continue
        candidates.append(task)
    if not candidates:
        return None
    candidates.sort(key=lambda item: str(item.get("last_update") or item.get("id") or ""))
    return candidates[-1]


def repeated_failure_records(
    state: dict[str, Any],
    status: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    records = [
        dict(record)
        for record in failure_streak_registry(state).values()
        if isinstance(record, dict) and record.get("awaiting_chair")
    ]
    baseline_task = workspace_baseline_repair_task(status)
    covered_task_ids = workspace_baseline_cover_task_ids(baseline_task) if baseline_task else set()
    if not covered_task_ids:
        return records
    return [record for record in records if str(record.get("task_id") or "").strip() not in covered_task_ids]


def failing_agents_in_reassignment_loops(
    state: dict[str, Any],
    status: dict[str, Any] | None = None,
) -> set[str]:
    return {
        str(record.get("agent") or "").strip()
        for record in repeated_failure_records(state, status)
        if str(record.get("agent") or "").strip()
    }


def active_provider_pause_records(state: dict[str, Any]) -> list[dict[str, Any]]:
    now_ts = datetime.now(timezone.utc).timestamp()
    records: list[dict[str, Any]] = []
    for pause_key, entry in provider_pause_registry(state).items():
        if not isinstance(entry, dict):
            continue
        resume_at = entry.get("resume_at")
        if resume_at is not None and float(resume_at or 0) <= now_ts:
            continue
        records.append(
            {
                "agent_id": entry.get("lane_id") or pause_key,
                "pause_scope": pause_key,
                "kind": entry.get("kind") or "quota",
                "reason": entry.get("reason") or "",
                "paused_at": entry.get("paused_at"),
                "resume_at": resume_at,
            }
        )
    return sorted(records, key=lambda item: str(item.get("paused_at") or ""), reverse=True)


def actionable_dispatch_pause_records(
    state: dict[str, Any],
    status: dict[str, Any] | None = None,
    *,
    limit: int = 8,
) -> list[dict[str, Any]]:
    records = [
        dict(item)
        for item in state.get("dispatch_pauses", []) or []
        if isinstance(item, dict) and str(item.get("task_id") or "").strip()
    ]
    baseline_task = workspace_baseline_repair_task(status)
    covered_task_ids = workspace_baseline_cover_task_ids(baseline_task) if baseline_task else set()
    if covered_task_ids:
        records = [item for item in records if str(item.get("task_id") or "").strip() not in covered_task_ids]
    records.sort(key=lambda item: str(item.get("paused_at") or ""), reverse=True)
    return records[:limit]


def chair_attention_watermark(state: dict[str, Any]) -> datetime | None:
    """When the chair last looked at the fleet's urgent signals.

    Novelty used to be measured against last_review_at alone, which advances
    only when a review succeeds. A chair that kept failing therefore saw the
    same pause as unseen information on every tick, bypassed its own cooldown
    forever, and left the cadence with no brake at all. An attempt is a look:
    the chair was dispatched with that information in its briefing whether or
    not it managed to produce a verdict.
    """
    chair_state = state.get("chair_review") or {}
    seen = [
        stamp
        for stamp in (
            parse_runtime_timestamp(chair_state.get("last_review_at")),
            parse_runtime_timestamp(chair_state.get("last_attempt_at")),
        )
        if stamp is not None
    ]
    return max(seen) if seen else None


def chair_review_needs_immediate_attention(
    state: dict[str, Any],
    status: dict[str, Any] | None = None,
    approval_state: dict[str, Any] | None = None,
) -> bool:
    # Failure streaks carry an awaiting_chair flag that the chair clears, so a
    # streak that is still awaiting review is always new information.
    if repeated_failure_records(state, status):
        return True
    # Approvals and pauses both persist until something else resolves them, so
    # both are judged against the same watermark: only a signal recorded since
    # the chair last looked is new information. Pending approvals previously had
    # no watermark at all, which made their bypass permanent while one sat in
    # the queue.
    watermark = chair_attention_watermark(state)
    for item in pending_approval_items(approval_state or {}):
        created_at = parse_runtime_timestamp(str(item.get("created_at") or ""))
        if watermark is None or created_at is None or created_at > watermark:
            return True
    for pause in (
        *actionable_dispatch_pause_records(state, status, limit=1),
        *active_provider_pause_records(state),
    ):
        paused_at = parse_runtime_timestamp(str(pause.get("paused_at") or ""))
        if watermark is None or paused_at is None or paused_at > watermark:
            return True
    return False


def prune_failure_streaks(state: dict[str, Any], status: dict[str, Any]) -> bool:
    task_map = {str(task.get("id") or ""): task for task in status.get("tasks", []) or [] if task.get("id")}
    keep: dict[str, Any] = {}
    changed = False
    for key, record in failure_streak_registry(state).items():
        task_id = str(record.get("task_id") or "")
        role = str(record.get("role") or "")
        agent = str(record.get("agent") or "")
        task = task_map.get(task_id)
        if not task:
            changed = True
            continue
        task_status = str(task.get("status") or "").lower()
        if task_status in {"done", "superseded"}:
            changed = True
            continue
        if role == "reviewer":
            if task_status != "review" or str(task.get("reviewer") or "") != agent:
                changed = True
                continue
        elif role == "owner":
            if task_status not in {"todo", "backlog", "in_progress"} or str(task.get("owner") or "") != agent:
                changed = True
                continue
        keep[key] = record
    if changed:
        state["failure_streaks"] = keep
    return changed


def register_worker_failure_streak(
    config: dict[str, Any],
    state: dict[str, Any],
    worker: dict[str, Any],
    reason: str,
    *,
    terminal: bool,
) -> dict[str, Any] | None:
    task_id = str(worker.get("task_id") or "").strip()
    if not task_id:
        return None
    status = load_status(config)
    task = next((item for item in status.get("tasks", []) or [] if str(item.get("id") or "") == task_id), None)
    if task is None:
        return None
    role = worker_assignment_role(config, worker, task)
    if role is None:
        return None
    agent_name = display_name_for(config, str(worker.get("agent_id") or worker.get("provider") or ""))
    if not agent_name:
        return None
    failure = classify_worker_failure(config, worker, reason)
    kind = str(failure.get("kind") or "terminal")
    threshold = 1 if kind in {"auth", "quota_terminal"} else int(chair_review_settings(config).get("failure_streak_threshold", 2))
    registry = failure_streak_registry(state)
    key = failure_streak_key(task_id, role)
    previous = registry.get(key, {}) if isinstance(registry.get(key), dict) else {}
    count = int(previous.get("count", 0)) + 1 if previous.get("agent") == agent_name else 1
    record = {
        "task_id": task_id,
        "role": role,
        "agent": agent_name,
        "count": count,
        "threshold": threshold,
        "awaiting_chair": bool(terminal and count >= threshold),
        "last_failure_at": utc_now(),
        "last_failure_kind": kind,
        "last_failure_summary": str(worker.get("last_error_summary") or reason),
        "last_worker_run_id": worker.get("run_id"),
        "last_evidence_ref": worker.get("last_evidence_ref"),
    }
    registry[key] = record
    return record


def task_waiting_on_chair_reassignment(
    state: dict[str, Any],
    task: dict[str, Any],
    *,
    reason: str,
    target_agent: str,
) -> bool:
    role = task_role_for_dispatch_reason(reason)
    if role is None:
        return False
    task_id = str(task.get("id") or "")
    record = failure_streak_registry(state).get(failure_streak_key(task_id, role))
    if not isinstance(record, dict) or not record.get("awaiting_chair"):
        return False
    return str(record.get("agent") or "") == str(target_agent or "")


def normalized_mapping_values(mapping: dict[str, Any], key: str) -> list[str]:
    target = (key or "").strip().casefold()
    for candidate_key, values in mapping.items():
        if str(candidate_key).strip().casefold() != target:
            continue
        return [str(value).strip() for value in list(values or []) if str(value).strip()]
    return []


def known_agent_display_names(config: dict[str, Any]) -> set[str]:
    names = {
        str(agent.get("display_name") or agent.get("name") or agent_id).strip()
        for agent_id, agent in (config.get("agents", {}) or {}).items()
        if str(agent.get("display_name") or agent.get("name") or agent_id).strip()
    }
    try:
        status = load_status(config)
    except Exception:
        status = {}
    for agent in status.get("agents", []) or []:
        if not isinstance(agent, dict):
            continue
        name = str(agent.get("name") or "").strip()
        if name:
            names.add(name)
    return names


def display_name_is_legacy_alias(name: str | None) -> bool:
    return "legacy alias" in str(name or "").lower()


def status_agent_names_by_lane(status: dict[str, Any] | None) -> dict[str, str]:
    names: dict[str, str] = {}
    if not isinstance(status, dict):
        return names
    for agent in status.get("agents", []) or []:
        if not isinstance(agent, dict):
            continue
        name = str(agent.get("name") or "").strip()
        if not name:
            continue
        normalized = normalize_agent_id(name)
        if normalized:
            names[normalized] = name
    return names


def task_agent_display_name(config: dict[str, Any], status: dict[str, Any] | None, agent_id: str) -> str:
    agent = agent_config_for(config, agent_id)
    configured = str(agent.get("display_name") or agent.get("name") or agent_id).strip()
    by_lane = status_agent_names_by_lane(status)
    for candidate in (
        agent.get("provider"),
        agent.get("id"),
        agent_id,
        configured,
    ):
        normalized = normalize_agent_id(str(candidate or ""))
        if normalized in by_lane:
            return by_lane[normalized]
    return configured


def agent_supports_auto_delivery(
    config: dict[str, Any],
    provider_report: dict[str, Any] | None,
    agent_id: str,
) -> bool:
    report = provider_report if isinstance(provider_report, dict) else {}
    provider_info = provider_info_for_agent(config, report, agent_id)
    if provider_info.get("auth_ready") is False:
        return False
    adapter_info = adapter_info_for_agent(config, report, agent_id)
    if adapter_info:
        expected_adapter = str(agent_config_for(config, agent_id).get("adapter") or "").strip()
        reported_adapter = str(adapter_info.get("adapter") or "").strip()
        if expected_adapter and reported_adapter and expected_adapter != reported_adapter:
            return False
        if adapter_info.get("supported") is False or adapter_info.get("can_auto_deliver") is False:
            return False
        if adapter_info.get("can_auto_deliver") is True:
            return True
    if provider_info.get("local_cli_worker_supported") is False:
        return False
    return True


def first_viable_agent(
    config: dict[str, Any],
    preferred: list[str],
    exclude: set[str],
    state: dict[str, Any] | None = None,
    *,
    provider_report: dict[str, Any] | None = None,
) -> str | None:
    known = known_agent_display_names(config)
    seen: set[str] = set()
    effective_provider_report = provider_report
    if effective_provider_report is None and state is not None:
        effective_provider_report = load_provider_report(config)
    for candidate in preferred:
        name = str(candidate or "").strip()
        if not name or name in seen or name in exclude or display_name_is_legacy_alias(name):
            continue
        seen.add(name)
        if name in known:
            if lane_dispatch_disabled(config, name):
                continue
            if state is not None and is_agent_dispatch_paused(
                config,
                state,
                name,
                provider_report=effective_provider_report,
            ):
                continue
            return name
    return None


def ordered_idle_agent_names(idle_agent_names: list[str], agent_loads: dict[str, list[int]]) -> list[str]:
    indexed = list(enumerate(idle_agent_names))
    indexed.sort(
        key=lambda item: (
            len(agent_loads.get(item[1], [])),
            min(agent_loads.get(item[1], [99])),
            item[0],
        )
    )
    return [name for _index, name in indexed]


def recovered_taskless_dispatch_pause(
    config: dict[str, Any],
    state: dict[str, Any],
    pause: dict[str, Any],
    provider_report: dict[str, Any],
) -> bool:
    if str(pause.get("task_id") or "").strip():
        return False
    if str(pause.get("failure_kind") or "").strip().lower() != "auth":
        return False
    agent_id = normalize_agent_id(str(pause.get("provider") or ""))
    if not agent_id:
        return False
    if lane_has_recorded_pause(state, agent_id):
        return False
    provider_info = provider_info_for_agent(config, provider_report, agent_id)
    if provider_info.get("auth_ready") is False:
        return False
    adapter_info = adapter_info_for_agent(config, provider_report, agent_id)
    if adapter_info and adapter_info.get("supported") is False:
        return False
    return True


def prune_unmatched_provider_pauses(
    config_paths: dict[str, Any],
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
) -> bool:
    """Retire pause records that can no longer stop any configured lane.

    A pause is scoped to a lane, an identity or a quota pool. When the lane it
    was recorded against moves to a different account -- as codex2 did when its
    adapter changed -- the record outlives what it described: it cannot block
    dispatch any more, but it keeps the probe warning about a fault that no
    longer exists and pins the chair to provider_health_triage, because
    chair_review_reason picks that topic whenever any pause is on file. Stale
    state that still speaks is the failure this whole series has been removing.

    Identity- and pool-scoped records are only retired when at least one lane's
    identity actually resolved. A transient probe failure makes every account
    invisible at once, and dropping a real pause because we momentarily could
    not see the account is far worse than carrying a stale one for a cycle.
    Lane-scoped records need no identity, so they are judged on the lane alone.
    """
    registry = provider_pause_registry(state)
    if not registry:
        return False
    agent_ids = list((config.get("agents", {}) or {}))
    identities_resolved = any(
        isinstance(provider_info_for_agent(config, provider_report, agent_id).get("identity"), dict)
        for agent_id in agent_ids
    )
    kept: dict[str, Any] = {}
    retired: list[str] = []
    for key, entry in registry.items():
        if not isinstance(entry, dict):
            retired.append(key)
            continue
        if str(entry.get("scope") or "lane") != "lane" and not identities_resolved:
            kept[key] = entry
            continue
        if any(pause_covers_lane(config, provider_report, entry, agent_id) for agent_id in agent_ids):
            kept[key] = entry
            continue
        retired.append(key)
    if not retired:
        return False
    state["provider_pauses"] = kept
    write_activity_log(
        config_paths or config,
        {
            "type": "provider_pause_retired",
            "message": (
                "Retired provider pause(s) that no longer cover any configured lane: "
                + ", ".join(retired)
            ),
            "pause_scopes": retired,
        },
    )
    return True


def prune_completed_dispatch_pauses(
    state: dict[str, Any],
    status: dict[str, Any],
    *,
    config: dict[str, Any] | None = None,
    provider_report: dict[str, Any] | None = None,
) -> bool:
    tasks = status.get("tasks", [])
    if not isinstance(tasks, list):
        return False
    config = config or load_config()
    provider_report = provider_report or load_provider_report(config)
    task_by_id = {
        str(task.get("id") or ""): task
        for task in tasks
        if str(task.get("id") or "").strip()
    }
    active_task_ids = {
        str(worker.get("task_id") or "")
        for worker in (state.get("workers", {}) or {}).values()
        if str(worker.get("task_id") or "").strip() and is_active_worker(worker)
    }

    def pause_is_stale_for_updated_task(pause: dict[str, Any]) -> bool:
        task = task_by_id.get(str(pause.get("task_id") or ""))
        if not isinstance(task, dict):
            return False
        paused_at = str(pause.get("paused_at") or "").strip()
        last_update = str(task.get("last_update") or "").strip()
        return bool(paused_at and last_update and last_update > paused_at)

    pauses = list(state.get("dispatch_pauses", []) or [])
    keep = [
        pause
        for pause in pauses
        if str(task_by_id.get(str(pause.get("task_id") or ""), {}).get("status") or "").strip().lower() != "done"
        and str(pause.get("task_id") or "") not in active_task_ids
        and not pause_is_stale_for_updated_task(pause)
        and not recovered_taskless_dispatch_pause(config, state, pause, provider_report)
    ]
    if len(keep) == len(pauses):
        return False
    state["dispatch_pauses"] = keep
    return True


def proactive_claim_plan_for_idle_agent(
    config: dict[str, Any],
    *,
    task: dict[str, Any],
    task_map: dict[str, dict[str, Any]],
    idle_agent_name: str,
    idle_agent_names: list[str],
    agent_loads: dict[str, list[int]],
    helper_settings: dict[str, Any],
    state: dict[str, Any] | None = None,
) -> dict[str, str] | None:
    if not helper_settings.get("enabled", True):
        return None

    allowed_statuses = {str(value).lower() for value in helper_settings.get("task_statuses", ["backlog", "todo", "in_progress", "review"])}
    task_status = str(task.get("status") or "").lower()
    if task_status not in allowed_statuses:
        return None
    decision = resolve_domain_dispatch_target(task, task_map, ReadyDispatchPolicy.from_config(config))
    if decision is None or decision.target_agent == idle_agent_name:
        return None
    reason = decision.reason.value
    assigned_agent = decision.target_agent
    owner = str(task.get("owner") or "")
    reviewer = str(task.get("reviewer") or "")
    counterpart_agent = str(task.get("owner") or "") if reason == "review_ready_dispatch" else str(task.get("reviewer") or "")
    claim_role = "reviewer" if reason == "review_ready_dispatch" else "owner"

    if chair_reassignment_guard_active(state, str(task.get("id") or ""), claim_role, assigned_agent):
        return None

    if helper_settings.get("prefer_assigned_when_idle", True) and assigned_agent in idle_agent_names:
        return None

    # Respect explicit owner when their lane is paused (not just busy).
    # `idle_agent_names` excludes both paused and at-capacity agents, so
    # `assigned_agent not in idle_agent_names` conflates the two. Without
    # this guard, a task explicitly owned by a paused lane (e.g. Gemini
    # under quota_exhausted, or Codex with broken CLI) gets reshuffled
    # to whoever is idle — typically cascading the entire queue onto a
    # single lane. See feedback_supervisor_ignores_explicit_owner.md.
    if helper_settings.get("respect_explicit_owner_when_paused", True) and state is not None:
        if not lane_dispatch_disabled(config, assigned_agent) and is_agent_dispatch_paused(config, state, assigned_agent):
            assigned_load = len(agent_loads.get(assigned_agent, []))
            if assigned_load == 0:
                return None

    current_priority = dispatch_reason_priority(reason)
    assigned_loads = agent_loads.get(assigned_agent, [])
    has_higher_priority_load = current_priority is not None and any(priority < current_priority for priority in assigned_loads)
    if lane_dispatch_disabled(config, assigned_agent):
        # A lane ban (`max_tasks_per_agent_by_lane = 0`) means the assigned lane
        # cannot service this task on the current host, so waiting for
        # higher-priority load on that lane would deadlock dispatch.
        has_higher_priority_load = True
    assigned_busy = assigned_agent not in idle_agent_names

    if helper_settings.get("require_owner_higher_priority_load", False):
        if not has_higher_priority_load and not (helper_settings.get("availability_first", True) and assigned_busy):
            return None
    elif helper_settings.get("require_assigned_agent_busy", True) and not (assigned_busy or has_higher_priority_load):
        return None

    reassignment_settings = worker_reassignment_settings(config)
    ordered_idle = ordered_idle_agent_names(
        [
            name
            for name in idle_agent_names
            if name != assigned_agent and (claim_role != "reviewer" or name != counterpart_agent)
        ],
        agent_loads,
    )
    if claim_role == "reviewer":
        fallback_candidates = normalized_mapping_values(reassignment_settings.get("reviewer_fallbacks", {}), assigned_agent)
    else:
        fallback_candidates = normalized_mapping_values(reassignment_settings.get("owner_fallbacks", {}), assigned_agent)
    candidate_order = list(fallback_candidates)
    if helper_settings.get("availability_first", True) or helper_settings.get("allow_any_idle_lane", True):
        candidate_order.extend(ordered_idle)
    best_agent = first_viable_agent(
        config,
        candidate_order,
        exclude={assigned_agent, counterpart_agent} if claim_role == "reviewer" else {assigned_agent},
        state=state,
    )
    if best_agent != idle_agent_name:
        return None

    if claim_role == "reviewer":
        return {
            "reason": reason,
            "claim_role": claim_role,
            "assigned_agent": assigned_agent,
            "claim_agent": idle_agent_name,
            "new_owner": owner,
            "new_reviewer": idle_agent_name,
            "handoff_from": assigned_agent,
            "handoff_to": idle_agent_name,
        }

    reviewer_candidates: list[str] = []
    if reviewer:
        reviewer_candidates.append(reviewer)
    if owner and owner != reviewer:
        reviewer_candidates.append(owner)
    reviewer_candidates.extend(normalized_mapping_values(reassignment_settings.get("reviewer_fallbacks", {}), assigned_agent))
    if helper_settings.get("availability_first", True) or helper_settings.get("allow_any_idle_lane", True):
        reviewer_candidates.extend(ordered_idle)

    # Keep the reviewer separate from the claiming lane. Ask for a distinct one
    # first, every time, and only accept self-review when there is no other
    # viable reviewer at all — that is the deadlock this fallback exists for:
    # one healthy lane, an owner that can be reclaimed, and a review that
    # otherwise can never be reassigned.
    #
    # Deciding on idle-lane count instead would give up separation too early. A
    # lane that is busy running a worker is still a viable reviewer, so with one
    # idle lane and one busy lane the count says "deadlock" while a perfectly
    # good reviewer is standing there.
    new_reviewer = first_viable_agent(
        config, reviewer_candidates, exclude={idle_agent_name}, state=state
    )
    if not new_reviewer:
        new_reviewer = first_viable_agent(
            config, reviewer_candidates, exclude=set(), state=state
        )
    if not new_reviewer:
        return None
    return {
        "reason": reason,
        "claim_role": claim_role,
        "assigned_agent": assigned_agent,
        "claim_agent": idle_agent_name,
        "new_owner": idle_agent_name,
        "new_reviewer": new_reviewer,
        "handoff_from": assigned_agent,
        "handoff_to": idle_agent_name,
    }


def ensure_candidate_lifecycle_migration(
    config: dict[str, Any], status: dict[str, Any]
) -> bool:
    tasks = status.get("tasks", []) or []
    if not any(
        isinstance(task, dict) and task.get("candidate_lifecycle_version") != 1
        for task in tasks
    ):
        return False
    result = run_task_board_command(config, "migrate-candidate-lifecycle")
    if result.ok:
        return True
    write_activity_log(
        config,
        {
            "type": "candidate_lifecycle_migration_failed",
            "message": result.error,
        },
    )
    return False


def upsert_worker_dispatch_pause(
    state: dict[str, Any],
    worker: dict[str, Any],
    *,
    failure_kind: str,
    summary: str,
    raw_ref: str,
    blocked_until: str | None = None,
) -> None:
    upsert_dispatch_pause(
        state,
        {
            "provider": worker.get("provider"),
            "task_id": worker.get("task_id"),
            "worker_run_id": worker.get("run_id"),
            "paused_at": utc_now(),
            "blocked_until": blocked_until,
            "failure_kind": failure_kind,
            "summary": summary,
            "raw_ref": raw_ref,
            "mode_bucket": "execution",
        },
    )


def persist_task_reassignment(
    config: dict[str, Any],
    *,
    task_id: str,
    new_owner: str,
    new_reviewer: str,
    message: str,
    handoff_to: str | None = None,
    handoff_from: str | None = None,
    evidence_ref: str | None = None,
) -> bool:
    status = load_status(config)
    task = next((item for item in status.get("tasks", []) or [] if item.get("id") == task_id), None)
    if task is None:
        return False
    short_message = brief_reason_text(message, max_length=280)
    environ = {
        "AI_NAME": "Supervisor",
        "TASK_EXPECTED_OWNER": str(task.get("owner") or ""),
        "TASK_EXPECTED_REVIEWER": str(task.get("reviewer") or ""),
    }
    if evidence_ref:
        environ["TASK_EVIDENCE_REF"] = evidence_ref
    if handoff_to:
        environ["TASK_HANDOFF_TO"] = handoff_to
    if handoff_from:
        environ["TASK_HANDOFF_FROM"] = handoff_from
    result = run_task_board_command(
        config,
        "reassign",
        [task_id, new_owner, new_reviewer, short_message],
        environ=environ,
    )
    if result.ok:
        return True
    write_activity_log(
        config,
        {
            "type": "task_reassignment_failed",
            "task_id": task_id,
            "message": result.error,
        },
    )
    return False


def maybe_reassign_task_after_worker_failure(
    config: dict[str, Any],
    worker: dict[str, Any],
    reason: str,
    *,
    terminal: bool = False,
    state: dict[str, Any] | None = None,
    provider_report: dict[str, Any] | None = None,
) -> str | None:
    settings = worker_reassignment_settings(config)
    if not settings.get("enabled", True):
        return None

    if chair_review_settings(config).get("enabled", True):
        if state is not None and terminal:
            register_worker_failure_streak(config, state, worker, reason, terminal=True)
        return None

    attempt_number = int(worker.get("retry_count", 0)) + 1
    if not terminal and attempt_number < int(settings.get("after_attempts", 2)):
        return None
    if terminal and not settings.get("reassign_on_terminal_failure", True):
        return None

    task_id = str(worker.get("task_id") or "")
    if not task_id:
        return None
    status = load_status(config)
    task = next((item for item in status.get("tasks", []) if item.get("id") == task_id), None)
    if task is None:
        return None

    task_status = str(task.get("status") or "").lower()
    if task_status not in {str(value).lower() for value in settings.get("eligible_statuses", [])}:
        return None

    dispatch_settings = ready_dispatch_settings(config)
    review_statuses = {str(value).lower() for value in dispatch_settings.get("review_statuses", ["review"])}
    owned_statuses = {str(value).lower() for value in dispatch_settings.get("owned_statuses", ["in_progress", "todo", "backlog"])}

    failing_agent = display_name_for(config, str(worker.get("agent_id") or worker.get("provider") or ""))
    failure_label, failure_summary = summarize_worker_failure(config, worker, reason)
    evidence_ref = str(worker.get("last_evidence_ref") or "").strip() or None
    owner = str(task.get("owner") or "")
    reviewer = str(task.get("reviewer") or "")

    if task_status in review_statuses and reviewer == failing_agent:
        candidates = normalized_mapping_values(settings.get("reviewer_fallbacks", {}), failing_agent)
        new_reviewer = first_viable_agent(
            config,
            candidates,
            exclude={owner, reviewer},
            state=state,
            provider_report=provider_report,
        )
        if not new_reviewer:
            return None
        message = f"Auto-reassigned review from {reviewer} to {new_reviewer} after repeated {failing_agent} {failure_summary}"
        if evidence_ref:
            message += f" (raw_ref: {evidence_ref})"
        if not persist_task_reassignment(
            config,
            task_id=task_id,
            new_owner=owner,
            new_reviewer=new_reviewer,
            message=message,
            handoff_to=new_reviewer,
            handoff_from=reviewer,
            evidence_ref=evidence_ref,
        ):
            return None
        write_activity_log(
            config,
            {
                "type": "task_reassigned",
                "task_id": task_id,
                "message": message,
                "from_reviewer": reviewer,
                "to_reviewer": new_reviewer,
                "worker_run_id": worker.get("run_id"),
            },
        )
        console_log(
            f"reassigned review: task={task_id} from={reviewer} to={new_reviewer} kind={failure_label}",
            quiet=SUPERVISOR_LOG_QUIET,
        )
        return new_reviewer

    if task_status in owned_statuses and owner == failing_agent:
        candidates = normalized_mapping_values(settings.get("owner_fallbacks", {}), failing_agent)
        new_owner = first_viable_agent(
            config,
            candidates,
            exclude={owner, reviewer},
            state=state,
            provider_report=provider_report,
        )
        if not new_owner:
            return None
        reviewer_candidates = [reviewer]
        reviewer_candidates.extend(normalized_mapping_values(settings.get("reviewer_fallbacks", {}), failing_agent))
        reviewer_candidates.extend(normalized_mapping_values(settings.get("owner_fallbacks", {}), failing_agent))
        new_reviewer = first_viable_agent(
            config,
            reviewer_candidates,
            exclude={new_owner},
            state=state,
            provider_report=provider_report,
        )
        if not new_reviewer:
            return None
        message = f"Auto-reassigned ownership from {owner} to {new_owner} after repeated {failing_agent} {failure_summary}"
        if evidence_ref:
            message += f" (raw_ref: {evidence_ref})"
        if not persist_task_reassignment(
            config,
            task_id=task_id,
            new_owner=new_owner,
            new_reviewer=new_reviewer,
            message=message,
            handoff_from=owner,
            evidence_ref=evidence_ref,
        ):
            return None
        write_activity_log(
            config,
            {
                "type": "task_reassigned",
                "task_id": task_id,
                "message": message,
                "from_owner": owner,
                "to_owner": new_owner,
                "from_reviewer": reviewer,
                "to_reviewer": new_reviewer,
                "worker_run_id": worker.get("run_id"),
            },
        )
        console_log(
            f"reassigned owner: task={task_id} from={owner} to={new_owner} kind={failure_label}",
            quiet=SUPERVISOR_LOG_QUIET,
        )
        return new_owner

    return None


def is_transient_worker_failure(config: dict[str, Any], worker: dict[str, Any], reason: str | None) -> bool:
    if not reason:
        return False
    if not worker_retry_settings(config, worker.get("provider")).get("enabled", True):
        return False
    return bool(classify_worker_failure(config, worker, reason).get("transient"))


def retry_delay_seconds(config: dict[str, Any], worker: dict[str, Any]) -> float:
    retry = worker_retry_settings(config, worker.get("provider"))
    retry_count = int(worker.get("retry_count", 0))
    schedule = list(retry.get("backoff_schedule_seconds", []) or [5, 15, 30, 60, 120])
    index = min(retry_count, len(schedule) - 1)
    base_delay = float(schedule[index])
    jitter = float(retry.get("jitter_seconds", 0) or 0)
    return base_delay + (random.uniform(0, jitter) if jitter > 0 else 0)


def request_for_worker(config: dict[str, Any], worker: dict[str, Any]) -> DeliveryRequest | None:
    snapshot = worker.get("request_snapshot")
    if isinstance(snapshot, dict) and snapshot.get("message"):
        return request_from_snapshot(snapshot)
    queue_event_id = worker.get("queue_event_id")
    if not queue_event_id:
        return None
    for event in load_event_queue(config):
        if event.get("event_id") == queue_event_id:
            return build_request(config, event)
    return None


def schedule_worker_retry(config: dict[str, Any], worker: dict[str, Any], reason: str) -> None:
    delay = retry_delay_seconds(config, worker)
    retry_at = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() + delay, tz=timezone.utc)
    worker["status"] = "retry_backoff"
    worker["retry_count"] = int(worker.get("retry_count", 0)) + 1
    worker["next_retry_at"] = retry_at.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    worker["last_error"] = reason
    worker["last_event_at"] = utc_now()


def existing_file_inbox_fallback_run_id(state: dict[str, Any], queue_event_id: str | None, exclude_run_id: str | None = None) -> str | None:
    if not queue_event_id:
        return None
    fallback_statuses = {"manual_pending", "waiting_approval", "running", "retry_backoff", "fallback", "completed"}
    for candidate in state.get("workers", {}).values():
        if candidate.get("run_id") == exclude_run_id:
            continue
        if candidate.get("queue_event_id") != queue_event_id:
            continue
        if candidate.get("mode") != "file_inbox":
            continue
        if candidate.get("status") not in fallback_statuses:
            continue
        run_id = candidate.get("run_id")
        if run_id:
            return str(run_id)
    return None


def maybe_trigger_retry_or_fallback(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
    worker: dict[str, Any],
    reason: str,
    *,
    allow_provider_pause: bool = True,
) -> tuple[bool, bool]:
    retry = worker_retry_settings(config, worker.get("provider"))
    failure = classify_worker_failure(config, worker, reason)
    failure_kind, failure_summary = summarize_worker_failure(config, worker, reason)
    evidence_ref = record_worker_evidence(config, worker, reason)
    worker["last_error"] = failure_summary
    worker["last_error_kind"] = failure_kind
    worker["last_error_summary"] = failure_summary
    worker["last_evidence_ref"] = evidence_ref
    max_attempts = int(retry.get("max_attempts", 5))
    retry_count = int(worker.get("retry_count", 0))
    request = request_for_worker(config, worker)
    if request is None:
        return False, False
    reassigned_to = maybe_reassign_task_after_worker_failure(config, worker, reason, state=state)
    if reassigned_to:
        worker["status"] = "reassigned"
        worker["reassigned_to"] = reassigned_to
        worker["last_error"] = reason
        worker["last_event_at"] = utc_now()
        finalize_queue_event_record(config, state, worker, "completed")
        return True, True
    if retry_count < max_attempts:
        schedule_worker_retry(config, worker, failure_summary)
        if failure.get("kind") == "capacity" and allow_provider_pause:
            agent_id = str(worker.get("agent_id") or worker.get("provider") or "")
            next_retry_at = parse_runtime_timestamp(worker.get("next_retry_at"))
            reset_seconds = None
            if next_retry_at is not None:
                reset_seconds = max(1, int((next_retry_at - datetime.now(timezone.utc)).total_seconds()))
            if agent_id:
                pause_provider(state, agent_id, failure_summary, kind="capacity", reset_seconds=reset_seconds)
        upsert_worker_dispatch_pause(
            state,
            worker,
            failure_kind=failure_kind,
            summary=failure_summary,
            raw_ref=evidence_ref,
            blocked_until=worker.get("next_retry_at"),
        )
        write_activity_log(
            config,
            {
                "type": "worker_retry_scheduled",
                "provider": worker.get("provider"),
                "task_id": worker.get("task_id"),
                "message": f"Transient worker failure detected ({failure_kind}); retry {worker.get('retry_count')} scheduled at {worker.get('next_retry_at')}: {failure_summary} (raw_ref: {evidence_ref})",
                "worker_run_id": worker["run_id"],
                "next_retry_at": worker.get("next_retry_at"),
            },
        )
        console_log(
            f"retry scheduled: provider={worker.get('provider')} task={worker.get('task_id')} kind={failure_kind} next={worker.get('next_retry_at')}",
            quiet=SUPERVISOR_LOG_QUIET,
        )
        return True, True

    if retry.get("fallback_mode") == "file_inbox":
        existing_fallback = existing_file_inbox_fallback_run_id(
            state,
            worker.get("queue_event_id"),
            exclude_run_id=worker.get("run_id"),
        )
        if existing_fallback:
            worker["status"] = "fallback"
            worker["fallback_run_id"] = existing_fallback
            worker["last_event_at"] = utc_now()
            return True, True
        if not worker.get("fallback_run_id"):
            ok, outcome, _ = start_worker_for_request(
                config,
                state,
                provider_report,
                request,
                queue_event_id=worker.get("queue_event_id"),
                attempt_count=int(worker.get("attempt_count", 0)) + 1,
                event_id_for_log=worker.get("queue_event_id"),
                parent_run_id=worker["run_id"],
                delivery_mode_override="file_inbox",
                activity_type="worker_fallback_started",
                activity_message=f"Worker fell back to file inbox after transient failures: {reason}",
            )
            if ok:
                worker["status"] = "fallback"
                worker["fallback_run_id"] = outcome
                worker["last_event_at"] = utc_now()
                upsert_worker_dispatch_pause(
                    state,
                    worker,
                    failure_kind=failure_kind,
                    summary=failure_summary,
                    raw_ref=evidence_ref,
                )
                return True, True
    return False, False


def missing_declared_outputs(paths: Any) -> list[str]:
    """Which of the declared output paths do not exist.

    One implementation, because two layers ask it: the worker lifecycle checks
    the contract the dispatch event declared, and the chair checks the same
    contract before trusting a decision packet. The chair used to hand-roll its
    own `markdown_path.exists()` test, which is the same question asked a second
    way -- and a second way is how the two drift apart.
    """
    return [str(path) for path in (paths or []) if not Path(str(path)).exists()]


def undelivered_declared_outputs(worker: dict[str, Any]) -> list[str]:
    """Outputs the dispatch event declared that the run never produced.

    Workers are launched detached and observed through /proc, so no exit status
    is ever captured. Completion was therefore inferred from two negatives --
    the process is gone, and no line in its log matched one of the known failure
    patterns -- which makes success the default for every failure mode nobody
    has written a pattern for yet. An antigravity run whose entire log read
    "Error: Agent execution terminated due to error." was recorded as having
    exited cleanly, and the lane failure was never attributed to anyone.

    The dispatch already states what the run must produce, so that contract is
    the positive evidence the runtime has been throwing away. Enforcing it here
    is what stops the pattern list from being the only line of defence; the list
    goes back to its real job, deciding whether a fault belongs to the provider.
    An empty declaration stays a no-op -- only a stated contract can be checked.
    """
    return missing_declared_outputs((worker.get("request_snapshot") or {}).get("target_files"))


def finalize_terminal_worker_outcome(
    config: dict[str, Any],
    state: dict[str, Any],
    worker: dict[str, Any],
    reason: str,
    *,
    allow_provider_pause: bool = False,
) -> bool:
    reason = resolve_terminal_worker_reason(worker, reason)
    if allow_provider_pause:
        maybe_pause_provider_for_terminal_failure(config, state, worker, reason)
    # Lane-health safety net runs regardless of allow_provider_pause: an
    # unclassified/unauthorized terminal failure (e.g. codex's revoked-token 401
    # that surfaces only as a premature exit) still counts toward the lane's
    # distinct-task failure streak so a dead lane gets paused instead of staying a
    # zero-load magnet for re-dispatch.
    maybe_autopause_unhealthy_lane(config, state, worker, reason)
    failure_kind, failure_summary = summarize_worker_failure(config, worker, reason)
    evidence_ref = record_worker_evidence(config, worker, reason)
    worker["last_error"] = failure_summary
    worker["last_error_kind"] = failure_kind
    worker["last_error_summary"] = failure_summary
    worker["last_evidence_ref"] = evidence_ref
    reassigned_to = maybe_reassign_task_after_worker_failure(
        config,
        worker,
        reason,
        terminal=True,
        state=state,
    )
    if reassigned_to:
        worker["status"] = "reassigned"
        worker["reassigned_to"] = reassigned_to
        worker["last_event_at"] = utc_now()
        upsert_worker_dispatch_pause(
            state,
            worker,
            failure_kind=failure_kind,
            summary=failure_summary,
            raw_ref=evidence_ref,
        )
        finalize_queue_event_record(config, state, worker, "completed")
        return True

    worker["status"] = "failed"
    worker["last_event_at"] = utc_now()
    upsert_worker_dispatch_pause(
        state,
        worker,
        failure_kind=failure_kind,
        summary=failure_summary,
        raw_ref=evidence_ref,
    )
    write_activity_log(
        config,
        {
            "type": "worker_failed",
            "provider": worker.get("provider"),
            "task_id": worker.get("task_id"),
            "message": f"{failure_summary} (raw_ref: {evidence_ref})",
            "worker_run_id": worker["run_id"],
            "pr_url": worker.get("pr_url"),
            "session_url": worker.get("session_url"),
        },
    )
    finalize_queue_event_record(config, state, worker, "failed", f"{failure_summary} (raw_ref: {evidence_ref})")
    return False


def worker_expected_completion_statuses(
    config: dict[str, Any],
    worker: dict[str, Any],
    task: dict[str, Any] | None,
) -> set[str]:
    settings = ready_dispatch_settings(config)
    review_statuses = {str(value).lower() for value in settings.get("review_statuses", ["review"])}
    integrating_statuses = {"integrating"}
    done_statuses = {str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])}
    statuses = set(done_statuses)

    reason = str(((worker.get("request_snapshot") or {}).get("reason")) or "").strip().lower()
    if reason in {"owned_ready_dispatch", "owned_in_progress_dispatch"}:
        statuses.update(review_statuses)
        return statuses
    if reason == "review_ready_dispatch":
        statuses.update(integrating_statuses)
        return statuses
    if reason == "acceptance_ready_dispatch":
        # An acceptance worker either records all required same-SHA evidence,
        # leaves the task in acceptance for a later evidence source, or
        # reopens implementation when deployed verification finds a defect.
        statuses.update({"acceptance", "in_progress"})
        return statuses

    if not task:
        return statuses

    schema = config.get("schema", {})
    owner_field = schema.get("assignee_field", "owner")
    reviewer_field = schema.get("reviewer_field", "reviewer")
    agent_id = normalize_agent_id(str(worker.get("agent_id") or worker.get("provider") or ""))
    owner_id = normalize_agent_id(str(task.get(owner_field) or ""))
    reviewer_id = normalize_agent_id(str(task.get(reviewer_field) or ""))
    if agent_id and agent_id == reviewer_id:
        statuses.update(integrating_statuses)
    elif agent_id and agent_id == owner_id:
        statuses.update(review_statuses)
    return statuses


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


def worker_progress_retry_seconds(config: dict[str, Any]) -> int:
    settings = config.get("supervisor") or {}
    return max(0, int(settings.get("progress_retry_seconds", 120)))


def consume_progress_outcome(
    config: dict[str, Any],
    worker: dict[str, Any],
    outcome: dict[str, Any],
    *,
    now: datetime | None = None,
) -> bool:
    """Persist one completed progress attempt and its immutable redispatch time."""
    current = now or datetime.now(timezone.utc)
    completed_at = current.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    retry_after = current + timedelta(seconds=worker_progress_retry_seconds(config))
    redispatch_after = retry_after.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return consume_worker_result(
        worker,
        outcome,
        completed_at=completed_at,
        redispatch_after=redispatch_after,
    )


def apply_worker_reported_block(
    config: dict[str, Any], worker: dict[str, Any], outcome: dict[str, Any]
) -> bool:
    task_id = str(worker.get("task_id") or "").strip()
    if not task_id:
        return False
    reported_reason = str(outcome.get("blocker") or outcome.get("summary") or "")
    if classify_worker_failure(config, worker, reported_reason).get("kind") == "environment":
        return False
    summary = brief_reason_text(reported_reason or "Worker reported a blocker.", max_length=280)
    result_path = str(worker.get("result_path") or "").strip()
    evidence_ref = canonical_relpath(config, Path(result_path)) if result_path else ""
    result = run_task_board_command(
        config,
        "system-block",
        [task_id, summary],
        environ={
            "AI_NAME": "Supervisor",
            "AI_STATUS_PRODUCER": "worker_result_recovery",
            "ORCH_RUN_ID": str(worker.get("run_id") or ""),
            "EVIDENCE_REF": evidence_ref,
        },
    )
    return result.ok


def retry_due_workers(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
    now: datetime,
) -> bool:
    changed = False
    active_sibling_statuses = {"running", "manual_pending", "waiting_approval", "suspended_approval", "stalled", "fallback"}
    for worker in list(state.get("workers", {}).values()):
        if worker.get("status") != "retry_backoff":
            continue
        next_retry_at = parse_runtime_timestamp(worker.get("next_retry_at"))
        if next_retry_at is None or next_retry_at > now:
            continue
        queue_event_id = worker.get("queue_event_id")
        run_id = str(worker.get("run_id") or "")
        shadowed = False
        for sibling in state.get("workers", {}).values():
            if sibling is worker or sibling.get("queue_event_id") != queue_event_id:
                continue
            sibling_status = str(sibling.get("status") or "")
            sibling_run_id = str(sibling.get("run_id") or "")
            if sibling_status in active_sibling_statuses or (sibling_status == "retry_backoff" and sibling_run_id > run_id):
                shadowed = True
                break
        if shadowed:
            worker["status"] = "superseded"
            worker["last_event_at"] = utc_now()
            worker["last_error"] = "Retry suppressed because another worker already owns this queue event."
            write_activity_log(
                config,
                {
                    "type": "worker_superseded",
                    "provider": worker.get("provider"),
                    "task_id": worker.get("task_id"),
                    "message": worker["last_error"],
                    "worker_run_id": worker.get("run_id"),
                },
            )
            changed = True
            continue
        request = request_for_worker(config, worker)
        if request is None:
            worker["status"] = "failed"
            worker["last_event_at"] = utc_now()
            write_activity_log(
                config,
                {
                    "type": "worker_failed",
                    "provider": worker.get("provider"),
                    "task_id": worker.get("task_id"),
                    "message": "Retry was due, but the original request could not be reconstructed.",
                    "worker_run_id": worker["run_id"],
                },
            )
            changed = True
            continue
        ok, outcome, _ = start_worker_for_request(
            config,
            state,
            provider_report,
            request,
            queue_event_id=worker.get("queue_event_id"),
            attempt_count=int(worker.get("attempt_count", 0)) + 1,
            event_id_for_log=worker.get("queue_event_id"),
            parent_run_id=worker["run_id"],
            activity_type="worker_retried",
            activity_message=f"Worker retry launched after backoff from {worker['run_id']}",
        )
        if ok:
            worker["status"] = "retried"
            worker["superseded_by_run_id"] = outcome
            worker["last_event_at"] = utc_now()
        else:
            if str(outcome or "").startswith("resource_admission:"):
                delay = max(1, int((config.get("supervisor") or {}).get("dispatch_defer_retry_seconds", 15)))
                worker["status"] = "retry_backoff"
                worker["next_retry_at"] = (
                    datetime.now(timezone.utc) + timedelta(seconds=delay)
                ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            else:
                worker["status"] = "failed"
                worker["last_event_at"] = utc_now()
                worker["last_error"] = outcome
        changed = True
    return changed


def _claude_resume_allowed_tools(approval: dict[str, Any] | None) -> list[str]:
    if not approval:
        return []
    candidates: list[str] = []
    for value in (
        approval.get("resume_override_rule"),
        approval.get("suggested_rule"),
        approval.get("tool_name"),
    ):
        if not isinstance(value, str):
            continue
        normalized = value.strip()
        if normalized and normalized not in candidates:
            candidates.append(normalized)
    return candidates


def worker_supports_approval_resume(worker: dict[str, Any]) -> bool:
    return bool(
        str(worker.get("provider") or "").startswith("claude")
        and (worker.get("session_id") or worker.get("resume_token"))
    )


def resume_claude_worker(
    config: dict[str, Any],
    worker: dict[str, Any],
    provider_report: dict[str, Any],
    *,
    approval: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    session_id = worker.get("session_id") or worker.get("resume_token")
    if not session_id:
        return None
    provider_key = str(worker.get("provider") or "claude").strip() or "claude"
    provider = config.get("providers", {}).get(provider_key, config.get("providers", {}).get("claude", {}))
    runtime = provider.get("runtime", {})
    cli = command_exists(runtime.get("cli") or "claude")
    if not cli:
        return None
    command = [
        runtime.get("cli") or cli,
        "--resume",
        str(session_id),
        "--output-format",
        runtime.get("output_format", "stream-json"),
    ]
    if runtime.get("output_format", "stream-json") == "stream-json":
        command.append("--verbose")
    if runtime.get("include_hook_events", True):
        command.append("--include-hook-events")
    allowed_tools = (
        _claude_resume_allowed_tools(approval)
        if runtime.get("resume_use_allowed_tools_from_approval", True)
        else []
    )
    if allowed_tools:
        command.extend(["--allowedTools", *allowed_tools])
    provider_info = (provider_report or {}).get("providers", {}).get(provider_key, {})
    resume_permission_mode = runtime.get("resume_permission_mode_after_approval", "bypassPermissions")
    if worker.get("last_approval_id"):
        command.extend(["--permission-mode", resume_permission_mode])
    elif runtime.get("enable_auto_mode_if_supported", True) and provider_info.get("supports_auto_approve"):
        command.extend(["--permission-mode", runtime.get("auto_permission_mode", "auto")])
    else:
        command.extend(["--permission-mode", runtime.get("permission_mode", "acceptEdits")])
    mcp_config = runtime.get("mcp_config")
    if mcp_config:
        command.extend(["--mcp-config", str(config_path(config, "claude_mcp_config"))])
    log_path = config_path(config, "state_file").parent / "logs" / f"{new_runtime_id(f'{provider_key}-resume')}.log"
    env = os.environ.copy()
    runtime_overrides = runtime_env_overrides(runtime)
    for key in ("HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME"):
        if runtime_overrides.get(key):
            Path(runtime_overrides[key]).mkdir(parents=True, exist_ok=True)
    env.update(runtime_overrides)
    env.update(
        {
            "ORCH_RUN_ID": worker["run_id"],
            "ORCH_TASK_ID": worker.get("task_id") or "",
            "ORCH_AGENT_ID": worker.get("agent_id") or "",
            "ORCH_SESSION_ID": str(session_id),
        }
    )
    metadata = worker.get("metadata") if isinstance(worker.get("metadata"), dict) else {}
    worker_unit = apply_worker_unit_env(env, config, worker["run_id"], metadata)
    process, _ = spawn_background_process(
        command,
        cwd=config_path(config, "status_file").parents[0],
        log_path=log_path,
        env=env,
    )
    previous_logs = list(worker.get("previous_log_paths") or [])
    if worker.get("log_path"):
        previous_logs.append(worker["log_path"])
    worker["previous_log_paths"] = previous_logs
    worker["pid"] = background_process_pid(process)
    worker["worker_unit"] = worker_unit
    worker["status"] = "running"
    worker["deferred_action"] = None
    worker["last_event_at"] = utc_now()
    worker["log_path"] = str(log_path)
    worker["resume_count"] = int(worker.get("resume_count", 0)) + 1
    worker["last_resumed_session_id"] = str(session_id)
    worker["command"] = command
    worker.setdefault("metadata", {})["shell_command"] = shell_quote(command)
    worker["metadata"]["resume_permission_mode"] = resume_permission_mode if worker.get("last_approval_id") else None
    worker["metadata"]["resume_allowed_tools"] = allowed_tools
    return {
        "command": command,
        "log_path": str(log_path),
        "pid": background_process_pid(process),
        "allowed_tools": allowed_tools,
    }


def handle_worker_failure_signal(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
    worker: dict[str, Any],
    failure_signal: WorkerFailureSignal,
    *,
    current_mode: str,
    live: bool,
) -> tuple[bool, bool]:
    """Apply a detected provider failure and report (handled, changed)."""
    failure_reason = failure_signal.reason
    failure = classify_worker_failure(config, worker, failure_reason)
    if live and failure.get("kind") not in {"auth", "quota_terminal", "capacity"}:
        return False, False

    prefix = "live worker failure" if live else "worker failure"
    transient = "" if live else f" transient={'yes' if failure.get('transient') else 'no'}"
    console_log(
        f"{prefix}: provider={worker.get('provider')} task={worker.get('task_id')} "
        f"kind={failure.get('label')}{transient} source={failure_signal.source} reason={failure_reason}",
        quiet=SUPERVISOR_LOG_QUIET,
    )
    if maybe_rotate_antigravity_lane(
        config,
        state,
        provider_report,
        worker,
        failure,
        failure_reason,
        authorized=failure_signal.provider_pause_authorized,
    ):
        return True, True

    if live:
        terminate_worker_pid(worker.get("pid"))

    authorized = failure_signal.provider_pause_authorized
    agent_id = str(worker.get("agent_id") or worker.get("provider") or "")
    if failure.get("kind") == "quota_terminal" and authorized and agent_id:
        pause_provider(
            state,
            agent_id,
            failure_reason,
            kind="quota",
            reset_seconds=14400,
            identity=worker.get("identity"),
        )
    if failure.get("kind") == "auth" and authorized and agent_id:
        pause_provider(
            state,
            agent_id,
            failure_reason,
            kind="auth",
            reset_seconds=None,
            identity=worker.get("identity"),
        )
    if failure.get("kind") == "capacity" and current_mode == "coordination":
        reset_seconds = int(
            worker_retry_settings(config, worker.get("provider")).get("capacity_pause_seconds", 300)
        )
        if agent_id and authorized:
            pause_provider(
                state,
                agent_id,
                failure_reason,
                kind="capacity",
                reset_seconds=reset_seconds,
            )
        finalize_terminal_worker_outcome(config, state, worker, failure_reason)
        return True, True

    if is_transient_worker_failure(config, worker, failure_reason):
        handled, changed = maybe_trigger_retry_or_fallback(
            config,
            state,
            provider_report,
            worker,
            failure_reason,
            allow_provider_pause=authorized,
        )
        if handled:
            return True, changed

    reassigned_to = maybe_reassign_task_after_worker_failure(
        config,
        worker,
        failure_reason,
        terminal=True,
        state=state,
        provider_report=provider_report,
    )
    if reassigned_to:
        worker["status"] = "reassigned"
        worker["reassigned_to"] = reassigned_to
        worker["last_error"] = failure_reason
        worker["last_event_at"] = utc_now()
        finalize_queue_event_record(config, state, worker, "completed")
        return True, True

    finalize_terminal_worker_outcome(config, state, worker, failure_reason)
    return True, True


def finalize_exited_worker(
    config: dict[str, Any],
    state: dict[str, Any],
    worker: dict[str, Any],
    *,
    current_mode: str,
    task_status: str,
    expected_completion_statuses: set[str],
    now: datetime,
) -> bool:
    """Consume the outcome of a dead worker that has no provider failure."""
    if is_terminal_worker(worker) or worker.get("status") == "manual_pending":
        return False

    if current_mode in {"planning", "coordination"}:
        undelivered = undelivered_declared_outputs(worker)
        if undelivered:
            finalize_terminal_worker_outcome(
                config,
                state,
                worker,
                "Worker exited without producing its declared output: "
                + ", ".join(undelivered[:3]),
            )
            return True
        worker["status"] = "completed"
        worker["last_event_at"] = utc_now()
        write_activity_log(
            config,
            {
                "type": "worker_completed",
                "provider": worker.get("provider"),
                "task_id": worker.get("task_id"),
                "message": f"{current_mode.title()} worker exited cleanly.",
                "worker_run_id": worker["run_id"],
                "session_url": worker.get("session_url"),
            },
        )
        finalize_queue_event_record(config, state, worker, "completed")
    elif task_status in expected_completion_statuses:
        worker["status"] = "completed"
        worker["last_event_at"] = utc_now()
        write_activity_log(
            config,
            {
                "type": "worker_completed",
                "provider": worker.get("provider"),
                "task_id": worker.get("task_id"),
                "message": f"Background worker process exited after advancing the task to `{task_status}`.",
                "worker_run_id": worker["run_id"],
                "pr_url": worker.get("pr_url"),
                "session_url": worker.get("session_url"),
            },
        )
        finalize_queue_event_record(config, state, worker, "completed")
    else:
        outcome = worker_reported_outcome(worker)
        if outcome and outcome.get("outcome") == "blocked" and apply_worker_reported_block(config, worker, outcome):
            worker["status"] = "completed"
            worker["last_event_at"] = utc_now()
            finalize_queue_event_record(config, state, worker, "completed")
            write_activity_log(
                config,
                {
                    "type": "worker_completed",
                    "provider": worker.get("provider"),
                    "task_id": worker.get("task_id"),
                    "message": "Supervisor persisted the worker's reported task blocker.",
                    "worker_run_id": worker["run_id"],
                },
            )
            return True
        if outcome and outcome.get("outcome") in {"advanced", "progress"}:
            if not consume_progress_outcome(config, worker, outcome, now=now):
                return False
            finalize_queue_event_record(config, state, worker, "completed")
            write_activity_log(
                config,
                {
                    "type": "worker_progress_completed",
                    "provider": worker.get("provider"),
                    "task_id": worker.get("task_id"),
                    "message": "Worker reported progress; its completed attempt owns the redispatch cooldown.",
                    "worker_run_id": worker["run_id"],
                    "result_id": worker.get("consumed_result_id"),
                },
            )
            return True

        # The cached task snapshot can predate a worker's final status write.
        fresh_task = task_index_from_status(config, load_status(config)).get(worker.get("task_id")) or {}
        fresh_status = str(fresh_task.get("status") or "").lower()
        if fresh_status and fresh_status != task_status and fresh_status in expected_completion_statuses:
            worker["status"] = "completed"
            worker["last_event_at"] = utc_now()
            write_activity_log(
                config,
                {
                    "type": "worker_completed",
                    "provider": worker.get("provider"),
                    "task_id": worker.get("task_id"),
                    "message": (
                        f"Background worker process exited after advancing the task to `{fresh_status}` "
                        "(observed on fresh re-read; cached snapshot predated the worker's status write)."
                    ),
                    "worker_run_id": worker["run_id"],
                    "pr_url": worker.get("pr_url"),
                    "session_url": worker.get("session_url"),
                },
            )
            finalize_queue_event_record(config, state, worker, "completed")
        else:
            finalize_terminal_worker_outcome(
                config,
                state,
                worker,
                PREMATURE_EXIT_REASON,
                allow_provider_pause=True,
            )

    if worker.get("status") == "completed":
        clear_lane_failure(state, worker.get("agent_id") or worker.get("provider"))
    return True


def handle_worker_approval_state(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
    worker: dict[str, Any],
    *,
    pending: list[dict[str, Any]],
    resolved: list[dict[str, Any]],
    alive: bool,
) -> tuple[bool, bool]:
    """Advance approval state and report (stop_processing, changed)."""
    if pending:
        if not alive and not worker_supports_approval_resume(worker):
            worker["status"] = "failed"
            worker["deferred_action"] = None
            worker["deferred_tool_use"] = None
            worker["last_event_at"] = utc_now()
            worker["last_error"] = "Worker exited while waiting for approval."
            for approval in pending:
                approval_id = approval.get("approval_id")
                if not approval_id:
                    continue
                try:
                    resolve_approval(
                        config,
                        approval_id,
                        decision="deny",
                        note="Auto-denied because the worker exited before approval could be applied.",
                        remember=False,
                    )
                except KeyError:
                    pass
            write_activity_log(
                config,
                {
                    "type": "worker_failed",
                    "provider": worker.get("provider"),
                    "task_id": worker.get("task_id"),
                    "message": worker["last_error"],
                    "worker_run_id": worker["run_id"],
                },
            )
            finalize_queue_event_record(config, state, worker, "failed", worker["last_error"])
            return True, True

        approval = pending[0]
        next_status = "waiting_approval" if alive else "suspended_approval"
        if worker.get("status") == next_status:
            return True, False
        worker["status"] = next_status
        worker["deferred_action"] = approval.get("approval_id")
        worker["last_event_at"] = approval.get("created_at") or worker.get("last_event_at") or utc_now()
        write_activity_log(
            config,
            {
                "type": "worker_waiting_approval",
                "provider": worker.get("provider"),
                "task_id": worker.get("task_id"),
                "message": (
                    f"Worker suspended for approval {approval.get('approval_id')}"
                    if next_status == "suspended_approval"
                    else f"Worker waiting on approval {approval.get('approval_id')}"
                ),
                "worker_run_id": worker["run_id"],
                "approval_id": approval.get("approval_id"),
            },
        )
        if worker.get("queue_event_id"):
            queue_status(state, worker["queue_event_id"])["status"] = "manual_pending"
        return True, True

    changed = False
    if worker.get("status") in {"waiting_approval", "suspended_approval"} and resolved:
        latest = resolved[-1]
        if latest.get("approval_id") != worker.get("last_approval_id"):
            worker["last_approval_id"] = latest.get("approval_id")
            if latest.get("decision") == "allow" and worker_supports_approval_resume(worker):
                resumed = resume_claude_worker(config, worker, provider_report, approval=latest)
                write_activity_log(
                    config,
                    {
                        "type": "worker_resumed",
                        "provider": worker.get("provider"),
                        "task_id": worker.get("task_id"),
                        "message": f"Resumed worker after approval {latest.get('approval_id')}",
                        "worker_run_id": worker["run_id"],
                        "approval_id": latest.get("approval_id"),
                        "command": resumed.get("command") if resumed else None,
                        "log_path": resumed.get("log_path") if resumed else None,
                        "allowed_tools": resumed.get("allowed_tools") if resumed else None,
                    },
                )
                changed = True
                if resumed:
                    return True, True
            if latest.get("decision") == "deny":
                worker["status"] = "failed"
                worker["last_event_at"] = utc_now()
                reason = latest.get("note") or "Worker approval denied."
                write_activity_log(
                    config,
                    {
                        "type": "worker_failed",
                        "provider": worker.get("provider"),
                        "task_id": worker.get("task_id"),
                        "message": reason,
                        "worker_run_id": worker["run_id"],
                        "approval_id": latest.get("approval_id"),
                    },
                )
                finalize_queue_event_record(config, state, worker, "failed", reason)
                return True, True
        changed = True

    current_status = worker.get("status")
    if current_status not in {"waiting_approval", "suspended_approval"}:
        return False, changed

    worker["deferred_action"] = None
    worker["deferred_tool_use"] = None
    if not resolved:
        worker["last_approval_id"] = None
    worker["last_event_at"] = utc_now()
    if alive:
        worker["status"] = "running"
    else:
        worker["status"] = "failed"
        worker["last_error"] = (
            "Approval state disappeared before the worker could resume."
            if current_status == "waiting_approval"
            else "Approval state disappeared before the suspended worker could resume."
        )
        write_activity_log(
            config,
            {
                "type": "worker_failed",
                "provider": worker.get("provider"),
                "task_id": worker.get("task_id"),
                "message": worker["last_error"],
                "worker_run_id": worker["run_id"],
            },
        )
        finalize_queue_event_record(config, state, worker, "failed", worker["last_error"])
    return False, True


def supersede_worker(
    config: dict[str, Any],
    state: dict[str, Any],
    worker: dict[str, Any],
    *,
    alive: bool,
    reason: str,
    console_reason: str,
) -> bool:
    """Supersede a worker unless its dispatch cooldown still protects it."""
    if alive and worker_in_dispatch_cooldown(
        worker,
        ready_dispatch_settings(config).get("dispatch_cooldown_seconds", 300),
    ):
        return False
    if alive:
        terminate_worker_pid(worker.get("pid"))
    worker["status"] = "superseded"
    worker["last_event_at"] = utc_now()
    worker["last_error"] = reason
    finalize_queue_event_record(config, state, worker, "completed", reason)
    write_activity_log(
        config,
        {
            "type": "worker_superseded",
            "provider": worker.get("provider"),
            "task_id": worker.get("task_id"),
            "message": reason,
            "worker_run_id": worker.get("run_id"),
        },
    )
    console_log(
        f"worker superseded{console_reason}: task={worker.get('task_id')} "
        f"provider={worker.get('provider')} run={worker.get('run_id')}",
        quiet=SUPERVISOR_LOG_QUIET,
    )
    return True


def poll_workers(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any] | None = None,
) -> bool:
    changed = False
    approval_state = load_approval_state(config)
    task_map = task_index_from_status(config, load_status(config))
    valid_queue_event_ids = set(state.get("queue", {}).get("events", {}))
    redispatch_statuses = redispatch_candidate_statuses(config)
    active_worker_statuses = set(ACTIVE_RUNTIME_STATUSES)
    pending_by_run: dict[str, list[dict[str, Any]]] = {}
    resolved_by_run: dict[str, list[dict[str, Any]]] = {}
    for item in approval_state.get("pending", []):
        run_id = item.get("worker_run_id")
        if run_id:
            pending_by_run.setdefault(run_id, []).append(item)
    for item in approval_state.get("history", []):
        run_id = item.get("worker_run_id")
        if run_id:
            resolved_by_run.setdefault(run_id, []).append(item)

    stall_after = float(config.get("supervisor", {}).get("stall_after_seconds", 300))
    now = datetime.now(timezone.utc)
    provider_report = provider_report or load_provider_report(config)
    changed = retry_due_workers(config, state, provider_report, now) or changed
    workers = state.setdefault("workers", {})
    worker_cpu_ticks = worker_process_tree_cpu_ticks(
        [int(worker["pid"]) for worker in workers.values() if str(worker.get("pid") or "").isdigit()]
    )
    for worker in state.get("workers", {}).values():
        if not isinstance(worker, dict) or not str(worker.get("pid") or "").isdigit():
            continue
        unit_usage = worker_unit_cpu_usage(worker)
        if unit_usage is not None:
            worker_cpu_ticks[int(worker["pid"])] = unit_usage
    for run_id, worker in list(workers.items()):
        previous_last_event_at = worker.get("last_event_at")
        task = task_map.get(worker.get("task_id"), {})
        # Finished attempts are immutable history. Their result was consumed
        # exactly once when they became terminal, so a later poll must not
        # reinterpret the same result file or refresh any timestamps.
        if is_terminal_worker(worker):
            continue
        if worker.get("queue_event_id") and worker.get("queue_event_id") not in valid_queue_event_ids:
            if worker.get("status") in {"running", "waiting_approval", "retry_backoff", "manual_pending", "stalled"} and not pid_is_alive(worker.get("pid")):
                task_status = str(task_map.get(worker.get("task_id"), {}).get("status") or "").lower()
                workers.pop(run_id, None)
                write_activity_log(
                    config,
                    {
                        "type": "worker_reaped",
                        "provider": worker.get("provider"),
                        "task_id": worker.get("task_id"),
                        "message": (
                            "Dropped orphaned worker after its queue event disappeared; open tasks will be redispatched."
                            if task_status in {"todo", "in_progress", "review", "blocked"}
                            else "Dropped orphaned worker after its queue event disappeared."
                        ),
                        "worker_run_id": worker.get("run_id"),
                    },
                )
                changed = True
                continue
        update_from_log(config, worker)
        alive = pid_is_alive(worker.get("pid"))
        process_activity_advanced, process_activity_persisted = observe_worker_process_activity(
            worker,
            worker_cpu_ticks.get(int(worker["pid"])) if str(worker.get("pid") or "").isdigit() else None,
            now,
        )
        changed = process_activity_persisted or changed
        last_event_advanced = bool(
            previous_last_event_at
            and worker.get("last_event_at")
            and worker.get("last_event_at") > previous_last_event_at
        )
        current_mode = worker_runtime_mode(worker)
        task_status = str(task.get("status") or "").lower()
        expected_completion_statuses = worker_expected_completion_statuses(config, worker, task)
        assignment_moved = (
            worker.get("queue_event_id")
            and current_mode == "execution"
            and not worker_matches_current_assignment(config, worker, task_map)
        )
        priority_escalation = (
            worker.get("queue_event_id")
            and current_mode == "execution"
            and worker.get("status") in active_worker_statuses
            and higher_priority_ready_task_exists(config, worker, task_map, state=state, active_statuses=active_worker_statuses)
        )
        supersede_reason = None
        console_reason = ""
        if assignment_moved and not (not alive and task_status in expected_completion_statuses):
            supersede_reason = "Worker superseded after task responsibility moved to another agent."
        elif priority_escalation:
            supersede_reason = "Worker superseded to prioritize higher-priority review work."
            console_reason = " for priority escalation"
        if supersede_reason:
            if worker.get("status") == "superseded":
                continue
            changed = supersede_worker(
                config,
                state,
                worker,
                alive=alive,
                reason=supersede_reason,
                console_reason=console_reason,
            ) or changed
            continue
        if (
            not alive
            and worker.get("queue_event_id")
            and worker.get("status") in {"fallback", "manual_pending", "retry_backoff", "stalled", "waiting_approval", "suspended_approval"}
            and not worker_matches_current_assignment(config, worker, task_map)
        ):
            workers.pop(run_id, None)
            finalize_queue_event_record(
                config,
                state,
                worker,
                "completed",
                "Dropped stale worker after task ownership/review assignment moved to another agent.",
            )
            write_activity_log(
                config,
                {
                    "type": "worker_reaped",
                    "provider": worker.get("provider"),
                    "task_id": worker.get("task_id"),
                    "message": "Dropped stale worker after task responsibility moved to another agent.",
                    "worker_run_id": worker.get("run_id"),
                },
            )
            changed = True
            continue
        provider_info = (provider_report or {}).get("providers", {}).get(str(worker.get("provider") or ""), {})
        # Oscillation breaker: if the local CLI worker keeps transient-failing and
        # falling back to file_inbox while the health probe reports the provider
        # "recovered", the reap-drop-then-redispatch below spins forever (burning
        # quota, never completing). Cap the number of times we drop-and-redispatch
        # a given queue event; once capped, keep the file_inbox fallback in place so
        # the task can actually be delivered via the inbox path instead of looping.
        # Key on task_id (stable across redispatches) rather than queue_event_id,
        # which can be regenerated on each redispatch and would defeat the cap.
        _fallback_reap_key = str(worker.get("task_id") or worker.get("queue_event_id") or "")
        _fallback_reap_counts = _FALLBACK_REAP_COUNTS
        _fallback_reap_cap = int(
            (config.get("supervisor", {}) or {}).get("fallback_reap_redispatch_cap", 4)
        )
        _fallback_reap_seen = int(_fallback_reap_counts.get(_fallback_reap_key, 0)) if _fallback_reap_key else 0
        _fallback_reap_eligible = (
            not alive
            and worker.get("queue_event_id")
            and worker.get("status") == "manual_pending"
            and worker.get("mode") == "file_inbox"
            and worker_matches_current_assignment(config, worker, task_map)
            and task_status in redispatch_statuses
            and provider_info.get("auth_ready")
            and provider_info.get("local_cli_worker_supported")
        )
        if _fallback_reap_eligible and _fallback_reap_seen < _fallback_reap_cap:
            if _fallback_reap_key:
                _fallback_reap_counts[_fallback_reap_key] = _fallback_reap_seen + 1
            workers.pop(run_id, None)
            finalize_queue_event_record(
                config,
                state,
                worker,
                "completed",
                "Dropped inbox fallback after provider auth recovered; task will be redispatched automatically.",
            )
            write_activity_log(
                config,
                {
                    "type": "worker_reaped",
                    "provider": worker.get("provider"),
                    "task_id": worker.get("task_id"),
                    "message": "Dropped inbox fallback after provider auth recovered; task will be redispatched automatically.",
                    "worker_run_id": worker.get("run_id"),
                },
            )
            changed = True
            continue
        if _fallback_reap_eligible and _fallback_reap_seen >= _fallback_reap_cap:
            # Capped: stop dropping the fallback. Let the file_inbox delivery stand
            # so the task can complete via the inbox path, and stop the redispatch
            # storm. Log once per worker so the condition is visible.
            if not worker.get("fallback_reap_capped_logged"):
                worker["fallback_reap_capped_logged"] = True
                write_activity_log(
                    config,
                    {
                        "type": "worker_reaped",
                        "provider": worker.get("provider"),
                        "task_id": worker.get("task_id"),
                        "message": (
                            f"Fallback reap/redispatch oscillation capped at {_fallback_reap_cap}; "
                            "keeping file_inbox delivery to break the loop."
                        ),
                        "worker_run_id": worker.get("run_id"),
                    },
                )
            continue
        pending = pending_by_run.get(worker["run_id"], [])
        resolved = resolved_by_run.get(worker["run_id"], [])
        stop_processing, approval_changed = handle_worker_approval_state(
            config,
            state,
            provider_report,
            worker,
            pending=pending,
            resolved=resolved,
            alive=alive,
        )
        changed = approval_changed or changed
        if stop_processing:
            continue

        if alive:
            live_failure_signal = detect_worker_failure_signal(worker)
            if live_failure_signal:
                handled, failure_changed = handle_worker_failure_signal(
                    config,
                    state,
                    provider_report,
                    worker,
                    live_failure_signal,
                    current_mode=current_mode,
                    live=True,
                )
                changed = failure_changed or changed
                if handled:
                    continue
            if worker.get("status") == "stalled" and (last_event_advanced or process_activity_advanced):
                worker["status"] = "running"
                worker["last_event_at"] = worker.get("last_event_at") or utc_now()
                write_activity_log(
                    config,
                    {
                        "type": "worker_recovered",
                        "provider": worker.get("provider"),
                        "task_id": worker.get("task_id"),
                        "message": "Worker produced new output or local process activity after being marked stalled; status restored to running.",
                        "worker_run_id": worker["run_id"],
                    },
                )
                console_log(
                    f"worker recovered: task={worker.get('task_id')} provider={worker.get('provider')} run={worker.get('run_id')}",
                    quiet=SUPERVISOR_LOG_QUIET,
                )
                changed = True
                continue
            last_activity = worker_last_activity_at(worker)
            if last_activity:
                last_dt = datetime.fromisoformat(last_activity.replace("Z", "+00:00"))
                stalled_for_seconds = (now - last_dt).total_seconds()
                if worker.get("status") == "stalled" and stalled_for_seconds >= stall_after * 2:
                    terminate_worker_pid(worker.get("pid"))
                    reason = f"Worker remained stalled for {int(stalled_for_seconds)} seconds and was terminated for redispatch."
                    finalize_terminal_worker_outcome(config, state, worker, reason)
                    console_log(
                        f"worker terminated after extended stall: task={worker.get('task_id')} provider={worker.get('provider')} run={worker.get('run_id')}",
                        quiet=SUPERVISOR_LOG_QUIET,
                    )
                    changed = True
                    continue
                if (now - last_dt).total_seconds() >= stall_after and worker.get("status") != "stalled":
                    worker["status"] = "stalled"
                    write_activity_log(
                        config,
                        {
                            "type": "worker_stalled",
                            "provider": worker.get("provider"),
                            "task_id": worker.get("task_id"),
                            "message": f"Worker appears stalled after {int(stall_after)} seconds.",
                            "worker_run_id": worker["run_id"],
                        },
                    )
                    changed = True
            continue

        failure_signal = detect_worker_failure_signal(worker)
        if failure_signal and worker.get("status") != "failed":
            handled, failure_changed = handle_worker_failure_signal(
                config,
                state,
                provider_report,
                worker,
                failure_signal,
                current_mode=current_mode,
                live=False,
            )
            changed = failure_changed or changed
            if handled:
                continue

        changed = finalize_exited_worker(
            config,
            state,
            worker,
            current_mode=current_mode,
            task_status=task_status,
            expected_completion_statuses=expected_completion_statuses,
            now=now,
        ) or changed
    return changed


def trim_worker_history(state: dict[str, Any], max_entries: int) -> None:
    workers = state.get("workers", {})
    if len(workers) <= max_entries:
        return
    ordered = sorted(workers.items(), key=lambda item: item[1].get("last_event_at") or "")
    state["workers"] = dict(ordered[-max_entries:])


def reconcile_queue_records(config: dict[str, Any], state: dict[str, Any]) -> bool:
    changed = False
    queue_events = state.get("queue", {}).get("events", {})
    if not queue_events:
        return False
    active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    for event_id, record in queue_events.items():
        workers = [worker for worker in state.get("workers", {}).values() if worker.get("queue_event_id") == event_id]
        if not workers:
            continue
        if any(worker.get("status") in active_statuses for worker in workers):
            continue
        latest = sorted(workers, key=lambda item: item.get("last_event_at") or "", reverse=True)[0]
        next_status = "failed" if any(worker.get("status") == "failed" for worker in workers) else "completed"
        if record.get("status") != next_status:
            record["status"] = next_status
            record["processed_at"] = latest.get("last_event_at") or utc_now()
            if next_status == "failed" and latest.get("last_error"):
                record["error"] = latest.get("last_error")
            changed = True
    return changed



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


def worker_in_dispatch_cooldown(
    worker: dict[str, Any],
    cooldown_seconds: int,
    *,
    now: datetime | None = None,
) -> bool:
    """Return True if the worker is within the dispatch cooldown window.

    Cooldown only protects *running* workers — stalled / fallback / etc.
    workers must remain recoverable via the normal supersede paths.

    Returns False when:
      - cooldown_seconds <= 0 (feature disabled)
      - worker.status is not "running"
      - run_id has no parseable timestamp (synthetic fixtures, legacy records)
      - dispatched_at is older than cooldown_seconds
    """
    if cooldown_seconds <= 0:
        return False
    if worker.get("status") != "running":
        return False
    dispatched_at = parse_worker_dispatched_at(worker.get("run_id"))
    if dispatched_at is None:
        return False
    if now is None:
        now = datetime.now(timezone.utc)
    return (now - dispatched_at).total_seconds() < cooldown_seconds


def outstanding_delivery_indexes(config: dict[str, Any], state: dict[str, Any]) -> tuple[set[str], set[tuple[str, str]], set[str]]:
    agents: set[str] = set()
    task_agents: set[tuple[str, str]] = set()
    event_keys: set[str] = set()
    queue_records = state.get("queue", {}).get("events", {})
    active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    active_event_ids = active_worker_queue_event_ids(state, active_statuses)
    for event in load_event_queue(config):
        event_id = str(event.get("event_id") or "")
        if not event_id:
            continue
        if event_id in active_event_ids:
            continue
        record = queue_records.get(event_id, {})
        if record.get("status") in {"completed", "failed"}:
            continue
        event_key = str(event.get("event_key") or "")
        if event_key:
            event_keys.add(event_key)
        agent_id = str(event.get("target_agent") or "")
        task_id = str(event.get("task_id") or "")
        if agent_id:
            agents.add(agent_id)
        if task_id and agent_id:
            task_agents.add((task_id, agent_id))
    return agents, task_agents, event_keys


def outstanding_delivery_agent_counts(config: dict[str, Any], state: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    queue_records = state.get("queue", {}).get("events", {})
    active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    active_event_ids = active_worker_queue_event_ids(state, active_statuses)
    for event in load_event_queue(config):
        event_id = str(event.get("event_id") or "")
        if not event_id:
            continue
        if event_id in active_event_ids:
            continue
        record = queue_records.get(event_id, {})
        if record.get("status") in {"completed", "failed"}:
            continue
        agent_id = str(event.get("target_agent") or "")
        if agent_id:
            counts[agent_id] = counts.get(agent_id, 0) + 1
    return counts


def finalize_queue_event_record(config: dict[str, Any], state: dict[str, Any], worker: dict[str, Any], status: str, error: str | None = None) -> None:
    queue_event_id = worker.get("queue_event_id")
    if not queue_event_id:
        return
    active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    for item in state.get("workers", {}).values():
        if item.get("run_id") == worker.get("run_id"):
            continue
        if item.get("queue_event_id") == queue_event_id and item.get("status") in active_statuses:
            return
    record = queue_status(state, queue_event_id)
    record["status"] = status
    record["processed_at"] = utc_now()
    if error:
        record["error"] = error
    else:
        record.pop("error", None)



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


def prune_event_queue(config: dict[str, Any], state: dict[str, Any]) -> bool:
    task_map = task_index_from_status(config, load_status(config))
    active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    redispatch_statuses = redispatch_candidate_statuses(config)
    queue_events = state.setdefault("queue", {}).setdefault("events", {})
    referenced_event_ids = outstanding_queue_event_references(state)

    def prune_loaded_queue(
        events: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], bool]:
        if not events:
            return events, False
        kept: list[dict[str, Any]] = []
        kept_ids: set[str] = set()
        changed = False

        for event in events:
            event_id = event.get("event_id")
            if not event_id:
                changed = True
                continue

            record = queue_events.get(event_id, {})
            related_workers = [
                worker
                for worker in state.get("workers", {}).values()
                if worker.get("queue_event_id") == event_id
            ]
            has_active_worker = any(
                worker.get("status") in active_statuses
                for worker in related_workers
            )
            # "Still needed" is not the same as "a worker is still running".
            still_needed = has_active_worker or event_id in referenced_event_ids
            skip_message = stale_dispatch_skip_message(config, event, task_map)

            if skip_message and not still_needed:
                completed = queue_status(state, event_id)
                completed["status"] = "completed"
                completed["processed_at"] = completed.get("processed_at") or utc_now()
                completed["skip_reason"] = "stale_dispatch_event"
                changed = True
                continue

            if not related_workers and record.get("status") in {
                "started",
                "manual_pending",
                "retry_backoff",
                "stalled",
            }:
                record["status"] = "queued"
                record.pop("processed_at", None)
                record.pop("error", None)
                changed = True
                kept.append(event)
                kept_ids.add(event_id)
                continue

            current_task = task_map.get(str(event.get("task_id") or ""))
            current_status = (
                str(current_task.get("status") or "").lower()
                if current_task
                else ""
            )

            if (
                record.get("status") == "failed"
                and not still_needed
                and current_status in redispatch_statuses
            ):
                changed = True
                continue

            if (
                record.get("status") in {"completed", "failed"}
                and not still_needed
            ):
                changed = True
                continue

            kept.append(event)
            kept_ids.add(event_id)

        if changed:
            state["queue"]["events"] = {
                event_id: record
                for event_id, record in queue_events.items()
                if event_id in kept_ids
            }
        return kept, changed

    return queue_repository(config).update(prune_loaded_queue)


def task_index_from_status(config: dict[str, Any], status: dict[str, Any]) -> dict[str, dict[str, Any]]:
    schema = config.get("schema", {})
    tasks_path = schema.get("tasks_path", "tasks")
    task_id_field = schema.get("task_id_field", "id")
    return {
        str(task.get(task_id_field)): task
        for task in status.get(tasks_path, [])
        if task.get(task_id_field)
    }


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


def agent_dispatch_loads(
    config: dict[str, Any],
    state: dict[str, Any],
    active_statuses: set[str],
) -> dict[str, list[int]]:
    loads: dict[str, list[int]] = {}

    for worker in state.get("workers", {}).values():
        if worker.get("status") not in active_statuses:
            continue
        reason = str(worker.get("request_snapshot", {}).get("reason") or "")
        priority = dispatch_reason_priority(reason)
        if priority is None:
            continue
        agent_name = display_name_for(config, str(worker.get("agent_id") or ""))
        if not agent_name:
            continue
        loads.setdefault(agent_name, []).append(priority)

    queue_records = state.get("queue", {}).get("events", {})
    active_event_ids = active_worker_queue_event_ids(state, active_statuses)
    for event in load_event_queue(config):
        event_id = str(event.get("event_id") or "")
        if not event_id:
            continue
        if event_id in active_event_ids:
            continue
        record = queue_records.get(event_id, {})
        if record.get("status") in {"completed", "failed"}:
            continue
        reason = str(event.get("reason") or "")
        priority = dispatch_reason_priority(reason)
        if priority is None:
            continue
        agent_name = str(event.get("target_display_name") or display_name_for(config, str(event.get("target_agent") or "")))
        if not agent_name:
            continue
        loads.setdefault(agent_name, []).append(priority)

    return loads


def higher_priority_ready_task_exists(
    config: dict[str, Any],
    worker: dict[str, Any],
    task_map: dict[str, dict[str, Any]],
    *,
    state: dict[str, Any] | None = None,
    active_statuses: set[str] | None = None,
) -> bool:
    current_priority = dispatch_reason_priority(worker.get("request_snapshot", {}).get("reason"))
    if current_priority is None:
        return False

    agent_id = normalize_agent_id(str(worker.get("agent_id") or worker.get("provider") or ""))
    agent_name = display_name_for(config, agent_id)
    current_task_id = str(worker.get("task_id") or "")
    settings = ready_dispatch_settings(config)
    policy = ReadyDispatchPolicy.from_config(config)
    schema = config.get("schema", {})
    owner_field = schema.get("assignee_field", "owner")
    reviewer_field = schema.get("reviewer_field", "reviewer")
    active_task_agents: set[tuple[str, str]] = set()
    pending_task_agents: set[tuple[str, str]] = set()
    if state is not None:
        normalized_active_statuses = active_statuses or {
            str(value) for value in settings.get("active_worker_statuses", [])
        }
        active_agent_counts = active_worker_agent_counts(state, normalized_active_statuses)
        try:
            pending_agent_counts = outstanding_delivery_agent_counts(config, state)
            _pending_agents, pending_task_agents, _pending_event_keys = outstanding_delivery_indexes(config, state)
        except (KeyError, OSError):
            pending_agent_counts = {}
            pending_task_agents = set()
        lane_capacity = max_tasks_per_agent_for_lane(settings, agent_id)
        lane_load = active_agent_counts.get(agent_id, 0) + pending_agent_counts.get(agent_id, 0)
        if lane_load < lane_capacity:
            return False
        _active_agents, active_task_agents = active_worker_indexes(state, normalized_active_statuses)

    for task_id, task in task_map.items():
        if task_id == current_task_id:
            continue
        if (task_id, agent_id) in active_task_agents or (task_id, agent_id) in pending_task_agents:
            continue
        decision = resolve_domain_dispatch_target(task, task_map, policy)
        if decision is None or decision.target_agent != agent_name:
            continue
        candidate_priority = dispatch_reason_priority(decision.reason.value)
        candidate_reason = decision.reason.value
        if candidate_priority is None or candidate_priority >= current_priority:
            continue
        if not task_is_dispatch_eligible_for_agent(task, agent_name):
            continue
        if state is not None and task_waiting_on_chair_reassignment(
            state,
            task,
            reason=candidate_reason,
            target_agent=agent_name,
        ):
            continue
        if candidate_priority < current_priority:
            return True

    return False


def worker_matches_current_assignment(
    config: dict[str, Any],
    worker: dict[str, Any],
    task_map: dict[str, dict[str, Any]],
) -> bool:
    task_id = str(worker.get("task_id") or "")
    task = task_map.get(task_id)
    if not task:
        return False
    agent_name = display_name_for(config, str(worker.get("agent_id") or ""))
    agent_ids = {
        normalize_agent_id(str(worker.get("agent_id") or "")),
        normalize_agent_id(str(worker.get("provider") or "")),
        normalize_agent_id(agent_name),
    }
    agent_ids.discard("")
    decision = resolve_domain_dispatch_target(task, task_map, ReadyDispatchPolicy.from_config(config))
    return decision is not None and normalize_agent_id(decision.target_agent) in agent_ids


# Staleness is only defined for task-bound dispatch events: the check asks
# whether a task's current dispatch decision still matches the one that was
# queued. Coordination events (chair review, and anything else enqueued with
# task_id=None) have no such decision, so they must never be judged here —
# current_dispatch_event_key would return None for every one of them and mark
# them stale forever. Derive the set from the domain enum rather than repeating
# the literals: the hand-maintained set this replaces had already silently lost
# acceptance_ready_dispatch, and when it was dropped entirely every chair review
# event became "stale" and the control plane spun on chair_review_lost_queue_event.
TASK_DISPATCH_REASONS = frozenset(reason.value for reason in DomainDispatchReason)


def stale_dispatch_skip_message(config: dict[str, Any], event: dict[str, Any], task_map: dict[str, dict[str, Any]]) -> str | None:
    reason = str(event.get("reason") or "")
    if reason not in TASK_DISPATCH_REASONS:
        return None

    expected_key = current_dispatch_event_key(config, event, task_map)
    task_id = str(event.get("task_id") or "unknown task")
    if expected_key is None:
        return f"Skipped stale queued wake event for {task_id}: task is no longer eligible for {reason}."

    queued_key = str(event.get("event_key") or "")
    if queued_key and queued_key != expected_key:
        return f"Skipped stale queued wake event for {task_id}: task state changed after the wake-up was queued."

    return None


def ready_dispatch_signature(task: dict[str, Any], reason: str, task_map: dict[str, dict[str, Any]]) -> str:
    return domain_ready_dispatch_signature(task, reason, task_map)


def build_dispatch_event(task: dict[str, Any], target_agent: str, reason: str, task_map: dict[str, dict[str, Any]]) -> dict[str, Any]:
    decision = DomainDispatchDecision(
        task_id=str(task.get("id") or ""),
        target_agent=target_agent,
        reason=DomainDispatchReason(reason),
    )
    return build_domain_dispatch_event(task, decision, task_map)


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


def chair_review_output_paths(config: dict[str, Any], agent_name: str) -> tuple[Path, Path]:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slug = normalize_agent_id(agent_name) or "chair"
    review_dir = chair_review_dir(config)
    return review_dir / f"{stamp}-{slug}.md", review_dir / f"{stamp}-{slug}.json"


def dependency_ready_blocked_task_records(
    config: dict[str, Any],
    status: dict[str, Any] | None,
    *,
    limit: int = 8,
) -> list[dict[str, Any]]:
    if not isinstance(status, dict):
        return []
    settings = ready_dispatch_settings(config)
    dependency_done_statuses = {str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])}
    task_map = task_index_from_status(config, status)
    records: list[dict[str, Any]] = []
    for task in status.get("tasks", []) or []:
        if not isinstance(task, dict):
            continue
        task_id = str(task.get("id") or "").strip()
        if not task_id or str(task.get("status") or "").lower() != "blocked":
            continue
        if not dependencies_satisfied(task, task_map, dependency_done_statuses):
            continue
        action, helper_task_id = blocked_task_triage_action(status, task)
        if action == "wait_for_unblock_task":
            continue
        records.append(
            {
                "task_id": task_id,
                "task": task,
                "owner": str(task.get("owner") or "").strip(),
                "reviewer": str(task.get("reviewer") or "").strip(),
                "kind": blocked_task_triage_kind(task),
                "action": action,
                "helper_task_id": helper_task_id,
                "next": brief_reason_text(task.get("next"), max_length=220),
            }
        )
    records.sort(key=lambda item: task_phase_priority(item["task"], task_map, dependency_done_statuses))
    return records[:limit]


def reassignment_followup_task_records(
    config: dict[str, Any],
    payload: dict[str, Any],
    status: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(status, dict):
        return []
    mentioned_task_ids: list[str] = []
    seen_task_ids: set[str] = set()
    for entry in [*(payload.get("blocked_by") or []), *(payload.get("recommended_focus") or [])]:
        if not isinstance(entry, str):
            continue
        for task_id in TASK_ID_MENTION_PATTERN.findall(entry):
            if task_id in seen_task_ids:
                continue
            seen_task_ids.add(task_id)
            mentioned_task_ids.append(task_id)
    if not mentioned_task_ids:
        return []
    ready_blocked = {
        str(item.get("task_id") or "").strip(): item
        for item in dependency_ready_blocked_task_records(config, status)
        if str(item.get("task_id") or "").strip()
    }
    return [
        ready_blocked[task_id]
        for task_id in mentioned_task_ids
        if task_id in ready_blocked and str(ready_blocked[task_id].get("action") or "").strip() in {
            "create_unblock_task",
            "resume_parent_task",
        }
    ]


def synthesize_reassignment_followup_task_actions(
    config: dict[str, Any],
    payload: dict[str, Any],
    status: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    action_index = chair_task_action_index(payload)
    synthesized: list[dict[str, Any]] = []
    for item in reassignment_followup_task_records(config, payload, status):
        task_id = str(item.get("task_id") or "").strip()
        action_name = str(item.get("action") or "").strip()
        if not task_id or not action_name or action_name in action_index.get(task_id, set()):
            continue
        if action_name == "create_unblock_task":
            unblock_kind = str(item.get("kind") or "manual_unblock").strip() or "manual_unblock"
            synthesized.append(
                {
                    "task_id": task_id,
                    "action": "create_unblock_task",
                    "unblock_kind": unblock_kind,
                    "reason": (
                        f"Chairman follow-up from reassignment_triage: {task_id} remains dependency-ready blocked; "
                        f"materialize the {unblock_kind} unblock path now."
                    ),
                }
            )
        elif action_name == "resume_parent_task":
            helper_task_id = str(item.get("helper_task_id") or "").strip()
            synthesized.append(
                {
                    "task_id": task_id,
                    "action": "resume_parent_task",
                    "resume_status": "todo",
                    "reason": (
                        "Chairman follow-up from reassignment_triage: "
                        f"{helper_task_id or 'a completed unblock child'} already resolved the blocker for {task_id}; "
                        "resume the parent."
                    ),
                }
            )
        action_index.setdefault(task_id, set()).add(action_name)
    return synthesized


def _chair_review_summary_lines(
    config: dict[str, Any],
    approval_state: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any] | None = None,
    status: dict[str, Any] | None = None,
) -> tuple[list[str], list[str], list[str], list[str], list[str], list[str]]:
    approval_lines: list[str] = []
    for item in pending_approval_items(approval_state)[:6]:
        tool_input = item.get("tool_input") if isinstance(item.get("tool_input"), dict) else {}
        description = tool_input.get("description") or item.get("suggested_rule") or ""
        description_text = f" description={brief_reason_text(description, max_length=120)}" if description else ""
        approval_lines.append(
            f"- {item.get('approval_id')}: task={item.get('task_id') or '-'} tool={item.get('tool_name') or '-'} risk={item.get('risk_class') or '-'}{description_text}"
        )
    if not approval_lines:
        approval_lines.append("- none")

    failure_lines: list[str] = []
    for item in repeated_failure_records(state, status)[:6]:
        failure_lines.append(
            f"- {item.get('task_id')}: role={item.get('role')} agent={item.get('agent')} count={item.get('count')}/{item.get('threshold')} kind={item.get('last_failure_kind')}"
        )
    if not failure_lines:
        failure_lines.append("- none")

    provider_lines: list[str] = []
    report = provider_report if isinstance(provider_report, dict) else {}
    pauses = provider_pause_registry(state)
    for item in active_provider_pause_records(state)[:8]:
        resume = item.get("resume_at")
        resume_text = f" resume_at={resume}" if resume is not None else ""
        # Name every lane the pause takes out. Only the triggering lane used to
        # be reported, so when one account's 401 stopped both codex and codex2
        # the chair never learned codex was affected and kept routing work to it.
        entry = pauses.get(str(item.get("pause_scope") or ""))
        covered = lanes_covered_by_pause(config, report, entry) if isinstance(entry, dict) else []
        affects_text = f" affects={','.join(covered)}" if covered else ""
        provider_lines.append(
            f"- {item.get('agent_id')}: kind={item.get('kind')} paused_at={item.get('paused_at') or '-'}{resume_text}{affects_text} reason={brief_reason_text(item.get('reason'), max_length=180)}"
        )
    if not provider_lines:
        provider_lines.append("- none")

    dispatchable_provider_lines: list[str] = []
    for agent_id, agent in (config.get("agents", {}) or {}).items():
        display_name = task_agent_display_name(config, status, agent_id)
        normalized = normalize_agent_id(agent_id)
        if not display_name or display_name_is_legacy_alias(display_name):
            continue
        # Ask the dispatcher's own question. Anything else here is a second
        # opinion the chair cannot act on: this list is what it picks lanes from.
        if is_agent_dispatch_paused(config, state, normalized, provider_report=report):
            continue
        provider_info = provider_info_for_agent(config, report, normalized)
        adapter_info = (report.get("agent_adapters", {}) or {}).get(normalized, {})
        if provider_info.get("auth_ready") is False:
            continue
        if not agent_supports_auto_delivery(config, provider_report, agent_id):
            continue
        details = ["not_paused=true"]
        if provider_info.get("auth_ready") is not None:
            details.append(f"auth_ready={provider_info.get('auth_ready')}")
        supported = provider_info.get("local_cli_worker_supported")
        if supported is None:
            supported = adapter_info.get("can_auto_deliver")
        if supported is not None:
            details.append(f"auto_dispatch={supported}")
        model = provider_info.get("selected_model")
        if model:
            details.append(f"model={model}")
        dispatchable_provider_lines.append(f"- {normalized} ({display_name}): " + " ".join(details))
    if not dispatchable_provider_lines:
        dispatchable_provider_lines.append("- none")

    dispatch_pause_lines: list[str] = []
    for item in actionable_dispatch_pause_records(state, status):
        blocked_until = item.get("blocked_until") or "-"
        dispatch_pause_lines.append(
            f"- task={item.get('task_id')} provider={item.get('provider') or '-'} kind={item.get('failure_kind') or '-'} paused_at={item.get('paused_at') or '-'} blocked_until={blocked_until} summary={brief_reason_text(item.get('summary'), max_length=180)}"
        )
    if not dispatch_pause_lines:
        dispatch_pause_lines.append("- none")

    blocked_task_lines: list[str] = []
    for item in dependency_ready_blocked_task_records(config, status):
        action_label = str(item.get("action") or "-")
        helper_label = str(item.get("helper_task_id") or "-")
        blocked_task_lines.append(
            f"- {item.get('task_id')}: kind={item.get('kind')} action={action_label} helper={helper_label} owner={item.get('owner') or '-'} reviewer={item.get('reviewer') or '-'} next={item.get('next') or '-'}"
        )
    if not blocked_task_lines:
        blocked_task_lines.append("- none")

    return approval_lines, failure_lines, provider_lines, dispatchable_provider_lines, dispatch_pause_lines, blocked_task_lines


def build_chair_review_message(
    config: dict[str, Any],
    *,
    reason: str,
    markdown_path: Path,
    json_path: Path,
    approval_state: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any] | None = None,
    status: dict[str, Any] | None = None,
) -> str:
    (
        approval_lines,
        failure_lines,
        provider_lines,
        dispatchable_provider_lines,
        dispatch_pause_lines,
        blocked_task_lines,
    ) = _chair_review_summary_lines(
        config,
        approval_state,
        state,
        provider_report=provider_report,
        status=status,
    )
    machine_truth_lines: list[str] = []
    for label, key in (
        ("ai-status", "status_file"),
        ("runtime state", "state_file"),
        ("approval queue", "approval_queue"),
    ):
        try:
            path = config_path(config, key)
        except KeyError:
            continue
        if key == "state_file":
            # Point the chair at the bounded chair-scoped digest, not the full
            # state.json — the latter exceeds the 256 KB worker Read cap under
            # concurrent dispatch (fat per-worker request_snapshot/command/metadata
            # + seen_event_keys). See runtime_state.build_state_digest /
            # feedback_ai_status_handoff_bloat.
            path = path.parent / "state-digest.json"
            machine_truth_lines.append(
                f"- {label} (chair-scoped digest of state.json; tasks live in ai-status): `{path.resolve()}`"
            )
            continue
        machine_truth_lines.append(f"- {label}: `{path.resolve()}`")
    if not machine_truth_lines:
        machine_truth_lines.append("- configured machine-truth paths are unavailable in this test/config context")
    return (
        "你是本輪 chairman，角色是 operational reviewer，不是主線實作者。\n\n"
        "請閱讀 canonical machine truth；若本次 cwd 是 isolated worktree，不要讀 worktree 內的 stale state copy。\n"
        + "\n".join(machine_truth_lines)
        + "\n\n然後只做 operational 決策，不要改主線產品實作。\n\n"
        f"Chair review reason: `{reason}`\n\n"
        "你必須輸出兩個檔案：\n"
        f"- Markdown report: `{markdown_path.resolve()}`\n"
        f"- JSON decision: `{json_path.resolve()}`\n\n"
        "可直接參考 repo 內範本：\n"
        f"- Markdown template: `{CHAIRMAN_REPORT_TEMPLATE_PATH.resolve()}`\n"
        f"- JSON template: `{CHAIRMAN_JSON_TEMPLATE_PATH.resolve()}`\n\n"
        "JSON 必須完整符合以下 schema：\n"
        "{\n"
        '  "version": 1,\n'
        '  "decision": "operational_review",\n'
        '  "approval_ttl_minutes": 45,\n'
        '  "reason": "why",\n'
        '  "blocked_by": [],\n'
        '  "approval_actions": [],\n'
        '  "reassignment_actions": [\n'
        '    {"task_id": "TASK-ID", "role": "owner", "from": "OldAgent", "to": "NewAgent", "reason": "why"}\n'
        "  ],\n"
        '  "task_actions": [\n'
        '    {"task_id": "TASK-ID", "action": "dispatch_now", "reason": "why now"},\n'
        '    {"task_id": "BLOCKED-TASK-ID", "action": "create_unblock_task", "unblock_kind": "history_repair", "target_agent": "Codex", "reviewer": "Codex2", "reason": "why this repair route"},\n'
        '    {"task_id": "BLOCKED-PARENT-ID", "action": "resume_parent_task", "resume_status": "todo", "reason": "existing unblock child is done; owner can resume execution"}\n'
        "  ],\n"
        '  "provider_actions": [\n'
        '    {"agent": "AgentName", "action": "pause", "kind": "auth", "reason": "why"}\n'
        '  ],\n'
        '  "recommended_focus": []\n'
        "}\n\n"
        "硬規則：\n"
        "- `approval_ttl_minutes` 必須是整數。\n"
        "- reassignment_actions 必須使用 `role` 與 `reason`；不要用 `field` / `rationale`。\n"
        "- reviewer 改派只允許 `todo` / `in_progress` / `review` 狀態，用來維持 owner/reviewer 分離或處理 review 交接。\n"
        "- owner 改派只允許 `backlog` / `todo` / `in_progress`；改派會重開成 `todo` 重新派工。\n"
        "- `task_actions` 目前只允許 `dispatch_now` / `create_unblock_task` / `resume_parent_task`；不能繞過 dependency gate 或 commit gate。\n"
        "- `dispatch_now` 只能對 machine truth 已符合派工條件的非 blocked 任務觸發。\n"
        "- `create_unblock_task` 只能用在下方 Dependency-ready blocked tasks；它會建立 task-scoped unblock child task，不會直接把 parent 從 blocked 改成 todo/done。\n"
        "- `resume_parent_task` 只能用在已經有 completed unblock child 的 blocked parent；它會把 parent 轉回可派工狀態，讓 owner 繼續主線執行。\n"
        "- blocked task 若是 branch/commit/worktree/push 污染，`unblock_kind=history_repair`；若是 product/contract/canonical 決策缺口，`unblock_kind=planning_decision`；其他才用 `manual_unblock`。\n"
        "- 若 Chair review reason 是 `reassignment_triage`，且 `blocked_by` / `recommended_focus` 已明確指出某個 dependency-ready blocked task 的 unblock route，請直接輸出對應 `task_actions` (`create_unblock_task` 或 `resume_parent_task`)，不要只留在 `recommended_focus`。\n"
        "- 若 Chair review reason 是 `blocked_task_triage`，不可只評論；每個 listed blocked task 都要依摘要建議採取 `create_unblock_task` 或 `resume_parent_task`，讓 machine truth 真正往前走。\n"
        "- `provider_actions` 目前只允許 `pause` / `clear_pause`，只針對 exact lane 生效；暫停原因必須具體；不要重複 pause 已在 Provider lane pauses 列出的 lane，除非你要改變其狀態。\n"
        "- 若 Chair review reason 是 `approval_triage`，Pending approvals 不可只評論；每一個 pending approval 都必須在 `approval_actions` 中明確 `allow` 或 `deny`，並寫具體 reason。\n"
        "- `approval_actions` 必須使用 `decision` 欄位，不要用 `action`；格式是 `{\"approval_id\":\"...\",\"decision\":\"allow|deny\",\"reason\":\"...\"}`。\n"
        "- `approval_triage` 只處理 approval；不要輸出 `provider_actions`。Provider 狀態放在 recommended_focus，等 `provider_health_triage` 再改 lane。\n"
        "- `recommended_focus` 只保留監看、待外部條件、或目前無法由 machine truth 直接執行的事項；已經能執行的 follow-up 一律寫進 action arrays。\n"
        "- `Agent`/subagent approval 只有在 prompt 明確是 read-only explore/review、無修改/無祕密/無破壞性操作時才可 allow；否則 deny，不要留空。\n"
        "- approval allow 只能放行 read-only、focused test、scoped validation，或 branch/upstream 清楚的普通 non-force `git push`。\n"
        "- `git push --force`、`--mirror`、`--delete`、`--all`、`--tags` 這類 broad push 一律不要 allow。\n"
        "- lane/provider id 必須精確判讀：`Claude`/`Claude2`、`Gemini`/`Gemini2`、`Codex`/`Codex2` 是不同帳號/額度 lane；不要因為 `claude` paused 就推論 `claude2` 也 paused，除非 machine truth 明確列出該 exact lane。\n"
        "- 若 provider/lane 顯示 auth、quota、capacity 或 repeated terminal degraded，不要把新工作派回該 lane；請優先用 reassignment_actions 把可改派的 owner/reviewer work 移到健康 lane。\n"
        "- 若任務 owner/reviewer 指到 `legacy alias`，那不是可執行 lane；請用 reassignment_actions 改到真實健康 lane。\n"
        "- 若資訊不足，保守輸出 blocked_by / recommended_focus，不要猜。\n\n"
        "Pending approvals:\n"
        + "\n".join(approval_lines)
        + "\n\nRepeated failure loops:\n"
        + "\n".join(failure_lines)
        + "\n\nProvider lane pauses / degraded lanes:\n"
        + "\n".join(provider_lines)
        + "\n\nDispatch-capable lanes (not paused; may still be busy):\n"
        + "\n".join(dispatchable_provider_lines)
        + "\n\nDispatch pauses requiring chair attention:\n"
        + "\n".join(dispatch_pause_lines)
        + "\n\nDependency-ready blocked tasks requiring chair repair:\n"
        + "\n".join(blocked_task_lines)
        + "\n"
    )


def chair_review_reason(
    state: dict[str, Any],
    approval_state: dict[str, Any],
    status: dict[str, Any] | None = None,
    config: dict[str, Any] | None = None,
) -> str | None:
    if pending_approval_items(approval_state):
        return "approval_triage"
    if repeated_failure_records(state, status):
        return "reassignment_triage"
    if config is not None and dependency_ready_blocked_task_records(config, status, limit=1):
        return "blocked_task_triage"
    if active_provider_pause_records(state) or actionable_dispatch_pause_records(state, status, limit=1):
        return "provider_health_triage"
    return "operational_review"


def choose_chair_reviewer(
    config: dict[str, Any],
    state: dict[str, Any],
    status: dict[str, Any],
    provider_report: dict[str, Any],
    *,
    allow_primary_work_fallback: bool = False,
) -> tuple[str, str] | None:
    settings = ready_dispatch_settings(config)
    active_statuses = {str(value) for value in settings.get("active_worker_statuses", [])}
    active_agents, _active_task_agents = active_worker_indexes(state, active_statuses)
    pending_agents, _pending_task_agents, _pending_event_keys = outstanding_delivery_indexes(config, state)
    active_agent_counts = active_worker_agent_counts(state, active_statuses)
    pending_agent_counts = outstanding_delivery_agent_counts(config, state)
    task_map = task_index_from_status(config, status)
    failing_agents = failing_agents_in_reassignment_loops(state, status)
    candidates: list[tuple[str, str]] = []
    primary_work_candidates: list[tuple[str, str]] = []
    active_recovery_candidates: list[tuple[str, str]] = []
    for agent_id, agent in (config.get("agents", {}) or {}).items():
        configured_display_name = str(agent.get("display_name") or agent.get("name") or agent_id).strip()
        display_name = task_agent_display_name(config, status, agent_id)
        if not display_name or display_name_is_legacy_alias(display_name) or display_name_is_legacy_alias(configured_display_name):
            continue
        normalized = normalize_agent_id(agent_id)
        if normalized in pending_agents:
            continue
        if normalized in active_agents:
            if not allow_primary_work_fallback:
                continue
            if is_agent_dispatch_paused(config, state, agent_id, provider_report=provider_report):
                continue
            if not agent_supports_auto_delivery(config, provider_report, agent_id):
                continue
            if display_name in failing_agents:
                continue
            lane_capacity = max_tasks_per_agent_for_lane(settings, normalized)
            lane_load = active_agent_counts.get(normalized, 0) + pending_agent_counts.get(normalized, 0)
            if lane_load < lane_capacity:
                active_recovery_candidates.append((normalized, display_name))
            continue
        if is_agent_dispatch_paused(config, state, agent_id, provider_report=provider_report):
            continue
        if not agent_supports_auto_delivery(config, provider_report, agent_id):
            continue
        if display_name in failing_agents:
            continue
        if agent_has_dispatchable_primary_work(config, status, display_name, task_map):
            if allow_primary_work_fallback:
                primary_work_candidates.append((normalized, display_name))
            continue
        candidates.append((normalized, display_name))
    if not candidates and allow_primary_work_fallback:
        candidates = primary_work_candidates or active_recovery_candidates
    if not candidates:
        return None
    rotation_index = int(state.setdefault("chair_review", {}).get("rotation_index", 0) or 0)
    rotation_index %= len(candidates)
    ordered = candidates[rotation_index:] + candidates[:rotation_index]
    chosen = ordered[0]
    state.setdefault("chair_review", {})["rotation_index"] = (rotation_index + 1) % len(candidates)
    return chosen


def queue_chair_review(
    config: dict[str, Any],
    state: dict[str, Any],
    status: dict[str, Any],
    provider_report: dict[str, Any],
) -> bool:
    settings = chair_review_settings(config)
    if not settings.get("enabled", True):
        return False
    chair_state = state.setdefault("chair_review", {})
    if chair_state.get("active_review"):
        return False
    approval_state = safe_load_approval_state(config)
    ready_blocked_tasks = dependency_ready_blocked_task_records(config, status, limit=1)
    reason = chair_review_reason(state, approval_state, status=status, config=config)
    if reason is None:
        return False
    needs_immediate_attention = chair_review_needs_immediate_attention(state, status, approval_state)
    immediate_attention = bool(needs_immediate_attention or ready_blocked_tasks)
    # A dependency-ready blocked task stays listed until the parent is actually
    # unblocked, which the chair's own repair action cannot do on its own. It
    # therefore raises urgency for reviewer-lane selection but must not bypass
    # the cooldown, or every tick re-queues the same blocked_task_triage.
    # One gate. Urgency is already defined as "information the chair has not
    # looked at yet", so a failing chair stops manufacturing its own bypass and
    # the ordinary cooldown governs retries without a parallel backoff field.
    bypass_cooldown = needs_immediate_attention
    now = datetime.now(timezone.utc)
    cooldown_until = parse_runtime_timestamp(chair_state.get("cooldown_until"))
    if not bypass_cooldown and cooldown_until is not None and cooldown_until > now:
        return False
    chosen = choose_chair_reviewer(
        config,
        state,
        status,
        provider_report,
        allow_primary_work_fallback=immediate_attention,
    )
    if chosen is None:
        blocked = chair_state.setdefault("blocked", {})
        signature = f"{reason}:{utc_now()[:13]}"
        if blocked.get("signature") == signature:
            return False
        blocked.update(
            {
                "reason": reason,
                "blocked_at": utc_now(),
                "signature": signature,
                "message": "No dispatch-capable chairman lane was available for immediate operational review.",
            }
        )
        write_activity_log(
            config,
            {
                "type": "chair_review_blocked",
                "message": "Chairman review could not be queued because no dispatch-capable lane was available.",
                "reason": reason,
            },
        )
        return True
    agent_id, display_name = chosen
    chair_state.pop("blocked", None)
    markdown_path, json_path = chair_review_output_paths(config, display_name)
    context_files = [config_path(config, "status_file"), config_path(config, "state_file"), config_path(config, "approval_queue")]
    if AI_GUIDE_PATH.exists():
        context_files.insert(0, AI_GUIDE_PATH)
    if CHAIRMAN_SKILL_PATH.exists():
        context_files.append(CHAIRMAN_SKILL_PATH)
    for item in pending_approval_items(approval_state):
        brief = ensure_task_brief(config, task_id=str(item.get("task_id") or ""), runtime_state=state)
        if brief is not None:
            context_files.append(brief)
    for item in repeated_failure_records(state, status):
        brief = ensure_task_brief(config, task_id=str(item.get("task_id") or ""), runtime_state=state)
        if brief is not None:
            context_files.append(brief)
    message = build_chair_review_message(
        config,
        reason=reason,
        markdown_path=markdown_path,
        json_path=json_path,
        approval_state=approval_state,
        state=state,
        provider_report=provider_report,
        status=status,
    )
    queue_payload = {
        "event_id": new_runtime_id("evt"),
        "created_at": utc_now(),
        "event_key": f"chair:{reason}:{display_name}:{json_path.name}",
        "task_id": None,
        "target_agent": agent_id,
        "target_display_name": display_name,
        "provider": agent_config_for(config, agent_id).get("provider", agent_id),
        "reason": f"chair_review:{reason}",
        "message": message,
        "context_files": [str(path.resolve()) for path in context_files if path.exists()],
        "target_files": [str(markdown_path.resolve()), str(json_path.resolve())],
        "metadata": {
            "mode": "coordination",
            "workspace_key": f"chair-{reason}",
            "chair_review": {
                "reason": reason,
                "markdown_path": str(markdown_path.resolve()),
                "json_path": str(json_path.resolve()),
            },
        },
    }
    enqueue_event(config, queue_payload)
    record = queue_event_record(state, queue_payload["event_id"])
    record["status"] = "queued"
    record["attempt_count"] = 0
    record["mode"] = "coordination"
    # An attempt is a look, whatever its outcome: this is the watermark that
    # keeps already-seen pauses and approvals from re-triggering forever.
    chair_state["last_attempt_at"] = utc_now()
    chair_state["active_review"] = {
        "agent_id": agent_id,
        "agent": display_name,
        "reason": reason,
        "requested_at": utc_now(),
        "queue_event_id": queue_payload["event_id"],
        "markdown_path": str(markdown_path),
        "json_path": str(json_path),
        "target_files": list(queue_payload["target_files"]),
    }
    write_activity_log(
        config,
        {
            "type": "chair_review_queued",
            "target_agent": display_name,
            "message": f"Queued chairman review for {reason}.",
            "queue_event_id": queue_payload["event_id"],
        },
    )
    return True


def normalize_chair_review_payload_defaults(config: dict[str, Any], payload: Any) -> Any:
    return normalize_domain_review_defaults(payload, chair_review_settings(config))


def normalize_chair_review_payload_for_reason(
    payload: Any,
    *,
    reason: str | None,
    config: dict[str, Any] | None = None,
    status: dict[str, Any] | None = None,
) -> Any:
    if not isinstance(payload, dict):
        return payload
    normalized = dict(payload)
    if reason == "approval_triage" and normalized.get("provider_actions"):
        # Approval triage must not mutate provider state, but a noisy chairman
        # response should not block safe approval decisions from being applied.
        normalized["provider_actions"] = []
    if reason == "reassignment_triage" and config is not None:
        task_actions = normalized.get("task_actions")
        if not isinstance(task_actions, list):
            task_actions = []
        synthesized = synthesize_reassignment_followup_task_actions(config, normalized, status)
        if synthesized:
            normalized["task_actions"] = [*task_actions, *synthesized]
    return normalized


def validate_chair_review_context(
    payload: dict[str, Any],
    *,
    reason: str | None,
    approval_state: dict[str, Any],
    config: dict[str, Any] | None = None,
    status: dict[str, Any] | None = None,
) -> str | None:
    if reason == "approval_triage":
        if payload.get("provider_actions"):
            return "approval_triage must not emit provider_actions"
        pending_ids = [
            str(item.get("approval_id") or "").strip()
            for item in pending_approval_items(approval_state)
            if str(item.get("approval_id") or "").strip()
        ]
        if pending_ids:
            action_ids = {
                str(action.get("approval_id") or "").strip()
                for action in payload.get("approval_actions", []) or []
                if isinstance(action, dict)
                and action.get("decision") in {"allow", "deny"}
                and str(action.get("approval_id") or "").strip()
            }
            missing = [approval_id for approval_id in pending_ids if approval_id not in action_ids]
            if missing:
                return f"approval_triage must resolve pending approvals: {', '.join(missing[:6])}"
    if reason == "blocked_task_triage" and config is not None:
        ready_blocked = dependency_ready_blocked_task_records(config, status)
        if ready_blocked:
            action_index = chair_task_action_index(payload)
            missing: list[str] = []
            for item in ready_blocked:
                task_id = str(item.get("task_id") or "").strip()
                expected_action = str(item.get("action") or "").strip()
                if not task_id or not expected_action:
                    continue
                if expected_action not in action_index.get(task_id, set()):
                    missing.append(f"{task_id}:{expected_action}")
            if missing:
                return "blocked_task_triage must resolve blocked tasks via " + ", ".join(missing[:6])
    if reason == "reassignment_triage" and config is not None:
        followup_records = reassignment_followup_task_records(config, payload, status)
        if followup_records:
            action_index = chair_task_action_index(payload)
            missing: list[str] = []
            for item in followup_records:
                task_id = str(item.get("task_id") or "").strip()
                expected_action = str(item.get("action") or "").strip()
                if not task_id or not expected_action:
                    continue
                if expected_action not in action_index.get(task_id, set()):
                    missing.append(f"{task_id}:{expected_action}")
            if missing:
                return "reassignment_triage must materialize follow-up task actions via " + ", ".join(missing[:6])
    return None


def _approval_is_routine_safe(approval: dict[str, Any]) -> bool:
    risk_class = str(approval.get("risk_class") or "")
    if risk_class in {"safe_read", "settings_allowed"}:
        return True
    tool_name = str(approval.get("tool_name") or "")
    tool_input = approval.get("tool_input") if isinstance(approval.get("tool_input"), dict) else {}
    if tool_name == "Agent":
        text = " ".join(
            str(tool_input.get(key) or "")
            for key in ("description", "prompt", "subagent_type")
        ).lower()
        safety_qualified_text = text
        for phrase in ("do not edit", "don't edit", "without editing", "no edits"):
            safety_qualified_text = safety_qualified_text.replace(phrase, "")
        read_only_terms = (
            "read",
            "review",
            "inspect",
            "explore",
            "analyze",
            "analyse",
            "report",
            "look for",
        )
        unsafe_terms = (
            "edit",
            "modify",
            "write",
            "delete",
            "remove",
            "commit",
            "push",
            "secret",
            "token",
            "credential",
            "password",
            "apply_patch",
            "run command",
            "execute",
        )
        return (
            bool(text)
            and any(term in text for term in read_only_terms)
            and not any(term in safety_qualified_text for term in unsafe_terms)
        )
    if tool_name != "Bash":
        return False
    command = str(tool_input.get("command") or tool_input.get("cmd") or "").strip()
    if not command:
        return False
    tokens = shlex.split(command)
    if not tokens:
        return False
    normalized = " ".join(tokens)
    if tokens[:2] == ["git", "push"]:
        disallowed = {"--force", "-f", "--force-with-lease", "--mirror", "--delete", "--all", "--tags", "--prune"}
        if any(token in disallowed for token in tokens[2:]):
            return False
        positionals = [token for token in tokens[2:] if not token.startswith("-")]
        return len(positionals) >= 2
    # The chairman is the escalation path for commands the classifier cannot
    # judge. Asking the classifier again — "would this have run unreviewed?" —
    # sends the escalation back to what escalated it, so every gap in the
    # pattern set became a permanent deadlock rather than a review. Bound the
    # chairman by what no reviewer may permit instead.
    try:
        from permission_broker import command_hard_boundary_reason
    except Exception:  # noqa: BLE001 - fall back to the conservative answer
        return False
    return command_hard_boundary_reason(command) is None


def apply_chair_approval_actions(config: dict[str, Any], payload: dict[str, Any]) -> bool:
    changed = False
    approval_state = safe_load_approval_state(config)
    pending_by_id = {
        str(item.get("approval_id") or ""): item
        for item in pending_approval_items(approval_state)
        if str(item.get("approval_id") or "")
    }
    for action in payload.get("approval_actions", []) or []:
        if not isinstance(action, dict):
            continue
        approval_id = str(action.get("approval_id") or "").strip()
        decision = str(action.get("decision") or "").strip()
        if not approval_id or decision not in {"allow", "deny"}:
            continue
        approval = pending_by_id.get(approval_id)
        if approval is None:
            continue
        note = str(action.get("reason") or payload.get("reason") or "").strip() or None
        remember = bool(action.get("remember", False))
        resolved_decision = decision
        if decision == "allow" and not _approval_is_routine_safe(approval):
            resolved_decision = "deny"
            note = note or "Denied by supervisor policy: approval exceeded chairman routine-allow scope."
        try:
            resolve_approval(
                config,
                approval_id,
                decision=resolved_decision,
                note=note,
                remember=remember if resolved_decision == "allow" else False,
            )
            changed = True
        except KeyError:
            continue
    return changed


def apply_chair_reassignment_action(
    config: dict[str, Any],
    state: dict[str, Any],
    action: dict[str, Any],
    provider_report: dict[str, Any],
) -> bool:
    task_id = str(action.get("task_id") or "").strip()
    role = str(action.get("role") or "").strip()
    from_agent = str(action.get("from") or "").strip()
    to_agent = str(action.get("to") or "").strip()
    reason = str(action.get("reason") or "").strip()
    if not task_id or role not in {"owner", "reviewer"} or not from_agent or not to_agent or not reason:
        return False
    if to_agent not in known_agent_display_names(config):
        return False
    if is_agent_dispatch_paused(config, state, to_agent, provider_report=provider_report):
        return False
    status = load_status(config)
    task = next((item for item in status.get("tasks", []) or [] if str(item.get("id") or "") == task_id), None)
    if task is None or not task_is_dispatch_eligible_for_agent(task, to_agent):
        return False
    current_owner = str(task.get("owner") or "").strip()
    current_reviewer = str(task.get("reviewer") or "").strip()
    if role == "owner" and to_agent == current_reviewer:
        return False
    if role == "reviewer" and to_agent == current_owner:
        return False
    if role == "reviewer":
        if str(task.get("status") or "").lower() not in {"todo", "in_progress", "review"}:
            return False
        if str(task.get("reviewer") or "") != from_agent:
            return False
    else:
        if str(task.get("status") or "").lower() not in {"backlog", "todo", "in_progress"}:
            return False
        if str(task.get("owner") or "") != from_agent:
            return False
    message = brief_reason_text(
        f"Chairman reassigned {role} from {from_agent} to {to_agent}: {reason}",
        max_length=280,
    )
    result = run_task_board_command(
        config,
        "reassign",
        [
            task_id,
            to_agent if role == "owner" else current_owner,
            to_agent if role == "reviewer" else current_reviewer,
            message,
        ],
        environ={
            "AI_NAME": "Supervisor",
            "TASK_EXPECTED_OWNER": current_owner,
            "TASK_EXPECTED_REVIEWER": current_reviewer,
            "TASK_REASSIGN_REOPEN": "1" if role == "owner" else "0",
            "TASK_HANDOFF_FROM": from_agent,
            "TASK_HANDOFF_TO": to_agent,
        },
    )
    if not result.ok:
        write_activity_log(
            config,
            {
                "type": "chair_reassignment_failed",
                "task_id": task_id,
                "message": result.error,
            },
        )
        return False
    clear_failure_streak(state, task_id, role)
    remember_chair_reassignment_guard(
        config,
        state,
        task_id=task_id,
        role=role,
        from_agent=from_agent,
        to_agent=to_agent,
    )
    write_activity_log(
        config,
        {
            "type": "chair_reassignment_applied",
            "task_id": task_id,
            "message": message,
            "role": role,
            "from_agent": from_agent,
            "to_agent": to_agent,
        },
    )
    return True


def apply_chair_reassignment_actions(
    config: dict[str, Any],
    state: dict[str, Any],
    payload: dict[str, Any],
    provider_report: dict[str, Any],
) -> bool:
    changed = False
    actions = [
        action
        for action in payload.get("reassignment_actions", []) or []
        if isinstance(action, dict)
    ]
    actions.sort(
        key=lambda action: 0
        if action.get("role") == "reviewer"
        else 1
    )
    for action in actions:
        changed = apply_chair_reassignment_action(config, state, action, provider_report) or changed
    return changed


def chair_dispatch_action_reason(
    config: dict[str, Any],
    task: dict[str, Any],
    task_map: dict[str, dict[str, Any]],
) -> tuple[str, str] | None:
    decision = resolve_domain_dispatch_target(task, task_map, ReadyDispatchPolicy.from_config(config))
    if decision is None:
        return None
    return decision.target_agent, decision.reason.value


def chair_unblock_task_id(parent_task_id: str, unblock_kind: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", unblock_kind).strip("-").upper() or "MANUAL"
    return f"{parent_task_id}-UNBLOCK-{slug}"


def completed_unblock_task_for_parent(
    status: dict[str, Any],
    parent_task_id: str,
    unblock_kind: str,
) -> dict[str, Any] | None:
    completed: list[dict[str, Any]] = []
    for task in status.get("tasks", []) or []:
        if not isinstance(task, dict):
            continue
        if str(task.get("helper_parent") or "") != parent_task_id:
            continue
        if str(task.get("task_class") or "").lower() != "unblock":
            continue
        if str(task.get("helper_kind") or "") != unblock_kind:
            continue
        if str(task.get("status") or "").lower() != "done":
            continue
        completed.append(task)
    if not completed:
        return None
    completed.sort(key=lambda item: str(item.get("last_update") or ""))
    return completed[-1]


def open_unblock_task_for_parent(status: dict[str, Any], parent_task_id: str, unblock_kind: str) -> dict[str, Any] | None:
    for task in status.get("tasks", []) or []:
        if not isinstance(task, dict):
            continue
        if str(task.get("helper_parent") or "") != parent_task_id:
            continue
        if str(task.get("task_class") or "").lower() != "unblock":
            continue
        if str(task.get("helper_kind") or "") != unblock_kind:
            continue
        if str(task.get("status") or "").lower() == "done":
            continue
        return task
    return None


def blocked_task_triage_action(
    status: dict[str, Any],
    task: dict[str, Any],
) -> tuple[str, str | None]:
    task_id = str(task.get("id") or "").strip()
    if not task_id:
        return "create_unblock_task", None
    unblock_kind = blocked_task_triage_kind(task)
    completed_helper = completed_unblock_task_for_parent(status, task_id, unblock_kind)
    if completed_helper is not None:
        return "resume_parent_task", str(completed_helper.get("id") or "").strip() or None
    open_helper = open_unblock_task_for_parent(status, task_id, unblock_kind)
    if open_helper is not None:
        return "wait_for_unblock_task", str(open_helper.get("id") or "").strip() or None
    return "create_unblock_task", None


def chair_unblock_agent(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
    preferred: list[str],
    *,
    exclude: set[str],
) -> str | None:
    known = known_agent_display_names(config)
    seen: set[str] = set()
    all_agents = [
        str(agent.get("display_name") or agent.get("name") or agent_id).strip()
        for agent_id, agent in (config.get("agents", {}) or {}).items()
    ]
    for candidate in preferred + all_agents:
        display_name = display_name_for(config, str(candidate or ""))
        if not display_name or display_name in seen or display_name not in known:
            continue
        seen.add(display_name)
        if display_name in exclude or display_name_is_legacy_alias(display_name):
            continue
        if is_agent_dispatch_paused(config, state, display_name, provider_report=provider_report):
            continue
        return display_name
    return None


def unblock_task_acceptance(unblock_kind: str) -> list[str]:
    if unblock_kind == "history_repair":
        return [
            "Identify the exact branch/worktree/commit contamination that keeps the parent blocked",
            "Repair or document a non-destructive repair path without force-pushing shared history",
            "Produce task-scoped commit/push/PR evidence for any canonical change",
            "Update the parent task with the concrete unblocked next step",
        ]
    if unblock_kind == "planning_decision":
        return [
            "Resolve or route the missing product/contract decision through canonical planning artifacts",
            "Record the decision, scope cut, or explicit follow-up needed by the parent task",
            "Produce task-scoped commit/push/PR evidence for any canonical change",
            "Update the parent task with the concrete unblocked next step",
        ]
    return [
        "Diagnose why the dependency-ready parent remains blocked",
        "Make only the task-scoped change needed to unblock or document the remaining blocker",
        "Produce task-scoped commit/push/PR evidence for any canonical change",
        "Update the parent task with the concrete unblocked next step",
    ]


def chair_requested_workspace_baseline_repair(payload: dict[str, Any]) -> bool:
    text_parts = [
        str(payload.get("reason") or ""),
        *[str(item or "") for item in (payload.get("blocked_by") or [])],
        *[str(item or "") for item in (payload.get("recommended_focus") or [])],
    ]
    text = "\n".join(text_parts).lower()
    return any(marker in text for marker in WORKSPACE_BASELINE_MARKERS)


def create_chair_workspace_baseline_task(
    config: dict[str, Any],
    state: dict[str, Any],
    payload: dict[str, Any],
    provider_report: dict[str, Any],
    *,
    preferred_owner: str | None = None,
) -> bool:
    if not chair_requested_workspace_baseline_repair(payload):
        return False

    status = load_status(config)
    if workspace_baseline_repair_task(status) is not None:
        return False

    failure_records = repeated_failure_records(state)
    covered_task_ids = sorted(
        {
            str(record.get("task_id") or "").strip()
            for record in failure_records
            if str(record.get("task_id") or "").strip()
        }
    )
    if not covered_task_ids:
        return False

    owner = chair_unblock_agent(
        config,
        state,
        provider_report,
        [preferred_owner or "", "Claude", "Codex", "Claude2", "Codex2", "Gemini2", "Gemini", "Copilot"],
        exclude=set(),
    )
    if owner is None:
        return False
    reviewer = chair_unblock_agent(
        config,
        state,
        provider_report,
        ["Codex", "Claude", "Claude2", "Codex2", "Gemini2", "Gemini", "Copilot"],
        exclude={owner},
    )
    if reviewer is None:
        return False

    metadata = {
        "task_class": "execution",
        "helper_kind": WORKSPACE_BASELINE_HELPER_KIND,
        "auto_generated": True,
        "mutates_canonical": True,
        "auto_created_by": "chairman-reassignment-triage",
        "covers_task_ids": covered_task_ids,
    }
    result = run_task_board_command(
        config,
        "assign",
        [WORKSPACE_BASELINE_TASK_ID, owner, reviewer],
        environ={
            "AI_NAME": preferred_owner or owner,
            "TASK_PHASE": "UI Completion Baseline Repair",
            "TASK_TITLE": "Repair shared UI workspace baseline for isolated worktrees",
            "TASK_SUMMARY_ZH": (
                "修復共用 UI workspace baseline，處理 @drts/ui-tokens / @drts/contracts 模組解析、"
                "packages/ui-web 既有 strict TS 錯誤，以及 isolated worktree 的 tsc/next/.next types 工具鏈缺口。"
            ),
            "TASK_ARTIFACTS": ",".join(
                [
                    "packages/ui-web/",
                    "packages/ui-tokens/",
                    "packages/contracts/",
                    "apps/platform-admin-web/",
                    "apps/tenant-console-web/",
                ]
            ),
            "TASK_ACCEPTANCE": ",".join(
                [
                    "Fix @drts/ui-tokens and @drts/contracts module resolution for isolated worktrees",
                    "Clear the pre existing packages/ui-web strict TypeScript failures blocking shared UI apps",
                    "Restore isolated worktree toolchain readiness for pnpm exec tsc next and generated types",
                    "Verify one representative platform admin and one tenant console build path no longer fail on the old baseline error",
                ]
            ),
            "TASK_METADATA_JSON": json.dumps(metadata, ensure_ascii=False),
        },
    )
    if not result.ok:
        write_activity_log(
            config,
            {
                "type": "chair_workspace_baseline_task_create_failed",
                "task_id": WORKSPACE_BASELINE_TASK_ID,
                "message": result.error,
            },
        )
        return False

    status = load_status(config)
    task_map = task_index_from_status(config, status)
    task = task_map.get(WORKSPACE_BASELINE_TASK_ID)
    if task is not None:
        state.setdefault("watcher", {}).setdefault("task_snapshots", {})[
            WORKSPACE_BASELINE_TASK_ID
        ] = snapshot_task(task, config.get("schema", {}))
        dispatch_plan = chair_dispatch_action_reason(config, task, task_map)
        if dispatch_plan is not None:
            target_agent, dispatch_reason = dispatch_plan
            active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
            active_agent_counts = active_worker_agent_counts(state, active_statuses)
            pending_agent_counts = outstanding_delivery_agent_counts(config, state)
            lane_id = normalize_agent_id(target_agent)
            lane_capacity = max_tasks_per_agent_for_lane(ready_dispatch_settings(config), lane_id)
            lane_load = active_agent_counts.get(lane_id, 0) + pending_agent_counts.get(lane_id, 0)
            if lane_load < lane_capacity and not is_agent_dispatch_paused(config, state, target_agent, provider_report=provider_report):
                _pending_agents, _pending_task_agents, pending_event_keys = outstanding_delivery_indexes(config, state)
                event = build_dispatch_event(task, target_agent, dispatch_reason, task_map)
                if event["key"] not in pending_event_keys and queue_delivery_event(config, event):
                    state.setdefault("seen_event_keys", {})[event["key"]] = utc_now()

    write_activity_log(
        config,
        {
            "type": "chair_workspace_baseline_task_created",
            "task_id": WORKSPACE_BASELINE_TASK_ID,
            "owner": owner,
            "reviewer": reviewer,
            "message": (
                f"Chairman materialized {WORKSPACE_BASELINE_TASK_ID} and assigned it to {owner} "
                f"with reviewer {reviewer} after converged reassignment triage."
            ),
        },
    )
    return True


def materialize_workspace_baseline_task_from_last_decision(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
) -> bool:
    chair_state = state.get("chair_review")
    if not isinstance(chair_state, dict):
        return False
    if str(chair_state.get("last_reason") or "") != "reassignment_triage":
        return False
    payload = chair_state.get("last_decision")
    if not isinstance(payload, dict):
        return False
    preferred_owner = str(chair_state.get("last_reviewer") or "").strip() or None
    return create_chair_workspace_baseline_task(
        config,
        state,
        payload,
        provider_report,
        preferred_owner=preferred_owner,
    )


def ensure_workspace_baseline_task_dispatch(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
) -> bool:
    status = load_status(config)
    task_map = task_index_from_status(config, status)
    task = task_map.get(WORKSPACE_BASELINE_TASK_ID)
    if task is None or not _task_is_open(task):
        return False
    dispatch_plan = chair_dispatch_action_reason(config, task, task_map)
    if dispatch_plan is None:
        return False
    target_agent, dispatch_reason = dispatch_plan
    if is_agent_dispatch_paused(config, state, target_agent, provider_report=provider_report):
        return False
    active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    active_agent_counts = active_worker_agent_counts(state, active_statuses)
    pending_agent_counts = outstanding_delivery_agent_counts(config, state)
    lane_id = normalize_agent_id(target_agent)
    lane_capacity = max_tasks_per_agent_for_lane(ready_dispatch_settings(config), lane_id)
    lane_load = active_agent_counts.get(lane_id, 0) + pending_agent_counts.get(lane_id, 0)
    if lane_load >= lane_capacity:
        return False
    _pending_agents, _pending_task_agents, pending_event_keys = outstanding_delivery_indexes(config, state)
    event = build_dispatch_event(task, target_agent, dispatch_reason, task_map)
    if event["key"] in pending_event_keys:
        return False
    if not queue_delivery_event(config, event):
        return False
    state.setdefault("seen_event_keys", {})[event["key"]] = utc_now()
    write_activity_log(
        config,
        {
            "type": "workspace_baseline_dispatch_queued",
            "task_id": WORKSPACE_BASELINE_TASK_ID,
            "target_agent": target_agent,
            "message": (
                f"Queued dispatch for {WORKSPACE_BASELINE_TASK_ID} to {target_agent} "
                f"after chairman materialized the shared baseline repair."
            ),
        },
    )
    return True


def escalate_governance_recursion_for_human(
    config: dict[str, Any],
    state: dict[str, Any] | None,
    parent: dict[str, Any],
    chair_reason: str,
) -> None:
    """Record that a blocked governance artifact needs human attention instead of
    auto-generating a deeper repair task.

    The supervisor used to dig the auto-repair lineage deeper (X-UNBLOCK-UNBLOCK).
    Now we stop, log, and surface the parent on a bounded escalation list so a human
    (or the dashboard) can clear it. We never generate more auto-work here."""
    parent_id = str(parent.get("id") or "").strip()
    write_activity_log(
        config,
        {
            "type": "governance_recursion_blocked",
            "task_id": parent_id,
            "message": (
                f"Refused to auto-generate an unblock task for governance artifact {parent_id} "
                f"(task_class={parent.get('task_class')!r}, helper_parent={parent.get('helper_parent')!r}); "
                f"needs human triage. Chair reason: {chair_reason}"
            ),
        },
    )
    if state is None or not parent_id:
        return
    registry = state.setdefault("governance_escalations", {})
    if not isinstance(registry, dict):
        registry = {}
        state["governance_escalations"] = registry
    registry[parent_id] = {
        "task_id": parent_id,
        "task_class": str(parent.get("task_class") or ""),
        "helper_parent": str(parent.get("helper_parent") or ""),
        "reason": brief_reason_text(chair_reason, max_length=280),
        "flagged_at": utc_now(),
    }
    # Keep the registry bounded — newest 50 escalations.
    if len(registry) > 50:
        for stale_key in sorted(
            registry,
            key=lambda key: str(registry.get(key, {}).get("flagged_at") or ""),
        )[: len(registry) - 50]:
            registry.pop(stale_key, None)


def create_chair_unblock_task(
    config: dict[str, Any],
    state: dict[str, Any],
    action: dict[str, Any],
    provider_report: dict[str, Any],
) -> bool:
    parent_id = str(action.get("task_id") or "").strip()
    chair_reason = str(action.get("reason") or "").strip()
    if not parent_id or not chair_reason:
        return False

    status = load_status(config)
    task_map = task_index_from_status(config, status)
    parent = task_map.get(parent_id)
    if parent is None or str(parent.get("status") or "").lower() != "blocked":
        return False
    # Recursion base case: a blocked unblock/repair task or auto-generated helper
    # must NOT spawn another governance
    # child. Without this, a blocked `X-UNBLOCK` triages into `X-UNBLOCK-UNBLOCK`
    # and the pipeline self-reproduces. Escalate to a human instead of digging the
    # auto-repair lineage deeper.
    max_depth = int(chair_review_settings(config).get("max_unblock_lineage_depth", 1))
    if is_governance_artifact(parent) or governance_lineage_depth(parent, task_map) >= max_depth:
        escalate_governance_recursion_for_human(config, state, parent, chair_reason)
        return False
    dependency_done_statuses = {
        str(value).lower() for value in ready_dispatch_settings(config).get("dependency_done_statuses", ["done"])
    }
    if not dependencies_satisfied(parent, task_map, dependency_done_statuses):
        return False

    requested_kind = str(action.get("unblock_kind") or "").strip()
    unblock_kind = requested_kind if requested_kind else blocked_task_triage_kind(parent)
    if unblock_kind not in {"history_repair", "planning_decision", "manual_unblock"}:
        unblock_kind = blocked_task_triage_kind(parent)
    unblock_id = chair_unblock_task_id(parent_id, unblock_kind)
    if open_unblock_task_for_parent(status, parent_id, unblock_kind) is not None or task_map.get(unblock_id) is not None:
        return False

    requested_owner = str(action.get("target_agent") or "").strip()
    requested_reviewer = str(action.get("reviewer") or "").strip()
    parent_owner = str(parent.get("owner") or "").strip()
    parent_reviewer = str(parent.get("reviewer") or "").strip()
    owner = chair_unblock_agent(
        config,
        state,
        provider_report,
        [requested_owner, parent_owner, "Codex", "Codex2", "Claude2", "Claude", "Gemini2", "Gemini", "Copilot"],
        exclude=set(),
    )
    if owner is None:
        return False
    reviewer = chair_unblock_agent(
        config,
        state,
        provider_report,
        [requested_reviewer, parent_reviewer, "Codex2", "Codex", "Claude2", "Claude", "Gemini2", "Gemini", "Copilot"],
        exclude={owner},
    )
    if reviewer is None:
        return False

    title_by_kind = {
        "history_repair": f"Repair unblock path for {parent_id} branch/commit history",
        "planning_decision": f"Resolve planning blocker for {parent_id}",
        "manual_unblock": f"Unblock {parent_id}",
    }
    summary_by_kind = {
        "history_repair": (
            f"Chairman generated unblock task for {parent_id}: repair branch/worktree/commit contamination "
            "without force-pushing shared history."
        ),
        "planning_decision": (
            f"Chairman generated unblock task for {parent_id}: resolve or route the missing product/contract decision."
        ),
        "manual_unblock": f"Chairman generated unblock task for {parent_id}: diagnose and clear the remaining blocker.",
    }
    metadata = {
        "task_class": "unblock",
        "auto_generated": True,
        "helper_parent": parent_id,
        "helper_kind": unblock_kind,
        "mutates_canonical": True,
        "auto_created_by": "chairman-blocked-task-triage",
    }
    result = run_task_board_command(
        config,
        "assign",
        [unblock_id, owner, reviewer],
        environ={
            "AI_NAME": "Codex",
            "TASK_PHASE": str(parent.get("phase") or "Blocked Task Unblock"),
            "TASK_TITLE": title_by_kind[unblock_kind],
            "TASK_SUMMARY_ZH": summary_by_kind[unblock_kind],
            "TASK_DEPENDS_ON": ",".join(str(dep) for dep in (parent.get("depends_on") or [])),
            "TASK_ARTIFACTS": f"support/unblock/{parent_id}/{unblock_id}.md",
            "TASK_ACCEPTANCE": ",".join(unblock_task_acceptance(unblock_kind)),
            "TASK_METADATA_JSON": json.dumps(metadata, ensure_ascii=False),
        },
    )
    if not result.ok:
        write_activity_log(
            config,
            {
                "type": "chair_unblock_task_create_failed",
                "task_id": parent_id,
                "unblock_task_id": unblock_id,
                "message": result.error,
            },
        )
        return False

    status = load_status(config)
    task_map = task_index_from_status(config, status)
    unblock_task = task_map.get(unblock_id)
    if unblock_task is not None:
        state.setdefault("watcher", {}).setdefault("task_snapshots", {})[
            unblock_id
        ] = snapshot_task(unblock_task, config.get("schema", {}))
        dispatch_plan = chair_dispatch_action_reason(config, unblock_task, task_map)
        if dispatch_plan is not None:
            target_agent, dispatch_reason = dispatch_plan
            active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
            active_agent_counts = active_worker_agent_counts(state, active_statuses)
            pending_agent_counts = outstanding_delivery_agent_counts(config, state)
            lane_id = normalize_agent_id(target_agent)
            lane_capacity = max_tasks_per_agent_for_lane(ready_dispatch_settings(config), lane_id)
            lane_load = active_agent_counts.get(lane_id, 0) + pending_agent_counts.get(lane_id, 0)
            if lane_load < lane_capacity and not is_agent_dispatch_paused(config, state, target_agent, provider_report=provider_report):
                _pending_agents, _pending_task_agents, pending_event_keys = outstanding_delivery_indexes(config, state)
                event = build_dispatch_event(unblock_task, target_agent, dispatch_reason, task_map)
                if event["key"] not in pending_event_keys and queue_delivery_event(config, event):
                    state.setdefault("seen_event_keys", {})[event["key"]] = utc_now()

    write_activity_log(
        config,
        {
            "type": "chair_unblock_task_created",
            "task_id": parent_id,
            "unblock_task_id": unblock_id,
            "unblock_kind": unblock_kind,
            "owner": owner,
            "reviewer": reviewer,
            "message": f"Chairman created {unblock_id} for blocked parent {parent_id}: {chair_reason}",
        },
    )
    return True


def apply_chair_parent_resume_action(
    config: dict[str, Any],
    state: dict[str, Any],
    action: dict[str, Any],
) -> bool:
    task_id = str(action.get("task_id") or "").strip()
    chair_reason = str(action.get("reason") or "").strip()
    if not task_id or not chair_reason:
        return False

    status = load_status(config)
    task_map = task_index_from_status(config, status)
    parent = task_map.get(task_id)
    if parent is None or str(parent.get("status") or "").lower() != "blocked":
        return False

    dependency_done_statuses = {
        str(value).lower() for value in ready_dispatch_settings(config).get("dependency_done_statuses", ["done"])
    }
    if not dependencies_satisfied(parent, task_map, dependency_done_statuses):
        return False

    unblock_kind = blocked_task_triage_kind(parent)
    completed_helper = completed_unblock_task_for_parent(status, task_id, unblock_kind)
    if completed_helper is None:
        return False

    resume_status = str(action.get("resume_status") or "todo").strip().lower() or "todo"
    if resume_status not in {"backlog", "todo", "in_progress"}:
        return False

    helper_id = str(completed_helper.get("id") or "").strip()
    message = brief_reason_text(
        f"Chairman resumed after {helper_id}: {chair_reason}", max_length=280
    )
    result = run_task_board_command(
        config,
        "resume-blocked",
        [task_id, resume_status, message],
        environ={
            "AI_NAME": "Supervisor",
            "TASK_RESUME_HELPER_ID": helper_id,
        },
    )
    if not result.ok:
        write_activity_log(
            config,
            {
                "type": "chair_parent_resume_failed",
                "task_id": task_id,
                "helper_task_id": helper_id,
                "message": result.error,
            },
        )
        return False

    write_activity_log(
        config,
        {
            "type": "chair_parent_resume_applied",
            "task_id": task_id,
            "helper_task_id": helper_id,
            "resume_status": resume_status,
            "message": message,
        },
    )
    return True


def apply_chair_task_action(
    config: dict[str, Any],
    state: dict[str, Any],
    action: dict[str, Any],
    provider_report: dict[str, Any],
) -> bool:
    task_id = str(action.get("task_id") or "").strip()
    action_name = str(action.get("action") or "").strip()
    chair_reason = str(action.get("reason") or "").strip()
    requested_target = str(action.get("target_agent") or "").strip()
    if action_name == "resume_parent_task":
        return apply_chair_parent_resume_action(config, state, action)
    if action_name == "create_unblock_task":
        return create_chair_unblock_task(config, state, action, provider_report)
    if not task_id or action_name != "dispatch_now" or not chair_reason:
        return False

    status = load_status(config)
    task_map = task_index_from_status(config, status)
    task = task_map.get(task_id)
    if task is None:
        return False

    dispatch_plan = chair_dispatch_action_reason(config, task, task_map)
    if dispatch_plan is None:
        return False
    target_agent, dispatch_reason = dispatch_plan
    if requested_target and requested_target != target_agent:
        return False
    role = task_role_for_dispatch_reason(dispatch_reason)
    streak_key = failure_streak_key(task_id, role) if role else ""
    streak_record = failure_streak_registry(state).get(streak_key) if streak_key else None
    if task_waiting_on_chair_reassignment(state, task, reason=dispatch_reason, target_agent=target_agent):
        if not isinstance(streak_record, dict):
            return False
        # The chair has explicitly approved this dispatch action. Clear the
        # task-scoped guard that exists only to wait for that chair decision.
        streak_record["awaiting_chair"] = False
        streak_record["chair_cleared_at"] = utc_now()
        streak_record["chair_clear_reason"] = chair_reason

    agent_id = normalize_agent_id(target_agent)
    if agent_id not in (config.get("agents", {}) or {}):
        return False
    if is_agent_dispatch_paused(config, state, agent_id, provider_report=provider_report):
        return False

    _active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    _active_agents, active_task_agents = active_worker_indexes(state, _active_statuses)
    _pending_agents, pending_task_agents, pending_event_keys = outstanding_delivery_indexes(config, state)
    if (task_id, agent_id) in active_task_agents or (task_id, agent_id) in pending_task_agents:
        return False
    if not task_is_dispatch_eligible_for_agent(task, target_agent):
        return False

    event = build_dispatch_event(task, target_agent, dispatch_reason, task_map)
    if event["key"] in pending_event_keys:
        return False
    if not queue_delivery_event(config, event):
        return False

    state.setdefault("seen_event_keys", {})[event["key"]] = utc_now()
    write_activity_log(
        config,
        {
            "type": "chair_task_action_applied",
            "task_id": task_id,
            "action": action_name,
            "dispatch_reason": dispatch_reason,
            "target_agent": target_agent,
            "message": f"Chairman triggered {dispatch_reason} for {task_id}: {chair_reason}",
        },
    )
    return True


def apply_chair_task_actions(
    config: dict[str, Any],
    state: dict[str, Any],
    payload: dict[str, Any],
    provider_report: dict[str, Any],
) -> bool:
    changed = False
    for action in payload.get("task_actions", []) or []:
        changed = apply_chair_task_action(config, state, action, provider_report) or changed
    return changed


def apply_chair_provider_action(
    config: dict[str, Any],
    state: dict[str, Any],
    action: dict[str, Any],
) -> bool:
    agent = str(action.get("agent") or "").strip()
    action_name = str(action.get("action") or "").strip()
    if not agent or action_name not in {"pause", "clear_pause"}:
        return False
    agent_id = normalize_agent_id(agent)
    if agent_id not in (config.get("agents", {}) or {}):
        return False
    reason = str(action.get("reason") or "").strip()
    if action_name == "pause":
        kind = str(action.get("kind") or "").strip()
        if kind not in {"auth", "quota", "capacity", "manual"} or not reason:
            return False
        if not chair_provider_pause_reason_is_actionable(kind, reason):
            write_activity_log(
                config,
                {
                    "type": "chair_provider_action_rejected",
                    "action": "pause",
                    "agent": display_name_for(config, agent_id),
                    "provider": agent_id,
                    "kind": kind,
                    "message": f"Rejected non-actionable chair pause reason: {reason}",
                },
            )
            return False
        reset_seconds = action.get("reset_seconds")
        existing = next(
            (
                entry
                for entry in provider_pause_registry(state).values()
                if isinstance(entry, dict) and entry.get("lane_id") == agent_id
            ),
            None,
        )
        if (
            isinstance(existing, dict)
            and reset_seconds is None
            and str(existing.get("kind") or "") == kind
            and str(existing.get("reason") or "") == reason
        ):
            return False
        if (
            isinstance(existing, dict)
            and reset_seconds is None
            and kind in {"quota", "capacity"}
            and str(existing.get("kind") or "") == kind
            and existing.get("resume_at") is not None
        ):
            existing["reason"] = reason
            write_activity_log(
                config,
                {
                    "type": "chair_provider_action_applied",
                    "action": "pause",
                    "agent": display_name_for(config, agent_id),
                    "provider": agent_id,
                    "kind": kind,
                    "message": (
                        f"Chairman updated {display_name_for(config, agent_id)} pause reason "
                        "while preserving existing resume_at."
                    ),
                },
            )
            return True
        pause_provider(state, agent_id, reason, kind=kind, reset_seconds=reset_seconds)
        write_activity_log(
            config,
            {
                "type": "chair_provider_action_applied",
                "action": "pause",
                "agent": display_name_for(config, agent_id),
                "provider": agent_id,
                "kind": kind,
                "message": f"Chairman paused {display_name_for(config, agent_id)}: {reason}",
            },
        )
        return True
    existing = next(
        (
            entry
            for entry in provider_pause_registry(state).values()
            if isinstance(entry, dict) and entry.get("lane_id") == agent_id
        ),
        None,
    )
    if isinstance(existing, dict):
        resume_at = existing.get("resume_at")
        if resume_at is not None and float(resume_at) > datetime.now(timezone.utc).timestamp():
            write_activity_log(
                config,
                {
                    "type": "chair_provider_action_rejected",
                    "action": "clear_pause",
                    "agent": display_name_for(config, agent_id),
                    "provider": agent_id,
                    "kind": existing.get("kind") or "unknown",
                    "message": (
                        f"Rejected premature clear_pause for {display_name_for(config, agent_id)}; "
                        "resume_at has not passed."
                    ),
                },
            )
            return False
        if str(existing.get("kind") or "") == "auth" and not reason:
            return False
    if existing is not None:
        clear_provider_pause(state, agent_id)
        write_activity_log(
            config,
            {
                "type": "chair_provider_action_applied",
                "action": "clear_pause",
                "agent": display_name_for(config, agent_id),
                "provider": agent_id,
                "message": reason or f"Chairman cleared provider pause for {display_name_for(config, agent_id)}.",
            },
        )
        return True
    return False


def apply_chair_provider_actions(
    config: dict[str, Any],
    state: dict[str, Any],
    payload: dict[str, Any],
) -> bool:
    changed = False
    for action in payload.get("provider_actions", []) or []:
        changed = apply_chair_provider_action(config, state, action) or changed
    return changed


def _chair_review_active_worker(
    state: dict[str, Any],
    queue_event_id: str | None,
    active_statuses: set[str],
) -> dict[str, Any] | None:
    if not queue_event_id:
        return None
    for worker in state.get("workers", {}).values():
        if worker.get("queue_event_id") != queue_event_id:
            continue
        if str(worker.get("status") or "") in active_statuses:
            return worker
    return None


def refresh_chair_review_state(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
) -> bool:
    chair_state = state.setdefault("chair_review", {})
    active = chair_state.get("active_review")
    if not isinstance(active, dict):
        return False
    active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    queue_event_id = str(active.get("queue_event_id") or "")
    queue_events = state.get("queue", {}).get("events", {}) or {}
    record = queue_events.get(queue_event_id, {})
    active_worker = _chair_review_active_worker(state, queue_event_id, active_statuses)
    markdown_path = Path(str(active.get("markdown_path") or ""))
    json_path = Path(str(active.get("json_path") or ""))
    now = utc_now()

    current_pending_approvals = pending_approval_items(safe_load_approval_state(config))
    if str(active.get("reason") or "") != "approval_triage" and current_pending_approvals:
        message = "Chair review preempted because pending approvals require immediate approval_triage."
        if active_worker is not None:
            terminate_worker_pid(active_worker.get("pid"))
            active_worker["status"] = "superseded"
            active_worker["last_event_at"] = now
            active_worker["last_error"] = message
            finalize_queue_event_record(config, state, active_worker, "completed", message)
        chair_state["active_review"] = None
        chair_state["cooldown_until"] = None
        write_activity_log(
            config,
            {
                "type": "chair_review_preempted",
                "message": message,
                "target_agent": active.get("agent"),
                "queue_event_id": queue_event_id or None,
                "pending_approval_count": len(current_pending_approvals),
            },
        )
        return True

    def invalidate(reason: str, *, event_type: str = "chair_review_invalid_schema") -> bool:
        settings = chair_review_settings(config)
        streak = int(chair_state.get("failure_streak") or 0) + 1
        chair_state["failure_streak"] = streak
        chair_state["active_review"] = None
        # A failed review still consumed a cadence slot, and the watermark set at
        # dispatch already records that the chair looked. Setting the ordinary
        # cooldown here rather than clearing it is what governs retries: the
        # parallel backoff field this replaces existed only to compensate for an
        # urgency rule that could never be satisfied.
        retry_after = (
            datetime.now(timezone.utc)
            + timedelta(seconds=float(settings.get("cooldown_seconds", 900)))
        ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        chair_state["cooldown_until"] = retry_after
        write_activity_log(
            config,
            {
                "type": event_type,
                "message": reason,
                "target_agent": active.get("agent"),
                "queue_event_id": queue_event_id or None,
                "failure_streak": streak,
                "retry_after": retry_after,
            },
        )
        if streak >= int(settings.get("failure_streak_threshold", 2)):
            # Escalation signal. Nothing consumed the per-failure events, so a
            # chair stuck in a retry loop was indistinguishable from an idle one
            # in every dashboard and probe that watches this control plane.
            write_activity_log(
                config,
                {
                    "type": "chair_review_failure_streak",
                    "message": (
                        f"Chair review has failed {streak} consecutive times ({event_type}); "
                        f"backing off until {retry_after}."
                    ),
                    "target_agent": active.get("agent"),
                    "failure_streak": streak,
                    "retry_after": retry_after,
                },
            )
        return True

    if json_path.exists():
        # The decision packet is model output, so malformed JSON is an ordinary
        # bad review — the same thing `validate_chair_review_payload` already
        # reports — not a reason to take the supervisor down. Letting the
        # decoder escape here killed the process on startup, and because the
        # file is read again on every restart, systemd exhausted its restart
        # budget and the fleet stopped for nine hours.
        try:
            payload = load_json(json_path, default=None)
        except json.JSONDecodeError as exc:
            payload = None
            malformed_reason: str | None = f"decision packet is not valid JSON: {exc}"
        else:
            malformed_reason = None
        payload = normalize_chair_review_payload_defaults(config, payload)
        payload = normalize_chair_review_payload_for_reason(
            payload,
            reason=str(active.get("reason") or ""),
            config=config,
            status=load_status(config),
        )
        error = malformed_reason or validate_chair_review_payload(payload)
        if not error and isinstance(payload, dict):
            error = validate_chair_review_context(
                payload,
                reason=str(active.get("reason") or ""),
                approval_state=safe_load_approval_state(config),
                config=config,
                status=load_status(config),
            )
        missing_outputs = missing_declared_outputs(active.get("target_files") or [markdown_path, json_path])
        if missing_outputs:
            error = error or "declared output missing: " + ", ".join(missing_outputs)
        if error:
            if active_worker is not None:
                try:
                    output_age_seconds = time.time() - json_path.stat().st_mtime
                except OSError:
                    output_age_seconds = 0.0
                if output_age_seconds < float(chair_review_settings(config).get("invalid_output_grace_seconds", 15)):
                    return False
                terminate_worker_pid(active_worker.get("pid"))
                active_worker["status"] = "failed"
                active_worker["last_event_at"] = utc_now()
                active_worker["last_error"] = f"Chair review output invalid: {error}"
                finalize_queue_event_record(config, state, active_worker, "failed", active_worker["last_error"])
                write_activity_log(
                    config,
                    {
                        "type": "chair_review_invalid_worker_terminated",
                        "message": active_worker["last_error"],
                        "target_agent": active.get("agent"),
                        "worker_run_id": active_worker.get("run_id"),
                        "queue_event_id": queue_event_id or None,
                    },
                )
            return invalidate(f"Chair review output invalid for {active.get('agent')}: {error}")
        changed = False
        changed = apply_chair_approval_actions(config, payload) or changed
        changed = apply_chair_provider_actions(config, state, payload) or changed
        changed = apply_chair_reassignment_actions(config, state, payload, provider_report) or changed
        changed = apply_chair_task_actions(config, state, payload, provider_report) or changed
        if str(active.get("reason") or "") == "reassignment_triage":
            changed = create_chair_workspace_baseline_task(
                config,
                state,
                payload,
                provider_report,
                preferred_owner=str(active.get("agent") or "").strip() or None,
            ) or changed
        chair_state["last_review_at"] = now
        chair_state["last_reviewer"] = active.get("agent")
        chair_state["last_reason"] = active.get("reason")
        chair_state["last_decision"] = payload
        chair_state["failure_streak"] = 0
        chair_state["cooldown_until"] = (
            datetime.now(timezone.utc) + timedelta(seconds=float(chair_review_settings(config).get("cooldown_seconds", 900)))
        ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        chair_state["active_review"] = None
        write_activity_log(
            config,
            {
                "type": "chair_review_applied",
                "message": f"Applied chairman review from {active.get('agent')} ({active.get('reason')}).",
                "target_agent": active.get("agent"),
                "queue_event_id": queue_event_id or None,
            },
        )
        return True or changed

    if active_worker is not None:
        return False
    if not queue_event_id or queue_event_id not in queue_events:
        return invalidate(
            f"Chair review from {active.get('agent')} lost its queue event before completion.",
            event_type="chair_review_lost_queue_event",
        )
    if record.get("status") not in {"completed", "failed"}:
        return False
    return invalidate(
        f"Chair review from {active.get('agent')} finished without producing the required JSON report.",
        event_type="chair_review_missing_output",
    )


def dispatch_ready_tasks(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any] | None = None,
) -> bool:
    settings = ready_dispatch_settings(config)
    if not settings.get("enabled", True):
        return False
    if disk_guard_dispatch_blocked(config, state):
        return note_dispatch_blocked_by_disk_guard(config, state, "ready_dispatcher")

    status = load_status(config)
    schema = config.get("schema", {})
    tasks_path = schema.get("tasks_path", "tasks")
    task_id_field = schema.get("task_id_field", "id")
    owner_field = schema.get("assignee_field", "owner")
    reviewer_field = schema.get("reviewer_field", "reviewer")

    tasks = [task for task in status.get(tasks_path, []) if task.get(task_id_field)]
    task_map = {task.get(task_id_field): task for task in tasks}
    domain_policy = ReadyDispatchPolicy.from_config(config)
    active_statuses = set(ACTIVE_RUNTIME_STATUSES)
    max_dispatches_per_tick = max(1, int(settings.get("max_dispatches_per_tick", 4)))
    provider_report = provider_report or load_provider_report(config)

    agent_ids = list(config.get("agents", {}).keys())
    dispatcher_state = state.setdefault("ready_dispatcher", {})
    start_cursor = 0
    if agent_ids:
        try:
            start_cursor = int(dispatcher_state.get("next_agent_cursor", 0)) % len(agent_ids)
        except (TypeError, ValueError):
            start_cursor = 0
    ordered_agent_ids = agent_ids[start_cursor:] + agent_ids[:start_cursor]
    active_agents, active_task_agents = active_worker_indexes(state, active_statuses)
    pending_agents, pending_task_agents, pending_event_keys = outstanding_delivery_indexes(config, state)
    active_agent_counts = active_worker_agent_counts(state, active_statuses)
    pending_agent_counts = outstanding_delivery_agent_counts(config, state)
    active_task_ids = {task_id for task_id, _agent_id in active_task_agents if task_id}
    pending_task_ids = {task_id for task_id, _agent_id in pending_task_agents if task_id}
    agent_loads = agent_dispatch_loads(config, state, active_statuses)
    helper_settings = helper_claim_settings(config)
    seen = state.setdefault("seen_event_keys", {})
    changed = False
    dispatches = 0
    last_dispatched_agent_id: str | None = None

    def record_pending_dispatch(agent_id: str, target_agent: str, task_id: str, reason: str, event_key: str) -> None:
        seen[event_key] = utc_now()
        pending_event_keys.add(event_key)
        pending_agents.add(agent_id)
        pending_task_agents.add((task_id, agent_id))
        pending_task_ids.add(task_id)
        active_task_ids.add(task_id)
        pending_agent_counts[agent_id] = pending_agent_counts.get(agent_id, 0) + 1
        priority = dispatch_reason_priority(reason)
        if priority is not None:
            agent_loads.setdefault(target_agent, []).append(priority)

    # Dispatch in rounds so one busy lane cannot consume the whole tick budget
    # before other eligible lanes get a chance to claim their next review/owner task.
    while dispatches < max_dispatches_per_tick:
        idle_agent_names: list[str] = []
        for agent_id in ordered_agent_ids:
            display_name = display_name_for(config, agent_id)
            lane_capacity = max_tasks_per_agent_for_lane(settings, agent_id)
            lane_load = active_agent_counts.get(agent_id, 0) + pending_agent_counts.get(agent_id, 0)
            if (
                display_name
                and lane_load < lane_capacity
                and not display_name_is_legacy_alias(display_name)
                and not is_agent_dispatch_paused(config, state, agent_id, provider_report=provider_report)
            ):
                idle_agent_names.append(display_name)

        round_progress = False
        for agent_id in ordered_agent_ids:
            if dispatches >= max_dispatches_per_tick:
                break
            lane_capacity = max_tasks_per_agent_for_lane(settings, agent_id)
            lane_load = active_agent_counts.get(agent_id, 0) + pending_agent_counts.get(agent_id, 0)
            if lane_load >= lane_capacity:
                continue
            if is_agent_dispatch_paused(config, state, agent_id, provider_report=provider_report):
                continue

            target_agent = display_name_for(config, agent_id)
            if not target_agent or display_name_is_legacy_alias(target_agent):
                continue
            candidates: list[tuple[int, int, dict[str, Any], str]] = []
            helper_claim_queued = False
            for index, task in enumerate(tasks):
                task_id = str(task.get(task_id_field) or "")
                if not task_id:
                    continue
                if redispatch_is_deferred(state.get("workers", {}), task_id, target_agent):
                    continue
                task_status = str(task.get("status") or "").lower()
                task_owner = task.get(owner_field)
                task_reviewer = task.get(reviewer_field)

                if (task_id, agent_id) in active_task_agents or (task_id, agent_id) in pending_task_agents:
                    continue
                if not task_is_dispatch_eligible_for_agent(task, target_agent):
                    continue

                normalized_task = {
                    **task,
                    "id": task_id,
                    "owner": task_owner,
                    "reviewer": task_reviewer,
                }
                decision = resolve_domain_dispatch_target(
                    normalized_task,
                    task_map,
                    domain_policy,
                )
                if decision is not None and decision.target_agent != target_agent:
                    decision = None
                reason = decision.reason.value if decision is not None else None
                priority = dispatch_reason_priority(reason)

                if reason and task_waiting_on_chair_reassignment(state, task, reason=reason, target_agent=target_agent):
                    continue

                helper_claim_allowed_statuses = {str(v).lower() for v in helper_settings.get("task_statuses", ["backlog", "todo", "in_progress", "review"])}
                helper_claim_plan = None
                if (
                    task_status in helper_claim_allowed_statuses
                    and task_id not in active_task_ids
                    and task_id not in pending_task_ids
                    and not task_waiting_on_chair_reassignment(state, task, reason=reason or "", target_agent=target_agent)
                ):
                    helper_claim_plan = proactive_claim_plan_for_idle_agent(
                        config,
                        task=task,
                        task_map=task_map,
                        idle_agent_name=target_agent,
                        idle_agent_names=idle_agent_names,
                        agent_loads=agent_loads,
                        helper_settings=helper_settings,
                        state=state,
                    )

                if helper_claim_plan:
                    helper_message = (
                        f"Availability-first reassignment: {helper_claim_plan['claim_agent']} claimed "
                        f"{task_id} while {helper_claim_plan['assigned_agent']} was unavailable or occupied."
                    )
                    if persist_task_reassignment(
                        config,
                        task_id=task_id,
                        new_owner=helper_claim_plan["new_owner"],
                        new_reviewer=helper_claim_plan["new_reviewer"],
                        message=helper_message,
                        handoff_to=helper_claim_plan["handoff_to"],
                        handoff_from=helper_claim_plan["handoff_from"],
                    ):
                        task[owner_field] = helper_claim_plan["new_owner"]
                        task[reviewer_field] = helper_claim_plan["new_reviewer"]
                        task["last_update"] = utc_now()
                        task["next"] = helper_message
                        # Anti-flap: record a reassignment guard so this task cannot be
                        # availability-stolen straight back off the lane it was just handed
                        # to. Without this, claude/claude2/codex/codex2 ping-pong the same
                        # task every tick, each cutting a fresh empty `{agent}/{task}` branch
                        # off the same base SHA — the duplicate-branch thrash + stranded work.
                        # The chair reassignment path already records this guard (see
                        # create_chair_unblock flow); the proactive path was the gap. The
                        # planner honours it at proactive_claim_plan_for_idle_agent's
                        # chair_reassignment_guard_active() check.
                        remember_chair_reassignment_guard(
                            config,
                            state,
                            task_id=task_id,
                            role=helper_claim_plan["claim_role"],
                            from_agent=helper_claim_plan["handoff_from"],
                            to_agent=helper_claim_plan["handoff_to"],
                        )
                        claim_reason = helper_claim_plan["reason"]
                        event = build_dispatch_event(task, target_agent, claim_reason, task_map)
                        if event["key"] not in pending_event_keys and queue_delivery_event(config, event):
                            record_pending_dispatch(agent_id, target_agent, task_id, claim_reason, event["key"])
                            changed = True
                            round_progress = True
                            helper_claim_queued = True
                            last_dispatched_agent_id = agent_id
                            dispatches += 1
                            write_activity_log(
                                config,
                                {
                                    "type": "task_proactive_rebalanced",
                                    "task_id": task_id,
                                    "message": helper_message,
                                    "from_owner": task_owner,
                                    "to_owner": helper_claim_plan["new_owner"],
                                    "from_reviewer": task_reviewer,
                                    "to_reviewer": helper_claim_plan["new_reviewer"],
                                    "claim_role": helper_claim_plan["claim_role"],
                                },
                            )
                            console_log(
                                f"availability-first claim: task={task_id} role={helper_claim_plan['claim_role']} to={target_agent}",
                                quiet=SUPERVISOR_LOG_QUIET,
                            )
                            break

                if reason is None or priority is None:
                    continue

                event = build_dispatch_event(task, target_agent, reason, task_map)
                if event["key"] in pending_event_keys:
                    continue
                candidates.append((priority, index, task, reason))

            if helper_claim_queued:
                continue

            candidates.sort(key=lambda item: (item[0], item[1]))
            if not candidates:
                continue
            _priority, _index, task, reason = candidates[0]
            task_id = str(task.get(task_id_field) or "")
            event = build_dispatch_event(task, target_agent, reason, task_map)
            if queue_delivery_event(config, event):
                record_pending_dispatch(agent_id, target_agent, task_id, reason, event["key"])
                changed = True
                round_progress = True
                last_dispatched_agent_id = agent_id
                dispatches += 1

        if not round_progress:
            break

    if agent_ids:
        if last_dispatched_agent_id is not None:
            dispatcher_state["next_agent_cursor"] = (agent_ids.index(last_dispatched_agent_id) + 1) % len(agent_ids)
        else:
            dispatcher_state["next_agent_cursor"] = start_cursor

    return changed


def _has_dispatchable_backlog(status: dict[str, Any]) -> bool:
    dispatchable = {"backlog", "todo", "in_progress", "review"}
    for task in (status.get("tasks") or []):
        if isinstance(task, dict) and str(task.get("status") or "") in dispatchable:
            return True
    return False



def _has_any_dispatchable_lane(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any] | None = None,
) -> bool:
    settings = ready_dispatch_settings(config)
    report = provider_report or load_provider_report(config)
    for agent_id, agent in (config.get("agents", {}) or {}).items():
        configured_display_name = str(agent.get("display_name") or agent.get("name") or agent_id).strip()
        if not configured_display_name or display_name_is_legacy_alias(configured_display_name):
            continue
        normalized = normalize_agent_id(agent_id)
        if is_agent_dispatch_paused(config, state, normalized, provider_report=report):
            continue
        if not agent_supports_auto_delivery(config, report, normalized):
            continue
        if max_tasks_per_agent_for_lane(settings, normalized) <= 0:
            continue
        return True
    return False


def break_full_deadlock(
    config: dict[str, Any],
    state: dict[str, Any],
    status: dict[str, Any],
) -> bool:
    """Last-resort recovery when the orchestrator is fully wedged, with zero active
    workers, an empty queue, dispatchable backlog remains, and either
    - chairman review is blocked for lack of a dispatch-capable lane
    - provider pauses are present while no dispatch-capable lane is available.

    Forces a fresh recovery probe and clears any paused lane the probe now
    reports healthy (auth OR an indefinite quota hold whose underlying probe has
    recovered). If nothing recovers, raises a loud operator-attention
    escalation instead of sitting silently at zero workers. Rate-limited by a
    cooldown so genuinely dead lanes are not thrashed."""
    settings = config.get("supervisor", {})
    if not settings.get("deadlock_breaker_enabled", True):
        return False
    active_statuses = {str(v) for v in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    active_agents, _ = active_worker_indexes(state, active_statuses)
    if active_agents:
        return False
    if state.get("queue", {}).get("events", {}):
        return False

    chair_blocked = bool(state.get("chair_review", {}).get("blocked"))
    if not chair_blocked:
        if not active_provider_pause_records(state):
            return False
        provider_report = load_provider_report(config)
        if _has_any_dispatchable_lane(config, state, provider_report=provider_report):
            return False

    if not _has_dispatchable_backlog(status):
        return False
    rec = state.setdefault("deadlock_recovery", {})
    cooldown = float(settings.get("deadlock_breaker_cooldown_seconds", 1800))
    last_attempt = parse_runtime_timestamp(rec.get("last_attempt_at"))
    now = datetime.now(timezone.utc)
    if last_attempt is not None and (now - last_attempt).total_seconds() < cooldown:
        return False
    rec["last_attempt_at"] = utc_now()
    if chair_blocked:
        console_log(
            "FULL DEADLOCK detected (0 active workers, queue empty, chair review "
            "blocked, backlog pending) - forcing recovery probe",
            quiet=False,
        )
    else:
        console_log(
            "FULL DEADLOCK detected (0 active workers, queue empty, paused lanes present, "
            "no chair review blocked marker, backlog pending) - forcing recovery probe",
            quiet=False,
        )
    fresh_report = _force_recovery_probe(config)
    paused = sorted(
        {
            str(entry.get("lane_id") or key)
            for key, entry in provider_pause_registry(state).items()
            if isinstance(entry, dict)
        }
    )
    recovered = [
        agent_id
        for agent_id in paused
        if any(
            isinstance(entry, dict)
            and str(entry.get("lane_id") or key) == agent_id
            and str(entry.get("kind") or "") == "auth"
            for key, entry in provider_pause_registry(state).items()
        )
        and _lane_probe_healthy(config, fresh_report, agent_id) is True
    ]
    for agent_id in recovered:
        clear_provider_pause(state, agent_id)
    if recovered:
        rec.pop("operator_attention", None)
        console_log(f"deadlock breaker cleared lanes {recovered} via fresh healthy probe", quiet=False)
        write_activity_log(config, {
            "type": "deadlock_recovered",
            "message": f"Full-deadlock recovery cleared paused lanes {recovered} after a healthy probe.",
            "agents": recovered,
        })
        return True
    prior = rec.get("operator_attention") or {}
    rec["operator_attention"] = {
        "since": prior.get("since") or utc_now(),
        "reason": "All lanes paused and none auto-recoverable (probe unhealthy). "
                  "Manual fix needed: re-login auth lanes and/or restore quota.",
        "paused": paused,
    }
    console_log(
        "OPERATOR ATTENTION REQUIRED: full orchestrator deadlock and no lane is "
        f"auto-recoverable. Paused lanes: {paused}",
        quiet=False,
    )
    write_activity_log(config, {
        "type": "operator_attention_required",
        "message": "Full orchestrator deadlock: 0 workers, all lanes paused, none auto-recoverable.",
        "paused": paused,
    })
    return True
def supervisor_tick_ports() -> SupervisorTickPorts:
    optional_automation = OptionalAutomation(
        materialize_workspace_baseline_task=materialize_workspace_baseline_task_from_last_decision,
        ensure_workspace_baseline_dispatch=ensure_workspace_baseline_task_dispatch,
    )
    return SupervisorTickPorts(
        utc_now=utc_now,
        current_pid=os.getpid,
        notify=_sd_notify,
        load_runtime_state=load_runtime_state,
        save_runtime_state=save_runtime_state,
        refresh_control_plane_summary=refresh_control_plane_summary,
        load_status=load_status,
        load_provider_report=load_provider_report,
        safe_load_approval_state=safe_load_approval_state,
        ensure_candidate_lifecycle_migration=ensure_candidate_lifecycle_migration,
        write_supervisor_pid=write_supervisor_pid,
        write_activity_log=write_activity_log,
        console_log=console_log,
        desired_focus_mode=desired_focus_mode_from_status,
        update_mode_metadata=update_supervisor_mode_metadata,
        reap_finished_children=reap_finished_children,
        maintain_disk_guard=maintain_disk_guard,
        expire_provider_pauses=expire_provider_pauses,
        prune_stale_approvals=prune_stale_approvals,
        run_scan=run_scan,
        poll_workers=poll_workers,
        cleanup_inactive_worker_worktrees=cleanup_inactive_worker_worktrees,
        reconcile_queue_records=reconcile_queue_records,
        prune_event_queue=prune_event_queue,
        prune_completed_dispatch_pauses=prune_completed_dispatch_pauses,
        prune_unmatched_provider_pauses=prune_unmatched_provider_pauses,
        prune_failure_streaks=prune_failure_streaks,
        refresh_chair_review_state=refresh_chair_review_state,
        reconcile_optional_automation=optional_automation.reconcile,
        ensure_planning_baton_dispatch=ensure_planning_baton_dispatch,
        queue_chair_review=queue_chair_review,
        break_full_deadlock=break_full_deadlock,
        dispatch_ready_tasks=dispatch_ready_tasks,
        process_queue=process_queue,
        sync_github_bus=sync_github_bus,
        trim_worker_history=trim_worker_history,
        trim_seen_events=trim_seen_events,
        log_runtime_summary=log_runtime_summary,
    )


class SupervisorTickFailureLimit(Exception):
    """Raised when consecutive ticks fail and the loop should stop deliberately."""


def _record_tick_failure(
    config: dict[str, Any], exc: BaseException, *, consecutive: int, limit: int
) -> None:
    """Log a failed tick loudly enough to diagnose without stopping the fleet."""
    detail = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    console_log(
        f"supervisor tick failed ({consecutive}/{limit}): {type(exc).__name__}: {exc}",
        quiet=False,
    )
    console_log(detail.rstrip(), quiet=False)
    try:
        write_activity_log(
            config,
            {
                "type": "supervisor_tick_failed",
                "message": f"{type(exc).__name__}: {exc}",
                "consecutive_failures": consecutive,
                "failure_limit": limit,
                "traceback": detail[-4000:],
            },
        )
    except Exception:  # noqa: BLE001 - logging the failure must not mask it
        pass


def run_once(
    config: dict[str, Any],
    *,
    watch: bool,
    replay: bool = False,
    quiet: bool = False,
    verbose: bool = False,
    once: bool = False,
    manage_pid_file: bool = True,
) -> bool:
    result = SupervisorTickRunner(supervisor_tick_ports()).run(
        config,
        SupervisorTickOptions(
            watch=watch,
            replay=replay,
            quiet=quiet,
            verbose=verbose,
            once=once,
            manage_pid_file=manage_pid_file,
        ),
    )
    return result.changed


def main() -> int:
    global SUPERVISOR_LOG_QUIET
    args = parse_args()
    SUPERVISOR_LOG_QUIET = args.quiet
    config = load_config(args.config)
    manage_pid_file = not args.once
    if manage_pid_file:
        terminate_older_supervisors(config)
        atexit.register(clear_supervisor_pid, config)
        install_supervisor_signal_handlers()
        write_supervisor_pid(config)
    poll_interval = args.poll_interval or float(config.get("supervisor", {}).get("poll_interval_seconds", 2.0))
    console_log(
        f"starting supervisor pid={os.getpid()} poll_interval={poll_interval:.1f}s config={args.config}",
        quiet=args.quiet,
    )
    # A tick touches every subsystem and reads files written by models, workers
    # and other tools. Letting one unexpected exception leave this loop made the
    # fleet's availability equal to the least robust line on that path: a single
    # malformed decision packet stopped dispatch for nine hours, because the file
    # was re-read on each restart until systemd gave up retrying.
    #
    # Contain a failed tick and keep going, but do not spin in the dark: if
    # nothing has succeeded for `tick_failure_limit` ticks in a row, stop on
    # purpose with a reason, which is diagnosable in a way a crash loop is not.
    failure_limit = max(
        1, int(config.get("supervisor", {}).get("tick_failure_limit", 10))
    )
    consecutive_failures = 0

    def guarded_tick(**kwargs: Any) -> None:
        nonlocal consecutive_failures
        try:
            run_once(config, **kwargs)
        except (SupervisorShutdown, KeyboardInterrupt):
            raise
        except Exception as exc:  # noqa: BLE001 - one bad tick must not stop the fleet
            consecutive_failures += 1
            _record_tick_failure(
                config, exc, consecutive=consecutive_failures, limit=failure_limit
            )
            if consecutive_failures >= failure_limit:
                raise SupervisorTickFailureLimit(
                    f"{consecutive_failures} consecutive supervisor ticks failed; "
                    f"last error: {type(exc).__name__}: {exc}"
                ) from exc
        else:
            consecutive_failures = 0

    try:
        guarded_tick(
            watch=not args.no_watch,
            replay=args.replay,
            quiet=args.quiet,
            verbose=args.verbose,
            once=args.once,
            manage_pid_file=manage_pid_file,
        )
        if args.once:
            return 0
        while True:
            time.sleep(poll_interval)
            guarded_tick(
                watch=not args.no_watch,
                replay=False,
                quiet=args.quiet,
                verbose=args.verbose,
                once=False,
                manage_pid_file=True,
            )
    except SupervisorShutdown as exc:
        console_log(f"stopping supervisor after {exc.reason}", quiet=args.quiet)
        mark_supervisor_stopped(config, reason=exc.reason, signum=exc.signum, terminate_workers=True)
        return 128 + exc.signum
    except SupervisorTickFailureLimit as exc:
        console_log(f"stopping supervisor: {exc}", quiet=False)
        try:
            write_activity_log(
                config,
                {"type": "supervisor_tick_failure_limit", "message": str(exc)},
            )
        except Exception:  # noqa: BLE001
            pass
        return 1
    finally:
        if manage_pid_file:
            clear_supervisor_pid(config)


if __name__ == "__main__":
    raise SystemExit(main())
