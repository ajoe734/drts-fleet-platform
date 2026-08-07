#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from unittest import mock

import permission_broker


class PreToolUseDeferResponseTests(unittest.TestCase):
    """A deferred PreToolUse must hand back a decision the harness can read.

    `permissionDecision` accepts allow/deny/ask. Emitting "defer" gave the
    harness a value it could not act on, so the tool call hung instead of
    prompting — and the request was queued for a reviewer that an interactive
    session does not have.
    """

    PAYLOAD = {
        "tool_name": "Bash",
        "tool_input": {"command": "docker ps"},
        "session_id": "session-under-test",
    }

    def _run_hook(self, payload: dict) -> dict:
        config = permission_broker.load_config()
        buffer = io.StringIO()
        with mock.patch.object(permission_broker, "create_approval") as create, \
                mock.patch.object(permission_broker, "log_event"), \
                mock.patch.object(permission_broker, "_maybe_apply_chatbox_tree_guard", return_value=False), \
                mock.patch.object(permission_broker, "find_resume_override", return_value=None), \
                mock.patch.object(permission_broker, "_matching_approval", return_value=(None, None)), \
                redirect_stdout(buffer):
            permission_broker.hook_mode(config, "PreToolUse", payload)
        self.created = create
        return json.loads(buffer.getvalue() or "{}")

    def test_defer_asks_instead_of_emitting_an_unreadable_decision(self) -> None:
        response = self._run_hook(dict(self.PAYLOAD))
        self.assertEqual(
            response["hookSpecificOutput"]["permissionDecision"], "ask"
        )

    def test_unattributed_session_is_not_queued_for_review(self) -> None:
        self._run_hook(dict(self.PAYLOAD))
        self.created.assert_not_called()

    def test_worker_lane_request_is_still_queued(self) -> None:
        with mock.patch.dict("os.environ", {"ORCH_TASK_ID": "TASK-001"}):
            self._run_hook(dict(self.PAYLOAD))
        self.created.assert_called_once()


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


class ClassifyCommandCdPrefixTests(unittest.TestCase):
    """`cd <workspace> && <cmd>` must classify as <cmd>, not fall through to defer.

    Every SAFE/DENY/DEFER pattern is ^-anchored, so an unstripped `cd` prefix made
    read-only commands defer forever: the session that ran them had no task_id, and
    the approval policy denies unattributed sessions. The prefix must not carry the
    command out of the allowed roots either.
    """

    ROOT = str(permission_broker.ROOT)

    def test_read_only_commands_behind_cd_are_allowed(self) -> None:
        for suffix in (
            "ls .orchestrator/",
            "find . -name 'github_bus.py'",
            'grep -rn "pantheon" --include=*.py .orchestrator',
            "rg -l 'task-review-gate' --hidden | head -50",
            "wc -l .orchestrator/github_bus.py",
        ):
            command = f"cd {self.ROOT} && {suffix}"
            with self.subTest(command=command):
                self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_semicolon_and_redirected_cd_prefix_is_stripped(self) -> None:
        command = f"cd {self.ROOT} 2>/dev/null; grep -rn 'x' .orchestrator"
        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_denied_commands_behind_cd_are_still_denied(self) -> None:
        for suffix in ("sudo rm -rf /", "git reset --hard origin/main", "chmod 777 ."):
            command = f"cd {self.ROOT} && {suffix}"
            with self.subTest(command=command):
                self.assertEqual(permission_broker.classify_command(command), "deny")

    def test_cd_outside_allowed_roots_is_not_stripped(self) -> None:
        for command in (
            "cd /etc && ls",
            "cd ~/.ssh && cat id_rsa",
            "cd $HOME/.ssh && cat id_rsa",
        ):
            with self.subTest(command=command):
                self.assertEqual(permission_broker.classify_command(command), "defer")

    def test_relative_traversal_out_of_workspace_is_not_stripped(self) -> None:
        for command in ("cd ../../etc && cat shadow", "cd ../.ssh && cat id_rsa"):
            with self.subTest(command=command):
                self.assertEqual(permission_broker.classify_command(command), "defer")

    def test_redirected_cd_prefix_is_stripped_in_every_spelling(self) -> None:
        for prefix in (
            f"cd {self.ROOT} 2>/dev/null",
            f"cd {self.ROOT} 2> /dev/null",
            f"cd {self.ROOT} >/dev/null 2>&1",
        ):
            command = f"{prefix} && ls -lat | head -30"
            with self.subTest(command=command):
                self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_cd_into_scratch_directory_is_allowed(self) -> None:
        command = "cd /tmp/claude-scratch && ls -la"
        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_cd_into_nested_worktree_is_allowed(self) -> None:
        command = f"cd {self.ROOT}/workspace/supervisor-runtime-dev/.orchestrator 2>/dev/null && ls -lat | head -30"
        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_invocation_prefixes_do_not_hide_the_real_command(self) -> None:
        for command, expected in (
                ("timeout 900 npm run typecheck 2>&1 | tail -15", "allow"),
                ("PYTHONPATH=.orchestrator python3 -m unittest test_supervisor", "allow"),
                ("PYTHONPATH=.orchestrator timeout 900 python3 -m unittest test_supervisor", "allow"),
                ("timeout -k 10 900 pnpm exec vitest run", "allow"),
                ("timeout 5 sudo ls", "deny"),
                ("FOO=1 sudo rm -rf /", "deny"),
                ("timeout 900 docker ps", "defer"),
        ):
            with self.subTest(command=command):
                self.assertEqual(permission_broker.classify_command(command), expected)

    def test_command_substitution_is_judged_by_its_body(self) -> None:
        for command, expected in (
                ("git grep -ln OpenRoute $(git rev-parse HEAD)", "allow"),
                ("grep -c x $(readlink -f apps/api/node_modules/@drts/contracts)/index.d.ts", "allow"),
                ("echo $(sudo cat /etc/shadow)", "deny"),
                ("echo $(docker ps)", "defer"),
        ):
            with self.subTest(command=command):
                self.assertEqual(permission_broker.classify_command(command), expected)

    def test_read_only_inspection_commands_are_allowed(self) -> None:
        for command in (
            "readlink -f apps/api/node_modules/@drts/contracts",
            "git config --get-all remote.origin.fetch",
            "stat -c '%y %n' .orchestrator/state.json",
            "systemctl --user list-units --type=service --all",
        ):
            with self.subTest(command=command):
                self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_unprefixed_commands_are_unchanged(self) -> None:
        for command, expected in (
            ("ls /tmp", "allow"),
            ("pwd", "allow"),
            ("docker ps", "defer"),
            ("npm install foo", "defer"),
            ("sudo apt install foo", "deny"),
        ):
            with self.subTest(command=command):
                self.assertEqual(permission_broker.classify_command(command), expected)


if __name__ == "__main__":
    unittest.main()
