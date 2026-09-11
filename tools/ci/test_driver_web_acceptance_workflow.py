"""Contract for .github/workflows/driver-web-acceptance.yml.

SR-DRIVER-WEB-ACCEPTANCE-RUNNER-20260911's required acceptance evidence
(driver_web_routes_and_sqlite_runtime, driver_native_export_import_boundaries)
can only be produced by an environment that runs a real `expo export`, a real
Chromium browser against the real static export, and a real (non-Hermes)
native bundle to grep — none of which this project's worker VM is allowed to
start. This dedicated workflow is that environment; it does not run on every
PR, so nothing in ci.yml/ci-integ.yml exercises it. These tests are what
would catch a change that silently drops the immutable-candidate check, the
zero-skip gate, or the always()-evidence upload in either of its two jobs.

Most assertions are plain text/regex on purpose, matching
test_host_acceptance_workflow.py in this directory: this file has no
YAML-parsing dependency to keep intact. The gate/run-status computations are
different: they are extracted from their `python3 - <<'PY_...'` heredocs and
actually executed against crafted fixtures, because regex-checking for the
presence of an outcome variable in the script text does not catch the script
*ignoring* that value when computing status. Every extracted heredoc must be
literal, self-contained Python with no `${{ }}` GitHub Actions expression
left un-substituted in it — such a placeholder would be a real bug (a syntax
error at actual run time), not just a style nit, and
test_no_unsubstituted_github_expression_survives_into_any_extracted_heredoc
below exists specifically to catch that class of mistake before it reaches
GitHub Actions.
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
WORKFLOW = ROOT / ".github" / "workflows" / "driver-web-acceptance.yml"


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


def _all_heredocs(text: str) -> list[str]:
    return [
        textwrap.dedent(match)
        for match in re.findall(r"<<'PY_[A-Z]+'\n(.*?)\n[ \t]*PY_[A-Z]+\n", text, re.DOTALL)
    ]


class DriverWebAcceptanceWorkflowStructureTests(unittest.TestCase):
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
        self.assertIn("claude/sr-driver-web-acceptance-runner-20260911", push_block)
        self.assertIn(".github/workflows/driver-web-acceptance.yml", push_block)
        self.assertIn("tools/ci/test_driver_web_acceptance_workflow.py", push_block)
        self.assertIn(
            "tests/e2e/system-remediation/sr-driver-web-001/**", push_block
        )
        self.assertIn(
            "docs/04-uat/system-remediation-20260906/driver-web-acceptance-runner.md",
            push_block,
        )

    def test_candidate_sha_falls_back_to_github_sha_everywhere_it_is_used(self) -> None:
        fallback = "github.event.inputs.candidate_sha || github.sha"
        count = self.text.count(fallback)
        # one shared workflow-level concurrency group, plus CANDIDATE_SHA
        # env, checkout ref, and artifact name in both jobs = 1 + 3*2 = 7.
        self.assertGreaterEqual(
            count,
            7,
            "expected the candidate_sha||github.sha fallback on the "
            "concurrency group, CANDIDATE_SHA env, checkout ref, and "
            "artifact name in both jobs",
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

    def test_web_job_exports_web_serves_it_and_runs_the_real_browser_spec(self) -> None:
        self.assertIn("expo export -p web", self.text)
        self.assertIn("playwright install --with-deps chromium", self.text)
        self.assertIn("driver-web-static-server.ts", self.text)
        self.assertIn(
            "tests/e2e/system-remediation/sr-driver-web-001/driver-web-browser-acceptance.spec.ts",
            self.text,
        )
        self.assertIn("playwright.system-remediation.config.ts", self.text)

    def test_web_job_points_at_an_unreachable_placeholder_api_not_the_real_backend(self) -> None:
        self.assertIn("EXPO_PUBLIC_API_URL: http://127.0.0.1:1", self.text)

    def test_web_job_gates_on_zero_provider_google_leaks_into_the_web_bundle(self) -> None:
        self.assertIn("PROVIDER_GOOGLE", self.text)
        self.assertIn("leaked into the web bundle", self.text)

    def test_web_job_starts_and_stops_the_static_server_around_the_harness(self) -> None:
        stop_step_marker = "- name: Stop static server"
        self.assertIn(stop_step_marker, self.text)
        after_marker = self.text.split(stop_step_marker, 1)[1]
        run_marker_pos = after_marker.index("run:")
        self.assertIn("if: always()", after_marker[:run_marker_pos])

    def test_native_job_exports_both_platforms_without_bytecode(self) -> None:
        self.assertIn("expo export --platform ios,android --no-bytecode", self.text)

    def test_native_job_gates_on_native_map_present_and_web_marker_absent(self) -> None:
        self.assertIn("has_native_map_provider", self.text)
        self.assertIn("leaks_web_only_fallback_marker", self.text)
        self.assertIn("畫面保留地址與 fallback 指引", self.text)

    def test_every_gate_and_evidence_upload_step_runs_unconditionally(self) -> None:
        for marker in [
            "Record run status",
            "Upload execution log, Playwright report, screenshots, evidence, and run status",
            "Upload execution log, evidence, and run status",
        ]:
            self.assertIn(marker, self.text)
            segment = self.text.split(marker, 1)[1][:400]
            self.assertIn("if: always()", segment)

    def test_native_job_gate_step_runs_unconditionally(self) -> None:
        marker = "Verify native bundles use the real native map and exclude the web-only fallback module"
        self.assertIn(marker, self.text)
        segment = self.text.split(marker, 1)[1][:200]
        self.assertIn("if: always()", segment)

    def test_evidence_upload_never_hard_fails_on_a_missing_file(self) -> None:
        self.assertEqual(self.text.count("if-no-files-found: warn"), 2)

    def test_no_vm_restricted_commands_appear_in_this_workflow(self) -> None:
        self.assertNotIn("docker compose", self.text)
        self.assertNotIn("docker-compose", self.text)

    def test_no_unsubstituted_github_expression_survives_into_any_extracted_heredoc(self) -> None:
        for heredoc in _all_heredocs(self.text):
            self.assertNotIn(
                "${{",
                heredoc,
                "a GitHub Actions expression was left inside a python heredoc "
                "instead of being hardcoded/read from os.environ; it would "
                "reach the interpreter as literal, invalid Python syntax",
            )


class DriverWebAcceptanceWebGateLogicTests(unittest.TestCase):
    """Executes the web job's PY_GATE / PY_STATUS heredocs against crafted
    fixtures, rather than just regex-checking for variable names."""

    def setUp(self) -> None:
        self.text = WORKFLOW.read_text(encoding="utf-8")
        run_status_markers = [m.start() for m in re.finditer("Record run status", self.text)]
        self.assertEqual(len(run_status_markers), 2)
        gate_markers = [
            m.start() for m in re.finditer(r"Gate on zero skips and every test passed", self.text)
        ]
        self.assertEqual(len(gate_markers), 1)

        self.playwright_gate_script = _extract_step_run_block(
            self.text, "Gate on zero skips and every test passed", "PY_GATE"
        )
        self.web_status_script = _extract_step_run_block(
            self.text[: run_status_markers[1]], "Record run status", "PY_STATUS"
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
            [sys.executable, "-c", self.playwright_gate_script],
            cwd=tmp_path,
            capture_output=True,
            text=True,
        )

    def test_gate_fails_when_report_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(Path(tmp), None)
            self.assertNotEqual(result.returncode, 0)

    def test_gate_fails_on_any_skipped_test(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(
                Path(tmp), self._playwright_report(["passed", "passed", "skipped"])
            )
            self.assertNotEqual(result.returncode, 0)

    def test_gate_passes_when_every_spec_passed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(Path(tmp), self._playwright_report(["passed"] * 3))
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def _run_status(self, tmp_path: Path, env: dict, report_exists: bool) -> dict:
        (tmp_path / "test-results").mkdir(parents=True)
        status_dir = tmp_path / ".artifacts" / "driver-web-acceptance" / "web"
        status_dir.mkdir(parents=True)
        if report_exists:
            (tmp_path / "test-results" / "system-remediation-report.json").write_text("{}")
        full_env = {
            "CANDIDATE_SHA": "a" * 40,
            "WORKFLOW_SHA": "b" * 40,
            "INSTALL_OUTCOME": "success",
            "PLAYWRIGHT_INSTALL_OUTCOME": "success",
            "EXPORT_WEB_OUTCOME": "success",
            "WEB_BUNDLE_BOUNDARY_OUTCOME": "success",
            "START_SERVER_OUTCOME": "success",
            "HARNESS_OUTCOME": "success",
            "GATE_OUTCOME": "success",
            **env,
        }
        subprocess.run(
            [sys.executable, "-c", self.web_status_script],
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

    def test_status_is_not_run_when_the_web_export_itself_failed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(
                Path(tmp), {"EXPORT_WEB_OUTCOME": "failure"}, report_exists=False
            )
            self.assertEqual(status["status"], "not_run")

    def test_status_is_failed_when_the_bundle_boundary_check_fails_despite_a_stale_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(
                Path(tmp),
                {"WEB_BUNDLE_BOUNDARY_OUTCOME": "failure"},
                report_exists=True,
            )
            self.assertEqual(status["status"], "failed")

    def test_status_is_failed_when_harness_failed_despite_a_stale_report_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(
                Path(tmp),
                {"HARNESS_OUTCOME": "failure", "GATE_OUTCOME": "failure"},
                report_exists=True,
            )
            self.assertEqual(status["status"], "failed")


class DriverWebAcceptanceNativeGateLogicTests(unittest.TestCase):
    """Executes the native job's import-boundary gate and run-status heredocs
    against crafted export-tree fixtures."""

    def setUp(self) -> None:
        self.text = WORKFLOW.read_text(encoding="utf-8")
        native_job_text = self.text.split("native-export-acceptance:", 1)[1]
        self.gate_script = _extract_step_run_block(
            native_job_text,
            "Verify native bundles use the real native map and exclude the web-only fallback module",
            "PY_GATE",
        )
        self.status_script = _extract_step_run_block(
            native_job_text, "Record run status", "PY_STATUS"
        )

    def _write_bundle(self, dist_dir: Path, platform: str, content: str) -> None:
        platform_dir = dist_dir / "_expo" / "static" / "js" / platform
        platform_dir.mkdir(parents=True, exist_ok=True)
        (platform_dir / "AppEntry-abc123.js").write_text(content, encoding="utf-8")

    def _run_gate(self, tmp_path: Path, dist_dir: Path | None) -> subprocess.CompletedProcess:
        env = {
            "DIST_DIR": str(dist_dir) if dist_dir else "apps/driver-app/dist-native",
            "WEB_ONLY_MARKER": "畫面保留地址與 fallback 指引",
        }
        return subprocess.run(
            [sys.executable, "-c", self.gate_script],
            cwd=tmp_path,
            env=env,
            capture_output=True,
            text=True,
        )

    def test_gate_fails_when_export_output_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self._run_gate(Path(tmp), Path(tmp) / "dist-native")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("export output not found", result.stdout + result.stderr)

    def test_gate_fails_when_a_platform_bundle_is_missing_the_native_map(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist_dir = Path(tmp) / "dist-native"
            self._write_bundle(dist_dir, "ios", "const x = 1; // no map here")
            self._write_bundle(dist_dir, "android", "PROVIDER_GOOGLE")
            result = self._run_gate(Path(tmp), dist_dir)
            self.assertNotEqual(result.returncode, 0)

    def test_gate_fails_when_a_platform_bundle_leaks_the_web_only_fallback_marker(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist_dir = Path(tmp) / "dist-native"
            leaking = "PROVIDER_GOOGLE\n畫面保留地址與 fallback 指引"
            self._write_bundle(dist_dir, "ios", leaking)
            self._write_bundle(dist_dir, "android", "PROVIDER_GOOGLE")
            result = self._run_gate(Path(tmp), dist_dir)
            self.assertNotEqual(result.returncode, 0)

    def test_gate_passes_when_both_platforms_use_the_real_native_map_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist_dir = Path(tmp) / "dist-native"
            self._write_bundle(dist_dir, "ios", "PROVIDER_GOOGLE")
            self._write_bundle(dist_dir, "android", "PROVIDER_GOOGLE")
            result = self._run_gate(Path(tmp), dist_dir)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            evidence = json.loads(
                (Path(tmp) / ".artifacts/driver-web-acceptance/native/evidence-native-import-boundaries.json").read_text()
            )
            self.assertTrue(evidence["ios"]["has_native_map_provider"])
            self.assertTrue(evidence["android"]["has_native_map_provider"])
            self.assertFalse(evidence["ios"]["leaks_web_only_fallback_marker"])
            self.assertFalse(evidence["android"]["leaks_web_only_fallback_marker"])

    def _run_status(self, tmp_path: Path, env: dict, evidence_exists: bool) -> dict:
        evidence_dir = tmp_path / ".artifacts" / "driver-web-acceptance" / "native"
        evidence_dir.mkdir(parents=True)
        if evidence_exists:
            (evidence_dir / "evidence-native-import-boundaries.json").write_text("{}")
        full_env = {
            "CANDIDATE_SHA": "a" * 40,
            "WORKFLOW_SHA": "b" * 40,
            "INSTALL_OUTCOME": "success",
            "EXPORT_NATIVE_OUTCOME": "success",
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
        return json.loads((evidence_dir / "run-status.json").read_text())

    def test_status_is_passed_only_when_export_and_gate_both_succeeded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(Path(tmp), {}, evidence_exists=True)
            self.assertEqual(status["status"], "passed")

    def test_status_is_not_run_when_export_itself_failed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(
                Path(tmp), {"EXPORT_NATIVE_OUTCOME": "failure"}, evidence_exists=False
            )
            self.assertEqual(status["status"], "not_run")

    def test_status_is_failed_when_gate_failed_despite_a_stale_evidence_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = self._run_status(
                Path(tmp), {"GATE_OUTCOME": "failure"}, evidence_exists=True
            )
            self.assertEqual(status["status"], "failed")


if __name__ == "__main__":
    unittest.main()
