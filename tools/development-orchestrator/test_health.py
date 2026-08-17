from __future__ import annotations

import importlib.util
import json
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
    def _probe(self, root: Path, state: dict, status: dict) -> dict:
        """Run collect() against a temporary machine-truth root."""
        (root / ".orchestrator").mkdir(parents=True, exist_ok=True)
        (root / ".orchestrator" / "state.json").write_text(json.dumps(state), encoding="utf-8")
        (root / "ai-status.json").write_text(json.dumps(status), encoding="utf-8")
        with mock.patch.object(health, "STATE_FILE", root / ".orchestrator" / "state.json"), \
             mock.patch.object(health, "STATUS_FILE", root / "ai-status.json"), \
             mock.patch.object(health, "CONTROL_PLANE_SUMMARY", root / "missing.json"), \
             mock.patch.object(health, "SUPERVISOR_LOG", root / "missing.log"), \
             mock.patch.object(health, "CLAUDE_KEEPALIVE_LOG", root / "missing.log"), \
             mock.patch.object(health, "LANE_HEALTH_LOG", root / "missing.jsonl"):
            return health.collect()

    def test_probe_counts_every_active_worker_not_only_running_ones(self) -> None:
        """A worker waiting on approval is in flight, not idle.

        health reported only status == "running" while the control plane treats
        eight statuses as active, so a fleet stalled on approvals or retries read
        as `workers: 0 running` -- the same way the supervisor's own log read
        `queue: empty` while it span. The first number a reader sees has to mean
        what the rest of the system means by it.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            workers = {
                f"run-{index}": {"status": status, "provider": "codex", "task_id": "T-1"}
                for index, status in enumerate(sorted(health.ACTIVE_WORKER_STATUSES))
            }
            workers["run-done"] = {"status": "completed", "provider": "codex", "task_id": "T-2"}
            result = self._probe(root, {"workers": workers}, {"tasks": [{"id": "T-1", "status": "todo"}]})

        self.assertEqual(result["workers"]["count"], len(health.ACTIVE_WORKER_STATUSES))
        reported = {entry["status"] for entry in result["workers"]["running"]}
        self.assertNotIn("completed", reported)

    def test_task_map_follows_the_configured_schema(self) -> None:
        """The supervisor reads tasks through schema.tasks_path / task_id_field;
        health hardcoded "tasks" and "id", so a schema change would leave it
        silently reading nothing while reporting no issue."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / ".orchestrator").mkdir(parents=True)
            (root / ".orchestrator" / "config.json").write_text(
                json.dumps({"schema": {"tasks_path": "work_items", "task_id_field": "key"}}), encoding="utf-8")
            (root / "ai-status.json").write_text(
                json.dumps({"work_items": [{"key": "T-9", "status": "done"}]}), encoding="utf-8")
            with mock.patch.object(health, "STATUS_FILE", root / "ai-status.json"), \
                 mock.patch.object(health, "CONFIG_FILE", root / ".orchestrator" / "config.json"):
                tasks = health.canonical_task_map()

        self.assertEqual(list(tasks), ["T-9"])

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
