#!/usr/bin/env python3
from __future__ import annotations

import argparse
import atexit
import fnmatch
import hashlib
import json
import os
import random
import re
import shlex
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from adapters import build_adapter
from approval_queue import prune_stale_approvals, resolve_approval
from adapters.base import DeliveryRequest
from branch_routing import route_task
from common import (
    AI_GUIDE_PATH,
    agent_config_for,
    command_exists,
    config_path,
    display_name_for,
    evidence_path,
    ensure_task_brief,
    load_config,
    load_json,
    load_status,
    new_runtime_id,
    normalize_agent_id,
    relpath,
    runtime_env_overrides,
    selected_shared_files,
    shell_quote,
    snapshot_task,
    spawn_background_process,
    utc_now,
    write_json,
    write_activity_log,
)
from github_bus import sync_github_bus
from provider_permissions import provider_capabilities as build_provider_capabilities, write_provider_capabilities
from runtime_state import (
    clear_dispatch_pause,
    enqueue_event,
    load_approval_state,
    load_event_queue,
    load_runtime_state,
    prune_worker_records,
    queue_event_record,
    save_runtime_state,
    upsert_dispatch_pause,
)
from watch_events import queue_delivery_event, run_scan, trim_seen_events


SESSION_ID_PATTERNS = [
    re.compile(r'"session_id"\s*:\s*"([^"]+)"'),
    re.compile(r'"sessionId"\s*:\s*"([^"]+)"'),
]
URL_PATTERN = re.compile(r"https://github\.com/[^\s)]+")
WORKER_FAILURE_PATTERNS = (
    re.compile(r"^Error when talking to gemini api\b", re.IGNORECASE),
    re.compile(r"^Error authenticating:\s*IneligibleTierError\b", re.IGNORECASE),
    re.compile(r"^reasonCode:\s*['\"]?RESTRICTED_DASHER_USER\b", re.IGNORECASE),
    re.compile(r'"error"\s*:\s*"rate_limit"', re.IGNORECASE),
    re.compile(r'"type"\s*:\s*"rate_limit_event"', re.IGNORECASE),
    re.compile(
        r"^reason:\s*.*\b("
        r"terminalquotaerror|retryablequotaerror|quota_exhausted|resource_exhausted|"
        r"you have exhausted your capacity|no capacity available for model|"
        r"timed out|etimedout|econnreset|unauthorized"
        r")\b",
        re.IGNORECASE,
    ),
    re.compile(r"^status:\s*(401|429)\b", re.IGNORECASE),
    re.compile(r"\[API Error:\s*401\b", re.IGNORECASE),
    re.compile(r"\bAPI Error:\s*401\b", re.IGNORECASE),
    re.compile(r"\bFailed to authenticate\b", re.IGNORECASE),
    re.compile(r"\bauthentication_error\b", re.IGNORECASE),
    re.compile(r"\bInvalid authentication credentials\b", re.IGNORECASE),
    re.compile(r"^(?:reason|code|error|error_code|type):\s*['\"]?(?:token_invalidated|refresh_token_reused)\b", re.IGNORECASE),
    re.compile(r"^(?:Error:\s*)?(?:Your\s+)?authentication token has been invalidated\b", re.IGNORECASE),
    re.compile(r'^Error:\s*Model\s+".+"\s+from --model flag is not available\.', re.IGNORECASE),
    re.compile(r"^402\b.*\byou have no quota\b", re.IGNORECASE),
    re.compile(r"^(?:error:\s*)?\b(?:you have no quota|no quota remaining|payment required)\b", re.IGNORECASE),
    re.compile(r"^(?:you(?:'ve| have)\s+)?hit your limit\b", re.IGNORECASE),
    re.compile(r"^An unexpected critical error occurred", re.IGNORECASE),
    re.compile(r"^fatal:", re.IGNORECASE),
)
JSON_WORKER_FAILURE_PATTERN = re.compile(
    r"quota_exhausted|oauth quota exceeded|free daily quota has been reached|"
    r"you have no quota|no quota remaining|payment required|"
    r"you have exhausted your capacity|exhausted your capacity|resource_exhausted|"
    r"rate limit|rate limited|hit your limit|an unexpected critical error occurred|"
    r"permission denied|invalid api key|auth failed|failed to authenticate|"
    r"authentication_error|invalid authentication credentials|status:\s*401|"
    r"\[api error:\s*401\b|api error:\s*401\b|invalid access token|"
    r"token_invalidated|refresh_token_reused|authentication token has been invalidated|"
    r"ineligibletiererror|not eligible for gemini code assist|restricted_dasher_user",
    re.IGNORECASE,
)

LOCAL_TZ = ZoneInfo("Asia/Taipei")
SUPERVISOR_LOG_QUIET = False
ACTIVE_RUNTIME_STATUSES = {
    "running",
    "started",
    "waiting_approval",
    "suspended_approval",
    "manual_pending",
    "retry_backoff",
    "stalled",
    "fallback",
}
MODE_BUCKETS = ("planning", "execution", "coordination")
EXECUTION_DISPATCH_REASONS = {
    "review_ready_dispatch",
    "owned_finalize_dispatch",
    "owned_in_progress_dispatch",
    "owned_ready_dispatch",
}
CHAIR_REVIEW_OUTPUT_KEYS = {
    "version",
    "decision",
    "sidecar_approved",
    "approval_ttl_minutes",
    "max_sidecars",
    "reason",
    "blocked_by",
    "blocked_sidecar_parents",
    "approval_actions",
    "reassignment_actions",
    "task_actions",
    "provider_actions",
    "recommended_focus",
}
CLOSEOUT_SKILL_PATH = THIS_DIR / "skills" / "task-closeout-finalization.md"
CHAIRMAN_SKILL_PATH = THIS_DIR / "skills" / "chairman-operational-review.md"


class SupervisorShutdown(Exception):
    def __init__(self, signum: int) -> None:
        self.signum = signum
        self.reason = supervisor_shutdown_reason(signum)
        super().__init__(self.reason)


@dataclass(frozen=True)
class WorkerFailureSignal:
    reason: str
    source: str
    provider_pause_authorized: bool


CHAIRMAN_JSON_TEMPLATE_PATH = THIS_DIR / "templates" / "chairman-decision-packet.example.json"
CHAIRMAN_REPORT_TEMPLATE_PATH = THIS_DIR / "templates" / "chairman-review-report-template.md"
PREMATURE_EXIT_REASON = "Worker exited before the task reached a terminal status."


def supervisor_pid_path(config: dict[str, Any]) -> Path:
    return config_path(config, "state_file").parent / "supervisor.pid"


def write_supervisor_pid(config: dict[str, Any]) -> None:
    path = supervisor_pid_path(config)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{os.getpid()}\n", encoding="utf-8")


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
    current_script = str(Path(__file__).resolve())
    current_script_name = str(Path(__file__).name)
    current_script_rel = ".orchestrator/supervisor.py"
    current_repo_root = str(THIS_DIR.parent.resolve())
    if proc_cwd != current_repo_root or not parts:
        return False

    # Only match the actual supervisor process, not a parent wrapper such as
    # `timeout ... python3 .orchestrator/supervisor.py` or a shell/nohup launcher.
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


def parse_runtime_timestamp(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


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


def _candidate_worktree_path(base: Path, agent_id: str, task_id: str) -> Path:
    slug = re.sub(r"[^a-z0-9._-]+", "-", f"{normalize_agent_id(agent_id)}-{task_id.lower()}").strip("-")
    candidate = base / slug
    if not candidate.exists():
        return candidate
    if _current_branch(candidate) == _task_branch(agent_id, task_id):
        return candidate
    for index in range(2, 20):
        suffixed = base / f"{slug}-{index}"
        if not suffixed.exists() or _current_branch(suffixed) == _task_branch(agent_id, task_id):
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

    branch = _task_branch(request.agent_id, request.task_id)
    base_branch = routing.base_branch if routing else "dev"
    base = _worker_worktree_base(config, repo_root)
    existing = _worktree_for_branch(repo_root, branch, exclude=repo_root, within=base)
    if existing is not None:
        return existing, branch, base_branch, "existing_worktree"

    base.mkdir(parents=True, exist_ok=True)
    destination = _candidate_worktree_path(base, request.agent_id, request.task_id)
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
            "- This process inherits `ORCH_STATUS_ROOT` / `AI_STATUS_ROOT`, so `scripts/ai-status.sh` "
            "writes status back to canonical machine truth even from the task worktree.\n"
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
    active_statuses = {"running", "started", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled", "fallback"}
    active_workers = [
        {
            "run_id": run_id,
            "task_id": worker.get("task_id"),
            "agent_id": worker.get("agent_id"),
            "provider": worker.get("provider"),
            "status": worker.get("status"),
        }
        for run_id, worker in workers.items()
        if worker.get("status") in active_statuses
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
        workspace = (THIS_DIR.parent / workspace).resolve()
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


def load_provider_report(config: dict[str, Any]) -> dict[str, Any]:
    try:
        if config.get("supervisor", {}).get("auto_refresh_provider_capabilities", True):
            report = build_provider_capabilities(config)
            write_provider_capabilities(config, report=report)
            return report
        return load_json(config_path(config, "provider_capabilities"), default={}) or {}
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
    if request_reason := str(event.get("reason") or ""):
        if request_reason == "owned_finalize_dispatch" and CLOSEOUT_SKILL_PATH.exists():
            closeout_path = relpath(CLOSEOUT_SKILL_PATH)
            if closeout_path not in context_files:
                context_files.append(closeout_path)
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
    # Branch-strategy routing: stamp the worker record with the integration
    # track it belongs to so the dashboard, promote-nightly workflow, and
    # any downstream PR-creation can see where this work is supposed to land.
    # See docs/ops/branch-strategy.md §4 and orchestrator-integration-guide.md.
    state.setdefault("workers", {})[worker_run_id] = {
        "run_id": worker_run_id,
        "provider": request.provider,
        "agent_id": agent["id"],
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
        "pid": result.pid,
        "notes": result.notes,
        "metadata": result.metadata,
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
        request = build_request(config, event)
        record["attempt_count"] = int(record.get("attempt_count", 0)) + 1
        record["last_attempt_at"] = utc_now()
        ok, outcome, delivery = start_worker_for_request(
            config,
            state,
            provider_report,
            request,
            queue_event_id=event_id,
            attempt_count=record["attempt_count"],
            event_id_for_log=event_id,
        )
        if not ok:
            record["status"] = "failed"
            record["error"] = outcome
            changed = True
            continue

        worker_run_id = outcome or event_id
        record["status"] = "manual_pending" if delivery and delivery.get("manual_confirmation_required") and not delivery.get("auto_delivered") else "started"
        record["run_id"] = worker_run_id
        record["processed_at"] = utc_now()
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
            return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


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
            return True
        time.sleep(0.05)
    try:
        os.killpg(pid, signal.SIGKILL)
    except OSError:
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            return signaled
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


def _iter_json_string_values(payload: Any) -> list[str]:
    values: list[str] = []
    if isinstance(payload, str):
        values.append(payload)
    elif isinstance(payload, dict):
        for key, item in payload.items():
            if key in {"thinking", "signature"}:
                continue
            values.extend(_iter_json_string_values(item))
    elif isinstance(payload, list):
        for item in payload:
            values.extend(_iter_json_string_values(item))
    return values


def _ignore_embedded_failure_line(stripped: str) -> bool:
    embedded_state_key = r"(?:summary|reason|last_error|last_failure_summary|next)"
    shell_command_prefixes = (
        "/bin/bash -lc ",
        "bash -lc ",
        "/bin/sh -c ",
        "sh -c ",
        "rg ",
        "grep ",
    )
    if stripped.startswith(shell_command_prefixes):
        return True
    if re.match(r"^\d+\t", stripped):
        return True
    if re.match(r"^\d+:\s+", stripped):
        return True
    if re.match(r"^\d+-\s+", stripped):
        return True
    if re.match(rf'^"{embedded_state_key}"\s*:', stripped):
        return True
    if re.match(r"^(?:Error|error):\s*\{\s*[a-z]{2}\s*:", stripped):
        return True
    if stripped.startswith("|"):
        return True
    if re.match(r"^\d+\.\s+", stripped):
        return True
    if re.match(r"^[-*]\s+", stripped):
        return True
    if re.match(r"^[-*]\s+`[^`]+`:", stripped):
        return True
    if re.match(r"^(diff --git|index [0-9a-f]+\.\.[0-9a-f]+|@@|--- |\+\+\+ )", stripped):
        return True
    if re.match(r"^[+-](?:\s|`|\*|$)", stripped):
        return True
    if re.match(r"^[A-Za-z0-9_./-]+\.(?:md|json|jsonl|ya?ml|ts|tsx|js|jsx|py|sql|sh|log|txt):\d+[: -]", stripped):
        return True
    if stripped.startswith(("Reviewer note:", "Review Outcome:", "Impact On Consensus:", "Remaining Question:")):
        return True
    embedded_markers = (
        "current-work.md:",
        "shared L0",
        "machine truth",
        "task object `last_update=",
        "Auto-reassigned review from",
        "Auto-reassigned ownership from",
        "Owner finalized",
        "Handoff to ",
        "reviewer-routing",
    )
    if any(marker in stripped for marker in embedded_markers):
        return True
    return False


def _extract_failure_candidate(text: str) -> str | None:
    lines = text.splitlines() or [text]
    for line in reversed(lines):
        stripped = line.strip()
        if not stripped or _ignore_embedded_failure_line(stripped):
            continue
        if any(pattern.search(stripped) for pattern in WORKER_FAILURE_PATTERNS):
            return stripped
        if JSON_WORKER_FAILURE_PATTERN.search(stripped) and re.match(
            r"^(reason:|status:|error:|fatal:|402\b|quota_exhausted\b|resource_exhausted\b|"
            r"token_invalidated\b|refresh_token_reused\b|"
            r"qwen oauth quota exceeded\b|you(?:'ve| have)\s+hit your limit\b|"
            r"an unexpected critical error occurred\b)",
            stripped,
            re.IGNORECASE,
        ):
            return stripped
    return None


def _captured_tool_log_line_indexes(lines: list[str]) -> set[int]:
    """Return line indexes that are model/tool transcript, not provider runtime output."""
    ignored: set[int] = set()
    in_exec_block = False
    in_final_response = False
    runtime_log_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s+(?:DEBUG|INFO|WARN|ERROR)\b")
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped == "tokens used":
            in_final_response = True
            ignored.add(index)
            continue
        if in_final_response:
            ignored.add(index)
            continue
        if stripped == "exec":
            in_exec_block = True
            ignored.add(index)
            continue
        if in_exec_block and runtime_log_pattern.match(stripped):
            in_exec_block = False
        if in_exec_block:
            ignored.add(index)
    return ignored


def _detect_json_worker_failure_signal(line: str) -> WorkerFailureSignal | None:
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("ts"):
        return None
    if payload.get("type") == "rate_limit_event":
        rate_info = payload.get("rate_limit_info") if isinstance(payload.get("rate_limit_info"), dict) else {}
        status = str(rate_info.get("status") or payload.get("status") or "").strip().lower()
        if status in {"allowed", "allowed_warning"}:
            return None
        detected = _extract_failure_candidate(line)
        if detected:
            return WorkerFailureSignal(detected, source="rate_limit_event", provider_pause_authorized=True)
        return None
    payload_type = str(payload.get("type") or "").strip().lower()
    if payload_type in {"assistant", "user"}:
        return None
    candidates = _iter_json_string_values(payload)
    if payload_type not in {"assistant", "user"}:
        candidates = [*candidates, line]
    for candidate in candidates:
        stripped = candidate.strip()
        if not stripped:
            continue
        detected = _extract_failure_candidate(stripped)
        if detected:
            provider_pause_authorized = True
            source = "structured_json"
            if payload_type == "result":
                source = "json_result_error" if payload.get("is_error") else "json_result"
                provider_pause_authorized = bool(payload.get("is_error")) or _is_result_level_provider_blocker(detected)
            return WorkerFailureSignal(detected, source=source, provider_pause_authorized=provider_pause_authorized)
    return None


def _detect_json_worker_failure(line: str) -> str | None:
    signal = _detect_json_worker_failure_signal(line)
    return signal.reason if signal else None


def _is_result_level_provider_blocker(candidate: str) -> bool:
    normalized = candidate.lower()
    markers = (
        "quota_exhausted",
        "resource_exhausted",
        "oauth quota exceeded",
        "free daily quota has been reached",
        "you have no quota",
        "no quota remaining",
        "payment required",
        "hit your limit",
        "exhausted your capacity",
        "rate limit",
        "rate limited",
        "invalid api key",
        "failed to authenticate",
        "authentication_error",
        "invalid authentication credentials",
        "auth failed",
        "invalid access token",
        "token_invalidated",
        "refresh_token_reused",
        "authentication token has been invalidated",
        "[api error: 401",
        "api error: 401",
        "ineligibletiererror",
        "not eligible for gemini code assist",
        "restricted_dasher_user",
    )
    return any(marker in normalized for marker in markers)


def detect_worker_failure_signal(worker: dict[str, Any]) -> WorkerFailureSignal | None:
    log_path_value = worker.get("log_path")
    if not log_path_value:
        return None
    log_path = Path(log_path_value)
    if not log_path.exists():
        return None
    try:
        lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return None

    ignored_indexes = _captured_tool_log_line_indexes(lines)
    fallback_detected: WorkerFailureSignal | None = None
    for index, line in reversed(list(enumerate(lines))):
        if index in ignored_indexes:
            continue
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("{"):
            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError:
                payload = None
            if isinstance(payload, dict) and payload.get("type") == "result" and not payload.get("is_error"):
                detected = _detect_json_worker_failure_signal(stripped)
                if detected and _is_result_level_provider_blocker(detected.reason):
                    return detected
                return None
            detected = _detect_json_worker_failure_signal(stripped)
            if detected:
                if "an unexpected critical error occurred" in detected.reason.lower():
                    fallback_detected = fallback_detected or detected
                    continue
                return detected
            try:
                if payload is None:
                    json.loads(stripped)
                continue
            except json.JSONDecodeError:
                pass
        if '"ts":' in stripped and '"type":' in stripped:
            continue
        detected = _extract_failure_candidate(stripped)
        if detected:
            if "an unexpected critical error occurred" in detected.lower():
                fallback_detected = fallback_detected or WorkerFailureSignal(
                    detected,
                    source="raw_process_line",
                    provider_pause_authorized=True,
                )
                continue
            return WorkerFailureSignal(detected, source="raw_process_line", provider_pause_authorized=True)
    return fallback_detected


def detect_worker_failure(worker: dict[str, Any]) -> str | None:
    signal = detect_worker_failure_signal(worker)
    return signal.reason if signal else None


def resolve_terminal_worker_reason(worker: dict[str, Any], reason: str) -> str:
    if reason != PREMATURE_EXIT_REASON:
        return reason
    detected = detect_worker_failure(worker)
    return detected or reason


def classify_worker_failure(config: dict[str, Any], worker: dict[str, Any], reason: str | None) -> dict[str, Any]:
    provider = str(worker.get("provider") or worker.get("agent_id") or "").strip().lower()
    normalized = str(reason or "").lower()
    retry = worker_retry_settings(config, worker.get("provider"))
    transient_patterns = [str(pattern).lower() for pattern in retry.get("transient_error_patterns", [])]

    auth_markers = {
        "status: 401",
        "unauthorized",
        "authentication",
        "authentication_error",
        "failed to authenticate",
        "invalid authentication credentials",
        "auth failed",
        "invalid api key",
        "token_invalidated",
        "refresh_token_reused",
        "authentication token has been invalidated",
        "forbidden",
        "permission denied",
        "ineligibletiererror",
        "not eligible for gemini code assist",
        "restricted_dasher_user",
    }
    # Terminal quota: agent has no quota left — reassign immediately, do not retry
    quota_terminal_markers = {
        "quota_exhausted",
        "terminalquotaerror",
        "you have exhausted your capacity",
        "exhausted your capacity",
        "status: 402",
        "you have no quota",
        "no quota remaining",
        "payment required",
        "free daily quota has been reached",
        "oauth quota exceeded",
        "daily quota",
    }
    capacity_markers = {
        "status: 429",
        "resource_exhausted",
        "rate limit",
        "rate limited",
        "hit your limit",
        "no capacity available",
        "retryablequotaerror",
    }
    unknown_critical_markers = {
        "an unexpected critical error occurred",
        "[object object]",
    }

    if any(marker in normalized for marker in auth_markers):
        return {"kind": "auth", "transient": False, "label": "auth"}
    if any(marker in normalized for marker in quota_terminal_markers):
        return {"kind": "quota_terminal", "transient": False, "label": "quota/terminal"}
    if any(marker in normalized for marker in capacity_markers):
        return {"kind": "capacity", "transient": True, "label": "capacity/429"}
    if provider == "gemini" and any(marker in normalized for marker in unknown_critical_markers):
        return {"kind": "unknown_critical", "transient": False, "label": "unknown critical error"}
    if any(pattern in normalized for pattern in transient_patterns):
        return {"kind": "transient", "transient": True, "label": "transient"}
    if any(marker in normalized for marker in unknown_critical_markers):
        return {"kind": "unknown_critical", "transient": False, "label": "unknown critical error"}
    return {"kind": "terminal", "transient": False, "label": "terminal"}


def _parse_iso_utc(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def worker_retry_settings(config: dict[str, Any], provider: str | None) -> dict[str, Any]:
    retry = dict(config.get("worker_retry", {}) or {})
    if provider:
        retry.update((config.get("providers", {}).get(provider, {}).get("retry", {}) or {}))
    retry.setdefault("enabled", True)
    retry.setdefault("max_attempts", 5)
    retry.setdefault("backoff_schedule_seconds", [5, 15, 30, 60, 120])
    retry.setdefault("jitter_seconds", 3)
    retry.setdefault("capacity_pause_seconds", 300)
    retry.setdefault(
        "transient_error_patterns",
        [
            "429",
            "resource_exhausted",
            "rate limit",
            "rate limited",
            "timed out",
            "etimedout",
            "econnreset",
            "temporarily unavailable",
            "try again later",
            "server overloaded",
            "deadline exceeded",
        ],
    )
    retry.setdefault("fallback_mode", "file_inbox")
    return retry


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
    registry = state.setdefault("provider_pauses", {})
    quota_registry = state.setdefault("quota_paused_agents", {})
    for agent_id, pause in list(quota_registry.items()):
        if agent_id not in registry and isinstance(pause, dict):
            merged = dict(pause)
            merged.setdefault("kind", "quota")
            registry[agent_id] = merged
    return registry


def pause_provider(
    state: dict[str, Any],
    agent_id: str,
    reason: str,
    *,
    kind: str,
    reset_seconds: int | None = None,
) -> None:
    normalized = normalize_agent_id(agent_id) or str(agent_id).strip()
    entry = {
        "kind": kind,
        "reason": reason,
        "paused_at": utc_now(),
        "resume_at": (
            datetime.now(timezone.utc).timestamp() + reset_seconds
            if reset_seconds is not None
            else None
        ),
    }
    provider_pause_registry(state)[normalized] = entry
    if kind == "quota":
        state.setdefault("quota_paused_agents", {})[normalized] = {
            "reason": reason,
            "resume_at": entry["resume_at"],
            "paused_at": entry["paused_at"],
        }
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
        pause_provider(state, agent_id, reason, kind="quota", reset_seconds=14400)
    elif failure.get("kind") == "auth":
        pause_provider(state, agent_id, reason, kind="auth", reset_seconds=None)


def clear_provider_pause(state: dict[str, Any], agent_id: str) -> None:
    normalized = normalize_agent_id(agent_id) or str(agent_id).strip()
    provider_pause_registry(state).pop(normalized, None)
    state.setdefault("quota_paused_agents", {}).pop(normalized, None)


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
    pauses = provider_pause_registry(state)
    entry = pauses.get(normalized)
    if not entry:
        return False
    if str(entry.get("kind") or "") == "auth":
        return True
    resume_at = entry.get("resume_at")
    if resume_at is None:
        return True
    return float(resume_at) > datetime.now(timezone.utc).timestamp()


def expire_provider_pauses(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any],
) -> list[str]:
    pauses = provider_pause_registry(state)
    expired: list[str] = []
    now_ts = datetime.now(timezone.utc).timestamp()
    for agent_id, entry in list(pauses.items()):
        kind = str(entry.get("kind") or "")
        resume_at = entry.get("resume_at")
        if kind == "auth":
            # Auth failures from real worker runs are stronger evidence than a
            # lightweight capability probe. Keep the lane paused until a human
            # or explicit repair flow clears it.
            continue
        if resume_at is not None and float(resume_at) <= now_ts:
            clear_provider_pause(state, agent_id)
            expired.append(agent_id)
            console_log(f"provider pause expired: agent={agent_id} now available", quiet=SUPERVISOR_LOG_QUIET)
    return expired


def quota_pause_agent(state: dict[str, Any], agent_id: str, reason: str, reset_seconds: int = 14400) -> None:
    pause_provider(state, agent_id, reason, kind="quota", reset_seconds=reset_seconds)


def is_agent_quota_paused(state: dict[str, Any], agent_id: str) -> bool:
    normalized = normalize_agent_id(agent_id) or str(agent_id).strip()
    entry = provider_pause_registry(state).get(normalized)
    if not entry:
        return False
    resume_at = entry.get("resume_at")
    return bool(resume_at is not None and float(resume_at) > datetime.now(timezone.utc).timestamp())


def expire_quota_pauses(state: dict[str, Any]) -> list[str]:
    paused = state.get("quota_paused_agents") or {}
    now = datetime.now(timezone.utc).timestamp()
    expired = [aid for aid, info in paused.items() if float(info.get("resume_at", 0) or 0) <= now]
    for aid in expired:
        clear_provider_pause(state, aid)
        console_log(f"quota pause expired: agent={aid} now available", quiet=SUPERVISOR_LOG_QUIET)
    return expired


def worker_reassignment_settings(config: dict[str, Any]) -> dict[str, Any]:
    settings = dict(config.get("worker_reassignment", {}) or {})
    settings.setdefault("enabled", True)
    settings.setdefault("after_attempts", 2)
    settings.setdefault("reassign_on_terminal_failure", True)
    default_eligible_statuses: list[str] = []
    ready_settings = ready_dispatch_settings(config)
    for key in ("owned_statuses", "review_statuses", "finalize_statuses"):
        for value in ready_settings.get(key, []) or []:
            normalized = str(value).strip().lower()
            if normalized and normalized not in default_eligible_statuses:
                default_eligible_statuses.append(normalized)
    settings.setdefault("eligible_statuses", default_eligible_statuses or ["backlog", "todo", "in_progress", "review", "review_approved"])
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


# Tree-guard primitives are defined in worker_tree_guard.py so the chatbox
# PreToolUse hook (permission_broker.py) can share them without pulling
# supervisor's heavy import graph. Re-exported here so historical
# `supervisor.X` references — including the unit-test mock
# `mock.patch.object(supervisor.subprocess, "run", ...)` — keep working.
from worker_tree_guard import (  # noqa: E402
    DEFAULT_WORKER_TREE_GUARD_BLOCKING_GLOBS,
    WORKER_TREE_GUARD_SKIP_REASONS,
    _worker_tree_guard_matches,
    _worker_tree_guard_porcelain,
    check_chatbox_tree_guard,
    check_worker_tree_guard,
    worker_tree_guard_settings,
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
    settings.setdefault(
        "default_max_sidecars",
        int(underutilization_settings(config).get("max_new_sidecars_per_wave", 2)),
    )
    return settings


def chair_review_dir(config: dict[str, Any]) -> Path:
    path = config_path(config, "state_file").parent / "chair-reviews"
    path.mkdir(parents=True, exist_ok=True)
    return path


def failure_streak_key(task_id: str, role: str) -> str:
    return f"{task_id}:{role}"


def failure_streak_registry(state: dict[str, Any]) -> dict[str, Any]:
    return state.setdefault("failure_streaks", {})


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
    expires_at = _parse_iso_utc(guard.get("expires_at"))
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
    if normalized in {"owned_finalize_dispatch", "owned_in_progress_dispatch", "owned_ready_dispatch"}:
        return "owner"
    return None


def worker_assignment_role(config: dict[str, Any], worker: dict[str, Any], task: dict[str, Any] | None) -> str | None:
    role = task_role_for_dispatch_reason(((worker.get("request_snapshot") or {}).get("reason")))
    if role:
        return role
    if not task:
        return None
    agent_name = display_name_for(config, str(worker.get("agent_id") or worker.get("provider") or ""))
    task_status = str(task.get("status") or "").lower()
    if task_status == "review" and str(task.get("reviewer") or "") == agent_name:
        return "reviewer"
    if str(task.get("owner") or "") == agent_name:
        return "owner"
    return None


def repeated_failure_records(state: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        dict(record)
        for record in failure_streak_registry(state).values()
        if isinstance(record, dict) and record.get("awaiting_chair")
    ]


def failing_agents_in_reassignment_loops(state: dict[str, Any]) -> set[str]:
    return {
        str(record.get("agent") or "").strip()
        for record in repeated_failure_records(state)
        if str(record.get("agent") or "").strip()
    }


def active_provider_pause_records(state: dict[str, Any]) -> list[dict[str, Any]]:
    now_ts = datetime.now(timezone.utc).timestamp()
    records: list[dict[str, Any]] = []
    for agent_id, entry in provider_pause_registry(state).items():
        if not isinstance(entry, dict):
            continue
        resume_at = entry.get("resume_at")
        if resume_at is not None and float(resume_at or 0) <= now_ts:
            continue
        records.append(
            {
                "agent_id": agent_id,
                "kind": entry.get("kind") or "quota",
                "reason": entry.get("reason") or "",
                "paused_at": entry.get("paused_at"),
                "resume_at": resume_at,
            }
        )
    return sorted(records, key=lambda item: str(item.get("paused_at") or ""), reverse=True)


def actionable_dispatch_pause_records(state: dict[str, Any], *, limit: int = 8) -> list[dict[str, Any]]:
    records = [
        dict(item)
        for item in state.get("dispatch_pauses", []) or []
        if isinstance(item, dict) and str(item.get("task_id") or "").strip()
    ]
    records.sort(key=lambda item: str(item.get("paused_at") or ""), reverse=True)
    return records[:limit]


def chair_review_needs_immediate_attention(state: dict[str, Any]) -> bool:
    if repeated_failure_records(state) or actionable_dispatch_pause_records(state, limit=1):
        return True
    last_review_at = _parse_iso_utc((state.get("chair_review") or {}).get("last_review_at"))
    for pause in active_provider_pause_records(state):
        paused_at = _parse_iso_utc(str(pause.get("paused_at") or ""))
        if last_review_at is None or paused_at is None or paused_at > last_review_at:
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
            if task_status not in {"todo", "backlog", "in_progress", "review_approved"} or str(task.get("owner") or "") != agent:
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
    return {
        str(agent.get("display_name") or agent.get("name") or agent_id).strip()
        for agent_id, agent in (config.get("agents", {}) or {}).items()
        if str(agent.get("display_name") or agent.get("name") or agent_id).strip()
    }


def display_name_is_legacy_alias(name: str | None) -> bool:
    return "legacy alias" in str(name or "").lower()


def first_viable_agent(config: dict[str, Any], preferred: list[str], exclude: set[str], state: dict[str, Any] | None = None) -> str | None:
    known = known_agent_display_names(config)
    seen: set[str] = set()
    provider_report = load_provider_report(config) if state is not None else None
    for candidate in preferred:
        name = str(candidate or "").strip()
        if not name or name in seen or name in exclude or display_name_is_legacy_alias(name):
            continue
        seen.add(name)
        if name in known:
            if state is not None and is_agent_dispatch_paused(config, state, name, provider_report=provider_report):
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
    if provider_pause_registry(state).get(agent_id):
        return False
    provider_info = provider_info_for_agent(config, provider_report, agent_id)
    if provider_info.get("auth_ready") is False:
        return False
    adapter_info = adapter_info_for_agent(config, provider_report, agent_id)
    if adapter_info and adapter_info.get("supported") is False:
        return False
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
    active_worker_statuses = {str(value) for value in ready_dispatch_settings(load_config()).get("active_worker_statuses", [])}
    active_task_ids = {
        str(worker.get("task_id") or "")
        for worker in (state.get("workers", {}) or {}).values()
        if str(worker.get("task_id") or "").strip() and str(worker.get("status") or "") in active_worker_statuses
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
        if str(task_by_id.get(str(pause.get("task_id") or ""), {}).get("status") or "").strip().lower() not in {"done", "review_approved"}
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
    review_statuses: set[str],
    finalize_statuses: set[str],
    dependency_done_statuses: set[str],
    state: dict[str, Any] | None = None,
) -> dict[str, str] | None:
    if not helper_settings.get("enabled", True):
        return None

    allowed_statuses = {str(value).lower() for value in helper_settings.get("task_statuses", ["backlog", "todo", "in_progress", "review", "review_approved"])}
    task_status = str(task.get("status") or "").lower()
    if task_status not in allowed_statuses:
        return None

    owner = str(task.get("owner") or "")
    reviewer = str(task.get("reviewer") or "")
    reason: str | None = None
    assigned_agent = ""
    counterpart_agent = ""
    claim_role = ""

    if task_status in review_statuses:
        assigned_agent = reviewer
        counterpart_agent = owner
        claim_role = "reviewer"
        reason = "review_ready_dispatch"
    elif task_status in finalize_statuses:
        assigned_agent = owner
        counterpart_agent = reviewer
        claim_role = "owner"
        reason = "owned_finalize_dispatch"
    elif task_status == "in_progress" and dependencies_satisfied(task, task_map, dependency_done_statuses):
        assigned_agent = owner
        counterpart_agent = reviewer
        claim_role = "owner"
        reason = "owned_in_progress_dispatch"
    elif task_status in {"todo", "backlog"} and dependencies_satisfied(task, task_map, dependency_done_statuses):
        assigned_agent = owner
        counterpart_agent = reviewer
        claim_role = "owner"
        reason = "owned_ready_dispatch"

    if not reason or not assigned_agent or assigned_agent == idle_agent_name:
        return None

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
        if is_agent_dispatch_paused(config, state, assigned_agent):
            assigned_load = len(agent_loads.get(assigned_agent, []))
            if assigned_load == 0:
                return None

    current_priority = dispatch_reason_priority(reason)
    assigned_loads = agent_loads.get(assigned_agent, [])
    has_higher_priority_load = current_priority is not None and any(priority < current_priority for priority in assigned_loads)
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
    if reviewer and reviewer != idle_agent_name:
        reviewer_candidates.append(reviewer)
    if owner and owner != idle_agent_name and owner != reviewer:
        reviewer_candidates.append(owner)
    reviewer_candidates.extend(normalized_mapping_values(reassignment_settings.get("reviewer_fallbacks", {}), assigned_agent))
    if helper_settings.get("availability_first", True) or helper_settings.get("allow_any_idle_lane", True):
        reviewer_candidates.extend(ordered_idle)
    new_reviewer = first_viable_agent(config, reviewer_candidates, exclude={idle_agent_name}, state=state)
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


def proactive_claim_plan_for_task(
    config: dict[str, Any],
    *,
    task: dict[str, Any],
    task_map: dict[str, dict[str, Any]],
    idle_agent_names: list[str],
    agent_loads: dict[str, list[int]],
    helper_settings: dict[str, Any],
    review_statuses: set[str],
    finalize_statuses: set[str],
    dependency_done_statuses: set[str],
    state: dict[str, Any] | None = None,
) -> dict[str, str] | None:
    for idle_agent_name in ordered_idle_agent_names(idle_agent_names, agent_loads):
        plan = proactive_claim_plan_for_idle_agent(
            config,
            task=task,
            task_map=task_map,
            idle_agent_name=idle_agent_name,
            idle_agent_names=idle_agent_names,
            agent_loads=agent_loads,
            helper_settings=helper_settings,
            review_statuses=review_statuses,
            finalize_statuses=finalize_statuses,
            dependency_done_statuses=dependency_done_statuses,
            state=state,
        )
        if plan:
            return plan
    return None


def sync_status_pipeline(config: dict[str, Any]) -> bool:
    script = config_path(config, "status_file").parent / "scripts" / "ai_status.py"
    if not script.exists():
        write_activity_log(
            config,
            {
                "type": "task_reassignment_sync_failed",
                "message": f"Status sync script not found at {script}.",
            },
        )
        return False
    result = subprocess.run(
        [sys.executable, str(script), "sync"],
        cwd=str(config_path(config, "status_file").parent),
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return True
    write_activity_log(
        config,
        {
            "type": "task_reassignment_sync_failed",
            "message": f"Status sync failed after reassignment: {result.stderr.strip() or result.stdout.strip() or 'unknown error'}",
        },
    )
    return False


def reconcile_status_from_git(config: dict[str, Any]) -> bool:
    """Bridge git-merged closeouts → state-machine `done` once per tick.

    Workers occasionally ship a task via PR + merge but skip `ai-status.sh
    done`, leaving ai-status.json stuck in in_progress/review/backlog. This
    invokes the dedicated reconcile-from-git command which scans origin/dev
    for closeout commits and finalizes any drift. Cheap, idempotent.
    """
    try:
        status_root = config_path(config, "status_file").parent
    except KeyError:
        return False
    script = status_root / "scripts" / "ai_status.py"
    if not script.exists():
        return False
    result = subprocess.run(
        [sys.executable, str(script), "reconcile-from-git"],
        cwd=str(status_root),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        write_activity_log(
            config,
            {
                "type": "reconcile_status_from_git_failed",
                "message": result.stderr.strip() or result.stdout.strip() or "unknown error",
            },
        )
        return False
    stdout = result.stdout.strip()
    if stdout and "no drift" not in stdout:
        for line in stdout.splitlines():
            write_activity_log(
                config,
                {
                    "type": "reconcile_status_from_git",
                    "message": line.strip(),
                },
            )
    return True


def brief_reason_text(text: str | None, max_length: int = 240) -> str:
    raw = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(raw) <= max_length:
        return raw
    clipped = raw[: max_length - 1].rstrip()
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    return clipped + "…"


def summarize_worker_failure(config: dict[str, Any], worker: dict[str, Any], reason: str) -> tuple[str, str]:
    failure = classify_worker_failure(config, worker, reason)
    label = str(failure.get("label") or "worker failure").strip()
    summary = brief_reason_text(reason, max_length=220)
    if label and label.lower() not in summary.lower():
        summary = f"{label}: {summary}"
    return label or "worker failure", summary


def record_worker_evidence(config: dict[str, Any], worker: dict[str, Any], reason: str) -> str:
    run_id = str(worker.get("run_id") or new_runtime_id("worker")).strip()
    path = evidence_path(run_id)
    label, summary = summarize_worker_failure(config, worker, reason)
    payload = {
        "created_at": utc_now(),
        "provider": worker.get("provider"),
        "task_id": worker.get("task_id"),
        "worker_run_id": run_id,
        "queue_event_id": worker.get("queue_event_id"),
        "kind": label,
        "summary": summary,
        "log_path": worker.get("log_path"),
        "payload_path": worker.get("payload_path"),
        "raw_message": reason,
    }
    write_json(path, payload)
    return relpath(path)


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


def clear_worker_dispatch_pause(state: dict[str, Any], worker: dict[str, Any]) -> None:
    clear_dispatch_pause(
        state,
        task_id=str(worker.get("task_id") or "") or None,
        worker_run_id=str(worker.get("run_id") or "") or None,
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
    status_path = config_path(config, "status_file")
    status = load_status(config)
    tasks = status.get("tasks", []) or []
    timestamp = utc_now()
    task = next((item for item in tasks if item.get("id") == task_id), None)
    if task is None:
        return False

    old_owner = str(task.get("owner") or "")
    old_reviewer = str(task.get("reviewer") or "")
    task["owner"] = new_owner
    task["reviewer"] = new_reviewer
    task["last_update"] = timestamp
    short_message = brief_reason_text(message, max_length=280)
    task["next"] = short_message
    if evidence_ref:
        refs = list(task.get("evidence_refs", []) or [])
        if evidence_ref not in refs:
            refs.append(evidence_ref)
        task["evidence_refs"] = refs

    for handoff in status.get("handoffs", []) or []:
        if handoff.get("task_id") != task_id or handoff.get("status") == "done":
            continue
        target = str(handoff.get("to") or "")
        if target in {old_owner, old_reviewer} and target not in {new_owner, new_reviewer}:
            handoff["status"] = "done"
            handoff["resolved_at"] = timestamp

    if handoff_to:
        status.setdefault("handoffs", []).append(
            {
                "task_id": task_id,
                "from": handoff_from or old_owner or old_reviewer or new_owner,
                "to": handoff_to,
                "message": short_message,
                "status": "pending",
                "created_at": timestamp,
            }
        )

    write_json(status_path, status)
    return sync_status_pipeline(config)


def maybe_reassign_task_after_worker_failure(
    config: dict[str, Any],
    worker: dict[str, Any],
    reason: str,
    *,
    terminal: bool = False,
    state: dict[str, Any] | None = None,
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
    finalize_statuses = {str(value).lower() for value in dispatch_settings.get("finalize_statuses", ["review_approved"])}
    owned_statuses = {str(value).lower() for value in dispatch_settings.get("owned_statuses", ["in_progress", "todo", "backlog"])}

    failing_agent = display_name_for(config, str(worker.get("agent_id") or worker.get("provider") or ""))
    failure_label, failure_summary = summarize_worker_failure(config, worker, reason)
    evidence_ref = str(worker.get("last_evidence_ref") or "").strip() or None
    owner = str(task.get("owner") or "")
    reviewer = str(task.get("reviewer") or "")

    if task_status in review_statuses and reviewer == failing_agent:
        candidates = normalized_mapping_values(settings.get("reviewer_fallbacks", {}), failing_agent)
        new_reviewer = first_viable_agent(config, candidates, exclude={owner, reviewer}, state=state)
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

    if task_status in owned_statuses | finalize_statuses and owner == failing_agent:
        candidates = normalized_mapping_values(settings.get("owner_fallbacks", {}), failing_agent)
        new_owner = first_viable_agent(config, candidates, exclude={owner, reviewer}, state=state)
        if not new_owner:
            return None
        reviewer_candidates = [reviewer]
        reviewer_candidates.extend(normalized_mapping_values(settings.get("reviewer_fallbacks", {}), failing_agent))
        reviewer_candidates.extend(normalized_mapping_values(settings.get("owner_fallbacks", {}), failing_agent))
        new_reviewer = first_viable_agent(config, reviewer_candidates, exclude={new_owner}, state=state)
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
            next_retry_at = _parse_iso_utc(worker.get("next_retry_at"))
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
    finalize_statuses = {str(value).lower() for value in settings.get("finalize_statuses", ["review_approved"])}
    done_statuses = {str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])}
    statuses = set(done_statuses)

    reason = str(((worker.get("request_snapshot") or {}).get("reason")) or "").strip().lower()
    if reason in {"owned_ready_dispatch", "owned_in_progress_dispatch"}:
        statuses.update(review_statuses)
        statuses.update(finalize_statuses)
        return statuses
    if reason == "review_ready_dispatch":
        statuses.update(finalize_statuses)
        return statuses
    if reason == "owned_finalize_dispatch":
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
        statuses.update(finalize_statuses)
    elif agent_id and agent_id == owner_id:
        statuses.update(review_statuses)
    return statuses


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
        next_retry_at = _parse_iso_utc(worker.get("next_retry_at"))
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
    worker["pid"] = process.pid
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
        "pid": process.pid,
        "allowed_tools": allowed_tools,
    }


def poll_workers(config: dict[str, Any], state: dict[str, Any]) -> bool:
    changed = False
    approval_state = load_approval_state(config)
    task_map = task_index_from_status(config, load_status(config))
    valid_queue_event_ids = set(state.get("queue", {}).get("events", {}))
    redispatch_statuses = redispatch_candidate_statuses(config)
    active_worker_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
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
    provider_report = load_provider_report(config)
    changed = retry_due_workers(config, state, provider_report, now) or changed
    workers = state.setdefault("workers", {})
    for run_id, worker in list(workers.items()):
        previous_last_event_at = worker.get("last_event_at")
        task = task_map.get(worker.get("task_id"), {})
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
        last_event_advanced = bool(
            previous_last_event_at
            and worker.get("last_event_at")
            and worker.get("last_event_at") > previous_last_event_at
        )
        current_mode = worker_runtime_mode(worker)
        task_status = str(task.get("status") or "").lower()
        expected_completion_statuses = worker_expected_completion_statuses(config, worker, task)
        if (
            worker.get("queue_event_id")
            and current_mode == "execution"
            and not worker_matches_current_assignment(config, worker, task_map)
        ):
            if not alive and task_status in expected_completion_statuses:
                pass
            else:
                if worker.get("status") == "superseded":
                    continue
                if alive:
                    terminate_worker_pid(worker.get("pid"))
                worker["status"] = "superseded"
                worker["last_event_at"] = utc_now()
                worker["last_error"] = "Worker superseded after task responsibility moved to another agent."
                finalize_queue_event_record(
                    config,
                    state,
                    worker,
                    "completed",
                    worker["last_error"],
                )
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
                console_log(
                    f"worker superseded: task={worker.get('task_id')} provider={worker.get('provider')} run={worker.get('run_id')}",
                    quiet=SUPERVISOR_LOG_QUIET,
                )
                changed = True
                continue
        if (
            worker.get("queue_event_id")
            and current_mode == "execution"
            and worker.get("status") in active_worker_statuses
            and higher_priority_ready_task_exists(config, worker, task_map, state=state, active_statuses=active_worker_statuses)
        ):
            if alive:
                terminate_worker_pid(worker.get("pid"))
            worker["status"] = "superseded"
            worker["last_event_at"] = utc_now()
            worker["last_error"] = "Worker superseded to prioritize higher-priority review/finalize work."
            finalize_queue_event_record(
                config,
                state,
                worker,
                "completed",
                worker["last_error"],
            )
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
            console_log(
                f"worker superseded for priority escalation: task={worker.get('task_id')} provider={worker.get('provider')} run={worker.get('run_id')}",
                quiet=SUPERVISOR_LOG_QUIET,
            )
            changed = True
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
        if (
            not alive
            and worker.get("queue_event_id")
            and worker.get("status") == "manual_pending"
            and worker.get("mode") == "file_inbox"
            and worker_matches_current_assignment(config, worker, task_map)
            and task_status in redispatch_statuses
            and provider_info.get("auth_ready")
            and provider_info.get("local_cli_worker_supported")
        ):
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
        pending = pending_by_run.get(worker["run_id"], [])
        resolved = resolved_by_run.get(worker["run_id"], [])
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
                changed = True
                continue
            approval = pending[0]
            next_status = "waiting_approval" if pid_is_alive(worker.get("pid")) else "suspended_approval"
            if worker.get("status") != next_status:
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
                changed = True
            continue

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
                        continue
                if latest.get("decision") == "deny":
                    worker["status"] = "failed"
                    worker["last_event_at"] = utc_now()
                    write_activity_log(
                        config,
                        {
                            "type": "worker_failed",
                            "provider": worker.get("provider"),
                            "task_id": worker.get("task_id"),
                            "message": latest.get("note") or "Worker approval denied.",
                            "worker_run_id": worker["run_id"],
                            "approval_id": latest.get("approval_id"),
                        },
                    )
                    finalize_queue_event_record(config, state, worker, "failed", latest.get("note") or "Worker approval denied.")
                    changed = True
                    continue
            changed = True

        current_status = worker.get("status")
        if current_status in {"waiting_approval", "suspended_approval"} and not pending:
            worker["deferred_action"] = None
            worker["deferred_tool_use"] = None
            if not resolved:
                worker["last_approval_id"] = None
            if alive:
                worker["status"] = "running"
                worker["last_event_at"] = utc_now()
            else:
                worker["status"] = "failed"
                worker["last_event_at"] = utc_now()
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
            changed = True

        if alive:
            live_failure_signal = detect_worker_failure_signal(worker)
            if live_failure_signal:
                live_failure_reason = live_failure_signal.reason
                failure = classify_worker_failure(config, worker, live_failure_reason)
                if failure.get("kind") in {"auth", "quota_terminal", "capacity"}:
                    console_log(
                        f"live worker failure: provider={worker.get('provider')} task={worker.get('task_id')} kind={failure.get('label')} source={live_failure_signal.source} reason={live_failure_reason}",
                        quiet=SUPERVISOR_LOG_QUIET,
                    )
                    terminate_worker_pid(worker.get("pid"))
                    if failure.get("kind") == "quota_terminal" and live_failure_signal.provider_pause_authorized:
                        agent_id = str(worker.get("agent_id") or worker.get("provider") or "")
                        if agent_id:
                            pause_provider(state, agent_id, live_failure_reason, kind="quota", reset_seconds=14400)
                    if failure.get("kind") == "auth" and live_failure_signal.provider_pause_authorized:
                        agent_id = str(worker.get("agent_id") or worker.get("provider") or "")
                        if agent_id:
                            pause_provider(state, agent_id, live_failure_reason, kind="auth", reset_seconds=None)
                    if failure.get("kind") == "capacity" and current_mode == "coordination":
                        agent_id = str(worker.get("agent_id") or worker.get("provider") or "")
                        reset_seconds = int(worker_retry_settings(config, worker.get("provider")).get("capacity_pause_seconds", 300))
                        if agent_id and live_failure_signal.provider_pause_authorized:
                            pause_provider(state, agent_id, live_failure_reason, kind="capacity", reset_seconds=reset_seconds)
                        finalize_terminal_worker_outcome(config, state, worker, live_failure_reason)
                        changed = True
                        continue
                    if is_transient_worker_failure(config, worker, live_failure_reason):
                        handled, retry_changed = maybe_trigger_retry_or_fallback(
                            config,
                            state,
                            provider_report,
                            worker,
                            live_failure_reason,
                            allow_provider_pause=live_failure_signal.provider_pause_authorized,
                        )
                        if handled:
                            changed = changed or retry_changed
                            continue
                    reassigned_to = maybe_reassign_task_after_worker_failure(
                        config,
                        worker,
                        live_failure_reason,
                        terminal=True,
                        state=state,
                    )
                    if reassigned_to:
                        worker["status"] = "reassigned"
                        worker["reassigned_to"] = reassigned_to
                        worker["last_error"] = live_failure_reason
                        worker["last_event_at"] = utc_now()
                        finalize_queue_event_record(config, state, worker, "completed")
                        changed = True
                        continue
                    finalize_terminal_worker_outcome(config, state, worker, live_failure_reason)
                    changed = True
                    continue
            if worker.get("status") == "stalled" and last_event_advanced:
                worker["status"] = "running"
                worker["last_event_at"] = worker.get("last_event_at") or utc_now()
                write_activity_log(
                    config,
                    {
                        "type": "worker_recovered",
                        "provider": worker.get("provider"),
                        "task_id": worker.get("task_id"),
                        "message": "Worker produced new output after being marked stalled; status restored to running.",
                        "worker_run_id": worker["run_id"],
                    },
                )
                console_log(
                    f"worker recovered: task={worker.get('task_id')} provider={worker.get('provider')} run={worker.get('run_id')}",
                    quiet=SUPERVISOR_LOG_QUIET,
                )
                changed = True
                continue
            last_event = worker.get("last_event_at")
            if last_event:
                last_dt = datetime.fromisoformat(last_event.replace("Z", "+00:00"))
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
            failure_reason = failure_signal.reason
            failure = classify_worker_failure(config, worker, failure_reason)
            console_log(
                f"worker failure: provider={worker.get('provider')} task={worker.get('task_id')} kind={failure.get('label')} transient={'yes' if failure.get('transient') else 'no'} source={failure_signal.source} reason={failure_reason}",
                quiet=SUPERVISOR_LOG_QUIET,
            )
            if failure.get("kind") == "quota_terminal" and failure_signal.provider_pause_authorized:
                agent_id = str(worker.get("agent_id") or worker.get("provider") or "")
                if agent_id:
                    pause_provider(state, agent_id, failure_reason, kind="quota", reset_seconds=14400)
            if failure.get("kind") == "auth" and failure_signal.provider_pause_authorized:
                agent_id = str(worker.get("agent_id") or worker.get("provider") or "")
                if agent_id:
                    pause_provider(state, agent_id, failure_reason, kind="auth", reset_seconds=None)
            if failure.get("kind") == "capacity" and current_mode == "coordination":
                agent_id = str(worker.get("agent_id") or worker.get("provider") or "")
                reset_seconds = int(worker_retry_settings(config, worker.get("provider")).get("capacity_pause_seconds", 300))
                if agent_id and failure_signal.provider_pause_authorized:
                    pause_provider(state, agent_id, failure_reason, kind="capacity", reset_seconds=reset_seconds)
                finalize_terminal_worker_outcome(config, state, worker, failure_reason)
                changed = True
                continue
            if is_transient_worker_failure(config, worker, failure_reason):
                handled, retry_changed = maybe_trigger_retry_or_fallback(
                    config,
                    state,
                    provider_report,
                    worker,
                    failure_reason,
                    allow_provider_pause=failure_signal.provider_pause_authorized,
                )
                if handled:
                    changed = changed or retry_changed
                    continue
            reassigned_to = maybe_reassign_task_after_worker_failure(
                config,
                worker,
                failure_reason,
                terminal=True,
                state=state,
            )
            if reassigned_to:
                worker["status"] = "reassigned"
                worker["reassigned_to"] = reassigned_to
                worker["last_error"] = failure_reason
                worker["last_event_at"] = utc_now()
                finalize_queue_event_record(config, state, worker, "completed")
                changed = True
                continue
            finalize_terminal_worker_outcome(config, state, worker, failure_reason)
            changed = True
            continue

        if worker.get("status") not in {"completed", "failed", "manual_pending"}:
            if current_mode in {"planning", "coordination"}:
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
                # Race protection: the worker may have written status='review' (or another
                # expected_completion status) to ai-status.json moments before exiting.
                # The task_map cached at the start of this tick can predate that write, so
                # re-read fresh before declaring "exited before terminal status".
                fresh_task = task_index_from_status(config, load_status(config)).get(worker.get("task_id")) or {}
                fresh_status = str(fresh_task.get("status") or "").lower()
                if (
                    fresh_status
                    and fresh_status != task_status
                    and fresh_status in expected_completion_statuses
                ):
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
            changed = True
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



def ready_dispatch_settings(config: dict[str, Any]) -> dict[str, Any]:
    settings = dict(config.get("ready_dispatcher", {}) or {})
    settings.setdefault("enabled", True)
    settings.setdefault("review_statuses", ["review"])
    settings.setdefault("finalize_statuses", ["review_approved"])
    settings.setdefault("owned_statuses", ["in_progress", "todo", "backlog"])
    legacy_done_statuses = settings.get("done_statuses", ["done", "review_approved"])
    settings.setdefault("dependency_done_statuses", ["done"])
    settings.setdefault("worker_terminal_statuses", legacy_done_statuses)
    settings.setdefault(
        "active_worker_statuses",
        ["running", "started", "waiting_approval", "suspended_approval", "retry_backoff", "manual_pending", "stalled", "fallback"],
    )
    settings.setdefault("max_tasks_per_agent", 1)
    settings.setdefault("max_tasks_per_agent_by_lane", {})
    settings.setdefault("max_dispatches_per_tick", 4)
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
            return max(1, int(value))
        except (TypeError, ValueError):
            return default
    return default


def helper_claim_settings(config: dict[str, Any]) -> dict[str, Any]:
    settings = dict(ready_dispatch_settings(config).get("helper_claim", {}) or {})
    settings.setdefault("enabled", False)
    settings.setdefault("task_statuses", ["backlog", "todo", "in_progress", "review", "review_approved"])
    settings.setdefault("availability_first", True)
    settings.setdefault("allow_any_idle_lane", True)
    settings.setdefault("prefer_assigned_when_idle", True)
    settings.setdefault("require_assigned_agent_busy", True)
    settings.setdefault("require_owner_higher_priority_load", False)
    settings.setdefault("respect_explicit_owner_when_paused", True)
    return settings


def underutilization_settings(config: dict[str, Any]) -> dict[str, Any]:
    settings = dict(config.get("underutilization_dispatch", {}) or {})
    settings.setdefault("enabled", True)
    settings.setdefault("threshold_ratio", 0.5)
    settings.setdefault("continuous_window_seconds", 900)
    settings.setdefault("cooldown_seconds", 900)
    settings.setdefault("max_new_sidecars_per_wave", 2)
    settings.setdefault("max_new_main_tasks_per_wave", 2)
    settings.setdefault("max_active_sidecars_per_agent", 1)
    settings.setdefault(
        "productive_worker_statuses",
        ["running", "waiting_approval", "suspended_approval", "retry_backoff"],
    )
    return settings


def load_sidecar_catalog(config: dict[str, Any]) -> list[dict[str, Any]]:
    path_value = config.get("sidecar_catalog_path") or config.get("paths", {}).get("sidecar_catalog")
    if not path_value:
        return []
    payload = load_json(config_path(config, "sidecar_catalog") if "sidecar_catalog" in config.get("paths", {}) else Path(path_value), default={})
    if isinstance(payload, dict):
        templates = payload.get("templates", [])
        if isinstance(templates, list):
            return [dict(item) for item in templates if isinstance(item, dict)]
    if isinstance(payload, list):
        return [dict(item) for item in payload if isinstance(item, dict)]
    return []


def configured_worker_lane_ids(config: dict[str, Any]) -> list[str]:
    lanes: list[str] = []
    seen: set[str] = set()
    for agent_id, agent in (config.get("agents", {}) or {}).items():
        display_name = str(agent.get("display_name") or agent.get("name") or agent_id)
        if "legacy alias" in display_name.lower():
            continue
        lane_id = normalize_agent_id(agent.get("provider") or agent_id)
        if not lane_id or lane_id in seen:
            continue
        seen.add(lane_id)
        lanes.append(lane_id)
    return lanes


def productive_worker_lane_ids(config: dict[str, Any], state: dict[str, Any], productive_statuses: set[str]) -> set[str]:
    lanes: set[str] = set()
    for worker in state.get("workers", {}).values():
        if str(worker.get("status") or "") not in productive_statuses:
            continue
        lane_id = normalize_agent_id(worker.get("provider") or worker.get("agent_id") or "")
        if lane_id:
            lanes.add(lane_id)
    return lanes


def utilization_ratio_for_sidecars(config: dict[str, Any], state: dict[str, Any], productive_statuses: set[str]) -> float:
    lanes = configured_worker_lane_ids(config)
    if not lanes:
        return 1.0
    productive = productive_worker_lane_ids(config, state, productive_statuses)
    return len(productive) / len(lanes)


def task_is_sidecar(task: dict[str, Any]) -> bool:
    return str(task.get("task_class") or "").strip().lower() == "sidecar"


def sidecar_statuses() -> set[str]:
    return {"backlog", "todo", "in_progress", "review", "review_approved", "blocked", "done"}


def existing_sidecar_signatures(status: dict[str, Any]) -> set[str]:
    signatures: set[str] = set()
    for task in status.get("tasks", []) or []:
        if not task_is_sidecar(task):
            continue
        parent = str(task.get("helper_parent") or "").strip()
        kind = str(task.get("helper_kind") or "").strip()
        if parent and kind:
            signatures.add(f"{parent}:{kind}")
    return signatures


def sidecar_task_id(parent_task_id: str, kind: str) -> str:
    slug = kind
    if slug.endswith("_packet"):
        slug = slug[: -len("_packet")]
    return f"{parent_task_id}-SIDECAR-{slug.replace('_', '-').upper()}"


def render_sidecar_template(value: str, variables: dict[str, str]) -> str:
    rendered = str(value)
    for key, item in variables.items():
        rendered = rendered.replace("{{" + key + "}}", item)
    return rendered


def task_phase_priority(task: dict[str, Any], task_map: dict[str, dict[str, Any]], dependency_done_statuses: set[str]) -> int:
    status = str(task.get("status") or "").lower()
    if status == "in_progress":
        return 0
    if status == "review":
        return 1
    if status == "review_approved":
        return 2
    if status in {"todo", "backlog"} and dependencies_satisfied(task, task_map, dependency_done_statuses):
        return 3
    if status in {"todo", "backlog"}:
        return 4
    if status == "blocked":
        return 5
    return 9


def dynamic_sidecar_kind(task: dict[str, Any]) -> str | None:
    phase = str(task.get("phase") or "").lower()
    title = str(task.get("title") or "").lower()
    artifacts = " ".join(str(item).lower() for item in (task.get("artifacts") or []))
    if "persona and application surfaces" in phase or "bff" in title or "surface" in title or "bff" in artifacts:
        return "bff_handoff_packet"
    if str(task.get("status") or "").lower() in {"review", "review_approved"}:
        return "review_packet"
    return "acceptance_packet"


def preferred_agents_for_sidecar(kind: str) -> list[str]:
    mapping = {
        "review_packet": ["Codex", "Codex2", "Claude2", "Claude", "Gemini", "Gemini2", "Copilot"],
        "acceptance_packet": ["Codex", "Codex2", "Claude2", "Claude", "Gemini", "Gemini2", "Copilot"],
        "bff_handoff_packet": ["Copilot", "Codex", "Codex2", "Claude2", "Claude", "Gemini", "Gemini2"],
    }
    return mapping.get(kind, ["Codex", "Codex2", "Claude2", "Claude", "Gemini", "Gemini2", "Copilot"])


def agent_has_dispatchable_primary_work(
    config: dict[str, Any],
    status: dict[str, Any],
    agent_name: str,
    task_map: dict[str, dict[str, Any]],
) -> bool:
    settings = ready_dispatch_settings(config)
    review_statuses = {str(value).lower() for value in settings.get("review_statuses", ["review"])}
    finalize_statuses = {str(value).lower() for value in settings.get("finalize_statuses", ["review_approved"])}
    dependency_done_statuses = {str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])}
    for task in status.get("tasks", []) or []:
        if task_is_sidecar(task):
            continue
        task_status = str(task.get("status") or "").lower()
        if task_status in review_statuses and task.get("reviewer") == agent_name:
            return True
        if task_status in finalize_statuses and task.get("owner") == agent_name:
            return True
        if task.get("owner") != agent_name:
            continue
        if task_status == "in_progress" and dependencies_satisfied(task, task_map, dependency_done_statuses):
            return True
        if task_status in {"todo", "backlog"} and dependencies_satisfied(task, task_map, dependency_done_statuses):
            return True
    return False


def count_open_sidecars_for_agent(status: dict[str, Any], agent_name: str) -> int:
    count = 0
    for task in status.get("tasks", []) or []:
        if task.get("owner") != agent_name:
            continue
        if not task_is_sidecar(task):
            continue
        if str(task.get("status") or "").lower() == "done":
            continue
        count += 1
    return count


def eligible_idle_agents_for_sidecars(
    config: dict[str, Any],
    state: dict[str, Any],
    status: dict[str, Any],
    *,
    max_active_sidecars_per_agent: int,
    provider_report: dict[str, Any] | None = None,
) -> list[str]:
    settings = ready_dispatch_settings(config)
    active_statuses = {str(value) for value in settings.get("active_worker_statuses", [])}
    active_agents, _active_task_agents = active_worker_indexes(state, active_statuses)
    pending_agents, _pending_task_agents, _pending_event_keys = outstanding_delivery_indexes(config, state)
    task_map = task_index_from_status(config, status)
    agents: list[str] = []
    for agent_id, agent in (config.get("agents", {}) or {}).items():
        display_name = str(agent.get("display_name") or agent.get("name") or agent_id).strip()
        if "legacy alias" in display_name.lower():
            continue
        normalized = normalize_agent_id(agent_id)
        if normalized in active_agents or normalized in pending_agents:
            continue
        if is_agent_dispatch_paused(config, state, agent_id, provider_report=provider_report):
            continue
        if count_open_sidecars_for_agent(status, display_name) >= max_active_sidecars_per_agent:
            continue
        if agent_has_dispatchable_primary_work(config, status, display_name, task_map):
            continue
        agents.append(display_name)
    return agents


def sidecar_support_artifact(parent_task_id: str, sidecar_id: str) -> str:
    return f"support/sidecars/{parent_task_id}/{sidecar_id}.md"


def build_catalog_sidecar_candidates(
    config: dict[str, Any],
    status: dict[str, Any],
    task_map: dict[str, dict[str, Any]],
    existing_signatures: set[str],
) -> list[dict[str, Any]]:
    settings = ready_dispatch_settings(config)
    dependency_done_statuses = {str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])}
    templates = load_sidecar_catalog(config)
    candidates: list[dict[str, Any]] = []
    for template in templates:
        kind = str(template.get("kind") or "").strip()
        if not kind:
            continue
        parent_ids = [str(item).strip() for item in template.get("parent_task_ids", []) if str(item).strip()]
        phase_match = str(template.get("parent_phase_match") or "").strip()
        activation_dependencies = [str(item).strip() for item in template.get("activation_dependencies", []) if str(item).strip()]
        for parent in status.get("tasks", []) or []:
            if task_is_sidecar(parent):
                continue
            parent_id = str(parent.get("id") or "").strip()
            if not parent_id:
                continue
            if parent_ids and parent_id not in parent_ids:
                continue
            if not parent_ids and phase_match and str(parent.get("phase") or "") != phase_match:
                continue
            if not parent_ids and not phase_match:
                continue
            if str(parent.get("status") or "").lower() == "done":
                continue
            if any((lambda d: d is not None and str(d.get("status") or "").lower() not in dependency_done_statuses)(task_map.get(dep)) for dep in activation_dependencies):
                continue
            signature = f"{parent_id}:{kind}"
            if signature in existing_signatures:
                continue
            reviewer = str(parent.get("owner") or "").strip()
            if not reviewer:
                continue
            sidecar_id = sidecar_task_id(parent_id, kind)
            variables = {
                "parent_task_id": parent_id,
                "parent_title": str(parent.get("title") or ""),
                "parent_phase": str(parent.get("phase") or ""),
                "sidecar_task_id": sidecar_id,
                "kind": kind,
                "kind_slug": kind.replace("_", "-"),
            }
            artifact_targets = [
                render_sidecar_template(str(item), variables)
                for item in (template.get("artifact_targets") or [])
                if str(item).strip()
            ] or [sidecar_support_artifact(parent_id, sidecar_id)]
            candidates.append(
                {
                    "template_id": str(template.get("template_id") or sidecar_id),
                    "kind": kind,
                    "parent_task_id": parent_id,
                    "parent_task": parent,
                    "sidecar_id": sidecar_id,
                    "title": render_sidecar_template(str(template.get("title_template") or sidecar_id), variables),
                    "summary_zh": render_sidecar_template(str(template.get("summary_zh_template") or ""), variables),
                    "phase": str(parent.get("phase") or "Support"),
                    "depends_on": activation_dependencies,
                    "artifacts": artifact_targets,
                    "reviewer": reviewer,
                    "mutates_canonical": bool(template.get("mutates_canonical", False)),
                    "priority": task_phase_priority(parent, task_map, dependency_done_statuses),
                }
            )
    return candidates


def build_dynamic_sidecar_candidates(
    config: dict[str, Any],
    status: dict[str, Any],
    task_map: dict[str, dict[str, Any]],
    existing_signatures: set[str],
) -> list[dict[str, Any]]:
    settings = ready_dispatch_settings(config)
    dependency_done_statuses = {str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])}
    candidates: list[dict[str, Any]] = []
    for parent in status.get("tasks", []) or []:
        if task_is_sidecar(parent):
            continue
        parent_id = str(parent.get("id") or "").strip()
        if not parent_id or str(parent.get("status") or "").lower() == "done":
            continue
        kind = dynamic_sidecar_kind(parent)
        if kind not in {"review_packet", "acceptance_packet", "bff_handoff_packet"}:
            continue
        signature = f"{parent_id}:{kind}"
        if signature in existing_signatures:
            continue
        parent_status = str(parent.get("status") or "").lower()
        if kind in {"review_packet", "acceptance_packet"} and parent_status in {"todo", "backlog"} and not dependencies_satisfied(parent, task_map, dependency_done_statuses):
            continue
        activation_dependencies = [
            dep_id
            for dep_id in (parent.get("depends_on") or [])
            if task_map.get(dep_id) is None or str(task_map.get(dep_id, {}).get("status") or "").lower() in dependency_done_statuses
        ]
        if kind == "bff_handoff_packet" and parent.get("depends_on") and not activation_dependencies:
            continue
        reviewer = str(parent.get("owner") or "").strip()
        if not reviewer:
            continue
        sidecar_id = sidecar_task_id(parent_id, kind)
        title_by_kind = {
            "review_packet": f"Prepare {parent_id} review packet and evidence summary",
            "acceptance_packet": f"Prepare {parent_id} acceptance packet and dependency map",
            "bff_handoff_packet": f"Prepare {parent_id} BFF and frontend handoff packet",
        }
        summary_by_kind = {
            "review_packet": f"平行支援 {parent_id}，先整理 review packet、evidence summary 與 reviewer handoff，不改 canonical truth。",
            "acceptance_packet": f"平行支援 {parent_id}，先整理 acceptance checklist、dependency map 與 support packet，不改 canonical truth。",
            "bff_handoff_packet": f"平行支援 {parent_id}，先整理 BFF query gap、operator journey 與前端 handoff materials，不改 canonical truth。",
        }
        candidates.append(
            {
                "template_id": f"dynamic:{kind}",
                "kind": kind,
                "parent_task_id": parent_id,
                "parent_task": parent,
                "sidecar_id": sidecar_id,
                "title": title_by_kind[kind],
                "summary_zh": summary_by_kind[kind],
                "phase": str(parent.get("phase") or "Support"),
                "depends_on": activation_dependencies,
                "artifacts": [sidecar_support_artifact(parent_id, sidecar_id)],
                "reviewer": reviewer,
                "mutates_canonical": False,
                "priority": task_phase_priority(parent, task_map, dependency_done_statuses),
            }
        )
    return candidates


def create_sidecar_task(
    config: dict[str, Any],
    *,
    sidecar_id: str,
    owner: str,
    reviewer: str,
    phase: str,
    title: str,
    summary_zh: str,
    depends_on: list[str],
    artifacts: list[str],
    helper_parent: str,
    helper_kind: str,
    mutates_canonical: bool,
) -> tuple[bool, str]:
    script = config_path(config, "status_file").parent / "scripts" / "ai_status.py"
    metadata = {
        "task_class": "sidecar",
        "auto_generated": True,
        "helper_parent": helper_parent,
        "helper_kind": helper_kind,
        "mutates_canonical": mutates_canonical,
        "auto_created_by": "supervisor-underutilization",
    }
    env = os.environ.copy()
    env.update(
        {
            "AI_NAME": "Codex",
            "AI_STATUS_ROOT": str(config_path(config, "status_file").parent),
            "TASK_PHASE": phase,
            "TASK_TITLE": title,
            "TASK_SUMMARY_ZH": summary_zh,
            "TASK_DEPENDS_ON": ",".join(depends_on),
            "TASK_ARTIFACTS": ",".join(artifacts),
            "TASK_ACCEPTANCE": ",".join(
                [
                    "Create support artifacts only",
                    "Do not edit canonical truth",
                    "Hand off the packet to the assigned reviewer",
                ]
            ),
            "TASK_METADATA_JSON": json.dumps(metadata, ensure_ascii=False),
        }
    )
    result = subprocess.run(
        [sys.executable, str(script), "assign", sidecar_id, owner, reviewer],
        cwd=str(config_path(config, "status_file").parent),
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        return False, result.stderr.strip() or result.stdout.strip() or "unknown error"
    return True, ""


def redispatch_candidate_statuses(config: dict[str, Any]) -> set[str]:
    settings = ready_dispatch_settings(config)
    statuses = set(str(value).lower() for value in settings.get("review_statuses", []))
    statuses.update(str(value).lower() for value in settings.get("finalize_statuses", []))
    statuses.update(str(value).lower() for value in settings.get("owned_statuses", []))
    return statuses


def dependencies_satisfied(task: dict[str, Any], task_map: dict[str, dict[str, Any]], done_statuses: set[str]) -> bool:
    for dep_id in task.get("depends_on", []) or []:
        dep = task_map.get(dep_id)
        if dep is None:
            # Not in active task_map — treat as archived/done (consistent with ai_status.py)
            continue
        dep_status = str(dep.get("status") or "").lower()
        if dep_status not in done_statuses:
            return False
    return True


def task_dependency_signature(task: dict[str, Any], task_map: dict[str, dict[str, Any]]) -> str:
    parts: list[str] = []
    for dep_id in task.get("depends_on", []) or []:
        dep = task_map.get(dep_id)
        dep_status = str(dep.get("status") or "missing") if dep is not None else "archived"
        parts.append(f"{dep_id}:{dep_status}")
    return "|".join(parts)


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



def save_event_queue(config: dict[str, Any], events: list[dict[str, Any]]) -> None:
    path = config_path(config, "event_queue")
    payload = "".join(f"{json.dumps(event, ensure_ascii=False)}\n" for event in events)
    path.write_text(payload, encoding="utf-8")


def prune_event_queue(config: dict[str, Any], state: dict[str, Any]) -> bool:
    events = load_event_queue(config)
    if not events:
        return False
    task_map = task_index_from_status(config, load_status(config))
    active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    redispatch_statuses = redispatch_candidate_statuses(config)
    queue_events = state.setdefault("queue", {}).setdefault("events", {})
    kept: list[dict[str, Any]] = []
    kept_ids: set[str] = set()
    changed = False

    for event in events:
        event_id = event.get("event_id")
        if not event_id:
            changed = True
            continue

        record = queue_events.get(event_id, {})
        related_workers = [worker for worker in state.get("workers", {}).values() if worker.get("queue_event_id") == event_id]
        has_active_worker = any(worker.get("status") in active_statuses for worker in related_workers)
        skip_message = stale_dispatch_skip_message(config, event, task_map)

        if skip_message and not has_active_worker:
            completed = queue_status(state, event_id)
            completed["status"] = "completed"
            completed["processed_at"] = completed.get("processed_at") or utc_now()
            completed["skip_reason"] = "stale_dispatch_event"
            changed = True
            continue

        if not related_workers and record.get("status") in {"started", "manual_pending", "retry_backoff", "stalled"}:
            record["status"] = "queued"
            record.pop("processed_at", None)
            record.pop("error", None)
            changed = True
            kept.append(event)
            kept_ids.add(event_id)
            continue

        current_task = task_map.get(str(event.get("task_id") or ""))
        current_status = str(current_task.get("status") or "").lower() if current_task else ""

        if record.get("status") == "failed" and not has_active_worker and current_status in redispatch_statuses:
            changed = True
            continue

        if record.get("status") in {"completed", "failed"} and not has_active_worker:
            changed = True
            continue

        kept.append(event)
        kept_ids.add(event_id)

    if not changed:
        return False

    state.setdefault("queue", {}).setdefault("events", {})
    state["queue"]["events"] = {event_id: record for event_id, record in queue_events.items() if event_id in kept_ids}
    save_event_queue(config, kept)
    return True


def task_status_map(status: dict[str, Any]) -> dict[str, str]:
    return {str(task.get("id")): str(task.get("status") or "") for task in status.get("tasks", []) if task.get("id")}


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
    if reason not in {"review_ready_dispatch", "owned_finalize_dispatch", "owned_in_progress_dispatch", "owned_ready_dispatch"}:
        return None

    task_id = str(event.get("task_id") or "")
    task = task_map.get(task_id)
    if not task:
        return None

    schema = config.get("schema", {})
    owner_field = schema.get("assignee_field", "owner")
    reviewer_field = schema.get("reviewer_field", "reviewer")
    target_agent = str(event.get("target_display_name") or display_name_for(config, str(event.get("target_agent") or "")))
    settings = ready_dispatch_settings(config)
    review_statuses = {str(value).lower() for value in settings.get("review_statuses", ["review"])}
    finalize_statuses = {str(value).lower() for value in settings.get("finalize_statuses", ["review_approved"])}
    dependency_done_statuses = {str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])}
    task_status = str(task.get("status") or "").lower()

    eligible = False
    if reason == "review_ready_dispatch":
        eligible = task_status in review_statuses and task.get(reviewer_field) == target_agent
    elif reason == "owned_finalize_dispatch":
        eligible = task_status in finalize_statuses and task.get(owner_field) == target_agent
    elif reason == "owned_in_progress_dispatch":
        eligible = task_status == "in_progress" and task.get(owner_field) == target_agent and dependencies_satisfied(task, task_map, dependency_done_statuses)
    elif reason == "owned_ready_dispatch":
        eligible = task_status in {"todo", "backlog"} and task.get(owner_field) == target_agent and dependencies_satisfied(task, task_map, dependency_done_statuses)

    if not eligible:
        return None

    return str(build_dispatch_event(task, target_agent, reason, task_map).get("key") or "")


def dispatch_reason_priority(reason: str | None) -> int | None:
    normalized = str(reason or "")
    priorities = {
        "review_ready_dispatch": 0,
        "owned_finalize_dispatch": 1,
        "owned_in_progress_dispatch": 2,
        "owned_ready_dispatch": 3,
    }
    return priorities.get(normalized)


def dispatch_priority_for_task(
    config: dict[str, Any],
    task: dict[str, Any],
    agent_name: str,
    *,
    dependencies_done_statuses: set[str] | None = None,
) -> int | None:
    settings = ready_dispatch_settings(config)
    review_statuses = {str(value).lower() for value in settings.get("review_statuses", ["review"])}
    finalize_statuses = {str(value).lower() for value in settings.get("finalize_statuses", ["review_approved"])}
    dependency_done_statuses = dependencies_done_statuses or {
        str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])
    }
    schema = config.get("schema", {})
    owner_field = schema.get("assignee_field", "owner")
    reviewer_field = schema.get("reviewer_field", "reviewer")
    task_status = str(task.get("status") or "").lower()
    if task_status in review_statuses and task.get(reviewer_field) == agent_name:
        return 0
    if task_status in finalize_statuses and task.get(owner_field) == agent_name:
        return 1
    if (
        task_status == "in_progress"
        and task.get(owner_field) == agent_name
        and dependencies_satisfied(task, {str(task.get("id") or ""): task}, dependency_done_statuses)
    ):
        return 2
    if (
        task_status in {"todo", "backlog"}
        and task.get(owner_field) == agent_name
        and dependencies_satisfied(task, {str(task.get("id") or ""): task}, dependency_done_statuses)
    ):
        return 3
    return None


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


def choose_helper_claim_agent(
    config: dict[str, Any],
    *,
    task: dict[str, Any],
    owner_name: str,
    reviewer_name: str,
    idle_agent_name: str,
    agent_loads: dict[str, list[int]],
    helper_settings: dict[str, Any],
    state: dict[str, Any] | None = None,
) -> bool:
    if not helper_settings.get("enabled", True):
        return False
    review_statuses = {str(value).lower() for value in ready_dispatch_settings(config).get("review_statuses", ["review"])}
    finalize_statuses = {str(value).lower() for value in ready_dispatch_settings(config).get("finalize_statuses", ["review_approved"])}
    dependency_done_statuses = {
        str(value).lower() for value in ready_dispatch_settings(config).get("dependency_done_statuses", ["done"])
    }
    plan = proactive_claim_plan_for_idle_agent(
        config,
        task=task,
        task_map={str(task.get("id") or ""): task},
        idle_agent_name=idle_agent_name,
        idle_agent_names=[idle_agent_name],
        agent_loads=agent_loads,
        helper_settings=helper_settings,
        review_statuses=review_statuses,
        finalize_statuses=finalize_statuses,
        dependency_done_statuses=dependency_done_statuses,
        state=state,
    )
    return plan is not None


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
    review_statuses = {str(value).lower() for value in settings.get("review_statuses", ["review"])}
    finalize_statuses = {str(value).lower() for value in settings.get("finalize_statuses", ["review_approved"])}
    dependency_done_statuses = {str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])}
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
        task_status = str(task.get("status") or "").lower()
        candidate_priority = None
        candidate_reason = None
        if task_status in review_statuses and task.get(reviewer_field) == agent_name:
            candidate_priority = 0
            candidate_reason = "review_ready_dispatch"
        elif task_status in finalize_statuses and task.get(owner_field) == agent_name:
            candidate_priority = 1
            candidate_reason = "owned_finalize_dispatch"
        elif (
            task_status == "in_progress"
            and task.get(owner_field) == agent_name
            and dependencies_satisfied(task, task_map, dependency_done_statuses)
        ):
            candidate_priority = 2
            candidate_reason = "owned_in_progress_dispatch"
        elif (
            task_status in {"todo", "backlog"}
            and task.get(owner_field) == agent_name
            and dependencies_satisfied(task, task_map, dependency_done_statuses)
        ):
            candidate_priority = 3
            candidate_reason = "owned_ready_dispatch"

        if candidate_priority is None or candidate_reason is None or candidate_priority >= current_priority:
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
    settings = ready_dispatch_settings(config)
    review_statuses = {str(value).lower() for value in settings.get("review_statuses", ["review"])}
    finalize_statuses = {str(value).lower() for value in settings.get("finalize_statuses", ["review_approved"])}
    owned_statuses = {str(value).lower() for value in settings.get("owned_statuses", ["in_progress", "todo", "backlog"])}
    dependency_done_statuses = {str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])}
    schema = config.get("schema", {})
    owner_field = schema.get("assignee_field", "owner")
    reviewer_field = schema.get("reviewer_field", "reviewer")
    task_status = str(task.get("status") or "").lower()
    if task_status in dependency_done_statuses:
        return False
    if task_status in review_statuses:
        return task.get(reviewer_field) == agent_name
    if task_status in finalize_statuses:
        return task.get(owner_field) == agent_name
    if task_status in owned_statuses:
        return task.get(owner_field) == agent_name
    return False


def stale_dispatch_skip_message(config: dict[str, Any], event: dict[str, Any], task_map: dict[str, dict[str, Any]]) -> str | None:
    reason = str(event.get("reason") or "")
    if reason not in {"review_ready_dispatch", "owned_finalize_dispatch", "owned_in_progress_dispatch", "owned_ready_dispatch"}:
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
    return json.dumps(
        {
            "task_id": task.get("id"),
            "status": task.get("status"),
            "reason": reason,
            "owner": task.get("owner"),
            "reviewer": task.get("reviewer"),
            "last_update": task.get("last_update"),
            "depends_on": list(task.get("depends_on", []) or []),
            "dependency_signature": task_dependency_signature(task, task_map),
        },
        sort_keys=True,
        ensure_ascii=True,
    )


def build_dispatch_event(task: dict[str, Any], target_agent: str, reason: str, task_map: dict[str, dict[str, Any]]) -> dict[str, Any]:
    task_payload = {
        "id": task.get("id"),
        "artifacts": list(task.get("artifacts", []) or []),
        "next": task.get("next"),
    }
    for key in (
        "task_class",
        "auto_generated",
        "helper_parent",
        "helper_kind",
        "mutates_canonical",
        "auto_created_by",
    ):
        if key in task:
            task_payload[key] = task.get(key)
    signature = ready_dispatch_signature(task, reason, task_map)
    return {
        "key": f"dispatcher:{target_agent}:{task.get('id')}:{reason}:{signature}",
        "task_id": task.get("id"),
        "target_agent": target_agent,
        "reason": reason,
        "task": task_payload,
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


def chair_review_output_paths(config: dict[str, Any], agent_name: str) -> tuple[Path, Path]:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slug = normalize_agent_id(agent_name) or "chair"
    review_dir = chair_review_dir(config)
    return review_dir / f"{stamp}-{slug}.md", review_dir / f"{stamp}-{slug}.json"


def pending_approval_items(approval_state: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        item
        for item in approval_state.get("pending", []) or []
        if str(item.get("status") or "pending") == "pending" and not item.get("decision")
    ]


def blocked_task_triage_kind(task: dict[str, Any]) -> str:
    text = " ".join(
        str(value or "")
        for value in (
            task.get("id"),
            task.get("title"),
            task.get("summary_zh"),
            task.get("next"),
            " ".join(str(item or "") for item in (task.get("artifacts") or [])),
        )
    ).lower()
    if task_is_sidecar(task):
        return "sidecar_parent_blocked"
    if any(
        marker in text
        for marker in (
            "commit",
            "branch",
            "worktree",
            "task-scoped",
            "history",
            "head moved",
            "pre-commit",
            "push",
        )
    ):
        return "history_repair"
    if any(
        marker in text
        for marker in (
            "contract",
            "discussion_planning",
            "canonical",
            "scope decision",
            "cost-center",
            "approval-rule",
            "quota contract",
            "product",
        )
    ):
        return "planning_decision"
    return "manual_unblock"


def dependency_ready_blocked_task_records(
    config: dict[str, Any],
    status: dict[str, Any] | None,
    *,
    include_sidecars: bool = False,
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
        if task_is_sidecar(task) and not include_sidecars:
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
    for item in repeated_failure_records(state)[:6]:
        failure_lines.append(
            f"- {item.get('task_id')}: role={item.get('role')} agent={item.get('agent')} count={item.get('count')}/{item.get('threshold')} kind={item.get('last_failure_kind')}"
        )
    if not failure_lines:
        failure_lines.append("- none")

    provider_lines: list[str] = []
    for item in active_provider_pause_records(state)[:8]:
        resume = item.get("resume_at")
        resume_text = f" resume_at={resume}" if resume is not None else ""
        provider_lines.append(
            f"- {item.get('agent_id')}: kind={item.get('kind')} paused_at={item.get('paused_at') or '-'}{resume_text} reason={brief_reason_text(item.get('reason'), max_length=180)}"
        )
    if not provider_lines:
        provider_lines.append("- none")

    dispatchable_provider_lines: list[str] = []
    report = provider_report if isinstance(provider_report, dict) else {}
    now_ts = datetime.now(timezone.utc).timestamp()
    pauses = provider_pause_registry(state)
    for agent_id, agent in (config.get("agents", {}) or {}).items():
        display_name = str(agent.get("display_name") or agent.get("name") or agent_id).strip()
        normalized = normalize_agent_id(agent_id)
        if not display_name or display_name_is_legacy_alias(display_name):
            continue
        pause = pauses.get(normalized)
        if isinstance(pause, dict):
            resume_at = pause.get("resume_at")
            try:
                resume_ts = float(resume_at) if resume_at is not None else None
            except (TypeError, ValueError):
                resume_ts = None
            if str(pause.get("kind") or "") == "auth" or resume_ts is None or resume_ts > now_ts:
                continue
        provider_info = provider_info_for_agent(config, report, normalized)
        adapter_info = (report.get("agent_adapters", {}) or {}).get(normalized, {})
        if provider_info.get("auth_ready") is False:
            continue
        if provider_info.get("local_cli_worker_supported") is False and adapter_info.get("can_auto_deliver") is False:
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
    for item in actionable_dispatch_pause_records(state):
        blocked_until = item.get("blocked_until") or "-"
        dispatch_pause_lines.append(
            f"- task={item.get('task_id')} provider={item.get('provider') or '-'} kind={item.get('failure_kind') or '-'} paused_at={item.get('paused_at') or '-'} blocked_until={blocked_until} summary={brief_reason_text(item.get('summary'), max_length=180)}"
        )
    if not dispatch_pause_lines:
        dispatch_pause_lines.append("- none")

    blocked_task_lines: list[str] = []
    for item in dependency_ready_blocked_task_records(config, status, include_sidecars=False):
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
        '  "decision": "approve_sidecars",\n'
        '  "sidecar_approved": true,\n'
        '  "approval_ttl_minutes": 45,\n'
        '  "max_sidecars": 2,\n'
        '  "reason": "why",\n'
        '  "blocked_by": [],\n'
        '  "blocked_sidecar_parents": [],\n'
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
        "- `approval_ttl_minutes` 與 `max_sidecars` 必須是整數；即使 `sidecar_approved=false` 也不要填 `null`。\n"
        "- reassignment_actions 必須使用 `role` 與 `reason`；不要用 `field` / `rationale`。\n"
        "- reviewer 改派只允許 `todo` / `in_progress` / `review` 狀態，用來維持 owner/reviewer 分離或處理 review 交接。\n"
        "- owner 改派只允許 `backlog` / `todo` / `in_progress` / `review_approved`；若是 `backlog` / `todo` / `in_progress`，代表重開成 `todo` 重新派工。\n"
        "- `task_actions` 目前只允許 `dispatch_now` / `create_unblock_task` / `resume_parent_task`；不能繞過 dependency gate 或 commit gate。\n"
        "- `dispatch_now` 只能對 machine truth 已符合派工條件的非 blocked 任務觸發。\n"
        "- `create_unblock_task` 只能用在下方 Dependency-ready blocked tasks；它會建立 task-scoped unblock child task，不會直接把 parent 從 blocked 改成 todo/done。\n"
        "- `resume_parent_task` 只能用在已經有 completed unblock child 的 blocked parent；它會把 parent 轉回可派工狀態，讓 owner 繼續主線執行。\n"
        "- blocked task 若是 branch/commit/worktree/push 污染，`unblock_kind=history_repair`；若是 product/contract/canonical 決策缺口，`unblock_kind=planning_decision`；其他才用 `manual_unblock`。\n"
        "- 若 Chair review reason 是 `blocked_task_triage`，不可只評論；每個 listed blocked task 都要依摘要建議採取 `create_unblock_task` 或 `resume_parent_task`，讓 machine truth 真正往前走。\n"
        "- `provider_actions` 目前只允許 `pause` / `clear_pause`，只針對 exact lane 生效；暫停原因必須具體；不要重複 pause 已在 Provider lane pauses 列出的 lane，除非你要改變其狀態。\n"
        "- 若 Chair review reason 是 `approval_triage`，Pending approvals 不可只評論；每一個 pending approval 都必須在 `approval_actions` 中明確 `allow` 或 `deny`，並寫具體 reason。\n"
        "- `approval_actions` 必須使用 `decision` 欄位，不要用 `action`；格式是 `{\"approval_id\":\"...\",\"decision\":\"allow|deny\",\"reason\":\"...\"}`。\n"
        "- `approval_triage` 只處理 approval；不要輸出 `provider_actions`。Provider 狀態放在 recommended_focus，等 `provider_health_triage` 再改 lane。\n"
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
    if repeated_failure_records(state):
        return "reassignment_triage"
    if config is not None and dependency_ready_blocked_task_records(config, status, include_sidecars=False, limit=1):
        return "blocked_task_triage"
    if active_provider_pause_records(state) or actionable_dispatch_pause_records(state, limit=1):
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
    task_map = task_index_from_status(config, status)
    failing_agents = failing_agents_in_reassignment_loops(state)
    candidates: list[tuple[str, str]] = []
    primary_work_candidates: list[tuple[str, str]] = []
    for agent_id, agent in (config.get("agents", {}) or {}).items():
        display_name = str(agent.get("display_name") or agent.get("name") or agent_id).strip()
        if not display_name or "legacy alias" in display_name.lower():
            continue
        normalized = normalize_agent_id(agent_id)
        if normalized in active_agents or normalized in pending_agents:
            continue
        if is_agent_dispatch_paused(config, state, agent_id, provider_report=provider_report):
            continue
        if display_name in failing_agents:
            continue
        if agent_has_dispatchable_primary_work(config, status, display_name, task_map):
            if allow_primary_work_fallback:
                primary_work_candidates.append((normalized, display_name))
            continue
        candidates.append((normalized, display_name))
    if not candidates and allow_primary_work_fallback:
        candidates = primary_work_candidates
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
    ready_blocked_tasks = dependency_ready_blocked_task_records(config, status, include_sidecars=False, limit=1)
    reason = chair_review_reason(state, approval_state, status=status, config=config)
    if reason is None:
        return False
    immediate_attention = bool(chair_review_needs_immediate_attention(state) or ready_blocked_tasks)
    bypass_cooldown = bool(pending_approval_items(approval_state) or immediate_attention)
    cooldown_until = _parse_iso_utc(chair_state.get("cooldown_until"))
    now = datetime.now(timezone.utc)
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
    for item in repeated_failure_records(state):
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
    chair_state["active_review"] = {
        "agent_id": agent_id,
        "agent": display_name,
        "reason": reason,
        "requested_at": utc_now(),
        "queue_event_id": queue_payload["event_id"],
        "markdown_path": str(markdown_path),
        "json_path": str(json_path),
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


def _validate_string_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def normalize_chair_approval_action(action: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(action)
    if not str(normalized.get("decision") or "").strip() and str(normalized.get("action") or "").strip():
        normalized["decision"] = normalized.get("action")
    return normalized


def normalize_chair_reassignment_action(action: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(action)
    if not str(normalized.get("role") or "").strip() and str(normalized.get("field") or "").strip():
        normalized["role"] = normalized.get("field")
    if not str(normalized.get("from") or "").strip():
        normalized["from"] = normalized.get("from_agent") or normalized.get("fromAgent")
    if not str(normalized.get("to") or "").strip():
        normalized["to"] = normalized.get("to_agent") or normalized.get("toAgent")
    if not str(normalized.get("reason") or "").strip() and str(normalized.get("rationale") or "").strip():
        normalized["reason"] = normalized.get("rationale")
    return normalized


def normalize_chair_review_payload_defaults(config: dict[str, Any], payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload
    normalized = dict(payload)
    settings = chair_review_settings(config)
    if normalized.get("approval_ttl_minutes") is None:
        normalized["approval_ttl_minutes"] = int(settings.get("default_approval_ttl_minutes", 45))
    if normalized.get("max_sidecars") is None:
        normalized["max_sidecars"] = int(settings.get("default_max_sidecars", 2))
    return normalized


def normalize_chair_review_payload_for_reason(payload: Any, *, reason: str | None) -> Any:
    if not isinstance(payload, dict):
        return payload
    normalized = dict(payload)
    if reason == "approval_triage" and normalized.get("provider_actions"):
        # Approval triage must not mutate provider state, but a noisy chairman
        # response should not block safe approval decisions from being applied.
        normalized["provider_actions"] = []
    return normalized


def validate_chair_review_payload(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return "payload must be an object"
    missing = [key for key in CHAIR_REVIEW_OUTPUT_KEYS if key not in payload]
    if missing:
        return f"missing keys: {', '.join(sorted(missing))}"
    if payload.get("version") != 1:
        return "version must be 1"
    if not isinstance(payload.get("decision"), str):
        return "decision must be a string"
    if not isinstance(payload.get("sidecar_approved"), bool):
        return "sidecar_approved must be a boolean"
    approval_ttl_minutes = payload.get("approval_ttl_minutes")
    max_sidecars = payload.get("max_sidecars")
    if payload.get("sidecar_approved") and not isinstance(approval_ttl_minutes, int):
        return "approval_ttl_minutes must be an integer when sidecar_approved is true"
    if approval_ttl_minutes is not None and not isinstance(approval_ttl_minutes, int):
        return "approval_ttl_minutes must be an integer or null"
    if payload.get("sidecar_approved") and not isinstance(max_sidecars, int):
        return "max_sidecars must be an integer when sidecar_approved is true"
    if max_sidecars is not None and not isinstance(max_sidecars, int):
        return "max_sidecars must be an integer or null"
    if not isinstance(payload.get("reason"), str):
        return "reason must be a string"
    if not _validate_string_list(payload.get("blocked_by")):
        return "blocked_by must be a string list"
    if not _validate_string_list(payload.get("blocked_sidecar_parents")):
        return "blocked_sidecar_parents must be a string list"
    if not isinstance(payload.get("approval_actions"), list):
        return "approval_actions must be a list"
    if not isinstance(payload.get("reassignment_actions"), list):
        return "reassignment_actions must be a list"
    if not isinstance(payload.get("task_actions"), list):
        return "task_actions must be a list"
    if not isinstance(payload.get("provider_actions"), list):
        return "provider_actions must be a list"
    if not _validate_string_list(payload.get("recommended_focus")):
        return "recommended_focus must be a string list"
    for action in payload.get("approval_actions", []):
        if not isinstance(action, dict):
            return "approval_actions items must be objects"
        normalized = normalize_chair_approval_action(action)
        if normalized.get("decision") not in {"allow", "deny"}:
            return "approval_actions decision must be allow or deny"
        if not isinstance(normalized.get("approval_id"), str) or not isinstance(normalized.get("reason"), str):
            return "approval_actions require approval_id and reason strings"
        if "remember" in normalized and not isinstance(normalized.get("remember"), bool):
            return "approval_actions remember must be a boolean"
    for action in payload.get("reassignment_actions", []):
        if not isinstance(action, dict):
            return "reassignment_actions items must be objects"
        normalized = normalize_chair_reassignment_action(action)
        if normalized.get("role") not in {"owner", "reviewer"}:
            return "reassignment_actions role must be owner or reviewer"
        required = ("task_id", "from", "to", "reason")
        if any(not isinstance(normalized.get(key), str) or not str(normalized.get(key)).strip() for key in required):
            return "reassignment_actions require task_id/from/to/reason strings"
    for action in payload.get("task_actions", []):
        if not isinstance(action, dict):
            return "task_actions items must be objects"
        if action.get("action") not in {"dispatch_now", "create_unblock_task", "resume_parent_task"}:
            return "task_actions action must be dispatch_now, create_unblock_task, or resume_parent_task"
        required = ("task_id", "reason")
        if any(not isinstance(action.get(key), str) or not str(action.get(key)).strip() for key in required):
            return "task_actions require task_id/reason strings"
        if "target_agent" in action and (
            not isinstance(action.get("target_agent"), str) or not str(action.get("target_agent")).strip()
        ):
            return "task_actions target_agent must be a non-empty string when provided"
        if "reviewer" in action and (
            not isinstance(action.get("reviewer"), str) or not str(action.get("reviewer")).strip()
        ):
            return "task_actions reviewer must be a non-empty string when provided"
        if "unblock_kind" in action and (
            not isinstance(action.get("unblock_kind"), str) or not str(action.get("unblock_kind")).strip()
        ):
            return "task_actions unblock_kind must be a non-empty string when provided"
        if "resume_status" in action and str(action.get("resume_status") or "").strip().lower() not in {
            "backlog",
            "todo",
            "in_progress",
        }:
            return "task_actions resume_status must be backlog, todo, or in_progress when provided"
    for action in payload.get("provider_actions", []):
        if not isinstance(action, dict):
            return "provider_actions items must be objects"
        if action.get("action") not in {"pause", "clear_pause"}:
            return "provider_actions action must be pause or clear_pause"
        if not isinstance(action.get("agent"), str) or not str(action.get("agent")).strip():
            return "provider_actions require agent string"
        if action.get("action") == "pause":
            if action.get("kind") not in {"auth", "quota", "capacity", "manual"}:
                return "provider_actions pause kind must be auth, quota, capacity, or manual"
            if not isinstance(action.get("reason"), str) or not str(action.get("reason")).strip():
                return "provider_actions pause requires reason string"
            if "reset_seconds" in action and action.get("reset_seconds") is not None and not isinstance(action.get("reset_seconds"), int):
                return "provider_actions reset_seconds must be an integer or null"
        if action.get("action") == "clear_pause" and "reason" in action and not isinstance(action.get("reason"), str):
            return "provider_actions clear_pause reason must be a string when provided"
    return None


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
                str(normalize_chair_approval_action(action).get("approval_id") or "").strip()
                for action in payload.get("approval_actions", []) or []
                if isinstance(action, dict)
                and normalize_chair_approval_action(action).get("decision") in {"allow", "deny"}
                and str(normalize_chair_approval_action(action).get("approval_id") or "").strip()
            }
            missing = [approval_id for approval_id in pending_ids if approval_id not in action_ids]
            if missing:
                return f"approval_triage must resolve pending approvals: {', '.join(missing[:6])}"
    if reason == "blocked_task_triage" and config is not None:
        ready_blocked = dependency_ready_blocked_task_records(config, status, include_sidecars=False)
        if ready_blocked:
            action_index: dict[str, set[str]] = {}
            for action in payload.get("task_actions", []) or []:
                if not isinstance(action, dict):
                    continue
                task_id = str(action.get("task_id") or "").strip()
                action_name = str(action.get("action") or "").strip()
                if not task_id or not action_name:
                    continue
                action_index.setdefault(task_id, set()).add(action_name)
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
    try:
        from permission_broker import classify_command
    except Exception:
        classify_command = None
    if classify_command is not None and classify_command(normalized) == "allow":
        return True
    verify_prefixes = (
        "pytest",
        "python3 -m pytest",
        "python3 -m unittest",
        "npm test",
        "npm run test",
        "pnpm test",
        "go test",
        "cargo test",
    )
    return normalized.startswith(verify_prefixes)


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
        action = normalize_chair_approval_action(action)
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
    action = normalize_chair_reassignment_action(action)
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
    status_path = config_path(config, "status_file")
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
    timestamp = utc_now()
    if role == "reviewer":
        if str(task.get("status") or "").lower() not in {"todo", "in_progress", "review"}:
            return False
        if str(task.get("reviewer") or "") != from_agent:
            return False
        task["reviewer"] = to_agent
    else:
        if str(task.get("status") or "").lower() not in {"backlog", "todo", "in_progress", "review_approved"}:
            return False
        if str(task.get("owner") or "") != from_agent:
            return False
        task["owner"] = to_agent
        if str(task.get("status") or "").lower() in {"backlog", "todo", "in_progress"}:
            task["status"] = "todo"
    task["last_update"] = timestamp
    task["next"] = brief_reason_text(f"Chairman reassigned {role} from {from_agent} to {to_agent}: {reason}", max_length=280)
    for handoff in status.get("handoffs", []) or []:
        if handoff.get("task_id") != task_id or handoff.get("status") == "done":
            continue
        if str(handoff.get("to") or "") == from_agent:
            handoff["status"] = "done"
            handoff["resolved_at"] = timestamp
    status.setdefault("handoffs", []).append(
        {
            "task_id": task_id,
            "from": from_agent,
            "to": to_agent,
            "message": task["next"],
            "status": "pending",
            "created_at": timestamp,
        }
    )
    write_json(status_path, status)
    if not sync_status_pipeline(config):
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
            "message": task["next"],
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
        if normalize_chair_reassignment_action(action).get("role") == "reviewer"
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
    settings = ready_dispatch_settings(config)
    review_statuses = {str(value).lower() for value in settings.get("review_statuses", ["review"])}
    finalize_statuses = {str(value).lower() for value in settings.get("finalize_statuses", ["review_approved"])}
    dependency_done_statuses = {str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])}
    status_value = str(task.get("status") or "").lower()
    owner = str(task.get("owner") or "").strip()
    reviewer = str(task.get("reviewer") or "").strip()

    if status_value in review_statuses and reviewer:
        return reviewer, "review_ready_dispatch"
    if status_value in finalize_statuses and owner:
        return owner, "owned_finalize_dispatch"
    if status_value == "in_progress" and owner and dependencies_satisfied(task, task_map, dependency_done_statuses):
        return owner, "owned_in_progress_dispatch"
    if status_value in {"todo", "backlog"} and owner and dependencies_satisfied(task, task_map, dependency_done_statuses):
        return owner, "owned_ready_dispatch"
    return None


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
    if parent is None or str(parent.get("status") or "").lower() != "blocked" or task_is_sidecar(parent):
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

    script = config_path(config, "status_file").parent / "scripts" / "ai_status.py"
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
    env = os.environ.copy()
    env.update(
        {
            "AI_NAME": "Codex",
            "AI_STATUS_ROOT": str(config_path(config, "status_file").parent),
            "TASK_PHASE": str(parent.get("phase") or "Blocked Task Unblock"),
            "TASK_TITLE": title_by_kind[unblock_kind],
            "TASK_SUMMARY_ZH": summary_by_kind[unblock_kind],
            "TASK_DEPENDS_ON": ",".join(str(dep) for dep in (parent.get("depends_on") or [])),
            "TASK_ARTIFACTS": f"support/unblock/{parent_id}/{unblock_id}.md",
            "TASK_ACCEPTANCE": ",".join(unblock_task_acceptance(unblock_kind)),
            "TASK_METADATA_JSON": json.dumps(metadata, ensure_ascii=False),
        }
    )
    result = subprocess.run(
        [sys.executable, str(script), "assign", unblock_id, owner, reviewer],
        cwd=str(config_path(config, "status_file").parent),
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        write_activity_log(
            config,
            {
                "type": "chair_unblock_task_create_failed",
                "task_id": parent_id,
                "unblock_task_id": unblock_id,
                "message": result.stderr.strip() or result.stdout.strip() or "unknown error",
            },
        )
        return False

    status = load_status(config)
    task_map = task_index_from_status(config, status)
    unblock_task = task_map.get(unblock_id)
    if unblock_task is not None:
        state.setdefault("tasks", {})[unblock_id] = snapshot_task(unblock_task, config.get("schema", {}))
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

    status_path = config_path(config, "status_file")
    status = load_status(config)
    task_map = task_index_from_status(config, status)
    parent = task_map.get(task_id)
    if parent is None or str(parent.get("status") or "").lower() != "blocked" or task_is_sidecar(parent):
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

    timestamp = utc_now()
    helper_id = str(completed_helper.get("id") or "").strip()
    parent["status"] = resume_status
    parent["last_update"] = timestamp
    parent["next"] = brief_reason_text(f"Chairman resumed after {helper_id}: {chair_reason}", max_length=280)
    parent.pop("waiting_for", None)

    for blocker in status.get("blockers", []) or []:
        if blocker.get("task_id") == task_id and blocker.get("status") == "open":
            blocker["status"] = "resolved"
            blocker["resolved_at"] = timestamp

    write_json(status_path, status)
    if not sync_status_pipeline(config):
        return False

    write_activity_log(
        config,
        {
            "type": "chair_parent_resume_applied",
            "task_id": task_id,
            "helper_task_id": helper_id,
            "resume_status": resume_status,
            "message": parent["next"],
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
    if task_waiting_on_chair_reassignment(state, task, reason=dispatch_reason, target_agent=target_agent):
        return False

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
        existing = provider_pause_registry(state).get(agent_id)
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
            if kind == "quota":
                state.setdefault("quota_paused_agents", {})[agent_id] = {
                    "reason": reason,
                    "resume_at": existing.get("resume_at"),
                    "paused_at": existing.get("paused_at"),
                }
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
    existing = provider_pause_registry(state).get(agent_id)
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
    if agent_id in provider_pause_registry(state) or agent_id in state.setdefault("quota_paused_agents", {}):
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


def chair_provider_pause_reason_is_actionable(kind: str, reason: str) -> bool:
    if kind != "auth":
        return True
    lowered = reason.lower()
    non_actionable_markers = (
        "investigate",
        "verify ",
        "garbled",
        "erroneous",
        "propagat",
        "cross-lane",
        "not a real",
        "mentioned",
        "citing",
    )
    if any(marker in lowered for marker in non_actionable_markers):
        return False
    concrete_auth_markers = (
        "failed to authenticate",
        "authentication_error",
        "invalid authentication credentials",
        "status: 401",
        "api error: 401",
        "error authenticating:",
        "ineligibletiererror:",
        "restricted_dasher_user",
    )
    return any(marker in lowered for marker in concrete_auth_markers)


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

    def invalidate(reason: str) -> bool:
        chair_state["active_review"] = None
        chair_state["cooldown_until"] = None
        write_activity_log(
            config,
            {
                "type": "chair_review_invalid_schema",
                "message": reason,
                "target_agent": active.get("agent"),
                "queue_event_id": queue_event_id or None,
            },
        )
        return True

    if json_path.exists():
        payload = load_json(json_path, default=None)
        payload = normalize_chair_review_payload_defaults(config, payload)
        payload = normalize_chair_review_payload_for_reason(payload, reason=str(active.get("reason") or ""))
        error = validate_chair_review_payload(payload)
        if not error and isinstance(payload, dict):
            error = validate_chair_review_context(
                payload,
                reason=str(active.get("reason") or ""),
                approval_state=safe_load_approval_state(config),
                config=config,
                status=load_status(config),
            )
        if not markdown_path.exists():
            error = error or "markdown report missing"
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
        ttl_minutes = int(payload.get("approval_ttl_minutes") or chair_review_settings(config).get("default_approval_ttl_minutes", 45))
        if bool(payload.get("sidecar_approved")):
            chair_state["sidecar_approved_until"] = (
                datetime.now(timezone.utc) + timedelta(minutes=max(1, ttl_minutes))
            ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        else:
            chair_state["sidecar_approved_until"] = None
        chair_state["max_sidecars"] = int(payload.get("max_sidecars") or chair_review_settings(config).get("default_max_sidecars", 2))
        chair_state["blocked_sidecar_parents"] = list(payload.get("blocked_sidecar_parents", []) or [])
        chair_state["last_review_at"] = now
        chair_state["last_reviewer"] = active.get("agent")
        chair_state["last_reason"] = active.get("reason")
        chair_state["last_decision"] = payload
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
        return invalidate(f"Chair review from {active.get('agent')} lost its queue event before completion.")
    if record.get("status") not in {"completed", "failed"}:
        return False
    return invalidate(f"Chair review from {active.get('agent')} finished without producing the required JSON report.")


def dispatch_ready_tasks(
    config: dict[str, Any],
    state: dict[str, Any],
    provider_report: dict[str, Any] | None = None,
) -> bool:
    settings = ready_dispatch_settings(config)
    if not settings.get("enabled", True):
        return False

    status = load_status(config)
    schema = config.get("schema", {})
    tasks_path = schema.get("tasks_path", "tasks")
    task_id_field = schema.get("task_id_field", "id")
    owner_field = schema.get("assignee_field", "owner")
    reviewer_field = schema.get("reviewer_field", "reviewer")

    tasks = [task for task in status.get(tasks_path, []) if task.get(task_id_field)]
    task_map = {task.get(task_id_field): task for task in tasks}
    review_statuses = {str(value).lower() for value in settings.get("review_statuses", ["review"])}
    finalize_statuses = {str(value).lower() for value in settings.get("finalize_statuses", ["review_approved"])}
    owned_statuses = [str(value).lower() for value in settings.get("owned_statuses", ["in_progress", "todo", "backlog"])]
    dependency_done_statuses = {str(value).lower() for value in settings.get("dependency_done_statuses", ["done"])}
    active_statuses = {str(value) for value in settings.get("active_worker_statuses", [])}
    max_dispatches_per_tick = max(1, int(settings.get("max_dispatches_per_tick", 4)))
    provider_report = provider_report or load_provider_report(config)

    agent_ids = list(config.get("agents", {}).keys())
    active_agents, active_task_agents = active_worker_indexes(state, active_statuses)
    pending_agents, pending_task_agents, pending_event_keys = outstanding_delivery_indexes(config, state)
    active_agent_counts = active_worker_agent_counts(state, active_statuses)
    pending_agent_counts = outstanding_delivery_agent_counts(config, state)
    active_task_ids = {task_id for task_id, _agent_id in active_task_agents if task_id}
    pending_task_ids = {task_id for task_id, _agent_id in pending_task_agents if task_id}
    agent_loads = agent_dispatch_loads(config, state, active_statuses)
    helper_settings = helper_claim_settings(config)
    seen = state.setdefault("seen_event_keys", {})
    idle_agent_names: list[str] = []
    for agent_id in agent_ids:
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

    changed = False
    dispatches = 0
    for agent_id in agent_ids:
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
        for index, task in enumerate(tasks):
            task_id = str(task.get(task_id_field) or "")
            if not task_id:
                continue
            task_status = str(task.get("status") or "").lower()
            task_owner = task.get(owner_field)
            task_reviewer = task.get(reviewer_field)

            if (task_id, agent_id) in active_task_agents or (task_id, agent_id) in pending_task_agents:
                continue
            if not task_is_dispatch_eligible_for_agent(task, target_agent):
                continue

            reason = None
            priority = None
            if task_status in review_statuses and task_reviewer == target_agent:
                reason = "review_ready_dispatch"
                priority = 0
            elif task_status in finalize_statuses and task_owner == target_agent:
                reason = "owned_finalize_dispatch"
                priority = 1
            elif task_status == "in_progress" and task_owner == target_agent and dependencies_satisfied(task, task_map, dependency_done_statuses):
                reason = "owned_in_progress_dispatch"
                priority = 2
            elif task_status in {"todo", "backlog"} and task_owner == target_agent and dependencies_satisfied(task, task_map, dependency_done_statuses):
                reason = "owned_ready_dispatch"
                priority = 3

            if reason and task_waiting_on_chair_reassignment(state, task, reason=reason, target_agent=target_agent):
                continue

            helper_claim_allowed_statuses = {str(v).lower() for v in helper_settings.get("task_statuses", ["backlog", "todo", "in_progress", "review", "review_approved"])}
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
                    review_statuses=review_statuses,
                    finalize_statuses=finalize_statuses,
                    dependency_done_statuses=dependency_done_statuses,
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
                    claim_reason = helper_claim_plan["reason"]
                    event = build_dispatch_event(task, target_agent, claim_reason, task_map)
                    if event["key"] not in pending_event_keys and queue_delivery_event(config, event):
                        seen[event["key"]] = utc_now()
                        pending_event_keys.add(event["key"])
                        pending_agents.add(agent_id)
                        pending_agent_counts[agent_id] = pending_agent_counts.get(agent_id, 0) + 1
                        lane_load += 1
                        active_task_ids.add(task_id)
                        changed = True
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

        candidates.sort(key=lambda item: (item[0], item[1]))
        available_slots = max(0, lane_capacity - lane_load)
        for _, _, task, reason in candidates[:available_slots]:
            event = build_dispatch_event(task, target_agent, reason, task_map)
            if queue_delivery_event(config, event):
                seen[event["key"]] = utc_now()
                pending_event_keys.add(event["key"])
                pending_agents.add(agent_id)
                pending_agent_counts[agent_id] = pending_agent_counts.get(agent_id, 0) + 1
                lane_load += 1
                changed = True
                dispatches += 1
                if dispatches >= max_dispatches_per_tick:
                    break

    return changed


def dispatch_underutilization_sidecars(config: dict[str, Any], state: dict[str, Any]) -> bool:
    settings = underutilization_settings(config)
    tracking = state.setdefault("underutilization", {})
    chair_state = state.setdefault("chair_review", {})
    productive_statuses = {str(value) for value in settings.get("productive_worker_statuses", [])}
    ratio = utilization_ratio_for_sidecars(config, state, productive_statuses)
    threshold = float(settings.get("threshold_ratio", 0.5))
    now = utc_now()
    tracking["last_ratio"] = round(ratio, 4)
    changed = False

    if not settings.get("enabled", True):
        tracking["below_threshold_since"] = None
        return changed

    if ratio >= threshold:
        if tracking.get("below_threshold_since") is not None:
            tracking["below_threshold_since"] = None
            changed = True
        return changed

    if not tracking.get("below_threshold_since"):
        tracking["below_threshold_since"] = now
        return True

    below_since = _parse_iso_utc(tracking.get("below_threshold_since"))
    current_dt = _parse_iso_utc(now)
    if below_since is None or current_dt is None:
        tracking["below_threshold_since"] = now
        return True

    if (current_dt - below_since).total_seconds() < float(settings.get("continuous_window_seconds", 900)):
        return changed

    last_wave_at = _parse_iso_utc(tracking.get("last_sidecar_wave_at"))
    if last_wave_at is not None and (current_dt - last_wave_at).total_seconds() < float(settings.get("cooldown_seconds", 900)):
        return changed

    if chair_review_settings(config).get("enabled", False):
        sidecar_approved_until = _parse_iso_utc(chair_state.get("sidecar_approved_until"))
        if sidecar_approved_until is None or sidecar_approved_until <= current_dt:
            if chair_state.get("sidecar_approved_until") is not None:
                chair_state["sidecar_approved_until"] = None
                changed = True
            wait_reason = "underutilized but waiting for a fresh chairman sidecar approval window"
            if tracking.get("last_sidecar_wave_reason") != wait_reason:
                tracking["last_sidecar_wave_reason"] = wait_reason
                changed = True
            return changed

    status = load_status(config)
    task_map = task_index_from_status(config, status)
    provider_report = load_provider_report(config)
    idle_agents = eligible_idle_agents_for_sidecars(
        config,
        state,
        status,
        max_active_sidecars_per_agent=int(settings.get("max_active_sidecars_per_agent", 1)),
        provider_report=provider_report,
    )
    if not idle_agents:
        tracking["last_sidecar_wave_at"] = now
        tracking["last_sidecar_wave_reason"] = "underutilized but no idle agents were eligible for sidecar work"
        write_activity_log(
            config,
            {
                "type": "sidecar_wave_skipped",
                "message": tracking["last_sidecar_wave_reason"],
                "ratio": ratio,
            },
        )
        return True

    existing_signatures = existing_sidecar_signatures(status)
    candidates = build_catalog_sidecar_candidates(config, status, task_map, existing_signatures)
    if not candidates:
        candidates = build_dynamic_sidecar_candidates(config, status, task_map, existing_signatures)
    blocked_parents = {str(item).strip() for item in chair_state.get("blocked_sidecar_parents", []) if str(item).strip()}
    if blocked_parents:
        candidates = [candidate for candidate in candidates if str(candidate.get("parent_task_id") or "") not in blocked_parents]
    if not candidates:
        tracking["last_sidecar_wave_at"] = now
        tracking["last_sidecar_wave_reason"] = "underutilized but no sidecar candidates matched the catalog or dynamic fallback"
        write_activity_log(
            config,
            {
                "type": "sidecar_wave_skipped",
                "message": tracking["last_sidecar_wave_reason"],
                "ratio": ratio,
            },
        )
        return True

    candidates.sort(key=lambda item: (int(item.get("priority", 9)), str(item.get("parent_task_id") or ""), str(item.get("kind") or "")))
    active_statuses = {str(value) for value in ready_dispatch_settings(config).get("active_worker_statuses", [])}
    _active_agents, _active_task_agents = active_worker_indexes(state, active_statuses)
    _pending_agents, _pending_task_agents, pending_event_keys = outstanding_delivery_indexes(config, state)
    seen = state.setdefault("seen_event_keys", {})
    per_agent_counts = {agent: count_open_sidecars_for_agent(status, agent) for agent in idle_agents}
    created = 0
    max_sidecars = max(
        1,
        min(
            int(settings.get("max_new_sidecars_per_wave", 2)),
            int(chair_state.get("max_sidecars") or chair_review_settings(config).get("default_max_sidecars", 2)),
        ),
    )

    for candidate in candidates:
        if created >= max_sidecars:
            break

        parent_owner = str(candidate.get("reviewer") or "").strip()
        preferred_agents = preferred_agents_for_sidecar(str(candidate.get("kind") or ""))
        selected_owner = next(
            (
                agent
                for agent in preferred_agents
                if agent in idle_agents
                and agent != parent_owner
                and per_agent_counts.get(agent, 0) < int(settings.get("max_active_sidecars_per_agent", 1))
            ),
            None,
        )
        if not selected_owner:
            selected_owner = next(
                (
                    agent
                    for agent in idle_agents
                    if agent != parent_owner
                    and per_agent_counts.get(agent, 0) < int(settings.get("max_active_sidecars_per_agent", 1))
                ),
                None,
            )
        if not selected_owner:
            continue

        ok, error = create_sidecar_task(
            config,
            sidecar_id=str(candidate["sidecar_id"]),
            owner=selected_owner,
            reviewer=parent_owner,
            phase=str(candidate["phase"]),
            title=str(candidate["title"]),
            summary_zh=str(candidate["summary_zh"]),
            depends_on=list(candidate.get("depends_on", []) or []),
            artifacts=list(candidate.get("artifacts", []) or []),
            helper_parent=str(candidate["parent_task_id"]),
            helper_kind=str(candidate["kind"]),
            mutates_canonical=bool(candidate.get("mutates_canonical", False)),
        )
        if not ok:
            write_activity_log(
                config,
                {
                    "type": "sidecar_task_create_failed",
                    "task_id": candidate["sidecar_id"],
                    "message": f"Failed to create sidecar for {candidate['parent_task_id']}: {error}",
                },
            )
            continue

        status = load_status(config)
        task_map = task_index_from_status(config, status)
        sidecar_task = next((task for task in status.get("tasks", []) if task.get("id") == candidate["sidecar_id"]), None)
        if not sidecar_task:
            continue

        state.setdefault("tasks", {})[candidate["sidecar_id"]] = snapshot_task(sidecar_task, config.get("schema", {}))

        event = build_dispatch_event(sidecar_task, selected_owner, "owned_ready_dispatch", task_map)
        if event["key"] in pending_event_keys:
            continue
        if queue_delivery_event(config, event):
            seen[event["key"]] = utc_now()
            pending_event_keys.add(event["key"])

        per_agent_counts[selected_owner] = per_agent_counts.get(selected_owner, 0) + 1
        existing_signatures.add(f"{candidate['parent_task_id']}:{candidate['kind']}")
        created += 1
        changed = True
        write_activity_log(
            config,
            {
                "type": "sidecar_task_created",
                "task_id": candidate["sidecar_id"],
                "message": (
                    f"Auto-created sidecar {candidate['sidecar_id']} for {candidate['parent_task_id']} "
                    f"({candidate['kind']}) while utilization remained below threshold."
                ),
                "parent_task_id": candidate["parent_task_id"],
                "target_agent": selected_owner,
            },
        )

    tracking["last_sidecar_wave_at"] = now
    if created:
        tracking["last_sidecar_wave_reason"] = (
            f"utilization {ratio:.2f} stayed below threshold {threshold:.2f}; created {created} visible sidecar task(s)"
        )
        write_activity_log(
            config,
            {
                "type": "sidecar_wave_started",
                "message": tracking["last_sidecar_wave_reason"],
                "ratio": ratio,
                "created": created,
            },
        )
        return True

    tracking["last_sidecar_wave_reason"] = "underutilized but no sidecar candidate could be assigned safely"
    write_activity_log(
        config,
        {
            "type": "sidecar_wave_skipped",
            "message": tracking["last_sidecar_wave_reason"],
            "ratio": ratio,
        },
    )
    return True


def dispatch_underutilization_main_tasks(config: dict[str, Any], state: dict[str, Any]) -> bool:
    """Proactively reassign uncovered main tasks to idle agents when utilization is below threshold."""
    settings = underutilization_settings(config)
    if not settings.get("enabled", True):
        return False

    tracking = state.setdefault("underutilization", {})
    productive_statuses = {str(v) for v in settings.get("productive_worker_statuses", [])}
    ratio = utilization_ratio_for_sidecars(config, state, productive_statuses)
    threshold = float(settings.get("threshold_ratio", 0.5))
    now = utc_now()

    if ratio >= threshold:
        return False

    below_since = _parse_iso_utc(tracking.get("below_threshold_since"))
    current_dt = _parse_iso_utc(now)
    if not below_since or not current_dt:
        return False
    if (current_dt - below_since).total_seconds() < float(settings.get("continuous_window_seconds", 900)):
        return False

    last_wave_at = _parse_iso_utc(tracking.get("last_main_task_wave_at"))
    if last_wave_at and (current_dt - last_wave_at).total_seconds() < float(settings.get("cooldown_seconds", 900)):
        return False

    dispatch_settings = ready_dispatch_settings(config)
    active_statuses = {str(v) for v in dispatch_settings.get("active_worker_statuses", [])}
    dependency_done_statuses = {str(v).lower() for v in dispatch_settings.get("dependency_done_statuses", ["done"])}
    finalize_statuses = {str(v).lower() for v in dispatch_settings.get("finalize_statuses", ["review_approved"])}
    review_statuses = {str(v).lower() for v in dispatch_settings.get("review_statuses", ["review"])}
    helper_settings = helper_claim_settings(config)

    status = load_status(config)
    task_map = task_index_from_status(config, status)
    active_agents, active_task_agents = active_worker_indexes(state, active_statuses)
    pending_agents, pending_task_agents, pending_event_keys = outstanding_delivery_indexes(config, state)
    active_agent_counts = active_worker_agent_counts(state, active_statuses)
    pending_agent_counts = outstanding_delivery_agent_counts(config, state)
    active_task_ids = {tid for tid, _ in active_task_agents}
    pending_task_ids = {tid for tid, _ in pending_task_agents}
    agent_loads = agent_dispatch_loads(config, state, active_statuses)
    provider_report = load_provider_report(config)

    idle_agent_names: list[str] = []
    for agent_id, agent in (config.get("agents", {}) or {}).items():
        display = str(agent.get("display_name") or agent.get("name") or agent_id).strip()
        if "legacy alias" in display.lower():
            continue
        normalized = normalize_agent_id(agent_id)
        lane_capacity = max_tasks_per_agent_for_lane(dispatch_settings, normalized)
        lane_load = active_agent_counts.get(normalized, 0) + pending_agent_counts.get(normalized, 0)
        if lane_load >= lane_capacity:
            continue
        if is_agent_dispatch_paused(config, state, agent_id, provider_report=provider_report):
            continue
        idle_agent_names.append(display)

    if not idle_agent_names:
        tracking["last_main_task_wave_at"] = now
        return False

    seen = state.setdefault("seen_event_keys", {})
    max_per_wave = max(1, int(settings.get("max_new_main_tasks_per_wave", 2)))
    dispatched = 0
    changed = False

    sorted_tasks = sorted(
        [t for t in (status.get("tasks", []) or []) if t.get("id")],
        key=lambda t: task_phase_priority(t, task_map, dependency_done_statuses),
    )

    for task in sorted_tasks:
        if dispatched >= max_per_wave:
            break
        if task_is_sidecar(task):
            continue
        task_id = str(task.get("id") or "")
        task_status = str(task.get("status") or "").lower()
        if task_status not in {str(v).lower() for v in helper_settings.get("task_statuses", ["backlog", "todo", "in_progress", "review", "review_approved"])}:
            continue
        if task_id in active_task_ids or task_id in pending_task_ids:
            continue
        plan = proactive_claim_plan_for_task(
            config,
            task=task,
            task_map=task_map,
            idle_agent_names=idle_agent_names,
            agent_loads=agent_loads,
            helper_settings=helper_settings,
            review_statuses=review_statuses,
            finalize_statuses=finalize_statuses,
            dependency_done_statuses=dependency_done_statuses,
            state=state,
        )
        if not plan:
            continue
        old_owner = str(task.get("owner") or "")
        old_reviewer = str(task.get("reviewer") or "")
        msg = (
            f"Availability-first backfill by {plan['claim_agent']} "
            f"(utilization {ratio:.2f} below threshold {threshold:.2f}; "
            f"reassigned from {plan['assigned_agent']})."
        )
        if not persist_task_reassignment(
            config,
            task_id=task_id,
            new_owner=plan["new_owner"],
            new_reviewer=plan["new_reviewer"],
            message=msg,
            handoff_to=plan["handoff_to"],
            handoff_from=plan["handoff_from"],
        ):
            continue
        task["owner"] = plan["new_owner"]
        task["reviewer"] = plan["new_reviewer"]
        task["last_update"] = now
        task["next"] = msg
        event = build_dispatch_event(task, plan["claim_agent"], plan["reason"], task_map)
        if event["key"] not in pending_event_keys and queue_delivery_event(config, event):
            seen[event["key"]] = now
            pending_event_keys.add(event["key"])
            dispatched += 1
            changed = True
            active_task_ids.add(task_id)
            idle_agent_names = [name for name in idle_agent_names if name != plan["claim_agent"]]
            write_activity_log(
                config,
                {
                    "type": "task_proactive_backfill",
                    "task_id": task_id,
                    "message": msg,
                    "from_owner": old_owner,
                    "to_owner": plan["new_owner"],
                    "from_reviewer": old_reviewer,
                    "to_reviewer": plan["new_reviewer"],
                    "claim_role": plan["claim_role"],
                },
            )
            console_log(
                f"proactive backfill: task={task_id} role={plan['claim_role']} to={plan['claim_agent']}",
                quiet=SUPERVISOR_LOG_QUIET,
            )

    tracking["last_main_task_wave_at"] = now
    return changed


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
    if manage_pid_file:
        write_supervisor_pid(config)
    heartbeat_at = utc_now()
    status = load_status(config)
    desired_focus_mode = desired_focus_mode_from_status(status)

    def stamp_supervisor_state(state: dict[str, Any]) -> None:
        supervisor_state = state.setdefault("supervisor", {})
        previous_pid = supervisor_state.get("pid")
        current_pid = os.getpid()
        supervisor_state["pid"] = current_pid
        supervisor_state["last_heartbeat_at"] = heartbeat_at
        supervisor_state["lifecycle"] = "running"
        if not supervisor_state.get("started_at") or previous_pid != current_pid:
            supervisor_state["started_at"] = heartbeat_at
        update_supervisor_mode_metadata(
            state,
            focus_mode=desired_focus_mode,
            heartbeat_at=heartbeat_at,
        )

    state = load_runtime_state(config)
    previous_heartbeat = state.get("supervisor", {}).get("last_heartbeat_at")
    stamp_supervisor_state(state)
    changed = False
    provider_report = load_provider_report(config)
    changed = bool(expire_provider_pauses(config, state, provider_report)) or changed
    pruned = prune_stale_approvals(config)
    if pruned:
        changed = True
    if watch:
        changed = run_scan(config, state, replay=replay, provider_capabilities=provider_report) or changed
        state = load_runtime_state(config)
        stamp_supervisor_state(state)
        changed = bool(expire_provider_pauses(config, state, provider_report)) or changed
    status = load_status(config)
    desired_focus_mode = desired_focus_mode_from_status(status)
    changed = poll_workers(config, state) or changed
    changed = reconcile_queue_records(config, state) or changed
    reconcile_status_from_git(config)
    changed = prune_event_queue(config, state) or changed
    changed = prune_completed_dispatch_pauses(state, status, config=config, provider_report=provider_report) or changed
    changed = prune_failure_streaks(state, status) or changed
    changed = refresh_chair_review_state(config, state, provider_report) or changed
    status = load_status(config)
    desired_focus_mode = desired_focus_mode_from_status(status)
    if desired_focus_mode == "planning":
        changed = ensure_planning_baton_dispatch(config, state, status) or changed
    else:
        changed = queue_chair_review(config, state, status, provider_report) or changed
        changed = dispatch_ready_tasks(config, state, provider_report) or changed
        changed = dispatch_underutilization_sidecars(config, state) or changed
        changed = dispatch_underutilization_main_tasks(config, state) or changed
    changed = process_queue(config, state, provider_report) or changed
    changed = poll_workers(config, state) or changed
    status = load_status(config)
    changed = reconcile_queue_records(config, state) or changed
    changed = prune_event_queue(config, state) or changed
    changed = prune_completed_dispatch_pauses(state, status, config=config, provider_report=provider_report) or changed
    changed = prune_failure_streaks(state, status) or changed
    changed = sync_github_bus(config, state) or changed
    trim_worker_history(state, int(config.get("supervisor", {}).get("max_worker_history", 200)))
    trim_seen_events(state, int(config.get("watcher", {}).get("max_seen_events", 2000)))
    stamp_supervisor_state(state)
    save_runtime_state(config, state)
    log_runtime_summary(
        state,
        safe_load_approval_state(config),
        changed=changed,
        quiet=quiet,
        verbose=verbose,
        previous_heartbeat=previous_heartbeat,
        warn_after_seconds=float(config.get("supervisor", {}).get("heartbeat_warn_after_seconds", 10.0)),
        once=once,
    )
    return changed


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
    try:
        run_once(
            config,
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
            run_once(
                config,
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
    finally:
        if manage_pid_file:
            clear_supervisor_pid(config)


if __name__ == "__main__":
    raise SystemExit(main())
