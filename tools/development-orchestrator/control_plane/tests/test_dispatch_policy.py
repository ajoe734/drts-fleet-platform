from __future__ import annotations

import unittest
from unittest import mock

from control_plane.domain import dispatch_policy
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

    def test_requested_original_acceptance_routes_current_reviewer(self) -> None:
        from control_plane.tests.acceptance_review_routing.fixtures import requested_task

        task = requested_task()
        decision = resolve_dispatch_target(task, {task["id"]: task}, self.policy)
        self.assertIsNotNone(decision)
        self.assertEqual(decision.task_id, task["id"])
        self.assertEqual(decision.target_agent, "Codex")
        self.assertEqual(decision.reason, DispatchReason.REVIEW_READY)

    def test_stale_or_malformed_acceptance_requests_fail_closed(self) -> None:
        from control_plane.tests.acceptance_review_routing.fixtures import requested_task

        changes = [{key: "drifted"} for key in (
            "candidate_sha", "candidate_generation", "reviewed_sha", "merge_sha", "reviewer", "task_id"
        )] + [{key: ""} for key in ("request_id", "requested_at", "reason", "evidence_ref")] + [{"requested_by": "Gemini"}]
        for change in changes:
            with self.subTest(change=change):
                task = requested_task()
                task["acceptance_review_request"].update(change)
                self.assertIsNone(resolve_dispatch_target(task, {task["id"]: task}, self.policy))
        for malformed in ("pending", [], {}, {"state": "bogus"}):
            task = requested_task()
            task["acceptance_review_request"] = malformed
            self.assertIsNone(resolve_dispatch_target(task, {task["id"]: task}, self.policy))

    def test_requested_acceptance_preserves_dependency_external_and_ci_floors(self) -> None:
        from control_plane.tests.acceptance_review_routing.fixtures import requested_task

        for changes in ({"depends_on": ["DEP"]}, {"external_gate": True}, {"ci_status": "failure"},
                        {"ci_sha": "a" * 40}, {"mutates_canonical": False}):
            task = {**requested_task(), **changes}
            self.assertIsNone(resolve_dispatch_target(task, {task["id"]: task, "DEP": {"id": "DEP", "status": "blocked"}}, self.policy))

    def test_request_and_resolution_change_signatures_without_progress_noise(self) -> None:
        from control_plane.tests.acceptance_review_routing.fixtures import acceptance_task, requested_task
        from control_plane.domain.dispatch_policy import material_task_fingerprint, ready_dispatch_signature

        task = acceptance_task()
        task_map = {task["id"]: task}
        original_fingerprint = material_task_fingerprint(task, task_map)
        original_signature = ready_dispatch_signature(task, DispatchReason.ACCEPTANCE_READY, task_map)
        task["acceptance_review_request"] = requested_task()["acceptance_review_request"]
        requested_fingerprint = material_task_fingerprint(task, task_map)
        self.assertNotEqual(requested_fingerprint, original_fingerprint)
        self.assertNotEqual(ready_dispatch_signature(task, DispatchReason.ACCEPTANCE_READY, task_map), original_signature)
        task["next"] = "Progress only"
        task["last_update"] = "Later timestamp"
        self.assertEqual(material_task_fingerprint(task, task_map), requested_fingerprint)
        task["acceptance_review_request"]["state"] = "declined"
        self.assertNotEqual(material_task_fingerprint(task, task_map), requested_fingerprint)

    def test_external_acceptance_waits_until_existing_gate_is_released(self) -> None:
        task = self.task("acceptance", merge_sha="abc123", external_gate=True)
        for update in ("first verification", "same missing phone resources"):
            task["last_update"] = update
            self.assertIsNone(resolve_dispatch_target(task, {task["id"]: task}, self.policy))
        task["external_gate"] = False
        decision = resolve_dispatch_target(task, {task["id"]: task}, self.policy)
        self.assertIsNotNone(decision)
        self.assertEqual(decision.reason, DispatchReason.ACCEPTANCE_READY)

    def test_external_acceptance_gate_does_not_block_preparation_work(self) -> None:
        task = self.task("in_progress", external_gate=True)
        decision = resolve_dispatch_target(task, {task["id"]: task}, self.policy)
        self.assertIsNotNone(decision)
        self.assertEqual(decision.reason, DispatchReason.OWNED_IN_PROGRESS)

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


class DependencyLookupCostTests(unittest.TestCase):
    """Dependency checks must not scale with the size of the board.

    `dependencies_satisfied` converted the entire task map to TaskRecords on
    every call, and the dispatcher asks once per (task, agent) pair. On a real
    board -- 125 tasks, 7 lanes -- that was ~110,000 object constructions per
    tick, for a board where every task was already `done`. It measured 21% of
    a core, continuously, and profiling put 36.6M generator evaluations and
    46M str.strip() calls underneath it.
    """

    def _board(self, size: int) -> dict:
        return {
            f"T-{index}": {"id": f"T-{index}", "status": "done"}
            for index in range(size)
        }

    def _conversions(self, board: dict, task: dict) -> int:
        calls = {"n": 0}
        real = dispatch_policy._task

        def counting(value):
            calls["n"] += 1
            return real(value)

        with mock.patch.object(dispatch_policy, "_task", counting):
            dispatch_policy.dependencies_satisfied(task, board, frozenset({"done"}))
        return calls["n"]

    def test_cost_does_not_grow_with_the_board(self) -> None:
        task = {"id": "X", "status": "todo", "depends_on": ["T-1"]}

        small = self._conversions(self._board(10), task)
        large = self._conversions(self._board(500), task)

        self.assertEqual(
            small,
            large,
            f"dependency check scaled with board size ({small} -> {large} conversions); "
            "it is resolving the whole map instead of the dependencies it names",
        )

    def test_a_task_without_dependencies_touches_nothing(self) -> None:
        task = {"id": "X", "status": "todo"}

        self.assertEqual(self._conversions(self._board(500), task), 1)

    def test_signature_also_resolves_only_named_dependencies(self) -> None:
        board = self._board(500)
        task = {"id": "X", "status": "todo", "depends_on": ["T-1", "GONE"]}
        calls = {"n": 0}
        real = dispatch_policy._task

        def counting(value):
            calls["n"] += 1
            return real(value)

        with mock.patch.object(dispatch_policy, "_task", counting):
            signature = dispatch_policy.dependency_signature(task, board)

        self.assertEqual(signature, "T-1:done|GONE:archived")
        self.assertLessEqual(calls["n"], 3, "signature converted more than it named")
