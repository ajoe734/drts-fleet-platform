#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import unittest
from unittest import mock

import github_bus
from github_command_parser import GitHubCommand


class GitHubBusCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = {
            "paths": {"status_file": "ai-status.json"},
            "github_bus": {
                "reviewers": {
                    "Claude": ["ajoe734"],
                    "Codex": ["ajoe734"],
                }
            }
        }
        self.bus_state = {"tasks": {}}

    def test_integration_check_state_maps_pending_failure_and_success(self) -> None:
        self.assertEqual(
            github_bus._integration_check_state({"state": "OPEN", "statusCheckRollup": []}),
            github_bus.IntegrationObservation("ci_pending", "pending"),
        )
        self.assertEqual(
            github_bus._integration_check_state({
                "state": "OPEN",
                "mergeStateStatus": "DIRTY",
                "statusCheckRollup": [],
            }),
            github_bus.IntegrationObservation("ci_failed", "merge_conflict"),
        )
        self.assertEqual(
            github_bus._integration_check_state({
                "state": "OPEN",
                "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "FAILURE", "detailsUrl": "run"}],
            }),
            github_bus.IntegrationObservation("ci_failed", "failure", ci_run_url="run"),
        )
        self.assertEqual(
            github_bus._integration_check_state({
                "state": "OPEN",
                "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "SUCCESS"}],
            }),
            github_bus.IntegrationObservation("pr_open", "success"),
        )

        merged = github_bus._integration_check_state({
            "state": "MERGED",
            "mergeCommit": {"oid": "deadbeef"},
        })
        self.assertEqual(merged.merge_commit, "deadbeef")
        self.assertIsNone(merged.ci_run_url)

    def test_reconcile_task_integrations_updates_existing_metadata(self) -> None:
        status = {"tasks": [{
            "id": "IAM-UI-DRV-001",
            "status": "blocked",
            "owner": "Codex",
            "pr_url": "https://github.com/ajoe734/pantheon/pull/1364",
            "integration_status": "ci_pending",
            "ci_status": "pending",
        }]}
        pr = {
            "state": "OPEN",
            "headRefName": "codex/iam-ui-drv-001-ci-fix",
            "headRefOid": "abc123456789",
            "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "SUCCESS"}],
        }
        with (
            mock.patch.object(github_bus, "gh_json", return_value=pr),
            mock.patch.object(github_bus, "run_ai_status") as run_ai_status,
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            changed = github_bus.reconcile_task_integrations(self.config, self.bus_state, status, "ajoe734/pantheon")
        self.assertTrue(changed)
        run_ai_status.assert_called_once()
        self.assertEqual(run_ai_status.call_args.kwargs["integration_env"]["INTEGRATION_STATUS"], "pr_open")
        self.assertEqual(self.bus_state["tasks"]["IAM-UI-DRV-001"]["integration_head_sha"], "abc123456789")

    def test_green_pr_preserves_owner_lifecycle_until_owner_handoff(self) -> None:
        status = {"tasks": [{
            "id": "IAM-UI-TEN-001",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Claude",
            "pr_url": "https://github.com/ajoe734/pantheon/pull/1373",
            "integration_status": "pr_open",
            "ci_status": "success",
        }]}
        pr = {
            "state": "OPEN",
            "headRefName": "codex/iam-ui-ten-001",
            "headRefOid": "abc123456789",
            "baseRefName": "dev",
            "mergeCommit": None,
            "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "SUCCESS"}],
            "url": status["tasks"][0]["pr_url"],
            "reviewDecision": "",
            "mergeStateStatus": "CLEAN",
        }
        bus_state = {"tasks": {"IAM-UI-TEN-001": {"integration_head_sha": pr["headRefOid"]}}}
        with (
            mock.patch.object(github_bus, "discover_task_prs", return_value={}),
            mock.patch.object(github_bus, "gh_json", return_value=pr),
            mock.patch.object(github_bus, "run_ai_status") as run_ai_status,
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            changed = github_bus.reconcile_task_integrations(
                self.config, bus_state, status, "ajoe734/pantheon"
            )

        self.assertTrue(changed)
        env = run_ai_status.call_args.kwargs["integration_env"]
        self.assertNotIn("RECONCILER_REVIEW_READY", env)
        self.assertEqual(env["EXECUTION_BRANCH"], "codex/iam-ui-ten-001")

    def test_replacement_pr_branch_is_reconciled_not_reported_as_ci_failure(self) -> None:
        status = {"tasks": [{
            "id": "IAM-ACC-003",
            "status": "in_progress",
            "owner": "Codex",
            "execution_branch": "codex/iam-acc-003-old",
            "pr_url": "https://github.com/ajoe734/pantheon/pull/1375",
            "integration_status": "ci_failed",
            "ci_status": "integration_invalid_branch",
        }]}
        pr = {
            "state": "OPEN",
            "headRefName": "codex/iam-acc-003-reintegration",
            "headRefOid": "abc123456789",
            "baseRefName": "dev",
            "mergeCommit": None,
            "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "SUCCESS"}],
            "url": status["tasks"][0]["pr_url"],
            "reviewDecision": "",
            "mergeStateStatus": "CLEAN",
        }
        with (
            mock.patch.object(github_bus, "discover_task_prs", return_value={}),
            mock.patch.object(github_bus, "gh_json", return_value=pr),
            mock.patch.object(github_bus, "run_ai_status") as run_ai_status,
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            github_bus.reconcile_task_integrations(self.config, self.bus_state, status, "ajoe734/pantheon")

        env = run_ai_status.call_args.kwargs["integration_env"]
        self.assertEqual(env["INTEGRATION_STATUS"], "pr_open")
        self.assertEqual(env["CI_STATUS"], "success")
        self.assertEqual(env["EXECUTION_BRANCH"], "codex/iam-acc-003-reintegration")

    def test_green_pr_does_not_override_product_blocker(self) -> None:
        status = {"tasks": [{
            "id": "IAM-UI-TEN-001",
            "status": "blocked",
            "owner": "Codex",
            "reviewer": "Claude",
            "waiting_for": "Missing product contract",
            "pr_url": "https://github.com/ajoe734/pantheon/pull/1373",
            "integration_status": "ci_pending",
            "ci_status": "pending",
        }]}
        pr = {
            "state": "OPEN",
            "headRefName": "codex/iam-ui-ten-001",
            "headRefOid": "abc123456789",
            "baseRefName": "dev",
            "mergeCommit": None,
            "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "SUCCESS"}],
            "url": status["tasks"][0]["pr_url"],
            "reviewDecision": "",
            "mergeStateStatus": "CLEAN",
        }
        with (
            mock.patch.object(github_bus, "discover_task_prs", return_value={}),
            mock.patch.object(github_bus, "gh_json", return_value=pr),
            mock.patch.object(github_bus, "run_ai_status") as run_ai_status,
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            github_bus.reconcile_task_integrations(
                self.config, {"tasks": {}}, status, "ajoe734/pantheon"
            )

        self.assertNotIn("RECONCILER_REVIEW_READY", run_ai_status.call_args.kwargs["integration_env"])

    def test_apply_bus_command_review_approve_uses_reviewer_actor(self) -> None:
        status = {
            "tasks": [
                {
                    "id": "LIN-001",
                    "status": "review",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "next": "ready for review",
                }
            ]
        }
        command = GitHubCommand(verb="approve", target="LIN-001", raw="/approve LIN-001")

        with (
            mock.patch.object(github_bus, "run_ai_status") as run_ai_status,
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            changed, reply = github_bus.apply_bus_command(
                self.config,
                self.bus_state,
                status,
                "ajoe734/pantheon",
                command,
                "ajoe734",
                issue_number=4,
            )

        self.assertTrue(changed)
        self.assertEqual(reply, "Applied `/approve` to `LIN-001`.")
        run_ai_status.assert_called_once_with(
            "approve",
            "LIN-001",
            "GitHub approval bus approved via issue #4 by @ajoe734.",
            actor="Claude",
        )

    def test_poll_pr_reviews_approved_uses_reviewer_approval(self) -> None:
        status = {
            "tasks": [
                {
                    "id": "LIN-001",
                    "status": "review",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "next": "ready for review",
                }
            ]
        }
        bus_state = {
            "processed_review_ids": [],
            "tasks": {
                "LIN-001": {
                    "review_pr": {"number": 12},
                }
            },
        }

        with (
            mock.patch.object(
                github_bus,
                "gh_json",
                return_value=[
                    {
                        "id": 999,
                        "state": "APPROVED",
                        "body": "looks good",
                        "user": {"login": "ajoe734"},
                    }
                ],
            ),
            mock.patch.object(github_bus, "run_ai_status") as run_ai_status,
            mock.patch.object(github_bus, "write_activity_log") as write_activity_log,
        ):
            changed = github_bus.poll_pr_reviews(self.config, bus_state, status, "ajoe734/pantheon")

        self.assertTrue(changed)
        run_ai_status.assert_called_once_with(
            "approve",
            "LIN-001",
            "GitHub PR approved via PR #12 by @ajoe734.",
            actor="Claude",
        )
        self.assertEqual(bus_state["processed_review_ids"], ["review:999"])
        write_activity_log.assert_called_once()

    def test_upsert_review_pr_create_uses_create_label_flags(self) -> None:
        config = {
            "github_bus": {
                "default_branch": "master",
                "auto_request_reviewers": True,
                "reviewers": {"Claude": ["ajoe734"]},
                "labels": {"review": ["pantheon-bus", "pantheon-review"]},
                "templates": {"review_pr": ".orchestrator/templates/github_review_pr.md"},
            }
        }
        bus_state = {"tasks": {}}
        status = {
            "agents": [{"name": "Codex", "branch": "feature/lin-001"}],
            "tasks": [],
        }
        task = {
            "id": "LIN-001",
            "title": "Lineage task",
            "summary_zh": "review me",
            "status": "review",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": [],
            "artifacts": ["foo.md"],
            "next": "ready for review",
        }

        with (
            mock.patch.object(github_bus, "branch_exists", return_value=True),
            mock.patch.object(github_bus, "branch_head_sha", return_value="abc123"),
            mock.patch.object(github_bus, "branch_has_diff", return_value=True),
            mock.patch.object(github_bus, "find_existing_pr", return_value=None),
            mock.patch.object(github_bus, "build_template_body", return_value="body\n"),
            mock.patch.object(
                github_bus,
                "run_gh",
                return_value=subprocess.CompletedProcess(
                    ["gh"],
                    0,
                    "https://github.com/ajoe734/pantheon/pull/12\n",
                    "",
                ),
            ) as run_gh,
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            changed = github_bus.upsert_review_pr(config, bus_state, status, "ajoe734/pantheon", task)

        self.assertTrue(changed)
        args = run_gh.call_args.args[0]
        self.assertIn("--label", args)
        self.assertNotIn("--add-label", args)


class GitHubBusProcessTests(unittest.TestCase):
    def test_reconcile_discovers_pr_when_task_url_is_missing(self) -> None:
        config = {
            "paths": {"status_file": "/tmp/ai-status.json"},
            "github_bus": {"auto_merge": {"enabled": False}},
        }
        status = {
            "tasks": [{
                "id": "S1F-ENT-002",
                "status": "blocked",
                "owner": "Codex",
            }]
        }
        bus_state = {"tasks": {}}
        pr = {
            "number": 1356,
            "url": "https://github.com/ajoe734/drts-fleet-platform/pull/1356",
            "state": "OPEN",
            "headRefName": "codex/s1f-ent-002",
            "headRefOid": "abc123",
            "baseRefName": "dev",
            "mergeCommit": None,
            "statusCheckRollup": [],
            "reviewDecision": "",
            "mergeStateStatus": "CLEAN",
        }
        with (
            mock.patch.object(github_bus, "discover_task_prs", return_value={"S1F-ENT-002": [pr]}),
            mock.patch.object(github_bus, "gh_json", return_value=pr),
            mock.patch.object(github_bus, "run_ai_status") as run_ai_status,
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            changed = github_bus.reconcile_task_integrations(config, bus_state, status, "ajoe734/drts-fleet-platform")

        self.assertTrue(changed)
        run_ai_status.assert_called_once()
        self.assertEqual(run_ai_status.call_args.kwargs["actor"], "Supervisor")
        self.assertTrue(run_ai_status.call_args.kwargs["reconciler"])
        self.assertEqual(run_ai_status.call_args.kwargs["integration_env"]["PR_URL"], pr["url"])

    def test_choose_task_pr_prefers_merged_evidence_over_old_failed_open_pr(self) -> None:
        merged = {
            "number": 1364,
            "url": "https://github.com/ajoe734/pantheon/pull/1364",
            "state": "MERGED",
            "mergedAt": "2026-08-10T23:45:04Z",
        }
        failed_open = {
            "number": 1360,
            "url": "https://github.com/ajoe734/pantheon/pull/1360",
            "state": "OPEN",
            "mergeStateStatus": "DIRTY",
        }
        number, url = github_bus.choose_task_pr(
            {"pr_url": failed_open["url"]}, 1360, [failed_open, merged]
        )
        self.assertEqual(number, 1364)
        self.assertEqual(url, merged["url"])

    def test_auto_merge_requests_protected_merge_only_after_ci_and_review(self) -> None:
        config = {"github_bus": {"auto_merge": {"enabled": True}}}
        state = {"tasks": {}}
        task = {"id": "IAM-BG-001", "status": "review_approved", "security_sensitive": True}
        pr = {
            "number": 7,
            "state": "OPEN",
            "baseRefName": "dev",
            "headRefOid": "abc123",
            "mergeStateStatus": "CLEAN",
            "reviewDecision": "APPROVED",
            "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "SUCCESS"}],
        }
        with (
            mock.patch.object(github_bus, "run_gh", return_value=subprocess.CompletedProcess(["gh"], 0, "", "")) as run_gh,
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            self.assertTrue(github_bus.maybe_request_auto_merge(config, state, task, pr, "ajoe734/drts-fleet-platform"))
        args = run_gh.call_args.args[0]
        self.assertIn("--auto", args)
        self.assertNotIn("--admin", args)

    def test_run_gh_process_kills_process_group_on_timeout(self) -> None:
        class FakePopen:
            def __init__(self) -> None:
                self.pid = 4321
                self.returncode = None
                self.wait_calls: list[float | None] = []

            def wait(self, timeout: float | None = None) -> int:
                self.wait_calls.append(timeout)
                raise subprocess.TimeoutExpired(cmd=["gh", "api"], timeout=timeout)

        fake_process = FakePopen()

        with (
            mock.patch.object(github_bus.subprocess, "Popen", return_value=fake_process),
            mock.patch.object(github_bus.os, "killpg") as killpg,
        ):
            with self.assertRaises(subprocess.TimeoutExpired):
                github_bus.run_gh_process(["api", "repos/ajoe734/pantheon/issues/4/comments"], timeout_seconds=1.0)

        killpg.assert_called_once_with(4321, github_bus.signal.SIGKILL)
        self.assertEqual(fake_process.wait_calls, [1.0, 0.2])


if __name__ == "__main__":
    unittest.main()
