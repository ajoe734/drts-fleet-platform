#!/usr/bin/env python3
from __future__ import annotations

import unittest

import branch_routing


class RouteTaskTests(unittest.TestCase):
    def test_backend_prefix_routes_to_backend_trunk(self) -> None:
        decision = branch_routing.route_task("BE-APR-NOTIFY-001")
        self.assertEqual(decision.track, "backend")
        self.assertEqual(decision.base_branch, "backend-dev")
        self.assertEqual(decision.publish_branch, "backend-staging")
        self.assertGreaterEqual(decision.matched_rule_index, 0)

    def test_frontend_prefix_routes_to_frontend_trunk(self) -> None:
        for task_id in ["UI-CANVAS-OC-001", "OPS-UI-APR-001", "TEN-UI-RD-013", "DRV-MAT-001", "PA-PARTNERS-001"]:
            with self.subTest(task_id=task_id):
                decision = branch_routing.route_task(task_id)
                self.assertEqual(decision.track, "frontend", task_id)
                self.assertEqual(decision.base_branch, "frontend-dev", task_id)

    def test_xx_ui_regex_routes_frontend_even_without_listed_prefix(self) -> None:
        decision = branch_routing.route_task("XYZ-UI-NEW-001")
        self.assertEqual(decision.track, "frontend")

    def test_docs_default_to_backend_with_note(self) -> None:
        decision = branch_routing.route_task("DOC-TEN-GOV-001")
        self.assertEqual(decision.track, "backend")
        # Matched via the docs rule, not the default fallback.
        self.assertGreaterEqual(decision.matched_rule_index, 0)

    def test_unknown_prefix_falls_back_to_default_track(self) -> None:
        decision = branch_routing.route_task("Z-UNKNOWN-999")
        self.assertEqual(decision.track, "backend")  # DEFAULT_TRACK
        self.assertEqual(decision.matched_rule_index, -1)
        self.assertEqual(decision.matched_pattern, "")

    def test_case_insensitive_matching(self) -> None:
        decision = branch_routing.route_task("be-cc-001-fu-seed")
        self.assertEqual(decision.track, "backend")
        self.assertEqual(decision.task_id, "BE-CC-001-FU-SEED")

    def test_config_override_can_remap_tracks_and_branches(self) -> None:
        config = {
            "branch_strategy": {
                "tracks": {
                    "backend": "develop-be",
                    "frontend": "develop-fe",
                    "data": "develop-data",
                },
                "publish_branches": {
                    "backend": "publish-be",
                    "frontend": "publish-fe",
                    "data": "publish-data",
                },
                "track_rules": [
                    {"track": "data", "prefixes": ["ETL-", "WAREHOUSE-"]},
                    {"track": "backend", "prefixes": ["BE-"]},
                    {"track": "frontend", "prefixes": ["UI-"]},
                ],
                "default_track": "backend",
            }
        }
        d = branch_routing.route_task("ETL-DAILY-001", config=config)
        self.assertEqual(d.track, "data")
        self.assertEqual(d.base_branch, "develop-data")
        self.assertEqual(d.publish_branch, "publish-data")

    def test_first_matching_rule_wins(self) -> None:
        # If we put a catch-all first, it should win over later, more-specific rules.
        config = {
            "branch_strategy": {
                "tracks": {"backend": "be", "frontend": "fe"},
                "publish_branches": {"backend": "be-pub", "frontend": "fe-pub"},
                "track_rules": [
                    {"track": "backend", "regex": r".*"},
                    {"track": "frontend", "prefixes": ["UI-"]},
                ],
                "default_track": "backend",
            }
        }
        d = branch_routing.route_task("UI-CANVAS-OC-001", config=config)
        self.assertEqual(d.track, "backend")
        self.assertEqual(d.matched_rule_index, 0)

    def test_known_long_lived_branches(self) -> None:
        branches = branch_routing.known_long_lived_branches()
        self.assertIn("main", branches)
        self.assertIn("backend-dev", branches)
        self.assertIn("frontend-dev", branches)
        self.assertIn("backend-staging", branches)
        self.assertIn("frontend-staging", branches)

    def test_route_many_preserves_order(self) -> None:
        decisions = branch_routing.route_many(["BE-1", "UI-1", "DOC-1"])
        self.assertEqual([d.track for d in decisions], ["backend", "frontend", "backend"])

    def test_as_dict_includes_gate_layer(self) -> None:
        d = branch_routing.route_task("BE-1").as_dict()
        self.assertEqual(d["gate_layer"], "merge")
        self.assertIn("base_branch", d)
        self.assertIn("publish_branch", d)


if __name__ == "__main__":
    unittest.main()
