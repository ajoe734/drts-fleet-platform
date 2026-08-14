#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
import unittest
from unittest import mock
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "ai_status", ROOT / "tools" / "development-orchestrator" / "bin" / "ai_status.py"
)
assert SPEC is not None and SPEC.loader is not None
ai_status = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ai_status)


class CandidateLifecycleTest(unittest.TestCase):
    def state(self, *, required_acceptance: list[str] | None = None, task_class: str | None = None) -> dict:
        task = {
            "id": "TASK-001",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "in_progress",
            "next": "Implementing",
        }
        if required_acceptance:
            task["required_acceptance"] = required_acceptance
        if task_class:
            task["task_class"] = task_class
        return {"tasks": [task], "blockers": [], "handoffs": []}

    def task(self, state: dict) -> dict:
        return state["tasks"][0]

    @mock.patch.object(ai_status, "append_log")
    @mock.patch.object(ai_status, "git_commit_exists", return_value=True)
    def test_canonical_handoff_locks_sha_and_branch(self, _exists: mock.Mock, _log: mock.Mock) -> None:
        state = self.state()
        env = {"AI_NAME": "Codex", "CANDIDATE_SHA": "abc123", "CANDIDATE_BRANCH": "codex/task-001"}
        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_handoff(state, ["TASK-001", "Claude", "Ready for review"])

        task = self.task(state)
        self.assertEqual(task["status"], "review")
        self.assertEqual(task["candidate_sha"], "abc123")
        self.assertEqual(task["candidate_branch"], "codex/task-001")
        self.assertEqual(state["handoffs"][0]["to"], "Claude")

    @mock.patch.object(ai_status, "append_log")
    @mock.patch.object(ai_status, "git_commit_exists", return_value=True)
    def test_handoff_rejects_canonical_work_without_candidate_evidence(self, _exists: mock.Mock, _log: mock.Mock) -> None:
        with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True):
            with self.assertRaisesRegex(SystemExit, "CANDIDATE_SHA"):
                ai_status.command_handoff(self.state(), ["TASK-001", "Claude", "Ready"])

    @mock.patch.object(ai_status, "append_log")
    @mock.patch.object(ai_status, "git_commit_exists", return_value=True)
    def test_reviewer_approval_requires_same_sha(self, _exists: mock.Mock, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update({"status": "review", "candidate_sha": "abc123", "candidate_branch": "codex/task-001"})
        with mock.patch.dict(os.environ, {"AI_NAME": "Claude", "REVIEWED_SHA": "different"}, clear=True):
            with self.assertRaisesRegex(SystemExit, "exactly match"):
                ai_status.command_approve(state, ["TASK-001", "No"])

        with mock.patch.dict(os.environ, {"AI_NAME": "Claude", "REVIEWED_SHA": "abc123"}, clear=True):
            ai_status.command_approve(state, ["TASK-001", "Approved"])
        self.assertEqual(task["status"], "integrating")
        self.assertEqual(task["reviewed_sha"], "abc123")

    @mock.patch.object(ai_status, "append_log")
    def test_changed_head_invalidates_review_and_ci_evidence(self, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update(
            {
                "status": "integrating",
                "candidate_sha": "abc123",
                "candidate_branch": "codex/task-001",
                "reviewed_sha": "abc123",
                "ci_sha": "abc123",
                "ci_status": "success",
                "pr_url": "https://example.test/pr/1",
            }
        )
        with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor", "CANDIDATE_HEAD_SHA": "def456"}, clear=True):
            ai_status.command_reconcile_candidate(state, ["TASK-001"])

        self.assertEqual(task["status"], "in_progress")
        self.assertNotIn("candidate_sha", task)
        self.assertNotIn("reviewed_sha", task)
        self.assertNotIn("ci_sha", task)

    @mock.patch.object(ai_status, "append_log")
    def test_merge_waits_for_required_acceptance_before_done(self, _log: mock.Mock) -> None:
        state = self.state(required_acceptance=["staging_signoff"])
        task = self.task(state)
        task.update(
            {
                "status": "integrating",
                "candidate_sha": "abc123",
                "candidate_branch": "codex/task-001",
                "reviewed_sha": "abc123",
            }
        )
        env = {
            "AI_NAME": "Supervisor",
            "CANDIDATE_HEAD_SHA": "abc123",
            "CANDIDATE_CI_STATUS": "success",
            "MERGE_SHA": "fedcba",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_reconcile_candidate(state, ["TASK-001", "Merged"])
        self.assertEqual(task["status"], "acceptance")

        with mock.patch.dict(
            os.environ,
            {"AI_NAME": "Codex", "ACCEPTANCE_EVIDENCE_JSON": '{"staging_signoff":"run-42"}'},
            clear=True,
        ):
            ai_status.command_record_acceptance(state, ["TASK-001", "Staging accepted"])
        self.assertEqual(task["status"], "done")
        self.assertEqual(task["acceptance_evidence"]["staging_signoff"], "run-42")

    @mock.patch.object(ai_status, "append_log")
    def test_supervisor_reassigns_through_candidate_writer(self, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update(
            {
                "candidate_sha": "abc123",
                "candidate_branch": "codex/task-001",
                "reviewed_sha": "abc123",
            }
        )
        state["handoffs"] = [{"task_id": "TASK-001", "to": "Codex", "status": "pending"}]
        env = {
            "AI_NAME": "Supervisor",
            "TASK_EXPECTED_OWNER": "Codex",
            "TASK_EXPECTED_REVIEWER": "Claude",
            "TASK_REASSIGN_REOPEN": "1",
            "TASK_HANDOFF_FROM": "Codex",
            "TASK_HANDOFF_TO": "Gemini",
            "TASK_EVIDENCE_REF": "support/reassign/TASK-001.json",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_reassign(
                state,
                ["TASK-001", "Gemini", "Claude", "Move to the healthy lane"],
            )

        self.assertEqual(task["owner"], "Gemini")
        self.assertEqual(task["status"], "todo")
        self.assertNotIn("candidate_sha", task)
        self.assertEqual(task["evidence_refs"], ["support/reassign/TASK-001.json"])
        self.assertEqual(state["handoffs"][0]["status"], "done")
        self.assertEqual(state["handoffs"][1]["to"], "Gemini")

        with mock.patch.dict(
            os.environ,
            {
                "AI_NAME": "Supervisor",
                "TASK_EXPECTED_OWNER": "Gemini",
                "TASK_EXPECTED_REVIEWER": "Claude",
            },
            clear=True,
        ):
            ai_status.command_reassign(
                state,
                ["TASK-001", "Gemini", "Claude2", "Switch reviewer after owner move"],
            )
        self.assertEqual(task["owner"], "Gemini")
        self.assertEqual(task["reviewer"], "Claude2")

    @mock.patch.object(ai_status, "append_log")
    def test_supervisor_resume_resolves_blocker_in_same_transaction(self, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update({"status": "blocked", "waiting_for": "Claude"})
        state["blockers"] = [{"task_id": "TASK-001", "status": "open"}]
        with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor"}, clear=True):
            ai_status.command_resume_blocked(state, ["TASK-001", "todo", "Unblock evidence is complete"])

        self.assertEqual(task["status"], "todo")
        self.assertNotIn("waiting_for", task)
        self.assertEqual(state["blockers"][0]["status"], "resolved")

    @mock.patch.object(ai_status, "archive_task_bodies")
    @mock.patch.object(ai_status, "_retention_keeps", return_value={"handoffs": 1, "tasks": 1, "blockers": 1})
    def test_canonical_writer_prunes_closed_history(
        self, _keeps: mock.Mock, archive: mock.Mock
    ) -> None:
        state = {
            "handoffs": [
                {"task_id": "A", "status": "pending"},
                {"task_id": "B", "status": "done"},
                {"task_id": "C", "status": "done"},
            ],
            "tasks": [
                {"id": "A", "status": "todo"},
                {"id": "B", "status": "done"},
                {"id": "C", "status": "done"},
            ],
            "blockers": [
                {"task_id": "A", "status": "open"},
                {"task_id": "B", "status": "resolved"},
                {"task_id": "C", "status": "resolved"},
            ],
        }

        ai_status.prune_state_for_size(state)

        self.assertEqual([item["task_id"] for item in state["handoffs"]], ["A", "C"])
        self.assertEqual([item["id"] for item in state["tasks"]], ["A", "C"])
        self.assertEqual(state["archived_task_ids"], ["B"])
        archive.assert_called_once()
        self.assertEqual([item["task_id"] for item in state["blockers"]], ["A", "C"])

    @mock.patch.object(ai_status, "append_log")
    def test_migration_reopens_unbound_legacy_approval(self, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update(
            {
                "status": "review_approved",
                "required_integration_status": "dev_deployed",
                "dev_deploy_run_url": "https://example.test/deploy/42",
                "dev_deploy_sha": "abc123",
                "dev_deploy_source_ref": "origin/dev",
            }
        )
        ai_status.command_migrate_candidate_lifecycle(state, [])
        self.assertEqual(task["status"], "in_progress")
        self.assertEqual(task["required_acceptance"], ["dev_deployed"])
        self.assertNotIn("required_integration_status", task)
        migrated_at = task["candidate_lifecycle_migrated_at"]
        ai_status.command_migrate_candidate_lifecycle(state, [])
        self.assertEqual(task["candidate_lifecycle_migrated_at"], migrated_at)


if __name__ == "__main__":
    unittest.main()
