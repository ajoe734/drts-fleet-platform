"""Claude Code cloud execution for Claude CLI lanes.

When a Claude provider's runtime sets ``execution: "cloud"``, owner dispatches
in execution mode no longer implement the task on this VM. The adapter starts
a light local relay instead: a ``claude -p`` session that hands the task to a
one-off Claude Code cloud routine (RemoteTrigger), waits for it, lands the
pushed candidate on the local task branch after a write-scope check
(bin/cloud_relay_tool.py), and then records the result with the same
canonical ai-status commands a local worker would use. Review, planning,
coordination and chair dispatches stay local.
"""

from __future__ import annotations

import shlex
from pathlib import Path
from typing import Any

from adapters.base import DeliveryRequest
from common import config_path

ORCHESTRATOR_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_PATH = ORCHESTRATOR_ROOT / "templates" / "claude-cloud-relay.md"
RELAY_TOOL_PATH = ORCHESTRATOR_ROOT / "bin" / "cloud_relay_tool.py"

DEFAULT_ROLES = ("owner",)
DEFAULT_CLOUD_MODEL = "claude-opus-5-5"
DEFAULT_POLL_SECONDS = 200
DEFAULT_MAX_HOURS = 6
# A relay must produce a stream event before the supervisor's stall clock runs
# out; each wait ends in one RemoteTrigger call, so keep the wait well under it.
STALL_MARGIN_SECONDS = 90
LOCAL_ONLY_MODES = {"planning", "coordination"}


def cloud_execution_settings(runtime: dict[str, Any]) -> dict[str, Any] | None:
    """The provider's cloud settings, or None when it runs workers locally."""
    if str(runtime.get("execution") or "").strip().lower() != "cloud":
        return None
    cloud = runtime.get("cloud") if isinstance(runtime.get("cloud"), dict) else {}
    environment_id = str(cloud.get("environment_id") or "").strip()
    repo_url = str(cloud.get("repo_url") or "").strip()
    if not environment_id or not repo_url:
        return None
    roles = cloud.get("roles") or list(DEFAULT_ROLES)
    return {
        "environment_id": environment_id,
        "repo_url": repo_url,
        "base_branch": str(cloud.get("base_branch") or "dev").strip() or "dev",
        "roles": [str(role).strip().lower() for role in roles if str(role).strip()],
        # Empty means the lane's own runtime.model: the relay runs on the local
        # CLI, which may not know the newest ids the cloud does.
        "relay_model": str(cloud.get("relay_model") or "").strip(),
        "cloud_model": str(cloud.get("cloud_model") or DEFAULT_CLOUD_MODEL).strip(),
        "poll_seconds": int(cloud.get("poll_seconds") or DEFAULT_POLL_SECONDS),
        "max_hours": float(cloud.get("max_hours") or DEFAULT_MAX_HOURS),
    }


def should_relay_to_cloud(settings: dict[str, Any] | None, request: DeliveryRequest) -> bool:
    """Only canonical task dispatches in a cloud-enabled role and execution mode.

    The relay lands the cloud commit on the task branch, so a dispatch without
    one (a fallback onto the canonical checkout) stays local.
    """
    if not settings:
        return False
    metadata = request.metadata if isinstance(request.metadata, dict) else {}
    role = str(metadata.get("dispatch_role") or "").strip().lower()
    if not request.task_id or not role or role not in settings["roles"]:
        return False
    if not str(metadata.get("task_branch") or "").strip():
        return False
    task = metadata.get("task") if isinstance(metadata.get("task"), dict) else {}
    mode = str(metadata.get("mode") or "").strip().lower()
    if not mode and str(task.get("task_class") or "").strip().lower() == "planning":
        mode = "planning"
    return mode not in LOCAL_ONLY_MODES


def relay_poll_seconds(settings: dict[str, Any], config: dict[str, Any]) -> int:
    stall_after = float((config.get("supervisor") or {}).get("stall_after_seconds", 300))
    ceiling = max(60, int(stall_after) - STALL_MARGIN_SECONDS)
    return max(60, min(int(settings["poll_seconds"]), ceiling))


def _write_scopes(metadata: dict[str, Any]) -> list[str]:
    task = metadata.get("task") if isinstance(metadata.get("task"), dict) else {}
    scopes = task.get("write_scopes") or []
    if not isinstance(scopes, list):
        return []
    return [str(scope).strip() for scope in scopes if str(scope).strip()]


def build_cloud_relay_prompt(
    request: DeliveryRequest,
    settings: dict[str, Any],
    *,
    run_id: str,
    config: dict[str, Any],
) -> str:
    metadata = request.metadata if isinstance(request.metadata, dict) else {}
    task_branch = str(metadata.get("task_branch") or "").strip()
    base_branch = str(metadata.get("base_branch") or "").strip() or settings["base_branch"]
    scopes = _write_scopes(metadata)
    poll_seconds = relay_poll_seconds(settings, config)
    tool = shlex.quote(str(RELAY_TOOL_PATH))
    branch = shlex.quote(task_branch)
    task_id = shlex.quote(request.task_id or "")
    state_dir = shlex.quote(str(config_path(config, "status_file").parent / ".orchestrator" / "cloud-relay"))
    land_command = (
        f"python3 {tool} land --branch {branch} --base {shlex.quote(base_branch)} --sha <SHA>"
        + "".join(f" --scope {shlex.quote(scope)}" for scope in scopes)
    )
    values = {
        "task_id": request.task_id or "",
        "run_id": run_id,
        "agent": str(metadata.get("dispatch_agent") or request.agent_id),
        "task_branch": task_branch,
        "base_branch": base_branch,
        "environment_id": settings["environment_id"],
        "repo_url": settings["repo_url"],
        "cloud_model": settings["cloud_model"],
        "poll_seconds": str(poll_seconds),
        "bash_timeout_ms": str((poll_seconds + 60) * 1000),
        "max_hours": f"{settings['max_hours']:g}",
        "head_command": f"python3 {tool} wait --branch {branch} --seconds 0",
        "wait_command": f"python3 {tool} wait --branch {branch} --baseline <BASELINE> --seconds {poll_seconds}",
        "land_command": land_command,
        "lookup_command": f"python3 {tool} lookup --state-dir {state_dir} --task {task_id} --hours {settings['max_hours']:g}",
        "record_command": f"python3 {tool} record --state-dir {state_dir} --task {task_id} --trigger <TRIGGER_ID> --run {shlex.quote(run_id)}",
        "write_scopes": "\n".join(f"  - `{scope}`" for scope in scopes) or "  - （任務沒有 write_scopes；以原始派工說明為準）",
        "original_brief": request.message,
    }
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    for key, value in values.items():
        template = template.replace("{{" + key + "}}", value)
    return template
