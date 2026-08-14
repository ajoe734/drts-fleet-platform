from __future__ import annotations

import unittest

from control_plane.domain.chair_policy import (
    CHAIR_REVIEW_OUTPUT_KEYS,
    normalize_review_defaults,
    validate_review_payload,
)


def valid_payload() -> dict:
    payload = {key: None for key in CHAIR_REVIEW_OUTPUT_KEYS}
    payload.update(
        {
            "version": 1,
            "decision": "operational_review",
            "approval_ttl_minutes": None,
            "reason": "routine",
            "blocked_by": [],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [],
        }
    )
    return payload


class ChairPolicyTests(unittest.TestCase):
    def test_accepts_complete_typed_payload(self) -> None:
        self.assertIsNone(validate_review_payload(valid_payload()))

    def test_defaults_are_policy_input_not_global_config_reads(self) -> None:
        normalized = normalize_review_defaults(
            valid_payload(),
            {"default_approval_ttl_minutes": 30},
        )
        self.assertEqual(normalized["approval_ttl_minutes"], 30)

    def test_rejects_unsafe_provider_action_shape(self) -> None:
        payload = valid_payload()
        payload["provider_actions"] = [
            {"action": "pause", "agent": "codex", "kind": "root", "reason": "x"}
        ]

        self.assertEqual(
            validate_review_payload(payload),
            "provider_actions pause kind must be auth, quota, capacity, or manual",
        )


if __name__ == "__main__":
    unittest.main()
