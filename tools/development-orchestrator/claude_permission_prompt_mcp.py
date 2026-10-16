#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, BinaryIO

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from approval_queue import create_approval, wait_for_decision
from common import load_config, write_activity_log
from permission_broker import evaluate_tool_request


SERVER_NAME = "orchestrator_approval_broker"
TOOL_NAME = "approval_prompt"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Minimal MCP server for Claude permission prompts.")
    parser.add_argument("--config", default=".orchestrator/config.json")
    return parser.parse_args()


class StdioCodec:
    """Newline-delimited MCP, with session-local legacy header compatibility."""

    MAX_MESSAGE_BYTES = 1024 * 1024
    MAX_HEADER_BYTES = 8192

    def __init__(self, reader: BinaryIO, writer: BinaryIO):
        self.reader = reader
        self.writer = writer
        self.legacy: bool | None = None

    def _line(self, limit: int) -> bytes:
        line = self.reader.readline(limit + 1)
        if len(line) > limit:
            raise ValueError("frame limit exceeded")
        if line and not line.endswith(b"\n"):
            raise ValueError("unterminated line")
        return line

    def read_message(self) -> dict[str, Any] | None:
        line = self._line(self.MAX_MESSAGE_BYTES)
        if not line:
            return None
        if self.legacy is None:
            self.legacy = line.lower().startswith(b"content-length:")
        if self.legacy:
            headers: dict[bytes, bytes] = {}
            header_bytes = 0
            while line not in {b"\r\n", b"\n"}:
                header_bytes += len(line)
                if not line or header_bytes > self.MAX_HEADER_BYTES or b":" not in line:
                    raise ValueError("invalid legacy header")
                key, value = line.strip().split(b":", 1)
                key = key.strip().lower()
                if not key or key in headers:
                    raise ValueError("invalid legacy header")
                headers[key] = value.strip()
                line = self._line(self.MAX_HEADER_BYTES - header_bytes)
            raw_length = headers.get(b"content-length", b"")
            if not raw_length.isdigit() or len(raw_length) > 10:
                raise ValueError("invalid content length")
            length = int(raw_length)
            if not 0 < length <= self.MAX_MESSAGE_BYTES:
                raise ValueError("invalid content length")
            payload = self.reader.read(length)
            if len(payload) != length:
                raise ValueError("truncated body")
        else:
            payload = line
        message = json.loads(payload.decode("utf-8"))
        if not isinstance(message, dict):
            raise ValueError("expected a JSON-RPC object")
        return message

    def write_message(self, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        if self.legacy:
            self.writer.write(f"Content-Length: {len(body)}\r\n\r\n".encode("ascii") + body)
        else:
            self.writer.write(body + b"\n")
        self.writer.flush()


def text_result(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps(payload, ensure_ascii=False),
            }
        ]
    }


def approval_context() -> dict[str, Any]:
    return {
        "worker_run_id": os.environ.get("ORCH_RUN_ID"),
        "task_id": os.environ.get("ORCH_TASK_ID"),
        "agent_id": os.environ.get("ORCH_AGENT_ID"),
    }


def handle_tool_call(config: dict[str, Any], args: dict[str, Any]) -> dict[str, Any]:
    tool_name = args.get("tool_name") or args.get("toolName")
    tool_input = args.get("input") or args.get("tool_input") or args.get("toolInput") or {}
    decision = evaluate_tool_request(str(tool_name or ""), tool_input, config)
    context = approval_context()

    timeout = float(
        config.get("providers", {})
        .get("claude", {})
        .get("broker", {})
        .get("approval_wait_seconds", 3600)
    )
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=timeout)
    ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if decision["decision"] == "allow":
        write_activity_log(
            config,
            {
                "type": "approval_auto_allow",
                "provider": "claude",
                "task_id": context.get("task_id"),
                "message": f"Auto-approved {tool_name}",
                "worker_run_id": context.get("worker_run_id"),
                "tool_name": tool_name,
            },
        )
        return text_result({"behavior": "allow", "updatedInput": tool_input})

    if decision["decision"] == "deny":
        write_activity_log(
            config,
            {
                "type": "approval_auto_deny",
                "provider": "claude",
                "task_id": context.get("task_id"),
                "message": f"Auto-denied {tool_name}",
                "worker_run_id": context.get("worker_run_id"),
                "tool_name": tool_name,
            },
        )
        return text_result({"behavior": "deny", "message": decision["reason"]})

    approval = create_approval(
        config,
        {
            "provider": "claude",
            "task_id": context.get("task_id"),
            "worker_run_id": context.get("worker_run_id"),
            "session_id": os.environ.get("ORCH_SESSION_ID"),
            "tool_name": tool_name,
            "tool_input": tool_input,
            "risk_class": decision["risk_class"],
            "suggested_rule": decision.get("suggested_rule"),
            "expires_at": expires_at,
        },
    )
    resolved = wait_for_decision(config, approval["approval_id"], timeout_seconds=timeout)
    if resolved.get("decision") == "allow":
        return text_result({"behavior": "allow", "updatedInput": tool_input})
    message = resolved.get("note") or "Approval was denied or timed out."
    return text_result({"behavior": "deny", "message": message})


def main() -> int:
    args = parse_args()
    config = load_config(args.config)
    codec = StdioCodec(sys.stdin.buffer, sys.stdout.buffer)
    while True:
        try:
            message = codec.read_message()
        except (ValueError, UnicodeError, RecursionError):
            # Do not echo potentially sensitive tool input or contaminate stdout.
            print("Invalid MCP stdio input; closing transport.", file=sys.stderr)
            return 1
        if message is None:
            return 0
        method = message.get("method")
        if method == "exit":
            return 0
        if "id" not in message:
            continue
        if method == "initialize":
            codec.write_message(
                {
                    "jsonrpc": "2.0",
                    "id": message.get("id"),
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": SERVER_NAME, "version": "0.1.0"},
                    },
                }
            )
            continue
        if method == "notifications/initialized":
            continue
        if method == "ping":
            codec.write_message({"jsonrpc": "2.0", "id": message.get("id"), "result": {}})
            continue
        if method == "tools/list":
            codec.write_message(
                {
                    "jsonrpc": "2.0",
                    "id": message.get("id"),
                    "result": {
                        "tools": [
                            {
                                "name": TOOL_NAME,
                                "description": "Decide whether Claude may proceed with a permission-requiring tool call.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "tool_name": {"type": "string"},
                                        "input": {"type": "object"},
                                    },
                                    "required": ["tool_name", "input"],
                                },
                            }
                        ]
                    },
                }
            )
            continue
        if method == "tools/call":
            params = message.get("params", {})
            if params.get("name") != TOOL_NAME:
                codec.write_message(
                    {
                        "jsonrpc": "2.0",
                        "id": message.get("id"),
                        "error": {"code": -32601, "message": f"Unknown tool {params.get('name')}"},
                    }
                )
                continue
            result = handle_tool_call(config, params.get("arguments", {}))
            codec.write_message({"jsonrpc": "2.0", "id": message.get("id"), "result": result})
            continue
        if method == "shutdown":
            codec.write_message({"jsonrpc": "2.0", "id": message.get("id"), "result": {}})
            continue
        codec.write_message(
            {
                "jsonrpc": "2.0",
                "id": message.get("id"),
                "error": {"code": -32601, "message": f"Unsupported method: {method}"},
            }
        )


if __name__ == "__main__":
    raise SystemExit(main())
