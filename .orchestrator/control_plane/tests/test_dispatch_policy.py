from __future__ import annotations

import unittest

from control_plane.domain.dispatch_policy import (
    DispatchReason,
    ReadyDispatchPolicy,
    build_dispatch_event,
    dependency_signature,
    resolve_dispatch_target,
    task_index,
)


class DispatchPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.policy = ReadyDispatchPolicy()
        self.tasks = task_index(
            [
                {"id": "DEP-1", "status": "done"},
                {
                    "id": "TASK-1",
                    "status": "backlog",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "depends_on": ["DEP-1", "ARCHIVED-1"],
                    "artifacts": ["apps/api"],
                    "execution_branch": "codex/task-1-existing-pr",
                    "next": "implement",
                    "last_update": "2026-07-18T00:00:00Z",
                },
            ]
        )

    def test_resolves_ready_owner_and_treats_missing_dependency_as_archived(self) -> None:
        decision = resolve_dispatch_target(self.tasks["TASK-1"], self.tasks, self.policy)

        self.assertIsNotNone(decision)
        self.assertEqual(decision.target_agent, "Codex")
        self.assertEqual(decision.reason, DispatchReason.OWNED_READY)
        self.assertEqual(
            dependency_signature(self.tasks["TASK-1"], self.tasks),
            "DEP-1:done|ARCHIVED-1:archived",
        )

    def test_blocks_when_known_dependency_is_not_done(self) -> None:
        tasks = task_index(
            [
                {"id": "DEP-1", "status": "in_progress"},
                {"id": "TASK-1", "status": "todo", "owner": "Codex", "depends_on": ["DEP-1"]},
            ]
        )

        self.assertIsNone(resolve_dispatch_target(tasks["TASK-1"], tasks, self.policy))

    def test_review_and_finalize_do_not_wait_on_dependencies(self) -> None:
        for status, expected_agent, expected_reason in (
            ("review", "Claude", DispatchReason.REVIEW_READY),
            ("review_approved", "Codex", DispatchReason.OWNED_FINALIZE),
        ):
            task = {
                "id": "TASK-1",
                "status": status,
                "owner": "Codex",
                "reviewer": "Claude",
                "depends_on": ["BLOCKED-DEP"],
            }
            tasks = task_index([{"id": "BLOCKED-DEP", "status": "todo"}, task])

            decision = resolve_dispatch_target(tasks["TASK-1"], tasks, self.policy)

            self.assertEqual(decision.target_agent, expected_agent)
            self.assertEqual(decision.reason, expected_reason)

    def test_holds_in_progress_task_while_external_ci_is_pending(self) -> None:
        task = {
            "id": "TASK-1",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": [],
            "integration_status": "ci_pending",
            "pr_url": "https://github.com/example/repo/pull/1",
            "ci_status": "pending",
        }

        self.assertIsNone(resolve_dispatch_target(task, {"TASK-1": task}, self.policy))

    def test_allows_in_progress_task_back_to_owner_after_ci_failure(self) -> None:
        task = {
            "id": "TASK-1",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": [],
            "integration_status": "ci_failed",
            "pr_url": "https://github.com/example/repo/pull/1",
            "ci_status": "failure",
        }

        decision = resolve_dispatch_target(task, {"TASK-1": task}, self.policy)

        self.assertIsNotNone(decision)
        self.assertEqual(decision.reason, DispatchReason.OWNED_IN_PROGRESS)

    def test_event_is_deterministic_and_contains_canonical_metadata(self) -> None:
        decision = resolve_dispatch_target(self.tasks["TASK-1"], self.tasks, self.policy)

        first = build_dispatch_event(self.tasks["TASK-1"], decision, self.tasks, source="test")
        second = build_dispatch_event(self.tasks["TASK-1"], decision, self.tasks, source="test")

        self.assertEqual(first, second)
        self.assertEqual(first["target_agent"], "Codex")
        self.assertEqual(first["metadata"], {"source": "test", "mode": "execution"})
        self.assertEqual(first["task"]["execution_branch"], "codex/task-1-existing-pr")


    def test_runtime_event_omits_external_envelope_fields(self) -> None:
        decision = resolve_dispatch_target(self.tasks["TASK-1"], self.tasks, self.policy)

        event = build_dispatch_event(self.tasks["TASK-1"], decision, self.tasks)

        self.assertNotIn("event_id", event)
        self.assertNotIn("metadata", event)


if __name__ == "__main__":
    unittest.main()
