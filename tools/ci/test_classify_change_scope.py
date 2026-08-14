#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("classify_change_scope.py")
SPEC = importlib.util.spec_from_file_location("classify_change_scope", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
change_scope = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(change_scope)


class ChangeScopeTest(unittest.TestCase):
    def test_tool_only_diff_skips_product_gates(self) -> None:
        result = change_scope.classify_paths(
            [
                "tools/development-orchestrator/github_bus.py",
                "tools/development-orchestrator/test_github_bus.py",
                "tools/task-dispatch/dispatch-stage1-functional-completion-20260808.py",
                ".orchestrator/config.json",
            ]
        )

        self.assertEqual(
            result,
            {"scope": "tool-only", "product": "false", "orchestrator": "true", "e2e": "false"},
        )

    def test_product_diff_runs_product_gates(self) -> None:
        result = change_scope.classify_paths(["apps/api/src/index.ts"])

        self.assertEqual(
            result,
            {"scope": "product", "product": "true", "orchestrator": "false", "e2e": "true"},
        )

    def test_mixed_diff_runs_both_gate_families(self) -> None:
        result = change_scope.classify_paths(
            ["apps/api/src/index.ts", "tools/development-orchestrator/github_bus.py"]
        )

        self.assertEqual(
            result,
            {"scope": "mixed", "product": "true", "orchestrator": "true", "e2e": "true"},
        )

    def test_docs_only_diff_is_non_product(self) -> None:
        result = change_scope.classify_paths(["docs/ops/branch-strategy.md", "README.md"])

        self.assertEqual(
            result,
            {"scope": "non-product", "product": "false", "orchestrator": "false", "e2e": "false"},
        )

    def test_workflow_and_classifier_changes_default_to_product(self) -> None:
        result = change_scope.classify_paths(
            [".github/workflows/ci.yml", "tools/ci/classify_change_scope.py"]
        )

        self.assertEqual(result["scope"], "product")
        self.assertEqual(result["product"], "true")

    def test_full_events_and_empty_diffs_fail_safe(self) -> None:
        expected = {"scope": "full", "product": "true", "orchestrator": "true", "e2e": "true"}

        self.assertEqual(change_scope.classify_paths([], force_full=True), expected)
        self.assertEqual(change_scope.classify_paths([]), expected)


if __name__ == "__main__":
    unittest.main()
