from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT_DIR = Path(__file__).resolve().parent.parent
SCRIPT_PATH = ROOT_DIR / "scripts" / "health.py"
SPEC = importlib.util.spec_from_file_location("health_script", SCRIPT_PATH)
health = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(health)


class HealthScriptTests(unittest.TestCase):
    @staticmethod
    def write_process(proc_root: Path, pid: int, *args: str) -> None:
        process_dir = proc_root / str(pid)
        process_dir.mkdir(parents=True)
        process_dir.joinpath("cmdline").write_bytes(
            b"\0".join(arg.encode("utf-8") for arg in args) + b"\0"
        )

    def test_find_supervisor_pid_prefers_verified_pid_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            pid_file = root / "supervisor.pid"
            state_file = root / "state.json"
            proc_root = root / "proc"
            pid_file.write_text("123\n", encoding="utf-8")
            state_file.write_text("{}", encoding="utf-8")
            self.write_process(
                proc_root, 123, "python3", "/workspace/.orchestrator/supervisor.py"
            )

            with mock.patch.object(
                health.subprocess, "check_output"
            ) as check_output:
                pid, pgrep_available = health.find_supervisor_pid(
                    pid_file, state_file, proc_root
                )

        self.assertEqual(pid, 123)
        self.assertTrue(pgrep_available)
        check_output.assert_not_called()

    def test_find_supervisor_pid_rejects_wrapper_match(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            pid_file = root / "supervisor.pid"
            state_file = root / "state.json"
            proc_root = root / "proc"
            pid_file.write_text("999\n", encoding="utf-8")
            state_file.write_text('{"supervisor": {"pid": 999}}', encoding="utf-8")
            self.write_process(
                proc_root, 1, "bwrap", "/bin/bash", "-c", "pgrep -f supervisor.py"
            )
            self.write_process(
                proc_root, 456, "python3", "/workspace/.orchestrator/supervisor.py"
            )

            with mock.patch.object(
                health.subprocess,
                "check_output",
                return_value="1\n456\n",
            ):
                pid, pgrep_available = health.find_supervisor_pid(
                    pid_file, state_file, proc_root
                )

        self.assertEqual(pid, 456)
        self.assertTrue(pgrep_available)

    def test_fresh_running_heartbeat_is_valid_liveness_evidence(self) -> None:
        self.assertTrue(
            health._has_fresh_running_heartbeat(
                {"lifecycle": "running"}, health.HEARTBEAT_LAG_WARN
            )
        )
        self.assertFalse(
            health._has_fresh_running_heartbeat(
                {"lifecycle": "stopped"}, 1
            )
        )
        self.assertFalse(
            health._has_fresh_running_heartbeat(
                {"lifecycle": "running"}, health.HEARTBEAT_LAG_WARN + 1
            )
        )

    def test_latest_keepalive_status_prefers_latest_entry_per_lane(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "claude-lane-keepalive.log"
            log_path.write_text(
                "\n".join(
                    [
                        "2026-06-06T14:27:17Z OK lane=claude2 refresh ok",
                        "2026-06-06T14:35:51Z FAIL lane=claude2 rc=1 msg=Failed to authenticate. API Error: 401 Invalid authentication credentials",
                        "2026-06-06T14:36:00Z OK lane=claude refresh ok",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            latest = health.latest_keepalive_status(log_path)

        self.assertEqual(latest["claude"]["result"], "OK")
        self.assertEqual(latest["claude"]["message"], "refresh ok")
        self.assertEqual(latest["claude2"]["result"], "FAIL")
        self.assertEqual(latest["claude2"]["rc"], 1)
        self.assertIn("401", latest["claude2"]["message"])


if __name__ == "__main__":
    unittest.main()
