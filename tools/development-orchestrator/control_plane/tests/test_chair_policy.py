from __future__ import annotations

import unittest

from control_plane.domain.chair_policy import (
    CHAIR_REVIEW_OUTPUT_KEYS,
    normalize_review_defaults,
    validate_review_payload,
)
from control_plane.domain.unblock_resolution import MERGED_RUNTIME_ACCEPTANCE_READY


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


def merged_acceptance_action(**changes) -> dict:
    action = {
        "task_id": "MERGED-EXAMPLE", "action": "resume_parent_task", "reason": "only the runtime blocker remains",
        "resume_basis": MERGED_RUNTIME_ACCEPTANCE_READY, "resume_status": "acceptance",
        "candidate_sha": "a" * 40, "candidate_generation": "generation-one",
        "merge_sha": "b" * 40, "blocker_fingerprint": "c" * 64,
        "candidate_branch": "claude/merged-example", "owner": "Claude", "reviewer": "Codex",
        "required_acceptance": ["evidence_key_one"], "depends_on": [],
    }
    action.update(changes)
    return {key: value for key, value in action.items() if value is not None}


def with_task_action(action: dict) -> dict:
    payload = valid_payload()
    payload["task_actions"] = [action]
    return payload


class MergedAcceptanceResumeSchemaTests(unittest.TestCase):
    def test_accepts_exact_merged_acceptance_resume(self) -> None:
        self.assertIsNone(validate_review_payload(with_task_action(merged_acceptance_action())))

    def test_rejects_each_malformed_merged_acceptance_resume(self) -> None:
        cases = {
            "missing candidate_sha": ({"candidate_sha": None}, "merged acceptance resume requires a full candidate_sha"),
            "short candidate_sha": ({"candidate_sha": "a" * 39}, "merged acceptance resume requires a full candidate_sha"),
            "upper candidate_sha": ({"candidate_sha": "A" * 40}, "merged acceptance resume requires a full candidate_sha"),
            "missing generation": ({"candidate_generation": None}, "merged acceptance resume requires candidate_generation"),
            "blank generation": ({"candidate_generation": " "}, "merged acceptance resume requires candidate_generation"),
            "missing merge_sha": ({"merge_sha": None}, "merged acceptance resume requires a full merge_sha"),
            "bad merge_sha": ({"merge_sha": "z" * 40}, "merged acceptance resume requires a full merge_sha"),
            "missing fingerprint": ({"blocker_fingerprint": None},
                                    "merged acceptance resume requires the observed blocker_fingerprint"),
            "bad fingerprint": ({"blocker_fingerprint": "c" * 63},
                                "merged acceptance resume requires the observed blocker_fingerprint"),
            "in_progress status": ({"resume_status": "in_progress"}, "merged acceptance resume only resumes acceptance"),
            "missing status": ({"resume_status": None}, "merged acceptance resume only resumes acceptance"),
            "upper status": ({"resume_status": "ACCEPTANCE"}, "merged acceptance resume only resumes acceptance"),
            "helper": ({"helper_task_id": "UNBLOCK-1"}, "merged acceptance resume must not name an unblock helper"),
            "pr_url": ({"pr_url": "https://github.com/acme/fleet/pull/1"},
                       "merged acceptance resume has unexpected fields: pr_url"),
            "unknown field": ({"approved": True}, "merged acceptance resume has unexpected fields: approved"),
            "missing candidate_branch": ({"candidate_branch": None},
                                         "merged acceptance resume requires the observed candidate_branch"),
            "blank candidate_branch": ({"candidate_branch": " "},
                                       "merged acceptance resume requires the observed candidate_branch"),
            "missing owner": ({"owner": None}, "merged acceptance resume requires the observed owner"),
            "blank owner": ({"owner": " "}, "merged acceptance resume requires the observed owner"),
            "missing reviewer": ({"reviewer": None}, "merged acceptance resume requires the observed reviewer"),
            # "reviewer" is also validated generically for every task_actions
            # kind (line ~198), so a present-but-blank value is caught there first.
            "blank reviewer": ({"reviewer": " "}, "task_actions reviewer must be a non-empty string when provided"),
            "missing required_acceptance": ({"required_acceptance": None},
                                            "merged acceptance resume requires the observed required_acceptance list"),
            "empty required_acceptance": ({"required_acceptance": []},
                                          "merged acceptance resume requires the observed required_acceptance list"),
            "non-string required_acceptance item": ({"required_acceptance": ["ok", 1]},
                                                     "merged acceptance resume requires the observed required_acceptance list"),
            "required_acceptance not a list": ({"required_acceptance": "key-one"},
                                               "merged acceptance resume requires the observed required_acceptance list"),
            "missing depends_on": ({"depends_on": None},
                                   "merged acceptance resume requires the observed depends_on list"),
            "non-string depends_on item": ({"depends_on": ["DEP-A", 2]},
                                           "merged acceptance resume requires the observed depends_on list"),
            "depends_on not a list": ({"depends_on": "DEP-A"},
                                      "merged acceptance resume requires the observed depends_on list"),
        }
        for kind, (changes, error) in cases.items():
            with self.subTest(kind=kind):
                self.assertEqual(validate_review_payload(with_task_action(merged_acceptance_action(**changes))), error)

    def test_basis_is_only_for_resume_parent_task_and_unknown_bases_stay_rejected(self) -> None:
        error = ("task_actions resume_basis is only candidate_ci_recovered or "
                 "merged_runtime_acceptance_ready for resume_parent_task")
        self.assertEqual(validate_review_payload(with_task_action(merged_acceptance_action(action="dispatch_now"))), error)
        self.assertEqual(validate_review_payload(with_task_action(merged_acceptance_action(resume_basis="merged", resume_status=None))), error)

    def test_malformed_resume_basis_types_are_rejected_not_raised(self) -> None:
        """Regression: resume_basis=[]/{} used to hit `not in {set}` and raise
        TypeError (unhashable type) instead of returning a validation error."""
        error = ("task_actions resume_basis is only candidate_ci_recovered or "
                 "merged_runtime_acceptance_ready for resume_parent_task")
        for basis in ([], {}, ["merged_runtime_acceptance_ready"], {"basis": "merged_runtime_acceptance_ready"}, 1, False):
            with self.subTest(basis=basis):
                action = {"task_id": "T-1", "action": "resume_parent_task", "reason": "x", "resume_basis": basis}
                self.assertEqual(validate_review_payload(with_task_action(action)), error)
        # A full revalidation afterwards (fresh payload, no leftover state) still works.
        self.assertIsNone(validate_review_payload(with_task_action(merged_acceptance_action())))
        self.assertIsNone(validate_review_payload(valid_payload()))

    def test_acceptance_status_needs_the_merged_basis(self) -> None:
        action = {"task_id": "T-1", "action": "resume_parent_task", "resume_status": "acceptance", "reason": "x"}
        self.assertEqual(validate_review_payload(with_task_action(action)),
                         "task_actions resume_status must be backlog, todo, or in_progress when provided")

    def test_candidate_ci_recovery_shape_is_unchanged(self) -> None:
        action = {
            "task_id": "CI-EXAMPLE", "action": "resume_parent_task", "reason": "CI recovered",
            "resume_basis": "candidate_ci_recovered", "resume_status": "in_progress",
            "candidate_sha": "a" * 40, "candidate_generation": "generation-one", "blocker_fingerprint": "c" * 64,
            "pr_url": "https://github.com/acme/fleet/pull/31",
        }
        self.assertIsNone(validate_review_payload(with_task_action(action)))
        self.assertEqual(validate_review_payload(with_task_action({**action, "resume_status": "acceptance"})),
                         "task_actions resume_status must be backlog, todo, or in_progress when provided")
        self.assertEqual(validate_review_payload(with_task_action({k: v for k, v in action.items() if k != "pr_url"})),
                         "candidate CI recovery requires the observed candidate pr_url")


if __name__ == "__main__":
    unittest.main()
