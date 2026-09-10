"""Structural contract test for .github/workflows/leave-acceptance.yml.

SR-LEAVE-BE-001 requires remote real-PostgreSQL acceptance evidence for driver
leave persistence, concurrency races, shift suppression invariants, and durable
reload across database restart. This workflow is the dedicated execution environment
for that acceptance criteria.

Parsed with plain text/regex to match tools/ci/test_workflow_timeouts.py and
tools/ci/test_tenant_binding_acceptance_workflow.py conventions.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "leave-acceptance.yml"
TEST_PATH = (
    "tests/integration/system-remediation/sr-leave-be-001/"
    "leave-persistence-race.integration.test.ts"
)


class LeaveAcceptanceWorkflowTests(unittest.TestCase):
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
        self.assertIn("gemini/sr-leave-be-001-acceptance-runner", self.text)

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
        self.assertIn('^[0-9a-f]{40}$', self.text)

    def test_records_separate_harness_sha_and_preserves_overlay(self) -> None:
        self.assertIn("HARNESS_SHA=", self.text)
        self.assertIn("/tmp/leave-harness-overlay", self.text)

    def test_checks_out_candidate_and_verifies_immutable_head(self) -> None:
        self.assertIn('git checkout "$CANDIDATE_SHA"', self.text)
        self.assertIn('"$resolved" != "$CANDIDATE_SHA"', self.text)

    def test_asserts_candidate_runtime_immutability(self) -> None:
        self.assertIn("apps/api/src/modules/driver-leave", self.text)
        self.assertIn("infra/migrations", self.text)
        self.assertIn("Candidate runtime immutability verified", self.text)

    def test_runs_against_dedicated_migrated_postgis_database(self) -> None:
        self.assertIn("postgis/postgis:16-3.4", self.text)
        self.assertIn("pnpm db:migrate", self.text)
        self.assertIn("DRTS_LEAVE_TEST_DATABASE_URL:", self.text)

    def test_executes_leave_persistence_race_integration_test_suite(self) -> None:
        self.assertIn(TEST_PATH, self.text)
        self.assertIn("--no-file-parallelism", self.text)
        self.assertIn("--maxConcurrency=1", self.text)

    def test_restarts_postgresql_container_for_durable_reload(self) -> None:
        self.assertIn("docker restart", self.text)
        self.assertIn("LEAVE_ACCEPTANCE_PHASE=post-restart", self.text)

    def test_extracts_raw_sql_evidence_for_leaves_shifts_and_suppressions(self) -> None:
        self.assertIn("raw-sql-leaves.txt", self.text)
        self.assertIn("raw-sql-shifts.txt", self.text)
        self.assertIn("raw-sql-suppressions.txt", self.text)
        self.assertIn("ops.phase1_driver_leave_requests", self.text)
        self.assertIn("ops.phase1_driver_shifts", self.text)
        self.assertIn("ops.phase1_driver_matching_suppressions", self.text)

    def test_enforces_zero_skips_and_positive_test_count_gate(self) -> None:
        self.assertIn("numTotalTests", self.text)
        self.assertIn("numPassedTests", self.text)
        self.assertIn("numPendingTests", self.text)
        self.assertIn("pending > 0", self.text)
        self.assertIn("total == 0", self.text)
        self.assertIn("passed != total", self.text)

    def test_uploads_logs_reports_and_sql_evidence_always(self) -> None:
        upload_block = self.text.split("upload-artifact@v4", 1)[1]
        preceding = self.text.split("upload-artifact@v4", 1)[0]
        step_start = preceding.rfind("- name:")
        step_text = preceding[step_start:] + upload_block[:600]
        self.assertIn("if: always()", step_text)
        self.assertIn("phase1-report.json", step_text)
        self.assertIn("phase2-report.json", step_text)
        self.assertIn("raw-sql-leaves.txt", step_text)
        self.assertIn("raw-sql-shifts.txt", step_text)
        self.assertIn("raw-sql-suppressions.txt", step_text)


if __name__ == "__main__":
    unittest.main()
