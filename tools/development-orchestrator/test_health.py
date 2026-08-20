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

    def _show(self, unit_props: dict, service_state: str = "inactive"):
        """Stand in for systemctl show, per unit."""
        def fake(cmd, *a, **kw):
            unit = cmd[3]
            if unit.endswith(".timer"):
                body = "\n".join(f"{k}={v}" for k, v in unit_props.items())
            else:
                body = f"ActiveState={service_state}"
            return body + "\n"
        return fake

    def test_a_timer_mid_fire_is_not_reported_disarmed(self) -> None:
        """systemd reports no next elapse while a timer's own unit is running.

        For a 60s watchdog whose service takes a fraction of a second, that
        window comes round every minute, so a probe that only looks at the next
        elapse cries wolf on a perfectly healthy timer -- and a probe nobody
        trusts is the same failure as a probe that stays silent.
        """
        props = {"ActiveState": "active", "UnitFileState": "enabled",
                 "NextElapseUSecRealtime": "", "NextElapseUSecMonotonic": "infinity",
                 "Unit": "drts-health.service"}
        result = {"watchdogs": [], "issues": []}
        with mock.patch.object(health.subprocess, "check_output",
                               side_effect=self._show(props, service_state="activating")):
            health.collect_watchdog_timers(result)

        entry = next(e for e in result["watchdogs"] if e["unit"] == "drts-health.timer")
        self.assertTrue(entry["armed"])
        self.assertEqual(result["issues"], [])

    def test_a_timer_with_no_next_elapse_and_an_idle_unit_is_disarmed(self) -> None:
        """The real 2026-08-16 state: enabled, active, nothing scheduled, nothing running."""
        props = {"ActiveState": "active", "UnitFileState": "enabled",
                 "NextElapseUSecRealtime": "", "NextElapseUSecMonotonic": "infinity",
                 "Unit": "drts-health.service"}
        result = {"watchdogs": [], "issues": []}
        with mock.patch.object(health.subprocess, "check_output",
                               side_effect=self._show(props, service_state="inactive")):
            health.collect_watchdog_timers(result)

        entry = next(e for e in result["watchdogs"] if e["unit"] == "drts-health.timer")
        self.assertFalse(entry["armed"])
        self.assertTrue([i for i in result["issues"] if "disarmed" in i])

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
        # An auth pause never expires on its own, so naming the lane is only
        # half an alarm: without the remedy the reader still has to guess, and
        # on 2026-08-17 nobody guessed for a day.
        warning = next(i for i in result["issues"] if "provider claude auth paused" in i)
        self.assertIn("provider-pause.py clear", warning)

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


class LaneTableAgreesWithDispatcherTests(unittest.TestCase):
    """The probe and the dispatcher must not answer the same question differently.

    `enabled` in the projection means "configured on". Whether a lane will be
    sent work is the dispatcher's answer, and on 2026-08-18 the two diverged:
    an expired OAuth token paused the account behind claude and claude2, the
    supervisor refused both for fifteen hours, and this probe printed all seven
    lanes as enabled the whole time. pause_covers_lane already says in its own
    docstring that anything answering "can this lane take work" has to go
    through it; the chair briefing was corrected for that and the probe was not.
    """

    def _root(self, tmpdir: str, *, pauses: dict, report: str | None = '{}') -> Path:
        root = Path(tmpdir)
        (root / ".orchestrator" / "projections").mkdir(parents=True)
        (root / ".orchestrator" / "config.json").write_text(json.dumps({
            "agents": {"claude": {"provider": "claude"}, "gemini": {"provider": "gemini"}},
            "providers": {},
            "paths": {"provider_capabilities": ".orchestrator/provider_capabilities.json"},
        }), encoding="utf-8")
        (root / ".orchestrator" / "state.json").write_text(
            json.dumps({"provider_pauses": pauses}), encoding="utf-8")
        if report is not None:
            (root / ".orchestrator" / "provider_capabilities.json").write_text(
                report, encoding="utf-8")
        (root / ".orchestrator" / "projections" / "summary.json").write_text(json.dumps({
            "lanes": [{"id": "claude", "enabled": True}, {"id": "gemini", "enabled": True}],
            "generated_at": "2026-08-18T00:00:00Z",
        }), encoding="utf-8")
        return root

    def _lanes(self, root: Path) -> dict:
        result = {"lanes": [], "issues": []}
        with mock.patch.object(health, "ROOT_DIR", root), \
             mock.patch.object(health, "CONFIG_FILE", root / ".orchestrator" / "config.json"), \
             mock.patch.object(health, "STATE_FILE", root / ".orchestrator" / "state.json"), \
             mock.patch.object(health, "CONTROL_PLANE_SUMMARY",
                               root / ".orchestrator" / "projections" / "summary.json"):
            health.collect_lane_summary(result)
        return result

    def test_a_lane_the_dispatcher_refuses_is_not_shown_as_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self._root(tmpdir, pauses={
                "lane:claude": {"kind": "auth", "scope": "lane", "lane_id": "claude"}})

            result = self._lanes(root)

            lanes = {entry["lane"]: entry for entry in result["lanes"]}
            self.assertEqual(lanes["claude"]["status"], "paused")
            self.assertTrue(lanes["claude"]["dispatch_paused"])
            self.assertEqual(lanes["gemini"]["status"], "enabled")

    def test_an_unpaused_fleet_still_reads_as_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            result = self._lanes(self._root(tmpdir, pauses={}))

            self.assertEqual({entry["status"] for entry in result["lanes"]}, {"enabled"})
            self.assertEqual(result["issues"], [])

    def test_a_question_it_cannot_ask_reads_as_unknown_not_healthy(self) -> None:
        """Saying nothing is the failure this collector exists to prevent."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self._root(tmpdir, pauses={}, report=None)

            result = self._lanes(root)

            self.assertEqual({entry["status"] for entry in result["lanes"]}, {"unknown"})
            self.assertTrue([i for i in result["issues"] if "cannot ask the dispatcher" in i])

    def test_reading_the_lane_table_never_rewrites_the_capability_cache(self) -> None:
        """The predicate refreshes the provider report by running the provider
        CLIs and writing the cache back. A read-only probe must not."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self._root(tmpdir, pauses={})
            cache = root / ".orchestrator" / "provider_capabilities.json"
            before = cache.stat().st_mtime_ns

            self._lanes(root)

            self.assertEqual(cache.stat().st_mtime_ns, before)


class WatchdogSetComesFromTheInstallerTests(unittest.TestCase):
    """A hand-written unit list stops looking for a timer that gets renamed.

    systemd cannot flag it either: `show` on a unit that does not exist returns
    inactive with no next elapse, byte-for-byte how a disarmed timer reports
    itself. That is what made a manual check on 2026-08-18 read two healthy
    watchdogs as dead and two invented ones as real.
    """

    def test_the_units_probed_are_the_units_this_repo_ships(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            units = Path(tmpdir)
            (units / "drts-renamed.timer").write_text("[Timer]\n", encoding="utf-8")
            (units / "drts-health.service").write_text("[Service]\n", encoding="utf-8")
            with mock.patch.object(health, "SYSTEMD_UNIT_DIR", units):
                self.assertEqual(health.expected_watchdog_timers(), ["drts-renamed.timer"])

    def test_a_timer_this_repo_ships_but_the_host_lacks_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            units = Path(tmpdir)
            (units / "drts-missing.timer").write_text("[Timer]\n", encoding="utf-8")
            result = {"watchdogs": [], "issues": []}
            props = "\n".join(["LoadState=not-found", "ActiveState=inactive",
                               "UnitFileState=", "NextElapseUSecMonotonic=infinity"])
            with mock.patch.object(health, "SYSTEMD_UNIT_DIR", units), \
                 mock.patch.object(health.subprocess, "check_output", return_value=props + "\n"):
                health.collect_watchdog_timers(result)

            entry = result["watchdogs"][0]
            self.assertFalse(entry["installed"])
            self.assertFalse(entry["armed"])
            self.assertTrue([i for i in result["issues"] if "not installed" in i])


class EnabledServicesAreCheckedTests(unittest.TestCase):
    """`enabled` and `running` are different questions, and only one was asked.

    On the 2026-08-16 boot systemd deleted drts-dashboard.service from the
    transaction to break an ordering cycle. It reported enabled for four days
    without once being started -- never crashed, never restarted, simply never
    run. The watchdog collector asks whether the timers still fire; nothing
    asked the same of the services.
    """

    def _systemctl(self, units: str, props: dict):
        def fake(cmd, *a, **kw):
            if "list-unit-files" in cmd:
                return units
            unit = cmd[3]
            return "\n".join(f"{k}={v}" for k, v in props[unit].items()) + "\n"
        return fake

    def test_an_enabled_service_that_never_started_is_reported(self) -> None:
        result = {"services": [], "issues": []}
        with mock.patch.object(
                health.subprocess, "check_output",
                side_effect=self._systemctl(
                    "drts-dashboard.service enabled enabled\n",
                    {"drts-dashboard.service": {"ActiveState": "inactive", "Type": "simple"}})):
            health.collect_enabled_services(result)

        self.assertEqual(result["services"], [{"unit": "drts-dashboard.service",
                                               "active_state": "inactive"}])
        self.assertTrue([i for i in result["issues"] if "enabled but inactive" in i])

    def test_a_running_service_raises_nothing(self) -> None:
        result = {"services": [], "issues": []}
        with mock.patch.object(
                health.subprocess, "check_output",
                side_effect=self._systemctl(
                    "drts-supervisor.service enabled enabled\n",
                    {"drts-supervisor.service": {"ActiveState": "active", "Type": "simple"}})):
            health.collect_enabled_services(result)

        self.assertEqual(result["issues"], [])

    def test_a_timer_driven_oneshot_is_left_to_the_watchdog_check(self) -> None:
        """A oneshot is inactive between fires by design; judging it here would
        cry wolf every five minutes."""
        result = {"services": [], "issues": []}
        with mock.patch.object(
                health.subprocess, "check_output",
                side_effect=self._systemctl(
                    "drts-health.service enabled enabled\n",
                    {"drts-health.service": {"ActiveState": "inactive", "Type": "oneshot"}})):
            health.collect_enabled_services(result)

        self.assertEqual(result["services"], [])
        self.assertEqual(result["issues"], [])

    def test_it_says_so_when_it_cannot_ask(self) -> None:
        result = {"services": [], "issues": []}
        with mock.patch.object(health.subprocess, "check_output", side_effect=OSError("no systemctl")):
            health.collect_enabled_services(result)

        self.assertTrue([i for i in result["issues"] if "cannot list enabled services" in i])
