"""Structural contract for .github/workflows/tenant-binding-acceptance.yml.

SR-QA-WEBHOOK-001-FIX-TENANT-BINDING's required acceptance evidence
(full_appmodule_two_tenant_jwt_http_sql_candidate_evidence) can only be
produced by an environment that runs the real HTTP server against a real,
migrated PostgreSQL -- something no worker VM in this project is allowed to
start. This dedicated workflow is that environment. It is dispatched once per
candidate rather than run on every PR, so nothing in ci.yml/ci-integ.yml
exercises it; these tests are what would catch a change that silently drops
the immutable-candidate check, the zero-skip gate, or the always()-evidence
upload.

Parsed with plain text/regex on purpose, matching test_workflow_timeouts.py
and check_test_coverage.py in this directory: this file has no YAML-parsing
dependency to keep intact.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "tenant-binding-acceptance.yml"
TEST_PATH = (
    "tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/"
    "appmodule-tenant-binding.test.ts"
)


class TenantBindingAcceptanceWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(WORKFLOW.exists(), f"missing {WORKFLOW}")
        self.text = WORKFLOW.read_text(encoding="utf-8")

    def test_is_manually_dispatched_with_a_required_candidate_sha_input(self) -> None:
        self.assertIn("workflow_dispatch:", self.text)
        self.assertIn("candidate_sha:", self.text)
        # The input must be required: a default alone would let an empty
        # dispatch silently fall back instead of failing loudly.
        dispatch_block = self.text.split("workflow_dispatch:", 1)[1]
        input_block = dispatch_block.split("candidate_sha:", 1)[1][:400]
        self.assertIn("required: true", input_block)

    def test_every_job_declares_a_timeout(self) -> None:
        job_names = re.findall(r"^  ([A-Za-z0-9_-]+):\s*$", self.text, re.MULTILINE)
        # Only the top-level `jobs:` key and any job keys underneath it live at
        # two-space indent in this single-job workflow.
        job_names = [name for name in job_names if name != "jobs"]
        self.assertGreaterEqual(len(job_names), 1, "no job found to check")
        for name in job_names:
            with self.subTest(job=name):
                self.assertIn("timeout-minutes:", self.text)

    def test_checks_out_the_requested_candidate_sha(self) -> None:
        self.assertIn("ref: ${{ github.event.inputs.candidate_sha }}", self.text)

    def test_verifies_the_checkout_did_not_move_off_the_candidate(self) -> None:
        # actions/checkout resolves `ref` at fetch time; without an explicit
        # HEAD-vs-input comparison a moved branch would be accepted silently.
        self.assertIn("git rev-parse HEAD", self.text)
        self.assertIn('"$resolved" != "$expected"', self.text)

    def test_runs_against_a_dedicated_migrated_postgres_service(self) -> None:
        self.assertIn("postgres:", self.text)
        self.assertIn("postgis/postgis", self.text)
        self.assertIn("pnpm db:migrate", self.text)

    def test_sets_the_acceptance_database_and_evidence_env_vars(self) -> None:
        self.assertIn("DRTS_TENANT_BINDING_DATABASE_URL:", self.text)
        self.assertIn("DRTS_WEBHOOK_AUTH_EVIDENCE:", self.text)
        # The harness asserts the acceptance DB URL resolves to localhost;
        # anything else fails the test with a clearer message than CI would.
        self.assertIn("localhost:5432", self.text)

    def test_runs_the_full_two_tenant_appmodule_harness(self) -> None:
        self.assertIn(TEST_PATH, self.text)
        self.assertIn("--no-file-parallelism", self.text)
        self.assertIn("--maxConcurrency=1", self.text)

    def test_gates_on_zero_skips_and_both_tests_passed(self) -> None:
        self.assertIn("numTotalTests", self.text)
        self.assertIn("numPassedTests", self.text)
        self.assertIn("numPendingTests", self.text)
        self.assertIn("total < 2", self.text)
        self.assertIn("passed != total", self.text)
        # `pending` must be checked, not just captured, or a skipped test
        # would still satisfy `passed == total`.
        self.assertIn("or pending", self.text)

    def test_uploads_log_report_and_evidence_even_on_failure(self) -> None:
        upload_block = self.text.split("upload-artifact@v4", 1)[1]
        preceding = self.text.split("upload-artifact@v4", 1)[0]
        # `if: always()` must guard the upload step itself, i.e. appear on the
        # line(s) immediately before the `uses:` line, not merely somewhere
        # earlier in the file (the gate step also uses always()).
        step_start = preceding.rfind("- name:")
        step_text = preceding[step_start:] + upload_block[:400]
        self.assertIn("if: always()", step_text)
        self.assertIn(".artifacts/tenant-binding-acceptance/execution-log.txt", step_text)
        self.assertIn(".artifacts/tenant-binding-acceptance/test-report.json", step_text)
        self.assertIn(".artifacts/tenant-binding-acceptance/evidence-auth-http.json", step_text)

    def test_does_not_touch_the_locked_candidate_or_product_source(self) -> None:
        # This workflow only ever reads the candidate; it must not check
        # anything back in (no git add/commit/push of product paths).
        for token in ("git commit", "git push", "git add"):
            self.assertNotIn(token, self.text)


if __name__ == "__main__":
    unittest.main()
