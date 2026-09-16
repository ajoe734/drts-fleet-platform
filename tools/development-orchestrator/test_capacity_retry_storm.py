import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from control_plane.runtime import supervisor_runtime
from control_plane.infra.worker_failure_detector import WorkerFailureSignal

class TestCapacityRetryStorm(unittest.TestCase):
    @patch('control_plane.runtime.supervisor_runtime.write_activity_log')
    @patch('control_plane.runtime.supervisor_runtime.console_log')
    def test_capacity_failure_in_execution_mode_schedules_backoff(self, mock_console, mock_write_activity):
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
        signal = WorkerFailureSignal("No capacity available", "antigravity_stream_result_error", True)
        
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

if __name__ == '__main__':
    unittest.main()
