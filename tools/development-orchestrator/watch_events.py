#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from common import (
    ROOT,
    agent_config_for,
    build_task_brief,
    config_path,
    display_name_for,
    load_config,
    load_json,
    load_status,
    new_runtime_id,
    relpath,
    render_template,
    resolve_source_path,
    selected_shared_files,
    serialize_shared_files,
    snapshot_task,
    task_board_cli_path,
    utc_now,
    write_activity_log,
)
from branch_routing import route_task
from control_plane.infra.queue_repo import enqueue_event
from control_plane.infra.runtime_repo import load_runtime_state, save_runtime_state


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Watch ai-status.json and wake the right local agent with a minimal event.")
    parser.add_argument("--config", default=".orchestrator/config.json", help="Path to orchestrator config.")
    parser.add_argument("--once", action="store_true", help="Run one scan and exit.")
    parser.add_argument("--replay", action="store_true", help="Replay pending events immediately on startup.")
    parser.add_argument("--poll-interval", type=float, default=None, help="Override poll interval seconds.")
    return parser.parse_args()


def handoff_key(handoff: dict[str, Any]) -> str:
    parts = [
        str(handoff.get("task_id") or ""),
        str(handoff.get("from") or ""),
        str(handoff.get("to") or ""),
        str(handoff.get("created_at") or ""),
        str(handoff.get("message") or ""),
    ]
    return "|".join(parts)


def enqueue_runtime_events_enabled(config: dict[str, Any]) -> bool:
    return bool(config.get("events", {}).get("enqueue_runtime_events", False))


def build_snapshot(config: dict[str, Any], status: dict[str, Any]) -> dict[str, Any]:
    schema = config["schema"]
    tasks_path = schema["tasks_path"]
    handoffs_path = schema["handoffs_path"]
    tasks = {
        task.get(schema["task_id_field"]): snapshot_task(task, schema)
        for task in status.get(tasks_path, [])
        if task.get(schema["task_id_field"])
    }
    pending_handoffs = [
        handoff
        for handoff in status.get(handoffs_path, [])
        if str(handoff.get("status") or "").lower() in {s.lower() for s in config.get("events", {}).get("pending_handoff_statuses", ["pending"])}
    ]
    return {
        "tasks": tasks,
        "pending_handoff_keys": [handoff_key(item) for item in pending_handoffs],
        "pending_handoffs": pending_handoffs,
        "status_updated_at": status.get("updated_at"),
    }


def resolve_target_for_status(task: dict[str, Any], status_value: str, config: dict[str, Any]) -> str | None:
    status_targets = config.get("events", {}).get("status_targets", {})
    target_field = status_targets.get(status_value)
    if not target_field:
        return None
    if target_field == "owner":
        return task.get(config["schema"]["assignee_field"])
    if target_field == "reviewer":
        return task.get(config["schema"]["reviewer_field"])
    return task.get(target_field)


def resolve_target_for_waiting_status(status_value: str, config: dict[str, Any]) -> str | None:
    for pattern in config.get("events", {}).get("waiting_status_patterns", []):
        match = re.match(pattern, status_value)
        if not match:
            continue
        if match.groupdict().get("agent"):
            return match.group("agent")
    return None


def build_task_status_event(task_id: str, task: dict[str, Any], new_status: str, config: dict[str, Any]) -> dict[str, Any] | None:
    lower_status = new_status.lower()
    review_statuses = {value.lower() for value in config.get("events", {}).get("review_statuses", ["review"])}

    if lower_status in review_statuses and task.get("reviewer"):
        return {
            "key": f"{task_id}:status:{lower_status}:{task.get('reviewer')}",
            "task_id": task_id,
            "target_agent": task.get("reviewer"),
            "reason": f"status:{new_status}",
            "task": task,
        }

    waiting_target = resolve_target_for_waiting_status(new_status, config)
    if waiting_target:
        return {
            "key": f"{task_id}:status:{lower_status}:{waiting_target}",
            "task_id": task_id,
            "target_agent": waiting_target,
            "reason": f"status:{new_status}",
            "task": task,
        }

    target = resolve_target_for_status(task, new_status, config)
    if target:
        return {
            "key": f"{task_id}:status:{lower_status}:{target}",
            "task_id": task_id,
            "target_agent": target,
            "reason": f"status:{new_status}",
            "task": task,
        }
    return None


def compute_replay_events(current: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for task_id, task in current.get("tasks", {}).items():
        new_status = str(task.get("status") or "")
        if not new_status:
            continue
        event = build_task_status_event(task_id, task, new_status, config)
        if event:
            events.append(event)

    if config.get("events", {}).get("watch_handoffs", True):
        for handoff in current.get("pending_handoffs", []):
            events.append(
                {
                    "key": f"handoff:{handoff_key(handoff)}",
                    "task_id": handoff.get("task_id"),
                    "target_agent": handoff.get("to"),
                    "reason": "handoff_pending",
                    "task": {
                        "id": handoff.get("task_id"),
                        "artifacts": [],
                        "next": handoff.get("message"),
                    },
                    "handoff": handoff,
                }
            )
    return events


def compute_events(previous: dict[str, Any], current: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    watcher = previous.get("watcher") if isinstance(previous.get("watcher"), dict) else {}
    previous_tasks = watcher.get("task_snapshots") or previous.get("tasks", {})
    current_tasks = current.get("tasks", {})
    review_statuses = {value.lower() for value in config.get("events", {}).get("review_statuses", ["review"])}

    for task_id, task in current_tasks.items():
        old_task = previous_tasks.get(task_id)
        if not old_task:
            continue

        if config.get("events", {}).get("watch_assignee_changes", True) and task.get("owner") != old_task.get("owner") and task.get("owner"):
            events.append(
                {
                    "key": f"{task_id}:owner:{task.get('owner')}:{task.get('status')}",
                    "task_id": task_id,
                    "target_agent": task.get("owner"),
                    "reason": "assignee_changed",
                    "task": task,
                }
            )

        if config.get("events", {}).get("watch_reviewer_changes", False) and task.get("reviewer") != old_task.get("reviewer") and task.get("reviewer"):
            events.append(
                {
                    "key": f"{task_id}:reviewer:{task.get('reviewer')}:{task.get('status')}",
                    "task_id": task_id,
                    "target_agent": task.get("reviewer"),
                    "reason": "reviewer_changed",
                    "task": task,
                }
            )

        new_status = str(task.get("status") or "")
        old_status = str(old_task.get("status") or "")
        if new_status == old_status:
            continue

        event = build_task_status_event(task_id, task, new_status, config)
        if event:
            events.append(event)

    if config.get("events", {}).get("watch_handoffs", True):
        previous_pending = set(previous.get("pending_handoff_keys", []))
        for handoff in current.get("pending_handoffs", []):
            key = handoff_key(handoff)
            if key in previous_pending:
                continue
            events.append(
                {
                    "key": f"handoff:{key}",
                    "task_id": handoff.get("task_id"),
                    "target_agent": handoff.get("to"),
                    "reason": "handoff_pending",
                    "task": {
                        "id": handoff.get("task_id"),
                        "artifacts": [],
                        "next": handoff.get("message"),
                    },
                    "handoff": handoff,
                }
            )
    return events


def event_mode_bucket(event: dict[str, Any]) -> str:
    metadata = event.get("metadata", {}) if isinstance(event.get("metadata"), dict) else {}
    mode = str(metadata.get("mode") or "").strip().lower()
    if mode in {"planning", "coordination", "execution"}:
        return mode
    task_payload = event.get("task", {}) if isinstance(event.get("task"), dict) else {}
    if str(task_payload.get("task_class") or "").strip().lower() == "planning":
        return "planning"
    return "execution"


def repo_scoped_target_files(values: list[Any] | tuple[Any, ...] | None) -> tuple[list[str], int]:
    result: list[str] = []
    skipped = 0
    for value in values or []:
        text = str(value or "").strip()
        if not text:
            continue
        path = Path(text)
        if path.is_absolute():
            try:
                result.append(str(path.relative_to(ROOT)))
            except ValueError:
                skipped += 1
            continue
        result.append(text)
    return result, skipped


_SHELL_SAFE_BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")


def _is_safe_execution_branch(branch: str) -> bool:
    """Allow only Git-valid branch names that are safe in the wake-up shell block."""
    if not _SHELL_SAFE_BRANCH_RE.fullmatch(branch):
        return False
    try:
        result = subprocess.run(
            ["git", "check-ref-format", "--branch", branch],
            cwd=str(ROOT),
            text=True,
            capture_output=True,
            timeout=5.0,
            check=False,
        )
    except OSError:
        return False
    return result.returncode == 0


def execution_branch_for_task(task_payload: dict[str, Any], lane: str, task_id_kebab: str) -> str:
    """Return a task override when it is safe for the generated shell commands."""
    fallback = f"{lane}/{task_id_kebab}"
    configured_branch = task_payload.get("execution_branch")
    if not isinstance(configured_branch, str):
        return fallback
    branch = configured_branch.strip()
    return branch if branch and _is_safe_execution_branch(branch) else fallback


def render_wakeup_message(
    config: dict[str, Any],
    event: dict[str, Any],
    target_agent: str,
    *,
    status: dict[str, Any] | None = None,
) -> str:
    agent = agent_config_for(config, target_agent)
    template_path = resolve_source_path(
        agent.get("wake_template")
        or "tools/development-orchestrator/templates/wakeup.txt"
    )
    if template_path is None:
        raise RuntimeError("Unable to resolve wake-up template path")
    raw_task_id = str(event.get("task_id") or "").strip()
    task_payload = event.get("task", {}) or {}
    shared_paths = selected_shared_files(
        config,
        mode=event_mode_bucket(event),
        task=task_payload,
        status=status,
    )
    task_brief_inline = ""
    visible_shared_paths = []
    for path in shared_paths:
        path_label = relpath(path)
        if path_label.startswith(".orchestrator/generated/task-briefs/"):
            try:
                task_brief_inline = (
                    "\n本次 task brief 已內嵌如下；不要再讀 `.orchestrator/generated/task-briefs/*`，"
                    "因為部分 worker 的 file tool 會尊重 `.gitignore` 而拒絕該路徑。\n\n"
                    "```markdown\n"
                    f"{path.read_text(encoding='utf-8').strip()}\n"
                    "```\n"
                )
            except OSError:
                task_brief_inline = (
                    "\n本次 task brief 無法從 runtime brief path 讀取；請直接使用下方 Task ID、"
                    "`ai-status.json` 與列出的相關檔案繼續。\n"
                )
            continue
        visible_shared_paths.append(path)
    if not task_brief_inline and isinstance(task_payload, dict) and task_payload.get("id"):
        task_brief_inline = (
            "\n本次 task brief 摘要如下：\n\n"
            "```markdown\n"
            f"{build_task_brief(config, task_payload).strip()}\n"
            "```\n"
        )
    shared_files = serialize_shared_files(visible_shared_paths)
    raw_target_files = event.get("target_files") if "target_files" in event else task_payload.get("artifacts")
    target_files, skipped_external_targets = repo_scoped_target_files(raw_target_files or [])
    display_target_files = list(target_files)
    if skipped_external_targets:
        display_target_files.append(
            f"(repo-external artifacts omitted: {skipped_external_targets}; do not stage paths outside this repository)"
        )
    is_reviewer_dispatch = str(event.get("reason") or "") == "review_ready_dispatch"
    status_cli = str(task_board_cli_path())
    review_guardrails = ""
    if is_reviewer_dispatch:
        candidate_sha = str(task_payload.get("candidate_sha") or "").strip()
        review_guardrails = (
            "\n這是 candidate review，不是實作工作。\n"
            f"- 只能檢查鎖定 candidate `{candidate_sha or '(missing)'}`；先確認 `git rev-parse HEAD` 或 PR head 與它完全一致。\n"
            "- 不要修改檔案、commit、push、amend、rebase 或切換 task branch。發現問題時用 `reopen`，不要直接修。\n"
            f"- 通過時用 `REVIEWED_SHA=<candidate sha> {status_cli} approve`；之後由 GitHub bus 對同一 SHA 記錄 CI 與 merge。\n"
        )
    lane = str(agent.get("id") or target_agent or "").strip()
    task_id_kebab = raw_task_id.lower() if raw_task_id else ""
    if raw_task_id:
        routing = route_task(raw_task_id, config=config)
        base_branch = routing.base_branch
    else:
        base_branch = ""
    branch_protocol = ""
    if not is_reviewer_dispatch:
        branch_protocol = build_branch_protocol_block(
            task_id=raw_task_id,
            lane=lane,
            branch=execution_branch_for_task(task_payload, lane, task_id_kebab),
            base_branch=base_branch,
        )
    task_commit_guardrails = ""
    if raw_task_id:
        task_commit_guardrails = (
            "\n若本次變更碰到 `docs/ops/branch-strategy.md` §11.1 的 fragile surface，或跨多檔共享 design intent，"
            "不能把 diff 只留在 working tree；在 yield / 換 task / 結束 session 前，"
            "先做 task-scoped anchor commit 或正式 closeout commit。\n"
            "工作樹已有不相關修改不是跳過 commit 的理由；只 stage 你 own 的檔案，必要時切到乾淨 branch/worktree 再繼續。\n"
            "若安全 commit 或普通 non-force push 做不到，必須明確回報 `progress` / `blocker` 與原因，不能把工作描述成已完成。\n"
            "完成實作時，先用 `CANDIDATE_SHA=$(git rev-parse HEAD)` 與 `CANDIDATE_BRANCH=$(git branch --show-current)` handoff；"
            "不要呼叫 `done`。CI、merge 與外部 acceptance 由 candidate lifecycle 寫入。"
        )
    variables = {
        "shared_files": shared_files,
        "task_id": raw_task_id or "(none)",
        "task_id_kebab": task_id_kebab,
        "lane": lane,
        "base_branch": base_branch,
        "target_agent": display_name_for(config, str(target_agent or "")) or str(target_agent or ""),
        "reason": event.get("reason") or "wakeup",
        "target_files": "\n".join(f"- {path}" for path in display_target_files) if display_target_files else "- (none inferred)",
        "review_guardrails": review_guardrails.rstrip(),
        "branch_protocol": branch_protocol.rstrip(),
        "task_commit_guardrails": task_commit_guardrails.rstrip(),
        "task_brief_inline": task_brief_inline.rstrip(),
        "status_cli": status_cli,
    }
    return render_template(template_path, variables).strip() + "\n"


def build_branch_protocol_block(
    *,
    task_id: str,
    lane: str,
    branch: str,
    base_branch: str,
) -> str:
    """Render the anchor-commit / branch-hygiene block injected into wakeup.txt.

    Returns "" when any of the four positional facts (task id, lane, branch, base
    branch) is missing — without all three we can't print concrete commands,
    and the abstract protocol already lives in
    `tools/development-orchestrator/skills/worker-anchor-commit.md`, so a blank block is the
    correct degradation (e.g. for planning baton dispatches that have no
    task-scoped branch).
    """
    if not (task_id and lane and branch and base_branch):
        return ""
    return (
        "\n分支與 anchor commit（依 `docs/ops/branch-strategy.md` §11，工作期間遵守）：\n"
        f"- 預期 branch：`{branch}`，base 為 `{base_branch}`。\n"
        "- 若 supervisor 已指定 isolated worker cwd，留在該 cwd；不要切換 canonical root。\n"
        "- 若當前 branch 不是預期 branch，先復用既有 branch/worktree；只有 branch 不存在才建立：\n"
        "  ```bash\n"
        "  git fetch origin\n"
        f"  existing=$(git worktree list --porcelain | awk 'BEGIN{{p=\"\"}} /^worktree /{{p=substr($0,10)}} /^branch refs\\/heads\\/{branch}$/{{print p; exit}}')\n"
        "  if [ -n \"$existing\" ]; then cd \"$existing\"; "
        f"elif git show-ref --verify --quiet refs/heads/{branch}; then git switch {branch}; "
        f"else git switch -c {branch} origin/{base_branch}; fi\n"
        "  ```\n"
        "- working tree 不是暫存區。改動觸及 fragile surface（`tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py`、"
        "`tools/development-orchestrator/control_plane/**`、"
        "`tools/development-orchestrator/skills/**`、`tools/development-orchestrator/templates/*`、`docs/**`、`.github/workflows/**`、"
        "`.husky/*`、`config*.json`），或跨檔案、預計跨 supervisor cycle、即將 yield 時，"
        "立即 anchor commit：\n"
        f"  `git commit -m \"wip({task_id}): anchor <scope>\" -m \"LLM-Agent: {lane}\" "
        f"-m \"Task-ID: {task_id}\" -m \"Reviewer: <reviewer>\"`\n"
        "- 不要 `git stash` 帶有設計意圖的 diff。supervisor 把你切到別的 task 前，**先 commit**，不靠 stash。\n"
        f"- `{base_branch}` 前進過：`git fetch origin && git rebase origin/{base_branch}`，"
        "不要 `git stash pop` 在 moved trunk 上。\n"
        "- 完整協議與 trigger checklist：`tools/development-orchestrator/skills/worker-anchor-commit.md`。\n"
    )


def queue_delivery_event(config: dict[str, Any], event: dict[str, Any]) -> bool:
    target_agent = event.get("target_agent")
    if not target_agent:
        write_activity_log(
            config,
            {
                "type": "wake_skipped",
                "task_id": event.get("task_id"),
                "message": f"Skipped wake-up with no target agent for reason {event.get('reason')}.",
            },
        )
        return False

    agent = agent_config_for(config, target_agent)
    status = load_status(config)
    task_payload = event.get("task", {}) if isinstance(event.get("task"), dict) else {}
    message = render_wakeup_message(config, event, target_agent, status=status)
    context_files = []
    for path in selected_shared_files(
        config,
        mode=event_mode_bucket(event),
        task=task_payload,
        status=status,
    ):
        label = relpath(path)
        if label.startswith(".orchestrator/generated/task-briefs/"):
            continue
        context_files.append(label)
    raw_target_files = event.get("target_files") if "target_files" in event else task_payload.get("artifacts")
    target_files, _skipped_external_targets = repo_scoped_target_files(raw_target_files or [])
    queue_payload = {
        "event_id": new_runtime_id("evt"),
        "created_at": utc_now(),
        "event_key": event.get("key"),
        "task_id": event.get("task_id"),
        "target_agent": agent["id"],
        "target_display_name": display_name_for(config, agent["id"]),
        "provider": agent.get("provider", agent["id"]),
        "reason": event.get("reason"),
        "message": message,
        "context_files": context_files,
        "target_files": target_files,
        "metadata": {
            "handoff": event.get("handoff"),
            "task": task_payload,
            "mode": event_mode_bucket(event),
        },
    }
    enqueue_event(config, queue_payload)
    write_activity_log(
        config,
        {
            "type": "wake_queued",
            "task_id": event.get("task_id"),
            "target_agent": display_name_for(config, agent["id"]),
            "delivery_mode": config.get("providers", {}).get(agent.get("provider", agent["id"]), {}).get(
                "delivery_mode", agent.get("adapter", "file_inbox")
            ),
            "message": f"Wake-up queued for supervisor: {event.get('reason')}",
            "queue_event_id": queue_payload["event_id"],
        },
    )
    return True


def trim_seen_events(state: dict[str, Any], max_entries: int) -> None:
    seen = state.get("seen_event_keys", {})
    if len(seen) <= max_entries:
        return
    ordered = sorted(seen.items(), key=lambda item: item[1])
    state["seen_event_keys"] = dict(ordered[-max_entries:])


def run_scan(config: dict[str, Any], state: dict[str, Any], replay: bool, provider_capabilities: dict[str, Any]) -> bool:
    status = load_status(config)
    snapshot = build_snapshot(config, status)
    is_first_run = not state.get("initialized_at")
    if is_first_run and not replay and not config.get("watcher", {}).get("replay_on_start", False):
        state["initialized_at"] = utc_now()
        state["last_scan_at"] = utc_now()
        state.setdefault("watcher", {})["task_snapshots"] = snapshot["tasks"]
        state.pop("tasks", None)
        state["pending_handoff_keys"] = snapshot["pending_handoff_keys"]
        save_runtime_state(config, state)
        return False

    events = compute_events(state, snapshot, config)
    if replay:
        merged_events: dict[str, dict[str, Any]] = {}
        for event in compute_replay_events(snapshot, config):
            merged_events[event["key"]] = event
        for event in events:
            merged_events[event["key"]] = event
        events = list(merged_events.values())

    seen = state.setdefault("seen_event_keys", {})
    changed = False
    if enqueue_runtime_events_enabled(config):
        for event in events:
            if event["key"] in seen and not replay:
                continue
            queued = queue_delivery_event(config, event)
            if queued:
                seen[event["key"]] = utc_now()
                changed = True
    elif events:
        changed = True

    state["initialized_at"] = state.get("initialized_at") or utc_now()
    state["last_scan_at"] = utc_now()
    state.setdefault("watcher", {})["task_snapshots"] = snapshot["tasks"]
    state.pop("tasks", None)
    state["pending_handoff_keys"] = snapshot["pending_handoff_keys"]
    trim_seen_events(state, int(config.get("watcher", {}).get("max_seen_events", 2000)))
    save_runtime_state(config, state)
    return changed


def main() -> int:
    args = parse_args()
    config = load_config(args.config)
    state = load_runtime_state(config)
    provider_capabilities = load_json(config_path(config, "provider_capabilities"), default={})

    poll_interval = args.poll_interval or float(config.get("watcher", {}).get("poll_interval_seconds", 2.0))
    run_scan(config, state, replay=args.replay, provider_capabilities=provider_capabilities)
    if args.once:
        return 0

    while True:
        time.sleep(poll_interval)
        state = load_runtime_state(config)
        run_scan(config, state, replay=False, provider_capabilities=provider_capabilities)


if __name__ == "__main__":
    raise SystemExit(main())
