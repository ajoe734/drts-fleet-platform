from __future__ import annotations

import unittest
from unittest import mock

from control_plane.runtime import supervisor_runtime as supervisor


class LiveApprovalResumeTests(unittest.TestCase):
    def worker(self, status="waiting_approval"):
        return {
            "run_id": "claude2-live-run",
            "task_id": "UV-EXEC-024",
            "provider": "claude2",
            "agent_id": "claude2",
            "session_id": "session-1",
            "status": status,
            "pid": 4242,
            "worker_unit": "drts-worker-claude2-live-run.service",
            "log_path": "/task/original-stdout.log",
            "deferred_action": "approval-1",
            "deferred_tool_use": "tool-1",
        }

    def test_live_allow_keeps_original_handles_and_is_idempotent(self):
        worker = self.worker()
        handles = {key: worker[key] for key in ("pid", "worker_unit", "log_path")}
        approval = {"approval_id": "approval-1", "decision": "allow"}

        # The observed duplicate systemd launch failed, but MainPID lookup
        # returned the original PID and the old code replaced its stdout path.
        def duplicate_resume(_config, current, _report, **_kwargs):
            current["log_path"] = "/task/failed-duplicate-launch.log"
            current["resume_count"] = 1
            return {"pid": current["pid"], "log_path": current["log_path"]}

        with (
            mock.patch.object(supervisor, "resume_claude_worker", side_effect=duplicate_resume) as resume,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            result = supervisor.handle_worker_approval_state(
                {}, {}, {}, worker, pending=[], resolved=[approval], alive=True,
            )
            self.assertEqual(result, (False, True))
            self.assertEqual(worker["status"], "running")
            self.assertEqual({key: worker[key] for key in handles}, handles)
            self.assertEqual(worker["last_approval_id"], "approval-1")
            self.assertIsNone(worker["deferred_action"])
            self.assertIsNone(worker["deferred_tool_use"])
            self.assertNotIn("resume_count", worker)
            self.assertEqual(
                supervisor.handle_worker_approval_state(
                    {}, {}, {}, worker, pending=[], resolved=[approval], alive=True,
                ),
                (False, False),
            )
            resume.assert_not_called()

    def test_live_pending_keeps_waiting_without_starting_another_process(self):
        worker = self.worker(status="running")
        approval = {"approval_id": "approval-1", "created_at": "2026-09-10T10:00:00Z"}
        with (
            mock.patch.object(supervisor, "resume_claude_worker") as resume,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            result = supervisor.handle_worker_approval_state(
                {}, {}, {}, worker, pending=[approval], resolved=[], alive=True,
            )
        self.assertEqual(result, (True, True))
        self.assertEqual(worker["status"], "waiting_approval")
        self.assertEqual(worker["log_path"], "/task/original-stdout.log")
        resume.assert_not_called()

    def test_dead_suspended_worker_still_resumes_after_allow(self):
        worker = self.worker(status="suspended_approval")
        approval = {"approval_id": "approval-1", "decision": "allow"}
        with (
            mock.patch.object(supervisor, "resume_claude_worker", return_value={"pid": 5555}) as resume,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            result = supervisor.handle_worker_approval_state(
                {}, {}, {}, worker, pending=[], resolved=[approval], alive=False,
            )
        self.assertEqual(result, (True, True))
        resume.assert_called_once_with({}, worker, {}, approval=approval)


if __name__ == "__main__":
    unittest.main()
