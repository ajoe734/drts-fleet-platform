"""Contract for .github/workflows/host-acceptance.yml.

SR-HOST-FE-001-ACCEPTANCE-RUNNER's required acceptance evidence
(host_actual_http_sql_owner_scope, host_actual_browser_switching_states) can
only be produced by an environment that runs a real HTTP server against a
real, migrated PostgreSQL and a real Chromium browser against a real, built
Next.js server — none of which this project's worker VM is allowed to start.
This dedicated workflow is that environment; it does not run on every PR, so
nothing in ci.yml/ci-integ.yml exercises it. These tests are what would
catch a change that silently drops the immutable-candidate check, the
zero-skip gate, or the always()-evidence upload in either of its two jobs.

Most assertions are plain text/regex on purpose, matching
test_tenant_binding_acceptance_workflow.py in this directory: this file has
no YAML-parsing dependency to keep intact. The gate/run-status computations
are different: they are extracted from their `python3 - <<'PY_...'` heredocs
and actually executed against crafted fixtures, because regex-checking for
the presence of an outcome variable in the script text does not catch the
script *ignoring* that value when computing status.
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
WORKFLOW = ROOT / ".github" / "workflows" / "host-acceptance.yml"


def _extract_step_run_block(text: str, step_name_marker: str, heredoc_marker: str) -> str:
    """Pull the body of the `python3 - <<'MARKER' ... MARKER` heredoc that
    follows the given step-name marker, dedented into standalone Python
    source."""
    tail = text.split(step_name_marker, 1)[1]
    pattern = re.compile(
        r"<<'" + re.escape(heredoc_marker) + r"'\n(.*?)\n[ \t]*" + re.escape(heredoc_marker) + r"\n",
        re.DOTALL,
    )
    match = pattern.search(tail)
    if not match:
        raise AssertionError(
            f"could not find {heredoc_marker} heredoc after step {step_name_marker!r}"
        )
    return textwrap.dedent(match.group(1))


class HostAcceptanceWorkflowStructureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(WORKFLOW.exists(), f"missing {WORKFLOW}")
        self.text = WORKFLOW.read_text(encoding="utf-8")

    def test_is_manually_dispatchable_with_an_optional_candidate_sha_input(self) -> None:
        self.assertIn("workflow_dispatch:", self.text)
        self.assertIn("candidate_sha:", self.text)

    def test_has_a_push_trigger_scoped_to_this_branch_and_these_owned_paths(self) -> None:
        on_block = self.text.split("permissions:", 1)[0]
        self.assertIn("push:", on_block)
        push_block = on_block.split("push:", 1)[1]
        self.assertIn("claude2/sr-host-fe-001-acceptance-runner", push_block)
        self.assertIn("claude/sr-host-fe-001-acceptance-runner", push_block)
        self.assertIn(".github/workflows/host-acceptance.yml", push_block)
        self.assertIn("tools/ci/test_host_acceptance_workflow.py", push_block)
        self.assertIn(
            "tests/e2e/system-remediation/sr-host-fe-001/**", push_block
        )
        self.assertIn(
            "docs/04-uat/system-remediation-20260906/host-acceptance-runner.md",
            push_block,
        )

    def test_candidate_sha_falls_back_to_github_sha_everywhere_it_is_used(self) -> None:
        fallback = "github.event.inputs.candidate_sha || github.sha"
        count = self.text.count(fallback)
        # concurrency group, and CANDIDATE_SHA env in both jobs, and
        # checkout ref in both jobs = at least 6 occurrences.
        self.assertGreaterEqual(
            count,
            6,
            "expected the candidate_sha||github.sha fallback on concurrency "
            "group, CANDIDATE_SHA env, and checkout ref in both jobs",
        )

    def test_both_jobs_validate_candidate_sha_is_a_full_lowercase_hex_sha(self) -> None:
        self.assertEqual(
            self.text.count("candidate_sha must be a full 40-character commit SHA"),
            2,
            "expected the candidate_sha regex validation step in both jobs",
        )

    def test_both_jobs_verify_checkout_resolved_the_exact_candidate(self) -> None:
        self.assertEqual(
            self.text.count("Verify checkout resolved the exact immutable candidate"),
            2,
        )
        self.assertEqual(
            self.text.count("does not match the requested candidate"),
            2,
        )

    def test_both_jobs_run_a_dedicated_postgis_postgres_service(self) -> None:
        self.assertEqual(self.text.count("image: postgis/postgis:16-3.4"), 2)
        self.assertEqual(
            self.text.count(
                "postgresql://postgres:postgres@localhost:5432/drts_fleet_platform"
            ),
            # api-sql-acceptance: env DATABASE_URL + harness step env; browser: env DATABASE_URL
            3,
        )

    def test_both_jobs_apply_migrations_before_running_their_harness(self) -> None:
        self.assertEqual(self.text.count("pnpm db:migrate"), 2)

    def test_api_job_runs_the_real_http_sql_test_file(self) -> None:
        self.assertIn(
            "tests/e2e/system-remediation/sr-host-fe-001/host-api-sql-acceptance.test.ts",
            self.text,
        )
        self.assertIn("--no-file-parallelism --maxConcurrency=1", self.text)

    def test_browser_job_installs_chromium_builds_the_portal_and_runs_the_browser_spec(self) -> None:
        self.assertIn("playwright install --with-deps chromium", self.text)
        self.assertIn("pnpm --filter @drts/fleet-partner-portal-web build", self.text)
        self.assertIn(
            "tests/e2e/system-remediation/sr-host-fe-001/host-browser-acceptance.spec.ts",
            self.text,
        )
        self.assertIn("playwright.system-remediation.config.ts", self.text)

    def test_browser_job_starts_both_servers_before_the_harness_and_stops_them_after(self) -> None:
        self.assertIn("host-acceptance-server.ts", self.text)
        self.assertIn("next start --port 3007", self.text)
        stop_step_marker = "- name: Stop background servers"
        self.assertIn(stop_step_marker, self.text)
        # The stop step must run even if the harness step failed: `if:
        # always()` must appear between the step name and its `run:` block.
        after_marker = self.text.split(stop_step_marker, 1)[1]
        run_marker_pos = after_marker.index("run:")
        self.assertIn("if: always()", after_marker[:run_marker_pos])

    def test_every_gate_and_evidence_upload_step_runs_unconditionally(self) -> None:
        for marker in [
            "Gate on zero skips and every test passed",
            "Record run status",
            "Upload execution log, test report, evidence, and run status",
            "Upload execution log, Playwright report, screenshots, evidence, and run status",
        ]:
            self.assertIn(marker, self.text)
            segment = self.text.split(marker, 1)[1][:400]
            self.assertIn("if: always()", segment)

    def test_evidence_upload_never_hard_fails_on_a_missing_file(self) -> None:
        self.assertEqual(self.text.count("if-no-files-found: warn"), 2)

    def test_no_vm_restricted_commands_appear_in_this_workflow(self) -> None:
        # This workflow only ever runs on GitHub-hosted runners, but keep it
        # honest about never encoding a docker-compose-based local dev flow.
        self.assertNotIn("docker compose", self.text)
        self.assertNotIn("docker-compose", self.text)


class HostAcceptanceApiGateLogicTests(unittest.TestCase):
    """Actually executes the api-sql-acceptance job's PY_GATE / PY_STATUS
    heredocs against crafted fixtures, rather than just regex-checking for
    the presence of variable names in the script text."""

    def setUp(self) -> None:
        self.text = WORKFLOW.read_text(encoding="utf-8")
        self.gate_script = _extract_step_run_block(
            self.text, "Gate on zero skips and every test passed", "PY_GATE"
        )
        self.status_script = _extract_step_run_block(
            self.text, "Record run status", "PY_STATUS"
        )

    def _run_gate(self, tmp_path: Path, report: dict | None) -> subprocess.CompletedProcess:
        report_dir = tmp_path / ".artifacts" / "host-acceptance" / "api"
        report_dir.mkdir(parents=True)
        if report is not None:
            (report_dir / "test-report.json").write_text(json.dumps(report))
        return subprocess.run(
            [sys.executable, "-c", self.gate_script],
            cwd=tmp_path,
            capture_output=True,
            text=True,
        )

    def test_gate_fails_when_report_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(Path(tmp), None)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("no test report was produced", result.stdout + result.stderr)

    def test_gate_fails_on_any_pending_or_skipped_test(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(
                Path(tmp),
                {
                    "numTotalTests": 5,
                    "numPassedTests": 4,
                    "numPendingTests": 1,
                    "success": True,
                },
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("incomplete", result.stdout + result.stderr)

    def test_gate_fails_when_success_flag_is_false_even_if_counts_look_clean(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(
                Path(tmp),
                {
                    "numTotalTests": 5,
                    "numPassedTests": 5,
                    "numPendingTests": 0,
                    "success": False,
                },
            )
            self.assertNotEqual(result.returncode, 0)

    def test_gate_passes_on_a_fully_green_zero_skip_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(
                Path(tmp),
                {
                    "numTotalTests": 20,
                    "numPassedTests": 20,
                    "numPendingTests": 0,
                    "success": True,
                },
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def _run_status(self, tmp_path: Path, env: dict, report_exists: bool) -> dict:
        report_dir = tmp_path / ".artifacts" / "host-acceptance" / "api"
        report_dir.mkdir(parents=True)
        if report_exists:
            (report_dir / "test-report.json").write_text("{}")
        full_env = {
            "CANDIDATE_SHA": "a" * 40,
            "WORKFLOW_SHA": "b" * 40,
            "INSTALL_OUTCOME": "success",
            "MIGRATE_OUTCOME": "success",
            "HARNESS_OUTCOME": "success",
            "GATE_OUTCOME": "success",
            **env,
        }
        subprocess.run(
            [sys.executable, "-c", self.status_script],
            cwd=tmp_path,
            env=full_env,
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads((report_dir / "run-status.json").read_text())

    def test_status_is_passed_only_when_every_outcome_succeeded_and_report_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(Path(tmp), {}, report_exists=True)
            self.assertEqual(status["status"], "passed")

    def test_status_is_not_run_when_install_or_migrate_failed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(
                Path(tmp), {"MIGRATE_OUTCOME": "failure"}, report_exists=False
            )
            self.assertEqual(status["status"], "not_run")

    def test_status_is_failed_when_harness_outcome_is_not_success_despite_report_present(self) -> None:
        # A prior review-round-shaped regression: the harness process itself
        # crashed after vitest wrote a report, so steps.harness.outcome is
        # "failure" even though a report file exists. Deriving "passed" from
        # gate_outcome/report alone would wrongly mark this run as passed.
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(
                Path(tmp),
                {"HARNESS_OUTCOME": "failure", "GATE_OUTCOME": "success"},
                report_exists=True,
            )
            self.assertEqual(status["status"], "failed")


class HostAcceptanceBrowserGateLogicTests(unittest.TestCase):
    """Executes the browser-acceptance job's PY_GATE / PY_STATUS heredocs
    against crafted Playwright JSON report fixtures."""

    def setUp(self) -> None:
        self.text = WORKFLOW.read_text(encoding="utf-8")
        run_status_markers = [m.start() for m in re.finditer("Record run status", self.text)]
        self.assertEqual(len(run_status_markers), 2)
        gate_markers = [
            m.start()
            for m in re.finditer("Gate on zero skips and every test passed", self.text)
        ]
        self.assertEqual(len(gate_markers), 2)

        # The second occurrence of each marker belongs to the browser job.
        browser_gate_text = self.text[gate_markers[1] :]
        browser_status_text = self.text[run_status_markers[1] :]
        self.gate_script = _extract_step_run_block(
            browser_gate_text, "Gate on zero skips and every test passed", "PY_GATE"
        )
        self.status_script = _extract_step_run_block(
            browser_status_text, "Record run status", "PY_STATUS"
        )

    def _playwright_report(self, statuses: list[str]) -> dict:
        return {
            "suites": [
                {
                    "specs": [
                        {"tests": [{"results": [{"status": status}]}]}
                        for status in statuses
                    ],
                    "suites": [],
                }
            ]
        }

    def _run_gate(self, tmp_path: Path, report: dict | None) -> subprocess.CompletedProcess:
        results_dir = tmp_path / "test-results"
        results_dir.mkdir(parents=True)
        if report is not None:
            (results_dir / "system-remediation-report.json").write_text(json.dumps(report))
        return subprocess.run(
            [sys.executable, "-c", self.gate_script],
            cwd=tmp_path,
            capture_output=True,
            text=True,
        )

    def test_gate_fails_when_report_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(Path(tmp), None)
            self.assertNotEqual(result.returncode, 0)

    def test_gate_fails_when_zero_specs_present(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(Path(tmp), {"suites": []})
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("zero specs", result.stdout + result.stderr)

    def test_gate_fails_on_any_skipped_test(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(
                Path(tmp), self._playwright_report(["passed", "passed", "skipped"])
            )
            self.assertNotEqual(result.returncode, 0)

    def test_gate_passes_when_every_spec_passed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(
                Path(tmp), self._playwright_report(["passed"] * 9)
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def _run_status(self, tmp_path: Path, env: dict, report_exists: bool) -> dict:
        results_dir = tmp_path / "test-results"
        results_dir.mkdir(parents=True)
        status_dir = tmp_path / ".artifacts" / "host-acceptance" / "browser"
        status_dir.mkdir(parents=True)
        if report_exists:
            (results_dir / "system-remediation-report.json").write_text("{}")
        full_env = {
            "CANDIDATE_SHA": "a" * 40,
            "WORKFLOW_SHA": "b" * 40,
            "INSTALL_OUTCOME": "success",
            "PLAYWRIGHT_INSTALL_OUTCOME": "success",
            "BUILD_PACKAGES_OUTCOME": "success",
            "BUILD_PORTAL_OUTCOME": "success",
            "MIGRATE_OUTCOME": "success",
            "START_API_OUTCOME": "success",
            "START_PORTAL_OUTCOME": "success",
            "HARNESS_OUTCOME": "success",
            "GATE_OUTCOME": "success",
            **env,
        }
        subprocess.run(
            [sys.executable, "-c", self.status_script],
            cwd=tmp_path,
            env=full_env,
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads((status_dir / "run-status.json").read_text())

    def test_status_is_passed_only_when_every_setup_step_and_harness_and_gate_succeeded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(Path(tmp), {}, report_exists=True)
            self.assertEqual(status["status"], "passed")

    def test_status_is_not_run_when_a_server_never_started(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(
                Path(tmp), {"START_PORTAL_OUTCOME": "failure"}, report_exists=False
            )
            self.assertEqual(status["status"], "not_run")

    def test_status_is_failed_when_harness_failed_despite_a_stale_report_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(
                Path(tmp),
                {"HARNESS_OUTCOME": "failure", "GATE_OUTCOME": "failure"},
                report_exists=True,
            )
            self.assertEqual(status["status"], "failed")


if __name__ == "__main__":
    unittest.main()
