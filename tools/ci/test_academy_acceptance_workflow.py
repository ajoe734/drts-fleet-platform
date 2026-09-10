from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "academy-acceptance.yml"
TEST_PATH = (
    "tests/integration/system-remediation/sr-academy-be-001/"
    "academy-remote-acceptance.integration.test.ts"
)


class AcademyAcceptanceWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(WORKFLOW.exists(), f"missing {WORKFLOW}")
        self.text = WORKFLOW.read_text(encoding="utf-8")

    def test_declares_workflow_dispatch_with_required_candidate_sha_input(self) -> None:
        self.assertIn("workflow_dispatch:", self.text)
        self.assertIn("candidate_sha:", self.text)
        dispatch_block = self.text.split("workflow_dispatch:", 1)[1]
        input_block = dispatch_block.split("candidate_sha:", 1)[1][:400]
        self.assertIn("required: true", input_block)

    def test_declares_narrow_task_branch_push_registration(self) -> None:
        self.assertIn("push:", self.text)
        self.assertIn("gemini/sr-academy-be-001", self.text)
        self.assertIn("claude2/sr-academy-be-001", self.text)
        self.assertIn("claude/sr-academy-be-001", self.text)

    def test_runs_its_own_structural_contract_test_instead_of_editing_shared_ci_workflows(self) -> None:
        self.assertIn(
            "python3 -m unittest tools/ci/test_academy_acceptance_workflow.py",
            self.text,
        )

    def test_every_job_declares_timeout_minutes(self) -> None:
        job_names = re.findall(r"^  ([A-Za-z0-9_-]+):\s*$", self.text, re.MULTILINE)
        job_names = [name for name in job_names if name != "jobs"]
        self.assertGreaterEqual(len(job_names), 1, "no job found in workflow")
        for name in job_names:
            with self.subTest(job=name):
                self.assertIn("timeout-minutes:", self.text)

    def test_routes_candidate_sha_through_env_to_prevent_script_injection(self) -> None:
        self.assertIn("CANDIDATE_SHA:", self.text)
        self.assertIn('sha="$CANDIDATE_SHA"', self.text)

    def test_validates_candidate_sha_40_character_hex_format(self) -> None:
        self.assertIn("^[0-9a-f]{40}$", self.text)

    def test_records_separate_harness_sha_and_preserves_overlay(self) -> None:
        self.assertIn("HARNESS_SHA=", self.text)
        self.assertIn("/tmp/academy-harness-overlay", self.text)

    def test_checks_out_candidate_and_verifies_immutable_head(self) -> None:
        self.assertIn('git checkout "$CANDIDATE_SHA"', self.text)
        self.assertIn('"$resolved" != "$CANDIDATE_SHA"', self.text)
        self.assertIn("CANDIDATE_RESOLVED_SHA=$resolved", self.text)

    def test_asserts_candidate_runtime_immutability(self) -> None:
        self.assertIn("tests/integration/system-remediation/sr-academy-be-001/", self.text)
        self.assertIn("Candidate runtime immutability verified", self.text)

    def test_runs_against_dedicated_migrated_postgis_database(self) -> None:
        self.assertIn("postgis/postgis:16-3.4", self.text)
        self.assertIn("pnpm db:migrate", self.text)
        self.assertIn("DRTS_ACADEMY_TEST_DATABASE_URL:", self.text)

    def test_executes_academy_acceptance_suite(self) -> None:
        self.assertIn(TEST_PATH, self.text)
        self.assertIn("--no-file-parallelism", self.text)
        self.assertIn("--maxConcurrency=1", self.text)
        self.assertIn("report.json", self.text)

    def test_extracts_raw_sql_evidence_for_all_entities(self) -> None:
        self.assertIn("raw-sql-courses.txt", self.text)
        self.assertIn("raw-sql-attempts.txt", self.text)
        self.assertIn("raw-sql-training-records.txt", self.text)
        self.assertIn("raw-sql-profiles.txt", self.text)
        self.assertIn("raw-sql-credentials.txt", self.text)
        self.assertIn("raw-sql-affiliations.txt", self.text)

    def test_writes_a_sha_manifest_with_resolved_candidate_and_harness_hashes(self) -> None:
        self.assertIn("manifest.json", self.text)
        self.assertIn("resolvedCandidateSha", self.text)
        self.assertIn("harnessSha", self.text)
        self.assertIn("harnessOverlayHashes", self.text)

    def test_enforces_zero_skips_and_positive_test_count_gate(self) -> None:
        self.assertIn("numTotalTests", self.text)
        self.assertIn("numPassedTests", self.text)
        self.assertIn("numPendingTests", self.text)
        self.assertIn("pending > 0", self.text)
        self.assertIn("total == 0", self.text)
        self.assertIn("passed != total", self.text)

    def test_uploads_logs_reports_and_manifest_evidence_always(self) -> None:
        upload_block = self.text.split("upload-artifact@v4", 1)[1]
        preceding = self.text.split("upload-artifact@v4", 1)[0]
        step_start = preceding.rfind("- name:")
        step_text = preceding[step_start:] + upload_block[:800]
        self.assertIn("if: always()", step_text)
        self.assertIn("report.json", step_text)
        self.assertIn("manifest.json", step_text)
        self.assertIn("raw-sql-*.txt", step_text)

    def test_artifact_name_uses_resolved_runtime_sha_not_harness_sha(self) -> None:
        self.assertIn("name: academy-acceptance-${{ env.CANDIDATE_RESOLVED_SHA", self.text)


if __name__ == "__main__":
    unittest.main()
