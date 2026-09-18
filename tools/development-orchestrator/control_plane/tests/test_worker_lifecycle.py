from __future__ import annotations

import unittest

from control_plane.domain.worker_lifecycle import consume_result, redispatch_is_deferred


class WorkerLifecycleTest(unittest.TestCase):
    def test_progress_result_is_consumed_exactly_once(self) -> None:
        worker = {"run_id": "codex-1", "task_id": "TASK-1", "agent_id": "codex", "status": "running"}
        result = {"outcome": "progress", "summary": "CI still running"}

        self.assertTrue(
            consume_result(
                worker,
                result,
                completed_at="2026-08-14T12:00:00Z",
                redispatch_after="2026-08-14T12:02:00Z",
            )
        )
        self.assertEqual(worker["status"], "completed")
        self.assertEqual(worker["terminal_outcome"], "progress")
        self.assertFalse(
            consume_result(
                worker,
                result,
                completed_at="2026-08-14T12:00:05Z",
                redispatch_after="2026-08-14T12:02:05Z",
            )
        )

    def test_latest_progress_attempt_owns_redispatch_delay(self) -> None:
        workers = {
            "old": {
                "run_id": "old",
                "task_id": "TASK-1",
                "agent_id": "codex",
                "status": "completed",
                "terminal_outcome": "progress",
                "completed_at": "2026-08-14T11:50:00Z",
                "redispatch_after": "2026-08-14T11:55:00Z",
            },
            "latest": {
                "run_id": "latest",
                "task_id": "TASK-1",
                "agent_id": "codex",
                "status": "completed",
                "terminal_outcome": "progress",
                "completed_at": "2026-08-14T12:00:00Z",
                "redispatch_after": "2026-08-14T12:02:00Z",
            },
        }

        self.assertTrue(redispatch_is_deferred(workers, "TASK-1", "Codex", now="2026-08-14T12:01:00Z"))
        self.assertFalse(redispatch_is_deferred(workers, "TASK-1", "Codex", now="2026-08-14T12:02:00Z"))
        self.assertFalse(redispatch_is_deferred(workers, "TASK-1", "Claude", now="2026-08-14T12:01:00Z"))


if __name__ == "__main__":
    unittest.main()
