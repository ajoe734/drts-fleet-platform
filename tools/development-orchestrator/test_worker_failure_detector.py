import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from control_plane.runtime import supervisor_runtime
from control_plane.infra.worker_failure_detector import WorkerFailureSignal, _detect_antigravity_result_signal

class TestCapacityRetryStorm(unittest.TestCase):
    def test_worker_failure_detector_recognizes_capacity_error(self):
        payload = {
            "result": {
                "status": "ERROR",
                "error": "API error (attempt 1): UNAVAILABLE (code 503): No capacity available for model gemini-1.5-pro on the server"
            }
        }
        signal = _detect_antigravity_result_signal(payload)
        self.assertIsNotNone(signal)
        self.assertEqual(signal.reason, "API error (attempt 1): UNAVAILABLE (code 503): No capacity available for model gemini-1.5-pro on the server")
        self.assertTrue(signal.provider_pause_authorized)

    @patch('control_plane.runtime.supervisor_runtime.write_activity_log')
    @patch('control_plane.runtime.supervisor_runtime.console_log')
    def test_capacity_failure_in_execution_mode_schedules_backoff_and_pauses(self, mock_console, mock_write_activity):
        config = {
            "paths": {"activity_log": "/dev/null", "status_file": "/dev/null"},
            "providers": {"gemini2": {"delivery_mode": "file_inbox"}},
            "supervisor": {"worker_retry": {"enabled": True, "max_attempts": 5, "capacity_pause_seconds": 300, "backoff_schedule_seconds": [5, 15, 30]}}
        }
        state = {}
        provider_report = {}
        worker = {
            "provider": "gemini2",
            "agent_id": "gemini2",
            "run_id": "wrk-123",
            "queue_event_id": "evt-123",
            "request_snapshot": {
                "agent_id": "gemini2",
                "provider": "gemini2",
                "delivery_mode": "file_inbox",
                "reason": "execution:file_inbox",
                "message": "test prompt"
            },
            "status": "started",
            "retry_count": 0
        }
        # In reality this comes from detect_worker_failure_signal which we verified in the previous test
        signal = WorkerFailureSignal("API error (attempt 1): UNAVAILABLE (code 503): No capacity available for model gemini-1.5-pro on the server", "antigravity_stream_result_error", True)
        
        handled, changed = supervisor_runtime.handle_worker_failure_signal(
            config,
            state,
            provider_report,
            worker,
            signal,
            current_mode="execution",
            live=False
        )
        
        self.assertTrue(handled)
        self.assertTrue(changed)
        self.assertEqual(worker["status"], "retry_backoff")
        self.assertEqual(worker["retry_count"], 1)
        
        # Provider should NOT be unconditionally paused on attempt 1
        self.assertNotIn("gemini2", state.get("provider_pauses", {}))

    @patch('control_plane.runtime.supervisor_runtime.write_activity_log')
    @patch('control_plane.runtime.supervisor_runtime.console_log')
    @patch('control_plane.runtime.supervisor_runtime.finalize_queue_event_record')
    def test_capacity_failure_in_coordination_mode_marks_terminal(self, mock_finalize, mock_console, mock_write_activity):
        config = {
            "paths": {"activity_log": "/dev/null", "status_file": "/dev/null"},
            "providers": {"gemini2": {"delivery_mode": "file_inbox"}},
            "supervisor": {"worker_retry": {"enabled": True, "max_attempts": 5, "capacity_pause_seconds": 300, "backoff_schedule_seconds": [5, 15, 30]}}
        }
        state = {}
        provider_report = {}
        worker = {
            "provider": "gemini2",
            "agent_id": "gemini2",
            "run_id": "wrk-123",
            "queue_event_id": "evt-123",
            "request_snapshot": {
                "agent_id": "gemini2",
                "provider": "gemini2",
                "delivery_mode": "file_inbox",
                "reason": "coordination:review",
                "message": "test prompt"
            },
            "status": "started",
            "retry_count": 0
        }
        signal = WorkerFailureSignal("No capacity available", "antigravity_stream_result_error", True)
        
        handled, changed = supervisor_runtime.handle_worker_failure_signal(
            config,
            state,
            provider_report,
            worker,
            signal,
            current_mode="coordination",
            live=False
        )
        
        self.assertTrue(handled)
        self.assertTrue(changed)
        self.assertEqual(worker["status"], "failed")


    @patch('control_plane.runtime.supervisor_runtime.write_activity_log')
    @patch('control_plane.runtime.supervisor_runtime.console_log')
    @patch('control_plane.runtime.supervisor_runtime.start_worker_for_request')
    def test_regression_multi_generation_capacity_retry_backoff_and_cooldown(self, mock_start, mock_console, mock_write_activity):
        # This test exercises retry_due_workers to verify multi-generation retry_count propagation
        config = {
            "paths": {"activity_log": "/dev/null", "status_file": "/dev/null"},
            "providers": {"gemini2": {"delivery_mode": "file_inbox"}},
            "worker_retry": {"enabled": True, "max_attempts": 1, "capacity_pause_seconds": 300, "backoff_schedule_seconds": [5, 15, 30]},
            "ready_dispatcher": {"dispatch_cooldown_seconds": 900}
        }
        
        # We start with attempt 0 failed, now in retry_backoff waiting for attempt 1
        worker_id = "wrk-123"
        state = {
            "workers": {
                worker_id: {
                    "provider": "gemini2",
                    "agent_id": "gemini2",
                    "run_id": worker_id,
                    "queue_event_id": "evt-123",
                    "request_snapshot": {
                        "agent_id": "gemini2",
                        "provider": "gemini2",
                        "delivery_mode": "file_inbox",
                        "reason": "execution:file_inbox",
                        "message": "test prompt",
                        "task_id": "T-1"
                    },
                    "status": "retry_backoff",
                    "retry_count": 1,
                    "next_retry_at": "2026-09-16T10:00:00Z"
                }
            }
        }
        
        # Advance time to trigger retry
        now = datetime(2026, 9, 16, 10, 0, 5, tzinfo=timezone.utc)
        
        # Mock start_worker_for_request to return success
        mock_start.return_value = (True, "wrk-124", None)
        
        # Trigger retry
        changed = supervisor_runtime.retry_due_workers(config, state, {}, now)
        self.assertTrue(changed)
        
        # Original worker is now "retried"
        self.assertEqual(state["workers"][worker_id]["status"], "retried")
        self.assertEqual(state["workers"][worker_id]["superseded_by_run_id"], "wrk-124")
        
        # start_worker_for_request was called with retry_count=1
        mock_start.assert_called_once()
        self.assertEqual(mock_start.call_args[1]["retry_count"], 1)
        
        # Now simulate attempt 1 failing again (which means we hit max_attempts=1)
        worker2 = {
            "provider": "gemini2",
            "agent_id": "gemini2",
            "run_id": "wrk-124",
            "queue_event_id": "evt-123",
            "request_snapshot": {
                "agent_id": "gemini2",
                "provider": "gemini2",
                "delivery_mode": "file_inbox",
                "reason": "execution:file_inbox",
                "message": "test prompt",
                "task_id": "T-1"
            },
            "status": "started",
            "retry_count": 1
        }
        state["workers"]["wrk-124"] = worker2
        signal = WorkerFailureSignal("No capacity available", "antigravity_stream_result_error", True)
        
        # It should enter cooldown and fallback (or fail)
        handled, changed2 = supervisor_runtime.handle_worker_failure_signal(
            config,
            state,
            {},
            worker2,
            signal,
            current_mode="execution",
            live=False
        )
        self.assertTrue(handled)
        
        # Since we reached max_attempts, it should fallback
        self.assertEqual(worker2["status"], "fallback")
        
        # AND it should pause the provider for dispatch_cooldown_seconds (900)
        self.assertIn("gemini2", state.get("provider_pauses", {}))
        self.assertEqual(state["provider_pauses"]["gemini2"]["kind"], "capacity")
        self.assertEqual(state["provider_pauses"]["gemini2"]["resume_at_source"], "reset_seconds")

if __name__ == '__main__':
    unittest.main()
