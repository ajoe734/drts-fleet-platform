#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ORCHESTRATOR_DIR = ROOT / ".orchestrator"
DEFAULT_CONFIG_PATH = ORCHESTRATOR_DIR / "config.json"
LOCAL_CONFIG_PATH = ORCHESTRATOR_DIR / "config.local.json"
TASK_BRIEFS_DIR = ORCHESTRATOR_DIR / "task-briefs"
EVIDENCE_DIR = ORCHESTRATOR_DIR / "evidence"
AI_GUIDE_PATH = ROOT / "AI_COLLABORATION_GUIDE.md"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def atomic_write_text(path: Path, content: str, *, encoding: str = "utf-8") -> None:
    ensure_parent(path)
    tmp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    tmp_path.write_text(content, encoding=encoding)
    tmp_path.replace(path)


def _strip_js_comments(text: str) -> str:
    """Strip JS-style // and /* */ comments from JSON-with-comments, but NOT
    inside string literals.  A naive regex like r'//.*$' also eats '://' in
    URLs, producing unclosed strings and JSONDecodeErrors."""
    result: list[str] = []
    i = 0
    n = len(text)
    in_string = False
    while i < n:
        ch = text[i]
        if in_string:
            if ch == "\\" and i + 1 < n:
                result.append(ch)
                result.append(text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_string = False
            result.append(ch)
            i += 1
        else:
            if ch == '"':
                in_string = True
                result.append(ch)
                i += 1
            elif ch == "/" and i + 1 < n and text[i + 1] == "/":
                # line comment — skip to end of line
                while i < n and text[i] != "\n":
                    i += 1
            elif ch == "/" and i + 1 < n and text[i + 1] == "*":
                # block comment — skip to */
                i += 2
                while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                    i += 1
                i += 2  # skip closing */
            else:
                result.append(ch)
                i += 1
    return "".join(result)


def load_json(path: Path, default: Any | None = None) -> Any:
    if not path.exists():
        return deepcopy(default)
    last_error: json.JSONDecodeError | None = None

    def parse_text(text: str) -> Any:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            sanitized = _strip_js_comments(text)
            sanitized = re.sub(r",(\s*[}\]])", r"\1", sanitized)
            try:
                return json.loads(sanitized)
            except json.JSONDecodeError as exc:
                if exc.msg != "Extra data":
                    raise
                decoder = json.JSONDecoder()
                payload, end = decoder.raw_decode(sanitized)
                trailing = sanitized[end:].strip()
                if trailing.startswith("{") or trailing.startswith("["):
                    return payload
                raise

    for attempt in range(3):
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            return deepcopy(default)
        try:
            return parse_text(text)
        except json.JSONDecodeError as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.05)
                continue
            raise last_error

    return deepcopy(default)


def write_json(path: Path, payload: Any) -> None:
    atomic_write_text(path, json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    ensure_parent(path)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def deep_merge(base: Any, overlay: Any) -> Any:
    if isinstance(base, dict) and isinstance(overlay, dict):
        merged = deepcopy(base)
        for key, value in overlay.items():
            if key in merged:
                merged[key] = deep_merge(merged[key], value)
            else:
                merged[key] = deepcopy(value)
        return merged
    if isinstance(base, list) and isinstance(overlay, list):
        return deepcopy(overlay)
    return deepcopy(overlay)


def resolve_path(value: str | Path | None) -> Path | None:
    if value is None:
        return None
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    return path


def relpath(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def load_config(config_path: str | Path | None = None) -> dict[str, Any]:
    config_file = resolve_path(config_path) if config_path else DEFAULT_CONFIG_PATH
    if config_file is None:
        raise RuntimeError("Unable to resolve orchestrator config path")
    config = load_json(config_file, default={})
    if LOCAL_CONFIG_PATH.exists():
        config = deep_merge(config, load_json(LOCAL_CONFIG_PATH, default={}))
    return config


def config_path(config: dict[str, Any], key: str, default: str | None = None) -> Path:
    value = config.get("paths", {}).get(key, default)
    path = resolve_path(value)
    if path is None:
        raise KeyError(f"Missing config path for {key}")
    return path


def run_command(
    command: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    timeout: float | None = None,
    check: bool = False,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd or ROOT),
        env=env,
        check=check,
        timeout=timeout,
        text=True,
        capture_output=True,
    )


def command_exists(name: str) -> str | None:
    return shutil.which(name)


def runtime_env_overrides(runtime: dict[str, Any] | None) -> dict[str, str]:
    if not isinstance(runtime, dict):
        return {}
    env: dict[str, str] = {}
    config_home = str(runtime.get("config_home") or "").strip()
    if config_home:
        home = os.path.expandvars(os.path.expanduser(config_home))
        env["HOME"] = home
        env.setdefault("XDG_CONFIG_HOME", str(Path(home) / ".config"))
        env.setdefault("XDG_CACHE_HOME", str(Path(home) / ".cache"))
        env.setdefault("XDG_DATA_HOME", str(Path(home) / ".local" / "share"))
    configured_env = runtime.get("env")
    if isinstance(configured_env, dict):
        for key, value in configured_env.items():
            if value is None:
                continue
            env[str(key)] = os.path.expandvars(os.path.expanduser(str(value)))
    return env


def shell_quote(parts: list[str]) -> str:
    return " ".join(subprocess.list2cmdline([part]) if os.name == "nt" else __import__("shlex").quote(part) for part in parts)


def normalize_agent_id(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def display_name_for(config: dict[str, Any], agent_id: str) -> str:
    agent = config.get("agents", {}).get(normalize_agent_id(agent_id), {})
    return agent.get("display_name") or agent.get("name") or agent_id


def agent_config_for(config: dict[str, Any], agent_id: str) -> dict[str, Any]:
    normalized = normalize_agent_id(agent_id)
    agent = config.get("agents", {}).get(normalized)
    if agent:
        merged = deepcopy(agent)
        merged.setdefault("id", normalized)
        merged.setdefault("display_name", agent_id)
        return merged
    return {"id": normalized, "display_name": agent_id, "provider": normalized, "adapter": "file_inbox"}


def render_template(path: Path, variables: dict[str, Any]) -> str:
    text = path.read_text(encoding="utf-8")
    for key, value in variables.items():
        text = text.replace("{{" + key + "}}", str(value))
    return text


def write_activity_log(config: dict[str, Any], entry: dict[str, Any]) -> None:
    payload = {
        "ts": utc_now(),
        "agent": "Orchestrator",
        **entry,
    }
    append_jsonl(config_path(config, "activity_log"), payload)


def runtime_log_path(prefix: str, target: str) -> Path:
    slug = normalize_agent_id(target) or "unknown"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    suffix = uuid.uuid4().hex[:6]
    return ORCHESTRATOR_DIR / "logs" / f"{stamp}-{prefix}-{slug}-{suffix}.log"


def new_runtime_id(prefix: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{prefix}-{stamp}-{uuid.uuid4().hex[:8]}"


def spawn_background_process(
    command: list[str],
    *,
    cwd: Path | None = None,
    log_path: Path,
    env: dict[str, str] | None = None,
) -> tuple[subprocess.Popen[str], Path]:
    ensure_parent(log_path)
    handle = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        command,
        cwd=str(cwd or ROOT),
        stdout=handle,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
        start_new_session=True,
    )
    return process, log_path


def snapshot_task(task: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "id": task.get(schema["task_id_field"]),
        "status": task.get(schema["status_field"]),
        "owner": task.get(schema["assignee_field"]),
        "reviewer": task.get(schema["reviewer_field"]),
        "artifacts": list(task.get(schema.get("artifacts_field", "artifacts"), []) or []),
        "depends_on": list(task.get("depends_on", []) or []),
        "next": task.get(schema.get("next_field", "next")),
        "last_update": task.get(schema.get("last_update_field", "last_update")),
    }
    for key in (
        "title",
        "summary_zh",
        "task_class",
        "auto_generated",
        "helper_parent",
        "helper_kind",
        "mutates_canonical",
        "auto_created_by",
        "planning_ref",
    ):
        if key in task:
            payload[key] = task.get(key)
    if "evidence_refs" in task:
        payload["evidence_refs"] = list(task.get("evidence_refs", []) or [])
    return payload


def load_status(config: dict[str, Any]) -> dict[str, Any]:
    return load_json(config_path(config, "status_file"), default={}) or {}


def _unique_paths(paths: list[Path]) -> list[Path]:
    unique: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        marker = str(path)
        if marker in seen or not path.exists():
            continue
        seen.add(marker)
        unique.append(path)
    return unique


def _status_tasks(config: dict[str, Any], status: dict[str, Any]) -> list[dict[str, Any]]:
    schema = config.get("schema", {})
    tasks_path = schema.get("tasks_path", "tasks")
    tasks = status.get(tasks_path, [])
    return tasks if isinstance(tasks, list) else []


def _status_task_by_id(config: dict[str, Any], status: dict[str, Any], task_id: str | None) -> dict[str, Any] | None:
    if not task_id:
        return None
    for task in _status_tasks(config, status):
        if str(task.get("id") or "") == str(task_id):
            return task
    return None


def _merge_task_payload(
    config: dict[str, Any],
    *,
    task: dict[str, Any] | None = None,
    task_id: str | None = None,
    status: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if isinstance(status, dict):
        resolved_status = status
    elif config.get("paths", {}).get("status_file"):
        resolved_status = load_status(config)
    else:
        resolved_status = {}
    live_task = _status_task_by_id(config, resolved_status, task_id or ((task or {}).get("id")))
    if not live_task and not task:
        return None
    merged = deepcopy(live_task or {})
    if task:
        merged.update({key: value for key, value in task.items() if value not in (None, "", [], {})})
    return merged


def _normalize_summary(text: Any, max_length: int = 280) -> str:
    raw = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(raw) <= max_length:
        return raw
    clipped = raw[: max_length - 1].rstrip()
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    return clipped + "…"


def _discussion_artifact_paths(status: dict[str, Any]) -> list[Path]:
    artifacts = status.get("discussion_artifacts")
    result: list[Path] = []
    if isinstance(artifacts, dict):
        candidates = artifacts.values()
    elif isinstance(artifacts, list):
        candidates = artifacts
    else:
        candidates = []
    for candidate in candidates:
        value = str(candidate).strip()
        if not value:
            continue
        path = resolve_path(value)
        if path is not None:
            result.append(path)

    workspace = str(status.get("discussion_workspace") or "").strip()
    if workspace:
        workspace_path = resolve_path(workspace)
        if workspace_path and workspace_path.exists():
            for name in ("planning-session.json", "starter-draft.md", "consensus-packet.md", "supervisor-queue.md"):
                result.append(workspace_path / name)
    return _unique_paths(result)


def task_brief_path(task_id: str) -> Path:
    return TASK_BRIEFS_DIR / f"{task_id}.md"


def evidence_path(run_id: str) -> Path:
    return EVIDENCE_DIR / f"{run_id}.json"


def build_task_brief(
    config: dict[str, Any],
    task: dict[str, Any],
    *,
    runtime_state: dict[str, Any] | None = None,
) -> str:
    task_id = str(task.get("id") or "").strip() or "UNKNOWN"
    title = str(task.get("title") or task.get("summary_zh") or "").strip()
    status_value = str(task.get("status") or "").strip() or "-"
    owner = str(task.get("owner") or "").strip() or "-"
    reviewer = str(task.get("reviewer") or "").strip() or "-"
    next_text = _normalize_summary(task.get("next") or "No short handoff yet.")
    summary_zh = _normalize_summary(task.get("summary_zh") or "")
    planning_ref = str(task.get("planning_ref") or "").strip()
    artifacts = [str(item) for item in task.get("artifacts", []) if str(item).strip()]
    display_artifacts: list[str] = []
    external_artifacts: list[str] = []
    for artifact in artifacts:
        artifact_path = Path(artifact)
        if artifact_path.is_absolute():
            try:
                display_artifacts.append(str(artifact_path.relative_to(ROOT)))
            except ValueError:
                external_artifacts.append(artifact)
            continue
        display_artifacts.append(artifact)
    depends_on = [str(item) for item in task.get("depends_on", []) if str(item).strip()]
    acceptance = [str(item) for item in task.get("acceptance", []) if str(item).strip()]
    evidence_refs = [str(item) for item in task.get("evidence_refs", []) if str(item).strip()]
    pauses = [
        pause
        for pause in (runtime_state or {}).get("dispatch_pauses", [])
        if str(pause.get("task_id") or "") == task_id
    ]

    lines = [f"# Task Brief: {task_id}", ""]
    if title:
        lines.extend([title, ""])
    lines.extend(
        [
            f"- Status: `{status_value}`",
            f"- Owner: `{owner}`",
            f"- Reviewer: `{reviewer}`",
        ]
    )
    if planning_ref:
        lines.append(f"- Planning Ref: `{planning_ref}`")
    if task.get("last_update"):
        lines.append(f"- Last Update: `{task['last_update']}`")
    if summary_zh:
        lines.extend(["", "## 中文說明", "", summary_zh])
    lines.extend(["", "## Short Summary", "", next_text or "-", "", "## Dependencies", ""])
    if depends_on:
        lines.extend([f"- `{item}`" for item in depends_on])
    else:
        lines.append("- None")
    lines.extend(["", "## Acceptance", ""])
    if acceptance:
        lines.extend([f"- {item}" for item in acceptance])
    else:
        lines.append("- None listed")
    lines.extend(["", "## Artifacts", ""])
    if display_artifacts:
        lines.extend([f"- `{item}`" for item in display_artifacts])
    else:
        lines.append("- None listed")
    if external_artifacts:
        lines.extend(["", "## Repo-External Artifacts", ""])
        lines.extend([f"- `{item}`" for item in external_artifacts])
        lines.append(
            "- These paths are intentionally outside this repository. Operate inside their own repo/worktree only; "
            "do not stage repo-external paths from this repository."
        )
    if evidence_refs:
        lines.extend(["", "## Evidence Refs", ""])
        lines.extend([f"- `{item}`" for item in evidence_refs[:8]])
    if pauses:
        lines.extend(["", "## Runtime Pauses", ""])
        for pause in pauses[:5]:
            summary = _normalize_summary(pause.get("summary") or pause.get("failure_kind") or "Paused")
            raw_ref = str(pause.get("raw_ref") or "").strip()
            suffix = f" (`{raw_ref}`)" if raw_ref else ""
            lines.append(f"- {summary}{suffix}")
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            "- Use `scripts/ai-status.sh` or `python3 scripts/ai_status.py` for state changes.",
            "- Treat `current-work.md` as a human summary, not canonical machine context.",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def ensure_task_brief(
    config: dict[str, Any],
    *,
    task: dict[str, Any] | None = None,
    task_id: str | None = None,
    status: dict[str, Any] | None = None,
    runtime_state: dict[str, Any] | None = None,
) -> Path | None:
    merged_task = _merge_task_payload(config, task=task, task_id=task_id, status=status)
    if not merged_task:
        return None
    task_id_value = str(merged_task.get("id") or "").strip()
    if not task_id_value:
        return None
    path = task_brief_path(task_id_value)
    ensure_parent(path)
    path.write_text(build_task_brief(config, merged_task, runtime_state=runtime_state), encoding="utf-8")
    return path


def selected_shared_files(
    config: dict[str, Any],
    *,
    mode: str = "execution",
    task: dict[str, Any] | None = None,
    task_id: str | None = None,
    status: dict[str, Any] | None = None,
    runtime_state: dict[str, Any] | None = None,
) -> list[Path]:
    files: list[Path] = []
    if AI_GUIDE_PATH.exists():
        files.append(AI_GUIDE_PATH)

    if isinstance(status, dict):
        resolved_status = status
    elif config.get("paths", {}).get("status_file"):
        resolved_status = load_status(config)
    else:
        resolved_status = {}
    mode_value = str(mode or "execution").strip().lower()

    if mode_value == "planning":
        files.extend(_discussion_artifact_paths(resolved_status))
        return _unique_paths(files)

    if mode_value == "coordination":
        if config.get("paths", {}).get("status_file"):
            files.append(config_path(config, "status_file"))
        return _unique_paths(files)

    brief_path = ensure_task_brief(
        config,
        task=task,
        task_id=task_id or ((task or {}).get("id") if isinstance(task, dict) else None),
        status=resolved_status,
        runtime_state=runtime_state,
    )
    if brief_path is not None:
        files.append(brief_path)
    elif config.get("paths", {}).get("status_file"):
        files.append(config_path(config, "status_file"))
    return _unique_paths(files)


def serialize_shared_files(paths: list[Path]) -> str:
    return "\n".join(f"- {relpath(path)}" for path in paths)


def to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


if __name__ == "__main__":
    print("This module is shared by the orchestrator scripts and is not meant to be run directly.", file=sys.stderr)
    raise SystemExit(1)
