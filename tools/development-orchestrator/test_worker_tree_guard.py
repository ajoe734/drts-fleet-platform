#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
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
                    "tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py",
                    "tools/development-orchestrator/skills/**",
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
            return_value=_porcelain(["tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py"]),
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
                    return_value=_porcelain(["tools/development-orchestrator/skills/task-closeout.md"]),
                ):
                    result = worker_tree_guard.check_chatbox_tree_guard(
                        _chatbox_config(), tool_name=tool
                    )
                self.assertIsNotNone(result)
                self.assertEqual(
                    result["dirty_paths"], ["tools/development-orchestrator/skills/task-closeout.md"]
                )
                self.assertIn("tools/development-orchestrator/skills/**", result["matched_globs"])
                self.assertFalse(result["log_only"])

    def test_chatbox_log_only_flag_carries_through(self) -> None:
        with mock.patch.object(
            worker_tree_guard.subprocess,
            "run",
            return_value=_porcelain(["tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py"]),
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
                    "blocking_globs": ["tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py"],
                }
            }
        }
        with mock.patch.object(
            worker_tree_guard.subprocess,
            "run",
            return_value=_porcelain(["tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py"]),
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
                    "blocking_globs": ["tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py"],
                }
            }
        }
        with mock.patch.object(
            worker_tree_guard.subprocess,
            "run",
            return_value=_porcelain(["tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py"]),
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


MODULE = Path(__file__).resolve().parent / "worker_tree_guard.py"


class GuardedRootIsTheCanonicalCheckoutTests(unittest.TestCase):
    """The guard has to look at the tree whose work is at risk.

    `THIS_DIR.parent` answers where this file lives. Once the supervisor moved
    to a pinned release that became `.artifacts/releases/<name>/tools` -- a
    worktree clean by construction -- so the guard could never fire and
    enabling it was a no-op with an on-switch.
    """

    def _run_from_release_copy(self, driver: str) -> str:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            repo = tmp / "canonical"
            repo.mkdir()
            run = lambda *a: subprocess.run(["git", "-C", str(repo), *a], check=True, capture_output=True)
            subprocess.run(["git", "init", "-q", "-b", "dev", str(repo)], check=True)
            run("config", "user.email", "t@example.com")
            run("config", "user.name", "t")
            (repo / ".gitignore").write_text(".artifacts/\n.orchestrator/\n", encoding="utf-8")
            docs = repo / "docs"
            docs.mkdir()
            (docs / "design.md").write_text("committed\n", encoding="utf-8")
            run("add", ".gitignore", "docs/design.md")
            run("commit", "-qm", "seed")
            # The uncommitted design-intent work the guard exists to protect.
            (docs / "design.md").write_text("uncommitted intent\n", encoding="utf-8")

            release = repo / ".artifacts" / "releases" / "orchestrator-test"
            run("worktree", "add", "--detach", "-q", str(release))
            staged = release / "tools" / "development-orchestrator"
            staged.mkdir(parents=True, exist_ok=True)
            shutil.copy2(MODULE, staged / MODULE.name)
            shutil.copy2(MODULE.parent / "common.py", staged / "common.py")

            env = {k: v for k, v in os.environ.items() if k not in ("ORCH_STATUS_ROOT", "AI_STATUS_ROOT")}
            result = subprocess.run(
                [sys.executable, "-c", driver],
                cwd=str(staged), capture_output=True, text=True, check=False, env=env,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            return result.stdout.strip()

    def test_a_release_copy_guards_the_canonical_checkout(self) -> None:
        output = self._run_from_release_copy(
            "import sys; sys.path.insert(0, '.');"
            "import worker_tree_guard as g; print(g._guarded_root())"
        )
        self.assertTrue(output.endswith("canonical"), output)
        self.assertNotIn(".artifacts/releases", output)

    def test_uncommitted_fragile_work_is_seen_from_a_release_copy(self) -> None:
        """The behaviour, not just the path: the guard must actually fire."""
        output = self._run_from_release_copy(
            "import sys, json; sys.path.insert(0, '.');"
            "import worker_tree_guard as g;"
            "cfg = {'branch_strategy': {'worker_tree_guard': {'enabled': True}}};"
            "block = g.check_worker_tree_guard(cfg, reason=None);"
            "print(json.dumps(sorted(block['dirty_paths']) if block else []))"
        )
        self.assertEqual(json.loads(output), ["docs/design.md"])


if __name__ == "__main__":
    unittest.main()
