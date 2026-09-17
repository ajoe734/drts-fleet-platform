import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from control_plane.domain.failure_policy import FailureKind, classify_failure, infer_pause_resume_at
from control_plane.infra.runtime_repo import load_runtime_state, migrate_state, save_runtime_state
from control_plane.infra.worker_failure_detector import detect_failure_signal_in_lines
from control_plane.runtime import supervisor_runtime as supervisor


def rejected_event(**updates):
    info = {
        "status": "rejected",
        "resetsAt": 1789048200,
        "rateLimitType": "five_hour",
        "overageStatus": "rejected",
        "overageDisabledReason": "org_level_disabled",
        "isUsingOverage": False,
        "unifiedWindows": {
            "five_hour": {"utilization": 1, "resetsAt": 1789048200},
            "seven_day": {"utilization": 0.62, "resetsAt": 1789387200},
        },
    }
    info.update(updates)
    return json.dumps({"type": "rate_limit_event", "rate_limit_info": info})


class ProviderRateLimitRecoveryTests(unittest.TestCase):
    def test_real_rejected_event_is_quota_on_both_claude_lanes(self):
        for provider in ("claude", "claude2"):
            with self.subTest(provider=provider):
                failure = classify_failure({}, {"provider": provider}, rejected_event())
                self.assertEqual(failure.kind, FailureKind.QUOTA_TERMINAL)
                self.assertFalse(failure.transient)

    def test_reset_is_active_window_not_later_unexhausted_window(self):
        self.assertEqual(infer_pause_resume_at(rejected_event()), 1789048200)

    def test_unknown_rejected_rate_window_is_capacity(self):
        for rate_type in ("requests", None, [], {}):
            with self.subTest(rate_type=rate_type):
                failure = classify_failure({}, {"provider": "claude"}, rejected_event(rateLimitType=rate_type))
                self.assertEqual(failure.kind, FailureKind.CAPACITY)
                self.assertTrue(failure.transient)

    def test_seven_day_rejection_uses_its_explicit_reset(self):
        event = rejected_event(rateLimitType="seven_day", resetsAt=1789387200)
        self.assertEqual(classify_failure({}, {"provider": "claude"}, event).kind, FailureKind.QUOTA_TERMINAL)
        self.assertEqual(infer_pause_resume_at(event), 1789387200)

    def test_allowed_events_do_not_pause_or_supply_reset(self):
        for status in ("allowed", "allowed_warning"):
            with self.subTest(status=status):
                event = rejected_event(status=status)
                self.assertIsNone(detect_failure_signal_in_lines([event]))
                self.assertIsNone(infer_pause_resume_at(event))
                self.assertNotEqual(classify_failure({}, {}, event).kind, FailureKind.QUOTA_TERMINAL)

    def test_invalid_resets_are_not_trusted(self):
        for value in (None, True, -1, 0, "tomorrow", float("inf"), float("nan")):
            with self.subTest(value=value):
                self.assertIsNone(infer_pause_resume_at(rejected_event(resetsAt=value)))

    def test_quoted_event_is_not_a_reader_failure(self):
        for payload in (
            {"type": "user", "message": rejected_event()},
            {"type": "assistant", "message": rejected_event()},
            {"type": "item.completed", "item": {"type": "command_execution", "aggregated_output": rejected_event()}},
        ):
            with self.subTest(payload=payload):
                self.assertIsNone(detect_failure_signal_in_lines([json.dumps(payload)]))
                self.assertIsNone(infer_pause_resume_at(json.dumps(payload)))

    def test_error_result_success_subtype_does_not_hide_rejection(self):
        result = json.dumps({"type": "result", "subtype": "success", "is_error": True,
                             "result": "You've hit your session limit · resets 1:50pm (UTC)"})
        signal = detect_failure_signal_in_lines([rejected_event(), result])
        self.assertIsNotNone(signal)
        self.assertTrue(signal.provider_pause_authorized)
        self.assertEqual(infer_pause_resume_at(signal.reason), 1789048200)

    def test_first_failure_pauses_shared_pool_until_exact_provider_reset(self):
        state = {}
        worker = {"provider": "claude2", "agent_id": "claude2",
                  "identity": {"quota_pool": "test-shared-pool", "fingerprint": "test-identity"}}
        with mock.patch.object(supervisor, "console_log"):
            supervisor.maybe_pause_provider_for_terminal_failure({}, state, worker, rejected_event())
        self.assertIn("pool:test-shared-pool", state.get("provider_pauses", {}))
        pause = state["provider_pauses"]["pool:test-shared-pool"]
        self.assertEqual(pause["kind"], "quota")
        self.assertEqual(pause["resume_at"], 1789048200)

    def test_missing_reset_retains_bounded_fallback(self):
        state = {}
        before = datetime.now(timezone.utc).timestamp()
        with mock.patch.object(supervisor, "console_log"):
            supervisor.maybe_pause_provider_for_terminal_failure(
                {}, state, {"provider": "claude", "agent_id": "claude"}, rejected_event(resetsAt=None))
        self.assertIn("claude", state.get("provider_pauses", {}))
        self.assertGreaterEqual(state["provider_pauses"]["claude"]["resume_at"], before + 14400)

    def test_textual_reset_preserves_terminal_fallback_floor(self):
        state = {}
        before = datetime.now(timezone.utc).timestamp()
        with mock.patch.object(supervisor, "console_log"):
            supervisor.maybe_pause_provider_for_terminal_failure(
                {}, state, {"provider": "claude", "agent_id": "claude"},
                "you have exhausted your capacity. Resets in 5m.")
        self.assertGreaterEqual(state["provider_pauses"]["claude"]["resume_at"], before + 14400)

    def test_textual_reset_preserves_floor_for_live_and_exited_workers(self):
        for live in (True, False):
            with self.subTest(live=live):
                state = {}
                before = datetime.now(timezone.utc).timestamp()
                worker = {"provider": "claude", "agent_id": "claude", "pid": 12345}
                signal = detect_failure_signal_in_lines([
                    "reason: you have exhausted your capacity. Resets in 5m."])
                self.assertIsNotNone(signal)
                with (mock.patch.object(supervisor, "console_log"),
                      mock.patch.object(supervisor, "terminate_worker_pid"),
                      mock.patch.object(supervisor, "maybe_rotate_antigravity_lane", return_value=False),
                      mock.patch.object(supervisor, "maybe_reassign_task_after_worker_failure", return_value=None),
                      mock.patch.object(supervisor, "finalize_terminal_worker_outcome")):
                    supervisor.handle_worker_failure_signal(
                        {}, state, {}, worker, signal, current_mode="execution", live=live)
                self.assertGreaterEqual(state["provider_pauses"]["claude"]["resume_at"], before + 14400)

    def test_live_and_exited_worker_paths_use_provider_reset(self):
        for live in (True, False):
            with self.subTest(live=live):
                state = {}
                worker = {"provider": "claude", "agent_id": "claude", "pid": 12345}
                signal = detect_failure_signal_in_lines([rejected_event()])
                with (mock.patch.object(supervisor, "console_log"),
                      mock.patch.object(supervisor, "terminate_worker_pid") as terminate,
                      mock.patch.object(supervisor, "maybe_rotate_antigravity_lane", return_value=False),
                      mock.patch.object(supervisor, "maybe_reassign_task_after_worker_failure", return_value=None),
                      mock.patch.object(supervisor, "finalize_terminal_worker_outcome")):
                    self.assertEqual(supervisor.handle_worker_failure_signal(
                        {}, state, {}, worker, signal, current_mode="execution", live=live), (True, True))
                self.assertEqual(terminate.call_count, int(live))
                self.assertEqual(state["provider_pauses"]["claude"]["resume_at"], 1789048200)


class DeadlockCooldownPersistenceTests(unittest.TestCase):
    def test_roundtrip_suppresses_second_probe_and_retains_quota(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = {
                "paths": {"state_file": str(Path(tmp) / "state.json"),
                          "event_queue": str(Path(tmp) / "queue.jsonl")},
                "agents": {"claude": {"provider": "claude"}},
                "supervisor": {"deadlock_breaker_cooldown_seconds": 1800},
                "ready_dispatcher": {},
            }
            state = migrate_state({
                "chair_review": {"blocked": {"reason": "all quotas exhausted"}},
                "provider_pauses": {"claude": {"lane_id": "claude", "kind": "quota", "resume_at": (datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()}},
            })
            status = {"tasks": [{"id": "TASK", "status": "todo"}]}
            report = {"providers": {"claude": {"installed": True, "auth_ready": True}}}
            with (mock.patch.object(supervisor, "load_provider_report", return_value=report),
                  mock.patch.object(supervisor, "_force_recovery_probe", return_value=report) as probe,
                  mock.patch.object(supervisor, "write_activity_log"),
                  mock.patch.object(supervisor, "console_log")):
                self.assertTrue(supervisor.break_full_deadlock(config, state, status))
                save_runtime_state(config, state)
                restored = load_runtime_state(config)
                self.assertFalse(supervisor.break_full_deadlock(config, restored, status))
                self.assertEqual(probe.call_count, 1)
                restored["deadlock_recovery"]["last_attempt_at"] = (
                    datetime.now(timezone.utc) - timedelta(seconds=1801)
                ).isoformat()
                save_runtime_state(config, restored)
                self.assertTrue(supervisor.break_full_deadlock(config, load_runtime_state(config), status))
                self.assertEqual(probe.call_count, 2)
            self.assertEqual(restored["provider_pauses"]["claude"]["kind"], "quota")
            self.assertIn("operator_attention", restored["deadlock_recovery"])

    def test_legacy_and_malformed_recovery_state_are_normalized(self):
        self.assertEqual(migrate_state({})["deadlock_recovery"], {})
        for value in (None, "broken", []):
            with self.subTest(value=value):
                self.assertEqual(migrate_state({"deadlock_recovery": value})["deadlock_recovery"], {})


if __name__ == "__main__":
    unittest.main()

class CapacityFailureBackoffTests(unittest.TestCase):
    def test_tick_rate_retry_storm_is_prevented(self):
        config = {
            "worker_retry": {
                "backoff_schedule_seconds": [5, 15, 30, 60, 120],
                "max_attempts": 5,
                "capacity_pause_seconds": 300,
            }
        }
        state = {
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "provider": "gemini2",
                    "agent_id": "gemini2",
                    "status": "retry_backoff",
                    "pid": 9999,
                    "retry_count": 1,
                    "next_retry_at": "2026-09-17T02:00:10Z",
                    "last_event_at": "2026-09-17T02:00:00Z"
                }
            }
        }
        worker = state["workers"]["run-1"]
        # Ensure the test verifies the bug where poll_workers keeps checking a dead retry_backoff worker
        # and re-triggering handle_worker_failure_signal
        
        # We simulate the worker's pid is dead and the failure signal is still in the log
        # Because we fixed it, poll_workers should NOT process the failure signal again!
        with mock.patch("control_plane.runtime.supervisor_runtime.pid_is_alive", return_value=False):
            with mock.patch("control_plane.runtime.supervisor_runtime.detect_worker_failure_signal", return_value=supervisor.WorkerFailureSignal("capacity error", "test", True)) as mock_detect:
                with mock.patch("control_plane.runtime.supervisor_runtime.handle_worker_failure_signal") as mock_handle:
                    # In a real tick, retry_due_workers runs first.
                    now = datetime.fromisoformat("2026-09-17T02:00:05+00:00")
                    supervisor.retry_due_workers(config, state, {}, now)
                    
                    # Next, the main loop in poll_workers
                    # We can just call the portion of poll_workers that processes the workers,
                    # or better yet, since we fixed it in poll_workers, we can just run the loop logic
                    # wait, the logic is inline in run_once / poll_workers
                    
                    # It's easier to just call poll_workers
                    with mock.patch("control_plane.runtime.supervisor_runtime.load_approval_state", return_value={}), \
                         mock.patch("control_plane.runtime.supervisor_runtime.load_status", return_value={}), \
                         mock.patch("control_plane.runtime.supervisor_runtime.worker_process_tree_cpu_ticks", return_value={}), \
                         mock.patch("control_plane.runtime.supervisor_runtime.write_activity_log"), \
                         mock.patch("control_plane.runtime.supervisor_runtime.datetime") as mock_dt:
                        
                        mock_dt.now.return_value = now
                        mock_dt.fromisoformat = datetime.fromisoformat
                        supervisor.poll_workers(config, state, {})
                    
                    # If it's fixed, detect_worker_failure_signal should NOT be called for a retry_backoff worker
                    mock_detect.assert_not_called()
                    mock_handle.assert_not_called()
                    
                    worker["status"] = "fallback"
                    with mock.patch("control_plane.runtime.supervisor_runtime.load_approval_state", return_value={}), \
                         mock.patch("control_plane.runtime.supervisor_runtime.load_status", return_value={}), \
                         mock.patch("control_plane.runtime.supervisor_runtime.worker_process_tree_cpu_ticks", return_value={}), \
                         mock.patch("control_plane.runtime.supervisor_runtime.write_activity_log"), \
                         mock.patch("control_plane.runtime.supervisor_runtime.datetime") as mock_dt:
                        mock_dt.now.return_value = now
                        mock_dt.fromisoformat = datetime.fromisoformat
                        supervisor.poll_workers(config, state, {})
                    mock_detect.assert_not_called()
                    mock_handle.assert_not_called()
                    worker["status"] = "retry_backoff" 
                    
        # Verify the worker is STILL in retry_backoff and its retry_count is STILL 1
        self.assertEqual(worker["status"], "retry_backoff")
        self.assertEqual(worker["retry_count"], 1)

