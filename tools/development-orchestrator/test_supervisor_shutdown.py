#!/usr/bin/env python3
"""Acceptance tests for the supervisor stop path.

These guard the failure chain behind the 2026-08-17 SIGKILLs (03:24, 05:00):

    SIGTERM arrives during a tick
      -> SupervisorShutdown derived from Exception, so one of the tick's
         `except Exception` handlers swallowed it
      -> supervisor kept ticking, systemd waited out TimeoutStopSec=30
      -> SIGKILL of the whole control group (KillMode=control-group)
      -> the in-flight `git worktree add` died holding git's own
         `locked: initializing` marker
      -> the disk guard skips locked worktrees by design, so the residue
         was never reclaimed (21 worktrees / 13 GB)

The unit guards below pin the properties that break the chain, and the
integration test proves the real process actually honours them.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from control_plane.runtime import supervisor_runtime as supervisor


TOOL_DIR = Path(__file__).resolve().parent
ENTRYPOINT = TOOL_DIR / "control_plane" / "runtime" / "supervisor_runtime.py"
CONFIG_EXAMPLE = TOOL_DIR / "config" / "config.example.json"


class ShutdownIsNotSwallowedTests(unittest.TestCase):
    def test_broad_except_exception_does_not_swallow_shutdown(self) -> None:
        """A stop request must survive the tick's log-and-continue handlers.

        `_provision_worktree_node_modules`, `_force_recovery_probe`,
        `_approval_is_routine_safe` and friends all wrap their body in
        `except Exception`. This reproduces that shape exactly.
        """

        def like_provision_worktree_node_modules() -> str:
            try:
                supervisor.raise_supervisor_shutdown(signal.SIGTERM, None)
            except Exception:  # noqa: BLE001 - deliberately the buggy shape
                return "swallowed"
            return "unreachable"

        with self.assertRaises(supervisor.SupervisorShutdown) as ctx:
            like_provision_worktree_node_modules()

        self.assertEqual(ctx.exception.signum, signal.SIGTERM)

    def test_shutdown_does_not_derive_from_exception(self) -> None:
        """Pin the base class: this is the whole mechanism, not an incidental."""
        self.assertTrue(issubclass(supervisor.SupervisorShutdown, BaseException))
        self.assertFalse(issubclass(supervisor.SupervisorShutdown, Exception))

    def test_shutdown_still_unwinds_through_finally(self) -> None:
        """Cleanup that must survive a stop belongs in `finally`, and does."""
        ran = []

        def with_cleanup() -> None:
            try:
                supervisor.raise_supervisor_shutdown(signal.SIGINT, None)
            finally:
                ran.append("cleanup")

        with self.assertRaises(supervisor.SupervisorShutdown):
            with_cleanup()
        self.assertEqual(ran, ["cleanup"])


class FleetTerminationBudgetTests(unittest.TestCase):
    """A full fleet must not eat the stop budget one grace period at a time."""

    def _spawn_sigterm_ignoring_worker(self) -> subprocess.Popen:
        # Ignoring SIGTERM forces the full grace period, which is what makes
        # serial-vs-overlapped termination measurable at all.
        return subprocess.Popen(
            [
                sys.executable,
                "-c",
                "import signal, time\n"
                "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
                "time.sleep(60)\n",
            ],
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def test_full_fleet_termination_stays_inside_stop_budget(self) -> None:
        fleet_size = 12  # supervisor.resource_guard.max_total_workers
        procs = [self._spawn_sigterm_ignoring_worker() for _ in range(fleet_size)]
        try:
            # Let them install the SIGTERM handler before we signal.
            time.sleep(0.3)
            started = time.monotonic()
            delivered = supervisor.terminate_worker_pids([p.pid for p in procs])
            elapsed = time.monotonic() - started

            self.assertEqual(len(delivered), fleet_size)
            self.assertTrue(all(delivered.values()))

            serial_cost = fleet_size * supervisor.WORKER_TERM_GRACE_SECONDS
            self.assertLess(
                elapsed,
                serial_cost / 2,
                f"terminating {fleet_size} workers took {elapsed:.2f}s; "
                f"serial termination would cost ~{serial_cost:.0f}s and the "
                "sweep is supposed to overlap them",
            )
            self.assertLess(elapsed, supervisor.SHUTDOWN_TOTAL_BUDGET_SECONDS)

            for proc in procs:
                if proc.poll() is None:
                    proc.wait(timeout=5)
                self.assertIsNotNone(proc.poll(), "worker survived the termination sweep")
        finally:
            for proc in procs:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait(timeout=5)


class RealSupervisorSigtermTests(unittest.TestCase):
    """End-to-end: the shipped entrypoint, a real SIGTERM, a real stop."""

    def _write_config(self, root: Path) -> Path:
        config = json.loads(CONFIG_EXAMPLE.read_text(encoding="utf-8"))
        paths = {}
        for key, value in config["paths"].items():
            target = root / value if value.startswith(".orchestrator") else root / Path(value).name
            target.parent.mkdir(parents=True, exist_ok=True)
            paths[key] = str(target)
        config["paths"] = paths
        config.setdefault("supervisor", {})["poll_interval_seconds"] = 0.5

        Path(paths["status_file"]).write_text('{"tasks": []}\n', encoding="utf-8")
        Path(paths["approval_queue"]).write_text(
            '{"pending": [], "history": []}\n', encoding="utf-8"
        )

        config_path = root / "config.json"
        config_path.write_text(json.dumps(config), encoding="utf-8")
        return config_path

    def test_real_supervisor_exits_cleanly_on_sigterm(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config_path = self._write_config(root)
            state_path = Path(json.loads(config_path.read_text())["paths"]["state_file"])
            pid_path = state_path.parent / "supervisor.pid"

            proc = subprocess.Popen(
                [
                    sys.executable,
                    str(ENTRYPOINT),
                    "--config",
                    str(config_path),
                    "--no-watch",
                    "--quiet",
                ],
                cwd=str(TOOL_DIR),
                start_new_session=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            try:
                # Wait for the supervisor to be genuinely ticking, so we are
                # testing a stop mid-loop rather than a stop during startup.
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline and not state_path.exists():
                    if proc.poll() is not None:
                        _stdout, stderr = proc.communicate()
                        self.fail(
                            "supervisor exited before it started ticking: "
                            f"rc={proc.returncode} "
                            f"stderr={stderr.decode(errors='replace')[-2000:]}"
                        )
                    time.sleep(0.1)
                self.assertTrue(state_path.exists(), "supervisor never wrote runtime state")

                started = time.monotonic()
                os.kill(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=supervisor.SHUTDOWN_TOTAL_BUDGET_SECONDS)
                except subprocess.TimeoutExpired:
                    self.fail(
                        "supervisor did not stop within "
                        f"{supervisor.SHUTDOWN_TOTAL_BUDGET_SECONDS}s of SIGTERM; "
                        "systemd would escalate to SIGKILL here"
                    )
                elapsed = time.monotonic() - started
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait(timeout=5)
                for stream in (proc.stdout, proc.stderr):
                    if stream is not None:
                        stream.close()

            self.assertEqual(
                proc.returncode,
                128 + signal.SIGTERM,
                "a clean stop reports 128+SIGTERM, not a crash or a kill",
            )
            # Comfortably inside systemd's TimeoutStopSec=30.
            self.assertLess(elapsed, supervisor.SHUTDOWN_TOTAL_BUDGET_SECONDS)

            state = json.loads(state_path.read_text(encoding="utf-8"))
            supervisor_state = state["supervisor"]
            self.assertIsNone(supervisor_state["pid"])
            self.assertEqual(supervisor_state["lifecycle"], "stopped")
            self.assertEqual(supervisor_state["mode_status"], "stopped")
            self.assertEqual(supervisor_state["stop_reason"], "signal:SIGTERM")
            self.assertEqual(supervisor_state["stop_signal"], signal.SIGTERM)
            self.assertFalse(
                pid_path.exists(),
                "a clean stop removes the pid file; a SIGKILL is what leaves it behind",
            )


if __name__ == "__main__":
    unittest.main()
