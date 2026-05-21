#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from unittest import mock

import permission_broker


class PermissionBrokerLoggingTests(unittest.TestCase):
    def test_sanitize_hook_payload_summarizes_large_edit_and_stdout(self) -> None:
        payload = {
            "tool_name": "Write",
            "tool_input": {
                "file_path": "/tmp/demo.txt",
                "content": "A" * 500,
            },
            "tool_response": {
                "stdout": "B" * 600,
                "stderr": "",
            },
        }

        sanitized = permission_broker.sanitize_hook_payload(payload)

        self.assertEqual(sanitized["tool_name"], "Write")
        self.assertEqual(sanitized["tool_input"]["file_path"], "/tmp/demo.txt")
        self.assertEqual(sanitized["tool_input"]["content"]["chars"], 500)
        self.assertTrue(sanitized["tool_input"]["content"]["truncated"])
        self.assertIn("sha256", sanitized["tool_input"]["content"])
        self.assertEqual(sanitized["tool_response"]["stdout"]["chars"], 600)
        self.assertTrue(sanitized["tool_response"]["stdout"]["truncated"])
        self.assertEqual(sanitized["tool_response"]["stderr"], "")

    def test_hook_log_message_summarizes_raw_payload(self) -> None:
        raw = "R" * 500
        message = permission_broker.hook_log_message("PostToolUse", {"raw": raw})

        self.assertIn("raw:", message)
        self.assertIn("sha256=", message)
        self.assertIn("chars=500", message)
        self.assertNotIn(raw, message)


def _block_payload(*, log_only: bool = False) -> dict:
    return {
        "offenders": [
            {"path": ".orchestrator/skills/foo.md", "glob": ".orchestrator/skills/**"},
            {"path": ".orchestrator/supervisor.py", "glob": ".orchestrator/supervisor.py"},
        ],
        "dirty_paths": [
            ".orchestrator/skills/foo.md",
            ".orchestrator/supervisor.py",
        ],
        "matched_globs": [
            ".orchestrator/skills/**",
            ".orchestrator/supervisor.py",
        ],
        "log_only": log_only,
    }


class ChatboxTreeGuardReasonTests(unittest.TestCase):
    def test_reason_mentions_dirty_paths_and_anchor_protocol(self) -> None:
        reason = permission_broker._chatbox_tree_guard_reason(_block_payload())
        self.assertIn(".orchestrator/skills/foo.md", reason)
        self.assertIn("anchor-commit", reason.lower())
        self.assertIn("branch-strategy.md", reason)

    def test_reason_truncates_dirty_paths_past_five(self) -> None:
        block = _block_payload()
        block["dirty_paths"] = [f"docs/page-{i}.md" for i in range(8)]
        reason = permission_broker._chatbox_tree_guard_reason(block)
        self.assertIn("docs/page-0.md", reason)
        self.assertIn("docs/page-4.md", reason)
        self.assertIn("+3 more", reason)
        self.assertNotIn("docs/page-5.md", reason)


class MaybeApplyChatboxTreeGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self._log_patch = mock.patch.object(
            permission_broker, "write_activity_log", return_value=None
        )
        self._log_patch.start()
        self.addCleanup(self._log_patch.stop)

    def _run(
        self,
        *,
        guard_return: dict | None = None,
        tool_name: str = "Edit",
        guard_raises: Exception | None = None,
    ) -> tuple[bool, str]:
        if guard_raises is not None:
            patcher = mock.patch.object(
                permission_broker,
                "check_chatbox_tree_guard",
                side_effect=guard_raises,
            )
        else:
            patcher = mock.patch.object(
                permission_broker,
                "check_chatbox_tree_guard",
                return_value=guard_return,
            )
        buf = io.StringIO()
        with patcher, redirect_stdout(buf):
            stopped = permission_broker._maybe_apply_chatbox_tree_guard(
                {}, {"tool_name": tool_name, "tool_input": {}}, tool_name
            )
        return stopped, buf.getvalue()

    def test_returns_false_when_guard_returns_none(self) -> None:
        stopped, stdout = self._run(guard_return=None)
        self.assertFalse(stopped)
        self.assertEqual(stdout, "")

    def test_emits_deny_when_guard_blocks(self) -> None:
        stopped, stdout = self._run(guard_return=_block_payload())
        self.assertTrue(stopped)
        response = json.loads(stdout)
        hook_out = response["hookSpecificOutput"]
        self.assertEqual(hook_out["hookEventName"], "PreToolUse")
        self.assertEqual(hook_out["permissionDecision"], "deny")
        self.assertIn(
            "uncommitted edits on fragile surfaces",
            hook_out["permissionDecisionReason"],
        )

    def test_log_only_mode_does_not_emit_deny(self) -> None:
        stopped, stdout = self._run(guard_return=_block_payload(log_only=True))
        self.assertFalse(
            stopped,
            "log_only must fall through so the rest of PreToolUse runs",
        )
        self.assertEqual(stdout, "")

    def test_fails_open_when_guard_raises(self) -> None:
        stopped, stdout = self._run(guard_raises=RuntimeError("boom"))
        self.assertFalse(
            stopped,
            "guard implementation errors must never break the hook pipeline",
        )
        self.assertEqual(stdout, "")

    def test_log_event_captures_block_telemetry(self) -> None:
        captured: list[dict] = []

        def _capture(_config, _event_name, payload):
            captured.append(payload)

        with mock.patch.object(
            permission_broker, "log_event", side_effect=_capture
        ), mock.patch.object(
            permission_broker,
            "check_chatbox_tree_guard",
            return_value=_block_payload(),
        ), redirect_stdout(io.StringIO()):
            permission_broker._maybe_apply_chatbox_tree_guard(
                {}, {"tool_name": "Edit", "tool_input": {}}, "Edit"
            )

        self.assertEqual(len(captured), 1)
        entry = captured[0]
        self.assertEqual(entry["effective_decision"], "deny")
        self.assertEqual(entry["effective_reason"], "chatbox_tree_guard_blocked")
        self.assertEqual(entry["tree_guard"]["total_dirty"], 2)
        self.assertIn(".orchestrator/skills/**", entry["tree_guard"]["matched_globs"])


if __name__ == "__main__":
    unittest.main()
