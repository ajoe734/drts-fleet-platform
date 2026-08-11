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

    def test_transport_outage_wrapped_in_auth_wording_is_capacity(self) -> None:
        worker = {"provider": "gemini2"}

        for reason in (
            "Eligibility check failed: failed to fetch quota summary: "
            "UNAVAILABLE (code 503)",
            "permission denied: status 502 bad gateway",
            "unauthorized: the service is currently unavailable",
            "authentication error: deadline exceeded",
        ):
            with self.subTest(reason=reason):
                decision = classify_failure({}, worker, reason)
                self.assertEqual(decision.kind, FailureKind.CAPACITY)
                self.assertTrue(decision.transient)

    def test_bare_transport_status_codes_are_capacity(self) -> None:
        worker = {"provider": "gemini2"}

        for reason in (
            "502 Bad Gateway",
            "Error 504",
            "503 Service Unavailable",
            "504 Gateway Timeout",
            "upstream connect failed: 502",
            "UNAVAILABLE (code 503)",
            "status: 502",
        ):
            with self.subTest(reason=reason):
                decision = classify_failure({}, worker, reason)
                self.assertEqual(decision.kind, FailureKind.CAPACITY)
                self.assertTrue(decision.transient)

    def test_status_code_lookalikes_do_not_fake_a_transport_outage(self) -> None:
        for reason in (
            "unauthorized: request id abc502def",
            "invalid api key (key version 1.503)",
            "authentication failed after 5031 ms",
            "forbidden: upstream localhost:5040 rejected the token",
        ):
            with self.subTest(reason=reason):
                decision = classify_failure({}, {"provider": "gemini2"}, reason)
                self.assertEqual(decision.kind, FailureKind.AUTH)
                self.assertFalse(decision.transient)

    def test_quota_exhaustion_still_wins_over_transport_outage(self) -> None:
        decision = classify_failure(
            {},
            {"provider": "gemini2"},
            "quota_exhausted: backend returned code 503",
        )

        self.assertEqual(decision.kind, FailureKind.QUOTA_TERMINAL)
        self.assertFalse(decision.transient)

    def test_real_auth_failure_without_transport_marker_stays_auth(self) -> None:
        for reason in (
            "Eligibility check failed: user is not eligible for antigravity",
            "status: 401 unauthorized",
            "refresh token was revoked",
        ):
            with self.subTest(reason=reason):
                decision = classify_failure({}, {"provider": "gemini2"}, reason)
                self.assertEqual(decision.kind, FailureKind.AUTH)
                self.assertFalse(decision.transient)

    def test_capacity_signal_wins_over_broad_eligibility_wrapper(self) -> None:
        decision = classify_failure(
            {},
            {"provider": "gemini"},
            "Eligibility check failed: quota summary returned RESOURCE_EXHAUSTED (code 429)",
        )

        self.assertEqual(decision.kind, FailureKind.CAPACITY)
        self.assertTrue(decision.transient)

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
