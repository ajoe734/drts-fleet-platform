from __future__ import annotations

import copy
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from control_plane.domain.resource_admission import decide
from control_plane.domain.worker_lifecycle import ACTIVE_WORKER_STATUSES
from control_plane.infra.runtime_repo import prune_worker_records
from control_plane.runtime import supervisor_runtime as supervisor
from control_plane.usecases.dispatch_runtime import active_worker_agent_counts, active_worker_indexes


class DeliveryStateTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        (root / "events.jsonl").write_text("")
        (root / "status.json").write_text('{"tasks": []}')
        self.config = {
            "paths": {"event_queue": str(root / "events.jsonl"), "status_file": str(root / "status.json")},
            "agents": {"claude2": {"id": "claude2", "display_name": "Claude2", "provider": "claude2"}},
            "ready_dispatcher": {"max_tasks_per_agent_by_lane": {"claude2": 1}},
            "supervisor": {"resource_guard": {"max_total_workers": 1}},
        }
        self.report = {"providers": {"claude2": {"installed": True, "auth_ready": True}}}
        self.worker = {
            "run_id": "held-run", "task_id": "HELD", "agent_id": "claude2", "provider": "claude2",
            "status": "suspended_approval", "session_id": "original-session", "queue_event_id": "held-event",
            "deferred_action": "approval-1", "request_snapshot": {"metadata": {"dispatch_role": "reviewer"}},
        }
        self.state = {
            "workers": {"held-run": self.worker},
            "queue": {"events": {"held-event": {"status": "manual_pending", "run_id": "held-run"}}},
            "failure_streaks": {
                "OLD:owner": {"task_id": "OLD", "role": "owner", "agent": "Claude2",
                              "count": 2, "awaiting_chair": True, "last_failure_kind": "terminal"},
            },
        }

    def test_task_failure_does_not_disqualify_its_lane_from_recovery(self):
        self.assertEqual(
            supervisor.choose_chair_reviewer(self.config, self.state, {"tasks": []}, self.report),
            ("claude2", "Claude2"),
        )
        # Recovery selection does not erase the failed assignment or authorize
        # redispatching it. The same task-role gate still applies.
        self.assertTrue(supervisor.task_waiting_on_chair_reassignment(
            self.state, {"id": "OLD"}, reason="owned_in_progress_dispatch", target_agent="Claude2",
        ))

    def test_actual_provider_pause_and_operator_ban_still_block_chair(self):
        for kind in ("auth", "quota", "capacity"):
            with self.subTest(kind=kind):
                self.state["provider_pauses"] = {
                    "claude2": {"lane_id": "claude2", "scope": "lane", "kind": kind, "resume_at": None},
                }
                self.assertIsNone(supervisor.choose_chair_reviewer(
                    self.config, self.state, {"tasks": []}, self.report,
                ))
        self.state["provider_pauses"] = {}
        self.config["ready_dispatcher"]["max_tasks_per_agent_by_lane"]["claude2"] = 0
        self.assertIsNone(supervisor.choose_chair_reviewer(self.config, self.state, {"tasks": []}, self.report))

    def test_suspension_releases_capacity_but_keeps_task_and_attempt(self):
        self.assertEqual(active_worker_indexes(self.state, ACTIVE_WORKER_STATUSES), (set(), {("HELD", "claude2")}))
        self.assertEqual(active_worker_agent_counts(self.state, ACTIVE_WORKER_STATUSES), {})
        admission = decide(self.config, self.state, agent_id="claude2")
        self.assertTrue(admission.allowed)
        self.assertEqual((admission.total_count, admission.lane_count), (0, 0))
        prune_worker_records(self.state)
        self.assertEqual(self.state["workers"]["held-run"], self.worker)
        # A live process waiting for an answer still consumes the slot.
        self.worker["status"] = "waiting_approval"
        self.assertFalse(decide(self.config, self.state, agent_id="claude2").allowed)

    def test_suspended_occupancy_is_pending_once(self):
        supervisor.update_supervisor_mode_metadata(self.state, focus_mode="execution", heartbeat_at="2026-10-18T00:00:00Z")
        self.assertEqual(self.state["supervisor"]["mode_occupancy"]["execution"], {"running": 0, "pending": 1, "queued": 0})

    def test_suspended_attempt_does_not_hide_deadlock_or_clear_quota(self):
        self.state["chair_review"] = {"blocked": {"reason": "approval_triage"}}
        self.state["provider_pauses"] = {
            "claude2": {"lane_id": "claude2", "scope": "lane", "kind": "quota", "resume_at": None},
        }
        original = copy.deepcopy(self.worker)
        with (mock.patch.object(supervisor, "_force_recovery_probe", return_value=self.report) as probe,
              mock.patch.object(supervisor, "write_activity_log")):
            self.assertTrue(supervisor.break_full_deadlock(self.config, self.state, {"tasks": [{"id": "NEXT", "status": "todo"}]}))
        probe.assert_called_once()
        self.assertIn("operator_attention", self.state["deadlock_recovery"])
        self.assertIn("claude2", self.state["provider_pauses"])
        self.assertEqual(self.worker, original)
        self.assertIn("held-event", self.state["queue"]["events"])

    def test_allowed_resume_waits_for_capacity_without_consuming_approval(self):
        approval = {"approval_id": "approval-1", "decision": "allow"}
        self.state["workers"]["busy-run"] = {"status": "running", "agent_id": "claude2"}
        with (mock.patch.object(supervisor, "resume_claude_worker", return_value={"pid": 5555}) as resume,
              mock.patch.object(supervisor, "write_activity_log")):
            self.assertEqual(supervisor.handle_worker_approval_state(
                self.config, self.state, self.report, self.worker, pending=[], resolved=[approval], alive=False,
            ), (True, False))
            resume.assert_not_called()
            self.assertNotIn("last_approval_id", self.worker)
            self.assertEqual(self.worker["deferred_action"], "approval-1")
            del self.state["workers"]["busy-run"]
            self.assertEqual(supervisor.handle_worker_approval_state(
                self.config, self.state, self.report, self.worker, pending=[], resolved=[approval], alive=False,
            ), (True, True))
        resume.assert_called_once_with(self.config, self.worker, self.report, approval=approval)
        self.assertEqual(self.worker["last_approval_id"], "approval-1")

    def test_pending_user_decision_is_never_expired_or_resumed_by_capacity_change(self):
        approval = {"approval_id": "approval-1", "status": "pending", "expires_at": "2020-01-01T00:00:00Z"}
        before = copy.deepcopy(self.worker)
        with mock.patch.object(supervisor, "resume_claude_worker") as resume:
            self.assertEqual(supervisor.handle_worker_approval_state(
                self.config, self.state, self.report, self.worker, pending=[approval], resolved=[], alive=False,
            ), (True, False))
        resume.assert_not_called()
        self.assertEqual(self.worker, before)
        self.assertEqual(approval["status"], "pending")

    def test_approval_does_not_override_a_provider_pause_on_resume(self):
        self.state["provider_pauses"] = {
            "claude2": {"lane_id": "claude2", "scope": "lane", "kind": "quota", "resume_at": None},
        }
        approval = {"approval_id": "approval-1", "decision": "allow"}
        with mock.patch.object(supervisor, "resume_claude_worker") as resume:
            self.assertEqual(supervisor.handle_worker_approval_state(
                self.config, self.state, self.report, self.worker, pending=[], resolved=[approval], alive=False,
            ), (True, False))
        resume.assert_not_called()
        self.assertNotIn("last_approval_id", self.worker)

    def test_committed_handoff_receipt_wins_over_cached_task_phase_on_exit(self):
        self.worker["status"] = "running"
        receipt = {"outcome": "advanced", "command": "handoff", "candidate_sha": "a" * 40}
        fresh_task = {"id": "HELD", "status": "review", "worker_outcomes": {"held-run": receipt}}
        with (mock.patch.object(supervisor, "load_status", return_value={"tasks": [fresh_task]}),
              mock.patch.object(supervisor, "task_index_from_status", return_value={"HELD": fresh_task}),
              mock.patch.object(supervisor, "finalize_queue_event_record") as finalize,
              mock.patch.object(supervisor, "finalize_terminal_worker_outcome") as fail,
              mock.patch.object(supervisor, "write_activity_log")):
            self.assertTrue(supervisor.finalize_exited_worker(
                self.config, self.state, self.worker, current_mode="execution", task_status="in_progress",
                expected_completion_statuses={"review"}, now=datetime.now(timezone.utc),
            ))
        fail.assert_not_called()
        self.assertEqual(self.worker["status"], "completed")
        finalize.assert_called_once_with(self.config, self.state, self.worker, "completed")


if __name__ == "__main__":
    unittest.main()
