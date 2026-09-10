#!/usr/bin/env python3
"""Validation tests for Ops Shell Remote Acceptance Workflow."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_FILE = ROOT / ".github" / "workflows" / "ops-shell-acceptance.yml"
E2E_SPEC_FILE = (
    ROOT
    / "tests"
    / "e2e"
    / "system-remediation"
    / "sr-ops-shell-001"
    / "ops-shell-acceptance.spec.ts"
)


class TestOpsShellAcceptanceWorkflow(unittest.TestCase):
    def test_workflow_file_exists(self) -> None:
        self.assertTrue(
            WORKFLOW_FILE.is_file(),
            f"Expected workflow file {WORKFLOW_FILE} to exist",
        )

    def test_workflow_declares_timeout(self) -> None:
        content = WORKFLOW_FILE.read_text(encoding="utf-8")
        self.assertIn("timeout-minutes:", content)
        # Parse timeout value
        for line in content.splitlines():
            line_str = line.strip()
            if line_str.startswith("timeout-minutes:"):
                val = int(line_str.split(":", 1)[1].strip())
                self.assertLessEqual(
                    val,
                    30,
                    "Workflow timeout-minutes must be reasonable (<= 30 min)",
                )

    def test_workflow_triggers_cover_dispatch_pr_push(self) -> None:
        content = WORKFLOW_FILE.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", content)
        self.assertIn("pull_request:", content)
        self.assertIn("push:", content)

    def test_workflow_targets_e2e_spec(self) -> None:
        content = WORKFLOW_FILE.read_text(encoding="utf-8")
        self.assertIn(
            "tests/e2e/system-remediation/sr-ops-shell-001/",
            content,
        )

    def test_e2e_spec_exists_and_covers_required_acceptance(self) -> None:
        self.assertTrue(
            E2E_SPEC_FILE.is_file(),
            f"Expected E2E spec file {E2E_SPEC_FILE} to exist",
        )
        spec_content = E2E_SPEC_FILE.read_text(encoding="utf-8")
        # Check required acceptance criteria coverage
        self.assertIn("ops_cross_app_resource_navigation", spec_content)
        self.assertIn("ops_widget_remote_viewport_keyboard", spec_content)
        self.assertIn("resourceType", spec_content)
        self.assertIn("resourceId", spec_content)
        self.assertIn("1440", spec_content)
        self.assertIn("390", spec_content)


if __name__ == "__main__":
    unittest.main()
