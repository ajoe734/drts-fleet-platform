"""Contract test for .github/workflows/ops-shell-acceptance.yml.

SR-OPS-SHELL-001's required acceptance evidence
(ops_cross_app_resource_navigation, ops_widget_remote_viewport_keyboard)
must be validated by a remote browser environment running the real Ops Console
and Platform Admin applications -- something no worker VM in this environment is
permitted to run locally.

This test file verifies the workflow contract, ensuring:
- Manual dispatch with required immutable candidate SHA input.
- Push trigger scoped to the task branch and related files.
- Exact candidate SHA resolution check.
- Dedicated Playwright browser acceptance execution.
- Upload of evidence artifacts even on failure.
"""
from __future__ import annotations

import os
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "ops-shell-acceptance.yml"
SPEC_PATH = (
    "tests/e2e/system-remediation/sr-ops-shell-001/ops-shell-acceptance.spec.ts"
)


class OpsShellAcceptanceWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(WORKFLOW.exists(), f"missing {WORKFLOW}")
        self.text = WORKFLOW.read_text(encoding="utf-8")

    def test_is_manually_dispatched_with_a_required_candidate_sha_input(self) -> None:
        self.assertIn("workflow_dispatch:", self.text)
        self.assertIn("candidate_sha:", self.text)
        dispatch_block = self.text.split("workflow_dispatch:", 1)[1]
        input_block = dispatch_block.split("candidate_sha:", 1)[1][:400]
        self.assertIn("required: true", input_block)

    def test_has_a_push_trigger_scoped_to_task_branches_and_files(self) -> None:
        on_block = self.text.split("permissions:", 1)[0]
        self.assertIn("push:", on_block)
        push_block = on_block.split("push:", 1)[1]
        self.assertIn("gemini2/sr-ops-shell-001", push_block)
        self.assertIn(".github/workflows/ops-shell-acceptance.yml", push_block)
        self.assertIn("tools/ci/test_ops_shell_acceptance_workflow.py", push_block)
        self.assertIn(
            "docs/04-uat/system-remediation-20260906/SR-OPS-SHELL-001.md",
            push_block,
        )

    def test_validates_candidate_sha_format(self) -> None:
        self.assertIn("^[0-9a-f]{40}$", self.text)
        self.assertIn("Validate candidate_sha input", self.text)

    def test_checkout_uses_candidate_sha_with_full_depth(self) -> None:
        checkout_block = self.text.split("actions/checkout@v4", 1)[1][:300]
        self.assertIn("fetch-depth: 0", checkout_block)
        self.assertIn("candidate_sha", checkout_block)

    def test_verifies_resolved_checkout_matches_candidate_sha(self) -> None:
        self.assertIn(
            "Verify checkout resolved the exact immutable candidate", self.text
        )
        self.assertIn("git rev-parse HEAD", self.text)

    def test_runs_playwright_acceptance_harness(self) -> None:
        self.assertIn("playwright test", self.text)
        self.assertIn("tests/e2e/system-remediation/sr-ops-shell-001/", self.text)

    def test_uploads_acceptance_evidence_bundle_always(self) -> None:
        self.assertIn("actions/upload-artifact@v4", self.text)
        self.assertIn(".artifacts/ops-shell-acceptance/", self.text)
        upload_block = self.text.split("actions/upload-artifact@v4", 1)[0]
        step_header = upload_block.rsplit("- name:", 1)[1]
        self.assertIn("if: always()", step_header)

    def test_browser_spec_exists_in_workspace(self) -> None:
        spec_file = ROOT / SPEC_PATH
        self.assertTrue(spec_file.exists(), f"missing {spec_file}")
        spec_text = spec_file.read_text(encoding="utf-8")
        self.assertIn("ops_widget_remote_viewport_keyboard", spec_text)
        self.assertIn("ops_cross_app_resource_navigation", spec_text)


if __name__ == "__main__":
    unittest.main()
