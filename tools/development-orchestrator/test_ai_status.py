#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import copy
import os
import subprocess
import pathlib
import tempfile
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


class StatusCliBoundaryTest(unittest.TestCase):
    def test_release_wrapper_does_not_delegate_to_status_root_code(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            status_root = Path(temp)
            status_root.joinpath("ai-status.json").write_text(
                '{"tasks": [], "blockers": [], "handoffs": []}', encoding="utf-8"
            )
            stale_script = (
                status_root
                / "tools"
                / "development-orchestrator"
                / "bin"
                / "ai_status.py"
            )
            stale_script.parent.mkdir(parents=True)
            stale_script.write_text("raise SystemExit(47)\n", encoding="utf-8")
            env = os.environ.copy()
            env.pop("ORCH_STATUS_ROOT", None)
            env["AI_STATUS_ROOT"] = str(status_root)

            result = subprocess.run(
                [
                    "bash",
                    str(
                        ROOT
                        / "tools"
                        / "development-orchestrator"
                        / "bin"
                        / "ai-status.sh"
                    ),
                    "list",
                ],
                cwd=status_root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("(no matches)", result.stdout)

    def test_dashboard_projection_targets_status_root(self) -> None:
        self.assertEqual(
            ai_status.DASHBOARD_DIR,
            ai_status.ROOT / "tools" / "development-orchestrator" / "dashboard",
        )


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
        env = {
            "AI_NAME": "Codex",
            "CANDIDATE_SHA": "abc123",
            "CANDIDATE_BRANCH": "codex/task-001",
            "PR_URL": "https://github.com/example/repo/pull/42",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_handoff(state, ["TASK-001", "Claude", "Ready for review"])

        task = self.task(state)
        self.assertEqual(task["status"], "review")
        self.assertEqual(task["candidate_sha"], "abc123")
        self.assertEqual(task["candidate_branch"], "codex/task-001")
        self.assertEqual(task["pr_url"], "https://github.com/example/repo/pull/42")
        self.assertEqual(state["handoffs"][0]["to"], "Claude")

    @mock.patch.object(ai_status, "append_log")
    def test_assign_refreshes_explicit_materialized_fields(self, _log: mock.Mock) -> None:
        state = self.state()
        state["agents"] = []
        task = self.task(state)
        task.update(
            {
                "depends_on": ["LEGACY-PREDEPLOY"],
                "artifacts": ["scripts/"],
                "acceptance": ["Legacy ancestry requirement"],
            }
        )
        env = {
            "AI_NAME": "Supervisor",
            "TASK_DEPENDS_ON": "UIX-001,DRV-001",
            "TASK_ARTIFACTS": "operations/verification/,tests/e2e/",
            "TASK_ACCEPTANCE": "Reviewed content is traceable through PR and CI",
        }

        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_assign(state, ["TASK-001", "Codex", "Claude", "Refreshed task"])

        self.assertEqual(task["depends_on"], ["UIX-001", "DRV-001"])
        self.assertEqual(task["artifacts"], ["operations/verification/", "tests/e2e/"])
        self.assertEqual(task["acceptance"], ["Reviewed content is traceable through PR and CI"])
        self.assertEqual(task["status"], "in_progress")

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

    def test_release_task_requires_same_sha_acceptance_contract(self) -> None:
        with self.assertRaisesRegex(SystemExit, "same-SHA acceptance evidence"):
            ai_status.validate_task_spec(
                {
                    "id": "REL-001",
                    "task_class": "release",
                    "required_acceptance": ["dev_deploy_run_url"],
                }
            )

    def test_acceptance_sha_must_match_merge_sha(self) -> None:
        task = self.task(self.state())
        task["merge_sha"] = "merge-123"
        with self.assertRaisesRegex(SystemExit, "exactly match merge SHA"):
            ai_status.validate_acceptance_evidence(task, {"dev_deploy_sha": "candidate-123"})
        ai_status.validate_acceptance_evidence(
            task,
            {"dev_deploy_sha": "merge-123", "operational_acceptance_sha": "merge-123"},
        )
        task["acceptance_evidence"] = {"dev_deploy_sha": "candidate-123"}
        with self.assertRaisesRegex(SystemExit, "exactly match merge SHA"):
            ai_status.validate_acceptance_evidence(
                task,
                {"operational_acceptance_sha": "merge-123"},
            )

    def test_documentation_task_cannot_bypass_candidate_lifecycle(self) -> None:
        with self.assertRaisesRegex(SystemExit, "cannot set mutates_canonical=false"):
            ai_status.validate_task_spec(
                {
                    "id": "DOC-001",
                    "task_class": "documentation",
                    "mutates_canonical": False,
                }
            )

    @mock.patch.object(ai_status, "append_log")
    def test_unblock_merge_resumes_parent_without_supervisor_handoff(self, _log: mock.Mock) -> None:
        state = self.state(task_class="unblock")
        helper = self.task(state)
        helper.update(
            {
                "helper_parent": "PARENT-001",
                "status": "integrating",
                "candidate_sha": "abc123",
                "candidate_branch": "codex/task-001",
                "reviewed_sha": "abc123",
            }
        )
        state["tasks"].append(
            {
                "id": "PARENT-001",
                "owner": "Gemini",
                "reviewer": "Claude",
                "status": "blocked",
                "waiting_for": "Codex",
                "next": "Waiting for repair",
            }
        )
        state["blockers"].append(
            {
                "task_id": "PARENT-001",
                "owner": "Gemini",
                "waiting_for": "Codex",
                "status": "open",
            }
        )
        env = {
            "AI_NAME": "Supervisor",
            "CANDIDATE_HEAD_SHA": "abc123",
            "CANDIDATE_CI_STATUS": "success",
            "MERGE_SHA": "fedcba",
        }

        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_reconcile_candidate(state, ["TASK-001", "Repair merged"])
        ai_status.validate_state(state)

        parent = state["tasks"][1]
        self.assertEqual(helper["status"], "done")
        self.assertEqual(parent["status"], "todo")
        self.assertEqual(state["handoffs"][0]["from"], "Codex")
        self.assertEqual(state["handoffs"][0]["to"], "Gemini")

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

    @mock.patch.object(ai_status, "append_log")
    def test_acceptance_progress_preserves_candidate_and_pending_gates(self, _log: mock.Mock) -> None:
        for status in ("acceptance", "done"):
            with self.subTest(status=status):
                state = self.state()
                task = self.task(state)
                task.update(status=status, candidate_sha="abc123", candidate_branch="codex/task-001",
                            reviewed_sha="abc123", ci_sha="abc123", ci_status="success",
                            ci_run_url="https://ci.example/1", pr_url="https://pr.example/1", merge_sha="def456",
                            required_acceptance=["live_probe", "another_gate"], acceptance_evidence={"another_gate": "verified"})
                if status == "done":
                    task["acceptance_evidence"]["live_probe"] = "verified"
                state["handoffs"] = [{"task_id": task["id"], "to": "Codex", "status": "pending"}]
                state["blockers"] = [{"task_id": task["id"], "status": "open", "message": "Live probe pending"}]
                before = copy.deepcopy(state)
                with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True):
                    ai_status.command_progress(state, [task["id"], "Read-only verification in progress"])
                self.assertEqual(task["next"], "Read-only verification in progress")
                for key in before["tasks"][0]:
                    if key not in {"next", "last_update"}:
                        self.assertEqual(task[key], before["tasks"][0][key], key)
                self.assertEqual(state["handoffs"], before["handoffs"])
                self.assertEqual(state["blockers"], before["blockers"])

    @mock.patch.object(ai_status, "append_log")
    def test_start_cannot_reopen_acceptance_or_completed_tasks(self, log: mock.Mock) -> None:
        for status in ("acceptance", "done"):
            with self.subTest(status=status):
                state = self.state()
                task = self.task(state)
                task.update(status=status, candidate_sha="abc123", reviewed_sha="abc123", merge_sha="def456")
                before = copy.deepcopy(state)
                with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True):
                    with self.assertRaisesRegex(SystemExit, "explicit reviewer reopen"):
                        ai_status.command_start(state, [task["id"], "Start stale owner dispatch"])
                self.assertEqual(state, before)
        log.assert_not_called()

    @mock.patch.object(ai_status, "append_log")
    def test_helper_backed_resume_rejects_new_blocker_without_mutation(self, _log: mock.Mock) -> None:
        state = self.state()
        parent = self.task(state)
        parent.update(status="blocked", waiting_for="Claude", next="Routing still missing")
        state["tasks"].append({
            "id": "HELPER-001", "task_class": "unblock", "status": "done",
            "helper_parent": parent["id"], "resolved_parent_status": "todo",
            "resolved_parent_at": "2026-09-09T01:00:00Z",
            "last_update": "2026-09-09T03:00:00Z",
        })
        state["blockers"] = [{"task_id": parent["id"], "status": "open", "created_at": "2026-09-09T02:00:00Z"}]
        with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor", "TASK_RESUME_HELPER_ID": "HELPER-001"}, clear=True):
            with self.assertRaisesRegex(SystemExit, "open blocker newer"):
                ai_status.command_resume_blocked(state, [parent["id"], "todo", "Retry old helper"])
        self.assertEqual(parent["status"], "blocked")
        self.assertEqual(parent["next"], "Routing still missing")
        self.assertEqual(parent["waiting_for"], "Claude")
        self.assertEqual(state["blockers"][0]["status"], "open")
        _log.assert_not_called()

    @mock.patch.object(ai_status, "append_log")
    def test_legacy_helper_note_or_progress_cannot_renew_resolution(self, _log: mock.Mock) -> None:
        for command in (ai_status.command_note, ai_status.command_progress):
            for resolution in (None, "invalid"):
                with self.subTest(command=command.__name__, resolution=resolution):
                    state = self.state()
                    parent = self.task(state)
                    parent.update(status="blocked", waiting_for="Claude", next="New blocker")
                    helper = {
                        "id": "HELPER-001", "owner": "Codex", "task_class": "unblock",
                        "status": "done", "helper_parent": parent["id"],
                        "resolved_parent_status": "todo", "last_update": "2026-09-09T01:00:00Z",
                    }
                    if resolution is not None:
                        helper["resolved_parent_at"] = resolution
                    state["tasks"].append(helper)
                    state["blockers"] = [{"task_id": parent["id"], "status": "open", "created_at": "2026-09-09T02:00:00Z"}]
                    with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True), mock.patch.object(
                        ai_status, "iso_now", return_value="2026-09-09T03:00:00Z"
                    ):
                        command(state, [helper["id"], "Administrative update"])
                    self.assertEqual(helper["status"], "done")
                    self.assertEqual(helper["last_update"], "2026-09-09T03:00:00Z")
                    before = copy.deepcopy(state)
                    with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor", "TASK_RESUME_HELPER_ID": helper["id"]}, clear=True):
                        with self.assertRaisesRegex(SystemExit, "no verifiable parent resolution time"):
                            ai_status.command_resume_blocked(state, [parent["id"], "todo", "Retry legacy helper"])
                    self.assertEqual(state, before)

    @mock.patch.object(ai_status, "append_log")
    def test_helper_backed_resume_accepts_fresh_resolution(self, _log: mock.Mock) -> None:
        state = self.state()
        parent = self.task(state)
        parent["status"] = "blocked"
        state["tasks"].append({
            "id": "HELPER-001", "task_class": "unblock", "status": "done",
            "helper_parent": parent["id"], "resolved_parent_status": "todo",
            "resolved_parent_at": "2026-09-09T03:00:00Z",
            "last_update": "2026-09-09T03:00:00Z",
        })
        state["blockers"] = [{"task_id": parent["id"], "status": "open", "created_at": "2026-09-09T02:00:00Z"}]
        with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor", "TASK_RESUME_HELPER_ID": "HELPER-001"}, clear=True):
            ai_status.command_resume_blocked(state, [parent["id"], "todo", "Repair verified"])
        self.assertEqual(parent["status"], "todo")
        self.assertEqual(state["blockers"][0]["status"], "resolved")

    @mock.patch.object(ai_status, "append_log")
    def test_helper_backed_resume_requires_matching_completed_resolved_helper(self, _log: mock.Mock) -> None:
        for overrides in ({"status": "review"}, {"helper_parent": "OTHER-001"}, {"resolved_parent_status": "blocked"}):
            with self.subTest(overrides=overrides):
                state = self.state()
                parent = self.task(state)
                parent["status"] = "blocked"
                helper = {"id": "HELPER-001", "task_class": "unblock", "status": "done", "helper_parent": parent["id"], "last_update": "2026-09-09T03:00:00Z"}
                helper.update(overrides)
                state["tasks"].append(helper)
                with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor", "TASK_RESUME_HELPER_ID": helper["id"]}, clear=True):
                    with self.assertRaisesRegex(SystemExit, "Cannot resume"):
                        ai_status.command_resume_blocked(state, [parent["id"], "todo", "Retry"])
                self.assertEqual(parent["status"], "blocked")
        _log.assert_not_called()

    @mock.patch.object(ai_status, "append_log")
    def test_merge_preserves_recorded_blocked_parent_disposition(self, _log: mock.Mock) -> None:
        state = self.state(task_class="unblock")
        helper = self.task(state)
        helper.update(helper_parent="PARENT-001", resolved_parent_status="blocked",
                      resolved_parent_next="Implement scoped routing first", resolved_parent_waiting_for="Claude")
        parent = {"id": "PARENT-001", "owner": "Gemini", "reviewer": "Claude", "status": "blocked"}
        state["tasks"].append(parent)
        with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor"}, clear=True):
            ai_status.transition_after_merge(state, helper, message="Planning merged", timestamp="2026-09-09T03:00:00Z")
        self.assertEqual(helper["status"], "done")
        self.assertEqual(helper["resolved_parent_at"], "2026-09-09T03:00:00Z")
        self.assertEqual(parent["status"], "blocked")
        self.assertEqual(parent["next"], "Implement scoped routing first")
        self.assertEqual(parent["waiting_for"], "Claude")
        self.assertFalse(any(h.get("status") == "pending" for h in state["handoffs"]))

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


class DashboardMirrorRemovalTests(unittest.TestCase):
    """sync_dashboard must stop writing copies nobody serves."""

    def test_sync_does_not_copy_the_activity_log(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = pathlib.Path(tmpdir)
            dashboard = root / "dashboard"
            dashboard.mkdir()
            log = root / "ai-activity-log.jsonl"
            log.write_text('{"ts":"x"}\n', encoding="utf-8")

            with mock.patch.object(ai_status, "ROOT", root), \
                    mock.patch.object(ai_status, "DASHBOARD_DIR", dashboard), \
                    mock.patch.object(ai_status, "LOG_FILE", log):
                ai_status.sync_dashboard()

            self.assertFalse(
                (dashboard / "ai-activity-log.jsonl").exists(),
                "the activity log was mirrored again; the server reads the live file",
            )

    def test_sync_clears_a_mirror_left_by_an_older_build(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = pathlib.Path(tmpdir)
            dashboard = root / "dashboard"
            dashboard.mkdir()
            stale = dashboard / "ai-activity-log.jsonl"
            stale.write_text("stale snapshot\n", encoding="utf-8")

            with mock.patch.object(ai_status, "ROOT", root), \
                    mock.patch.object(ai_status, "DASHBOARD_DIR", dashboard):
                ai_status.sync_dashboard()

            self.assertFalse(
                stale.exists(),
                "a stale mirror survived; a static server here would serve a frozen snapshot",
            )

    def test_sync_leaves_the_dashboard_assets_alone(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = pathlib.Path(tmpdir)
            dashboard = root / "dashboard"
            dashboard.mkdir()
            asset = dashboard / "index.html"
            asset.write_text("<html></html>", encoding="utf-8")

            with mock.patch.object(ai_status, "ROOT", root), \
                    mock.patch.object(ai_status, "DASHBOARD_DIR", dashboard):
                ai_status.sync_dashboard()

            self.assertTrue(asset.exists(), "sync removed a dashboard asset")
