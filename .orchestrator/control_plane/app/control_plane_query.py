#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ORCHESTRATOR_DIR = Path(__file__).resolve().parents[2]
if str(ORCHESTRATOR_DIR) not in sys.path:
    sys.path.insert(0, str(ORCHESTRATOR_DIR))

from branch_routing import route_task
from common import deep_merge, load_json
from control_plane.domain.dispatch_policy import (
    ReadyDispatchPolicy,
    dispatch_preview,
    task_index,
)
from control_plane.infra.queue_repo import QueueRepository


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Query canonical supervisor policy.")
    parser.add_argument("--config", default=str(ORCHESTRATOR_DIR / "config.json"))
    subparsers = parser.add_subparsers(dest="command", required=True)
    route = subparsers.add_parser("route-task")
    route.add_argument("task_id")
    preview = subparsers.add_parser("dispatch-preview")
    preview.add_argument("task_id")
    preview.add_argument("--source", default="control-plane-query")
    enqueue = subparsers.add_parser("enqueue-dispatch")
    enqueue.add_argument("task_id")
    enqueue.add_argument("--source", default="control-plane-query")
    subparsers.add_parser("policy")
    subparsers.add_parser("summary")
    return parser


def _load_query_config(path: str) -> tuple[dict[str, Any], Path]:
    config_file = Path(path).resolve()
    root = config_file.parent.parent
    config = load_json(config_file, default={})
    local_config = config_file.with_name("config.local.json")
    if local_config.exists():
        config = deep_merge(config, load_json(local_config, default={}))
    return config, root


def _rooted_config_path(
    config: dict[str, Any], root: Path, key: str, fallback: str
) -> Path:
    path = Path(str((config.get("paths") or {}).get(key) or fallback))
    return path if path.is_absolute() else root / path


def query(argv: list[str] | None = None) -> dict[str, Any]:
    args = _parser().parse_args(argv)
    config, root = _load_query_config(args.config)
    if args.command == "route-task":
        return {"ok": True, "route": route_task(args.task_id, config).as_dict()}
    policy = ReadyDispatchPolicy.from_config(config)
    if args.command == "policy":
        return {"ok": True, "ready_dispatch": policy.as_mapping()}
    if args.command == "summary":
        summary = load_json(
            _rooted_config_path(
                config,
                root,
                "control_plane_summary",
                ".orchestrator/projections/control-plane-summary.json",
            ),
            default=None,
        )
        if not isinstance(summary, dict):
            return {"ok": False, "error": "summary_not_available"}
        return {"ok": True, "summary": summary}
    status = load_json(
        _rooted_config_path(config, root, "status_file", "ai-status.json"),
        default={"tasks": []},
    )
    tasks = task_index(status.get("tasks", []))
    task = tasks.get(args.task_id)
    if task is None:
        return {"ok": False, "error": "task_not_found", "task_id": args.task_id}
    preview = dispatch_preview(task, tasks, policy, source=args.source)
    if args.command == "enqueue-dispatch":
        if preview is None:
            return {
                "ok": False,
                "error": "task_not_dispatchable",
                "task_id": args.task_id,
            }
        queue_path = _rooted_config_path(
            config,
            root,
            "event_queue",
            ".orchestrator/event-queue.jsonl",
        )
        queued = QueueRepository(queue_path).enqueue(preview["queue_event"])
        return {
            "ok": True,
            "task_id": args.task_id,
            "queued": queued,
            "dispatch": preview,
        }
    return {"ok": True, "task_id": args.task_id, "dispatch": preview}


def main(argv: list[str] | None = None) -> int:
    result = query(argv)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
