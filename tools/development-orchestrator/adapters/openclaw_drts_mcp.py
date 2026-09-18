#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

# parents[2] is `tools/`, not the repository. That was already wrong before
# release copies existed: `drts_task_slice` runs
# `bash tools/development-orchestrator/bin/ai-status.sh` with this as its cwd,
# which resolved to <repo>/tools/tools/... -- a path that has never existed --
# under check=True, so the tool could only ever raise.
SOURCE_ROOT = Path(__file__).resolve().parents[3]


def _canonical_root() -> Path:
    """The checkout that owns machine truth, not the one holding this file.

    The environment is the authoritative answer and every adapter stamps it,
    but this module is also reachable as a bare MCP server started by a client
    that stamps nothing. Falling straight back to SOURCE_ROOT then names a
    release copy, which owns no `.orchestrator/` and never will, so git's own
    answer goes in between -- the same order run-supervisor.sh and common.py
    already use.
    """
    for name in ("ORCH_STATUS_ROOT", "AI_STATUS_ROOT"):
        raw = os.environ.get(name)
        if raw:
            return Path(raw).resolve()
    if (SOURCE_ROOT / ".orchestrator" / "config.json").exists():
        return SOURCE_ROOT.resolve()
    try:
        result = subprocess.run(
            ["git", "-C", str(SOURCE_ROOT), "rev-parse",
             "--path-format=absolute", "--git-common-dir"],
            capture_output=True, text=True, timeout=3, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return SOURCE_ROOT.resolve()
    common_dir = Path(result.stdout.strip()) if result.returncode == 0 and result.stdout.strip() else None
    if common_dir is not None and common_dir.name == ".git":
        return common_dir.parent.resolve()
    return SOURCE_ROOT.resolve()


CANONICAL_ROOT = _canonical_root()
# Both the shell helper and the branch read are questions about the checkout
# that owns machine truth, not about wherever this file was copied to.
REPO_ROOT = CANONICAL_ROOT
MCP_LOG = os.environ.get("DRTS_OPENCLAW_MCP_LOG")
PROTOCOL_VERSION = "2024-11-05"


def log_event(event: dict[str, Any]) -> None:
    if not MCP_LOG:
        return
    path = Path(MCP_LOG)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")


def send(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def make_text_result(payload: Any) -> dict[str, Any]:
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps(payload, ensure_ascii=False, indent=2),
            }
        ]
    }


def tool_list() -> list[dict[str, Any]]:
    return [
        {
            "name": "drts_runtime_profile",
            "description": "Report the bounded DRTS OpenClaw runtime profile without exposing secrets.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
        },
        {
            "name": "drts_task_slice",
            "description": "Read one task slice from ai-status machine truth using tools/development-orchestrator/bin/ai-status.sh show.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "pattern": "^[A-Z0-9-]+$",
                    }
                },
                "required": ["task_id"],
                "additionalProperties": False,
            },
        },
        {
            "name": "drts_echo_guarded",
            "description": "Return a bounded stub payload for smoke tests and tool-call verification.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "message": {"type": "string", "maxLength": 160}
                },
                "required": ["message"],
                "additionalProperties": False,
            },
        },
    ]


def handle_tool_call(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if name == "drts_runtime_profile":
        payload = {
            "repo_root": str(REPO_ROOT),
            "status_root": str(CANONICAL_ROOT),
            "token_injected": os.environ.get("DRTS_OPENCLAW_TOKEN_INJECTED") == "true",
            "token_value_present": bool(os.environ.get("DRTS_OPENCLAW_BEARER_TOKEN")),
            "workspace_branch": git_branch(),
        }
        return make_text_result(payload)

    if name == "drts_task_slice":
        task_id = str(arguments.get("task_id", "")).strip()
        if not task_id:
            raise ValueError("task_id is required")
        result = subprocess.run(
            ["bash", "tools/development-orchestrator/bin/ai-status.sh", "show", task_id],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=True,
            env=os.environ.copy(),
        )
        return {
            "content": [{"type": "text", "text": result.stdout.strip()}],
        }

    if name == "drts_echo_guarded":
        message = str(arguments.get("message", "")).strip()
        return make_text_result(
            {
                "adapter": "drts_echo_guarded",
                "message": message[:160],
                "guardrails": [
                    "repo-local stub adapter",
                    "no secret material returned",
                    "no broad filesystem or network access",
                ],
            }
        )

    raise ValueError(f"Unsupported tool: {name}")


def git_branch() -> str | None:
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    branch = result.stdout.strip()
    return branch or None


def main() -> int:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        message = json.loads(line)
        method = message.get("method")
        msg_id = message.get("id")
        params = message.get("params") or {}
        log_event({"method": method, "id": msg_id, "params": params})

        if method == "notifications/initialized":
            continue

        if method == "initialize":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "protocolVersion": params.get(
                            "protocolVersion", PROTOCOL_VERSION
                        ),
                        "capabilities": {"tools": {}},
                        "serverInfo": {
                            "name": "drts-openclaw-mcp",
                            "version": "0.1.0",
                        },
                    },
                }
            )
            continue

        if method == "tools/list":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {"tools": tool_list()},
                }
            )
            continue

        if method == "tools/call":
            try:
                tool_name = str(params.get("name") or "")
                arguments = params.get("arguments") or {}
                result = handle_tool_call(tool_name, arguments)
                send({"jsonrpc": "2.0", "id": msg_id, "result": result})
            except Exception as exc:  # pragma: no cover - smoke helper path
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "error": {
                            "code": -32000,
                            "message": str(exc),
                        },
                    }
                )
            continue

        send(
            {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32601, "message": f"Unknown method: {method}"},
            }
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
