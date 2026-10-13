from __future__ import annotations

import subprocess
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest import mock

from adapters.base import DeliveryRequest, DeliveryResult
from common import apply_worker_unit_env
from control_plane.domain.task_records import build_dispatch_event, task_is_dispatch_eligible_for_agent
from control_plane.runtime import supervisor_runtime as runtime
from orchestrator_test_support import DispatchEnvironmentIsolation

from .fixtures import acceptance_task, requested_task, snapshot


class ManagedAcceptanceReviewRuntime(DispatchEnvironmentIsolation, unittest.TestCase):
    """Actual policy/queue/admission/workspace/fence metadata; process delivery is mocked."""

    def setUp(self):
        super().setUp()
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.config = {
            "paths": {"status_file": str(self.root / "ai-status.json"),
                      "event_queue": str(self.root / "events.jsonl"),
                      "activity_log": str(self.root / "activity.jsonl"),
                      "task_brief_dir": str(self.root / "briefs"),
                      "state_file": str(self.root / "state.json")},
            "agents": {name.lower(): {"id": name.lower(), "display_name": name, "provider": name.lower(), "adapter": "codex"}
                       for name in ("Codex", "Codex2")},
            "providers": {},
            "supervisor": {"worker_worktrees": {"enabled": True}, "helper_claim": {"enabled": False}},
            "ready_dispatcher": {"max_tasks_per_agent": 3},
        }
        self.task = requested_task()

    def request(self, task=None, agent="codex", reason="review_ready_dispatch"):
        return DeliveryRequest(agent, agent, "codex", "Review original acceptance task", self.task["id"], reason,
                               metadata={"mode": "execution", "task": deepcopy(task or self.task)})

    def start(self, request, state=None):
        return runtime.start_worker_for_request(self.config, state or {"workers": {}}, {}, request,
                                                queue_event_id="evt-original", attempt_count=1, event_id_for_log=None)

    def test_normal_dispatch_only_original_assigned_reviewer_with_role_eligibility(self):
        state = {"workers": {}, "queue": {"events": {}}}
        with (mock.patch.object(runtime, "load_status", return_value={"tasks": [self.task]}),
              mock.patch.object(runtime, "load_event_queue", return_value=[]),
              mock.patch.object(runtime, "queue_delivery_event", return_value=True) as queue):
            runtime.dispatch_ready_tasks(self.config, state, provider_report={})
        queue.assert_called_once()
        event = queue.call_args.args[1]
        self.assertEqual(event["task_id"], self.task["id"])
        self.assertEqual(event["target_agent"], "Codex")
        self.assertEqual(event["reason"], "review_ready_dispatch")
        self.assertEqual(event["task"]["candidate_sha"], self.task["candidate_sha"])
        self.assertEqual(event["task"]["acceptance_review_request"], self.task["acceptance_review_request"])
        self.assertTrue(task_is_dispatch_eligible_for_agent(self.task, "Codex"))
        self.assertFalse(task_is_dispatch_eligible_for_agent(self.task, "Codex2"))
        self.assertEqual(self.task["status"], "acceptance")

    def test_no_review_overlap_with_active_original_owner_or_reviewer(self):
        for agent in ("codex", "codex2"):
            state = {"workers": {"active": {"task_id": self.task["id"], "agent_id": agent, "status": "running"}},
                     "queue": {"events": {}}}
            with (mock.patch.object(runtime, "load_status", return_value={"tasks": [self.task]}),
                  mock.patch.object(runtime, "load_event_queue", return_value=[]),
                  mock.patch.object(runtime, "queue_delivery_event") as queue):
                runtime.dispatch_ready_tasks(self.config, state, provider_report={})
                self.assertEqual(self.start(self.request(), state)[1], "dispatch_original_task_active")
            queue.assert_not_called()

    def test_queued_original_owner_event_becomes_stale_and_cannot_retry(self):
        owner_task = acceptance_task()
        event = build_dispatch_event(owner_task, "Codex2", "acceptance_ready_dispatch", {owner_task["id"]: owner_task})
        event["event_key"] = event.pop("key")
        self.assertIsNotNone(runtime.stale_dispatch_skip_message(self.config, event, {self.task["id"]: self.task}))
        with mock.patch.object(runtime, "load_status", return_value={"tasks": [self.task]}):
            self.assertEqual(self.start(self.request(owner_task, "codex2", "acceptance_ready_dispatch"))[1],
                             "dispatch_acceptance_review_changed")

    def test_queued_review_drift_rejected_before_delivery(self):
        event = build_dispatch_event(self.task, "Codex", "review_ready_dispatch", {self.task["id"]: self.task})
        event["event_key"] = event.pop("key")
        for changes in ({"candidate_sha": "a" * 40}, {"candidate_generation": "new"}, {"merge_sha": "a" * 40},
                        {"reviewed_sha": "a" * 40}, {"reviewer": "Gemini"}, {"external_gate": True},
                        {"ci_status": "failure"}, {"depends_on": ["DEP"]}):
            with self.subTest(changes=changes):
                current = {**deepcopy(self.task), **changes}
                board = {"tasks": [current, {"id": "DEP", "status": "blocked"}]}
                self.assertIsNotNone(runtime.stale_dispatch_skip_message(self.config, event, {t["id"]: t for t in board["tasks"]}))
                with (mock.patch.object(runtime, "load_status", return_value=board),
                      mock.patch.object(runtime, "build_adapter") as adapter):
                    self.assertFalse(self.start(self.request())[0])
                adapter.assert_not_called()
        for state in ("declined", "reopened"):
            current = deepcopy(self.task)
            current["acceptance_review_request"]["state"] = state
            with mock.patch.object(runtime, "load_status", return_value={"tasks": [current]}):
                self.assertFalse(self.start(self.request())[0])

    def test_missing_board_task_and_request_identity_drift_reject_retry(self):
        for tasks in ([], [{**self.task, "acceptance_review_request": {
                **self.task["acceptance_review_request"], "request_id": "replacement"}}]):
            with (mock.patch.object(runtime, "load_status", return_value={"tasks": tasks}),
                  mock.patch.object(runtime, "build_adapter") as adapter):
                self.assertEqual(self.start(self.request())[1], "dispatch_acceptance_review_changed")
            adapter.assert_not_called()

    def test_request_resolved_during_workspace_io_rejected_before_delivery(self):
        current = deepcopy(self.task)
        current["acceptance_review_request"]["state"] = "declined"
        with (mock.patch.object(runtime, "load_status", side_effect=[{"tasks": [self.task]}, {"tasks": [current]}]),
              mock.patch.object(runtime, "ensure_task_brief"),
              mock.patch.object(runtime, "ensure_execution_workspace", return_value=(
                  self.root / "reviews", self.task["candidate_sha"], "dev", "existing_review_worktree")),
              mock.patch.object(runtime, "build_adapter") as adapter):
            self.assertEqual(self.start(self.request())[1], "dispatch_acceptance_review_changed")
        adapter.assert_not_called()

    def test_pending_original_owner_queue_prevents_second_review_enqueue(self):
        owner_task = acceptance_task()
        event = build_dispatch_event(owner_task, "Codex2", "acceptance_ready_dispatch", {owner_task["id"]: owner_task})
        event.update(event_id="evt-owner", target_agent="codex2", event_key=event.pop("key"))
        state = {"workers": {}, "queue": {"events": {"evt-owner": {"status": "queued"}}}}
        with (mock.patch.object(runtime, "load_status", return_value={"tasks": [self.task]}),
              mock.patch.object(runtime, "load_event_queue", return_value=[event]),
              mock.patch.object(runtime, "queue_delivery_event") as queue):
            runtime.dispatch_ready_tasks(self.config, state, provider_report={})
        queue.assert_not_called()

    def test_original_review_dispatch_completion_keeps_existing_receipt_protocol(self):
        worker = {"request_snapshot": {"reason": "review_ready_dispatch", "metadata": {"task": self.task}}}
        statuses = runtime.worker_expected_completion_statuses(self.config, worker, self.task)
        self.assertIn("in_progress", statuses)
        self.assertIn("acceptance", statuses)
        self.assertNotIn("integrating", statuses)

    def test_current_request_does_not_enable_helper_reassignment(self):
        self.assertIsNone(runtime.proactive_claim_plan_for_idle_agent(
            self.config, task=self.task, task_map={self.task["id"]: self.task}, idle_agent_name="Gemini",
            idle_agent_names=["Gemini"], agent_loads={"Codex": [0]}, helper_settings={"enabled": True, "task_statuses": ["acceptance"]}))

    def test_config_disabling_worktrees_cannot_deliver_acceptance_review_in_root(self):
        self.config["supervisor"]["worker_worktrees"]["enabled"] = False
        with (mock.patch.object(runtime, "load_status", return_value={"tasks": [self.task]}),
              mock.patch.object(runtime, "ensure_task_brief"),
              mock.patch.object(runtime, "build_adapter") as adapter):
            result = self.start(self.request())
        self.assertFalse(result[0])
        self.assertEqual(result[1], "reviewer_workspace_unavailable:acceptance_review_requires_pinned_workspace")
        adapter.assert_not_called()

    def git(self, root, *args):
        return subprocess.run(["git", "-c", "user.name=Routing Test", "-c", "user.email=test@example.invalid", *args],
                              cwd=root, check=True, capture_output=True, text=True).stdout.strip()

    def test_actual_managed_detached_workspace_and_original_task_fence(self):
        self.git(self.root, "init", "-b", "dev")
        (self.root / "candidate.txt").write_text("frozen candidate\n")
        self.git(self.root, "add", "candidate.txt")
        self.git(self.root, "commit", "-m", "test candidate")
        sha = self.git(self.root, "rev-parse", "HEAD")
        self.task.update(candidate_sha=sha, reviewed_sha=sha, ci_sha=sha, merge_sha=sha)
        self.task["acceptance_review_request"].update(snapshot(self.task))
        owner = self.root / ".artifacts/worktrees/auto/owner"
        self.git(self.root, "worktree", "add", "-b", "codex2/c123", str(owner), "dev")
        (owner / "candidate.txt").write_text("unrelated owner WIP\n")
        owner_before = self.git(owner, "status", "--porcelain")
        result = DeliveryResult(True, "codex", "codex", "codex", True, False, run_id="test-review-run")
        state = {"workers": {}}
        # Only I/O reads of the board and worker launch are mocked. Worktree
        # provisioning, role/admission checks, prompt and fence metadata run.
        with (mock.patch.object(runtime, "load_status", return_value={"tasks": [self.task]}),
              mock.patch.object(runtime, "ensure_task_brief"),
              mock.patch.object(runtime, "build_adapter") as adapter):
            adapter.return_value.deliver.return_value = result
            request = self.request()
            started = self.start(request, state)
        self.assertTrue(started[0], started[1])
        adapter.return_value.deliver.assert_called_once()
        worker = state["workers"]["test-review-run"]
        workspace = Path(worker["workspace_root"])
        self.assertNotEqual(workspace, owner)
        self.assertNotEqual(workspace, self.root)
        self.assertEqual(self.git(workspace, "rev-parse", "HEAD"), sha)
        self.assertEqual(self.git(workspace, "branch", "--show-current"), "")
        self.assertEqual((workspace / "candidate.txt").read_text(), "frozen candidate\n")
        self.assertEqual(self.git(owner, "status", "--porcelain"), owner_before)
        env = {}
        apply_worker_unit_env(env, self.config, "test-review-run", request.metadata)
        self.assertEqual(env["ORCH_DISPATCH_TASK_ID"], self.task["id"])
        self.assertEqual(env["ORCH_DISPATCH_ROLE"], "reviewer")
        self.assertEqual(env["ORCH_DISPATCH_AGENT"], "Codex")
        self.assertEqual(env["ORCH_DISPATCH_CANDIDATE_SHA"], sha)
        self.assertEqual(env["ORCH_DISPATCH_CANDIDATE_GENERATION"], self.task["candidate_generation"])
        self.assertIn("do not edit, commit, push", request.message)
        self.assertIn("decline-acceptance-review", request.message)
        self.assertIn("ACCEPTANCE_REVIEW_SNAPSHOT_JSON", request.message)
        runtime.attach_workspace_metadata(self.config, request, workspace, sha, "dev", worker["workspace_source"])
        self.assertEqual(request.message.count("Acceptance reviewer decision (original task only)"), 1)
