"""Contract for .github/workflows/tenant-uat-acceptance.yml.

SR-QA-TENANT-001's required acceptance evidence
(tenant_daily_work_quota_and_integrations_write_readback,
tenant_role_and_cross_tenant_negative_evidence) can only be produced by an
environment that runs the real, compiled full AppModule HTTP server against a
real, migrated PostgreSQL with real, durable-state-valid tenant sessions --
none of which this project's worker VM is allowed to start (no product dev
server, no Docker/Postgres infra). This dedicated workflow is that
environment; it does not run on every PR, so nothing in ci.yml/ci-integ.yml
exercises it. These tests are what would catch a change that silently drops
the immutable-candidate check, the zero-skip gate, or the always()-evidence
upload.

Most assertions are plain text/regex on purpose, matching
test_host_acceptance_workflow.py and test_tenant_binding_acceptance_workflow.py
in this directory: this file has no YAML-parsing dependency to keep intact.
The gate/run-status computations are different: they are extracted from their
`python3 - <<'PY_...'` heredocs and actually executed against crafted
fixtures, because regex-checking for the presence of an outcome variable in
the script text does not catch the script *ignoring* that value when
computing status.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "tenant-uat-acceptance.yml"
SEED_SCRIPT = (
    "tests/e2e/system-remediation/sr-qa-tenant-001/appmodule-acceptance-seed.ts"
)


def _extract_step_run_block(
    text: str, step_name_marker: str, heredoc_marker: str
) -> str:
    """Pull the body of the `python3 - <<'MARKER' ... MARKER` heredoc that
    follows the given step-name marker, dedented into standalone Python
    source."""
    tail = text.split(step_name_marker, 1)[1]
    pattern = re.compile(
        r"<<'"
        + re.escape(heredoc_marker)
        + r"'\n(.*?)\n[ \t]*"
        + re.escape(heredoc_marker)
        + r"\n",
        re.DOTALL,
    )
    match = pattern.search(tail)
    if not match:
        raise AssertionError(
            f"could not find {heredoc_marker} heredoc after step {step_name_marker!r}"
        )
    return textwrap.dedent(match.group(1))


class TenantUatAcceptanceWorkflowStructureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(WORKFLOW.exists(), f"missing {WORKFLOW}")
        self.text = WORKFLOW.read_text(encoding="utf-8")

    def test_is_manually_dispatchable_with_an_optional_candidate_sha_input(
        self,
    ) -> None:
        self.assertIn("workflow_dispatch:", self.text)
        self.assertIn("candidate_sha:", self.text)

    def test_has_a_push_trigger_scoped_to_this_branch_and_these_owned_paths(
        self,
    ) -> None:
        on_block = self.text.split("permissions:", 1)[0]
        self.assertIn("push:", on_block)
        push_block = on_block.split("push:", 1)[1]
        self.assertIn("claude2/sr-qa-tenant-001-acceptance-runner", push_block)
        self.assertIn("claude/sr-qa-tenant-001-acceptance-runner", push_block)
        self.assertIn(".github/workflows/tenant-uat-acceptance.yml", push_block)
        self.assertIn(
            "tools/ci/test_tenant_uat_acceptance_workflow.py", push_block
        )
        self.assertIn(
            "tests/e2e/system-remediation/sr-qa-tenant-001/**", push_block
        )
        self.assertIn(
            "tests/unit/system-remediation/sr-qa-tenant-001/**", push_block
        )
        self.assertIn(
            "docs/04-uat/system-remediation-20260906/SR-QA-TENANT-001.md",
            push_block,
        )

    def test_candidate_sha_falls_back_to_github_sha_everywhere_it_is_used(
        self,
    ) -> None:
        fallback = "github.event.inputs.candidate_sha || github.sha"
        count = self.text.count(fallback)
        self.assertGreaterEqual(
            count,
            4,
            "expected the candidate_sha fallback on at least: checkout ref, "
            "concurrency group, CANDIDATE_SHA env, and artifact name",
        )

    def test_verifies_the_checkout_did_not_move_off_the_candidate(self) -> None:
        self.assertIn("git rev-parse HEAD", self.text)
        self.assertIn('"$resolved" != "$expected"', self.text)

    def test_declares_a_timeout(self) -> None:
        self.assertIn("timeout-minutes:", self.text)

    def test_runs_against_a_dedicated_migrated_postgres_service(self) -> None:
        self.assertIn("postgres:", self.text)
        self.assertIn("postgis/postgis", self.text)
        self.assertIn("pnpm db:migrate", self.text)

    def test_builds_and_starts_the_real_compiled_api_server(self) -> None:
        self.assertIn("pnpm --filter @drts/api... build", self.text)
        self.assertIn("node dist/main.js", self.text)
        self.assertIn("/api/health", self.text)

    def test_typescript_runner_resolves_from_its_declaring_workspace(self) -> None:
        package = json.loads((ROOT / "apps/api/package.json").read_text())
        self.assertIn("tsx", package["devDependencies"])
        self.assertEqual(self.text.count("./apps/api/node_modules/.bin/tsx "), 2)
        self.assertNotIn("pnpm exec tsx ", self.text)

    def test_seed_log_preserves_action_masking_without_archiving_the_token(self) -> None:
        seed_block = self.text.split("id: seed", 1)[1].split("      - name:", 1)[0]
        match = re.search(r"awk '([^']+)'", seed_block)
        self.assertIsNotNone(match)
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / ".artifacts/tenant-uat-acceptance/execution-log.txt"
            log.parent.mkdir(parents=True)
            log.write_text("Earlier migration evidence\n")
            result = subprocess.run(
                ["awk", match.group(1)], cwd=directory, text=True, capture_output=True,
                input="::add-mask::synthetic-fixture-token\nSeeded DRTS_UAT_TOKEN_A\n",
                check=True,
            )
            self.assertIn("::add-mask::synthetic-fixture-token", result.stdout)
            self.assertEqual(log.read_text(), "Earlier migration evidence\nSeeded DRTS_UAT_TOKEN_A\n")

    def test_sets_the_uat_harness_environment_contract(self) -> None:
        # Matches the harness's own required() checks in the ported specs:
        # DRTS_UAT_ENV must be local|sandbox, and DRTS_UAT_API_URL is set.
        self.assertIn("DRTS_UAT_ENV: sandbox", self.text)
        self.assertIn("DRTS_UAT_API_URL:", self.text)

    def test_seeds_disposable_tenants_through_the_authoritative_seed_script(
        self,
    ) -> None:
        self.assertIn(SEED_SCRIPT, self.text)
        seed_index = self.text.index(SEED_SCRIPT)
        start_api_index = self.text.index("node dist/main.js")
        harness_index = self.text.index(
            "Run tenant HTTP acceptance specs (real server, real DB, real sessions)"
        )
        # Seed the durable users before the HTTP process loads its caches.
        self.assertLess(seed_index, start_api_index)
        self.assertLess(seed_index, harness_index)

    def test_runs_both_the_e2e_specs_and_the_unit_regression_suite(self) -> None:
        self.assertIn(
            "tests/e2e/system-remediation/sr-qa-tenant-001", self.text
        )
        self.assertIn(
            "tests/unit/system-remediation/sr-qa-tenant-001/", self.text
        )
        self.assertIn("playwright.system-remediation.config.ts", self.text)

    def test_stops_the_background_server_unconditionally(self) -> None:
        stop_block = self.text.split("Stop background API server", 1)[1][:400]
        self.assertIn("if: always()", stop_block)
        self.assertIn("api-server.pid", stop_block)

    def test_gates_on_zero_skips_for_both_playwright_and_vitest(self) -> None:
        gate_block = self.text.split("Gate on zero skips", 1)[1][:6000]
        self.assertIn("sr-qa-tenant-001", gate_block)
        self.assertIn("skipped", gate_block)
        self.assertIn("passed != total", gate_block)
        self.assertIn("numTotalTests", gate_block)
        self.assertIn("numPendingTests", gate_block)
        self.assertIn("or unit_pending", gate_block)

    def test_uploads_log_reports_and_run_status_even_on_failure(self) -> None:
        upload_block = self.text.split("upload-artifact@v4", 1)[1]
        preceding = self.text.split("upload-artifact@v4", 1)[0]
        step_start = preceding.rfind("- name:")
        step_text = preceding[step_start:] + upload_block[:600]
        self.assertIn("if: always()", step_text)
        self.assertIn(
            ".artifacts/tenant-uat-acceptance/execution-log.txt", step_text
        )
        self.assertIn(
            ".artifacts/tenant-uat-acceptance/unit-test-report.json", step_text
        )
        self.assertIn(
            ".artifacts/tenant-uat-acceptance/run-status.json", step_text
        )
        self.assertIn("test-results/", step_text)

    def test_records_an_always_run_status_that_never_fabricates_success(
        self,
    ) -> None:
        status_block = self.text.split("Record run status", 1)[1][:4000]
        self.assertIn("if: always()", status_block)
        self.assertIn("steps.harness_e2e.outcome", status_block)
        self.assertIn("steps.harness_unit.outcome", status_block)
        self.assertIn("steps.gate.outcome", status_block)
        self.assertIn("steps.seed.outcome", status_block)
        self.assertIn("CANDIDATE_SHA", status_block)
        self.assertIn("run-status.json", status_block)
        self.assertIn('"not_run"', status_block)
        self.assertIn('"failed"', status_block)
        self.assertIn('"passed"', status_block)

    def test_actual_smtp_receiver_and_restart_are_required(self) -> None:
        self.assertIn("image: axllent/mailpit:v1.29.2", self.text)
        self.assertIn("MAILPIT_SMTP_PORT:", self.text)
        self.assertIn("NOTIFICATION_OUTBOX_DIRECTORY:", self.text)
        self.assertIn("DRTS_UAT_MAILPIT_URL:", self.text)
        self.assertIn("restart-readback.ts", self.text)
        self.assertIn('outcomes["RESTART_READBACK_OUTCOME"] == "success"', self.text)
        self.assertIn("restart-report.json", self.text)

    def test_does_not_touch_the_locked_candidate_or_product_source(self) -> None:
        for token in ("git commit", "git push", "git add"):
            self.assertNotIn(token, self.text)


class RunStatusScriptBehaviorTests(unittest.TestCase):
    """Executes the embedded `Record run status` heredoc for real, in a
    scratch directory, instead of only checking for token presence -- the
    exact false-pass shape a prior review round found in a sibling workflow's
    run-status script (gate/report looked clean while the harness step
    itself had failed or been cancelled)."""

    def setUp(self) -> None:
        self.assertTrue(WORKFLOW.exists(), f"missing {WORKFLOW}")
        self.script = _extract_step_run_block(
            WORKFLOW.read_text(encoding="utf-8"),
            "Record run status",
            "PY_STATUS",
        )
        self.assertIn("status_path.write_text", self.script)

    def _run(
        self,
        *,
        install: str = "success",
        migrate: str = "success",
        build_api: str = "success",
        start_api: str = "success",
        seed: str = "success",
        harness_e2e: str = "success",
        harness_unit: str = "success",
        gate: str = "success",
        restart_api: str = "success",
        restart_readback: str = "success",
    ) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            script_path = Path(tmp) / "run_status.py"
            script_path.write_text(self.script)
            env = {
                "INSTALL_OUTCOME": install,
                "MIGRATE_OUTCOME": migrate,
                "BUILD_API_OUTCOME": build_api,
                "START_API_OUTCOME": start_api,
                "SEED_OUTCOME": seed,
                "HARNESS_E2E_OUTCOME": harness_e2e,
                "HARNESS_UNIT_OUTCOME": harness_unit,
                "GATE_OUTCOME": gate,
                "RESTART_API_OUTCOME": restart_api,
                "RESTART_READBACK_OUTCOME": restart_readback,
                "CANDIDATE_SHA": "c" * 40,
                "WORKFLOW_SHA": "f" * 40,
                "PATH": "/usr/bin:/bin",
            }
            result = subprocess.run(
                [sys.executable, str(script_path)],
                cwd=tmp,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(
                result.returncode,
                0,
                f"run-status script itself failed: {result.stderr}",
            )
            status_path = Path(tmp, ".artifacts", "tenant-uat-acceptance", "run-status.json")
            self.assertTrue(status_path.exists(), "run-status.json was not written")
            return json.loads(status_path.read_text())

    def test_genuine_full_success_is_passed(self) -> None:
        status = self._run()
        self.assertEqual(status["status"], "passed")
        self.assertEqual(status["candidate_sha"], "c" * 40)
        self.assertEqual(status["workflow_sha"], "f" * 40)

    def test_failed_e2e_harness_is_not_passed(self) -> None:
        status = self._run(harness_e2e="failure")
        self.assertEqual(status["status"], "failed")

    def test_cancelled_unit_harness_is_not_passed(self) -> None:
        status = self._run(harness_unit="cancelled")
        self.assertEqual(status["status"], "failed")

    def test_gate_failure_is_not_passed(self) -> None:
        status = self._run(gate="failure")
        self.assertEqual(status["status"], "failed")

    def test_failed_restart_is_not_passed(self) -> None:
        self.assertEqual(self._run(restart_api="failure")["status"], "failed")

    def test_failed_restart_readback_is_not_passed(self) -> None:
        self.assertEqual(self._run(restart_readback="failure")["status"], "failed")

    def test_seed_failure_is_not_run(self) -> None:
        status = self._run(
            seed="failure",
            harness_e2e="unknown",
            harness_unit="unknown",
            gate="unknown",
        )
        self.assertEqual(status["status"], "not_run")

    def test_install_failure_is_not_run(self) -> None:
        status = self._run(
            install="failure",
            migrate="unknown",
            build_api="unknown",
            start_api="unknown",
            seed="unknown",
            harness_e2e="unknown",
            harness_unit="unknown",
            gate="unknown",
        )
        self.assertEqual(status["status"], "not_run")


class FullMatrixGateBehaviorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.script = _extract_step_run_block(WORKFLOW.read_text(), "Gate on zero skips", "PY_GATE")

    def run_gate(self, *, missing_file: str | None = None, restart_status: str = "passed", missing_restart: bool = False, skipped: bool = False):
        files = ["approval-rules.spec.ts", "cost-center.spec.ts", "passenger-address.spec.ts", "sla.spec.ts", "users.spec.ts", "directory-durability.spec.ts", "governance.spec.ts", "invitation-mail.spec.ts"]
        specs = []
        for name in files:
            if name == missing_file:
                continue
            for unused in range(3 if name == "governance.spec.ts" else 1):
                specs.append({"file": "tests/e2e/system-remediation/sr-qa-tenant-001/" + name, "tests": [{"results": [{"status": "skipped" if skipped else "passed"}]}]})
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "test-results").mkdir()
            (root / "test-results/system-remediation-report.json").write_text(json.dumps({"suites": [{"specs": specs}]}))
            artifact = root / ".artifacts/tenant-uat-acceptance"
            artifact.mkdir(parents=True)
            (artifact / "unit-test-report.json").write_text(json.dumps({"numTotalTests": 24, "numPassedTests": 24, "numPendingTests": 0, "success": True}))
            if not missing_restart:
                (artifact / "restart-report.json").write_text(json.dumps({"status": restart_status, "verified": 12, "candidate_sha": "c" * 40, "tables": [f"table_{i}" for i in range(12)]}))
            return subprocess.run([sys.executable, "-c", self.script], cwd=root, capture_output=True, text=True)

    def test_complete_matrix_can_pass(self):
        result = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_unit_pass_does_not_hide_missing_live_governance(self):
        self.assertNotEqual(self.run_gate(missing_file="governance.spec.ts").returncode, 0)

    def test_unit_pass_does_not_hide_missing_mail_delivery(self):
        self.assertNotEqual(self.run_gate(missing_file="invitation-mail.spec.ts").returncode, 0)

    def test_missing_restart_evidence_fails(self):
        self.assertNotEqual(self.run_gate(missing_restart=True).returncode, 0)

    def test_failed_restart_evidence_fails(self):
        self.assertNotEqual(self.run_gate(restart_status="failed").returncode, 0)

    def test_skipped_live_matrix_fails(self):
        self.assertNotEqual(self.run_gate(skipped=True).returncode, 0)


if __name__ == "__main__":
    unittest.main()
