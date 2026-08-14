from __future__ import annotations

import unittest

from control_plane.domain.dispatch_policy import (
    DispatchReason,
    ReadyDispatchPolicy,
    resolve_dispatch_target,
)


class CandidateDispatchPolicyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.policy = ReadyDispatchPolicy()

    def task(self, status: str, **extra: object) -> dict[str, object]:
        return {
            "id": "TASK-001",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": status,
            "depends_on": [],
            **extra,
        }

    def test_owner_receives_working_and_ready_tasks(self) -> None:
        for status, reason in (("todo", DispatchReason.OWNED_READY), ("backlog", DispatchReason.OWNED_READY), ("in_progress", DispatchReason.OWNED_IN_PROGRESS)):
            with self.subTest(status=status):
                task = self.task(status)
                decision = resolve_dispatch_target(task, {task["id"]: task}, self.policy)
                self.assertIsNotNone(decision)
                assert decision is not None
                self.assertEqual(decision.target_agent, "Codex")
                self.assertEqual(decision.reason, reason)

    def test_reviewer_receives_only_locked_review(self) -> None:
        task = self.task("review", candidate_sha="abc123")
        decision = resolve_dispatch_target(task, {task["id"]: task}, self.policy)
        self.assertIsNotNone(decision)
        assert decision is not None
        self.assertEqual(decision.target_agent, "Claude")
        self.assertEqual(decision.reason, DispatchReason.REVIEW_READY)

    def test_acceptance_dispatches_to_owner_without_reopening_candidate_work(self) -> None:
        task = self.task("acceptance", merge_sha="abc123")
        decision = resolve_dispatch_target(task, {task["id"]: task}, self.policy)
        self.assertIsNotNone(decision)
        assert decision is not None
        self.assertEqual(decision.target_agent, "Codex")
        self.assertEqual(decision.reason, DispatchReason.ACCEPTANCE_READY)

    def test_integrating_done_and_blocked_never_dispatch_workers(self) -> None:
        for status in ("integrating", "done", "blocked"):
            with self.subTest(status=status):
                task = self.task(status)
                self.assertIsNone(resolve_dispatch_target(task, {task["id"]: task}, self.policy))

    def test_unsatisfied_dependency_blocks_owner_dispatch(self) -> None:
        dependency = self.task("in_progress")
        dependency["id"] = "DEP-001"
        task = self.task("todo", depends_on=["DEP-001"])
        self.assertIsNone(resolve_dispatch_target(task, {"TASK-001": task, "DEP-001": dependency}, self.policy))


if __name__ == "__main__":
    unittest.main()
