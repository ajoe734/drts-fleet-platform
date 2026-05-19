#!/usr/bin/env python3
from __future__ import annotations

import unittest
from unittest import mock

import worker_tree_guard


def _porcelain(paths: list[str]) -> mock.MagicMock:
    proc = mock.MagicMock()
    proc.returncode = 0
    proc.stdout = "\n".join(f" M {p}" for p in paths)
    proc.stderr = ""
    return proc


def _chatbox_config(*, log_only: bool = False) -> dict:
    return {
        "branch_strategy": {
            "worker_tree_guard": {
                "chatbox_enabled": True,
                "log_only": log_only,
                "blocking_globs": [
                    ".orchestrator/supervisor.py",
                    ".orchestrator/skills/**",
                    "docs/**",
                ],
            }
        }
    }


class WorkerTreeGuardChatboxSettingsTests(unittest.TestCase):
    def test_chatbox_enabled_defaults_off(self) -> None:
        settings = worker_tree_guard.worker_tree_guard_settings({})
        self.assertFalse(settings["chatbox_enabled"])

    def test_chatbox_and_dispatch_flags_are_independent(self) -> None:
        only_chatbox = worker_tree_guard.worker_tree_guard_settings(
            {"branch_strategy": {"worker_tree_guard": {"chatbox_enabled": True}}}
        )
        self.assertTrue(only_chatbox["chatbox_enabled"])
        self.assertFalse(only_chatbox["enabled"])

        only_dispatch = worker_tree_guard.worker_tree_guard_settings(
            {"branch_strategy": {"worker_tree_guard": {"enabled": True}}}
        )
        self.assertFalse(only_dispatch["chatbox_enabled"])
        self.assertTrue(only_dispatch["enabled"])


class CheckChatboxTreeGuardTests(unittest.TestCase):
    def test_chatbox_disabled_returns_none(self) -> None:
        result = worker_tree_guard.check_chatbox_tree_guard({}, tool_name="Edit")
        self.assertIsNone(result)

    def test_chatbox_skips_non_writing_tools(self) -> None:
        with mock.patch.object(
            worker_tree_guard.subprocess,
            "run",
            return_value=_porcelain([".orchestrator/supervisor.py"]),
        ):
            for tool in ["Bash", "Read", "Grep", "Glob", "WebFetch", "Task"]:
                with self.subTest(tool=tool):
                    self.assertIsNone(
                        worker_tree_guard.check_chatbox_tree_guard(
                            _chatbox_config(), tool_name=tool
                        )
                    )

    def test_chatbox_blocks_each_writing_tool_on_dirty_fragile_surface(self) -> None:
        for tool in ["Edit", "Write", "MultiEdit", "NotebookEdit"]:
            with self.subTest(tool=tool):
                with mock.patch.object(
                    worker_tree_guard.subprocess,
                    "run",
                    return_value=_porcelain([".orchestrator/skills/task-closeout.md"]),
                ):
                    result = worker_tree_guard.check_chatbox_tree_guard(
                        _chatbox_config(), tool_name=tool
                    )
                self.assertIsNotNone(result)
                self.assertEqual(
                    result["dirty_paths"], [".orchestrator/skills/task-closeout.md"]
                )
                self.assertIn(".orchestrator/skills/**", result["matched_globs"])
                self.assertFalse(result["log_only"])

    def test_chatbox_log_only_flag_carries_through(self) -> None:
        with mock.patch.object(
            worker_tree_guard.subprocess,
            "run",
            return_value=_porcelain([".orchestrator/supervisor.py"]),
        ):
            result = worker_tree_guard.check_chatbox_tree_guard(
                _chatbox_config(log_only=True), tool_name="Edit"
            )
        self.assertIsNotNone(result)
        self.assertTrue(result["log_only"])

    def test_chatbox_clean_tree_returns_none(self) -> None:
        with mock.patch.object(
            worker_tree_guard.subprocess, "run", return_value=_porcelain([])
        ):
            result = worker_tree_guard.check_chatbox_tree_guard(
                _chatbox_config(), tool_name="Edit"
            )
        self.assertIsNone(result)

    def test_chatbox_runtime_state_dirty_is_not_fragile(self) -> None:
        with mock.patch.object(
            worker_tree_guard.subprocess,
            "run",
            return_value=_porcelain(["ai-status.json", "current-work.md"]),
        ):
            result = worker_tree_guard.check_chatbox_tree_guard(
                _chatbox_config(), tool_name="Edit"
            )
        self.assertIsNone(result)

    def test_chatbox_independent_of_dispatch_flag(self) -> None:
        """chatbox_enabled drives chatbox guard alone, even if dispatch is off."""
        config = {
            "branch_strategy": {
                "worker_tree_guard": {
                    "enabled": False,
                    "chatbox_enabled": True,
                    "blocking_globs": [".orchestrator/supervisor.py"],
                }
            }
        }
        with mock.patch.object(
            worker_tree_guard.subprocess,
            "run",
            return_value=_porcelain([".orchestrator/supervisor.py"]),
        ):
            self.assertIsNotNone(
                worker_tree_guard.check_chatbox_tree_guard(config, tool_name="Edit")
            )
            # Dispatch guard stays off.
            self.assertIsNone(
                worker_tree_guard.check_worker_tree_guard(config, reason=None)
            )

    def test_chatbox_off_means_dirty_tree_does_not_block(self) -> None:
        """Inverse: dispatch on, chatbox off → chatbox writes still allowed."""
        config = {
            "branch_strategy": {
                "worker_tree_guard": {
                    "enabled": True,
                    "chatbox_enabled": False,
                    "blocking_globs": [".orchestrator/supervisor.py"],
                }
            }
        }
        with mock.patch.object(
            worker_tree_guard.subprocess,
            "run",
            return_value=_porcelain([".orchestrator/supervisor.py"]),
        ):
            self.assertIsNone(
                worker_tree_guard.check_chatbox_tree_guard(config, tool_name="Edit")
            )

    def test_chatbox_git_failure_fails_open(self) -> None:
        proc = mock.MagicMock()
        proc.returncode = 128
        proc.stdout = ""
        proc.stderr = "fatal: not a git repository"
        with mock.patch.object(worker_tree_guard.subprocess, "run", return_value=proc):
            result = worker_tree_guard.check_chatbox_tree_guard(
                _chatbox_config(), tool_name="Edit"
            )
        self.assertIsNone(
            result, "chatbox guard must not block on its own diagnostic failure"
        )


if __name__ == "__main__":
    unittest.main()
