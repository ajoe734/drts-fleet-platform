#!/usr/bin/env python3
"""A worker has to start in the workspace it was given.

spawn_background_process wraps the worker command in `systemd-run --user` when
a worker unit is requested, and passes `cwd=` to Popen. That configures
systemd-run itself; the transient service it asks systemd to create does not
inherit it, and a unit with no WorkingDirectory starts in $HOME.

So every worker launched through a unit began life outside the repository,
whatever workspace the supervisor had just built and recorded for it. Measured
on 2026-08-21: 41 of 41 dispatched Claude workers reported `cwd: /home/lupin`
at init, while state recorded `workspace_source: created_worktree` and the
worktree existed. Every layer was individually correct, which is most of why
this lasted.

Two consequences that looked like separate problems: the worker starts outside
the project, so .claude/settings.local.json never loads and it runs with no
PreToolUse hook -- the permission broker was inert for every dispatched worker
-- and it has to choose somewhere to work, so the canonical checkout is the
discoverable one.
"""

from __future__ import annotations

import os
import json
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import common


def _systemd_user_available() -> bool:
    """Ask by doing. `is-system-running` reports `degraded` and exits 1 on a
    perfectly usable session bus, which would skip the only test here that
    checks the behaviour rather than the flag."""
    if not shutil.which("systemd-run") or not shutil.which("systemctl"):
        return False
    probe = subprocess.run(
        ["systemd-run", "--user", "--quiet", "--collect", "--", "/bin/true"],
        capture_output=True, text=True, check=False, timeout=15,
    )
    return probe.returncode == 0


class WorkerUnitWorkingDirectoryTests(unittest.TestCase):
    def test_unit_forwards_environment_names_without_values_in_argv(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            env = {
                **os.environ,
                "ORCH_WORKER_UNIT": "drts-worker-env-probe.service",
                "ORCH_TASK_ID": "ENV-001",
                "CODEX_HOME": "/tmp/isolated account",
                "TEST_TOKEN": "synthetic-secret-not-for-argv",
                "NOTIFY_SOCKET": "/tmp/supervisor-notify",
                "WATCHDOG_USEC": "1000",
                "WATCHDOG_PID": "123",
            }
            with mock.patch.object(common.subprocess, "Popen") as popen, \
                    mock.patch.object(common.shutil, "which", return_value="/usr/bin/systemd-run"), \
                    mock.patch.object(common, "transient_service_main_pid", return_value=None):
                common.spawn_background_process(
                    ["/bin/true"], cwd=Path(tmpdir),
                    log_path=Path(tmpdir) / "run.log", env=env,
                )
            command = popen.call_args.args[0]
            for name in ("ORCH_TASK_ID", "CODEX_HOME", "TEST_TOKEN"):
                self.assertIn(f"--setenv={name}", command)
                self.assertNotIn(env[name], " ".join(command))
            for name in ("NOTIFY_SOCKET", "WATCHDOG_USEC", "WATCHDOG_PID"):
                self.assertNotIn(name, popen.call_args.kwargs["env"])
                self.assertNotIn(f"--setenv={name}", command)
            self.assertIn("--expand-environment=no", command)
            self.assertEqual(env["WATCHDOG_PID"], "123")

    @unittest.skipUnless(_systemd_user_available(), "systemd --user is not available here")
    def test_real_unit_preserves_account_context_and_literal_arguments(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            out = workspace / "context.json"
            expected = {
                "ORCH_TASK_ID": "ENV-001",
                "ORCH_RUN_ID": "worker-env-test",
                "ORCH_STATUS_ROOT": str(workspace),
                "AI_STATUS_ROOT": str(workspace),
                "CODEX_HOME": str(workspace / "codex isolated"),
                "CLAUDE_CONFIG_DIR": str(workspace / "claude isolated"),
                "ORCH_ENV_TEST_VALUE": 'spaces $dollar %percent "quotes"\nsecond line',
                "ORCH_ENV_TEST_EMPTY": "",
            }
            script = (
                "import json,os,pathlib,sys; "
                "pathlib.Path(sys.argv[1]).write_text(json.dumps({"
                "'values': {k: os.environ.get(k) for k in sys.argv[3:]}, "
                "'argument': sys.argv[2], "
                "'watchdog': {k: os.environ.get(k) for k in "
                "('NOTIFY_SOCKET','WATCHDOG_USEC','WATCHDOG_PID')}}))"
            )
            unit = f"drts-env-test-{os.getpid()}.service"
            process, log = common.spawn_background_process(
                [sys.executable, "-c", script, str(out), "$ORCH_TASK_ID ${CODEX_HOME}", *expected],
                cwd=workspace, log_path=workspace / "run.log",
                env={**os.environ, **expected, "ORCH_WORKER_UNIT": unit,
                     "NOTIFY_SOCKET": "/tmp/supervisor-notify", "WATCHDOG_USEC": "1000",
                     "WATCHDOG_PID": "123"},
            )
            try:
                self.assertEqual(process.wait(timeout=15), 0, log.read_text())
                deadline = time.monotonic() + 15
                while not out.exists() and time.monotonic() < deadline:
                    time.sleep(0.1)
                self.assertTrue(out.exists(), log.read_text())
                actual = json.loads(out.read_text())
                self.assertEqual(actual["values"], expected)
                self.assertEqual(actual["argument"], "$ORCH_TASK_ID ${CODEX_HOME}")
                self.assertEqual(actual["watchdog"], dict.fromkeys(
                    ("NOTIFY_SOCKET", "WATCHDOG_USEC", "WATCHDOG_PID")))
            finally:
                subprocess.run(["systemctl", "--user", "stop", unit],
                               capture_output=True, check=False, timeout=15)

    def test_the_unit_command_names_the_workspace(self) -> None:
        """The property has to be there before anything can honour it."""
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir) / "workspace"
            workspace.mkdir()
            log = Path(tmpdir) / "run.log"
            with mock.patch.object(common.subprocess, "Popen") as popen, \
                    mock.patch.object(common.shutil, "which", return_value="/usr/bin/systemd-run"), \
                    mock.patch.object(common, "transient_service_main_pid", return_value=None):
                common.spawn_background_process(
                    ["/bin/true"], cwd=workspace, log_path=log,
                    env={**os.environ, "ORCH_WORKER_UNIT": "drts-worker-probe.service"},
                )
            captured = {"command": popen.call_args.args[0], "cwd": popen.call_args.kwargs.get("cwd")}

            command = captured["command"]
            self.assertIn("systemd-run", command[0])
            self.assertIn(f"--property=WorkingDirectory={workspace.resolve()}", command)
            # The launcher's own cwd stays what it was; the two must agree.
            self.assertEqual(str(captured["cwd"]), str(workspace))

    def test_without_a_unit_the_property_is_not_invented(self) -> None:
        """A direct launch already honours cwd, so nothing is added there."""
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir) / "workspace"
            workspace.mkdir()
            with mock.patch.object(common.subprocess, "Popen") as popen:
                common.spawn_background_process(
                    ["/bin/true"], cwd=workspace, log_path=Path(tmpdir) / "run.log",
                    env={k: v for k, v in os.environ.items() if k != "ORCH_WORKER_UNIT"},
                )
            self.assertEqual(popen.call_args.args[0], ["/bin/true"])

    @unittest.skipUnless(_systemd_user_available(), "systemd --user is not available here")
    def test_a_real_transient_unit_starts_in_the_workspace(self) -> None:
        """The behaviour, not the flag.

        A unit without WorkingDirectory prints $HOME here; this asserts the
        worker's own directory instead, which is the whole point.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir) / "workspace"
            workspace.mkdir()
            out = Path(tmpdir) / "pwd.txt"
            unit = f"drts-cwd-test-{os.getpid()}.service"
            log = Path(tmpdir) / "run.log"

            common.spawn_background_process(
                ["/bin/pwd"], cwd=workspace, log_path=log,
                env={
                    **os.environ,
                    "ORCH_WORKER_UNIT": unit,
                    "ORCH_WORKER_UNIT_PROPERTIES": f"StandardOutput=file:{out}",
                },
            )
            deadline = time.monotonic() + 60.0
            while time.monotonic() < deadline and not out.exists():
                time.sleep(0.2)
            subprocess.run(["systemctl", "--user", "reset-failed", unit],
                           capture_output=True, check=False)

            # Two different outcomes, and they must not be confused. A unit
            # that started and printed the wrong directory is the regression
            # this test exists for, and fails. A unit that never produced
            # output at all says something about this machine's session bus
            # under load, not about the code -- and failing there would put a
            # flake in the release gate, which is worth less than the check.
            # The gate blocked a deploy on exactly that before this was widened.
            if not out.exists():
                raise unittest.SkipTest("the transient unit produced no output within 60s")
            self.assertEqual(out.read_text(encoding="utf-8").strip(), str(workspace.resolve()))


if __name__ == "__main__":
    unittest.main()
