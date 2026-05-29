"""Tests for the paused-lane-owner reassignment-triage trigger.

The chair-review-reason logic previously only routed to
reassignment_triage when a task had a `repeated_failure_records` streak.
A paused-lane owner produces no failures (the task never gets
dispatched), so an entire backlog could stall with the chair stuck on
operational_review or provider_health_triage instead of actually
reassigning ownership.

See feedback_supervisor_ignores_explicit_owner for the related upstream
complaint and OPS-DISPATCH-COOLDOWN-001 for the cooldown that makes
availability_first claim shuffles safe to re-enable.
"""

from __future__ import annotations

import unittest

import supervisor


class PausedOwnerReassignmentTriggerTests(unittest.TestCase):
    def _status(self, *tasks: dict) -> dict:
        return {"tasks": list(tasks)}

    def _approval(self) -> dict:
        return {"pending": [], "history": []}

    def test_candidates_match_paused_owner_in_dispatch_phase(self) -> None:
        state = {"provider_pauses": {"gemini": {"kind": "quota"}}}
        status = self._status(
            {"id": "T1", "status": "backlog", "owner": "Gemini", "reviewer": "Codex"},
            {"id": "T2", "status": "todo", "owner": "Gemini", "reviewer": "Codex"},
            {"id": "T3", "status": "in_progress", "owner": "Gemini", "reviewer": "Codex"},
        )
        cands = supervisor.paused_owner_reassignment_candidates(
            state, status, config={"agents": {}}, limit=10
        )
        self.assertEqual({c["task_id"] for c in cands}, {"T1", "T2", "T3"})

    def test_candidates_match_paused_reviewer_in_review_phase(self) -> None:
        state = {"provider_pauses": {"gemini2": {"kind": "quota"}}}
        status = self._status(
            {"id": "R1", "status": "review", "owner": "Codex", "reviewer": "Gemini2"},
            # In-progress with paused REVIEWER but live owner doesn't count
            # — the owner can still progress the task to review.
            {"id": "R2", "status": "in_progress", "owner": "Codex", "reviewer": "Gemini2"},
        )
        cands = supervisor.paused_owner_reassignment_candidates(
            state, status, config={"agents": {}}, limit=10
        )
        self.assertEqual({c["task_id"] for c in cands}, {"R1"})

    def test_done_and_review_approved_are_skipped(self) -> None:
        state = {"provider_pauses": {"gemini": {"kind": "quota"}}}
        status = self._status(
            {"id": "D1", "status": "done", "owner": "Gemini"},
            {"id": "D2", "status": "review_approved", "owner": "Gemini"},
        )
        cands = supervisor.paused_owner_reassignment_candidates(
            state, status, config={"agents": {}}, limit=10
        )
        self.assertEqual(cands, [])

    def test_no_pauses_returns_empty(self) -> None:
        state = {"provider_pauses": {}}
        status = self._status(
            {"id": "X1", "status": "backlog", "owner": "Gemini"},
        )
        cands = supervisor.paused_owner_reassignment_candidates(
            state, status, config={"agents": {}}, limit=10
        )
        self.assertEqual(cands, [])

    def test_limit_truncates_candidate_pool(self) -> None:
        state = {"provider_pauses": {"gemini": {"kind": "quota"}}}
        status = self._status(*(
            {"id": f"T{i}", "status": "backlog", "owner": "Gemini"} for i in range(20)
        ))
        cands = supervisor.paused_owner_reassignment_candidates(
            state, status, config={"agents": {}}, limit=5
        )
        self.assertEqual(len(cands), 5)

    def test_chair_review_reason_routes_to_reassignment_triage(self) -> None:
        state = {"provider_pauses": {"gemini": {"kind": "quota"}}}
        status = self._status(
            {"id": "T1", "status": "backlog", "owner": "Gemini", "reviewer": "Codex"},
        )
        reason = supervisor.chair_review_reason(
            state, self._approval(), status=status, config={"agents": {}}
        )
        self.assertEqual(reason, "reassignment_triage")

    def test_chair_review_reason_falls_back_when_no_paused_owner(self) -> None:
        # Pause exists but no task's owner is on that paused lane —
        # should NOT trigger reassignment_triage on this signal.
        state = {"provider_pauses": {"gemini": {"kind": "quota"}}}
        status = self._status(
            {"id": "T1", "status": "backlog", "owner": "Codex"},
        )
        reason = supervisor.chair_review_reason(
            state, self._approval(), status=status, config={"agents": {}}
        )
        # provider_health_triage is the appropriate fallback because the
        # lane IS paused, just no tasks are stranded on it.
        self.assertEqual(reason, "provider_health_triage")

    def test_chair_review_reason_failure_streak_still_takes_priority(self) -> None:
        # If there's a failure streak AND a paused owner, the failure
        # streak path still wins — both end in reassignment_triage anyway
        # but failure_streaks is more urgent and should be authoritative.
        state = {
            "provider_pauses": {"gemini": {"kind": "quota"}},
            "failure_streaks": {
                "Codex/T-FAIL": {"role": "owner", "kind": "terminal", "count": 3},
            },
        }
        status = self._status(
            {"id": "T-OK", "status": "backlog", "owner": "Gemini"},
            {"id": "T-FAIL", "status": "in_progress", "owner": "Codex"},
        )
        reason = supervisor.chair_review_reason(
            state, self._approval(), status=status, config={"agents": {}}
        )
        self.assertEqual(reason, "reassignment_triage")


if __name__ == "__main__":
    unittest.main()
