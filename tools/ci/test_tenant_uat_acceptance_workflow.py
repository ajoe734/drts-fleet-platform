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
        self.assertIn("gemini/sr-partner-notify-qa-20260917", push_block)
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
        self.assertIn("gemini2/sr-c115-harness-20260913", push_block)
        self.assertIn("gemini/sr-partner-notify-qa-20260917", push_block)
        self.assertIn(
            "tests/e2e/system-remediation/sr-qa-webhook-001/**", push_block
        )
        self.assertIn(
            "tests/unit/system-remediation/sr-qa-webhook-001/**", push_block
        )
        self.assertIn(
            "docs/04-uat/system-remediation-20260906/SR-QA-WEBHOOK-001.md",
            push_block,
        )
        self.assertIn("tests/e2e/system-remediation/sr-partner-notify-qa-20260917/**", push_block)
        self.assertIn("tests/unit/system-remediation/sr-partner-notify-qa-20260917/**", push_block)
        self.assertIn("docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-QA-20260917.md", push_block)
        self.assertIn("docs/02-architecture/partner-notification-20260917/04_sources.md", push_block)
        self.assertIn(
            "tests/e2e/system-remediation/sr-partner-notify-qa-20260917/**", push_block
        )
        self.assertIn(
            "tests/unit/system-remediation/sr-partner-notify-qa-20260917/**", push_block
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
        self.assertEqual(self.text.count("./apps/api/node_modules/.bin/tsx "), 4)
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


    def test_runs_partner_notify_specs_and_unit_regression_suite(self) -> None:
        self.assertIn("tests/e2e/system-remediation/sr-partner-notify-qa-20260917", self.text)
        self.assertIn("tests/unit/system-remediation/sr-partner-notify-qa-20260917/", self.text)

    def test_stops_the_background_server_unconditionally(self) -> None:
        stop_block = self.text.split("Stop background API server", 1)[1][:400]
        self.assertIn("if: always()", stop_block)
        self.assertIn("api-server admin-web referral-web", stop_block)

    def test_gates_on_zero_skips_for_both_playwright_and_vitest(self) -> None:
        gate_block = _extract_step_run_block(self.text, "Gate on zero skips", "PY_GATE")
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
        step_text = preceding[step_start:] + upload_block
        self.assertIn("if: always()", step_text)
        self.assertIn(
            ".artifacts/tenant-uat-acceptance/execution-log.txt", step_text
        )
        self.assertIn(
            ".artifacts/tenant-uat-acceptance/unit-test-report.json", step_text
        )
        self.assertIn(
            ".artifacts/tenant-uat-acceptance/webhook-unit-report.json", step_text
        )
        self.assertIn(
            ".artifacts/tenant-uat-acceptance/c111-c115-capability-report.json", step_text
        )
        self.assertIn(
            ".artifacts/tenant-uat-acceptance/run-status.json", step_text
        )
        self.assertIn("test-results/", step_text)

    def test_records_an_always_run_status_that_never_fabricates_success(
        self,
    ) -> None:
        status_block = self.text.split("Record run status", 1)[1]
        self.assertIn("if: always()", status_block)
        self.assertIn("steps.harness_e2e.outcome", status_block)
        self.assertIn("steps.harness_unit.outcome", status_block)
        self.assertIn("steps.webhook_e2e.outcome", status_block)
        self.assertIn("steps.webhook_unit.outcome", status_block)
        self.assertIn("steps.partner_notify_e2e.outcome", status_block)
        self.assertIn("steps.partner_notify_unit.outcome", status_block)
        self.assertIn("steps.c113_c115_acceptance.outcome", status_block)
        self.assertIn("steps.gate.outcome", status_block)
        self.assertIn("steps.seed.outcome", status_block)
        self.assertIn("steps.c115_restart_readback.outcome", status_block)
        self.assertIn("CANDIDATE_SHA", status_block)
        self.assertIn("run-status.json", status_block)
        self.assertIn('"not_run"', status_block)
        self.assertIn('"failed"', status_block)
        self.assertIn('"passed"', status_block)

    def test_retraction_of_phantom_webhook_uat_acceptance_workflow(self) -> None:
        self.assertFalse((ROOT / ".github/workflows/webhook-uat-acceptance.yml").exists())

    def test_c111_to_c115_capabilities_validated_in_gate(self) -> None:
        gate_block = _extract_step_run_block(self.text, "Gate on zero skips", "PY_GATE")
        for cap in ("C111", "C112", "C113", "C114", "C115"):
            self.assertIn(cap, gate_block)

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

    def test_webhook_e2e_preserves_tenant_playwright_report(self) -> None:
        webhook_e2e_block = self.text.split("id: webhook_e2e", 1)[1].split("      - name:", 1)[0]
        self.assertIn("PLAYWRIGHT_JSON_OUTPUT_FILE:", webhook_e2e_block)
        self.assertIn("test-results/webhook-e2e-report.json", webhook_e2e_block)
        self.assertIn("--output test-results/webhook-artifacts", webhook_e2e_block)

    def test_hosted_tsx_acceptance_runners_use_api_tsconfig(self) -> None:
        top_env = self.text.split("jobs:", 1)[1].split("steps:", 1)[0]
        self.assertNotIn("TSX_TSCONFIG_PATH", top_env)
        seed_step = self.text.split("id: seed", 1)[1].split("      - name:", 1)[0]
        self.assertNotIn("TSX_TSCONFIG_PATH", seed_step)
        c113_step = self.text.split("id: c113_c115_acceptance", 1)[1].split("      - name:", 1)[0]
        self.assertIn("TSX_TSCONFIG_PATH: apps/api/tsconfig.json", c113_step)
        self.assertIn("--tsconfig apps/api/tsconfig.json", c113_step)
        c115_step = self.text.split("id: c115_restart_readback", 1)[1].split("      - name:", 1)[0]
        self.assertIn("TSX_TSCONFIG_PATH: apps/api/tsconfig.json", c115_step)
        self.assertIn("--tsconfig apps/api/tsconfig.json", c115_step)


class HostedBoundaryTests(unittest.TestCase):
    def test_loopback_flag_is_limited_to_hosted_api_processes(self):
        text = WORKFLOW.read_text()
        top_env = text.split("jobs:", 1)[1].split("steps:", 1)[0]
        self.assertNotIn("DRTS_ALLOW_LOCAL_WEBHOOKS", top_env)
        self.assertEqual(text.count('DRTS_ALLOW_LOCAL_WEBHOOKS: "true"'), 2)
        for step in ("start_api", "restart_api"):
            block = text.split("id: " + step + "\n", 1)[1].split("      - name:", 1)[0]
            self.assertIn('DRTS_ALLOW_LOCAL_WEBHOOKS: "true"', block)

    def test_reports_are_independent_and_every_command_uses_provenance_runner(self):
        text = WORKFLOW.read_text()
        self.assertEqual(text.count("run-reported.py "), 6)
        webhook = text.split("id: webhook_e2e", 1)[1].split("      - name:", 1)[0]
        self.assertNotIn("sr-partner-notify-qa-20260917/partner-notification-uat.spec.ts", webhook)
        self.assertEqual(text.count("--reporter=list,json"), 3)
        self.assertIn("playwright install --with-deps chromium", text)
        self.assertNotIn("--trace=off", text)
        self.assertNotIn("sleep 5 #", text)
        self.assertIn("admin-web.log", text.split("upload-artifact@v4", 1)[1])
        self.assertIn("referral-web.log", text.split("upload-artifact@v4", 1)[1])


class ReportProvenanceBehaviorTests(unittest.TestCase):
    def run_report(self, *, write=True, command_exit=0, candidate=None, metadata=None):
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        runner = ROOT / "tests/unit/system-remediation/sr-partner-notify-qa-20260917/run-reported.py"
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / "report.json"
            report.write_text('{"stale": true}')
            source = "import json, pathlib, sys; "
            if write:
                data = {"success": True, "metadata": metadata or {}}
                source += f"pathlib.Path({str(report)!r}).write_text({json.dumps(data)!r}); "
            source += f"sys.exit({command_exit})"
            result = subprocess.run([sys.executable, str(runner), str(report), sys.executable, "-c", source],
                                    cwd=ROOT, env={"CANDIDATE_SHA": candidate or sha, "WORKFLOW_SHA": sha, "PATH": "/usr/bin:/bin"},
                                    capture_output=True, text=True)
            return result, json.loads(report.read_text()) if report.exists() else None, sha

    def test_fresh_report_gets_real_checkout_identity(self):
        result, report, sha = self.run_report()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(report["candidate_sha"], sha)
        self.assertEqual(report["execution"], {"candidate_sha": sha, "workflow_sha": sha, "exit_code": 0})
        self.assertNotIn("stale", report)

    def test_failed_command_is_not_relabelled_as_passed(self):
        result, report, _ = self.run_report(command_exit=3)
        self.assertEqual(result.returncode, 3)
        self.assertEqual(report["execution"]["exit_code"], 3)

    def test_old_report_cannot_survive_a_command_with_no_report(self):
        result, report, _ = self.run_report(write=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(report)

    def test_wrong_checkout_is_rejected_before_command(self):
        result, report, _ = self.run_report(candidate="d" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(report, {"stale": True})

    def test_conflicting_embedded_identity_is_not_overwritten(self):
        result, report, _ = self.run_report(metadata={"candidate_sha": "d" * 40})
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("execution", report)


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
        build_ui: str = "success",
        start_ui: str = "success",
        install_browser: str = "success",
        start_api: str = "success",
        seed: str = "success",
        harness_e2e: str = "success",
        harness_unit: str = "success",
        webhook_e2e: str = "success",
        webhook_unit: str = "success",
        partner_notify_e2e: str = "success",
        partner_notify_unit: str = "success",
        c113_c115_acceptance: str = "success",
        gate: str = "success",
        restart_api: str = "success",
        restart_readback: str = "success",
        c115_restart_readback: str = "success",
    ) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            script_path = Path(tmp) / "run_status.py"
            script_path.write_text(self.script)
            env = {
                "INSTALL_OUTCOME": install,
                "MIGRATE_OUTCOME": migrate,
                "BUILD_API_OUTCOME": build_api,
                "BUILD_UI_OUTCOME": build_ui,
                "START_UI_OUTCOME": start_ui,
                "INSTALL_BROWSER_OUTCOME": install_browser,
                "START_API_OUTCOME": start_api,
                "SEED_OUTCOME": seed,
                "HARNESS_E2E_OUTCOME": harness_e2e,
                "HARNESS_UNIT_OUTCOME": harness_unit,
                "WEBHOOK_E2E_OUTCOME": webhook_e2e,
                "WEBHOOK_UNIT_OUTCOME": webhook_unit,
                "PARTNER_NOTIFY_E2E_OUTCOME": partner_notify_e2e,
                "PARTNER_NOTIFY_UNIT_OUTCOME": partner_notify_unit,
                "C113_C115_ACCEPTANCE_OUTCOME": c113_c115_acceptance,
                "GATE_OUTCOME": gate,
                "RESTART_API_OUTCOME": restart_api,
                "RESTART_READBACK_OUTCOME": restart_readback,
                "C115_RESTART_READBACK_OUTCOME": c115_restart_readback,
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

    def test_failed_ui_setup_is_not_run(self):
        for key in ("install_browser", "build_ui", "start_ui"):
            with self.subTest(step=key):
                self.assertEqual(self._run(**{key: "failure"})["status"], "not_run")

    def test_failed_e2e_harness_is_not_passed(self) -> None:
        status = self._run(harness_e2e="failure")
        self.assertEqual(status["status"], "failed")

    def test_cancelled_unit_harness_is_not_passed(self) -> None:
        status = self._run(harness_unit="cancelled")
        self.assertEqual(status["status"], "failed")

    def test_failed_webhook_e2e_is_not_passed(self) -> None:
        status = self._run(webhook_e2e="failure")
        self.assertEqual(status["status"], "failed")


    def test_failed_partner_notify_e2e_is_not_passed(self) -> None:
        status = self._run(partner_notify_e2e="failure")
        self.assertEqual(status["status"], "failed")

    def test_failed_partner_notify_unit_is_not_passed(self) -> None:
        status = self._run(partner_notify_unit="failure")
        self.assertEqual(status["status"], "failed")

    def test_failed_c113_c115_acceptance_is_not_passed(self) -> None:
        status = self._run(c113_c115_acceptance="failure")
        self.assertEqual(status["status"], "failed")

    def test_failed_c115_restart_readback_is_not_passed(self) -> None:
        status = self._run(c115_restart_readback="failure")
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


MANIFEST_PATH = "tests/unit/system-remediation/sr-partner-notify-qa-20260917/required-cases.json"
ARTIFACT = ".artifacts/tenant-uat-acceptance/"
TENANT_UNIT = ARTIFACT + "unit-test-report.json"
PARTNER_UNIT = ARTIFACT + "partner-notify-unit-report.json"
WEBHOOK_UNIT = ARTIFACT + "webhook-unit-report.json"
TENANT_E2E = "test-results/system-remediation-report.json"
PARTNER_E2E = "test-results/partner-notify-e2e-report.json"
WEBHOOK_E2E = "test-results/webhook-e2e-report.json"
RESTART = ARTIFACT + "restart-report.json"
CAPABILITIES = ARTIFACT + "c111-c115-capability-report.json"
SHA = "c" * 40


class FullMatrixGateBehaviorTests(unittest.TestCase):
    """Execute the actual workflow gate; fixtures are synthetic reports only.

    The committed manifest lists product cases, including SD14/NAV cases still
    requiring implementation. A synthetic positive control is NOT runtime
    evidence. Mutations remove/skip/misidentify those reports and must fail.
    """

    def setUp(self):
        self.script = _extract_step_run_block(WORKFLOW.read_text(), "Gate on zero skips", "PY_GATE")
        self.manifest = json.loads((ROOT / MANIFEST_PATH).read_text())

    def reports(self):
        def provenance(data):
            return {**data, "candidate_sha": SHA,
                    "execution": {"candidate_sha": SHA, "workflow_sha": SHA, "exit_code": 0}}

        def unit(group):
            suites = [{"name": "tests/unit/system-remediation/" + path, "status": "passed",
                       "assertionResults": [{"fullName": name, "status": "passed"} for name in names]}
                      for path, names in self.manifest[group].items()]
            count = sum(len(suite["assertionResults"]) for suite in suites)
            return provenance({"testResults": suites, "numTotalTests": count,
                               "numPassedTests": count, "numPendingTests": 0, "success": True})

        def e2e(group):
            specs = [{"file": path, "title": name,
                      "tests": [{"expectedStatus": "passed", "results": [{"status": "passed"}]}]}
                     for path, names in self.manifest[group].items() for name in names]
            return provenance({"suites": [{"specs": specs}]})

        return {
            TENANT_UNIT: unit("tenant_unit"), WEBHOOK_UNIT: unit("webhook_unit"),
            PARTNER_UNIT: unit("partner_unit"), TENANT_E2E: e2e("tenant_e2e"),
            WEBHOOK_E2E: e2e("webhook_e2e"), PARTNER_E2E: e2e("partner_e2e"),
            RESTART: {"candidate_sha": SHA, "status": "passed", "verified": 12},
            CAPABILITIES: {"candidate_sha": SHA, "status": "passed", "capabilities": {
                key: {"status": "passed", "verified": ["synthetic gate fixture, not product evidence"]}
                for key in ("C111", "C112", "C113", "C114", "C115")}},
        }

    def run_gate(self, mutate=None, *, env_sha=SHA):
        reports = self.reports()
        if mutate:
            mutate(reports)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name, data in {MANIFEST_PATH: self.manifest, **reports}.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(data))
            return subprocess.run([sys.executable, "-c", self.script], cwd=root,
                                  env={"CANDIDATE_SHA": env_sha, "WORKFLOW_SHA": SHA, "PATH": "/usr/bin:/bin"},
                                  capture_output=True, text=True)

    def reject(self, mutate, reason=None):
        result = self.run_gate(mutate)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        if reason:
            self.assertIn(reason, result.stderr)

    def test_complete_synthetic_matrix_can_pass(self):
        result = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_no_expected_candidate_fails(self):
        self.assertNotEqual(self.run_gate(env_sha="").returncode, 0)

    def test_every_missing_report_fails_independently(self):
        for path in self.reports():
            with self.subTest(path=path):
                self.reject(lambda reports: reports.pop(path))

    def test_wrong_candidate_for_every_report_fails(self):
        for path in self.reports():
            with self.subTest(path=path):
                self.reject(lambda reports: reports[path].update(candidate_sha="d" * 40), "candidate SHA mismatch")

    def test_wrong_metadata_sha_fails(self):
        for path in (PARTNER_E2E, WEBHOOK_E2E, TENANT_E2E, TENANT_UNIT):
            for key in ("candidate_sha", "candidateSha"):
                with self.subTest(path=path, key=key):
                    self.reject(lambda reports: reports[path].update(config={"metadata": {key: "d" * 40}}), "metadata candidate SHA mismatch")

    def test_stale_or_failed_execution_cannot_pass(self):
        for path in (TENANT_E2E, WEBHOOK_E2E, PARTNER_E2E, TENANT_UNIT, WEBHOOK_UNIT, PARTNER_UNIT):
            for mutation in ({}, {"candidate_sha": "d" * 40, "workflow_sha": SHA, "exit_code": 0},
                             {"candidate_sha": SHA, "workflow_sha": "f" * 40, "exit_code": 0},
                             {"candidate_sha": SHA, "workflow_sha": SHA, "exit_code": 1}):
                with self.subTest(path=path, execution=mutation):
                    self.reject(lambda reports: reports[path].update(execution=mutation), "report execution")

    def test_missing_each_required_partner_case_fails(self):
        for index in range(24):
            with self.subTest(case=index + 201):
                self.reject(lambda reports: reports[PARTNER_E2E]["suites"][0]["specs"].pop(index), "missing required cases")

    def test_c201_alone_or_unnamed_case_cannot_replace_matrix(self):
        def only_one(reports):
            reports[PARTNER_E2E]["suites"][0]["specs"] = reports[PARTNER_E2E]["suites"][0]["specs"][:1]
        self.reject(only_one, "missing required cases")
        def unnamed(reports):
            only_one(reports)
            reports[PARTNER_E2E]["suites"][0]["specs"][0]["title"] = ""
        self.reject(unnamed, "unnamed")

    def test_two_partner_cases_cannot_replace_webhook_evidence(self):
        def mutate(reports):
            reports[WEBHOOK_E2E]["suites"] = [{"specs": reports[PARTNER_E2E]["suites"][0]["specs"][:2]}]
        self.reject(mutate, "webhook_e2e: missing required cases")

    def test_empty_skipped_failed_expected_failure_or_flaky_e2e_fails(self):
        for path in (TENANT_E2E, WEBHOOK_E2E, PARTNER_E2E):
            mutations = [[], [{"results": []}], [{"results": [{"status": "skipped"}]}],
                         [{"results": [{"status": "failed"}]}],
                         [{"expectedStatus": "failed", "results": [{"status": "passed"}]}],
                         [{"results": [{"status": "failed"}, {"status": "passed"}]}]]
            for tests in mutations:
                with self.subTest(path=path, tests=tests):
                    self.reject(lambda reports: reports[path]["suites"][0]["specs"][0].update(tests=tests))

    def test_runner_error_cannot_be_hidden_by_passing_cases(self):
        self.reject(lambda reports: reports[PARTNER_E2E].update(errors=[{"message": "teardown failed"}]), "runner errors")

    def test_every_missing_tenant_case_fails(self):
        for index in range(10):
            with self.subTest(index=index):
                self.reject(lambda reports: reports[TENANT_E2E]["suites"][0]["specs"].pop(index), "missing required cases")

    def test_missing_suite_or_assertion_is_not_replaced_by_aggregate_count(self):
        for path in (TENANT_UNIT, PARTNER_UNIT, WEBHOOK_UNIT):
            for index in range(len(self.reports()[path]["testResults"])):
                with self.subTest(path=path, suite=index):
                    self.reject(lambda reports: reports[path]["testResults"].pop(index))
                    self.reject(lambda reports: reports[path]["testResults"][index]["assertionResults"].pop())

    def test_all_three_pg_suites_have_independent_required_cases(self):
        pg = {path: names for path, names in self.manifest["tenant_unit"].items() if ".postgres.test.ts" in path}
        self.assertEqual({Path(path).name: len(names) for path, names in pg.items()}, {
            "notification-sequence.postgres.test.ts": 7, "transport.postgres.test.ts": 7,
            "notification-ui.postgres.test.ts": 7})
        for key, names in pg.items():
            for case in names:
                def mutate(reports):
                    suite = next(s for s in reports[TENANT_UNIT]["testResults"] if s["name"].endswith(key))
                    assertion = next(a for a in suite["assertionResults"] if a["fullName"] == case)
                    # Keep aggregate counts green and replace just the case identity.
                    assertion["fullName"] = "unrelated passing case cannot replace required PG coverage"
                with self.subTest(suite=key, case=case):
                    self.reject(mutate, "missing required cases")

    def test_skipped_or_failed_assertions_cannot_hide_behind_success(self):
        for path in (TENANT_UNIT, PARTNER_UNIT, WEBHOOK_UNIT):
            for status in ("skipped", "pending", "failed"):
                with self.subTest(path=path, status=status):
                    self.reject(lambda reports: reports[path]["testResults"][0]["assertionResults"][0].update(status=status))

    def test_empty_or_spoofed_suite_is_not_evidence(self):
        self.reject(lambda reports: reports[TENANT_UNIT]["testResults"][0].update(assertionResults=[]), "empty")
        self.reject(lambda reports: reports[TENANT_UNIT]["testResults"][0].update(name="unrelated/" + Path(reports[TENANT_UNIT]["testResults"][0]["name"]).name), "missing required cases")

    def test_missing_case_with_consistent_aggregate_still_fails(self):
        def mutate(reports):
            suite = reports[TENANT_UNIT]["testResults"][0]
            suite["assertionResults"].pop()
            reports[TENANT_UNIT]["numTotalTests"] -= 1
            reports[TENANT_UNIT]["numPassedTests"] -= 1
        self.reject(mutate, "missing required cases")

    def test_existing_unit_success_and_pending_gates_remain_independent(self):
        for path in (TENANT_UNIT, WEBHOOK_UNIT, PARTNER_UNIT):
            self.reject(lambda reports: reports[path].update(success=False))
            self.reject(lambda reports: reports[path].update(numPendingTests=1))

    def test_restart_and_c111_c115_remain_independent(self):
        self.reject(lambda reports: reports[RESTART].update(status="failed"))
        self.reject(lambda reports: reports[RESTART].update(verified=11))
        self.reject(lambda reports: reports[CAPABILITIES].update(status="failed"))
        for key in ("C111", "C112", "C113", "C114", "C115"):
            with self.subTest(capability=key):
                self.reject(lambda reports: reports[CAPABILITIES]["capabilities"].pop(key))
                self.reject(lambda reports: reports[CAPABILITIES]["capabilities"][key].update(status="failed"))
                self.reject(lambda reports: reports[CAPABILITIES]["capabilities"][key].update(verified=[]))

    def test_playwright_report_fallback_from_artifact_dir(self):
        def mutate(reports):
            reports[ARTIFACT + "system-remediation-report.json"] = reports.pop(TENANT_E2E)
        result = self.run_gate(mutate)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
