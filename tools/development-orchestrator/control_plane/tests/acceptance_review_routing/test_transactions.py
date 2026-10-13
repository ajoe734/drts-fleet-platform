from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from control_plane.domain.dispatch_policy import ReadyDispatchPolicy, resolve_dispatch_target
from control_plane.usecases.task_board_commands import run_task_board_command
from orchestrator_test_support import DispatchEnvironmentIsolation

from .fixtures import acceptance_task, snapshot


class AcceptanceReviewTransactions(DispatchEnvironmentIsolation, unittest.TestCase):
    """Use the real CLI module, transaction, persistence and append-only log.

    Only the filesystem root is isolated. No status handler, permission,
    dispatch policy or fence is mocked.
    """

    def setUp(self):
        super().setUp()
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.path = self.root / "ai-status.json"
        self.original = acceptance_task()
        self.task_id = self.original["id"]
        self.path.write_text(json.dumps({"sprint": "test", "objective": "Acceptance reviewer routing",
                                         "tasks": [self.original], "blockers": [], "handoffs": []}))
        self.config = {"paths": {"status_file": str(self.path)}}
        # Normalize through the same CLI before preservation comparisons.
        result = self.command("sync", [], "Supervisor")
        self.assertTrue(result.ok, result.error)

    def task(self):
        return json.loads(self.path.read_text())["tasks"][0]

    def command(self, command, args, actor="Codex2", **extra):
        return run_task_board_command(self.config, command, args, environ={
            "AI_NAME": actor,
            "ACCEPTANCE_REVIEW_SNAPSHOT_JSON": json.dumps(snapshot(self.task())),
            **extra,
        })

    def request(self, actor="Codex2", **extra):
        return self.command("request-acceptance-review", [self.task_id, "Full900 failed", "failed-run-38326823141"],
                            actor, **extra)

    def fence(self, role="reviewer", task_id=None, agent=None):
        return {"ORCH_RUN_ID": f"test-{role}", "ORCH_DISPATCH_ROLE": role,
                "ORCH_DISPATCH_TASK_ID": task_id or self.task_id,
                "ORCH_DISPATCH_AGENT": agent or ("Codex" if role == "reviewer" else "Codex2"),
                "ORCH_DISPATCH_CANDIDATE_SHA": self.original["candidate_sha"],
                "ORCH_DISPATCH_CANDIDATE_GENERATION": self.original["candidate_generation"]}

    def unchanged_rejection(self, action, error):
        before = self.path.read_bytes()
        log = self.root / "ai-activity-log.jsonl"
        log_before = log.read_bytes() if log.exists() else b""
        result = action()
        self.assertEqual(result.returncode, 1, result.error)
        self.assertIn(error, result.error)
        self.assertEqual(before, self.path.read_bytes())
        self.assertEqual(log_before, log.read_bytes() if log.exists() else b"")

    def test_request_from_each_allowed_actor_changes_only_metadata(self):
        for actor in ("Codex2", "Codex", "Supervisor"):
            before = self.task()
            self.assertTrue(self.request(actor).ok)
            requested = self.task()
            request = requested.pop("acceptance_review_request")
            before.pop("acceptance_review_request", None)
            self.assertEqual(requested, before)
            self.assertEqual(request["requested_by"], actor)
            self.assertEqual({key: request[key] for key in snapshot(self.original)}, snapshot(self.original))
            self.assertEqual(request["state"], "pending")
            self.assertTrue(self.command("decline-acceptance-review", [self.task_id, request["request_id"], "No repair"], "Codex").ok)

    def test_dispatched_owner_can_request_and_records_progress_receipt(self):
        before = self.task()
        self.assertTrue(self.request(**self.fence("owner")).ok)
        after = self.task()
        receipt = after.pop("worker_outcomes")["test-owner"]
        after.pop("acceptance_review_request")
        self.assertEqual(after, before)
        self.assertEqual(receipt["outcome"], "progress")
        self.assertEqual(receipt["role"], "owner")

    def test_request_rejects_foreign_actor_duplicate_and_empty_evidence(self):
        self.unchanged_rejection(lambda: self.request("Gemini"), "Only the owner")
        self.unchanged_rejection(lambda: self.command("request-acceptance-review", [self.task_id, "reason", " "]), "Usage")
        self.assertTrue(self.request().ok)
        self.unchanged_rejection(lambda: self.request(), "already pending")

    def test_request_rejects_nonacceptance_unlocked_or_unreviewed_source(self):
        for changes in ({"status": "done"}, {"status": "in_progress"}, {"mutates_canonical": False},
                        {"candidate_sha": "short"}, {"merge_sha": ""}, {"candidate_generation": ""},
                        {"reviewed_sha": "a" * 40}, {"ci_sha": "a" * 40}, {"ci_status": "failure"},
                        {"reviewer": "Codex2"}):
            with self.subTest(changes=changes):
                state = json.loads(self.path.read_text())
                state["tasks"][0] = {**self.original, **changes}
                self.path.write_text(json.dumps(state))
                self.unchanged_rejection(lambda: self.request(), "locked acceptance candidate")

    def test_request_rejects_stale_foreign_and_malformed_snapshot(self):
        for value in ("not json", "[]", "{}", json.dumps({**snapshot(self.original), "task_id": "FOREIGN"}),
                      json.dumps({**snapshot(self.original), "merge_sha": "a" * 40})):
            self.unchanged_rejection(lambda: self.request(ACCEPTANCE_REVIEW_SNAPSHOT_JSON=value), "ACCEPTANCE_REVIEW_SNAPSHOT_JSON")

    def test_decline_only_current_reviewer_and_exact_request(self):
        self.assertTrue(self.request().ok)
        requested = self.task()
        request_id = requested["acceptance_review_request"]["request_id"]
        args = [self.task_id, request_id, "Evidence does not require source repair"]
        for actor in ("Codex2", "Supervisor", "Gemini"):
            self.unchanged_rejection(lambda: self.command("decline-acceptance-review", args, actor), "Only the assigned reviewer")
        self.unchanged_rejection(lambda: self.command("decline-acceptance-review", [self.task_id, "stale", "No"], "Codex"), "request changed")
        self.assertTrue(self.command("decline-acceptance-review", args, "Codex", **self.fence()).ok)
        declined = self.task()
        receipt = declined.pop("worker_outcomes")["test-reviewer"]
        decision_metadata = declined.pop("acceptance_review_request")
        requested.pop("acceptance_review_request")
        self.assertEqual(declined, requested)
        self.assertEqual(decision_metadata["state"], "declined")
        self.assertEqual(receipt["outcome"], "advanced")
        decision = resolve_dispatch_target(self.task(), {self.task_id: self.task()}, ReadyDispatchPolicy())
        self.assertEqual(decision.target_agent, "Codex2")
        self.assertEqual(decision.reason.value, "acceptance_ready_dispatch")
        self.unchanged_rejection(lambda: self.command("decline-acceptance-review", args, "Codex"), "request changed")

    def test_owner_start_reopen_and_supervisor_reopen_still_rejected(self):
        self.assertTrue(self.request().ok)
        for command, actor, error in (("start", "Codex2", "explicit reviewer reopen"),
                                      ("reopen", "Codex2", "Only the reviewer"),
                                      ("reopen", "Supervisor", "Unknown agent: Supervisor")):
            self.unchanged_rejection(lambda: self.command(command, [self.task_id, "Repair"], actor), error)

    def test_current_original_task_reviewer_reopen_consumes_request(self):
        self.assertTrue(self.request().ok)
        request_id = self.task()["acceptance_review_request"]["request_id"]
        self.unchanged_rejection(lambda: self.command("reopen", [self.task_id, "Repair"], "Codex", **self.fence()), "request changed")
        result = self.command("reopen", [self.task_id, "Precise producer finding; owner must repair"], "Codex",
                              ACCEPTANCE_REVIEW_REQUEST_ID=request_id, **self.fence())
        self.assertTrue(result.ok, result.error)
        task = self.task()
        self.assertEqual(task["status"], "in_progress")
        for key in ("candidate_sha", "reviewed_sha", "ci_sha", "merge_sha", "acceptance_evidence"):
            self.assertNotIn(key, task)
        self.assertEqual(task["required_acceptance"], self.original["required_acceptance"])
        self.assertEqual(task["owner"], "Codex2")
        self.assertEqual(task["acceptance_review_request"]["state"], "reopened")
        self.assertEqual(task["worker_outcomes"]["test-reviewer"]["outcome"], "advanced")
        log = [json.loads(line) for line in (self.root / "ai-activity-log.jsonl").read_text().splitlines()]
        types = [entry["type"] for entry in log]
        self.assertIn("acceptance_review_requested", types)
        self.assertIn("acceptance_review_resolved", types)
        self.assertEqual(types[-1], "reopen")

    def test_foreign_task_fence_stays_exit_one_for_all_review_actions(self):
        self.assertTrue(self.request().ok)
        request_id = self.task()["acceptance_review_request"]["request_id"]
        for command, args in (("reopen", [self.task_id, "Repair"]),
                              ("request-acceptance-review", [self.task_id, "reason", "evidence"]),
                              ("decline-acceptance-review", [self.task_id, request_id, "No repair"])):
            self.unchanged_rejection(lambda: self.command(command, args, "Codex", **self.fence(task_id="FOREIGN")),
                                     "Dispatched worker cannot mutate a different task")

    def test_stale_dispatch_generation_and_reassigned_reviewer_stay_fenced(self):
        self.assertTrue(self.request().ok)
        request_id = self.task()["acceptance_review_request"]["request_id"]
        for change, error in (({"candidate_generation": "new-generation"}, "candidate changed"),
                              ({"candidate_sha": "a" * 40}, "candidate changed"),
                              ({"reviewer": "Gemini"}, "assignment changed")):
            state = json.loads(self.path.read_text())
            state["tasks"][0] = {**state["tasks"][0], **change}
            self.path.write_text(json.dumps(state))
            self.unchanged_rejection(lambda: self.command("reopen", [self.task_id, "Repair"], "Codex",
                                      ACCEPTANCE_REVIEW_REQUEST_ID=request_id, **self.fence()), error)
            state["tasks"][0].update({key: self.original[key] for key in change})
            self.path.write_text(json.dumps(state))

    def test_merge_drift_rejects_decline_and_reopen_without_writing(self):
        self.assertTrue(self.request().ok)
        request_id = self.task()["acceptance_review_request"]["request_id"]
        state = json.loads(self.path.read_text())
        state["tasks"][0]["merge_sha"] = "a" * 40
        self.path.write_text(json.dumps(state))
        for command, args in (("reopen", [self.task_id, "Repair"]),
                              ("decline-acceptance-review", [self.task_id, request_id, "No repair"])):
            self.unchanged_rejection(lambda: self.command(command, args, "Codex", **self.fence(),
                                      ACCEPTANCE_REVIEW_REQUEST_ID=request_id), "request changed")

    def test_worker_cannot_impersonate_requester_or_declining_reviewer(self):
        self.unchanged_rejection(lambda: self.request("Supervisor", **self.fence("owner")), "actor must match")
        self.assertTrue(self.request().ok)
        request_id = self.task()["acceptance_review_request"]["request_id"]
        self.unchanged_rejection(lambda: self.command("decline-acceptance-review", [self.task_id, request_id, "No"],
                                                     "Codex", **self.fence("owner")), "actor must match")

    def test_stale_request_can_be_superseded_only_with_current_snapshot(self):
        self.assertTrue(self.request().ok)
        first = self.task()["acceptance_review_request"]
        state = json.loads(self.path.read_text())
        state["tasks"][0]["candidate_generation"] = "new-generation"
        self.path.write_text(json.dumps(state))
        self.unchanged_rejection(lambda: self.request(ACCEPTANCE_REVIEW_SNAPSHOT_JSON=json.dumps(snapshot(self.original))),
                                 "exactly match")
        before = self.task()
        self.assertTrue(self.request().ok)
        after = self.task()
        replacement = after.pop("acceptance_review_request")
        before.pop("acceptance_review_request")
        self.assertEqual(after, before)
        self.assertNotEqual(first["request_id"], replacement["request_id"])
        log = [json.loads(line) for line in (self.root / "ai-activity-log.jsonl").read_text().splitlines()]
        requests = [entry["request"]["request_id"] for entry in log if entry["type"] == "acceptance_review_requested"]
        self.assertEqual(requests, [first["request_id"], replacement["request_id"]])

    def test_existing_done_reopen_permission_clears_obsolete_pending_routing(self):
        self.assertTrue(self.request().ok)
        state = json.loads(self.path.read_text())
        state["tasks"][0]["status"] = "done"
        self.path.write_text(json.dumps(state))
        self.assertTrue(self.command("reopen", [self.task_id, "New finding after done"], "Codex").ok)
        task = self.task()
        self.assertEqual(task["status"], "in_progress")
        self.assertNotIn("acceptance_review_request", task)
        self.assertEqual(task["required_acceptance"], self.original["required_acceptance"])

