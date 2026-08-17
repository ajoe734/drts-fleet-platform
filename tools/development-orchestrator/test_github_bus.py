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
            self.config,
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
            self.config,
            "approve",
            "LIN-001",
            "GitHub PR approved via PR #12 by @ajoe734.",
            actor="Claude",
            extra_env={"REVIEWED_SHA": "abc123"},
        )
        self.assertEqual(bus_state["processed_review_ids"], ["review:999"])
        write_activity_log.assert_called_once()

    def test_run_ai_status_uses_in_process_task_board_gateway(self) -> None:
        result = mock.Mock(ok=True, error="")
        with mock.patch.object(
            github_bus, "run_task_board_command", return_value=result
        ) as gateway:
            github_bus.run_ai_status(
                self.config,
                "reconcile-candidate",
                "LIN-001",
                "Reconciled",
                actor="Supervisor",
                extra_env={"CANDIDATE_HEAD_SHA": "abc123"},
            )

        gateway.assert_called_once_with(
            self.config,
            "reconcile-candidate",
            ["LIN-001", "Reconciled"],
            environ={"AI_NAME": "Supervisor", "CANDIDATE_HEAD_SHA": "abc123"},
        )

    def test_upsert_review_pr_creates_core_pr_before_optional_metadata(self) -> None:
        config = {
            "github_bus": {
                "default_branch": "dev",
                "auto_request_reviewers": True,
                "reviewers": {"Claude": ["ajoe734"]},
                "labels": {"review": ["pantheon-bus", "pantheon-review"]},
                "templates": {"review_pr": "tools/development-orchestrator/templates/github_review_pr.md"},
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
        self.assertEqual(run_gh.call_count, 3)
        args = run_gh.call_args_list[0].args[0]
        self.assertNotIn("--label", args)
        self.assertNotIn("--add-label", args)
        self.assertNotIn("--reviewer", args)
        self.assertIn("--draft", args)
        metadata_args = run_gh.call_args_list[1].args[0]
        self.assertIn("--add-label", metadata_args)
        self.assertIn("--add-reviewer", metadata_args)
        self.assertEqual(run_gh.call_args_list[2].args[0][:3], ["pr", "ready", "12"])

    def test_find_existing_pr_uses_exact_head_and_base(self) -> None:
        with mock.patch.object(github_bus, "gh_json", return_value=[]) as gh_json:
            found = github_bus.find_existing_pr(
                "ajoe734/pantheon", "feature/lin-001", "dev"
            )

        self.assertIsNone(found)
        args = gh_json.call_args.args[0]
        self.assertEqual(args[args.index("--head") + 1], "feature/lin-001")
        self.assertEqual(args[args.index("--base") + 1], "dev")
        self.assertNotIn("--search", args)

    def test_upsert_review_pr_adopts_existing_branch_pr_with_any_title(self) -> None:
        config = {
            "github_bus": {
                "default_branch": "dev",
                "auto_request_reviewers": False,
                "templates": {
                    "review_pr": "tools/development-orchestrator/templates/github_review_pr.md"
                },
            }
        }
        task = {
            "id": "LIN-001",
            "title": "Lineage task",
            "status": "integrating",
            "owner": "Codex",
            "reviewer": "Claude",
            "candidate_sha": "abc123",
            "candidate_branch": "feature/lin-001",
        }
        bus_state = {"tasks": {}}
        with (
            mock.patch.object(github_bus, "branch_has_diff", return_value=True),
            mock.patch.object(github_bus, "build_template_body", return_value="body\n"),
            mock.patch.object(
                github_bus,
                "find_existing_pr",
                return_value={
                    "number": 1393,
                    "url": "https://github.com/ajoe734/pantheon/pull/1393",
                    "title": "Release candidate",
                    "headRefOid": "abc123",
                },
            ) as find_existing,
            mock.patch.object(github_bus, "run_gh") as run_gh,
            mock.patch.object(
                github_bus, "candidate_pr_observation", return_value={"isDraft": False}
            ),
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            changed = github_bus.upsert_review_pr(
                config, bus_state, {"tasks": [task]}, "ajoe734/pantheon", task
            )

        self.assertTrue(changed)
        find_existing.assert_called_once_with(
            "ajoe734/pantheon", "feature/lin-001", "dev"
        )
        self.assertEqual(bus_state["tasks"]["LIN-001"]["review_pr"]["number"], 1393)
        self.assertEqual(run_gh.call_count, 1)

    def test_optional_pr_metadata_failure_does_not_fail_lifecycle(self) -> None:
        config = {
            "github_bus": {
                "auto_request_reviewers": False,
            }
        }
        with (
            mock.patch.object(
                github_bus, "run_gh", side_effect=github_bus.GitHubBusError("label missing")
            ),
            mock.patch.object(github_bus, "write_activity_log") as write_activity_log,
        ):
            github_bus.sync_optional_pr_metadata(
                config,
                "ajoe734/pantheon",
                {"id": "LIN-001"},
                12,
                ["pantheon-bus"],
            )

        write_activity_log.assert_called_once()

    def test_upsert_ops_issue_creates_core_issue_before_optional_labels(self) -> None:
        config = {
            "github_bus": {
                "labels": {"ops": ["pantheon-bus", "pantheon-blocked"]},
                "templates": {
                    "ops_issue": "tools/development-orchestrator/templates/github_ops_issue.md"
                },
            }
        }
        bus_state = {"tasks": {}}
        task = {
            "id": "LIN-001",
            "title": "Blocked lineage task",
            "status": "blocked",
            "owner": "Codex",
            "reviewer": "Claude",
        }

        def run_gh(args: list[str]) -> subprocess.CompletedProcess[str]:
            if args[:2] == ["issue", "create"]:
                return subprocess.CompletedProcess(
                    ["gh"],
                    0,
                    "https://github.com/ajoe734/pantheon/issues/44\n",
                    "",
                )
            raise github_bus.GitHubBusError("label missing")

        with (
            mock.patch.object(github_bus, "find_existing_issue", return_value=None),
            mock.patch.object(github_bus, "build_template_body", return_value="body\n"),
            mock.patch.object(github_bus, "run_gh", side_effect=run_gh) as run_gh_mock,
            mock.patch.object(github_bus, "write_activity_log") as write_activity_log,
        ):
            changed = github_bus.upsert_ops_issue(
                config,
                bus_state,
                "ajoe734/pantheon",
                task,
                "blocked",
                "details",
            )

        self.assertTrue(changed)
        self.assertEqual(run_gh_mock.call_count, 2)
        create_args = run_gh_mock.call_args_list[0].args[0]
        self.assertNotIn("--label", create_args)
        self.assertNotIn("--add-label", create_args)
        metadata_args = run_gh_mock.call_args_list[1].args[0]
        self.assertIn("--add-label", metadata_args)
        self.assertEqual(bus_state["tasks"]["LIN-001"]["ops_issue"]["number"], 44)
        self.assertEqual(
            [call.args[1]["type"] for call in write_activity_log.call_args_list],
            ["github_ops_issue_metadata_failed", "github_ops_issue_synced"],
        )

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

    def test_sync_outbound_opens_pr_after_fast_review_reaches_integrating(self) -> None:
        task = {
            "id": "LIN-001",
            "status": "integrating",
            "candidate_sha": "abc123",
            "candidate_branch": "feature/lin-001",
        }
        status = {"tasks": [task], "blockers": []}

        with mock.patch.object(github_bus, "upsert_review_pr", return_value=True) as upsert:
            changed = github_bus.sync_outbound(
                self.config,
                self.bus_state,
                status,
                {},
                "ajoe734/pantheon",
            )

        self.assertTrue(changed)
        upsert.assert_called_once_with(
            self.config,
            self.bus_state,
            status,
            "ajoe734/pantheon",
            task,
        )

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

    def test_candidate_pr_prefers_handoff_bound_pr_over_stale_cache(self) -> None:
        task = {
            "id": "LIN-001",
            "candidate_sha": "new-sha",
            "candidate_branch": "codex/lin-001-clean",
            "pr_url": "https://github.com/ajoe734/pantheon/pull/1419",
        }
        bus_state = {
            "tasks": {
                "LIN-001": {
                    "review_pr": {
                        "number": 1404,
                        "branch": "codex/lin-001",
                        "head_sha": "old-sha",
                    }
                }
            }
        }

        number = github_bus.candidate_pr_for_task(self.config, bus_state, "ajoe734/pantheon", task)

        self.assertEqual(number, 1419)
        self.assertEqual(bus_state["tasks"]["LIN-001"]["review_pr"]["head_sha"], "new-sha")

    def test_candidate_pr_discards_unbound_stale_cache_before_branch_lookup(self) -> None:
        task = {
            "id": "LIN-001",
            "candidate_sha": "new-sha",
            "candidate_branch": "codex/lin-001-clean",
        }
        bus_state = {
            "tasks": {
                "LIN-001": {
                    "review_pr": {
                        "number": 1404,
                        "branch": "codex/lin-001",
                        "head_sha": "old-sha",
                    }
                }
            }
        }
        found = {
            "number": 1419,
            "url": "https://github.com/ajoe734/pantheon/pull/1419",
            "headRefName": "codex/lin-001-clean",
            "headRefOid": "new-sha",
            "state": "OPEN",
        }

        with mock.patch.object(github_bus, "find_existing_pr", return_value=found) as find_existing:
            number = github_bus.candidate_pr_for_task(self.config, bus_state, "ajoe734/pantheon", task)

        self.assertEqual(number, 1419)
        find_existing.assert_called_once_with("ajoe734/pantheon", "codex/lin-001-clean", "main")
        self.assertEqual(bus_state["tasks"]["LIN-001"]["review_pr"]["head_sha"], "new-sha")

    def test_upsert_review_pr_does_not_edit_stale_candidate_pr(self) -> None:
        config = {
            "github_bus": {
                "default_branch": "dev",
                "auto_request_reviewers": False,
                "templates": {
                    "review_pr": "tools/development-orchestrator/templates/github_review_pr.md"
                },
            }
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
            "candidate_sha": "new-sha",
            "candidate_branch": "codex/lin-001-clean",
        }
        bus_state = {
            "tasks": {
                "LIN-001": {
                    "review_pr": {
                        "number": 1404,
                        "branch": "codex/lin-001",
                        "head_sha": "old-sha",
                    }
                }
            }
        }
        found = {
            "number": 1419,
            "url": "https://github.com/ajoe734/pantheon/pull/1419",
            "headRefName": "codex/lin-001-clean",
            "headRefOid": "new-sha",
        }

        with (
            mock.patch.object(github_bus, "branch_has_diff", return_value=True),
            mock.patch.object(github_bus, "build_template_body", return_value="body\n"),
            mock.patch.object(github_bus, "find_existing_pr", return_value=found),
            mock.patch.object(github_bus, "run_gh") as run_gh,
            mock.patch.object(github_bus, "candidate_pr_observation", return_value={"isDraft": False}),
            mock.patch.object(github_bus, "write_activity_log"),
        ):
            changed = github_bus.upsert_review_pr(
                config, bus_state, {"tasks": [task]}, "ajoe734/pantheon", task
            )

        self.assertTrue(changed)
        self.assertTrue(all("1404" not in call.args[0] for call in run_gh.call_args_list))
        self.assertEqual(bus_state["tasks"]["LIN-001"]["review_pr"]["number"], 1419)

    def test_auto_merge_is_requested_once_for_a_same_sha_candidate(self) -> None:
        task = {
            "id": "LIN-001",
            "status": "integrating",
            "candidate_sha": "abc123",
            "candidate_branch": "codex/lin-001",
            "reviewed_sha": "abc123",
            "ci_sha": "abc123",
            "ci_status": "success",
        }
        config = {"github_bus": {"auto_merge": {"enabled": True}}}
        bus_state = {
            "tasks": {
                "LIN-001": {
                    "review_pr": {
                        "number": 12,
                        "branch": "codex/lin-001",
                        "head_sha": "abc123",
                    }
                }
            }
        }
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


class GitHubBusLabelTests(unittest.TestCase):
    REPO = "ajoe734/pantheon"
    CONFIG = {"github_bus": {"auto_request_reviewers": False}}

    def setUp(self) -> None:
        github_bus._LABELS_UNAVAILABLE.clear()

    def test_happy_path_adds_no_extra_gh_call(self) -> None:
        """The label repair must not cost anything when the label exists."""
        with (
            mock.patch.object(github_bus, "run_gh") as run_gh,
            mock.patch.object(github_bus, "write_activity_log") as write_activity_log,
        ):
            github_bus.sync_optional_pr_metadata(
                self.CONFIG, self.REPO, {"id": "LIN-001"}, 12, ["pantheon-bus"]
            )

        run_gh.assert_called_once()
        self.assertIn("--add-label", run_gh.call_args.args[0])
        write_activity_log.assert_not_called()

    def test_missing_label_is_created_then_the_edit_is_retried(self) -> None:
        calls: list[list[str]] = []

        def run_gh(args: list[str]) -> None:
            calls.append(args)
            if args[:2] == ["pr", "edit"] and len(calls) == 1:
                raise github_bus.GitHubBusError("'pantheon-bus' not found")

        with (
            mock.patch.object(github_bus, "run_gh", side_effect=run_gh),
            mock.patch.object(github_bus, "write_activity_log") as write_activity_log,
        ):
            github_bus.sync_optional_pr_metadata(
                self.CONFIG, self.REPO, {"id": "LIN-001"}, 12, ["pantheon-bus"]
            )

        self.assertEqual(
            calls[1], ["label", "create", "pantheon-bus", "--repo", self.REPO]
        )
        self.assertEqual(calls[2][:2], ["pr", "edit"])
        logged = [call.args[1]["type"] for call in write_activity_log.call_args_list]
        self.assertEqual(logged, ["github_bus_label_created"])

    def test_uncreatable_label_is_reported_once_then_dropped(self) -> None:
        """The regression: one bad label, one failure event, every cycle, forever."""

        def run_gh(args: list[str]) -> None:
            if args[:2] == ["label", "create"]:
                raise github_bus.GitHubBusError("permission denied")
            raise github_bus.GitHubBusError("'pantheon-bus' not found")

        with (
            mock.patch.object(github_bus, "run_gh", side_effect=run_gh) as run_gh_mock,
            mock.patch.object(github_bus, "write_activity_log") as write_activity_log,
        ):
            for _ in range(3):
                github_bus.sync_optional_pr_metadata(
                    self.CONFIG, self.REPO, {"id": "LIN-001"}, 12, ["pantheon-bus"]
                )

        logged = [call.args[1]["type"] for call in write_activity_log.call_args_list]
        # First cycle: the edit fails, creation fails, both are recorded. Cycles
        # two and three send no label at all, so `pr edit` has nothing to do and
        # is never called -- no repeat of either event.
        self.assertEqual(
            logged, ["github_bus_label_unavailable", "github_review_pr_metadata_failed"]
        )
        self.assertEqual(
            [args.args[0][:2] for args in run_gh_mock.call_args_list],
            [["pr", "edit"], ["label", "create"]],
        )

    def test_unrelated_failure_is_not_treated_as_a_missing_label(self) -> None:
        with (
            mock.patch.object(
                github_bus,
                "run_gh",
                side_effect=github_bus.GitHubBusError("HTTP 502 upstream"),
            ) as run_gh,
            mock.patch.object(github_bus, "write_activity_log") as write_activity_log,
        ):
            github_bus.sync_optional_pr_metadata(
                self.CONFIG, self.REPO, {"id": "LIN-001"}, 12, ["pantheon-bus"]
            )

        run_gh.assert_called_once()
        logged = [call.args[1]["type"] for call in write_activity_log.call_args_list]
        self.assertEqual(logged, ["github_review_pr_metadata_failed"])
        self.assertEqual(github_bus._LABELS_UNAVAILABLE, {})

    def test_repair_ignores_a_label_the_caller_did_not_send(self) -> None:
        repaired = github_bus.repair_missing_label(
            self.CONFIG,
            self.REPO,
            ["pantheon-bus"],
            github_bus.GitHubBusError("'some-other-label' not found"),
        )
        self.assertFalse(repaired)


if __name__ == "__main__":
    unittest.main()
