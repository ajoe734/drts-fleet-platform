"""Contract for .github/workflows/tenant-binding-acceptance.yml.

SR-QA-WEBHOOK-001-FIX-TENANT-BINDING's required acceptance evidence
(full_appmodule_two_tenant_jwt_http_sql_candidate_evidence) can only be
produced by an environment that runs the real HTTP server against a real,
migrated PostgreSQL -- something no worker VM in this project is allowed to
start. This dedicated workflow is that environment. It is dispatched once per
candidate rather than run on every PR, so nothing in ci.yml/ci-integ.yml
exercises it; these tests are what would catch a change that silently drops
the immutable-candidate check, the zero-skip gate, or the always()-evidence
upload.

Most assertions are plain text/regex on purpose, matching
test_workflow_timeouts.py and check_test_coverage.py in this directory: this
file has no YAML-parsing dependency to keep intact. The run-status
computation is different: it is extracted from its `python3 - <<'PY_STATUS'`
heredoc and actually executed with crafted step outcomes/report fixtures,
because a prior review round found that regex-checking for the presence of
`steps.harness.outcome` in the script text does not catch the script
*ignoring* that value when computing `status`.
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
WORKFLOW = ROOT / ".github" / "workflows" / "tenant-binding-acceptance.yml"
TEST_PATH = (
    "tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/"
    "appmodule-tenant-binding.test.ts"
)
PARENT_CANDIDATE_SHA = "10123f6af00a5342f2634a01f4d9a0e7190c2173"


def _extract_heredoc(text: str, marker: str) -> str:
    """Pull the body of a `python3 - <<'MARKER' ... MARKER` block out of the
    workflow YAML and dedent it into runnable, standalone Python source."""
    match = re.search(
        r"<<'" + re.escape(marker) + r"'\n(.*?)\n[ \t]*" + re.escape(marker) + r"\n",
        text,
        re.DOTALL,
    )
    if not match:
        raise AssertionError(f"could not find {marker} heredoc in workflow")
    return textwrap.dedent(match.group(1))


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

    def test_has_a_push_trigger_scoped_to_this_branch_and_these_three_files(
        self,
    ) -> None:
        # workflow_dispatch cannot be dispatched until this file is
        # registered on the default branch; the push trigger is the actual
        # runnable acceptance path until that bootstrap lands, so it must
        # stay narrowly scoped rather than firing on every push.
        on_block = self.text.split("permissions:", 1)[0]
        self.assertIn("push:", on_block)
        push_block = on_block.split("push:", 1)[1]
        self.assertIn("claude2/sr-qa-webhook-001-acceptance-runner", push_block)
        self.assertIn(".github/workflows/tenant-binding-acceptance.yml", push_block)
        self.assertIn(
            "tools/ci/test_tenant_binding_acceptance_workflow.py", push_block
        )
        self.assertIn(
            "docs/04-uat/system-remediation-20260906/"
            "tenant-binding-acceptance-runner.md",
            push_block,
        )

    def test_candidate_sha_falls_back_to_the_locked_parent_on_push(self) -> None:
        # A push trigger has no workflow_dispatch input; every place that
        # reads the candidate SHA (checkout ref, concurrency group, artifact
        # name, and the CANDIDATE_SHA env var) must fall back to the locked
        # parent candidate instead of resolving to an empty string.
        fallback = (
            "github.event.inputs.candidate_sha || "
            f"'{PARENT_CANDIDATE_SHA}'"
        )
        self.assertEqual(
            self.text.count(fallback),
            4,
            "expected the candidate_sha fallback on: checkout ref, "
            "concurrency group, CANDIDATE_SHA env, and artifact name",
        )

    def test_records_the_triggering_workflow_sha_separately_from_candidate_sha(
        self,
    ) -> None:
        # A push-triggered run must not conflate "which commit changed the
        # workflow" (github.sha) with "which commit is being accepted"
        # (CANDIDATE_SHA, pinned to the locked parent candidate).
        self.assertIn("WORKFLOW_SHA: ${{ github.sha }}", self.text)
        status_block = self.text.split("Record run status", 1)[1][:4000]
        self.assertIn('"workflow_sha"', status_block)
        self.assertIn("WORKFLOW_SHA", status_block)

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
        self.assertIn(
            "ref: ${{ github.event.inputs.candidate_sha || '"
            + PARENT_CANDIDATE_SHA
            + "' }}",
            self.text,
        )

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
        step_text = preceding[step_start:] + upload_block[:600]
        self.assertIn("if: always()", step_text)
        self.assertIn(".artifacts/tenant-binding-acceptance/execution-log.txt", step_text)
        self.assertIn(".artifacts/tenant-binding-acceptance/test-report.json", step_text)
        self.assertIn(".artifacts/tenant-binding-acceptance/evidence-auth-http.json", step_text)
        self.assertIn(".artifacts/tenant-binding-acceptance/run-status.json", step_text)

    def test_prepares_evidence_directory_before_install_and_migrate(self) -> None:
        # Evidence must exist even when `pnpm install` or `pnpm db:migrate`
        # fails, so the directory has to be created before those steps run,
        # not only after they succeed.
        dir_index = self.text.index("Prepare evidence directory")
        install_index = self.text.index("pnpm install --frozen-lockfile")
        migrate_index = self.text.index("pnpm db:migrate")
        self.assertLess(dir_index, install_index)
        self.assertLess(dir_index, migrate_index)

    def test_records_an_always_run_status_that_never_fabricates_success(self) -> None:
        # A runner-owned status step must exist that runs unconditionally
        # (even if install/migrate/harness fail before it), names the
        # candidate, and derives status only from real step outcomes/report
        # presence rather than assuming success.
        status_block = self.text.split("Record run status", 1)[1][:4000]
        self.assertIn("if: always()", status_block)
        self.assertIn("steps.install.outcome", status_block)
        self.assertIn("steps.migrate.outcome", status_block)
        self.assertIn("steps.harness.outcome", status_block)
        self.assertIn("steps.gate.outcome", status_block)
        self.assertIn("CANDIDATE_SHA", status_block)
        self.assertIn("run-status.json", status_block)
        self.assertIn('"not_run"', status_block)
        self.assertIn('"failed"', status_block)
        self.assertIn('"passed"', status_block)

    def test_does_not_touch_the_locked_candidate_or_product_source(self) -> None:
        # This workflow only ever reads the candidate; it must not check
        # anything back in (no git add/commit/push of product paths).
        for token in ("git commit", "git push", "git add"):
            self.assertNotIn(token, self.text)


class RunStatusScriptBehaviorTests(unittest.TestCase):
    """Executes the embedded `Record run status` heredoc for real, in a
    scratch directory, instead of only checking for token presence.

    A prior review round found a real bug this way: the script computed
    `status = "passed"` from `gate_outcome == "success"` and report
    existence alone, never checking `harness_outcome`. Vitest's JSON
    reporter can write a report with `success: true` even when the harness
    process itself exits non-zero (e.g. an unhandled error surfacing after
    the tests finished), so a failed -- or even cancelled -- harness step
    could still be recorded as `"passed"`. Regex-checking that the script
    text merely *mentions* `steps.harness.outcome` did not catch this,
    because the script read the value into a variable it then ignored.
    """

    def setUp(self) -> None:
        self.assertTrue(WORKFLOW.exists(), f"missing {WORKFLOW}")
        self.script = _extract_heredoc(
            WORKFLOW.read_text(encoding="utf-8"), "PY_STATUS"
        )
        # Fail fast with a clear message if the extraction ever grabs an
        # empty/malformed block instead of silently passing every scenario.
        self.assertIn("status_path.write_text", self.script)

    def _run(
        self,
        *,
        install: str = "success",
        migrate: str = "success",
        harness: str = "success",
        gate: str = "success",
        report: dict | None = {"numTotalTests": 2, "numPassedTests": 2,
                                "numPendingTests": 0, "success": True},
    ) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            evidence_dir = Path(tmp) / ".artifacts" / "tenant-binding-acceptance"
            evidence_dir.mkdir(parents=True)
            if report is not None:
                (evidence_dir / "test-report.json").write_text(json.dumps(report))
            script_path = Path(tmp) / "run_status.py"
            script_path.write_text(self.script)
            env = dict(os.environ)
            env.update(
                {
                    "INSTALL_OUTCOME": install,
                    "MIGRATE_OUTCOME": migrate,
                    "HARNESS_OUTCOME": harness,
                    "GATE_OUTCOME": gate,
                    "CANDIDATE_SHA": PARENT_CANDIDATE_SHA,
                    "WORKFLOW_SHA": "f" * 40,
                }
            )
            result = subprocess.run(
                [sys.executable, str(script_path)],
                cwd=tmp,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(
                result.returncode, 0,
                f"run-status script itself failed: {result.stderr}",
            )
            status_path = evidence_dir / "run-status.json"
            self.assertTrue(status_path.exists(), "run-status.json was not written")
            return json.loads(status_path.read_text())

    def test_genuine_full_success_is_passed(self) -> None:
        status = self._run()
        self.assertEqual(status["status"], "passed")
        self.assertEqual(status["candidate_sha"], PARENT_CANDIDATE_SHA)
        self.assertEqual(status["workflow_sha"], "f" * 40)

    def test_successful_report_with_failed_harness_is_not_passed(self) -> None:
        # The exact false-pass regression: gate_outcome/report look clean but
        # the harness step itself failed (e.g. vitest exited non-zero after
        # writing a report with success: true).
        status = self._run(harness="failure")
        self.assertNotEqual(status["status"], "passed")
        self.assertEqual(status["status"], "failed")

    def test_successful_report_with_cancelled_harness_is_not_passed(self) -> None:
        status = self._run(harness="cancelled")
        self.assertNotEqual(status["status"], "passed")
        self.assertEqual(status["status"], "failed")

    def test_successful_report_but_gate_not_success_is_not_passed(self) -> None:
        status = self._run(gate="failure")
        self.assertNotEqual(status["status"], "passed")
        self.assertEqual(status["status"], "failed")

    def test_missing_report_is_not_passed_even_if_outcomes_say_success(self) -> None:
        status = self._run(report=None)
        self.assertNotEqual(status["status"], "passed")
        self.assertFalse(status["report_present"])

    def test_install_failure_is_not_run(self) -> None:
        status = self._run(
            install="failure", migrate="unknown", harness="unknown",
            gate="unknown", report=None,
        )
        self.assertEqual(status["status"], "not_run")

    def test_migrate_failure_is_not_run(self) -> None:
        status = self._run(
            migrate="failure", harness="unknown", gate="unknown", report=None,
        )
        self.assertEqual(status["status"], "not_run")


if __name__ == "__main__":
    unittest.main()
