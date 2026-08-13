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
            "github_bus": {
                "reviewers": {
                    "Claude": ["ajoe734"],
                    "Codex": ["ajoe734"],
                }
            }
        }
        self.bus_state = {"tasks": {}}

    def test_apply_bus_command_review_approve_uses_reviewer_actor(self) -> None:
        status = {
            "tasks": [
                {
                    "id": "LIN-001",
                    "status": "review",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "candidate_sha": "abc123",
                    "candidate_branch": "feature/lin-001",
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
            extra_env={"REVIEWED_SHA": "abc123"},
        )

    def test_poll_pr_reviews_approved_uses_reviewer_approval(self) -> None:
        status = {
            "tasks": [
                {
                    "id": "LIN-001",
                    "status": "review",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "candidate_sha": "abc123",
                    "candidate_branch": "feature/lin-001",
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
                        "commit_id": "abc123",
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
            extra_env={"REVIEWED_SHA": "abc123"},
        )
        self.assertEqual(bus_state["processed_review_ids"], ["review:999"])
        write_activity_log.assert_called_once()

    def test_upsert_review_pr_create_uses_create_label_flags(self) -> None:
        config = {
            "github_bus": {
                "default_branch": "dev",
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
            "candidate_sha": "abc123",
            "candidate_branch": "feature/lin-001",
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
            mock.patch.object(github_bus, "candidate_pr_observation", return_value={"isDraft": True}),
        ):
            changed = github_bus.upsert_review_pr(config, bus_state, status, "ajoe734/pantheon", task)

        self.assertTrue(changed)
        self.assertEqual(run_gh.call_count, 2)
        args = run_gh.call_args_list[0].args[0]
        self.assertIn("--label", args)
        self.assertNotIn("--add-label", args)
        self.assertIn("--draft", args)
        self.assertEqual(run_gh.call_args_list[1].args[0][:3], ["pr", "ready", "12"])

    def test_upsert_review_pr_skips_support_only_task(self) -> None:
        task = {
            "id": "LIN-001-SIDECAR-REVIEW",
            "title": "Support review",
            "status": "review",
            "candidate_sha": "not_applicable",
        }
        with (
            mock.patch.object(github_bus, "run_gh") as run_gh,
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            changed = github_bus.upsert_review_pr(
                self.config,
                self.bus_state,
                {"tasks": [task]},
                "ajoe734/pantheon",
                task,
            )

        self.assertTrue(changed)
        run_gh.assert_not_called()
        self.assertEqual(self.bus_state["tasks"][task["id"]]["review_pr"]["state"], "skipped_no_candidate")

    def test_candidate_ci_status_requires_all_checks_to_complete(self) -> None:
        running, _ = github_bus.candidate_ci_status(
            {
                "state": "OPEN",
                "mergeStateStatus": "CLEAN",
                "statusCheckRollup": [{"status": "IN_PROGRESS", "conclusion": None}],
            }
        )
        failed, _ = github_bus.candidate_ci_status(
            {
                "state": "OPEN",
                "mergeStateStatus": "CLEAN",
                "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "FAILURE"}],
            }
        )
        successful, _ = github_bus.candidate_ci_status(
            {
                "state": "OPEN",
                "mergeStateStatus": "CLEAN",
                "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "SUCCESS"}],
            }
        )

        self.assertEqual(running, "running")
        self.assertEqual(failed, "failure")
        self.assertEqual(successful, "success")

    def test_reconcile_skips_an_unchanged_same_sha_observation(self) -> None:
        task = {
            "id": "LIN-001",
            "status": "integrating",
            "candidate_sha": "abc123",
            "candidate_branch": "feature/lin-001",
            "ci_sha": "abc123",
            "ci_status": "success",
            "pr_url": "https://github.com/ajoe734/pantheon/pull/12",
            "ci_run_url": "https://github.com/ajoe734/pantheon/actions/runs/99",
            "merge_sha": "",
        }
        bus_state = {"tasks": {"LIN-001": {"review_pr": {"number": 12}}}}
        observation = {
            "url": task["pr_url"],
            "state": "OPEN",
            "headRefName": task["candidate_branch"],
            "headRefOid": task["candidate_sha"],
            "mergeStateStatus": "CLEAN",
            "mergeCommit": None,
            "statusCheckRollup": [
                {
                    "status": "COMPLETED",
                    "conclusion": "SUCCESS",
                    "detailsUrl": task["ci_run_url"],
                }
            ],
        }
        with (
            mock.patch.object(github_bus, "candidate_pr_observation", return_value=observation),
            mock.patch.object(github_bus, "run_ai_status") as run_ai_status,
        ):
            changed = github_bus.reconcile_candidate_lifecycle(
                self.config, bus_state, {"tasks": [task]}, "ajoe734/pantheon"
            )

        self.assertFalse(changed)
        run_ai_status.assert_not_called()

    def test_auto_merge_is_requested_once_for_a_same_sha_candidate(self) -> None:
        task = {
            "id": "LIN-001",
            "status": "integrating",
            "candidate_sha": "abc123",
            "reviewed_sha": "abc123",
            "ci_sha": "abc123",
            "ci_status": "success",
        }
        config = {"github_bus": {"auto_merge": {"enabled": True}}}
        bus_state = {"tasks": {"LIN-001": {"review_pr": {"number": 12}}}}
        with (
            mock.patch.object(github_bus, "run_gh") as run_gh,
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            first = github_bus.request_candidate_auto_merge(
                config, bus_state, {"tasks": [task]}, "ajoe734/pantheon"
            )
            second = github_bus.request_candidate_auto_merge(
                config, bus_state, {"tasks": [task]}, "ajoe734/pantheon"
            )

        self.assertTrue(first)
        self.assertFalse(second)
        run_gh.assert_called_once_with(["pr", "merge", "12", "--repo", "ajoe734/pantheon", "--auto", "--squash"])


class GitHubBusProcessTests(unittest.TestCase):
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
