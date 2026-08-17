from __future__ import annotations

import importlib.util
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock


ROOT_DIR = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT_DIR / "tools" / "development-orchestrator" / "bin" / "health.py"
SPEC = importlib.util.spec_from_file_location("health_script", SCRIPT_PATH)
health = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(health)


class HealthScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 8, 15, 8, 0, tzinfo=timezone.utc)

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

    def test_collect_velocity_reports_recent_and_latest_completions(self) -> None:
        result = health.empty_health_result(self.now)
        tasks = {
            "recent": {
                "id": "recent",
                "status": "done",
                "last_update": (self.now - timedelta(minutes=30)).isoformat(),
            },
            "old": {
                "id": "old",
                "status": "done",
                "completed_at": (self.now - timedelta(hours=2)).isoformat(),
            },
            "open": {"id": "open", "status": "in_progress"},
        }

        health.collect_velocity(result, tasks, self.now)

        self.assertEqual(result["velocity"]["done_last_1h"], 1)
        self.assertEqual(result["velocity"]["done_last_24h"], 2)
        self.assertEqual(result["velocity"]["last_done_id"], "recent")
        self.assertEqual(result["velocity"]["seconds_since_last_done"], 1800)

    def test_collect_state_failures_aggregates_pauses_and_blockers(self) -> None:
        result = health.empty_health_result(self.now)
        state = {
            "dispatch_pauses": {"task": {}},
            "provider_pauses": {
                "claude": {"kind": "auth"},
                "codex": {"kind": "quota"},
            },
        }
        tasks = {
            "blocked": {"status": "blocked"},
            "open": {"status": "in_progress"},
        }

        health.collect_state_failures(result, state, tasks)

        self.assertEqual(result["failures"]["dispatch_pauses"], 1)
        self.assertEqual(result["failures"]["blockers"], 1)
        self.assertEqual(len(result["failures"]["provider_pauses"]), 2)
        self.assertIn("WARN: provider claude auth paused", result["issues"])

    def test_collect_heartbeat_prefers_supervisor_state(self) -> None:
        result = health.empty_health_result(self.now)
        state = {
            "supervisor": {
                "last_heartbeat_at": (self.now - timedelta(seconds=12)).isoformat(),
            }
        }

        health.collect_heartbeat(result, state, self.now)

        self.assertEqual(result["supervisor"]["heartbeat_lag_seconds"], 12)
        self.assertEqual(result["supervisor"]["heartbeat_source"], "supervisor.state")

    def test_collect_supervisor_process_marks_missing_process_critical(self) -> None:
        result = health.empty_health_result(self.now)
        error = health.subprocess.CalledProcessError(1, ["pgrep"])
        with mock.patch.object(health.subprocess, "check_output", side_effect=error):
            health.collect_supervisor_process(result)

        self.assertFalse(result["supervisor"]["running"])
        self.assertIn("CRITICAL: supervisor not running", result["issues"])


if __name__ == "__main__":
    unittest.main()
