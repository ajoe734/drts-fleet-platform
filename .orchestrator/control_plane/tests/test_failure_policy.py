from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from control_plane.domain.failure_policy import (
    FailureKind,
    classify_failure,
    infer_pause_resume_at,
    retry_settings,
)


class FailurePolicyTests(unittest.TestCase):
    def test_classifies_auth_quota_capacity_and_terminal_failures(self) -> None:
        worker = {"provider": "codex"}

        self.assertEqual(
            classify_failure({}, worker, "status: 401 unauthorized").kind,
            FailureKind.AUTH,
        )
        self.assertEqual(
            classify_failure({}, worker, "free daily quota has been reached").kind,
            FailureKind.QUOTA_TERMINAL,
        )
        capacity = classify_failure({}, worker, "status: 429 RESOURCE_EXHAUSTED")
        self.assertEqual(capacity.kind, FailureKind.CAPACITY)
        self.assertTrue(capacity.transient)
        self.assertEqual(
            classify_failure({}, worker, "unrecognized fatal exit").kind,
            FailureKind.TERMINAL,
        )

    def test_provider_retry_override_is_applied_before_classification(self) -> None:
        config = {
            "providers": {
                "custom": {"retry": {"transient_error_patterns": ["warmup"]}}
            }
        }

        decision = classify_failure(
            config,
            {"provider": "custom"},
            "model warmup in progress",
        )

        self.assertEqual(decision.kind, FailureKind.TRANSIENT)
        self.assertEqual(
            retry_settings(config, "custom")["transient_error_patterns"],
            ["warmup"],
        )

    def test_infers_iso_and_human_reset_hints(self) -> None:
        iso = infer_pause_resume_at("retry at 2026-07-19T04:05:06Z")
        human = infer_pause_resume_at(
            "resets at Jul 19, 2026 4:05 p.m. UTC",
            paused_at=datetime(2026, 7, 18, tzinfo=timezone.utc),
        )

        self.assertEqual(
            iso,
            datetime(2026, 7, 19, 4, 5, 6, tzinfo=timezone.utc).timestamp(),
        )
        self.assertEqual(
            human,
            datetime(2026, 7, 19, 16, 5, tzinfo=timezone.utc).timestamp(),
        )

    def test_infers_compact_provider_duration_reset_hint(self) -> None:
        paused_at = datetime(2026, 7, 31, 7, 0, tzinfo=timezone.utc)

        resume_at = infer_pause_resume_at(
            "Antigravity quota exhausted. Resets in 29h35m13s",
            paused_at=paused_at,
        )

        self.assertEqual(
            resume_at,
            (paused_at + timedelta(hours=29, minutes=35, seconds=13)).timestamp(),
        )


if __name__ == "__main__":
    unittest.main()
