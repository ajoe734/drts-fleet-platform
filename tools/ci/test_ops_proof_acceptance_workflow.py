"""Contract for .github/workflows/ops-proof-acceptance.yml.

SR-OPS-PROOF-001 capability C122 acceptance evidence requires a real pg_dump
snapshot of a seeded, migrated, disposable PostgreSQL database, an
independently exported manifest from that same snapshot, and a real
pg_restore into a second empty disposable database, verified with a
byte-for-byte trip/billing/audit readback. This dedicated workflow runs
against a PostGIS service container and the production ops-proof.sh /
reconcile.mjs tools; it never targets a shared or production database.

This test file verifies:
- The workflow triggers, input validation, and checkout integrity.
- Postgres service setup and the two disposable drts_ops_proof_* databases.
- No apt-get install step is present (see the documented ci.yml incident:
  `apt-get install postgresql-client` hung for 3+ hours on 2026-08-19).
- Migrations run, then the unit regression, then the real restore harness.
- The zero-skip gate logic and the run-status computation script.
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
WORKFLOW = ROOT / ".github" / "workflows" / "ops-proof-acceptance.yml"
UNIT_TEST_DIR = "tests/unit/system-remediation/sr-ops-proof-001"
RESTORE_TEST_PATH = (
    "tests/integration/system-remediation/sr-ops-proof-001/"
    "ops-proof-restore-acceptance.test.ts"
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


class OpsProofAcceptanceWorkflowTests(unittest.TestCase):
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
        self.assertIn("claude2/sr-ops-proof-001-recovery-20260911", push_block)
        self.assertIn(".github/workflows/ops-proof-acceptance.yml", push_block)
        self.assertIn("tools/ci/test_ops_proof_acceptance_workflow.py", push_block)
        self.assertIn("tools/system-remediation/ops-proof/**", push_block)
        self.assertIn(UNIT_TEST_DIR, push_block)

    def test_checks_out_candidate_sha_with_full_depth_and_verifies_integrity(
        self,
    ) -> None:
        self.assertIn("actions/checkout@v4", self.text)
        self.assertIn("fetch-depth: 0", self.text)
        self.assertIn("git rev-parse HEAD", self.text)
        self.assertIn("Checked-out HEAD", self.text)

    def test_configures_postgres_service_and_two_disposable_databases(self) -> None:
        self.assertIn("postgres:", self.text)
        self.assertIn("postgis/postgis:16-3.4", self.text)
        self.assertIn("pg_isready -U postgres", self.text)
        self.assertIn("POSTGRES_DB: drts_ops_proof_source", self.text)
        self.assertIn("DRTS_OPS_PROOF_SOURCE_DATABASE_URL:", self.text)
        self.assertIn("DRTS_OPS_PROOF_ISOLATED_DATABASE_URL:", self.text)
        self.assertIn("CREATE DATABASE drts_ops_proof_isolated", self.text)

    def test_never_apt_get_installs_postgres_client_per_documented_incident(
        self,
    ) -> None:
        self.assertNotIn("apt-get install", self.text)
        self.assertIn("preinstalled", self.text.lower())

    def test_runs_migrations_before_the_restore_harness(self) -> None:
        migrate_idx = self.text.find("pnpm db:migrate")
        harness_idx = self.text.find(RESTORE_TEST_PATH)
        self.assertNotEqual(migrate_idx, -1, "missing pnpm db:migrate")
        self.assertNotEqual(harness_idx, -1, "missing restore acceptance test path")
        self.assertLess(
            migrate_idx,
            harness_idx,
            "migrations must run before the restore acceptance harness",
        )

    def test_harness_runs_the_real_restore_acceptance_test(self) -> None:
        self.assertIn(RESTORE_TEST_PATH, self.text)
        self.assertIn(UNIT_TEST_DIR, self.text)
        self.assertIn("--outputFile.json=", self.text)

    def test_gate_requires_unit_regression_and_ungapped_restore_pass(self) -> None:
        gate_script = _extract_heredoc(self.text, "PY_GATE")
        self.assertIn("numPendingTests", gate_script)
        self.assertIn("numTotalTests", gate_script)
        self.assertIn("numPassedTests", gate_script)
        self.assertIn("was skipped", gate_script)

    def test_uploads_artifacts_always(self) -> None:
        upload_block = self.text.split("actions/upload-artifact@v4", 1)[1]
        step_prefix = self.text.split("actions/upload-artifact@v4", 1)[0].rsplit(
            "- name:", 1
        )[1]
        self.assertIn("if: always()", step_prefix)
        self.assertIn("execution-log.txt", upload_block)
        self.assertIn("unit-report.json", upload_block)
        self.assertIn("restore-report.json", upload_block)
        self.assertIn("run-status.json", upload_block)

    def test_run_status_heredoc_execution(self) -> None:
        script = _extract_heredoc(self.text, "PY_STATUS")
        with tempfile.TemporaryDirectory() as td:
            tmpdir = Path(td)
            artifacts_dir = tmpdir / ".artifacts" / "ops-proof-acceptance"
            artifacts_dir.mkdir(parents=True)
            status_file = artifacts_dir / "run-status.json"

            env = {
                **os.environ,
                "INSTALL_OUTCOME": "success",
                "MIGRATE_OUTCOME": "success",
                "UNIT_OUTCOME": "success",
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
            self.assertEqual(saved["capability"], "C122")

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
