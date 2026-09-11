"""Contract for .github/workflows/enterprise-search-acceptance.yml.

SR-ENTERPRISE-SEARCH-001 acceptance evidence requires running the enterprise
booking history search harness -- the frontend's real query-composition
function driving the real, unmodified OwnedMobilityController/Service --
against a real, migrated PostgreSQL instance. This dedicated workflow runs
against a PostGIS service container and verifies 100% test pass rate with
zero skips.

This test file verifies:
- The workflow triggers, input validation, and checkout integrity.
- Postgres service setup, environment variables, and migration step.
- The zero-skip gate logic.
- The run-status computation script extracted from the workflow heredoc.
- The artifact upload configuration.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "enterprise-search-acceptance.yml"
UNIT_TEST_PATH = (
    "tests/unit/system-remediation/sr-enterprise-search-001/"
    "enterprise-booking-search-query.test.ts"
)
E2E_TEST_PATH = (
    "tests/e2e/system-remediation/sr-enterprise-search-001/"
    "enterprise-search-query-acceptance.test.ts"
)


def _extract_heredoc(text: str, marker: str) -> str:
    """Pull the body of a python3 - <<'MARKER' ... MARKER block out of the workflow YAML."""
    match = re.search(
        r"<<'" + re.escape(marker) + r"'\n(.*?)\n[ \t]*" + re.escape(marker) + r"\n",
        text,
        re.DOTALL,
    )
    if not match:
        raise AssertionError(f"could not find {marker} heredoc in workflow")
    return textwrap.dedent(match.group(1))


class EnterpriseSearchAcceptanceWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(WORKFLOW.exists(), f"missing {WORKFLOW}")
        self.text = WORKFLOW.read_text(encoding="utf-8")

    def test_is_manually_dispatched_with_a_required_candidate_sha_input(self) -> None:
        self.assertIn("workflow_dispatch:", self.text)
        self.assertIn("candidate_sha:", self.text)
        dispatch_block = self.text.split("workflow_dispatch:", 1)[1]
        input_block = dispatch_block.split("candidate_sha:", 1)[1][:400]
        self.assertIn("required: true", input_block)

    def test_has_a_push_trigger_scoped_to_task_branch_and_paths(self) -> None:
        on_block = self.text.split("permissions:", 1)[0]
        self.assertIn("push:", on_block)
        push_block = on_block.split("push:", 1)[1]
        self.assertIn("claude/sr-enterprise-search-001-recovery-20260911", push_block)
        self.assertIn(
            ".github/workflows/enterprise-search-acceptance.yml", push_block
        )
        self.assertIn(
            "tools/ci/test_enterprise_search_acceptance_workflow.py", push_block
        )

    def test_checks_out_candidate_sha_with_full_depth_and_verifies_integrity(
        self,
    ) -> None:
        self.assertIn("actions/checkout@v4", self.text)
        self.assertIn("fetch-depth: 0", self.text)
        self.assertIn("git rev-parse HEAD", self.text)
        self.assertIn("Checked-out HEAD", self.text)

    def test_configures_postgres_service_and_database_urls(self) -> None:
        self.assertIn("postgres:", self.text)
        self.assertIn("postgis/postgis:16-3.4", self.text)
        self.assertIn("pg_isready -U postgres", self.text)
        self.assertIn("DATABASE_URL:", self.text)
        self.assertIn("DRTS_ENTERPRISE_SEARCH_DATABASE_URL:", self.text)

    def test_runs_migrations_before_harness(self) -> None:
        migrate_idx = self.text.find("pnpm db:migrate")
        harness_idx = self.text.find("pnpm exec vitest run")
        self.assertNotEqual(migrate_idx, -1, "missing pnpm db:migrate")
        self.assertNotEqual(harness_idx, -1, "missing vitest run")
        self.assertLess(
            migrate_idx,
            harness_idx,
            "migrations must run before acceptance harness",
        )

    def test_harness_runs_unit_and_e2e_suites(self) -> None:
        self.assertIn(UNIT_TEST_PATH, self.text)
        self.assertIn(E2E_TEST_PATH, self.text)
        self.assertIn("--outputFile.json=", self.text)

    def test_gate_requires_zero_skips_and_100_percent_pass(self) -> None:
        gate_script = _extract_heredoc(self.text, "PY_GATE")
        self.assertIn("numTotalTests", gate_script)
        self.assertIn("numPassedTests", gate_script)
        self.assertIn("numPendingTests", gate_script)
        self.assertIn("passed != total", gate_script)
        self.assertIn("pending", gate_script)

    def test_uploads_artifacts_always(self) -> None:
        upload_block = self.text.split("actions/upload-artifact@v4", 1)[1]
        step_prefix = self.text.split("actions/upload-artifact@v4", 1)[0].rsplit(
            "- name:", 1
        )[1]
        self.assertIn("if: always()", step_prefix)
        self.assertIn("execution-log.txt", upload_block)
        self.assertIn("test-report.json", upload_block)
        self.assertIn("run-status.json", upload_block)

    def test_run_status_heredoc_execution(self) -> None:
        script = _extract_heredoc(self.text, "PY_STATUS")
        with tempfile.TemporaryDirectory() as td:
            tmpdir = Path(td)
            artifacts_dir = tmpdir / ".artifacts" / "enterprise-search-acceptance"
            artifacts_dir.mkdir(parents=True)
            report_file = artifacts_dir / "test-report.json"
            status_file = artifacts_dir / "run-status.json"

            # Case A: Success run with report present
            report_file.write_text(json.dumps({"success": True}))
            env = {
                **os.environ,
                "INSTALL_OUTCOME": "success",
                "MIGRATE_OUTCOME": "success",
                "HARNESS_OUTCOME": "success",
                "GATE_OUTCOME": "success",
                "CANDIDATE_SHA": "abc1234567890123456789012345678901234567",
                "WORKFLOW_SHA": "def1234567890123456789012345678901234567",
            }
            res = subprocess.run(
                [sys.executable, "-c", script],
                cwd=td,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertIn("Run status recorded: passed", res.stdout)
            saved = json.loads(status_file.read_text())
            self.assertEqual(saved["status"], "passed")
            self.assertEqual(saved["candidate_sha"], env["CANDIDATE_SHA"])

            # Case B: Harness failure
            env["HARNESS_OUTCOME"] = "failure"
            env["GATE_OUTCOME"] = "failure"
            subprocess.run(
                [sys.executable, "-c", script],
                cwd=td,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            saved = json.loads(status_file.read_text())
            self.assertEqual(saved["status"], "failed")

            # Case C: Migration failure -> not_run
            env["MIGRATE_OUTCOME"] = "failure"
            subprocess.run(
                [sys.executable, "-c", script],
                cwd=td,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            saved = json.loads(status_file.read_text())
            self.assertEqual(saved["status"], "not_run")


if __name__ == "__main__":
    unittest.main()
