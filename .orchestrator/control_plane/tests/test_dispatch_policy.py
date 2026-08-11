from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from control_plane.domain.dispatch_policy import (
    DispatchReason,
    has_external_integration_in_flight,
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

    def test_ci_failure_overrides_a_stale_in_flight_integration_status(self) -> None:
        task = {
            "id": "TASK-1",
            "status": "in_progress",
            "owner": "Codex",
            "depends_on": [],
            "integration_status": "ci_pending",
            "pr_url": "https://github.com/example/repo/pull/1",
            "ci_status": "failure",
        }

        decision = resolve_dispatch_target(task, {"TASK-1": task}, self.policy)

        self.assertIsNotNone(decision)
        self.assertEqual(decision.reason, DispatchReason.OWNED_IN_PROGRESS)

    def test_blocked_ci_failure_is_dispatchable_but_other_blockers_are_not(self) -> None:
        repair = {
            "id": "TASK-1",
            "status": "blocked",
            "owner": "Codex",
            "depends_on": [],
            "integration_status": "ci_failed",
            "ci_status": "CI failed on run 123",
        }
        decision = resolve_dispatch_target(repair, {"TASK-1": repair}, self.policy)
        self.assertIsNotNone(decision)
        self.assertEqual(decision.reason, DispatchReason.OWNED_IN_PROGRESS)

        product_blocker = dict(repair, ci_status="success")
        self.assertIsNone(
            resolve_dispatch_target(product_blocker, {"TASK-1": product_blocker}, self.policy)
        )

    def test_event_is_deterministic_and_contains_canonical_metadata(self) -> None:
        decision = resolve_dispatch_target(self.tasks["TASK-1"], self.tasks, self.policy)

        first = build_dispatch_event(self.tasks["TASK-1"], decision, self.tasks, source="test")
        second = build_dispatch_event(self.tasks["TASK-1"], decision, self.tasks, source="test")

        self.assertEqual(first, second)
        self.assertEqual(first["target_agent"], "Codex")
        self.assertEqual(first["metadata"], {"source": "test", "mode": "execution"})
        self.assertEqual(first["task"]["execution_branch"], "codex/task-1-existing-pr")

    def test_event_signature_ignores_observation_timestamp(self) -> None:
        decision = resolve_dispatch_target(self.tasks["TASK-1"], self.tasks, self.policy)
        first = build_dispatch_event(self.tasks["TASK-1"], decision, self.tasks)
        changed = {**self.tasks["TASK-1"].raw, "last_update": "2026-08-11T08:00:00Z"}
        second = build_dispatch_event(changed, decision, self.tasks)

        self.assertEqual(first["key"], second["key"])

    def test_dependency_requires_verified_merge_evidence_when_provided(self) -> None:
        tasks = task_index(
            [
                {
                    "id": "DEP-1",
                    "status": "done",
                    "task_class": "implementation",
                    "integration_status": "merged_to_dev",
                    "merge_commit": "abc123",
                },
                {"id": "TASK-1", "status": "todo", "owner": "Codex", "depends_on": ["DEP-1"]},
            ]
        )

        self.assertIsNone(resolve_dispatch_target(tasks["TASK-1"], tasks, self.policy, {"DEP-1": False}))
        self.assertIsNotNone(resolve_dispatch_target(tasks["TASK-1"], tasks, self.policy, {"DEP-1": True}))


    def test_runtime_event_omits_external_envelope_fields(self) -> None:
        decision = resolve_dispatch_target(self.tasks["TASK-1"], self.tasks, self.policy)

        event = build_dispatch_event(self.tasks["TASK-1"], decision, self.tasks)

        self.assertNotIn("event_id", event)
        self.assertNotIn("metadata", event)





class IntegrationSelfLockTests(unittest.TestCase):
    """An in-flight integration must not hold a task forever.

    Nothing in the supervisor refreshes `integration_status` or `ci_status` —
    only a worker writes them, and this policy is what decides whether a worker
    is dispatched at all. Two production tasks were held this way, and every
    remaining task in the plan depended on one of them.
    """

    POLICY = ReadyDispatchPolicy(
        owned_statuses=frozenset({"in_progress", "todo", "backlog"}),
        integration_in_flight_max_age_seconds=6 * 60 * 60,
    )

    def _task(self, **overrides):
        task = {
            "id": "T-1",
            "owner": "Codex",
            "reviewer": "Gemini",
            "status": "in_progress",
            "depends_on": [],
            "pr_url": "https://github.com/o/r/pull/1",
        }
        task.update(overrides)
        return task

    def test_a_failure_written_as_a_sentence_is_still_a_failure(self) -> None:
        # What a worker actually recorded. The old exact-token comparison did
        # not match it, so the task waited on a run that had already failed.
        task = self._task(
            integration_status="pr_open",
            ci_status="CI (integration trunk) failed on run 30918215661",
            integration_recorded_at="2026-08-04T18:30:32Z",
        )

        self.assertFalse(has_external_integration_in_flight(task))
        self.assertIsNotNone(resolve_dispatch_target(task, {"T-1": task}, self.POLICY))

    def test_a_stale_in_flight_record_stops_being_believed(self) -> None:
        task = self._task(
            integration_status="ci_pending",
            ci_status="in_progress",
            integration_recorded_at="2026-08-02T12:09:29Z",
        )
        now = datetime(2026, 8, 7, 0, 0, tzinfo=timezone.utc)

        self.assertFalse(
            has_external_integration_in_flight(
                task, max_age_seconds=6 * 60 * 60, now=now
            )
        )

    def test_a_fresh_in_flight_record_still_holds_the_task(self) -> None:
        # The rule this function exists for: do not start a second attempt while
        # the first one is genuinely running.
        #
        # `resolve_dispatch_target` takes no clock, so it reads the real one.
        # A hardcoded `integration_recorded_at` therefore made this test pass or
        # fail depending on the hour it ran in: it was written and run at 00:30
        # UTC against a 00:00 stamp, and failed in CI at 11:29 UTC because the
        # same stamp was by then eleven hours old. Stamp it relative to now.
        recorded_at = datetime.now(timezone.utc) - timedelta(minutes=30)
        task = self._task(
            integration_status="ci_pending",
            ci_status="in_progress",
            integration_recorded_at=recorded_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        )

        self.assertTrue(
            has_external_integration_in_flight(task, max_age_seconds=6 * 60 * 60)
        )
        self.assertIsNone(resolve_dispatch_target(task, {"T-1": task}, self.POLICY))

    def test_last_update_is_not_what_ages_the_record(self) -> None:
        # `last_update` is refreshed every tick, so a task frozen since 2 August
        # still carries a current one. Ageing against it would never fire.
        task = self._task(
            integration_status="ci_pending",
            ci_status="in_progress",
            integration_recorded_at="2026-08-02T12:09:29Z",
            last_update="2026-08-07T00:45:24Z",
        )
        now = datetime(2026, 8, 7, 0, 46, tzinfo=timezone.utc)

        self.assertFalse(
            has_external_integration_in_flight(
                task, max_age_seconds=6 * 60 * 60, now=now
            )
        )

    def test_a_record_with_no_timestamp_keeps_its_old_behaviour(self) -> None:
        # Ageing needs something to measure. Every task carrying an in-flight
        # integration status in production had `integration_recorded_at` set,
        # so a missing stamp is not a case worth inventing a verdict for — the
        # original rule stands.
        task = self._task(integration_status="ci_pending", ci_status="in_progress")

        self.assertTrue(has_external_integration_in_flight(task))


if __name__ == "__main__":
    unittest.main()
