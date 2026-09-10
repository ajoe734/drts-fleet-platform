"""Structural contract test for .github/workflows/leave-acceptance.yml.

SR-LEAVE-BE-001 requires remote real-PostgreSQL acceptance evidence for driver
leave persistence, concurrency races, shift suppression invariants, and durable
reload across a real database restart. This workflow is the dedicated
execution environment for that acceptance criteria.

Parsed with plain text/regex to match tools/ci/test_workflow_timeouts.py and
tools/ci/test_tenant_binding_acceptance_workflow.py conventions.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "leave-acceptance.yml"
MAIN_TEST_PATH = (
    "tests/integration/system-remediation/sr-leave-be-001/"
    "leave-persistence-race.integration.test.ts"
)
DURABLE_RELOAD_TEST_PATH = (
    "tests/integration/system-remediation/sr-leave-be-001/"
    "leave-durable-reload.integration.test.ts"
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
        self.assertIn("claude2/sr-leave-be-001-acceptance-runner", self.text)

    def test_runs_its_own_structural_contract_test_instead_of_editing_shared_ci_workflows(self) -> None:
        # SR-LEAVE-BE-001-ACCEPTANCE-RUNNER only owns .github/workflows/leave-acceptance.yml.
        # tools/ci/check_test_coverage.py only scans ci.yml/ci-integ.yml for direct
        # `python3 -m unittest <file>` registrations, and those two files are owned by
        # other concurrently-registered acceptance runners, so this workflow invokes its
        # own structural contract test directly instead of editing either shared file.
        self.assertIn(
            "python3 -m unittest tools/ci/test_leave_acceptance_workflow.py",
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
        self.assertIn('^[0-9a-f]{40}$', self.text)

    def test_records_separate_harness_sha_and_preserves_overlay(self) -> None:
        self.assertIn("HARNESS_SHA=", self.text)
        self.assertIn("/tmp/leave-harness-overlay", self.text)

    def test_checks_out_candidate_and_verifies_immutable_head(self) -> None:
        self.assertIn('git checkout "$CANDIDATE_SHA"', self.text)
        self.assertIn('"$resolved" != "$CANDIDATE_SHA"', self.text)
        self.assertIn("CANDIDATE_RESOLVED_SHA=$resolved", self.text)

    def test_asserts_candidate_runtime_immutability(self) -> None:
        self.assertIn("apps/api/src/modules/driver-leave", self.text)
        self.assertIn("infra/migrations", self.text)
        self.assertIn("Candidate runtime immutability verified", self.text)

    def test_runs_against_dedicated_migrated_postgis_database(self) -> None:
        self.assertIn("postgis/postgis:16-3.4", self.text)
        self.assertIn("pnpm db:migrate", self.text)
        self.assertIn("DRTS_LEAVE_TEST_DATABASE_URL:", self.text)

    def test_executes_leave_persistence_race_and_durable_reload_seed_in_phase1(self) -> None:
        self.assertIn(MAIN_TEST_PATH, self.text)
        self.assertIn(DURABLE_RELOAD_TEST_PATH, self.text)
        self.assertIn("--no-file-parallelism", self.text)
        self.assertIn("--maxConcurrency=1", self.text)
        self.assertIn("phase1-report.json", self.text)

    def test_phase2_runs_only_the_dedicated_durable_reload_file_with_no_subset_filter(self) -> None:
        # A `-t` subset filter against a multi-test file would report the
        # non-matching tests as pending/skipped in the JSON reporter, which
        # would silently defeat the zero-skip gate. Phase 2 must instead run
        # a dedicated single-test file with no `-t` filter at all.
        phase2_block = self.text.split("phase2-report.json", 1)[0][-1200:]
        self.assertIn("LEAVE_ACCEPTANCE_PHASE=post-restart", phase2_block)
        self.assertIn(DURABLE_RELOAD_TEST_PATH, phase2_block)
        self.assertNotIn(MAIN_TEST_PATH, phase2_block)
        self.assertNotIn(' -t "', phase2_block)

    def test_restart_step_verifies_a_real_container_restart_before_and_after(self) -> None:
        self.assertIn("job.services.postgres.id", self.text)
        self.assertIn("docker inspect -f '{{.State.StartedAt}}'", self.text)
        self.assertIn("before_started_at", self.text)
        self.assertIn("after_started_at", self.text)
        self.assertIn(
            '"$before_started_at" = "$after_started_at"',
            self.text,
        )
        self.assertIn("docker restart", self.text)
        self.assertNotIn("docker restart $(docker ps -q | head -n 1) || true", self.text)
        self.assertIn("restart-evidence.json", self.text)

    def test_extracts_raw_sql_evidence_for_leaves_shifts_and_suppressions(self) -> None:
        self.assertIn("raw-sql-leaves.txt", self.text)
        self.assertIn("raw-sql-shifts.txt", self.text)
        self.assertIn("raw-sql-suppressions.txt", self.text)
        self.assertIn("ops.phase1_driver_leave_requests", self.text)
        self.assertIn("ops.phase1_driver_shifts", self.text)
        self.assertIn("ops.phase1_driver_matching_suppressions", self.text)

    def test_writes_a_sha_manifest_with_resolved_candidate_and_harness_hashes(self) -> None:
        self.assertIn("manifest.json", self.text)
        self.assertIn("resolvedCandidateSha", self.text)
        self.assertIn("harnessSha", self.text)
        self.assertIn("harnessOverlayHashes", self.text)

    def test_enforces_zero_skips_and_positive_test_count_gate_on_both_phase_reports(self) -> None:
        self.assertIn("numTotalTests", self.text)
        self.assertIn("numPassedTests", self.text)
        self.assertIn("numPendingTests", self.text)
        self.assertIn("pending > 0", self.text)
        self.assertIn("total == 0", self.text)
        self.assertIn("passed != total", self.text)
        self.assertIn('load_report(".artifacts/leave-acceptance/phase1-report.json")', self.text)
        self.assertIn('load_report(".artifacts/leave-acceptance/phase2-report.json")', self.text)

    def test_gate_requires_real_restart_evidence_and_manifest(self) -> None:
        gate_block = self.text.split("Gate on zero skips", 1)[1]
        self.assertIn("restart-evidence.json", gate_block)
        self.assertIn("beforeStartedAt", gate_block)
        self.assertIn("manifest.json", gate_block)
        self.assertIn("resolvedCandidateSha", gate_block)

    def test_uploads_logs_reports_restart_and_manifest_evidence_always(self) -> None:
        upload_block = self.text.split("upload-artifact@v4", 1)[1]
        preceding = self.text.split("upload-artifact@v4", 1)[0]
        step_start = preceding.rfind("- name:")
        step_text = preceding[step_start:] + upload_block[:800]
        self.assertIn("if: always()", step_text)
        self.assertIn("phase1-report.json", step_text)
        self.assertIn("phase2-report.json", step_text)
        self.assertIn("restart-evidence.json", step_text)
        self.assertIn("manifest.json", step_text)
        self.assertIn("raw-sql-leaves.txt", step_text)
        self.assertIn("raw-sql-shifts.txt", step_text)
        self.assertIn("raw-sql-suppressions.txt", step_text)

    def test_artifact_name_uses_resolved_runtime_sha_not_harness_sha(self) -> None:
        # A push-triggered run has no workflow_dispatch input; the artifact
        # name must still reflect the actual checked-out candidate SHA
        # (env.CANDIDATE_RESOLVED_SHA), not github.sha (the harness commit).
        self.assertIn("name: leave-acceptance-${{ env.CANDIDATE_RESOLVED_SHA", self.text)


if __name__ == "__main__":
    unittest.main()
