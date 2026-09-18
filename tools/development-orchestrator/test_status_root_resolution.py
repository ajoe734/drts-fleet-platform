#!/usr/bin/env python3
"""Acceptance tests for locating the checkout that owns runtime state.

`.orchestrator/` is gitignored and the orchestrator runs from immutable release
copies under .artifacts/releases/<name>, so "where does this code live" and
"where does the live state live" stopped being the same directory. Resolving
the second from the first made every permission-broker hook event die:

    KeyError: 'Missing config path for approval_queue'

The supervisor was spared only because systemd exports ORCH_STATUS_ROOT and
bin/run-supervisor.sh passes --config; Claude Code spawns hooks with neither.
A missing config also loaded as `{}`, so the failure surfaced far from the file
nobody found. Both halves are pinned here.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

import common


TOOL_DIR = Path(__file__).resolve().parent


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args], cwd=str(cwd), check=True, capture_output=True, text=True
    )


def _make_repo_with_state(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "--quiet", "--initial-branch=dev")
    _git(root, "config", "user.email", "test@example.com")
    _git(root, "config", "user.name", "test")
    (root / "README.md").write_text("probe\n", encoding="utf-8")
    _git(root, "add", "README.md")
    _git(root, "commit", "--quiet", "-m", "init")
    state = root / ".orchestrator"
    state.mkdir()
    (state / "config.json").write_text(json.dumps({"paths": {}}), encoding="utf-8")


class StatusRootResolutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        # These are what run-supervisor.sh exports; clear them so each test
        # states its own starting conditions.
        patcher = mock.patch.dict(
            os.environ, {"ORCH_STATUS_ROOT": "", "AI_STATUS_ROOT": ""}, clear=False
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        os.environ.pop("ORCH_STATUS_ROOT", None)
        os.environ.pop("AI_STATUS_ROOT", None)

    def test_explicit_environment_wins(self) -> None:
        os.environ["ORCH_STATUS_ROOT"] = str(self.tmp)

        self.assertEqual(common._resolve_status_root(), self.tmp.resolve())

    def test_legacy_environment_variable_still_honoured(self) -> None:
        os.environ["AI_STATUS_ROOT"] = str(self.tmp)

        self.assertEqual(common._resolve_status_root(), self.tmp.resolve())

    def test_checkout_that_owns_state_is_used_without_consulting_git(self) -> None:
        """The common case must not pay for a subprocess."""
        root = self.tmp / "canonical"
        (root / ".orchestrator").mkdir(parents=True)
        (root / ".orchestrator" / "config.json").write_text("{}", encoding="utf-8")

        with mock.patch.object(common, "SOURCE_ROOT", root):
            with mock.patch.object(common.subprocess, "run") as run:
                resolved = common._resolve_status_root()

        self.assertEqual(resolved, root.resolve())
        run.assert_not_called()

    def test_release_copy_resolves_to_the_checkout_that_owns_state(self) -> None:
        """The regression: a release copy carries code but never state."""
        canonical = self.tmp / "canonical"
        _make_repo_with_state(canonical)
        release = self.tmp / "releases" / "orchestrator-abc123"
        _git(canonical, "worktree", "add", "--detach", str(release), "HEAD")
        self.assertFalse(
            (release / ".orchestrator").exists(),
            "a release checkout must not carry runtime state, or this proves nothing",
        )

        with mock.patch.object(common, "SOURCE_ROOT", release):
            resolved = common._resolve_status_root()

        self.assertEqual(resolved, canonical.resolve())

    def test_falls_back_to_source_root_outside_a_repository(self) -> None:
        loose = self.tmp / "loose"
        loose.mkdir()

        with mock.patch.object(common, "SOURCE_ROOT", loose):
            resolved = common._resolve_status_root()

        self.assertEqual(resolved, loose.resolve())

    def test_falls_back_when_git_is_unavailable(self) -> None:
        loose = self.tmp / "no-git"
        loose.mkdir()

        with mock.patch.object(common, "SOURCE_ROOT", loose):
            with mock.patch.object(common.subprocess, "run", side_effect=OSError("no git")):
                resolved = common._resolve_status_root()

        self.assertEqual(resolved, loose.resolve())


class MissingConfigIsLoudTests(unittest.TestCase):
    """`{}` is not a config; it is a missing file wearing a disguise."""

    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)

    def test_missing_config_raises_and_names_the_path(self) -> None:
        missing = self.tmp / ".orchestrator" / "config.json"

        with mock.patch.object(common, "DEFAULT_CONFIG_PATH", missing):
            with mock.patch.object(common, "LOCAL_CONFIG_PATH", self.tmp / "nope.json"):
                with self.assertRaises(FileNotFoundError) as ctx:
                    common.load_config()

        message = str(ctx.exception)
        self.assertIn(str(missing), message)
        self.assertIn("ORCH_STATUS_ROOT", message)

    def test_present_config_still_loads(self) -> None:
        config_file = self.tmp / "config.json"
        config_file.write_text(json.dumps({"paths": {"status_file": "s.json"}}), encoding="utf-8")

        with mock.patch.object(common, "DEFAULT_CONFIG_PATH", config_file):
            with mock.patch.object(common, "LOCAL_CONFIG_PATH", self.tmp / "nope.json"):
                config = common.load_config()

        self.assertEqual(config["paths"]["status_file"], "s.json")

    def test_local_override_alone_is_enough(self) -> None:
        """A repo may carry only config.local.json; that is still configured."""
        local = self.tmp / "config.local.json"
        local.write_text(json.dumps({"paths": {"status_file": "s.json"}}), encoding="utf-8")

        with mock.patch.object(common, "DEFAULT_CONFIG_PATH", self.tmp / "config.json"):
            with mock.patch.object(common, "LOCAL_CONFIG_PATH", local):
                config = common.load_config()

        self.assertEqual(config["paths"]["status_file"], "s.json")


class BrokerFromReleaseCopyTests(unittest.TestCase):
    """The end-to-end shape that actually broke, run the way hooks run it.

    Claude Code invokes `permission_broker.py hook <event>` from the release
    copy named in .claude/settings.local.json, with no --config and none of the
    environment run-supervisor.sh exports. Every event was exiting 1 on an
    uncaught KeyError, so the whole approval-brokering layer was inert -- and
    fast enough about it that nothing looked wrong.
    """

    def test_hook_events_succeed_from_a_checkout_without_runtime_state(self) -> None:
        with TemporaryDirectory() as tmpdir:
            canonical = Path(tmpdir) / "canonical"
            _make_repo_with_state(canonical)
            # Give the state root the files a broker run actually touches.
            state = canonical / ".orchestrator"
            (state / "config.json").write_text(
                json.dumps(
                    {
                        "paths": {
                            "status_file": "ai-status.json",
                            "activity_log": "ai-activity-log.jsonl",
                            "approval_queue": ".orchestrator/approval-queue.json",
                        }
                    }
                ),
                encoding="utf-8",
            )
            (state / "approval-queue.json").write_text(
                '{"pending": [], "history": []}', encoding="utf-8"
            )
            (canonical / "ai-status.json").write_text('{"tasks": []}', encoding="utf-8")

            # The release copy: this tool tree, checked out as a worktree with
            # no .orchestrator of its own.
            release = Path(tmpdir) / "releases" / "orchestrator-probe"
            _git(canonical, "worktree", "add", "--detach", str(release), "HEAD")
            release_tools = release / "tools" / "development-orchestrator"
            release_tools.mkdir(parents=True, exist_ok=True)
            for source in TOOL_DIR.glob("*.py"):
                (release_tools / source.name).write_text(
                    source.read_text(encoding="utf-8"), encoding="utf-8"
                )
            for package in ("adapters", "control_plane"):
                _copy_tree(TOOL_DIR / package, release_tools / package)

            env = {k: v for k, v in os.environ.items()
                   if k not in ("ORCH_STATUS_ROOT", "AI_STATUS_ROOT")}
            for event in ("PreToolUse", "PostToolUse", "PermissionRequest", "SessionStart"):
                payload = json.dumps(
                    {
                        "session_id": "probe",
                        "cwd": str(canonical),
                        "hook_event_name": event,
                        "tool_name": "Bash",
                        "tool_input": {"command": "echo hi"},
                    }
                )
                result = subprocess.run(
                    [sys.executable, str(release_tools / "permission_broker.py"), "hook", event],
                    input=payload,
                    capture_output=True,
                    text=True,
                    env=env,
                    timeout=60,
                )
                self.assertEqual(
                    result.returncode,
                    0,
                    f"{event} hook failed from a release copy: "
                    f"{(result.stderr or '').strip()[-400:]}",
                )


def _copy_tree(source: Path, destination: Path) -> None:
    for path in source.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        target = destination / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
